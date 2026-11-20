// police.js — wanted 0–5 stars, patrol cars that chase/ram/block, foot cops
// that arrest (on foot) and shoot, helicopter with searchlight at 4+ stars,
// heat decay when unseen, busted / wasted flow.
import * as THREE from 'three';
import { clamp, angleLerp, lerp, dist2 } from './utils.js';
import { resolveCollisions } from './city.js';

const MAX_COPS = 8;

export function createPolice(THREE, city, vehicles, rng) {
  const group = new THREE.Group();
  group.name = 'police';
  const state = {
    wanted: 0,
    heat: 0, // 0..1, grows while police see the player
    lastSeenAt: -99,
    busted: false,
    wasted: false,
    cops: [], // foot cops
    heli: null,
    heliLight: null,
  };

  function spawnPatrolCar(nearX, nearZ) {
    const line = city.nearestRoadLine(nearX + (Math.random() < 0.5 ? -1 : 1) * 90);
    const car = vehicles.addCar('police', line + 3.5, nearZ + (Math.random() < 0.5 ? -1 : 1) * 60, 0, null, {});
    car.chase = { x: nearX, z: nearZ };
    return car;
  }

  function spawnFootCop(x, z) {
    if (state.cops.length >= MAX_COPS) return null;
    const g = new THREE.Group();
    const uni = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), uni);
    torso.position.y = 1.15; torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
    head.position.y = 1.74;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x0f1a30 }));
    cap.position.y = 1.94;
    g.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.75, 0.22), uni);
    legL.position.set(-0.16, 0.38, 0);
    g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.16;
    g.add(legR);
    g.position.set(x, 0, z);
    group.add(g);
    const cop = {
      g, legL, legR,
      pos: new THREE.Vector3(x, 0, z),
      heading: 0, speed: 3.4,
      shootTimer: 0, phase: Math.random() * 6,
      health: 100,
    };
    state.cops.push(cop);
    return cop;
  }

  function spawnHeli() {
    if (state.heli) return;
    const heli = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.4, metalness: 0.3 }));
    heli.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2a4a8a }));
    tail.position.set(-3.6, 0.3, 0);
    heli.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x333333 }));
    rotor.position.y = 1.1;
    heli.add(rotor);
    heli.userData.rotor = rotor;
    const light = new THREE.SpotLight(0xfff2c0, 900, 120, 0.35, 0.4, 1.2);
    light.position.set(0, -0.8, 0);
    heli.add(light);
    heli.add(light.target);
    light.target.position.set(0, -40, 0);
    state.heli = heli;
    state.heliLight = light;
    group.add(heli);
  }

  function removeHeli() {
    if (!state.heli) return;
    group.remove(state.heli);
    state.heli = null;
    state.heliLight = null;
  }

  function addWanted(n, ctx) {
    state.wanted = clamp(state.wanted + n, 0, 5);
    state.heat = 1;
    state.lastSeenAt = ctx.now;
    if (state.wanted >= 1) {
      const patrols = vehicles.cars.filter((c) => c.isPolice && !c.wrecked).length;
      const want = Math.min(1 + state.wanted, 4);
      for (let i = patrols; i < want; i++) spawnPatrolCar(ctx.playerPos.x, ctx.playerPos.z);
    }
    if (state.wanted >= 1 && ctx.playerInVehicle === false) {
      if (state.cops.length < 2) spawnFootCop(ctx.playerPos.x + 12, ctx.playerPos.z + 8);
    }
  }

  function clearWanted() {
    state.wanted = 0;
    state.heat = 0;
    for (const car of vehicles.cars.filter((c) => c.isPolice)) car.chase = null;
    removeHeli();
    for (const cop of state.cops) group.remove(cop.g);
    state.cops = [];
  }

  function update(dt, ctx) {
    const { playerPos, playerInVehicle, now, playerState } = ctx;
    if (state.busted || state.wasted) return;

    // --- Helicopter at 4+ stars.
    if (state.wanted >= 4) spawnHeli();
    else if (state.wanted < 3) removeHeli();
    if (state.heli) {
      state.heli.position.set(playerPos.x + Math.sin(now * 0.5) * 14, 42, playerPos.z + Math.cos(now * 0.4) * 14);
      state.heli.rotation.y = now * 0.3;
      state.heli.userData.rotor.rotation.y += dt * 22;
      state.heat = 1;
      state.lastSeenAt = now;
    }

    // --- Heat: police see the player while any patrol is near or the heli is up.
    const anyNear = vehicles.cars.some((c) => c.isPolice && !c.wrecked &&
      dist2(c.pos.x, c.pos.z, playerPos.x, playerPos.z) < 70);
    const anyCopNear = state.cops.some((c) => dist2(c.pos.x, c.pos.z, playerPos.x, playerPos.z) < 40);
    if (anyNear || anyCopNear || state.heli) {
      state.heat = 1;
      state.lastSeenAt = now;
    } else if (now - state.lastSeenAt > 8) {
      state.heat = Math.max(0, state.heat - dt * 0.12);
      if (state.heat <= 0 && state.wanted > 0 && now - state.lastSeenAt > 20) {
        state.wanted -= 1;
        state.lastSeenAt = now;
        if (state.wanted === 0) clearWanted();
      }
    }

    // --- Patrol cars chase the player.
    for (const car of vehicles.cars) {
      if (!car.isPolice || car.wrecked) continue;
      if (state.wanted === 0) {
        // Idle patrol: slow cruise along a road.
        if (!car.driver) car.driver = { axis: 'x', line: city.nearestRoadLine(car.pos.z), dir: 1, lane: 3.5, cruise: 10, turnCooldown: 2 };
        continue;
      }
      car.driver = null;
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx / d, dz / d);
      // Ram: aim slightly ahead of the player.
      const lead = playerInVehicle ? 6 : 2;
      const lx = playerPos.x + Math.sin(playerState.heading) * lead;
      const lz = playerPos.z + Math.cos(playerState.heading) * lead;
      const lh = Math.atan2(lx - car.pos.x, lz - car.pos.z);
      car.heading = angleLerp(car.heading, lh, Math.min(1, dt * 2.2));
      const targetSpeed = d > 26 ? car.spec.topSpeed : d > 10 ? 20 : 12;
      car.speed = lerp(car.speed, targetSpeed, Math.min(1, dt * 1.5));
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      const fixed = resolveCollisions(city.colliders, car.pos.x, car.pos.z, 1.6);
      car.pos.x = clamp(fixed.x, -268, 336);
      car.pos.z = clamp(fixed.z, -268, 268);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      // Ram damage when touching the player's car.
      if (playerInVehicle && d < 4.2) {
        car.speed *= 0.55;
        if (ctx.onRam) ctx.onRam(car);
      }
      // Cop car despawns far away.
      if (d > 320) {
        car.pos.set(playerPos.x + (Math.random() < 0.5 ? -90 : 90), 0, playerPos.z + (Math.random() < 0.5 ? -90 : 90));
      }
    }

    // --- Foot cops: chase on foot, arrest up close, shoot at range.
    for (let i = state.cops.length - 1; i >= 0; i--) {
      const cop = state.cops[i];
      const d = dist2(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z);
      if (state.wanted === 0 || d > 180) {
        group.remove(cop.g);
        state.cops.splice(i, 1);
        continue;
      }
      const dx = playerPos.x - cop.pos.x, dz = playerPos.z - cop.pos.z;
      cop.heading = Math.atan2(dx, dz);
      if (!playerInVehicle && d < 2.2) {
        // Arrested.
        state.busted = true;
        if (ctx.onBusted) ctx.onBusted();
        continue;
      }
      cop.speed = d > 12 ? 5.2 : 3.4;
      cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
      const fixed = resolveCollisions(city.colliders, cop.pos.x, cop.pos.z, 0.5);
      cop.pos.x = fixed.x; cop.pos.z = fixed.z;
      cop.phase += dt * 10;
      cop.legL.rotation.x = Math.sin(cop.phase) * 0.5;
      cop.legR.rotation.x = -Math.sin(cop.phase) * 0.5;
      cop.g.position.set(cop.pos.x, 0, cop.pos.z);
      cop.g.rotation.y = cop.heading;
      // Shoot when the player is on foot at mid range.
      cop.shootTimer -= dt;
      if (!playerInVehicle && d > 6 && d < 55 && cop.shootTimer <= 0) {
        cop.shootTimer = 1.1;
        if (ctx.onCopShot) ctx.onCopShot(cop, d);
      }
    }
  }

  return {
    group, state,
    addWanted, clearWanted, spawnPatrolCar, spawnFootCop, spawnHeli,
    update,
  };
}
