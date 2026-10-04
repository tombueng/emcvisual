/**
 * Stage 4: near-field scanning with a 3D printer (docs/zukunft/STUFE-4-MESSUNG-SCANNER.md).
 * Interfaces for the moving part (positioner) and the instrument (receiver), plus the
 * measurement format. Printer coordinates are mm in the printer's own frame.
 */

export interface PrinterPoint {
  x: number;
  y: number;
  z: number;
}

export interface Positioner {
  readonly label: string;
  /** Absolute move; resolves when the head has arrived (or a safe estimate has passed). */
  moveTo(p: PrinterPoint, feedMmPerMin: number): Promise<void>;
  home?(): Promise<void>;
  close?(): Promise<void>;
}

export interface Sweep {
  /** Bin centre frequencies, Hz. */
  freqs: Float64Array;
  /** Received power per bin, dBm. */
  dbm: Float32Array;
}

export interface SweepSettings {
  fStart: number;
  fStop: number;
  points: number;
}

export interface Receiver {
  readonly label: string;
  sweep(s: SweepSettings): Promise<Sweep>;
  close?(): Promise<void>;
}

/** One measured point: board position (mm), height above F.Cu (mm) and the sweep. */
export interface MeasuredPoint {
  bx: number;
  by: number;
  height: number;
  /** Grid indices of the plan (column, row, height layer). */
  ix: number;
  iy: number;
  layer: number;
  dbm: Float32Array;
}

export interface ScanGrid {
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
  heights: number[];
}

export const MEASUREMENT_KIND = 'pcb-field-measurement';

export interface Measurement {
  kind: typeof MEASUREMENT_KIND;
  version: 1;
  createdAt: string;
  board: { fileName: string; hash: string };
  /** Probe model; factorDb is a calibration correction on top of the ideal loop/stub model (0 = ideal). */
  probe: { kind: 'h-loop' | 'e-stub'; radiusMm: number; factorDb: number };
  receiver: string;
  positioner: string;
  sweep: SweepSettings;
  grid: ScanGrid;
  freqs: number[];
  points: MeasuredPoint[];
  /** Same plan with the board switched off, if recorded. */
  background?: MeasuredPoint[];
}
