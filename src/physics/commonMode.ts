/**
 * Common mode with cables, after the Clemson EMC expert system (current-driven common-mode
 * radiation; Hockanson, Drewniak, Hubing et al., IEEE TEMC 38(4) 1996 and 39(4) 1997):
 *
 * The return current of a line over a plane also sets up a magnetic flux that wraps the plane.
 * Between the two halves of the plane on either side of the line that is a voltage
 *
 *     V = ω · L_p · I,   L_p = (4/π²) · µ0 · l · h / (d1 + d2)
 *
 * (l: distance between the line's end points, h: height above the plane, d1 + d2: the board's
 * width across the line at its midpoint; grid point voltage algorithm). Cables attached on the
 * two sides are then driven against each other like a dipole. Worst case, a resonant cable pair
 * (radiation resistance about 100 Ω) in a semi-anechoic room at 3 m:
 *
 *     E ≈ 2 · √(30 / 100) · V / 3 m = 0.365 · V            (cable to cable)
 *
 * With cables on one side only, the cable is driven against the board itself, limited by the
 * board's own capacitance C_B:  E ≈ 0.365 · V · 100 / √(100² + (1 / (ω·C_B))²).
 *
 * This is an upper estimate (resonance assumed at every frequency, isotropic radiator); the
 * source documents say so themselves. Holes in the plane, differential pairs and the phase
 * between sources are not considered. It explains why a correctly routed clock can still fail
 * once cables are attached, which the differential-mode loop model cannot show.
 */
import type { PlaneLayer } from '../model/planes';
import type { BoardModel, Vec2 } from '../model/types';
import { toBoard, type WorldFrame } from '../model/world';
import type { SourceModel } from './currents';
import { limitAt, type LimitSegment } from './farfield';
import type { Source } from './sources';
import { MU0 } from './units';

const EPS0 = 8.854e-12;
/** Radiation resistance of a resonant cable antenna (Clemson: about a resonant dipole), Ω. */
export const R_RAD = 100;
/** Measurement distance of the estimate, m (with ground reflection, factor 2). */
const R_MEAS = 3;

export interface CableConnector {
  ref: string;
  at: Vec2;
}

/**
 * Footprints where a cable can be attached: connector libraries, or references like J1, CN2,
 * USB1, X3 (test points and mounting holes are not cables).
 */
export function cableConnectors(board: BoardModel): CableConnector[] {
  return board.footprints
    .filter((f) => {
      const lib = f.lib.toLowerCase();
      if (/testpoint|mountinghole|fiducial/.test(lib)) return false;
      return /(^|:)connector/.test(lib) || /^(J|CN|CON|USB|X|P)\d/i.test(f.ref);
    })
    .map((f) => ({ ref: f.ref, at: f.at }));
}

export type CmMechanism = 'cable-cable' | 'cable-board' | 'assumed-cable';

export interface CmEstimate {
  sourceId: string;
  mechanism: CmMechanism;
  /** Connectors on the driver side and on the far side of the line's midpoint. */
  sideA: string[];
  sideB: string[];
  /** Plane inductance (H), end-to-end length (mm), height (mm), width across (mm). */
  lp: number;
  length: number;
  height: number;
  width: number;
  /** Midpoint of the line, board mm. */
  at: Vec2;
  /** Per spectral line: plane voltage (V) and the estimated field at 3 m (dBµV/m). */
  lines: { f: number; v: number; db: number }[];
  /** Strongest line against the limit (null: no line in the limit range). */
  worst: { f: number; db: number; margin: number } | null;
}

/** Board capacitance as a free-standing plate: a disc of the same area, C = 8·ε0·a. */
export function boardCapacitance(board: BoardModel): number {
  const b = board.bbox;
  const area = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)) * 1e-6;
  return 8 * EPS0 * Math.sqrt(area / Math.PI);
}

/** Distance from p along direction d (unit) to the board outline, mm (Infinity: none). */
function rayToOutline(board: BoardModel, p: Vec2, d: Vec2): number {
  const ring = board.outline[0];
  if (!ring) return Infinity;
  let best = Infinity;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const a = ring[k]!;
    const b = ring[i]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
    if (t > 1e-9 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/**
 * The estimate for one source, or null when it does not apply (no plane under the line,
 * differential pairs, loops, inductors, a line too short to matter).
 */
export function commonModeEstimate(
  board: BoardModel,
  planes: PlaneLayer[],
  frame: WorldFrame,
  src: Source,
  model: SourceModel,
  limits: LimitSegment[],
  refPlaneOf: (layer: number) => PlaneLayer | undefined,
): CmEstimate | null {
  if (src.type !== 'signal' || planes.length === 0) return null;
  // the forward current: horizontal pieces of the line itself (no return or plane parts)
  const parts = model.elements.filter((e) => !e.vertical && e.layer >= 0 && e.tag !== 'return' && !e.noImage);
  if (parts.length === 0) return null;
  const pts: Vec2[] = parts.flatMap((e) => [toBoard(frame, e.a[0], e.a[2]), toBoard(frame, e.b[0], e.b[2])]);
  // end points: the two points farthest apart (driver and farthest load)
  let P = pts[0]!;
  let Q = pts[0]!;
  let far = 0;
  for (const a of pts)
    for (const b of pts) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > far) {
        far = d;
        P = a;
        Q = b;
      }
    }
  if (far < 10) return null; // Clemson: lines under 1 cm are left out
  // height above the plane and mean current, weighted by length
  let hSum = 0;
  let wSum = 0;
  let lenSum = 0;
  for (const e of parts) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]);
    const ref = refPlaneOf(e.layer);
    if (!ref) continue;
    hSum += Math.abs(board.layers[e.layer]!.y - ref.y) * len;
    wSum += Math.abs(e.w) * len;
    lenSum += len;
  }
  if (lenSum <= 0) return null;
  const h = hSum / lenSum;
  const wMean = wSum / lenSum;
  const M = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
  const u = { x: (Q.x - P.x) / far, y: (Q.y - P.y) / far };
  const n = { x: -u.y, y: u.x };
  const d1 = rayToOutline(board, M, n);
  const d2 = rayToOutline(board, M, { x: -n.x, y: -n.y });
  const width = Number.isFinite(d1 + d2) ? d1 + d2 : Math.max(board.bbox.x1 - board.bbox.x0, board.bbox.y1 - board.bbox.y0);
  const lp = ((4 / (Math.PI * Math.PI)) * MU0 * (far * 1e-3) * (h * 1e-3)) / (width * 1e-3);

  // which side of the line's midpoint each cable connector is on
  const conns = cableConnectors(board);
  const sideA = conns.filter((c) => (c.at.x - M.x) * u.x + (c.at.y - M.y) * u.y < 0).map((c) => c.ref);
  const sideB = conns.filter((c) => (c.at.x - M.x) * u.x + (c.at.y - M.y) * u.y >= 0).map((c) => c.ref);
  const mechanism: CmMechanism = sideA.length && sideB.length ? 'cable-cable' : conns.length ? 'cable-board' : 'assumed-cable';
  const cB = boardCapacitance(board);
  const k = 2 * Math.sqrt(30 / R_RAD) / R_MEAS; // 0.365 per volt at 3 m

  const lines = model.lines.map((l) => {
    const w = 2 * Math.PI * l.f;
    const v = w * lp * l.amp * wMean;
    const e = mechanism === 'cable-cable' ? k * v : (k * v * R_RAD) / Math.hypot(R_RAD, 1 / (w * cB));
    return { f: l.f, v, db: e > 0 ? 20 * Math.log10(e) + 120 : -200 };
  });
  let worst: CmEstimate['worst'] = null;
  for (const l of lines) {
    const lim = limitAt(limits, l.f);
    if (lim !== null && (!worst || l.db - lim > worst.margin)) worst = { f: l.f, db: l.db, margin: l.db - lim };
  }
  return { sourceId: src.id, mechanism, sideA, sideB, lp, length: far, height: h, width, at: M, lines, worst };
}
