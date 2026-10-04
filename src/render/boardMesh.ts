/** Three.js geometry for a BoardModel: substrate, copper per layer, vias, component bodies. */
import * as THREE from 'three';
import { rotateKicad } from '../model/geometry';
import type { BoardModel, Pad, Vec2 } from '../model/types';
import type { WorldFrame } from '../model/world';
import { rasterize, type CoverageRaster } from '../model/planes';

/** Zones with more outline points than this are drawn as a texture instead of triangles. */
const ZONE_TEXTURE_POINTS = 3000;
const MAX_TEXTURE = 4096;

export interface BoardMeshes {
  group: THREE.Group;
  substrate: THREE.Mesh;
  layers: THREE.Mesh[];
  vias: THREE.InstancedMesh | null;
  components: THREE.InstancedMesh | null;
  /** Per layer: net id per vertex (for picking and highlighting). */
  netIds: Float32Array[];
  baseColors: Float32Array[];
  dispose(): void;
}

const LAYER_COLORS = ['#d39a4a', '#c9b458', '#b97ad1', '#5aa0d6', '#7cc28a', '#d07a7a', '#c0c0c0', '#e0a0ff'];

function layerColor(index: number, count: number): THREE.Color {
  if (index === 0) return new THREE.Color('#d8a250');
  if (index === count - 1) return new THREE.Color('#6fa6d8');
  return new THREE.Color(LAYER_COLORS[(index % (LAYER_COLORS.length - 1)) + 1]!);
}

class Builder {
  pos: number[] = [];
  col: number[] = [];
  net: number[] = [];
  idx: number[] = [];
  constructor(
    private y: number,
    private frame: WorldFrame,
    private color: THREE.Color,
  ) {}

  private vertex(p: Vec2, net: number): number {
    this.pos.push(p.x - this.frame.ox, this.y, p.y - this.frame.oy);
    this.col.push(this.color.r, this.color.g, this.color.b);
    this.net.push(net);
    return this.pos.length / 3 - 1;
  }

  polygon(contour: Vec2[], net: number, holes: Vec2[][] = []) {
    if (contour.length < 3) return;
    const c2 = contour.map((p) => new THREE.Vector2(p.x, p.y));
    const h2 = holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y)));
    const tris = THREE.ShapeUtils.triangulateShape(c2, h2);
    const all = [...contour, ...holes.flat()];
    const base = this.pos.length / 3;
    for (const p of all) this.vertex(p, net);
    for (const t of tris) this.idx.push(base + t[0]!, base + t[1]!, base + t[2]!);
  }

  fan(points: Vec2[], net: number) {
    if (points.length < 3) return;
    const base = this.pos.length / 3;
    for (const p of points) this.vertex(p, net);
    for (let k = 1; k + 1 < points.length; k++) this.idx.push(base, base + k, base + k + 1);
  }

  segment(a: Vec2, b: Vec2, width: number, net: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    const hw = width / 2;
    if (L > 1e-9) {
      const nx = (-dy / L) * hw;
      const ny = (dx / L) * hw;
      this.fan([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }], net);
    }
    this.fan(circle(a, hw, 10), net);
    this.fan(circle(b, hw, 10), net);
  }

  mesh(material: THREE.Material): { mesh: THREE.Mesh; nets: Float32Array; colors: Float32Array } {
    const g = new THREE.BufferGeometry();
    const colors = new Float32Array(this.col);
    const nets = new Float32Array(this.net);
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors.slice(), 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // flat copper: force upward normals (double-sided material flips them for the underside)
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return { mesh: new THREE.Mesh(g, material), nets, colors };
  }
}

function circle(c: Vec2, r: number, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

export function padOutline(p: Pad): Vec2[] {
  const hx = p.size.x / 2;
  const hy = p.size.y / 2;
  let local: Vec2[];
  if (p.shape === 'circle') {
    local = circle({ x: 0, y: 0 }, hx, 20);
  } else if (p.shape === 'oval') {
    const r = Math.min(hx, hy);
    const ax = hx - r;
    const ay = hy - r;
    local = [];
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / 10;
      local.push(hx >= hy ? { x: ax + r * Math.cos(a), y: r * Math.sin(a) } : { x: r * Math.sin(a), y: ay + r * Math.cos(a) });
    }
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI / 2 + (Math.PI * k) / 10;
      local.push(hx >= hy ? { x: -ax + r * Math.cos(a), y: r * Math.sin(a) } : { x: r * Math.sin(a), y: -ay + r * Math.cos(a) });
    }
  } else {
    local = [{ x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy }];
  }
  return local.map((q) => {
    const r = rotateKicad(q, p.angle);
    return { x: p.at.x + r.x, y: p.at.y + r.y };
  });
}

export function buildBoardMeshes(board: BoardModel, frame: WorldFrame): BoardMeshes {
  const group = new THREE.Group();
  const nL = board.layers.length;
  const top = board.layers[0]!;
  const bottom = board.layers[nL - 1]!;
  const topY = top.y + top.thickness / 2;
  const bottomY = nL > 1 ? bottom.y - bottom.thickness / 2 : top.y - board.thickness;

  // substrate: outline extruded between the outer copper layers
  const [outer, ...holes] = board.outline;
  const shape = new THREE.Shape(outer!.map((p) => new THREE.Vector2(p.x - frame.ox, -(p.y - frame.oy))));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x - frame.ox, -(p.y - frame.oy)))));
  const sub = new THREE.ExtrudeGeometry(shape, { depth: topY - bottomY - 0.004, bevelEnabled: false, curveSegments: 12 });
  sub.rotateX(-Math.PI / 2);
  sub.translate(0, bottomY + 0.002, 0);
  const substrateMat = new THREE.MeshStandardMaterial({ color: '#1f5135', roughness: 0.75, metalness: 0.05, transparent: true, opacity: 1 });
  const substrate = new THREE.Mesh(sub, substrateMat);
  substrate.name = 'substrate';
  group.add(substrate);

  // copper per layer
  const copperMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide });
  const layers: THREE.Mesh[] = [];
  const netIds: Float32Array[] = [];
  const baseColors: Float32Array[] = [];
  for (const layer of board.layers) {
    const i = layer.index;
    const y = i === 0 ? topY + 0.005 : i === nL - 1 ? bottomY - 0.005 : layer.y;
    const b = new Builder(y, frame, layerColor(i, nL));
    const bigZones: typeof board.zones = [];
    for (const z of board.zones) {
      if (z.layer !== i) continue;
      const points = z.polygons.reduce((n, r) => n + r.length, 0);
      if (points > ZONE_TEXTURE_POINTS) bigZones.push(z);
      else for (const ring of z.polygons) b.polygon(ring, z.net);
    }
    for (const t of board.tracks) if (t.layer === i) b.segment(t.a, t.b, t.width, t.net);
    for (const p of board.pads) {
      if (!p.layers.includes(i)) continue;
      if (p.kind !== 'smd' && i !== 0 && i !== nL - 1) continue;
      b.fan(padOutline(p), p.net);
    }
    for (const v of board.vias) if ((i === 0 || i === nL - 1) && v.fromLayer <= i && v.toLayer >= i) b.fan(circle(v.at, v.diameter / 2, 12), v.net);
    const { mesh, nets, colors } = b.mesh(copperMat);
    for (const z of bigZones) mesh.add(zoneQuad(z.polygons, z.net, y, frame, layerColor(i, nL), board.bbox));
    mesh.name = `copper:${layer.name}`;
    mesh.userData.layer = i;
    mesh.renderOrder = 1;
    layers.push(mesh);
    netIds.push(nets);
    baseColors.push(colors);
    group.add(mesh);
  }

  // vias as cylinders through their span
  let vias: THREE.InstancedMesh | null = null;
  if (board.vias.length) {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true);
    vias = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#c7964e', metalness: 0.7, roughness: 0.35 }), board.vias.length);
    const m = new THREE.Matrix4();
    board.vias.forEach((v, k) => {
      const y0 = board.layers[v.fromLayer]!.y + (v.fromLayer === 0 ? top.thickness / 2 : 0);
      const y1 = board.layers[v.toLayer]!.y - (v.toLayer === nL - 1 ? bottom.thickness / 2 : 0);
      const h = Math.max(0.01, y0 - y1);
      m.compose(
        new THREE.Vector3(v.at.x - frame.ox, (y0 + y1) / 2, v.at.y - frame.oy),
        new THREE.Quaternion(),
        new THREE.Vector3(v.drill + 0.05, h, v.drill + 0.05),
      );
      vias!.setMatrixAt(k, m);
    });
    vias.name = 'vias';
    group.add(vias);
  }

  // component bodies (no 3D models in the browser: boxes from the courtyard)
  let components: THREE.InstancedMesh | null = null;
  const bodies = board.footprints.filter((f) => f.height > 0 && f.body.size.x > 0 && f.body.size.y > 0);
  if (bodies.length) {
    components = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.88 }),
      bodies.length,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    bodies.forEach((f, k) => {
      const shrink = 0.85; // courtyards include clearance
      const h = f.height;
      const y = f.side === 'top' ? topY + h / 2 : bottomY - h / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (f.body.angle * Math.PI) / 180);
      m.compose(
        new THREE.Vector3(f.body.center.x - frame.ox, y, f.body.center.y - frame.oy),
        q,
        new THREE.Vector3(f.body.size.x * shrink, h, f.body.size.y * shrink),
      );
      components!.setMatrixAt(k, m);
    });
    components.name = 'components';
    components.userData.footprints = bodies;
    group.add(components);
  }

  return {
    group,
    substrate,
    layers,
    vias,
    components,
    netIds,
    baseColors,
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}

/**
 * A large zone as one textured quad: triangulating planes with tens of thousands of points
 * took most of the load time on big boards. The coverage raster doubles as an alpha mask
 * and lets picking test the actual copper under the pointer.
 */
function zoneQuad(rs: Vec2[][], net: number, y: number, frame: WorldFrame, color: THREE.Color, bbox: BoardModel['bbox']): THREE.Mesh {
  const area = Math.max(1, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0));
  let raster: CoverageRaster = rasterize(rs, bbox, area);
  // keep the texture within GPU limits on long boards
  let scale = 1;
  while ((raster.nx > MAX_TEXTURE || raster.ny > MAX_TEXTURE) && scale < 8) {
    scale *= 2;
    raster = rasterize(rs, bbox, area * scale * scale * 4);
  }
  const rgba = new Uint8Array(raster.nx * raster.ny * 4);
  const r8 = Math.round(color.r * 255);
  const g8 = Math.round(color.g * 255);
  const b8 = Math.round(color.b * 255);
  for (let k = 0; k < raster.data.length; k++) {
    rgba[k * 4] = r8;
    rgba[k * 4 + 1] = g8;
    rgba[k * 4 + 2] = b8;
    rgba[k * 4 + 3] = raster.data[k] ? 255 : 0;
  }
  const tex = new THREE.DataTexture(rgba, raster.nx, raster.ny, THREE.RGBAFormat);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const w = raster.nx * raster.cell;
  const h = raster.ny * raster.cell;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide });
  const quad = new THREE.Mesh(geo, mat);
  // after the rotation v = 1 lies at -Z, but raster row 0 (texture v = 0) is the smallest board
  // y, i.e. -Z: flip v
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k));
  quad.position.set(raster.x0 + w / 2 - frame.ox, y, raster.y0 + h / 2 - frame.oy);
  quad.userData.zone = { net, raster };
  return quad;
}

/** Recolour copper: highlighted nets bright, others dimmed (or reset with null). */
export function highlightNets(b: BoardMeshes, nets: Set<number> | null, color = new THREE.Color('#fff2a8')) {
  b.layers.forEach((mesh, i) => {
    const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const base = b.baseColors[i]!;
    const ids = b.netIds[i]!;
    const arr = attr.array as Float32Array;
    for (let v = 0; v < ids.length; v++) {
      if (!nets) {
        arr[v * 3] = base[v * 3]!;
        arr[v * 3 + 1] = base[v * 3 + 1]!;
        arr[v * 3 + 2] = base[v * 3 + 2]!;
      } else if (nets.has(ids[v]!)) {
        arr[v * 3] = color.r;
        arr[v * 3 + 1] = color.g;
        arr[v * 3 + 2] = color.b;
      } else {
        arr[v * 3] = base[v * 3]! * 0.45;
        arr[v * 3 + 1] = base[v * 3 + 1]! * 0.45;
        arr[v * 3 + 2] = base[v * 3 + 2]! * 0.45;
      }
    }
    attr.needsUpdate = true;
    for (const child of mesh.children) {
      const zone = child.userData.zone as { net: number } | undefined;
      if (!zone) continue;
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (!nets) mat.color.setScalar(1);
      else if (nets.has(zone.net)) mat.color.copy(color);
      else mat.color.setScalar(0.45);
    }
  });
}
