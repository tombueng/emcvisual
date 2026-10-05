/**
 * Far-field orientation from the magnetic dipole moment (docs/stage-1/PHYSICS.md §11).
 * E = 2 · η0 k² |m| / (4π r): free-space broadside field doubled for a reflecting test-site
 * floor (Ott, eq. 12-2). Differential mode of the board only; cables are not modelled.
 */
import { packWithImages, STRIDE, type ElementPack } from './images';
import type { CurrentElement } from './currents';
import type { PlaneLayer } from '../model/planes';
import type { WorldFrame } from '../model/world';
import { lineAmp, type Line } from './spectrum';

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

/**
 * Dipole moment for the far field, A·m² per A: the return current in the planes themselves
 * (images.ts, imageAt 'plane'), not at the mirror depth used for the near field.
 */
export function farMoment(elements: CurrentElement[], planes: PlaneLayer[], frame: WorldFrame): [number, number, number] {
  return dipoleMoment(packWithImages(elements, planes, frame, { imageAt: 'plane' }));
}

/**
 * A flat current loop right over a solid plane: the mirror current cancels the loop's dipole
 * moment in the model (to below a tenth of the loop's own area). The far-field number is then
 * false precision; real emission goes through mechanisms the model lacks (ringing, the switch
 * node's electric field, cables, plane edges).
 */
export function dipoleCompensated(loopAreaMm2: readonly number[] | undefined, moment: readonly number[]): boolean {
  if (!loopAreaMm2) return false;
  const a = Math.hypot(...loopAreaMm2);
  return a > 1 && Math.hypot(...moment) * 1e6 < 0.1 * a;
}

export interface FarLine {
  f: number;
  /** dBµV/m at the given distance. */
  db: number;
}

/**
 * E field of a small magnetic dipole broadside at distance r. Besides the radiating 1/r term it
 * keeps the induction term: |E| ∝ k²·√(1 + 1/(k·r)²). At 3 m that adds 2.1 dB at 20 MHz,
 * 1.1 dB at 30 MHz and fades above 50 MHz; without it the estimate fell below openEMS at the
 * low end (tools/fullwave/validate-loop.ts).
 */
export function farField(moment: [number, number, number], lines: Line[], r: number, groundReflection = true): FarLine[] {
  const m = Math.hypot(...moment);
  const k = (groundReflection ? 2 : 1) * K_DIPOLE;
  const near = (f: number) => {
    const kr = (2 * Math.PI * f * r) / 299_792_458;
    return Math.sqrt(1 + 1 / (kr * kr));
  };
  return lines
    // each harmonic on its own, as the receiver sees it (not the band-power scaled amplitude)
    .map((l) => ({ f: l.f, e: (k * l.f * l.f * m * lineAmp(l) * near(l.f)) / r }))
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

/**
 * Limit at a frequency. At a step between two segments the standards apply the tighter value
 * (CISPR 32 annex A, CISPR 11 §6.1, 47 CFR §15.109), so a line on 230 MHz or 1 GHz is
 * compared with the lower one.
 */
export function limitAt(limits: LimitSegment[], f: number): number | null {
  let best: number | null = null;
  for (const x of limits) if (f >= x.f0 && f <= x.f1 && (best === null || x.db < best)) best = x.db;
  return best;
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
