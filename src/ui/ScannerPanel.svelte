<script lang="ts">
  import { boardBaseName } from '../import';
  import { app } from '../state/app.svelte';
  import { t, fmtNum } from '../i18n';
  import { formatEng } from '../physics/units';
  import EngInput from './EngInput.svelte';
  import NetInput from './NetInput.svelte';
  import { downloadText, pickFile } from '../state/persist';
  import { measurementFromJson, measurementToJson } from '../scanner/measurement';
  import { serialAvailable } from '../scanner/webserial';
  import {
    scanner,
    connect,
    disconnect,
    home,
    jog,
    planSeconds,
    currentPlan,
    registration,
    startScan,
    stopScan,
    showMeasurement,
    fitToMeasurement,
    applyFit,
  } from '../state/scanner.svelte';

  const pads = $derived(app.board ? app.board.pads.map((p) => `${p.ref}.${p.number}`) : []);
  const plan = $derived.by(() => {
    void [scanner.step, scanner.heights, scanner.clearance, scanner.area, scanner.probeSize, app.board];
    return currentPlan();
  });
  const seconds = $derived.by(() => {
    void [plan, scanner.settleMs, scanner.averages, scanner.feed, scanner.points, scanner.receiverKind];
    return planSeconds();
  });
  const regOk = $derived.by(() => {
    void [scanner.refs.map((r) => [r.pad, r.px, r.py]), scanner.zSurface, scanner.positionerKind, app.board];
    return registration() !== null;
  });
  const fmtTime = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${fmtNum(s / 3600, 1)} h`);

  function useHead(i: number) {
    const r = scanner.refs[i];
    if (r && scanner.head) {
      r.px = scanner.head.x;
      r.py = scanner.head.y;
    }
  }

  function pickRef(i: number) {
    app.pickMode = {
      kind: 'pad',
      onPick: (v) => {
        const r = scanner.refs[i];
        if (r) r.pad = v;
      },
    };
  }

  function show(index: number, mode: 'measured' | 'diff') {
    scanner.shown = scanner.shown?.index === index && scanner.shown.mode === mode ? null : { index, mode };
    showMeasurement();
  }

  function save(index: number) {
    const m = scanner.measurements[index];
    if (m) downloadText(`${boardBaseName(m.board.fileName)}-${m.createdAt.slice(0, 16).replace(/[:T]/g, '-')}.measurement.json`, measurementToJson(m));
  }

  async function load() {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const m = measurementFromJson(await f.text());
      if (m.board.hash && m.board.hash !== app.boardHash) app.toast = t.scan.otherBoard;
      scanner.measurements = [...scanner.measurements, m];
      show(scanner.measurements.length - 1, 'measured');
    } catch {
      app.toast = t.scan.loadFailed;
    }
  }

  function remove(index: number) {
    scanner.measurements = scanner.measurements.filter((_, i) => i !== index);
    scanner.shown = null;
    showMeasurement();
  }
</script>

<div class="scan">
  <p class="hint">{t.scan.intro}</p>

  <div class="section-title">{t.scan.devices}</div>
  <div class="field">
    <label for="sc-pos">{t.scan.positioner}</label>
    <select id="sc-pos" bind:value={scanner.positionerKind} disabled={scanner.connected}>
      <option value="virtual">{t.scan.virtual}</option>
      <option value="octoprint">OctoPrint</option>
      <option value="usb" disabled={!serialAvailable()}>{t.scan.usbGcode}</option>
    </select>
  </div>
  {#if scanner.positionerKind === 'octoprint'}
    <div class="field">
      <label for="sc-url">URL</label>
      <input id="sc-url" type="text" bind:value={scanner.octoUrl} disabled={scanner.connected} />
    </div>
    <div class="field">
      <label for="sc-key">{t.scan.apiKey}</label>
      <input id="sc-key" type="password" autocomplete="off" bind:value={scanner.octoKey} disabled={scanner.connected} />
    </div>
    <p class="hint">{t.scan.octoHint}</p>
  {/if}
  <div class="field">
    <label for="sc-rx">{t.scan.receiver}</label>
    <select id="sc-rx" bind:value={scanner.receiverKind} disabled={scanner.connected}>
      <option value="virtual">{t.scan.virtual}</option>
      <option value="tinysa" disabled={!serialAvailable()}>tinySA (USB)</option>
    </select>
  </div>
  <div class="field">
    <label for="sc-probe">{t.scan.probe}</label>
    <div class="row">
      <select id="sc-probe" bind:value={scanner.probeKind}>
        <option value="h-loop">{t.scan.hLoop}</option>
        <option value="e-stub">{t.scan.eStub}</option>
      </select>
      <EngInput value={scanner.probeSize / 1000} unit="m" min={1e-5} onchange={(v) => (scanner.probeSize = v * 1000)} />
    </div>
  </div>
  <div class="row">
    {#if scanner.connected}
      <button class="btn small" onclick={disconnect} disabled={scanner.running}>{t.scan.disconnect}</button>
    {:else}
      <button class="btn small primary" onclick={connect} disabled={!app.board}>{t.scan.connect}</button>
    {/if}
    {#if scanner.status}<span class="warn-text">{(t.scan.statusText as Record<string, string>)[scanner.status] ?? scanner.status}</span>{/if}
  </div>

  {#if scanner.positionerKind !== 'virtual'}
    <div class="section-title">{t.scan.alignment}</div>
    <p class="hint">{t.scan.alignHint}</p>
    <div class="jog">
      <button class="btn small" onclick={() => jog(0, scanner.jogStep, 0)} disabled={!scanner.connected}>Y+</button>
      <button class="btn small" onclick={() => jog(-scanner.jogStep, 0, 0)} disabled={!scanner.connected}>X−</button>
      <button class="btn small" onclick={() => jog(scanner.jogStep, 0, 0)} disabled={!scanner.connected}>X+</button>
      <button class="btn small" onclick={() => jog(0, -scanner.jogStep, 0)} disabled={!scanner.connected}>Y−</button>
      <button class="btn small" onclick={() => jog(0, 0, scanner.jogStep)} disabled={!scanner.connected}>Z+</button>
      <button class="btn small" onclick={() => jog(0, 0, -scanner.jogStep)} disabled={!scanner.connected}>Z−</button>
      <select bind:value={scanner.jogStep} aria-label={t.scan.jogStep}>
        <option value={10}>10 mm</option>
        <option value={1}>1 mm</option>
        <option value={0.1}>{fmtNum(0.1, 1)} mm</option>
      </select>
      <button class="btn small" onclick={home} disabled={!scanner.connected}>{t.scan.home}</button>
    </div>
    {#if scanner.head}<p class="hint value">X {fmtNum(scanner.head.x, 2)} · Y {fmtNum(scanner.head.y, 2)} · Z {fmtNum(scanner.head.z, 2)}</p>{/if}
    {#each scanner.refs as r, i (i)}
      <div class="ref">
        <NetInput value={r.pad} options={pads} placeholder={t.scan.refPad} onchange={(v) => (r.pad = v)} />
        <button class="btn ghost small" onclick={() => pickRef(i)} title={t.editor.pickIn3d}>3D</button>
        <input type="number" step="0.01" bind:value={r.px} aria-label="X" />
        <input type="number" step="0.01" bind:value={r.py} aria-label="Y" />
        <button class="btn ghost small" onclick={() => useHead(i)} disabled={!scanner.head} title={t.scan.useHead}>⌖</button>
      </div>
    {/each}
    <div class="field">
      <label for="sc-z">{t.scan.zSurface}</label>
      <input id="sc-z" type="number" step="0.01" bind:value={scanner.zSurface} />
    </div>
    {#if scanner.residual !== null}<p class="hint value">{t.scan.residual(fmtNum(scanner.residual, 2))}</p>{/if}
  {/if}

  <div class="section-title">{t.scan.plan}</div>
  <div class="field">
    <label for="sc-area">{t.scan.area}</label>
    <select id="sc-area" bind:value={scanner.area}>
      <option value="board">{t.scan.areaBoard}</option>
      <option value="probe">{t.scan.areaProbe}</option>
    </select>
  </div>
  <div class="field">
    <label for="sc-step">{t.scan.step}</label>
    <EngInput id="sc-step" value={scanner.step / 1000} unit="m" min={1e-4} onchange={(v) => (scanner.step = v * 1000)} />
  </div>
  <div class="field">
    <label for="sc-h">{t.scan.heights}</label>
    <input id="sc-h" type="text" bind:value={scanner.heights} />
  </div>
  <div class="field">
    <label for="sc-cl">{t.scan.clearance}</label>
    <EngInput id="sc-cl" value={scanner.clearance / 1000} unit="m" min={0} onchange={(v) => (scanner.clearance = v * 1000)} />
  </div>
  <div class="field">
    <label for="sc-f0">{t.scan.span}</label>
    <div class="row">
      <EngInput id="sc-f0" value={scanner.fStart} unit="Hz" min={1} onchange={(v) => (scanner.fStart = v)} />
      <EngInput value={scanner.fStop} unit="Hz" min={1} onchange={(v) => (scanner.fStop = v)} />
    </div>
  </div>
  <div class="field">
    <label for="sc-pts">{t.scan.sweepPoints}</label>
    <input id="sc-pts" type="number" min="11" max="30000" bind:value={scanner.points} />
  </div>
  <div class="field">
    <label for="sc-settle">{t.scan.settle}</label>
    <input id="sc-settle" type="number" min="0" step="50" bind:value={scanner.settleMs} />
  </div>
  <div class="field">
    <label for="sc-avg">{t.scan.averages}</label>
    <input id="sc-avg" type="number" min="1" max="20" bind:value={scanner.averages} />
  </div>
  {#if plan}<p class="hint value">{t.scan.estimate(plan.points.length, fmtTime(seconds))}</p>{/if}
  <div class="row">
    {#if scanner.running}
      <button class="btn small" onclick={stopScan}>{t.scan.stop}</button>
      <span class="value">{Math.round(scanner.progress * 100)} % · {fmtTime(scanner.etaSeconds)}</span>
    {:else}
      <button class="btn small primary" onclick={() => startScan(false)} disabled={!scanner.connected || !regOk}>{t.scan.start}</button>
      <button class="btn small" onclick={() => startScan(true)} disabled={!scanner.connected || !regOk || scanner.measurements.length === 0} title={t.scan.backgroundHint}>{t.scan.background}</button>
    {/if}
  </div>

  <div class="section-title">{t.scan.results}</div>
  {#if scanner.measurements.length === 0}<p class="hint">{t.scan.none}</p>{/if}
  <ul class="results">
    {#each scanner.measurements as m, i (m.createdAt + i)}
      <li>
        <div class="value">{m.createdAt.slice(0, 16).replace('T', ' ')} · {m.points.length} · {formatEng(m.sweep.fStart, 'Hz', 2)}–{formatEng(m.sweep.fStop, 'Hz', 2)}{m.background ? ` · ${t.scan.withBackground}` : ''}</div>
        <div class="row">
          <button class="btn small" class:on={scanner.shown?.index === i && scanner.shown.mode === 'measured'} onclick={() => show(i, 'measured')}>{t.scan.showMeasured}</button>
          <button class="btn small" class:on={scanner.shown?.index === i && scanner.shown.mode === 'diff'} onclick={() => show(i, 'diff')}>{t.scan.showDiff}</button>
          <button class="btn small" class:on={scanner.fit?.index === i} onclick={() => fitToMeasurement(i)} title={t.scan.fitHint}>{t.scan.fit}</button>
          <button class="btn ghost small" onclick={() => save(i)}>{t.scan.save}</button>
          <button class="btn ghost small" onclick={() => remove(i)} aria-label={t.scan.remove}>✕</button>
        </div>
      </li>
    {/each}
  </ul>
  <button class="btn small" onclick={load} disabled={!app.board}>{t.scan.load}</button>
  {#if scanner.shown?.mode === 'diff'}<p class="hint">{t.scan.diffHint}</p>{/if}
  {#if scanner.fit}
    <div class="section-title">{t.scan.fitTitle}</div>
    <ul class="fit">
      {#each scanner.fit.sources as f (f.id)}
        <li style:--c={f.color}>
          <span>{f.name}</span>
          <span class="value">{f.db === null ? t.scan.fitNotSeen : t.scan.fitDb(f.db)}</span>
        </li>
      {/each}
    </ul>
    <p class="hint value">{t.scan.fitResidual(fmtNum(scanner.fit.residualDb, 1), scanner.fit.points)}</p>
    <button class="btn small primary" onclick={applyFit}>{t.scan.fitApply}</button>
    <p class="hint">{t.scan.fitApplyHint}</p>
  {/if}
</div>

<style>
  .fit {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .fit li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-left: 3px solid var(--c);
    padding: 2px 8px;
    margin-bottom: 3px;
    font-size: 12px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    margin: 4px 0;
  }
  .row :global(input),
  .row select {
    flex: 1;
    min-width: 0;
  }
  .jog {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 6px;
  }
  .ref {
    display: grid;
    grid-template-columns: 1fr auto 64px 64px auto;
    gap: 4px;
    margin-bottom: 4px;
  }
  .results {
    list-style: none;
    padding: 0;
    margin: 0 0 6px;
  }
  .results li {
    border-top: 1px solid var(--line-soft);
    padding: 6px 0;
    font-size: 12px;
  }
</style>
