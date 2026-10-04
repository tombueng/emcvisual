/**
 * Electric field of point and line charges (stage 2b). Geometry in mm, charges in C per volt
 * of the source, result in V/m per volt.
 *
 * Line charge λ on a segment A→B, unit vector u, field point P, perpendicular vector ρ from
 * the line to P (|ρ| = d), z1 = -u·(P-A), z2 = -u·(P-B), ra = |P-A|, rb = |P-B|:
 *   E = λ/(4π ε0) · [ ρ/d² · (z2/rb − z1/ra) + u · (1/rb − 1/ra) ]
 * (integral of Coulomb's law along the segment). Inside the core radius the singular terms
 * are capped like in the Biot-Savart kernel.
 */
import { slotOf, STRIDE, type ElementPack } from './images';
import { EPS0 } from './charges';

const K_MM = 1 / (4 * Math.PI * EPS0); // λ in C/m, lengths in mm → see scale factors below

export function addChargesField(data: Float64Array, i0: number, i1: number, px: number, py: number, pz: number, out: Float64Array): void {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (let i = i0; i < i1; i++) {
    const o = i * STRIDE;
    const ax = data[o]!;
    const ay = data[o + 1]!;
    const az = data[o + 2]!;
    const q = data[o + 6]!;
    const r = data[o + 7]!;
    const rax = px - ax;
    const ray = py - ay;
    const raz = pz - az;
    const lx = data[o + 3]! - ax;
    const ly = data[o + 4]! - ay;
    const lz = data[o + 5]! - az;
    const L = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (L < 1e-9) {
      // point charge: q/(4πε0 R²), R in mm → ×1e6 for metres²
      const r2 = Math.max(rax * rax + ray * ray + raz * raz, r * r);
      const k = (q * K_MM * 1e6) / (r2 * Math.sqrt(r2));
      ex += rax * k;
      ey += ray * k;
      ez += raz * k;
      continue;
    }
    const ux = lx / L;
    const uy = ly / L;
    const uz = lz / L;
    const s = rax * ux + ray * uy + raz * uz; // projection of P onto the line from A
    const rhox = rax - s * ux;
    const rhoy = ray - s * uy;
    const rhoz = raz - s * uz;
    const d2 = Math.max(rhox * rhox + rhoy * rhoy + rhoz * rhoz, r * r);
    const z1 = -s;
    const z2 = L - s;
    const ra = Math.sqrt(d2 + z1 * z1);
    const rb = Math.sqrt(d2 + z2 * z2);
    const lambda = q / (L / 1000); // C/m
    const kr = (z2 / rb - z1 / ra) / d2; // 1/mm
    const ku = 1 / rb - 1 / ra; // 1/mm
    const k = lambda * K_MM * 1000; // 1/mm → 1/m
    ex += k * (rhox * kr + ux * ku);
    ey += k * (rhoy * kr + uy * ku);
    ez += k * (rhoz * kr + uz * ku);
  }
  out[0] = out[0]! + ex;
  out[1] = out[1]! + ey;
  out[2] = out[2]! + ez;
}

/** E at p with plane shielding (same slot logic as the magnetic field). */
export function eFieldAt(pack: ElementPack, masks: Uint32Array, px: number, py: number, pz: number, coverBits: number, out: Float64Array): void {
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
    addChargesField(pack.data, i0, i1, px, py, pz, out);
  }
}
