/**
 * Scenario files: sources and settings for one board. The format id is deliberately
 * neutral (no product name) so renaming the project never breaks saved files.
 */
import type { PlaneOverrides } from '../model/planes';
import type { Quality } from '../compute/grid';
import type { Source } from '../physics/sources';
import type { ColormapId } from '../render/colormaps';

export const SCENARIO_KIND = 'pcb-field-scenario';
export const SCENARIO_VERSION = 1;

export type ViewMode = 'all' | 'band' | 'line';

export interface ViewSettings {
  mode: ViewMode;
  bandId: string;
  lineF: number;
  autoWindow: boolean;
  /** Absolute window in dBµA/m. */
  dbLow: number;
  dbHigh: number;
  density: number;
  colormap: ColormapId;
  showVolume: boolean;
  /** Isosurfaces ("bubbles") at three levels of the display window. */
  showIso: boolean;
  showSlice: boolean;
  /** Slice height above F.Cu, mm. */
  sliceHeight: number;
  substrateOpacity: number;
  showComponents: boolean;
  showFieldLines: boolean;
  showReturnPaths: boolean;
  /** Which field the volume, slice, probe and lines show. */
  fieldKind: 'H' | 'E';
}

export interface ScenarioSettings {
  quality: Quality;
  fMax: number;
  planeOverrides: PlaneOverrides;
  /** 'image' = stage 1 mirror model, 'detour' = stage 2 return paths around gaps and through links. */
  returnModel: 'image' | 'detour';
}

export interface Scenario {
  kind: typeof SCENARIO_KIND;
  version: number;
  board: { fileName: string; hash: string };
  settings: ScenarioSettings;
  sources: Source[];
  view: ViewSettings;
}

export const DEFAULT_VIEW: ViewSettings = {
  mode: 'all',
  bandId: 'cispr-low',
  lineF: 0,
  autoWindow: true,
  dbLow: 60,
  dbHigh: 120,
  density: 0.5,
  colormap: 'inferno',
  showVolume: true,
  showIso: false,
  showSlice: false,
  sliceHeight: 2,
  substrateOpacity: 1,
  showComponents: true,
  showFieldLines: false,
  showReturnPaths: true,
  fieldKind: 'H',
};

export const DEFAULT_SETTINGS: ScenarioSettings = { quality: 'normal', fMax: 1e9, planeOverrides: {}, returnModel: 'detour' };

export class ScenarioError extends Error {}

/** Validate and upgrade a parsed scenario object. */
export function migrateScenario(raw: unknown): Scenario {
  if (!raw || typeof raw !== 'object') throw new ScenarioError('not-an-object');
  const o = raw as Record<string, unknown>;
  if (o.kind !== SCENARIO_KIND) throw new ScenarioError('wrong-kind');
  const version = Number(o.version);
  if (!(version >= 1) || version > SCENARIO_VERSION) throw new ScenarioError(`unsupported-version:${String(o.version)}`);
  const sources = Array.isArray(o.sources) ? (o.sources as Source[]) : [];
  return {
    kind: SCENARIO_KIND,
    version: SCENARIO_VERSION,
    board: (o.board as Scenario['board']) ?? { fileName: '', hash: '' },
    settings: { ...DEFAULT_SETTINGS, ...((o.settings as Partial<ScenarioSettings>) ?? {}) },
    sources,
    view: { ...DEFAULT_VIEW, ...((o.view as Partial<ViewSettings>) ?? {}) },
  };
}

export async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
