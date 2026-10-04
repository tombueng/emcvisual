<script lang="ts">
  /**
   * Speech bubbles in the 3D view: the ranked layout hints as numbered pins (same numbers as in
   * the Diagnose tab), the sources with their far-field margin, and optionally the hotspots.
   * HTML over the canvas, so the text stays sharp; positions follow the camera after every
   * drawn frame, and bubbles step aside (higher, then to the left) instead of overlapping.
   */
  import type { Viewer } from '../render/viewer';
  import { app } from '../state/app.svelte';
  import { buildCallouts, type Callout } from './calloutData';

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

  /** Place every bubble: above-right of its anchor, else higher, else to the left; drop if no room. */
  function layout() {
    if (!host || !svg) return;
    const W = host.clientWidth;
    const H = host.clientHeight;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    let lines = '';
    callouts.forEach((c, i) => {
      const el = els[i];
      if (!el) return;
      const p = viewer.project(c.pos);
      // measure the full bubble, not the pin it may have been last frame
      el.classList.remove('pin');
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let spot: { x: number; y: number } | null = null;
      if (!p.behind && p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20) {
        search: for (const lift of [28, 52, 76, 100, 124]) {
          for (const side of [1, -1]) {
            const x = side > 0 ? p.x + 10 : p.x - 10 - w;
            const y = p.y - lift - h;
            const r = { x0: x - 2, y0: y - 2, x1: x + w + 2, y1: y + h + 2 };
            if (r.x0 < 0 || r.y0 < 0 || r.x1 > W || r.y1 > H) continue;
            if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
            placed.push(r);
            spot = { x, y };
            break search;
          }
        }
      }
      if (!spot) {
        // no room for the bubble: a numbered hint still shows its number at the spot
        const onScreen = !p.behind && p.x > 0 && p.x < W && p.y > 0 && p.y < H;
        if (c.badge && onScreen) {
          el.classList.add('pin');
          el.style.visibility = 'visible';
          el.style.transform = `translate(${Math.round(p.x - 9)}px, ${Math.round(p.y - 9)}px)`;
        } else el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
      // leader from the anchor to the nearer bottom corner of the bubble
      const lx = spot.x + w / 2 < p.x ? spot.x + w : spot.x;
      lines += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${(spot.y + h).toFixed(1)}" stroke="${c.color}" />`;
      lines += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${c.color}" />`;
    });
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
    <button class="bubble {c.kind}" style:--c={c.color} bind:this={els[i]} onclick={c.onclick}>
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
  .bubble:hover {
    z-index: 2;
    border-color: var(--c);
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
  .bubble:global(.pin) .chart {
    display: none;
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
