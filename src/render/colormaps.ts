/**
 * Perceptual colour maps as polynomial fits (inferno: Matt Zucker's fit of the matplotlib
 * map; turbo: Google's published approximation). One source for shaders (LUT texture) and
 * 2D canvases.
 */
export type ColormapId = 'inferno' | 'turbo';

type RGB = [number, number, number];

function inferno(t: number): RGB {
  const c0 = [0.0002189403691192265, 0.001651004631001012, -0.01948089843709184];
  const c1 = [0.1065134194856116, 0.5639564367884091, 3.932712388889277];
  const c2 = [11.60249308247187, -3.972853965665698, -15.9423941062914];
  const c3 = [-41.70399613139459, 17.43639888205313, 44.35414519872813];
  const c4 = [77.162935699427, -33.40235894210092, -81.80730925738993];
  const c5 = [-71.31942824499214, 32.62606426397723, 73.20951985803202];
  const c6 = [25.13112622477341, -12.24266895238567, -23.07032500287172];
  return [0, 1, 2].map(
    (i) => c0[i]! + t * (c1[i]! + t * (c2[i]! + t * (c3[i]! + t * (c4[i]! + t * (c5[i]! + t * c6[i]!))))),
  ) as RGB;
}

function turbo(x: number): RGB {
  const r4 = [0.13572138, 4.6153926, -42.66032258, 132.13108234];
  const g4 = [0.09140261, 2.19418839, 4.84296658, -14.18503333];
  const b4 = [0.1066733, 12.64194608, -60.58204836, 110.36276771];
  const r2 = [-152.94239396, 59.28637943];
  const g2 = [4.27729857, 2.82956604];
  const b2 = [-89.90310912, 27.34824973];
  const v4 = [1, x, x * x, x * x * x];
  const v2 = [v4[2]! * v4[2]!, v4[3]! * v4[2]!];
  const dot = (a: number[], b: number[]) => a.reduce((s, ai, i) => s + ai * b[i]!, 0);
  return [dot(v4, r4) + dot(v2, r2), dot(v4, g4) + dot(v2, g2), dot(v4, b4) + dot(v2, b2)];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function colormap(id: ColormapId, t: number): RGB {
  const x = clamp01(t);
  const c = id === 'turbo' ? turbo(x) : inferno(x);
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
}

/** 256 RGBA entries for a DataTexture. */
export function colormapLut(id: ColormapId): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = colormap(id, i / 255);
    lut[i * 4] = Math.round(r * 255);
    lut[i * 4 + 1] = Math.round(g * 255);
    lut[i * 4 + 2] = Math.round(b * 255);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

export function cssColor(id: ColormapId, t: number): string {
  const [r, g, b] = colormap(id, t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}
