/**
 * Minimal Web Serial typing and a line-oriented port wrapper (Chromium only). The DOM
 * library of TypeScript does not ship these types.
 */
export interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialLike {
  requestPort(o?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<SerialPortLike>;
}

export function serialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export async function requestPort(filters?: { usbVendorId?: number; usbProductId?: number }[]): Promise<SerialPortLike> {
  const serial = (navigator as unknown as { serial?: SerialLike }).serial;
  if (!serial) throw new Error('web-serial-unavailable');
  return serial.requestPort(filters ? { filters } : undefined);
}

/** Text over a serial port: write lines, read until a terminator appears. */
export class SerialText {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = '';
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  constructor(private port: SerialPortLike) {}

  async open(baudRate = 115200) {
    await this.port.open({ baudRate });
    this.reader = this.port.readable!.getReader();
    this.writer = this.port.writable!.getWriter();
  }

  async write(text: string) {
    await this.writer!.write(this.encoder.encode(text));
  }

  /** Read until `until` matches the accumulated text; returns the text before the match. */
  async readUntil(until: RegExp, timeoutMs = 10000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const m = until.exec(this.buffer);
      if (m) {
        const out = this.buffer.slice(0, m.index);
        this.buffer = this.buffer.slice(m.index + m[0].length);
        return out;
      }
      if (Date.now() > deadline) throw new Error('serial-timeout');
      const timer = new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), Math.max(10, deadline - Date.now())));
      const chunk = await Promise.race([this.reader!.read(), timer]);
      if (chunk.value) this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }

  async close() {
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port.close();
    } catch {
      // already closed
    }
  }
}
