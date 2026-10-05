/**
 * Unpacking of the archives board data comes in (ODB++ as .zip, .tgz/.tar.gz or .tar), with
 * the decompression the browser and Node already have (DecompressionStream), no library.
 * Returns the files by path (forward slashes); directories are skipped.
 */
export class ArchiveError extends Error {}

async function inflate(data: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  const ds = new DecompressionStream(format);
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unpack(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return unzip(bytes);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return untar(await inflate(bytes, 'gzip'));
  return untar(bytes);
}

/** ZIP: read the central directory, inflate each stored or deflated entry. */
async function unzip(b: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ArchiveError('not a ZIP archive (no central directory)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new ArchiveError('damaged ZIP directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = b.subarray(start, start + csize);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflate(raw, 'deflate-raw'));
    else throw new ArchiveError(`ZIP compression method ${method} is not supported`);
  }
  return out;
}

/** TAR (ustar and GNU long names). */
function untar(b: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  const str = (o: number, n: number) => {
    const s = b.subarray(o, o + n);
    const z = s.indexOf(0);
    return dec.decode(z >= 0 ? s.subarray(0, z) : s);
  };
  let p = 0;
  let longName: string | null = null;
  while (p + 512 <= b.length) {
    if (b[p] === 0) break;
    let name = str(p, 100);
    const size = parseInt(str(p + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(b[p + 156] ?? 48);
    const prefix = str(p + 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const body = p + 512;
    if (type === 'L') longName = str(body, size);
    else if (type === '0' || type === '\0' || type === '7') {
      out.set(longName ?? name, b.slice(body, body + size));
      longName = null;
    } else longName = null;
    p = body + Math.ceil(size / 512) * 512;
  }
  if (!out.size) throw new ArchiveError('empty or unknown archive');
  return out;
}
