import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseBoard } from '../src/kicad/parseBoard';
import { worldFrame } from '../src/model/world';
import { modelMatrix } from '../src/render/modelPlacement';
import { loadComponentModels } from '../src/render/componentModels';

// KiCad's own STEP library on this machine (the demo board references it); skipped elsewhere
const LIB = '/usr/share/kicad/3dmodels';
describe.runIf(existsSync(LIB))('3D model placement like KiCad', () => {
  it('puts a STEP model where KiCad’s GLB export has it', async () => {
    const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
    const frame = worldFrame(board);
    const occt = await createRequire(import.meta.url)('occt-import-js')();
    // reference: KiCad's GLB export of the demo board, mapped as the app maps it
    const glb = readFileSync('public/demo/demo-board.glb');
    const models = await loadComponentModels(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, board, frame);
    models.root.updateMatrixWorld(true);
    for (const ref of ['U3', 'J1', 'C2', 'U2', 'D1', 'L1']) {
      const fp = board.footprints.find((f) => f.ref === ref)!;
      const m = fp.models[0]!;
      const file = m.path.replace(/^\$\{[^}]+\}/, LIB);
      if (!existsSync(file)) continue;
      const res = occt.ReadStepFile(readFileSync(file), null);
      expect(res.success).toBe(true);
      const box = new THREE.Box3();
      const mat = modelMatrix(board, frame, fp, m);
      for (const mesh of res.meshes) {
        const pos = mesh.attributes.position.array as number[];
        for (let i = 0; i < pos.length; i += 3) box.expandByPoint(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mat));
      }
      const ref3 = new THREE.Box3().setFromObject(models.root.getObjectByName(ref)!);
      const c = box.getCenter(new THREE.Vector3());
      const c0 = ref3.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      const s0 = ref3.getSize(new THREE.Vector3());
      expect(c.distanceTo(c0), `${ref} centre`).toBeLessThan(0.15);
      expect(s.distanceTo(s0), `${ref} size`).toBeLessThan(0.15);
    }
  }, 60_000);
});
