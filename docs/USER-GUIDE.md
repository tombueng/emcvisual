# User guide

As of: 2026-10-05

This guide explains how to use the app to check a PCB layout for EMC problems: what it computes,
how to set it up for your board, how to read the results and how far you can trust them. It is
written for hobbyists and professional hardware developers who know electronics but have not used
the app before.

The address of the hosted app is in the [README](../README.md). The interface speaks English and
German; this guide uses the English labels and writes them in **bold**.

![The demo board with sources, field glow, layout hints and spectrum](images/app-demo.png)

*The demo board: sources on the left, the field as a glow in the middle, findings on the right,
the spectrum analyser at the bottom. The screenshot shows the German interface; some panels have
changed since.*

## Contents

1. [What the app does, and what it does not](#1-what-the-app-does-and-what-it-does-not)
2. [Getting started](#2-getting-started)
3. [Sources](#3-sources)
4. [The 3D view](#4-the-3d-view)
5. [Diagnostics](#5-diagnostics)
6. [Probe, spectrum analyser and sound](#6-probe-spectrum-analyser-and-sound)
7. [Saving, reports and exports](#7-saving-reports-and-exports)
8. [Measuring: near-field scanner](#8-measuring-near-field-scanner)
9. [Full wave with openEMS](#9-full-wave-with-openems)
10. [Command-line field check for CI](#10-command-line-field-check-for-ci)
11. [Troubleshooting and FAQ](#11-troubleshooting-and-faq)
12. [Glossary](#12-glossary)
13. [Further reading](#13-further-reading)

---

## 1. What the app does, and what it does not

### 1.1 In short

You open a board file and tell the app which nets carry fast signals and where switching
currents flow (the **sources**). From the copper geometry and these values the app computes:

- the **magnetic near field** (optionally the electric field) in a volume around the board,
  shown as a glowing 3D cloud, as shells, as a slice or as field lines;
- a **virtual near-field probe** with a spectrum-analyser display, which you move over the board
  with the mouse, and which you can also listen to;
- an **estimate of the radiated far field** at 3 m and 10 m against a selectable emission
  standard (CISPR 32, CISPR 11, CISPR 14-1, FCC Part 15);
- a **check for 28 kinds of known EMC layout mistakes**: return paths over plane gaps, reference
  changes at vias, hot loops of switching regulators, common mode on cables, filters, shields,
  crystals, decoupling, ESD protection and more. Each finding comes with a priority, a plain
  explanation, the fix, what to avoid, and the reasons why the statement may be wrong for your
  board.

### 1.2 The models behind it

| Result | How it is obtained | How solid |
|---|---|---|
| Magnetic near field | Biot–Savart over straight current elements on the copper. The return current is either an image current in the reference plane (stage 1) or a real detour around gaps and through the nearest stitching via or capacitor (stage 2, the default) | computed, quasi-static |
| Electric near field | quasi-static, from charges on traces and pads with their image below the plane | computed, optional |
| Far field at 3 m / 10 m | magnetic dipole moment of the source's current, with the return current in the plane, worst-case floor reflection | orientation; **differential mode of the board only** |
| Common mode with cables, crosstalk into cable lines | published formulas of the Clemson University EMC expert system, assuming a resonant cable at every frequency | worst-case estimate; rated 6 dB more cautiously |
| Board rules (filters, shields, crystals, decoupling, …) | geometry with guide values from the literature | rule; no dB figure |
| Full wave (optional) | openEMS (FDTD), run locally outside the browser | more accurate; see [section 9](#9-full-wave-with-openems) |

The physics, formulas and validity limits are in [stage-1/PHYSICS.md](stage-1/PHYSICS.md); the
reasoning behind the design choices is in [DECISIONS.md](DECISIONS.md).

### 1.3 What it does not do

- **It is not a compliance test.** The report says so in its header: "Simulation for orientation,
  not a compliance test". Tests usually fail on common-mode currents on cables; the app estimates
  these only roughly, as a worst case, and they often exceed the board's differential-mode
  emission by 20 dB or more.
- **No resonances, no propagation delay** in the fast model: lines are treated as electrically
  short and the field as quasi-static. The app shows where that stops being valid (see
  [11.3](#113-how-meaningful-is-a-number)).
- **No enclosure, no real cables, no ringing** of switching edges, no overshoot of real signal
  edges, no skew-driven common mode of differential pairs.
- **It only knows what you tell it.** Frequencies, edge times, currents and load capacitances
  come from you (or from the suggestions, which are guesses). Every number scales with them.
- **Reference planes are detected automatically** and can be wrong; check them (see
  [4.9](#49-layers-and-reference-planes)).
- It does not change your board file.

### 1.4 Your board stays on your computer

Everything is computed in the browser; the field volumes are computed in background workers. A
board you open from your disk is not uploaded anywhere. The app does make network requests in
these cases:

| When | What is requested |
|---|---|
| You open an example board or a `?board=` link | the board file (and an optional GLB) from that address |
| A board opened by link names models in its project folder | those model files, from the same address |
| **Load KiCad's standard library from the web (gitlab.com)** is ticked (the default) | the 3D model files of footprints that refer to KiCad's standard 3D library, by file name, from gitlab.com. Untick it to stop this |
| You add a **GitHub repository with models** | the repository's file list and model files from GitHub |
| You use the scanner with OctoPrint | the printer commands, to the address you enter |
| You click **Manual for AI** | the manual on the app's website |

Sources, settings and view are kept in the browser's local storage (see
[2.6](#26-what-is-kept-automatically)); they never leave the browser unless you save a file.

### 1.5 Browser requirements

- A desktop browser with WebGL 2 for the 3D view.
- Some features need interfaces that only some browsers offer; where they are missing, the app
  falls back or greys the option out:

| Feature | Needs | Without it |
|---|---|---|
| Live reload of a KiCad board when you save it | File System Access API (Chrome, Edge) | the file is read once |
| **Choose a folder with models …** | a folder picker | a folder upload field is used instead |
| Scanner over USB (**G-code over USB**, **tinySA (USB)**) | Web Serial | the options are disabled |
| **Inside the scene instead of an overlay (HTML-in-Canvas)** | HTML-in-Canvas (Chrome or Edge with the origin trial or `chrome://flags/#canvas-draw-element`) | the bubbles stay an overlay |
| VR | WebXR with immersive VR | no VR button |

---

## 2. Getting started

### 2.1 The screen at a glance

| Area | Contents |
|---|---|
| Top bar | the app's name with a "working title" badge, the open file, the **live** badge when the file is followed; **Open board**, **Demo board**, **Examples …**, **Save scenario**, **Load scenario**, **Save image**, **Ant view**, **Grid**, the language selector (DE/EN) and the computation status ("Computing field … %", then "computed in … s") |
| Left | **Sources**: the list of sources, the editor of the selected one, and the suggestions from the board |
| Centre | the 3D view. Bottom left a status line: the net and layer under the mouse, whether the probe **follows the mouse** or is **pinned (click releases)**, prompts while picking in 3D |
| Right | three tabs: **View** (display settings), **Diagnostics** (findings, with their number on the tab), **Measure** (scanner) |
| Bottom | the spectrum analyser with the **Probe** and **Sound** controls |

In windows narrower than 1100 px the right panel is hidden; the **Settings** button in the top bar
opens it as a drawer. Below 760 px the layout becomes a single column (3D view, spectrum, then the
sources), and only **Open board** and **Demo board** stay in the top bar.

### 2.2 Opening a board

**Supported formats:** KiCad `.kicad_pcb` files from KiCad 6 to 10. IPC-2581, Eagle/Fusion 360
and ODB++ (see [IMPORT.md](IMPORT.md)): IPC-2581 `.xml` from Altium, Allegro/OrCAD,
PADS/Xpedition, Zuken and KiCad; Eagle/Fusion 360 `.brd`; ODB++ archives. [IMPORT.md](IMPORT.md)
describes what each importer reads and what it approximates. Native files of Altium, Allegro,
EasyEDA, CADSTAR, PADS and others can be converted with KiCad first (File → Import → Non-KiCad
Board File, or `tools/convert/to_kicad.py`) and then opened as `.kicad_pcb`.

There are five ways to open a board:

1. **Drag and drop** the file onto the window ("Drop to open" appears). You can drop several files
   at once: the board is read first, then 3D models (`.glb`), scenarios (`.json`) and full-wave
   results (`.fullwave.bin`).
2. **Open board** in the top bar, or **Choose file** on the start page.
3. **Demo board** in the top bar, or **Load demo board** on the start page.
4. **Examples …** in the top bar, or the list on the start page: public boards loaded straight
   from GitHub. The address bar then holds a `?board=` link you can share.

   | Board | What is on it | Licence |
   |---|---|---|
   | Glasgow revC3 | USB interface with FPGA and level shifters, 4 layers | 0BSD |
   | HackRF One | SDR 1 MHz to 6 GHz, 4 layers, USB, clocks, RF section | GPL-2.0 |
   | Cynthion | USB analyser, 6 layers, several USB PHYs | CERN-OHL-P-2.0 |
   | Olimex ESP32-POE Rev M2 | ESP32 with Ethernet (RMII, 50 MHz clock) and PoE converter, split planes | Apache-2.0 |
   | OtterCastAudio V2 | Audio streamer with SoC, Ethernet and USB | MIT |

5. **A link:** append `?board=<address of the board file>` to the app's address. The server must
   allow cross-origin reads (`raw.githubusercontent.com` does). Optionally add
   `&models=<address of a KiCad GLB export>` for the part models. `?demo` opens the demo board.
   Models that the board names relative to its project folder (`${KIPRJMOD}/…`) are fetched
   from the same address as the board.

After loading, the app detects the reference planes, suggests sources, runs the board rules (so
the **Diagnostics** tab may already show findings before you have any source) and starts
computing the field for any sources it restored. If the file cannot be read, a message says
"The file is not a readable board (KiCad, IPC-2581, Eagle or ODB++)." or, when an importer
knows the reason, "The board could not be read: …" (for example for a binary Eagle file from
before version 6). When the file lacks something the analysis needs (no stack-up, no closed
outline, Eagle pours that had to be computed), the **Diagnostics** tab lists it under
**Notes on the file**, with what was assumed instead.

### 2.3 Live reload when you save the board

In Chrome and Edge the app can follow a board file (any of the supported formats): every time
you save or export it again, the board reloads and your sources, settings, view, camera and part
models stay.

1. Open the file with **Open board** or by dragging it onto the window (not by link).
2. A message says "Following the file: saving it in the CAD program reloads the board." and a
   **live** badge appears next to the file name.
3. Save in the CAD program (or export the IPC-2581/ODB++ file again over the same file). After
   about a second: "Board reloaded (file saved again)".
4. To stop following, click the **live** badge.

If KiCad is still writing the file, the app retries; after three failed attempts it says "Could
not read the new version of the file; waiting for the next save." If the file disappears or the
permission is withdrawn, it stops following ("The file is no longer reachable; stopped
following.").

### 2.4 A first tour with the demo board

The demo has a good and a bad buck converter, two clocks (one across a slot in the ground plane)
and a USB pair. It comes with eight sources already set up: the two buck hot loops, the two
clocks, the USB full-speed pair, a slow 1 kHz LED line and two storage inductors (one open, one
shielded), plus 3D part models.

1. Click **Load demo board**. Wait until the status reads "computed in … s".
2. Look at the glow: bright regions are strong magnetic field. The sprawling buck loop glows far
   more than the tight one.
3. Open the **Diagnostics** tab. **What to do first** lists the most important steps; below it,
   **Layout hints** lists every finding.
4. In the list, click a finding of the source "Clock 33.3 MHz, across the slot". The view switches
   to the **problem view** of that finding: only the copper concerned, the planes pulled apart,
   the detour of the return current, a suggested fix in green, and a card on the left explaining
   the finding.
5. In the card, under **Inputs that decide the result**, change **Rise time** from `1 ns` to
   `3 ns` and press Enter. The **Emission at 3 m** spectrum and the priority update at once.
6. Click **Back to the whole board** (or press Esc).
7. Move the mouse over the board. The probe follows the mouse and the spectrum analyser shows the
   field spectrum at that spot. Click once to pin the probe, click again to release it.
8. In the spectrum analyser, switch from **Probe** to **Far field 3 m** to see the far-field
   estimate of all sources against the limit line of the selected standard.

### 2.5 Your own board in three steps

These are the three steps the start page shows:

1. Load a board.
2. On the left, accept the detected clocks, data lines and switching regulators and **check
   their values** (frequency, rise time). See [section 3](#3-sources).
3. On the right under **Diagnostics** you find what to do first; a click on a hint shows the spot
   with an explanation. See [section 5](#5-diagnostics).

Before trusting any finding, also check the reference planes under **View → Layers**
([4.9](#49-layers-and-reference-planes)).

### 2.6 What is kept automatically

- Sources, settings (grid, spectrum limit, plane overrides, return-current model, standard) and
  view settings are saved in the browser's local storage, keyed by a fingerprint of the board
  file's content. When you open **the same file** again, they come back.
- A **changed** file has a different fingerprint, so nothing is restored, except through live
  reload, which carries everything over. To keep your work across board revisions, use
  **Save scenario** and **Load scenario** ([7.1](#71-scenarios)).
- The language and the choice for KiCad's standard model library are remembered as well.
- Clearing the site data in the browser removes all of this.

### 2.7 Grid and language

**Grid** sets the spacing of the field volume: **Preview (2 mm)**, **Normal (1 mm)** (default),
**Fine (0.5 mm)**. The volume reaches 6 mm beyond the board edges, 12 mm above F.Cu and 6 mm below
the bottom layer. It is limited to 1.5 million points; on large boards the spacing is coarsened
automatically. Changing the grid recomputes everything.

The language selector (DE/EN) switches the interface; the default follows the browser language.
Board, sources and results stay when you switch.

---

## 3. Sources

### 3.1 What a source is

A source describes one thing on the board that drives a fast current. Its **geometry** comes from
the board: nets, pads and copper. Its **electrical values** (frequency, edge time, voltage or
current, load) come from you. Every field value, every far-field margin and the priority of most
findings scale with these values, so they are worth a few minutes with the datasheets.

There are four types:

| Type (menu entry) | Use it for | Current model |
|---|---|---|
| **Clock or data line** | clocks, SPI, SDIO, RMII, fast GPIO, single-ended buses | the driver charges the line and receiver capacitances, or drives a terminated line |
| **Differential pair** | USB, Ethernet, LVDS and similar | two nets with opposite currents and a small imbalance |
| **Current loop** | hot loop of a switching regulator | a trapezoidal current around a closed path of pads |
| **Inductor (stray field)** | storage inductor of a switching regulator | a small horizontal multi-turn loop in the part body |

### 3.2 Suggestions from the board

Below the source list, **Suggestions from the board** lists what the app guessed from net names
and pin functions, each with the reason. Click **Add** for one or **Add all** for all of them.
Suggestions already added disappear from the list. **Always check the values afterwards:** they
are placeholders.

| Reason shown | Recognised by | Values assumed |
|---|---|---|
| Net name looks like a clock | names containing CLK, SCK, SCLK, MCLK, BCLK, LRCLK, XTAL, XIN, XOUT, OSC, XO | frequency from the name if it contains one (e.g. `CLK_48M` → 48 MHz), else 25 MHz; 1 ns; 3.3 V |
| Net name looks like a data line | MOSI, MISO, SDA, SDO, SDI, DATA, TXD, RXD, TX, RX, QSPI, SPI_, D0 … | 10 Mbit/s; 2 ns; 3.3 V |
| I²C line (assumed 400 kbit/s, edges about 100 ns) | SDA, SCL, I2C | as the reason says |
| UART line (assumed 115200 baud, fast edges) | UART, TXD, RXD, TX, RX | 115200 bit/s; 5 ns |
| USB data pair (assumed full speed, 12 Mbit/s; …) | a pair whose name contains USB | 12 Mbit/s; 4 ns; 3.3 V |
| Differential pair by name | a net ending in `+`, `_P`, `DP` or `D+` with a matching partner ending in `-`, `_N`, `DN` or `D-` | 100 Mbit/s; 0.5 ns; 0.4 V |
| Switching regulator with input capacitor | a part with pins whose function is VIN/PVIN/VCC/VDD/IN, GND/PGND/VSS/AGND and SW/LX/PH/PHASE, plus a two-pin part between VIN and GND | loop capacitor → VIN → GND → capacitor; 500 kHz; 30 %; 5 ns; 1 A; switch-node swing 12 V (a guess) |
| Boost converter: hot loop through the output capacitor | as above, with an inductor (`L…`) between SW and VIN and a VOUT/OUT/VO pin | loop through the output capacitor; values as above |
| Storage inductor at the switching node | a two-pin part `L…` with a pad on a switch node | semi-shielded; 500 kHz; 30 %; 0.6 A ripple |

Clock and data suggestions use a capacitive load of 5 pF per receiver; pairs have 5 %
imbalance. Only routed nets are suggested, single lines only with at least two pads. Regulators are only recognised
when the footprint's pads carry pin functions (KiCad copies them from the schematic symbol); if
yours are not suggested, add the loop by hand ([3.7](#37-current-loop)).

### 3.3 Managing the source list

- **Add source** opens a menu: **Clock or data line**, **Differential pair**, **Current loop**,
  **Inductor (stray field)**. The new source is selected so you can fill it in.
- **Click a source** to select it. Its editor opens below the list, its nets are highlighted in
  3D, and the field lines (if switched on) follow it.
- The checkbox (**Source on/off**) switches a source off: it then leaves the field, the far
  field, the spectrum and the findings, but keeps its settings.
- **✕** (**Remove source**) deletes it.
- Each source gets a colour, used for its list entry, its spectrum lines and its bubbles.
- A **!** next to a source means it cannot be computed. The editor then says "Cannot compute this
  source:" followed by the reason:

| Message | What to do |
|---|---|
| The net has no pads. | pick another net |
| No line or load capacitance found. | check nets and load model |
| The net has no traces yet. | route the net first |
| Net not found / Pad not found / Part not found | correct the name (the field turns red when it does not match the board) |
| Driver pad not found | correct it or leave it empty for automatic |
| No termination pad found. | use the capacitive load model or check the nets |
| A loop needs at least two pads. | add pads |

### 3.4 Typing values

Value fields understand engineering notation: `25 MHz`, `1 ns`, `3.3 V` or `3,3 V`, `4.7u`,
`2e6`.

- **Only the prefix counts**; the unit symbol is ignored. `m` is milli, `M` is mega.
- **A bare number is in the base unit** (Hz, s, V, A, F, Ω). `5` in **Rise time** means
  5 seconds; write `5 ns` or `5n`.
- Enter or leaving the field applies the value; Esc discards the edit. An invalid value makes the
  field flash red and the old value comes back.
- Net and pad fields offer the board's names as suggestions while you type; a name that does not
  exist on the board is marked red.

What a change costs: frequency, rise time, duty cycle and amplitude only re-weight the stored field
pattern and take effect at once. Changing nets, pads, driver, load or construction recomputes the
source's field volume.

### 3.5 Clock or data line

| Field | What to enter | Default (added by hand) |
|---|---|---|
| **Name** | free text | New signal |
| **Kind** | **Clock**, or **Data (worst case 1010…)**: data is computed as the alternating pattern, the strongest case | Clock |
| **Nets** | the net of the line. When a series resistor sits in between, add **both** nets (**Add net**, or **Pick in 3D** and click a trace): the resistor is bridged | – |
| **Driver pad** | the output pad, e.g. `U3.12`. Empty (**automatic**): the first pad whose pin type is output, then power output, tri-state, bidirectional, open collector; without pin types, simply the first pad | automatic |
| **Frequency** / **Bit rate** | clock frequency; for data the bit rate (the field changes its name) | 25 MHz |
| **Rise time** | the driver's output rise/fall time (10–90 % or 20–80 %), from "AC/switching characteristics" or the GPIO speed setting. Typically 0.2–20 ns | 1 ns |
| **Duty cycle** | high time / period; oscillators 45–55 % | 50 % |
| **Voltage** | output swing, about the driver's I/O supply; typically 1.2–5 V | 3.3 V |
| **Load model** | **Capacitive (short CMOS line)** for unterminated CMOS lines; **Terminated (I = V/Z0)** for terminated lines | Capacitive |
| **Input capacitance per receiver** | the receiver's input or pin capacitance; typically 2–10 pF | 5 pF |
| **Z0 (0 = from geometry)** | line impedance of a terminated line; 0 computes it from the stack-up | 0 |

What the two load models do:

- **Capacitive:** the driver charges the line and the receiver inputs. The current of each
  spectral line is 2π·f·C_total·V, distributed along the net like a tree from the driver.
- **Terminated:** a constant current V/Z0 along the path from the driver to the farthest
  receiver; branches carry no current. The termination pad cannot be chosen in the editor; the
  farthest receiver is used (a scenario file can name another pad in `load.endPad`).

**Series resistors:** with the capacitive model, a resistor between the source's nets slows the
edge at the load (the RC of the resistor with line and load capacitance, added in quadrature to
the rise time). A resistor of 10 Ω or more within 15 mm of the driver counts as source termination
for the "unterminated line" check.

### 3.6 Differential pair

| Field | What to enter | Default (added by hand) |
|---|---|---|
| **Kind**, **Frequency/Bit rate**, **Rise time**, **Duty cycle**, **Voltage**, **Load model** | as for a single line. **Voltage** is the swing of **one** leg | Data, 12 Mbit/s, 4 ns, 50 %, 3.3 V, capacitive 5 pF |
| **Net P**, **Net N** | the two nets | – |
| **Driver P**, **Driver N** | driver pads; empty = automatic | automatic |
| **Imbalance** | amplitude mismatch between the legs: N carries −(1 − ε) of P's current. This is the only source of common mode in the pair's model; typically 2–10 % | 5 % |

Typical values: USB full speed 12 Mbit/s, edges 4–20 ns, 3.3 V; USB high speed 480 Mbit/s,
0.5 ns, 0.4 V; LVDS 0.35 V; 100BASE-TX 125 Mbaud. Skew between P and N is not computed; a length
difference is reported separately as "Differential pair unequal".

### 3.7 Current loop

Use a current loop for the hot loop of a switching regulator: the path whose current jumps by
amperes at every switching edge (buck: input capacitor → high-side switch → low-side switch or
diode → ground → capacitor).

| Field | What to enter | Default (added by hand) |
|---|---|---|
| **Loop pads (in order)** | the pads around the loop; the loop closes automatically. Buck: input capacitor + → VIN pin → (through the IC) → PGND pin → input capacitor −, e.g. `C1.1`, `U1.1`, `U1.2`, `C1.2`. Boost: through the output capacitor | – |
| **Switching node net (E field)** | the switch-node net (SW, LX). Needed for the electric field of the switch node and for the "switching current on the supply cable" check | – |
| **Voltage swing at the node** | appears once a node net is set; about VIN | 12 V |
| **Frequency** | switching frequency; datasheet or the RT/FREQ resistor formula; typically 100 kHz–3 MHz | 500 kHz |
| **Rise time** | switch-node transition time ("SW rise/fall time"; or VIN / slew rate); typically 2–20 ns | 5 ns |
| **Duty cycle** | buck: Vout/Vin; boost: 1 − Vin/Vout | 30 % |
| **Peak current** | the current step in the loop at the design's maximum load: buck ≈ output current, boost ≈ input current | 1 A |

How the path is built: between two pads of **the same net** the current follows the copper
(shortest path through tracks, vias and zones); between two pads of **the same part** it goes
straight through the part. Pieces that run in a plane of the loop's own net (the return through
the GND plane) are represented by the image current.

To set up a loop by clicking:

1. **Add source → Current loop**, then select it.
2. Click **Pick in 3D**. The status line says "Click a pad …" and the cursor becomes a crosshair.
3. Click the first pad in the 3D view. It is appended to the pad list.
4. Repeat steps 2 and 3 for every pad, in order around the loop.
5. Set **Frequency**, **Rise time**, **Duty cycle** and **Peak current**, and choose the switch
   node under **Switching node net (E field)**.

Warnings below the editor: "The loop jumps between nets without copper:" and "No copper path
between" mean that two consecutive pads are neither connected by copper nor in the same part;
check the order.

### 3.8 Inductor

| Field | What to enter | Default (added by hand) |
|---|---|---|
| **Part** | the inductor's reference, e.g. `L1` | – |
| **Construction** | **open (drum core)** for unshielded drum or bobbin cores, **semi-shielded** for magnetic-resin types, **shielded** for fully shielded (moulded, metal composite) | semi-shielded |
| **Frequency** | switching frequency | 500 kHz |
| **Duty cycle** | as for the loop | 30 % |
| **Ripple current (peak-to-peak)** | buck: ΔI = (Vin − Vout)·D / (L·f_sw); typically 10–40 % of the output current | 0.6 A |

There is no rise time: only the triangular ripple current is computed. The construction sets the
effective turns of the stray field (open 12, semi-shielded 4, shielded 0.8), a rough rule of
thumb, not manufacturer data. Inductors stay with the fast model even when a full-wave result is
loaded.

### 3.9 Picking nets and pads in 3D

1. Click **Pick in 3D** in the editor (nets for a clock or data line, pads for a loop).
2. The status line says "Click a trace …" or "Click a pad …".
3. Click the copper in the 3D view. A pad pick takes the nearest pad on the visible layers if you
   do not hit one exactly.
4. Esc cancels picking.

The app picks on the copper facing the camera, from the outer layer inwards over the visible
layers. To reach a trace on an inner layer, hide the layers above it under **View → Layers**; to
pick on the bottom, turn the board over. Hovering over copper always shows its net and layer in
the status line.

### 3.10 Figures and warnings in the editor

Under **Figures** the editor shows what the app derived from the geometry:

| Figure | Meaning |
|---|---|
| **Driver pad** | the pad used as driver |
| **Line length** | length of the current path |
| **Total capacitance** | line plus receiver capacitance (capacitive model) |
| **Z0 (average)** | length-weighted line impedance |
| **Electrically short up to** | f = c / (10 · L · √εeff); above it the lumped model loses accuracy |
| **Corner frequencies** | where the spectrum envelope bends: f1 = 1/(π·τ) with τ = duty cycle / frequency, then −20 dB/decade; f2 = 1/(π·rise time), then −40 dB/decade |

Warnings: "Parts of the line have no reference plane; a return path was assumed.", "Not connected
to the driver:" (pads of the nets that the copper does not reach), "Driver pad not found, picked
automatically.", and the loop warnings above.

If the source's values came with a scenario that documents their origin
([7.4](#74-parts-data-and-the-ai-parts-manual)), **Origin of the values** lists each value with
its basis (datasheet, calculated, schematic/value, assumption), the part and a link to the
document.

### 3.11 How wrong values affect the results

| Value | Effect of a wrong value |
|---|---|
| **Voltage**, **Peak current**, **Ripple current** | every spectral line scales with it: twice the value is 6 dB more everywhere |
| **Rise time** | sets f2 = 1/(π·rise time), above which the harmonics fall by 40 dB per decade. Halving it raises the lines above by up to 6 dB. Too slow a value hides the upper harmonics, which are what the 30 MHz–1 GHz limits test |
| **Frequency** / **Bit rate** | moves the whole comb of lines and changes which harmonics fall into which band |
| **Duty cycle** | 50 % cancels the even harmonics; it also sets the first corner f1 |
| **Kind** | **Data** is the 1010 worst case at half the bit rate; real data has a spread spectrum and is usually lower |
| **Load model**, **Input capacitance per receiver** | with the capacitive model the current is proportional to the total capacitance; the terminated model gives V/Z0 instead |
| **Imbalance** | the common-mode part of a pair is proportional to it |
| **Voltage swing at the node** | scales the electric field of the switch node |
| **Construction** (inductor) | the stray field scales with the effective turns 12 / 4 / 0.8 |
| Nets, driver, pads | wrong geometry: wrong loop, wrong findings |

The problem view of every finding lists, under "Scepticism: what can distort the result here",
which of the decisive inputs are not backed by a datasheet.

---

## 4. The 3D view

All settings in this section are in the **View** tab of the right panel unless stated otherwise.

### 4.1 Moving around

- **Rotate:** drag with the left mouse button. **Pan:** drag with the right button. **Zoom:**
  mouse wheel. (Standard three.js orbit controls.)
- **Click** (without dragging) toggles the probe between following the mouse and pinned.
- Hovering shows the net and layer under the mouse in the status line.
- Clicking a hotspot in the **Diagnostics** tab or a hotspot bubble centres the view on it and
  pins the probe there.

### 4.2 Field: magnetic or electric

**Field** switches between **Magnetic (H)** (in dBµA/m, the default) and **Electric (E)** (in
dBµV/m). The electric field comes from the charges on traces and pads; for switching regulators
it comes from the switch node, so a loop source needs its **Switching node net (E field)** set.
The choice applies to the glow, slice, probe, field lines and hotspots.

### 4.3 Frequencies

**Frequencies** chooses which part of the spectrum the 3D display shows:

- **All:** the power sum of all spectral lines.
- **Band:** one band: **30–230 MHz (CISPR)**, **230–1000 MHz (CISPR)**, **below 30 MHz**,
  **above 1 GHz**.
- **Single line:** a list of the strongest lines (up to 60, with their peak level; hover for the
  sources that contribute). Click one to show it. Clicking a line in the spectrum analyser does
  the same and switches to **Single line**.

Different sources add as powers (they are not phase-locked); within one source the elements add
coherently. The selection affects the glow, isosurfaces, slice, hotspots and the display of
measurements, not the far-field figures.

### 4.4 Visible range

**Visible range** maps field levels to brightness. With **automatic** ticked, the top is the
strongest value in the volume and the bottom is 60 dB below it. Moving the **max** or **min**
slider switches automatic off. The unit is shown below the sliders. The same range sets the
loudness of the sound ([6.3](#63-sound)).

### 4.5 Glow and isosurfaces

- **Field as glow:** the volume rendered as a glowing cloud.
- **Isosurfaces (shells at 35, 60 and 85 % of the range):** three translucent shells of equal
  field strength.
- **Glow density:** how opaque the glow is.
- **Colour map:** **Ember** or **Rainbow**.

### 4.6 Speech bubbles in 3D

Under **Speech bubbles in 3D**:

| Option | Shows | Click |
|---|---|---|
| **Hints (numbered as in Diagnostics)**, with **Hints**: **first 3**, **first 5** (default), **first 10**, **all** | the ranked findings at their spot, numbered as in the **Diagnostics** tab, with the effect of the fix or the margin | opens the problem view |
| **Sources with far-field margin** | each enabled source with its near-field peak and its 3 m margin (model) | selects the source |
| **3 m spectrum in the bubbles** | a small 3 m spectrum (30 MHz–1 GHz) with the limit line; dashed: with the fix applied | – |
| **Hotspots** (off by default) | the hotspots with their level | moves the probe there |
| **Inside the scene instead of an overlay (HTML-in-Canvas)** | the bubbles as real elements in the 3D scene (smaller in the distance, also in VR). Experimental; greyed out where unsupported | – |

Red and yellow bubbles always stay in view: without room they shrink to title, rating and far
field (full text on hover); when their spot is out of view they wait at the edge with an arrow
pointing to it. Green findings are only points; hover for the text, click to look closer.
Bubbles are hidden in ant view and in the problem view.

### 4.7 Field lines and slice

Under **Field lines and slice**:

- **Field lines of the selected source:** traced in the background ("Tracing field lines …") for
  the source selected in the list, in the current field kind.
- **Slice plane:** a horizontal cut through the field at **Height above F.Cu** (0.2–12 mm).
  **Slice as CSV** saves it as a semicolon-separated file with x and y in board coordinates (mm)
  and the level per point; the first line names the actual grid height used.

### 4.8 Return current model

**Return current model**:

- **Detours (stage 2)** (default): the return current goes around slots in the plane and, at a
  reference change, through the nearest stitching via or capacitor. **Show return paths** draws
  these detours in 3D.
- **Mirror (stage 1)**: the return current is always an image directly under the line; a gap
  moves the image to the next plane, but no detour is computed.

Keep the default unless you want to compare.

### 4.9 Layers and reference planes

The **Layers** table has one row per copper layer: a visibility checkbox, the layer name and a
plane selector.

How the app detects planes:

- A layer is a reference plane for a net when that net's **filled** zones cover at least 15 % of
  the board area on that layer. Unfilled zones do not count; fill the zones in KiCad before
  saving.
- Pours of other nets that cover at least 5 % of the board on the same layer count too (split
  planes); every point knows its net, so the border between two nets is a gap for the return
  current.
- Holes up to 2.5 mm across (via and pin clearances) count as copper; slots count by their
  length.
- The reference of a signal layer is the nearest plane layer; on a tie, the one towards the
  middle of the board.

The selector shows **detected: GND** (or whatever net was found), or just **detected** if none. To
correct it:

1. In the row of the layer, open the selector.
2. Choose **no plane** to stop the layer from being a reference, or a net name to force it as a
   plane of that net.
3. The field and all findings are recomputed. Choose **detected** to go back to automatic.

Overrides are saved with the scenario. As long as no layer is overridden, every explanation
reminds you that the planes were detected, not confirmed.

### 4.10 Board, parts and 3D models

- **See-through board** makes the substrate translucent.
- **Show components** shows or hides the part bodies.

Real part models can come from two places:

**A KiCad GLB export** (placed exactly as KiCad places them, and preferred over everything else):

1. In KiCad use "File → Export → glTF/GLB" without the board body, or run
   `kicad-cli pcb export glb --no-board-body --subst-models board.kicad_pcb`.
2. Open the board first, then drop the `.glb` on the window or click **Load 3D models (GLB)**.
3. Parts are matched by reference. The panel says "3D models for m of n parts".

**Real 3D part models** (lookup by file name): the board file only names the path of each part's
model, for example `${KIPRJMOD}/3d/Relais.step`; the app looks the file up by its name (without
extension) in:

- **Load KiCad's standard library from the web (gitlab.com)** (ticked by default; STEP files);
- a folder on your computer: **Choose a folder with models …** (subfolders included);
- a GitHub repository: paste `https://github.com/<owner>/<repo>` or a subfolder
  `…/tree/<branch>/<path>` and click **Add**;
- the project folder of a board opened by link.

When a name exists more than once, a file from the same library folder wins, then the format
(STEP before GLB, glTF, WRL, STL). STEP files are converted in the browser. The status line reads
"… of … parts with a model (GLB export …, folder …, repository …, KiCad library …)"; parts without
a model are listed under "… parts without a model found".

### 4.11 Spectrum up to

**Spectrum up to** (1, 3 or 6 GHz; default 1 GHz) sets the highest harmonic computed. Below it
the panel says "Quasi-statics hold in this grid up to about …": the frequency up to which the
quasi-static model is accurate over the size of the grid (k·r ≤ 0.3).

### 4.12 Ant view

**Ant view** (top bar) switches the camera to walking mode:

| Key | Action |
|---|---|
| W / S | forward / back along the board |
| A / D | left / right |
| E / Q | up / down |
| mouse | turns the view |

The keys are ignored while the cursor is in a text field. The button then reads **Overview**;
click it to return to the overview camera. Loading another board also leaves ant view.

### 4.13 VR

On a browser and headset with WebXR, a VR button appears in the 3D view. In the headset the board
lies on a table in front of you, enlarged five times, and the glow is replaced by the
isosurfaces. Where the browser also supports HTML-in-Canvas, the speech bubbles appear inside the
scene.

### 4.14 Keyboard summary

| Key | Where | Action |
|---|---|---|
| Esc | outside value fields | cancels picking in 3D and closes the problem view |
| Enter | value field | applies the value |
| Esc | value field | discards the edit (the problem view stays open) |
| W A S D Q E | ant view | walk, see [4.12](#412-ant-view) |

---

## 5. Diagnostics

### 5.1 The tab at a glance

The **Diagnostics** tab shows, from top to bottom:

0. **Notes on the file**, only when the file lacked something (stack-up, outline, Eagle pours):
   what was assumed instead.
1. **What to do first**: up to five steps.
2. **Layout hints**: all findings in the order to work on them.
3. **Far-field estimate (…, 3 m)**: the margin of each source to the limit.
4. **Hotspots at probe height**.
5. **Standard for the limit**.
6. **EMC report**: **Export parts data for AI** and **Save report**.
7. **Origin of the parts data**, when a scenario documents it.

### 5.2 What to do first

The red (high priority) and yellow (check) findings, grouped by kind, in the order of their most
important finding; green findings are left out. Each step is one instruction, such as "Close the
gaps and splits in the reference plane under … or route around them (2 places)." Click a step to
open the problem view of its most important finding.

### 5.3 The list of layout hints

Above the list a line counts the findings: "… high priority · … check · … low priority".
**How order and priority come about** explains the ranking.

Each row shows:

- the rank number (the same number as on the bubble in 3D);
- the source's colour and name;
- the priority label;
- the margin to the limit: for findings of a source, the source's strongest far-field line at
  3 m ("… dB over the limit" or "… dB margin"); for the cable estimates their own margin;
- the finding in one sentence;
- where computed, the effect of the fix at 3 m in the model:

| Text | Meaning |
|---|---|
| "3 m (model): only this spot fixed, … quieter" | what fixing only this spot changes |
| "3 m (model): fixed alone … louder, only helps together with the other hints" | two detours partly cancel; fixing one alone makes it worse |
| "3 m (model): hardly any effect fixed alone, share …" | small alone; the share shows its part of the problem |
| "3 m (model): all plane gaps under this source together …" | the effect of all gaps under the source, compared with continuous planes |

Effects are capped at "more than 30 dB".

**Order:** high priority first, then check, then low priority; within that, the source closest to
the limit at 3 m; within a source, the finding with the biggest share. **Groups:** for each
source and kind, only the first three findings are shown; the rest hide behind a row
"+ … more: kind (source)", which you click to unfold. The rank numbers do not change when rows
are folded.

Findings of the board rules (filters, shields, decoupling, …) belong to no source; their source
column is empty in the list, and the problem view titles them "Board".

### 5.4 Priority colours

| Label | Score | Chip colour | Meaning |
|---|---|---|---|
| **high priority** ("red") | 0.6–1 | red | the source is near or over the limit at 3 m in the model and this finding contributes a lot, or it is a mistake tests are known to fail on (gap under fast lines, large hot loop, open connector shield) |
| **check** ("yellow") | 0.3–0.6 | yellow | worth a look |
| **low priority** ("green") | below 0.3 | green | far below the limit in the model, or the computed effect of the fix is negligible |

Every finding gets a score from 0 to 1. The chip colour follows the level: green below 0.3,
yellow to amber from 0.3, red from 0.6; within a band the shade still shows the score. **Priority orders the work and says nothing
about the test result.** How the score comes about:

- **Findings of a source:** how close the source's strongest line comes to the limit at 3 m
  (nothing at 20 dB or more below, full at or over the limit), weighted by the finding's share
  (full from 6 dB effect of the fix).
- **Cable estimates** ("Cables driven against each other", "Crosstalk into a cable line"): their
  own margin, counted 6 dB lower because they are deliberately pessimistic.
- **Hot loop:** also by its area: yellow from about 40 mm², red from about 80 mm².
- **Gap under a line:** at least red while the source is within 15 dB of the limit, because the
  voltage across the gap drives common mode, which the figure does not contain.
- **Reference change, missing stitching via:** green when the computed effect is under 0.5 dB.
- **Board rules:** a fixed priority per rule (yellow, except an open connector shield: red).
  "Filter bypassed by overlap" is red when the filter is bypassed below 100 MHz; "Switching
  current on the supply cable" is red from 20 dB over its yardstick.

### 5.5 The problem view

Click a finding (in **What to do first**, in the list, or on its bubble) to open the problem view.
The camera flies to the spot and the 3D view shows only what matters for this finding, with the
layers pulled apart vertically so you can see which plane lies under which trace.

What the drawings mean:

| Drawing | Meaning |
|---|---|
| copper in the source's colour | the current path the calculation uses (for a hot loop only the loop, not all of GND) |
| translucent coloured sheets with outlines | the reference planes concerned; gaps show as holes. Labels name net and layer and their role, e.g. "reference plane of F.Cu" or "reference plane after the layer change" |
| grey parts and vias; faint grey vias | other parts on the nets; stitching vias of the plane nets near the finding |
| red ring | the spot of the finding |
| white dimension line with end ticks | a measured length, e.g. "… mm over the gap", "l = … mm (line ends)", "d1 + d2 = … mm (board width across the line)" |
| dashed amber line | the return current's detour, "return detour … mm" |
| translucent amber area | the extra loop area, "+… mm² loop area" |
| dashed red circle | a search radius, e.g. "no GND via within 3 mm", "nearest ground … mm" |
| green ghost part, via or dashed area | the suggested fix at its place, labelled "Suggestion: …" (e.g. a 100 nF capacitor between the planes, a stitching via, a series resistor, closing the plane) |
| orange cables at connectors | the cables as antennas for common mode |
| magenta line | a victim line, e.g. the I/O line a clock couples into; for a bypassed filter the output side (input side amber), with the overlap area marked |
| coloured map above the board | **Field map**: where this problem adds magnetic field (difference between as built and fixed; transparent = no difference, red = much), or the source's own field when no fix can be computed |
| labels on nets and parts | net names with the source's values (frequency, rise time, amplitude), part references with values; "carries the return current between the planes" marks the part the return jumps through |

The card on the left explains the finding:

| Section | Contents |
|---|---|
| header | rank number, source name (or "Board"), **Back to the whole board** |
| priority chip and reason | why it has this priority (margin and effect, or "Layout rule from the literature, not computed") |
| **What the calculation objects to here** | the finding, the effect of the fix and the source's margin |
| **What is it?** | the mistake in plain words, with the figures of this case |
| **Why does it radiate?** | the physics |
| **The figures here** | gap length, detour, loop area, inductances, voltages … |
| **Field map** | how to read the map |
| **What helps (most effective first)** | the fixes, best first |
| **Avoid here, and why** | what not to do |
| **The calculation behind it** | current path, dipole moment, formula, strongest line against the limit, and the result after the fix |
| **Scepticism: what can distort the result here** | inputs not backed by a datasheet, lines above the validity limit, board resonances, cables, detector, plane detection … |
| **Emission at 3 m** | the source's 3 m spectrum with the limit line; dashed: after the fix |
| **Inputs that decide the result** | the source's values, editable; the calculation reruns at once |
| **How the app spots it** (folded) | the detection rule and its thresholds |
| **Where the calculation is uncertain** (folded) | the limits of the statement |
| **Further reading** (folded) | the literature |
| **Derived** | line length, total capacitance, Z0, electrically short up to |

Each input carries a tag for its origin: datasheet, calculated, schematic/value, assumption, or
"not documented"; assumptions and undocumented values are marked in the warning colour. See
[7.4](#74-parts-data-and-the-ai-parts-manual).

To leave, click **Back to the whole board** or press Esc; the camera flies back.

### 5.6 What the app checks

The complete rule set with thresholds, origin and test boards is in [RULES.md](RULES.md); the
mistakes with their sources are in
[research/EMC-MISTAKES-CATALOGUE.md](research/EMC-MISTAKES-CATALOGUE.md). In short
(*computed*: from the field or loop model; *estimate*: published worst-case formula; *rule*:
geometry with a guide value, nothing computed):

**Findings at a source**

| Finding (bubble title) | Reported when | Type |
|---|---|---|
| Trace over a gap in the plane | a gap in the reference plane under the current path forces the return at least 2 mm out of its way, has no way around, or is the border between two nets of a split plane | computed (differential mode) |
| Reference change at a via | the path changes layers and the planes before and after belong to different nets | computed |
| Layer change without stitching via | same plane net on both sides, but no via of that net within 3 mm | computed |
| Unterminated line, resonance in band | the line's quarter-wave resonance c/(4·L·√εeff) lies below **Spectrum up to**, the spectrum there is at least 1 % of the strongest line, and there is neither a series resistor (≥ 10 Ω, ≤ 15 mm from the driver) nor a terminated load | warning; the overshoot is not computed |
| Line without a reference plane | no plane on any layer | computed (against a solid plane on the opposite side) |
| Line at the edge of its plane | over at least 3 mm the line runs closer to the plane edge than about 3 × its height above the plane (at least 1 mm) | rule |
| Signal layer without adjacent plane | the reference plane is not on the next copper layer | rule |
| Hot loop too large | loop area along the copper from 30 mm² | computed (area) |
| Cables driven against each other | the plane voltage under the line drives cables on both sides (or a cable against the board) to within 6 dB of the limit | estimate |
| Crosstalk into a cable line | a fast line runs parallel to a line that leaves through a connector, estimated within 6 dB of the limit (at most two per source) | estimate |
| Differential pair unequal | the legs differ by more than 5 mm or the skew exceeds 10 % of the rise time | rule |

**Board rules (no source needed, except where noted)**

| Finding | Reported when | Type |
|---|---|---|
| Filter far from the connector | a series part or a capacitor to ground on a cable line sits more than 10 mm from the connector pin | rule |
| Filter capacitor without short ground | its ground pad is not in a ground pour and the nearest ground via is more than 3 mm away | rule |
| Connector shield open | shield pads (S…, SH…, SHIELD, MP) have no net or a net that goes nowhere else | rule |
| Connector shield poorly connected | the shield reaches ground only more than 3 mm away | rule |
| Decoupling missing or far away | an IC supply pin (ICs with five or more pins) has no capacitor to ground within 20 mm, or the nearest is more than 5 mm away | rule |
| Crystal at edge or connector | a crystal or oscillator less than 5 mm from the board edge or 10 mm from a cable connector | rule |
| Lines under the crystal | foreign lines under a crystal without a plane in between | rule |
| Switch node too large | switch-node copper from 100 mm², on several layers, or from 40 mm² within 3 mm of the edge or 10 mm of a connector | rule |
| Storage inductor at edge or connector | an inductor on the switch node less than 3 mm from the edge or 10 mm from a cable connector | rule |
| Too few ground pins at the connector | a connector carrying fast sources (rise time up to 5 ns) has fewer than one ground pin per two fast pins, or a fast pin more than 1.5 pitches from ground (needs sources) | rule |
| Filter bypassed by overlap | input and output copper of a ferrite or inductor overlap on different layers with at least 3 pF, enough to bypass the part below 1 GHz | rule with a plate-capacitor calculation |
| Switching current on the supply cable | for an enabled loop source with a switch node: the estimated conducted noise at a LISN (150 kHz–30 MHz) exceeds the average mains-port limit of EN 55032 class B, used as a yardstick (needs a loop source with **Switching node net (E field)**) | estimate |
| Copper without connection | copper without a net, or an island of a net without pad or via, from 25 mm² | rule |
| Heat sink without ground | a heat-sink footprint whose pads all have no net | rule |
| Ferrite between two grounds | a ferrite or inductor between two ground-named nets | rule |
| No ESD protection at the connector | data lines of a USB, HDMI or DisplayPort connector without a TVS/ESD part | rule |
| ESD protection placed poorly | the diode is not closer to the connector than to the IC, or its ground pad has no ground via within 2 mm | rule |

Many board rules recognise parts by library, value or reference: connectors as cables (J, CN, USB,
X or connector libraries), crystals (Y, XTAL, OSC), ferrites (FB, "ferrite", "bead"), heat sinks
(HS), protection diodes (names such as USBLC6, PESD, TPD, PRTR, ESD…, TVS…). Parts named
differently are not recognised; **How the app spots it** in each problem view says exactly what is
looked for.

### 5.7 Far-field estimate

Under **Far-field estimate (…, 3 m)** each enabled source has one row:

- the worst margin of its spectral lines to the limit, and the frequency of that line;
- where they matter, the shares "return paths …, plane gaps …": how much louder at 3 m all
  return-path problems, and all plane gaps, make this source in the model;
- where a cable estimate exists, "with cables, worst case: … (frequency; mechanism)", with the
  mechanism "connectors on both sides: cable against cable", "connectors on one side only: cable
  against the board" or "no connector found: one supply cable assumed".

A flat loop over a solid plane shows "–" and the note "Far field not quantifiable here": in the
model its plane cancels the loop's dipole moment, so the loop area is the measure instead.

How the number comes about: the magnetic dipole moment of forward and return current (return in
the plane), radiated with E = 2·η0·k²·|m|·I/(4π·r) at r = 3 m, where the factor 2 is the worst-case
reflection off the test-site floor. Each spectral line is compared with the limit on its own, as
the measuring receiver shows it. The limits apply to quasi-peak below 1 GHz and average above; at
band edges the tighter limit applies. Details: [stage-1/PHYSICS.md §11](stage-1/PHYSICS.md).

### 5.8 Hotspots

**Hotspots at probe height** lists the local maxima of the field in the plane at the probe's
**Height** (spectrum panel), in the current frequency selection, down to 50 dB below the strongest.
Each row names the source that dominates there and the parts and nets nearby. Click a row to pin
the probe there and centre the view (the tooltip says "Move the probe here"). To look at another
height, change the probe height.

### 5.9 Standard for the limit

Choose the standard under **Standard for the limit** (default CISPR 32 / EN 55032 class B). Its
explanation appears below; **All standards explained** unfolds all of them.

| Standard | Applies to (short) |
|---|---|
| CISPR 32 / EN 55032 class B | multimedia equipment (IT, audio, video, networking) for residential use |
| CISPR 32 / EN 55032 class A | as class B, for commercial or industrial use only; 10 dB higher limits |
| FCC Part 15 class B (USA) | digital devices for residential use |
| FCC Part 15 class A (USA) | digital devices, commercial environment |
| CISPR 11 / EN 55011 group 1, class B | industrial, scientific and medical equipment, residential use |
| CISPR 11 / EN 55011 group 1, class A | ISM equipment for industrial and commercial use |
| CISPR 14-1 / EN 55014-1 | household appliances, electric tools and similar |

Not included: CISPR 25 (vehicle components) and MIL-STD-461 RE102 (military); both measure at 1 m
on a set-up whose cable harness dominates, which the board model cannot estimate. A distance a
standard does not tabulate is converted with 20 dB per decade.

---

## 6. Probe, spectrum analyser and sound

### 6.1 The probe

The probe is a virtual near-field probe. Its field is computed exactly at its position (not from
the grid).

| Control | Meaning |
|---|---|
| **follows the mouse** | ticked: the probe follows the mouse over the board. A click in the 3D view pins it ("pinned (click releases)") |
| **Height** | height above F.Cu, 0.2–12 mm (default 2 mm). Also the plane of the hotspots |
| **Quantity** | **\|H\| (three-axis)** like an isotropic probe, or one component: **Hx**, **Hy (vertical)**, **Hz**, like a loop probe in one orientation (x and z along the board's x and y) |
| **as probe voltage (dBµV)** | the open-circuit voltage of an ideal loop probe instead of the field; the loop radius is fixed at 1 mm |

### 6.2 The spectrum analyser

The display has three modes:

| Mode | Shows | Unit |
|---|---|---|
| **Probe** | the spectrum at the probe, per source in its colour and in total ("No probe over the board" when the probe is not over the board) | dBµA/m, dBµV with probe voltage, dBµV/m for the E field |
| **Far field 3 m** | the far-field estimate of all enabled sources with the limit line of the chosen standard | dBµV/m |
| **Far field 10 m** | the same at 10 m | dBµV/m |

What you see:

- coloured stems: the lines of each source; amber ticks with an envelope: the total;
- the limit line of the chosen standard (far-field modes; named in the legend);
- **– – with cables**: a dashed envelope of the worst-case common-mode estimate with cables
  (far-field modes; tooltip with the method);
- a hatched area labelled "▨ from …: board > λ/4": above this frequency the board is longer than a
  quarter wavelength and the small-radiator formula no longer holds;
- a light shading of the CISPR bands 30–230 MHz and 230 MHz–1 GHz;
- **Highest line**: frequency and level of the strongest line.

Hover to read frequency and level of the nearest line. Click to show that line in 3D (switches the
view to **Single line**). **CSV** saves the current spectrum ([7.3](#73-images-and-csv)). The
frequency axis runs from 100 kHz to **Spectrum up to**.

### 6.3 Sound

The **Sound** controls turn the probe reading into audio:

1. Click **Sound on** (browsers only start audio after a click).
2. Move the probe over the board: the sound gets louder where the field is strong. Loudness follows
   the field at the probe within the **Visible range** (min is silent, max is full scale).
3. Choose the **Style**:
   - **Tones per source**: each source is a voice built from its own harmonics, pitched down
     linearly: clocks sound like tones, switchers buzz. **Pitch for 25 MHz** sets the audio pitch
     of a 25 MHz fundamental (55–880 Hz, default 220 Hz). Each voice comes from the direction of
     its source relative to the probe and the camera.
   - **Geiger counter**: clicks whose rate follows the total field.
4. **Volume** sets the level; **Sound off** stops it.

---

## 7. Saving, reports and exports

All files are saved by your browser's download function and named after the board file.

### 7.1 Scenarios

A scenario is a JSON file with the sources, settings (grid, spectrum limit, plane overrides,
return-current model, standard), view settings and, if present, parts data and their origin.

- **Save scenario** writes `<board>.scenario.json`.
- **Load scenario** reads one back. If it belongs to another board, a message warns that nets and
  pads may be missing. You can also drop the `.json` on the window.

Use scenarios to keep your sources across board revisions, to share a set-up, and as input for the
command-line check ([section 10](#10-command-line-field-check-for-ci)).

### 7.2 Report (HTML, printable to PDF)

**Save report** (Diagnostics tab, section **EMC report**) writes one self-contained HTML file,
`<board>-emc-report.html`. It contains:

- a picture of the current 3D view and the frequency selection and field origin shown;
- a summary: active sources, number of layout hints, strongest hotspot, closest source to the
  limit;
- all layout hints in ranked order, each with priority and reason, why it radiates, the fixes,
  what to avoid, the calculation, the scepticism, the limits and the literature;
- the hotspots, the far-field table, the origin of the parts data (if any), the sources and the
  settings.

The report is light and printable: open it in the browser and print to PDF.

### 7.3 Images and CSV

| Button | File |
|---|---|
| **Save image** (top bar) | `<board>.png` of the 3D view |
| **CSV** (spectrum analyser) | the current spectrum: `f_Hz`, the total and one column per source, semicolon-separated |
| **Slice as CSV** (View tab, with **Slice plane** on) | the slice: x and y in board coordinates and the level per point |

### 7.4 Parts data and the AI parts manual

Filling in frequencies, edge times and load capacitances for every source means reading
datasheets. The app can hand this work to an AI agent with web access (or to a person) and keep
track of where every value came from.

1. In the **Diagnostics** tab, under **EMC report**, click **Export parts data for AI**. This saves
   `<board>.ai-request.json`: every part with value, MPN, datasheet link, pins and nets, the
   current sources and the suggestions.
2. Give this file and the manual to the agent. The manual is linked as **Manual for AI** and is
   also in this repository: [AI-PARTS-MANUAL.md](AI-PARTS-MANUAL.md). It says which value to look
   up where, the units, typical ranges and fallbacks, and that every value needs its origin.
3. The answer is a scenario file with the sources, a documented origin for every value and a list
   of parts without data. Open it with **Load scenario**.

Afterwards the app shows the origin everywhere:

- in the source editor under **Origin of the values**;
- in the problem view, as a tag at each input (datasheet, calculated, schematic/value, assumption,
  not documented);
- in the Diagnostics tab under **Origin of the parts data**: "… from datasheets, … calculated, …
  from schematic/value, … assumed" and the parts without data, with what was assumed instead;
- in the report.

The values are only as good as the identification of the parts; check the "assumed" ones first.
Capacitor data in the scenario (capacitance, ESR, ESL) is also used by the full-wave job.

---

## 8. Measuring: near-field scanner

### 8.1 What it is

The **Measure** tab turns a 3D printer into a near-field scanner: the printer moves a probe over
the board, a receiver records a spectrum at every point, and the result appears in the same 3D
world as the simulation, as a slice and as a difference to the simulation.

Status: the whole chain is checked with a **virtual rig** (a printer and receiver that "measure"
what the simulation predicts). The drivers for OctoPrint, G-code over USB and the tinySA are
written against the documented protocols but **have not yet run on any device**. Details and
background: [future/STAGE-4-SCANNER.md](future/STAGE-4-SCANNER.md).

### 8.2 Trying it with the virtual rig

1. Open a board (the demo is fine) with some sources.
2. In the **Measure** tab, keep **Printer** and **Receiver** at **virtual (simulation)**. Choose the
   **Probe**: **H loop, radius** (default 1 mm) or **E stub, length**. Type sizes with the prefix,
   e.g. `2 mm` ([3.4](#34-typing-values)).
3. Click **Connect**.
4. Set the **Scan plan**:

   | Field | Meaning | Default |
   |---|---|---|
   | **Area** | **whole board** or **±10 mm around the probe** | whole board |
   | **Grid** | point spacing | 2 mm |
   | **Heights above F.Cu (mm)** | one or more heights, separated by commas, semicolons or spaces | 2 |
   | **Clearance above parts** | the probe is lifted over tall parts by their height plus this | 1 mm |
   | **Frequency span** | start and stop frequency | 1 MHz – 1 GHz |
   | **Points per sweep** | receiver points | 450 |
   | **Settle time (ms)** | wait after each move | 150 |
   | **Sweeps per point (max hold)** | sweeps combined per point | 2 |

   The panel shows the number of points and the estimated time.
5. Click **Start scan**. Progress and remaining time are shown; **Stop** aborts between two points.
6. The measurement appears under **Measurements** (date, number of points, span).

### 8.3 Working with measurements

For each measurement:

- **Show**: the measurement as a slice at the measurement height, in the colour scale and frequency
  selection of the simulation.
- **Difference to simulation**: red where the measurement is louder than the simulation, blue where
  it is quieter (±20 dB). Points in the background noise stay empty.
- **Fit sources**: finds for each source how much louder or quieter it is in the measurement than
  in the model. The result lists each source ("… dB louder", "… dB quieter" or "too weak at these
  frequencies") and the remaining error. **Apply factors** scales the source amplitudes;
  **Difference to simulation** then shows what the model still does not explain, for example a
  source missing from the scenario.
- **Save**: `<board>-<date>.measurement.json`. **Load measurement** reads one back (with a warning
  if it belongs to another board). **✕** removes it.
- **Measure background**: runs the same plan with the board switched off and subtracts it from the
  last measurement. It needs an existing measurement. With real hardware, switch the board off
  yourself before you start it.

A note from the fit's hint: the probe is computed as an ideal open-circuit voltage. Into 50 Ω its
self-inductance limits it from about 50 Ω/(2π·L) (10 mm loop: around 400 MHz); above that the
calculation reads too high. For absolute values use the manufacturer's probe factor.

### 8.4 Real hardware

**Devices:**

| Setting | Options |
|---|---|
| **Printer** | **OctoPrint** (URL and API key; the key is held in memory only), **G-code over USB** (Web Serial) |
| **Receiver** | **tinySA (USB)** (Web Serial) |

The virtual receiver works only with the virtual printer. OctoPrint over http only works from the
locally started app (`npm run dev`), with "Allow CORS" enabled in OctoPrint under Settings → API.

**Alignment** (shown for real printers):

1. **Connect**, then **Home** if needed.
2. Jog the probe with **X−**, **X+**, **Y+**, **Y−**, **Z+**, **Z−** and the **Step** (10, 1 or
   0.1 mm) until it sits exactly over a pad.
3. In the first reference row, type the pad (e.g. `U1.1`) or click **3D** and pick it, then click
   **⌖** (**Use current position**) to take the printer position.
4. Repeat for a second pad, far from the first.
5. Lower the probe until it touches the board and enter **Z at the surface (mm)**.
6. The panel shows the "Fit error … mm". **Start scan** becomes available once two pads are
   aligned and the devices are connected.

Error codes in the status line (shown untranslated): `virtual-receiver-needs-virtual-printer`,
`registration-missing` (align two pads first), `not-connected`.

**Suggested hardware and pitfalls** (from [future/STAGE-4-SCANNER.md](future/STAGE-4-SCANNER.md)):
an existing 3D printer; a tinySA Ultra (100 kHz–5.3 GHz) as receiver; a set of H-field loop probes;
optionally a 20–30 dB LNA; a printed holder and a ferrite on the probe cable. Subtract the
background (stepper drivers keep switching at standstill), keep the probe away from the print
head, run the board in a fixed state (continuous clock, continuous data pattern), and check
clearances with a test run without the probe. Without calibration the values are relative dB,
which is enough for before/after comparisons.

---

## 9. Full wave with openEMS

The fast model is quasi-static. For resonances, propagation delays and the board's own radiation
you can run a full-wave simulation with openEMS (FDTD). It runs locally on your computer, not in
the browser: the app exports a job, a script computes it, the app loads the result.

1. Make sure the sources you want are enabled. Inductors are not part of the full wave; they stay
   with the fast model. **Export job** is greyed out until at least one other source computes.
2. In the **View** tab, section **Full wave (openEMS, stage 3)**, click **Export job**. This saves
   `<board>.openems-job.json` with stack-up, copper, vias, one port per source, the frequencies and
   the app's grid.
3. Set up openEMS once in a clone of the app's repository, as described in
   [tools/openems/README.md](../tools/openems/README.md).
4. Run the job in the repository folder:

   ```bash
   tools/openems/.venv/bin/python tools/openems/run_job.py <board>.openems-job.json
   ```

   Options: `--res 0.8` (cell size above the board in mm; coarser is faster), `--sources id1,id2`
   (only these sources), `--max-steps 100000`, `--keep` (keep the working folder). One source of
   the demo board takes about 2 minutes with 1 mm cells and 10–15 minutes with 0.6 mm cells on
   16 cores.
5. Click **Load result** and choose `<board>.fullwave.bin`, or drop it on the window. The panel
   shows the sources, frequency range, mesh and run time.
6. Switch **Magnetic field from** between **Fast (stages 1–2)** and **Full wave (openEMS)**. The
   glow, probe, scan and far field then use the openEMS result.

Notes:

- The result holds |H| per ampere of port current at 12 frequencies; the app multiplies it by its
  own source spectrum, so frequency and edge changes stay interactive.
- openEMS results hold the magnetic field only; with **Electric (E)** the fast model is used.
- If the board changed since the export, the panel warns "The result belongs to another version of
  the board."
- Limits stated by the app: 0.5–1 mm grid, copper as a perfect conductor (resonances rather too
  sharp), simplified parts (capacitors as shorts, the switch as a resistor), no cables, no
  enclosure; the current spectrum still comes from the source model.
- **Plausibility:** `run_job.py` reports, per source, the input impedance at the lowest frequency.
  A loop of a few millimetres should show a few ohms at a few tens of MHz. Below 0.5 Ω the port is
  short-circuited (pads closer than one cell merged); recompute with a finer `--res`.

Background: [future/STAGE-3-FULL-WAVE.md](future/STAGE-3-FULL-WAVE.md).

---

## 10. Command-line field check for CI

The same physics as the app, without a browser, as one Node script. Use it in a pull-request
pipeline of your KiCad project to notice when a layout change makes a source louder. The full
description is in [CI-FIELD-CHECK.md](CI-FIELD-CHECK.md).

1. In the app, set up the sources and **Save scenario**. Commit the scenario next to the board.
2. Get the script: it is published with the app under `cli/field-check.mjs` (the app's address is
   in the README). In a clone of the app's repository, `npm run build` produces it, and
   `npm run field-check -- …` runs it.
3. Run it on the `.kicad_pcb`:

   ```bash
   node field-check.mjs board.kicad_pcb --scenario board.scenario.json \
     [--out report.json] [--baseline field-baseline.json] [--threshold 3] [--height 2] [--step 1]
   ```

   | Option | Meaning | Default |
   |---|---|---|
   | `--scenario` | the scenario saved by the app (required) | – |
   | `--out` | write the report as JSON | – |
   | `--baseline` | compare with an earlier report | – |
   | `--threshold` | dB by which a value may rise before it counts as worse | 3 |
   | `--height` | height of the evaluation plane above the top copper surface, mm | 2 |
   | `--step` | spacing of the evaluation points, mm | 1 |

4. Create the baseline once with `--out field-baseline.json` (for example from the main branch)
   and update it when a change is intended.

The script prints a table per source: the strongest near field in total and in the bands
30–230 MHz and 230 MHz–1 GHz (dBµA/m), the far-field margin at 3 m against the standard in the
scenario (default CISPR 32 class B) and the number of hints; then the hints in the order to work
on them. The JSON report also contains the board-rule findings.

With `--baseline` it exits with code 1 if a near-field band or the far-field margin of a source
rose by more than the threshold, if a source fails to compute, or if a new hint appeared (hints
count as the same when kind and position match within 2 mm). Board-rule findings are reported but
not compared. Without a board file or `--scenario` the script prints its usage and ends with
code 2.

Limits: quasi-static like the app; the far field is an orientation without cables; a new source or
a renamed net has to be updated in the scenario, otherwise it is missing from the comparison.

---

## 11. Troubleshooting and FAQ

### 11.1 Typical problems

| Problem | Cause and remedy |
|---|---|
| **No planes detected**, or a plane is missing | Only **filled** zones count: fill all zones in KiCad and save. A plane needs at least 15 % of the board area on its layer. Force it under **View → Layers** by choosing the net in the layer's selector |
| A layer is wrongly treated as a plane | e.g. a large supply pour that fast signals do not use. Choose **no plane** for it, or the right net |
| **Wrong stack-up** | If the board file has no physical stack-up, the app silently assumes one: 2 layers 1.6 mm FR4; 4 layers prepreg 0.21 mm / core / prepreg 0.21 mm (εr 4.4 and 4.6); otherwise evenly spaced. The interface does not say so (the parts export marks it as `stackupFromFile: false`). Define the stack-up in KiCad's board setup and save. Heights above the plane enter loop areas, impedances and the common-mode estimates directly |
| **Big boards are slow** | Choose **Grid → Preview (2 mm)** (an eighth of the points of 1 mm). Switch off sources you are not looking at; switch off field lines; stay at **Spectrum up to 1 GHz**. Changes of frequency, rise time, duty cycle and amplitude are instant anyway; only geometry changes recompute. The grid is capped at 1.5 million points, so large boards get a coarser spacing automatically |
| A source shows **!** | see the messages in [3.3](#33-managing-the-source-list) |
| No suggestions for a regulator | the pads need pin functions (VIN, GND, SW …) from the schematic, and a two-pin part between VIN and GND. Add a **Current loop** by hand |
| Sources gone after reopening the board | the file changed, so the automatic restore does not match ([2.6](#26-what-is-kept-automatically)). Use **Load scenario** |
| No **live** badge | live reload needs Chrome or Edge and a `.kicad_pcb` opened with **Open board** or by drag and drop; boards opened by link are not followed |
| A `?board=` link or an example does not load | the server must allow cross-origin reads; `raw.githubusercontent.com` does |
| No sound | click **Sound on**; the probe must be over the board; check **Volume** and the **Visible range** |
| Electric field is empty for a regulator | set **Switching node net (E field)** in the loop source |
| No "supply cable" finding although a regulator feeds a connector | the loop source needs a switch node and must be enabled; paths through transistors (e.g. a reverse-polarity P-FET) are not followed |
| Part models missing | see the list under "… parts without a model found"; add a model folder or repository, or tick the KiCad library |
| **Inside the scene …** is greyed out | the browser lacks HTML-in-Canvas; the bubbles stay an overlay |
| Scanner status `virtual-receiver-needs-virtual-printer` | choose a virtual printer, or a real receiver |

### 11.2 Findings that look wrong

Work through these in order:

1. **Check the planes** under **View → Layers**. A wrong reference plane makes gaps, reference
   changes and stack-up findings wrong (every explanation says so until you override a layer).
2. **Check the source**: nets (including the net behind a series resistor), driver pad,
   **Rise time**, **Frequency**, **Voltage**/**Peak current**. A data line entered as a clock, or a
   1 ns edge on a slow GPIO, inflates everything.
3. **Open the problem view** and read **How the app spots it** and **Where the calculation is
   uncertain**: they state the exact rule and threshold.
4. **Check the names** for board rules: connectors, crystals, ferrites, protection diodes and heat
   sinks are recognised by library, value or reference ([5.6](#56-what-the-app-checks)).
5. **Remember what is not modelled**: the app does not know enclosure springs, sheets or anything
   outside the board file, nor whether a connector carries a cable at all.

Some behaviour that is intended:

- **A cleanly routed line over a solid plane is flagged for common mode**: it sits between two
  cable connectors; the plane voltage under it drives the cables against each other.
- **Fixing one finding makes the source louder** in the model: two detours can partly cancel;
  the row then says "fixed alone … louder, only helps together with the other hints".
- **A gap is red although its dB effect is small**: the loop calculation does not contain the slot
  radiating by itself or the common mode it drives onto cables, which the literature and the
  full-wave comparison show.
- **A hot loop has a high priority but no far-field number**: over a solid plane its dipole moment
  cancels in the model; the area rates it, because the loop's inductance drives switch-node
  ringing and near field.

### 11.3 How meaningful is a number

| Number | How far to trust it |
|---|---|
| Near field (glow, probe, hotspots) | good for **where** and for **relative** changes; quasi-static, valid up to the frequency shown under **Spectrum up to**; absolute values scale with your inputs |
| Far-field margin at 3 m | differential mode of the board only. On a validation structure (40 mm line over a plane) the fast calculation agreed with openEMS within ±1 dB between 30 and 350 MHz; above, the line approaches resonance and the fast value is too low. One structure, not a test site |
| Far-field lines in the hatched area | not valid: the board is longer than λ/4 there; resonances can raise single lines a lot |
| Lines above **Electrically short up to** | delays and reflections are not computed; 10 dB or more either way is possible, much more at resonances |
| "with cables, worst case" | deliberately pessimistic (resonant cable at every frequency); real cables resonate at single frequencies only, ferrites, shields and enclosures lower it a lot |
| Effect of a fix ("… quieter") | a model figure for ordering the work; the figures do not add up |
| Hot-loop area | a good measure of inductance and magnetic field, not a level at 3 m |
| Board rules | distance rules with guide values; no level at all |
| Priority colours | an order of work, not a test verdict |

Signs that a number deserves extra caution: the **Scepticism** section of the problem view lists
inputs marked "assumption" or "not documented"; the strongest line sits above the validity limit;
the board reaches half a wavelength in the measured range; there are connectors (common mode on
cables is not in the far-field figure). For solid numbers, compare with the full wave
([section 9](#9-full-wave-with-openems)) or measure ([section 8](#8-measuring-near-field-scanner)).
The technical review of the physics is in
[review/TECHNICAL-REVIEW-2026-10.md](review/TECHNICAL-REVIEW-2026-10.md).

### 11.4 FAQ

**Does the app replace a pre-compliance scan or an EMC test?**
No. It shows where fields come from and which layout mistakes are likely to matter, and orders the
work. Whether a device passes depends on cables, enclosure and the real signals.

**Is my board uploaded?**
No. See [1.4](#14-your-board-stays-on-your-computer) for the few network requests the app makes.

**Which standard should I choose?**
The one your product is tested against; the explanation under **Standard for the limit** says what
each covers. Industrial and lab equipment usually falls under EN 55011 or EN 61326-1, household
appliances under EN 55014-1, multimedia equipment under EN 55032.

**Does it work for two-layer boards without a ground plane?**
Yes. The return current is then routed through the ground copper, and the finding "Line without a
reference plane" compares the loop with a solid plane on the opposite side.

**Where are my settings stored?**
In the browser's local storage, per board content. Save a scenario to keep them safe.

**Can I use other CAD tools than KiCad?**
Yes, through IPC-2581, Eagle/Fusion 360 and ODB++ ([IMPORT.md](IMPORT.md)). Live reload, the 3D
model lookup by KiCad paths, the GLB export and the command-line check are KiCad features.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **Reference plane** | the copper plane (usually GND) next to a signal layer, in which the signal's return current flows at high frequencies |
| **Return current** | the current that flows back to the driver. Above a few MHz it flows in the plane right under the line, because that loop has the lowest inductance |
| **Image current** (mirror) | a model of the return current: an ideal plane is replaced by a mirrored current flowing the other way below it (stage 1) |
| **Return detour** | the way the return current takes around a gap, or through a via or capacitor at a reference change (stage 2) |
| **Gap, slot, split plane** | an interruption of the reference plane under a line; a split plane has two nets side by side on one layer, and its dividing line is a gap for the return current |
| **Stitching via** | a via of the plane net next to a signal via, through which the return current changes planes |
| **Reference change** | a signal changes layers and the planes before and after belong to different nets; the return current must jump through a capacitor or the plane-to-plane capacitance |
| **Stack-up** | the order and thickness of copper and dielectric layers |
| **Differential mode** | signal and return current flow in opposite directions close together; they radiate through the area of their loop |
| **Common mode** | currents flowing in the same direction, e.g. on all wires of a cable, driven by small voltages across the plane or by crosstalk. A few microamperes on 1 m of cable reach the class B limit; tests usually fail on common mode |
| **Hot loop** | the loop of a switching regulator in which the current jumps by amperes within nanoseconds (buck: input capacitor → high-side switch → low-side switch or diode → ground → capacitor) |
| **Switch node** | the node between the switches and the inductor (SW, LX); it swings by the full input voltage with nanosecond edges and couples through the electric field |
| **Rise time** | the duration of a signal edge; it decides where the harmonics start falling at 40 dB per decade |
| **Trapezoid spectrum, corner frequencies** | the line spectrum of a periodic trapezoid: flat up to f1 = 1/(π·τ), then −20 dB/decade, from f2 = 1/(π·rise time) −40 dB/decade |
| **Electrically short** | a line shorter than about a tenth of the wavelength; up to that frequency the lumped model holds |
| **Quarter-wave resonance** | an unterminated line rings at the frequency where it is a quarter wave long: f = c/(4·L·√εeff) |
| **Series termination** | a resistor (typically 22–33 Ω) right at the driver that absorbs reflections and slows the edge |
| **Z0, εeff** | characteristic impedance and effective permittivity of a line, computed from the stack-up |
| **Near field, far field** | the field close to the board (what a probe sees) and the radiated field at test distance (3 m or 10 m) |
| **Quasi-static** | computed without propagation delay; valid while structures are small compared with the wavelength |
| **dBµA/m, dBµV/m, dBµV** | magnetic field, electric field and voltage in decibels relative to 1 µA/m, 1 µV/m and 1 µV. All line levels are RMS values, as on a spectrum analyser |
| **Dipole moment** | the measure of a small current loop (area × current) that determines its far field |
| **LISN** | line impedance stabilisation network: the defined 50 Ω termination per line at which conducted emission is measured |
| **Quasi-peak** | the detector the standards prescribe below 1 GHz; for a stable clock line it reads the same as the peak detector |
| **Class A / class B** | limit classes: B for residential, A (looser) for commercial and industrial environments |
| **Clemson method** | published formulas of Clemson University's EMC expert system for common mode with cables and crosstalk into I/O lines; deliberately worst case |
| **Decoupling, mounting inductance** | capacitors that supply an IC's current spikes locally; what matters is the inductance of package, track and vias, not the capacitance value |
| **Ferrite bead** | a lossy inductor used as a filter; a bypass capacitance across it (overlapping copper) defeats it above some tens of MHz |
| **ESD, TVS** | electrostatic discharge, and the protection diode that diverts it at the connector |
| **Cavity resonance** | a resonance of the space between two planes; at those frequencies a layer change can radiate far more than computed |
| **FDTD** | finite-difference time domain, the method openEMS uses to solve Maxwell's equations |
| **Isosurface** | a surface of equal field strength |
| **Max hold** | keeping the highest value of several sweeps per frequency, to catch intermittent signals |
| **Registration** | the mapping between board and printer coordinates, from pads whose printer positions you entered |

---

## 13. Further reading

| Document | Contents |
|---|---|
| [RULES.md](RULES.md) | every finding with detection, threshold, origin, reliability and test board |
| [research/EMC-MISTAKES-CATALOGUE.md](research/EMC-MISTAKES-CATALOGUE.md) | the catalogue of EMC layout mistakes with sources |
| [stage-1/PHYSICS.md](stage-1/PHYSICS.md) | the physical model, formulas, validity and comparisons with the full wave |
| [review/TECHNICAL-REVIEW-2026-10.md](review/TECHNICAL-REVIEW-2026-10.md) | technical review of the physical and normative statements |
| [DECISIONS.md](DECISIONS.md) | numbered design decisions with their reasons |
| [IMPORT.md](IMPORT.md) | board formats and what each importer reads |
| [AI-PARTS-MANUAL.md](AI-PARTS-MANUAL.md) | how to fill in source values from datasheets, with origins |
| [CI-FIELD-CHECK.md](CI-FIELD-CHECK.md) | the command-line field check and a GitHub Actions example |
| [future/STAGE-3-FULL-WAVE.md](future/STAGE-3-FULL-WAVE.md), [tools/openems/README.md](../tools/openems/README.md) | full wave with openEMS |
| [future/STAGE-4-SCANNER.md](future/STAGE-4-SCANNER.md) | the near-field scanner |
| [ROADMAP.md](ROADMAP.md) | stages and what comes next |
