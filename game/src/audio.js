// All sound is synthesized with WebAudio — no audio files. A tiny step sequencer
// plays one of three radio stations, plus engine hum, sirens and one-shot effects.
import { clamp } from './utils.js';

const STATIONS = [
  {
    name: 'SOL FM · 101.2', bpm: 96, root: 55,
    bass: [0, 0, 7, 0, 10, 0, 7, 5],
    chords: [[0, 3, 7, 10], [8, 12, 15, 19], [5, 8, 12, 15], [7, 10, 14, 17]],
    arp: [12, 15, 19, 24, 19, 15],
  },
  {
    name: 'MARINA 88 · 88.4', bpm: 76, root: 49,
    bass: [0, 0, 0, 5, 3, 0, 7, 5],
    chords: [[0, 4, 7, 11], [5, 9, 12, 16], [3, 7, 10, 14], [7, 11, 14, 17]],
    arp: [12, 16, 19, 24, 19, 16],
  },
  {
    name: 'KANE FM · 99.9', bpm: 116, root: 41.2,
    bass: [0, 0, 3, 0, 0, 6, 5, 3],
    chords: [[0, 3, 7], [0, 3, 7], [6, 10, 13], [5, 8, 12]],
    arp: [12, 12, 15, 19, 15, 12],
  },
];

function noteFreq(root, semis) { return root * Math.pow(2, semis / 12); }

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.station = 0;
    this.musicOn = false;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.master = null;
    this.musicBus = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 31;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Siren: triangle alternating between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    return STATIONS[this.station].name;
  }

  stationName() { return STATIONS[this.station].name; }

  startMusic() {
    if (this.timer || !this.ctx) return;
    this.musicOn = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  schedule() {
    if (!this.ctx || this.muted) return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2; // eighth notes
    while (this.nextStepTime < this.ctx.currentTime + 0.18) {
      this.playStep(st, this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(st, step, t, stepDur) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    // Kick on quarters.
    if (s16 % 4 === 0) this.kick(t);
    // Hat on off-eighths.
    if (s16 % 2 === 1) this.hat(t);
    // Bass line, eighth notes.
    const bassNote = st.bass[Math.floor(step / 2) % st.bass.length];
    if (step % 2 === 0) this.tone(noteFreq(st.root, bassNote), t, stepDur * 1.8, 'sawtooth', 0.16, 240);
    // Pad chord at each bar start.
    if (s16 === 0) {
      for (const iv of st.chords[bar % st.chords.length]) {
        this.tone(noteFreq(st.root * 2, iv), t, stepDur * 16, 'sawtooth', 0.045, 900);
      }
    }
    // Arpeggio sparkle, every other eighth.
    if (step % 2 === 0 && (bar + s16) % 3 !== 0) {
      const a = st.arp[(step / 2) % st.arp.length];
      this.tone(noteFreq(st.root * 4, a), t, stepDur * 0.9, 'square', 0.035, 2400);
    }
  }

  tone(freq, t, dur, type, vol, cutoff) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.2);
  }

  hat(t) {
    const len = 0.05;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t);
  }

  /** One-shot effect. kind: shot | punch | crash | pickup | complete | click | skid | horn | busted */
  sfx(kind, vol = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    if (kind === 'shot') {
      this.noiseBurst(t, 0.14, 0.5 * vol, 3000);
      this.tone(180, t, 0.1, 'square', 0.22 * vol, 500);
    } else if (kind === 'punch') {
      this.noiseBurst(t, 0.09, 0.4 * vol, 900);
    } else if (kind === 'crash') {
      this.noiseBurst(t, 0.35, 0.6 * vol, 700);
      this.tone(70, t, 0.3, 'sawtooth', 0.25 * vol, 300);
    } else if (kind === 'pickup') {
      this.tone(660, t, 0.09, 'sine', 0.25 * vol, 3000);
      this.tone(990, t + 0.09, 0.14, 'sine', 0.25 * vol, 3000);
    } else if (kind === 'complete') {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.09, 0.22, 'triangle', 0.22 * vol, 4000));
    } else if (kind === 'click') {
      this.tone(880, t, 0.05, 'sine', 0.2 * vol, 3000);
    } else if (kind === 'horn') {
      this.tone(370, t, 0.28, 'square', 0.14 * vol, 1200);
      this.tone(466, t, 0.28, 'square', 0.12 * vol, 1200);
    } else if (kind === 'busted') {
      [392, 370, 349, 330].forEach((f, i) => this.tone(f, t + i * 0.16, 0.2, 'sawtooth', 0.16 * vol, 900));
    }
  }

  noiseBurst(t, dur, vol, cutoff) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  /** Engine hum: speed01 0..1, on/off. */
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const target = on ? 0.05 + 0.075 * speed01 : 0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.1);
    const f = 52 + speed01 * 165;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, this.ctx.currentTime, 0.1);
  }

  /** Police siren: distance01 0 (far) .. 1 (near). */
  setSiren(distance01, active) {
    if (!this.ctx) return;
    const target = active && !this.muted ? 0.028 + 0.05 * distance01 : 0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
    if (active) {
      const t = this.ctx.currentTime;
      this.sirenOsc.frequency.cancelScheduledValues(t);
      this.sirenOsc.frequency.setValueAtTime(720, t);
      this.sirenOsc.frequency.linearRampToValueAtTime(980, t + 0.45);
      this.sirenOsc.frequency.linearRampToValueAtTime(720, t + 0.9);
    }
  }
}
