# Decisions

Numbered, with date and rationale. Append new decisions at the bottom; do not delete superseded
ones, but mark them as "replaced by no. X".

1. **2026-10-04 · Pure browser app without a backend.** No installation, board data stays
   local, deployment as a static page (GitHub Pages). Expensive computations come later
   via an optional local bridge (stage 3), not via a cloud service.
2. **2026-10-04 · TypeScript + Vite + Svelte 5 + three.js.** Svelte for the panels (little
   runtime overhead, easy to read), three.js used imperatively for the scene, no React Three Fiber.
   Vitest for tests, because it shares Vite's configuration.
3. **2026-10-04 · Stage 1 computes only the H field.** It shows current loops, a frequent
   EMC cause on boards (tests usually fail because of common-mode currents that such
   loops drive); the E field follows as an optional milestone (M8).
4. **2026-10-04 · Field pattern per source independent of frequency, spectrum kept separate.** Allows
   real-time changes without recomputation (PHYSICS.md §6).
5. **2026-10-04 · Sources mutually incoherent (power sum).** Independent
   oscillators are not phase-locked; within one source the computation is coherent.
6. **2026-10-04 · Return current via mirror images with local plane coverage.** Simple, fast,
   correct for the near field over large, solid planes (not for the far field of small
   boards, see no. 34); cut-outs move the image to the
   next plane. Real detours come in stage 2.
7. **2026-10-04 · Computation in a right-handed world system (X = x, Y = height, Z = KiCad y).**
   Avoids sign errors in cross products; KiCad's left-handed system is mirrored on
   import.
8. **2026-10-04 · All line amplitudes as RMS values.** Like the spectrum analyser and the
   CISPR limits; avoids 3 dB mix-ups.
9. **2026-10-04 · Working title only in `branding.config.json`.** Storage keys and
   file formats are name-neutral; CI checks that the name appears nowhere else (RENAMING.md).
10. **2026-10-04 · Documentation in German, code and identifiers in English.** *(Documentation part replaced by no. 41.)* User interface
    via a dictionary, German first, English in M7.
11. **2026-10-04 · Repo private for now.** Visibility and licence are decided by the
    project owner (open questions in stage-1/PLAN.md §11).
12. **2026-10-04 · Typeface IBM Plex Sans bundled locally** (@fontsource, Latin only), no
    request to Google Fonts: the app promises that nothing leaves the computer.
13. **2026-10-04 · Design styled as a measuring instrument:** slate blue instead of black (the glow
    needs a dark background), amber for the field, cyan for the probe; the
    most prominent element is the spectrum analyser with its graticule.
14. **2026-10-04 · Far field as orientation in the analyser** (mode "Far field 3 m / 10 m")
    instead of a separate page; CISPR 32 B limit lines, note "without cables" in the "Diagnostics" tab.
15. **2026-10-04 · Field lines only for the selected source**, in a separate worker: lines
    of all sources at once would be unreadable and expensive.
16. **2026-10-04 · Playwright tests in CI**, with the browser only as a headless shell; WebGL runs
    there via SwiftShader.
17. **2026-10-04 · User interface bilingual (German, English)**, default according to the browser language;
    the documentation stays in German (supplements no. 10). *(Documentation: replaced by no. 41.)*
18. **2026-10-04 · Repo public, app on GitHub Pages.** Licence still open (until then, copyright
    applies without any usage rights being granted).
19. **2026-10-04 · Discoverability through real page text instead of keyword lists.** A static
    introductory text in the HTML (for crawlers without JavaScript), structured data, `llms.txt`,
    a sitemap and GitHub topics; the `keywords` meta tag is only an extra (Google ignores it).
    As long as no licence has been chosen, the words "open source" appear nowhere.
20. **2026-10-04 · Stage 2 starts with a geometric detour model** instead of the
    PEEC/FastHenry solver: shortest paths through the plane copper and jumps across a stitching via
    or capacitor already show the typical return-current faults correctly and compute in
    milliseconds; the plane solver remains for the exact current distribution.
21. **2026-10-04 · Small holes in planes (up to 3 mm²) count as copper** *(Since refined: holes up to 2.5 mm across count, slots by their length; see PHYSICS.md §8.1.)* (via clearances);
    slots and cut-outs remain gaps.
22. **2026-10-04 · Stage 4 starts with a virtual test bench.** A printer and a receiver
    that "measure" the simulation check the whole chain (plan, registration, travel, sweep,
    saving, comparison) without hardware; a real measurement can later be compared directly
    against it.
23. **2026-10-04 · First hardware paths: OctoPrint REST, G-code via Web Serial, tinySA via
    Web Serial.** OctoPrint because the existing printer is connected to it; Web Serial because it runs
    in the browser without installation. The OctoPrint API key is not stored.
24. **2026-10-04 · Measurement files initially as JSON** with raw spectra and background; a
    binary format only once the file size becomes a problem.
25. **2026-10-04 · KiCad live coupling first via the file, not via the IPC API.** The File
    System Access API (Chromium) is enough to react to every save, without a local bridge
    and without installation; the IPC bridge remains for live changes without saving and for the
    way back into KiCad.
26. **2026-10-04 · Stage 3 first as an offline workflow** (export the job, compute locally, load the
    result) instead of a local bridge: no permanently running software, no open
    ports, and the result can be passed on.
27. **2026-10-04 · Full-wave results per ampere of port current at a few frequencies.** The app
    multiplies them by the current spectrum of its source model. This keeps the spectrum
    interactive, and the comparison with stage 1 separates field distribution and source model.
28. **2026-10-04 · Narrow traces additionally as thin wires.** With cells of 0.5–1 mm,
    0.2 mm traces and small pads otherwise fall through the grid, and loops stay open.
29. **2026-10-04 · Own result format (int16 centi-dB) instead of HDF5 in the browser:** small, readable
    without an additional library (h5wasm), resampled onto the app's grid.
30. **2026-10-04 · Licence 0BSD.** The project owner wanted the most permissive licence. 0BSD permits
    everything without attribution and, unlike public-domain dedications (Unlicense, CC0),
    also takes effect where copyright cannot be waived, for example in Germany. This means
    the project may be called "open source" (supplements no. 18 and 19).
31. **2026-10-04 · Rank findings by their effect on the far field.** Each
    finding is measured on its own against the source with ideal return paths (share of the dipole moment), not by
    leaving it out. Sorting is first by the source's margin to the limit, then by the
    effect of the fix: this way the top of the list shows what is most likely to rescue a test.
32. **2026-10-05 · Speech bubbles in 3D space only as an extra.** HTML-in-Canvas is an origin trial
    with a changing API and only in Chromium. The HTML overlay remains the default; the
    bubbles in space are offered where the browser supports it, and automatically in VR.
33. **2026-10-05 · Find real 3D models by file name, not by path.** The
    paths in the board depend on variables and folders on the developer's computer, which
    the browser does not know. The file name without extension is unique enough in KiCad libraries;
    for duplicates the same library folder decides, then the format (STEP
    first, because KiCad has shipped only STEP since version 9 and it carries the colours per face).
    KiCad's GLB export takes precedence, because KiCad placed it itself. STEP is
    read in the browser (OpenCascade as WebAssembly) instead of on a server: the models stay with the
    user, and no service is needed.
34. **2026-10-05 · Far field with the return current in the plane, not at the image depth.** The
    technical review (docs/review/TECHNICAL-REVIEW-2026-10.md, no. 2) showed that images and the
    ground-reflection factor together computed the far field of every line over a plane 6 dB too
    high. Images remain for the near field (correct there); the dipole moment for the far field
    uses the real return current.
35. **2026-10-05 · The display shows the effect of a single fix, not the share.** The
    share against an ideal source ranks the findings; the number on the bubble says what
    fixing only this spot changes in the model, even if that is a deterioration.
36. **2026-10-05 · Test bench with fault boards.** Every known kind of fault gets a
    generated board with the fault and a twin with the usual fix
    (tools/emc-cases); a test checks that the app reports the fault and does not report the twin.
    Rules that fail there are changed, not the expectation.
37. **2026-10-05 · Common mode with cables as an estimate after Clemson, not as a computation.** Most
    tests fail because of common mode; without a cable model a pure
    differential-mode computation stays silent exactly there. The published formulas of the Clemson expert system
    (voltage across the plane, crosstalk onto cable conductors) are simple, verifiable and
    explicitly worst-case; the app shows them as such and rates them 6 dB more cautiously.
38. **2026-10-05 · Board rules with fixed priority.** Filters, shields, decoupling, crystals,
    switch nodes, floating copper: these faults can be recognised from the geometry, but
    not meaningfully quantified. They appear as a rule with a guideline value and a source, not with an
    invented dB figure.
39. **2026-10-05 · Every rule must prove itself on real boards.** The test bench with
    fault boards shows that a rule triggers; the review of 23 real boards
    (tools/survey) shows whether it is a nuisance. Rules that fire dozens of times on carefully designed
    boards are narrowed (examples: connector ground pins counted per connector instead of
    per source, board-to-board connectors are not cables, a series resistor is not a filter).
40. **2026-10-05 · Plane from 15 % coverage instead of 25 %.** Where copper lies under a line, it is the line's
    reference; the raster says where. An analogue ground under an audio section (22 %) was otherwise
    overlooked and produced false stack-up findings.

41. **2026-10-05 · Documentation in English** (replaces the documentation part of no. 10 and the
    remark in no. 17). The app is meant for hobbyists and professionals everywhere; the German
    documents were translated completely, file names included (REGELN.md → RULES.md,
    stufe-1/ → stage-1/, zukunft/ → future/, …). The user interface stays bilingual.
42. **2026-10-05 · Boards from other CAD tools through the formats they export, not through their
    native files.** IPC-2581 and ODB++ are written by Altium, Allegro/OrCAD, PADS/Xpedition, Zuken
    and KiCad and carry stack-up, netlist and filled copper, so one importer each covers most
    professional tools; native formats (`.PcbDoc`, Allegro `.brd`) are binary, undocumented or
    change between versions. Eagle and Fusion 360 are read directly (XML, the most common
    hobbyist format besides KiCad); because Eagle stores only pour outlines, the pour is computed
    the way Eagle does it. Gerber is not supported: without a netlist the sources and most rules
    have nothing to work with. Every importer is checked against KiCad (same board, same findings,
    same field within 0.1 dB); see docs/IMPORT.md.
43. **2026-10-05 · Assumptions about the file are shown.** When a file has no stack-up, no closed
    outline or (Eagle) no computed pours, the Diagnostics tab says so under "Notes on the file",
    with what was assumed instead; a default stack-up silently changes every height above a plane
    and therefore the field.
