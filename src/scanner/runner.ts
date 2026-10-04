/**
 * Runs a scan plan: moves (lifting before travelling so the probe never drags over parts),
 * waits, sweeps (max-hold over several sweeps for bursty signals) and hands every point back
 * as it is measured. Can be stopped with an AbortSignal between points.
 */
import { boardToPrinter, type Registration } from './registration';
import type { Plan } from './plan';
import type { MeasuredPoint, Positioner, PrinterPoint, Receiver, SweepSettings } from './types';

export interface RunOptions {
  plan: Plan;
  registration: Registration;
  positioner: Positioner;
  receiver: Receiver;
  sweep: SweepSettings;
  feed: number;
  settleMs: number;
  /** Sweeps per point, combined by max-hold. */
  averages: number;
  signal?: AbortSignal;
  onPoint?: (p: MeasuredPoint, index: number, total: number) => void;
}

export async function runScan(o: RunOptions): Promise<{ points: MeasuredPoint[]; freqs: number[] }> {
  const out: MeasuredPoint[] = [];
  let freqs: number[] = [];
  let at: PrinterPoint | null = null;
  const total = o.plan.points.length;
  for (let i = 0; i < total; i++) {
    if (o.signal?.aborted) break;
    const p = o.plan.points[i]!;
    const target = boardToPrinter(o.registration, p.bx, p.by, p.height);
    // lift first, travel at the higher of both heights, then lower onto the point
    const travelZ = Math.max(at?.z ?? target.z, target.z);
    if (at && (Math.abs(at.x - target.x) > 1e-6 || Math.abs(at.y - target.y) > 1e-6)) {
      if (at.z < travelZ) await o.positioner.moveTo({ ...at, z: travelZ }, o.feed);
      await o.positioner.moveTo({ ...target, z: travelZ }, o.feed);
    }
    await o.positioner.moveTo(target, o.feed);
    at = target;
    if (o.settleMs > 0) await new Promise((r) => setTimeout(r, o.settleMs));
    let best: Float32Array | null = null;
    for (let k = 0; k < Math.max(1, o.averages); k++) {
      const s = await o.receiver.sweep(o.sweep);
      if (!best) {
        best = Float32Array.from(s.dbm);
        freqs = Array.from(s.freqs);
      } else for (let j = 0; j < best.length; j++) best[j] = Math.max(best[j]!, s.dbm[j] ?? -Infinity);
    }
    const mp: MeasuredPoint = { bx: p.bx, by: p.by, height: p.height, ix: p.ix, iy: p.iy, layer: p.layer, dbm: best! };
    out.push(mp);
    o.onPoint?.(mp, i, total);
  }
  return { points: out, freqs };
}
