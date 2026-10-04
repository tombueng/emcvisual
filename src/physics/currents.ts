/**
 * From a source definition to straight current elements plus a line spectrum
 * (docs/stufe-1/PHYSIK.md §5). Element weights are relative to the reference current of
 * the spectrum, so the field pattern does not depend on frequency (§6).
 */
import { buildNetGraph, pathTo, shortestTree, type NetGraph, type Step } from '../model/connectivity';
import { coveredNear, type PlaneLayer } from '../model/planes';
import type { BoardModel, Pad } from '../model/types';
import { toWorld, type Vec3, type WorldFrame } from '../model/world';
import { microstrip, shortLineLimit, stripline, unreferenced, type LineParams } from './lines';
import { mapLines, trapezoidLines, triangleLines, type Line } from './spectrum';
import { resistorValue } from './units';
import { splitPadRef, STRAY_TURNS, type DiffPairSource, type InductorSource, type LoadModel, type LoopSource, type SignalSource, type Source } from './sources';

export interface CurrentElement {
  a: Vec3;
  b: Vec3;
  /** Current from a to b relative to the reference current. */
  w: number;
  /** Core radius in mm (half the conductor width). */
  r: number;
  vertical: boolean;
  /** Copper layer of horizontal elements, -1 for vertical ones. */
  layer: number;
  net: number;
  /** 'via' for vertical copper (vias, through-hole barrels), 'return' for displacement currents. */
  tag?: 'via' | 'return';
  /** Stage 2 return model: no mirror images for this element (its return is explicit). */
  noImage?: boolean;
  /** Height that decides the shielding slot instead of the element's own (image-side connectors). */
  slotY?: number;
}

export interface SourceInfo {
  lengthMm: number;
  cTotal?: number;
  z0?: number;
  eeff: number;
  /** Frequency above which the lumped model is questionable (λ/10 rule). */
  fShort: number;
  driver?: string;
  warnings: string[];
  /**
   * Current loops: vector area of the loop as the current really runs, including the part
   * inside a plane (mm², world axes). Its length is the loop area that matters for the field.
   */
  loopArea?: Vec3;
  /** Signals: series resistors between the source's nets (source termination), with the distance from the driver, mm. */
  series?: { ref: string; ohms: number; fromDriverMm: number }[];
  /** Signals: rise time after the series resistor's RC with the line and load, s. */
  trEff?: number;
}

export interface SourceModel {
  id: string;
  elements: CurrentElement[];
  /** Reference current spectrum, A RMS. */
  lines: Line[];
  info: SourceInfo;
  /** Weighted centre of the current path, world mm (used to place the sound). */
  centre: Vec3;
  /** Stage 2b: charges per volt for the electric field, and the voltage spectrum (V RMS). */
  charges?: import('./charges').ChargeElement[];
  vLines?: Line[];
}

export interface PhysicsContext {
  board: BoardModel;
  frame: WorldFrame;
  planes: PlaneLayer[];
  /** Highest frequency of the line spectra, Hz. */
  fMax: number;
}

export class SourceError extends Error {}

const MIN_R = 0.05;

export function buildSource(ctx: PhysicsContext, src: Source): SourceModel {
  switch (src.type) {
    case 'signal':
      return signalModel(ctx, src);
    case 'diffpair':
      return diffPairModel(ctx, src);
    case 'loop':
      return loopModel(ctx, src);
    case 'inductor':
      return inductorModel(ctx, src);
  }
}

// --- inductor stray field (stage 2c) ------------------------------------------------------------

function inductorModel(ctx: PhysicsContext, src: InductorSource): SourceModel {
  const { board } = ctx;
  const fp = board.footprints.find((f) => f.ref === src.ref);
  if (!fp) throw new SourceError(`part-not-found:${src.ref}`);
  const L = board.layers;
  const top = L[0]!;
  const bottom = L[L.length - 1]!;
  const h = Math.max(fp.height, 0.5);
  const y = fp.side === 'top' ? top.y + top.thickness / 2 + h / 2 : bottom.y - bottom.thickness / 2 - h / 2;
  const radius = Math.max(0.3, 0.35 * Math.min(fp.body.size.x, fp.body.size.y));
  const turns = STRAY_TURNS[src.shielding];
  const n = 16;
  const elements: CurrentElement[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (2 * Math.PI * k) / n;
    const a1 = (2 * Math.PI * (k + 1)) / n;
    const p0 = { x: fp.body.center.x + radius * Math.cos(a0), y: fp.body.center.y + radius * Math.sin(a0) };
    const p1 = { x: fp.body.center.x + radius * Math.cos(a1), y: fp.body.center.y + radius * Math.sin(a1) };
    elements.push({ a: toWorld(ctx.frame, p0, y), b: toWorld(ctx.frame, p1, y), w: turns, r: 0.2, vertical: false, layer: -1, net: 0 });
  }
  return {
    id: src.id,
    elements,
    lines: triangleLines(src.waveform, ctx.fMax),
    info: { lengthMm: 2 * Math.PI * radius, eeff: 1, fShort: Infinity, warnings: [] },
    centre: toWorld(ctx.frame, fp.body.center, y),
  };
}

// --- helpers ------------------------------------------------------------------------------------

export function findPad(board: BoardModel, ref: string): number {
  const s = splitPadRef(ref);
  if (!s) return -1;
  return board.pads.findIndex((p) => p.ref === s.ref && p.number === s.number);
}

export function padName(p: Pad): string {
  return `${p.ref}.${p.number}`;
}

/** Nearest plane above and below a layer (excluding a plane on the layer itself). */
function neighbourPlanes(ctx: PhysicsContext, layer: number): { above?: PlaneLayer; below?: PlaneLayer } {
  const y = ctx.board.layers[layer]!.y;
  let above: PlaneLayer | undefined;
  let below: PlaneLayer | undefined;
  for (const p of ctx.planes) {
    if (p.layer === layer) continue;
    if (p.y > y && (!above || p.y < above.y)) above = p;
    if (p.y < y && (!below || p.y > below.y)) below = p;
  }
  return { above, below };
}

function dielectricBetween(ctx: PhysicsContext, l0: number, l1: number): { h: number; er: number } {
  const lo = Math.min(l0, l1);
  const hi = Math.max(l0, l1);
  let h = 0;
  let et = 0;
  for (const d of ctx.board.dielectrics) {
    if (d.above >= lo && d.above < hi) {
      h += d.thickness;
      et += d.thickness * d.epsilonR;
    }
  }
  for (let l = lo + 1; l < hi; l++) h += ctx.board.layers[l]!.thickness;
  return { h: Math.max(h, 0.01), er: h > 0 ? et / Math.max(h, 1e-9) || 4.4 : 4.4 };
}

const lineCache = new WeakMap<PhysicsContext, Map<string, LineParams>>();

/** Line parameters of a track of the given width on a layer (microstrip or stripline). */
export function lineParams(ctx: PhysicsContext, layer: number, width: number): LineParams {
  let cache = lineCache.get(ctx);
  if (!cache) lineCache.set(ctx, (cache = new Map()));
  const key = `${layer}:${width.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { above, below } = neighbourPlanes(ctx, layer);
  const t = ctx.board.layers[layer]!.thickness;
  let p: LineParams;
  if (above && below) {
    const d0 = dielectricBetween(ctx, above.layer, below.layer);
    p = stripline(width, d0.h, t, d0.er);
  } else if (above || below) {
    const ref = (above ?? below)!;
    const d = dielectricBetween(ctx, layer, ref.layer);
    p = microstrip(width, d.h, d.er);
  } else {
    p = unreferenced();
  }
  cache.set(key, p);
  return p;
}

/**
 * Where displacement current from a node ends: the nearest plane (towards the board core)
 * that has copper under the point; otherwise the nearest plane layer; otherwise the
 * opposite outer layer (flagged by the caller).
 */
export function returnHeight(ctx: PhysicsContext, layer: number, x: number, y: number): { y: number; referenced: boolean } {
  const ly = ctx.board.layers[layer]!.y;
  const cands = ctx.planes.filter((p) => p.layer !== layer);
  const coveringNear = cands
    .filter((p) => coveredNear(p.raster, x, y))
    .sort((p, q) => Math.abs(p.y - ly) - Math.abs(q.y - ly))[0];
  if (coveringNear) return { y: coveringNear.y, referenced: true };
  const any = [...cands].sort((p, q) => Math.abs(p.y - ly) - Math.abs(q.y - ly))[0];
  if (any) return { y: any.y, referenced: false };
  const layers = ctx.board.layers;
  const other = layer === 0 ? layers[layers.length - 1]! : layers[0]!;
  return { y: other.y, referenced: false };
}

function stepElement(ctx: PhysicsContext, g: NetGraph, s: Step, w: number): CurrentElement {
  const a = g.nodes[s.from]!;
  const b = g.nodes[s.to]!;
  const L = ctx.board.layers;
  if (s.edge >= 0) {
    const e = g.edges[s.edge]!;
    if (e.kind === 'via' || e.kind === 'thru') {
      return {
        a: toWorld(ctx.frame, a, L[a.layer]!.y),
        b: toWorld(ctx.frame, b, L[b.layer]!.y),
        w,
        r: Math.max(e.width / 2, MIN_R),
        vertical: true,
        layer: -1,
        net: e.net,
        tag: 'via',
      };
    }
    return {
      a: toWorld(ctx.frame, a, L[e.layer]!.y),
      b: toWorld(ctx.frame, b, L[e.layer]!.y),
      w,
      r: Math.max(e.width / 2, MIN_R),
      vertical: false,
      layer: e.layer,
      net: e.net,
    };
  }
  const z = g.zones[s.zone]!;
  return {
    a: toWorld(ctx.frame, a, L[z.layer]!.y),
    b: toWorld(ctx.frame, b, L[z.layer]!.y),
    w,
    r: 0.5,
    vertical: false,
    layer: z.layer,
    net: z.net,
  };
}

function verticalTo(ctx: PhysicsContext, x: number, y: number, fromY: number, toY: number, w: number, r: number, net: number): CurrentElement {
  return {
    a: toWorld(ctx.frame, { x, y }, fromY),
    b: toWorld(ctx.frame, { x, y }, toY),
    w,
    r: Math.max(r, MIN_R),
    vertical: true,
    layer: -1,
    net,
    tag: 'return',
  };
}

function centreOf(elements: CurrentElement[]): Vec3 {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sw = 0;
  for (const e of elements) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]);
    const k = Math.abs(e.w) * len;
    sx += k * (e.a[0] + e.b[0]) / 2;
    sy += k * (e.a[1] + e.b[1]) / 2;
    sz += k * (e.a[2] + e.b[2]) / 2;
    sw += k;
  }
  return sw > 0 ? [sx / sw, sy / sw, sz / sw] : [0, 0, 0];
}

const voltageLines = (ctx: PhysicsContext, src: SignalSource | DiffPairSource) => trapezoidLines(src.waveform, ctx.fMax);

function netIndices(board: BoardModel, names: string[]): number[] {
  const out: number[] = [];
  for (const n of names) {
    const i = board.nets.indexOf(n);
    if (i <= 0) throw new SourceError(`net-not-found:${n}`);
    out.push(i);
  }
  return out;
}

/** Driver pad: explicit, else an output pin, else a bidirectional one, else the first pad. */
export function detectDriver(board: BoardModel, nets: number[]): number {
  const pads = board.pads.map((p, i) => ({ p, i })).filter(({ p }) => nets.includes(p.net));
  const rank = (t: string) => ({ output: 0, power_out: 1, tri_state: 2, bidirectional: 3, open_collector: 4 })[t] ?? 9;
  pads.sort((a, b) => rank(a.p.pinType) - rank(b.p.pinType));
  return pads[0]?.i ?? -1;
}

// --- return through ground copper (no reference plane) ---------------------------------------

const GROUND_NAME = /^(\/)?(gnd|vss|0v|agnd|dgnd|pgnd|gndd|gnda|gndpwr|earth|ground|masse)([_\-.]?\w*)?$/i;

/**
 * The net a signal returns on when there is no plane under it: a ground-named net on the
 * driver's part, else on a receiving part, else any ground-named net with copper.
 */
export function groundNet(board: BoardModel, parts: number[]): number {
  const named = (i: number) => i > 0 && GROUND_NAME.test(board.nets[i] ?? '');
  for (const fp of parts) {
    const hit = board.pads.find((p) => p.footprint === fp && named(p.net));
    if (hit) return hit.net;
  }
  return board.nets.findIndex((n, i) => named(i) && board.tracks.some((t) => t.net === i));
}

/**
 * Explicit return currents for parts of a signal without a reference plane: from each node
 * the current crosses (capacitively) to the nearest ground copper, or for a receiver to its
 * own ground pin, runs along the ground copper to the driver's ground pin and through the
 * driver back to its output. Without a ground net nothing is added (and the loop stays open).
 */
class GroundReturn {
  private g: NetGraph;
  private tree: ReturnType<typeof shortestTree>;
  private rootPad: number;
  /** Current that arrives at the driver's ground pin, relative. */
  total = 0;
  constructor(
    private ctx: PhysicsContext,
    net: number,
    driverPad: number,
  ) {
    const { board } = ctx;
    this.g = buildNetGraph(board, [net], false);
    const fp = board.pads[driverPad]!.footprint;
    this.rootPad = board.pads.findIndex((p, i) => p.footprint === fp && p.net === net && this.g.padNodes.has(i));
    this.tree = shortestTree(this.g, this.rootPad >= 0 ? this.g.padNodes.get(this.rootPad)![0]! : 0);
  }

  get ok() {
    return this.rootPad >= 0;
  }

  /** Nearest ground node to a point (any layer). */
  private nearest(x: number, y: number): number {
    let best = -1;
    let bd = Infinity;
    this.g.nodes.forEach((nd, i) => {
      if (!Number.isFinite(this.tree.dist[i]!)) return;
      const d = Math.hypot(nd.x - x, nd.y - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Return of current w that leaves the signal at (x, y, layer); `viaPad`: a receiver's own pin. */
  add(out: CurrentElement[], x: number, y: number, layer: number, w: number, net: number, viaPad?: number) {
    const { board, frame } = this.ctx;
    const L = board.layers;
    let start = -1;
    if (viaPad !== undefined) {
      const fp = board.pads[viaPad]!.footprint;
      const own = board.pads.findIndex((p, i) => p.footprint === fp && this.g.padNodes.has(i) && Number.isFinite(this.tree.dist[this.g.padNodes.get(i)![0]!]!));
      if (own >= 0) start = this.g.padNodes.get(own)![0]!;
    }
    if (start < 0) start = this.nearest(x, y);
    if (start < 0) return false;
    const sn = this.g.nodes[start]!;
    // into the part (or across to the ground conductor)
    out.push({ a: toWorld(frame, { x, y }, L[layer]!.y), b: toWorld(frame, sn, L[sn.layer]!.y), w, r: 0.15, vertical: false, layer: -1, net, tag: 'return', noImage: true });
    // along the ground copper towards the driver (tree steps run from the driver outwards)
    for (const st of pathTo(this.tree, start) ?? []) {
      const el = stepElement(this.ctx, this.g, st, -w);
      out.push({ ...el, tag: 'return', noImage: true, layer: el.vertical ? -1 : el.layer });
    }
    this.total += w;
    return true;
  }

  /** Through the driver from its ground pin to its output pad. */
  close(out: CurrentElement[], driverPad: number) {
    if (this.total === 0) return;
    const { board, frame } = this.ctx;
    const L = board.layers;
    const g = board.pads[this.rootPad]!;
    const d = board.pads[driverPad]!;
    const side = board.footprints[d.footprint]!.side === 'bottom' ? L.length - 1 : 0;
    out.push({ a: toWorld(frame, g.at, L[side]!.y), b: toWorld(frame, d.at, L[side]!.y), w: this.total, r: 0.15, vertical: false, layer: -1, net: d.net, tag: 'return', noImage: true });
  }
}

// --- signal nets --------------------------------------------------------------------------------

interface NetCurrents {
  elements: CurrentElement[];
  series: { ref: string; ohms: number; fromDriverMm: number }[];
  cTotal: number;
  z0: number;
  eeff: number;
  lengthMm: number;
  maxPathMm: number;
  driver: number;
  warnings: string[];
}

/** Driver, receivers and the net graph of a signal (shared with the full-wave export). */
export interface NetTerminals {
  g: NetGraph;
  tree: ReturnType<typeof shortestTree>;
  /** Pad index of the driver. */
  driver: number;
  /** Pad indices of the receivers (one per pin, series parts excluded). */
  loads: number[];
  /** Graph node of a pad (top or bottom copper by the footprint side). */
  pickNode: (pi: number) => number;
  root: number;
  bridgePads: Set<number>;
  warnings: string[];
}

export function netTerminals(ctx: PhysicsContext, netNames: string[], driverRef: string): NetTerminals {
  const { board } = ctx;
  const nets = netIndices(board, netNames);
  if (!board.tracks.some((t) => nets.includes(t.net))) throw new SourceError('not-routed');
  const g = buildNetGraph(board, nets, true);
  const warnings: string[] = [];
  let driver = driverRef ? findPad(board, driverRef) : detectDriver(board, nets);
  if (driver < 0 || !nets.includes(board.pads[driver]!.net)) {
    if (driverRef) warnings.push(`driver-not-found:${driverRef}`);
    driver = detectDriver(board, nets);
  }
  if (driver < 0) throw new SourceError('no-pads');
  const fpSide = (pi: number) => board.footprints[board.pads[pi]!.footprint]!.side;
  const pickNode = (pi: number) => {
    const ids = g.padNodes.get(pi) ?? [];
    return fpSide(pi) === 'bottom' ? ids[ids.length - 1]! : ids[0]!;
  };
  const root = pickNode(driver);
  const tree = shortestTree(g, root);

  // pads that bridge two nets of this source are not loads
  const bridgePads = new Set<number>();
  for (const e of g.edges) {
    if (e.kind !== 'bridge') continue;
    for (const nid of [e.a, e.b]) if (g.nodes[nid]!.pad !== undefined) bridgePads.add(g.nodes[nid]!.pad!);
  }
  // one load per pin: pads of a footprint sharing a number are one pin
  const loads: number[] = [];
  const seenPins = new Set<string>([`${board.pads[driver]!.footprint}/${board.pads[driver]!.number}`]);
  for (const [pi] of g.padNodes) {
    const p = board.pads[pi]!;
    const pin = `${p.footprint}/${p.number}`;
    if (pi === driver || bridgePads.has(pi) || seenPins.has(pin)) continue;
    seenPins.add(pin);
    loads.push(pi);
  }
  return { g, tree, driver, loads, pickNode, root, bridgePads, warnings };
}

/** The termination pad of a terminated line: the given one, else the farthest receiver. */
export function terminationPad(ctx: PhysicsContext, t: NetTerminals, endPad: string): number {
  let end = endPad ? findPad(ctx.board, endPad) : -1;
  if (end < 0 || !t.g.padNodes.has(end)) {
    end = t.loads.map((pi) => ({ pi, d: t.tree.dist[t.pickNode(pi)]! })).filter((x) => Number.isFinite(x.d)).sort((a, b) => b.d - a.d)[0]?.pi ?? -1;
  }
  return end;
}

function netCurrents(ctx: PhysicsContext, netNames: string[], driverRef: string, load: LoadModel): NetCurrents {
  const { board } = ctx;
  const { g, tree, driver, loads, pickNode, root, warnings, bridgePads } = netTerminals(ctx, netNames, driverRef);
  // series parts between the source's nets: resistors are a source termination
  const series: NetCurrents['series'] = [];
  const seenParts = new Set<number>();
  for (const pi of bridgePads) {
    const fp = board.pads[pi]!.footprint;
    if (seenParts.has(fp)) continue;
    seenParts.add(fp);
    const f = board.footprints[fp]!;
    const ohms = /^R/i.test(f.ref) ? resistorValue(f.value) : NaN;
    const d = tree.dist[pickNode(pi)]!;
    if (Number.isFinite(ohms)) series.push({ ref: f.ref, ohms, fromDriverMm: Number.isFinite(d) ? d : Infinity });
  }

  // line length, capacitance and Z0 along the tree
  const n = g.nodes.length;
  const cNode = new Float64Array(n);
  let lengthMm = 0;
  let zSum = 0;
  let eSum = 0;
  for (const v of tree.order) {
    const s = tree.step[v];
    if (!s || s.edge < 0) continue;
    const e = g.edges[s.edge]!;
    if (e.kind !== 'track') continue;
    const lp = lineParams(ctx, e.layer, e.width);
    const c = lp.cPerM * (e.length / 1000);
    cNode[s.from] = cNode[s.from]! + c / 2;
    cNode[s.to] = cNode[s.to]! + c / 2;
    lengthMm += e.length;
    zSum += lp.z0 * e.length;
    eSum += lp.eeff * e.length;
  }
  const z0 = lengthMm > 0 ? zSum / lengthMm : 50;
  const eeff = lengthMm > 0 ? eSum / lengthMm : 3;
  const unreached = [...g.padNodes.keys()].filter((pi) => !Number.isFinite(tree.dist[pickNode(pi)]!));
  if (unreached.length) warnings.push(`unconnected-pads:${unreached.map((pi) => padName(board.pads[pi]!)).join(',')}`);

  const L = board.layers;
  const elements: CurrentElement[] = [];
  // without a plane under a node, its current returns through the ground copper
  const padOfNode = (v: number) => g.nodes[v]!.pad;
  let gr: GroundReturn | null | undefined;
  const groundReturn = () => {
    if (gr === undefined) {
      const net = groundNet(board, [board.pads[driver]!.footprint, ...loads.map((pi) => board.pads[pi]!.footprint)]);
      gr = net > 0 ? new GroundReturn(ctx, net, driver) : null;
      if (gr && !gr.ok) gr = null;
    }
    return gr;
  };
  const nodeVertical = (v: number, w: number) => {
    const nd = g.nodes[v]!;
    const ret = returnHeight(ctx, nd.layer, nd.x, nd.y);
    if (!ret.referenced) {
      warnings.push('unreferenced');
      const pad = padOfNode(v);
      const viaPad = pad !== undefined && loads.includes(pad) ? pad : undefined;
      if (ctx.planes.length === 0 && groundReturn()?.add(elements, nd.x, nd.y, nd.layer, w, board.pads[driver]!.net, viaPad)) return;
    }
    elements.push(verticalTo(ctx, nd.x, nd.y, L[nd.layer]!.y, ret.y, w, 0.15, board.pads[driver]!.net));
  };

  let maxPathMm = 0;
  for (const v of tree.order) maxPathMm = Math.max(maxPathMm, tree.dist[v]!);

  if (load.model === 'capacitive') {
    for (const pi of loads) {
      const v = pickNode(pi);
      if (Number.isFinite(tree.dist[v]!)) cNode[v] = cNode[v]! + load.cLoad;
    }
    const sub = new Float64Array(n);
    for (let k = tree.order.length - 1; k >= 0; k--) {
      const v = tree.order[k]!;
      sub[v] = sub[v]! + cNode[v]!;
      const p = tree.parent[v]!;
      if (p >= 0) sub[p] = sub[p]! + sub[v]!;
    }
    const cTotal = sub[root]!;
    if (!(cTotal > 0)) throw new SourceError('no-capacitance');
    for (const v of tree.order) {
      const s = tree.step[v];
      if (s) elements.push(stepElement(ctx, g, s, sub[v]! / cTotal));
      if (v !== root && cNode[v]! > 0) nodeVertical(v, cNode[v]! / cTotal);
    }
    // the driver: total current comes up from the plane, its own share goes straight back down;
    // what returned through the ground copper comes through the driver's ground pin instead
    const rn = g.nodes[root]!;
    const ret = returnHeight(ctx, rn.layer, rn.x, rn.y);
    const viaGround = gr ? gr.total : 0;
    gr?.close(elements, driver);
    const up = 1 - cNode[root]! / cTotal - viaGround;
    if (Math.abs(up) > 1e-9) elements.push(verticalTo(ctx, rn.x, rn.y, ret.y, L[rn.layer]!.y, up, 0.15, board.pads[driver]!.net));
    return { elements, series, cTotal, z0, eeff, lengthMm, maxPathMm, driver, warnings: [...new Set(warnings)] };
  }

  // terminated: constant current along driver -> termination
  const end = terminationPad(ctx, { g, tree, driver, loads, pickNode, root, bridgePads: new Set(), warnings }, load.endPad);
  if (end < 0) throw new SourceError('no-termination');
  const path = pathTo(tree, pickNode(end)) ?? [];
  let pathLen = 0;
  for (const s of path) {
    const el = stepElement(ctx, g, s, 1);
    elements.push(el);
    if (!el.vertical) pathLen += Math.hypot(el.b[0] - el.a[0], el.b[2] - el.a[2]);
  }
  const rn = g.nodes[root]!;
  const en = g.nodes[pickNode(end)]!;
  elements.push(verticalTo(ctx, rn.x, rn.y, returnHeight(ctx, rn.layer, rn.x, rn.y).y, L[rn.layer]!.y, 1, 0.15, board.pads[driver]!.net));
  elements.push(verticalTo(ctx, en.x, en.y, L[en.layer]!.y, returnHeight(ctx, en.layer, en.x, en.y).y, 1, 0.15, board.pads[driver]!.net));
  const z = load.z0 > 0 ? load.z0 : z0;
  return { elements, series, cTotal: 0, z0: z, eeff, lengthMm: pathLen, maxPathMm: pathLen, driver, warnings: [...new Set(warnings)] };
}

/**
 * Rise time at the load behind series resistors: the resistor and the capacitance it drives
 * form an RC low pass (10–90 % = 2.2·R·C), added in quadrature to the driver's own edge. The
 * driver's own output resistance is already part of the given rise time.
 */
export function seriesRiseTime(tr: number, ohms: number, cTotal: number): number {
  return Math.hypot(tr, 2.2 * ohms * cTotal);
}

function signalModel(ctx: PhysicsContext, src: SignalSource): SourceModel {
  const nc = netCurrents(ctx, src.nets, src.driver, src.load);
  const rSeries = nc.series.reduce((sum, r) => sum + r.ohms, 0);
  const trEff = src.load.model === 'capacitive' && rSeries > 0 ? seriesRiseTime(src.waveform.tr, rSeries, nc.cTotal) : src.waveform.tr;
  const v = trapezoidLines({ ...src.waveform, tr: trEff }, ctx.fMax);
  const lines =
    src.load.model === 'capacitive'
      ? mapLines(v, (f) => 2 * Math.PI * f * nc.cTotal)
      : mapLines(v, () => 1 / nc.z0);
  return {
    id: src.id,
    elements: nc.elements,
    lines,
    info: {
      lengthMm: nc.lengthMm,
      cTotal: src.load.model === 'capacitive' ? nc.cTotal : undefined,
      z0: nc.z0,
      eeff: nc.eeff,
      fShort: shortLineLimit(nc.maxPathMm, nc.eeff),
      driver: padName(ctx.board.pads[nc.driver]!),
      warnings: nc.warnings,
      series: nc.series,
      trEff,
    },
    centre: centreOf(nc.elements),
  };
}

function diffPairModel(ctx: PhysicsContext, src: DiffPairSource): SourceModel {
  const p = netCurrents(ctx, [src.netP], src.driverP, src.load);
  const n = netCurrents(ctx, [src.netN], src.driverN, src.load);
  const k = -(1 - src.imbalance);
  const elements = [...p.elements, ...n.elements.map((e) => ({ ...e, w: e.w * k }))];
  const v = voltageLines(ctx, src);
  const lines = src.load.model === 'capacitive' ? mapLines(v, (f) => 2 * Math.PI * f * p.cTotal) : mapLines(v, () => 1 / p.z0);
  return {
    id: src.id,
    elements,
    lines,
    info: {
      lengthMm: (p.lengthMm + n.lengthMm) / 2,
      cTotal: src.load.model === 'capacitive' ? p.cTotal : undefined,
      z0: p.z0,
      eeff: p.eeff,
      fShort: shortLineLimit(Math.max(p.maxPathMm, n.maxPathMm), p.eeff),
      driver: `${padName(ctx.board.pads[p.driver]!)} / ${padName(ctx.board.pads[n.driver]!)}`,
      warnings: [...new Set([...p.warnings, ...n.warnings])],
    },
    centre: centreOf(elements),
  };
}

// --- current loops ------------------------------------------------------------------------------

function loopModel(ctx: PhysicsContext, src: LoopSource): SourceModel {
  const { board } = ctx;
  if (src.pads.length < 2) throw new SourceError('loop-too-short');
  const padIdx = src.pads.map((r) => {
    const i = findPad(board, r);
    if (i < 0) throw new SourceError(`pad-not-found:${r}`);
    return i;
  });
  const L = board.layers;
  const planeOf = new Map(ctx.planes.map((p) => [p.layer, p.net]));
  const graphs = new Map<number, NetGraph>();
  const graphFor = (net: number) => {
    let g = graphs.get(net);
    if (!g) graphs.set(net, (g = buildNetGraph(board, [net], false)));
    return g;
  };
  const padLayer = (pi: number) => {
    const p = board.pads[pi]!;
    const side = board.footprints[p.footprint]!.side;
    return side === 'bottom' ? p.layers[p.layers.length - 1] ?? L.length - 1 : p.layers[0] ?? 0;
  };

  const elements: CurrentElement[] = [];
  const warnings: string[] = [];
  let lengthMm = 0;
  // vector area ½∮ r × dl of the loop as the current runs (plane parts included)
  const area: Vec3 = [0, 0, 0];
  const addArea = (a: Vec3, b: Vec3) => {
    area[0] += 0.5 * (a[1] * b[2] - a[2] * b[1]);
    area[1] += 0.5 * (a[2] * b[0] - a[0] * b[2]);
    area[2] += 0.5 * (a[0] * b[1] - a[1] * b[0]);
  };
  for (let k = 0; k < padIdx.length; k++) {
    const a = padIdx[k]!;
    const b = padIdx[(k + 1) % padIdx.length]!;
    const pa = board.pads[a]!;
    const pb = board.pads[b]!;
    if (pa.footprint === pb.footprint || pa.net !== pb.net || pa.net === 0) {
      if (pa.footprint !== pb.footprint) warnings.push(`loop-jump:${padName(pa)}-${padName(pb)}`);
      const la = padLayer(a);
      elements.push({
        a: toWorld(ctx.frame, pa.at, L[la]!.y),
        b: toWorld(ctx.frame, pb.at, L[la]!.y),
        w: 1,
        r: 0.3,
        vertical: false,
        layer: la,
        net: pa.net,
      });
      addArea(elements[elements.length - 1]!.a, elements[elements.length - 1]!.b);
      lengthMm += Math.hypot(pa.at.x - pb.at.x, pa.at.y - pb.at.y);
      continue;
    }
    const g = graphFor(pa.net);
    const nodeOf = (pi: number) => {
      const ids = g.padNodes.get(pi) ?? [];
      return ids.find((id) => g.nodes[id]!.layer === padLayer(pi)) ?? ids[0]!;
    };
    const tree = shortestTree(g, nodeOf(a));
    const path = pathTo(tree, nodeOf(b));
    if (!path) {
      warnings.push(`loop-no-path:${padName(pa)}-${padName(pb)}`);
      continue;
    }
    for (const s of path) {
      const el = stepElement(ctx, g, s, 1);
      addArea(el.a, el.b);
      // return current inside the net's own plane is represented by the mirror images
      if (!el.vertical && planeOf.get(el.layer) === pa.net) continue;
      elements.push(el);
      if (!el.vertical) lengthMm += Math.hypot(el.b[0] - el.a[0], el.b[2] - el.a[2]);
    }
  }
  const lines = trapezoidLines(src.waveform, ctx.fMax);
  return {
    id: src.id,
    elements,
    lines,
    info: { lengthMm, eeff: 1, fShort: shortLineLimit(lengthMm, 3), warnings: [...new Set(warnings)], loopArea: area },
    centre: centreOf(elements),
  };
}
