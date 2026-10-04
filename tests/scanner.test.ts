import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boardToPrinter, fitRegistration, printerToBoard } from '../src/scanner/registration';
import { makePlan, partHeightAt } from '../src/scanner/plan';
import { runScan } from '../src/scanner/runner';
import { VirtualPositioner, VirtualReceiver } from '../src/scanner/virtual';
import { parseTinySAScan } from '../src/scanner/drivers';
import { measurementFromJson, measurementToJson, pointFieldDb, slices } from '../src/scanner/measurement';
import { MEASUREMENT_KIND, type Measurement } from '../src/scanner/types';
import { parseBoard } from '../src/kicad/parseBoard';

const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));

describe('registration', () => {
  it('recovers a mirrored, rotated, shifted placement from three points', () => {
    const truth = { angle: 0.4, mirror: true, tx: 120, ty: 35, zSurface: 3.2, residual: 0 };
    const pts = [{ x: 110, y: 90 }, { x: 170, y: 95 }, { x: 140, y: 125 }];
    const pairs = pts.map((b) => ({ board: b, printer: boardToPrinter(truth, b.x, b.y, 0) }));
    const r = fitRegistration(pairs, 3.2);
    expect(r.mirror).toBe(true);
    expect(r.residual).toBeLessThan(1e-9);
    expect(r.angle).toBeCloseTo(0.4, 9);
    const back = printerToBoard(r, boardToPrinter(r, 150, 100, 2));
    expect(back.x).toBeCloseTo(150, 9);
    expect(back.y).toBeCloseTo(100, 9);
    expect(back.height).toBeCloseTo(2, 9);
  });
});

describe('scan plan', () => {
  it('covers the area as a serpentine and lifts the probe over tall parts', () => {
    const plan = makePlan(board, { area: board.bbox, step: 5, heights: [2], clearance: 1, probeRadius: 1 });
    expect(plan.points).toHaveLength(plan.nx * plan.ny);
    expect(plan.points[plan.nx]!.ix).toBe(plan.nx - 1); // second row runs backwards
    const j1 = board.footprints.find((f) => f.ref === 'J1')!;
    expect(partHeightAt(board, j1.body.center.x, j1.body.center.y, 1)).toBeCloseTo(8.5);
    const near = plan.points.filter((p) => Math.hypot(p.bx - j1.body.center.x, p.by - j1.body.center.y) < 3);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((p) => p.height >= 9.5)).toBe(true);
  });
});

describe('virtual scan end to end', () => {
  it('measures back what the field lookup holds, through probe model and file format', async () => {
    const reg = fitRegistration(
      [
        { board: { x: 100, y: 80 }, printer: { x: 20, y: 60 } },
        { board: { x: 180, y: 80 }, printer: { x: 100, y: 60 } },
      ],
      5,
    );
    const pos = new VirtualPositioner();
    // 25 MHz line, 100 dBµA/m everywhere
    const rx = new VirtualReceiver(pos, () => reg, () => [{ f: 25e6, db: 100 }], { kind: 'h-loop', size: 1 });
    const plan = makePlan(board, { area: { x0: 120, y0: 90, x1: 130, y1: 100 }, step: 5, heights: [2], clearance: 1, probeRadius: 1 });
    const sweep = { fStart: 1e6, fStop: 100e6, points: 100 };
    const { points, freqs } = await runScan({ plan, registration: reg, positioner: pos, receiver: rx, sweep, feed: 3000, settleMs: 0, averages: 2 });
    expect(points).toHaveLength(9);
    const m: Measurement = {
      kind: MEASUREMENT_KIND, version: 1, createdAt: '', board: { fileName: '', hash: '' },
      probe: { kind: 'h-loop', radiusMm: 1, factorDb: 0 }, receiver: rx.label, positioner: pos.label, sweep,
      grid: { x0: plan.x0, y0: plan.y0, step: plan.step, nx: plan.nx, ny: plan.ny, heights: plan.heights }, freqs, points,
    };
    const back = measurementFromJson(measurementToJson(m));
    // the bin next to 25 MHz holds the line; bin width 1 MHz, so select ±0.5 MHz
    const db = pointFieldDb(back, 4, { mode: 'band', f0: 24.5e6, f1: 25.5e6 }, false);
    expect(db).toBeCloseTo(100, 0);

    // background run with the board off: the line stays, empty bins are marked as noise
    rx.boardOff = true;
    m.background = (await runScan({ plan, registration: reg, positioner: pos, receiver: rx, sweep, feed: 3000, settleMs: 0, averages: 1 })).points;
    const line = slices(m, { mode: 'band', f0: 24.5e6, f1: 25.5e6 })[0]!;
    expect(line.values[4]).toBeCloseTo(100, 0);
    expect(line.nearNoise[4]).toBe(0);
    const empty = slices(m, { mode: 'band', f0: 50e6, f1: 60e6 })[0]!;
    expect(empty.nearNoise.every((v) => v === 1)).toBe(true);
  });
});

describe('tinySA protocol', () => {
  it('parses the output of "scan … 3"', () => {
    const s = parseTinySAScan('scan 1000000 3000000 3 3\r\n1000000 -80.5\r\n2000000 -79.25\r\n3000000 -1.2e1\r\n', 3);
    expect(Array.from(s.freqs)).toEqual([1e6, 2e6, 3e6]);
    expect(s.dbm[2]).toBeCloseTo(-12);
  });
});

describe('fitting sources to a measurement', () => {
  it('solves non-negative least squares', async () => {
    const { nnls } = await import('../src/scanner/fit');
    // exact solution has a negative part: the constrained one sets it to zero
    const A = [[1, 0], [0, 1], [1, 1]];
    const x = nnls(A, [2, -1, 1]);
    expect(x[1]).toBe(0);
    expect(x[0]).toBeCloseTo(1.5, 6);
    expect(nnls([[2, 0], [0, 3]], [4, 9])).toEqual([2, 3].map((v) => expect.closeTo(v, 9)));
  });

  it('recovers how much louder each source is, and ignores one that is not there', async () => {
    const { fitSources } = await import('../src/scanner/fit');
    // three sources with different spatial patterns over 50 points
    const P = [0, 1, 2].map((s) => Array.from({ length: 50 }, (_, i) => Math.exp(-(((i - 10 - 15 * s) / 6) ** 2)) + 1e-3));
    const truth = [4, 0.5, 0];
    const meas = P[0]!.map((_, i) => truth.reduce((t, a, s) => t + a * P[s]![i]!, 0) * (1 + 0.02 * Math.sin(i)));
    const r = fitSources(P, meas, { prior: 0.1, minShare: 0.01 });
    expect(10 * Math.log10(r.factors[0]!)).toBeCloseTo(10 * Math.log10(4), 0);
    expect(10 * Math.log10(r.factors[1]!)).toBeCloseTo(10 * Math.log10(0.5), 0);
    expect(r.factors[2]!).toBeLessThan(0.05);
    expect(r.residualDb).toBeLessThan(0.2);
    // a source far below the measured power everywhere cannot be judged and keeps factor 1
    const faint = fitSources([P[0]!, P[0]!.map((v) => v * 1e-6)], meas.map((_, i) => 4 * P[0]![i]!));
    expect(faint.determined).toEqual([true, false]);
    expect(faint.factors[1]).toBe(1);
  });
});
