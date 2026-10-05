# Stage 1: Physical model

As of: 2026-10-04. This document describes what the simulation computes, under which
assumptions, and where it stops being valid. Every formula here has a counterpart in the code
(`src/physics/…`) and, where possible, a test against an analytical solution.

Coordinates: computation in the **world coordinate system** (right-handed, three.js convention):
X = KiCad x, Y = height (positive upwards, Y = 0 in the middle of the F.Cu copper layer), Z = KiCad y.
The change from KiCad's left-handed system (x, y pointing down) is a reflection; it does not change
magnitudes, and it makes the field directions correctly right-handed. Lengths are in mm
internally, the formulas below are in SI units; the conversion lives in the kernel.

---

## 1. Quantities and units

| Quantity | Unit | Display |
|---|---|---|
| Magnetic field strength H | A/m | dBµA/m = 20·log10(H / 1 µA/m) |
| Electric field strength E (M8, far field) | V/m | dBµV/m |
| Current of a spectral line | A | dBµA |
| Probe voltage (loop probe) | V | dBµV |

**All line amplitudes are displayed as RMS values**, as on a spectrum analyser whose peak
detector is calibrated so that it displays a sine line as its RMS value. Fourier coefficients
(peak values) are therefore divided by √2.

## 2. Validity of quasi-statics

The model neglects the propagation delay between source and field point. The phase error is
k·r = 2π·r/λ. For k·r ≤ 0.3 (≈ 17°) the magnitude error is small. Hence:

    f_qs = 0.3 · c0 / (2π · r_max)

With r_max = distance source–field point, about 20 mm in the grid: **f_qs ≈ 700 MHz**. Above
that, the picture still shows *where* the sources are, but the magnitudes at larger distances
become unreliable. The app displays f_qs for the current grid.

Second assumption: **electrically short lines** (lumped treatment). A line of length L is
short as long as

    L < λ_eff / 10   ⇔   f < f_short = c0 / (10 · L · √εeff)

Example: L = 40 mm, εeff = 3.3 → f_short ≈ 410 MHz. Above that, standing waves form, which
stage 1 does not model (stage 2). The app shows f_short for each source.

## 3. Signals and their spectra

### 3.1 Trapezoidal signal
Periodic trapezoid with amplitude A, period T = 1/f0, pulse width τ (at 50 %), and equal
rise and fall times t_r. One-sided Fourier coefficients (peak values), n ≥ 1
(Paul, *Introduction to EMC*, ch. 3):

    c_n = 2·A·(τ/T) · |sinc(n·π·τ/T)| · |sinc(n·π·t_r/T)|,     sinc(x) = sin(x)/x
    c_0 = A·τ/T

Envelope: flat up to f1 = 1/(π·τ), then −20 dB/decade, and −40 dB/decade from f2 = 1/(π·t_r).
**The rise time determines the harmonics above f2**, which makes it the most important
parameter for EMC.

Duty cycle d = τ/T. For d = 0.5 the even harmonics vanish (sinc(nπ/2) = 0 for
even n).

### 3.2 Data signals
Random data have a continuous spectrum. Stage 1 calculates conservatively with the
worst-case pattern 1010…, i.e. a clock with f0 = bit rate/2 and d = 0.5. Label
in the UI: "Data (worst case 1010…)".

### 3.3 Line list
For each source, the lines n·f0 up to f_max (default 1 GHz, adjustable up to 6 GHz) are
generated. Lines below −80 dB relative to the strongest one are discarded. If a signal has more
than 4096 harmonics up to f_max (slow signals), every k-th line is kept (k odd) and scaled
by √k: the power in each band is preserved, and the envelope still reaches up to f_max.

## 4. Transmission line parameters

### 4.1 Microstrip (outer layer over a plane)
Hammerstad/Jensen (simplified form), w = width, h = distance to the plane, εr of the dielectric:

    w/h ≤ 1:  εeff = (εr+1)/2 + (εr−1)/2 · [ (1 + 12h/w)^−½ + 0.04·(1 − w/h)² ]
              Z0   = 60/√εeff · ln(8h/w + w/(4h))
    w/h ≥ 1:  εeff = (εr+1)/2 + (εr−1)/2 · (1 + 12h/w)^−½
              Z0   = 120π / ( √εeff · (w/h + 1.393 + 0.667·ln(w/h + 1.444)) )

Capacitance and inductance per unit length:

    C' = √εeff / (c0 · Z0)        L' = Z0 · √εeff / c0

Check value: εr = 4.4, w/h ≈ 1.9 → Z0 ≈ 50 Ω (test).

### 4.2 Stripline (inner layer between two planes)
IPC-2141, plane spacing b, copper thickness t, valid for w/b < 0.35:

    Z0 = 60/√εr · ln( 4b / (0.67·π·(0.8w + t)) ),      εeff = εr

Asymmetric (off-centre) position: b = h1 + h2 + t (approximation).

### 4.3 No reference
Without a plane, Z0 is not defined. Fallback assumption C' = 50 pF/m (typical of a line
over a distant reference), visible as a "no reference" warning.

## 5. Current distribution by source type

Each source provides (a) a **current geometry**: straight current elements with relative weights
g_e (relative to a reference current of 1 A), and (b) a **line spectrum** I_k of the
reference current. The field is then H_s(r, f_k) = I_k · h_s(r), where h_s is the field of the
geometry for 1 A (§6).

### 5.1 Signal with capacitive load (default for short CMOS lines)
The driver charges and discharges the line and input capacitances. With the voltage spectrum V_k:

    I_k = 2π·f_k · C_tot · V_k

Distribution in the net: the net graph as a tree starting at the driver pad (for meshes: shortest-path tree).
Each edge e has the line capacitance C_e = C'·length, half of which is assigned to each of its
two end nodes (π equivalent circuit). Load pads additionally receive C_load (default 5 pF
per receiver, adjustable). Thus:

    C_node(n) = Σ_(e at n) C_e/2 + C_load(n)
    g_e       = C_subtree(child of e) / C_tot

At each node the displacement current C_node(n)/C_tot flows **perpendicular to the reference plane**
(a vertical current element from the node to the plane). At the driver the total current returns
from the plane (via the GND pin). This makes the current distribution source-free (∇·J = 0),
which Biot-Savart needs in order to give a physically meaningful field.

### 5.2 Signal with termination (long or terminated line)
Current along the path driver → termination pad is constant:

    I_k = V_k / Z0

Z0 as the length-weighted mean over the path. Vertical elements only at the driver and the termination.
Branches carry no current (approximation).

### 5.3 Several nets in one source
A clock often runs through a series resistor (net "CLK_R" → R → "CLK"). A source may
contain several nets; two-terminal components with one pad in each of two nets of the source are
treated as a bridge (straight connection between the pad centres).

### 5.4 Current loop (switching regulator)
The loop is specified as an ordered sequence of pads, e.g. for the hot loop of a
buck converter: C_in+ → U.VIN, (inside the IC) → U.GND → C_in−, (inside the capacitor) back.
- Between two pads of **the same net**: shortest path over the copper of that net
  (Dijkstra over the net graph, vias with a small penalty; through zones as a straight line).
- Between two pads of **the same component**: straight line (current path inside the component).
- Current: trapezoid with peak current I_pk, frequency f_sw, duty cycle D, switching time t_r.
- Parts of the path that lie **in a plane layer of the loop's own net** (return path through the
  GND plane) are not carried as separate elements: at high frequencies this
  return current flows underneath the outgoing path, and that is exactly what the mirror image (§8) models.

### 5.5 Differential pair
Two nets P and N with the same signal, weights +1 and −(1 − ε). ε is the imbalance
(default 5 %); it gives rise to the common-mode component. Load model as in §5.1 or §5.2 (per net).

## 6. Linearity and composition

The field equations are linear. Because the weights g_e do not depend on frequency,
the spatial pattern h_s(r) (a vector, for 1 A) of each source is **frequency-independent**. It is
computed once per source and geometry; after that:

    |H_s(r, f_k)| = |I_s,k| · |h_s(r)|

**Within a source** the contributions of the elements add as vectors (coherently);
this is contained in h_s. **Between sources** the powers are added, because independent
oscillators are not phase-locked and their lines rarely coincide anyway:

    |H(r)|² = Σ_s  w_s · |h_s(r)|²,      w_s = Σ_(k ∈ selection) |I_s,k|²

Selection: a single line, a band (power sum of the lines in the band, e.g.
CISPR 30–230 MHz) or the whole spectrum. Only |h_s|² is stored per source, as a
Float32 volume; the composition is a weighted sum and takes milliseconds.

## 7. Biot-Savart for a straight current element

For a filament from A to B with current I, field point P, R_a = P − A, R_b = P − B,
R_a = |R_a|, R_b = |R_b|, L = |B − A|, ê = (B − A)/L (Hanson/Hirshman 2002):

    H(P) = I/(4π) · (ê × R_a) · 2L·(R_a + R_b) / ( R_a·R_b·((R_a + R_b)² − L²) )

Check: a point at distance d from the centre, L → ∞, gives H = I/(2π·d) (test).

**Core regularisation:** The filament is an idealisation; close to the conductor, 1/d diverges.
With the perpendicular distance d⊥ = |ê × R_a| and the core radius a (half the conductor width,
at least the copper thickness; for vias the drill radius):

    d⊥ < a:  H ← H · (d⊥/a)²

This corresponds to the field inside a round conductor (∝ d) and keeps the values finite.
Very wide conductors (w > 2 grid spacings) are split into several parallel filaments.

## 8. Reference planes, mirror images and shielding

### 8.1 Detecting planes
A copper layer is a **plane layer** for net N if the filled zones of N cover at least
15 % of the board area on that layer (area of the `filled_polygon` by Gauss's
trapezoid (shoelace) formula; KiCad stores holes as keyholes, and the formula subtracts them correctly).
Planes of other nets covering 5 % or more on the same layer count as well (split planes), and each cell
knows its net, so that dividing lines are recognised as a gap. The threshold is deliberately low:
where copper lies under a line, it is that line's reference, even if it covers only part of the board
(for instance an analogue ground under the audio section); the raster says where. Can be overridden
per layer. Each plane layer is transferred to a fine raster (0.1–0.25 mm) (scanline fill);
coverage queries are then O(1). Holes up to 2.5 mm in their largest extent (via and
pin clearances) count as copper; slots are judged by their length.

### 8.2 Mirror images
An ideally conducting plane at y = y_F is replaced, for the half-space of the source, by an
image current (image point y' = 2·y_F − y). With R denoting the reflection in the plane, the
image current density is J' = −R(J):
- **tangential** (horizontal) currents: image with **reversed** direction,
- **normal** (vertical) currents: image with the **same** direction.

In the code, the end points are mirrored and the weight is negated; this yields both rules
at once (mirroring the end points already reverses the vertical direction).

For a trace over a plane, the image current reproduces exactly the field of the return current that
gathers under the line at high frequencies (distribution ∝ 1/(1 + (x/h)²), Johnson,
*High-Speed Digital Design*). For a loop lying flat, it models the eddy currents
that weaken the field above a plane.

### 8.3 Local coverage
For each horizontal element, the model checks in steps of 0.25 mm whether the nearest
plane layer in the direction of the reference has copper there. Where it does not, the model looks for the next,
more distant plane layer that has copper, or omits the image (free loop).
The element is split at such transitions. Gaps shorter than 1 mm (via clearances)
are bridged. Vertical elements (vias) are split at every plane layer; because a
via sits in the clearance (hole) of the plane, copper within a radius of 0.8 mm counts for them.

This makes a slot under a clock line visible as a **larger loop** (image in the
more distant plane). The actual detour of the return current around the slot
is not computed (stage 2), but it is reported as a warning.

### 8.4 Shielding
A field point P receives no contribution from element E if a plane layer that has copper
**at the position of P** lies between the height of E and the height of P. Implementation without
extra cost in the inner loop body: the plane layers divide the height into "compartments"
(slots); each element belongs to one compartment; for each grid column a bit mask indicates which
planes have copper there. A packet of elements of the same compartment is skipped entirely for a
point if a covering plane lies between the compartments. Image elements apply
only in the half-space of their original and carry its compartment.

Outside the board outline there are no planes, hence no shielding: the field
"wells out" at the edges, which corresponds qualitatively to the edge fringing field.

## 9. Virtual probe

At the probe position P, h_s(P) is computed **exactly** (without a grid) by Biot-Savart over all elements of a
source. Spectrum: |H(P, f_k)| = |I_s,k| · |h_s(P)|, summed over sources as a
power sum per frequency. Display options:
- |H| (isotropic probe, like a three-axis probe),
- one component H_x, H_y, H_z (directional loop probe),
- probe voltage of a loop with radius a: U = 2π·f·µ0·π·a²·H_n (ideal, open circuit).

## 10. E-field (optional, M8)

Quasi-static, from line charges q' = C'·V_k along the line with an image charge −q' below
the plane; closed-form expression for the field of a finite line charge. Reveals the
switch nodes (SW) and high-voltage edges, which are inconspicuous in the H-field.

## 11. Far-field orientation

For electrically small structures, the magnetic dipole moment of the complete,
source-free current distribution is what matters. For this, the return current lies **in the plane itself**,
not at the image depth (2026-10-05, technical review, finding no. 2): mirroring replaces a plane only
for the field above a plane that is much larger than the distance (near field). For the
far field, a board plane at 30–300 MHz is much smaller than λ; what counts is the real
return current, and a trace at height h above the plane spans h·L, not 2·h·L
(`packWithImages(…, { imageAt: 'plane' })`, `farMoment()`):

    m = ½ · Σ_e  g_e · (A_e × B_e)          [A·m² per A of reference current]

Free-space far field in the direction of maximum radiation (Jackson, magnetic dipole radiation):

    E = η0 · k² · |m| / (4π·r) = 1.316·10⁻¹⁴ · f² · |m| / r        [V/m]

Test site with a conducting ground: factor 2 in the worst case (Ott, *EMC Engineering*,
eq. 12-2: E = 263·10⁻¹⁶ · f²·A·I / r, with A the real loop area). E is displayed at
3 m and 10 m against the selected limit (standards.ts). At a step between two
bands the stricter value applies (CISPR 32 Annex A, CISPR 11 §6.1, 47 CFR §15.109): a
line at exactly 230 MHz or 1 GHz is compared with the lower one. At 30 MHz and 3 m,
k·r ≈ 1.9; that is why the app includes the induction term of the dipole (factor √(1 + 1/(k·r)²),
+2.1 dB at 20 MHz, +1.1 dB at 30 MHz, negligible above 50 MHz).

Properties that the model reproduces: a flat loop over a plane has a
vertical moment that the return current in the plane almost cancels (in that case the app shows no
far-field number, `dipoleCompensated`, but assesses the loop area instead); a trace
with its return current in the plane forms a vertical loop of area h·L.

**Limits:** This is the differential-mode emission of the board alone. Compliance tests usually fail
because of common-mode currents (on cables, but also via the voltage drop across the plane and the
coupling to heat sinks and enclosures; Paul 1989, Hockanson/Hubing 1996); the model does not compute
these, and they often exceed the differential-mode emission by 20 dB or more. Above a
structure size of about λ/4 the f² formula no longer applies (no saturation, no resonance);
the spectrum view hatches the range above the frequency up to which the source is electrically
short, and the explanation of a finding warns when the strongest line lies there.

## 11b. Common mode with cables (estimate, worst case)

`src/physics/commonMode.ts`, based on the EMC expert system of Clemson University
(Grid Point Voltage Algorithm, Current-Driven Common-Mode Radiation Algorithm; Hockanson,
Drewniak, Hubing et al., IEEE TEMC 1996/1997). The return current of a line over the plane
produces a voltage between the two plane halves to the left and right of the midpoint of the line:

    L_p = (4/π²) · µ0 · l · h / (d1 + d2),     V = ω · L_p · I

(l distance between the line ends, h height above the plane, d1 + d2 board width across the line
at its midpoint). Cable connectors on both sides: resonant cable pair, E ≈ 2·√(30/100)·V/3 m
= 0.365·V. Connector on one side only: cable against the board, limited by the board's
self-capacitance C_B ≈ 8·ε0·√(A/π) (disc of equal area; the Clemson summary
writes ε0·A, which, being dimensionally inconsistent, cannot be meant as written). No connector detected: a
supply cable is assumed. Reported from 6 dB below the limit.

Check: the worked example from docs/research/EMC-MISTAKES-CATALOGUE.md (50 mm clock, h = 0.21 mm,
60 mm board width, 7 mA at 75 MHz) gives L_p = 0.089 nH, 0.29 mV and 40.6 dBµV/m
(`tests/commonMode.test.ts`).

Limits (stated in the app for every finding): resonance assumed at every frequency, hence
rather too high; no gaps in the plane (they increase the voltage), no differential pairs,
no switching-regulator loops, no voltage-driven coupling to heat sinks and enclosures,
no summation of several sources. Whether a footprint carries a cable is guessed from the library and
reference designator.

## 11c. Crosstalk onto cable lines (estimate, worst case)

`src/physics/ioCoupling.ts`, based on the Clemson algorithm "Radiation by I/O Coupling". I/O nets
are nets with a pin on a cable connector (also via one series resistor or ferrite further on).
For each parallel section of a fast line (angle below 15°, distance below 15·h or
3 mm, whichever is larger, same layer or no plane in between):

    M = µ0/(4π) · ln(1 + 4h²/s²),  C_m = M · C / L
    V_mag = ω · M · I · l,  V_elec = ω · C_m · V · l · 100 Ω,  V_n = max(Σ V_mag, Σ V_elec)
    E = 40 · V_n / Z_ant  (3 m),  Z_ant = min(800 Ω, 80 · (N + 1)),  shielded connector 800 Ω

(N ground pins of the connector). Reported from 6 dB below the limit. Limits: weak coupling,
resonant cable, partial contributions added in phase (rather too high), filters at the connector and the
load of the I/O line (100 Ω assumed) not taken into account.

## 11d. Board rules without a source

`src/physics/layoutRules.ts`, rules from the mistakes catalogue, without field computation and with a fixed
priority per rule:

- **Filter far from the connector** (K-18): series component (R, L, FB, not a pull-up/-down) or
  capacitor to ground on a connector line (or one series part further on), more than 10 mm from the
  connector pin; one finding per pin.
- **Filter capacitor without short ground** (K-18): ground pad not in a ground plane of its
  layer, and the nearest ground via further away than 3 mm.
- **Connector shield open / poorly connected** (K-20): pads S*, SH*, SHIELD, MP without a net or
  without any further connection (high priority); connected, but plane or via further away than 3 mm.
- **Decoupling** (K-24): for each IC with at least five pins, the worst supply pin; no
  capacitor to ground within a radius of 20 mm, or the nearest one further away than 5 mm. The
  connection inductance is a rough estimate: line inductance of the route plus 1 nH for
  package and vias (Clemson).

The distances are straight-line distances, not routed lengths; whether a component is meant as a filter and whether
a footprint carries a cable is guessed from the reference designator, net and library.

### 11.1 Comparison with the full wave (2026-10-05)

Test board `vertical-loop` (60 × 40 mm, two layers, 1.6 mm, ground plane at the bottom): 40 mm line
on top, connected to the plane through a via at each end, excited with a port at one end. Far field
at 3 m per ampere of port current, openEMS (FDTD, 0.5 mm mesh, NF2FF, ground factor 2) against the fast
calculation (`tools/fullwave/validate-loop.ts`):

| f / MHz | Full wave | Fast (return current in the plane) | Difference | Previously (image depth) |
|---|---|---|---|---|
| 20 | 52.2 | 49.7 | −2.5 | +3.5 |
| 29 | 56.0 | 54.9 | −1.1 | +4.9 |
| 41 | 60.6 | 60.5 | 0.0 | +6.0 |
| 83 | 71.8 | 72.4 | +0.6 | +6.7 |
| 169 | 85.1 | 84.7 | −0.4 | +5.6 |
| 344 | 97.9 | 97.0 | −0.9 | +5.1 |
| 491 | 105.4 | 103.2 | −2.3 | +3.8 |
| 701 | 115.6 | 109.3 | −6.3 | −0.2 |

(dBµV/m per A.) Between 30 and 350 MHz the fast calculation agrees to within ±1 dB; the old
image model was 5–7 dB too high (technical review, finding no. 2). Below that, 1–2.5 dB are still missing (finer
frequency resolution of the full wave with long run times, field distribution of the plane). Above that,
the line approaches its own resonance (short-circuited line, λ/4 at about 1 GHz), the current
is no longer uniform, and the fast calculation is too low; exactly there the
explanation shows the caveat "above the limit up to which the line is electrically short".
This is a comparison on one structure and not a measurement: it checks the calculation against a
more accurate calculation, not against the reality of a test site.

**Slot under the loop** (test board `slot-loop`, the same loop over a 2 × 30 mm
slot in the ground plane, without cables). Difference with versus without the slot:

| f / MHz | 20–240 | 344 | 491 | 701 | 1000 |
|---|---|---|---|---|---|
| Full wave | within ±1 dB | +1.6 | +3.2 | +6.0 | +6.9 |
| Fast calculation | +1.5 | +1.5 | +1.5 | +1.5 | +1.5 |

Below 250 MHz the full wave confirms the small result of the loop calculation for the board
alone. Above that, the slot itself radiates, which the fast calculation does not know about. The large
differences reported in the literature (10–17 dB, Wyatt) arise with connected cables, which are absent here.
The rule "gap under fast lines: high priority" therefore rests on these two mechanisms (radiation from
the slot itself and connected cables), not on the number from the loop calculation; the caveat in the explanation says so.

**Hot loop over a solid plane** (test board `buck-loop`, 40 × 30 mm, two layers,
ground plane at the bottom; port between the VIN and GND pins of the regulator, input capacitor as a short circuit;
0.2 mm mesh, |Z_in| at 20 MHz 1.5 and 1.6 Ω respectively). Bad: capacitor 14 mm away, outgoing and
return conductors both on top, loop ≈ 132 mm². Good: capacitor directly at the pins, ≈ 4 mm².

| f / MHz | 20 | 41 | 83 | 118 | 241 | 491 | 1000 |
|---|---|---|---|---|---|---|---|
| Bad (dBµV/m per A) | 13.1 | 20.8 | 31.5 | 37.2 | 48.5 | 57.8 | 66.0 |
| Good | 6.2 | 16.1 | 27.6 | 33.4 | 44.5 | 53.2 | 61.1 |
| Difference | 6.9 | 4.7 | 3.9 | 3.8 | 4.0 | 4.6 | 4.9 |

The fast calculation gives no value here (the dipole moment of the flat loop cancels with
the image current; explanation: "not quantifiable"). The full wave shows what remains: at
118 MHz the large loop lies about 47 dB below the same loop in free space (Ott formula:
84 dBµV/m per A), the small one only about 21 dB. The remainder comes from what the plane does not
compensate (component heights, via, edge of the plane) and is similar for both, hence only 4–5 dB
difference instead of the 30 dB of the area ratio. For the emission of the board alone,
the area of the hot loop over a solid plane is therefore a weak measure. Its
importance comes through the inductance (voltage spikes and ringing at the switch node, which radiates via
the node's copper and the cables) and through the near field in neighbouring circuits; the
app computes neither. The explanation of the hot loop gives these numbers.

## 11a. Diagnosis rules

- **Return path interrupted:** under a horizontal current element, the
  reference layer (the nearest plane layer; in case of a tie, the one towards the middle of the board) lacks copper over a length of at least 1 mm.
  Nearby findings of the same source (within 8 mm) are merged.
- **Reference change:** a via connects two layers on which the current path runs, and the
  planes nearest to them at this point belong to different nets (e.g. GND → +3V3).
- **Missing stitching via:** same nets, but different plane layers, and no via
  of this net connecting both layers within a radius of 3 mm.
- **Electrically long:** above f_short (§2) the source still has lines above −40 dB relative to the
  strongest one.

## 12. Known limits of stage 1 (summary)

1. No propagation-delay or resonance effects (quasi-statics, lumped lines).
2. Return current always directly underneath the outgoing path; detours around slots only as a warning.
3. Planes as ideal conductors. For 35 µm copper this is well satisfied from about 10 MHz (several
   skin depths). At the fundamentals of switching regulators (0.1–2 MHz, skin depth 50–210 µm)
   the magnetic field partly penetrates the plane, and the image effect is weaker; the model
   therefore shows too little field behind planes there.
4. No cables, no enclosure, no component parasitics (ESL, stray field of inductors).
5. Chip-internal currents only via the specified pads.
6. Sources mutually incoherent.

## 13. References

- C. R. Paul, *Introduction to Electromagnetic Compatibility*, 2nd ed., Wiley 2006.
- H. W. Ott, *Electromagnetic Compatibility Engineering*, Wiley 2009, ch. 12.
- J. D. Jackson, *Classical Electrodynamics*, 3rd ed., Wiley 1999, ch. 5 and 9.
- S. L. Hanson, S. P. Hirshman, "Compact expressions for the Biot–Savart fields of a
  filamentary segment", *Physics of Plasmas* 9 (2002) 4410.
- E. Hammerstad, Ø. Jensen, "Accurate Models for Microstrip Computer-Aided Design",
  IEEE MTT-S 1980.
- IPC-2141A, *Design Guide for High-Speed Controlled Impedance Circuit Boards*.
- H. Johnson, M. Graham, *High-Speed Digital Design*, Prentice Hall 1993.
- E. Bogatin, *Signal and Power Integrity – Simplified*, 3rd ed., 2018.
- CISPR 32:2015+A1:2019, limits for radiated emissions, class B.
