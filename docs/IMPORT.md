# Opening boards from other CAD tools

As of: 2026-10-05

The app was built around KiCad, but every step after loading (planes, sources, field, rules,
report) works on one internal board model (`BoardModel`, `src/model/types.ts`). The importers in
`src/import/` turn the files of other CAD tools into that model, so a board from Altium,
Allegro, PADS, Eagle or Fusion 360 gets the same analysis as a KiCad board. Everything runs in
the browser; the file does not leave the computer.

| Format | File | Comes from | What the app reads | Confidence |
|---|---|---|---|---|
| KiCad | `.kicad_pcb` (KiCad 6 to 10) | KiCad | everything: stack-up, outline, footprints, pads, tracks, arcs, vias, filled zones, 3D model references | reference |
| IPC-2581 | `.xml` / `.cvg` (revisions B and C) | Altium Designer, Cadence Allegro/OrCAD, Siemens PADS/Xpedition, Zuken CR-8000, KiCad | stack-up with εr and loss tangent, outline and cut-outs, components with their pads and nets, tracks, arcs, filled copper with holes, vias with their span, plated slots, part values from the BOM | same board as KiCad's original (checked, see below) |
| ODB++ | `.tgz`, `.tar.gz`, `.zip` or `.tar` archive of the job folder | Altium, Allegro/OrCAD, PADS/Xpedition, Zuken, KiCad, most CAM tools | layer matrix, stack-up from the attribute lists, outline (profile), tracks, arcs, pads, surfaces (filled copper with islands and holes), net of each feature, components with pins, values and nets, drill layers (pin holes, vias, span) | same board as KiCad's original, positions to 0.01 mm (the precision KiCad writes) |
| Eagle / Fusion 360 Electronics | `.brd` (XML, Eagle 6 and later) | Autodesk Eagle, Fusion 360 Electronics | layers from the layer setup, outline (Dimension and Milling layers), elements with their packages from the embedded libraries, pads and vias with the design-rule sizes, wires (also curved), polygons, supply layers, restrict areas | pads, tracks and vias identical to KiCad's own Eagle import; copper pours computed (see below) |

Not read directly: binary Eagle files from before version 6 (open and save them in Eagle 6 or
later), native Altium (`.PcbDoc`), Allegro (`.brd` binary), PADS ASCII, EasyEDA, CADSTAR and
Gerber files. For these, either export IPC-2581 or ODB++ from the tool (both carry the netlist,
which a Gerber set does not), or let KiCad convert the native file (next section).

## Native files through KiCad

KiCad 10 imports Altium Designer, CircuitMaker and CircuitStudio (`.PcbDoc`), Cadence Allegro
(`.brd`), EasyEDA Std and Pro, CADSTAR, PADS, P-CAD, Fabmaster, gEDA and SolidWorks PCB boards
(File → Import → Non-KiCad Board File). Save the result as `.kicad_pcb` and open that in the app.
The script `tools/convert/to_kicad.py` does the same from the command line with KiCad's Python
module, and fills the zones so the poured copper is there:

```bash
python3 tools/convert/to_kicad.py board.PcbDoc            # writes board.kicad_pcb
```

Use the Python that comes with KiCad (on Linux the system `python3` with the `pcbnew` module). The
conversion is KiCad's, not the app's: check the result in KiCad, especially the layer stack and
the zones. KiCad's importers can fail on some files (one of the Eagle boards used for testing
makes KiCad 10.0.6 crash while loading; the app's own Eagle importer reads it).

## How to export

| Tool | Export |
|---|---|
| Altium Designer | Fabrication outputs: IPC-2581 or ODB++. Keep the layer stack and the netlist in the output. |
| Cadence Allegro / OrCAD PCB Designer | Export IPC-2581; ODB++ goes through the ODB++ Inside (Valor) export. |
| Siemens PADS / Xpedition | IPC-2581 or ODB++ output. |
| Zuken CR-8000 | IPC-2581 or ODB++ output. |
| KiCad (for comparison) | File → Fabrication Outputs → IPC-2581 or ODB++; or `kicad-cli pcb export ipc2581` / `kicad-cli pcb export odb`. Opening the `.kicad_pcb` directly gives the same result. |
| Eagle / Fusion 360 | Save the board (`.brd`) and open it directly. Eagle 6 or later writes XML. |

Menu names differ between tools and versions; look for the format names (IPC-2581, ODB++),
which are the same everywhere. An ODB++ export usually produces a folder; pack it as `.zip` or `.tgz` (most tools
offer this directly) and open the archive.

## Opening

Drop the file on the window, use **Open board**, or link it with `?board=<URL>` (the server must
allow cross-origin reads). Live reload works as for KiCad: when the browser allows it, saving the
file again reloads the board and keeps sources, view and settings. The command-line field check
(`docs/CI-FIELD-CHECK.md`) reads the same formats.

When the file lacks something the analysis needs, the **Diagnostics** tab shows it under
**Notes on the file**, with what was assumed instead:

- no stack-up: the usual one is assumed (2 layers: 1.6 mm FR4; 4 layers: JLC04161H-7628,
  0.21 mm prepreg outside). This changes the height of every line above its plane and therefore
  the field and the far-field estimate. Check it under View → Layers;
- no outline: the rectangle around the copper;
- Eagle pours: computed, see below;
- Eagle parts whose package is missing from the file's library are left out and named.

## What each importer does

### Common rules

- Coordinates in mm with y pointing down (KiCad's convention). IPC-2581, ODB++ and Eagle use y
  up; y is negated, the picture stays the same and angles keep their sense (counter-clockwise on
  screen is positive). ODB++ rotates clockwise; its angles are negated.
- Copper layers get KiCad's names (F.Cu, In1.Cu, …, B.Cu), top to bottom, whatever the CAD tool
  called them (Top, Route2, L1, …).
- Filled copper with holes becomes keyhole rings (the holes joined to the outline with a zero-
  width bridge), the form KiCad uses for zone fills.
- Net names exported by KiCad keep KiCad's escapes (`{slash}`); they are unescaped.
- Pin functions and pin types (KiCad's `pinfunction`, `pintype`) do not exist in these formats.
  Rules that use them (the switch-node detection of regulators, decoupling of supply pins) fall
  back to net names; name your switch nodes `SW`, `LX` or `PHASE` and supplies `VCC…`, `+3V3`,
  `VIN…` to help them.
- 3D model references do not exist in these formats; the 3D view shows the parts as boxes from the
  package extents.

### IPC-2581

Layers come from `CadData/Layer` with a conductor function (CONDUCTOR, SIGNAL, PLANE, MIXED, …)
in the order of `Stackup/StackupLayer` (sequence); dielectric thickness, εr and loss tangent from
the stack-up and its `Spec` entries. The board outline is `Step/Profile` (polygon and cut-outs).
Copper comes from `LayerFeature` per layer: each `Set` carries a net; `Pad` with a `PinRef` is a
component pad (merged across layers for through-hole pins), `Line`, `Polyline` and `Arc` are
tracks (width from `LineDesc` or the dictionary), `Contour` with `Cutout` is filled copper. Pad
shapes come from the standard and user primitive dictionaries (RectCenter, RectRound, RectCham,
Oval, Circle, Octagon, Contour, …; contours count by their extent). Vias are the holes with
plating status VIA on the drill layers; their span is the drill layer's `Span`, their diameter
the padstack's pad. Plated holes and plated slots (`SlotCavity` on route layers) turn pads into
through-hole pads. Part values come from the BOM (`Characteristics/Textual` named Value). Nets of
pads without a net in their set come from `LogicalNet`.

Negative plane layers (polarity NEGATIVE, common for planes from Allegro) hold the voids, not the
copper: clearances around foreign vias and pins, split lines, moats. The importer fills the board
outline minus these voids and gives each copper island the net of the connections inside it:
pads drawn with a thermal-relief or full-contact primitive, and vias that cross the layer without
a void. A split power plane thus gets one net per region. An island without any connection keeps
the layer's most frequent plane net, else the net named like the layer (GND2 → GND), else none
(then it shows as copper without a connection, and the Diagnostics tab says so). Lettering and
frames of the artwork that lie on the copper layers outside the board are left out.

### ODB++

The job folder is found by its `matrix/matrix`. Layers with context BOARD and type SIGNAL,
POWER_GROUND or MIXED are copper, in ROW order; DIELECTRIC layers give the stack-up through their
attribute lists (`.layer_dielectric`, `.dielectric_constant`, `.loss_tangent`; copper thickness
from `.copper_weight`). Feature files are read with their symbol tables (round `r`, square `s`,
`rect` with rounded or chamfered corners, `oval`, `el`, `di`, `oct`, donuts, thermals; sizes in
microns for metric files, mils for imperial ones). Lines and arcs are tracks; surfaces are
filled copper (islands with the holes that follow them); pads at component pins become the pins'
copper. Nets come from `eda/data`: each `NET` record lists the features of the net (`FID`).
Components and their pins (toeprints, with position, rotation, side and net) come from
`layers/comp_+_top|comp_+_bot/components`, values from their `PRP Value`, body extents from the
packages in `eda/data`. Drill layers give the holes: the `.drill` attribute separates plated pin
holes, vias and non-plated holes, `START_NAME`/`END_NAME` the span. User-defined symbols (custom
pad shapes) have no standard size; they are taken as 0.5 mm; the `null` symbol is no copper.

Details that real exports need and that the importer handles:

- files compressed with Unix `compress` (`features.Z`, `data.Z`, as Genesis/InCAM and Allegro
  write them) are decompressed (LZW, `src/import/archive.ts`);
- a job archive packed inside another archive (with drawings and reports next to it) is found;
- files without a unit line are in inches (the format's default), symbol sizes then in mils;
- features marked `.nomenclature` (drawing frame, title block, lettering on the artwork) and
  features entirely outside the board are left out;
- negative layers (matrix POLARITY=NEGATIVE) are filled like negative IPC-2581 planes: board
  outline minus voids, each island with the net of the vias and pins that connect there (thermal
  relief symbols `thr…`/`ths…`, `null` pads, or no void at all).

### Eagle and Fusion 360

The copper layers are the numbers in the design rule `layerSetup` (for example `(1*16)` or
`(1+2*15+16)`). Elements are placed from their packages: rotation `R90`, mirrored `MR90` (bottom
side; as KiCad's importer reads it: rotate, then mirror in x). SMD pads keep their size and
roundness; through-hole pads without a diameter get the design-rule annular ring
(`rvPadTop` × drill, limited by `rlMinPadTop`/`rlMaxPadTop`), `long` pads the elongation
`psElongationLong`; vias likewise (`rvViaOuter`, `rlMinViaOuter`, `rlMaxViaOuter`).

Eagle stores only the outline of a polygon, not the poured copper, so the pour is computed
(`src/import/pour.ts`), the way Eagle does it, on a 0.1 mm raster:

1. the polygon outline is filled;
2. copper of other nets on the layer is cut out with the polygon's isolation (at least the
   wire-to-wire clearance `mdWireWire`): tracks as capsules, pads in their real shape, vias and
   holes as circles;
3. restrict areas (layer 41 for the top, 42 for the bottom, also inside packages) are cut out;
4. a margin of `mdCopperDimension` to the board outline is kept;
5. polygons are poured in rank order; a later polygon keeps its isolation from the earlier ones;
6. islands without a connection to a pad, via or track of the polygon's net are removed (unless
   the polygon says `orphans="yes"`);
7. the remaining copper is traced into one outline per island, with its holes.

Supply layers (layer name `$GND`) are filled completely with the named net, minus the board
margin and the anti-pads of other nets. Not modelled: thermal spokes, the polygon outline's line
width, hatched pours (treated as solid). The stack-up is not read from Eagle (its thickness
parameters are rarely set on purpose); the default is used and flagged.

## KiCad files: unfilled zones and custom pads

Two things the KiCad parser now handles that public repositories often contain:

- **Zones saved without their fill** (the board was saved before filling, or the fill was left
  out to keep the file small). The app fills them itself with the same method as the Eagle pours:
  the zone outline minus copper of other nets with the zone's clearance, keep-out areas, 0.5 mm to
  the board edge, higher priority first, islands without a connection removed (unless the zone
  keeps islands, or no island is connected at all, as KiCad does). On the test boards the result
  is within 5 % of KiCad's own fill. The Diagnostics tab notes it; filling all zones in KiCad and
  saving makes it exact.
- **Custom pad shapes** (`custom` with primitives): the pad's extent is taken from its primitives
  instead of the anchor, which is often only 0.1 mm.

## How the importers were checked

- **IPC-2581 and ODB++:** boards were exported from KiCad 10 and compared with KiCad's own file
  (`tools/scratch` scripts, and `tests/import.test.ts` for the test board `slot-clock`):
  - layers, stack-up, net names, tracks (total length), vias and outline: identical;
  - pads: every numbered pad at the same position with the same net and copper size;
  - filled zones: same area within 1 %;
  - field check: the same findings, and the same near and far field within 0.1 dB.

  The real boards checked this way were the demo board, Glasgow revC3, HackRF One and Olimex
  ESP32-POE. The only differences found were pads without a number and without a net, such as
  fiducials and paste openings, which KiCad does not export as pins, and copper drawings on
  copper layers. KiCad's own parser ignores the latter so far, while the importers count them as
  copper.
- **Exports of professional tools:** the BeagleBone Black (IPC-2581 from Cadence Allegro, 6 layers,
  86.4 × 54.6 mm as the real board), the IPC-2581 consortium's test case 10 (18 layers, seven
  negative planes) and three server boards of the Open Compute Project (ODB++ from Genesis, 4 to
  10 layers with negative and split power planes, compressed feature files). They load in 2 to 8
  seconds in the browser; the planes, nets and part counts are plausible and the split power
  planes come out with one net per region. These have no KiCad original to compare with; what
  could be checked by hand was.
- **Eagle:** three public boards (Eagle 6.3, 7.2 and 9.5) were compared with KiCad's Eagle
  importer. Pads (position, net, size), tracks, vias and outline are identical; parts KiCad
  renames because of name clashes (BTN → BTN0) aside. The computed pours match KiCad's zone fill
  of the converted board closely; small differences remain around thermal reliefs. KiCad's
  importer (Python interface of KiCad 10.0.6) aborted on one of the three boards; the app reads it. The unit tests use a hand-written
  board (`tests/fixtures/import/eagle-test.brd`) with a mirrored part, design-rule sizes, an
  orphan island, a supply layer and a restrict area.

## Limits

- Every importer reads the data that defines copper and connectivity. Silkscreen, mask, paste
  and assembly drawings are skipped.
- Blind and buried vias are read with their span (IPC-2581 drill layer `Span`, ODB++
  `START_NAME`/`END_NAME`, Eagle via `extent`).
- Arcs are turned into short straight pieces (chord error 0.01 mm), as for KiCad.
- A board that uses net-tie parts or copper drawings for connections keeps them as copper of the
  net they carry; plain copper drawings without a net become unconnected copper.
- If a file is read but looks wrong, compare it with the CAD tool's view: layer order and the
  stack-up are the most common sources of a wrong picture. Please report such files (an issue
  with the export settings helps most).
