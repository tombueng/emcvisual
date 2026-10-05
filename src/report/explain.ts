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
import { BOARD_KINDS, type Diagnostic } from '../physics/diagnostics';
import { engine } from '../state/engine.svelte';
import { limitAt } from '../physics/farfield';
import { limitsFor } from '../physics/standards';
import { findingSeverity, type Severity } from '../physics/severity';
import { gainText, standardShort } from './texts';
import { cableConnectors } from '../physics/commonMode';
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
    radius: d.kind === 'edge-trace' ? fmtNum(d.run?.min ?? 0, 1) : fmtNum(d.value, 0),
    run: fmtNum(d.run?.length ?? 0, 0),
    detour: d.detour ? fmtNum(d.detour.length, 0) : '',
    area: d.detour ? fmtNum(d.detour.extraArea, 0) : '',
    via: d.detour?.via && d.detour.via !== 'via' ? d.detour.via : '',
    fShort: formatEng(d.value, 'Hz', 3),
    loopArea: fmtNum(d.value, 0),
    length: m ? fmtNum(d.kind === 'long-line' ? (C0 / (4 * d.value * Math.sqrt(m.info.eeff))) * 1000 : m.info.lengthMm, 0) : '?',
    eeff: m ? fmtNum(m.info.eeff, 2) : '?',
    loop: s?.type === 'loop' || s?.type === 'inductor',
  };
  const figures: string[] = [];
  let k: keyof typeof E.kinds;
  switch (d.kind) {
    case 'return-gap':
      k = d.detour && d.detour.length > 0 ? 'gapDetour' : 'gapOpen';
      figures.push(d.split ? E.fig.split(d.planeNet, d.otherNet ?? '?', d.plane) : E.fig.gap(p.gap, d.planeNet, d.plane));
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
    case 'hot-loop':
      k = 'hotLoop';
      figures.push(E.fig.hotLoop(p.loopArea));
      break;
    case 'edge-trace':
      k = 'edgeTrace';
      figures.push(E.fig.edgeTrace(p.run, p.gap, p.radius, fmtNum((d.run?.min ?? 0) / 5, 2)));
      break;
    case 'cable-cm': {
      k = 'cableCm';
      const c = d.cm;
      const w = c?.worst ? c.lines.find((l) => l.f === c.worst!.f) : undefined;
      if (c && w) figures.push(E.fig.cm(fmtNum(c.lp * 1e9, 3), formatEng(w.f, 'Hz', 3), formatEng(w.v, 'V', 2), E.fig.cmMech[c.mechanism]));
      break;
    }
    case 'io-coupling': {
      k = 'ioCoupling';
      const e = d.io;
      const w = e?.worst ? e.lines.find((l) => l.f === e.worst!.f) : undefined;
      if (e && w) figures.push(E.fig.io(d.otherNet ?? '?', e.connector, fmtNum(e.mutual * 1e9, 2), fmtNum(e.capacitance * 1e12, 2), fmtNum(e.zAnt, 0), E.fig.ioKind[e.kind]));
      break;
    }
    case 'filter-far':
      k = 'filterFar';
      break;
    case 'filter-ground':
      k = 'filterGround';
      break;
    case 'shield-open':
      k = 'shieldOpen';
      break;
    case 'shield-weak':
      k = 'shieldWeak';
      break;
    case 'decoupling':
      k = 'decoupling';
      break;
    case 'crystal-placement':
      k = 'crystalPlacement';
      break;
    case 'crystal-under':
      k = 'crystalUnder';
      break;
    case 'sw-node':
      k = 'swNode';
      break;
    case 'no-adjacent-plane':
      k = 'noAdjacentPlane';
      break;
    case 'floating-copper':
      k = 'floatingCopper';
      break;
    case 'heatsink-floating':
      k = 'heatsinkFloating';
      break;
    case 'ferrite-ground':
      k = 'ferriteGround';
      break;
    case 'pair-skew':
      k = 'pairSkew';
      break;
    case 'connector-ground':
      k = 'connectorGround';
      break;
    case 'inductor-placement':
      k = 'inductorPlacement';
      break;
    case 'no-reference':
      k = 'noReference';
      figures.push(E.fig.noReference(p.loopArea));
      break;
  }
  if (m?.info.series?.length && s && s.type === 'signal' && m.info.trEff !== undefined && m.info.trEff > s.waveform.tr * 1.05)
    figures.push(E.fig.series(m.info.series.map((r) => `${r.ref} (${fmtNum(r.ohms, 0)} Ω)`).join(', '), formatEng(s.waveform.tr, 's', 2), formatEng(m.info.trEff, 's', 2)));
  const att0 = app.attribution[d.sourceId];
  const dbs = (v: number) => (v >= MAX_GAIN_DB - 0.05 ? t.diag.gainMore(MAX_GAIN_DB) : t.diag.gainDb(Math.abs(v)));
  if (d.gain?.scope === 'source') figures.push(E.fig.gainSource(gain!));
  else if (d.gain) {
    const alone = d.gain.alone ?? d.gain.db;
    figures.push(E.fig.gain(alone >= 0 ? E.fig.quieter(dbs(alone)) : E.fig.louder(dbs(alone)), gain!, att0 && att0.returnPathsDb > 0.05 ? dbs(att0.returnPathsDb) : ''));
  }
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
    // what fixing this spot alone changes (for all gaps of a source: all of them together)
    const g = Math.min(d.gain.scope === 'source' ? d.gain.db : (d.gain.alone ?? d.gain.db), MAX_GAIN_DB);
    const fixed = d.gain.scope === 'source' ? att.momentSolid : att.momentNow / 10 ** (g / 20);
    const gTxt = g >= 0 ? dbs(g) : `−${dbs(g)}`;
    calc.push((d.gain.scope === 'source' ? C.fixedSolid : C.fixed)(mm2(fixed), gTxt, fmtNum(worst.db - g, 1), t.diag.margin(worst.db - g - worst.lim)));
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
    doubts.push(D.cables(cableConnectors(board).length));
  }
  if (d.kind === 'ref-change' && board) {
    const L = Math.max(board.bbox.x1 - board.bbox.x0, board.bbox.y1 - board.bbox.y0) / 1000;
    const er = board.dielectrics[0]?.epsilonR ?? 4.4;
    doubts.push(D.cavity(p.planeNet, p.otherNet, formatEng(C0 / (2 * L * Math.sqrt(er)), 'Hz', 2)));
  }
  if (d.kind === 'return-gap' && s && s.type !== 'loop' && s.type !== 'inductor') doubts.push(D.slotCm);
  if (d.kind === 'cable-cm' || d.kind === 'io-coupling') doubts.push(D.cmWorstCase);
  if (d.detour && d.detour.length > 0) doubts.push(D.shortestPath);
  if (d.gain?.scope === 'source') doubts.push(D.idealMirror);
  if (s && (s.type === 'signal' || s.type === 'diffpair')) doubts.push(D.trapezoid);
  if (s?.type === 'loop') doubts.push(D.loopRinging);
  if (s?.type === 'inductor') doubts.push(D.inductor);
  if (s?.type === 'diffpair') doubts.push(D.skew);
  doubts.push(D.detector);
  if (!app.planes.some((q) => q.override)) doubts.push(D.planesDetected);

  // --- severity -------------------------------------------------------------------------------------
  const margin = d.kind === 'cable-cm' ? (d.cm?.worst?.margin ?? null) : d.kind === 'io-coupling' ? (d.io?.worst?.margin ?? null) : worst ? worst.db - worst.lim : null;
  const severity = findingSeverity(margin, d.gain?.db ?? null, d.kind, d.value);
  const fAt = d.kind === 'cable-cm' ? d.cm?.worst?.f : d.kind === 'io-coupling' ? d.io?.worst?.f : worst?.f;
  const reason = BOARD_KINDS.includes(d.kind) ? t.severity.rule : t.severity.reason(margin !== null && fAt !== undefined ? `${t.diag.margin(margin)} (${formatEng(fAt, 'Hz', 3)})` : '–', gain ? gainText(d) : t.severity.noGain);

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

