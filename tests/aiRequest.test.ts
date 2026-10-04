import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { buildAiRequest, AI_REQUEST_KIND } from '../src/ai/request';
import { suggestSources } from '../src/physics/suggest';
import { migrateScenario, partsInfoOf } from '../src/state/scenario';

describe('parts data for AI agents', () => {
  const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
  const scenario = migrateScenario(JSON.parse(readFileSync('public/demo/demo-board.scenario.json', 'utf8')));

  it('exports every part with its fields, pins and nets, the sources and the suggestions', () => {
    const req = buildAiRequest(board, scenario, suggestSources(board), 'https://example.org/ai-parts-manual.md');
    expect(req.kind).toBe(AI_REQUEST_KIND);
    expect(req.components).toHaveLength(board.footprints.length);
    const u1 = req.components.find((c) => c.ref === 'U1')!;
    expect(Object.values(u1.pins)).toContain('VIN');
    // KiCad copies symbol fields onto the footprint; empty ones are left out
    expect(req.components.every((c) => Object.keys(c.fields).length === 0)).toBe(true);
    const withLink = parseBoard(
      readFileSync('public/demo/demo-board.kicad_pcb', 'utf8').replace('(property "Datasheet" ""', '(property "Datasheet" "https://example.org/part.pdf"'),
    );
    const linked = buildAiRequest(withLink, scenario, [], '').components.filter((c) => c.fields.Datasheet);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.fields.Datasheet).toBe('https://example.org/part.pdf');
    expect(req.scenario.sources.length).toBe(scenario.sources.length);
    expect(req.manual).toMatch(/ai-parts-manual\.md$/);
    // components sorted naturally: C2 before C10
    const refs = req.components.map((c) => c.ref);
    expect(refs.indexOf('C1')).toBeLessThan(refs.indexOf('U1'));
  });

  it('reads provenance and missing parts from an answer, dropping malformed entries', () => {
    const answer = migrateScenario({
      ...scenario,
      parts: [{ ref: 'C2', c: 2.2e-5, esr: 0.01, esl: 4e-10 }, { c: 1 }],
      provenance: {
        'clk-good/waveform.tr': { basis: 'datasheet', ref: 'Y1', source: 'https://example.org/y1.pdf', where: 'p. 3' },
        'clk-good/load.cLoad': { basis: 'guessed' },
      },
      missing: [{ ref: 'U2', needed: ['load.cLoad'], assumed: '5 pF' }, { needed: [] }],
      notes: 'demo',
    });
    const info = partsInfoOf(answer);
    expect(info.parts).toEqual([{ ref: 'C2', c: 2.2e-5, esr: 0.01, esl: 4e-10 }]);
    expect(Object.keys(info.provenance)).toEqual(['clk-good/waveform.tr']);
    expect(info.missing).toHaveLength(1);
    expect(info.missing[0]!.ref).toBe('U2');
    expect(info.notes).toBe('demo');
  });
});
