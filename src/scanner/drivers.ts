/**
 * Real hardware (experimental, written against the documented protocols; not yet tried on
 * the devices):
 * - OctoPrint REST API: G-code via POST /api/printer/command. OctoPrint queues the commands
 *   and answers at once, so arrival is estimated from distance and feed rate. The app must be
 *   served over http (e.g. npm run dev) to reach an http OctoPrint, and CORS must be allowed in
 *   OctoPrint (Settings → API).
 * - G-code over USB (Marlin and similar) with Web Serial: waits for "ok" after M400.
 * - tinySA / tinySA Ultra over USB with Web Serial: "scan start stop points 3" returns lines of
 *   "frequency value" (dBm) followed by the "ch>" prompt.
 */
import { SerialText, requestPort } from './webserial';
import type { Positioner, PrinterPoint, Receiver, Sweep, SweepSettings } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (v: number) => v.toFixed(3);

export class OctoPrintPositioner implements Positioner {
  readonly label: string;
  private current: PrinterPoint | null = null;
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private settleMs = 250,
  ) {
    this.label = `OctoPrint ${baseUrl}`;
  }

  private async command(commands: string[]) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/printer/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.apiKey },
      body: JSON.stringify({ commands }),
    });
    if (!res.ok) throw new Error(`octoprint-${res.status}`);
  }

  async home() {
    await this.command(['G28']);
    await sleep(30000);
    this.current = { x: 0, y: 0, z: 0 };
  }

  async moveTo(p: PrinterPoint, feed: number) {
    await this.command(['G90', `G0 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)} F${Math.round(feed)}`, 'M400']);
    const from = this.current ?? p;
    const d = Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
    // the planner accelerates: allow 30 % more than the pure feed time, plus latency
    await sleep((d / feed) * 60000 * 1.3 + this.settleMs + 150);
    this.current = { ...p };
  }
}

export class SerialGcodePositioner implements Positioner {
  readonly label = 'G-Code (USB)';
  private io: SerialText | null = null;

  async connect(baud = 115200) {
    this.io = new SerialText(await requestPort());
    await this.io.open(baud);
    await sleep(2000); // Marlin resets on connect
    await this.send('M110 N0');
  }

  private async send(line: string) {
    await this.io!.write(`${line}\n`);
    await this.io!.readUntil(/^ok.*$/m, 120000);
  }

  async home() {
    await this.send('G28');
  }

  async moveTo(p: PrinterPoint, feed: number) {
    await this.send('G90');
    await this.send(`G0 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)} F${Math.round(feed)}`);
    await this.send('M400');
  }

  async close() {
    await this.io?.close();
  }
}

export class TinySAReceiver implements Receiver {
  readonly label = 'tinySA (USB)';
  private io: SerialText | null = null;

  async connect() {
    // STMicro virtual COM port (tinySA, tinySA Ultra)
    this.io = new SerialText(await requestPort([{ usbVendorId: 0x0483 }]));
    await this.io.open(115200);
    await this.io.write('\r');
    await this.io.readUntil(/ch> $/m, 3000).catch(() => '');
  }

  async sweep(s: SweepSettings): Promise<Sweep> {
    await this.io!.write(`scan ${Math.round(s.fStart)} ${Math.round(s.fStop)} ${s.points} 3\r`);
    const text = await this.io!.readUntil(/ch> /, 60000);
    return parseTinySAScan(text, s.points);
  }

  async close() {
    await this.io?.close();
  }
}

/** Parse the output of "scan … 3": an echo line, then "frequency value" lines. */
export function parseTinySAScan(text: string, points: number): Sweep {
  const freqs: number[] = [];
  const dbm: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9.]+(?:e[+-]?\d+)?)\s+(-?[0-9.]+(?:e[+-]?\d+)?)\s*$/i.exec(line);
    if (!m) continue;
    freqs.push(Number(m[1]));
    dbm.push(Number(m[2]));
  }
  if (freqs.length === 0) throw new Error('tinysa-no-data');
  if (freqs.length !== points) console.warn(`tinySA returned ${freqs.length} of ${points} points`);
  return { freqs: Float64Array.from(freqs), dbm: Float32Array.from(dbm) };
}
