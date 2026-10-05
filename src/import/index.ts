/**
 * Board import: recognises the file format and turns it into a BoardModel.
 *
 * Supported: KiCad (.kicad_pcb, 6 to 10), IPC-2581 (.xml/.cvg, revisions B and C), Eagle and
 * Fusion 360 Electronics (.brd, XML since Eagle 6), ODB++ (.tgz/.zip/.tar archive or the
 * unpacked folder's files). See docs/IMPORT.md for what each importer reads and what it
 * approximates.
 */
import { parseBoard } from '../kicad/parseBoard';
import type { BoardModel } from '../model/types';
import { ImportError } from './builder';
import { isIpc2581, parseIpc2581 } from './ipc2581';

export { ImportError } from './builder';

export type BoardFormat = 'kicad' | 'ipc2581' | 'eagle' | 'odb';

/** File name extensions the open dialog and the drop handler accept as boards. */
export const BOARD_EXTENSIONS = ['.kicad_pcb', '.brd', '.xml', '.cvg', '.tgz', '.zip', '.tar', '.gz'];

/** File name without the board extension, for the names of exported files. */
export function boardBaseName(name: string): string {
  return name.replace(/\.(kicad_pcb|brd|xml|cvg|tgz|tar\.gz|tar|zip)$/i, '');
}

export function isBoardFileName(name: string): boolean {
  const n = name.toLowerCase();
  return BOARD_EXTENSIONS.some((e) => n.endsWith(e));
}

const textOf = (data: ArrayBuffer | string) => (typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data));

/** The format from the content (the name only breaks ties). */
export function detectFormat(name: string, head: string): BoardFormat | null {
  const h = head.trimStart().slice(0, 4000);
  if (h.startsWith('(kicad_pcb')) return 'kicad';
  if (isIpc2581(h)) return 'ipc2581';
  if (/<eagle[\s>]/.test(h)) return 'eagle';
  if (/\.(tgz|zip|tar|gz)$/i.test(name)) return 'odb';
  return null;
}

/** Magic numbers of the archives ODB++ comes in. */
function isArchive(bytes: Uint8Array): boolean {
  return (bytes[0] === 0x1f && bytes[1] === 0x8b) || (bytes[0] === 0x50 && bytes[1] === 0x4b) || new TextDecoder().decode(bytes.subarray(257, 262)) === 'ustar';
}

/** Read a board file of any supported format. */
export async function importBoard(name: string, data: ArrayBuffer | string): Promise<BoardModel> {
  if (typeof data !== 'string' && isArchive(new Uint8Array(data, 0, Math.min(data.byteLength, 512)))) {
    const { parseOdbArchive } = await import('./odb');
    return parseOdbArchive(data, name);
  }
  const text = textOf(data);
  const format = detectFormat(name, text.slice(0, 4000));
  switch (format) {
    case 'kicad':
      return parseBoard(text, name);
    case 'ipc2581':
      return parseIpc2581(text, name);
    case 'eagle': {
      const { parseEagle } = await import('./eagle');
      return parseEagle(text, name);
    }
    default:
      if (/\.brd$/i.test(name) && !text.trimStart().startsWith('<'))
        throw new ImportError('binary Eagle file (before version 6): open it in Eagle 6 or later and save it again, or export it from KiCad');
      throw new ImportError('unknown board format: supported are KiCad (.kicad_pcb), IPC-2581 (.xml), Eagle/Fusion 360 (.brd) and ODB++ (.tgz/.zip)');
  }
}
