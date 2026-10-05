<script lang="ts">
  /**
   * Labels of the problem view: net names with the source's values, planes, parts, and the
   * figures of the dimensions and areas. HTML over the canvas, placed after every drawn frame;
   * labels step aside instead of overlapping, dimension figures sit on their dimension.
   */
  import type { Viewer } from '../render/viewer';
  import type { FocusAnchor } from '../render/focusScene';

  interface Props {
    viewer: Viewer;
    anchors: FocusAnchor[];
    /** Width covered by the card on the left, px (labels stay out of it). */
    inset?: number;
  }
  let { viewer, anchors, inset = 0 }: Props = $props();

  let els: HTMLElement[] = $state([]);
  let host: HTMLDivElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();

  function layout() {
    if (!host || !svg) return;
    const W = host.clientWidth;
    const H = host.clientHeight;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = W > 760 && inset > 0 ? [{ x0: 0, y0: 0, x1: inset, y1: H }] : [];
    let lines = '';
    // dimension figures first (they belong exactly where they are), then the rest
    const order = anchors.map((a, i) => i).sort((a, b) => Number(anchors[b]!.kind === 'dim') - Number(anchors[a]!.kind === 'dim'));
    for (const i of order) {
      const a = anchors[i]!;
      const el = els[i];
      if (!el) continue;
      const p = viewer.project(a.pos);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const tries = a.kind === 'dim' ? [[-w / 2, -h / 2], [-w / 2, -h - 6], [-w / 2, 6], [0, -h / 2], [-w, -h / 2]] : [[8, -h - 14], [-w - 8, -h - 14], [8, -h - 40], [-w - 8, -h - 40], [8, 10], [-w - 8, 10]];
      let spot: [number, number] | null = null;
      if (!p.behind)
        for (const [dx, dy] of tries) {
          const r = { x0: p.x + dx! - 2, y0: p.y + dy! - 2, x1: p.x + dx! + w + 2, y1: p.y + dy! + h + 2 };
          if (r.x0 < 0 || r.y0 < 0 || r.x1 > W || r.y1 > H) continue;
          if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
          placed.push(r);
          spot = [p.x + dx!, p.y + dy!];
          break;
        }
      if (!spot) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${Math.round(spot[0])}px, ${Math.round(spot[1])}px)`;
      if (a.kind !== 'dim') {
        const lx = spot[0] + w / 2 < p.x ? spot[0] + w : spot[0];
        const ly = spot[1] + h / 2 < p.y ? spot[1] + h : spot[1];
        lines += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" />`;
        lines += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" />`;
      }
    }
    svg.innerHTML = lines;
  }

  $effect(() => viewer.onRendered(() => layout()));
  $effect(() => {
    void anchors;
    requestAnimationFrame(() => layout());
  });
</script>

<div class="labels" bind:this={host}>
  <svg bind:this={svg} class="leaders" aria-hidden="true"></svg>
  {#each anchors as a, i (i)}
    <div class="label {a.kind}" style:--c={a.color ?? 'var(--text)'} bind:this={els[i]}>
      <span class="text">{a.text}</span>
      {#if a.sub}<span class="sub">{a.sub}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .labels {
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
    stroke: var(--muted);
    fill: var(--muted);
    stroke-width: 1;
  }
  .label {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    display: flex;
    flex-direction: column;
    max-width: 240px;
    padding: 3px 7px 4px;
    font-size: 11.5px;
    line-height: 1.3;
    background: color-mix(in srgb, var(--plate) 90%, transparent);
    border: 1px solid var(--line);
    border-radius: 4px;
    will-change: transform;
  }
  .text {
    font-weight: 600;
    color: var(--c);
    white-space: nowrap;
  }
  .sub {
    color: var(--muted);
  }
  .label.net {
    border-left: 3px solid var(--c);
  }
  .label.plane .text {
    color: var(--text);
  }
  .label.part {
    background: color-mix(in srgb, var(--viewport) 85%, transparent);
  }
  .label.dim {
    background: #0b0f14;
    border-color: var(--c);
    font-variant-numeric: tabular-nums;
  }
  .label.note {
    border-color: var(--c);
  }
  .label.fix {
    border-color: var(--ok);
    border-style: dashed;
    background: color-mix(in srgb, #0b0f14 88%, var(--ok));
    white-space: normal;
  }
  .label.fix .text {
    white-space: normal;
  }
</style>
