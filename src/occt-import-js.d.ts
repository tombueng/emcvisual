/** Minimal typing of occt-import-js (OpenCascade as WebAssembly), as used by render/step.worker.ts. */
declare module 'occt-import-js' {
  const factory: (overrides?: { locateFile?: (path: string) => string }) => Promise<{
    ReadStepFile(content: Uint8Array, params: unknown): {
      success: boolean;
      meshes: {
        name?: string;
        color?: [number, number, number];
        attributes: { position: { array: number[] }; normal?: { array: number[] } };
        index: { array: number[] };
        brep_faces?: { first: number; last: number; color: [number, number, number] | null }[];
      }[];
    };
  }>;
  export default factory;
}
