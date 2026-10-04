<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { formatEng } from '../physics/units';
  import { toWorld } from '../model/world';
  import type { Diagnostic } from '../physics/diagnostics';
  import { limitAt } from '../physics/farfield';

  const colorOf = (id: string) => app.sources.find((s) => s.id === id)?.color ?? 'var(--muted)';
  const nameOf = (id: string) => app.sources.find((s) => s.id === id)?.name ?? '';

  function text(d: Diagnostic): string {
    const k = t.diag.kinds;
    switch (d.kind) {
      case 'return-gap':
        return k['return-gap'](d);
      case 'ref-change':
        return k['ref-change'](d);
      case 'no-stitching':
        return k['no-stitching'](d);
      case 'long-line':
        return k['long-line'](d, (v) => formatEng(v, 'Hz', 2));
    }
  }

  function goToBoard(x: number, y: number) {
    const w = toWorld(engine.frame, { x, y }, app.probe.height);
    app.probe.x = w[0];
    app.probe.z = w[2];
    app.probe.visible = true;
    app.probe.follow = false;
    engine.viewer?.focus(w[0], 0, w[2]);
  }

  function goToWorld(x: number, z: number) {
    app.probe.x = x;
    app.probe.z = z;
    app.probe.visible = true;
    app.probe.follow = false;
    engine.viewer?.focus(x, 0, z);
  }

  // worst margin per source against the 3 m limit
  const far = $derived.by(() => {
    void app.models;
    void app.sources.map((s) => s.enabled);
    const r = engine.farReadout(3);
    if (!r) return [];
    return r.sources
      .map((s) => {
        let worst = -Infinity;
        let at = 0;
        for (const l of s.lines) {
          const lim = limitAt(r.limits, l.f);
          if (lim === null) continue;
          if (l.db - lim > worst) {
            worst = l.db - lim;
            at = l.f;
          }
        }
        return { ...s, worst, at };
      })
      .filter((s) => Number.isFinite(s.worst))
      .sort((a, b) => b.worst - a.worst);
  });
</script>

<div class="diag">
  <div class="section-title">{t.diag.warnings}</div>
  {#if app.diagnostics.length === 0}
    <p class="hint">{t.diag.none}</p>
  {/if}
  <ul>
    {#each app.diagnostics as d, i (i)}
      <li style:--c={colorOf(d.sourceId)}>
        <button onclick={() => goToBoard(d.at.x, d.at.y)} title={t.diag.goTo}>
          <span class="src">{nameOf(d.sourceId)}</span>
          <span class:warn={d.kind !== 'long-line'}>{text(d)}</span>
        </button>
      </li>
    {/each}
  </ul>

  <div class="section-title">{t.diag.hotspots}</div>
  {#if app.hotspots.length === 0}
    <p class="hint">{t.diag.hotspotsNone}</p>
  {/if}
  <ul>
    {#each app.hotspots as h, i (i)}
      <li style:--c={colorOf(h.sourceId)}>
        <button onclick={() => goToWorld(h.x, h.z)} title={t.diag.goTo}>
          <span class="row"><span class="src">{nameOf(h.sourceId)}</span><span class="value db">{h.db.toFixed(0)} {t.units.dBuAm}</span></span>
          {#if h.nets.length || h.parts.length}
            <span class="hint">{t.diag.near}: {[...h.parts, ...h.nets].join(', ')}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>

  <div class="section-title">{t.diag.far}</div>
  <ul>
    {#each far as s (s.id)}
      <li style:--c={s.color}>
        <div class="static">
          <span class="row"><span class="src">{s.name}</span><span class="value" class:over={s.worst >= 0}>{t.diag.margin(s.worst)}</span></span>
          <span class="hint value">{formatEng(s.at, 'Hz', 3)}</span>
        </div>
      </li>
    {/each}
  </ul>
  <p class="hint">{t.diag.farHint}</p>
</div>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    border-left: 3px solid var(--c);
    margin-bottom: 4px;
  }
  li button,
  .static {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    padding: 4px 8px;
    font-size: 12px;
    line-height: 1.4;
  }
  li button {
    cursor: pointer;
  }
  li button:hover {
    background: var(--plate-2);
  }
  .src {
    color: var(--muted);
  }
  .warn {
    color: var(--text);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .db {
    color: var(--field);
  }
  .over {
    color: var(--warn);
  }
  .hint {
    margin: 0;
  }
</style>
