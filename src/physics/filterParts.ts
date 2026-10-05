/**
 * Series filter parts read from reference, library and value field: ferrite beads (impedance at
 * 100 MHz) and inductors (inductance). Used by the filter rules (layoutRules.ts, supplyNoise.ts).
 */
import type { Footprint } from '../model/types';

/** A ferrite bead without a readable value: the common 600 Ω at 100 MHz. */
export const FERRITE_DEFAULT = 600;

export interface FilterPart {
  /** Ferrite: impedance at 100 MHz, Ω. Inductor: inductance, H. */
  ohms?: number;
  henry?: number;
  /** The value could not be read; a typical one is assumed. */
  assumed: boolean;
}

const SI: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1 };

/**
 * A series filter part from reference, library and value: ferrite beads ("600R@100MHz",
 * "BLM18PG221SN1" = 220 Ω, or FB without a value: 600 Ω assumed) and inductors ("10uH").
 * Parts whose value says nothing are left out unless they are named as ferrites.
 */
export function filterPart(fp: Footprint): FilterPart | null {
  const v = fp.value.replace(',', '.');
  const isFb = /^FB\d/i.test(fp.ref) || /ferrite|bead/i.test(fp.lib) || /ferrite|ferret|bead|^FB|BLM\d|MPZ\d/i.test(v);
  if (!isFb && !/^L\d/i.test(fp.ref)) return null;
  // "600R", "600R@100MHz", "600 Ω": an impedance (not "2R2", which is 2.2 µH on inductors)
  const ohm = /(\d+(?:\.\d+)?)\s*(?:R|Ω|ohms?)(?![a-z0-9])/i.exec(v);
  if (ohm) return { ohms: Number(ohm[1]), assumed: false };
  const murata = /BLM\d{2}[A-Z]{2}(\d)(\d)(\d)/i.exec(v);
  if (murata) return { ohms: Number(murata[1]! + murata[2]!) * 10 ** Number(murata[3]!), assumed: false };
  if (!isFb) {
    // "10uH", "4.7 µH", "10u" and "4u7"
    const h = /(\d+(?:\.\d+)?)\s*([pnuµμm]?)H(?![a-z])/i.exec(v) ?? /^(\d+(?:\.\d+)?)\s*([pnuµμ])$/i.exec(v.trim());
    if (h) return { henry: Number(h[1]) * (SI[h[2]!.toLowerCase()] ?? 1), assumed: false };
    const mid = /^(\d+)([pnuµμ])(\d+)$/i.exec(v.trim());
    if (mid) return { henry: Number(`${mid[1]}.${mid[3]}`) * (SI[mid[2]!.toLowerCase()] ?? 1), assumed: false };
    return null;
  }
  return { ohms: FERRITE_DEFAULT, assumed: true };
}
