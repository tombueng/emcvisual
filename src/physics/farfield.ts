/**
 * Far-field orientation from the magnetic dipole moment (docs/stufe-1/PHYSIK.md §11).
 * E = 2 · η0 k² |m| / (4π r): free-space broadside field doubled for a reflecting test-site
 * floor (Ott, eq. 12-2). Differential mode of the board only; cables are not modelled.
 */
import { STRIDE, type ElementPack } from './images';
import type { Line } from './spectrum';

/** η0·(2π/c)²/(4π) in V/m per (A·m² · Hz² / m). */
export const K_DIPOLE = 1.316e-14;

/** Magnetic moment per ampere of the packed elements (real and images), A·m² per A. */
export function dipoleMoment(pack: ElementPack): [number, number, number] {
  let mx = 0;
  let my = 0;
  let mz = 0;
  const d = pack.data;
  for (let i = 0; i < pack.count; i++) {
    const o = i * STRIDE;
    const w = d[o + 6]!;
    const ax = d[o]!;
    const ay = d[o + 1]!;
    const az = d[o + 2]!;
    const bx = d[o + 3]!;
    const by = d[o + 4]!;
    const bz = d[o + 5]!;
    // ½ ∫ r × dl over a straight segment = ½ (A × B)
    mx += 0.5 * w * (ay * bz - az * by);
    my += 0.5 * w * (az * bx - ax * bz);
    mz += 0.5 * w * (ax * by - ay * bx);
  }
  return [mx * 1e-6, my * 1e-6, mz * 1e-6]; // mm² -> m²
}

export interface FarLine {
  f: number;
  /** dBµV/m at the given distance. */
  db: number;
}

export function farField(moment: [number, number, number], lines: Line[], r: number, groundReflection = true): FarLine[] {
  const m = Math.hypot(...moment);
  const k = (groundReflection ? 2 : 1) * K_DIPOLE;
  return lines
    .map((l) => ({ f: l.f, e: (k * l.f * l.f * m * l.amp) / r }))
    .filter((x) => x.e > 0)
    .map((x) => ({ f: x.f, db: 20 * Math.log10(x.e) + 120 }));
}

export interface LimitSegment {
  f0: number;
  f1: number;
  db: number;
}

/** CISPR 32 class B radiated emission limits (quasi-peak), 30–1000 MHz. */
export function cispr32ClassB(distance: 3 | 10): LimitSegment[] {
  return distance === 3
    ? [
        { f0: 30e6, f1: 230e6, db: 40 },
        { f0: 230e6, f1: 1e9, db: 47 },
      ]
    : [
        { f0: 30e6, f1: 230e6, db: 30 },
        { f0: 230e6, f1: 1e9, db: 37 },
      ];
}

export function limitAt(limits: LimitSegment[], f: number): number | null {
  const s = limits.find((x) => f >= x.f0 && f < x.f1);
  return s ? s.db : null;
}

/** Largest dimension of a pack's real extent (for the λ/4 validity marker), mm. */
export function extentMm(pack: ElementPack): number {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < pack.count; i++) {
    const o = i * STRIDE;
    for (const k of [0, 3]) {
      x0 = Math.min(x0, pack.data[o + k]!);
      x1 = Math.max(x1, pack.data[o + k]!);
      z0 = Math.min(z0, pack.data[o + k + 2]!);
      z1 = Math.max(z1, pack.data[o + k + 2]!);
    }
  }
  return Number.isFinite(x0) ? Math.max(x1 - x0, z1 - z0) : 0;
}
