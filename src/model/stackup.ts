import type { CopperLayer, Dielectric, LayerKind } from './types';

/** One physical layer from KiCad's (setup (stackup ...)) in file order (top to bottom). */
export interface StackupEntry {
  name: string;
  type: string;
  thickness: number;
  epsilonR?: number;
  lossTangent?: number;
  material?: string;
}

export interface Stackup {
  layers: CopperLayer[];
  dielectrics: Dielectric[];
  fromFile: boolean;
  thickness: number;
}

const OUTER_CU = 0.035;
const INNER_CU = 0.0152;

/**
 * Build copper layers (with world heights) and the dielectrics between them.
 * copperNames must be ordered top to bottom (F.Cu, In1.Cu, ..., B.Cu).
 */
export function buildStackup(
  copperNames: string[],
  kinds: Map<string, LayerKind>,
  entries: StackupEntry[] | null,
  boardThickness: number,
): Stackup {
  const n = copperNames.length;
  const cuThickness = new Map<string, number>();
  const dielectrics: Dielectric[] = [];
  let fromFile = false;

  if (entries && entries.length > 0) {
    // Walk the physical order; dielectric thickness accumulates between two copper layers.
    let above = -1;
    let acc: { t: number; epsT: number; tanT: number; material: string; kind: string } | null = null;
    for (const e of entries) {
      const idx = copperNames.indexOf(e.name);
      if (idx >= 0) {
        cuThickness.set(e.name, e.thickness > 0 ? e.thickness : idx === 0 || idx === n - 1 ? OUTER_CU : INNER_CU);
        if (acc && above >= 0) {
          dielectrics.push({
            above,
            thickness: acc.t,
            epsilonR: acc.t > 0 ? acc.epsT / acc.t : 4.5,
            lossTangent: acc.t > 0 ? acc.tanT / acc.t : 0.02,
            material: acc.material,
            kind: acc.kind,
          });
        }
        above = idx;
        acc = null;
      } else if (above >= 0 && isDielectric(e.type)) {
        const t = e.thickness > 0 ? e.thickness : 0;
        const eps = e.epsilonR ?? 4.5;
        const tan = e.lossTangent ?? 0.02;
        if (!acc) acc = { t: 0, epsT: 0, tanT: 0, material: e.material ?? 'FR4', kind: e.type };
        acc.t += t;
        acc.epsT += eps * t;
        acc.tanT += tan * t;
      }
    }
    fromFile = dielectrics.length === Math.max(0, n - 1) && cuThickness.size === n;
  }

  if (!fromFile) {
    dielectrics.length = 0;
    cuThickness.clear();
    defaultStackup(copperNames, boardThickness, cuThickness, dielectrics);
  }

  const layers: CopperLayer[] = [];
  let y = 0;
  copperNames.forEach((name, i) => {
    const t = cuThickness.get(name) ?? OUTER_CU;
    if (i > 0) {
      const prev = layers[i - 1]!;
      const d = dielectrics.find((x) => x.above === i - 1)?.thickness ?? 0.2;
      y = prev.y - prev.thickness / 2 - d - t / 2;
    }
    layers.push({ name, index: i, y, thickness: t, kind: kinds.get(name) ?? 'signal' });
  });

  const first = layers[0];
  const last = layers[layers.length - 1];
  const thickness =
    first && last && layers.length > 1 ? first.y + first.thickness / 2 - (last.y - last.thickness / 2) : boardThickness;
  return { layers, dielectrics, fromFile, thickness };
}

function isDielectric(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'core' || t === 'prepreg' || t.includes('dielectric');
}

/** Defaults: 2 layers 1.6 mm FR4; 4 layers JLC04161H-7628; otherwise evenly spaced. */
function defaultStackup(names: string[], boardThickness: number, cu: Map<string, number>, out: Dielectric[]): void {
  const n = names.length;
  const total = boardThickness > 0 ? boardThickness : 1.6;
  names.forEach((name, i) => cu.set(name, i === 0 || i === n - 1 ? OUTER_CU : INNER_CU));
  if (n < 2) return;
  const copperSum = [...cu.values()].reduce((a, b) => a + b, 0);
  if (n === 4) {
    const prepreg = 0.2104;
    const core = Math.max(0.1, total - copperSum - 2 * prepreg);
    out.push({ above: 0, thickness: prepreg, epsilonR: 4.4, lossTangent: 0.02, material: '7628', kind: 'prepreg' });
    out.push({ above: 1, thickness: core, epsilonR: 4.6, lossTangent: 0.02, material: 'FR4', kind: 'core' });
    out.push({ above: 2, thickness: prepreg, epsilonR: 4.4, lossTangent: 0.02, material: '7628', kind: 'prepreg' });
    return;
  }
  const each = Math.max(0.05, (total - copperSum) / (n - 1));
  for (let i = 0; i < n - 1; i++) {
    out.push({ above: i, thickness: each, epsilonR: 4.5, lossTangent: 0.02, material: 'FR4', kind: i % 2 ? 'prepreg' : 'core' });
  }
}

/** Copper layer names in physical order: F.Cu, In1.Cu, In2.Cu, ..., B.Cu. */
export function sortCopperNames(names: string[]): string[] {
  const rank = (s: string) => {
    if (s === 'F.Cu') return -1;
    if (s === 'B.Cu') return 1e9;
    const m = /^In(\d+)\.Cu$/.exec(s);
    return m ? Number(m[1]) : 1e8;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}
