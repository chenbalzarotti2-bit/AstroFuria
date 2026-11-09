/* Sintetizzatore WebAudio procedurale: zero file audio, zero peso. */

type WinAudio = typeof window & { webkitAudioContext?: typeof AudioContext };

export class SFX {
  muted: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  constructor() {
    let m = false;
    try {
      m = localStorage.getItem("astrofuria_mute") === "1";
    } catch {
      /* storage non disponibile: ignora */
    }
    this.muted = m;
  }

  /** Da chiamare al primo gesto utente. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as WinAudio).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.3;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.8);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* niente audio: il gioco funziona comunque */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem("astrofuria_mute", this.muted ? "1" : "0");
    } catch {
      /* ignora */
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.3, this.ctx.currentTime, 0.015);
    }
    return this.muted;
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0
  ) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(60, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.03);
  }

  shoot() {
    this.tone("square", 860, 240, 0.09, 0.09);
  }
  hit() {
    this.tone("square", 1300, 480, 0.05, 0.07);
  }
  boom(power: number) {
    const p = Math.max(1, Math.min(4, power));
    this.noise(0.22 + p * 0.1, 0.4 + p * 0.1, 1000 - p * 160);
    this.tone("sine", 170, 38, 0.28 + p * 0.09, 0.32);
  }
  shieldBreak() {
    this.tone("square", 1500, 280, 0.18, 0.18);
    this.noise(0.22, 0.26, 2400);
  }
  hitPlayer() {
    this.noise(0.5, 0.6, 750);
    this.tone("sawtooth", 300, 34, 0.6, 0.34);
  }
  power() {
    [520, 680, 900].forEach((f, i) => this.tone("square", f, f, 0.07, 0.12, i * 0.06));
  }
  wave() {
    [440, 554, 659, 880].forEach((f, i) => this.tone("triangle", f, f, 0.11, 0.15, i * 0.09));
  }
  over() {
    [392, 311, 262, 185].forEach((f, i) => this.tone("sawtooth", f, f * 0.97, 0.24, 0.17, i * 0.17));
  }
  ui() {
    this.tone("sine", 640, 900, 0.06, 0.1);
  }
}
