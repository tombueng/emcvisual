/**
 * What the speech bubbles say (shared by the overlay in Callouts.svelte and the in-world
 * bubbles in render/worldCallouts.ts): the ranked layout hints as numbered pins, the sources
 * with near-field peak and far-field margin, and optionally the hotspots.
 */
import type { Viewer } from '../render/viewer';
import { app } from '../state/app.svelte';
import { engine } from '../state/engine.svelte';
import { t } from '../i18n';
import { toWorld } from '../model/world';
import { farMargins, gainText, rankedDiagnostics, diagnosticText, sourceName, sourceColor } from '../report/texts';
import type { Diagnostic } from '../physics/diagnostics';

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
  onclick: () => void;
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
  if (c.hints) {
    rankedDiagnostics()
      .slice(0, c.maxHints > 0 ? c.maxHints : undefined)
      .forEach(({ d, margin }, i) => {
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
          onclick: () => probeTo(w[0], w[2]),
        });
      });
  }
  if (c.sources) {
    const margins = new Map(farMargins().map((f) => [f.id, f]));
    for (const s of app.sources) {
      const m = app.models[s.id];
      if (!s.enabled || !m) continue;
      const f = margins.get(s.id);
      const peak = app.hotspots.find((h) => h.sourceId === s.id);
      out.push({
        key: `s${s.id}`,
        kind: 'source',
        pos: [m.centre[0], Math.max(m.centre[1], surface) + 0.5, m.centre[2]],
        color: s.color,
        title: s.name,
        lines: peak ? [t.callouts.peak(peak.db.toFixed(0))] : [],
        accent: f ? t.callouts.far(t.diag.margin(f.worst)) : undefined,
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
