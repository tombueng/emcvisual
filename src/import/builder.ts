/**
 * Shared building blocks for the importers of other CAD formats (Eagle, IPC-2581, ODB++).
 *
 * Every importer turns its file into the same BoardModel the KiCad parser produces, so the
 * physics, the rules and the renderer need not know where a board came from:
 *
 * - 2D coordinates in mm with y pointing down (KiCad convention). Formats with y up (Eagle,
 *   IPC-2581, ODB++) negate y; the picture stays the same, and angles keep their meaning
 *   (positive = counter-clockwise on screen).
 * - Copper layers named like KiCad's (F.Cu, In1.Cu, …, B.Cu), top to bottom; the original
 *   names are kept in `layerNames` for messages.
 * - Zones are filled copper: outer rings with their holes joined in (keyhole rings).
 */
import { buildStackup, type StackupEntry } from '../model/stackup';
import { bboxValid, chainRings, DEG, emptyBBox, growBBox, signedArea } from '../model/geometry';
import { keyhole } from './pour';
import type { BoardModel, Footprint, LayerKind, Pad, Track, Vec2, Via, Zone } from '../model/types';
import { unescapeKicad } from '../kicad/parseBoard';

export class ImportError extends Error {}

/** KiCad-style names for n copper layers, top to bottom. */
export function copperLayerNames(n: number): string[] {
  if (n <= 1) return ['F.Cu'];
  return ['F.Cu', ...Array.from({ length: n - 2 }, (_, i) => `In${i + 1}.Cu`), 'B.Cu'];
}

export { keyhole } from './pour';

export interface StackupInput {
  /** Total board thickness, mm (used when the dielectrics are unknown). */
  thickness: number;
  /** Physical layers top to bottom with the KiCad copper names; null: default stack-up. */
  entries: StackupEntry[] | null;
}

/** Collects the parts of a board and finishes it into a BoardModel. */
export class BoardBuilder {
  readonly nets: string[] = [''];
  private netIndex = new Map<string, number>([['', 0]]);
  readonly tracks: Track[] = [];
  readonly vias: Via[] = [];
  readonly pads: Pad[] = [];
  readonly footprints: Footprint[] = [];
  readonly zones: Zone[] = [];
  readonly warnings: string[] = [];
  /** Open or closed polylines of the board outline. */
  readonly edges: Vec2[][] = [];
  readonly copper: string[];
  readonly kinds = new Map<string, LayerKind>();

  /**
   * @param layerNames original copper layer names, top to bottom
   */
  constructor(readonly layerNames: string[]) {
    if (!layerNames.length) throw new ImportError('no copper layers');
    this.copper = copperLayerNames(layerNames.length);
  }

  net(name: string | undefined | null): number {
    // exports from KiCad keep its escapes ("{slash}" for "/")
    const n = unescapeKicad((name ?? '').trim());
    if (!n) return 0;
    let i = this.netIndex.get(n);
    if (i === undefined) {
      i = this.nets.length;
      this.nets.push(n);
      this.netIndex.set(n, i);
    }
    return i;
  }

  track(net: number, layer: number, pts: Vec2[], width: number, fromArc = false) {
    for (let k = 1; k < pts.length; k++) this.tracks.push({ net, layer, a: pts[k - 1]!, b: pts[k]!, width, fromArc });
  }

  /** A filled region: outer ring and holes; several regions of a net on a layer are merged. */
  zone(net: number, layer: number, outer: Vec2[], holes: Vec2[][] = []) {
    if (outer.length < 3) return;
    const ring = holes.length ? keyhole(outer, holes) : outer;
    const area = Math.abs(signedArea(ring));
    if (area <= 0) return;
    const z = this.zones.find((x) => x.net === net && x.layer === layer);
    if (z) {
      z.polygons.push(ring);
      z.area += area;
    } else this.zones.push({ net, layer, polygons: [ring], area });
  }

  finish(fileName: string, generator: string, stack: StackupInput): BoardModel {
    const st = buildStackup(this.copper, this.kinds, stack.entries, stack.thickness);
    if (!st.fromFile) this.warnings.push('stackup-default');
    const { rings, open } = chainRings(this.edges, 0.02);
    if (open.length) this.warnings.push(`outline-open:${open.length}`);
    rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    let outline = rings;
    if (!outline.length) {
      this.warnings.push('outline-missing');
      const b = emptyBBox();
      for (const t of this.tracks) {
        growBBox(b, t.a, t.width);
        growBBox(b, t.b, t.width);
      }
      for (const p of this.pads) growBBox(b, p.at, Math.max(p.size.x, p.size.y));
      for (const z of this.zones) for (const r of z.polygons) for (const p of r) growBBox(b, p);
      if (!bboxValid(b)) throw new ImportError('the board has neither an outline nor copper');
      outline = [[{ x: b.x0 - 1, y: b.y0 - 1 }, { x: b.x1 + 1, y: b.y0 - 1 }, { x: b.x1 + 1, y: b.y1 + 1 }, { x: b.x0 - 1, y: b.y1 + 1 }]];
    }
    const bbox = emptyBBox();
    for (const p of outline[0]!) growBBox(bbox, p);
    return {
      source: { fileName, kicadVersion: 0, generator },
      thickness: st.thickness,
      layers: st.layers,
      dielectrics: st.dielectrics,
      stackupFromFile: st.fromFile,
      outline,
      bbox,
      nets: this.nets,
      tracks: this.tracks,
      vias: this.vias,
      footprints: this.footprints,
      pads: this.pads,
      zones: this.zones,
      warnings: this.warnings,
    };
  }
}

/** Height guess for a part body from its reference and package name (no 3D data in these formats). */
export function guessHeight(ref: string, pkg: string): number {
  const p = pkg.toLowerCase();
  if (/^(j|cn|con|usb|x|p)\d/i.test(ref)) return 3.5;
  if (/^(l)\d/i.test(ref) && /(\d{4})|nr|cd|smd/.test(p) && !/0402|0603|0805|1206/.test(p)) return 3;
  if (/sot-?23|sod/.test(p)) return 1.1;
  if (/0201|0402/.test(p)) return 0.35;
  if (/0603/.test(p)) return 0.5;
  if (/0805|1206/.test(p)) return 0.6;
  if (/qfn|dfn|son/.test(p)) return 0.9;
  if (/qfp|soic|so-?\d|tssop|ssop|msop/.test(p)) return 1.6;
  if (/^(c)\d/i.test(ref) && /elko|cp_|elec|radial/.test(p)) return 8;
  return 1.5;
}

/** Arc from start to end around a centre in a y-up frame (counter-clockwise unless cw). */
export function arcYUp(start: Vec2, end: Vec2, c: Vec2, cw: boolean): Vec2[] {
  const r = Math.hypot(start.x - c.x, start.y - c.y);
  if (r < 1e-9) return [start, end];
  const a0 = Math.atan2(start.y - c.y, start.x - c.x);
  const a1 = Math.atan2(end.y - c.y, end.x - c.x);
  let sweep = a1 - a0;
  if (cw) {
    while (sweep >= 0) sweep -= 2 * Math.PI;
  } else {
    while (sweep <= 0) sweep += 2 * Math.PI;
  }
  const step = Math.min(10 * DEG, Math.max(1 * DEG, 2 * Math.acos(Math.max(-1, 1 - 0.01 / r))));
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / step));
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  pts[pts.length - 1] = end;
  return pts;
}

