/**
 * Board ↔ printer coordinates. The board lies flat on the bed; reference points (pads,
 * fiducials) are known in board coordinates and jogged to in printer coordinates. A rigid 2D
 * transform (rotation + translation, optionally mirrored) is fitted by least squares
 * (Kabsch in 2D). KiCad's y axis points down, so a board lying top up on the bed usually needs
 * the mirrored fit; with three or more points the better of both is taken automatically.
 */
import type { PrinterPoint } from './types';

export interface PointPair {
  /** Board coordinates, mm (KiCad x/y). */
  board: { x: number; y: number };
  /** Printer coordinates of the probe centre over that point, mm. */
  printer: { x: number; y: number };
}

export interface Registration {
  /** Rotation angle (rad) after the optional mirror. */
  angle: number;
  mirror: boolean;
  tx: number;
  ty: number;
  /** Printer z at which the probe touches the board top surface. */
  zSurface: number;
  /** RMS residual of the fit, mm. */
  residual: number;
}

export function fitRegistration(pairs: PointPair[], zSurface: number, mirror?: boolean): Registration {
  if (pairs.length < 2) throw new Error('need-two-points');
  if (mirror === undefined) {
    const a = fitRegistration(pairs, zSurface, true);
    const b = fitRegistration(pairs, zSurface, false);
    // with only two points both fit exactly: prefer the mirrored one (board top up)
    return pairs.length < 3 || a.residual <= b.residual ? a : b;
  }
  const src = pairs.map((p) => ({ x: p.board.x, y: mirror ? -p.board.y : p.board.y }));
  const dst = pairs.map((p) => p.printer);
  const n = pairs.length;
  const sc = { x: src.reduce((s, p) => s + p.x, 0) / n, y: src.reduce((s, p) => s + p.y, 0) / n };
  const dc = { x: dst.reduce((s, p) => s + p.x, 0) / n, y: dst.reduce((s, p) => s + p.y, 0) / n };
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i]!.x - sc.x;
    const ay = src[i]!.y - sc.y;
    const bx = dst[i]!.x - dc.x;
    const by = dst[i]!.y - dc.y;
    sxx += ax * bx + ay * by;
    sxy += ax * by - ay * bx;
  }
  const angle = Math.atan2(sxy, sxx);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tx = dc.x - (c * sc.x - s * sc.y);
  const ty = dc.y - (s * sc.x + c * sc.y);
  const reg: Registration = { angle, mirror, tx, ty, zSurface, residual: 0 };
  let err = 0;
  for (const p of pairs) {
    const q = boardToPrinter(reg, p.board.x, p.board.y, 0);
    err += (q.x - p.printer.x) ** 2 + (q.y - p.printer.y) ** 2;
  }
  reg.residual = Math.sqrt(err / n);
  return reg;
}

/** Board point (mm) and height above the board top (mm) → printer coordinates. */
export function boardToPrinter(r: Registration, bx: number, by: number, height: number): PrinterPoint {
  const x = bx;
  const y = r.mirror ? -by : by;
  const c = Math.cos(r.angle);
  const s = Math.sin(r.angle);
  return { x: c * x - s * y + r.tx, y: s * x + c * y + r.ty, z: r.zSurface + height };
}

export function printerToBoard(r: Registration, p: PrinterPoint): { x: number; y: number; height: number } {
  const c = Math.cos(r.angle);
  const s = Math.sin(r.angle);
  const dx = p.x - r.tx;
  const dy = p.y - r.ty;
  const x = c * dx + s * dy;
  const y = -s * dx + c * dy;
  return { x, y: r.mirror ? -y : y, height: p.z - r.zSurface };
}
