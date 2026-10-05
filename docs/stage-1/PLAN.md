# Stage 1: Quasi-static near-field simulation in the browser

As of: 2026-10-04 · Status: M0–M7 implemented, M8 open (see table and §13)

Companion documents:
- [PHYSICS.md](PHYSICS.md): the physical model with all formulas, assumptions and limits of validity
- [ARCHITECTURE.md](ARCHITECTURE.md): modules, data model, compute, render and audio pipeline, file formats
- [../ROADMAP.md](../ROADMAP.md): how this stage fits in among all stages

---

## 1. Goal in one sentence

Load a KiCad board (`.kicad_pcb`) in the browser, define interference sources (clocks, data lines,
switching-regulator loops, differential pairs), compute the **magnetic near field** in a 3D volume around the
board and explore it as a walkable **PCB-World with picture and sound**, without hardware,
without a server, and with an immediate response to changed signal parameters.

## 2. Goals and non-goals

### Goals
1. **Pure browser tool.** Static web app, no installation, no backend. The
   board file never leaves the computer.
2. **Read KiCad 6 to 10.** Layers, stack-up, traces (including arcs), vias, pads,
   components, filled zones, board outline. Both net notations (`(net 3 "CLK")` up to
   KiCad 9 and `(net "CLK")` from KiCad 10 on).
3. **Physically founded approximation** (stage A of the idea paper): quasi-static
   H field by Biot-Savart over current segments, return currents in reference planes by mirroring (image currents),
   shielding by planes, cut-outs in planes taken into account locally.
4. **Real-time "what if".** The spatial field pattern is computed once per source;
   frequency, edge steepness, amplitude, duty cycle and frequency selection then take effect without
   recomputation (linearity, see PHYSICS.md §6).
5. **PCB-World.** 3D board, field as a glowing volume, slice plane at probe height,
   field lines, virtual near-field probe with spectrum display, sonification with
   spatial sound.
6. **Diagnostics.** Hotspots with the nearest nets and components, warnings for
   interrupted return paths (slot/cut-out under a line) and changes of the reference layer
   without a nearby stitching via, rough far-field estimate against CISPR 32 limits
   (explicitly labelled as orientation only).
7. **Traceable.** Every formula is in PHYSICS.md together with its source; every core function has
   tests against analytical solutions.

### Non-goals (deliberately later, see ROADMAP)
- no prediction of whether an EMC test will be passed
- no full-wave simulation, no resonances, no propagation-delay effects (stage 3)
- no solver for the current distribution in planes; the detour of the return current around a slot
  is detected and warned about, but not computed (stage 2)
- no cables, no enclosure (stage 3 / cross-cutting)
- E field only as the optional milestone M8
- no measurement hardware (stages 4 and 5)

## 3. User workflow

1. **Start:** open the page, load the "Demo board" or your own `.kicad_pcb` by drag and drop or
   file picker.
2. **Board:** appears in 3D (substrate, copper per layer, pads, vias, component boxes).
   Layers can be shown/hidden; clicking a net shows its name and highlights it.
3. **Reference planes:** are detected automatically (the zones of one net cover more than
   half of a layer). Display and override per layer in the "Layers" panel.
4. **Sources:** suggestions from net names (CLK, XTAL, SCK, SW, USB_D±, …) and pin types
   (`pintype "output"`). Accept them or create them by hand: clock/digital, differential pair,
   current loop (switching regulator). Parameters: frequency, duty cycle, rise time, voltage or
   current, load model.
5. **Computation:** starts automatically in the background (Web Worker), first coarse (preview),
   then in the selected quality. Progress is visible, the computation can be cancelled.
6. **Explore the field:** volume, slice plane, field lines; frequency mode "All", "Band"
   (e.g. CISPR 30–230 MHz) or "Single line" (list of the strongest spectral lines).
7. **Virtual probe:** move the mouse over the board; spectrum at the probe position as on
   a spectrum analyser; sound on: the sources sound, loud where the field is strong.
8. **What if:** slower edge, halve the clock, mute a source: picture and sound
   follow immediately.
9. **Diagnostics:** hotspot list, warnings, far-field estimate.
10. **Save:** scenario as JSON (sources, settings); automatic backup in the
    browser per board.

## 4. Physical model (summary)

Details, derivations and sources: [PHYSICS.md](PHYSICS.md).

- **Quantity:** magnetic field strength H in A/m, displayed as dBµA/m.
- **Quasi-statics:** field = Biot-Savart of the instantaneous current distribution; retardation is
  neglected. Valid for distances ≪ λ/2π and electrically short lines; the app shows the
  limit of validity per source.
- **Current geometry:** traces and vias as straight current filaments (arcs are subdivided),
  with a core radius against the 1/r singularity.
- **Return current:** ideal conducting reference plane → image current (tangential component reversed, normal
  component the same). Reference plane per element = the nearest plane layer that actually has
  copper at that spot. Under a cut-out the image jumps to the next plane or is dropped.
- **Shielding:** field points beyond a plane that is present at that spot receive
  no contribution from the element.
- **Currents from signals:** trapezoidal signal → Fourier series; load model capacitive
  (I = jωC·V, current distribution in the net tree according to the downstream capacitance, displacement current
  to the plane) or terminated (I = V/Z0).
- **Superposition:** coherent within one source (vector sum), incoherent between sources
  (power sum), since independent clocks are not phase-locked.
- **Far-field orientation:** magnetic dipole moment of the current distribution including the images →
  E at 3 m (Ott), with ground reflection ×2, against CISPR 32 class B.

## 5. Architecture (summary)

Details: [ARCHITECTURE.md](ARCHITECTURE.md).

```
.kicad_pcb ──► S-expr parser ──► BoardModel ──► layer/plane raster ──► connectivity
                                                                   │
Scenario (sources) ──────────────────────────────────────► current elements + images + spectra
                                                                   │
                                     Worker pool: |h_s(r)|² per source on the 3D grid
                                                                   │
        Frequency selection ──► composition Σ w_s·|h_s|² (ms) ──► 3D texture ──► raymarching
                                                                   │
              Probe (mouse) ──► exact Biot-Savart at the point ──► spectrum + audio (PeriodicWave)
```

- TypeScript, Vite, Svelte 5 (user interface), three.js (3D), Web Workers (computation),
  Web Audio API (sound), Vitest (tests). No backend.
- Compute core as pure TypeScript functions without DOM, so that it runs the same way in workers, tests and
  later in a WebGPU or command-line backend.

## 6. Milestones

Every milestone ends with green tests, updated documentation and a commit.

| # | Content | Status |
|---|---|---|
| M0 | Scaffolding, branding/renaming, CI, documentation | done |
| M1 | KiCad import, stack-up, 3D board, demo board | done |
| M2 | Physics core: spectra, line parameters, connectivity, current elements, images, Biot-Savart | done |
| M3 | Field grid, worker pool, composition, volume and slice rendering | done |
| M4 | Source editor, suggestions, save/load scenario | done |
| M5 | Virtual probe, spectrum display, sonification | done |
| M6 | Field lines, hotspots, return-current warnings, far-field estimate | done |
| M7 | Polish: ant view, export, English, GitHub Pages, performance | done |
| M8 | optional: quasi-static E field, WebGPU compute core | open |

### M0 Scaffolding
- Vite + TypeScript + Svelte 5 + three.js, no ESLint, but a strict TS configuration
  (`strict`, `noUncheckedIndexedAccess`).
- `branding.config.json` as the single source of the name; `scripts/check-codename.mjs`
  (CI) and `scripts/rename.mjs`; plan in [../RENAMING.md](../RENAMING.md).
- GitHub Actions: type check, tests, build, codename check; Pages deployment
  can be switched off via a repo variable.
- **Acceptance:** `npm ci && npm run check && npm test && npm run build` green, locally and in CI.

### M1 KiCad import and 3D board
- S-expression tokenizer/parser (strings with escapes, numbers, atoms), tolerant of
  unknown nodes.
- BoardModel: copper layers with their z position from `(setup (stackup …))`, otherwise a default stack-up
  (2 layers: 1.6 mm FR4; 4 layers: JLC04161H-7628; 6 layers: evenly distributed).
  Elements: `segment`, `arc`, `via` (including blind/buried), `footprint` with `pad`
  (transformation local → board, `*.Cu`, `pintype`, `pinfunction`), `zone` with
  `filled_polygon` (keyhole polygons), outline from `Edge.Cuts` (`gr_line`, `gr_arc`,
  `gr_rect`, `gr_circle`, `gr_poly`, also inside footprints) chained into closed rings.
- 3D rendering: substrate as an extruded outline, copper per layer as merged
  geometry, pads, vias as cylinders, components as boxes from the courtyard, layers
  can be shown/hidden, net picking with highlighting.
- Demo board generated by a pcbnew script (`tools/demo-board/`), with typical EMC sins
  (see §9).
- **Acceptance:** pad positions and angles of the demo and test boards match pcbnew to within 1 µm
  (test data exported from pcbnew); 10,000 elements parsed in < 1 s.

### M2 Physics core
- `spectrum`: trapezoidal Fourier series, bands, line lists, units.
- `lines`: microstrip and stripline Z0, εeff, C' (Hammerstad/Jensen, IPC-2141).
- `planes`: rasterisation of the plane zones (scanline, 0.1–0.25 mm), coverage query.
- `connectivity`: net graph from segments, arcs, vias, pads, zones; bridges across
  two-terminal components (series resistor) between nets of the same source.
- `currents`: source → current elements (horizontal, vertical) with relative weights;
  capacitive load model (tree, displacement currents) and terminated model;
  loops via pad sequences with shortest paths; differential pairs with imbalance.
- `images`: reference plane per element with local coverage, splitting at coverage boundaries,
  image elements, shielding "compartments" (slots) per element.
- `biotsavart`: closed-form formula for finite filaments (Hanson/Hirshman), core regularisation.
- **Acceptance:** tests against analytical solutions (infinite wire, square loop at its
  centre, circular loop on its axis, field below an ideal plane ≈ 0,
  trapezoidal spectrum against a numerical FFT, Z0 of a 50 Ω microstrip).

### M3 Field computation and volume
- Grid from outline + margin, quality "Preview" (2 mm), "Normal" (1 mm), "Fine" (0.5 mm).
- Worker pool (hardware threads − 1), division into z slices, progress, cancellation via a
  generation counter, cache per source via a geometry hash.
- Composition Σ w_s·|h_s|² → dB → 8-bit 3D texture; window (dB min/max) in the shader.
- Raymarched volume with depth test against the board (render target with depth texture),
  colour maps (Inferno, Turbo), opacity curve, jitter against banding.
- Slice plane (horizontal at probe height, optionally vertical) as a heat map.
- **Acceptance:** demo board in "Normal" in < 5 s on an 8-core laptop; switching the
  frequency selection < 30 ms; 60 fps at 1080p on integrated graphics (raymarching steps
  limited, half resolution as an option).

### M4 Sources and scenario
- Source types: `signal` (clock/data), `diffpair`, `loop`; parameter forms with
  unit-aware input ("25 MHz", "1 ns", "3.3 V").
- Suggestions from net names and pin types, driver detection via `pintype "output"`.
- Net and pad selection with search; pads can also be picked by clicking in the 3D view.
- Scenario JSON (versioned, migration function), download/upload, autosave per
  board hash in `localStorage` (namespace independent of the codename).
- **Acceptance:** the scenario of the demo board is saved, reloaded and yields
  identical fields; changing spectrum parameters does not trigger a recomputation.

### M5 Virtual probe, spectrum, sound
- Probe: raycast onto the plane at probe height; position, height, loop diameter.
- Spectrum at the probe position: exact Biot-Savart evaluation per source (no grid),
  lines with RBW shape, log/lin axis, sum and each source in its own colour, limit lines optional.
- Sound: one `OscillatorNode` per source with a `PeriodicWave` built from the harmonic amplitudes;
  linear frequency mapping (harmonics stay harmonic: clocks sound like a tone,
  switching regulators like a buzz); volume from the field at the probe position; spatial via
  `PannerNode` (HRTF) at the source's hotspot; mute/solo per source; start button (autoplay rule).
- **Acceptance:** the probe above the hotspot is audibly louder than 10 mm beside it; two clocks at
  25 and 33.3 MHz sound as two tones in the ratio 3:4.

### M6 Field lines and diagnostics
- Field lines per source: start points on rings around the strongest elements, RK4 along the exact
  Biot-Savart direction, stop on return, exit or weakness; animated flow.
- Hotspots: local maxima at probe height, assignment to nets/components in the vicinity.
- Warnings: return path interrupted (coverage gap ≥ 1 mm under an element),
  reference change (different plane net after a via) and missing stitching via (same net,
  different layer, no via < 3 mm), line electrically long (λ/10 rule).
- Far-field orientation per source and line, chart with CISPR 32 B limits (3 m / 10 m).
- **Acceptance:** the demo board yields exactly the built-in sins as warnings; the
  "bad" switching-regulator loop has a higher far field than the "good" one.

### M7 Polish
- Ant view (first-person perspective just above the board, WASD/mouse), camera flights.
- Export: screenshot (PNG), slice plane as CSV, spectrum as CSV.
- English user interface (the dictionary exists from M0 on, the translation is done here).
- GitHub Pages deployment, performance optimisation, accessibility of the panels.
- Playwright smoke test: load the demo, compute, move the probe, compare a screenshot.

### M8 Optional
- Quasi-static E field via line charges q' = C'·V with image charges (PHYSICS.md §10).
- WebGPU compute kernel for Biot-Savart (factor 50–100 compared with the CPU); the CPU core remains the
  reference and fallback.

## 7. Test and validation strategy

1. **Analytical references** (Vitest, M2): see the acceptance criteria of M2. Tolerances ≤ 1 %.
2. **Format references** (M1): pcbnew exports pad positions, angles, nets and
   zone areas of the test boards as JSON; the parser must reproduce them.
3. **Plausibility** (M3/M6): above a microstrip line the field decreases with height
   like that of the line pair (≈ 1/r² for r ≫ h); differential pair < single line; a cut-out increases
   the field.
4. **Cross-check later:** stage 3 (openEMS) and stage 4 (measurement) on the same
   reference structures; deviations are documented in PHYSICS.md.
5. **User interface:** Playwright smoke test from M7 on.

## 8. Performance budget

| Operation | Target |
|---|---|
| Parse 10,000 elements | < 1 s |
| Plane raster 100×100 mm at 0.2 mm | < 200 ms |
| Field of one source, grid of 200k points, 2,000 elements, 8 workers | < 2 s |
| Recomposition (frequency/parameters) | < 30 ms |
| Probe: spectrum + sound per mouse move | < 5 ms |
| Rendering | 60 fps at 1080p, integrated GPU |

Memory: one Float32 volume per source (200k points ≈ 0.8 MB, Fine ≈ 6 MB);
vector fields are not stored (field lines are computed exactly).

## 9. Demo board "EMC sins"

4 layers (JLC04161H-7628), 80 × 50 mm, In1 = GND, In2 = +3V3. Deliberately contains:
1. **Switching regulator, good:** input capacitor directly at VIN/GND, short loop over a
   solid plane.
2. **Switching regulator, bad:** input capacitor 15 mm away, GND return as a separate
   trace on F.Cu, both planes cut out under the regulator.
3. **Clock, good:** 25 MHz oscillator with a short route to the controller, series resistor at the driver,
   solid plane.
4. **Clock, bad:** 33.3 MHz oscillator, long line across a slot in In1, layer change
   to B.Cu (reference +3V3) without a stitching via.
5. **USB differential pair** (Full Speed) with a small imbalance.
6. Slow signals (LED, push button) as a counter-example without any appreciable field.

Associated scenario (`public/demo/demo-board.scenario.json`) with all sources.

## 10. Risks and countermeasures

| Risk | Countermeasure |
|---|---|
| KiCad format variants (6–10) | tolerant parser, test corpus from several versions, pcbnew reference data |
| CPU computation too slow for large boards | coarse preview first, compute only the source nets, cache, later WebGPU (M8) |
| Quasi-statics taken at face value | limits of validity per source, "orientation" notes, PHYSICS.md linked |
| Volume rendering cluttered | slice plane as the default, dB window, isosurfaces later |
| Return current under cut-outs wrong | local coverage in the image model, warnings, real solution in stage 2 |
| Sound gets annoying | off by default, gentle loudness curve, mute/solo |
| Unclear reference planes on 2-layer boards | reference can be overridden per layer, "no reference plane" warning, fallback assumption visible |

## 11. Open questions for the project owner

1. ~~Licence~~ decided: 0BSD (DECISIONS.md no. 30).
2. Make the repo public, and from when?
3. Ship the user interface in German only, or bilingual from the start? (Since then decided: the UI speaks German and English, see DECISIONS.md no. 17 and §13.)
4. Target browsers: only current Chromium/Firefox, or Safari as well?

## 12. Definition of done for stage 1

- All milestones M0–M7 done, M8 consciously decided.
- Demo board and at least two real boards (2 and 4 layers) run without errors.
- Documentation (PHYSICS, ARCHITECTURE, README) describes the actual state.
- GitHub Pages shows the current version (provided the repo is public).

## 13. Implementation notes (deviations from and additions to the plan)

As of 2026-10-04, after the first pass through M0–M6.

- **Measured figures.** Demo board on the "Normal" grid (1 mm): all six sources in
  0.1–0.2 s (worker pool). Real boards (KiCad demos, own 4-layer board): 0.2–1.6 s
  per source on one core, i.e. well within the budget. Parser: 85 MB / 12 layers in 2.8 s.
- **Test corpus.** 42 boards from KiCad 6 to 10 are read without errors; pads, vias, trace
  lengths and zone areas match pcbnew for the demo and three KiCad demos.
- **Diagnostics on the demo.** Exactly the built-in faults are found (slot crossing,
  two reference changes GND ↔ +3V3, missing planes under the bad regulator, long clock);
  the good clock, the good regulator and the USB pair remain without a finding.
- **Vias in clearances.** A via sits in a hole of the plane it passes through. For
  the return path and the image, copper within a radius of 0.8 mm therefore counts (`coveredNear`).
- **Identical pad numbers** within a footprint (alternative holes, exposed pads) are
  one pin: they are connected together and counted only once as a load.
- **Trace ends** touch a pad or via as soon as their half width reaches the copper
  (BGA dogbones).
- **Slow signals** (e.g. 1 kHz) would have more than 4096 harmonics: every k-th line is
  kept and scaled by √k (the band power is preserved, PHYSICS.md §3.3).
- **Automatic dB window** 60 dB below the maximum; the glow is mostly emissive so that
  the board stays visible.
- **Hotspots**: local maxima at probe height, at most two per dominant source, so that
  quieter sources show up in the list.
- **Hang with sound (fixed):** the effect that writes the probe values called the
  audio update, which reads exactly those values; Svelte re-ran it again and again
  (around 5000 audio updates per mouse move, a 3 s freeze). Sound now runs in a separate,
  untracked effect, at most once per frame: 6 ms per mouse move.
- **Large boards:** plane raster with edge buckets per row (382 → 48 ms), large zones as a
  texture from the raster instead of 120,000 triangles, picking via a 2D index instead of raycasting
  (35 → 6 ms per mouse move), loading yields to the browser in between.
- **English:** a second dictionary with the same structure (TypeScript checks completeness),
  selection in the header bar, default according to the browser language, remembered in the browser. A language switch
  rebuilds the user interface (number format); board and results stay in the engine.
  The demo has an English scenario with English source names.
- **GitHub Pages:** deployment via `.github/workflows/pages.yml` as soon as the repo is public and
  the variable `PAGES_ENABLED` is set.
