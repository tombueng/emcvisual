/**
 * Biot-Savart field of straight current filaments (docs/stage-1/PHYSICS.md §7).
 * Geometry in mm, result in A/m per ampere of reference current.
 */
import { STRIDE, slotOf, type ElementPack } from './images';

const INV4PI_MM = 1000 / (4 * Math.PI); // 1/(4π) and mm -> m

/**
 * Add the field of elements [i0, i1) of a pack at point p to out (Hx, Hy, Hz).
 * Hanson & Hirshman closed form with core regularisation inside radius r.
 */
export function addElementsField(
  data: Float64Array,
  i0: number,
  i1: number,
  px: number,
  py: number,
  pz: number,
  out: Float64Array,
): void {
  let hx = 0;
  let hy = 0;
  let hz = 0;
  for (let i = i0; i < i1; i++) {
    const o = i * STRIDE;
    const ax = data[o]!;
    const ay = data[o + 1]!;
    const az = data[o + 2]!;
    const ex0 = data[o + 3]! - ax;
    const ey0 = data[o + 4]! - ay;
    const ez0 = data[o + 5]! - az;
    const L = Math.sqrt(ex0 * ex0 + ey0 * ey0 + ez0 * ez0);
    if (L < 1e-9) continue;
    const ex = ex0 / L;
    const ey = ey0 / L;
    const ez = ez0 / L;
    const rax = px - ax;
    const ray = py - ay;
    const raz = pz - az;
    const rbx = rax - ex0;
    const rby = ray - ey0;
    const rbz = raz - ez0;
    // e x Ra
    const cx = ey * raz - ez * ray;
    const cy = ez * rax - ex * raz;
    const cz = ex * ray - ey * rax;
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 < 1e-18) continue;
    const ra = Math.sqrt(rax * rax + ray * ray + raz * raz);
    const rb = Math.sqrt(rbx * rbx + rby * rby + rbz * rbz);
    const s = ra + rb;
    const den = ra * rb * (s * s - L * L);
    if (den <= 0) continue;
    let k = (data[o + 6]! * 2 * L * s) / den;
    const r = data[o + 7]!;
    const r2 = r * r;
    if (d2 < r2) k *= d2 / r2;
    hx += cx * k;
    hy += cy * k;
    hz += cz * k;
  }
  out[0] = out[0]! + hx * INV4PI_MM;
  out[1] = out[1]! + hy * INV4PI_MM;
  out[2] = out[2]! + hz * INV4PI_MM;
}

/** Bit mask of the planes lying between slot s and slot t (planes indexed top to bottom). */
export function slotMaskTable(planes: number): Uint32Array {
  const slots = planes + 1;
  const t = new Uint32Array(slots * slots);
  for (let s = 0; s < slots; s++)
    for (let u = 0; u < slots; u++) {
      let m = 0;
      for (let p = Math.min(s, u); p < Math.max(s, u); p++) m |= 1 << p;
      t[s * slots + u] = m >>> 0;
    }
  return t;
}

/**
 * Field of a whole pack at p, honouring plane shielding: coverBits says which planes have
 * copper in the column of p (bit i = plane i, top to bottom).
 */
export function fieldAt(
  pack: ElementPack,
  masks: Uint32Array,
  px: number,
  py: number,
  pz: number,
  coverBits: number,
  out: Float64Array,
): void {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  const slots = pack.planeY.length + 1;
  const ps = slotOf(pack.planeY, py);
  for (let s = 0; s < slots; s++) {
    const i0 = pack.slotStart[s]!;
    const i1 = pack.slotStart[s + 1]!;
    if (i0 === i1) continue;
    if (s !== ps && (coverBits & masks[s * slots + ps]!) !== 0) continue;
    addElementsField(pack.data, i0, i1, px, py, pz, out);
  }
}
