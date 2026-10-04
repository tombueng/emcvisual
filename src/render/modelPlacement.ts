/**
 * Where a footprint's 3D model goes, the way KiCad's 3D viewer places it: footprint position,
 * angle and (for the bottom side) the flip; then the model's own offset (mm), rotation (degrees,
 * applied as −z, −y, −x) and scale; WRL files come in units of 0.1 inch, STEP in mm. KiCad's 3D
 * frame has y up (= −board y) and z out of the board; the app's world has y up and z = board y.
 */
import * as THREE from 'three';
import type { BoardModel, Footprint, FootprintModel } from '../model/types';
import type { WorldFrame } from '../model/world';

/** Model units → mm by file type. */
export function unitScale(path: string): number {
  return /\.wrl$/i.test(path) ? 2.54 : 1;
}

const deg = (v: number) => (v * Math.PI) / 180;

/** Matrix from model coordinates to world coordinates (mm). */
export function modelMatrix(board: BoardModel, frame: WorldFrame, fp: Footprint, m: FootprintModel, unit = unitScale(m.path)): THREE.Matrix4 {
  const top = board.layers[0]!;
  const bottom = board.layers[board.layers.length - 1]!;
  const yTop = top.y + top.thickness / 2;
  const yBottom = board.layers.length > 1 ? bottom.y - bottom.thickness / 2 : yTop - board.thickness;
  const flipped = fp.side === 'bottom';
  // KiCad 3D frame → world: x stays, KiCad z (up) becomes world y, KiCad y (= −board y) becomes −z
  const toWorld = new THREE.Matrix4().set(1, 0, 0, -frame.ox, 0, 0, 1, yTop, 0, -1, 0, -frame.oy, 0, 0, 0, 1);
  const m3 = new THREE.Matrix4()
    .multiply(new THREE.Matrix4().makeTranslation(fp.at.x, -fp.at.y, flipped ? yBottom - yTop : 0))
    .multiply(new THREE.Matrix4().makeRotationZ(deg(fp.angle)));
  if (flipped) m3.multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
  m3.multiply(new THREE.Matrix4().makeTranslation(m.offset[0], m.offset[1], m.offset[2]))
    .multiply(new THREE.Matrix4().makeRotationZ(deg(-m.rotate[2])))
    .multiply(new THREE.Matrix4().makeRotationY(deg(-m.rotate[1])))
    .multiply(new THREE.Matrix4().makeRotationX(deg(-m.rotate[0])))
    .multiply(new THREE.Matrix4().makeScale(m.scale[0] * unit, m.scale[1] * unit, m.scale[2] * unit));
  return toWorld.multiply(m3);
}
