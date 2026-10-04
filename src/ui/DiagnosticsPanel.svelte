<script lang="ts">
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { formatEng } from '../physics/units';
  import { toWorld } from '../model/world';
  import { diagnosticText, farMargins, gainText, rankedDiagnostics } from '../report/texts';
  import { MAX_GAIN_DB } from '../physics/attribution';
  import { buildReport } from '../report/report';
  import { buildAiRequest } from '../ai/request';
  import { suggestSources } from '../physics/suggest';
  import { branding } from '../branding';
  import type { Source } from '../physics/sources';

  const manualUrl = `${branding.siteUrl}ai-parts-manual.md`;

  function exportAiRequest() {
    if (!app.board) return;
    const req = buildAiRequest(
      app.board,
      engine.scenario(),
      suggestSources(app.board).map((x) => ({ reason: x.reason, source: x.source as Source })),
      manualUrl,
    );
    const name = (app.board.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '');
    downloadText(`${name}.ai-request.json`, JSON.stringify(req, null, 1));
  }

  const basisCount = $derived.by(() => {
    const c = { datasheet: 0, calculated: 0, schematic: 0, assumed: 0 };
    for (const p of Object.values(app.partsInfo.provenance)) c[p.basis]++;
    return c;
  });
  import { downloadText } from '../state/persist';

  function saveReport() {
    const html = buildReport(engine.viewer?.snapshot() ?? null);
    const name = (app.board?.source.fileName ?? 'board').replace(/\.kicad_pcb$/, '');
    downloadText(`${name}-${t.report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, html, 'text/html');
  }

  const colorOf = (id: string) => app.sources.find((s) => s.id === id)?.color ?? 'var(--muted)';
  const nameOf = (id: string) => app.sources.find((s) => s.id === id)?.name ?? '';

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

  /** " · return paths 7.9 dB, plane gaps 0 dB" for sources where either matters. */
  function shares(id: string): string {
    const a = app.attribution[id];
    if (!a || (a.returnPathsDb < 0.5 && a.planeGapsDb < 0.5)) return '';
    const f = (db: number) => (db >= MAX_GAIN_DB - 0.05 ? t.diag.gainMore(MAX_GAIN_DB) : t.diag.gainDb(db));
    return ` · ${t.diag.shares(f(a.returnPathsDb), f(a.planeGapsDb))}`;
  }

  // layout hints in the order to work on them
  const ranked = $derived.by(() => {
    void app.diagnostics;
    void app.models;
    void app.fieldOrigin;
    return rankedDiagnostics();
  });

  // worst margin per source against the 3 m limit
  const far = $derived.by(() => {
    void app.models;
    void app.sources.map((s) => s.enabled);
    void app.fieldOrigin;
    return farMargins();
  });
</script>

<div class="diag">
  <div class="report">
    <button class="btn small" onclick={exportAiRequest} disabled={!app.board} title={t.parts.exportHint}>{t.parts.export}</button>
    <button class="btn small" onclick={saveReport} disabled={!app.board} title={t.report.buttonHint}>{t.report.button}</button>
  </div>
  <p class="hint">{t.parts.howto} <a href={manualUrl} target="_blank" rel="noopener">{t.parts.manual}</a></p>

  {#if Object.keys(app.partsInfo.provenance).length || app.partsInfo.missing.length}
    <div class="section-title">{t.parts.title}</div>
    <p class="hint value">{t.parts.counts(basisCount.datasheet, basisCount.calculated, basisCount.schematic, basisCount.assumed)}</p>
    {#if app.partsInfo.missing.length}
      <div class="sub">{t.parts.missingTitle(app.partsInfo.missing.length)}</div>
      <ul>
        {#each app.partsInfo.missing as m, i (i)}
          <li style:--c="var(--warn)">
            <div class="static">
              <span class="row"><span class="src">{m.ref}{m.mpn ? ` · ${m.mpn}` : ''}</span></span>
              <span>{m.needed.join(', ')}</span>
              {#if m.reason}<span class="hint">{m.reason}</span>{/if}
              {#if m.assumed}<span class="hint">{t.parts.assumed}: {m.assumed}</span>{/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">{t.parts.noneMissing}</p>
    {/if}
    {#if app.partsInfo.notes}<p class="hint">{app.partsInfo.notes}</p>{/if}
  {/if}
  <div class="section-title">{t.diag.warnings}</div>
  {#if app.diagnostics.length === 0}
    <p class="hint">{t.diag.none}</p>
  {:else}
    <p class="hint">{t.diag.rankHint}</p>
  {/if}
  <ol class="ranked">
    {#each ranked as { d, margin }, i (i)}
      <li style:--c={colorOf(d.sourceId)}>
        <button onclick={() => goToBoard(d.at.x, d.at.y)} title={t.diag.goTo}>
          <span class="row"><span class="src">{nameOf(d.sourceId)}</span>{#if margin !== null}<span class="value" class:over={margin >= 0}>{t.diag.margin(margin)}</span>{/if}</span>
          <span class:warn={d.kind !== 'long-line'}>{diagnosticText(d)}</span>
          {#if d.gain}<span class="gain value">{gainText(d)}</span>{/if}
        </button>
      </li>
    {/each}
  </ol>

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
          <span class="hint value">{formatEng(s.at, 'Hz', 3)}{shares(s.id)}</span>
        </div>
      </li>
    {/each}
  </ul>
  <p class="hint">{t.diag.farHint}</p>
</div>

<style>
  ol.ranked {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: rank;
  }
  ol.ranked li {
    counter-increment: rank;
    position: relative;
  }
  ol.ranked li button {
    padding-left: 30px;
  }
  ol.ranked li::before {
    content: counter(rank);
    position: absolute;
    left: 8px;
    top: 5px;
    font-size: 11px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .gain {
    color: var(--field);
    font-size: 12px;
  }
  .report {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
  }
  .sub {
    font-size: 12px;
    color: var(--warn);
    margin: 6px 0 4px;
  }
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
