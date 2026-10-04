# Querschnitt: PCB-World, Klang, Integration

Stand: 2026-10-04 · Status: Ideen, konserviert. Diese Themen hängen an keiner einzelnen
Stufe und können parallel wachsen.

## W1 Immersion
- **WebXR:** dieselbe Szene auf einer VR-Brille (Quest-Browser), Platine im Raum,
  Maßstab frei („Ameisengröße“: 1 mm wird 1 m). Handcontroller = Sonde.
- **Ameisen-Modus am Bildschirm** (Stufe 1, M7): Ego-Perspektive knapp über der Platine.
- **Geführte Touren:** Lernpfade über die Demo-Platine („Warum ist diese Schleife laut?“),
  mit Kamerafahrten, Text und Klangbeispielen.

## W2 Visuelle Effekte
- Isoflächen (Marching Cubes / Surface Nets) als „Blasen“ bei wählbaren dB-Schwellen.
- Partikel, die entlang der Feldlinien fließen (Geschwindigkeit ∝ |H|).
- Hitzeflimmern-Shader über Hotspots, Bloom/Glühen, Nebel-Volumen.
- Farbe nach Frequenzband (z. B. rot = Taktoberwellen < 100 MHz, blau = GHz).
- Zeitanimation: einzelne Quelle pulsiert mit ihrer Frequenz (verlangsamt); mehrere Quellen
  ergeben Schwebungen; mit Phase (Stufe 3/5) laufende Wellen.
- Platine als Glas: Lagen halbtransparent, Rückströme darunter sichtbar (Stufe 2).

## W3 Klang (Verklanglichung)
- **Linear/harmonisch** (Stufe 1): Takte als Töne, Schaltregler als Schnarren.
- **Logarithmisch:** ganzer HF-Bereich auf wenige Oktaven gestaucht (Oberwellen nicht mehr
  harmonisch, dafür alles hörbar). Eigene Oszillatoren je Linie.
- **Geigerzähler:** Klickrate ∝ Feldstärke; intuitiv beim Suchen.
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
  Hardware-Projekts (Hotspot wurde 6 dB lauter → Hinweis im Pull Request).
- Plugin-Schnittstelle für eigene Quellentypen.

## W7 Wissen
- Bibliothek von Referenzstrukturen (Testplatinen mit Messdaten und Simulation).
- Erklärtexte zu jeder Warnung mit Literaturverweis.
