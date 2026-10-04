<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { BANDS } from '../physics/spectrum';
  import { C0, formatEng } from '../physics/units';
  import type { ViewMode } from '../state/scenario';

  const modes: ViewMode[] = ['all', 'band', 'line'];

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
  <header><h2>{t.view.title}</h2></header>
  <div class="scroll body">
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
    <p class="hint">{t.units.dBuAm}</p>

    <div class="section-title">{t.view.volume}</div>
    <label class="check"><input type="checkbox" bind:checked={app.view.showVolume} onchange={restyle} /> {t.view.volume}</label>
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
    <label class="check"><input type="checkbox" bind:checked={app.view.showSlice} onchange={restyle} /> {t.view.slice}</label>
    {#if app.view.showSlice}
      <div class="field">
        <label for="v-slice">{t.view.sliceHeight}</label>
        <div class="slider">
          <input id="v-slice" type="range" min="0.2" max="12" step="0.1" bind:value={app.view.sliceHeight} oninput={restyle} />
          <span class="value">{app.view.sliceHeight.toFixed(1).replace('.', ',')} mm</span>
        </div>
      </div>
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

    <div class="section-title">{t.view.fMax}</div>
    <select value={String(app.fMax)} onchange={(e) => engine.setFMax(Number((e.currentTarget as HTMLSelectElement).value))} aria-label={t.view.fMax}>
      <option value="1000000000">1 GHz</option>
      <option value="3000000000">3 GHz</option>
      <option value="6000000000">6 GHz</option>
    </select>
    {#if fQs > 0}
      <p class="hint">{t.view.validity(formatEng(fQs, 'Hz', 2))}</p>
    {/if}
  </div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--line-soft);
  }
  h2 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
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
