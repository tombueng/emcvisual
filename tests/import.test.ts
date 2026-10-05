/**
 * Import of other CAD formats (src/import): IPC-2581 and ODB++ exports of a test board must give
 * the same board as the KiCad original, with the same findings; the Eagle importer is checked on
 * a hand-written board with the cases that need care (bottom side, design-rule sizes, pours).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { boardBaseName, detectFormat, importBoard, isBoardFileName } from '../src/import';
import { parseXml } from '../src/import/xml';
import { parseSymbol } from '../src/import/odb';
import { keyhole } from '../src/import/builder';
import { signedArea } from '../src/model/geometry';
import { runCheck } from '../src/cli/fieldCheck';
import type { BoardModel } from '../src/model/types';

const DIR = 'tests/fixtures/import';
const bytes = (p: string) => new Uint8Array(readFileSync(p)).buffer;
const kicad = parseBoard(readFileSync('tests/fixtures/emc-cases/slot-clock.bad.kicad_pcb', 'utf8'), 'slot-clock.bad.kicad_pcb');
const length = (b: BoardModel) => b.tracks.reduce((s, t) => s + Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y), 0);
const zoneArea = (b: BoardModel, net: string, layer: string) =>
  b.zones.filter((z) => b.nets[z.net] === net && b.layers[z.layer]!.name === layer).reduce((s, z) => s + z.area, 0);

function sameBoard(b: BoardModel) {
  expect(b.layers.map((l) => l.name)).toEqual(kicad.layers.map((l) => l.name));
  b.layers.forEach((l, i) => expect(l.y).toBeCloseTo(kicad.layers[i]!.y, 2));
  expect(new Set(b.nets)).toEqual(new Set(kicad.nets));
  expect(b.pads.filter((p) => p.number).length).toBe(kicad.pads.filter((p) => p.number).length);
  expect(length(b)).toBeCloseTo(length(kicad), 0);
  expect(b.vias.length).toBe(kicad.vias.length);
  expect(b.bbox.x0).toBeCloseTo(kicad.bbox.x0, 2);
  expect(b.bbox.y1).toBeCloseTo(kicad.bbox.y1, 2);
  for (const z of kicad.zones) {
    const name = kicad.nets[z.net]!;
    const layer = kicad.layers[z.layer]!.name;
    expect(zoneArea(b, name, layer) / zoneArea(kicad, name, layer)).toBeCloseTo(1, 2);
  }
  // every numbered pad sits where KiCad has it, with its net
  for (const p of kicad.pads.filter((x) => x.number)) {
    const q = b.pads.find((x) => x.ref === p.ref && x.number === p.number && Math.hypot(x.at.x - p.at.x, x.at.y - p.at.y) < 0.02);
    expect(q, `${p.ref}.${p.number}`).toBeDefined();
    expect(b.nets[q!.net]).toBe(kicad.nets[p.net]);
  }
}

describe('format detection', () => {
  it('recognises the formats from their content and names', () => {
    expect(detectFormat('a.kicad_pcb', '(kicad_pcb (version 20240108)')).toBe('kicad');
    expect(detectFormat('a.xml', '<?xml version="1.0"?>\n<IPC-2581 revision="C">')).toBe('ipc2581');
    expect(detectFormat('a.brd', '<?xml version="1.0"?>\n<!DOCTYPE eagle SYSTEM "eagle.dtd">\n<eagle version="9.6">')).toBe('eagle');
    expect(isBoardFileName('board.TGZ')).toBe(true);
    expect(boardBaseName('job.odb.tgz')).toBe('job.odb');
    expect(boardBaseName('x.kicad_pcb')).toBe('x');
  });

  it('explains binary Eagle files and unknown formats', async () => {
    await expect(importBoard('old.brd', new Uint8Array([0x10, 0x80, 0x00, 0x01]).buffer)).rejects.toThrow(/binary Eagle/);
    await expect(importBoard('x.txt', 'hello')).rejects.toThrow(/unknown board format/);
  });
});

describe('IPC-2581', () => {
  it('a KiCad export gives the same board and the same findings as the original', async () => {
    const b = await importBoard('slot-clock.bad.ipc2581.xml', bytes(`${DIR}/slot-clock.bad.ipc2581.xml`));
    sameBoard(b);
    const scenario = JSON.parse(readFileSync('tests/fixtures/emc-cases/cases.json', 'utf8'))['slot-clock'];
    const sc = { kind: 'pcb-field-scenario', version: 1, board: { fileName: 'x', hash: '' }, settings: { quality: 'normal', fMax: 1e9, planeOverrides: {} }, sources: scenario.sources };
    const a = runCheck(readFileSync('tests/fixtures/emc-cases/slot-clock.bad.kicad_pcb', 'utf8'), 'x', sc, { height: 2, step: 1 });
    const c = runCheck(b, 'x', sc, { height: 2, step: 1 });
    expect(c.sources.map((s) => s.hints.map((h) => h.kind))).toEqual(a.sources.map((s) => s.hints.map((h) => h.kind)));
    expect(c.sources[0]!.far!.margin).toBeCloseTo(a.sources[0]!.far!.margin, 0);
  });
});

describe('ODB++', () => {
  it('a KiCad export (zip and tgz) gives the same board as the original', async () => {
    for (const f of ['slot-clock.bad.odb.zip', 'slot-clock.bad.odb.tgz']) sameBoard(await importBoard(f, bytes(`${DIR}/${f}`)));
  });

  it('reads the standard symbols in microns and mils', () => {
    expect(parseSymbol('r600', 0.001)).toEqual({ shape: 'circle', w: 0.6, h: 0.6 });
    expect(parseSymbol('rect1200x900xr100', 0.001)).toEqual({ shape: 'roundrect', w: 1.2, h: 0.9 });
    expect(parseSymbol('oval40x80', 0.0254).h).toBeCloseTo(2.032, 6);
    expect(parseSymbol('s20', 0.0254)).toEqual({ shape: 'rect', w: 0.508, h: 0.508 });
  });
});

describe('Eagle', () => {
  const b = (() => {
    let out: BoardModel | null = null;
    return async () => (out ??= await importBoard('eagle-test.brd', readFileSync(`${DIR}/eagle-test.brd`, 'utf8')));
  })();

  it('layers from the layer setup, supply layer as a plane', async () => {
    const m = await b();
    expect(m.layers.map((l) => l.name)).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
    // $GND on layer 2: the whole board minus the edge margin and the anti-pads of other nets
    expect(zoneArea(m, 'GND', 'In1.Cu')).toBeGreaterThan(1100);
    expect(zoneArea(m, 'GND', 'In1.Cu')).toBeLessThan(39 * 29);
  });

  it('places a mirrored element on the bottom side like KiCad does', async () => {
    const m = await b();
    const r2 = m.footprints.find((f) => f.ref === 'R2')!;
    expect(r2.side).toBe('bottom');
    const p1 = m.pads.find((p) => p.ref === 'R2' && p.number === '1')!;
    expect(p1.at.x).toBeCloseTo(20, 3);
    expect(p1.at.y).toBeCloseTo(-9.2, 3);
    expect(p1.layers).toEqual([3]);
    expect(m.nets[p1.net]).toBe('CLK');
  });

  it('sizes vias and pads from the design rules', async () => {
    const m = await b();
    // drill 0.3: annular ring max(0.25·0.3, 8 mil) = 0.2032 → 0.7064
    expect(m.vias[0]!.diameter).toBeCloseTo(0.7064, 4);
    const j1 = m.pads.filter((p) => p.ref === 'J1');
    expect(j1[0]!.size.x).toBeCloseTo(1.508, 3); // drill 1 + 2·10 mil
    expect(j1[1]!.shape).toBe('oval');
    expect(j1[1]!.size.x).toBeCloseTo(3.016, 3); // long pad: 100 % elongation
    expect(m.pads.find((p) => p.ref === 'H1')!.kind).toBe('np_thru_hole');
  });

  it('pours the polygons: clearances, restrict area, no unconnected islands', async () => {
    const m = await b();
    const bottom = m.zones.find((z) => m.nets[z.net] === 'GND' && m.layers[z.layer]!.name === 'B.Cu')!;
    expect(bottom).toBeDefined();
    const covered = (x: number, y: number) => bottom.polygons.some((r) => inRing(x, y, r));
    expect(covered(5, -5)).toBe(true);
    expect(covered(35, -25 + 2)).toBe(false); // bRestrict circle around the mounting hole
    expect(covered(0.2, -15)).toBe(false); // copper-to-dimension margin 0.5 mm
    expect(covered(18, -10)).toBe(false); // CLK via with its clearance
    // the GND polygon on top touches no GND copper: removed (orphans="no")
    expect(zoneArea(m, 'GND', 'F.Cu')).toBe(0);
    expect(m.warnings).toContain('eagle-pour-computed');
  });
});

describe('building blocks', () => {
  it('reads XML with entities, comments, CDATA and namespaces', () => {
    const x = parseXml('<?xml version="1.0"?><!-- c --><a:root x="1 &amp; 2"><b>t&lt;</b><![CDATA[<raw>]]><c/></a:root>');
    expect(x.name).toBe('root');
    expect(x.attrs.x).toBe('1 & 2');
    expect(x.children.map((c) => c.name)).toEqual(['b', 'c']);
    expect(x.children[0]!.text).toBe('t<');
  });

  it('keyhole rings keep the area of outer minus holes', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hole = [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 4 },
    ];
    expect(Math.abs(signedArea(keyhole(outer, [hole])))).toBeCloseTo(96, 6);
  });
});

function inRing(x: number, y: number, ring: { x: number; y: number }[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
