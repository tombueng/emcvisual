/**
 * Real component bodies from a GLB that KiCad exports (File → Export → glTF/GLB, or
 * `kicad-cli pcb export glb --no-board-body --subst-models board.kicad_pcb`).
 *
 * KiCad writes one node per footprint, named after its reference, in metres with
 * x = KiCad x, z = KiCad y and y up from the board bottom. That maps onto the world frame
 * with a scale of 1000 and an offset; nodes that are not footprints of the loaded board
 * (board body, copper, silkscreen if exported) are hidden because the app draws those itself.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BoardModel } from '../model/types';
import type { WorldFrame } from '../model/world';

export interface ComponentModels {
  root: THREE.Object3D;
  /** References that got a model. */
  matched: Set<string>;
  total: number;
}

/** Footprint position (mm) and angle (degrees) at the time the GLB was exported. */
export type FootprintPose = { x: number; y: number; angle: number };

export function footprintPoses(board: BoardModel): Map<string, FootprintPose> {
  return new Map(board.footprints.map((f) => [f.ref, { x: f.at.x, y: f.at.y, angle: f.angle }]));
}

/**
 * With `exportPoses` (the footprints when the GLB was made), parts that were moved or turned
 * since then follow the current board: the GLB node sits at the footprint origin with the
 * footprint angle as a rotation about the vertical axis.
 */
export async function loadComponentModels(
  data: ArrayBuffer,
  board: BoardModel,
  frame: WorldFrame,
  exportPoses?: Map<string, FootprintPose>,
): Promise<ComponentModels> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const root = gltf.scene;
  const fps = new Map(board.footprints.map((f) => [f.ref, f]));
  const matched = new Set<string>();
  const topY: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  // footprint nodes may sit one or two levels below the scene root
  const visit = (node: THREE.Object3D) => {
    for (const child of [...node.children]) {
      const fp = fps.get(child.name);
      if (fp) {
        matched.add(child.name);
        if (fp.side === 'top') topY.push(child.position.y);
        const was = exportPoses?.get(fp.ref);
        if (was && (was.x !== fp.at.x || was.y !== fp.at.y || was.angle !== fp.angle)) {
          child.position.x += (fp.at.x - was.x) / 1000;
          child.position.z += (fp.at.y - was.y) / 1000;
          child.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(up, ((fp.angle - was.angle) * Math.PI) / 180));
        }
        continue;
      }
      if (child.children.some((c) => fps.has(c.name))) visit(child);
      else child.visible = false;
    }
  };
  visit(root);

  // KiCad places top-side bodies on the top surface of its board; put that onto ours
  topY.sort((a, b) => a - b);
  const kicadTop = topY.length ? topY[Math.floor(topY.length / 2)]! : board.thickness / 1000;
  const top = board.layers[0]!;
  const ourTop = top.y + top.thickness / 2;
  root.scale.setScalar(1000);
  root.position.set(-frame.ox, ourTop - kicadTop * 1000, -frame.oy);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  root.name = 'component-models';
  return { root, matched, total: board.footprints.length };
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
