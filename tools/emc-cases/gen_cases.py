#!/usr/bin/env python3
"""Small test boards for known EMC layout mistakes, each as a bad board and a good twin.

Every case is one mistake from practice (docs/research/EMV-FEHLERKATALOG.md): the bad board has
it, the good twin is the same board with the usual fix. tests/emcCases.test.ts runs the field
check on both and asserts that the engine reports the mistake on the bad board, not (or much
weaker) on the good one, and that the fix makes the far field quieter where it should.

Run with the system python (KiCad's pcbnew module):
    /usr/bin/python3 tools/emc-cases/gen_cases.py            # all cases
    /usr/bin/python3 tools/emc-cases/gen_cases.py slot-clock  # one case

Output: tests/fixtures/emc-cases/<case>.<bad|good>.kicad_pcb and cases.json (sources and
expectations). pcbnew dislikes several boards in one process, so every board is built and
filled in its own process.
"""
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'emc-cases')
FP = '/usr/share/kicad/footprints'
ORIGIN = (100.0, 100.0)

STACKUP_2 = """
		(stackup
			(layer "F.SilkS" (type "Top Silk Screen"))
			(layer "F.Paste" (type "Top Solder Paste"))
			(layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
			(layer "F.Cu" (type "copper") (thickness 0.035))
			(layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
			(layer "B.Cu" (type "copper") (thickness 0.035))
			(layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
			(layer "B.Paste" (type "Bottom Solder Paste"))
			(layer "B.SilkS" (type "Bottom Silk Screen"))
			(copper_finish "None")
			(dielectric_constraints no)
		)"""

STACKUP_4 = """
		(stackup
			(layer "F.SilkS" (type "Top Silk Screen"))
			(layer "F.Paste" (type "Top Solder Paste"))
			(layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
			(layer "F.Cu" (type "copper") (thickness 0.035))
			(layer "dielectric 1" (type "prepreg") (thickness 0.2104) (material "7628") (epsilon_r 4.4) (loss_tangent 0.02))
			(layer "In1.Cu" (type "copper") (thickness 0.0152))
			(layer "dielectric 2" (type "core") (thickness 1.065) (material "FR4") (epsilon_r 4.6) (loss_tangent 0.02))
			(layer "In2.Cu" (type "copper") (thickness 0.0152))
			(layer "dielectric 3" (type "prepreg") (thickness 0.2104) (material "7628") (epsilon_r 4.4) (loss_tangent 0.02))
			(layer "B.Cu" (type "copper") (thickness 0.035))
			(layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
			(layer "B.Paste" (type "Bottom Solder Paste"))
			(layer "B.SilkS" (type "Bottom Silk Screen"))
			(copper_finish "None")
			(dielectric_constraints no)
		)"""


class Builder:
    """Thin layer over pcbnew for the cases: coordinates in mm relative to the board corner."""

    def __init__(self, layers, w, h):
        import pcbnew
        self.p = pcbnew
        self.board = pcbnew.BOARD()
        self.board.SetCopperLayerCount(layers)
        self.board.GetDesignSettings().SetBoardThickness(pcbnew.FromMM(1.6))
        self.layers = layers
        self.w, self.h = w, h
        self.nets = {}
        self.fps = {}
        self.F, self.B = pcbnew.F_Cu, pcbnew.B_Cu
        self.In1, self.In2 = pcbnew.In1_Cu, pcbnew.In2_Cu
        for (x1, y1), (x2, y2) in (((0, 0), (w, 0)), ((w, 0), (w, h)), ((w, h), (0, h)), ((0, h), (0, 0))):
            s = pcbnew.PCB_SHAPE(self.board)
            s.SetShape(pcbnew.SHAPE_T_SEGMENT)
            s.SetStart(self.P(x1, y1))
            s.SetEnd(self.P(x2, y2))
            s.SetLayer(pcbnew.Edge_Cuts)
            s.SetWidth(pcbnew.FromMM(0.1))
            self.board.Add(s)

    def P(self, x, y):
        return self.p.VECTOR2I_MM(ORIGIN[0] + x, ORIGIN[1] + y)

    def net(self, name):
        if name not in self.nets:
            n = self.p.NETINFO_ITEM(self.board, name)
            self.board.Add(n)
            self.nets[name] = n
        return self.nets[name]

    def place(self, lib, name, ref, value, x, y, rot=0.0, pins=None, side='top'):
        fp = self.p.FootprintLoad(f'{FP}/{lib}.pretty', name)
        fp.SetReference(ref)
        fp.SetValue(value)
        self.board.Add(fp)
        fp.SetPosition(self.P(x, y))
        fp.SetOrientationDegrees(rot)
        if side == 'bottom':
            fp.Flip(fp.GetPosition(), False)
        for num, netname in (pins or {}).items():
            for pad in fp.Pads():
                if pad.GetNumber() == num and netname:
                    pad.SetNet(self.net(netname))
        self.fps[ref] = fp
        return fp

    def pad(self, ref, num):
        x, y = self.p.ToMM(self.fps[ref].FindPadByNumber(num).GetPosition())
        return x - ORIGIN[0], y - ORIGIN[1]

    def track(self, netname, layer, pts, width=0.2):
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            t = self.p.PCB_TRACK(self.board)
            t.SetStart(self.P(x1, y1))
            t.SetEnd(self.P(x2, y2))
            t.SetWidth(self.p.FromMM(width))
            t.SetLayer(layer)
            t.SetNet(self.net(netname))
            self.board.Add(t)

    def via(self, netname, x, y, size=0.6, drill=0.3):
        v = self.p.PCB_VIA(self.board)
        v.SetPosition(self.P(x, y))
        v.SetWidth(self.p.FromMM(size))
        v.SetDrill(self.p.FromMM(drill))
        v.SetNet(self.net(netname))
        self.board.Add(v)

    def zone(self, netname, layer, poly=None, priority=0, clearance=0.3):
        """A filled copper zone (poly: list of points, default the whole board)."""
        z = self.p.ZONE(self.board)
        z.SetLayer(layer)
        z.SetNet(self.net(netname))
        z.SetMinThickness(self.p.FromMM(0.25))
        z.SetLocalClearance(self.p.FromMM(clearance))
        z.SetAssignedPriority(priority)
        # solid connection to pads, so ground pads join the plane without thermal spokes
        z.SetPadConnection(self.p.ZONE_CONNECTION_FULL)
        ol = z.Outline()
        ol.NewOutline()
        for x, y in poly or ((0.5, 0.5), (self.w - 0.5, 0.5), (self.w - 0.5, self.h - 0.5), (0.5, self.h - 0.5)):
            ol.Append(self.P(x, y))
        self.board.Add(z)

    def keepout(self, layer, rect):
        """A rule area without copper fill: a slot or cut-out in a plane."""
        z = self.p.ZONE(self.board)
        z.SetLayer(layer)
        z.SetIsRuleArea(True)
        z.SetDoNotAllowZoneFills(True)
        z.SetDoNotAllowTracks(False)
        z.SetDoNotAllowVias(False)
        z.SetDoNotAllowPads(False)
        z.SetDoNotAllowFootprints(False)
        ol = z.Outline()
        ol.NewOutline()
        x0, y0, x1, y1 = rect
        for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            ol.Append(self.P(x, y))
        self.board.Add(z)

    def text(self, s, x, y, size=0.8):
        t = self.p.PCB_TEXT(self.board)
        t.SetText(s)
        t.SetPosition(self.P(x, y))
        t.SetLayer(self.p.F_SilkS)
        t.SetTextSize(self.p.VECTOR2I_MM(size, size))
        t.SetTextThickness(self.p.FromMM(size * 0.15))
        self.board.Add(t)


# --- common parts ------------------------------------------------------------------------------

def clock_driver(b, ref, x, y, net, gnd='GND', vcc='+3V3'):
    """A clock oscillator (4-pin, 3.2 x 2.5 mm): pad 3 is the output."""
    b.place('Oscillator', 'Oscillator_SMD_Abracon_ASE-4Pin_3.2x2.5mm', ref, '25MHz', x, y,
            pins={'1': vcc, '2': gnd, '3': net, '4': vcc})


def receiver(b, ref, x, y, net, gnd='GND'):
    """A receiving gate (SOT-23-5): pad 1 input, pad 2 ground."""
    b.place('Package_TO_SOT_SMD', 'SOT-23-5', ref, '74LVC1G04', x, y, pins={'1': net, '2': gnd, '3': None, '4': None, '5': '+3V3'})


def cap(b, ref, x, y, n1, n2, rot=0.0, value='100nF', side='top'):
    b.place('Capacitor_SMD', 'C_0603_1608Metric', ref, value, x, y, rot=rot, pins={'1': n1, '2': n2}, side=side)


def clock_source(sid, name, nets, driver, f0=25e6, tr=1e-9):
    return {'id': sid, 'type': 'signal', 'kind': 'clock', 'name': name, 'enabled': True, 'color': '#f59e0b',
            'nets': nets, 'driver': driver, 'waveform': {'f0': f0, 'duty': 0.5, 'tr': tr, 'amplitude': 3.3},
            'load': {'model': 'capacitive', 'cLoad': 5e-12}}


def loop_source(sid, name, pads, node_net, f0=500e3, amplitude=2.0, tr=5e-9, voltage=12):
    return {'id': sid, 'type': 'loop', 'name': name, 'enabled': True, 'color': '#f472b6', 'pads': pads,
            'waveform': {'f0': f0, 'duty': 0.28, 'tr': tr, 'amplitude': amplitude}, 'node': {'net': node_net, 'voltage': voltage}}


# --- the cases ---------------------------------------------------------------------------------
# Each case: build(b, bad) draws the board; meta: title, story, mistake, fix, sources, expect.
# expect: bad/good lists of diagnostic kinds that must / must not appear, and the far-field
# change bad → good the fix must bring at least (dB, positive = good is quieter).

CASES = {}


def case(cid, layers, w, h, **meta):
    def deco(fn):
        CASES[cid] = {'layers': layers, 'w': w, 'h': h, 'build': fn, **meta}
        return fn
    return deco


@case('slot-clock', 2, 40, 30,
      title='Takt über einem Schlitz in der Massefläche',
      mistake='Eine Taktleitung kreuzt einen Schlitz in der Massefläche darunter (z. B. ein Bauteil-Ausschnitt oder eine aufgetrennte Fläche). Der Rückstrom muss um den Schlitz herum.',
      fix='Schlitz schließen oder die Leitung um den Schlitz herum führen; notfalls einen Kondensator/Brücke über den Schlitz direkt an der Kreuzung.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['return-gap'], 'good_absent': ['return-gap'], 'bad_severity': 'critical'})
def slot_clock(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, b.pad('Y1', '3')[1]), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    b.zone('GND', b.B)
    if bad:
        b.keepout(b.B, (19, 3, 21, 27))


@case('via-no-stitch', 4, 40, 30,
      title='Lagenwechsel ohne Masse-Via daneben',
      mistake='Ein Takt wechselt per Via von oben (Bezug In1) nach unten (Bezug In2). Beide Flächen sind Masse, aber ohne Masse-Via in der Nähe findet der Rückstrom keinen kurzen Weg von einer Fläche zur anderen.',
      fix='Eine Masse-Via direkt neben jede Signal-Via eines schnellen Signals, das den Bezug wechselt (unter 1–2 mm).',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['no-stitching|ref-change'], 'good_absent': ['no-stitching'], 'far_gain_min': 3})
def via_no_stitch(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK', )
    b.fps['U1'].Flip(b.fps['U1'].GetPosition(), False)
    y = b.pad('Y1', '3')[1]
    b.track('CLK', b.F, [b.pad('Y1', '3'), (20, y)])
    b.via('CLK', 20, y)
    b.track('CLK', b.B, [(20, y), (b.pad('U1', '1')[0], y), b.pad('U1', '1')])
    b.zone('GND', b.In1)
    b.zone('GND', b.In2)
    # ground vias joining the planes far away in the corners only
    for x, yy in ((3, 3), (37, 3), (3, 27), (37, 27)):
        b.via('GND', x, yy)
    if not bad:
        b.via('GND', 21.2, y)


@case('ref-change-pwr', 4, 40, 30,
      title='Bezugswechsel von Masse auf Versorgung ohne Kondensator',
      mistake='Ein Takt wechselt von der Oberseite (Bezug: Massefläche In1) auf die Unterseite (Bezug: 3,3-V-Fläche In2). Der Rückstrom muss von Masse auf die Versorgungsfläche: über den nächsten Abblockkondensator, hier weit weg.',
      fix='Einen Kondensator (z. B. 100 nF) zwischen Masse und Versorgung direkt an der Signal-Via, oder den Lagenwechsel so legen, dass beide Bezüge Masse sind.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['ref-change'], 'far_gain_min': 3})
def ref_change_pwr(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    b.fps['U1'].Flip(b.fps['U1'].GetPosition(), False)
    y = b.pad('Y1', '3')[1]
    b.track('CLK', b.F, [b.pad('Y1', '3'), (20, y)])
    b.via('CLK', 20, y)
    b.track('CLK', b.B, [(20, y), (b.pad('U1', '1')[0], y), b.pad('U1', '1')])
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    # the only decoupling: far away (bad) or right at the signal via (good)
    cx, cy = (36, 4) if bad else (20, y + 2.2)
    cap(b, 'C1', cx, cy, '+3V3', 'GND')
    b.via('+3V3', cx - 1.6, cy)
    b.via('GND', cx + 1.6, cy)


@case('buck-loop', 2, 40, 30,
      title='Schaltregler: Eingangskondensator weit weg (große heiße Schleife)',
      mistake='Beim Abwärtswandler fließt der schnell geschaltete Strom in der Schleife Eingangskondensator → High-Side-Schalter → Low-Side-Schalter → Masse → Kondensator. Steht der Kondensator weit weg vom IC, ist diese Schleife groß und strahlt.',
      fix='Eingangskondensator so nah wie möglich an VIN- und GND-Pin des Reglers, auf derselben Lage, ohne Vias in der Schleife; darunter ungestörte Massefläche.',
      sources=[loop_source('buck', 'Buck 500 kHz', ['C1.1', 'U1.3', 'U1.1', 'C1.2'], 'SW')],
      expect={'bad': ['hot-loop'], 'good_absent': ['hot-loop'], 'bad_severity': 'critical'})
def buck_loop(b, bad):
    # TPS562201-like pinout: 1 GND, 2 SW, 3 VIN, 4 FB, 5 EN, 6 VBST
    b.place('Package_TO_SOT_SMD', 'SOT-23-6', 'U1', 'TPS562201', 20, 15, pins={'1': 'GND', '2': 'SW', '3': 'VIN', '4': 'FB', '5': 'EN', '6': 'VBST'})
    vin = b.pad('U1', '3')
    gnd = b.pad('U1', '1')
    if bad:
        cap(b, 'C1', 6, 25, 'VIN', 'GND', value='10uF')
        c1, c2 = b.pad('C1', '1'), b.pad('C1', '2')
        b.track('VIN', b.F, [c1, (c1[0], vin[1]), vin], width=0.6)
        b.track('GND', b.F, [c2, (c2[0], 28), (gnd[0] - 2, 28), (gnd[0] - 2, gnd[1]), gnd], width=0.6)
    else:
        cap(b, 'C1', vin[0] - 2.4, 15, 'VIN', 'GND', rot=90, value='10uF')
        c1, c2 = b.pad('C1', '1'), b.pad('C1', '2')
        # pad 1 to VIN, pad 2 to GND, whichever side the rotation put them
        b.track('VIN', b.F, [c1, vin], width=0.6)
        b.track('GND', b.F, [c2, gnd], width=0.6)
    b.zone('GND', b.B)
    b.via('GND', gnd[0] - 0.9, gnd[1] - 0.9)


@case('long-clock', 2, 120, 30,
      title='Lange, unterminierte Taktleitung mit schnellen Flanken',
      mistake='Eine 100 mm lange Taktleitung mit 0,5-ns-Flanken ohne Serienwiderstand: Die Leitung ist für ihr Spektrum elektrisch lang, Reflexionen und Überschwingen erzeugen zusätzliche Oberwellen.',
      fix='Serienwiderstand (22–33 Ω) direkt am Treiber, kurze Leitung, oder langsamere Flanken (Treiberstärke/Slew-Rate).',
      sources=[clock_source('clk', 'Takt 50 MHz', ['CLK'], 'Y1.3', f0=50e6, tr=0.5e-9)],
      expect={'bad': ['long-line'], 'good_absent': ['long-line']})
def long_clock(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    rx = 110 if bad else 30
    receiver(b, 'U1', rx, 15, 'CLK')
    y = b.pad('Y1', '3')[1]
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, y), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    b.zone('GND', b.B)


@case('series-term', 2, 120, 30,
      title='Lange Taktleitung: 0 Ω statt Serienwiderstand am Treiber',
      mistake='Dieselbe 100 mm lange Taktleitung mit 0,5-ns-Flanken; am Treiber sitzt nur eine 0-Ω-Brücke. Ohne Quellterminierung klingelt die Leitung bei ihrer Viertelwellen-Resonanz (hier im Messbereich).',
      fix='Serienwiderstand 33 Ω direkt am Treiber (≈ Z0 minus Ausgangswiderstand): schluckt die Reflexion und verlangsamt die Flanke an der kapazitiven Last.',
      sources=[clock_source('clk', 'Takt 50 MHz', ['CLK_SRC', 'CLK'], 'Y1.3', f0=50e6, tr=0.5e-9)],
      expect={'bad': ['long-line'], 'good_absent': ['long-line'], 'far_gain_min': 3})
def series_term(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK_SRC')
    p = b.pad('Y1', '3')
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R1', '0R' if bad else '33R', p[0] + 3, p[1], pins={'1': 'CLK_SRC', '2': 'CLK'})
    receiver(b, 'U1', 110, 15, 'CLK')
    r1, r2 = b.pad('R1', '1'), b.pad('R1', '2')
    b.track('CLK_SRC', b.F, [p, r1])
    b.track('CLK', b.F, [r2, (r2[0] + 2, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    b.zone('GND', b.B)


@case('no-plane', 2, 40, 30,
      title='Zweilagig ohne Massefläche: Rückleiter weit weg',
      mistake='Eine zweilagige Platine ohne Massefläche: Der Takt läuft oben, die Masseverbindung zwischen Treiber und Empfänger als dünne Leitung am Platinenrand. Die Schleife aus Hin- und Rückweg umschließt eine große Fläche.',
      fix='Eine durchgehende Massefläche auf der Unterseite (bei zwei Lagen die wichtigste Maßnahme), mindestens aber die Masseleitung direkt neben/unter der Taktleitung führen.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['no-reference'], 'good_absent': ['no-reference'], 'far_gain_min': 10})
def no_plane(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    y = b.pad('Y1', '3')[1]
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, y), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    g1, g2 = b.pad('Y1', '2'), b.pad('U1', '2')
    if bad:
        b.track('GND', b.F, [g1, (g1[0], 27), (g2[0], 27), g2], width=0.3)
    else:
        b.zone('GND', b.B)
        b.via('GND', g1[0], g1[1] + 1.4)
        b.via('GND', g2[0], g2[1] + 1.4)
        b.track('GND', b.F, [g1, (g1[0], g1[1] + 1.4)], width=0.3)
        b.track('GND', b.F, [g2, (g2[0], g2[1] + 1.4)], width=0.3)


@case('edge-clock', 4, 40, 30,
      title='Taktleitung direkt an der Platinenkante',
      mistake='Eine Taktleitung läuft entlang der Platinenkante, weniger als 1 mm vom Rand der Bezugsfläche. Am Flächenrand kann sich der Rückstrom nicht symmetrisch unter der Leitung ausbreiten, das Streufeld reicht über die Kante hinaus.',
      fix='Schnelle Leitungen mehrere Millimeter (Faustregel: mindestens das 3- bis 5-Fache der Höhe über der Fläche, besser einige mm) von der Kante weg; Kante mit Masse-Vias einfassen.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['edge-trace'], 'good_absent': ['edge-trace']})
def edge_clock(b, bad):
    yl = 1.2 if bad else 12
    clock_driver(b, 'Y1', 6, yl + 3 if bad else 15, 'CLK')
    receiver(b, 'U1', 34, yl + 3 if bad else 15, 'CLK')
    p, q = b.pad('Y1', '3'), b.pad('U1', '1')
    b.track('CLK', b.F, [p, (p[0] + 2, yl), (q[0] - 2, yl), q])
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)


# --- build ---------------------------------------------------------------------------------------

def build_one(cid, variant):
    c = CASES[cid]
    b = Builder(c['layers'], c['w'], c['h'])
    c['build'](b, variant == 'bad')
    b.text(f'{cid} ({variant})', c['w'] / 2, c['h'] - 1.2)
    raw = os.path.join(OUT, f'{cid}.{variant}.raw.kicad_pcb')
    b.p.SaveBoard(raw, b.board)
    with open(raw, encoding='utf-8') as f:
        s = f.read()
    s, n = re.subn(r'\(setup\n', '(setup' + (STACKUP_4 if c['layers'] == 4 else STACKUP_2) + '\n', s, count=1)
    if n != 1:
        sys.exit('no (setup in the raw board')
    with open(raw, 'w', encoding='utf-8') as f:
        f.write(s)


def fill_one(cid, variant):
    import pcbnew
    raw = os.path.join(OUT, f'{cid}.{variant}.raw.kicad_pcb')
    board = pcbnew.LoadBoard(raw)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    pcbnew.SaveBoard(os.path.join(OUT, f'{cid}.{variant}.kicad_pcb'), board)
    os.remove(raw)
    for stem in (f'{cid}.{variant}.raw', f'{cid}.{variant}'):
        for ext in ('.kicad_prl', '.kicad_pro'):
            p = os.path.join(OUT, stem + ext)
            if os.path.exists(p):
                os.remove(p)


def run(*args):
    r = subprocess.run([sys.executable, __file__, *args], capture_output=True, text=True)
    if r.returncode != 0:
        noise = [line for line in r.stderr.splitlines() if 'PROPERTY_ENUM' not in line and line.strip()]
        print('\n'.join(noise), file=sys.stderr)
        sys.exit(f'{" ".join(args)} failed ({r.returncode})')


def meta(cid):
    c = CASES[cid]
    return {k: v for k, v in c.items() if k not in ('build',)}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] in ('--build', '--fill'):
        (build_one if sys.argv[1] == '--build' else fill_one)(sys.argv[2], sys.argv[3])
        sys.exit(0)
    wanted = sys.argv[1:] or list(CASES)
    for cid in wanted:
        for variant in ('bad', 'good'):
            run('--build', cid, variant)
            run('--fill', cid, variant)
        print(f'{cid}: ok')
    index_path = os.path.join(OUT, 'cases.json')
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for cid in wanted:
        index[cid] = meta(cid)
    index = {k: index[k] for k in CASES if k in index}
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write('\n')
