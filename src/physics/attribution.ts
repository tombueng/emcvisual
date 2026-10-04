/**
 * Which layout problem costs how much far field (3 m). The far-field estimate is proportional
 * to the magnetic dipole moment of a source (farfield.ts), the same factor for every spectral
 * line, so a change of the moment from m to m' moves every line by 20·log10(|m|/|m'|) dB.
 *
 * Detour loops of one source can point in opposite directions and partly cancel (a signal that
 * changes layers twice), so "remove one detour and compare" can even come out negative. Each
 * problem is therefore judged on its own: its share of the moment, Δm_k = m_now − m_fixed_k,
 * added to the source with ideal returns, m_ideal (all fixed):
 *   cost_k = 20·log10(|m_ideal + Δm_k| / |m_ideal|).
 * For gaps without a way around and for cut-outs under a source there is no detour to fix; the
 * comparison there is the same source over solid reference planes.
 */
import type { PlaneLayer } from '../model/planes';
import type { WorldFrame } from '../model/world';
import type { CurrentElement } from './currents';
import { farMoment } from './farfield';
import { withFixed, type Detour } from './returnPaths';

type V3 = [number, number, number];
const norm = (m: V3) => Math.hypot(m[0], m[1], m[2]);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Ratios beyond this are shown as "more than"; the dipole of a fully shielded loop goes to 0. */
export const MAX_GAIN_DB = 30;
const db = (a: number, b: number) => (b > 0 ? Math.min(MAX_GAIN_DB, 20 * Math.log10(a / b)) : MAX_GAIN_DB);

export interface SourceAttribution {
  /** All return-path detours of the source together: louder than with ideal returns, dB. */
  returnPathsDb: number;
  /** Gaps and cut-outs in the reference planes under the source: louder than over solid planes, dB. */
  planeGapsDb: number;
  /** |m| per ampere (A·m² per A): as computed, with ideal returns, over solid planes. */
  momentNow: number;
  momentIdeal: number;
  momentSolid: number;
}

/** The same planes without gaps (every raster cell covered). */
export function solidPlanes(planes: PlaneLayer[]): PlaneLayer[] {
  return planes.map((p) => ({ ...p, raster: { ...p.raster, data: new Uint8Array(p.raster.data.length).fill(1) } }));
}

/**
 * Sets `gainDb` on every detour that has a fix and returns the source-level figures.
 * `elements`: the source with its detours (stage 2); `base`: the stage 1 elements (no detours).
 */
export function attributeSource(elements: CurrentElement[], base: CurrentElement[], detours: Detour[], planes: PlaneLayer[], frame: WorldFrame): SourceAttribution {
  // far-field moments: the return current in the planes themselves (farfield.ts)
  const moment = (els: CurrentElement[], pl = planes): V3 => farMoment(els, pl, frame);
  const now = moment(elements);
  const nNow = norm(now);
  const solid = moment(base, solidPlanes(planes));
  const planeGapsDb = nNow > 0 ? Math.max(0, db(nNow, norm(solid))) : 0;
  const fixes = detours.filter((d) => d.fix);
  if (fixes.length === 0 || !(nNow > 0)) return { returnPathsDb: 0, planeGapsDb, momentNow: nNow, momentIdeal: nNow, momentSolid: norm(solid) };

  // all fixed at once: indices refer to the original list, so drop, restore and add in one pass
  const remove = new Set(fixes.flatMap((d) => d.fix!.remove));
  const back = new Map(fixes.flatMap((d) => d.fix!.restore.map((r) => [r.index, r.el] as const)));
  const all = elements.flatMap((e, i) => (remove.has(i) ? [] : [back.get(i) ?? e]));
  const ideal = moment([...all, ...fixes.flatMap((d) => d.fix!.add)]);
  const nIdeal = norm(ideal);
  for (const d of fixes) {
    const fixedOnly = moment(withFixed(elements, d));
    const share = sub(now, fixedOnly);
    d.gainDb = Math.max(0, db(norm(add(ideal, share)), nIdeal));
    d.aloneDb = norm(fixedOnly) > 0 ? db(nNow, norm(fixedOnly)) : 0;
  }
  return { returnPathsDb: Math.max(0, db(nNow, nIdeal)), planeGapsDb, momentNow: nNow, momentIdeal: nIdeal, momentSolid: norm(solid) };
}

export interface RankedFinding<T> {
  item: T;
  /** Worst far-field line of the finding's source minus the limit, dB (null: no line in range). */
  sourceMargin: number | null;
  /** Far-field gain when this finding is fixed, dB (null: not quantified, e.g. a long line). */
  gainDb: number | null;
}

/**
 * The order to work in: what would bring the source's worst line furthest below the limit
 * comes first. Primary key is the source's margin after nothing is done (worst source first),
 * then the gain of the fix (biggest first); findings without a figure go to the end of their
 * source.
 */
export function rankFindings<T>(items: RankedFinding<T>[]): RankedFinding<T>[] {
  const m = (x: RankedFinding<T>) => x.sourceMargin ?? -Infinity;
  const g = (x: RankedFinding<T>) => x.gainDb ?? -Infinity;
  return [...items].sort((a, b) => m(b) - m(a) || g(b) - g(a));
}
