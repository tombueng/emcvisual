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
import { keyhole } from './builder';

export type Obstacle =
  | { kind: 'seg'; a: Vec2; b: Vec2; r: number }
  | { kind: 'circle'; c: Vec2; r: number }
  | { kind: 'poly'; ring: Vec2[]; r: number };

export interface PourInput {
  outline: Vec2[];
  /** Copper of other nets (with their clearance added to r) and cut-outs. */
  obstacles: Obstacle[];
  /** Board edge rings and the clearance to keep from them. */
  edges?: { rings: Vec2[][]; clearance: number };
  /** Points of the pour's own net (pads, vias, track ends); islands without one are removed. Undefined: keep all. */
  anchors?: Vec2[];
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
    else if (o.ring.length > 2) {
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
