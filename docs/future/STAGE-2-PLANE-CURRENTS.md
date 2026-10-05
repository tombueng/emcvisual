# Stage 2: Return currents in planes, line effects, E field

As of: 2026-10-04 · Status: **2a detour model, 2b E field, 2c inductor stray field implemented**; plane solver (exact current distribution) and line effects open

## Goal

Remove the biggest simplification of stage 1: that the return current always flows directly
under the line. Stage 2 **calculates** how the current distributes itself in reference planes:
around slots, through stitching vias between planes, through decoupling capacitors at a
reference change GND → VCC. In addition: transmission-line effects (standing waves) and the
quasi-static E field.

## Why

The most common EMC mistakes on boards are return-current mistakes: a slot in the plane,
split planes, layer changes without a stitching via, cut-outs. Stage 1 only reports them.
Stage 2 shows the actual detour of the current as a picture, as a loop area and as an
increase in field, which is exactly what one wants to learn when doing layout.

## Implemented: 2a Geometric detour model (2026-10-04)

Before the elaborate plane solver (2.1) arrives, the app calculates with a geometric model
that represents the two most common return-current mistakes as real current paths
(`src/physics/returnPaths.ts`, selection "Return current model" in the view, default):

- **Gap under a trace** (slot, cut-out, with copper on both sides): above the gap the line no
  longer gets an image current. The return current runs on the surface of the same plane
  along the shortest path through the copper around the gap (Dijkstra on a 0.4 mm grid of
  the plane raster, then straightened). Short vertical connectors down to the image depth
  close the circuit.
- **Reference change at a via:** if the reference planes of the two layers belong to the same
  net, the return current jumps at the nearest via of this net that connects both planes
  (or at a THT pad). If they are different nets, it jumps across the nearest two-terminal
  component between these nets (decoupling capacitor): from one plane up to the
  capacitor, through it and down to the other plane.
- **Small holes** in planes (up to 3 mm², e.g. via clearances) are filled in the plane
  raster; slots and cut-outs remain.
- The diagnostics state the detour length, the additional loop area and the component the
  current jumps across; the paths appear dashed in the 3D view.

Limits of 2a: the return current is a single path instead of a distributed surface current
density; gaps that a trace does not enclose on both sides (the line ends in the cut-out)
keep the stage 1 model; the plane capacitance between planes of different nets is not taken
into account (at high frequencies it takes over part of the jump).

On the demo board: the return current of the bad clock runs 15 mm around the end of the slot
(about 13 mm² of additional loop area) and jumps across C2 at both vias (35 and 52 mm detour,
18 and 31 mm²); as a result the hotspot moves from the slot into the loop to the capacitor.

## Implemented: Far-field effect of each finding (2026-10-04)

`src/physics/attribution.ts`. The far-field estimate is proportional to the magnetic dipole
moment of a source, with the same factor for every spectral line. Every detour from 2a knows
its "fixed" form: for a gap, the return current then runs as a mirror image directly under
the line; for a layer change, through a stitching via directly next to the via. From this:

- **per finding:** its share of the moment, Δm_k = m_now − m_k fixed, added to the source
  with ideal return paths: cost_k = 20·log10(|m_ideal + Δm_k| / |m_ideal|). Simply "removing
  one detour and comparing" does not work, because the detour loops of one source can
  circulate in opposite directions and partly cancel each other. For the bad clock of the
  demo, removing only the near jump across C2 even makes the source 4 dB louder.
- **per source:** all return paths together, 20·log10(|m_now| / |m_ideal|), and all gaps in
  the plane together (the same source over planes without gaps). This also covers gaps with
  no path around them and cut-outs under a source. The display is capped at "more than 30 dB":
  over an ideal plane the vertical moment of a flat loop vanishes almost completely.
- **Order** (Diagnostics tab, report, field check): first the source with the smallest
  margin to the limit at 3 m, within it the finding with the largest share.
- **Displayed** since 2026-10-05 (technical review, finding no. 1) is no longer the share as
  "fixed … quieter", but what fixing **only this spot** changes, 20·log10(|m_now| /
  |m_k fixed|), including its sign: a finding that, fixed on its own, makes the source louder
  says so ("only helps together with the other hints"). The share is given in the
  explanation and orders the list.

Demo board (as of 2026-10-05, far field with the return current in the plane): bad clock
(0.4 dB below the limit) with the far jump across C2 (share 18.8 dB, fixed alone 7.1 dB
quieter), the near jump (share 11.8 dB, fixed alone 3.9 dB louder) and the slot (share
4.1 dB, alone 1.9 dB quieter), all return paths together 16 dB. The cut-out under the bad buck
costs more than 30 dB; the good buck has nothing.

## Implemented: 2b Quasi-static E field (2026-10-04)

`src/physics/charges.ts`, `efield.ts`; toggle "Field: Magnetic (H) / Electric (E)".

- Charge per volt: traces as line charges q = C'·L (C' from the line model), pads on the
  outer layers as point charges q = ε0·εr·A/h, zones of a node as a grid of points.
- Image charges with opposite sign in those planes that have copper at that location
  (line charges split into pieces ≤ 1 mm), shielding via the same layer compartments as for
  the H field.
- Field of a finite line charge integrated in closed form, with a core radius against
  singularities; tests against a point charge and an infinite line charge.
- Voltage spectrum: trapezoid of the signal; for current loops optionally a switch node
  (SW net and voltage swing, default 12 V in suggestions), because that is where the E field sits.
- Display in dBµV/m; probe, line list, hotspots and field lines follow the selected field.

## Implemented: 2c Stray field of power inductors (2026-10-04)

Source type "Inductor": a horizontal loop with 16 segments at half the component height,
radius 0.35 × the smallest package edge, fed with the triangular ripple current
(peak-to-peak, duty cycle of the converter; c_n = A·|sin(nπD)| / (π² n² D(1−D))). The
construction sets the effective turns of the stray flux: open 12, semi-shielded 4, shielded
0.8 (rough empirical values, not manufacturer data). Suggested for inductors at the switch
node of a regulator.

## Method (extension, open)

### 2.1 Planes as a conductor network (PEEC-like, quasi-static)
1. **Meshing:** every plane layer (filled polygons) is triangulated or split into a
   rectangular grid (0.25–1 mm, adaptively finer at edges, slots, vias).
2. **Unknowns:** surface current density per cell (edge currents), charge conservation at nodes.
3. **Two regimes:**
   - **Low frequency (< ≈ 100 kHz):** resistance dominates. Laplace equation
     ∇·(σ∇φ) = sources (vias) with a sparse matrix (conjugate gradients, WASM).
   - **High frequency (EMC range):** inductance dominates. Minimisation of the magnetic
     energy: partial inductances between all plane cells and the signal line, system of
     equations (R + jωL)·I = U with Kirchhoff constraints. The L matrix is dense:
     O(N²) memory. Remedies: hierarchical matrices / fast multipole, or coarse
     meshing far away from the line (N ≈ 5–20 k cells).
4. **Candidate for the solver:** compile FastHenry (MIT, open source, multipole-accelerated)
   to WebAssembly, pass the geometry in FastHenry format, read back the current distribution.
   To be checked: output of the surface current distribution, licence, size of the WASM build.
   Alternative: own solver in Rust → WASM with the same formulation.
5. **Result:** plane currents as additional current elements (instead of images) for the
   affected regions. Kernel, grid and display from stage 1 remain unchanged.

### 2.2 Connections between planes
- **Stitching vias** of the same net connect planes; the return current changes layer at the
  nearest via; the additional loop becomes visible.
- **Reference change GND → VCC:** the return current jumps across decoupling capacitors (with
  ESL, ESR and mounting inductance) or the plane capacitance. Model: a lumped element between
  the planes at the location of each capacitor; manufacturer models (e.g. Murata
  SimSurfing, Würth REDEXPERT) as S-parameters or RLC.

### 2.3 Line effects (standing waves)
- For electrically long lines (L > λ/10) the current along the line is not constant:
  I(x, f) from the transmission-line equations with source and load impedance (driver R_out,
  series R, input C, termination).
- Consequence: the spatial pattern becomes frequency-dependent. Solution: compute the pattern
  at a few support frequencies (e.g. 8 per decade) and interpolate between them; cache per
  source and support point.
- Driver models from IBIS (output characteristic, rise time) instead of free parameters; SPICE
  (ngspice, included in KiCad) for nets with filters or ferrites.

### 2.4 E field
- Line charges q'(x, f) = C'·V(x, f) with image charges; charges in planes from the plane
  solver. Display as a second volume, switchable or mixed (H red, E blue).
- Important for switch nodes (SW) with high dV/dt, heat sinks and edge fields.

### 2.5 Component stray fields
- Inductors: stray field of unshielded power inductors as a magnetic dipole, oriented
  according to the construction; shielded inductors with a residual factor. Data source:
  manufacturer data or measurement.

## Data model extensions
- `PlaneMesh` per plane layer (nodes, edges, cells), `PlaneSolution` per source and frequency.
- `Source.load` extended with IBIS/SPICE references.
- Volumes with a frequency axis (support points) instead of only |h|².

## Display in the PCB world
- Plane currents as an animated flow texture on the plane (line integral convolution
  or particles), colour = current density.
- "X-ray view": hide layers, see the return current under the forward path.
- Before/after: place a stitching via with a click → return current and field change live.

## Validation
- Analytical: return current distribution under a microstrip line ∝ 1/(1 + (x/h)²).
- Against stage 3 (openEMS) on reference structures: line over a slot, reference change with
  and without a capacitor, open-ended line at λ/4.
- Against measurement (stage 4) on a test board with these structures.

## Effort and risks
- Large: the plane solver is the most elaborate part of the whole project.
- Risk: computation time in the browser → WASM + workers, coarse meshing, result cache.
- Risk: complexity of the user interface → stage 2 calculation can optionally be switched on
  per source.

## Open questions
- FastHenry compiled to WASM, or an own solver?
- How fine does the plane meshing have to be for visibly correct fields?
