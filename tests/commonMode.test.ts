import { describe, expect, it } from 'vitest';
import { MU0 } from '../src/physics/units';

describe('common mode with cables (Clemson expert system)', () => {
  it('reproduces the worked example: 50 mm clock, h = 0.21 mm, 60 mm wide board', () => {
    // L_p = (4/π²)·µ0·l·h/(d1+d2); V = ω·L_p·I; E = 2·√(30/100)·V/3 m
    const lp = ((4 / Math.PI ** 2) * MU0 * 0.05 * 0.21e-3) / 0.06;
    expect(lp * 1e9).toBeCloseTo(0.089, 3);
    const v = 2 * Math.PI * 75e6 * lp * 7e-3;
    expect(v * 1e3).toBeCloseTo(0.29, 2);
    const e = ((2 * Math.sqrt(30 / 100)) / 3) * v;
    expect(20 * Math.log10(e) + 120).toBeCloseTo(40.6, 0);
  });
});
