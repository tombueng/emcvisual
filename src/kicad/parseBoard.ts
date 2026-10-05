import { atoms, child, children, isList, num, parseSExpr, str, type SList } from './sexpr';
import {
  arcByCenter,
  arcPoints,
  bboxValid,
  bezierPoints,
  chainRings,
  padOutline,
  DEG,
  emptyBBox,
  growBBox,
  rotateKicad,
  signedArea,
} from '../model/geometry';
import { buildStackup, sortCopperNames, type StackupEntry } from '../model/stackup';
import { pourFill, type Obstacle } from '../import/pour';
import type { FootprintModel,
  BoardModel,
  Footprint,
  LayerKind,
  OrientedBox,
  Pad,
  PadKind,
  PadShape,
  Track,
  Vec2,
  Via,
  Zone,
} from '../model/types';

export class BoardParseError extends Error {}

/** Parse a .kicad_pcb file (KiCad 6 to 10). */
export function parseBoard(text: string, fileName = 'board.kicad_pcb'): BoardModel {
  const root = parseSExpr(text);
  if (root[0] !== 'kicad_pcb') throw new BoardParseError('not a KiCad board (expected "(kicad_pcb")');
  const warnings: string[] = [];

  // --- layers ---------------------------------------------------------------------------------
  const kinds = new Map<string, LayerKind>();
  const layerAliases = new Map<string, string>();
  const layersNode = child(root, 'layers');
  const copperDeclared: string[] = [];
  if (layersNode) {
    for (const l of layersNode.slice(1)) {
      if (!isList(l)) continue;
      const name = str(l, 1);
      const type = str(l, 2);
      const user = str(l, 3);
      if (user) layerAliases.set(user, name);
      if (name.endsWith('.Cu')) {
        copperDeclared.push(name);
        kinds.set(name, (['signal', 'power', 'mixed', 'jumper'].includes(type) ? type : 'signal') as LayerKind);
      }
    }
  }
  const copperNames = sortCopperNames(copperDeclared.length ? copperDeclared : ['F.Cu', 'B.Cu']);
  const layerIndex = new Map(copperNames.map((n, i) => [n, i]));

  const generalThickness = num(child(child(root, 'general') ?? ['general'], 'thickness'), 1, 1.6);
  const stackupNode = child(child(root, 'setup') ?? ['setup'], 'stackup');
  const entries: StackupEntry[] | null = stackupNode
    ? children(stackupNode, 'layer').map((l) => {
        // thickness may appear several times (sub-layers) and may carry a "locked" flag
        const t = children(l, 'thickness').reduce((s, th) => s + num(th, 1, 0), 0);
        const eps = children(l, 'epsilon_r').map((e) => num(e, 1));
        const tan = children(l, 'loss_tangent').map((e) => num(e, 1));
        return {
          name: str(l, 1),
          type: str(child(l, 'type')),
          thickness: t,
          epsilonR: eps.length ? eps.reduce((a, b) => a + b, 0) / eps.length : undefined,
          lossTangent: tan.length ? tan.reduce((a, b) => a + b, 0) / tan.length : undefined,
          material: str(child(l, 'material')) || undefined,
        };
      })
    : null;
  const stack = buildStackup(copperNames, kinds, entries, generalThickness);
  if (!stack.fromFile) warnings.push('stackup-default');

  // --- nets -----------------------------------------------------------------------------------
  const nets: string[] = [''];
  const netIndex = new Map<string, number>([['', 0]]);
  const numbered = new Map<string, string>();
  for (const n of children(root, 'net')) {
    if (n.length >= 3) numbered.set(str(n, 1), str(n, 2));
  }
  const useNumbers = numbered.size > 0;
  const internNet = (raw: string): number => {
    const name = unescapeKicad(raw);
    let i = netIndex.get(name);
    if (i === undefined) {
      i = nets.length;
      nets.push(name);
      netIndex.set(name, i);
    }
    return i;
  };
  for (const name of numbered.values()) if (name) internNet(name);

  const netOf = (node: SList): number => {
    const n = child(node, 'net');
    if (!n) {
      const nn = child(node, 'net_name');
      return nn ? internNet(str(nn, 1)) : 0;
    }
    if (n.length >= 3) return internNet(str(n, 2));
    const arg = str(n, 1);
    if (useNumbers) {
      const name = numbered.get(arg);
      if (name === undefined) {
        warnings.push(`unknown-net:${arg}`);
        return 0;
      }
      return internNet(name);
    }
    return internNet(arg);
  };

  const copperLayerOf = (name: string): number | undefined => layerIndex.get(layerAliases.get(name) ?? name);
  const layersOfList = (names: string[]): number[] => {
    const out = new Set<number>();
    for (const raw of names) {
      if (raw === '*.Cu') copperNames.forEach((_, i) => out.add(i));
      else if (raw === 'F&B.Cu') {
        out.add(0);
        out.add(copperNames.length - 1);
      } else {
        const i = copperLayerOf(raw);
        if (i !== undefined) out.add(i);
      }
    }
    return [...out].sort((a, b) => a - b);
  };

  const xy = (node: SList | undefined): Vec2 => ({ x: num(node, 1, 0), y: num(node, 2, 0) });

  // --- outline --------------------------------------------------------------------------------
  const edgePolylines: Vec2[][] = [];
  const addEdge = (g: SList, transform?: (p: Vec2) => Vec2) => {
    const head = g[0].replace(/^(gr|fp)_/, '');
    const T = transform ?? ((p: Vec2) => p);
    const poly = graphicPolyline(head, g);
    if (poly) edgePolylines.push(poly.map(T));
  };

  // --- footprints and pads --------------------------------------------------------------------
  const footprints: Footprint[] = [];
  const pads: Pad[] = [];
  for (const fpNode of [...children(root, 'footprint'), ...children(root, 'module')]) {
    const at = child(fpNode, 'at');
    const fpAt = xy(at);
    const fpAngle = num(at, 3, 0);
    const side = str(child(fpNode, 'layer')) === 'B.Cu' ? 'bottom' : 'top';
    const toBoard = (p: Vec2): Vec2 => {
      const r = rotateKicad(p, fpAngle);
      return { x: fpAt.x + r.x, y: fpAt.y + r.y };
    };
    let ref = '';
    let value = '';
    // the symbol fields KiCad copies onto the footprint (Datasheet, MPN, Manufacturer, …)
    const fields: Record<string, string> = {};
    for (const p of children(fpNode, 'property')) {
      const key = str(p, 1);
      if (key === 'Reference') ref = str(p, 2);
      else if (key === 'Value') value = str(p, 2);
      else if (key && !/^(Footprint|Sheetfile|Sheetname|ki_.*|KiLib_.*)$/.test(key) && str(p, 2) && str(p, 2) !== '~') fields[key] = str(p, 2);
    }
    for (const t of children(fpNode, 'fp_text')) {
      if (str(t, 1) === 'reference' && !ref) ref = str(t, 2);
      if (str(t, 1) === 'value' && !value) value = str(t, 2);
    }
    const fpIndex = footprints.length;
    const fpPads: number[] = [];
    const localPadBox = emptyBBox();
    for (const p of children(fpNode, 'pad')) {
      const pat = child(p, 'at');
      const local = xy(pat);
      const size = { x: num(child(p, 'size'), 1, 0), y: num(child(p, 'size'), 2, 0) };
      const drillNode = child(p, 'drill');
      let drill = 0;
      if (drillNode) {
        const d = atoms(drillNode).filter((a) => a !== 'oval').map(Number);
        drill = d.length ? Math.min(...d.filter(Number.isFinite)) : 0;
      }
      const kind = (str(p, 2) || 'smd') as PadKind;
      const shapeName = (str(p, 3) || 'rect') as PadShape;
      // custom pads: the anchor is often tiny, the copper is in the primitives; take their extent
      let at0 = local;
      const prims = child(p, 'primitives');
      if (shapeName === 'custom' && prims) {
        const ext = emptyBBox();
        growBBox(ext, { x: 0, y: 0 }, Math.max(size.x, size.y) / 2);
        for (const g of prims.slice(1)) {
          if (!isList(g)) continue;
          const w = num(child(g, 'width'), 1, 0) / 2;
          const poly = graphicPolyline(g[0].replace(/^gr_/, ''), g);
          if (poly) for (const q of poly) growBBox(ext, q, w);
        }
        if (bboxValid(ext)) {
          size.x = ext.x1 - ext.x0;
          size.y = ext.y1 - ext.y0;
          // primitives are in the pad's own frame (rotated with the pad): move the centre with it
          const c = rotateKicad({ x: (ext.x0 + ext.x1) / 2, y: (ext.y0 + ext.y1) / 2 }, num(pat, 3, 0) - fpAngle);
          at0 = { x: local.x + c.x, y: local.y + c.y };
        }
      }
      growBBox(localPadBox, at0, Math.max(size.x, size.y) / 2);
      const pad: Pad = {
        footprint: fpIndex,
        ref,
        number: str(p, 1),
        net: netOf(p),
        at: toBoard(at0),
        angle: num(pat, 3, 0),
        shape: shapeName,
        kind,
        size,
        layers: layersOfList(atoms(child(p, 'layers') ?? ['layers'])),
        drill: Number.isFinite(drill) ? drill : 0,
        pinFunction: str(child(p, 'pinfunction')),
        pinType: str(child(p, 'pintype')),
      };
      fpPads.push(pads.length);
      pads.push(pad);
    }

    const crt = emptyBBox();
    for (let k = 1; k < fpNode.length; k++) {
      const g = fpNode[k];
      if (!isList(g) || !g[0].startsWith('fp_')) continue;
      const layer = str(child(g, 'layer'));
      if (layer === 'Edge.Cuts') addEdge(g, toBoard);
      if (layer === 'F.CrtYd' || layer === 'B.CrtYd') {
        const poly = graphicPolyline(g[0].slice(3), g);
        if (poly) for (const q of poly) growBBox(crt, q);
      }
    }
    const box = bboxValid(crt) ? crt : bboxValid(localPadBox) ? inflate(localPadBox, 0.25) : null;
    const body: OrientedBox = box
      ? {
          center: toBoard({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }),
          size: { x: box.x1 - box.x0, y: box.y1 - box.y0 },
          angle: fpAngle,
        }
      : { center: fpAt, size: { x: 1, y: 1 }, angle: fpAngle };

    // 3D model references: (model "path" (offset (xyz …)) (scale (xyz …)) (rotate (xyz …)) [hide])
    const models: FootprintModel[] = [];
    for (const m of children(fpNode, 'model')) {
      const xyz = (name: string, def: number): [number, number, number] => {
        const outer = child(m, name);
        const n = outer ? child(outer, 'xyz') : undefined;
        return n ? [num(n, 1, def), num(n, 2, def), num(n, 3, def)] : [def, def, def];
      };
      // KiCad 5 wrote the offset as (at (xyz …)) in inches
      const at = child(m, 'at');
      const offset = at ? (xyz('at', 0).map((v) => v * 25.4) as [number, number, number]) : xyz('offset', 0);
      const hideNode = child(m, 'hide');
      const hidden = m.some((x) => x === 'hide') || (!!hideNode && str(hideNode, 1) !== 'no');
      const path = str(m, 1);
      if (path) models.push({ path, offset, scale: xyz('scale', 1), rotate: xyz('rotate', 0), hidden });
    }
    footprints.push({
      ref,
      value,
      models,
      lib: str(fpNode, 1),
      at: fpAt,
      angle: fpAngle,
      side,
      body,
      height: estimateHeight(ref, str(fpNode, 1)),
      pads: fpPads,
      fields,
    });
  }

  // --- tracks and vias ------------------------------------------------------------------------
  const tracks: Track[] = [];
  for (const s of children(root, 'segment')) {
    const layer = copperLayerOf(str(child(s, 'layer')));
    if (layer === undefined) continue;
    tracks.push({ net: netOf(s), layer, a: xy(child(s, 'start')), b: xy(child(s, 'end')), width: num(child(s, 'width'), 1, 0.2), fromArc: false });
  }
  for (const s of children(root, 'arc')) {
    const layer = copperLayerOf(str(child(s, 'layer')));
    if (layer === undefined) continue;
    const pts = arcPoints(xy(child(s, 'start')), xy(child(s, 'mid')), xy(child(s, 'end')), 0.005, 5);
    const net = netOf(s);
    const width = num(child(s, 'width'), 1, 0.2);
    for (let k = 1; k < pts.length; k++) tracks.push({ net, layer, a: pts[k - 1]!, b: pts[k]!, width, fromArc: true });
  }

  const vias: Via[] = [];
  for (const v of children(root, 'via')) {
    const ls = layersOfList(atoms(child(v, 'layers') ?? ['layers', 'F.Cu', 'B.Cu']));
    const drill = num(child(v, 'drill'), 1, 0.3);
    let size = num(child(v, 'size'), 1, NaN);
    if (!Number.isFinite(size)) {
      const ps = child(v, 'padstack');
      const firstSize = ps ? children(ps, 'layer').map((l) => num(child(l, 'size'), 1)).find(Number.isFinite) : undefined;
      size = firstSize ?? drill + 0.3;
    }
    vias.push({
      net: netOf(v),
      at: xy(child(v, 'at')),
      diameter: size,
      drill,
      fromLayer: ls[0] ?? 0,
      toLayer: ls[ls.length - 1] ?? copperNames.length - 1,
    });
  }

  // --- zones ----------------------------------------------------------------------------------
  const zones: Zone[] = [];
  // zones saved without their fill, and keep-out areas that forbid copper pours
  const unfilled: { net: number; layers: number[]; outline: Vec2[]; clearance: number; priority: number; keepIslands: boolean }[] = [];
  const keepouts: { layers: number[]; outline: Vec2[] }[] = [];
  const zoneLayers = (z: SList): number[] => {
    const one = str(child(z, 'layer'));
    return one ? layersOfList([one]) : layersOfList(atoms(child(z, 'layers') ?? ['layers']));
  };
  for (const z of children(root, 'zone')) {
    const ko = child(z, 'keepout');
    if (ko) {
      if (str(child(ko, 'copperpour')) === 'not_allowed') keepouts.push({ layers: zoneLayers(z), outline: ptsList(child(child(z, 'polygon') ?? ['polygon'], 'pts')) });
      continue;
    }
    const net = netOf(z);
    if (!children(z, 'filled_polygon').length) {
      const outline = ptsList(child(child(z, 'polygon') ?? ['polygon'], 'pts'));
      const fill = child(z, 'fill');
      if (outline.length > 2)
        unfilled.push({
          net,
          layers: zoneLayers(z),
          outline,
          clearance: num(child(child(z, 'connect_pads') ?? ['connect_pads'], 'clearance'), 1, 0.25),
          priority: num(child(z, 'priority'), 1, 0),
          keepIslands: num(child(fill ?? ['fill'], 'island_removal_mode'), 1, 0) === 1,
        });
      continue;
    }
    const byLayer = new Map<number, Vec2[][]>();
    for (const fpoly of children(z, 'filled_polygon')) {
      const layer = copperLayerOf(str(child(fpoly, 'layer')) || str(child(z, 'layer')));
      if (layer === undefined) continue;
      const ring = ptsList(child(fpoly, 'pts'));
      if (ring.length < 3) continue;
      const list = byLayer.get(layer) ?? [];
      list.push(ring);
      byLayer.set(layer, list);
    }
    for (const [layer, polygons] of byLayer) {
      const area = polygons.reduce((s, r) => s + Math.abs(signedArea(r)), 0);
      zones.push({ net, layer, polygons, area });
    }
  }

  // --- board-level graphics on Edge.Cuts ------------------------------------------------------
  for (let k = 1; k < root.length; k++) {
    const g = root[k];
    if (!isList(g) || !g[0].startsWith('gr_')) continue;
    if (str(child(g, 'layer')) === 'Edge.Cuts') addEdge(g);
  }
  const { rings, open } = chainRings(edgePolylines, 0.01);
  if (open.length) warnings.push(`outline-open:${open.length}`);
  rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));

  let outline = rings;
  if (outline.length === 0) {
    warnings.push('outline-missing');
    const b = emptyBBox();
    for (const t of tracks) {
      growBBox(b, t.a, t.width);
      growBBox(b, t.b, t.width);
    }
    for (const p of pads) growBBox(b, p.at, Math.max(p.size.x, p.size.y));
    for (const z of zones) for (const r of z.polygons) for (const p of r) growBBox(b, p);
    if (!bboxValid(b)) throw new BoardParseError('board has neither an outline nor copper');
    const m = 1;
    outline = [[{ x: b.x0 - m, y: b.y0 - m }, { x: b.x1 + m, y: b.y0 - m }, { x: b.x1 + m, y: b.y1 + m }, { x: b.x0 - m, y: b.y1 + m }]];
  }
  const bbox = emptyBBox();
  for (const p of outline[0]!) growBBox(bbox, p);

  // zones without a saved fill (the file was saved before filling, or fills were left out):
  // fill them here the way KiCad would, approximately, so the planes are there
  if (unfilled.length) {
    warnings.push('kicad-zones-filled');
    fillZones(unfilled, keepouts, zones, tracks, pads, vias, outline);
  }

  return {
    source: { fileName, kicadVersion: num(child(root, 'version'), 1, 0), generator: str(child(root, 'generator')) },
    thickness: stack.thickness,
    layers: stack.layers,
    dielectrics: stack.dielectrics,
    stackupFromFile: stack.fromFile,
    outline,
    bbox,
    nets,
    tracks,
    vias,
    footprints,
    pads,
    zones,
    warnings,
  };
}

/** KiCad escapes some characters in net names ("{slash}" for "/" and friends). */
const KICAD_ESCAPES: Record<string, string> = {
  slash: '/', backslash: '\\', lt: '<', gt: '>', colon: ':', dblquote: '"', quote: "'", bar: '|', tab: '\t', return: '\n', space: ' ', comma: ',', brace: '{',
};

export function unescapeKicad(s: string): string {
  return s.includes('{') ? s.replace(/\{(\w+)\}/g, (m, k: string) => KICAD_ESCAPES[k] ?? m) : s;
}

function inflate(b: { x0: number; y0: number; x1: number; y1: number }, m: number) {
  return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m };
}

function ptsList(pts: SList | undefined): Vec2[] {
  if (!pts) return [];
  const out: Vec2[] = [];
  for (let k = 1; k < pts.length; k++) {
    const e = pts[k];
    if (!isList(e)) continue;
    if (e[0] === 'xy') out.push({ x: num(e, 1, 0), y: num(e, 2, 0) });
    else if (e[0] === 'arc') {
      const p = (h: string) => ({ x: num(child(e, h), 1, 0), y: num(child(e, h), 2, 0) });
      const seg = arcPoints(p('start'), p('mid'), p('end'));
      if (out.length) seg.shift();
      out.push(...seg);
    }
  }
  return out;
}

/** Polyline for a graphic item (line, arc, circle, rect, poly, curve), or null. */
function graphicPolyline(kind: string, g: SList): Vec2[] | null {
  const p = (h: string): Vec2 => ({ x: num(child(g, h), 1, 0), y: num(child(g, h), 2, 0) });
  switch (kind) {
    case 'line':
      return [p('start'), p('end')];
    case 'arc': {
      if (child(g, 'mid')) return arcPoints(p('start'), p('mid'), p('end'));
      // KiCad 5 style: start = centre, end = start point, angle in degrees
      const c = p('start');
      const s = p('end');
      const sweep = -num(child(g, 'angle'), 1, 90) * DEG;
      return arcByCenter(c, Math.hypot(s.x - c.x, s.y - c.y), Math.atan2(s.y - c.y, s.x - c.x), sweep);
    }
    case 'circle': {
      const c = p('center');
      const e = p('end');
      const r = Math.hypot(e.x - c.x, e.y - c.y);
      const pts = arcByCenter(c, r, 0, Math.PI * 2);
      return pts;
    }
    case 'rect': {
      const a = p('start');
      const b = p('end');
      return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
    }
    case 'poly': {
      const pts = ptsList(child(g, 'pts'));
      return pts.length ? [...pts, pts[0]!] : null;
    }
    case 'curve': {
      const pts = ptsList(child(g, 'pts'));
      return pts.length === 4 ? bezierPoints(pts[0]!, pts[1]!, pts[2]!, pts[3]!) : null;
    }
    default:
      return null;
  }
}

/** Rough component body height from the reference designator; there are no 3D models here. */
function estimateHeight(ref: string, lib: string): number {
  const l = lib.toLowerCase();
  if (l.includes('pinheader') || l.includes('pin_header')) return 8.5;
  if (l.includes('usb')) return 3;
  const prefix = /^[A-Za-z]+/.exec(ref)?.[0]?.toUpperCase() ?? '';
  const table: Record<string, number> = {
    U: 1.4, IC: 1.4, C: 0.9, R: 0.5, L: 1.8, FB: 0.8, Y: 1.0, X: 1.0, J: 3.0, P: 3.0, CN: 3.0,
    D: 0.9, LED: 0.9, Q: 1.1, SW: 2.0, BT: 3.0, F: 1.0, TP: 0.3, MH: 0, H: 0,
  };
  return table[prefix] ?? 1.0;
}

/** Copper to board edge, mm (KiCad's default constraint). */
const EDGE_CLEARANCE = 0.5;

/** Fills zones that were saved unfilled (see parseBoard), highest priority first. */
function fillZones(
  unfilled: { net: number; layers: number[]; outline: Vec2[]; clearance: number; priority: number; keepIslands: boolean }[],
  keepouts: { layers: number[]; outline: Vec2[] }[],
  zones: Zone[],
  tracks: Track[],
  pads: Pad[],
  vias: Via[],
  outline: Vec2[][],
) {
  for (const z of [...unfilled].sort((a, b) => b.priority - a.priority)) {
    for (const layer of z.layers) {
      const c = z.clearance;
      const obstacles: Obstacle[] = [];
      for (const t of tracks) if (t.layer === layer && t.net !== z.net) obstacles.push({ kind: 'seg', a: t.a, b: t.b, r: t.width / 2 + c });
      for (const p of pads)
        if (p.layers.includes(layer) && (p.net !== z.net || p.net === 0)) {
          if (p.shape === 'circle') obstacles.push({ kind: 'circle', c: p.at, r: p.size.x / 2 + c });
          else obstacles.push({ kind: 'poly', ring: padOutline(p), r: c });
        }
      for (const v of vias) if (v.fromLayer <= layer && v.toLayer >= layer && v.net !== z.net) obstacles.push({ kind: 'circle', c: v.at, r: v.diameter / 2 + c });
      for (const k of keepouts) if (k.layers.includes(layer) && k.outline.length > 2) obstacles.push({ kind: 'poly', ring: k.outline, r: 0 });
      for (const other of zones) if (other.layer === layer && other.net !== z.net) for (const ring of other.polygons) obstacles.push({ kind: 'poly', ring, r: c });
      const anchors = z.keepIslands
        ? undefined
        : [
            ...pads.filter((p) => p.net === z.net && p.layers.includes(layer)).map((p) => p.at),
            ...vias.filter((v) => v.net === z.net && v.fromLayer <= layer && v.toLayer >= layer).map((v) => v.at),
            ...tracks.filter((t) => t.net === z.net && t.layer === layer).flatMap((t) => [t.a, t.b]),
          ];
      const rings = pourFill({ outline: z.outline, obstacles, edges: { rings: outline, clearance: Math.max(EDGE_CLEARANCE, c) }, anchors, keepIfNoneConnected: true });
      if (!rings.length) continue;
      const area = rings.reduce((s, r) => s + Math.abs(signedArea(r)), 0);
      const existing = zones.find((x) => x.net === z.net && x.layer === layer);
      if (existing) {
        existing.polygons.push(...rings);
        existing.area += area;
      } else zones.push({ net: z.net, layer, polygons: rings, area });
    }
  }
}
