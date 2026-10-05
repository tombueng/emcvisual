/**
 * K-34: the switching current of a regulator on the supply cable (docs/research/EMC-MISTAKES-CATALOGUE.md).
 *
 * The hot loop of a regulator draws its current in pulses from the supply node. The capacitors
 * there take most of the AC part, but not all: the rest goes through the supply path (fuse,
 * diode, filter) to the connector and out on the cable. Estimated as a current divider over the
 * ladder network of that path, ended by a line impedance stabilisation network (2 × 50 Ω):
 *
 *   node 0 (regulator input) ─ Z_e0 ─ node 1 ─ … ─ node k (connector) ─ 2 × 50 Ω
 *      │                         │                     │
 *    caps                       caps                  caps          (each with ESR and ESL)
 *
 * The voltage at one LISN between 150 kHz and 30 MHz is compared with the average limit for AC
 * mains ports of EN 55032 class B, as a yardstick only: which limit applies to a DC input
 * depends on the standard and the setup (texts say so).
 */
import type { BoardModel, Footprint, Pad, Vec2 } from '../model/types';
import type { PhysicsContext } from './currents';
import { findPad } from './currents';
import { cableConnectors } from './commonMode';
import type { Diagnostic } from './diagnostics';
import { filterPart } from './filterParts';
import type { Source } from './sources';
import { lineAmp, trapezoidLines } from './spectrum';
import { capacitorValue, resistorValue } from './units';

const GROUND = /^(\/)?(gnd|vss|0v|agnd|dgnd|pgnd|gndd|gnda|gndpwr|earth|ground|masse)([_\-.]?\w*)?$/i;
/** Conducted range, Hz. */
const F_LO = 150e3;
const F_HI = 30e6;
/** One line of the LISN, and the loop through both, Ω. */
const LISN = 50;
/** Package and mounting of a ceramic capacitor, H; of an electrolytic, H. */
const ESL_CERAMIC = 1e-9;
const ESL_ELECTROLYTIC = 5e-9;
/** ESR assumed for ceramic and for electrolytic/tantalum capacitors, Ω. */
const ESR_CERAMIC = 0.005;
const ESR_ELECTROLYTIC = 0.1;
/**
 * Track between the regulator and a capacitor on the same net, per mm: 0.5 nH (rough, over a
 * plane) and 1 mΩ (0.5 mm × 35 µm copper). The resistance matters: without it a far capacitor
 * behind its track inductance forms an undamped tank with the near one.
 */
const TRACK_H_PER_MM = 0.5e-9;
const TRACK_R_PER_MM = 1e-3;
/** Red from this many dB over the yardstick. */
export const SUPPLY_RED_DB = 20;

/** EN 55032 class B, AC mains port, average detector (dBµV): 56→46 (log, 0.15–0.5 MHz), 46, 50 (5–30 MHz). */
export function conductedAvLimit(f: number): number | null {
  if (f < F_LO || f > F_HI) return null;
  if (f < 500e3) return 56 - (10 * Math.log10(f / F_LO)) / Math.log10(500e3 / F_LO);
  return f <= 5e6 ? 46 : 50;
}

/** Complex numbers as [re, im]. */
type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const abs = (a: C) => Math.hypot(a[0], a[1]);
const par = (a: C | null, b: C | null): C | null => (!a ? b : !b ? a : div(mul(a, b), add(a, b)));

interface Cap {
  ref: string;
  c: number;
  esr: number;
  esl: number;
}

interface Edge {
  ref: string;
  kind: 'filter' | 'pass';
  /** Series impedance model: inductance (H) and resistance (Ω). */
  l: number;
  r: number;
}

export interface SupplyNoise {
  connector: string;
  /** Nets from the regulator input to the connector, and the parts between them. */
  nets: string[];
  path: string[];
  /** The filter parts on the path (inductors, ferrites). */
  filters: string[];
  /** Capacitance at the regulator input and their parts. */
  cin: number;
  cinParts: string[];
  regulators: string[];
  /** Strongest line against the yardstick: frequency, level at one LISN (dBµV), limit, cable current (A). */
  worst: { f: number; db: number; limit: number; amps: number };
}

const isGround = (board: BoardModel, net: number) => net > 0 && GROUND.test(board.nets[net] ?? '');
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function twoPin(board: BoardModel, fp: Footprint): [Pad, Pad] | null {
  return fp.pads.length === 2 ? [board.pads[fp.pads[0]!]!, board.pads[fp.pads[1]!]!] : null;
}

/** Capacitors from a net to ground. */
function capsOn(board: BoardModel, net: number): (Cap & { pad: Pad })[] {
  const out: (Cap & { pad: Pad })[] = [];
  for (const fp of board.footprints) {
    if (!/^C\d/i.test(fp.ref)) continue;
    const pads = twoPin(board, fp);
    if (!pads) continue;
    const on = pads.find((p) => p.net === net);
    const other = pads.find((p) => p !== on);
    if (!on || !other || !isGround(board, other.net)) continue;
    const c = capacitorValue(fp.value);
    if (!(c > 0)) continue;
    const elec = /^CP|elec|tantal|polar|CP_/i.test(fp.lib.split(':').pop() ?? '') || /elko|electrolytic|tantal/i.test(fp.value) || c >= 47e-6;
    out.push({ ref: fp.ref, c, esr: elec ? ESR_ELECTROLYTIC : ESR_CERAMIC, esl: elec ? ESL_ELECTROLYTIC : ESL_CERAMIC, pad: on });
  }
  return out;
}

/** A two-pin part in the supply path: inductor or ferrite (filter), fuse, diode, jumper or a resistor up to 1 Ω (pass). */
function seriesEdge(fp: Footprint): Edge | null | 'unknown' {
  if (/^(L|FB)\d/i.test(fp.ref)) {
    const part = filterPart(fp);
    if (!part) return 'unknown';
    if (part.henry !== undefined) return { ref: fp.ref, kind: 'filter', l: part.henry, r: 0.05 };
    // ferrite: inductive below 100 MHz with L = Z/(2π·100 MHz); its losses are left out (favourable)
    return { ref: fp.ref, kind: 'filter', l: (part.ohms ?? 600) / (2 * Math.PI * 1e8), r: 0.05 };
  }
  if (/^(F|D|JP|PTC|RT)\d/i.test(fp.ref)) return { ref: fp.ref, kind: 'pass', l: 0, r: 0.05 };
  if (/^R\d/i.test(fp.ref)) {
    const r = resistorValue(fp.value);
    return r <= 1 ? { ref: fp.ref, kind: 'pass', l: 0, r: Math.max(r, 0.01) } : null;
  }
  return null;
}

/**
 * The supply-noise estimates for the enabled regulator loops (loop sources with a switch node),
 * one per regulator input net that reaches a cable connector. Regulators on the same input net
 * add up in power.
 */
export function supplyNoise(ctx: PhysicsContext, sources: Source[]): (SupplyNoise & { at: Vec2; from: Vec2 })[] {
  const { board } = ctx;
  const conns = cableConnectors(board).map((c) => board.footprints.find((f) => f.ref === c.ref)!).filter(Boolean);
  if (!conns.length) return [];
  const connNet = new Map<number, { fp: Footprint; pad: Pad }>();
  for (const fp of conns) for (const pi of fp.pads) {
    const p = board.pads[pi]!;
    if (p.net > 0 && !isGround(board, p.net) && !connNet.has(p.net)) connNet.set(p.net, { fp, pad: p });
  }
  // the regulator loops, grouped by their input net
  const groups = new Map<number, { src: Source & { type: 'loop' }; pad: Pad }[]>();
  for (const s of sources) {
    if (!s.enabled || s.type !== 'loop' || !s.node) continue;
    const pads = s.pads.map((name) => board.pads[findPad(board, name)]).filter((p): p is Pad => !!p);
    const node = board.nets.indexOf(s.node.net);
    const vin = pads.find((p) => p.net > 0 && p.net !== node && !isGround(board, p.net));
    if (!vin) continue;
    const list = groups.get(vin.net) ?? [];
    // the regulator's own pin on that net (not the capacitor's) is where the current is drawn
    const pin = pads.find((p) => p.net === vin.net && !/^C\d/i.test(p.ref)) ?? vin;
    list.push({ src: s, pad: pin });
    groups.set(vin.net, list);
  }
  const out: (SupplyNoise & { at: Vec2; from: Vec2 })[] = [];
  // series parts by net
  const edgesByNet = new Map<number, { fp: Footprint; edge: Edge | 'unknown'; other: number }[]>();
  for (const fp of board.footprints) {
    const pads = twoPin(board, fp);
    if (!pads || pads[0].net <= 0 || pads[1].net <= 0 || pads[0].net === pads[1].net) continue;
    if (isGround(board, pads[0].net) || isGround(board, pads[1].net)) continue;
    const e = seriesEdge(fp);
    if (!e) continue;
    for (const [a, b] of [[pads[0], pads[1]], [pads[1], pads[0]]] as const) {
      const list = edgesByNet.get(a.net) ?? [];
      list.push({ fp, edge: e, other: b.net });
      edgesByNet.set(a.net, list);
    }
  }
  for (const [vin, regs] of groups) {
    // shortest path through series parts from the input net to a net on a cable connector
    const prev = new Map<number, { net: number; fp: Footprint; edge: Edge | 'unknown' } | null>([[vin, null]]);
    const queue = [vin];
    let hit: number | null = connNet.has(vin) ? vin : null;
    while (queue.length && hit === null) {
      const n = queue.shift()!;
      for (const e of edgesByNet.get(n) ?? []) {
        if (prev.has(e.other)) continue;
        prev.set(e.other, { net: n, fp: e.fp, edge: e.edge });
        if (connNet.has(e.other)) {
          hit = e.other;
          break;
        }
        queue.push(e.other);
      }
    }
    if (hit === null) continue;
    const nets: number[] = [];
    const edges: (Edge | 'unknown')[] = [];
    const parts: string[] = [];
    for (let n: number | undefined = hit; n !== undefined; ) {
      nets.unshift(n);
      const p = prev.get(n);
      if (!p) break;
      edges.unshift(p.edge);
      parts.unshift(p.fp.ref);
      n = p.net;
    }
    // a filter whose value cannot be read: no estimate (it may well be enough)
    if (edges.some((e) => e === 'unknown')) continue;
    const es = edges as Edge[];
    const from = regs[0]!.pad.at;
    const capsByNet = nets.map((n, i) =>
      capsOn(board, n).map((c) => {
        const mm = i === 0 ? dist(c.pad.at, from) : 0;
        return { ...c, esl: c.esl + TRACK_H_PER_MM * mm, esr: c.esr + TRACK_R_PER_MM * mm };
      }),
    );
    const cin = capsByNet[0]!.reduce((s, c) => s + c.c, 0);
    // level at one LISN per frequency, all regulators of this input together (power sum)
    const power = new Map<number, number>();
    const amps = new Map<number, number>();
    for (const { src } of regs) {
      for (const l of trapezoidLines(src.waveform, F_HI)) {
        if (l.f < F_LO) continue;
        const w = 2 * Math.PI * l.f;
        const zc = (cs: Cap[]): C | null => cs.reduce<C | null>((z, c) => par(z, [c.esr, w * c.esl - 1 / (w * c.c)]), null);
        // load seen from each node towards the cable, from the connector backwards
        let zLoad: C = par(zc(capsByNet[nets.length - 1]!), [2 * LISN, 0])!;
        const loads: C[] = [zLoad];
        for (let i = nets.length - 2; i >= 0; i--) {
          const e = es[i]!;
          zLoad = par(zc(capsByNet[i]!), add([e.r, w * e.l], zLoad))!;
          loads.unshift(zLoad);
        }
        // voltage at the regulator input, then down the ladder to the connector
        let v: C = mul([lineAmp(l), 0], loads[0]!);
        for (let i = 0; i < nets.length - 1; i++) {
          const e = es[i]!;
          const next = loads[i + 1]!;
          v = mul(div(v, add([e.r, w * e.l], next)), next);
        }
        const iCable = abs(v) / (2 * LISN);
        power.set(l.f, (power.get(l.f) ?? 0) + (iCable * LISN) ** 2);
        amps.set(l.f, Math.hypot(amps.get(l.f) ?? 0, iCable));
      }
    }
    let worst: SupplyNoise['worst'] | null = null;
    for (const [f, p] of power) {
      const lim = conductedAvLimit(f);
      if (lim === null || !(p > 0)) continue;
      const db = 10 * Math.log10(p) + 120;
      if (!worst || db - lim > worst.db - worst.limit) worst = { f, db, limit: lim, amps: amps.get(f) ?? 0 };
    }
    if (!worst) continue;
    const c = connNet.get(hit)!;
    out.push({
      connector: c.fp.ref,
      nets: nets.map((n) => board.nets[n] ?? ''),
      path: parts,
      filters: es.filter((e) => e.kind === 'filter').map((e) => e.ref),
      cin,
      cinParts: capsByNet[0]!.map((x) => x.ref),
      regulators: [...new Set(regs.map((r) => board.pads[findPad(board, r.src.pads.find((p) => !/^C\d/i.test(p)) ?? r.src.pads[0]!)]?.ref ?? r.src.name))],
      worst,
      at: c.pad.at,
      from,
    });
  }
  return out;
}

/** Findings: reported when the estimate lies above the yardstick. */
export function supplyNoiseFindings(ctx: PhysicsContext, sources: Source[]): Diagnostic[] {
  return supplyNoise(ctx, sources)
    .filter((s) => s.worst.db > s.worst.limit)
    .map((s) => ({
      kind: 'supply-noise' as const,
      sourceId: '',
      at: s.at,
      layer: '',
      plane: '',
      planeNet: '',
      value: s.worst.db - s.worst.limit,
      parts: [s.connector, ...s.regulators, ...s.path],
      nets: s.nets,
      dims: [{ a: s.from, b: s.at, text: `${Math.round(dist(s.from, s.at))} mm` }],
      supply: s,
    }));
}
