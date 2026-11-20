// utils.js — seeded RNG, math helpers, canvas textures, formatting.
// All city layout uses the SEEDED rng. Decorative noise (speckles, grain) must
// use plain Math.random so it never consumes the seeded layout stream (B2).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.next = mulberry32(seed); }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  // Deterministic pick of an element by index (no stream consumption beyond next()).
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Shortest signed angular difference, and angle lerp that wraps correctly.
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }
export function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtSpeed = (ms) => Math.round(ms * 2.237) + ' mph';

// Canvas texture helpers. THREE is passed in to keep this module engine-agnostic.
export function canvasTexture(THREE, w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = 4;
  return tex;
}

// A plain coloured canvas texture (used for simple materials).
export function colorTexture(THREE, color, w = 64, h = 64) {
  return canvasTexture(THREE, w, h, (g) => { g.fillStyle = color; g.fillRect(0, 0, w, h); });
}

// Shared scratch objects so hot loops do not allocate.
export const V3 = (THREE) => new THREE.Vector3();
export const tmpV = { x: 0, y: 0, z: 0 };
