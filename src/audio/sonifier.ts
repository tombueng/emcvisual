/**
 * Sonification (docs/stufe-1/ARCHITEKTUR.md §6): one oscillator per source whose waveform is
 * built from the source's harmonic amplitudes, pitched down linearly so harmonics stay
 * harmonic (clocks sound like tones, switchers buzz). Loudness follows the field at the
 * probe; direction comes from an HRTF panner at the source's centre.
 */
import type { Line } from '../physics/spectrum';

export interface Voice {
  id: string;
  f0: number;
  lines: Line[];
  /** Field of this source at the probe in dBµA/m (summed over its lines). */
  db: number;
  /** Source centre relative to the listener, world mm. */
  position: [number, number, number];
}

export interface SonifyParams {
  volume: number;
  /** 'tones': one voice per source; 'geiger': clicks whose rate follows the total field (W3). */
  mode?: 'tones' | 'geiger';
  /** Audio frequency for a 25 MHz fundamental; the mapping is linear. */
  pitchAt25MHz: number;
  /** Field window: dbLow maps to silence, dbHigh to full scale. */
  dbLow: number;
  dbHigh: number;
  listenerForward: [number, number, number];
  listenerUp: [number, number, number];
}

const MAX_HARMONICS = 4096;
const AUDIO_TOP = 16_000;

interface Live {
  osc: OscillatorNode;
  gain: GainNode;
  pan: PannerNode;
  waveKey: string;
  pitch: number;
}

export class Sonifier {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, Live>();
  /** Geiger mode: clicks per second, a short noise burst and the look-ahead scheduler. */
  private clickRate = 0;
  private clickBuffer: AudioBuffer | null = null;
  private clickTimer: ReturnType<typeof setInterval> | null = null;
  private nextClick = 0;

  get running() {
    return this.ctx?.state === 'running';
  }

  /** Must be called from a user gesture (autoplay rules). */
  async start() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(comp).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    await this.ctx.resume();
  }

  async stop() {
    this.stopClicks();
    await this.ctx?.suspend();
  }

  /** Clicks like a Geiger counter: a Poisson process at `clickRate`, scheduled 100 ms ahead. */
  private startClicks() {
    const ctx = this.ctx;
    if (!ctx || this.clickTimer) return;
    if (!this.clickBuffer) {
      const n = Math.round(ctx.sampleRate * 0.004);
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n / 6));
      this.clickBuffer = b;
    }
    this.nextClick = ctx.currentTime;
    this.clickTimer = setInterval(() => {
      const c = this.ctx;
      if (!c || !this.master || !this.clickBuffer) return;
      const horizon = c.currentTime + 0.1;
      if (this.nextClick < c.currentTime) this.nextClick = c.currentTime;
      while (this.clickRate > 0 && this.nextClick < horizon) {
        const src = c.createBufferSource();
        src.buffer = this.clickBuffer;
        src.connect(this.master);
        src.start(this.nextClick);
        this.nextClick += -Math.log(1 - Math.random()) / this.clickRate;
      }
      if (this.clickRate <= 0) this.nextClick = horizon;
    }, 25);
  }

  private stopClicks() {
    if (this.clickTimer) clearInterval(this.clickTimer);
    this.clickTimer = null;
    this.clickRate = 0;
  }

  update(voices: Voice[], p: SonifyParams) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(p.volume, now, 0.05);
    const L = ctx.listener;
    if (L.forwardX) {
      L.forwardX.setTargetAtTime(p.listenerForward[0], now, 0.05);
      L.forwardY.setTargetAtTime(p.listenerForward[1], now, 0.05);
      L.forwardZ.setTargetAtTime(p.listenerForward[2], now, 0.05);
      L.upX.setTargetAtTime(p.listenerUp[0], now, 0.05);
      L.upY.setTargetAtTime(p.listenerUp[1], now, 0.05);
      L.upZ.setTargetAtTime(p.listenerUp[2], now, 0.05);
    }

    if (p.mode === 'geiger') {
      // total field at the probe sets the rate: 0.5 clicks/s at the bottom of the window,
      // 100 per second at the top (logarithmic, like the dB scale)
      let pw = 0;
      for (const v of voices) pw += 10 ** (v.db / 10);
      const db = pw > 0 ? 10 * Math.log10(pw) : -Infinity;
      const x = (db - p.dbLow) / Math.max(1, p.dbHigh - p.dbLow);
      this.clickRate = x < 0 ? 0 : 0.5 * 200 ** Math.min(1, x);
      this.startClicks();
      voices = [];
    } else this.stopClicks();

    const seen = new Set<string>();
    const kappa = p.pitchAt25MHz / 25e6;
    for (const v of voices) {
      seen.add(v.id);
      const pitch = v.f0 * kappa;
      const waveKey = `${v.f0}|${pitch.toFixed(4)}|${v.lines.length}|${v.lines[0]?.amp ?? 0}|${v.lines[v.lines.length - 1]?.f ?? 0}`;
      let live = this.voices.get(v.id);
      if (!live) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createPanner();
        pan.panningModel = 'HRTF';
        pan.distanceModel = 'linear';
        pan.rolloffFactor = 0;
        osc.connect(gain).connect(pan).connect(master);
        osc.start();
        live = { osc, gain, pan, waveKey: '', pitch: 0 };
        this.voices.set(v.id, live);
      }
      if (live.waveKey !== waveKey) {
        live.osc.setPeriodicWave(periodicWave(ctx, v.f0, v.lines, pitch));
        live.waveKey = waveKey;
      }
      if (live.pitch !== pitch) {
        live.osc.frequency.setTargetAtTime(Math.max(0.5, pitch), now, 0.03);
        live.pitch = pitch;
      }
      const x = (v.db - p.dbLow) / Math.max(1, p.dbHigh - p.dbLow); // 0..1 over the window
      const level = x <= -0.2 ? 0 : 10 ** ((Math.min(1, x) - 1) * 50 / 20); // window spans 50 dB of loudness
      live.gain.gain.setTargetAtTime(level, now, 0.04);
      const s = 0.1; // mm -> panner units (direction is what matters)
      live.pan.positionX.setTargetAtTime(v.position[0] * s, now, 0.05);
      live.pan.positionY.setTargetAtTime(v.position[1] * s, now, 0.05);
      live.pan.positionZ.setTargetAtTime(v.position[2] * s, now, 0.05);
    }
    for (const [id, live] of this.voices) {
      if (seen.has(id)) continue;
      live.gain.gain.setTargetAtTime(0, now, 0.05);
      const l = live;
      setTimeout(() => {
        l.osc.stop();
        l.osc.disconnect();
        l.pan.disconnect();
      }, 300);
      this.voices.delete(id);
    }
  }

  dispose() {
    this.stopClicks();
    for (const l of this.voices.values()) l.osc.stop();
    this.voices.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** Harmonic n of f0 gets the amplitude of the line at n·f0; everything above 16 kHz is cut. */
function periodicWave(ctx: AudioContext, f0: number, lines: Line[], pitch: number): PeriodicWave {
  const nTop = Math.max(1, Math.min(MAX_HARMONICS, Math.floor(AUDIO_TOP / Math.max(pitch, 0.5))));
  const imag = new Float32Array(nTop + 1);
  let peak = 0;
  for (const l of lines) {
    const n = Math.round(l.f / f0);
    if (n < 1 || n > nTop) continue;
    imag[n] = l.amp;
    if (l.amp > peak) peak = l.amp;
  }
  if (peak > 0) for (let i = 0; i < imag.length; i++) imag[i] = imag[i]! / peak;
  else imag[1] = 1;
  return ctx.createPeriodicWave(new Float32Array(nTop + 1), imag, { disableNormalization: false });
}
