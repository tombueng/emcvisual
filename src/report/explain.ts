/**
 * Detailed explanation of a finding: what it is, why it radiates, how the app spotted it, the
 * figures of this case, what helps (most effective first), where the calculation is uncertain,
 * and literature. The wording lives in the dictionaries (i18n `explain`); this picks the right
 * texts and fills in the numbers.
 */
import { t, fmtNum } from '../i18n';
import { app } from '../state/app.svelte';
import { formatEng } from '../physics/units';
import { MAX_GAIN_DB } from '../physics/attribution';
import type { Diagnostic } from '../physics/diagnostics';

export interface Explanation {
  what: string;
  why: string;
  detected: string;
  figures: string[];
  fixes: string[];
  limits: string;
  refs: string[];
}

export function explain(d: Diagnostic): Explanation {
  const E = t.explain;
  const s = app.sources.find((x) => x.id === d.sourceId);
  const m = s ? app.models[s.id] : undefined;
  const gain = d.gain ? (d.gain.db >= MAX_GAIN_DB - 0.05 ? t.diag.gainMore(MAX_GAIN_DB) : t.diag.gainDb(d.gain.db)) : null;
  const p = {
    layer: d.layer,
    plane: d.plane,
    planeNet: d.planeNet || 'GND',
    otherNet: d.otherNet ?? '?',
    gap: fmtNum(d.value, 1),
    radius: fmtNum(d.value, 0),
    detour: d.detour ? fmtNum(d.detour.length, 0) : '',
    area: d.detour ? fmtNum(d.detour.extraArea, 0) : '',
    via: d.detour?.via && d.detour.via !== 'via' ? d.detour.via : '',
    fShort: formatEng(d.value, 'Hz', 3),
    length: m ? fmtNum(m.info.lengthMm, 0) : '?',
    eeff: m ? fmtNum(m.info.eeff, 2) : '?',
    loop: s?.type === 'loop' || s?.type === 'inductor',
  };
  const figures: string[] = [];
  let k: keyof typeof E.kinds;
  switch (d.kind) {
    case 'return-gap':
      k = d.detour && d.detour.length > 0 ? 'gapDetour' : 'gapOpen';
      figures.push(E.fig.gap(p.gap, d.planeNet, d.plane));
      if (d.detour && d.detour.length > 0) figures.push(E.fig.detour(p.detour, p.area));
      break;
    case 'ref-change':
      k = 'refChange';
      if (d.detour) figures.push(E.fig.transfer(p.detour, p.area, p.via || E.fig.nearestVia));
      break;
    case 'no-stitching':
      k = 'noStitching';
      figures.push(E.fig.radius(p.radius, p.planeNet));
      break;
    case 'long-line':
      k = 'longLine';
      figures.push(E.fig.longLine(p.length, p.eeff, p.fShort));
      break;
  }
  if (gain) figures.push(d.gain!.scope === 'source' ? E.fig.gainSource(gain) : E.fig.gain(gain));
  // every text takes the figures; some ignore them (fewer parameters is fine in TypeScript)
  type Texts = {
    what: (x: typeof p) => string;
    why: (x: typeof p) => string;
    detected: (x: typeof p) => string;
    fixes: (x: typeof p) => string[];
    limits: (x: typeof p) => string;
    refs: readonly (keyof typeof E.refs)[];
  };
  const text = E.kinds[k] as Texts;
  return {
    what: text.what(p),
    why: text.why(p),
    detected: text.detected(p),
    figures,
    fixes: text.fixes(p),
    limits: text.limits(p),
    refs: text.refs.map((r) => E.refs[r]),
  };
}
