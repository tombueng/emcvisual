/// <reference lib="webworker" />
import { traceFieldLines, type LineTraceInput, type TracedLines } from './fieldlines';

self.onmessage = (ev: MessageEvent<{ id: number; input: LineTraceInput }>) => {
  const out: TracedLines = traceFieldLines(ev.data.input);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: ev.data.id, out }, [
    out.positions.buffer,
    out.mags.buffer,
    out.arc.buffer,
    out.offsets.buffer,
  ]);
};
