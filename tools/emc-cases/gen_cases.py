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


@case('split-plane', 2, 40, 30,
      title='Takt kreuzt die Trennung zwischen GND- und 3,3-V-Fläche',
      mistake='Die Unterseite ist in eine GND-Fläche (links) und eine 3,3-V-Fläche (rechts) geteilt; der Takt oben kreuzt die Trennlinie. Der Rückstrom kann an der Trennung nicht weiterfließen und muss über den nächsten Kondensator zwischen den Netzen.',
      fix='Die Bezugsfläche nicht teilen: GND durchgehend, 3,3 V als Leitung oder auf einer anderen Lage; notfalls Leitungen nur innerhalb einer Fläche führen.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['return-gap'], 'good_absent': ['return-gap'], 'bad_split': True})
def split_plane(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, b.pad('Y1', '3')[1]), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    if bad:
        b.zone('GND', b.B, [(0.5, 0.5), (20, 0.5), (20, 29.5), (0.5, 29.5)])
        b.zone('+3V3', b.B, [(20.5, 0.5), (39.5, 0.5), (39.5, 29.5), (20.5, 29.5)])
    else:
        b.zone('GND', b.B)


@case('narrow-slot', 2, 40, 30,
      title='Leitung in der Masselage schneidet einen schmalen Schlitz',
      mistake='Auf der Unterseite (Massefläche) läuft eine Leitung quer über die Platine. Mit ihren Abständen schneidet sie einen nur etwa 0,8 mm breiten, aber langen Schlitz in die Fläche; der Takt oben kreuzt ihn. Schmal heißt nicht harmlos: Der Rückstrom muss um das ganze Schlitzende herum.',
      fix='Leitungen nicht durch die Bezugsfläche führen (jede Leitung in der Fläche ist ein Schlitz); die Leitung auf die Oberseite oder eine andere Lage legen.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['return-gap'], 'good_absent': ['return-gap']})
def narrow_slot(b, bad):
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, b.pad('Y1', '3')[1]), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    b.zone('GND', b.B)
    # an unrelated signal routed through the ground layer (bad) or on top (good)
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R1', '10k', 20, 3, rot=90, pins={'1': 'SIG', '2': 'SIG2'})
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R2', '10k', 20, 27, rot=90, pins={'1': 'SIG', '2': 'SIG3'})
    p, q = b.pad('R1', '1'), b.pad('R2', '1')
    if bad:
        b.via('SIG', p[0], p[1] + 1.6)
        b.via('SIG', q[0], q[1] - 1.6)
        b.track('SIG', b.F, [p, (p[0], p[1] + 1.6)])
        b.track('SIG', b.F, [q, (q[0], q[1] - 1.6)])
        b.track('SIG', b.B, [(p[0], p[1] + 1.6), (q[0], q[1] - 1.6)])
    else:
        b.track('SIG', b.F, [p, (p[0] + 3, p[1] + 3), (q[0] + 3, q[1] - 3), q])


@case('between-connectors', 4, 80, 60,
      title='Takt zwischen Steckern an gegenüberliegenden Kanten',
      mistake='Ein sauber verlegter 25-MHz-Takt (50 mm) über durchgehender Massefläche, aber die Platine hat links und rechts je einen Kabelstecker. Der Rückstrom erzeugt über der Fläche eine kleine Spannung zwischen den beiden Hälften, die die Kabel gegeneinander treibt (stromgetriebener Gleichtakt).',
      fix='Alle Kabelanschlüsse an eine Kante legen, schnelle Schaltungen nicht zwischen Stecker setzen.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['cable-cm'], 'cm_gain_min': 6})
def between_connectors(b, bad):
    clock_driver(b, 'Y1', 14, 30, 'CLK')
    receiver(b, 'U1', 66, 30, 'CLK')
    y = b.pad('Y1', '3')[1]
    b.track('CLK', b.F, [b.pad('Y1', '3'), (19, y), (19, 30.95), (b.pad('U1', '1')[0] - 2, 30.95), b.pad('U1', '1')])
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    pins = {'1': '+5V', '2': 'GND', '3': 'D1', '4': 'GND'}
    b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x04_P2.54mm_Vertical', 'J1', 'Kabel', 4, 26, pins=pins)
    if bad:
        b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x04_P2.54mm_Vertical', 'J2', 'Kabel', 76, 26, pins=pins)
    else:
        b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x04_P2.54mm_Vertical', 'J2', 'Kabel', 4, 46, pins=pins)


@case('io-crosstalk', 4, 80, 60,
      title='Langsame Kabelleitung läuft neben dem Takt',
      mistake='Eine Tasterleitung (IO_BTN) vom Stecker J2 läuft 20 mm direkt neben der 25-MHz-Taktleitung (0,4 mm Kante zu Kante). Über Übersprechen nimmt sie die Taktoberwellen auf und trägt sie aufs Kabel.',
      fix='I/O-Leitung mit Abstand führen (hier ≥ 5 mm) und am Stecker filtern.',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['io-coupling'], 'good_absent': ['io-coupling']})
def io_crosstalk(b, bad):
    clock_driver(b, 'Y1', 14, 30, 'CLK')
    receiver(b, 'U1', 66, 30, 'CLK')
    y = b.pad('Y1', '3')[1]
    b.track('CLK', b.F, [b.pad('Y1', '3'), (19, y), (19, 30.95), (b.pad('U1', '1')[0] - 2, 30.95), b.pad('U1', '1')])
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    # a button input: connector J2 (with one ground pin) to a pull-up resistor near U1
    b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x02_P2.54mm_Vertical', 'J2', 'Taster', 76, 40, pins={'1': 'IO_BTN', '2': 'GND'})
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R2', '10k', 40, 40, rot=90, pins={'1': 'IO_BTN', '2': '+3V3'})
    j = b.pad('J2', '1')
    r = b.pad('R2', '1')
    if bad:
        yy = 30.95 + 0.6
        b.track('IO_BTN', b.F, [r, (r[0], yy), (62, yy), (66, 36), (j[0] - 2, 36), (j[0] - 2, j[1]), j])
    else:
        b.track('IO_BTN', b.F, [r, (r[0], 37), (j[0] - 2, 37), (j[0] - 2, j[1]), j])


def io_board(b):
    """4 layers, GND on In1, 3V3 on In2, a header J1 at the left edge with an I/O line to U1."""
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x02_P2.54mm_Vertical', 'J1', 'IO', 4, 30, pins={'1': 'IO_IN', '2': 'GND'})
    b.place('Package_SO', 'SOIC-8_3.9x4.9mm_P1.27mm', 'U1', 'MCU', 62, 30, pins={'1': 'IO_U', '4': 'GND', '8': '+3V3'})


def filter_parts(b, x, gnd_via_at=None):
    """R1 in series (IO_IN to IO_U) and C1 from IO_U to GND at x; C1's ground via at gnd_via_at."""
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R1', '100R', x, 30, pins={'1': 'IO_IN', '2': 'IO_U'})
    b.place('Capacitor_SMD', 'C_0402_1005Metric', 'C1', '1nF', x + 2.5, 32, rot=90, pins={'1': 'IO_U', '2': 'GND'})
    j, r1, r2 = b.pad('J1', '1'), b.pad('R1', '1'), b.pad('R1', '2')
    c1, c2 = b.pad('C1', '1'), b.pad('C1', '2')
    u = b.pad('U1', '1')
    b.track('IO_IN', b.F, [j, r1])
    b.track('IO_U', b.F, [r2, (c1[0], r2[1]), c1])
    b.track('IO_U', b.F, [(c1[0], r2[1]), (u[0] - 3, r2[1]), (u[0] - 3, u[1]), u])
    gx, gy = gnd_via_at if gnd_via_at else (c2[0], c2[1] + 0.9)
    b.track('GND', b.F, [c2, (c2[0], gy), (gx, gy)], width=0.25)
    b.via('GND', gx, gy)
    g = b.pad('J1', '2')
    b.via('GND', g[0], g[1] + 1.4)
    b.track('GND', b.F, [g, (g[0], g[1] + 1.4)], width=0.4)
    b.via('GND', b.pad('U1', '4')[0], b.pad('U1', '4')[1] + 1.2)
    b.via('+3V3', b.pad('U1', '8')[0], b.pad('U1', '8')[1] - 1.2)


@case('filter-far', 4, 80, 60,
      title='I/O-Filter am IC statt am Stecker',
      mistake='Das RC-Filter (R1, C1) der Eingangsleitung sitzt neben dem IC, 50 mm vom Stecker J1. Die Strecke dazwischen ist ungeschützt.',
      fix='Filter direkt an den Stecker (hier innerhalb 4 mm), Kondensator mit Via direkt am Pad.',
      sources=[],
      expect={'bad': ['filter-far'], 'good_absent': ['filter-far', 'filter-ground']})
def filter_far(b, bad):
    io_board(b)
    filter_parts(b, 54 if bad else 9)


@case('filter-ground', 4, 80, 60,
      title='Filterkondensator am Stecker mit langer Masseanbindung',
      mistake='Der Filterkondensator C1 sitzt zwar am Stecker, erreicht die Massefläche aber erst über 10 mm Leitung zu einer Via. Bei 100 MHz ist das eine Induktivität von rund 10 nH: Der Kondensator leitet kaum noch ab.',
      fix='Masse-Via direkt am Pad des Kondensators.',
      sources=[],
      expect={'bad': ['filter-ground'], 'good_absent': ['filter-ground']})
def filter_ground(b, bad):
    io_board(b)
    filter_parts(b, 9, gnd_via_at=(21.5, 33.9) if bad else None)


@case('usb-shield', 4, 60, 40,
      title='USB-C-Buchse mit offenem Schirm',
      mistake='Die Schirmlaschen (SH) der USB-C-Buchse haben kein Netz. Der Kabelschirm kann seinen Strom nicht zur Platine zurückführen und wird selbst zur Antenne.',
      fix='Schirmpads an Masse (oder Gehäuse), mit Vias direkt an den Pads.',
      sources=[],
      expect={'bad': ['shield-open'], 'good_absent': ['shield-open', 'shield-weak']})
def usb_shield(b, bad):
    b.zone('GND', b.In1)
    b.zone('+5V', b.In2)
    pins = {'A1': 'GND', 'B1': 'GND', 'A12': 'GND', 'B12': 'GND', 'A4': 'VBUS', 'B4': 'VBUS', 'A9': 'VBUS', 'B9': 'VBUS', 'A6': 'D+', 'B6': 'D+', 'A7': 'D-', 'B7': 'D-'}
    if not bad:
        pins['SH'] = 'GND'
    b.place('Connector_USB', 'USB_C_Receptacle_GCT_USB4085', 'J1', 'USB-C', 6, 20, rot=-90, pins=pins)


@case('decoupling', 4, 60, 40,
      title='Abblockkondensator 15 mm vom Versorgungspin',
      mistake='Der einzige Kondensator für die 3,3-V-Versorgung des ICs U1 sitzt 15 mm vom Pin entfernt und ist über eine Leitung angeschlossen; die Stromspitzen des ICs fließen über eine große Schleife.',
      fix='Kondensator direkt am Versorgungspin, Vias direkt an den Pads.',
      sources=[],
      expect={'bad': ['decoupling'], 'good_absent': ['decoupling']})
def decoupling(b, bad):
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    b.place('Package_SO', 'SOIC-8_3.9x4.9mm_P1.27mm', 'U1', 'MCU', 30, 20, pins={'4': 'GND', '8': '+3V3'})
    v = b.pad('U1', '8')
    cx, cy = (v[0] + 15, v[1]) if bad else (v[0] + 1.6, v[1] - 1.6)
    b.place('Capacitor_SMD', 'C_0402_1005Metric', 'C1', '100nF', cx, cy, pins={'1': '+3V3', '2': 'GND'})
    c1, c2 = b.pad('C1', '1'), b.pad('C1', '2')
    b.track('+3V3', b.F, [v, (v[0], cy), c1] if bad else [v, c1], width=0.25)
    b.via('GND', c2[0] + 0.8, c2[1])
    b.via('+3V3', c1[0], c1[1] - 0.8)
    b.via('GND', b.pad('U1', '4')[0], b.pad('U1', '4')[1] + 1.2)


@case('crystal-edge', 4, 60, 40,
      title='Oszillator in der Ecke neben dem USB-Stecker',
      mistake='Der 25-MHz-Oszillator sitzt 2 mm von der Platinenkante und 6 mm vom Kabelstecker J1 entfernt; seine Oberwellen koppeln direkt in Kabel und Rand.',
      fix='Oszillator nah an den IC in die Platinenmitte, weg von Rand und Steckern.',
      sources=[],
      expect={'bad': ['crystal-placement'], 'good_absent': ['crystal-placement']})
def crystal_edge(b, bad):
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x02_P2.54mm_Vertical', 'J1', 'USB', 4, 12, pins={'1': 'VBUS', '2': 'GND'})
    if bad:
        clock_driver(b, 'Y1', 4, 3.5, 'CLK')
    else:
        clock_driver(b, 'Y1', 30, 20, 'CLK')
    receiver(b, 'U1', 40, 20, 'CLK')
    b.track('CLK', b.F, [b.pad('Y1', '3'), b.pad('U1', '1')])


@case('crystal-under', 2, 40, 30,
      title='Signalleitung unter dem Oszillator',
      mistake='Eine LED-Leitung läuft auf der Bestückungsseite direkt unter dem Oszillator hindurch und nimmt dessen Oberwellen auf.',
      fix='Fremde Leitungen um den Oszillator herum führen; darunter nur Masse.',
      sources=[],
      expect={'bad': ['crystal-under'], 'good_absent': ['crystal-under']})
def crystal_under(b, bad):
    b.zone('GND', b.B)
    clock_driver(b, 'Y1', 20, 15, 'CLK')
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R1', '1k', 8, 15, pins={'1': 'LED', '2': '+3V3'})
    b.place('Resistor_SMD', 'R_0603_1608Metric', 'R2', '1k', 32, 15, pins={'1': 'LED', '2': 'GND'})
    a, c = b.pad('R1', '1'), b.pad('R2', '1')
    if bad:
        b.track('LED', b.F, [(a[0] + 1.6, a[1]), (c[0] - 1.6, c[1])])
        b.track('LED', b.F, [b.pad('R1', '2'), (a[0] + 1.6, a[1])])
        b.track('LED', b.F, [(c[0] - 1.6, c[1]), c])
    else:
        b.track('LED', b.F, [b.pad('R1', '2'), (a[0] + 1.6, 22), (c[0] - 1.6, 22), c])


@case('sw-node-area', 4, 60, 40,
      title='Schaltknoten großflächig auf zwei Lagen geflutet',
      mistake='Die SW-Fläche des Abwärtswandlers ist zur Kühlung 15 × 20 mm groß und auf der Unterseite gespiegelt. Jede Kupferfläche am Schaltknoten koppelt über das elektrische Feld in die Umgebung.',
      fix='Schaltknoten nur als kurze, kompakte Verbindung Schalter–Drossel auf einer Lage.',
      sources=[],
      expect={'bad': ['sw-node'], 'good_absent': ['sw-node']})
def sw_node_area(b, bad):
    b.zone('GND', b.In1)
    b.zone('+12V', b.In2)
    b.place('Package_TO_SOT_SMD', 'SOT-23-6', 'U1', 'TPS562201', 25, 20, pins={'1': 'GND', '2': 'SW', '3': 'VIN', '4': 'FB', '5': 'EN', '6': 'VBST'})
    b.place('Inductor_SMD', 'L_Taiyo-Yuden_NR-40xx', 'L1', '4.7uH', 36, 20, pins={'1': 'SW', '2': 'VOUT'})
    sw, l1 = b.pad('U1', '2'), b.pad('L1', '1')
    if bad:
        for layer in (b.F, b.B):
            b.zone('SW', layer, [(22, 12), (37, 12), (37, 32), (22, 32)], priority=5)
        for k in range(6):
            b.via('SW', 30 + (k % 3) * 2, 14 + (k // 3) * 2)
    else:
        b.track('SW', b.F, [sw, (sw[0] - 1, sw[1]), (sw[0] - 1, sw[1] + 2.5), (l1[0], sw[1] + 2.5), l1], width=1.0)


@case('no-adjacent-plane', 4, 40, 30,
      title='Takt auf der Oberseite, Massefläche erst auf der dritten Lage',
      mistake='Lagenaufbau Signal–Signal–GND–Signal: Die Taktleitung auf F.Cu sieht ihre Massefläche erst auf In2, 1,3 mm tiefer, mit einer Signallage dazwischen. Die Schleife wird sechsmal so hoch wie über In1.',
      fix='Massefläche auf die Lage direkt unter der Taktleitung (In1).',
      sources=[clock_source('clk', 'Takt 25 MHz', ['CLK'], 'Y1.3')],
      expect={'bad': ['no-adjacent-plane'], 'good_absent': ['no-adjacent-plane'], 'far_gain_min': 6})
def no_adjacent_plane(b, bad):
    clock_driver(b, 'Y1', 8, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, b.pad('Y1', '3')[1]), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    if bad:
        b.zone('GND', b.In2)
        b.track('IO_X', b.In1, [(5, 25), (35, 25)])
    else:
        b.zone('GND', b.In1)
        b.zone('GND', b.In2)


@case('pair-skew', 4, 60, 30,
      title='Differenzpaar mit 12 mm Längenunterschied',
      mistake='Die beiden Leitungen eines schnellen Differenzpaars sind 50 und 62 mm lang. Der Laufzeitversatz von rund 80 ps macht aus einem Teil des Signals Gleichtakt.',
      fix='Längen nahe der Ursache angleichen.',
      sources=[{'id': 'pair', 'type': 'diffpair', 'kind': 'data', 'name': 'LVDS 100 Mbit/s', 'enabled': True, 'color': '#c084fc', 'netP': 'D_P', 'netN': 'D_N', 'driverP': 'U1.1', 'driverN': 'U1.3', 'waveform': {'f0': 50e6, 'duty': 0.5, 'tr': 0.5e-9, 'amplitude': 0.4}, 'load': {'model': 'capacitive', 'cLoad': 2e-12}, 'imbalance': 0.05}],
      expect={'bad': ['pair-skew'], 'good_absent': ['pair-skew']})
def pair_skew(b, bad):
    b.zone('GND', b.In1)
    b.zone('GND', b.In2)
    b.place('Package_TO_SOT_SMD', 'SOT-23-5', 'U1', 'DRV', 6, 15, pins={'1': 'D_P', '2': 'GND', '3': 'D_N'})
    b.place('Package_TO_SOT_SMD', 'SOT-23-5', 'U2', 'RCV', 56, 15, rot=180, pins={'1': 'D_N', '2': 'GND', '3': 'D_P'})
    p0, n0 = b.pad('U1', '1'), b.pad('U1', '3')
    p1, n1 = b.pad('U2', '3'), b.pad('U2', '1')
    b.track('D_P', b.F, [p0, (10, p0[1]), (10, 14.6), (50, 14.6), (52, p1[1]), p1])
    if bad:
        b.track('D_N', b.F, [n0, (10, n0[1]), (10, 15.4), (28, 15.4), (28, 21.4), (34, 21.4), (34, 15.4), (50, 15.4), (52, n1[1]), n1])
    else:
        b.track('D_N', b.F, [n0, (10, n0[1]), (10, 15.4), (50, 15.4), (52, n1[1]), n1])


@case('connector-ground', 4, 60, 40,
      title='Schnelle SPI-Leitungen auf einem Flachkabel ohne Massepins',
      mistake='Der Takt geht über einen 6-poligen Stecker aufs Kabel; am Stecker liegt nur ein Massepin ganz am Rand. Der Rückstrom auf dem Kabel läuft weit weg vom Signal.',
      fix='Masse neben jedes schnelle Signal (Masse-Signal-Masse).',
      sources=[clock_source('clk', 'SPI-Takt 25 MHz', ['SCK'], 'Y1.3')],
      expect={'bad': ['connector-ground'], 'good_absent': ['connector-ground']})
def connector_ground(b, bad):
    b.zone('GND', b.In1)
    b.zone('+3V3', b.In2)
    clock_driver(b, 'Y1', 30, 20, 'SCK')
    pins = {'1': 'SCK', '2': 'MOSI', '3': 'MISO', '4': 'CS', '5': '+3V3', '6': 'GND'} if bad else {'1': 'GND', '2': 'SCK', '3': 'GND', '4': 'MOSI', '5': 'GND', '6': 'MISO'}
    b.place('Connector_PinHeader_2.54mm', 'PinHeader_1x06_P2.54mm_Vertical', 'J1', 'SPI', 54, 14, pins=pins)
    sck = [k for k, v in pins.items() if v == 'SCK'][0]
    b.track('SCK', b.F, [b.pad('Y1', '3'), (b.pad('J1', sck)[0] - 3, b.pad('Y1', '3')[1]), (b.pad('J1', sck)[0] - 3, b.pad('J1', sck)[1]), b.pad('J1', sck)])


@case('floating-copper', 2, 40, 30,
      title='Schwebende Kupferfläche neben dem Takt',
      mistake='Auf der Bestückungsseite liegt eine Kupferfläche ohne Netz neben der Taktleitung (z. B. „zur Fertigung“ gefüllt). Sie nimmt das Feld auf und strahlt ohne Bezug.',
      fix='Fläche an Masse anbinden und vernähen oder entfernen.',
      sources=[],
      expect={'bad': ['floating-copper'], 'good_absent': ['floating-copper']})
def floating_copper(b, bad):
    b.zone('GND', b.B)
    clock_driver(b, 'Y1', 6, 15, 'CLK')
    receiver(b, 'U1', 34, 15, 'CLK')
    b.track('CLK', b.F, [b.pad('Y1', '3'), (12, b.pad('Y1', '3')[1]), (12, 15.95), (b.pad('U1', '1')[0] - 2, 15.95), b.pad('U1', '1')])
    poly = [(12, 18), (30, 18), (30, 26), (12, 26)]
    if bad:
        z = b.p.ZONE(b.board)
        z.SetLayer(b.F)
        z.SetMinThickness(b.p.FromMM(0.25))
        z.SetLocalClearance(b.p.FromMM(0.3))
        z.SetIslandRemovalMode(b.p.ISLAND_REMOVAL_MODE_NEVER)
        ol = z.Outline()
        ol.NewOutline()
        for x, y in poly:
            ol.Append(b.P(x, y))
        b.board.Add(z)
    else:
        b.zone('GND', b.F, poly)
        b.via('GND', 14, 20)
        b.via('GND', 28, 24)


@case('ferrite-ground', 2, 40, 30,
      title='Ferrit zwischen digitaler und analoger Masse',
      mistake='GND und AGND sind über einen Ferrit verbunden. Der Rückstrom erzeugt an ihm eine Spannung zwischen den beiden Massen, die Kabel an beiden Bereichen gegeneinander treibt.',
      fix='Eine durchgehende Masse; Bereiche durch Platzierung trennen.',
      sources=[],
      expect={'bad': ['ferrite-ground'], 'good_absent': ['ferrite-ground']})
def ferrite_ground(b, bad):
    b.zone('GND', b.B, [(0.5, 0.5), (20, 0.5), (20, 29.5), (0.5, 29.5)])
    b.zone('AGND' if bad else 'GND', b.B, [(20.5, 0.5), (39.5, 0.5), (39.5, 29.5), (20.5, 29.5)])
    if bad:
        b.place('Inductor_SMD', 'L_0603_1608Metric', 'FB1', '600R@100MHz', 20.25, 15, rot=90, pins={'1': 'GND', '2': 'AGND'})
    else:
        b.place('Resistor_SMD', 'R_0603_1608Metric', 'R1', '0R', 20.25, 15, rot=90, pins={'1': 'GND', '2': 'GND'})


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
