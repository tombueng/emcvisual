/**
 * Orchestration: board loading, source models, volume jobs, composition, probe readouts.
 * Holds the large typed arrays outside the reactive state.
 */
import { parseBoard } from '../kicad/parseBoard';
import { detectPlanes, covered, type PlaneLayer } from '../model/planes';
import { worldFrame, toBoard, type WorldFrame } from '../model/world';
import { coverColumns, makeGrid, type Grid } from '../compute/grid';
import { FieldPool, CancelledError, type VolumeJob } from '../compute/pool';
import { compose, selectionWeight, TEXTURE_RANGE_DB, type Composite, type Selection } from '../compute/composer';
import { buildSource, SourceError, type PhysicsContext, type SourceModel } from '../physics/currents';
import { packWithImages, type ElementPack } from '../physics/images';
import { fieldAt, slotMaskTable } from '../physics/biotsavart';
import { BANDS } from '../physics/spectrum';
import { MU0 } from '../physics/units';
import type { Source } from '../physics/sources';
import type { Viewer } from '../render/viewer';
import { app, type LineInfo } from './app.svelte';
import { DEFAULT_VIEW, migrateScenario, hashText, SCENARIO_KIND, SCENARIO_VERSION, type Scenario } from './scenario';
import { loadLocal, saveLocal } from './persist';

interface VolumeEntry {
  key: string;
  data: Float32Array;
  /** max |h|² of this source volume (for ranking lines). */
  max: number;
}

export interface ProbeLine {
  f: number;
  db: number;
}

export interface ProbeReadout {
  /** Per source: |h| at the probe and its lines in dBµA/m (or dBµV). */
  sources: { id: string; name: string; color: string; lines: ProbeLine[]; h: number }[];
  /** Power sum per frequency over all sources. */
  total: ProbeLine[];
  unit: 'dBµA/m' | 'dBµV';
}

export function geometryKey(s: Source): string {
  switch (s.type) {
    case 'signal':
      return JSON.stringify(['signal', s.nets, s.driver, s.load]);
    case 'diffpair':
      return JSON.stringify(['diff', s.netP, s.netN, s.driverP, s.driverN, s.load, s.imbalance]);
    case 'loop':
      return JSON.stringify(['loop', s.pads]);
  }
}

export function selectionFromView(): Selection {
  const v = app.view;
  if (v.mode === 'line' && v.lineF > 0) return { mode: 'line', f: v.lineF };
  if (v.mode === 'band') {
    const b = BANDS.find((x) => x.id === v.bandId) ?? BANDS[1]!;
    return { mode: 'band', f0: b.f0, f1: b.f1 };
  }
  return { mode: 'all' };
}

class Engine {
  viewer: Viewer | null = null;
  private pool: FieldPool | null = null;
  frame: WorldFrame = { ox: 0, oy: 0 };
  grid: Grid | null = null;
  private cover: Uint32Array | null = null;
  private ctx: PhysicsContext | null = null;
  readonly packs = new Map<string, ElementPack>();
  private volumes = new Map<string, VolumeEntry>();
  private jobs = new Map<string, { key: string; job: VolumeJob; progress: number }>();
  private composite: Composite | null = null;
  private recomposeQueued = false;
  private saveTimer = 0;
  private boardText = '';
  private boardName = '';

  attach(viewer: Viewer) {
    this.viewer = viewer;
    if (!this.pool) this.pool = new FieldPool();
    if (app.board) {
      viewer.setBoard(app.board, this.frame);
      this.pushVolume();
    }
  }

  // --- board ------------------------------------------------------------------------------------

  async loadBoard(text: string, fileName: string, scenario?: Scenario | null) {
    app.loading = true;
    app.error = '';
    try {
      const board = parseBoard(text, fileName);
      const hash = await hashText(text);
      this.cancelAll();
      this.volumes.clear();
      this.packs.clear();
      this.composite = null;
      this.boardText = text;
      this.boardName = fileName;
      app.board = board;
      app.boardHash = hash;
      app.layerVisible = board.layers.map(() => true);
      this.frame = worldFrame(board);
      const saved = scenario ?? loadLocal<Scenario>(`scenario:${hash}`);
      const sc = saved ? safeMigrate(saved) : null;
      app.sources = sc?.sources ?? [];
      app.planeOverrides = sc?.settings.planeOverrides ?? {};
      app.quality = sc?.settings.quality ?? 'normal';
      app.fMax = sc?.settings.fMax ?? 1e9;
      app.view = { ...DEFAULT_VIEW, ...(sc?.view ?? {}) };
      app.selectedId = app.sources[0]?.id ?? null;
      app.composite = null;
      app.lines = [];
      app.models = {};
      app.sourceErrors = {};
      app.probe.visible = false;
      this.preparePlanes();
      this.viewer?.setBoard(board, this.frame);
      this.viewer?.setVolume(null, null);
      this.applyViewToViewer();
      this.refreshAll();
    } catch (e) {
      app.error = (e as Error).message || String(e);
      throw e;
    } finally {
      app.loading = false;
    }
  }

  /** Planes, grid and coverage columns depend on board, overrides and quality. */
  private preparePlanes() {
    const board = app.board;
    if (!board) return;
    app.planes = detectPlanes(board, { ...app.planeOverrides });
    this.grid = makeGrid(board, this.frame, { quality: app.quality });
    this.cover = coverColumns(this.grid, app.planes, this.frame);
    this.ctx = { board, frame: this.frame, planes: app.planes, fMax: app.fMax };
  }

  setQuality(q: typeof app.quality) {
    app.quality = q;
    this.rebuildEverything();
  }

  setPlaneOverride(layerName: string, net: string | null | undefined) {
    const o = { ...app.planeOverrides };
    if (net === undefined) delete o[layerName];
    else o[layerName] = net;
    app.planeOverrides = o;
    this.rebuildEverything();
  }

  setFMax(f: number) {
    app.fMax = f;
    if (this.ctx) this.ctx.fMax = f;
    this.refreshAll();
  }

  private rebuildEverything() {
    this.cancelAll();
    this.volumes.clear();
    this.packs.clear();
    this.preparePlanes();
    this.refreshAll();
  }

  // --- sources ----------------------------------------------------------------------------------

  /** Rebuild every source model; start volume jobs where the geometry changed. */
  refreshAll() {
    const ids = new Set(app.sources.map((s) => s.id));
    for (const id of [...this.volumes.keys()]) if (!ids.has(id)) this.volumes.delete(id);
    for (const [id, j] of this.jobs) if (!ids.has(id)) {
      j.job.cancel();
      this.jobs.delete(id);
    }
    const models: Record<string, SourceModel> = {};
    const errors: Record<string, string> = {};
    for (const s of app.sources) {
      const r = this.buildModel(s);
      if (r.model) models[s.id] = r.model;
      if (r.error) errors[s.id] = r.error;
    }
    app.models = models;
    app.sourceErrors = errors;
    for (const s of app.sources) if (models[s.id]) this.ensureVolume(s, models[s.id]!);
    this.queueRecompose();
    this.scheduleSave();
  }

  /** Call after editing one source (in app.sources). */
  sourceChanged(id: string) {
    const s = app.sources.find((x) => x.id === id);
    if (!s) return this.refreshAll();
    const r = this.buildModel(s);
    app.models = { ...app.models, ...(r.model ? { [id]: r.model } : {}) };
    if (!r.model) {
      const m = { ...app.models };
      delete m[id];
      app.models = m;
    }
    const errs = { ...app.sourceErrors };
    if (r.error) errs[id] = r.error;
    else delete errs[id];
    app.sourceErrors = errs;
    if (r.model) this.ensureVolume(s, r.model);
    else this.volumes.delete(id);
    this.queueRecompose();
    this.scheduleSave();
  }

  addSource(s: Source) {
    app.sources = [...app.sources, s];
    app.selectedId = s.id;
    this.sourceChanged(s.id);
  }

  removeSource(id: string) {
    app.sources = app.sources.filter((s) => s.id !== id);
    this.jobs.get(id)?.job.cancel();
    this.jobs.delete(id);
    this.volumes.delete(id);
    this.packs.delete(id);
    if (app.selectedId === id) app.selectedId = app.sources[0]?.id ?? null;
    this.refreshAll();
  }

  private buildModel(s: Source): { model?: SourceModel; error?: string } {
    if (!this.ctx) return { error: 'no-board' };
    try {
      return { model: buildSource(this.ctx, $state.snapshot(s)) };
    } catch (e) {
      return { error: e instanceof SourceError ? e.message : (e as Error).message || String(e) };
    }
  }

  private ensureVolume(s: Source, model: SourceModel) {
    const key = `${geometryKey(s)}|${app.quality}`;
    const pack = packWithImages(model.elements, app.planes, this.frame);
    this.packs.set(s.id, pack);
    if (this.volumes.get(s.id)?.key === key) return;
    const running = this.jobs.get(s.id);
    if (running?.key === key) return;
    running?.job.cancel();
    if (!this.pool || !this.grid || !this.cover) return;
    const t0 = performance.now();
    const job = this.pool.computeVolume(pack, this.grid, this.cover, (f) => {
      const j = this.jobs.get(s.id);
      if (j) j.progress = f;
      this.updateProgress();
    });
    this.jobs.set(s.id, { key, job, progress: 0 });
    this.updateProgress();
    job.promise.then(
      (data) => {
        let max = 0;
        for (let i = 0; i < data.length; i++) if (data[i]! > max) max = data[i]!;
        this.volumes.set(s.id, { key, data, max });
        this.jobs.delete(s.id);
        app.compute.lastMs = performance.now() - t0;
        this.updateProgress();
        this.queueRecompose();
      },
      (e) => {
        if (!(e instanceof CancelledError)) {
          this.jobs.delete(s.id);
          app.sourceErrors = { ...app.sourceErrors, [s.id]: (e as Error).message };
          this.updateProgress();
        }
      },
    );
  }

  private cancelAll() {
    for (const j of this.jobs.values()) j.job.cancel();
    this.jobs.clear();
    this.updateProgress();
  }

  private updateProgress() {
    const js = [...this.jobs.values()];
    app.compute.busy = js.length > 0;
    app.compute.progress = js.length ? js.reduce((s, j) => s + j.progress, 0) / js.length : 1;
  }

  // --- composition ------------------------------------------------------------------------------

  queueRecompose() {
    if (this.recomposeQueued) return;
    this.recomposeQueued = true;
    requestAnimationFrame(() => {
      this.recomposeQueued = false;
      this.recompose();
    });
  }

  recompose() {
    if (!this.grid) return;
    const n = this.grid.nx * this.grid.ny * this.grid.nz;
    const sel = selectionFromView();
    const vols: Float32Array[] = [];
    const weights: number[] = [];
    for (const s of app.sources) {
      const v = this.volumes.get(s.id);
      const m = app.models[s.id];
      if (!v || !m || !s.enabled) continue;
      vols.push(v.data);
      weights.push(selectionWeight(m.lines, sel));
    }
    this.lineRanking();
    if (vols.length === 0) {
      this.composite = null;
      app.composite = null;
      this.viewer?.setVolume(null, null);
      return;
    }
    this.composite = compose(vols, weights, n, this.composite ?? undefined);
    app.composite = { maxDb: this.composite.maxDb, minDb: this.composite.minDb };
    if (app.view.autoWindow && this.composite.maxDb > 0) {
      app.view.dbHigh = Math.round(this.composite.maxDb);
      app.view.dbLow = Math.round(this.composite.maxDb - 60);
    }
    this.pushVolume();
  }

  private pushVolume() {
    if (!this.viewer) return;
    if (this.composite && this.grid) this.viewer.setVolume(this.composite.bytes, this.grid);
    this.applyViewToViewer();
  }

  /** Strongest lines across sources (peak over the volume), for the line picker. */
  private lineRanking() {
    const byF = new Map<number, LineInfo>();
    for (const s of app.sources) {
      const v = this.volumes.get(s.id);
      const m = app.models[s.id];
      if (!v || !m || !s.enabled) continue;
      for (const l of m.lines) {
        const p = l.amp * l.amp * v.max;
        if (!(p > 0)) continue;
        const db = 10 * Math.log10(p) + 120;
        const key = Math.round(l.f);
        const cur = byF.get(key);
        if (cur) {
          cur.peakDb = 10 * Math.log10(10 ** (cur.peakDb / 10) + p * 1e12);
          cur.sources.push(s.name);
        } else byF.set(key, { f: l.f, peakDb: db, sources: [s.name] });
      }
    }
    app.lines = [...byF.values()].sort((a, b) => b.peakDb - a.peakDb).slice(0, 60);
  }

  /** Push view settings (window, slice, layers) to the viewer. */
  applyViewToViewer() {
    const v = this.viewer;
    if (!v) return;
    const c = this.composite;
    const toNorm = (db: number) => (c ? (db - c.minDb) / TEXTURE_RANGE_DB : 0);
    v.setVolumeParams({
      enabled: app.view.showVolume,
      window: [toNorm(app.view.dbLow), toNorm(app.view.dbHigh)],
      density: app.view.density,
      gamma: 1.6,
      colormap: app.view.colormap,
    });
    v.setSlice({ enabled: app.view.showSlice, height: app.view.sliceHeight, opacity: 0.9 });
    v.setSubstrateOpacity(app.view.substrateOpacity);
    v.setComponentsVisible(app.view.showComponents);
    app.layerVisible.forEach((vis, i) => v.setLayerVisible(i, vis));
  }

  // --- probe ------------------------------------------------------------------------------------

  /** Spectrum at the probe position (exact Biot-Savart, no grid). */
  probeReadout(): ProbeReadout | null {
    if (!app.board || !app.probe.visible) return null;
    const P = [app.probe.x, app.probe.height, app.probe.z] as const;
    const b = toBoard(this.frame, P[0], P[2]);
    const planes = [...app.planes].sort((p, q) => q.y - p.y);
    let bits = 0;
    planes.forEach((p, i) => {
      if (covered(p.raster, b.x, b.y)) bits |= 1 << i;
    });
    const h = new Float64Array(3);
    const asV = app.probe.asVoltage;
    const area = Math.PI * (app.probe.radius / 1000) ** 2;
    const sources: ProbeReadout['sources'] = [];
    const totals = new Map<number, number>();
    for (const s of app.sources) {
      const m = app.models[s.id];
      const pack = this.packs.get(s.id);
      if (!m || !pack || !s.enabled) continue;
      fieldAt(pack, slotMaskTable(pack.planeY.length), P[0], P[1], P[2], bits, h);
      const comp = app.probe.component;
      const hv = comp === 'x' ? Math.abs(h[0]!) : comp === 'y' ? Math.abs(h[1]!) : comp === 'z' ? Math.abs(h[2]!) : Math.hypot(h[0]!, h[1]!, h[2]!);
      const lines: ProbeLine[] = [];
      for (const l of m.lines) {
        let a = l.amp * hv;
        if (asV) a *= 2 * Math.PI * l.f * MU0 * area;
        if (!(a > 0)) continue;
        lines.push({ f: l.f, db: 20 * Math.log10(a) + 120 });
        const key = Math.round(l.f);
        totals.set(key, (totals.get(key) ?? 0) + a * a);
      }
      sources.push({ id: s.id, name: s.name, color: s.color, lines, h: hv });
    }
    const total = [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([f, p]) => ({ f, db: 10 * Math.log10(p) + 120 }));
    return { sources, total, unit: asV ? 'dBµV' : 'dBµA/m' };
  }

  /** |h| of each source at the probe (for the sound). */
  probeGains(): Map<string, number> {
    const out = new Map<string, number>();
    const r = this.probeReadout();
    if (!r) return out;
    for (const s of r.sources) out.set(s.id, s.h);
    return out;
  }

  planesAtProbe(): PlaneLayer[] {
    return app.planes;
  }

  // --- persistence ------------------------------------------------------------------------------

  scenario(): Scenario {
    return {
      kind: SCENARIO_KIND,
      version: SCENARIO_VERSION,
      board: { fileName: this.boardName, hash: app.boardHash },
      settings: { quality: app.quality, fMax: app.fMax, planeOverrides: $state.snapshot(app.planeOverrides) },
      sources: $state.snapshot(app.sources),
      view: $state.snapshot(app.view),
    };
  }

  applyScenario(raw: unknown) {
    const sc = migrateScenario(raw);
    app.sources = sc.sources;
    app.planeOverrides = sc.settings.planeOverrides;
    app.quality = sc.settings.quality;
    app.fMax = sc.settings.fMax;
    app.view = { ...sc.view };
    app.selectedId = app.sources[0]?.id ?? null;
    this.rebuildEverything();
    this.applyViewToViewer();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      if (app.boardHash) saveLocal(`scenario:${app.boardHash}`, this.scenario());
    }, 400);
  }

  get hasBoardText() {
    return this.boardText.length > 0;
  }
}

function safeMigrate(raw: unknown): Scenario | null {
  try {
    return migrateScenario(raw);
  } catch {
    return null;
  }
}

export const engine = new Engine();
