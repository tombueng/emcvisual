# Stage 1: Architecture

As of: 2026-10-05. Describes the structure of the browser app, the command-line field check and
the data flow between them. Despite the folder name it covers everything that exists in `src/`,
including the later stages (return paths, electric field, full-wave exchange, scanner).
Physics: [PHYSICS.md](PHYSICS.md). Rules and their thresholds: [../RULES.md](../RULES.md).

## 1. Guidelines

1. **Computation core without DOM.** `src/kicad`, `src/model`, `src/physics`, `src/compute`,
   `src/import`, `src/fullwave` and the pure parts of `src/scanner` import neither Svelte state
   nor three.js and use no DOM. The exceptions are the worker plumbing (`compute/pool.ts`,
   `compute/field.worker.ts`, `compute/fieldlines.worker.ts`) and the hardware drivers
   (`scanner/drivers.ts`, `scanner/webserial.ts`). The same code therefore runs in Web Workers,
   in Vitest (Node environment) and in the Node command line (`src/cli`).
2. **Imperative 3D, declarative UI.** The three.js scene is one class (`Viewer`,
   `src/render/viewer.ts`) that renders on demand. The Svelte 5 components and the engine call
   its setters (`setVolume`, `setSlice`, `setFieldLines`, …). No framework in the render path.
3. **Expensive once, cheap often.** The field pattern of a source (|h|² per A² of its reference
   current) does not depend on frequency in the fast model; it is computed once per geometry in
   workers and cached. Everything spectral (band, line, waveform amplitude) only changes the
   weights of the composition, which runs on the main thread within one animation frame.
4. **No names in the code.** The project name lives in `branding.config.json` (read through
   `src/branding.ts`); `scripts/check-codename.mjs` fails on the name anywhere else except a few
   allowed files. Storage keys use `branding.storageNamespace`, file formats carry neutral
   `kind` strings (`pcb-field-*`, §3.8) ([../RENAMING.md](../RENAMING.md)).
5. **No server of its own, no telemetry.** Board files are parsed and simulated in the browser and
   never uploaded. Network requests happen only for: boards opened by URL (`?board=`, the
   example list in `src/examples.ts`), 3D models (KiCad's standard library on gitlab.com, on by
   default and requested by the model path a footprint names; GitHub repositories the user adds;
   the project folder of a board opened by URL), and the scanner's OctoPrint driver.

## 2. Directory structure

```
branding.config.json        codename, display name, tagline, repo, site URL, storage namespace
seo.config.json             title, descriptions, keywords, verification and origin-trial tokens
index.html                  entry point; static intro (#static-intro) for crawlers / no JavaScript
vite.config.ts              app build (Svelte, SEO plugin, ES module workers), Vitest settings
vite.cli.config.ts          CLI build: src/cli/main.ts -> dist/cli/field-check.mjs (Node 22)
playwright.config.ts        end-to-end tests against the dev server (port 5175, SwiftShader WebGL)
src/
  main.ts                   mounts ui/Root.svelte into #app, removes #static-intro
  branding.ts               typed access to branding.config.json
  examples.ts               EXAMPLE_BOARDS: public KiCad boards loaded from GitHub
  occt-import-js.d.ts       typing of occt-import-js (used by render/step.worker.ts)
  i18n/
    lang.svelte.ts          active language (i18n.lang), t proxy, setLang, fmtNum, LANGS
    de.ts                   German dictionary, source of truth; defines type Strings
    en.ts                   English dictionary (en: Strings)
    index.ts                re-exports
  kicad/
    sexpr.ts                S-expression reader: parseSExpr -> SList, child/children/num/str
    parseBoard.ts           parseBoard(text, fileName) -> BoardModel (KiCad 6–10), unescapeKicad
  import/                   other CAD formats -> BoardModel (being written, §3a)
    index.ts                importBoard(name, data), detectFormat, BOARD_EXTENSIONS, boardBaseName
    builder.ts              BoardBuilder, ImportError, keyhole, copperLayerNames, guessHeight, arcYUp
    xml.ts                  small XML reader (parseXml, XNode, xchild, xchildren, xfind, xnum)
    ipc2581.ts              IPC-2581 importer (parseIpc2581)
    eagle.ts                Eagle importer (parseEagle, .brd XML)
    pour.ts                 pourFill: polygon pours computed on a raster (for Eagle)
    odb.ts                  ODB++ importer (parseOdbArchive, parseOdb)
    archive.ts              unpack: .zip, .tgz, .tar with DecompressionStream; ArchiveError
  model/
    types.ts                BoardModel, CopperLayer, Dielectric, Track, Via, Pad, Footprint, Zone
    geometry.ts             vectors, rotateKicad, polygons, arcs, Bézier, chainRings, padOutline
    stackup.ts              buildStackup (world heights, dielectrics, defaults), sortCopperNames
    world.ts                WorldFrame, worldFrame, toWorld, toBoard
    planes.ts               detectPlanes, rasterize, covered, coveredNear, referenceCopper, netAt
    connectivity.ts         buildNetGraph, shortestTree, pathTo, insidePad
    pickIndex.ts            PickIndex: copper under a board point (hover, pad picking)
  physics/
    units.ts                constants, dB helpers, parseEng/formatEng, capacitor/resistor values
    spectrum.ts             Waveform, Line, BANDS, trapezoidLines, triangleLines, mapLines
    lines.ts                microstrip, stripline, unreferenced: Z0, εeff, C', L'
    sources.ts              Source union (signal, diffpair, loop, inductor), STRAY_TURNS
    currents.ts             buildSource: Source -> SourceModel (current elements + spectrum)
    returnPaths.ts          stage 2a: applyReturnModel (detours around gaps, plane transfers)
    images.ts               packWithImages, packCharges: ElementPack with mirror images, slots
    biotsavart.ts           addElementsField, fieldAt, slotMaskTable
    charges.ts              stage 2b: buildCharges (charges per volt for the E field)
    efield.ts               stage 2b: addChargesField, eFieldAt
    farfield.ts             dipoleMoment, farMoment, farField, limitAt, dipoleCompensated
    standards.ts            STANDARDS (CISPR 32/11/14, FCC 15), limitsFor, specDistance
    attribution.ts          attributeSource, rankFindings, solidPlanes, MAX_GAIN_DB
    commonMode.ts           cable common-mode estimate, cableConnectors, SUPPLY_NET
    ioCoupling.ts           crosstalk into I/O lines that leave on cables
    supplyNoise.ts          switching current on the supply cable (K-34)
    filterParts.ts          ferrite and inductor values from reference, library and value
    diagnostics.ts          Diagnostic, DiagnosticKind, diagnoseSource, referencePlane
    layoutRules.ts          board rules without a field source: layoutRules
    severity.ts             findingSeverity, sourceSeverity, severityColor
    suggest.ts              suggestSources: sources from net names, pin functions, pin types
  compute/
    grid.ts                 Grid, makeGrid, coverColumns, QUALITY_SPACING
    fieldKernel.ts          computeBlock: |h|² (or |e|²) on a block of z rows (pure)
    field.worker.ts         worker around computeBlock (job / block / drop messages)
    pool.ts                 FieldPool: worker pool, block queue, progress, cancellation
    composer.ts             selectionWeight, compose: Σ w_s·|h_s|² -> dB -> Uint8 volume
    fieldlines.ts           traceFieldLines (RK4 on the exact field), seedsFor
    fieldlines.worker.ts    worker around traceFieldLines
  render/
    viewer.ts               Viewer: scene, camera, controls, passes, overlays, VR, ant view
    volumeShader.ts         GLSL of the full-screen volume composite and of the slice plane
    boardMesh.ts            buildBoardMeshes: substrate, copper per layer, vias, part boxes
    colormaps.ts            inferno / turbo as polynomial fits, colormapLut, cssColor
    isosurface.ts           surfaceNets, buildIsosurfaces (shells at dB levels; used in VR)
    fieldLinesMesh.ts       buildFieldLines: line segments with a travelling pulse
    focusScene.ts           buildFocusScene: geometry of the problem view (§7c)
    worldCallouts.ts        WorldCallouts: speech bubbles inside the scene (HTML-in-Canvas)
    componentModels.ts      parts from a KiCad GLB export (loadComponentModels)
    modelLibrary.ts         ModelLibrary, buildLibraryModels: models from folders, GitHub, KiCad
    modelPlacement.ts       modelMatrix, unitScale: placement like KiCad's 3D viewer
    step.worker.ts          STEP -> triangles with OpenCascade (occt-import-js, WebAssembly)
  audio/
    sonifier.ts             Sonifier: Web Audio voices per source, Geiger mode
  state/
    app.svelte.ts           AppState (Svelte runes): reactive application state
    engine.svelte.ts        Engine: board, models, volume jobs, composition, probe, far field
    scenario.ts             Scenario, ViewSettings, migrateScenario, hashText, partsInfoOf
    persist.ts              loadLocal/saveLocal (try/catch), downloadText, pickFile
    liveFile.svelte.ts      follows a board file opened with a handle and reloads on save
    scanner.svelte.ts       scanner controller: devices, registration, scans, display, fit
  report/
    texts.ts                shared wording and ranking: diagnosticText, rankedDiagnostics, …
    explain.ts              explain(d): detailed explanation of a finding
    report.ts               buildReport: self-contained HTML report
  ai/
    request.ts              buildAiRequest: export for an external AI agent (parts data)
  cli/
    fieldCheck.ts           runCheck, compareChecks (pure)
    main.ts                 Node entry point (arguments, table, baseline, exit code)
  fullwave/
    job.ts                  stage 3: buildJob -> FullwaveJob for tools/openems/run_job.py
    result.ts               stage 3: parseFullwave, resampleBlocks, frequencyWeights, sampleAt
  scanner/
    types.ts                Positioner, Receiver, Sweep, Measurement, MEASUREMENT_KIND
    registration.ts         board <-> printer (2D Kabsch, optionally mirrored)
    plan.ts                 makePlan: raster, serpentine, lifting over tall parts
    runner.ts               runScan: move, settle, sweep with max hold, abort
    probe.ts                H loop / E stub <-> dBm
    measurement.ts          background subtraction, field strength, slices, JSON
    fit.ts                  nnls, fitSources: source factors from a measurement (stage 5)
    virtual.ts              VirtualPositioner, VirtualReceiver (measure the simulation)
    drivers.ts              OctoPrint REST, G-code over Web Serial, tinySA
    webserial.ts            minimal Web Serial typing, SerialText
  ui/
    Root.svelte             remounts App on a language change ({#key i18n.lang})
    App.svelte              layout, loading, pointer, sound, effects that tie state to the viewer
    SourcesPanel.svelte     source list, add menu, suggestions; SourceEditor.svelte
    EngInput.svelte, NetInput.svelte   inputs for engineering values and nets/pads
    ViewPanel.svelte        right panel with tabs View / Diagnose / Scan
    DiagnosticsPanel.svelte findings, action plan, far-field margins, standard, report, AI export
    ScannerPanel.svelte     scanner UI
    SpectrumPanel.svelte    spectrum at the probe or at 3 / 10 m, probe and sound settings
    Callouts.svelte, calloutData.ts    speech bubbles over the canvas (§7c)
    FocusPanel.svelte, FocusLabels.svelte, focusData.ts, focusField.ts   problem view (§7c)
    spectrumSvg.ts          miniSpectrumSvg: small far-field spectrum as SVG markup
    global.css              theme, fonts (IBM Plex via @fontsource, bundled)
public/                     demo board (.kicad_pcb, GLB, scenarios de and en), icons, og-image
tools/
  demo-board/               gen_demo_board.py (pcbnew), export_reference.py (reference JSON)
  emc-cases/                gen_cases.py: bad board and good twin per known EMC mistake
  openems/                  run_job.py (stage 3) and README with setup instructions
  fullwave/                 validate-loop.ts: fast far field against openEMS
  survey/                   survey.ts, redkinds.ts: findings per rule on real boards
  seo/                      make_images.py: og-image.png, apple-touch-icon.png
  vite/                     seo.ts: Vite plugin for head tags, robots.txt, sitemap, llms.txt
tests/                      Vitest (Node); fixtures/ (pcbnew references, emc-cases, STEP box)
e2e/                        Playwright smoke tests; fixtures.ts serves a STEP box offline
scripts/                    check-codename.mjs, rename.mjs
docs/                       plans, physics, architecture, rules, roadmap, research
```

## 3. Data model

### 3.1 Board (`src/model/types.ts`)

2D coordinates are KiCad board coordinates in mm (x right, y down). Heights are world heights in
mm with the centre of the F.Cu copper at 0, positive upwards. Every importer produces the same
model, so physics, rules and renderer do not know where a board came from.

```ts
interface BoardModel {
  source: { fileName: string; kicadVersion: number; generator: string }; // kicadVersion 0 for imports
  thickness: number;                 // mm
  layers: CopperLayer[];             // top (index 0 = F.Cu) to bottom
  dielectrics: Dielectric[];         // between copper layers: above, thickness, epsilonR, lossTangent
  stackupFromFile: boolean;          // false: default stack-up (warning 'stackup-default')
  outline: Vec2[][];                 // closed rings; outline[0] = outer contour (largest area)
  bbox: BBox2;
  nets: string[];                    // index 0 = "" (no net)
  tracks: Track[];                   // straight segments; arcs discretised (fromArc = true)
  vias: Via[];                       // fromLayer..toLayer (copper indices)
  footprints: Footprint[];           // ref, value, lib, side, body (oriented box), height,
                                     // pads (indices), fields (MPN, Datasheet, …), models (3D paths)
  pads: Pad[];                       // footprint index, ref, number, net, at, angle, shape, kind,
                                     // size, layers, drill, pinFunction, pinType
  zones: Zone[];                     // filled copper per net and layer: keyhole polygons, area (mm²)
  warnings: string[];                // e.g. 'stackup-default', 'outline-open:n', 'unknown-net:x'
}
interface CopperLayer { name: string; index: number; y: number; thickness: number;
                        kind: 'signal' | 'power' | 'mixed' | 'jumper' }
```

The world frame (`src/model/world.ts`) used by physics and rendering is right-handed (three.js
convention): X = x − ox, Y = height, Z = y − oy, with (ox, oy) the centre of `board.bbox`
(`worldFrame`, `toWorld`, `toBoard`).

### 3.2 Reference planes (`src/model/planes.ts`)

```ts
interface PlaneLayer {
  layer: number;          // copper layer index
  net: number;            // the net that names the plane
  y: number;              // world height, mm
  coverage: number;       // share of the board area covered by that net
  raster: CoverageRaster; // { x0, y0, cell, nx, ny, data: Uint8Array }, cell 0.1–0.25 mm
  override: boolean;      // set by the user (planeOverrides) rather than detected
  nets?: Int32Array;      // split layers: net per raster cell
}
```

`detectPlanes(board, overrides, threshold = 0.15, splitShare = 0.05)` makes a layer a plane when
one net's zones cover at least 15 % of the board area; other nets with at least 5 % on the same
layer join the coverage raster (split planes). Holes up to `HOLE_EXTENT` = 2.5 mm (anti-pads)
are filled (`fillSmallHoles`). Overrides by layer name force a net (`"In2.Cu": "+3V3"`) or
remove a plane (`null`).

### 3.3 Sources (`src/physics/sources.ts`)

```ts
type Source = SignalSource | DiffPairSource | LoopSource | InductorSource;
// common: id, name, enabled, color
SignalSource   { type: 'signal'; kind: 'clock' | 'data'; nets: string[]; driver: string;
                 waveform: Waveform; load: LoadModel }
DiffPairSource { type: 'diffpair'; kind; netP; netN; driverP; driverN; waveform; load; imbalance }
LoopSource     { type: 'loop'; pads: string[]; waveform; node?: { net: string; voltage: number } }
InductorSource { type: 'inductor'; ref: string; shielding: 'open' | 'semi' | 'shielded'; waveform }
Waveform       { f0; duty; tr; amplitude }       // amplitude: V (signals) or A (loops, ripple)
LoadModel      = { model: 'capacitive'; cLoad } | { model: 'terminated'; z0; endPad }
```

### 3.4 Source model (`src/physics/currents.ts`)

```ts
interface SourceModel {
  id: string;
  elements: CurrentElement[]; // straight filaments, weights relative to the reference current
  lines: Line[];              // reference current spectrum, A RMS ({ f, amp, single? })
  info: SourceInfo;           // lengthMm, cTotal, z0, eeff, fShort (λ/10), driver, warnings,
                              // loopArea (loops), series resistors, trEff
  centre: Vec3;               // weighted centre (placing the sound)
  farMoment?: Vec3;           // set by the engine: dipole moment per A (farfield.ts)
  charges?: ChargeElement[];  // set by the engine: charges per volt (stage 2b)
  vLines?: Line[];            // set by the engine: voltage spectrum for the E field
}
interface CurrentElement {
  a: Vec3; b: Vec3; w: number; r: number;   // ends (world mm), weight, core radius
  vertical: boolean; layer: number; net: number;
  tag?: 'via' | 'return'; noImage?: boolean; slotY?: number; imagePlane?: number; // stage 2
}
```

### 3.5 Element pack (`src/physics/images.ts`)

```ts
interface ElementPack {
  data: Float64Array;     // STRIDE = 8 per element: ax, ay, az, bx, by, bz, weight, core radius
  slotStart: Int32Array;  // elements of slot s: slotStart[s] .. slotStart[s+1]
  planeY: Float64Array;   // plane heights, top to bottom
  count: number;
}
```

Planes split the height into slots (slot = number of planes above). Mirror images are generated
while packing, so the kernel has no special cases. The same layout holds charges for the E field
(weight = charge per volt; a point charge has a = b).

### 3.6 Findings (`src/physics/diagnostics.ts`)

```ts
interface Diagnostic {
  kind: DiagnosticKind;   // 'return-gap' | 'ref-change' | … (§4b)
  sourceId: string;       // '' for board rules
  at: Vec2;               // board mm
  layer: string; plane: string; planeNet: string; otherNet?: string;
  value: number;          // meaning per kind: gap length, resonance, loop area, distance, …
  gain?: { db: number; scope: 'finding' | 'source'; alone?: number }; // far-field effect (attribution.ts)
  detour?: { length: number; extraArea: number; via?: string };      // stage 2 return path
  // kind-specific details: run, split, cm, io, parts, nets, dims, decoupling, crystal, sw, skew,
  // pins, bypass, esd, supply, copper
}
```

### 3.7 Scenario (`src/state/scenario.ts`, file `*.scenario.json`)

```jsonc
{
  "kind": "pcb-field-scenario", "version": 1,
  "board": { "fileName": "demo-board.kicad_pcb", "hash": "…" },   // hashText / hashBytes: 12 bytes of SHA-256, hex
  "settings": { "quality": "normal", "fMax": 1e9, "planeOverrides": { "In2.Cu": "+3V3" },
                "returnModel": "detour", "standard": "cispr32-b" },
  "sources": [
    { "id": "buck-good", "type": "loop", "name": "Buck, tight loop (U1)", "enabled": true,
      "color": "#38bdf8", "pads": ["C1.1", "U1.1", "U1.2", "C1.2"],
      "waveform": { "f0": 5e5, "duty": 0.28, "tr": 5e-9, "amplitude": 2 },
      "node": { "net": "SW1", "voltage": 12 } },
    { "id": "clk-good", "type": "signal", "kind": "clock", "name": "Clock 25 MHz, short",
      "nets": ["CLK_GOOD_SRC", "CLK_GOOD"], "driver": "Y1.3",
      "waveform": { "f0": 25e6, "duty": 0.5, "tr": 1e-9, "amplitude": 3.3 },
      "load": { "model": "capacitive", "cLoad": 5e-12 }, … },
    { "id": "usb", "type": "diffpair", "netP": "USB_DP", "netN": "USB_DN", "imbalance": 0.05, … },
    { "id": "ind-bad", "type": "inductor", "ref": "L3", "shielding": "open",
      "waveform": { "f0": 5e5, "duty": 0.28, "tr": 0, "amplitude": 0.6 }, … }
  ],
  "view": { "mode": "band", "bandId": "cispr-low", "lineF": 0, "autoWindow": true,
            "dbLow": 60, "dbHigh": 120, "density": 0.5, "colormap": "inferno",
            "showVolume": true, "showIso": false, "showSlice": false, "sliceHeight": 2,
            "fieldKind": "H", "callouts": { … }, … },
  // optional, usually filled in by an AI agent (docs/AI-PARTS-MANUAL.md):
  "parts": [{ "ref": "C1", "c": 1e-5, "esr": 0.005, "esl": 1e-9 }],
  "provenance": { "buck-good/waveform.tr": { "basis": "datasheet", "source": "…" } },
  "missing": [{ "ref": "U3", "needed": ["waveform.tr of source buck-bad"], "assumed": "…" }],
  "notes": "…"
}
```

`migrateScenario(raw)` checks `kind` and `version` (1 to `SCENARIO_VERSION` = 1) and fills
missing settings and view fields from `DEFAULT_SETTINGS` and `DEFAULT_VIEW`; `partsInfoOf`
drops malformed parts data.

### 3.8 File formats

| `kind` | Produced by | Read by |
|---|---|---|
| `pcb-field-scenario` v1 | `Engine.scenario()` | `Engine.applyScenario`, `loadBoard`, CLI |
| `pcb-field-ai-request` v1 | `buildAiRequest` (`src/ai/request.ts`) | an external AI agent |
| `pcb-field-check` v1 | `runCheck` (`src/cli/fieldCheck.ts`) | `compareChecks` (baseline) |
| `pcb-field-fullwave-job` v1 | `buildJob` (`src/fullwave/job.ts`) | `tools/openems/run_job.py` |
| `pcb-field-fullwave-result` (binary `PCBFW1`) | `run_job.py` | `parseFullwave` (`src/fullwave/result.ts`) |
| `pcb-field-measurement` v1 | scanner (`measurementToJson`) | `measurementFromJson` |

Further exports without a `kind`: slice CSV (`Engine.sliceCsv`), spectrum CSV
(`Engine.spectrumCsv`), PNG snapshot (`Viewer.snapshot`), HTML report (`buildReport`).

## 3a. Loading a board; other CAD formats

**Entry points** (all in `src/ui/App.svelte` unless noted): file dialog (`openDialog`, with a
File System Access handle where the browser has one; the fallback input accepts
`BOARD_EXTENSIONS`, `.json` and `.glb`), drag and drop (`onDrop`: board files first, then GLB
models, then everything else), the demo (`loadDemo`: board, scenario in the UI language and
`demo-board.glb`), `?board=<URL>[&models=<GLB URL>]` and `?demo` (`openFromQuery`,
`openBoardUrl`), the example list (`openExample`), and the live file coupling
(`state/liveFile.svelte.ts`), which polls a followed board file every second and reloads it with
`keep = true` when the CAD program saves it. Dropped or opened files are routed by name
(`openBoardFile`): `.glb/.gltf` → `Engine.loadModels`, `.fullwave.bin` → `Engine.loadFullwave`,
`.json` → `Engine.applyScenario`, everything else → `Engine.loadBoard`, a `.kicad_pcb` as text,
any other file as bytes. `ImportError` and `ArchiveError` messages are shown in a toast
(`t.errors.importFailed`). Export file names are derived with `boardBaseName`.

**`Engine.loadBoard(source, fileName, scenario?, keep = false, models = null)`**
(`src/state/engine.svelte.ts`; `source` is a string or an `ArrayBuffer`):

1. With `keep` (same file saved again) the current scenario is taken over: sources, settings,
   view, camera and component models stay, only the geometry is new.
2. Text that starts with `(kicad_pcb` goes to `parseBoard`, anything else to `importBoard`. The
   board hash is `hashText` for text and `hashBytes` for bytes (both: the first 12 bytes of
   SHA-256 as hex). Running jobs are cancelled, volumes and packs cleared.
3. `PickIndex` is built, layer visibility reset (kept with `keep`), `worldFrame(board)`
   computed.
4. Scenario: the given one, else `loadLocal('scenario:<hash>')`, migrated; sources, plane
   overrides, quality, fMax, return model, standard, view and parts information go into `app`.
5. `preparePlanes()`: `detectPlanes`, `makeGrid`, `coverColumns`, the `PhysicsContext`
   `{ board, frame, planes, fMax }`, and the full-wave blocks resampled onto the new grid.
6. `viewer.setBoard`, component models (`placeModels`: the GLB export first, then the model
   library for the remaining parts), `refreshAll()` (§4).

**KiCad parser** (`src/kicad/`): `parseSExpr` keeps unknown nodes, so new KiCad versions parse;
`parseBoard` reads copper layers (with user aliases), the stack-up (`buildStackup`, default when
absent), nets (numbered and by name, KiCad escapes undone), tracks and arcs, vias, footprints
with pads, fields and 3D model references, zones with their filled polygons, and the outline
(`chainRings`).

**Other formats** (`src/import/`; what each importer reads, approximates and how it was checked
is in [../IMPORT.md](../IMPORT.md), and in the importers' header comments). `importBoard(name, data)` in `index.ts` first checks
bytes for archive magic numbers (gzip, zip, or `ustar` at offset 257) and hands archives to the
ODB++ importer (`parseOdbArchive`, loaded on demand); otherwise it decodes the text and
recognises the format by content (`detectFormat`; the name only breaks ties): `(kicad_pcb` →
`parseBoard`; `<IPC-2581` → `parseIpc2581`; `<eagle` → `parseEagle` (loaded on demand). A
binary Eagle file (before version 6) gets an explanatory `ImportError`. `BOARD_EXTENSIONS`
(`.kicad_pcb`, `.brd`, `.xml`, `.cvg`, `.tgz`, `.zip`, `.tar`, `.gz`) and `isBoardFileName`
decide which files the dialog, the drop handler and the live coupling treat as boards.

- `builder.ts`: `BoardBuilder` collects nets (`net(name)`, KiCad escapes undone), tracks,
  vias, pads, footprints, zones (`zone(net, layer, outer, holes)`, merged per net and layer as
  keyhole rings) and outline edges, and `finish(fileName, generator, stack)` turns them into a
  `BoardModel`: KiCad-style layer names (`copperLayerNames`: F.Cu, In1.Cu, …, B.Cu), y pointing
  down, the stack-up via `buildStackup`, the outline via `chainRings` (fallback: copper bounding
  box plus 1 mm, warning `outline-missing`). `guessHeight(ref, pkg)` estimates body heights,
  `arcYUp` discretises arcs given in a y-up frame. `source.kicadVersion` is 0 for imports.
- `xml.ts`: an XML reader that works the same in the browser and in Node (no DOMParser);
  namespace prefixes are dropped.
- `ipc2581.ts`: IPC-2581 revisions B and C: layers in stack-up order with dielectrics,
  outline and cut-outs, components and packages with pads, nets from layer features and
  `LogicalNet`, tracks, filled copper with cut-outs, vias from the drill layers, values from the
  BOM; y-up coordinates become y-down.
- `eagle.ts`: Eagle 6+ and Fusion 360 Electronics `.brd` (XML): copper layers from the layer
  setup, outline from the Dimension and Milling layers, elements with packages from the embedded
  libraries, wires, vias, polygons and supply layers; the stack-up is not read (default,
  flagged). Eagle stores only the outline of a pour, so `pour.ts` (`pourFill`) computes the
  poured copper on a raster: outline minus other nets' copper with clearance (pads in their real
  shape), minus restrict areas (layers 41/42) and the edge margin, in rank order, unconnected
  islands removed; each island is traced into an outline with its holes.
- `odb.ts`: ODB++ importer (`parseOdbArchive`, `parseOdb` on a map of files): the layer matrix
  in physical order (copper, dielectric, drill spans), the first step's profile (outline),
  features per layer (lines, arcs, pads, surfaces with their symbols and attributes), nets and
  feature-to-net assignment from `eda/data`, components with their pins from
  `comp_+_top` / `comp_+_bot`, plated holes and vias from the drill layers; y-up becomes y-down,
  ODB++'s clockwise rotation becomes KiCad's counter-clockwise one.
- `archive.ts`: `unpack(buf)` for `.zip`, `.tgz`/`.tar.gz` and `.tar` with the
  `DecompressionStream` the browser and Node provide (no library); `ArchiveError`.

The command-line check uses the same split (§12); the live coupling reloads a followed
`.kicad_pcb` as text and any other board file as bytes, like the first load.

## 4. Computation pipeline

### 4.1 Overview

```
board file ─► parseBoard | importBoard ─► BoardModel
BoardModel ─► detectPlanes(board, overrides) ─► PlaneLayer[]           ┐ preparePlanes():
           ─► makeGrid(board, frame, { quality }) ─► Grid               │ per board, plane
           ─► coverColumns(grid, planes, frame) ─► Uint32Array cover    ┘ override, quality
Source ─► buildSource(ctx, src) ─► SourceModel { elements, lines, info, centre }
       ─► applyReturnModel(ctx, src, elements) ─► { elements, detours }     (return model 'detour')
       ─► attributeSource(...) ─► SourceAttribution, Detour.gainDb/aloneDb
       ─► farMoment(elements, planes, frame) ─► model.farMoment
       ─► buildCharges(ctx, src) ─► model.charges;  trapezoidLines(voltage) ─► model.vLines
       ─► packWithImages(elements, planes, frame) ─► ElementPack (H)
          packCharges(charges, planes, frame)    ─► ElementPack (E)
       ─► FieldPool.computeVolume(pack, grid, cover, onProgress, kind) ─► Float32Array |h|² per A²
Selection ─► selectionWeight(lines, sel) per source ─► compose(volumes, weights, n)
          ─► Composite { bytes: Uint8Array, maxDb, minDb, power } ─► Viewer.setVolume(bytes, grid)
```

Orchestration lives in `Engine` (`src/state/engine.svelte.ts`, singleton `engine`). It keeps the
large typed arrays (packs, volumes, composite, cover columns) outside the reactive state and
publishes only small results into `app` (§8). All steps up to the pack run synchronously on the
main thread; volume jobs and field lines run in workers.

### 4.2 Planes, grid and coverage

- `makeGrid` (`src/compute/grid.ts`): spacing by quality (`preview` 2 mm, `normal` 1 mm,
  `fine` 0.5 mm), 6 mm around the outline, 12 mm above F.Cu, 6 mm below the bottom copper
  (`DEFAULT_GRID`); the spacing grows by 15 % steps until the grid has at most 1.5 million points.
  Sample index = ix + nx·(iy + ny·iz), the layout of a three.js `Data3DTexture`; y is the height.
- `coverColumns`: per grid column (ix, iz) a bit mask, bit i set when plane i (sorted top to
  bottom) has copper there (`covered`). This limits the kernel to 32 planes.

### 4.3 Source models (`buildSource`)

`buildSource(ctx, src)` dispatches by type; errors are `SourceError` with message keys
(`not-routed`, `no-pads`, `pad-not-found:U1.3`, `part-not-found:L1`, …) that the UI translates.

- **signal** (`signalModel` → `netCurrents` → `netTerminals`): `buildNetGraph(board, nets, true)`
  builds the copper graph of the source's nets (nodes per layer; edges for tracks, pad copper,
  vias, through-hole barrels, zones and bridges over two-pin parts between the nets); the driver
  is the given pad or `detectDriver` (pin types); `shortestTree` from the driver; one load per
  receiver pin. Capacitive load: line capacitance (`lineParams`: microstrip or stripline from the
  reference plane, `unreferenced` without one) plus `cLoad` per receiver, summed down the tree;
  every tree edge carries the share of the capacitance behind it, and every node with capacitance
  gets a vertical displacement current to its return height (`returnHeight`). Spectrum:
  `trapezoidLines` of the voltage (rise time lengthened by series resistors, `seriesRiseTime`)
  times 2πf·C_total. Terminated load: constant current from driver to the termination pad,
  spectrum = voltage / Z0. Without any plane the return runs through the ground copper
  (`GroundReturn`).
- **diffpair**: two `netCurrents`, the N side weighted −(1 − ε).
- **loop**: consecutive pads joined through each net's graph (`buildNetGraph(board, [net],
  false)`, `pathTo`); pads of the same part are joined directly; path pieces inside the net's own
  plane are left out (the mirror images represent them); `info.loopArea` is the vector area
  ½∮ r × dl; spectrum `trapezoidLines` in amperes.
- **inductor**: a horizontal ring of 16 elements in the part body (radius 0.35 × the smaller
  body side) with weight `STRAY_TURNS[shielding]` (12 / 4 / 0.8); spectrum `triangleLines`
  (ripple current).

`Engine.buildModel(s)` then applies the return model (§4a), stores the attribution and detours,
sets `farMoment`, `charges` (`buildCharges`) and `vLines` (the waveform's voltage; for loops the
switching node voltage, none for inductors).

### 4.4 Packing with mirror images (`packWithImages`)

- Horizontal elements are sampled every 0.1 mm; for each sample the nearest plane above and
  below with copper there (`referenceCopper`) is looked up; runs with the same planes are merged,
  runs shorter than 0.2 mm take their neighbour's key (via anti-pads). Each run gets images with
  weight −w·share at the mirror depth 2·y_plane − y; with planes on both sides the share is
  proportional to 1/h.
- Vertical elements are cut at plane heights so each piece lies in one slot; each piece gets an
  image in the nearest covering plane above and below with weight −w (the end points are
  mirrored, so normal currents keep their direction).
- Elements with `noImage` (stage 2 return paths) are packed without images; connectors on the
  image side take the slot of their signal (`slotY`).
- Option `imageAt: 'plane'` puts the image currents into the plane itself instead of the mirror
  depth; `farMoment` uses it for the dipole moment (§4.9).
- Finally the elements are sorted by slot (`finishPack`).

`packCharges` does the same for charges: line charges in pieces of at most 1 mm, mirror charges
−q in the nearest plane above and below with copper.

### 4.5 Volume jobs and workers

`Engine.ensureKind(s, model, kind)` builds the pack and starts a job unless the cached volume or
a running job already has the same key:

```
key  = `${geometryKey(s)}|${quality}|${returnModel}|${kind}`   // geometryKey: nets, driver, load,
vkey = `${sourceId}|${kind}`                                   // pads, node net, ref, shielding …
```

The waveform is not part of the key: editing f0, duty, rise time or amplitude rebuilds the source
model and the diagnostics on the main thread but starts no volume job; only the composition
weights change.

`FieldPool` (`src/compute/pool.ts`) starts max(1, min(16, hardwareConcurrency − 1)) module
workers. `computeVolume(pack, grid, cover, onProgress, kind)` splits the job into blocks of z
rows of roughly 50,000 points that idle workers pull one after another:

```
→ { type: 'job',   job, pack, grid, cover, kind }   (to every worker, once per job)
→ { type: 'block', job, iz0, iz1 }                   (one block to one idle worker)
→ { type: 'drop',  job }                             (job finished or cancelled)
← { type: 'block', job, iz0, iz1, data: Float32Array | null }   (data transferred)
```

Progress is the share of finished blocks. `cancel()` removes the job, broadcasts `drop` and
rejects with `CancelledError`; a worker asked for a block of a dropped job answers with
`data: null`, so the pool frees it. There is no shared memory.

### 4.6 Kernel and shielding

`computeBlock(pack, grid, cover, iz0, iz1, onRow?, kind)` (`src/compute/fieldKernel.ts`) calls
`fieldAt` (Biot-Savart, Hanson & Hirshman closed form with core regularisation) or `eFieldAt`
(Coulomb for line and point charges) at every sample and stores |h|² (A/m per A, squared) or
|e|² (V/m per V, squared).

Shielding: `slotMaskTable(planes)` holds, for each pair of slots, the bit mask of the planes
between them. For a point, its own slot `ps` is determined first; the elements of slot `s` are
skipped when `coverBits & masks[s·slots + ps]` is not zero, i.e. when a plane between the two
slots has copper in the point's column.

### 4.7 Composition, hotspots, line ranking

`queueRecompose()` schedules `recompose()` once per animation frame. For each enabled source with
a model and a finished volume of the active field kind: weight = `selectionWeight(lines, sel)`
(Σ amp² over the selection; for a single line the receiver amplitude `lineAmp`), with
`Selection` = all | band [f0, f1) | line f taken from `app.view` (`selectionFromView`, bands
from `BANDS`). `compose` sums w·|h|² into `power`, takes maxDb = 10·log10(max) + 120 (dBµA/m or
dBµV/m) and writes bytes as normalised dB over [maxDb − 100 dB, maxDb] (`TEXTURE_RANGE_DB`). With
`autoWindow` the view window becomes [maxDb − 60, maxDb]. The display window itself is passed to
the shader as a uniform, so changing it does not re-upload the texture.

`findHotspots`: local maxima of the composite in the horizontal slice at the probe height (radius
max(2, 3 mm / dx) cells, at most 50 dB below the maximum), the dominating source per spot, nets
within 2 mm and parts nearby; at most two per source and eight in total (`app.hotspots`, drawn as
markers). `lineRanking`: per spectral line the peak over the volume (amp² × max |h|²), the 60
strongest go to `app.lines` for the line picker.

With a full-wave result active (§13) the H volume of each simulated source is
`fullwaveVolume(blocks, frequencyWeights(freqs, lines, sel), n)` instead; sources openEMS did not
simulate stay on the fast model.

### 4.8 Probe readout

`Engine.readoutAt(x, height, z, asVoltage)` evaluates the field exactly at one point (no grid):
cover bits of the point's column, then `fieldAt` / `eFieldAt` with the source's pack, component
|H|, Hx, Hy or Hz. Per line: dB = 20·log10(lineAmp·|h|) + 120; with `asVoltage` the loop probe's
open-circuit voltage 2πf·µ0·πr²·H (dBµV). Result `ProbeReadout { sources[], total[], unit }`
(unit dBµA/m, dBµV or dBµV/m). `probeReadout()` uses the probe in `app.probe`;
`fieldLinesAt(bx, by, height)` serves the virtual scanner. With a full-wave result the values come
from `sampleAt` and `valueAtFrequency` (trilinear, interpolated in log f).

### 4.9 Far field

`Engine.farReadout(3 | 10)`: per enabled source the moment `model.farMoment` (fallback
`dipoleMoment(pack)`); `dipoleCompensated(loopArea, moment)` marks flat loops over a solid plane
whose model moment is below a tenth of their area (no number shown); otherwise
`farField(moment, lines, r)`: E = 2·K_DIPOLE·f²·|m|·I/r per line, with the induction term
√(1 + 1/(kr)²) and the factor 2 for the ground reflection. Limits: `limitsFor(app.standard, r)`
(`src/physics/standards.ts`; distances a standard does not tabulate are converted with 20 dB per
decade). With a full-wave result: `farE3mPerA` per dumped frequency × line amplitude × 3/r.

### 4.10 Field lines

`Engine.updateFieldLines()` (selected source, when `showFieldLines` is on) posts a
`LineTraceInput` to a lazily created `fieldlines.worker.ts`; stale answers are dropped by job
number. `traceFieldLines` integrates the normalised field direction with RK4 (step 0.2 mm, up to
900 steps each way), with the same plane shielding as the kernel, and stops outside the grid box,
below 10⁻³ of the seed's field, or when the line closes. Seeds (`seedsFor`): the six strongest
real horizontal elements at least 3 mm apart, at 0.35, 0.9, 1.8 and 3.5 mm above them.
`buildFieldLines` turns the result into line segments with a travelling pulse.

### 4.11 Electric field (stage 2b)

`buildCharges` places charges per volt on the source's copper: tracks as line charges C'·L,
outer-layer pads as point charges ε0·εr·A/h over their reference plane, zones of the net as point
charges spread over their area; nets weighted +1, or −(1 − ε) for the N side of a pair; for loops
the switching node's net (`node.net`), none for inductors. `ePacks` are built in
`ensureVolume`; E volumes are computed only while the view shows the E field (`setFieldKind`).
The spectrum is `model.vLines`.

### 4.12 What triggers what

| Change | Engine call | Recomputed |
|---|---|---|
| quality, plane override | `setQuality`, `setPlaneOverride` → `rebuildEverything` | planes, grid, cover, all models, all volumes |
| fMax | `setFMax` → `refreshAll` | all models and spectra; volumes only where the key changed |
| return model | `setReturnModel` → `refreshAll` | all models; volumes (the key contains the model) |
| one source edited | `sourceChanged(id)` | that model, its volume if the geometry key changed, diagnostics |
| sources added / removed | `addSource`, `addSources`, `removeSource` | as above |
| field kind | `setFieldKind` | E volumes on demand, composition, field lines |
| frequency selection, window, colours | `recompose` / `queueRecompose`, `applyViewToViewer` | composition / shader uniforms only |
| probe moved | effect in `App.svelte` → `probeReadout()` | readout at one point |

## 4a. Return-current model and far-field attribution (stage 2)

`app.returnModel` is `'image'` (stage 1: mirror images only) or `'detour'` (default).
`applyReturnModel(ctx, src, elements)` (`src/physics/returnPaths.ts`) returns new elements plus
`Detour[]`:

- **Gaps** (`kind: 'gap'`): where the reference plane (`referencePlane`: nearest plane layer,
  preferring the side towards the core) has a gap with copper on both sides under a horizontal
  element, the crossing loses its images; the return goes up from the image depth to the plane
  surface, around the gap along `geodesic` (8-connected Dijkstra through the plane's copper on a
  0.4 mm grid in a window around the gap, the whole raster at 0.8 mm if needed, then
  straightened) and back down. Without a way around, the stage 1 behaviour is kept.
- **Transfers** (`kind: 'transfer'`, not for loops): where a signal via changes between layers
  with different reference planes, the return transfers through the nearest link (`findLink`:
  for planes of the same net the nearest via or through-hole pad of that net spanning both, for
  different nets the nearest two-pin part between them, typically a decoupling capacitor); the
  signal via's own images are dropped.
- Every detour carries `fix` (elements to remove, restore, add): what the source looks like with
  this problem fixed. `withFixed(elements, d)` applies it.

`attributeSource(elements, base, detours, planes, frame)` (`src/physics/attribution.ts`) works
with far-field moments only (`farMoment`, images in the plane), since the far-field estimate is
proportional to |m| for every line: `returnPathsDb` (now vs. all detours fixed), `planeGapsDb`
(stage 1 elements over `solidPlanes`), and per detour `gainDb` (its share added to the ideal
source) and `aloneDb` (fixing only this spot). Values are capped at `MAX_GAIN_DB` = 30 dB.
`Engine.pushReturnPaths` draws the detours as dashed lines (`Viewer.setReturnPaths`).

## 4b. Diagnostics and rules engine

`Engine.updateDiagnostics()` runs after every model rebuild (`refreshAll`, `sourceChanged`):

```
for each enabled source with a model:
  cm  = commonModeEstimate(board, planes, frame, src, model, limitsFor(standard, 3), referencePlane)
  io  = ioCouplingEstimates(ctx, src, model, limits, referencePlane)
  out += diagnoseSource(board, planes, frame, src, model, fMax, detours, planeGapsDb, cm, io)
out += layoutRules(ctx, sources)          // board rules, sourceId ''
→ app.diagnostics, app.commonMode, app.detours, app.attribution; pushReturnPaths()
```

**Per source** (`diagnoseSource`, `src/physics/diagnostics.ts`):

| Kind | Condition (constants in the module) |
|---|---|
| `return-gap` | gap in the reference plane under a horizontal current path (`gapsAlong`); `split` when the line crosses from one net's copper to another's; dropped when the return can pass less than 2 mm (`DETOUR_MIN`) longer than the gap |
| `ref-change` | layer change where the reference planes before and after belong to different nets |
| `no-stitching` | same-net planes, but no stitching via spanning both within 3 mm (`STITCH_RADIUS`) |
| `long-line` | unterminated line (no termination, no series resistor ≥ 10 Ω within 15 mm of the driver) whose quarter-wave resonance lies below fMax and carries ≥ 1 % of the strongest line |
| `no-reference` | signal on a board without any plane; gain against a virtual plane |
| `edge-trace` | line within 3·h (at least 1 mm) of its plane's edge over at least 3 mm (`EDGE_H`) |
| `cable-cm` | `commonModeEstimate` worst margin above −6 dB (`CM_REPORT`) |
| `io-coupling` | up to two `ioCouplingEstimates` with a margin above −6 dB |
| `no-adjacent-plane` | reference plane not on the neighbouring layer |
| `pair-skew` | pair legs differ by more than 5 mm or 10 % of the rise time |
| `hot-loop` | loop area ≥ 30 mm² (`HOT_LOOP_MIN`) |

Afterwards the stage 2 detours are attached to `return-gap`, `ref-change` and `no-stitching`
findings within 8 mm (setting `detour` and `gain`), gaps without a detour get the source's
`planeGapsDb` (scope `'source'`), and findings of the same kind and source close to each other
are merged (`merge`).

**Board rules** (`layoutRules(ctx, sources)`, `src/physics/layoutRules.ts`; catalogue numbers
from `docs/research/EMC-MISTAKES-CATALOGUE.md`): `filter-far`, `filter-ground` (K-18 filters on
cable lines), `shield-open`, `shield-weak` (K-20 connector shields), `decoupling` (K-24),
`crystal-placement`, `crystal-under` (K-17), `sw-node` (K-31), `connector-ground` (K-22, needs
the sources: fast signals with tr ≤ 5 ns on a connector without ground pins beside them),
`inductor-placement` (K-33), `floating-copper` (K-38), `heatsink-floating` (K-37),
`filter-bypass` (K-19, `overlapCapacitance`, `crossover`), `esd-missing`, `esd-placement`,
`supply-noise` (K-34, `supplyNoiseFindings` in `supplyNoise.ts`) and `ferrite-ground` (K-26).
They are geometry rules with thresholds exported as constants (`FILTER_MAX`, `DECOUPLE_MAX`,
`CRYSTAL_EDGE`, `SW_AREA`, …); cable connectors come from `cableConnectors` (commonMode.ts),
filter part values from `filterPart` (filterParts.ts). `BOARD_KINDS` lists these kinds.

**Estimates behind the cable findings**: `commonModeEstimate` (current-driven common mode after
the Clemson EMC expert system: voltage across the plane halves, cables driven against each other
or against the board), `ioCouplingEstimates` (inductive and capacitive crosstalk from a source
into I/O nets that leave through a cable connector), `supplyNoise` (current divider over the
supply path to the connector, ended by a 2 × 50 Ω LISN, compared with the conducted average
limit as a yardstick). Their physics is in PHYSICS.md §11b–11d.

**Ranking and severity**: `rankedDiagnostics()` (`src/report/texts.ts`) takes each source's worst
far-field margin (`farMargins`, from `farReadout(3)`), picks the margin that counts for a finding
(`marginOf`: cable findings use their own estimate), orders by `rankFindings` (worst source
first, then biggest gain) and rates with `findingSeverity` (`src/physics/severity.ts`): a score
0…1 from the margin (`marginScore`: 1 at or over the limit, 0 at 20 dB below) and the finding's
share (gain / 6 dB), with fixed scores for board rules (`RULE_SCORE`), hot loops by area, cable
estimates counted 6 dB lower (`WORST_CASE`) and plane gaps under a relevant source at least 0.6.
Levels: `critical` ≥ 0.6, `check` ≥ 0.3, else `minor`; `severityColor` maps the score to green →
red. The list is finally sorted by level. `actionPlan()` groups the critical and check findings
by kind.

**Consumers**: `DiagnosticsPanel.svelte`, the speech bubbles and the problem view (§7c), the
report (§11) and the CLI (§12), which calls the same functions.

Every kind needs a text in both dictionaries (`t.diag.kinds`, `t.callouts.kinds`; checked by
`tests/texts.test.ts`) and an explanation (`t.explain`, §11).

## 5. Render pipeline

`Viewer` (`src/render/viewer.ts`) renders on demand: `requestRender()` sets a flag that the
`setAnimationLoop` callback checks; while something animates (field-line pulse, walking) it
renders every frame.

1. **Opaque pass** into a `WebGLRenderTarget` (half float, 4× MSAA, float depth texture): board
   (`buildBoardMeshes`: substrate extruded from the outline, copper per layer with a net id per
   vertex for highlighting, large zones as textures from their coverage raster, vias as
   instanced cylinders, part bodies as instanced boxes from the courtyard), component models,
   field lines, probe, slice plane, isosurfaces, return paths, hotspot markers, measured slices
   and in-world speech bubbles.
2. **Full-screen composite pass** (`volumeFragment` in `src/render/volumeShader.ts`): reads
   colour and depth of the render target, reconstructs the view ray per pixel (`projInv`,
   `viewInv`), intersects it with the volume box, marches up to the scene depth with a per-pixel
   hash offset (step = 0.6 × the smallest grid spacing, at most 1024 steps); transfer function:
   x = position in the display window, colour from a 256 × 1 LUT (`colormapLut`, inferno or
   turbo), opacity 1 − exp(−density·x^γ·step) (γ = 2.2 from the engine); front-to-back
   compositing with early exit at α > 0.985; output scene·(1 − 0.55α) + glow, converted to sRGB.
3. **Volume texture**: `Data3DTexture`, `RedFormat`, `UnsignedByteType`, linear filtering, the
   composite's bytes; same-size updates reuse the texture. The display window
   (`setVolumeParams`) and the colour map are uniforms / LUT updates.
4. **Slice**: a horizontal plane in the opaque pass that samples the same 3D texture with the same
   window (`sliceFragment`), at `sliceHeight`.
5. **Isosurfaces** (`isosurface.ts`, naive surface nets): three shells at 35, 60 and 85 % of the
   window, rebuilt only when the volume or window changes.
6. **Camera**: `OrbitControls` with damping; the near plane follows the distance (`fitNear`).
   Ant view (`antView`, `setWalk`): the camera drops near the board, W/A/S/D walk, Q/E change
   the height. `flyTo` animates camera moves.
7. **WebXR** (`enableXR`): in a headset the scene is scaled to 1 mm = 5 mm on a table in front
   of the viewer and rendered directly; the ray-marched glow needs the flat-screen depth pass, so
   VR shows the isosurfaces instead.
8. **Problem view** (`enterFocus` / `exitFocus`): a separate scene (`buildFocusScene`) is
   rendered through the same composite pass with the volume off; the camera is offset by the
   width of the side card.
9. **Picking**: `App.svelte` intersects the pointer ray with the outer copper surface facing the
   camera (`pickPlane`) and looks up copper with `PickIndex.pick` / `nearestPad` on the visible
   layers; the probe follows the pointer on the plane at probe height.

## 6. Audio graph

```
per source: OscillatorNode(PeriodicWave from the source's lines) ─► GainNode(field at the probe)
            ─► PannerNode(HRTF, source centre relative to the probe) ─► master GainNode
            ─► DynamicsCompressor(threshold −18 dB, ratio 6) ─► destination
```

`Sonifier` (`src/audio/sonifier.ts`), driven by `updateAudio()` in `App.svelte`, which is
scheduled once per animation frame when the probe readout, the audio settings, the dB window or
the camera change. Each voice gets the source's lines, its field at the probe (`ProbeReadout`
power sum) and its centre relative to the probe:

- Pitch: f_audio = κ·f0 with κ = pitchAt25MHz / 25 MHz (default 220 Hz, κ = 8.8·10⁻⁶), linear,
  so harmonics stay harmonic.
- `PeriodicWave`: harmonic n gets the amplitude of the line at n·f0, normalised to the
  strongest, up to min(4096, 16 kHz / f_audio) harmonics.
- Loudness: x = position of the source's field at the probe in the dB window; gain =
  10^((min(1, x) − 1)·50/20), i.e. the window spans 50 dB; silent below x = −0.2. All
  parameters are smoothed with `setTargetAtTime`. The listener orientation follows the camera.
- Geiger mode (`mode: 'geiger'`): no tones; clicks as a Poisson process, rate 0.5·200^x per
  second from the total field (0.5 to 100 clicks/s), scheduled 100 ms ahead.
- The `AudioContext` is created and resumed only from a user click (`start()`, autoplay rules).

## 7. User interface

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Name · working title · file · live │ Open · Demo · Examples ·                            │
│ Save/Load scenario · Save image · Ant view · Grid · Language · status                    │
├───────────────┬──────────────────────────────────────────────────────┬───────────────────┤
│ Sources       │                                                      │ View·Diagnose·Scan│
│ Add ▾         │      3D view (board, glow, slice, probe, lines)      │ field kind H/E    │
│ Suggestions   │      speech bubbles or problem view (card, labels)   │ origin, frequency │
│ Source list   │      status line, toast, progress bar                │ window, volume    │
│ Editor        ├──────────────────────────────────────────────────────┤ bubbles, lines    │
│               │ Spectrum: probe · 3 m · 10 m │ probe │ sound         │ layers, models    │
└───────────────┴──────────────────────────────────────────────────────┴───────────────────┘
```

CSS grid in `App.svelte`: columns 300 px | 1fr | 270 px, rows 46 px | 1fr | 220 px. Below
1100 px the right panel becomes a drawer opened by a header button; below 760 px everything is one
column (header, view, spectrum, sources).

- `SourcesPanel` / `SourceEditor`: add signal, pair, loop or inductor; suggestions from
  `suggestSources` (differential pairs, clocks and data by name, regulators from VIN/GND/SW pins,
  storage inductors) singly or all at once; pads and nets can be picked in the 3D view
  (`app.pickMode`).
- `ViewPanel`, tab **View**: field kind (H/E), field origin (fast / full wave, when a result is
  loaded), frequency (all / band / line), dB window, volume, isosurfaces, slice (with CSV
  export), speech bubbles, field lines, return model, layers with plane overrides, 3D models
  (folder, GitHub repository, KiCad library), fMax, full-wave export and import. Tab
  **Diagnose**: `DiagnosticsPanel`. Tab **Scan**: `ScannerPanel` (§14).
- `DiagnosticsPanel`: action plan, ranked findings (grouped by source and kind, three shown per
  group), hotspots, far-field margins per source, the emission standard (`STANDARDS`), report
  download, parts data for AI agents.
- `SpectrumPanel`: probe spectrum or far field at 3 / 10 m with limits and the cable common-mode
  estimate; probe height, radius, component, probe voltage; CSV export; sound on/off, volume,
  pitch, style.
- Pointer: the probe follows the mouse at probe height; a click pins or releases it; hovering
  shows net and layer; Escape leaves pick mode and the problem view.

## 7a. Language

`t` is a proxy to the dictionary of the active language (`i18n.lang`, Svelte state), so texts in
templates follow the language automatically. Numbers are formatted with `fmtNum` and
`formatEng` (`setDecimalComma` switches the separator); so that they switch as well,
`Root.svelte` remounts the app on a language change (`{#key i18n.lang}`). The engine keeps the
board, sources and volumes and attaches itself to the new viewer (`Engine.attach`). The choice is
stored under `<storageNamespace>:lang`; without one the browser language decides. New texts
always go into both dictionaries; `de.ts` defines `type Strings = typeof de` and `en: Strings`
makes TypeScript report missing keys.

## 7b. Discoverability (SEO, AI search)

- At build time, `tools/vite/seo.ts` fills title, description, keywords, Open Graph, Twitter
  Card, canonical URL and JSON-LD (`SoftwareApplication`, `SoftwareSourceCode`) into
  `index.html` and emits `robots.txt`, `sitemap.xml`, `llms.txt` (short description for AI
  crawlers) and `ai-parts-manual.md` (a copy of `docs/AI-PARTS-MANUAL.md`). Names and URL come
  from `branding.config.json`, the texts from `seo.config.json`.
- `index.html` contains a static introductory text (`#static-intro`) for crawlers and visitors
  without JavaScript; `main.ts` removes it when the app starts. A Playwright test checks it with
  JavaScript disabled.
- The social preview `public/og-image.png` (1200 × 630) and `apple-touch-icon.png` are generated by
  `tools/seo/make_images.py` from the smoke test's screenshot (`docs/images/app-demo.png`).
- Verification tokens (`googleSiteVerification`, `bingSiteVerification`) and Chrome origin-trial
  tokens (`originTrialTokens`, e.g. for HTML-in-Canvas) in `seo.config.json` become meta tags.

## 7c. Problem view and speech bubbles

- **Speech bubbles** (`calloutData.ts`, `buildCallouts`): the ranked findings as numbered pins
  (same numbers as in the Diagnose tab), the sources with near-field peak and far-field margin,
  optionally the hotspots; hints and sources can carry a small 3 m spectrum (`miniSpectrumSvg`,
  view setting `callouts.spectrum`). Critical and check bubbles always stay in view; minor ones
  are points. Shown either as HTML over the canvas (`Callouts.svelte`) or inside the scene
  (`WorldCallouts`, HTML-in-Canvas, only where the browser supports it, and always in VR).
- **Problem view** (click on a finding, `app.focusKey = diagKey(d)`): `buildFocus(d)`
  (`focusData.ts`) collects a `FocusSpec`: the source's nets and current path, the planes
  concerned, parts, vias, the detour, dimensions, areas, circles, cables at connectors, the
  suggested fix and a field map (`computeFieldMap` in `focusField.ts`: the source's H field on a
  plane above the region, as it is and with the finding fixed, as a dB difference).
  `buildFocusScene` (render/focusScene.ts) draws it with the layers pulled apart; `FocusLabels`
  places the HTML labels, `FocusPanel` shows the explanation (`explain`, §11), the 3 m spectrum
  now and with the fix, and the inputs with their provenance; editing an input reruns the source.

## 8. State and persistence

- `state/app.svelte.ts`: `AppState` (singleton `app`) with `$state` / `$state.raw` fields:
  board, hash, planes, overrides, sources, selection, quality, return model, standard, fMax,
  view, layer visibility, probe, audio, compute status, source models and errors, composite dB
  range, line ranking, diagnostics, detours, attribution, common-mode estimates, hotspots,
  parts information, library and model status, full-wave info and field origin, focus key, UI
  tabs, toast.
- The engine changes `app`; components call engine methods for every change that needs a
  recomputation (§4.12). Effects in `App.svelte` connect state and viewer: probe readout and probe
  gizmo, net highlighting of the selected source, field lines, measured slices, speech bubbles,
  the problem view, sound.
- `localStorage` (`state/persist.ts`, every access in try/catch; the app works without it):
  `<storageNamespace>:scenario:<boardHash>` (saved 400 ms after the last change,
  `scheduleSave`), `<storageNamespace>:models.kicad` (KiCad library on/off) and the language.
- Scenario files carry `kind` + `version`; `migrateScenario()` validates and upgrades them.
  Download and upload go through `downloadText`, `downloadDataUrl` and `pickFile`.
- Live coupling (`state/liveFile.svelte.ts`, Chromium's File System Access API): a board opened
  or dropped with a handle is polled every second (`lastModified`); a save in the CAD program
  reloads it with `keep = true`; a half-written file is retried three times.

## 9. Tests

- **Vitest** (`tests/*.test.ts`, Node environment): parser and net escapes against pcbnew
  references (`parseBoard`), Biot-Savart, mirror images, shielding, spectra, lines, plane
  detection and source models (`physics`), E field, far-field moment, return paths, common mode,
  diagnostics on the demo board, board rules, severity, standards, known EMC mistakes on bad /
  good board pairs (`emcCases`), CI field check, full-wave job and result file, isosurfaces,
  model library lookup, STEP to triangles and model placement, pick index, scanner
  (registration, plan, virtual scan end to end, tinySA protocol, fit), AI request, branding, and
  that every finding kind has its texts in both languages (`texts`). The importers in
  `src/import/` have no tests yet.
- `tests/fixtures/`: pcbnew reference JSON (`tools/demo-board/export_reference.py`) for the demo
  and KiCad demo boards, the EMC case boards (`tools/emc-cases/gen_cases.py`), a STEP box.
- **Playwright** (`npm run e2e`, `e2e/smoke.spec.ts`, WebGL via SwiftShader, German locale,
  offline stub for KiCad's model library in `e2e/fixtures.ts`): demo load, compute, probe and
  diagnostics; editing sources and field lines; language switch; page without JavaScript;
  `?demo`; virtual scan; narrow window; live coupling; full-wave export; report; speech bubbles
  (overlay and HTML-in-Canvas); parts data for AI; problem view; real 3D models; board rules
  (open shield, bypassed filter, supply cable current).
- **CI** (`.github/workflows/ci.yml`): codename check, `svelte-check`, Vitest, build (app and
  CLI), the field check on the demo board; e2e as a separate job. `pages.yml` deploys `dist/`.

## 10. Extension points for later stages

- **Compute seam.** There is no backend interface; the seam is `FieldPool.computeVolume(pack,
  grid, cover, onProgress, kind)` → `Float32Array` of |h|² in grid layout, plus the exact
  point evaluation `fieldAt` / `eFieldAt`. A WebGPU kernel would have to deliver the same array.
  Imported fields enter in `recompose`, `readoutAt` and `farReadout` behind
  `fullwaveActive()` (`app.fieldOrigin` = `'fast'` | `'fullwave'`); volumes carry no origin
  metadata of their own.
- **Current elements.** `Source` → `CurrentElement[]` is where stage 2 already plugs in:
  `applyReturnModel` rewrites the element list (explicit plane currents, `noImage`) without
  changing the kernel or the display. A plane solver would replace it the same way.
- **New source types**: extend the `Source` union, `buildSource`, `geometryKey`, the editor and
  the dictionaries.
- **New rules**: a `DiagnosticKind`, the check in `diagnoseSource` or `layoutRules`, a severity
  rule, texts in `t.diag.kinds`, `t.callouts.kinds` and `t.explain`.
- **New board formats**: an importer in `src/import/` that fills a `BoardBuilder` and is
  dispatched in `importBoard`.
- **Measurements** appear as slices at their measurement height (`Viewer.setMeasurementSlices`,
  measured or as a difference to the simulation); new devices only implement `Positioner` or
  `Receiver` (`src/scanner/types.ts`).

## 11. Report, explanations and the parts request for AI agents

- `src/report/texts.ts`: one wording for a finding everywhere (`diagnosticText`,
  `sourceSummary`, `gainText`, `fixedShift`, `standardShort`) and the ranking (`farMargins`,
  `rankedDiagnostics`, `actionPlan`, `sourceSeverityOf`); used by the Diagnose tab, bubbles,
  problem view and report.
- `src/report/explain.ts`: `explain(d)` → `Explanation { what, why, detected, figures, fixes,
  avoid, calc, doubts, limits, refs, severity, reason }`. The wording lives in the dictionaries
  (`t.explain`); the function picks texts and fills in this case's numbers.
- `src/report/report.ts`: `buildReport(image)` writes one self-contained, printable HTML file:
  a snapshot of the 3D view, summary, findings with their explanations, hotspots, far field
  against the selected standard, sources, settings and the parts information.
- `src/ai/request.ts`: `buildAiRequest(board, scenario, suggestions, manualUrl)` → `AiRequest`
  (`kind: 'pcb-field-ai-request'`): the parts with their KiCad fields and the nets at their pins,
  the current scenario, the app's suggestions and the address of the parts manual. An external
  AI agent answers with a normal scenario file including `parts`, `provenance` and `missing`
  (docs/AI-PARTS-MANUAL.md), which the app loads like any scenario.

## 12. Command-line field check (`src/cli`)

```
node dist/cli/field-check.mjs <board> --scenario board.scenario.json [--out report.json]
     [--baseline base.json] [--threshold 3] [--height 2] [--step 1]
```

Built by `vite.cli.config.ts` as one Node 22 script (`npm run build`), run by
`npm run field-check`. `main.ts` reads a `.kicad_pcb` as text and any other board file (IPC-2581,
Eagle, ODB++) as bytes through `importBoard`. `runCheck(board, fileName, scenario, opts)` takes
KiCad text or an imported `BoardModel` and uses the same physics as the app, without workers:
`parseBoard` (for text), `detectPlanes`, per enabled source `buildSource`, the
return model from the scenario, `attributeSource`, `packWithImages`, then `fieldAt` on a plane
`height` mm above the top copper surface with `step` mm spacing (points farther than 15 mm from
the source's extent skipped); per band (`CHECK_BANDS`: all, 30–230 MHz, 230 MHz–1 GHz) the
strongest field and where; the far-field margin at 3 m against the scenario's standard; the
common-mode and I/O estimates; the findings of `diagnoseSource` sorted by gain; finally
`layoutRules`. The `CheckReport` (`kind: 'pcb-field-check'`) is printed as a table and optionally
written as JSON. `compareChecks(base, now, threshold)` lists near- or far-field changes beyond the
threshold, new findings (matched by kind within 2 mm) and sources that no longer build; any
`worse` entry sets exit code 1. Details: [../CI-FIELD-CHECK.md](../CI-FIELD-CHECK.md).

## 13. Full-wave exchange with openEMS (stage 3)

The browser does not run openEMS; it exports a job and imports the result.

1. **Export**: `Engine.exportFullwaveJob(opts)` → `buildJob(ctx, sources, models, grid, meta,
   options, parts)` (`src/fullwave/job.ts`) → `<board>.openems-job.json`
   (`kind: 'pcb-field-fullwave-job'`): outline, layers and dielectrics, nets, copper polygons per
   layer, track and pad wires, via and through-hole barrels (with the layers that need an
   anti-pad), two-pin capacitors as series R-L-C (values from the scenario's `parts` or the value
   field), one `JobSource` per enabled signal, pair or loop with ports, lumped parts and shorts,
   skipped sources (inductors, sources without a model or with errors), log-spaced frequencies
   (default 12 from 20 MHz to min(fMax, 1 GHz)), the app's grid and mesh settings. Job
   coordinates: X = x − ox, Y = −(y − oy), Z = height.
2. **Run**: `tools/openems/run_job.py` (one FDTD run per source, H divided by the port current,
   far field from a near-field box) writes `<job>.fullwave.bin`.
3. **Import**: loading the result in the View tab or dropping the `.fullwave.bin` calls
   `Engine.loadFullwave` → `parseFullwave` (magic `PCBFW1`, JSON header, int16 blocks of
   centi-dB per source and frequency) → `resampleBlocks` onto the current grid (also after a quality change) → `app.fullwave`,
   `app.fieldOrigin = 'fullwave'`. The display, probe and far field then use the result for H
   (§4.7–4.9); the E field always comes from the fast model.

`tools/fullwave/validate-loop.ts` compares the fast model's far field with openEMS on a test
board.

## 14. Near-field scanner (stages 4 and 5)

`src/state/scanner.svelte.ts` (state `scanner`) drives the modules in `src/scanner/`:

- **Devices**: `Positioner` (`VirtualPositioner`, `OctoPrintPositioner`,
  `SerialGcodePositioner`) and `Receiver` (`VirtualReceiver`, `TinySAReceiver`); the hardware
  drivers are experimental. The virtual receiver "measures" the simulation through
  `engine.fieldLinesAt` and the probe model, so the whole chain works without hardware.
- **Registration**: reference pads jogged to in printer coordinates; `fitRegistration` fits a
  rigid 2D transform (Kabsch); plain and mirrored fit are both tried, with two points the
  mirrored one (board top up) is taken, with three or more the one with the smaller residual. The
  virtual rig uses a fixed placement on a 220 mm bed.
- **Plan and run**: `makePlan` (raster over the board or around the probe, several heights,
  serpentine order, lifted over part bodies plus clearance and probe radius), `estimateSeconds`,
  `runScan` (lift, move, settle, sweeps with max hold, abort between points).
- **Measurements** (`kind: 'pcb-field-measurement'`): sweeps in dBm per point, optionally a
  background scan; `slices(m, sel)` converts to field strength (`dbmToFieldDb`, H loop or E stub)
  for the current frequency selection; `showMeasurement()` draws them with
  `Viewer.setMeasurementSlices`, measured or as the difference to the simulation at the height
  the probe really had.
- **Fit** (stage 5): `fitToMeasurement` builds the simulated per-source powers at the scan points
  (`engine.readoutAt`) and `fitSources` (non-negative least squares with relative weights and a
  pull towards factor 1) returns a power factor per source and the residual; `applyFit` scales
  the sources' amplitudes by it.
