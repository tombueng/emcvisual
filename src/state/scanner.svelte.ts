/**
 * Scanner controller (stage 4): devices, registration, jogging, running scans, keeping and
 * showing measurements. Devices are virtual by default; OctoPrint, G-code over USB and the
 * tinySA are experimental drivers (src/scanner/drivers.ts).
 */
import { app } from './app.svelte';
import { engine, selectionFromView } from './engine.svelte';
import { fitRegistration, type Registration } from '../scanner/registration';
import { estimateSeconds, makePlan, type Plan } from '../scanner/plan';
import { runScan } from '../scanner/runner';
import { VirtualPositioner, VirtualReceiver } from '../scanner/virtual';
import { OctoPrintPositioner, SerialGcodePositioner, TinySAReceiver } from '../scanner/drivers';
import { slices } from '../scanner/measurement';
import { fitSources } from '../scanner/fit';
import { MEASUREMENT_KIND, type Measurement, type MeasuredPoint, type Positioner, type PrinterPoint, type Receiver } from '../scanner/types';
import { findPad } from '../physics/currents';
import type { ProbeKind } from '../scanner/probe';

export type PositionerKind = 'virtual' | 'octoprint' | 'usb';
export type ReceiverKind = 'virtual' | 'tinysa';

class ScannerState {
  positionerKind = $state<PositionerKind>('virtual');
  receiverKind = $state<ReceiverKind>('virtual');
  octoUrl = $state('http://octopi.local');
  octoKey = $state('');
  connected = $state(false);
  status = $state('');
  refs = $state<{ pad: string; px: number; py: number }[]>([
    { pad: '', px: 0, py: 0 },
    { pad: '', px: 0, py: 0 },
  ]);
  zSurface = $state(0);
  jogStep = $state(1);
  head = $state<PrinterPoint | null>(null);
  area = $state<'board' | 'probe'>('board');
  step = $state(2);
  heights = $state('2');
  clearance = $state(1);
  settleMs = $state(150);
  averages = $state(2);
  feed = $state(3000);
  fStart = $state(1e6);
  fStop = $state(1e9);
  points = $state(450);
  probeKind = $state<ProbeKind>('h-loop');
  probeSize = $state(1);
  running = $state(false);
  progress = $state(0);
  etaSeconds = $state(0);
  measurements = $state.raw<Measurement[]>([]);
  shown = $state<{ index: number; mode: 'measured' | 'diff' } | null>(null);
  residual = $state<number | null>(null);
  /** Result of fitting the sources to a measurement (stage 5). */
  fit = $state.raw<SourceFitResult | null>(null);
}

export interface SourceFitResult {
  index: number;
  /** Per enabled source: power factor in dB (null: too weak in the measurement to say). */
  sources: { id: string; name: string; color: string; db: number | null }[];
  residualDb: number;
  points: number;
}

export const scanner = new ScannerState();

let positioner: Positioner | null = null;
let receiver: Receiver | null = null;
let abort: AbortController | null = null;

/** The virtual rig places the board at a fixed spot on a 220 mm bed, top up. */
function virtualRegistration(): Registration {
  const b = app.board!.bbox;
  return fitRegistration(
    [
      { board: { x: b.x0, y: b.y1 }, printer: { x: 20, y: 20 } },
      { board: { x: b.x1, y: b.y1 }, printer: { x: 20 + (b.x1 - b.x0), y: 20 } },
    ],
    0,
    true,
  );
}

export function registration(): Registration | null {
  if (!app.board) return null;
  if (scanner.positionerKind === 'virtual') return virtualRegistration();
  const pairs = scanner.refs
    .map((r) => {
      const i = findPad(app.board!, r.pad);
      return i >= 0 ? { board: app.board!.pads[i]!.at, printer: { x: r.px, y: r.py } } : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (pairs.length < 2) return null;
  const reg = fitRegistration(pairs, scanner.zSurface);
  scanner.residual = reg.residual;
  return reg;
}

export async function connect() {
  await disconnect();
  scanner.status = '';
  try {
    if (scanner.positionerKind === 'virtual') positioner = new VirtualPositioner(scanner.receiverKind === 'virtual' ? 0 : 5);
    else if (scanner.positionerKind === 'octoprint') positioner = new OctoPrintPositioner(scanner.octoUrl, scanner.octoKey);
    else {
      const p = new SerialGcodePositioner();
      await p.connect();
      positioner = p;
    }
    if (scanner.receiverKind === 'virtual') {
      if (!(positioner instanceof VirtualPositioner)) throw new Error('virtual-receiver-needs-virtual-printer');
      receiver = new VirtualReceiver(positioner, () => registration()!, (x, y, h) => engine.fieldLinesAt(x, y, h), {
        kind: scanner.probeKind,
        size: scanner.probeSize,
      });
    } else {
      const r = new TinySAReceiver();
      await r.connect();
      receiver = r;
    }
    scanner.connected = true;
  } catch (e) {
    scanner.status = (e as Error).message;
    scanner.connected = false;
  }
}

export async function disconnect() {
  abort?.abort();
  await positioner?.close?.();
  await receiver?.close?.();
  positioner = null;
  receiver = null;
  scanner.connected = false;
}

export async function home() {
  if (!positioner?.home) return;
  await positioner.home();
  scanner.head = { x: 0, y: 0, z: 0 };
}

export async function jog(dx: number, dy: number, dz: number) {
  if (!positioner) return;
  const h = scanner.head ?? { x: 0, y: 0, z: 10 };
  const next = { x: h.x + dx, y: h.y + dy, z: Math.max(0, h.z + dz) };
  await positioner.moveTo(next, 1500);
  scanner.head = next;
}

export function currentPlan(): Plan | null {
  const board = app.board;
  if (!board) return null;
  const heights = scanner.heights
    .split(/[;, ]+/)
    .map((v) => Number(v.replace(',', '.')))
    .filter((v) => v > 0);
  if (heights.length === 0) return null;
  let area = board.bbox;
  if (scanner.area === 'probe') {
    const cx = app.probe.x + engine.frame.ox;
    const cy = app.probe.z + engine.frame.oy;
    area = { x0: cx - 10, y0: cy - 10, x1: cx + 10, y1: cy + 10 };
  }
  return makePlan(board, { area, step: scanner.step, heights, clearance: scanner.clearance, probeRadius: scanner.probeSize });
}

export function planSeconds(): number {
  const plan = currentPlan();
  if (!plan) return 0;
  if (scanner.positionerKind === 'virtual' && scanner.receiverKind === 'virtual') return plan.points.length * 0.003 * scanner.averages;
  const sweepMs = scanner.receiverKind === 'virtual' ? 5 : 400 + scanner.points * 2;
  return estimateSeconds(plan, scanner.feed, scanner.settleMs, sweepMs * scanner.averages);
}

/** Run a scan; with background=true the result is stored as background of the last measurement. */
export async function startScan(background = false) {
  const plan = currentPlan();
  const reg = registration();
  if (!plan || !reg || !positioner || !receiver || !app.board) {
    scanner.status = !reg ? 'registration-missing' : 'not-connected';
    return;
  }
  abort = new AbortController();
  scanner.running = true;
  scanner.progress = 0;
  const sweep = { fStart: scanner.fStart, fStop: scanner.fStop, points: scanner.points };
  const live: Measurement = {
    kind: MEASUREMENT_KIND,
    version: 1,
    createdAt: new Date().toISOString(),
    board: { fileName: app.board.source.fileName, hash: app.boardHash },
    probe: { kind: scanner.probeKind, radiusMm: scanner.probeSize, factorDb: 0 },
    receiver: receiver.label,
    positioner: positioner.label,
    sweep,
    grid: { x0: plan.x0, y0: plan.y0, step: plan.step, nx: plan.nx, ny: plan.ny, heights: plan.heights },
    freqs: [],
    points: [],
  };
  const target = background ? scanner.measurements[scanner.measurements.length - 1] : null;
  if (!background) {
    scanner.measurements = [...scanner.measurements, live];
    scanner.shown = { index: scanner.measurements.length - 1, mode: 'measured' };
  }
  const t0 = performance.now();
  let lastDraw = 0;
  if (receiver instanceof VirtualReceiver) receiver.boardOff = background;
  try {
    const { points, freqs } = await runScan({
      plan,
      registration: reg,
      positioner,
      receiver,
      sweep,
      feed: scanner.feed,
      // nothing to settle on a virtual rig
      settleMs: scanner.positionerKind === 'virtual' ? 0 : scanner.settleMs,
      averages: scanner.averages,
      signal: abort.signal,
      onPoint: (p: MeasuredPoint, i, total) => {
        scanner.progress = (i + 1) / total;
        scanner.etaSeconds = ((performance.now() - t0) / 1000 / (i + 1)) * (total - i - 1);
        if (!background) {
          live.points.push(p);
          if (live.freqs.length === 0) live.freqs = Array.from({ length: p.dbm.length }, (_, k) => sweep.fStart + (k * (sweep.fStop - sweep.fStart)) / Math.max(1, sweep.points - 1));
          if (performance.now() - lastDraw > 300) {
            lastDraw = performance.now();
            showMeasurement();
          }
        }
      },
    });
    // new objects, so the list (raw state) redraws the changed entry
    if (background && target) {
      scanner.measurements = scanner.measurements.map((m) => (m === target ? { ...m, background: points } : m));
    } else {
      scanner.measurements = scanner.measurements.map((m) => (m === live ? { ...live, freqs, points } : m));
    }
  } catch (e) {
    scanner.status = (e as Error).message;
  } finally {
    scanner.running = false;
    abort = null;
    showMeasurement();
  }
}

export function stopScan() {
  abort?.abort();
}

/** Draw the shown measurement (or its difference to the simulation) as slices. */
export function showMeasurement() {
  const v = engine.viewer;
  const board = app.board;
  if (!v || !board) return;
  const sh = scanner.shown;
  const m = sh ? scanner.measurements[sh.index] : undefined;
  if (!m || !sh || m.points.length === 0 || m.freqs.length === 0) return v.setMeasurementSlices([], app.view.colormap);
  const sel = selectionFromView();
  const top = board.layers[0]!;
  const surface = top.y + top.thickness / 2;
  const out = slices(m, sel).map((s) => {
    let values = s.values;
    if (sh.mode === 'diff') {
      values = new Float32Array(s.values.length).fill(NaN);
      for (const p of m.points) {
        if (p.layer !== s.layer) continue;
        const k = p.iy * m.grid.nx + p.ix;
        const meas = s.values[k]!;
        // at the noise floor a difference says nothing about the board
        if (!Number.isFinite(meas) || s.nearNoise[k]) continue;
        // the simulation at the height the probe really was (lifted over tall parts)
        let sum = 0;
        for (const l of engine.fieldLinesAt(p.bx, p.by, p.height))
          if (sel.mode === 'all' || (sel.mode === 'band' ? l.f >= sel.f0 && l.f < sel.f1 : Math.abs(l.f - sel.f) < 1)) sum += 10 ** (l.db / 10);
        values[k] = sum > 0 ? meas - 10 * Math.log10(sum) : NaN;
      }
    }
    return {
      y: surface + s.height,
      x0: m.grid.x0 - engine.frame.ox,
      z0: m.grid.y0 - engine.frame.oy,
      step: m.grid.step,
      nx: m.grid.nx,
      nz: m.grid.ny,
      values,
      lo: sh.mode === 'diff' ? -20 : app.view.dbLow,
      hi: sh.mode === 'diff' ? 20 : app.view.dbHigh,
      diverging: sh.mode === 'diff',
    };
  });
  v.setMeasurementSlices(out, app.view.colormap);
}

/**
 * Fit the enabled sources to a measurement: one power factor per source so that the simulated
 * power sum matches the measured power at the scan points (selected frequencies; points in the
 * background noise are left out).
 */
export function fitToMeasurement(index: number): SourceFitResult | null {
  const m = scanner.measurements[index];
  if (!m || !app.board || m.points.length === 0) return null;
  const sel = selectionFromView();
  const sl = slices(m, sel);
  const inSel = (f: number) => sel.mode === 'all' || (sel.mode === 'band' ? f >= sel.f0 && f < sel.f1 : Math.abs(f - sel.f) <= Math.max(1, sel.f * 1e-6));
  const sources = app.sources.filter((s) => s.enabled && app.models[s.id]);
  const P = sources.map(() => [] as number[]);
  const meas: number[] = [];
  for (const p of m.points) {
    const k = p.iy * m.grid.nx + p.ix;
    const s = sl[p.layer];
    const v = s?.values[k];
    const r = engine.readoutAt(p.bx - engine.frame.ox, p.height, p.by - engine.frame.oy, false);
    meas.push(s && v !== undefined && Number.isFinite(v) && !s.nearNoise[k] ? 10 ** (v / 10) : 0);
    sources.forEach((src, si) => {
      let pw = 0;
      for (const l of r?.sources.find((x) => x.id === src.id)?.lines ?? []) if (inSel(l.f)) pw += 10 ** (l.db / 10);
      P[si]!.push(pw);
    });
  }
  const f = fitSources(P, meas);
  const result: SourceFitResult = {
    index,
    sources: sources.map((s, i) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      db: f.determined[i] && f.factors[i]! > 0 ? 10 * Math.log10(f.factors[i]!) : null,
    })),
    residualDb: f.residualDb,
    points: f.points,
  };
  scanner.fit = result;
  return result;
}

/** Scale the sources' amplitudes by the fitted factors (power factor → amplitude √factor). */
export function applyFit() {
  const fit = scanner.fit;
  if (!fit) return;
  for (const r of fit.sources) {
    if (r.db === null) continue;
    const s = app.sources.find((x) => x.id === r.id);
    if (!s) continue;
    s.waveform.amplitude *= 10 ** (r.db / 20);
    engine.sourceChanged(s.id);
  }
  scanner.fit = null;
  showMeasurement();
}
