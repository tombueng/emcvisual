# Vollwelle mit openEMS (Stufe 3)

Die App rechnet im Browser quasistatisch (Stufe 1–2). Für Resonanzen und Abstrahlung löst
openEMS die Maxwell-Gleichungen im Zeitbereich (FDTD). openEMS läuft lokal, nicht im Browser:

1. In der App: rechter Bereich → „Ansicht“ → „Vollwelle (openEMS)“ → **Job exportieren**.
   Es entsteht `<platine>.openems-job.json` mit Lagenaufbau, Kupfer, Vias, einem Port je
   Quelle, den Frequenzen und dem Rechengitter der App.
2. Rechnen:

   ```bash
   tools/openems/.venv/bin/python tools/openems/run_job.py <platine>.openems-job.json
   ```

   Optionen: `--res 0.8` (Zellgröße über der Platine in mm, gröber = schneller),
   `--sources id1,id2` (nur diese Quellen), `--max-steps 100000`, `--keep` (Rechenordner
   behalten).
3. In der App **Ergebnis laden** (oder `<platine>.fullwave.bin` auf das Fenster ziehen) und bei
   „Magnetfeld aus“ zwischen „Schnell“ und „Vollwelle“ umschalten.

## openEMS einrichten (Ubuntu 26.04)

```bash
sudo apt install build-essential cmake git libhdf5-dev libvtk9-dev libboost-all-dev \
  libcgal-dev libtinyxml-dev libfparser-dev cython3 python3-numpy python3-h5py \
  python3-matplotlib python3-setuptools python3-dev
git clone --recursive https://github.com/thliebig/openEMS-Project.git tools/openems/src
cd tools/openems/src
./update_openEMS.sh ~/opt/openEMS --disable-GUI --python \
  --python-venv-mode site --python-venv-dir "$PWD/../.venv"
```

`src/`, `.venv/`, `runs/` und `build.log` stehen in `.gitignore`.

## Was gerechnet wird

- **Geometrie:** Kupfer jeder Lage als Flächen (Pads, Zonen, Via-Ringe, Leiterbahnen) und
  zusätzlich als dünne Drähte entlang der Bahnmitten und quer durch jedes Pad. Ohne die
  Drähte verschwinden Bahnen, die schmaler als eine Zelle sind, im Gitter. Vias und
  durchkontaktierte Pads werden als Drähte zwischen ihren Lagen modelliert. Die Dielektrika
  liegen zwischen den Kupferlagen; die Kupferdicke liegt weit unter der Zellgröße.
- **Gitter:** gleichmäßig über der Platine (`res`), zusätzliche Linien an den Enden jedes
  Ports und jedes konzentrierten Bauteils, nach außen sanft gröber (Faktor ≤ 1,4) bis 4 mm,
  Luft 20–25 mm, Rand PML (8 Zellen).
- **Anregung je Quelle:**
  - Takt- und Datenleitungen: Port vom Treiber-Pad senkrecht zur Bezugsfläche (33 Ω).
    Empfänger sind Kondensatoren mit der Lastkapazität und einem 10-kΩ-Ableitwiderstand;
    eine Terminierung ist ein Widerstand. Serienwiderstände werden mit ihrem Wert eingesetzt.
  - Differenzpaare: zwei Ports mit entgegengesetzter Polarität.
  - Stromschleifen (Schaltregler): Port über dem Schalter, also zwischen den beiden Pads des
    ICs, mit 10 Ω. Das Feld wird ohnehin auf den Port-Strom bezogen; mit weniger Widerstand
    klingt der Schleifenstrom (L/R) so lange nach, dass der Lauf ein Vielfaches dauert.
    Kondensatoren in der Schleife sind Kurzschlüsse.
  - Spulen: nicht in der Vollwelle; sie bleiben aus dem schnellen Modell.
- **Ausgabe:** H im Frequenzbereich bei 12 Frequenzen (20 MHz bis f_max, logarithmisch), geteilt
  durch den Port-Strom und auf das Gitter der App umgerechnet. Die App multipliziert das mit
  dem Stromspektrum ihres eigenen Quellenmodells, Änderungen am Spektrum (Flanken, Frequenz)
  bleiben also interaktiv. Fernfeld: stärkste Richtung in 3 m (×2 für die Bodenreflexion wie
  in Stufe 1) je Ampere. Dazu die Eingangsimpedanz am Port.

Format von `*.fullwave.bin`: 8 Byte `PCBFW1\0\0`, uint32 Headerlänge, JSON-Header,
dann int16-Blöcke in centi-dB von |H|² je A² (Quelle für Quelle, darin Frequenz für Frequenz),
angeordnet wie die Volumina der App (`index = ix + nx·(iy + ny·iz)`).
