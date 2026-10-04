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
  /** Speech bubbles in the 3D view. */
  callouts: { hints: boolean; sources: boolean; hotspots: boolean; maxHints: number; inWorld: boolean; spectrum: boolean };
}

export interface ScenarioSettings {
  quality: Quality;
  fMax: number;
  planeOverrides: PlaneOverrides;
  /** 'image' = stage 1 mirror model, 'detour' = stage 2 return paths around gaps and through links. */
  returnModel: 'image' | 'detour';
  /** Emission standard the far field is compared with (physics/standards.ts). */
  standard: string;
}

/** Where a value came from (docs/AI-PARTS-MANUAL.md), keyed "<source id>/<field path>" or "part:<ref>/<field>". */
export interface Provenance {
  basis: 'datasheet' | 'calculated' | 'schematic' | 'assumed';
  ref?: string;
  mpn?: string;
  /** URL of the document. */
  source?: string;
  /** Page, table, parameter name, test condition. */
  where?: string;
  note?: string;
}

/** A part whose data could not be found, and what was assumed instead. */
export interface MissingPart {
  ref: string;
  mpn?: string;
  needed: string[];
  reason?: string;
  assumed?: string;
}

/** Capacitor data for the full-wave simulation (F, Ω, H). */
export interface PartData {
  ref: string;
  c?: number;
  esr?: number;
  esl?: number;
}

/** Parts information that came with a scenario (usually filled in by an AI agent). */
export interface PartsInfo {
  parts: PartData[];
  provenance: Record<string, Provenance>;
  missing: MissingPart[];
  notes: string;
}

export const EMPTY_PARTS_INFO: PartsInfo = { parts: [], provenance: {}, missing: [], notes: '' };

export interface Scenario {
  kind: typeof SCENARIO_KIND;
  version: number;
  board: { fileName: string; hash: string };
  settings: ScenarioSettings;
  sources: Source[];
  view: ViewSettings;
  parts?: PartData[];
  provenance?: Record<string, Provenance>;
  missing?: MissingPart[];
  notes?: string;
}

const BASES = new Set(['datasheet', 'calculated', 'schematic', 'assumed']);

/** The parts information of a scenario, with anything malformed dropped. */
export function partsInfoOf(sc: Scenario): PartsInfo {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  const text = (x: unknown) => (typeof x === 'string' ? x : undefined);
  const parts = (Array.isArray(sc.parts) ? sc.parts : []).filter(isObj).flatMap((p) =>
    text(p.ref) ? [{ ref: p.ref as string, c: num(p.c), esr: num(p.esr), esl: num(p.esl) }] : [],
  );
  const provenance: Record<string, Provenance> = {};
  if (isObj(sc.provenance))
    for (const [k, v] of Object.entries(sc.provenance)) {
      if (!isObj(v) || !BASES.has(v.basis as string)) continue;
      provenance[k] = { basis: v.basis as Provenance['basis'], ref: text(v.ref), mpn: text(v.mpn), source: text(v.source), where: text(v.where), note: text(v.note) };
    }
  const missing = (Array.isArray(sc.missing) ? sc.missing : []).filter(isObj).flatMap((m) =>
    text(m.ref)
      ? [{ ref: m.ref as string, mpn: text(m.mpn), needed: Array.isArray(m.needed) ? m.needed.filter((x): x is string => typeof x === 'string') : [], reason: text(m.reason), assumed: text(m.assumed) }]
      : [],
  );
  return { parts, provenance, missing, notes: text(sc.notes) ?? '' };
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
  callouts: { hints: true, sources: true, hotspots: false, maxHints: 5, inWorld: false, spectrum: true },
};

export const DEFAULT_SETTINGS: ScenarioSettings = { quality: 'normal', fMax: 1e9, planeOverrides: {}, returnModel: 'detour', standard: 'cispr32-b' };

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
    parts: o.parts as PartData[] | undefined,
    provenance: o.provenance as Record<string, Provenance> | undefined,
    missing: o.missing as MissingPart[] | undefined,
    notes: o.notes as string | undefined,
  };
}

export async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
