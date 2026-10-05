/**
 * Orchestration: board loading, source models, volume jobs, composition, probe readouts.
 * Holds the large typed arrays outside the reactive state.
 */
import { lineAmp } from '../physics/spectrum';
import { parseBoard } from '../kicad/parseBoard';
import { importBoard } from '../import';
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
import { footprintPoses, loadComponentModels, type FootprintPose } from '../render/componentModels';
import { frequencyWeights, fullwaveVolume, parseFullwave, resampleBlocks, sampleAt, valueAtFrequency, type FullwaveResult } from '../fullwave/result';
import { buildJob, DEFAULT_JOB_OPTIONS, type JobOptions } from '../fullwave/job';
import { attributeSource, type SourceAttribution } from '../physics/attribution';
import { buildLibraryModels, ModelLibrary, type FileSystemDirectoryHandleLike } from '../render/modelLibrary';
import { buildFieldLines } from '../render/fieldLinesMesh';
import { seedsFor, type LineTraceInput, type TracedLines } from '../compute/fieldlines';
import { diagnoseSource, referencePlane } from '../physics/diagnostics';
import { applyReturnModel, type Detour } from '../physics/returnPaths';
import { commonModeEstimate, type CmEstimate } from '../physics/commonMode';
import { ioCouplingEstimates } from '../physics/ioCoupling';
import { layoutRules } from '../physics/layoutRules';
import { buildCharges } from '../physics/charges';
import { eFieldAt } from '../physics/efield';
import { packCharges } from '../physics/images';
import { trapezoidLines, type Line } from '../physics/spectrum';
import type { FieldKind } from '../compute/fieldKernel';
import { dipoleCompensated, dipoleMoment, farField, farMoment, type LimitSegment } from '../physics/farfield';
import { limitsFor } from '../physics/standards';
import { distPointSegment } from '../model/geometry';
import { PickIndex } from '../model/pickIndex';
import { app, type Hotspot, type LineInfo } from './app.svelte';
import { DEFAULT_VIEW, EMPTY_PARTS_INFO, partsInfoOf, migrateScenario, hashText, hashBytes, SCENARIO_KIND, SCENARIO_VERSION, type Scenario } from './scenario';
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
  /** Per source: |h| at the probe, its lines in dBµA/m (or dBµV) and their power sum. */
  sources: { id: string; name: string; color: string; lines: ProbeLine[]; h: number; db: number }[];
  /** Power sum per frequency over all sources. */
  total: ProbeLine[];
  unit: 'dBµA/m' | 'dBµV' | 'dBµV/m';
}

export interface FarReadout {
  /** compensated: a flat loop over a solid plane, the far field is not quantifiable (lines empty). */
  sources: { id: string; name: string; color: string; lines: ProbeLine[]; compensated?: boolean }[];
  total: ProbeLine[];
  limits: LimitSegment[];
  distance: 3 | 10;
}

export function geometryKey(s: Source): string {
  switch (s.type) {
    case 'signal':
      return JSON.stringify(['signal', s.nets, s.driver, s.load]);
    case 'diffpair':
      return JSON.stringify(['diff', s.netP, s.netN, s.driverP, s.driverN, s.load, s.imbalance]);
    case 'loop':
      return JSON.stringify(['loop', s.pads, s.node?.net ?? '']);
    case 'inductor':
      return JSON.stringify(['inductor', s.ref, s.shielding]);
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
  readonly ePacks = new Map<string, ElementPack>();
  private volumes = new Map<string, VolumeEntry>();
  private jobs = new Map<string, { key: string; job: VolumeJob; progress: number }>();
  private composite: Composite | null = null;
  private recomposeQueued = false;
  private saveTimer = 0;
  private boardText = '';
  pickIndex: PickIndex | null = null;
  private detourCache = new Map<string, Detour[]>();
  private attribution = new Map<string, SourceAttribution>();
  /** GLB with component models (kept to re-attach after a viewer remount). */
  private modelData: ArrayBuffer | null = null;
  /** Footprints when the GLB was loaded, so models follow parts moved since. */
  private modelPoses: Map<string, FootprintPose> | null = null;
  private boardName = '';
  /** Stage 3: openEMS result and its blocks on the current grid. */
  private fullwave: FullwaveResult | null = null;
  private fwBlocks: Map<string, Int16Array[]> | null = null;

  attach(viewer: Viewer) {
    this.viewer = viewer;
    if (!this.pool) this.pool = new FieldPool();
    if (app.board) {
      viewer.setBoard(app.board, this.frame);
      this.pushVolume();
      void this.placeModels();
    }
  }

  // --- board ------------------------------------------------------------------------------------

  /**
   * Load a board. With keep=true (the same file saved again in KiCad) the sources, settings,
   * view, camera and component models stay; only the geometry is new. `models` is a KiCad GLB
   * export that comes with the board (the demo); it is placed before the library is asked.
   * `source` is the file's text (KiCad, IPC-2581, Eagle) or its bytes (any format, ODB++
   * archives); other formats than KiCad go through the importers in src/import.
   */
  async loadBoard(source: string | ArrayBuffer, fileName: string, scenario?: Scenario | null, keep = false, models: ArrayBuffer | null = null) {
    if (keep && app.board) scenario = this.scenario();
    const selected = app.selectedId;
    const layerVisible = app.layerVisible;
    const probeVisible = app.probe.visible;
    app.loading = true;
    app.error = '';
    // let the loading state paint before the synchronous work starts
    const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));
    await yieldToUi();
    try {
      const kicadText = typeof source === 'string' && source.trimStart().startsWith('(kicad_pcb');
      const board = kicadText ? parseBoard(source as string, fileName) : await importBoard(fileName, source);
      const hash = typeof source === 'string' ? await hashText(source) : await hashBytes(source);
      this.cancelAll();
      this.volumes.clear();
      this.packs.clear();
      this.ePacks.clear();
      this.composite = null;
      this.boardText = typeof source === 'string' ? source : fileName;
      this.boardName = fileName;
      app.board = board;
      app.boardHash = hash;
      if (!keep) {
        app.models3d = null;
        this.modelData = models;
        this.modelPoses = models ? footprintPoses(board) : null;
        this.fullwave = null;
        this.fwBlocks = null;
        app.fullwave = null;
        app.fieldOrigin = 'fast';
      }
      this.pickIndex = new PickIndex(board);
      app.layerVisible = keep && layerVisible.length === board.layers.length ? layerVisible : board.layers.map(() => true);
      this.frame = worldFrame(board);
      const saved = scenario ?? loadLocal<Scenario>(`scenario:${hash}`);
      const sc = saved ? safeMigrate(saved) : null;
      app.sources = sc?.sources ?? [];
      app.planeOverrides = sc?.settings.planeOverrides ?? {};
      app.quality = sc?.settings.quality ?? 'normal';
      app.fMax = sc?.settings.fMax ?? 1e9;
      app.returnModel = sc?.settings.returnModel ?? 'detour';
      app.standard = sc?.settings.standard ?? 'cispr32-b';
      app.view = { ...DEFAULT_VIEW, ...(sc?.view ?? {}) };
      app.partsInfo = sc ? partsInfoOf(sc) : EMPTY_PARTS_INFO;
      app.selectedId = keep && app.sources.some((s) => s.id === selected) ? selected : (app.sources[0]?.id ?? null);
      app.composite = null;
      app.lines = [];
      app.models = {};
      app.sourceErrors = {};
      app.probe.visible = keep && probeVisible;
      this.preparePlanes();
      await yieldToUi();
      this.viewer?.setBoard(board, this.frame, keep);
      void this.placeModels();
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
    this.fwBlocks = this.fullwave ? resampleBlocks(this.fullwave, this.grid) : null;
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
    this.ePacks.clear();
    this.preparePlanes();
    this.refreshAll();
  }

  // --- sources ----------------------------------------------------------------------------------

  /** Rebuild every source model; start volume jobs where the geometry changed. */
  refreshAll() {
    const ids = new Set(app.sources.map((s) => s.id));
    const idOf = (k: string) => k.slice(0, k.lastIndexOf('|'));
    for (const k of [...this.volumes.keys()]) if (!ids.has(idOf(k))) this.volumes.delete(k);
    for (const [k, j] of this.jobs)
      if (!ids.has(idOf(k))) {
        j.job.cancel();
        this.jobs.delete(k);
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
    this.updateDiagnostics();
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
    else {
      this.volumes.delete(`${id}|H`);
      this.volumes.delete(`${id}|E`);
    }
    this.updateDiagnostics();
    this.queueRecompose();
    this.scheduleSave();
  }

  addSource(s: Source) {
    app.sources = [...app.sources, s];
    app.selectedId = s.id;
    this.sourceChanged(s.id);
  }

  /** Add several sources at once (one rebuild instead of one per source). */
  addSources(list: Source[]) {
    if (list.length === 0) return;
    app.sources = [...app.sources, ...list];
    app.selectedId = list[0]!.id;
    this.refreshAll();
  }

  removeSource(id: string) {
    app.sources = app.sources.filter((s) => s.id !== id);
    for (const k of ['H', 'E']) {
      this.jobs.get(`${id}|${k}`)?.job.cancel();
      this.jobs.delete(`${id}|${k}`);
      this.volumes.delete(`${id}|${k}`);
    }
    this.packs.delete(id);
    this.ePacks.delete(id);
    if (app.selectedId === id) app.selectedId = app.sources[0]?.id ?? null;
    this.refreshAll();
  }

  private buildModel(s: Source): { model?: SourceModel; error?: string } {
    if (!this.ctx) return { error: 'no-board' };
    try {
      const src = $state.snapshot(s) as Source;
      const model = buildSource(this.ctx, src);
      const base = model.elements;
      let detours: Detour[] = [];
      if (app.returnModel === 'detour') {
        const r = applyReturnModel(this.ctx, src, model.elements);
        model.elements = r.elements;
        detours = r.detours;
      }
      // far-field share of each return-path problem and of the plane gaps under the source
      this.attribution.set(s.id, attributeSource(model.elements, base, detours, this.ctx.planes, this.frame));
      model.farMoment = farMoment(model.elements, this.ctx.planes, this.frame);
      this.detourCache.set(s.id, detours);
      model.charges = buildCharges(this.ctx, src);
      const vw =
        src.type === 'loop' ? (src.node ? { ...src.waveform, amplitude: src.node.voltage } : null) : src.type === 'inductor' ? null : src.waveform;
      model.vLines = vw ? trapezoidLines(vw, this.ctx.fMax) : [];
      return { model };
    } catch (e) {
      return { error: e instanceof SourceError ? e.message : (e as Error).message || String(e) };
    }
  }

  private ensureVolume(s: Source, model: SourceModel) {
    this.ensureKind(s, model, 'H');
    if (model.charges?.length) {
      this.ePacks.set(s.id, packCharges(model.charges, app.planes, this.frame));
      if (app.view.fieldKind === 'E') this.ensureKind(s, model, 'E');
    } else this.ePacks.delete(s.id);
  }

  /** Volume of a source for the active field kind (undefined while it computes). */
  private volumeOf(id: string, kind: FieldKind = app.view.fieldKind): VolumeEntry | undefined {
    return this.volumes.get(`${id}|${kind}`);
  }

  private linesOf(m: SourceModel, kind: FieldKind = app.view.fieldKind): Line[] {
    return kind === 'E' ? (m.vLines ?? []) : m.lines;
  }

  private ensureKind(s: Source, model: SourceModel, kind: FieldKind) {
    const key = `${geometryKey(s)}|${app.quality}|${app.returnModel}|${kind}`;
    const vkey = `${s.id}|${kind}`;
    let pack: ElementPack;
    if (kind === 'H') {
      pack = packWithImages(model.elements, app.planes, this.frame);
      this.packs.set(s.id, pack);
    } else {
      pack = this.ePacks.get(s.id)!;
    }
    if (this.volumes.get(vkey)?.key === key) return;
    const running = this.jobs.get(vkey);
    if (running?.key === key) return;
    running?.job.cancel();
    if (!this.pool || !this.grid || !this.cover) return;
    const t0 = performance.now();
    const job = this.pool.computeVolume(
      pack,
      this.grid,
      this.cover,
      (f) => {
        const j = this.jobs.get(vkey);
        if (j) j.progress = f;
        this.updateProgress();
      },
      kind,
    );
    this.jobs.set(vkey, { key, job, progress: 0 });
    this.updateProgress();
    job.promise.then(
      (data) => {
        let max = 0;
        for (let i = 0; i < data.length; i++) if (data[i]! > max) max = data[i]!;
        this.volumes.set(vkey, { key, data, max });
        this.jobs.delete(vkey);
        app.compute.lastMs = performance.now() - t0;
        this.updateProgress();
        this.queueRecompose();
      },
      (e) => {
        if (!(e instanceof CancelledError)) {
          this.jobs.delete(vkey);
          app.sourceErrors = { ...app.sourceErrors, [s.id]: (e as Error).message };
          this.updateProgress();
        }
      },
    );
  }

  setFieldKind(kind: FieldKind) {
    app.view.fieldKind = kind;
    for (const s of app.sources) {
      const m = app.models[s.id];
      if (m) this.ensureVolume(s, m);
    }
    this.queueRecompose();
    this.updateFieldLines();
    this.scheduleSave();
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

  /** Component models from a KiCad GLB export; returns how many parts got a model. */
  async loadModels(data: ArrayBuffer): Promise<{ matched: number; total: number }> {
    this.modelData = data;
    this.modelPoses = app.board ? footprintPoses(app.board) : null;
    const res = await this.attachModels();
    void this.loadLibraryModels();
    return res;
  }

  /** The GLB export first (it is exact), then models from the library for the other parts. */
  private async placeModels() {
    if (this.modelData) await this.attachModels().catch(() => undefined);
    await this.loadLibraryModels();
  }

  private async attachModels(): Promise<{ matched: number; total: number }> {
    if (!app.board || !this.modelData || !this.viewer) return { matched: 0, total: 0 };
    // GLTFLoader may detach the buffer: hand it a copy and keep ours for later remounts
    const models = await loadComponentModels(this.modelData.slice(0), app.board, this.frame, this.modelPoses ?? undefined);
    this.viewer.setComponentModels(models);
    app.models3d = { matched: models.matched.size, total: models.total };
    return app.models3d;
  }

  // --- stage 3: openEMS ---------------------------------------------------------------------------

  /** The full-wave field is shown (H only; openEMS results carry no electric field yet). */
  fullwaveActive(): boolean {
    return app.fieldOrigin === 'fullwave' && !!this.fullwave && !!this.fwBlocks && app.view.fieldKind === 'H';
  }

  /** Job file for tools/openems/run_job.py with the enabled sources and the current grid. */
  exportFullwaveJob(opts: Partial<JobOptions> = {}): string | null {
    if (!app.board || !this.ctx || !this.grid) return null;
    const job = buildJob(
      this.ctx,
      $state.snapshot(app.sources) as Source[],
      app.models,
      this.grid,
      { fileName: app.board.source.fileName, hash: app.boardHash },
      { ...DEFAULT_JOB_OPTIONS, fMax: Math.min(app.fMax, 1e9), ...opts },
      app.partsInfo.parts,
    );
    return JSON.stringify(job);
  }

  loadFullwave(buf: ArrayBuffer, fileName: string) {
    if (!app.board || !this.grid) throw new Error('no-board');
    const r = parseFullwave(buf);
    this.fullwave = r;
    this.fwBlocks = resampleBlocks(r, this.grid);
    app.fullwave = {
      fileName,
      sources: r.sources.map((s) => ({ id: s.id, name: s.name, seconds: s.seconds })),
      skipped: r.skipped,
      fMin: r.freqs[0]!,
      fMax: r.freqs[r.freqs.length - 1]!,
      nFreqs: r.freqs.length,
      res: r.solver.res,
      seconds: r.solver.seconds,
      otherBoard: r.board.hash !== app.boardHash,
    };
    app.fieldOrigin = 'fullwave';
    this.queueRecompose();
  }

  setFieldOrigin(o: 'fast' | 'fullwave') {
    app.fieldOrigin = o;
    this.queueRecompose();
  }

  // --- real 3D models from folders, repositories and KiCad's library --------------------------------
  readonly library = new ModelLibrary();
  private libraryJob = 0;

  /** Look up and place the models of all footprints (those not covered by a GLB export). */
  async loadLibraryModels() {
    const board = app.board;
    const viewer = this.viewer;
    if (!board || !viewer) return;
    this.library.useKicad = loadLocal<boolean>('models.kicad') ?? true;
    const withModels = board.footprints.filter((f) => f.models.some((m) => !m.hidden)).length;
    // parts a KiCad GLB export already covers keep that model
    const skip = new Set(viewer.glbMatched);
    const job = ++this.libraryJob;
    const base = { withModels, sources: [...this.library.sources], useKicad: this.library.useKicad };
    const none = { glb: skip.size, folder: 0, repo: 0, kicad: 0 };
    app.library = { ...base, busy: true, done: 0, total: 0, matched: skip.size, bySource: none, missing: [] };
    try {
      const res = await buildLibraryModels(this.library, board, this.frame, skip, (done, total) => {
        if (job === this.libraryJob && app.library) app.library = { ...app.library, done, total };
      });
      if (job !== this.libraryJob || board !== app.board) return;
      viewer.setLibraryModels(res);
      app.library = { ...base, busy: false, done: res.matched.size, total: res.matched.size, matched: skip.size + res.matched.size, bySource: { ...res.bySource, glb: skip.size }, missing: res.missing };
    } catch (e) {
      app.library = { ...base, busy: false, done: 0, total: 0, matched: skip.size, bySource: none, missing: [], error: (e as Error).message };
    }
  }

  async addModelFolder(dir: FileSystemDirectoryHandleLike | File[], label: string) {
    if (Array.isArray(dir)) this.library.addFiles(dir, label);
    else await this.library.addDirectory(dir, label);
    await this.loadLibraryModels();
  }

  async addModelRepo(url: string) {
    await this.library.addGithub(url);
    await this.loadLibraryModels();
  }

  setUseKicadLibrary(on: boolean) {
    saveLocal('models.kicad', on);
    void this.loadLibraryModels();
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
    const fw = this.fullwaveActive() ? this.fullwave : null;
    for (const s of app.sources) {
      const m = app.models[s.id];
      if (!m || !s.enabled) continue;
      const blocks = fw ? this.fwBlocks?.get(s.id) : undefined;
      if (fw && blocks) {
        // openEMS: the pattern changes with frequency; each line is split between the two
        // neighbouring dumped frequencies
        vols.push(fullwaveVolume(blocks, frequencyWeights(fw.freqs, m.lines, sel), n));
        weights.push(1);
        continue;
      }
      // sources openEMS did not simulate (inductors) stay from the fast model
      const v = this.volumeOf(s.id);
      if (!v) continue;
      vols.push(v.data);
      weights.push(selectionWeight(this.linesOf(m), sel));
    }
    this.lineRanking();
    if (vols.length === 0) {
      this.composite = null;
      app.composite = null;
      app.hotspots = [];
      this.viewer?.setVolume(null, null);
      this.viewer?.setMarkers([]);
      return;
    }
    this.composite = compose(vols, weights, n, this.composite ?? undefined);
    app.composite = { maxDb: this.composite.maxDb, minDb: this.composite.minDb };
    this.findHotspots(vols, weights);
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
      const v = this.volumeOf(s.id);
      const m = app.models[s.id];
      if (!v || !m || !s.enabled) continue;
      for (const l of this.linesOf(m)) {
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
      gamma: 2.2,
      colormap: app.view.colormap,
    });
    v.setIsosurfaces({ enabled: app.view.showIso, window: [toNorm(app.view.dbLow), toNorm(app.view.dbHigh)], colormap: app.view.colormap });
    v.setSlice({ enabled: app.view.showSlice, height: app.view.sliceHeight, opacity: 0.9 });
    v.setSubstrateOpacity(app.view.substrateOpacity);
    v.setComponentsVisible(app.view.showComponents);
    app.layerVisible.forEach((vis, i) => v.setLayerVisible(i, vis));
  }

  // --- probe ------------------------------------------------------------------------------------

  /** Spectrum at the probe position (exact Biot-Savart, no grid). */
  probeReadout(): ProbeReadout | null {
    if (!app.board || !app.probe.visible) return null;
    return this.readoutAt(app.probe.x, app.probe.height, app.probe.z, app.probe.asVoltage);
  }

  /** Field lines at a board point and height (power sum over the enabled sources), for scanning. */
  fieldLinesAt(bx: number, by: number, height: number): { f: number; db: number }[] {
    if (!app.board) return [];
    const r = this.readoutAt(bx - this.frame.ox, height, by - this.frame.oy, false);
    return r ? r.total : [];
  }

  /** Spectrum at a world point (x, height, z): exact Biot-Savart / Coulomb, no grid. */
  readoutAt(x: number, height: number, z: number, asVoltage: boolean): ProbeReadout | null {
    if (!app.board) return null;
    const P = [x, height, z] as const;
    const b = toBoard(this.frame, P[0], P[2]);
    const planes = [...app.planes].sort((p, q) => q.y - p.y);
    let bits = 0;
    planes.forEach((p, i) => {
      if (covered(p.raster, b.x, b.y)) bits |= 1 << i;
    });
    const h = new Float64Array(3);
    const asV = asVoltage;
    const area = Math.PI * (app.probe.radius / 1000) ** 2;
    const sources: ProbeReadout['sources'] = [];
    const totals = new Map<number, number>();
    const fw = this.fullwaveActive() ? this.fullwave : null;
    for (const s of app.sources) {
      const m = app.models[s.id];
      const isE = app.view.fieldKind === 'E';
      const pack = isE ? this.ePacks.get(s.id) : this.packs.get(s.id);
      if (!m || !pack || !s.enabled) continue;
      const blocks = fw && this.grid ? this.fwBlocks?.get(s.id) : undefined;
      // openEMS: |h| per ampere at each dumped frequency (magnitude only, no components)
      const fwValues = fw && blocks ? sampleAt(fw, blocks, this.grid!, P[0], P[1], P[2]) : null;
      let hv = 0;
      if (!fwValues) {
        (isE ? eFieldAt : fieldAt)(pack, slotMaskTable(pack.planeY.length), P[0], P[1], P[2], bits, h);
        const comp = app.probe.component;
        hv = comp === 'x' ? Math.abs(h[0]!) : comp === 'y' ? Math.abs(h[1]!) : comp === 'z' ? Math.abs(h[2]!) : Math.hypot(h[0]!, h[1]!, h[2]!);
      }
      const lines: ProbeLine[] = [];
      let power = 0;
      let hRef = hv;
      for (const l of this.linesOf(m)) {
        const hl = fwValues ? Math.sqrt(valueAtFrequency(fw!.freqs, fwValues, l.f)) : hv;
        if (fwValues && hRef === 0) hRef = hl;
        // the line as a receiver shows it; the band power keeps the thinned-out lines' share
        let a = lineAmp(l) * hl;
        let ap = l.amp * hl;
        if (asV && !isE) {
          a *= 2 * Math.PI * l.f * MU0 * area;
          ap *= 2 * Math.PI * l.f * MU0 * area;
        }
        if (!(a > 0)) continue;
        lines.push({ f: l.f, db: 20 * Math.log10(a) + 120 });
        power += ap * ap;
        const key = Math.round(l.f);
        totals.set(key, (totals.get(key) ?? 0) + a * a);
      }
      sources.push({ id: s.id, name: s.name, color: s.color, lines, h: hRef, db: power > 0 ? 10 * Math.log10(power) + 120 : -200 });
    }
    const total = [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([f, p]) => ({ f, db: 10 * Math.log10(p) + 120 }));
    return { sources, total, unit: app.view.fieldKind === 'E' ? 'dBµV/m' : asV ? 'dBµV' : 'dBµA/m' };
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

  // --- diagnostics, hotspots, far field, field lines --------------------------------------------

  updateDiagnostics() {
    const board = app.board;
    if (!board) return;
    const out = [];
    const detours: Record<string, Detour[]> = {};
    const cms: Record<string, CmEstimate> = {};
    for (const s of app.sources) {
      const m = app.models[s.id];
      if (!m) continue;
      detours[s.id] = this.detourCache.get(s.id) ?? [];
      if (!s.enabled) continue;
      const snap = $state.snapshot(s) as Source;
      const cm = commonModeEstimate(board, app.planes, this.frame, snap, m, limitsFor(app.standard, 3), (l) => referencePlane(board, app.planes, l));
      if (cm) cms[s.id] = cm;
      const io = this.ctx ? ioCouplingEstimates(this.ctx, snap, m, limitsFor(app.standard, 3), (l) => referencePlane(board, app.planes, l)) : [];
      out.push(...diagnoseSource(board, app.planes, this.frame, snap, m, app.fMax, detours[s.id], this.attribution.get(s.id)?.planeGapsDb, cm, io));
    }
    // board rules without a source: filters, shields, decoupling
    if (this.ctx) out.push(...layoutRules(this.ctx, $state.snapshot(app.sources) as Source[]));
    app.commonMode = cms;
    app.diagnostics = out;
    app.detours = detours;
    app.attribution = Object.fromEntries(app.sources.flatMap((s) => (this.attribution.has(s.id) ? [[s.id, this.attribution.get(s.id)!]] : [])));
    this.pushReturnPaths();
  }

  setReturnModel(m: 'image' | 'detour') {
    app.returnModel = m;
    this.refreshAll();
  }

  /** Return paths of the enabled sources as overlay lines. */
  pushReturnPaths() {
    const v = this.viewer;
    const board = app.board;
    if (!v || !board) return;
    if (!app.view.showReturnPaths || app.returnModel !== 'detour') return v.setReturnPaths([]);
    const lines: { points: [number, number, number][]; color: string }[] = [];
    for (const s of app.sources) {
      if (!s.enabled) continue;
      for (const d of app.detours[s.id] ?? []) {
        const y = board.layers[d.layer]?.y ?? 0;
        lines.push({ points: d.path.map((p) => [p.x - this.frame.ox, y, p.y - this.frame.oy]), color: s.color });
      }
    }
    v.setReturnPaths(lines);
  }

  /** Local maxima of the composite in a horizontal slice at the probe height. */
  private findHotspots(vols: Float32Array[], weights: number[]) {
    const g = this.grid;
    const c = this.composite;
    const board = app.board;
    if (!g || !c || !board) return;
    const iy = Math.max(0, Math.min(g.ny - 1, Math.round((app.probe.height - g.y0) / g.dy)));
    const at = (ix: number, iz: number) => c.power[ix + g.nx * (iy + g.ny * iz)]!;
    let max = 0;
    for (let iz = 0; iz < g.nz; iz++) for (let ix = 0; ix < g.nx; ix++) max = Math.max(max, at(ix, iz));
    if (!(max > 0)) {
      app.hotspots = [];
      return;
    }
    const floor = max * 10 ** (-50 / 10);
    const R = Math.max(2, Math.round(3 / g.dx));
    const found: { ix: number; iz: number; p: number }[] = [];
    for (let iz = R; iz < g.nz - R; iz++) {
      for (let ix = R; ix < g.nx - R; ix++) {
        const p = at(ix, iz);
        if (p < floor) continue;
        let peak = true;
        for (let dz = -R; dz <= R && peak; dz++) for (let dx = -R; dx <= R; dx++) if ((dx || dz) && at(ix + dx, iz + dz) > p) { peak = false; break; }
        if (peak) found.push({ ix, iz, p });
      }
    }
    found.sort((a, b) => b.p - a.p);
    const enabled = app.sources.filter((s) => this.volumeOf(s.id) && app.models[s.id] && s.enabled);
    const describe = ({ ix, iz, p }: { ix: number; iz: number; p: number }): Hotspot => {
      const x = g.x0 + ix * g.dx;
      const z = g.z0 + iz * g.dz;
      const b = toBoard(this.frame, x, z);
      const idx = ix + g.nx * (iy + g.ny * iz);
      let best = 0;
      let sourceId = '';
      vols.forEach((v, k) => {
        const contrib = (weights[k] ?? 0) * v[idx]!;
        if (contrib > best) {
          best = contrib;
          sourceId = enabled[k]?.id ?? '';
        }
      });
      const nets = new Set<string>();
      for (const t of board.tracks) if (t.net > 0 && distPointSegment(b, t.a, t.b) < 2) nets.add(board.nets[t.net]!);
      const parts = board.footprints
        .filter((f) => Math.hypot(f.body.center.x - b.x, f.body.center.y - b.y) < Math.max(4, Math.max(f.body.size.x, f.body.size.y) / 2 + 1))
        .map((f) => f.ref);
      return { x, y: g.y0 + iy * g.dy, z, db: 10 * Math.log10(p) + 120, sourceId, nets: [...nets].slice(0, 4), parts: parts.slice(0, 4) };
    };
    // strongest first, at most two per dominating source, so quieter sources still show up
    const perSource = new Map<string, number>();
    const spots: Hotspot[] = [];
    for (const f of found) {
      const h = describe(f);
      const n = perSource.get(h.sourceId) ?? 0;
      if (n >= 2) continue;
      perSource.set(h.sourceId, n + 1);
      spots.push(h);
      if (spots.length >= 8) break;
    }
    app.hotspots = spots;
    this.viewer?.setMarkers(spots.map((h) => ({ pos: [h.x, h.y, h.z] as [number, number, number], color: '#f2a33a' })));
  }

  farReadout(distance: 3 | 10): FarReadout | null {
    if (!app.board) return null;
    const sources: FarReadout['sources'] = [];
    const totals = new Map<number, number>();
    for (const s of app.sources) {
      const m = app.models[s.id];
      const pack = this.packs.get(s.id);
      if (!m || !pack || !s.enabled) continue;
      const fw = this.fullwaveActive() ? this.fullwave : null;
      const meta = fw?.sources.find((x) => x.id === s.id);
      const moment = m.farMoment ?? dipoleMoment(pack);
      if (!meta && dipoleCompensated(m.info.loopArea, moment)) {
        sources.push({ id: s.id, name: s.name, color: s.color, lines: [], compensated: true });
        continue;
      }
      // openEMS: strongest direction at 3 m per ampere; 10 m scales with 1/r
      const lines =
        fw && meta
          ? m.lines
              .map((l) => ({ f: l.f, e: lineAmp(l) * valueAtFrequency(fw.freqs, meta.farE3mPerA, l.f) * (3 / distance) }))
              .filter((l) => l.e > 0)
              .map((l) => ({ f: l.f, db: 20 * Math.log10(l.e) + 120 }))
          : farField(moment, m.lines, distance);
      for (const l of lines) totals.set(Math.round(l.f), (totals.get(Math.round(l.f)) ?? 0) + 10 ** (l.db / 10));
      sources.push({ id: s.id, name: s.name, color: s.color, lines });
    }
    const total = [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([f, p]) => ({ f, db: 10 * Math.log10(p) }));
    return { sources, total, limits: limitsFor(app.standard, distance), distance };
  }

  private linesWorker: Worker | null = null;
  private linesJob = 0;

  /** Field lines of the selected source (when enabled in the view). */
  updateFieldLines() {
    const v = this.viewer;
    if (!v) return;
    const s = app.selected;
    const kind = app.view.fieldKind;
    const pack = s ? (kind === 'E' ? this.ePacks.get(s.id) : this.packs.get(s.id)) : undefined;
    if (!app.view.showFieldLines || !s || !pack || !this.grid) {
      v.setFieldLines(null);
      app.fieldLinesBusy = false;
      return;
    }
    if (!this.linesWorker) {
      this.linesWorker = new Worker(new URL('../compute/fieldlines.worker.ts', import.meta.url), { type: 'module' });
      this.linesWorker.onmessage = (ev: MessageEvent<{ id: number; out: TracedLines }>) => {
        if (ev.data.id !== this.linesJob) return;
        app.fieldLinesBusy = false;
        const src = app.selected;
        this.viewer?.setFieldLines(src ? buildFieldLines(ev.data.out, src.color) : null);
      };
    }
    const g = this.grid;
    const rasters = [...app.planes].sort((p, q) => q.y - p.y).map((p) => p.raster);
    const input: LineTraceInput = {
      pack,
      rasters,
      frame: { ...this.frame },
      seeds: seedsFor(pack),
      min: [g.x0, g.y0, g.z0],
      max: [g.x0 + (g.nx - 1) * g.dx, g.y0 + (g.ny - 1) * g.dy, g.z0 + (g.nz - 1) * g.dz],
      step: 0.2,
      maxSteps: 900,
      kind,
    };
    app.fieldLinesBusy = true;
    this.linesWorker.postMessage({ id: ++this.linesJob, input });
  }

  // --- export -----------------------------------------------------------------------------------

  /** Horizontal slice of the composite at a height above F.Cu as CSV (board coordinates). */
  sliceCsv(height: number): string | null {
    const g = this.grid;
    const c = this.composite;
    if (!g || !c) return null;
    const iy = Math.max(0, Math.min(g.ny - 1, Math.round((height - g.y0) / g.dy)));
    const rows = [`# x_mm;y_mm;${app.view.fieldKind === 'E' ? 'E_dBuV_m' : 'H_dBuA_m'};height_mm=${(g.y0 + iy * g.dy).toFixed(2)}`];
    for (let iz = 0; iz < g.nz; iz++) {
      for (let ix = 0; ix < g.nx; ix++) {
        const p = c.power[ix + g.nx * (iy + g.ny * iz)]!;
        const b = toBoard(this.frame, g.x0 + ix * g.dx, g.z0 + iz * g.dz);
        rows.push(`${b.x.toFixed(2)};${b.y.toFixed(2)};${p > 0 ? (10 * Math.log10(p) + 120).toFixed(2) : ''}`);
      }
    }
    return rows.join('\n') + '\n';
  }

  /** Spectrum lines as CSV: frequency, total and one column per source. */
  spectrumCsv(data: { sources: { name: string; lines: ProbeLine[] }[]; total: ProbeLine[]; unit: string }): string {
    const header = ['f_Hz', `total_${data.unit}`, ...data.sources.map((s) => s.name.replace(/[;\n]/g, ' '))];
    const per = data.sources.map((s) => new Map(s.lines.map((l) => [Math.round(l.f), l.db])));
    const rows = data.total.map((l) => [l.f.toFixed(0), l.db.toFixed(2), ...per.map((m) => m.get(Math.round(l.f))?.toFixed(2) ?? '')].join(';'));
    return [header.join(';'), ...rows].join('\n') + '\n';
  }

  // --- persistence ------------------------------------------------------------------------------

  scenario(): Scenario {
    return {
      kind: SCENARIO_KIND,
      version: SCENARIO_VERSION,
      board: { fileName: this.boardName, hash: app.boardHash },
      settings: { quality: app.quality, fMax: app.fMax, planeOverrides: $state.snapshot(app.planeOverrides), returnModel: app.returnModel, standard: app.standard },
      sources: $state.snapshot(app.sources),
      view: $state.snapshot(app.view),
      ...(app.partsInfo.parts.length ? { parts: app.partsInfo.parts } : {}),
      ...(Object.keys(app.partsInfo.provenance).length ? { provenance: app.partsInfo.provenance } : {}),
      ...(app.partsInfo.missing.length ? { missing: app.partsInfo.missing } : {}),
      ...(app.partsInfo.notes ? { notes: app.partsInfo.notes } : {}),
    };
  }

  applyScenario(raw: unknown) {
    const sc = migrateScenario(raw);
    app.sources = sc.sources;
    app.planeOverrides = sc.settings.planeOverrides;
    app.quality = sc.settings.quality;
    app.fMax = sc.settings.fMax;
    app.returnModel = sc.settings.returnModel;
    app.standard = sc.settings.standard;
    app.view = { ...sc.view };
    app.partsInfo = partsInfoOf(sc);
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
