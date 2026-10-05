/**
 * IPC-2581 (revisions B and C) to BoardModel.
 *
 * IPC-2581 is the vendor-neutral exchange format of Altium Designer, Cadence Allegro/OrCAD,
 * Siemens PADS/Xpedition, Zuken and KiCad. What is read:
 *
 * - layers (CadData/Layer with a conductor function) in the order of the stack-up, with the
 *   dielectrics' thickness, εr and loss tangent from Stackup and Spec;
 * - the board outline (Step/Profile) and cut-outs;
 * - components (Component, Package) with their pads; pad copper and nets from the layer
 *   features (LayerFeature/Set/Pad with PinRef), nets also from LogicalNet;
 * - tracks (Line, Polyline, Arc), filled copper (Contour with Cutout) per net and layer;
 * - vias from the drill layers (Hole with plating "VIA"), their span from the drill layer;
 * - part values from the BOM.
 *
 * Coordinates are y-up in the file and become y-down; angles stay counter-clockwise.
 */
import { chainRings, rotateKicad, signedArea } from '../model/geometry';
import type { StackupEntry } from '../model/stackup';
import type { Footprint, Pad, PadShape, Vec2 } from '../model/types';
import { arcYUp, BoardBuilder, guessHeight, ImportError } from './builder';
import { parseXml, xchild, xchildren, xfind, xnum, type XNode } from './xml';
import { islandNets, pourFill, type Obstacle } from './pour';

const UNIT: Record<string, number> = { MILLIMETER: 1, MM: 1, INCH: 25.4, MICRON: 0.001, MILS: 0.0254, MIL: 0.0254 };
const unitOf = (n: XNode | undefined, def = 1) => UNIT[(n?.attrs.units ?? '').toUpperCase()] ?? def;

/** A pad shape in its own frame (mm). */
interface Prim {
  shape: PadShape;
  w: number;
  h: number;
  /** Outline for contour primitives (local, y-up, mm). */
  poly?: Vec2[];
}

export function isIpc2581(text: string): boolean {
  return /<IPC-2581[\s>]/.test(text.slice(0, 4000));
}

export function parseIpc2581(text: string, fileName = 'board.xml'): import('../model/types').BoardModel {
  const root = parseXml(text);
  if (root.name !== 'IPC-2581') throw new ImportError('not an IPC-2581 file');
  const content = xchild(root, 'Content');
  const ecad = xchild(root, 'Ecad');
  const cadData = xchild(ecad, 'CadData');
  if (!cadData) throw new ImportError('IPC-2581 file without CAD data (Ecad/CadData)');
  const u = unitOf(xchild(ecad, 'CadHeader'));

  // --- dictionaries ---------------------------------------------------------------------------
  const lineWidths = new Map<string, number>();
  const ldict = xchild(content, 'DictionaryLineDesc');
  for (const e of xchildren(ldict, 'EntryLineDesc')) lineWidths.set(e.attrs.id ?? '', xnum(xchild(e, 'LineDesc'), 'lineWidth') * unitOf(ldict, u));
  const prims = new Map<string, Prim>();
  const sdict = xchild(content, 'DictionaryStandard');
  for (const e of xchildren(sdict, 'EntryStandard')) {
    const p = standardPrim(e.children[0], unitOf(sdict, u));
    if (p) prims.set(e.attrs.id ?? '', p);
  }
  const udict = xchild(content, 'DictionaryUser');
  for (const e of xchildren(udict, 'EntryUser')) {
    const p = userPrim(e, unitOf(udict, u));
    if (p) prims.set(e.attrs.id ?? '', p);
  }
  const primOf = (n: XNode): Prim | undefined => {
    const ref = xchild(n, 'StandardPrimitiveRef') ?? xchild(n, 'UserPrimitiveRef');
    if (ref) return prims.get(ref.attrs.id ?? '');
    const direct = n.children.find((c) => STANDARD.has(c.name));
    return direct ? standardPrim(direct, u) : undefined;
  };
  const widthOf = (n: XNode): number => {
    const d = xchild(n, 'LineDesc');
    if (d) return xnum(d, 'lineWidth') * u;
    const r = xchild(n, 'LineDescRef');
    return r ? (lineWidths.get(r.attrs.id ?? '') ?? 0.2) : 0.2;
  };

  // --- layers and stack-up --------------------------------------------------------------------
  const layerDefs = xchildren(cadData, 'Layer');
  const isCopper = (l: XNode) => /^(CONDUCTOR|CONDFILM|CONDFOIL|SIGNAL|PLANE|MIXED|POWER_GROUND|POWER|GROUND)$/i.test(l.attrs.layerFunction ?? '');
  const isDielectric = (l: XNode) => /^DIEL/i.test(l.attrs.layerFunction ?? '');
  const stackup = xchild(cadData, 'Stackup');
  const stackLayers = xfind(stackup, 'StackupLayer').sort((a, b) => xnum(a, 'sequence') - xnum(b, 'sequence'));
  const byName = new Map(layerDefs.map((l) => [l.attrs.name ?? '', l]));
  let order = stackLayers.map((s) => s.attrs.layerOrGroupRef ?? '').filter((n) => byName.has(n));
  if (!order.some((n) => isCopper(byName.get(n)!))) {
    // no stack-up: the declaration order, top side first and bottom side last
    const cu = layerDefs.filter(isCopper);
    const rank = (l: XNode) => (/TOP/i.test(l.attrs.side ?? '') ? 0 : /BOTTOM/i.test(l.attrs.side ?? '') ? 2 : 1);
    order = [...cu].sort((a, b) => rank(a) - rank(b)).map((l) => l.attrs.name ?? '');
  }
  const copperOrig = order.filter((n) => isCopper(byName.get(n)!));
  if (!copperOrig.length) throw new ImportError('IPC-2581 file without conductor layers');
  const b = new BoardBuilder(copperOrig);
  const layerIdx = new Map(copperOrig.map((n, i) => [n, i]));
  for (const [n, i] of layerIdx) b.kinds.set(b.copper[i]!, /PLANE|POWER|GROUND/i.test(byName.get(n)!.attrs.layerFunction ?? '') ? 'power' : 'signal');

  const specs = new Map<string, XNode>();
  for (const s of xfind(xchild(ecad, 'CadHeader'), 'Spec')) specs.set(s.attrs.name ?? '', s);
  const specValue = (sl: XNode, type: string): number | undefined => {
    for (const ref of xchildren(sl, 'SpecRef')) {
      const spec = specs.get(ref.attrs.id ?? '');
      const d = xchildren(spec, 'Dielectric').find((x) => x.attrs.type === type);
      const v = d ? Number(xchild(d, 'Property')?.attrs.value) : NaN;
      if (Number.isFinite(v)) return v;
    }
    return undefined;
  };
  let entries: StackupEntry[] | null = null;
  if (stackLayers.length) {
    entries = [];
    for (const sl of stackLayers) {
      const name = sl.attrs.layerOrGroupRef ?? '';
      const def = byName.get(name);
      if (!def) continue;
      const t = xnum(sl, 'thickness') * unitOf(stackup, u);
      if (isCopper(def)) entries.push({ name: b.copper[layerIdx.get(name)!]!, type: 'copper', thickness: t });
      else if (isDielectric(def))
        entries.push({
          name,
          type: /PREG/i.test(def.attrs.layerFunction ?? '') ? 'prepreg' : 'core',
          thickness: t,
          epsilonR: specValue(sl, 'DIELECTRIC_CONSTANT'),
          lossTangent: specValue(sl, 'LOSS_TANGENT'),
        });
    }
  }
  const total = xnum(stackup, 'overallThickness', 1.6) * (stackup ? unitOf(stackup, u) : 1);

  // --- step: outline, padstacks, packages, components --------------------------------------------
  const step = xchildren(cadData, 'Step').find((s) => /BOARD/i.test(s.attrs.type ?? 'BOARD')) ?? xchild(cadData, 'Step');
  if (!step) throw new ImportError('IPC-2581 file without a board step');
  const P = (n: XNode | undefined, kx = 'x', ky = 'y'): Vec2 => ({ x: xnum(n, kx) * u, y: -xnum(n, ky) * u });
  const profile = xchild(step, 'Profile');
  for (const poly of [...xchildren(profile, 'Polygon'), ...xchildren(profile, 'Cutout')]) {
    const ring = polygonPoints(poly, u);
    if (ring.length > 2) b.edges.push([...ring, ring[0]!]);
  }

  const padstacks = new Map<string, { hole: number; plating: string }>();
  for (const ps of xchildren(step, 'PadStackDef')) {
    const h = xchild(ps, 'PadstackHoleDef');
    padstacks.set(ps.attrs.name ?? '', { hole: xnum(h, 'diameter') * u, plating: h?.attrs.platingStatus ?? '' });
  }
  const packages = new Map<string, XNode>();
  for (const p of xchildren(step, 'Package')) packages.set(p.attrs.name ?? '', p);

  // part values from the BOM
  const values = new Map<string, string>();
  for (const item of xfind(xchild(root, 'Bom'), 'BomItem')) {
    const val = xfind(item, 'Textual').find((t) => /^value$/i.test(t.attrs.textualCharacteristicName ?? ''))?.attrs.textualCharacteristicValue;
    for (const r of xchildren(item, 'RefDes')) if (val) values.set(r.attrs.name ?? '', val);
  }
  const bottomCu = copperOrig[copperOrig.length - 1];
  const comps = new Map<string, { node: XNode; fp: Footprint; index: number }>();
  for (const c of xchildren(step, 'Component')) {
    const ref = c.attrs.refDes ?? '';
    if (!ref) continue;
    const xf = xchild(c, 'Xform');
    const angle = xnum(xf, 'rotation');
    const mirror = xf?.attrs.mirror === 'true';
    const side: 'top' | 'bottom' = c.attrs.layerRef === bottomCu || (mirror && copperOrig.length > 1 && c.attrs.layerRef !== copperOrig[0]) ? 'bottom' : 'top';
    const at = P(xchild(c, 'Location'));
    const pkg = packages.get(c.attrs.packageRef ?? '');
    const outline = pkg ? polygonPoints(xchild(xchild(pkg, 'Outline'), 'Polygon'), u) : [];
    const body = bodyBox(outline, at, angle, side === 'bottom');
    const fp: Footprint = {
      ref,
      value: values.get(ref) ?? c.attrs.part ?? '',
      lib: c.attrs.packageRef ?? '',
      at,
      angle,
      side,
      body,
      height: guessHeight(ref, c.attrs.packageRef ?? ''),
      pads: [],
      fields: {},
      models: [],
    };
    comps.set(ref, { node: c, fp, index: b.footprints.length });
    b.footprints.push(fp);
  }

  // nets of pins from LogicalNet (for pads in sets without a net)
  const pinNet = new Map<string, string>();
  for (const ln of xfind(ecad, 'LogicalNet')) for (const pr of xchildren(ln, 'PinRef')) pinNet.set(`${pr.attrs.componentRef}.${pr.attrs.pin}`, ln.attrs.name ?? '');

  // --- copper features per layer -----------------------------------------------------------------
  const padByKey = new Map<string, Pad>();
  // lettering and frames of the artwork lie on the copper layers outside the board: not copper
  const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const e of b.edges)
    for (const q of e) {
      ext.x0 = Math.min(ext.x0, q.x);
      ext.y0 = Math.min(ext.y0, q.y);
      ext.x1 = Math.max(ext.x1, q.x);
      ext.y1 = Math.max(ext.y1, q.y);
    }
  const inBoard = (q: Vec2) => !Number.isFinite(ext.x0) || (q.x >= ext.x0 - 1 && q.x <= ext.x1 + 1 && q.y >= ext.y0 - 1 && q.y <= ext.y1 + 1);
  const drillLayers = layerDefs.filter((l) => /^DRILL$/i.test(l.attrs.layerFunction ?? ''));
  // vias with their span, for the plane net of negative layers
  const viaSpans: { at: Vec2; net: string; from: number; to: number }[] = [];
  for (const dl of drillLayers) {
    const span = xchild(dl, 'Span');
    const from = layerIdx.get(span?.attrs.fromLayer ?? '') ?? 0;
    const to = layerIdx.get(span?.attrs.toLayer ?? '') ?? copperOrig.length - 1;
    const lf = xchildren(step, 'LayerFeature').find((x) => x.attrs.layerRef === dl.attrs.name);
    for (const set of xchildren(lf, 'Set')) for (const h of xfind(set, 'Hole')) viaSpans.push({ at: P(h), net: set.attrs.net ?? '', from: Math.min(from, to), to: Math.max(from, to) });
  }
  for (const lf of xchildren(step, 'LayerFeature')) {
    const layerName = lf.attrs.layerRef ?? '';
    const li = layerIdx.get(layerName);
    if (li === undefined) continue;
    if (/^NEGATIVE$/i.test(byName.get(layerName)?.attrs.polarity ?? '')) {
      negativePlane(b, lf, li, layerName, viaSpans, P, u, primOf, widthOf);
      continue;
    }
    for (const set of xchildren(lf, 'Set')) {
      const setNet = set.attrs.net;
      const via = /VIA/i.test(set.attrs.padUsage ?? '');
      for (const pad of xchildren(set, 'Pad')) {
        const pr = xchild(pad, 'PinRef');
        if (!pr) {
          if (via) continue; // via copper: the via comes from the drill layer
          const prim = primOf(pad);
          const loc = P(xchild(pad, 'Location'));
          if (prim && setNet) b.zone(b.net(setNet), li, primOutline(prim, loc, xnum(xchild(pad, 'Xform'), 'rotation')));
          continue;
        }
        const ref = pr.attrs.componentRef ?? '';
        const number = pr.attrs.pin ?? '';
        const loc = P(xchild(pad, 'Location'));
        const key = `${ref}|${number}|${loc.x.toFixed(3)},${loc.y.toFixed(3)}`;
        const existing = padByKey.get(key);
        if (existing) {
          if (!existing.layers.includes(li)) existing.layers.push(li);
          continue;
        }
        const prim = primOf(pad) ?? { shape: 'circle' as PadShape, w: 0.5, h: 0.5 };
        const comp = comps.get(ref);
        const p: Pad = {
          footprint: comp?.index ?? -1,
          ref,
          number,
          net: b.net(setNet ?? pinNet.get(`${ref}.${number}`)),
          at: loc,
          angle: xnum(xchild(pad, 'Xform'), 'rotation'),
          shape: prim.shape,
          kind: 'smd',
          size: { x: prim.w, y: prim.h },
          layers: [li],
          drill: 0,
          pinFunction: '',
          pinType: '',
        };
        padByKey.set(key, p);
        if (comp) comp.fp.pads.push(b.pads.length);
        b.pads.push(p);
      }
      for (const f of xchildren(set, 'Features')) {
        const loc = xchild(f, 'Location');
        const off = loc ? P(loc) : { x: 0, y: 0 };
        for (const shape of featureShapes(f)) addFeature(b, shape, setNet, li, off, u, widthOf, inBoard);
      }
    }
  }
  // through-hole pads span all layers between their copper; drill from the drill layers below
  for (const p of b.pads) p.layers.sort((x, y) => x - y);

  // --- holes: vias and plated pad holes ----------------------------------------------------------
  const padsAt = new Map<string, Pad[]>();
  for (const p of b.pads) {
    const k = `${p.at.x.toFixed(2)},${p.at.y.toFixed(2)}`;
    const list = padsAt.get(k) ?? [];
    list.push(p);
    padsAt.set(k, list);
  }
  // plated slots (oval holes) live on the routing layers
  for (const rl of layerDefs.filter((l) => /^ROUT$/i.test(l.attrs.layerFunction ?? ''))) {
    const span = xchild(rl, 'Span');
    const from = layerIdx.get(span?.attrs.fromLayer ?? '') ?? 0;
    const to = layerIdx.get(span?.attrs.toLayer ?? '') ?? copperOrig.length - 1;
    const lf = xchildren(step, 'LayerFeature').find((x) => x.attrs.layerRef === rl.attrs.name);
    for (const slot of xfind(lf, 'SlotCavity')) {
      if (!/^PLATED$/i.test(slot.attrs.platingStatus ?? '')) continue;
      const at = P(xchild(slot, 'Location'));
      const shape = slot.children.find((c) => STANDARD.has(c.name));
      const prim = shape ? standardPrim(shape, u) : undefined;
      for (const p of padsAt.get(`${at.x.toFixed(2)},${at.y.toFixed(2)}`) ?? []) {
        p.kind = 'thru_hole';
        p.drill = prim ? Math.min(prim.w, prim.h) : p.drill;
        for (let l = Math.min(from, to); l <= Math.max(from, to); l++) if (!p.layers.includes(l)) p.layers.push(l);
        p.layers.sort((x, y) => x - y);
      }
    }
  }
  for (const dl of drillLayers) {
    const span = xchild(dl, 'Span');
    const from = layerIdx.get(span?.attrs.fromLayer ?? '') ?? 0;
    const to = layerIdx.get(span?.attrs.toLayer ?? '') ?? copperOrig.length - 1;
    const lf = xchildren(step, 'LayerFeature').find((x) => x.attrs.layerRef === dl.attrs.name);
    for (const set of xchildren(lf, 'Set')) {
      const geometry = padstacks.get(set.attrs.geometry ?? '');
      for (const h of xfind(set, 'Hole')) {
        const at = P(h);
        const drill = xnum(h, 'diameter') * u;
        const plating = (h.attrs.platingStatus ?? geometry?.plating ?? '').toUpperCase();
        if (plating === 'VIA') {
          const dia = viaDiameter(step, set.attrs.geometry ?? '', prims, u) ?? drill + 0.3;
          b.vias.push({ net: b.net(set.attrs.net), at, diameter: dia, drill, fromLayer: Math.min(from, to), toLayer: Math.max(from, to) });
        } else if (plating === 'PLATED') {
          for (const p of padsAt.get(`${at.x.toFixed(2)},${at.y.toFixed(2)}`) ?? []) {
            p.kind = 'thru_hole';
            p.drill = drill;
            for (let l = Math.min(from, to); l <= Math.max(from, to); l++) if (!p.layers.includes(l)) p.layers.push(l);
            p.layers.sort((x, y) => x - y);
          }
        }
      }
    }
  }
  if (!xfind(step, 'LayerFeature').length) b.warnings.push('ipc2581-no-copper');
  const generator = xchild(xchild(root, 'LogisticHeader'), 'Person')?.attrs.enterpriseRef ?? 'IPC-2581';
  return b.finish(fileName, `IPC-2581 ${root.attrs.revision ?? ''}`.trim() || generator, { thickness: total, entries });
}

// --- negative planes ---------------------------------------------------------------------------

/**
 * A negative plane layer (polarity NEGATIVE, common for planes from Allegro): its features are
 * the voids (clearances around foreign vias and pins, split lines, moats), everything else inside
 * the board is copper of the plane's net. That net is not written down; it is taken from the
 * thermal-relief or full-contact connections on the layer, else from the vias that pass through
 * the layer without a clearance, else from the layer name (GND2 → GND).
 */
function negativePlane(
  b: BoardBuilder,
  lf: XNode,
  li: number,
  layerName: string,
  vias: { at: Vec2; net: string; from: number; to: number }[],
  P: (n: XNode | undefined) => Vec2,
  u: number,
  primOf: (n: XNode) => Prim | undefined,
  widthOf: (n: XNode) => number,
) {
  const sets = xchildren(lf, 'Set');
  const count = new Map<string, number>();
  const bump = (n: string) => n && count.set(n, (count.get(n) ?? 0) + 1);
  const connections: { at: Vec2; net: string }[] = [];
  for (const set of sets)
    for (const pad of xchildren(set, 'Pad')) {
      const id = xchild(pad, 'UserPrimitiveRef')?.attrs.id ?? '';
      if (/therm|relief|spoke|contact|^tr\d/i.test(id)) {
        bump(set.attrs.net ?? '');
        if (set.attrs.net) connections.push({ at: P(xchild(pad, 'Location')), net: set.attrs.net });
      }
    }
  let net = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  if (!net) {
    // vias through the layer without a clearance there belong to the plane
    const voided = new Set<string>();
    for (const set of sets) for (const pad of xchildren(set, 'Pad')) {
      const at = P(xchild(pad, 'Location'));
      voided.add(`${at.x.toFixed(2)},${at.y.toFixed(2)}`);
    }
    for (const v of vias)
      if (v.from < li && v.to > li && !voided.has(`${v.at.x.toFixed(2)},${v.at.y.toFixed(2)}`)) {
        bump(v.net);
        if (v.net) connections.push({ at: v.at, net: v.net });
      }
    net = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  }
  if (!net) {
    const stem = layerName.replace(/[_\-\s]*\d+$/, '').toUpperCase();
    net = b.nets.find((n) => n.toUpperCase() === stem) ?? '';
  }
  if (!net) b.warnings.push(`ipc2581-plane-net-unknown:${layerName}`);
  const voids: Obstacle[] = [];
  for (const set of sets) {
    const own = !!net && set.attrs.net === net;
    for (const pad of xchildren(set, 'Pad')) {
      if (own) continue; // a connection of the plane's own net, not a void
      const prim = primOf(pad);
      if (!prim) continue;
      const at = P(xchild(pad, 'Location'));
      const angle = xnum(xchild(pad, 'Xform'), 'rotation');
      voids.push(prim.shape === 'circle' ? { kind: 'circle', c: at, r: prim.w / 2 } : { kind: 'poly', ring: primOutline(prim, at, angle), r: 0 });
    }
    for (const f of xchildren(set, 'Features')) {
      const loc = xchild(f, 'Location');
      const off = loc ? P(loc) : { x: 0, y: 0 };
      const shift = (q: Vec2): Vec2 => ({ x: q.x + off.x, y: q.y + off.y });
      for (const s of featureShapes(f)) {
        if (s.name === 'Contour') {
          const ring = polygonPoints(xchild(s, 'Polygon'), u).map(shift);
          const holes = xchildren(s, 'Cutout').map((h) => polygonPoints(h, u).map(shift));
          if (ring.length > 2) voids.push({ kind: 'moat', ring, holes });
        } else if (s.name === 'Line') {
          voids.push({ kind: 'seg', a: shift({ x: xnum(s, 'startX') * u, y: -xnum(s, 'startY') * u }), b: shift({ x: xnum(s, 'endX') * u, y: -xnum(s, 'endY') * u }), r: widthOf(s) / 2 });
        } else if (s.name === 'Polyline') {
          const pts = polygonPoints(s, u).map(shift);
          for (let k = 1; k < pts.length; k++) voids.push({ kind: 'seg', a: pts[k - 1]!, b: pts[k]!, r: widthOf(s) / 2 });
        } else if (s.name === 'Circle') {
          voids.push({ kind: 'circle', c: off, r: (xnum(s, 'diameter') * u) / 2 });
        }
      }
    }
  }
  const rings = chainRings(b.edges, 0.02).rings.sort((x, y) => Math.abs(signedArea(y)) - Math.abs(signedArea(x)));
  const outline = rings[0];
  if (!outline) return;
  // board cut-outs (inner profile rings) are voids too
  for (const r of rings.slice(1)) voids.push({ kind: 'poly', ring: r, r: 0 });
  // each island gets the net of the connections inside it (split planes)
  const islands = pourFill({ outline, obstacles: voids });
  islandNets(islands, connections, net).forEach((n, k) => b.zone(b.net(n), li, islands[k]!));
  b.kinds.set(b.copper[li]!, 'power');
}

// --- primitives ----------------------------------------------------------------------------------

const STANDARD = new Set(['RectCenter', 'RectRound', 'RectCham', 'RectCorner', 'Oval', 'Circle', 'Ellipse', 'Octagon', 'Diamond', 'Triangle', 'Butterfly', 'Donut', 'Moire', 'Thermal', 'Contour']);

function standardPrim(n: XNode | undefined, u: number): Prim | undefined {
  if (!n) return undefined;
  const w = xnum(n, 'width') * u;
  const h = xnum(n, 'height') * u;
  switch (n.name) {
    case 'RectCenter':
    case 'RectCorner':
      return { shape: 'rect', w, h };
    case 'RectRound':
      return { shape: 'roundrect', w, h };
    case 'RectCham':
      return { shape: 'chamfered_rect', w, h };
    case 'Oval':
    case 'Ellipse':
      return { shape: 'oval', w, h };
    case 'Circle':
    case 'Donut':
    case 'Thermal':
    case 'Moire': {
      const d = (xnum(n, 'diameter') || xnum(n, 'outerDiameter')) * u;
      return { shape: 'circle', w: d, h: d };
    }
    case 'Octagon':
      return { shape: 'circle', w: w || xnum(n, 'length') * u, h: h || xnum(n, 'length') * u };
    case 'Diamond':
    case 'Triangle':
    case 'Butterfly':
      return { shape: 'custom', w: w || xnum(n, 'base') * u, h: h || w };
    case 'Contour': {
      const poly = polygonPoints(xchild(n, 'Polygon'), u, false);
      return bboxPrim(poly);
    }
  }
  return undefined;
}

function userPrim(e: XNode, u: number): Prim | undefined {
  const us = xchild(e, 'UserSpecial');
  if (!us) return undefined;
  const c = xchild(us, 'Circle');
  if (c && us.children.length === 1) {
    const d = xnum(c, 'diameter') * u;
    return { shape: 'circle', w: d, h: d };
  }
  const contour = xchild(us, 'Contour');
  if (contour) return bboxPrim(polygonPoints(xchild(contour, 'Polygon'), u, false));
  const first = us.children.find((x) => STANDARD.has(x.name));
  return first ? standardPrim(first, u) : undefined;
}

function bboxPrim(poly: Vec2[]): Prim | undefined {
  if (poly.length < 3) return undefined;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { shape: 'custom', w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), poly };
}

/** Outline of a primitive placed at loc (board, y-down) with a rotation. */
function primOutline(p: Prim, loc: Vec2, angle: number): Vec2[] {
  const local: Vec2[] = p.poly
    ? p.poly.map((q) => ({ x: q.x, y: -q.y }))
    : p.shape === 'circle'
      ? Array.from({ length: 16 }, (_, k) => ({ x: (p.w / 2) * Math.cos((k * Math.PI) / 8), y: (p.w / 2) * Math.sin((k * Math.PI) / 8) }))
      : [
          { x: -p.w / 2, y: -p.h / 2 },
          { x: p.w / 2, y: -p.h / 2 },
          { x: p.w / 2, y: p.h / 2 },
          { x: -p.w / 2, y: p.h / 2 },
        ];
  return local.map((q) => {
    const r = rotateKicad(q, angle);
    return { x: loc.x + r.x, y: loc.y + r.y };
  });
}

/** Via pad diameter from its padstack: the first copper pad's primitive. */
function viaDiameter(step: XNode, name: string, prims: Map<string, Prim>, u: number): number | undefined {
  const ps = xchildren(step, 'PadStackDef').find((x) => x.attrs.name === name);
  for (const pd of xchildren(ps, 'PadstackPadDef')) {
    const ref = xchild(pd, 'StandardPrimitiveRef') ?? xchild(pd, 'UserPrimitiveRef');
    const prim = ref ? prims.get(ref.attrs.id ?? '') : standardPrim(pd.children.find((c) => STANDARD.has(c.name)), u);
    if (prim) return Math.max(prim.w, prim.h);
  }
  return undefined;
}

// --- geometry ------------------------------------------------------------------------------------

/**
 * Points of a Polygon (PolyBegin, PolyStepSegment, PolyStepCurve) or Polyline, in mm;
 * y is negated unless yDown is false (local primitive shapes keep the file's frame).
 */
export function polygonPoints(n: XNode | undefined, u: number, yDown = true): Vec2[] {
  if (!n) return [];
  const s = yDown ? -1 : 1;
  const pts: Vec2[] = [];
  let cur: Vec2 | null = null;
  for (const c of n.children) {
    if (c.name === 'PolyBegin' || c.name === 'PolyStepSegment') {
      cur = { x: xnum(c, 'x') * u, y: xnum(c, 'y') * u };
      pts.push({ x: cur.x, y: s * cur.y });
    } else if (c.name === 'PolyStepCurve' && cur) {
      const end = { x: xnum(c, 'x') * u, y: xnum(c, 'y') * u };
      const ctr = { x: xnum(c, 'centerX') * u, y: xnum(c, 'centerY') * u };
      const arc = arcYUp(cur, end, ctr, c.attrs.clockwise === 'true');
      for (const q of arc.slice(1)) pts.push({ x: q.x, y: s * q.y });
      cur = end;
    }
  }
  return pts;
}

/** Shapes inside a Features element (directly or in UserSpecial). */
function featureShapes(f: XNode): XNode[] {
  const out: XNode[] = [];
  for (const c of f.children) {
    if (c.name === 'UserSpecial') out.push(...c.children);
    else if (c.name !== 'Location' && c.name !== 'Xform') out.push(c);
  }
  return out;
}

function addFeature(b: BoardBuilder, s: XNode, netName: string | undefined, li: number, off: Vec2, u: number, widthOf: (n: XNode) => number, inBoard: (q: Vec2) => boolean) {
  const net = b.net(netName);
  const track = (pts: Vec2[], w: number, arc = false) => {
    if (pts.some(inBoard)) b.track(net, li, pts, w, arc);
  };
  const shift = (p: Vec2): Vec2 => ({ x: p.x + off.x, y: p.y + off.y });
  switch (s.name) {
    case 'Line': {
      const a = shift({ x: xnum(s, 'startX') * u, y: -xnum(s, 'startY') * u });
      const e = shift({ x: xnum(s, 'endX') * u, y: -xnum(s, 'endY') * u });
      track([a, e], widthOf(s));
      return;
    }
    case 'Polyline': {
      const pts = polygonPoints(s, u).map(shift);
      track(pts, widthOf(s), s.children.some((c) => c.name === 'PolyStepCurve'));
      return;
    }
    case 'Arc': {
      const st = { x: xnum(s, 'startX') * u, y: xnum(s, 'startY') * u };
      const en = { x: xnum(s, 'endX') * u, y: xnum(s, 'endY') * u };
      const c = { x: xnum(s, 'centerX') * u, y: xnum(s, 'centerY') * u };
      const pts = arcYUp(st, en, c, s.attrs.clockwise === 'true').map((q) => shift({ x: q.x, y: -q.y }));
      track(pts, widthOf(s), true);
      return;
    }
    case 'Contour': {
      const outer = polygonPoints(xchild(s, 'Polygon'), u).map(shift);
      const holes = xchildren(s, 'Cutout').map((h) => polygonPoints(h, u).map(shift));
      if (outer.some(inBoard)) b.zone(net, li, outer, holes);
      return;
    }
    case 'Circle': {
      const d = xnum(s, 'diameter') * u;
      if (d > 0) b.zone(net, li, Array.from({ length: 16 }, (_, k) => ({ x: off.x + (d / 2) * Math.cos((k * Math.PI) / 8), y: off.y + (d / 2) * Math.sin((k * Math.PI) / 8) })));
      return;
    }
  }
}

/** Body box from the package outline (local, y-up), placed like the component. */
function bodyBox(outline: Vec2[], at: Vec2, angle: number, mirror: boolean): Footprint['body'] {
  if (outline.length < 3) return { center: at, size: { x: 1, y: 1 }, angle };
  // local y-up → local y-down; a bottom part is mirrored in x
  const pts = outline.map((p) => ({ x: mirror ? -p.x : p.x, y: -p.y }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const r = rotateKicad(c, angle);
  return { center: { x: at.x + r.x, y: at.y + r.y }, size: { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) }, angle };
}
