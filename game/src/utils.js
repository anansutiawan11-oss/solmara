// utils.js — seeded RNG, math helpers, procedural canvas textures. SOLMARA.
// Seeded RNG drives ALL layout decisions so the city is identical every load
// for a given seed. Decorative noise (speckles, grain) deliberately uses
// unseeded Math.random so it never consumes the layout stream (bug B2).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
export function angleDiff(a, b) {
  return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}
export function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtDist(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + ' km';
  return Math.round(m) + ' m';
}
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
// Canvas texture helper: returns a THREE.CanvasTexture built from a painter.
export function canvasTexture(THREE, w, h, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = 4;
  return tex;
}
// Lit-window building facade. Windows are seeded (layout) but the speckle
// grain on the wall uses Math.random (decorative only, bug B2).
export function facadeTexture(THREE, rng, base, lit) {
  return canvasTexture(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { // decorative grain: unseeded on purpose
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const cols = 5, rows = 10;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = rng.chance(0.55);
      g.fillStyle = on ? lit : 'rgba(20,24,40,0.9)';
      g.fillRect(8 + x * 24, 10 + y * 24, 15, 15);
      if (on) { g.fillStyle = 'rgba(255,220,140,0.25)'; g.fillRect(8 + x * 24, 10 + y * 24, 15, 4); }
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 10, w, 10);
  });
}
export function roadTexture(THREE) {
  return canvasTexture(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = '#2b2e38'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { // decorative speckles: unseeded on purpose
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#e8c33a'; g.fillRect(w / 2 - 2, 0, 4, 40); g.fillRect(w / 2 - 2, 64, 4, 40);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
  }, [1, 1]);
}
export function neonTexture(THREE, text, color) {
  return canvasTexture(THREE, 512, 128, (g, w, h) => {
    g.fillStyle = '#12081f'; g.fillRect(0, 0, w, h);
    g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 8; g.fillStyle = '#ffffff'; g.fillText(text, w / 2, h / 2);
  });
}
