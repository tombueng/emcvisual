# Stufe 1: Architektur

Stand: 2026-10-04. Beschreibt den Aufbau der Browser-App. Physik: [PHYSIK.md](PHYSIK.md).

## 1. Leitlinien

1. **Rechenkern ohne DOM.** Alles unter `src/kicad`, `src/model`, `src/physics`,
   `src/compute` ist reines TypeScript ohne Browser-APIs (außer `compute/pool.ts`). Es läuft
   im Worker, in Vitest und später in einem WebGPU- oder Node-Backend gleich.
2. **Imperatives 3D, deklarative Oberfläche.** three.js-Szene als Klasse (`Viewer`), die
   Oberfläche in Svelte 5 ruft deren Methoden auf. Kein Framework im Render-Pfad.
3. **Teuer einmal, billig oft.** Geometrieabhängiges (Feldmuster je Quelle) wird gecacht;
   alles Spektrale ist Komposition in Millisekunden.
4. **Keine Namen im Code.** Der Projektname steht nur in `branding.config.json`; Speicher-
   schlüssel und Dateiformate sind namensneutral ([../RENAMING.md](../RENAMING.md)).
5. **Kein Netzwerk.** Platinendaten verlassen den Browser nicht; keine Telemetrie.

## 2. Verzeichnisstruktur

```
branding.config.json        Name, Anzeigename, Repo, Speicher-Namensraum
index.html                  Einstieg; Titel per Vite-Plugin aus dem Branding
src/
  main.ts                   bootet Svelte-App
  branding.ts               typisierter Zugriff auf branding.config.json
  i18n/                     de.ts (Quelle), en.ts, lang.svelte.ts (aktive Sprache, t-Proxy, fmtNum)
  kicad/
    sexpr.ts                Tokenizer + Parser → SNode-Baum
    parseBoard.ts           SNode → BoardModel (KiCad 6–10)
  model/
    pickIndex.ts            2D-Index: Kupfer unter einem Punkt (Hover, Pad-Auswahl)
    types.ts                BoardModel, Layer, Track, Via, Pad, Zone, Footprint, Net
    geometry.ts             Vektoren, Rotation, Polygone, Bögen, Punkt-in-Polygon
    stackup.ts              z-Lagen, Standardaufbauten, Dielektrika
    planes.ts               Flächenerkennung, Raster (Scanline), Bedeckung
    connectivity.ts         Netzgraph, Pfadsuche, Bäume
  physics/
    units.ts                dB-Umrechnung, Einheiten-Parser („25 MHz“)
    spectrum.ts             Trapez-Reihe, Linienlisten, Bänder
    lines.ts                Z0, εeff, C', L'
    sources.ts              Quellen-Typen (Szenario-Ebene)
    currents.ts             Quelle → Stromelemente + Spektrum
    images.ts               Spiegel, Bedeckungs-Zerlegung, Fächer
    biotsavart.ts           Kernel (Punkt), Feld einer Elementliste
    charges.ts, efield.ts   Stufe 2b: Ladungen aus C' und Spannung, quasistatisches E-Feld
    returnPaths.ts          Stufe 2a: Rückstrom-Umwege durch Flächen, Sprünge über Via/Kondensator
    farfield.ts             Dipolmoment, E in 3/10 m, CISPR-Grenzen
    diagnostics.ts          Rückstrom- und Bezugswarnungen
    suggest.ts              Quellen-Vorschläge aus Netznamen, Pin-Funktionen, Pin-Typen
  compute/
    grid.ts                 Gitterdefinition aus Umriss + Rand + Qualität
    fieldKernel.ts          Volumen |h|² für einen Gitterausschnitt (rein)
    field.worker.ts         Worker-Hülle um fieldKernel
    pool.ts                 Worker-Pool, Aufteilung, Fortschritt, Abbruch
    composer.ts             Σ w_s·|h_s|² → dB → Uint8-Volumen
    fieldlines.ts           RK4-Feldlinien (exakt), Startpunkte
    fieldlines.worker.ts    Worker-Hülle für Feldlinien
  render/
    viewer.ts               Szene, Kamera, Steuerung, Render-Schleife, Picking
    boardMesh.ts            Platinen-Geometrie aus BoardModel
    componentModels.ts      Bauteilmodelle aus KiCads GLB-Export (Knoten = Referenz, Meter → mm)
    volumePass.ts           Vollbild-Pass: Szene + Raymarching mit Tiefentextur
    slicePlane.ts           Heatmap-Ebene
    fieldLinesMesh.ts       Linien mit Fluss-Animation
    probeGizmo.ts           Sonde in 3D
    colormaps.ts            Inferno/Turbo (Polynom-Fits) als LUT
  audio/
    sonifier.ts             Web-Audio-Graph je Quelle
  fullwave/                 Stufe 3: openEMS
    job.ts                  Job-Export (Kupfer, Drähte, Vias, Ports, Lasten, Frequenzen, Gitter)
    result.ts               Ergebnisdatei, Frequenzgewichte, Abtasten, Umrechnen aufs Gitter
  scanner/                  Stufe 4: Nahfeld-Scanner (Drucker + Empfänger)
    types.ts                Positioner, Receiver, Messformat
    registration.ts         Platine ↔ Drucker (Kabsch, mit Spiegelung)
    plan.ts                 Raster, Schlangenlinie, Anheben über hohen Bauteilen
    runner.ts               Fahren, Warten, Sweeps mit Max-Hold, Abbruch
    probe.ts                Sondenmodell (H-Schleife, E-Stummel) ↔ dBm
    measurement.ts          Hintergrundabzug, Feldstärke, Schnitte, JSON-Format
    virtual.ts              virtueller Prüfstand (misst die Simulation)
    drivers.ts, webserial.ts  OctoPrint-REST, G-Code und tinySA über Web Serial
  state/
    app.svelte.ts           Anwendungszustand (Svelte-Runes)
    engine.svelte.ts        Orchestrierung: Platine, Quellen, Jobs, Komposition, Sonde, Export
    scenario.ts             Szenario-JSON: Typen, Validierung, Migration
    persist.ts              localStorage (try/catch), Download/Upload
    scanner.svelte.ts       Scanner-Steuerung: Geräte, Registrierung, Scan, Anzeige
  ui/
    App.svelte (Layout, Zeiger, Ton), SourcesPanel, SourceEditor, EngInput, NetInput,
    ViewPanel (Reiter Ansicht/Diagnose/Messung; unter 1100 px eine Schublade),
    DiagnosticsPanel, ScannerPanel, SpectrumPanel (Analysator, Sonde, Ton)
public/demo/                Demo-Platine + Szenario
tools/demo-board/           pcbnew-Skript für die Demo-Platine, Referenzdaten-Export
tools/openems/              run_job.py (Vollwelle, Stufe 3), README mit Einrichtung
tests/                      Vitest (Kern), fixtures/ (pcbnew-Referenzen)
e2e/                        Playwright-Smoke-Tests (WebGL über SwiftShader)
scripts/                    check-codename.mjs, rename.mjs
docs/                       Pläne, Physik, Architektur, Roadmap
```

## 3. Datenmodell (Auszug)

```ts
interface BoardModel {
  source: { fileName: string; hash: string; kicadVersion: number; generator: string };
  units: 'mm';
  thickness: number;                       // mm
  layers: CopperLayer[];                   // von oben nach unten
  dielectrics: Dielectric[];               // zwischen den Kupferlagen
  outline: Ring[];                         // geschlossene Ringe, größter = Außenkontur
  bbox: BBox2;
  nets: string[];                          // Index 0 = "" (kein Netz)
  tracks: Track[];                         // Segmente (Bögen bereits zerlegt, Ursprung vermerkt)
  vias: Via[];
  footprints: Footprint[];                 // mit pads[]
  zones: Zone[];                           // filled polygons je Lage
}
interface CopperLayer { name: string; index: number; y: number; thickness: number; kind: 'signal'|'power'|'mixed'|'jumper' }
interface Track { net: number; layer: number; a: Vec2; b: Vec2; width: number; arcId?: number }
interface Via   { net: number; at: Vec2; diameter: number; drill: number; fromLayer: number; toLayer: number }
interface Pad   { ref: string; number: string; net: number; at: Vec2; angle: number; shape: PadShape;
                  size: Vec2; layers: number[]; pinFunction?: string; pinType?: string; drill?: number }
interface Zone  { net: number; layer: number; polygons: Vec2[][] }   // Keyhole-Ringe
```

Szenario (Datei `*.scenario.json`, namensneutral):

```jsonc
{
  "kind": "pcb-field-scenario", "version": 1,
  "board": { "fileName": "demo-board.kicad_pcb", "hash": "sha256:…" },
  "settings": { "quality": "normal", "fMax": 1e9, "heightAbove": 12, "heightBelow": 6,
                "planeOverrides": { "In2.Cu": "+3V3" } },
  "sources": [
    { "id": "s1", "type": "signal", "name": "Takt 25 MHz", "enabled": true, "color": "#f59e0b",
      "nets": ["CLK_GOOD", "CLK_GOOD_R"], "driver": "Y1.3",
      "waveform": { "f0": 25e6, "duty": 0.5, "tr": 1e-9, "amplitude": 3.3 },
      "load": { "model": "capacitive", "cLoad": 5e-12 } },
    { "id": "s2", "type": "loop", "name": "Buck gut",
      "pads": ["C1.1", "U1.3", "U1.1", "C1.2"],
      "waveform": { "f0": 5e5, "duty": 0.3, "tr": 5e-9, "amplitude": 2.0 } },
    { "id": "s3", "type": "diffpair", "nets": ["USB_DP", "USB_DN"], "imbalance": 0.05, … }
  ],
  "view": { "mode": "band", "band": [30e6, 230e6], "dbWindow": [40, 120], … }
}
```

## 4. Rechen-Pipeline

```
BoardModel ─► planes.detect() ─► PlaneRaster[]            (einmal je Platine)
           ─► connectivity.build() ─► NetGraph je Netz     (lazy je Netz)
Source ─► currents.build(board, graphs, source) ─► { elements: Element[], spectrum: Line[] }
       ─► images.apply(elements, planes) ─► ElementPack (Float64Array, nach Fächern sortiert)
       ─► pool.computeVolume(pack, grid) ─► Float32Array |h|²   (Cache-Schlüssel: Geometrie-Hash)
Auswahl (Linie/Band/Gesamt) ─► composer.compose(volumes, weights) ─► Uint8Array + dB-Bereich
```

**Element** (gepackt als 8 Float64): ax, ay, az, bx, by, bz, Gewicht, Kernradius; dazu je Paket
das Fach (Slot). Spiegel werden beim Packen erzeugt, damit der Kernel keine Sonderfälle kennt.

**Worker-Protokoll:**
```
→ { type: 'volume', job, pack: Float64Array, slots: Int32Array, grid, cols: [z0, z1], shield }
← { type: 'progress', job, done }   ← { type: 'result', job, z0, z1, data: Float32Array }
```
Daten werden als Transferables übergeben. Abbruch: neue Job-Nummer; veraltete Ergebnisse
werden verworfen, laufende Worker bekommen `cancel` und prüfen zwischen Zeilen.

**Abschirmung im Kernel:** `shield.planeY[]`, `shield.cover: Uint32Array` (Bitmaske je
Gitterspalte), Fach je Elementpaket. Für einen Punkt wird zuerst das eigene Fach bestimmt,
dann je Paket per Bitmaske entschieden, ob es übersprungen wird.

## 5. Render-Pipeline

1. **Opaker Durchgang** in ein Render-Target mit Tiefentextur: Platine, Bauteile, Feldlinien,
   Sonde, Schnittebene, Hotspot-Marker.
2. **Vollbild-Kompositionspass:** liest Farbe und Tiefe des Render-Targets, rekonstruiert je
   Pixel den Sichtstrahl (inverse Projektions-/Kameramatrix), schneidet ihn mit der
   Volumen-Box, marschiert bis zur Szenentiefe (max. 384 Schritte, Startversatz per Hash),
   Transferfunktion: Farbskala aus 1D-LUT, Opazität aus Fensterposition (Gamma-Kurve),
   Vorne-nach-hinten-Komposition mit früher Beendigung.
3. **Volumentextur:** `Data3DTexture`, `RedFormat`, `UnsignedByteType`, lineare Filterung;
   Werte = normierte dB im Bereich [max − 100 dB, max]; das Fenster der Oberfläche wird als
   Uniform übergeben, also ohne Neu-Upload.
4. **Kamera:** OrbitControls; Ameisen-Modus (M7) als eigene Steuerung.

## 6. Audio-Graph

```
je Quelle: OscillatorNode(PeriodicWave aus |I_k|) ─► GainNode(Feld am Sondenort) ─► PannerNode(HRTF, Hotspot)
                                                                                    └─► Master-Gain ─► Kompressor ─► Ausgang
```
- Grundton: f_audio = κ · f0 mit κ einstellbar (Standard 25 MHz ↦ 220 Hz, κ = 8,8·10⁻⁶).
- PeriodicWave: Koeffizienten bis zur Audio-Grenze 16 kHz, höchstens 4096.
- Lautstärke: dB des Feldes am Sondenort, über das dB-Fenster auf −60…0 dBFS abgebildet,
  geglättet (`setTargetAtTime`).
- AudioContext erst nach Nutzerklick (Autoplay-Regel).

## 7. Oberfläche

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Name · Platine öffnen · Demo · Szenario ⤓⤒ · Qualität · Fortschritt          │
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ Quellen       │                                              │ Ansicht       │
│ + Vorschläge  │               3D-Ansicht                     │ Frequenz      │
│ Quelle 1 ◉ ♪  │      (Platine, Volumen, Sonde, Linien)       │ dB-Fenster    │
│ Quelle 2 ◉ ♪  │                                              │ Lagen         │
│ Editor …      │                                              │ Diagnose      │
├───────────────┴──────────────────────────────────────────────┴───────────────┤
│ Spektrum am Sondenort (dBµA/m über f) · Sondenhöhe · Ton an/aus · Lautstärke  │
└──────────────────────────────────────────────────────────────────────────────┘
```
Schmale Fenster: Panels einklappbar, 3D-Ansicht bleibt Hauptfläche.

## 7a. Sprache

`t` ist ein Proxy auf das Wörterbuch der aktiven Sprache (`i18n.lang`, Svelte-State), also
folgen Texte in Vorlagen der Sprache automatisch. Zahlen werden über `fmtNum` und `formatEng`
formatiert; damit auch sie umschalten, montiert `Root.svelte` die App bei einem Sprachwechsel
neu (`{#key i18n.lang}`). Die Engine hält Platine, Quellen und Volumina und hängt sich an den
neuen Viewer. Neue Texte kommen immer in beide Wörterbücher; `en: Strings` lässt TypeScript
fehlende Schlüssel melden.

## 7b. Auffindbarkeit (SEO, KI-Suche)

- `tools/vite/seo.ts` setzt beim Build Titel, Beschreibung, Keywords, Open Graph, Twitter Card,
  Canonical und JSON-LD (`SoftwareApplication`, `SoftwareSourceCode`) in `index.html` ein und
  erzeugt `robots.txt`, `sitemap.xml` und `llms.txt` (Kurzbeschreibung für KI-Crawler).
  Namen und URL kommen aus `branding.config.json`, die Texte aus `seo.config.json`.
- `index.html` enthält einen statischen Einführungstext (`#static-intro`) für Crawler und
  Besucher ohne JavaScript; `main.ts` entfernt ihn beim Start der App. Ein Playwright-Test
  prüft ihn mit abgeschaltetem JavaScript.
- Social-Preview `public/og-image.png` (1200 × 630) und `apple-touch-icon.png` erzeugt
  `tools/seo/make_images.py` aus dem Screenshot des Smoke-Tests.
- Search-Console-Bestätigung: Token in `seo.config.json` (`googleSiteVerification`,
  `bingSiteVerification`) eintragen, das Plugin setzt die Meta-Tags.

## 8. Zustand und Persistenz

- `state/app.svelte.ts`: `$state`-Objekte für Platine, Szenario, Ansicht, Rechenstatus.
  Effekte lösen gezielt aus: Geometrieänderung einer Quelle → Feldrechnung dieser Quelle;
  Spektrums- oder Ansichtsänderung → nur Komposition.
- `localStorage`-Schlüssel: `${storageNamespace}:scenario:${boardHash}`, jede Operation in
  try/catch; die App funktioniert ohne Speicher.
- Szenario-Dateien tragen `kind` + `version`; `migrate()` hebt alte Versionen an.

## 9. Tests

- `tests/*.test.ts` (Vitest, Node-Umgebung): Parser, Geometrie, Flächen, Konnektivität,
  Spektren, Leitungen, Biot-Savart, Spiegel, Komposition.
- `tests/fixtures/`: Testplatinen + pcbnew-Referenz-JSON (`tools/demo-board/export_reference.py`).
- Oberfläche: Playwright (`npm run e2e`): Demo laden, rechnen, Sonde, Diagnose, Fernfeld,
  Quellen bearbeiten, Feldlinien; keine Konsolenfehler. Läuft in der CI als eigener Job.

## 10. Erweiterungspunkte für spätere Stufen

- `compute/` hat eine Backend-Schnittstelle (`FieldBackend`): CPU-Worker heute, WebGPU (M8),
  importierte Volumina aus openEMS (Stufe 3) oder Messung (Stufe 4) später.
- `Source` → `Element[]` ist die Naht für Stufe 2: Ein Flächenlöser ersetzt die Spiegel durch
  berechnete Flächenströme, ohne Kernel und Darstellung zu ändern.
- Volumina tragen Metadaten (Herkunft: Simulation A/B/C, Messung), damit die PCB-World
  Simulation und Messung nebeneinander und als Differenz zeigen kann.
- Messungen (Stufe 4) erscheinen heute als Schnitte in Messhöhe (`viewer.setMeasurementSlices`);
  neue Geräte implementieren nur `Positioner` oder `Receiver` (`src/scanner/types.ts`).
