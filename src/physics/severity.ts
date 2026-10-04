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

export function findingSeverity(margin: number | null, gain: number | null, kind: DiagnosticKind): Severity {
  // share of the problem: full from 6 dB gain on; validity notes and unquantified hints in between
  const share = gain !== null ? clamp(gain / 6, 0.15, 1) : kind === 'long-line' ? 0.3 : 0.4;
  const score = marginScore(margin) * (0.35 + 0.65 * share);
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
