# Feldcheck in der CI (W6)

Stand: 2026-10-04

Dieselbe Physik wie in der App, ohne Browser, als ein einzelnes Node-Skript. Für jede aktive
Quelle eines Szenarios berechnet es:

- das stärkste Magnetfeld in einer Ebene 2 mm über der Platine, gesamt und in den Bändern
  30–230 MHz und 230 MHz–1 GHz (dBµA/m, mit Ort),
- den Abstand der stärksten Fernfeldlinie zum Grenzwert CISPR 32 B in 3 m,
- die Hinweise zum Layout (Rückstrompfad über Lücke, Bezugswechsel, fehlende Stitching-Via,
  elektrisch lange Leitung).

Mit einer Basis (`--baseline`) vergleicht es: Steigt ein Wert um mehr als die Schwelle (Standard
3 dB) oder kommt ein Hinweis dazu, endet es mit Exit-Code 1. So fällt in einem Pull Request auf,
wenn eine Änderung am Layout einen Hotspot lauter macht.

## Aufruf

```bash
node field-check.mjs board.kicad_pcb --scenario board.scenario.json \
  [--out report.json] [--baseline field-baseline.json] [--threshold 3] [--height 2] [--step 1]
```

Das Szenario ist die Datei, die die App mit „Szenario speichern“ schreibt: Quellen, Flanken,
Lasten, Rückstrommodell. Die Basis ist ein früherer `--out`-Bericht, zum Beispiel vom
Hauptzweig. Hinweise gelten als dieselben, wenn Art und Ort (±2 mm) übereinstimmen.

Im Repo der App: `npm run build`, dann `npm run field-check -- board.kicad_pcb --scenario …`.

## Beispiel: GitHub Actions in einem KiCad-Projekt

Das Skript liegt neben der App auf deren Seite unter `cli/field-check.mjs` (Adresse der App:
siehe README). `SITE` unten ist diese Adresse.

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

Die Basis legt man einmal an (`--out hw/field-baseline.json`) und aktualisiert sie, wenn eine
Verschlechterung gewollt ist oder eine Verbesserung festgeschrieben werden soll.

## Grenzen

- Quasistatisch wie Stufe 1–2 (mit Rückstrom-Umwegen, wenn das Szenario sie wählt); keine
  Vollwelle. Für Resonanzen: Stufe 3 (openEMS).
- Das Fernfeld ist eine Orientierung aus dem Dipolmoment, ohne Kabel.
- Die Ergebnisse hängen am Szenario: Eine neue Quelle oder ein umbenanntes Netz muss im
  Szenario nachgezogen werden, sonst fehlt die Quelle im Vergleich.
