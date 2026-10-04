/**
 * Texts and figures shared by the diagnostics panel and the report (W5): one wording for a
 * finding, wherever it appears.
 */
import { t } from '../i18n';
import { app } from '../state/app.svelte';
import { engine } from '../state/engine.svelte';
import { formatEng } from '../physics/units';
import { limitAt } from '../physics/farfield';
import type { Diagnostic } from '../physics/diagnostics';
import { MAX_GAIN_DB, rankFindings } from '../physics/attribution';
import { findingSeverity, sourceSeverity, type Severity } from '../physics/severity';
import type { Source } from '../physics/sources';

export function diagnosticText(d: Diagnostic): string {
  const k = t.diag.kinds;
  const main = (() => {
    switch (d.kind) {
      case 'return-gap':
        return k['return-gap'](d);
      case 'ref-change':
        return k['ref-change'](d);
      case 'no-stitching':
        return k['no-stitching'](d);
      case 'long-line':
        return k['long-line'](d, (v) => formatEng(v, 'Hz', 2));
    }
  })();
  return main + (d.detour ? t.diag.detour(d.detour) : '');
}

export function sourceSummary(s: Source): string {
  const f = (s.type === 'signal' || s.type === 'diffpair') && s.kind === 'data' ? formatEng(s.waveform.f0 * 2, 'bit/s') : formatEng(s.waveform.f0, 'Hz');
  if (s.type === 'inductor') return `${t.sources.types.inductor}, ${f}, ${formatEng(s.waveform.amplitude, 'A')}`;
  return `${t.sources.types[s.type]}, ${f}, ${formatEng(s.waveform.tr, 's')}`;
}

export interface FarMargin {
  id: string;
  name: string;
  color: string;
  /** Worst line minus the limit, dB (≥ 0: over the limit). */
  worst: number;
  /** Frequency of the worst line, Hz. */
  at: number;
}

/** Worst margin per source against the CISPR 32 class B limit at 3 m, worst first. */
export function farMargins(): FarMargin[] {
  const r = engine.farReadout(3);
  if (!r) return [];
  return r.sources
    .map((s) => {
      let worst = -Infinity;
      let at = 0;
      for (const l of s.lines) {
        const lim = limitAt(r.limits, l.f);
        if (lim === null) continue;
        if (l.db - lim > worst) {
          worst = l.db - lim;
          at = l.f;
        }
      }
      return { id: s.id, name: s.name, color: s.color, worst, at };
    })
    .filter((s) => Number.isFinite(s.worst))
    .sort((a, b) => b.worst - a.worst);
}

export const sourceName = (id: string) => app.sources.find((s) => s.id === id)?.name ?? '';
export const sourceColor = (id: string) => app.sources.find((s) => s.id === id)?.color ?? '#888';

/** Layout hints in the order to work on them (attribution.ts): worst source first, biggest fix first. */
export function rankedDiagnostics(): { d: Diagnostic; margin: number | null; severity: Severity }[] {
  const margins = new Map(farMargins().map((f) => [f.id, f.worst]));
  return rankFindings(
    app.diagnostics.map((d) => ({ item: d, sourceMargin: margins.get(d.sourceId) ?? null, gainDb: d.gain?.db ?? null })),
  ).map((r) => ({ d: r.item, margin: r.sourceMargin, severity: findingSeverity(r.sourceMargin, r.item.gain?.db ?? null, r.item.kind, r.item.value) }));
}

/** Severity of a source from its far-field margin. */
export function sourceSeverityOf(id: string): Severity {
  return sourceSeverity(farMargins().find((f) => f.id === id)?.worst ?? null);
}

/** "fixing this: 11 dB quieter at 3 m" and the like. */
export function gainText(d: Diagnostic): string {
  if (!d.gain) return '';
  const v = d.gain.db >= MAX_GAIN_DB - 0.05 ? t.diag.gainMore(MAX_GAIN_DB) : t.diag.gainDb(d.gain.db);
  return d.gain.scope === 'source' ? t.diag.gainSource(v) : t.diag.gainFinding(v);
}

/** Short name of the selected emission standard, e.g. "CISPR 32 B". */
export function standardShort(): string {
  const items = t.standards.items as Record<string, { short: string }>;
  return items[app.standard]?.short ?? app.standard;
}
