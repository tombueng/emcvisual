/**
 * Stage 2b: quasi-static charges for the electric field (docs/future/STAGE-2-PLANE-CURRENTS.md).
 *
 * A source at 1 V carries charge on its copper: tracks as line charges q = C'·L, pads as
 * point charges q = ε0·εr·A/h over their reference plane. Mirror charges with opposite sign
 * in the reference planes are added when packing (images.packCharges). The field pattern per
 * volt is frequency independent like the H pattern; the voltage spectrum scales it.
 */
import type { BoardModel } from '../model/types';
import { toWorld, type Vec3 } from '../model/world';
import { lineParams, type PhysicsContext } from './currents';
import { referencePlane } from './diagnostics';
import type { Source } from './sources';

export const EPS0 = 8.8541878128e-12;

export interface ChargeElement {
  a: Vec3;
  /** Equal to a for a point charge. */
  b: Vec3;
  /** Total charge per volt of the source, C/V. */
  q: number;
  /** Core radius, mm. */
  r: number;
  layer: number;
}

/** Charges of the nets of a source; net weights: +1 (or -(1-ε) for the N side of a pair). */
export function buildCharges(ctx: PhysicsContext, src: Source): ChargeElement[] {
  const { board } = ctx;
  const nets: { name: string; v: number }[] =
    src.type === 'signal'
      ? src.nets.map((n) => ({ name: n, v: 1 }))
      : src.type === 'diffpair'
        ? [
            { name: src.netP, v: 1 },
            { name: src.netN, v: -(1 - src.imbalance) },
          ]
        : src.type === 'loop' && src.node?.net
          ? [{ name: src.node.net, v: 1 }]
          : [];
  const out: ChargeElement[] = [];
  for (const { name, v } of nets) {
    const net = board.nets.indexOf(name);
    if (net <= 0) continue;
    for (const t of board.tracks) {
      if (t.net !== net) continue;
      const len = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
      if (len < 1e-6) continue;
      const c = lineParams(ctx, t.layer, t.width).cPerM * (len / 1000);
      const y = board.layers[t.layer]!.y;
      out.push({ a: toWorld(ctx.frame, t.a, y), b: toWorld(ctx.frame, t.b, y), q: c * v, r: Math.max(t.width / 2, 0.05), layer: t.layer });
    }
    for (const p of board.pads) {
      if (p.net !== net) continue;
      // outer copper only: inner pad rings of through-hole parts are small
      for (const l of p.layers) {
        if (l !== 0 && l !== board.layers.length - 1) continue;
        const ref = referencePlane(board, ctx.planes, l);
        const h = ref ? Math.max(0.05, Math.abs(ref.y - board.layers[l]!.y)) : 1.0;
        const er = 4.4;
        const area = (p.shape === 'circle' ? (Math.PI / 4) * p.size.x * p.size.x : p.size.x * p.size.y) * 1e-6;
        const c = (EPS0 * er * area) / (h / 1000);
        const w = toWorld(ctx.frame, p.at, board.layers[l]!.y);
        out.push({ a: w, b: w, q: c * v, r: Math.max(Math.min(p.size.x, p.size.y) / 2, 0.1), layer: l });
      }
    }
    // zones of the node (switching nodes are often pours)
    for (const z of board.zones) {
      if (z.net !== net || z.area <= 0) continue;
      const ref = referencePlane(board, ctx.planes, z.layer);
      const h = ref ? Math.max(0.05, Math.abs(ref.y - board.layers[z.layer]!.y)) : 1.0;
      // spread the zone charge over a few points of its outline centroid grid
      const pts = samplePolygon(z.polygons, 1.0);
      if (pts.length === 0) continue;
      const qTot = (EPS0 * 4.4 * z.area * 1e-6) / (h / 1000);
      for (const p of pts) {
        const w = toWorld(ctx.frame, p, board.layers[z.layer]!.y);
        out.push({ a: w, b: w, q: (qTot / pts.length) * v, r: 0.5, layer: z.layer });
      }
    }
  }
  return out;
}

/** Grid points (step mm) inside the rings, even-odd. */
function samplePolygon(rings: { x: number; y: number }[][], step: number): { x: number; y: number }[] {
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
  const out: { x: number; y: number }[] = [];
  if (!Number.isFinite(x0)) return out;
  const s = Math.max(step, Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)); // at most ~400 points
  for (let y = y0 + s / 2; y < y1; y += s)
    for (let x = x0 + s / 2; x < x1; x += s) {
      let inside = false;
      for (const r of rings)
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const a = r[i]!;
          const b = r[j]!;
          if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        }
      if (inside) out.push({ x, y });
    }
  return out;
}

/** Nets that carry charge for a source (to know whether an E pattern exists). */
export function chargeNets(src: Source): string[] {
  if (src.type === 'signal') return src.nets;
  if (src.type === 'diffpair') return [src.netP, src.netN];
  return src.type === 'loop' && src.node?.net ? [src.node.net] : [];
}

