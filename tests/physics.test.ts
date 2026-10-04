import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addElementsField, fieldAt, slotMaskTable } from '../src/physics/biotsavart';
import { packWithImages, STRIDE } from '../src/physics/images';
import { microstrip } from '../src/physics/lines';
import { trapezoidCoefficient, trapezoidLines } from '../src/physics/spectrum';
import { parseEng, formatEng } from '../src/physics/units';
import { buildSource, type CurrentElement, type PhysicsContext } from '../src/physics/currents';
import { covered, detectPlanes, type PlaneLayer } from '../src/model/planes';
import { parseBoard } from '../src/kicad/parseBoard';
import { worldFrame } from '../src/model/world';
import type { Source } from '../src/physics/sources';

const pack = (segs: [number, number, number, number, number, number, number, number][]) => {
  const data = new Float64Array(segs.length * STRIDE);
  segs.forEach((s, i) => data.set(s, i * STRIDE));
  return data;
};
const H = (data: Float64Array, p: [number, number, number]) => {
  const out = new Float64Array(3);
  addElementsField(data, 0, data.length / STRIDE, p[0], p[1], p[2], out);
  return out;
};
const mag = (v: ArrayLike<number>) => Math.hypot(v[0]!, v[1]!, v[2]!);

describe('Biot-Savart', () => {
  it('long straight wire gives I/(2πd)', () => {
    const d = pack([[-1e5, 0, 0, 1e5, 0, 0, 1, 0.01]]);
    const h = H(d, [0, 10, 0]);
    expect(mag(h)).toBeCloseTo(1 / (2 * Math.PI * 0.01), 3);
    // right-hand rule: current +x, point +y -> field +z
    expect(h[2]).toBeGreaterThan(0);
  });

  it('square loop centre gives 2√2·I/(π·a)', () => {
    const a = 10;
    const s = a / 2;
    const d = pack([
      [-s, 0, -s, s, 0, -s, 1, 0.01],
      [s, 0, -s, s, 0, s, 1, 0.01],
      [s, 0, s, -s, 0, s, 1, 0.01],
      [-s, 0, s, -s, 0, -s, 1, 0.01],
    ]);
    expect(mag(H(d, [0, 0, 0]))).toBeCloseTo((2 * Math.SQRT2) / (Math.PI * a * 1e-3), 2);
  });

  it('circular loop on its axis gives I·R²/(2(R²+z²)^1.5)', () => {
    const R = 10;
    const n = 720;
    const segs: [number, number, number, number, number, number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a0 = (2 * Math.PI * k) / n;
      const a1 = (2 * Math.PI * (k + 1)) / n;
      segs.push([R * Math.cos(a0), 0, R * Math.sin(a0), R * Math.cos(a1), 0, R * Math.sin(a1), 1, 0.01]);
    }
    const z = 5;
    const expected = (R * 1e-3) ** 2 / (2 * ((R * 1e-3) ** 2 + (z * 1e-3) ** 2) ** 1.5);
    expect(mag(H(pack(segs), [0, z, 0])) / expected).toBeCloseTo(1, 4);
  });

  it('core regularisation keeps the field finite on the conductor', () => {
    const d = pack([[-50, 0, 0, 50, 0, 0, 1, 0.1]]);
    const on = mag(H(d, [0, 0.01, 0]));
    const edge = mag(H(d, [0, 0.1, 0]));
    expect(on).toBeLessThan(edge);
    expect(Number.isFinite(on)).toBe(true);
  });
});

/** A plane at height y covering everything (for synthetic tests). */
function fullPlane(y: number): PlaneLayer {
  return {
    layer: 1,
    net: 1,
    y,
    coverage: 1,
    override: false,
    raster: { x0: -1e4, y0: -1e4, cell: 2e4, nx: 1, ny: 1, data: new Uint8Array([1]) },
  };
}
const frame0 = { ox: 0, oy: 0 };
const el = (a: [number, number, number], b: [number, number, number], vertical = false): CurrentElement => ({
  a, b, w: 1, r: 0.05, vertical, layer: vertical ? -1 : 0, net: 1,
});

describe('mirror images and shielding', () => {
  const plane = fullPlane(0);
  const masks = slotMaskTable(1);

  it('a wire over a plane equals the wire plus a reversed wire at the mirror height', () => {
    const p = packWithImages([el([-1e4, 0.2, 0], [1e4, 0.2, 0])], [plane], frame0);
    expect(p.count).toBe(2);
    const out = new Float64Array(3);
    fieldAt(p, masks, 0, 5, 0, 1, out);
    const manual = H(pack([[-1e4, 0.2, 0, 1e4, 0.2, 0, 1, 0.05], [-1e4, -0.2, 0, 1e4, -0.2, 0, -1, 0.05]]), [0, 5, 0]);
    expect(out[2]).toBeCloseTo(manual[2]!, 6);
    // the pair falls off like a 2D dipole, far below a single wire
    expect(mag(out)).toBeLessThan(0.1 * (1 / (2 * Math.PI * 4.8e-3)));
  });

  it('nothing reaches the far side of a covering plane', () => {
    const p = packWithImages([el([-10, 0.2, 0], [10, 0.2, 0])], [plane], frame0);
    const out = new Float64Array(3);
    fieldAt(p, masks, 0, -3, 0, 1, out);
    expect(mag(out)).toBe(0);
    // without copper in that column (outside the board) the field leaks around
    fieldAt(p, masks, 0, -3, 0, 0, out);
    expect(mag(out)).toBeGreaterThan(0);
  });

  it('a vertical current into the plane continues in the same direction in its image', () => {
    const p = packWithImages([el([0, 0.5, 0], [0, 0, 0], true)], [plane], frame0);
    const out = new Float64Array(3);
    fieldAt(p, masks, 3, 0.3, 0, 1, out);
    const straight = H(pack([[0, 0.5, 0, 0, -0.5, 0, 1, 0.05]]), [3, 0.3, 0]);
    expect(out[0]).toBeCloseTo(straight[0]!, 9);
    expect(out[2]).toBeCloseTo(straight[2]!, 9);
  });
});

describe('spectra and lines', () => {
  it('trapezoid coefficients match a numerical Fourier transform', () => {
    const w = { f0: 1e6, duty: 0.3, tr: 20e-9, amplitude: 3.3 };
    const N = 1 << 14;
    const T = 1 / w.f0;
    const tau = w.duty * T;
    const sample = (t: number) => {
      // trapezoid centred on t = 0 with 50 % width tau and linear edges of tr
      const x = Math.abs(((t + T / 2) % T) - T / 2);
      const a = tau / 2 - w.tr / 2;
      const b = tau / 2 + w.tr / 2;
      return x <= a ? w.amplitude : x >= b ? 0 : (w.amplitude * (b - x)) / w.tr;
    };
    for (const n of [1, 2, 3, 7, 25]) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < N; k++) {
        const t = (k / N) * T;
        re += sample(t) * Math.cos((2 * Math.PI * n * k) / N);
        im += sample(t) * Math.sin((2 * Math.PI * n * k) / N);
      }
      const cn = (2 / N) * Math.hypot(re, im);
      expect(trapezoidCoefficient(w, n)).toBeCloseTo(cn, 3);
    }
  });

  it('lines are RMS and drop even harmonics at 50 % duty', () => {
    const lines = trapezoidLines({ f0: 25e6, duty: 0.5, tr: 1e-9, amplitude: 1 }, 1e9);
    expect(lines[0]!.f).toBe(25e6);
    expect(lines[0]!.amp).toBeCloseTo((2 / Math.PI) / Math.SQRT2 * Math.abs(Math.sin(Math.PI * 25e6 * 1e-9) / (Math.PI * 25e6 * 1e-9)), 6);
    expect(lines.some((l) => Math.round(l.f / 25e6) % 2 === 0)).toBe(false);
  });

  it('a 1.9:1 microstrip on FR4 is about 50 Ω', () => {
    const p = microstrip(0.38, 0.2, 4.4);
    expect(p.z0).toBeGreaterThan(46);
    expect(p.z0).toBeLessThan(54);
    expect(p.cPerM).toBeGreaterThan(80e-12);
    expect(p.cPerM).toBeLessThan(140e-12);
  });

  it('parses and formats engineering values', () => {
    expect(parseEng('25 MHz')).toBe(25e6);
    expect(parseEng('3,3 V')).toBeCloseTo(3.3);
    expect(parseEng('1ns')).toBeCloseTo(1e-9);
    expect(parseEng('5p')).toBeCloseTo(5e-12);
    expect(parseEng('abc')).toBeNaN();
    expect(formatEng(25e6, 'Hz')).toBe('25 MHz');
    expect(formatEng(3.3e-9, 's')).toBe('3,3 ns');
  });
});

describe('demo board sources', () => {
  const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
  const frame = worldFrame(board);
  const planes = detectPlanes(board);
  const ctx: PhysicsContext = { board, frame, planes, fMax: 1e9 };

  it('finds the two inner planes and the slot', () => {
    expect(planes.map((p) => `${board.layers[p.layer]!.name}=${board.nets[p.net]}`)).toEqual(['In1.Cu=GND', 'In2.Cu=+3V3']);
    const gnd = planes[0]!;
    expect(covered(gnd.raster, 100 + 39, 80 + 20)).toBe(false); // in the slot
    expect(covered(gnd.raster, 100 + 50, 80 + 20)).toBe(true);
    expect(covered(gnd.raster, 100 + 15, 80 + 40)).toBe(false); // cut-out under the bad buck
  });

  /** Sum of currents into every point must vanish once images are included (∇·J = 0). */
  const divergence = (src: Source) => {
    const m = buildSource(ctx, src);
    const p = packWithImages(m.elements, planes, frame);
    const net = new Map<string, number>();
    const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    for (let i = 0; i < p.count; i++) {
      const o = i * STRIDE;
      const w = p.data[o + 6]!;
      const a = key(p.data[o]!, p.data[o + 1]!, p.data[o + 2]!);
      const b = key(p.data[o + 3]!, p.data[o + 4]!, p.data[o + 5]!);
      net.set(a, (net.get(a) ?? 0) - w);
      net.set(b, (net.get(b) ?? 0) + w);
    }
    // a plane point collects the vertical piece ending there and its image starting there
    return Math.max(...[...net.values()].map(Math.abs));
  };

  const clock: Source = {
    id: 'c', type: 'signal', kind: 'clock', name: 'clk', enabled: true, color: '#fff',
    nets: ['CLK_GOOD_SRC', 'CLK_GOOD'], driver: 'Y1.3',
    waveform: { f0: 25e6, duty: 0.5, tr: 1e-9, amplitude: 3.3 }, load: { model: 'capacitive', cLoad: 5e-12 },
  };
  const loop: Source = {
    id: 'l', type: 'loop', name: 'buck', enabled: true, color: '#fff', pads: ['C1.1', 'U1.1', 'U1.2', 'C1.2'],
    waveform: { f0: 5e5, duty: 0.3, tr: 5e-9, amplitude: 2 },
  };

  it('builds a closed current system for a clock net through a series resistor', () => {
    const m = buildSource(ctx, clock);
    expect(m.info.driver).toBe('Y1.3');
    expect(m.info.cTotal!).toBeGreaterThan(5e-12);
    expect(m.info.lengthMm).toBeGreaterThan(5);
    expect(divergence(clock)).toBeLessThan(1e-9);
  });

  it('builds a closed current system for a buck hot loop', () => {
    const m = buildSource(ctx, loop);
    expect(m.elements.length).toBeGreaterThan(3);
    expect(divergence(loop)).toBeLessThan(1e-9);
  });

  it('the sprawling buck loop makes a stronger field than the tight one', () => {
    const bad: Source = { ...loop, id: 'b', pads: ['C3.1', 'U3.1', 'U3.2', 'C3.2'] } as Source;
    const at = (src: Source, x: number, z: number) => {
      const p = packWithImages(buildSource(ctx, src).elements, planes, frame);
      const out = new Float64Array(3);
      fieldAt(p, slotMaskTable(p.planeY.length), x - frame.ox, 3, z - frame.oy, 0, out);
      return mag(out);
    };
    // 3 mm above each regulator
    expect(at(bad, 113, 120)).toBeGreaterThan(10 * at(loop, 119, 88));
  });
});

describe('inductor stray field (stage 2c)', () => {
  it('triangle ripple at 50 % has 4·A/(π² n²) on odd harmonics only', async () => {
    const { triangleLines } = await import('../src/physics/spectrum');
    const lines = triangleLines({ f0: 1e6, duty: 0.5, tr: 0, amplitude: 1 }, 10e6);
    expect(lines[0]!.amp).toBeCloseTo(4 / (Math.PI * Math.PI) / Math.SQRT2, 9);
    expect(lines.find((l) => l.f === 3e6)!.amp).toBeCloseTo(4 / (9 * Math.PI * Math.PI) / Math.SQRT2, 9);
    expect(lines.some((l) => l.f === 2e6)).toBe(false);
  });

  it('an open drum core leaks more field than a shielded one', () => {
    const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
    const frame = worldFrame(board);
    const planes = detectPlanes(board);
    const ctx: PhysicsContext = { board, frame, planes, fMax: 1e9 };
    const at = (shielding: 'open' | 'shielded') => {
      const m = buildSource(ctx, { id: 'i', type: 'inductor', name: '', enabled: true, color: '#fff', ref: 'L3', shielding, waveform: { f0: 5e5, duty: 0.3, tr: 0, amplitude: 0.6 } });
      const p = packWithImages(m.elements, planes, frame);
      const out = new Float64Array(3);
      const l3 = board.footprints.find((f) => f.ref === 'L3')!;
      fieldAt(p, slotMaskTable(p.planeY.length), l3.body.center.x - frame.ox, 4, l3.body.center.y - frame.oy, 0, out);
      return mag(out);
    };
    expect(at('open')).toBeGreaterThan(10 * at('shielded'));
  });
});
