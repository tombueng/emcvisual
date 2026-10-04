# Stufe 4: Messung mit einem 3D-Drucker als Nahfeld-Scanner

Stand: 2026-10-04 · Status: Idee, konserviert · Voraussetzung: Stufe 1 (Gitter, Darstellung)

## Ziel

Echte Platinen abtasten: Nahfeldsonde am Druckkopf, günstiger Empfänger, Messung auf einem
3D-Gitter über der Platine. Die Messdaten landen in derselben PCB-World wie die Simulation:
nebeneinander, überlagert, als Differenz. **Möglichst wieder im Browser** (Web Serial / WebUSB).

## Hardware (Richtpreise)

| Teil | Vorschlag | ca. Preis |
|---|---|---|
| Positionierer | vorhandener 3D-Drucker (Klipper bevorzugt, Marlin möglich) | 0 € |
| Empfänger | tinySA Ultra (100 kHz–5,3 GHz, USB-Seriell) oder HackRF One (1 MHz–6 GHz, schneller Sweep) | 130–300 € |
| Sonden | H-Feld-Schleifen (Set oder Eigenbau aus Semi-Rigid-Koax, geschirmte Schleife), E-Feld-Stift | 20–50 € |
| Vorverstärker | Breitband-LNA 20–30 dB, 0,05–3 GHz | 10–20 € |
| Halter | gedruckter langer Arm (PLA/PETG), Ferrit am Sondenkabel | – |

Ein RTL-SDR (24 MHz–1,7 GHz) geht auch, ist aber langsam und schmalbandig (2,4 MHz).

## Ablauf

1. **Einrichten:** Platine auf das Druckbett (Halter mit Anschlag), Sonde am Arm, Kabel mit
   Ferrit, Prüfling in definiertem Betriebszustand.
2. **Registrierung:** Platine im Drucker-Koordinatensystem verorten. Sonde per Tippbetrieb
   über 2–3 Passmarken (Fiducials, Bohrungen, Pad-Mitten) fahren; die App kennt deren
   KiCad-Koordinaten und rechnet die Transformation (Verschiebung, Drehung, Maßstab ±).
   Später: Kamera am Druckkopf, automatische Erkennung.
3. **Hintergrund:** Gleicher Scan mit ausgeschaltetem Prüfling. Erfasst die Störungen des
   Druckers selbst (Schrittmotortreiber takten auch im Stillstand) und der Umgebung; wird
   später abgezogen.
4. **Scan:** je Gitterpunkt anfahren, 100–200 ms beruhigen, Spektrum aufnehmen (Max-Hold über
   N Durchläufe für stoßweise Signale), speichern. Erst grob (2–3 mm), dann Hotspots fein
   (0,5 mm). Mehrere Höhen (z. B. 1, 2, 4, 8 mm) für die 3D-Information.
5. **Ausrichtungen:** Für ein Vektorfeld dreimal scannen (Schleife in x, y, z) oder eine
   dreiachsige Sonde nutzen → H_x, H_y, H_z → Feldlinien aus Messdaten.
6. **Import in die PCB-World:** Messvolumen (x, y, z, f) mit Metadaten (Sonde, Empfänger,
   RBW, Höhe, Hintergrund abgezogen), gleiche Darstellung wie die Simulation.

## Software

- **Drucker:** Klipper über die Moonraker-HTTP-API (`/printer/gcode/script`), CORS in
  `moonraker.conf` freigeben; Marlin über Web Serial (G-Code `G0`, `M400` zum Warten).
  Bewegungen nur innerhalb einer geprüften Sicherheitszone (Bauteilhöhen aus KiCad + Abstand).
- **tinySA:** USB-CDC-Konsole mit Befehlen wie `scan`, `scanraw`, `sweep`, `data`; über Web
  Serial direkt aus dem Browser. Durchsatz prüfen (scanraw ist schneller).
- **HackRF:** `hackrf_sweep` (sehr schnell, mehrere GHz/s) lokal; im Browser per WebUSB
  (es gibt WebUSB-Umsetzungen des Sweep-Modus; Reife prüfen).
- **Zeitbedarf:** 80 × 100 mm bei 2 mm = 2000 Punkte; 0,5–2 s je Punkt → 15–60 min je Ebene.
  Adaptive Verfeinerung spart den Großteil.
- **Datenformat:** eigenes Binärformat (Header JSON + Float32-Blöcke), Rohspektren behalten.

## Kalibrierung und Einheiten

- Sondenfaktor (dB(A/m) je dBµV) aus Herstellerangabe oder Kalibrierung an einer
  bekannten Struktur (z. B. TEM-Zelle oder Leiterschleife mit bekanntem Strom).
- Ohne Kalibrierung: relative dB, für Vergleiche (vorher/nachher) völlig ausreichend.
- Vergleich mit Stufe 1: Sondenspannung aus dem simulierten H (PHYSIK.md §9) mit gleichem
  Schleifendurchmesser und Höhe; die Abweichung kalibriert beide Seiten.

## Stolperfallen

1. **Eigenstörungen des Druckers** → Hintergrund abziehen, Sonde weit weg vom Druckkopf,
   Motoren nicht abschalten (Positionsverlust), Lüfter aus.
2. **Auflösung** ≈ max(Schleifendurchmesser, Abstand). Kleine Sonde = fein, aber unempfindlich.
3. **Gleichtakt auf dem Sondenkabel** → Ferrit, geschirmte Schleife.
4. **Prüfling nicht stationär** → Max-Hold, feste Testfirmware (Dauertakt, Dauer-Datenmuster).
5. **Keine Phase** mit einem Spektrumanalysator (Stufe 5 löst das).
6. **Kollision** mit hohen Bauteilen → Höhenkarte aus KiCad, Sicherheitsabstand, Testlauf ohne Sonde.

## Darstellung in der PCB-World
- Messvolumen, Schnittebene in Messhöhe (direkt vergleichbar mit dem simulierten Schnitt).
- Differenz Messung − Simulation in dB; Hotspots, die nur in der Messung auftauchen.
- Echter Ton: an Hotspots aufgezeichnete IQ-Schnipsel (HackRF) AM-demoduliert abspielen.

## Validierung
- Testplatine mit bekannten Strukturen (dieselbe wie Stufe 2/3): Leitung über Schlitz,
  Schleifen verschiedener Fläche, Differenzpaar.
- Wiederholgenauigkeit: zweimal scannen, Abweichung < 1 dB erwarten.

## Offene Fragen
- Welcher Drucker und welche Firmware sind vorhanden?
- tinySA Ultra oder HackRF als erste Plattform?
