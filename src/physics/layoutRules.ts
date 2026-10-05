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
 *
 * These are geometry rules with thresholds from the literature or rules of thumb; they do not
 * compute a field. Each finding names the parts involved, so the problem view can show them.
 */
import type { PlaneLayer } from '../model/planes';
import type { BoardModel, Footprint, Pad, Vec2 } from '../model/types';
import type { PhysicsContext } from './currents';
import { lineParams } from './currents';
import { cableConnectors, SUPPLY_NET } from './commonMode';
import type { Diagnostic } from './diagnostics';

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

export function layoutRules(ctx: PhysicsContext): Diagnostic[] {
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
  return out;
}
