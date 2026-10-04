/** Reactive application state (Svelte 5 runes). Large typed arrays live in the engine. */
import type { BoardModel } from '../model/types';
import type { PlaneLayer, PlaneOverrides } from '../model/planes';
import type { Quality } from '../compute/grid';
import type { Source } from '../physics/sources';
import type { SourceModel } from '../physics/currents';
import { DEFAULT_VIEW, type ViewSettings } from './scenario';
import type { ProbeReadout } from './engine.svelte';
import type { Diagnostic } from '../physics/diagnostics';
import type { Detour } from '../physics/returnPaths';

export type ProbeComponent = 'abs' | 'x' | 'y' | 'z';

export interface ProbeState {
  /** World position of the probe centre (x, z) and height above F.Cu. */
  x: number;
  z: number;
  height: number;
  radius: number;
  follow: boolean;
  visible: boolean;
  component: ProbeComponent;
  /** Show the output voltage of a loop probe instead of H. */
  asVoltage: boolean;
}

export interface ComputeState {
  busy: boolean;
  progress: number;
  message: string;
  lastMs: number;
}

export interface Hotspot {
  /** World position (mm). */
  x: number;
  y: number;
  z: number;
  db: number;
  sourceId: string;
  nets: string[];
  parts: string[];
}

export type SpectrumMode = 'probe' | 'far3' | 'far10';

/** A loaded openEMS result (stage 3), as shown in the view panel. */
export interface FullwaveInfo {
  fileName: string;
  sources: { id: string; name: string; seconds: number }[];
  skipped: { id: string; name: string; reason: string }[];
  fMin: number;
  fMax: number;
  nFreqs: number;
  res: number;
  seconds: number;
  /** The result was computed for another version of the board. */
  otherBoard: boolean;
}

export interface LineInfo {
  f: number;
  /** Peak field of this line anywhere in the volume, dBµA/m. */
  peakDb: number;
  sources: string[];
}

class AppState {
  board = $state.raw<BoardModel | null>(null);
  boardHash = $state('');
  loading = $state(false);
  error = $state('');
  planes = $state.raw<PlaneLayer[]>([]);
  planeOverrides = $state<PlaneOverrides>({});
  sources = $state<Source[]>([]);
  selectedId = $state<string | null>(null);
  quality = $state<Quality>('normal');
  returnModel = $state<'image' | 'detour'>('detour');
  /** Stage 2 return paths per source (gap detours and plane transfers). */
  detours = $state.raw<Record<string, Detour[]>>({});
  fMax = $state(1e9);
  view = $state<ViewSettings>({ ...DEFAULT_VIEW });
  layerVisible = $state<boolean[]>([]);
  probe = $state<ProbeState>({ x: 0, z: 0, height: 2, radius: 1, follow: true, visible: false, component: 'abs', asVoltage: false });
  audio = $state<{ enabled: boolean; volume: number; pitchAt25MHz: number; mode: 'tones' | 'geiger' }>({ enabled: false, volume: 0.5, pitchAt25MHz: 220, mode: 'tones' });
  compute = $state<ComputeState>({ busy: false, progress: 0, message: '', lastMs: 0 });
  models = $state.raw<Record<string, SourceModel>>({});
  sourceErrors = $state<Record<string, string>>({});
  /** dB range of the current composite (null before the first volume). */
  composite = $state.raw<{ maxDb: number; minDb: number } | null>(null);
  lines = $state.raw<LineInfo[]>([]);
  hoverNet = $state('');
  highlightNets = $state.raw<string[]>([]);
  pickMode = $state<null | { kind: 'pad' | 'net'; onPick: (value: string) => void }>(null);
  toast = $state('');
  readout = $state.raw<ProbeReadout | null>(null);
  /** Component models from a GLB: how many footprints got one. */
  models3d = $state.raw<{ matched: number; total: number } | null>(null);
  diagnostics = $state.raw<Diagnostic[]>([]);
  hotspots = $state.raw<Hotspot[]>([]);
  spectrumMode = $state<SpectrumMode>('probe');
  rightTab = $state<'view' | 'diag' | 'scan'>('view');
  fieldLinesBusy = $state(false);
  fullwave = $state.raw<FullwaveInfo | null>(null);
  /** Where the magnetic field comes from: the fast model (stages 1–2) or openEMS (stage 3). */
  fieldOrigin = $state<'fast' | 'fullwave'>('fast');

  get selected(): Source | undefined {
    return this.sources.find((s) => s.id === this.selectedId);
  }
}

export const app = new AppState();
