/**
 * Reference planes: detection and coverage rasters (docs/stufe-1/PHYSIK.md §8.1).
 *
 * A copper layer is a plane for net N when N's filled zones cover more than half of the
 * board area on that layer. Each plane is rasterised (scanline, cell 0.1–0.25 mm) so that
 * "is there copper under this point?" is an O(1) lookup.
 */
import { signedArea } from './geometry';
import type { BoardModel, Vec2 } from './types';

export interface CoverageRaster {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  data: Uint8Array;
}

export interface PlaneLayer {
  layer: number;
  net: number;
  /** World height of the plane (mm). */
  y: number;
  /** Covered fraction of the board area. */
  coverage: number;
  raster: CoverageRaster;
  /** True when set by the user rather than detected. */
  override: boolean;
}

/** Overrides by layer name: a net name forces a plane, null removes one. */
export type PlaneOverrides = Record<string, string | null>;

export function boardArea(board: BoardModel): number {
  const [outer, ...holes] = board.outline;
  if (!outer) return 0;
  return Math.abs(signedArea(outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
}

export function detectPlanes(board: BoardModel, overrides: PlaneOverrides = {}, threshold = 0.5): PlaneLayer[] {
  const area = boardArea(board) || 1;
  const planes: PlaneLayer[] = [];
  for (const layer of board.layers) {
    const byNet = new Map<number, number>();
    for (const z of board.zones) if (z.layer === layer.index && z.net > 0) byNet.set(z.net, (byNet.get(z.net) ?? 0) + z.area);

    let net = -1;
    let override = false;
    if (layer.name in overrides) {
      const name = overrides[layer.name];
      if (name === null || name === undefined) continue;
      net = board.nets.indexOf(name);
      override = true;
      if (net < 0) continue;
    } else {
      let best = 0;
      for (const [n, a] of byNet) {
        if (a > best) {
          best = a;
          net = n;
        }
      }
      if (net < 0 || best / area < threshold) continue;
    }
    const polys = board.zones.filter((z) => z.layer === layer.index && z.net === net).flatMap((z) => z.polygons);
    planes.push({
      layer: layer.index,
      net,
      y: layer.y,
      coverage: (byNet.get(net) ?? 0) / area,
      raster: rasterize(polys, board.bbox, area),
      override,
    });
  }
  return planes;
}

/** Scanline fill of keyholed rings (each ring even-odd on its own, then OR-ed). */
export function rasterize(rings: Vec2[][], bbox: { x0: number; y0: number; x1: number; y1: number }, area: number): CoverageRaster {
  const cell = Math.min(0.25, Math.max(0.1, Math.sqrt(Math.max(area, 1) / 2e6)));
  const x0 = bbox.x0 - cell;
  const y0 = bbox.y0 - cell;
  const nx = Math.ceil((bbox.x1 - bbox.x0) / cell) + 2;
  const ny = Math.ceil((bbox.y1 - bbox.y0) / cell) + 2;
  const data = new Uint8Array(nx * ny);
  const xs: number[] = [];
  for (const ring of rings) {
    let ry0 = Infinity;
    let ry1 = -Infinity;
    for (const p of ring) {
      if (p.y < ry0) ry0 = p.y;
      if (p.y > ry1) ry1 = p.y;
    }
    const j0 = Math.max(0, Math.floor((ry0 - y0) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((ry1 - y0) / cell));
    for (let j = j0; j <= j1; j++) {
      const yc = y0 + (j + 0.5) * cell;
      xs.length = 0;
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const a = ring[i]!;
        const b = ring[k]!;
        if (a.y > yc !== b.y > yc) xs.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m]! - x0) / cell - 0.5));
        const i1 = Math.min(nx - 1, Math.floor((xs[m + 1]! - x0) / cell - 0.5));
        const row = j * nx;
        for (let i = i0; i <= i1; i++) data[row + i] = 1;
      }
    }
  }
  return { x0, y0, cell, nx, ny, data };
}

export function covered(r: CoverageRaster, x: number, y: number): boolean {
  const i = Math.floor((x - r.x0) / r.cell);
  const j = Math.floor((y - r.y0) / r.cell);
  if (i < 0 || j < 0 || i >= r.nx || j >= r.ny) return false;
  return r.data[j * r.nx + i] === 1;
}

/**
 * Copper at or around a point (ring of radius r). Vias sit in anti-pad holes of the planes
 * they pass, but the plane is right there for their return current.
 */
export function coveredNear(rs: CoverageRaster, x: number, y: number, r = 0.8): boolean {
  if (covered(rs, x, y)) return true;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (covered(rs, x + r * Math.cos(a), y + r * Math.sin(a))) return true;
  }
  return false;
}
