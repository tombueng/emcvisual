import { describe, expect, it } from 'vitest';
import { dipoleMoment, farMoment, limitAt } from '../src/physics/farfield';
import { packWithImages } from '../src/physics/images';
import type { CurrentElement } from '../src/physics/currents';
import type { PlaneLayer } from '../src/model/planes';
import { cispr32ClassB } from '../src/physics/farfield';
import { limitsFor } from '../src/physics/standards';

const frame = { ox: 0, oy: 0 };
/** A solid plane at height y covering -10…60 mm. */
function plane(y: number): PlaneLayer {
  const cell = 0.5;
  const nx = 140;
  return { layer: 1, net: 1, y, coverage: 1, override: false, raster: { x0: -10, y0: -10, cell, nx, ny: nx, data: new Uint8Array(nx * nx).fill(1) } };
}
const el = (a: [number, number, number], b: [number, number, number], vertical = false): CurrentElement => ({ a, b, w: 1, r: 0.1, vertical, layer: vertical ? -1 : 0, net: 2 });

describe('far-field dipole moment of a trace over a plane', () => {
  // 50 mm trace 0.2 mm above the plane, closed by verticals down to the plane at both ends
  const h = 0.2;
  const trace = [el([0, h, 0], [0, 0, 0], true), el([0, h, 0], [50, h, 0]), el([50, h, 0], [50, 0, 0], true)];
  // the first vertical carries the current up from the plane into the trace
  trace[0] = el([0, 0, 0], [0, h, 0], true);

  it('is h·L with the return in the plane (Ott eq. 12-2 counts the real loop area)', () => {
    const m = Math.hypot(...farMoment(trace, [plane(0)], frame)) * 1e6;
    expect(m).toBeCloseTo(50 * h, 3);
  });

  it('is twice that with mirror images (right for the near field above the plane only)', () => {
    const m = Math.hypot(...dipoleMoment(packWithImages(trace, [plane(0)], frame))) * 1e6;
    expect(m).toBeCloseTo(2 * 50 * h, 3);
  });
});

describe('limits at band edges', () => {
  it('apply the tighter value at a step (CISPR 32 annex A, FCC §15.109)', () => {
    expect(limitAt(cispr32ClassB(3), 230e6)).toBe(40);
    expect(limitAt(cispr32ClassB(3), 229e6)).toBe(40);
    expect(limitAt(cispr32ClassB(3), 231e6)).toBe(47);
    // at exactly 1 GHz the quasi-peak limit, not the average above
    expect(limitAt(limitsFor('cispr32-b', 3), 1e9)).toBe(47);
    expect(limitAt(limitsFor('fcc15-b', 3), 960e6)).toBe(46);
    expect(limitAt(limitsFor('fcc15-b', 3), 88e6)).toBe(40);
  });
});

describe('thinned-out spectra', () => {
  it('compare each harmonic with its own amplitude, not the band-power scaled one', async () => {
    const { trapezoidLines, lineAmp, trapezoidCoefficient } = await import('../src/physics/spectrum');
    const w = { f0: 500e3, duty: 0.3, tr: 5e-9, amplitude: 1 };
    // up to 6 GHz with 4096 lines kept: every 3rd harmonic, amp scaled by √3
    const lines = trapezoidLines(w, 6e9);
    const l = lines.find((x) => x.f > 100e6)!;
    const n = Math.round(l.f / w.f0);
    expect(lineAmp(l)).toBeCloseTo(trapezoidCoefficient(w, n) / Math.SQRT2, 12);
    expect(l.amp / lineAmp(l)).toBeCloseTo(Math.sqrt(3), 6);
  });
});
