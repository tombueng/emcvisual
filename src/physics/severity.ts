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
export function hotLoopScore(area: number): number {
  return clamp(Math.log10(area / 20), 0, 1);
}

export function findingSeverity(margin: number | null, gain: number | null, kind: DiagnosticKind, value?: number): Severity {
  // share of the problem: full from 6 dB gain on; unquantified hints in between
  let share = gain !== null ? clamp(gain / 6, 0.15, 1) : kind === 'long-line' ? 0.3 : 0.4;
  // a gap under the return path also drives the plane halves and cables against each other
  // (common mode, not in the gain figure): at least a large share
  if (kind === 'return-gap') share = Math.max(share, 0.6);
  let score = marginScore(margin) * (0.35 + 0.65 * share);
  if (kind === 'hot-loop' && value !== undefined) score = Math.max(score, hotLoopScore(value));
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
