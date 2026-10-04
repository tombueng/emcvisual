/**
 * Fitting the sources to a measurement (stage 5, docs/zukunft/STUFE-5-MESSUNG-ERWEITERT.md):
 * a scan measures magnitudes only, but sources add up in power (incoherently, as in the
 * simulation). So the measured power at every point is a non-negative mix of the simulated
 * per-source powers: M_i ≈ Σ_s a_s·P_si. The factors a_s (in dB: how much louder a source is
 * in reality than in the model) follow from non-negative least squares with relative weights,
 * so weak and strong points count alike. What the fit cannot explain points to sources the
 * model does not have.
 */

/** Lawson–Hanson non-negative least squares: min ‖A·x − b‖, x ≥ 0 (A as rows). */
export function nnls(A: number[][], b: number[], maxIter = 200): number[] {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  const x = new Array<number>(n).fill(0);
  const passive = new Array<boolean>(n).fill(false);
  const gradient = () => {
    const w = new Array<number>(n).fill(0);
    for (let i = 0; i < m; i++) {
      let r = b[i]!;
      for (let j = 0; j < n; j++) r -= A[i]![j]! * x[j]!;
      for (let j = 0; j < n; j++) w[j]! += A[i]![j]! * r;
    }
    return w;
  };
  /** Unconstrained least squares on the passive set (normal equations, small n). */
  const solvePassive = (): number[] => {
    const idx = passive.map((p, j) => (p ? j : -1)).filter((j) => j >= 0);
    const k = idx.length;
    const M = idx.map(() => new Array<number>(k + 1).fill(0));
    for (let i = 0; i < m; i++)
      for (let p = 0; p < k; p++) {
        const ap = A[i]![idx[p]!]!;
        for (let q = 0; q < k; q++) M[p]![q]! += ap * A[i]![idx[q]!]!;
        M[p]![k]! += ap * b[i]!;
      }
    // Gauss–Jordan with partial pivoting
    for (let c = 0; c < k; c++) {
      let piv = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
      [M[c], M[piv]] = [M[piv]!, M[c]!];
      const d = M[c]![c]! || 1e-300;
      for (let q = c; q <= k; q++) M[c]![q]! /= d;
      for (let r = 0; r < k; r++) {
        if (r === c) continue;
        const f = M[r]![c]!;
        if (f !== 0) for (let q = c; q <= k; q++) M[r]![q]! -= f * M[c]![q]!;
      }
    }
    const z = new Array<number>(n).fill(0);
    idx.forEach((j, p) => (z[j] = M[p]![k]!));
    return z;
  };
  for (let iter = 0; iter < maxIter; iter++) {
    const w = gradient();
    let best = -1;
    let bestW = 1e-12 * Math.max(1, ...w.map(Math.abs));
    for (let j = 0; j < n; j++)
      if (!passive[j] && w[j]! > bestW) {
        bestW = w[j]!;
        best = j;
      }
    if (best < 0) break;
    passive[best] = true;
    for (let inner = 0; inner < maxIter; inner++) {
      const z = solvePassive();
      if (passive.every((p, j) => !p || z[j]! > 0)) {
        for (let j = 0; j < n; j++) x[j] = passive[j] ? z[j]! : 0;
        break;
      }
      // step back towards the feasible region and drop the variables that hit zero
      let alpha = 1;
      for (let j = 0; j < n; j++) if (passive[j] && z[j]! <= 0) alpha = Math.min(alpha, x[j]! / (x[j]! - z[j]!));
      for (let j = 0; j < n; j++) {
        x[j] = x[j]! + alpha * (z[j]! - x[j]!);
        if (passive[j] && x[j]! <= 1e-15) {
          passive[j] = false;
          x[j] = 0;
        }
      }
    }
  }
  return x;
}

export interface FitResult {
  /** Power factor per source (same order as the input). */
  factors: number[];
  /** The measurement says something about this source (it carries ≥ minShare somewhere). */
  determined: boolean[];
  /** Median |measured − fitted| over the points, dB. */
  residualDb: number;
  /** Residual per point (measured − fitted), dB. */
  residuals: number[];
  points: number;
}

export interface FitOptions {
  /**
   * Pull towards factor 1 (the model as it is), in units of one point's relative error.
   * Keeps sources that overlap in space (a converter and its inductor) from trading power.
   */
  prior: number;
  /** A source counts as seen when it makes up this share of the measured power at some point. */
  minShare: number;
}

export const DEFAULT_FIT: FitOptions = { prior: 0.2, minShare: 0.01 };

/**
 * P[s][i]: simulated power of source s at point i; meas[i]: measured power (same unit, 0 = skip).
 * Rows are divided by the measured power, so every point weighs as a relative error.
 */
export function fitSources(P: number[][], meas: number[], opts: FitOptions = DEFAULT_FIT): FitResult {
  const nS = P.length;
  const used: number[] = [];
  meas.forEach((mv, i) => {
    if (mv > 0) used.push(i);
  });
  const determined = P.map((ps) => used.some((i) => ps[i]! / meas[i]! >= opts.minShare));
  if (used.length === 0 || nS === 0) return { factors: new Array(nS).fill(1), determined, residualDb: NaN, residuals: [], points: 0 };
  // sources the measurement cannot see keep their model value; the rest is fitted
  const free = P.map((_, s) => s).filter((s) => determined[s]);
  const fixedPower = (i: number) => P.reduce((t, ps, s) => (determined[s] ? t : t + ps[i]!), 0);
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (const i of used) {
    rows.push(free.map((s) => P[s]![i]! / meas[i]!));
    rhs.push(Math.max(0, 1 - fixedPower(i) / meas[i]!));
  }
  // scale columns so the normal equations stay well conditioned
  const scale = free.map((_, c) => Math.max(1e-300, Math.sqrt(rows.reduce((t, r) => t + r[c]! * r[c]!, 0) / rows.length)));
  const scaled = rows.map((r) => r.map((v, c) => v / scale[c]!));
  free.forEach((_, c) => {
    const row = new Array<number>(free.length).fill(0);
    row[c] = opts.prior / scale[c]!;
    scaled.push(row);
    rhs.push(opts.prior);
  });
  const xs = free.length ? nnls(scaled, rhs) : [];
  const factors = new Array<number>(nS).fill(1);
  free.forEach((s, c) => (factors[s] = xs[c]! / scale[c]!));
  const residuals = meas.map((mv, i) => {
    let fit = 0;
    for (let s = 0; s < nS; s++) fit += factors[s]! * P[s]![i]!;
    return mv > 0 && fit > 0 ? 10 * Math.log10(mv / fit) : NaN;
  });
  const abs = used.map((i) => Math.abs(residuals[i]!)).filter(Number.isFinite).sort((a, b) => a - b);
  return { factors, determined, residualDb: abs.length ? abs[Math.floor(abs.length / 2)]! : NaN, residuals, points: used.length };
}
