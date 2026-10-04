/**
 * Layout warnings that Stage 1 can detect but not compute (docs/stufe-1/PLAN.md M6):
 * gaps in the reference plane under a current path, reference changes at vias without a
 * nearby stitching via, and lines that are electrically long for their spectrum.
 */
import { covered, coveredNear, type PlaneLayer } from '../model/planes';
import type { BoardModel, Vec2 } from '../model/types';
import { toBoard, type WorldFrame } from '../model/world';
import type { CurrentElement, SourceModel } from './currents';
import type { Source } from './sources';
import type { Detour } from './returnPaths';

export type DiagnosticKind = 'return-gap' | 'ref-change' | 'no-stitching' | 'long-line';

export interface Diagnostic {
  kind: DiagnosticKind;
  sourceId: string;
  /** Board coordinates (mm). */
  at: Vec2;
  layer: string;
  /** Plane layer / net involved. */
  plane: string;
  planeNet: string;
  /** Length of the gap (return-gap), mm; or a frequency (long-line), Hz. */
  value: number;
  otherNet?: string;
  /** Stage 2: how the return current actually goes (detour length, extra loop area, link). */
  detour?: { length: number; extraArea: number; via?: string };
}

const STEP = 0.25;
const MIN_GAP = 1.0;
const STITCH_RADIUS = 3.0;

/** Reference plane of a layer: the nearest plane layer, preferring the side towards the core. */
export function referencePlane(board: BoardModel, planes: PlaneLayer[], layer: number): PlaneLayer | undefined {
  const y = board.layers[layer]!.y;
  const mid = (board.layers[0]!.y + board.layers[board.layers.length - 1]!.y) / 2;
  return planes
    .filter((p) => p.layer !== layer)
    .sort((a, b) => {
      const da = Math.abs(a.y - y);
      const db = Math.abs(b.y - y);
      if (Math.abs(da - db) > 1e-6) return da - db;
      return Math.abs(a.y - mid) - Math.abs(b.y - mid);
    })[0];
}

export function diagnoseSource(
  board: BoardModel,
  planes: PlaneLayer[],
  frame: WorldFrame,
  src: Source,
  model: SourceModel,
  fMax: number,
  detours: Detour[] = [],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const layerByY = (y: number) => board.layers.find((l) => Math.abs(l.y - y) < 1e-6);

  // gaps under horizontal current paths
  for (const e of model.elements) {
    // explicit return paths (stage 2) are the answer to a gap, not a signal over one
    if (e.vertical || e.layer < 0 || e.tag === 'return') continue;
    const ref = referencePlane(board, planes, e.layer);
    if (!ref) continue;
    for (const g of gapsAlong(e, ref, frame)) {
      out.push({
        kind: 'return-gap',
        sourceId: src.id,
        at: g.at,
        layer: board.layers[e.layer]!.name,
        plane: board.layers[ref.layer]!.name,
        planeNet: board.nets[ref.net] ?? '',
        value: g.length,
      });
    }
  }

  // reference changes at vias: join the per-layer via pieces at one position into one span
  if (src.type !== 'loop') {
    const spans = new Map<string, { x: number; z: number; y0: number; y1: number }>();
    for (const e of model.elements) {
      if (e.tag !== 'via') continue;
      const key = `${e.a[0].toFixed(3)},${e.a[2].toFixed(3)}`;
      const lo = Math.min(e.a[1], e.b[1]);
      const hi = Math.max(e.a[1], e.b[1]);
      const sp = spans.get(key);
      if (sp) {
        sp.y0 = Math.min(sp.y0, lo);
        sp.y1 = Math.max(sp.y1, hi);
      } else spans.set(key, { x: e.a[0], z: e.a[2], y0: lo, y1: hi });
    }
    for (const sp of spans.values()) {
      const la = layerByY(sp.y1);
      const lb = layerByY(sp.y0);
      if (!la || !lb || la.index === lb.index) continue;
      // only where the path actually runs on both layers (not a via stub into a plane)
      const runsOn = (l: number, y: number) =>
        model.elements.some(
          (x) => !x.vertical && x.layer === l && [x.a, x.b].some((p) => Math.abs(p[0] - sp.x) < 1e-3 && Math.abs(p[2] - sp.z) < 1e-3 && Math.abs(p[1] - y) < 1e-6),
        );
      if (!runsOn(la.index, sp.y1) || !runsOn(lb.index, sp.y0)) continue;
      const at = toBoard(frame, sp.x, sp.z);
      const ra = coveringRef(board, planes, la.index, at);
      const rb = coveringRef(board, planes, lb.index, at);
      if (!ra || !rb || ra.layer === rb.layer) continue;
      if (ra.net !== rb.net) {
        out.push({
          kind: 'ref-change',
          sourceId: src.id,
          at,
          layer: `${la.name} → ${lb.name}`,
          plane: `${board.layers[ra.layer]!.name} → ${board.layers[rb.layer]!.name}`,
          planeNet: board.nets[ra.net] ?? '',
          otherNet: board.nets[rb.net] ?? '',
          value: 0,
        });
      } else {
        const lo = Math.min(ra.layer, rb.layer);
        const hi = Math.max(ra.layer, rb.layer);
        const stitched = board.vias.some(
          (v) => v.net === ra.net && v.fromLayer <= lo && v.toLayer >= hi && Math.hypot(v.at.x - at.x, v.at.y - at.y) <= STITCH_RADIUS,
        );
        if (!stitched) {
          out.push({
            kind: 'no-stitching',
            sourceId: src.id,
            at,
            layer: `${la.name} → ${lb.name}`,
            plane: `${board.layers[ra.layer]!.name} → ${board.layers[rb.layer]!.name}`,
            planeNet: board.nets[ra.net] ?? '',
            value: STITCH_RADIUS,
          });
        }
      }
    }
  }

  // electrically long lines carrying noticeable energy above their limit
  if (src.type !== 'loop' && model.info.fShort < fMax) {
    const peak = Math.max(...model.lines.map((l) => l.amp), 0);
    const strong = model.lines.find((l) => l.f > model.info.fShort && l.amp > peak * 0.01);
    if (strong) {
      out.push({
        kind: 'long-line',
        sourceId: src.id,
        at: toBoard(frame, model.centre[0], model.centre[2]),
        layer: '',
        plane: '',
        planeNet: '',
        value: model.info.fShort,
      });
    }
  }
  // attach the stage 2 return paths to the hints they explain
  for (const d of out) {
    const kind = d.kind === 'return-gap' ? 'gap' : d.kind === 'ref-change' || d.kind === 'no-stitching' ? 'transfer' : null;
    if (!kind) continue;
    const near = (p: Vec2) => Math.hypot(p.x - d.at.x, p.y - d.at.y);
    const best = detours
      .filter((t) => t.kind === kind)
      .map((t) => ({ t, dist: Math.min(...t.path.map(near)) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (best && best.dist < 8) d.detour = { length: pathLen(best.t.path), extraArea: best.t.extraArea, via: best.t.via };
  }
  return merge(out);
}

function pathLen(p: Vec2[]): number {
  let s = 0;
  for (let k = 1; k < p.length; k++) s += Math.hypot(p[k]!.x - p[k - 1]!.x, p[k]!.y - p[k - 1]!.y);
  return s;
}

function coveringRef(board: BoardModel, planes: PlaneLayer[], layer: number, at: Vec2): PlaneLayer | undefined {
  const y = board.layers[layer]!.y;
  return planes
    .filter((p) => p.layer !== layer && coveredNear(p.raster, at.x, at.y))
    .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
}

function gapsAlong(e: CurrentElement, ref: PlaneLayer, frame: WorldFrame): { at: Vec2; length: number }[] {
  const len = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]);
  const n = Math.max(1, Math.ceil(len / STEP));
  const gaps: { at: Vec2; length: number }[] = [];
  let start = -1;
  const flush = (end: number) => {
    const l = ((end - start) / n) * len;
    if (l >= MIN_GAP) {
      const t = (start + end) / 2 / n;
      gaps.push({ at: toBoard(frame, e.a[0] + (e.b[0] - e.a[0]) * t, e.a[2] + (e.b[2] - e.a[2]) * t), length: l });
    }
    start = -1;
  };
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const b = toBoard(frame, e.a[0] + (e.b[0] - e.a[0]) * t, e.a[2] + (e.b[2] - e.a[2]) * t);
    const ok = covered(ref.raster, b.x, b.y);
    if (!ok && start < 0) start = k;
    if (ok && start >= 0) flush(k);
  }
  if (start >= 0) flush(n);
  return gaps;
}

/** Merge warnings of the same kind and source close to each other (one per spot). */
function merge(list: Diagnostic[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const d of list) {
    const radius = d.kind === 'return-gap' ? 8 : 3;
    const m = out.find((o) => o.kind === d.kind && o.sourceId === d.sourceId && Math.hypot(o.at.x - d.at.x, o.at.y - d.at.y) < radius);
    if (m) m.value = d.kind === 'return-gap' ? m.value + d.value : m.value;
    else out.push({ ...d });
  }
  return out;
}
