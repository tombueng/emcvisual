/**
 * KiCad live coupling without a bridge (W4): a board opened through the File System Access API
 * (Chromium browsers) is watched, and when KiCad saves it the board reloads with sources, view,
 * camera and component models kept. Other browsers open the file once, as before.
 */
import { app } from './app.svelte';
import { engine } from './engine.svelte';
import { t } from '../i18n';

/** The parts of the File System Access API used here (not in every TypeScript DOM lib). */
export interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o: { multiple?: boolean }) => Promise<FileHandle[]>;
};
type HandleItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileHandle | { kind: 'directory' } | null> };

const POLL_MS = 1000;
/** A half-written file may fail to parse: try again a few times before giving up on it. */
const RETRIES = 3;

class LiveFile {
  following = $state(false);
  name = $state('');
}

export const live = new LiveFile();

let handle: FileHandle | null = null;
let lastModified = 0;
let failures = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

export const canWatch = typeof window !== 'undefined' && typeof (window as PickerWindow).showOpenFilePicker === 'function';

/**
 * File dialog that also returns a handle for watching. Returns null when cancelled and
 * 'fallback' when the browser has no such dialog (then the plain file input is used).
 */
export async function pickWithHandle(): Promise<{ file: File; handle: FileHandle } | null | 'fallback'> {
  const w = window as PickerWindow;
  if (!w.showOpenFilePicker) return 'fallback';
  try {
    // no type filter: Chromium rejects "_" in extensions such as .kicad_pcb
    const [h] = await w.showOpenFilePicker({ multiple: false });
    if (!h) return null;
    return { file: await h.getFile(), handle: h };
  } catch (e) {
    // AbortError: the dialog was closed
    if ((e as DOMException).name === 'AbortError') return null;
    return 'fallback';
  }
}

/** Handles of dropped files; must be called synchronously inside the drop event. */
export function dropHandles(e: DragEvent): Promise<(FileHandle | null)[]> {
  const items = [...(e.dataTransfer?.items ?? [])] as HandleItem[];
  return Promise.all(
    items.map((it) =>
      it.kind === 'file' && it.getAsFileSystemHandle
        ? it
            .getAsFileSystemHandle()
            .then((h) => (h && h.kind === 'file' ? (h as FileHandle) : null))
            .catch(() => null)
        : Promise.resolve(null),
    ),
  );
}

/** Start following a board file (replaces any file followed before). */
export function follow(h: FileHandle, file: File) {
  stopFollowing();
  handle = h;
  lastModified = file.lastModified;
  failures = 0;
  live.following = true;
  live.name = file.name;
  timer = setInterval(() => void poll(), POLL_MS);
}

export function stopFollowing() {
  if (timer) clearInterval(timer);
  timer = null;
  handle = null;
  live.following = false;
  live.name = '';
}

async function poll() {
  if (!handle || busy || app.loading) return;
  busy = true;
  try {
    const f = await handle.getFile();
    if (f.lastModified === lastModified) return;
    // KiCad as text (as on the first load), other formats as bytes
    const data = /\.kicad_pcb$/i.test(f.name) ? await f.text() : await f.arrayBuffer();
    try {
      await engine.loadBoard(data, f.name, null, true);
      lastModified = f.lastModified;
      failures = 0;
      app.toast = t.live.reloaded;
    } catch {
      // KiCad may still be writing: retry on the next ticks, then wait for the next save
      if (++failures >= RETRIES) {
        lastModified = f.lastModified;
        failures = 0;
        app.toast = t.live.failed;
      }
    }
  } catch {
    // the file is gone or permission was withdrawn
    stopFollowing();
    app.toast = t.live.lost;
  } finally {
    busy = false;
  }
}
