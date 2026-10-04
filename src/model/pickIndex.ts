/**
 * Fast 2D lookup of the copper under a board point: tracks, pads and vias bucketed in a
 * grid per layer, plus zones (point in polygon, with bounding boxes first). Replaces ray
 * casting against hundreds of thousands of triangles on large boards.
 */
import { distPointSegment, emptyBBox, growBBox, pointInRings } from './geometry';
import { insidePad } from './connectivity';
import type { BBox2, BoardModel } from './types';

export interface PickHit {
  net: number;
  layer: number;
  kind: 'track' | 'pad' | 'via' | 'zone';
  index: number;
}

type Item = { kind: 'track' | 'pad' | 'via'; index: number };

export class PickIndex {
  private cell: number;
  private x0: number;
  private y0: number;
  private nx: number;
  private ny: number;
  /** per layer: cell -> items */
  private buckets: Map<number, Item[]>[];
  private zoneBoxes: { layer: number; index: number; box: BBox2 }[] = [];

  constructor(
    private board: BoardModel,
    cell = 1,
  ) {
    this.cell = cell;
    this.x0 = board.bbox.x0 - 2;
    this.y0 = board.bbox.y0 - 2;
    this.nx = Math.ceil((board.bbox.x1 - board.bbox.x0 + 4) / cell) + 1;
    this.ny = Math.ceil((board.bbox.y1 - board.bbox.y0 + 4) / cell) + 1;
    this.buckets = board.layers.map(() => new Map());

    board.tracks.forEach((t, index) => {
      const r = t.width / 2;
      this.addBox(t.layer, Math.min(t.a.x, t.b.x) - r, Math.min(t.a.y, t.b.y) - r, Math.max(t.a.x, t.b.x) + r, Math.max(t.a.y, t.b.y) + r, { kind: 'track', index });
    });
    board.pads.forEach((p, index) => {
      const r = Math.hypot(p.size.x, p.size.y) / 2;
      for (const l of p.layers) this.addBox(l, p.at.x - r, p.at.y - r, p.at.x + r, p.at.y + r, { kind: 'pad', index });
    });
    board.vias.forEach((v, index) => {
      const r = v.diameter / 2;
      for (let l = v.fromLayer; l <= v.toLayer; l++) this.addBox(l, v.at.x - r, v.at.y - r, v.at.x + r, v.at.y + r, { kind: 'via', index });
    });
    board.zones.forEach((z, index) => {
      const box = emptyBBox();
      for (const ring of z.polygons) for (const p of ring) growBBox(box, p);
      this.zoneBoxes.push({ layer: z.layer, index, box });
    });
  }

  private addBox(layer: number, ax: number, ay: number, bx: number, by: number, item: Item) {
    const map = this.buckets[layer];
    if (!map) return;
    const i0 = Math.max(0, Math.floor((ax - this.x0) / this.cell));
    const i1 = Math.min(this.nx - 1, Math.floor((bx - this.x0) / this.cell));
    const j0 = Math.max(0, Math.floor((ay - this.y0) / this.cell));
    const j1 = Math.min(this.ny - 1, Math.floor((by - this.y0) / this.cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * this.nx + i;
        const list = map.get(k);
        if (list) list.push(item);
        else map.set(k, [item]);
      }
  }

  /** First copper hit at (x, y) on the given layers, in that order. */
  pick(x: number, y: number, layers: number[]): PickHit | null {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((y - this.y0) / this.cell);
    const p = { x, y };
    for (const layer of layers) {
      const items = i >= 0 && j >= 0 && i < this.nx && j < this.ny ? this.buckets[layer]?.get(j * this.nx + i) : undefined;
      let best: PickHit | null = null;
      for (const it of items ?? []) {
        if (it.kind === 'pad') {
          const pad = this.board.pads[it.index]!;
          if (insidePad(pad, x, y)) return { net: pad.net, layer, kind: 'pad', index: it.index };
        } else if (it.kind === 'via') {
          const v = this.board.vias[it.index]!;
          if (Math.hypot(v.at.x - x, v.at.y - y) <= v.diameter / 2) return { net: v.net, layer, kind: 'via', index: it.index };
        } else if (!best) {
          const t = this.board.tracks[it.index]!;
          if (distPointSegment(p, t.a, t.b) <= t.width / 2) best = { net: t.net, layer, kind: 'track', index: it.index };
        }
      }
      if (best) return best;
      for (const z of this.zoneBoxes) {
        if (z.layer !== layer || x < z.box.x0 || x > z.box.x1 || y < z.box.y0 || y > z.box.y1) continue;
        const zone = this.board.zones[z.index]!;
        if (pointInRings(p, zone.polygons)) return { net: zone.net, layer, kind: 'zone', index: z.index };
      }
    }
    return null;
  }

  /** Nearest pad on a layer within maxDist (for picking loop pads). */
  nearestPad(x: number, y: number, layers: number[], maxDist = 2.5): number {
    let best = -1;
    let bd = maxDist;
    this.board.pads.forEach((p, k) => {
      if (!p.layers.some((l) => layers.includes(l))) return;
      const d = Math.hypot(p.at.x - x, p.at.y - y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return best;
  }
}
