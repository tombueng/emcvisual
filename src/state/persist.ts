/** Browser storage (per-viewer convenience only) and file download/upload helpers. */
import { branding } from '../branding';

const key = (k: string) => `${branding.storageNamespace}:${k}`;

export function loadLocal<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(key(k));
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function saveLocal(k: string, value: unknown): void {
  try {
    localStorage.setItem(key(k), JSON.stringify(value));
  } catch {
    // storage full, blocked or unavailable: the app works without it
  }
}

export function downloadText(fileName: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(fileName: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
