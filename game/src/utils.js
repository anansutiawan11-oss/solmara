// Small shared helpers: a seeded random stream (so screenshot scenes are
// deterministic), math helpers and canvas texture makers for the city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDelta(a, b) * t; }

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function choiceWeighted(rng, pairs) {
  let total = 0;
  for (const p of pairs) total += p[1];
  let r = rng() * total;
  for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
  return pairs[pairs.length - 1][0];
}

import { CanvasTexture, RepeatWrapping } from 'three';

/** A canvas texture from a 2D drawing callback. */
export function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** Format dollars like $12,400. */
export function money(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

/** mm:ss clock from seconds of in-game time. */
export function clockString(seconds) {
  const s = Math.floor(seconds) % 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return hh + ':' + mm;
}
