/**
 * Validates the far field of the fast model against openEMS on the test board
 * tests/fixtures/emc-cases/vertical-loop.bad.kicad_pcb (a 40 mm line over a ground plane, closed
 * through vias at both ends). Usage:
 *   npx tsx tools/fullwave/validate-loop.ts export     -> tools/fullwave/out/vloop.openems-job.json
 *   tools/openems/.venv/bin/python tools/openems/run_job.py tools/fullwave/out/vloop.openems-job.json
 *   npx tsx tools/fullwave/validate-loop.ts compare    -> table fast vs. full wave, E at 3 m per ampere
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseBoard } from '../../src/kicad/parseBoard';
import { detectPlanes } from '../../src/model/planes';
import { worldFrame } from '../../src/model/world';
import { buildSource, type PhysicsContext, type SourceModel } from '../../src/physics/currents';
import { applyReturnModel } from '../../src/physics/returnPaths';
import { dipoleMoment, farMoment, K_DIPOLE } from '../../src/physics/farfield';
import { packWithImages } from '../../src/physics/images';
import { makeGrid } from '../../src/compute/grid';
import { buildJob, DEFAULT_JOB_OPTIONS } from '../../src/fullwave/job';
import { parseFullwave, valueAtFrequency } from '../../src/fullwave/result';
import type { Source } from '../../src/physics/sources';

// usage: … export|compare [case] [bad|good]   (default: vertical-loop bad)
const CASE = process.argv[3] ?? 'vertical-loop';
const VARIANT = process.argv[4] ?? 'bad';
const BOARD = `tests/fixtures/emc-cases/${CASE}.${VARIANT}.kicad_pcb`;
const OUT = 'tools/fullwave/out';
const NAME = CASE === 'vertical-loop' && VARIANT === 'bad' ? 'vloop' : `${CASE}-${VARIANT}`;
const cases = JSON.parse(readFileSync('tests/fixtures/emc-cases/cases.json', 'utf8'));
const src = cases[CASE].sources[0] as Source;
const board = parseBoard(readFileSync(BOARD, 'utf8'), `${NAME}.kicad_pcb`);
const frame = worldFrame(board);
const planes = detectPlanes(board);
const ctx: PhysicsContext = { board, frame, planes, fMax: 1e9 };
const model: SourceModel = buildSource(ctx, src);
model.elements = applyReturnModel(ctx, src, model.elements).elements;

if (process.argv[2] === 'export') {
  const grid = makeGrid(board, frame, { quality: 'normal' });
  const job = buildJob(ctx, [src], { [src.id]: model }, grid, { fileName: `${NAME}.kicad_pcb`, hash: '' }, { ...DEFAULT_JOB_OPTIONS, fMax: 1e9 }, []);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${NAME}.openems-job.json`, JSON.stringify(job));
  console.log(`wrote ${OUT}/${NAME}.openems-job.json`);
} else {
  const file = `${OUT}/${NAME}.fullwave.bin`;
  if (!existsSync(file)) throw new Error(`run openEMS first: ${file} missing`);
  const r = parseFullwave(new Uint8Array(readFileSync(file)).buffer);
  const meta = r.sources.find((s) => s.id === src.id)!;
  const mPlane = Math.hypot(...farMoment(model.elements, planes, frame));
  const mMirror = Math.hypot(...dipoleMoment(packWithImages(model.elements, planes, frame)));
  // the app's far field (radiating and induction term, ground reflection) per ampere at 3 m
  const e = (m: number, f: number) => {
    const kr = (2 * Math.PI * f * 3) / 299_792_458;
    return 20 * Math.log10(((2 * K_DIPOLE * f * f * m) / 3) * Math.sqrt(1 + 1 / (kr * kr))) + 120;
  };
  console.log(`|m| per A: return in the plane ${(mPlane * 1e6).toFixed(1)} mm², mirror depth ${(mMirror * 1e6).toFixed(1)} mm²`);
  console.log('f/MHz   fullwave  fast(plane)  fast(mirror)   diff(plane)  diff(mirror)   dBµV/m at 3 m per A');
  for (const f of r.freqs) {
    const fw = valueAtFrequency(r.freqs, meta.farE3mPerA, f);
    if (!(fw > 0)) continue;
    const dbFw = 20 * Math.log10(fw) + 120;
    const a = e(mPlane, f);
    const b = e(mMirror, f);
    console.log(`${(f / 1e6).toFixed(0).padStart(5)}  ${dbFw.toFixed(1).padStart(8)}  ${a.toFixed(1).padStart(11)}  ${b.toFixed(1).padStart(12)}  ${(a - dbFw).toFixed(1).padStart(12)}  ${(b - dbFw).toFixed(1).padStart(12)}`);
  }
}
