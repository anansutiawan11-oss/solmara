// player.js — Mara Voss on foot: WASD + mouse orbit camera, sprint, jump,
// punch, walk-cycle animation, health regen.
import { clamp, TAU } from './utils.js';
import { resolveCollisions } from './city.js';

export const WALK_SPEED = 6;    // m/s — brisk enough that walk-to-target never stalls
export const SPRINT_SPEED = 10;
export const JUMP_V = 7.5;

export function createPlayer(THREE, scene, spawn) {
  const group = new THREE.Group();
  group.name = 'player';
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a4a8f });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e3a55 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });
  const boot = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); group.add(m); return m;
  }
  const torso = part(jacket, 0.62, 0.72, 0.34, 0, 1.18, 0);
  const head = part(skin, 0.42, 0.42, 0.4, 0, 1.78, 0);
  part(hair, 0.46, 0.2, 0.44, 0, 1.98, -0.02);
  part(hair, 0.46, 0.5, 0.12, 0, 1.8, -0.22); // long dark hair down the back
  const legL = part(jeans, 0.24, 0.78, 0.28, -0.17, 0.42, 0);
  const legR = part(jeans, 0.24, 0.78, 0.28, 0.17, 0.42, 0);
  const armL = part(jacket, 0.2, 0.66, 0.24, -0.42, 1.2, 0);
  const armR = part(jacket, 0.2, 0.66, 0.24, 0.42, 1.2, 0);
  part(boot, 0.26, 0.12, 0.36, -0.17, 0.06, 0.03);
  part(boot, 0.26, 0.12, 0.36, 0.17, 0.06, 0.03);
  scene.add(group);
  const p = {
    group, mesh: group, pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(), heading: 0, camYaw: Math.PI, camPitch: 0.32,
    vy: 0, grounded: true, health: 100, maxHealth: 100,
    onFoot: true, car: null, punchTimer: 0, walkPhase: 0, moving: false,
    cash: 150, rank: 'Street', ammo: 12, reserveAmmo: 48, weapon: 'fists',
  };
  group.position.copy(p.pos);
  return p;
}

// keys: {w,a,s,d,shift,space} booleans. Returns nothing; mutates player.
export function updatePlayer(p, keys, dt, city, audio) {
  const sprint = keys.shift ? SPRINT_SPEED : WALK_SPEED;
  let ix = 0, iz = 0;
  if (keys.w) iz -= 1; if (keys.s) iz += 1;
  if (keys.a) ix -= 1; if (keys.d) ix += 1;
  const moving = ix !== 0 || iz !== 0;
  p.moving = moving;
  if (moving) {
    const len = Math.hypot(ix, iz); ix /= len; iz /= len;
    // camera-relative movement: forward = away from camera
    const sin = Math.sin(p.camYaw), cos = Math.cos(p.camYaw);
    const mx = ix * cos - iz * sin;
    const mz = -ix * sin - iz * cos;
    p.pos.x += mx * sprint * dt;
    p.pos.z += mz * sprint * dt;
    p.heading = Math.atan2(mx, mz);
    p.walkPhase += dt * (keys.shift ? 13 : 9);
  }
  // jump
  if (keys.space && p.grounded) { p.vy = JUMP_V; p.grounded = false; if (audio) audio.jump(); }
  if (!p.grounded) {
    p.vy -= 22 * dt; p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  }
  // collisions + bounds
  const r = resolveCollisions(city, p.pos.x, p.pos.z, 0.5);
  p.pos.x = r.x; p.pos.z = r.z;
  // health regen (slow, out of combat)
  if (p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 2.5 * dt);
  // walk-cycle animation: swing legs/arms, bob torso
  const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const g = p.group.children;
  // children order: torso, head, hairTop, hairBack, legL, legR, armL, armR, bootL, bootR
  if (g[4]) g[4].rotation.x = swing;
  if (g[5]) g[5].rotation.x = -swing;
  if (g[6]) g[6].rotation.x = p.punchTimer > 0 ? -1.4 : -swing * 0.8;
  if (g[7]) g[7].rotation.x = p.punchTimer > 0 ? -1.4 : swing * 0.8;
  if (g[0]) g[0].position.y = 1.18 + (moving ? Math.abs(Math.sin(p.walkPhase)) * 0.05 : 0);
  if (p.punchTimer > 0) p.punchTimer -= dt;
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.heading;
}

export function playerPunch(p) {
  if (p.punchTimer > 0) return false;
  p.punchTimer = 0.35;
  return true;
}

// Orbit camera: follows behind the player at camYaw/camPitch.
export function updateCamera(THREE, camera, p, dt) {
  const dist = p.onFoot ? 7.5 : 12;
  const h = p.onFoot ? 3.2 : 2.6;
  const tx = p.pos.x, ty = p.pos.y + 1.6, tz = p.pos.z;
  const cx = tx - Math.sin(p.camYaw) * Math.cos(p.camPitch) * dist;
  const cz = tz - Math.cos(p.camYaw) * Math.cos(p.camPitch) * dist;
  const cy = ty + Math.sin(p.camPitch) * dist + h - 1.6;
  camera.position.set(cx, Math.max(cy, 1.2), cz);
  camera.lookAt(tx, ty, tz);
}
