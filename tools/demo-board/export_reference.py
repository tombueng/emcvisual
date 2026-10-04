#!/usr/bin/env python3
"""Export ground-truth data from pcbnew for the parser tests.

    /usr/bin/python3 tools/demo-board/export_reference.py <board.kicad_pcb> <out.json>

The TypeScript parser must reproduce these numbers (pad positions and angles, nets, vias,
track lengths, filled zone areas). Coordinates are KiCad board coordinates in mm.
"""
import json
import math
import sys

import pcbnew


def mm(v):
    return round(pcbnew.ToMM(v), 6)


def main(path, out):
    board = pcbnew.LoadBoard(path)
    copper = [str(pcbnew.BOARD.GetStandardLayerName(lid)) for lid in board.GetEnabledLayers().CuStack()]

    pads = []
    for fp in board.GetFootprints():
        for p in fp.Pads():
            pos = p.GetPosition()
            pads.append({
                'ref': fp.GetReference(),
                'number': p.GetNumber(),
                'x': mm(pos.x), 'y': mm(pos.y),
                'angle': round(p.GetOrientationDegrees(), 4),
                'sizeX': mm(p.GetSize(pcbnew.F_Cu).x), 'sizeY': mm(p.GetSize(pcbnew.F_Cu).y),
                'net': p.GetNetname(),
                'copperLayers': [str(pcbnew.BOARD.GetStandardLayerName(lid)) for lid in board.GetEnabledLayers().CuStack() if p.IsOnLayer(lid)],
                'pinType': p.GetPinType(),
                'pinFunction': p.GetPinFunction(),
            })

    vias, length_by_net, segments, arcs = [], {}, 0, 0
    for t in board.GetTracks():
        if t.GetClass() == 'PCB_VIA':
            pos = t.GetPosition()
            vias.append({'x': mm(pos.x), 'y': mm(pos.y), 'net': t.GetNetname(),
                         'diameter': mm(t.GetWidth(pcbnew.F_Cu)), 'drill': mm(t.GetDrillValue())})
            continue
        if t.GetClass() == 'PCB_ARC':
            arcs += 1
        else:
            segments += 1
        length_by_net[t.GetNetname()] = round(length_by_net.get(t.GetNetname(), 0.0) + pcbnew.ToMM(t.GetLength()), 6)

    zones = []
    for z in board.Zones():
        if z.GetIsRuleArea():
            continue
        for lid in z.GetLayerSet().CuStack():
            poly = z.GetFilledPolysList(lid)
            area = poly.Area() / 1e12  # nm^2 -> mm^2
            zones.append({'net': z.GetNetname(), 'layer': str(pcbnew.BOARD.GetStandardLayerName(lid)), 'filledArea': round(area, 3)})

    bbox = board.GetBoardEdgesBoundingBox()
    ref = {
        'copperLayers': copper,
        'thickness': mm(board.GetDesignSettings().GetBoardThickness()),
        'outlineBBox': {'x0': mm(bbox.GetLeft()), 'y0': mm(bbox.GetTop()), 'x1': mm(bbox.GetRight()), 'y1': mm(bbox.GetBottom())},
        'nets': sorted(str(n) for n in board.GetNetsByName().keys() if str(n)),
        'footprints': sorted(fp.GetReference() for fp in board.GetFootprints()),
        'pads': sorted(pads, key=lambda p: (p['ref'], p['number'], p['x'], p['y'])),
        'vias': sorted(vias, key=lambda v: (v['x'], v['y'])),
        'trackSegments': segments,
        'trackArcs': arcs,
        'trackLengthByNet': dict(sorted(length_by_net.items())),
        'zones': zones,
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(ref, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{out}: {len(pads)} pads, {len(vias)} vias, {segments} segments, {arcs} arcs, {len(zones)} zones')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
