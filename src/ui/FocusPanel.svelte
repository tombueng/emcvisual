<script lang="ts">
  /**
   * Side card of the problem view: what the calculation objects to, the 3 m spectrum now and
   * with the fix, and the inputs that decide the result, with their origin (datasheet,
   * calculated, assumption, or not documented). Editing an input reruns everything at once.
   */
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { formatEng } from '../physics/units';
  import EngInput from './EngInput.svelte';
  import { diagnosticText, farMargins, gainText, rankedDiagnostics } from '../report/texts';
  import { miniSpectrumSvg } from './spectrumSvg';
  import { cispr32ClassB } from '../physics/farfield';
  import { MAX_GAIN_DB } from '../physics/attribution';
  import type { FocusSpec } from './focusData';
  import { diagKey } from './focusData';
  import { explain } from '../report/explain';
  import { severityColor } from '../physics/severity';

  interface Props {
    spec: FocusSpec;
    onclose: () => void;
  }
  let { spec, onclose }: Props = $props();

  const source = $derived(app.sources.find((s) => s.id === spec.source.id));
  const model = $derived(source ? app.models[source.id] : undefined);
  const rank = $derived(rankedDiagnostics().findIndex((r) => diagKey(r.d) === spec.key) + 1);
  const margin = $derived(farMargins().find((f) => f.id === spec.source.id)?.worst ?? null);
  const chart = $derived.by(() => {
    void app.models;
    const lines = engine.farReadout(3)?.sources.find((s) => s.id === spec.source.id)?.lines ?? [];
    if (!lines.length) return '';
    return miniSpectrumSvg(lines, {
      width: 300,
      height: 96,
      color: spec.color,
      limits: cispr32ClassB(3),
      shift: spec.diag.gain ? Math.min(spec.diag.gain.db, MAX_GAIN_DB) : undefined,
      labels: { left: '30 MHz', right: '1 GHz', caption: spec.diag.gain ? t.callouts.chartFixed : t.callouts.chart },
    });
  });

  const changed = () => source && engine.sourceChanged(source.id);
  const ex = $derived.by(() => {
    void app.models;
    return explain(spec.diag);
  });
  /** Origin of an input: from the scenario's provenance, else "not documented". */
  const origin = (path: string) => app.partsInfo.provenance[`${spec.source.id}/${path}`];
</script>

{#snippet originTag(path: string)}
  {@const p = origin(path)}
  <span class="origin" class:assumed={!p || p.basis === 'assumed'} title={p ? [p.ref, p.mpn, p.where, p.note].filter(Boolean).join(' · ') : ''}>
    {p ? t.parts.bases[p.basis] : t.focus.undocumented}
  </span>
{/snippet}

{#snippet field(label: string, path: string, value: number, unit: string, set: (v: number) => void, min = 0, max = Infinity)}
  <div class="input">
    <label for={`fx-${path}`}>{label} {@render originTag(path)}</label>
    <EngInput id={`fx-${path}`} {value} {unit} {min} {max} onchange={(v) => { set(v); changed(); }} />
  </div>
{/snippet}

<aside class="card" aria-label={t.focus.why}>
  <header>
    {#if rank > 0}<span class="badge" style:--c={spec.color}>{rank}</span>{/if}
    <span class="title" style:--c={spec.color}>{spec.source.name}</span>
    <button class="btn small" onclick={onclose}>{t.focus.back}</button>
  </header>

  <div class="severity" style:--s={severityColor(ex.severity.score)}>
    <span class="chip">{t.severity[ex.severity.level]}</span>
    <span class="reason">{ex.reason}</span>
  </div>

  <div class="section-title">{t.focus.why}</div>
  <p class="text">{diagnosticText(spec.diag)}</p>
  {#if spec.diag.gain}<p class="gain value">{gainText(spec.diag)}</p>{/if}
  {#if margin !== null}<p class="hint value">{t.focus.figures.margin}: {t.diag.margin(margin)}</p>{/if}

  <div class="section-title">{t.explain.sections.what}</div>
  <p class="text">{ex.what}</p>
  <div class="section-title">{t.explain.sections.why}</div>
  <p class="text">{ex.why}</p>
  {#if ex.figures.length}
    <div class="section-title">{t.explain.sections.figures}</div>
    <ul class="figs">{#each ex.figures as f, i (i)}<li>{f}</li>{/each}</ul>
  {/if}
  <div class="section-title">{t.explain.sections.fixes}</div>
  <ol class="fixes">{#each ex.fixes as f, i (i)}<li>{f}</li>{/each}</ol>
  <div class="section-title">{t.explain.sections.avoid}</div>
  <ul class="fixes avoid">{#each ex.avoid as f, i (i)}<li>{f}</li>{/each}</ul>
  <div class="section-title">{t.explain.sections.calc}</div>
  <ol class="calc">{#each ex.calc as f, i (i)}<li>{f}</li>{/each}</ol>
  <div class="section-title">{t.explain.sections.doubts}</div>
  <ul class="doubts">{#each ex.doubts as f, i (i)}<li>{f}</li>{/each}</ul>

  {#if chart}
    <div class="section-title">{t.focus.spectrum}</div>
    <div class="chart">{@html chart}</div>
  {/if}

  {#if source}
    <div class="section-title">{t.focus.inputs}</div>
    <p class="hint">{t.focus.inputsHint}</p>
    {#if source.type === 'signal' || source.type === 'diffpair'}
      {#if source.kind === 'data'}
        {@render field(t.focus.fields.bitrate, 'waveform.f0', source.waveform.f0 * 2, 'bit/s', (v) => (source.waveform.f0 = v / 2), 1)}
      {:else}
        {@render field(t.focus.fields.f0, 'waveform.f0', source.waveform.f0, 'Hz', (v) => (source.waveform.f0 = v), 1)}
      {/if}
      {@render field(t.focus.fields.tr, 'waveform.tr', source.waveform.tr, 's', (v) => (source.waveform.tr = v), 1e-12)}
      {@render field(t.focus.fields.voltage, 'waveform.amplitude', source.waveform.amplitude, 'V', (v) => (source.waveform.amplitude = v))}
      {#if source.load.model === 'capacitive'}
        {@render field(t.focus.fields.cLoad, 'load.cLoad', source.load.cLoad, 'F', (v) => { if (source.load.model === 'capacitive') source.load.cLoad = v; })}
      {:else}
        {@render field(t.focus.fields.z0, 'load.z0', source.load.z0, 'Ω', (v) => { if (source.load.model === 'terminated') source.load.z0 = v; })}
      {/if}
      {#if source.type === 'diffpair'}
        {@render field(t.focus.fields.imbalance, 'imbalance', source.imbalance * 100, '%', (v) => { if (source.type === 'diffpair') source.imbalance = v / 100; }, 0, 100)}
      {/if}
    {:else if source.type === 'loop'}
      {@render field(t.focus.fields.f0, 'waveform.f0', source.waveform.f0, 'Hz', (v) => (source.waveform.f0 = v), 1)}
      {@render field(t.focus.fields.tr, 'waveform.tr', source.waveform.tr, 's', (v) => (source.waveform.tr = v), 1e-12)}
      {@render field(t.focus.fields.current, 'waveform.amplitude', source.waveform.amplitude, 'A', (v) => (source.waveform.amplitude = v))}
      {@render field(t.focus.fields.duty, 'waveform.duty', source.waveform.duty * 100, '%', (v) => (source.waveform.duty = v / 100), 1, 99)}
      {#if source.node}
        {@render field(t.focus.fields.nodeV, 'node.voltage', source.node.voltage, 'V', (v) => { if (source.type === 'loop' && source.node) source.node.voltage = v; })}
      {/if}
    {:else}
      {@render field(t.focus.fields.f0, 'waveform.f0', source.waveform.f0, 'Hz', (v) => (source.waveform.f0 = v), 1)}
      {@render field(t.focus.fields.ripple, 'waveform.amplitude', source.waveform.amplitude, 'A', (v) => (source.waveform.amplitude = v))}
    {/if}
  {/if}

  <details>
    <summary>{t.explain.sections.detected}</summary>
    <p class="text">{ex.detected}</p>
  </details>
  <details>
    <summary>{t.explain.sections.limits}</summary>
    <p class="text">{ex.limits}</p>
  </details>
  <details>
    <summary>{t.explain.sections.refs}</summary>
    <ul class="refs">{#each ex.refs as r, i (i)}<li>{r}</li>{/each}</ul>
  </details>

  {#if model}
    <div class="section-title">{t.focus.derived}</div>
    <dl class="value">
      <dt>{t.focus.figures.length}</dt><dd>{formatEng(model.info.lengthMm / 1000, 'm')}</dd>
      {#if model.info.cTotal}<dt>{t.focus.figures.cTotal}</dt><dd>{formatEng(model.info.cTotal, 'F')}</dd>{/if}
      {#if model.info.z0}<dt>{t.focus.figures.z0}</dt><dd>{formatEng(model.info.z0, 'Ω')}</dd>{/if}
      <dt>{t.focus.figures.fShort}</dt><dd>{formatEng(model.info.fShort, 'Hz')}</dd>
    </dl>
  {/if}
</aside>

<style>
  .card {
    position: absolute;
    top: 12px;
    left: 12px;
    bottom: 12px;
    width: min(330px, calc(100% - 24px));
    overflow-y: auto;
    padding: 10px 12px 12px;
    background: color-mix(in srgb, var(--plate) 94%, transparent);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.4);
    font-size: 12.5px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    border-left: 3px solid var(--c);
    padding-left: 7px;
  }
  .badge {
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    background: var(--c);
    color: #0b0f14;
    font-weight: 700;
    text-align: center;
    line-height: 20px;
    font-size: 12px;
  }
  .text {
    margin: 4px 0;
    line-height: 1.45;
  }
  .gain {
    color: var(--field);
    font-weight: 600;
    margin: 4px 0;
  }
  .chart {
    line-height: 0;
  }
  .severity {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 8px 0 2px;
    padding: 6px 8px;
    border-left: 4px solid var(--s);
    background: color-mix(in srgb, var(--s) 12%, transparent);
    border-radius: 4px;
  }
  .severity .chip {
    flex: none;
    font-weight: 700;
    font-size: 12px;
    color: #0b0f14;
    background: var(--s);
    border-radius: 9px;
    padding: 0 8px;
  }
  .severity .reason {
    font-size: 12px;
    line-height: 1.4;
  }
  .calc,
  .doubts {
    margin: 4px 0;
    padding-left: 18px;
    line-height: 1.45;
    font-size: 12px;
  }
  .calc li,
  .doubts li {
    margin-bottom: 4px;
  }
  .doubts li::marker {
    color: var(--warn);
  }
  .avoid li::marker {
    color: var(--warn);
  }
  .figs,
  .fixes,
  .refs {
    margin: 4px 0;
    padding-left: 18px;
    line-height: 1.45;
  }
  .fixes li {
    margin-bottom: 4px;
  }
  .refs {
    font-size: 11.5px;
    color: var(--muted);
  }
  details {
    margin: 6px 0;
  }
  summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .input {
    display: grid;
    grid-template-columns: 1fr 120px;
    align-items: center;
    gap: 8px;
    margin: 5px 0;
  }
  .input label {
    display: flex;
    flex-direction: column;
    color: var(--muted);
    font-size: 12px;
  }
  .origin {
    font-size: 10.5px;
    color: var(--ok);
  }
  .origin.assumed {
    color: var(--warn);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 4px 0 0;
    font-size: 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
</style>
