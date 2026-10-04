import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareChecks, runCheck } from '../src/cli/fieldCheck';

describe('field check for CI', () => {
  const board = readFileSync('public/demo/demo-board.kicad_pcb', 'utf8');
  const scenario = JSON.parse(readFileSync('public/demo/demo-board.scenario.json', 'utf8'));
  const opts = { height: 2, step: 2 };
  const base = runCheck(board, 'demo-board.kicad_pcb', scenario, opts);

  it('reports near field per band, far-field margin and layout hints per source', () => {
    const bad = base.sources.find((s) => s.id === 'clk-bad')!;
    const good = base.sources.find((s) => s.id === 'clk-good')!;
    // the clock over the slot is louder and has hints; the good one has none
    expect(bad.near['30-230MHz']!.db).toBeGreaterThan(good.near['30-230MHz']!.db + 6);
    expect(bad.hints.length).toBeGreaterThan(0);
    expect(good.hints).toEqual([]);
    expect(bad.far!.margin).toBeGreaterThan(good.far!.margin);
  });

  it('finds no difference against itself and flags faster edges as a regression', () => {
    expect(compareChecks(base, base)).toEqual({ worse: [], better: [] });
    const faster = structuredClone(scenario);
    faster.sources.find((s: { id: string }) => s.id === 'clk-good').waveform.tr = 0.2e-9;
    const now = runCheck(board, 'demo-board.kicad_pcb', faster, opts);
    const { worse, better } = compareChecks(base, now, 3);
    expect(worse.some((f) => f.sourceId === 'clk-good' && f.what === 'near:230MHz-1GHz')).toBe(true);
    expect(worse.some((f) => f.sourceId === 'clk-good' && f.what === 'far')).toBe(true);
    expect(better).toEqual([]);
  });
});
