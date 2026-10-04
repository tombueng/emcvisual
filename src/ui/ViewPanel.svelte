<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t, fmtNum } from '../i18n';
  import { BANDS } from '../physics/spectrum';
  import { C0, formatEng } from '../physics/units';
  import type { ViewMode } from '../state/scenario';
  import DiagnosticsPanel from './DiagnosticsPanel.svelte';
  import ScannerPanel from './ScannerPanel.svelte';
  import { downloadText, pickFile } from '../state/persist';
  import { htmlInCanvasSupported } from '../render/worldCallouts';

  const htmlInCanvas = htmlInCanvasSupported();

  interface Props {
    onpickmodels: () => void;
  }
  let { onpickmodels }: Props = $props();

  function exportSlice() {
    const csv = engine.sliceCsv(app.view.sliceHeight);
    if (csv) downloadText(`${(app.board?.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '')}-schnitt-${app.view.sliceHeight}mm.csv`, csv, 'text/csv');
  }

  const modes: ViewMode[] = ['all', 'band', 'line'];

  // --- stage 3: openEMS -------------------------------------------------------------------------
  const baseName = () => (app.board?.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '');
  function exportJob() {
    const json = engine.exportFullwaveJob();
    if (!json) return;
    downloadText(`${baseName()}.openems-job.json`, json);
  }
  async function loadResult() {
    const f = await pickFile('.bin');
    if (!f) return;
    try {
      engine.loadFullwave(await f.arrayBuffer(), f.name);
    } catch {
      app.toast = t.fullwave.failed;
    }
  }
  const hasExportable = $derived(app.sources.some((s) => s.enabled && s.type !== 'inductor' && app.models[s.id]));

  const reselect = () => {
    engine.recompose();
    engine.scheduleSave();
  };
  const restyle = () => {
    engine.applyViewToViewer();
    engine.scheduleSave();
  };

  // quasi-static validity for the grid size (PHYSIK.md §2): k·r <= 0.3
  const fQs = $derived.by(() => {
    const g = engine.grid;
    if (!g || !app.board) return 0;
    const r = Math.hypot(g.nx * g.dx, g.nz * g.dz) / 2 / 1000;
    return (0.3 * C0) / (2 * Math.PI * r);
  });

  const planeNet = (layer: number) => app.planes.find((p) => p.layer === layer);
  const netNames = $derived(app.board ? app.board.nets.filter(Boolean) : []);
  const range = $derived(app.composite ? { lo: Math.floor(app.composite.minDb), hi: Math.ceil(app.composite.maxDb) } : { lo: 0, hi: 140 });
</script>

<section class="panel">
  <header>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={app.rightTab === 'view'} class:active={app.rightTab === 'view'} onclick={() => (app.rightTab = 'view')}>{t.diag.viewTab}</button>
      <button role="tab" aria-selected={app.rightTab === 'diag'} class:active={app.rightTab === 'diag'} onclick={() => (app.rightTab = 'diag')}>
        {t.diag.tab}{#if app.diagnostics.length}<span class="count value">{app.diagnostics.length}</span>{/if}
      </button>
      <button role="tab" aria-selected={app.rightTab === 'scan'} class:active={app.rightTab === 'scan'} onclick={() => (app.rightTab = 'scan')}>{t.scan.tab}</button>
    </div>
  </header>
  {#if app.rightTab === 'diag'}
    <div class="scroll body"><DiagnosticsPanel /></div>
  {:else if app.rightTab === 'scan'}
    <div class="scroll body"><ScannerPanel /></div>
  {:else}
  <div class="scroll body">
    <div class="section-title">{t.view.fieldKind}</div>
    <div class="seg two" role="radiogroup" aria-label={t.view.fieldKind}>
      {#each ['H', 'E'] as const as k (k)}
        <button role="radio" aria-checked={app.view.fieldKind === k} class:active={app.view.fieldKind === k} onclick={() => engine.setFieldKind(k)}>{t.view.fieldKinds[k]}</button>
      {/each}
    </div>
    {#if app.view.fieldKind === 'E'}<p class="hint">{t.view.fieldKindHint}</p>{/if}
    {#if app.fullwave}
      <div class="section-title">{t.fullwave.origin}</div>
      <div class="seg two" role="radiogroup" aria-label={t.fullwave.origin}>
        {#each ['fast', 'fullwave'] as const as o (o)}
          <button role="radio" aria-checked={app.fieldOrigin === o} class:active={app.fieldOrigin === o} onclick={() => engine.setFieldOrigin(o)}>{t.fullwave.origins[o]}</button>
        {/each}
      </div>
      {#if app.fieldOrigin === 'fullwave' && app.view.fieldKind === 'E'}<p class="hint">{t.fullwave.eOnly}</p>{/if}
    {/if}

    <div class="section-title">{t.view.frequency}</div>
    <div class="seg" role="radiogroup" aria-label={t.view.frequency}>
      {#each modes as m (m)}
        <button role="radio" aria-checked={app.view.mode === m} class:active={app.view.mode === m} onclick={() => { app.view.mode = m; reselect(); }}>{t.view.modes[m]}</button>
      {/each}
    </div>

    {#if app.view.mode === 'band'}
      <div class="field">
        <label for="v-band">Band</label>
        <select id="v-band" bind:value={app.view.bandId} onchange={reselect}>
          {#each BANDS.filter((b) => b.id !== 'all') as b (b.id)}
            <option value={b.id}>{t.view.bands[b.id]}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if app.view.mode === 'line'}
      <div class="lines scroll">
        {#if app.lines.length === 0}
          <p class="hint">{t.view.linesEmpty}</p>
        {/if}
        {#each app.lines as l (l.f)}
          <button class="line" class:active={Math.abs(app.view.lineF - l.f) < 1} onclick={() => { app.view.lineF = l.f; reselect(); }} title={l.sources.join(', ')}>
            <span class="value">{formatEng(l.f, 'Hz', 4)}</span>
            <span class="value db">{l.peakDb.toFixed(0)}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="section-title">{t.view.window}</div>
    <label class="check"><input type="checkbox" bind:checked={app.view.autoWindow} onchange={() => { engine.recompose(); engine.scheduleSave(); }} /> {t.view.auto}</label>
    <div class="field">
      <label for="v-hi">max</label>
      <div class="slider">
        <input id="v-hi" type="range" min={range.lo} max={range.hi} step="1" bind:value={app.view.dbHigh} oninput={() => { app.view.autoWindow = false; if (app.view.dbHigh <= app.view.dbLow) app.view.dbLow = app.view.dbHigh - 1; restyle(); }} />
        <span class="value">{app.view.dbHigh}</span>
      </div>
    </div>
    <div class="field">
      <label for="v-lo">min</label>
      <div class="slider">
        <input id="v-lo" type="range" min={range.lo} max={range.hi} step="1" bind:value={app.view.dbLow} oninput={() => { app.view.autoWindow = false; if (app.view.dbLow >= app.view.dbHigh) app.view.dbHigh = app.view.dbLow + 1; restyle(); }} />
        <span class="value">{app.view.dbLow}</span>
      </div>
    </div>
    <p class="hint">{app.view.fieldKind === 'E' ? t.units.dBuVm : t.units.dBuAm}</p>

    <div class="section-title">{t.view.volume}</div>
    <label class="check"><input type="checkbox" bind:checked={app.view.showVolume} onchange={restyle} /> {t.view.volume}</label>
    <label class="check"><input type="checkbox" bind:checked={app.view.showIso} onchange={restyle} /> {t.view.iso}</label>
    <div class="field">
      <label for="v-dens">{t.view.density}</label>
      <input id="v-dens" type="range" min="0.05" max="3" step="0.05" bind:value={app.view.density} oninput={restyle} />
    </div>
    <div class="field">
      <label for="v-cmap">{t.view.colormap}</label>
      <select id="v-cmap" bind:value={app.view.colormap} onchange={restyle}>
        <option value="inferno">{t.view.colormaps.inferno}</option>
        <option value="turbo">{t.view.colormaps.turbo}</option>
      </select>
    </div>
    <div class="section-title">{t.callouts.title}</div>
    <label class="check"><input type="checkbox" bind:checked={app.view.callouts.hints} onchange={() => engine.scheduleSave()} /> {t.callouts.hints}</label>
    {#if app.view.callouts.hints}
      <div class="field">
        <label for="v-maxhints">{t.callouts.maxHints}</label>
        <select id="v-maxhints" bind:value={app.view.callouts.maxHints} onchange={() => engine.scheduleSave()}>
          <option value={3}>{t.callouts.top(3)}</option>
          <option value={5}>{t.callouts.top(5)}</option>
          <option value={10}>{t.callouts.top(10)}</option>
          <option value={0}>{t.callouts.all}</option>
        </select>
      </div>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={app.view.callouts.sources} onchange={() => engine.scheduleSave()} /> {t.callouts.sources}</label>
    <label class="check"><input type="checkbox" bind:checked={app.view.callouts.hotspots} onchange={() => engine.scheduleSave()} /> {t.callouts.hotspots}</label>
    <label class="check" class:disabled={!htmlInCanvas}>
      <input type="checkbox" bind:checked={app.view.callouts.inWorld} disabled={!htmlInCanvas} onchange={() => engine.scheduleSave()} />
      {t.callouts.inWorld}
    </label>
    <p class="hint">{htmlInCanvas ? t.callouts.inWorldHint : t.callouts.inWorldMissing}</p>

    <div class="section-title">{t.view.fieldLinesTitle}</div>
    <label class="check"><input type="checkbox" bind:checked={app.view.showFieldLines} onchange={() => { engine.updateFieldLines(); engine.scheduleSave(); }} /> {t.view.fieldLines}</label>
    {#if app.fieldLinesBusy}<p class="hint">{t.view.fieldLinesBusy}</p>{/if}
    <label class="check"><input type="checkbox" bind:checked={app.view.showSlice} onchange={restyle} /> {t.view.slice}</label>
    {#if app.view.showSlice}
      <div class="field">
        <label for="v-slice">{t.view.sliceHeight}</label>
        <div class="slider">
          <input id="v-slice" type="range" min="0.2" max="12" step="0.1" bind:value={app.view.sliceHeight} oninput={restyle} />
          <span class="value">{fmtNum(app.view.sliceHeight)} mm</span>
        </div>
      </div>
      <button class="btn small" onclick={exportSlice} disabled={!app.composite}>{t.view.sliceCsv}</button>
    {/if}

    <div class="section-title">{t.view.returnModel}</div>
    <select aria-label={t.view.returnModel} value={app.returnModel} onchange={(e) => { engine.setReturnModel((e.currentTarget as HTMLSelectElement).value as 'image' | 'detour'); engine.scheduleSave(); }}>
      <option value="detour">{t.view.returnModels.detour}</option>
      <option value="image">{t.view.returnModels.image}</option>
    </select>
    {#if app.returnModel === 'detour'}
      <label class="check"><input type="checkbox" bind:checked={app.view.showReturnPaths} onchange={() => { engine.pushReturnPaths(); engine.scheduleSave(); }} /> {t.view.returnPaths}</label>
      <p class="hint">{t.view.returnHint}</p>
    {/if}

    <div class="section-title">{t.view.layers}</div>
    {#if app.board}
      <table class="layers">
        <tbody>
          {#each app.board.layers as layer (layer.index)}
            <tr>
              <td><input type="checkbox" bind:checked={app.layerVisible[layer.index]} onchange={restyle} aria-label={layer.name} /></td>
              <td class="value">{layer.name}</td>
              <td>
                <select
                  aria-label={`${t.view.plane} ${layer.name}`}
                  value={layer.name in app.planeOverrides ? (app.planeOverrides[layer.name] ?? '__none') : '__auto'}
                  onchange={(e) => {
                    const v = (e.currentTarget as HTMLSelectElement).value;
                    engine.setPlaneOverride(layer.name, v === '__auto' ? undefined : v === '__none' ? null : v);
                  }}
                >
                  <option value="__auto">{planeNet(layer.index) && !planeNet(layer.index)?.override ? `${t.view.planeAuto}: ${app.board.nets[planeNet(layer.index)!.net]}` : t.view.planeAuto}</option>
                  <option value="__none">{t.view.planeNone}</option>
                  {#each netNames as n (n)}
                    <option value={n}>{n}</option>
                  {/each}
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <label class="check"><input type="checkbox" checked={app.view.substrateOpacity < 1} onchange={(e) => { app.view.substrateOpacity = (e.currentTarget as HTMLInputElement).checked ? 0.25 : 1; restyle(); }} /> {t.view.substrate}</label>
    <label class="check"><input type="checkbox" bind:checked={app.view.showComponents} onchange={restyle} /> {t.view.components}</label>
    <div class="models">
      <button class="btn small" onclick={onpickmodels} disabled={!app.board}>{t.models.load}</button>
      {#if app.models3d}<span class="hint value">{t.models.loaded(app.models3d.matched, app.models3d.total)}</span>{/if}
    </div>
    <p class="hint">{t.models.hint}</p>
    <code class="cmd">kicad-cli pcb export glb --no-board-body --subst-models board.kicad_pcb</code>

    <div class="section-title">{t.view.fMax}</div>
    <select value={String(app.fMax)} onchange={(e) => engine.setFMax(Number((e.currentTarget as HTMLSelectElement).value))} aria-label={t.view.fMax}>
      <option value="1000000000">1 GHz</option>
      <option value="3000000000">3 GHz</option>
      <option value="6000000000">6 GHz</option>
    </select>
    {#if fQs > 0}
      <p class="hint">{t.view.validity(formatEng(fQs, 'Hz', 2))}</p>
    {/if}

    <div class="section-title">{t.fullwave.title}</div>
    <p class="hint">{t.fullwave.hint}</p>
    <div class="models">
      <button class="btn small" onclick={exportJob} disabled={!app.board || !hasExportable}>{t.fullwave.exportJob}</button>
      <button class="btn small" onclick={loadResult} disabled={!app.board}>{t.fullwave.loadResult}</button>
    </div>
    <code class="cmd">python tools/openems/run_job.py {baseName()}.openems-job.json</code>
    {#if app.fullwave}
      <p class="hint value">{t.fullwave.loaded(app.fullwave.sources.length, formatEng(app.fullwave.fMin, 'Hz', 2), formatEng(app.fullwave.fMax, 'Hz', 2), app.fullwave.nFreqs)}</p>
      <p class="hint value">{t.fullwave.solver(fmtNum(app.fullwave.res, 2), fmtNum(app.fullwave.seconds / 60, 1))}</p>
      {#if app.fullwave.otherBoard}<p class="hint warn-text">{t.fullwave.otherBoard}</p>{/if}
      {#if app.fullwave.skipped.length}<p class="hint">{t.fullwave.skipped(app.fullwave.skipped.map((s) => s.name).join(', '))}</p>{/if}
    {/if}
  </div>
  {/if}
</section>

<style>
  .check.disabled {
    opacity: 0.5;
  }
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  header {
    padding: 8px 12px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .tabs {
    display: flex;
    gap: 14px;
  }
  .tabs button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 4px 0 7px;
    font-weight: 600;
    font-size: 14px;
    color: var(--muted);
    cursor: pointer;
  }
  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--field);
  }
  .count {
    margin-left: 6px;
    font-size: 11px;
    color: #1b1206;
    background: var(--field);
    border-radius: 8px;
    padding: 0 6px;
  }
  .body {
    padding: 8px 12px 16px;
    flex: 1;
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    overflow: hidden;
  }
  .seg.two {
    grid-template-columns: repeat(2, 1fr);
  }
  .seg button {
    border: 0;
    background: var(--viewport);
    padding: 5px 0;
    cursor: pointer;
    color: var(--muted);
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button.active {
    background: var(--plate-3);
    color: var(--field);
  }
  .lines {
    max-height: 210px;
    margin-top: 6px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-s);
  }
  .line {
    display: flex;
    justify-content: space-between;
    width: 100%;
    border: 0;
    background: transparent;
    padding: 3px 8px;
    cursor: pointer;
  }
  .line:hover {
    background: var(--plate-2);
  }
  .line.active {
    background: var(--plate-3);
    color: var(--field);
  }
  .db {
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0;
    cursor: pointer;
  }
  .slider {
    display: grid;
    grid-template-columns: 1fr 52px;
    gap: 6px;
    align-items: center;
  }
  .slider .value {
    text-align: right;
    font-size: 12px;
  }
  .models {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }
  .models .hint {
    margin: 0;
  }
  .cmd {
    display: block;
    font-size: 11px;
    color: var(--muted);
    background: var(--viewport);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-s);
    padding: 4px 6px;
    word-break: break-all;
    user-select: all;
  }
  .layers {
    width: 100%;
    border-collapse: collapse;
  }
  .layers td {
    padding: 2px 0;
  }
  .layers td:first-child {
    width: 22px;
  }
  .layers td:nth-child(2) {
    width: 64px;
  }
  .layers select {
    height: 24px;
    font-size: 12px;
  }
</style>
