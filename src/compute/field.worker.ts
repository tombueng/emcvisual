/// <reference lib="webworker" />
import { computeBlock, type FieldKind } from './fieldKernel';
import type { Grid } from './grid';
import type { ElementPack } from '../physics/images';

export type WorkerIn =
  | { type: 'job'; job: number; pack: ElementPack; grid: Grid; cover: Uint32Array; kind: FieldKind }
  | { type: 'block'; job: number; iz0: number; iz1: number }
  | { type: 'drop'; job: number };

export type WorkerOut = { type: 'block'; job: number; iz0: number; iz1: number; data: Float32Array | null };

const jobs = new Map<number, { pack: ElementPack; grid: Grid; cover: Uint32Array; kind: FieldKind }>();

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === 'job') {
    jobs.set(m.job, { pack: m.pack, grid: m.grid, cover: m.cover, kind: m.kind });
    return;
  }
  if (m.type === 'drop') {
    jobs.delete(m.job);
    return;
  }
  const j = jobs.get(m.job);
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  if (!j) {
    // job was dropped while this block waited in the queue; report back so the pool frees us
    scope.postMessage({ type: 'block', job: m.job, iz0: m.iz0, iz1: m.iz1, data: null } satisfies WorkerOut);
    return;
  }
  const data = computeBlock(j.pack, j.grid, j.cover, m.iz0, m.iz1, undefined, j.kind);
  scope.postMessage({ type: 'block', job: m.job, iz0: m.iz0, iz1: m.iz1, data } satisfies WorkerOut, [data.buffer]);
};
