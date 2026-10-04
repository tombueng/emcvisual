import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/kicad/parseBoard';
import { PickIndex } from '../src/model/pickIndex';

const board = parseBoard(readFileSync('public/demo/demo-board.kicad_pcb', 'utf8'));
const index = new PickIndex(board);
const name = (h: ReturnType<PickIndex['pick']>) => (h ? `${board.nets[h.net]}/${h.kind}/${board.layers[h.layer]!.name}` : null);

describe('pick index', () => {
  it('finds a track, a pad and the plane underneath', () => {
    // bad clock on F.Cu runs along y = 94 between x = 136 and 145
    expect(name(index.pick(141, 94, [0, 1, 2, 3]))).toBe('CLK_BAD/track/F.Cu');
    const pad = board.pads.find((p) => p.ref === 'U2' && p.number === '5')!;
    expect(name(index.pick(pad.at.x, pad.at.y, [0]))).toBe('CLK_GOOD/pad/F.Cu');
    // next to the track only the inner planes remain
    expect(name(index.pick(141, 97, [0, 1, 2, 3]))).toBe('GND/zone/In1.Cu');
    // inside the slot the ground plane is missing, the +3V3 plane below is there
    expect(name(index.pick(139, 100, [1, 2]))).toBe('+3V3/zone/In2.Cu');
  });

  it('finds the nearest pad for loop picking', () => {
    const c1 = board.pads.find((p) => p.ref === 'C1' && p.number === '1')!;
    expect(board.pads[index.nearestPad(c1.at.x + 0.3, c1.at.y, [0])]!.ref).toBe('C1');
  });
});
