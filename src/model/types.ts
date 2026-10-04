/**
 * Board model: everything the simulation and the renderer need from a KiCad board.
 *
 * 2D coordinates are KiCad board coordinates in mm (x right, y down). Heights are world
 * heights in mm with the centre of the F.Cu copper at y = 0 and positive upwards; see
 * docs/stufe-1/PHYSIK.md for the world frame.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export interface BBox2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type LayerKind = 'signal' | 'power' | 'mixed' | 'jumper';

export interface CopperLayer {
  name: string;
  /** Order from top (0 = F.Cu) to bottom. */
  index: number;
  /** World height of the copper centre plane, mm (F.Cu = 0, inner layers negative). */
  y: number;
  thickness: number;
  kind: LayerKind;
}

export interface Dielectric {
  /** Index of the copper layer above this dielectric. */
  above: number;
  thickness: number;
  epsilonR: number;
  lossTangent: number;
  material: string;
  /** 'core' | 'prepreg' | other names KiCad uses */
  kind: string;
}

export interface Track {
  net: number;
  layer: number;
  a: Vec2;
  b: Vec2;
  width: number;
  /** True when this segment is part of a discretised arc. */
  fromArc: boolean;
}

export interface Via {
  net: number;
  at: Vec2;
  diameter: number;
  drill: number;
  /** Copper layer indices spanned (from <= to). */
  fromLayer: number;
  toLayer: number;
}

export type PadShape = 'rect' | 'roundrect' | 'oval' | 'circle' | 'trapezoid' | 'chamfered_rect' | 'custom';
export type PadKind = 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect';

export interface Pad {
  footprint: number;
  ref: string;
  number: string;
  net: number;
  at: Vec2;
  /** Absolute orientation in degrees (KiCad convention: counter-clockwise on screen). */
  angle: number;
  shape: PadShape;
  kind: PadKind;
  size: Vec2;
  /** Copper layer indices the pad is on. */
  layers: number[];
  drill: number;
  pinFunction: string;
  pinType: string;
}

export interface OrientedBox {
  center: Vec2;
  size: Vec2;
  angle: number;
}

export interface Footprint {
  ref: string;
  value: string;
  lib: string;
  at: Vec2;
  angle: number;
  side: 'top' | 'bottom';
  /** Courtyard (or pad extent) as an oriented box, used for the component body. */
  body: OrientedBox;
  /** Estimated body height in mm (no 3D models in the browser). */
  height: number;
  pads: number[];
  /** Further symbol fields on the footprint: Datasheet, MPN, Manufacturer, Description, … */
  fields: Record<string, string>;
}

export interface Zone {
  net: number;
  layer: number;
  /** Filled polygons as KiCad stores them: outer rings with holes joined in (keyhole). */
  polygons: Vec2[][];
  /** Filled copper area in mm². */
  area: number;
}

export interface BoardSource {
  fileName: string;
  kicadVersion: number;
  generator: string;
}

export interface BoardModel {
  source: BoardSource;
  thickness: number;
  layers: CopperLayer[];
  dielectrics: Dielectric[];
  /** Whether the stack-up came from the file or from a default. */
  stackupFromFile: boolean;
  /** Closed outline rings; outline[0] is the outer contour (largest area). */
  outline: Vec2[][];
  bbox: BBox2;
  /** Net names; index 0 is the empty "no net". */
  nets: string[];
  tracks: Track[];
  vias: Via[];
  footprints: Footprint[];
  pads: Pad[];
  zones: Zone[];
  warnings: string[];
}
