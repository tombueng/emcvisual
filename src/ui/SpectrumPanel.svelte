<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { formatEng } from '../physics/units';

  interface Props {
    ontoggleaudio: () => void;
  }
  let { ontoggleaudio }: Props = $props();

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let size = $state({ w: 600, h: 160 });
  let hover = $state<{ f: number; db: number; x: number; y: number } | null>(null);

  const F_MIN = 1e5;
  const PAD = { l: 44, r: 10, t: 10, b: 20 };

  const peak = $derived.by(() => {
    const r = app.readout;
    if (!r || r.total.length === 0) return null;
    return r.total.reduce((a, b) => (b.db > a.db ? b : a));
  });
  const refLevel = $derived(peak ? Math.ceil(peak.db / 10) * 10 + 10 : 120);

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
    draw(app.readout, size.w, size.h, refLevel, app.view.mode, app.view.lineF, fMax);
  });

  function draw(r: typeof app.readout, w: number, h: number, ref: number, mode: string, lineF: number, fm: number) {
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
    const r = app.readout;
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
  <div class="screen" bind:this={wrap}>
    <canvas bind:this={canvas} onpointermove={onMove} onpointerleave={() => (hover = null)} onclick={onClick}></canvas>
    <div class="legend value">
      {#if app.readout}
        <span>{app.readout.unit}</span>
        {#if peak}<span>{t.probe.peak}: {formatEng(peak.f, 'Hz', 4)}, {peak.db.toFixed(1).replace('.', ',')}</span>{/if}
      {:else}
        <span>{t.probe.noProbe}</span>
      {/if}
    </div>
    {#if hover}
      <div class="marker value" style:left={`${hover.x}px`} style:top={`${Math.max(4, hover.y - 30)}px`}>
        {formatEng(hover.f, 'Hz', 4)}<br />{hover.db.toFixed(1).replace('.', ',')}
      </div>
    {/if}
  </div>

  <div class="controls">
    <div class="group">
      <div class="gtitle">{t.probe.title}</div>
      <label class="check"><input type="checkbox" bind:checked={app.probe.follow} /> {t.probe.follow}</label>
      <div class="field">
        <label for="p-h">{t.probe.height}</label>
        <div class="slider">
          <input id="p-h" type="range" min="0.2" max="12" step="0.1" bind:value={app.probe.height} />
          <span class="value">{app.probe.height.toFixed(1).replace('.', ',')} mm</span>
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
        <label for="a-p">{t.audio.pitch}</label>
        <div class="slider">
          <input id="a-p" type="range" min="55" max="880" step="1" bind:value={app.audio.pitchAt25MHz} />
          <span class="value">{app.audio.pitchAt25MHz} Hz</span>
        </div>
      </div>
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
    position: relative;
    margin: 8px 0 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: radial-gradient(120% 140% at 50% 0%, #142233 0%, #0b141d 70%);
    box-shadow: inset 0 0 0 1px rgba(76, 201, 240, 0.05), inset 0 10px 40px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }
  .legend {
    position: absolute;
    top: 6px;
    right: 12px;
    display: flex;
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
