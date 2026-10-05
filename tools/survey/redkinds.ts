/** Which finding kinds make up the red ones on a surveyed board: npx tsx tools/survey/redkinds.ts out/<board>.json */
import { readFileSync } from 'node:fs';
import { findingSeverity } from '../../src/physics/severity';
import type { DiagnosticKind } from '../../src/physics/diagnostics';
for (const f of process.argv.slice(2)) {
  const { report: r } = JSON.parse(readFileSync(f, 'utf8'));
  const red: Record<string, number> = {};
  const margins: Record<string, number[]> = {};
  for (const s of r.sources)
    for (const h of s.hints) {
      const m = h.kind === 'cable-cm' ? (s.cm?.margin ?? null) : h.kind === 'io-coupling' ? (s.io?.margin ?? null) : (s.far?.margin ?? null);
      if (findingSeverity(m, h.gainDb ?? null, h.kind as DiagnosticKind, h.value).level === 'critical') {
        red[h.kind] = (red[h.kind] ?? 0) + 1;
        (margins[h.kind] ??= []).push(Math.round(m ?? -99));
      }
    }
  console.log(f.split('/').pop(), JSON.stringify(red), JSON.stringify(Object.fromEntries(Object.entries(margins).map(([k, v]) => [k, v.sort((a, b) => b - a).slice(0, 12)]))));
}
