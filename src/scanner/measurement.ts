/**
 * Measurements: background subtraction, conversion to field strength via the probe model,
 * reduction to a frequency selection (line / band / all, like the simulation view), slices
 * for display, and the file format (JSON, neutral "kind").
 */
import type { Selection } from '../compute/composer';
import { dbmToFieldDb } from './probe';
import { MEASUREMENT_KIND, type Measurement, type MeasuredPoint } from './types';

const inSel = (f: number, sel: Selection) =>
  sel.mode === 'all' ? true : sel.mode === 'band' ? f >= sel.f0 && f < sel.f1 : Math.abs(f - sel.f) <= Math.max(1, sel.f * 1e-3);

/**
 * Field power of one point over the selected bins, in dB(µA/m) or dB(µV/m); bins at the
 * noise floor still add a little, as on a real analyzer. With a background the measured power
 * minus the background power is used (clamped at a tenth of the background).
 */
export function pointFieldDb(m: Measurement, idx: number, sel: Selection, useBackground: boolean): number {
  return pointField(m, idx, sel, useBackground).db;
}

/** As pointFieldDb, plus whether the selected bins are within 3 dB of the background. */
function pointField(m: Measurement, idx: number, sel: Selection, useBackground: boolean): { db: number; nearNoise: boolean } {
  const p = m.points[idx]!;
  const bg = useBackground && m.background ? m.background[idx] : undefined;
  let sum = 0;
  let rawMw = 0;
  let bgMw = 0;
  for (let j = 0; j < m.freqs.length; j++) {
    const f = m.freqs[j]!;
    if (!inSel(f, sel) || !(f > 0)) continue;
    let mw = 10 ** (p.dbm[j]! / 10);
    rawMw += mw;
    if (bg) {
      const b = 10 ** (bg.dbm[j]! / 10);
      bgMw += b;
      mw = Math.max(mw - b, 0.1 * b);
    }
    const fieldDb = dbmToFieldDb(m.probe.kind, m.probe.radiusMm, f, 10 * Math.log10(mw)) + m.probe.factorDb;
    sum += 10 ** (fieldDb / 10);
  }
  return { db: sum > 0 ? 10 * Math.log10(sum) : NaN, nearNoise: bgMw > 0 && rawMw < 2 * bgMw };
}

export interface Slice {
  layer: number;
  height: number;
  /** Row-major nx·ny values (NaN = not measured). */
  values: Float32Array;
  /** 1 where the point is within 3 dB of the background (only with a background run). */
  nearNoise: Uint8Array;
}

export function slices(m: Measurement, sel: Selection, useBackground = true): Slice[] {
  const { nx, ny, heights } = m.grid;
  const out: Slice[] = heights.map((h, layer) => ({
    layer,
    height: h,
    values: new Float32Array(nx * ny).fill(NaN),
    nearNoise: new Uint8Array(nx * ny),
  }));
  m.points.forEach((p, i) => {
    const s = out[p.layer];
    if (!s) return;
    const v = pointField(m, i, sel, useBackground);
    s.values[p.iy * nx + p.ix] = v.db;
    s.nearNoise[p.iy * nx + p.ix] = v.nearNoise ? 1 : 0;
  });
  return out;
}

// --- file format --------------------------------------------------------------------------------

type JsonPoint = Omit<MeasuredPoint, 'dbm'> & { dbm: number[] };

export function measurementToJson(m: Measurement): string {
  const pts = (list: MeasuredPoint[]) => list.map((p) => ({ ...p, dbm: Array.from(p.dbm, (v) => Math.round(v * 100) / 100) }));
  return JSON.stringify({ ...m, points: pts(m.points), background: m.background ? pts(m.background) : undefined });
}

export function measurementFromJson(text: string): Measurement {
  const o = JSON.parse(text) as Omit<Measurement, 'points' | 'background'> & { points: JsonPoint[]; background?: JsonPoint[] };
  if (o.kind !== MEASUREMENT_KIND) throw new Error('wrong-kind');
  const pts = (list: JsonPoint[]) => list.map((p) => ({ ...p, dbm: Float32Array.from(p.dbm) }));
  return { ...o, points: pts(o.points), background: o.background ? pts(o.background) : undefined };
}
