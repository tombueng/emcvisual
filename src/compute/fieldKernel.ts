/**
 * |h|² on a block of the grid for one source (pure; runs in workers and tests).
 * Layout matches a three.js Data3DTexture: index = ix + nx·(iy + ny·iz).
 */
import { fieldAt, slotMaskTable } from '../physics/biotsavart';
import { eFieldAt } from '../physics/efield';
import type { ElementPack } from '../physics/images';
import type { Grid } from './grid';

export type FieldKind = 'H' | 'E';

export function computeBlock(
  pack: ElementPack,
  grid: Grid,
  cover: Uint32Array,
  iz0: number,
  iz1: number,
  onRow?: (doneRows: number) => boolean | void,
  kind: FieldKind = 'H',
): Float32Array {
  const at = kind === 'E' ? eFieldAt : fieldAt;
  const { nx, ny } = grid;
  const out = new Float32Array(nx * ny * (iz1 - iz0));
  const masks = slotMaskTable(pack.planeY.length);
  const h = new Float64Array(3);
  let k = 0;
  for (let iz = iz0; iz < iz1; iz++) {
    const z = grid.z0 + iz * grid.dz;
    for (let iy = 0; iy < ny; iy++) {
      const y = grid.y0 + iy * grid.dy;
      for (let ix = 0; ix < nx; ix++) {
        at(pack, masks, grid.x0 + ix * grid.dx, y, z, cover[ix + nx * iz]!, h);
        out[k++] = h[0]! * h[0]! + h[1]! * h[1]! + h[2]! * h[2]!;
      }
    }
    if (onRow && onRow(iz - iz0 + 1) === false) break;
  }
  return out;
}
