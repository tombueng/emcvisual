/** The 3D sampling grid around the board and the per-column plane coverage bits. */
import { covered, type PlaneLayer } from '../model/planes';
import type { BoardModel } from '../model/types';
import { toBoard, type WorldFrame } from '../model/world';

export type Quality = 'preview' | 'normal' | 'fine';

export const QUALITY_SPACING: Record<Quality, number> = { preview: 2, normal: 1, fine: 0.5 };

export interface Grid {
  /** World position of sample (0,0,0), mm. */
  x0: number;
  y0: number;
  z0: number;
  dx: number;
  dy: number;
  dz: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface GridOptions {
  quality: Quality;
  /** Space around the board outline, mm. */
  margin: number;
  /** Height above F.Cu, mm. */
  above: number;
  /** Depth below the bottom copper, mm. */
  below: number;
  /** Upper bound for the number of samples. */
  maxPoints: number;
}

export const DEFAULT_GRID: GridOptions = { quality: 'normal', margin: 6, above: 12, below: 6, maxPoints: 1_500_000 };

export function makeGrid(board: BoardModel, frame: WorldFrame, opts: Partial<GridOptions> = {}): Grid {
  const o = { ...DEFAULT_GRID, ...opts };
  const bottom = board.layers[board.layers.length - 1]?.y ?? -1.6;
  const xs = [board.bbox.x0 - frame.ox - o.margin, board.bbox.x1 - frame.ox + o.margin];
  const zs = [board.bbox.y0 - frame.oy - o.margin, board.bbox.y1 - frame.oy + o.margin];
  const ys = [bottom - o.below, o.above];
  let d = QUALITY_SPACING[o.quality];
  const count = (s: number) =>
    (Math.round((xs[1]! - xs[0]!) / s) + 1) * (Math.round((ys[1]! - ys[0]!) / s) + 1) * (Math.round((zs[1]! - zs[0]!) / s) + 1);
  while (count(d) > o.maxPoints) d *= 1.15;
  const n = (a: number[]) => Math.round((a[1]! - a[0]!) / d) + 1;
  const nx = n(xs);
  const ny = n(ys);
  const nz = n(zs);
  return {
    x0: xs[0]!,
    y0: ys[0]!,
    z0: zs[0]!,
    dx: (xs[1]! - xs[0]!) / (nx - 1),
    dy: (ys[1]! - ys[0]!) / (ny - 1),
    dz: (zs[1]! - zs[0]!) / (nz - 1),
    nx,
    ny,
    nz,
  };
}

/** Bit i set when plane i (sorted top to bottom) has copper in column (ix, iz). */
export function coverColumns(grid: Grid, planes: PlaneLayer[], frame: WorldFrame): Uint32Array {
  const sorted = [...planes].sort((p, q) => q.y - p.y);
  const out = new Uint32Array(grid.nx * grid.nz);
  for (let iz = 0; iz < grid.nz; iz++) {
    for (let ix = 0; ix < grid.nx; ix++) {
      const b = toBoard(frame, grid.x0 + ix * grid.dx, grid.z0 + iz * grid.dz);
      let bits = 0;
      sorted.forEach((p, i) => {
        if (covered(p.raster, b.x, b.y)) bits |= 1 << i;
      });
      out[ix + grid.nx * iz] = bits >>> 0;
    }
  }
  return out;
}

export const gridPoints = (g: Grid) => g.nx * g.ny * g.nz;
