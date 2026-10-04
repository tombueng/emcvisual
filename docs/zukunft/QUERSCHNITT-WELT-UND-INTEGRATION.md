# Querschnitt: PCB-World, Klang, Integration

Stand: 2026-10-04 · Status: Ideen, konserviert. Diese Themen hängen an keiner einzelnen
Stufe und können parallel wachsen.

## W1 Immersion
- **WebXR:** dieselbe Szene auf einer VR-Brille (Quest-Browser), Platine im Raum,
  Maßstab frei („Ameisengröße“: 1 mm wird 1 m). Handcontroller = Sonde.
  **Umgesetzt (2026-10-04), experimentell:** Wo der Browser „immersive-vr“ kann, erscheint
  in der 3D-Ansicht der Knopf „ENTER VR“. In der Brille liegt die Platine fünffach vergrößert auf
  Tischhöhe vor einem; statt des Leuchtens (braucht den Tiefenpass des flachen Bildschirms)
  zeigt sie die Isoflächen. Noch nicht an einer Brille geprüft; Controller als Sonde und der
  Ameisenmaßstab fehlen noch.
- **Ameisen-Modus am Bildschirm** (Stufe 1, M7): Ego-Perspektive knapp über der Platine.
- **Geführte Touren:** Lernpfade über die Demo-Platine („Warum ist diese Schleife laut?“),
  mit Kamerafahrten, Text und Klangbeispielen.

## W2 Visuelle Effekte
- Isoflächen (Marching Cubes / Surface Nets) als „Blasen“ bei wählbaren dB-Schwellen.
  **Umgesetzt (2026-10-04):** Surface Nets, drei durchscheinende Schalen bei 35, 60 und 85 %
  des Anzeigebereichs in den Farben der Farbskala; Schalter „Isoflächen“ in der Ansicht
  (`src/render/isosurface.ts`).
- Partikel, die entlang der Feldlinien fließen (Geschwindigkeit ∝ |H|).
- Hitzeflimmern-Shader über Hotspots, Bloom/Glühen, Nebel-Volumen.
- Farbe nach Frequenzband (z. B. rot = Taktoberwellen < 100 MHz, blau = GHz).
- Zeitanimation: einzelne Quelle pulsiert mit ihrer Frequenz (verlangsamt); mehrere Quellen
  ergeben Schwebungen; mit Phase (Stufe 3/5) laufende Wellen.
- Platine als Glas: Lagen halbtransparent, Rückströme darunter sichtbar (Stufe 2).

- **Sprechblasen** (umgesetzt 2026-10-04): HTML über der 3D-Ansicht, an Punkte der Szene
  geheftet und nach jedem gezeichneten Bild nachgeführt. Hinweise tragen dieselbe Nummer wie in
  der Diagnose-Rangliste und zeigen, was die Behebung im Fernfeld bringt; Quellen zeigen
  Nahfeld-Maximum und Abstand zum Grenzwert, Hotspots ihren Pegel. Blasen weichen einander
  aus (höher, dann links); ohne Platz bleibt von einem Hinweis die nummerierte Nadel. Klick
  setzt die Sonde dorthin oder wählt die Quelle. Schalter unter „Sprechblasen in 3D“
  (`src/ui/Callouts.svelte`).
- **Sprechblasen im Raum** (umgesetzt 2026-10-05, experimentell): Mit HTML-in-Canvas (WICG,
  Origin Trial in Chrome und Edge seit Google I/O 2026, verlängert bis Chrome 160) sind die
  Blasen echte HTML-Elemente als Kinder des WebGL-Canvas. three.js (`HTMLTexture`,
  `InteractionManager`, ab r184) zeichnet sie als Textur auf Flächen, die zum Betrachter zeigen.
  Bauteile davor verdecken sie, in der Ferne werden sie kleiner, und sie erscheinen auch in VR,
  wo die Einblendung nicht zu sehen ist. Klicks erreichen sie weiter über CSS-`matrix3d`. Die
  Textur entsteht erst nach dem ersten `paint`-Ereignis des Elements; vorher schlägt das
  Hochladen fehl („No cached paint record“). Die Blasen weichen einander im Bildraum aus wie die
  Einblendung. Schalter „Im Raum statt als Einblendung“, nur wo der Browser es kann
  (`src/render/worldCallouts.ts`).
  - Für die Seite selbst braucht es ein Origin-Trial-Token für https://tombueng.github.io
    (`originTrialTokens` in `seo.config.json`). Ohne Token geht es nur mit
    `chrome://flags/#canvas-draw-element`.
  - Chrome 155 benennt die API um (`content="drawable"`, `texElementSubImage2D`). three.js r186
    kennt noch die ältere Fassung; bis three.js nachzieht, fällt Chrome 155+ auf die
    Einblendung zurück (Erkennung über `texElementImage2D`).

## W3 Klang (Verklanglichung)
- **Linear/harmonisch** (Stufe 1): Takte als Töne, Schaltregler als Schnarren.
- **Logarithmisch:** ganzer HF-Bereich auf wenige Oktaven gestaucht (Oberwellen nicht mehr
  harmonisch, dafür alles hörbar). Eigene Oszillatoren je Linie.
- **Geigerzähler** (umgesetzt 2026-10-04): Klicks als Poisson-Prozess, Rate logarithmisch über
  das Anzeigefenster, 0,5 Klicks/s am unteren und 100/s am oberen Ende; Auswahl „Klang“ im
  Ton-Bereich. Intuitiv beim Suchen.
- **Echter Klang:** AM-demodulierte Aufnahmen an Hotspots (Stufe 4/5).
- **Klanglandschaft:** Kamera als Hörer, alle Quellen räumlich (HRTF), Lautheit nach Abstand
  und Feld.
- **Barrierefreiheit:** Klang als zweiter Kanal für Menschen, die Farbskalen schlecht lesen.

## W4 KiCad-Integration

**Umgesetzt (2026-10-04): Live-Kopplung ohne Brücke.** In Chromium-Browsern (Chrome, Edge)
öffnet „Platine öffnen“ die Datei über die File System Access API, ebenso beim Hineinziehen.
Die App prüft jede Sekunde, ob sich die Datei geändert hat; speichert KiCad, wird die Platine
neu gelesen, und Quellen, Einstellungen, Ansicht, Kamera und Bauteilmodelle bleiben. Bauteile,
die seit dem GLB-Export verschoben oder gedreht wurden, folgen ihrem Footprint (das GLB legt
jeden Knoten auf den Footprint-Ursprung). Ein halb geschriebener Stand wird bis zu dreimal neu
versucht. Das Abzeichen „live“ neben dem Dateinamen beendet das Folgen. Code:
`src/state/liveFile.svelte.ts`; E2E-Test mit einem nachgebildeten Datei-Handle. Firefox und
Safari öffnen die Datei wie bisher einmalig.

**Umgesetzt (2026-10-05): echte Bauteilmodelle aus den eigenen Bibliotheken.** Die
Footprints nennen ihr Modell als Pfad mit Variablen (`${KIPRJMOD}`, `${KICAD10_3DMODEL_DIR}`,
eigene). Die App sucht nach dem Dateinamen ohne Endung in einem gewählten Ordner (File System
Access API oder `<input webkitdirectory>`), in GitHub-Repositories (eine Anfrage an die
Trees-API, die Dateien von `raw.githubusercontent.com`), neben einer per Link geöffneten
Platine und in KiCads Bibliothek auf gitlab.com (Datei-API mit CORS; die GitHub-Spiegelung
`KiCad/kicad-packages3D` ist seit 2021 archiviert, und seit KiCad 9 gibt es nur noch STEP).
Platziert wird wie in KiCads 3D-Ansicht: Footprint-Lage und -Drehung, Unterseite gespiegelt,
dann Versatz, Drehung (als −z, −y, −x) und Maßstab des Modells; WRL in 0,1 Zoll. Gegen KiCads
GLB-Export geprüft: bis auf 0,15 mm gleich (`tests/modelPlacement.test.ts`). STEP zerlegt
OpenCascade als WebAssembly (7,6 MB, erst beim ersten STEP geladen) in einem Worker; Farben je
Fläche werden zu Materialgruppen. Jede Datei wird einmal geladen und von allen Bauteilen und
Platinen geteilt. Code: `src/render/modelLibrary.ts`, `modelPlacement.ts`, `step.worker.ts`.

- **Live-Kopplung:** KiCad 9/10 hat eine IPC-API (Python-Bindings). Eine kleine lokale Brücke
  liest die offene Platine und streamt Änderungen an die Browser-App: Via verschieben in
  KiCad → Feld aktualisiert sich. Gleiche Brücke kann später openEMS starten (Stufe 3).
- **Action-Plugin:** Knopf in pcbnew öffnet die App mit der aktuellen Platine.
- **Rückweg:** Hotspots und Warnungen als DRC-Markierungen oder Kommentare zurück nach KiCad.
- **Netzklassen/Regeln:** Quellen-Vorschläge aus Netzklassen (z. B. „HighSpeed“).
- **Schaltplan-Daten:** Netzliste und Bauteilwerte (z. B. Serienwiderstand, Lastkapazität,
  Taktfrequenz aus Feldern) für bessere Quellenparameter.

## W5 Vergleiche und Berichte

**Umgesetzt (2026-10-04): Bericht.** „Bericht speichern“ im Reiter Diagnose schreibt eine
HTML-Datei ohne externe Abhängigkeiten: Bild der 3D-Ansicht, Kennzahlen, Hinweise zum Layout,
Hotspots mit Ort und Nachbarschaft, Fernfeld-Abstand je Quelle gegen CISPR 32 B, Quellen und
Einstellungen (einschließlich der Feldquelle: schnell oder openEMS). Hell und druckbar, im
Browser als PDF speicherbar; Sprache wie die Oberfläche. Code: `src/report/`.

- **Varianten:** zwei Platinenstände oder zwei Szenarien laden, Differenzvolumen in dB.
- **Sim ↔ Messung:** gleiche Darstellung, Differenz, Kalibrierfaktor.
- **Bericht:** HTML/PDF mit Hotspots, Spektren, Warnungen, Fernfeld-Abschätzung, Bildern.

## W6 Plattform
- WebGPU-Rechenkern (Stufe 1 M8), später auch für Stufe-2-Löser.
- Kommandozeilen-Variante (Node) für CI: „Feld-Regression“ bei jedem Commit eines
  Hardware-Projekts (Hotspot wurde 6 dB lauter → Hinweis im Pull Request). **Umgesetzt
  (2026-10-04):** `src/cli/`, Anleitung in [../CI-FELDCHECK.md](../CI-FELDCHECK.md).
- Plugin-Schnittstelle für eigene Quellentypen.

## W7 Wissen
- Bibliothek von Referenzstrukturen (Testplatinen mit Messdaten und Simulation).
- Erklärtexte zu jeder Warnung mit Literaturverweis.
