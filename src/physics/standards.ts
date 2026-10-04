/**
 * Radiated-emission limits of the standards the far-field estimate can be compared with.
 * Values in dBµV/m (quasi-peak below 1 GHz, average above), as tabulated by the standards;
 * a distance a standard does not tabulate is converted with 20 dB per decade (1/r), the
 * extrapolation the standards themselves use. Explanations are in the dictionaries
 * (i18n `standards`).
 *
 * Sources: CISPR 32 / EN 55032 tables (class A/B, 3 m and 10 m, above 1 GHz at 3 m);
 * 47 CFR §15.109 (FCC class B at 3 m, class A at 10 m, µV/m); CISPR 11 group 1 and
 * CISPR 14-1 (30 MHz–1 GHz at 10 m, the same values as CISPR 32 class B / A).
 */
import type { LimitSegment } from './farfield';

export type StandardId = 'cispr32-b' | 'cispr32-a' | 'fcc15-b' | 'fcc15-a' | 'cispr11-b' | 'cispr11-a' | 'cispr14';

export interface EmissionStandard {
  id: StandardId;
  /** Tables by measurement distance (m). */
  tables: Partial<Record<3 | 10, LimitSegment[]>>;
}

const uvm = (v: number) => Math.round(20 * Math.log10(v) * 10) / 10;

export const STANDARDS: EmissionStandard[] = [
  {
    id: 'cispr32-b',
    tables: {
      3: [
        { f0: 30e6, f1: 230e6, db: 40 },
        { f0: 230e6, f1: 1e9, db: 47 },
        { f0: 1e9, f1: 3e9, db: 50 },
        { f0: 3e9, f1: 6e9, db: 54 },
      ],
      10: [
        { f0: 30e6, f1: 230e6, db: 30 },
        { f0: 230e6, f1: 1e9, db: 37 },
      ],
    },
  },
  {
    id: 'cispr32-a',
    tables: {
      3: [
        { f0: 30e6, f1: 230e6, db: 50 },
        { f0: 230e6, f1: 1e9, db: 57 },
        { f0: 1e9, f1: 3e9, db: 56 },
        { f0: 3e9, f1: 6e9, db: 60 },
      ],
      10: [
        { f0: 30e6, f1: 230e6, db: 40 },
        { f0: 230e6, f1: 1e9, db: 47 },
      ],
    },
  },
  {
    id: 'fcc15-b',
    tables: {
      3: [
        { f0: 30e6, f1: 88e6, db: uvm(100) },
        { f0: 88e6, f1: 216e6, db: uvm(150) },
        { f0: 216e6, f1: 960e6, db: uvm(200) },
        { f0: 960e6, f1: 6e9, db: uvm(500) },
      ],
    },
  },
  {
    id: 'fcc15-a',
    tables: {
      10: [
        { f0: 30e6, f1: 88e6, db: uvm(90) },
        { f0: 88e6, f1: 216e6, db: uvm(150) },
        { f0: 216e6, f1: 960e6, db: uvm(210) },
        { f0: 960e6, f1: 6e9, db: uvm(300) },
      ],
    },
  },
  {
    id: 'cispr11-b',
    tables: {
      10: [
        { f0: 30e6, f1: 230e6, db: 30 },
        { f0: 230e6, f1: 1e9, db: 37 },
      ],
      3: [
        { f0: 30e6, f1: 230e6, db: 40 },
        { f0: 230e6, f1: 1e9, db: 47 },
      ],
    },
  },
  {
    id: 'cispr11-a',
    tables: {
      10: [
        { f0: 30e6, f1: 230e6, db: 40 },
        { f0: 230e6, f1: 1e9, db: 47 },
      ],
    },
  },
  {
    id: 'cispr14',
    tables: {
      10: [
        { f0: 30e6, f1: 230e6, db: 30 },
        { f0: 230e6, f1: 1e9, db: 37 },
      ],
    },
  },
];

export const DEFAULT_STANDARD: StandardId = 'cispr32-b';

export function standardById(id: string): EmissionStandard {
  return STANDARDS.find((s) => s.id === id) ?? STANDARDS[0]!;
}

/** Limits of a standard at a distance; converted with 20 dB/decade when not tabulated there. */
export function limitsFor(id: string, distance: 3 | 10): LimitSegment[] {
  const st = standardById(id);
  const own = st.tables[distance];
  if (own) return own;
  const [d, table] = Object.entries(st.tables)[0]! as unknown as [string, LimitSegment[]];
  const shift = 20 * Math.log10(Number(d) / distance);
  return table.map((s) => ({ ...s, db: Math.round((s.db + shift) * 10) / 10 }));
}

/** The distance a standard specifies first (for the label). */
export function specDistance(id: string): 3 | 10 {
  const st = standardById(id);
  return st.tables[3] ? 3 : 10;
}
