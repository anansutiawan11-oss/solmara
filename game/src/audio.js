// audio.js — all sound synthesized with WebAudio. No audio files, no network.
// Three radio stations are step sequencers (synthwave / chill / bass); engine
// hum, sirens, gunshots, crashes and pickups are small synth patches.
// Everything is guarded: if the AudioContext cannot start (headless, no
// gesture yet) every call is a safe no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let radioGain = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = null;
  let station = 0;
  let seqTimer = null;
  let step = 0;
  let muted = false;

  // 16-step patterns: [midi note, ...] per station, plus a bass line.
  const STATIONS = [
    {
      name: 'SOL 88.5 — Synthwave',
      bpm: 104, wave: 'sawtooth',
      lead: [69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 69, 0, 67, 0, 64, 0],
      bass: [45, 0, 45, 0, 48, 0, 48, 0, 43, 0, 43, 0, 50, 0, 50, 0],
    },
    {
      name: 'PALM 91.2 — Chill',
      bpm: 76, wave: 'triangle',
      lead: [72, 0, 0, 76, 0, 0, 79, 0, 76, 0, 0, 74, 0, 0, 71, 0],
      bass: [48, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0],
    },
    {
      name: 'BASS 99.9 — Low End',
      bpm: 128, wave: 'square',
      lead: [0, 0, 62, 0, 0, 65, 0, 0, 62, 0, 0, 67, 0, 65, 0, 0],
      bass: [38, 38, 0, 38, 0, 38, 41, 0, 38, 38, 0, 38, 36, 0, 43, 0],
    },
  ];

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      radioGain = ctx.createGain();
      radioGain.gain.value = 0.32;
      radioGain.connect(master);
      // Engine: low sawtooth through a low-pass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function note(freq, when, dur, type, gain, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(dest || radioGain);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  function scheduleStep() {
    if (!ctx) return;
    const st = STATIONS[station];
    const spb = 60 / st.bpm / 4; // 16th notes
    const now = ctx.currentTime + 0.06;
    const lead = st.lead[step];
    const bass = st.bass[step];
    if (lead) note(midiToFreq(lead), now, spb * 1.8, st.wave, 0.16);
    if (bass) note(midiToFreq(bass), now, spb * 2.2, 'sine', 0.3);
    if (step % 4 === 0) note(1200, now, 0.03, 'square', 0.05); // hat tick
    step = (step + 1) % 16;
    seqTimer = setTimeout(scheduleStep, spb * 1000);
  }

  function startRadio() {
    if (!ensure()) return;
    resume();
    stopRadio();
    step = 0;
    scheduleStep();
  }

  function stopRadio() {
    if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
  }

  function nextStation() {
    station = (station + 1) % STATIONS.length;
    if (ctx) { stopRadio(); scheduleStep(); }
    return STATIONS[station].name;
  }

  function setEngine(speedNorm, on) {
    if (!ctx || !engineOsc) return;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(50 + speedNorm * 160, t, 0.08);
    engineFilter.frequency.setTargetAtTime(280 + speedNorm * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.06 : 0, t, 0.1);
  }

  function setSiren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      let hi = false;
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        hi = !hi;
        sirenOsc.frequency.setTargetAtTime(hi ? 950 : 700, ctx.currentTime, 0.05);
      }, 380);
    } else if (!on && sirenOsc) {
      clearInterval(sirenTimer);
      sirenTimer = null;
      try { sirenOsc.stop(); } catch { /* already stopped */ }
      sirenOsc.disconnect();
      sirenOsc = null;
    }
  }

  function blip(freq, dur, type, gain) {
    if (!ensure()) return;
    resume();
    note(freq, ctx.currentTime, dur, type, gain, master);
  }

  function noiseBurst(dur, gain, lowpass) {
    if (!ensure()) return;
    resume();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start();
  }

  function sfx(kind) {
    try {
      if (kind === 'shot') noiseBurst(0.12, 0.5, 2400);
      else if (kind === 'crash') noiseBurst(0.3, 0.6, 500);
      else if (kind === 'pickup') { blip(660, 0.12, 'sine', 0.25); setTimeout(() => blip(990, 0.18, 'sine', 0.25), 90); }
      else if (kind === 'punch') noiseBurst(0.08, 0.35, 900);
      else if (kind === 'reload') blip(440, 0.06, 'square', 0.12);
      else if (kind === 'busted') { blip(220, 0.4, 'sawtooth', 0.2); setTimeout(() => blip(165, 0.6, 'sawtooth', 0.2), 200); }
      else if (kind === 'click') blip(880, 0.05, 'sine', 0.15);
    } catch { /* audio is best-effort */ }
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  }

  return {
    ensure, resume, startRadio, stopRadio, nextStation,
    setEngine, setSiren, sfx, setMuted,
    get stationName() { return STATIONS[station].name; },
    get isMuted() { return muted; },
  };
}
