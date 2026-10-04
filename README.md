# emcvisual

> Arbeitstitel. Der Name steht nur in `branding.config.json` und lässt sich mit einem Skript
> ändern, siehe [docs/RENAMING.md](docs/RENAMING.md).

**Im Browser ausprobieren / try it:** https://tombueng.github.io/emcvisual/

**In English:** a browser tool that computes the quasi-static magnetic near field of a KiCad
board and turns it into a 3D world you can look at and listen to: glowing field volumes,
field lines, a virtual near-field probe with a spectrum-analyzer view, a far-field estimate
against CISPR 32 and layout hints (return paths over plane gaps, reference changes at vias).
Return currents detour around plane slots and jump through stitching vias or capacitors, the
electric field can be shown as well, a full-wave openEMS run can be exported, computed locally and
loaded as a second field source, and a near-field scanner (a 3D printer moving a probe,
tinySA as receiver; a virtual rig for trying it without hardware) compares measurements with
the simulation. The interface speaks German and English; the docs are in German.

Elektromagnetische Felder einer Leiterplatte kann man nicht sehen. Dieses Werkzeug rechnet
sie aus einer KiCad-Platine aus und macht daraus eine **begehbare 3D-Welt mit Bild und Ton**:
Wo leuchtet es, wo brummt es, und was passiert, wenn die Flanke langsamer wird oder der
Eingangskondensator näher an den Schaltregler rückt?

Alles läuft im Browser. Die Platinendatei verlässt den Rechner nicht.

![Demo-Platine mit Feld, Diagnose und Spektrum](docs/images/app-demo.png)

## Stand

**Stufe 1 (M0–M6) läuft:** quasistatische Simulation des magnetischen Nahfelds
(Biot-Savart mit Spiegelströmen in den Bezugsflächen) und dazu:

- KiCad 6 bis 10 importieren; Bezugsflächen werden erkannt, Quellen aus Netznamen vorgeschlagen
- Quellen: Takt- und Datenleitungen (auch über Serienwiderstände), Differenzpaare,
  Stromschleifen von Schaltreglern (Pads auch per Klick in 3D)
- Feld als leuchtendes Volumen, Isoflächen, Schnittebene, Feldlinien der gewählten Quelle, Ameisenblick
- Sprechblasen in 3D: die Hinweise nummeriert an ihrer Stelle auf der Platine (mit der Wirkung
  auf das Fernfeld), Quellen mit Nahfeld und Abstand zum Grenzwert, auf Wunsch Hotspots
- virtuelle Nahfeldsonde mit Spektrumanalysator, Fernfeld-Abschätzung gegen CISPR 32 B
- Klang: jede Quelle klingt, laut wo das Feld stark ist
- Diagnose: unterbrochene Rückstrompfade, Bezugswechsel an Vias, fehlende Stitching-Vias,
  Hotspots mit den Netzen und Bauteilen in der Nähe; die Hinweise sind nach ihrer Wirkung auf
  das Fernfeld in 3 m geordnet („behoben 11 dB leiser“), die lauteste Quelle zuerst
- echte 3D-Bauteilmodelle: aus deinem Modellordner oder GitHub-Repo (STEP, WRL, GLB, STL, nach
  Dateinamen gefunden), Standardteile aus KiCads Bibliothek, oder aus KiCads GLB-Export
- Szenario als JSON speichern, PNG- und CSV-Export, EMV-Bericht als HTML (druckbar als PDF)
- Oberfläche auf Deutsch und Englisch (Auswahl oben rechts, Standard nach Browsersprache)

Plan, Abnahmekriterien und Umsetzungsnotizen: [docs/stufe-1/PLAN.md](docs/stufe-1/PLAN.md).

**Stufe 2 (in Arbeit):** Rückströme laufen um Schlitze in der Fläche herum und springen bei
einem Lagenwechsel über die nächste Stitching-Via oder den nächsten Kondensator (Umwege werden
in 3D gezeigt); elektrisches Feld aus Leitungs- und Knotenladungen; Streufeld offener und
geschirmter Speicherdrosseln. Details: [docs/zukunft/STUFE-2-FLAECHENSTROEME.md](docs/zukunft/STUFE-2-FLAECHENSTROEME.md).

**Stufe 3 (in Arbeit):** Vollwelle mit openEMS. Die App exportiert einen Job,
`tools/openems/run_job.py` rechnet ihn lokal, und das Ergebnis lässt sich als zweite Feldquelle
neben das schnelle Modell legen: Volumen, Sonde, Scan und Fernfeld. Im quasistatischen Bereich
stimmen beide auf etwa 1 dB überein. Details: [tools/openems/README.md](tools/openems/README.md),
[docs/zukunft/STUFE-3-VOLLWELLE.md](docs/zukunft/STUFE-3-VOLLWELLE.md).

**Feldcheck für die CI:** dieselbe Rechnung als Node-Skript. Es meldet je Quelle Nahfeld,
Fernfeld-Abstand und Layout-Hinweise und schlägt an, wenn ein Pull Request etwas verschlechtert.
Das Skript liegt unter https://tombueng.github.io/emcvisual/cli/field-check.mjs, Anleitung in
[docs/CI-FELDCHECK.md](docs/CI-FELDCHECK.md).

**Stufe 4 (in Arbeit):** Reiter „Messung“: Ein 3D-Drucker fährt eine Nahfeldsonde über die
Platine, ein Empfänger misst je Punkt ein Spektrum, das Ergebnis erscheint als Schnitt in
Messhöhe und als Differenz zur Simulation. Ein virtueller Prüfstand misst die Simulation und
zeigt die ganze Kette ohne Hardware; die Treiber für OctoPrint, G-Code über USB und den tinySA
sind geschrieben, aber noch an keinem Gerät erprobt. Details:
[docs/zukunft/STUFE-4-MESSUNG-SCANNER.md](docs/zukunft/STUFE-4-MESSUNG-SCANNER.md).

Was später kommt (Flächenlöser, Phase und Wellen, Handsonde, VR):
[docs/ROADMAP.md](docs/ROADMAP.md).

## Loslegen

```bash
npm install
npm run dev
```

Dann im Browser „Demo-Platine“ wählen oder eine eigene `.kicad_pcb` (KiCad 6 bis 10) auf das
Fenster ziehen. In Chrome und Edge folgt die App der geöffneten Datei: Jedes Speichern in KiCad
lädt die Platine neu, Quellen und Ansicht bleiben (Abzeichen „live“ neben dem Dateinamen).

Echte Bauteilmodelle (rechts unter „Echte 3D-Bauteilmodelle“): Die Platinendatei nennt zu jedem
Bauteil nur den Pfad seines Modells, etwa `${KIPRJMOD}/3d/Relais.step` oder
`${KICAD10_3DMODEL_DIR}/Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm.step`. Die App sucht
die Datei nach ihrem Namen:

- in einem **Ordner** auf deinem Rechner („Ordner mit Modellen wählen …“, mit Unterordnern;
  die Dateien bleiben im Browser),
- in einem **GitHub-Repository** (`https://github.com/<owner>/<repo>` oder ein Unterordner
  `…/tree/<branch>/<pfad>`),
- im **Projektordner** einer Platine, die per Link geöffnet wurde (`${KIPRJMOD}/…` liegt neben
  der `.kicad_pcb`),
- in **KiCads Standardbibliothek** (von gitlab.com, STEP; abschaltbar).

Gibt es ein Modell mehrfach, gewinnt der gleiche Bibliotheksordner, dann STEP vor GLB, WRL und
STL. STEP wird im Browser mit OpenCascade (WebAssembly, im Hintergrund) in Dreiecke zerlegt,
mit den Farben aus der Datei. Bauteile ohne gefundenes Modell stehen in einer Liste.

Alternativ KiCads eigener Export: „Datei → Exportieren → glTF/GLB“ (ohne Platinenkörper) oder
`kicad-cli pcb export glb --no-board-body --subst-models board.kicad_pcb`, dann die `.glb`
zusätzlich auf das Fenster ziehen. Die Bauteile werden über ihre Referenz zugeordnet; das GLB
hat Vorrang vor den Bibliotheken.

### Beispielplatinen zum Ausprobieren

Öffentliche KiCad-Projekte, direkt von GitHub geladen (auch über „Beispiele …“ in der App):

| Platine | Was drauf ist | Lizenz |
|---|---|---|
| [Glasgow revC3](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2FGlasgowEmbedded%2Fglasgow%2FHEAD%2Fhardware%2Fboards%2Fglasgow%2FrevC3%2Fglasgow.kicad_pcb) | USB-Interface mit FPGA, Pegelwandler, 4 Lagen | 0BSD |
| [HackRF One](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2Fgreatscottgadgets%2Fhackrf%2FHEAD%2Fhardware%2Fhackrf-one%2Fhackrf-one.kicad_pcb) | SDR 1 MHz bis 6 GHz, USB, Takte, HF-Teil | GPL-2.0 |
| [Cynthion](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2Fgreatscottgadgets%2Fcynthion-hardware%2FHEAD%2Fcynthion.kicad_pcb) | USB-Analysator, 6 Lagen, mehrere USB-PHYs | CERN-OHL-P-2.0 |
| [Olimex ESP32-POE Rev M2](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2FOLIMEX%2FESP32-POE%2FHEAD%2FHARDWARE%2FESP32-PoE-hardware-revision-M2%2FESP32-PoE_Rev_M2.kicad_pcb) | ESP32 mit Ethernet (50-MHz-Takt) und PoE-Wandler, geteilte Flächen | Apache-2.0 |
| [OtterCastAudio V2](https://tombueng.github.io/emcvisual/?board=https%3A%2F%2Fraw.githubusercontent.com%2FOttercast%2FOtterCastAudioV2%2FHEAD%2FOtterCastAudioV2.kicad_pcb) | Audio-Streamer mit SoC, Ethernet und USB | MIT |

Die Platinen gehören ihren Projekten und stehen unter deren Lizenzen; sie liegen nicht in
diesem Repo.

Platinen lassen sich auch per Link öffnen: `?demo` lädt die Demo, `?board=<URL>` eine
`.kicad_pcb` von einem Server, der fremde Seiten lesen lässt (z. B. `raw.githubusercontent.com`),
optional mit `&models=<URL>` für das GLB.
Beispiel: [Glasgow revC3](https://tombueng.github.io/emcvisual/?board=https://raw.githubusercontent.com/GlasgowEmbedded/glasgow/HEAD/hardware/boards/glasgow/revC3/glasgow.kicad_pcb).

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Tests (Physik gegen analytische Lösungen, Parser gegen pcbnew-Referenzdaten) |
| `npm run e2e` | Playwright-Tests im Browser (vorher einmal `npx playwright install --only-shell chromium`) |
| `npm run check` | Typprüfung (TypeScript + Svelte) |
| `npm run build` | statische Seite nach `dist/`, dazu der Feldcheck nach `dist/cli/` |
| `npm run field-check -- board.kicad_pcb --scenario s.json` | Feldcheck ohne Browser, z. B. in der CI ([docs/CI-FELDCHECK.md](docs/CI-FELDCHECK.md)) |
| `npm run demo-board` | Demo-Platine mit KiCad (pcbnew-Python) neu erzeugen |
| `npm run check:codename` | prüft, dass der Arbeitstitel nur an erlaubten Stellen steht |

## Was die Simulation kann und was nicht

Sie zeigt zuverlässig, **wo** Stromschleifen Felder erzeugen und wie sich Änderungen auswirken
(Schleifenfläche, Rückstrompfad, Flankensteilheit). Sie sagt **nicht** voraus, ob ein Gerät
eine EMV-Prüfung besteht: keine Resonanzen, keine Kabel, kein Gehäuse. Die Annahmen und
Grenzen stehen in [docs/stufe-1/PHYSIK.md](docs/stufe-1/PHYSIK.md).

## Dokumentation

- [docs/ROADMAP.md](docs/ROADMAP.md): Stufen und Abhängigkeiten
- [docs/stufe-1/PLAN.md](docs/stufe-1/PLAN.md): Ziele, Meilensteine, Abnahmekriterien
- [docs/stufe-1/PHYSIK.md](docs/stufe-1/PHYSIK.md): Modell, Formeln, Gültigkeit, Literatur
- [docs/stufe-1/ARCHITEKTUR.md](docs/stufe-1/ARCHITEKTUR.md): Aufbau der App
- [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md): Entscheidungen mit Begründung
- [docs/zukunft/](docs/zukunft/): Stufen 2 bis 5 und Querschnittsthemen

## Lizenz

[0BSD](LICENSE) (Zero-Clause BSD): Jeder darf den Code für jeden Zweck nutzen, ändern und
weitergeben, auch kommerziell, ohne Namensnennung. openEMS (Stufe 3) steht unter GPL-3.0 und
wird separat installiert; es ist nicht Teil dieses Repos. Zum Lesen von STEP-Modellen lädt die
App [occt-import-js](https://github.com/kovacsv/occt-import-js) (OpenCascade als WebAssembly,
LGPL-2.1) unverändert als eigenen Worker mit eigener `.wasm`-Datei; dafür gilt dessen Lizenz.

**In English:** open source under the most permissive terms, [0BSD](LICENSE): use, change and
share it for any purpose, no attribution required.
