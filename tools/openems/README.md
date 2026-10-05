# Full wave with openEMS (stage 3)

The app calculates quasi-statically in the browser (stages 1–2). For resonances and emission,
openEMS solves Maxwell's equations in the time domain (FDTD). openEMS runs locally, not in the browser:

1. In the app: right-hand panel → "View" → "Full wave (openEMS)" → **Export job**.
   This creates `<board>.openems-job.json` with the layer stack-up, copper, vias, one port per
   source, the frequencies and the app's computation grid.
2. Calculate:

   ```bash
   tools/openems/.venv/bin/python tools/openems/run_job.py <board>.openems-job.json
   ```

   Options: `--res 0.8` (cell size above the board in mm, coarser = faster),
   `--sources id1,id2` (only these sources), `--max-steps 100000`, `--keep` (keep the
   working folder).
3. In the app, **Load result** (or drag `<board>.fullwave.bin` onto the window) and switch
   "Magnetic field from" between "Fast" and "Full wave".

## Setting up openEMS (Ubuntu 26.04)

```bash
sudo apt install build-essential cmake git libhdf5-dev libvtk9-dev libboost-all-dev \
  libcgal-dev libtinyxml-dev libfparser-dev cython3 python3-numpy python3-h5py \
  python3-matplotlib python3-setuptools python3-dev
git clone --recursive https://github.com/thliebig/openEMS-Project.git tools/openems/src
cd tools/openems/src
./update_openEMS.sh ~/opt/openEMS --disable-GUI --python \
  --python-venv-mode site --python-venv-dir "$PWD/../.venv"
```

`src/`, `.venv/`, `runs/` and `build.log` are listed in `.gitignore`. openEMS itself is
licensed under GPL-3.0 and is only installed locally; `run_job.py` belongs to the project (0BSD).

## What is calculated

- **Geometry:** the copper of each layer as surfaces (pads, zones, via rings, traces) and
  additionally as thin wires along the trace centre lines and across each pad. Without the
  wires, traces narrower than one cell vanish in the grid. Vias and plated-through pads are
  modelled as wires between their layers. The dielectrics lie between the copper layers;
  the copper thickness is far below the cell size.
- **Clearances with coarse cells:** with 0.5–1 mm cells, clearances of 0.2 mm vanish, and
  neighbouring pads, fill areas and layers would touch the nets of the source. Therefore the
  copper of the source being calculated has precedence (priority 20). Around its traces and
  pads lies a keep-out of at least half a cell (15), which pushes back foreign copper (10) on
  the same layer. Vias that pass through layers of other nets lie on a grid line of their
  own and get an anti-pad of at least ¾ cell there. Ports and lumped components (17) lie
  above the keep-out and below the copper.
- **Grid:** uniform above the board (`res`), additional lines at the ends of each port and
  each lumped component, smoothly coarser outwards (factor ≤ 1.4) up to 4 mm,
  air 20–25 mm, boundary PML (8 cells).
- **Excitation per source:**
  - Clock and data lines: port from the driver pad perpendicular to the reference plane (33 Ω).
    Receivers are capacitors with the load capacitance and a 10 kΩ bleeder resistor;
    a termination is a resistor. Series resistors are inserted with their value.
  - Differential pairs: two ports with opposite polarity.
  - Current loops (switching regulators): port across the switch, i.e. between the two pads
    of the IC, with 10 Ω. The field is referred to the port current anyway; with less
    resistance the loop current (L/R) keeps ringing for so long that the run takes many
    times longer. Capacitors in the loop are short circuits.
  - Inductors: not in the full wave; they stay with the fast model.
- **Pulse:** derivative of a Gaussian pulse, i.e. without a DC component, with −20 dB at
  1.5·f_max. An ordinary Gaussian pulse starting at 0 Hz drives a persistent current through
  every closed loop of ideal metal (planes, vias, short circuits). Then the field energy never
  decays, and the run only ends at the step limit. Termination at −30 dB residual energy.
- **Output:** H in the frequency domain at 12 frequencies (20 MHz to f_max, logarithmic),
  divided by the port current and resampled onto the app's grid. The app multiplies this by
  the current spectrum of its own source model, so changes to the spectrum (edges, frequency)
  remain interactive. Far field: strongest direction at 3 m (×2 for the ground reflection as
  in stage 1) per ampere. In addition, the input impedance at the port.

Format of `*.fullwave.bin`: 8 bytes `PCBFW1\0\0`, uint32 header length, JSON header,
then int16 blocks in centi-dB of |H|² per A² (source by source, within that frequency by
frequency), arranged like the app's volumes (`index = ix + nx·(iy + ny·iz)`).

## Checking plausibility

`run_job.py` reports, per source, the input impedance at the lowest frequency. A loop of a
few millimetres has a few nH, i.e. ohms (of that order) at a few tens of MHz. If |Zin| is below 0.5 Ω,
the port is short-circuited: pads that are closer together than one cell (SOT-23 with a
0.35 mm gap on a 0.5 mm grid) merge. The result is then invalid; recalculate with a finer
`--res`. A comparison of the fast calculation with the full wave is in
`tools/fullwave/README.md`.

