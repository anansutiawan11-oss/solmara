// Shared bits every system leans on: a deterministic random stream (so the
// screenshot scenes stage identically every run), small math helpers, canvas
// texture construction, and display formatting.
import { CanvasTexture, RepeatWrapping } from 'three';

export const TAU = Math.PI * 2;

/** mulberry32 — tiny seeded PRNG. Same seed, same stream, every time. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate-independent approach: lambda is roughly "per second". */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** Signed shortest turn from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * t;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function weightedPick(rng, pairs) {
  let total = 0;
  for (const [, w] of pairs) total += w;
  let r = rng() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

/** Build a THREE texture by drawing on a 2D canvas. */
export function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

export function money(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

/** In-game clock: seconds since midnight -> "HH:MM". */
export function clockString(seconds) {
  const s = Math.floor(seconds) % 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return hh + ':' + mm;
}
