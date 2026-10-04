/** Field lines as line segments with a light pulse travelling along the field direction. */
import * as THREE from 'three';
import type { TracedLines } from '../compute/fieldlines';

const vertex = /* glsl */ `
attribute float arc;
attribute float mag;
varying float vArc;
varying float vMag;
void main() {
  vArc = arc;
  vMag = mag;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
uniform vec3 color;
uniform float time;
uniform float magLo;
uniform float magHi;
varying float vArc;
varying float vMag;
void main() {
  float s = clamp((log(max(vMag, 1e-12)) - magLo) / max(magHi - magLo, 1e-3), 0.0, 1.0);
  float pulse = pow(1.0 - fract(vArc / 2.5 - time * 0.6), 6.0);
  float a = (0.25 + 0.75 * s) * (0.35 + 0.65 * pulse);
  gl_FragColor = vec4(color * (0.6 + 0.8 * pulse), a);
}
`;

export function buildFieldLines(t: TracedLines, color: string): THREE.LineSegments {
  const nLines = t.offsets.length - 1;
  let nSeg = 0;
  for (let i = 0; i < nLines; i++) nSeg += Math.max(0, t.offsets[i + 1]! - t.offsets[i]! - 1);
  const pos = new Float32Array(nSeg * 6);
  const arc = new Float32Array(nSeg * 2);
  const mag = new Float32Array(nSeg * 2);
  let k = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < nLines; i++) {
    for (let v = t.offsets[i]!; v + 1 < t.offsets[i + 1]!; v++) {
      for (const [j, src] of [[0, v], [1, v + 1]] as const) {
        pos.set(t.positions.subarray(src * 3, src * 3 + 3), (k * 2 + j) * 3);
        arc[k * 2 + j] = t.arc[src]!;
        mag[k * 2 + j] = t.mags[src]!;
        const l = Math.log(Math.max(t.mags[src]!, 1e-12));
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      }
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('arc', new THREE.BufferAttribute(arc, 1));
  g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      color: { value: new THREE.Color(color) },
      time: { value: 0 },
      magLo: { value: Number.isFinite(lo) ? lo : 0 },
      magHi: { value: Number.isFinite(hi) ? hi : 1 },
    },
  });
  const lines = new THREE.LineSegments(g, m);
  lines.renderOrder = 6;
  lines.frustumCulled = false;
  return lines;
}
