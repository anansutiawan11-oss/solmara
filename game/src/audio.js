// audio.js — 3 radio stations (synthwave/chill/bass step sequencer), engine
// hum, sirens, gunshots/crashes/pickups. All synthesized with WebAudio;
// nothing is fetched. Context starts on the first user gesture.
export const STATIONS = ['SOLWAVE 98.5', 'CHILL COAST', 'BASSLINE FM'];

export function createAudio() {
  const a = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    station: 0, step: 0, nextStepTime: 0, musicTimer: null,
    engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
    enabled: true, muted: false,
  };
  function ensure() {
    if (a.ctx) { if (a.ctx.state === 'suspended') a.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      a.ctx = new AC();
      a.master = a.ctx.createGain(); a.master.gain.value = 0.5; a.master.connect(a.ctx.destination);
      a.musicGain = a.ctx.createGain(); a.musicGain.gain.value = 0.22; a.musicGain.connect(a.master);
      a.sfxGain = a.ctx.createGain(); a.sfxGain.gain.value = 0.6; a.sfxGain.connect(a.master);
      // engine hum: two detuned saws through a lowpass
      a.engineOsc = a.ctx.createOscillator(); a.engineOsc.type = 'sawtooth'; a.engineOsc.frequency.value = 55;
      a.engineGain = a.ctx.createGain(); a.engineGain.gain.value = 0;
      const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      a.engineOsc.connect(lp); lp.connect(a.engineGain); a.engineGain.connect(a.master);
      a.engineOsc.start();
      // siren: triangle LFO wail
      a.sirenOsc = a.ctx.createOscillator(); a.sirenOsc.type = 'triangle'; a.sirenOsc.frequency.value = 750;
      a.sirenGain = a.ctx.createGain(); a.sirenGain.gain.value = 0;
      a.sirenOsc.connect(a.sirenGain); a.sirenGain.connect(a.master);
      a.sirenOsc.start();
      a.nextStepTime = a.ctx.currentTime + 0.1;
      a.musicTimer = setInterval(() => scheduleMusic(a), 40);
      return true;
    } catch (e) { return false; }
  }
  a.unlock = ensure;
  a.setEngine = (speed01, on) => {
    if (!a.ctx || !a.engineOsc) return;
    a.engineOsc.frequency.value = 50 + speed01 * 130;
    a.engineGain.gain.value = on ? 0.05 + speed01 * 0.06 : 0;
  };
  a.setSiren = (on) => {
    if (!a.ctx || !a.sirenOsc) return;
    a.sirenGain.gain.value = on ? 0.05 : 0;
    if (on) a.sirenOsc.frequency.setTargetAtTime(750 + Math.sin(a.ctx.currentTime * 3) * 250, a.ctx.currentTime, 0.1);
  };
  a.cycleStation = () => { a.station = (a.station + 1) % STATIONS.length; a.step = 0; return STATIONS[a.station]; };
  a.stationName = () => STATIONS[a.station];
  a.gunshot = () => { if (!ensure()) return; blip(a, 'square', 160, 0.09, 0.5, 900); noiseBurst(a, 0.12, 0.5); };
  a.crash = () => { if (!ensure()) return; noiseBurst(a, 0.25, 0.4); blip(a, 'sine', 70, 0.2, 0.4, 200); };
  a.pickup = () => { if (!ensure()) return; blip(a, 'sine', 660, 0.08, 0.4, 0); blip(a, 'sine', 990, 0.12, 0.4, 0); };
  a.click = () => { if (!ensure()) return; blip(a, 'square', 220, 0.05, 0.25, 0); };
  a.reload = () => { if (!ensure()) return; blip(a, 'square', 300, 0.05, 0.3, 0); setTimeout(() => blip(a, 'square', 420, 0.05, 0.3, 0), 120); };
  a.jump = () => { if (!ensure()) return; blip(a, 'sine', 300, 0.12, 0.25, 900); };
  a.missionComplete = () => {
    if (!ensure()) return;
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(a, 'sine', f, 0.18, 0.4, 0), i * 110));
  };
  return a;
}

function blip(a, type, freq, dur, vol, slide) {
  const o = a.ctx.createOscillator(), g = a.ctx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, a.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + dur);
  o.connect(g); g.connect(a.sfxGain); o.start(); o.stop(a.ctx.currentTime + dur);
}
function noiseBurst(a, dur, vol) {
  const len = Math.floor(a.ctx.sampleRate * dur);
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.ctx.createBufferSource(); src.buffer = buf;
  const g = a.ctx.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(a.sfxGain); src.start();
}

// Step sequencer: 16 steps, patterns per station. Called on a timer.
const PATTERNS = [
  { bpm: 112, bass: [0, 0, 7, 0, 10, 0, 7, 5], lead: [12, 15, 19, 15, 12, 10, 7, 10], root: 55 },   // synthwave
  { bpm: 84, bass: [0, 0, 0, 5, 0, 0, 3, 0], lead: [12, 0, 16, 0, 19, 0, 16, 12], root: 49 },      // chill
  { bpm: 128, bass: [0, 0, 12, 0, 0, 10, 0, 7], lead: [0, 12, 0, 15, 0, 12, 0, 19], root: 41.2 },   // bass
];
function scheduleMusic(a) {
  if (!a.ctx || a.muted) return;
  const pat = PATTERNS[a.station];
  const stepDur = 60 / pat.bpm / 4;
  while (a.nextStepTime < a.ctx.currentTime + 0.15) {
    const s = a.step % 16, t = a.nextStepTime;
    const bassNote = pat.bass[Math.floor(s / 2) % pat.bass.length];
    if (s % 2 === 0) noteAt(a, pat.root * Math.pow(2, bassNote / 12), t, stepDur * 1.8, 'triangle', 0.5);
    if (s % 4 === 0) noteAt(a, pat.root * 4 * Math.pow(2, pat.lead[Math.floor(s / 4) % pat.lead.length] / 12), t, stepDur * 1.2, 'square', 0.12);
    if (s % 4 === 2) { // hat tick
      const len = Math.floor(a.ctx.sampleRate * 0.03);
      const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.4;
      const src = a.ctx.createBufferSource(); src.buffer = buf;
      const g = a.ctx.createGain(); g.gain.value = 0.15;
      src.connect(g); g.connect(a.musicGain); src.start(t);
    }
    a.step += 1; a.nextStepTime += stepDur;
  }
}
function noteAt(a, freq, t, dur, type, vol) {
  const o = a.ctx.createOscillator(), g = a.ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(a.musicGain); o.start(t); o.stop(t + dur + 0.05);
}
