/** Source definitions as stored in a scenario (docs/stufe-1/PHYSIK.md §5). */
import type { Waveform } from './spectrum';

export type LoadModel =
  | { model: 'capacitive'; /** input capacitance per receiver pad, F */ cLoad: number }
  | { model: 'terminated'; /** characteristic impedance override, Ω (0 = from geometry) */ z0: number; /** termination pad "R5.1"; empty = farthest load */ endPad: string };

interface SourceBase {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
}

export interface SignalSource extends SourceBase {
  type: 'signal';
  /** 'clock' or 'data' (data is modelled as the 1010 worst case: f0 = bit rate / 2). */
  kind: 'clock' | 'data';
  /** One or more nets; two-pin parts between them (series resistors) are bridged. */
  nets: string[];
  /** Driver pad "U1.12"; empty = detect from pin types. */
  driver: string;
  waveform: Waveform;
  load: LoadModel;
}

export interface DiffPairSource extends SourceBase {
  type: 'diffpair';
  kind: 'clock' | 'data';
  netP: string;
  netN: string;
  driverP: string;
  driverN: string;
  waveform: Waveform;
  load: LoadModel;
  /** Amplitude imbalance ε: N carries -(1-ε) of P's current. */
  imbalance: number;
}

export interface LoopSource extends SourceBase {
  type: 'loop';
  /** Ordered pads around the loop, e.g. ["C1.1", "U1.1", "U1.2", "C1.2"]; closed automatically. */
  pads: string[];
  /** Current waveform; amplitude in amperes. */
  waveform: Waveform;
  /** Switching node for the electric field (stage 2b): its net and voltage swing (e.g. VIN). */
  node?: { net: string; voltage: number };
}

/** Stray field of a storage inductor (stage 2c): a small horizontal multi-turn loop in its body. */
export interface InductorSource extends SourceBase {
  type: 'inductor';
  /** Footprint reference, e.g. "L1". */
  ref: string;
  /** How much field leaves the core: open drum core, semi-shielded, shielded. */
  shielding: 'open' | 'semi' | 'shielded';
  /** f0 = switching frequency, duty = converter duty cycle, amplitude = ripple current peak-to-peak (A); tr unused. */
  waveform: Waveform;
}

/** Effective turns of the stray loop per shielding class (rough, see PHYSIK/Stufe-2 doc). */
export const STRAY_TURNS: Record<InductorSource['shielding'], number> = { open: 12, semi: 4, shielded: 0.8 };

export type Source = SignalSource | DiffPairSource | LoopSource | InductorSource;

export const SOURCE_COLORS = ['#f59e0b', '#38bdf8', '#f472b6', '#a3e635', '#c084fc', '#fb7185', '#2dd4bf', '#facc15'];

/** Split "U1.12" into reference and pad number (references may contain dots: use the last). */
export function splitPadRef(s: string): { ref: string; number: string } | null {
  const i = s.lastIndexOf('.');
  if (i <= 0 || i === s.length - 1) return null;
  return { ref: s.slice(0, i), number: s.slice(i + 1) };
}
