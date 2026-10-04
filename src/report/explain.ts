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
import { engine } from '../state/engine.svelte';
import { limitAt } from '../physics/farfield';
import { limitsFor } from '../physics/standards';
import { findingSeverity, type Severity } from '../physics/severity';
import { standardShort } from './texts';
import { C0 } from '../physics/units';

export interface Explanation {
  what: string;
  why: string;
  detected: string;
  figures: string[];
  fixes: string[];
  /** What to avoid at this spot, each with the reason. */
  avoid: string[];
  /** The calculation behind the finding, with this case's numbers. */
  calc: string[];
  /** Why the statement could be wrong here, with the rough size of the effect. */
  doubts: string[];
  limits: string;
  refs: string[];
  severity: Severity;
  /** One line: why this severity. */
  reason: string;
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
    avoid: (x: typeof p) => string[];
    limits: (x: typeof p) => string;
    refs: readonly (keyof typeof E.refs)[];
  };
  const text = E.kinds[k] as Texts;

  // --- the calculation behind it --------------------------------------------------------------------
  const C = t.explain.calc;
  const calc: string[] = [];
  const doubts: string[] = [];
  const att = app.attribution[d.sourceId];
  const far = engine.farReadout(3)?.sources.find((x) => x.id === d.sourceId);
  const limits = limitsFor(app.standard, 3);
  let worst: { f: number; db: number; lim: number } | null = null;
  for (const l of far?.lines ?? []) {
    const lim = limitAt(limits, l.f);
    if (lim !== null && (!worst || l.db - lim > worst.db - worst.lim)) worst = { f: l.f, db: l.db, lim };
  }
  const mm2 = (m: number) => fmtNum(m * 1e6, m * 1e6 < 10 ? 2 : 1);
  if (m) calc.push(C.path(fmtNum(m.info.lengthMm, 0), d.plane || '–'));
  if (att) calc.push(C.moment(mm2(att.momentNow)));
  calc.push(C.formula);
  if (worst) calc.push(C.worst(standardShort(), formatEng(worst.f, 'Hz', 3), fmtNum(worst.db, 1), fmtNum(worst.lim, 0), t.diag.margin(worst.db - worst.lim)));
  if (d.gain && att && worst) {
    const g = Math.min(d.gain.db, MAX_GAIN_DB);
    const fixed = d.gain.scope === 'source' ? att.momentSolid : att.momentNow / 10 ** (g / 20);
    calc.push(
      (d.gain.scope === 'source' ? C.fixedSolid : C.fixed)(mm2(fixed), gain ?? '', fmtNum(worst.db - g, 1), t.diag.margin(worst.db - g - worst.lim)),
    );
  }

  // --- why it could be wrong here -----------------------------------------------------------------
  const D = t.explain.doubt;
  if (s) {
    const prov = app.partsInfo.provenance;
    const fields = s.type === 'inductor' ? ['waveform.f0', 'waveform.amplitude'] : ['waveform.f0', 'waveform.tr', 'waveform.amplitude'];
    const open = fields.filter((f) => !prov[`${s.id}/${f}`] || prov[`${s.id}/${f}`]!.basis === 'assumed');
    if (open.length) doubts.push(D.inputs(open.map((f) => E.fieldNames[f as keyof typeof E.fieldNames] ?? f).join(', '), s.type !== 'inductor' ? formatEng(1 / (Math.PI * s.waveform.tr), 'Hz', 2) : ''));
  }
  if (worst && m && worst.f > m.info.fShort) doubts.push(D.aboveValidity(formatEng(worst.f, 'Hz', 3), formatEng(m.info.fShort, 'Hz', 3)));
  const board = app.board;
  if (board && worst) {
    const diag = Math.hypot(board.bbox.x1 - board.bbox.x0, board.bbox.y1 - board.bbox.y0) / 1000;
    const fHalf = C0 / (2 * diag);
    if (worst.f > fHalf / 1.5) doubts.push(D.boardSize(fmtNum(diag * 1000, 0), formatEng(fHalf, 'Hz', 2)));
    const connectors = board.footprints.filter((f) => /^(J|P|CN|X)\d/i.test(f.ref)).length;
    doubts.push(D.cables(connectors));
  }
  if (d.kind === 'ref-change' && board) {
    const L = Math.max(board.bbox.x1 - board.bbox.x0, board.bbox.y1 - board.bbox.y0) / 1000;
    const er = board.dielectrics[0]?.epsilonR ?? 4.4;
    doubts.push(D.cavity(p.planeNet, p.otherNet, formatEng(C0 / (2 * L * Math.sqrt(er)), 'Hz', 2)));
  }
  if (d.detour && d.detour.length > 0) doubts.push(D.shortestPath);
  if (d.gain?.scope === 'source') doubts.push(D.idealMirror);
  if (s && (s.type === 'signal' || s.type === 'diffpair')) doubts.push(D.trapezoid);
  doubts.push(D.detector);
  if (!app.planes.some((q) => q.override)) doubts.push(D.planesDetected);

  // --- severity -------------------------------------------------------------------------------------
  const margin = worst ? worst.db - worst.lim : null;
  const severity = findingSeverity(margin, d.gain?.db ?? null, d.kind);
  const reason = t.severity.reason(margin !== null ? `${t.diag.margin(margin)} (${formatEng(worst!.f, 'Hz', 3)})` : '–', gain ? (d.gain!.scope === 'source' ? E.fig.gainSource(gain) : gainTextShort(gain)) : t.severity.noGain);

  return {
    what: text.what(p),
    why: text.why(p),
    detected: text.detected(p),
    figures,
    fixes: text.fixes(p),
    avoid: text.avoid(p),
    calc,
    doubts,
    limits: text.limits(p),
    refs: text.refs.map((r) => E.refs[r]),
    severity,
    reason,
  };
}

function gainTextShort(g: string): string {
  return t.explain.fig.gainShort(g);
}
