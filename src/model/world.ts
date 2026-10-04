/**
 * The world frame used for physics and rendering (right-handed, three.js convention):
 * X = KiCad x - ox, Y = height (F.Cu = 0, up positive), Z = KiCad y - oy, all in mm.
 * (ox, oy) is the centre of the board outline, so the board sits around the origin.
 * Swapping KiCad's y and the height axis mirrors KiCad's left-handed frame into a
 * right-handed one, which keeps cross products (Biot-Savart) correct.
 */
import type { BoardModel, Vec2 } from './types';

export type Vec3 = [number, number, number];

export interface WorldFrame {
  ox: number;
  oy: number;
}

export function worldFrame(board: BoardModel): WorldFrame {
  return { ox: (board.bbox.x0 + board.bbox.x1) / 2, oy: (board.bbox.y0 + board.bbox.y1) / 2 };
}

export function toWorld(f: WorldFrame, p: Vec2, height: number): Vec3 {
  return [p.x - f.ox, height, p.y - f.oy];
}

export function toBoard(f: WorldFrame, x: number, z: number): Vec2 {
  return { x: x + f.ox, y: z + f.oy };
}
