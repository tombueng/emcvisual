/**
 * What the speech bubbles say (shared by the overlay in Callouts.svelte and the in-world
 * bubbles in render/worldCallouts.ts): the ranked layout hints as numbered pins, the sources
 * with near-field peak and far-field margin, and optionally the hotspots. Red and yellow ones
 * (critical, check) are bubbles that always stay in view; green ones (minor) are only points
 * until clicked.
 */
import type { Viewer } from '../render/viewer';
import { app } from '../state/app.svelte';
import { engine } from '../state/engine.svelte';
import { t } from '../i18n';
import { toWorld } from '../model/world';
import { farMargins, fixedShift, gainText, rankedDiagnostics, diagnosticText, sourceName, sourceColor, sourceSeverityOf, standardShort } from '../report/texts';
import { severityColor, type SeverityLevel } from '../physics/severity';
import type { Diagnostic } from '../physics/diagnostics';
import { limitsFor } from '../physics/standards';
import { MAX_GAIN_DB } from '../physics/attribution';
import { miniSpectrumSvg } from './spectrumSvg';
import { diagKey } from './focusData';

export interface Callout {
  key: string;
  kind: 'hint' | 'source' | 'hotspot';
  /** Anchor in world coordinates (mm). */
  pos: [number, number, number];
  color: string;
  badge?: string;
  title: string;
  lines: string[];
  accent?: string;
  /** Full text, shown on hover. */
  more?: string;
  /** Small 3 m far-field spectrum (SVG markup). */
  spectrum?: string;
  /** Severity colour (badge of a hint, dot of a source). */
  severity?: string;
  severityLabel?: string;
  /** critical and check: always a bubble in view; minor: a point. */
  level?: SeverityLevel;
  /** The source a hint belongs to. */
  sourceId?: string;
  /** Start compact (title, rating, far field; the rest on hover): a source whose hints are shown. */
  brief?: boolean;
  onclick: () => void;
}

/** Layout order: red first, then yellow, then those without a rating, green last. */
export const calloutPriority = (c: Callout) => (c.level === 'critical' ? 0 : c.level === 'check' ? 1 : c.level === 'minor' ? 3 : 2);

/** Tooltip of a point: what the bubble would say. */
export function pointText(c: Callout): string {
  return [`${c.badge ? `${c.badge}. ` : ''}${c.title}`, ...c.lines, ...(c.accent ? [c.accent] : []), `${c.severityLabel ?? ''}. ${t.callouts.pointHint}`].join('\n');
}

const shortText = (d: Diagnostic) => {
  const base = t.callouts.kinds[d.kind];
  if (d.detour && d.detour.length > 0) return `${base}, ${t.callouts.detour(Math.round(d.detour.length), d.detour.via && d.detour.via !== 'via' ? d.detour.via : '')}`;
  return base;
};

export function buildCallouts(viewer: Viewer): Callout[] {
  const board = app.board;
  const c = app.view.callouts;
  if (!board || !c) return [];
  const probeTo = (x: number, z: number) => {
    app.probe.x = x;
    app.probe.z = z;
    app.probe.visible = true;
    app.probe.follow = false;
    viewer.focus(x, 0, z);
  };
  const top = board.layers[0]!;
  const surface = top.y + top.thickness / 2;
  const out: Callout[] = [];
  // 3 m spectra per source for the bubbles: as is, and for a hint with the fix applied
  const far = c.spectrum ? new Map((engine.farReadout(3)?.sources ?? []).map((s) => [s.id, s.lines])) : new Map<string, { f: number; db: number }[]>();
  const limits = limitsFor(app.standard, 3);
  const chart = (id: string, color: string, shift?: number) => {
    const lines = far.get(id);
    if (!lines?.length) return undefined;
    return miniSpectrumSvg(lines, {
      width: 196,
      height: 58,
      color,
      limits,
      shift,
      labels: { left: '30 MHz', right: '1 GHz', caption: shift !== undefined ? t.callouts.chartFixed : t.callouts.chart(standardShort()) },
    });
  };
  if (c.hints) {
    rankedDiagnostics()
      .slice(0, c.maxHints > 0 ? c.maxHints : undefined)
      .forEach(({ d, margin, severity }, i) => {
        const w = toWorld(engine.frame, d.at, surface + 0.3);
        out.push({
          key: `h${i}`,
          kind: 'hint',
          pos: w,
          color: sourceColor(d.sourceId),
          badge: String(i + 1),
          title: sourceName(d.sourceId),
          lines: [shortText(d)],
          accent: d.gain ? gainText(d) : margin !== null ? t.diag.margin(margin) : undefined,
          more: diagnosticText(d),
          spectrum: chart(d.sourceId, sourceColor(d.sourceId), fixedShift(d)),
          severity: severityColor(severity.score),
          severityLabel: t.severity[severity.level],
          level: severity.level,
          sourceId: d.sourceId,
          onclick: () => (app.focusKey = diagKey(d)),
        });
      });
  }
  if (c.sources) {
    const margins = new Map(farMargins().map((f) => [f.id, f]));
    const hinted = new Set(out.filter((o) => o.kind === 'hint').map((o) => o.sourceId));
    for (const s of app.sources) {
      const m = app.models[s.id];
      if (!s.enabled || !m) continue;
      const f = margins.get(s.id);
      const peak = app.hotspots.find((h) => h.sourceId === s.id);
      const sev = sourceSeverityOf(s.id);
      out.push({
        key: `s${s.id}`,
        kind: 'source',
        pos: [m.centre[0], Math.max(m.centre[1], surface) + 0.5, m.centre[2]],
        color: s.color,
        title: s.name,
        lines: peak ? [t.callouts.peak(peak.db.toFixed(0))] : [],
        accent: f ? t.callouts.far(t.diag.margin(f.worst)) : undefined,
        spectrum: chart(s.id, s.color),
        severity: severityColor(sev.score),
        severityLabel: t.severity[sev.level],
        level: sev.level,
        brief: hinted.has(s.id),
        onclick: () => (app.selectedId = s.id),
      });
    }
  }
  if (c.hotspots) {
    app.hotspots.forEach((h, i) =>
      out.push({
        key: `p${i}`,
        kind: 'hotspot',
        pos: [h.x, h.y, h.z],
        color: sourceColor(h.sourceId),
        title: `${h.db.toFixed(0)} ${t.units.dBuAm}`,
        lines: [sourceName(h.sourceId), ...(h.parts.length || h.nets.length ? [[...h.parts, ...h.nets].slice(0, 4).join(', ')] : [])],
        onclick: () => probeTo(h.x, h.z),
      }),
    );
  }
  return out;
}
