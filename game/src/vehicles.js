// vehicles.js — box-built cars, traffic AI on the road graph, arcade driving,
// collisions, damage and wrecks. B1 (mission-car preference on E) is honoured
// by nearestCar's preferId argument.
import * as THREE from 'three';
import { clamp, angleLerp, lerp, dist2 } from './utils.js';
import { resolveCollisions } from './city.js';

export const CAR_TYPES = {
  sedan: { name: 'Sedan', topSpeed: 26, accel: 11, handling: 1.5, length: 4.4, width: 2.0, colors: [0x4a6bd8, 0xd8d8d8, 0x3a3a3a, 0x7a8a5f] },
  sport: { name: 'Comet S', topSpeed: 38, accel: 16, handling: 2.2, length: 4.2, width: 2.0, colors: [0xd81f2a, 0xffc21f, 0x1f8ad8] },
  taxi: { name: 'Taxi', topSpeed: 26, accel: 11, handling: 1.5, length: 4.4, width: 2.0, colors: [0xf2c230] },
  truck: { name: 'Truck', topSpeed: 20, accel: 7, handling: 1.0, length: 6.4, width: 2.4, colors: [0x8a8a8a, 0x5f7d8a] },
  limo: { name: 'Limo', topSpeed: 24, accel: 9, handling: 1.2, length: 7.2, width: 2.2, colors: [0x141414] },
  police: { name: 'Police Cruiser', topSpeed: 33, accel: 14, handling: 2.0, length: 4.6, width: 2.0, colors: [0x1a1a1a] },
};

let carSeq = 0;

export function buildCarMesh(THREE, type, color) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const L = spec.length, W = spec.width;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, 0.75, W), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, 0.65, W * 0.82),
    new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.2, metalness: 0.4 }));
  cabin.position.set(-L * 0.05, 1.2, 0);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 });
  const wheels = [];
  for (const [wx, wz] of [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel); wheels.push(wheel);
  }
  // Headlights + taillights.
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.2 }));
  hl.position.set(L / 2 + 0.02, 0.62, 0.55); g.add(hl);
  const hl2 = hl.clone(); hl2.position.z = -0.55; g.add(hl2);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xd81f1f, emissive: 0xd81f1f, emissiveIntensity: 0.9 }));
  tl.position.set(-L / 2 - 0.02, 0.62, 0.55); g.add(tl);
  const tl2 = tl.clone(); tl2.position.z = -0.55; g.add(tl2);
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 0.8 }));
    sign.position.set(0, 1.68, 0);
    g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4 }));
    bar.position.set(0, 1.62, 0);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xff1f1f, emissive: 0xff1f1f, emissiveIntensity: 2 }));
    red.position.set(0, 1.74, 0.28); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x1f4fff, emissive: 0x1f4fff, emissiveIntensity: 2 }));
    blue.position.set(0, 1.74, -0.28); g.add(blue);
    g.userData.lightBar = { red, blue };
  }
  g.userData.wheels = wheels;
  return g;
}

export function createVehicles(THREE, city, rng) {
  const group = new THREE.Group();
  group.name = 'vehicles';
  const cars = [];
  const colliders = city.colliders;

  function addCar(type, x, z, heading, colorOverride, opts = {}) {
    const spec = CAR_TYPES[type];
    const color = colorOverride ?? rng.pick(spec.colors);
    const mesh = buildCarMesh(THREE, type, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    group.add(mesh);
    const car = {
      id: opts.id ?? `car-${++carSeq}`,
      type, spec, mesh, color,
      pos: new THREE.Vector3(x, 0, z),
      heading, speed: 0,
      health: 100, wrecked: false,
      isPlayer: false, isPolice: type === 'police',
      isParked: !!opts.parked,
      driver: opts.driver ?? null, // traffic state {axis, line, dir, lane}
      chase: null, // police chase target {pos}
      sirenPhase: 0,
      smoke: null,
    };
    cars.push(car);
    return car;
  }

  // --- Parked cars: the red Comet S at the marina (mission car), a limo at the
  // casino, a sedan near the garage, a taxi at the market.
  const comet = addCar('sport', 276, -72, Math.PI / 2, 0xd81f2a, { id: 'comet', parked: true });
  addCar('limo', 138, -128, 0, null, { parked: true });
  addCar('sedan', 78, 132, Math.PI, null, { parked: true });
  addCar('taxi', -12, 18, -Math.PI / 2, null, { parked: true });
  addCar('sedan', -198, -186, Math.PI / 2, null, { parked: true });
  addCar('truck', 210, 96, Math.PI, null, { parked: true });

  // --- Traffic: ambient cars cruising the road graph, right-hand lanes:
  // a car moving +x keeps to +z of the line, +z keeps to -x, so opposing
  // traffic never shares a lane (no head-on deadlocks).
  function spawnTrafficCar() {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.pick(city.roads);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = 3.5 * (axis === 'x' ? dir : -dir);
    const t = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport']);
    const along = rng.range(-240, 240);
    const x = axis === 'x' ? along : line + lane;
    const z = axis === 'x' ? line + lane : along;
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = addCar(t, x, z, heading, null, {
      driver: { axis, line, dir, lane, cruise: rng.range(9, 15), turnCooldown: rng.range(1, 4) },
    });
    car.speed = car.driver.cruise;
    return car;
  }
  for (let i = 0; i < 10; i++) spawnTrafficCar();

  let playerCar = null;

  // B1: when a mission car id is preferred, it wins over the nearest car.
  function nearestCar(pos, maxDist, preferId) {
    if (preferId) {
      const wanted = cars.find((c) => c.id === preferId && !c.wrecked);
      if (wanted && dist2(pos.x, pos.z, wanted.pos.x, wanted.pos.z) <= maxDist) return wanted;
    }
    let best = null, bd = maxDist;
    for (const c of cars) {
      if (c.wrecked || c.isPlayer) continue;
      const d = dist2(pos.x, pos.z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar(car, playerState) {
    if (!car || car.wrecked) return false;
    playerCar = car;
    car.isPlayer = true;
    car.isParked = false;
    car.driver = null;
    playerState.inVehicle = car;
    return true;
  }

  function exitCar(playerState) {
    if (!playerCar) return;
    const car = playerCar;
    car.isPlayer = false;
    car.speed *= 0.4;
    playerCar = null;
    playerState.inVehicle = null;
    // Step out to the driver's side.
    const sx = car.pos.x + Math.cos(car.heading) * 1.8;
    const sz = car.pos.z - Math.sin(car.heading) * 1.8;
    playerState.pos.set(sx, 0, sz);
    playerState.heading = car.heading;
  }

  function damageCar(car, amount, onWreck) {
    if (car.wrecked) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      car.speed = 0;
      if (car.smoke) return;
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.55 }));
      smoke.position.set(0, 1.8, 0);
      car.mesh.add(smoke);
      car.smoke = smoke;
      if (onWreck) onWreck(car);
    }
  }

  function updatePlayerDriving(dt, input, ctx) {
    const car = playerCar;
    if (!car || car.wrecked) return;
    const spec = car.spec;
    const fwd = input.keys.has('KeyW');
    const back = input.keys.has('KeyS');
    const handbrake = input.keys.has('Space');
    if (fwd) car.speed += spec.accel * dt;
    if (back) car.speed -= (car.speed > 0.5 ? spec.accel * 1.4 : spec.accel * 0.6) * dt;
    if (!fwd && !back) car.speed -= Math.sign(car.speed) * 6 * dt;
    if (handbrake) car.speed -= Math.sign(car.speed) * 18 * dt;
    car.speed = clamp(car.speed, -10, spec.topSpeed);
    if (Math.abs(car.speed) < 0.2 && !fwd && !back) car.speed = 0;

    let steer = 0;
    if (input.keys.has('KeyA')) steer += 1;
    if (input.keys.has('KeyD')) steer -= 1;
    const steerFactor = clamp(Math.abs(car.speed) / 8, 0, 1) * (handbrake ? 1.5 : 1);
    car.heading += steer * spec.handling * steerFactor * dt * Math.sign(car.speed || 1) * 0.9;

    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    const fixed = resolveCollisions(colliders, nx, nz, 1.6);
    if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(car.speed) > 6) {
      // One damage tick per impact, not per frame of scraping (0.8s cooldown).
      if (ctx.now - (car.lastCollideAt || -99) > 0.8) {
        car.lastCollideAt = ctx.now;
        damageCar(car, Math.abs(car.speed) * 0.5, ctx.onWreck);
      }
      if (ctx.onCrash) ctx.onCrash(Math.abs(car.speed));
      car.speed *= 0.35;
    }
    car.pos.x = clamp(fixed.x, -268, 336);
    car.pos.z = clamp(fixed.z, -268, 268);

    // Car-car collisions (player car vs others).
    for (const other of cars) {
      if (other === car || other.wrecked) continue;
      const d = dist2(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
      const minD = 2.6;
      if (d < minD && d > 0.01) {
        const push = (minD - d) / 2;
        const nx2 = (car.pos.x - other.pos.x) / d, nz2 = (car.pos.z - other.pos.z) / d;
        car.pos.x += nx2 * push; car.pos.z += nz2 * push;
        other.pos.x -= nx2 * push; other.pos.z -= nz2 * push;
        const impact = Math.abs(car.speed) + Math.abs(other.speed);
        if (impact > 8) {
          // One damage tick per impact per car (0.8s cooldown), not per frame.
          if (ctx.now - (car.lastCollideAt || -99) > 0.8) {
            car.lastCollideAt = ctx.now;
            damageCar(car, impact * 0.35, ctx.onWreck);
          }
          if (ctx.now - (other.lastCollideAt || -99) > 0.8) {
            other.lastCollideAt = ctx.now;
            damageCar(other, impact * 0.4, ctx.onWreck);
          }
          if (ctx.onCrash) ctx.onCrash(impact);
          if (ctx.onHitPed) { /* cars only here */ }
        }
        car.speed *= 0.7;
        other.speed *= 0.6;
      }
    }

    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    const wheels = car.mesh.userData.wheels;
    if (wheels) for (const w of wheels) w.rotation.z -= car.speed * dt * 2.4;
    if (car.smoke) { car.smoke.position.y = 1.8 + Math.sin(ctx.now * 3) * 0.25; car.smoke.scale.setScalar(1 + Math.sin(ctx.now * 2) * 0.15); }
  }

  function updateTraffic(dt, ctx) {
    for (const car of cars) {
      if (car.isPlayer || !car.driver || car.wrecked) continue;
      const d = car.driver;
      d.turnCooldown -= dt;
      // Brake for a car ahead on the same lane (early: the player closes fast).
      let targetSpeed = d.cruise;
      for (const other of cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 20 && side < 3) { targetSpeed = 0; break; }
      }
      // Brake for the player on foot in front.
      if (ctx.playerPos && !ctx.playerInVehicle) {
        const dx = ctx.playerPos.x - car.pos.x, dz = ctx.playerPos.z - car.pos.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
        if (ahead > 0 && ahead < 9 && side < 2.5) targetSpeed = 0;
      }
      car.speed = lerp(car.speed, targetSpeed, Math.min(1, dt * 2));

      // Turn at intersections sometimes.
      const onIntersection = Math.abs(car.pos.x % 60) < 3 || Math.abs(car.pos.z % 60) < 3;
      if (d.turnCooldown <= 0 && onIntersection && Math.random() < 0.25) {
        d.turnCooldown = 3 + Math.random() * 3;
        if (d.axis === 'x') {
          d.axis = 'z'; d.line = city.nearestRoadLine(car.pos.z); d.dir = Math.random() < 0.5 ? 1 : -1;
        } else {
          d.axis = 'x'; d.line = city.nearestRoadLine(car.pos.x); d.dir = Math.random() < 0.5 ? 1 : -1;
        }
        // Right-hand lane for the new direction (see spawnTrafficCar).
        d.lane = 3.5 * (d.axis === 'x' ? d.dir : -d.dir);
      }
      // Steer toward the lane line.
      const wantHeading = d.axis === 'x'
        ? (d.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (d.dir > 0 ? 0 : Math.PI);
      car.heading = angleLerp(car.heading, wantHeading, Math.min(1, dt * 1.6));
      // Lane correction: drift toward the lane offset.
      const lanePos = d.axis === 'x' ? d.line + d.lane : d.line + d.lane;
      if (d.axis === 'x') {
        const err = lanePos - car.pos.z;
        car.heading -= clamp(err * 0.02, -0.02, 0.02);
      } else {
        const err = lanePos - car.pos.x;
        car.heading += clamp(err * 0.02, -0.02, 0.02);
      }
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      // Wrap around the city edges.
      if (car.pos.x > 250) car.pos.x = -250;
      if (car.pos.x < -250) car.pos.x = 250;
      if (car.pos.z > 250) car.pos.z = -250;
      if (car.pos.z < -250) car.pos.z = 250;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      const wheels = car.mesh.userData.wheels;
      if (wheels) for (const w of wheels) w.rotation.z -= car.speed * dt * 2.4;
    }
  }

  function update(dt, input, ctx) {
    updatePlayerDriving(dt, input, ctx);
    updateTraffic(dt, ctx);
    // Police light-bar flash.
    for (const car of cars) {
      if (!car.isPolice) continue;
      car.sirenPhase += dt * 8;
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        const on = Math.sin(car.sirenPhase) > 0;
        bar.red.material.emissiveIntensity = on ? 2.5 : 0.2;
        bar.blue.material.emissiveIntensity = on ? 0.2 : 2.5;
      }
    }
  }

  return {
    group, cars, comet,
    get playerCar() { return playerCar; },
    spawnTrafficCar,
    addCar,
    nearestCar, enterCar, exitCar, damageCar,
    update,
  };
}
