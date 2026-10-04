import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addChargesField, eFieldAt } from '../src/physics/efield';
import { slotMaskTable } from '../src/physics/biotsavart';
import { EPS0, buildCharges } from '../src/physics/charges';
import { packCharges, STRIDE } from '../src/physics/images';
import type { PlaneLayer } from '../src/model/planes';
import { parseBoard } from '../src/kicad/parseBoard';
import { detectPlanes } from '../src/model/planes';
import { worldFrame } from '../src/model/world';
import type { Source } from '../src/physics/sources';

const pack = (rows: number[][]) => {
  const d = new Float64Array(rows.length * STRIDE);
  rows.forEach((r, i) => d.set(r, i * STRIDE));
  return d;
};
const E = (d: Float64Array, p: [number, number, number]) => {
  const out = new Float64Array(3);
  addChargesField(d, 0, d.length / STRIDE, p[0], p[1], p[2], out);
  return out;
};
const mag = (v: ArrayLike<number>) => Math.hypot(v[0]!, v[1]!, v[2]!);

describe('electric field kernel', () => {
  it('point charge gives q/(4πε0 r²), pointing away', () => {
    const q = 1e-12;
    const e = E(pack([[0, 0, 0, 0, 0, 0, q, 0.01]]), [0, 10, 0]);
    expect(mag(e)).toBeCloseTo(q / (4 * Math.PI * EPS0 * 0.01 ** 2), 6);
    expect(e[1]).toBeGreaterThan(0);
  });

  it('long line charge gives λ/(2πε0 d)', () => {
    const L = 2e5; // mm
    const lambda = 1e-11; // C/m
    const e = E(pack([[-L / 2, 0, 0, L / 2, 0, 0, lambda * (L / 1000), 0.01]]), [0, 0, 5]);
    expect(mag(e) / (lambda / (2 * Math.PI * EPS0 * 0.005))).toBeCloseTo(1, 4);
    expect(e[2]).toBeGreaterThan(0);
  });

  it('a charge over a plane is shielded below it and doubled-dipole above', () => {
    const plane: PlaneLayer = { layer: 1, net: 1, y: 0, coverage: 1, override: false, raster: { x0: -1e4, y0: -1e4, cell: 2e4, nx: 1, ny: 1, data: new Uint8Array([1]) } };
    const p = packCharges([{ a: [0, 0.5, 0], b: [0, 0.5, 0], q: 1e-12, r: 0.05, layer: 0 }], [plane], { ox: 0, oy: 0 });
    expect(p.count).toBe(2);
    const out = new Float64Array(3);
    eFieldAt(p, slotMaskTable(1), 0, -2, 0, 1, out);
    expect(mag(out)).toBe(0);
    eFieldAt(p, slotMaskTable(1), 0, 5, 0, 1, out);
    const single = 1e-12 / (4 * Math.PI * EPS0 * 0.0045 ** 2);
    expect(mag(out)).toBeLessThan(single); // the mirror charge pulls the field down
    expect(mag(out)).toBeGreaterThan(0);
  });
});

describe('charges on the demo board', () => {
  const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
  const frame = worldFrame(board);
  const planes = detectPlanes(board);
  const ctx = { board, frame, planes, fMax: 1e9 };

  it('a clock net carries roughly C_line + pad capacitance per volt', () => {
    const src: Source = {
      id: 'c', type: 'signal', kind: 'clock', name: '', enabled: true, color: '#fff', nets: ['CLK_GOOD'], driver: '',
      waveform: { f0: 25e6, duty: 0.5, tr: 1e-9, amplitude: 3.3 }, load: { model: 'capacitive', cLoad: 5e-12 },
    };
    const q = buildCharges(ctx, src).reduce((s, c) => s + c.q, 0);
    expect(q).toBeGreaterThan(0.3e-12);
    expect(q).toBeLessThan(5e-12);
  });

  it('a loop gets charges only when its switching node is given', () => {
    const loop: Source = {
      id: 'l', type: 'loop', name: '', enabled: true, color: '#fff', pads: ['C3.1', 'U3.1', 'U3.2', 'C3.2'],
      waveform: { f0: 5e5, duty: 0.3, tr: 5e-9, amplitude: 2 },
    };
    expect(buildCharges(ctx, loop)).toEqual([]);
    expect(buildCharges(ctx, { ...loop, node: { net: 'SW3', voltage: 12 } }).length).toBeGreaterThan(0);
  });
});
