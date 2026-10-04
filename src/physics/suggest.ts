/**
 * Source suggestions from net names, pin functions and pin types. Heuristics only: the user
 * confirms and adjusts every suggestion.
 */
import { dist } from '../model/geometry';
import type { BoardModel } from '../model/types';
import { detectDriver, padName } from './currents';
import { SOURCE_COLORS, type Source } from './sources';

export interface Suggestion {
  /** Stable key so the UI can hide suggestions that were already added. */
  key: string;
  reason: string;
  source: Source;
}

const CLOCK = /(^|[_/\-])(CLK|SCK|SCLK|MCLK|BCLK|LRCLK|XTAL|XIN|XOUT|OSC|XO)([_\-\d]|$)|CLK/i;
const DATA = /(MOSI|MISO|SDA|SDO|SDI|DATA|TXD|RXD|(^|[_/])TX|(^|[_/])RX|QSPI|SPI_|D\d+$)/i;
const DIFF_P = /^(.*?)(D\+|_DP|DP|_P|\+)$/i;
const SW_FN = /^(SW|LX|PH|PHASE)\d*$/i;
const VIN_FN = /^(VIN|PVIN|VCC|VDD|IN)\d*$/i;
const GND_FN = /^(GND|PGND|VSS|AGND)\d*$/i;

/** "CLK_48M" -> 48e6, "OSC_32K" -> 32768-ish values from the name, else fallback. */
function frequencyFromName(name: string, fallback: number): number {
  const m = /(\d+(?:[.,]\d+)?)\s*(M|MHZ|K|KHZ)\b/i.exec(name.replace(/_/g, ' '));
  if (!m) return fallback;
  const v = Number(m[1]!.replace(',', '.'));
  return /k/i.test(m[2]!) ? v * 1e3 : v * 1e6;
}

export function suggestSources(board: BoardModel): Suggestion[] {
  const out: Suggestion[] = [];
  let color = 0;
  const nextColor = () => SOURCE_COLORS[color++ % SOURCE_COLORS.length]!;
  const padsOf = (net: number) => board.pads.filter((p) => p.net === net);
  const routed = new Set(board.tracks.map((t) => t.net));
  const used = new Set<number>();

  // differential pairs: name ends in +/P and a partner with -/N exists
  board.nets.forEach((name, i) => {
    const m = DIFF_P.exec(name);
    if (!m || i === 0) return;
    const stem = m[1]!;
    const suffix = m[2]!;
    if (stem.replace(/[/_.\-]/g, '').length === 0) return; // nets like "/+" are supplies, not pairs
    const partnerSuffix = suffix.replace('+', '-').replace(/P$/i, (s) => (s === 'P' ? 'N' : 'n')).replace(/DP$/i, 'DN');
    const j = board.nets.indexOf(stem + partnerSuffix);
    if (j <= 0 || !routed.has(i) || !routed.has(j)) return;
    used.add(i);
    used.add(j);
    const usb = /USB/i.test(name);
    out.push({
      key: `diff:${name}`,
      reason: usb ? 'usb-pair' : 'diff-pair',
      source: {
        id: `s-${crypto.randomUUID().slice(0, 8)}`,
        type: 'diffpair',
        kind: 'data',
        name: usb ? `USB ${stem.replace(/[_-]$/, '') || ''}`.trim() : name.replace(/(\+|P)$/i, '±'),
        enabled: true,
        color: nextColor(),
        netP: name,
        netN: board.nets[j]!,
        driverP: '',
        driverN: '',
        waveform: usb ? { f0: 6e6, duty: 0.5, tr: 4e-9, amplitude: 3.3 } : { f0: 50e6, duty: 0.5, tr: 0.5e-9, amplitude: 0.4 },
        load: { model: 'capacitive', cLoad: 5e-12 },
        imbalance: 0.05,
      },
    });
  });

  // clocks and data lines by name
  board.nets.forEach((name, i) => {
    if (i === 0 || used.has(i) || !routed.has(i) || padsOf(i).length < 2) return;
    const clock = CLOCK.test(name);
    const data = !clock && DATA.test(name);
    if (!clock && !data) return;
    const driver = detectDriver(board, [i]);
    out.push({
      key: `sig:${name}`,
      reason: clock ? 'clock-name' : 'data-name',
      source: {
        id: `s-${crypto.randomUUID().slice(0, 8)}`,
        type: 'signal',
        kind: clock ? 'clock' : 'data',
        name: name,
        enabled: true,
        color: nextColor(),
        nets: [name],
        driver: driver >= 0 ? padName(board.pads[driver]!) : '',
        waveform: { f0: frequencyFromName(name, clock ? 25e6 : 5e6), duty: 0.5, tr: clock ? 1e-9 : 2e-9, amplitude: 3.3 },
        load: { model: 'capacitive', cLoad: 5e-12 },
      },
    });
  });

  // switching regulators: a part with VIN, GND and SW pins plus a capacitor between VIN and GND
  for (const fp of board.footprints) {
    const pads = fp.pads.map((i) => board.pads[i]!);
    const vin = pads.find((p) => VIN_FN.test(p.pinFunction));
    const gnd = pads.find((p) => GND_FN.test(p.pinFunction));
    const sw = pads.find((p) => SW_FN.test(p.pinFunction));
    if (!vin || !gnd || !sw || vin.net === 0 || gnd.net === 0) continue;
    let best: { d: number; a: string; b: string } | null = null;
    for (const c of board.footprints) {
      if (c === fp || c.pads.length !== 2) continue;
      const [p1, p2] = c.pads.map((i) => board.pads[i]!);
      const pin = p1!.net === vin.net && p2!.net === gnd.net ? [p1!, p2!] : p2!.net === vin.net && p1!.net === gnd.net ? [p2!, p1!] : null;
      if (!pin) continue;
      const d = dist(pin[0]!.at, vin.at);
      if (!best || d < best.d) best = { d, a: padName(pin[0]!), b: padName(pin[1]!) };
    }
    if (!best) continue;
    out.push({
      key: `loop:${fp.ref}`,
      reason: 'regulator',
      source: {
        id: `s-${crypto.randomUUID().slice(0, 8)}`,
        type: 'loop',
        name: `${fp.ref} ${vin.pinFunction}–${gnd.pinFunction}`,
        enabled: true,
        color: nextColor(),
        pads: [best.a, padName(vin), padName(gnd), best.b],
        waveform: { f0: 500e3, duty: 0.3, tr: 5e-9, amplitude: 1 },
      },
    });
  }
  return out;
}
