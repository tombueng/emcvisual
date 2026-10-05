/**
 * Line spectra of periodic trapezoid signals (docs/stufe-1/PHYSIK.md §3).
 * Amplitudes are RMS values of the sinusoidal components.
 */

export interface Waveform {
  /** Fundamental frequency in Hz (for data: bit rate / 2, worst-case 1010 pattern). */
  f0: number;
  /** Duty cycle τ/T, 0..1. */
  duty: number;
  /** Rise time = fall time, seconds (10–90 % is close enough for the envelope). */
  tr: number;
  /** Amplitude: volts for signal sources, amperes for current loops. */
  amplitude: number;
}

export interface Line {
  /** Frequency in Hz. */
  f: number;
  /**
   * RMS amplitude in the unit of the waveform amplitude (V or A). When the spectrum is
   * thinned out (every k-th harmonic kept), scaled by √k so band powers stay right.
   */
  amp: number;
  /**
   * The line's own amplitude without that scaling, when it differs: what a measuring receiver
   * (120 kHz / 1 MHz bandwidth) shows for one harmonic, so this is what is compared with a limit.
   */
  single?: number;
}

/** Amplitude of one line as a receiver sees it (for limits), see Line.single. */
export const lineAmp = (l: Line) => l.single ?? l.amp;

export interface Band {
  id: string;
  f0: number;
  f1: number;
}

export const BANDS: Band[] = [
  { id: 'all', f0: 0, f1: Infinity },
  { id: 'cispr-low', f0: 30e6, f1: 230e6 },
  { id: 'cispr-high', f0: 230e6, f1: 1e9 },
  { id: 'below-30', f0: 0, f1: 30e6 },
  { id: 'above-1g', f0: 1e9, f1: Infinity },
];

const sinc = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x);

/** Peak Fourier coefficient c_n of the trapezoid (n >= 1). */
export function trapezoidCoefficient(w: Waveform, n: number): number {
  const T = 1 / w.f0;
  return 2 * w.amplitude * w.duty * Math.abs(sinc(n * Math.PI * w.duty)) * Math.abs(sinc((n * Math.PI * w.tr) / T));
}

/**
 * Harmonic lines n·f0 up to fMax (RMS). Lines more than floorDb below the strongest are
 * dropped (this also removes the vanishing even harmonics at 50 % duty).
 */
export function trapezoidLines(w: Waveform, fMax: number, maxLines = 4096, floorDb = -80): Line[] {
  if (!(w.f0 > 0) || !(fMax > 0)) return [];
  const nMax = Math.floor(fMax / w.f0);
  // Slow signals have more harmonics than we keep. Take every step-th harmonic (odd step, so
  // a 50 % duty cycle does not land on its zeros only) and scale it by √step: band powers
  // stay right and the envelope keeps reaching fMax.
  let step = Math.max(1, Math.ceil(nMax / maxLines));
  if (step > 1 && step % 2 === 0) step++;
  const scale = Math.sqrt(step);
  const lines: Line[] = [];
  let peak = 0;
  for (let n = 1; n <= nMax; n += step) {
    const single = trapezoidCoefficient(w, n) / Math.SQRT2;
    const amp = single * (n === 1 ? 1 : scale);
    if (amp > peak) peak = amp;
    lines.push(amp !== single ? { f: n * w.f0, amp, single } : { f: n * w.f0, amp });
  }
  const floor = peak * 10 ** (floorDb / 20);
  return lines.filter((l) => l.amp > floor);
}

/** Envelope corner frequencies of the trapezoid: 1/(πτ) and 1/(π·tr). */
export function trapezoidCorners(w: Waveform): { f1: number; f2: number } {
  return { f1: 1 / (Math.PI * w.duty / w.f0), f2: 1 / (Math.PI * w.tr) };
}

/** Sum of squared amplitudes of the lines inside [f0, f1). */
export function bandPower(lines: Line[], f0: number, f1: number): number {
  let p = 0;
  for (const l of lines) if (l.f >= f0 && l.f < f1) p += l.amp * l.amp;
  return p;
}

/** Scale every line by a frequency-dependent factor (e.g. jωC for a capacitive load). */
export function mapLines(lines: Line[], factor: (f: number) => number): Line[] {
  return lines.map((l) => {
    const k = factor(l.f);
    return l.single !== undefined ? { f: l.f, amp: l.amp * k, single: l.single * k } : { f: l.f, amp: l.amp * k };
  });
}

/**
 * Triangle current of a storage inductor: ripple peak-to-peak A, rising for D·T, falling for
 * (1-D)·T. Peak coefficients c_n = A·|sin(nπD)| / (π² n² D (1-D)); RMS lines, decimated like
 * the trapezoid for very many harmonics.
 */
export function triangleLines(w: Waveform, fMax: number, maxLines = 4096, floorDb = -80): Line[] {
  if (!(w.f0 > 0) || !(fMax > 0)) return [];
  const D = Math.min(0.99, Math.max(0.01, w.duty));
  const nMax = Math.floor(fMax / w.f0);
  let step = Math.max(1, Math.ceil(nMax / maxLines));
  if (step > 1 && step % 2 === 0) step++;
  const scale = Math.sqrt(step);
  const lines: Line[] = [];
  let peak = 0;
  for (let n = 1; n <= nMax; n += step) {
    const c = (w.amplitude * Math.abs(Math.sin(n * Math.PI * D))) / (Math.PI * Math.PI * n * n * D * (1 - D));
    const single = c / Math.SQRT2;
    const amp = single * (n === 1 ? 1 : scale);
    if (amp > peak) peak = amp;
    lines.push(amp !== single ? { f: n * w.f0, amp, single } : { f: n * w.f0, amp });
  }
  const floor = peak * 10 ** (floorDb / 20);
  return lines.filter((l) => l.amp > floor);
}
