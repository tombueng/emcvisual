import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { detectPlanes } from '../src/model/planes';
import { worldFrame } from '../src/model/world';
import { buildSource } from '../src/physics/currents';
import { diagnoseSource } from '../src/physics/diagnostics';
import { packWithImages } from '../src/physics/images';
import { dipoleMoment, farField, K_DIPOLE } from '../src/physics/farfield';
import type { Source } from '../src/physics/sources';

const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
const frame = worldFrame(board);
const planes = detectPlanes(board);
const ctx = { board, frame, planes, fMax: 1e9 };
const scenario = JSON.parse(readFileSync('public/demo/demo-board.scenario.json', 'utf8')) as { sources: Source[] };
const byId = (id: string) => scenario.sources.find((s) => s.id === id)!;
const diag = (id: string) => diagnoseSource(board, planes, frame, byId(id), buildSource(ctx, byId(id)), 1e9);

describe('demo board diagnostics', () => {
  it('flags exactly the mistakes built into the bad clock', () => {
    const d = diag('clk-bad');
    const gaps = d.filter((x) => x.kind === 'return-gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.at.x).toBeGreaterThan(137.5);
    expect(gaps[0]!.at.x).toBeLessThan(140.5);
    expect(gaps[0]!.at.y).toBeCloseTo(94, 0);
    expect(gaps[0]!.planeNet).toBe('GND');
    const changes = d.filter((x) => x.kind === 'ref-change');
    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.planeNet === 'GND' || c.otherNet === 'GND')).toBe(true);
  });

  it('finds no problem with the good clock, the good buck and the USB pair', () => {
    for (const id of ['clk-good', 'buck-good', 'usb']) expect(diag(id), id).toEqual([]);
  });

  it('reports the missing planes under the bad buck', () => {
    expect(diag('buck-bad').some((x) => x.kind === 'return-gap')).toBe(true);
  });
});

describe('far-field estimate', () => {
  it('a 1 cm² loop at 100 MHz with 1 mA matches Ott (263e-16 f² A I / r)', () => {
    const m: [number, number, number] = [0, 1e-4, 0];
    const [l] = farField(m, [{ f: 100e6, amp: 1e-3 }], 3);
    const expected = (2 * K_DIPOLE * 1e16 * 1e-4 * 1e-3) / 3;
    expect(l!.db).toBeCloseTo(20 * Math.log10(expected) + 120, 6);
  });

  it('the sprawling buck radiates far more than the tight one', () => {
    const m = (id: string) => Math.hypot(...dipoleMoment(packWithImages(buildSource(ctx, byId(id)).elements, planes, frame)));
    expect(m('buck-bad')).toBeGreaterThan(30 * m('buck-good'));
  });
});
