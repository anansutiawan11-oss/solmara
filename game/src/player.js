// player.js — Mara Voss on foot: WASD + orbit camera, sprint, jump, punch,
// walk-cycle animation, health regen. No vehicle logic lives here.
import * as THREE from 'three';
import { clamp, angleLerp } from './utils.js';
import { resolveCollisions } from './city.js';

export function createPlayer(THREE, opts) {
  const { colliders, onPunch } = opts;
  const group = new THREE.Group();
  group.name = 'mara';

  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ color: 0xd84a6b, roughness: 0.85 }); // pink jacket
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2e4a6b, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), top);
  torso.position.y = 1.18; torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), skin);
  head.position.y = 1.78; head.castShadow = true;
  group.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.y = 1.82;
  group.add(hairM);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), jeans);
  legL.position.set(-0.17, 0.39, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), top);
  armL.position.set(-0.42, 1.22, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);

  const state = {
    group,
    pos: new THREE.Vector3(-210, 0, -196),
    vel: new THREE.Vector3(),
    heading: Math.PI * 0.75, // facing the street from the safehouse porch
    vy: 0, grounded: true,
    health: 100, maxHealth: 100,
    lastDamageAt: -99,
    walkPhase: 0, moving: false,
    punchCooldown: 0, punchAnim: 0,
    inVehicle: null,
  };
  group.position.copy(state.pos);
  group.rotation.y = state.heading;

  function damage(amount, now) {
    if (state.health <= 0) return;
    state.health = Math.max(0, state.health - amount);
    state.lastDamageAt = now;
  }

  function update(dt, input, camYaw, now) {
    if (state.inVehicle) return; // driving is vehicles.js' job
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    state.punchAnim = Math.max(0, state.punchAnim - dt);

    // Regen after 5s without damage.
    if (now - state.lastDamageAt > 5 && state.health > 0 && state.health < state.maxHealth) {
      state.health = Math.min(state.maxHealth, state.health + 6 * dt);
    }

    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speed = sprint ? 7.2 : 4.0;
    let fx = 0, fz = 0;
    if (input.keys.has('KeyW')) fz += 1;
    if (input.keys.has('KeyS')) fz -= 1;
    if (input.keys.has('KeyA')) fx -= 1;
    if (input.keys.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);
    state.moving = len > 0;
    if (len > 0) {
      fx /= len; fz /= len;
      // Movement is relative to the camera yaw: W moves away from the camera.
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = -sin * fz + cos * fx;
      const wz = -cos * fz - sin * fx;
      const tx = state.pos.x + wx * speed * dt;
      const tz = state.pos.z + wz * speed * dt;
      const fixed = resolveCollisions(colliders, tx, tz, 0.5);
      // Keep Mara inside the playable bounds (city + beach).
      state.pos.x = clamp(fixed.x, -268, 336);
      state.pos.z = clamp(fixed.z, -268, 268);
      const targetHeading = Math.atan2(wx, wz);
      state.heading = angleLerp(state.heading, targetHeading, Math.min(1, dt * 12));
      state.walkPhase += dt * (sprint ? 13 : 9);
    } else {
      state.walkPhase += dt * 2;
    }

    // Jump.
    if (input.jumpPressed && state.grounded) {
      state.vy = 7.5;
      state.grounded = false;
    }
    if (!state.grounded) {
      state.vy -= 22 * dt;
      state.pos.y += state.vy * dt;
      if (state.pos.y <= 0) { state.pos.y = 0; state.vy = 0; state.grounded = true; }
    }

    // Punch.
    if (input.punchPressed && state.punchCooldown <= 0) {
      state.punchCooldown = 0.45;
      state.punchAnim = 0.3;
      if (onPunch) onPunch(state);
    }

    // Walk-cycle animation.
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.55 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    if (state.punchAnim > 0) {
      armR.rotation.x = -1.6 * (state.punchAnim / 0.3);
    } else {
      armL.rotation.x = -swing * 0.7;
      armR.rotation.x = swing * 0.7;
    }
    torso.position.y = 1.18 + (state.moving ? Math.abs(Math.sin(state.walkPhase)) * 0.05 : 0);

    group.position.copy(state.pos);
    group.rotation.y = state.heading;
  }

  return { state, update, damage };
}
