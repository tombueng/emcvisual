#!/usr/bin/env python3
"""Generate the demo board with deliberate EMC mistakes (docs/stage-1/PLAN.md section 9).

Run with the system python (KiCad's pcbnew module):
    /usr/bin/python3 tools/demo-board/gen_demo_board.py

The board is not meant to be manufactured. It is a test object for the field simulation:
two buck converters (tight and sprawling hot loop), two clocks (short over a solid plane,
long across a slot in the ground plane with a layer change), a USB pair and a slow LED line.

Steps, each in its own process because pcbnew dislikes loading several boards at once:
  1. build.py  -> geometry, nets, keep-out rule areas, saved without zone fill
  2. insert a 4-layer stack-up (JLC04161H-7628) into the file; the Python API has no stack-up
  3. reload, fill zones, save to public/demo/demo-board.kicad_pcb
"""
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
BUILD = os.path.join(HERE, 'build')
OUT = os.path.join(ROOT, 'public', 'demo', 'demo-board.kicad_pcb')
RAW = os.path.join(BUILD, 'demo-board.raw.kicad_pcb')
FP = '/usr/share/kicad/footprints'

# Board-local coordinates in mm (x right, y down); the board sits at ORIGIN in KiCad.
ORIGIN = (100.0, 80.0)
W, H = 80.0, 50.0
CORNER = 3.0

SLOT = (38.0, 8.0, 40.0, 40.0)        # slot in the In1 ground plane (x0, y0, x1, y1)
CUTOUT = (3.0, 31.5, 30.0, 48.0)      # both planes cut out under the bad regulator

STACKUP = """
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


def build():
    import pcbnew

    board = pcbnew.BOARD()
    board.SetCopperLayerCount(4)
    ds = board.GetDesignSettings()
    ds.SetBoardThickness(pcbnew.FromMM(1.6))

    def P(x, y):
        return pcbnew.VECTOR2I_MM(ORIGIN[0] + x, ORIGIN[1] + y)

    nets = {}

    def net(name):
        if name not in nets:
            n = pcbnew.NETINFO_ITEM(board, name)
            board.Add(n)
            nets[name] = n
        return nets[name]

    # Keep a simple list of placed copper for the stitching-via clearance check.
    copper = []  # ('seg', x1, y1, x2, y2, halfwidth) or ('pt', x, y, radius)

    fps = {}

    def place(lib, name, ref, value, x, y, rot=0.0, pins=None):
        fp = pcbnew.FootprintLoad(f'{FP}/{lib}.pretty', name)
        fp.SetReference(ref)
        fp.SetValue(value)
        board.Add(fp)
        fp.SetPosition(P(x, y))
        fp.SetOrientationDegrees(rot)
        for num, (netname, func, ptype) in (pins or {}).items():
            pads = [p for p in fp.Pads() if p.GetNumber() == num]
            for pad in pads:
                if netname:
                    pad.SetNet(net(netname))
                if func:
                    pad.SetPinFunction(func)
                if ptype:
                    pad.SetPinType(ptype)
        for pad in fp.Pads():
            px, py = pad_xy(pad)
            sx, sy = pcbnew.ToMM(pad.GetSize(pcbnew.F_Cu))
            copper.append(('pt', px, py, max(sx, sy) / 2))
        fps[ref] = fp
        return fp

    def pad_xy(pad):
        x, y = pcbnew.ToMM(pad.GetPosition())
        return x - ORIGIN[0], y - ORIGIN[1]

    def pin(ref, num):
        return pad_xy(fps[ref].FindPadByNumber(num))

    def track(netname, layer, pts, width=0.2):
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            t = pcbnew.PCB_TRACK(board)
            t.SetStart(P(x1, y1))
            t.SetEnd(P(x2, y2))
            t.SetWidth(pcbnew.FromMM(width))
            t.SetLayer(layer)
            t.SetNet(net(netname))
            board.Add(t)
            copper.append(('seg', x1, y1, x2, y2, width / 2))

    def arc_track(netname, layer, start, mid, end, width=0.2):
        a = pcbnew.PCB_ARC(board)
        a.SetStart(P(*start))
        a.SetMid(P(*mid))
        a.SetEnd(P(*end))
        a.SetWidth(pcbnew.FromMM(width))
        a.SetLayer(layer)
        a.SetNet(net(netname))
        board.Add(a)
        copper.append(('seg', start[0], start[1], end[0], end[1], width / 2))

    def via(netname, x, y, size=0.6, drill=0.3):
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(P(x, y))
        v.SetWidth(pcbnew.FromMM(size))
        v.SetDrill(pcbnew.FromMM(drill))
        v.SetNet(net(netname))
        board.Add(v)
        copper.append(('pt', x, y, size / 2))

    def text(s, x, y, size=1.0, layer=None):
        t = pcbnew.PCB_TEXT(board)
        t.SetText(s)
        t.SetPosition(P(x, y))
        t.SetLayer(layer if layer is not None else pcbnew.F_SilkS)
        t.SetTextSize(pcbnew.VECTOR2I_MM(size, size))
        t.SetTextThickness(pcbnew.FromMM(size * 0.15))
        board.Add(t)

    F, B = pcbnew.F_Cu, pcbnew.B_Cu

    # --- outline with rounded corners (arcs exercise the outline parser) -------------------
    def edge_line(x1, y1, x2, y2):
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(P(x1, y1))
        s.SetEnd(P(x2, y2))
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(pcbnew.FromMM(0.1))
        board.Add(s)

    def edge_arc(cx, cy, a0):
        r = CORNER
        pts = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (a0, a0 + 45, a0 + 90)]
        s = pcbnew.PCB_SHAPE(board)
        s.SetShape(pcbnew.SHAPE_T_ARC)
        s.SetArcGeometry(P(*pts[0]), P(*pts[1]), P(*pts[2]))
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(pcbnew.FromMM(0.1))
        board.Add(s)

    c = CORNER
    edge_line(c, 0, W - c, 0)
    edge_line(W, c, W, H - c)
    edge_line(W - c, H, c, H)
    edge_line(0, H - c, 0, c)
    edge_arc(W - c, c, 270)
    edge_arc(W - c, H - c, 0)
    edge_arc(c, H - c, 90)
    edge_arc(c, c, 180)

    # --- parts ---------------------------------------------------------------------------------
    buck_pins = lambda vin, gnd, sw: {  # noqa: E731  (generic demo regulator, not a real pinout)
        '1': (vin, 'VIN', 'power_in'), '2': (gnd, 'GND', 'power_in'), '3': (None, 'EN', 'input'),
        '4': (None, 'FB', 'input'), '5': (None, 'BST', 'passive'), '6': (sw, 'SW', 'power_out')}
    two = lambda a, b: {'1': (a, None, 'passive'), '2': (b, None, 'passive')}  # noqa: E731

    place('Connector_PinHeader_2.54mm', 'PinHeader_1x02_P2.54mm_Vertical', 'J1', 'VIN 12V', 4, 22, 90,
          {'1': ('VIN', 'VIN', 'passive'), '2': ('GND', 'GND', 'passive')})

    # good buck: input capacitor right at VIN/GND
    place('Package_TO_SOT_SMD', 'SOT-23-6', 'U1', 'Buck 500 kHz (Demo)', 20, 10, 0, buck_pins('VIN', 'GND', 'SW1'))
    place('Capacitor_SMD', 'C_0805_2012Metric', 'C1', '10u', 18.8, 6.9, 0, two('VIN', 'GND'))
    place('Inductor_SMD', 'L_Vishay_IFSC-1515AH_4x4x1.8mm', 'L1', '4u7', 25.5, 9.05, 0, two('SW1', '+3V3'))
    place('Capacitor_SMD', 'C_0805_2012Metric', 'C2', '22u', 30.5, 9.05, 0, two('+3V3', 'GND'))

    # bad buck: input capacitor 15 mm away, ground return as its own trace, planes cut out
    place('Package_TO_SOT_SMD', 'SOT-23-6', 'U3', 'Buck 500 kHz (Demo)', 22, 40, 0, buck_pins('VIN', 'GND', 'SW3'))
    place('Capacitor_SMD', 'C_0805_2012Metric', 'C3', '10u', 7, 40, 270, two('VIN', 'GND'))
    place('Inductor_SMD', 'L_Vishay_IFSC-1515AH_4x4x1.8mm', 'L3', '4u7', 27.5, 39.05, 0, two('SW3', '+1V8'))
    place('Capacitor_SMD', 'C_0805_2012Metric', 'C4', '22u', 32.5, 39.05, 0, two('+1V8', 'GND'))

    # microcontroller
    mcu = {'1': ('+3V3', 'VDD', 'power_in'), '12': ('GND', 'VSS', 'power_in'), '25': ('GND', 'VSS', 'power_in'),
           '36': ('+3V3', 'VDD', 'power_in'), '5': ('CLK_GOOD', 'OSC_IN', 'input'), '9': ('CLK_BAD', 'CLK_IN2', 'input'),
           '33': ('USB_DP', 'USB_DP', 'bidirectional'), '32': ('USB_DN', 'USB_DN', 'bidirectional'),
           '20': ('LED', 'PB0', 'output')}
    place('Package_QFP', 'LQFP-48_7x7mm_P0.5mm', 'U2', 'MCU (Demo)', 55, 25, 0, mcu)

    osc = lambda out, ptype='output': {'1': ('+3V3', 'OE', 'input'), '2': ('GND', 'GND', 'power_in'),  # noqa: E731
                                       '3': (out, 'OUT', ptype), '4': ('+3V3', 'VDD', 'power_in')}
    place('Oscillator', 'Oscillator_SMD_Abracon_ASE-4Pin_3.2x2.5mm', 'Y1', '25 MHz', 43, 21, 0, osc('CLK_GOOD_SRC'))
    place('Resistor_SMD', 'R_0603_1608Metric', 'R1', '33', 46.6, 20.175, 0, two('CLK_GOOD_SRC', 'CLK_GOOD'))
    place('Oscillator', 'Oscillator_SMD_Abracon_ASE-4Pin_3.2x2.5mm', 'Y2', '33.333 MHz', 30, 18, 0, osc('CLK_BAD'))

    place('Connector_USB', 'USB_Micro-B_Molex-105017-0001', 'J2', 'USB', 76.5, 25, 90,
          {'1': ('VBUS', 'VBUS', 'power_out'), '2': ('USB_DN', 'D-', 'bidirectional'), '3': ('USB_DP', 'D+', 'bidirectional'),
           '5': ('GND', 'GND', 'power_out'), 'SH': ('GND', 'SHIELD', 'passive')})

    place('Resistor_SMD', 'R_0603_1608Metric', 'R3', '1k', 55.75, 34, 90, two('LED_A', 'LED'))
    place('LED_SMD', 'LED_0805_2012Metric', 'D1', 'LED', 55.75, 38, 90, two('GND', 'LED_A'))

    # --- routing -------------------------------------------------------------------------------
    j1v, j1g = pin('J1', '1'), pin('J1', '2')
    c1v, c1g = pin('C1', '1'), pin('C1', '2')
    u1v, u1g, u1sw = pin('U1', '1'), pin('U1', '2'), pin('U1', '6')
    # VIN feed: J1 up to the good buck and down to the bad one
    track('VIN', F, [j1v, (j1v[0], 5.0), (c1v[0], 5.0), c1v], 0.6)
    track('VIN', F, [c1v, (c1v[0], u1v[1]), u1v], 0.5)
    # good hot loop: U1 GND -> via -> In1 -> via -> C1 GND
    track('GND', F, [u1g, (17.2, u1g[1])], 0.5)
    via('GND', 17.2, u1g[1])
    track('GND', F, [c1g, (20.6, c1g[1])], 0.5)
    via('GND', 20.6, c1g[1])
    l1a, l1b = pin('L1', '1'), pin('L1', '2')
    c2v, c2g = pin('C2', '1'), pin('C2', '2')
    track('SW1', F, [u1sw, (l1a[0], u1sw[1])], 0.6)
    track('+3V3', F, [l1b, (28.3, l1b[1])], 0.6)
    track('+3V3', F, [(28.3, l1b[1]), c2v], 0.6)
    track('+3V3', F, [(28.3, l1b[1]), (28.3, 10.6)], 0.5)
    via('+3V3', 28.3, 10.6)
    track('GND', F, [c2g, (c2g[0], 10.6)], 0.5)
    via('GND', c2g[0], 10.6)

    c3v, c3g = pin('C3', '1'), pin('C3', '2')
    u3v, u3g, u3sw = pin('U3', '1'), pin('U3', '2'), pin('U3', '6')
    # bad hot loop: VIN goes up and around, GND comes back below: about 12 x 12 mm
    track('VIN', F, [j1v, (j1v[0], 34.0), (c3v[0], 34.0)], 0.6)
    track('VIN', F, [c3v, (c3v[0], 34.0), (19.6, 34.0), (19.6, u3v[1]), u3v], 0.5)
    track('GND', F, [u3g, (18.6, u3g[1]), (18.6, 46.0), (c3g[0], 46.0), c3g], 0.5)
    # tie the island to J1 ground on the bottom layer (keeps the GND net in one piece)
    track('GND', F, [(c3g[0], 46.0), (c3g[0], 47.3)], 0.4)
    via('GND', c3g[0], 47.3)
    track('GND', B, [(c3g[0], 47.3), (9.0, 47.3), (9.0, 24.0), j1g], 0.4)
    l3a, l3b = pin('L3', '1'), pin('L3', '2')
    c4v, c4g = pin('C4', '1'), pin('C4', '2')
    track('SW3', F, [u3sw, (l3a[0], u3sw[1])], 0.6)
    track('+1V8', F, [l3b, c4v], 0.6)
    track('GND', F, [c4g, (c4g[0], 40.4)], 0.5)
    via('GND', c4g[0], 40.4)

    # good clock: 25 MHz, series resistor at the driver, ~8 mm over solid ground
    y1out, y1vdd, y1gnd, y1oe = pin('Y1', '3'), pin('Y1', '4'), pin('Y1', '2'), pin('Y1', '1')
    r1a, r1b = pin('R1', '1'), pin('R1', '2')
    u2clk = pin('U2', '5')
    track('CLK_GOOD_SRC', F, [y1out, r1a])
    track('CLK_GOOD', F, [r1b, (48.6, r1b[1]), (48.6, u2clk[1]), u2clk])
    track('+3V3', F, [y1vdd, (y1vdd[0], 19.0)], 0.3)
    via('+3V3', y1vdd[0], 19.0)
    track('+3V3', F, [y1oe, (40.9, y1oe[1])], 0.3)
    via('+3V3', 40.9, y1oe[1])
    track('GND', F, [y1gnd, (y1gnd[0], 23.0)], 0.3)
    via('GND', y1gnd[0], 23.0)

    # bad clock: 33.3 MHz, long, across the slot, then down to B.Cu (referenced to +3V3)
    y2out, y2vdd, y2gnd, y2oe = pin('Y2', '3'), pin('Y2', '4'), pin('Y2', '2'), pin('Y2', '1')
    u2clk2 = pin('U2', '9')
    track('CLK_BAD', F, [y2out, (36.0, y2out[1]), (36.0, 14.0), (45.0, 14.0)])
    via('CLK_BAD', 45.0, 14.0)
    arc_track('CLK_BAD', B, (45.0, 14.0), (45.0 + 2 * math.sqrt(0.5), 16.0 - 2 * math.sqrt(0.5)), (47.0, 16.0))
    track('CLK_BAD', B, [(47.0, 16.0), (47.0, u2clk2[1])])
    via('CLK_BAD', 47.0, u2clk2[1])
    track('CLK_BAD', F, [(47.0, u2clk2[1]), u2clk2])
    track('+3V3', F, [y2vdd, (y2vdd[0], 16.0)], 0.3)
    via('+3V3', y2vdd[0], 16.0)
    track('+3V3', F, [y2oe, (27.8, y2oe[1])], 0.3)
    via('+3V3', 27.8, y2oe[1])
    track('GND', F, [y2gnd, (y2gnd[0], 20.0)], 0.3)
    via('GND', y2gnd[0], 20.0)

    # MCU supply
    for num, netname, dx in (('1', '+3V3', -1.25), ('12', 'GND', -1.25), ('36', '+3V3', 1.35), ('25', 'GND', 1.35)):
        x, y = pin('U2', num)
        track(netname, F, [(x, y), (x + dx, y)], 0.3)
        via(netname, x + dx, y)

    # USB full-speed pair
    jdp, jdn, jg = pin('J2', '3'), pin('J2', '2'), pin('J2', '5')
    udp, udn = pin('U2', '33'), pin('U2', '32')
    track('USB_DP', F, [jdp, (68.0, jdp[1]), (66.75, udp[1]), udp])
    track('USB_DN', F, [jdn, (68.0, jdn[1]), (66.4, udn[1]), udn])
    track('GND', F, [jg, (73.6, jg[1])], 0.3)
    via('GND', 73.6, jg[1])
    shield = sorted({pad_xy(p) for p in fps['J2'].Pads() if p.GetNumber() == 'SH' and p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD})
    track('GND', F, [min(shield, key=lambda q: q[1]), max(shield, key=lambda q: q[1])], 0.3)

    # slow LED line (counter-example)
    uled = pin('U2', '20')
    r3a, r3b = pin('R3', '1'), pin('R3', '2')
    d1k, d1a = pin('D1', '1'), pin('D1', '2')
    track('LED', F, [uled, r3b])
    track('LED_A', F, [r3a, d1a])
    track('GND', F, [d1k, (d1k[0], 40.4)], 0.3)
    via('GND', d1k[0], 40.4)

    # --- planes --------------------------------------------------------------------------------
    def zone(netname, layer, rect, rule_area=False):
        z = pcbnew.ZONE(board)
        z.SetLayer(layer)
        if rule_area:
            z.SetIsRuleArea(True)
            z.SetDoNotAllowZoneFills(True)
            z.SetDoNotAllowTracks(False)
            z.SetDoNotAllowVias(False)
            z.SetDoNotAllowPads(False)
            z.SetDoNotAllowFootprints(False)
        else:
            z.SetNet(net(netname))
            z.SetMinThickness(pcbnew.FromMM(0.25))
        ol = z.Outline()
        ol.NewOutline()
        x0, y0, x1, y1 = rect
        for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            ol.Append(P(x, y))
        board.Add(z)

    In1, In2 = pcbnew.In1_Cu, pcbnew.In2_Cu
    zone('GND', In1, (0, 0, W, H))
    zone('+3V3', In2, (0, 0, W, H))
    zone(None, In1, SLOT, rule_area=True)
    zone(None, In1, CUTOUT, rule_area=True)
    zone(None, In2, CUTOUT, rule_area=True)

    # stitching vias on a 5 mm grid, away from the slot, the cut-out and the bad clock's vias
    def clear_of_copper(x, y, gap=0.5):
        for item in copper:
            if item[0] == 'pt':
                _, px, py, r = item
                if math.hypot(x - px, y - py) < r + 0.3 + gap:
                    return False
            else:
                _, x1, y1, x2, y2, hw = item
                dx, dy = x2 - x1, y2 - y1
                L2 = dx * dx + dy * dy
                t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / L2))
                if math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) < hw + 0.3 + gap:
                    return False
        return True

    def inside(rect, x, y, margin):
        x0, y0, x1, y1 = rect
        return x0 - margin <= x <= x1 + margin and y0 - margin <= y <= y1 + margin

    fp_boxes = []
    for fp in fps.values():
        bb = fp.GetBoundingBox(False)
        x0, y0 = pcbnew.ToMM(bb.GetOrigin())
        x1, y1 = pcbnew.ToMM(bb.GetEnd())
        fp_boxes.append((x0 - ORIGIN[0], y0 - ORIGIN[1], x1 - ORIGIN[0], y1 - ORIGIN[1]))

    for gx in range(1, 16):
        for gy in range(1, 10):
            x, y = gx * 5.0, gy * 5.0
            if inside(SLOT, x, y, 2.5) or inside(CUTOUT, x, y, 1.5):
                continue
            if math.hypot(x - 45.0, y - 14.0) < 4.5 or math.hypot(x - 47.0, y - u2clk2[1]) < 4.5:
                continue
            if any(inside(b, x, y, 0.3) for b in fp_boxes):
                continue
            if not clear_of_copper(x, y):
                continue
            via('GND', x, y)

    text('BUCK GUT', 24, 3.2)
    text('BUCK SCHLECHT', 16, 49 - 1.6)
    text('TAKT GUT 25 MHz', 46, 16.4, 0.8)
    text('TAKT SCHLECHT 33,3 MHz', 30, 21.6, 0.8)
    text('USB', 70, 21.5)
    text('LED', 59, 38)
    text('Schlitz in GND (In1)', 39, 6.4, 0.8)

    pcbnew.SaveBoard(RAW, board)


def insert_stackup():
    with open(RAW, encoding='utf-8') as f:
        s = f.read()
    s, n = re.subn(r'\(setup\n', '(setup' + STACKUP + '\n', s, count=1)
    if n != 1:
        sys.exit('could not find (setup in the raw board')
    with open(RAW, 'w', encoding='utf-8') as f:
        f.write(s)


def fill():
    import pcbnew
    board = pcbnew.LoadBoard(RAW)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pcbnew.SaveBoard(OUT, board)


def run_step(step):
    r = subprocess.run([sys.executable, __file__, step], capture_output=True, text=True)
    noise = [line for line in r.stderr.splitlines() if 'PROPERTY_ENUM' not in line and line.strip()]
    if r.returncode != 0:
        print('\n'.join(noise), file=sys.stderr)
        sys.exit(f'step {step} failed ({r.returncode})')


if __name__ == '__main__':
    os.makedirs(BUILD, exist_ok=True)
    if len(sys.argv) > 1:
        {'build': build, 'stackup': insert_stackup, 'fill': fill}[sys.argv[1]]()
    else:
        for step in ('build', 'stackup', 'fill'):
            run_step(step)
        print(f'wrote {os.path.relpath(OUT, ROOT)}')
