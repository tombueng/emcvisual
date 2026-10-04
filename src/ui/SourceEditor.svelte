<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { formatEng } from '../physics/units';
  import { trapezoidCorners } from '../physics/spectrum';
  import type { Source, LoadModel } from '../physics/sources';
  import EngInput from './EngInput.svelte';
  import NetInput from './NetInput.svelte';

  interface Props {
    id: string;
  }
  let { id }: Props = $props();
  // edit the source in the app state directly (it is not owned by the parent component)
  const source = $derived(app.sources.find((s) => s.id === id)!) as Source;

  const nets = $derived(app.board ? app.board.nets.filter(Boolean) : []);
  const allPads = $derived(app.board ? app.board.pads.map((p) => `${p.ref}.${p.number}`) : []);
  const model = $derived(app.models[source.id]);
  const error = $derived(app.sourceErrors[source.id]);
  const corners = $derived(trapezoidCorners(source.waveform));

  function padsOfNets(names: string[]): string[] {
    const b = app.board;
    if (!b) return [];
    const idx = new Set(names.map((n) => b.nets.indexOf(n)));
    return b.pads.filter((p) => idx.has(p.net)).map((p) => `${p.ref}.${p.number}`);
  }

  const changed = () => engine.sourceChanged(source.id);

  function setLoad(model: LoadModel['model']) {
    if (source.type === 'loop') return;
    source.load = model === 'capacitive' ? { model, cLoad: 5e-12 } : { model, z0: 0, endPad: '' };
    changed();
  }

  function errorText(e: string): string {
    const [code, arg] = e.split(':');
    const text = t.editor.errors[code ?? ''];
    return text ? (arg ? `${text}: ${arg}` : text) : e;
  }

  function pickPad(onPick: (v: string) => void) {
    app.pickMode = { kind: 'pad', onPick };
  }
</script>

<div class="editor">
  <div class="field">
    <label for="src-name">{t.editor.name}</label>
    <input id="src-name" type="text" bind:value={source.name} onchange={() => engine.scheduleSave()} />
  </div>

  {#if source.type === 'signal' || source.type === 'diffpair'}
    <div class="field">
      <label for="src-kind">{t.editor.kind}</label>
      <select id="src-kind" bind:value={source.kind} onchange={changed}>
        <option value="clock">{t.editor.clock}</option>
        <option value="data">{t.editor.data}</option>
      </select>
    </div>
  {/if}

  {#if source.type === 'signal'}
    <div class="field wide">
      <span class="label">{t.editor.nets}</span>
      {#each source.nets as _, i (i)}
        <div class="row">
          <NetInput value={source.nets[i] ?? ''} options={nets} onchange={(v) => { if (source.type === 'signal') { source.nets[i] = v; changed(); } }} />
          {#if source.nets.length > 1}
            <button class="btn ghost small" title={t.sources.remove} onclick={() => { if (source.type === 'signal') { source.nets.splice(i, 1); changed(); } }}>✕</button>
          {/if}
        </div>
      {/each}
      <div class="row">
        <button class="btn small" onclick={() => { if (source.type === 'signal') source.nets.push(''); }}>{t.editor.addNet}</button>
        <button class="btn small" class:on={app.pickMode?.kind === 'net'} onclick={() => (app.pickMode = { kind: 'net', onPick: (v) => { if (source.type === 'signal' && !source.nets.includes(v)) { source.nets = [...source.nets.filter(Boolean), v]; changed(); } } })}>{t.editor.pickIn3d}</button>
      </div>
      <p class="hint">{t.editor.netsHint}</p>
    </div>
    <div class="field">
      <label for="src-driver">{t.editor.driver}</label>
      <NetInput id="src-driver" value={source.driver} options={padsOfNets(source.nets)} placeholder={t.editor.driverAuto} onchange={(v) => { if (source.type === 'signal') { source.driver = v; changed(); } }} />
    </div>
  {:else if source.type === 'diffpair'}
    <div class="field">
      <label for="src-p">{t.editor.netP}</label>
      <NetInput id="src-p" value={source.netP} options={nets} onchange={(v) => { if (source.type === 'diffpair') { source.netP = v; changed(); } }} />
    </div>
    <div class="field">
      <label for="src-n">{t.editor.netN}</label>
      <NetInput id="src-n" value={source.netN} options={nets} onchange={(v) => { if (source.type === 'diffpair') { source.netN = v; changed(); } }} />
    </div>
    <div class="field">
      <label for="src-dp">{t.editor.driverP}</label>
      <NetInput id="src-dp" value={source.driverP} options={padsOfNets([source.netP])} placeholder={t.editor.driverAuto} onchange={(v) => { if (source.type === 'diffpair') { source.driverP = v; changed(); } }} />
    </div>
    <div class="field">
      <label for="src-dn">{t.editor.driverN}</label>
      <NetInput id="src-dn" value={source.driverN} options={padsOfNets([source.netN])} placeholder={t.editor.driverAuto} onchange={(v) => { if (source.type === 'diffpair') { source.driverN = v; changed(); } }} />
    </div>
    <div class="field">
      <label for="src-imb">{t.editor.imbalance}</label>
      <EngInput id="src-imb" value={source.imbalance * 100} unit="%" min={0} max={100} onchange={(v) => { if (source.type === 'diffpair') { source.imbalance = v / 100; changed(); } }} />
    </div>
  {:else}
    <div class="field wide">
      <span class="label">{t.editor.pads}</span>
      {#each source.pads as _, i (i)}
        <div class="row">
          <span class="idx value">{i + 1}</span>
          <NetInput value={source.pads[i] ?? ''} options={allPads} onchange={(v) => { if (source.type === 'loop') { source.pads[i] = v; changed(); } }} />
          <button class="btn ghost small" title={t.sources.remove} onclick={() => { if (source.type === 'loop') { source.pads.splice(i, 1); changed(); } }}>✕</button>
        </div>
      {/each}
      <div class="row">
        <button class="btn small" onclick={() => { if (source.type === 'loop') source.pads.push(''); }}>{t.editor.addPad}</button>
        <button class="btn small" class:on={app.pickMode?.kind === 'pad'} onclick={() => pickPad((v) => { if (source.type === 'loop') { source.pads = [...source.pads.filter(Boolean), v]; changed(); } })}>
          {app.pickMode?.kind === 'pad' ? t.editor.picking : t.editor.pickIn3d}
        </button>
      </div>
      <p class="hint">{t.editor.padsHint}</p>
    </div>
  {/if}

  <div class="field">
    <label for="src-f0">{source.type !== 'loop' && source.kind === 'data' ? t.editor.bitrate : t.editor.f0}</label>
    {#if source.type !== 'loop' && source.kind === 'data'}
      <EngInput id="src-f0" value={source.waveform.f0 * 2} unit="bit/s" min={1} onchange={(v) => { source.waveform.f0 = v / 2; changed(); }} />
    {:else}
      <EngInput id="src-f0" value={source.waveform.f0} unit="Hz" min={1} onchange={(v) => { source.waveform.f0 = v; changed(); }} />
    {/if}
  </div>
  <div class="field">
    <label for="src-tr">{t.editor.tr}</label>
    <EngInput id="src-tr" value={source.waveform.tr} unit="s" min={1e-12} onchange={(v) => { source.waveform.tr = v; changed(); }} />
  </div>
  <div class="field">
    <label for="src-duty">{t.editor.duty}</label>
    <EngInput id="src-duty" value={source.waveform.duty * 100} unit="%" min={1} max={99} onchange={(v) => { source.waveform.duty = v / 100; changed(); }} />
  </div>
  <div class="field">
    <label for="src-amp">{source.type === 'loop' ? t.editor.amplitudeA : t.editor.amplitudeV}</label>
    <EngInput id="src-amp" value={source.waveform.amplitude} unit={source.type === 'loop' ? 'A' : 'V'} min={0} onchange={(v) => { source.waveform.amplitude = v; changed(); }} />
  </div>

  {#if source.type !== 'loop'}
    <div class="field">
      <label for="src-load">{t.editor.load}</label>
      <select id="src-load" value={source.load.model} onchange={(e) => setLoad((e.currentTarget as HTMLSelectElement).value as LoadModel['model'])}>
        <option value="capacitive">{t.editor.capacitive}</option>
        <option value="terminated">{t.editor.terminated}</option>
      </select>
    </div>
    {#if source.load.model === 'capacitive'}
      <div class="field">
        <label for="src-cl">{t.editor.cLoad}</label>
        <EngInput id="src-cl" value={source.load.cLoad} unit="F" min={0} onchange={(v) => { if (source.load.model === 'capacitive') { source.load.cLoad = v; changed(); } }} />
      </div>
    {:else}
      <div class="field">
        <label for="src-z0">{t.editor.z0}</label>
        <EngInput id="src-z0" value={source.load.z0} unit="Ω" min={0} onchange={(v) => { if (source.load.model === 'terminated') { source.load.z0 = v; changed(); } }} />
      </div>
    {/if}
  {/if}

  {#if error}
    <p class="warn-text">{t.editor.errorPrefix} {errorText(error)}</p>
  {/if}

  {#if model}
    <div class="section-title">{t.editor.info}</div>
    <dl class="info value">
      {#if model.info.driver}<dt>{t.editor.driver}</dt><dd>{model.info.driver}</dd>{/if}
      <dt>{t.editor.length}</dt><dd>{formatEng(model.info.lengthMm / 1000, 'm')}</dd>
      {#if model.info.cTotal}<dt>{t.editor.cTotal}</dt><dd>{formatEng(model.info.cTotal, 'F')}</dd>{/if}
      {#if source.type !== 'loop' && model.info.z0}<dt>{t.editor.z0Info}</dt><dd>{formatEng(model.info.z0, 'Ω')}</dd>{/if}
      <dt>{t.editor.fShort}</dt><dd>{formatEng(model.info.fShort, 'Hz')}</dd>
      <dt>{t.editor.corners}</dt><dd>{formatEng(corners.f1, 'Hz')} / {formatEng(corners.f2, 'Hz')}</dd>
    </dl>
    {#each model.info.warnings as w (w)}
      <p class="warn-text">{t.editor.warnings[w.split(':')[0] ?? ''] ?? w}{w.includes(':') ? ` ${w.slice(w.indexOf(':') + 1)}` : ''}</p>
    {/each}
  {/if}
</div>

<style>
  .editor {
    padding: 4px 0 12px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
  }
  .idx {
    width: 16px;
    color: var(--faint);
    text-align: right;
  }
  .info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    font-size: 12px;
  }
  .info dt {
    color: var(--muted);
    font-family: var(--font);
  }
  .info dd {
    margin: 0;
    text-align: right;
  }
</style>
