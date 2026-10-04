/**
 * EMC report (W5): one self-contained HTML file with a picture of the 3D view, the sources,
 * layout findings, hotspots and the far-field estimate. Light and printable, so it can be
 * attached to a design review or printed to PDF from the browser.
 */
import { branding } from '../branding';
import { t, i18n, fmtNum } from '../i18n';
import { app } from '../state/app.svelte';
import { engine, selectionFromView } from '../state/engine.svelte';
import { formatEng } from '../physics/units';
import { BANDS } from '../physics/spectrum';
import { diagnosticText, farMargins, sourceColor, sourceName, sourceSummary } from './texts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function selectionLabel(): string {
  const sel = selectionFromView();
  if (sel.mode === 'all') return t.report.selAll;
  if (sel.mode === 'line') return formatEng(sel.f, 'Hz', 3);
  const band = BANDS.find((b) => b.id === app.view.bandId);
  return band ? `${formatEng(sel.f0, 'Hz', 2)}–${formatEng(sel.f1, 'Hz', 2)}` : '';
}

export function buildReport(image: string | null): string {
  const R = t.report;
  const board = app.board;
  const fileName = board?.source.fileName ?? '';
  const now = new Date();
  const date = now.toLocaleString(i18n.lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const enabled = app.sources.filter((s) => s.enabled);
  const far = farMargins();
  const worstFar = far[0];
  const top = app.hotspots[0];
  const dot = (c: string) => `<span class="dot" style="background:${esc(c)}"></span>`;

  const summary = [
    `<div><span class="k">${esc(R.sumSources)}</span><span class="v">${enabled.length} / ${app.sources.length}</span></div>`,
    `<div><span class="k">${esc(R.sumFindings)}</span><span class="v">${app.diagnostics.length}</span></div>`,
    top ? `<div><span class="k">${esc(R.sumHotspot)}</span><span class="v">${top.db.toFixed(0)} ${esc(t.units.dBuAm)}</span><span class="s">${esc(sourceName(top.sourceId))}</span></div>` : '',
    worstFar
      ? `<div class="${worstFar.worst >= 0 ? 'over' : ''}"><span class="k">${esc(R.sumFar)}</span><span class="v">${esc(t.diag.margin(worstFar.worst))}</span><span class="s">${esc(worstFar.name)}, ${esc(formatEng(worstFar.at, 'Hz', 3))}</span></div>`
      : '',
  ].join('');

  const sources = app.sources
    .map((s) => {
      const err = app.sourceErrors[s.id];
      const warns = app.models[s.id]?.info.warnings ?? [];
      return `<tr class="${s.enabled ? '' : 'off'}"><td>${dot(s.color)}${esc(s.name)}</td><td>${esc(sourceSummary(s))}</td><td>${esc(s.enabled ? R.on : R.off)}</td><td>${esc([err, ...warns].filter(Boolean).join('; '))}</td></tr>`;
    })
    .join('');

  const findings = app.diagnostics.length
    ? `<ol class="findings">${app.diagnostics
        .map((d) => `<li>${dot(sourceColor(d.sourceId))}<b>${esc(sourceName(d.sourceId))}</b> · ${esc(diagnosticText(d))} <span class="at">(${fmtNum(d.at.x, 1)} / ${fmtNum(d.at.y, 1)} mm)</span></li>`)
        .join('')}</ol>`
    : `<p>${esc(t.diag.none)}</p>`;

  const hotspots = app.hotspots.length
    ? `<table><thead><tr><th>${esc(R.colSource)}</th><th class="n">${esc(R.colLevel)}</th><th>${esc(R.colPos)}</th><th>${esc(t.diag.near)}</th></tr></thead><tbody>${app.hotspots
        .map((h) => {
          const bx = h.x + engine.frame.ox;
          const by = h.z + engine.frame.oy;
          return `<tr><td>${dot(sourceColor(h.sourceId))}${esc(sourceName(h.sourceId))}</td><td class="n">${h.db.toFixed(0)} ${esc(t.units.dBuAm)}</td><td>${fmtNum(bx, 1)} / ${fmtNum(by, 1)} mm, ${fmtNum(h.y, 1)} mm</td><td>${esc([...h.parts, ...h.nets].join(', '))}</td></tr>`;
        })
        .join('')}</tbody></table>`
    : `<p>${esc(t.diag.hotspotsNone)}</p>`;

  const farTable = far.length
    ? `<table><thead><tr><th>${esc(R.colSource)}</th><th class="n">${esc(R.colMargin)}</th><th class="n">${esc(R.colFreq)}</th></tr></thead><tbody>${far
        .map((s) => `<tr class="${s.worst >= 0 ? 'over' : ''}"><td>${dot(s.color)}${esc(s.name)}</td><td class="n">${esc(t.diag.margin(s.worst))}</td><td class="n">${esc(formatEng(s.at, 'Hz', 3))}</td></tr>`)
        .join('')}</tbody></table>`
    : '';

  const fw = app.fullwave;
  const origin = app.fieldOrigin === 'fullwave' && fw ? R.originFull(fw.fileName) : R.originFast;
  const settings: [string, string][] = [
    [R.setBoard, fileName],
    [R.setLayers, board ? `${board.layers.length} · ${board.layers.map((l) => l.name).join(', ')}` : ''],
    [R.setSelection, selectionLabel()],
    [R.setOrigin, origin],
    [R.setReturn, app.returnModel === 'detour' ? R.returnDetour : R.returnImage],
    [R.setGrid, t.top.qualityOptions[app.quality]],
    [R.setFMax, formatEng(app.fMax, 'Hz', 2)],
  ];

  return `<!doctype html>
<html lang="${i18n.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(R.title)} · ${esc(fileName)}</title>
<style>
  :root { --ink: #1c2430; --muted: #5b6676; --line: #d9dee5; --paper: #ffffff; --wash: #f4f6f8; --amber: #c9781a; --red: #b42318; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--wash); color: var(--ink); font: 14px/1.5 "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 40px 32px 56px; background: var(--paper); }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 26px; line-height: 1.2; margin: 0 0 4px; letter-spacing: -0.01em; }
  .meta { color: var(--muted); font-size: 13px; }
  h2 { font-size: 16px; margin: 32px 0 10px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
  img.view { display: block; width: 100%; border-radius: 4px; background: #182030; }
  .note { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); margin: 18px 0 4px; }
  .summary > div { background: var(--paper); padding: 10px 12px; display: flex; flex-direction: column; }
  .summary .k { color: var(--muted); font-size: 12px; }
  .summary .v { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .summary .s { color: var(--muted); font-size: 12px; }
  .summary .over .v, tr.over td { color: var(--red); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--line); padding: 6px 8px 6px 0; }
  td { border-bottom: 1px solid var(--line); padding: 6px 8px 6px 0; vertical-align: top; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.off td { color: var(--muted); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: 0; }
  ol.findings { padding-left: 22px; margin: 0; }
  ol.findings li { margin-bottom: 8px; }
  .at { color: var(--muted); font-size: 12px; white-space: nowrap; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  footer { margin-top: 36px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
  @media (max-width: 600px) { main { padding: 24px 16px; } .at { white-space: normal; } }
  @media print { body { background: none; } main { padding: 0; max-width: none; } h2 { break-after: avoid; } tr, li { break-inside: avoid; } }
</style>
</head>
<body>
<main>
<header>
  <h1>${esc(R.title)}: ${esc(fileName)}</h1>
  <div class="meta">${esc(date)} · ${esc(R.disclaimer)}</div>
</header>
${image ? `<img class="view" src="${image}" alt="${esc(R.imageAlt)}">` : ''}
<p class="note">${esc(R.imageNote(selectionLabel(), origin))}</p>
<div class="summary">${summary}</div>

<h2>${esc(R.findings)}</h2>
${findings}

<h2>${esc(t.diag.hotspots)}</h2>
${hotspots}

<h2>${esc(t.diag.far)}</h2>
${farTable}
<p class="note">${esc(t.diag.farHint)}</p>

<h2>${esc(R.sources)}</h2>
<table><thead><tr><th>${esc(R.colSource)}</th><th>${esc(R.colModel)}</th><th>${esc(R.colState)}</th><th>${esc(R.colNotes)}</th></tr></thead><tbody>${sources}</tbody></table>

<h2>${esc(R.settings)}</h2>
<dl>${settings.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>

<footer>${esc(R.footer(branding.displayName))} <a href="${esc(branding.siteUrl)}">${esc(branding.siteUrl)}</a></footer>
</main>
</body>
</html>
`;
}
