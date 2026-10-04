/** Unit helpers: dB conversions and parsing/formatting of engineering values ("25 MHz", "3,3 V"). */

export const C0 = 299_792_458; // m/s
export const MU0 = 4e-7 * Math.PI;
export const ETA0 = 376.730_313;

/** 20·log10(x / ref); -Infinity for 0. */
export const dB20 = (x: number, ref = 1): number => 20 * Math.log10(Math.abs(x) / ref);
/** 10·log10(p / ref) for power-like quantities (squared amplitudes). */
export const dB10 = (p: number, ref = 1): number => 10 * Math.log10(p / ref);

/** H in A/m -> dBµA/m */
export const dBuAm = (h: number): number => dB20(h, 1e-6);
/** |H|² in (A/m)² -> dBµA/m */
export const dBuAmFromSquare = (h2: number): number => 10 * Math.log10(h2) + 120;

const PREFIX: Record<string, number> = {
  f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12,
};

/**
 * Parse "25 MHz", "1ns", "3,3 V", "4.7u", "2e6" into SI. Accepts a decimal comma.
 * Returns NaN when the text is not a number. The unit symbol itself is ignored, so only
 * the prefix matters ("m" is milli; write "M" for mega).
 */
export function parseEng(text: string): number {
  const s = text.trim().replace(',', '.').replace(/\s+/g, '');
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([fpnuµmkKMGT]?)([A-Za-zΩ/%°]*)$/.exec(s);
  if (!m) return NaN;
  const v = Number(m[1]);
  // "m" alone could be metre or milli; treat a bare "m" as milli, "Hz", "s", "V", "A", "F" as units
  return v * (PREFIX[m[2] ?? ''] ?? 1);
}

/** Format a value with an SI prefix: formatEng(2.5e7, 'Hz') -> "25 MHz". German decimal comma. */
export function formatEng(v: number, unit: string, digits = 3): string {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return `0 ${unit}`;
  const exps = [-15, -12, -9, -6, -3, 0, 3, 6, 9, 12];
  const names = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T'];
  const e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3;
  const idx = Math.max(0, Math.min(exps.length - 1, exps.indexOf(e) === -1 ? (e < -15 ? 0 : exps.length - 1) : exps.indexOf(e)));
  const scaled = v / 10 ** exps[idx]!;
  const txt = Number(scaled.toPrecision(digits)).toString().replace('.', ',');
  return `${txt} ${names[idx]}${unit}`;
}
