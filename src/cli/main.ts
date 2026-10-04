/**
 * Command line: field check of a KiCad board with a scenario (docs/CI-FELDCHECK.md).
 *
 *   node field-check.mjs board.kicad_pcb --scenario board.scenario.json [--out report.json]
 *        [--baseline base.json] [--threshold 3] [--height 2] [--step 1]
 *
 * Exit code 1 when --baseline is given and something got worse by more than the threshold.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CHECK_BANDS, compareChecks, DEFAULT_CHECK, runCheck, type CheckReport } from './fieldCheck';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function usage(): never {
  console.error(
    'usage: field-check <board.kicad_pcb> --scenario <scenario.json> [--out report.json] [--baseline base.json] [--threshold dB] [--height mm] [--step mm]',
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
  return [head, ...rows].join('\n');
}

function main() {
  const boardPath = process.argv[2];
  const scenarioPath = arg('scenario');
  if (!boardPath || boardPath.startsWith('--') || !scenarioPath) usage();
  const opts = {
    height: Number(arg('height') ?? DEFAULT_CHECK.height),
    step: Number(arg('step') ?? DEFAULT_CHECK.step),
  };
  const report = runCheck(readFileSync(boardPath, 'utf8'), basename(boardPath), JSON.parse(readFileSync(scenarioPath, 'utf8')), opts);
  console.log(table(report));
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));

  const basePath = arg('baseline');
  if (!basePath) return;
  const base = JSON.parse(readFileSync(basePath, 'utf8')) as CheckReport;
  const threshold = Number(arg('threshold') ?? 3);
  const { worse, better } = compareChecks(base, report, threshold);
  const name = (id: string) => report.sources.find((s) => s.id === id)?.name ?? id;
  const fmt = (f: { sourceId: string; what: string; before?: number; after?: number }) =>
    `  ${name(f.sourceId)}: ${f.what}${f.before !== undefined ? ` ${f.before.toFixed(1)} -> ${f.after!.toFixed(1)}` : ''}`;
  if (better.length) console.log(`\nbetter than the baseline:\n${better.map(fmt).join('\n')}`);
  if (worse.length) {
    console.log(`\nworse than the baseline (threshold ${threshold} dB):\n${worse.map(fmt).join('\n')}`);
    process.exitCode = 1;
  } else console.log(`\nno regression against the baseline (threshold ${threshold} dB)`);
}

main();
