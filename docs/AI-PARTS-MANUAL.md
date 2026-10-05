# Parts manual for AI agents: filling in the source parameters of a board

This manual is for an AI agent with web access (or a person) who prepares the input of this
EMC/EMI near-field app for a KiCad board. The app computes fields from **sources** (clocks,
data lines, differential pairs, switching-regulator hot loops, inductors). Their geometry comes
from the board; their **electrical values** (frequencies, edge times, currents, load
capacitances, …) are in the datasheets of the parts. Your job is to find those values, write
them into a scenario file with a source for every number, and **list every part for which you
could not find the information**.

## Input

The app exports `<board>.ai-request.json` (Diagnostics tab → "Export parts data for AI"). It has:

- `board`: file name, hash, copper layers, whether the stack-up came from the file.
- `components`: every footprint with `ref`, `value`, `footprint`, the symbol fields KiCad copied
  onto it (`fields`: often `Datasheet`, `MPN`, `Manufacturer`/`Mfg`, `Description`) and its pins
  (`pins`: pad number → net name, plus pin function/type where KiCad has them).
- `scenario`: the sources defined so far (may be empty), with settings and view.
- `suggestions`: sources the app guessed from net names (`CLK…`, `USB_D+/-`, switch nodes, …).
  Use them as a starting point; they carry placeholder values.
- `manual`: the address of this document.

If you also have the schematic (`.kicad_sch`) or a BOM, use them: they show values the board does
not (feedback dividers, RT resistors, configuration straps).

## Output

One JSON file, `<board>.scenario.json`, which the user opens in the app with "Load scenario".
Also print a short summary for the user (see "Summary" below).

```json
{
  "kind": "pcb-field-scenario",
  "version": 1,
  "board": { "fileName": "<copy from request>", "hash": "<copy from request>" },
  "settings": { "...": "copy from request.scenario.settings" },
  "view": { "...": "copy from request.scenario.view" },
  "sources": [ "... see below ..." ],
  "parts": [ { "ref": "C12", "c": 1e-7, "esr": 0.02, "esl": 4e-10 } ],
  "provenance": {
    "osc25/waveform.tr": {
      "basis": "datasheet",
      "ref": "Y1",
      "mpn": "SiT1602BI-12-33E-25.000000",
      "source": "https://www.sitime.com/…/SiT1602-datasheet.pdf",
      "where": "p. 3, table 1, 'Rise/Fall Time', 20–80 %, CL = 15 pF",
      "note": "1 ns typ., 2 ns max.; typ. used as worst case for emissions"
    }
  },
  "missing": [
    {
      "ref": "U7",
      "mpn": "unknown",
      "needed": ["waveform.tr of source spi1"],
      "reason": "no MPN in the fields, value 'MCU' does not identify the part",
      "assumed": "2 ns (fallback for fast CMOS outputs)"
    }
  ],
  "notes": "free text: what you changed and why"
}
```

- **`sources`**: the complete list (keep existing ones, correct their values, add missing ones).
- **`provenance`**: one entry per number you set or confirmed. The key is
  `<source id>/<field path>` (e.g. `buck1/waveform.f0`, `clk1/load.cLoad`, `buck1/node.voltage`)
  or `part:<ref>/<field>` for `parts`. `basis` is one of:
  - `datasheet`: read from a datasheet; give `source` (URL) and `where` (page, table,
    parameter name, test condition);
  - `calculated`: derived with a formula from other values; give the formula and inputs in `note`;
  - `schematic`: from the schematic, BOM or part value (e.g. an oscillator's `25MHz` value);
  - `assumed`: a fallback from this manual or an engineering estimate; say why in `note`.
- **`missing`**: every part you needed but could not get the value for, even after looking in
  the datasheet, with what you assumed instead. An empty list means everything came from
  documents.
- **`parts`** (optional): capacitor data for the full-wave simulation (capacitance `c` in F,
  `esr` in Ω, `esl` in H).

## Rules

1. **Never invent a value silently.** Every number has a provenance entry; guesses are
   `assumed` and the part goes into `missing`.
2. **Manufacturer datasheets first**, then distributor pages. Identify the part by `MPN` and
   `Manufacturer`/`Mfg`; if those are missing, by `value`, `Description`, footprint and the nets
   it sits on. If the identification is uncertain, say so in `note` and list the part in
   `missing`.
3. **Worst case for emissions:** the shortest edge time (if only min/max are given, prefer the
   typical value and mention the minimum in `note`), the highest configured frequency, the
   design's maximum load current.
4. **SI base units**: Hz, s, V, A, F, Ω, H. 1 ns = `1e-9`, 5 pF = `5e-12`, 500 kHz = `5e5`.
5. **Do not change geometry** (net names, pad names, source ids) unless it is wrong; explain
   any change in `notes`. Pad names are `<ref>.<pad number>`, e.g. `U3.12`.
6. **Stay inside the ranges below**; if a datasheet value falls outside, double-check the
   unit and the condition.

## Which parts matter

| Role | Typical parts | Becomes |
|---|---|---|
| Clock source | crystal oscillators (XO, MEMS), clock buffers, MCU/FPGA clock outputs | `signal`, kind `clock` |
| Fast single-ended data | SPI, SDIO, QSPI, RMII/RGMII, parallel buses, fast GPIO | `signal`, kind `data` |
| Differential interface | USB, Ethernet (MDI), LVDS, HDMI, CAN, RS-485 | `diffpair` |
| Switching regulator | buck/boost converters, their input capacitors and switches | `loop` (hot loop) |
| Storage inductor | the regulator's inductor | `inductor` |
| Receivers on those nets | MCU/FPGA inputs, PHYs, memories | `load.cLoad` of the signal |
| Passives on those nets | series and termination resistors, capacitors | values used by the app; capacitors in `parts` |

Slow signals (I²C, LEDs, buttons, analog) rarely matter; leave them out unless the edges are fast.

## Fields per source type

All sources have `id` (unique text), `name` (shown to the user), `enabled` (`true`), `color`
(any CSS colour; the app's palette is `#f59e0b #38bdf8 #f472b6 #a3e635 #c084fc #fb7185 #2dd4bf
#facc15`) and `type`.

### `signal`: clock or data line

| Field | Meaning, unit | Where in the datasheet | Typical | Fallback |
|---|---|---|---|---|
| `kind` | `clock` or `data` (data is modelled as the 1010 pattern) | – | – | – |
| `nets` | net names of the line; series resistors between them are bridged | request | – | – |
| `driver` | pad of the output, e.g. `Y1.3`; empty = the app picks by pin type | pin table of the driver | – | `""` |
| `waveform.f0` | clock frequency, Hz; for data: bit rate / 2 | part value (oscillators), clock configuration (schematic/firmware), interface spec | 1 MHz–1 GHz | none: list in `missing` |
| `waveform.tr` | output rise/fall time (10–90 % or 20–80 %), s | driver: "AC/switching characteristics", "Rise/Fall Time", "output transition time"; MCU GPIO: per speed setting and load | 0.2–20 ns | clock 1 ns, data 2 ns |
| `waveform.duty` | high time / period, 0–1 | "Duty cycle" (oscillators: 45–55 %) | 0.5 | 0.5 |
| `waveform.amplitude` | output swing, V (≈ the driver's I/O supply) | "VOH/VOL", the I/O supply rail of the design | 1.2–5 V | 3.3 V |
| `load.model` | `capacitive` (unterminated CMOS) or `terminated` | design | – | `capacitive` |
| `load.cLoad` | input capacitance per receiver pin, F | receiver: "Input capacitance CIN / CI / Cpin" | 2–10 pF | 5 pF |
| `load.z0` | line impedance if terminated, Ω (0 = from the board geometry) | design rules | 50 Ω | 0 |
| `load.endPad` | termination pad, e.g. `R12.2`; empty = farthest receiver | schematic | – | `""` |

### `diffpair`: differential interface

| Field | Meaning, unit | Where | Typical | Fallback |
|---|---|---|---|---|
| `netP`, `netN` | the two nets | request | – | – |
| `driverP`, `driverN` | driver pads; empty = by pin type | pin table | – | `""` |
| `kind` | `clock` or `data` | – | – | `data` |
| `waveform.f0` | bit rate / 2 for data, Hz | interface: USB FS 12 Mbit/s → 6 MHz, HS 480 Mbit/s → 240 MHz; Ethernet 100BASE-TX 125 Mbaud → 62.5 MHz | – | none |
| `waveform.tr` | edge time, s | PHY/transceiver "rise/fall time"; USB FS 4–20 ns, HS 0.5 ns | – | interface minimum |
| `waveform.amplitude` | single-ended swing of one leg, V | USB FS 3.3 V, USB HS 0.4 V, LVDS 0.35 V | – | interface spec |
| `waveform.duty` | 0.5 | – | 0.5 | 0.5 |
| `imbalance` | amplitude/timing mismatch between the legs, 0–1 (drives common mode) | rarely given; skew or "output symmetry" | 0.02–0.1 | 0.05 |
| `load` | as for `signal` (USB: capacitive, 5 pF; terminated pairs: `terminated`, z0 = 0) | – | – | – |

### `loop`: hot loop of a switching regulator

| Field | Meaning, unit | Where | Typical | Fallback |
|---|---|---|---|---|
| `pads` | pads around the hot loop in order; closed automatically. Buck: input capacitor + → VIN pin → (switch, inside the IC) → PGND pin → input capacitor −, e.g. `["C1.1","U1.1","U1.2","C1.2"]` | regulator pinout, layout | – | – |
| `waveform.f0` | switching frequency fSW, Hz | "Switching frequency", or the RT/FREQ resistor formula (then `calculated` with the resistor from the BOM) | 100 kHz–3 MHz | none |
| `waveform.duty` | D = Vout/Vin (buck), 1 − Vin/Vout (boost) | rails of the design (feedback divider) | 0.05–0.9 | none |
| `waveform.amplitude` | current step in the loop, A: buck ≈ output current, boost ≈ input current, at the design's maximum load | design load; else regulator rating (`assumed`) | 0.1–10 A | rating, `assumed` |
| `waveform.tr` | switch-node transition time, s | "SW rise/fall time", "switch node slew rate" (tr = Vin / slew rate), gate-driver data | 2–20 ns | 5 ns |
| `node.net` | switch-node net (for the electric field) | schematic | `SW` | – |
| `node.voltage` | switch-node swing, V (≈ Vin) | design | – | Vin |

### `inductor`: stray field of the storage inductor

| Field | Meaning, unit | Where | Typical | Fallback |
|---|---|---|---|---|
| `ref` | footprint reference, e.g. `L1` | request | – | – |
| `shielding` | `open` (unshielded drum/bobbin), `semi` (magnetic resin, semi-shielded), `shielded` (fully shielded, molded/metal composite) | inductor datasheet: "construction", "shielded", series description | – | `semi`, `assumed` |
| `waveform.f0` | switching frequency, Hz | as for the loop | – | as loop |
| `waveform.duty` | D, as for the loop | – | – | as loop |
| `waveform.amplitude` | ripple current peak-to-peak, A. Buck: ΔI = (Vin − Vout)·D / (L·fSW), with L from the inductor value (`calculated`) | – | 10–40 % of Iout | 30 % of Iout |
| `waveform.tr` | unused, `0` | – | – | 0 |

### `parts`: capacitors (optional, full-wave simulation)

| Field | Meaning, unit | Where | Typical | Fallback |
|---|---|---|---|---|
| `c` | capacitance, F (the effective value at the DC bias if the datasheet gives it) | value field, datasheet DC-bias curve | – | value field |
| `esr` | equivalent series resistance at 10–100 MHz, Ω | impedance/ESR curve | 5–50 mΩ (MLCC) | 0.02 |
| `esl` | equivalent series inductance, H | datasheet, or by size: 0402 ≈ 0.3–0.5 nH, 0603 ≈ 0.5–0.7 nH, 0805 ≈ 0.6–1 nH | – | 0.5 nH |

## Procedure

1. Read the request. List the EMC-relevant parts (table "Which parts matter") from `components`,
   their nets and `suggestions`.
2. For each part, identify the exact type (`MPN`, manufacturer) and open its datasheet (the
   `Datasheet` field, else the manufacturer's site).
3. Fill the fields above for every source; compute derived values (duty cycle, ripple current,
   edge time from slew rate) and record the formula.
4. Check every number against the "Typical" column and the units.
5. Write the JSON file. Put every assumption into `provenance` with `basis: "assumed"` and the part
   into `missing`.
6. Print the summary.

## Summary (print this for the user)

- How many sources, and how many values came from datasheets, calculations, the schematic and
  assumptions.
- A table of **missing information**: reference, part number, which values, why not found,
  what was assumed.
- Any doubts about the identification of a part.

The app shows the same: in the source editor the origin of each value, in the Diagnostics tab and
in the report the list of missing information.
