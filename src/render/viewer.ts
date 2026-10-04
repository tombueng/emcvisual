/**
 * The 3D view: scene, camera, controls, the opaque pass into a render target and the
 * full-screen volume composite. Renders on demand.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BoardModel } from '../model/types';
import type { WorldFrame } from '../model/world';
import type { Grid } from '../compute/grid';
import { buildBoardMeshes, highlightNets, type BoardMeshes } from './boardMesh';
import { colormapLut, type ColormapId } from './colormaps';
import { sliceFragment, sliceVertex, volumeFragment, volumeVertex } from './volumeShader';

export interface VolumeParams {
  enabled: boolean;
  /** Visible window in normalised texture units (0..1). */
  window: [number, number];
  density: number;
  gamma: number;
  colormap: ColormapId;
}

export interface SliceParams {
  enabled: boolean;
  /** World height of the slice, mm. */
  height: number;
  opacity: number;
}

export interface PickResult {
  net: number;
  layer: number;
  world: THREE.Vector3;
}

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private rt: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private volumeMat: THREE.ShaderMaterial;
  private sliceMat: THREE.ShaderMaterial;
  private slice: THREE.Mesh;
  private volumeTex: THREE.Data3DTexture | null = null;
  private lut: THREE.DataTexture;
  private board: BoardMeshes | null = null;
  private grid: Grid | null = null;
  private needsRender = true;
  private resizeObserver: ResizeObserver;
  private probe: THREE.Group;
  private overlays = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private animating = 0;
  private fieldLines: THREE.LineSegments | null = null;
  private stopLinesAnim: (() => void) | null = null;
  private markers: THREE.InstancedMesh | null = null;
  private time = 0;
  onFrame?: (dt: number) => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#0b0f14');
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    this.camera.position.set(0, 90, 110);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener('change', () => this.requestRender());

    this.scene.background = new THREE.Color('#0b0f14');
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#202830', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(40, 120, 60);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#8fb7ff', 0.5);
    rim.position.set(-60, -40, -80);
    this.scene.add(rim);
    this.scene.add(this.overlays);

    this.rt = this.makeTarget(1, 1);
    this.lut = new THREE.DataTexture(colormapLut('inferno'), 256, 1, THREE.RGBAFormat);
    this.lut.colorSpace = THREE.SRGBColorSpace;
    this.lut.magFilter = THREE.LinearFilter;
    this.lut.minFilter = THREE.LinearFilter;
    this.lut.needsUpdate = true;

    const empty = new THREE.Data3DTexture(new Uint8Array([0]), 1, 1, 1);
    empty.format = THREE.RedFormat;
    empty.needsUpdate = true;

    this.volumeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: volumeVertex,
      fragmentShader: volumeFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        tVolume: { value: empty },
        tLut: { value: this.lut },
        projInv: { value: new THREE.Matrix4() },
        viewInv: { value: new THREE.Matrix4() },
        boxMin: { value: new THREE.Vector3() },
        boxMax: { value: new THREE.Vector3(1, 1, 1) },
        window: { value: new THREE.Vector2(0.4, 1) },
        density: { value: 0.35 },
        gammaA: { value: 1.6 },
        stepSize: { value: 0.4 },
        maxSteps: { value: 384 },
        volumeOn: { value: false },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.volumeMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);

    this.sliceMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: sliceVertex,
      fragmentShader: sliceFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        tVolume: { value: empty },
        tLut: { value: this.lut },
        boxMin: this.volumeMat.uniforms.boxMin!,
        boxMax: this.volumeMat.uniforms.boxMax!,
        window: this.volumeMat.uniforms.window!,
        opacity: { value: 0.85 },
      },
    });
    this.slice = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sliceMat);
    this.slice.rotation.x = -Math.PI / 2;
    this.slice.visible = false;
    this.slice.renderOrder = 5;
    this.scene.add(this.slice);

    this.probe = makeProbe();
    this.probe.visible = false;
    this.scene.add(this.probe);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = (now - last) / 1000;
      last = now;
      const moving = this.controls.update();
      if (this.animating > 0) {
        this.time += dt;
        if (this.fieldLines) (this.fieldLines.material as THREE.ShaderMaterial).uniforms.time!.value = this.time;
        this.onFrame?.(dt);
        this.needsRender = true;
      }
      if (this.needsRender || moving) {
        this.needsRender = false;
        this.render();
      }
    });
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.FloatType;
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthTexture,
      samples: 4,
    });
  }

  requestRender() {
    this.needsRender = true;
  }

  /** Keep rendering every frame (for animations) while the returned function is not called. */
  startAnimation(): () => void {
    this.animating++;
    let stopped = false;
    return () => {
      if (!stopped) {
        stopped = true;
        this.animating--;
      }
    };
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.requestRender();
  }

  private render() {
    this.camera.updateMatrixWorld();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    const u = this.volumeMat.uniforms;
    u.projInv!.value.copy(this.camera.projectionMatrixInverse);
    u.viewInv!.value.copy(this.camera.matrixWorld);
    u.tColor!.value = this.rt.texture;
    u.tDepth!.value = this.rt.depthTexture;
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  setBoard(board: BoardModel, frame: WorldFrame) {
    if (this.board) {
      this.scene.remove(this.board.group);
      this.board.dispose();
    }
    this.board = buildBoardMeshes(board, frame);
    this.scene.add(this.board.group);
    const w = board.bbox.x1 - board.bbox.x0;
    const d = board.bbox.y1 - board.bbox.y0;
    const r = Math.max(w, d);
    this.camera.near = Math.max(0.05, r / 2000);
    this.camera.far = r * 50;
    this.home = { pos: new THREE.Vector3(r * 0.15, r * 0.75, r * 0.95), near: this.camera.near };
    this.overview();
  }

  private home: { pos: THREE.Vector3; near: number } | null = null;

  /** Back to the overview camera of the board. */
  overview() {
    this.setWalk(false);
    if (!this.home) return;
    this.camera.position.copy(this.home.pos);
    this.camera.near = this.home.near;
    this.controls.target.set(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  setVolume(bytes: Uint8Array | null, grid: Grid | null) {
    const u = this.volumeMat.uniforms;
    if (!bytes || !grid) {
      u.volumeOn!.value = false;
      this.slice.visible = false;
      this.requestRender();
      return;
    }
    const same = this.volumeTex && this.grid && this.grid.nx === grid.nx && this.grid.ny === grid.ny && this.grid.nz === grid.nz;
    if (!same) {
      this.volumeTex?.dispose();
      const tex = new THREE.Data3DTexture(bytes, grid.nx, grid.ny, grid.nz);
      tex.format = THREE.RedFormat;
      tex.type = THREE.UnsignedByteType;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.unpackAlignment = 1;
      this.volumeTex = tex;
    } else {
      this.volumeTex!.image.data = bytes;
    }
    this.volumeTex!.needsUpdate = true;
    this.grid = grid;
    u.tVolume!.value = this.volumeTex;
    this.sliceMat.uniforms.tVolume!.value = this.volumeTex;
    u.boxMin!.value.set(grid.x0 - grid.dx / 2, grid.y0 - grid.dy / 2, grid.z0 - grid.dz / 2);
    u.boxMax!.value.set(grid.x0 + (grid.nx - 0.5) * grid.dx, grid.y0 + (grid.ny - 0.5) * grid.dy, grid.z0 + (grid.nz - 0.5) * grid.dz);
    u.stepSize!.value = Math.min(grid.dx, grid.dy, grid.dz) * 0.6;
    const diag = Math.hypot(grid.nx * grid.dx, grid.ny * grid.dy, grid.nz * grid.dz);
    u.maxSteps!.value = Math.min(1024, Math.ceil(diag / u.stepSize!.value));
    this.slice.scale.set(grid.nx * grid.dx, grid.nz * grid.dz, 1);
    this.slice.position.x = grid.x0 + ((grid.nx - 1) * grid.dx) / 2;
    this.slice.position.z = grid.z0 + ((grid.nz - 1) * grid.dz) / 2;
    this.requestRender();
  }

  hasVolume() {
    return !!this.volumeTex;
  }

  setVolumeParams(p: VolumeParams) {
    const u = this.volumeMat.uniforms;
    u.volumeOn!.value = p.enabled && !!this.volumeTex;
    u.window!.value.set(p.window[0], p.window[1]);
    u.density!.value = p.density;
    u.gammaA!.value = p.gamma;
    this.lut.image.data = colormapLut(p.colormap);
    this.lut.needsUpdate = true;
    this.requestRender();
  }

  setSlice(p: SliceParams) {
    this.slice.visible = p.enabled && !!this.volumeTex;
    this.slice.position.y = p.height;
    this.sliceMat.uniforms.opacity!.value = p.opacity;
    this.requestRender();
  }

  setLayerVisible(index: number, visible: boolean) {
    const m = this.board?.layers[index];
    if (m) m.visible = visible;
    this.requestRender();
  }

  setSubstrateOpacity(opacity: number) {
    if (!this.board) return;
    const mat = this.board.substrate.material as THREE.MeshStandardMaterial;
    mat.opacity = opacity;
    mat.depthWrite = opacity > 0.95;
    this.board.substrate.visible = opacity > 0.01;
    this.requestRender();
  }

  setComponentsVisible(v: boolean) {
    if (this.board?.components) this.board.components.visible = v;
    this.requestRender();
  }

  highlight(nets: Set<number> | null) {
    if (this.board) highlightNets(this.board, nets && nets.size ? nets : null);
    this.requestRender();
  }

  setProbe(pos: [number, number, number] | null, radius = 1) {
    this.probe.visible = !!pos;
    if (pos) {
      this.probe.position.set(pos[0], pos[1], pos[2]);
      this.probe.scale.setScalar(radius);
      (this.probe.userData.stem as THREE.Mesh).scale.y = 8 / radius;
    }
    this.requestRender();
  }

  setFieldLines(lines: THREE.LineSegments | null) {
    if (this.fieldLines) {
      this.scene.remove(this.fieldLines);
      this.fieldLines.geometry.dispose();
      (this.fieldLines.material as THREE.Material).dispose();
    }
    this.fieldLines = lines;
    if (lines) {
      this.scene.add(lines);
      if (!this.stopLinesAnim) this.stopLinesAnim = this.startAnimation();
    } else if (this.stopLinesAnim) {
      this.stopLinesAnim();
      this.stopLinesAnim = null;
    }
    this.requestRender();
  }

  /** Small markers (hotspots) in world coordinates. */
  setMarkers(list: { pos: [number, number, number]; color: string }[]) {
    if (this.markers) {
      this.scene.remove(this.markers);
      this.markers.geometry.dispose();
      (this.markers.material as THREE.Material).dispose();
      this.markers = null;
    }
    if (list.length) {
      const mesh = new THREE.InstancedMesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }),
        list.length,
      );
      const m = new THREE.Matrix4();
      list.forEach((it, i) => {
        m.makeTranslation(it.pos[0], it.pos[1], it.pos[2]);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(it.color));
      });
      mesh.renderOrder = 10;
      this.markers = mesh;
      this.scene.add(mesh);
    }
    this.requestRender();
  }

  private walkKeys = new Set<string>();
  private walkHandlers: { down: (e: KeyboardEvent) => void; up: (e: KeyboardEvent) => void } | null = null;
  private stopWalkAnim: (() => void) | null = null;
  walkSpeed = 20; // mm per second

  /**
   * Ant view: the camera drops to a small height above the board at (x, z) and looks across
   * it; W/A/S/D move along the board, Q/E change the height, the mouse still turns the view.
   */
  antView(tx: number, tz: number, height: number) {
    // stand 14 mm from the target on the side of the board centre and look at it
    const away = new THREE.Vector3(-tx, 0, -tz);
    if (away.lengthSq() < 1) away.set(0, 0, 1);
    away.normalize();
    this.camera.position.set(tx + away.x * 14, height, tz + away.z * 14);
    this.controls.target.set(tx, height * 0.4, tz);
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.setWalk(true);
    this.requestRender();
  }

  setWalk(on: boolean) {
    if (on && !this.walkHandlers) {
      const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      const down = (e: KeyboardEvent) => {
        if (isTyping(e)) return;
        const k = e.key.toLowerCase();
        if ('wasdqe'.includes(k) && k.length === 1) this.walkKeys.add(k);
      };
      const up = (e: KeyboardEvent) => this.walkKeys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      this.walkHandlers = { down, up };
      this.stopWalkAnim = this.startAnimation();
      const prev = this.onFrame;
      this.onFrame = (dt) => {
        prev?.(dt);
        this.walkStep(dt);
      };
    } else if (!on && this.walkHandlers) {
      window.removeEventListener('keydown', this.walkHandlers.down);
      window.removeEventListener('keyup', this.walkHandlers.up);
      this.walkHandlers = null;
      this.walkKeys.clear();
      this.stopWalkAnim?.();
      this.stopWalkAnim = null;
      this.onFrame = undefined;
    }
  }

  get walking() {
    return !!this.walkHandlers;
  }

  private walkStep(dt: number) {
    if (this.walkKeys.size === 0) return;
    const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-9) return;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const move = new THREE.Vector3();
    const v = this.walkSpeed * dt;
    if (this.walkKeys.has('w')) move.addScaledVector(fwd, v);
    if (this.walkKeys.has('s')) move.addScaledVector(fwd, -v);
    if (this.walkKeys.has('d')) move.addScaledVector(right, v);
    if (this.walkKeys.has('a')) move.addScaledVector(right, -v);
    if (this.walkKeys.has('e')) move.y += v * 0.3;
    if (this.walkKeys.has('q')) move.y -= v * 0.3;
    this.camera.position.add(move);
    this.controls.target.add(move);
    this.controls.update();
  }

  /** Point the camera at a world position, keeping the current distance. */
  focus(x: number, y: number, z: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(x, y, z);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestRender();
  }

  get overlayGroup() {
    return this.overlays;
  }

  /** Copper under the pointer: net, layer and the world point. */
  pick(clientX: number, clientY: number): PickResult | null {
    if (!this.board) return null;
    const ndc = this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.board.layers.filter((m) => m.visible), false);
    for (const h of hits) {
      const layer = h.object.userData.layer as number;
      const ids = this.board.netIds[layer]!;
      const face = h.face;
      if (!face) continue;
      const net = ids[face.a] ?? 0;
      return { net, layer, world: h.point.clone() };
    }
    return null;
  }

  /** Intersection of the pointer ray with a horizontal plane at world height y. */
  pickPlane(clientX: number, clientY: number, y: number): THREE.Vector3 | null {
    const ndc = this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p);
  }

  private toNdc(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  get canvas() {
    return this.renderer.domElement;
  }

  /** PNG snapshot of the current view. */
  snapshot(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.board?.dispose();
    this.volumeTex?.dispose();
    this.rt.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function makeProbe(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.12, 10, 40),
    new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0b5c80', metalness: 0.3, roughness: 0.4 }),
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1, 8),
    new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.5 }),
  );
  stem.geometry.translate(0, 0.5, 0);
  stem.position.y = 1;
  g.add(stem);
  g.userData.stem = stem;
  return g;
}
