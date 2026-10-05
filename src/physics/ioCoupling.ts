/**
 * Fast signals coupling into I/O lines (catalogue K-16), after the Clemson EMC expert system
 * ("Radiation by I/O Coupling Algorithm"): a slow line that leaves the board through a cable
 * connector picks up the harmonics of a neighbouring clock by crosstalk and carries them onto
 * the cable as common-mode current.
 *
 * Per pair of parallel segments (same layer, or layers without a plane between them):
 *
 *     V_mag  = ω · M · I · l          (inductive)
 *     V_elec = ω · C_m · V · l · 100 Ω  (capacitive, 100 Ω for source and load in parallel)
 *
 * with M = µ0/(4π) · ln(1 + 4h²/s²) for two lines at height h over a plane, spaced s (image
 * theory) and C_m = M · C / L (weak coupling, nearly homogeneous dielectric). Per I/O net the
 * larger sum counts; the cable radiates E = 40 · V_n / Z_ant at 3 m (resonant cable, ground
 * reflection), Z_ant = min(800 Ω, 80 · (N + 1)) with N ground pins in the connector, 800 Ω for a
 * shielded connector. Like the cable estimate in commonMode.ts this is a worst case.
 */
import type { PlaneLayer } from '../model/planes';
import type { BoardModel, Vec2 } from '../model/types';
import type { PhysicsContext, SourceModel } from './currents';
import { groundNet, lineParams } from './currents';
import { limitAt, type LimitSegment } from './farfield';
import type { Source } from './sources';
import { lineAmp, trapezoidLines } from './spectrum';
import { MU0 } from './units';
import { cableConnectors } from './commonMode';

/** Lines farther apart than this many heights (at least 3 mm) are not coupled noticeably. */
const MAX_SPACING_H = 15;
/** Segments within this angle count as parallel, degrees. */
const PARALLEL_DEG = 15;

export interface IoCouplingEstimate {
  sourceId: string;
  /** The I/O net that leaves the board, and through which connector. */
  ioNet: string;
  connector: string;
  /** Parallel run length (mm) and closest centre spacing (mm). */
  length: number;
  spacing: number;
  /** Where the coupling is strongest (board mm). */
  at: Vec2;
  zAnt: number;
  /** Summed mutual inductance (H) and coupling capacitance (F) along the parallel runs. */
  mutual: number;
  capacitance: number;
  /** 'mag' or 'elec': which coupling dominates at the worst line. */
  kind: 'mag' | 'elec';
  lines: { f: number; v: number; db: number }[];
  worst: { f: number; db: number; margin: number } | null;
}

const GROUND = /^(\/)?(gnd|vss|0v|agnd|dgnd|pgnd|gndd|gnda|gndpwr|earth|ground|masse)([_\-.]?\w*)?$/i;

/** Nets that leave the board through a cable connector (and the nets behind series parts). */
export function ioNets(board: BoardModel): { net: number; connector: string }[] {
  const conns = new Set(cableConnectors(board).map((c) => c.ref));
  const out = new Map<number, string>();
  board.footprints.forEach((fp, i) => {
    if (!conns.has(fp.ref)) return;
    for (const pi of fp.pads) {
      const p = board.pads[pi]!;
      if (p.net > 0 && !GROUND.test(board.nets[p.net] ?? '')) out.set(p.net, fp.ref);
    }
    void i;
  });
  // one step through series parts (R, L, ferrite beads): those nets carry the same signal
  for (const [net, conn] of [...out]) {
    for (const fp of board.footprints) {
      if (fp.pads.length !== 2 || !/^(R|L|FB)\d/i.test(fp.ref)) continue;
      const a = board.pads[fp.pads[0]!]!.net;
      const b = board.pads[fp.pads[1]!]!.net;
      const other = a === net ? b : b === net ? a : -1;
      if (other > 0 && !out.has(other) && !GROUND.test(board.nets[other] ?? '')) out.set(other, conn);
    }
  }
  return [...out].map(([net, connector]) => ({ net, connector }));
}

/** Antenna impedance of the cable on a connector (Clemson): shielded 800 Ω, else 80·(N+1), at most 800 Ω. */
export function connectorZant(board: BoardModel, ref: string): number {
  const fp = board.footprints.find((f) => f.ref === ref);
  if (!fp) return 160;
  const pads = fp.pads.map((pi) => board.pads[pi]!);
  const shielded = pads.some((p) => /^(S|SH|SHIELD|MP)\d*$/i.test(p.number)) && /usb|rj45|hdmi|d.?sub|sma|bnc|displayport/i.test(fp.lib);
  if (shielded) return 800;
  const nGround = new Set(pads.filter((p) => GROUND.test(board.nets[p.net] ?? '')).map((p) => p.number)).size;
  return Math.min(800, 80 * (nGround + 1));
}

interface Seg {
  a: Vec2;
  b: Vec2;
  layer: number;
  width: number;
}

function segsOf(board: BoardModel, nets: Set<number>): Seg[] {
  return board.tracks.filter((t) => nets.has(t.net)).map((t) => ({ a: t.a, b: t.b, layer: t.layer, width: t.width }));
}

/** No plane between the two layers (coupling through a plane is ignored, as in the source). */
function sameSide(planes: PlaneLayer[], l0: number, l1: number): boolean {
  const lo = Math.min(l0, l1);
  const hi = Math.max(l0, l1);
  return !planes.some((p) => p.layer > lo && p.layer < hi);
}

/** Overlap length of b's projection on a, and the spacing of b's midpoint from a's line. */
function parallelRun(a: Seg, b: Seg): { length: number; spacing: number; at: Vec2 } | null {
  const ax = a.b.x - a.a.x;
  const ay = a.b.y - a.a.y;
  const la = Math.hypot(ax, ay);
  const bx = b.b.x - b.a.x;
  const by = b.b.y - b.a.y;
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return null;
  const ux = ax / la;
  const uy = ay / la;
  const sin = Math.abs(ux * (by / lb) - uy * (bx / lb));
  if (sin > Math.sin((PARALLEL_DEG * Math.PI) / 180)) return null;
  const t0 = (b.a.x - a.a.x) * ux + (b.a.y - a.a.y) * uy;
  const t1 = (b.b.x - a.a.x) * ux + (b.b.y - a.a.y) * uy;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(la, Math.max(t0, t1));
  if (hi - lo <= 0) return null;
  const mx = (b.a.x + b.b.x) / 2;
  const my = (b.a.y + b.b.y) / 2;
  const spacing = Math.abs((mx - a.a.x) * uy - (my - a.a.y) * ux);
  const tm = (lo + hi) / 2;
  return { length: hi - lo, spacing, at: { x: a.a.x + ux * tm, y: a.a.y + uy * tm } };
}

export function ioCouplingEstimates(ctx: PhysicsContext, src: Source, model: SourceModel, limits: LimitSegment[], refPlaneOf: (layer: number) => PlaneLayer | undefined): IoCouplingEstimate[] {
  if (src.type !== 'signal') return [];
  const { board, planes } = ctx;
  const srcNets = new Set(src.nets.map((n) => board.nets.indexOf(n)).filter((i) => i > 0));
  const srcSegs = segsOf(board, srcNets);
  if (srcSegs.length === 0) return [];
  const gnd = groundNet(board, []);
  const vLines = trapezoidLines({ ...src.waveform, tr: model.info.trEff ?? src.waveform.tr }, ctx.fMax);
  const iLines = model.lines;
  const out: IoCouplingEstimate[] = [];
  for (const { net, connector } of ioNets(board)) {
    if (srcNets.has(net) || net === gnd) continue;
    const io = segsOf(board, new Set([net]));
    // coupling per unit current / voltage, summed over all parallel pairs
    let mSum = 0; // Σ M·l, H
    let cSum = 0; // Σ C_m·l, F
    let length = 0;
    let spacing = Infinity;
    let at: Vec2 | null = null;
    let best = 0;
    for (const a of io)
      for (const b of srcSegs) {
        if (!sameSide(planes, a.layer, b.layer)) continue;
        const ref = refPlaneOf(a.layer);
        const h = ref ? Math.abs(board.layers[a.layer]!.y - ref.y) : 1.6;
        const run = parallelRun(a, b);
        if (!run) continue;
        const s = Math.max(run.spacing, (a.width + b.width) / 2);
        if (s > Math.max(MAX_SPACING_H * h, 3)) continue;
        const m = (MU0 / (4 * Math.PI)) * Math.log(1 + (4 * h * h) / (s * s)); // H/m
        const lp = lineParams(ctx, a.layer, a.width);
        const cm = (m * lp.cPerM) / lp.lPerM; // F/m
        const l = run.length * 1e-3;
        mSum += m * l;
        cSum += cm * l;
        length += run.length;
        if (m * l > best) {
          best = m * l;
          at = run.at;
        }
        spacing = Math.min(spacing, s);
      }
    if (!at || length < 2) continue;
    const zAnt = connectorZant(board, connector);
    let kindAtWorst: 'mag' | 'elec' = 'mag';
    const lines = iLines.map((il) => {
      const w = 2 * Math.PI * il.f;
      const vl = vLines.find((x) => Math.abs(x.f - il.f) < 1);
      const vMag = w * mSum * lineAmp(il);
      const vElec = vl ? w * cSum * lineAmp(vl) * 100 : 0;
      const v = Math.max(vMag, vElec);
      const e = (40 * v) / zAnt;
      return { f: il.f, v, db: e > 0 ? 20 * Math.log10(e) + 120 : -200, k: vElec > vMag ? ('elec' as const) : ('mag' as const) };
    });
    let worst: IoCouplingEstimate['worst'] = null;
    for (const l of lines) {
      const lim = limitAt(limits, l.f);
      if (lim !== null && (!worst || l.db - lim > worst.margin)) {
        worst = { f: l.f, db: l.db, margin: l.db - lim };
        kindAtWorst = l.k;
      }
    }
    out.push({
      sourceId: src.id,
      ioNet: board.nets[net] ?? '',
      connector,
      length,
      spacing,
      at,
      zAnt,
      mutual: mSum,
      capacitance: cSum,
      kind: kindAtWorst,
      lines: lines.map(({ f, v, db }) => ({ f, v, db })),
      worst,
    });
  }
  return out.sort((p, q) => (q.worst?.margin ?? -999) - (p.worst?.margin ?? -999));
}
