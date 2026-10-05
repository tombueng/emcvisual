/**
 * Layout rules that need no field source (docs/research/EMV-FEHLERKATALOG.md):
 *
 * - K-18 filter at the connector: a series part (R, L, ferrite) or a shunt capacitor on a cable
 *   line far from the connector protects nothing in between; a filter capacitor with a long way
 *   to ground does little above some ten MHz.
 * - K-20 connector shield: shield or shell pads without a net, or without a short way to the
 *   ground copper, let the cable shield be driven instead of returning its current.
 * - K-24 decoupling: an IC supply pin without a capacitor close by, or one connected over a
 *   long track (mounting inductance), pulls its current spikes over large loops.
 * - K-19 filter bypass: copper of a filter's input and output nets lying on top of each other
 *   (on different layers, no other copper between) is a capacitor across the filter.
 *
 * These are geometry rules with thresholds from the literature or rules of thumb; they do not
 * compute a field. Each finding names the parts involved, so the problem view can show them.
 */
import { rasterize, type CoverageRaster, type PlaneLayer } from '../model/planes';
import type { BoardModel, Footprint, Pad, Vec2 } from '../model/types';
import type { PhysicsContext } from './currents';
import { dielectricBetween, lineParams } from './currents';
import { cableConnectors, SUPPLY_NET } from './commonMode';
import type { Diagnostic } from './diagnostics';
import type { Source } from './sources';

const GROUND = /^(\/)?(gnd|vss|0v|agnd|dgnd|pgnd|gndd|gnda|gndpwr|earth|ground|masse|chassis|shield)([_\-.]?\w*)?$/i;
const SUPPLY = /^(\/)?(\+?\d+(\.\d+)?v\d*|\+?\d+v\d+|v\d+v\d+|vcc\w*|vdd\w*|avdd\w*|dvdd\w*|vio\w*|vbat\w*|vbus\w*|vin\w*|p\d+v\d+|v_?\d+v\d*)$/i;

/** A filter on a cable line farther than this from the connector protects too little, mm. */
export const FILTER_MAX = 10;
/** A filter capacitor's ground pad farther than this from a ground via or pour, mm. */
export const FILTER_GND_MAX = 3;
/** Decoupling capacitor farther than this from the supply pin, mm. */
export const DECOUPLE_MAX = 5;
/** No capacitor at all within this distance: "no local decoupling", mm. */
export const DECOUPLE_NONE = 20;
/** Crystal closer than this to the board edge, mm (guide value: Infineon AP24026, ST AN2867 ask for "away from the edge"). */
export const CRYSTAL_EDGE = 5;
/** Crystal closer than this to a cable connector, mm. */
export const CRYSTAL_CONN = 10;
/** Switch-node copper: larger than this is too much (a compact node is about 40 mm²), mm². */
export const SW_AREA = 100;
/** Compact, but at the edge or a connector: still a finding from this size on, mm². */
export const SW_AREA_COMPACT = 40;
const SW_EDGE = 3;
/** Storage inductor closer than this to the board edge / a cable connector, mm. */
export const INDUCTOR_EDGE = 3;
export const INDUCTOR_CONN = 10;
/** Floating copper or unconnected islands from this size, mm². */
export const FLOAT_AREA = 25;
const SW_CONN = 10;
/**
 * Overlap capacitance across a series filter part from which it is reported, F. A ferrite bead
 * has 0.1–1 pF of its own across it; Hubing reports 50–200 pF on failed boards.
 */
export const BYPASS_MIN_C = 3e-12;
/** Reported when the capacitance takes over below this frequency (the usual limit range ends at 1 GHz), Hz. */
export const BYPASS_MAX_F = 1e9;
/** A ferrite bead without a readable value: the common 600 Ω at 100 MHz. */
const FERRITE_DEFAULT = 600;
/** Package and vias of a decoupling capacitor, nH (Clemson power-bus decoupling: about 1 nH). */
const MOUNT_NH = 1;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const isGround = (board: BoardModel, net: number) => net > 0 && GROUND.test(board.nets[net] ?? '');

function twoPin(board: BoardModel, fp: Footprint): [Pad, Pad] | null {
  if (fp.pads.length !== 2) return null;
  return [board.pads[fp.pads[0]!]!, board.pads[fp.pads[1]!]!];
}

/** Ground connection of a pad: directly in a ground pour on its layer, or the nearest ground via (mm). */
function groundReach(board: BoardModel, planes: PlaneLayer[], pad: Pad): number {
  const layer = pad.layers[0] ?? 0;
  const inPour = board.zones.some((z) => z.layer === layer && z.net === pad.net && z.polygons.some((poly) => inside(poly, pad.at)));
  if (inPour) return 0;
  // a through-hole pad reaches every plane it passes
  if (pad.layers.length > 1 && planes.some((p) => p.net === pad.net)) return 0;
  let best = Infinity;
  for (const v of board.vias) if (v.net === pad.net) best = Math.min(best, dist(v.at, pad.at));
  return best;
}

function inside(poly: Vec2[], p: Vec2): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const base = (kind: Diagnostic['kind'], at: Vec2, value: number, parts: string[], nets: string[], dims: Diagnostic['dims'] = []): Diagnostic => ({
  kind,
  sourceId: '',
  at,
  layer: '',
  plane: '',
  planeNet: '',
  value,
  parts,
  nets,
  dims,
});

/** Sources faster than this rise time count as fast for the connector rule, s. */
const FAST_TR = 5e-9;

export function layoutRules(ctx: PhysicsContext, sources: Source[] = []): Diagnostic[] {
  const { board, planes } = ctx;
  const out: Diagnostic[] = [];
  const fpByRef = new Map(board.footprints.map((f) => [f.ref, f]));
  const conns = cableConnectors(board).map((c) => fpByRef.get(c.ref)!).filter(Boolean);

  // --- K-18: filters on cable lines ---------------------------------------------------------------
  const isSupply = (net: number) => net > 0 && (SUPPLY.test(board.nets[net] ?? '') || SUPPLY_NET.test(board.nets[net] ?? ''));
  /** Series part: R, L or ferrite between two signal nets (a pull-up or pull-down is no filter). */
  const seriesOther = (fp: Footprint, net: number): number => {
    const pads = twoPin(board, fp);
    if (!pads || !/^(R|L|FB)\d/i.test(fp.ref)) return -1;
    const on = pads.find((p) => p.net === net);
    const other = pads.find((p) => p !== on);
    if (!on || !other || other.net <= 0 || isGround(board, other.net) || isSupply(other.net)) return -1;
    return other.net;
  };
  for (const conn of conns) {
    for (const pi of conn.pads) {
      const cp = board.pads[pi]!;
      if (cp.net <= 0 || isGround(board, cp.net) || isSupply(cp.net)) continue;
      // the line and what lies behind one series part (the filtered side of an RC)
      const nets = new Set([cp.net]);
      for (const fp of board.footprints) {
        const o = seriesOther(fp, cp.net);
        if (o > 0) nets.add(o);
      }
      const netName = board.nets[cp.net] ?? '';
      const far: { fp: Footprint; pad: Pad; d: number }[] = [];
      for (const fp of board.footprints) {
        if (fp === conn) continue;
        const pads = twoPin(board, fp);
        if (!pads) continue;
        const on = pads.find((p) => nets.has(p.net));
        if (!on) continue;
        const other = pads.find((p) => p !== on)!;
        // filters: ferrites and inductors in series, capacitors to ground; a lone series resistor
        // (a bus termination) is no EMC filter, it only extends the line to what lies behind it
        const series = seriesOther(fp, on.net) > 0 && /^(L|FB)\d/i.test(fp.ref);
        const shunt = /^C\d/i.test(fp.ref) && isGround(board, other.net);
        if (!series && !shunt) continue;
        const d = dist(cp.at, on.at);
        if (d > FILTER_MAX) far.push({ fp, pad: on, d });
        else if (shunt) {
          const g = groundReach(board, planes, other);
          if (g > FILTER_GND_MAX) out.push(base('filter-ground', other.at, Number.isFinite(g) ? g : 99, [conn.ref, fp.ref], [netName, board.nets[other.net] ?? '']));
        }
      }
      // one finding per connector pin, measured to the nearest filter part
      if (far.length) {
        far.sort((a, b) => a.d - b.d);
        const n = far[0]!;
        out.push(base('filter-far', n.pad.at, n.d, [conn.ref, ...far.map((x) => x.fp.ref)], [netName], [{ a: cp.at, b: n.pad.at, text: `${n.d.toFixed(0)} mm` }]));
      }
    }
  }

  // --- K-20: connector shields ------------------------------------------------------------------
  for (const conn of conns) {
    const shield = conn.pads.map((pi) => board.pads[pi]!).filter((p) => /^(S|SH|SHIELD|MP)\d*$/i.test(p.number));
    if (!shield.length) continue;
    const floating = shield.filter((p) => p.net <= 0);
    if (floating.length) {
      out.push(base('shield-open', floating[0]!.at, floating.length, [conn.ref], []));
      continue;
    }
    // connected: the net must reach ground copper on a short way (not only a thin track)
    const reach = Math.min(...shield.map((p) => groundReach(board, planes, p)));
    const netName = board.nets[shield[0]!.net] ?? '';
    const otherPads = board.pads.filter((p) => p.net === shield[0]!.net && !conn.pads.some((pi) => board.pads[pi] === p));
    if (!isGround(board, shield[0]!.net) && otherPads.length === 0)
      out.push(base('shield-open', shield[0]!.at, shield.length, [conn.ref], [netName]));
    else if (reach > FILTER_GND_MAX) out.push(base('shield-weak', shield[0]!.at, reach, [conn.ref], [netName]));
  }

  // --- K-24: decoupling of IC supply pins ---------------------------------------------------------
  const caps = board.footprints.filter((f) => /^C\d/i.test(f.ref) && f.pads.length === 2);
  for (const ic of board.footprints) {
    if (!/^U\d/i.test(ic.ref) || ic.pads.length < 5) continue;
    let worst: { pad: Pad; d: number; cap?: Footprint; capPad?: Pad; nh?: number } | null = null;
    for (const pi of ic.pads) {
      const p = board.pads[pi]!;
      const name = board.nets[p.net] ?? '';
      if (p.net <= 0 || isGround(board, p.net) || !(SUPPLY.test(name) || p.pinType === 'power_in')) continue;
      let best: { d: number; cap: Footprint; capPad: Pad } | null = null;
      for (const c of caps) {
        const pads = twoPin(board, c)!;
        const on = pads.find((q) => q.net === p.net);
        const other = pads.find((q) => q !== on);
        if (!on || !other || !isGround(board, other.net)) continue;
        const d = dist(p.at, on.at);
        if (!best || d < best.d) best = { d, cap: c, capPad: on };
      }
      const d = best?.d ?? Infinity;
      // mounting inductance: the track between pin and capacitor, plus package and vias
      const layer = p.layers[0] ?? 0;
      const lp = lineParams(ctx, layer, 0.25);
      const nh = Number.isFinite(d) ? lp.lPerM * d * 1e-3 * 1e9 + MOUNT_NH : Infinity;
      if (!worst || d > worst.d) worst = { pad: p, d, cap: best?.cap, capPad: best?.capPad, nh };
    }
    if (!worst) continue;
    const pinName = `${ic.ref}.${worst.pad.number}`;
    const net = board.nets[worst.pad.net] ?? '';
    if (worst.d > DECOUPLE_NONE) out.push({ ...base('decoupling', worst.pad.at, DECOUPLE_NONE, [ic.ref], [net]), decoupling: { pin: pinName, none: true } });
    else if (worst.d > DECOUPLE_MAX)
      out.push({
        ...base('decoupling', worst.pad.at, worst.d, [ic.ref, worst.cap!.ref], [net], [{ a: worst.pad.at, b: worst.capPad!.at, text: `${worst.d.toFixed(0)} mm` }]),
        decoupling: { nh: worst.nh ?? 0, cap: worst.cap!.ref, pin: pinName },
      });
  }
  // --- K-17: crystals and oscillators --------------------------------------------------------------
  const outline = board.outline[0] ?? [];
  const toEdge = (p: Vec2) => {
    let best = Infinity;
    for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) best = Math.min(best, segDist(p, outline[k]!, outline[i]!));
    return best;
  };
  const connPads = conns.flatMap((c) => c.pads.map((pi) => board.pads[pi]!.at));
  for (const fp of board.footprints) {
    if (!(/crystal|oscillator/i.test(fp.lib) || /^(Y|XTAL|OSC)\d/i.test(fp.ref))) continue;
    const pads = fp.pads.map((pi) => board.pads[pi]!);
    const corners = boxCorners(fp.body);
    const dEdge = Math.min(...corners.map(toEdge), ...pads.map((p) => toEdge(p.at)));
    const dConn = connPads.length ? Math.min(...pads.flatMap((p) => connPads.map((c) => dist(p.at, c)))) : Infinity;
    if (dEdge < CRYSTAL_EDGE || dConn < CRYSTAL_CONN)
      out.push({ ...base('crystal-placement', fp.at, Math.min(dEdge, dConn), [fp.ref], []), crystal: { edge: dEdge, connector: dConn } });
    // foreign lines under the package: on its own side, or on layers without a plane in between
    const side = fp.side === 'bottom' ? board.layers.length - 1 : 0;
    const own = new Set(pads.map((p) => p.net));
    const shielded = (l: number) => planes.some((p) => (side === 0 ? p.layer > 0 && p.layer < l : p.layer < side && p.layer > l)) || planes.some((p) => p.layer === l);
    const under = board.tracks.filter(
      (t) => !own.has(t.net) && !isGround(board, t.net) && !shielded(t.layer) && [0.25, 0.5, 0.75].some((k) => inBox(fp.body, { x: t.a.x + (t.b.x - t.a.x) * k, y: t.a.y + (t.b.y - t.a.y) * k })),
    );
    if (under.length) {
      const nets = [...new Set(under.map((t) => board.nets[t.net] ?? ''))];
      out.push(base('crystal-under', fp.at, nets.length, [fp.ref], nets));
    }
  }

  // --- K-31: switch-node copper -----------------------------------------------------------------
  for (const net of switchNets(board)) {
    const name = board.nets[net] ?? '';
    const perLayer = new Map<number, number>();
    const add = (l: number, a: number) => perLayer.set(l, (perLayer.get(l) ?? 0) + a);
    for (const z of board.zones) if (z.net === net) add(z.layer, z.area);
    for (const t of board.tracks) if (t.net === net) add(t.layer, Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) * t.width);
    const pads = board.pads.filter((p) => p.net === net);
    for (const p of pads) add(p.layers[0] ?? 0, p.size.x * p.size.y * (p.shape === 'circle' ? Math.PI / 4 : 1));
    const area = [...perLayer.values()].reduce((a, b) => a + b, 0);
    const layers = [...perLayer.values()].filter((a) => a > 10).length;
    const pts = [...pads.map((p) => p.at), ...board.tracks.filter((t) => t.net === net).flatMap((t) => [t.a, t.b])];
    const dEdge = pts.length ? Math.min(...pts.map(toEdge)) : Infinity;
    const dConn = pts.length && connPads.length ? Math.min(...pts.flatMap((p) => connPads.map((c) => dist(p, c)))) : Infinity;
    const exposed = dEdge < SW_EDGE || dConn < SW_CONN;
    if (area > SW_AREA || layers > 1 || (area > SW_AREA_COMPACT && exposed)) {
      const at = pads[0]?.at ?? pts[0] ?? { x: 0, y: 0 };
      out.push({ ...base('sw-node', at, area, [], [name]), sw: { area, layers, edge: dEdge, connector: dConn } });
    }
  }
  // --- K-22: fast signals on a connector without ground pins beside them ---------------------------
  const fastNets = new Set<number>();
  for (const src of sources) {
    if (!src.enabled || src.waveform.tr > FAST_TR) continue;
    const names = src.type === 'signal' ? src.nets : src.type === 'diffpair' ? [src.netP, src.netN] : [];
    for (const n of names) {
      const i = board.nets.indexOf(n);
      if (i > 0) fastNets.add(i);
    }
  }
  if (fastNets.size)
    for (const fp of conns) {
      const pads = fp.pads.map((pi) => board.pads[pi]!);
      const fastPads = pads.filter((p) => fastNets.has(p.net));
      if (!fastPads.length) continue;
      const isShieldPad = (p: Pad) => /^(S|SH|SHIELD|MP)\d*$/i.test(p.number);
      if (pads.some((p) => isShieldPad(p) && p.net > 0)) continue; // shielded cable: its own return
      const groundPads = pads.filter((p) => isGround(board, p.net) && !isShieldPad(p));
      let pitch = Infinity;
      for (const a of pads) for (const b of pads) if (a !== b) pitch = Math.min(pitch, dist(a.at, b.at));
      const apart = Math.max(...fastPads.map((p) => Math.min(Infinity, ...groundPads.map((g) => dist(g.at, p.at))) / (pitch || 1)));
      const fast = new Set(fastPads.map((p) => p.number)).size;
      const ground = new Set(groundPads.map((p) => p.number)).size;
      if (ground * 2 < fast || apart > 1.5) {
        const nets = [...new Set(fastPads.map((p) => board.nets[p.net] ?? ''))];
        out.push({ ...base('connector-ground', fp.at, Number.isFinite(apart) ? apart : 99, [fp.ref], nets), pins: { connector: fp.ref, ground, fast, apart: Number.isFinite(apart) ? apart : undefined } });
      }
    }

  // --- K-33: storage inductor at the switch node, next to a cable or the edge --------------------
  const sws = new Set(switchNets(board));
  for (const fp of board.footprints) {
    if (!/^L\d/i.test(fp.ref)) continue;
    const pads = twoPin(board, fp);
    if (!pads || !pads.some((p) => sws.has(p.net))) continue;
    const corners = boxCorners(fp.body);
    const dEdge = Math.min(...corners.map(toEdge));
    const dConn = connPads.length ? Math.min(...corners.flatMap((c) => connPads.map((q) => dist(c, q)))) : Infinity;
    if (dEdge < INDUCTOR_EDGE || dConn < INDUCTOR_CONN)
      out.push({ ...base('inductor-placement', fp.at, Math.min(dEdge, dConn), [fp.ref], pads.map((p) => board.nets[p.net] ?? '')), crystal: { edge: dEdge, connector: dConn } });
  }

  // --- K-38: floating copper ------------------------------------------------------------------------
  for (const z of board.zones) {
    if (z.net <= 0) {
      if (z.area > FLOAT_AREA) out.push({ ...base('floating-copper', z.polygons[0]?.[0] ?? { x: 0, y: 0 }, z.area, [], []), copper: { layer: board.layers[z.layer]?.name ?? '', island: false } });
      continue;
    }
    // islands of a net's fill that hold no pad or via of the net
    const anchors = [...board.pads.filter((p) => p.net === z.net && p.layers.includes(z.layer)).map((p) => p.at), ...board.vias.filter((v) => v.net === z.net).map((v) => v.at)];
    for (const poly of z.polygons) {
      const a = Math.abs(polyArea(poly));
      if (a < FLOAT_AREA) continue;
      if (!anchors.some((q) => inside(poly, q)))
        out.push({ ...base('floating-copper', poly[0]!, a, [], [board.nets[z.net] ?? '']), copper: { layer: board.layers[z.layer]?.name ?? '', island: true } });
    }
  }

  // --- K-37: heat sinks ----------------------------------------------------------------------------
  for (const fp of board.footprints) {
    if (!(/heatsink|heat_sink/i.test(fp.lib) || /^HS\d/i.test(fp.ref))) continue;
    const pads = fp.pads.map((pi) => board.pads[pi]!);
    if (pads.length && pads.every((p) => p.net <= 0)) out.push(base('heatsink-floating', fp.at, pads.length, [fp.ref], []));
  }

  // --- K-19: filters bypassed by overlapping input and output copper ----------------------------
  const swSet = new Set(switchNets(board));
  const capToGround = new Set<number>();
  for (const c of caps) {
    const [x, y] = twoPin(board, c)!;
    if (isGround(board, x.net)) capToGround.add(y.net);
    if (isGround(board, y.net)) capToGround.add(x.net);
  }
  for (const fp of board.footprints) {
    const pads = twoPin(board, fp);
    if (!pads) continue;
    const [pa, pb] = pads;
    if (pa.net <= 0 || pb.net <= 0 || pa.net === pb.net || isGround(board, pa.net) || isGround(board, pb.net)) continue;
    if (swSet.has(pa.net) || swSet.has(pb.net)) continue; // storage inductor of a regulator
    const part = filterPart(fp);
    if (!part) continue;
    // an inductor (not a ferrite) counts as a filter only with a capacitor to ground on both
    // sides: the storage inductor of a regulator has none on its switch node
    if (part.henry !== undefined && !(capToGround.has(pa.net) && capToGround.has(pb.net))) continue;
    const ov = overlapCapacitance(ctx, pa.net, pb.net);
    if (!ov || ov.cap < BYPASS_MIN_C) continue;
    const fx = crossover(part, ov.cap);
    if (fx > BYPASS_MAX_F) continue;
    out.push({
      ...base('filter-bypass', ov.at, fx, [fp.ref], [board.nets[pa.net] ?? '', board.nets[pb.net] ?? '']),
      bypass: { cap: ov.cap, area: ov.area, layers: ov.layers, pair: ov.pair, box: ov.box, ohms: part.ohms, henry: part.henry, assumed: part.assumed },
    });
  }

  // --- K-26: ferrite between two grounds ---------------------------------------------------------
  for (const fp of board.footprints) {
    if (!/^(FB|L)\d/i.test(fp.ref)) continue;
    const pads = twoPin(board, fp);
    if (!pads) continue;
    if (pads.every((p) => isGround(board, p.net)) && pads[0].net !== pads[1].net)
      out.push(base('ferrite-ground', fp.at, 0, [fp.ref], pads.map((p) => board.nets[p.net] ?? '')));
  }
  return out;
}

export interface FilterPart {
  /** Ferrite: impedance at 100 MHz, Ω. Inductor: inductance, H. */
  ohms?: number;
  henry?: number;
  /** The value could not be read; a typical one is assumed. */
  assumed: boolean;
}

const SI: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1 };

/**
 * A series filter part from reference, library and value: ferrite beads ("600R@100MHz",
 * "BLM18PG221SN1" = 220 Ω, or FB without a value: 600 Ω assumed) and inductors ("10uH").
 * Parts whose value says nothing are left out unless they are named as ferrites.
 */
export function filterPart(fp: Footprint): FilterPart | null {
  const v = fp.value.replace(',', '.');
  const isFb = /^FB\d/i.test(fp.ref) || /ferrite|bead/i.test(fp.lib) || /ferrite|ferret|bead|^FB|BLM\d|MPZ\d/i.test(v);
  if (!isFb && !/^L\d/i.test(fp.ref)) return null;
  // "600R", "600R@100MHz", "600 Ω": an impedance (not "2R2", which is 2.2 µH on inductors)
  const ohm = /(\d+(?:\.\d+)?)\s*(?:R|Ω|ohms?)(?![a-z0-9])/i.exec(v);
  if (ohm) return { ohms: Number(ohm[1]), assumed: false };
  const murata = /BLM\d{2}[A-Z]{2}(\d)(\d)(\d)/i.exec(v);
  if (murata) return { ohms: Number(murata[1]! + murata[2]!) * 10 ** Number(murata[3]!), assumed: false };
  if (!isFb) {
    // "10uH", "4.7 µH", "10u" and "4u7"
    const h = /(\d+(?:\.\d+)?)\s*([pnuµμm]?)H(?![a-z])/i.exec(v) ?? /^(\d+(?:\.\d+)?)\s*([pnuµμ])$/i.exec(v.trim());
    if (h) return { henry: Number(h[1]) * (SI[h[2]!.toLowerCase()] ?? 1), assumed: false };
    const mid = /^(\d+)([pnuµμ])(\d+)$/i.exec(v.trim());
    if (mid) return { henry: Number(`${mid[1]}.${mid[3]}`) * (SI[mid[2]!.toLowerCase()] ?? 1), assumed: false };
    return null;
  }
  return { ohms: FERRITE_DEFAULT, assumed: true };
}

/**
 * Frequency above which the overlap capacitance C has a lower impedance than the filter part:
 * inductor L: the parallel resonance 1/(2π√(LC)); ferrite with |Z| at 100 MHz: inductive up to
 * there (L = Z/(2π·100 MHz)), resistive above, so 1/(2π·C·Z) when that lies above 100 MHz.
 */
export function crossover(part: FilterPart, cap: number): number {
  const henry = part.henry ?? (part.ohms ?? FERRITE_DEFAULT) / (2 * Math.PI * 1e8);
  const fl = 1 / (2 * Math.PI * Math.sqrt(henry * cap));
  if (part.henry !== undefined || fl <= 1e8) return fl;
  return 1 / (2 * Math.PI * cap * (part.ohms ?? FERRITE_DEFAULT));
}

const EPS0 = 8.854e-12;
/** Raster of the overlap search, mm. */
const OVERLAP_CELL = 0.25;

/** Copper shapes of a net per layer: zone fills, tracks as rectangles, pads as their outline. */
function netCopper(board: BoardModel, net: number): Map<number, Vec2[][]> {
  const m = new Map<number, Vec2[][]>();
  const add = (l: number, ring: Vec2[]) => {
    const list = m.get(l) ?? [];
    list.push(ring);
    m.set(l, list);
  };
  for (const z of board.zones) if (z.net === net) for (const poly of z.polygons) add(z.layer, poly);
  for (const t of board.tracks) {
    if (t.net !== net) continue;
    const dx = t.b.x - t.a.x;
    const dy = t.b.y - t.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const h = t.width / 2;
    const ux = (dx / len) * h;
    const uy = (dy / len) * h;
    add(t.layer, [
      { x: t.a.x - ux - uy, y: t.a.y - uy + ux },
      { x: t.b.x + ux - uy, y: t.b.y + uy + ux },
      { x: t.b.x + ux + uy, y: t.b.y + uy - ux },
      { x: t.a.x - ux + uy, y: t.a.y - uy - ux },
    ]);
  }
  for (const p of board.pads) {
    if (p.net !== net) continue;
    const ring = boxCorners({ center: p.at, size: p.size, angle: p.angle });
    for (const l of p.layers) add(l, ring);
  }
  return m;
}

function ringsBox(rings: Vec2[][]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (const p of r) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x0, y0, x1, y1 };
}

/**
 * Copper of net a on one layer over copper of net b on another, where no other copper lies in
 * between (a plane between them shields), summed into a parallel-plate capacitance ε0·εr·A/h
 * (fringing ignored). Returns the total, the overlap area, the layer pair with the largest share
 * and a point inside it.
 */
export function overlapCapacitance(
  ctx: PhysicsContext,
  a: number,
  b: number,
): { cap: number; area: number; layers: [string, string]; pair: [number, number]; box: { x0: number; y0: number; x1: number; y1: number }; at: Vec2 } | null {
  const { board } = ctx;
  const ca = netCopper(board, a);
  const cb = netCopper(board, b);
  const ba = ringsBox([...ca.values()].flat());
  const bb = ringsBox([...cb.values()].flat());
  const box = { x0: Math.max(ba.x0, bb.x0), y0: Math.max(ba.y0, bb.y0), x1: Math.min(ba.x1, bb.x1), y1: Math.min(ba.y1, bb.y1) };
  if (!(box.x1 > box.x0 && box.y1 > box.y0)) return null;
  // rasterize() picks its cell from the area it is given: this one gives OVERLAP_CELL
  const cellArea = 2e6 * OVERLAP_CELL * OVERLAP_CELL;
  const rast = (rings: Vec2[][]): CoverageRaster => rasterize(rings, box, cellArea);
  const shieldCache = new Map<number, CoverageRaster>();
  const shield = (l: number) => {
    let r = shieldCache.get(l);
    if (!r) shieldCache.set(l, (r = rast(board.zones.filter((z) => z.layer === l && z.net !== a && z.net !== b && z.net > 0).flatMap((z) => z.polygons))));
    return r;
  };
  let cap = 0;
  let area = 0;
  let best: { c: number; i: number; j: number; at: Vec2; box: { x0: number; y0: number; x1: number; y1: number } } | null = null;
  for (const [i, ra] of ca) {
    const gridA = rast(ra);
    for (const [j, rb] of cb) {
      if (i === j) continue;
      const gridB = rast(rb);
      const between: CoverageRaster[] = [];
      for (let k = Math.min(i, j) + 1; k < Math.max(i, j); k++) between.push(shield(k));
      let n = 0;
      let sx = 0;
      let sy = 0;
      let i0 = Infinity;
      let i1 = -1;
      let j0 = Infinity;
      let j1 = -1;
      for (let q = 0; q < gridA.data.length; q++) {
        if (!gridA.data[q] || !gridB.data[q] || between.some((g) => g.data[q])) continue;
        n++;
        const ci = q % gridA.nx;
        const cj = Math.floor(q / gridA.nx);
        sx += ci;
        sy += cj;
        i0 = Math.min(i0, ci);
        i1 = Math.max(i1, ci);
        j0 = Math.min(j0, cj);
        j1 = Math.max(j1, cj);
      }
      if (!n) continue;
      const cell = gridA.cell;
      const A = n * cell * cell;
      const d = dielectricBetween(ctx, i, j);
      const c = (EPS0 * d.er * A * 1e-6) / (d.h * 1e-3);
      cap += c;
      area += A;
      if (!best || c > best.c)
        best = {
          c,
          i,
          j,
          at: { x: gridA.x0 + (sx / n + 0.5) * cell, y: gridA.y0 + (sy / n + 0.5) * cell },
          box: { x0: gridA.x0 + i0 * cell, y0: gridA.y0 + j0 * cell, x1: gridA.x0 + (i1 + 1) * cell, y1: gridA.y0 + (j1 + 1) * cell },
        };
    }
  }
  if (!best) return null;
  return { cap, area, layers: [board.layers[best.i]?.name ?? '', board.layers[best.j]?.name ?? ''], pair: [best.i, best.j], box: best.box, at: best.at };
}

function polyArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j]!.x + p[i]!.x) * (p[j]!.y - p[i]!.y);
  return a / 2;
}

/** Nets of switching nodes: a pin named SW/LX/PH on a regulator, or a net named like one. */
function switchNets(board: BoardModel): number[] {
  const out = new Set<number>();
  for (const p of board.pads) if (p.net > 0 && /^(SW|LX|PH|PHASE)\d*$/i.test(p.pinFunction)) out.add(p.net);
  board.nets.forEach((n, i) => {
    if (i > 0 && /(^|[_/\-])(SW|LX|PHASE)\d*([_\-]|$)/i.test(n)) out.add(i);
  });
  return [...out];
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function boxCorners(b: { center: Vec2; size: Vec2; angle: number }): Vec2[] {
  const c = Math.cos((b.angle * Math.PI) / 180);
  const s = Math.sin((b.angle * Math.PI) / 180);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => {
    const x = (u! * b.size.x) / 2;
    const y = (v! * b.size.y) / 2;
    return { x: b.center.x + x * c - y * s, y: b.center.y + x * s + y * c };
  });
}

function inBox(b: { center: Vec2; size: Vec2; angle: number }, p: Vec2): boolean {
  const c = Math.cos((-b.angle * Math.PI) / 180);
  const s = Math.sin((-b.angle * Math.PI) / 180);
  const dx = p.x - b.center.x;
  const dy = p.y - b.center.y;
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return Math.abs(x) <= b.size.x / 2 && Math.abs(y) <= b.size.y / 2;
}
