import type { BBox2, Pad, Vec2 } from './types';

export const DEG = Math.PI / 180;

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Rotate a local point by a KiCad angle in degrees. KiCad's y axis points down and positive
 * angles turn counter-clockwise on screen, so (1, 0) at 90° becomes (0, -1).
 */
export function rotateKicad(p: Vec2, angleDeg: number): Vec2 {
  if (angleDeg === 0) return { x: p.x, y: p.y };
  const a = angleDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.y * s, y: -p.x * s + p.y * c };
}

export function emptyBBox(): BBox2 {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

export function growBBox(b: BBox2, p: Vec2, r = 0): void {
  if (p.x - r < b.x0) b.x0 = p.x - r;
  if (p.y - r < b.y0) b.y0 = p.y - r;
  if (p.x + r > b.x1) b.x1 = p.x + r;
  if (p.y + r > b.y1) b.y1 = p.y + r;
}

export function bboxValid(b: BBox2): boolean {
  return b.x0 <= b.x1 && b.y0 <= b.y1;
}

/** Signed area (shoelace). Keyhole polygons give outer area minus holes. */
export function signedArea(ring: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i]!;
    const q = ring[j]!;
    a += (q.x + p.x) * (q.y - p.y);
  }
  return a / 2;
}

/** Even-odd point in polygon test; works for keyholed rings. */
export function pointInRing(p: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Even-odd over several rings (outer + holes). */
export function pointInRings(p: Vec2, rings: Vec2[][]): boolean {
  let inside = false;
  for (const r of rings) if (pointInRing(p, r)) inside = !inside;
  return inside;
}

export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Points along a circular arc through start, mid and end (inclusive). The step is chosen so
 * the chord deviates at most maxError from the arc, and never more than maxStepDeg.
 */
export function arcPoints(start: Vec2, mid: Vec2, end: Vec2, maxError = 0.01, maxStepDeg = 10): Vec2[] {
  const c = circleCenter(start, mid, end);
  if (!c) return [start, end];
  const r = dist(c, start);
  const a0 = Math.atan2(start.y - c.y, start.x - c.x);
  const am = Math.atan2(mid.y - c.y, mid.x - c.x);
  const a1 = Math.atan2(end.y - c.y, end.x - c.x);
  const TAU = Math.PI * 2;
  const norm = (a: number) => ((a % TAU) + TAU) % TAU;
  const s = norm(a1 - a0);
  const m = norm(am - a0);
  const sweep = m < s ? s : s - TAU;
  return arcByCenter(c, r, a0, sweep, maxError, maxStepDeg);
}

/** Points along an arc given centre, radius, start angle and signed sweep (radians). */
export function arcByCenter(c: Vec2, r: number, a0: number, sweep: number, maxError = 0.01, maxStepDeg = 10): Vec2[] {
  let step = r > maxError ? 2 * Math.acos(1 - maxError / r) : maxStepDeg * DEG;
  step = Math.min(Math.max(step, 1 * DEG), maxStepDeg * DEG);
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / step));
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

export function circleCenter(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

/** Cubic Bézier as a polyline. */
export function bezierPoints(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, n = 16): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    pts.push({ x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x, y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y });
  }
  return pts;
}

/**
 * Join open polylines into closed rings by matching end points (tolerance in mm).
 * Polylines that cannot be closed are returned in `open`.
 */
export function chainRings(polylines: Vec2[][], tol = 0.01): { rings: Vec2[][]; open: Vec2[][] } {
  const key = (p: Vec2) => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`;
  const ends = new Map<string, number[]>();
  const used = new Array<boolean>(polylines.length).fill(false);
  polylines.forEach((pl, i) => {
    for (const p of [pl[0]!, pl[pl.length - 1]!]) {
      const k = key(p);
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });
  const near = (p: Vec2): number[] => {
    // look in the 3x3 neighbourhood of the rounded key to survive rounding at cell borders
    const out: number[] = [];
    const kx = Math.round(p.x / tol);
    const ky = Math.round(p.y / tol);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const l = ends.get(`${kx + dx},${ky + dy}`);
        if (l) out.push(...l);
      }
    return out;
  };

  const rings: Vec2[][] = [];
  const open: Vec2[][] = [];
  for (let i = 0; i < polylines.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const ring = [...polylines[i]!];
    if (ring.length > 2 && dist(ring[0]!, ring[ring.length - 1]!) <= tol) {
      ring.pop();
      rings.push(ring);
      continue;
    }
    let closed = false;
    let extended = true;
    while (extended && !closed) {
      extended = false;
      const tail = ring[ring.length - 1]!;
      for (const j of near(tail)) {
        if (used[j]) continue;
        const pl = polylines[j]!;
        const first = pl[0]!;
        const last = pl[pl.length - 1]!;
        if (dist(first, tail) <= tol) {
          ring.push(...pl.slice(1));
        } else if (dist(last, tail) <= tol) {
          ring.push(...[...pl].reverse().slice(1));
        } else continue;
        used[j] = true;
        extended = true;
        break;
      }
      closed = ring.length > 2 && dist(ring[0]!, ring[ring.length - 1]!) <= tol;
    }
    if (closed) {
      ring.pop();
      rings.push(ring);
    } else {
      open.push(ring);
    }
  }
  return { rings, open };
}

/** Regular n-gon on a circle. */
export function circlePoints(c: Vec2, r: number, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

/** Pad copper outline in board coordinates (round shapes as polygons). */
export function padOutline(p: Pad): Vec2[] {
  const hx = p.size.x / 2;
  const hy = p.size.y / 2;
  let local: Vec2[];
  if (p.shape === 'circle') {
    local = circlePoints({ x: 0, y: 0 }, hx, 20);
  } else if (p.shape === 'oval') {
    const r = Math.min(hx, hy);
    const ax = hx - r;
    const ay = hy - r;
    local = [];
    for (let k = 0; k <= 10; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / 10;
      local.push(hx >= hy ? { x: ax + r * Math.cos(a), y: r * Math.sin(a) } : { x: r * Math.sin(a), y: ay + r * Math.cos(a) });
    }
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI / 2 + (Math.PI * k) / 10;
      local.push(hx >= hy ? { x: -ax + r * Math.cos(a), y: r * Math.sin(a) } : { x: r * Math.sin(a), y: -ay + r * Math.cos(a) });
    }
  } else {
    local = [{ x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy }];
  }
  return local.map((q) => {
    const r = rotateKicad(q, p.angle);
    return { x: p.at.x + r.x, y: p.at.y + r.y };
  });
}
