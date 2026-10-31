// Suasana kota Indonesia, semua disintesis Web Audio (tanpa file/network):
// dengung lalu lintas + motor lewat, klakson "tin tin", tukang bakso "ting-ting" (sendok ke mangkok),
// burung pagi, jangkrik malam, langkah kaki. Dimulai setelah gesture pertama (aturan autoplay browser).
type AC = AudioContext;
export class Ambient {
  ctx: AC | null = null; master: GainNode | null = null; traffic: GainNode | null = null; cricket: GainNode | null = null;
  vol = 0.7; private t = 0; private nextHorn = 6; private nextBakso = 25; private nextBird = 2; private nextMotor = 3;
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return;
    const c = new C(); this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    // brown-ish noise buffer -> lowpass = dengung jalan jauh
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    this.traffic = c.createGain(); this.traffic.gain.value = 0.25; src.connect(lp).connect(this.traffic).connect(this.master); src.start();
    // jangkrik: sine 4.6 kHz dimodulasi on/off cepat
    const o = c.createOscillator(); o.frequency.value = 4600; const am = c.createGain(); am.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28; const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain); const slow = c.createOscillator(); slow.frequency.value = 0.7; const sg = c.createGain(); sg.gain.value = 0.5; slow.connect(sg).connect(am.gain);
    this.cricket = c.createGain(); this.cricket.gain.value = 0; o.connect(am).connect(this.cricket).connect(this.master);
    o.start(); lfo.start(); slow.start();
  }
  private tone(f: number, dur: number, type: OscillatorType, g: number, at = 0, f2?: number) {
    const c = this.ctx!, o = c.createOscillator(), gg = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gg).connect(this.master!); o.start(t); o.stop(t + dur + 0.05);
  }
  horn(near = 0.5) { if (!this.ctx) return; for (const at of [0, 0.22]) { this.tone(415, 0.16, 'square', 0.05 * near, at); this.tone(523, 0.16, 'square', 0.04 * near, at); } }
  private bakso() { for (let i = 0; i < 6; i++) this.tone(2350 + (i % 2) * 180, 0.35, 'sine', 0.05, i * 0.17); }
  private bird() { const b = 2600 + Math.random() * 1400, n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) this.tone(b, 0.09, 'sine', 0.035, i * 0.13, b * 1.35); }
  private motorPass() { // motor lewat: sawtooth naik-turun + lowpass
    const c = this.ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime, d = 3.2;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(115, t + d * 0.5); o.frequency.linearRampToValueAtTime(80, t + d);
    f.type = 'lowpass'; f.frequency.value = 600; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + d * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f).connect(g).connect(this.master!); o.start(t); o.stop(t + d + 0.1);
  }
  step(crouch = false) { if (!this.ctx) return; this.tone(140, 0.07, 'triangle', crouch ? 0.02 : 0.045, 0, 70); }
  /** hour: jam game; indoor: di dalam gedung (redam); street: 0..1 dekat jalan */
  update(dt: number, hour: number, indoor: boolean, active: boolean) {
    const c = this.ctx; if (!c || !this.master) return; this.t += dt;
    const night = hour < 5 || hour > 18.8, rush = (hour > 6.5 && hour < 8.5) || (hour > 16 && hour < 18.5);
    const target = active ? this.vol * (indoor ? 0.35 : 1) : 0;
    this.master.gain.setTargetAtTime(target, c.currentTime, 0.4);
    this.traffic!.gain.setTargetAtTime(night ? 0.1 : rush ? 0.38 : 0.25, c.currentTime, 1);
    this.cricket!.gain.setTargetAtTime(night && !indoor ? 0.012 : 0, c.currentTime, 1.5);
    if (!active) return;
    if (this.t > this.nextMotor) { if (!indoor) this.motorPass(); this.nextMotor = this.t + (night ? 14 : rush ? 3 : 6) + Math.random() * 6; }
    if (this.t > this.nextHorn) { if (!indoor && !night) this.horn(0.35 + Math.random() * 0.4); this.nextHorn = this.t + (rush ? 7 : 16) + Math.random() * 14; }
    if (this.t > this.nextBird) { if (!indoor && hour > 5 && hour < 10) this.bird(); this.nextBird = this.t + 1.5 + Math.random() * 4; }
    if (this.t > this.nextBakso) { if (!indoor && hour > 15 && hour < 21.5) this.bakso(); this.nextBakso = this.t + 40 + Math.random() * 40; }
  }
}
