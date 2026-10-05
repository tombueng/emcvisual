/**
 * Mirror images in reference planes and shielding slots (docs/stage-1/PHYSICS.md §8).
 *
 * Output is a packed element list for the field kernel: 8 numbers per element
 * (ax, ay, az, bx, by, bz, weight, core radius), grouped by slot. Planes split the height
 * into slots; a field point skips a whole slot group when a plane with copper at the
 * point's column lies between the slot and the point.
 */
import { coveredNear, referenceCopper, type PlaneLayer } from '../model/planes';
import { toBoard, type Vec3, type WorldFrame } from '../model/world';
import type { CurrentElement } from './currents';
import type { ChargeElement } from './charges';

export const STRIDE = 8;

export interface ElementPack {
  data: Float64Array;
  /** slotStart[s]..slotStart[s+1] are the element indices of slot s. */
  slotStart: Int32Array;
  /** Plane heights, top to bottom (world mm). */
  planeY: Float64Array;
  count: number;
}

export interface ImageOptions {
  /** Sampling step along horizontal elements for the coverage test, mm. */
  step: number;
  /** Coverage gaps shorter than this are bridged (via anti-pads), mm. */
  minGap: number;
  /**
   * 'mirror': images at the mirror depth (2·plane − y). Right for the field above a large
   * plane (near field). 'plane': the return current in the plane itself, at its height. Right
   * for the dipole moment of a board whose planes are much smaller than the wavelength (far
   * field): a trace h above the plane then spans the loop h·L, not 2·h·L (Ott, eq. 12-2, which
   * already contains the factor 2 for the ground reflection).
   */
  imageAt: 'mirror' | 'plane';
}

const DEFAULTS: ImageOptions = { step: 0.1, minGap: 0.2, imageAt: 'mirror' };

interface Raw {
  a: Vec3;
  b: Vec3;
  w: number;
  r: number;
  slot: number;
}

/** Slot of a height: number of planes strictly above it. Planes sorted top to bottom. */
export function slotOf(planeY: ArrayLike<number>, y: number): number {
  let s = 0;
  for (let i = 0; i < planeY.length; i++) if (planeY[i]! > y + 1e-9) s++;
  return s;
}

export function packWithImages(
  elements: CurrentElement[],
  planes: PlaneLayer[],
  frame: WorldFrame,
  opts: Partial<ImageOptions> = {},
): ElementPack {
  const o = { ...DEFAULTS, ...opts };
  const sorted = [...planes].sort((p, q) => q.y - p.y);
  const planeY = Float64Array.from(sorted.map((p) => p.y));
  const out: Raw[] = [];

  /** Nearest plane in direction dir (+1 up, -1 down) from height y with copper at (x, z). */
  const coveringPlane = (x: number, z: number, y: number, dir: 1 | -1, near = false): PlaneLayer | undefined => {
    const b = toBoard(frame, x, z);
    let best: PlaneLayer | undefined;
    for (const p of sorted) {
      if (dir > 0 ? p.y <= y + 1e-9 : p.y >= y - 1e-9) continue;
      if (!(near ? coveredNear(p.raster, b.x, b.y) : referenceCopper(p.raster, b.x, b.y))) continue;
      if (!best || Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
    }
    return best;
  };

  const atPlane = o.imageAt === 'plane';
  /** Plane mode: points beyond a connector's plane (at the mirror depth) move onto the plane. */
  const ontoPlane = (e: CurrentElement): CurrentElement => {
    if (!atPlane || e.imagePlane === undefined) return e;
    const py = e.imagePlane;
    const side = Math.sign((e.slotY ?? py) - py) || 1;
    const fix = (p: Vec3): Vec3 => ((p[1] - py) * side < -1e-6 ? [p[0], py, p[2]] : p);
    return { ...e, a: fix(e.a), b: fix(e.b) };
  };

  for (const e0 of elements) {
    if (e0.w === 0) continue;
    const e = ontoPlane(e0);
    if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]) < 1e-9) continue;
    if (e.noImage) {
      // explicit return paths (stage 2): no mirrors; connectors on the image side take the
      // slot of their signal so they count in the same half space as the images
      if (e.slotY !== undefined) {
        out.push({ a: e.a, b: e.b, w: e.w, r: e.r, slot: slotOf(planeY, e.slotY) });
      } else if (e.vertical) {
        const y0 = Math.min(e.a[1], e.b[1]);
        const y1 = Math.max(e.a[1], e.b[1]);
        const cuts = [y0, ...Array.from(planeY).filter((py) => py > y0 + 1e-9 && py < y1 - 1e-9), y1].sort((p, q) => p - q);
        const up = e.b[1] > e.a[1];
        for (let k = 0; k + 1 < cuts.length; k++) {
          const lo = cuts[k]!;
          const hi = cuts[k + 1]!;
          out.push({
            a: [e.a[0], up ? lo : hi, e.a[2]],
            b: [e.a[0], up ? hi : lo, e.a[2]],
            w: e.w,
            r: e.r,
            slot: slotOf(planeY, (lo + hi) / 2),
          });
        }
      } else {
        out.push({ a: e.a, b: e.b, w: e.w, r: e.r, slot: slotOf(planeY, e.a[1]) });
      }
      continue;
    }
    if (e.vertical) {
      // split at plane heights so every piece lies in one slot
      const y0 = Math.min(e.a[1], e.b[1]);
      const y1 = Math.max(e.a[1], e.b[1]);
      const cuts = [y0, ...Array.from(planeY).filter((py) => py > y0 + 1e-9 && py < y1 - 1e-9), y1].sort((p, q) => p - q);
      const up = e.b[1] > e.a[1];
      for (let k = 0; k + 1 < cuts.length; k++) {
        const lo = cuts[k]!;
        const hi = cuts[k + 1]!;
        const mid = (lo + hi) / 2;
        const a: Vec3 = [e.a[0], up ? lo : hi, e.a[2]];
        const b: Vec3 = [e.a[0], up ? hi : lo, e.a[2]];
        const slot = slotOf(planeY, mid);
        out.push({ a, b, w: e.w, r: e.r, slot });
        // PEC image: J' = -R(J). Mirroring the end points already flips the vertical
        // direction, so the weight is negated to keep normal currents pointing the same way.
        // plane mode: the image of a vertical piece lies in the plane and has no length
        if (!atPlane)
          for (const dir of [1, -1] as const) {
            const p = coveringPlane(e.a[0], e.a[2], mid, dir, true);
            if (!p) continue;
            out.push({ a: [a[0], 2 * p.y - a[1], a[2]], b: [b[0], 2 * p.y - b[1], b[2]], w: -e.w, r: e.r, slot });
          }
      }
      continue;
    }

    // horizontal: walk along and find the image plane(s) per sample, then merge runs
    const len = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]);
    const n = Math.max(1, Math.ceil(len / o.step));
    const y = e.a[1];
    const slot = slotOf(planeY, y);
    const keyAt = (t: number) => {
      const x = e.a[0] + (e.b[0] - e.a[0]) * t;
      const z = e.a[2] + (e.b[2] - e.a[2]) * t;
      const up = coveringPlane(x, z, y, 1);
      const dn = coveringPlane(x, z, y, -1);
      return `${up ? up.y : 'n'}|${dn ? dn.y : 'n'}`;
    };
    const keys: string[] = [];
    for (let k = 0; k < n; k++) keys.push(keyAt((k + 0.5) / n));
    // bridge short gaps: a run shorter than minGap takes the key of its longer neighbour
    const minRun = Math.max(1, Math.round(o.minGap / (len / n)));
    const runs: { k0: number; k1: number; key: string }[] = [];
    for (let k = 0; k < n; k++) {
      const last = runs[runs.length - 1];
      if (last && last.key === keys[k]) last.k1 = k;
      else runs.push({ k0: k, k1: k, key: keys[k]! });
    }
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i]!;
      if (r.k1 - r.k0 + 1 >= minRun || runs.length === 1) continue;
      const prev = runs[i - 1];
      const next = runs[i + 1];
      const take = !prev ? next : !next ? prev : prev.k1 - prev.k0 >= next.k1 - next.k0 ? prev : next;
      if (take) r.key = take.key;
    }
    const merged: { k0: number; k1: number; key: string }[] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.key === r.key) last.k1 = r.k1;
      else merged.push({ ...r });
    }
    for (const r of merged) {
      const t0 = r.k0 / n;
      const t1 = (r.k1 + 1) / n;
      const a: Vec3 = [e.a[0] + (e.b[0] - e.a[0]) * t0, y, e.a[2] + (e.b[2] - e.a[2]) * t0];
      const b: Vec3 = [e.a[0] + (e.b[0] - e.a[0]) * t1, y, e.a[2] + (e.b[2] - e.a[2]) * t1];
      out.push({ a, b, w: e.w, r: e.r, slot });
      const [upS, dnS] = r.key.split('|');
      const ys = [upS, dnS].filter((s) => s !== 'n').map(Number);
      // PEC image J' = -R(J): tangential currents reverse. With planes on both sides the
      // return current splits roughly in proportion to 1/h.
      const inv = ys.map((py) => 1 / Math.max(Math.abs(py - y), 1e-3));
      const sum = inv.reduce((s, v) => s + v, 0);
      ys.forEach((py, i) => {
        const share = inv[i]! / sum;
        const yi = atPlane ? py : 2 * py - y;
        out.push({ a: [a[0], yi, a[2]], b: [b[0], yi, b[2]], w: -e.w * share, r: e.r, slot });
      });
    }
  }

  return finishPack(out, planeY);
}

function finishPack(out: Raw[], planeY: Float64Array): ElementPack {
  const slots = planeY.length + 1;
  out.sort((p, q) => p.slot - q.slot);
  const data = new Float64Array(out.length * STRIDE);
  const slotStart = new Int32Array(slots + 1);
  out.forEach((r, i) => {
    const o8 = i * STRIDE;
    data[o8] = r.a[0];
    data[o8 + 1] = r.a[1];
    data[o8 + 2] = r.a[2];
    data[o8 + 3] = r.b[0];
    data[o8 + 4] = r.b[1];
    data[o8 + 5] = r.b[2];
    data[o8 + 6] = r.w;
    data[o8 + 7] = r.r;
  });
  let k = 0;
  for (let s = 0; s <= slots; s++) {
    while (k < out.length && out[k]!.slot < s) k++;
    slotStart[s] = k;
  }
  slotStart[slots] = out.length;
  return { data, slotStart, planeY, count: out.length };
}

/**
 * Pack charges with mirror charges (opposite sign) in the planes that have copper there.
 * Line charges are cut into pieces of at most 1 mm so gaps in the planes count locally.
 * Same layout as current packs: (ax, ay, az, bx, by, bz, q, r), grouped by slot; a point
 * charge has a = b.
 */
export function packCharges(charges: ChargeElement[], planes: PlaneLayer[], frame: WorldFrame): ElementPack {
  const sorted = [...planes].sort((p, q) => q.y - p.y);
  const planeY = Float64Array.from(sorted.map((p) => p.y));
  const out: Raw[] = [];
  const mirrorsAt = (x: number, z: number, y: number): PlaneLayer[] => {
    const b = toBoard(frame, x, z);
    let up: PlaneLayer | undefined;
    let dn: PlaneLayer | undefined;
    for (const p of sorted) {
      if (!referenceCopper(p.raster, b.x, b.y)) continue;
      if (p.y > y + 1e-9 && (!up || p.y < up.y)) up = p;
      if (p.y < y - 1e-9 && (!dn || p.y > dn.y)) dn = p;
    }
    return [up, dn].filter((p): p is PlaneLayer => !!p);
  };
  for (const c of charges) {
    if (c.q === 0) continue;
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]);
    const n = len > 0 ? Math.max(1, Math.ceil(len / 1)) : 1;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const a: Vec3 = len > 0 ? [c.a[0] + (c.b[0] - c.a[0]) * t0, c.a[1], c.a[2] + (c.b[2] - c.a[2]) * t0] : c.a;
      const b: Vec3 = len > 0 ? [c.a[0] + (c.b[0] - c.a[0]) * t1, c.a[1], c.a[2] + (c.b[2] - c.a[2]) * t1] : c.b;
      const q = c.q / n;
      const slot = slotOf(planeY, a[1]);
      out.push({ a, b, w: q, r: c.r, slot });
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[2] + b[2]) / 2;
      for (const p of mirrorsAt(mx, mz, a[1])) {
        out.push({ a: [a[0], 2 * p.y - a[1], a[2]], b: [b[0], 2 * p.y - b[1], b[2]], w: -q, r: c.r, slot });
      }
    }
  }
  return finishPack(out, planeY);
}
