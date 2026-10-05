/**
 * Eagle (6 and later) and Fusion 360 Electronics board files (.brd, XML) to BoardModel.
 *
 * What is read:
 * - copper layers from the layer setup in the design rules ("(1*16)", "(1+2*15+16)", …), the
 *   board outline from the Dimension layer (20, and Milling 46), holes;
 * - elements with their packages from the embedded libraries: SMD and through-hole pads,
 *   placement (rotation "R90", mirrored "MR180" = bottom side), value;
 * - signals: wires (also curved), vias (diameter from the design rules when not given) and
 *   polygons. Eagle stores only the outline of a polygon pour, not the poured copper, so the
 *   pour is computed here (pour.ts): outline minus copper of other nets with the polygon's
 *   isolation (at least the wire-to-wire clearance), minus the copper-to-dimension margin,
 *   islands without a connection removed (orphans="no"), lower rank poured first;
 * - supply layers ("$GND" as layer name): the whole board on that layer belongs to the net.
 *
 * Eagle's y axis points up; it becomes y-down. Mirrored elements sit on the bottom layer.
 * The stack-up is not read (Eagle's isolation and copper thickness parameters are seldom set
 * on purpose); a default stack-up is used and flagged.
 */
import { chainRings, DEG } from '../model/geometry';
import type { Footprint, Pad, PadShape, Vec2 } from '../model/types';
import { BoardBuilder, guessHeight, ImportError } from './builder';
import { pourFill, type Obstacle } from './pour';
import { parseXml, xchild, xchildren, xfind, xnum, type XNode } from './xml';

/** Eagle's layer numbers for copper are 1 (Top) to 16 (Bottom). */
const TOP = 1;
const BOTTOM = 16;
const DIMENSION = 20;
const MILLING = 46;

/** "0.2mm", "8mil", "0.01in" → mm. */
function length(v: string | undefined, def: number): number {
  if (!v) return def;
  const m = /^\s*(-?[\d.]+)\s*(mm|mil|in|mic)?/i.exec(v);
  if (!m) return def;
  const x = Number(m[1]);
  const unit = (m[2] ?? 'mm').toLowerCase();
  return x * (unit === 'mil' ? 0.0254 : unit === 'in' ? 25.4 : unit === 'mic' ? 0.001 : 1);
}

/** "MR90" → mirrored, 90°; "SR45" (spin) only matters for text. */
function rotation(rot: string | undefined): { mirror: boolean; angle: number } {
  const m = /^(S?)(M?)R(-?[\d.]+)/i.exec(rot ?? '');
  return m ? { mirror: m[2]!.toUpperCase() === 'M', angle: Number(m[3]) } : { mirror: false, angle: 0 };
}

/** Points of a wire, curved by `curve` degrees (counter-clockwise, y-up). */
function wirePoints(a: Vec2, b: Vec2, curve: number): Vec2[] {
  if (!curve) return [a, b];
  const th = curve * DEG;
  const c = Math.hypot(b.x - a.x, b.y - a.y);
  if (c < 1e-9) return [a, b];
  const r = c / (2 * Math.sin(Math.abs(th) / 2));
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // centre on the left of a→b for a counter-clockwise arc (y-up)
  const ux = (b.x - a.x) / c;
  const uy = (b.y - a.y) / c;
  const d = r * Math.cos(th / 2) * Math.sign(th);
  const cx = mx - uy * d;
  const cy = my + ux * d;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const n = Math.max(2, Math.ceil(Math.abs(curve) / 5));
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = a0 + (th * k) / n;
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  pts[pts.length - 1] = b;
  return pts;
}

/** Polygon outline from its vertices (each vertex's curve bends the edge to the next). */
function polygonRing(poly: XNode): Vec2[] {
  const vs = xchildren(poly, 'vertex');
  const out: Vec2[] = [];
  vs.forEach((v, k) => {
    const a = { x: xnum(v, 'x'), y: xnum(v, 'y') };
    const w = vs[(k + 1) % vs.length]!;
    const b = { x: xnum(w, 'x'), y: xnum(w, 'y') };
    const pts = wirePoints(a, b, xnum(v, 'curve'));
    out.push(...pts.slice(0, -1));
  });
  return out;
}

const yDown = (p: Vec2): Vec2 => ({ x: p.x, y: -p.y });

export function isEagle(text: string): boolean {
  return /<eagle[\s>]/.test(text.slice(0, 4000));
}

export function parseEagle(text: string, fileName = 'board.brd'): import('../model/types').BoardModel {
  const root = parseXml(text);
  if (root.name !== 'eagle') throw new ImportError('not an Eagle board file');
  const board = xchild(xchild(root, 'drawing'), 'board');
  if (!board) throw new ImportError('Eagle file without a board (a schematic or library?)');

  // --- design rules -----------------------------------------------------------------------------
  const params = new Map<string, string>();
  for (const p of xfind(xchild(board, 'designrules'), 'param')) params.set(p.attrs.name ?? '', p.attrs.value ?? '');
  const firstLen = (name: string, def: number) => length((params.get(name) ?? '').trim().split(/\s+/)[0], def);
  const setup = params.get('layerSetup') ?? '(1*16)';
  const layerNums = [...setup.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 1 && n <= 16);
  const copperNums = [...new Set(layerNums)];
  if (!copperNums.length) copperNums.push(TOP, BOTTOM);
  // layers that carry copper in the file but are missing from the setup
  const layerNames = new Map<number, string>();
  for (const l of xfind(xchild(root, 'drawing'), 'layer')) layerNames.set(xnum(l, 'number'), l.attrs.name ?? '');
  const order = [...copperNums].sort((a, b) => a - b);
  const b = new BoardBuilder(order.map((n) => layerNames.get(n) ?? String(n)));
  const li = new Map(order.map((n, i) => [n, i]));
  const isolateMin = firstLen('mdWireWire', 0.2032);
  const edgeClear = firstLen('mdCopperDimension', 1.016);
  const ring = (drill: number, rv: string, rmin: string, rmax: string, dmin: number, dmax: number) =>
    Math.min(Math.max(drill * Number(params.get(rv) ?? 0.25), firstLen(rmin, dmin)), firstLen(rmax, dmax));
  const elongation = Number(params.get('psElongationLong') ?? 100) / 100;

  // --- outline and holes ----------------------------------------------------------------------
  const plain = xchild(board, 'plain');
  for (const w of xchildren(plain, 'wire')) {
    const layer = xnum(w, 'layer');
    if (layer !== DIMENSION && layer !== MILLING) continue;
    b.edges.push(wirePoints({ x: xnum(w, 'x1'), y: xnum(w, 'y1') }, { x: xnum(w, 'x2'), y: xnum(w, 'y2') }, xnum(w, 'curve')).map(yDown));
  }
  for (const c of xchildren(plain, 'circle')) {
    if (xnum(c, 'layer') !== DIMENSION) continue;
    const r = xnum(c, 'radius');
    b.edges.push(Array.from({ length: 49 }, (_, k) => yDown({ x: xnum(c, 'x') + r * Math.cos((k * Math.PI) / 24), y: xnum(c, 'y') + r * Math.sin((k * Math.PI) / 24) })));
  }
  for (const p of xchildren(plain, 'polygon')) if (xnum(p, 'layer') === DIMENSION) {
    const r = polygonRing(p).map(yDown);
    if (r.length > 2) b.edges.push([...r, r[0]!]);
  }

  // --- libraries: packages ----------------------------------------------------------------------
  const packages = new Map<string, XNode>();
  for (const lib of xfind(xchild(board, 'libraries'), 'library')) {
    for (const pkg of xfind(lib, 'package')) {
      const key = `${lib.attrs.name ?? ''}|${lib.attrs.urn ?? ''}|${pkg.attrs.name ?? ''}`;
      packages.set(key, pkg);
      // also without the URN, for files that reference only the library name
      const plainKey = `${lib.attrs.name ?? ''}||${pkg.attrs.name ?? ''}`;
      if (!packages.has(plainKey)) packages.set(plainKey, pkg);
    }
  }

  // --- nets of element pads -----------------------------------------------------------------------
  const signals = xfind(xchild(board, 'signals'), 'signal');
  const padNet = new Map<string, string>();
  for (const s of signals) for (const cr of xchildren(s, 'contactref')) padNet.set(`${cr.attrs.element}|${cr.attrs.pad}`, s.attrs.name ?? '');

  // --- elements ---------------------------------------------------------------------------------
  /** Copper per Eagle layer number for the pour: [net, obstacle]. */
  const copperOn = new Map<number, { net: number; o: Obstacle; anchor: Vec2 }[]>();
  const addCopper = (layer: number, net: number, o: Obstacle, anchor: Vec2) => {
    const list = copperOn.get(layer) ?? [];
    list.push({ net, o, anchor });
    copperOn.set(layer, list);
  };
  const allCopper = order;
  /**
   * Restrict areas (layer 41 tRestrict, 42 bRestrict): no copper there on the top / bottom
   * layer. Footprints put them around mounting holes and antennas; pours keep out of them.
   */
  const restrict = new Map<number, Obstacle[]>();
  const addRestrict = (eagleLayer: number, mirror: boolean, shape: XNode, P: (x: number, y: number) => Vec2) => {
    let cu = eagleLayer === 41 ? TOP : eagleLayer === 42 ? BOTTOM : 0;
    if (!cu) return;
    if (mirror) cu = cu === TOP ? BOTTOM : TOP;
    const list = restrict.get(cu) ?? [];
    if (shape.name === 'wire') {
      const pts = wirePoints({ x: xnum(shape, 'x1'), y: xnum(shape, 'y1') }, { x: xnum(shape, 'x2'), y: xnum(shape, 'y2') }, xnum(shape, 'curve'));
      for (let k = 1; k < pts.length; k++) list.push({ kind: 'seg', a: P(pts[k - 1]!.x, pts[k - 1]!.y), b: P(pts[k]!.x, pts[k]!.y), r: xnum(shape, 'width') / 2 });
    } else if (shape.name === 'circle') {
      const c = P(xnum(shape, 'x'), xnum(shape, 'y'));
      const r = xnum(shape, 'radius');
      const w = xnum(shape, 'width');
      if (w <= 0) list.push({ kind: 'circle', c, r });
      else for (let k = 0; k < 32; k++) {
        const a0 = (k * Math.PI) / 16;
        const a1 = ((k + 1) * Math.PI) / 16;
        list.push({ kind: 'seg', a: { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }, b: { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }, r: w / 2 });
      }
    } else if (shape.name === 'rectangle') {
      const x1 = xnum(shape, 'x1');
      const y1 = xnum(shape, 'y1');
      const x2 = xnum(shape, 'x2');
      const y2 = xnum(shape, 'y2');
      list.push({ kind: 'poly', ring: [P(x1, y1), P(x2, y1), P(x2, y2), P(x1, y2)], r: 0 });
    } else if (shape.name === 'polygon') {
      list.push({ kind: 'poly', ring: polygonRing(shape).map((q) => P(q.x, q.y)), r: xnum(shape, 'width') / 2 });
    }
    restrict.set(cu, list);
  };
  for (const g of plain?.children ?? []) addRestrict(xnum(g, 'layer'), false, g, (x, y) => yDown({ x, y }));
  for (const el of xfind(xchild(board, 'elements'), 'element')) {
    const ref = el.attrs.name ?? '';
    const pkg = packages.get(`${el.attrs.library ?? ''}|${el.attrs.library_urn ?? ''}|${el.attrs.package ?? ''}`) ?? packages.get(`${el.attrs.library ?? ''}||${el.attrs.package ?? ''}`);
    if (!pkg) {
      b.warnings.push(`eagle-package-missing:${ref}`);
      continue;
    }
    const { mirror, angle } = rotation(el.attrs.rot);
    const ox = xnum(el, 'x');
    const oy = xnum(el, 'y');
    // Eagle (as KiCad's importer reads it): rotate counter-clockwise, then mirror in x for
    // the bottom side; checked against KiCad's conversion of real boards (MR45, MR180)
    const place = (x: number, y: number): Vec2 => {
      const c = Math.cos(angle * DEG);
      const s = Math.sin(angle * DEG);
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      return yDown({ x: ox + (mirror ? -rx : rx), y: oy + ry });
    };
    const fpIndex = b.footprints.length;
    const padIdx: number[] = [];
    const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x: number, y: number, r: number) => {
      ext.x0 = Math.min(ext.x0, x - r);
      ext.y0 = Math.min(ext.y0, y - r);
      ext.x1 = Math.max(ext.x1, x + r);
      ext.y1 = Math.max(ext.y1, y + r);
    };
    // pad orientation as seen from the top (KiCad convention): mirroring reverses the sense
    const padAngle = (rot: string | undefined) => {
      const r = rotation(rot);
      return mirror ? -(angle + r.angle) : angle + r.angle;
    };
    for (const smd of xchildren(pkg, 'smd')) {
      const number = smd.attrs.name ?? '';
      const dx = xnum(smd, 'dx');
      const dy = xnum(smd, 'dy');
      const round = xnum(smd, 'roundness');
      let layer = xnum(smd, 'layer', TOP);
      if (mirror) layer = layer === TOP ? BOTTOM : layer === BOTTOM ? TOP : layer;
      const shape: PadShape = round >= 100 ? (Math.abs(dx - dy) < 1e-6 ? 'circle' : 'oval') : round > 0 ? 'roundrect' : 'rect';
      const at = place(xnum(smd, 'x'), xnum(smd, 'y'));
      grow(xnum(smd, 'x'), xnum(smd, 'y'), Math.max(dx, dy) / 2);
      const net = b.net(padNet.get(`${ref}|${number}`));
      const pad: Pad = {
        footprint: fpIndex,
        ref,
        number,
        net,
        at,
        angle: padAngle(smd.attrs.rot),
        shape,
        kind: 'smd',
        size: { x: dx, y: dy },
        layers: li.has(layer) ? [li.get(layer)!] : [],
        drill: 0,
        pinFunction: '',
        pinType: '',
      };
      padIdx.push(b.pads.length);
      b.pads.push(pad);
      addCopper(layer, net, { kind: 'poly', ring: rectRing(at, dx, dy, pad.angle), r: 0 }, at);
    }
    for (const pd of xchildren(pkg, 'pad')) {
      const number = pd.attrs.name ?? '';
      const drill = xnum(pd, 'drill', 0.8);
      const dia = xnum(pd, 'diameter') || drill + 2 * ring(drill, 'rvPadTop', 'rlMinPadTop', 'rlMaxPadTop', 0.254, 0.508);
      const shapeName = (pd.attrs.shape ?? 'round').toLowerCase();
      const long = shapeName === 'long' || shapeName === 'offset';
      const size = long ? { x: dia * (1 + elongation), y: dia } : { x: dia, y: dia };
      const shape: PadShape = shapeName === 'square' ? 'rect' : long ? 'oval' : 'circle';
      const at = place(xnum(pd, 'x'), xnum(pd, 'y'));
      grow(xnum(pd, 'x'), xnum(pd, 'y'), Math.max(size.x, size.y) / 2);
      const net = b.net(padNet.get(`${ref}|${number}`));
      const pad: Pad = {
        footprint: fpIndex,
        ref,
        number,
        net,
        at,
        angle: padAngle(pd.attrs.rot),
        shape,
        kind: 'thru_hole',
        size,
        layers: allCopper.map((n) => li.get(n)!),
        drill,
        pinFunction: '',
        pinType: '',
      };
      padIdx.push(b.pads.length);
      b.pads.push(pad);
      for (const n of allCopper) addCopper(n, net, padObstacle(at, size, shape, pad.angle), at);
    }
    for (const h of xchildren(pkg, 'hole')) {
      const at = place(xnum(h, 'x'), xnum(h, 'y'));
      const drill = xnum(h, 'drill');
      padIdx.push(b.pads.length);
      b.pads.push({ footprint: fpIndex, ref, number: '', net: 0, at, angle: 0, shape: 'circle', kind: 'np_thru_hole', size: { x: drill, y: drill }, layers: allCopper.map((n) => li.get(n)!), drill, pinFunction: '', pinType: '' });
      for (const n of allCopper) addCopper(n, 0, { kind: 'circle', c: at, r: drill / 2 }, at);
    }
    for (const g of pkg.children) addRestrict(xnum(g, 'layer'), mirror, g, place);
    // body: the package's courtyard/placement layers (39/40 tKeepout… are not reliable): pad extent
    for (const r of xchildren(pkg, 'rectangle')) {
      const layer = xnum(r, 'layer');
      if (layer === 39 || layer === 40 || layer === 51 || layer === 52) {
        grow(xnum(r, 'x1'), xnum(r, 'y1'), 0);
        grow(xnum(r, 'x2'), xnum(r, 'y2'), 0);
      }
    }
    for (const w of xchildren(pkg, 'wire')) {
      const layer = xnum(w, 'layer');
      if (layer === 51 || layer === 52) {
        grow(xnum(w, 'x1'), xnum(w, 'y1'), 0);
        grow(xnum(w, 'x2'), xnum(w, 'y2'), 0);
      }
    }
    const at = yDown({ x: ox, y: oy });
    const valid = Number.isFinite(ext.x0);
    const lc = valid ? place((ext.x0 + ext.x1) / 2, (ext.y0 + ext.y1) / 2) : at;
    const fp: Footprint = {
      ref,
      value: el.attrs.value ?? '',
      lib: `${el.attrs.library ?? ''}:${el.attrs.package ?? ''}`,
      at,
      // bottom side: KiCad's convention for flipped footprints (180° − θ)
      angle: mirror ? 180 - angle : angle,
      side: mirror ? 'bottom' : 'top',
      body: { center: lc, size: valid ? { x: ext.x1 - ext.x0, y: ext.y1 - ext.y0 } : { x: 1, y: 1 }, angle: mirror ? 180 - angle : angle },
      height: guessHeight(ref, el.attrs.package ?? ''),
      pads: padIdx,
      fields: Object.fromEntries(xchildren(el, 'attribute').filter((a) => a.attrs.value && !/^(NAME|VALUE)$/i.test(a.attrs.name ?? '')).map((a) => [a.attrs.name ?? '', a.attrs.value ?? ''])),
      models: [],
    };
    b.footprints.push(fp);
  }

  // --- signals: wires and vias ------------------------------------------------------------------
  const pours: { net: number; layer: number; poly: XNode; rank: number; isolate: number; orphans: boolean; cutout: boolean }[] = [];
  for (const s of signals) {
    const net = b.net(s.attrs.name);
    for (const w of xchildren(s, 'wire')) {
      const layer = xnum(w, 'layer');
      if (!li.has(layer)) continue;
      const pts = wirePoints({ x: xnum(w, 'x1'), y: xnum(w, 'y1') }, { x: xnum(w, 'x2'), y: xnum(w, 'y2') }, xnum(w, 'curve')).map(yDown);
      const width = xnum(w, 'width', 0.2);
      b.track(net, li.get(layer)!, pts, width, xnum(w, 'curve') !== 0);
      for (let k = 1; k < pts.length; k++) addCopper(layer, net, { kind: 'seg', a: pts[k - 1]!, b: pts[k]!, r: width / 2 }, pts[k]!);
    }
    for (const v of xchildren(s, 'via')) {
      const drill = xnum(v, 'drill', 0.3);
      const dia = xnum(v, 'diameter') || drill + 2 * ring(drill, 'rvViaOuter', 'rlMinViaOuter', 'rlMaxViaOuter', 0.2032, 0.508);
      const [f, t] = (v.attrs.extent ?? '1-16').split('-').map(Number);
      const span = order.filter((n) => n >= Math.min(f ?? 1, t ?? 16) && n <= Math.max(f ?? 1, t ?? 16));
      const at = yDown({ x: xnum(v, 'x'), y: xnum(v, 'y') });
      if (!span.length) continue;
      b.vias.push({ net, at, diameter: dia, drill, fromLayer: li.get(span[0]!)!, toLayer: li.get(span[span.length - 1]!)! });
      for (const n of span) addCopper(n, net, { kind: 'circle', c: at, r: dia / 2 }, at);
    }
    for (const p of xchildren(s, 'polygon')) {
      const layer = xnum(p, 'layer');
      if (!li.has(layer)) continue;
      pours.push({ net, layer, poly: p, rank: xnum(p, 'rank', 1), isolate: Math.max(xnum(p, 'isolate'), isolateMin), orphans: p.attrs.orphans === 'yes', cutout: p.attrs.pour === 'cutout' });
    }
  }
  // polygons without a signal: unconnected copper (cut-outs remove copper)
  for (const p of xchildren(plain, 'polygon')) {
    const layer = xnum(p, 'layer');
    if (!li.has(layer)) continue;
    pours.push({ net: 0, layer, poly: p, rank: xnum(p, 'rank', 1), isolate: Math.max(xnum(p, 'isolate'), isolateMin), orphans: true, cutout: p.attrs.pour === 'cutout' });
  }

  // --- pours, lower rank first; supply layers ---------------------------------------------------
  // the board outline as closed rings (Eagle draws it as single wires)
  const edgeRings = chainRings(b.edges, 0.02).rings;
  const cutouts = pours.filter((p) => p.cutout);
  const poured = new Map<number, { net: number; rings: Vec2[][] }[]>();
  const sorted = pours.filter((p) => !p.cutout).sort((x, y) => x.rank - y.rank);
  for (const p of sorted) {
    const outline = polygonRing(p.poly).map(yDown);
    const others = copperOn.get(p.layer) ?? [];
    const obstacles: Obstacle[] = others.filter((c) => c.net !== p.net || p.net === 0).map((c) => ({ ...c.o, r: ('r' in c.o ? c.o.r : 0) + p.isolate }) as Obstacle);
    for (const c of cutouts) if (c.layer === p.layer) obstacles.push({ kind: 'poly', ring: polygonRing(c.poly).map(yDown), r: 0 });
    obstacles.push(...(restrict.get(p.layer) ?? []));
    for (const q of poured.get(p.layer) ?? []) if (q.net !== p.net) for (const r of q.rings) obstacles.push({ kind: 'poly', ring: r, r: p.isolate });
    const anchors = p.orphans || p.net === 0 ? undefined : others.filter((c) => c.net === p.net).map((c) => c.anchor);
    const rings = pourFill({ outline, obstacles, edges: { rings: edgeRings, clearance: edgeClear }, anchors });
    for (const r of rings) b.zone(p.net, li.get(p.layer)!, r);
    const list = poured.get(p.layer) ?? [];
    list.push({ net: p.net, rings });
    poured.set(p.layer, list);
  }
  for (const n of order) {
    const name = layerNames.get(n) ?? '';
    if (!name.startsWith('$') || !edgeRings.length) continue;
    const net = b.net(name.slice(1));
    const others = (copperOn.get(n) ?? []).filter((c) => c.net !== net);
    const rings = pourFill({
      outline: edgeRings.reduce((a, c) => (Math.abs(areaOf(c)) > Math.abs(areaOf(a)) ? c : a)),
      obstacles: others.map((c) => ({ ...c.o, r: ('r' in c.o ? c.o.r : 0) + isolateMin }) as Obstacle),
      edges: { rings: edgeRings, clearance: edgeClear },
    });
    for (const r of rings) b.zone(net, li.get(n)!, r);
    b.kinds.set(b.copper[li.get(n)!]!, 'power');
  }
  if (pours.length) b.warnings.push('eagle-pour-computed');
  const version = root.attrs.version ?? '';
  return b.finish(fileName, `Eagle ${version}`.trim(), { thickness: 1.6, entries: null });
}

/** The copper of a pad as a pour obstacle: circle, rectangle, or oval as a capsule. */
function padObstacle(at: Vec2, size: Vec2, shape: PadShape, angleDeg: number): Obstacle {
  if (shape === 'circle') return { kind: 'circle', c: at, r: size.x / 2 };
  if (shape === 'oval') {
    const long = Math.max(size.x, size.y);
    const short = Math.min(size.x, size.y);
    const half = (long - short) / 2;
    // the long axis in the pad's frame, turned like rectRing turns it (KiCad convention)
    const ax = size.x >= size.y ? { x: half, y: 0 } : { x: 0, y: half };
    const a = angleDeg * DEG;
    const d = { x: ax.x * Math.cos(a) + ax.y * Math.sin(a), y: -ax.x * Math.sin(a) + ax.y * Math.cos(a) };
    return { kind: 'seg', a: { x: at.x - d.x, y: at.y - d.y }, b: { x: at.x + d.x, y: at.y + d.y }, r: short / 2 };
  }
  return { kind: 'poly', ring: rectRing(at, size.x, size.y, angleDeg), r: 0 };
}

function rectRing(c: Vec2, w: number, h: number, angleDeg: number): Vec2[] {
  const a = angleDeg * DEG;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: c.x + x! * cs + y! * sn, y: c.y - x! * sn + y! * cs }));
}

function areaOf(r: Vec2[]): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j]!.x + r[i]!.x) * (r[j]!.y - r[i]!.y);
  return s / 2;
}
