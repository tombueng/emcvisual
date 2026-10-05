#!/usr/bin/env python3
"""
Convert a board from another CAD tool to .kicad_pcb with KiCad's own importers, for the formats
the app does not read directly (see docs/IMPORT.md): Altium Designer / CircuitMaker /
CircuitStudio (.PcbDoc), Cadence Allegro (.brd, binary), EasyEDA Std (.json) and Pro (.epro),
CADSTAR (.cpa), PADS (.asc), P-CAD, Fabmaster, gEDA and SolidWorks PCB. Zones are filled
afterwards, so the app sees the poured copper.

Needs KiCad 9 or 10 with its Python module (system Python on Linux: /usr/bin/python3; on Windows
and macOS the Python that ships with KiCad).

    python3 tools/convert/to_kicad.py board.PcbDoc [out.kicad_pcb]

KiCad's import can abort when Python exits after the file is written; the script prints "ok"
once the file is saved, so a crash after that line does not matter.
"""
import os
import sys

try:
    import pcbnew
except ImportError:
    sys.exit("the KiCad Python module (pcbnew) was not found; run this with KiCad's Python")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + '.kicad_pcb'
    kind = pcbnew.PCB_IO_MGR.FindPluginTypeFromBoardPath(src)
    if kind in (pcbnew.PCB_IO_MGR.FILE_TYPE_NONE, pcbnew.PCB_IO_MGR.PCB_FILE_UNKNOWN):
        sys.exit(f'KiCad does not recognise {src} as a board it can import')
    print(f'reading {src} as {pcbnew.PCB_IO_MGR.ShowType(kind)} …', flush=True)
    board = pcbnew.PCB_IO_MGR.Load(kind, src)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    layers = board.GetCopperLayerCount()
    # save only the board file (SaveBoard also writes project files, which can abort after imports)
    pcbnew.PCB_IO_MGR.Save(pcbnew.PCB_IO_MGR.KICAD_SEXP, dst, board)
    print(f'ok: {dst} ({layers} copper layers)', flush=True)
    # skip KiCad's teardown, which can abort after an import
    os._exit(0)


if __name__ == '__main__':
    main()
