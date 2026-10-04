/**
 * A virtual printer and receiver that "measure" what the simulation predicts: the whole
 * scanning chain (plan, registration, moves, sweeps, storage, comparison) can be tried and
 * tested without hardware, and a real scan can later be compared against it.
 */
import { printerToBoard, type Registration } from './registration';
import { fieldDbToDbm, type ProbeKind } from './probe';
import type { Positioner, PrinterPoint, Receiver, Sweep, SweepSettings } from './types';

export class VirtualPositioner implements Positioner {
  readonly label = 'virtual';
  current: PrinterPoint = { x: 0, y: 0, z: 50 };
  constructor(private delayMs = 0) {}
  async moveTo(p: PrinterPoint): Promise<void> {
    this.current = { ...p };
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
  }
}

/** Field lines at a board point and height: frequency (Hz) → field (dBµA/m or dBµV/m). */
export type FieldLookup = (bx: number, by: number, height: number) => { f: number; db: number }[];

export class VirtualReceiver implements Receiver {
  readonly label = 'virtual';
  private seed = 12345;
  /** Board switched off: only the noise floor is received (background run). */
  boardOff = false;
  constructor(
    private positioner: VirtualPositioner,
    private registration: () => Registration,
    private lookup: FieldLookup,
    private probe: { kind: ProbeKind; size: number },
    private noiseDbm = -100,
  ) {}

  private rand() {
    // small deterministic noise so repeated scans are comparable
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  async sweep(s: SweepSettings): Promise<Sweep> {
    const b = printerToBoard(this.registration(), this.positioner.current);
    const freqs = new Float64Array(s.points);
    const pw = new Float64Array(s.points);
    const df = s.points > 1 ? (s.fStop - s.fStart) / (s.points - 1) : 1;
    for (let i = 0; i < s.points; i++) {
      freqs[i] = s.fStart + i * df;
      pw[i] = 10 ** ((this.noiseDbm + (this.rand() - 0.5) * 2) / 10);
    }
    for (const l of this.boardOff ? [] : this.lookup(b.x, b.y, b.height)) {
      if (l.f < s.fStart - df / 2 || l.f > s.fStop + df / 2) continue;
      const i = Math.min(s.points - 1, Math.max(0, Math.round((l.f - s.fStart) / df)));
      pw[i] = pw[i]! + 10 ** (fieldDbToDbm(this.probe.kind, this.probe.size, l.f, l.db) / 10);
    }
    const dbm = new Float32Array(s.points);
    for (let i = 0; i < s.points; i++) dbm[i] = 10 * Math.log10(pw[i]!);
    return { freqs, dbm };
  }
}
