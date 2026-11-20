// peds.js — 22 pedestrians strolling sidewalks, fleeing danger, knock-downs.
import * as THREE from 'three';
import { clamp, dist2 } from './utils.js';
import { resolveCollisions } from './city.js';

const SHIRTS = [0xe8574f, 0x4f9de8, 0x5fbf6b, 0xf2a541, 0x9c6bd8, 0xe8e8e8, 0x3a3a3a, 0xd84a6b];
const PANTS = [0x2e4a6b, 0x3a3a3a, 0x7a6b4a, 0x5f4a3a];

export function createPeds(THREE, city, rng) {
  const group = new THREE.Group();
  group.name = 'peds';
  const peds = [];

  function buildPed(i) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[i % SHIRTS.length], roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: PANTS[i % PANTS.length], roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: [0xc98d64, 0x8a5a3a, 0xe8b88a][i % 3], roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
    torso.position.y = 1.12; torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skin);
    head.position.y = 1.68;
    g.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
    legL.position.set(-0.15, 0.35, 0);
    g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.15;
    g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.17), shirt);
    armL.position.set(-0.37, 1.15, 0);
    g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.37;
    g.add(armR);
    return { g, legL, legR, armL, armR };
  }

  // Spawn on sidewalks: alongside a road line, offset ~9.5.
  function spawnSpot() {
    const road = rng.pick(city.roads);
    const along = rng.range(-240, 240);
    const side = rng.chance(0.5) ? 1 : -1;
    if (rng.chance(0.5)) return { x: along, z: road + side * 9.5 };
    return { x: road + side * 9.5, z: along };
  }

  for (let i = 0; i < 22; i++) {
    const parts = buildPed(i);
    const spot = spawnSpot();
    parts.g.position.set(spot.x, 0, spot.z);
    group.add(parts.g);
    peds.push({
      id: `ped-${i}`,
      ...parts,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(0.9, 1.6),
      phase: rng.range(0, 6),
      state: 'walk', // walk | flee | down
      downTimer: 0,
      health: 100,
      target: null, // wander target
      fleeFrom: null,
    });
  }

  function knockDown(ped, ctx) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = 4;
    ped.health = Math.max(0, ped.health - 60);
    ped.g.rotation.x = -Math.PI / 2; // lying flat
    ped.g.position.y = 0.3;
    if (ctx && ctx.onPedDown) ctx.onPedDown(ped);
  }

  function flee(ped, fromX, fromZ) {
    if (ped.state === 'down') return;
    ped.state = 'flee';
    ped.fleeFrom = { x: fromX, z: fromZ };
    ped.speed = 4.2;
  }

  function update(dt, ctx) {
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.g.rotation.x = 0;
          ped.g.position.y = 0;
          ped.speed = 1.2;
        }
        continue;
      }
      // Danger nearby: flee from gunshots, fast cars, police chases.
      if (ctx.danger) {
        const d = dist2(ped.pos.x, ped.pos.z, ctx.danger.x, ctx.danger.z);
        if (d < 22 && ped.state !== 'flee') flee(ped, ctx.danger.x, ctx.danger.z);
      }
      if (ped.state === 'flee') {
        const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        const nx = ped.pos.x + (dx / d) * ped.speed * dt;
        const nz = ped.pos.z + (dz / d) * ped.speed * dt;
        const fixed = resolveCollisions(ctx.colliders, nx, nz, 0.5);
        ped.pos.x = clamp(fixed.x, -268, 336);
        ped.pos.z = clamp(fixed.z, -268, 268);
        ped.phase += dt * 12;
        if (Math.hypot(ped.pos.x - ped.fleeFrom.x, ped.pos.z - ped.fleeFrom.z) > 40) {
          ped.state = 'walk';
          ped.speed = 1.2;
        }
      } else {
        // Wander: pick a new sidewalk target when close or none.
        if (!ped.target || dist2(ped.pos.x, ped.pos.z, ped.target.x, ped.target.z) < 2) {
          const spot = spawnSpot();
          ped.target = spot;
        }
        const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        const nx = ped.pos.x + (dx / d) * ped.speed * dt;
        const nz = ped.pos.z + (dz / d) * ped.speed * dt;
        const fixed = resolveCollisions(ctx.colliders, nx, nz, 0.5);
        ped.pos.x = clamp(fixed.x, -268, 336);
        ped.pos.z = clamp(fixed.z, -268, 268);
        ped.phase += dt * 7;
      }
      // Knocked down by a fast car?
      if (ctx.cars) {
        for (const car of ctx.cars) {
          if (car.wrecked || Math.abs(car.speed) < 4) continue;
          if (dist2(ped.pos.x, ped.pos.z, car.pos.x, car.pos.z) < 2.2) {
            knockDown(ped, ctx);
            if (ctx.onCarHitPed) ctx.onCarHitPed(ped, car);
            break;
          }
        }
      }
      // Walk-cycle.
      const swing = Math.sin(ped.phase) * 0.5;
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.armL.rotation.x = -swing * 0.7;
      ped.armR.rotation.x = swing * 0.7;
      ped.g.position.set(ped.pos.x, ped.pos.y, ped.pos.z);
      ped.g.rotation.y = ped.heading;
    }
  }

  return { group, peds, update, knockDown, flee };
}
