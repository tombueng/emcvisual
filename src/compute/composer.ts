/**
 * Combine per-source |h|² volumes with spectral weights (docs/stufe-1/PHYSIK.md §6) and
 * convert to an 8-bit volume of normalised dBµA/m for the 3D texture.
 */
import { lineAmp } from '../physics/spectrum';
import type { Line } from '../physics/spectrum';

/** Dynamic range stored in the texture below the maximum, dB. */
export const TEXTURE_RANGE_DB = 100;

export interface Composite {
  /** Normalised dB, 0 = max − TEXTURE_RANGE_DB, 255 = max. */
  bytes: Uint8Array;
  maxDb: number;
  minDb: number;
  /** |H|² in (A/m)², kept for readouts. */
  power: Float32Array;
}

export type Selection = { mode: 'all' } | { mode: 'band'; f0: number; f1: number } | { mode: 'line'; f: number };

/** Weight of a source for a selection: Σ |I_k|² over the selected lines. */
export function selectionWeight(lines: Line[], sel: Selection): number {
  let w = 0;
  for (const l of lines) {
    if (sel.mode === 'all') w += l.amp * l.amp;
    else if (sel.mode === 'band') {
      if (l.f >= sel.f0 && l.f < sel.f1) w += l.amp * l.amp;
    } else if (Math.abs(l.f - sel.f) <= Math.max(1, sel.f * 1e-6)) w += lineAmp(l) ** 2;
  }
  return w;
}

export function compose(volumes: Float32Array[], weights: number[], n: number, reuse?: Composite): Composite {
  const power = reuse?.power.length === n ? reuse.power : new Float32Array(n);
  power.fill(0);
  volumes.forEach((v, s) => {
    const w = weights[s] ?? 0;
    if (!(w > 0)) return;
    for (let i = 0; i < n; i++) power[i] = power[i]! + w * v[i]!;
  });
  let max = 0;
  for (let i = 0; i < n; i++) if (power[i]! > max) max = power[i]!;
  const maxDb = max > 0 ? 10 * Math.log10(max) + 120 : 0;
  const minDb = maxDb - TEXTURE_RANGE_DB;
  const bytes = reuse?.bytes.length === n ? reuse.bytes : new Uint8Array(n);
  if (max <= 0) {
    bytes.fill(0);
    return { bytes, maxDb: 0, minDb: -TEXTURE_RANGE_DB, power };
  }
  const k = 255 / TEXTURE_RANGE_DB;
  for (let i = 0; i < n; i++) {
    const p = power[i]!;
    if (p <= 0) {
      bytes[i] = 0;
      continue;
    }
    const db = 10 * Math.log10(p) + 120;
    const v = (db - minDb) * k;
    bytes[i] = v <= 0 ? 0 : v >= 255 ? 255 : v;
  }
  return { bytes, maxDb, minDb, power };
}
