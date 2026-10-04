/**
 * Isosurfaces of the field volume ("bubbles" at chosen dB levels, docs W2), built with naive
 * surface nets: one vertex per cell that the surface crosses (the mean of the edge crossings),
 * one quad per crossed grid edge. Smooth enough for a glowing shell and cheap to rebuild when
 * the field changes. Works in VR, where the ray-marched volume does not.
 */
import * as THREE from 'three';
import type { Grid } from '../compute/grid';

/** Triangles (world positions, normals) of the surface where the volume crosses `level`. */
export function surfaceNets(vol: Uint8Array, g: Grid, level: number): { positions: Float32Array; normals: Float32Array } | null {
  const { nx, ny, nz } = g;
  const at = (x: number, y: number, z: number) => vol[x + nx * (y + ny * z)]!;
  // vertex index per cell (cells are (nx-1)·(ny-1)·(nz-1)), -1 when the cell is not crossed
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  if (cx < 1 || cy < 1 || cz < 1) return null;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const verts: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], // along x
    [0, 2], [1, 3], [4, 6], [5, 7], // along y
    [0, 4], [1, 5], [2, 6], [3, 7], // along z
  ];
  const off = (c: number) => [c & 1, (c >> 1) & 1, (c >> 2) & 1] as const;
  for (let z = 0; z < cz; z++)
    for (let y = 0; y < cy; y++)
      for (let x = 0; x < cx; x++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const [dx, dy, dz] = off(c);
          corner[c] = at(x + dx, y + dy, z + dz);
          if (corner[c]! >= level) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a!]!;
          const vb = corner[b!]!;
          if (va >= level === vb >= level) continue;
          const t = (level - va) / (vb - va);
          const [ax, ay, az] = off(a!);
          const [bx, by, bz] = off(b!);
          sx += ax + t * (bx - ax);
          sy += ay + t * (by - ay);
          sz += az + t * (bz - az);
          n++;
        }
        cellVert[x + cx * (y + cy * z)] = verts.length / 3;
        verts.push(g.x0 + (x + sx / n) * g.dx, g.y0 + (y + sy / n) * g.dy, g.z0 + (z + sz / n) * g.dz);
      }
  if (verts.length === 0) return null;

  // a quad for every grid edge with a sign change, between the four cells around it
  const tris: number[] = [];
  const cell = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= cx || y >= cy || z >= cz ? -1 : cellVert[x + cx * (y + cy * z)]!);
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const v0 = at(x, y, z) >= level;
        if (x + 1 < nx && v0 !== at(x + 1, y, z) >= level) quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), v0);
        if (y + 1 < ny && v0 !== at(x, y + 1, z) >= level) quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), v0);
        if (z + 1 < nz && v0 !== at(x, y, z + 1) >= level) quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), v0);
      }
  if (tris.length === 0) return null;
  const positions = new Float32Array(tris.length * 3);
  tris.forEach((vi, i) => {
    positions[i * 3] = verts[vi * 3]!;
    positions[i * 3 + 1] = verts[vi * 3 + 1]!;
    positions[i * 3 + 2] = verts[vi * 3 + 2]!;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const normals = (geo.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
  geo.dispose();
  return { positions, normals };
}

export interface IsoLevel {
  /** Byte level in the normalised volume (0..255). */
  level: number;
  color: THREE.Color;
  opacity: number;
}

/** Translucent shells, outermost first so the inner ones show through. */
export function buildIsosurfaces(vol: Uint8Array, g: Grid, levels: IsoLevel[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'isosurfaces';
  levels.forEach((l, i) => {
    const s = surfaceNets(vol, g, l.level);
    if (!s) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
    const mat = new THREE.MeshStandardMaterial({
      color: l.color,
      emissive: l.color,
      emissiveIntensity: 0.6,
      roughness: 0.6,
      metalness: 0,
      transparent: true,
      opacity: l.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 10 + i;
    group.add(mesh);
  });
  return group;
}
