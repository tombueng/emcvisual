# Entscheidungen

Nummeriert, mit Datum und Begründung. Neue Entscheidungen unten anhängen; überholte nicht
löschen, sondern als „ersetzt durch Nr. X“ markieren.

1. **2026-10-04 · Reine Browser-App ohne Backend.** Keine Installation, Platinendaten bleiben
   lokal, Bereitstellung als statische Seite (GitHub Pages). Teure Rechnungen kommen später
   über eine optionale lokale Brücke (Stufe 3), nicht über einen Cloud-Dienst.
2. **2026-10-04 · TypeScript + Vite + Svelte 5 + three.js.** Svelte für die Panels (wenig
   Laufzeit-Overhead, gut lesbar), three.js imperativ für die Szene, kein React-Three-Fiber.
   Vitest für Tests, weil es Vites Konfiguration teilt.
3. **2026-10-04 · Stufe 1 rechnet nur das H-Feld.** Es zeigt Stromschleifen, die häufigste
   EMV-Ursache auf Platinen; das E-Feld folgt als optionaler Meilenstein (M8).
4. **2026-10-04 · Feldmuster je Quelle frequenzunabhängig, Spektrum getrennt.** Ermöglicht
   Echtzeit-Änderungen ohne Neuberechnung (PHYSIK.md §6).
5. **2026-10-04 · Quellen untereinander inkohärent (Leistungssumme).** Unabhängige
   Oszillatoren sind nicht phasenstarr; innerhalb einer Quelle wird kohärent gerechnet.
6. **2026-10-04 · Rückstrom über Spiegelung mit lokaler Flächenbedeckung.** Einfach, schnell,
   physikalisch richtig für durchgehende Flächen; Aussparungen verschieben den Spiegel zur
   nächsten Fläche. Echte Umwege kommen in Stufe 2.
7. **2026-10-04 · Rechnung im rechtshändigen Weltsystem (X = x, Y = Höhe, Z = KiCad-y).**
   Vermeidet Vorzeichenfehler bei Kreuzprodukten; KiCads linkshändiges System wird beim
   Import gespiegelt.
8. **2026-10-04 · Alle Linienamplituden als Effektivwert.** Wie Spektrumanalysator und
   CISPR-Grenzwerte; vermeidet 3-dB-Verwechslungen.
9. **2026-10-04 · Arbeitstitel nur in `branding.config.json`.** Speicherschlüssel und
   Dateiformate namensneutral, CI prüft, dass der Name nirgends sonst steht (RENAMING.md).
10. **2026-10-04 · Dokumentation auf Deutsch, Code und Bezeichner auf Englisch.** Oberfläche
    über ein Wörterbuch, Deutsch zuerst, Englisch in M7.
11. **2026-10-04 · Repo zunächst privat.** Sichtbarkeit und Lizenz entscheidet der
    Projektinhaber (offene Fragen in stufe-1/PLAN.md §11).
12. **2026-10-04 · Schrift IBM Plex Sans lokal gebündelt** (@fontsource, nur Latin), keine
    Anfrage an Google Fonts: Die App verspricht, dass nichts den Rechner verlässt.
13. **2026-10-04 · Gestaltung als Messgerät:** Schiefer-Blau statt Schwarz (das Leuchten
    braucht einen dunklen Grund), Bernstein für das Feld, Cyan für die Sonde; das
    auffälligste Element ist der Spektrumanalysator mit Raster.
14. **2026-10-04 · Fernfeld als Orientierung im Analysator** (Modus „Fernfeld 3 m / 10 m“)
    statt als eigene Seite; Grenzlinien CISPR 32 B, Hinweis „ohne Kabel“ im Diagnose-Reiter.
15. **2026-10-04 · Feldlinien nur für die gewählte Quelle**, in einem eigenen Worker: Linien
    aller Quellen gleichzeitig wären unlesbar und teuer.
16. **2026-10-04 · Playwright-Tests in der CI**, Browser nur als Headless-Shell; WebGL läuft
    dort über SwiftShader.
17. **2026-10-04 · Oberfläche zweisprachig (Deutsch, Englisch)**, Standard nach Browsersprache;
    die Dokumentation bleibt auf Deutsch (ergänzt Nr. 10).
18. **2026-10-04 · Repo öffentlich, App auf GitHub Pages.** Lizenz noch offen (bis dahin gilt
    das Urheberrecht ohne Nutzungsrechte).
19. **2026-10-04 · Auffindbarkeit über echten Seitentext statt Keyword-Listen.** Ein statischer
    Einführungstext im HTML (für Crawler ohne JavaScript), strukturierte Daten, `llms.txt`,
    Sitemap und GitHub-Topics; das `keywords`-Meta-Tag ist nur Beiwerk (Google ignoriert es).
    Solange keine Lizenz gewählt ist, steht nirgends „open source“.
20. **2026-10-04 · Stufe 2 beginnt mit einem geometrischen Umwegmodell** statt mit dem
    PEEC-/FastHenry-Löser: Kürzeste Wege durchs Flächenkupfer und Sprünge über Stitching-Via
    oder Kondensator zeigen die typischen Rückstromfehler schon richtig und rechnen in
    Millisekunden; der Flächenlöser bleibt für die genaue Stromverteilung.
21. **2026-10-04 · Kleine Löcher in Flächen (bis 3 mm²) gelten als Kupfer** (Via-Freistellungen);
    Schlitze und Aussparungen bleiben Lücken.
22. **2026-10-04 · Stufe 4 beginnt mit einem virtuellen Prüfstand.** Drucker und Empfänger,
    die die Simulation „messen“, prüfen die ganze Kette (Plan, Registrierung, Fahrt, Sweep,
    Speichern, Vergleich) ohne Hardware; eine echte Messung lässt sich später direkt dagegen
    halten.
23. **2026-10-04 · Erste Hardware-Wege: OctoPrint-REST, G-Code über Web Serial, tinySA über
    Web Serial.** OctoPrint, weil der vorhandene Drucker daran hängt; Web Serial, weil es ohne
    Installation im Browser läuft. Der OctoPrint-API-Schlüssel wird nicht gespeichert.
24. **2026-10-04 · Messdateien zunächst als JSON** mit Rohspektren und Hintergrund; ein
    Binärformat erst, wenn die Größe stört.
25. **2026-10-04 · KiCad-Live-Kopplung zuerst über die Datei, nicht über die IPC-API.** Die File
    System Access API (Chromium) reicht, um auf jedes Speichern zu reagieren, ohne lokale Brücke
    und ohne Installation; die IPC-Brücke bleibt für Live-Änderungen ohne Speichern und den
    Rückweg nach KiCad.
26. **2026-10-04 · Stufe 3 zuerst als Offline-Workflow** (Job exportieren, lokal rechnen, Ergebnis
    laden) statt mit einer lokalen Brücke: keine dauerhaft laufende Software, keine offenen
    Ports, und das Ergebnis lässt sich weitergeben.
27. **2026-10-04 · Vollwellen-Ergebnisse je Ampere Port-Strom bei wenigen Frequenzen.** Die App
    multipliziert mit dem Stromspektrum ihres Quellenmodells. So bleibt das Spektrum
    interaktiv, und der Vergleich mit Stufe 1 trennt Feldverteilung und Quellenmodell.
28. **2026-10-04 · Schmale Leiterbahnen zusätzlich als dünne Drähte.** Bei Zellen von 0,5–1 mm
    fallen 0,2-mm-Bahnen und kleine Pads sonst durch das Gitter, und Schleifen bleiben offen.
29. **2026-10-04 · Eigenes Ergebnisformat (int16 centi-dB) statt HDF5 im Browser:** klein, ohne
    zusätzliche Bibliothek (h5wasm) lesbar, auf das Gitter der App umgerechnet.
30. **2026-10-04 · Lizenz 0BSD.** Der Projektinhaber wollte die freizügigste Lizenz. 0BSD erlaubt
    alles ohne Namensnennung und wirkt anders als Gemeinfreiheits-Erklärungen (Unlicense, CC0)
    auch dort, wo man auf das Urheberrecht nicht verzichten kann, etwa in Deutschland. Damit
    darf das Projekt „open source“ heißen (ergänzt Nr. 18 und 19).
31. **2026-10-04 · Hinweise nach ihrer Wirkung auf das Fernfeld ordnen.** Gemessen wird jeder
    Hinweis für sich gegen die Quelle mit idealen Rückwegen (Anteil am Dipolmoment), nicht durch
    Weglassen. Sortiert wird zuerst nach dem Abstand der Quelle zum Grenzwert, dann nach der
    Wirkung der Behebung: So steht oben, was eine Prüfung am ehesten rettet.
32. **2026-10-05 · Sprechblasen im Raum nur als Zusatz.** HTML-in-Canvas ist ein Origin Trial
    mit wechselnder API und nur in Chromium. Die HTML-Einblendung bleibt der Standard; die
    Blasen im Raum gibt es, wo der Browser es kann, und automatisch in VR.
