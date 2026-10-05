/**
 * Survey: run the full check (with the automatically suggested sources) on real boards and
 * count the findings per kind, to see whether the rules produce sensible numbers in practice
 * or noise. Usage:  npx tsx tools/survey/survey.ts board1.kicad_pcb board2.kicad_pcb …
 * Writes a table to stdout and the details to tools/survey/out/<board>.json (not committed).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseBoard } from '../../src/kicad/parseBoard';
import { suggestSources } from '../../src/physics/suggest';
import { runCheck } from '../../src/cli/fieldCheck';
import { findingSeverity } from '../../src/physics/severity';
import type { DiagnosticKind } from '../../src/physics/diagnostics';

const files = process.argv.slice(2);
mkdirSync('tools/survey/out', { recursive: true });
const rows: Record<string, string | number>[] = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const name = basename(file, '.kicad_pcb');
  const t0 = Date.now();
  try {
    const board = parseBoard(text, basename(file));
    const sources = suggestSources(board).map((s) => s.source);
    const scenario = { kind: 'pcb-field-scenario', version: 1, board: { fileName: basename(file), hash: '' }, settings: { quality: 'normal', fMax: 1e9, planeOverrides: {} }, sources };
    const r = runCheck(text, basename(file), scenario, { height: 2, step: 2 });
    const counts: Record<string, number> = {};
    for (const s of r.sources) for (const h of s.hints) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
    for (const x of r.rules ?? []) counts[x.kind] = (counts[x.kind] ?? 0) + 1;
    const errors = r.sources.filter((s) => s.error).length;
    // what the user sees first: how many findings are red / yellow
    let red = 0;
    let yellow = 0;
    const rate = (lvl: string) => (lvl === 'critical' ? red++ : lvl === 'check' ? yellow++ : 0);
    for (const s of r.sources)
      for (const h of s.hints) {
        const m = h.kind === 'cable-cm' ? (s.cm?.margin ?? null) : h.kind === 'io-coupling' ? (s.io?.margin ?? null) : (s.far?.margin ?? null);
        rate(findingSeverity(m, h.gainDb ?? null, h.kind as DiagnosticKind, h.value).level);
      }
    for (const x of r.rules ?? []) rate(findingSeverity(null, null, x.kind as DiagnosticKind, x.value).level);
    rows.push({ board: name, fp: board.footprints.length, src: sources.length, err: errors, ms: Date.now() - t0, red, yellow, ...counts });
    writeFileSync(`tools/survey/out/${name}.json`, JSON.stringify({ sources, report: r }, null, 1));
  } catch (e) {
    rows.push({ board: name, error: (e as Error).message.slice(0, 60) });
  }
}
console.table(rows);
