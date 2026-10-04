/**
 * Field check for continuous integration (W6, docs/CI-FELDCHECK.md): the same physics as the
 * app, without a browser. For every source of a scenario: the strongest near field in a plane
 * above the board per frequency band, the far-field margin against CISPR 32 B at 3 m and the
 * layout hints. Two reports can be compared, so a pull request that makes a hotspot louder or
 * adds a return-path problem is flagged.
 */
import { parseBoard } from '../kicad/parseBoard';
import { covered, detectPlanes } from '../model/planes';
import { worldFrame } from '../model/world';
import { buildSource, SourceError, type PhysicsContext } from '../physics/currents';
import { applyReturnModel, type Detour } from '../physics/returnPaths';
import { packWithImages } from '../physics/images';
import { fieldAt, slotMaskTable } from '../physics/biotsavart';
import { dipoleCompensated, farField, farMoment, limitAt } from '../physics/farfield';
import { limitsFor } from '../physics/standards';
import { diagnoseSource } from '../physics/diagnostics';
import { attributeSource } from '../physics/attribution';
import { selectionWeight } from '../compute/composer';
import { migrateScenario, type Scenario } from '../state/scenario';
import type { Source } from '../physics/sources';

export const CHECK_KIND = 'pcb-field-check';

export interface Band {
  id: string;
  f0: number;
  f1: number;
}

export const CHECK_BANDS: Band[] = [
  { id: 'all', f0: 0, f1: Infinity },
  { id: '30-230MHz', f0: 30e6, f1: 230e6 },
  { id: '230MHz-1GHz', f0: 230e6, f1: 1e9 },
];

export interface CheckOptions {
  /** Height of the evaluation plane above the top copper surface, mm. */
  height: number;
  /** Spacing of the evaluation points, mm. */
  step: number;
}

export const DEFAULT_CHECK: CheckOptions = { height: 2, step: 1 };

export interface SourceCheck {
  id: string;
  name: string;
  type: Source['type'];
  error?: string;
  /** Strongest field in the plane per band, dBµA/m, and where (board mm). */
  near: Record<string, { db: number; x: number; y: number }>;
  /** Worst far-field line minus the limit at 3 m, dB (null: no line in the limit range, or not quantifiable). */
  far: { margin: number; f: number } | null;
  /** 'compensated': a flat loop over a solid plane, the model cannot give a far-field number. */
  farNote?: 'compensated';
  /** Strongest near field over all bands, dBµA/m (also for sources whose far field is not quantifiable). */
  nearMax?: number;
  /** Far-field gain when fixed, dB (scope 'source': all plane gaps under the source together). */
  /** gainDb: share against ideal returns (orders the hints); aloneDb: effect of fixing only this spot. */
  hints: { kind: string; x: number; y: number; layer: string; value?: number; split?: boolean; otherNet?: string; gainDb?: number; gainScope?: 'finding' | 'source'; aloneDb?: number }[];
  /** All return-path problems / all plane gaps of the source: louder at 3 m by this much, dB. */
  returnPathsDb: number;
  planeGapsDb: number;
}

export interface CheckReport {
  kind: typeof CHECK_KIND;
  version: 1;
  board: { fileName: string };
  options: CheckOptions & { returnModel: string };
  sources: SourceCheck[];
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function runCheck(boardText: string, fileName: string, scenarioRaw: unknown, opts: CheckOptions = DEFAULT_CHECK): CheckReport {
  const scenario: Scenario = migrateScenario(scenarioRaw);
  const board = parseBoard(boardText, fileName);
  const frame = worldFrame(board);
  const planes = detectPlanes(board, { ...scenario.settings.planeOverrides });
  const ctx: PhysicsContext = { board, frame, planes, fMax: scenario.settings.fMax };
  const top = board.layers[0]!;
  const y = top.y + top.thickness / 2 + opts.height;
  const sorted = [...planes].sort((p, q) => q.y - p.y);

  // evaluation points over the board outline's box, with the plane coverage of each column
  const pts: { x: number; z: number; bx: number; by: number; bits: number }[] = [];
  for (let by = board.bbox.y0; by <= board.bbox.y1 + 1e-9; by += opts.step)
    for (let bx = board.bbox.x0; bx <= board.bbox.x1 + 1e-9; bx += opts.step) {
      let bits = 0;
      sorted.forEach((p, i) => {
        if (covered(p.raster, bx, by)) bits |= 1 << i;
      });
      pts.push({ x: bx - frame.ox, z: by - frame.oy, bx, by, bits });
    }

  const limits = limitsFor(scenario.settings.standard, 3);
  const out: SourceCheck[] = [];
  for (const src of scenario.sources) {
    if (!src.enabled) continue;
    const res: SourceCheck = { id: src.id, name: src.name, type: src.type, near: {}, far: null, hints: [], returnPathsDb: 0, planeGapsDb: 0 };
    out.push(res);
    try {
      const model = buildSource(ctx, src);
      const base = model.elements;
      let detours: Detour[] = [];
      if (scenario.settings.returnModel === 'detour') {
        const r = applyReturnModel(ctx, src, model.elements);
        model.elements = r.elements;
        detours = r.detours;
      }
      const attr = attributeSource(model.elements, base, detours, planes, frame);
      res.returnPathsDb = round(attr.returnPathsDb);
      res.planeGapsDb = round(attr.planeGapsDb);
      const pack = packWithImages(model.elements, planes, frame);
      const masks = slotMaskTable(pack.planeY.length);
      const h = new Float64Array(3);
      const h2 = pts.map((p) => {
        fieldAt(pack, masks, p.x, y, p.z, p.bits, h);
        return h[0]! * h[0]! + h[1]! * h[1]! + h[2]! * h[2]!;
      });
      for (const band of CHECK_BANDS) {
        const w = selectionWeight(model.lines, band.id === 'all' ? { mode: 'all' } : { mode: 'band', f0: band.f0, f1: band.f1 });
        let best = 0;
        let at = 0;
        h2.forEach((v, i) => {
          if (v > best) {
            best = v;
            at = i;
          }
        });
        const p = w * best;
        res.near[band.id] = { db: p > 0 ? round(10 * Math.log10(p) + 120) : -200, x: round(pts[at]!.bx), y: round(pts[at]!.by) };
      }
      let worst = -Infinity;
      let fw = 0;
      const moment = farMoment(model.elements, planes, frame);
      const compensated = dipoleCompensated(model.info.loopArea, moment);
      if (compensated) res.farNote = 'compensated';
      res.nearMax = res.near['all']?.db;
      for (const l of compensated ? [] : farField(moment, model.lines, 3)) {
        const lim = limitAt(limits, l.f);
        if (lim !== null && l.db - lim > worst) {
          worst = l.db - lim;
          fw = l.f;
        }
      }
      res.far = Number.isFinite(worst) ? { margin: round(worst), f: fw } : null;
      res.hints = diagnoseSource(board, planes, frame, src, model, ctx.fMax, detours, attr.planeGapsDb)
        .map((d) => ({
          kind: d.kind,
          x: round(d.at.x),
          y: round(d.at.y),
          layer: d.layer,
          value: round(d.value, 3),
          ...(d.split ? { split: true, otherNet: d.otherNet } : {}),
          ...(d.gain ? { gainDb: round(d.gain.db), gainScope: d.gain.scope, ...(d.gain.alone !== undefined ? { aloneDb: round(d.gain.alone) } : {}) } : {}),
        }))
        .sort((a, b) => (b.gainDb ?? -1) - (a.gainDb ?? -1));
    } catch (e) {
      res.error = e instanceof SourceError ? e.message : (e as Error).message || String(e);
    }
  }
  return {
    kind: CHECK_KIND,
    version: 1,
    board: { fileName },
    options: { ...opts, returnModel: scenario.settings.returnModel },
    sources: out,
  };
}

export interface Finding {
  sourceId: string;
  what: string;
  before?: number;
  after?: number;
}

/**
 * Differences that matter: a band's near field or the far field up by more than `threshold`
 * dB, a layout hint that was not there before, a source that no longer builds. Improvements
 * are listed too.
 */
export function compareChecks(base: CheckReport, now: CheckReport, threshold = 3): { worse: Finding[]; better: Finding[] } {
  const worse: Finding[] = [];
  const better: Finding[] = [];
  for (const s of now.sources) {
    const b = base.sources.find((x) => x.id === s.id);
    if (!b) continue;
    if (s.error && !b.error) worse.push({ sourceId: s.id, what: `error:${s.error}` });
    for (const [band, v] of Object.entries(s.near)) {
      const old = b.near[band];
      if (!old) continue;
      if (v.db - old.db > threshold) worse.push({ sourceId: s.id, what: `near:${band}`, before: old.db, after: v.db });
      else if (old.db - v.db > threshold) better.push({ sourceId: s.id, what: `near:${band}`, before: old.db, after: v.db });
    }
    if (s.far && b.far) {
      if (s.far.margin - b.far.margin > threshold) worse.push({ sourceId: s.id, what: 'far', before: b.far.margin, after: s.far.margin });
      else if (b.far.margin - s.far.margin > threshold) better.push({ sourceId: s.id, what: 'far', before: b.far.margin, after: s.far.margin });
    }
    // hints are matched by kind within 2 mm, so a moved via does not count as new
    const near2 = (p: { kind: string; x: number; y: number }, q: { kind: string; x: number; y: number }) => p.kind === q.kind && Math.hypot(p.x - q.x, p.y - q.y) <= 2;
    for (const h of s.hints) if (!b.hints.some((o) => near2(h, o))) worse.push({ sourceId: s.id, what: `hint:${h.kind}@${h.x},${h.y}` });
    for (const h of b.hints) if (!s.hints.some((o) => near2(h, o))) better.push({ sourceId: s.id, what: `hint:${h.kind}@${h.x},${h.y}` });
  }
  return { worse, better };
}
