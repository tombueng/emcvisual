/**
 * A small 3 m far-field spectrum for the speech bubbles: the source's lines (red where they
 * are over the limit), the same with a fix applied (dashed envelope, `shift` dB lower: the fix
 * changes the dipole moment, which scales every line alike), and the CISPR 32 class B limit.
 * Plain SVG markup, so it works in the HTML overlay and inside the scene (HTML-in-Canvas).
 */
import type { LimitSegment } from '../physics/farfield';

export interface MiniSpectrumOptions {
  width: number;
  height: number;
  color: string;
  limits: LimitSegment[];
  /** dB the spectrum drops when the problem is fixed (draws the dashed envelope). */
  shift?: number;
  fMin?: number;
  fMax?: number;
  /** Shown dB range below the top. */
  range?: number;
  /** Labels (frequency range, caption). */
  labels: { left: string; right: string; caption: string };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function miniSpectrumSvg(lines: { f: number; db: number }[], o: MiniSpectrumOptions): string {
  const fMin = o.fMin ?? 30e6;
  const fMax = o.fMax ?? 1e9;
  const range = o.range ?? 60;
  const W = o.width;
  const H = o.height;
  const top = 2;
  const plotH = H - 14;
  const inBand = lines.filter((l) => l.f >= fMin && l.f <= fMax);
  const limitMax = Math.max(...o.limits.filter((s) => s.f1 > fMin && s.f0 < fMax).map((s) => s.db));
  const dbTop = Math.ceil((Math.max(limitMax + 6, ...inBand.map((l) => l.db)) + 2) / 5) * 5;
  const dbBottom = dbTop - range;
  const x = (f: number) => (Math.log(f / fMin) / Math.log(fMax / fMin)) * W;
  const y = (db: number) => top + ((dbTop - Math.max(dbBottom, Math.min(dbTop, db))) / range) * plotH;
  const limitAt = (f: number) => o.limits.find((s) => f >= s.f0 && f < s.f1)?.db ?? null;

  // one stem per pixel column: the strongest line there
  const cols = new Map<number, number>();
  for (const l of inBand) {
    const c = Math.min(W - 1, Math.max(0, Math.round(x(l.f))));
    cols.set(c, Math.max(cols.get(c) ?? -Infinity, l.db));
  }
  let stems = '';
  let over = '';
  let fixed = '';
  const fixedPts: string[] = [];
  for (const [c, db] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
    if (db < dbBottom) continue;
    const f = fMin * (fMax / fMin) ** (c / W);
    const lim = limitAt(f);
    const seg = `M${c + 0.5} ${y(dbBottom).toFixed(1)}V${y(db).toFixed(1)}`;
    if (lim !== null && db > lim) over += seg;
    else stems += seg;
    if (o.shift) fixedPts.push(`${c + 0.5},${y(db - o.shift).toFixed(1)}`);
  }
  if (fixedPts.length) fixed = `<polyline points="${fixedPts.join(' ')}" fill="none" style="stroke:var(--text);opacity:.75" stroke-width="1" stroke-dasharray="2 2"/>`;
  let limitPath = '';
  for (const s of o.limits) {
    const a = Math.max(s.f0, fMin);
    const b = Math.min(s.f1, fMax);
    if (b <= a) continue;
    limitPath += `M${x(a).toFixed(1)} ${y(s.db).toFixed(1)}H${x(b).toFixed(1)}`;
  }
  const base = y(dbBottom);
  return (
    `<svg class="mini-spectrum" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.labels.caption)}">` +
    `<rect x="0" y="${top}" width="${W}" height="${plotH}" style="fill:var(--viewport)" />` +
    `<path d="${stems}" style="stroke:${esc(o.color)}" stroke-width="1"/>` +
    `<path d="${over}" style="stroke:var(--warn)" stroke-width="1"/>` +
    fixed +
    `<path d="${limitPath}" fill="none" style="stroke:var(--warn)" stroke-width="1.2"/>` +
    `<line x1="0" x2="${W}" y1="${base}" y2="${base}" style="stroke:var(--line)"/>` +
    `<text x="0" y="${H - 2}" font-size="8.5" style="fill:var(--faint)">${esc(o.labels.left)}</text>` +
    `<text x="${W / 2}" y="${H - 2}" font-size="8.5" text-anchor="middle" style="fill:var(--faint)">${esc(o.labels.caption)}</text>` +
    `<text x="${W}" y="${H - 2}" font-size="8.5" text-anchor="end" style="fill:var(--faint)">${esc(o.labels.right)}</text>` +
    `</svg>`
  );
}
