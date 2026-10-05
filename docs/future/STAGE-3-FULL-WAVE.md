# Stage 3: Full-wave simulation (openEMS) and far field

As of: 2026-10-04 · Status: 3a implemented (offline workflow with openEMS) · Prerequisite: stage 1; stage 2 helpful

## Goal

Solve Maxwell's equations without approximation: resonances, emission from plane edges,
slot antennas, propagation delays, a true far field. Load the results as volumes with a
frequency axis and phase into the PCB world, next to stage 1/2 and next to measurements.

## Implemented: 3a Offline workflow with openEMS (2026-10-04)

Route 1 from 3.1: the app exports a job, a Python script calculates it locally with openEMS,
the app loads the result. Operation, setup and model assumptions:
[tools/openems/README.md](../../tools/openems/README.md).

| Part | File |
|---|---|
| Job from BoardModel and sources (copper, wires, vias, ports, loads, shorts, frequencies, grid) | `src/fullwave/job.ts` |
| Model setup, grid, run per source, H per ampere of port current onto the app grid, far field at 3 m | `tools/openems/run_job.py` |
| Reading the result file, frequency weights, sampling, resampling onto a different grid | `src/fullwave/result.ts` |
| "Magnetic field from: Fast / Full wave", probe, scan, far field from the openEMS result | `src/state/engine.svelte.ts`, `src/ui/ViewPanel.svelte` |

**Linearity (3.3) exploited:** what is stored is |H|² per A² of port current at 12
frequencies. The app distributes each spectral line of its source model onto the two
neighbouring frequencies (linear in log f) and composes the volume from them. Edge times and
frequencies remain adjustable without recalculating. Sources without a full-wave result
(inductors) stay with the fast model.

**Comparison with stage 1 (quasi-static limiting case):** for the bad buck loop of the
demo board (grid 1 mm, only 30 000 time steps), the full wave deviates, at 3 mm and more above
the board, by a median of −0.7 dB (10–90 %: −2.7 to +0.1 dB), evaluated where the field is less
than 30 dB below its maximum. The agreement holds within ±3 dB up to about 700 MHz;
at 1 GHz the full wave is 4 dB higher. At the probe 3 mm above the loop:
113.8 (fast) and 112.9 dBµA/m (full wave) at 30 MHz, 74.2 and 74.1 dBµA/m at 500 MHz. The test
`tests/fullwave.test.ts` checks this when a result is present under `tools/openems/runs/`.

**Computation time:** about 70 million cell updates/s on 16 cores. One source of the demo
board takes about 2 min with 1 mm cells, about 10–15 min with 0.6 mm cells.

Still open: local bridge (route 2), phase and animated waves, radiation pattern, cables and
enclosure (3.4), E-field dumps, inductors as a full-wave source, adaptive grid.

## Why

Stages 1 and 2 are quasi-static. As soon as structures approach λ/4 (board
100 mm ↔ 750 MHz, cable 1 m ↔ 75 MHz), resonances arise that can raise the emission by
20–40 dB. Only a full-wave calculation sees that. In addition, stage 3 calibrates the
fast stages: where do they deviate, and by how much?

## Method

### 3.1 Tool: openEMS (FDTD, open source)
- Rectilinear grid (EC-FDTD), CPU, multi-core; Python interface (CSXCAD for the geometry).
- Does **not run in the browser** (C++). Three routes:
  1. **Offline workflow:** the app exports an openEMS project (Python script + geometry),
     the user runs it locally, the app imports the field dumps (HDF5 → own binary format via
     a small converter).
  2. **Local bridge:** a small service on `localhost` (Python) that the app talks to via
     HTTP/WebSocket: upload the project, report progress, stream results. Data stays local.
  3. **Compute server** (optional, later): the same service on a powerful machine.
- Reference for the geometry export: Antmicro's `gerber2ems` (Gerber → openEMS for
  signal integrity); an own export directly from the BoardModel is more accurate (nets, layers).

### 3.2 Model setup
- Layer stack-up with dielectrics (εr, tan δ), copper as thin conductors (or with thickness
  at critical spots), vias approximated as cuboids/cylinders.
- **Grid:** fine lines at metal edges (thirds rule), refinement at vias and pads,
  coarse grid in free space, smooth transitions (factor ≤ 1.5); boundary: PML (8 cells) at a
  sufficient distance (λ/4 at the lowest frequency, or MUR for small boxes).
- **Excitation:** one port per source (lumped port between pad and plane) with a broadband
  Gaussian pulse; the spectrum of the source is applied afterwards (linearity).
- **Output:** field dumps (H and E, magnitude and phase) on the PCB world grid at
  selected frequencies; NF2FF box for the far field (radiation pattern, E at 3/10 m).

### 3.3 Exploiting linearity
- One FDTD run per source port yields the transfer function port → field for all
  frequencies. After that, spectrum changes are interactive again (as in stage 1).
- With phase, **coherent** superposition and **animated waves** become possible
  (Re{H·e^{jωt}}): the PCB world shows how waves propagate and radiate at edges.

### 3.4 Cables and enclosure
- Connected cables as wires (1 m, routing freely selectable) at the connector; the common-mode
  current and its emission, which usually dominates in practice.
- Enclosure as a metal box with openings; shielding effectiveness, slot resonances.

### 3.5 Computation time (estimate)
- Board 100 × 80 mm, grid 0.1 mm near conductors, coarser elsewhere: 10–50 million cells;
  time step ≈ 0.2 ps; for a 30 MHz lower limit several 100 000 steps → hours per port on a
  desktop. With sub-regions (only the relevant region): minutes.
- GPU FDTD as an alternative: check gprMax (CUDA, actually meant for ground-penetrating
  radar); Palace (FEM, frequency domain, open source) for resonance analyses of the planes
  (eigenmodes).

## Display in the PCB world
- Volume with a frequency slider over a continuous spectrum.
- Animated waves (phase), radiation pattern as a 3D lobe above the board.
- "Sim A ↔ Sim C" comparison: difference volume in dB, findings where stage 1 is off.
- Far-field chart with CISPR limits, now with resonances.

## Validation
- Canonical structures with known results: microstrip resonator, patch antenna,
  dipole; comparison with literature and measurement.
- Consistency with stage 1 at low frequencies (quasi-static limiting case).

## Effort and risks
- Medium to large. Grid generation is the main work; openEMS itself is mature.
- Risk: computation time → sub-regions, coarse grid, overnight runs, result cache.
- Risk: installation → Docker image for the local bridge.

## Open questions
- Offline workflow first, or the local bridge straight away?
- Which result format (own binary format, or HDF5 in the browser via h5wasm)?
