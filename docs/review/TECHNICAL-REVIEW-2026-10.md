# Technical review: physical and normative statements

As of: 2026-10-05. The review covers commit `65e6776` together with the working copy of the
same day. While the review was in progress, `src/physics/currents.ts`, `src/physics/units.ts`
and `src/fullwave/job.ts` were being changed in parallel; line numbers refer to the version that
was read and may have shifted by a few lines.

Quotations of UI texts give the English string from `src/i18n/en.ts` of the reviewed commit; the
review was carried out on the German strings in `src/i18n/de.ts`, and where the German wording
matters it is given as well. Quotations from German documentation (README, PHYSICS.md,
DECISIONS.md) and the proposed German texts ("Proposal (DE)") are translated and marked as such.

## Status of implementation (2026-10-05)

| No. | Topic | Status |
|---|---|---|
| 1 | "X dB quieter when fixed" | implemented: the UI shows the effect of fixing only this one spot, with its sign; the share is now only used for ordering |
| 2 | Far field 6 dB too high | implemented: return current for the far field in the plane (`imageAt: 'plane'`), test `tests/farMoment.test.ts` |
| 3 | Limit at band edges | implemented: the stricter value at every step |
| 4 | Severity too confident | implemented: "high priority / check / low priority", explanation without a claim about the test result |
| 5 | Common-mode caveat too small | implemented: new texts, connector detection via library and reference designator, plus a common-mode estimate with cables (Clemson method) |
| 6 | Plane split, narrow slots | implemented: net per raster cell, gaps from 0.2 mm, holes judged by their extent, reporting by the actual detour; test boards `split-plane`, `narrow-slot` |
| 7, 8, 11–16, 18, 20–25, 28, 29 | Texts | implemented as proposed |
| 9 | Switching-regulator caveats | implemented (ringing, inductor), plus a "hot loop" finding based on loop area |
| 10 | Thinning with √k | implemented: the limit comparison uses the amplitude of the individual line |
| 17 | Skew in pairs | implemented as a caveat, not computed |
| 19 | Hatching in PHYSICS.md | text corrected, hatching not implemented |
| 26, 27 | Formula text, sum | implemented |

## Scope and approach

Read: `src/report/explain.ts`, `src/report/texts.ts`, `src/report/report.ts`,
`src/i18n/de.ts`, `src/i18n/en.ts` (all technical texts), `src/physics/*.ts` (farfield,
attribution, severity, standards, diagnostics, returnPaths, biotsavart, images, currents,
spectrum, lines, sources, suggest, charges, efield, units), `src/model/planes.ts`,
`src/scanner/probe.ts`, `tools/openems/run_job.py` (far field), `docs/stage-1/PHYSICS.md`,
`docs/future/STAGE-2-*.md`, `docs/future/STAGE-3-*.md`, `docs/DECISIONS.md`,
`docs/CI-FIELD-CHECK.md`, `README.md`.

Formulas were recalculated, and some statements were checked with small calculations following
the logic of the code (dipole moment with image, limit at band edges, thinning of the spectrum).
Limits were checked against freely accessible versions of the standards or the legal texts
(sources at the end and with each finding).

Verdicts:

- **wrong**: the statement or calculation is factually wrong.
- **misleading**: formally defensible, but leads to a wrong conclusion.
- **worded too confidently**: right direction, but without the necessary uncertainty.
- **missing caveat**: the text does not say why the number can be wrong here.
- **ok but imprecise**: correct at its core, should become more precise.

## Summary

The foundations are sound: the trapezoid spectrum, the line formulas, the constant for loop
radiation, the dB conversions and almost all limits are correct. The most serious problems lie
where the model is turned into a statement about the compliance test or about the effect of a
change:

1. "X dB quieter when fixed" is not the effect of the fix but a share measured against an ideal
   source. The demo's own numbers contradict the statement.
2. For traces over a plane, the far field is systematically about 6 dB too high (image current
   plus floor factor).
3. At band edges the code takes the looser limit; the standards prescribe the stricter one. This
   amounts to up to 8 dB, exactly at very common harmonics (230 MHz, 960 MHz, 1 GHz).
4. Severity and texts ("decides the test", "minor", in German „unauffällig“, i.e.
   "inconspicuous") promise more than a pure differential-mode model without cables can deliver.
5. The diagnostics do not see the classic plane split (two nets on one plane layer) or narrow
   slots under 1 mm; afterwards "Nothing conspicuous" appears.

---

## Findings (ordered by severity)

### 1. "3 m: X dB quieter when fixed" is not the effect of the fix

- **Location:** `src/physics/attribution.ts:64–67` (calculation), `src/report/explain.ts:109–115`
  (line "Fixed: …"), `src/report/texts.ts:86–91`, `src/i18n/de.ts:202, 467, 476`,
  `src/i18n/en.ts:202, 467, 476`, `README.md:41–42`, `docs/DECISIONS.md:84–87`.
- **Statement:** en.ts:202 "3 m: ${v} quieter when fixed"; en.ts:467 "Fixed, the source gets
  ${g} quieter at 3 m (every spectral line alike)."; en.ts:476 "Fixed: |m| ≈ …, every line
  ${g} lower; the strongest line would be at … dBµV/m, i.e. …". README (translated): "11 dB
  quieter when fixed".
- **Verdict:** wrong.
- **Why:** `gainDb` is `20·log10(|m_ideal + Δm_k| / |m_ideal|)`, i.e. the effect of this one
  problem **if all the others were already fixed**. What the text claims would be
  `20·log10(|m_now| / |m_now − Δm_k|)` (fixing only this spot). The two quantities differ as
  soon as a source has more than one finding. The project's own documentation shows this: in
  `docs/future/STAGE-2-PLANE-CURRENTS.md:56–60, 68–69` the three findings of the bad clock have
  11.1 dB, 3.3 dB and 0.9 dB, but all of them fixed together give only 7.9 dB; fixing only the
  near jump even makes the source 4 dB **louder**. The UI nevertheless says "11.1 dB quieter
  when fixed" for the first finding, and `explain.ts:111` uses `momentNow / 10^(g/20)` to derive
  from it a margin to the limit "when fixed" that is larger than the margin when everything is
  fixed. On top of that, all these dB values apply only in the differential-mode model (see
  findings 4 and 5).
- **Fix in the code:** `moment(withFixed(elements, d))` is already computed in
  `attribution.ts:65`; the real individual effect `20·log10(|m_now| / |m_fixed_k|)` (can be
  negative) and the effect "all return paths fixed" (`returnPathsDb`) can be shown directly. The
  existing quantity remains useful as a sort key.
- **Proposal (DE, translated):**
  - `diag.gainFinding`: "3 m, model (differential mode only): share of this finding ${v}"
  - `explain.fig.gain`: "This finding alone, with otherwise ideal return paths, makes the source
    ${g} louder at 3 m in the differential-mode model. This orders the findings; it does not
    predict how much quieter the source gets when only this spot is fixed. Several findings do
    not add up; the effect of fixing a single one can be smaller, larger or even negative."
  - `explain.calc.fixed`: "Only this spot fixed: |m| = … mm², strongest line … dBµV/m (…).
    All return paths of this source fixed: … dB lower."
  - README: "… ordered by their share of the computed far field (differential mode, 3 m) …"
  - DECISIONS no. 31: "… This puts at the top what matters most in the differential-mode
    model."
- **Proposal (EN):**
  - `diag.gainFinding`: "3 m, model (differential mode only): share of this finding ${v}"
  - `explain.fig.gain`: "This finding alone, with all other returns ideal, makes the source
    ${g} louder at 3 m in the differential-mode model. This orders the findings; it does not
    predict how much quieter the source gets when only this spot is fixed. Findings do not add
    up, and fixing one alone can help less, more, or even make it worse."
  - `explain.calc.fixed`: "Only this spot fixed: |m| = … mm², strongest line at … dBµV/m (…).
    All return paths of this source fixed: … dB lower."
- **Sources:** the project's own documentation (`STAGE-2-PLANE-CURRENTS.md:56–70`).

### 2. Far field: image current and floor factor together, about 6 dB too high

- **Location:** `src/physics/farfield.ts:1–5, 12–33, 41–47`, `src/physics/images.ts:169–176`,
  `docs/stage-1/PHYSICS.md:256–272`, `src/i18n/de.ts:473–474`, `src/i18n/en.ts:473–474`.
- **Statement:** PHYSICS.md:270–272 (translated): "Properties the model reproduces correctly: … a
  trace with its return current in the plane forms a vertical loop whose moment is doubled by
  the image."; en.ts:473 "… the effective loop area, with image currents …"; en.ts:474
  "E = 2 · η0 · k² · |m| · I / (4π · r) … factor 2 for the reflection off the test-site floor
  (Ott, eq. 12-2)".
- **Verdict:** wrong (systematically about +6 dB for all lines over a plane, i.e. almost all
  clock and data sources).
- **Why:** Ott, eq. 12-2 (E = 263·10⁻¹⁶ · f² · A · I / r) uses the actual loop area for A, i.e.
  for a trace over the plane length × height h, and already contains the factor 2 for the floor.
  The app computes |m| from the trace **and the image at 2·y_F − y**, i.e. an area of 2·h·L, and
  then multiplies by 2 once more. Recalculated with the formula from `dipoleMoment()`: a 50 mm
  trace at h = 0.2 mm gives |m| = 20 mm² instead of 10 mm²; at 10 mA and 100 MHz at 3 m the app
  shows 24.9 dBµV/m, Ott's formula 18.9 dBµV/m.
  Imaging replaces a plane for the far field only if the plane is much larger than the
  wavelength (LearnEMC: "If the planes are much larger than a wavelength …"). At 30–300 MHz a
  board plane measures λ/10 to λ/100; for the far field, what counts then is the actual return
  current in the plane, m = h·L·I. The full wave (`tools/openems/run_job.py:329–330`) computes
  the finite board in free space and only multiplies by 2 for the floor; the fast model and the
  full wave should therefore differ by about 6 dB in the far field of a microstrip line (worth a
  test). For striplines (planes on both sides), first-order imaging yields a moment of about
  1.5 × (h·L) without a clear physical meaning. Incidentally, the calculation contradicts the
  app's own explanatory text en.ts:531 ("from afar the two nearly cancel and only a very flat
  loop remains"), which describes the physically correct picture.
- **Fix in the code:** For the dipole moment (far field only), place the return current at the
  plane height y_F instead of at 2·y_F − y; keep the images for the near field. Check against the
  openEMS far fields of a microstrip line and of a flat loop.
- **Proposal (DE, translated):**
  - `explain.calc.moment`: "Magnetic dipole moment per ampere of reference current from forward
    and return current (return current in the reference plane under the line, with detours):
    |m| = ${mm2} mm²."
  - `explain.calc.formula`: "Every spectral line I radiates at 3 m with E = 2 · η0 · k² · |m| · I
    / (4π · r), k = 2π f / c, r = 3 m; the factor 2 is the worst-case reflection off the floor of
    the test site (Ott, eq. 12-2). Valid for electrically small structures and only for the
    differential-mode part."
  - PHYSICS.md:270–272: "Over an infinitely large plane the image doubles the moment of a
    vertical loop in the half-space above it. Below a few hundred MHz a board plane is much
    smaller than λ; for the far field, what counts then is the actual return current in the
    plane, and the loop area is h·L, not 2·h·L."
- **Proposal (EN):**
  - `explain.calc.moment`: "Magnetic dipole moment per ampere of reference current from forward
    and return current (return in the reference plane under the line, with detours):
    |m| = ${mm2} mm²."
  - `explain.calc.formula`: "Every spectral line I radiates at 3 m with E = 2 · η0 · k² · |m| · I
    / (4π · r), k = 2π f / c, r = 3 m; the factor 2 is the worst-case reflection off the test-site
    floor (Ott, eq. 12-2). Valid for electrically small structures and for the differential mode
    only."
- **Sources:** https://learnemc.com/electromagnetic-radiation ;
  https://micro.rohm.com/en/techweb/knowledge/emc/s-emc/01-s-emc/6899 (formula with A =
  loop area); H. W. Ott, *Electromagnetic Compatibility Engineering*, Wiley 2009, ch. 12.

### 3. Limit at band edges: the code takes the looser value

- **Location:** `src/physics/farfield.ts:69–72` (`limitAt`), the same logic in
  `src/ui/spectrumSvg.ts:40`; tables in `src/physics/standards.ts:28–106`.
- **Statement (code):** `limits.find((x) => f >= x.f0 && f < x.f1)`.
- **Verdict:** wrong.
- **Why:** CISPR 32 (Annex A): "Where there is a step in the relevant limit, the lower value
  shall be applied at the transition frequency." CISPR 11 (clause 6.1): "The lower limit shall
  apply at all transition frequencies." FCC §15.109: "the tighter limit applies at the band
  edges." Harmonics of common clocks fall exactly on these edges, and the strongest line
  decides margin, severity and order. Recalculated with the code's logic:

  | Harmonic | Standard | Code | correct | Error |
  |---|---|---|---|---|
  | 10 MHz × 23 = 230 MHz | CISPR 32 B, 3 m | 47 | 40 dBµV/m | 7 dB too loose |
  | 24/48/12 MHz → 960 MHz | FCC B, 3 m | 54 | 46 dBµV/m | 8 dB too loose |
  | 24 MHz × 9 = 216 MHz | FCC B, 3 m | 46 | 43.5 dBµV/m | 2.5 dB too loose |
  | 8 MHz × 11 = 88 MHz | FCC B, 3 m | 43.5 | 40 dBµV/m | 3.5 dB too loose |
  | 25/50/100 MHz → 1 GHz | CISPR 32 B, 3 m | 50 (average above 1 GHz) | 47 dBµV/m (QP) | 3 dB too loose |

- **Fix in the code:** limit = minimum over all segments with `f0 ≤ f ≤ f1`; at exactly
  1 GHz the quasi-peak table.
- **Proposal (DE, translated)** for `standards.common`, addition: "At band edges the stricter
  value applies."
- **Proposal (EN):** "At band edges the tighter limit applies."
- **Sources:** https://nobelcert.com/DataFiles/FreeUpload/BS%20EN%2055032-2015%20plus%20Cor2016%20plus%20A11-2020.pdf
  (Annex A); https://cdn.standards.iteh.ai/samples/15070/2cded154aefd4da09343d754b7778721/CISPR-11-2009.pdf
  (clause 6.1); https://www.law.cornell.edu/cfr/text/47/15.109

### 4. Severity: "red decides the test", "green … minor"

- **Location:** `src/i18n/de.ts:613–616`, `src/i18n/en.ts:613–616`, `src/physics/severity.ts:1–7,
  19–24`, speech bubbles (green only as a dot, commit 65e6776), `docs/DECISIONS.md:84–87`,
  `README.md:142–145`.
- **Statement:** en.ts:616 "Severity: red decides the test … green radiates but does not stand
  out."; en.ts:615 "minor" (de.ts:615 „unauffällig“, literally "inconspicuous"); severity.ts:3
  "1 (red: this decides whether the board passes)"; README:142 (translated): "It shows reliably
  where current loops create fields and how changes affect them".
- **Verdict:** worded too confidently / misleading.
- **Why:** The number comes solely from the margin between the **differential-mode model** and
  the limit (0 from 20 dB below the limit). Predictions from differential-mode currents alone
  "can bear little resemblance to actual measured emissions" (Paul 1989); tests fail "almost
  always" because of common-mode currents (LearnEMC). On top of that come the assumptions on
  amplitude, edge and load (±6 to 20 dB), finding 2 (+6 dB) and finding 3 (up to −8 dB). A green
  "minor" (German „unauffällig“) at a 15 dB margin in the differential-mode model says nothing
  about the test result. Because green bubbles appear only as dots since commit 65e6776, the
  label actively hides the issue. The README sentence, too, applies only to differential-mode
  loop fields: how a change affects common-mode currents (e.g. when crossing a plane split) is
  not shown by the calculation.
- **Proposal (DE, translated):**
  - Levels: "high priority", "medium priority", "low priority".
  - `severity.scale`: "Priority in the differential-mode model: red = in the model the source is
    near or above the limit (3 m) and this finding contributes a lot to that; yellow = take a
    look; green = far below the limit in the model. This orders the work and says nothing about
    the test result: common-mode currents on cables and on the board itself are not computed and
    often exceed the differential-mode emission by 20 dB and more."
  - README:142: "It shows where current loops create magnetic fields and how changes to loop
    area, return path and edges affect these fields. It does not compute common-mode currents,
    which are what most tests fail on."
- **Proposal (EN):**
  - Levels: "high priority", "medium priority", "low priority".
  - `severity.scale`: "Priority in the differential-mode model: red = the source is near or over
    the limit at 3 m in the model and this finding contributes a lot; yellow = worth a look;
    green = far below the limit in the model. This orders the work and says nothing about the
    test result: common-mode currents on cables and on the board itself are not computed and
    often exceed the differential-mode emission by 20 dB or more."
- **Sources:** https://ieeexplore.ieee.org/document/18789/ (C. R. Paul, IEEE TEMC 31, 1989);
  https://learnemc.com/electromagnetic-radiation

### 5. Common-mode caveat too small, "upper estimate" not tenable

- **Location:** `src/i18n/de.ts:484–487` (`doubt.cables`), `de.ts:492` (`doubt.detector`), `de.ts:199–200`
  (`farHint`, `margin`), `de.ts:373` (`callouts.far`); likewise en.ts; `src/report/explain.ts:131–132`
  (counting connectors).
- **Statement:** en.ts:486 "Common-mode currents on cables often radiate 10–20 dB more than the
  board itself" (de.ts adds "in practice"); without connectors, en.ts:487: "Once cables are
  attached, their common-mode currents often dominate."; detector, en.ts:492: "For the board
  alone that is rather an upper estimate."
- **Verdict:** worded too confidently.
- **Why:**
  1. Magnitude: according to Paul (1989), common-mode currents in the µA range produce as much
     field as differential-mode currents in the mA range; LearnEMC works out a 64 dB difference
     for a pair of conductors. With Ott's common-mode formula (E = 12.6·10⁻⁷ · f · L · I / r),
     about 2 µA on 1 m of cable at 100 MHz already reach 40 dBµV/m at 3 m. "10–20 dB"
     underestimates the typical difference.
  2. Even without cables a board radiates in common mode: the return current produces a voltage
     across the partial inductance of the plane (current-driven), and the signal voltage couples
     capacitively to the plane, heat sink and enclosure (voltage-driven) (Hockanson/Hubing 1996,
     Shim/Hubing 2005). In the test set-up every device has at least one supply lead. "Upper
     estimate" therefore holds only for the differential-mode part.
  3. `explain.ts:131` counts connectors with `/^(J|P|CN|X)\d/`; reference designators such as
     "USB1", "CON1" or "K1" slip through, and then the text for boards without cables appears
     by mistake.
  4. Margins ("12 dB margin") appear in speech bubbles and in the report without any qualifier.
- **Proposal (DE, translated):**
  - `doubt.cables` (with connectors): "Attached cables are missing from the calculation (the
    board has ${n} connectors). Common-mode currents on cables often exceed the
    differential-mode emission of the board by 20 dB and more; just a few µA of common-mode
    current on 1 m of cable reach the limit at 100 MHz. The result is then far too favourable."
  - `doubt.cables` (without): "Cables are missing from the calculation. Even without cables a
    board radiates through common-mode paths the model does not know: voltage drop across the
    plane, coupling to heat sink and enclosure, the supply lead in the test set-up."
  - `doubt.detector`: "The test measures with a quasi-peak detector (equal to the peak value for
    a stable clock line), turns the EUT and moves the antenna up and down; the calculation takes
    the strongest direction with full floor reflection. For the differential-mode part of the
    board that is rather an upper estimate; it says nothing about the total emission of the
    device."
  - `diag.margin`: "${db} dB over the limit (model)" / "${-db} dB margin (model, differential
    mode only)".
- **Proposal (EN):**
  - `doubt.cables` (with connectors): "Attached cables are not in the calculation (the board has
    ${n} connectors). Common-mode currents on cables often exceed the board's differential-mode
    emission by 20 dB or more; a few µA of common-mode current on 1 m of cable reach the limit at
    100 MHz. The result is then far too optimistic."
  - `doubt.cables` (none): "Cables are not in the calculation. Even without cables a board
    radiates through common-mode paths the model does not know: voltage drop across the plane,
    coupling to heat sinks and enclosure, the supply lead in the test set-up."
  - `doubt.detector`: "… For the board's differential-mode part that is rather an upper estimate;
    it says nothing about the emission of the whole device."
  - `diag.margin`: "${db} dB over the limit (model)" / "${-db} dB margin (model, differential mode
    only)".
- **Sources:** https://ieeexplore.ieee.org/document/18789/ ; https://learnemc.com/electromagnetic-radiation ;
  https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/pcb_es_pubs.html (Hockanson, Drewniak,
  Hubing et al., IEEE TEMC 38(4), 1996);
  https://www.researchgate.net/publication/3056826_Model_for_Estimating_Radiated_Emissions_From_a_Printed_Circuit_Board_With_Attached_Cables_Due_to_Voltage-Driven_Sources ;
  Ott 2009, ch. 12 (common-mode radiation).

### 6. Diagnostics miss plane splits and narrow slots, then report "Nothing conspicuous"

- **Location:** `src/model/planes.ts:4–7, 43, 70, 77`, `src/physics/diagnostics.ts:38, 202`,
  `src/physics/returnPaths.ts:50, 163`, `src/physics/images.ts:28–32`, `src/i18n/de.ts:178, 508,
  518`, `src/i18n/en.ts:180, 508, 518`, `docs/stage-1/PHYSICS.md:194–197`.
- **Statement:** planes.ts:5–7 "Copper of other nets with large pours on the same layer (split
  planes: GND and 3V3 side by side) joins the coverage raster, because for AC return currents any
  solid copper is a reference."; en.ts:180 "Nothing conspicuous for the active sources."
- **Verdict:** missing caveat (false negatives).
- **Why:**
  1. A line over the boundary between a GND plane and a 3V3 plane on the same layer is the
     textbook mistake "line over a plane split". Because both nets lie in one raster, the only
     gap left is the zone clearance (typically 0.2–0.5 mm). Gaps shorter than 1 mm along the
     line are ignored (`MIN_GAP`) and bridged in the image model (`minGap`). A perpendicular
     crossing is therefore not reported and is computed as if the return current could flow on
     from GND copper into 3V3 copper.
  2. The same applies to every slot narrower than 1 mm, for example a line in the plane layer
     (0.2 mm trace + 2 × 0.25 mm clearance = 0.7 mm slot). That is exactly what en.ts:518 warns
     about ("every line in the plane is a slot").
  3. Closed holes under 3 mm² are filled. A slot of 0.3 × 9 mm (2.7 mm²) or a row of merged via
     clearances disappears, although the return current has to detour by 4.5 mm. What matters is
     the length across the line, not the area.
  4. PHYSICS.md:195 gives 50 % coverage as the threshold for a plane layer; the code uses 25 %
     and additionally counts all planes of other nets from 5 %.
- **Fix in the code:** Treat net boundaries within a plane layer as a gap (raster with a net ID),
  rate gaps by detour length instead of by length along the line, fill holes by their largest
  extent instead of by area.
- **Proposal (DE, translated):**
  - `diag.none` (until this is fixed): "None of the checked problems (gaps of 1 mm or more under
    the line, reference changes at vias, missing stitching vias, electrically long lines).
    Not checked: slots and plane splits under 1 mm, transitions between two nets on the same
    plane layer, cables, connectors, heat sinks."
  - `explain.kinds.gapDetour.detected`, addition: "Slots that are crossed where they are narrower
    than 1 mm, holes under 3 mm² and boundaries between two nets on the same plane layer are not
    detected by the app, even if the detour is long."
  - PHYSICS.md:195: adapt the threshold to the code (25 %, plus planes of other nets from 5 %).
- **Proposal (EN):**
  - `diag.none`: "None of the checked problems (gaps of 1 mm or more under the line, reference
    changes at vias, missing stitching vias, electrically long lines). Not checked: slots and plane
    splits narrower than 1 mm, transitions between two nets on the same plane layer, cables,
    connectors, heat sinks."
  - `gapDetour.detected`, addition: "Slots crossed where they are narrower than 1 mm, holes
    under 3 mm² and borders between two nets on the same plane layer are not detected, even if
    the detour is long."
- **Sources:** https://learnemc.com/the-most-important-emc-design-guidelines ("Don't Split, Gap
  or Cut the Signal Return Plane");
  https://www.pcdandf.com/pcdesign/index.php/2007-archive-articles/2236-effects-of-plane-splits-on-high-speed-signals-part-1

### 7. FCC versus CISPR: the comparison in the standard's description is wrong

- **Location:** `src/i18n/de.ts:640`, `src/i18n/en.ts:640`.
- **Statement:** de.ts:640 (translated): "The bands are graded more finely than in CISPR, so FCC
  is somewhat differently strict between 30 and 88 MHz and between 216 and 230 MHz." / en.ts:640:
  "… so FCC is a bit stricter or looser between 30 and 88 MHz and between 216 and 230 MHz."
- **Verdict:** wrong.
- **Why:** Class B, 3 m: 30–88 MHz is 40 dBµV/m for both, i.e. the same. The differences lie
  elsewhere: 88–216 MHz FCC 43.5 versus 40 (FCC 3.5 dB looser), 216–230 MHz 46 versus 40 (6 dB
  looser), 230–960 MHz 46 versus 47 (FCC 1 dB stricter), 960–1000 MHz 54 versus 47 (7 dB
  looser), 1–3 GHz average 54 versus 50 (4 dB looser), 3–6 GHz the same (54).
- **Proposal (DE, translated):** "… The bands are graded differently from CISPR 32 class B at 3 m:
  30–88 MHz the same (40 dBµV/m), 88–230 MHz FCC is 3.5 to 6 dB looser, 230–960 MHz 1 dB
  stricter, 960–1000 MHz 7 dB looser, 1–3 GHz 4 dB looser. At band edges the stricter value
  applies."
- **Proposal (EN):** "… The bands are split differently from CISPR 32 class B at 3 m:
  30–88 MHz is the same (40 dBµV/m), 88–230 MHz FCC is 3.5 to 6 dB looser, 230–960 MHz 1 dB
  stricter, 960–1000 MHz 7 dB looser, 1–3 GHz 4 dB looser. At band edges the tighter limit
  applies."
- **Sources:** https://www.law.cornell.edu/cfr/text/47/15.109 ; https://www.law.cornell.edu/cfr/text/47/15.35 ;
  https://emccalc.com/limits/en55032-class-b-re/

### 8. Full wave "without approximation"

- **Location:** `src/i18n/de.ts:300`, `src/i18n/en.ts:300`, `docs/future/STAGE-3-FULL-WAVE.md:7`,
  `README.md:55–58`.
- **Statement:** en.ts:300 "Solves Maxwell's equations without approximation (resonances,
  radiation)."
- **Verdict:** wrong.
- **Why:** FDTD is a discrete approximation, and the model simplifies a lot: grid 0.5–1 mm
  (0.2 mm traces as thin wires), copper as a perfect conductor without thickness (no conductor
  losses, resonances too sharp), dielectric losses only at one reference frequency, the run stops
  at −30 dB residual energy, excitation as a port with 33 Ω or 10 Ω, receivers as a capacitance,
  capacitors in the loop as ideal shorts (without ESL and ESR), switches as a resistor (no
  ringing with Coss), no inductors, no cables, no enclosure. The current spectrum still comes
  from the source model. README:57–58 (translated: "both agree to within about 1 dB") applies to
  the near field over a loop; a far-field comparison is missing (see finding 2).
- **Proposal (DE, translated):** "Solves Maxwell's equations numerically (FDTD), without the
  approximations of the fast model: delays, resonances and the radiation of the board are
  included. Limits: grid 0.5–1 mm, copper as a perfect conductor (resonances rather too sharp),
  parts simplified (capacitors as shorts, switches as resistors, no inductors), no cables,
  no enclosure; the current spectrum still comes from the source model. …"
- **Proposal (EN):** "Solves Maxwell's equations numerically (FDTD), without the approximations
  of the fast model: delays, resonances and the board's radiation are included. Limits: 0.5–1 mm
  grid, copper as a perfect conductor (resonances rather too sharp), simplified parts (capacitors
  as shorts, switch as a resistor, no inductors), no cables, no enclosure; the current spectrum
  still comes from the source model. …"
- **Sources:** `tools/openems/run_job.py` (PEC copper, PML, NF2FF), `src/fullwave/job.ts`
  (ports, shorts), `tools/openems/README.md`.

### 9. Switching regulators: ringing of the hot loop and high-frequency content of the inductor are missing, without a caveat

- **Location:** `src/report/explain.ts:121, 141`, `src/physics/sources.ts:61–62` (`STRAY_TURNS`),
  `inductorModel()` in `src/physics/currents.ts`, `src/physics/suggest.ts:128, 149`,
  `src/i18n/de.ts:531`, `src/i18n/en.ts:531`.
- **Statement:** The trapezoid caveat (de.ts:491) appears only for clock and data sources
  (`explain.ts:141`). en.ts:531: "In switching regulators the hot loop … is the strongest source
  on the board." The turn counts of the inductor (open 12, semi-shielded 4, shielded 0.8) appear
  only in `docs/future/STAGE-2-PLANE-CURRENTS.md:91–92`, as "rough empirical values"
  (translated).
- **Verdict:** missing caveat; "the strongest source" worded too confidently.
- **Why:** The loop current is an ideal trapezoid (default 5 ns). In reality the edge rings on
  with the inductance of the hot loop and the output capacitance of the switches; TI states
  "broadband EMI in the 50- to 200-MHz range" for this. This resonance peak is often well above
  the trapezoid envelope and frequently decides the 30–230 MHz band. The inductor is computed
  only with the triangular ripple current; its harmonics fall at 40 dB/decade above the
  switching frequency, and at 500 kHz the line at 30 MHz is about 70 dB below the fundamental.
  In the model the inductor therefore contributes practically nothing to the CISPR band; in
  practice the edges of the switch node couple through the winding capacitance. In addition, a
  horizontal equivalent loop over a plane is almost cancelled by its image. TI names three main
  paths of interference: the lines at the input, the magnetic field of the loop and the
  electric field of the switch node; "the strongest source" is therefore a generalisation.
- **Proposal (DE, translated):**
  - New caveat for current loops: "The loop current is an ideal trapezoid. Real switching edges
    ring on with the inductance of the hot loop and the capacitance of the switches, mostly
    between 50 and 200 MHz. This resonance peak is often well above the trapezoid envelope and
    is not computed."
  - For inductors: "The effective number of turns of the stray field (open 12, semi-shielded 4,
    shielded 0.8) is a rough empirical value, not manufacturer data; the uncertainty is not
    quantified. Only the triangular ripple current is computed; the coupling of the switch-node
    edges through the winding capacitance, which dominates above a few MHz, is missing."
  - de.ts:531: "… the 'hot loop' … is often one of the strongest sources on the board; in
    addition there are the electric field of the switch node and interference that flows out
    through the input lines."
- **Proposal (EN):**
  - Loops: "The loop current is an ideal trapezoid. Real switching edges ring with the hot-loop
    inductance and the switch capacitance, mostly between 50 and 200 MHz. That resonance peak is
    often well above the trapezoid envelope and is not computed."
  - Inductors: "The effective turns of the stray field (open 12, semi-shielded 4, shielded 0.8)
    are a rough rule of thumb, not manufacturer data; the uncertainty is not quantified. Only the
    triangular ripple current is computed; coupling of the switch-node edges through the winding
    capacitance, which dominates above a few MHz, is missing."
  - en.ts:531: "… the hot loop … is often one of the strongest sources on the board, along with
    the electric field of the switch node and noise conducted out on the input lines."
- **Sources:** https://www.ti.com/lit/pdf/slyt682 (T. Hegarty, "Reduce buck-converter EMI and
  voltage stress by minimizing inductive parasitics", Analog Applications Journal 3Q 2016).

### 10. Spectrum: thinning with √k distorts individual lines, measurement bandwidth is missing

- **Location:** `src/physics/spectrum.ts:50–68` (likewise `triangleLines` 92–109),
  `docs/stage-1/PHYSICS.md:69–73`; comparison with the limit in `src/report/texts.ts:48–68`.
- **Statement:** PHYSICS.md:72–73 (translated): "… every k-th line is kept (k odd) and scaled by
  √k: the power in every band is preserved …"
- **Verdict:** wrong for the comparison with the limit (correct only for band powers).
- **Why:** Limits apply to the reading of the receiver in a 120 kHz bandwidth below 1 GHz and
  1 MHz above, not to band powers. If the lines are further apart than the bandwidth, each line
  stands alone and must not be scaled; √k raises every kept line by 10·log10(k) dB. Recalculated
  with the default for switching regulators (500 kHz, duty cycle 0.3, 5 ns, 1 A): strongest line
  in 30–230 MHz with "Spectrum up to 1 GHz" 76.4 dBµA, with "up to 6 GHz" (k = 3) 80.0 dBµA.
  Margin, severity and order thus change by 3.5 dB just because the display range was changed.
  Conversely, if f0 is smaller than the bandwidth (regulators under 120 kHz; above 1 GHz,
  everything under 1 MHz), the receiver combines several lines; for a periodic signal they add up
  in phase, and the line-by-line comparison shows too little.
- **Fix in the code:** For the limit comparison, use unscaled lines (leaving lines out is
  harmless there); for f0 below the bandwidth, add up the amplitudes within one bandwidth.
- **Proposal (DE, translated)** (PHYSICS.md and `standards.common`): "Each spectral line is
  compared with the limit individually. This corresponds to the receiver (120 kHz bandwidth
  below 1 GHz, 1 MHz above) as long as the fundamental frequency is greater than this bandwidth;
  below that the receiver combines several lines and reads more than the calculation."
- **Proposal (EN):** "Each spectral line is compared with the limit on its own. That matches
  the measuring receiver (120 kHz bandwidth below 1 GHz, 1 MHz above) as long as the fundamental
  is above that bandwidth; below it the receiver combines several lines and reads higher than the
  calculation."
- **Sources:** https://www.law.cornell.edu/cfr/text/47/15.35 ;
  https://emccalc.com/limits/en55032-class-b-re/ (detectors and bandwidths per range).

### 11. "Cut-outs … usually under the switch node"

- **Location:** `src/i18n/de.ts:537`, `src/i18n/en.ts:537`.
- **Statement:** en.ts:537 "Cut-outs only where the datasheet asks for them (usually under the
  switch node, not under the loop)."
- **Verdict:** wrong / misleading.
- **Why:** For multilayer boards TI explicitly recommends a continuous GND plane under the switch
  node: "A full ground plane under the SW node contributes a very small increase in
  SW-to-GND parasitic capacitance, but is recommended …". The usual keep-out concerns copper on
  the component layer under the inductor (coupling SW → VOUT), not the GND plane under the
  switch node. A cut-out there takes away the shield for the electric field of the node.
- **Proposal (DE, translated):** "Make the layer directly under the hot loop and under the switch
  node a continuous GND plane. Cut-outs only where the datasheet explicitly requires them; the
  usual keep-outs concern copper on the component layer under the inductor, not the GND
  plane."
- **Proposal (EN):** "Make the layer right under the hot loop and under the switch node a
  continuous GND plane. Cut-outs only where the datasheet explicitly asks for them; the usual
  keep-out is top-layer copper under the inductor, not the GND plane."
- **Sources:** https://www.ti.com/lit/pdf/slyt682

### 12. Bridge and stitching capacitors: limited effect, value secondary, plane capacitance judged wrongly

- **Location:** `src/i18n/de.ts:411, 413, 512, 564, 570`, `src/i18n/en.ts:411, 413, 512, 564, 570`.
- **Statement:** en.ts:512 "a stitching capacitor (e.g. 100 nF, 0402) across the gap" (de.ts:512:
  „Brückenkondensator“, i.e. bridge capacitor); en.ts:564 "a capacitor (100 nF, 0402) … right at
  the signal via (less than 2 mm)"; en.ts:570 "Do not rely on the capacitance between the planes
  alone: at high frequencies it is a resonator, not a connection."
- **Verdict:** missing caveat (capacitors); misleading (plane capacitance).
- **Why:** Above the self-resonance the mounting inductance determines the impedance, not the
  value ("It's really the inductance that matters"). Archambeault's tables give about 0.9–3 nH for
  an 0402 with vias; 1.5 nH is 2.8 Ω at 300 MHz and 9.4 Ω at 1 GHz. Bridge capacitors therefore
  help mainly up to a few hundred MHz and only directly at the crossing (in the experiments cited
  by PCD&F they were ineffective at 600 MHz from a distance of about 12 mm). In the range where
  individual capacitors fail, it is precisely the capacitance between the planes that carries
  the return current, the better the thinner the dielectric. "Not a connection" is therefore the
  opposite of the usual textbook view; what is right is the warning about cavity resonances.
- **Proposal (DE, translated):**
  - de.ts:512: "If the line has to cross: a bridge capacitor across the gap, directly at the
    crossing, with short, closely spaced vias. From about 100 MHz the inductance of package and
    vias (about 1–3 nH) increasingly limits the effect; the capacitance value is secondary there.
    Not crossing the gap is always better."
  - de.ts:564: "If the change has to stay: a capacitor between ${planeNet} and ${otherNet}
    directly at the signal via (less than 2 mm), small package, short vias. It works up to a few
    hundred MHz; above that it is mainly the capacitance between the planes that carries the
    return current."
  - de.ts:570: "At high frequencies the capacitance between the planes carries a large part of
    the return current, the more so the thinner the dielectric. At its cavity resonances,
    however, it becomes high-impedance; relying on it alone is risky."
  - `focus.suggest.capPlanes` / `bridgeCap`: replace "100 nF" with "capacitor, small package,
    short vias".
- **Proposal (EN):**
  - en.ts:512: "If the line has to cross: a stitching capacitor across the gap, right at the
    crossing, with short, closely spaced vias. From about 100 MHz the inductance of package and
    vias (about 1–3 nH) increasingly limits it; the capacitance value hardly matters there. Not
    crossing the gap is always better."
  - en.ts:564: "If the change has to stay: a capacitor between ${planeNet} and ${otherNet} right
    at the signal via (less than 2 mm), small package, short vias. It works up to a few hundred
    MHz; above that the capacitance between the planes carries most of the return."
  - en.ts:570: "At high frequencies the capacitance between the planes carries much of the return
    current, the more the thinner the dielectric. At its cavity resonances it becomes high
    impedance, so relying on it alone is risky."
- **Sources:** https://ewh.ieee.org/r3/enc/emcs/archive/2012-10-10b_DecouplingMyths.pdf
  (B. Archambeault, "PCB Power Decoupling Myths Debunked", 2012);
  https://www.pcdandf.com/pcdesign/index.php/2007-archive-articles/2236-effects-of-plane-splits-on-high-speed-signals-part-1 ;
  https://www.researchgate.net/publication/4037266_Effect_of_stitching_capacitor_distance_for_critical_traces_crossing_split_reference_planes

### 13. "Split planes only where no fast signals cross"

- **Location:** `src/i18n/de.ts:511`, `src/i18n/en.ts:511`.
- **Verdict:** misleading.
- **Why:** The sentence presents splitting the reference plane as a normal tool. Hubing/LearnEMC:
  "Don't Split, Gap or Cut the Signal Return Plane … Just don't do it!" Analogue and digital
  sections are separated by placement, not by slots. Separate supply islands are something
  else, but must not serve as the reference for fast signals.
- **Proposal (DE, translated):** "Close the gap or make the plane under the line continuous. As a
  rule, do not split the reference plane (usually GND); separate the analogue and digital
  sections by placement, not by slots. Separate supply islands only on layers that do not serve
  as the reference for fast signals."
- **Proposal (EN):** "Close the gap, or make the plane continuous under the line. Do not split
  the return plane (usually GND) at all; separate analog and digital by placement, not by slots.
  Split supply islands only on layers that fast signals do not use as reference."
- **Sources:** https://learnemc.com/the-most-important-emc-design-guidelines

### 14. Shortest return path: direction of the deviation probably wrong

- **Location:** `src/i18n/de.ts:489, 522`, `src/i18n/en.ts:489, 522`.
- **Statement:** en.ts:489 "Real current spreads wider, so the extra area is rather overstated
  and the gain of the fix a bit smaller."
- **Verdict:** probably wrong (direction not supported).
- **Why:** The shortest path through the copper runs tightly along the slot edge and corner; it is
  the innermost possible path and encloses the smallest possible additional area. A real RF
  current is not a filament on the edge; it spreads away from the edge, so its mean path lies
  outside the shortest path, and the effective additional area tends to become larger. More
  important than this error, in any case, is the uncomputed voltage across the slot, which
  drives common-mode currents.
- **Proposal (DE, translated):** "The return detour is computed as a single filament on the
  shortest path. The real current spreads around this path; the additional area can therefore
  be larger or smaller. Usually it weighs more heavily that the voltage across the slot, which
  drives common-mode currents, is not computed."
- **Proposal (EN):** "The return detour is computed as a single filament along the shortest
  path. The real current spreads around it, so the extra area can be larger or smaller. Usually
  more important: the voltage across the slot, which drives common-mode currents, is not
  computed."
- **Sources:** physical reasoning (minimum inductance means a finite current distribution, not
  a filament on the edge); E. Bogatin, *Signal and Power Integrity – Simplified*, chapter on
  return paths.

### 15. Empirical numbers without a source

- **Location:** `src/i18n/en.ts:490` ("Real gains are more like 10–20 dB"), `en.ts:552` ("more
  like 10–20 dB"), `en.ts:482` ("deviations of 10 dB either way are possible"); likewise de.ts.
- **Verdict:** worded too confidently.
- **Why:** No source, and the magnitude depends on plane size, loop height and frequency. At
  resonances of an open line the deviations easily exceed 10 dB, and at nodes of the standing
  wave the result can also lie far below the computed value.
- **Proposal (DE, translated):**
  - de.ts:490 and 552: "Over an ideal, infinitely large plane, current and image current cancel
    almost completely; that is why the gain appears very large. On a finite board it is smaller;
    how much depends on plane size, loop height and frequency and is not computed here (the full
    wave, stage 3, shows it)."
  - de.ts:482: "… deviations of 10 dB and more in both directions are possible, considerably
    more at resonances."
- **Proposal (EN):**
  - en.ts:490/552: "Over an ideal, infinite plane current and image almost cancel, so the gain
    looks very large. On a finite board it is smaller; how much depends on plane size, loop height
    and frequency and is not computed here (the full wave, stage 3, shows it)."
  - en.ts:482: "… deviations of 10 dB or more either way are possible, much more at resonances."
- **Sources:** none could be found for the numbers given.

### 16. The USB suggestion computes full speed

- **Location:** `src/physics/suggest.ts:52–68` (default in line 67), `src/i18n/de.ts:51`,
  `src/i18n/en.ts:53`.
- **Statement:** default f0 = 6 MHz, 3.3 V, 4 ns, capacitive load; reason "USB data pair"
  (en.ts:53).
- **Verdict:** missing caveat (misleading default).
- **Why:** That is USB 2.0 full speed (12 Mbit/s, edges 4–20 ns). A high-speed link
  (480 Mbit/s, 400 mV, edges around 500 ps, current-mode driver into 45 Ω terminations) has its
  fundamental at 240 MHz. According to the trapezoid formula, its line there is about 50 dB above
  the line of the full-speed default. For high speed the load model "Terminated" fits, not
  "Capacitive". The same applies to the general pair default (50 MHz, 0.4 V, like LVDS): LVDS is
  terminated, not capacitively loaded.
- **Proposal (DE, translated):** reason "USB data pair (assumed full speed, 12 Mbit/s; for high
  speed, 480 Mbit/s, change the values and the load model)".
- **Proposal (EN):** "USB data pair (assumed full speed, 12 Mbit/s; for high speed, 480 Mbit/s,
  change the values and the load model)".
- **Sources:** https://download.tek.com/document/55W-15027-4%20USB%202.0%20Physical%20Layer%20Testing_0.pdf ;
  https://en.wikipedia.org/wiki/USB_communications

### 17. Differential pair: amplitude imbalance only, no skew

- **Location:** `src/physics/sources.ts:36–37`, `diffPairModel()` in `src/physics/currents.ts`,
  `src/physics/suggest.ts:69` (default 5 %).
- **Verdict:** missing caveat.
- **Why:** In the model the common-mode part of a pair comes only from ε (default 5 %, not
  measured) and is independent of frequency. In practice the skew between P and N often
  dominates (length difference, driver, unequal edges); its common-mode part grows with
  frequency (about sin(π·f·Δt), around 3 % at 10 ps and 1 GHz, around 9 % at 3 GHz). Bends and
  asymmetric vias also convert differential mode into common mode.
- **Proposal (DE, translated)**, caveat for pairs: "The common-mode part of the pair comes only
  from the set amplitude imbalance (default 5 %, not measured). Skew between P and N is not
  computed; its common-mode part grows with frequency (around 3 % at 10 ps skew and 1 GHz)."
- **Proposal (EN):** "The pair's common-mode part comes only from the set amplitude imbalance
  (default 5 %, not measured). Skew between P and N is not computed; its common-mode part grows
  with frequency (about 3 % at 10 ps skew and 1 GHz)."
- **Sources:** calculation: the common-mode voltage (V(t) − V(t − Δt))/2 gives the magnitude
  sin(π·f·Δt).

### 18. Standard texts: fully anechoic room, measurement limit above 1 GHz, "the usual standard"

- **Location:** `src/i18n/de.ts:624, 630, 635`, `src/i18n/en.ts:624, 630, 635`,
  `src/physics/standards.ts:3–5`.
- **Statement:** de.ts:630 (translated): "Measured on an open-area test site or in the absorber
  chamber at 3 m or 10 m … (40/47 dBµV/m at 3 m)"; en.ts:630 "the usual standard for electronics
  in Europe"; standards.ts: "the extrapolation the standards themselves use".
- **Verdict:** ok but imprecise.
- **Why:**
  1. 40/47 dBµV/m apply to the open-area test site and the semi-anechoic chamber. In a fully
     anechoic room (FAR), class B at 3 m is 42–35 / 42 dBµV/m, class A 52–45 / 52 dBµV/m.
     "Absorber chamber" (German „Absorberhalle“) leaves this open (en.ts correctly says
     "semi-anechoic").
  2. Above 1 GHz, measurements are only required as far as the highest internally generated
     frequency Fx demands: up to 108 MHz only up to 1 GHz, up to 500 MHz up to 2 GHz, up to 1 GHz
     up to 5 GHz, above that 5 · Fx, at most 6 GHz. The app always compares lines above 1 GHz;
     for slow designs this is stricter than the standard.
  3. EN 55032 applies to multimedia equipment. Industrial and laboratory electronics usually
     fall under EN 55011 or EN 61326-1, household appliances under EN 55014-1.
  4. CISPR tabulates 3 m and 10 m (10 dB difference, i.e. a rounded 20 dB/decade); the
     conversion is a convention of the standards, not physics at 3 m and 30 MHz (k·r ≈ 1.9).
     CISPR 11 class A at 3 m gives 50.5/57.5 when converted, instead of the tabulated values;
     there, 3 m is permitted only for small EUTs.
- **Proposal (DE, translated)**, de.ts:630: "Multimedia equipment (IT, audio and video,
  networking) for residential use (CE marking via EN 55032); industrial and laboratory
  electronics usually fall under EN 55011 or EN 61326-1, household appliances under
  EN 55014-1. … Measured on an open-area test site or in a semi-anechoic chamber at 3 m or 10 m:
  below 1 GHz with a quasi-peak detector (40/47 dBµV/m at 3 m; in a fully anechoic room
  42–35/42 dBµV/m), above that average (50/54 dBµV/m) and peak (20 dB higher), above 1 GHz only
  as far as the highest internally generated frequency requires (up to 108 MHz: only up to
  1 GHz; up to 500 MHz: up to 2 GHz; up to 1 GHz: up to 5 GHz; above that five times that
  frequency, at most 6 GHz). …"
- **Proposal (EN):** "Multimedia equipment (IT, audio and video, networking) for residential use
  (CE marking via EN 55032); industrial and lab electronics usually fall under EN 55011 or
  EN 61326-1, household appliances under EN 55014-1. … Measured on an open-area test site or in a
  semi-anechoic chamber at 3 m or 10 m: below 1 GHz with a quasi-peak detector (40/47 dBµV/m at
  3 m; 42–35/42 dBµV/m in a fully anechoic room), above with average (50/54 dBµV/m) and peak
  (20 dB higher), above 1 GHz only as far as the highest internal frequency requires (up to
  108 MHz: only to 1 GHz; up to 500 MHz: to 2 GHz; up to 1 GHz: to 5 GHz; above: five times,
  at most 6 GHz). …"
- **Sources:** https://nobelcert.com/DataFiles/FreeUpload/BS%20EN%2055032-2015%20plus%20Cor2016%20plus%20A11-2020.pdf
  (Tables A.2–A.5); https://site.ieee.org/ctx-emcs/files/2015/04/2013_02_13-Presentation.pdf
  (table Fx → highest measurement frequency); https://www.law.cornell.edu/cfr/text/47/15.31 (20 dB/decade,
  not in the near field).

### 19. PHYSICS.md promises hatching that does not exist

- **Location:** `docs/stage-1/PHYSICS.md:274–276`, `src/physics/farfield.ts:74–90` (`extentMm`, not
  used anywhere), `src/physics/farfield.ts:56–67` (`cispr32ClassB`, not used anywhere).
- **Statement:** PHYSICS.md (translated): "From a structure size of about λ/4 the f² formula
  overestimates (no saturation); these ranges are hatched."
- **Verdict:** wrong (documentation).
- **Why:** Neither the spectrum nor the speech bubbles hatch anything; `extentMm` is dead code.
  The "board size" caveat in the explanation (`explain.ts:128–130`) appears only when the
  strongest line lies above the frequency at which the board diagonal reaches a third of the
  wavelength, and only there.
- **Proposal (DE, translated):** Implement the hatching or replace the sentence: "From a structure
  size of about λ/4 the f² formula no longer holds (no saturation, no resonance). The app
  currently does not mark this range in the spectrum; the explanation of a finding warns when the
  strongest line lies there."

### 20. Planes as ideal conductors: too optimistic at switching-regulator fundamentals

- **Location:** `docs/stage-1/PHYSICS.md:294`, shielding in `src/physics/biotsavart.ts:85–106`,
  images in `src/physics/images.ts`.
- **Statement:** PHYSICS.md:294 (translated): "Planes as ideal conductors (skin depth < thickness
  of 35 µm copper from ≈ 4 MHz)."
- **Verdict:** worded too confidently.
- **Why:** At 3.6 MHz the skin depth is 35 µm; one skin depth of copper attenuates by absorption
  by only 8.7 dB. A 35 µm plane is ideal only well above 10 MHz. At the fundamentals of switching
  regulators (0.1–2 MHz, skin depth about 210–47 µm) the magnetic field partly penetrates, and the
  image effect under a flat loop is weaker. The model sets the field behind a plane to exactly
  zero. For 30 MHz and above the approximation is good; for comparison with scans of the back
  side below 10 MHz it is not.
- **Proposal (DE, translated):** "Planes as ideal conductors. For 35 µm copper this is well
  satisfied from about 10 MHz (several skin depths). At the fundamentals of switching regulators
  (0.1–2 MHz, skin depth 50–210 µm) the magnetic field partly penetrates the plane, and the image
  effect is weaker; there the model shows too little field behind planes."
- **Sources:** https://en.wikipedia.org/wiki/Skin_effect (δ = 1/√(π·f·µ0·σ), copper 1 MHz ≈ 65 µm).

### 21. Probe model: ideal open-circuit voltage into 50 Ω

- **Location:** `src/scanner/probe.ts:1–6, 14–17`, `docs/stage-1/PHYSICS.md:246`,
  `docs/future/STAGE-4-SCANNER.md:22`; effect on `scan.fitHint` (de.ts:281).
- **Statement:** "U = 2π f µ0 π a² H (open-circuit EMF, into 50 Ω as a first approximation)".
- **Verdict:** missing caveat.
- **Why:** Into 50 Ω the self-inductance of the loop forms a low-pass filter: above
  f ≈ 50 Ω / (2π·L) the output voltage flattens out. A loop with a 10 mm diameter has about
  19 nH, i.e. a corner frequency of around 400 MHz; at 1 GHz the formula shows about 8 dB too
  much. On top of that come the E-field sensitivity of unshielded loops and the averaging over the
  loop area close above lines. "Fit sources" attributes such probe errors to the sources.
- **Proposal (DE, translated):** "Ideal open-circuit voltage. Into 50 Ω the self-inductance of
  the loop limits the output from f ≈ 50 Ω/(2π·L) (10 mm loop: about 400 MHz); above that the
  formula shows too much (at 1 GHz about 8 dB). For absolute values use the manufacturer's probe
  factor; otherwise 'Fit sources' attributes probe errors to the sources."
- **Sources:** calculation L = µ0·a·(ln(8a/r) − 2) with a = 5 mm, r = 0.25 mm.

### 22. Small high-frequency capacitor at VIN/PGND: works through ESL, anti-resonance not mentioned

- **Location:** `src/i18n/de.ts:539`, `src/i18n/en.ts:539`.
- **Statement:** en.ts:539 "Add a small high-frequency capacitor (e.g. 100 nF, 0402) right at
  VIN/PGND."
- **Verdict:** missing caveat.
- **Why:** The benefit comes from the small package and the shortest loop (low mounting
  inductance), not from the value. In parallel with larger ceramic capacitors, a different value
  can form a parallel resonance. Archambeault lists "Need a variety of capacitance
  values" as a myth.
- **Proposal (DE, translated):** "Place a capacitor in a small package (e.g. 0402) closest to
  VIN/PGND, with the shortest loop. It works through its low mounting inductance, not through its
  value. Together with the larger input capacitors it can form a parallel resonance; if in doubt,
  check the impedance curve."
- **Proposal (EN):** "Put a capacitor in a small package (e.g. 0402) closest to VIN/PGND, with the
  shortest loop. It works through its low mounting inductance, not its value. Together with the
  larger input capacitors it can form a parallel resonance; check the impedance curve when in
  doubt."
- **Sources:** https://ewh.ieee.org/r3/enc/emcs/archive/2012-10-10b_DecouplingMyths.pdf

### 23. Series termination only for point-to-point

- **Location:** `src/i18n/de.ts:597, 415`, `src/i18n/en.ts:597, 415`.
- **Verdict:** missing caveat (minor).
- **Why:** Series termination suits one receiver at the end of the line. With several receivers
  along the line, the middle ones see a step at half amplitude (Johnson/Graham).
- **Proposal (DE, translated):** "Series resistor at the driver (about Z0 minus output
  resistance, typically 22–33 Ω) if the line leads to one receiver at its end. With several
  receivers along the line the middle ones see a step; in that case terminate at the end or
  route in a star."
- **Proposal (EN):** "A series resistor at the driver (about Z0 minus the driver output
  resistance, typically 22–33 Ω) when the line goes to one receiver at its end. With several
  receivers along the line the middle ones see a step; then terminate at the end or route as a
  star."
- **Sources:** H. Johnson, M. Graham, *High-Speed Digital Design*, 1993, chapter on termination.

### 24. Electrically long line: "with the same current everywhere"

- **Location:** `src/i18n/de.ts:594`, `src/i18n/en.ts:594`.
- **Verdict:** ok but imprecise (contradicts the model).
- **Why:** With the capacitive load model the current decreases towards the end of the line
  (PHYSICS.md §5.1); it is constant only with the terminated model. What is meant is: in phase,
  without delay.
- **Proposal (DE, translated):** "The fast calculation treats the line as lumped: in phase
  everywhere, without delay."
- **Proposal (EN):** "The fast calculation treats the line as lumped: in phase everywhere,
  without delay."

### 25. Cavity resonance estimated from the board size

- **Location:** `src/report/explain.ts:134–138`, `src/i18n/de.ts:488`, `src/i18n/en.ts:488`.
- **Verdict:** ok but imprecise.
- **Why:** The formula c/(2·L·√εr) is correct for the first mode. However, what goes into it is
  the longest side of the whole board and the εr of the first dielectric (usually the topmost),
  not the overlap of the two planes and the dielectric between them. Small plane islands
  resonate considerably higher.
- **Proposal (DE, translated):** "The cavity between ${a} and ${b} has its first resonance,
  roughly estimated, at about ${f} (from the board size; smaller plane islands resonate higher)."
- **Proposal (EN):** "The cavity between ${a} and ${b} has its first resonance roughly at about
  ${f} (from the board size; smaller plane islands resonate higher)."

### 26. Far-field formula at 3 m at low frequencies

- **Location:** `src/physics/farfield.ts:41–47`, `src/i18n/de.ts:474`, `src/i18n/en.ts:474`.
- **Verdict:** ok but imprecise.
- **Why:** The E field of a magnetic dipole has the factor √(1 + 1/(k·r)²); at 30 MHz and 3 m,
  k·r ≈ 1.9, i.e. about +1.1 dB, which the pure far-field formula does not contain. The floor
  factor 2 is a maximum; with horizontal polarisation and at low frequencies the height scan
  (1–4 m) does not always reach it. Both effects are small; mention them in the formula text (see
  the proposal in finding 2).

### 27. Several sources as a power sum

- **Location:** `farReadout()` in `src/state/engine.svelte.ts` (sum `totals`, around line 857),
  `docs/stage-1/PHYSICS.md:163–171`, `docs/DECISIONS.md` no. 5.
- **Verdict:** ok but imprecise.
- **Why:** Sources on the same clock (clock buffer outputs, data with a common clock) are
  phase-locked; their lines at the same frequency add up by up to 6 dB instead of 3 dB. The
  "Total" should be marked as "assumed incoherent".

### 28. CISPR 11 and CISPR 14-1: not fully verified, measurement method

- **Location:** `src/i18n/de.ts:650–660`, `src/i18n/en.ts:650–660`, `src/physics/standards.ts:77–106`.
- **Verdict:** ok but imprecise (values plausible, not fully checked against the text of the
  standard).
- **Why:** CISPR 11 group 1: at 10 m, class B 30/37 and class A 40/47 dBµV/m match the accessible
  sources; since edition 5 there are separate values for class A equipment above 20 kVA (the text
  says "up to 20 kVA", which fits). The group definition in the text ("generates radio frequency
  only internally") is a paraphrase; formally, group 1 is "everything that is not group 2". For
  CISPR 14-1 the numerical values were not freely accessible; the standard ties the radiated
  emission to measurement methods (Table 9 "limits and testing methods") and alternatively uses
  the disturbance power at 30–300 MHz (Table 7). The app's comparison is then only one of the
  possible ways of demonstrating compliance.
- **Proposal:** Check the values against the purchased standards; add to the CISPR 14-1 text
  (DE, translated): "Depending on the device, the disturbance power on the leads (30–300 MHz) is
  measured instead of the radiated emission."
- **Sources:** https://cdn.standards.iteh.ai/samples/15070/2cded154aefd4da09343d754b7778721/CISPR-11-2009.pdf ;
  https://cdn.standards.iteh.ai/samples/21114/22098bc572fe44798a4979c30766f95b/CISPR-14-1-2016.pdf
  (table of contents, Tables 7 and 9).

### 29. Minor wording issues

- `docs/DECISIONS.md:12` (no. 3, translated): "current loops, the most common cause of EMC
  problems on boards". Too confident; better: "a common cause; tests usually fail because of
  common-mode currents driven by current loops" (Paul 1989, LearnEMC).
- `docs/DECISIONS.md:19` (no. 6): imaging "physically correct for continuous planes"
  (translated) applies to the near field over large planes, not to the far field of small boards
  (finding 2).
- `src/i18n/de.ts:583`, en.ts:583: "For differential pairs one stitching via per pair, symmetric."
  Vague; usual practice, proposed for de.ts and en.ts alike: "one or two GND vias symmetric to the
  pair, ideally one next to each signal via".

---

## Checked and in order

- The constant `K_DIPOLE = η0·(2π/c)²/(4π) = 1.3168·10⁻¹⁴` corresponds to Ott's 131.6·10⁻¹⁶
  (free space); with the factor 2 it equals 263·10⁻¹⁶ (Ott, eq. 12-2). The constant is correct,
  only the moment is not (finding 2).
- dB conversions: dBµV/m = 20·log10(E) + 120, dBµA/m = 20·log10(H / 1 µA/m); display as RMS value
  (Fourier peak value / √2), as on a spectrum analyser.
- Trapezoid spectrum: c_n = 2A·d·|sinc(nπd)|·|sinc(nπ·tr/T)|, corner frequencies 1/(π·τ) and
  1/(π·tr) (Paul); even harmonics vanish at 50 %. The statement that halving the rise time
  "raises the lines above by up to 6 dB" is correct.
- Triangular ripple current: c_n = A·|sin(nπD)| / (π²·n²·D·(1−D)) recalculated, correct.
- Microstrip after Hammerstad/Jensen and stripline after IPC-2141 as in the literature;
  C' and L' from Z0 and εeff correct.
- λ/10 criterion for "electrically short" and f_short = c/(10·L·√εeff); quasi-statics criterion
  k·r ≤ 0.3.
- CISPR 32 class A and B, 3 m and 10 m, 30–1000 MHz and 1–6 GHz (average, peak 20 dB higher)
  in `standards.ts` agree with EN 55032:2015+A11:2020, Tables A.2–A.5.
- FCC §15.109 class B (3 m) and class A (10 m) including the dB values; quasi-peak below 1 GHz,
  average above, peak +20 dB (§15.35); conversion with 20 dB/decade according to §15.31(f)(1).
- CISPR 32: no radiated limits below 30 MHz; CISPR 25 and MIL-STD-461 RE102 at 1 m with a
  cable harness.
- Cavity resonance c/(2·L·√εr) as a formula (only the input values are rough, finding 25).
- The explanation that a crossed slot drives a voltage, radiates itself and puts common mode onto
  cables (de.ts:506) is correct and important.
- "Above a few MHz the return current flows … right under the line": defensible (LearnEMC:
  "At megahertz frequencies and higher …").
- The advice to reroute the line, to place a stitching via directly next to the signal via, to
  slow down edges, to put the input capacitor close and on the same layer, to keep the
  switch-node area small, to avoid stubs on clocks, and to use a bootstrap resistor for slowing
  down: all consistent with the literature (Ott, TI SLYT682, LearnEMC).
- None of the well-known myths found (20H rule, star-point ground, 90° corners, guard traces,
  ferrites everywhere).

## Sources

- LearnEMC (T. Hubing): Introduction to Electromagnetic Radiation,
  https://learnemc.com/electromagnetic-radiation
- LearnEMC: The Most Important EMC Design Guidelines,
  https://learnemc.com/the-most-important-emc-design-guidelines
- C. R. Paul: A comparison of the contributions of common-mode and differential-mode currents in
  radiated emissions, IEEE TEMC 31 (1989) 189–193, https://ieeexplore.ieee.org/document/18789/
- D. M. Hockanson, J. L. Drewniak, T. H. Hubing et al.: Investigation of fundamental EMI source
  mechanisms driving common-mode radiation from printed circuit boards with attached cables,
  IEEE TEMC 38(4), 1996; publication list https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/pcb_es_pubs.html
- H. Shim, T. Hubing: Model for Estimating Radiated Emissions From a Printed Circuit Board With
  Attached Cables Due to Voltage-Driven Sources, IEEE TEMC 2005,
  https://www.researchgate.net/publication/3056826_Model_for_Estimating_Radiated_Emissions_From_a_Printed_Circuit_Board_With_Attached_Cables_Due_to_Voltage-Driven_Sources
- ROHM TechWeb: Differential (Normal) Mode Noise and Common Mode Noise,
  https://micro.rohm.com/en/techweb/knowledge/emc/s-emc/01-s-emc/6899
- BS EN 55032:2015+A11:2020 (CISPR 32), Annex A,
  https://nobelcert.com/DataFiles/FreeUpload/BS%20EN%2055032-2015%20plus%20Cor2016%20plus%20A11-2020.pdf
- EN 55032 class B, overview: https://emccalc.com/limits/en55032-class-b-re/
- D. Hoolihan: Applying the new CISPR 32 (IEEE CTX EMC Society, 2013),
  https://site.ieee.org/ctx-emcs/files/2015/04/2013_02_13-Presentation.pdf
- CISPR 11:2009+A1:2010, sample,
  https://cdn.standards.iteh.ai/samples/15070/2cded154aefd4da09343d754b7778721/CISPR-11-2009.pdf
- CISPR 14-1:2016, sample (table of contents),
  https://cdn.standards.iteh.ai/samples/21114/22098bc572fe44798a4979c30766f95b/CISPR-14-1-2016.pdf
- 47 CFR §15.109, https://www.law.cornell.edu/cfr/text/47/15.109
- 47 CFR §15.35, https://www.law.cornell.edu/cfr/text/47/15.35
- 47 CFR §15.31, https://www.law.cornell.edu/cfr/text/47/15.31
- T. Hegarty (TI): Reduce buck-converter EMI and voltage stress by minimizing inductive
  parasitics, Analog Applications Journal 3Q 2016, https://www.ti.com/lit/pdf/slyt682
- B. Archambeault: PCB Power Decoupling Myths Debunked (2012),
  https://ewh.ieee.org/r3/enc/emcs/archive/2012-10-10b_DecouplingMyths.pdf
- Effects of Plane Splits on High-Speed Signals, Part 1, PCD&F,
  https://www.pcdandf.com/pcdesign/index.php/2007-archive-articles/2236-effects-of-plane-splits-on-high-speed-signals-part-1
- Effect of stitching capacitor distance for critical traces crossing split reference planes,
  https://www.researchgate.net/publication/4037266_Effect_of_stitching_capacitor_distance_for_critical_traces_crossing_split_reference_planes
- Tektronix: Understanding and Performing USB 2.0 Physical Layer Testing,
  https://download.tek.com/document/55W-15027-4%20USB%202.0%20Physical%20Layer%20Testing_0.pdf
- USB communications, https://en.wikipedia.org/wiki/USB_communications
- Skin effect, https://en.wikipedia.org/wiki/Skin_effect
- H. W. Ott: Electromagnetic Compatibility Engineering, Wiley 2009 (ch. 12: differential-mode and
  common-mode radiation).
