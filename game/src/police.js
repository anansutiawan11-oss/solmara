// The Solmara PD: a wanted level (0–5 stars), patrol cars that chase and ram,
// foot cops who try to arrest Mara on foot, and a helicopter at 4+ stars.
// Heat decays when no unit can see her.
import * as THREE from 'three';
import { clamp, damp, mulberry32, pick, range, angleDelta } from './utils.js';
import { makeCarMesh } from './vehicles.js';
import { makePersonMesh } from './peds.js';
import { nearestNode, collideCircle } from './city.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.heatTimer = 0;      // time since last crime / sighting
    this.arrest = 0;         // arrest progress 0..1
    this.cars = [];          // {mesh, x, z, heading, speed, health}
    this.cops = [];          // {mesh, x, z, heading, speed, health, down, shootAt}
    this.heli = null;        // {group, rotor, x, z, y}
    this.rng = mulberry32(99);
    this.sirenNear = 0;
    this.busted = false;
  }

  addHeat(n, quiet = false) {
    if (this.wanted >= 5) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.heatTimer = 0;
    if (!quiet && this.onHeat) this.onHeat(this.wanted);
  }

  clearWanted() {
    this.wanted = 0;
    this.arrest = 0;
    this.heatTimer = 0;
  }

  desiredCars() {
    return this.wanted === 0 ? 0 : this.wanted + 1;
  }

  spawnCar(x, z) {
    const mesh = makeCarMesh('police', 0xf2f2f2);
    this.scene.add(mesh);
    const car = { mesh, x, z, heading: 0, speed: 0, health: 60, maxSpeed: 34 + this.wanted * 1.6 };
    this.cars.push(car);
    return car;
  }

  spawnCop(x, z) {
    const mesh = makePersonMesh(0x1c2f6e, 0x1c2f6e, 0xc98d64);
    this.scene.add(mesh);
    const cop = { mesh, x, z, heading: 0, speed: 0, health: 3, down: 0, shootAt: 0, walkPhase: 0 };
    this.cops.push(cop);
    return cop;
  }

  spawnHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 60 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 5.2), bodyMat);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.4);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.1;
    rotor.name = 'rotor';
    g.add(rotor);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.6), new THREE.MeshPhongMaterial({ color: 0x9fd8ff, shininess: 140 }));
    glass.position.set(0, 0.2, 2.0);
    g.add(glass);
    // searchlight cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7, 42, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -21;
    cone.rotation.x = Math.PI;
    g.add(cone);
    this.scene.add(g);
    this.heli = { group: g, rotor, x: 0, z: 0, y: 46 };
    return this.heli;
  }

  update(dt, playerPos, playerInCar, playerSpeed, now, events) {
    // --- spawn / despawn to match wanted level ---
    const want = this.desiredCars();
    while (this.cars.length < want) {
      const node = nearestNode(this.city.nodes, playerPos.x, playerPos.z);
      const a = this.rng() * Math.PI * 2;
      const car = this.spawnCar(
        clamp(node.x + Math.sin(a) * 90, -240, 330),
        clamp(node.z + Math.cos(a) * 90, -240, 240),
      );
      car.heading = Math.atan2(playerPos.x - car.x, playerPos.z - car.z);
    }
    while (this.cars.length > want) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }
    const wantCops = this.wanted >= 2 ? Math.min(3, this.wanted - 1) : 0;
    while (this.cops.length < wantCops) {
      const a = this.rng() * Math.PI * 2;
      this.spawnCop(playerPos.x + Math.sin(a) * 24, playerPos.z + Math.cos(a) * 24);
    }
    while (this.cops.length > wantCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.mesh);
    }
    if (this.wanted >= 4 && !this.heli) this.spawnHeli();
    if (this.wanted < 4 && this.heli) {
      this.scene.remove(this.heli.group);
      this.heli = null;
    }

    let nearest = Infinity;
    let anyNear = false;

    // --- police cars: chase, ram, block ---
    for (const c of this.cars) {
      const dx = playerPos.x - c.x, dz = playerPos.z - c.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      if (dist < 70) anyNear = true;
      const wantHeading = Math.atan2(dx, dz);
      const steer = clamp(angleDelta(c.heading, wantHeading), -1, 1);
      const targetSpeed = dist < 6 ? 6 : c.maxSpeed;
      c.speed = damp(c.speed, targetSpeed, 1.2, dt);
      c.heading += steer * 2.6 * dt * clamp(c.speed / 8, 0.25, 1);
      const p = { x: c.x + Math.sin(c.heading) * c.speed * dt, z: c.z + Math.cos(c.heading) * c.speed * dt };
      collideCircle(this.city.colliders, p, 2.1);
      c.x = clamp(p.x, -245, 345);
      c.z = clamp(p.z, -245, 245);
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      for (const w of c.mesh.userData.wheels) w.rotation.x += (c.speed * dt) / 0.36;
      // flashing light bar
      const phase = Math.floor(now * 6) % 2 === 0;
      const r = c.mesh.getObjectByName('beaconR');
      const b = c.mesh.getObjectByName('beaconB');
      if (r) r.material.color.setHex(phase ? 0xff2222 : 0x550000);
      if (b) b.material.color.setHex(phase ? 0x112244 : 0x2266ff);
      // ramming the player's car
      if (playerInCar && dist < 3.9) {
        events.onRam && events.onRam(Math.abs(c.speed));
        c.speed *= 0.6;
      }
      // busted: pinned by a police car while stopped
      if (playerInCar && dist < 4.5 && Math.abs(playerSpeed) < 1.2) {
        this.arrest += dt / 3;
      }
    }

    // --- foot cops: run Mara down, shoot when she is armed and far ---
    for (const cop of this.cops) {
      if (cop.down > 0) {
        cop.down -= dt;
        if (cop.down <= 0) {
          cop.mesh.rotation.x = 0;
          cop.mesh.position.y = 0;
        }
        continue;
      }
      const dx = playerPos.x - cop.x, dz = playerPos.z - cop.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      if (dist < 70) anyNear = true;
      const wantHeading = Math.atan2(dx, dz);
      cop.heading += angleDelta(cop.heading, wantHeading) * Math.min(1, dt * 4);
      const run = dist > 2.4;
      cop.speed = run ? 5.6 : 0;
      const p = { x: cop.x + Math.sin(cop.heading) * cop.speed * dt, z: cop.z + Math.cos(cop.heading) * cop.speed * dt };
      collideCircle(this.city.colliders, p, 0.5);
      cop.x = clamp(p.x, -245, 345);
      cop.z = clamp(p.z, -245, 245);
      cop.walkPhase += cop.speed * dt * 3.2;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      const u = cop.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.6;
      u.armR.rotation.x = swing * 0.6;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      // arrest on foot
      if (!playerInCar && dist < 2.6) this.arrest += dt / 2.5;
      // shoot at range when wanted is high
      if (!playerInCar && dist > 8 && dist < 34 && this.wanted >= 2 && now - cop.shootAt > 1.6) {
        cop.shootAt = now;
        events.onCopShot && events.onCopShot(cop, dist);
      }
    }
    if (this.cars.length === 0 && this.cops.length === 0) this.arrest = Math.max(0, this.arrest - dt * 0.5);
    if (this.arrest >= 1 && !this.busted) {
      this.busted = true;
      events.onBusted && events.onBusted();
    }

    // --- helicopter: hover over Mara, spotlight, blocks heat decay ---
    if (this.heli) {
      const h = this.heli;
      h.x = damp(h.x, playerPos.x, 0.8, dt);
      h.z = damp(h.z, playerPos.z, 0.8, dt);
      h.group.position.set(h.x, h.y + Math.sin(now * 0.8) * 1.5, h.z);
      h.group.rotation.y = damp(h.group.rotation.y, Math.atan2(playerPos.x - h.x, playerPos.z - h.z), 1, dt);
      h.rotor.rotation.y += dt * 22;
      anyNear = true;
      nearest = Math.min(nearest, 30);
    }

    // --- heat decay ---
    this.sirenNear = nearest === Infinity ? 0 : clamp(1 - nearest / 90, 0, 1);
    if (this.wanted > 0) {
      if (!anyNear && !this.heli) {
        this.heatTimer += dt;
        const need = 10 + this.wanted * 5;
        if (this.heatTimer > need) {
          this.wanted -= 1;
          this.heatTimer = 0;
          if (this.onHeat) this.onHeat(this.wanted);
        }
      } else {
        this.heatTimer = 0;
      }
    }
    return { nearest, anyNear };
  }

  /** Damage a cop or police car at a point. Returns 'cop' | 'car' | null. */
  hitAt(x, z, radius, damage) {
    for (const cop of this.cops) {
      if (cop.down > 0) continue;
      if (Math.hypot(cop.x - x, cop.z - z) < radius) {
        cop.health -= damage;
        if (cop.health <= 0) {
          cop.down = 9;
          cop.mesh.rotation.x = -Math.PI / 2 + 0.15;
          cop.mesh.position.y = 0.35;
        }
        return 'cop';
      }
    }
    for (const c of this.cars) {
      if (Math.hypot(c.x - x, c.z - z) < radius + 1.4) {
        c.health -= damage * 8;
        if (c.health <= 0) {
          c.health = 0;
          c.maxSpeed = 0;
        }
        return 'car';
      }
    }
    return null;
  }
}
