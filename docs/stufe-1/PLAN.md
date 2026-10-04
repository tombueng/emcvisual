# Stufe 1: Quasistatische Nahfeld-Simulation im Browser

Stand: 2026-10-04 · Status: M0–M6 umgesetzt, M7 teilweise (siehe Tabelle und §13)

Begleitdokumente:
- [PHYSIK.md](PHYSIK.md): das physikalische Modell mit allen Formeln, Annahmen und Gültigkeitsgrenzen
- [ARCHITEKTUR.md](ARCHITEKTUR.md): Module, Datenmodell, Rechen-, Render- und Audio-Pipeline, Dateiformate
- [../ROADMAP.md](../ROADMAP.md): Einordnung in alle Stufen

---

## 1. Ziel in einem Satz

Eine KiCad-Platine (`.kicad_pcb`) im Browser laden, Störquellen festlegen (Takte, Datenleitungen,
Schaltregler-Schleifen, Differenzpaare), das **magnetische Nahfeld** in einem 3D-Volumen um die
Platine berechnen und als begehbare **PCB-World mit Bild und Ton** erkunden, ohne Hardware,
ohne Server, und mit sofortiger Reaktion auf geänderte Signalparameter.

## 2. Ziele und Nicht-Ziele

### Ziele
1. **Reines Browser-Werkzeug.** Statische Web-App, keine Installation, kein Backend. Die
   Platinendatei verlässt den Rechner nicht.
2. **KiCad 6 bis 10 lesen.** Lagen, Lagenaufbau, Leiterbahnen (auch Bögen), Vias, Pads,
   Bauteile, gefüllte Zonen, Platinenumriss. Beide Netz-Schreibweisen (`(net 3 "CLK")` bis
   KiCad 9 und `(net "CLK")` ab KiCad 10).
3. **Physikalisch begründete Näherung** (Stufe A aus dem Ideenpapier): quasistatisches
   H-Feld per Biot-Savart über Stromsegmente, Rückströme in Bezugsflächen per Spiegelung,
   Abschirmung durch Flächen, Aussparungen in Flächen lokal berücksichtigt.
4. **Echtzeit-„Was wäre wenn“.** Das räumliche Feldmuster wird pro Quelle einmal gerechnet;
   Frequenz, Flankensteilheit, Amplitude, Tastgrad und Frequenzauswahl wirken danach ohne
   Neuberechnung (Linearität, siehe PHYSIK.md §6).
5. **PCB-World.** 3D-Platine, Feld als leuchtendes Volumen, Schnittebene in Sondenhöhe,
   Feldlinien, virtuelle Nahfeldsonde mit Spektrumanzeige, Verklanglichung (Sonification) mit
   räumlichem Klang.
6. **Diagnose.** Hotspots mit den nächstgelegenen Netzen und Bauteilen, Warnungen für
   unterbrochene Rückstrompfade (Schlitz/Aussparung unter einer Leitung) und Bezugslagenwechsel
   ohne nahe Stitching-Via, grobe Fernfeld-Abschätzung gegen CISPR-32-Grenzwerte
   (ausdrücklich als Orientierung gekennzeichnet).
7. **Nachvollziehbar.** Jede Formel steht in PHYSIK.md mit Quelle; jede Kernfunktion hat
   Tests gegen analytische Lösungen.

### Nicht-Ziele (bewusst später, siehe ROADMAP)
- keine Vorhersage, ob eine EMV-Prüfung bestanden wird
- keine Vollwellen-Simulation, keine Resonanzen, keine Laufzeiteffekte (Stufe 3)
- kein Löser für die Stromverteilung in Flächen; der Umweg des Rückstroms um einen Schlitz
  wird erkannt und gewarnt, aber nicht ausgerechnet (Stufe 2)
- keine Kabel, kein Gehäuse (Stufe 3 / Querschnitt)
- E-Feld nur als optionaler Meilenstein M8
- keine Messhardware (Stufen 4 und 5)

## 3. Nutzerablauf

1. **Start:** Seite öffnen, „Demo-Platine“ oder eigene `.kicad_pcb` per Drag & Drop oder
   Dateiauswahl laden.
2. **Platine:** erscheint in 3D (Substrat, Kupfer je Lage, Pads, Vias, Bauteilquader).
   Lagen ein-/ausblenden, Netz anklicken zeigt Namen und hebt es hervor.
3. **Bezugsflächen:** werden automatisch erkannt (Zonen eines Netzes decken mehr als die
   Hälfte einer Lage). Anzeige und Übersteuerung je Lage im Panel „Lagen“.
4. **Quellen:** Vorschläge aus Netznamen (CLK, XTAL, SCK, SW, USB_D±, …) und Pin-Typen
   (`pintype "output"`). Übernehmen oder von Hand anlegen: Takt/Digital, Differenzpaar,
   Stromschleife (Schaltregler). Parameter: Frequenz, Tastgrad, Anstiegszeit, Spannung bzw.
   Strom, Lastmodell.
5. **Berechnung:** startet automatisch im Hintergrund (Web Worker), erst grob (Vorschau),
   dann in gewählter Qualität. Fortschritt sichtbar, abbrechbar.
6. **Feld erkunden:** Volumen, Schnittebene, Feldlinien; Frequenzmodus „Gesamt“, „Band“
   (z. B. CISPR 30–230 MHz) oder „Einzellinie“ (Liste der stärksten Spektrallinien).
7. **Virtuelle Sonde:** mit der Maus über die Platine fahren; Spektrum am Sondenort wie auf
   einem Spektrumanalysator; Ton an: Quellen klingen, laut wo das Feld stark ist.
8. **Was wäre wenn:** Flanke langsamer, Takt halbieren, Quelle stumm schalten: Bild und Ton
   folgen sofort.
9. **Diagnose:** Hotspot-Liste, Warnungen, Fernfeld-Abschätzung.
10. **Speichern:** Szenario als JSON (Quellen, Einstellungen); automatische Sicherung im
    Browser je Platine.

## 4. Physikalisches Modell (Kurzfassung)

Details, Herleitungen und Quellen: [PHYSIK.md](PHYSIK.md).

- **Größe:** magnetische Feldstärke H in A/m, angezeigt als dBµA/m.
- **Quasistatik:** Feld = Biot-Savart der momentanen Stromverteilung; Retardierung wird
  vernachlässigt. Gültig für Abstände ≪ λ/2π und elektrisch kurze Leitungen; die App zeigt die
  Gültigkeitsgrenze je Quelle an.
- **Stromgeometrie:** Leiterbahnen und Vias als gerade Stromfäden (Bögen werden zerlegt),
  mit Kernradius gegen die 1/r-Singularität.
- **Rückstrom:** ideale leitende Bezugsfläche → Spiegelstrom (tangential umgekehrt, normal
  gleich). Bezugsfläche je Element = nächste Flächenlage, die an dieser Stelle tatsächlich
  Kupfer hat. Unter einer Aussparung springt das Bild zur nächsten Fläche oder entfällt.
- **Abschirmung:** Feldpunkte jenseits einer an dieser Stelle vorhandenen Fläche erhalten
  keinen Beitrag des Elements.
- **Ströme aus Signalen:** Trapez-Signal → Fourier-Reihe; Lastmodell kapazitiv
  (I = jωC·V, Stromverteilung im Netzbaum nach nachgelagerter Kapazität, Verschiebungsstrom
  zur Fläche) oder abgeschlossen (I = V/Z0).
- **Überlagerung:** innerhalb einer Quelle kohärent (Vektorsumme), zwischen Quellen
  inkohärent (Leistungssumme), da unabhängige Takte nicht phasenstarr sind.
- **Fernfeld-Orientierung:** magnetisches Dipolmoment der Stromverteilung samt Spiegeln →
  E in 3 m (Ott), mit Bodenreflexion ×2, gegen CISPR 32 Klasse B.

## 5. Architektur (Kurzfassung)

Details: [ARCHITEKTUR.md](ARCHITEKTUR.md).

```
.kicad_pcb ──► S-Expr-Parser ──► BoardModel ──► Lagen/Flächen-Raster ──► Konnektivität
                                                                   │
Szenario (Quellen) ──────────────────────────────────────► Stromelemente + Spiegel + Spektren
                                                                   │
                                     Worker-Pool: |h_s(r)|² je Quelle auf dem 3D-Gitter
                                                                   │
            Frequenzauswahl ──► Komposition Σ w_s·|h_s|² (ms) ──► 3D-Textur ──► Raymarching
                                                                   │
               Sonde (Maus) ──► exaktes Biot-Savart am Punkt ──► Spektrum + Audio (PeriodicWave)
```

- TypeScript, Vite, Svelte 5 (Bedienoberfläche), three.js (3D), Web Workers (Rechnung),
  Web Audio API (Klang), Vitest (Tests). Kein Backend.
- Rechenkern als reine TypeScript-Funktionen ohne DOM, damit er in Workern, Tests und
  später in einem WebGPU- oder Kommandozeilen-Backend gleich läuft.

## 6. Meilensteine

Jeder Meilenstein endet mit grünen Tests, aktualisierter Doku und einem Commit.

| # | Inhalt | Status |
|---|---|---|
| M0 | Grundgerüst, Branding/Umbenennung, CI, Doku | erledigt |
| M1 | KiCad-Import, Lagenaufbau, 3D-Platine, Demo-Platine | erledigt |
| M2 | Physik-Kern: Spektren, Leitungsparameter, Konnektivität, Stromelemente, Spiegel, Biot-Savart | erledigt |
| M3 | Feldgitter, Worker-Pool, Komposition, Volumen- und Schnittdarstellung | erledigt |
| M4 | Quellen-Editor, Vorschläge, Szenario speichern/laden | erledigt |
| M5 | Virtuelle Sonde, Spektrumanzeige, Verklanglichung | erledigt |
| M6 | Feldlinien, Hotspots, Rückstrom-Warnungen, Fernfeld-Abschätzung | erledigt |
| M7 | Feinschliff: Ameisen-Modus, Export, Englisch, GitHub Pages, Leistung | teilweise: Ameisenblick, PNG/CSV-Export, Playwright-Tests erledigt; Englisch und Pages offen |
| M8 | optional: quasistatisches E-Feld, WebGPU-Rechenkern | offen |

### M0 Grundgerüst
- Vite + TypeScript + Svelte 5 + three.js, ESLint-freie, aber strikte TS-Konfiguration
  (`strict`, `noUncheckedIndexedAccess`).
- `branding.config.json` als einzige Quelle für den Namen; `scripts/check-codename.mjs`
  (CI) und `scripts/rename.mjs`; Plan in [../RENAMING.md](../RENAMING.md).
- GitHub Actions: Typprüfung, Tests, Build, Codename-Prüfung; Pages-Deployment
  abschaltbar über Repo-Variable.
- **Abnahme:** `npm ci && npm run check && npm test && npm run build` grün, lokal und in CI.

### M1 KiCad-Import und 3D-Platine
- S-Expression-Tokenizer/-Parser (Strings mit Escapes, Zahlen, Atome), tolerant gegenüber
  unbekannten Knoten.
- BoardModel: Kupferlagen mit z-Lage aus `(setup (stackup …))`, sonst Standardaufbau
  (2 Lagen: 1,6 mm FR4; 4 Lagen: JLC04161H-7628; 6 Lagen: gleichmäßig verteilt).
  Elemente: `segment`, `arc`, `via` (auch blind/buried), `footprint` mit `pad`
  (Transformation lokal → Platine, `*.Cu`, `pintype`, `pinfunction`), `zone` mit
  `filled_polygon` (Keyhole-Polygone), Umriss aus `Edge.Cuts` (`gr_line`, `gr_arc`,
  `gr_rect`, `gr_circle`, `gr_poly`, auch in Footprints) zu geschlossenen Ringen verkettet.
- 3D-Darstellung: Substrat als extrudierter Umriss, Kupfer je Lage als zusammengeführte
  Geometrie, Pads, Vias als Zylinder, Bauteile als Quader aus dem Courtyard, Lagen
  ein-/ausblendbar, Netz-Picking mit Hervorhebung.
- Demo-Platine per pcbnew-Skript erzeugt (`tools/demo-board/`), mit typischen EMV-Sünden
  (siehe §9).
- **Abnahme:** Pad-Positionen und -Winkel der Demo- und Testplatinen stimmen auf 1 µm mit
  pcbnew überein (Testdaten von pcbnew exportiert); 10 000 Elemente in < 1 s geparst.

### M2 Physik-Kern
- `spectrum`: Trapez-Fourier-Reihe, Bänder, Linienlisten, Einheiten.
- `lines`: Mikrostreifen- und Streifenleiter-Z0, εeff, C' (Hammerstad/Jensen, IPC-2141).
- `planes`: Rasterung der Flächenzonen (Scanline, 0,1–0,25 mm), Bedeckungsabfrage.
- `connectivity`: Netzgraph aus Segmenten, Bögen, Vias, Pads, Zonen; Brücken über
  Zweipol-Bauteile (Serienwiderstand) zwischen Netzen derselben Quelle.
- `currents`: Quelle → Stromelemente (horizontal, vertikal) mit relativen Gewichten;
  kapazitives Lastmodell (Baum, Verschiebungsströme) und abgeschlossenes Modell;
  Schleifen über Pad-Folgen mit kürzesten Wegen; Differenzpaare mit Unsymmetrie.
- `images`: Bezugsfläche je Element mit lokaler Bedeckung, Zerlegung an Bedeckungsgrenzen,
  Spiegelelemente, Abschirm-„Fächer“ (Slots) je Element.
- `biotsavart`: geschlossene Formel für endliche Fäden (Hanson/Hirshman), Kernregularisierung.
- **Abnahme:** Tests gegen analytische Lösungen (unendlicher Draht, Quadratschleife im
  Mittelpunkt, Kreisschleife auf der Achse, Feld unter einer idealen Fläche ≈ 0,
  Trapezspektrum gegen numerische FFT, Z0 eines 50-Ω-Mikrostreifens).

### M3 Feldberechnung und Volumen
- Gitter aus Umriss + Rand, Qualität „Vorschau“ (2 mm), „Normal“ (1 mm), „Fein“ (0,5 mm).
- Worker-Pool (Hardware-Threads − 1), Aufteilung in z-Scheiben, Fortschritt, Abbruch über
  Generationszähler, Cache je Quelle über einen Geometrie-Hash.
- Komposition Σ w_s·|h_s|² → dB → 8-Bit-3D-Textur; Fenster (dB min/max) im Shader.
- Raymarching-Volumen mit Tiefentest gegen die Platine (Render-Target mit Tiefentextur),
  Farbskalen (Inferno, Turbo), Opazitätskurve, Jitter gegen Streifen.
- Schnittebene (horizontal in Sondenhöhe, optional vertikal) als Heatmap.
- **Abnahme:** Demo-Platine in „Normal“ in < 5 s auf einem 8-Kern-Laptop; Umschalten der
  Frequenzauswahl < 30 ms; 60 fps bei 1080p auf integrierter Grafik (Raymarching-Schritte
  begrenzt, halbe Auflösung als Option).

### M4 Quellen und Szenario
- Quellentypen: `signal` (Takt/Daten), `diffpair`, `loop`; Parameterformulare mit
  Einheiten-Eingabe („25 MHz“, „1 ns“, „3,3 V“).
- Vorschläge aus Netznamen und Pin-Typen, Treiber-Erkennung über `pintype "output"`.
- Netz- und Pad-Auswahl mit Suche; Pads auch per Klick in der 3D-Ansicht.
- Szenario-JSON (versioniert, Migrationsfunktion), Download/Upload, Autosave je
  Platinen-Hash in `localStorage` (Namensraum unabhängig vom Codenamen).
- **Abnahme:** Szenario der Demo-Platine wird gespeichert, neu geladen und ergibt
  identische Felder; Spektrums-Parameter ändern löst keine Neuberechnung aus.

### M5 Virtuelle Sonde, Spektrum, Klang
- Sonde: Raycast auf die Ebene in Sondenhöhe; Position, Höhe, Schleifendurchmesser.
- Spektrum am Sondenort: exakte Biot-Savart-Auswertung je Quelle (kein Gitter),
  Linien mit RBW-Form, log/lin-Achse, Summe und je Quelle farbig, Grenzlinien optional.
- Klang: je Quelle ein `OscillatorNode` mit `PeriodicWave` aus den Oberwellen-Amplituden;
  lineare Frequenzabbildung (Oberwellen bleiben harmonisch: Takte klingen als Ton,
  Schaltregler als Schnarren); Lautstärke aus dem Feld am Sondenort; räumlich über
  `PannerNode` (HRTF) am Hotspot der Quelle; Stumm/Solo je Quelle; Startknopf (Autoplay-Regel).
- **Abnahme:** Sonde über dem Hotspot ist hörbar lauter als 10 mm daneben; zwei Takte mit
  25 und 33,3 MHz klingen als zwei Töne im Verhältnis 3:4.

### M6 Feldlinien und Diagnose
- Feldlinien je Quelle: Startpunkte auf Ringen um die stärksten Elemente, RK4 auf exakter
  Biot-Savart-Richtung, Abbruch bei Rückkehr, Austritt oder Schwäche; animierter Fluss.
- Hotspots: lokale Maxima in Sondenhöhe, Zuordnung zu Netzen/Bauteilen im Umkreis.
- Warnungen: Rückstrompfad unterbrochen (Bedeckungslücke ≥ 1 mm unter einem Element),
  Bezugswechsel (anderes Flächennetz nach Via) und fehlende Stitching-Via (gleiches Netz,
  andere Lage, keine Via < 3 mm), Leitung elektrisch lang (λ/10-Regel).
- Fernfeld-Orientierung je Quelle und Linie, Diagramm mit CISPR-32-B-Grenzen (3 m / 10 m).
- **Abnahme:** Die Demo-Platine liefert genau die eingebauten Sünden als Warnungen; die
  „schlechte“ Schaltregler-Schleife hat ein höheres Fernfeld als die „gute“.

### M7 Feinschliff
- Ameisen-Modus (Ego-Perspektive knapp über der Platine, WASD/Maus), Kamerafahrten.
- Export: Bildschirmfoto (PNG), Schnittebene als CSV, Spektrum als CSV.
- Englische Oberfläche (Wörterbuch existiert ab M0, Übersetzung hier).
- GitHub-Pages-Deployment, Leistungsoptimierung, Barrierefreiheit der Panels.
- Playwright-Smoke-Test: Demo laden, rechnen, Sonde bewegen, Screenshot vergleichen.

### M8 Optional
- Quasistatisches E-Feld über Linienladungen q' = C'·V mit Spiegelladungen (PHYSIK.md §10).
- WebGPU-Compute-Kernel für Biot-Savart (Faktor 50–100 gegenüber CPU); CPU-Kern bleibt
  Referenz und Rückfallebene.

## 7. Test- und Validierungsstrategie

1. **Analytische Referenzen** (Vitest, M2): siehe Abnahme M2. Toleranzen ≤ 1 %.
2. **Format-Referenzen** (M1): pcbnew exportiert Pad-Positionen, Winkel, Netze und
   Flächeninhalte der Testplatinen als JSON; der Parser muss sie reproduzieren.
3. **Plausibilität** (M3/M6): Feld nimmt über einer Mikrostreifenleitung mit der Höhe ab
   wie das Linienpaar (≈ 1/r² für r ≫ h); Differenzpaar < Einzelleitung; Aussparung erhöht
   das Feld.
4. **Querprüfung später:** Stufe 3 (openEMS) und Stufe 4 (Messung) an denselben
   Referenzstrukturen; Abweichungen werden in PHYSIK.md dokumentiert.
5. **Oberfläche:** Playwright-Smoke-Test ab M7.

## 8. Leistungsbudget

| Vorgang | Ziel |
|---|---|
| Parsen 10 000 Elemente | < 1 s |
| Flächen-Raster 100×100 mm bei 0,2 mm | < 200 ms |
| Feld einer Quelle, Gitter 200k Punkte, 2 000 Elemente, 8 Worker | < 2 s |
| Neukomposition (Frequenz/Parameter) | < 30 ms |
| Sonde: Spektrum + Klang je Mausbewegung | < 5 ms |
| Darstellung | 60 fps bei 1080p, integrierte GPU |

Speicher: je Quelle ein Float32-Volumen (200k Punkte ≈ 0,8 MB, Fein ≈ 6 MB);
Vektorfelder werden nicht gespeichert (Feldlinien rechnen exakt).

## 9. Demo-Platine „EMV-Sünden“

4 Lagen (JLC04161H-7628), 80 × 50 mm, In1 = GND, In2 = +3V3. Enthält bewusst:
1. **Schaltregler gut:** Eingangskondensator direkt an VIN/GND, kurze Schleife über
   durchgehender Fläche.
2. **Schaltregler schlecht:** Eingangskondensator 15 mm entfernt, GND-Rückweg als eigene
   Leiterbahn auf F.Cu, beide Flächen unter dem Regler ausgespart.
3. **Takt gut:** 25-MHz-Oszillator kurz zum Controller, Serienwiderstand am Treiber,
   durchgehende Fläche.
4. **Takt schlecht:** 33,3-MHz-Oszillator, lange Leitung über einen Schlitz in In1, Lagenwechsel
   auf B.Cu (Bezug +3V3) ohne Stitching-Via.
5. **USB-Differenzpaar** (Full Speed) mit kleiner Unsymmetrie.
6. Langsame Signale (LED, Taster) als Gegenbeispiel ohne nennenswertes Feld.

Zugehöriges Szenario (`public/demo/demo-board.scenario.json`) mit allen Quellen.

## 10. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| KiCad-Formatvarianten (6–10) | toleranter Parser, Testkorpus aus mehreren Versionen, pcbnew-Referenzdaten |
| CPU-Rechnung zu langsam bei großen Platinen | grobe Vorschau zuerst, nur Quellnetze rechnen, Cache, später WebGPU (M8) |
| Quasistatik wird für bare Münze genommen | Gültigkeitsgrenzen je Quelle, Hinweise „Orientierung“, PHYSIK.md verlinkt |
| Volumen-Darstellung unübersichtlich | Schnittebene als Standard, dB-Fenster, Isoflächen später |
| Rückstrom unter Aussparungen falsch | lokale Bedeckung im Spiegelmodell, Warnungen, echte Lösung in Stufe 2 |
| Klang nervt | standardmäßig aus, sanfte Lautheitskurve, Stumm/Solo |
| Unklare Bezugsflächen bei 2-Lagen-Platinen | Bezug je Lage übersteuerbar, Warnung „kein Bezug“, Ersatzannahme sichtbar |

## 11. Offene Fragen an den Projektinhaber

1. Lizenz (z. B. MIT wie LuxDMX oder GPL wegen der Nähe zu KiCad)?
2. Repo öffentlich machen, und ab wann?
3. Oberfläche nur Deutsch oder von Anfang an zweisprachig ausliefern?
4. Zielbrowser: nur Chromium/Firefox aktuell, oder auch Safari?

## 12. Definition of Done für Stufe 1

- Alle Meilensteine M0–M7 erledigt, M8 bewusst entschieden.
- Demo-Platine und mindestens zwei echte Platinen (2 und 4 Lagen) laufen fehlerfrei.
- Doku (PHYSIK, ARCHITEKTUR, README) beschreibt den tatsächlichen Stand.
- GitHub Pages zeigt die aktuelle Version (sofern das Repo öffentlich ist).

## 13. Umsetzungsnotizen (Abweichungen und Ergänzungen zum Plan)

Stand 2026-10-04, nach dem ersten Durchgang M0–M6.

- **Gemessene Zahlen.** Demo-Platine im Gitter „Normal“ (1 mm): alle sechs Quellen in
  0,1–0,2 s (Worker-Pool). Echte Platinen (KiCad-Demos, eigene 4-Lagen-Platine): 0,2–1,6 s
  je Quelle auf einem Kern, also deutlich unter dem Budget. Parser: 85 MB / 12 Lagen in 2,8 s.
- **Testkorpus.** 42 Platinen von KiCad 6 bis 10 lesen fehlerfrei; Pads, Vias, Leiterbahn-
  längen und Zonenflächen stimmen bei der Demo und drei KiCad-Demos mit pcbnew überein.
- **Diagnose an der Demo.** Gefunden werden genau die eingebauten Fehler (Schlitz-Kreuzung,
  zwei Bezugswechsel GND ↔ +3V3, fehlende Flächen unter dem schlechten Regler, langer Takt);
  guter Takt, guter Regler und USB-Paar bleiben ohne Hinweis.
- **Vias in Freistellungen.** Ein Via sitzt in einem Loch der Fläche, die es durchquert. Für
  Rückweg und Spiegel zählt deshalb Kupfer im Umkreis von 0,8 mm (`coveredNear`).
- **Gleiche Pad-Nummern** innerhalb eines Footprints (Ausweichbohrungen, Exposed Pads) sind
  ein Pin: Sie werden verbunden und nur einmal als Last gezählt.
- **Leiterbahn-Enden** berühren ein Pad oder Via, sobald ihre halbe Breite das Kupfer
  erreicht (BGA-Dogbones).
- **Langsame Signale** (z. B. 1 kHz) hätten mehr als 4096 Oberwellen: Es wird jede k-te Linie
  mit √k skaliert behalten (Bandleistung bleibt erhalten, PHYSIK.md §3.3).
- **Automatisches dB-Fenster** 60 dB unter dem Maximum; Leuchten überwiegend emissiv, damit
  die Platine sichtbar bleibt.
- **Hotspots**: lokale Maxima in Sondenhöhe, höchstens zwei je dominierender Quelle, damit
  leisere Quellen in der Liste auftauchen.
- **Offen aus M7:** englische Oberfläche (Wörterbuch-Struktur steht), GitHub Pages (braucht
  ein öffentliches Repo oder einen Plan mit privaten Pages).
