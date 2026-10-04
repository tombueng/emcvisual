/**
 * Stage 2a return-current model (docs/zukunft/STUFE-2-FLAECHENSTROEME.md):
 * where the reference plane has a gap under a current path, the return current no longer
 * jumps to another plane (stage 1 mirror model) but detours through the copper of the same
 * plane around the gap; where a signal changes to a layer with another reference plane, the
 * return current transfers through the nearest stitching via (same net) or decoupling
 * capacitor (different nets).
 *
 * The output stays a closed current system for Biot-Savart: mirror images are kept where the
 * plane is solid, and explicit "plane current" elements plus short connectors to the image
 * depth replace them where the return current takes another way.
 */
import { covered, coveredNear, referenceCopper, type CoverageRaster, type PlaneLayer } from '../model/planes';
import type { BoardModel, Vec2 } from '../model/types';
import { toBoard, toWorld, type Vec3, type WorldFrame } from '../model/world';
import { referencePlane } from './diagnostics';
import type { CurrentElement } from './currents';
import type { Source } from './sources';

export type ReturnModel = 'image' | 'detour';

export interface Detour {
  kind: 'gap' | 'transfer';
  /** Path of the return current in the plane, board coordinates. */
  path: Vec2[];
  /** Plane layer index carrying the detour (for transfers: the first plane). */
  layer: number;
  /** Length of the gap crossed (gap) or of the whole transfer path (transfer), mm. */
  length: number;
  /** Extra loop area compared with a return right under the trace, mm². */
  extraArea: number;
  /** For transfers: what carries the return between the planes, e.g. "C2" or "via". */
  via?: string;
  weight: number;
  /**
   * How the element list looks with this problem fixed (plane without the gap, or a stitching
   * via right at the layer change): elements to drop, elements to put back, elements to add.
   */
  fix?: { remove: number[]; restore: { index: number; el: CurrentElement }[]; add: CurrentElement[] };
  /**
   * Share of this problem: how much louder it makes the source when all other return paths
   * are ideal, dB (set by attribution). Orders the findings; not the effect of fixing it alone.
   */
  gainDb?: number;
  /** Effect of fixing only this spot, dB (positive: quieter; can be negative when detours cancel). */
  aloneDb?: number;
}

export interface ReturnResult {
  elements: CurrentElement[];
  detours: Detour[];
}

const STEP = 0.1;
const MIN_GAP = 0.2;
const SURFACE = 0.02; // plane currents sit on the plane surface facing the signal
const GRID = 0.4; // path-search cell, mm

interface Ctx {
  board: BoardModel;
  frame: WorldFrame;
  planes: PlaneLayer[];
}

export function applyReturnModel(ctx: Ctx, src: Source, elements: CurrentElement[]): ReturnResult {
  const out: CurrentElement[] = [];
  const detours: Detour[] = [];
  const L = ctx.board.layers;

  for (const e of elements) {
    if (e.vertical || e.layer < 0 || e.noImage) {
      out.push(e);
      continue;
    }
    const ref = referencePlane(ctx.board, ctx.planes, e.layer);
    if (!ref) {
      out.push(e);
      continue;
    }
    const gaps = interiorGaps(e, ref.raster, ctx.frame);
    if (gaps.length === 0) {
      out.push(e);
      continue;
    }
    const yL = L[e.layer]!.y;
    const side = yL > ref.y ? 1 : -1;
    const ys = ref.y + side * SURFACE;
    const yImg = 2 * ref.y - yL;
    let tPrev = 0;
    for (const g of gaps) {
      const A = lerp(e.a, e.b, g.t0);
      const B = lerp(e.a, e.b, g.t1);
      const ba = toBoard(ctx.frame, A[0], A[2]);
      const bb = toBoard(ctx.frame, B[0], B[2]);
      const path = geodesic(ref.raster, bb, ba);
      if (!path) continue; // no copper way around: keep the stage 1 behaviour for this gap
      if (g.t0 > tPrev) out.push({ ...e, a: lerp(e.a, e.b, tPrev), b: A });
      out.push({ ...e, a: A, b: B, noImage: true });
      const first = out.length;
      // image arrives at B' → up to the plane surface → around the gap → down to A'
      out.push(vertical(B, yImg, ys, e.w, e.r, e.net, yL, ref.y));
      for (let k = 1; k < path.length; k++) {
        out.push({
          a: toWorld(ctx.frame, path[k - 1]!, ys),
          b: toWorld(ctx.frame, path[k]!, ys),
          w: e.w,
          r: 0.3,
          vertical: false,
          layer: ref.layer,
          net: ref.net,
          noImage: true,
          tag: 'return',
        });
      }
      out.push(vertical(A, ys, yImg, e.w, e.r, e.net, yL, ref.y));
      // fixed: the return runs right under the trace, as the mirror image of the crossing
      const image: CurrentElement = {
        a: [A[0], yImg, A[2]],
        b: [B[0], yImg, B[2]],
        w: -e.w,
        r: e.r,
        vertical: false,
        layer: ref.layer,
        net: ref.net,
        noImage: true,
        slotY: yL,
        imagePlane: ref.y,
      };
      detours.push({
        kind: 'gap',
        path,
        layer: ref.layer,
        length: Math.hypot(B[0] - A[0], B[2] - A[2]),
        extraArea: loopArea(ba, bb, path),
        weight: e.w,
        fix: { remove: range(first, out.length), restore: [], add: [image] },
      });
      tPrev = g.t1;
    }
    if (tPrev < 1) out.push({ ...e, a: lerp(e.a, e.b, tPrev), b: e.b });
  }

  if (src.type !== 'loop') transferAtVias(ctx, out, detours);
  return { elements: out, detours };
}

// --- gaps along an element ----------------------------------------------------------------------

function interiorGaps(e: CurrentElement, raster: CoverageRaster, frame: WorldFrame): { t0: number; t1: number }[] {
  const len = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]);
  const n = Math.max(1, Math.ceil(len / STEP));
  const cov: boolean[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const p = toBoard(frame, e.a[0] + (e.b[0] - e.a[0]) * t, e.a[2] + (e.b[2] - e.a[2]) * t);
    cov.push(referenceCopper(raster, p.x, p.y));
  }
  const gaps: { t0: number; t1: number }[] = [];
  let k = 0;
  while (k < n) {
    if (cov[k]) {
      k++;
      continue;
    }
    let j = k;
    while (j < n && !cov[j]) j++;
    const lenGap = ((j - k) / n) * len;
    // only gaps with copper on both sides (a path can enter and leave the plane there)
    if (k > 0 && j < n && lenGap >= MIN_GAP) gaps.push({ t0: k / n, t1: j / n });
    k = j;
  }
  return gaps;
}

// --- layer changes ------------------------------------------------------------------------------

function transferAtVias(ctx: Ctx, out: CurrentElement[], detours: Detour[]) {
  const { board, frame, planes } = ctx;
  const L = board.layers;
  const layerByY = (y: number) => L.find((l) => Math.abs(l.y - y) < 1e-6);
  type Span = { x: number; z: number; y0: number; y1: number; w: number; down: boolean; idx: number[] };
  const spans = new Map<string, Span>();
  out.forEach((e, i) => {
    if (e.tag !== 'via') return;
    const key = `${e.a[0].toFixed(3)},${e.a[2].toFixed(3)}`;
    const lo = Math.min(e.a[1], e.b[1]);
    const hi = Math.max(e.a[1], e.b[1]);
    const sp = spans.get(key);
    if (sp) {
      sp.y0 = Math.min(sp.y0, lo);
      sp.y1 = Math.max(sp.y1, hi);
      sp.idx.push(i);
    } else spans.set(key, { x: e.a[0], z: e.a[2], y0: lo, y1: hi, w: e.w, down: e.b[1] < e.a[1], idx: [i] });
  });

  for (const sp of spans.values()) {
    const top = layerByY(sp.y1);
    const bot = layerByY(sp.y0);
    if (!top || !bot || top.index === bot.index) continue;
    const runsOn = (l: number, y: number) =>
      out.some((x) => !x.vertical && x.layer === l && [x.a, x.b].some((p) => Math.abs(p[0] - sp.x) < 1e-3 && Math.abs(p[2] - sp.z) < 1e-3 && Math.abs(p[1] - y) < 1e-6));
    if (!runsOn(top.index, sp.y1) || !runsOn(bot.index, sp.y0)) continue;
    const at = toBoard(frame, sp.x, sp.z);
    const pTop = nearestCovering(board, planes, top.index, at);
    const pBot = nearestCovering(board, planes, bot.index, at);
    if (!pTop || !pBot || pTop.layer === pBot.layer) continue;

    // forward current goes from layer "from" to layer "to"; the return goes the other way
    const [fromL, toL, pFrom, pTo] = sp.down ? [top, bot, pTop, pBot] : [bot, top, pBot, pTop];
    const link = findLink(board, frame, pFrom, pTo, at);
    if (!link) continue;

    const sFrom = pFrom.y + (fromL.y > pFrom.y ? SURFACE : -SURFACE);
    const sTo = pTo.y + (toL.y > pTo.y ? SURFACE : -SURFACE);
    const imgFrom = 2 * pFrom.y - fromL.y;
    const imgTo = 2 * pTo.y - toL.y;
    const pathTo = geodesic(pTo.raster, at, link.atTo) ?? [at, link.atTo];
    const pathFrom = geodesic(pFrom.raster, link.atFrom, at) ?? [link.atFrom, at];
    const w = sp.w;
    const V = toWorld(frame, at, 0);

    // the via's own mirror images would duplicate the return: drop them
    const restore = sp.idx.map((i) => ({ index: i, el: out[i]! }));
    for (const i of sp.idx) out[i] = { ...out[i]!, noImage: true };
    const first = out.length;
    // image of the "to" side arrives at V → plane surface → to the link
    out.push(vertical(V, imgTo, sTo, w, 0.15, pTo.net, toL.y, pTo.y));
    pushPath(out, frame, pathTo, sTo, w, pTo);
    // through the link: stitching via, or up to the capacitor, across it and down
    for (const seg of link.segments(sTo, sFrom)) out.push({ ...seg, w, noImage: true, tag: 'return' });
    pushPath(out, frame, pathFrom, sFrom, w, pFrom);
    out.push(vertical(V, sFrom, imgFrom, w, 0.15, pFrom.net, fromL.y, pFrom.y));

    const loop = [...pathTo, ...pathFrom.slice(1)];
    detours.push({
      kind: 'transfer',
      path: loop,
      layer: pTo.layer,
      length: pathLength(pathTo) + pathLength(pathFrom),
      extraArea: pathLength(pathTo) * Math.abs(pTo.y - pFrom.y),
      via: link.label,
      weight: w,
      // fixed: a stitching via right beside the signal via, so the images of the via return
      fix: { remove: range(first, out.length), restore, add: [] },
    });
  }
}

function range(a: number, b: number): number[] {
  return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
}

/** The element list with one detour fixed (see Detour.fix). */
export function withFixed(elements: CurrentElement[], d: Detour): CurrentElement[] {
  if (!d.fix) return elements;
  const drop = new Set(d.fix.remove);
  const back = new Map(d.fix.restore.map((r) => [r.index, r.el]));
  const out: CurrentElement[] = [];
  elements.forEach((e, i) => {
    if (drop.has(i)) return;
    out.push(back.get(i) ?? e);
  });
  return [...out, ...d.fix.add];
}

interface Link {
  label: string;
  atTo: Vec2;
  atFrom: Vec2;
  segments(yTo: number, yFrom: number): Omit<CurrentElement, 'w'>[];
}

/** Stitching via (same net) or the nearest two-pin part between the two plane nets. */
function findLink(board: BoardModel, frame: WorldFrame, pFrom: PlaneLayer, pTo: PlaneLayer, at: Vec2): Link | null {
  const lo = Math.min(pFrom.layer, pTo.layer);
  const hi = Math.max(pFrom.layer, pTo.layer);
  const L = board.layers;
  const vert = (p: Vec2, y0: number, y1: number, net: number): Omit<CurrentElement, 'w'> => ({
    a: toWorld(frame, p, y0),
    b: toWorld(frame, p, y1),
    r: 0.2,
    vertical: true,
    layer: -1,
    net,
  });
  if (pFrom.net === pTo.net) {
    let best: { d: number; p: Vec2 } | null = null;
    for (const v of board.vias) {
      if (v.net !== pFrom.net || v.fromLayer > lo || v.toLayer < hi) continue;
      const d = Math.hypot(v.at.x - at.x, v.at.y - at.y);
      if (!best || d < best.d) best = { d, p: v.at };
    }
    for (const p of board.pads) {
      if (p.net !== pFrom.net || p.kind !== 'thru_hole') continue;
      const d = Math.hypot(p.at.x - at.x, p.at.y - at.y);
      if (!best || d < best.d) best = { d, p: p.at };
    }
    if (!best) return null;
    const p = best.p;
    return { label: 'via', atTo: p, atFrom: p, segments: (yTo, yFrom) => [vert(p, yTo, yFrom, pFrom.net)] };
  }
  let best: { d: number; ref: string; to: Vec2; from: Vec2; layer: number } | null = null;
  for (const fp of board.footprints) {
    if (fp.pads.length !== 2) continue;
    const a = board.pads[fp.pads[0]!]!;
    const b = board.pads[fp.pads[1]!]!;
    const forward = a.net === pTo.net && b.net === pFrom.net;
    const backward = b.net === pTo.net && a.net === pFrom.net;
    if (!forward && !backward) continue;
    const padTo = forward ? a : b;
    const padFrom = forward ? b : a;
    const d = Math.hypot(fp.at.x - at.x, fp.at.y - at.y);
    if (!best || d < best.d) best = { d, ref: fp.ref, to: padTo.at, from: padFrom.at, layer: fp.side === 'top' ? 0 : L.length - 1 };
  }
  if (!best) return null;
  const c = best;
  const yCap = L[c.layer]!.y;
  return {
    label: c.ref,
    atTo: c.to,
    atFrom: c.from,
    segments: (yTo, yFrom) => [
      vert(c.to, yTo, yCap, pTo.net),
      { a: toWorld(frame, c.to, yCap), b: toWorld(frame, c.from, yCap), r: 0.3, vertical: false, layer: c.layer, net: pTo.net },
      vert(c.from, yCap, yFrom, pFrom.net),
    ],
  };
}

function nearestCovering(board: BoardModel, planes: PlaneLayer[], layer: number, at: Vec2): PlaneLayer | undefined {
  const y = board.layers[layer]!.y;
  return planes
    .filter((p) => p.layer !== layer && coveredNear(p.raster, at.x, at.y))
    .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
}

// --- helpers ------------------------------------------------------------------------------------

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function vertical(p: Vec3, y0: number, y1: number, w: number, r: number, net: number, slotY: number, imagePlane: number): CurrentElement {
  return { a: [p[0], y0, p[2]], b: [p[0], y1, p[2]], w, r, vertical: true, layer: -1, net, noImage: true, slotY, imagePlane, tag: 'return' };
}

function pushPath(out: CurrentElement[], frame: WorldFrame, path: Vec2[], y: number, w: number, plane: PlaneLayer) {
  for (let k = 1; k < path.length; k++) {
    out.push({
      a: toWorld(frame, path[k - 1]!, y),
      b: toWorld(frame, path[k]!, y),
      w,
      r: 0.3,
      vertical: false,
      layer: plane.layer,
      net: plane.net,
      noImage: true,
      tag: 'return',
    });
  }
}

function pathLength(p: Vec2[]): number {
  let s = 0;
  for (let k = 1; k < p.length; k++) s += Math.hypot(p[k]!.x - p[k - 1]!.x, p[k]!.y - p[k - 1]!.y);
  return s;
}

function polygonArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j]!.x + p[i]!.x) * (p[j]!.y - p[i]!.y);
  return a / 2;
}

/** Area enclosed by the straight trace A→B and the return detour B→…→A. */
function loopArea(a: Vec2, b: Vec2, detourFromB: Vec2[]): number {
  return Math.abs(polygonArea([a, b, ...detourFromB.slice(1)]));
}

// --- shortest path through plane copper ---------------------------------------------------------

/**
 * Shortest path from p to q through the copper of a plane: 8-connected Dijkstra on a coarse
 * grid (a cell counts as copper when all of it is, so narrow slots stay closed), searched in a window around the points
 * first and on the whole raster if needed, then straightened by line-of-sight pulling.
 */
export function geodesic(r: CoverageRaster, p: Vec2, q: Vec2, margin = 25): Vec2[] | null {
  const win = {
    x0: Math.min(p.x, q.x) - margin,
    y0: Math.min(p.y, q.y) - margin,
    x1: Math.max(p.x, q.x) + margin,
    y1: Math.max(p.y, q.y) + margin,
  };
  return searchIn(r, p, q, win, GRID) ?? searchIn(r, p, q, { x0: r.x0, y0: r.y0, x1: r.x0 + r.nx * r.cell, y1: r.y0 + r.ny * r.cell }, GRID * 2);
}

function searchIn(r: CoverageRaster, p: Vec2, q: Vec2, win: { x0: number; y0: number; x1: number; y1: number }, cell: number): Vec2[] | null {
  const x0 = Math.max(win.x0, r.x0);
  const y0 = Math.max(win.y0, r.y0);
  const nx = Math.max(2, Math.ceil((Math.min(win.x1, r.x0 + r.nx * r.cell) - x0) / cell));
  const ny = Math.max(2, Math.ceil((Math.min(win.y1, r.y0 + r.ny * r.cell) - y0) / cell));
  const copper = new Uint8Array(nx * ny);
  const sub = Math.max(1, Math.round(cell / r.cell));
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      let c = 0;
      let t = 0;
      for (let b = 0; b < sub; b++)
        for (let a = 0; a < sub; a++) {
          t++;
          if (covered(r, x0 + (i + (a + 0.5) / sub) * cell, y0 + (j + (b + 0.5) / sub) * cell)) c++;
        }
      // only cells that are copper all over: a narrow slot or split must not be bridged
      copper[j * nx + i] = c === t ? 1 : 0;
    }
  const cellOf = (v: Vec2) => [Math.floor((v.x - x0) / cell), Math.floor((v.y - y0) / cell)] as const;
  const snap = (v: Vec2): number => {
    const [ci, cj] = cellOf(v);
    for (let rad = 0; rad < 12; rad++)
      for (let dj = -rad; dj <= rad; dj++)
        for (let di = -rad; di <= rad; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i >= 0 && j >= 0 && i < nx && j < ny && copper[j * nx + i]) return j * nx + i;
        }
    return -1;
  };
  const s = snap(p);
  const g = snap(q);
  if (s < 0 || g < 0) return null;

  // Float64: with Float32 the stored distance rounds below the computed one and pops get skipped
  const dist = new Float64Array(nx * ny).fill(Infinity);
  const prev = new Int32Array(nx * ny).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let k = heap.length - 1;
    while (k > 0) {
      const pk = (k - 1) >> 1;
      if (heap[pk]![0] <= d) break;
      [heap[k], heap[pk]] = [heap[pk]!, heap[k]!];
      k = pk;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const rr = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (rr < heap.length && heap[rr]![0] < heap[m]![0]) m = rr;
        if (m === k) break;
        [heap[k], heap[m]] = [heap[m]!, heap[k]!];
        k = m;
      }
    }
    return top;
  };
  dist[s] = 0;
  push(0, s);
  const steps = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ] as const;
  while (heap.length) {
    const [d, v] = pop();
    if (d > dist[v]!) continue;
    if (v === g) break;
    const vi = v % nx;
    const vj = Math.floor(v / nx);
    for (const [di, dj, c] of steps) {
      const i = vi + di;
      const j = vj + dj;
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const u = j * nx + i;
      if (!copper[u]) continue;
      // no corner cutting through non-copper
      if (di && dj && (!copper[vj * nx + i] || !copper[j * nx + vi])) continue;
      const nd = d + c;
      if (nd < dist[u]!) {
        dist[u] = nd;
        prev[u] = v;
        push(nd, u);
      }
    }
  }
  if (!Number.isFinite(dist[g]!)) return null;
  const cells: number[] = [];
  for (let v = g; v !== -1; v = prev[v]!) cells.push(v);
  cells.reverse();
  const centre = (v: number): Vec2 => ({ x: x0 + ((v % nx) + 0.5) * cell, y: y0 + (Math.floor(v / nx) + 0.5) * cell });

  // string pulling: from each kept point jump to the farthest cell still in line of sight
  const visible = (a: Vec2, b: Vec2) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const [i, j] = cellOf({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (i < 0 || j < 0 || i >= nx || j >= ny || !copper[j * nx + i]) return false;
    }
    return true;
  };
  const pts = [p, ...cells.map(centre), q];
  const outPts: Vec2[] = [pts[0]!];
  let k = 0;
  while (k < pts.length - 1) {
    let far = k + 1;
    for (let m = pts.length - 1; m > k + 1; m--) {
      if (visible(pts[k]!, pts[m]!)) {
        far = m;
        break;
      }
    }
    outPts.push(pts[far]!);
    k = far;
  }
  return outPts;
}
