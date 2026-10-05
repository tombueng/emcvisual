<script lang="ts">
  import { boardBaseName } from '../import';
  import { app } from '../state/app.svelte';
  import { engine } from '../state/engine.svelte';
  import { t } from '../i18n';
  import { formatEng } from '../physics/units';
  import { toWorld } from '../model/world';
  import { actionPlan, diagnosticText, farMargins, gainText, rankedDiagnostics, standardShort } from '../report/texts';
  import { MAX_GAIN_DB } from '../physics/attribution';
  import { diagKey } from './focusData';
  import { severityColor } from '../physics/severity';
  import { STANDARDS } from '../physics/standards';

  const stdText = (id: string) => (t.standards.items as Record<string, { name: string; short: string; text: string }>)[id] ?? { name: id, short: id, text: '' };
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
    const name = boardBaseName(app.board.source.fileName ?? 'board');
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
    const name = boardBaseName(app.board?.source.fileName ?? 'board');
    downloadText(`${name}-${t.report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, html, 'text/html');
  }

  const colorOf = (id: string) => app.sources.find((s) => s.id === id)?.color ?? 'var(--muted)';
  // board rules have no source: they belong to the board
  const nameOf = (id: string) => (id ? (app.sources.find((s) => s.id === id)?.name ?? '') : t.diag.board);

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

  // per source and kind the first GROUP_SHOW hints; the rest behind a "more" row
  const GROUP_SHOW = 3;
  let expanded = $state<Set<string>>(new Set());
  const groupOf = (d: { sourceId: string; kind: string }) => `${d.sourceId}|${d.kind}`;
  const rows = $derived.by(() => {
    const total = new Map<string, number>();
    for (const r of ranked) total.set(groupOf(r.d), (total.get(groupOf(r.d)) ?? 0) + 1);
    const seen = new Map<string, number>();
    const out: ({ type: 'hint'; rank: number; r: (typeof ranked)[number] } | { type: 'more'; group: string; n: number; r: (typeof ranked)[number] })[] = [];
    ranked.forEach((r, i) => {
      const g = groupOf(r.d);
      const k = (seen.get(g) ?? 0) + 1;
      seen.set(g, k);
      if (k <= GROUP_SHOW || expanded.has(g)) out.push({ type: 'hint', rank: i + 1, r });
      if (k === GROUP_SHOW && !expanded.has(g) && total.get(g)! > GROUP_SHOW) out.push({ type: 'more', group: g, n: total.get(g)! - GROUP_SHOW, r });
    });
    return out;
  });
  const expand = (g: string) => (expanded = new Set([...expanded, g]));
  const plan = $derived.by(() => {
    void ranked;
    return actionPlan(5);
  });
  const levelCount = $derived.by(() => {
    const c = { critical: 0, check: 0, minor: 0 };
    for (const r of ranked) c[r.severity.level]++;
    return c;
  });

  // worst margin per source against the 3 m limit
  const far = $derived.by(() => {
    void app.models;
    void app.sources.map((s) => s.enabled);
    void app.fieldOrigin;
    return farMargins();
  });
  const compensated = $derived.by(() => {
    void app.models;
    void app.sources.map((s) => s.enabled);
    void app.fieldOrigin;
    return engine.farReadout(3)?.sources.filter((s) => s.compensated) ?? [];
  });
  /** What the file did not provide and was assumed or computed (stack-up, outline, pours). */
  const fileNotes = $derived.by(() => {
    const w = app.board?.warnings ?? [];
    const notes: string[] = [];
    const N = t.fileNotes as Record<string, string | ((x: string) => string)>;
    const missing = w.filter((x) => x.startsWith('eagle-package-missing:')).map((x) => x.slice(x.indexOf(':') + 1));
    for (const x of w) {
      const key = x.split(':')[0]!;
      if (key === 'eagle-package-missing') continue;
      const v = N[key];
      if (typeof v === 'string') notes.push(v);
      else if (typeof v === 'function') notes.push(v(x.slice(x.indexOf(':') + 1)));
    }
    if (missing.length) notes.push((N['eagle-package-missing'] as (x: string) => string)(missing.join(', ')));
    return [...new Set(notes)];
  });
</script>

<div class="diag">
  {#if fileNotes.length}
    <div class="section-title">{t.fileNotes.title}</div>
    <ul class="file-notes">
      {#each fileNotes as n (n)}<li class="hint">{n}</li>{/each}
    </ul>
  {/if}
  {#if plan.length}
    <div class="section-title">{t.diag.planTitle}</div>
    <ol class="plan">
      {#each plan as st, i (i)}
        <li style:--s={st.level === 'critical' ? 'var(--bad)' : 'var(--caution)'}>
          <button onclick={() => (app.focusKey = diagKey(st.first))} title={t.focus.open}>
            <span class="n">{i + 1}.</span>
            <span class="what">{(t.diag.plan as Record<string, (n: number, who: string) => string>)[st.kind]?.(st.count, st.who.slice(0, 3).join(', ') + (st.who.length > 3 ? ' …' : '')) ?? t.diag.planGeneric(t.callouts.kinds[st.kind], st.count)}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="section-title">{t.diag.warnings}</div>
  {#if app.diagnostics.length === 0}
    <p class="hint">{t.diag.none}</p>
  {:else}
    <p class="hint value counts">{t.diag.counts(levelCount.critical, levelCount.check, levelCount.minor)}</p>
    <details class="how">
      <summary>{t.diag.howRanked}</summary>
      <p class="hint">{t.diag.rankHint} {t.severity.scale}</p>
    </details>
  {/if}
  <ol class="ranked">
    {#each rows as row, i (i)}
      {#if row.type === 'more'}
        <li class="more">
          <button onclick={() => expand(row.group)}>{t.diag.moreOfKind(row.n, t.callouts.kinds[row.r.d.kind], nameOf(row.r.d.sourceId))}</button>
        </li>
      {:else}
      {@const { d, margin, severity } = row.r}
      <li style:--c={severityColor(severity.score)} data-rank={row.rank}>
        <button onclick={() => (app.focusKey = diagKey(d))} title={t.focus.open}>
          <span class="row"><span class="src"><span class="dot" style:background={colorOf(d.sourceId)}></span>{nameOf(d.sourceId)}</span><span class="sev" style:--s={severityColor(severity.score)}>{t.severity[severity.level]}</span></span>
          {#if margin !== null}<span class="value hint" class:over={margin >= 0}>{t.diag.margin(margin)}</span>{/if}
          <span class:warn={d.kind !== 'long-line'}>{diagnosticText(d)}</span>
          {#if d.gain}<span class="gain value">{gainText(d)}</span>{/if}
        </button>
      </li>
      {/if}
    {/each}
  </ol>

  <div class="section-title">{t.diag.far(standardShort())}</div>
  <ul>
    {#each far as s (s.id)}
      <li style:--c={s.color}>
        <div class="static">
          <span class="row"><span class="src">{s.name}</span><span class="value" class:over={s.worst >= 0}>{t.diag.margin(s.worst)}</span></span>
          <span class="hint value">{formatEng(s.at, 'Hz', 3)}{shares(s.id)}</span>
          {#if app.commonMode[s.id]?.worst}
            {@const cm = app.commonMode[s.id]!}
            <span class="hint value cm" class:over={cm.worst!.margin >= 0}>{t.diag.cmLine(t.diag.margin(cm.worst!.margin), formatEng(cm.worst!.f, 'Hz', 3), t.explain.fig.cmMech[cm.mechanism])}</span>
          {/if}
        </div>
      </li>
    {/each}
    {#each compensated as s (s.id)}
      <li style:--c={s.color}>
        <div class="static">
          <span class="row"><span class="src">{s.name}</span><span class="value">–</span></span>
          <span class="hint">{t.diag.farCompensated}</span>
        </div>
      </li>
    {/each}
  </ul>
  <p class="hint">{t.diag.farHint}</p>

  <div class="section-title">{t.diag.hotspots}</div>
  {#if app.hotspots.length === 0}
    <p class="hint">{t.diag.hotspotsNone}</p>
  {/if}
  <ul>
    {#each app.hotspots as h, i (i)}
      <li style:--c={colorOf(h.sourceId)}>
        <button onclick={() => goToWorld(h.x, h.z)} title={t.diag.goTo}>
          <span class="row"><span class="src">{nameOf(h.sourceId)}</span><span class="value db">{h.db.toFixed(0)} {app.view.fieldKind === 'E' ? t.units.dBuVm : t.units.dBuAm}</span></span>
          {#if h.nets.length || h.parts.length}
            <span class="hint">{t.diag.near}: {[...h.parts, ...h.nets].join(', ')}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>

  <div class="section-title">{t.standards.title}</div>
  <select
    class="standard"
    aria-label={t.standards.pick}
    value={app.standard}
    onchange={(e) => {
      app.standard = (e.currentTarget as HTMLSelectElement).value;
      // the cable estimates and the supply-noise check compare with the limits: recompute them
      engine.updateDiagnostics();
      engine.scheduleSave();
    }}
  >
    {#each STANDARDS as st (st.id)}<option value={st.id}>{stdText(st.id).name}</option>{/each}
  </select>
  <p class="hint std">{stdText(app.standard).text}</p>
  <details class="stds">
    <summary>{t.standards.allTitle}</summary>
    {#each STANDARDS as st (st.id)}
      <p class="hint"><b>{stdText(st.id).name}.</b> {stdText(st.id).text}</p>
    {/each}
    <p class="hint">{t.standards.common}</p>
    <p class="hint">{t.standards.missing}</p>
  </details>

  <div class="section-title">{t.report.title}</div>
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
</div>

<style>
  ol.ranked {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ol.ranked li {
    position: relative;
  }
  ol.ranked li.more button {
    padding-left: 30px;
    color: var(--muted);
    font-size: 12px;
  }
  ol.ranked li button {
    padding-left: 30px;
  }
  /* the rank stays the same as on the bubbles, also when some rows are folded away */
  ol.ranked li[data-rank]::before {
    content: attr(data-rank);
    position: absolute;
    left: 8px;
    top: 5px;
    font-size: 11px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .counts {
    margin-bottom: 2px;
  }
  ol.plan {
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }
  ol.plan li {
    counter-increment: step;
    border-left: 3px solid var(--s);
    margin-bottom: 4px;
  }
  .diag ol.plan li button {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 12.5px;
    line-height: 1.35;
    color: var(--text);
    background: color-mix(in srgb, var(--plate) 70%, transparent);
    border: 0;
    padding: 6px 8px;
    cursor: pointer;
  }
  ol.plan .n {
    flex: none;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  ol.plan .what {
    flex: 1;
    min-width: 0;
  }
  ol.plan li button:hover {
    background: var(--plate);
  }
  .how summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 6px;
  }
  .gain {
    color: var(--field);
    font-size: 12px;
  }
  .sev {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    color: #0b0f14;
    background: var(--s);
    border-radius: 9px;
    padding: 0 7px;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  select.standard {
    width: 100%;
  }
  .std {
    margin-top: 6px;
  }
  .stds summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 4px;
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
  .file-notes {
    margin: 0 0 10px;
    padding-left: 16px;
  }
  .file-notes li {
    margin: 2px 0;
  }
</style>
