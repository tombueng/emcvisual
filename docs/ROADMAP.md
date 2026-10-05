# Roadmap

As of: 2026-10-04

## The idea

Electromagnetic interference on a board is invisible. This tool turns it into
a **walkable 3D world with picture and sound**: you see where the field comes from, hear the
clocks and switching regulators, and try out changes. The data come first from a
fast simulation (pure software), later from more accurate simulations and from measurements
with inexpensive hardware, all in the same world.

## Stages

| Stage | Content | Type | Status | Document |
|---|---|---|---|---|
| **1** | Quasi-static near-field simulation in the browser, PCB-World, sound | Software | **implemented** (M0–M7) | [stage-1/PLAN.md](stage-1/PLAN.md) |
| **2** | Return currents in planes, line effects, E field | Software | **in progress** (2a return-current detours, 2b E field, 2c inductor stray field done; plane solver open) | [future/STAGE-2-PLANE-CURRENTS.md](future/STAGE-2-PLANE-CURRENTS.md) |
| **3** | Full wave with openEMS, far field, cables | Software (+ local computation) | **in progress** (3a offline workflow: job export, run, import, comparison with stage 1) | [future/STAGE-3-FULL-WAVE.md](future/STAGE-3-FULL-WAVE.md) |
| **4** | Measurement: 3D printer as a near-field scanner | Hardware + software | **in progress** (scanner chain checked virtually, drivers for OctoPrint, G-code and tinySA untested) | [future/STAGE-4-SCANNER.md](future/STAGE-4-SCANNER.md) |
| **5** | Hand-held probe with position tracking, probe array, phase | Hardware + software | **started** (5.4 fitting the sources to the measurement) | [future/STAGE-5-ADVANCED-MEASUREMENT.md](future/STAGE-5-ADVANCED-MEASUREMENT.md) |
| **W** | Cross-cutting: VR, effects, sound, KiCad coupling, reports | Software | **partly** (KiCad live coupling, real 3D models from your own libraries, report, Geiger counter, isosurfaces, VR experimental, CI field check) | [future/CROSS-CUTTING-WORLD-AND-INTEGRATION.md](future/CROSS-CUTTING-WORLD-AND-INTEGRATION.md) |

## Dependencies

```
Stage 1 ──┬──► Stage 2 ──► Stage 3
          │                  ▲
          ├──► Stage 4 ──► Stage 5
          │        └───────────┘ (measurement calibrates the simulation, equivalent sources feed it)
          └──► Cross-cutting W (any time)
```

Stage 1 lays the common foundations: BoardModel, grid, volume format, rendering,
sound. Every later stage only supplies new **volumes** (with their provenance) or new
**current elements**; rendering and operation stay the same.

## Further documents
- [DECISIONS.md](DECISIONS.md): numbered decisions with their rationale
- [RENAMING.md](RENAMING.md): working title and plan for the later renaming
