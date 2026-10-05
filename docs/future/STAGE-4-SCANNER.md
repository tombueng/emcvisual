# Stage 4: Measurement with a 3D printer as near-field scanner

As of: 2026-10-04 · Status: scanner chain implemented (verified virtually, hardware drivers untested) · Prerequisite: stage 1 (grid, display)

## Goal

Scan real boards: a near-field probe on the print head, a low-cost receiver, measurement on a
3D grid above the board. The measured data lands in the same PCB world as the simulation:
side by side, overlaid, as a difference. **Again in the browser if possible** (Web Serial / WebUSB).

## Implemented: scanner chain (2026-10-04)

"Measure" tab in the right-hand panel; code in `src/scanner/`, control in
`src/state/scanner.svelte.ts`, user interface in `src/ui/ScannerPanel.svelte`.

| Part | File | What it does |
|---|---|---|
| Interfaces | `types.ts` | `Positioner` (moves), `Receiver` (measures one sweep), measurement format |
| Registration | `registration.ts` | board ↔ printer as a rigid 2D mapping (Kabsch), with mirroring, because KiCad's y points downwards; with three or more points it picks the better of the two solutions, residual error in mm |
| Scan plan | `plan.ts` | raster over the board or 20 × 20 mm around the probe, serpentine path, several heights; above tall components (package height from KiCad + clearance + probe radius) the probe is lifted |
| Sequence | `runner.ts` | lift first, then move, wait, several sweeps with max hold, abort between two points |
| Probe model | `probe.ts` | H loop: U = 2πf·µ0·πa²·H, E stub: U = E·h_eff, dBm into 50 Ω; correction `factorDb` for a later calibration |
| Evaluation | `measurement.ts` | subtract the background (as power, lower limit one tenth of the background), conversion to dBµA/m, the same frequency selection as the simulation (all, band, line), slices per height, JSON file (`kind: "pcb-field-measurement"`) |
| Virtual test bench | `virtual.ts` | printer and receiver that measure what the simulation predicts (with a noise floor of −100 dBm ± 1 dB); during the background run the board is "off" |
| Hardware | `drivers.ts`, `webserial.ts` | OctoPrint REST (`POST /api/printer/command`, API key only held in memory), G-code over Web Serial (waits for `ok` after `M400`), tinySA over Web Serial (`scan start stop points 3`) |

Display: the measurement appears as a slice plane at the measurement height in the colour
scale of the simulation, updated continuously during the scan. "Difference to simulation"
shows measurement − simulation within ±20 dB (red louder, blue quieter); for this the
simulation is evaluated at the height at which the probe actually was. Points whose power is
less than 3 dB above the background stay empty, because there a difference says nothing about the board.

Verified:
- Unit tests: registration exactly recovers a mirrored, rotated and shifted position; the
  plan runs as a serpentine path and lifts the probe above the connector; a virtual scan
  returns, through the probe model and the file format, exactly the specified field strength;
  the background run marks empty bands as noise; the tinySA parser reads the output of
  `scan`.
- E2E (Playwright): demo board, full scan with 41 × 26 = 1066 points, background,
  difference view.
- In the browser: median of the difference measurement − simulation 0.35 dB in the band
  30–230 MHz; the deviations at the edge come from the noise floor and vanish with background subtraction.

Still open:
- The hardware drivers are written against the documented protocols but have not yet run on
  any device. OctoPrint acknowledges commands immediately; the arrival is estimated from the
  distance and the feed rate. For an OctoPrint on the LAN the app has to be served over http
  (`npm run dev`), and OctoPrint must allow CORS (Settings → API).
- Klipper/Moonraker, HackRF, adaptive refinement, binary format and real sound (IQ snippets).
- Calibration of the probe factor on a known structure.

## Hardware (guide prices)

| Part | Suggestion | Approx. price |
|---|---|---|
| Positioner | existing 3D printer (Klipper preferred, Marlin possible) | €0 |
| Receiver | tinySA Ultra (100 kHz–5.3 GHz, USB serial) or HackRF One (1 MHz–6 GHz, fast sweep) | €130–300 |
| Probes | H-field loops (set, or self-built from semi-rigid coax, shielded loop), E-field pin | €20–50 |
| Preamplifier | broadband LNA 20–30 dB, 0.05–3 GHz | €10–20 |
| Holder | printed long arm (PLA/PETG), ferrite on the probe cable | – |

An RTL-SDR (24 MHz–1.7 GHz) also works, but is slow and narrowband (2.4 MHz).

## Procedure

1. **Setup:** board on the print bed (holder with an end stop), probe on the arm, cable with
   ferrite, EUT in a defined operating state.
2. **Registration:** locate the board in the printer coordinate system. Jog the probe over
   2–3 alignment marks (fiducials, holes, pad centres); the app knows their KiCad
   coordinates and calculates the transformation (translation, rotation, scale ±).
   Later: a camera on the print head, automatic detection.
3. **Background:** the same scan with the EUT switched off. Captures the interference of the
   printer itself (stepper motor drivers keep switching even at standstill) and of the
   surroundings; it is subtracted later.
4. **Scan:** move to each grid point, settle for 100–200 ms, record the spectrum (max hold over
   N passes for intermittent signals), save. First coarse (2–3 mm), then the hotspots fine
   (0.5 mm). Several heights (e.g. 1, 2, 4, 8 mm) for the 3D information.
5. **Orientations:** for a vector field, scan three times (loop in x, y, z) or use a
   three-axis probe → H_x, H_y, H_z → field lines from measured data.
6. **Import into the PCB world:** measurement volume (x, y, z, f) with metadata (probe,
   receiver, RBW, height, background subtracted), same display as the simulation.

## Software

- **Printer:** Klipper via the Moonraker HTTP API (`/printer/gcode/script`), enable CORS in
  `moonraker.conf`; Marlin via Web Serial (G-code `G0`, `M400` to wait).
  Movements only within a verified safety zone (component heights from KiCad + clearance).
- **tinySA:** USB CDC console with commands such as `scan`, `scanraw`, `sweep`, `data`; via
  Web Serial directly from the browser. Check the throughput (scanraw is faster).
- **HackRF:** `hackrf_sweep` (very fast, several GHz/s) locally; in the browser via WebUSB
  (WebUSB implementations of the sweep mode exist; check their maturity).
- **Time required:** 80 × 100 mm at 2 mm = 2000 points; 0.5–2 s per point → 15–60 min per
  scan plane. Adaptive refinement saves most of that.
- **Data format:** initially JSON with raw spectra (implemented); later a binary format
  (JSON header + Float32 blocks) once the files become too large.

## Calibration and units

- Probe factor (dB(A/m) per dBµV) from the manufacturer's data or from calibration on a
  known structure (e.g. a TEM cell or a conductor loop with a known current).
- Without calibration: relative dB, entirely sufficient for comparisons (before/after).
- Comparison with stage 1: probe voltage from the simulated H (PHYSICS.md §9) with the same
  loop diameter and height; the deviation calibrates both sides.

## Pitfalls

1. **Self-interference of the printer** → subtract the background, keep the probe far away
   from the print head, do not switch the motors off (loss of position), fans off.
2. **Resolution** ≈ max(loop diameter, distance). Small probe = fine, but insensitive.
3. **Common mode on the probe cable** → ferrite, shielded loop.
4. **EUT not stationary** → max hold, fixed test firmware (continuous clock, continuous data pattern).
5. **No phase** with a spectrum analyser (stage 5 solves this).
6. **Collision** with tall components → height map from KiCad, safety clearance, test run without a probe.

## Display in the PCB world
- Measurement volume, slice plane at the measurement height (directly comparable with the simulated slice).
- Difference measurement − simulation in dB; hotspots that only appear in the measurement.
- Real sound: play back IQ snippets recorded at hotspots (HackRF), AM-demodulated.

## Validation
- Test board with known structures (the same as for stage 2/3): line over a slot,
  loops of different area, differential pair.
- Repeatability: scan twice, expect a deviation < 1 dB.

## Open questions
- Printer: Ender 3 with OctoPrint 1.11 on a Raspberry Pi 3B (available).
- Receiver and probes: as of 2026-10-04, none yet. Cheapest sensible entry point:
  tinySA Ultra and a set of H-field near-field probes (loops 1–10 mm); the driver for the
  tinySA is written. Until then the chain runs with the virtual test bench.
