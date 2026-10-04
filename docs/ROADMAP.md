# Roadmap

Stand: 2026-10-04

## Die Idee

Elektromagnetische Störungen auf einer Platine sind unsichtbar. Dieses Werkzeug macht sie zu
einer **begehbaren 3D-Welt mit Bild und Ton**: Man sieht, wo das Feld herkommt, hört die
Takte und Schaltregler, und probiert Änderungen aus. Die Daten kommen erst aus einer
schnellen Simulation (reine Software), später aus genaueren Simulationen und aus Messungen
mit günstiger Hardware, alles in derselben Welt.

## Stufen

| Stufe | Inhalt | Art | Status | Dokument |
|---|---|---|---|---|
| **1** | Quasistatische Nahfeld-Simulation im Browser, PCB-World, Klang | Software | **umgesetzt** (M0–M7) | [stufe-1/PLAN.md](stufe-1/PLAN.md) |
| **2** | Rückströme in Flächen, Leitungseffekte, E-Feld | Software | **in Arbeit** (2a Umwegmodell fertig) | [zukunft/STUFE-2-FLAECHENSTROEME.md](zukunft/STUFE-2-FLAECHENSTROEME.md) |
| 3 | Vollwelle mit openEMS, Fernfeld, Kabel | Software (+ lokale Rechnung) | Idee | [zukunft/STUFE-3-VOLLWELLE.md](zukunft/STUFE-3-VOLLWELLE.md) |
| **4** | Messung: 3D-Drucker als Nahfeld-Scanner | Hardware + Software | **in Arbeit** (Scanner-Kette virtuell geprüft, Treiber für OctoPrint, G-Code und tinySA ungetestet) | [zukunft/STUFE-4-MESSUNG-SCANNER.md](zukunft/STUFE-4-MESSUNG-SCANNER.md) |
| 5 | Handsonde mit Ortung, Sonden-Array, Phase | Hardware + Software | Idee | [zukunft/STUFE-5-MESSUNG-ERWEITERT.md](zukunft/STUFE-5-MESSUNG-ERWEITERT.md) |
| W | Querschnitt: VR, Effekte, Klang, KiCad-Kopplung, Berichte | Software | Ideen | [zukunft/QUERSCHNITT-WELT-UND-INTEGRATION.md](zukunft/QUERSCHNITT-WELT-UND-INTEGRATION.md) |

## Abhängigkeiten

```
Stufe 1 ──┬──► Stufe 2 ──► Stufe 3
          │                  ▲
          ├──► Stufe 4 ──► Stufe 5
          │        └───────────┘ (Messung kalibriert Simulation, Ersatzquellen speisen sie)
          └──► Querschnitt W (jederzeit)
```

Stufe 1 legt die gemeinsamen Grundlagen: BoardModel, Gitter, Volumenformat, Darstellung,
Klang. Jede spätere Stufe liefert nur neue **Volumina** (mit Herkunft) oder neue
**Stromelemente**; Darstellung und Bedienung bleiben dieselben.

## Weitere Dokumente
- [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md): nummerierte Entscheidungen mit Begründung
- [RENAMING.md](RENAMING.md): Arbeitstitel und Plan für die spätere Umbenennung
