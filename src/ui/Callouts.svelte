<script lang="ts">
  /**
   * Speech bubbles in the 3D view: the ranked layout hints as numbered pins (same numbers as in
   * the Diagnose tab), the sources with their far-field margin, and optionally the hotspots.
   * HTML over the canvas, so the text stays sharp; positions follow the camera after every
   * drawn frame. Red and yellow bubbles are laid out first and never disappear: without free
   * room they shrink to title, rating and far field (full on hover), then take the least covered
   * spot; when their place is out of view they wait at the edge with an arrow pointing to it.
   * Green ones are points (tooltip, click to look closer).
   */
  import type { Viewer } from '../render/viewer';
  import { app } from '../state/app.svelte';
  import { buildCallouts, calloutPriority, pointText, type Callout } from './calloutData';

  interface Props {
    viewer: Viewer;
  }
  let { viewer }: Props = $props();

  const callouts = $derived.by((): Callout[] => {
    void app.models;
    void app.fieldOrigin;
    void app.diagnostics;
    void app.hotspots;
    void app.view.callouts;
    return buildCallouts(viewer);
  });

  let els: HTMLElement[] = $state([]);
  let svg: SVGSVGElement | undefined = $state();
  let host: HTMLDivElement | undefined = $state();

  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const f1 = (v: number) => v.toFixed(1);

  function layout() {
    if (!host || !svg) return;
    const W = host.clientWidth;
    const H = host.clientHeight;
    const placed: Rect[] = [];
    let lines = '';
    const overlap = (r: Rect) =>
      placed.reduce((sum, q) => sum + Math.max(0, Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0)) * Math.max(0, Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0)), 0);
    const order = callouts.map((_, i) => i).sort((a, b) => calloutPriority(callouts[a]!) - calloutPriority(callouts[b]!) || a - b);
    for (const i of order) {
      const c = callouts[i]!;
      const el = els[i];
      if (!el) continue;
      const p = viewer.project(c.pos);
      const onScreen = !p.behind && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
      // green: a point at the spot
      if (c.level === 'minor') {
        el.style.visibility = onScreen ? 'visible' : 'hidden';
        if (onScreen) el.style.transform = `translate(${Math.round(p.x - el.offsetWidth / 2)}px, ${Math.round(p.y - el.offsetHeight / 2)}px)`;
        continue;
      }
      const important = c.level === 'critical' || c.level === 'check';
      if (!onScreen && !important) {
        el.style.visibility = 'hidden';
        continue;
      }
      // where the leader points: the spot, or for a spot out of view (or behind the camera) the
      // edge in its direction, with an arrow
      let target = { x: p.x, y: p.y };
      let arrow: { x: number; y: number } | null = null;
      const m = 12;
      let dx = p.x - W / 2;
      let dy = p.y - H / 2;
      if (!onScreen) {
        if (p.behind) [dx, dy] = [-dx, -dy];
        const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1e-6), (H / 2 - m) / Math.max(Math.abs(dy), 1e-6));
        target = { x: W / 2 + dx * k, y: H / 2 + dy * k };
        const len = Math.hypot(dx, dy) || 1;
        arrow = { x: dx / len, y: dy / len };
      }
      const sideways = Math.abs(dx) * (H / 2) > Math.abs(dy) * (W / 2);
      /** Spots to try for a bubble of size w × h, best first. */
      const candidates = (w: number, h: number) => {
        const cands: { x: number; y: number }[] = [];
        if (onScreen) {
          for (const lift of [28, 52, 76, 100, 124]) for (const side of [1, -1]) cands.push({ x: side > 0 ? p.x + 10 : p.x - 10 - w, y: p.y - lift - h });
          for (const drop of [24, 48, 72]) for (const side of [1, -1]) cands.push({ x: side > 0 ? p.x + 10 : p.x - 10 - w, y: p.y + drop });
          for (const side of [1, -1]) cands.push({ x: side > 0 ? p.x + 24 : p.x - 24 - w, y: p.y - h / 2 });
        } else {
          const bx = sideways ? (dx > 0 ? W - m - 10 - w : m + 10) : target.x - w / 2;
          const by = sideways ? target.y - h / 2 : dy > 0 ? H - m - 10 - h : m + 10;
          for (const n of [0, 1, -1, 2, -2, 3, -3]) cands.push(sideways ? { x: bx, y: by + n * (h + 6) } : { x: bx + n * (w + 6), y: by });
        }
        return cands;
      };
      // full bubble on a free spot, else the compact one (title, rating, far field), else for
      // red and yellow the least covered spot inside the view: they never disappear
      el.classList.remove('pin');
      el.classList.toggle('compact', !!c.brief);
      let w = el.offsetWidth;
      let h = el.offsetHeight;
      const rect = (s: { x: number; y: number }): Rect => ({ x0: s.x - 2, y0: s.y - 2, x1: s.x + w + 2, y1: s.y + h + 2 });
      const inside = (s: { x: number; y: number }) => ({ x: Math.max(2, Math.min(W - w - 2, s.x)), y: Math.max(2, Math.min(H - h - 2, s.y)) });
      const free = () => candidates(w, h).find((s) => { const r = rect(s); return r.x0 >= 0 && r.y0 >= 0 && r.x1 <= W && r.y1 <= H && overlap(r) === 0; }) ?? null;
      let spot = free();
      if (!spot) {
        el.classList.add('compact');
        w = el.offsetWidth;
        h = el.offsetHeight;
        spot = free();
      }
      if (!spot && important) spot = candidates(w, h).map(inside).reduce((best, s) => (overlap(rect(s)) < overlap(rect(best)) ? s : best));
      if (!spot) {
        // no room for an unrated bubble: a numbered one still shows its number at the spot
        el.classList.remove('compact');
        if (c.badge) {
          el.classList.add('pin');
          el.style.visibility = 'visible';
          el.style.transform = `translate(${Math.round(p.x - 9)}px, ${Math.round(p.y - 9)}px)`;
        } else el.style.visibility = 'hidden';
        continue;
      }
      placed.push(rect(spot));
      el.style.visibility = 'visible';
      el.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
      // leader from the spot (or the edge arrow) to the nearest point of the bubble
      const nx = Math.max(spot.x, Math.min(spot.x + w, target.x));
      const ny = Math.max(spot.y, Math.min(spot.y + h, target.y));
      if (Math.hypot(nx - target.x, ny - target.y) > 3) lines += `<line x1="${f1(target.x)}" y1="${f1(target.y)}" x2="${f1(nx)}" y2="${f1(ny)}" stroke="${c.color}" />`;
      if (arrow) {
        const { x: ux, y: uy } = arrow;
        const tip = [target.x + ux * 9, target.y + uy * 9];
        const a = [target.x - uy * 6, target.y + ux * 6];
        const b = [target.x + uy * 6, target.y - ux * 6];
        lines += `<polygon points="${[tip, a, b].map((q) => q.map(f1).join(',')).join(' ')}" fill="${c.severity ?? c.color}" />`;
      } else lines += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="2.5" fill="${c.color}" />`;
    }
    svg.innerHTML = lines;
  }

  $effect(() => viewer.onRendered(() => layout()));
  // new content: lay out once the bubbles have their size
  $effect(() => {
    void callouts;
    requestAnimationFrame(() => layout());
  });
</script>

<div class="callouts" bind:this={host}>
  <svg bind:this={svg} class="leaders" aria-hidden="true"></svg>
  {#each callouts as c, i (c.key)}
    {#if c.level === 'minor'}
      <button class="point {c.kind}" style:--c={c.color} style:--s={c.severity} bind:this={els[i]} onclick={c.onclick} title={pointText(c)} aria-label={pointText(c)}>{c.badge ?? ''}</button>
    {:else}
      <button class="bubble {c.kind}" class:important={c.level === 'critical' || c.level === 'check'} style:--c={c.color} bind:this={els[i]} onclick={c.onclick}>
        <span class="head">
          {#if c.badge}<span class="badge" style:background={c.severity}>{c.badge}</span>{:else if c.severity}<span class="sevdot" style:background={c.severity}></span>{/if}
          <span class="title">{c.title}</span>
          {#if c.severityLabel}<span class="sevlabel" style:color={c.severity}>{c.severityLabel}</span>{/if}
        </span>
        {#each c.lines as l, k (k)}<span class="line">{l}</span>{/each}
        {#if c.accent}<span class="accent value">{c.accent}</span>{/if}
        {#if c.spectrum}<span class="chart">{@html c.spectrum}</span>{/if}
        {#if c.more}<span class="more">{c.more}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .callouts {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .leaders {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    stroke-width: 1;
    opacity: 0.8;
  }
  .bubble {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-width: 230px;
    min-width: 0;
    padding: 5px 8px 6px;
    text-align: left;
    font: inherit;
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--text);
    background: color-mix(in srgb, var(--plate) 92%, transparent);
    border: 1px solid var(--line);
    border-left: 3px solid var(--c);
    border-radius: 4px;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.35);
    cursor: pointer;
    will-change: transform;
  }
  .bubble.important {
    z-index: 1;
  }
  .bubble:hover {
    z-index: 3;
    border-color: var(--c);
  }
  /* green: only a point (number for a hint), the bubble's text as tooltip */
  .point {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    pointer-events: auto;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border: 0;
    border-radius: 8px;
    background: var(--s);
    color: #0b0f14;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    box-shadow:
      0 0 0 2px #0b0f14,
      0 0 0 3px var(--c);
    cursor: pointer;
    will-change: transform;
  }
  .point.source {
    min-width: 11px;
    width: 11px;
    height: 11px;
    padding: 0;
  }
  .point:hover,
  .point:focus-visible {
    z-index: 3;
    box-shadow:
      0 0 0 2px #0b0f14,
      0 0 0 4px var(--c);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .badge {
    flex: none;
    min-width: 17px;
    height: 17px;
    border-radius: 9px;
    background: var(--c);
    color: #0b0f14;
    font-weight: 700;
    font-size: 11px;
    text-align: center;
    line-height: 17px;
    font-variant-numeric: tabular-nums;
  }
  .sevdot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .sevlabel {
    flex: none;
    margin-left: auto;
    font-size: 10.5px;
    font-weight: 600;
  }
  .bubble:global(.pin) .sevlabel {
    display: none;
  }
  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line {
    color: var(--muted);
  }
  .accent {
    color: var(--field);
  }
  .chart {
    display: block;
    margin-top: 4px;
    line-height: 0;
  }
  .bubble:global(.pin) .chart,
  .bubble:global(.compact) .chart,
  .bubble:global(.compact) .line {
    display: none;
  }
  .bubble:global(.compact):hover .chart,
  .bubble:global(.compact):hover .line {
    display: block;
  }
  .more {
    display: none;
    margin-top: 3px;
    color: var(--muted);
    font-size: 11px;
  }
  .bubble:hover .more,
  .bubble:focus-visible .more {
    display: block;
  }
  .bubble:global(.pin) {
    padding: 0;
    background: none;
    border: 0;
    box-shadow: none;
  }
  .bubble:global(.pin) .title,
  .bubble:global(.pin) .line,
  .bubble:global(.pin) .accent,
  .bubble:global(.pin) .more {
    display: none;
  }
  .bubble:global(.pin) .badge {
    box-shadow: 0 0 0 2px #0b0f14;
  }
  .bubble.hotspot {
    padding: 3px 7px 4px;
  }
  .bubble.hotspot .title {
    color: var(--field);
  }
  @media (max-width: 760px) {
    .bubble {
      max-width: 180px;
      font-size: 11px;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .bubble {
      transition: opacity 0.12s;
    }
  }
</style>
