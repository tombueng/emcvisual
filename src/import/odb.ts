/**
 * ODB++ (an archive .tgz/.zip/.tar, or the unpacked folder's files) to BoardModel.
 *
 * ODB++ is the manufacturing exchange format of Siemens and is exported by Altium Designer,
 * Cadence Allegro/OrCAD, PADS/Xpedition, Zuken and KiCad. Read are:
 *
 * - matrix/matrix: the layers in physical order (copper: SIGNAL, POWER_GROUND, MIXED;
 *   DIELECTRIC; DRILL with START_NAME/END_NAME), the first step;
 * - steps/<step>/profile: the board outline;
 * - steps/<step>/layers/<layer>/features: lines (tracks), arcs, pads and surfaces (filled
 *   copper with islands and holes) with their symbols (r…, s…, rect…, oval…), and the
 *   attribute lists (dielectric thickness, εr, loss tangent; copper weight);
 * - steps/<step>/eda/data: net names and which feature belongs to which net (FID records),
 *   package extents for the part bodies;
 * - steps/<step>/layers/comp_+_top|comp_+_bot/components: parts with their pins (toeprints),
 *   positions, rotation, side, net of each pin and the value property;
 * - drill layers: plated holes of pins, vias (by the .drill attribute) and their span.
 *
 * Coordinates are y-up and become y-down; ODB++ rotates clockwise, KiCad counter-clockwise.
 */
import { chainRings, DEG, rotateKicad, signedArea } from '../model/geometry';
import type { StackupEntry } from '../model/stackup';
import type { BoardModel, Footprint, Pad, PadShape, Vec2 } from '../model/types';
import { uncompressZ, unpack } from './archive';
import { arcYUp, BoardBuilder, guessHeight, ImportError } from './builder';
import { islandNets, pourFill, type Obstacle } from './pour';

interface Sym {
  shape: PadShape;
  w: number;
  h: number;
  /** A thermal relief (thr…, ths…): on a negative plane a connection, not a clearance. */
  thermal?: boolean;
  /** The null symbol: no copper; on a negative plane it marks a direct connection. */
  none?: boolean;
}

interface Feature {
  kind: 'L' | 'P' | 'A' | 'S' | 'T' | 'B';
  /** Points in mm, y-up. */
  a?: Vec2;
  b?: Vec2;
  c?: Vec2;
  cw?: boolean;
  sym?: Sym;
  /** Pad orientation, degrees clockwise. */
  rot?: number;
  mirror?: boolean;
  negative?: boolean;
  attrs: Map<number, string>;
  /** Surfaces: contours, each with its points (y-up) and whether it is a hole. */
  contours?: { pts: Vec2[]; hole: boolean }[];
}

interface FeatureFile {
  features: Feature[];
  attrNames: string[];
}

const dec = new TextDecoder();

/** Read an ODB++ archive (or a map of its files). */
export async function parseOdbArchive(data: ArrayBuffer, fileName = 'board.tgz'): Promise<BoardModel> {
  let files = await unpack(data);
  // deliveries often pack the job archive into another archive (with drawings and reports)
  for (let depth = 0; depth < 2 && ![...files.keys()].some((p) => /(^|\/)matrix\/matrix$/i.test(p)); depth++) {
    const inner = [...files.entries()].filter(([p]) => /\.(tgz|tar\.gz|zip|tar)$/i.test(p)).sort((a, b) => b[1].length - a[1].length);
    if (!inner.length) break;
    const merged = new Map<string, Uint8Array>();
    for (const [p, bytes] of inner) {
      try {
        for (const [q, v] of await unpack(bytes.slice().buffer)) merged.set(`${p}/${q}`, v);
      } catch {
        // not an archive after all: skip it
      }
    }
    files = merged;
  }
  return parseOdb(files, fileName);
}

export function parseOdb(files: Map<string, Uint8Array>, fileName = 'board.tgz'): BoardModel {
  // the job root is the folder that holds matrix/matrix
  const matrixPath = [...files.keys()].find((p) => /(^|\/)matrix\/matrix$/i.test(p));
  if (!matrixPath) throw new ImportError('not an ODB++ archive (matrix/matrix is missing)');
  const root = matrixPath.slice(0, matrixPath.length - 'matrix/matrix'.length);
  const lower = new Map<string, Uint8Array>();
  for (const [p, v] of files) if (p.startsWith(root)) lower.set(p.slice(root.length).toLowerCase(), v);
  const text = (p: string) => {
    const v = lower.get(p.toLowerCase());
    if (v) return dec.decode(v);
    // Genesis/InCAM and Allegro store large files compressed with Unix compress (features.Z)
    const z = lower.get(`${p.toLowerCase()}.z`);
    return z ? dec.decode(uncompressZ(z)) : undefined;
  };

  // --- matrix --------------------------------------------------------------------------------
  const blocks = parseBlocks(text('matrix/matrix') ?? '');
  const stepName = (blocks.find((b) => b.type === 'STEP')?.kv.NAME ?? '').toLowerCase();
  const stepDir = stepName ? `steps/${stepName}/` : [...lower.keys()].find((p) => /^steps\/[^/]+\//.test(p))?.match(/^steps\/[^/]+\//)?.[0];
  if (!stepDir) throw new ImportError('ODB++ archive without a step');
  const layers = blocks
    .filter((b) => b.type === 'LAYER' && (b.kv.CONTEXT ?? 'BOARD').toUpperCase() === 'BOARD')
    .map((b) => ({ row: Number(b.kv.ROW ?? 0), type: (b.kv.TYPE ?? '').toUpperCase(), name: (b.kv.NAME ?? '').toLowerCase(), start: (b.kv.START_NAME ?? '').toLowerCase(), end: (b.kv.END_NAME ?? '').toLowerCase(), negative: /^NEGATIVE$/i.test(b.kv.POLARITY ?? '') }))
    .sort((a, b) => a.row - b.row);
  const isCopper = (t: string) => t === 'SIGNAL' || t === 'POWER_GROUND' || t === 'MIXED';
  const copper = layers.filter((l) => isCopper(l.type));
  if (!copper.length) throw new ImportError('ODB++ archive without copper layers');
  const b = new BoardBuilder(copper.map((l) => l.name));
  const li = new Map(copper.map((l, i) => [l.name, i]));
  copper.forEach((l, i) => b.kinds.set(b.copper[i]!, l.type === 'POWER_GROUND' ? 'power' : 'signal'));

  // stack-up from the attribute lists
  const attrlist = (layer: string) => {
    const t = text(`${stepDir}layers/${layer}/attrlist`) ?? '';
    const m = new Map<string, string>();
    // no unit line: KiCad writes millimetres here (and says so in the features file), the
    // format's default is inches
    const feat = (text(`${stepDir}layers/${layer}/features`) ?? '').slice(0, 2000);
    let scale = /^\s*(UNITS\s*=\s*MM|U\s+MM)/im.test(feat) ? 1 : 25.4;
    for (const line of t.split(/\r?\n/)) {
      const kv = /^\s*\.?([\w.]+)\s*=\s*(.*)$/.exec(line);
      if (!kv) continue;
      if (/^units$/i.test(kv[1]!)) scale = /inch/i.test(kv[2]!) ? 25.4 : 1;
      else m.set(kv[1]!.toLowerCase().replace(/^\./, ''), kv[2]!.trim());
    }
    return { m, scale };
  };
  const entries: StackupEntry[] = [];
  let dielectrics = 0;
  for (const l of layers) {
    if (isCopper(l.type)) {
      const { m } = attrlist(l.name);
      const oz = Number(m.get('copper_weight'));
      entries.push({ name: b.copper[li.get(l.name)!]!, type: 'copper', thickness: Number.isFinite(oz) && oz > 0 ? 0.035 * oz : 0 });
    } else if (l.type === 'DIELECTRIC') {
      const { m, scale } = attrlist(l.name);
      const t = Number(m.get('layer_dielectric'));
      if (!(t > 0)) continue;
      dielectrics++;
      const er = Number(m.get('dielectric_constant'));
      const tan = Number(m.get('loss_tangent'));
      entries.push({ name: l.name, type: /prepreg|pp/i.test(m.get('material') ?? '') ? 'prepreg' : 'core', thickness: t * scale, epsilonR: Number.isFinite(er) ? er : undefined, lossTangent: Number.isFinite(tan) ? tan : undefined, material: m.get('material') });
    }
  }

  // --- features ------------------------------------------------------------------------------
  const featureFile = (path: string): FeatureFile | null => {
    const t = text(path);
    return t === undefined ? null : parseFeatures(t);
  };
  const profile = featureFile(`${stepDir}profile`);
  for (const f of profile?.features ?? [])
    for (const c of f.contours ?? []) if (c.pts.length > 2) b.edges.push([...c.pts, c.pts[0]!].map(yDown));

  // nets: names in order, and the net of each copper feature
  const eda = text(`${stepDir}eda/data`) ?? '';
  const netNames: string[] = [];
  const featureNet = new Map<string, string>();
  const pkgBox: { x0: number; y0: number; x1: number; y1: number }[] = [];
  {
    let lyr: string[] = [];
    let cur = '';
    let edaScale = /^\s*(UNITS\s*=\s*MM|U\s+MM)/im.test(eda) ? 1 : 25.4;
    for (const line of eda.split(/\r?\n/)) {
      if (/^UNITS\s*=\s*INCH/i.test(line) || /^U\s+INCH/i.test(line)) edaScale = 25.4;
      if (line.startsWith('LYR ')) lyr = line.slice(4).trim().split(/\s+/).map((s) => s.toLowerCase());
      else if (line.startsWith('NET ')) {
        cur = line.slice(4).split(';')[0]!.trim();
        netNames.push(cur);
      } else if (line.startsWith('FID ')) {
        const [, kind, l, f] = line.split(/\s+/);
        if (kind === 'C' || kind === 'H') featureNet.set(`${lyr[Number(l)] ?? ''}|${f}`, cur);
      } else if (line.startsWith('PKG ')) {
        const t = line.slice(4).split(';')[0]!.trim().split(/\s+/);
        const [x0, y0, x1, y1] = t.slice(2, 6).map((v) => Number(v) * edaScale);
        pkgBox.push({ x0: x0 ?? 0, y0: y0 ?? 0, x1: x1 ?? 0, y1: y1 ?? 0 });
      }
    }
  }
  const netOfName = (n: string | undefined) => (!n || n === '$NONE$' ? 0 : b.net(n));

  const posKey = (p: Vec2) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  // --- drill layers: holes of pins and vias -------------------------------------------------------
  const holes = new Map<string, { drill: number; kind: 'plated' | 'via' | 'npth'; from: number; to: number; net: string }>();
  for (const l of layers.filter((x) => x.type === 'DRILL')) {
    const ff = featureFile(`${stepDir}layers/${l.name}/features`);
    if (!ff) continue;
    const from = li.get(l.start) ?? 0;
    const to = li.get(l.end) ?? copper.length - 1;
    const drillAttr = ff.attrNames.indexOf('.drill');
    ff.features.forEach((f, k) => {
      if (f.kind !== 'P' || !f.a) return;
      const v = drillAttr >= 0 ? f.attrs.get(drillAttr) : undefined;
      const kind = v === '2' ? 'via' : v === '1' ? 'npth' : v === '0' ? 'plated' : 'plated';
      holes.set(posKey(f.a), { drill: f.sym?.w ?? 0.3, kind, from: Math.min(from, to), to: Math.max(from, to), net: featureNet.get(`${l.name}|${k}`) ?? '' });
    });
  }

  // copper layers
  const padIndex = new Map<number, Map<string, { f: Feature; net: string }>>();
  const layerFeatures = new Map<string, FeatureFile>();
  for (const l of copper) {
    const ff = featureFile(`${stepDir}layers/${l.name}/features`);
    if (!ff) continue;
    layerFeatures.set(l.name, ff);
    const i = li.get(l.name)!;
    // drawing frame, title block and lettering on the artwork (.nomenclature), and anything
    // entirely outside the board, are no copper of the board
    dropArtwork(ff, b.edges);
    if (l.negative) {
      negativePlane(b, ff, i, l.name, holes, posKey);
      continue;
    }
    const pads = new Map<string, { f: Feature; net: string }>();
    padIndex.set(i, pads);
    ff.features.forEach((f, k) => {
      const netName = featureNet.get(`${l.name}|${k}`);
      const net = netOfName(netName);
      if (f.kind === 'L' && f.a && f.b) b.track(net, i, [yDown(f.a), yDown(f.b)], f.sym?.w ?? 0.2);
      else if (f.kind === 'A' && f.a && f.b && f.c) b.track(net, i, arcYUp(f.a, f.b, f.c, !!f.cw).map(yDown), f.sym?.w ?? 0.2, true);
      else if (f.kind === 'S' && !f.negative) {
        // islands with the holes that follow them
        let outer: Vec2[] | null = null;
        let holes: Vec2[][] = [];
        const flush = () => {
          if (outer) b.zone(net, i, outer, holes);
          outer = null;
          holes = [];
        };
        for (const c of f.contours ?? []) {
          if (c.hole) holes.push(c.pts.map(yDown));
          else {
            flush();
            outer = c.pts.map(yDown);
          }
        }
        flush();
      } else if (f.kind === 'P' && f.a && !f.sym?.none) pads.set(posKey(f.a), { f, net: netName ?? '' });
    });
  }

  // --- components -----------------------------------------------------------------------------------
  const usedPads = new Set<Feature>();
  for (const side of ['top', 'bot'] as const) {
    const t = text(`${stepDir}layers/comp_+_${side}/components`);
    if (!t) continue;
    let scale = /^\s*(UNITS\s*=\s*MM|U\s+MM)/im.test(t) ? 1 : 25.4;
    let fp: Footprint | null = null;
    let fpIndex = -1;
    const outer = side === 'top' ? 0 : copper.length - 1;
    for (const raw of t.split(/\r?\n/)) {
      const line = raw.split(';')[0]!.trim();
      if (/^UNITS\s*=\s*INCH/i.test(line) || /^U\s+INCH/i.test(line)) scale = 25.4;
      if (line.startsWith('CMP ')) {
        const tok = line.split(/\s+/);
        const pkg = Number(tok[1]);
        const at = { x: Number(tok[2]) * scale, y: Number(tok[3]) * scale };
        const rot = Number(tok[4]) || 0;
        const mirror = tok[5] === 'M' || tok[5] === 'Y';
        const ref = tok[6] ?? '';
        const angleCcw = ((-rot % 360) + 360) % 360;
        const box = pkgBox[pkg];
        let body: Footprint['body'] = { center: yDown(at), size: { x: 1, y: 1 }, angle: angleCcw };
        if (box && box.x1 > box.x0) {
          const c = { x: ((box.x0 + box.x1) / 2) * (mirror ? -1 : 1), y: (box.y0 + box.y1) / 2 };
          // local y-up → rotate clockwise by rot → board y-up
          const r = { x: c.x * Math.cos(-rot * DEG) - c.y * Math.sin(-rot * DEG), y: c.x * Math.sin(-rot * DEG) + c.y * Math.cos(-rot * DEG) };
          body = { center: yDown({ x: at.x + r.x, y: at.y + r.y }), size: { x: box.x1 - box.x0, y: box.y1 - box.y0 }, angle: angleCcw };
        }
        fp = { ref, value: tok[7] ?? '', lib: tok[7] ?? '', at: yDown(at), angle: angleCcw, side: side === 'top' ? 'top' : 'bottom', body, height: guessHeight(ref, tok[7] ?? ''), pads: [], fields: {}, models: [] };
        fpIndex = b.footprints.length;
        b.footprints.push(fp);
      } else if (line.startsWith('PRP ') && fp) {
        const m = /^PRP\s+(\S+)\s+'(.*)'/.exec(line);
        if (m) {
          if (/^value$/i.test(m[1]!)) fp.value = m[2]!;
          else if (m[2]) fp.fields[m[1]!] = m[2]!;
        }
      } else if (line.startsWith('TOP ') && fp) {
        const tok = line.split(/\s+/);
        const at = { x: Number(tok[2]) * scale, y: Number(tok[3]) * scale };
        const netNum = Number(tok[6]);
        const number = tok.slice(8).join(' ');
        const key = posKey(at);
        const copperPad = padIndex.get(outer)?.get(key) ?? padIndex.get(0)?.get(key) ?? padIndex.get(copper.length - 1)?.get(key);
        if (copperPad) usedPads.add(copperPad.f);
        // a pin's copper on the other layers (through-hole) belongs to the pin as well
        for (const pads of padIndex.values()) {
          const other = pads.get(key);
          if (other) usedPads.add(other.f);
        }
        const sym = copperPad?.f.sym ?? { shape: 'circle' as PadShape, w: 0.5, h: 0.5 };
        const hole = holes.get(key);
        const netName = netNames[netNum] ?? copperPad?.net;
        const pad: Pad = {
          footprint: fpIndex,
          ref: fp.ref,
          number,
          net: netOfName(netName),
          at: yDown(at),
          angle: copperPad ? (((-(copperPad.f.rot ?? 0)) % 360) + 360) % 360 : fp.angle,
          shape: sym.shape,
          kind: hole && hole.kind !== 'via' ? (hole.kind === 'npth' ? 'np_thru_hole' : 'thru_hole') : 'smd',
          size: { x: sym.w, y: sym.h },
          layers: hole && hole.kind !== 'via' ? range(hole.from, hole.to) : [outer],
          drill: hole && hole.kind !== 'via' ? hole.drill : 0,
          pinFunction: '',
          pinType: '',
        };
        if (hole && hole.kind !== 'via') hole.kind = 'npth' === hole.kind ? hole.kind : 'plated';
        fp.pads.push(b.pads.length);
        b.pads.push(pad);
      }
    }
  }

  // --- vias, and loose pads (fiducials, test points) as copper ------------------------------------------
  for (const [key, h] of holes) {
    if (h.kind !== 'via') continue;
    const [x, y] = key.split(',').map((v) => Number(v) / 100);
    const pad = padIndex.get(h.from)?.get(key) ?? padIndex.get(0)?.get(key);
    if (pad) usedPads.add(pad.f);
    for (const pads of padIndex.values()) {
      const p = pads.get(key);
      if (p) usedPads.add(p.f);
    }
    b.vias.push({ net: netOfName(h.net || pad?.net), at: yDown({ x: x!, y: y! }), diameter: pad?.f.sym ? Math.max(pad.f.sym.w, pad.f.sym.h) : h.drill + 0.3, drill: h.drill, fromLayer: h.from, toLayer: h.to });
  }
  for (const [i, pads] of padIndex) {
    for (const { f, net } of pads.values()) {
      if (usedPads.has(f) || !f.a || !f.sym || !net || net === '$NONE$') continue;
      const c = yDown(f.a);
      const s = f.sym;
      const ring =
        s.shape === 'circle'
          ? Array.from({ length: 16 }, (_, k) => ({ x: c.x + (s.w / 2) * Math.cos((k * Math.PI) / 8), y: c.y + (s.w / 2) * Math.sin((k * Math.PI) / 8) }))
          : [
              { x: -s.w / 2, y: -s.h / 2 },
              { x: s.w / 2, y: -s.h / 2 },
              { x: s.w / 2, y: s.h / 2 },
              { x: -s.w / 2, y: s.h / 2 },
            ].map((q) => {
              const r = rotateKicad(q, -(f.rot ?? 0));
              return { x: c.x + r.x, y: c.y + r.y };
            });
      b.zone(b.net(net), i, ring);
    }
  }
  const hdr = /^HDR\s+(.*)$/m.exec(eda)?.[1]?.trim();
  return b.finish(fileName, hdr ? `ODB++ (${hdr})` : 'ODB++', { thickness: 1.6, entries: dielectrics === copper.length - 1 ? entries : null });
}

const yDown = (p: Vec2): Vec2 => ({ x: p.x, y: -p.y });

/** Removes features marked .nomenclature and features entirely outside the board's extent (in place). */
function dropArtwork(ff: FeatureFile, edges: Vec2[][]) {
  const nom = ff.attrNames.indexOf('.nomenclature');
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of edges)
    for (const p of e) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const margin = 1;
  const inside = (p: Vec2 | undefined) => !p || !Number.isFinite(x0) || (p.x >= x0 - margin && p.x <= x1 + margin && -p.y >= y0 - margin && -p.y <= y1 + margin);
  ff.features = ff.features.map((f) =>
    (nom >= 0 && f.attrs.has(nom)) || (f.a && !inside(f.a) && (!f.b || !inside(f.b))) ? { kind: 'T', attrs: new Map() } : f,
  );
}

/**
 * A negative layer (matrix POLARITY=NEGATIVE, common for planes from Allegro and PADS): its
 * features are voids, everything else inside the profile is copper of the plane's net. The net is
 * the one of the vias that cross the layer without a void at their position, else the layer name
 * (gnd2 → GND).
 */
function negativePlane(
  b: BoardBuilder,
  ff: FeatureFile,
  li: number,
  name: string,
  holes: Map<string, { kind: string; from: number; to: number; net: string }>,
  posKey: (p: Vec2) => string,
) {
  const voids: Obstacle[] = [];
  const voided = new Set<string>();
  const thermal = new Set<string>();
  for (const f of ff.features) {
    if (f.negative) continue; // a negative feature on a negative layer adds copper back: rare, left out
    if (f.kind === 'P' && f.a && (f.sym?.thermal || f.sym?.none)) {
      // thermal relief or null pad: the via or pin here connects to the plane
      thermal.add(posKey(f.a));
      continue;
    }
    if (f.kind === 'P' && f.a && f.sym) {
      voided.add(posKey(f.a));
      const c = yDown(f.a);
      if (f.sym.shape === 'circle') voids.push({ kind: 'circle', c, r: f.sym.w / 2 });
      else
        voids.push({
          kind: 'poly',
          ring: [
            { x: -f.sym.w / 2, y: -f.sym.h / 2 },
            { x: f.sym.w / 2, y: -f.sym.h / 2 },
            { x: f.sym.w / 2, y: f.sym.h / 2 },
            { x: -f.sym.w / 2, y: f.sym.h / 2 },
          ].map((q) => {
            const r = rotateKicad(q, -(f.rot ?? 0));
            return { x: c.x + r.x, y: c.y + r.y };
          }),
          r: 0,
        });
    } else if (f.kind === 'L' && f.a && f.b) voids.push({ kind: 'seg', a: yDown(f.a), b: yDown(f.b), r: (f.sym?.w ?? 0.2) / 2 });
    else if (f.kind === 'A' && f.a && f.b && f.c) {
      const pts = arcYUp(f.a, f.b, f.c, !!f.cw).map(yDown);
      for (let k = 1; k < pts.length; k++) voids.push({ kind: 'seg', a: pts[k - 1]!, b: pts[k]!, r: (f.sym?.w ?? 0.2) / 2 });
    } else if (f.kind === 'S') {
      let ring: Vec2[] | null = null;
      let inner: Vec2[][] = [];
      const flush = () => {
        if (ring) voids.push({ kind: 'moat', ring, holes: inner });
        ring = null;
        inner = [];
      };
      for (const c of f.contours ?? []) {
        if (c.hole) inner.push(c.pts.map(yDown));
        else {
          flush();
          ring = c.pts.map(yDown);
        }
      }
      flush();
    }
  }
  const count = new Map<string, number>();
  // holes through the layer with a thermal relief, or without any void, connect to the plane
  const connections: { at: Vec2; net: string }[] = [];
  for (const [key, h] of holes) {
    if (!h.net || h.net === '$NONE$' || h.from > li || h.to < li) continue;
    if (thermal.has(key) || (h.kind === 'via' && h.from < li && h.to > li && !voided.has(key))) {
      count.set(h.net, (count.get(h.net) ?? 0) + 1);
      const [x, y] = key.split(',').map((v) => Number(v) / 100);
      connections.push({ at: yDown({ x: x!, y: y! }), net: h.net });
    }
  }
  let net = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  if (!net) {
    const stem = name.replace(/[_\-\s]*\d+$/, '').toUpperCase();
    net = b.nets.find((n) => n.toUpperCase() === stem) ?? '';
  }
  if (!net) b.warnings.push(`odb-plane-net-unknown:${name}`);
  const rings = chainRings(b.edges, 0.02).rings.sort((x, y) => Math.abs(signedArea(y)) - Math.abs(signedArea(x)));
  if (!rings[0]) return;
  for (const r of rings.slice(1)) voids.push({ kind: 'poly', ring: r, r: 0 });
  // each island gets the net of the connections inside it (split planes)
  const islands = pourFill({ outline: rings[0], obstacles: voids });
  islandNets(islands, connections, net).forEach((n, k) => b.zone(n ? b.net(n) : 0, li, islands[k]!));
  b.kinds.set(b.copper[li]!, 'power');
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/** Blocks of the matrix file: NAME { KEY=VALUE … }. */
function parseBlocks(t: string): { type: string; kv: Record<string, string> }[] {
  const out: { type: string; kv: Record<string, string> }[] = [];
  let cur: { type: string; kv: Record<string, string> } | null = null;
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    const open = /^(\w+)\s*\{$/.exec(line);
    if (open) {
      cur = { type: open[1]!.toUpperCase(), kv: {} };
      continue;
    }
    if (line === '}') {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    const kv = /^([\w.]+)\s*=\s*(.*)$/.exec(line);
    if (cur && kv) cur.kv[kv[1]!.toUpperCase()] = kv[2]!;
  }
  return out;
}

/** A features file: symbols, attribute names and the feature records in order. */
export function parseFeatures(t: string): FeatureFile {
  // ODB++ files without a unit line are in inches (the format's default); KiCad and most newer
  // exporters write UNITS=MM
  let inch = true;
  const syms: string[] = [];
  const attrNames: string[] = [];
  const features: Feature[] = [];
  let surface: Feature | null = null;
  let contour: { pts: Vec2[]; hole: boolean } | null = null;
  const lines = t.split(/\r?\n/);
  // units first: they scale the symbols too
  for (const line of lines) {
    if (/^UNITS\s*=\s*INCH/i.test(line) || /^U\s+INCH/i.test(line)) inch = true;
    if (/^UNITS\s*=\s*MM/i.test(line) || /^U\s+MM/i.test(line)) inch = false;
    if (line.startsWith('#Layer features') || /^[LPASTB] /.test(line)) break;
  }
  const S = inch ? 25.4 : 1;
  const symScale = inch ? 0.0254 : 0.001; // mils or microns
  const symCache = new Map<number, Sym>();
  const symOf = (idx: number): Sym => {
    let s = symCache.get(idx);
    if (!s) symCache.set(idx, (s = parseSymbol(syms[idx] ?? '', symScale)));
    return s;
  };
  const attrsOf = (rest: string): Map<number, string> => {
    const m = new Map<number, string>();
    const semi = rest.indexOf(';');
    if (semi < 0) return m;
    for (const part of rest.slice(semi + 1).split(',')) {
      const [k, v] = part.trim().split('=');
      if (k !== undefined && k !== '') m.set(Number(k), v ?? '');
    }
    return m;
  };
  const P = (x: string | undefined, y: string | undefined): Vec2 => ({ x: Number(x) * S, y: Number(y) * S });
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const c0 = line[0]!;
    if (c0 === '$') {
      const m = /^\$(\d+)\s+(\S+)/.exec(line);
      if (m) syms[Number(m[1])] = m[2]!;
      continue;
    }
    if (c0 === '@') {
      const m = /^@(\d+)\s+(\S+)/.exec(line);
      if (m) attrNames[Number(m[1])] = m[2]!;
      continue;
    }
    if (surface) {
      if (line.startsWith('OB')) {
        const t2 = line.split(/\s+/);
        contour = { pts: [P(t2[1], t2[2])], hole: t2[3] === 'H' };
      } else if (line.startsWith('OS') && contour) {
        const t2 = line.split(/\s+/);
        contour.pts.push(P(t2[1], t2[2]));
      } else if (line.startsWith('OC') && contour) {
        const t2 = line.split(/\s+/);
        const end = P(t2[1], t2[2]);
        const ctr = P(t2[3], t2[4]);
        const start = contour.pts[contour.pts.length - 1]!;
        contour.pts.push(...arcYUp(start, end, ctr, t2[5] === 'Y').slice(1));
      } else if (line.startsWith('OE') && contour) {
        surface.contours!.push(contour);
        contour = null;
      } else if (line.startsWith('SE')) {
        features.push(surface);
        surface = null;
      }
      continue;
    }
    const tok = line.split(';')[0]!.trim().split(/\s+/);
    switch (c0) {
      case 'L':
        if (tok[0] !== 'L') break;
        features.push({ kind: 'L', a: P(tok[1], tok[2]), b: P(tok[3], tok[4]), sym: symOf(Number(tok[5])), negative: tok[6] === 'N', attrs: attrsOf(line) });
        break;
      case 'P': {
        if (tok[0] !== 'P') break;
        let k = 3;
        let symIdx = Number(tok[k]);
        let resize = 1;
        if (symIdx === -1) {
          symIdx = Number(tok[++k]);
          resize = Number(tok[++k]) || 1;
        }
        const pol = tok[k + 1];
        const orient = Number(tok[k + 3]);
        let rot = 0;
        let mirror = false;
        if (orient === 8 || orient === 9) {
          rot = Number(tok[k + 4]) || 0;
          mirror = orient === 9;
        } else if (orient >= 0 && orient <= 7) {
          rot = (orient % 4) * 90;
          mirror = orient >= 4;
        }
        const sym = symOf(symIdx);
        features.push({ kind: 'P', a: P(tok[1], tok[2]), sym: resize !== 1 ? { ...sym, w: sym.w * resize, h: sym.h * resize } : sym, rot, mirror, negative: pol === 'N', attrs: attrsOf(line) });
        break;
      }
      case 'A':
        if (tok[0] !== 'A') break;
        features.push({ kind: 'A', a: P(tok[1], tok[2]), b: P(tok[3], tok[4]), c: P(tok[5], tok[6]), sym: symOf(Number(tok[7])), negative: tok[8] === 'N', cw: tok[10] === 'Y', attrs: attrsOf(line) });
        break;
      case 'S':
        if (tok[0] !== 'S') break;
        surface = { kind: 'S', negative: tok[1] === 'N', attrs: attrsOf(line), contours: [] };
        break;
      case 'T':
      case 'B':
        if (tok[0] === 'T' || tok[0] === 'B') features.push({ kind: c0, attrs: new Map() });
        break;
    }
  }
  return { features, attrNames };
}

/** Standard ODB++ symbol names (dimensions in microns for metric, mils for imperial files). */
export function parseSymbol(name: string, k: number): Sym {
  const n = name.toLowerCase();
  if (n === 'null') return { shape: 'custom', w: 0, h: 0, none: true };
  let m: RegExpExecArray | null;
  if ((m = /^r([\d.]+)$/.exec(n))) return { shape: 'circle', w: Number(m[1]) * k, h: Number(m[1]) * k };
  if ((m = /^s([\d.]+)$/.exec(n))) return { shape: 'rect', w: Number(m[1]) * k, h: Number(m[1]) * k };
  if ((m = /^rect([\d.]+)x([\d.]+)(x?r[\d.]+)?/.exec(n))) return { shape: m[3] ? 'roundrect' : 'rect', w: Number(m[1]) * k, h: Number(m[2]) * k };
  if ((m = /^oval([\d.]+)x([\d.]+)/.exec(n))) return { shape: 'oval', w: Number(m[1]) * k, h: Number(m[2]) * k };
  if ((m = /^el([\d.]+)x([\d.]+)/.exec(n))) return { shape: 'oval', w: Number(m[1]) * k, h: Number(m[2]) * k };
  if ((m = /^(di|oct|hex_[lsr]|tri)([\d.]+)x([\d.]+)/.exec(n))) return { shape: 'custom', w: Number(m[2]) * k, h: Number(m[3]) * k };
  if ((m = /^donut_[rs]([\d.]+)x([\d.]+)/.exec(n))) return { shape: 'circle', w: Number(m[1]) * k, h: Number(m[1]) * k };
  if ((m = /^(thr|ths|s_thr|s_tho|s_ths|sr_ths|rc_ths|rc_tho)([\d.]+)x([\d.]+)/.exec(n))) return { shape: 'circle', w: Number(m[2]) * k, h: Number(m[2]) * k, thermal: true };
  if ((m = /^moire[\d.]*x[\d.]*x[\d.]*x([\d.]+)/.exec(n))) return { shape: 'circle', w: Number(m[1]) * k, h: Number(m[1]) * k };
  // user-defined symbol: size unknown
  return { shape: 'custom', w: 0.5, h: 0.5 };
}
