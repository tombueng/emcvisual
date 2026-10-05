# Field check in CI (W6)

As of: 2026-10-05

The same physics as in the app, without a browser, as a single Node script. For every active
source of a scenario it computes:

- the strongest magnetic field in a plane 2 mm above the board, in total and in the bands
  30–230 MHz and 230 MHz–1 GHz (dBµA/m, with location),
- the margin of the strongest far-field line to the limit at 3 m, for the standard saved in the
  scenario (CISPR 32 class B unless the scenario says otherwise),
- all layout findings of the source (return path across a gap, reference change, missing
  stitching via, unterminated line, line at the plane edge, hot loop, cable common mode,
  crosstalk into a cable line, …),
- and once per board the board rules (filters, shields, ESD protection, decoupling, crystal,
  switch node, supply noise, …; see docs/RULES.md).

The board may be a KiCad file or any format the app imports (IPC-2581, ODB++, Eagle; see
docs/IMPORT.md).

With a baseline (`--baseline`) it compares: if a value rises by more than the threshold (default
3 dB), or a new finding of a source or a new board-rule finding appears, it ends with exit
code 1. This way a pull request reveals when a layout change makes a hotspot louder or adds a
known mistake.

## Invocation

```bash
node field-check.mjs board.kicad_pcb --scenario board.scenario.json \
  [--out report.json] [--baseline field-baseline.json] [--threshold 3] [--height 2] [--step 1]
```

The scenario is the file the app writes with "Save scenario": sources, edges,
loads, return-current model. The baseline is an earlier `--out` report, for example from the
main branch. Findings count as the same if their kind and location (±2 mm) match.

In the app's repo: `npm run build`, then `npm run field-check -- board.kicad_pcb --scenario …`.

## Example: GitHub Actions in a KiCad project

The script is published alongside the app on its site under `cli/field-check.mjs` (address of the app:
see README). `SITE` below is this address.

```yaml
name: Field check
on: [pull_request]

jobs:
  field:
    runs-on: ubuntu-latest
    env:
      SITE: https://example.github.io/app/   # address of the app, see its README
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - run: curl -fsSLo field-check.mjs "${SITE}cli/field-check.mjs"
      - run: >
          node field-check.mjs hw/board.kicad_pcb
          --scenario hw/board.scenario.json
          --baseline hw/field-baseline.json
          --out field-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: field-report
          path: field-report.json
```

You create the baseline once (`--out hw/field-baseline.json`) and update it when a
deterioration is intended or an improvement is to be locked in.

## Limitations

- Quasi-static like stages 1–2 (with return-current detours if the scenario selects them); no
  full wave. For resonances: stage 3 (openEMS).
- The far field is an orientation derived from the dipole moment, without cables.
- The results depend on the scenario: a new source or a renamed net must also be updated in the
  scenario, otherwise the source is missing from the comparison.
