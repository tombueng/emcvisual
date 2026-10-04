/**
 * Real 3D models for the footprints, found by file name in places the user names: a local
 * folder (picked in the browser), a GitHub repository, and KiCad's public standard library.
 * A footprint refers to its model by path, e.g. "${KIPRJMOD}/3d/MyPart.step" or
 * "${KICAD10_3DMODEL_DIR}/Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm.step"; the file itself
 * lives on the designer's computer. Here the name (without extension) is looked up in the
 * sources, the best format is chosen (STEP, WRL, GLB/glTF, STL) and the model is placed like
 * KiCad places it (modelPlacement.ts).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import type { BoardModel, FootprintModel } from '../model/types';
import type { WorldFrame } from '../model/world';
import { modelMatrix, unitScale } from './modelPlacement';

export interface ModelFile {
  /** File name with extension. */
  name: string;
  /** Path inside the source, for messages. */
  path: string;
  source: 'folder' | 'repo' | 'kicad';
  read(): Promise<ArrayBuffer>;
}

const EXT = /\.(step|stp|wrl|glb|gltf|stl)$/i;
/** Preferred format when one model exists in several. */
const RANK: Record<string, number> = { step: 0, stp: 0, glb: 1, gltf: 2, wrl: 3, stl: 4 };

const stemOf = (p: string) => (p.split(/[\\/]/).pop() ?? '').replace(EXT, '').toLowerCase();
const extOf = (p: string) => (EXT.exec(p)?.[1] ?? '').toLowerCase();

/**
 * KiCad's standard 3D library (gitlab.com/kicad/libraries/kicad-packages3D), read through
 * GitLab's file API, which allows cross-origin reads. Since KiCad 9 it holds STEP files only.
 */
const KICAD_PROJECT = 21604637;
const kicadUrl = (path: string) => `https://gitlab.com/api/v4/projects/${KICAD_PROJECT}/repository/files/${encodeURIComponent(path)}/raw?ref=master`;

const fetchBuffer = (url: string) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))));

export class ModelLibrary {
  private index = new Map<string, ModelFile[]>();
  /** Labels of the sources added, for the panel. */
  readonly sources: { kind: 'folder' | 'repo'; label: string; files: number }[] = [];
  useKicad = true;
  /**
   * Folder address of a board opened from the web: models the board names relative to its
   * project (${KIPRJMOD}/3d/part.step, or a plain relative path) are fetched from there.
   */
  projectBase: string | null = null;
  /** Loaded models by source and path, kept while the page is open (shared by all boards). */
  readonly loaded = new Map<string, Promise<THREE.Object3D | null>>();

  load(f: ModelFile): Promise<THREE.Object3D | null> {
    const key = `${f.source}:${f.path}`;
    let p = this.loaded.get(key);
    if (!p) {
      p = loadFile(f).catch(() => null);
      this.loaded.set(key, p);
    }
    return p;
  }

  private add(f: ModelFile) {
    const key = stemOf(f.name);
    const list = this.index.get(key) ?? [];
    list.push(f);
    this.index.set(key, list);
  }

  /** Files from <input webkitdirectory> or a drop. */
  addFiles(files: File[], label: string) {
    let n = 0;
    for (const f of files) {
      if (!EXT.test(f.name)) continue;
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      this.add({ name: f.name, path: rel, source: 'folder', read: () => f.arrayBuffer() });
      n++;
    }
    this.sources.push({ kind: 'folder', label, files: n });
    return n;
  }

  /** A folder handle from showDirectoryPicker (Chromium), walked recursively. */
  async addDirectory(dir: FileSystemDirectoryHandleLike, label = dir.name) {
    let n = 0;
    const walk = async (d: FileSystemDirectoryHandleLike, prefix: string) => {
      for await (const [name, h] of d.entries()) {
        if (h.kind === 'directory') await walk(h as unknown as FileSystemDirectoryHandleLike, `${prefix}${name}/`);
        else if (EXT.test(name)) {
          const fh = h as unknown as { getFile(): Promise<File> };
          this.add({ name, path: `${prefix}${name}`, source: 'folder', read: async () => (await fh.getFile()).arrayBuffer() });
          n++;
        }
      }
    };
    await walk(dir, '');
    this.sources.push({ kind: 'folder', label, files: n });
    return n;
  }

  /**
   * A GitHub repository, e.g. https://github.com/owner/repo or …/tree/branch/sub/folder.
   * The file list comes from the GitHub API (one request), the files from raw.githubusercontent.com.
   */
  async addGithub(url: string) {
    const m = /github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/]+)(?:\/(.*))?)?/.exec(url.trim());
    if (!m) throw new Error('not-a-github-url');
    const [, owner, repoRaw, branchIn, sub] = m;
    const repo = repoRaw!.replace(/\.git$/, '');
    let branch = branchIn;
    if (!branch) {
      const info = await fetch(`https://api.github.com/repos/${owner}/${repo}`).then((r) => (r.ok ? r.json() : null));
      branch = info?.default_branch ?? 'main';
    }
    const tree = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`).then((r) => {
      if (!r.ok) throw new Error(`github-${r.status}`);
      return r.json() as Promise<{ tree: { path: string; type: string }[] }>;
    });
    let n = 0;
    for (const e of tree.tree) {
      if (e.type !== 'blob' || !EXT.test(e.path) || (sub && !e.path.startsWith(sub))) continue;
      const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${e.path.split('/').map(encodeURIComponent).join('/')}`;
      this.add({ name: e.path.split('/').pop()!, path: e.path, source: 'repo', read: () => fetchBuffer(raw) });
      n++;
    }
    this.sources.push({ kind: 'repo', label: `${owner}/${repo}${sub ? `/${sub}` : ''}`, files: n });
    return n;
  }

  /**
   * The file for a footprint's model path: own sources first, then the board's own project
   * folder (boards opened from the web), then KiCad's library.
   */
  resolve(modelPath: string): ModelFile | null {
    const list = this.index.get(stemOf(modelPath));
    if (list?.length) {
      // prefer the same library folder name (e.g. "Package_SO.3dshapes"), then the better format
      const dir = modelPath.split(/[\\/]/).slice(-2, -1)[0]?.toLowerCase() ?? '';
      return [...list].sort((a, b) => {
        const da = a.path.toLowerCase().includes(dir) ? 0 : 1;
        const db = b.path.toLowerCase().includes(dir) ? 0 : 1;
        return da - db || (RANK[extOf(a.name)] ?? 9) - (RANK[extOf(b.name)] ?? 9);
      })[0]!;
    }
    const rel = /^\$\{KIPRJMOD\}[\\/](.+)$/.exec(modelPath)?.[1] ?? (/^(\$\{|[a-z]:|[\\/~])/i.test(modelPath) ? null : modelPath);
    if (this.projectBase && rel && EXT.test(rel)) {
      const url = new URL(rel.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/'), this.projectBase).href;
      return { name: rel.split(/[\\/]/).pop()!, path: rel, source: 'repo', read: () => fetchBuffer(url) };
    }
    const std = /\$\{(?:KICAD\d*_3DMODEL_DIR|KISYS3DMOD)\}[\\/](.+?\.3dshapes)[\\/]([^\\/]+)$/i.exec(modelPath);
    if (this.useKicad && std) {
      // the library has STEP files only now; older boards name the VRML twin
      const name = std[2]!.replace(EXT, '.step');
      const path = `${std[1]}/${name}`;
      return { name, path, source: 'kicad', read: () => fetchBuffer(kicadUrl(path)) };
    }
    return null;
  }
}

/** The bits of FileSystemDirectoryHandle used here (not in every TypeScript DOM lib). */
export interface FileSystemDirectoryHandleLike {
  kind: 'directory';
  name: string;
  entries(): AsyncIterable<[string, { kind: 'file' | 'directory' }]>;
}

// --- loading ----------------------------------------------------------------------------------------

let stepWorker: Worker | null = null;
let stepJob = 0;
const stepWaiting = new Map<number, { resolve: (v: THREE.Object3D) => void; reject: (e: Error) => void }>();

function loadStep(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  if (!stepWorker) {
    stepWorker = new Worker(new URL('./step.worker.ts', import.meta.url), { type: 'module' });
    type Rgb = [number, number, number];
    type StepMesh = { position: Float32Array; normal: Float32Array | null; index: Uint32Array; color: Rgb | null; groups: { start: number; count: number; color: Rgb | null }[] };
    // STEP colours are sRGB, as KiCad shows them
    const material = (c: Rgb | null) =>
      new THREE.MeshStandardMaterial({ color: c ? new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) : new THREE.Color('#2a2e35'), roughness: 0.55, metalness: 0.1 });
    stepWorker.onmessage = (ev: MessageEvent<{ id: number; error?: string; meshes?: StepMesh[] }>) => {
      const w = stepWaiting.get(ev.data.id);
      if (!w) return;
      stepWaiting.delete(ev.data.id);
      if (ev.data.error || !ev.data.meshes) return w.reject(new Error(ev.data.error ?? 'step'));
      const group = new THREE.Group();
      for (const m of ev.data.meshes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
        if (m.normal) g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
        g.setIndex(new THREE.BufferAttribute(m.index, 1));
        if (!m.normal) g.computeVertexNormals();
        if (m.groups.length > 1) {
          m.groups.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
          group.add(new THREE.Mesh(g, m.groups.map((gr) => material(gr.color))));
        } else group.add(new THREE.Mesh(g, material(m.groups[0]?.color ?? m.color)));
      }
      w.resolve(group);
    };
  }
  const id = ++stepJob;
  return new Promise((resolve, reject) => {
    stepWaiting.set(id, { resolve, reject });
    stepWorker!.postMessage({ id, buffer }, [buffer]);
  });
}

async function loadFile(f: ModelFile): Promise<THREE.Object3D> {
  const buf = await f.read();
  switch (extOf(f.name)) {
    case 'step':
    case 'stp':
      return loadStep(buf);
    case 'wrl':
      return new VRMLLoader().parse(new TextDecoder().decode(buf), '');
    case 'stl': {
      const g = new STLLoader().parse(buf);
      g.computeVertexNormals();
      return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.6 }));
    }
    default:
      return (await new GLTFLoader().parseAsync(buf, '')).scene;
  }
}

export interface LibraryModels {
  group: THREE.Group;
  /** References that got at least one model. */
  matched: Set<string>;
  /** Footprints with model references but no file found, with the paths looked for. */
  missing: { ref: string; path: string }[];
  /** How many models came from each source. */
  bySource: Record<ModelFile['source'], number>;
}

/**
 * Load and place the models of every footprint (skipping references in `skip`, e.g. those a
 * GLB export already covers). Each file is loaded once; the placed copies share its geometry,
 * so the group is removed from the scene, not disposed.
 */
export async function buildLibraryModels(
  lib: ModelLibrary,
  board: BoardModel,
  frame: WorldFrame,
  skip: Set<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<LibraryModels> {
  const group = new THREE.Group();
  group.name = 'library-models';
  const matched = new Set<string>();
  const missing: LibraryModels['missing'] = [];
  const bySource = { folder: 0, repo: 0, kicad: 0 };
  const jobs: { ref: string; fpIndex: number; m: FootprintModel; file: ModelFile }[] = [];
  board.footprints.forEach((fp, i) => {
    if (skip.has(fp.ref)) return;
    for (const m of fp.models) {
      if (m.hidden) continue;
      const file = lib.resolve(m.path);
      if (file) jobs.push({ ref: fp.ref, fpIndex: i, m, file });
      else missing.push({ ref: fp.ref, path: m.path });
    }
  });
  let done = 0;
  await Promise.all(
    jobs.map(async (j) => {
      const obj = await lib.load(j.file);
      done++;
      onProgress?.(done, jobs.length);
      if (!obj) {
        missing.push({ ref: j.ref, path: j.m.path });
        return;
      }
      const fp = board.footprints[j.fpIndex]!;
      const copy = obj.clone(true);
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(modelMatrix(board, frame, fp, j.m, unitScale(j.file.name)));
      let holder = group.getObjectByName(j.ref);
      if (!holder) {
        holder = new THREE.Group();
        holder.name = j.ref;
        group.add(holder);
      }
      holder.add(copy);
      if (!matched.has(j.ref)) bySource[j.file.source]++;
      matched.add(j.ref);
    }),
  );
  return { group, matched, missing, bySource };
}
