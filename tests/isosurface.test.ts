import { describe, expect, it } from 'vitest';
import { surfaceNets } from '../src/render/isosurface';

describe('isosurfaces (surface nets)', () => {
  it('puts the shell of a radial field at the right radius', () => {
    const n = 21;
    const g = { x0: -10, y0: -10, z0: -10, dx: 1, dy: 1, dz: 1, nx: n, ny: n, nz: n };
    const vol = new Uint8Array(n * n * n);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const d = Math.hypot(x - 10, y - 10, z - 10);
          vol[x + n * (y + n * z)] = Math.max(0, Math.min(255, Math.round(255 * (1 - d / 10))));
        }
    // level 127.5 of 255 lies at d = 5
    const s = surfaceNets(vol, g, 127.5)!;
    expect(s.positions.length).toBeGreaterThan(300);
    let worst = 0;
    for (let i = 0; i < s.positions.length; i += 3) worst = Math.max(worst, Math.abs(Math.hypot(s.positions[i]!, s.positions[i + 1]!, s.positions[i + 2]!) - 5));
    expect(worst).toBeLessThan(0.35);
  });

  it('returns nothing when the level is never crossed', () => {
    const g = { x0: 0, y0: 0, z0: 0, dx: 1, dy: 1, dz: 1, nx: 3, ny: 3, nz: 3 };
    expect(surfaceNets(new Uint8Array(27).fill(10), g, 100)).toBeNull();
  });
});
