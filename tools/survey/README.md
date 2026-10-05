# Survey on real boards

Runs the full check (with the automatically suggested sources) on real KiCad boards and counts
the findings per kind and how many are red or yellow. It shows whether a rule is useful in
practice or produces noise; every new rule should be run against it.

```bash
npx tsx tools/survey/survey.ts boards/*.kicad_pcb /usr/share/kicad/demos/*/*.kicad_pcb
npx tsx tools/survey/redkinds.ts tools/survey/out/<board>.json
```

`boards/` holds the public example boards (not in the repository, see boards/README.md); KiCad
ships its demo boards under `/usr/share/kicad/demos`. Details per board land in
`tools/survey/out/` (not committed).

Accepting all suggestions at once is a stress test: every net with "CLK" in its name is assumed
to be a 25 MHz clock with 1 ns edges, which overstates slow or old designs.
