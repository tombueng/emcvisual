# Stufe 5: Erweiterte Messung (Handsonde mit Ortung, Sonden-Array, Phase)

Stand: 2026-10-04 · Status: Idee, konserviert · Voraussetzung: Stufe 4

## 5.1 Handsonde mit optischer Ortung („Feld malen“)

**Idee:** Statt Drucker die Sonde von Hand führen. Eine Kamera verfolgt einen Marker an der
Sonde, jede Messung landet mit Position im 3D-Volumen. Die PCB-World füllt sich live.

- **Ortung:** ArUco-/AprilTag-Marker am Sondengriff, Webcam über der Platine; im Browser
  mit OpenCV.js oder js-aruco2. Kalibrierung der Kamera mit Schachbrett; Marker auf der
  Platine (oder Passmarken) für die Platinen-Koordinaten.
  Alternativen: VR-Tracker (Lighthouse), Handy-AR (WebXR Hit-Test), Leap-artige Sensoren.
- **Messung:** wie Stufe 4, aber kontinuierlich (tinySA im schnellen Modus auf wenige
  Frequenzen beschränkt, oder HackRF-Sweep).
- **Volumen aus Streupunkten:** Messpunkte in ein Gitter einsortieren (gewichtete Mittelung,
  Max), Lücken per Interpolation (Kriging / RBF) mit Unsicherheitskarte.
- **Vorteil:** schnell, intuitiv, auch um Gehäuse und **Kabel** herum (dort sitzt der
  Gleichtakt). **Nachteil:** Positions- und Ausrichtungsfehler (±1–2 mm, Winkel).
- **AR-Sicht:** Kamerabild der echten Platine mit überlagertem Feld (Video-Passthrough).

## 5.2 Sonden-Array („EMV-Kamera“)

**Idee:** Viele kleine Leiterschleifen auf einer Platine (z. B. 8 × 8, Raster 5 mm), über
HF-Umschalter nacheinander auf einen Empfänger geschaltet. Bild in Sekunden, ohne Mechanik.

- Schleifen als Leiterbahnschleifen auf einer 4-Lagen-Platine, Zuleitungen als
  Streifenleiter; Umschalter-Baum aus SP8T-Schaltern (GaAs/SOI, bis einige GHz).
- Steuerung per Mikrocontroller (USB), Empfänger wie Stufe 4.
- Auflösung = Rastermaß; feiner durch mechanisches Versetzen um Bruchteile (Sub-Pixel-Scan).
- Kalibrierung je Schleife (Pfaddämpfung) mit bekanntem Feld.
- Kommerzielles Vorbild ist das Prinzip der Scanner mit Schleifenmatrix; hier als
  Selbstbau-Projekt (eigene KiCad-Platine; passt zum Werkzeug, das sich dann selbst prüft).

## 5.3 Phase: kohärente Messung

**Idee:** Neben dem Betrag auch die Phase messen. Dann sind Wellen animierbar, Quellen
rekonstruierbar und das Fernfeld aus dem Nahfeld berechenbar.

- **Zwei Kanäle:** feste Referenzsonde nahe der Quelle + bewegte Messsonde; relative Phase
  je Frequenz. Hardware: kohärente Mehrkanal-SDRs (z. B. KrakenSDR mit 5 kohärenten
  Kanälen, gemeinsamer Takt) oder zwei SDRs mit geteiltem Referenztakt und Kalibrierung.
- **Nahfeld-Fernfeld-Transformation:** ebenes Wellenspektrum aus der Messebene
  (Betrag + Phase) → Fernfeld; liefert eine Abschätzung der Abstrahlung ohne Absorberhalle.
- **Quellenrekonstruktion (inverses Problem):** aus dem gemessenen Nahfeld äquivalente
  Dipole/Ströme bestimmen (regularisierte kleinste Quadrate). Diese Ersatzquellen lassen
  sich in die Simulation einspeisen: **Messung und Simulation schließen sich zum Kreis.**
- Ohne Referenzkanal: Phasenrückgewinnung aus zwei Messhöhen (iterative Verfahren) als
  Forschungsoption.

## Darstellung in der PCB-World
- Live-Füllung des Volumens beim Malen, Unsicherheit als Transparenz.
- Animierte Wellen aus gemessener Phase.
- Ersatzquellen als Pfeile/Dipole auf der Platine, vergleichbar mit simulierten Quellen.

## Aufwand und Risiken
- 5.1: mittel (Software), größtes Risiko Ortungsgenauigkeit.
- 5.2: groß (eigene HF-Hardware), Risiko Übersprechen zwischen Schleifen.
- 5.3: groß (Kalibrierung kohärenter Kanäle, inverse Probleme).

## Offene Fragen
- Reihenfolge: zuerst Handsonde (schnelles Erfolgserlebnis) oder Array?
