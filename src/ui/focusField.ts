/**
 * Field map for the problem view: where exactly one finding adds field. The source's magnetic
 * near field is computed on a grid over the region at a fixed height above the board, once as
 * it is and once with the finding fixed (the detour replaced by the ideal return, or the
 * planes solid for gaps without a way around). The difference in dB is what this problem adds,
 * spot by spot. Without a fix to compare with, the map shows the source's own field.
 */
import { app } from '../state/app.svelte';
import { selectionFromView } from '../state/engine.svelte';
import { covered, type PlaneLayer } from '../model/planes';
import type { BBox2 } from '../model/types';
import type { WorldFrame } from '../model/world';
import { packWithImages } from '../physics/images';
import { fieldAt, slotMaskTable } from '../physics/biotsavart';
import { selectionWeight } from '../compute/composer';
import { withFixed, type Detour } from '../physics/returnPaths';
import { solidPlanes } from '../physics/attribution';
import type { CurrentElement } from '../physics/currents';

export interface FieldMap {
  /** 'added': dB this finding adds; 'source': the source's field, dB below its maximum. */
  mode: 'added' | 'source';
  region: BBox2;
  nx: number;
  ny: number;
  /** Row-major values (dB; NaN = nothing). */
  values: Float32Array;
  /** Strongest value and where (board mm). */
  max: { value: number; x: number; y: number };
  /** Height above the top copper, mm. */
  height: number;
  /** Field at the strongest spot as it is, dBµA/m (selected frequencies). */
  peakDb: number;
}

function grid(elements: CurrentElement[], planes: PlaneLayer[], frame: WorldFrame, region: BBox2, nx: number, ny: number, y: number): Float64Array {
  const pack = packWithImages(elements, planes, frame);
  const masks = slotMaskTable(pack.planeY.length);
  const sorted = [...planes].sort((p, q) => q.y - p.y);
  const out = new Float64Array(nx * ny);
  const h = new Float64Array(3);
  const dx = (region.x1 - region.x0) / (nx - 1);
  const dy = (region.y1 - region.y0) / (ny - 1);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const bx = region.x0 + i * dx;
      const by = region.y0 + j * dy;
      let bits = 0;
      sorted.forEach((p, k) => {
        if (covered(p.raster, bx, by)) bits |= 1 << k;
      });
      fieldAt(pack, masks, bx - frame.ox, y, by - frame.oy, bits, h);
      out[i + nx * j] = h[0]! * h[0]! + h[1]! * h[1]! + h[2]! * h[2]!;
    }
  return out;
}

export function computeFieldMap(sourceId: string, detour: Detour | null, solidCompare: boolean, region: BBox2, frame: WorldFrame, height = 2): FieldMap | null {
  const board = app.board;
  const model = app.models[sourceId];
  if (!board || !model) return null;
  const size = Math.max(region.x1 - region.x0, region.y1 - region.y0);
  const step = Math.max(0.4, size / 90);
  const nx = Math.max(2, Math.round((region.x1 - region.x0) / step) + 1);
  const ny = Math.max(2, Math.round((region.y1 - region.y0) / step) + 1);
  const top = board.layers[0]!;
  const y = top.y + top.thickness / 2 + height;
  const w = selectionWeight(model.lines, selectionFromView());
  const now = grid(model.elements, app.planes, frame, region, nx, ny, y);
  let fixed: Float64Array | null = null;
  if (detour?.fix) fixed = grid(withFixed(model.elements, detour), app.planes, frame, region, nx, ny, y);
  else if (solidCompare) fixed = grid(model.elements, solidPlanes(app.planes), frame, region, nx, ny, y);

  const values = new Float32Array(nx * ny).fill(NaN);
  let best = { value: -Infinity, x: 0, y: 0 };
  let peak = 0;
  for (let k = 0; k < now.length; k++) peak = Math.max(peak, now[k]!);
  for (let k = 0; k < now.length; k++) {
    let v: number;
    if (fixed) v = fixed[k]! > 0 && now[k]! > 0 ? 10 * Math.log10(now[k]! / fixed[k]!) : NaN;
    else v = now[k]! > 0 && peak > 0 ? 10 * Math.log10(now[k]! / peak) : NaN;
    values[k] = v;
    if (Number.isFinite(v) && v > best.value) best = { value: v, x: region.x0 + (k % nx) * ((region.x1 - region.x0) / (nx - 1)), y: region.y0 + Math.floor(k / nx) * ((region.y1 - region.y0) / (ny - 1)) };
  }
  const peakDb = w * peak > 0 ? 10 * Math.log10(w * peak) + 120 : -200;
  return { mode: fixed ? 'added' : 'source', region, nx, ny, values, max: best, height, peakDb };
}
