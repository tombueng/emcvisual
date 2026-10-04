/**
 * Scan plan: a regular grid over an area of the board at one or more heights, ordered as a
 * serpentine, with the probe lifted above tall parts (component bodies plus a clearance and
 * the probe radius) so it never runs into a connector.
 */
import type { BoardModel } from '../model/types';
import { rotateKicad } from '../model/geometry';

export interface PlanInput {
  /** Area in board coordinates, mm. */
  area: { x0: number; y0: number; x1: number; y1: number };
  step: number;
  /** Requested probe heights above the top surface, mm. */
  heights: number[];
  /** Gap kept above part bodies, mm. */
  clearance: number;
  /** Probe radius, mm (the probe must clear parts within this distance). */
  probeRadius: number;
}

export interface PlanPoint {
  bx: number;
  by: number;
  /** Height above the top surface at which this point is measured (≥ requested). */
  height: number;
  /** Index of the requested height (layer of the scan). */
  layer: number;
  ix: number;
  iy: number;
}

export interface Plan {
  points: PlanPoint[];
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  step: number;
  heights: number[];
}

/** Height of the tallest top-side body within r of a point (0 when none). */
export function partHeightAt(board: BoardModel, x: number, y: number, r: number): number {
  let h = 0;
  for (const f of board.footprints) {
    if (f.side !== 'top' || f.height <= 0) continue;
    const local = rotateKicad({ x: x - f.body.center.x, y: y - f.body.center.y }, -f.body.angle);
    if (Math.abs(local.x) <= f.body.size.x / 2 + r && Math.abs(local.y) <= f.body.size.y / 2 + r) h = Math.max(h, f.height);
  }
  return h;
}

export function makePlan(board: BoardModel, p: PlanInput): Plan {
  const nx = Math.max(1, Math.floor((p.area.x1 - p.area.x0) / p.step) + 1);
  const ny = Math.max(1, Math.floor((p.area.y1 - p.area.y0) / p.step) + 1);
  const points: PlanPoint[] = [];
  p.heights.forEach((hReq, layer) => {
    for (let iy = 0; iy < ny; iy++) {
      const row: PlanPoint[] = [];
      for (let ix = 0; ix < nx; ix++) {
        const bx = p.area.x0 + ix * p.step;
        const by = p.area.y0 + iy * p.step;
        const parts = partHeightAt(board, bx, by, p.probeRadius);
        row.push({ bx, by, height: Math.max(hReq, parts > 0 ? parts + p.clearance : hReq), layer, ix, iy });
      }
      if (iy % 2 === 1) row.reverse(); // serpentine: shorter travel
      points.push(...row);
    }
  });
  return { points, nx, ny, x0: p.area.x0, y0: p.area.y0, step: p.step, heights: p.heights };
}

/** Rough duration in seconds: travel at feed, settle and sweep time per point. */
export function estimateSeconds(plan: Plan, feedMmPerMin: number, settleMs: number, sweepMs: number): number {
  let d = 0;
  for (let i = 1; i < plan.points.length; i++) {
    const a = plan.points[i - 1]!;
    const b = plan.points[i]!;
    d += Math.hypot(b.bx - a.bx, b.by - a.by) + Math.abs(b.height - a.height);
  }
  return (d / feedMmPerMin) * 60 + plan.points.length * (settleMs + sweepMs) / 1000;
}
