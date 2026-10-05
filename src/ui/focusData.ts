/**
 * The problem view (click on a hint): what to show for one finding. Only the nets of the
 * source (and partner nets), the reference planes concerned, the parts on those nets, the vias,
 * the return detour of this finding; labels with net names and the source's values; dimensions,
 * areas and circles that show exactly what the calculation objects to. render/focusScene.ts
 * turns this into geometry; FocusPanel.svelte shows the text and the editable inputs.
 */
import { app } from '../state/app.svelte';
import { t, fmtNum } from '../i18n';
import { formatEng } from '../physics/units';
import { findPad } from '../physics/currents';
import { referencePlane, type Diagnostic } from '../physics/diagnostics';
import type { Detour } from '../physics/returnPaths';
import type { Source } from '../physics/sources';
import type { BBox2, BoardModel, Vec2 } from '../model/types';
import { covered } from '../model/planes';
import { computeFieldMap, type FieldMap } from './focusField';

export interface FocusLabel {
  at: Vec2;
  /** Copper layer the label belongs to, or 'parts' for the top of a part body. */
  layer: number | 'parts';
  text: string;
  sub?: string;
  kind: 'net' | 'plane' | 'part' | 'note';
  color?: string;
}

export interface FocusSpec {
  key: string;
  diag: Diagnostic;
  /** The finding's source; null for board rules (filters, shields, decoupling). */
  source: Source | null;
  color: string;
  /** Nets of the source (drawn in its colour). */
  nets: number[];
  /**
   * The copper the calculation uses as the current path (horizontal pieces in board mm, with
   * their layer and width). For a hot loop that is only the loop, not all of GND.
   */
  path: { a: Vec2; b: Vec2; layer: number; width: number }[];
  planes: { layer: number; net: number; role: string }[];
  /** Footprint indices. */
  parts: number[];
  /** Via indices on the source's current path. */
  vias: number[];
  /** Stitching vias of the plane nets near the finding or the detour (drawn faint). */
  stitchVias: number[];
  detour: Detour | null;
  region: BBox2;
  labels: FocusLabel[];
  dims: { a: Vec2; b: Vec2; layer: number; text: string }[];
  areas: { poly: Vec2[]; layer: number; text: string }[];
  circles: { c: Vec2; r: number; layer: number; text: string }[];
  paths: { pts: Vec2[]; layer: number; text: string }[];
  /** The best fix, drawn in green at its place. */
  suggestions: { at: Vec2; layer: number; kind: 'cap' | 'via' | 'res' | 'area'; poly?: Vec2[]; text: string }[];
  /** Where this finding adds field (or the source's field), on a plane above the board. */
  field: FieldMap | null;
  /** Further nets in their own colour (e.g. the I/O line a clock couples into). */
  others?: { pieces: { a: Vec2; b: Vec2; layer: number; width: number }[]; color: string }[];
  /** Cables drawn leaving the board at connectors: they are the antenna of common mode. */
  cables?: { at: Vec2; dir: Vec2; text: string }[];
}

/** Colour of a victim line in the problem view. */
const VICTIM = '#e879f9';
/** The unfiltered side of a bypassed filter. */
const BYPASS_IN = '#f2a33a';

/** A cable leaving at a connector, pointing away from the board centre. */
function cableAt(board: BoardModel, ref: string, text: string): { at: Vec2; dir: Vec2; text: string } | null {
  const fp = board.footprints.find((f) => f.ref === ref);
  if (!fp) return null;
  const c = { x: (board.bbox.x0 + board.bbox.x1) / 2, y: (board.bbox.y0 + board.bbox.y1) / 2 };
  const dx = fp.at.x - c.x;
  const dy = fp.at.y - c.y;
  // out through the nearer edge
  const toX = Math.min(fp.at.x - board.bbox.x0, board.bbox.x1 - fp.at.x);
  const toY = Math.min(fp.at.y - board.bbox.y0, board.bbox.y1 - fp.at.y);
  const dir = toX < toY ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
  return { at: fp.at, dir, text };
}

export const diagKey = (d: Diagnostic) => `${d.sourceId}|${d.kind}|${d.at.x.toFixed(2)},${d.at.y.toFixed(2)}`;

const len = (p: Vec2[]) => p.reduce((s, q, i) => (i ? s + Math.hypot(q.x - p[i - 1]!.x, q.y - p[i - 1]!.y) : 0), 0);

/** The detour that explains a finding (same rule as diagnostics.ts). */
function detourFor(d: Diagnostic, detours: Detour[]): Detour | null {
  const kind = d.kind === 'return-gap' ? 'gap' : d.kind === 'ref-change' || d.kind === 'no-stitching' ? 'transfer' : null;
  if (!kind) return null;
  const near = (p: Vec2) => Math.hypot(p.x - d.at.x, p.y - d.at.y);
  const best = detours
    .filter((x) => x.kind === kind && x.path.length)
    .map((x) => ({ x, dist: Math.min(...x.path.map(near)) }))
    .sort((a, b) => a.dist - b.dist)[0];
  return best && best.dist < 8 ? best.x : null;
}

/** Nets a source drives. */
function sourceNets(board: BoardModel, s: Source): number[] {
  const id = (n: string) => board.nets.indexOf(n);
  const names =
    s.type === 'signal'
      ? s.nets
      : s.type === 'diffpair'
        ? [s.netP, s.netN]
        : s.type === 'loop'
          ? s.pads.map((p) => board.nets[board.pads[findPad(board, p)]?.net ?? 0] ?? '')
          : (() => {
              const fp = board.footprints.find((f) => f.ref === s.ref);
              return fp ? fp.pads.map((pi) => board.nets[board.pads[pi]!.net] ?? '') : [];
            })();
  return [...new Set(names.map(id).filter((i) => i > 0))];
}

/** One line with the values of a source that drive the result. */
export function sourceFacts(s: Source): string {
  const w = s.waveform;
  if (s.type === 'inductor') return `${formatEng(w.f0, 'Hz')} · ${t.focus.ripple} ${formatEng(w.amplitude, 'A')} · ${t.focus.shielding[s.shielding]}`;
  if (s.type === 'loop') return `${formatEng(w.f0, 'Hz')} · tr ${formatEng(w.tr, 's')} · ${formatEng(w.amplitude, 'A')}`;
  const f = s.kind === 'data' ? formatEng(w.f0 * 2, 'bit/s') : formatEng(w.f0, 'Hz');
  return `${f} · tr ${formatEng(w.tr, 's')} · ${formatEng(w.amplitude, 'V')}`;
}

/**
 * Board rules (no source): the parts and nets involved, their reference plane, the dimension the
 * rule measures, and the fix drawn at its place.
 */
function buildBoardFocus(board: BoardModel, d: Diagnostic): FocusSpec {
  const color = '#9aa4b2';
  const refs = new Set(d.parts ?? []);
  const parts = board.footprints.map((f, i) => (refs.has(f.ref) ? i : -1)).filter((i) => i >= 0);
  const nets = [...new Set((d.nets ?? []).map((n) => board.nets.indexOf(n)).filter((i) => i > 0))];
  const netSet = new Set(nets);
  const path: FocusSpec['path'] = board.tracks.filter((tr) => netSet.has(tr.net)).map((tr) => ({ a: tr.a, b: tr.b, layer: tr.layer, width: tr.width }));
  const bx = d.bypass?.box;
  const overlap: Vec2[] = bx
    ? [
        { x: bx.x0, y: bx.y0 },
        { x: bx.x1, y: bx.y0 },
        { x: bx.x1, y: bx.y1 },
        { x: bx.x0, y: bx.y1 },
      ]
    : [];
  const pts: Vec2[] = [d.at, ...overlap, ...parts.flatMap((i) => board.footprints[i]!.pads.map((pi) => board.pads[pi]!.at)), ...(d.dims ?? []).flatMap((x) => [x.a, x.b])];
  const region = { x0: Math.min(...pts.map((p) => p.x)) - 5, y0: Math.min(...pts.map((p) => p.y)) - 5, x1: Math.max(...pts.map((p) => p.x)) + 5, y1: Math.max(...pts.map((p) => p.y)) + 5 };
  const inRegion = (p: Vec2) => p.x >= region.x0 && p.x <= region.x1 && p.y >= region.y0 && p.y <= region.y1;
  const top = board.footprints[parts[0] ?? -1]?.side === 'bottom' ? board.layers.length - 1 : 0;
  const ref = referencePlane(board, app.planes, top);
  const planes: FocusSpec['planes'] = ref ? [{ layer: ref.layer, net: ref.net, role: t.focus.referenceOf(board.layers[top]!.name) }] : [];
  const vias: number[] = [];
  board.vias.forEach((v, i) => {
    if (inRegion(v.at) && (netSet.has(v.net) || (ref && v.net === ref.net))) vias.push(i);
  });
  const labels: FocusLabel[] = parts.map((i) => {
    const f = board.footprints[i]!;
    return { at: f.body.center, layer: 'parts' as const, text: f.value && f.value !== f.ref ? `${f.ref} · ${f.value}` : f.ref, kind: 'part' as const };
  });
  for (const n of nets) {
    const tr = board.tracks.filter((x) => x.net === n).sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))[0];
    if (tr) labels.push({ at: { x: (tr.a.x + tr.b.x) / 2, y: (tr.a.y + tr.b.y) / 2 }, layer: tr.layer, text: board.nets[n]!, kind: 'net', color });
  }
  const dims: FocusSpec['dims'] = (d.dims ?? []).map((x) => ({ a: x.a, b: x.b, layer: top, text: x.text }));
  const circles: FocusSpec['circles'] = [];
  const suggestions: FocusSpec['suggestions'] = [];
  if (d.kind === 'filter-ground' || d.kind === 'shield-weak') {
    circles.push({ c: d.at, r: Math.min(d.value, 6), layer: top, text: t.focus.groundReach(fmtNum(d.value >= 99 ? 0 : d.value, 1)) });
    suggestions.push({ at: { x: d.at.x + 0.9, y: d.at.y }, layer: top, kind: 'via', text: t.focus.suggest.stitchVia(ref ? (board.nets[ref.net] ?? 'GND') : 'GND') });
  } else if (d.kind === 'shield-open') suggestions.push({ at: { x: d.at.x + 1.2, y: d.at.y }, layer: top, kind: 'via', text: t.focus.suggest.shieldToGround });
  else if (d.kind === 'filter-far' && d.dims?.[0]) suggestions.push({ at: { x: d.dims[0].a.x + 3, y: d.dims[0].a.y + 2 }, layer: top, kind: 'res', text: t.focus.suggest.filterHere });
  else if (d.kind === 'decoupling') suggestions.push({ at: { x: d.at.x + 1.5, y: d.at.y - 1.5 }, layer: top, kind: 'cap', text: t.focus.suggest.decoupleHere(d.decoupling?.pin ?? '') });
  const areas: FocusSpec['areas'] = [];
  let others: FocusSpec['others'];
  if (d.kind === 'filter-bypass' && d.bypass) {
    const [la, lb] = d.bypass.pair;
    areas.push({ poly: overlap, layer: Math.min(la, lb), text: t.focus.overlap(fmtNum(d.bypass.area, 0), fmtNum(d.bypass.cap * 1e12, 0)) });
    // the copper of both nets, outlined on its layer: the input side in the source colour, the output side like a victim
    others = nets.map((n, k) => ({
      color: k === 0 ? BYPASS_IN : VICTIM,
      pieces: board.zones
        .filter((z) => z.net === n)
        .flatMap((z) => z.polygons.flatMap((poly) => poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length]!, layer: z.layer, width: 0.3 })))),
    }));
    // net labels on each net's copper of the pair, near opposite corners of the overlap
    nets.forEach((n, k) => {
      const layer = d.bypass!.pair[k] ?? la;
      const all = board.zones.filter((x) => x.net === n && x.layer === layer).flatMap((x) => x.polygons.flat());
      if (!all.length || !bx) return;
      const corner = k === 0 ? { x: bx.x0, y: bx.y0 } : { x: bx.x1, y: bx.y1 };
      const pick = all.reduce((best, q) => (Math.hypot(q.x - corner.x, q.y - corner.y) < Math.hypot(best.x - corner.x, best.y - corner.y) ? q : best));
      labels.push({ at: pick, layer, text: `${board.nets[n]} (${board.layers[layer]?.name ?? ''})`, kind: 'net', color: k === 0 ? BYPASS_IN : VICTIM });
    });
  }
  return { key: diagKey(d), diag: d, source: null, color, nets, path, planes, parts, vias, stitchVias: [], detour: null, region, labels, dims, areas, circles, paths: [], suggestions, field: null, ...(others ? { others } : {}) };
}

export function buildFocus(d: Diagnostic): FocusSpec | null {
  const board = app.board;
  if (board && d.sourceId === '') return buildBoardFocus(board, d);
  const s = app.sources.find((x) => x.id === d.sourceId);
  if (!board || !s) return null;
  const nets = sourceNets(board, s);
  const netSet = new Set(nets);
  const detour = detourFor(d, app.detours[s.id] ?? []);
  // the current path of the model: tracks of a signal, only the loop of a regulator
  const model = app.models[s.id];
  const frame = { ox: (board.bbox.x0 + board.bbox.x1) / 2, oy: (board.bbox.y0 + board.bbox.y1) / 2 };
  const toB = (p: [number, number, number]): Vec2 => ({ x: p[0] + frame.ox, y: p[2] + frame.oy });
  const path: FocusSpec['path'] = [];
  const pathVias: Vec2[] = [];
  for (const e of model?.elements ?? []) {
    if (e.tag === 'return') continue;
    if (e.vertical) {
      if (e.tag === 'via') pathVias.push(toB(e.a));
    } else if (e.layer >= 0) path.push({ a: toB(e.a), b: toB(e.b), layer: e.layer, width: Math.max(0.15, e.r * 2) });
  }
  const loopLike = s.type === 'loop' || s.type === 'inductor';

  // region: the finding, the detour and the source's current path
  const pts: Vec2[] = [d.at, ...(detour?.path ?? [])];
  for (const e of path) pts.push(e.a, e.b);
  if (!path.length) for (const tr of board.tracks) if (netSet.has(tr.net)) pts.push(tr.a, tr.b);
  const r0 = { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
  const region = { x0: r0.x0 - 4, y0: r0.y0 - 4, x1: r0.x1 + 4, y1: r0.y1 + 4 };
  const inRegion = (p: Vec2) => p.x >= region.x0 && p.x <= region.x1 && p.y >= region.y0 && p.y <= region.y1;

  // layers the source runs on, and their reference planes
  const layers = new Set<number>();
  for (const e of path) layers.add(e.layer);
  if (!path.length) for (const tr of board.tracks) if (netSet.has(tr.net)) layers.add(tr.layer);
  if (layers.size === 0) layers.add(0);
  const planes: FocusSpec['planes'] = [];
  for (const l of [...layers].sort((a, b) => a - b)) {
    const p = referencePlane(board, app.planes, l);
    if (p && !planes.some((q) => q.layer === p.layer)) planes.push({ layer: p.layer, net: p.net, role: t.focus.referenceOf(board.layers[l]!.name) });
  }
  if (detour?.kind === 'transfer' && detour.layer >= 0 && !planes.some((q) => q.layer === detour.layer)) {
    const p = app.planes.find((q) => q.layer === detour.layer);
    if (p) planes.push({ layer: p.layer, net: p.net, role: t.focus.referenceAfter });
  }
  const planeNets = new Set(planes.map((p) => p.net));

  // parts: on a signal everything on its nets; on a loop only the loop's parts (GND is everywhere)
  const parts = new Set<number>();
  if (s.type === 'loop') for (const pr of s.pads) parts.add(board.pads[findPad(board, pr)]?.footprint ?? -1);
  else if (s.type === 'inductor') parts.add(board.footprints.findIndex((f) => f.ref === s.ref));
  else
    board.footprints.forEach((f, i) => {
      if (f.pads.some((pi) => netSet.has(board.pads[pi]!.net))) parts.add(i);
    });
  parts.delete(-1);
  const linkRef = detour?.via && detour.via !== 'via' ? detour.via : null;
  const link = linkRef ? board.footprints.findIndex((f) => f.ref === linkRef) : -1;
  if (link >= 0) parts.add(link);

  // vias: those on the current path, and the stitching vias near the finding or the detour
  const vias: number[] = [];
  const stitch: { i: number; d: number }[] = [];
  const nearPath = (p: Vec2) => Math.min(Math.hypot(p.x - d.at.x, p.y - d.at.y), ...(detour?.path ?? []).map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
  board.vias.forEach((v, i) => {
    const onPath = pathVias.some((q) => Math.hypot(q.x - v.at.x, q.y - v.at.y) < 0.05);
    if (onPath || (!loopLike && netSet.has(v.net) && !planeNets.has(v.net))) vias.push(i);
    else if (planeNets.has(v.net) && inRegion(v.at)) {
      const dist = nearPath(v.at);
      if (dist < 8) stitch.push({ i, d: dist });
    }
  });
  const stitchVias = stitch.sort((a, b) => a.d - b.d).slice(0, 16).map((x) => x.i);

  // --- labels ------------------------------------------------------------------------------------
  const labels: FocusLabel[] = [];
  const color = s.color;
  for (const n of loopLike ? nets.filter((x) => !planeNets.has(x)) : nets) {
    let best: { len: number; at: Vec2; layer: number } | null = null;
    for (const tr of board.tracks) {
      if (tr.net !== n) continue;
      if (path.length && !path.some((e) => Math.hypot(e.a.x - tr.a.x, e.a.y - tr.a.y) + Math.hypot(e.b.x - tr.b.x, e.b.y - tr.b.y) < 0.2 || Math.hypot(e.a.x - tr.b.x, e.a.y - tr.b.y) + Math.hypot(e.b.x - tr.a.x, e.b.y - tr.a.y) < 0.2)) continue;
      const l = Math.hypot(tr.b.x - tr.a.x, tr.b.y - tr.a.y);
      if (!best || l > best.len) best = { len: l, at: { x: (tr.a.x + tr.b.x) / 2, y: (tr.a.y + tr.b.y) / 2 }, layer: tr.layer };
    }
    if (best) labels.push({ at: best.at, layer: best.layer, text: board.nets[n]!, sub: nets.length === 1 || n === nets[0] ? sourceFacts(s) : undefined, kind: 'net', color });
  }
  for (const p of planes) {
    // a point of the plane next to the finding, on copper
    const pl = app.planes.find((q) => q.layer === p.layer);
    let at = d.at;
    if (pl) {
      search: for (let r = 2; r <= 12; r += 2)
        for (let k = 0; k < 8; k++) {
          const q = { x: d.at.x + r * Math.cos((k * Math.PI) / 4 + 0.4), y: d.at.y + r * Math.sin((k * Math.PI) / 4 + 0.4) };
          if (inRegion(q) && covered(pl.raster, q.x, q.y)) {
            at = q;
            break search;
          }
        }
    }
    labels.push({ at, layer: p.layer, text: `${board.nets[p.net]} · ${board.layers[p.layer]!.name}`, sub: p.role, kind: 'plane' });
  }
  for (const i of parts) {
    const f = board.footprints[i]!;
    labels.push({
      at: f.body.center,
      layer: 'parts',
      text: f.value && f.value !== f.ref ? `${f.ref} · ${f.value}` : f.ref,
      sub: i === link ? t.focus.linkPart : undefined,
      kind: 'part',
    });
  }

  // --- what the calculation objects to -------------------------------------------------------------
  const dims: FocusSpec['dims'] = [];
  const areas: FocusSpec['areas'] = [];
  const circles: FocusSpec['circles'] = [];
  const paths: FocusSpec['paths'] = [];
  const trackLayer = [...layers][0] ?? 0;
  if (detour) {
    const a = detour.path[detour.path.length - 1]!;
    const b = detour.path[0]!;
    if (detour.kind === 'gap') {
      dims.push({ a, b, layer: trackLayer, text: t.focus.overGap(fmtNum(d.value, 1)) });
      paths.push({ pts: detour.path, layer: detour.layer, text: t.focus.detour(fmtNum(len(detour.path), 0)) });
    } else {
      const lp = link >= 0 ? board.footprints[link]!.body.center : null;
      if (lp) dims.push({ a: d.at, b: lp, layer: detour.layer, text: t.focus.toLink(fmtNum(Math.hypot(lp.x - d.at.x, lp.y - d.at.y), 0), linkRef ?? '') });
      paths.push({ pts: detour.path, layer: detour.layer, text: t.focus.detour(fmtNum(len(detour.path), 0)) });
    }
    if (detour.extraArea > 0.5) areas.push({ poly: detour.path, layer: detour.layer, text: t.focus.extraArea(fmtNum(detour.extraArea, 0)) });
  } else if (d.kind === 'return-gap') {
    labels.push({ at: d.at, layer: trackLayer, text: t.focus.noPlane(fmtNum(d.value, 1)), kind: 'note', color: 'var(--warn)' });
  }
  if (d.kind === 'no-stitching') {
    const pl = planes[0]?.layer ?? trackLayer;
    circles.push({ c: d.at, r: d.value, layer: pl, text: t.focus.noStitch(d.planeNet, fmtNum(d.value, 0)) });
  }
  if (d.kind === 'long-line') labels.push({ at: d.at, layer: trackLayer, text: t.focus.longLine(formatEng(d.value, 'Hz')), kind: 'note', color: 'var(--warn)' });

  // --- the best fix, at its place ----------------------------------------------------------------
  const suggestions: FocusSpec['suggestions'] = [];
  const topLayer = trackLayer;
  if (d.kind === 'ref-change') suggestions.push({ at: { x: d.at.x + 1.5, y: d.at.y }, layer: 0, kind: 'cap', text: t.focus.suggest.capPlanes(d.planeNet, d.otherNet ?? '?') });
  else if (d.kind === 'no-stitching') suggestions.push({ at: { x: d.at.x + 1.0, y: d.at.y }, layer: 0, kind: 'via', text: t.focus.suggest.stitchVia(d.planeNet || 'GND') });
  else if (d.kind === 'return-gap' && detour) {
    const a = detour.path[detour.path.length - 1]!;
    const b = detour.path[0]!;
    suggestions.push({ at: { x: (a.x + b.x) / 2 + 1, y: (a.y + b.y) / 2 + 1 }, layer: topLayer, kind: 'cap', text: t.focus.suggest.bridgeCap });
  } else if (d.kind === 'return-gap' && path.length) {
    const xs = path.flatMap((e) => [e.a.x, e.b.x]);
    const ys = path.flatMap((e) => [e.a.y, e.b.y]);
    const b = { x0: Math.min(...xs) - 1.5, y0: Math.min(...ys) - 1.5, x1: Math.max(...xs) + 1.5, y1: Math.max(...ys) + 1.5 };
    const plane = planes[0];
    suggestions.push({
      at: { x: b.x1, y: b.y0 },
      layer: plane?.layer ?? 1,
      kind: 'area',
      poly: [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }],
      text: t.focus.suggest.closePlane(board.nets[plane?.net ?? 0] || 'GND', board.layers[plane?.layer ?? 1]?.name ?? ''),
    });
  } else if (d.kind === 'long-line' && model?.info.driver) {
    const pi = findPad(board, model.info.driver);
    if (pi >= 0) suggestions.push({ at: { x: board.pads[pi]!.at.x + 1.2, y: board.pads[pi]!.at.y }, layer: 0, kind: 'res', text: t.focus.suggest.seriesR(model.info.driver) });
  }

  // --- common mode: what drives the cables, and the cables themselves --------------------------------
  const others: NonNullable<FocusSpec['others']> = [];
  const cables: NonNullable<FocusSpec['cables']> = [];
  const extra: Vec2[] = [];
  const planeLayer = planes[0]?.layer ?? trackLayer;
  if (d.kind === 'cable-cm' && d.cm) {
    const c = d.cm;
    dims.push({ a: c.ends[0], b: c.ends[1], layer: trackLayer, text: t.focus.cmLength(fmtNum(c.length, 0)) });
    dims.push({ a: c.across[0], b: c.across[1], layer: planeLayer, text: t.focus.cmWidth(fmtNum(c.width, 0)) });
    const w = c.worst ? c.lines.find((l) => l.f === c.worst!.f) : undefined;
    if (w) labels.push({ at: c.at, layer: planeLayer, text: t.focus.cmVoltage(formatEng(w.v, 'V', 2), formatEng(w.f, 'Hz', 3)), kind: 'note', color: 'var(--warn)' });
    for (const [side, refs] of [['A', c.sideA], ['B', c.sideB]] as const)
      for (const ref of refs) {
        const cab = cableAt(board, ref, t.focus.cable(side, ref));
        if (cab) cables.push(cab);
        const fi = board.footprints.findIndex((f) => f.ref === ref);
        if (fi >= 0) parts.add(fi);
      }
    extra.push(...c.ends, ...c.across, ...cables.map((x) => x.at));
    suggestions.push({ at: { x: c.at.x + 2, y: c.at.y + 2 }, layer: 0, kind: 'area', text: t.focus.suggest.oneEdge });
  }
  if (d.kind === 'io-coupling' && d.io) {
    const e = d.io;
    const ioNet = board.nets.indexOf(e.ioNet);
    const pieces = board.tracks.filter((tr) => tr.net === ioNet).map((tr) => ({ a: tr.a, b: tr.b, layer: tr.layer, width: tr.width }));
    others.push({ pieces, color: VICTIM });
    labels.push({ at: e.at, layer: trackLayer, text: t.focus.ioNet(e.ioNet, fmtNum(e.length, 0), fmtNum(e.spacing, 1)), kind: 'net', color: VICTIM });
    const cab = cableAt(board, e.connector, t.focus.cable('', e.connector));
    if (cab) cables.push(cab);
    const fi = board.footprints.findIndex((f) => f.ref === e.connector);
    if (fi >= 0) parts.add(fi);
    extra.push(e.at, ...pieces.flatMap((x) => [x.a, x.b]), ...cables.map((x) => x.at));
    suggestions.push({ at: { x: e.at.x + 2, y: e.at.y + 2 }, layer: trackLayer, kind: 'area', text: t.focus.suggest.spaceIo });
  }
  // the cables' labels at their far ends
  for (const cab of cables) {
    const end = { x: cab.at.x + cab.dir.x * 22, y: cab.at.y + cab.dir.y * 22 };
    labels.push({ at: end, layer: 0, text: cab.text, kind: 'note', color: '#f2a33a' });
    extra.push(end);
  }
  if (extra.length) {
    region.x0 = Math.min(region.x0, ...extra.map((p) => p.x - 4));
    region.y0 = Math.min(region.y0, ...extra.map((p) => p.y - 4));
    region.x1 = Math.max(region.x1, ...extra.map((p) => p.x + 4));
    region.y1 = Math.max(region.y1, ...extra.map((p) => p.y + 4));
  }

  // --- where this finding adds field --------------------------------------------------------------
  const field = computeFieldMap(s.id, detour, d.kind === 'return-gap' && !detour, region, frame);

  return { key: diagKey(d), diag: d, source: s, color, nets, path, planes, parts: [...parts], vias, stitchVias, detour, region, labels, dims, areas, circles, paths, suggestions, field, others, cables };
}
