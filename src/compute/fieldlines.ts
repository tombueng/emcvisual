/**
 * Field lines of one source by RK4 on the exact Biot-Savart direction (no grid), with plane
 * shielding. Pure, so it runs in a worker and in tests.
 */
import { fieldAt, slotMaskTable } from '../physics/biotsavart';
import { eFieldAt } from '../physics/efield';
import type { ElementPack } from '../physics/images';
import type { CoverageRaster } from '../model/planes';
import type { Vec3, WorldFrame } from '../model/world';

export interface LineTraceInput {
  pack: ElementPack;
  /** Plane rasters sorted top to bottom (same order as pack.planeY). */
  rasters: CoverageRaster[];
  frame: WorldFrame;
  seeds: Vec3[];
  min: Vec3;
  max: Vec3;
  step: number;
  maxSteps: number;
  /** H (default) or E field lines. */
  kind?: 'H' | 'E';
}

export interface TracedLines {
  /** xyz per vertex. */
  positions: Float32Array;
  /** |h| per vertex. */
  mags: Float32Array;
  /** cumulative length along each line per vertex (mm). */
  arc: Float32Array;
  /** start vertex of each line, plus the total vertex count at the end. */
  offsets: Int32Array;
}

function coverBits(rasters: CoverageRaster[], frame: WorldFrame, x: number, z: number): number {
  const bx = x + frame.ox;
  const by = z + frame.oy;
  let bits = 0;
  for (let i = 0; i < rasters.length; i++) {
    const r = rasters[i]!;
    const ix = Math.floor((bx - r.x0) / r.cell);
    const iy = Math.floor((by - r.y0) / r.cell);
    if (ix >= 0 && iy >= 0 && ix < r.nx && iy < r.ny && r.data[iy * r.nx + ix] === 1) bits |= 1 << i;
  }
  return bits;
}

export function traceFieldLines(inp: LineTraceInput): TracedLines {
  const masks = slotMaskTable(inp.pack.planeY.length);
  const h = new Float64Array(3);
  const at = inp.kind === 'E' ? eFieldAt : fieldAt;
  const field = (x: number, y: number, z: number): [number, number, number, number] => {
    at(inp.pack, masks, x, y, z, coverBits(inp.rasters, inp.frame, x, z), h);
    const m = Math.hypot(h[0]!, h[1]!, h[2]!);
    return [h[0]!, h[1]!, h[2]!, m];
  };
  const dir = (x: number, y: number, z: number, sign: number): [number, number, number] | null => {
    const [a, b, c, m] = field(x, y, z);
    if (!(m > 0)) return null;
    return [(sign * a) / m, (sign * b) / m, (sign * c) / m];
  };
  const inside = (p: Vec3) =>
    p[0] >= inp.min[0] && p[0] <= inp.max[0] && p[1] >= inp.min[1] && p[1] <= inp.max[1] && p[2] >= inp.min[2] && p[2] <= inp.max[2];

  const lines: { pts: number[]; mags: number[] }[] = [];
  for (const seed of inp.seeds) {
    const m0 = field(seed[0], seed[1], seed[2])[3];
    if (!(m0 > 0)) continue;
    const halves: number[][][] = [];
    const halvesMag: number[][] = [];
    let closed = false;
    for (const sign of [1, -1]) {
      const pts: number[][] = [];
      const mags: number[] = [];
      let p: Vec3 = [...seed];
      const ds = inp.step;
      for (let k = 0; k < inp.maxSteps; k++) {
        const k1 = dir(p[0], p[1], p[2], sign);
        if (!k1) break;
        const k2 = dir(p[0] + (k1[0] * ds) / 2, p[1] + (k1[1] * ds) / 2, p[2] + (k1[2] * ds) / 2, sign);
        if (!k2) break;
        const k3 = dir(p[0] + (k2[0] * ds) / 2, p[1] + (k2[1] * ds) / 2, p[2] + (k2[2] * ds) / 2, sign);
        if (!k3) break;
        const k4 = dir(p[0] + k3[0] * ds, p[1] + k3[1] * ds, p[2] + k3[2] * ds, sign);
        if (!k4) break;
        p = [
          p[0] + (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
          p[1] + (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
          p[2] + (ds / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
        ];
        if (!inside(p)) break;
        const m = field(p[0], p[1], p[2])[3];
        if (m < m0 * 1e-3) break;
        pts.push(p);
        mags.push(m);
        if (k > 20 && Math.hypot(p[0] - seed[0], p[1] - seed[1], p[2] - seed[2]) < ds * 0.75) {
          closed = true;
          break;
        }
      }
      halves.push(pts);
      halvesMag.push(mags);
      if (closed) break;
    }
    // join: reversed backward half, seed, forward half
    const back = (halves[1] ?? []).slice().reverse();
    const backMag = (halvesMag[1] ?? []).slice().reverse();
    const all = [...back, [...seed], ...(halves[0] ?? [])];
    const mags = [...backMag, m0, ...(halvesMag[0] ?? [])];
    if (closed) {
      all.push([...seed]);
      mags.push(m0);
    }
    if (all.length < 3) continue;
    lines.push({ pts: all.flat(), mags });
  }

  const nVert = lines.reduce((s, l) => s + l.mags.length, 0);
  const positions = new Float32Array(nVert * 3);
  const mags = new Float32Array(nVert);
  const arc = new Float32Array(nVert);
  const offsets = new Int32Array(lines.length + 1);
  let v = 0;
  lines.forEach((l, i) => {
    offsets[i] = v;
    let s = 0;
    for (let k = 0; k < l.mags.length; k++) {
      positions[(v + k) * 3] = l.pts[k * 3]!;
      positions[(v + k) * 3 + 1] = l.pts[k * 3 + 1]!;
      positions[(v + k) * 3 + 2] = l.pts[k * 3 + 2]!;
      if (k > 0) s += Math.hypot(l.pts[k * 3]! - l.pts[k * 3 - 3]!, l.pts[k * 3 + 1]! - l.pts[k * 3 - 2]!, l.pts[k * 3 + 2]! - l.pts[k * 3 - 1]!);
      arc[v + k] = s;
      mags[v + k] = l.mags[k]!;
    }
    v += l.mags.length;
  });
  offsets[lines.length] = v;
  return { positions, mags, arc, offsets };
}

/** Seeds above the strongest horizontal elements of a source (real elements only). */
export function seedsFor(pack: ElementPack, count = 6, heights = [0.35, 0.9, 1.8, 3.5]): Vec3[] {
  const items: { score: number; mid: Vec3 }[] = [];
  const d = pack.data;
  for (let i = 0; i < pack.count; i++) {
    const o = i * 8;
    const w = d[o + 6]!;
    if (w <= 0) continue; // images carry the negative weights of horizontal elements
    if (Math.abs(d[o + 1]! - d[o + 4]!) > 1e-6) continue;
    const len = Math.hypot(d[o + 3]! - d[o]!, d[o + 5]! - d[o + 2]!);
    // point charges (E packs) have no length: rank them by their charge
    items.push({ score: len > 0 ? w * len : w, mid: [(d[o]! + d[o + 3]!) / 2, d[o + 1]!, (d[o + 2]! + d[o + 5]!) / 2] });
  }
  items.sort((a, b) => b.score - a.score);
  const picked: Vec3[] = [];
  for (const it of items) {
    if (picked.some((p) => Math.hypot(p[0] - it.mid[0], p[2] - it.mid[2]) < 3)) continue;
    picked.push(it.mid);
    if (picked.length >= count) break;
  }
  return picked.flatMap((m) => heights.map((h) => [m[0], m[1] + h, m[2]] as Vec3));
}
