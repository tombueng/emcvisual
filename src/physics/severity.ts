/**
 * How serious a finding is, as one number from 0 (green: a source of emission, but nothing
 * stands out) to 1 (red: this decides whether the board passes). Two things count: how close
 * the source's strongest line comes to the limit at 3 m, and how much of that this finding
 * causes (its far-field gain when fixed). A small cause on a failing source is still worth a
 * look; a big cause on a quiet source is not urgent.
 */
import type { DiagnosticKind } from './diagnostics';

export type SeverityLevel = 'critical' | 'check' | 'minor';

export interface Severity {
  /** 0 … 1 */
  score: number;
  level: SeverityLevel;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const level = (score: number): SeverityLevel => (score >= 0.6 ? 'critical' : score >= 0.3 ? 'check' : 'minor');

/** 0 at 20 dB or more below the limit, 1 at or over the limit. */
export function marginScore(margin: number | null): number {
  return margin === null ? 0.3 : clamp((margin + 20) / 20, 0, 1);
}

/**
 * A hot loop is rated by its area (`value`, mm²): 20 mm² is about the smallest the parts allow,
 * 40 mm² should be looked at, from 80 mm² it is serious. Its far field is often not
 * quantifiable (a flat loop over a solid plane cancels its own dipole in the model), so the
 * area counts on its own; a known far-field margin can only raise the rating.
 */
/**
 * Severity of a diagnostic: the cable common-mode finding is rated by its own estimate, all
 * others by the source's differential-mode margin.
 */
export function severityOf(
  d: { kind: DiagnosticKind; value: number; gain?: { db: number }; cm?: { worst: { margin: number } | null }; io?: { worst: { margin: number } | null } },
  sourceMargin: number | null,
): Severity {
  return findingSeverity(marginOf(d, sourceMargin), d.gain?.db ?? null, d.kind, d.value);
}

/** The margin that counts for a diagnostic (see severityOf). */
export function marginOf(
  d: { kind: DiagnosticKind; cm?: { worst: { margin: number } | null }; io?: { worst: { margin: number } | null } },
  sourceMargin: number | null,
): number | null {
  if (d.kind === 'cable-cm') return d.cm?.worst?.margin ?? null;
  if (d.kind === 'io-coupling') return d.io?.worst?.margin ?? null;
  return sourceMargin;
}

/**
 * Board rules (layoutRules.ts): a floating connector shield is a well documented cause of
 * failures (high), the others are worth a look; none of them is quantified.
 */
/** supply-noise: red from this many dB over the conducted yardstick (same as supplyNoise.ts). */
const SUPPLY_RED_DB = 20;

const RULE_SCORE = {
  'shield-open': 0.65,
  'shield-weak': 0.45,
  'filter-far': 0.45,
  'filter-ground': 0.4,
  decoupling: 0.4,
  'crystal-placement': 0.4,
  'crystal-under': 0.45,
  'sw-node': 0.45,
  'floating-copper': 0.35,
  'heatsink-floating': 0.45,
  'ferrite-ground': 0.4,
  'pair-skew': 0.4,
  'connector-ground': 0.45,
  'inductor-placement': 0.4,
  'filter-bypass': 0.45,
} as const;

/**
 * The cable estimates (commonMode.ts, ioCoupling.ts) assume a resonant cable at every frequency
 * and add up phases; their sources call the result rather too high. For the rating they count
 * this many dB lower: red from about 6 dB over the limit, yellow from about 6 dB below.
 */
export const WORST_CASE = 6;

/** Below this far-field margin (dB) a gap under the source is left to the normal rating. */
export const GAP_RELEVANT = -15;

export function hotLoopScore(area: number): number {
  return clamp(Math.log10(area / 20), 0, 1);
}

export function findingSeverity(margin: number | null, gain: number | null, kind: DiagnosticKind, value?: number): Severity {
  // share of the problem: full from 6 dB gain on; unquantified hints in between
  const share = gain !== null ? clamp(gain / 6, 0.15, 1) : kind === 'long-line' ? 0.3 : 0.4;
  // worst-case estimates (resonant cable at every frequency) count from WORST_CASE dB over the limit
  const m = margin !== null && (kind === 'cable-cm' || kind === 'io-coupling') ? margin - WORST_CASE : margin;
  let score = marginScore(m) * (0.35 + 0.65 * share);
  if (kind === 'hot-loop' && value !== undefined) score = Math.max(score, hotLoopScore(value));
  // a computed effect of practically nothing (detours that cancel, a capacitor right there)
  if (gain !== null && gain < 0.5 && (kind === 'ref-change' || kind === 'no-stitching')) score = Math.min(score, 0.25);
  // board rules have no margin of their own: a fixed priority per rule
  if (kind in RULE_SCORE) score = RULE_SCORE[kind as keyof typeof RULE_SCORE];
  // a filter bypassed already below 100 MHz no longer works in the range where cables radiate most
  if (kind === 'filter-bypass' && value !== undefined && value <= 1e8) score = 0.6;
  // switching current on the supply cable: computed against a yardstick, red from 20 dB over it
  if (kind === 'supply-noise') score = value !== undefined && value >= SUPPLY_RED_DB ? 0.6 : 0.45;
  // a gap in the return plane under a source with spectrum in the measured range: the voltage
  // across the gap drives the plane halves and cables against each other (common mode), which
  // the differential-mode figures do not contain. The literature treats it as one of the most
  // common reasons for failed tests (LearnEMC: "Don't split, gap or cut the signal return
  // plane"), so it is at least high priority.
  if (kind === 'return-gap' && margin !== null && margin > GAP_RELEVANT) score = Math.max(score, 0.6);
  return { score, level: level(score) };
}

export function sourceSeverity(margin: number | null): Severity {
  const score = marginScore(margin);
  return { score, level: level(score) };
}

/** Green (0) → yellow (0.5) → red (1). */
export function severityColor(score: number): string {
  return `hsl(${Math.round(120 * (1 - clamp(score, 0, 1)))} 78% 52%)`;
}
