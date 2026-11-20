// police.js — wanted 0-5 stars, patrol cars that chase/ram/block, foot cops
// that arrest (on foot) and shoot, helicopter with searchlight at 4+ stars,
// heat decay when unseen, busted/wasted flow.
import { clamp, angleLerp, dist2, makeRng } from './utils.js';
import { makeCar, damageCar } from './vehicles.js';

export function createPolice(THREE, scene) {
  return {
    THREE, scene,
    wanted: 0, heat: 0, // heat 0..100 drives the star level
    patrols: [], cops: [], heli: null, heliLight: null,
    lastSeen: 0, bustedTimer: 0, arrestRange: 2.2,
  };
}

export function addWanted(police, stars) {
  police.heat = clamp(police.heat + stars * 20, 0, 100);
  police.wanted = Math.min(5, Math.max(0, Math.ceil(police.heat / 20)));
  syncPatrols(police);
}

export function setWanted(police, stars) {
  police.wanted = clamp(stars, 0, 5);
  police.heat = police.wanted * 20;
  syncPatrols(police);
}

function syncPatrols(police) {
  const want = police.wanted === 0 ? 0 : Math.min(4, police.wanted + 1);
  // spawn more patrol cars
  while (police.patrols.length < want) {
    const c = makeCar(police.THREE, police.scene, 'police', 0, 0, 0, { ai: null });
    police.patrols.push(c);
  }
  // despawn extras
  while (police.patrols.length > want) {
    const c = police.patrols.pop();
    police.scene.remove(c.group);
  }
  // helicopter at 4+ stars
  if (police.wanted >= 4 && !police.heli) {
    const g = new police.THREE.Group();
    const body = new police.THREE.Mesh(new police.THREE.BoxGeometry(3.4, 1.4, 6),
      new police.THREE.MeshLambertMaterial({ color: 0x22304a }));
    body.position.y = 0; g.add(body);
    const rotor = new police.THREE.Mesh(new police.THREE.BoxGeometry(9, 0.12, 0.5),
      new police.THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1; rotor.name = 'rotor'; g.add(rotor);
    const spot = new police.THREE.SpotLight(0xfff2b0, 3, 90, 0.32, 0.5);
    spot.position.set(0, -0.6, 2); g.add(spot); g.add(spot.target);
    spot.target.position.set(0, -30, 0);
    const disc = new police.THREE.Mesh(new police.THREE.CircleGeometry(6, 20),
      new police.THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -18; disc.name = 'beam'; g.add(disc);
    police.scene.add(g);
    police.heli = g; police.heliLight = spot;
  }
  if (police.wanted < 4 && police.heli) {
    police.scene.remove(police.heli); police.heli = null; police.heliLight = null;
  }
}

function spawnCopOnFoot(police, x, z) {
  const THREE = police.THREE;
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(mat, w, h, d, px, py, pz) {
    const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(px, py, pz); g.add(m); return m;
  }
  part(navy, 0.6, 0.7, 0.32, 0, 1.15, 0);
  part(skin, 0.4, 0.4, 0.38, 0, 1.72, 0);
  part(navy, 0.62, 0.18, 0.36, 0, 1.5, 0); // cap brim
  part(navy, 0.22, 0.76, 0.26, -0.16, 0.4, 0);
  part(navy, 0.22, 0.76, 0.26, 0.16, 0.4, 0);
  g.position.set(x, 0, z);
  police.scene.add(g);
  police.cops.push({ group: g, pos: new THREE.Vector3(x, 0, z), heading: 0, shootTimer: 1.5 });
}

// dt update. player: {pos, onFoot, car, health}; returns 'busted'|'wasted'|null
export function updatePolice(police, dt, player, city, audio, time) {
  const THREE = police.THREE;
  const px = player.pos.x, pz = player.pos.z;
  // heat decay when no star activity: slow cool-off
  if (police.wanted > 0) {
    police.heat -= dt * 1.1;
    if (police.heat <= 0) { police.heat = 0; police.wanted = 0; syncPatrols(police); }
    else police.wanted = Math.min(5, Math.max(1, Math.ceil(police.heat / 20)));
  }
  // patrol cars: spawn near player, chase / ram
  for (const car of police.patrols) {
    const d = dist2(car.pos.x, car.pos.z, px, pz);
    if (d > 130) { // respawn closer, on a road near the player
      const nx = clamp(px + (Math.random() - 0.5) * 90, -170, 170);
      const nz = clamp(pz + (Math.random() - 0.5) * 90, -170, 170);
      car.pos.set(nx, 0, nz); car.speed = 0;
    }
    const wantHeading = Math.atan2(px - car.pos.x, pz - car.pos.z);
    car.heading = angleLerp(car.heading, wantHeading, clamp(dt * 1.6, 0, 1));
    const targetSpeed = d > 6 ? 30 : 12;
    car.speed = car.speed + (targetSpeed - car.speed) * clamp(dt * 1.2, 0, 1);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    // ram: gentle nudge damage while touching (M2 — a chase must not shred the car)
    if (d < 3.6) {
      if (player.car) {
        damageCar(player.car, 0.5 * dt, null);
        player.car.speed *= 0.94;
      } else {
        player.health -= 6 * dt;
      }
      if (audio && Math.random() < dt * 2) audio.crash();
    }
  }
  // foot cops at 2+ stars when the player is on foot: chase, arrest, shoot
  if (police.wanted >= 2 && player.onFoot) {
    if (police.cops.length < police.wanted - 1 && Math.random() < dt * 0.5) {
      spawnCopOnFoot(police, px + (Math.random() - 0.5) * 40, pz + (Math.random() - 0.5) * 40);
    }
    for (const cop of police.cops) {
      const d = dist2(cop.pos.x, cop.pos.z, px, pz);
      cop.heading = Math.atan2(px - cop.pos.x, pz - cop.pos.z);
      if (d > police.arrestRange) {
        const sp = 5.2;
        cop.pos.x += Math.sin(cop.heading) * sp * dt;
        cop.pos.z += Math.cos(cop.heading) * sp * dt;
      } else {
        // arrested: busted
        return 'busted';
      }
      // shoot from range at 3+ stars
      if (police.wanted >= 3 && d < 26) {
        cop.shootTimer -= dt;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = 1.1;
          player.health -= 7;
          if (audio) audio.gunshot();
        }
      }
      cop.group.position.copy(cop.pos);
      cop.group.rotation.y = cop.heading;
    }
  } else if (police.wanted < 2) {
    for (const cop of police.cops) police.scene.remove(cop.group);
    police.cops = [];
  }
  // helicopter: hover low ahead of the player, sweeping the searchlight
  // (low + ahead so it stays inside the chase camera's frame)
  if (police.heli) {
    const t = time * 0.5;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);
    const sway = Math.sin(t) * 8;
    police.heli.position.set(px + fx * 26 + rx * sway, 15, pz + fz * 26 + rz * sway);
    const rotor = police.heli.getObjectByName('rotor');
    if (rotor) rotor.rotation.y += dt * 22;
    police.heli.lookAt(px, 0, pz);
  }
  if (player.health <= 0) return 'wasted';
  return null;
}

export function clearPolice(police) {
  for (const c of police.patrols) police.scene.remove(c.group);
  police.patrols = [];
  for (const c of police.cops) police.scene.remove(c.group);
  police.cops = [];
  if (police.heli) { police.scene.remove(police.heli); police.heli = null; }
  police.wanted = 0; police.heat = 0;
}
