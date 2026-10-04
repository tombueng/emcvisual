<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { branding } from '../branding';
  import { t, i18n, setLang, LANGS, type Lang } from '../i18n';
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { Viewer } from '../render/viewer';
  import { Sonifier, type Voice } from '../audio/sonifier';
  import { downloadDataUrl, downloadText, pickFile } from '../state/persist';
  import { toBoard } from '../model/world';
  import type { Quality } from '../compute/grid';
  import SourcesPanel from './SourcesPanel.svelte';
  import ViewPanel from './ViewPanel.svelte';
  import SpectrumPanel from './SpectrumPanel.svelte';
  import { showMeasurement } from '../state/scanner.svelte';

  let viewEl: HTMLDivElement;
  let viewer: Viewer | null = null;
  const sonifier = new Sonifier();
  let dragging = $state(false);
  /** Narrow windows: the right panel is a drawer over the viewport. */
  let panelOpen = $state(false);
  let down: { x: number; y: number } | null = null;

  onMount(() => {
    viewer = new Viewer(viewEl);
    engine.attach(viewer);
    viewer.controls.addEventListener('change', () => scheduleAudio());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') app.pickMode = null;
    };
    window.addEventListener('keydown', onKey);
    void openFromQuery();
    return () => {
      window.removeEventListener('keydown', onKey);
      sonifier.dispose();
      viewer?.dispose();
    };
  });

  // --- loading ------------------------------------------------------------------------------------
  async function openModels(data: ArrayBuffer) {
    if (!app.board) {
      app.toast = t.models.needBoard;
      return;
    }
    try {
      const r = await engine.loadModels(data);
      app.toast = t.models.loaded(r.matched, r.total);
    } catch {
      app.toast = t.models.failed;
    }
  }

  async function openBoardFile(file: File) {
    if (/\.(glb|gltf)$/i.test(file.name)) return openModels(await file.arrayBuffer());
    if (file.name.endsWith('.json')) {
      try {
        engine.applyScenario(JSON.parse(await file.text()));
      } catch {
        app.toast = t.errors.scenario;
      }
      return;
    }
    try {
      await engine.loadBoard(await file.text(), file.name);
    } catch {
      app.toast = t.errors.parse;
    }
  }

  async function openDialog() {
    const f = await pickFile('.kicad_pcb,.json,.glb');
    if (f) await openBoardFile(f);
  }

  async function loadDemo() {
    const base = import.meta.env.BASE_URL;
    const [pcb, scenario] = await Promise.all([
      fetch(`${base}demo/demo-board.kicad_pcb`).then((r) => r.text()),
      fetch(`${base}demo/demo-board.scenario${i18n.lang === 'de' ? '' : `.${i18n.lang}`}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    await engine.loadBoard(pcb, 'demo-board.kicad_pcb', scenario);
    const glb = await fetch(`${base}demo/demo-board.glb`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    if (glb) await engine.loadModels(glb).catch(() => undefined);
  }

  /**
   * Links can open a board directly: ?board=<http(s) URL of a .kicad_pcb> (the server must allow
   * cross-origin reads, as raw.githubusercontent.com does), or ?demo for the demo board.
   * Only after the engine is idle, so a language switch (remount) does not reload it.
   */
  async function openFromQuery() {
    if (app.board) return;
    const q = new URLSearchParams(location.search);
    const url = q.get('board');
    if (q.has('demo')) return loadDemo();
    if (!url || !/^https?:\/\//i.test(url)) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'board.kicad_pcb');
      await engine.loadBoard(await res.text(), name);
    } catch {
      app.toast = t.errors.fetch(url);
      return;
    }
    // optional component models: &models=<URL of a KiCad GLB export>
    const models = q.get('models');
    if (models && /^https?:\/\//i.test(models)) {
      const glb = await fetch(models).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
      if (glb) await openModels(glb);
      else app.toast = t.errors.fetch(models);
    }
  }

  async function loadScenario() {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      if (raw?.board?.hash && raw.board.hash !== app.boardHash) app.toast = t.errors.scenarioOtherBoard;
      engine.applyScenario(raw);
    } catch {
      app.toast = t.errors.scenario;
    }
  }

  function saveScenario() {
    const name = (app.board?.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '');
    downloadText(`${name}.scenario.json`, JSON.stringify(engine.scenario(), null, 2));
  }

  function snapshot() {
    if (viewer) downloadDataUrl(`${(app.board?.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '')}.png`, viewer.snapshot());
  }

  let ant = $state(false);
  $effect(() => {
    void app.board;
    ant = false;
  });
  function toggleAnt() {
    if (!viewer) return;
    if (ant) viewer.overview();
    else {
      const h = app.hotspots[0];
      viewer.antView(h ? h.x : 0, 2, h ? h.z : 0);
    }
    ant = !ant;
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    // board first, then models and scenarios, so several files can be dropped at once
    const rank = (f: File) => (f.name.endsWith('.kicad_pcb') ? 0 : /\.(glb|gltf)$/i.test(f.name) ? 1 : 2);
    const files = [...(e.dataTransfer?.files ?? [])].sort((a, b) => rank(a) - rank(b));
    for (const f of files) await openBoardFile(f);
  }

  async function pickModels() {
    const f = await pickFile('.glb');
    if (f) await openModels(await f.arrayBuffer());
  }

  // --- pointer: probe, picking ------------------------------------------------------------------
  function inGrid(x: number, z: number) {
    const g = engine.grid;
    return !!g && x >= g.x0 && x <= g.x0 + (g.nx - 1) * g.dx && z >= g.z0 && z <= g.z0 + (g.nz - 1) * g.dz;
  }

  /**
   * Copper under the pointer via the 2D pick index: intersect the ray with the outer copper
   * surface facing the camera, then look up tracks, pads, vias and zones on the visible
   * layers from that side inwards.
   */
  function copperAt(clientX: number, clientY: number) {
    const board = app.board;
    if (!viewer || !board || !engine.pickIndex) return null;
    const fromTop = viewer.camera.position.y >= 0;
    const order = board.layers.map((l) => l.index).filter((i) => app.layerVisible[i] !== false);
    if (!fromTop) order.reverse();
    const outer = fromTop ? board.layers[0]! : board.layers[board.layers.length - 1]!;
    const p = viewer.pickPlane(clientX, clientY, outer.y);
    if (!p) return null;
    const b = toBoard(engine.frame, p.x, p.z);
    return { board: b, layers: order, hit: engine.pickIndex.pick(b.x, b.y, order) };
  }

  let lastHover = 0;
  function onPointerMove(e: PointerEvent) {
    if (!viewer || !app.board) return;
    if (app.probe.follow && !app.pickMode && e.buttons === 0) {
      const p = viewer.pickPlane(e.clientX, e.clientY, app.probe.height);
      if (p && inGrid(p.x, p.z)) {
        app.probe.x = p.x;
        app.probe.z = p.z;
        app.probe.visible = true;
      }
    }
    const now = performance.now();
    if (now - lastHover > 60) {
      lastHover = now;
      const c = copperAt(e.clientX, e.clientY);
      app.hoverNet = c?.hit && c.hit.net > 0 ? `${app.board.nets[c.hit.net]} (${app.board.layers[c.hit.layer]!.name})` : '';
    }
  }

  function onPointerDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: PointerEvent) {
    if (!down || !viewer || !app.board) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 4) return;
    const board = app.board;
    if (app.pickMode) {
      const c = copperAt(e.clientX, e.clientY);
      const mode = app.pickMode;
      if (!c) return;
      if (mode.kind === 'net' && c.hit && c.hit.net > 0) {
        mode.onPick(board.nets[c.hit.net]!);
        app.pickMode = null;
      } else if (mode.kind === 'pad') {
        const best = c.hit?.kind === 'pad' ? c.hit.index : engine.pickIndex!.nearestPad(c.board.x, c.board.y, c.layers);
        if (best >= 0) {
          const p = board.pads[best]!;
          mode.onPick(`${p.ref}.${p.number}`);
          app.pickMode = null;
        }
      }
      return;
    }
    // plain click toggles between following the mouse and a pinned probe
    app.probe.follow = !app.probe.follow;
  }

  // --- reactions --------------------------------------------------------------------------------
  $effect(() => {
    // re-read probe readout when the probe, the sources or their models change
    void app.models;
    void [app.probe.x, app.probe.z, app.probe.height, app.probe.component, app.probe.asVoltage, app.probe.visible, app.probe.radius];
    void app.sources.map((s) => s.enabled);
    app.readout = engine.probeReadout();
    viewer?.setProbe(app.probe.visible ? [app.probe.x, app.probe.height, app.probe.z] : null, app.probe.radius);
  });

  $effect(() => {
    const s = app.selected;
    const b = app.board;
    if (!viewer || !b) return;
    const names = !s ? [] : s.type === 'signal' ? s.nets : s.type === 'diffpair' ? [s.netP, s.netN] : [];
    const pads = s?.type === 'loop' ? s.pads : [];
    const ids = new Set(names.map((n) => b.nets.indexOf(n)).filter((i) => i > 0));
    for (const pr of pads) {
      const p = b.pads.find((q) => `${q.ref}.${q.number}` === pr);
      if (p && p.net > 0) ids.add(p.net);
    }
    viewer.highlight(ids.size ? ids : null);
  });

  $effect(() => {
    // measured slices follow the frequency selection and the dB window
    void [app.view.mode, app.view.bandId, app.view.lineF, app.view.dbLow, app.view.dbHigh, app.view.colormap, app.composite];
    untrack(() => showMeasurement());
  });

  $effect(() => {
    // field lines follow the selected source and its geometry
    void app.selectedId;
    void app.models;
    void app.view.showFieldLines;
    void app.planes;
    engine.updateFieldLines();
  });

  // Sound follows the probe readout. The effect only tracks the values listed here; the
  // update itself runs untracked, otherwise reading app.readout inside the effect that writes
  // it re-triggers the effect over and over (that froze the UI for seconds per mouse move).
  $effect(() => {
    void [app.readout, app.audio.volume, app.audio.pitchAt25MHz, app.audio.enabled, app.view.dbLow, app.view.dbHigh];
    untrack(() => scheduleAudio());
  });

  let audioQueued = false;
  function scheduleAudio() {
    if (audioQueued || !app.audio.enabled) return;
    audioQueued = true;
    requestAnimationFrame(() => {
      audioQueued = false;
      updateAudio();
    });
  }

  function updateAudio() {
    if (!app.audio.enabled || !viewer) return;
    const r = app.readout;
    const voices: Voice[] = [];
    if (r) {
      for (const s of r.sources) {
        const src = app.sources.find((x) => x.id === s.id);
        const m = app.models[s.id];
        if (!src || !m) continue;
        voices.push({
          id: s.id,
          f0: src.waveform.f0,
          lines: m.lines,
          db: s.db,
          position: [m.centre[0] - app.probe.x, m.centre[1] - app.probe.height, m.centre[2] - app.probe.z],
        });
      }
    }
    const cam = viewer.camera;
    const fwd = cam.getWorldDirection(cam.position.clone().set(0, 0, 0));
    sonifier.update(voices, {
      volume: app.audio.volume,
      pitchAt25MHz: app.audio.pitchAt25MHz,
      dbLow: app.view.dbLow,
      dbHigh: app.view.dbHigh,
      listenerForward: [fwd.x, fwd.y, fwd.z],
      listenerUp: [cam.up.x, cam.up.y, cam.up.z],
    });
  }

  async function toggleAudio() {
    if (app.audio.enabled) {
      app.audio.enabled = false;
      await sonifier.stop();
    } else {
      await sonifier.start();
      app.audio.enabled = true;
      updateAudio();
    }
  }

  $effect(() => {
    if (!app.toast) return;
    const id = setTimeout(() => (app.toast = ''), 5000);
    return () => clearTimeout(id);
  });
</script>

<div
  class="app"
  role="application"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    if (e.target === e.currentTarget) dragging = false;
  }}
  ondrop={onDrop}
>
  <header class="top">
    <div class="brand">
      <span class="name">{branding.displayName}</span>
      <span class="badge" title={t.app.workingTitle}>{t.app.workingTitle}</span>
      {#if app.board}<span class="file value">{app.board.source.fileName}</span>{/if}
    </div>
    <div class="actions">
      <button class="btn" onclick={openDialog}>{t.top.open}</button>
      <button class="btn" onclick={loadDemo}>{t.top.demo}</button>
      <button class="btn" onclick={saveScenario} disabled={!app.board}>{t.top.saveScenario}</button>
      <button class="btn" onclick={loadScenario} disabled={!app.board}>{t.top.loadScenario}</button>
      <button class="btn" onclick={snapshot} disabled={!app.board}>{t.top.snapshot}</button>
      <button class="btn" class:on={ant} onclick={toggleAnt} disabled={!app.board} title={t.top.antHint}>{ant ? t.top.overview : t.top.antView}</button>
      <label class="quality">
        <span>{t.top.quality}</span>
        <select value={app.quality} onchange={(e) => engine.setQuality((e.currentTarget as HTMLSelectElement).value as Quality)}>
          <option value="preview">{t.top.qualityOptions.preview}</option>
          <option value="normal">{t.top.qualityOptions.normal}</option>
          <option value="fine">{t.top.qualityOptions.fine}</option>
        </select>
      </label>
      <label class="quality">
        <span class="sr-only">{t.top.language}</span>
        <select class="lang" value={i18n.lang} aria-label={t.top.language} onchange={(e) => setLang((e.currentTarget as HTMLSelectElement).value as Lang)}>
          {#each LANGS as l (l)}<option value={l}>{l.toUpperCase()}</option>{/each}
        </select>
      </label>
      <span class="status value">
        {#if app.compute.busy}{t.top.computing} {Math.round(app.compute.progress * 100)} %{:else if app.compute.lastMs > 0}{t.top.computed(app.compute.lastMs)}{/if}
      </span>
    </div>
    <button class="btn panel-toggle" class:on={panelOpen} aria-expanded={panelOpen} aria-controls="right-panel" onclick={() => (panelOpen = !panelOpen)}>
      {t.top.panel}
    </button>
  </header>

  <aside class="left">
    <SourcesPanel />
  </aside>

  <main class="view">
    {#if app.compute.busy}<div class="progress" style:width={`${app.compute.progress * 100}%`}></div>{/if}
    <div
      class="canvas"
      class:picking={!!app.pickMode}
      bind:this={viewEl}
      onpointermove={onPointerMove}
      onpointerdown={onPointerDown}
      onpointerup={onPointerUp}
      role="presentation"
    ></div>

    {#if !app.board}
      <div class="empty">
        <h1>{app.loading ? t.empty.loading : t.empty.title}</h1>
        <p>{t.empty.body}</p>
        <div class="row">
          <button class="btn primary" onclick={loadDemo}>{t.empty.demo}</button>
          <button class="btn" onclick={openDialog}>{t.empty.open}</button>
        </div>
        <p class="hint">{t.empty.demoHint}</p>
      </div>
    {/if}
    {#if dragging}<div class="dropzone">{t.empty.drop}</div>{/if}

    <div class="statusline value">
      {#if app.pickMode}<span class="pick">{app.pickMode.kind === 'pad' ? t.editor.picking : t.editor.pickingNet}</span>{/if}
      {#if app.hoverNet}<span>{app.hoverNet}</span>{/if}
      {#if app.board && app.probe.visible}<span class="probe">{app.probe.follow ? t.probe.follow : t.probe.pinned}</span>{/if}
      {#if ant}<span>{t.top.antHint}</span>{/if}
    </div>
    {#if app.toast}<div class="toast" role="status">{app.toast}</div>{/if}
  </main>

  <aside class="right" class:open={panelOpen} id="right-panel">
    <ViewPanel onpickmodels={pickModels} />
  </aside>

  <footer class="spectrum">
    <SpectrumPanel ontoggleaudio={toggleAudio} />
  </footer>
</div>

<style>
  .app {
    display: grid;
    height: 100%;
    grid-template-columns: 300px minmax(0, 1fr) 270px;
    grid-template-rows: 46px minmax(0, 1fr) 220px;
    grid-template-areas:
      'top top top'
      'left view right'
      'left spec right';
  }
  .top {
    grid-area: top;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px;
    background: var(--plate);
    border-bottom: 1px solid var(--line);
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.01em;
  }
  .badge {
    font-size: 11px;
    color: var(--faint);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0 7px;
  }
  .file {
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    min-width: 0;
    /* keeps absolutely placed children (sr-only) inside the scroll box */
    position: relative;
  }
  .quality {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .quality select {
    width: 140px;
  }
  .quality select.lang {
    width: 58px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .status {
    min-width: 150px;
    color: var(--muted);
    font-size: 12px;
    text-align: right;
  }
  .left {
    grid-area: left;
    background: var(--plate);
    border-right: 1px solid var(--line);
    min-height: 0;
  }
  .right {
    grid-area: right;
    background: var(--plate);
    border-left: 1px solid var(--line);
    min-height: 0;
  }
  .view {
    grid-area: view;
    position: relative;
    min-height: 0;
    background: var(--viewport);
  }
  .canvas {
    position: absolute;
    inset: 0;
  }
  .canvas.picking {
    cursor: crosshair;
  }
  .progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    background: var(--field);
    z-index: 2;
    transition: width 120ms linear;
  }
  .spectrum {
    grid-area: spec;
    background: var(--plate);
    border-top: 1px solid var(--line);
    min-height: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    pointer-events: none;
  }
  .empty > * {
    pointer-events: auto;
  }
  .empty h1 {
    font-size: 22px;
    font-weight: 500;
    margin: 0 0 6px;
  }
  .empty p {
    max-width: 52ch;
    color: var(--muted);
    margin: 0 0 14px;
  }
  .empty .row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .dropzone {
    position: absolute;
    inset: 12px;
    border: 2px dashed var(--field);
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 18px;
    color: var(--field);
    background: rgba(242, 163, 58, 0.06);
    pointer-events: none;
  }
  .statusline {
    position: absolute;
    left: 10px;
    bottom: 8px;
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
  }
  .statusline .pick {
    color: var(--field);
  }
  .statusline .probe {
    color: var(--probe);
  }
  .toast {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--plate-2);
    border: 1px solid var(--warn);
    color: var(--text);
    padding: 8px 14px;
    border-radius: var(--radius-m);
  }
  .panel-toggle {
    display: none;
    flex: none;
  }
  @media (max-width: 1100px) {
    .app {
      grid-template-columns: 260px minmax(0, 1fr) 0;
    }
    .panel-toggle {
      display: inline-flex;
    }
    .right {
      display: none;
      position: fixed;
      top: 46px;
      right: 0;
      bottom: 0;
      width: min(300px, 100vw);
      z-index: 20;
      overflow-y: auto;
      box-shadow: -8px 0 24px rgb(0 0 0 / 0.35);
    }
    .right.open {
      display: block;
    }
  }
  @media (max-width: 760px) {
    .app {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 46px minmax(320px, 1fr) 200px auto;
      grid-template-areas: 'top' 'view' 'spec' 'left';
      overflow-y: auto;
    }
    .actions .btn:not(:nth-child(-n + 2)),
    .quality,
    .status,
    .badge,
    .file {
      display: none;
    }
  }
</style>
