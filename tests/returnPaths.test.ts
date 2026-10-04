import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { detectPlanes, rasterize } from '../src/model/planes';
import { worldFrame } from '../src/model/world';
import { buildSource } from '../src/physics/currents';
import { packWithImages, STRIDE } from '../src/physics/images';
import { applyReturnModel, geodesic } from '../src/physics/returnPaths';
import { dipoleMoment } from '../src/physics/farfield';
import { fieldAt, slotMaskTable } from '../src/physics/biotsavart';
import type { Source } from '../src/physics/sources';

describe('shortest path through plane copper', () => {
  it('goes around a slot instead of across it', () => {
    // 40 x 30 mm plane with a 2 mm wide slot from y = 5 to y = 25 at x = 19..21, stored as
    // KiCad does: one ring with the hole joined in through a zero-width keyhole
    const ring = [
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }, { x: 0, y: 15 }, { x: 19, y: 15 },
      { x: 19, y: 25 }, { x: 21, y: 25 }, { x: 21, y: 5 }, { x: 19, y: 5 }, { x: 19, y: 15 }, { x: 0, y: 15 },
    ];
    const r = rasterize([ring], { x0: 0, y0: 0, x1: 40, y1: 30 }, 1200);
    const p = geodesic(r, { x: 15, y: 15 }, { x: 25, y: 15 })!;
    expect(p).not.toBeNull();
    const len = p.reduce((s, q, i) => (i ? s + Math.hypot(q.x - p[i - 1]!.x, q.y - p[i - 1]!.y) : 0), 0);
    // straight would be 10 mm; around an end it is about 2 * hypot(5, 10) ≈ 22 mm
    expect(len).toBeGreaterThan(20);
    expect(len).toBeLessThan(25);
    expect(p.some((q) => q.y < 5.5 || q.y > 24.5)).toBe(true);
  });
});

describe('stage 2 return model on the demo board', () => {
  const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
  const frame = worldFrame(board);
  const planes = detectPlanes(board);
  const ctx = { board, frame, planes, fMax: 1e9 };
  const scenario = JSON.parse(readFileSync('public/demo/demo-board.scenario.json', 'utf8')) as { sources: Source[] };
  const src = (id: string) => scenario.sources.find((s) => s.id === id)!;

  const divergence = (els: ReturnType<typeof applyReturnModel>['elements']) => {
    const p = packWithImages(els, planes, frame);
    const net = new Map<string, number>();
    const key = (o: number) => `${p.data[o]!.toFixed(3)},${p.data[o + 1]!.toFixed(3)},${p.data[o + 2]!.toFixed(3)}`;
    for (let i = 0; i < p.count; i++) {
      const o = i * STRIDE;
      const w = p.data[o + 6]!;
      net.set(key(o), (net.get(key(o)) ?? 0) - w);
      net.set(key(o + 3), (net.get(key(o + 3)) ?? 0) + w);
    }
    return Math.max(...[...net.values()].map(Math.abs));
  };

  it('routes the bad clock return around the slot and through the 3V3/GND capacitor', () => {
    const m = buildSource(ctx, src('clk-bad'));
    const r = applyReturnModel(ctx, src('clk-bad'), m.elements);
    const gap = r.detours.filter((d) => d.kind === 'gap');
    const transfer = r.detours.filter((d) => d.kind === 'transfer');
    expect(gap).toHaveLength(1);
    // the crossing is 6 mm below the slot end: about 2 x 6.5 mm around it, 2 mm wide
    const len = gap[0]!.path.reduce((s, q, i, a) => (i ? s + Math.hypot(q.x - a[i - 1]!.x, q.y - a[i - 1]!.y) : 0), 0);
    expect(len).toBeGreaterThan(11);
    expect(gap[0]!.extraArea).toBeGreaterThan(8);
    expect(gap[0]!.extraArea).toBeLessThan(30);
    expect(gap[0]!.path.some((q) => q.y < 88.2)).toBe(true); // goes round the top end at y = 88
    expect(transfer).toHaveLength(2);
    expect(transfer.every((t) => t.via === 'C2')).toBe(true);
    expect(transfer.every((t) => t.extraArea > 10)).toBe(true);
    expect(divergence(r.elements)).toBeLessThan(1e-9);
  });

  it('puts field at the slot end where the detour runs', () => {
    const m = buildSource(ctx, src('clk-bad'));
    const r = applyReturnModel(ctx, src('clk-bad'), m.elements);
    const at = (els: typeof m.elements, x: number, y: number) => {
      const p = packWithImages(els, planes, frame);
      const out = new Float64Array(3);
      fieldAt(p, slotMaskTable(p.planeY.length), x - frame.ox, 1, y - frame.oy, 0b11, out);
      return Math.hypot(out[0]!, out[1]!, out[2]!);
    };
    // 1 mm above the top end of the slot (board 139 / 87.5)
    expect(at(r.elements, 139, 87.5)).toBeGreaterThan(3 * at(m.elements, 139, 87.5));
    expect(Number.isFinite(Math.hypot(...dipoleMoment(packWithImages(r.elements, planes, frame))))).toBe(true);
  });

  it('leaves the good clock alone', () => {
    const m = buildSource(ctx, src('clk-good'));
    const r = applyReturnModel(ctx, src('clk-good'), m.elements);
    expect(r.detours).toEqual([]);
    expect(r.elements).toHaveLength(m.elements.length);
  });
});
