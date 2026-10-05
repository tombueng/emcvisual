# Cross-cutting: PCB world, sound, integration

As of: 2026-10-04 · Status: ideas, preserved. These topics do not depend on any single
stage and can grow in parallel.

## W1 Immersion
- **WebXR:** the same scene on a VR headset (Quest browser), the board in the room,
  scale freely selectable ("ant size": 1 mm becomes 1 m). Hand controller = probe.
  **Implemented (2026-10-04), experimental:** where the browser supports "immersive-vr", the
  button "ENTER VR" appears in the 3D view. In the headset the board lies in front of you,
  magnified five times, at table height; instead of the glow (which needs the depth pass of
  the flat screen) it shows the isosurfaces. Not yet tested on a headset; the controller as
  a probe and the ant scale are still missing.
- **Ant view on the screen** (stage 1, M7): first-person perspective just above the board.
- **Guided tours:** learning paths across the demo board ("Why is this loop loud?"),
  with camera flights, text and sound examples.

## W2 Visual effects
- Isosurfaces (marching cubes / surface nets) as "bubbles" at selectable dB thresholds.
  **Implemented (2026-10-04):** surface nets, three translucent shells at 35, 60 and 85 %
  of the display range in the colours of the colour scale; switch "Isosurfaces" in the view
  (`src/render/isosurface.ts`).
- Particles that flow along the field lines (speed ∝ |H|).
- Heat-shimmer shader over hotspots, bloom/glow, fog volume.
- Colour by frequency band (e.g. red = clock harmonics < 100 MHz, blue = GHz).
- Time animation: a single source pulses at its frequency (slowed down); several sources
  produce beats; with phase (stage 3/5) travelling waves.
- Board as glass: layers semi-transparent, return currents visible underneath (stage 2).

- **Speech bubbles** (implemented 2026-10-04): HTML over the 3D view, pinned to points of the
  scene and repositioned after every rendered frame. Findings carry the same number as in
  the diagnostics ranking and show what fixing them gains in the far field; sources show
  their near-field maximum and margin to the limit, hotspots their level. Bubbles avoid
  each other (higher, then to the left, then below). A click opens the problem view or
  selects the source. Switch under "Speech bubbles in 3D" (`src/ui/Callouts.svelte`).
  - **By severity (2026-10-05):** red and yellow bubbles are placed first and never
    disappear: without free space they become compact (title, rating, far field; the rest
    on hover), then they take the least obscured position. If their location is outside
    the image or behind the camera, they wait at the edge, with an arrow showing the
    direction. Green findings are only dots with the text as a tooltip; a click opens the
    problem view. A source whose findings already have bubbles appears compact.
- **Speech bubbles in the scene** (implemented 2026-10-05, experimental): with HTML-in-Canvas
  (WICG, origin trial in Chrome and Edge since Google I/O 2026, extended until Chrome 160) the
  bubbles are real HTML elements as children of the WebGL canvas. three.js (`HTMLTexture`,
  `InteractionManager`, from r184) draws them as a texture on surfaces that face the viewer.
  Components in front of them hide them, they become smaller in the distance, and they also
  appear in VR, where the overlay cannot be seen. Clicks still reach them via CSS `matrix3d`.
  The texture is only created after the element's first `paint` event; before that the
  upload fails ("No cached paint record"). The bubbles avoid each other in image space just
  like the overlay. Switch "Inside the scene instead of an overlay", only where the browser
  supports it (`src/render/worldCallouts.ts`).
  - The site itself needs an origin trial token for https://tombueng.github.io
    (`originTrialTokens` in `seo.config.json`). Without a token it only works with
    `chrome://flags/#canvas-draw-element`.
  - Chrome 155 renames the API (`content="drawable"`, `texElementSubImage2D`). three.js r186
    still knows the older version; until three.js catches up, Chrome 155+ falls back to the
    overlay (detected via `texElementImage2D`).

## W3 Sound (sonification)
- **Linear/harmonic** (stage 1): clocks as tones, switching regulators as a buzz.
- **Logarithmic:** the whole RF range compressed into a few octaves (harmonics are no longer
  harmonic, but everything is audible). Separate oscillators per line.
- **Geiger counter** (implemented 2026-10-04): clicks as a Poisson process, rate logarithmic
  across the display window, 0.5 clicks/s at the lower and 100/s at the upper end; selection
  "Style" in the Sound section. Intuitive when searching.
- **Real sound:** AM-demodulated recordings at hotspots (stage 4/5).
- **Soundscape:** camera as the listener, all sources spatial (HRTF), loudness by distance
  and field.
- **Accessibility:** sound as a second channel for people who find colour scales hard to read.

## W4 KiCad integration

**Implemented (2026-10-04): live coupling without a bridge.** In Chromium browsers (Chrome,
Edge), "Open board" opens the file via the File System Access API, and so does dragging it in.
The app checks every second whether the file has changed; when KiCad saves, the board is
re-read, and sources, settings, view, camera and component models are kept. Components
that have been moved or rotated since the GLB export follow their footprint (the GLB places
each node at the footprint origin). A half-written state is retried up to three times. A
click on the "live" badge next to the file name stops following the file. Code:
`src/state/liveFile.svelte.ts`; E2E test with a mocked file handle. Firefox and
Safari open the file once, as before.

**Implemented (2026-10-05): real component models from your own libraries.** The
footprints name their model as a path with variables (`${KIPRJMOD}`, `${KICAD10_3DMODEL_DIR}`,
custom ones). The app searches for the file name without extension in a chosen folder (File
System Access API or `<input webkitdirectory>`), in GitHub repositories (one request to the
Trees API, the files from `raw.githubusercontent.com`), next to a board opened via a link
and in KiCad's library on gitlab.com (file API with CORS; the GitHub mirror
`KiCad/kicad-packages3D` has been archived since 2021, and since KiCad 9 there is only STEP).
Placement works as in KiCad's 3D viewer: footprint position and rotation, bottom side
mirrored, then offset, rotation (as −z, −y, −x) and scale of the model; WRL in units of
0.1 inch. Checked against KiCad's GLB export: identical to within 0.15 mm
(`tests/modelPlacement.test.ts`). STEP files are broken down by OpenCascade compiled to
WebAssembly (7.6 MB, only loaded on the first STEP file) in a worker; colours per face become
material groups. Each file is loaded once and shared by all components and boards. Code:
`src/render/modelLibrary.ts`, `modelPlacement.ts`, `step.worker.ts`.

- **Live coupling:** KiCad 9/10 has an IPC API (Python bindings). A small local bridge
  reads the open board and streams changes to the browser app: move a via in
  KiCad → the field updates. The same bridge can later start openEMS (stage 3).
- **Action plugin:** a button in pcbnew opens the app with the current board.
- **Back channel:** hotspots and warnings as DRC markers or comments back into KiCad.
- **Net classes/rules:** source suggestions from net classes (e.g. "HighSpeed").
- **Schematic data:** netlist and component values (e.g. series resistor, load capacitance,
  clock frequency from fields) for better source parameters.

## W5 Comparisons and reports

**Implemented (2026-10-04): report.** "Save report" in the Diagnostics tab writes an HTML
file without external dependencies: image of the 3D view, key figures, layout findings,
hotspots with location and neighbourhood, far-field margin per source against CISPR 32 B,
sources and settings (including the field source: fast or openEMS). Light and printable, can
be saved as PDF from the browser; in the language of the user interface (German or English).
Code: `src/report/`.

- **Variants:** load two board revisions or two scenarios, difference volume in dB.
- **Sim ↔ measurement:** same display, difference, calibration factor.
- **Report:** HTML/PDF with hotspots, spectra, warnings, far-field estimate, images.

## W6 Platform
- WebGPU compute kernel (stage 1 M8), later also for the stage 2 solver.
- Command-line variant (Node) for CI: "field regression" on every commit of a
  hardware project (hotspot became 6 dB louder → finding reported in the pull request).
  **Implemented (2026-10-04):** `src/cli/`, instructions in [../CI-FIELD-CHECK.md](../CI-FIELD-CHECK.md).
- Plugin interface for custom source types.

## W7 Knowledge
- Library of reference structures (test boards with measured data and simulation).
- Explanatory texts for every warning with a literature reference.
