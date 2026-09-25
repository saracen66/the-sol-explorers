// Synthesised sound design: every sound is generated with Web Audio, no files.
// The context starts on the first user gesture (browser autoplay rules).
// Idea borrowed from Sayma's prototype (services/soundManager.ts), rebuilt for Sol Atlas.

const KEY = 'sol-atlas-sound';

export class Sound {
  constructor() {
    let on = true;
    try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* storage blocked */ }
    this.on = on;
    this.ctx = null;
    this.breath = null;
    const unlock = () => { this.ensure(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const c = this.ctx = new AC();
    this.master = c.createGain();
    this.master.gain.value = this.on ? 1 : 0;
    this.master.connect(c.destination);
    // one shared noise buffer (2 s of white noise)
    const n = c.sampleRate * 2;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.startWind();
    return c;
  }

  toggle(on = !this.on) {
    this.on = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    const c = this.ensure();
    if (c) this.master.gain.setTargetAtTime(on ? 1 : 0, c.currentTime, 0.05);
    return on;
  }

  get live() { return this.on && this.ctx && this.ctx.state === 'running'; }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  /** Thin Martian wind: low-passed noise with a slow gust LFO. Always on, very quiet. */
  startWind() {
    const c = this.ctx;
    const src = this.noiseSrc();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.035;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.022;
    lfo.connect(lg).connect(g.gain);
    const lfo2 = c.createOscillator(), lg2 = c.createGain();
    lfo2.frequency.value = 0.11; lg2.gain.value = 160;
    lfo2.connect(lg2).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.master);
    src.start(); lfo.start(); lfo2.start();
    this.wind = g;
  }

  /** Wind gets louder in the helmet view (you are standing in it). */
  windLevel(v) { if (this.ctx) this.wind.gain.setTargetAtTime(v, this.ctx.currentTime, 0.6); }

  tone(freq, dur, { type = 'sine', vol = 0.08, at = 0, slide = 0 } = {}) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  blip() { this.tone(1320, 0.05, { vol: 0.035 }); }
  click() { this.tone(900, 0.04, { type: 'triangle', vol: 0.05 }); }
  lock() { this.tone(880, 0.12, { vol: 0.07 }); this.tone(1320, 0.22, { vol: 0.07, at: 0.1 }); }
  go() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.18, { vol: 0.06, at: i * 0.09 })); }
  nogo() { this.tone(330, 0.28, { type: 'square', vol: 0.04 }); this.tone(247, 0.4, { type: 'square', vol: 0.04, at: 0.26 }); }
  pin() { this.tone(1760, 0.07, { vol: 0.04 }); this.tone(2640, 0.1, { vol: 0.03, at: 0.05 }); }

  /** Suit caution: two-tone chirps. level 1 = caution, 2 = warning. */
  alarm(level = 1) {
    const n = level > 1 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      this.tone(level > 1 ? 1040 : 880, 0.12, { type: 'square', vol: 0.035, at: i * 0.28 });
      this.tone(level > 1 ? 780 : 660, 0.12, { type: 'square', vol: 0.035, at: i * 0.28 + 0.14 });
    }
  }

  /** O₂ depleted: the suit's continuous tone, fading out. */
  flatline() {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 988;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.setValueAtTime(0.05, t + 2.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 4.3);
    this.breathing(false);
  }

  /** Descent: band-passed noise sweeping down. */
  whoosh(dur = 2.4) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime;
    const src = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
  }

  /**
   * Suit breathing for the helmet view: filtered noise shaped into inhale / exhale.
   * rate = breaths per minute (rises with effort and as O₂ runs low).
   */
  breathing(on, rate = 16) {
    if (!on) {
      if (this.breath) { clearInterval(this.breath.iv); this.breath = null; }
      return;
    }
    if (!this.ctx) return;
    if (this.breath) { this.breath.rate = rate; return; }
    const b = this.breath = { rate, next: 0 };
    const one = () => {
      if (!this.live || !this.breath) return;
      const c = this.ctx, t = c.currentTime;
      if (t < b.next) return;
      const period = 60 / b.rate;
      b.next = t + period;
      const src = this.noiseSrc();
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      const g = c.createGain();
      const inh = period * 0.38, exh = period * 0.45;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + inh * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0008, t + inh);
      g.gain.exponentialRampToValueAtTime(0.02, t + inh + exh * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + inh + exh);
      bp.frequency.setValueAtTime(1100, t);
      bp.frequency.setValueAtTime(650, t + inh);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t); src.stop(t + period);
    };
    b.iv = setInterval(one, 120);
  }
}
