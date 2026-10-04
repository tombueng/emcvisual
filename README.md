# emcvisual

> Arbeitstitel. Der Name steht nur in `branding.config.json` und lässt sich mit einem Skript
> ändern, siehe [docs/RENAMING.md](docs/RENAMING.md).

Elektromagnetische Felder einer Leiterplatte kann man nicht sehen. Dieses Werkzeug rechnet
sie aus einer KiCad-Platine aus und macht daraus eine **begehbare 3D-Welt mit Bild und Ton**:
Wo leuchtet es, wo brummt es, und was passiert, wenn die Flanke langsamer wird oder der
Eingangskondensator näher an den Schaltregler rückt?

Alles läuft im Browser. Die Platinendatei verlässt den Rechner nicht.

## Stand

**Stufe 1 in Arbeit:** quasistatische Simulation des magnetischen Nahfelds (Biot-Savart mit
Spiegelströmen in den Bezugsflächen), 3D-Darstellung, virtuelle Nahfeldsonde, Klang.
Plan und Fortschritt: [docs/stufe-1/PLAN.md](docs/stufe-1/PLAN.md).

Was später kommt (Flächenströme, Vollwelle mit openEMS, Messung mit einem 3D-Drucker als
Scanner, Handsonde, VR): [docs/ROADMAP.md](docs/ROADMAP.md).

## Loslegen

```bash
npm install
npm run dev
```

Dann im Browser „Demo-Platine“ wählen oder eine eigene `.kicad_pcb` (KiCad 6 bis 10) auf das
Fenster ziehen.

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Tests (Physik gegen analytische Lösungen, Parser gegen pcbnew-Referenzdaten) |
| `npm run check` | Typprüfung (TypeScript + Svelte) |
| `npm run build` | statische Seite nach `dist/` |
| `npm run demo-board` | Demo-Platine mit KiCad (pcbnew-Python) neu erzeugen |
| `npm run check:codename` | prüft, dass der Arbeitstitel nur an erlaubten Stellen steht |

## Was die Simulation kann und was nicht

Sie zeigt zuverlässig, **wo** Stromschleifen Felder erzeugen und wie sich Änderungen auswirken
(Schleifenfläche, Rückstrompfad, Flankensteilheit). Sie sagt **nicht** voraus, ob ein Gerät
eine EMV-Prüfung besteht: keine Resonanzen, keine Kabel, kein Gehäuse. Die Annahmen und
Grenzen stehen in [docs/stufe-1/PHYSIK.md](docs/stufe-1/PHYSIK.md).

## Dokumentation

- [docs/ROADMAP.md](docs/ROADMAP.md): Stufen und Abhängigkeiten
- [docs/stufe-1/PLAN.md](docs/stufe-1/PLAN.md): Ziele, Meilensteine, Abnahmekriterien
- [docs/stufe-1/PHYSIK.md](docs/stufe-1/PHYSIK.md): Modell, Formeln, Gültigkeit, Literatur
- [docs/stufe-1/ARCHITEKTUR.md](docs/stufe-1/ARCHITEKTUR.md): Aufbau der App
- [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md): Entscheidungen mit Begründung
- [docs/zukunft/](docs/zukunft/): Stufen 2 bis 5 und Querschnittsthemen

## Lizenz

Noch nicht festgelegt.
