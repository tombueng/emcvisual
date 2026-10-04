/**
 * Stage 3 results from tools/openems/run_job.py (*.fullwave.bin): |H|² per A² of port current
 * on the app's grid, per source and dumped frequency, plus far field and input impedance.
 *
 * File: 8 bytes "PCBFW1\0\0", uint32 header length, JSON header (padded to 4 bytes), then
 * int16 blocks of centi-dB (−32768 = no value), source-major then frequency, each laid out like
 * the app's volumes (index = ix + nx·(iy + ny·iz)).
 */
import type { Grid } from '../compute/grid';
import type { Selection } from '../compute/composer';
import type { Line } from '../physics/spectrum';

export const FULLWAVE_RESULT_KIND = 'pcb-field-fullwave-result';
const MAGIC = 'PCBFW1';
export const NO_VALUE = -32768;

export interface FullwaveSourceMeta {
  id: string;
  name: string;
  seconds: number;
  /** Strongest far field at 3 m (×2 for ground reflection) per ampere of port current, V/m per A. */
  farE3mPerA: number[];
  /** Input impedance at the port per frequency, [re, im] Ω. */
  zin: [number, number][];
}

export interface FullwaveResult {
  kind: typeof FULLWAVE_RESULT_KIND;
  version: 1;
  createdAt: string;
  board: { fileName: string; hash: string };
  grid: Grid;
  freqs: number[];
  sources: FullwaveSourceMeta[];
  skipped: { id: string; name: string; reason: string }[];
  solver: { name: string; res: number; seconds: number };
  /** Per source id: one block per frequency. */
  blocks: Map<string, Int16Array[]>;
}

export function parseFullwave(buf: ArrayBuffer): FullwaveResult {
  const bytes = new Uint8Array(buf);
  if (new TextDecoder().decode(bytes.subarray(0, 6)) !== MAGIC) throw new Error('not-fullwave');
  const view = new DataView(buf);
  const headLen = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headLen))) as Omit<FullwaveResult, 'blocks'>;
  if (header.kind !== FULLWAVE_RESULT_KIND) throw new Error('wrong-kind');
  const g = header.grid;
  const n = g.nx * g.ny * g.nz;
  let off = 12 + headLen;
  const need = off + header.sources.length * header.freqs.length * n * 2;
  if (buf.byteLength < need) throw new Error('truncated');
  const blocks = new Map<string, Int16Array[]>();
  for (const s of header.sources) {
    const list: Int16Array[] = [];
    for (let k = 0; k < header.freqs.length; k++) {
      // copy: the offset may not be 2-byte aligned relative to the buffer start in all cases
      list.push(new Int16Array(buf.slice(off, off + n * 2)));
      off += n * 2;
    }
    blocks.set(s.id, list);
  }
  return { ...header, blocks };
}

/** Same grid as the app's (the result is only valid for the grid it was computed on). */
export function sameGrid(a: Grid, b: Grid): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6 * Math.max(1, Math.abs(x));
  return a.nx === b.nx && a.ny === b.ny && a.nz === b.nz && close(a.x0, b.x0) && close(a.y0, b.y0) && close(a.z0, b.z0) && close(a.dx, b.dx);
}

/** centi-dB → linear |h|², shared lookup table (65536 floats). */
let lut: Float32Array | null = null;
export function decodeTable(): Float32Array {
  if (lut) return lut;
  lut = new Float32Array(65536);
  for (let v = -32768; v < 32768; v++) lut[v + 32768] = v === NO_VALUE ? 0 : 10 ** (v / 1000);
  return lut;
}

/**
 * Weights per dumped frequency for a line spectrum: each line's |I|² is split between the two
 * neighbouring dump frequencies (linear in log f); below the first and above the last the
 * nearest one is used (the pattern hardly changes in the quasi-static range).
 */
export function frequencyWeights(freqs: number[], lines: Line[], sel: Selection): number[] {
  const w = new Array<number>(freqs.length).fill(0);
  const lf = freqs.map((f) => Math.log(f));
  for (const l of lines) {
    if (sel.mode === 'band' && !(l.f >= sel.f0 && l.f < sel.f1)) continue;
    if (sel.mode === 'line' && !(Math.abs(l.f - sel.f) <= Math.max(1, sel.f * 1e-6))) continue;
    const p = l.amp * l.amp;
    if (!(p > 0)) continue;
    if (l.f <= freqs[0]!) {
      w[0]! += p;
      continue;
    }
    if (l.f >= freqs[freqs.length - 1]!) {
      w[freqs.length - 1]! += p;
      continue;
    }
    const x = Math.log(l.f);
    let k = 0;
    while (k < lf.length - 2 && lf[k + 1]! < x) k++;
    const t = (x - lf[k]!) / (lf[k + 1]! - lf[k]!);
    w[k]! += p * (1 - t);
    w[k + 1]! += p * t;
  }
  return w;
}

/** |h|² per A² of one source at one grid index for each dumped frequency. */
export function pointValues(r: FullwaveResult, id: string, idx: number): number[] {
  const t = decodeTable();
  return (r.blocks.get(id) ?? []).map((b) => t[b[idx]! + 32768]!);
}

/** Interpolated |h|² per A² of a source at frequency f (linear in log f, clamped at the ends). */
export function valueAtFrequency(freqs: number[], values: number[], f: number): number {
  if (f <= freqs[0]!) return values[0]!;
  if (f >= freqs[freqs.length - 1]!) return values[values.length - 1]!;
  let k = 0;
  while (k < freqs.length - 2 && freqs[k + 1]! < f) k++;
  const t = Math.log(f / freqs[k]!) / Math.log(freqs[k + 1]! / freqs[k]!);
  return values[k]! * (1 - t) + values[k + 1]! * t;
}

/** Trilinear weights of a world point on a grid; null outside. */
function cornerWeights(g: Grid, x: number, y: number, z: number): { idx: number[]; w: number[] } | null {
  const fx = (x - g.x0) / g.dx;
  const fy = (y - g.y0) / g.dy;
  const fz = (z - g.z0) / g.dz;
  if (fx < 0 || fy < 0 || fz < 0 || fx > g.nx - 1 || fy > g.ny - 1 || fz > g.nz - 1) return null;
  const ix = Math.min(Math.floor(fx), g.nx - 2);
  const iy = Math.min(Math.floor(fy), g.ny - 2);
  const iz = Math.min(Math.floor(fz), g.nz - 2);
  const tx = fx - ix;
  const ty = fy - iy;
  const tz = fz - iz;
  const idx: number[] = [];
  const w: number[] = [];
  for (let c = 0; c < 8; c++) {
    const dx = c & 1;
    const dy = (c >> 1) & 1;
    const dz = (c >> 2) & 1;
    idx.push(Math.max(0, ix + dx) + g.nx * (Math.max(0, iy + dy) + g.ny * Math.max(0, iz + dz)));
    w.push((dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz));
  }
  return { idx, w };
}

/** |h|² per A² of one source at a world point, per dumped frequency (0 outside the grid). */
export function sampleAt(r: FullwaveResult, blocks: Int16Array[], g: Grid, x: number, y: number, z: number): number[] {
  const t = decodeTable();
  const cw = cornerWeights(g, x, y, z);
  return blocks.map((b) => {
    if (!cw) return 0;
    let s = 0;
    for (let c = 0; c < 8; c++) s += cw.w[c]! * t[b[cw.idx[c]!]! + 32768]!;
    return s;
  });
}

/** The result's blocks on another grid (other quality setting): trilinear in linear |h|². */
export function resampleBlocks(r: FullwaveResult, g: Grid): Map<string, Int16Array[]> {
  if (sameGrid(r.grid, g)) return r.blocks;
  const n = g.nx * g.ny * g.nz;
  const out = new Map<string, Int16Array[]>();
  const corners: ({ idx: number[]; w: number[] } | null)[] = new Array(n);
  for (let iz = 0; iz < g.nz; iz++)
    for (let iy = 0; iy < g.ny; iy++)
      for (let ix = 0; ix < g.nx; ix++)
        corners[ix + g.nx * (iy + g.ny * iz)] = cornerWeights(r.grid, g.x0 + ix * g.dx, g.y0 + iy * g.dy, g.z0 + iz * g.dz);
  const t = decodeTable();
  for (const [id, list] of r.blocks)
    out.set(
      id,
      list.map((b) => {
        const o = new Int16Array(n).fill(NO_VALUE);
        for (let i = 0; i < n; i++) {
          const cw = corners[i];
          if (!cw) continue;
          let s = 0;
          for (let c = 0; c < 8; c++) s += cw.w[c]! * t[b[cw.idx[c]!]! + 32768]!;
          if (s > 0) o[i] = Math.max(-32767, Math.min(32767, Math.round(1000 * Math.log10(s))));
        }
        return o;
      }),
    );
  return out;
}

/** Σ_k w_k·|h_k|² over the dumped frequencies: one source's |h|² volume for a selection. */
export function fullwaveVolume(blocks: Int16Array[], w: number[], n: number): Float32Array {
  const t = decodeTable();
  const out = new Float32Array(n);
  blocks.forEach((b, k) => {
    const wk = w[k] ?? 0;
    if (!(wk > 0)) return;
    for (let i = 0; i < n; i++) out[i] = out[i]! + wk * t[b[i]! + 32768]!;
  });
  return out;
}
