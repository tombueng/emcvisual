# Rule set: what the app detects, how, and how far to trust it

As of: 2026-10-05

Every finding of the app at a glance: how it is detected, which threshold applies, where the
rule comes from, how much it is worth, its priority, and the generated test board it is checked
on (`tools/emc-cases`, test `tests/emcCases.test.ts`: a board with the mistake and a twin with
the usual fix). The mistakes with their sources are in
[research/EMC-MISTAKES-CATALOGUE.md](research/EMC-MISTAKES-CATALOGUE.md) (K-numbers), the physics
in [stage-1/PHYSICS.md](stage-1/PHYSICS.md), the user's view of all this in
[USER-GUIDE.md](USER-GUIDE.md).

**Confidence:**
*computed* – from the field or current-loop model, with the limits stated there;
*estimate* – a published approximation for the worst case, or a circuit estimate with assumed
part values;
*rule* – a geometry rule with a guide value from the literature, nothing computed.

**Priority:** red = high priority, yellow = check, green = low priority. For computed findings it
follows from the source's distance to the limit and the finding's share of it
(`findingSeverity` in `src/physics/severity.ts`); for the cable estimates from their own margin
minus 6 dB (they are deliberately pessimistic); for rules it is fixed per rule (listed below).
It orders the work and is not a test result. Score bands: high priority from 0.6, check from 0.3.

## Findings at a source

| Finding | Detection, threshold | Origin | Confidence | Test board |
|---|---|---|---|---|
| Return path interrupted (`return-gap`) | Gap from 0.2 mm in the reference plane under the line (raster 0.1–0.25 mm, checked every 0.1 mm along the line), reported when the return has to go at least 2 mm further than straight across or cannot get round; a split between two nets' copper on the plane layer is its own variant. Holes up to 2.5 mm across (anti-pads) count as copper. Red as long as the source is less than 15 dB below the limit (the common-mode effect of the gap is not computed) | K-01–K-04; LearnEMC "Don't split, gap or cut the signal return plane" | computed (differential mode), common mode not | `slot-clock`, `split-plane`, `narrow-slot` |
| Reference change at a via (`ref-change`) | Layer change where the reference planes before and after belong to different nets; the return takes the nearest capacitor between them | K-08; Archambeault | computed | `ref-change-pwr` |
| Layer change without a stitching via (`no-stitching`) | Same reference net on both layers, but no via of that net within 3 mm | K-07 | computed | `via-no-stitch` |
| Line without termination (`long-line`) | Quarter-wave resonance c/(4·L·√εeff) inside the measured range, spectrum there ≥ 1 % of the strongest line, no series resistor ≥ 10 Ω within 15 mm of the driver | K-12; Johnson/Graham | warning, overshoot not computed | `long-clock`, `series-term` |
| Line without a reference plane (`no-reference`) | No plane on any layer; compared with an imagined ground plane on the opposite side; the return follows ground copper where there is some | K-09; Ott | computed | `no-plane` |
| Line at the edge of its plane (`edge-trace`) | Over at least 3 mm closer than 3·h (at least 1 mm) to the outer edge of the plane or to a gap from 5 mm, sideways to the line | K-11; LearnEMC (2·h), Wyatt (3–5 trace widths) | rule (effect not computed) | `edge-clock` |
| Signal layer without an adjacent plane (`no-adjacent-plane`) | The reference plane is not on the next layer | K-10; Ott, Hartley | rule (the larger loop is contained in the far field) | `no-adjacent-plane` |
| Hot loop too large (`hot-loop`) | Area of the loop along the copper from 30 mm²; check from 40, high priority from 80 mm² | K-29; TI SLYT682, AN-1149 | computed (area); far field over a solid plane not quantifiable (full wave: only 4–5 dB between 132 and 4 mm², see PHYSICS.md §11.1) | `buck-loop` |
| Cables driven against each other (`cable-cm`) | L_p = (4/π²)·µ0·l·h/(d1+d2), V = ω·L_p·I; E = 0.365·V (cables on both sides) or cable against the board; reported from 6 dB below the limit | K-15; Clemson expert system, Hockanson/Hubing 1996 | estimate (worst case) | `between-connectors` |
| Differential pair of unequal length (`pair-skew`) | Length difference from 5 mm or skew from 10 % of the rise time; the common mode from the skew is named, not computed | K-14 | rule; priority 0.4 (check) | `pair-skew` |
| Crosstalk into a cable line (`io-coupling`) | Parallel run with a line on a cable connector; M = µ0/(4π)·ln(1 + 4h²/s²), E = 40·V/Z_ant, Z_ant = 80·(N+1) Ω; at most two per source | K-16; Clemson I/O coupling | estimate (worst case) | `io-crosstalk` |

## Findings of the board (no source)

| Finding | Detection, threshold | Origin | Confidence, priority | Test board |
|---|---|---|---|---|
| Filter far from the connector (`filter-far`) | Ferrite, inductor or capacitor to ground on a cable line (also behind a series resistor) farther than 10 mm from the connector pin; one finding per pin | K-18; Wyatt, C&E | rule, 0.45 (check) | `filter-far` |
| Filter capacitor without a short ground (`filter-ground`) | Ground pad not in a ground pour, nearest ground via farther than 3 mm | K-18; Wyatt | rule, 0.4 (check) | `filter-ground` |
| Connector shield open (`shield-open`) | Pads S*, SH*, SHIELD, MP without a net or without any further connection | K-20; Wyatt | rule, 0.65 (high) | `usb-shield` |
| Connector shield poorly bonded (`shield-weak`) | Shield pads reach ground only after more than 3 mm | K-20 | rule, 0.45 (check) | – |
| Decoupling (`decoupling`) | Per IC (from 5 pins) the worst supply pin: no capacitor to ground within 20 mm, or the nearest farther than 5 mm (with a rough mounting inductance) | K-24; Clemson, Archambeault | rule, 0.4 (check) | `decoupling` |
| Crystal at the edge or a connector (`crystal-placement`) | Closer than 5 mm to the board edge or 10 mm to a cable connector | K-17; Infineon AP24026, ST AN2867 | rule (guide values), 0.4 (check) | `crystal-edge` |
| Lines under the crystal (`crystal-under`) | Foreign lines under the package, without a plane between | K-17 | rule, 0.45 (check) | `crystal-under` |
| Switch node too large (`sw-node`) | Switch-node copper from 100 mm², on several layers, or from 40 mm² close to the edge (3 mm) or a connector (10 mm) | K-31; LearnEMC, TI | rule, 0.45 (check) | `sw-node-area` |
| Storage inductor at the edge or a connector (`inductor-placement`) | Inductor on the switch node closer than 3 mm to the edge or 10 mm to a cable connector; shielding and winding start unknown | K-33; TI | rule, 0.4 (check) | `inductor-connector` |
| Too few ground pins on a connector (`connector-ground`) | Connector with nets of fast sources (rise time up to 5 ns): fewer than one ground pin per two fast pins, or a fast pin more than 1.5 pitches from the nearest ground pin; connectors with a bonded shield excepted; one finding per connector | K-22; Clemson (Z_ant = 80·(N+1) Ω) | rule, 0.45 (check) | `connector-ground` |
| Filter bypassed by overlap (`filter-bypass`) | Ferrite (FB, "ferrite"/"bead", value such as 600R or BLM…) or inductor with a readable value and capacitors to ground on both sides; copper of both nets on top of each other on different layers with no other pour between, C = ε0·εr·A/h; reported from 3 pF when C gets a lower impedance than the part below 1 GHz | K-19; Hubing (AltiumLive 2022), ADI | rule with a computed overlap (plate capacitor, no fringing, no side-by-side coupling); 0.45, high (0.6) when bypassed below 100 MHz | `filter-bypass` |
| Switching current on the supply cable (`supply-noise`) | Per enabled regulator (loop source with a switch node): shortest path from its input net over fuse, diode, inductor, ferrite or resistor up to 1 Ω to a cable connector; current divider over the capacitors per net (ESR, ESL, track 0.5 nH and 1 mΩ per mm) and the series parts down to a LISN of 2 × 50 Ω; reported when the voltage at the LISN between 150 kHz and 30 MHz exceeds the average limit for AC mains ports of EN 55032 class B (a yardstick, not the test standard of a DC input); regulators on the same input add up | K-34; TI AN-2155, Würth | estimate (differential mode, assumed part values); 0.45, high (0.6) from 20 dB over the yardstick | `input-filter` |
| No ESD protection at a connector (`esd-missing`) | USB, HDMI or DisplayPort connector: a data line (not ground, supply, shield, CC, SBU, ID, VBUS, nor KiCad's unconnected pads) without a part that is a TVS/ESD diode by library, value or reference (USBLC6, PESD, TPD, PRTR, ESD…, TVS…); one finding per connector | TI SLVA680; IEC 61000-4-2 | rule (immunity, not emission), 0.45 (check) | – |
| ESD protection placed poorly (`esd-placement`) | The diode is not closer to the connector pin than to the nearest IC pin of the line (TI: the IC much farther from the diode than the diode from the connector), or its ground pad has neither a ground pour nor a ground via within 2 mm | TI SLVA680 | rule, 0.35 (check) | – |
| Copper without a connection (`floating-copper`) | Zone without a net, or part of a net's fill without a pad or via, each from 25 mm² | K-38 | rule, 0.35 (check) | `floating-copper` |
| Heat sink without ground (`heatsink-floating`) | Heat-sink footprint, all pads without a net | K-37 | rule, 0.45 (check) | – |
| Ferrite between two grounds (`ferrite-ground`) | FB/L with ground names on both sides (disputed in the shield path) | K-26 | rule, 0.4 (check) | `ferrite-ground` |

## What counts as a cable, a supply or a plane

- **Cable connectors:** footprints from connector libraries or with references like J, CN, USB,
  X, P; known cable interfaces (USB, RJ45, HDMI, terminal blocks, JST, …) always,
  board-to-board and module connectors never, others only up to 40 pins.
- **Supply nets** (not signal lines): names like VIN, VBUS, VBAT, VCC, VDD, +3V3, 5V,
  SYS_VIN_HV.
- **Switch nodes:** a pin named SW, LX, PH or PHASE on a regulator, or a net named like one.
- **Reference planes:** pours from 15 % of the board area; pours of other nets from 5 % on the
  same layer count as well, and every raster cell knows its net; holes up to 2.5 mm (anti-pads)
  count as copper.
- **Boards from other CAD tools** (IPC-2581, ODB++, Eagle): the same rules on the imported board;
  see [IMPORT.md](IMPORT.md) for what each format provides (pin functions, for example, only come
  from KiCad).

## How new rules are checked

1. Create the mistake and its usual twin as a test board in `tools/emc-cases/gen_cases.py` and
   enter the expectation; `tests/emcCases.test.ts` must find the mistake on the bad board and not
   on the twin.
2. Run it on real boards with `tools/survey`: how many findings, how many red? A rule that fires
   dozens of times on carefully designed boards is narrowed.
3. Write the text with what/why/fix/avoid/limits/sources in both languages
   (`tests/texts.test.ts` checks that it exists).
