import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { parseSExpr } from '../src/kicad/sexpr';
import type { BoardModel } from '../src/model/types';
import { dist } from '../src/model/geometry';

interface Reference {
  copperLayers: string[];
  thickness: number;
  outlineBBox: { x0: number; y0: number; x1: number; y1: number };
  nets: string[];
  footprints: string[];
  pads: {
    ref: string; number: string; x: number; y: number; angle: number; sizeX: number; sizeY: number;
    net: string; copperLayers: string[]; pinType: string; pinFunction: string;
  }[];
  vias: { x: number; y: number; net: string; diameter: number; drill: number }[];
  trackLengthByNet: Record<string, number>;
  zones: { net: string; layer: string; filledArea: number }[];
}

const norm = (a: number) => ((a % 360) + 360) % 360;

function compare(board: BoardModel, ref: Reference) {
  expect(board.layers.map((l) => l.name)).toEqual(ref.copperLayers);
  expect(new Set(board.nets.filter(Boolean))).toEqual(new Set(ref.nets));
  expect(board.footprints.map((f) => f.ref).sort()).toEqual([...ref.footprints].sort());

  // every pcbnew pad must exist with the same position, angle, size, net and layers
  const byKey = new Map<string, typeof board.pads>();
  for (const p of board.pads) {
    const k = `${p.ref}/${p.number}`;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  expect(board.pads.length).toBe(ref.pads.length);
  for (const rp of ref.pads) {
    const candidates = byKey.get(`${rp.ref}/${rp.number}`) ?? [];
    // several pads can share a number and position (exposed pad + thermal vias): match size too
    const score = (c: (typeof candidates)[number]) =>
      dist(c.at, rp) +
      Math.abs(c.size.x - rp.sizeX) +
      Math.abs(c.size.y - rp.sizeY) +
      (c.layers.map((i) => board.layers[i]!.name).join() === rp.copperLayers.join() ? 0 : 1);
    const p = candidates.reduce<(typeof candidates)[number] | undefined>(
      (best, c) => (!best || score(c) < score(best) ? c : best),
      undefined,
    );
    expect(p, `pad ${rp.ref}.${rp.number}`).toBeDefined();
    expect(dist(p!.at, rp), `position of ${rp.ref}.${rp.number}`).toBeLessThan(1e-3);
    expect(norm(p!.angle), `angle of ${rp.ref}.${rp.number}`).toBeCloseTo(norm(rp.angle), 3);
    expect(p!.size.x).toBeCloseTo(rp.sizeX, 4);
    expect(p!.size.y).toBeCloseTo(rp.sizeY, 4);
    expect(board.nets[p!.net]).toBe(rp.net);
    expect(p!.layers.map((i) => board.layers[i]!.name)).toEqual(rp.copperLayers);
    expect(p!.pinType).toBe(rp.pinType);
  }

  expect(board.vias.length).toBe(ref.vias.length);
  const vias = [...board.vias].sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  ref.vias.forEach((rv, i) => {
    const v = vias[i]!;
    expect(dist(v.at, rv)).toBeLessThan(1e-3);
    expect(board.nets[v.net]).toBe(rv.net);
    expect(v.diameter).toBeCloseTo(rv.diameter, 4);
  });

  const lengths = new Map<string, number>();
  for (const t of board.tracks) {
    const name = board.nets[t.net]!;
    lengths.set(name, (lengths.get(name) ?? 0) + dist(t.a, t.b));
  }
  for (const [net, len] of Object.entries(ref.trackLengthByNet)) {
    // arcs are discretised (chords are slightly shorter than the arc)
    expect(lengths.get(net) ?? 0, `track length of ${net}`).toBeCloseTo(len, 1);
  }

  const refAreas = new Map<string, number>();
  for (const rz of ref.zones) refAreas.set(`${rz.net}@${rz.layer}`, (refAreas.get(`${rz.net}@${rz.layer}`) ?? 0) + rz.filledArea);
  for (const [key, refArea] of refAreas) {
    const area = board.zones
      .filter((z) => `${board.nets[z.net]}@${board.layers[z.layer]!.name}` === key)
      .reduce((s, z) => s + z.area, 0);
    expect(area, `zone ${key}`).toBeCloseTo(refArea, 0);
  }

  // the outline bbox from pcbnew includes the line width
  const b = ref.outlineBBox;
  expect(board.bbox.x0).toBeGreaterThanOrEqual(b.x0 - 1e-6);
  expect(board.bbox.y0).toBeGreaterThanOrEqual(b.y0 - 1e-6);
  expect(board.bbox.x1).toBeLessThanOrEqual(b.x1 + 1e-6);
  expect(board.bbox.y1).toBeLessThanOrEqual(b.y1 + 1e-6);
  expect(b.x1 - b.x0 - (board.bbox.x1 - board.bbox.x0)).toBeLessThan(0.5);
}

describe('S-expression reader', () => {
  it('parses nested lists, quoted strings with escapes and atoms', () => {
    const r = parseSExpr('(a (b 1 "x \\"y\\"") c (d))');
    expect(r).toEqual(['a', ['b', '1', 'x "y"'], 'c', ['d']]);
  });

  it('rejects unbalanced input', () => {
    expect(() => parseSExpr('(a (b)')).toThrow();
    expect(() => parseSExpr('(a))')).toThrow();
  });
});

describe('KiCad 10 demo board', () => {
  const text = readFileSync('public/demo/demo-board.kicad_pcb', 'utf8');
  const ref = JSON.parse(readFileSync('tests/fixtures/demo-board.reference.json', 'utf8')) as Reference;
  const board = parseBoard(text, 'demo-board.kicad_pcb');

  it('matches pcbnew pads, vias, tracks and zones', () => compare(board, ref));

  it('reads the stack-up from the file', () => {
    expect(board.stackupFromFile).toBe(true);
    expect(board.layers.map((l) => l.y)).toEqual([
      0,
      expect.closeTo(-(0.035 / 2 + 0.2104 + 0.0152 / 2), 6),
      expect.closeTo(-(0.035 / 2 + 0.2104 + 0.0152 + 1.065 + 0.0152 / 2), 6),
      expect.closeTo(-(0.035 / 2 + 0.2104 + 0.0152 * 2 + 1.065 + 0.2104 + 0.035 / 2), 6),
    ]);
    expect(board.dielectrics[1]!.epsilonR).toBeCloseTo(4.6);
    expect(board.thickness).toBeCloseTo(1.5862, 4);
  });

  it('closes the outline with its rounded corners', () => {
    expect(board.outline.length).toBe(1);
    expect(board.bbox.x0).toBeCloseTo(100, 6);
    expect(board.bbox.y1).toBeCloseTo(130, 6);
    expect(board.warnings.filter((w) => w.startsWith('outline'))).toEqual([]);
  });

  it('places component bodies on their courtyards', () => {
    const u2 = board.footprints.find((f) => f.ref === 'U2')!;
    expect(dist(u2.body.center, { x: 155, y: 105 })).toBeLessThan(0.01);
    expect(u2.body.size.x).toBeGreaterThan(9);
  });
});

// KiCad's own demo boards (KiCad 9 format with numbered nets). Skipped where KiCad is not installed.
const demos = [
  ['stickhub/StickHub', 'StickHub'],
  ['royalblue54L_feather/RoyalBlue54L-Feather', 'RoyalBlue54L-Feather'],
  ['ecc83/ecc83-pp', 'ecc83-pp'],
] as const;
for (const [path, name] of demos) {
  const file = `/usr/share/kicad/demos/${path}.kicad_pcb`;
  describe.skipIf(!existsSync(file))(`KiCad demo ${name}`, () => {
    it('matches pcbnew', () => {
      const board = parseBoard(readFileSync(file, 'utf8'), `${name}.kicad_pcb`);
      const ref = JSON.parse(readFileSync(`tests/fixtures/kicad-demos/${name}.reference.json`, 'utf8')) as Reference;
      compare(board, ref);
    });
  });
}
