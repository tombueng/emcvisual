import { describe, expect, it } from 'vitest';
import type { Footprint } from '../src/model/types';
import { crossover, filterPart } from '../src/physics/layoutRules';

const fp = (ref: string, value: string, lib = 'Inductor_SMD:L_0603_1608Metric') => ({ ref, value, lib }) as Footprint;

describe('filter parts', () => {
  it('reads ferrite impedances and inductances from the value field', () => {
    expect(filterPart(fp('FB1', '600R@100MHz'))).toEqual({ ohms: 600, assumed: false });
    expect(filterPart(fp('L1', 'FB0805/600R/2A'))).toEqual({ ohms: 600, assumed: false });
    expect(filterPart(fp('L14', 'IND0805_MURATA_BLM21PG221SN1D'))).toEqual({ ohms: 220, assumed: false });
    expect(filterPart(fp('FB2', 'FERRET'))).toEqual({ ohms: 600, assumed: true });
    expect(filterPart(fp('L2', '10uH'))!.henry).toBeCloseTo(10e-6, 12);
    expect(filterPart(fp('L10', '4u7'))!.henry).toBeCloseTo(4.7e-6, 12);
    expect(filterPart(fp('L1', '2,2uH'))!.henry).toBeCloseTo(2.2e-6, 12);
    // "2R2" is 2.2 µH on an inductor, not 2 Ω; without a unit it stays unread
    expect(filterPart(fp('L3', '2R2'))).toBeNull();
    expect(filterPart(fp('L4', 'DNP'))).toBeNull();
    expect(filterPart(fp('R1', '100R', 'Resistor_SMD:R_0603'))).toBeNull();
  });

  it('crossover: inductor at the parallel resonance, ferrite resistive above 100 MHz', () => {
    // catalogue example: 74 pF across a 600 Ω ferrite (L = 0.95 µH below 100 MHz) → about 19 MHz
    expect(crossover({ ohms: 600, assumed: false }, 74e-12) / 1e6).toBeCloseTo(19.1, 0);
    // 1 pF: the ferrite is resistive there, 1/(2π·C·Z) = 265 MHz
    expect(crossover({ ohms: 600, assumed: false }, 1e-12) / 1e6).toBeCloseTo(265, 0);
    expect(crossover({ henry: 10e-6, assumed: false }, 10e-12) / 1e6).toBeCloseTo(15.9, 1);
  });
});
