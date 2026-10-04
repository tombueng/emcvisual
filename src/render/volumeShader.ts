/**
 * Full-screen composite pass: reads the opaque scene (colour + depth) and ray-marches the
 * field volume up to the scene depth (docs/stufe-1/ARCHITEKTUR.md §5).
 */
export const volumeVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const volumeFragment = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler3D tVolume;
uniform sampler2D tLut;
uniform mat4 projInv;
uniform mat4 viewInv;
uniform vec3 boxMin;
uniform vec3 boxMax;
uniform vec2 window;
uniform float density;
uniform float gammaA;
uniform float stepSize;
uniform int maxSteps;
uniform bool volumeOn;

in vec2 vUv;
out vec4 fragColor;

vec3 worldFromNdc(vec3 ndc) {
  vec4 v = projInv * vec4(ndc, 1.0);
  v /= v.w;
  return (viewInv * v).xyz;
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 scene = texture(tColor, vUv);
  if (!volumeOn) {
    fragColor = vec4(toSRGB(scene.rgb), 1.0);
    return;
  }
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 pNear = worldFromNdc(vec3(ndc, -1.0));
  vec3 pFar = worldFromNdc(vec3(ndc, 1.0));
  vec3 ro = pNear;
  vec3 rd = normalize(pFar - pNear);

  float depth = texture(tDepth, vUv).r;
  float tScene = 1e9;
  if (depth < 1.0) {
    vec3 pS = worldFromNdc(vec3(ndc, depth * 2.0 - 1.0));
    tScene = dot(pS - ro, rd);
  }

  vec3 inv = 1.0 / rd;
  vec3 ta = (boxMin - ro) * inv;
  vec3 tb = (boxMax - ro) * inv;
  vec3 tmin = min(ta, tb);
  vec3 tmax = max(ta, tb);
  float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float tExit = min(min(tmax.x, tmax.y), tmax.z);
  tExit = min(tExit, tScene);
  if (tExit <= tEnter) {
    fragColor = vec4(toSRGB(scene.rgb), 1.0);
    return;
  }

  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 size = boxMax - boxMin;
  vec3 acc = vec3(0.0);
  float alpha = 0.0;
  float t = tEnter + jitter * stepSize;
  float span = max(window.y - window.x, 1e-3);
  for (int i = 0; i < 1024; i++) {
    if (i >= maxSteps || t > tExit) break;
    vec3 p = ro + rd * t;
    float v = texture(tVolume, (p - boxMin) / size).r;
    float x = (v - window.x) / span;
    if (x > 0.0) {
      x = min(x, 1.0);
      vec3 c = texture(tLut, vec2(x, 0.5)).rgb;
      float a = 1.0 - exp(-density * pow(x, gammaA) * stepSize);
      acc += (1.0 - alpha) * a * c;
      alpha += (1.0 - alpha) * a;
      if (alpha > 0.985) break;
    }
    t += stepSize;
  }
  // mostly emissive: the glow adds light and only partly hides what is behind it
  fragColor = vec4(toSRGB(scene.rgb * (1.0 - 0.55 * alpha) + acc), 1.0);
}
`;

export const sliceVertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const sliceFragment = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D tVolume;
uniform sampler2D tLut;
uniform vec3 boxMin;
uniform vec3 boxMax;
uniform vec2 window;
uniform float opacity;
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 tc = (vWorld - boxMin) / (boxMax - boxMin);
  float v = texture(tVolume, tc).r;
  float x = clamp((v - window.x) / max(window.y - window.x, 1e-3), 0.0, 1.0);
  vec3 c = texture(tLut, vec2(x, 0.5)).rgb;
  float a = opacity * smoothstep(0.02, 0.45, x);
  fragColor = vec4(c, a);
}
`;
