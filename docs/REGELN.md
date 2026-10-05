# Regelwerk: was die App erkennt, wie, und wie belastbar das ist

Jeder Befund der App auf einen Blick: woran er erkannt wird, welche Schwelle gilt, woher die
Regel stammt, wie belastbar sie ist und mit welcher erzeugten Testplatine sie geprüft wird
(`tools/emc-cases`, Test `tests/emcCases.test.ts`: Platine mit Fehler und Zwilling mit der
üblichen Behebung). Die Fehlerarten mit Quellen stehen in
[research/EMV-FEHLERKATALOG.md](research/EMV-FEHLERKATALOG.md) (K-Nummern), die Physik in
[stufe-1/PHYSIK.md](stufe-1/PHYSIK.md).

**Belastbarkeit:**
*berechnet* – aus dem Feld- bzw. Stromschleifenmodell, mit den dort genannten Grenzen;
*Abschätzung* – veröffentlichte Näherungsformel für den ungünstigsten Fall;
*Regel* – Geometrieregel mit Richtwert aus der Literatur, nichts gerechnet.

**Priorität:** rot = hohe Priorität, gelb = ansehen, grün = nachrangig. Bei berechneten Befunden
folgt sie aus dem Abstand der Quelle zum Grenzwert und dem Anteil des Befunds; bei Abschätzungen
aus deren eigenem Abstand minus 6 dB (sie sind absichtlich ungünstig); bei Regeln ist sie je
Regel fest. Sie ordnet die Arbeit und ist keine Prüfaussage.

## Befunde an einer Quelle

| Befund | Erkennung, Schwelle | Herkunft | Belastbarkeit | Testplatine |
|---|---|---|---|---|
| Rückstrompfad unterbrochen (`return-gap`) | Lücke ab 0,2 mm in der Bezugsfläche unter der Leitung, gemeldet wenn der Rückstrom mindestens 2 mm weiter muss oder nicht herum kommt; Flächentrennung zweier Netze als eigene Variante. Rot, solange die Quelle besser als 15 dB unter dem Grenzwert liegt (der Gleichtakt-Effekt der Lücke ist nicht gerechnet) | K-01–K-04; LearnEMC „Don't split, gap or cut the signal return plane“ | berechnet (Gegentakt), Gleichtakt nicht | `slot-clock`, `split-plane`, `narrow-slot` |
| Bezugswechsel an Via (`ref-change`) | Lagenwechsel mit Bezugsflächen verschiedener Netze; Rückweg über den nächsten Kondensator | K-08; Archambeault | berechnet | `ref-change-pwr` |
| Lagenwechsel ohne Stitching-Via (`no-stitching`) | gleiches Bezugsnetz, keine Via dieses Netzes im Umkreis von 3 mm | K-07 | berechnet | `via-no-stitch` |
| Leitung ohne Abschluss (`long-line`) | Viertelwellen-Resonanz c/(4·L·√εeff) im Messbereich, Spektrum dort ≥ 1 % der stärksten Linie, kein Serienwiderstand ≥ 10 Ω innerhalb 15 mm vom Treiber | K-12; Johnson/Graham | Warnung, Überhöhung nicht gerechnet | `long-clock`, `series-term` |
| Leitung ohne Bezugsfläche (`no-reference`) | keine Fläche auf keiner Lage; Vergleich mit gedachter Massefläche auf der Gegenseite | K-09; Ott | berechnet | `no-plane` |
| Leitung am Rand der Fläche (`edge-trace`) | auf mindestens 3 mm näher als 3·h (mindestens 1 mm) am Außenrand der Fläche oder an einer Lücke ab 5 mm, seitlich zur Leitung | K-11; LearnEMC (2·h), Wyatt (3–5 Bahnbreiten) | Regel (Effekt nicht gerechnet) | `edge-clock` |
| Signallage ohne angrenzende Fläche (`no-adjacent-plane`) | Bezugsfläche nicht auf der Nachbarlage | K-10; Ott, Hartley | Regel (größere Schleife ist im Fernfeld enthalten) | `no-adjacent-plane` |
| Heiße Schleife zu groß (`hot-loop`) | Fläche der Schleife entlang des Kupfers ab 30 mm²; ansehen ab 40, hohe Priorität ab 80 mm² | K-29; TI SLYT682, AN-1149 | berechnet (Fläche), Fernfeld über durchgehender Fläche nicht bezifferbar | `buck-loop` |
| Kabel werden gegeneinander getrieben (`cable-cm`) | L_p = (4/π²)·µ0·l·h/(d1+d2), V = ω·L_p·I; E = 0,365·V (Kabel auf beiden Seiten) bzw. Kabel gegen Platine; gemeldet ab 6 dB unter dem Grenzwert | K-15; Clemson-Expertensystem, Hockanson/Hubing 1996 | Abschätzung (ungünstigster Fall) | `between-connectors` |
| Differenzpaar ungleich lang (`pair-skew`) | Längendifferenz ab 5 mm oder Versatz ab 10 % der Anstiegszeit; Gleichtakt aus dem Versatz nur benannt, nicht gerechnet | K-14 | Regel | `pair-skew` |
| Übersprechen auf eine Kabelleitung (`io-coupling`) | parallele Führung zu einer Leitung an einem Kabelstecker; M = µ0/(4π)·ln(1 + 4h²/s²), E = 40·V/Z_ant, Z_ant = 80·(N+1) Ω; höchstens zwei je Quelle | K-16; Clemson I/O-Kopplung | Abschätzung (ungünstigster Fall) | `io-crosstalk` |

## Befunde der Platine (ohne Quelle)

| Befund | Erkennung, Schwelle | Herkunft | Belastbarkeit | Testplatine |
|---|---|---|---|---|
| Filter weit vom Stecker (`filter-far`) | Ferrit, Spule oder Kondensator nach Masse auf einer Kabelleitung (auch hinter einem Serienwiderstand) weiter als 10 mm vom Steckerpin; ein Befund je Pin | K-18; Wyatt, C&E | Regel | `filter-far` |
| Filterkondensator ohne kurze Masse (`filter-ground`) | Massepad nicht in einer Massefläche, nächste Masse-Via weiter als 3 mm | K-18; Wyatt | Regel | `filter-ground` |
| Steckerschirm offen (`shield-open`) | Pads S*, SH*, SHIELD, MP ohne Netz oder ohne weitere Verbindung | K-20; Wyatt | Regel, hohe Priorität | `usb-shield` |
| Steckerschirm schlecht angebunden (`shield-weak`) | Schirmpads erreichen Masse erst nach mehr als 3 mm | K-20 | Regel | – |
| Entkopplung (`decoupling`) | je IC (ab 5 Pins) der schlechteste Versorgungspin: kein Kondensator nach Masse im Umkreis von 20 mm, oder der nächste weiter als 5 mm (mit grober Anschlussinduktivität) | K-24; Clemson, Archambeault | Regel | `decoupling` |
| Quarz an Rand oder Stecker (`crystal-placement`) | näher als 5 mm an der Kante oder 10 mm an einem Kabelstecker | K-17; Infineon AP24026, ST AN2867 | Regel (Richtwerte) | `crystal-edge` |
| Leitungen unter dem Quarz (`crystal-under`) | fremde Leitungen unter dem Gehäuse, ohne Fläche dazwischen | K-17 | Regel | `crystal-under` |
| Schaltknoten zu groß (`sw-node`) | SW-Kupfer ab 100 mm², auf mehreren Lagen, oder ab 40 mm² nah an Kante (3 mm) oder Stecker (10 mm) | K-31; LearnEMC, TI | Regel | `sw-node-area` |
| Speicherdrossel an Rand oder Stecker (`inductor-placement`) | Spule am Schaltknoten näher als 3 mm an der Kante oder 10 mm an einem Kabelstecker; Schirmung und Wicklungsanfang unbekannt | K-33; TI | Regel | `inductor-connector` |
| Zu wenige Massepins am Stecker (`connector-ground`) | Stecker mit Netzen schneller Quellen (Anstieg bis 5 ns): weniger als ein Massepin je zwei schnelle Pins oder ein schneller Pin mehr als 1,5 Pinabstände vom nächsten Massepin; geschirmt angeschlossene Stecker ausgenommen; ein Befund je Stecker | K-22; Clemson (Z_ant = 80·(N+1) Ω) | Regel | `connector-ground` |
| Kupfer ohne Anschluss (`floating-copper`) | Zone ohne Netz oder Teilfläche eines Netzes ohne Pad und Via, jeweils ab 25 mm² | K-38 | Regel | `floating-copper` |
| Kühlkörper ohne Masse (`heatsink-floating`) | Kühlkörper-Footprint, alle Pads ohne Netz | K-37 | Regel | – |
| Ferrit zwischen zwei Massen (`ferrite-ground`) | FB/L mit Massenamen auf beiden Seiten (im Schirmpfad umstritten) | K-26 | Regel | `ferrite-ground` |

## Was als Kabel, Versorgung oder Fläche gilt

- **Kabelstecker:** Footprints aus Steckerbibliotheken oder mit Referenzen wie J, CN, USB, X;
  bekannte Kabelschnittstellen (USB, RJ45, HDMI, Klemmen, JST, …) immer, Platine-zu-Platine- und
  Modulstecker nie, sonst nur bis 40 Pins.
- **Versorgungsnetze** (keine Signalleitungen): Namen wie VIN, VBUS, VBAT, VCC, VDD, +3V3, 5V,
  SYS_VIN_HV.
- **Bezugsflächen:** Flächen ab 15 % der Platine; Flächen anderer Netze ab 5 % auf derselben Lage
  zählen mit, jede Rasterzelle kennt ihr Netz; Löcher bis 2,5 mm (Freistellungen) zählen als
  Kupfer.

## Wie neue Regeln geprüft werden

1. Fehler und üblichen Zwilling als Testplatine in `tools/emc-cases/gen_cases.py` anlegen und
   die Erwartung eintragen; `tests/emcCases.test.ts` muss den Fehler finden und den Zwilling
   nicht.
2. Mit `tools/survey` auf echten Platinen laufen lassen: Wie viele Befunde, wie viele rot? Eine
   Regel, die auf sorgfältig entworfenen Platinen dutzendfach anschlägt, wird enger gefasst.
3. Text mit Was/Warum/Abhilfe/Vermeiden/Grenzen/Quellen in beiden Sprachen
   (`tests/texts.test.ts` prüft, dass es ihn gibt).
