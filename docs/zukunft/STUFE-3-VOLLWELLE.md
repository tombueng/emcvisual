# Stufe 3: Vollwellen-Simulation (openEMS) und Fernfeld

Stand: 2026-10-04 · Status: Idee, konserviert · Voraussetzung: Stufe 1; Stufe 2 hilfreich

## Ziel

Die Maxwell-Gleichungen ohne Näherung lösen: Resonanzen, Abstrahlung von Plattenkanten,
Schlitzantennen, Laufzeiten, echtes Fernfeld. Ergebnisse als Volumina mit Frequenzachse und
Phase in die PCB-World laden, neben Stufe 1/2 und neben Messungen.

## Warum

Stufe 1 und 2 sind quasistatisch. Sobald Strukturen in die Nähe von λ/4 kommen (Platine
100 mm ↔ 750 MHz, Kabel 1 m ↔ 75 MHz), entstehen Resonanzen, die die Abstrahlung um 20–40 dB
anheben können. Das sieht nur eine Vollwellen-Rechnung. Außerdem kalibriert Stufe 3 die
schnellen Stufen: Wo weichen sie ab, und um wie viel?

## Methode

### 3.1 Werkzeug: openEMS (FDTD, Open Source)
- Rechteckgitter (EC-FDTD), CPU, mehrkernig; Python-Schnittstelle (CSXCAD für Geometrie).
- Läuft **nicht im Browser** (C++). Drei Wege:
  1. **Offline-Workflow:** App exportiert ein openEMS-Projekt (Python-Skript + Geometrie),
     Nutzer rechnet lokal, App importiert die Feld-Dumps (HDF5 → eigenes Binärformat per
     kleinem Konverter).
  2. **Lokale Brücke:** kleiner Dienst auf `localhost` (Python), den die App per HTTP/WebSocket
     anspricht: Projekt hochgeben, Fortschritt, Ergebnisse streamen. Daten bleiben lokal.
  3. **Rechenserver** (optional, später): gleicher Dienst auf einem starken Rechner.
- Referenz für den Geometrie-Export: Antmicros `gerber2ems` (Gerber → openEMS für
  Signalintegrität); eigener Export direkt aus dem BoardModel ist genauer (Netze, Lagen).

### 3.2 Modellaufbau
- Lagenaufbau mit Dielektrika (εr, tan δ), Kupfer als dünne Leiter (oder mit Dicke an
  kritischen Stellen), Vias als Quader/Zylinder-Näherung.
- **Gitter:** feine Linien an Metallkanten (Drittel-Regel), Verfeinerung an Vias und Pads,
  Grobgitter im Freiraum, sanfte Übergänge (Faktor ≤ 1,5); Rand: PML (8 Zellen) in
  ausreichendem Abstand (λ/4 bei der kleinsten Frequenz oder MUR bei kleinen Boxen).
- **Anregung:** je Quelle ein Port (Lumped Port zwischen Pad und Fläche) mit breitbandigem
  Gauß-Puls; Spektrum der Quelle wird nachträglich aufgeprägt (Linearität).
- **Ausgabe:** Feld-Dumps (H und E, Betrag und Phase) auf dem Gitter der PCB-World bei
  gewählten Frequenzen; NF2FF-Box für das Fernfeld (Richtdiagramm, E in 3/10 m).

### 3.3 Linearität nutzen
- Eine FDTD-Rechnung je Quellenport liefert die Übertragungsfunktion Port → Feld für alle
  Frequenzen. Danach sind Spektrumsänderungen wieder interaktiv (wie in Stufe 1).
- Mit Phase sind **kohärente** Überlagerungen und **animierte Wellen** möglich
  (Re{H·e^{jωt}}): Die PCB-World zeigt, wie sich Wellen ausbreiten und an Kanten abstrahlen.

### 3.4 Kabel und Gehäuse
- Angeschlossene Kabel als Drähte (1 m, Lage frei wählbar) am Steckverbinder; Gleichtakt-
  Strom und dessen Abstrahlung, die in der Praxis meist dominiert.
- Gehäuse als Metallbox mit Öffnungen; Schirmdämpfung, Schlitzresonanzen.

### 3.5 Rechenzeit (Abschätzung)
- Platine 100 × 80 mm, Gitter 0,1 mm nahe Leitern, sonst gröber: 10–50 Mio. Zellen; Zeitschritt
  ≈ 0,2 ps; für 30 MHz Untergrenze mehrere 100 000 Schritte → Stunden je Port auf einem
  Desktop. Mit Ausschnitten (nur relevante Region) Minuten.
- GPU-FDTD als Alternative: gprMax (CUDA, eigentlich für Bodenradar) prüfen; Palace
  (FEM, Frequenzbereich, Open Source) für Resonanzanalysen der Flächen (Eigenmoden).

## Darstellung in der PCB-World
- Volumen mit Frequenz-Regler über ein kontinuierliches Spektrum.
- Animierte Wellen (Phase), Richtdiagramm als 3D-Keule über der Platine.
- „Sim A ↔ Sim C“-Vergleich: Differenzvolumen in dB, Hinweise, wo Stufe 1 danebenliegt.
- Fernfeld-Diagramm mit CISPR-Grenzen, jetzt mit Resonanzen.

## Validierung
- Kanonische Strukturen mit bekannten Ergebnissen: Mikrostreifen-Resonator, Patch-Antenne,
  Dipol; Vergleich mit Literatur und Messung.
- Konsistenz mit Stufe 1 bei niedrigen Frequenzen (Quasistatik-Grenzfall).

## Aufwand und Risiken
- Mittel bis groß. Gitter-Erzeugung ist die Hauptarbeit; openEMS selbst ist ausgereift.
- Risiko Rechenzeit → Ausschnitte, Grobgitter, Nachtläufe, Ergebnis-Cache.
- Risiko Installation → Docker-Image für die lokale Brücke.

## Offene Fragen
- Offline-Workflow zuerst oder direkt die lokale Brücke?
- Welches Ergebnisformat (eigenes Binärformat, HDF5 im Browser per h5wasm)?
