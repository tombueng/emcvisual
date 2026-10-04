/**
 * Known EMC layout mistakes (tools/emc-cases/gen_cases.py): each as a bad board and a good twin.
 * The field check must report the mistake on the bad board and not on the good one, and the
 * fix must make the far field quieter where the case says so. The table printed at the end is
 * the detection matrix for docs/research.
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { runCheck, type CheckReport } from '../src/cli/fieldCheck';
import { findingSeverity, type SeverityLevel } from '../src/physics/severity';
import type { DiagnosticKind } from '../src/physics/diagnostics';

interface CaseMeta {
  title: string;
  sources: unknown[];
  expect: { bad?: string[]; good_absent?: string[]; far_gain_min?: number; near_gain_min?: number; bad_severity?: SeverityLevel; bad_split?: boolean };
}

const DIR = 'tests/fixtures/emc-cases';
const cases = JSON.parse(readFileSync(`${DIR}/cases.json`, 'utf8')) as Record<string, CaseMeta>;
const opts = { height: 2, step: 1 };
const matrix: Record<string, unknown>[] = [];

function check(id: string, variant: 'bad' | 'good', meta: CaseMeta): CheckReport {
  const file = `${id}.${variant}.kicad_pcb`;
  const scenario = { kind: 'pcb-field-scenario', version: 1, board: { fileName: file, hash: '' }, settings: { quality: 'normal', fMax: 1e9, planeOverrides: {} }, sources: meta.sources };
  return runCheck(readFileSync(`${DIR}/${file}`, 'utf8'), file, scenario, opts);
}

const kinds = (r: CheckReport) => r.sources.flatMap((s) => s.hints.map((h) => h.kind));
const RANK: Record<SeverityLevel, number> = { minor: 0, check: 1, critical: 2 };
/** The worst rating among the hints, as the app shows it. */
function worstLevel(r: CheckReport): SeverityLevel {
  let best: SeverityLevel = 'minor';
  for (const s of r.sources)
    for (const h of s.hints) {
      const lvl = findingSeverity(s.far?.margin ?? null, h.gainDb ?? null, h.kind as DiagnosticKind, h.value).level;
      if (RANK[lvl] > RANK[best]) best = lvl;
    }
  return best;
}
/** "a|b": one of them. */
const has = (list: string[], want: string) => want.split('|').some((k) => list.includes(k));

describe('known EMC mistakes: bad board vs. good twin', () => {
  for (const [id, meta] of Object.entries(cases)) {
    it(`${id}: ${meta.title}`, () => {
      const bad = check(id, 'bad', meta);
      const good = check(id, 'good', meta);
      for (const r of [bad, good]) for (const s of r.sources) expect(s.error, `${id}: ${s.error}`).toBeUndefined();
      const kb = kinds(bad);
      const kg = kinds(good);
      const farBad = Math.max(...bad.sources.map((s) => s.far?.margin ?? -200));
      const farGood = Math.max(...good.sources.map((s) => s.far?.margin ?? -200));
      const nearBad = Math.max(...bad.sources.map((s) => s.nearMax ?? -200));
      const nearGood = Math.max(...good.sources.map((s) => s.nearMax ?? -200));
      const level = worstLevel(bad);
      matrix.push({ case: id, bad: kb.join(',') || '-', good: kg.join(',') || '-', level, far: `${farBad} → ${farGood}`, near: `${nearBad} → ${nearGood}` });
      for (const k of meta.expect.bad ?? []) expect(has(kb, k), `${id}: bad board should report ${k}, got [${kb}]`).toBe(true);
      for (const k of meta.expect.good_absent ?? []) expect(has(kg, k), `${id}: good board should not report ${k}, got [${kg}]`).toBe(false);
      if (meta.expect.bad_split) expect(bad.sources.some((s) => s.hints.some((h) => h.split)), `${id}: the split should be named`).toBe(true);
      if (meta.expect.near_gain_min !== undefined) expect(nearBad - nearGood, `${id}: near field bad ${nearBad} vs good ${nearGood}`).toBeGreaterThanOrEqual(meta.expect.near_gain_min);
      if (meta.expect.bad_severity) expect(RANK[level], `${id}: rated ${level}, expected at least ${meta.expect.bad_severity}`).toBeGreaterThanOrEqual(RANK[meta.expect.bad_severity]);
      if (meta.expect.far_gain_min !== undefined) expect(farBad - farGood, `${id}: far field bad ${farBad} vs good ${farGood}`).toBeGreaterThanOrEqual(meta.expect.far_gain_min);
    });
  }
  afterAll(() => console.table(matrix));
});
