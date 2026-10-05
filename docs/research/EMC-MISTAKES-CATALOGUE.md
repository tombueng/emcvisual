# EMC mistakes catalogue: layout mistakes that make EMC tests fail

As of: 2026-10-05

This catalogue collects the layout mistakes that, in real projects (hobby and industry), most often
lead to failures in radiated or conducted emission tests. For each mistake it gives the physical
mechanism, the typical picture in the test lab, a detection rule based on KiCad data, an assessment
of whether the app's engine finds it today, a synthetic test board (bad variant and good twin)
and the fix. At the end come common myths, a list of the engine's gaps and all sources.

## Contents

1. [Structure of the entries and rating levels](#1-structure-of-the-entries-and-rating-levels)
2. [Physics in three numbers: why it is usually the cable that radiates](#2-physics-in-three-numbers-why-it-is-usually-the-cable-that-radiates)
3. [Framework for the synthetic test boards](#3-framework-for-the-synthetic-test-boards)
4. [Ranking and top 12](#4-ranking-and-top-12)
5. [Catalogue](#5-catalogue)
   - [A Return-current path and reference planes (K-01 to K-09)](#a-return-current-path-and-reference-planes)
   - [B Stack-up, routing, board edge (K-10 to K-14)](#b-stack-up-routing-board-edge)
   - [C Placement, connectors and cables (K-15 to K-23)](#c-placement-connectors-and-cables)
   - [D Power supply, decoupling, filter components (K-24 to K-28)](#d-power-supply-decoupling-filter-components)
   - [E Switching regulators and isolated converters (K-29 to K-36)](#e-switching-regulators-and-isolated-converters)
   - [F Metal parts, copper areas, shielding (K-37 to K-40)](#f-metal-parts-copper-areas-shielding)
6. [Myths and half-truths](#6-myths-and-half-truths)
7. [What the engine does not detect today and what that would take](#7-what-the-engine-does-not-detect-today-and-what-that-would-take)
8. [Sources](#8-sources)

---

## 1. Structure of the entries and rating levels

Every entry `K-xx` has the same sections:

- **Mechanism**: what happens physically, with orders of magnitude where a source gives them.
- **Symptom in the lab**: what the mistake looks like in the test report.
- **Detection from layout data**: the rule, the KiCad data it needs, typical false positives and
  false negatives.
- **Engine today**: `yes`, `partly` or `no`, referring to the state of the engine on 2026-10-04
  (Biot–Savart near field with return current and image currents, diagnostics `return-gap`,
  `ref-change`, `no-stitching`, `long-line`, far field as a small loop). Whatever is missing is
  stated there.
- **Test board**: a minimal board that a script can generate with the pcbnew Python API, plus the
  good twin without the mistake and the expected findings.
- **Fix** and **Don't**.
- **Confidence** and sources.

Rating levels for confidence:

| Level | Meaning |
|---|---|
| **established** | several independent expert sources, at least one measurement or a sound calculation |
| **consensus** | experts agree, but public measured figures are largely missing |
| **disputed** | expert sources contradict each other; here the tool may only give hints, not verdicts |
| **myth** | refuted by measurements or calculation (section 6) |

"Frequency of occurrence" is an estimate of how often the mistake shows up as the cause in failure
analyses, case studies and lab reports (high, medium, low). Hard statistics do not exist; the labs
publish rankings, but no percentages.

---

## 2. Physics in three numbers: why it is usually the cable that radiates

Today the engine estimates the far field as a small current loop (differential mode). Almost all
expert sources agree, however, that most tests are failed because of **common-mode currents on
cables**. Three numbers make this tangible; the formulas come from the sources named, the example
values are our own calculations using them:

1. **Differential-mode loop** (Ott, quoted in TI AN-2155): E ≈ 2.63·10⁻¹⁴ · f² · A · I / r
   (f in Hz, A in m², I in A, r in m). For a loop of 10 cm² at 50 MHz to reach the limit of
   40 dBµV/m (100 µV/m) at 3 m, it needs about **4.6 mA**.
2. **Common-mode current on a cable** (Ott/Paul, formula in the Tekbox application note):
   E ≈ 4π·10⁻⁷ · f · L · I / r. A cable 1 m long reaches the same limit at 50 MHz with as little
   as about **4.8 µA**. That is roughly a thousandth (60 dB) of the differential-mode current.
3. **Voltage between two cables**: according to Hubing, a few millivolts between two connected
   cables are enough for a failure. The Clemson expert-system algorithms estimate the worst case
   (resonant cable pair, 3 m, semi-anechoic chamber) as E ≈ 0.365 · V.
   **1 mV thus gives about 51 dBµV/m**, well above the Class B limit.

Where do these millivolts come from? The return current of a trace over a ground plane produces a
small voltage drop along the plane (partial inductance of the plane). Clemson approximates it as
L_p ≈ (4/π²) · µ0 · l · h / (d1 + d2) (l length, h height above the plane, d1 + d2 roughly the
plane width across the trace). Example calculation for a **properly** routed 50 mm clock trace
over a continuous plane (h = 0.21 mm, 60 mm wide board, 25 MHz clock with 33 mA edge current,
third harmonic at 75 MHz with about 7 mA):
L_p ≈ 0.09 nH, voltage ≈ 0.29 mV, common-mode estimate ≈ **41 dBµV/m**, i.e. right at the limit.
The differential-mode emission of the same trace is only about 11 dBµV/m. If this trace lies
between two connectors with cables attached, common mode decides the outcome, not the loop.

Glen Dash shows the same with simulation and measurement: in the calculation, a small, matched
line radiated 27 dB more as soon as two wires were attached to its return conductor; the
common-mode current measured in the set-up (about 1.2 mA) confirmed the model.

**Consequences for the app:**

- The differential-mode estimate is a **lower bound**. A result below the limit must never be
  phrased as "passes".
- Mistakes that create common mode on cables (K-15 to K-22, K-36, K-37) are the most frequent
  causes in practice, but invisible with today's model. Section 7 describes how the Clemson
  formulas could be added with little effort.
- The rules "return current interrupted" and "layer change without return path" nevertheless
  remain important: they enlarge the loop **and** the voltage across the plane, and so drive both
  mechanisms.

Sources: [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Tekbox, RF current to E-field](https://www.tekbox.com/product/AN_-RF_current_to_electric_field_strength_extrapolation.pdf),
[Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Clemson, Current-driven CM algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Current-driven_CM_algorithm_summary.pdf),
[Clemson, Grid point voltage algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_Grid_Array_summary.pdf),
[Glen Dash, How Common Mode Currents Are Created](https://emcfastpass.com/wp-content/uploads/2017/04/Creation_of_CM_Currents.pdf).

---

## 3. Framework for the synthetic test boards

All test boards follow a common skeleton so that a script can generate them with little code. It
is modelled on `tools/demo-board/gen_demo_board.py` (KiCad 10.0.6, pcbnew Python API, footprints
from `/usr/share/kicad/footprints`).

### 3.1 Procedure in the generator

1. Create the board, nets, footprints, tracks, vias, zones and keepout areas (rule areas) and save
   it unfilled.
2. Insert the stack-up into the file as text (the Python API does not write a stack-up), as in the
   demo board.
3. Load it in a new process, fill all zones (`ZONE_FILLER`) and save. Without a saved fill the
   parser sees no planes; after filling, every test board must be checked for the presence of
   `filled_polygon`.
4. Per case, two files `K-xx-bad.kicad_pcb` and `K-xx-good.kicad_pcb` plus an expectation file
   `K-xx.expect.json` (suggested location: `tools/emc-cases/`, output to `boards/emc-cases/`).

The expectation file contains: the sources (type, net or pads, frequency, rise time, amplitude),
the expected diagnostics per variant (kind, location with ±3 mm tolerance), the expected direction
and minimum size of the far-field difference between bad and good, and a field
`engine_today: "detect" | "partial" | "missing"`. This lets the CI carry missing detections as a
known gap (expected failure) instead of keeping quiet about them.

### 3.2 Coordinates and base boards

Board-local coordinates in mm, x to the right, y downwards, origin at the top left; in the KiCad
file shifted by `ORIGIN = (100, 80)` as in the demo board. Standard outline **80 × 60 mm**.

| Base | Layers | Stack-up | Assignment |
|---|---|---|---|
| **TB-4L** | 4 | JLC04161H-7628 as in the demo board: F.Cu, 0.2104 mm prepreg 7628 (εr 4.4), In1.Cu, 1.065 mm core (εr 4.6), In2.Cu, 0.2104 mm prepreg, B.Cu; 1.6 mm in total | F.Cu signals; In1.Cu GND zone over the whole board (0.5 mm edge clearance); In2.Cu +3V3 zone over the full area; B.Cu free |
| **TB-4L-GG** | 4 | as TB-4L | In1.Cu and In2.Cu both GND (stack-up signal/GND/GND/signal, supply routed as tracks) |
| **TB-2L** | 2 | FR4 1.6 mm, 35 µm copper | F.Cu signals; B.Cu depending on the case |
| **TB-6L** | 6 | F.Cu, 0.2 mm, In1 (GND), 0.3 mm, In2 (signal), 0.6 mm, In3 (GND), 0.3 mm, In4 (+3V3), 0.2 mm, B.Cu | only for K-13 |

A 50 Ω microstrip on F.Cu over In1 (h = 0.21 mm, εr 4.4) is about **0.35 mm** wide
(Hammerstad approximation, own calculation).

### 3.3 Standard parts (available in the KiCad 10 standard library)

| Ref | Purpose | Footprint | Value, pins |
|---|---|---|---|
| X1 | Clock oscillator | `Oscillator:Oscillator_SMD_Abracon_ASE-4Pin_3.2x2.5mm` | `25MHz`; 1 EN (+3V3), 2 GND, 3 OUT, 4 VDD |
| Y1 | Crystal (K-17 only) | `Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm` | `16MHz`, nets `XTAL_IN`, `XTAL_OUT` |
| R1 | Series resistor | `Resistor_SMD:R_0603_1608Metric` | `33R` |
| U1, U2 | Driver, receiver, MCU placeholder | `Package_SO:SOIC-8_3.9x4.9mm_P1.27mm` | pin 4 GND, pin 8 VCC, set the pin functions |
| C1, C2 … | Decoupling capacitors | `Capacitor_SMD:C_0402_1005Metric` | `100nF` |
| J1, J2 | Cable connectors | `Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical`, `Connector_USB:USB_C_Receptacle_GCT_USB4085`, `Connector_USB:USB_Micro-B_Molex-105017-0001` | per case |
| J3 | Ribbon cable | `Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Vertical` | per case |
| U3 | Buck regulator | `Package_TO_SOT_SMD:TSOT-23-6` | pin functions `GND`, `SW`, `VIN`, `FB`, `EN`, `VBST` |
| L1 | Power inductor | `Inductor_SMD:L_Taiyo-Yuden_NR-40xx` | `4.7uH` |
| CIN, COUT | Converter capacitors | `Capacitor_SMD:C_1206_3216Metric`, `Capacitor_SMD:C_0402_1005Metric` | `10uF`, `100nF`, `22uF` |
| MH1 … | Mounting holes | `MountingHole:MountingHole_3.2mm_M3_Pad_Via` | GND or no net |

Choose net names so that the source suggestions (`src/physics/suggest.ts`) take effect: `CLK_25M`,
`SPI_SCK`, `USB_D+`/`USB_D-`, pin functions `SW`, `VIN`, `GND` on the regulator.

### 3.4 Recurring building blocks

- **CLK path**: X1 at (12, 30), R1 directly at the output (distance ≤ 3 mm), 0.35 mm track on
  F.Cu with a horizontal main section at y = 30 up to the input pin of U2 at (68, 30),
  length ≈ 52 mm. C1 at X1 and C2 at U2, each with one GND via and one +3V3 via directly at the pad.
  Source: `CLK_25M`, 25 MHz, duty cycle 50 %, rise time 1 ns, 3.3 V.
- **BUCK block** (area about 20 × 15 mm, layer depending on the case): 12 V to 3.3 V, 2 A, 500 kHz,
  switching edge 5 ns; hot loop in pad order CIN.1 → U3.VIN → U3.GND → CIN.2;
  switch-node swing 12 V; inductor current 2 A.
- **Cable connector**: a connector counts as a cable connection if its reference starts with `J`
  and its footprint comes from a `Connector_*` library.

---

## 4. Ranking and top 12

Ranked by frequency of occurrence in failure analyses and by the confidence of the evidence. The
first twelve entries are the ones a layout-based tool must find without fail.

| Rank | ID | Mistake | Confidence | Frequency of occurrence | Engine today | Top 12 |
|---|---|---|---|---|---|---|
| 1 | K-01 | Signal trace over a slot in the reference plane | established | high | yes (gaps from 0.2 mm with detour) | **yes** |
| 2 | K-15 | High-speed circuit between connectors on different edges | established | high | yes (`cable-cm` estimate) | **yes** |
| 3 | K-29 | Large hot loop in the switching regulator | established | high | yes | **yes** |
| 4 | K-02 | Separate analogue and digital ground (split AGND–DGND) | established | high | yes (split treated as `return-gap`) | **yes** |
| 5 | K-09 | Two-layer board without a return plane | established | high | yes (`no-reference`, return path via ground copper) | **yes** |
| 6 | K-07 | Layer change without a ground via | established | high | yes | **yes** |
| 7 | K-08 | Reference change GND↔supply without a capacitor | established | medium | yes | **yes** |
| 8 | K-19 | Filter bypassed by overlap or parallel routing | consensus | high | yes (overlap; parallel routing no) | **yes** |
| 9 | K-18 | I/O filter far from the connector | consensus | high | yes (`filter-far`, `filter-ground`) | **yes** |
| 10 | K-20 | Poorly terminated connector shield | established | high | yes (`shield-open`, `shield-weak`) | **yes** |
| 11 | K-16 | RF traces coupling into I/O lines | consensus | medium–high | yes (`io-coupling` estimate) | **yes** |
| 12 | K-24 | Decoupling missing or connected with high inductance | established | high | yes (`decoupling`, connection inductance roughly) | **yes** |
| 13 | K-10 | Signal layer without an adjacent plane, poor stack-up | established | medium | yes (`no-adjacent-plane`) | |
| 14 | K-11 | High-speed trace at the board edge | consensus | medium | yes (`edge-trace`) | |
| 15 | K-31 | Switch node too large or exposed | consensus | medium | yes (`sw-node`; voltage-driven coupling no) | |
| 16 | K-32 | Ground plane split under the converter | established | medium | yes | |
| 17 | K-36 | Isolation barrier without an RF return path | established | medium | no | |
| 18 | K-34 | Converter input filter missing or wrongly placed | established | high | yes (differential-mode estimate) | |
| 19 | K-03 | Signal trace over an island boundary of the power plane | consensus | medium | yes (split treated as `return-gap`) | |
| 20 | K-14 | Asymmetric differential pair | established | medium | yes (`pair-skew`; common mode not calculated) | |
| 21 | K-17 | Crystal at the edge or a connector, traces underneath | consensus | medium | yes (`crystal-placement`, `crystal-under`) | |
| 22 | K-22 | Too few ground pins in connectors and ribbon cables | consensus | medium | yes (`connector-ground`) | |
| 23 | K-04 | Tracks in the ground layer | consensus | medium | yes (gaps from 0.2 mm) | |
| 24 | K-05 | Antipad chains forming a slot | consensus | medium | yes | |
| 25 | K-12 | Electrically long line without termination | consensus | medium | yes | |
| 26 | K-33 | Power inductor unshielded or wrongly oriented | established | medium | yes (`inductor-placement`; shielding, winding start no) | |
| 27 | K-37 | Heatsink or metal part without a ground connection | consensus | medium | yes (`heatsink-floating`) | |
| 28 | K-26 | Ferrite bead used incorrectly | established | medium | yes (`ferrite-ground`) | |
| 29 | K-28 | Supply loop on two-layer boards | consensus | medium | partly | |
| 30 | K-21 | No chassis bond in the connector area | consensus | medium | no | |
| 31 | K-35 | Large gate loops, missing snubber | consensus | medium | partly | |
| 32 | K-30 | Wrong loop made compact | consensus | low–medium | partly (buck and boost in the source suggestion) | |
| 33 | K-13 | Fast nets on outer layers with many vias | consensus | medium | partly | |
| 34 | K-06 | Neck in the ground plane | consensus | low | no | |
| 35 | K-25 | Widely different MLCCs in parallel | disputed | medium | no | |
| 36 | K-27 | Common-mode choke on an unbalanced supply | disputed | medium | no | |
| 37 | K-38 | Floating or poorly stitched copper areas | disputed | medium | yes (`floating-copper`; stitching no) | |
| 38 | K-23 | Ethernet: planes and chassis at the transformer | disputed | low | no | |
| 39 | K-39 | Plane edges and cavity resonance | disputed | low | no | |
| 40 | K-40 | Shield can with too few contacts | consensus | low | no | |

In short (as of 2026-10-05): all of the top 12 are detected, the cable and common-mode cases
(K-15, K-16) as a worst-case estimate, K-19 only for the overlap. Still open are mainly K-06, K-13,
K-21, K-23, K-25, K-27, K-36, K-39 and K-40. The current list with thresholds and test boards is
in [docs/RULES.md](../RULES.md); the "Engine today" statement in the individual entries of
section 5 reflects the state at the time the catalogue was written.

---

## 5. Catalogue

### A Return-current path and reference planes

#### K-01 · Signal trace over a slot in the reference plane
*EN: Trace crossing a slot or gap in its reference plane* · Confidence **established** ·
Frequency of occurrence high · Engine today **yes** (gaps from 1 mm) · **Top 12**

**Mechanism.** From about 1 MHz at the latest, the return current flows almost entirely directly
beneath the trace, because that is the path of least inductance (Bogatin). A slot forces it around
the end of the slot. The loop grows by roughly the slot length times the distance, the slot itself
acts as a slot antenna, and the inductive voltage drop across the slot drives the two plane halves
against each other. If cables are attached to the halves, common mode arises in addition.
Measured values: Wyatt reports harmonics 10 to 15 dB higher for a trace over a gap than for the
same trace without a gap; in one practical case, a copper-tape bridge across the slots reduced the
emission by 17 dB. At TI (AN-2155), removing the ground plane under the high-current path of a buck
regulator cost 6 dB of margin to the limit.

**Symptom in the lab.** Narrowband clock and data harmonics, mostly 100 MHz to 1 GHz, often
strongly dependent on polarisation; in a near-field scan, a hotspot along the slot.

**Detection from layout data.** For every segment of a fast net, determine the nearest plane layer
and intersect the projection of the segment with the filled zone geometry of that layer; uncovered
stretches ≥ about 3·h are findings, and the detour follows from a path through the plane around the
gap. *Data:* filled zones per layer (`filled_polygon`), keepout areas, stack-up thicknesses, net
classification (fast or slow). *False positive:* slow nets (reset, push buttons, I²C at
100 kHz); gap only in the more distant plane while a nearer plane continues. *False negative:*
zone fill not saved; gaps below the detector's minimum width (see K-03, K-04).

**Engine today.** Yes: `return-gap` with the detour length and its contribution to the far field.
Limitation (when the catalogue was written): `MIN_GAP = 1.0 mm`. Update 2026-10-05: the threshold
is now `MIN_GAP = 0.2 mm` on a 0.1 mm raster (`src/physics/diagnostics.ts`), and a gap is reported
when the return has to go at least 2 mm further than straight across (see [docs/RULES.md](../RULES.md)).
The common-mode component (voltage between the halves) is missing.

**Test board.** Base TB-4L with CLK path.
*Bad:* keepout area (keepout for zones) on In1.Cu at x = 38 to 40, y = 5 to 55, i.e. a 2 mm wide,
50 mm long slot running across under the clock trace, with a 5 mm web of copper at both ends.
*Variant:* slot from y = 0 to 60 (plane completely split, no detour possible).
*Good:* the same board without the keepout area.
*Expected:* bad: `return-gap` at (39, 30), detour ≈ 50 mm, far field clearly higher (≥ 10 dB);
the variant without a detour as a separate case; good: no finding.

**Fix.** Leave the reference plane undivided. If a slot is unavoidable, route fast traces around it
or across a deliberately left bridge. Better to run a slow trace across the slot than a fast one.
**Don't:** regard a bridging capacitor as the standard solution; with its pads and vias it has at
least a few nH and is only effective up into the lower hundreds of MHz (see M-15). "Bridge" the
slot with a ferrite.

**Sources.** [Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Wyatt, Top Ten EMC Problems (slides)](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Bogatin, Rule of Thumb #7](https://www.edn.com/total-inductance-in-the-return-path-rule-of-thumb-7/),
[Academy of EMC, Design Guidelines](https://www.academyofemc.com/emc-design-guidelines).

#### K-02 · Separate analogue and digital ground
*EN: Split analog/digital ground planes (AGND/DGND) with signals or cables on both sides* ·
Confidence **established** · Frequency of occurrence high · Engine today **partly** · **Top 12**

**Mechanism.** As K-01, only deliberate: every trace between the two areas crosses the gap. In
addition, at high frequencies the two planes are at different potentials and thus form two antenna
halves as soon as cables or enclosure parts are attached on both sides. Hubing calls
"isolated grounds" the most common layout mistake of all and advises practically never splitting a
ground plane. Ott recommends a single plane with partitioning (analogue components and traces only
in the analogue area) and considers a split worth contemplating only at very high resolution (from
about 14 to 16 bits); even then, all traces should cross only via one defined bridge. The only
clear exception for Hubing: currents below about 100 kHz that disturb a very sensitive circuit.
Practical guides from the developer community, too, name merging separate grounds as the first
measure against stubborn emission problems.

**Symptom in the lab.** Digital harmonics on the cable of the analogue section (or vice versa),
easy to detect with a current clamp on the cable.

**Detection from layout data.** Several planes of different ground nets on one layer (names such as
`AGND`, `DGND`, `PGND`, `GNDA`, `GND_ISO`) or ground islands of the same net that are connected only
via a net tie, a 0 Ω resistor or a ferrite (`FB*`, `L*` between two ground nets). Finding if
(a) fast nets cross the gap or (b) cable connectors are attached to both areas.
*Data:* net names, zones per net, footprint type and value (`0R`, ferrite), connector positions.
*False positive:* galvanically isolated domains behind isolators (that is K-36, with its own rules);
a chassis island under a connector (see K-21, K-23). *False negative:* split on only one inner
layer while another layer continues through.

**Engine today.** Partly. If a trace crosses the gap and the gap is wider than about 1 mm,
`return-gap` reports the finding. Large planes of other nets on the same layer are treated as one
common plane for the return current (`src/model/planes.ts`), so the engine does not see the net
change at the boundary. The fact that two cables are attached to different ground halves is not
evaluated; that would need the common-mode model, which is missing (section 7).

**Test board.** Base TB-4L.
*Bad:* In1.Cu divided into two zones: `AGND` x = 0 to 39.25 and `DGND` x = 40.75 to 80
(1.5 mm gap, safely above today's detection threshold), connected only via R5 `0R` (0603)
at (40, 56). U1 as ADC at (22, 30), U2 as MCU
at (60, 30). Net `SPI_SCK` (source 10 MHz, 2 ns) on F.Cu from U2 to U1 straight across the gap.
J1 (pin header 1×04, analogue input) at the left edge at (3, 30) on AGND, J2 (USB-C) at the right
edge at (77, 30) on DGND.
*Variant "bridge" (permissible according to Ott):* gap with a 6 mm wide copper bridge at y = 27 to
33; SPI_SCK runs over the bridge. Expected: no `return-gap`.
*Variant "narrow":* gap only 0.5 mm (typical zone clearance). Tests the minimum width.
*Good:* continuous GND plane, same placement (partitioning), R5 omitted.
*Expected today:* bad: `return-gap` at (40, 30); variant "narrow" undetected today (known
gap). *Target:* additionally "two ground islands, cables on both" with a common-mode estimate.

**Fix.** One ground plane, group components by function, keep traces within their own area,
connect the ADC pins AGND and DGND both to the same plane directly at the component.
**Don't:** flood AGND and DGND separately and connect them with a ferrite; place the "star point"
far from the converter (the ADC).

**Sources.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines),
[Ott, Grounding of Mixed Signal PCBs](https://hott.shielddigitaldesign.com/techtips/split-gnd-plane.html),
[TI SLYT512, Grounding in mixed-signal systems demystified](https://www.ti.com/lit/an/slyt512/slyt512.pdf),
[LearnEMC, Grounding](https://learnemc.com/grounding),
[A One-Page Guide to Fixing Radiated Emissions](https://cushychicken.github.io/radiated-emissions-debug/).

#### K-03 · Signal trace over the island boundary of a split power plane
*EN: Trace referenced to a split power plane (3V3/5V/1V8 islands)* · Confidence **consensus** ·
Frequency of occurrence medium · Engine today **partly**

**Mechanism.** On four-layer boards the supply layer is often divided into islands. Traces on the
adjacent layer (usually B.Cu) use this layer as their reference. At the island boundary the return
current has to change from one island to the other; there is no direct path, only one through
decoupling capacitors to ground and back again. Simonovich describes the combination of a gap and
return current diverted along the edge as an effective slot antenna; with microstrip, there is
moreover no shielding at all towards the outside.

**Symptom in the lab.** Harmonics from traces on the bottom side, especially for buses that run
across several islands.

**Detection from layout data.** A layer with several zones of different supply nets; segments on
the adjacent layer whose projection crosses an island boundary. Search for the nearest capacitor
between each island and GND within a radius of a few mm; without one, the return path is long.
*Data:* zones with their nets, stack-up, capacitors with their two nets. *False positive:*
stripline with a nearby GND plane on the other side (the larger part of the return current flows
there); slow nets. *False negative:* island spacing below the detector width.

**Engine today.** Partly. Because planes of other nets are included in the same coverage grid, the
engine sees only the gap between two islands. Typical island spacings are 0.3 to
0.5 mm (zone clearance) and were therefore below the original `MIN_GAP = 1.0 mm`: the mistake
then went undetected. Needed: treat a net change along a segment as an event of its own (like
`ref-change` at vias, only within the plane), with a detour via the nearest capacitor.
Update 2026-10-05: done. Every raster cell of a split plane layer knows its net, and a line that
crosses from one net's copper to another's is reported as a plane split (`return-gap` with the
split flag); the gap threshold is now 0.2 mm.

**Test board.** Base TB-4L.
*Bad:* In2.Cu divided into `+3V3` (x = 0 to 39.75) and `+5V` (x = 40.25 to 80), gap
0.5 mm. CLK path on **B.Cu** (vias at both ends from the pads on F.Cu), so that In2.Cu is the
nearest plane. No capacitors near the boundary.
*Variant:* gap 1.5 mm (detectable today).
*Good:* CLK on F.Cu over In1 (GND), or In2 undivided.
*Expected today:* 0.5 mm variant without a finding (known gap), 1.5 mm variant `return-gap`.
*Target:* both variants with a finding and a detour via the nearest capacitors.

**Fix.** Run fast traces only on layers next to a ground plane; lay out supply islands so that no
fast trace crosses them; if one does, place decoupling capacitors on both sides of the crossing
(emergency solution).
**Don't:** regard supply islands as an "equivalent reference".

**Sources.** [Simonovich, Split planes and microstrip](https://www.signalintegrityjournal.com/articles/692-split-planes-and-what-happens-when-microstrip-signals-cross-them),
[TI, USB 2.0 Board Design and Layout Guidelines](https://e2echina.ti.com/cfs-file/__key/telligent-evolution-components-attachments/13-106-00-00-00-00-33-10/USB-2.0-Board-Design-and-Layout-Guidelines.pdf),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/).

#### K-04 · Tracks in the ground layer
*EN: Tracks routed through the ground-plane layer* · Confidence **consensus** · Frequency of
occurrence medium (high for hobby four-layer boards) · Engine today **partly**

**Mechanism.** "Just a few tracks" on the ground layer cut a long, narrow slot into the plane, as
wide as the track width plus twice the zone clearance. For the return current of the traces above,
this acts like K-01, only less visibly, because the plane looks almost complete in the editor.

**Symptom in the lab.** As K-01.

**Detection from layout data.** Tracks of other nets on a layer recognised as a plane layer;
determine the length and position of the resulting slot and check it against fast nets on the
neighbouring layers as in K-01. *Data:* tracks per layer, zone clearance, filled zones.
*False positive:* short stub tracks without a crossing fast trace. *False negative:* as K-03 (slot
width below 1 mm).

**Engine today.** Partly. A slot formed by a 0.25 mm track and 2 × 0.2 mm clearance is 0.65 mm wide
and fell below the original `MIN_GAP` of 1 mm. Update 2026-10-05: with `MIN_GAP = 0.2 mm` such a
slot is found, and `return-gap` reports it when the return has to detour by at least 2 mm.

**Test board.** Base TB-4L with CLK path.
*Bad:* net `LED` as a 0.25 mm track on In1.Cu from (40, 5) to (40, 55), zone clearance 0.2 mm.
*Variant:* 0.5 mm track with 0.5 mm clearance (slot 1.5 mm).
*Good:* track `LED` on B.Cu.
*Expected today:* the 1.5 mm variant gives `return-gap`, the main case is undetected (known gap).
*Target:* both detected; better: a rule "track on a plane layer under a fast trace".

**Fix.** Keep the ground layer free of tracks; if that is unavoidable, keep them short and parallel
to the fast traces above, never running across underneath them.
**Don't:** mix "GND plane plus a few signals" on one layer and count it as a ground layer.

**Sources.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines).

#### K-05 · Antipad chains and connector pin rows forming a slot
*EN: Antipad chains ("Swiss cheese") forming a slot under connector or via rows* · Confidence
**consensus** · Frequency of occurrence medium · Engine today **yes** (if the chain is contiguous)

**Mechanism.** The clearances (antipads) around plated through-holes in the ground layer merge into
one continuous slot when the pitch is tight. Typical cases: pin headers at 2.54 mm pitch with a
large zone clearance, the via rows of a bus, BGA or connector fields. Infineon shows how the return
current is forced around a group of vias.

**Symptom in the lab.** As K-01, frequently at connectors to add-on boards.

**Detection from layout data.** Evaluate the raster image of the filled zone: contiguous holes of
great length and small width under fast traces. *Data:* filled zones, pad and via diameters, zone
clearance. *False positive:* rows of holes with copper webs between them (the current flows
through the webs). *False negative:* webs narrower than the zone's minimum width are removed by
KiCad; the fill then shows the slot correctly, but the eye in the editor does not.

**Engine today.** Yes, provided the contiguous hole is larger than 3 mm² (smaller enclosed holes
are deliberately filled in by `fillSmallHoles`) and the trace crosses it over a length of at least
1 mm.

**Test board.** Base TB-4L with CLK path, track width 0.2 mm here.
*Bad:* J3 = `PinHeader_1x10_P2.54mm_Vertical`, vertical at x = 40, pins at y = 18.57 to
41.43 (pins 5 and 6 at 28.73 and 31.27), pins on nets `IO0` to `IO9`. Zone clearance on In1.Cu
0.5 mm, i.e. an antipad diameter of 2.7 mm at a pitch of 2.54 mm: the antipads merge into a slot
about 26 mm long. The CLK trace runs on F.Cu at y = 30 between pins 5 and 6.
*Good:* zone clearance 0.2 mm, minimum zone width 0.2 mm (webs of 0.44 mm remain), or CLK routed
around the connector.
*Expected:* bad: `return-gap` at (40, 30); good: no finding.

**Fix.** Smaller clearances, intersperse ground pins in the pin row, do not route fast traces
through pin fields.
**Don't:** set large zone clearances for all nets "to be on the safe side".

**Sources.** [Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf).

#### K-06 · Neck in the ground plane
*EN: Ground-plane neck (narrow copper bridge between plane regions)* · Confidence **consensus**,
hardly any measured data · Frequency of occurrence low · Engine today **no**

**Mechanism.** A trace that runs over a narrow copper bridge does keep its return current directly
beneath it (the loop stays small), but the partial inductance of the plane rises because the
return current cannot spread out sideways. In the Clemson approximation it is inversely
proportional to the effective plane width: a 3 mm wide neck instead of the 60 mm board width raises
the voltage between the two board halves by up to about twenty times (26 dB, own calculation with
the formula, indicating the trend only). This voltage drives cables attached to the two halves
(Hockanson et al., "finite-impedance reference planes").

**Symptom in the lab.** Common mode on cables attached on different sides of the neck.

**Detection from layout data.** Topology of the plane: two large areas connected only via a bridge
narrower than about a fifth of the board width; finding if fast traces use the bridge and
connectors are located on both sides. *Data:* filled zones, connector positions.
*False positive:* necks without a connector on the other side. *False negative:* none.

**Engine today.** No; the differential-mode component is correctly small, the common-mode component
is missing.

**Test board.** Base TB-4L with CLK path, J1 (pin header 1×04) at (3, 30), J2 (USB-C) at
(77, 30).
*Bad:* two keepout areas on In1.Cu: x = 38 to 42, y = 0 to 28.5 and y = 31.5 to 60
(a 3 mm wide bridge exactly under the clock trace).
*Good:* undivided plane.
*Expected today:* no finding, far field almost the same. *Target:* common-mode estimate clearly
higher in the bad variant.

**Fix.** Connect planes over a wide width; do not place cut-outs so that they almost divide the
board.
**Don't:** use necks deliberately as a "filter" for the ground plane.

**Sources.** [Clemson, Grid point voltage algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_Grid_Array_summary.pdf),
[Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

#### K-07 · Layer change without a ground via
*EN: Layer change without a ground stitching via (GND to GND reference)* · Confidence
**established** · Frequency of occurrence high · Engine today **yes** · **Top 12**

**Mechanism.** If a trace changes through a via from a layer referenced to GND (above) to a layer
referenced to GND (below), the return current has to move from one plane to the other. If there is
no ground via nearby, it takes the nearest transition, which can be arbitrarily far away; the loop
grows accordingly, and the two planes form an excited cavity. Wyatt advises placing additional vias
for the return current at every reference change; Academy of EMC recommends 2 to 3
stitching vias next to fast signal vias.

**Symptom in the lab.** Harmonics of fast traces, often with a resonant peak in the
hundreds-of-MHz range (cavity between the planes).

**Detection from layout data.** For every via of a fast net: determine the reference plane above
and below; same net, but no via of this net connecting both planes within a radius of
about 2 to 3 mm. *Data:* vias with their layer pair, zones, stack-up. *False positive:* slow nets;
planes that are connected right next to the via by large plated holes (mounting holes, connector
pins). *False negative:* blind and buried vias, if their layer range is read wrongly.

**Engine today.** Yes: `no-stitching` (radius 3 mm) with a detour via the nearest ground via or the
nearest capacitor.

**Test board.** Base TB-4L-GG.
*Bad:* CLK path on F.Cu to via V1 at (40, 30), continuing on B.Cu to via V2 at (64, 30),
then back on F.Cu to U2. Ground vias only at C1 and C2 (≥ 20 mm away).
*Good:* one ground via each at (41.2, 30) and (65.2, 30).
*Expected:* bad: `no-stitching` twice, with detours of about 2 × 24 mm; good: no finding.

**Fix.** Next to every signal via that changes between two ground reference planes, place a ground
via (≤ 1 to 2 mm away); for differential pairs, two placed symmetrically.
**Don't:** avoid vias on principle for the sake of "signal integrity" and accept long detours on one
layer instead (length is usually worse than a well-accompanied via).

**Sources.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines),
[Bogatin, Rules of Thumb](https://www.edn.com/bogatins-rules-of-thumb/).

#### K-08 · Reference change GND↔supply without a nearby capacitor
*EN: Reference change between ground and power plane without a nearby capacitor* · Confidence
**established** · Frequency of occurrence medium · Engine today **yes** · **Top 12**

**Mechanism.** If the trace changes from a layer referenced to GND to one referenced to the supply
(typically F.Cu → B.Cu on a four-layer board), the return current can only cross over through
capacitance between the planes: decoupling capacitors or the plane capacitance itself. In the usual
four-layer board with a 1 mm core, the plane capacitance is small (about 16 pF/cm² at 0.25 mm
spacing according to LearnEMC, correspondingly about a quarter of that at 1 mm). A capacitor helps
only up to its resonance and only if it is close; studies also show additional resonances between
capacitors and the plane pair.

**Symptom in the lab.** As K-07, often with broader resonance humps.

**Detection from layout data.** As K-07, but with different nets on the two reference planes; then
search for the nearest capacitor between exactly these two nets and evaluate its distance and
connection inductance. *Data:* capacitors with their nets and value. *False positive:*
stripline with GND on one side. *False negative:* the capacitor is close, but connected via long
tracks (see K-24).

**Engine today.** Yes: `ref-change` with a detour via the nearest capacitor.

**Test board.** Base TB-4L (F.Cu over GND, B.Cu over +3V3).
*Bad:* CLK as in K-07 via V1 (40, 30) and V2 (64, 30) on B.Cu; only C1 and C2 as
GND–3V3 capacitors.
*Good:* additionally C3 and C4 (100 nF, 0402) with their own vias, each ≤ 2 mm next to V1 and V2.
Second good twin: TB-4L-GG with ground vias as in K-07.
*Expected:* bad: `ref-change` twice, with a detour via C1 and C2 respectively; good: short detours
via C3, C4.

**Fix.** Keep fast traces on layers with a ground reference; otherwise place a capacitor directly
at the via. A signal/GND/GND/signal stack-up avoids the problem entirely (Hartley, Wyatt).
**Don't:** assume that the plane capacitance of a standard four-layer board provides the return
path.

**Sources.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Study: decoupling capacitors at a reference change (ResearchGate)](https://www.researchgate.net/publication/251803889_Effect_of_decoupling_capacitor_on_signal_integrity_in_applications_with_reference_plane_change),
[LearnEMC, Decoupling with closely spaced planes](https://learnemc.com/decoupling-for-boards-with-closely-spaces-power-planes),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/),
[Hartley via Sierra Circuits](https://www.protoexpress.com/blog/rick-hartley-pcb-design-recommendations-to-minimize-emi/).

#### K-09 · Two-layer board without a return plane
*EN: Two-layer board without a solid return plane ("ground as a track")* · Confidence
**established** · Frequency of occurrence high (hobby and small series) · Engine today **partly** · **Top 12**

**Mechanism.** Without a plane, the return current flows wherever the ground track runs, and the
loops become as large as the paths between the signal and the ground track. Ott gives the rule of
thumb that, other conditions being equal, a four-layer board radiates about 15 dB less than a
two-layer one. At TI (AN-2155), adding ground planes to a buck layout gave 4 dB more margin.
A ground grid on both layers (Ott, "gridded ground") reduced the emission by about 7 dB in one
study. A practical case at Unit 3 Compliance (Pawson) shows the same on four layers: no
contiguous planes, undefined return currents, failure at 210 MHz.

**Symptom in the lab.** Broad combs of harmonics, often already below 100 MHz.

**Detection from layout data.** No layer on which a ground net covers more than about 25 % of the
area; then, for every fast trace, search for the return path through the ground net (shortest path
over GND copper between the driver and receiver ground pins) and calculate the enclosed area.
*Data:* netlist, tracks, GND pin functions. *False positive:* the ground track runs directly beneath
or next to the trace. *False negative:* a ground plane exists but is fragmented (islands connected
only via thin tracks).

**Engine today.** Partly. Without a plane, the engine uses a substitute line (`unreferenced` in
`src/physics/lines.ts`) and places the return current on the opposite outer layer (warning `unreferenced`). It
does not model the real return path along the ground tracks; the loop area is therefore not the
actual one.

**Test board.** Base TB-2L with CLK path.
*Bad:* ground only as a 0.5 mm track on B.Cu from X1-GND along the bottom edge (y = 55) to
U2-GND; supply as a track along the top edge (y = 5). Enclosed area about 52 × 25 mm.
*Good A:* B.Cu as a continuous GND zone. *Good B:* ground grid (B.Cu horizontal, F.Cu vertical,
10 mm pitch, vias at the crossings).
*Expected today:* source warning `unreferenced`; the far field of the bad variant is not realistic.
*Target:* return path via the GND net, loop ≈ 1300 mm² versus ≈ 83 mm² for Good A, i.e. roughly 24 dB
difference in differential mode (own calculation, area ratio).

**Fix.** Use four layers if at all possible; otherwise make one layer almost entirely ground, put
the signals on the other, keep paths short, use a ground grid.
**Don't:** connect ground "somehow" as a track and rely on undivided copper areas that end at places
without a via (see K-38).

**Sources.** [Ott, PCB Stack-Up](https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[All About Circuits, Gridded ground](https://www.allaboutcircuits.com/technical-articles/multipoint-grounding-gridded-ground-for-double-sided-pcbs/),
[Pawson, Case study poor PCB layout](https://interferencetechnology.com/case-study-poor-pc-board-layout-causes-radiated-emissions/),
[LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes).

### B Stack-up, routing, board edge

#### K-10 · Signal layer without an adjacent plane, poor stack-up
*EN: Signal layer not adjacent to a plane / poor stack-up (planes far apart)* · Confidence
**established** · Frequency of occurrence medium · Engine today **partly**

**Mechanism.** The area a trace encloses is its length times its distance to the reference plane.
If the nearest plane is two or three dielectrics away, the loop grows accordingly and the fields
spread into the neighbouring layers. Ott demands, as the first goal of every stack-up, that
every signal layer be adjacent to a plane, and considers tightly coupled signal-to-plane spacings
more important than tightly coupled power and ground planes. Hartley states the same rule:
ground plane exactly one dielectric away from the signal and power layers. Wyatt puts poor
stack-ups (power and ground planes three layers apart) first among his five most common reasons
for failures.

**Symptom in the lab.** Generally raised level of all harmonics, crosstalk between layers.

**Detection from layout data.** From the stack-up, calculate the distance from every signal layer to
the nearest recognised plane; finding if a layer with fast nets has no directly adjacent plane or
if the distance is a multiple of the smallest spacing in the stack-up; a second finding if the
power plane is not adjacent to a ground plane. *Data:* stack-up (thicknesses, εr), recognised
plane layers, net classes per layer. *False positive:* a layer without fast nets. *False negative:*
stack-up missing from the file (KiCad only writes it if it has been maintained in Board Setup;
otherwise default values apply).

**Engine today.** Partly. The height above the plane enters the field via the stack-up and image
currents; the difference between a good and a bad stack-up is visible in the far field. A dedicated
diagnostic "layer without adjacent plane" is missing.

**Test board.** Base TB-4L with CLK path.
*Bad:* In1.Cu without a zone (only a few signal tracks), In2.Cu as a GND zone; the clock trace on
F.Cu sees its plane only at a distance of 1.275 mm.
*Good:* standard TB-4L (In1 GND at 0.21 mm).
*Expected:* far field of the bad variant roughly 15 dB higher (loop area about a factor of 6, own
calculation); *Target:* additionally the diagnostic "Signal layer F.Cu without adjacent plane".

**Fix.** Four-layer board as signal/GND/GND/signal or signal/GND/PWR/signal with thin outer
prepregs; from six layers upwards, every signal layer next to ground.
**Don't:** use the inner layers as signal layers and put the planes on the outside (Ott: sensible
only with compromises).

**Sources.** [Ott, PCB Stack-Up](https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html),
[Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/),
[Hartley via Sierra Circuits](https://www.protoexpress.com/blog/how-grounding-controls-noise-and-emi-by-rick-hartley/).

#### K-11 · High-speed trace at the board edge
*EN: High-speed trace routed close to the board or plane edge* · Confidence **consensus** ·
Frequency of occurrence medium · Engine today **no**

**Mechanism.** Near the plane edge, the return current cannot spread out symmetrically beneath the
trace; some of the field lines reach around the edge, and edge currents flow along the rim of the
plane, decreasing exponentially with distance (in multiples of the height h). From a length of
about half a wavelength, the edge becomes an effective radiator (roughly 16 cm at 900 MHz).
Archambeault recommends using edge channels only for slow signals. LearnEMC gives twice the height
above the plane as the minimum distance, Wyatt 3 to 5 track widths.

**Symptom in the lab.** Higher harmonics from a few hundred MHz upwards, emission preferentially in
the plane of the board.

**Detection from layout data.** For segments of fast nets, calculate the distance to the edge of the
filled reference plane (not only to the board outline); finding below about 2·h to 5·h, weighted by
the segment length. *Data:* outline, filled zones, stack-up. *False positive:* edge with a dense
via row and ground on both outer layers (encapsulated edge). *False negative:* the plane ends well
before the board edge (zone pull-back), but the trace lies above the plane edge.

**Engine today.** No. Image currents arise wherever there is copper beneath the element;
the plane edge is not treated separately.

**Test board.** Base TB-4L.
*Bad:* X1 at (12, 4), U2 at (68, 4); clock trace on F.Cu at y = 0.8 (the In1 plane ends at
y = 0.5, i.e. 0.3 mm from the plane edge, about 1.4·h).
*Good:* the same trace at y = 10 (about 45·h from the edge).
*Expected today:* hardly any difference. *Target:* a diagnostic "Line at the edge of its plane"
with the distance in multiples of h.

**Fix.** Keep fast traces at least a few h, better a few mm, away from the plane edge; reserve the
edge area for slow signals; if routing along the edge is unavoidable, add a row of ground vias along
the edge.
**Don't:** pull the plane far back from the edge "for manufacturing" and still leave the trace at
the edge.

**Sources.** [Archambeault, Routing high-speed traces close to the PCB edge](https://pcdandf.com/pcdesign/index.php/2008-archive-articles/3032-effects-of-routing-high-speed-traces-close-to-the-pcb-edge),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

#### K-12 · Electrically long line without termination, unnecessarily steep edges
*EN: Electrically long, unterminated line; unnecessarily fast edges* · Confidence **consensus** ·
Frequency of occurrence medium · Engine today **yes**

**Mechanism.** If the propagation delay is longer than about half the rise time, reflections and
ringing occur; the spectrum acquires peaks at the line resonances. Independently of this, the rise
time determines the frequency above which the spectrum falls at 40 dB/decade. LearnEMC advises
matched termination when the propagation delay exceeds half the transition time, and above all
slowing down the edge first; Academy of EMC recommends series resistors (typically 33 Ω) directly at
the driver. Hubing, on the other hand, considers rigid rules such as "terminate from λ/4" unsuitable.

**Symptom in the lab.** Harmonics above the expected envelope, narrow peaks at the line
resonances.

**Detection from layout data.** Net length versus rise time (entered by the user or derived from the
part type); search for a series resistor in the net and check its distance to the driver pin
(≤ a few mm). *Data:* netlist, pin functions or driver assignment, resistor values.
*False positive:* lines with slow drivers. *False negative:* drivers with a built-in series
resistor (not recognisable from the layout).

**Engine today.** Yes: `long-line` (λ/10 limit against the spectrum); series resistors are
recognised and slow down the effective edge (`trEff`).

**Test board.** Base TB-4L.
*Bad:* CLK path lengthened to 150 mm (meander at x = 20 to 60), no R1, rise time
0.5 ns.
*Good:* the same length with R1 = 33 Ω directly at the output; second good twin: the direct 52 mm path.
*Expected:* `long-line` for bad; for good, a lower far field above a few hundred MHz.

**Fix.** Short paths, a series resistor at the driver, driver strength and edge steepness as low as
the function permits, spread spectrum for clocks (TI reports about 8 dB peak reduction for a clock
device at ±2 % modulation, about 13 dB at the seventh harmonic).
**Don't:** define the termination by a wavelength rule instead of by propagation delay and rise time.

**Sources.** [LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines),
[TI SCAA103, Spread spectrum clocking](https://www.ti.com/lit/an/scaa103/scaa103.pdf).

#### K-13 · Fast nets on outer layers with many layer changes
*EN: Fast nets on outer layers with many vias instead of buried between planes* · Confidence
**consensus** · Frequency of occurrence medium · Engine today **partly**

**Mechanism.** A microstrip line has an open field towards the outside; a stripline between two
planes is largely encapsulated. Ott names burying fast traces between planes as one of his goals;
Microchip AN2587 recommends the same for clocks. Every layer change is another opportunity for K-07
or K-08; LearnEMC advises minimising the number of vias in fast nets.

**Symptom in the lab.** Higher harmonics, especially above 300 MHz.

**Detection from layout data.** Share of the length of fast nets that lies on outer layers, number
of vias per fast net. *Data:* tracks per layer, vias, net classes. *False positive:* short
connecting stubs at component pads. *False negative:* none.

**Engine today.** Partly: the shielding by two planes is contained in the image-current model, and
layer changes without a return path are reported; a summarising rule is missing.

**Test board.** Base TB-6L.
*Bad:* CLK on F.Cu, with four layer changes F.Cu ↔ B.Cu along the path.
*Good:* CLK on In2 (between In1 GND and In3 GND), with only one via at each end, each with a ground
via next to it.
*Expected:* good clearly quieter in the far field; bad with `ref-change` or `no-stitching` at the
vias.

**Fix.** Clocks and fast buses on the inside between ground planes, few layer changes, each with a
return path.
**Don't:** route a clock across the board on the outer layer "for the sake of measurability".

**Sources.** [Ott, PCB Stack-Up](https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html),
[Microchip AN2587](https://ww1.microchip.com/downloads/en/Appnotes/00002587A.pdf),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines).

#### K-14 · Asymmetric differential pair
*EN: Asymmetric differential pair (skew, unequal vias, uncoupled sections)* · Confidence
**established** (mechanism) · Frequency of occurrence medium · Engine today **partly**

**Mechanism.** An ideal pair carries equal and opposite currents; every asymmetry converts part of
them into common mode. A timing skew Δt produces a common-mode component of approximately
sin(π·f·Δt) of the differential-mode signal (own derivation): 60 ps at 240 MHz gives about 4.5 %.
One study found 10 to 20 dB more common-mode current when the skew rose from 10 ps to 200 ps.
Further causes: one leg with a via, the other without; ground vias on only one side of the pair's
vias; the pair splitting around an obstacle; unequal termination. TI (Ethernet) requires traces of
equal length and symmetrically placed termination components.

**Symptom in the lab.** The bit rate or clock of the bus (USB 480 MHz, Ethernet 125 MHz) on the
attached cable; a ferrite on the cable helps markedly, which confirms common mode.

**Detection from layout data.** Recognise the pair by its net names; length difference (in ps, via
εeff), uncoupled sections (spacing of the legs > 2 to 3 track widths), vias and ground vias per
leg, position of the compensation (near the cause or at the other end). *Data:* tracks of both
nets, vias, stack-up. *False positive:* length matching with meanders directly at the cause (then
correctly compensated). *False negative:* asymmetry in the connector or component.

**Engine today.** Partly: pairs exist as a source type, and a geometric separation of the legs
enlarges the differential-mode field and thereby becomes visible. Timing skew and common-mode
conversion are missing (quasi-static, opposite currents).

**Test board.** Base TB-4L, USB-C J1 at (3, 30), U2 as a USB device at (60, 30), pair `USB_D+`
and `USB_D-` coupled (0.2 mm width, 0.15 mm spacing) on F.Cu.
*Bad A:* `USB_D+` with a 10 mm detour (about 60 ps). *Bad B:* the pair splits around a
mounting hole at (30, 30) for 15 mm. *Bad C:* only `USB_D-` changes to B.Cu through a via and
back.
*Good:* symmetric, length difference < 0.15 mm, no vias.
*Expected today:* B visible in the differential-mode field, A and C hardly. *Target:* a finding
"skew 60 ps, common-mode component −27 dB at 240 MHz" and evaluation as a cable current if the pair
ends at a connector.

**Fix.** Route pairs tightly coupled and symmetrically, do length matching close to the cause, use
vias only in pairs with symmetrical ground vias, add a common-mode choke at the connector if needed.
**Don't:** believe that differential signals fundamentally do not radiate (M-12); do length matching
at the wrong end.

**Sources.** [Study on common-mode current and skew (ResearchGate)](https://www.researchgate.net/publication/224340709_The_impact_of_common_mode_currents_on_signal_integrity_and_EMI_in_high-speed_differential_data_links),
[TI SNLA107A, Ethernet radiated emissions](https://www.ti.com/lit/an/snla107a/snla107a.pdf),
[LearnEMC, Imbalance difference modeling](https://learnemc.com/introduction-to-imbalance-difference-modeling),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines).

### C Placement, connectors and cables

#### K-15 · High-speed circuit between connectors on different edges
*EN: High-speed circuitry located between connectors on different board edges* · Confidence
**established** · Frequency of occurrence high · Engine today **no** · **Top 12**

**Mechanism.** Hubing describes two basic mechanisms by which a board drives cables. In the
current-driven mechanism, the return current of every fast trace produces a
small voltage drop along the ground plane (section 2). If the circuit lies between two
connectors with cables attached, this voltage appears between the cables, and the cables form a
dipole antenna. A few millivolts are enough. Because this can hardly be fixed cheaply afterwards
(new layout, enclosure with shield bonding), the rule "all connectors on one edge or corner" is one
of the most important placement rules. LearnEMC adds: I/O devices within 2 cm of their connector,
other components at least 2 cm away from I/O nets.

**Symptom in the lab.** Clock harmonics on **all** cables, with a level that depends strongly on
cable position and length; ferrites on both cables help; the board without cables is unremarkable.

**Detection from layout data.** Find the cable connectors (reference `J*`, `Connector_*` footprint,
shield or mounting pads). For every pair of connectors, check whether fast nets (or
switching-regulator loops) lie between them; better: estimate the voltage across the plane between
the connector locations using the Clemson method (partial inductance × ω × return current, summed
over all fast nets) and from it E ≈ 0.365 · V. *Data:* footprints with library and position, nets,
planes, stack-up, sources. *False positive:* connectors without a cable in use (programming
connectors, assembly options; the user must be able to mark these); a metal enclosure with shield
bonding of both connectors. *False negative:* cables connected via solder pads or screw terminals
without a `J` reference.

**Engine today.** No. The differential-mode field is the same in both variants; the engine sees no
difference (a classic false negative).

**Test board.** Base TB-4L with CLK path (optionally also a second clock `SPI_SCK` 10 MHz in
parallel at y = 40).
*Bad:* J1 (`PinHeader_1x04`, supply and data) at (3, 30), J2 (USB-C) at (77, 30), clock in
the middle.
*Good:* J1 at (3, 20) and J2 at (3, 42) on the same edge, CLK path moved to the right
(x = 25 to 75), same length.
*Expected today:* the same far field (documented gap). *Target:* bad with a
common-mode estimate in the region of the limit (section 2: about 41 dBµV/m at 75 MHz), good
clearly below.

**Fix.** All cable connectors on one edge or corner; fast circuitry away from the line between
the connectors; with a metal enclosure, bond both connectors to the enclosure with low impedance.
**Don't:** distribute connectors on all sides for "ergonomics" and hope that ferrites will put it
right afterwards.

**Sources.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[LearnEMC, PCB layout](https://learnemc.com/pcb-layout),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Clemson, Current-driven CM algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Current-driven_CM_algorithm_summary.pdf),
[LearnEMC, Power circuit layout](https://learnemc.com/power-circuit-layout).

#### K-16 · RF traces coupling into I/O lines
*EN: High-frequency traces coupling into I/O nets (or routed under I/O components)* · Confidence
**consensus** · Frequency of occurrence medium to high · Engine today **no** · **Top 12**

**Mechanism.** A slow I/O line (push button, LED, UART, CAN) carries the harmonics of a neighbouring
clock out of the board through capacitive and inductive crosstalk. Hubing singles out this path
because it is so common; LearnEMC advises not routing unrelated traces between the connector and the
I/O device, and not routing fast signals under I/O components. Wyatt shows a case in which data
lines under an oscillator carried 100 MHz through a connector onto a second board.

**Symptom in the lab.** Clock harmonics on a cable that functionally carries "nothing fast".

**Detection from layout data.** I/O nets are nets with a pad on a cable connector. For every
segment of an I/O net, search for parallel segments of fast nets on the same layer or on a layer
not separated from it by a plane; calculate the mutual capacitance and inductance per unit length
(Clemson I/O coupling: segments ≤ 2 cm, ignore the coupling if a plane lies in between). Noise
voltage Vn → E ≈ 40 · Vn / Z_ant with Z_ant = min(800 Ω, 80·(N+1) Ω), N = number of ground pins in
the connector; 800 Ω for a shielded connector. *Data:* nets on connectors, tracks,
stack-up, connector pins with their nets. *False positive:* an I/O net with a filter directly at the
connector (then coupling behind the filter is uncritical, but not in front of it). *False negative:*
coupling via components (crystals close to connectors, K-17).

**Engine today.** No (crosstalk not modelled).

**Test board.** Base TB-4L with CLK path; J2 (`PinHeader_1x04`) at (77, 40), net `IO_BTN` from
J2 pin 1 to U2 (slow signal, not a source).
*Bad:* `IO_BTN` (0.2 mm) runs 20 mm parallel to the clock trace on F.Cu (x = 45 to 65,
y = 30.65; centre-to-centre spacing 0.65 mm, edge to edge about 0.4 mm), then on to J2.
*Good:* `IO_BTN` at a distance of ≥ 5 mm from the clock trace and with an RC filter (100 Ω, 1 nF)
directly at J2.
*Expected today:* no difference. *Target:* a finding "coupling CLK_25M → IO_BTN" with an estimated
field above the limit for the bad variant.

**Fix.** Keep the I/O zones at the connector free of fast traces, keep I/O nets short, filter at
the connector, run fast traces with ground in between (a plane or a stitched ground track).
**Don't:** route I/O lines across the board through the digital zone "because they are slow".

**Sources.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Clemson, I/O coupling algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/IO_coupling_algorithm_summary.pdf),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf).

#### K-17 · Crystal or oscillator at the edge or a connector, traces underneath
*EN: Crystal/oscillator near the board edge or connectors, traces routed under it* · Confidence
**consensus** · Frequency of occurrence medium · Engine today **partly**

**Mechanism.** The oscillator is a strong narrowband source; near the edge or a connector it couples
directly into cables and the board edge (K-11, K-16). Traces running underneath it pick up its
harmonics. Infineon requires crystals, oscillators and clock generators to be kept away from
I/O ports and board edges; LearnEMC requires clock devices directly next to the oscillator; ST
requires short paths to the microcontroller and a guard ring.

**Symptom in the lab.** The fundamental frequency and harmonics of the crystal or oscillator (e.g. 8,
16, 25 MHz and multiples) on cables.

**Detection from layout data.** Find footprints from `Crystal:*` or `Oscillator:*` (or values with
Hz); distance to the board edge and to cable connectors; unrelated traces within the projection of
the package on all layers without a plane in between; trace length between crystal and IC.
*Data:* footprint library, value, position, tracks. *False positive:* 32 kHz watch crystals (separate
threshold). *False negative:* an oscillator entered as a generic part without a recognisable name.

**Engine today.** Partly: clock and crystal nets are suggested as sources and their field is
calculated; proximity to the edge and to connectors, as well as coupling into unrelated traces, are
missing.

**Test board.** Base TB-4L, U2 as MCU at (40, 30), Y1 (16 MHz) with load capacitors.
*Bad:* Y1 at (3, 4) in the corner, 2 mm next to J1 (USB-C at (3, 12)), nets `XTAL_IN`/`XTAL_OUT`
40 mm long; additionally, net `IO_LED` on B.Cu passing underneath Y1.
*Good:* Y1 at (34, 30) directly at U2, traces ≤ 5 mm, no unrelated traces under Y1.
*Expected today:* a far-field difference due to the trace length. *Target:* findings "crystal 1 mm
from the edge, 2 mm from J1" and "IO_LED under Y1".

**Fix.** Crystal directly at the IC, away from the edge and connectors, an undisturbed ground plane
beneath it, no unrelated traces beneath it.
**Don't:** put the crystal in the corner "because there is room there". For the disputed local
ground island under the crystal, see M-16.

**Sources.** [Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[ST AN2867](https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf).

#### K-18 · I/O filter far from the connector or with a long ground connection
*EN: I/O or power-entry filter far from the connector, or with a long ground connection* ·
Confidence **consensus** · Frequency of occurrence high · Engine today **no** · **Top 12**

**Mechanism.** A filter only acts on what lies behind it. If it sits at the IC instead of at the
connector, the line between connector and filter is unprotected and picks up interference on its
way across the board (K-16). The shunt capacitor is only as good as its connection inductance;
a long track to the ground via makes it ineffective at 100 MHz (Wyatt: 2.5 cm of wire or track
has about 12 Ω at 100 MHz). Test labs list unfiltered cable interfaces and filters placed too far
from the entry point among the typical layout causes (C&E).

**Symptom in the lab.** As K-16; a filter is present, but has no effect above a few tens of MHz.

**Detection from layout data.** Follow the I/O net from the connector pad to the first series
element (R, L, ferrite) and to the first shunt capacitor to ground; trace length connector → filter
(threshold about 10 mm), connection length capacitor → ground via (threshold a few mm), and whether
the unfiltered section runs past fast traces. *Data:* netlist, component values
(Value field), footprint class, tracks, vias. *False positive:* interfaces that need no filter
(e.g. coaxial lines that are already shielded). *False negative:* filter integrated in the connector.

**Engine today.** No.

**Test board.** Base TB-4L with CLK path; J1 (`PinHeader_1x04`) at (3, 45), net `IO_LINE` from J1
to U2.
*Bad:* filter R6 (100 Ω, 0603) + C6 (1 nF, 0402) at (62, 45) next to U2; the section J1 → R6
runs about 58 mm parallel to the clock trace; C6 ground through a 10 mm track to a via.
*Good:* R6 and C6 within 4 mm of J1, C6 with a ground via directly at the pad, the filtered line
then runs on to U2.
*Expected today:* no difference. *Target:* findings "filter 58 mm from the connector" and
"filter capacitor with a 10 mm ground connection".

**Fix.** Filter directly at the connector, capacitor with its own via (better two) to the plane;
with a metal enclosure, reference to the chassis at the connector.
**Don't:** place the filter "neatly" next to the IC; connect the filter capacitor to ground through
a long track.

**Sources.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[LearnEMC, Introduction to common-mode filtering](https://learnemc.com/cm-filtering),
[EEVblog, Fixing a product failing CE radiated emissions](https://www.eevblog.com/forum/projects/fixing-a-product-that-is-failing-ce-radiated-emissions/),
[C&E, Common EMC failures](https://www.celectronics.com/Resources/Common-EMC-Failures).

#### K-19 · Filter bypassed by layer overlap or parallel routing
*EN: Filter bypassed by overlapping input/output copper or parallel routing* · Confidence
**consensus** · Frequency of occurrence high · Engine today **no** · **Top 12**

**Mechanism.** Hubing describes as the second most common mistake from his layout reviews (he puts
it at about 90 % of the boards reviewed) that the unfiltered input net (e.g. `VBAT`) and the filtered
output net (e.g. `VDD`) lie on top of each other on different layers. The overlap forms 50 to
200 pF in parallel with the filter, which short-circuit the filter at high frequencies and form a
parallel resonance with the filter inductance. Own example calculation: 400 mm² of overlap over
0.21 mm of prepreg gives about 74 pF, roughly 21 Ω at 100 MHz, compared with a ferrite of 600 Ω: the
filter is practically bypassed. The same happens magnetically and capacitively when the input and
output lines run next to each other.

**Symptom in the lab.** Filter fitted, but its effect is missing above 30 to 50 MHz; the interference
level on the supply cable is the same as without a filter.

**Detection from layout data.** Find filter components (a series element between two nets, with
shunt capacitors); for the copper areas (zones, wide tracks, pads) of both nets, calculate the
overlap per layer pair, convert it into capacitance using the stack-up and compare it with the
impedance of the series element at 30 to 300 MHz. In addition, sections of both nets running in
parallel on the same layer. *Data:* zones and tracks per net and layer, stack-up (thickness, εr),
component values. *False positive:* overlap with a ground plane in between (it shields).
*False negative:* coupling via component bodies (large chokes).

**Engine today.** Yes for the overlap (`filter-bypass`, test board `filter-bypass`):
ferrites and inductors with a readable value, overlap per layer pair without plane copper in
between, parallel-plate capacitor without fringing field. Parallel routing on the same layer: no.

**Test board.** Base TB-4L without a clock source; J1 (2-pin, `+12V_IN` and GND) at (3, 30); FB1
(`L_0805_2012Metric`, value `600R@100MHz`) at (12, 30) with C7 (100 nF) before it and C8 (1 µF) after it.
*Bad:* `+12V_IN` area of 20 × 20 mm on F.Cu at x = 5 to 25, y = 20 to 40; `+12V_F`
(filtered) as an area of the same size on In2.Cu directly underneath (In1 left free at this
location), overlap 400 mm²; in addition, the output track runs 15 mm parallel to the input track at
a spacing of 0.3 mm.
*Good:* input area only up to FB1, output on the other side of the filter, In1 GND everywhere
in between, no parallel routing.
*Source for the evaluation:* an interference source on `+12V_F` (e.g. BUCK block, K-29) or a
substitute broadband 1 V source.
*Expected today:* no finding. *Target:* "overlap `+12V_IN`/`+12V_F` 400 mm², ≈ 74 pF, filter
bypassed above ≈ 30 MHz".

**Fix.** Keep the input and output of a filter spatially separated, no overlap on any layer, a
ground plane in between, the filter at the board edge with its input towards the connector.
**Don't:** flood supply nets widely on all layers for current-carrying reasons without paying
attention to the filter boundary.

**Sources.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[ADI, Ferrite Beads Demystified](https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html).

#### K-20 · Poorly terminated connector shield
*EN: Poor connector shield termination (pigtail, thin trace, floating shell)* · Confidence
**established** (pigtail), **disputed** (ferrite or RC in the shield path) · Frequency of occurrence high · Engine
today **no** · **Top 12**

**Mechanism.** A cable shield only helps if the common-mode current can flow back to the source on the
inside of the shield. A pigtail or a thin trace from the connector shell to ground is an inductance
across which exactly the voltage drops that drives the outside of the shield. Wyatt counts poorly
terminated cable shields and pigtails among the five most common reasons for failures;
a 2.5 cm pigtail has about 12 Ω at 100 MHz; two out of eight tested HDMI cables radiated up to 25 dB
more because of poor shield termination. On the board this means: shield and shell pads of the
receptacle connected short and wide to ground or chassis.
It is disputed whether a ferrite or an RC network should be placed in the shield path: TI recommends in
its USB 2.0 guidelines a ferrite between shield and ground, other sources a combination
of 1 MΩ in parallel with 4.7 nF; Hubing and Wyatt, by contrast, stress a low-impedance RF connection
of the shield to the enclosure.

**Symptom in the lab.** Emission despite a shielded cable; a copper tape between the connector shell
and ground or the enclosure lowers the level considerably.

**Detection from layout data.** Find the shield pads of the receptacle (pad names `S*`, `SH*`,
`SHIELD`, `MP`, `0`, or mechanical pads with a net); determine net and connection path: no net
(floating), trace with length and width up to the plane (inductance and impedance at 100 MHz), series
components (ferrite, R, C). Finding at more than a few Ω at 100 MHz. *Data:* pad names, nets, tracks,
vias, components. *False positive:* devices without shielded cables. *False negative:* shield
connection via enclosure springs that are not part of the board.

**Engine today.** No.

**Test board.** Base TB-4L; J1 = `USB_C_Receptacle_GCT_USB4085` at (4, 30).
*Bad A:* shield pads without a net. *Bad B:* shield pads via a 0.2 mm × 15 mm trace to a
GND via. *Bad C:* shield via ferrite `600R@100MHz` and 1 MΩ ∥ 4.7 nF to GND (for the
disputed variant only a note, not an error).
*Good:* shield pads on GND, two to four vias per pad directly into the plane.
*Expected today:* no difference. *Target:* A and B as a finding with the impedance stated, C as a note.

**Fix.** Shield and shell of the receptacle bonded all round with low impedance to the plane or to the
chassis; with metal enclosures, 360° bonding at the enclosure.
**Don't:** leave shield pads unconnected or route them "to be on the safe side" over a thin trace.

**Sources.** [Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[TI, USB 2.0 Board Design and Layout Guidelines](https://e2echina.ti.com/cfs-file/__key/telligent-evolution-components-attachments/13-106-00-00-00-00-33-10/USB-2.0-Board-Design-and-Layout-Guidelines.pdf),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines).

#### K-21 · No low-impedance chassis bond in the connector area
*EN: Missing low-impedance chassis bond near the connectors* · Confidence **consensus**, depending
on the enclosure · Frequency of occurrence medium · Engine today **no**

**Mechanism.** In a metal enclosure, the ground plane of the board should be bonded to the enclosure
directly next to the connectors, ideally on both sides. Then there is no RF voltage at that point
between cable shield, enclosure and board ground. If the bonds are far away (or the mounting holes are
insulated), the board drives the cables against the enclosure. LearnEMC recommends bonding points on
both sides of every connector, and separate points for connectors on several edges; Hubing considers
the rule "connect I/O ground to digital ground through a single point" one of the worst pieces of
advice.

**Symptom in the lab.** Common mode on cables despite a metal enclosure; fixed in the lab with copper
tape between board ground and enclosure at the connector.

**Detection from layout data.** Mounting holes (`MountingHole:*`) and their nets; distance of each
cable connector to the nearest ground-connected mounting hole; finding if there is none within about
10 to 20 mm, or only one on one side. Only meaningful if the user specifies "metal enclosure".
*Data:* footprints, nets, positions, user input about the enclosure. *False positive:*
plastic enclosure. *False negative:* enclosure contact via springs or shielding sheets.

**Engine today.** No (no enclosure model).

**Test board.** Base TB-4L, J1 and J2 on the left edge at (3, 20) and (3, 40), four
mounting holes.
*Bad:* MH1 to MH4 in the corners, without a net.
*Good:* additional MH5 and MH6 at (6, 12) and (6, 48), plus MH7 at (6, 30) between the connectors,
all on GND with a via ring.
*Expected today:* no difference. *Target:* with the user input "metal enclosure", a finding for bad.

**Fix.** Ground points to the enclosure on both sides of the connectors, short and wide connections.
**Don't:** cut off the I/O ground as an island and connect it through a single point (see K-02,
LearnEMC question of the week on the "quiet I/O ground").

**Sources.** [LearnEMC, Grounding](https://learnemc.com/grounding),
[LearnEMC, Question of the week 2022-11-28](https://learnemc.com/qotw-221128),
[LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines).

#### K-22 · Too few ground pins in connectors and ribbon cables
*EN: Too few ground pins in board-to-board connectors and ribbon/FPC cables* · Confidence
**consensus** · Frequency of occurrence medium · Engine today **no**

**Mechanism.** In a ribbon cable, the return conductor is only as good as the ground pins. If 20 signals
share a single ground pin at the edge, the return current of the distant signals flows through large
loops and partly over foreign paths (enclosure, other cables). Wyatt recommends approaching a
signal-to-ground ratio of 1:1; Academy of EMC recommends conductor sequences such as ground,
signal, ground, signal. In the Clemson I/O assessment, the number of ground pins enters directly into the
antenna impedance (Z_ant = 80·(N+1) Ω, capped at 800 Ω). Displays with a wide parallel bus
and only one or two ground pins in the ribbon cable are a typical case.

**Symptom in the lab.** Pixel clock or bus frequency of the display and harmonics, often with emission
from the ribbon cable and the display frame (Wyatt: an additional ground contact on the display housing
gained 8 dB).

**Detection from layout data.** For connectors with fast nets: number of ground pins, ratio
to fast signal pins, distance of each fast pin to the nearest ground pin (in pin positions).
*Data:* pads with net and position, net classes. *False positive:* shielded cables with their own
return conductor. *False negative:* pin assignment on the mating side unknown.

**Engine today.** No (cables not modelled).

**Test board.** Base TB-4L, J3 = `PinHeader_2x10_P2.54mm_Vertical` at (60, 50), eight
data lines `LCD_D0` to `LCD_D7` and `LCD_CLK` (30 MHz, 2 ns) from U2 to J3.
*Bad:* only pin 20 on GND.
*Good:* every second pin GND (10 ground pins), `LCD_CLK` between two ground pins.
*Expected today:* no difference. *Target:* finding "J3: 9 fast signals, 1 ground pin,
LCD_CLK 9 pins from the nearest ground pin".

**Fix.** Distribute ground pins, clock next to ground, if needed a shielded cable with the shield
bonded at both ends.
**Don't:** skimp on ground pins in order to use a smaller connector.

**Sources.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines),
[Clemson, I/O coupling algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/IO_coupling_algorithm_summary.pdf).

#### K-23 · Ethernet: planes and chassis at the transformer
*EN: Ethernet magnetics/RJ45 plane and chassis handling* · Confidence **disputed** · Frequency of occurrence
low · Engine today **no**

**Mechanism.** With Ethernet, emission arises almost exclusively from common mode on the
twisted-pair cable: from asymmetry within the pair, from coupling from the PHY and its supply through the
transformer, and via the enclosure. TI recommends MDI traces of equal length, symmetrical
termination components, a common-mode choke together with the transformer, and a shielded jack on
its own chassis plane, which is connected to system ground through two 1206 0 Ω parts placed
symmetrically on both sides of the jack (later exchangeable for capacitors or ferrites). Many
manufacturer notes require the planes under the transformer and between transformer and jack to be
cut out.
Other authors (Peterson) show that continuous planes can also work, and see
a trade-off between loop inductance, coupling and ESD isolation. The isolation clearance
(1500 V) is a safety requirement, independent of EMC.

**Symptom in the lab.** 125 MHz (100BASE-TX) and harmonics, the 25 MHz clock of the PHY on the network cable.

**Detection from layout data.** Find the RJ45 footprint and the transformer; check: PHY clock and fast
traces not close to the jack, MDI pairs symmetrical (K-14), no traces of other nets between
transformer and jack, isolation clearance maintained. Output the question "plane under the transformer
or not" only as a note. *Data:* footprints, zones, nets. *False positive:* jacks with an
integrated transformer. *False negative:* none.

**Engine today.** No.

**Test board.** Base TB-4L, J1 = `Connector_RJ:RJ45_Amphenol_RJHSE5380` at the left edge, transformer as a
placeholder (`Package_SO:SOIC-16W_7.5x10.3mm_P1.27mm`, value `H1102`), PHY as a SOIC-8 placeholder
with a 25 MHz oscillator.
*Bad:* PHY and oscillator 8 mm from the jack, MDI pairs with 5 mm length difference, GND and
+3V3 planes continuous under jack and transformer, shield pads of the jack without a net.
*Good:* PHY ≥ 25 mm from the jack, pairs symmetrical, chassis island under the jack with the shield pads,
two 1206 bridges symmetrical to system ground, planes under the transformer cut out.
*Expected:* today only differences due to the pair geometry; *Target:* findings on the PHY–jack distance,
pair symmetry and shield pads; the plane question as a note.

**Fix.** Follow the PHY manufacturer's guideline, pair symmetry, PHY clock far from the jack,
shield termination.
**Don't:** treat one of the plane variants as the only correct one.

**Sources.** [TI SNLA107A, Ethernet radiated emissions](https://www.ti.com/lit/an/snla107a/snla107a.pdf),
[Microchip AN111](https://ww1.microchip.com/downloads/en/AppNotes/AN%20111.10-100.General%20PCB%20Design%20and%20Layout%20Guidelines.pdf),
[Peterson, Ethernet connectors and ground planes](https://www.signalintegrityjournal.com/articles/1808-ethernet-connectors-and-routing-above-ground-planes).

### D Power supply, decoupling, filter components

#### K-24 · Decoupling missing or connected with high inductance
*EN: Missing local decoupling or decoupling capacitor with high mounting inductance* ·
Confidence **established** · Frequency of occurrence high · Engine today **partly** · **Top 12**

**Mechanism.** Switching ICs draw short current spikes from the supply. If there is no nearby,
low-inductance capacitor, these spikes flow through large loops in the supply, and the
noise on the supply plane drives cables and plane resonances. What matters is not the
capacitance value but the connection inductance made up of the capacitor package, pads, traces and vias
(LearnEMC). Clemson calculates traces to the capacitor with about 0.2 nH/mm × (2 + ln(h/w)) plus 1 nH
for the package and vias; 2 × 15 mm of trace thus give around 13 nH, which makes a 100 nF capacitor
inductive from about 4 MHz (own calculation). Wyatt puts poor power distribution networks (PDN) fourth
among his five most common reasons for failures; Hubing names unsuitable decoupling among his six most
common mistakes.
Infineon shows that a connection through vias has a lower impedance above 400 MHz than one through
traces.

**Symptom in the lab.** Broad combs of all clock harmonics, often peaks at plane resonances,
interference on the supply cable.

**Detection from layout data.** For each supply pin of an IC (pin function or net name `VCC`,
`VDD`, `3V3` …): nearest capacitor between this net and ground; path length pin → capacitor →
ground pin or plane; trace length between capacitor pad and via; via shared with the IC (LearnEMC:
do not share). Clemson does not count values above about 200 nF for high frequencies. *Data:*
pin functions, nets, component values, tracks, vias, stack-up. *False positive:* ICs with internal
decoupling capacitors; analogue devices with slow currents. *False negative:* capacitor close, but on the
other side of the board with only one via.

**Engine today.** Partly. Capacitors serve as hand-over points for the return current at
`ref-change`. Connection inductance, missing decoupling and the supply noise itself are
not assessed; a supply loop IC → capacitor → IC would only be possible as a user-defined
loop.

**Test board.** Base TB-4L with CLK path.
*Bad A:* C2 (100 nF) 15 mm from U2, connected via 0.2 mm traces, GND via only 8 mm further on.
*Bad B:* no capacitor at U2 within a radius of 20 mm.
*Good:* C2 (0402) ≤ 2 mm from the VCC pin, vias directly at the pads (≤ 0.5 mm), its own vias, not shared
with the IC.
*Expected today:* no finding. *Target:* "U2 VCC: decoupling capacitor with ≈ 13 nH connection" (A) or
"U2 VCC without local decoupling capacitor" (B); optionally an automatically generated supply loop as a source.

**Fix.** One small capacitor per supply pin, vias directly at the pad, with closely coupled
planes several identical capacitors instead of one large one; bulk capacitor at the supply input.
**Don't:** place the capacitor close and then connect it via traces; share vias with the IC. On the
question of "as close as possible", see M-06.

**Sources.** [LearnEMC, Decoupling with closely spaced planes](https://learnemc.com/decoupling-for-boards-with-closely-spaces-power-planes),
[LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes),
[Clemson, Power bus decoupling algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Power_bus_decoupling_algorithm_summary.pdf),
[Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

#### K-25 · Widely different MLCCs in parallel
*EN: Widely different ceramic capacitor values in parallel (anti-resonance)* · Confidence
**disputed** · Frequency of occurrence medium · Engine today **no**

**Mechanism.** Between the series resonance of the large capacitor (inductive above it) and that of the
small one (still capacitive) lies a parallel resonance. With low-loss ceramic capacitors it has
a high Q factor; the supply impedance gets a peak there, which radiates when suitably excited.
Hubing describes several products that failed because of this (example: 10 µF in parallel with 10 nF),
and advises keeping values on the same net within one decade; LearnEMC adds that two identical
capacitors are better than one with twice the value (lower connection inductance). Many
manufacturer datasheets, on the other hand, still recommend 10 µF plus 100 nF. Whether the resonance
causes interference depends on damping (ESR), plane capacitance and excitation; that is the reason for
classifying it as disputed.

**Symptom in the lab.** Narrow peak in the range of a few tens to a hundred MHz, sometimes above 1 GHz
(LearnEMC question of the week).

**Detection from layout data.** Group capacitors per net pair (supply, ground) within a radius;
read values from the Value field (`10u`, `100n`, `4u7`); a ratio > 10 reports a
note; estimate resonance frequencies from the value, the estimated ESL per package size and the
connection inductance. *Data:* Value fields, footprint size, nets. *False positive:* tantalum or
electrolytic capacitors (high ESR, they damp). *False negative:* missing or inconsistent
Value fields.

**Engine today.** No (values are not evaluated for decoupling).

**Test board.** Base TB-4L with CLK path.
*Bad:* at U2, C2 = 10 µF (0805) and C9 = 10 nF (0402) in parallel.
*Good:* twice 1 µF (0402), or 1 µF and 100 nF.
*Expected today:* no difference. *Target:* note "value ratio 1000:1, anti-resonance at about
… MHz", explicitly marked as a note.

**Fix.** Identical or similar values, lossy bulk capacitors, sufficient
plane capacitance.
**Don't:** cookbook value staggering (see M-05).

**Sources.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[LearnEMC, Question of the week 2023-12-04](https://learnemc.com/qotw-231204),
[LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes).

#### K-26 · Ferrite bead used incorrectly
*EN: Misused ferrite bead (in the ground path, LC resonance, DC saturation)* · Confidence
**established** · Frequency of occurrence medium · Engine today **no**

**Mechanism.** Three typical mistakes: (a) ferrite between two ground planes or in the return path; at
high frequency this creates a voltage between the grounds, i.e. exactly the drive for common mode
(Hubing: ground is not a return-current path; LearnEMC: do not connect a "quiet ground" through a ferrite).
(b) A ferrite with a low-loss capacitor forms a resonant circuit; ADI shows resonance peaks of about 10 to
15 dB, and the filter then amplifies in the region of the resonance. (c) DC current lowers the impedance
sharply; according to ADI, at half the rated current it drops at 100 MHz e.g. from 100 Ω to 10 Ω.

**Symptom in the lab.** Filter without effect, or with amplified interference in the range of a few MHz;
common mode on cables with a ferrite in the ground.

**Detection from layout data.** (a) Ferrite or inductor whose two nets both carry ground-like names
(`GND`, `AGND`, `SHIELD` …); (b) ferrite with capacitors on both sides: estimate the resonance from
datasheet values (or typical values); (c) rated current from a component field against the
load current specified by the user. *Data:* reference designator prefix `FB`/`L`, Value and additional
fields, nets.
*False positive:* ferrite in the shield path (disputed, K-20). *False negative:* ferrites with a
misleading reference designator.

**Engine today.** No.

**Test board.** Base TB-4L.
*Bad A:* J2 (USB-C) with its own GND island, which is connected to the main ground only via FB2
(`L_0805_2012Metric`, value `600R@100MHz`). *Bad B:* FB1 with C8 = 10 µF ceramic directly
behind it, without damping. *Bad C:* FB1 with field `Irated=0.5A` in the 2 A branch of the BUCK block.
*Good:* A without the island and without FB2; B with a damping resistor or a lossy bulk capacitor;
C with an adequately rated ferrite.
*Expected today:* only A partly visible via the return-current side. *Target:* three separate findings.

**Fix.** Ferrites only in supply or signal paths, never in the ground path; damp the resonance;
rated current with margin.
**Don't:** "a ferrite always helps" (M-09).

**Sources.** [ADI, Ferrite Beads Demystified](https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html),
[LearnEMC, Question of the week 2022-11-28](https://learnemc.com/qotw-221128),
[LearnEMC, Grounding](https://learnemc.com/grounding).

#### K-27 · Common-mode choke on an unbalanced DC supply
*EN: Common-mode choke on an unbalanced DC power input* · Confidence **disputed** · Frequency of occurrence
medium · Engine today **no**

**Mechanism.** A common-mode choke works in balanced systems in which both conductors
have the same impedance to ground (mains input with Y capacitors, twisted pair). At a
DC input whose minus is directly the ground plane, according to Hubing it merely converts common mode
into differential mode without any benefit; he advises making the input deliberately unbalanced and
filtering the side with the higher impedance to ground (series element in the plus line, shunt
capacitor). In industrial practice, chokes at DC inputs are nevertheless common, often together with
capacitors to the chassis. Hence only as a note.

**Symptom in the lab.** Choke fitted, no improvement on the supply cable.

**Detection from layout data.** Component with a common-mode choke footprint (`L_CommonMode*`,
`L_CommonModeChoke*`) at a supply connector; check whether one side is the main ground and whether
capacitors to the chassis exist. *Data:* footprint, nets, connectors. *False positive:*
balanced inputs (mains, PoE, CAN). *False negative:* choke as a generic component.

**Engine today.** No.

**Test board.** Base TB-4L; J1 (2-pin, `+12V_IN`, GND) at (3, 30), L2 =
`L_CommonModeChoke_Wuerth_WE-SL5` at (12, 30), followed by the BUCK block.
*Bad:* both conductors through L2, minus after L2 onto the main ground.
*Good:* L2 omitted; instead FB1 in the plus line and capacitors 1 µF and 100 nF to ground directly at the
connector.
*Expected:* no difference today. *Target:* note "common-mode choke on an unbalanced
input", no dB statement.

**Fix.** Choose the filter topology according to the symmetry of the system.
**Don't:** regard the common-mode choke as a universal remedy (M-10).

**Sources.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[LearnEMC, Introduction to common-mode filtering](https://learnemc.com/cm-filtering),
[Hubing, Four commonly held myths](https://resources.altium.com/p/four-commonly-held-myths-emc-design).

#### K-28 · Supply loop on two-layer boards
*EN: Power and ground routed far apart on two-layer boards (large supply loop)* · Confidence
**consensus** · Frequency of occurrence medium · Engine today **partly**

**Mechanism.** On boards without planes, the plus and ground lines supplying an IC form
a loop through which all current spikes flow that the local capacitor does not catch. If
plus and ground run along different paths (plus along the top edge, ground along the bottom), this loop is
as large as the board. For two-layer boards, LearnEMC recommends a local capacitor per device and
a bulk capacitor where the voltage enters the board; the ground grid (K-09) reduces the
loops.

**Symptom in the lab.** Broadband clock and switching harmonics already below 100 MHz.

**Detection from layout data.** For each supply net, determine the path from the feed point (connector,
regulator) to the loads and the return path of the ground; calculate the enclosed area.
*Data:* netlist, tracks, connectors and regulator pins. *False positive:* loads with a good local
decoupling capacitor (then the long loop only carries DC). *False negative:* ground plane that is
only connected on paper.

**Engine today.** Partly. As a user-defined loop (pads in order), the
area is calculated correctly; automatic detection is missing.

**Test board.** Base TB-2L, J1 (`+5V`, GND) at (3, 30), U2 at (68, 30) without a local capacitor.
*Bad:* `+5V` as a trace along the top edge (y = 5), GND as a trace along the bottom edge (y = 55).
*Good A:* `+5V` and GND as traces directly on top of each other (F.Cu and B.Cu), loop about
65 × 1.6 ≈ 100 mm². *Good B:* additionally C2 (100 nF) at U2; the AC component then closes
locally (about 10 mm²).
*Source:* loop J1.1 → U2.VCC → U2.GND → J1.2 with 50 mA current spikes, 2 ns (for Good B the
loop U2.VCC → C2 → U2.GND).
*Expected:* loop area about 3000 mm² versus about 100 mm² (around 30 dB in differential mode) or
10 mm² (around 50 dB), own calculation; *Target:* automatic detection.

**Fix.** Route plus and ground together, local decoupling, ground plane.
**Don't:** lay out the supply "star-shaped" with separate paths for plus and ground.

**Sources.** [LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[All About Circuits, Gridded ground](https://www.allaboutcircuits.com/technical-articles/multipoint-grounding-gridded-ground-for-double-sided-pcbs/).

### E Switching regulators and isolated converters

#### K-29 · Large hot loop in the switching regulator
*EN: Large hot loop (input capacitor far from the switches)* · Confidence **established** ·
Frequency of occurrence high · Engine today **yes** · **Top 12**

**Mechanism.** In a buck regulator, the current in the loop input capacitor → high-side switch
→ low-side switch → input capacitor jumps between zero and the load current at every edge. This
loop is the strongest magnetic source of the converter, and its parasitic inductance together with
the switch capacitances produces the ringing at the switch node. Richtek names 50 to 300 MHz as the
typical range of emission problems and 200 to 400 MHz as a common ringing frequency. TI (AN-2155)
shows by calculation that even a loop of 12 mm² at 35 MHz and 1 A lies just above
the Class B limit (42.6 dBµV/m at 3 m); with a ground plane underneath, the value drops to
about 38 dBµV/m. In an experiment, well-placed input capacitors reduced switching spikes by 3.6 V and
gained several dB of margin. TI (Hegarty) and ADI (AN-139) regard the area and inductance of this
loop as the most important layout parameter; Hubing counts poor converter layouts among the most common
mistakes, often copied from manufacturer notes.

**Symptom in the lab.** Broadband hump from 30 to 300 MHz, with lines on it spaced at the
switching frequency; conducted above a few MHz.

**Detection from layout data.** Recognise the regulator IC via pin functions (`VIN`, `SW`, `GND`), find the
input capacitor between the VIN and GND nets and form the loop via the pads in order;
calculate the area (including the return path in the plane and through vias). Threshold
about 20 to 30 mm² as a note. *Data:* pin functions, nets, pads, tracks, vias, zones.
*False positive:* regulators with integrated input capacitors. *False negative:* wrong topology
(K-30), pin functions missing in the library.

**Engine today.** Yes. Source suggestion from pin functions, loop via pads, area including the portion
in the plane, far field and share of the far field. Limitation: the input voltage is estimated at 12 V.

**Test board.** Base TB-4L with the BUCK block at x = 20 to 40, y = 10 to 25.
*Bad:* CIN (10 µF, 1206) 15 mm away from U3, connected via 0.5 mm traces, no small
capacitor at the pins.
*Good:* CIN (10 µF) and CIN2 (100 nF, 0402) directly at VIN and GND (≤ 1 mm), GND pad with vias into the
plane.
*Expected:* loop bad about 45 mm² or more, good ≤ 5 mm²; far field of bad ≥ 15 dB higher.

**Fix.** Smallest capacitor closest to VIN and GND, on the same layer as the regulator,
ground plane directly underneath (thin prepreg), symmetrical arrangement for high-current converters.
**Don't:** put the input capacitor on the bottom side and connect it through vias; optimise the output
instead of the input (K-30).

**Sources.** [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[TI SLYT682, Hegarty](https://www.ti.com/lit/pdf/slyt682),
[Richtek AN045, Reducing EMI in buck converters](https://www.richtek.com/Design%20Support/Technical%20Document/AN045),
[ADI AN-139](https://www.analog.com/en/resources/app-notes/an-139.html),
[ADI, Single vs. dual hot loop](https://www.analog.com/en/resources/analog-dialogue/articles/4-switch-buck-boost-controller-layout-for-low-emissions-single-hot-loop-vs-dual-hot-loop.html),
[Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022).

#### K-30 · Wrong loop made compact
*EN: Wrong loop minimised (buck vs. boost topology confused)* · Confidence **consensus** ·
Frequency of occurrence low to medium · Engine today **partly**

**Mechanism.** In a buck converter the hot loop is on the input side, in a boost converter on the
output side (switch → diode or synchronous switch → output capacitor → ground); ADI describes
the boost as a buck operated in reverse. Anyone who takes a buck layout as a template for a boost
(or vice versa) makes the wrong loop compact; the DC loop with the inductor, by contrast, is
not critical.

**Symptom in the lab.** As K-29.

**Detection from layout data.** Derive the topology from the netlist: is the inductor between
input and switch node (boost) or between switch node and output (buck)? Then choose the correct
capacitor for the loop. *Data:* netlist, pin functions, component classes (diode,
inductor). *False positive:* buck-boost converters with two hot loops (check both).
*False negative:* external switches without pin functions.

**Engine today.** Partly. The source suggestion (`suggest.ts`) always forms the loop from the
capacitor between the VIN and GND nets at the regulator, i.e. on the buck assumption. For a boost, the
suggested loop is the wrong one; the correct one can be defined manually.

**Test board.** Base TB-4L, BOOST block: 5 V to 12 V, L1 from `+5V` to `SW`, U3 with internal
switch `SW` → GND, D1 (`Diode_SMD:D_SMA`) from `SW` to `+12V`, COUT (22 µF, 1206) to GND.
*Bad:* CIN directly at the regulator, COUT 15 mm away from D1 and from the GND pin.
*Good:* COUT directly between the D1 cathode and U3 GND, a small 100 nF capacitor in parallel.
*Expected today:* the suggestion takes the input loop, both variants look similar. *Target:*
boost topology recognised, loop via D1 and COUT, bad clearly louder.

**Fix.** Before the layout, mark the loops with jumping current (buck: input; boost:
output; buck-boost: both).
**Don't:** adopt layout templates without checking the topology.

**Sources.** [ADI AN-139](https://www.analog.com/en/resources/app-notes/an-139.html),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf).

#### K-31 · Switch node too large or exposed
*EN: Oversized or exposed switch-node copper* · Confidence **consensus** · Frequency of occurrence medium ·
Engine today **partly**

**Mechanism.** The switch node swings by the full input voltage with a steep slope. Every
copper area on this node is a capacitor plate that couples into neighbouring traces, cables,
the enclosure and heatsinks (voltage-driven mechanism). LearnEMC: keep the area small and
away from all conductors that could carry current out of the converter area. In an experiment, TI found
that a switch node twice as long over a plane increased the far field by less than 1 dB, but the near
field considerably; routing the switch node to the bottom side made things slightly worse, mainly
because it interrupted the return path. Cooling needs some area; a compromise is an island only on
the component side.

**Symptom in the lab.** Broadband as in K-29, especially on cables that run close to the converter.

**Detection from layout data.** Copper area of the SW net per layer, number of layers, distance to the
board edge, cable connectors, I/O nets and the feedback trace; capacitance to neighbouring nets
from overlap and edge distance. *Data:* zones and tracks of the SW net, stack-up, connectors.
*False positive:* a large area that lies entirely over a ground plane and is far away from cables.
*False negative:* switch node on a heatsink (see K-37).

**Engine today.** Partly: the E field of the switch node (stage 2b) shows the near field; the
coupling onto cables and the resulting far field are missing.

**Test board.** Base TB-4L with the BUCK block at x = 5 to 25, y = 40 to 55, J1 (supply input)
at (3, 30).
*Bad:* SW area 15 × 20 mm on F.Cu and mirrored on B.Cu (six vias), up to 2 mm from the
bottom board edge and 3 mm from J1; the FB trace runs 10 mm beside it.
*Good:* SW only on F.Cu, about 40 mm² between U3 SW and L1, ≥ 10 mm from the edge and J1, FB trace on
the other side of the regulator.
*Expected today:* near-field E considerably larger for bad, far field almost the same. *Target:* finding
"SW copper 600 mm² on two layers, 3 mm from J1" with a capacitance estimate.

**Fix.** Compact switch node, one layer, continuous ground underneath, away from edges, connectors
and sensitive traces.
**Don't:** flood the switch node over large areas on several layers for cooling.

**Sources.** [LearnEMC, Power circuit layout](https://learnemc.com/power-circuit-layout),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Clemson, Voltage-driven EMI algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_driven_EMI.pdf).

#### K-32 · Ground plane split under the converter
*EN: Ground plane cut under the converter (separate PGND island)* · Confidence **established** ·
Frequency of occurrence medium · Engine today **yes**

**Mechanism.** Some application notes show a separate "PGND" island that is connected to the rest of
the ground at only one point. This removes the image current under the hot loop, the
loop gets larger, and the island becomes a driven antenna part relative to the rest of the plane.
TI measured: removing the ground under the high-current path loses 6 dB of margin to the limit.
LearnEMC and Hubing explicitly advise against isolated PGND planes.

**Symptom in the lab.** As K-29, plus common mode on cables connected to the island.

**Detection from layout data.** As K-01 and K-02 for the elements of the hot loop; additionally,
ground zones that enclose the converter area and are connected only via a narrow neck or a single
component. *Data:* zones, nets, sources. *False positive:* isolated converters with an
intentional separation (K-36). *False negative:* island only on the distant ground layer.

**Engine today.** Yes for the differential-mode side (image currents missing, `return-gap` at the loop);
common mode of the island is missing.

**Test board.** Base TB-4L with the BUCK block at x = 20 to 40, y = 10 to 25.
*Bad:* In1.Cu with zone `PGND` under the BUCK block (x = 18 to 42, y = 8 to 27), 1 mm clearance all round
to zone `GND`, connected only via a net tie at the U3 GND pad.
*Good:* continuous zone `GND`.
*Expected:* bad gives `return-gap` at the hot loop and a higher far field (TI measurement: about 6 dB);
good without a finding.

**Fix.** One ground plane directly under the converter; return currents are steered by placement,
not by slots.
**Don't:** "connect PGND and AGND only at the star point".

**Sources.** [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[LearnEMC, Power circuit layout](https://learnemc.com/power-circuit-layout),
[Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022).

#### K-33 · Power inductor unshielded, wrongly oriented or in a sensitive location
*EN: Unshielded or misoriented power inductor, or inductor next to sensitive nets/cables* ·
Confidence **established** (measured values), ground under the inductor **disputed** · Frequency of occurrence medium ·
Engine today **partly**

**Mechanism.** An unshielded inductor has a far-reaching stray field; TI found better near-field
and far-field values with shielded inductors. The start of the winding (dot on the package) belongs at
the switch node: then the outer turns, which sit at the quiet output, shield the E field;
Würth measured up to 8 dB less E field with the correct orientation and about 10 dB from a
metal shield. Whether the ground plane under the inductor should be cut out is disputed: some
developers and manufacturers cut it out because of eddy currents; ADI considers the eddy-current
losses to be local and small and recommends a continuous plane under the inductor as well. According
to ADI, control and feedback traces do not belong under the inductor on any layer.

**Symptom in the lab.** Switching frequency and harmonics in the near field around the inductor, coupling
into nearby traces and cables, with unshielded types down into the lower MHz range.

**Detection from layout data.** Find the inductor at the switch node; shielding type from a component
field or the footprint family; check pin 1 or the marking against the SW net; distance to cable
connectors, edges and sensitive nets. *Data:* footprint, fields, pad 1, nets, positions. *False
positive:* inductors without a defined winding start (footprint pin 1 then says nothing). *False
negative:* missing component fields.

**Engine today.** Partly: coil field as a source with the shielding type set by the user;
orientation of the winding start and proximity to cables are missing.

**Test board.** Base TB-4L with the BUCK block.
*Bad:* L1 with field `Shielding=none`, pin 1 (winding start) at the output `+3V3`, L1 3 mm next to
J1.
*Good:* L1 with `Shielding=shielded`, pin 1 at net `SW`, ≥ 10 mm from J1.
*Expected today:* difference only via the shielding specification. *Target:* findings "winding start at
the output" and "inductor 3 mm from J1".

**Fix.** Shielded inductor, dot at SW, distance to cables and sensitive traces.
**Don't:** place an unshielded inductor directly at a cable connector.

**Sources.** [Würth ANP047](https://www.we-online.com/components/media/o109027v410%20ANP047c_The%20Behavior%20of%20Electro-Magnetic%20Radiation%20of%20Power%20Inductors%20in%20Power%20Management.pdf),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[ADI, Placing the inductor on an SMPS PCB](https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-164.html).

#### K-34 · Converter input filter missing or wrongly placed
*EN: Missing or misplaced converter input filter* · Confidence **established** · Frequency of occurrence high ·
Engine today **no**

**Mechanism.** The input capacitor short-circuits most of the AC current, but not
all of it; the rest flows over the input trace and the supply cable, which then acts as an antenna
and produces conducted interference. TI found that an LC input filter reduced the emission of a
buck regulator on short battery cables by up to 20 dB. The filter belongs at the
board input and must not be bypassed by the layout (K-19).

**Symptom in the lab.** Conducted: switching frequency and harmonics from 150 kHz to 30 MHz;
radiated: hump from 30 to 100 MHz via the supply cable.

**Detection from layout data.** Trace the path from the supply connector to the input capacitor of the
regulator; look for the series element (inductor, ferrite) and shunt capacitors; position at the connector or at the
regulator; coupling between filter input and output. *Data:* netlist, component classes, positions.
*False positive:* converters behind an already filtered intermediate bus. *False negative:* none.

**Engine today.** Yes (`supply-noise`, test board `input-filter`): current divider from the regulator input via
the capacitors and series elements of the supply path to a 2 × 50 Ω LISN, level
150 kHz to 30 MHz against the average limit for mains ports according to EN 55032 class B as a yardstick.
Without a filter around 80 dBµV at 500 kHz, with 10 µH and 4.7 µF at the connector around 25 dBµV. Common
mode and the position of the filter relative to the connector are not covered.

**Test board.** Base TB-4L with the BUCK block at x = 50 to 70; J1 (`+12V_IN`, GND) at (3, 30).
*Bad:* J1 → 45 mm trace → CIN at the regulator, no filter.
*Good:* π filter (1 µF, FB1 `600R@100MHz` or 1 µH, 10 µF) within 10 mm of J1, input and output
spatially separated, then a trace to the regulator.
*Expected today:* no finding. *Target:* estimate of the AC current on J1 (divider formed by CIN, the filter
and the 50 Ω LISN), from that the conducted level and the common-mode emission of the cable.

**Fix.** Input filter at the connector, damping of the filter resonance, capacitors with short
connections.
**Don't:** place the filter directly in front of the regulator and leave the long supply line unfiltered.

**Sources.** [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Würth, Filtering considerations for DC/DC converters](https://www.we-online.com/files/pdf1/20250701_we_part1_dcdc.pdf),
[C&E, Common EMC failures](https://www.celectronics.com/Resources/Common-EMC-Failures).

#### K-35 · Large gate and bootstrap loops, missing snubber
*EN: Large gate-drive and bootstrap loops, missing snubber footprint* · Confidence **consensus** ·
Frequency of occurrence medium · Engine today **partly**

**Mechanism.** In controllers with external switches, driver, gate, source and return path form their own
fast loops. Hegarty (TI) describes how the common source inductance of the power and
gate loops distorts the switching edges and favours false turn-on; large gate loops increase the
ringing at the switch node. An RC snubber at the switch node or a gate resistor are common
emergency measures, but need prepared footprints. TI also describes the resistor in series
with the bootstrap capacitor as a means of slowing down the turn-on edge.

**Symptom in the lab.** Narrow ringing band (100 to 400 MHz) on top of the converter hump.

**Detection from layout data.** Find the driver pins (`HO`, `LO`, `HS`, `BST`, `VBST`) and the gates of the
external switches, evaluate the gate loop and the bootstrap loop as loops; check whether a snubber
footprint exists on the SW net. *Data:* pin functions, footprints, nets. *False positive:*
integrated regulators. *False negative:* missing pin functions.

**Engine today.** Partly: loops can be defined manually; no suggestion for gate loops.

**Test board.** Base TB-4L; U4 (SOIC-8, pin functions `HO`, `LO`, `HS`, `VBST`, `VCC`, `GND`), Q1
and Q2 as `Package_TO_SOT_SMD:TO-252-2`.
*Bad:* gate traces 20 mm, return path through the plane far away, CBOOT 10 mm from U4, no
snubber footprint.
*Good:* U4 ≤ 5 mm from Q1 and Q2, gate and return line routed as a tightly coupled pair, CBOOT at the pins,
RC snubber footprint (0603) between SW and GND directly at the low-side switch.
*Expected today:* visible with manually defined loops. *Target:* suggestion of the gate loops and
note "no snubber footprint".

**Fix.** Driver close to the switches, small gate loops, provide footprints for a gate resistor and
snubber; practical reports generally advise reserving space for filter and damping components to be
added later.
**Don't:** place the driver "centrally" and route the gates across the board.

**Sources.** [TI SLYT682, Hegarty](https://www.ti.com/lit/pdf/slyt682),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Hackaday, One man's tale of EMC compliance testing](https://hackaday.com/2017/10/09/one-mans-tale-of-emc-compliance-testing/).

#### K-36 · Isolation barrier without an RF return path
*EN: Isolation barrier without a high-frequency return path (no stitching capacitance or Y-capacitor)*
· Confidence **established** · Frequency of occurrence medium (high for isolated designs) · Engine today **no**

**Mechanism.** Isolated converters (integrated isolated DC-DC converters, flyback, isolated
interfaces) transfer energy across a barrier. The current that flows through the parasitic capacitance
of the transformer needs a return path. If it is missing, the two ground planes form a dipole
that radiates directly. TI (ISOW7841) shows that just 30 pF of stitching capacitance via overlapping
inner layers gains 10 to 20 dB; Skyworks gives about 4 pF per cm² at 1 mm spacing. In one case at
EMC FastPass (isolated DC-DC converter, failure at 40 to 80 MHz), safety capacitors between the grounds
plus ferrites helped and gave 6 to 10 dB of margin. In the flyback, the capacitance
between the windings is the main source of common mode; countermeasures are shield windings and a
Y capacitor with a short path between primary and secondary side (Keogh, TI).

**Symptom in the lab.** Broadband hump from 30 to 300 MHz, strongly dependent on the position of the cables on
both sides.

**Detection from layout data.** Two ground nets that are connected only through components with an isolation function
(transformer, isolator, optocoupler, Y capacitor); calculate the capacitance between the domains from the
overlap of the planes (stack-up) and from capacitors; distance of the Y capacitor to the
transformer. Finding below about 20 to 30 pF. *Data:* nets, zones per layer, stack-up, component classes.
*False positive:* medical or leakage-current requirements that limit the capacitance (user input).
*False negative:* isolator as a generic component.

**Engine today.** No (no dipole model of two driven planes).

**Test board.** Base TB-4L; U5 as an isolated DC-DC placeholder (`SOIC-16W`, value `ISOW7841`) at
(40, 30) over the barrier; side 1 x = 0 to 36 (`GND1`, `VCC1`), side 2 x = 44 to 80 (`GND2`,
`VCC2`), on the outer layers an 8 mm barrier without copper.
*Bad:* In1 `GND1` only up to x = 36, In2 `GND2` only from x = 44, no overlap, no
Y capacitor.
*Good A:* In1 `GND1` up to x = 50, In2 `GND2` from x = 30, overlap 20 × 40 mm (800 mm², 1.065 mm core,
εr 4.6) ≈ 31 pF. *Good B:* Y capacitor 100 pF (Y1) directly at the isolator.
*Source:* equivalent source at the isolator (e.g. 1 V common mode, 50 to 300 MHz).
*Expected today:* no finding. *Target:* finding "barrier without RF return path (≈ 0 pF)" for bad,
"≈ 31 pF" for Good A.

**Fix.** Stitching capacitance through overlapping inner layers, or Y capacitors close to the
transformer, observing isolation clearances and leakage current.
**Don't:** build the barrier "for safety" on all layers without any capacitance and hope for
ferrites.

**Sources.** [TI SLLA368, ISOW7841](https://www.ti.com/lit/pdf/slla368),
[Skyworks AN1131](https://www.skyworksinc.com/-/media/Skyworks/SL/documents/public/application-notes/an1131-layout-guide.pdf),
[EMC FastPass, Isolated DC-DC case study](https://emcfastpass.com/case-study-iso-dc-dc/),
[TI, Flyback transformer design for EMI (Keogh)](https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/slup338.pdf).

### F Metal parts, copper areas, shielding

#### K-37 · Heatsink or large metal part without a ground connection
*EN: Floating heatsink or large metal part driven by a noisy device* · Confidence **consensus** ·
Frequency of occurrence medium · Engine today **no**

**Mechanism.** A heatsink on a fast IC or switching transistor is coupled to a noise voltage through the
package capacitance. When floating, it acts together with the board and cables as an
antenna (voltage-driven mechanism according to Hubing), from a few hundred MHz also resonantly. Wyatt
advises grounding heatsinks on switching components at several points; a study by the University of York
shows that grounding usually reduces emission, but that the effect depends on the position and number
of grounding points. The Clemson expert system estimates the self-capacitance of a heatsink from its
volume and, from that, the common-mode current.

**Symptom in the lab.** Switching-frequency harmonics or processor clock with a resonance peak; fixed in the
lab with copper tape between heatsink and ground.

**Detection from layout data.** Footprints from `Heatsink:*` (or components with an `HS` reference) over
fast components; net of the mounting pads (no net = floating), number of ground points.
*Data:* footprints, pads with net, position relative to sources. *False positive:* heatsinks on
slow linear regulators. *False negative:* heatsinks that are not in the layout (enclosure part,
thermal pad to the enclosure).

**Engine today.** No.

**Test board.** Base TB-4L with the BUCK block, switching transistor Q1 as `TO-252-2` on the SW net.
*Bad:* `Heatsink:Heatsink_35x26mm_1xFixation3mm_Fischer-SK486-35` over Q1, mounting pad without a
net.
*Good:* mounting pad on GND with four vias, second ground point at the other end.
*Expected today:* no difference. *Target:* finding "heatsink over SW component without ground",
estimate according to the voltage-driven model.

**Fix.** Connect heatsinks to ground at several points; for switching transistors,
consider an insulating interlayer with a shield.
**Don't:** apply "ground all floating metal" across the board; small metal parts are electrically
insignificant, and poor grounding can create new antennas (LearnEMC).

**Sources.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Dawson et al., Grounding and heatsink emissions (York)](https://eprints.whiterose.ac.uk/id/eprint/97224/1/Dawson2001_postprint.pdf),
[Clemson, Voltage-driven EMI algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_driven_EMI.pdf),
[LearnEMC, Not-so-good EMC Design Guidelines](https://learnemc.com/not-so-good-emc-design-guidelines).

#### K-38 · Floating or poorly stitched copper areas
*EN: Floating copper islands or poorly stitched copper pours* · Confidence **disputed** ·
Frequency of occurrence medium · Engine today **no**

**Mechanism.** Copper islands without a net couple capacitively to neighbouring traces and can
resonate if they have a suitable size; ground pours on outer layers that are connected to the ground
plane only at their ends form long, open stubs. Hubing names copper pours as possible
antenna parts above a few hundred MHz. There is no consensus on the benefit of copper pours on
signal layers: Ritchey considers them useless to harmful in multilayer boards, while other authors
see advantages on two-layer boards if the pour is densely stitched.

**Symptom in the lab.** Individual resonance peaks, near-field hotspots at copper islands.

**Detection from layout data.** Zones without a net, or copper islands (filled polygons without a
connection); ground pours on outer layers: largest distance between stitching vias and longest
unstitched "fingers" next to fast traces, compared with λ/20 at the highest relevant
frequency (in FR4 about 7 mm at 1 GHz). *Data:* zones, filled polygons, vias. *False positive:*
copper for manufacturing balance far away from sources. *False negative:* none.

**Engine today.** No. Planes are only recognised as a reference from a 25 % area share; smaller islands
play no role in the model.

**Test board.** Base TB-2L with CLK path and B.Cu as a GND zone.
*Bad:* copper island without a net, 20 × 10 mm on F.Cu next to the clock trace (1 mm clearance), plus
a GND pour on F.Cu that runs as a 40 mm long, 3 mm wide strip next to the clock trace
and has a via at only one end (zone setting "remove islands" set to "never").
*Good:* island removed, strip stitched every 5 mm (or removed entirely).
*Expected today:* no difference. *Target:* notes "floating copper area next to CLK_25M" and
"unstitched ground strip 40 mm".

**Fix.** Remove or connect islands; if ground is poured, stitch it densely.
**Don't:** regard pours as a cure-all (M-11).

**Sources.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Ritchey on copper pours (Altium)](https://resources.altium.com/p/shaky-ground-arguments-against-copper-pours),
[All About Circuits, Grounded copper pour](https://www.allaboutcircuits.com/industry-articles/the-good-and-bad-of-grounded-copper-pour-the-emc-perspective/),
[Interference Technology, Myths and legends of EMI](https://interferencetechnology.com/myths-and-legends-of-emi-in-pcb-design/).

#### K-39 · Plane edges and cavity resonances
*EN: Plane edges and power/ground cavity resonances* · Confidence **disputed** · Frequency of occurrence
low · Engine today **no**

**Mechanism.** A pair of supply and ground planes is a cavity resonator. At 80 × 60 mm
and εr 4.6, the first resonance lies at about 870 MHz, the next ones at about 1.17 and 1.46 GHz
(own calculation). Signal vias with a reference change (K-08) and switching ICs excite it, and the
edges radiate. There is no consensus on the countermeasures: the 20-H rule (pulling back the supply
plane) did not reduce emission in measurements by Shim and Hubing, and at one resonance it even
increased by 3.6 dB; Infineon nevertheless recommends the rule. Wyatt recommends a row of vias along the
edge at a spacing of about 5 mm; Hubing considers edge vias at a spacing of 2 cm harmful (they form
resonators) and recommends distributing connections over the plane.

**Symptom in the lab.** Broad peaks from a few hundred MHz upwards that do not match any single
clock.

**Detection from layout data.** Plane pairs and their dimensions; calculate resonance frequencies and
compare them with the spectrum of the sources; number and position of decoupling capacitors and vias between the planes.
Only as a note. *Data:* zones, stack-up, vias, capacitors. *False positive:* high damping from
many decoupling capacitors. *False negative:* irregular plane shapes.

**Engine today.** No (quasi-static; needs full wave, stage 3 with openEMS).

**Test board.** Base TB-4L, CLK path with a reference change as in K-08 (bad), source with 0.3 ns
rise time.
*Bad:* no decoupling capacitors except C1 and C2, no vias between the planes.
*Good A:* twelve 100 nF decoupling capacitors distributed over the plane. *Good B (myth test):* +3V3 plane with
20-H pull-back (20 × 1.065 mm ≈ 21 mm); expectation in the full-wave simulation: no improvement.
*Expected today:* only `ref-change`. *Target:* resonance note at 0.87 GHz; full-wave comparison in
stage 3.

**Fix.** Reference fast traces to ground, tightly coupled plane pairs, distributed
decoupling.
**Don't:** sell 20-H as an EMC measure; edge vias by the cookbook.

**Sources.** [Shim, Hubing, 20-H rule modeling and measurements](https://cecas.clemson.edu/cvel/pdf/EMCS01-939.pdf),
[LearnEMC, Not-so-good EMC Design Guidelines](https://learnemc.com/not-so-good-emc-design-guidelines),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[Ritchey on plane capacitance (Altium)](https://resources.altium.com/p/interplane-capacitance-and-pcb-stackups).

#### K-40 · Shield can with too few ground contacts
*EN: Board-level shield can with too few or widely spaced ground contacts* · Confidence
**consensus**, few public figures · Frequency of occurrence low · Engine today **no**

**Mechanism.** A shield can only works if its frame is bonded all round with low impedance to the
ground plane. Gaps between contacts act as slots; they should be considerably smaller
than half a wavelength. The usual rule of thumb is λ/20 at the highest frequency (at 1 GHz
in FR4 about 7 mm, at 2.4 GHz about 3 mm). For enclosure slots, Wyatt states that for 20 dB of attenuation
the slot may be at most about 13 mm long.

**Symptom in the lab.** Emission despite a shield can, often with radio modules or fast processors.

**Detection from layout data.** Footprints from `RF_Shielding:*`; count pads with the GND net and vias,
compare the largest gap between connected frame sections with λ/20. *Data:* footprint, pads,
nets, vias. *False positive:* cans over slow circuits. *False negative:* cans as an
assembly option without a footprint.

**Engine today.** No.

**Test board.** Base TB-4L, `RF_Shielding:Laird_Technologies_BMI-S-103_26.21x26.21mm` over U2 and X1
(centre at (55, 30)).
*Bad:* only two corner pads of the frame on GND, with one via each.
*Good:* all frame pads on GND, vias every ≤ 3 mm.
*Expected today:* no difference. *Target:* finding "shield frame: largest gap 26 mm".

**Fix.** Connect the frame continuously to ground, dense via row.
**Don't:** connect frame pads only at a few points to save space.

**Sources.** [Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Atlas PCB, Via fencing and board-level shields](https://www.atlaspcb.com/blog/pcb-emi-shielding-via-fencing-board-level-shield/).

---

## 6. Myths and half-truths

These statements turn up in forums, blogs and some application notes. The tool must neither
check them as a rule nor repeat them in its texts. Where the situation is disputed, this is stated.

| No. | Claim | What the evidence says | Classification |
|---|---|---|---|
| M-01 | 90° corners radiate and cause reflections | Measurements and simulations up to 3 GHz show no appreciable difference between 90° and two 45° bends (the 45° variant was even just under 2 dB louder); TI found a difference of less than 1 dB for rounded traces. The corner capacitance is below 1 pF. | Myth |
| M-02 | Separating analogue and digital ground is always good | Hubing and Ott: almost never; one plane with partitioning. Exceptions: currents below about 100 kHz in extremely sensitive circuits, very high-resolution converters, and then with a single bridge for all traces. | Myth (with narrow exceptions) |
| M-03 | Star ground or single-point grounding for everything | At high frequency, the inductance determines the path, not the topology of the traces; single-point rules mix up "ground" and "return current" (LearnEMC). For low-frequency measurement equipment, a defined current routing can make sense. | Myth for RF |
| M-04 | The 20-H rule reduces emission | Shim and Hubing: near field at the edge lower, emission not, at resonances even slightly higher (up to 3.6 dB). Infineon still recommends it. | Myth (sources disagree) |
| M-05 | Fixed capacitor values: 100 nF plus 10 nF per pin, "0.1 µF up to 15 MHz, 0.01 µF above" | Effectiveness depends on connection inductance and plane spacing, not on a staggering of values; widely different values can create anti-resonances (K-25). | Myth |
| M-06 | Placing the decoupling capacitor "as close as possible" is the most important thing | The connection inductance is more important (vias directly at the pad, no traces). With closely coupled planes (below about 0.25 to 0.5 mm), the exact location is not very critical; with widely separated planes (standard four-layer board with a 1 mm core) or without planes, proximity does matter. | Half-truth |
| M-07 | More vias are always better; edge vias every 2 cm | Hubing: edge rows on a 2 cm grid form resonators, better to distribute them. Wyatt recommends a dense edge row (about 5 mm), Academy of EMC a grid below λ/10. Via chains can cut planes apart (K-05). | disputed |
| M-08 | Guard traces always help | Guard traces that are unstitched or connected only at their ends can resonate and increase the coupling; densely stitched ones can reduce crosstalk considerably. Usually spacing is enough. | Myth without stitching |
| M-09 | Ferrites always help, even in the ground | Ferrite plus capacitor can peak by 10 to 15 dB; DC current lowers the impedance sharply; a ferrite between grounds creates common mode (K-26). | Myth |
| M-10 | A common-mode choke at the DC input always helps | Only meaningful in balanced systems; often ineffective on an unbalanced supply (Hubing). Widespread in practice, hence only a note (K-27). | disputed |
| M-11 | Copper pour everywhere reduces emission | Often useful on two-layer boards with dense stitching; hardly any benefit on multilayer boards with continuous planes; floating or unstitched pours can do harm (K-38). | disputed |
| M-12 | Differential signals do not radiate | Every asymmetry creates common mode, and even microamperes of common mode on a cable are enough (K-14). | Myth |
| M-13 | The trace itself is the antenna | A trace over a plane is a poor radiator; the antennas are usually cables, enclosures, heatsinks. The trace supplies the source (Hubing). Important for the texts of the app. | Misconception |
| M-14 | Terminate from λ/4 or λ/10 | What matters is the ratio of propagation delay to rise time; slow down the edge first (Hubing, LearnEMC). The λ/10 limit of the engine is a model limit (quasi-static), not a termination rule. | Half-truth |
| M-15 | Stitching capacitors across a gap solve the problem | A mounting inductance of at least a few nH limits the effect to the lower hundreds of MHz; Hubing considers additional capacitors across gaps ineffective at the relevant frequencies. | largely a myth |
| M-16 | Local ground island under a crystal or large IC | ST and Infineon recommend a separate ground island under the oscillator, connected to the MCU ground at one point; Hubing considers ground islands under ICs mostly counterproductive. The engine should not report such islands as errors, but it should report traces that cross them. | disputed |
| M-17 | Rounded traces and teardrops improve EMC | TI: below 1 dB. Teardrops are a manufacturing matter. | Myth |
| M-18 | A slow logic family guarantees low emission | Components become faster with new manufacturing revisions; plan for the actual rise time, not for the family (Hubing). | Myth |
| M-19 | The ground must be removed under the power inductor | Some manufacturers require a cut-out; ADI recommends a continuous plane because eddy currents remain local and small. | disputed |
| M-20 | Two ground planes are mandatory from 25 MHz | Outdated; many boards with GHz signals manage with one well-used plane (LearnEMC). | Myth |
| M-21 | "Calculated far field below the limit, so the board passes" | Differential-mode models systematically underestimate; common mode on cables dominates (section 2). The tool may only say "differential-mode estimate below the limit". | Fallacy |

Sources on the myths: [LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines),
[LearnEMC, Not-so-good EMC Design Guidelines](https://learnemc.com/not-so-good-emc-design-guidelines),
[Altium, Routing angle myths](https://resources.altium.com/p/pcb-routing-angle-myths-45-degree-angle-versus-90-degree-angle),
[Study on the radiation from microstrip bends](https://www.academia.edu/3145760/Experimental_and_numerical_study_of_the_radiation_from_microstrip_bends),
[Interference Technology, Myths and legends of EMI](https://interferencetechnology.com/myths-and-legends-of-emi-in-pcb-design/),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Shim, Hubing, 20-H rule](https://cecas.clemson.edu/cvel/pdf/EMCS01-939.pdf),
[Bogatin, Simonovich, Guard traces (DesignCon 2013)](https://cdn.teledynelecroy.com/files/whitepapers/designcon2013_dramatic_noise_reduction_using_guard_traces_with_optimized_shorting_vias.pdf),
[ADI, Ferrite Beads Demystified](https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html),
[ADI, Placing the inductor on an SMPS PCB](https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-164.html),
[Hubing, Four commonly held myths](https://resources.altium.com/p/four-commonly-held-myths-emc-design),
[Ott, Grounding of Mixed Signal PCBs](https://hott.shielddigitaldesign.com/techtips/split-gnd-plane.html),
[ST AN2867](https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

---

## 7. What the engine does not detect today and what that would take

### 7.1 Not detectable (as of 2026-10-05)

K-06, K-13 (as a rule of its own), K-21, K-23, K-25, K-27, K-36, K-39, K-40. Detected since the
first version of the catalogue: K-02, K-03, K-04, K-09, K-10, K-11, K-14, K-15, K-16, K-17, K-18,
K-19, K-20, K-22, K-24, K-26, K-31, K-33, K-34, K-37, K-38 (see [docs/RULES.md](../RULES.md)).
The list in 7.2 and the order in 7.3 are the original plan.

### 7.2 Only partly detectable

| ID | What is missing |
|---|---|
| K-02 | Net change at the boundary between two ground zones; common mode between islands with cables |
| K-03, K-04 | (original plan, done since) gaps below the former `MIN_GAP = 1.0 mm`; planes of other nets merged into the reference plane |
| K-09, K-28 | Return path along the ground traces without a plane; automatic supply loops |
| K-10 | a stack-up diagnostic of its own |
| K-13 | combined rule for outer layer and via count |
| K-14 | skew and common-mode conversion |
| K-17 | edge and connector distance, traces under the crystal |
| K-24 | connection inductance, missing local decoupling |
| K-30 | buck or boost topology detection in the source suggestion |
| K-31 | coupling of the switch node onto cables (voltage-driven) |
| K-33 | winding start, proximity to cables |
| K-35 | suggestion of the gate loops, snubber check |

### 7.3 Additions in order of their usefulness

1. **Common-mode estimate according to the Clemson expert system.** For each source with return current in a
   plane, the voltage between plane points from the partial inductance L_p ≈ (4/π²)·µ0·l·h/(d1+d2),
   ω and the return current (RMS values of all nets summed in quadrature, 1 cm grid); then, between
   each pair of cable connectors, E ≈ 0.365·V at 3 m (resonant cable pair, semi-anechoic chamber, hence an
   upper bound). Covers K-15, K-06, parts of K-02, K-11, K-21. The building blocks (plane grid,
   return current, sources) already exist.
2. **Recognise connectors and I/O nets.** Cable connectors from reference designator, library and shield pads;
   I/O nets as nets with a pad on the connector; the user can deselect connectors without a cable. Basis for
   K-15, K-16, K-18, K-20, K-22.
3. **I/O coupling** (Clemson): mutual capacitance and inductance per segment pair, noise voltage
   on the I/O net, E ≈ 40·Vn/Z_ant with Z_ant from the number of ground pins. Covers K-16, K-17 (b),
   K-22.
4. **Recognise and assess filters.** Series element plus shunt capacitor on supply and I/O nets;
   distance to the connector, ground connection, overlap capacitance between input and output net via the
   stack-up. Covers K-18, K-19, K-34.
5. **Voltage-driven path** (Clemson): capacitance of switch nodes, heatsinks, floating copper
   and traces to the cables, cable current I ≈ 2πf·C·V. Covers K-31, K-37, K-38.
6. **Geometry rules without field calculation:** distance of fast segments to the plane edge in multiples of
   h (K-11), crystal and oscillator distance to the edge and connectors (K-17), traces under crystals,
   inductors and switch nodes, stack-up check (K-10).
7. **Power-distribution assessment:** connection inductance of the decoupling capacitors (Clemson formula), missing
   local decoupling capacitors, value ratios from Value fields, ferrites in ground nets. Covers K-24,
   K-25, K-26.
8. **Differential-pair skew:** length difference in ps, common-mode share sin(π·f·Δt), assessed at the connector
   with the cable model from item 1 (K-14).
9. **Return path without a plane:** shortest inductive path via the GND net on two-layer boards (K-09,
   K-28).
10. **Finer gap detection:** couple `MIN_GAP` to h instead of a fixed 1 mm, net change within a
    layer as an event of its own (K-03, K-04).
11. **Topology in the source suggestion:** distinguish buck, boost and buck-boost from the netlist
    (K-30), suggest gate loops (K-35), read the input voltage from net names instead of estimating 12 V.
12. **Isolation domains:** two ground nets without a galvanic connection, capacitance between them,
    dipole estimate (K-36).
13. **Cavity resonances, shield cans, edge radiation:** only meaningful with full wave (stage 3,
    openEMS); until then, resonance frequencies as a note (K-39, K-40).

### 7.4 Rules for the tool's texts

- Always label results of the far-field estimate as a "differential-mode estimate"; never "passes".
- For findings related to common mode (connectors, cables, islands), mention the dependence on cables.
- Output disputed points (K-23, K-25, K-27, K-38, K-39, M-07, M-16, M-19) only as a note and
  state the opposing position.
- No statements on 90° corners, teardrops or 20-H as an EMC measure.

---

## 8. Sources

Technical authors and universities

- Hubing, PCB EMI Source Mechanisms: https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf
- Hubing, AltiumLive 2022 Keynote: https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022
- Hubing, Four commonly held myths: https://resources.altium.com/p/four-commonly-held-myths-emc-design
- Shim, Hubing, 20-H rule modeling and measurements: https://cecas.clemson.edu/cvel/pdf/EMCS01-939.pdf
- Clemson PCB EMC Expert System, overview of the algorithms: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/pcb_summaries.html
  - Current-driven CM: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Current-driven_CM_algorithm_summary.pdf
  - Grid point voltage: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_Grid_Array_summary.pdf
  - I/O coupling: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/IO_coupling_algorithm_summary.pdf
  - Voltage-driven EMI: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_driven_EMI.pdf
  - Power bus decoupling: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Power_bus_decoupling_algorithm_summary.pdf
- LearnEMC (Hubing):
  - Worst EMC Design Guidelines: https://learnemc.com/some-of-the-worst-emc-design-guidelines
  - Not-so-good EMC Design Guidelines: https://learnemc.com/not-so-good-emc-design-guidelines
  - Good EMC Design Guidelines: https://learnemc.com/other-good-emc-design-guidelines
  - PCB layout: https://learnemc.com/pcb-layout
  - Grounding: https://learnemc.com/grounding
  - Power circuit layout: https://learnemc.com/power-circuit-layout
  - Common-mode filtering: https://learnemc.com/cm-filtering
  - Decoupling with closely spaced planes: https://learnemc.com/decoupling-for-boards-with-closely-spaces-power-planes
  - Decoupling without power planes: https://learnemc.com/decoupling-for-boards-without-power-planes
  - Question of the week 2022-11-28: https://learnemc.com/qotw-221128
  - Question of the week 2023-12-04: https://learnemc.com/qotw-231204
  - Imbalance difference modeling: https://learnemc.com/introduction-to-imbalance-difference-modeling
- Ott, PCB Stack-Up: https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html
- Ott, Grounding of Mixed Signal PCBs: https://hott.shielddigitaldesign.com/techtips/split-gnd-plane.html
- Wyatt, The top five reasons products fail EMI testing: https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/
- Wyatt, Top Ten EMC Problems (slides): https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf
- Wyatt, Design PCBs for EMI, part 2: stack-up: https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/
- Bogatin, Rule of Thumb #7: https://www.edn.com/total-inductance-in-the-return-path-rule-of-thumb-7/
- Bogatin, Rules of Thumb (overview): https://www.edn.com/bogatins-rules-of-thumb/
- Bogatin, Simonovich, Guard traces (DesignCon 2013): https://cdn.teledynelecroy.com/files/whitepapers/designcon2013_dramatic_noise_reduction_using_guard_traces_with_optimized_shorting_vias.pdf
- Hartley (Sierra Circuits): https://www.protoexpress.com/blog/how-grounding-controls-noise-and-emi-by-rick-hartley/ and https://www.protoexpress.com/blog/rick-hartley-pcb-design-recommendations-to-minimize-emi/
- Ritchey on copper pours (Altium): https://resources.altium.com/p/shaky-ground-arguments-against-copper-pours
- Ritchey on plane capacitance (Altium): https://resources.altium.com/p/interplane-capacitance-and-pcb-stackups
- Archambeault, Routing high-speed traces close to the PCB edge: https://pcdandf.com/pcdesign/index.php/2008-archive-articles/3032-effects-of-routing-high-speed-traces-close-to-the-pcb-edge
- Simonovich, Split planes and microstrip: https://www.signalintegrityjournal.com/articles/692-split-planes-and-what-happens-when-microstrip-signals-cross-them
- Peterson, Ethernet connectors and ground planes: https://www.signalintegrityjournal.com/articles/1808-ethernet-connectors-and-routing-above-ground-planes
- Glen Dash, How Common Mode Currents Are Created: https://emcfastpass.com/wp-content/uploads/2017/04/Creation_of_CM_Currents.pdf
- Dawson et al., Grounding and heatsink emissions (York): https://eprints.whiterose.ac.uk/id/eprint/97224/1/Dawson2001_postprint.pdf
- Study on common-mode current and skew in differential pairs: https://www.researchgate.net/publication/224340709_The_impact_of_common_mode_currents_on_signal_integrity_and_EMI_in_high-speed_differential_data_links
- Study on decoupling capacitors at a reference change: https://www.researchgate.net/publication/251803889_Effect_of_decoupling_capacitor_on_signal_integrity_in_applications_with_reference_plane_change
- Study on the radiation from microstrip bends: https://www.academia.edu/3145760/Experimental_and_numerical_study_of_the_radiation_from_microstrip_bends
- Tim Williams, EMC for Product Designers (book, background): https://www.elmac.co.uk/EPD5.htm

Manufacturers

- TI AN-2155, Layout Tips for EMI Reduction in DC/DC Converters: https://www.ti.com/lit/an/snva638a/snva638a.pdf
- TI SLYT682, Reduce buck-converter EMI by minimizing inductive parasitics: https://www.ti.com/lit/pdf/slyt682
- TI SLLA368, Low-emission designs with ISOW7841: https://www.ti.com/lit/pdf/slla368
- TI SNLA107A, Reducing radiated emissions in Ethernet 10/100 LAN: https://www.ti.com/lit/an/snla107a/snla107a.pdf
- TI, USB 2.0 Board Design and Layout Guidelines: https://e2echina.ti.com/cfs-file/__key/telligent-evolution-components-attachments/13-106-00-00-00-00-33-10/USB-2.0-Board-Design-and-Layout-Guidelines.pdf
- TI SCAA103, Spread spectrum clocking: https://www.ti.com/lit/an/scaa103/scaa103.pdf
- TI SLYT512, Grounding in mixed-signal systems demystified: https://www.ti.com/lit/an/slyt512/slyt512.pdf
- TI (Keogh), Flyback transformer design for efficiency and EMI: https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/slup338.pdf
- Richtek AN045, Reducing EMI in buck converters: https://www.richtek.com/Design%20Support/Technical%20Document/AN045
- ADI AN-139, Power Supply Layout and EMI: https://www.analog.com/en/resources/app-notes/an-139.html
- ADI, Single vs. dual hot loop: https://www.analog.com/en/resources/analog-dialogue/articles/4-switch-buck-boost-controller-layout-for-low-emissions-single-hot-loop-vs-dual-hot-loop.html
- ADI, Ferrite Beads Demystified: https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html
- ADI, Placing the inductor on an SMPS PCB: https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-164.html
- Würth ANP047, EM radiation of power inductors: https://www.we-online.com/components/media/o109027v410%20ANP047c_The%20Behavior%20of%20Electro-Magnetic%20Radiation%20of%20Power%20Inductors%20in%20Power%20Management.pdf
- Würth, Filtering considerations for DC/DC converters: https://www.we-online.com/files/pdf1/20250701_we_part1_dcdc.pdf
- Infineon AP24026, EMC and System-ESD Design Guidelines for Board Layout: https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1
- ST AN2867, Oscillator design guide: https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf
- Microchip AN2587, EMI/EMC/EFT/ESD design considerations: https://ww1.microchip.com/downloads/en/Appnotes/00002587A.pdf
- Microchip AN111, 10/100 PCB design and layout guidelines: https://ww1.microchip.com/downloads/en/AppNotes/AN%20111.10-100.General%20PCB%20Design%20and%20Layout%20Guidelines.pdf
- Skyworks AN1131, Reducing radiated and conducted emissions in isolated systems: https://www.skyworksinc.com/-/media/Skyworks/SL/documents/public/application-notes/an1131-layout-guide.pdf
- Tekbox, RF current to electric field strength extrapolation: https://www.tekbox.com/product/AN_-RF_current_to_electric_field_strength_extrapolation.pdf

Labs, trade journals, field reports

- Pawson (Unit 3 Compliance), Case study poor PCB layout: https://interferencetechnology.com/case-study-poor-pc-board-layout-causes-radiated-emissions/
- Interference Technology, Myths and legends of EMI in PCB design: https://interferencetechnology.com/myths-and-legends-of-emi-in-pcb-design/
- EMC FastPass, Isolated DC-DC case study: https://emcfastpass.com/case-study-iso-dc-dc/
- Academy of EMC, EMC Design Guidelines: https://www.academyofemc.com/emc-design-guidelines
- Nemko, 10 most common causes of EMC failures: https://www.nemko.com/blog/why-products-fail-emc-testing-the-10-most-common-causes
- C&E, Common EMC test failures: https://www.celectronics.com/Resources/Common-EMC-Failures
- Altium, Routing angle myths: https://resources.altium.com/p/pcb-routing-angle-myths-45-degree-angle-versus-90-degree-angle
- All About Circuits, Gridded ground: https://www.allaboutcircuits.com/technical-articles/multipoint-grounding-gridded-ground-for-double-sided-pcbs/
- All About Circuits, Good and bad of grounded copper pour: https://www.allaboutcircuits.com/industry-articles/the-good-and-bad-of-grounded-copper-pour-the-emc-perspective/
- Atlas PCB, Via fencing and board-level shields: https://www.atlaspcb.com/blog/pcb-emi-shielding-via-fencing-board-level-shield/
- EEVblog, Fixing a product that is failing CE radiated emissions: https://www.eevblog.com/forum/projects/fixing-a-product-that-is-failing-ce-radiated-emissions/
- A One-Page Guide to Fixing Radiated Emissions: https://cushychicken.github.io/radiated-emissions-debug/
- Hackaday, One man's tale of EMC compliance testing: https://hackaday.com/2017/10/09/one-mans-tale-of-emc-compliance-testing/

Note on reliability: figures come from the sources named; values marked as "own
calculation" were calculated with the formulas given there for the test boards described here
and are orders of magnitude, not predictions of a test result.
