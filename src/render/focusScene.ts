/**
 * Geometry of the problem view (ui/focusData.ts): only what matters for one finding, with the
 * layers pulled apart vertically so it reads which plane lies under which track. Planes are
 * translucent sheets with their outlines (gaps show as holes), the source's copper is in its
 * colour, other parts and vias are grey, and the detour, the extra loop area, dimensions and
 * circles are drawn on top. Returns the label anchors for the HTML labels.
 */
import * as THREE from 'three';
import { circlePoints, padOutline, rotateKicad } from '../model/geometry';
import type { BoardModel, Vec2 } from '../model/types';
import type { WorldFrame } from '../model/world';
import type { FocusSpec } from '../ui/focusData';

export interface FocusAnchor {
  pos: [number, number, number];
  text: string;
  sub?: string;
  kind: 'net' | 'plane' | 'part' | 'note' | 'dim';
  color?: string;
}

export interface FocusScene {
  group: THREE.Group;
  anchors: FocusAnchor[];
  target: THREE.Vector3;
  position: THREE.Vector3;
  dispose(): void;
}

const GREY = new THREE.Color('#8a97a6');
const PLANE_COLORS = ['#5aa0d6', '#b97ad1', '#7cc28a', '#c9b458', '#d07a7a'];

export function buildFocusScene(board: BoardModel, frame: WorldFrame, spec: FocusSpec, models?: THREE.Object3D | null): FocusScene {
  const group = new THREE.Group();
  group.name = 'focus';
  const anchors: FocusAnchor[] = [];
  const L = board.layers;
  const reg = spec.region;
  const size = Math.max(reg.x1 - reg.x0, reg.y1 - reg.y0);
  const thick = Math.max(0.4, (L[0]!.y - L[L.length - 1]!.y) || board.thickness);
  // spread the stack to about a sixth of the region, so the layers separate in the oblique view
  const E = Math.min(8, Math.max(1, (size * 0.08) / thick));
  const yOf = (layer: number) => L[layer]!.y * E;
  const w = (p: Vec2, y: number) => new THREE.Vector3(p.x - frame.ox, y, p.y - frame.oy);
  const lift = Math.max(0.05, thick * E * 0.02);

  // clip everything to the region (planes are whole zones)
  const clip = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(reg.x0 - frame.ox)),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), reg.x1 - frame.ox),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(reg.y0 - frame.oy)),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), reg.y1 - frame.oy),
  ];
  const mats: THREE.Material[] = [];
  const mat = <T extends THREE.Material>(m: T): T => {
    m.clippingPlanes = clip;
    mats.push(m);
    return m;
  };
  const flat = (poly: Vec2[], y: number, material: THREE.Material, order = 1) => {
    if (poly.length < 3) return;
    const tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p.x, p.y)), []);
    const pos: number[] = [];
    for (const p of poly) pos.push(p.x - frame.ox, y, p.y - frame.oy);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(tris.flat());
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.renderOrder = order;
    group.add(m);
  };
  const line = (pts: THREE.Vector3[], material: THREE.LineBasicMaterial | THREE.LineDashedMaterial, order = 6, loop = false) => {
    const g = new THREE.BufferGeometry().setFromPoints(loop ? [...pts, pts[0]!] : pts);
    const l = new THREE.Line(g, material);
    if (material instanceof THREE.LineDashedMaterial) l.computeLineDistances();
    l.renderOrder = order;
    group.add(l);
  };

  // --- reference planes: translucent sheets, outlines show the gaps ----------------------------------
  spec.planes.forEach((p, k) => {
    const color = new THREE.Color(PLANE_COLORS[k % PLANE_COLORS.length]!);
    const sheet = mat(new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8 }));
    const edge = mat(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    for (const z of board.zones) {
      if (z.layer !== p.layer || z.net !== p.net) continue;
      for (const ring of z.polygons) {
        flat(ring, yOf(p.layer), sheet, 1);
        line(ring.map((q) => w(q, yOf(p.layer))), edge, 2, true);
      }
    }
  });

  // --- the source's tracks, pads of the parts, vias ---------------------------------------------------
  const own = new THREE.Color(spec.color);
  const netSet = new Set(spec.nets);
  const ownMat = mat(new THREE.MeshStandardMaterial({ color: own, emissive: own, emissiveIntensity: 0.45, roughness: 0.5 }));
  const greyMat = mat(new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.7, transparent: true, opacity: 0.85 }));
  const ribbonH = Math.max(0.035, thick * E * 0.012);
  // the current path of the model (for a loop only the loop); whole nets when there is none
  const pieces = spec.path.length ? spec.path : board.tracks.filter((tr) => netSet.has(tr.net)).map((tr) => ({ a: tr.a, b: tr.b, layer: tr.layer, width: tr.width }));
  for (const tr of pieces) {
    const a = w(tr.a, yOf(tr.layer) + ribbonH / 2);
    const b = w(tr.b, yOf(tr.layer) + ribbonH / 2);
    const lenAB = a.distanceTo(b);
    if (lenAB < 1e-6) continue;
    const box = new THREE.Mesh(new THREE.BoxGeometry(lenAB + tr.width, ribbonH, tr.width), ownMat);
    box.position.copy(a).add(b).multiplyScalar(0.5);
    box.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    box.renderOrder = 3;
    group.add(box);
  }
  const partSet = new Set(spec.parts);
  board.pads.forEach((p) => {
    if (!partSet.has(p.footprint)) return;
    for (const li of p.layers) flat(padOutline(p), yOf(li) + ribbonH, netSet.has(p.net) ? ownMat : greyMat, 3);
  });
  const faintMat = mat(new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.7, transparent: true, opacity: 0.45, depthWrite: false }));
  const via = (vi: number, material: THREE.Material, scale: number) => {
    const v = board.vias[vi]!;
    const y0 = yOf(v.toLayer);
    const y1 = yOf(v.fromLayer);
    const r = (v.diameter / 2) * scale;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.05, y1 - y0), 14), material);
    cyl.position.copy(w(v.at, (y0 + y1) / 2));
    cyl.renderOrder = 3;
    group.add(cyl);
  };
  for (const vi of spec.vias) via(vi, ownMat, 1);
  // stitching vias near the finding: where the return current can change planes
  for (const vi of spec.stitchVias) via(vi, faintMat, 0.7);

  // --- part bodies: real models where loaded, else boxes ----------------------------------------------
  const top = yOf(0) + ribbonH;
  const bottom = yOf(L.length - 1);
  const bodyMat = mat(new THREE.MeshStandardMaterial({ color: '#3a4553', roughness: 0.6, transparent: true, opacity: 0.8 }));
  const bodyEdge = mat(new THREE.LineBasicMaterial({ color: '#9fb0c2', transparent: true, opacity: 0.7 }));
  for (const fi of spec.parts) {
    const f = board.footprints[fi]!;
    const node = models?.getObjectByName(f.ref);
    if (node && f.side === 'top') {
      const copy = node.clone(true);
      node.updateWorldMatrix(true, false);
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(node.matrixWorld);
      copy.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const src = Array.isArray(m.material) ? m.material : [m.material];
          m.material = src.map((x) => {
            const c = x.clone();
            mat(c);
            return c;
          }) as unknown as THREE.Material;
          if (src.length === 1) m.material = (m.material as unknown as THREE.Material[])[0]!;
        }
      });
      group.add(copy);
    } else {
      const h = Math.max(0.3, f.height);
      const box = new THREE.Mesh(new THREE.BoxGeometry(f.body.size.x, h, f.body.size.y), bodyMat);
      const y = f.side === 'top' ? top + h / 2 : bottom - h / 2;
      box.position.copy(w(f.body.center, y));
      box.rotation.y = -(f.body.angle * Math.PI) / 180;
      box.renderOrder = 4;
      group.add(box);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), bodyEdge);
      edges.position.copy(box.position);
      edges.rotation.copy(box.rotation);
      group.add(edges);
    }
  }

  // --- what the calculation objects to ---------------------------------------------------------------
  const amber = new THREE.Color('#f2a33a');
  const warn = new THREE.Color('#ff7a6b');
  const onTop = <T extends THREE.Material>(m: T) => {
    m.depthTest = false;
    return mat(m);
  };
  for (const a of spec.areas) {
    flat(a.poly, yOf(a.layer) + lift, onTop(new THREE.MeshBasicMaterial({ color: amber, transparent: true, opacity: 0.28, side: THREE.DoubleSide })), 7);
    const c = a.poly.reduce((s, q) => ({ x: s.x + q.x / a.poly.length, y: s.y + q.y / a.poly.length }), { x: 0, y: 0 });
    anchors.push({ pos: w(c, yOf(a.layer) + lift).toArray() as [number, number, number], text: a.text, kind: 'dim', color: 'var(--field)' });
  }
  for (const p of spec.paths) {
    line(p.pts.map((q) => w(q, yOf(p.layer) + lift)), onTop(new THREE.LineDashedMaterial({ color: amber, dashSize: size / 120, gapSize: size / 200 })), 8);
    const mid = p.pts[Math.floor(p.pts.length / 2)]!;
    anchors.push({ pos: w(mid, yOf(p.layer) + lift).toArray() as [number, number, number], text: p.text, kind: 'dim', color: 'var(--field)' });
  }
  const tick = size / 70;
  for (const dm of spec.dims) {
    const y = yOf(dm.layer) + lift * 3;
    const a = w(dm.a, y);
    const b = w(dm.b, y);
    const dir = b.clone().sub(a).normalize();
    const n = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(tick);
    const m = onTop(new THREE.LineBasicMaterial({ color: '#ffffff' }));
    line([a, b], m, 9);
    line([a.clone().add(n), a.clone().sub(n)], m, 9);
    line([b.clone().add(n), b.clone().sub(n)], m, 9);
    anchors.push({ pos: a.clone().add(b).multiplyScalar(0.5).toArray() as [number, number, number], text: dm.text, kind: 'dim' });
  }
  for (const c of spec.circles) {
    line(circlePoints(c.c, c.r, 48).map((q) => w(q, yOf(c.layer) + lift)), onTop(new THREE.LineDashedMaterial({ color: warn, dashSize: size / 100, gapSize: size / 160 })), 9, true);
    anchors.push({ pos: w({ x: c.c.x, y: c.c.y - c.r }, yOf(c.layer) + lift).toArray() as [number, number, number], text: c.text, kind: 'dim', color: 'var(--warn)' });
  }
  // the spot itself: a ring at the finding, on the source's layer
  const spotY = yOf(L.findIndex((l) => l.name === spec.diag.layer.split(' ')[0]) >= 0 ? L.findIndex((l) => l.name === spec.diag.layer.split(' ')[0]) : 0) + lift * 4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(size / 60, size / 45, 40), onTop(new THREE.MeshBasicMaterial({ color: warn, side: THREE.DoubleSide })));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(w(spec.diag.at, spotY));
  ring.renderOrder = 10;
  group.add(ring);

  // --- label anchors ---------------------------------------------------------------------------------
  for (const l of spec.labels) {
    let y: number;
    if (l.layer === 'parts') {
      const f = board.footprints.find((x) => x.body.center === l.at);
      y = f && f.side === 'bottom' ? bottom - Math.max(0.3, f.height) : top + Math.max(0.3, f?.height ?? 0.5);
    } else y = yOf(l.layer) + ribbonH;
    anchors.push({ pos: w(l.at, y).toArray() as [number, number, number], text: l.text, sub: l.sub, kind: l.kind, color: l.color });
  }

  // camera: obliquely from above and in front, the region filling the view
  const target = w({ x: (reg.x0 + reg.x1) / 2, y: (reg.y0 + reg.y1) / 2 }, (yOf(0) + yOf(L.length - 1)) / 2);
  const dir = new THREE.Vector3(-0.35, 0.82, 0.62).normalize();
  // far enough that the region fits the view (vertical FOV 40°) with some room
  const position = target.clone().addScaledVector(dir, (size / (2 * Math.tan((20 * Math.PI) / 180))) * 1.15 + 8);

  return {
    group,
    anchors,
    target,
    position,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      for (const m of mats) m.dispose();
    },
  };
}

export { rotateKicad };
