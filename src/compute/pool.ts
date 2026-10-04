/**
 * Worker pool for field volumes. A job is split into small blocks of z-rows that workers
 * pull one after another, so a job can be cancelled between blocks without shared memory.
 */
import type { ElementPack } from '../physics/images';
import type { Grid } from './grid';
import type { WorkerIn, WorkerOut } from './field.worker';

export interface VolumeJob {
  promise: Promise<Float32Array>;
  cancel(): void;
}

interface Running {
  job: number;
  grid: Grid;
  out: Float32Array;
  queue: [number, number][];
  pending: number;
  total: number;
  done: number;
  resolve(v: Float32Array): void;
  reject(e: Error): void;
  onProgress?: (fraction: number) => void;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export class FieldPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private jobs: Running[] = [];
  private nextJob = 1;

  constructor(size = Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./field.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<WorkerOut>) => this.onResult(w, ev.data);
      w.onerror = (ev) => this.onError(w, ev);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  get size() {
    return this.workers.length;
  }

  computeVolume(pack: ElementPack, grid: Grid, cover: Uint32Array, onProgress?: (f: number) => void): VolumeJob {
    const job = this.nextJob++;
    // aim for blocks of roughly 50k points so cancelling stays responsive
    const rows = Math.max(1, Math.floor(50_000 / (grid.nx * grid.ny)));
    const queue: [number, number][] = [];
    for (let iz = 0; iz < grid.nz; iz += rows) queue.push([iz, Math.min(grid.nz, iz + rows)]);
    let running!: Running;
    const promise = new Promise<Float32Array>((resolve, reject) => {
      running = {
        job,
        grid,
        out: new Float32Array(grid.nx * grid.ny * grid.nz),
        queue,
        pending: 0,
        total: queue.length,
        done: 0,
        resolve,
        reject,
        onProgress,
      };
    });
    this.jobs.push(running);
    for (const w of this.workers) w.postMessage({ type: 'job', job, pack, grid, cover } satisfies WorkerIn);
    this.pump();
    return {
      promise,
      cancel: () => {
        const i = this.jobs.indexOf(running);
        if (i >= 0) {
          this.jobs.splice(i, 1);
          this.drop(job);
          running.reject(new CancelledError());
        }
      },
    };
  }

  private drop(job: number) {
    for (const w of this.workers) w.postMessage({ type: 'drop', job } satisfies WorkerIn);
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
  }

  private pump() {
    while (this.idle.length > 0) {
      const r = this.jobs.find((j) => j.queue.length > 0);
      if (!r) return;
      const [iz0, iz1] = r.queue.shift()!;
      const w = this.idle.pop()!;
      r.pending++;
      w.postMessage({ type: 'block', job: r.job, iz0, iz1 } satisfies WorkerIn);
    }
  }

  private onResult(w: Worker, m: WorkerOut) {
    this.idle.push(w);
    const r = this.jobs.find((j) => j.job === m.job);
    if (r && m.data) {
      r.out.set(m.data, m.iz0 * r.grid.nx * r.grid.ny);
      r.pending--;
      r.done++;
      r.onProgress?.(r.done / r.total);
      if (r.queue.length === 0 && r.pending === 0) {
        this.jobs.splice(this.jobs.indexOf(r), 1);
        this.drop(r.job);
        r.resolve(r.out);
      }
    }
    this.pump();
  }

  private onError(w: Worker, ev: ErrorEvent) {
    this.idle.push(w);
    const r = this.jobs.shift();
    r?.reject(new Error(ev.message || 'worker error'));
    this.pump();
  }
}
