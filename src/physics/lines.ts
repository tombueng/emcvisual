/** Transmission line parameters (docs/stage-1/PHYSICS.md §4). Lengths in mm. */
import { C0 } from './units';

export interface LineParams {
  z0: number;
  eeff: number;
  /** Capacitance per metre, F/m. */
  cPerM: number;
  /** Inductance per metre, H/m. */
  lPerM: number;
}

/** Microstrip, Hammerstad/Jensen simplified. w and h in the same unit. */
export function microstrip(w: number, h: number, er: number): LineParams {
  const u = w / h;
  let eeff: number;
  let z0: number;
  if (u <= 1) {
    eeff = (er + 1) / 2 + ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 / u) + 0.04 * (1 - u) ** 2);
    z0 = (60 / Math.sqrt(eeff)) * Math.log(8 / u + u / 4);
  } else {
    eeff = (er + 1) / 2 + ((er - 1) / 2) / Math.sqrt(1 + 12 / u);
    z0 = (120 * Math.PI) / (Math.sqrt(eeff) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
  }
  return withPerLength(z0, eeff);
}

/** Symmetric stripline, IPC-2141. b = plane spacing, t = copper thickness. */
export function stripline(w: number, b: number, t: number, er: number): LineParams {
  const arg = (4 * b) / (0.67 * Math.PI * (0.8 * w + t));
  const z0 = arg > 1 ? (60 / Math.sqrt(er)) * Math.log(arg) : 10;
  return withPerLength(z0, er);
}

/** No reference plane: assume 50 pF/m and free-space-like velocity (a visible fallback). */
export function unreferenced(): LineParams {
  const cPerM = 50e-12;
  const eeff = 2.5;
  const z0 = Math.sqrt(eeff) / (C0 * cPerM);
  return withPerLength(z0, eeff);
}

function withPerLength(z0: number, eeff: number): LineParams {
  const cPerM = Math.sqrt(eeff) / (C0 * z0);
  const lPerM = (z0 * Math.sqrt(eeff)) / C0;
  return { z0, eeff, cPerM, lPerM };
}

/** Frequency up to which a line of length mm counts as electrically short (λ/10). */
export function shortLineLimit(lengthMm: number, eeff: number): number {
  if (lengthMm <= 0) return Infinity;
  return C0 / (10 * (lengthMm / 1000) * Math.sqrt(eeff));
}
