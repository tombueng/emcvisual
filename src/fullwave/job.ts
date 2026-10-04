/**
 * Stage 3: export of a full-wave job for openEMS (docs/zukunft/STUFE-3-VOLLWELLE.md).
 *
 * The browser cannot run openEMS, so it writes a self-contained job (JSON): stack-up, copper
 * per layer as polygons, via and hole barrels, one port per source with the lumped parts it
 * needs, the frequencies and the app's sampling grid. `tools/openems/run_job.py` builds the
 * model, runs one simulation per source and writes the field per ampere of port current back
 * on the app's grid (src/fullwave/result.ts reads it).
 *
 * Job coordinates (mm): X = KiCad x − ox, Y = −(KiCad y − oy), Z = height above the F.Cu
 * copper centre (world y). That is right-handed with Z up, as openEMS expects.
 */
import { circlePoints, padOutline, pointInRing, rotateKicad } from '../model/geometry';
import type { Vec2 } from '../model/types';
import type { Grid } from '../compute/grid';
import { findPad, netTerminals, padName, returnHeight, terminationPad, type PhysicsContext, type SourceModel } from '../physics/currents';
import type { LoadModel, Source } from '../physics/sources';
import { capacitorValue, resistorValue } from '../physics/units';

export const FULLWAVE_JOB_KIND = 'pcb-field-fullwave-job';

export type XY = [number, number];

/** A port or lumped part between two points; dir is the axis the current flows along. */
export interface JobElement {
  /** Box corners (job mm); the box is snapped to the mesh by openEMS. */
  start: [number, number, number];
  stop: [number, number, number];
  dir: 'x' | 'y' | 'z';
  /** Where it sits, for messages ("U1.1", "U1.1-U1.2"). */
  label: string;
}

export interface JobPort extends JobElement {
  /** Internal resistance, Ω. */
  r: number;
  /** +1 or −1 (the N leg of a differential pair). */
  excite: number;
}

export interface JobLumped extends JobElement {
  r?: number;
  c?: number;
}

export interface JobSource {
  id: string;
  name: string;
  type: Source['type'];
  ports: JobPort[];
  lumped: JobLumped[];
  /** Thin PEC straps (capacitors in a hot loop are shorts at these frequencies). */
  shorts: JobElement[];
  /** Nets this source drives; their copper is kept clear of other copper on the same layer. */
  nets: number[];
}

export interface FullwaveJob {
  kind: typeof FULLWAVE_JOB_KIND;
  version: 1;
  createdAt: string;
  board: { fileName: string; hash: string };
  /** Board outline (outer ring) and the stack-up. */
  outline: XY[];
  layers: { name: string; z: number; thickness: number }[];
  dielectrics: { zTop: number; zBottom: number; epsR: number; tanD: number }[];
  /** Net names; `net` fields below index into this list (0 = no net). */
  nets: string[];
  /**
   * Copper sheets per layer (all nets: neighbours couple too). `kind` says what it is, so the
   * runner can give a source's own copper priority over the rest (see run_job.py).
   */
  copper: { layer: number; polys: { net: number; kind: 'zone' | 'pad' | 'track' | 'via'; pts: XY[] }[] }[];
  /**
   * Centre lines of tracks and a line across every pad. They are snapped to the mesh as thin
   * wires, so narrow copper stays connected even when it is thinner than a cell.
   */
  wires: { layer: number; net: number; a: XY; b: XY; width: number }[];
  /**
   * Plated barrels of vias and through-hole pads, as thin wires from z0 to z1. `isolate` lists
   * the layers where a zone of another net covers the barrel: there it needs an antipad that
   * the mesh resolves, or the via would touch that plane.
   */
  barrels: { x: number; y: number; z0: number; z1: number; net: number; r: number; isolate: number[] }[];
  /**
   * Two-pin capacitors of the board (decoupling, filters) as series R-L-C between their pads.
   * Without them the planes form an open cavity that rings for a long time, and return
   * currents that jump between planes through a capacitor have no path.
   */
  caps: (JobElement & { c: number; nets: number[]; esr?: number; esl?: number })[];
  sources: JobSource[];
  /** Sources that are not simulated, with the reason. */
  skipped: { id: string; name: string; reason: string }[];
  /** Frequencies of the field dumps, Hz. */
  freqs: number[];
  /** The app's sampling grid (world frame, see src/compute/grid.ts) for the results. */
  grid: Grid;
  mesh: {
    /** Cell size over the board, mm. */
    res: number;
    /** Largest cell in the air, mm. */
    maxRes: number;
    /** Air around the board before the absorbing boundary, mm. */
    airXY: number;
    airAbove: number;
    airBelow: number;
  };
  /** Stop when the field energy has dropped by this much (dB) or after maxSteps. */
  endCriteriaDb: number;
  maxSteps: number;
}

export interface JobOptions {
  fMin: number;
  fMax: number;
  nFreqs: number;
  res: number;
  /** Source impedance of signal drivers, Ω. */
  driverR: number;
}

export const DEFAULT_JOB_OPTIONS: JobOptions = { fMin: 20e6, fMax: 1e9, nFreqs: 12, res: 0.5, driverR: 33 };

/** Log-spaced frequencies from fMin to fMax, rounded to 0.1 MHz. */
export function jobFrequencies(fMin: number, fMax: number, n: number): number[] {
  if (n <= 1) return [fMax];
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(Math.round((fMin * (fMax / fMin) ** (k / (n - 1))) / 1e5) * 1e5);
  return [...new Set(out)];
}

/** Rectangle around a straight track segment with square caps (round caps are below the mesh). */
function segmentPoly(a: Vec2, b: Vec2, w: number): Vec2[] {
  const hw = w / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d = len > 1e-9 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 };
  const n = { x: -d.y, y: d.x };
  const a0 = { x: a.x - d.x * hw, y: a.y - d.y * hw };
  const b0 = { x: b.x + d.x * hw, y: b.y + d.y * hw };
  return [
    { x: a0.x + n.x * hw, y: a0.y + n.y * hw },
    { x: b0.x + n.x * hw, y: b0.y + n.y * hw },
    { x: b0.x - n.x * hw, y: b0.y - n.y * hw },
    { x: a0.x - n.x * hw, y: a0.y - n.y * hw },
  ];
}

export { capacitorValue, resistorValue } from '../physics/units';

export function buildJob(
  ctx: PhysicsContext,
  sources: Source[],
  models: Record<string, SourceModel | undefined>,
  grid: Grid,
  meta: { fileName: string; hash: string },
  opts: JobOptions = DEFAULT_JOB_OPTIONS,
  /** Capacitor data from the scenario (AI-PARTS-MANUAL.md), overrides the value field. */
  parts: { ref: string; c?: number; esr?: number; esl?: number }[] = [],
): FullwaveJob {
  const { board, frame } = ctx;
  const J = (p: Vec2): XY => [round(p.x - frame.ox), round(-(p.y - frame.oy))];
  const L = board.layers;

  // --- geometry -------------------------------------------------------------------------------
  type Poly = FullwaveJob['copper'][number]['polys'][number];
  const perLayer: Poly[][] = L.map(() => []);
  for (const t of board.tracks) perLayer[t.layer]?.push({ net: t.net, kind: 'track', pts: segmentPoly(t.a, t.b, t.width).map(J) });
  for (const p of board.pads) for (const li of p.layers) perLayer[li]?.push({ net: p.net, kind: 'pad', pts: padOutline(p).map(J) });
  for (const z of board.zones) for (const ring of z.polygons) if (ring.length >= 3) perLayer[z.layer]?.push({ net: z.net, kind: 'zone', pts: ring.map(J) });
  const wires: FullwaveJob['wires'] = board.tracks.map((t) => ({ layer: t.layer, net: t.net, a: J(t.a), b: J(t.b), width: t.width }));
  for (const p of board.pads) {
    // along the long side, through the centre where tracks end
    const long = p.size.x >= p.size.y ? { x: p.size.x / 2 - p.size.y / 4, y: 0 } : { x: 0, y: p.size.y / 2 - p.size.x / 4 };
    const d = rotateKicad(long, p.angle);
    const a = J({ x: p.at.x - d.x, y: p.at.y - d.y });
    const b = J({ x: p.at.x + d.x, y: p.at.y + d.y });
    for (const li of p.layers) wires.push({ layer: li, net: p.net, a, b, width: Math.min(p.size.x, p.size.y) });
  }
  /**
   * Layers where fill of another net comes close to a barrel. KiCad's fill already has the
   * antipad as a hole, but a hole smaller than a cell disappears in the mesh, so look at rings
   * 0.6–1.5 mm outside the barrel: fill there means the runner must cut a meshable antipad.
   */
  const isolateAt = (at: Vec2, r: number, net: number, from: number, to: number) => {
    const ring = [0.6, 1, 1.5].flatMap((d) => circlePoints(at, r + d, 8));
    const out: number[] = [];
    for (let li = from; li <= to; li++)
      if (board.zones.some((z) => z.layer === li && z.net !== net && ring.some((q) => z.polygons.some((poly) => pointInRing(q, poly))))) out.push(li);
    return out;
  };
  const barrels: FullwaveJob['barrels'] = [];
  for (const v of board.vias) {
    for (let li = v.fromLayer; li <= v.toLayer; li++) perLayer[li]?.push({ net: v.net, kind: 'via', pts: circlePoints(v.at, v.diameter / 2, 8).map(J) });
    const [x, y] = J(v.at);
    barrels.push({ x, y, z0: L[v.toLayer]!.y, z1: L[v.fromLayer]!.y, net: v.net, r: v.diameter / 2, isolate: isolateAt(v.at, v.diameter / 2, v.net, v.fromLayer, v.toLayer) });
  }
  for (const p of board.pads) {
    if (p.kind !== 'thru_hole' || p.layers.length < 2) continue;
    const [x, y] = J(p.at);
    const from = p.layers[0]!;
    const to = p.layers[p.layers.length - 1]!;
    const r = Math.max(p.size.x, p.size.y) / 2;
    barrels.push({ x, y, z0: L[to]!.y, z1: L[from]!.y, net: p.net, r, isolate: isolateAt(p.at, r, p.net, from, to) });
  }

  const dielectrics = board.dielectrics.map((d) => {
    const above = L[d.above]!;
    const zTop = above.y - above.thickness / 2;
    return { zTop: round(zTop), zBottom: round(zTop - d.thickness), epsR: d.epsilonR, tanD: d.lossTangent };
  });

  // --- sources ----------------------------------------------------------------------------------
  const padLayer = (pi: number) => {
    const p = board.pads[pi]!;
    return board.footprints[p.footprint]!.side === 'bottom' ? (p.layers[p.layers.length - 1] ?? L.length - 1) : (p.layers[0] ?? 0);
  };
  /** Vertical element from a pad down (or up) to the reference plane under it. */
  const toPlane = (pi: number): JobElement => {
    const p = board.pads[pi]!;
    const li = padLayer(pi);
    const ret = returnHeight(ctx, li, p.at.x, p.at.y);
    const [x, y] = J(p.at);
    const zc = L[li]!.y;
    return { start: [x, y, round(Math.min(zc, ret.y))], stop: [x, y, round(Math.max(zc, ret.y))], dir: 'z', label: padName(p) };
  };
  /** Horizontal element between two pads on the same copper layer, along the longer axis. */
  const between = (a: number, b: number): JobElement => {
    const pa = board.pads[a]!;
    const pb = board.pads[b]!;
    const [xa, ya] = J(pa.at);
    const [xb, yb] = J(pb.at);
    const z = L[padLayer(a)]!.y;
    const dir = Math.abs(xb - xa) >= Math.abs(yb - ya) ? 'x' : 'y';
    const xm = round((xa + xb) / 2);
    const ym = round((ya + yb) / 2);
    const start: [number, number, number] = dir === 'x' ? [Math.min(xa, xb), ym, z] : [xm, Math.min(ya, yb), z];
    const stop: [number, number, number] = dir === 'x' ? [Math.max(xa, xb), ym, z] : [xm, Math.max(ya, yb), z];
    return { start, stop, dir, label: `${padName(pa)}-${padName(pb)}` };
  };
  const seriesParts = (bridge: Set<number>): JobLumped[] => {
    const byFp = new Map<number, number[]>();
    for (const pi of bridge) byFp.set(board.pads[pi]!.footprint, [...(byFp.get(board.pads[pi]!.footprint) ?? []), pi]);
    const out: JobLumped[] = [];
    for (const [fi, pads] of byFp) {
      if (pads.length !== 2) continue;
      const f = board.footprints[fi]!;
      const r = /^R/i.test(f.ref) ? resistorValue(f.value) : 0;
      const el = between(pads[0]!, pads[1]!);
      // 0 Ω, ferrites and unknown parts: a strap
      out.push(Number.isFinite(r) && r > 0 ? { ...el, r } : { ...el, r: 0.01 });
    }
    return out;
  };
  const loadsFor = (nets: string[], driverRef: string, load: LoadModel, excite: number, z0: number) => {
    const t = netTerminals(ctx, nets, driverRef);
    const port: JobPort = { ...toPlane(t.driver), r: opts.driverR, excite };
    const lumped: JobLumped[] = seriesParts(t.bridgePads);
    if (load.model === 'capacitive') for (const pi of t.loads) lumped.push({ ...toPlane(pi), c: load.cLoad });
    else {
      const end = terminationPad(ctx, t, load.endPad);
      if (end >= 0) lumped.push({ ...toPlane(end), r: load.z0 > 0 ? load.z0 : z0 });
    }
    return { port, lumped };
  };

  const netIds = (names: string[]) => names.map((n) => board.nets.indexOf(n)).filter((i) => i > 0);
  const caps: FullwaveJob['caps'] = [];
  for (const f of board.footprints) {
    if (!/^C\d/i.test(f.ref) || f.pads.length !== 2) continue;
    const data = parts.find((p) => p.ref === f.ref);
    const c = data?.c ?? capacitorValue(f.value);
    const [a, b] = f.pads as [number, number];
    if (!(c > 0) || board.pads[a]!.net === board.pads[b]!.net) continue;
    caps.push({
      ...between(a, b),
      c,
      nets: [board.pads[a]!.net, board.pads[b]!.net],
      ...(data?.esr !== undefined ? { esr: data.esr } : {}),
      ...(data?.esl !== undefined ? { esl: data.esl } : {}),
    });
  }
  const out: JobSource[] = [];
  const skipped: FullwaveJob['skipped'] = [];
  for (const src of sources) {
    if (!src.enabled) continue;
    const model = models[src.id];
    if (!model) {
      skipped.push({ id: src.id, name: src.name, reason: 'no-model' });
      continue;
    }
    try {
      if (src.type === 'signal') {
        const { port, lumped } = loadsFor(src.nets, src.driver, src.load, 1, model.info.z0 ?? 50);
        out.push({ id: src.id, name: src.name, type: src.type, ports: [port], lumped, shorts: [], nets: netIds(src.nets) });
      } else if (src.type === 'diffpair') {
        const p = loadsFor([src.netP], src.driverP, src.load, 1, (model.info.z0 ?? 100) / 2);
        const n = loadsFor([src.netN], src.driverN, src.load, -1, (model.info.z0 ?? 100) / 2);
        out.push({ id: src.id, name: src.name, type: src.type, ports: [p.port, n.port], lumped: [...p.lumped, ...n.lumped], shorts: [], nets: netIds([src.netP, src.netN]) });
      } else if (src.type === 'loop') {
        const idx = src.pads.map((r) => findPad(board, r));
        if (idx.some((i) => i < 0)) throw new Error('pad-not-found');
        // steps inside one part: the switch (a semiconductor) drives, capacitors are shorts
        const inside: [number, number][] = [];
        for (let k = 0; k < idx.length; k++) {
          const a = idx[k]!;
          const b = idx[(k + 1) % idx.length]!;
          const pa = board.pads[a]!;
          const pb = board.pads[b]!;
          if (pa.footprint === pb.footprint || pa.net !== pb.net || pa.net === 0) inside.push([a, b]);
        }
        const isCap = ([a]: [number, number]) => /^C/i.test(board.pads[a]!.ref);
        const drive = inside.find((s) => !isCap(s)) ?? inside[0];
        if (!drive) throw new Error('loop-without-part');
        // 10 Ω: the field is normalised to the port current anyway, and a low resistance would
        // let the loop current (L/R) ring for a long time before the run may stop
        const port: JobPort = { ...between(drive[0], drive[1]), r: 10, excite: 1 };
        const shorts = inside.filter((s) => s !== drive).map(([a, b]) => between(a, b));
        out.push({ id: src.id, name: src.name, type: src.type, ports: [port], lumped: [], shorts, nets: [...new Set(idx.map((i) => board.pads[i]!.net).filter((n) => n > 0))] });
      } else {
        skipped.push({ id: src.id, name: src.name, reason: 'inductor' });
      }
    } catch (e) {
      skipped.push({ id: src.id, name: src.name, reason: (e as Error).message || 'error' });
    }
  }

  return {
    kind: FULLWAVE_JOB_KIND,
    version: 1,
    createdAt: new Date().toISOString(),
    board: meta,
    outline: (board.outline[0] ?? []).map(J),
    layers: L.map((l) => ({ name: l.name, z: round(l.y), thickness: l.thickness })),
    dielectrics,
    nets: board.nets,
    caps,
    copper: perLayer.map((polys, layer) => ({ layer, polys })).filter((c) => c.polys.length > 0),
    wires,
    barrels,
    sources: out,
    skipped,
    freqs: jobFrequencies(opts.fMin, opts.fMax, opts.nFreqs),
    grid,
    mesh: { res: opts.res, maxRes: 4, airXY: 20, airAbove: 25, airBelow: 20 },
    endCriteriaDb: -30,
    maxSteps: 400_000,
  };
}

function round(v: number) {
  return Math.round(v * 1e4) / 1e4;
}


