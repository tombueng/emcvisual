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
