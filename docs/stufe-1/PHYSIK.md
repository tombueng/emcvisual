# Stufe 1: Physikalisches Modell

Stand: 2026-10-04. Dieses Dokument beschreibt, was die Simulation rechnet, unter welchen
Annahmen, und wo sie aufhört zu gelten. Jede Formel hier hat eine Entsprechung im Code
(`src/physics/…`) und, wo möglich, einen Test gegen eine analytische Lösung.

Koordinaten: Rechnung im **Welt-Koordinatensystem** (rechtshändig, three.js-Konvention):
X = KiCad-x, Y = Höhe (oben positiv, Y = 0 in der Mitte der F.Cu-Kupferlage), Z = KiCad-y.
Der Wechsel von KiCads linkshändigem (x, y nach unten) System ist eine Spiegelung; Beträge
ändern sich dadurch nicht, Feldrichtungen werden dadurch korrekt rechtshändig. Längen intern
in mm, Formeln unten in SI; die Umrechnung steckt im Kernel.

---

## 1. Größen und Einheiten

| Größe | Einheit | Anzeige |
|---|---|---|
| Magnetische Feldstärke H | A/m | dBµA/m = 20·log10(H / 1 µA/m) |
| Elektrische Feldstärke E (M8, Fernfeld) | V/m | dBµV/m |
| Strom einer Spektrallinie | A | dBµA |
| Sondenspannung (Schleifensonde) | V | dBµV |

**Alle Linienamplituden werden als Effektivwert (RMS) angezeigt**, wie auf einem
Spektrumanalysator, der eine Sinuslinie mit dem Spitzendetektor kalibriert als Effektivwert
darstellt. Fourier-Koeffizienten (Scheitelwerte) werden dafür durch √2 geteilt.

## 2. Gültigkeit der Quasistatik

Das Modell vernachlässigt die Laufzeit zwischen Quelle und Feldpunkt. Der Phasenfehler ist
k·r = 2π·r/λ. Für k·r ≤ 0,3 (≈ 17°) ist der Betragsfehler klein. Daraus:

    f_qs = 0,3 · c0 / (2π · r_max)

Mit r_max = Abstand Quelle–Feldpunkt, im Gitter etwa 20 mm: **f_qs ≈ 700 MHz**. Darüber zeigt
das Bild weiterhin, *wo* die Quellen sitzen, aber die Beträge in größerem Abstand werden
unzuverlässig. Die App blendet f_qs für das aktuelle Gitter ein.

Zweite Annahme: **elektrisch kurze Leitungen** (konzentrierte Betrachtung). Eine Leitung der
Länge L ist kurz, solange

    L < λ_eff / 10   ⇔   f < f_kurz = c0 / (10 · L · √εeff)

Beispiel: L = 40 mm, εeff = 3,3 → f_kurz ≈ 410 MHz. Darüber bilden sich stehende Wellen,
die Stufe 1 nicht abbildet (Stufe 2). Die App zeigt f_kurz je Quelle an.

## 3. Signale und ihre Spektren

### 3.1 Trapez-Signal
Periodisches Trapez mit Amplitude A, Periode T = 1/f0, Pulsbreite τ (bei 50 %), gleichen
Anstiegs- und Abfallzeiten t_r. Einseitige Fourier-Koeffizienten (Scheitelwerte), n ≥ 1
(Paul, *Introduction to EMC*, Kap. 3):

    c_n = 2·A·(τ/T) · |sinc(n·π·τ/T)| · |sinc(n·π·t_r/T)|,     sinc(x) = sin(x)/x
    c_0 = A·τ/T

Hüllkurve: flach bis f1 = 1/(π·τ), dann −20 dB/Dekade, ab f2 = 1/(π·t_r) −40 dB/Dekade.
**Die Anstiegszeit bestimmt die Oberwellen oberhalb f2**, daher ist sie der wichtigste
Parameter für EMV.

Tastgrad d = τ/T. Für d = 0,5 verschwinden die geraden Oberwellen (sinc(nπ/2) = 0 für
gerades n).

### 3.2 Datensignale
Zufällige Daten haben ein kontinuierliches Spektrum. Stufe 1 rechnet konservativ mit dem
ungünstigsten Muster 1010…, also einem Takt mit f0 = Bitrate/2 und d = 0,5. Kennzeichnung
in der Oberfläche: „Daten (Worst-Case-Muster)“.

### 3.3 Linienliste
Für jede Quelle werden die Linien n·f0 bis f_max (Standard 1 GHz, einstellbar bis 6 GHz)
erzeugt. Linien unter −80 dB relativ zur stärksten werden verworfen. Hat ein Signal mehr als
4096 Oberwellen bis f_max (langsame Signale), wird jede k-te Linie behalten (k ungerade) und
mit √k skaliert: Die Leistung in jedem Band bleibt erhalten, die Hüllkurve reicht bis f_max.

## 4. Leitungsparameter

### 4.1 Mikrostreifen (Außenlage über Fläche)
Hammerstad/Jensen (vereinfachte Form), w = Breite, h = Abstand zur Fläche, εr des Dielektrikums:

    w/h ≤ 1:  εeff = (εr+1)/2 + (εr−1)/2 · [ (1 + 12h/w)^−½ + 0,04·(1 − w/h)² ]
              Z0   = 60/√εeff · ln(8h/w + w/(4h))
    w/h ≥ 1:  εeff = (εr+1)/2 + (εr−1)/2 · (1 + 12h/w)^−½
              Z0   = 120π / ( √εeff · (w/h + 1,393 + 0,667·ln(w/h + 1,444)) )

Kapazität und Induktivität je Länge:

    C' = √εeff / (c0 · Z0)        L' = Z0 · √εeff / c0

Prüfwert: εr = 4,4, w/h ≈ 1,9 → Z0 ≈ 50 Ω (Test).

### 4.2 Streifenleiter (Innenlage zwischen zwei Flächen)
IPC-2141, Abstand der Flächen b, Kupferdicke t, gültig für w/b < 0,35:

    Z0 = 60/√εr · ln( 4b / (0,67·π·(0,8w + t)) ),      εeff = εr

Unsymmetrische Lage: b = h1 + h2 + t (Näherung).

### 4.3 Kein Bezug
Ohne Fläche ist Z0 nicht definiert. Ersatzannahme C' = 50 pF/m (typisch für eine Leitung
über entferntem Bezug), sichtbar als Warnung „kein Bezug“.

## 5. Stromverteilung je Quellentyp

Jede Quelle liefert (a) eine **Stromgeometrie**: gerade Stromelemente mit relativen Gewichten
g_e (bezogen auf einen Referenzstrom von 1 A), und (b) ein **Linienspektrum** I_k des
Referenzstroms. Das Feld ist dann H_s(r, f_k) = I_k · h_s(r), wobei h_s das Feld der
Geometrie für 1 A ist (§6).

### 5.1 Signal mit kapazitiver Last (Standard für kurze CMOS-Leitungen)
Der Treiber lädt die Leitungs- und Eingangskapazitäten um. Mit dem Spannungsspektrum V_k:

    I_k = 2π·f_k · C_ges · V_k

Verteilung im Netz: Netzgraph als Baum ab dem Treiber-Pad (bei Maschen: kürzeste-Wege-Baum).
Jede Kante e hat die Leitungskapazität C_e = C'·Länge, die je zur Hälfte ihren Endknoten
zugeschlagen wird (π-Ersatzschaltung). Last-Pads erhalten zusätzlich C_last (Standard 5 pF
je Empfänger, einstellbar). Damit:

    C_Knoten(n) = Σ_(e an n) C_e/2 + C_last(n)
    g_e         = C_Teilbaum(Kind von e) / C_ges

An jedem Knoten fließt der Verschiebungsstrom C_Knoten(n)/C_ges **senkrecht zur Bezugsfläche**
(ein vertikales Stromelement vom Knoten zur Fläche). Am Treiber kommt der Gesamtstrom aus
der Fläche (über den GND-Pin) zurück. So ist die Stromverteilung quellenfrei (∇·J = 0), was
Biot-Savart für ein physikalisch sinnvolles Feld braucht.

### 5.2 Signal mit Abschluss (lange oder terminierte Leitung)
Strom längs des Pfads Treiber → Abschluss-Pad konstant:

    I_k = V_k / Z0

Z0 als längengewichtetes Mittel über den Pfad. Vertikale Elemente nur an Treiber und Abschluss.
Abzweige tragen keinen Strom (Näherung).

### 5.3 Mehrere Netze in einer Quelle
Ein Takt läuft oft über einen Serienwiderstand (Netz „CLK_R“ → R → „CLK“). Eine Quelle darf
mehrere Netze enthalten; Zweipol-Bauteile mit je einem Pad in zwei Netzen der Quelle werden
als Brücke (gerade Verbindung der Pad-Mitten) behandelt.

### 5.4 Stromschleife (Schaltregler)
Die Schleife wird als geordnete Folge von Pads angegeben, z. B. für den heißen Kreis eines
Abwärtswandlers: C_in+ → U.VIN, (im IC) → U.GND → C_in−, (im Kondensator) zurück.
- Zwischen zwei Pads **desselben Netzes**: kürzester Weg über das Kupfer des Netzes
  (Dijkstra über den Netzgraph, Vias mit kleiner Strafe; durch Zonen als gerade Linie).
- Zwischen zwei Pads **desselben Bauteils**: gerade Linie (Strompfad im Bauteil).
- Strom: Trapez mit Spitzenstrom I_pk, Frequenz f_sw, Tastgrad D, Schaltzeit t_r.
- Teile des Wegs, die **in einer Flächenlage des eigenen Netzes** liegen (Rückweg durch die
  GND-Fläche), werden nicht als eigene Elemente geführt: Bei hohen Frequenzen fließt dieser
  Rückstrom unter dem Hinweg, und genau das bildet die Spiegelung (§8) ab.

### 5.5 Differenzpaar
Zwei Netze P und N mit demselben Signal, Gewichte +1 und −(1 − ε). ε ist die Unsymmetrie
(Standard 5 %); daraus entsteht der Gleichtaktanteil. Lastmodell wie §5.1 oder §5.2 (je Netz).

## 6. Linearität und Komposition

Die Feldgleichungen sind linear. Weil die Gewichte g_e nicht von der Frequenz abhängen, ist
das räumliche Muster h_s(r) (Vektor, für 1 A) je Quelle **frequenzunabhängig**. Es wird
einmal pro Quelle und Geometrie gerechnet; danach:

    |H_s(r, f_k)| = |I_s,k| · |h_s(r)|

**Innerhalb einer Quelle** addieren sich die Beiträge der Elemente vektoriell (kohärent),
das steckt in h_s. **Zwischen Quellen** wird die Leistung addiert, weil unabhängige
Oszillatoren nicht phasenstarr sind und ihre Linien ohnehin selten zusammenfallen:

    |H(r)|² = Σ_s  w_s · |h_s(r)|²,      w_s = Σ_(k ∈ Auswahl) |I_s,k|²

Auswahl: eine einzelne Linie, ein Band (Leistungssumme der Linien im Band, z. B.
CISPR 30–230 MHz) oder das ganze Spektrum. Gespeichert wird je Quelle nur |h_s|² als
Float32-Volumen; die Komposition ist eine gewichtete Summe und dauert Millisekunden.

## 7. Biot-Savart für ein gerades Stromelement

Für einen Faden von A nach B mit Strom I, Feldpunkt P, R_a = P − A, R_b = P − B,
R_a = |R_a|, R_b = |R_b|, L = |B − A|, ê = (B − A)/L (Hanson/Hirshman 2002):

    H(P) = I/(4π) · (ê × R_a) · 2L·(R_a + R_b) / ( R_a·R_b·((R_a + R_b)² − L²) )

Prüfung: Punkt im Abstand d von der Mitte, L → ∞ ergibt H = I/(2π·d) (Test).

**Kernregularisierung:** Der Faden ist eine Idealisierung; nahe am Leiter divergiert 1/d.
Mit dem senkrechten Abstand d⊥ = |ê × R_a| und dem Kernradius a (halbe Leiterbreite,
mindestens die Kupferdicke; bei Vias der Bohrradius):

    d⊥ < a:  H ← H · (d⊥/a)²

Das entspricht dem Feld im Inneren eines runden Leiters (∝ d) und hält die Werte endlich.
Sehr breite Leiter (w > 2 Gitterabstände) werden in mehrere parallele Fäden zerlegt.

## 8. Bezugsflächen, Spiegelung und Abschirmung

### 8.1 Flächen erkennen
Eine Kupferlage ist eine **Flächenlage** für Netz N, wenn die gefüllten Zonen von N mindestens
15 % der Platinenfläche dieser Lage bedecken (Flächeninhalt der `filled_polygon` per
Gaußscher Trapezformel; KiCad speichert Löcher als Keyhole, die Formel zieht sie korrekt ab).
Flächen anderer Netze ab 5 % auf derselben Lage zählen mit (geteilte Flächen), und jede Zelle
kennt ihr Netz, damit Trennlinien als Lücke erkannt werden. Die Schwelle ist bewusst niedrig:
Wo Kupfer unter einer Leitung liegt, ist es ihr Bezug, auch wenn es nur einen Teil der Platine
bedeckt (etwa eine analoge Masse unter dem Audioteil); das Raster sagt, wo. Übersteuerbar je
Lage. Jede Flächenlage wird auf ein feines Raster (0,1–0,25 mm) gebracht (Scanline-Füllung);
Bedeckungsabfragen sind dann O(1). Löcher bis 2,5 mm größter Ausdehnung (Via- und
Pin-Freistellungen) zählen als Kupfer, Schlitze zählen nach ihrer Länge.

### 8.2 Spiegelung
Eine ideal leitende Ebene bei y = y_F wird für den Halbraum der Quelle durch einen
Spiegelstrom ersetzt (Spiegelpunkt y' = 2·y_F − y). Mit der Spiegelung R am Ort gilt für die
Stromdichte J' = −R(J):
- **tangentiale** (waagerechte) Ströme: Spiegel mit **umgekehrter** Richtung,
- **normale** (senkrechte) Ströme: Spiegel mit **gleicher** Richtung.

Im Code werden die Endpunkte gespiegelt und das Gewicht negiert; das ergibt beide Regeln
zugleich (das Spiegeln der Endpunkte dreht die senkrechte Richtung bereits um).

Für eine Leiterbahn über einer Fläche ist der Spiegelstrom genau das Feld des Rückstroms, der
sich bei hohen Frequenzen unter der Leitung sammelt (Verteilung ∝ 1/(1 + (x/h)²), Johnson,
*High-Speed Digital Design*). Für eine flach liegende Schleife bildet er die Wirbelströme ab,
die das Feld über einer Fläche schwächen.

### 8.3 Lokale Bedeckung
Für jedes waagerechte Element wird in Schritten von 0,25 mm geprüft, ob die nächste
Flächenlage in Richtung Bezug dort Kupfer hat. Wo nicht, sucht das Modell die nächste
weiter entfernte Flächenlage, die Kupfer hat, oder lässt den Spiegel weg (freie Schleife).
Das Element wird an solchen Wechseln geteilt. Lücken kürzer als 1 mm (Via-Freistellungen)
werden überbrückt. Senkrechte Elemente (Vias) werden an jeder Flächenlage geteilt; weil ein
Via in der Freistellung (Loch) der Fläche sitzt, zählt für sie Kupfer im Umkreis von 0,8 mm.

Damit wird ein Schlitz unter einer Taktleitung als **größere Schleife** (Spiegel in der
entfernteren Fläche) sichtbar. Der tatsächliche Umweg des Rückstroms um den Schlitz herum
wird nicht berechnet (Stufe 2), aber als Warnung gemeldet.

### 8.4 Abschirmung
Ein Feldpunkt P erhält von Element E keinen Beitrag, wenn zwischen der Höhe von E und der
Höhe von P eine Flächenlage liegt, die **an der Stelle von P** Kupfer hat. Umsetzung ohne
Mehraufwand im inneren Schleifenkörper: Die Flächenlagen teilen die Höhe in „Fächer“
(Slots); jedes Element gehört zu einem Fach; je Gitterspalte gibt eine Bitmaske an, welche
Flächen dort Kupfer haben. Ein Elementpaket desselben Fachs wird für einen Punkt komplett
übersprungen, wenn eine bedeckende Fläche zwischen den Fächern liegt. Spiegelelemente gelten
nur im Halbraum ihres Originals und tragen dessen Fach.

Außerhalb des Platinenumrisses gibt es keine Flächen, also keine Abschirmung: Das Feld
„quillt“ an den Kanten heraus, was qualitativ dem Kantenstreufeld entspricht.

## 9. Virtuelle Sonde

Am Sondenort P wird h_s(P) **exakt** (ohne Gitter) per Biot-Savart über alle Elemente einer
Quelle berechnet. Spektrum: |H(P, f_k)| = |I_s,k| · |h_s(P)|, Summe über Quellen als
Leistungssumme je Frequenz. Anzeige wahlweise:
- |H| (isotrope Sonde, wie eine dreiachsige Sonde),
- eine Komponente H_x, H_y, H_z (gerichtete Schleifensonde),
- Sondenspannung einer Schleife mit Radius a: U = 2π·f·µ0·π·a²·H_n (ideal, Leerlauf).

## 10. E-Feld (optional, M8)

Quasistatisch aus Linienladungen q' = C'·V_k längs der Leitung mit Spiegelladung −q' unter
der Fläche; geschlossene Formel für das Feld einer endlichen Linienladung. Liefert die
Schaltknoten (SW) und Hochspannungsflanken, die im H-Feld unauffällig sind.

## 11. Fernfeld-Orientierung

Für elektrisch kleine Strukturen ist das magnetische Dipolmoment der vollständigen,
quellenfreien Stromverteilung maßgeblich. Der Rückstrom liegt dafür **in der Fläche selbst**,
nicht in der Spiegeltiefe (2026-10-05, Fachreview Nr. 2): Spiegelung ersetzt eine Fläche nur
für das Feld über einer Fläche, die viel größer ist als der Abstand (Nahfeld). Für das
Fernfeld ist eine Platinenfläche bei 30–300 MHz viel kleiner als λ; es zählt der wirkliche
Rückstrom, eine Leiterbahn in Höhe h über der Fläche spannt h·L auf, nicht 2·h·L
(`packWithImages(…, { imageAt: 'plane' })`, `farMoment()`):

    m = ½ · Σ_e  g_e · (A_e × B_e)          [A·m² je A Referenzstrom]

Freiraum-Fernfeld in Hauptstrahlrichtung (Jackson, magnetische Dipolstrahlung):

    E = η0 · k² · |m| / (4π·r) = 1,316·10⁻¹⁴ · f² · |m| / r        [V/m]

Messplatz mit leitendem Boden: Faktor 2 im ungünstigsten Fall (Ott, *EMC Engineering*,
Gl. 12-2: E = 263·10⁻¹⁶ · f²·A·I / r, A die wirkliche Schleifenfläche). Angezeigt wird E in
3 m und 10 m gegen den gewählten Grenzwert (standards.ts). An einer Stufe zwischen zwei
Bändern gilt der strengere Wert (CISPR 32 Anhang A, CISPR 11 §6.1, 47 CFR §15.109): Eine
Linie auf genau 230 MHz oder 1 GHz wird mit dem niedrigeren verglichen. Bei 30 MHz in 3 m ist
k·r ≈ 1,9; deshalb rechnet die App das Induktionsglied des Dipols mit (Faktor √(1 + 1/(k·r)²),
+2,1 dB bei 20 MHz, +1,1 dB bei 30 MHz, über 50 MHz vernachlässigbar).

Eigenschaften, die das Modell wiedergibt: Eine flache Schleife über einer Fläche hat ein
senkrechtes Moment, das der Rückstrom in der Fläche fast aufhebt (dann zeigt die App keine
Fernfeld-Zahl, `dipoleCompensated`, sondern bewertet die Schleifenfläche); eine Leiterbahn
mit Rückstrom in der Fläche bildet eine senkrechte Schleife der Fläche h·L.

**Grenzen:** Das ist die Gegentakt-Abstrahlung der Platine allein. Prüfungen scheitern meist
an Gleichtaktströmen (auf Kabeln, aber auch über den Spannungsabfall an der Fläche und die
Kopplung an Kühlkörper und Gehäuse; Paul 1989, Hockanson/Hubing 1996); die rechnet das Modell
nicht, und sie übertreffen die Gegentaktabstrahlung oft um 20 dB und mehr. Ab einer
Strukturgröße von etwa λ/4 gilt die f²-Formel nicht mehr (keine Sättigung, keine Resonanz);
die App kennzeichnet diesen Bereich im Spektrum nicht, die Erklärung eines Hinweises warnt,
wenn die stärkste Linie dort liegt.

## 11b. Gleichtakt mit Kabeln (Abschätzung, ungünstigster Fall)

`src/physics/commonMode.ts`, nach dem EMV-Expertensystem der Clemson University
(Grid Point Voltage Algorithm, Current-Driven Common-Mode Radiation Algorithm; Hockanson,
Drewniak, Hubing u. a., IEEE TEMC 1996/1997). Der Rückstrom einer Leitung über der Fläche
erzeugt eine Spannung zwischen den beiden Flächenhälften links und rechts der Leitungsmitte:

    L_p = (4/π²) · µ0 · l · h / (d1 + d2),     V = ω · L_p · I

(l Abstand der Leitungsenden, h Höhe über der Fläche, d1 + d2 Platinenbreite quer zur Leitung
an ihrer Mitte). Kabelstecker auf beiden Seiten: resonantes Kabelpaar, E ≈ 2·√(30/100)·V/3 m
= 0,365·V. Stecker nur auf einer Seite: Kabel gegen die Platine, begrenzt durch deren
Eigenkapazität C_B ≈ 8·ε0·√(A/π) (Scheibe gleicher Fläche; die Clemson-Zusammenfassung
schreibt ε0·A, das ist dimensional so nicht gemeint). Kein Stecker erkannt: ein
Versorgungskabel wird angenommen. Gemeldet wird ab 6 dB unter dem Grenzwert.

Prüfung: Das Rechenbeispiel aus docs/research/EMV-FEHLERKATALOG.md (50 mm Takt, h = 0,21 mm,
60 mm Platinenbreite, 7 mA bei 75 MHz) ergibt L_p = 0,089 nH, 0,29 mV und 40,6 dBµV/m
(`tests/commonMode.test.ts`).

Grenzen (in der App bei jedem Befund genannt): Resonanz bei jeder Frequenz angenommen, daher
eher zu hoch; keine Lücken in der Fläche (die erhöhen die Spannung), keine Differenzpaare,
keine Schaltregler-Schleifen, keine spannungsgetriebene Kopplung an Kühlkörper und Gehäuse,
keine Summe mehrerer Quellen. Ob ein Footprint ein Kabel trägt, wird aus Bibliothek und
Referenz geraten.

## 11c. Übersprechen auf Kabelleitungen (Abschätzung, ungünstigster Fall)

`src/physics/ioCoupling.ts`, nach dem Clemson-Algorithmus „Radiation by I/O Coupling“. I/O-Netze
sind Netze mit einem Pin an einem Kabelstecker (auch einen Serienwiderstand oder Ferrit weiter).
Für jedes parallele Stück einer schnellen Leitung (Winkel unter 15°, Abstand unter 15·h bzw.
3 mm, gleiche Lage oder keine Fläche dazwischen):

    M = µ0/(4π) · ln(1 + 4h²/s²),  C_m = M · C / L
    V_mag = ω · M · I · l,  V_elec = ω · C_m · V · l · 100 Ω,  V_n = max(Σ V_mag, Σ V_elec)
    E = 40 · V_n / Z_ant  (3 m),  Z_ant = min(800 Ω, 80 · (N + 1)),  geschirmter Stecker 800 Ω

(N Massepins des Steckers). Gemeldet ab 6 dB unter dem Grenzwert. Grenzen: schwache Kopplung,
resonantes Kabel, Teilbeiträge phasengleich addiert (eher zu hoch), Filter am Stecker und die
Last der I/O-Leitung (100 Ω angesetzt) nicht berücksichtigt.

## 11d. Platinenregeln ohne Quelle

`src/physics/layoutRules.ts`, Regeln aus dem Fehlerkatalog, ohne Feldrechnung und mit fester
Priorität je Regel:

- **Filter weit vom Stecker** (K-18): Reihenbauteil (R, L, FB, kein Pull-up/-down) oder
  Kondensator nach Masse auf einer Steckerleitung (einen Reihenteil weiter), mehr als 10 mm vom
  Steckerpin; ein Befund je Pin.
- **Filterkondensator ohne kurze Masse** (K-18): Massepad nicht in einer Massefläche seiner
  Lage und die nächste Masse-Via weiter als 3 mm.
- **Steckerschirm offen / schlecht angebunden** (K-20): Pads S*, SH*, SHIELD, MP ohne Netz oder
  ohne weitere Verbindung (hohe Priorität); angeschlossen, aber Fläche oder Via weiter als 3 mm.
- **Entkopplung** (K-24): je IC mit mindestens fünf Pins der schlechteste Versorgungspin; kein
  Kondensator nach Masse im Umkreis von 20 mm, oder der nächste weiter als 5 mm. Die
  Anschlussinduktivität ist grob geschätzt: Leitungsinduktivität der Strecke plus 1 nH für
  Gehäuse und Vias (Clemson).

Die Abstände sind Luftlinien, nicht Leitungswege; ob ein Bauteil als Filter gemeint ist und ob
ein Footprint ein Kabel trägt, wird aus Referenz, Netz und Bibliothek geraten.

### 11.1 Abgleich mit der Vollwelle (2026-10-05)

Testplatine `vertical-loop` (60 × 40 mm, zwei Lagen, 1,6 mm, Massefläche unten): 40 mm Leitung
oben, an beiden Enden über eine Via an die Fläche, angeregt mit einem Port am einen Ende. Fernfeld
in 3 m je Ampere Port-Strom, openEMS (FDTD, 0,5 mm Gitter, NF2FF, Bodenfaktor 2) gegen die schnelle
Rechnung (`tools/fullwave/validate-loop.ts`):

| f / MHz | Vollwelle | schnell (Rückstrom in der Fläche) | Differenz | früher (Spiegeltiefe) |
|---|---|---|---|---|
| 20 | 52,2 | 49,7 | −2,5 | +3,5 |
| 29 | 56,0 | 54,9 | −1,1 | +4,9 |
| 41 | 60,6 | 60,5 | 0,0 | +6,0 |
| 83 | 71,8 | 72,4 | +0,6 | +6,7 |
| 169 | 85,1 | 84,7 | −0,4 | +5,6 |
| 344 | 97,9 | 97,0 | −0,9 | +5,1 |
| 491 | 105,4 | 103,2 | −2,3 | +3,8 |
| 701 | 115,6 | 109,3 | −6,3 | −0,2 |

(dBµV/m je A.) Zwischen 30 und 350 MHz stimmt die schnelle Rechnung auf ±1 dB; das alte
Spiegelmodell lag 5–7 dB zu hoch (Fachreview Nr. 2). Darunter fehlen noch 1–2,5 dB (genauere
Frequenzauflösung der Vollwelle bei langen Laufzeiten, Feldverteilung der Fläche). Darüber nähert
sich die Leitung ihrer eigenen Resonanz (kurzgeschlossene Leitung, λ/4 bei etwa 1 GHz), der Strom
ist nicht mehr gleichförmig, und die schnelle Rechnung liegt zu tief; genau dort erscheint in der
Erklärung der Vorbehalt „oberhalb der Grenze, bis zu der die Leitung elektrisch kurz ist“.
Das ist ein Abgleich an einer Struktur und keine Messung: Er prüft die Rechnung gegen eine
genauere Rechnung, nicht gegen die Wirklichkeit eines Messplatzes.

## 11a. Diagnose-Regeln

- **Rückstrompfad unterbrochen:** Unter einem waagerechten Stromelement fehlt auf der
  Bezugslage (nächste Flächenlage, bei Gleichstand die zur Platinenmitte) auf mindestens 1 mm
  Länge Kupfer. Nahe Hinweise derselben Quelle (8 mm) werden zusammengefasst.
- **Bezugswechsel:** Ein Via verbindet zwei Lagen, auf denen der Strompfad verläuft, und die
  an dieser Stelle nächsten Flächen gehören zu verschiedenen Netzen (z. B. GND → +3V3).
- **Fehlende Stitching-Via:** gleiche Netze, aber verschiedene Flächenlagen, und kein Via
  dieses Netzes, das beide Lagen verbindet, im Umkreis von 3 mm.
- **Elektrisch lang:** Die Quelle hat oberhalb von f_kurz (§2) noch Linien über −40 dB der
  stärksten.

## 12. Bekannte Grenzen von Stufe 1 (Zusammenfassung)

1. Keine Laufzeit- und Resonanzeffekte (Quasistatik, konzentrierte Leitungen).
2. Rückstrom immer direkt unter dem Hinweg; Umwege um Schlitze nur als Warnung.
3. Flächen als ideale Leiter. Für 35 µm Kupfer ist das ab etwa 10 MHz gut erfüllt (mehrere
   Skintiefen). Bei den Grundwellen von Schaltreglern (0,1–2 MHz, Skintiefe 50–210 µm) dringt
   das Magnetfeld teilweise durch die Fläche, und die Spiegelwirkung ist schwächer; das Modell
   zeigt dort hinter Flächen zu wenig Feld.
4. Keine Kabel, kein Gehäuse, keine Bauteil-Parasitics (ESL, Streufeld von Spulen).
5. Chip-interne Ströme nur über die angegebenen Pads.
6. Quellen untereinander inkohärent.

## 13. Literatur

- C. R. Paul, *Introduction to Electromagnetic Compatibility*, 2. Aufl., Wiley 2006.
- H. W. Ott, *Electromagnetic Compatibility Engineering*, Wiley 2009, Kap. 12.
- J. D. Jackson, *Classical Electrodynamics*, 3. Aufl., Wiley 1999, Kap. 5 und 9.
- S. L. Hanson, S. P. Hirshman, „Compact expressions for the Biot–Savart fields of a
  filamentary segment“, *Physics of Plasmas* 9 (2002) 4410.
- E. Hammerstad, Ø. Jensen, „Accurate Models for Microstrip Computer-Aided Design“,
  IEEE MTT-S 1980.
- IPC-2141A, *Design Guide for High-Speed Controlled Impedance Circuit Boards*.
- H. Johnson, M. Graham, *High-Speed Digital Design*, Prentice Hall 1993.
- E. Bogatin, *Signal and Power Integrity – Simplified*, 3. Aufl., 2018.
- CISPR 32:2015+A1:2019, Grenzwerte gestrahlte Störaussendung Klasse B.
