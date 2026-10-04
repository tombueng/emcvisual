/**
 * Probe conversions between received power and field strength.
 * H loop of radius a: U = 2π f µ0 π a² H (open-circuit EMF, into 50 Ω as a first approximation).
 * E stub with effective height he: U = E · he.
 * dBm into 50 Ω: P = U²/50 → dBm = 20·log10(U) + 13.01.
 */
import { MU0 } from '../physics/units';

const DBM_OF_1V = 10 * Math.log10(1 / 50 / 1e-3); // 13.01

export type ProbeKind = 'h-loop' | 'e-stub';

/** dB from field (dBµA/m or dBµV/m) to probe output (dBm) at frequency f. */
export function fieldToDbmOffset(kind: ProbeKind, sizeMm: number, f: number): number {
  const k = kind === 'h-loop' ? 2 * Math.PI * f * MU0 * Math.PI * (sizeMm / 1000) ** 2 : sizeMm / 1000;
  return 20 * Math.log10(k) + DBM_OF_1V - 120;
}

export function fieldDbToDbm(kind: ProbeKind, sizeMm: number, f: number, fieldDb: number): number {
  return fieldDb + fieldToDbmOffset(kind, sizeMm, f);
}

export function dbmToFieldDb(kind: ProbeKind, sizeMm: number, f: number, dbm: number): number {
  return dbm - fieldToDbmOffset(kind, sizeMm, f);
}
