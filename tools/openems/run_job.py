#!/usr/bin/env python3
"""
Run a full-wave job exported by the app (Stage 3, docs/zukunft/STUFE-3-VOLLWELLE.md) with
openEMS and write the result file the app loads (<job>.fullwave.bin).

    python tools/openems/run_job.py board.openems-job.json [--res 0.8] [--sources id1,id2]

Per source: one FDTD run with its port(s) excited by a Gaussian pulse, H dumped in the
frequency domain over the app's sampling grid, far field from a near-field box. The field is
divided by the port current at each frequency, so the app can multiply with the current
spectrum of its own source model (and the result stays valid when the spectrum changes).

Job coordinates (mm): X = KiCad x - ox, Y = -(KiCad y - oy), Z = height above F.Cu.
"""
import argparse
import json
import os
import shutil
import struct
import sys
import time

import h5py
import numpy as np
from CSXCAD import ContinuousStructure
from CSXCAD.SmoothMeshLines import SmoothMeshLines
from openEMS import openEMS
from openEMS.physical_constants import EPS0

RESULT_KIND = 'pcb-field-fullwave-result'
MAGIC = b'PCBFW1\0\0'
NO_VALUE = -32768


def log(*a):
    print(*a, flush=True)


# --- mesh ----------------------------------------------------------------------------------------

def uniform(a, b, step):
    n = max(1, int(np.ceil((b - a) / step)))
    return list(np.linspace(a, b, n + 1))


def merge(fixed, filler, gap):
    """Fixed lines plus filler lines that keep at least `gap` from every fixed line."""
    fixed = np.unique(np.round(fixed, 4))
    keep = [v for v in filler if fixed.size == 0 or np.min(np.abs(fixed - v)) >= gap]
    return np.unique(np.concatenate([fixed, np.round(keep, 4)]))


def mesh_lines(job, src, res):
    m = job['mesh']
    pts = np.array([p for p in job['outline']] or [[0, 0]])
    x0, y0 = pts.min(axis=0) - 1
    x1, y1 = pts.max(axis=0) + 1
    zs = sorted(l['z'] for l in job['layers'])
    # the dumps must lie inside the domain, away from the absorbing layer
    g = job['grid']
    gx = (g['x0'], g['x0'] + (g['nx'] - 1) * g['dx'])
    gy = (-(g['z0'] + (g['nz'] - 1) * g['dz']), -g['z0'])
    gz = (g['y0'], g['y0'] + (g['ny'] - 1) * g['dy'])
    air = m['airXY']
    # ports, lumped parts and straps need lines at both ends, or they collapse onto one line
    fx, fy = [], []
    for e in src['ports'] + src['lumped'] + src['shorts'] + job.get('caps', []):
        fx += [e['start'][0], e['stop'][0]]
        fy += [e['start'][1], e['stop'][1]]
    # barrels that pass planes of other nets sit on a mesh node, so a small antipad isolates them
    bx = [b['x'] for b in job['barrels'] if b.get('isolate')]
    by = [b['y'] for b in job['barrels'] if b.get('isolate')]
    X = merge(merge(fx, bx, res / 3), uniform(x0, x1, res), res / 3)
    Y = merge(merge(fy, by, res / 3), uniform(y0, y1, res), res / 3)
    X = list(X) + [min(x0, gx[0]) - air, max(x1, gx[1]) + air]
    Y = list(Y) + [min(y0, gy[0]) - air, max(y1, gy[1]) + air]
    # copper sheets sit on mesh lines; at least two cells across every dielectric
    Z = list(zs)
    for a, b in zip(zs[:-1], zs[1:]):
        Z += uniform(a, b, min(res, (b - a) / 2))[1:-1]
    Z += [min(zs[0], gz[0]) - m['airBelow'], max(zs[-1], gz[1]) + m['airAbove']]
    smooth = lambda L: SmoothMeshLines(sorted(set(np.round(L, 4))), m['maxRes'], 1.4)
    return smooth(X), smooth(Y), smooth(Z)


# --- model ---------------------------------------------------------------------------------------

def build(job, src, res, fmax, sim_path):
    fd = openEMS(NrTS=int(job['maxSteps']), EndCriteria=10 ** (job['endCriteriaDb'] / 10))
    # derivative of a Gaussian: no DC part. A plain Gaussian from 0 Hz drives a lasting current
    # through every closed loop of ideal metal (planes, vias, straps), so the field energy
    # never decays and the run cannot stop. Spectrum ∝ f·exp(-(π f τ)²), peak at fe/2.78 and
    # -20 dB at fe = 1.5·fmax, so the top frequency is not at the edge; about -24 dB at 20 MHz
    # for 1 GHz (fine: results are per ampere of port current).
    fp = 1.5 * fmax / 2.78
    tau = 1 / (np.pi * fp * np.sqrt(2))
    t0 = 4 * tau
    fd.SetCustomExcite(f'-(t-{t0:.6e})/{tau:.6e}*exp(-((t-{t0:.6e})/{tau:.6e})^2)', 1.5 * fmax, 1.5 * fmax)
    fd.SetBoundaryCond(['PML_8'] * 6)
    csx = ContinuousStructure()
    fd.SetCSX(csx)
    grid = csx.GetGrid()
    grid.SetDeltaUnit(1e-3)
    X, Y, Z = mesh_lines(job, src, res)
    grid.SetLines('x', X)
    grid.SetLines('y', Y)
    grid.SetLines('z', Z)

    # dielectrics between the copper sheets (copper thickness is far below the mesh)
    outline = np.array(job['outline']).T
    zs = sorted((l['z'] for l in job['layers']), reverse=True)
    f_ref = fmax / 2
    for i, (top, bottom) in enumerate(zip(zs[:-1], zs[1:])):
        d = job['dielectrics'][min(i, len(job['dielectrics']) - 1)]
        kappa = 2 * np.pi * f_ref * EPS0 * d['epsR'] * d['tanD']
        mat = csx.AddMaterial(f'diel{i}', epsilon=d['epsR'], kappa=kappa)
        mat.AddLinPoly(outline, 'z', bottom, top - bottom, priority=1)

    # priorities: other nets' copper 10 < isolation 15 < the source's own copper 20. At cells of
    # 0.5–1 mm, clearances of 0.2 mm vanish: neighbouring pads, pours and planes would touch the
    # source's nets. A ring of at least half a cell around the source's tracks and pads, and a
    # cut around each barrel in planes of other nets, keeps them apart.
    OTHER, ISO, OWN = 10, 15, 20
    own = set(src.get('nets', []))
    gap = max(0.2, 0.55 * res)
    copper = csx.AddMetal('copper')
    copper_own = csx.AddMetal('copper_own')
    layer_z = [l['z'] for l in job['layers']]

    def eps_at(li):
        """Permittivity at a copper sheet: mean of the materials above and below."""
        n = len(job['layers'])
        above = 1.0 if li == 0 else job['dielectrics'][min(li - 1, len(job['dielectrics']) - 1)]['epsR']
        below = 1.0 if li == n - 1 else job['dielectrics'][min(li, len(job['dielectrics']) - 1)]['epsR']
        return (above + below) / 2

    cut = [csx.AddMaterial(f'clear{li}', epsilon=eps_at(li)) for li in range(len(layer_z))]

    def grown(pts, d):
        c = pts.mean(axis=0)
        v = pts - c
        n = np.linalg.norm(v, axis=1, keepdims=True)
        n[n == 0] = 1
        return pts + v / n * d * 1.414

    for c in job['copper']:
        li = c['layer']
        z = layer_z[li]
        for poly in c['polys']:
            pts = np.array(poly['pts'])
            if len(pts) < 3:
                continue
            mine = poly['net'] in own
            (copper_own if mine else copper).AddPolygon(pts.T, 'z', z, priority=OWN if mine else OTHER)
            if mine and poly['kind'] in ('pad', 'via'):
                cut[li].AddPolygon(grown(pts, gap).T, 'z', z, priority=ISO)
    for w in job.get('wires', []):
        li = w['layer']
        z = layer_z[li]
        if w['a'] == w['b']:
            continue
        mine = w['net'] in own
        (copper_own if mine else copper).AddCurve([[w['a'][0], w['b'][0]], [w['a'][1], w['b'][1]], [z, z]], priority=OWN if mine else OTHER)
        if mine:
            a, b = np.array(w['a']), np.array(w['b'])
            d = (b - a) / max(np.linalg.norm(b - a), 1e-9)
            nrm = np.array([-d[1], d[0]])
            h = w['width'] / 2 + gap
            rect = np.array([a - d * h + nrm * h, b + d * h + nrm * h, b + d * h - nrm * h, a - d * h - nrm * h])
            cut[li].AddPolygon(rect.T, 'z', z, priority=ISO)
    for b in job['barrels']:
        copper_own.AddCurve([[b['x'], b['x']], [b['y'], b['y']], [b['z0'], b['z1']]], priority=OWN)
        a = max(0.75 * res, b.get('r', 0.3) + 0.2)
        for li in b.get('isolate', []):
            z = layer_z[li]
            cut[li].AddBox([b['x'] - a, b['y'] - a, z], [b['x'] + a, b['y'] + a, z], priority=ISO)

    for k, s in enumerate(src['shorts']):
        copper_own.AddCurve([[s['start'][0], s['stop'][0]], [s['start'][1], s['stop'][1]], [s['start'][2], s['stop'][2]]], priority=OWN)
    # the board's capacitors as series R-L-C (ESR 20 mΩ, ESL 0.5 nH): they tie the planes
    # together like on the real board; a capacitor that is a strap of this hot loop stays a strap
    strapped = {frozenset(x['label'].split('-')) for x in src['shorts']}
    for k, c in enumerate(job.get('caps', [])):
        if frozenset(c['label'].split('-')) in strapped:
            continue
        el = csx.AddLumpedElement(f'cap{k}', ny=c['dir'], caps=True, R=c.get('esr', 0.02), L=c.get('esl', 0.5e-9), C=c['c'], LEtype=1)
        el.AddBox(c['start'], c['stop'], priority=17)

    # ports and lumped parts above the isolation (it would clear their edges between two pads)
    # and below the source copper (inside the pads the metal wins, the element sits in the gap)
    for k, l in enumerate(src['lumped']):
        kw = {}
        if l.get('r') is not None:
            kw['R'] = l['r']
        if l.get('c') is not None:
            kw['C'] = l['c']
            # a parallel bleeder so a charged load does not keep energy forever
            kw.setdefault('R', 10e3)
        el = csx.AddLumpedElement(f'lumped{k}', ny=l['dir'], caps=True, **kw)
        el.AddBox(l['start'], l['stop'], priority=17)
    ports = []
    for k, p in enumerate(src['ports']):
        start, stop = list(p['start']), list(p['stop'])
        ports.append(fd.AddLumpedPort(k + 1, p['r'], start, stop, p['dir'], excite=p['excite'], priority=17))

    g = job['grid']
    box0 = [g['x0'], -(g['z0'] + (g['nz'] - 1) * g['dz']), g['y0']]
    box1 = [g['x0'] + (g['nx'] - 1) * g['dx'], -g['z0'], g['y0'] + (g['ny'] - 1) * g['dy']]
    dump = csx.AddDump('Hf', dump_type=11, file_type=1, frequency=job['freqs'])
    dump.AddBox(box0, box1)
    nf2ff = fd.CreateNF2FFBox(frequency=job['freqs'])
    cells = len(X) * len(Y) * len(Z)
    return fd, ports, nf2ff, cells


# --- results -------------------------------------------------------------------------------------

def read_dump(path, freqs):
    """|H|² per frequency on the dump mesh (x, y, z), plus the mesh lines in mm."""
    with h5py.File(path, 'r') as f:
        mesh = [np.array(f['Mesh'][a]) for a in ('x', 'y', 'z')]
        # openEMS writes the dump mesh in metres; a board in mm spans more than one unit
        if max(np.ptp(m) for m in mesh) < 1:
            mesh = [m * 1e3 for m in mesh]
        fd = f['FieldData']['FD']
        out = []
        for k in range(len(freqs)):
            d = fd[f'f{k}']
            a = np.array(d)
            order = d.attrs.get('d_order', b'NXYZ')
            order = order.decode() if isinstance(order, bytes) else str(order)
            h2 = (np.abs(a) ** 2).sum(axis=0)
            if order == 'NZYX':
                h2 = np.transpose(h2, (2, 1, 0))
            out.append(h2)
    return mesh, out


def interp_axis(lines, v):
    i = np.clip(np.searchsorted(lines, v) - 1, 0, len(lines) - 2)
    t = np.clip((v - lines[i]) / (lines[i + 1] - lines[i]), 0, 1)
    return i, t


def to_app_grid(mesh, h2, g):
    """Trilinear resampling onto the app grid; index = ix + nx·(iy + ny·iz) (world y = height)."""
    xs = g['x0'] + np.arange(g['nx']) * g['dx']
    hs = g['y0'] + np.arange(g['ny']) * g['dy']
    zs = g['z0'] + np.arange(g['nz']) * g['dz']
    ix, tx = interp_axis(mesh[0], xs)
    iy, ty = interp_axis(mesh[1], -zs)  # job Y = -world z
    iz, tz = interp_axis(mesh[2], hs)  # job Z = world y
    out = np.zeros((g['nz'], g['ny'], g['nx']))
    for dx_, wx in ((0, 1 - tx), (1, tx)):
        for dy_, wy in ((0, 1 - ty), (1, ty)):
            for dz_, wz in ((0, 1 - tz), (1, tz)):
                v = h2[np.ix_(ix + dx_, iy + dy_, iz + dz_)]  # (nx, nz_world, ny_height)
                w = wx[:, None, None] * wy[None, :, None] * wz[None, None, :]
                out += np.transpose(v * w, (1, 2, 0))  # -> (world z, height, x)
    return out


def centi_db(a):
    with np.errstate(divide='ignore', invalid='ignore'):
        db = 10 * np.log10(a) * 100
    db[~np.isfinite(db)] = NO_VALUE
    return np.clip(np.round(db), -32767, 32767).astype('<i2')


def write_result(path, header, blocks):
    head = json.dumps(header).encode('utf-8')
    pad = (-len(head)) % 4
    with open(path, 'wb') as f:
        f.write(MAGIC)
        f.write(struct.pack('<I', len(head) + pad))
        f.write(head + b' ' * pad)
        for b in blocks:
            f.write(b.tobytes())


def main():
    ap = argparse.ArgumentParser(description='Run an app full-wave job with openEMS.')
    ap.add_argument('job')
    ap.add_argument('--res', type=float, help='cell size over the board, mm (default from the job)')
    ap.add_argument('--sources', help='comma-separated source ids (default: all)')
    ap.add_argument('--max-steps', type=int, help='upper limit of time steps per source')
    ap.add_argument('--threads', type=int, default=0)
    ap.add_argument('--keep', action='store_true', help='keep the openEMS run folders')
    a = ap.parse_args()

    job = json.load(open(a.job))
    if job.get('kind') != 'pcb-field-fullwave-job':
        sys.exit('not a full-wave job file')
    if a.max_steps:
        job['maxSteps'] = a.max_steps
    res = a.res or job['mesh']['res']
    freqs = job['freqs']
    fmax = max(freqs)
    base = os.path.splitext(os.path.abspath(a.job))[0]
    work = base + '.runs'
    os.makedirs(work, exist_ok=True)
    wanted = set(a.sources.split(',')) if a.sources else None
    sources = [s for s in job['sources'] if not wanted or s['id'] in wanted]

    g = job['grid']
    blocks = []
    meta = []
    t_all = time.time()
    for s in sources:
        log(f'== {s["name"]} ({s["id"]}): {len(s["ports"])} port(s), {len(s["lumped"])} lumped, {len(s["shorts"])} shorts')
        sim = os.path.join(work, s['id'])
        fd, ports, nf2ff, cells = build(job, s, res, fmax, sim)
        log(f'   mesh {cells / 1e6:.2f} M cells')
        t0 = time.time()
        fd.Run(sim, cleanup=True, verbose=0, numThreads=a.threads)
        secs = time.time() - t0
        for p in ports:
            p.CalcPort(sim, freqs)
        i_port = np.array(ports[0].if_tot)
        z_in = np.array(ports[0].uf_tot) / i_port
        mesh, h2 = read_dump(os.path.join(sim, 'Hf.h5'), freqs)
        theta = np.arange(0, 181, 5)
        phi = np.arange(0, 360, 10)
        ff = nf2ff.CalcNF2FF(sim, freqs, theta, phi, radius=3, center=[0, 0, 0])
        far = []
        for k, f in enumerate(freqs):
            per_amp = h2[k] / max(abs(i_port[k]) ** 2, 1e-30)
            blocks.append(centi_db(to_app_grid(mesh, per_amp, g)))
            # strongest direction at 3 m, ×2 for the reflection off a ground plane (as stage 1)
            far.append(float(2 * np.max(ff.E_norm[k]) / max(abs(i_port[k]), 1e-15)))
        meta.append({
            'id': s['id'], 'name': s['name'], 'seconds': round(secs, 1),
            'farE3mPerA': far,
            'zin': [[float(z.real), float(z.imag)] for z in z_in],
        })
        log(f'   {secs:.0f} s, |Zin| at {freqs[0] / 1e6:.0f} MHz = {abs(z_in[0]):.2f} Ω')
        if not a.keep:
            shutil.rmtree(sim, ignore_errors=True)

    header = {
        'kind': RESULT_KIND,
        'version': 1,
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'board': job['board'],
        'grid': g,
        'freqs': freqs,
        'sources': meta,
        'skipped': job.get('skipped', []),
        'solver': {'name': 'openEMS', 'res': res, 'seconds': round(time.time() - t_all, 1)},
        'encoding': 'int16 centi-dB of |H|^2 per A^2 ((A/m)^2/A^2), source-major then frequency',
    }
    out = base.replace('.openems-job', '') + '.fullwave.bin'
    write_result(out, header, blocks)
    log(f'wrote {out}')


if __name__ == '__main__':
    main()
