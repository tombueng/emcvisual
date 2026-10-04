<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { suggestSources } from '../physics/suggest';
  import { SOURCE_COLORS, type Source } from '../physics/sources';
  import { formatEng } from '../physics/units';
  import SourceEditor from './SourceEditor.svelte';

  const suggestions = $derived(app.board ? suggestSources(app.board) : []);
  const taken = $derived(new Set(app.sources.map(keyOf)));
  const open = $derived(suggestions.filter((s) => !taken.has(keyOf(s.source))));
  let menu = $state(false);

  function keyOf(s: Source): string {
    if (s.type === 'signal') return `sig:${s.nets[0]}`;
    if (s.type === 'diffpair') return `diff:${s.netP}`;
    return `loop:${s.pads.join(',')}`;
  }

  function newId() {
    return `s-${crypto.randomUUID().slice(0, 8)}`;
  }

  function nextColor() {
    return SOURCE_COLORS[app.sources.length % SOURCE_COLORS.length]!;
  }

  function add(type: Source['type']) {
    menu = false;
    const base = { id: newId(), enabled: true, color: nextColor() };
    let s: Source;
    if (type === 'signal')
      s = { ...base, type, kind: 'clock', name: t.sources.newSignal, nets: [''], driver: '', waveform: { f0: 25e6, duty: 0.5, tr: 1e-9, amplitude: 3.3 }, load: { model: 'capacitive', cLoad: 5e-12 } };
    else if (type === 'diffpair')
      s = { ...base, type, kind: 'data', name: t.sources.newDiff, netP: '', netN: '', driverP: '', driverN: '', waveform: { f0: 6e6, duty: 0.5, tr: 4e-9, amplitude: 3.3 }, load: { model: 'capacitive', cLoad: 5e-12 }, imbalance: 0.05 };
    else s = { ...base, type, name: t.sources.newLoop, pads: [], waveform: { f0: 500e3, duty: 0.3, tr: 5e-9, amplitude: 1 } };
    engine.addSource(s);
  }

  function takeAll() {
    const start = app.sources.length;
    engine.addSources(open.map((sg, i) => ({ ...sg.source, color: SOURCE_COLORS[(start + i) % SOURCE_COLORS.length]! })));
  }

  function summary(s: Source): string {
    const f = s.type !== 'loop' && s.kind === 'data' ? formatEng(s.waveform.f0 * 2, 'bit/s') : formatEng(s.waveform.f0, 'Hz');
    return `${t.sources.types[s.type]}, ${f}, ${formatEng(s.waveform.tr, 's')}`;
  }
</script>

<section class="panel">
  <header>
    <h2>{t.sources.title}</h2>
    <div class="add">
      <button class="btn small" aria-expanded={menu} onclick={() => (menu = !menu)} disabled={!app.board}>{t.sources.add}</button>
      {#if menu}
        <div class="menu" role="menu">
          <button role="menuitem" onclick={() => add('signal')}>{t.sources.addSignal}</button>
          <button role="menuitem" onclick={() => add('diffpair')}>{t.sources.addDiff}</button>
          <button role="menuitem" onclick={() => add('loop')}>{t.sources.addLoop}</button>
        </div>
      {/if}
    </div>
  </header>

  <div class="scroll body">
    {#if app.sources.length === 0 && app.board}
      <p class="hint">{t.sources.none}</p>
    {/if}
    <ul class="list">
      {#each app.sources as s (s.id)}
        <li class:selected={s.id === app.selectedId} class:off={!s.enabled} style:--c={s.color}>
          <button class="pick" onclick={() => (app.selectedId = s.id)}>
            <span class="name">{s.name || '–'}</span>
            <span class="sub value">{summary(s)}</span>
            {#if app.sourceErrors[s.id]}<span class="err">!</span>{/if}
          </button>
          <input type="checkbox" title={t.sources.enabled} bind:checked={s.enabled} onchange={() => engine.sourceChanged(s.id)} />
          <button class="btn ghost small" title={t.sources.remove} aria-label={t.sources.remove} onclick={() => engine.removeSource(s.id)}>✕</button>
        </li>
      {/each}
    </ul>

    {#if app.selected}
      {#key app.selected.id}
        <SourceEditor id={app.selected.id} />
      {/key}
    {/if}

    {#if open.length > 0}
      <div class="suggest-head">
        <div class="section-title">{t.sources.suggestions} ({open.length})</div>
        <button class="btn small" onclick={takeAll}>{t.sources.takeAll}</button>
      </div>
      <ul class="suggest">
        {#each open as sg (sg.key)}
          <li>
            <div>
              <div>{sg.source.name}</div>
              <div class="hint">{t.sources.reasons[sg.reason] ?? sg.reason}</div>
            </div>
            <button class="btn small" onclick={() => engine.addSource({ ...sg.source, color: nextColor() })}>{t.sources.take}</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--line-soft);
  }
  h2 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }
  .add {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 28px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 190px;
    background: var(--plate-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    padding: 4px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
  .menu button {
    text-align: left;
    padding: 7px 10px;
    border: 0;
    background: transparent;
    border-radius: var(--radius-s);
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--plate-3);
  }
  .body {
    padding: 8px 12px 16px;
    flex: 1;
  }
  .list {
    list-style: none;
    margin: 0 0 6px;
    padding: 0;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 6px;
    border-left: 3px solid var(--c);
    border-radius: 0 var(--radius-s) var(--radius-s) 0;
    padding: 2px 4px 2px 0;
    margin-bottom: 3px;
  }
  .list li.selected {
    background: var(--plate-2);
  }
  .list li.off .name,
  .list li.off .sub {
    opacity: 0.45;
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    text-align: left;
    background: none;
    border: 0;
    padding: 4px 8px;
    cursor: pointer;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    grid-column: 1;
    color: var(--muted);
    font-size: 12px;
  }
  .err {
    grid-row: 1 / span 2;
    grid-column: 2;
    color: var(--warn);
    font-weight: 600;
    align-self: center;
  }
  .suggest-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .suggest-head .section-title {
    margin: 14px 0 6px;
  }
  .suggest {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .suggest li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--line-soft);
  }
  .suggest .hint {
    margin: 0;
  }
</style>
