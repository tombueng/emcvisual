# Checking the fast model against the full wave

`validate-loop.ts` runs a test board from `tests/fixtures/emc-cases` through openEMS and compares
the far field at 3 m per ampere with the fast calculation (return current in the plane, and for
comparison the old mirror-depth moment).

```bash
npx tsx tools/fullwave/validate-loop.ts export vertical-loop bad
tools/openems/.venv/bin/python tools/openems/run_job.py tools/fullwave/out/vloop.openems-job.json --res 0.5
npx tsx tools/fullwave/validate-loop.ts compare vertical-loop bad
```

Other boards: any case with a loop source, e.g. `slot-loop bad` (writes
`out/slot-loop-bad.*`). openEMS setup: `tools/openems/README.md`. Results and their reading:
`docs/stage-1/PHYSICS.md` §11.1. The output folder is not committed.
