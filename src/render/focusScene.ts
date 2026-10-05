/**
 * Geometry of the problem view (ui/focusData.ts): the copper around one finding, with the layers
 * pulled apart vertically so it reads which plane lies under which track. All copper of the region
 * is drawn in copper: zones as translucent sheets (reference planes with their outlines, so gaps
 * show as holes), tracks, pads and vias solid. The source's current path is polished copper with
 * a rim in its colour, and the detour, the extra loop area, dimensions and circles are drawn on
 * top. Returns the label anchors for the HTML labels.
 */
import * as THREE from 'three';
import { circlePoints, padOutline, rotateKicad } from '../model/geometry';
import type { BoardModel, Vec2 } from '../model/types';
import type { WorldFrame } from '../model/world';
import type { FocusSpec } from '../ui/focusData';
import { colormapLut } from './colormaps';
import { CopperBuilder } from './boardMesh';
import { rasterize } from '../model/planes';
import { t, fmtNum } from '../i18n';

export interface FocusAnchor {
  pos: [number, number, number];
  text: string;
  sub?: string;
  kind: 'net' | 'plane' | 'part' | 'note' | 'dim' | 'fix';
  color?: string;
}

export interface FocusScene {
  group: THREE.Group;
  anchors: FocusAnchor[];
  target: THREE.Vector3;
  position: THREE.Vector3;
  dispose(): void;
}

/** Cables drawn at connectors in the problem view: colour and length, mm. */
const CABLE = new THREE.Color('#f2a33a');
export const CABLE_LEN = 22;
/** Copper as it looks: the region's copper in this tone, the source's path a polished shade of it. */
const COPPER = new THREE.Color('#c8844a');
const COPPER_BRIGHT = new THREE.Color('#e8a466');

export function buildFocusScene(board: BoardModel, frame: WorldFrame, spec: FocusSpec, modelFor?: (ref: string) => THREE.Object3D | undefined): FocusScene {
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

  // --- all copper of the region, in copper -----------------------------------------------------------
  // zones as region-sized textures (robust for any outline), tracks, pads and via rings as flat
  // copper, vias as barrels through the spread stack; reference planes a little stronger and with
  // their outlines, so their gaps read as holes
  const box = { x0: reg.x0 - 2, y0: reg.y0 - 2, x1: reg.x1 + 2, y1: reg.y1 + 2 };
  const near = (x0: number, y0: number, x1: number, y1: number) => x1 >= box.x0 && x0 <= box.x1 && y1 >= box.y0 && y0 <= box.y1;
  const nearPt = (p: Vec2, r: number) => near(p.x - r, p.y - r, p.x + r, p.y + r);
  const ringNear = (ring: Vec2[]) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const q of ring) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    return near(x0, y0, x1, y1);
  };
  const ribbonH = Math.max(0.035, thick * E * 0.012);
  // the top layer brightest, deeper layers a little darker, so the stack reads from above
  const toneOf = (layer: number) => COPPER.clone().multiplyScalar(1 - (0.3 * layer) / Math.max(1, L.length - 1));
  const copperMat = (c: THREE.Color) => mat(new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.5, emissive: c, emissiveIntensity: 0.22, side: THREE.DoubleSide }));
  const sheet = (rings: Vec2[][], y: number, color: THREE.Color, opacity: number) => {
    if (!rings.length) return;
    // 0.1 mm cells for the usual region, coarser (up to 0.25 mm) so a board-wide one stays near
    // a million texels
    const r = rasterize(rings, box, 2 * (box.x1 - box.x0) * (box.y1 - box.y0));
    const rgba = new Uint8Array(r.nx * r.ny * 4).fill(255);
    for (let k = 0; k < r.data.length; k++) rgba[k * 4 + 3] = r.data[k] ? 255 : 0;
    const tex = new THREE.DataTexture(rgba, r.nx, r.ny, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const wR = r.nx * r.cell;
    const hR = r.ny * r.cell;
    const geo = new THREE.PlaneGeometry(wR, hR);
    geo.rotateX(-Math.PI / 2);
    // after the rotation v = 1 lies at -Z, raster row 0 is the smallest board y: flip v
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k));
    const m = mat(
      new THREE.MeshStandardMaterial({ color, map: tex, transparent: true, opacity, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, metalness: 0.35, roughness: 0.5, emissive: color, emissiveIntensity: 0.12 }),
    );
    const quad = new THREE.Mesh(geo, m);
    quad.position.set(r.x0 + wR / 2 - frame.ox, y, r.y0 + hR / 2 - frame.oy);
    quad.renderOrder = 1;
    group.add(quad);
  };
  // the outlines of keyholed rings without their cuts: a cut runs once in each direction
  const outline = (rings: Vec2[][], y: number, material: THREE.LineBasicMaterial) => {
    const pts: THREE.Vector3[] = [];
    const key = (a: Vec2, b: Vec2) => `${a.x.toFixed(4)},${a.y.toFixed(4)},${b.x.toFixed(4)},${b.y.toFixed(4)}`;
    for (const ring of rings) {
      const n = ring.length;
      const edges = new Set<string>();
      for (let i = 0; i < n; i++) edges.add(key(ring[i]!, ring[(i + 1) % n]!));
      for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        if (!edges.has(key(b, a))) pts.push(w(a, y), w(b, y));
      }
    }
    if (!pts.length) return;
    const segs = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), material);
    segs.renderOrder = 2;
    group.add(segs);
  };
  const planeKey = new Set(spec.planes.map((p) => `${p.layer}:${p.net}`));
  const nL = L.length;
  for (let li = 0; li < nL; li++) {
    const tone = toneOf(li);
    const y = yOf(li);
    const planeRings: Vec2[][] = [];
    const otherRings: Vec2[][] = [];
    for (const z of board.zones) {
      if (z.layer !== li) continue;
      const isPlane = planeKey.has(`${li}:${z.net}`);
      for (const ring of z.polygons) if (ringNear(ring)) (isPlane ? planeRings : otherRings).push(ring);
    }
    sheet(planeRings, y, tone, 0.6);
    sheet(otherRings, y, tone, 0.42);
    const bright = tone.clone().lerp(new THREE.Color('#ffd9a8'), 0.45);
    const planeEdge = mat(new THREE.LineBasicMaterial({ color: bright, transparent: true, opacity: 0.9 }));
    const otherEdge = mat(new THREE.LineBasicMaterial({ color: bright, transparent: true, opacity: 0.35 }));
    outline(planeRings, y, planeEdge);
    outline(otherRings, y, otherEdge);
    const cb = new CopperBuilder(y + ribbonH * 0.3, frame, tone);
    for (const tr of board.tracks) {
      if (tr.layer !== li) continue;
      const r = tr.width / 2;
      if (near(Math.min(tr.a.x, tr.b.x) - r, Math.min(tr.a.y, tr.b.y) - r, Math.max(tr.a.x, tr.b.x) + r, Math.max(tr.a.y, tr.b.y) + r)) cb.segment(tr.a, tr.b, tr.width, tr.net);
    }
    for (const p of board.pads) {
      if (!p.layers.includes(li)) continue;
      // through-hole pads on the outer layers only, as the board view draws them
      if (p.kind !== 'smd' && li !== 0 && li !== nL - 1) continue;
      if (!nearPt(p.at, Math.max(p.size.x, p.size.y))) continue;
      const hole = p.drill > 0 && p.drill < Math.min(p.size.x, p.size.y) - 0.02 ? [circlePoints(p.at, p.drill / 2, 16)] : [];
      cb.polygon(padOutline(p), p.net, hole);
    }
    for (const v of board.vias) {
      if ((li !== 0 && li !== nL - 1) || v.fromLayer > li || v.toLayer < li || !nearPt(v.at, v.diameter)) continue;
      cb.polygon(circlePoints(v.at, v.diameter / 2, 18), v.net, [circlePoints(v.at, v.drill / 2, 12)]);
    }
    if (cb.idx.length) {
      const { mesh } = cb.mesh(copperMat(tone));
      mesh.renderOrder = 2;
      group.add(mesh);
    }
  }
  const nearVias = board.vias.flatMap((v, k) => (nearPt(v.at, v.diameter) ? [k] : []));
  if (nearVias.length) {
    const barrels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, true), copperMat(toneOf(Math.floor(nL / 2))), nearVias.length);
    const m4 = new THREE.Matrix4();
    const q0 = new THREE.Quaternion();
    nearVias.forEach((vi, k) => {
      const v = board.vias[vi]!;
      const y0 = yOf(v.toLayer);
      const y1 = yOf(v.fromLayer) + ribbonH * 0.3;
      m4.compose(w(v.at, (y0 + y1) / 2), q0, new THREE.Vector3(v.drill + 0.05, Math.max(0.05, y1 - y0), v.drill + 0.05));
      barrels.setMatrixAt(k, m4);
    });
    barrels.renderOrder = 2;
    group.add(barrels);
  }

  // --- the source's current path: polished copper with a rim in its colour ---------------------------
  // the rim is drawn after the planes and tested only against solid copper, so it shows through the
  // translucent planes; it writes depth with a strict test, so overlapping pieces do not blend twice
  const netSet = new Set(spec.nets);
  const rimW = Math.max(0.12, size / 160);
  const highlight = (c: THREE.Color) => ({
    color: c,
    body: mat(new THREE.MeshStandardMaterial({ color: COPPER_BRIGHT, metalness: 0.4, roughness: 0.36, emissive: COPPER_BRIGHT, emissiveIntensity: 0.25 })),
    rim: mat(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, depthFunc: THREE.LessDepth, side: THREE.DoubleSide })),
    rims: new Map<number, CopperBuilder>(),
  });
  type Highlight = ReturnType<typeof highlight>;
  const rimOf = (h: Highlight, layer: number) => {
    let rb = h.rims.get(layer);
    if (!rb) h.rims.set(layer, (rb = new CopperBuilder(yOf(layer) + ribbonH * 0.6, frame, h.color)));
    return rb;
  };
  const ribbons = (pieces: { a: Vec2; b: Vec2; layer: number; width: number }[], h: Highlight) => {
    for (const tr of pieces) {
      const a = w(tr.a, yOf(tr.layer) + ribbonH / 2);
      const b = w(tr.b, yOf(tr.layer) + ribbonH / 2);
      const lenAB = a.distanceTo(b);
      if (lenAB < 1e-6) continue;
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(lenAB + tr.width, ribbonH, tr.width), h.body);
      ribbon.position.copy(a).add(b).multiplyScalar(0.5);
      ribbon.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      ribbon.renderOrder = 3;
      group.add(ribbon);
      rimOf(h, tr.layer).segment(tr.a, tr.b, tr.width + 2 * rimW, 0);
    }
  };
  const finish = (h: Highlight) => {
    for (const rb of h.rims.values()) {
      if (!rb.idx.length) continue;
      const { mesh } = rb.mesh(h.rim);
      mesh.renderOrder = 5;
      group.add(mesh);
    }
  };
  const ownHl = highlight(new THREE.Color(spec.color));
  // the current path of the model (for a loop only the loop); whole nets when there is none
  ribbons(spec.path.length ? spec.path : board.tracks.filter((tr) => netSet.has(tr.net)).map((tr) => ({ a: tr.a, b: tr.b, layer: tr.layer, width: tr.width })), ownHl);
  // the net's pads in the region, raised a little, with the rim around them
  const ownPads = new Map<number, CopperBuilder>();
  for (const p of board.pads) {
    if (!netSet.has(p.net) || !nearPt(p.at, Math.max(p.size.x, p.size.y))) continue;
    for (const li of p.layers) {
      if (p.kind !== 'smd' && li !== 0 && li !== nL - 1) continue;
      let pb = ownPads.get(li);
      if (!pb) ownPads.set(li, (pb = new CopperBuilder(yOf(li) + ribbonH, frame, ownHl.color)));
      const hole = p.drill > 0 && p.drill < Math.min(p.size.x, p.size.y) - 0.02 ? [circlePoints(p.at, p.drill / 2, 16)] : [];
      pb.polygon(padOutline(p), p.net, hole);
      rimOf(ownHl, li).polygon(padOutline({ ...p, size: { x: p.size.x + 2 * rimW, y: p.size.y + 2 * rimW } }), p.net);
    }
  }
  for (const pb of ownPads.values()) {
    const { mesh } = pb.mesh(ownHl.body);
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  // the vias the current changes layers through: a rim at both ends
  for (const vi of spec.vias) {
    const v = board.vias[vi]!;
    for (const li of [v.fromLayer, v.toLayer]) rimOf(ownHl, li).polygon(circlePoints(v.at, v.diameter / 2 + rimW, 18), v.net, [circlePoints(v.at, v.diameter / 2, 18)]);
  }
  finish(ownHl);
  // further nets with a rim in their own colour (the I/O line a clock couples into)
  for (const o of spec.others ?? []) {
    const h = highlight(new THREE.Color(o.color));
    ribbons(o.pieces, h);
    finish(h);
  }
  // cables leaving at the connectors: the antenna of common mode
  const cableMat = mat(new THREE.MeshStandardMaterial({ color: CABLE, emissive: CABLE, emissiveIntensity: 0.25, roughness: 0.6, transparent: true, opacity: 0.9 }));
  for (const cab of spec.cables ?? []) {
    const y = yOf(0) + 1.2;
    const a = w(cab.at, y);
    const b = w({ x: cab.at.x + cab.dir.x * CABLE_LEN, y: cab.at.y + cab.dir.y * CABLE_LEN }, y);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, a.distanceTo(b), 16), cableMat);
    tube.position.copy(a).add(b).multiplyScalar(0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    tube.renderOrder = 3;
    group.add(tube);
  }

  // --- part bodies: real models where loaded, else boxes ----------------------------------------------
  const top = yOf(0) + ribbonH;
  const bottom = yOf(L.length - 1);
  const bodyMat = mat(new THREE.MeshStandardMaterial({ color: '#3a4553', roughness: 0.6, transparent: true, opacity: 0.8 }));
  const bodyEdge = mat(new THREE.LineBasicMaterial({ color: '#9fb0c2', transparent: true, opacity: 0.7 }));
  for (const fi of spec.parts) {
    const f = board.footprints[fi]!;
    const node = modelFor?.(f.ref);
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
  // --- where the problem adds field: a coloured map just above the top copper -----------------------
  const fm = spec.field;
  if (fm && fm.nx > 1 && fm.ny > 1) {
    const data = new Uint8Array(fm.nx * fm.ny * 4);
    const lut = colormapLut('inferno');
    for (let k = 0; k < fm.values.length; k++) {
      const v = fm.values[k]!;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (Number.isFinite(v)) {
        if (fm.mode === 'added') {
          // transparent where nothing is added, amber → red where much is; scaled to the top
          // 15 dB of this case (full scale at least 15 dB), so a problem that adds field
          // everywhere still shows where it adds most, and faded out where the source's field
          // is weak, since many dB of almost nothing do not matter
          const hi = Math.max(15, fm.max.value);
          const x = Math.max(0, Math.min(1, (v - (hi - 15)) / 15));
          const lv = fm.level[k]!;
          const weight = Number.isFinite(lv) ? Math.max(0, Math.min(1, (lv - fm.floor + 10) / 10)) : 0;
          r = 242 + (255 - 242) * x;
          g = 163 - 100 * x;
          b = 58 - 20 * x;
          a = x < 0.03 ? 0 : (20 + 140 * x * x) * weight;
        } else {
          const x = Math.max(0, Math.min(1, (v + 30) / 30));
          const i4 = Math.round(x * 255) * 4;
          r = lut[i4]!;
          g = lut[i4 + 1]!;
          b = lut[i4 + 2]!;
          a = x < 0.05 ? 0 : 12 + 105 * x * x;
        }
      }
      data.set([r, g, b, a], k * 4);
    }
    const tex = new THREE.DataTexture(data, fm.nx, fm.ny, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const wR = fm.region.x1 - fm.region.x0;
    const hR = fm.region.y1 - fm.region.y0;
    // translucent, so the copper under it stays readable; part bodies in front of it hide it
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(wR, hR), mat(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    // texture row 0 is region.y0 (KiCad y down = world +z); the plane's v runs along -z after rotation
    plane.rotation.x = Math.PI / 2;
    plane.position.copy(w({ x: (fm.region.x0 + fm.region.x1) / 2, y: (fm.region.y0 + fm.region.y1) / 2 }, top + ribbonH * 2));
    plane.renderOrder = 6;
    group.add(plane);
    if (Number.isFinite(fm.max.value))
      anchors.push({
        pos: w({ x: fm.max.x, y: fm.max.y }, top + ribbonH * 2).toArray() as [number, number, number],
        text: fm.mode === 'added' ? t.focus.fieldAdded(fmtNum(fm.max.value, 1), fmtNum(fm.height, 0)) : t.focus.fieldSource(fmtNum(fm.height, 0)),
        kind: 'dim',
        color: fm.mode === 'added' ? 'var(--warn)' : 'var(--field)',
      });
  }

  // --- the best fix, in green at its place -------------------------------------------------------------
  const ok = new THREE.Color('#6ee7a8');
  const ghost = onTop(new THREE.MeshStandardMaterial({ color: ok, emissive: ok, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 }));
  for (const sg of spec.suggestions) {
    const y = sg.kind === 'area' ? yOf(sg.layer) + lift : top;
    if (sg.kind === 'area' && sg.poly) {
      flat(sg.poly, yOf(sg.layer) + lift * 2, onTop(new THREE.MeshBasicMaterial({ color: ok, transparent: true, opacity: 0.18, side: THREE.DoubleSide })), 8);
      line(sg.poly.map((q) => w(q, yOf(sg.layer) + lift * 2)), onTop(new THREE.LineDashedMaterial({ color: ok, dashSize: size / 90, gapSize: size / 150 })), 9, true);
    } else {
      const s = Math.max(1, size / 40);
      const geo =
        sg.kind === 'via'
          ? new THREE.CylinderGeometry(0.3 * s, 0.3 * s, Math.max(0.5, yOf(0) - yOf(L.length - 1)), 16)
          : new THREE.BoxGeometry(1.0 * s, 0.5 * s, 0.5 * s);
      const mesh = new THREE.Mesh(geo, ghost);
      mesh.position.copy(w(sg.at, sg.kind === 'via' ? (yOf(0) + yOf(L.length - 1)) / 2 : top + 0.25 * s));
      mesh.renderOrder = 10;
      group.add(mesh);
      const ringG = new THREE.Mesh(new THREE.RingGeometry(0.9 * s, 1.1 * s, 32), onTop(new THREE.MeshBasicMaterial({ color: ok, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })));
      ringG.rotation.x = -Math.PI / 2;
      ringG.position.copy(w(sg.at, top + 0.02));
      ringG.renderOrder = 10;
      group.add(ringG);
    }
    anchors.push({ pos: w(sg.at, y).toArray() as [number, number, number], text: sg.text, kind: 'fix', color: 'var(--ok)' });
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
