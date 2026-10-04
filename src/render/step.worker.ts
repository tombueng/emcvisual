/**
 * STEP files to triangle meshes in a worker (OpenCascade as WebAssembly, occt-import-js), so a
 * board with many parts does not block the page. The 7 MB WebAssembly file is only fetched
 * when the first STEP model is needed.
 */
import occtimportjs from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

type Rgb = [number, number, number];

interface OcctMesh {
  color?: Rgb;
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
  /** Triangle ranges of the B-rep faces; KiCad's models colour per face (body, pins, marking). */
  brep_faces?: { first: number; last: number; color: Rgb | null }[];
}

/** Triangles sorted by face colour, as index ranges with one colour each. */
function colourGroups(m: OcctMesh): { index: Uint32Array; groups: { start: number; count: number; color: Rgb | null }[] } {
  const src = m.index.array;
  const faces = m.brep_faces ?? [];
  if (!faces.some((f) => f.color)) return { index: Uint32Array.from(src), groups: [] };
  const byColour = new Map<string, { color: Rgb | null; tris: number[] }>();
  for (const f of faces) {
    const color = f.color ?? m.color ?? null;
    const key = color ? color.join(',') : '';
    let g = byColour.get(key);
    if (!g) byColour.set(key, (g = { color, tris: [] }));
    for (let t = f.first; t <= f.last; t++) g.tris.push(t);
  }
  const index = new Uint32Array(src.length);
  const groups: { start: number; count: number; color: Rgb | null }[] = [];
  let at = 0;
  for (const g of byColour.values()) {
    const start = at;
    for (const t of g.tris) {
      index[at++] = src[3 * t]!;
      index[at++] = src[3 * t + 1]!;
      index[at++] = src[3 * t + 2]!;
    }
    groups.push({ start, count: at - start, color: g.color });
  }
  return { index: at === src.length ? index : Uint32Array.from(src), groups: at === src.length ? groups : [] };
}

let occt: Promise<{ ReadStepFile(content: Uint8Array, params: unknown): { success: boolean; meshes: OcctMesh[] } }> | null = null;

self.onmessage = async (ev: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => {
  const { id, buffer } = ev.data;
  try {
    occt ??= occtimportjs({ locateFile: () => wasmUrl });
    const lib = await occt;
    // relative deflection: fine enough for small packages, coarse enough to stay light
    const res = lib.ReadStepFile(new Uint8Array(buffer), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.004, angularDeflection: 0.5 });
    if (!res.success) throw new Error('step-failed');
    const meshes = res.meshes.map((m) => {
      const { index, groups } = colourGroups(m);
      return {
        position: Float32Array.from(m.attributes.position.array),
        normal: m.attributes.normal ? Float32Array.from(m.attributes.normal.array) : null,
        index,
        color: m.color ?? null,
        groups,
      };
    });
    const transfer = meshes.flatMap((m) => [m.position.buffer, m.index.buffer, ...(m.normal ? [m.normal.buffer] : [])]);
    (self as unknown as Worker).postMessage({ id, meshes }, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: (e as Error).message || String(e) });
  }
};
