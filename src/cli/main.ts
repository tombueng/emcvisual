/**
 * Command line: field check of a board (KiCad, IPC-2581, Eagle, ODB++) with a scenario
 * (docs/CI-FIELD-CHECK.md).
 *
 *   node field-check.mjs board.kicad_pcb --scenario board.scenario.json [--out report.json]
 *        [--baseline base.json] [--threshold 3] [--height 2] [--step 1]
 *
 * Exit code 1 when --baseline is given and something got worse by more than the threshold.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CHECK_BANDS, compareChecks, DEFAULT_CHECK, runCheck, type CheckReport } from './fieldCheck';
import { importBoard } from '../import';
import { MAX_GAIN_DB } from '../physics/attribution';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    'usage: field-check <board: .kicad_pcb | IPC-2581 .xml | Eagle .brd | ODB++ .tgz/.zip> --scenario <scenario.json> [--out report.json] [--baseline base.json] [--threshold dB] [--height mm] [--step mm]',
  );
  process.exit(2);
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

function table(r: CheckReport): string {
  const head = `${pad('source', 26)}${CHECK_BANDS.map((b) => pad(b.id, 14)).join('')}${pad('far 3 m', 22)}hints`;
  const rows = r.sources.map((s) => {
    if (s.error) return `${pad(s.name, 26)}error: ${s.error}`;
    const near = CHECK_BANDS.map((b) => {
      const v = s.near[b.id];
      return pad(v && v.db > -199 ? `${v.db.toFixed(1)} dBµA/m` : '-', 14);
    }).join('');
    const far = s.far ? `${s.far.margin >= 0 ? '+' : ''}${s.far.margin.toFixed(1)} dB @ ${(s.far.f / 1e6).toFixed(1)} MHz` : '-';
    return `${pad(s.name, 26)}${near}${pad(far, 22)}${s.hints.length}`;
  });
  // the hints, worst source first and the biggest far-field gain first within a source
  const order = [...r.sources].filter((s) => s.hints.length).sort((a, b) => (b.far?.margin ?? -999) - (a.far?.margin ?? -999));
  const hints = order.flatMap((s) =>
    s.hints.map((h) => {
      const amount = h.gainDb === undefined ? '' : h.gainDb >= MAX_GAIN_DB - 0.05 ? `more than ${MAX_GAIN_DB} dB` : `${h.gainDb.toFixed(1)} dB`;
      const gain = amount ? `  3 m: ${amount} quieter when fixed${h.gainScope === 'source' ? ' (all plane gaps of the source together)' : ''}` : '';
      return `  ${pad(s.name, 24)}${pad(h.kind, 14)}${h.x.toFixed(1)} / ${h.y.toFixed(1)} mm ${h.layer}${gain}`;
    }),
  );
  return [head, ...rows, ...(hints.length ? ['', 'layout hints, in the order to work on them:', ...hints] : [])].join('\n');
}

async function main() {
  const boardPath = process.argv[2];
  const scenarioPath = arg('scenario');
  if (!boardPath || boardPath.startsWith('--') || !scenarioPath) usage();
  const opts = {
    height: Number(arg('height') ?? DEFAULT_CHECK.height),
    step: Number(arg('step') ?? DEFAULT_CHECK.step),
  };
  // KiCad boards as text (as before); other formats through the importers
  const board = /\.kicad_pcb$/i.test(boardPath) ? readFileSync(boardPath, 'utf8') : await importBoard(basename(boardPath), new Uint8Array(readFileSync(boardPath)).buffer);
  const report = runCheck(board, basename(boardPath), JSON.parse(readFileSync(scenarioPath, 'utf8')), opts);
  console.log(table(report));
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));

  const basePath = arg('baseline');
  if (!basePath) return;
  const base = JSON.parse(readFileSync(basePath, 'utf8')) as CheckReport;
  const threshold = Number(arg('threshold') ?? 3);
  const { worse, better } = compareChecks(base, report, threshold);
  const name = (id: string) => (id ? (report.sources.find((s) => s.id === id)?.name ?? id) : 'board');
  const fmt = (f: { sourceId: string; what: string; before?: number; after?: number }) =>
    `  ${name(f.sourceId)}: ${f.what}${f.before !== undefined ? ` ${f.before.toFixed(1)} -> ${f.after!.toFixed(1)}` : ''}`;
  if (better.length) console.log(`\nbetter than the baseline:\n${better.map(fmt).join('\n')}`);
  if (worse.length) {
    console.log(`\nworse than the baseline (threshold ${threshold} dB):\n${worse.map(fmt).join('\n')}`);
    process.exitCode = 1;
  } else console.log(`\nno regression against the baseline (threshold ${threshold} dB)`);
}

main().catch((e: Error) => {
  console.error(e.message || String(e));
  process.exit(2);
});
