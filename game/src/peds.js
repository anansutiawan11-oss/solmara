// peds.js — 22 pedestrians strolling sidewalks, fleeing from danger, knock-downs.
import { makeRng, clamp } from './utils.js';

const SHIRTS = [0xd94f3d, 0x3d8fd9, 0x3dd97a, 0xe8b93a, 0x8a5fd9, 0xe88a3a, 0xdddddd, 0x3a3a3a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

export function spawnPeds(THREE, scene, city, count, seed) {
  const rng = makeRng(seed + 31);
  const peds = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
    const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
    const pants = new THREE.MeshLambertMaterial({ color: rng.pick([0x2e3a55, 0x3a3a3a, 0x5a4a3a]) });
    function part(mat, w, h, d, x, y, z) {
      const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); return m;
    }
    part(shirt, 0.56, 0.66, 0.3, 0, 1.12, 0);
    part(skin, 0.38, 0.38, 0.36, 0, 1.68, 0);
    const legL = part(pants, 0.22, 0.74, 0.26, -0.15, 0.4, 0);
    const legR = part(pants, 0.22, 0.74, 0.26, 0.15, 0.4, 0);
    const armL = part(shirt, 0.18, 0.6, 0.22, -0.38, 1.14, 0);
    const armR = part(shirt, 0.18, 0.6, 0.22, 0.38, 1.14, 0);
    // stroll along a random sidewalk: pick a road line and walk its length
    const line = city.lines[Math.floor(rng.next() * city.lines.length)];
    const along = rng.range(-170, 170);
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : line + 8;
    const z = horizontal ? line + 8 : along;
    g.position.set(x, 0, z);
    scene.add(g);
    peds.push({
      group: g, legL, legR, armL, armR,
      pos: new THREE.Vector3(x, 0, z),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.2), phase: rng.range(0, 6),
      state: 'stroll', fleeFrom: null, down: false, downTimer: 0,
      wanderTarget: null, panic: 0,
    });
  }
  return peds;
}

export function updatePeds(peds, dt, dangerPos, dangerRadius) {
  for (const p of peds) {
    if (p.down) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) { p.down = false; p.group.rotation.x = 0; p.group.position.y = 0; }
      continue;
    }
    // flee if danger is close (gunfire, speeding car, police chase)
    if (dangerPos && Math.hypot(p.pos.x - dangerPos.x, p.pos.z - dangerPos.z) < dangerRadius) {
      p.state = 'flee'; p.panic = 3;
      p.fleeFrom = { x: dangerPos.x, z: dangerPos.z };
    }
    if (p.panic > 0) p.panic -= dt; else if (p.state === 'flee') p.state = 'stroll';
    let speed = p.speed;
    if (p.state === 'flee') {
      speed = 5.5;
      const dx = p.pos.x - p.fleeFrom.x, dz = p.pos.z - p.fleeFrom.z;
      p.heading = Math.atan2(dx, dz);
    } else {
      // wander: pick a nearby target, walk to it, pick another
      if (!p.wanderTarget || Math.hypot(p.pos.x - p.wanderTarget.x, p.pos.z - p.wanderTarget.z) < 2) {
        p.wanderTarget = { x: p.pos.x + (Math.random() - 0.5) * 60, z: p.pos.z + (Math.random() - 0.5) * 60 };
        p.wanderTarget.x = clamp(p.wanderTarget.x, -175, 175);
        p.wanderTarget.z = clamp(p.wanderTarget.z, -175, 200);
      }
      p.heading = Math.atan2(p.wanderTarget.x - p.pos.x, p.wanderTarget.z - p.pos.z);
    }
    p.pos.x += Math.sin(p.heading) * speed * dt;
    p.pos.z += Math.cos(p.heading) * speed * dt;
    p.phase += dt * speed * 4;
    const swing = Math.sin(p.phase) * 0.5;
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.7; p.armR.rotation.x = swing * 0.7;
    p.group.position.copy(p.pos);
    p.group.rotation.y = p.heading;
  }
}

export function knockDownPed(p) {
  if (p.down) return;
  p.down = true; p.downTimer = 2.5;
  p.group.rotation.x = Math.PI / 2; p.group.position.y = 0.3;
}
