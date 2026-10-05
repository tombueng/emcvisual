/**
 * Copper pour on a raster, for formats that store only the outline of a pour (Eagle): the
 * outline is filled, copper of other nets is cut out with its clearance, a margin to the board
 * edge is kept, and islands without a connection to the pour's own net are removed. The result
 * is one keyhole ring per island (outer boundary with its holes joined in), traced along the
 * raster cells, so islands stay separate polygons as in a KiCad zone fill.
 *
 * This reproduces what the CAD program computes when it pours, within the raster cell (0.1 mm
 * by default); thermal spokes and the outline's line width are not modelled.
 */
import { rasterize, type CoverageRaster } from '../model/planes';
import type { Vec2 } from '../model/types';
import { signedArea } from '../model/geometry';

export type Obstacle =
  | { kind: 'seg'; a: Vec2; b: Vec2; r: number }
  | { kind: 'circle'; c: Vec2; r: number }
  | { kind: 'poly'; ring: Vec2[]; r: number }
  /** A void with islands inside (a moat around a pad of the plane's own net): clears ring minus holes. */
  | { kind: 'moat'; ring: Vec2[]; holes: Vec2[][] };

export interface PourInput {
  outline: Vec2[];
  /** Copper of other nets (with their clearance added to r) and cut-outs. */
  obstacles: Obstacle[];
  /** Board edge rings and the clearance to keep from them. */
  edges?: { rings: Vec2[][]; clearance: number };
  /** Points of the pour's own net (pads, vias, track ends); islands without one are removed. Undefined: keep all. */
  anchors?: Vec2[];
  /** Keep every island when none of them is connected (KiCad does this; Eagle drops the pour). */
  keepIfNoneConnected?: boolean;
  cell?: number;
}

/** Keyhole rings of the poured copper, one per island. */
export function pourFill(inp: PourInput): Vec2[][] {
  if (inp.outline.length < 3) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of inp.outline) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  // at most about 2000 cells on the long side
  const cell = Math.max(inp.cell ?? 0.1, Math.max(x1 - x0, y1 - y0) / 2000);
  const r: CoverageRaster = rasterize([inp.outline], { x0, y0, x1, y1 }, 2e6 * cell * cell);
  const { nx, ny } = r;
  const data = r.data;
  const cx = (i: number) => r.x0 + (i + 0.5) * r.cell;
  const cy = (j: number) => r.y0 + (j + 0.5) * r.cell;
  const clearBox = (bx0: number, by0: number, bx1: number, by1: number, hit: (x: number, y: number) => boolean) => {
    const i0 = Math.max(0, Math.floor((bx0 - r.x0) / r.cell));
    const i1 = Math.min(nx - 1, Math.floor((bx1 - r.x0) / r.cell));
    const j0 = Math.max(0, Math.floor((by0 - r.y0) / r.cell));
    const j1 = Math.min(ny - 1, Math.floor((by1 - r.y0) / r.cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (data[k] && hit(cx(i), cy(j))) data[k] = 0;
      }
  };
  const segHit = (a: Vec2, b: Vec2, rr: number) => (x: number, y: number) => segDist(x, y, a, b) <= rr;
  for (const o of inp.obstacles) {
    if (o.kind === 'seg') clearBox(Math.min(o.a.x, o.b.x) - o.r, Math.min(o.a.y, o.b.y) - o.r, Math.max(o.a.x, o.b.x) + o.r, Math.max(o.a.y, o.b.y) + o.r, segHit(o.a, o.b, o.r));
    else if (o.kind === 'circle') clearBox(o.c.x - o.r, o.c.y - o.r, o.c.x + o.r, o.c.y + o.r, (x, y) => Math.hypot(x - o.c.x, y - o.c.y) <= o.r);
    else if (o.kind === 'moat') {
      if (o.ring.length < 3) continue;
      const xs = o.ring.map((p) => p.x);
      const ys = o.ring.map((p) => p.y);
      clearBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => inRing(x, y, o.ring) && !o.holes.some((h) => h.length > 2 && inRing(x, y, h)));
    } else if (o.ring.length > 2) {
      const xs = o.ring.map((p) => p.x);
      const ys = o.ring.map((p) => p.y);
      clearBox(Math.min(...xs) - o.r, Math.min(...ys) - o.r, Math.max(...xs) + o.r, Math.max(...ys) + o.r, (x, y) => {
        if (inRing(x, y, o.ring)) return true;
        if (o.r <= 0) return false;
        for (let k = 0, m = o.ring.length - 1; k < o.ring.length; m = k++) if (segDist(x, y, o.ring[m]!, o.ring[k]!) <= o.r) return true;
        return false;
      });
    }
  }
  if (inp.edges && inp.edges.clearance > 0)
    for (const ring of inp.edges.rings)
      for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
        const a = ring[m]!;
        const b = ring[k]!;
        const d = inp.edges.clearance;
        clearBox(Math.min(a.x, b.x) - d, Math.min(a.y, b.y) - d, Math.max(a.x, b.x) + d, Math.max(a.y, b.y) + d, segHit(a, b, d));
      }

  // islands (4-connected); keep those that touch the pour's own net
  const label = new Int32Array(nx * ny);
  let count = 0;
  const stack: number[] = [];
  for (let k = 0; k < data.length; k++) {
    if (!data[k] || label[k]) continue;
    count++;
    label[k] = count;
    stack.push(k);
    while (stack.length) {
      const q = stack.pop()!;
      const i = q % nx;
      const j = (q - i) / nx;
      const nb = [i > 0 ? q - 1 : -1, i < nx - 1 ? q + 1 : -1, j > 0 ? q - nx : -1, j < ny - 1 ? q + nx : -1];
      for (const t of nb) {
        if (t >= 0 && data[t] && !label[t]) {
          label[t] = count;
          stack.push(t);
        }
      }
    }
  }
  const keep = new Uint8Array(count + 1);
  if (!inp.anchors) keep.fill(1);
  else
    for (const a of inp.anchors) {
      // an anchor keeps the island under it or right next to it (pads sit in their own clearance hole)
      const i = Math.floor((a.x - r.x0) / r.cell);
      const j = Math.floor((a.y - r.y0) / r.cell);
      for (let dj = -3; dj <= 3; dj++)
        for (let di = -3; di <= 3; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const l = label[jj * nx + ii]!;
          if (l) keep[l] = 1;
        }
    }
  if (inp.keepIfNoneConnected && !keep.some((k, i) => i > 0 && k === 1)) keep.fill(1);
  const out: Vec2[][] = [];
  for (let l = 1; l <= count; l++) {
    if (!keep[l]) continue;
    const loops = traceLoops(label, l, nx, ny).map((loop) => loop.map(([i, j]) => ({ x: r.x0 + i * r.cell, y: r.y0 + j * r.cell })));
    if (!loops.length) continue;
    loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    out.push(loops.length > 1 ? keyhole(loops[0]!, loops.slice(1)) : loops[0]!);
  }
  return out;
}

/**
 * Boundary loops of the cells with the label, along cell edges (grid corner coordinates).
 * Each boundary edge is directed with the cell on its left; at a corner where the region
 * touches itself diagonally the loop turns towards the cell, so loops stay simple.
 */
function traceLoops(label: Int32Array, l: number, nx: number, ny: number): [number, number][][] {
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && label[j * nx + i] === l;
  // directed edges keyed by their start corner; corner id = j*(nx+1)+i
  const W = nx + 1;
  const next = new Map<number, number[]>();
  const add = (fi: number, fj: number, ti: number, tj: number) => {
    const f = fj * W + fi;
    const list = next.get(f);
    if (list) list.push(tj * W + ti);
    else next.set(f, [tj * W + ti]);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (label[j * nx + i] !== l) continue;
      // y grows downwards; walk each boundary so the cell is on the left in a y-down frame
      if (!inside(i, j - 1)) add(i + 1, j, i, j); // top edge, right to left
      if (!inside(i - 1, j)) add(i, j, i, j + 1); // left edge, downwards
      if (!inside(i, j + 1)) add(i, j + 1, i + 1, j + 1); // bottom edge, left to right
      if (!inside(i + 1, j)) add(i + 1, j + 1, i + 1, j); // right edge, upwards
    }
  const loops: [number, number][][] = [];
  for (const [start, targets] of next) {
    while (targets.length) {
      const loop: [number, number][] = [];
      let from = start;
      let to = targets.pop()!;
      loop.push([from % W, Math.floor(from / W)]);
      let guard = 0;
      while (to !== start && guard++ < 4e6) {
        const outs = next.get(to);
        if (!outs || !outs.length) break;
        let k = 0;
        if (outs.length > 1) {
          // saddle: take the outgoing edge that turns left relative to the incoming direction
          const dx = (to % W) - (from % W);
          const dy = Math.floor(to / W) - Math.floor(from / W);
          let best = -Infinity;
          outs.forEach((t, idx) => {
            const ex = (t % W) - (to % W);
            const ey = Math.floor(t / W) - Math.floor(to / W);
            const cross = dx * ey - dy * ex;
            if (cross > best) {
              best = cross;
              k = idx;
            }
          });
        }
        const nxt = outs.splice(k, 1)[0]!;
        loop.push([to % W, Math.floor(to / W)]);
        from = to;
        to = nxt;
      }
      loops.push(simplify(loop));
    }
  }
  return loops.filter((x) => x.length >= 4);
}

/** Drop corners that lie on a straight run. */
function simplify(loop: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  const n = loop.length;
  for (let k = 0; k < n; k++) {
    const a = loop[(k + n - 1) % n]!;
    const b = loop[k]!;
    const c = loop[(k + 1) % n]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}

function area(r: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]!.x + r[i]!.x) * (r[j]!.y - r[i]!.y);
  return a / 2;
}

function inRing(x: number, y: number, ring: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function segDist(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * The net of each island of a plane: the most frequent net among the connections inside it
 * (vias and pins that reach the copper there). Islands of a split plane get their own nets;
 * an island without a connection gets `fallback`.
 */
export function islandNets(rings: Vec2[][], connections: { at: Vec2; net: string }[], fallback: string): string[] {
  return rings.map((ring) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of ring) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const count = new Map<string, number>();
    for (const c of connections) {
      if (!c.net || c.at.x < x0 || c.at.x > x1 || c.at.y < y0 || c.at.y > y1) continue;
      if (inRing(c.at.x, c.at.y, ring)) count.set(c.net, (count.get(c.net) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  });
}

/**
 * Join holes into an outer ring (keyhole), the way KiCad stores filled zones: each hole is
 * spliced in at the vertex of the ring built so far that is nearest to the hole's first point,
 * with a zero-width bridge there and back. Even-odd filling and the area stay correct.
 * The ring is a linked list and the nearest vertex comes from a grid, so planes with thousands
 * of clearance holes join in linear time.
 */
export function keyhole(outer: Vec2[], holes: Vec2[][]): Vec2[] {
  const ring = orient(outer, true);
  const valid = holes.filter((h) => h.length >= 3);
  if (!valid.length) return ring;
  const pts: Vec2[] = [];
  const next: number[] = [];
  for (let k = 0; k < ring.length; k++) {
    pts.push(ring[k]!);
    next.push((k + 1) % ring.length);
  }
  // grid over everything that will be in the ring
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let total = ring.length;
  for (const r of [ring, ...valid]) {
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    total += r === ring ? 0 : r.length;
  }
  const cell = Math.max((x1 - x0 + y1 - y0) / Math.max(2, Math.sqrt(total)), 1e-6);
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1);
  const ny = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
  const grid = new Map<number, number[]>();
  const keyOf = (i: number, j: number) => j * nx + i;
  const index = (id: number) => {
    const p = pts[id]!;
    const k = keyOf(Math.floor((p.x - x0) / cell), Math.floor((p.y - y0) / cell));
    const list = grid.get(k);
    if (list) list.push(id);
    else grid.set(k, [id]);
  };
  for (let k = 0; k < pts.length; k++) index(k);
  const nearest = (q: Vec2): number => {
    const ci = Math.floor((q.x - x0) / cell);
    const cj = Math.floor((q.y - y0) / cell);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= Math.max(nx, ny); r++) {
      // once a candidate is closer than this ring of cells can be, stop
      if (best >= 0 && (r - 1) * cell > bestD) break;
      for (let j = cj - r; j <= cj + r; j++)
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= nx || j >= ny) continue;
          for (const id of grid.get(keyOf(i, j)) ?? []) {
            const d = Math.hypot(pts[id]!.x - q.x, pts[id]!.y - q.y);
            if (d < bestD) {
              bestD = d;
              best = id;
            }
          }
        }
    }
    return best >= 0 ? best : 0;
  };
  for (const h0 of valid) {
    const h = orient(h0, false);
    const v = nearest(h[0]!);
    const after = next[v]!;
    const first = pts.length;
    for (let k = 0; k < h.length; k++) {
      pts.push(h[k]!);
      next.push(pts.length);
      index(pts.length - 1);
    }
    // back to the hole's first point, then to a copy of v, then on along the ring
    pts.push({ ...h[0]! });
    next.push(pts.length);
    pts.push({ ...pts[v]! });
    next.push(after);
    next[v] = first;
  }
  const out: Vec2[] = [];
  let id = 0;
  for (let guard = 0; guard < pts.length; guard++) {
    out.push(pts[id]!);
    id = next[id]!;
    if (id === 0) break;
  }
  return out;
}

/** Ring with the requested winding (counter-clockwise in a y-down frame for ccw = true). */
function orient(r: Vec2[], ccw: boolean): Vec2[] {
  const a = signedArea(r);
  return (a > 0) === ccw ? r : [...r].reverse();
}

