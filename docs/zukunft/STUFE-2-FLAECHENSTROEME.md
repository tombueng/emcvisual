# Stufe 2: Rückströme in Flächen, Leitungseffekte, E-Feld

Stand: 2026-10-04 · Status: Idee, konserviert · Voraussetzung: Stufe 1 (M2, M3)

## Ziel

Die größte Vereinfachung von Stufe 1 aufheben: dass der Rückstrom immer direkt unter der
Leitung fließt. Stufe 2 **berechnet**, wie sich der Strom in Bezugsflächen verteilt: um
Schlitze herum, über Stitching-Vias zwischen Flächen, über Entkoppelkondensatoren bei einem
Bezugswechsel GND → VCC. Dazu Leitungseffekte (stehende Wellen) und das quasistatische E-Feld.

## Warum

Die häufigsten EMV-Fehler auf Platinen sind Rückstrom-Fehler: Schlitz in der Fläche,
geteilte Flächen, Lagenwechsel ohne Stitching-Via, Aussparungen. Stufe 1 meldet sie nur.
Stufe 2 zeigt den tatsächlichen Umweg des Stroms als Bild, als Schleifenfläche und als
Feldzuwachs, also genau das, was man beim Layout lernen will.

## Methode

### 2.1 Flächen als Leiternetz (PEEC-artig, quasistatisch)
1. **Vernetzung:** Jede Flächenlage (gefüllte Polygone) wird trianguliert oder in ein
   Rechteckraster (0,25–1 mm, adaptiv feiner an Kanten, Schlitzen, Vias) zerlegt.
2. **Unbekannte:** Flächenstromdichte je Zelle (Kantenströme), Ladungserhaltung an Knoten.
3. **Zwei Regime:**
   - **Niederfrequent (< ≈ 100 kHz):** Widerstand dominiert. Laplace-Gleichung
     ∇·(σ∇φ) = Quellen (Vias) mit dünnbesetzter Matrix (konjugierte Gradienten, WASM).
   - **Hochfrequent (EMV-Bereich):** Induktivität dominiert. Minimierung der magnetischen
     Energie: Teilinduktivitäten zwischen allen Flächenzellen und der Signalleitung,
     Gleichungssystem (R + jωL)·I = U mit Kirchhoff-Nebenbedingungen. Die L-Matrix ist dicht:
     O(N²) Speicher. Gegenmittel: hierarchische Matrizen / Fast-Multipole, oder grobe
     Vernetzung weit weg von der Leitung (N ≈ 5–20 k Zellen).
4. **Kandidat für den Löser:** FastHenry (MIT, Open Source, Multipol-beschleunigt) nach
   WebAssembly übersetzen, Geometrie im FastHenry-Format übergeben, Stromverteilung
   zurücklesen. Zu prüfen: Ausgabe der Flächenstromverteilung, Lizenz, Größe des WASM-Builds.
   Alternative: eigener Löser in Rust → WASM mit derselben Formulierung.
5. **Ergebnis:** Flächenströme als zusätzliche Stromelemente (statt Spiegeln) für die
   betroffenen Bereiche. Kernel, Gitter und Darstellung aus Stufe 1 bleiben unverändert.

### 2.2 Verbindungen zwischen Flächen
- **Stitching-Vias** gleicher Netze verbinden Flächen; der Rückstrom wechselt die Lage am
  nächsten Via; die zusätzliche Schleife wird sichtbar.
- **Bezugswechsel GND → VCC:** Der Rückstrom springt über Entkoppelkondensatoren (mit ESL,
  ESR und Montage-Induktivität) oder die Flächenkapazität. Modell: konzentriertes Element
  zwischen den Flächen an der Stelle jedes Kondensators; Herstellermodelle (z. B. Murata
  SimSurfing, Würth REDEXPERT) als S-Parameter oder RLC.

### 2.3 Leitungseffekte (stehende Wellen)
- Für elektrisch lange Leitungen (L > λ/10) ist der Strom längs der Leitung nicht konstant:
  I(x, f) aus Leitungsgleichungen mit Quellen- und Lastimpedanz (Treiber-R_out, Serien-R,
  Eingangs-C, Abschluss).
- Folge: Das räumliche Muster wird frequenzabhängig. Lösung: Muster an wenigen Stützfrequenzen
  (z. B. 8 je Dekade) rechnen und zwischen ihnen interpolieren; Cache je Quelle und Stützstelle.
- Treibermodelle aus IBIS (Ausgangskennlinie, Anstiegszeit) statt freier Parameter; SPICE
  (ngspice, in KiCad enthalten) für Netze mit Filtern oder Ferriten.

### 2.4 E-Feld
- Linienladungen q'(x, f) = C'·V(x, f) mit Spiegelladungen; Ladungen in Flächen aus dem
  Flächenlöser. Darstellung als zweites Volumen, umschaltbar oder gemischt (H rot, E blau).
- Wichtig für Schaltknoten (SW) mit hohem dV/dt, Kühlkörper und Kantenfelder.

### 2.5 Bauteil-Streufelder
- Spulen: Streufeld ungeschirmter Speicherdrosseln als magnetischer Dipol, ausgerichtet nach
  Bauform; geschirmte Drosseln mit Restfaktor. Datenquelle: Herstellerangaben oder Messung.

## Datenmodell-Erweiterungen
- `PlaneMesh` je Flächenlage (Knoten, Kanten, Zellen), `PlaneSolution` je Quelle und Frequenz.
- `Source.load` um IBIS/SPICE-Referenzen erweitert.
- Volumina mit Frequenzachse (Stützstellen) statt nur |h|².

## Darstellung in der PCB-World
- Flächenströme als animierte Strömungstextur auf der Fläche (Line Integral Convolution
  oder Partikel), Farbe = Stromdichte.
- „Röntgenblick“: Lagen ausblenden, Rückstrom unter dem Hinweg sehen.
- Vorher/Nachher: Stitching-Via per Klick setzen → Rückstrom und Feld ändern sich live.

## Validierung
- Analytisch: Rückstromverteilung unter einer Mikrostreifenleitung ∝ 1/(1 + (x/h)²).
- Gegen Stufe 3 (openEMS) an Referenzstrukturen: Leitung über Schlitz, Bezugswechsel mit
  und ohne Kondensator, Leitung mit offenem Ende bei λ/4.
- Gegen Messung (Stufe 4) an einer Testplatine mit diesen Strukturen.

## Aufwand und Risiken
- Groß: Flächenlöser ist der aufwendigste Teil des ganzen Projekts.
- Risiko Rechenzeit im Browser → WASM + Worker, grobe Vernetzung, Ergebnis-Cache.
- Risiko Komplexität der Oberfläche → Stufe-2-Rechnung pro Quelle optional einschaltbar.

## Offene Fragen
- FastHenry nach WASM oder eigener Löser?
- Wie fein muss die Flächenvernetzung für sichtbar richtige Felder sein?
