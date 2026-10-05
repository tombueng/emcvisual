<script lang="ts">
  import { standardShort } from '../report/texts';
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t, fmtNum } from '../i18n';
  import { formatEng } from '../physics/units';
  import { downloadText } from '../state/persist';

  function exportCsv() {
    if (!data) return;
    const name = (app.board?.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '');
    downloadText(`${name}-${app.spectrumMode}.csv`, engine.spectrumCsv(data), 'text/csv');
  }

  interface Props {
    ontoggleaudio: () => void;
  }
  let { ontoggleaudio }: Props = $props();

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let size = $state({ w: 600, h: 160 });
  let hover = $state<{ f: number; db: number; x: number; y: number } | null>(null);

  const F_MIN = 1e5;
  /** Colour of the cable estimate (worst case) in the far-field view. */
  const CM_COLOR = '#f1f5f9';
  const PAD = { l: 44, r: 10, t: 10, b: 20 };

  // what the screen shows: the probe spectrum, or the far-field estimate with limit lines
  const data = $derived.by(() => {
    if (app.spectrumMode === 'probe') return app.readout ? { ...app.readout, limits: null } : null;
    void app.models;
    void app.sources.map((s) => [s.enabled, s.waveform.f0, s.waveform.tr, s.waveform.amplitude, s.waveform.duty]);
    void app.commonMode;
    const dist = app.spectrumMode === 'far3' ? 3 : 10;
    const r = engine.farReadout(dist);
    if (!r) return null;
    // the cable estimate (worst case, 3 m) of the enabled sources, scaled to the distance
    const cm: { f: number; db: number }[] = [];
    for (const s of app.sources) {
      const e = s.enabled ? app.commonMode[s.id] : undefined;
      if (e) for (const l of e.lines) cm.push({ f: l.f, db: l.db - 20 * Math.log10(dist / 3) });
    }
    // above this frequency the board is longer than λ/4: the small-dipole formula no longer holds
    const b = app.board?.bbox;
    const fValid = b ? 299_792_458 / (4 * (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 1000)) : Infinity;
    return { sources: r.sources.map((s) => ({ ...s, h: 0, db: 0 })), total: r.total, unit: 'dBµV/m', limits: r.limits, cm, fValid };
  });

  const peak = $derived.by(() => {
    const r = data;
    if (!r || r.total.length === 0) return null;
    return r.total.reduce((a, b) => (b.db > a.db ? b : a));
  });
  // the scale also has to show the cable estimate, which is often well above the board alone
  const top = $derived.by(() => {
    let m = peak?.db ?? -Infinity;
    if (data && 'cm' in data) for (const l of data.cm ?? []) if (l.f <= app.fMax && l.db > m) m = l.db;
    return Number.isFinite(m) ? m : null;
  });
  const refLevel = $derived(top !== null ? Math.ceil(top / 10) * 10 + 10 : 120);

  $effect(() => {
    const ro = new ResizeObserver(() => {
      size = { w: wrap.clientWidth, h: wrap.clientHeight };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  const fMax = $derived(app.fMax);
  const xOf = (f: number, w: number) => PAD.l + ((Math.log10(f) - Math.log10(F_MIN)) / (Math.log10(fMax) - Math.log10(F_MIN))) * (w - PAD.l - PAD.r);
  const fOf = (x: number, w: number) => 10 ** (Math.log10(F_MIN) + ((x - PAD.l) / (w - PAD.l - PAD.r)) * (Math.log10(fMax) - Math.log10(F_MIN)));
  const yOf = (db: number, h: number) => PAD.t + ((refLevel - db) / 100) * (h - PAD.t - PAD.b);

  $effect(() => {
    draw(data, size.w, size.h, refLevel, app.view.mode, app.view.lineF, fMax);
  });

  function draw(r: typeof data, w: number, h: number, ref: number, mode: string, lineF: number, fm: number) {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(canvas);
    const col = (v: string) => css.getPropertyValue(v).trim();
    const x0 = PAD.l;
    const x1 = w - PAD.r;
    const y0 = PAD.t;
    const y1 = h - PAD.b;

    // CISPR bands
    g.fillStyle = 'rgba(76, 201, 240, 0.05)';
    for (const [a, b] of [[30e6, 230e6], [230e6, 1e9]] as const) {
      if (a > fm) continue;
      g.fillRect(xOf(a, w), y0, xOf(Math.min(b, fm), w) - xOf(a, w), y1 - y0);
    }

    // graticule: 10 dB per division, decades on the x axis
    g.strokeStyle = col('--line-soft');
    g.lineWidth = 1;
    g.font = `11px ${col('--font-cond')}`;
    g.fillStyle = col('--faint');
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let k = 0; k <= 10; k++) {
      const y = y0 + ((y1 - y0) * k) / 10;
      g.beginPath();
      g.moveTo(x0, Math.round(y) + 0.5);
      g.lineTo(x1, Math.round(y) + 0.5);
      g.stroke();
      if (k % 2 === 0) g.fillText(String(ref - k * 10), x0 - 6, y);
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let e = 5; e <= 10; e++) {
      const f = 10 ** e;
      if (f > fm) break;
      const x = Math.round(xOf(f, w)) + 0.5;
      g.strokeStyle = col('--line');
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
      g.fillText(formatEng(f, 'Hz', 2), x, y1 + 4);
      g.strokeStyle = col('--line-soft');
      for (let m = 2; m < 10; m++) {
        const xm = Math.round(xOf(f * m, w)) + 0.5;
        if (f * m > fm) break;
        g.beginPath();
        g.moveTo(xm, y0);
        g.lineTo(xm, y1);
        g.stroke();
      }
    }

    if (!r) return;
    const clampY = (db: number) => Math.max(y0, Math.min(y1, yOf(db, h)));
    // per-source stems
    const order = [...r.sources].sort((a, b) => b.h - a.h);
    for (const s of order) {
      g.strokeStyle = s.color;
      g.globalAlpha = 0.8;
      g.beginPath();
      for (const l of s.lines) {
        if (l.f < F_MIN || l.f > fm) continue;
        const x = Math.round(xOf(l.f, w)) + 0.5;
        g.moveTo(x, y1);
        g.lineTo(x, clampY(l.db));
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    // total: amber tick on every line, plus a peak envelope (running max over a few pixels)
    const cols = Math.max(1, Math.floor(x1 - x0));
    const colMax = new Float32Array(cols).fill(-Infinity);
    g.strokeStyle = col('--field');
    g.beginPath();
    for (const l of r.total) {
      if (l.f < F_MIN || l.f > fm) continue;
      const x = xOf(l.f, w);
      const y = clampY(l.db);
      g.moveTo(x - 2, y);
      g.lineTo(x + 2, y);
      const c = Math.min(cols - 1, Math.max(0, Math.floor(x - x0)));
      if (l.db > colMax[c]!) colMax[c] = l.db;
    }
    g.stroke();
    const R = 4;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.9;
    g.beginPath();
    let started = false;
    for (let c = 0; c < cols; c++) {
      let m = -Infinity;
      for (let k = Math.max(0, c - R); k <= Math.min(cols - 1, c + R); k++) if (colMax[k]! > m) m = colMax[k]!;
      if (!Number.isFinite(m)) {
        started = false;
        continue;
      }
      const y = clampY(m);
      if (!started) {
        g.moveTo(x0 + c, y);
        started = true;
      } else g.lineTo(x0 + c, y);
    }
    g.stroke();
    g.globalAlpha = 1;
    g.lineWidth = 1;

    // the board longer than λ/4: hatched, the far-field formula is not valid there
    const fv = 'fValid' in r ? (r.fValid as number) : Infinity;
    if (fv < fm) {
      const xv = xOf(Math.max(fv, F_MIN), w);
      g.save();
      g.beginPath();
      g.rect(xv, y0, x1 - xv, y1 - y0);
      g.clip();
      g.strokeStyle = 'rgba(160, 170, 185, 0.18)';
      for (let k = -(y1 - y0); k < x1 - xv; k += 8) {
        g.beginPath();
        g.moveTo(xv + k, y1);
        g.lineTo(xv + k + (y1 - y0), y0);
        g.stroke();
      }
      g.restore();
    }
    // with cables, worst case: a dashed envelope over all sources
    const cmLines = 'cm' in r ? (r.cm as { f: number; db: number }[]) : [];
    if (cmLines.length) {
      const cmMax = new Float32Array(cols).fill(-Infinity);
      for (const l of cmLines) {
        if (l.f < F_MIN || l.f > fm) continue;
        const c = Math.min(cols - 1, Math.max(0, Math.floor(xOf(l.f, w) - x0)));
        if (l.db > cmMax[c]!) cmMax[c] = l.db;
      }
      g.strokeStyle = CM_COLOR;
      g.lineWidth = 2;
      g.setLineDash([6, 4]);
      g.beginPath();
      let on = false;
      for (let c = 0; c < cols; c++) {
        let m = -Infinity;
        for (let k = Math.max(0, c - R); k <= Math.min(cols - 1, c + R); k++) if (cmMax[k]! > m) m = cmMax[k]!;
        if (!Number.isFinite(m)) {
          on = false;
          continue;
        }
        if (!on) {
          g.moveTo(x0 + c, clampY(m));
          on = true;
        } else g.lineTo(x0 + c, clampY(m));
      }
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 1;
    }

    if (r.limits) {
      g.strokeStyle = col('--warn');
      g.lineWidth = 1.5;
      for (const seg of r.limits) {
        if (seg.f0 > fm) continue;
        g.beginPath();
        g.moveTo(xOf(seg.f0, w), clampY(seg.db));
        g.lineTo(xOf(Math.min(seg.f1, fm), w), clampY(seg.db));
        g.stroke();
      }
      g.lineWidth = 1;
    }

    if (mode === 'line' && lineF > 0) {
      const x = Math.round(xOf(lineF, w)) + 0.5;
      g.strokeStyle = col('--probe');
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
      g.setLineDash([]);
    }
  }

  function nearestLine(clientX: number): { f: number; db: number } | null {
    const r = data;
    if (!r || r.total.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const f = fOf(clientX - rect.left, size.w);
    let best = r.total[0]!;
    for (const l of r.total) if (Math.abs(Math.log(l.f / f)) < Math.abs(Math.log(best.f / f))) best = l;
    return best;
  }

  function onMove(e: PointerEvent) {
    const l = nearestLine(e.clientX);
    if (!l) {
      hover = null;
      return;
    }
    hover = { f: l.f, db: l.db, x: xOf(l.f, size.w), y: yOf(l.db, size.h) };
  }

  function onClick(e: MouseEvent) {
    const l = nearestLine(e.clientX);
    if (!l) return;
    app.view.mode = 'line';
    app.view.lineF = l.f;
    engine.recompose();
    engine.scheduleSave();
  }
</script>

<section class="analyzer">
  <div class="screen">
    <div class="bar">
    <div class="modes" role="tablist">
      {#each ['probe', 'far3', 'far10'] as const as m (m)}
        <button role="tab" aria-selected={app.spectrumMode === m} class:active={app.spectrumMode === m} onclick={() => (app.spectrumMode = m)}>{t.probe.modes[m]}</button>
      {/each}
    </div>
    <div class="legend value">
      {#if data}
        <button class="csv" onclick={exportCsv}>{t.probe.csv}</button>
        <span>{data.unit}</span>
        {#if data.limits}<span class="limit">{t.probe.limit(standardShort())}</span>{/if}
        {#if 'cm' in data && data.cm?.length}<span class="cmlegend" title={t.probe.cmHint}>{t.probe.cm}</span>{/if}
        {#if 'fValid' in data && data.fValid !== undefined && data.fValid < app.fMax}<span class="validity" title={t.probe.validityHint}>{t.probe.validity(formatEng(data.fValid, 'Hz', 2))}</span>{/if}
        {#if peak}<span>{t.probe.peak}: {formatEng(peak.f, 'Hz', 4)}, {fmtNum(peak.db)}</span>{/if}
      {:else}
        <span>{t.probe.noProbe}</span>
      {/if}
    </div>
    </div>
    <div class="plot" bind:this={wrap}>
    <canvas bind:this={canvas} onpointermove={onMove} onpointerleave={() => (hover = null)} onclick={onClick}></canvas>
    {#if hover}
      <div class="marker value" style:left={`${hover.x}px`} style:top={`${Math.max(4, hover.y - 30)}px`}>
        {formatEng(hover.f, 'Hz', 4)}<br />{fmtNum(hover.db)}
      </div>
    {/if}
    </div>
  </div>

  <div class="controls">
    <div class="group">
      <div class="gtitle">{t.probe.title}</div>
      <label class="check"><input type="checkbox" bind:checked={app.probe.follow} /> {t.probe.follow}</label>
      <div class="field">
        <label for="p-h">{t.probe.height}</label>
        <div class="slider">
          <input id="p-h" type="range" min="0.2" max="12" step="0.1" bind:value={app.probe.height} />
          <span class="value">{fmtNum(app.probe.height)} mm</span>
        </div>
      </div>
      <div class="field">
        <label for="p-c">{t.probe.component}</label>
        <select id="p-c" bind:value={app.probe.component}>
          <option value="abs">{t.probe.components.abs}</option>
          <option value="x">{t.probe.components.x}</option>
          <option value="y">{t.probe.components.y}</option>
          <option value="z">{t.probe.components.z}</option>
        </select>
      </div>
      <label class="check"><input type="checkbox" bind:checked={app.probe.asVoltage} /> {t.probe.asVoltage}</label>
    </div>
    <div class="group">
      <div class="gtitle">{t.audio.title}</div>
      <button class="btn" class:on={app.audio.enabled} onclick={ontoggleaudio}>{app.audio.enabled ? t.audio.off : t.audio.on}</button>
      <div class="field">
        <label for="a-v">{t.audio.volume}</label>
        <input id="a-v" type="range" min="0" max="1" step="0.01" bind:value={app.audio.volume} />
      </div>
      <div class="field">
        <label for="a-m">{t.audio.mode}</label>
        <select id="a-m" bind:value={app.audio.mode}>
          <option value="tones">{t.audio.modes.tones}</option>
          <option value="geiger">{t.audio.modes.geiger}</option>
        </select>
      </div>
      {#if app.audio.mode === 'tones'}
        <div class="field">
          <label for="a-p">{t.audio.pitch}</label>
          <div class="slider">
            <input id="a-p" type="range" min="55" max="880" step="1" bind:value={app.audio.pitchAt25MHz} />
            <span class="value">{app.audio.pitchAt25MHz} Hz</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .analyzer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    height: 100%;
    min-height: 0;
  }
  .screen {
    display: flex;
    flex-direction: column;
    margin: 8px 0 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: radial-gradient(120% 140% at 50% 0%, #142233 0%, #0b141d 70%);
    box-shadow: inset 0 0 0 1px rgba(76, 201, 240, 0.05), inset 0 10px 40px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 5px 10px 0 40px;
    flex-wrap: wrap;
  }
  .plot {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }
  .modes {
    display: flex;
    gap: 2px;
  }
  .modes button {
    border: 1px solid transparent;
    background: transparent;
    color: var(--faint);
    font-size: 12px;
    padding: 1px 8px;
    border-radius: var(--radius-s);
    cursor: pointer;
  }
  .modes button.active {
    color: var(--probe);
    border-color: rgba(76, 201, 240, 0.35);
    background: rgba(76, 201, 240, 0.06);
  }
  .limit {
    color: var(--warn);
  }
  .cmlegend {
    color: #f1f5f9;
    pointer-events: auto;
    cursor: help;
  }
  .validity {
    color: var(--faint);
    pointer-events: auto;
    cursor: help;
  }
  .csv {
    pointer-events: auto;
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    color: var(--muted);
    font-size: 11px;
    padding: 0 6px;
    cursor: pointer;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
  }
  .marker {
    position: absolute;
    transform: translateX(-50%);
    padding: 2px 6px;
    font-size: 11px;
    line-height: 1.3;
    text-align: center;
    background: rgba(12, 22, 32, 0.9);
    border: 1px solid var(--probe);
    border-radius: var(--radius-s);
    color: var(--probe);
    pointer-events: none;
    white-space: nowrap;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 8px 12px;
    overflow-y: auto;
  }
  .gtitle {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .group .field {
    grid-template-columns: 1fr;
    gap: 2px;
    margin: 4px 0;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    margin: 4px 0;
  }
  .slider {
    display: grid;
    grid-template-columns: 1fr 52px;
    gap: 6px;
    align-items: center;
  }
  .slider .value {
    font-size: 12px;
    text-align: right;
  }
  @media (max-width: 900px) {
    .analyzer {
      grid-template-columns: 1fr;
    }
    .controls {
      display: none;
    }
  }
</style>
