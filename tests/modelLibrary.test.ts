import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import occtimportjs from 'occt-import-js';
import { ModelLibrary } from '../src/render/modelLibrary';

const file = (rel: string) => Object.assign(new File(['x'], rel.split('/').pop()!), { webkitRelativePath: rel });

describe('model library lookup', () => {
  it('finds own models by file name, the same library folder and STEP first', () => {
    const lib = new ModelLibrary();
    lib.addFiles(
      [
        file('models/Misc.3dshapes/SOT-23-6.wrl'),
        file('models/Package_TO_SOT_SMD.3dshapes/SOT-23-6.wrl'),
        file('models/Package_TO_SOT_SMD.3dshapes/SOT-23-6.step'),
        file('models/3d/MyRelay.STEP'),
        file('models/readme.txt'),
      ],
      'models',
    );
    expect(lib.sources).toEqual([{ kind: 'folder', label: 'models', files: 4 }]);
    const sot = lib.resolve('${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23-6.wrl')!;
    expect(sot.source).toBe('folder');
    expect(sot.path).toBe('models/Package_TO_SOT_SMD.3dshapes/SOT-23-6.step');
    // custom models under any variable, upper-case extension, Windows separators
    expect(lib.resolve('${MY_LIB_3D}\\relays\\myrelay.step')?.path).toBe('models/3d/MyRelay.STEP');
  });

  it('fetches project models next to a board opened from the web', () => {
    const lib = new ModelLibrary();
    lib.projectBase = 'https://raw.githubusercontent.com/o/r/main/hw/';
    const f = lib.resolve('${KIPRJMOD}/3d/Part A.step')!;
    expect(f.source).toBe('repo');
    expect(f.name).toBe('Part A.step');
    expect(lib.resolve('lib/x.wrl')?.path).toBe('lib/x.wrl');
    // absolute paths on someone's disk cannot be fetched
    expect(lib.resolve('/home/me/x.step')).toBeNull();
    expect(lib.resolve('C:/models/x.step')).toBeNull();
  });

  it('takes KiCad standard parts from the KiCad library, as STEP', () => {
    const lib = new ModelLibrary();
    const f = lib.resolve('${KISYS3DMOD}/Resistor_SMD.3dshapes/R_0603_1608Metric.wrl')!;
    expect(f).toMatchObject({ source: 'kicad', name: 'R_0603_1608Metric.step', path: 'Resistor_SMD.3dshapes/R_0603_1608Metric.step' });
    expect(lib.resolve('${KIPRJMOD}/3d/x.step')).toBeNull();
    lib.useKicad = false;
    expect(lib.resolve('${KICAD10_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0603_1608Metric.step')).toBeNull();
  });
});

describe('STEP to triangles', () => {
  it('reads a STEP file with the settings the worker uses', async () => {
    // a 2 x 1.5 mm board body (about 0.93 mm thick: KiCad leaves the copper out), from kicad-cli
    const occt = await occtimportjs();
    const res = occt.ReadStepFile(new Uint8Array(readFileSync('tests/fixtures/box.step')), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.004, angularDeflection: 0.5 });
    expect(res.success).toBe(true);
    const pos = res.meshes.flatMap((m) => m.attributes.position.array);
    const span = (k: number) => Math.max(...pos.filter((_, i) => i % 3 === k)) - Math.min(...pos.filter((_, i) => i % 3 === k));
    expect([span(0), span(1)].map((v) => Math.round(v * 100) / 100)).toEqual([2, 1.5]);
    expect(span(2)).toBeGreaterThan(0.85);
    expect(span(2)).toBeLessThan(1.01);
  }, 30_000); // loading the 7.6 MB WebAssembly can take a while on a busy machine
});
