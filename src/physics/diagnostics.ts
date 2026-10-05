/**
 * Layout warnings (docs/stufe-1/PLAN.md M6, docs/research/EMV-FEHLERKATALOG.md): gaps in the
 * reference plane under a current path, reference changes at vias without a nearby stitching
 * via, unterminated lines whose resonance falls into the measured range, and hot loops of
 * switching stages that are larger than the parts need.
 */
import { covered, coveredNear, netAt, type CoverageRaster, type PlaneLayer } from '../model/planes';
import type { BoardModel, Vec2 } from '../model/types';
import { toBoard, type WorldFrame } from '../model/world';
import { buildSource, groundNet, type CurrentElement, type SourceModel } from './currents';
import { farMoment } from './farfield';
import type { Source } from './sources';
import type { Detour } from './returnPaths';
import { lineAmp } from './spectrum';
import type { CmEstimate } from './commonMode';
import type { IoCouplingEstimate } from './ioCoupling';

/** A common-mode estimate this close to the limit (dB) or above becomes a finding. */
export const CM_REPORT = -6;

export type DiagnosticKind =
  | 'return-gap'
  | 'ref-change'
  | 'no-stitching'
  | 'long-line'
  | 'hot-loop'
  | 'no-reference'
  | 'edge-trace'
  | 'cable-cm'
  | 'io-coupling'
  // board rules without a source (layoutRules.ts)
  | 'filter-far'
  | 'filter-ground'
  | 'shield-open'
  | 'shield-weak'
  | 'decoupling'
  | 'crystal-placement'
  | 'crystal-under'
  | 'sw-node'
  | 'floating-copper'
  | 'heatsink-floating'
  | 'ferrite-ground'
  | 'inductor-placement'
  // per source: the reference plane is not on the next layer
  | 'no-adjacent-plane'
  | 'pair-skew'
  // board rule that needs the sources (layoutRules.ts)
  | 'connector-ground';

/** Findings of the board rules, not tied to a field source (sourceId ''). */
export const BOARD_KINDS: DiagnosticKind[] = [
  'filter-far',
  'filter-ground',
  'shield-open',
  'shield-weak',
  'decoupling',
  'crystal-placement',
  'crystal-under',
  'sw-node',
  'floating-copper',
  'heatsink-floating',
  'ferrite-ground',
  'connector-ground',
  'inductor-placement',
];

export interface Diagnostic {
  kind: DiagnosticKind;
  sourceId: string;
  /** Board coordinates (mm). */
  at: Vec2;
  layer: string;
  /** Plane layer / net involved. */
  plane: string;
  planeNet: string;
  /**
   * Length of the gap (return-gap), mm; the line's quarter-wave resonance (long-line), Hz;
   * the loop area (hot-loop, no-reference: signal and return together), mm²; the smallest
   * distance to the plane edge (edge-trace), mm.
   */
  value: number;
  /** edge-trace: length of the line within the distance, and the distance recommended, mm. */
  run?: { length: number; min: number };
  /** return-gap: the line crosses from one net's copper to another's on a split plane layer. */
  split?: boolean;
  /** cable-cm: the common-mode estimate with cables (commonMode.ts). */
  cm?: CmEstimate;
  /** io-coupling: crosstalk into a line that leaves through a connector (ioCoupling.ts). */
  io?: IoCouplingEstimate;
  /** Board rules: the parts and nets involved, and dimensions to draw (board mm). */
  parts?: string[];
  nets?: string[];
  dims?: { a: Vec2; b: Vec2; text: string }[];
  /** decoupling: the supply pin, the nearest capacitor and its estimated mounting inductance. */
  decoupling?: { pin: string; cap?: string; nh?: number; none?: boolean };
  /** crystal-placement, inductor-placement: distances to the board edge and the nearest cable connector, mm. */
  crystal?: { edge: number; connector: number };
  /** sw-node: copper area (mm²), layers with copper, distances to edge and connector (mm). */
  sw?: { area: number; layers: number; edge: number; connector: number };
  /** pair-skew: lengths of both legs (mm), the skew (s) and the rise time it is compared with (s). */
  skew?: { p: number; n: number; dt: number; tr: number };
  /** connector-ground: the connector, its ground pins and the fast pins of this source on it. */
  pins?: { connector: string; ground: number; fast: number; apart?: number };
  /** floating-copper: layer, and whether it is an unconnected island of a net (else no net at all). */
  copper?: { layer: string; island: boolean };
  otherNet?: string;
  /** Stage 2: how the return current actually goes (detour length, extra loop area, link). */
  detour?: { length: number; extraArea: number; via?: string };
  /**
   * Far-field figures in the differential-mode model, dB (attribution.ts). scope 'finding':
   * `db` is the share of this problem against a source with all other returns ideal (orders
   * the findings), `alone` what fixing only this spot changes (positive: quieter). scope
   * 'source': all plane gaps under the source together (gaps without a way around, cut-outs);
   * `db` is then the effect of fixing them all.
   */
  gain?: { db: number; scope: 'finding' | 'source'; alone?: number };
}

const STEP = 0.1;
/** Gaps narrower than this along the line are raster noise. */
const MIN_GAP = 0.2;
/**
 * A gap with a way around is reported when the return's detour is at least this much longer
 * than straight across (mm): narrow anti-pad chains and thermal gaps cost little, a slot or a
 * split forces a real detour.
 */
const DETOUR_MIN = 2;
const STITCH_RADIUS = 3.0;
/** Hot loops below this area are about as small as the parts allow (SOT-23/0603 class: 10–20 mm²). */
export const HOT_LOOP_MIN = 30;
/** A pair whose legs differ by more than this is reported, mm. */
const SKEW_MM = 5;
/** …or whose skew exceeds this share of the rise time. */
const SKEW_SHARE = 0.1;
/** A series resistor this close to the driver counts as source termination, mm. */
const SOURCE_TERMINATION_MM = 15;
/** Lines whose spectrum at the resonance is below this share of the strongest line are left alone. */
const RESONANCE_SHARE = 0.01;
/**
 * Lines closer to the edge of their reference plane than EDGE_H heights (at least EDGE_MIN mm)
 * over at least EDGE_RUN mm: the return current spreads like 1/(1 + (x/h)²) beside the line,
 * so within a few h of the edge part of it is pushed aside and the field reaches around the edge.
 * LearnEMC asks for at least 2·h, Wyatt for 3–5 track widths; 3·h sits in between. The edge is
 * the plane's outer boundary or a large gap (EDGE_GAP mm), not the clearance around other copper.
 */
export const EDGE_H = 3;
const EDGE_GAP = 5;
const EDGE_MIN = 1;
const EDGE_RUN = 3;

const refCache = new WeakMap<PlaneLayer[], Map<number, PlaneLayer | undefined>>();

/** Reference plane of a layer: the nearest plane layer, preferring the side towards the core. */
export function referencePlane(board: BoardModel, planes: PlaneLayer[], layer: number): PlaneLayer | undefined {
  let cache = refCache.get(planes);
  if (!cache) refCache.set(planes, (cache = new Map()));
  if (cache.has(layer)) return cache.get(layer);
  const found = findReferencePlane(board, planes, layer);
  cache.set(layer, found);
  return found;
}

function findReferencePlane(board: BoardModel, planes: PlaneLayer[], layer: number): PlaneLayer | undefined {
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
  /** All plane gaps under this source together, dB (attribution.ts), for gaps without a detour. */
  planeGapsDb?: number,
  /** Common-mode estimate with cables (commonMode.ts), when the caller has one. */
  cm?: CmEstimate | null,
  /** Crosstalk into I/O lines (ioCoupling.ts), strongest first. */
  io: IoCouplingEstimate[] = [],
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
      const split = g.nets && g.nets[0] !== g.nets[1];
      out.push({
        kind: 'return-gap',
        sourceId: src.id,
        at: g.at,
        layer: board.layers[e.layer]!.name,
        plane: board.layers[ref.layer]!.name,
        planeNet: board.nets[split ? g.nets![0] : ref.net] ?? '',
        ...(split ? { otherNet: board.nets[g.nets![1]] ?? '', split: true } : {}),
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

  // unterminated lines whose quarter-wave resonance lies in the measured range: ringing and
  // overshoot lift the harmonics there (the λ/10 validity limit alone is no layout mistake)
  if ((src.type === 'signal' || src.type === 'diffpair') && model.info.fShort < Infinity) {
    const fq = 2.5 * model.info.fShort; // c / (4 · L · √εeff), with fShort = c / (10 · L · √εeff)
    const terminated = src.load.model === 'terminated' || (model.info.series ?? []).some((r) => r.ohms >= 10 && r.fromDriverMm <= SOURCE_TERMINATION_MM);
    const peak = Math.max(...model.lines.map((l) => lineAmp(l)), 0);
    const near = model.lines.filter((l) => l.f >= fq * 0.7 && l.f <= fq * 1.5);
    if (!terminated && fq < fMax && near.some((l) => lineAmp(l) >= peak * RESONANCE_SHARE)) {
      out.push({
        kind: 'long-line',
        sourceId: src.id,
        at: toBoard(frame, model.centre[0], model.centre[2]),
        layer: '',
        plane: '',
        planeNet: '',
        value: fq,
      });
    }
  }

  // no reference plane at all: the return runs through the ground copper wherever that is
  if ((src.type === 'signal' || src.type === 'diffpair') && planes.length === 0 && model.info.warnings.includes('unreferenced')) {
    const now = Math.hypot(...farMoment(model.elements, planes, frame)) * 1e6;
    const ideal = virtualPlaneMoment(board, frame, src, fMax, model);
    out.push({
      kind: 'no-reference',
      sourceId: src.id,
      at: toBoard(frame, model.centre[0], model.centre[2]),
      layer: '',
      plane: '',
      planeNet: '',
      value: now,
      ...(ideal > 0 && now > ideal ? { gain: { db: Math.min(20 * Math.log10(now / ideal), 30), scope: 'finding' as const, alone: Math.min(20 * Math.log10(now / ideal), 30) } } : {}),
    });
  }

  // lines running along the edge of their reference plane (board edge, slot, split)
  if (src.type === 'signal' || src.type === 'diffpair') {
    for (const e of model.elements) {
      if (e.vertical || e.layer < 0 || e.tag === 'return' || e.noImage) continue;
      const ref = referencePlane(board, planes, e.layer);
      if (!ref) continue;
      const h = Math.abs(board.layers[e.layer]!.y - ref.y);
      const limit = Math.max(EDGE_H * h, EDGE_MIN);
      const hit = edgeRun(e, ref, frame, limit);
      if (hit && hit.length >= EDGE_RUN) {
        out.push({
          kind: 'edge-trace',
          sourceId: src.id,
          at: hit.at,
          layer: board.layers[e.layer]!.name,
          plane: board.layers[ref.layer]!.name,
          planeNet: board.nets[ref.net] ?? '',
          value: hit.distance,
          run: { length: hit.length, min: limit },
        });
      }
    }
  }

  // the line drives the plane halves, and the cables on them, against each other
  if (cm?.worst && cm.worst.margin > CM_REPORT) {
    out.push({ kind: 'cable-cm', sourceId: src.id, at: cm.at, layer: '', plane: '', planeNet: '', value: cm.worst.db, cm });
  }

  // the signal couples into a line that leaves the board on a cable
  // the two strongest cable lines per source (the list is sorted, strongest first)
  for (const e of io.slice(0, 2)) {
    if (!e.worst || e.worst.margin <= CM_REPORT) continue;
    out.push({ kind: 'io-coupling', sourceId: src.id, at: e.at, layer: '', plane: '', planeNet: '', otherNet: e.ioNet, value: e.worst.db, io: e });
  }

  // the line's reference plane is not on the next layer: another copper layer lies in between
  if (src.type === 'signal' || src.type === 'diffpair') {
    const seen = new Set<number>();
    for (const e of model.elements) {
      if (e.vertical || e.layer < 0 || e.tag === 'return' || seen.has(e.layer)) continue;
      seen.add(e.layer);
      const ref = referencePlane(board, planes, e.layer);
      if (!ref || Math.abs(ref.layer - e.layer) <= 1) continue;
      const h = Math.abs(board.layers[e.layer]!.y - ref.y);
      out.push({
        kind: 'no-adjacent-plane',
        sourceId: src.id,
        at: toBoard(frame, (e.a[0] + e.b[0]) / 2, (e.a[2] + e.b[2]) / 2),
        layer: board.layers[e.layer]!.name,
        plane: board.layers[ref.layer]!.name,
        planeNet: board.nets[ref.net] ?? '',
        value: h,
      });
    }
  }

  // differential pair with a length difference: the skew turns part of the signal into common mode
  if (src.type === 'diffpair') {
    const len = (name: string) => {
      const n = board.nets.indexOf(name);
      return board.tracks.filter((tr) => tr.net === n).reduce((s, tr) => s + Math.hypot(tr.b.x - tr.a.x, tr.b.y - tr.a.y), 0);
    };
    const lp = len(src.netP);
    const ln = len(src.netN);
    const dt = (Math.abs(lp - ln) * 1e-3 * Math.sqrt(model.info.eeff || 3)) / 299_792_458;
    if (Math.abs(lp - ln) > SKEW_MM || dt > SKEW_SHARE * src.waveform.tr) {
      out.push({
        kind: 'pair-skew',
        sourceId: src.id,
        at: toBoard(frame, model.centre[0], model.centre[2]),
        layer: '',
        plane: '',
        planeNet: '',
        value: Math.abs(lp - ln),
        skew: { p: lp, n: ln, dt, tr: src.waveform.tr },
      });
    }
  }

  // hot loop of a switching stage: larger than the parts need
  if (src.type === 'loop' && model.info.loopArea) {
    const area = Math.hypot(...model.info.loopArea);
    if (area >= HOT_LOOP_MIN) {
      out.push({
        kind: 'hot-loop',
        sourceId: src.id,
        at: toBoard(frame, model.centre[0], model.centre[2]),
        layer: '',
        plane: '',
        planeNet: '',
        value: area,
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
    if (best && best.dist < 8) {
      d.detour = { length: pathLen(best.t.path), extraArea: best.t.extraArea, via: best.t.via };
      if (best.t.gainDb !== undefined) d.gain = { db: best.t.gainDb, scope: 'finding', alone: best.t.aloneDb };
    }
    if (!d.gain && d.kind === 'return-gap' && planeGapsDb !== undefined && planeGapsDb > 0.05) d.gain = { db: planeGapsDb, scope: 'source' };
  }
  // a gap the return can pass right beside (a short anti-pad chain, a thermal gap) is no finding
  const real = out.filter((d) => d.kind !== 'return-gap' || d.split || !d.detour || d.detour.length - d.value >= DETOUR_MIN);
  return merge(real);
}

/**
 * The source's dipole moment (mm²) with a solid ground plane on the outer layer farthest from
 * its tracks: what a two-layer board with a ground plane would give.
 */
function virtualPlaneMoment(board: BoardModel, frame: WorldFrame, src: Source, fMax: number, model: SourceModel): number {
  const used = new Set(model.elements.filter((e) => !e.vertical && e.layer >= 0 && e.tag !== 'return').map((e) => e.layer));
  const last = board.layers.length - 1;
  const layer = used.has(0) && !used.has(last) ? last : used.has(last) && !used.has(0) ? 0 : last;
  const gnd = groundNet(board, []);
  if (gnd <= 0) return 0;
  const b = board.bbox;
  const cell = 0.5;
  const nx = Math.ceil((b.x1 - b.x0) / cell) + 4;
  const ny = Math.ceil((b.y1 - b.y0) / cell) + 4;
  const plane: PlaneLayer = {
    layer,
    net: gnd,
    y: board.layers[layer]!.y,
    coverage: 1,
    raster: { x0: b.x0 - 2 * cell, y0: b.y0 - 2 * cell, cell, nx, ny, data: new Uint8Array(nx * ny).fill(1) },
    override: false,
  };
  try {
    const m = buildSource({ board, frame, planes: [plane], fMax }, src);
    return Math.hypot(...farMoment(m.elements, [plane], frame)) * 1e6;
  } catch {
    return 0;
  }
}

/**
 * The stretch of a line that runs within `limit` of the edge of its reference plane, sideways
 * (a line heading straight for the edge, e.g. into a connector, does not count): its length,
 * the smallest distance and where.
 */
const edgeMasks = new WeakMap<CoverageRaster, Uint8Array>();

/**
 * Uncovered cells that count as a plane edge: regions open to the outside (beyond the plane's
 * outer boundary) or larger than EDGE_GAP. The small gaps around tracks, pads and anti-pads in a
 * pour are no edge.
 */
function edgeMask(r: CoverageRaster): Uint8Array {
  let m = edgeMasks.get(r);
  if (m) return m;
  const { nx, ny } = r;
  m = new Uint8Array(nx * ny);
  const seen = new Uint8Array(nx * ny);
  const stack: number[] = [];
  const comp: number[] = [];
  const big = EDGE_GAP / r.cell;
  for (let start = 0; start < nx * ny; start++) {
    if (r.data[start] || seen[start]) continue;
    stack.length = 0;
    comp.length = 0;
    stack.push(start);
    seen[start] = 1;
    let open = false;
    let i0 = nx;
    let i1 = -1;
    let j0 = ny;
    let j1 = -1;
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      const i = v % nx;
      const j = (v - i) / nx;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) open = true;
      if (i > 0 && !r.data[v - 1] && !seen[v - 1]) (seen[v - 1] = 1), stack.push(v - 1);
      if (i < nx - 1 && !r.data[v + 1] && !seen[v + 1]) (seen[v + 1] = 1), stack.push(v + 1);
      if (j > 0 && !r.data[v - nx] && !seen[v - nx]) (seen[v - nx] = 1), stack.push(v - nx);
      if (j < ny - 1 && !r.data[v + nx] && !seen[v + nx]) (seen[v + nx] = 1), stack.push(v + nx);
    }
    if (open || Math.max(i1 - i0 + 1, j1 - j0 + 1) >= big) for (const v of comp) m[v] = 1;
  }
  edgeMasks.set(r, m);
  return m;
}

function edgeRun(e: CurrentElement, ref: PlaneLayer, frame: WorldFrame, limit: number): { length: number; distance: number; at: Vec2 } | null {
  const r = ref.raster;
  const edge = edgeMask(r);
  const a = toBoard(frame, e.a[0], e.a[2]);
  const b = toBoard(frame, e.b[0], e.b[2]);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const step = 0.5;
  const n = Math.max(1, Math.ceil(len / step));
  const reach = Math.ceil(limit / r.cell);
  let run = 0;
  let best: { length: number; distance: number; at: Vec2 } | null = null;
  for (let k = 0; k <= n; k++) {
    const x = a.x + (b.x - a.x) * (k / n);
    const y = a.y + (b.y - a.y) * (k / n);
    let near = Infinity;
    let side = 0;
    if (covered(r, x, y)) {
      const ci = Math.floor((x - r.x0) / r.cell);
      const cj = Math.floor((y - r.y0) / r.cell);
      for (let dj = -reach; dj <= reach; dj++)
        for (let di = -reach; di <= reach; di++) {
          const i = ci + di;
          const j = cj + dj;
          const outside = i < 0 || j < 0 || i >= r.nx || j >= r.ny || edge[j * r.nx + i] === 1;
          if (!outside) continue;
          const dx = r.x0 + (i + 0.5) * r.cell - x;
          const dy = r.y0 + (j + 0.5) * r.cell - y;
          const d = Math.hypot(dx, dy);
          if (d < near) {
            near = d;
            side = Math.abs(ux * dy - uy * dx) / Math.max(d, 1e-9); // sine of the angle to the line
          }
        }
    }
    if (near <= limit && side > 0.7) {
      run += k === 0 ? 0 : len / n;
      const distance = Math.max(0, near - r.cell / 2);
      if (!best || distance < best.distance) best = { length: 0, distance, at: { x, y } };
      best.length = Math.max(best.length, run);
    } else run = 0;
  }
  return best;
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

function gapsAlong(e: CurrentElement, ref: PlaneLayer, frame: WorldFrame): { at: Vec2; length: number; nets?: [number, number] }[] {
  const len = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]);
  const n = Math.max(1, Math.ceil(len / STEP));
  const gaps: { at: Vec2; length: number; nets?: [number, number] }[] = [];
  let start = -1;
  const flush = (end: number) => {
    const l = ((end - start) / n) * len;
    if (l >= MIN_GAP) {
      const t = (start + end) / 2 / n;
      // the nets on both sides (split planes: GND on one side, a supply on the other)
      // (looked up just beyond the gap, also past the ends of this piece of line: the return
      // model cuts the line at the gap)
      let nets: [number, number] | undefined;
      if (ref.nets) {
        const beyond = 0.3 / Math.max(len, 1e-6);
        const p = toBoard(frame, e.a[0] + (e.b[0] - e.a[0]) * (start / n - beyond), e.a[2] + (e.b[2] - e.a[2]) * (start / n - beyond));
        const q = toBoard(frame, e.a[0] + (e.b[0] - e.a[0]) * (end / n + beyond), e.a[2] + (e.b[2] - e.a[2]) * (end / n + beyond));
        const a = netAt(ref, p.x, p.y);
        const b = netAt(ref, q.x, q.y);
        if (a > 0 && b > 0) nets = [a, b];
      }
      gaps.push({ at: toBoard(frame, e.a[0] + (e.b[0] - e.a[0]) * t, e.a[2] + (e.b[2] - e.a[2]) * t), length: l, ...(nets ? { nets } : {}) });
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
