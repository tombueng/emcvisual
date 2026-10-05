# Stage 5: Advanced measurement (hand probe with tracking, probe array, phase)

As of: 2026-10-04 · Status: 5.4 source fitting implemented, otherwise an idea · Prerequisite: stage 4

## 5.1 Hand probe with optical tracking ("painting the field")

**Idea:** guide the probe by hand instead of with the printer. A camera tracks a marker on the
probe, and every measurement lands in the 3D volume together with its position. The PCB world fills up live.

- **Tracking:** ArUco/AprilTag marker on the probe handle, webcam above the board; in the
  browser with OpenCV.js or js-aruco2. Camera calibration with a chessboard; markers on the
  board (or alignment marks) for the board coordinates.
  Alternatives: VR trackers (Lighthouse), phone AR (WebXR hit test), Leap-like sensors.
- **Measurement:** as in stage 4, but continuous (tinySA in fast mode restricted to a few
  frequencies, or a HackRF sweep).
- **Volume from scattered points:** sort the measurement points into a grid (weighted
  averaging, max), fill gaps by interpolation (kriging / RBF) with an uncertainty map.
- **Advantage:** fast, intuitive, also works around enclosures and **cables** (that is where
  the common mode sits). **Disadvantage:** position and orientation errors (±1–2 mm, angle).
- **AR view:** camera image of the real board with the field overlaid (video passthrough).

## 5.2 Probe array ("EMC camera")

**Idea:** many small conductor loops on one board (e.g. 8 × 8, 5 mm pitch), switched one after
another to a receiver via RF switches. An image in seconds, without mechanics.

- Loops as trace loops on a 4-layer board, feed lines as striplines; a switch tree made of
  SP8T switches (GaAs/SOI, up to several GHz).
- Control via a microcontroller (USB), receiver as in stage 4.
- Resolution = pitch; finer by mechanically offsetting the array by fractions of it (sub-pixel scan).
- Calibration per loop (path loss) with a known field.
- The commercial precedent is the principle of scanners with a loop matrix; here as a DIY
  project (own KiCad board; fits the tool, which then checks itself).

## 5.3 Phase: coherent measurement

**Idea:** measure the phase in addition to the magnitude. Then waves can be animated, sources
reconstructed and the far field calculated from the near field.

- **Two channels:** a fixed reference probe near the source + a moving measurement probe;
  relative phase per frequency. Hardware: coherent multi-channel SDRs (e.g. KrakenSDR with 5
  coherent channels, shared clock) or two SDRs with a shared reference clock and calibration.
- **Near-field to far-field transformation:** plane-wave spectrum from the measurement plane
  (magnitude + phase) → far field; gives an estimate of the emission without an anechoic chamber.
- **Source reconstruction (inverse problem):** determine equivalent dipoles/currents from the
  measured near field (regularised least squares). These equivalent sources can be fed
  into the simulation: **measurement and simulation close the loop.**
- Without a reference channel: phase retrieval from two measurement heights (iterative
  methods) as a research option.

## 5.4 Fitting sources to the measurement (implemented 2026-10-04)

Without phase, the source reconstruction (5.3) can already be done in a simple form using
magnitudes only: the sources add up in power, so the measured power at each scan point is a
non-negative mixture of the simulated powers per source, M_i ≈ Σ_s a_s·P_si. The factors a_s
follow from non-negative least squares (Lawson-Hanson) with relative weights, so that each
point counts as a relative error.

- Sources that nowhere account for at least 1 % of the measured power count as "too weak at
  these frequencies" and keep their value.
- A weak pull towards the model value (weight 0.2 of one point) prevents spatially
  overlapping sources (a switching regulator and its inductor) from swapping power between them.
- Points within the noise of the background are left out.
- "Apply factors" scales the amplitudes; "Difference to simulation" then shows what the model
  does not explain, for example a source that is missing from the scenario.

Verified with the virtual test bench on the demo board (band 30–230 MHz, 706 points after
background subtraction): without any change all sources lie at −0.5 to 0 dB, the LED line is
too weak. After halving the amplitude of the bad clock in the model, the fit reports
+5.99 dB (expected 6.02 dB), and applying sets 3.288 V (previously 3.3 V). Code:
`src/scanner/fit.ts`, Measure tab → "Fit sources".

## Display in the PCB world
- Live filling of the volume while painting, uncertainty shown as transparency.
- Animated waves from the measured phase.
- Equivalent sources as arrows/dipoles on the board, comparable with simulated sources.

## Effort and risks
- 5.1: medium (software), biggest risk is the tracking accuracy.
- 5.2: large (own RF hardware), risk of crosstalk between loops.
- 5.3: large (calibration of coherent channels, inverse problems).

## Open questions
- Order: hand probe first (quick sense of achievement) or the array?
