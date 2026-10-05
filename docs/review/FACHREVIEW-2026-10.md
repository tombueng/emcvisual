# Fachreview: physikalische und normative Aussagen

Stand: 2026-10-05. Geprüft wurde der Stand von Commit `65e6776` zusammen mit der Arbeitskopie
vom selben Tag. Während des Reviews wurden `src/physics/currents.ts`, `src/physics/units.ts` und
`src/fullwave/job.ts` parallel geändert; Zeilennummern beziehen sich auf den gelesenen Stand
und können sich um einige Zeilen verschoben haben.

## Stand der Umsetzung (2026-10-05)

| Nr. | Thema | Stand |
|---|---|---|
| 1 | „behoben X dB leiser“ | umgesetzt: angezeigt wird die Wirkung der Behebung nur dieser Stelle, mit Vorzeichen; der Anteil ordnet nur noch |
| 2 | Fernfeld 6 dB zu hoch | umgesetzt: Rückstrom für das Fernfeld in der Fläche (`imageAt: 'plane'`), Test `tests/farMoment.test.ts` |
| 3 | Grenzwert an Bandgrenzen | umgesetzt: strengerer Wert an jeder Stufe |
| 4 | Schweregrad zu sicher | umgesetzt: „hohe Priorität / ansehen / nachrangig“, Erklärung ohne Prüfaussage |
| 5 | Gleichtakt-Vorbehalt zu klein | umgesetzt: neue Texte, Steckererkennung über Bibliothek und Referenz, dazu eine Gleichtakt-Abschätzung mit Kabeln (Clemson-Methode) |
| 6 | Flächentrennung, schmale Schlitze | umgesetzt: Netz je Rasterzelle, Lücken ab 0,2 mm, Löcher nach Ausdehnung, Meldung nach echtem Umweg; Testplatinen `split-plane`, `narrow-slot` |
| 7, 8, 11–16, 18, 20–25, 28, 29 | Texte | umgesetzt wie vorgeschlagen |
| 9 | Schaltregler-Vorbehalte | umgesetzt (Klingeln, Drossel), dazu Befund „heiße Schleife“ nach Fläche |
| 10 | Ausdünnung mit √k | umgesetzt: Grenzwertvergleich mit der Amplitude der einzelnen Linie |
| 17 | Laufzeitversatz bei Paaren | als Vorbehalt umgesetzt, nicht gerechnet |
| 19 | Schraffur in PHYSIK.md | Text korrigiert, Schraffur nicht umgesetzt |
| 26, 27 | Formeltext, Summe | umgesetzt |

## Umfang und Vorgehen

Gelesen wurden: `src/report/explain.ts`, `src/report/texts.ts`, `src/report/report.ts`,
`src/i18n/de.ts`, `src/i18n/en.ts` (alle fachlichen Texte), `src/physics/*.ts` (farfield,
attribution, severity, standards, diagnostics, returnPaths, biotsavart, images, currents,
spectrum, lines, sources, suggest, charges, efield, units), `src/model/planes.ts`,
`src/scanner/probe.ts`, `tools/openems/run_job.py` (Fernfeld), `docs/stufe-1/PHYSIK.md`,
`docs/zukunft/STUFE-2-*.md`, `docs/zukunft/STUFE-3-*.md`, `docs/ENTSCHEIDUNGEN.md`,
`docs/CI-FELDCHECK.md`, `README.md`.

Formeln wurden nachgerechnet, einige Aussagen mit kleinen Rechnungen nach der Logik des Codes
nachgeprüft (Dipolmoment mit Spiegel, Grenzwert an Bandkanten, Ausdünnung des Spektrums).
Grenzwerte wurden gegen frei zugängliche Fassungen der Normen bzw. Gesetzestexte geprüft
(Quellen am Ende und je Befund).

Urteile:

- **falsch**: die Aussage oder Rechnung ist sachlich falsch.
- **irreführend**: formal vertretbar, führt aber zu einem falschen Schluss.
- **zu sicher formuliert**: richtige Richtung, aber ohne die nötige Unsicherheit.
- **fehlender Vorbehalt**: der Text sagt nicht, warum die Zahl hier falsch sein kann.
- **ok aber unscharf**: im Kern richtig, sollte präziser werden.

## Kurzfazit

Die Grundlagen sind sauber: Trapezspektrum, Leitungsformeln, die Konstante der
Schleifenabstrahlung, die dB-Umrechnungen und fast alle Grenzwerte stimmen. Die schwersten
Probleme liegen dort, wo aus dem Modell eine Aussage über die Prüfung oder über die Wirkung einer
Änderung wird:

1. „behoben X dB leiser“ ist nicht die Wirkung der Behebung, sondern ein Anteil gegen eine ideale
   Quelle. Die eigenen Zahlen der Demo widersprechen der Aussage.
2. Das Fernfeld rechnet für Leiterbahnen über einer Fläche systematisch etwa 6 dB zu hoch
   (Spiegelstrom plus Bodenfaktor).
3. An Bandgrenzen nimmt der Code den lockereren Grenzwert, die Normen schreiben den strengeren
   vor. Das macht bis zu 8 dB aus, genau bei sehr häufigen Oberwellen (230 MHz, 960 MHz, 1 GHz).
4. Schweregrad und Texte („entscheidet über die Prüfung“, „unauffällig“) versprechen mehr, als ein
   reines Gegentaktmodell ohne Kabel leisten kann.
5. Die klassische Flächentrennung (zwei Netze auf einer Flächenlage) und schmale Schlitze unter
   1 mm sieht die Diagnose nicht; danach erscheint „Keine Auffälligkeiten“.

---

## Befunde (nach Schwere geordnet)

### 1. „3 m: behoben X dB leiser“ ist nicht die Wirkung der Behebung

- **Ort:** `src/physics/attribution.ts:64–67` (Rechnung), `src/report/explain.ts:109–115`
  (Zeile „Mit Behebung …“), `src/report/texts.ts:86–91`, `src/i18n/de.ts:202, 467, 476`,
  `src/i18n/en.ts:202, 467, 476`, `README.md:41–42`, `docs/ENTSCHEIDUNGEN.md:84–87`.
- **Aussage:** de.ts:202 „3 m: behoben ${v} leiser“; de.ts:467 „Behoben wird die Quelle in 3 m
  um ${g} leiser (jede Spektrallinie gleich viel).“; de.ts:476 „Mit Behebung: |m| ≈ …, alle
  Linien ${g} tiefer; die stärkste Linie läge bei … dBµV/m, also …“. README: „behoben 11 dB
  leiser“.
- **Urteil:** falsch.
- **Warum:** `gainDb` ist `20·log10(|m_ideal + Δm_k| / |m_ideal|)`, also die Wirkung dieses einen
  Problems, **wenn alle anderen schon behoben wären**. Was der Text behauptet, wäre
  `20·log10(|m_jetzt| / |m_jetzt − Δm_k|)` (nur diese Stelle beheben). Die beiden Größen
  unterscheiden sich, sobald eine Quelle mehr als einen Hinweis hat. Die eigene Dokumentation
  belegt das: In `docs/zukunft/STUFE-2-FLAECHENSTROEME.md:56–60, 68–69` haben die drei Hinweise
  des schlechten Takts 11,1 dB, 3,3 dB und 0,9 dB, alle zusammen behoben aber nur 7,9 dB; das
  Beheben nur des nahen Sprungs macht die Quelle sogar 4 dB **lauter**. Die Oberfläche sagt für
  den ersten Hinweis trotzdem „behoben 11,1 dB leiser“, und `explain.ts:111` rechnet daraus mit
  `momentNow / 10^(g/20)` einen Abstand zum Grenzwert „mit Behebung“, der größer ist als der
  Abstand, wenn alles behoben wäre. Dazu kommt: Alle diese dB gelten nur im Gegentaktmodell
  (siehe Befunde 4 und 5).
- **Abhilfe im Code:** `moment(withFixed(elements, d))` wird in `attribution.ts:65` schon
  gerechnet; die echte Einzelwirkung `20·log10(|m_jetzt| / |m_fixed_k|)` (kann negativ sein) und
  die Wirkung „alle Rückwege behoben“ (`returnPathsDb`) lassen sich direkt anzeigen. Die bisherige
  Größe taugt weiter als Sortierschlüssel.
- **Vorschlag (DE):**
  - `diag.gainFinding`: „3 m, Modell (nur Gegentakt): Anteil dieses Hinweises ${v}“
  - `explain.fig.gain`: „Dieser Hinweis allein, bei sonst idealen Rückwegen, macht die Quelle im
    Gegentaktmodell in 3 m um ${g} lauter. Das ordnet die Hinweise; es sagt nicht voraus, wie viel
    leiser die Quelle wird, wenn nur diese Stelle behoben wird. Mehrere Hinweise addieren sich
    nicht, die Wirkung einer einzelnen Behebung kann kleiner, größer oder sogar negativ sein.“
  - `explain.calc.fixed`: „Nur diese Stelle behoben: |m| = … mm², stärkste Linie … dBµV/m (…).
    Alle Rückwege dieser Quelle behoben: … dB tiefer.“
  - README: „… nach ihrem Anteil am berechneten Fernfeld (Gegentakt, 3 m) geordnet …“
  - ENTSCHEIDUNGEN Nr. 31: „… So steht oben, was im Gegentaktmodell am meisten ausmacht.“
- **Vorschlag (EN):**
  - `diag.gainFinding`: "3 m, model (differential mode only): share of this finding ${v}"
  - `explain.fig.gain`: "This finding alone, with all other returns ideal, makes the source
    ${g} louder at 3 m in the differential-mode model. This orders the findings; it does not
    predict how much quieter the source gets when only this spot is fixed. Findings do not add
    up, and fixing one alone can help less, more, or even make it worse."
  - `explain.calc.fixed`: "Only this spot fixed: |m| = … mm², strongest line at … dBµV/m (…).
    All return paths of this source fixed: … dB lower."
- **Quellen:** eigene Dokumentation (`STUFE-2-FLAECHENSTROEME.md:56–70`).

### 2. Fernfeld: Spiegelstrom und Bodenfaktor zusammen, etwa 6 dB zu hoch

- **Ort:** `src/physics/farfield.ts:1–5, 12–33, 41–47`, `src/physics/images.ts:169–176`,
  `docs/stufe-1/PHYSIK.md:256–272`, `src/i18n/de.ts:473–474`, `src/i18n/en.ts:473–474`.
- **Aussage:** PHYSIK.md:270–272 „Eigenschaften, die das Modell richtig wiedergibt: … eine
  Leiterbahn mit Rückstrom in der Fläche bildet eine senkrechte Schleife, deren Moment sich mit
  dem Spiegel verdoppelt.“; de.ts:473 „… die wirksame Schleifenfläche, mit Spiegelströmen …“;
  de.ts:474 „E = 2 · η0 · k² · |m| · I / (4π · r) … Faktor 2 für die Reflexion am Boden des
  Messplatzes (Ott, Gl. 12-2)“.
- **Urteil:** falsch (systematisch etwa +6 dB für alle Leitungen über einer Fläche, also fast
  alle Takt- und Datenquellen).
- **Warum:** Ott, Gl. 12-2 (E = 263·10⁻¹⁶ · f² · A · I / r) setzt für A die wirkliche
  Schleifenfläche ein, bei einer Leiterbahn über der Fläche also Länge × Höhe h, und enthält den
  Faktor 2 für den Boden bereits. Die App rechnet |m| aus Leiterbahn **und Spiegel bei 2·y_F − y**,
  also Fläche 2·h·L, und multipliziert danach noch einmal mit 2. Nachgerechnet mit der Formel aus
  `dipoleMoment()`: Leiterbahn 50 mm, h = 0,2 mm ergibt |m| = 20 mm² statt 10 mm²; bei 10 mA und
  100 MHz in 3 m zeigt die App 24,9 dBµV/m, Otts Formel 18,9 dBµV/m.
  Spiegelung ersetzt eine Fläche nur dann für das Fernfeld, wenn sie viel größer als die
  Wellenlänge ist (LearnEMC: „If the planes are much larger than a wavelength …“). Eine
  Platinenfläche ist bei 30–300 MHz λ/10 bis λ/100 groß; für das Fernfeld zählt dann der
  wirkliche Rückstrom in der Fläche, m = h·L·I. Die Vollwelle (`tools/openems/run_job.py:329–330`)
  rechnet die endliche Platine im Freiraum und multipliziert nur mit 2 für den Boden; schnelles
  Modell und Vollwelle müssten sich deshalb im Fernfeld einer Mikrostreifenleitung um etwa 6 dB
  unterscheiden (lohnt einen Test). Bei Streifenleitern (Flächen auf beiden Seiten) liefert die
  Spiegelung erster Ordnung ein Moment von etwa 1,5 × (h·L) ohne klare physikalische Bedeutung.
  Nebenbei widerspricht die Rechnung dem eigenen Erklärtext de.ts:531 („aus der Ferne heben sich
  beide fast auf, übrig bleibt eine sehr flache Schleife“), der das physikalisch richtige Bild
  beschreibt.
- **Abhilfe im Code:** Für das Dipolmoment (nur Fernfeld) den Rückstrom auf die Flächenhöhe y_F
  legen statt auf 2·y_F − y, für das Nahfeld die Spiegel behalten. Gegen die openEMS-Fernfelder
  einer Mikrostreifenleitung und einer flachen Schleife prüfen.
- **Vorschlag (DE):**
  - `explain.calc.moment`: „Magnetisches Dipolmoment je Ampere Referenzstrom aus Hin- und
    Rückstrom (Rückstrom in der Bezugsfläche unter der Leitung, mit Umwegen): |m| = ${mm2} mm².“
  - `explain.calc.formula`: „Jede Spektrallinie I strahlt in 3 m mit E = 2 · η0 · k² · |m| · I /
    (4π · r), k = 2π f / c, r = 3 m; der Faktor 2 ist die Bodenreflexion des Messplatzes im
    ungünstigsten Fall (Ott, Gl. 12-2). Gilt für elektrisch kleine Strukturen und nur für den
    Gegentaktanteil.“
  - PHYSIK.md:270–272: „Über einer unendlich großen Fläche verdoppelt der Spiegel das Moment einer
    senkrechten Schleife im Halbraum darüber. Eine Platinenfläche ist unterhalb einiger hundert MHz
    viel kleiner als λ; für das Fernfeld zählt dann der wirkliche Rückstrom in der Fläche, die
    Schleifenfläche ist h·L, nicht 2·h·L.“
- **Vorschlag (EN):**
  - `explain.calc.moment`: "Magnetic dipole moment per ampere of reference current from forward
    and return current (return in the reference plane under the line, with detours):
    |m| = ${mm2} mm²."
  - `explain.calc.formula`: "Every spectral line I radiates at 3 m with E = 2 · η0 · k² · |m| · I
    / (4π · r), k = 2π f / c, r = 3 m; the factor 2 is the worst-case reflection off the test-site
    floor (Ott, eq. 12-2). Valid for electrically small structures and for the differential mode
    only."
- **Quellen:** https://learnemc.com/electromagnetic-radiation ;
  https://micro.rohm.com/en/techweb/knowledge/emc/s-emc/01-s-emc/6899 (Formel mit A =
  Schleifenfläche); H. W. Ott, *Electromagnetic Compatibility Engineering*, Wiley 2009, Kap. 12.

### 3. Grenzwert an Bandgrenzen: der Code nimmt den lockereren Wert

- **Ort:** `src/physics/farfield.ts:69–72` (`limitAt`), dieselbe Logik in
  `src/ui/spectrumSvg.ts:40`; Tabellen in `src/physics/standards.ts:28–106`.
- **Aussage (Code):** `limits.find((x) => f >= x.f0 && f < x.f1)`.
- **Urteil:** falsch.
- **Warum:** CISPR 32 (Anhang A): „Where there is a step in the relevant limit, the lower value
  shall be applied at the transition frequency.“ CISPR 11 (Abschnitt 6.1): „The lower limit shall
  apply at all transition frequencies.“ FCC §15.109: „the tighter limit applies at the band
  edges.“ Oberwellen gängiger Takte fallen genau auf diese Grenzen, und die stärkste Linie
  entscheidet über Abstand, Schweregrad und Reihenfolge. Nachgerechnet mit der Code-Logik:

  | Oberwelle | Norm | Code | richtig | Fehler |
  |---|---|---|---|---|
  | 10 MHz × 23 = 230 MHz | CISPR 32 B, 3 m | 47 | 40 dBµV/m | 7 dB zu locker |
  | 24/48/12 MHz → 960 MHz | FCC B, 3 m | 54 | 46 dBµV/m | 8 dB zu locker |
  | 24 MHz × 9 = 216 MHz | FCC B, 3 m | 46 | 43,5 dBµV/m | 2,5 dB zu locker |
  | 8 MHz × 11 = 88 MHz | FCC B, 3 m | 43,5 | 40 dBµV/m | 3,5 dB zu locker |
  | 25/50/100 MHz → 1 GHz | CISPR 32 B, 3 m | 50 (Mittelwert über 1 GHz) | 47 dBµV/m (QP) | 3 dB zu locker |

- **Abhilfe im Code:** Grenzwert = Minimum über alle Abschnitte mit `f0 ≤ f ≤ f1`; bei genau
  1 GHz die Quasi-Peak-Tabelle.
- **Vorschlag (DE)** für `standards.common`, Zusatz: „An Bandgrenzen gilt der strengere Wert.“
- **Vorschlag (EN):** "At band edges the tighter limit applies."
- **Quellen:** https://nobelcert.com/DataFiles/FreeUpload/BS%20EN%2055032-2015%20plus%20Cor2016%20plus%20A11-2020.pdf
  (Anhang A); https://cdn.standards.iteh.ai/samples/15070/2cded154aefd4da09343d754b7778721/CISPR-11-2009.pdf
  (Abschnitt 6.1); https://www.law.cornell.edu/cfr/text/47/15.109

### 4. Schweregrad: „rot entscheidet über die Prüfung“, „grün … unauffällig“

- **Ort:** `src/i18n/de.ts:613–616`, `src/i18n/en.ts:613–616`, `src/physics/severity.ts:1–7,
  19–24`, Sprechblasen (grün nur als Punkt, Commit 65e6776), `docs/ENTSCHEIDUNGEN.md:84–87`,
  `README.md:142–145`.
- **Aussage:** de.ts:616 „Schweregrad: rot entscheidet über die Prüfung … grün strahlt, fällt
  aber nicht auf.“; de.ts:615 „unauffällig“; severity.ts:3 „1 (red: this decides whether the
  board passes)“; README:142 „Sie zeigt zuverlässig, wo Stromschleifen Felder erzeugen und wie
  sich Änderungen auswirken“.
- **Urteil:** zu sicher formuliert / irreführend.
- **Warum:** Die Zahl stammt allein aus dem Abstand des **Gegentaktmodells** zum Grenzwert
  (0 ab 20 dB unter dem Grenzwert). Vorhersagen nur aus Gegentaktströmen „can bear little
  resemblance to actual measured emissions“ (Paul 1989); Prüfungen scheitern „almost always“ an
  Gleichtaktströmen (LearnEMC). Dazu kommen Annahmen bei Amplitude, Flanke und Last
  (±6 bis 20 dB), Befund 2 (+6 dB) und Befund 3 (bis −8 dB). Ein grünes „unauffällig“ bei 15 dB
  Abstand im Gegentaktmodell sagt über das Prüfergebnis nichts. Weil grüne Blasen seit
  Commit 65e6776 nur noch als Punkte erscheinen, verdeckt das Etikett aktiv. Auch der README-Satz
  gilt nur für Gegentakt-Schleifenfelder: Wie eine Änderung auf Gleichtaktströme wirkt (z. B.
  beim Kreuzen einer Flächentrennung), zeigt die Rechnung nicht.
- **Vorschlag (DE):**
  - Stufen: „hohe Priorität“, „mittlere Priorität“, „niedrige Priorität“.
  - `severity.scale`: „Priorität im Gegentaktmodell: rot = die Quelle liegt im Modell nahe am
    oder über dem Grenzwert (3 m) und dieser Hinweis trägt viel dazu bei; gelb = ansehen; grün =
    im Modell weit unter dem Grenzwert. Das ordnet die Arbeit und sagt nichts über das
    Prüfergebnis: Gleichtaktströme auf Kabeln und auf der Platine selbst sind nicht gerechnet und
    übertreffen die Gegentaktabstrahlung oft um 20 dB und mehr.“
  - README:142: „Sie zeigt, wo Stromschleifen Magnetfelder erzeugen und wie sich Änderungen an
    Schleifenfläche, Rückstrompfad und Flanken auf diese Felder auswirken. Gleichtaktströme, über
    die die meisten Prüfungen scheitern, rechnet sie nicht.“
- **Vorschlag (EN):**
  - Levels: "high priority", "medium priority", "low priority".
  - `severity.scale`: "Priority in the differential-mode model: red = the source is near or over
    the limit at 3 m in the model and this finding contributes a lot; yellow = worth a look;
    green = far below the limit in the model. This orders the work and says nothing about the
    test result: common-mode currents on cables and on the board itself are not computed and
    often exceed the differential-mode emission by 20 dB or more."
- **Quellen:** https://ieeexplore.ieee.org/document/18789/ (C. R. Paul, IEEE TEMC 31, 1989);
  https://learnemc.com/electromagnetic-radiation

### 5. Gleichtakt-Vorbehalt zu klein, „obere Abschätzung“ nicht haltbar

- **Ort:** `src/i18n/de.ts:484–487` (`doubt.cables`), `de.ts:492` (`doubt.detector`), `de.ts:199–200`
  (`farHint`, `margin`), `de.ts:373` (`callouts.far`); ebenso en.ts; `src/report/explain.ts:131–132`
  (Steckverbinder zählen).
- **Aussage:** „Gleichtaktströme auf Kabeln strahlen in der Praxis oft 10–20 dB stärker als die
  Platine selbst“; ohne Steckverbinder: „Sobald Kabel angeschlossen sind, dominieren oft deren
  Gleichtaktströme.“; detector: „Für die Platine allein ist das eher eine obere Abschätzung.“
- **Urteil:** zu sicher formuliert.
- **Warum:**
  1. Größe: Nach Paul (1989) erzeugen Gleichtaktströme im µA-Bereich so viel Feld wie
     Gegentaktströme im mA-Bereich; LearnEMC rechnet für ein Leitungspaar 64 dB Unterschied vor.
     Nach Otts Gleichtaktformel (E = 12,6·10⁻⁷ · f · L · I / r) erreichen etwa 2 µA auf 1 m Kabel
     bei 100 MHz schon 40 dBµV/m in 3 m. „10–20 dB“ unterschätzt den typischen Abstand.
  2. Auch ohne Kabel strahlt eine Platine im Gleichtakt: Der Rückstrom erzeugt eine Spannung über
     der Teilinduktivität der Fläche (current-driven), die Signalspannung koppelt kapazitiv an
     Fläche, Kühlkörper und Gehäuse (voltage-driven) (Hockanson/Hubing 1996, Shim/Hubing 2005).
     Im Prüfaufbau hat jedes Gerät mindestens eine Versorgungsleitung. „Obere Abschätzung“ gilt
     daher nur für den Gegentaktanteil.
  3. `explain.ts:131` zählt Steckverbinder mit `/^(J|P|CN|X)\d/`; Referenzen wie „USB1“, „CON1“
     oder „K1“ fallen durch, dann erscheint fälschlich der Text für Platinen ohne Kabel.
  4. Abstände („12 dB Abstand“) stehen in Sprechblasen und Bericht ohne Zusatz.
- **Vorschlag (DE):**
  - `doubt.cables` (mit Steckverbindern): „Angeschlossene Kabel fehlen in der Rechnung (die
    Platine hat ${n} Steckverbinder). Gleichtaktströme auf Kabeln übertreffen die
    Gegentaktabstrahlung der Platine oft um 20 dB und mehr; schon wenige µA Gleichtaktstrom auf
    1 m Kabel erreichen bei 100 MHz den Grenzwert. Das Ergebnis ist dann viel zu günstig.“
  - `doubt.cables` (ohne): „Kabel fehlen in der Rechnung. Auch ohne Kabel strahlt eine Platine
    über Gleichtaktwege, die das Modell nicht kennt: Spannungsabfall über der Fläche, Kopplung an
    Kühlkörper und Gehäuse, die Versorgungsleitung im Prüfaufbau.“
  - `doubt.detector`: „Die Prüfung misst mit Quasi-Peak-Detektor (für eine stabile Taktlinie gleich
    dem Spitzenwert), dreht den Prüfling und fährt die Antenne in der Höhe; die Rechnung nimmt die
    stärkste Richtung mit voller Bodenreflexion. Für den Gegentaktanteil der Platine ist das eher
    eine obere Abschätzung; über die Gesamtabstrahlung des Geräts sagt es nichts.“
  - `diag.margin`: „${db} dB über Grenzwert (Modell)“ / „${-db} dB Abstand (Modell, nur Gegentakt)“.
- **Vorschlag (EN):**
  - `doubt.cables` (with connectors): "Attached cables are not in the calculation (the board has
    ${n} connectors). Common-mode currents on cables often exceed the board's differential-mode
    emission by 20 dB or more; a few µA of common-mode current on 1 m of cable reach the limit at
    100 MHz. The result is then far too optimistic."
  - `doubt.cables` (none): "Cables are not in the calculation. Even without cables a board
    radiates through common-mode paths the model does not know: voltage drop across the plane,
    coupling to heat sinks and enclosure, the supply lead in the test set-up."
  - `doubt.detector`: "… For the board's differential-mode part that is rather an upper estimate;
    it says nothing about the emission of the whole device."
  - `diag.margin`: "${db} dB over the limit (model)" / "${-db} dB margin (model, differential mode
    only)".
- **Quellen:** https://ieeexplore.ieee.org/document/18789/ ; https://learnemc.com/electromagnetic-radiation ;
  https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/pcb_es_pubs.html (Hockanson, Drewniak,
  Hubing et al., IEEE TEMC 38(4), 1996);
  https://www.researchgate.net/publication/3056826_Model_for_Estimating_Radiated_Emissions_From_a_Printed_Circuit_Board_With_Attached_Cables_Due_to_Voltage-Driven_Sources ;
  Ott 2009, Kap. 12 (Gleichtaktabstrahlung).

### 6. Diagnose übersieht Flächentrennungen und schmale Schlitze, meldet dann „Keine Auffälligkeiten“

- **Ort:** `src/model/planes.ts:4–7, 43, 70, 77`, `src/physics/diagnostics.ts:38, 202`,
  `src/physics/returnPaths.ts:50, 163`, `src/physics/images.ts:28–32`, `src/i18n/de.ts:178, 508,
  518`, `src/i18n/en.ts:180, 508, 518`, `docs/stufe-1/PHYSIK.md:194–197`.
- **Aussage:** planes.ts:5–7 „Copper of other nets with large pours on the same layer (split
  planes: GND and 3V3 side by side) joins the coverage raster, because for AC return currents any
  solid copper is a reference.“; de.ts:178 „Keine Auffälligkeiten bei den aktiven Quellen.“
- **Urteil:** fehlender Vorbehalt (falsch negative Ergebnisse).
- **Warum:**
  1. Eine Leitung über der Grenze zwischen einer GND-Fläche und einer 3V3-Fläche auf derselben
     Lage ist der Lehrbuchfehler „Leitung über Flächentrennung“. Weil beide Netze in einem Raster
     liegen, bleibt als Lücke nur der Zonenabstand (typisch 0,2–0,5 mm). Lücken unter 1 mm
     Länge entlang der Leitung werden ignoriert (`MIN_GAP`) und im Spiegelmodell überbrückt
     (`minGap`). Eine senkrechte Kreuzung wird also nicht gemeldet und so gerechnet, als könne der
     Rückstrom von GND-Kupfer in 3V3-Kupfer weiterfließen.
  2. Dasselbe gilt für jeden Schlitz unter 1 mm Breite, etwa eine Leitung in der Flächenlage
     (0,2 mm Bahn + 2 × 0,25 mm Abstand = 0,7 mm Schlitz). Genau davor warnt de.ts:518 („Jede
     Leitung in der Fläche ist ein Schlitz“).
  3. Geschlossene Löcher unter 3 mm² werden gefüllt. Ein Schlitz von 0,3 × 9 mm (2,7 mm²) oder
     eine Reihe zusammengewachsener Via-Freistellungen verschwindet, obwohl der Rückstrom 4,5 mm
     ausweichen muss. Maßgeblich ist die Länge quer zur Leitung, nicht die Fläche.
  4. PHYSIK.md:195 nennt als Schwelle für eine Flächenlage 50 % Bedeckung, der Code nimmt 25 %
     und zählt zusätzlich alle Flächen anderer Netze ab 5 %.
- **Abhilfe im Code:** Netzgrenzen innerhalb einer Flächenlage als Lücke behandeln (Raster mit
  Netz-Kennung), Lücken nach Umweglänge statt nach Länge entlang der Leitung bewerten, Löcher
  nach größter Ausdehnung statt nach Fläche füllen.
- **Vorschlag (DE):**
  - `diag.none` (bis das behoben ist): „Keine der geprüften Auffälligkeiten (Lücken ab 1 mm unter
    der Leitung, Bezugswechsel an Vias, fehlende Stitching-Vias, elektrisch lange Leitungen).
    Nicht geprüft: Schlitze und Flächentrennungen unter 1 mm, Übergänge zwischen zwei Netzen auf
    derselben Flächenlage, Kabel, Steckverbinder, Kühlkörper.“
  - `explain.kinds.gapDetour.detected`, Zusatz: „Schlitze, die schmaler als 1 mm gekreuzt werden,
    Löcher unter 3 mm² und Grenzen zwischen zwei Netzen auf derselben Flächenlage erkennt die App
    nicht, auch wenn der Umweg lang ist.“
  - PHYSIK.md:195: Schwelle an den Code anpassen (25 %, plus Flächen anderer Netze ab 5 %).
- **Vorschlag (EN):**
  - `diag.none`: "None of the checked problems (gaps of 1 mm or more under the line, reference
    changes at vias, missing stitching vias, electrically long lines). Not checked: slots and plane
    splits narrower than 1 mm, transitions between two nets on the same plane layer, cables,
    connectors, heat sinks."
  - `gapDetour.detected`, addition: "Slots crossed where they are narrower than 1 mm, holes
    under 3 mm² and borders between two nets on the same plane layer are not detected, even if
    the detour is long."
- **Quellen:** https://learnemc.com/the-most-important-emc-design-guidelines („Don't Split, Gap
  or Cut the Signal Return Plane“);
  https://www.pcdandf.com/pcdesign/index.php/2007-archive-articles/2236-effects-of-plane-splits-on-high-speed-signals-part-1

### 7. FCC gegen CISPR: Vergleich im Normtext falsch

- **Ort:** `src/i18n/de.ts:640`, `src/i18n/en.ts:640`.
- **Aussage:** „Die Bänder sind feiner gestuft als bei CISPR, deshalb ist FCC zwischen 30 und
  88 MHz und zwischen 216 und 230 MHz etwas anders streng.“ / „… so FCC is a bit stricter or
  looser between 30 and 88 MHz and between 216 and 230 MHz.“
- **Urteil:** falsch.
- **Warum:** Klasse B, 3 m: 30–88 MHz sind beide 40 dBµV/m, also gleich. Die Unterschiede liegen
  woanders: 88–216 MHz FCC 43,5 gegen 40 (FCC 3,5 dB lockerer), 216–230 MHz 46 gegen 40 (6 dB
  lockerer), 230–960 MHz 46 gegen 47 (FCC 1 dB strenger), 960–1000 MHz 54 gegen 47 (7 dB
  lockerer), 1–3 GHz Mittelwert 54 gegen 50 (4 dB lockerer), 3–6 GHz gleich (54).
- **Vorschlag (DE):** „… Die Bänder sind anders gestuft als bei CISPR 32 Klasse B in 3 m:
  30–88 MHz gleich (40 dBµV/m), 88–230 MHz ist FCC 3,5 bis 6 dB lockerer, 230–960 MHz 1 dB
  strenger, 960–1000 MHz 7 dB lockerer, 1–3 GHz 4 dB lockerer. An Bandgrenzen gilt der strengere
  Wert.“
- **Vorschlag (EN):** "… The bands are split differently from CISPR 32 class B at 3 m:
  30–88 MHz is the same (40 dBµV/m), 88–230 MHz FCC is 3.5 to 6 dB looser, 230–960 MHz 1 dB
  stricter, 960–1000 MHz 7 dB looser, 1–3 GHz 4 dB looser. At band edges the tighter limit
  applies."
- **Quellen:** https://www.law.cornell.edu/cfr/text/47/15.109 ; https://www.law.cornell.edu/cfr/text/47/15.35 ;
  https://emccalc.com/limits/en55032-class-b-re/

### 8. Vollwelle „ohne Näherung“

- **Ort:** `src/i18n/de.ts:300`, `src/i18n/en.ts:300`, `docs/zukunft/STUFE-3-VOLLWELLE.md:7`,
  `README.md:55–58`.
- **Aussage:** „Löst die Maxwell-Gleichungen ohne Näherung (Resonanzen, Abstrahlung).“
- **Urteil:** falsch.
- **Warum:** FDTD ist eine diskrete Näherung, und das Modell vereinfacht stark: Gitter 0,5–1 mm
  (0,2-mm-Bahnen als dünne Drähte), Kupfer als idealer Leiter ohne Dicke (keine Leiterverluste,
  Resonanzen zu scharf), dielektrische Verluste nur bei einer Bezugsfrequenz, Abbruch bei −30 dB
  Restenergie, Anregung als Port mit 33 Ω bzw. 10 Ω, Empfänger als Kapazität, Kondensatoren in der
  Schleife als ideale Kurzschlüsse (ohne ESL und ESR), Schalter als Widerstand (kein Klingeln mit
  Coss), keine Spulen, keine Kabel, kein Gehäuse. Das Stromspektrum stammt weiter aus dem
  Quellenmodell. README:57–58 („stimmen beide auf etwa 1 dB überein“) gilt für das Nahfeld über
  einer Schleife; ein Fernfeldvergleich fehlt (siehe Befund 2).
- **Vorschlag (DE):** „Löst die Maxwell-Gleichungen numerisch (FDTD), ohne die Näherungen des
  schnellen Modells: Laufzeiten, Resonanzen und die Abstrahlung der Platine sind enthalten.
  Grenzen: Gitter 0,5–1 mm, Kupfer als idealer Leiter (Resonanzen eher zu scharf), Bauteile
  vereinfacht (Kondensatoren als Kurzschluss, Schalter als Widerstand, keine Spulen), keine Kabel,
  kein Gehäuse; das Stromspektrum kommt weiter aus dem Quellenmodell. …“
- **Vorschlag (EN):** "Solves Maxwell's equations numerically (FDTD), without the approximations
  of the fast model: delays, resonances and the board's radiation are included. Limits: 0.5–1 mm
  grid, copper as a perfect conductor (resonances rather too sharp), simplified parts (capacitors
  as shorts, switch as a resistor, no inductors), no cables, no enclosure; the current spectrum
  still comes from the source model. …"
- **Quellen:** `tools/openems/run_job.py` (PEC-Kupfer, PML, NF2FF), `src/fullwave/job.ts`
  (Ports, Kurzschlüsse), `tools/openems/README.md`.

### 9. Schaltregler: Klingeln der heißen Schleife und Hochfrequenz der Drossel fehlen ohne Hinweis

- **Ort:** `src/report/explain.ts:121, 141`, `src/physics/sources.ts:61–62` (`STRAY_TURNS`),
  `inductorModel()` in `src/physics/currents.ts`, `src/physics/suggest.ts:128, 149`,
  `src/i18n/de.ts:531`, `src/i18n/en.ts:531`.
- **Aussage:** Der Trapez-Vorbehalt (de.ts:491) erscheint nur für Takt- und Datenquellen
  (`explain.ts:141`). de.ts:531: „Bei Schaltreglern ist die ‚heiße Schleife‘ … die stärkste
  Quelle der Platine.“ Die Windungszahlen der Drossel (offen 12, halb geschirmt 4, geschirmt 0,8)
  stehen nur in `docs/zukunft/STUFE-2-FLAECHENSTROEME.md:91–92` als „grobe Erfahrungswerte“.
- **Urteil:** fehlender Vorbehalt; „die stärkste Quelle“ zu sicher formuliert.
- **Warum:** Der Schleifenstrom ist ein ideales Trapez (Vorgabe 5 ns). Real klingt die Flanke mit
  der Induktivität der heißen Schleife und der Ausgangskapazität der Schalter nach; TI nennt dafür
  „broadband EMI in the 50- to 200-MHz range“. Diese Resonanzspitze liegt oft deutlich über der
  Trapez-Hüllkurve und entscheidet häufig das Band 30–230 MHz. Die Drossel wird nur mit dem
  dreieckigen Rippelstrom gerechnet; dessen Oberwellen fallen ab der Schaltfrequenz mit
  40 dB/Dekade, bei 500 kHz liegt die Linie bei 30 MHz etwa 70 dB unter der Grundwelle. Die
  Drossel trägt im Modell zum CISPR-Band also praktisch nichts bei; in der Praxis koppeln die
  Flanken des Schaltknotens über die Wicklungskapazität. Eine waagerechte Ersatzschleife über
  einer Fläche wird vom Spiegel zudem fast ausgelöscht. TI nennt drei Hauptwege der Störung:
  Leitungen am Eingang, das Magnetfeld der Schleife und das elektrische Feld des Schaltknotens;
  „die stärkste Quelle“ ist daher eine Verallgemeinerung.
- **Vorschlag (DE):**
  - Neuer Vorbehalt für Stromschleifen: „Der Schleifenstrom ist ein ideales Trapez. Echte
    Schaltflanken klingen mit der Induktivität der heißen Schleife und der Kapazität der Schalter
    nach, meist zwischen 50 und 200 MHz. Diese Resonanzspitze liegt oft deutlich über der
    Trapez-Hüllkurve und ist nicht gerechnet.“
  - Für Spulen: „Die wirksame Windungszahl des Streufelds (offen 12, halb geschirmt 4, geschirmt
    0,8) ist ein grober Erfahrungswert, keine Herstellerangabe; die Unsicherheit ist nicht
    beziffert. Gerechnet wird nur der dreieckige Rippelstrom; die Ankopplung der
    Schaltknoten-Flanken über die Wicklungskapazität, die oberhalb einiger MHz überwiegt, fehlt.“
  - de.ts:531: „… ist die ‚heiße Schleife‘ … oft eine der stärksten Quellen der Platine; dazu
    kommen das elektrische Feld des Schaltknotens und Störungen, die über die Eingangsleitungen
    abfließen.“
- **Vorschlag (EN):**
  - Loops: "The loop current is an ideal trapezoid. Real switching edges ring with the hot-loop
    inductance and the switch capacitance, mostly between 50 and 200 MHz. That resonance peak is
    often well above the trapezoid envelope and is not computed."
  - Inductors: "The effective turns of the stray field (open 12, semi-shielded 4, shielded 0.8)
    are a rough rule of thumb, not manufacturer data; the uncertainty is not quantified. Only the
    triangular ripple current is computed; coupling of the switch-node edges through the winding
    capacitance, which dominates above a few MHz, is missing."
  - en.ts:531: "… the hot loop … is often one of the strongest sources on the board, along with
    the electric field of the switch node and noise conducted out on the input lines."
- **Quellen:** https://www.ti.com/lit/pdf/slyt682 (T. Hegarty, „Reduce buck-converter EMI and
  voltage stress by minimizing inductive parasitics“, Analog Applications Journal 3Q 2016).

### 10. Spektrum: Ausdünnung mit √k verfälscht Einzellinien, Messbandbreite fehlt

- **Ort:** `src/physics/spectrum.ts:50–68` (ebenso `triangleLines` 92–109),
  `docs/stufe-1/PHYSIK.md:69–73`; Vergleich mit dem Grenzwert in `src/report/texts.ts:48–68`.
- **Aussage:** PHYSIK.md:72–73 „… wird jede k-te Linie behalten (k ungerade) und mit √k skaliert:
  Die Leistung in jedem Band bleibt erhalten …“
- **Urteil:** falsch für den Vergleich mit dem Grenzwert (richtig nur für Bandleistungen).
- **Warum:** Grenzwerte gelten für die Anzeige des Messempfängers in 120 kHz Bandbreite unter
  1 GHz und 1 MHz darüber, nicht für Bandleistungen. Liegen die Linien weiter auseinander als die
  Bandbreite, steht jede Linie allein und darf nicht skaliert werden; √k hebt jede behaltene Linie
  um 10·log10(k) dB. Nachgerechnet mit der Vorgabe für Schaltregler (500 kHz, Tastgrad 0,3, 5 ns,
  1 A): stärkste Linie 30–230 MHz bei „Spektrum bis 1 GHz“ 76,4 dBµA, bei „bis 6 GHz“ (k = 3)
  80,0 dBµA. Abstand, Schweregrad und Reihenfolge ändern sich also um 3,5 dB, nur weil der
  Anzeigebereich geändert wurde. Ist umgekehrt f0 kleiner als die Bandbreite (Regler unter
  120 kHz, über 1 GHz alles unter 1 MHz), fasst der Empfänger mehrere Linien zusammen; bei einem
  periodischen Signal addieren sie sich phasenrichtig, und der Linienvergleich zeigt zu wenig.
- **Abhilfe im Code:** Für den Grenzwertvergleich ungeskalierte Linien verwenden (Weglassen ist
  dort harmlos); für f0 unter der Bandbreite die Amplituden innerhalb einer Bandbreite addieren.
- **Vorschlag (DE)** (PHYSIK.md und `standards.common`): „Verglichen wird jede Spektrallinie
  einzeln mit dem Grenzwert. Das entspricht dem Messempfänger (120 kHz Bandbreite unter 1 GHz,
  1 MHz darüber), solange die Grundfrequenz größer als diese Bandbreite ist; darunter fasst der
  Empfänger mehrere Linien zusammen und zeigt mehr an als die Rechnung.“
- **Vorschlag (EN):** "Each spectral line is compared with the limit on its own. That matches
  the measuring receiver (120 kHz bandwidth below 1 GHz, 1 MHz above) as long as the fundamental
  is above that bandwidth; below it the receiver combines several lines and reads higher than the
  calculation."
- **Quellen:** https://www.law.cornell.edu/cfr/text/47/15.35 ;
  https://emccalc.com/limits/en55032-class-b-re/ (Detektoren und Bandbreiten je Bereich).

### 11. „Aussparungen … meist unter dem Schaltknoten“

- **Ort:** `src/i18n/de.ts:537`, `src/i18n/en.ts:537`.
- **Aussage:** „Aussparungen nur dort, wo das Datenblatt sie verlangt (meist unter dem
  Schaltknoten, nicht unter der Schleife).“
- **Urteil:** falsch / irreführend.
- **Warum:** TI empfiehlt bei Mehrlagenplatinen ausdrücklich eine durchgehende GND-Fläche unter
  dem Schaltknoten: „A full ground plane under the SW node contributes a very small increase in
  SW-to-GND parasitic capacitance, but is recommended …“. Die übliche Freistellung betrifft
  Kupfer auf der Bauteillage unter der Drossel (Kopplung SW → VOUT), nicht die GND-Fläche unter
  dem Schaltknoten. Eine Aussparung dort nimmt dem elektrischen Feld des Knotens den Schirm.
- **Vorschlag (DE):** „Die Lage direkt unter der heißen Schleife und unter dem Schaltknoten als
  durchgehende GND-Fläche ausführen. Aussparungen nur, wo das Datenblatt sie ausdrücklich
  verlangt; übliche Freistellungen betreffen Kupfer auf der Bauteillage unter der Drossel, nicht
  die GND-Fläche.“
- **Vorschlag (EN):** "Make the layer right under the hot loop and under the switch node a
  continuous GND plane. Cut-outs only where the datasheet explicitly asks for them; the usual
  keep-out is top-layer copper under the inductor, not the GND plane."
- **Quellen:** https://www.ti.com/lit/pdf/slyt682

### 12. Brücken- und Stitching-Kondensatoren: Wirkung begrenzt, Wert nebensächlich, Flächenkapazität falsch bewertet

- **Ort:** `src/i18n/de.ts:411, 413, 512, 564, 570`, `src/i18n/en.ts:411, 413, 512, 564, 570`.
- **Aussage:** „Brückenkondensator (z. B. 100 nF, 0402) über die Lücke“; „Kondensator (100 nF,
  0402) … direkt an der Signal-Via (weniger als 2 mm)“; „Sich nicht auf die Kapazität zwischen den
  Flächen allein verlassen: Bei hohen Frequenzen ist sie ein Resonator, keine Verbindung.“
- **Urteil:** fehlender Vorbehalt (Kondensatoren); irreführend (Flächenkapazität).
- **Warum:** Oberhalb der Eigenresonanz bestimmt die Einbauinduktivität die Impedanz, nicht der
  Wert („It's really the inductance that matters“). Archambeaults Tabellen geben für ein 0402 mit
  Vias etwa 0,9–3 nH an; 1,5 nH sind 2,8 Ω bei 300 MHz und 9,4 Ω bei 1 GHz. Brückenkondensatoren
  helfen deshalb vor allem bis einige hundert MHz und nur direkt an der Kreuzung (in den bei
  PCD&F zitierten Versuchen bei 600 MHz unwirksam ab etwa 12 mm Abstand). In dem Bereich, in dem
  einzelne Kondensatoren versagen, trägt gerade die Kapazität zwischen den Flächen den Rückstrom,
  umso besser, je dünner das Dielektrikum. „Keine Verbindung“ ist daher das Gegenteil der
  üblichen Lehrmeinung; richtig ist die Warnung vor den Hohlraumresonanzen.
- **Vorschlag (DE):**
  - de.ts:512: „Wenn die Leitung kreuzen muss: Brückenkondensator über die Lücke, direkt an der
    Kreuzung, mit kurzen, eng benachbarten Vias. Ab etwa 100 MHz begrenzt die Induktivität von
    Bauform und Vias (etwa 1–3 nH) die Wirkung zunehmend; der Kapazitätswert ist dort zweitrangig.
    Besser ist immer, die Lücke nicht zu kreuzen.“
  - de.ts:564: „Wenn der Wechsel bleiben muss: Kondensator zwischen ${planeNet} und ${otherNet}
    direkt an der Signal-Via (weniger als 2 mm), kleine Bauform, kurze Vias. Er wirkt bis einige
    hundert MHz; darüber trägt vor allem die Kapazität zwischen den Flächen.“
  - de.ts:570: „Die Kapazität zwischen den Flächen trägt bei hohen Frequenzen einen großen Teil des
    Rückstroms, umso mehr, je dünner das Dielektrikum ist. Bei ihren Hohlraumresonanzen wird sie
    aber hochohmig; allein darauf verlassen ist riskant.“
  - `focus.suggest.capPlanes` / `bridgeCap`: „100 nF“ durch „Kondensator, kleine Bauform, kurze
    Vias“ ersetzen.
- **Vorschlag (EN):**
  - en.ts:512: "If the line has to cross: a stitching capacitor across the gap, right at the
    crossing, with short, closely spaced vias. From about 100 MHz the inductance of package and
    vias (about 1–3 nH) increasingly limits it; the capacitance value hardly matters there. Not
    crossing the gap is always better."
  - en.ts:564: "If the change has to stay: a capacitor between ${planeNet} and ${otherNet} right
    at the signal via (less than 2 mm), small package, short vias. It works up to a few hundred
    MHz; above that the capacitance between the planes carries most of the return."
  - en.ts:570: "At high frequencies the capacitance between the planes carries much of the return
    current, the more the thinner the dielectric. At its cavity resonances it becomes high
    impedance, so relying on it alone is risky."
- **Quellen:** https://ewh.ieee.org/r3/enc/emcs/archive/2012-10-10b_DecouplingMyths.pdf
  (B. Archambeault, „PCB Power Decoupling Myths Debunked“, 2012);
  https://www.pcdandf.com/pcdesign/index.php/2007-archive-articles/2236-effects-of-plane-splits-on-high-speed-signals-part-1 ;
  https://www.researchgate.net/publication/4037266_Effect_of_stitching_capacitor_distance_for_critical_traces_crossing_split_reference_planes

### 13. „Flächen nur dort teilen, wo keine schnellen Signale kreuzen“

- **Ort:** `src/i18n/de.ts:511`, `src/i18n/en.ts:511`.
- **Urteil:** irreführend.
- **Warum:** Der Satz stellt das Teilen der Bezugsfläche als normales Werkzeug dar. Hubing/LearnEMC:
  „Don't Split, Gap or Cut the Signal Return Plane … Just don't do it!“ Analog- und Digitalteil
  trennt man durch Platzierung, nicht durch Schlitze. Getrennte Versorgungsinseln sind etwas
  anderes, dürfen aber schnellen Signalen nicht als Bezug dienen.
- **Vorschlag (DE):** „Lücke schließen oder die Fläche unter der Leitung durchgehend machen. Die
  Bezugsfläche (meist GND) grundsätzlich nicht teilen; Analog- und Digitalteil durch Platzierung
  trennen, nicht durch Schlitze. Getrennte Versorgungsinseln nur auf Lagen, die schnellen
  Signalen nicht als Bezug dienen.“
- **Vorschlag (EN):** "Close the gap, or make the plane continuous under the line. Do not split
  the return plane (usually GND) at all; separate analog and digital by placement, not by slots.
  Split supply islands only on layers that fast signals do not use as reference."
- **Quellen:** https://learnemc.com/the-most-important-emc-design-guidelines

### 14. Kürzester Rückweg: Richtung der Abweichung vermutlich falsch

- **Ort:** `src/i18n/de.ts:489, 522`, `src/i18n/en.ts:489, 522`.
- **Aussage:** „Real verteilt sich der Strom breiter, die zusätzliche Fläche ist eher überschätzt,
  der Gewinn der Behebung eher etwas kleiner.“
- **Urteil:** vermutlich falsch (Richtung nicht belegt).
- **Warum:** Der kürzeste Weg durchs Kupfer läuft eng an Schlitzrand und Ecke entlang; er ist der
  innerste mögliche Pfad und schließt die kleinste mögliche Zusatzfläche ein. Ein wirklicher
  HF-Strom ist kein Faden auf der Kante; er verteilt sich von der Kante weg, sein mittlerer Weg
  liegt also außerhalb des kürzesten Wegs, und die wirksame Zusatzfläche wird eher größer.
  Wichtiger als dieser Fehler ist ohnehin die nicht gerechnete Spannung über dem Schlitz, die
  Gleichtaktströme antreibt.
- **Vorschlag (DE):** „Der Rückstrom-Umweg ist als einzelner Faden auf dem kürzesten Weg gerechnet.
  Der wirkliche Strom verteilt sich um diesen Weg; die zusätzliche Fläche kann dadurch größer
  oder kleiner sein. Meist wiegt schwerer, dass die Spannung über dem Schlitz nicht gerechnet ist,
  die Gleichtaktströme antreibt.“
- **Vorschlag (EN):** "The return detour is computed as a single filament along the shortest
  path. The real current spreads around it, so the extra area can be larger or smaller. Usually
  more important: the voltage across the slot, which drives common-mode currents, is not
  computed."
- **Quellen:** physikalische Begründung (minimale Induktivität heißt endliche Stromverteilung,
  kein Faden auf der Kante); E. Bogatin, *Signal and Power Integrity – Simplified*, Kap.
  Rückstrompfade.

### 15. Erfahrungszahlen ohne Quelle

- **Ort:** `src/i18n/de.ts:490` („Real eher 10–20 dB“), `de.ts:552` („eher 10–20 dB“), `de.ts:482`
  („Abweichungen um 10 dB nach oben oder unten sind möglich“); ebenso en.ts.
- **Urteil:** zu sicher formuliert.
- **Warum:** Keine Quelle, und die Größe hängt von Flächengröße, Höhe der Schleife und Frequenz
  ab. An Resonanzen einer offenen Leitung liegen die Abweichungen leicht über 10 dB, an
  Knoten der stehenden Welle auch weit darunter.
- **Vorschlag (DE):**
  - de.ts:490 und 552: „Über einer idealen, unendlich großen Fläche heben sich Strom und
    Spiegelstrom fast vollständig auf; deshalb erscheint der Gewinn sehr groß. Bei einer endlichen
    Platine ist er kleiner; wie viel, hängt von Flächengröße, Höhe der Schleife und Frequenz ab und
    ist hier nicht gerechnet (die Vollwelle, Stufe 3, zeigt es).“
  - de.ts:482: „… Abweichungen von 10 dB und mehr in beide Richtungen sind möglich, an Resonanzen
    auch deutlich mehr.“
- **Vorschlag (EN):**
  - en.ts:490/552: "Over an ideal, infinite plane current and image almost cancel, so the gain
    looks very large. On a finite board it is smaller; how much depends on plane size, loop height
    and frequency and is not computed here (the full wave, stage 3, shows it)."
  - en.ts:482: "… deviations of 10 dB or more either way are possible, much more at resonances."
- **Quellen:** keine für die genannten Zahlen auffindbar.

### 16. USB-Vorschlag rechnet Full-Speed

- **Ort:** `src/physics/suggest.ts:52–68` (Vorgabe Zeile 67), `src/i18n/de.ts:51`,
  `src/i18n/en.ts:53`.
- **Aussage:** Vorgabe f0 = 6 MHz, 3,3 V, 4 ns, kapazitive Last; Begründung „USB-Datenpaar“.
- **Urteil:** fehlender Vorbehalt (irreführende Vorgabe).
- **Warum:** Das ist USB 2.0 Full-Speed (12 Mbit/s, Flanken 4–20 ns). Ein High-Speed-Link
  (480 Mbit/s, 400 mV, Flanken um 500 ps, stromgesteuerter Treiber an 45-Ω-Abschlüssen) hat seine
  Grundwelle bei 240 MHz. Nach der Trapezformel liegt dessen Linie dort etwa 50 dB über der Linie
  der Full-Speed-Vorgabe. Für High-Speed passt das Lastmodell „abgeschlossen“, nicht
  „kapazitiv“. Dasselbe gilt für die allgemeine Paar-Vorgabe (50 MHz, 0,4 V, wie LVDS): LVDS ist
  abgeschlossen, nicht kapazitiv belastet.
- **Vorschlag (DE):** Begründung „USB-Datenpaar (angenommen Full-Speed, 12 Mbit/s; bei
  High-Speed, 480 Mbit/s, Werte und Lastmodell ändern)“.
- **Vorschlag (EN):** "USB data pair (assumed full speed, 12 Mbit/s; for high speed, 480 Mbit/s,
  change the values and the load model)".
- **Quellen:** https://download.tek.com/document/55W-15027-4%20USB%202.0%20Physical%20Layer%20Testing_0.pdf ;
  https://en.wikipedia.org/wiki/USB_communications

### 17. Differenzpaar: nur Amplituden-Unsymmetrie, kein Laufzeitversatz

- **Ort:** `src/physics/sources.ts:36–37`, `diffPairModel()` in `src/physics/currents.ts`,
  `src/physics/suggest.ts:69` (Vorgabe 5 %).
- **Urteil:** fehlender Vorbehalt.
- **Warum:** Der Gleichtaktanteil eines Paars kommt im Modell nur aus ε (Vorgabe 5 %, nicht
  gemessen) und ist frequenzunabhängig. In der Praxis überwiegt oft der Versatz zwischen P und N
  (Längenunterschied, Treiber, ungleiche Flanken); sein Gleichtaktanteil wächst mit der Frequenz
  (etwa sin(π·f·Δt), bei 10 ps und 1 GHz rund 3 %, bei 3 GHz rund 9 %). Auch Knicke und
  unsymmetrische Vias wandeln Gegentakt in Gleichtakt.
- **Vorschlag (DE)**, Vorbehalt für Paare: „Der Gleichtaktanteil des Paars kommt nur aus der
  eingestellten Amplituden-Unsymmetrie (Vorgabe 5 %, nicht gemessen). Laufzeitversatz zwischen P
  und N ist nicht gerechnet; sein Gleichtaktanteil wächst mit der Frequenz (bei 10 ps Versatz und
  1 GHz rund 3 %).“
- **Vorschlag (EN):** "The pair's common-mode part comes only from the set amplitude imbalance
  (default 5 %, not measured). Skew between P and N is not computed; its common-mode part grows
  with frequency (about 3 % at 10 ps skew and 1 GHz)."
- **Quellen:** Rechnung: Gleichtaktspannung (V(t) − V(t − Δt))/2 ergibt den Betrag sin(π·f·Δt).

### 18. Normtexte: Vollabsorberhalle, Messgrenze über 1 GHz, „übliche Norm“

- **Ort:** `src/i18n/de.ts:624, 630, 635`, `src/i18n/en.ts:624, 630, 635`,
  `src/physics/standards.ts:3–5`.
- **Aussage:** „Gemessen auf dem Freifeld oder in der Absorberhalle in 3 m oder 10 m … (40/47
  dBµV/m in 3 m)“; „die übliche Norm für Elektronik in Europa“; standards.ts: „the extrapolation
  the standards themselves use“.
- **Urteil:** ok aber unscharf.
- **Warum:**
  1. 40/47 dBµV/m gelten für Freifeld und Halbabsorberhalle. In der Vollabsorberhalle (FAR) gilt
     für Klasse B in 3 m 42–35 / 42 dBµV/m, für Klasse A 52–45 / 52 dBµV/m. „Absorberhalle“
     lässt das offen (en.ts sagt richtig „semi-anechoic“).
  2. Über 1 GHz muss nur so weit gemessen werden, wie die höchste intern erzeugte Frequenz Fx
     verlangt: bis 108 MHz nur bis 1 GHz, bis 500 MHz bis 2 GHz, bis 1 GHz bis 5 GHz, darüber
     5 · Fx, höchstens 6 GHz. Die App vergleicht Linien über 1 GHz immer; für langsame Designs ist
     das strenger als die Norm.
  3. EN 55032 gilt für Multimedia-Geräte. Industrie- und Laborelektronik fällt meist unter
     EN 55011 bzw. EN 61326-1, Haushaltsgeräte unter EN 55014-1.
  4. CISPR tabelliert 3 m und 10 m (10 dB Unterschied, also gerundete 20 dB/Dekade); die
     Umrechnung ist eine Konvention der Normen, keine Physik in 3 m bei 30 MHz (k·r ≈ 1,9). CISPR 11
     Klasse A in 3 m ergibt umgerechnet 50,5/57,5 statt der tabellierten Werte; 3 m ist dort nur
     für kleine Prüflinge zulässig.
- **Vorschlag (DE)**, de.ts:630: „Multimedia-Geräte (IT, Audio und Video, Netzwerk) für den
  Wohnbereich (CE-Kennzeichnung über EN 55032); Industrie- und Laborelektronik fällt meist unter
  EN 55011 bzw. EN 61326-1, Haushaltsgeräte unter EN 55014-1. … Gemessen auf dem Freifeld oder in
  der Halbabsorberhalle in 3 m oder 10 m: unter 1 GHz mit Quasi-Peak-Detektor (40/47 dBµV/m in
  3 m; in der Vollabsorberhalle 42–35/42 dBµV/m), darüber Mittelwert (50/54 dBµV/m) und Spitzenwert
  (20 dB höher), über 1 GHz nur so weit, wie es die höchste intern erzeugte Frequenz verlangt
  (bis 108 MHz: nur bis 1 GHz; bis 500 MHz: bis 2 GHz; bis 1 GHz: bis 5 GHz; darüber das
  Fünffache, höchstens 6 GHz). …“
- **Vorschlag (EN):** "Multimedia equipment (IT, audio and video, networking) for residential use
  (CE marking via EN 55032); industrial and lab electronics usually fall under EN 55011 or
  EN 61326-1, household appliances under EN 55014-1. … Measured on an open-area test site or in a
  semi-anechoic chamber at 3 m or 10 m: below 1 GHz with a quasi-peak detector (40/47 dBµV/m at
  3 m; 42–35/42 dBµV/m in a fully anechoic room), above with average (50/54 dBµV/m) and peak
  (20 dB higher), above 1 GHz only as far as the highest internal frequency requires (up to
  108 MHz: only to 1 GHz; up to 500 MHz: to 2 GHz; up to 1 GHz: to 5 GHz; above: five times,
  at most 6 GHz). …"
- **Quellen:** https://nobelcert.com/DataFiles/FreeUpload/BS%20EN%2055032-2015%20plus%20Cor2016%20plus%20A11-2020.pdf
  (Tabellen A.2–A.5); https://site.ieee.org/ctx-emcs/files/2015/04/2013_02_13-Presentation.pdf
  (Tabelle Fx → höchste Messfrequenz); https://www.law.cornell.edu/cfr/text/47/15.31 (20 dB/Dekade,
  nicht im Nahfeld).

### 19. PHYSIK.md verspricht eine Schraffur, die es nicht gibt

- **Ort:** `docs/stufe-1/PHYSIK.md:274–276`, `src/physics/farfield.ts:74–90` (`extentMm`, nirgends
  benutzt), `src/physics/farfield.ts:56–67` (`cispr32ClassB`, nirgends benutzt).
- **Aussage:** „Ab einer Strukturgröße von etwa λ/4 überschätzt die f²-Formel (keine Sättigung);
  diese Bereiche werden schraffiert.“
- **Urteil:** falsch (Dokumentation).
- **Warum:** Weder Spektrum noch Sprechblasen schraffieren etwas; `extentMm` ist toter Code. Der
  Vorbehalt „Platinengröße“ in der Erklärung (`explain.ts:128–130`) erscheint erst, wenn die
  stärkste Linie über einem Drittel der Wellenlänge der Diagonale liegt, und nur dort.
- **Vorschlag (DE):** Schraffur umsetzen oder den Satz ersetzen: „Ab einer Strukturgröße von etwa
  λ/4 gilt die f²-Formel nicht mehr (keine Sättigung, keine Resonanz). Die App kennzeichnet diesen
  Bereich im Spektrum derzeit nicht; die Erklärung eines Hinweises warnt, wenn die stärkste Linie
  dort liegt.“

### 20. Flächen als ideale Leiter: bei Schaltregler-Grundwellen zu optimistisch

- **Ort:** `docs/stufe-1/PHYSIK.md:294`, Abschirmung in `src/physics/biotsavart.ts:85–106`,
  Spiegel in `src/physics/images.ts`.
- **Aussage:** „Flächen als ideale Leiter (Skin-Tiefe von 35 µm Kupfer < Kupferdicke ab ≈ 4 MHz).“
- **Urteil:** zu sicher formuliert.
- **Warum:** Bei 3,6 MHz ist die Skintiefe 35 µm; eine Skintiefe Kupfer dämpft durch Absorption
  nur 8,7 dB. Ideal ist eine 35-µm-Fläche erst deutlich oberhalb 10 MHz. Bei den Grundwellen von
  Schaltreglern (0,1–2 MHz, Skintiefe etwa 210–47 µm) dringt das Magnetfeld teilweise durch, und
  die Spiegelwirkung unter einer flachen Schleife ist schwächer. Das Modell setzt das Feld hinter
  einer Fläche auf exakt null. Für 30 MHz und mehr ist die Näherung gut; für den Vergleich mit
  Scans der Rückseite unter 10 MHz nicht.
- **Vorschlag (DE):** „Flächen als ideale Leiter. Für 35 µm Kupfer ist das ab etwa 10 MHz gut
  erfüllt (mehrere Skintiefen). Bei den Grundwellen von Schaltreglern (0,1–2 MHz, Skintiefe
  50–210 µm) dringt das Magnetfeld teilweise durch die Fläche, und die Spiegelwirkung ist
  schwächer; das Modell zeigt dort hinter Flächen zu wenig Feld.“
- **Quellen:** https://en.wikipedia.org/wiki/Skin_effect (δ = 1/√(π·f·µ0·σ), Kupfer 1 MHz ≈ 65 µm).

### 21. Sondenmodell: ideale Leerlaufspannung an 50 Ω

- **Ort:** `src/scanner/probe.ts:1–6, 14–17`, `docs/stufe-1/PHYSIK.md:246`,
  `docs/zukunft/STUFE-4-MESSUNG-SCANNER.md:22`; Auswirkung auf `scan.fitHint` (de.ts:281).
- **Aussage:** „U = 2π f µ0 π a² H (open-circuit EMF, into 50 Ω as a first approximation)“.
- **Urteil:** fehlender Vorbehalt.
- **Warum:** An 50 Ω bildet die Eigeninduktivität der Schleife einen Tiefpass: oberhalb
  f ≈ 50 Ω / (2π·L) wird die Ausgangsspannung flach. Eine Schleife mit 10 mm Durchmesser hat etwa
  19 nH, also rund 400 MHz Eckfrequenz; bei 1 GHz zeigt die Formel etwa 8 dB zu viel. Dazu kommen
  die E-Feld-Empfindlichkeit ungeschirmter Schleifen und die Mittelung über die Schleifenfläche
  dicht über Leitungen. „Quellen anpassen“ schreibt solche Sondenfehler den Quellen zu.
- **Vorschlag (DE):** „Ideale Leerlaufspannung. An 50 Ω begrenzt die Eigeninduktivität der Schleife
  ab f ≈ 50 Ω/(2π·L) (10-mm-Schleife: etwa 400 MHz), darüber zeigt die Formel zu viel (bei 1 GHz
  etwa 8 dB). Für Absolutwerte den Sondenfaktor des Herstellers verwenden; sonst schreibt
  ‚Quellen anpassen‘ Sondenfehler den Quellen zu.“
- **Quellen:** Rechnung L = µ0·a·(ln(8a/r) − 2) mit a = 5 mm, r = 0,25 mm.

### 22. Kleiner Hochfrequenzkondensator an VIN/PGND: Wirkung über ESL, Antiresonanz nicht erwähnt

- **Ort:** `src/i18n/de.ts:539`, `src/i18n/en.ts:539`.
- **Aussage:** „Einen kleinen Hochfrequenz-Kondensator (z. B. 100 nF, 0402) zusätzlich direkt an
  VIN/PGND.“
- **Urteil:** fehlender Vorbehalt.
- **Warum:** Der Nutzen kommt aus kleiner Bauform und kürzester Schleife (geringe
  Einbauinduktivität), nicht aus dem Wert. Parallel zu größeren Keramikkondensatoren kann ein
  anderer Wert eine Parallelresonanz bilden. Archambeault führt „Need a variety of capacitance
  values“ als Mythos.
- **Vorschlag (DE):** „Einen Kondensator in kleiner Bauform (z. B. 0402) als nächsten an VIN/PGND
  setzen, mit kürzester Schleife. Er wirkt über seine kleine Einbauinduktivität, nicht über den
  Wert. Zusammen mit den größeren Eingangskondensatoren kann er eine Parallelresonanz bilden; im
  Zweifel den Impedanzverlauf prüfen.“
- **Vorschlag (EN):** "Put a capacitor in a small package (e.g. 0402) closest to VIN/PGND, with the
  shortest loop. It works through its low mounting inductance, not its value. Together with the
  larger input capacitors it can form a parallel resonance; check the impedance curve when in
  doubt."
- **Quellen:** https://ewh.ieee.org/r3/enc/emcs/archive/2012-10-10b_DecouplingMyths.pdf

### 23. Serienterminierung nur für Punkt-zu-Punkt

- **Ort:** `src/i18n/de.ts:597, 415`, `src/i18n/en.ts:597, 415`.
- **Urteil:** fehlender Vorbehalt (gering).
- **Warum:** Serienterminierung passt für einen Empfänger am Leitungsende. Bei mehreren Empfängern
  entlang der Leitung sehen die mittleren eine Stufe mit halber Amplitude (Johnson/Graham).
- **Vorschlag (DE):** „Serienwiderstand am Treiber (etwa Z0 minus Ausgangswiderstand, typisch
  22–33 Ω), wenn die Leitung zu einem Empfänger am Ende führt. Bei mehreren Empfängern entlang der
  Leitung sehen die mittleren eine Stufe; dann Abschluss am Ende oder sternförmige Führung.“
- **Vorschlag (EN):** "A series resistor at the driver (about Z0 minus the driver output
  resistance, typically 22–33 Ω) when the line goes to one receiver at its end. With several
  receivers along the line the middle ones see a step; then terminate at the end or route as a
  star."
- **Quellen:** H. Johnson, M. Graham, *High-Speed Digital Design*, 1993, Kap. Terminierung.

### 24. Elektrisch lange Leitung: „mit überall gleichem Strom“

- **Ort:** `src/i18n/de.ts:594`, `src/i18n/en.ts:594`.
- **Urteil:** ok aber unscharf (widerspricht dem Modell).
- **Warum:** Beim kapazitiven Lastmodell nimmt der Strom zum Leitungsende hin ab (PHYSIK.md §5.1);
  konstant ist er nur beim abgeschlossenen Modell. Gemeint ist: gleichphasig, ohne Laufzeit.
- **Vorschlag (DE):** „Die schnelle Rechnung behandelt die Leitung als konzentriert: überall
  gleichphasig, ohne Laufzeit.“
- **Vorschlag (EN):** "The fast calculation treats the line as lumped: in phase everywhere,
  without delay."

### 25. Hohlraumresonanz aus Platinengröße geschätzt

- **Ort:** `src/report/explain.ts:134–138`, `src/i18n/de.ts:488`, `src/i18n/en.ts:488`.
- **Urteil:** ok aber unscharf.
- **Warum:** Die Formel c/(2·L·√εr) stimmt für die erste Mode. Eingesetzt werden aber die längste
  Seite der ganzen Platine und εr des ersten Dielektrikums (meist das oberste), nicht die
  Überlappung der beiden Flächen und das Dielektrikum dazwischen. Kleine Flächeninseln resonieren
  deutlich höher.
- **Vorschlag (DE):** „Der Hohlraum zwischen ${a} und ${b} hat seine erste Resonanz grob geschätzt
  bei etwa ${f} (aus der Platinengröße; kleinere Flächeninseln resonieren höher).“
- **Vorschlag (EN):** "The cavity between ${a} and ${b} has its first resonance roughly at about
  ${f} (from the board size; smaller plane islands resonate higher)."

### 26. Fernfeldformel in 3 m bei tiefen Frequenzen

- **Ort:** `src/physics/farfield.ts:41–47`, `src/i18n/de.ts:474`, `src/i18n/en.ts:474`.
- **Urteil:** ok aber unscharf.
- **Warum:** Das E-Feld eines magnetischen Dipols hat den Faktor √(1 + 1/(k·r)²); bei 30 MHz in
  3 m ist k·r ≈ 1,9, also etwa +1,1 dB, die die reine Fernfeldformel nicht enthält. Der
  Bodenfaktor 2 ist ein Höchstwert; bei horizontaler Polarisation und tiefen Frequenzen erreicht
  der Höhenscan (1–4 m) ihn nicht immer. Beides klein; im Formeltext erwähnen (siehe Vorschlag in
  Befund 2).

### 27. Mehrere Quellen als Leistungssumme

- **Ort:** `farReadout()` in `src/state/engine.svelte.ts` (Summe `totals`, etwa Zeile 857),
  `docs/stufe-1/PHYSIK.md:163–171`, `docs/ENTSCHEIDUNGEN.md` Nr. 5.
- **Urteil:** ok aber unscharf.
- **Warum:** Quellen am selben Takt (Taktpuffer-Ausgänge, Daten mit gemeinsamem Takt) sind
  phasenstarr; ihre Linien auf gleicher Frequenz addieren sich bis zu 6 dB statt 3 dB. Die
  „Summe“ sollte als „inkohärent angenommen“ gekennzeichnet sein.

### 28. CISPR 11 und CISPR 14-1: nicht vollständig verifiziert, Messverfahren

- **Ort:** `src/i18n/de.ts:650–660`, `src/i18n/en.ts:650–660`, `src/physics/standards.ts:77–106`.
- **Urteil:** ok aber unscharf (Werte plausibel, nicht vollständig gegen den Normtext geprüft).
- **Warum:** CISPR 11 Gruppe 1: 10 m Klasse B 30/37, Klasse A 40/47 dBµV/m passen zu den
  zugänglichen Quellen; seit Ausgabe 5 gibt es eigene Werte für Klasse-A-Geräte über 20 kVA (der
  Text sagt „bis 20 kVA“, das passt). Die Gruppendefinition im Text („erzeugen Hochfrequenz nur
  intern“) ist eine Umschreibung; formal ist Gruppe 1 „alles, was nicht Gruppe 2 ist“. Für
  CISPR 14-1 waren die Zahlenwerte frei nicht zugänglich; die Norm koppelt die Abstrahlung an
  Messverfahren (Tabelle 9 „limits and testing methods“) und kennt alternativ die Störleistung
  30–300 MHz (Tabelle 7). Der Vergleich der App ist dann nur einer der möglichen Nachweise.
- **Vorschlag:** Werte gegen die gekauften Normen prüfen; im CISPR-14-1-Text ergänzen: „Je nach
  Gerät wird statt der Abstrahlung die Störleistung an den Leitungen (30–300 MHz) gemessen.“
- **Quellen:** https://cdn.standards.iteh.ai/samples/15070/2cded154aefd4da09343d754b7778721/CISPR-11-2009.pdf ;
  https://cdn.standards.iteh.ai/samples/21114/22098bc572fe44798a4979c30766f95b/CISPR-14-1-2016.pdf
  (Inhaltsverzeichnis, Tabellen 7 und 9).

### 29. Kleinere Formulierungen

- `docs/ENTSCHEIDUNGEN.md:12` (Nr. 3): „Stromschleifen, die häufigste EMV-Ursache auf Platinen“.
  Zu sicher; besser: „eine häufige Ursache; Prüfungen scheitern meist an Gleichtaktströmen, die
  Stromschleifen antreiben“ (Paul 1989, LearnEMC).
- `docs/ENTSCHEIDUNGEN.md:19` (Nr. 6): Spiegelung „physikalisch richtig für durchgehende Flächen“
  gilt für das Nahfeld über großen Flächen, nicht für das Fernfeld kleiner Platinen (Befund 2).
- `src/i18n/de.ts:583`, en.ts:583: „Bei Differenzpaaren eine Stitching-Via je Paar, symmetrisch.“
  Unscharf; üblich: „ein bis zwei GND-Vias symmetrisch zum Paar, möglichst je eine neben jeder
  Signal-Via“ / "one or two GND vias symmetric to the pair, ideally one next to each signal via".

---

## Geprüft und in Ordnung

- Konstante `K_DIPOLE = η0·(2π/c)²/(4π) = 1,3168·10⁻¹⁴` entspricht Otts 131,6·10⁻¹⁶ (Freiraum);
  mit Faktor 2 gleich 263·10⁻¹⁶ (Ott, Gl. 12-2). Die Konstante stimmt, nur das Moment nicht
  (Befund 2).
- dB-Umrechnungen: dBµV/m = 20·log10(E) + 120, dBµA/m = 20·log10(H / 1 µA/m); Anzeige als
  Effektivwert (Fourier-Scheitelwert / √2) wie am Spektrumanalysator.
- Trapezspektrum: c_n = 2A·d·|sinc(nπd)|·|sinc(nπ·tr/T)|, Knickfrequenzen 1/(π·τ) und 1/(π·tr)
  (Paul); gerade Oberwellen verschwinden bei 50 %. „Halbierte Anstiegszeit hebt die Linien
  darüber um bis zu 6 dB“ stimmt.
- Dreieck-Rippelstrom: c_n = A·|sin(nπD)| / (π²·n²·D·(1−D)) nachgerechnet, stimmt.
- Mikrostreifen nach Hammerstad/Jensen und Streifenleiter nach IPC-2141 wie in der Literatur;
  C' und L' aus Z0 und εeff korrekt.
- λ/10-Kriterium für „elektrisch kurz“ und f_kurz = c/(10·L·√εeff); Quasistatik-Kriterium
  k·r ≤ 0,3.
- CISPR 32 Klasse A und B, 3 m und 10 m, 30–1000 MHz sowie 1–6 GHz (Mittelwert, Spitze 20 dB höher)
  in `standards.ts` stimmen mit EN 55032:2015+A11:2020, Tabellen A.2–A.5, überein.
- FCC §15.109 Klasse B (3 m) und Klasse A (10 m) samt dB-Werten; Quasi-Peak unter 1 GHz,
  Mittelwert darüber, Spitze +20 dB (§15.35); Umrechnung mit 20 dB/Dekade nach §15.31(f)(1).
- CISPR 32: keine Abstrahlgrenzwerte unter 30 MHz; CISPR 25 und MIL-STD-461 RE102 in 1 m mit
  Kabelbaum.
- Hohlraumresonanz c/(2·L·√εr) als Formel (nur die Eingangswerte sind grob, Befund 25).
- Erklärung, dass ein gekreuzter Schlitz eine Spannung treibt, selbst abstrahlt und Gleichtakt
  auf Kabel bringt (de.ts:506), ist richtig und wichtig.
- „Oberhalb einiger MHz fließt der Rückstrom direkt unter der Leitung“: vertretbar (LearnEMC:
  „At megahertz frequencies and higher …“).
- Ratschläge Leitung umlegen, Stitching-Via direkt neben der Signal-Via, Flanken verlangsamen,
  Eingangskondensator nah und auf derselben Lage, Schaltknotenfläche klein halten, keine Stubs an
  Takten, Bootstrap-Widerstand zum Verlangsamen: alle im Einklang mit der Literatur (Ott, TI
  SLYT682, LearnEMC).
- Keine der bekannten Mythen gefunden (20H-Regel, Sternpunkt-Masse, 90°-Ecken, Guard-Traces,
  Ferrite überall).

## Quellen

- LearnEMC (T. Hubing): Introduction to Electromagnetic Radiation,
  https://learnemc.com/electromagnetic-radiation
- LearnEMC: The Most Important EMC Design Guidelines,
  https://learnemc.com/the-most-important-emc-design-guidelines
- C. R. Paul: A comparison of the contributions of common-mode and differential-mode currents in
  radiated emissions, IEEE TEMC 31 (1989) 189–193, https://ieeexplore.ieee.org/document/18789/
- D. M. Hockanson, J. L. Drewniak, T. H. Hubing et al.: Investigation of fundamental EMI source
  mechanisms driving common-mode radiation from printed circuit boards with attached cables,
  IEEE TEMC 38(4), 1996; Publikationsliste https://cecas.clemson.edu/cvel/emc/expert_systems/PCB/pcb_es_pubs.html
- H. Shim, T. Hubing: Model for Estimating Radiated Emissions From a Printed Circuit Board With
  Attached Cables Due to Voltage-Driven Sources, IEEE TEMC 2005,
  https://www.researchgate.net/publication/3056826_Model_for_Estimating_Radiated_Emissions_From_a_Printed_Circuit_Board_With_Attached_Cables_Due_to_Voltage-Driven_Sources
- ROHM TechWeb: Differential (Normal) Mode Noise and Common Mode Noise,
  https://micro.rohm.com/en/techweb/knowledge/emc/s-emc/01-s-emc/6899
- BS EN 55032:2015+A11:2020 (CISPR 32), Anhang A,
  https://nobelcert.com/DataFiles/FreeUpload/BS%20EN%2055032-2015%20plus%20Cor2016%20plus%20A11-2020.pdf
- EN 55032 Klasse B, Übersicht: https://emccalc.com/limits/en55032-class-b-re/
- D. Hoolihan: Applying the new CISPR 32 (IEEE CTX EMC Society, 2013),
  https://site.ieee.org/ctx-emcs/files/2015/04/2013_02_13-Presentation.pdf
- CISPR 11:2009+A1:2010, Leseprobe,
  https://cdn.standards.iteh.ai/samples/15070/2cded154aefd4da09343d754b7778721/CISPR-11-2009.pdf
- CISPR 14-1:2016, Leseprobe (Inhaltsverzeichnis),
  https://cdn.standards.iteh.ai/samples/21114/22098bc572fe44798a4979c30766f95b/CISPR-14-1-2016.pdf
- 47 CFR §15.109, https://www.law.cornell.edu/cfr/text/47/15.109
- 47 CFR §15.35, https://www.law.cornell.edu/cfr/text/47/15.35
- 47 CFR §15.31, https://www.law.cornell.edu/cfr/text/47/15.31
- T. Hegarty (TI): Reduce buck-converter EMI and voltage stress by minimizing inductive
  parasitics, Analog Applications Journal 3Q 2016, https://www.ti.com/lit/pdf/slyt682
- B. Archambeault: PCB Power Decoupling Myths Debunked (2012),
  https://ewh.ieee.org/r3/enc/emcs/archive/2012-10-10b_DecouplingMyths.pdf
- Effects of Plane Splits on High-Speed Signals, Part 1, PCD&F,
  https://www.pcdandf.com/pcdesign/index.php/2007-archive-articles/2236-effects-of-plane-splits-on-high-speed-signals-part-1
- Effect of stitching capacitor distance for critical traces crossing split reference planes,
  https://www.researchgate.net/publication/4037266_Effect_of_stitching_capacitor_distance_for_critical_traces_crossing_split_reference_planes
- Tektronix: Understanding and Performing USB 2.0 Physical Layer Testing,
  https://download.tek.com/document/55W-15027-4%20USB%202.0%20Physical%20Layer%20Testing_0.pdf
- USB communications, https://en.wikipedia.org/wiki/USB_communications
- Skin effect, https://en.wikipedia.org/wiki/Skin_effect
- H. W. Ott: Electromagnetic Compatibility Engineering, Wiley 2009 (Kap. 12: Gegentakt- und
  Gleichtaktabstrahlung).
