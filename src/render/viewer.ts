/**
 * The 3D view: scene, camera, controls, the opaque pass into a render target and the
 * full-screen volume composite. Renders on demand.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BoardModel } from '../model/types';
import type { WorldFrame } from '../model/world';
import { covered, type CoverageRaster } from '../model/planes';
import type { Grid } from '../compute/grid';
import { buildBoardMeshes, highlightNets, type BoardMeshes } from './boardMesh';
import { disposeObject, type ComponentModels } from './componentModels';
import { colormapLut, type ColormapId } from './colormaps';
import { buildIsosurfaces } from './isosurface';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { WorldCallouts, htmlInCanvasSupported } from './worldCallouts';
import type { FocusScene } from './focusScene';
import type { Callout } from '../ui/calloutData';
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
  /** Isosurfaces: last volume bytes, a version that changes with them, and the shells. */
  private volumeBytes: Uint8Array | null = null;
  private volumeVersion = 0;
  private iso: { group: THREE.Group; key: string } | null = null;
  private isoParams: { enabled: boolean; window: [number, number]; colormap: ColormapId } = { enabled: false, window: [0, 1], colormap: 'inferno' };
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
      // in a headset three.js renders both eyes; the ray-marched glow needs the depth pass of
      // a flat screen, so VR shows the isosurfaces instead (see enableXR)
      if (this.renderer.xr.isPresenting) {
        this.world?.update(this.renderer.xr.getCamera());
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this.stepFlight(now);
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
    if (this.problem) this.applyInset();
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.requestRender();
  }

  private renderListeners = new Set<() => void>();

  /** Called after every frame that was drawn (overlays that follow the camera). */
  onRendered(fn: () => void): () => void {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  }

  /** Screen position (px in the container) of a world point; behind = not in front of the camera. */
  project(p: readonly [number, number, number]): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 || v.z < -1 };
  }

  // --- speech bubbles inside the world (HTML-in-Canvas) -----------------------------------------
  private world: WorldCallouts | null = null;
  private calloutList: Callout[] = [];
  private calloutsWanted = false;
  private boardSize = 70;
  readonly htmlInCanvas = htmlInCanvasSupported();

  /**
   * Bubbles for the world. They are shown when wanted and supported, and always in VR (where
   * the HTML overlay cannot be seen) when the browser can.
   */
  setWorldCallouts(list: Callout[], wanted: boolean) {
    this.calloutList = list;
    this.calloutsWanted = wanted;
    this.applyWorldCallouts();
  }

  private applyWorldCallouts() {
    const on = this.htmlInCanvas && (this.calloutsWanted || this.xrIso);
    if (!on) {
      this.world?.dispose();
      this.world = null;
      this.requestRender();
      return;
    }
    if (!this.world) {
      this.world = new WorldCallouts(this.renderer, this.camera, () => this.requestRender());
      this.scene.add(this.world.group);
    }
    this.world.setBoardSize(this.boardSize);
    this.world.set(this.calloutList);
    this.requestRender();
  }

  // --- problem view: a separate scene with only what matters for one finding --------------------------
  private problem: { scene: THREE.Scene; content: FocusScene; home: { pos: THREE.Vector3; target: THREE.Vector3 } } | null = null;
  private flight: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t0: number; ms: number } | null = null;

  get inFocus() {
    return !!this.problem;
  }

  /** Show a problem view; with fly = true the camera moves to its oblique view. */
  enterFocus(content: FocusScene, fly: boolean) {
    if (!this.problem) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0b0f14');
      scene.add(new THREE.HemisphereLight('#dfe8ff', '#202830', 1.2));
      const sun = new THREE.DirectionalLight('#ffffff', 1.5);
      sun.position.set(40, 120, 60);
      scene.add(sun);
      this.problem = { scene, content, home: { pos: this.camera.position.clone(), target: this.controls.target.clone() } };
    } else {
      this.problem.scene.remove(this.problem.content.group);
      this.problem.content.dispose();
      this.problem.content = content;
    }
    this.problem.scene.add(content.group);
    this.renderer.localClippingEnabled = true;
    this.applyInset();
    if (fly) this.flyTo(content.position, content.target);
    this.requestRender();
  }

  exitFocus() {
    if (!this.problem) return;
    const home = this.problem.home;
    this.problem.scene.remove(this.problem.content.group);
    this.problem.content.dispose();
    this.problem = null;
    this.renderer.localClippingEnabled = false;
    this.applyInset();
    this.flyTo(home.pos, home.target);
    this.requestRender();
  }

  /** Width (px) covered by the problem view's card on the left; the view centre moves right. */
  focusInset = 354;

  private applyInset() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (this.problem && w > 760) this.camera.setViewOffset(w, h, -this.focusInset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Smooth camera move (ease in-out). */
  flyTo(position: THREE.Vector3, target: THREE.Vector3, ms = 650) {
    this.flight = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [position.clone(), target.clone()], t0: performance.now(), ms };
    this.requestRender();
  }

  private stepFlight(now: number) {
    const f = this.flight;
    if (!f) return;
    const k = Math.min(1, (now - f.t0) / f.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    this.camera.position.lerpVectors(f.from[0], f.to[0], e);
    this.controls.target.lerpVectors(f.from[1], f.to[1], e);
    this.needsRender = true;
    if (k >= 1) this.flight = null;
  }

  private render() {
    this.camera.updateMatrixWorld();
    if (this.problem) {
      // the problem view: its own scene, no glow
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.problem.scene, this.camera);
      this.renderer.setRenderTarget(null);
      const u = this.volumeMat.uniforms;
      const on = u.volumeOn!.value;
      u.volumeOn!.value = false;
      u.tColor!.value = this.rt.texture;
      u.tDepth!.value = this.rt.depthTexture;
      this.renderer.render(this.quadScene, this.quadCamera);
      u.volumeOn!.value = on;
      for (const fn of this.renderListeners) fn();
      return;
    }
    this.world?.update();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    const u = this.volumeMat.uniforms;
    u.projInv!.value.copy(this.camera.projectionMatrixInverse);
    u.viewInv!.value.copy(this.camera.matrixWorld);
    u.tColor!.value = this.rt.texture;
    u.tDepth!.value = this.rt.depthTexture;
    this.renderer.render(this.quadScene, this.quadCamera);
    for (const fn of this.renderListeners) fn();
  }

  private frame: WorldFrame = { ox: 0, oy: 0 };

  /** keepCamera: the same board reloaded after an edit, so the view stays where it was. */
  setBoard(board: BoardModel, frame: WorldFrame, keepCamera = false) {
    this.frame = frame;
    this.setComponentModels(null);
    if (this.board) {
      this.scene.remove(this.board.group);
      this.board.dispose();
    }
    this.board = buildBoardMeshes(board, frame);
    this.scene.add(this.board.group);
    const w = board.bbox.x1 - board.bbox.x0;
    const d = board.bbox.y1 - board.bbox.y0;
    const r = Math.max(w, d);
    this.boardSize = r;
    this.camera.near = Math.max(0.05, r / 2000);
    this.camera.far = r * 50;
    this.home = { pos: new THREE.Vector3(r * 0.15, r * 0.75, r * 0.95), near: this.camera.near };
    if (keepCamera) {
      this.camera.updateProjectionMatrix();
      this.requestRender();
    } else this.overview();
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
    this.volumeBytes = bytes;
    this.volumeVersion++;
    if (!bytes || !grid) {
      u.volumeOn!.value = false;
      this.slice.visible = false;
      this.updateIsosurfaces();
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

  /** In VR the isosurfaces stand in for the glow. */
  private xrIso = false;

  /**
   * WebXR (W1): a button for headsets that support immersive VR. In the headset the board
   * lies on a table in front of the viewer, enlarged 5 times (1 mm becomes 5 mm).
   */
  async enableXR(): Promise<HTMLElement | null> {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    if (!xr || !(await xr.isSessionSupported('immersive-vr').catch(() => false))) return null;
    this.renderer.xr.enabled = true;
    const saved = { scale: this.scene.scale.clone(), position: this.scene.position.clone() };
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.scene.scale.setScalar(0.005);
      this.scene.position.set(0, 0.85, -0.45);
      this.xrIso = true;
      this.updateIsosurfaces();
      this.applyWorldCallouts();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.scene.scale.copy(saved.scale);
      this.scene.position.copy(saved.position);
      this.xrIso = false;
      this.updateIsosurfaces();
      this.applyWorldCallouts();
      this.resize();
    });
    const button = VRButton.createButton(this.renderer);
    this.container.appendChild(button);
    return button;
  }

  /** Three translucent shells at 35, 60 and 85 % of the display window, coloured like the glow. */
  setIsosurfaces(p: { enabled: boolean; window: [number, number]; colormap: ColormapId }) {
    this.isoParams = p;
    this.updateIsosurfaces();
  }

  private updateIsosurfaces() {
    const p = this.isoParams;
    const on = (p.enabled || this.xrIso) && !!this.volumeBytes && !!this.grid;
    const key = on ? `${this.volumeVersion}|${p.window[0].toFixed(4)}|${p.window[1].toFixed(4)}|${p.colormap}` : '';
    if (this.iso?.key === key) return;
    if (this.iso) {
      this.scene.remove(this.iso.group);
      this.iso.group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      this.iso = null;
    }
    if (on) {
      const lut = colormapLut(p.colormap);
      const levels = [
        { f: 0.35, opacity: 0.16 },
        { f: 0.6, opacity: 0.28 },
        { f: 0.85, opacity: 0.5 },
      ].map(({ f, opacity }) => {
        const k = Math.round(f * 255) * 4;
        return {
          level: Math.max(1, Math.min(254, (p.window[0] + f * (p.window[1] - p.window[0])) * 255)),
          color: new THREE.Color().setRGB(lut[k]! / 255, lut[k + 1]! / 255, lut[k + 2]! / 255, THREE.SRGBColorSpace),
          opacity,
        };
      });
      const group = buildIsosurfaces(this.volumeBytes!, this.grid!, levels);
      this.scene.add(group);
      this.iso = { group, key };
    }
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

  private models: ComponentModels | null = null;
  private componentsVisible = true;

  setComponentsVisible(v: boolean) {
    this.componentsVisible = v;
    if (this.board?.components) this.board.components.visible = v;
    if (this.models) this.models.root.visible = v;
    this.requestRender();
  }

  /** Real component models (from a KiCad GLB) replace the boxes of the parts they cover. */
  setComponentModels(models: ComponentModels | null) {
    if (this.models) {
      this.scene.remove(this.models.root);
      disposeObject(this.models.root);
    }
    this.models = models;
    const boxes = this.board?.components;
    if (boxes) {
      const bodies = boxes.userData.footprints as { ref: string }[];
      const base = boxes.userData.baseMatrices as THREE.Matrix4[] | undefined;
      if (!base) {
        const saved: THREE.Matrix4[] = [];
        for (let i = 0; i < boxes.count; i++) {
          const m = new THREE.Matrix4();
          boxes.getMatrixAt(i, m);
          saved.push(m);
        }
        boxes.userData.baseMatrices = saved;
      }
      const matrices = boxes.userData.baseMatrices as THREE.Matrix4[];
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      bodies.forEach((f, i) => boxes.setMatrixAt(i, models?.matched.has(f.ref) ? hidden : matrices[i]!));
      boxes.instanceMatrix.needsUpdate = true;
    }
    if (models) {
      models.root.visible = this.componentsVisible;
      this.scene.add(models.root);
    }
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

  private measurementSlices: THREE.Group | null = null;

  /**
   * Measured slices as textured planes: values in dB on a regular grid (NaN = not measured),
   * coloured with the field colour map, or with a blue-white-red map for differences.
   */
  setMeasurementSlices(
    slices: { y: number; x0: number; z0: number; step: number; nx: number; nz: number; values: Float32Array; lo: number; hi: number; diverging: boolean }[],
    colormap: ColormapId,
  ) {
    if (this.measurementSlices) {
      this.scene.remove(this.measurementSlices);
      disposeObject(this.measurementSlices);
      this.measurementSlices = null;
    }
    if (slices.length === 0) return this.requestRender();
    const g = new THREE.Group();
    const lut = colormapLut(colormap);
    for (const sl of slices) {
      const rgba = new Uint8Array(sl.nx * sl.nz * 4);
      for (let k = 0; k < sl.values.length; k++) {
        const v = sl.values[k]!;
        if (!Number.isFinite(v)) continue;
        const t = Math.min(1, Math.max(0, (v - sl.lo) / (sl.hi - sl.lo)));
        if (sl.diverging) {
          // blue (below) – white (0) – red (above)
          const a = t * 2 - 1;
          rgba[k * 4] = Math.round(255 * (a > 0 ? 1 : 1 + a));
          rgba[k * 4 + 1] = Math.round(255 * (1 - Math.abs(a)));
          rgba[k * 4 + 2] = Math.round(255 * (a < 0 ? 1 : 1 - a));
        } else {
          const i = Math.round(t * 255) * 4;
          rgba[k * 4] = lut[i]!;
          rgba[k * 4 + 1] = lut[i + 1]!;
          rgba[k * 4 + 2] = lut[i + 2]!;
        }
        rgba[k * 4 + 3] = 235;
      }
      const tex = new THREE.DataTexture(rgba, sl.nx, sl.nz, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      const w = sl.nx * sl.step;
      const h = sl.nz * sl.step;
      const geo = new THREE.PlaneGeometry(w, h);
      geo.rotateX(-Math.PI / 2);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.set(sl.x0 - sl.step / 2 + w / 2, sl.y, sl.z0 - sl.step / 2 + h / 2);
      mesh.renderOrder = 7;
      g.add(mesh);
    }
    this.measurementSlices = g;
    this.scene.add(g);
    this.requestRender();
  }

  private returnPaths: THREE.Group | null = null;

  /** Stage 2 return paths drawn on top of everything (they run inside the board). */
  setReturnPaths(lines: { points: [number, number, number][]; color: string }[]) {
    if (this.returnPaths) {
      this.scene.remove(this.returnPaths);
      disposeObject(this.returnPaths);
      this.returnPaths = null;
    }
    if (lines.length) {
      const g = new THREE.Group();
      for (const l of lines) {
        if (l.points.length < 2) continue;
        const geo = new THREE.BufferGeometry().setFromPoints(l.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
        const mat = new THREE.LineDashedMaterial({ color: l.color, dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true, opacity: 0.95 });
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        line.renderOrder = 11;
        g.add(line);
      }
      this.returnPaths = g;
      this.scene.add(g);
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

  /** The loaded component models (for the problem view). */
  get componentModelRoot(): THREE.Object3D | null {
    return this.models?.root ?? null;
  }

  get overlayGroup() {
    return this.overlays;
  }

  /** Copper under the pointer: net, layer and the world point. */
  pick(clientX: number, clientY: number): PickResult | null {
    if (!this.board) return null;
    const ndc = this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.board.layers.filter((m) => m.visible), true);
    for (const h of hits) {
      const zone = h.object.userData.zone as { net: number; raster: CoverageRaster } | undefined;
      if (zone) {
        // textured plane: only where the raster has copper
        const bx = h.point.x + this.frame.ox;
        const by = h.point.z + this.frame.oy;
        if (!covered(zone.raster, bx, by)) continue;
        return { net: zone.net, layer: h.object.parent!.userData.layer as number, world: h.point.clone() };
      }
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
