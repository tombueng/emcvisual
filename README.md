# emcvisual

> Working title. The name lives only in `branding.config.json` and can be changed with a script,
> see [docs/RENAMING.md](docs/RENAMING.md).

**Try it in the browser:** https://tombueng.github.io/emcvisual/

You cannot see the electromagnetic fields of a circuit board. This tool computes them from a
board file and turns them into a **3D world you can look at and listen to**: where does it glow,
where does it hum, and what happens when the edge gets slower or the input capacitor moves closer
to the switching regulator?

It also checks about 30 known EMC layout mistakes, says what to do first, explains every finding
with its calculation and fix, and each time says why the statement could be wrong here. It is
built on a catalogue of mistakes with sources
([docs/research/EMC-MISTAKES-CATALOGUE.md](docs/research/EMC-MISTAKES-CATALOGUE.md)), a technical
review ([docs/review/TECHNICAL-REVIEW-2026-10.md](docs/review/TECHNICAL-REVIEW-2026-10.md)),
generated boards with each mistake as a test bench, and a comparison with a full-wave simulation.

Everything runs in the browser. The board file does not leave your computer. The user interface
speaks English and German.

![Demo board with field, diagnostics and spectrum](docs/images/app-demo.png)

## What it reads

| Format | From |
|---|---|
| KiCad `.kicad_pcb` (6 to 10) | KiCad |
| IPC-2581 `.xml` | Altium Designer, Cadence Allegro/OrCAD, Siemens PADS/Xpedition, Zuken, KiCad |
| ODB++ archive `.tgz` / `.zip` | the same tools and most CAM software |
| Eagle `.brd` (XML, Eagle 6 and later) | Autodesk Eagle, Fusion 360 Electronics |
| native files of Altium, Allegro, EasyEDA, CADSTAR, PADS, P-CAD, … | through KiCad's importers (`tools/convert/to_kicad.py`), then as `.kicad_pcb` |

Boards from IPC-2581 and ODB++ exports give the same board and the same results as the KiCad
original (checked on real boards). Eagle stores only the outlines of copper pours; the app pours
them itself, the way Eagle does. Details, export settings and limits:
[docs/IMPORT.md](docs/IMPORT.md).

## What it does

**Stage 1 (M0–M6), working:** quasi-static simulation of the magnetic near field (Biot–Savart with
image currents in the reference planes), and with it:

- import of KiCad, IPC-2581, ODB++ and Eagle boards; reference planes are detected, sources
  suggested from net names and parts
- sources: clock and data lines (also across series resistors), differential pairs, current
  loops of switching regulators (pads also picked in 3D), storage inductors
- the field as a glowing volume, isosurfaces, a slice plane, field lines of the selected source,
  ant view
- speech bubbles in 3D: the findings numbered at their place on the board (with their effect on
  the far field), sources with near field and distance to the limit, hotspots on request
- a virtual near-field probe with a spectrum analyser, a far-field estimate against selectable
  standards (CISPR 32, CISPR 11, CISPR 14-1, FCC Part 15) with an explanation of each standard
- sound: every source has a voice, loud where its field is strong
- diagnostics: interrupted return paths (also plane splits and narrow slots), reference changes
  at vias, missing stitching vias, unterminated lines with a resonance in the measured range,
  lines at the plane edge, signal layers without an adjacent plane, lines without a reference
  plane, hot loops and switch nodes of regulators, common mode with cables and crosstalk into
  cable lines (worst-case estimates), the regulators' switching current on the supply cable,
  filters bypassed by overlapping copper, filters and shields at connectors, ESD protection at
  USB/HDMI connectors, decoupling, crystals at the edge or a connector. All rules with threshold,
  origin and test board: [docs/RULES.md](docs/RULES.md). The findings are ordered by their share
  of the computed far field; the number on a bubble says what fixing only this spot changes in
  the model. Every finding has a priority (red, yellow, green), an explanation with the
  calculation, the fix, things to avoid, and the reasons why the statement could be wrong here
- real 3D part models: from your model folder or a GitHub repository (STEP, WRL, GLB, STL, found by
  file name), standard parts from KiCad's library, or from KiCad's GLB export
- scenarios as JSON, PNG and CSV export, an EMC report as HTML (printable as PDF)

Plan, acceptance criteria and notes: [docs/stage-1/PLAN.md](docs/stage-1/PLAN.md).

**Stage 2 (in progress):** return currents detour around slots in the plane and jump through the
nearest stitching via or capacitor at a layer change (the detours are shown in 3D); electric field
from line and node charges; stray field of open and shielded storage inductors. Details:
[docs/future/STAGE-2-PLANE-CURRENTS.md](docs/future/STAGE-2-PLANE-CURRENTS.md).

**Stage 3 (in progress):** full wave with openEMS. The app exports a job,
`tools/openems/run_job.py` computes it locally, and the result can be loaded next to the fast
model as a second field source: volume, probe, scan and far field. In the quasi-static range both
agree to about 1 dB; on a validation board the fast far field agrees with openEMS within 1 dB
between 30 and 350 MHz. Details: [tools/openems/README.md](tools/openems/README.md),
[docs/future/STAGE-3-FULL-WAVE.md](docs/future/STAGE-3-FULL-WAVE.md).

**Field check for CI:** the same calculation as a Node script. It reports near field, far-field
margin and layout findings per source and fails when a pull request makes something worse. The
script is at https://tombueng.github.io/emcvisual/cli/field-check.mjs, instructions in
[docs/CI-FIELD-CHECK.md](docs/CI-FIELD-CHECK.md).

**Stage 4 (in progress):** the "Measure" tab: a 3D printer moves a near-field probe over the
board, a receiver measures a spectrum at each point, and the result appears as a slice at the
measuring height and as a difference to the simulation. A virtual rig measures the simulation and
shows the whole chain without hardware; the drivers for OctoPrint, G-code over USB and the tinySA
are written but not yet tried on a device. Details:
[docs/future/STAGE-4-SCANNER.md](docs/future/STAGE-4-SCANNER.md).

What comes later (plane solver, phase and waves, hand probe, VR):
[docs/ROADMAP.md](docs/ROADMAP.md).

## Getting started

```bash
npm install
npm run dev
```

Then choose "Load demo board" in the browser, or drop your own board on the window
(`.kicad_pcb`, IPC-2581 `.xml`, ODB++ `.tgz`/`.zip` or Eagle `.brd`). In Chrome and Edge the app
follows the opened file: every save in the CAD program reloads the board, and sources and view
stay (badge "live" next to the file name). The step-by-step guide to every panel is
[docs/USER-GUIDE.md](docs/USER-GUIDE.md).

Real part models (right, under "Real 3D part models"): a KiCad board names only the path of each
part's model, such as `${KIPRJMOD}/3d/Relay.step` or
`${KICAD10_3DMODEL_DIR}/Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm.step`. The app looks for the
file by its name:

- in a **folder** on your computer ("Choose a folder with models …", with subfolders; the files
  stay in the browser),
- in a **GitHub repository** (`https://github.com/<owner>/<repo>` or a subfolder
  `…/tree/<branch>/<path>`),
- in the **project folder** of a board opened by link (`${KIPRJMOD}/…` sits next to the
  `.kicad_pcb`),
- in **KiCad's standard library** (from gitlab.com, STEP; can be switched off).

If a model exists several times, the same library folder wins, then STEP before GLB, WRL and STL.
STEP is triangulated in the browser with OpenCascade (WebAssembly, in the background), with the
colours from the file. Parts without a model found are listed.

Alternatively KiCad's own export: "File → Export → glTF/GLB" (without the board body) or
`kicad-cli pcb export glb --no-board-body --subst-models board.kicad_pcb`, then drop the `.glb`
on the window as well. The parts are matched by their reference; the GLB takes precedence over the
libraries. Boards from other CAD tools carry no model references; their parts are shown as boxes.

### Example boards to try

Public KiCad projects, loaded straight from GitHub (also under "Examples …" in the app):

| Board | What is on it | Licence |
|---|---|---|
| [Glasgow revC3](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2FGlasgowEmbedded%2Fglasgow%2FHEAD%2Fhardware%2Fboards%2Fglasgow%2FrevC3%2Fglasgow.kicad_pcb) | USB interface with FPGA, level shifters, 4 layers | 0BSD |
| [HackRF One](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2Fgreatscottgadgets%2Fhackrf%2FHEAD%2Fhardware%2Fhackrf-one%2Fhackrf-one.kicad_pcb) | SDR 1 MHz to 6 GHz, USB, clocks, RF section | GPL-2.0 |
| [Cynthion](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2Fgreatscottgadgets%2Fcynthion-hardware%2FHEAD%2Fcynthion.kicad_pcb) | USB analyser, 6 layers, several USB PHYs | CERN-OHL-P-2.0 |
| [Olimex ESP32-POE Rev M2](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2FOLIMEX%2FESP32-POE%2FHEAD%2FHARDWARE%2FESP32-PoE-hardware-revision-M2%2FESP32-PoE_Rev_M2.kicad_pcb) | ESP32 with Ethernet (50 MHz clock) and PoE converter, split planes | Apache-2.0 |
| [OtterCastAudio V2](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2FOttercast%2FOtterCastAudioV2%2FHEAD%2FOtterCastAudioV2.kicad_pcb) | Audio streamer with SoC, Ethernet and USB | MIT |

The boards belong to their projects and are under their licences; they are not in this
repository.

Boards can also be opened by link: `?demo` loads the demo, `?board=<URL>` a board file (any of the
formats above) from a server that allows cross-origin reads (e.g. `raw.githubusercontent.com`),
optionally with `&models=<URL>` for a GLB.
Example: [Glasgow revC3](https://tombueng.github.io/emcvisual/?board=https://raw.githubusercontent.com/GlasgowEmbedded/glasgow/HEAD/hardware/boards/glasgow/revC3/glasgow.kicad_pcb).

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm test` | tests (physics against analytic solutions, parsers against pcbnew reference data, importers against KiCad's exports, the EMC test boards) |
| `npm run e2e` | Playwright tests in the browser (once before: `npx playwright install --only-shell chromium`) |
| `npm run check` | type check (TypeScript and Svelte) |
| `npm run build` | static site into `dist/`, and the field check into `dist/cli/` |
| `npm run field-check -- board.kicad_pcb --scenario s.json` | field check without a browser, e.g. in CI; also takes IPC-2581, ODB++ and Eagle files ([docs/CI-FIELD-CHECK.md](docs/CI-FIELD-CHECK.md)) |
| `npm run demo-board` | regenerate the demo board with KiCad (pcbnew Python) |
| `npm run check:codename` | checks that the working title appears only where it may |

## What the simulation can and cannot do

It shows **where** current loops create magnetic fields and how changes to loop area, return path
and edges affect those fields, and it finds the known layout mistakes (checked on generated boards
with each mistake, `tools/emc-cases`). It does **not** predict whether a device passes an EMC
test: tests mostly fail on common-mode currents on cables, which the app estimates only roughly
for the worst case; there are no resonances and no enclosure. Every explanation says why its
number could be wrong here. Assumptions and limits are in
[docs/stage-1/PHYSICS.md](docs/stage-1/PHYSICS.md), the known kinds of mistakes in
[docs/research/EMC-MISTAKES-CATALOGUE.md](docs/research/EMC-MISTAKES-CATALOGUE.md), the
technical review in [docs/review/TECHNICAL-REVIEW-2026-10.md](docs/review/TECHNICAL-REVIEW-2026-10.md).

## Documentation

- [docs/USER-GUIDE.md](docs/USER-GUIDE.md): how to use the app, panel by panel, with a FAQ and a
  glossary
- [docs/IMPORT.md](docs/IMPORT.md): boards from other CAD tools (IPC-2581, ODB++, Eagle)
- [docs/RULES.md](docs/RULES.md): every finding with threshold, origin, confidence and test board
- [docs/research/EMC-MISTAKES-CATALOGUE.md](docs/research/EMC-MISTAKES-CATALOGUE.md): 40 layout
  mistakes with mechanism, lab symptom, detection rule, fix and sources
- [docs/stage-1/PHYSICS.md](docs/stage-1/PHYSICS.md): model, formulas, validity, literature,
  comparison with full wave
- [docs/stage-1/ARCHITECTURE.md](docs/stage-1/ARCHITECTURE.md): structure of the app
- [docs/stage-1/PLAN.md](docs/stage-1/PLAN.md): goals, milestones, acceptance criteria
- [docs/review/TECHNICAL-REVIEW-2026-10.md](docs/review/TECHNICAL-REVIEW-2026-10.md): review of the
  physical and normative statements
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions with their reasons
- [docs/ROADMAP.md](docs/ROADMAP.md): stages and dependencies
- [docs/future/](docs/future/): stages 2 to 5 and cross-cutting topics
- [docs/CI-FIELD-CHECK.md](docs/CI-FIELD-CHECK.md): the field check in CI
- [docs/AI-PARTS-MANUAL.md](docs/AI-PARTS-MANUAL.md): how an AI agent can fill in the source
  parameters of a board

## Licence

[0BSD](LICENSE) (Zero-Clause BSD): anyone may use, change and share the code for any purpose,
also commercially, without attribution. openEMS (stage 3) is under GPL-3.0 and installed
separately; it is not part of this repository. To read STEP models the app loads
[occt-import-js](https://github.com/kovacsv/occt-import-js) (OpenCascade as WebAssembly,
LGPL-2.1) unchanged as its own worker with its own `.wasm` file; its licence applies to it.
