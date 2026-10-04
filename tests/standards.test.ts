import { describe, expect, it } from 'vitest';
import { limitsFor, STANDARDS, specDistance } from '../src/physics/standards';
import { limitAt } from '../src/physics/farfield';

describe('emission standards', () => {
  it('has the tabulated limits', () => {
    expect(limitAt(limitsFor('cispr32-b', 3), 100e6)).toBe(40);
    expect(limitAt(limitsFor('cispr32-b', 10), 500e6)).toBe(37);
    expect(limitAt(limitsFor('cispr32-a', 3), 500e6)).toBe(57);
    expect(limitAt(limitsFor('cispr32-b', 3), 2e9)).toBe(50);
    // FCC §15.109: 100/150/200/500 µV/m at 3 m
    expect(limitAt(limitsFor('fcc15-b', 3), 50e6)).toBe(40);
    expect(limitAt(limitsFor('fcc15-b', 3), 100e6)).toBe(43.5);
    expect(limitAt(limitsFor('fcc15-b', 3), 300e6)).toBe(46);
    expect(limitAt(limitsFor('fcc15-b', 3), 1.5e9)).toBe(54);
    expect(limitAt(limitsFor('fcc15-a', 10), 300e6)).toBe(46.4);
  });

  it('converts an untabulated distance with 20 dB per decade', () => {
    // FCC class B is given at 3 m: at 10 m it is 10.5 dB lower
    expect(limitAt(limitsFor('fcc15-b', 10), 50e6)).toBeCloseTo(40 - 10.5, 1);
    // CISPR 11 class A is given at 10 m
    expect(limitAt(limitsFor('cispr11-a', 3), 100e6)).toBeCloseTo(40 + 10.5, 1);
    expect(specDistance('fcc15-a')).toBe(10);
    expect(STANDARDS.length).toBeGreaterThanOrEqual(7);
  });
});
