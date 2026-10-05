# EMV-Fehlerkatalog: Layoutfehler, an denen EMV-Prüfungen scheitern

Stand: 2026-10-05

Dieser Katalog sammelt die Layoutfehler, die in echten Projekten (Hobby und Industrie) am häufigsten
zu Fehlschlägen bei abgestrahlten oder leitungsgebundenen Störaussendungen führen. Zu jedem Fehler
gibt es den physikalischen Mechanismus, das typische Bild im Prüflabor, eine Erkennungsregel aus
KiCad-Daten, eine Einschätzung, ob die heutige Engine von emcvisual ihn findet, ein synthetisches
Testboard (schlechte Variante und guter Zwilling) und die Abhilfe. Am Ende stehen verbreitete
Mythen, eine Liste der Lücken der Engine und alle Quellen.

## Inhalt

1. [Aufbau der Einträge und Bewertungsstufen](#1-aufbau-der-einträge-und-bewertungsstufen)
2. [Physik in drei Zahlen: warum meistens das Kabel strahlt](#2-physik-in-drei-zahlen-warum-meistens-das-kabel-strahlt)
3. [Rahmen für die synthetischen Testboards](#3-rahmen-für-die-synthetischen-testboards)
4. [Rangliste und Top 12](#4-rangliste-und-top-12)
5. [Katalog](#5-katalog)
   - [A Rückstrompfad und Bezugsflächen (K-01 bis K-09)](#a-rückstrompfad-und-bezugsflächen)
   - [B Lagenaufbau, Leitungsführung, Platinenrand (K-10 bis K-14)](#b-lagenaufbau-leitungsführung-platinenrand)
   - [C Platzierung, Stecker und Kabel (K-15 bis K-23)](#c-platzierung-stecker-und-kabel)
   - [D Versorgung, Entkopplung, Filterbauteile (K-24 bis K-28)](#d-versorgung-entkopplung-filterbauteile)
   - [E Schaltregler und isolierte Wandler (K-29 bis K-36)](#e-schaltregler-und-isolierte-wandler)
   - [F Metallteile, Kupferflächen, Schirmung (K-37 bis K-40)](#f-metallteile-kupferflächen-schirmung)
6. [Mythen und Halbwahrheiten](#6-mythen-und-halbwahrheiten)
7. [Was die Engine heute nicht erkennt und was dafür nötig wäre](#7-was-die-engine-heute-nicht-erkennt-und-was-dafür-nötig-wäre)
8. [Quellen](#8-quellen)

---

## 1. Aufbau der Einträge und Bewertungsstufen

Jeder Eintrag `K-xx` hat dieselben Abschnitte:

- **Mechanismus**: was physikalisch passiert, mit Größenordnungen, soweit eine Quelle sie nennt.
- **Symptom im Labor**: wie der Fehler im Messprotokoll aussieht.
- **Erkennung aus Layoutdaten**: Regel, benötigte KiCad-Daten, typische Falsch-positive und
  Falsch-negative.
- **Engine heute**: `ja`, `teilweise` oder `nein`, bezogen auf den Stand der Engine am 2026-10-04
  (Biot–Savart-Nahfeld mit Rückstrom und Spiegelströmen, Diagnosen `return-gap`, `ref-change`,
  `no-stitching`, `long-line`, Fernfeld als kleine Schleife). Was fehlt, steht dabei.
- **Testboard**: eine minimale Platine, die ein Skript mit der pcbnew-Python-API erzeugen kann,
  plus der gute Zwilling ohne den Fehler und die erwarteten Befunde.
- **Abhilfe** und **Nicht tun**.
- **Belastbarkeit** und Quellen.

Bewertungsstufen für die Belastbarkeit:

| Stufe | Bedeutung |
|---|---|
| **gesichert** | mehrere unabhängige Fachquellen, mindestens eine Messung oder saubere Rechnung |
| **Konsens** | Fachleute sind sich einig, öffentliche Messzahlen fehlen weitgehend |
| **umstritten** | Fachquellen widersprechen sich; das Werkzeug darf hier nur Hinweise geben, keine Urteile |
| **Mythos** | durch Messungen oder Rechnung widerlegt (Abschnitt 6) |

"Häufigkeit" ist eine Einschätzung, wie oft der Fehler in Fehleranalysen, Fallstudien und
Laborberichten als Ursache auftaucht (hoch, mittel, gering). Harte Statistiken gibt es nicht; die
Labore nennen Ranglisten, aber keine Prozentzahlen.

---

## 2. Physik in drei Zahlen: warum meistens das Kabel strahlt

Die Engine schätzt heute das Fernfeld als kleine Stromschleife (Gegentakt, differential mode). Fast
alle Fachquellen sind sich aber einig, dass die meisten Prüfungen an **Gleichtaktströmen auf
Kabeln** scheitern (common mode). Drei Zahlen machen das greifbar; die Formeln stammen aus den
genannten Quellen, die Beispielwerte sind eigene Rechnungen damit:

1. **Gegentakt-Schleife** (Ott, in TI AN-2155 zitiert): E ≈ 2,63·10⁻¹⁴ · f² · A · I / r
   (f in Hz, A in m², I in A, r in m). Damit eine Schleife von 10 cm² bei 50 MHz in 3 m den
   Grenzwert 40 dBµV/m (100 µV/m) erreicht, braucht sie etwa **4,6 mA**.
2. **Gleichtaktstrom auf einem Kabel** (Ott/Paul, Formel in der Tekbox-Applikationsschrift):
   E ≈ 4π·10⁻⁷ · f · L · I / r. Ein 1 m langes Kabel erreicht bei 50 MHz denselben Grenzwert schon
   mit etwa **4,8 µA**. Das ist rund ein Tausendstel (60 dB) des Gegentaktstroms.
3. **Spannung zwischen zwei Kabeln**: Nach Hubing genügen wenige Millivolt zwischen zwei
   angeschlossenen Kabeln für einen Fehlschlag. Die Clemson-Expertensystem-Algorithmen schätzen
   den schlimmsten Fall (resonantes Kabelpaar, 3 m, Halbabsorberraum) mit E ≈ 0,365 · V ab.
   **1 mV ergibt damit etwa 51 dBµV/m**, deutlich über dem Grenzwert der Klasse B.

Woher kommen diese Millivolt? Der Rückstrom einer Leitung über einer Massefläche erzeugt einen
kleinen Spannungsabfall entlang der Fläche (Teilinduktivität der Fläche). Clemson nähert sie mit
L_p ≈ (4/π²) · µ0 · l · h / (d1 + d2) an (l Länge, h Höhe über der Fläche, d1 + d2 etwa die
Plattenbreite quer zur Leitung). Beispielrechnung für eine **einwandfrei** verlegte 50-mm-Taktleitung
über einer durchgehenden Fläche (h = 0,21 mm, 60 mm breite Platine, 25-MHz-Takt mit 33 mA
Flankenstrom, dritte Harmonische 75 MHz mit etwa 7 mA):
L_p ≈ 0,09 nH, Spannung ≈ 0,29 mV, Gleichtakt-Abschätzung ≈ **41 dBµV/m**, also auf dem Grenzwert.
Die Gegentakt-Abstrahlung derselben Leitung liegt bei nur etwa 11 dBµV/m. Wenn diese Leitung
zwischen zwei Steckern liegt, an denen Kabel hängen, entscheidet der Gleichtakt, nicht die Schleife.

Glen Dash zeigt dasselbe mit Simulation und Messung: Eine kleine, angepasste Leitung strahlte
in der Rechnung 27 dB mehr, sobald an ihren Rückleiter zwei Drähte angeschlossen wurden; der im
Aufbau gemessene Gleichtaktstrom (etwa 1,2 mA) bestätigte das Modell.

**Folgen für emcvisual:**

- Die Gegentakt-Abschätzung ist eine **Untergrenze**. Ein Ergebnis unter dem Grenzwert darf nie
  als "besteht" formuliert werden.
- Fehler, die Gleichtakt auf Kabeln erzeugen (K-15 bis K-22, K-36, K-37), sind die häufigsten
  Ursachen in der Praxis, aber mit dem heutigen Modell unsichtbar. Abschnitt 7 beschreibt, wie
  sich die Clemson-Formeln mit wenig Aufwand ergänzen ließen.
- Die Regeln "Rückstrom unterbrochen" und "Lagenwechsel ohne Rückweg" bleiben trotzdem wichtig:
  Sie vergrößern die Schleife **und** die Spannung über der Fläche, treiben also beide Mechanismen.

Quellen: [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Tekbox, RF current to E-field](https://www.tekbox.com/product/AN_-RF_current_to_electric_field_strength_extrapolation.pdf),
[Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Clemson, Current-driven CM algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Current-driven_CM_algorithm_summary.pdf),
[Clemson, Grid point voltage algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_Grid_Array_summary.pdf),
[Glen Dash, How Common Mode Currents Are Created](https://emcfastpass.com/wp-content/uploads/2017/04/Creation_of_CM_Currents.pdf).

---

## 3. Rahmen für die synthetischen Testboards

Alle Testboards folgen einem gemeinsamen Gerüst, damit ein Skript sie mit wenig Code erzeugen
kann. Es lehnt sich an `tools/demo-board/gen_demo_board.py` an (KiCad 10.0.6, pcbnew-Python-API,
Footprints aus `/usr/share/kicad/footprints`).

### 3.1 Vorgehen im Generator

1. Platine, Netze, Footprints, Leiterbahnen, Vias, Zonen und Sperrflächen (rule areas) anlegen,
   ungefüllt speichern.
2. Den Lagenaufbau als Text in die Datei einsetzen (die Python-API schreibt keinen Stackup), wie im
   Demo-Board.
3. In einem neuen Prozess laden, alle Zonen füllen (`ZONE_FILLER`), speichern. Ohne gespeicherte
   Füllung sieht der Parser keine Flächen; jedes Testboard muss nach dem Füllen geprüft werden, ob
   `filled_polygon` vorhanden ist.
4. Pro Fall zwei Dateien `K-xx-bad.kicad_pcb` und `K-xx-good.kicad_pcb` plus eine Erwartungsdatei
   `K-xx.expect.json` (Vorschlag für den Ablageort: `tools/emc-cases/`, Ausgabe nach `boards/emc-cases/`).

Die Erwartungsdatei enthält: die Quellen (Typ, Netz oder Pads, Frequenz, Anstiegszeit, Amplitude),
die erwarteten Diagnosen je Variante (Art, Ort mit ±3 mm Toleranz), die erwartete Richtung und
Mindestgröße des Fernfeldunterschieds zwischen schlecht und gut, und ein Feld
`engine_today: "detect" | "partial" | "missing"`. So kann die CI fehlende Erkennungen als bekannte
Lücke führen (erwarteter Fehlschlag), statt sie zu verschweigen.

### 3.2 Koordinaten und Grundplatinen

Platinenlokale Koordinaten in mm, x nach rechts, y nach unten, Ursprung links oben; im KiCad-File
um `ORIGIN = (100, 80)` verschoben wie beim Demo-Board. Standardumriss **80 × 60 mm**.

| Basis | Lagen | Aufbau | Belegung |
|---|---|---|---|
| **TB-4L** | 4 | JLC04161H-7628 wie Demo-Board: F.Cu, 0,2104 mm Prepreg 7628 (εr 4,4), In1.Cu, 1,065 mm Kern (εr 4,6), In2.Cu, 0,2104 mm Prepreg, B.Cu; gesamt 1,6 mm | F.Cu Signale; In1.Cu GND-Zone über die ganze Platine (0,5 mm Randabstand); In2.Cu +3V3-Zone ganzflächig; B.Cu frei |
| **TB-4L-GG** | 4 | wie TB-4L | In1.Cu und In2.Cu beide GND (Aufbau Signal/GND/GND/Signal, Versorgung geroutet) |
| **TB-2L** | 2 | FR4 1,6 mm, 35 µm Kupfer | F.Cu Signale; B.Cu nach Fall |
| **TB-6L** | 6 | F.Cu, 0,2 mm, In1 (GND), 0,3 mm, In2 (Signal), 0,6 mm, In3 (GND), 0,3 mm, In4 (+3V3), 0,2 mm, B.Cu | nur für K-13 |

Eine 50-Ω-Mikrostreifenleitung auf F.Cu über In1 (h = 0,21 mm, εr 4,4) ist etwa **0,35 mm** breit
(Näherung nach Hammerstad, eigene Rechnung).

### 3.3 Standardbauteile (in der KiCad-10-Standardbibliothek vorhanden)

| Ref | Zweck | Footprint | Wert, Pins |
|---|---|---|---|
| X1 | Taktoszillator | `Oscillator:Oscillator_SMD_Abracon_ASE-4Pin_3.2x2.5mm` | `25MHz`; 1 EN (+3V3), 2 GND, 3 OUT, 4 VDD |
| Y1 | Quarz (nur K-17) | `Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm` | `16MHz`, Netze `XTAL_IN`, `XTAL_OUT` |
| R1 | Serienwiderstand | `Resistor_SMD:R_0603_1608Metric` | `33R` |
| U1, U2 | Treiber, Empfänger, MCU-Platzhalter | `Package_SO:SOIC-8_3.9x4.9mm_P1.27mm` | Pin 4 GND, Pin 8 VCC, Pinfunktionen setzen |
| C1, C2 … | Entkoppler | `Capacitor_SMD:C_0402_1005Metric` | `100nF` |
| J1, J2 | Kabelstecker | `Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical`, `Connector_USB:USB_C_Receptacle_GCT_USB4085`, `Connector_USB:USB_Micro-B_Molex-105017-0001` | je Fall |
| J3 | Flachbandkabel | `Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Vertical` | je Fall |
| U3 | Buck-Regler | `Package_TO_SOT_SMD:TSOT-23-6` | Pinfunktionen `GND`, `SW`, `VIN`, `FB`, `EN`, `VBST` |
| L1 | Speicherdrossel | `Inductor_SMD:L_Taiyo-Yuden_NR-40xx` | `4.7uH` |
| CIN, COUT | Wandlerkondensatoren | `Capacitor_SMD:C_1206_3216Metric`, `Capacitor_SMD:C_0402_1005Metric` | `10uF`, `100nF`, `22uF` |
| MH1 … | Montagelöcher | `MountingHole:MountingHole_3.2mm_M3_Pad_Via` | GND oder ohne Netz |

Netznamen so wählen, dass die Quellenvorschläge (`src/physics/suggest.ts`) greifen: `CLK_25M`,
`SPI_SCK`, `USB_D+`/`USB_D-`, Pinfunktionen `SW`, `VIN`, `GND` am Regler.

### 3.4 Wiederkehrende Bausteine

- **CLK-Strecke**: X1 bei (12, 30), R1 direkt am Ausgang (Abstand ≤ 3 mm), Leiterbahn 0,35 mm auf
  F.Cu mit einem waagerechten Hauptstück auf y = 30 bis zum Eingangspin von U2 bei (68, 30),
  Länge ≈ 52 mm. C1 an X1 und C2 an U2 mit je einem GND- und einem +3V3-Via direkt am Pad.
  Quelle: `CLK_25M`, 25 MHz, Tastverhältnis 50 %, Anstiegszeit 1 ns, 3,3 V.
- **BUCK-Block** (Fläche etwa 20 × 15 mm, Lage je Fall): 12 V auf 3,3 V, 2 A, 500 kHz,
  Schaltflanke 5 ns; heißer Kreis in Pad-Reihenfolge CIN.1 → U3.VIN → U3.GND → CIN.2;
  Schaltknoten-Hub 12 V; Drosselstrom 2 A.
- **Kabelstecker**: Ein Stecker gilt als Kabelanschluss, wenn Referenz mit `J` beginnt und der
  Footprint aus einer `Connector_*`-Bibliothek stammt.

---

## 4. Rangliste und Top 12

Rangfolge nach Häufigkeit in Fehleranalysen und nach Belastbarkeit der Belege. Die ersten zwölf
Einträge sind die, die ein layoutbasiertes Werkzeug unbedingt finden sollte.

| Rang | ID | Fehler (DE / EN) | Belastbarkeit | Häufigkeit | Engine heute | Top 12 |
|---|---|---|---|---|---|---|
| 1 | K-01 | Signal über Schlitz in der Bezugsfläche / Trace over a slot in the reference plane | gesichert | hoch | ja (Lücken ≥ 1 mm) | **ja** |
| 2 | K-15 | Schnelle Schaltung zwischen Steckern an verschiedenen Kanten / High-speed circuit between connectors | gesichert | hoch | nein | **ja** |
| 3 | K-29 | Großer heißer Kreis im Schaltregler / Large hot loop | gesichert | hoch | ja | **ja** |
| 4 | K-02 | Getrennte Analog- und Digitalmasse / Split AGND–DGND | gesichert | hoch | teilweise | **ja** |
| 5 | K-09 | Zweilagig ohne Rückleiterfläche / Two-layer board without return plane | gesichert | hoch | teilweise | **ja** |
| 6 | K-07 | Lagenwechsel ohne Masse-Via / Layer change without ground stitching via | gesichert | hoch | ja | **ja** |
| 7 | K-08 | Referenzwechsel GND↔Versorgung ohne Kondensator / Reference change without capacitor | gesichert | mittel | ja | **ja** |
| 8 | K-19 | Filter durch Überlappung oder Parallelführung umgangen / Filter bypassed by layout | Konsens | hoch | ja (Überlappung; Parallelführung nein) | **ja** |
| 9 | K-18 | I/O-Filter weit vom Stecker / I/O filter far from the connector | Konsens | hoch | nein | **ja** |
| 10 | K-20 | Steckerschirm schlecht angebunden / Poor connector shield termination | gesichert | hoch | nein | **ja** |
| 11 | K-16 | HF-Leitungen koppeln auf I/O-Leitungen / HF traces coupling into I/O nets | Konsens | mittel–hoch | nein | **ja** |
| 12 | K-24 | Entkopplung fehlt oder ist hochinduktiv angeschlossen / Missing or high-inductance decoupling | gesichert | hoch | teilweise | **ja** |
| 13 | K-10 | Signallage ohne angrenzende Fläche, schlechter Lagenaufbau / Poor stack-up | gesichert | mittel | teilweise | |
| 14 | K-11 | Schnelle Leitung an der Platinenkante / High-speed trace near board edge | Konsens | mittel | nein | |
| 15 | K-31 | Schaltknoten zu groß oder exponiert / Oversized or exposed switch node | Konsens | mittel | teilweise | |
| 16 | K-32 | Massefläche unter dem Wandler aufgetrennt / Ground cut under the converter | gesichert | mittel | ja | |
| 17 | K-36 | Isolationsbarriere ohne HF-Rückweg / Isolation barrier without HF return | gesichert | mittel | nein | |
| 18 | K-34 | Eingangsfilter des Wandlers fehlt oder sitzt falsch / Missing converter input filter | gesichert | hoch | ja (Abschätzung Gegentakt) | |
| 19 | K-03 | Signal über Inselgrenze der Versorgungsfläche / Trace over split power plane | Konsens | mittel | teilweise | |
| 20 | K-14 | Differenzielles Paar unsymmetrisch / Asymmetric differential pair | gesichert | mittel | teilweise | |
| 21 | K-17 | Quarz an Rand oder Stecker, Leitungen darunter / Crystal near edge or connector | Konsens | mittel | teilweise | |
| 22 | K-22 | Zu wenige Massepins in Steckern und Flachkabeln / Too few ground pins | Konsens | mittel | nein | |
| 23 | K-04 | Leiterbahnen in der Masselage / Tracks routed through the ground plane | Konsens | mittel | teilweise | |
| 24 | K-05 | Antipad-Ketten als Schlitz / Antipad chains forming a slot | Konsens | mittel | ja | |
| 25 | K-12 | Elektrisch lange Leitung ohne Terminierung / Long unterminated line | Konsens | mittel | ja | |
| 26 | K-33 | Speicherdrossel ungeschirmt oder falsch orientiert / Unshielded or misoriented inductor | gesichert | mittel | teilweise | |
| 27 | K-37 | Kühlkörper oder Metallteil ohne Masseanbindung / Floating heatsink | Konsens | mittel | nein | |
| 28 | K-26 | Ferritperle falsch eingesetzt / Misused ferrite bead | gesichert | mittel | nein | |
| 29 | K-28 | Versorgungsschleife auf Zweilagen / Power loop on two-layer boards | Konsens | mittel | teilweise | |
| 30 | K-21 | Keine Chassisanbindung am Steckerbereich / Missing chassis bond near connectors | Konsens | mittel | nein | |
| 31 | K-35 | Große Gate-Schleifen, fehlender Snubber / Large gate-drive loops | Konsens | mittel | teilweise | |
| 32 | K-30 | Falscher Kreis kompakt gemacht / Wrong loop minimised | Konsens | gering–mittel | teilweise | |
| 33 | K-13 | Schnelle Netze außen mit vielen Vias / Fast nets on outer layers with many vias | Konsens | mittel | teilweise | |
| 34 | K-06 | Engstelle in der Massefläche / Ground-plane neck | Konsens | gering | nein | |
| 35 | K-25 | Stark unterschiedliche MLCC parallel / Widely different MLCCs in parallel | umstritten | mittel | nein | |
| 36 | K-27 | Gleichtaktdrossel an unsymmetrischer Versorgung / CM choke on unbalanced DC input | umstritten | mittel | nein | |
| 37 | K-38 | Schwebende oder schlecht vernähte Kupferflächen / Floating or poorly stitched copper | umstritten | mittel | nein | |
| 38 | K-23 | Ethernet: Flächen und Chassis am Übertrager / Ethernet magnetics and chassis planes | umstritten | gering | nein | |
| 39 | K-39 | Flächenränder und Hohlraumresonanz / Plane edges and cavity resonance | umstritten | gering | nein | |
| 40 | K-40 | Abschirmhaube mit zu wenigen Kontakten / Shield can with too few contacts | Konsens | gering | nein | |

Kurz gesagt: Von den Top 12 erkennt die Engine heute vier (K-01, K-29, K-07, K-08), drei
teilweise (K-02, K-09, K-24) und fünf gar nicht (K-15, K-19, K-18, K-20, K-16). Alle fünf nicht
erkannten gehören zum Gleichtakt- und Kabelmechanismus.

---

## 5. Katalog

### A Rückstrompfad und Bezugsflächen

#### K-01 · Signal über Schlitz in der Bezugsfläche
*EN: Trace crossing a slot or gap in its reference plane* · Belastbarkeit **gesichert** ·
Häufigkeit hoch · Engine heute **ja** (Lücken ab 1 mm) · **Top 12**

**Mechanismus.** Spätestens ab etwa 1 MHz fließt der Rückstrom fast vollständig direkt unter der
Leiterbahn, weil das der Weg kleinster Induktivität ist (Bogatin). Ein Schlitz zwingt ihn um das
Schlitzende herum. Die Schleife wächst ungefähr um Schlitzlänge mal Abstand, der Schlitz wirkt
selbst als Schlitzantenne, und der induktive Spannungsabfall über dem Schlitz treibt die beiden
Flächenhälften gegeneinander. Hängen an den Hälften Kabel, entsteht zusätzlich Gleichtakt.
Messwerte: Wyatt nennt 10 bis 15 dB höhere Harmonische bei einer Leitung über einem Spalt gegenüber
derselben Leitung ohne Spalt; in einem Praxisfall senkte eine Kupferband-Brücke über die Schlitze die
Abstrahlung um 17 dB. Bei TI (AN-2155) kostete das Entfernen der Massefläche unter dem
Hochstrompfad eines Buck-Reglers 6 dB Abstand zum Grenzwert.

**Symptom im Labor.** Schmalbandige Takt- und Datenharmonische, meist 100 MHz bis 1 GHz, oft stark
polarisationsabhängig; im Nahfeldscan ein Hotspot entlang des Schlitzes.

**Erkennung aus Layoutdaten.** Für jedes Segment eines schnellen Netzes die nächstgelegene
Flächenlage bestimmen und die Projektion des Segments mit der gefüllten Zonengeometrie dieser Lage
schneiden; ungedeckte Strecken ≥ etwa 3·h sind Befunde, der Umweg ergibt sich aus einem Weg durch die
Fläche um die Lücke. *Daten:* gefüllte Zonen je Lage (`filled_polygon`), Sperrflächen, Stackup-Dicken,
Netzklassifikation (schnell oder langsam). *Falsch-positiv:* langsame Netze (Reset, Taster, I²C mit
100 kHz); Lücke nur in der ferneren Fläche, während eine nähere Fläche durchläuft. *Falsch-negativ:*
nicht gespeicherte Zonenfüllung; Lücken unter der Mindestbreite des Detektors (siehe K-03, K-04).

**Engine heute.** Ja: `return-gap` mit Umweglänge und Anteil am Fernfeld. Einschränkung:
`MIN_GAP = 1,0 mm` in `src/physics/diagnostics.ts`; schmalere Lücken bleiben unerkannt. Der
Gleichtaktanteil (Spannung zwischen den Hälften) fehlt.

**Testboard.** Basis TB-4L mit CLK-Strecke.
*Schlecht:* Sperrfläche (keepout für Zonen) auf In1.Cu bei x = 38 bis 40, y = 5 bis 55, also ein
2 mm breiter, 50 mm langer Schlitz quer unter der Taktleitung, mit 5 mm Steg an beiden Enden.
*Variante:* Schlitz von y = 0 bis 60 (Fläche vollständig getrennt, kein Umweg möglich).
*Gut:* gleiche Platine ohne Sperrfläche.
*Erwartung:* schlecht `return-gap` bei (39, 30), Umweg ≈ 50 mm, Fernfeld deutlich höher (≥ 10 dB);
Variante ohne Umweg als eigener Fall; gut ohne Befund.

**Abhilfe.** Bezugsfläche ungeteilt lassen. Ist ein Schlitz unvermeidbar, schnelle Leitungen um ihn
herum führen oder über eine bewusst gelassene Brücke. Lieber eine langsame Leitung über den Schlitz
legen als eine schnelle.
**Nicht tun:** Brückenkondensator als Standardlösung betrachten; er hat mit Pads und Vias mindestens
einige nH und wirkt nur bis in den unteren Hunderter-MHz-Bereich (siehe M-15). Schlitz mit Ferrit
"überbrücken".

**Quellen.** [Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Wyatt, Top Ten EMC Problems (Folien)](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Bogatin, Rule of Thumb #7](https://www.edn.com/total-inductance-in-the-return-path-rule-of-thumb-7/),
[Academy of EMC, Design Guidelines](https://www.academyofemc.com/emc-design-guidelines).

#### K-02 · Getrennte Analog- und Digitalmasse
*EN: Split analog/digital ground planes (AGND/DGND) with signals or cables on both sides* ·
Belastbarkeit **gesichert** · Häufigkeit hoch · Engine heute **teilweise** · **Top 12**

**Mechanismus.** Wie K-01, nur absichtlich: Jede Leitung zwischen den Bereichen kreuzt den Spalt.
Dazu kommt, dass die beiden Flächen bei Hochfrequenz unterschiedliche Potenziale haben und damit
zwei Antennenteile bilden, sobald an beiden Seiten Kabel oder Gehäuseteile hängen. Hubing nennt
"isolierte Massen" den häufigsten Layoutfehler überhaupt und rät, praktisch nie eine Massefläche zu
trennen. Ott empfiehlt eine einzige Fläche mit Partitionierung (Analogbauteile und -leitungen nur im
Analogbereich) und hält eine Trennung erst bei sehr hoher Auflösung (etwa ab 14 bis 16 Bit) für
erwägenswert; auch dann sollen alle Leitungen nur über eine definierte Brücke kreuzen. Die einzige
klare Ausnahme bei Hubing: Ströme unter etwa 100 kHz, die einen sehr empfindlichen Kreis stören.
Auch Praxisleitfäden aus der Entwicklerszene nennen das Zusammenführen getrennter Massen als erste
Maßnahme bei hartnäckigen Abstrahlproblemen.

**Symptom im Labor.** Digitale Harmonische auf dem Kabel des Analogteils (oder umgekehrt), mit
Stromzange auf dem Kabel gut nachweisbar.

**Erkennung aus Layoutdaten.** Mehrere Flächen verschiedener Massenetze auf einer Lage (Namen wie
`AGND`, `DGND`, `PGND`, `GNDA`, `GND_ISO`) oder Masse-Inseln desselben Netzes, die nur über
Net-Tie, 0-Ω-Widerstand oder Ferrit (`FB*`, `L*` zwischen zwei Massenetzen) verbunden sind. Befund,
wenn (a) schnelle Netze den Spalt kreuzen oder (b) an beiden Bereichen Kabelstecker hängen.
*Daten:* Netznamen, Zonen je Netz, Footprint-Typ und Wert (`0R`, Ferrit), Steckerpositionen.
*Falsch-positiv:* galvanisch getrennte Domänen hinter Isolatoren (das ist K-36, eigene Regeln);
Chassis-Insel unter einem Stecker (siehe K-21, K-23). *Falsch-negativ:* Trennung nur auf einer
Innenlage, während eine andere Lage durchgeht.

**Engine heute.** Teilweise. Kreuzt eine Leitung den Spalt und ist er breiter als etwa 1 mm, meldet
`return-gap` den Befund. Große Flächen anderer Netze auf derselben Lage werden für den Rückstrom wie
eine gemeinsame Fläche behandelt (`src/model/planes.ts`), daher sieht die Engine den Netzwechsel an
der Grenze nicht. Dass zwei Kabel an verschiedenen Massehälften hängen, wird nicht bewertet; dafür
fehlt das Gleichtaktmodell (Abschnitt 7).

**Testboard.** Basis TB-4L.
*Schlecht:* In1.Cu in zwei Zonen geteilt: `AGND` x = 0 bis 39,25 und `DGND` x = 40,75 bis 80
(1,5 mm Spalt, sicher über der heutigen Erkennungsschwelle), Verbindung nur über R5 `0R` (0603)
bei (40, 56). U1 als ADC bei (22, 30), U2 als MCU
bei (60, 30). Netz `SPI_SCK` (Quelle 10 MHz, 2 ns) auf F.Cu von U2 nach U1 quer über den Spalt.
J1 (PinHeader 1×04, Analogeingang) am linken Rand bei (3, 30) auf AGND, J2 (USB-C) am rechten Rand
bei (77, 30) auf DGND.
*Variante "Brücke" (zulässig nach Ott):* Spalt mit 6 mm breiter Kupferbrücke bei y = 27 bis 33,
SPI_SCK läuft über die Brücke. Erwartung: kein `return-gap`.
*Variante "schmal":* Spalt nur 0,5 mm (typischer Zonenabstand). Prüft die Mindestbreite.
*Gut:* durchgehende GND-Fläche, gleiche Platzierung (Partitionierung), R5 entfällt.
*Erwartung heute:* schlecht `return-gap` bei (40, 30); Variante "schmal" heute unerkannt (bekannte
Lücke). *Soll:* zusätzlich "zwei Masseinseln, Kabel an beiden" mit Gleichtaktabschätzung.

**Abhilfe.** Eine Massefläche, Bauteile nach Funktion gruppieren, Leitungen bereichstreu führen,
ADC-Pins AGND und DGND beide an dieselbe Fläche direkt am Bauteil.
**Nicht tun:** AGND und DGND getrennt fluten und mit Ferrit verbinden; den "Sternpunkt" weit vom
Wandler setzen.

**Quellen.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines),
[Ott, Grounding of Mixed Signal PCBs](https://hott.shielddigitaldesign.com/techtips/split-gnd-plane.html),
[TI SLYT512, Grounding in mixed-signal systems demystified](https://www.ti.com/lit/an/slyt512/slyt512.pdf),
[LearnEMC, Grounding](https://learnemc.com/grounding),
[A One-Page Guide to Fixing Radiated Emissions](https://cushychicken.github.io/radiated-emissions-debug/).

#### K-03 · Signal über Inselgrenze einer gesplitteten Versorgungsfläche
*EN: Trace referenced to a split power plane (3V3/5V/1V8 islands)* · Belastbarkeit **Konsens** ·
Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Auf Vierlagenplatinen wird die Versorgungslage oft in Inseln geteilt. Leitungen
auf der Lage daneben (meist B.Cu) nutzen diese Lage als Bezug. An der Inselgrenze muss der Rückstrom
von einer Insel auf die andere wechseln; einen direkten Weg gibt es nicht, nur über
Entkoppelkondensatoren zur Masse und wieder zurück. Simonovich beschreibt die Kombination aus Spalt
und entlang der Kante umgeleitetem Rückstrom als wirksame Schlitzantenne; bei Mikrostreifen fehlt
zudem jede Abschirmung nach außen.

**Symptom im Labor.** Harmonische von Leitungen auf der Unterseite, besonders bei Bussen, die über
mehrere Inseln laufen.

**Erkennung aus Layoutdaten.** Lage mit mehreren Zonen verschiedener Versorgungsnetze; Segmente auf
der angrenzenden Lage, deren Projektion eine Inselgrenze kreuzt. Den nächstgelegenen Kondensator
zwischen jeder Insel und GND im Umkreis von einigen mm suchen; ohne ihn ist der Rückweg lang.
*Daten:* Zonen mit Netz, Stackup, Kondensatoren mit ihren beiden Netzen. *Falsch-positiv:*
Stripline mit naher GND-Fläche auf der anderen Seite (der größere Teil des Rückstroms fließt dort);
langsame Netze. *Falsch-negativ:* Inselabstand unter der Detektorbreite.

**Engine heute.** Teilweise. Weil Flächen anderer Netze in denselben Bedeckungsraster aufgenommen
werden, sieht die Engine zwischen zwei Inseln nur den Spalt. Typische Inselabstände sind 0,3 bis
0,5 mm (Zonenabstand) und liegen damit unter `MIN_GAP = 1,0 mm`: Der Fehler bleibt dann unerkannt.
Benötigt: Netzwechsel entlang eines Segments als eigenes Ereignis behandeln (wie `ref-change` an
Vias, nur in der Ebene), mit Umweg über den nächsten Kondensator.

**Testboard.** Basis TB-4L.
*Schlecht:* In2.Cu in `+3V3` (x = 0 bis 39,75) und `+5V` (x = 40,25 bis 80) geteilt, Spalt
0,5 mm. CLK-Strecke auf **B.Cu** (Vias an beiden Enden von den Pads auf F.Cu), so dass In2.Cu die
nächste Fläche ist. Keine Kondensatoren in der Nähe der Grenze.
*Variante:* Spalt 1,5 mm (heute erkennbar).
*Gut:* CLK auf F.Cu über In1 (GND), oder In2 ungeteilt.
*Erwartung heute:* 0,5-mm-Variante ohne Befund (bekannte Lücke), 1,5-mm-Variante `return-gap`.
*Soll:* beide Varianten mit Befund und Umweg über die nächsten Kondensatoren.

**Abhilfe.** Schnelle Leitungen nur auf Lagen neben einer Massefläche; Versorgungsinseln so legen,
dass keine schnelle Leitung sie quert; wenn doch, Entkoppler beidseits der Kreuzung (Notlösung).
**Nicht tun:** Versorgungsinseln als "gleichwertige Referenz" ansehen.

**Quellen.** [Simonovich, Split planes and microstrip](https://www.signalintegrityjournal.com/articles/692-split-planes-and-what-happens-when-microstrip-signals-cross-them),
[TI, USB 2.0 Board Design and Layout Guidelines](https://e2echina.ti.com/cfs-file/__key/telligent-evolution-components-attachments/13-106-00-00-00-00-33-10/USB-2.0-Board-Design-and-Layout-Guidelines.pdf),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/).

#### K-04 · Leiterbahnen in der Masselage
*EN: Tracks routed through the ground-plane layer* · Belastbarkeit **Konsens** · Häufigkeit mittel
(bei Hobby-Vierlagern hoch) · Engine heute **teilweise**

**Mechanismus.** "Nur ein paar Bahnen" auf der Masselage schneiden mit Bahnbreite plus zweimal
Zonenabstand einen langen, schmalen Schlitz in die Fläche. Für den Rückstrom darüberliegender
Leitungen wirkt das wie K-01, nur schlechter sichtbar, weil die Fläche im Editor fast vollständig
aussieht.

**Symptom im Labor.** Wie K-01.

**Erkennung aus Layoutdaten.** Leiterbahnen anderer Netze auf einer erkannten Flächenlage; Länge und
Lage des entstehenden Schlitzes bestimmen und wie K-01 gegen schnelle Netze auf den Nachbarlagen
prüfen. *Daten:* Tracks je Lage, Zonenabstand, gefüllte Zonen. *Falsch-positiv:* kurze Stichbahnen
ohne kreuzende schnelle Leitung. *Falsch-negativ:* wie K-03 (Schlitzbreite unter 1 mm).

**Engine heute.** Teilweise. Ein Schlitz aus 0,25-mm-Bahn und 2 × 0,2 mm Abstand ist 0,65 mm breit
und fällt unter `MIN_GAP`. Ab etwa 1 mm Breite meldet `return-gap` ihn.

**Testboard.** Basis TB-4L mit CLK-Strecke.
*Schlecht:* Netz `LED` als 0,25-mm-Bahn auf In1.Cu von (40, 5) nach (40, 55), Zonenabstand 0,2 mm.
*Variante:* 0,5-mm-Bahn mit 0,5 mm Abstand (Schlitz 1,5 mm).
*Gut:* Bahn `LED` auf B.Cu.
*Erwartung heute:* Variante mit 1,5 mm `return-gap`, Hauptfall unerkannt (bekannte Lücke). *Soll:*
beide erkannt; besser: Regel "Bahn auf Flächenlage unter schneller Leitung".

**Abhilfe.** Masselage frei von Bahnen halten; wenn unvermeidbar, kurz und parallel zu den
darüberliegenden schnellen Leitungen, nie quer darunter.
**Nicht tun:** auf einer Lage "GND-Fläche plus ein paar Signale" mischen und dies als Masselage zählen.

**Quellen.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines).

#### K-05 · Antipad-Ketten und Steckerpinreihen als Schlitz
*EN: Antipad chains ("Swiss cheese") forming a slot under connector or via rows* · Belastbarkeit
**Konsens** · Häufigkeit mittel · Engine heute **ja** (wenn die Kette zusammenhängt)

**Mechanismus.** Freistellungen (Antipads) um Durchkontaktierungen in der Masselage verschmelzen bei
engem Raster zu einem durchgehenden Schlitz. Typisch: Stiftleisten im 2,54-mm-Raster mit großem
Zonenabstand, Via-Reihen eines Busses, BGA- oder Steckerfelder. Infineon zeigt, wie der Rückstrom um
eine Via-Gruppe herumgezwungen wird.

**Symptom im Labor.** Wie K-01, häufig an Steckern zu Zusatzplatinen.

**Erkennung aus Layoutdaten.** Rasterbild der gefüllten Zone auswerten: zusammenhängende Löcher mit
großer Länge und kleiner Breite unter schnellen Leitungen. *Daten:* gefüllte Zonen, Pad- und
Via-Durchmesser, Zonenabstand. *Falsch-positiv:* Lochreihen mit Kupferstegen dazwischen (Strom fließt
durch die Stege). *Falsch-negativ:* Stege, die schmaler als die Mindestbreite der Zone sind, werden von
KiCad entfernt; die Füllung zeigt dann den Schlitz korrekt, das Auge im Editor nicht.

**Engine heute.** Ja, sofern das zusammenhängende Loch größer als 3 mm² ist (kleinere geschlossene
Löcher füllt `fillSmallHoles` absichtlich auf) und die Leitung es auf mindestens 1 mm Länge quert.

**Testboard.** Basis TB-4L mit CLK-Strecke, Bahnbreite hier 0,2 mm.
*Schlecht:* J3 = `PinHeader_1x10_P2.54mm_Vertical`, senkrecht bei x = 40, Pins auf y = 18,57 bis
41,43 (Pins 5 und 6 bei 28,73 und 31,27), Pins auf Netzen `IO0` bis `IO9`. Zonenabstand In1.Cu
0,5 mm, also Antipad-Durchmesser 2,7 mm über dem Raster 2,54 mm: die Antipads verschmelzen zu einem
etwa 26 mm langen Schlitz. Die CLK-Leitung läuft auf F.Cu bei y = 30 zwischen Pin 5 und 6 hindurch.
*Gut:* Zonenabstand 0,2 mm, Mindestbreite der Zone 0,2 mm (Stege 0,44 mm bleiben), oder CLK um den
Stecker herum.
*Erwartung:* schlecht `return-gap` bei (40, 30); gut ohne Befund.

**Abhilfe.** Kleinere Freistellungen, Masse-Pins in die Pinreihe einstreuen, schnelle Leitungen nicht
durch Pinfelder führen.
**Nicht tun:** große Zonenabstände "zur Sicherheit" für alle Netze setzen.

**Quellen.** [Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf).

#### K-06 · Engstelle in der Massefläche
*EN: Ground-plane neck (narrow copper bridge between plane regions)* · Belastbarkeit **Konsens**,
kaum Messdaten · Häufigkeit gering · Engine heute **nein**

**Mechanismus.** Eine Leitung, die über eine schmale Kupferbrücke läuft, behält zwar ihren
Rückstrom direkt darunter (die Schleife bleibt klein), aber die Teilinduktivität der Fläche steigt,
weil der Rückstrom sich nicht seitlich verteilen kann. In der Clemson-Näherung ist sie umgekehrt
proportional zur wirksamen Flächenbreite: Eine 3 mm breite Engstelle statt 60 mm Plattenbreite hebt
die Spannung zwischen den beiden Plattenhälften um bis zu etwa das Zwanzigfache (26 dB, eigene
Rechnung mit der Formel, nur Tendenz). Diese Spannung treibt Kabel an den beiden Hälften
(Hockanson et al., "finite-impedance reference planes").

**Symptom im Labor.** Gleichtakt auf Kabeln, die an verschiedenen Seiten der Engstelle hängen.

**Erkennung aus Layoutdaten.** Topologie der Fläche: zwei große Bereiche, die nur über eine Brücke
schmaler als etwa ein Fünftel der Plattenbreite verbunden sind; Befund, wenn schnelle Leitungen die
Brücke nutzen und Stecker auf beiden Seiten liegen. *Daten:* gefüllte Zonen, Steckerpositionen.
*Falsch-positiv:* Engstellen ohne Stecker auf der anderen Seite. *Falsch-negativ:* keine.

**Engine heute.** Nein; der Gegentaktanteil ist korrekt klein, der Gleichtaktanteil fehlt.

**Testboard.** Basis TB-4L mit CLK-Strecke, J1 (PinHeader 1×04) bei (3, 30), J2 (USB-C) bei
(77, 30).
*Schlecht:* zwei Sperrflächen auf In1.Cu: x = 38 bis 42, y = 0 bis 28,5 und y = 31,5 bis 60
(3 mm breite Brücke genau unter der Taktleitung).
*Gut:* ungeteilte Fläche.
*Erwartung heute:* kein Befund, Fernfeld fast gleich. *Soll:* Gleichtakt-Abschätzung deutlich höher
in der schlechten Variante.

**Abhilfe.** Flächen breit verbinden; Aussparungen nicht so legen, dass sie die Platine fast teilen.
**Nicht tun:** Engstellen bewusst als "Filter" für Massefläche einsetzen.

**Quellen.** [Clemson, Grid point voltage algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_Grid_Array_summary.pdf),
[Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

#### K-07 · Lagenwechsel ohne Masse-Via
*EN: Layer change without a ground stitching via (GND to GND reference)* · Belastbarkeit
**gesichert** · Häufigkeit hoch · Engine heute **ja** · **Top 12**

**Mechanismus.** Wechselt eine Leitung über ein Via von einer Lage mit Bezug GND (oben) auf eine Lage
mit Bezug GND (unten), muss der Rückstrom von der einen Fläche auf die andere. Liegt kein Masse-Via
in der Nähe, nimmt er den nächsten Übergang, der beliebig weit weg sein kann; die Schleife wächst
entsprechend, und die beiden Flächen bilden einen angeregten Hohlraum. Wyatt rät, bei jedem
Referenzwechsel zusätzliche Vias für den Rückstrom zu setzen; Academy of EMC nennt 2 bis 3
Stitching-Vias neben schnellen Signal-Vias.

**Symptom im Labor.** Harmonische schneller Leitungen, oft mit Resonanzüberhöhung im
Hunderter-MHz-Bereich (Hohlraum zwischen den Flächen).

**Erkennung aus Layoutdaten.** Für jedes Via eines schnellen Netzes: Bezugsfläche oben und unten
bestimmen; gleiches Netz, aber kein Via dieses Netzes, das beide Flächen verbindet, im Radius von
etwa 2 bis 3 mm. *Daten:* Vias mit Lagenpaar, Zonen, Stackup. *Falsch-positiv:* langsame Netze;
Flächen, die direkt daneben über große Durchkontaktierungen (Montagelöcher, Steckerpins) verbunden
sind. *Falsch-negativ:* blinde und vergrabene Vias, wenn deren Lagenbereich falsch gelesen wird.

**Engine heute.** Ja: `no-stitching` (Radius 3 mm) mit Umweg über das nächste Masse-Via oder den
nächsten Kondensator.

**Testboard.** Basis TB-4L-GG.
*Schlecht:* CLK-Strecke auf F.Cu bis Via V1 bei (40, 30), weiter auf B.Cu bis Via V2 bei (64, 30),
zurück auf F.Cu zu U2. Masse-Vias nur an C1 und C2 (≥ 20 mm entfernt).
*Gut:* je ein Masse-Via bei (41,2, 30) und (65,2, 30).
*Erwartung:* schlecht zweimal `no-stitching` mit Umwegen von etwa 2 × 24 mm; gut ohne Befund.

**Abhilfe.** Neben jedes Signal-Via, das zwischen zwei Masse-Bezugsflächen wechselt, ein Masse-Via
(≤ 1 bis 2 mm); bei Differenzpaaren symmetrisch zwei.
**Nicht tun:** Vias wegen "Signalintegrität" grundsätzlich vermeiden und dafür lange Umwege auf einer
Lage in Kauf nehmen (Länge ist meist schlimmer als ein gut begleitetes Via).

**Quellen.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines),
[Bogatin, Rules of Thumb](https://www.edn.com/bogatins-rules-of-thumb/).

#### K-08 · Referenzwechsel GND↔Versorgung ohne nahen Kondensator
*EN: Reference change between ground and power plane without a nearby capacitor* · Belastbarkeit
**gesichert** · Häufigkeit mittel · Engine heute **ja** · **Top 12**

**Mechanismus.** Wechselt die Leitung von einer Lage mit Bezug GND auf eine mit Bezug Versorgung
(typisch beim Vierlager F.Cu → B.Cu), kann der Rückstrom nur über Kapazität zwischen den Flächen
wechseln: Entkoppelkondensatoren oder die Flächenkapazität selbst. Beim üblichen Vierlager mit 1 mm
Kern ist die Flächenkapazität klein (bei 0,25 mm Abstand etwa 16 pF/cm² laut LearnEMC, bei 1 mm
entsprechend etwa ein Viertel). Ein Kondensator hilft nur bis zu seiner Resonanz und nur, wenn er nah
ist; Studien zeigen zudem zusätzliche Resonanzen zwischen Kondensatoren und dem Flächenpaar.

**Symptom im Labor.** Wie K-07, oft breitere Resonanzbuckel.

**Erkennung aus Layoutdaten.** Wie K-07, aber unterschiedliche Netze der beiden Bezugsflächen; dann
den nächsten Kondensator zwischen genau diesen beiden Netzen suchen und dessen Abstand und
Anschlussinduktivität bewerten. *Daten:* Kondensatoren mit Netzen und Wert. *Falsch-positiv:*
Stripline mit GND auf einer Seite. *Falsch-negativ:* Kondensator ist nah, aber über lange Bahnen
angeschlossen (siehe K-24).

**Engine heute.** Ja: `ref-change` mit Umweg über den nächsten Kondensator.

**Testboard.** Basis TB-4L (F.Cu über GND, B.Cu über +3V3).
*Schlecht:* CLK wie in K-07 über V1 (40, 30) und V2 (64, 30) auf B.Cu; nur C1 und C2 als
GND–3V3-Kondensatoren.
*Gut:* zusätzlich C3 und C4 (100 nF, 0402) mit eigenen Vias je ≤ 2 mm neben V1 und V2. Zweiter
guter Zwilling: TB-4L-GG mit Masse-Vias wie K-07.
*Erwartung:* schlecht zweimal `ref-change` mit Umweg über C1 bzw. C2; gut mit kurzen Umwegen über
C3, C4.

**Abhilfe.** Schnelle Leitungen auf Lagen mit Massebezug halten; sonst Kondensator direkt am Via.
Ein Aufbau Signal/GND/GND/Signal vermeidet das Problem ganz (Hartley, Wyatt).
**Nicht tun:** annehmen, dass die Flächenkapazität eines Standard-Vierlagers den Rückweg liefert.

**Quellen.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Studie: Entkoppler bei Referenzwechsel (ResearchGate)](https://www.researchgate.net/publication/251803889_Effect_of_decoupling_capacitor_on_signal_integrity_in_applications_with_reference_plane_change),
[LearnEMC, Decoupling with closely spaced planes](https://learnemc.com/decoupling-for-boards-with-closely-spaces-power-planes),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/),
[Hartley via Sierra Circuits](https://www.protoexpress.com/blog/rick-hartley-pcb-design-recommendations-to-minimize-emi/).

#### K-09 · Zweilagig ohne Rückleiterfläche
*EN: Two-layer board without a solid return plane ("ground as a track")* · Belastbarkeit
**gesichert** · Häufigkeit hoch (Hobby und Kleinserie) · Engine heute **teilweise** · **Top 12**

**Mechanismus.** Ohne Fläche fließt der Rückstrom dort, wo die Masse-Bahn liegt, und die Schleifen
werden so groß wie die Wege zwischen Signal und Masse-Bahn. Ott nennt als Faustregel, dass eine
Vierlagenplatine bei sonst gleichen Bedingungen etwa 15 dB weniger abstrahlt als eine zweilagige.
Bei TI (AN-2155) brachte das Hinzufügen von Masseflächen zu einem Buck-Layout 4 dB mehr Abstand.
Ein Massegitter auf beiden Lagen (Ott, "gridded ground") senkte die Abstrahlung in einer Studie um
etwa 7 dB. Ein Praxisfall bei Unit 3 Compliance (Pawson) zeigt dasselbe auf vier Lagen: keine
zusammenhängenden Flächen, Rückströme undefiniert, Fehlschlag bei 210 MHz.

**Symptom im Labor.** Breite Harmonischenkämme, oft schon unter 100 MHz.

**Erkennung aus Layoutdaten.** Keine Lage mit Flächenanteil eines Massenetzes über etwa 25 %; dann
für jede schnelle Leitung den Rückweg über das Masse-Netz suchen (kürzester Pfad über GND-Kupfer
zwischen Treiber- und Empfänger-Massepin) und die eingeschlossene Fläche berechnen. *Daten:* Netzliste,
Tracks, Pinfunktionen GND. *Falsch-positiv:* Massebahn läuft direkt unter oder neben der Leitung.
*Falsch-negativ:* Massefläche vorhanden, aber zerstückelt (Inseln nur über dünne Bahnen verbunden).

**Engine heute.** Teilweise. Ohne Fläche verwendet die Engine eine Ersatzleitung (`unreferenced` in
`src/physics/lines.ts`) und legt den Rückstrom auf die gegenüberliegende Außenlage (Warnung `unreferenced`). Den
wirklichen Rückweg entlang der Masse-Bahnen bildet sie nicht ab; die Schleifenfläche ist daher nicht
die tatsächliche.

**Testboard.** Basis TB-2L mit CLK-Strecke.
*Schlecht:* Masse nur als 0,5-mm-Bahn auf B.Cu von X1-GND über den unteren Rand (y = 55) nach
U2-GND; Versorgung als Bahn über den oberen Rand (y = 5). Eingeschlossene Fläche etwa 52 × 25 mm.
*Gut A:* B.Cu als durchgehende GND-Zone. *Gut B:* Massegitter (B.Cu waagerecht, F.Cu senkrecht,
Raster 10 mm, Vias an den Kreuzungen).
*Erwartung heute:* Quellenwarnung `unreferenced`; Fernfeld der schlechten Variante nicht realistisch. *Soll:*
Rückweg über das GND-Netz, Schleife ≈ 1300 mm² gegenüber ≈ 83 mm² bei Gut A, also rund 24 dB
Unterschied im Gegentakt (eigene Rechnung, Fläche zu Fläche).

**Abhilfe.** Vier Lagen nehmen, wenn irgend möglich; sonst eine Lage fast ganz als Masse, Signale
auf der anderen, kurze Wege, Massegitter.
**Nicht tun:** Masse "irgendwie" als Bahn verbinden und auf ungeteilte Kupferflächen hoffen, die
an Stellen ohne Via enden (siehe K-38).

**Quellen.** [Ott, PCB Stack-Up](https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[All About Circuits, Gridded ground](https://www.allaboutcircuits.com/technical-articles/multipoint-grounding-gridded-ground-for-double-sided-pcbs/),
[Pawson, Case study poor PCB layout](https://interferencetechnology.com/case-study-poor-pc-board-layout-causes-radiated-emissions/),
[LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes).

### B Lagenaufbau, Leitungsführung, Platinenrand

#### K-10 · Signallage ohne angrenzende Fläche, schlechter Lagenaufbau
*EN: Signal layer not adjacent to a plane / poor stack-up (planes far apart)* · Belastbarkeit
**gesichert** · Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Die Fläche, die eine Leitung umschließt, ist Länge mal Abstand zur Bezugsfläche.
Liegt die nächste Fläche zwei oder drei Dielektrika entfernt, wächst die Schleife entsprechend und
die Felder verteilen sich in die Nachbarlagen. Ott fordert als erstes Ziel jedes Lagenaufbaus, dass
jede Signallage an eine Fläche grenzt, und hält eng gekoppelte Signal-zu-Fläche-Abstände für
wichtiger als eng gekoppelte Versorgungs- und Masseflächen. Hartley formuliert dieselbe Regel:
Massefläche genau ein Dielektrikum von Signal- und Versorgungslage entfernt. Wyatt nennt schlechte
Aufbauten (Versorgungs- und Massefläche drei Lagen auseinander) an erster Stelle seiner fünf
häufigsten Gründe für Fehlschläge.

**Symptom im Labor.** Allgemein erhöhter Pegel aller Harmonischen, Übersprechen zwischen Lagen.

**Erkennung aus Layoutdaten.** Aus dem Stackup die Abstände jeder Signallage zur nächsten erkannten
Fläche berechnen; Befund, wenn eine Lage mit schnellen Netzen keine direkt angrenzende Fläche hat oder
der Abstand ein Vielfaches des kleinsten Abstands im Aufbau beträgt; zweiter Befund, wenn die
Versorgungsfläche nicht an eine Massefläche grenzt. *Daten:* Stackup (Dicken, εr), erkannte
Flächenlagen, Netzklassen je Lage. *Falsch-positiv:* Lage ohne schnelle Netze. *Falsch-negativ:*
fehlender Stackup im File (KiCad schreibt ihn nur, wenn er im Board-Setup gepflegt ist; sonst
Standardwerte).

**Engine heute.** Teilweise. Die Höhe über der Fläche geht über Stackup und Spiegelströme in das Feld
ein; der Unterschied zwischen gutem und schlechtem Aufbau ist im Fernfeld sichtbar. Eine eigene
Diagnose "Lage ohne Nachbarfläche" fehlt.

**Testboard.** Basis TB-4L mit CLK-Strecke.
*Schlecht:* In1.Cu ohne Zone (nur einige Signalbahnen), In2.Cu als GND-Zone; die Taktleitung auf
F.Cu sieht ihre Fläche erst in 1,275 mm Abstand.
*Gut:* Standard-TB-4L (In1 GND in 0,21 mm).
*Erwartung:* Fernfeld schlecht um rund 15 dB höher (Schleifenfläche etwa Faktor 6, eigene Rechnung);
*Soll:* zusätzlich Diagnose "Signallage F.Cu ohne angrenzende Fläche".

**Abhilfe.** Vierlager als Signal/GND/GND/Signal oder Signal/GND/PWR/Signal mit dünnen äußeren
Prepregs; ab sechs Lagen jede Signallage an Masse.
**Nicht tun:** innere Lagen als Signallagen und die Flächen außen (Ott: nur mit Abstrichen sinnvoll).

**Quellen.** [Ott, PCB Stack-Up](https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html),
[Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/),
[Hartley via Sierra Circuits](https://www.protoexpress.com/blog/how-grounding-controls-noise-and-emi-by-rick-hartley/).

#### K-11 · Schnelle Leitung an der Platinenkante
*EN: High-speed trace routed close to the board or plane edge* · Belastbarkeit **Konsens** ·
Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** Nahe der Flächenkante kann sich der Rückstrom nicht symmetrisch unter der Leitung
verteilen; ein Teil der Feldlinien greift um die Kante, und auf dem Rand der Fläche fließen
Kantenströme, die mit dem Abstand (in Vielfachen der Höhe h) exponentiell abnehmen. Die Kante wird
ab etwa einer halben Wellenlänge Länge zum wirksamen Strahler (bei 900 MHz rund 16 cm). Archambeault
empfiehlt, Randkanäle nur für langsame Signale zu verwenden. LearnEMC nennt als Mindestabstand das
Doppelte der Höhe über der Fläche, Wyatt 3 bis 5 Bahnbreiten.

**Symptom im Labor.** Höhere Harmonische ab einigen hundert MHz, Abstrahlung bevorzugt aus der
Platinenebene.

**Erkennung aus Layoutdaten.** Für Segmente schneller Netze den Abstand zur Kante der gefüllten
Bezugsfläche (nicht nur zum Platinenumriss) berechnen; Befund unter etwa 2·h bis 5·h, bewertet mit
der Segmentlänge. *Daten:* Umriss, gefüllte Zonen, Stackup. *Falsch-positiv:* Kante mit dichter
Via-Reihe und Masse auf beiden Außenlagen (gekapselter Rand). *Falsch-negativ:* Fläche endet weit vor
dem Platinenrand (Zonenrückzug), die Leitung liegt aber über der Flächenkante.

**Engine heute.** Nein. Spiegelströme entstehen überall dort, wo Kupfer unter dem Element liegt;
die Flächenkante wird nicht gesondert behandelt.

**Testboard.** Basis TB-4L.
*Schlecht:* X1 bei (12, 4), U2 bei (68, 4); Taktleitung auf F.Cu auf y = 0,8 (In1-Fläche endet bei
y = 0,5, also 0,3 mm Abstand zur Flächenkante, etwa 1,4·h).
*Gut:* gleiche Leitung auf y = 10 (etwa 45·h von der Kante).
*Erwartung heute:* kaum Unterschied. *Soll:* Diagnose "Leitung an der Flächenkante" mit Abstand in h.

**Abhilfe.** Schnelle Leitungen mindestens einige h, besser einige mm vom Flächenrand; Randbereich
für langsame Signale; bei unvermeidbarer Randführung Masse-Via-Reihe am Rand.
**Nicht tun:** die Fläche zum Rand hin "für die Fertigung" stark zurückziehen und die Leitung trotzdem
am Rand lassen.

**Quellen.** [Archambeault, Routing high-speed traces close to the PCB edge](https://pcdandf.com/pcdesign/index.php/2008-archive-articles/3032-effects-of-routing-high-speed-traces-close-to-the-pcb-edge),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

#### K-12 · Elektrisch lange Leitung ohne Terminierung, unnötig steile Flanken
*EN: Electrically long, unterminated line; unnecessarily fast edges* · Belastbarkeit **Konsens** ·
Häufigkeit mittel · Engine heute **ja**

**Mechanismus.** Ist die Laufzeit länger als etwa die halbe Anstiegszeit, entstehen Reflexionen und
Nachschwingen; das Spektrum bekommt Überhöhungen bei den Leitungsresonanzen. Unabhängig davon
bestimmt die Anstiegszeit, ab welcher Frequenz das Spektrum mit 40 dB/Dekade fällt. LearnEMC rät zu
angepasster Terminierung, wenn die Laufzeit die halbe Übergangszeit überschreitet, und vor allem dazu,
die Flanke zuerst zu verlangsamen; Academy of EMC nennt Serienwiderstände (typisch 33 Ω) direkt am
Treiber. Hubing hält dagegen starre Regeln wie "terminieren ab λ/4" für ungeeignet.

**Symptom im Labor.** Harmonische oberhalb der erwarteten Hüllkurve, schmale Spitzen bei
Leitungsresonanzen.

**Erkennung aus Layoutdaten.** Netzlänge gegen Anstiegszeit (vom Nutzer oder aus Bauteiltyp);
Serienwiderstand im Netz suchen und Abstand zum Treiberpin prüfen (≤ wenige mm). *Daten:* Netzliste,
Pinfunktionen oder Treiberzuordnung, Widerstandswerte. *Falsch-positiv:* Leitungen mit langsamen
Treibern. *Falsch-negativ:* Treiber mit eingebautem Serienwiderstand (aus Layout nicht erkennbar).

**Engine heute.** Ja: `long-line` (λ/10-Grenze gegen Spektrum), Serienwiderstände werden erkannt und
verlangsamen die wirksame Flanke (`trEff`).

**Testboard.** Basis TB-4L.
*Schlecht:* CLK-Strecke auf 150 mm verlängert (Mäander bei x = 20 bis 60), kein R1, Anstiegszeit
0,5 ns.
*Gut:* gleiche Länge mit R1 = 33 Ω direkt am Ausgang; zweiter guter Zwilling: direkte 52-mm-Strecke.
*Erwartung:* `long-line` bei schlecht; bei gut geringeres Fernfeld oberhalb einiger hundert MHz.

**Abhilfe.** Kurze Wege, Serienwiderstand am Treiber, Treiberstärke und Flankensteilheit so gering
wie die Funktion erlaubt, Spread-Spectrum bei Takten (TI nennt für einen Taktbaustein etwa 8 dB
Spitzenreduktion bei ±2 % Modulation, bei der siebten Harmonischen etwa 13 dB).
**Nicht tun:** Terminierung nach Wellenlängenregel statt nach Laufzeit und Anstiegszeit festlegen.

**Quellen.** [LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines),
[TI SCAA103, Spread spectrum clocking](https://www.ti.com/lit/an/scaa103/scaa103.pdf).

#### K-13 · Schnelle Netze auf Außenlagen mit vielen Lagenwechseln
*EN: Fast nets on outer layers with many vias instead of buried between planes* · Belastbarkeit
**Konsens** · Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Eine Mikrostreifenleitung hat ein offenes Feld nach außen; eine Streifenleitung
zwischen zwei Flächen ist weitgehend gekapselt. Ott nennt das Vergraben schneller Leitungen zwischen
Flächen als eines seiner Ziele; Microchip AN2587 empfiehlt dasselbe für Takte. Jeder Lagenwechsel
ist eine weitere Gelegenheit für K-07 oder K-08; LearnEMC rät, Vias in schnellen Netzen zu
minimieren.

**Symptom im Labor.** Höhere Harmonische, besonders oberhalb 300 MHz.

**Erkennung aus Layoutdaten.** Anteil der Länge schneller Netze auf Außenlagen, Zahl der Vias je
schnellem Netz. *Daten:* Tracks je Lage, Vias, Netzklassen. *Falsch-positiv:* kurze
Anschlussstücke an Bauteilpads. *Falsch-negativ:* keine.

**Engine heute.** Teilweise: Die Abschirmung durch zwei Flächen ist im Spiegelstrommodell
enthalten, Lagenwechsel ohne Rückweg werden gemeldet; eine zusammenfassende Regel fehlt.

**Testboard.** Basis TB-6L.
*Schlecht:* CLK auf F.Cu, mit vier Lagenwechseln F.Cu ↔ B.Cu entlang der Strecke.
*Gut:* CLK auf In2 (zwischen In1 GND und In3 GND), nur je ein Via an den Enden mit Masse-Via daneben.
*Erwartung:* gut deutlich leiser im Fernfeld; schlecht mit `ref-change` oder `no-stitching` an den
Vias.

**Abhilfe.** Takte und schnelle Busse innen zwischen Masseflächen, wenige Lagenwechsel, jeder mit
Rückweg.
**Nicht tun:** einen Takt auf der Außenlage "der Messbarkeit wegen" quer über die Platine führen.

**Quellen.** [Ott, PCB Stack-Up](https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html),
[Microchip AN2587](https://ww1.microchip.com/downloads/en/Appnotes/00002587A.pdf),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines).

#### K-14 · Differenzielles Paar unsymmetrisch
*EN: Asymmetric differential pair (skew, unequal vias, uncoupled sections)* · Belastbarkeit
**gesichert** (Mechanismus) · Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Ein ideales Paar trägt gleiche, entgegengesetzte Ströme; jede Unsymmetrie wandelt
einen Teil in Gleichtakt um. Laufzeitversatz Δt erzeugt näherungsweise einen Gleichtaktanteil von
sin(π·f·Δt) des Gegentaktsignals (eigene Herleitung): 60 ps bei 240 MHz ergeben etwa 4,5 %. Eine
Studie fand 10 bis 20 dB mehr Gleichtaktstrom, wenn der Versatz von 10 ps auf 200 ps stieg. Weitere
Ursachen: ein Bein mit Via, das andere ohne; einseitige Masse-Vias an Paar-Vias; Paar teilt sich um
ein Hindernis; ungleiche Terminierung. TI (Ethernet) verlangt gleich lange Leitungen und symmetrisch
platzierte Abschlussbauteile.

**Symptom im Labor.** Bitrate oder Takt des Busses (USB 480 MHz, Ethernet 125 MHz) auf dem
angeschlossenen Kabel; Ferrit am Kabel hilft deutlich, was Gleichtakt bestätigt.

**Erkennung aus Layoutdaten.** Paar über Netznamen erkennen; Längendifferenz (in ps über εeff),
ungekoppelte Abschnitte (Abstand der Beine > 2 bis 3 Bahnbreiten), Vias und Masse-Vias je Bein,
Lage der Kompensation (nahe der Ursache oder am anderen Ende). *Daten:* Tracks beider Netze, Vias,
Stackup. *Falsch-positiv:* Längenausgleich mit Mäandern direkt an der Ursache (dann korrekt
kompensiert). *Falsch-negativ:* Unsymmetrie im Stecker oder Bauteil.

**Engine heute.** Teilweise: Paare sind als Quelle vorhanden, geometrische Trennung der Beine
vergrößert das Gegentaktfeld und wird damit sichtbar. Laufzeitversatz und Gleichtaktumwandlung
fehlen (quasistatisch entgegengesetzte Ströme).

**Testboard.** Basis TB-4L, USB-C J1 bei (3, 30), U2 als USB-Baustein bei (60, 30), Paar `USB_D+`
und `USB_D-` gekoppelt (0,2 mm Breite, 0,15 mm Abstand) auf F.Cu.
*Schlecht A:* `USB_D+` mit 10 mm Umweg (etwa 60 ps). *Schlecht B:* Paar teilt sich um ein
Montageloch bei (30, 30) für 15 mm. *Schlecht C:* nur `USB_D-` wechselt über ein Via auf B.Cu und
zurück.
*Gut:* symmetrisch, Längendifferenz < 0,15 mm, keine Vias.
*Erwartung heute:* B im Gegentaktfeld sichtbar, A und C kaum. *Soll:* Befund "Versatz 60 ps,
Gleichtaktanteil −27 dB bei 240 MHz" und Bewertung als Kabelstrom, wenn das Paar an einem Stecker
endet.

**Abhilfe.** Paare eng gekoppelt und symmetrisch führen, Längenausgleich nahe an der Ursache, Vias
nur paarweise mit symmetrischen Masse-Vias, Gleichtaktdrossel am Stecker bei Bedarf.
**Nicht tun:** glauben, Differenzsignale strahlten grundsätzlich nicht (M-12); Längenausgleich am
falschen Ende.

**Quellen.** [Studie zu Gleichtaktstrom und Versatz (ResearchGate)](https://www.researchgate.net/publication/224340709_The_impact_of_common_mode_currents_on_signal_integrity_and_EMI_in_high-speed_differential_data_links),
[TI SNLA107A, Ethernet radiated emissions](https://www.ti.com/lit/an/snla107a/snla107a.pdf),
[LearnEMC, Imbalance difference modeling](https://learnemc.com/introduction-to-imbalance-difference-modeling),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines).

### C Platzierung, Stecker und Kabel

#### K-15 · Schnelle Schaltung zwischen Steckern an verschiedenen Kanten
*EN: High-speed circuitry located between connectors on different board edges* · Belastbarkeit
**gesichert** · Häufigkeit hoch · Engine heute **nein** · **Top 12**

**Mechanismus.** Hubing beschreibt zwei Grundmechanismen, über die eine Platine Kabel antreibt. Beim
stromgetriebenen ("current-driven") Mechanismus erzeugt der Rückstrom jeder schnellen Leitung einen
kleinen Spannungsabfall entlang der Massefläche (Abschnitt 2). Liegt die Schaltung zwischen zwei
Steckern, an denen Kabel hängen, liegt diese Spannung zwischen den Kabeln, und die Kabel bilden eine
Dipolantenne. Wenige Millivolt reichen. Weil das sich nachträglich kaum billig beheben lässt (neues
Layout, Gehäuse mit Schirmanbindung), ist die Regel "alle Stecker an eine Kante oder Ecke" eine der
wichtigsten Platzierungsregeln. LearnEMC ergänzt: I/O-Bausteine innerhalb von 2 cm um ihren Stecker,
andere Bauteile mindestens 2 cm von I/O-Netzen entfernt.

**Symptom im Labor.** Harmonische der Takte auf **allen** Kabeln, Höhe stark abhängig von Kabellage
und -länge; Ferrite auf beiden Kabeln helfen; die Platine ohne Kabel ist unauffällig.

**Erkennung aus Layoutdaten.** Kabelstecker finden (Referenz `J*`, `Connector_*`-Footprint, Schirm-
oder Montagepads). Für jedes Paar von Steckern prüfen, ob schnelle Netze (oder Schaltregler-Kreise)
zwischen ihnen liegen; besser: Spannung über der Fläche zwischen den Steckerorten nach der
Clemson-Methode (Teilinduktivität × ω × Rückstrom, Summe aller schnellen Netze) und daraus
E ≈ 0,365 · V abschätzen. *Daten:* Footprints mit Bibliothek und Position, Netze, Flächen,
Stackup, Quellen. *Falsch-positiv:* Stecker ohne Kabel im Einsatz (Programmierstecker,
Bestückungsoptionen; Nutzer muss markieren können); metallisches Gehäuse mit Schirmanbindung beider
Stecker. *Falsch-negativ:* Kabel, die über Lötpunkte oder Schraubklemmen ohne `J`-Referenz
angeschlossen sind.

**Engine heute.** Nein. Gegentaktfeld ist in beiden Varianten gleich; die Engine sieht keinen
Unterschied (klassisches Falsch-negativ).

**Testboard.** Basis TB-4L mit CLK-Strecke (zusätzlich ein zweiter Takt `SPI_SCK` 10 MHz parallel bei
y = 40 nach Belieben).
*Schlecht:* J1 (`PinHeader_1x04`, Versorgung und Daten) bei (3, 30), J2 (USB-C) bei (77, 30), Takt in
der Mitte.
*Gut:* J1 bei (3, 20) und J2 bei (3, 42) an derselben Kante, CLK-Strecke nach rechts verschoben
(x = 25 bis 75), gleiche Länge.
*Erwartung heute:* gleiches Fernfeld (dokumentierte Lücke). *Soll:* schlecht mit
Gleichtakt-Abschätzung im Bereich des Grenzwerts (Abschnitt 2: etwa 41 dBµV/m bei 75 MHz), gut
deutlich darunter.

**Abhilfe.** Alle Kabelstecker an einer Kante oder Ecke; schnelle Schaltung abseits der Linie
zwischen Steckern; bei Metallgehäuse beide Stecker niederohmig ans Gehäuse.
**Nicht tun:** Stecker nach "Ergonomie" auf alle Seiten verteilen und hoffen, dass Ferrite das
nachher richten.

**Quellen.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[LearnEMC, PCB layout](https://learnemc.com/pcb-layout),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Clemson, Current-driven CM algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Current-driven_CM_algorithm_summary.pdf),
[LearnEMC, Power circuit layout](https://learnemc.com/power-circuit-layout).

#### K-16 · HF-Leitungen koppeln auf I/O-Leitungen
*EN: High-frequency traces coupling into I/O nets (or routed under I/O components)* · Belastbarkeit
**Konsens** · Häufigkeit mittel bis hoch · Engine heute **nein** · **Top 12**

**Mechanismus.** Eine langsame I/O-Leitung (Taster, LED, UART, CAN) trägt über kapazitives und
induktives Übersprechen die Harmonischen eines benachbarten Takts aus der Platine hinaus. Hubing
hebt diesen Weg eigens hervor, weil er so häufig ist; LearnEMC rät, keine fremden Leitungen zwischen
Stecker und I/O-Baustein zu führen und keine schnellen Signale unter I/O-Bauteilen. Wyatt zeigt einen
Fall, in dem Datenleitungen unter einem Oszillator 100 MHz über einen Stecker auf eine zweite Platine
trugen.

**Symptom im Labor.** Takt-Harmonische auf einem Kabel, das funktional "nichts Schnelles" führt.

**Erkennung aus Layoutdaten.** I/O-Netze sind Netze mit einem Pad an einem Kabelstecker. Für jedes
Segment eines I/O-Netzes die parallel laufenden Segmente schneller Netze auf derselben oder einer
nicht durch eine Fläche getrennten Lage suchen; gegenseitige Kapazität und Induktivität je
Längeneinheit berechnen (Clemson-I/O-Kopplung: Segmente ≤ 2 cm, Kopplung ignorieren, wenn eine Fläche
dazwischen liegt). Störspannung Vn → E ≈ 40 · Vn / Z_ant mit Z_ant = min(800 Ω, 80·(N+1) Ω), N = Zahl
der Massepins im Stecker; bei geschirmtem Stecker 800 Ω. *Daten:* Netze an Steckern, Tracks,
Stackup, Steckerpins mit Netz. *Falsch-positiv:* I/O-Netz mit Filter direkt am Stecker (dann ist die
Kopplung hinter dem Filter unkritisch, davor nicht). *Falsch-negativ:* Kopplung über Bauteile
(Steckernähe von Quarzen, K-17).

**Engine heute.** Nein (Übersprechen nicht modelliert).

**Testboard.** Basis TB-4L mit CLK-Strecke; J2 (`PinHeader_1x04`) bei (77, 40), Netz `IO_BTN` von
J2 Pin 1 zu U2 (langsames Signal, keine Quelle).
*Schlecht:* `IO_BTN` (0,2 mm) läuft 20 mm parallel zur Taktleitung auf F.Cu (x = 45 bis 65,
y = 30,65; Mittenabstand 0,65 mm, Kante zu Kante etwa 0,4 mm), dann zu J2.
*Gut:* `IO_BTN` mit ≥ 5 mm Abstand zur Taktleitung und RC-Filter (100 Ω, 1 nF) direkt an J2.
*Erwartung heute:* kein Unterschied. *Soll:* Befund "Kopplung CLK_25M → IO_BTN", abgeschätztes
Feld über dem Grenzwert bei schlecht.

**Abhilfe.** I/O-Zonen am Stecker frei von schnellen Leitungen halten, I/O-Netze kurz, Filter am
Stecker, schnelle Leitungen mit Masse dazwischen (Fläche oder vernähte Masse-Bahn).
**Nicht tun:** I/O-Leitungen "weil langsam" quer über die Platine durch die Digitalzone führen.

**Quellen.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Clemson, I/O coupling algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/IO_coupling_algorithm_summary.pdf),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf).

#### K-17 · Quarz oder Oszillator an Rand oder Stecker, Leitungen darunter
*EN: Crystal/oscillator near the board edge or connectors, traces routed under it* · Belastbarkeit
**Konsens** · Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Der Oszillator ist eine starke schmalbandige Quelle; nahe der Kante oder einem
Stecker koppelt er direkt in Kabel und Rand (K-11, K-16). Leitungen, die unter ihm hindurchlaufen,
nehmen seine Harmonischen auf. Infineon verlangt Quarze, Oszillatoren und Taktgeber fern von
I/O-Ports und Platinenkanten; LearnEMC verlangt Taktbausteine direkt neben dem Oszillator; ST
verlangt kurze Wege zum Mikrocontroller und einen Schutzring.

**Symptom im Labor.** Grundfrequenz und Harmonische des Quarzes oder Oszillators (z. B. 8, 16, 25 MHz
und Vielfache) auf Kabeln.

**Erkennung aus Layoutdaten.** Footprints aus `Crystal:*` oder `Oscillator:*` (oder Werte mit Hz)
finden; Abstand zur Platinenkante und zu Kabelsteckern; fremde Leitungen in der Projektion des
Gehäuses auf allen Lagen ohne Fläche dazwischen; Leitungslänge zwischen Quarz und IC. *Daten:*
Footprint-Bibliothek, Wert, Position, Tracks. *Falsch-positiv:* Uhrenquarze 32 kHz (eigene Schwelle).
*Falsch-negativ:* Oszillator als generisches Bauteil ohne erkennbaren Namen.

**Engine heute.** Teilweise: Takt- und Quarznetze werden als Quellen vorgeschlagen, ihr Feld wird
berechnet; Rand- und Steckernähe sowie Kopplung in fremde Leitungen fehlen.

**Testboard.** Basis TB-4L, U2 als MCU bei (40, 30), Y1 (16 MHz) mit Lastkondensatoren.
*Schlecht:* Y1 bei (3, 4) an der Ecke, 2 mm neben J1 (USB-C bei (3, 12)), Netze `XTAL_IN`/`XTAL_OUT`
40 mm lang; zusätzlich Netz `IO_LED` auf B.Cu unter Y1 hindurch.
*Gut:* Y1 bei (34, 30) direkt an U2, Leitungen ≤ 5 mm, keine fremden Leitungen unter Y1.
*Erwartung heute:* Fernfeldunterschied durch die Leitungslänge. *Soll:* Befunde "Quarz 1 mm vom Rand,
2 mm von J1" und "IO_LED unter Y1".

**Abhilfe.** Quarz direkt am IC, weg von Rand und Steckern, ungestörte Massefläche darunter, keine
fremden Leitungen darunter.
**Nicht tun:** Quarz in die Ecke setzen, "weil dort Platz ist". Zur umstrittenen lokalen Masseinsel
unter dem Quarz siehe M-16.

**Quellen.** [Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[ST AN2867](https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf),
[LearnEMC, Good EMC Design Guidelines](https://learnemc.com/other-good-emc-design-guidelines),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf).

#### K-18 · I/O-Filter weit vom Stecker oder mit langer Masseanbindung
*EN: I/O or power-entry filter far from the connector, or with a long ground connection* ·
Belastbarkeit **Konsens** · Häufigkeit hoch · Engine heute **nein** · **Top 12**

**Mechanismus.** Ein Filter wirkt nur auf das, was hinter ihm liegt. Sitzt es am IC statt am
Stecker, ist die Leitung zwischen Stecker und Filter ungeschützt und nimmt auf dem Weg über die
Platine Störungen auf (K-16). Der Querkondensator wirkt nur so gut wie seine Anschlussinduktivität;
eine lange Bahn zum Masse-Via macht ihn bei 100 MHz wirkungslos (Wyatt: 2,5 cm Draht oder Bahn
haben bei 100 MHz etwa 12 Ω). Prüflabore führen ungefilterte Kabelschnittstellen und zu weit vom
Eingang entfernte Filter unter den typischen Layoutursachen (C&E).

**Symptom im Labor.** Wie K-16; Filter vorhanden, aber ohne Wirkung oberhalb einiger zehn MHz.

**Erkennung aus Layoutdaten.** I/O-Netz vom Steckerpad aus verfolgen bis zum ersten Längselement
(R, L, Ferrit) und zum ersten Querkondensator nach Masse; Leitungslänge Stecker → Filter
(Schwelle etwa 10 mm), Anschlusslänge Kondensator → Masse-Via (Schwelle wenige mm), und ob die
ungefilterte Strecke an schnellen Leitungen vorbeiläuft. *Daten:* Netzliste, Bauteilwerte
(Value-Feld), Footprint-Klasse, Tracks, Vias. *Falsch-positiv:* Schnittstellen ohne Filterbedarf
(z. B. schon geschirmte Koaxleitungen). *Falsch-negativ:* Filter im Stecker integriert.

**Engine heute.** Nein.

**Testboard.** Basis TB-4L mit CLK-Strecke; J1 (`PinHeader_1x04`) bei (3, 45), Netz `IO_LINE` von J1
nach U2.
*Schlecht:* Filter R6 (100 Ω, 0603) + C6 (1 nF, 0402) bei (62, 45) neben U2; Strecke J1 → R6
etwa 58 mm parallel zur Taktleitung; C6-Masse über 10 mm Bahn zu einem Via.
*Gut:* R6 und C6 innerhalb 4 mm von J1, C6 mit Masse-Via direkt am Pad, gefilterte Leitung danach
zu U2.
*Erwartung heute:* kein Unterschied. *Soll:* Befunde "Filter 58 mm vom Stecker" und
"Filterkondensator mit 10 mm Masseanbindung".

**Abhilfe.** Filter direkt am Stecker, Kondensator mit eigenem Via (besser zwei) zur Fläche, bei
Metallgehäuse Bezug auf das Chassis am Stecker.
**Nicht tun:** Filter "ordentlich" neben den IC setzen; Filterkondensator über eine lange Bahn an
Masse hängen.

**Quellen.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[LearnEMC, Introduction to common-mode filtering](https://learnemc.com/cm-filtering),
[EEVblog, Fixing a product failing CE radiated emissions](https://www.eevblog.com/forum/projects/fixing-a-product-that-is-failing-ce-radiated-emissions/),
[C&E, Common EMC failures](https://www.celectronics.com/Resources/Common-EMC-Failures).

#### K-19 · Filter durch Lagenüberlappung oder Parallelführung umgangen
*EN: Filter bypassed by overlapping input/output copper or parallel routing* · Belastbarkeit
**Konsens** · Häufigkeit hoch · Engine heute **nein** · **Top 12**

**Mechanismus.** Hubing beschreibt als zweithäufigsten Fehler aus seinen Layoutprüfungen (er nennt
etwa 90 % der geprüften Platinen), dass ungefiltertes Eingangsnetz (z. B. `VBAT`) und gefiltertes
Ausgangsnetz (z. B. `VDD`) auf verschiedenen Lagen übereinander liegen. Die Überlappung bildet 50 bis
200 pF parallel zum Filter, die den Filter bei hohen Frequenzen kurzschließen und mit der
Filterinduktivität eine Parallelresonanz bilden. Eigene Beispielrechnung: 400 mm² Überlappung über
0,21 mm Prepreg ergeben etwa 74 pF, bei 100 MHz rund 21 Ω, gegenüber einem Ferrit mit 600 Ω: Der
Filter ist praktisch umgangen. Dasselbe passiert magnetisch und kapazitiv, wenn Eingangs- und
Ausgangsleitung nebeneinander laufen.

**Symptom im Labor.** Filter bestückt, Wirkung oberhalb 30 bis 50 MHz fehlt; Störpegel auf dem
Versorgungskabel wie ohne Filter.

**Erkennung aus Layoutdaten.** Filterbauteile finden (Längselement zwischen zwei Netzen, mit
Querkondensatoren); für die Kupferflächen (Zonen, breite Bahnen, Pads) beider Netze die Überlappung
je Lagenpaar berechnen, mit dem Stackup in Kapazität umrechnen, mit der Impedanz des Längselements
bei 30 bis 300 MHz vergleichen. Zusätzlich parallel laufende Abschnitte beider Netze auf derselben
Lage. *Daten:* Zonen und Tracks je Netz und Lage, Stackup (Dicke, εr), Bauteilwerte. *Falsch-positiv:*
Überlappung mit einer Massefläche dazwischen (schirmt ab). *Falsch-negativ:* Kopplung über
Bauteilkörper (große Drosseln).

**Engine heute.** Ja für die Überlappung (`filter-bypass`, Testplatine `filter-bypass`):
Ferrite und Spulen mit lesbarem Wert, Überlappung je Lagenpaar ohne Flächenkupfer dazwischen,
Plattenkondensator ohne Randfeld. Parallelführung auf derselben Lage nein.

**Testboard.** Basis TB-4L ohne Taktquelle; J1 (2-polig, `+12V_IN` und GND) bei (3, 30); FB1
(`L_0805_2012Metric`, Wert `600R@100MHz`) bei (12, 30) mit C7 (100 nF) davor und C8 (1 µF) danach.
*Schlecht:* `+12V_IN`-Fläche 20 × 20 mm auf F.Cu bei x = 5 bis 25, y = 20 bis 40; `+12V_F`
(gefiltert) als Fläche gleicher Größe auf In2.Cu direkt darunter (In1 an dieser Stelle frei),
Überlappung 400 mm²; dazu Ausgangsbahn 15 mm parallel zur Eingangsbahn im Abstand 0,3 mm.
*Gut:* Eingangsfläche nur bis FB1, Ausgang auf der anderen Seite des Filters, In1 GND überall
dazwischen, keine Parallelführung.
*Quelle für die Bewertung:* Störquelle auf `+12V_F` (z. B. BUCK-Block, K-29) oder eine
Ersatzquelle 1 V breitbandig.
*Erwartung heute:* kein Befund. *Soll:* "Überlappung `+12V_IN`/`+12V_F` 400 mm², ≈ 74 pF, Filter
oberhalb ≈ 30 MHz umgangen".

**Abhilfe.** Eingang und Ausgang eines Filters räumlich getrennt, keine Überlappung auf irgendeiner
Lage, Massefläche dazwischen, Filter am Plattenrand mit Eingang zum Stecker.
**Nicht tun:** Versorgungsnetze aus Stromgründen auf allen Lagen breit fluten, ohne auf die
Filtergrenze zu achten.

**Quellen.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[ADI, Ferrite Beads Demystified](https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html).

#### K-20 · Steckerschirm schlecht angebunden
*EN: Poor connector shield termination (pigtail, thin trace, floating shell)* · Belastbarkeit
**gesichert** (Pigtail), **umstritten** (Ferrit oder RC im Schirmpfad) · Häufigkeit hoch · Engine
heute **nein** · **Top 12**

**Mechanismus.** Der Schirm eines Kabels hilft nur, wenn der Gleichtaktstrom auf der Innenseite des
Schirms zur Quelle zurückfließen kann. Ein Pigtail oder eine dünne Bahn vom Steckergehäuse zur Masse
ist eine Induktivität, an der genau die Spannung abfällt, die den Schirm außen antreibt. Wyatt zählt
schlecht abgeschlossene Kabelschirme und Pigtails zu den fünf häufigsten Gründen für Fehlschläge;
ein Pigtail von 2,5 cm hat bei 100 MHz etwa 12 Ω; zwei von acht getesteten HDMI-Kabeln strahlten wegen
schlechter Schirmanbindung bis zu 25 dB mehr. Auf der Platine heißt das: Schirm- und Gehäusepads der
Buchse kurz und breit an Masse oder Chassis.
Umstritten ist, ob man einen Ferrit oder ein RC-Glied in den Schirmpfad setzen soll: TI empfiehlt in
seinen USB-2.0-Richtlinien einen Ferrit zwischen Schirm und Masse, andere Quellen eine Kombination
aus 1 MΩ parallel 4,7 nF; Hubing und Wyatt betonen dagegen eine niederohmige HF-Verbindung des Schirms
zum Gehäuse.

**Symptom im Labor.** Abstrahlung trotz geschirmtem Kabel; ein Kupferband zwischen Steckergehäuse und
Masse oder Gehäuse senkt den Pegel deutlich.

**Erkennung aus Layoutdaten.** Schirmpads der Buchse finden (Padnamen `S*`, `SH*`, `SHIELD`, `MP`,
`0`, oder mechanische Pads mit Netz); Netz und Verbindungsweg bestimmen: kein Netz (schwebend), Bahn
mit Länge und Breite bis zur Fläche (Induktivität und Impedanz bei 100 MHz), Serienbauteile
(Ferrit, R, C). Befund bei mehr als einigen Ω bei 100 MHz. *Daten:* Padnamen, Netze, Tracks, Vias,
Bauteile. *Falsch-positiv:* Geräte ohne geschirmte Kabel. *Falsch-negativ:* Schirmanbindung über
Gehäusefedern, die nicht in der Platine stehen.

**Engine heute.** Nein.

**Testboard.** Basis TB-4L; J1 = `USB_C_Receptacle_GCT_USB4085` bei (4, 30).
*Schlecht A:* Schirmpads ohne Netz. *Schlecht B:* Schirmpads über 0,2 mm × 15 mm Bahn zu einem
GND-Via. *Schlecht C:* Schirm über Ferrit `600R@100MHz` und 1 MΩ ∥ 4,7 nF nach GND (für die
umstrittene Variante nur Hinweis, kein Fehler).
*Gut:* Schirmpads auf GND, je Pad zwei bis vier Vias direkt in die Fläche.
*Erwartung heute:* kein Unterschied. *Soll:* A und B als Befund mit Impedanzangabe, C als Hinweis.

**Abhilfe.** Schirm und Gehäuse der Buchse rundum niederohmig an die Fläche bzw. an das Chassis;
bei Metallgehäusen 360°-Anbindung am Gehäuse.
**Nicht tun:** Schirmpads unverbunden lassen oder "sicherheitshalber" über eine dünne Bahn führen.

**Quellen.** [Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[TI, USB 2.0 Board Design and Layout Guidelines](https://e2echina.ti.com/cfs-file/__key/telligent-evolution-components-attachments/13-106-00-00-00-00-33-10/USB-2.0-Board-Design-and-Layout-Guidelines.pdf),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines).

#### K-21 · Keine niederohmige Chassisanbindung am Steckerbereich
*EN: Missing low-impedance chassis bond near the connectors* · Belastbarkeit **Konsens**, abhängig
vom Gehäuse · Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** In einem Metallgehäuse soll die Massefläche der Platine direkt neben den Steckern,
am besten beidseits, mit dem Gehäuse verbunden sein. Dann liegt zwischen Kabelschirm, Gehäuse und
Platinenmasse dort keine HF-Spannung. Sitzen die Verbindungen weit weg (oder sind die Montagelöcher
isoliert), treibt die Platine die Kabel gegen das Gehäuse. LearnEMC empfiehlt Verbindungspunkte zu
beiden Seiten jedes Steckers, bei Steckern an mehreren Kanten jeweils eigene Punkte; die Regel
"I/O-Masse über einen einzigen Punkt an die Digitalmasse" hält Hubing für einen der schlechtesten
Ratschläge.

**Symptom im Labor.** Gleichtakt auf Kabeln trotz Metallgehäuse; Abhilfe im Labor durch Kupferband
zwischen Platinenmasse und Gehäuse am Stecker.

**Erkennung aus Layoutdaten.** Montagelöcher (`MountingHole:*`) und ihre Netze; Abstand jedes
Kabelsteckers zum nächsten masseverbundenen Montageloch; Befund, wenn keins in etwa 10 bis 20 mm
liegt oder nur eins auf einer Seite. Nur sinnvoll, wenn der Nutzer "Metallgehäuse" angibt.
*Daten:* Footprints, Netze, Positionen, Nutzerangabe zum Gehäuse. *Falsch-positiv:*
Kunststoffgehäuse. *Falsch-negativ:* Gehäusekontakt über Federn oder Schirmbleche.

**Engine heute.** Nein (kein Gehäusemodell).

**Testboard.** Basis TB-4L, J1 und J2 an der linken Kante bei (3, 20) und (3, 40), vier
Montagelöcher.
*Schlecht:* MH1 bis MH4 in den Ecken, ohne Netz.
*Gut:* zusätzliche MH5 und MH6 bei (6, 12) und (6, 48), dazu MH7 bei (6, 30) zwischen den Steckern,
alle auf GND mit Via-Kranz.
*Erwartung heute:* kein Unterschied. *Soll:* mit Nutzerangabe "Metallgehäuse" Befund bei schlecht.

**Abhilfe.** Massepunkte zum Gehäuse beidseits der Stecker, kurze und breite Verbindungen.
**Nicht tun:** I/O-Masse als Insel abtrennen und über einen einzigen Punkt verbinden (siehe K-02,
LearnEMC-Frage der Woche zum "quiet I/O ground").

**Quellen.** [LearnEMC, Grounding](https://learnemc.com/grounding),
[LearnEMC, Question of the week 2022-11-28](https://learnemc.com/qotw-221128),
[LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines).

#### K-22 · Zu wenige Massepins in Steckverbindern und Flachkabeln
*EN: Too few ground pins in board-to-board connectors and ribbon/FPC cables* · Belastbarkeit
**Konsens** · Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** In einem Flachkabel ist der Rückleiter so gut wie die Massepins. Liegen 20 Signale
an einem einzigen Massepin am Rand, fließt der Rückstrom der weit entfernten Signale über große
Schleifen und zum Teil über fremde Wege (Gehäuse, andere Kabel). Wyatt empfiehlt, sich einem
Verhältnis Signal zu Masse von 1:1 zu nähern; Academy of EMC empfiehlt Leiterfolgen wie Masse,
Signal, Masse, Signal. In der Clemson-I/O-Bewertung geht die Zahl der Massepins direkt in die
Antennenimpedanz ein (Z_ant = 80·(N+1) Ω, gedeckelt bei 800 Ω). Displays mit breitem Parallelbus
und nur ein oder zwei Massepins im Flachkabel sind ein typischer Fall.

**Symptom im Labor.** Pixeltakt oder Busfrequenz des Displays und Harmonische, oft mit Abstrahlung
aus Flachkabel und Displayrahmen (Wyatt: ein zusätzlicher Massekontakt am Displaygehäuse brachte
8 dB).

**Erkennung aus Layoutdaten.** Für Steckverbinder mit schnellen Netzen: Zahl der Massepins, Verhältnis
zu schnellen Signalpins, Abstand jedes schnellen Pins zum nächsten Massepin (in Pinpositionen).
*Daten:* Pads mit Netz und Position, Netzklassen. *Falsch-positiv:* geschirmte Kabel mit eigenem
Rückleiter. *Falsch-negativ:* Pinbelegung auf der Gegenseite unbekannt.

**Engine heute.** Nein (Kabel nicht modelliert).

**Testboard.** Basis TB-4L, J3 = `PinHeader_2x10_P2.54mm_Vertical` bei (60, 50), acht
Datenleitungen `LCD_D0` bis `LCD_D7` und `LCD_CLK` (30 MHz, 2 ns) von U2 zu J3.
*Schlecht:* nur Pin 20 auf GND.
*Gut:* jeder zweite Pin GND (10 Massepins), `LCD_CLK` zwischen zwei Massepins.
*Erwartung heute:* kein Unterschied. *Soll:* Befund "J3: 9 schnelle Signale, 1 Massepin,
LCD_CLK 9 Pins vom nächsten Massepin".

**Abhilfe.** Massepins verteilen, Takt neben Masse, bei Bedarf geschirmtes Kabel mit Schirmanbindung
an beiden Enden.
**Nicht tun:** Massepins sparen, um einen kleineren Stecker zu nehmen.

**Quellen.** [Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Academy of EMC](https://www.academyofemc.com/emc-design-guidelines),
[Clemson, I/O coupling algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/IO_coupling_algorithm_summary.pdf).

#### K-23 · Ethernet: Flächen und Chassis am Übertrager
*EN: Ethernet magnetics/RJ45 plane and chassis handling* · Belastbarkeit **umstritten** · Häufigkeit
gering · Engine heute **nein**

**Mechanismus.** Bei Ethernet entsteht die Abstrahlung fast nur durch Gleichtakt auf dem
Twisted-Pair-Kabel: durch Unsymmetrie im Paar, durch Kopplung vom PHY und seiner Versorgung über den
Übertrager, und über das Gehäuse. TI empfiehlt gleich lange MDI-Leitungen, symmetrische
Abschlussbauteile, eine Gleichtaktdrossel zusammen mit dem Übertrager, eine geschirmte Buchse auf
einer eigenen Chassisfläche, die über zwei 1206-0-Ω-Bauteile symmetrisch beidseits der Buchse mit der
Systemmasse verbunden ist (später gegen Kondensatoren oder Ferrite tauschbar). Viele Herstellernotizen
verlangen, die Flächen unter dem Übertrager und zwischen Übertrager und Buchse auszusparen.
Andere Autoren (Peterson) zeigen, dass auch durchgehende Flächen funktionieren können, und sehen
einen Zielkonflikt zwischen Schleifeninduktivität, Kopplung und ESD-Isolation. Der Isolationsabstand
(1500 V) ist eine Sicherheitsanforderung, unabhängig von EMV.

**Symptom im Labor.** 125 MHz (100BASE-TX) und Harmonische, 25-MHz-Takt des PHY auf dem Netzkabel.

**Erkennung aus Layoutdaten.** RJ45-Footprint und Übertrager finden; prüfen: PHY-Takt und schnelle
Leitungen nicht nahe der Buchse, MDI-Paare symmetrisch (K-14), keine Leitungen anderer Netze zwischen
Übertrager und Buchse, Isolationsabstand eingehalten. Die Frage "Fläche unter dem Übertrager ja oder
nein" nur als Hinweis ausgeben. *Daten:* Footprints, Zonen, Netze. *Falsch-positiv:* Buchsen mit
integriertem Übertrager. *Falsch-negativ:* keine.

**Engine heute.** Nein.

**Testboard.** Basis TB-4L, J1 = `Connector_RJ:RJ45_Amphenol_RJHSE5380` am linken Rand, Übertrager als
Platzhalter (`Package_SO:SOIC-16W_7.5x10.3mm_P1.27mm`, Wert `H1102`), PHY als SOIC-8-Platzhalter
mit 25-MHz-Oszillator.
*Schlecht:* PHY und Oszillator 8 mm von der Buchse, MDI-Paare mit 5 mm Längendifferenz, GND- und
+3V3-Flächen durchgehend unter Buchse und Übertrager, Schirmpads der Buchse ohne Netz.
*Gut:* PHY ≥ 25 mm von der Buchse, Paare symmetrisch, Chassisinsel unter der Buchse mit Schirmpads,
zwei 1206-Brücken symmetrisch zur Systemmasse, Flächen unter dem Übertrager ausgespart.
*Erwartung:* heute nur Unterschiede durch die Paargeometrie; *Soll:* Befunde zu Abstand PHY–Buchse,
Paarsymmetrie und Schirmpads; Flächenfrage als Hinweis.

**Abhilfe.** Herstellerrichtlinie des PHY befolgen, Paarsymmetrie, PHY-Takt fern der Buchse,
Schirmanbindung.
**Nicht tun:** eine der Flächenvarianten als einzig richtige behandeln.

**Quellen.** [TI SNLA107A, Ethernet radiated emissions](https://www.ti.com/lit/an/snla107a/snla107a.pdf),
[Microchip AN111](https://ww1.microchip.com/downloads/en/AppNotes/AN%20111.10-100.General%20PCB%20Design%20and%20Layout%20Guidelines.pdf),
[Peterson, Ethernet connectors and ground planes](https://www.signalintegrityjournal.com/articles/1808-ethernet-connectors-and-routing-above-ground-planes).

### D Versorgung, Entkopplung, Filterbauteile

#### K-24 · Entkopplung fehlt oder ist hochinduktiv angeschlossen
*EN: Missing local decoupling or decoupling capacitor with high mounting inductance* ·
Belastbarkeit **gesichert** · Häufigkeit hoch · Engine heute **teilweise** · **Top 12**

**Mechanismus.** Schaltende ICs ziehen kurze Stromspitzen aus der Versorgung. Fehlt ein naher,
niederinduktiver Kondensator, fließen diese Spitzen über große Schleifen durch die Versorgung, und das
Rauschen auf der Versorgungsfläche treibt Kabel und Flächenresonanzen. Entscheidend ist nicht der
Kapazitätswert, sondern die Anschlussinduktivität aus Kondensatorgehäuse, Pads, Bahnen und Vias
(LearnEMC). Clemson rechnet für Bahnen zum Kondensator mit etwa 0,2 nH/mm × (2 + ln(h/w)) plus 1 nH
für Gehäuse und Vias; 2 × 15 mm Bahn ergeben so rund 13 nH, damit ist ein 100-nF-Kondensator ab etwa
4 MHz induktiv (eigene Rechnung). Wyatt führt schlechte Versorgungsnetze (PDN) an vierter Stelle
seiner fünf häufigsten Gründe für Fehlschläge; Hubing nennt unpassende Entkopplung unter seinen sechs häufigsten Fehlern.
Infineon zeigt, dass ein Anschluss über Vias oberhalb 400 MHz eine niedrigere Impedanz hat als über
Bahnen.

**Symptom im Labor.** Breite Kämme aller Taktharmonischen, oft Überhöhungen bei Flächenresonanzen,
Störungen auf dem Versorgungskabel.

**Erkennung aus Layoutdaten.** Für jeden Versorgungspin eines ICs (Pinfunktion oder Netzname `VCC`,
`VDD`, `3V3` …): nächster Kondensator zwischen diesem Netz und Masse; Weglänge Pin → Kondensator →
Massepin bzw. Fläche; Bahnlänge zwischen Kondensatorpad und Via; Via mit dem IC geteilt (LearnEMC:
nicht teilen). Werte über etwa 200 nF zählt Clemson für hohe Frequenzen nicht mit. *Daten:*
Pinfunktionen, Netze, Bauteilwerte, Tracks, Vias, Stackup. *Falsch-positiv:* ICs mit internem
Entkoppler; Analogbausteine mit langsamen Strömen. *Falsch-negativ:* Kondensator nah, aber auf der
anderen Platinenseite mit nur einem Via.

**Engine heute.** Teilweise. Kondensatoren dienen als Übergabepunkte für den Rückstrom bei
`ref-change`. Anschlussinduktivität, fehlende Entkopplung und das Versorgungsrauschen selbst werden
nicht bewertet; eine Versorgungsschleife IC → Kondensator → IC wäre nur als vom Nutzer definierte
Schleife möglich.

**Testboard.** Basis TB-4L mit CLK-Strecke.
*Schlecht A:* C2 (100 nF) 15 mm von U2, Anschluss über 0,2-mm-Bahnen, GND-Via erst 8 mm weiter.
*Schlecht B:* kein Kondensator an U2 im Umkreis von 20 mm.
*Gut:* C2 (0402) ≤ 2 mm vom VCC-Pin, Vias direkt an den Pads (≤ 0,5 mm), eigene Vias, nicht mit dem
IC geteilt.
*Erwartung heute:* kein Befund. *Soll:* "U2 VCC: Entkoppler mit ≈ 13 nH Anschluss" (A) bzw.
"U2 VCC ohne lokalen Entkoppler" (B); optional automatisch erzeugte Versorgungsschleife als Quelle.

**Abhilfe.** Je Versorgungspin ein kleiner Kondensator, Vias direkt am Pad, bei eng gekoppelten
Flächen mehrere gleiche Kondensatoren statt eines großen; Bulk-Kondensator am Versorgungseingang.
**Nicht tun:** Kondensator nah setzen und dann über Bahnen anschließen; Vias mit dem IC teilen. Zur
Frage "so nah wie möglich" siehe M-06.

**Quellen.** [LearnEMC, Decoupling with closely spaced planes](https://learnemc.com/decoupling-for-boards-with-closely-spaces-power-planes),
[LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes),
[Clemson, Power bus decoupling algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Power_bus_decoupling_algorithm_summary.pdf),
[Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

#### K-25 · Stark unterschiedliche MLCC parallel
*EN: Widely different ceramic capacitor values in parallel (anti-resonance)* · Belastbarkeit
**umstritten** · Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** Zwischen der Serienresonanz des großen Kondensators (danach induktiv) und der des
kleinen (noch kapazitiv) liegt eine Parallelresonanz. Bei verlustarmen Keramikkondensatoren hat sie
eine hohe Güte; die Versorgungsimpedanz bekommt dort eine Spitze, die bei passender Anregung abstrahlt.
Hubing beschreibt mehrere Produkte, die deswegen scheiterten (Beispiel 10 µF parallel 10 nF), und rät,
Werte am selben Netz innerhalb einer Dekade zu halten; LearnEMC ergänzt, dass zwei gleiche
Kondensatoren besser sind als einer mit doppeltem Wert (geringere Anschlussinduktivität). Viele
Herstellerdatenblätter empfehlen dagegen weiterhin 10 µF plus 100 nF. Ob die Resonanz stört, hängt von Dämpfung (ESR), Flächenkapazität und Anregung ab; das ist der Grund für die
Einstufung als umstritten.

**Symptom im Labor.** Schmale Überhöhung im Bereich einiger zehn bis hundert MHz, manchmal über 1 GHz
(LearnEMC-Frage der Woche).

**Erkennung aus Layoutdaten.** Kondensatoren je Netzpaar (Versorgung, Masse) in einem Umkreis
gruppieren; Werte aus dem Value-Feld lesen (`10u`, `100n`, `4u7`); Verhältnis > 10 meldet einen
Hinweis; Resonanzfrequenzen aus Wert, geschätzter ESL je Gehäusegröße und Anschlussinduktivität
abschätzen. *Daten:* Value-Felder, Footprint-Größe, Netze. *Falsch-positiv:* Tantal- oder
Elektrolytkondensatoren (hoher ESR, dämpfen). *Falsch-negativ:* fehlende oder uneinheitliche
Value-Felder.

**Engine heute.** Nein (Werte werden für die Entkopplung nicht ausgewertet).

**Testboard.** Basis TB-4L mit CLK-Strecke.
*Schlecht:* an U2 C2 = 10 µF (0805) und C9 = 10 nF (0402) parallel.
*Gut:* zweimal 1 µF (0402) oder 1 µF und 100 nF.
*Erwartung heute:* kein Unterschied. *Soll:* Hinweis "Wertverhältnis 1000:1, Antiresonanz bei etwa
… MHz", ausdrücklich als Hinweis gekennzeichnet.

**Abhilfe.** Gleiche oder ähnliche Werte, verlustbehaftete Bulk-Kondensatoren, ausreichende
Flächenkapazität.
**Nicht tun:** Wertestaffeln nach Kochbuch (siehe M-05).

**Quellen.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[LearnEMC, Question of the week 2023-12-04](https://learnemc.com/qotw-231204),
[LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes).

#### K-26 · Ferritperle falsch eingesetzt
*EN: Misused ferrite bead (in the ground path, LC resonance, DC saturation)* · Belastbarkeit
**gesichert** · Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** Drei typische Fehler: (a) Ferrit zwischen zwei Masseflächen oder im Rückweg; das
erzeugt bei Hochfrequenz eine Spannung zwischen den Massen, also genau den Antrieb für Gleichtakt
(Hubing: Masse ist kein Rückstrompfad, LearnEMC: "quiet ground" nicht über Ferrit). (b) Ferrit mit
verlustarmem Kondensator bildet einen Schwingkreis; ADI zeigt Resonanzüberhöhungen von etwa 10 bis
15 dB, das Filter verstärkt dann im Bereich der Resonanz. (c) Gleichstrom senkt die Impedanz stark;
laut ADI fällt sie bei halbem Nennstrom bei 100 MHz z. B. von 100 Ω auf 10 Ω.

**Symptom im Labor.** Filter ohne Wirkung oder mit verstärkter Störung im Bereich einiger MHz;
Gleichtakt auf Kabeln bei Ferrit in der Masse.

**Erkennung aus Layoutdaten.** (a) Ferrit oder Induktivität, deren beide Netze massenahe Namen
tragen (`GND`, `AGND`, `SHIELD` …); (b) Ferrit mit Kondensatoren beidseits: Resonanz aus
Datenblattwerten (oder typischen Werten) abschätzen; (c) Nennstrom aus einem Bauteilfeld gegen den
vom Nutzer angegebenen Laststrom. *Daten:* Referenzpräfix `FB`/`L`, Value- und Zusatzfelder, Netze.
*Falsch-positiv:* Ferrit im Schirmpfad (umstritten, K-20). *Falsch-negativ:* Ferrite mit
irreführender Referenz.

**Engine heute.** Nein.

**Testboard.** Basis TB-4L.
*Schlecht A:* J2 (USB-C) mit eigener GND-Insel, die nur über FB2 (`L_0805_2012Metric`, Wert
`600R@100MHz`) an die Hauptmasse angebunden ist. *Schlecht B:* FB1 mit C8 = 10 µF Keramik direkt
dahinter, ohne Dämpfung. *Schlecht C:* FB1 mit Feld `Irated=0.5A` im 2-A-Zweig des BUCK-Blocks.
*Gut:* A ohne Insel und ohne FB2; B mit Dämpfungswiderstand oder verlustbehaftetem Bulk-Kondensator;
C mit ausreichend bemessenem Ferrit.
*Erwartung heute:* nur A über die Rückstromseite teilweise sichtbar. *Soll:* drei getrennte Befunde.

**Abhilfe.** Ferrite nur in Versorgungs- oder Signalpfaden, nie im Massepfad; Resonanz dämpfen;
Nennstrom mit Reserve.
**Nicht tun:** "Ferrit hilft immer" (M-09).

**Quellen.** [ADI, Ferrite Beads Demystified](https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html),
[LearnEMC, Question of the week 2022-11-28](https://learnemc.com/qotw-221128),
[LearnEMC, Grounding](https://learnemc.com/grounding).

#### K-27 · Gleichtaktdrossel an unsymmetrischer Gleichspannungsversorgung
*EN: Common-mode choke on an unbalanced DC power input* · Belastbarkeit **umstritten** · Häufigkeit
mittel · Engine heute **nein**

**Mechanismus.** Eine Gleichtaktdrossel wirkt in symmetrischen Systemen, in denen beide Leiter
gleiche Impedanz gegen Masse haben (Netzeingang mit Y-Kondensatoren, Twisted Pair). An einem
Gleichspannungseingang, dessen Minus direkt die Massefläche ist, wandelt sie nach Hubing nur Gleich-
in Gegentakt um, ohne zu nützen; er rät, den Eingang bewusst unsymmetrisch zu machen und die Seite
mit der höheren Impedanz gegen Masse zu filtern (Längselement im Plus, Querkondensator). In der
Industriepraxis sind Drosseln an Gleichspannungseingängen dennoch verbreitet, oft zusammen mit
Kondensatoren zum Chassis. Daher nur als Hinweis.

**Symptom im Labor.** Drossel bestückt, keine Verbesserung auf dem Versorgungskabel.

**Erkennung aus Layoutdaten.** Bauteil mit Gleichtaktdrossel-Footprint (`L_CommonMode*`,
`L_CommonModeChoke*`) an einem Versorgungsstecker; prüfen, ob eine Seite die Hauptmasse ist und ob
Kondensatoren zum Chassis existieren. *Daten:* Footprint, Netze, Stecker. *Falsch-positiv:*
symmetrische Eingänge (Netz, PoE, CAN). *Falsch-negativ:* Drossel als generisches Bauteil.

**Engine heute.** Nein.

**Testboard.** Basis TB-4L; J1 (2-polig, `+12V_IN`, GND) bei (3, 30), L2 =
`L_CommonModeChoke_Wuerth_WE-SL5` bei (12, 30), dahinter der BUCK-Block.
*Schlecht:* beide Leiter durch L2, Minus nach L2 auf die Hauptmasse.
*Gut:* L2 entfällt, dafür FB1 im Plus und Kondensatoren 1 µF und 100 nF nach Masse direkt am
Stecker.
*Erwartung:* heute kein Unterschied. *Soll:* Hinweis "Gleichtaktdrossel an unsymmetrischem
Eingang", keine dB-Aussage.

**Abhilfe.** Filtertopologie nach Symmetrie des Systems wählen.
**Nicht tun:** Gleichtaktdrossel als Universalmittel ansehen (M-10).

**Quellen.** [Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022),
[LearnEMC, Introduction to common-mode filtering](https://learnemc.com/cm-filtering),
[Hubing, Four commonly held myths](https://resources.altium.com/p/four-commonly-held-myths-emc-design).

#### K-28 · Versorgungsschleife auf Zweilagenplatinen
*EN: Power and ground routed far apart on two-layer boards (large supply loop)* · Belastbarkeit
**Konsens** · Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Auf Platinen ohne Flächen bilden Plus- und Masseleitung zur Versorgung eines ICs
eine Schleife, durch die alle Stromspitzen fließen, die der lokale Kondensator nicht abfängt. Laufen
Plus und Masse auf verschiedenen Wegen (Plus oben am Rand, Masse unten), ist diese Schleife so groß
wie die Platine. LearnEMC empfiehlt für Zweilagen-Boards einen lokalen Kondensator je Baustein und
einen Bulk-Kondensator dort, wo die Spannung auf die Platine kommt; das Massegitter (K-09) senkt die
Schleifen.

**Symptom im Labor.** Breitbandige Takt- und Schaltharmonische bereits unter 100 MHz.

**Erkennung aus Layoutdaten.** Für jedes Versorgungsnetz den Weg vom Einspeisepunkt (Stecker,
Regler) zu den Lasten und den Weg der Masse zurück bestimmen; eingeschlossene Fläche berechnen.
*Daten:* Netzliste, Tracks, Stecker und Reglerpins. *Falsch-positiv:* Lasten mit gutem lokalem
Entkoppler (dann führt die lange Schleife nur Gleichstrom). *Falsch-negativ:* Massefläche, die nur auf
dem Papier zusammenhängt.

**Engine heute.** Teilweise. Als vom Nutzer definierte Schleife (Pads in Reihenfolge) wird die
Fläche korrekt berechnet; eine automatische Erkennung fehlt.

**Testboard.** Basis TB-2L, J1 (`+5V`, GND) bei (3, 30), U2 bei (68, 30) ohne lokalen Kondensator.
*Schlecht:* `+5V` als Bahn am oberen Rand (y = 5), GND als Bahn am unteren Rand (y = 55).
*Gut A:* `+5V` und GND als Bahnen direkt übereinander (F.Cu und B.Cu), Schleife etwa
65 × 1,6 ≈ 100 mm². *Gut B:* zusätzlich C2 (100 nF) an U2; der Wechselanteil schließt sich dann
lokal (etwa 10 mm²).
*Quelle:* Schleife J1.1 → U2.VCC → U2.GND → J1.2 mit 50 mA Stromspitzen, 2 ns (für Gut B die
Schleife U2.VCC → C2 → U2.GND).
*Erwartung:* Schleifenfläche etwa 3000 mm² gegen etwa 100 mm² (rund 30 dB im Gegentakt) bzw.
10 mm² (rund 50 dB), eigene Rechnung; *Soll:* automatische Erkennung.

**Abhilfe.** Plus und Masse gemeinsam führen, lokale Entkopplung, Massefläche.
**Nicht tun:** Versorgung "sternförmig" mit getrennten Wegen für Plus und Masse verlegen.

**Quellen.** [LearnEMC, Decoupling without power planes](https://learnemc.com/decoupling-for-boards-without-power-planes),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[All About Circuits, Gridded ground](https://www.allaboutcircuits.com/technical-articles/multipoint-grounding-gridded-ground-for-double-sided-pcbs/).

### E Schaltregler und isolierte Wandler

#### K-29 · Großer heißer Kreis im Schaltregler
*EN: Large hot loop (input capacitor far from the switches)* · Belastbarkeit **gesichert** ·
Häufigkeit hoch · Engine heute **ja** · **Top 12**

**Mechanismus.** Beim Buck-Regler springt der Strom im Kreis Eingangskondensator → High-Side-Schalter
→ Low-Side-Schalter → Eingangskondensator bei jeder Flanke zwischen null und dem Laststrom. Dieser
Kreis ist die stärkste magnetische Quelle des Wandlers, und seine parasitäre Induktivität erzeugt mit
den Schalterkapazitäten das Nachschwingen am Schaltknoten. Richtek nennt 50 bis 300 MHz als
typischen Bereich der Abstrahlprobleme und 200 bis 400 MHz als häufige Nachschwingfrequenz. TI (AN-2155) rechnet vor, dass schon eine Schleife von 12 mm² bei 35 MHz und 1 A knapp über
dem Grenzwert der Klasse B liegt (42,6 dBµV/m in 3 m); mit Massefläche darunter sinkt der Wert auf
etwa 38 dBµV/m. Gut platzierte Eingangskondensatoren senkten im Versuch Schaltspitzen um 3,6 V und
brachten mehrere dB Abstand. TI (Hegarty) und ADI (AN-139) sehen in der Fläche und Induktivität dieses
Kreises den wichtigsten Layoutparameter; Hubing zählt schlechte Wandlerlayouts zu den häufigsten
Fehlern, oft übernommen aus Herstellernotizen.

**Symptom im Labor.** Breitbandiger Buckel 30 bis 300 MHz, darauf Linien im Abstand der
Schaltfrequenz; leitungsgebunden oberhalb einiger MHz.

**Erkennung aus Layoutdaten.** Regler-IC über Pinfunktionen (`VIN`, `SW`, `GND`) erkennen, den
Eingangskondensator zwischen VIN- und GND-Netz finden und den Kreis über die Pads in Reihenfolge
bilden; Fläche (einschließlich des Rückwegs in der Fläche und durch Vias) berechnen. Schwellwert
etwa 20 bis 30 mm² als Hinweis. *Daten:* Pinfunktionen, Netze, Pads, Tracks, Vias, Zonen.
*Falsch-positiv:* Regler mit integrierten Eingangskondensatoren. *Falsch-negativ:* falsche Topologie
(K-30), Pinfunktionen fehlen in der Bibliothek.

**Engine heute.** Ja. Quellenvorschlag aus Pinfunktionen, Kreis über Pads, Fläche inklusive Anteil
in der Fläche, Fernfeld und Anteil. Einschränkung: Die Eingangsspannung wird mit 12 V geschätzt.

**Testboard.** Basis TB-4L mit BUCK-Block bei x = 20 bis 40, y = 10 bis 25.
*Schlecht:* CIN (10 µF, 1206) 15 mm von U3 entfernt, über 0,5-mm-Bahnen angeschlossen, kein kleiner
Kondensator an den Pins.
*Gut:* CIN (10 µF) und CIN2 (100 nF, 0402) direkt an VIN und GND (≤ 1 mm), GND-Pad mit Vias in die
Fläche.
*Erwartung:* Schleife schlecht etwa 45 mm² oder mehr, gut ≤ 5 mm²; Fernfeld schlecht ≥ 15 dB höher.

**Abhilfe.** Kleinster Kondensator am nächsten an VIN und GND, auf derselben Lage wie der Regler,
Massefläche direkt darunter (dünnes Prepreg), symmetrische Anordnung bei Hochstrom-Wandlern.
**Nicht tun:** Eingangskondensator auf die Unterseite setzen und über Vias anbinden; Ausgang statt
Eingang optimieren (K-30).

**Quellen.** [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[TI SLYT682, Hegarty](https://www.ti.com/lit/pdf/slyt682),
[Richtek AN045, Reducing EMI in buck converters](https://www.richtek.com/Design%20Support/Technical%20Document/AN045),
[ADI AN-139](https://www.analog.com/en/resources/app-notes/an-139.html),
[ADI, Single vs. dual hot loop](https://www.analog.com/en/resources/analog-dialogue/articles/4-switch-buck-boost-controller-layout-for-low-emissions-single-hot-loop-vs-dual-hot-loop.html),
[Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022).

#### K-30 · Falscher Kreis kompakt gemacht
*EN: Wrong loop minimised (buck vs. boost topology confused)* · Belastbarkeit **Konsens** ·
Häufigkeit gering bis mittel · Engine heute **teilweise**

**Mechanismus.** Beim Buck liegt der heiße Kreis auf der Eingangsseite, beim Boost auf der
Ausgangsseite (Schalter → Diode oder Synchronschalter → Ausgangskondensator → Masse); ADI beschreibt
den Boost als rückwärts betriebenen Buck. Wer ein Buck-Layout als Vorlage für einen Boost nimmt
(oder umgekehrt), macht den falschen Kreis kompakt; der Gleichstromkreis mit der Drossel ist dagegen
unkritisch.

**Symptom im Labor.** Wie K-29.

**Erkennung aus Layoutdaten.** Topologie aus der Netzliste ableiten: Liegt die Drossel zwischen
Eingang und Schaltknoten (Boost) oder zwischen Schaltknoten und Ausgang (Buck)? Danach den richtigen
Kondensator für den Kreis wählen. *Daten:* Netzliste, Pinfunktionen, Bauteilklassen (Diode,
Drossel). *Falsch-positiv:* Buck-Boost-Wandler mit zwei heißen Kreisen (beide prüfen).
*Falsch-negativ:* externe Schalter ohne Pinfunktionen.

**Engine heute.** Teilweise. Der Quellenvorschlag (`suggest.ts`) bildet den Kreis immer aus dem
Kondensator zwischen VIN- und GND-Netz am Regler, also nach Buck-Annahme. Beim Boost ist der
vorgeschlagene Kreis der falsche; der richtige lässt sich manuell definieren.

**Testboard.** Basis TB-4L, BOOST-Block: 5 V auf 12 V, L1 von `+5V` nach `SW`, U3 mit internem
Schalter `SW` → GND, D1 (`Diode_SMD:D_SMA`) von `SW` nach `+12V`, COUT (22 µF, 1206) nach GND.
*Schlecht:* CIN direkt am Regler, COUT 15 mm von D1 und vom GND-Pin entfernt.
*Gut:* COUT direkt zwischen D1-Kathode und U3-GND, kleiner 100-nF-Kondensator parallel.
*Erwartung heute:* Vorschlag nimmt den Eingangskreis, beide Varianten sehen ähnlich aus. *Soll:*
Topologie Boost erkannt, Kreis über D1 und COUT, schlecht deutlich lauter.

**Abhilfe.** Vor dem Layout die Kreise mit springendem Strom markieren (Buck: Eingang; Boost:
Ausgang; Buck-Boost: beide).
**Nicht tun:** Layout-Vorlagen ohne Prüfung der Topologie übernehmen.

**Quellen.** [ADI AN-139](https://www.analog.com/en/resources/app-notes/an-139.html),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf).

#### K-31 · Schaltknoten zu groß oder exponiert
*EN: Oversized or exposed switch-node copper* · Belastbarkeit **Konsens** · Häufigkeit mittel ·
Engine heute **teilweise**

**Mechanismus.** Der Schaltknoten springt mit hoher Steilheit um die volle Eingangsspannung. Jede
Kupferfläche an diesem Knoten ist eine Kondensatorplatte, die in benachbarte Leitungen, Kabel,
Gehäuse und Kühlkörper koppelt (spannungsgetriebener Mechanismus). LearnEMC: Fläche klein halten und
fern von allen Leitern, die Strom aus dem Wandlerbereich hinaustragen könnten. TI fand im Versuch, dass
ein doppelt so langer Schaltknoten über einer Fläche das Fernfeld um weniger als 1 dB, das Nahfeld aber
deutlich erhöhte; das Führen des Schaltknotens auf die Unterseite verschlechterte leicht, vor allem
weil es den Rückweg unterbrach. Kühlung braucht etwas Fläche; ein Kompromiss ist eine Insel nur auf
der Bestückungsseite.

**Symptom im Labor.** Breitbandig wie K-29, besonders auf Kabeln, die nahe am Wandler verlaufen.

**Erkennung aus Layoutdaten.** Kupferfläche des SW-Netzes je Lage, Zahl der Lagen, Abstand zu
Platinenkante, Kabelsteckern, I/O-Netzen und Rückkopplungsleitung; Kapazität zu benachbarten Netzen
aus Überlappung und Randabstand. *Daten:* Zonen und Tracks des SW-Netzes, Stackup, Stecker.
*Falsch-positiv:* große Fläche, die vollständig über einer Massefläche liegt und weit von Kabeln weg
ist. *Falsch-negativ:* Schaltknoten an einem Kühlkörper (siehe K-37).

**Engine heute.** Teilweise: Das E-Feld des Schaltknotens (Stufe 2b) zeigt das Nahfeld; die
Kopplung auf Kabel und das resultierende Fernfeld fehlen.

**Testboard.** Basis TB-4L mit BUCK-Block bei x = 5 bis 25, y = 40 bis 55, J1 (Versorgungseingang)
bei (3, 30).
*Schlecht:* SW-Fläche 15 × 20 mm auf F.Cu und gespiegelt auf B.Cu (sechs Vias), bis 2 mm an die
untere Platinenkante und 3 mm an J1; die FB-Leitung läuft 10 mm daneben.
*Gut:* SW nur auf F.Cu, etwa 40 mm² zwischen U3-SW und L1, ≥ 10 mm von Kante und J1, FB-Leitung auf
der anderen Seite des Reglers.
*Erwartung heute:* Nahfeld E deutlich größer bei schlecht, Fernfeld fast gleich. *Soll:* Befund
"SW-Kupfer 600 mm² auf zwei Lagen, 3 mm von J1" mit Kapazitätsabschätzung.

**Abhilfe.** Schaltknoten kompakt, eine Lage, darunter durchgehende Masse, weg von Rändern, Steckern
und empfindlichen Leitungen.
**Nicht tun:** Schaltknoten zur Kühlung großflächig auf mehrere Lagen fluten.

**Quellen.** [LearnEMC, Power circuit layout](https://learnemc.com/power-circuit-layout),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Clemson, Voltage-driven EMI algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_driven_EMI.pdf).

#### K-32 · Massefläche unter dem Wandler aufgetrennt
*EN: Ground plane cut under the converter (separate PGND island)* · Belastbarkeit **gesichert** ·
Häufigkeit mittel · Engine heute **ja**

**Mechanismus.** Manche Applikationsschriften zeigen eine eigene "PGND"-Insel, die nur an einem Punkt
mit der übrigen Masse verbunden ist. Damit fehlt der Spiegelstrom unter dem heißen Kreis, die
Schleife wird größer, und die Insel wird gegenüber der übrigen Fläche zum angetriebenen Antennenteil.
TI maß: Entfernt man die Masse unter dem Hochstrompfad, verliert man 6 dB Abstand zum Grenzwert.
LearnEMC und Hubing raten ausdrücklich von isolierten PGND-Flächen ab.

**Symptom im Labor.** Wie K-29, dazu Gleichtakt auf Kabeln, die an der Insel hängen.

**Erkennung aus Layoutdaten.** Wie K-01 und K-02 für die Elemente des heißen Kreises; zusätzlich
Massezonen, die den Wandlerbereich umschließen und nur über einen schmalen Steg oder ein einzelnes
Bauteil angebunden sind. *Daten:* Zonen, Netze, Quellen. *Falsch-positiv:* isolierte Wandler mit
gewollter Trennung (K-36). *Falsch-negativ:* Insel nur auf der fernen Masselage.

**Engine heute.** Ja für die Gegentaktseite (Spiegelströme fehlen, `return-gap` am Kreis);
Gleichtakt der Insel fehlt.

**Testboard.** Basis TB-4L mit BUCK-Block bei x = 20 bis 40, y = 10 bis 25.
*Schlecht:* In1.Cu mit Zone `PGND` unter dem BUCK-Block (x = 18 bis 42, y = 8 bis 27), ringsum 1 mm
Abstand zur Zone `GND`, Verbindung nur über einen Net-Tie am U3-GND-Pad.
*Gut:* durchgehende Zone `GND`.
*Erwartung:* schlecht `return-gap` am heißen Kreis und höheres Fernfeld (TI-Messung: etwa 6 dB);
gut ohne Befund.

**Abhilfe.** Eine Massefläche direkt unter dem Wandler; Rückströme werden durch Platzierung gelenkt,
nicht durch Schlitze.
**Nicht tun:** "PGND und AGND nur am Sternpunkt verbinden".

**Quellen.** [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[LearnEMC, Power circuit layout](https://learnemc.com/power-circuit-layout),
[Hubing, AltiumLive 2022 Keynote](https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022).

#### K-33 · Speicherdrossel ungeschirmt, falsch orientiert oder an empfindlicher Stelle
*EN: Unshielded or misoriented power inductor, or inductor next to sensitive nets/cables* ·
Belastbarkeit **gesichert** (Messwerte), Masse unter der Drossel **umstritten** · Häufigkeit mittel ·
Engine heute **teilweise**

**Mechanismus.** Eine ungeschirmte Drossel hat ein weit reichendes Streufeld; TI fand mit
geschirmten Drosseln bessere Nah- und Fernfeldwerte. Der Wicklungsanfang (Punkt am Gehäuse) gehört an
den Schaltknoten: Dann schirmen die äußeren Windungen, die am ruhigen Ausgang liegen, das E-Feld ab;
Würth maß bis zu 8 dB weniger E-Feld bei richtiger Orientierung und etwa 10 dB durch eine
Metallschirmung. Ob die Massefläche unter der Drossel ausgespart werden soll, ist umstritten: Manche
Entwickler und Hersteller sparen sie wegen der Wirbelströme aus; ADI hält die Wirbelstromverluste
für lokal und klein und empfiehlt eine durchgehende Fläche auch unter der Drossel. Steuer- und
Rückkopplungsleitungen gehören nach ADI auf keiner Lage unter die Drossel.

**Symptom im Labor.** Schaltfrequenz und Harmonische im Nahfeld um die Drossel, Kopplung in nahe
Leitungen und Kabel, bei ungeschirmten Typen bis in den unteren MHz-Bereich.

**Erkennung aus Layoutdaten.** Drossel am Schaltknoten finden; Schirmungsart aus Bauteilfeld oder
Footprint-Familie; Pin 1 bzw. Markierung gegen das SW-Netz prüfen; Abstand zu Kabelsteckern, Kanten
und empfindlichen Netzen. *Daten:* Footprint, Felder, Pad 1, Netze, Positionen. *Falsch-positiv:*
Drosseln ohne definierten Wicklungsanfang (Footprint-Pin 1 sagt dann nichts). *Falsch-negativ:*
fehlende Bauteilfelder.

**Engine heute.** Teilweise: Spulenfeld als Quelle mit vom Nutzer gesetzter Schirmungsart;
Orientierung des Wicklungsanfangs und Nähe zu Kabeln fehlen.

**Testboard.** Basis TB-4L mit BUCK-Block.
*Schlecht:* L1 mit Feld `Shielding=none`, Pin 1 (Wicklungsanfang) am Ausgang `+3V3`, L1 3 mm neben
J1.
*Gut:* L1 mit `Shielding=shielded`, Pin 1 am Netz `SW`, ≥ 10 mm von J1.
*Erwartung heute:* Unterschied nur über die Schirmungsangabe. *Soll:* Befund "Wicklungsanfang am
Ausgang" und "Drossel 3 mm von J1".

**Abhilfe.** Geschirmte Drossel, Punkt an SW, Abstand zu Kabeln und empfindlichen Leitungen.
**Nicht tun:** ungeschirmte Drossel direkt an einen Kabelstecker setzen.

**Quellen.** [Würth ANP047](https://www.we-online.com/components/media/o109027v410%20ANP047c_The%20Behavior%20of%20Electro-Magnetic%20Radiation%20of%20Power%20Inductors%20in%20Power%20Management.pdf),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[ADI, Placing the inductor on an SMPS PCB](https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-164.html).

#### K-34 · Eingangsfilter des Wandlers fehlt oder sitzt falsch
*EN: Missing or misplaced converter input filter* · Belastbarkeit **gesichert** · Häufigkeit hoch ·
Engine heute **nein**

**Mechanismus.** Der Eingangskondensator schließt den Großteil des Wechselstroms kurz, aber nicht
alles; der Rest fließt über die Eingangsleitung und das Versorgungskabel, das dann als Antenne wirkt
und leitungsgebundene Störungen erzeugt. TI fand, dass ein LC-Eingangsfilter die Abstrahlung eines
Buck-Reglers an kurzen Batteriekabeln um bis zu 20 dB senkte. Das Filter gehört an den
Platineneingang und darf nicht durch Layout umgangen werden (K-19).

**Symptom im Labor.** Leitungsgebunden: Schaltfrequenz und Harmonische 150 kHz bis 30 MHz;
abgestrahlt: Buckel 30 bis 100 MHz über das Versorgungskabel.

**Erkennung aus Layoutdaten.** Weg vom Versorgungsstecker zum Eingangskondensator des Reglers
verfolgen; Längselement (Drossel, Ferrit) und Querkondensatoren suchen; Lage am Stecker oder am
Regler; Kopplung zwischen Filter-Ein- und -Ausgang. *Daten:* Netzliste, Bauteilklassen, Positionen.
*Falsch-positiv:* Wandler hinter einem bereits gefilterten Zwischenkreis. *Falsch-negativ:* keine.

**Engine heute.** Ja (`supply-noise`, Testplatine `input-filter`): Stromteiler vom Reglereingang über
die Kondensatoren und Längsglieder des Versorgungswegs bis zu einer Netznachbildung 2 × 50 Ω, Pegel
150 kHz bis 30 MHz gegen den Mittelwert-Grenzwert für Netzanschlüsse nach EN 55032 B als Maßstab.
Ohne Filter rund 80 dBµV bei 500 kHz, mit 10 µH und 4,7 µF am Stecker rund 25 dBµV. Gleichtakt und
Lage des Filters zum Stecker nicht.

**Testboard.** Basis TB-4L mit BUCK-Block bei x = 50 bis 70; J1 (`+12V_IN`, GND) bei (3, 30).
*Schlecht:* J1 → 45 mm Bahn → CIN am Regler, kein Filter.
*Gut:* π-Filter (1 µF, FB1 `600R@100MHz` oder 1 µH, 10 µF) innerhalb 10 mm von J1, Ein- und Ausgang
räumlich getrennt, dann Bahn zum Regler.
*Erwartung heute:* kein Befund. *Soll:* Abschätzung des Wechselstroms auf J1 (Teiler aus CIN, Filter
und 50-Ω-Netznachbildung), daraus Pegel leitungsgebunden und Gleichtaktabstrahlung des Kabels.

**Abhilfe.** Eingangsfilter am Stecker, Dämpfung der Filterresonanz, Kondensatoren mit kurzer
Anbindung.
**Nicht tun:** Filter direkt vor den Regler setzen und die lange Zuleitung ungefiltert lassen.

**Quellen.** [TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Würth, Filtering considerations for DC/DC converters](https://www.we-online.com/files/pdf1/20250701_we_part1_dcdc.pdf),
[C&E, Common EMC failures](https://www.celectronics.com/Resources/Common-EMC-Failures).

#### K-35 · Große Gate- und Bootstrap-Schleifen, fehlender Snubber
*EN: Large gate-drive and bootstrap loops, missing snubber footprint* · Belastbarkeit **Konsens** ·
Häufigkeit mittel · Engine heute **teilweise**

**Mechanismus.** Bei Controllern mit externen Schaltern bilden Treiber, Gate, Source und Rückweg eigene
schnelle Kreise. Hegarty (TI) beschreibt, wie die gemeinsame Source-Induktivität von Leistungs- und
Gatekreis die Schaltflanken verformt und Fehleinschalten begünstigt; große Gatekreise verstärken das
Nachschwingen am Schaltknoten. Ein RC-Snubber am Schaltknoten oder ein Gatewiderstand sind übliche
Notmaßnahmen, brauchen aber vorbereitete Footprints. TI beschreibt außerdem den Widerstand in Serie
zum Bootstrap-Kondensator als Mittel, die Einschaltflanke zu verlangsamen.

**Symptom im Labor.** Schmales Nachschwingband (100 bis 400 MHz) auf dem Wandlerbuckel.

**Erkennung aus Layoutdaten.** Treiberpins (`HO`, `LO`, `HS`, `BST`, `VBST`) und Gates der externen
Schalter finden, Gatekreis und Bootstrap-Kreis als Schleifen auswerten; prüfen, ob ein Snubber-
Footprint am SW-Netz existiert. *Daten:* Pinfunktionen, Footprints, Netze. *Falsch-positiv:*
integrierte Regler. *Falsch-negativ:* fehlende Pinfunktionen.

**Engine heute.** Teilweise: Schleifen lassen sich manuell definieren; kein Vorschlag für Gatekreise.

**Testboard.** Basis TB-4L; U4 (SOIC-8, Pinfunktionen `HO`, `LO`, `HS`, `VBST`, `VCC`, `GND`), Q1
und Q2 als `Package_TO_SOT_SMD:TO-252-2`.
*Schlecht:* Gate-Bahnen 20 mm, Rückweg über die Fläche weit entfernt, CBOOT 10 mm von U4, kein
Snubber-Footprint.
*Gut:* U4 ≤ 5 mm von Q1 und Q2, Gate- und Rückleitung als eng geführtes Paar, CBOOT an den Pins,
RC-Snubber-Footprint (0603) zwischen SW und GND direkt am Low-Side-Schalter.
*Erwartung heute:* mit manuell definierten Schleifen sichtbar. *Soll:* Vorschlag der Gatekreise und
Hinweis "kein Snubber-Footprint".

**Abhilfe.** Treiber nah an den Schaltern, Gatekreise klein, Footprints für Gatewiderstand und
Snubber vorsehen; Praxisberichte raten generell, Platz für nachträgliche Filter- und
Dämpfungsbauteile einzuplanen.
**Nicht tun:** Treiber "zentral" platzieren und Gates quer über die Platine führen.

**Quellen.** [TI SLYT682, Hegarty](https://www.ti.com/lit/pdf/slyt682),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Hackaday, One man's tale of EMC compliance testing](https://hackaday.com/2017/10/09/one-mans-tale-of-emc-compliance-testing/).

#### K-36 · Isolationsbarriere ohne HF-Rückweg
*EN: Isolation barrier without a high-frequency return path (no stitching capacitance or Y-capacitor)*
· Belastbarkeit **gesichert** · Häufigkeit mittel (bei isolierten Designs hoch) · Engine heute **nein**

**Mechanismus.** Isolierte Wandler (integrierte isolierte DC-DC-Wandler, Flyback, isolierte
Schnittstellen) übertragen Energie über eine Barriere. Der Strom, der über die parasitäre Kapazität
des Übertragers fließt, braucht einen Rückweg. Fehlt er, bilden die beiden Masseflächen einen Dipol,
der direkt abstrahlt. TI (ISOW7841) zeigt, dass schon 30 pF Stitching-Kapazität über überlappende
Innenlagen 10 bis 20 dB bringen; Skyworks nennt etwa 4 pF je cm² bei 1 mm Abstand. In einem Fall bei
EMC FastPass (isolierter DC-DC-Wandler, Fehlschlag 40 bis 80 MHz) halfen Sicherheitskondensatoren
zwischen den Massen plus Ferrite und brachten 6 bis 10 dB Reserve. Beim Flyback ist die Kapazität
zwischen den Wicklungen die Hauptquelle des Gleichtakts; Gegenmittel sind Schirmwicklungen und ein
Y-Kondensator mit kurzem Weg zwischen Primär- und Sekundärseite (Keogh, TI).

**Symptom im Labor.** Breitbandiger Buckel 30 bis 300 MHz, stark abhängig von der Lage der Kabel an
beiden Seiten.

**Erkennung aus Layoutdaten.** Zwei Massenetze, die nur über Bauteile mit Isolationsfunktion
(Übertrager, Isolator, Optokoppler, Y-Kondensator) verbunden sind; Kapazität zwischen den Domänen aus
Überlappung der Flächen (Stackup) und Kondensatoren berechnen; Abstand des Y-Kondensators zum
Übertrager. Befund unter etwa 20 bis 30 pF. *Daten:* Netze, Zonen je Lage, Stackup, Bauteilklassen.
*Falsch-positiv:* Medizin- oder Ableitstromanforderungen, die Kapazität begrenzen (Nutzerangabe).
*Falsch-negativ:* Isolator als generisches Bauteil.

**Engine heute.** Nein (kein Dipolmodell zweier angetriebener Flächen).

**Testboard.** Basis TB-4L; U5 als isolierter DC-DC-Platzhalter (`SOIC-16W`, Wert `ISOW7841`) bei
(40, 30) über der Barriere; Seite 1 x = 0 bis 36 (`GND1`, `VCC1`), Seite 2 x = 44 bis 80 (`GND2`,
`VCC2`), auf den Außenlagen 8 mm Barriere ohne Kupfer.
*Schlecht:* In1 `GND1` nur bis x = 36, In2 `GND2` erst ab x = 44, keine Überlappung, kein
Y-Kondensator.
*Gut A:* In1 `GND1` bis x = 50, In2 `GND2` ab x = 30, Überlappung 20 × 40 mm (800 mm², 1,065 mm Kern,
εr 4,6) ≈ 31 pF. *Gut B:* Y-Kondensator 100 pF (Y1) direkt am Isolator.
*Quelle:* Ersatzquelle am Isolator (z. B. 1 V Gleichtakt, 50 bis 300 MHz).
*Erwartung heute:* kein Befund. *Soll:* Befund "Barriere ohne HF-Rückweg (≈ 0 pF)" bei schlecht,
"≈ 31 pF" bei Gut A.

**Abhilfe.** Stitching-Kapazität durch überlappende Innenlagen oder Y-Kondensatoren nahe am
Übertrager, unter Beachtung von Isolationsabständen und Ableitstrom.
**Nicht tun:** die Barriere "für die Sicherheit" auf allen Lagen ohne jede Kapazität ausführen und auf
Ferrite hoffen.

**Quellen.** [TI SLLA368, ISOW7841](https://www.ti.com/lit/pdf/slla368),
[Skyworks AN1131](https://www.skyworksinc.com/-/media/Skyworks/SL/documents/public/application-notes/an1131-layout-guide.pdf),
[EMC FastPass, Isolated DC-DC case study](https://emcfastpass.com/case-study-iso-dc-dc/),
[TI, Flyback transformer design for EMI (Keogh)](https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/slup338.pdf).

### F Metallteile, Kupferflächen, Schirmung

#### K-37 · Kühlkörper oder großes Metallteil ohne Masseanbindung
*EN: Floating heatsink or large metal part driven by a noisy device* · Belastbarkeit **Konsens** ·
Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** Ein Kühlkörper auf einem schnellen IC oder Schalttransistor ist über die
Gehäusekapazität an eine Störspannung gekoppelt. Schwebend wirkt er mit Platine und Kabeln als
Antenne (spannungsgetriebener Mechanismus nach Hubing), ab einigen hundert MHz auch resonant. Wyatt
rät, Kühlkörper an Schaltbauteilen mehrfach zu erden; eine Studie der Universität York zeigt, dass
Erdung die Abstrahlung meist senkt, die Wirkung aber von Lage und Zahl der Erdungspunkte abhängt.
Das Clemson-Expertensystem schätzt die Eigenkapazität eines Kühlkörpers aus seinem Volumen und
daraus den Gleichtaktstrom.

**Symptom im Labor.** Schaltfrequenz-Harmonische oder Prozessortakt mit Resonanzüberhöhung; Abhilfe im
Labor durch Kupferband zwischen Kühlkörper und Masse.

**Erkennung aus Layoutdaten.** Footprints aus `Heatsink:*` (oder Bauteile mit `HS`-Referenz) über
schnellen Bauteilen; Netz der Befestigungspads (kein Netz = schwebend), Zahl der Massepunkte.
*Daten:* Footprints, Pads mit Netz, Position relativ zu Quellen. *Falsch-positiv:* Kühlkörper auf
langsamen Linearreglern. *Falsch-negativ:* Kühlkörper, die nicht im Layout stehen (Gehäuseteil,
Wärmeleitpad zum Gehäuse).

**Engine heute.** Nein.

**Testboard.** Basis TB-4L mit BUCK-Block, Schalttransistor Q1 als `TO-252-2` am SW-Netz.
*Schlecht:* `Heatsink:Heatsink_35x26mm_1xFixation3mm_Fischer-SK486-35` über Q1, Befestigungspad ohne
Netz.
*Gut:* Befestigungspad auf GND mit vier Vias, zweiter Massepunkt am anderen Ende.
*Erwartung heute:* kein Unterschied. *Soll:* Befund "Kühlkörper über SW-Bauteil ohne Masse",
Abschätzung nach dem spannungsgetriebenen Modell.

**Abhilfe.** Kühlkörper an mehreren Punkten mit der Masse verbinden, bei Schalttransistoren
isolierende Zwischenlage mit Schirm erwägen.
**Nicht tun:** "Ground all floating metal" pauschal anwenden; kleine Metallteile sind elektrisch
unbedeutend, und schlechte Erdung kann neue Antennen schaffen (LearnEMC).

**Quellen.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Wyatt, Top Ten EMC Problems](https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf),
[Dawson et al., Grounding and heatsink emissions (York)](https://eprints.whiterose.ac.uk/id/eprint/97224/1/Dawson2001_postprint.pdf),
[Clemson, Voltage-driven EMI algorithm](https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_driven_EMI.pdf),
[LearnEMC, Not-so-good EMC Design Guidelines](https://learnemc.com/not-so-good-emc-design-guidelines).

#### K-38 · Schwebende oder schlecht vernähte Kupferflächen
*EN: Floating copper islands or poorly stitched copper pours* · Belastbarkeit **umstritten** ·
Häufigkeit mittel · Engine heute **nein**

**Mechanismus.** Kupferinseln ohne Netz koppeln kapazitiv an benachbarte Leitungen und können bei
passender Größe resonieren; Masseflächen auf Außenlagen, die nur an ihren Enden mit der Massefläche
verbunden sind, bilden lange, offene Stichleitungen. Hubing nennt Kupferfüllungen als mögliche
Antennenteile oberhalb einiger hundert MHz. Über den Nutzen von Kupferfüllungen auf Signallagen gibt
es keinen Konsens: Ritchey hält sie in Mehrlagenplatinen für nutzlos bis schädlich, andere Autoren
sehen auf Zweilagenplatinen Vorteile, wenn die Füllung dicht vernäht ist.

**Symptom im Labor.** Einzelne Resonanzspitzen, Nahfeld-Hotspots an Kupferinseln.

**Erkennung aus Layoutdaten.** Zonen ohne Netz oder Kupferinseln (gefüllte Polygone ohne
Verbindung); Masseflächen auf Außenlagen: größter Abstand zwischen Stitching-Vias und längste
unvernähte "Finger" neben schnellen Leitungen, verglichen mit λ/20 bei der höchsten relevanten
Frequenz (in FR4 bei 1 GHz etwa 7 mm). *Daten:* Zonen, gefüllte Polygone, Vias. *Falsch-positiv:*
Kupfer zur Fertigungsbalance weit weg von Quellen. *Falsch-negativ:* keine.

**Engine heute.** Nein. Flächen werden erst ab 25 % Flächenanteil als Bezug erkannt; kleinere Inseln
spielen im Modell keine Rolle.

**Testboard.** Basis TB-2L mit CLK-Strecke und B.Cu als GND-Zone.
*Schlecht:* Kupferinsel ohne Netz 20 × 10 mm auf F.Cu neben der Taktleitung (1 mm Abstand), dazu
eine GND-Füllung auf F.Cu, die als 40 mm langer, 3 mm breiter Streifen neben der Taktleitung
verläuft und nur an einem Ende ein Via hat (Inseln entfernen in der Zone auf "nie").
*Gut:* Insel entfernt, Streifen alle 5 mm vernäht (oder ganz entfernt).
*Erwartung heute:* kein Unterschied. *Soll:* Hinweis "schwebende Kupferfläche neben CLK_25M" und
"unvernähter Massestreifen 40 mm".

**Abhilfe.** Inseln entfernen oder anbinden; wenn Masse gefüllt wird, dicht vernähen.
**Nicht tun:** Füllungen als Allheilmittel betrachten (M-11).

**Quellen.** [Hubing, PCB EMI Source Mechanisms](https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf),
[Ritchey zu Kupferfüllungen (Altium)](https://resources.altium.com/p/shaky-ground-arguments-against-copper-pours),
[All About Circuits, Grounded copper pour](https://www.allaboutcircuits.com/industry-articles/the-good-and-bad-of-grounded-copper-pour-the-emc-perspective/),
[Interference Technology, Myths and legends of EMI](https://interferencetechnology.com/myths-and-legends-of-emi-in-pcb-design/).

#### K-39 · Flächenränder und Hohlraumresonanzen
*EN: Plane edges and power/ground cavity resonances* · Belastbarkeit **umstritten** · Häufigkeit
gering · Engine heute **nein**

**Mechanismus.** Ein Paar aus Versorgungs- und Massefläche ist ein Hohlraumresonator. Bei 80 × 60 mm
und εr 4,6 liegt die erste Resonanz bei etwa 870 MHz, die nächsten bei etwa 1,17 und 1,46 GHz
(eigene Rechnung). Signal-Vias mit Referenzwechsel (K-08) und schaltende ICs regen ihn an, die
Ränder strahlen. Über die Gegenmittel herrscht kein Konsens: Die 20-H-Regel (Versorgungsfläche
zurücksetzen) senkte in Messungen von Shim und Hubing die Abstrahlung nicht, an einer Resonanz stieg
sie sogar um 3,6 dB; Infineon empfiehlt die Regel trotzdem. Wyatt empfiehlt eine Via-Reihe am Rand
im Abstand von etwa 5 mm, Hubing hält Randvias im Abstand von 2 cm für schädlich (sie bilden
Resonatoren) und empfiehlt, Verbindungen über die Fläche zu verteilen.

**Symptom im Labor.** Breite Überhöhungen ab einigen hundert MHz, die nicht zu einem einzelnen Takt
passen.

**Erkennung aus Layoutdaten.** Flächenpaare und ihre Abmessungen, Resonanzfrequenzen berechnen und
mit dem Spektrum der Quellen vergleichen; Zahl und Lage der Entkoppler und Vias zwischen den Flächen.
Nur als Hinweis. *Daten:* Zonen, Stackup, Vias, Kondensatoren. *Falsch-positiv:* hohe Dämpfung durch
viele Entkoppler. *Falsch-negativ:* unregelmäßige Flächenformen.

**Engine heute.** Nein (quasistatisch; braucht Vollwelle, Stufe 3 mit openEMS).

**Testboard.** Basis TB-4L, CLK-Strecke mit Referenzwechsel wie K-08 (schlecht), Quelle mit 0,3 ns
Anstiegszeit.
*Schlecht:* keine Entkoppler außer C1 und C2, keine Vias zwischen den Flächen.
*Gut A:* zwölf 100-nF-Entkoppler verteilt über die Fläche. *Gut B (Mythostest):* +3V3-Fläche mit
20-H-Rückzug (20 × 1,065 mm ≈ 21 mm); Erwartung in der Vollwelle: keine Verbesserung.
*Erwartung heute:* nur `ref-change`. *Soll:* Resonanzhinweis bei 0,87 GHz; Vollwellenvergleich in
Stufe 3.

**Abhilfe.** Schnelle Leitungen an Masse referenzieren, eng gekoppelte Flächenpaare, verteilte
Entkopplung.
**Nicht tun:** 20-H als EMV-Maßnahme verkaufen; Randvias nach Kochbuch.

**Quellen.** [Shim, Hubing, 20-H rule modeling and measurements](https://cecas.clemson.edu/cvel/pdf/EMCS01-939.pdf),
[LearnEMC, Not-so-good EMC Design Guidelines](https://learnemc.com/not-so-good-emc-design-guidelines),
[Wyatt, Stack-up (EDN)](https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1),
[Ritchey zu Flächenkapazität (Altium)](https://resources.altium.com/p/interplane-capacitance-and-pcb-stackups).

#### K-40 · Abschirmhaube mit zu wenigen Massekontakten
*EN: Board-level shield can with too few or widely spaced ground contacts* · Belastbarkeit
**Konsens**, wenige öffentliche Zahlen · Häufigkeit gering · Engine heute **nein**

**Mechanismus.** Eine Abschirmhaube wirkt nur, wenn ihr Rahmen rundum niederohmig mit der
Massefläche verbunden ist. Lücken zwischen Kontakten wirken als Schlitze; sie sollen deutlich kleiner
als eine halbe Wellenlänge sein. Üblich ist die Faustregel λ/20 bei der höchsten Frequenz (bei 1 GHz
in FR4 etwa 7 mm, bei 2,4 GHz etwa 3 mm). Wyatt nennt für Gehäuseschlitze, dass für 20 dB Dämpfung
der Schlitz höchstens etwa 13 mm lang sein darf.

**Symptom im Labor.** Abstrahlung trotz Schirmhaube, oft bei Funkmodulen oder schnellen Prozessoren.

**Erkennung aus Layoutdaten.** Footprints aus `RF_Shielding:*`; Pads mit GND-Netz und Vias zählen,
größte Lücke zwischen angebundenen Rahmenstücken mit λ/20 vergleichen. *Daten:* Footprint, Pads,
Netze, Vias. *Falsch-positiv:* Hauben über langsamen Schaltungen. *Falsch-negativ:* Hauben als
Bestückungsoption ohne Footprint.

**Engine heute.** Nein.

**Testboard.** Basis TB-4L, `RF_Shielding:Laird_Technologies_BMI-S-103_26.21x26.21mm` über U2 und X1
(Mitte bei (55, 30)).
*Schlecht:* nur zwei Eckpads des Rahmens auf GND mit je einem Via.
*Gut:* alle Rahmenpads auf GND, Vias alle ≤ 3 mm.
*Erwartung heute:* kein Unterschied. *Soll:* Befund "Schirmrahmen: größte Lücke 26 mm".

**Abhilfe.** Rahmen durchgehend mit Masse verbinden, dichte Via-Reihe.
**Nicht tun:** Rahmenpads aus Platzgründen nur punktuell anbinden.

**Quellen.** [Wyatt, Top five reasons](https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/),
[Atlas PCB, Via fencing and board-level shields](https://www.atlaspcb.com/blog/pcb-emi-shielding-via-fencing-board-level-shield/).

---

## 6. Mythen und Halbwahrheiten

Diese Aussagen tauchen in Foren, Blogs und manchen Applikationsschriften auf. Das Werkzeug darf sie
weder als Regel prüfen noch in Texten wiederholen. Wo die Lage umstritten ist, steht das dabei.

| Nr. | Behauptung | Was die Belege sagen | Einstufung |
|---|---|---|---|
| M-01 | 90°-Ecken strahlen und verursachen Reflexionen | Messungen und Simulationen zeigen bis 3 GHz keinen nennenswerten Unterschied zwischen 90° und zwei 45°-Knicken (die 45°-Variante war sogar knapp unter 2 dB lauter); TI fand für abgerundete Bahnen unter 1 dB Unterschied. Die Eckkapazität liegt unter 1 pF. | Mythos |
| M-02 | Analog- und Digitalmasse zu trennen ist immer gut | Hubing und Ott: fast nie; eine Fläche mit Partitionierung. Ausnahmen: Ströme unter etwa 100 kHz bei extrem empfindlichen Kreisen, sehr hochauflösende Wandler, und dann mit einer einzigen Brücke für alle Leitungen. | Mythos (mit engen Ausnahmen) |
| M-03 | Sternmasse oder Einpunkterdung für alles | Bei Hochfrequenz bestimmt die Induktivität den Weg, nicht die Topologie der Bahnen; Einpunkt-Regeln vermischen "Masse" und "Rückstrom" (LearnEMC). Für niederfrequente Messtechnik kann eine definierte Stromführung sinnvoll sein. | Mythos für HF |
| M-04 | 20-H-Regel senkt die Abstrahlung | Shim und Hubing: Nahfeld am Rand geringer, Abstrahlung nicht, an Resonanzen sogar etwas höher (bis 3,6 dB). Infineon empfiehlt sie weiterhin. | Mythos (Quellen widersprechen) |
| M-05 | Feste Kondensatorwerte: 100 nF plus 10 nF je Pin, "0,1 µF bis 15 MHz, 0,01 µF darüber" | Wirksamkeit hängt von Anschlussinduktivität und Flächenabstand ab, nicht von einer Wertestaffel; stark unterschiedliche Werte können Antiresonanzen erzeugen (K-25). | Mythos |
| M-06 | Entkoppler "so nah wie möglich" ist das Wichtigste | Wichtiger ist die Anschlussinduktivität (Vias direkt am Pad, keine Bahnen). Bei eng gekoppelten Flächen (unter etwa 0,25 bis 0,5 mm) ist der genaue Ort wenig kritisch; bei weit getrennten Flächen (Standard-Vierlager mit 1 mm Kern) oder ohne Flächen zählt die Nähe sehr wohl. | Halbwahrheit |
| M-07 | Mehr Vias sind immer besser; Randvias alle 2 cm | Hubing: Randreihen im 2-cm-Raster bilden Resonatoren, besser verteilen. Wyatt empfiehlt eine dichte Randreihe (etwa 5 mm), Academy of EMC ein Raster unter λ/10. Via-Ketten können Flächen zerschneiden (K-05). | umstritten |
| M-08 | Guard-Traces helfen immer | Unvernähte oder nur an den Enden angebundene Schutzleitungen können resonieren und die Kopplung verstärken; dicht vernähte können Übersprechen deutlich senken. Meist genügt Abstand. | Mythos ohne Vernähung |
| M-09 | Ferrite helfen immer, auch in der Masse | Ferrit plus Kondensator kann um 10 bis 15 dB überhöhen; Gleichstrom senkt die Impedanz stark; Ferrit zwischen Massen erzeugt Gleichtakt (K-26). | Mythos |
| M-10 | Gleichtaktdrossel am DC-Eingang hilft immer | Nur in symmetrischen Systemen sinnvoll; an unsymmetrischer Versorgung oft wirkungslos (Hubing). In der Praxis verbreitet, daher nur Hinweis (K-27). | umstritten |
| M-11 | Kupferfüllung überall senkt die Abstrahlung | Bei Zweilagen und dichter Vernähung oft nützlich; auf Mehrlagen mit durchgehenden Flächen kaum Nutzen; schwebende oder unvernähte Füllungen können schaden (K-38). | umstritten |
| M-12 | Differenzielle Signale strahlen nicht | Jede Unsymmetrie erzeugt Gleichtakt, und schon Mikroampere Gleichtakt auf einem Kabel genügen (K-14). | Mythos |
| M-13 | Die Leiterbahn selbst ist die Antenne | Eine Bahn über einer Fläche ist ein schlechter Strahler; die Antennen sind meist Kabel, Gehäuse, Kühlkörper. Die Bahn liefert die Quelle (Hubing). Wichtig für die Texte von emcvisual. | Missverständnis |
| M-14 | Terminieren ab λ/4 oder λ/10 | Entscheidend ist das Verhältnis von Laufzeit zu Anstiegszeit; zuerst die Flanke verlangsamen (Hubing, LearnEMC). Die λ/10-Grenze der Engine ist eine Modellgrenze (quasistatisch), keine Terminierungsregel. | Halbwahrheit |
| M-15 | Stitching-Kondensatoren über einen Spalt lösen das Problem | Montageinduktivität von mindestens einigen nH begrenzt die Wirkung auf den unteren Hunderter-MHz-Bereich; Hubing hält zusätzliche Kondensatoren über Spalten für unwirksam bei den relevanten Frequenzen. | weitgehend Mythos |
| M-16 | Lokale Masseinsel unter Quarz oder großem IC | ST und Infineon empfehlen eine eigene Masseinsel unter dem Oszillator, an einem Punkt mit der MCU-Masse verbunden; Hubing hält Masseinseln unter ICs meist für kontraproduktiv. Die Engine sollte solche Inseln nicht als Fehler melden, wohl aber Leitungen, die sie kreuzen. | umstritten |
| M-17 | Abgerundete Bahnen und Teardrops verbessern die EMV | TI: unter 1 dB. Teardrops sind eine Fertigungsfrage. | Mythos |
| M-18 | Langsame Logikfamilie garantiert niedrige Abstrahlung | Bauteile werden mit neuen Fertigungsständen schneller; auf die tatsächliche Anstiegszeit planen, nicht auf die Familie (Hubing). | Mythos |
| M-19 | Unter der Speicherdrossel muss die Masse weg | Manche Hersteller verlangen eine Aussparung; ADI empfiehlt eine durchgehende Fläche, weil Wirbelströme lokal und klein bleiben. | umstritten |
| M-20 | Zwei Masseflächen sind ab 25 MHz Pflicht | Veraltet; viele Platinen mit GHz-Signalen kommen mit einer gut genutzten Fläche aus (LearnEMC). | Mythos |
| M-21 | "Berechnetes Fernfeld unter dem Grenzwert, also besteht die Platine" | Gegentaktmodelle unterschätzen systematisch; Gleichtakt auf Kabeln dominiert (Abschnitt 2). Das Werkzeug darf nur "Gegentakt-Abschätzung unter Grenzwert" sagen. | Fehlschluss |

Quellen zu den Mythen: [LearnEMC, Worst EMC Design Guidelines](https://learnemc.com/some-of-the-worst-emc-design-guidelines),
[LearnEMC, Not-so-good EMC Design Guidelines](https://learnemc.com/not-so-good-emc-design-guidelines),
[Altium, Routing angle myths](https://resources.altium.com/p/pcb-routing-angle-myths-45-degree-angle-versus-90-degree-angle),
[Studie zur Abstrahlung von Mikrostreifen-Knicken](https://www.academia.edu/3145760/Experimental_and_numerical_study_of_the_radiation_from_microstrip_bends),
[Interference Technology, Myths and legends of EMI](https://interferencetechnology.com/myths-and-legends-of-emi-in-pcb-design/),
[TI AN-2155](https://www.ti.com/lit/an/snva638a/snva638a.pdf),
[Shim, Hubing, 20-H rule](https://cecas.clemson.edu/cvel/pdf/EMCS01-939.pdf),
[Bogatin, Simonovich, Guard traces (DesignCon 2013)](https://cdn.teledynelecroy.com/files/whitepapers/designcon2013_dramatic_noise_reduction_using_guard_traces_with_optimized_shorting_vias.pdf),
[ADI, Ferrite Beads Demystified](https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html),
[ADI, Placing the inductor on an SMPS PCB](https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-164.html),
[Hubing, Four commonly held myths](https://resources.altium.com/p/four-commonly-held-myths-emc-design),
[Ott, Grounding of Mixed Signal PCBs](https://hott.shielddigitaldesign.com/techtips/split-gnd-plane.html),
[ST AN2867](https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf),
[Infineon AP24026](https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1).

---

## 7. Was die Engine heute nicht erkennt und was dafür nötig wäre

### 7.1 Nicht erkennbar (heute "nein")

K-06, K-11, K-15, K-16, K-18, K-19, K-20, K-21, K-22, K-23, K-25, K-26, K-27, K-34, K-36, K-37,
K-38, K-39, K-40. Darunter fünf der Top 12: **K-15, K-16, K-18, K-19, K-20**.

### 7.2 Nur teilweise erkennbar

| ID | Was fehlt |
|---|---|
| K-02 | Netzwechsel an der Grenze zweier Massezonen; Gleichtakt zwischen Inseln mit Kabeln |
| K-03, K-04 | Lücken unter `MIN_GAP = 1,0 mm`; Flächen anderer Netze werden zur Bezugsfläche zusammengefasst |
| K-09, K-28 | Rückweg entlang der Masse-Bahnen ohne Fläche; automatische Versorgungsschleifen |
| K-10 | eigene Stackup-Diagnose |
| K-13 | zusammenfassende Regel Außenlage und Via-Zahl |
| K-14 | Laufzeitversatz und Gleichtaktumwandlung |
| K-17 | Rand- und Steckerabstand, Leitungen unter dem Quarz |
| K-24 | Anschlussinduktivität, fehlende lokale Entkopplung |
| K-30 | Topologieerkennung Buck oder Boost im Quellenvorschlag |
| K-31 | Kopplung des Schaltknotens auf Kabel (spannungsgetrieben) |
| K-33 | Wicklungsanfang, Nähe zu Kabeln |
| K-35 | Vorschlag der Gatekreise, Snubber-Prüfung |

### 7.3 Ergänzungen in der Reihenfolge ihres Nutzens

1. **Gleichtakt-Abschätzung nach dem Clemson-Expertensystem.** Für jede Quelle mit Rückstrom in einer
   Fläche die Spannung zwischen Flächenpunkten aus der Teilinduktivität L_p ≈ (4/π²)·µ0·l·h/(d1+d2),
   ω und dem Rückstrom (Effektivwerte aller Netze quadratisch summiert, Raster 1 cm); dann zwischen
   je zwei Kabelsteckern E ≈ 0,365·V in 3 m (resonantes Kabelpaar, Halbabsorberraum, also eine
   Obergrenze). Erschließt K-15, K-06, Teile von K-02, K-11, K-21. Bausteine (Flächenraster,
   Rückstrom, Quellen) sind schon vorhanden.
2. **Stecker und I/O-Netze erkennen.** Kabelstecker aus Referenz, Bibliothek und Schirmpads;
   I/O-Netze als Netze mit Pad am Stecker; Nutzer kann Stecker ohne Kabel abwählen. Grundlage für
   K-15, K-16, K-18, K-20, K-22.
3. **I/O-Kopplung** (Clemson): gegenseitige Kapazität und Induktivität je Segmentpaar, Störspannung
   auf dem I/O-Netz, E ≈ 40·Vn/Z_ant mit Z_ant aus der Massepinzahl. Erschließt K-16, K-17 (b),
   K-22.
4. **Filter erkennen und bewerten.** Längselement plus Querkondensator auf Versorgungs- und I/O-Netzen;
   Abstand zum Stecker, Masseanbindung, Überlappungskapazität zwischen Ein- und Ausgangsnetz über den
   Stackup. Erschließt K-18, K-19, K-34.
5. **Spannungsgetriebener Pfad** (Clemson): Kapazität von Schaltknoten, Kühlkörper, schwebendem Kupfer
   und Leitungen zu den Kabeln, Kabelstrom I ≈ 2πf·C·V. Erschließt K-31, K-37, K-38.
6. **Geometrieregeln ohne Feldrechnung:** Abstand schneller Segmente zur Flächenkante in Vielfachen von
   h (K-11), Quarz- und Oszillatorabstand zu Rand und Steckern (K-17), Leitungen unter Quarzen,
   Drosseln und Schaltknoten, Stackup-Prüfung (K-10).
7. **Versorgungsnetz-Bewertung:** Anschlussinduktivität der Entkoppler (Clemson-Formel), fehlende
   lokale Entkoppler, Wertverhältnisse aus Value-Feldern, Ferrite in Massenetzen. Erschließt K-24,
   K-25, K-26.
8. **Differenzpaar-Versatz:** Längendifferenz in ps, Gleichtaktanteil sin(π·f·Δt), am Stecker mit dem
   Kabelmodell aus Punkt 1 bewerten (K-14).
9. **Rückweg ohne Fläche:** kürzester induktiver Weg über das GND-Netz bei Zweilagenplatinen (K-09,
   K-28).
10. **Feinere Lückenerkennung:** `MIN_GAP` an h koppeln statt fest 1 mm, Netzwechsel innerhalb einer
    Lage als eigenes Ereignis (K-03, K-04).
11. **Topologie im Quellenvorschlag:** Buck, Boost und Buck-Boost aus der Netzliste unterscheiden
    (K-30), Gatekreise vorschlagen (K-35), Eingangsspannung aus Netznamen lesen statt 12 V schätzen.
12. **Isolationsdomänen:** zwei Massenetze ohne galvanische Verbindung, Kapazität zwischen ihnen,
    Dipolabschätzung (K-36).
13. **Hohlraumresonanzen, Schirmhauben, Kantenstrahlung:** nur mit Vollwelle sinnvoll (Stufe 3,
    openEMS); bis dahin Resonanzfrequenzen als Hinweis (K-39, K-40).

### 7.4 Regeln für die Texte des Werkzeugs

- Ergebnisse der Fernfeldabschätzung immer als "Gegentakt-Abschätzung" bezeichnen; nie "besteht".
- Bei Befunden mit Gleichtaktbezug (Stecker, Kabel, Inseln) die Kabelabhängigkeit nennen.
- Umstrittene Punkte (K-23, K-25, K-27, K-38, K-39, M-07, M-16, M-19) nur als Hinweis ausgeben und
  die Gegenposition nennen.
- Keine Aussagen zu 90°-Ecken, Teardrops oder 20-H als EMV-Maßnahme.

---

## 8. Quellen

Fachautoren und Hochschulen

- Hubing, PCB EMI Source Mechanisms: https://cecas.clemson.edu/cvel/pdf/EMCS03-001.pdf
- Hubing, AltiumLive 2022 Keynote: https://resources.altium.com/p/keynote-common-pcb-layout-mistakes-cause-emc-compliance-failures-altiumlive-2022
- Hubing, Four commonly held myths: https://resources.altium.com/p/four-commonly-held-myths-emc-design
- Shim, Hubing, 20-H rule modeling and measurements: https://cecas.clemson.edu/cvel/pdf/EMCS01-939.pdf
- Clemson PCB EMC Expert System, Übersicht der Algorithmen: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/pcb_summaries.html
  - Current-driven CM: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Current-driven_CM_algorithm_summary.pdf
  - Grid point voltage: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_Grid_Array_summary.pdf
  - I/O coupling: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/IO_coupling_algorithm_summary.pdf
  - Voltage-driven EMI: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Voltage_driven_EMI.pdf
  - Power bus decoupling: https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/summaries/Power_bus_decoupling_algorithm_summary.pdf
- LearnEMC (Hubing):
  - Worst EMC Design Guidelines: https://learnemc.com/some-of-the-worst-emc-design-guidelines
  - Not-so-good EMC Design Guidelines: https://learnemc.com/not-so-good-emc-design-guidelines
  - Good EMC Design Guidelines: https://learnemc.com/other-good-emc-design-guidelines
  - PCB layout: https://learnemc.com/pcb-layout
  - Grounding: https://learnemc.com/grounding
  - Power circuit layout: https://learnemc.com/power-circuit-layout
  - Common-mode filtering: https://learnemc.com/cm-filtering
  - Decoupling with closely spaced planes: https://learnemc.com/decoupling-for-boards-with-closely-spaces-power-planes
  - Decoupling without power planes: https://learnemc.com/decoupling-for-boards-without-power-planes
  - Question of the week 2022-11-28: https://learnemc.com/qotw-221128
  - Question of the week 2023-12-04: https://learnemc.com/qotw-231204
  - Imbalance difference modeling: https://learnemc.com/introduction-to-imbalance-difference-modeling
- Ott, PCB Stack-Up: https://hott.shielddigitaldesign.com/techtips/pcb-stack-up-1.html
- Ott, Grounding of Mixed Signal PCBs: https://hott.shielddigitaldesign.com/techtips/split-gnd-plane.html
- Wyatt, The top five reasons products fail EMI testing: https://interferencetechnology.com/the-top-five-reasons-products-fail-emi-testing/
- Wyatt, Top Ten EMC Problems (Folien): https://ewh.ieee.org/r6/lac/emc/announcements/EMC_10_Top_Ten_EMC_Problems_with_EMC_Troubleshooting_Ver_5.pdf
- Wyatt, Design PCBs for EMI, part 2: stack-up: https://www.edn.com/design-pcbs-for-emi-part-2-basic-stack-up/
- Bogatin, Rule of Thumb #7: https://www.edn.com/total-inductance-in-the-return-path-rule-of-thumb-7/
- Bogatin, Rules of Thumb (Übersicht): https://www.edn.com/bogatins-rules-of-thumb/
- Bogatin, Simonovich, Guard traces (DesignCon 2013): https://cdn.teledynelecroy.com/files/whitepapers/designcon2013_dramatic_noise_reduction_using_guard_traces_with_optimized_shorting_vias.pdf
- Hartley (Sierra Circuits): https://www.protoexpress.com/blog/how-grounding-controls-noise-and-emi-by-rick-hartley/ und https://www.protoexpress.com/blog/rick-hartley-pcb-design-recommendations-to-minimize-emi/
- Ritchey zu Kupferfüllungen (Altium): https://resources.altium.com/p/shaky-ground-arguments-against-copper-pours
- Ritchey zu Flächenkapazität (Altium): https://resources.altium.com/p/interplane-capacitance-and-pcb-stackups
- Archambeault, Routing high-speed traces close to the PCB edge: https://pcdandf.com/pcdesign/index.php/2008-archive-articles/3032-effects-of-routing-high-speed-traces-close-to-the-pcb-edge
- Simonovich, Split planes and microstrip: https://www.signalintegrityjournal.com/articles/692-split-planes-and-what-happens-when-microstrip-signals-cross-them
- Peterson, Ethernet connectors and ground planes: https://www.signalintegrityjournal.com/articles/1808-ethernet-connectors-and-routing-above-ground-planes
- Glen Dash, How Common Mode Currents Are Created: https://emcfastpass.com/wp-content/uploads/2017/04/Creation_of_CM_Currents.pdf
- Dawson et al., Grounding and heatsink emissions (York): https://eprints.whiterose.ac.uk/id/eprint/97224/1/Dawson2001_postprint.pdf
- Studie zu Gleichtaktstrom und Versatz in Differenzpaaren: https://www.researchgate.net/publication/224340709_The_impact_of_common_mode_currents_on_signal_integrity_and_EMI_in_high-speed_differential_data_links
- Studie zu Entkopplern bei Referenzwechsel: https://www.researchgate.net/publication/251803889_Effect_of_decoupling_capacitor_on_signal_integrity_in_applications_with_reference_plane_change
- Studie zur Abstrahlung von Mikrostreifen-Knicken: https://www.academia.edu/3145760/Experimental_and_numerical_study_of_the_radiation_from_microstrip_bends
- Tim Williams, EMC for Product Designers (Buch, Hintergrund): https://www.elmac.co.uk/EPD5.htm

Hersteller

- TI AN-2155, Layout Tips for EMI Reduction in DC/DC Converters: https://www.ti.com/lit/an/snva638a/snva638a.pdf
- TI SLYT682, Reduce buck-converter EMI by minimizing inductive parasitics: https://www.ti.com/lit/pdf/slyt682
- TI SLLA368, Low-emission designs with ISOW7841: https://www.ti.com/lit/pdf/slla368
- TI SNLA107A, Reducing radiated emissions in Ethernet 10/100 LAN: https://www.ti.com/lit/an/snla107a/snla107a.pdf
- TI, USB 2.0 Board Design and Layout Guidelines: https://e2echina.ti.com/cfs-file/__key/telligent-evolution-components-attachments/13-106-00-00-00-00-33-10/USB-2.0-Board-Design-and-Layout-Guidelines.pdf
- TI SCAA103, Spread spectrum clocking: https://www.ti.com/lit/an/scaa103/scaa103.pdf
- TI SLYT512, Grounding in mixed-signal systems demystified: https://www.ti.com/lit/an/slyt512/slyt512.pdf
- TI (Keogh), Flyback transformer design for efficiency and EMI: https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/196/slup338.pdf
- Richtek AN045, Reducing EMI in buck converters: https://www.richtek.com/Design%20Support/Technical%20Document/AN045
- ADI AN-139, Power Supply Layout and EMI: https://www.analog.com/en/resources/app-notes/an-139.html
- ADI, Single vs. dual hot loop: https://www.analog.com/en/resources/analog-dialogue/articles/4-switch-buck-boost-controller-layout-for-low-emissions-single-hot-loop-vs-dual-hot-loop.html
- ADI, Ferrite Beads Demystified: https://www.analog.com/en/resources/analog-dialogue/articles/ferrite-beads-demystified.html
- ADI, Placing the inductor on an SMPS PCB: https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-164.html
- Würth ANP047, EM radiation of power inductors: https://www.we-online.com/components/media/o109027v410%20ANP047c_The%20Behavior%20of%20Electro-Magnetic%20Radiation%20of%20Power%20Inductors%20in%20Power%20Management.pdf
- Würth, Filtering considerations for DC/DC converters: https://www.we-online.com/files/pdf1/20250701_we_part1_dcdc.pdf
- Infineon AP24026, EMC and System-ESD Design Guidelines for Board Layout: https://www.infineon.com/dgdl/Infineon-AP2402635_General_PCB-AN-v03_05-EN.pdf?fileId=5546d46261ff5777016229f8523036f1
- ST AN2867, Oscillator design guide: https://www.st.com/resource/en/application_note/an2867-oscillator-design-guide-for-stm8afals-stm32-mcus-and-mpus-stmicroelectronics.pdf
- Microchip AN2587, EMI/EMC/EFT/ESD design considerations: https://ww1.microchip.com/downloads/en/Appnotes/00002587A.pdf
- Microchip AN111, 10/100 PCB design and layout guidelines: https://ww1.microchip.com/downloads/en/AppNotes/AN%20111.10-100.General%20PCB%20Design%20and%20Layout%20Guidelines.pdf
- Skyworks AN1131, Reducing radiated and conducted emissions in isolated systems: https://www.skyworksinc.com/-/media/Skyworks/SL/documents/public/application-notes/an1131-layout-guide.pdf
- Tekbox, RF current to electric field strength extrapolation: https://www.tekbox.com/product/AN_-RF_current_to_electric_field_strength_extrapolation.pdf

Labore, Fachzeitschriften, Praxisberichte

- Pawson (Unit 3 Compliance), Case study poor PCB layout: https://interferencetechnology.com/case-study-poor-pc-board-layout-causes-radiated-emissions/
- Interference Technology, Myths and legends of EMI in PCB design: https://interferencetechnology.com/myths-and-legends-of-emi-in-pcb-design/
- EMC FastPass, Isolated DC-DC case study: https://emcfastpass.com/case-study-iso-dc-dc/
- Academy of EMC, EMC Design Guidelines: https://www.academyofemc.com/emc-design-guidelines
- Nemko, 10 most common causes of EMC failures: https://www.nemko.com/blog/why-products-fail-emc-testing-the-10-most-common-causes
- C&E, Common EMC test failures: https://www.celectronics.com/Resources/Common-EMC-Failures
- Altium, Routing angle myths: https://resources.altium.com/p/pcb-routing-angle-myths-45-degree-angle-versus-90-degree-angle
- All About Circuits, Gridded ground: https://www.allaboutcircuits.com/technical-articles/multipoint-grounding-gridded-ground-for-double-sided-pcbs/
- All About Circuits, Good and bad of grounded copper pour: https://www.allaboutcircuits.com/industry-articles/the-good-and-bad-of-grounded-copper-pour-the-emc-perspective/
- Atlas PCB, Via fencing and board-level shields: https://www.atlaspcb.com/blog/pcb-emi-shielding-via-fencing-board-level-shield/
- EEVblog, Fixing a product that is failing CE radiated emissions: https://www.eevblog.com/forum/projects/fixing-a-product-that-is-failing-ce-radiated-emissions/
- A One-Page Guide to Fixing Radiated Emissions: https://cushychicken.github.io/radiated-emissions-debug/
- Hackaday, One man's tale of EMC compliance testing: https://hackaday.com/2017/10/09/one-mans-tale-of-emc-compliance-testing/

Hinweis zur Verlässlichkeit: Zahlenangaben stammen aus den genannten Quellen; Werte, die als "eigene
Rechnung" markiert sind, wurden mit den dort angegebenen Formeln für die hier beschriebenen
Testboards berechnet und sind Größenordnungen, keine Vorhersagen eines Prüfergebnisses.
