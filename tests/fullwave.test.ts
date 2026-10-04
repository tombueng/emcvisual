import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { detectPlanes } from '../src/model/planes';
import { worldFrame } from '../src/model/world';
import { buildSource, type SourceModel } from '../src/physics/currents';
import type { Source } from '../src/physics/sources';
import { makeGrid } from '../src/compute/grid';
import { buildJob, capacitorValue, jobFrequencies, resistorValue, FULLWAVE_JOB_KIND } from '../src/fullwave/job';

describe('full-wave job export', () => {
  const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
  const frame = worldFrame(board);
  const planes = detectPlanes(board);
  const ctx = { board, frame, planes, fMax: 1e9 };
  const scenario = JSON.parse(readFileSync('public/demo/demo-board.scenario.json', 'utf8')) as { sources: Source[] };
  const models: Record<string, SourceModel> = {};
  for (const s of scenario.sources) models[s.id] = buildSource(ctx, s);
  const grid = makeGrid(board, frame, { quality: 'preview' });
  const job = buildJob(ctx, scenario.sources, models, grid, { fileName: 'demo-board.kicad_pcb', hash: 'test' });

  it('writes geometry, stack-up and one entry per simulated source', () => {
    expect(job.kind).toBe(FULLWAVE_JOB_KIND);
    expect(job.layers).toHaveLength(4);
    expect(job.dielectrics).toHaveLength(3);
    // dielectrics lie between the copper layers, top to bottom
    for (const d of job.dielectrics) expect(d.zTop).toBeGreaterThan(d.zBottom);
    expect(job.copper.length).toBe(4);
    expect(job.barrels.length).toBeGreaterThan(10);
    // inductors are not simulated in full wave (yet)
    expect(job.skipped.map((s) => s.reason)).toEqual(['inductor', 'inductor']);
    expect(job.sources).toHaveLength(scenario.sources.length - 2);
  });

  it('drives a hot loop across the switch and shorts the input capacitor', () => {
    const loop = job.sources.find((s) => s.type === 'loop')!;
    expect(loop.ports).toHaveLength(1);
    expect(loop.ports[0]!.label).toMatch(/^U\d+\.\d+-U\d+\.\d+$/);
    expect(loop.shorts.every((s) => /^C/.test(s.label))).toBe(true);
    expect(loop.shorts.length).toBeGreaterThan(0);
  });

  it('drives a signal from its driver pad down to the plane, with loads at the receivers', () => {
    const sig = job.sources.find((s) => s.type === 'signal')!;
    const p = sig.ports[0]!;
    expect(p.dir).toBe('z');
    // F.Cu pad (z = 0) down to the GND plane on In1.Cu
    expect(p.stop[2]).toBeCloseTo(0, 6);
    expect(p.start[2]).toBeLessThan(0);
    expect(sig.lumped.length).toBeGreaterThan(0);
    const diff = job.sources.find((s) => s.type === 'diffpair')!;
    expect(diff.ports.map((q) => q.excite)).toEqual([1, -1]);
  });

  it('parses resistor values and spaces frequencies logarithmically', () => {
    expect(resistorValue('33R')).toBe(33);
    expect(resistorValue('4k7')).toBeCloseTo(4700);
    expect(resistorValue('22')).toBe(22);
    expect(resistorValue('0R')).toBe(0);
    expect(capacitorValue('100n')).toBeCloseTo(100e-9, 15);
    expect(capacitorValue('4u7')).toBeCloseTo(4.7e-6, 12);
    expect(capacitorValue('10uF')).toBeCloseTo(10e-6, 12);
    expect(capacitorValue('22p')).toBeCloseTo(22e-12, 18);
    expect(capacitorValue('BAT54')).toBeNaN();
    // the demo's capacitors are in the job, between their two nets
    expect(job.caps.length).toBeGreaterThanOrEqual(4);
    for (const c of job.caps) expect(c.nets[0]).not.toBe(c.nets[1]);
    const f = jobFrequencies(20e6, 1e9, 12);
    expect(f[0]).toBe(20e6);
    expect(f[f.length - 1]).toBe(1e9);
    expect(f[1]! / f[0]!).toBeCloseTo(f[11]! / f[10]!, 1);
  });

  // FULLWAVE_JOB_OUT=tools/openems/runs/demo.job.json npx vitest run tests/fullwave.test.ts
  it.runIf(!!process.env.FULLWAVE_JOB_OUT)('writes the demo job for tools/openems/run_job.py', () => {
    const out = process.env.FULLWAVE_JOB_OUT!;
    mkdirSync(dirname(out), { recursive: true });
    // on the app's default grid (quality "normal"), as the export button writes it
    const appJob = buildJob(ctx, scenario.sources, models, makeGrid(board, frame, { quality: 'normal' }), { fileName: 'demo-board.kicad_pcb', hash: 'test' });
    writeFileSync(out, JSON.stringify(appJob));
  });
});

// Needs an openEMS run of the demo job (tools/openems/run_job.py); skipped otherwise.
const RESULT = ['tools/openems/runs/demo-full.fullwave.bin', 'tools/openems/runs/demo.job.fullwave.bin'].find((f) => existsSync(f)) ?? '';
describe.runIf(!!RESULT)('full wave against the fast model (quasi-static limit)', () => {
  it('agrees with stage 1 above the hot loops at the lowest frequency', async () => {
    const { parseFullwave, decodeTable } = await import('../src/fullwave/result');
    const { computeBlock } = await import('../src/compute/fieldKernel');
    const { coverColumns } = await import('../src/compute/grid');
    const { packWithImages } = await import('../src/physics/images');
    const { applyReturnModel } = await import('../src/physics/returnPaths');
    const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
    const frame = worldFrame(board);
    const planes = detectPlanes(board);
    const ctx = { board, frame, planes, fMax: 1e9 };
    const r = parseFullwave(readFileSync(RESULT).buffer as ArrayBuffer);
    const scenario = JSON.parse(readFileSync('public/demo/demo-board.scenario.json', 'utf8')) as { sources: Source[] };
    const lut = decodeTable();
    const g = r.grid;
    const cover = coverColumns(g, planes, frame);
    const report: string[] = [];
    for (const meta of r.sources) {
      const src = scenario.sources.find((s) => s.id === meta.id)!;
      const m = buildSource(ctx, src);
      const els = applyReturnModel(ctx, src, m.elements).elements;
      const fast = computeBlock(packWithImages(els, planes, frame), g, cover, 0, g.nz);
      let max = 0;
      for (const v of fast) max = Math.max(max, v);
      const stats = (full: Int16Array) => {
        const diffs: number[] = [];
        for (let iz = 0; iz < g.nz; iz++)
          for (let iy = 0; iy < g.ny; iy++) {
            const h = g.y0 + iy * g.dy;
            if (h < 3) continue;
            for (let ix = 0; ix < g.nx; ix++) {
              const i = ix + g.nx * (iy + g.ny * iz);
              if (fast[i]! < max * 1e-3 || full[i] === -32768) continue;
              diffs.push(10 * Math.log10(lut[full[i]! + 32768]! / fast[i]!));
            }
          }
        diffs.sort((a, b) => a - b);
        return (p: number) => (diffs.length ? diffs[Math.floor(p * (diffs.length - 1))]! : NaN);
      };
      const blocks = r.blocks.get(meta.id)!;
      blocks.forEach((b, k) => {
        const q = stats(b);
        report.push(`${meta.id} ${(r.freqs[k]! / 1e6).toFixed(0)} MHz: median ${q(0.5).toFixed(1)} dB, 10–90 % ${q(0.1).toFixed(1)}…${q(0.9).toFixed(1)} dB`);
      });
      // hot loops: in the quasi-static range both must agree within a few dB, 3 mm and more
      // above the board (signal lines also depend on the driver and load model, so only report)
      if (src.type === 'loop') expect(Math.abs(stats(blocks[0]!)(0.5))).toBeLessThan(3);
    }
    console.log(report.join('\n'));
  });
});

describe('full-wave result file', () => {
  /** A file as run_job.py writes it: one source, two frequencies, constant values. */
  const makeFile = (grid: { nx: number; ny: number; nz: number; x0: number; y0: number; z0: number; dx: number; dy: number; dz: number }) => {
    const header = {
      kind: 'pcb-field-fullwave-result', version: 1, createdAt: '', board: { fileName: 'b', hash: 'h' }, grid, freqs: [1e7, 1e8],
      sources: [{ id: 's', name: 'S', seconds: 1, farE3mPerA: [1e-3, 1e-2], zin: [[1, 0], [1, 1]] }], skipped: [], solver: { name: 'openEMS', res: 0.5, seconds: 2 },
    };
    let head = new TextEncoder().encode(JSON.stringify(header));
    const pad = (4 - (head.length % 4)) % 4;
    head = new Uint8Array([...head, ...new Array(pad).fill(32)]);
    const n = grid.nx * grid.ny * grid.nz;
    const buf = new ArrayBuffer(12 + head.length + 2 * n * 2);
    const u8 = new Uint8Array(buf);
    u8.set(new TextEncoder().encode('PCBFW1\0\0'), 0);
    new DataView(buf).setUint32(8, head.length, true);
    u8.set(head, 12);
    // 10 dB and 20 dB of |h|² per A² (centi-dB)
    new Int16Array(buf, 12 + head.length, n).fill(1000);
    new Int16Array(buf, 12 + head.length + n * 2, n).fill(2000);
    return buf;
  };
  const grid = { nx: 3, ny: 2, nz: 2, x0: 0, y0: 0, z0: 0, dx: 1, dy: 1, dz: 1 };

  it('reads blocks, splits lines between dumped frequencies and samples points', async () => {
    const { parseFullwave, frequencyWeights, sampleAt, fullwaveVolume, resampleBlocks } = await import('../src/fullwave/result');
    const r = parseFullwave(makeFile(grid));
    expect(r.blocks.get('s')).toHaveLength(2);
    // a line half way (log f) between 10 and 100 MHz: half of |I|² to each
    const w = frequencyWeights(r.freqs, [{ f: Math.sqrt(1e7 * 1e8), amp: 2 }], { mode: 'all' });
    expect(w[0]).toBeCloseTo(2, 6);
    expect(w[1]).toBeCloseTo(2, 6);
    // below the first and above the last dumped frequency: the nearest one
    expect(frequencyWeights(r.freqs, [{ f: 1e6, amp: 1 }, { f: 1e9, amp: 1 }], { mode: 'all' })).toEqual([1, 1]);
    const v = fullwaveVolume(r.blocks.get('s')!, [1, 1], 12);
    expect(v[5]).toBeCloseTo(10 + 100, 3);
    expect(sampleAt(r, r.blocks.get('s')!, r.grid, 0.5, 0.5, 0.5)[1]).toBeCloseTo(100, 3);
    // another grid: values carry over
    const re = resampleBlocks(r, { ...grid, nx: 5, dx: 0.5 });
    expect(re.get('s')![0]![2]).toBe(1000);
  });

  it('rejects other files', async () => {
    const { parseFullwave } = await import('../src/fullwave/result');
    expect(() => parseFullwave(new TextEncoder().encode('{"kind":"x"}').buffer as ArrayBuffer)).toThrow();
  });
});
