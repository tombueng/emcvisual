/**
 * Speech bubbles inside the 3D world (HTML-in-Canvas): each bubble is a real HTML element, a
 * child of the WebGL canvas, drawn by the browser into a texture (three.js HTMLTexture) on a
 * plane that faces the viewer. Unlike the overlay, the bubbles sit in the scene: parts in front
 * hide them, they get smaller with distance, and they also show in VR. three.js'
 * InteractionManager keeps each element under its plane (CSS matrix3d), so clicks still reach it.
 *
 * Needs a browser with HTML-in-Canvas (Chrome/Edge origin trial since 2026, or the flag
 * chrome://flags/#canvas-draw-element); elsewhere the overlay (Callouts.svelte) is used.
 */
import * as THREE from 'three';
import { InteractionManager } from 'three/examples/jsm/interaction/InteractionManager.js';
import type { Callout } from '../ui/calloutData';

/** The generation of the API that this three.js version speaks (Chrome 138–154). */
export function htmlInCanvasSupported(): boolean {
  return typeof WebGL2RenderingContext !== 'undefined' && 'texElementImage2D' in WebGL2RenderingContext.prototype;
}

/** Bubbles are laid out at twice their size, so the texture stays sharp up close. */
const SUPERSAMPLE = 2;

interface Item {
  el: HTMLDivElement;
  /** Created after the element's first paint (an upload before that fails). */
  texture: THREE.HTMLTexture | null;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  leader: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  anchor: THREE.Vector3;
  signature: string;
  lift: number;
  onclick: () => void;
}

export class WorldCallouts {
  readonly group = new THREE.Group();
  private items = new Map<string, Item>();
  private interactions = new InteractionManager();
  /** World units per CSS pixel of a bubble (scaled to the board size). */
  private scale = 0.07;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private camera: THREE.Camera,
    private onChange: () => void,
  ) {
    this.group.name = 'world-callouts';
    this.interactions.connect(renderer, camera);
    // children of the canvas are laid out (not painted as fallback content) with this attribute
    renderer.domElement.setAttribute('layoutsubtree', 'true');
    this.listen();
  }

  private get canvas() {
    return this.renderer.domElement as HTMLCanvasElement & {
      onpaint: ((e: Event & { changedElements?: Element[] }) => void) | null;
      requestPaint?: () => void;
    };
  }

  /**
   * One paint handler for all bubbles: a bubble gets its texture after its first paint, later
   * paints mark the texture for upload. (HTMLTexture's constructor installs its own handler on
   * the parent, so ours is put back after each construction.)
   */
  private listen() {
    this.canvas.onpaint = (e) => {
      const changed = e.changedElements ?? [...this.items.values()].map((it) => it.el);
      for (const it of this.items.values()) {
        if (!changed.includes(it.el)) continue;
        if (!it.texture) {
          it.texture = new THREE.HTMLTexture(it.el);
          it.texture.colorSpace = THREE.SRGBColorSpace;
          it.mesh.material.map = it.texture;
          it.mesh.material.needsUpdate = true;
          it.mesh.visible = true;
          this.resize(it);
        } else it.texture.needsUpdate = true;
      }
      this.listen();
      this.onChange();
    };
  }

  /** Board size in world mm: bubbles scale with it, so they read alike on every board. */
  setBoardSize(mm: number) {
    this.scale = Math.max(0.03, mm / 700);
  }

  set(list: Callout[]) {
    const seen = new Set<string>();
    list.forEach((c, i) => {
      seen.add(c.key);
      const signature = JSON.stringify([c.badge, c.title, c.lines, c.accent, c.color, c.kind, c.spectrum]);
      let it = this.items.get(c.key);
      if (!it) {
        it = this.create(c);
        this.items.set(c.key, it);
      }
      it.anchor.set(c.pos[0], c.pos[1], c.pos[2]);
      it.onclick = c.onclick;
      // a little stagger, so neighbouring bubbles do not sit on one line
      it.lift = 30 * this.scale;
      if (it.signature !== signature) {
        this.fill(it.el, c);
        it.signature = signature;
        this.resize(it);
      }
    });
    for (const [key, it] of this.items) {
      if (seen.has(key)) continue;
      this.destroy(it);
      this.items.delete(key);
    }
  }

  private create(c: Callout): Item {
    const el = document.createElement('div');
    el.className = `wc wc-${c.kind}`;
    // keep clicks for the bubble: no probe toggling or orbiting underneath
    for (const type of ['pointerdown', 'pointerup', 'click'] as const)
      el.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'click') it.onclick();
      });
    this.renderer.domElement.appendChild(el);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 20;
    mesh.visible = false;
    const leader = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.8 }),
    );
    this.group.add(mesh, leader);
    this.interactions.add(mesh);
    const it: Item = { el, texture: null, mesh, leader, anchor: new THREE.Vector3(), signature: '', lift: 1, onclick: c.onclick };
    return it;
  }

  private fill(el: HTMLDivElement, c: Callout) {
    el.style.setProperty('--c', c.color);
    el.style.fontSize = `${11.5 * SUPERSAMPLE}px`;
    el.replaceChildren();
    const head = document.createElement('div');
    head.className = 'wc-head';
    if (c.badge) {
      const b = document.createElement('span');
      b.className = 'wc-badge';
      b.textContent = c.badge;
      head.append(b);
    }
    const title = document.createElement('span');
    title.className = 'wc-title';
    title.textContent = c.title;
    head.append(title);
    el.append(head);
    for (const l of c.lines) {
      const d = document.createElement('div');
      d.className = 'wc-line';
      d.textContent = l;
      el.append(d);
    }
    if (c.accent) {
      const a = document.createElement('div');
      a.className = 'wc-accent';
      a.textContent = c.accent;
      el.append(a);
    }
    if (c.spectrum) {
      const chart = document.createElement('div');
      chart.className = 'wc-chart';
      chart.innerHTML = c.spectrum; // our own SVG markup (spectrumSvg.ts), labels escaped there
      el.append(chart);
    }
    this.canvas.requestPaint?.();
  }

  /** Plane size from the element's laid-out size. */
  private resize(it: Item) {
    const w = Math.max(1, it.el.offsetWidth) / SUPERSAMPLE;
    const h = Math.max(1, it.el.offsetHeight) / SUPERSAMPLE;
    it.mesh.geometry.dispose();
    it.mesh.geometry = new THREE.PlaneGeometry(w * this.scale, h * this.scale);
    if (it.texture) it.texture.needsUpdate = true;
  }

  /**
   * Face the viewer and step aside like the overlay does: above-right of the anchor on a
   * leader, else higher, else to the left; a bubble that finds no free spot on screen hides.
   */
  update(camera: THREE.Camera = this.camera) {
    const q = camera.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const W = this.renderer.domElement.clientWidth;
    const H = this.renderer.domElement.clientHeight;
    const screen = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, front: p.z < 1 && p.z > -1 };
    };
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    // XR: no screen to lay out on, keep the first choice
    const declutter = !this.renderer.xr.isPresenting;
    for (const it of this.items.values()) {
      if (!it.texture) continue;
      const g = it.mesh.geometry.parameters;
      let chosen: { corner: THREE.Vector3; side: number } | null = null;
      const step = 28 * this.scale;
      search: for (let k = 0; k < (declutter ? 5 : 1); k++) {
        for (const side of [1, -1]) {
          const lift = it.lift + k * step;
          const corner = it.anchor.clone().addScaledVector(up, lift).addScaledVector(right, side * lift * 0.4);
          if (!declutter) {
            chosen = { corner, side };
            break search;
          }
          // the bubble's screen rectangle from its two opposite corners
          const far = corner.clone().addScaledVector(right, side * g.width).addScaledVector(up, g.height);
          const a = screen(corner);
          const b = screen(far);
          if (!a.front || !b.front) continue;
          const r = { x0: Math.min(a.x, b.x) - 2, y0: Math.min(a.y, b.y) - 2, x1: Math.max(a.x, b.x) + 2, y1: Math.max(a.y, b.y) + 2 };
          if (r.x0 < 0 || r.y0 < 0 || r.x1 > W || r.y1 > H) continue;
          if (placed.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) continue;
          placed.push(r);
          chosen = { corner, side };
          break search;
        }
      }
      it.mesh.visible = !!chosen;
      it.leader.visible = !!chosen;
      if (!chosen) continue;
      const { corner, side } = chosen;
      it.mesh.position.copy(corner).addScaledVector(right, (side * g.width) / 2).addScaledVector(up, g.height / 2);
      it.mesh.quaternion.copy(q);
      const pos = it.leader.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, it.anchor.x, it.anchor.y, it.anchor.z);
      pos.setXYZ(1, corner.x, corner.y, corner.z);
      pos.needsUpdate = true;
      it.mesh.updateMatrixWorld();
    }
    this.interactions.update();
  }

  private destroy(it: Item) {
    this.interactions.remove(it.mesh);
    this.group.remove(it.mesh, it.leader);
    it.mesh.geometry.dispose();
    it.mesh.material.dispose();
    it.texture?.dispose();
    it.leader.geometry.dispose();
    it.leader.material.dispose();
    it.el.remove();
  }

  dispose() {
    for (const it of this.items.values()) this.destroy(it);
    this.items.clear();
    this.canvas.onpaint = null;
    this.group.removeFromParent();
  }
}
