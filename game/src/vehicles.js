// Cars: a box-built car factory, traffic that follows the road graph, and the
// player's arcade driving (accelerate, steer, handbrake, collisions).
import * as THREE from 'three';
import { clamp, damp, mulberry32, pick, range, angleDelta } from './utils.js';
import { ROADS, PITCH, collideCircle } from './city.js';

const CAR_COLORS = [0xd84a4a, 0x4a7dd8, 0xe8c85a, 0x7a7a82, 0x3fae7a, 0xd8d8d8, 0x8a4ad8, 0x222226, 0xe87a3a, 0x4ad8c8];

export function makeCarMesh(kind = 'sedan', color = 0xd84a4a) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x888888 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1a2836, shininess: 140, specular: 0xffffff });
  const dark = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const isLimo = kind === 'limo';
  const isTruck = kind === 'truck';
  const len = isLimo ? 6.4 : isTruck ? 5.2 : kind === 'sport' ? 4.2 : 4.4;
  const wid = 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.72, len), paint);
  body.position.y = 0.62;
  g.add(body);
  const cabinLen = isTruck ? 1.4 : len * 0.52;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.88, 0.62, cabinLen), glass);
  cabin.position.set(0, 1.26, isTruck ? len * 0.26 : -len * 0.06);
  g.add(cabin);
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(-0.28, 1.66, -0.1);
    bar.name = 'beaconR';
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    bar2.position.set(0.28, 1.66, -0.1);
    bar2.name = 'beaconB';
    g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.3, len * 0.9), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    stripe.position.y = 0.62;
    g.add(stripe);
  }
  // headlights + taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), hl);
    h.position.set(sx, 0.66, len / 2 + 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    t.position.set(sx, 0.66, -len / 2 - 0.02);
    g.add(t);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, len / 2 - 0.85], [0.95, len / 2 - 0.85], [-0.95, -len / 2 + 0.85], [0.95, -len / 2 + 0.85]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData = { kind, len, wid, wheels, paint };
  return g;
}

/** A point on a road segment, with a lane offset to the right of travel. */
function lanePoint(from, to, side) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  // right-hand side of travel direction
  const rx = -dz / len, rz = dx / len;
  return { x: from.x + rx * 3 * side, z: from.z + rz * 3 * side };
}

export class Traffic {
  constructor(scene, city, seed = 11) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.cars = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const kind = pick(this.rng, ['sedan', 'sedan', 'sedan', 'sport', 'taxi', 'truck']);
      const color = kind === 'taxi' ? 0xe8c85a : pick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(kind, color);
      this.scene.add(mesh);
      const node = pick(this.rng, this.city.nodes);
      const next = this.randomNeighbor(node);
      const car = {
        mesh, kind, node, next,
        x: node.x, z: node.z,
        heading: Math.atan2(next.x - node.x, next.z - node.z),
        speed: range(this.rng, 7, 11),
        cruise: range(this.rng, 8, 12),
        health: 100, wrecked: false, isTraffic: true,
      };
      const lp = lanePoint(node, next, 1);
      car.x = lp.x; car.z = lp.z;
      this.cars.push(car);
    }
  }

  randomNeighbor(node) {
    const cands = this.city.nodes.filter((n) =>
      (n.x === node.x && Math.abs(n.z - node.z) === PITCH) ||
      (n.z === node.z && Math.abs(n.x - node.x) === PITCH));
    return pick(this.rng, cands);
  }

  update(dt, playerCar) {
    for (const c of this.cars) {
      if (c.wrecked) continue;
      const target = lanePoint(c.node, c.next, 1);
      const dx = target.x - c.x, dz = target.z - c.z;
      const dist = Math.hypot(dx, dz);
      // car ahead on the same lane? slow down.
      let want = c.cruise;
      for (const o of this.cars) {
        if (o === c || o.wrecked) continue;
        const ox = o.x - c.x, oz = o.z - c.z;
        const ahead = ox * Math.sin(c.heading) + oz * Math.cos(c.heading);
        const side = Math.abs(ox * Math.cos(c.heading) - oz * Math.sin(c.heading));
        if (ahead > 0 && ahead < 11 && side < 3) { want = Math.min(want, Math.max(0, o.speed - 1)); break; }
      }
      if (playerCar) {
        const ox = playerCar.x - c.x, oz = playerCar.z - c.z;
        const ahead = ox * Math.sin(c.heading) + oz * Math.cos(c.heading);
        const side = Math.abs(ox * Math.cos(c.heading) - oz * Math.sin(c.heading));
        if (ahead > 0 && ahead < 10 && side < 3.2) want = 0;
      }
      c.speed = damp(c.speed, want, 1.6, dt);
      if (dist < 2.5) {
        c.node = c.next;
        c.next = this.randomNeighbor(c.node);
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      c.heading += angleDelta(c.heading, wantHeading) * Math.min(1, dt * 3.2);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      for (const w of c.mesh.userData.wheels) w.rotation.x += (c.speed * dt) / 0.36;
    }
  }

  /** Cars within radius of a point (for HUD minimap + collisions). */
  near(x, z, r) {
    return this.cars.filter((c) => !c.wrecked && Math.hypot(c.x - x, c.z - z) < r);
  }
}

/** The car the player drives. Arcade physics: speed along heading, steering,
 *  handbrake slide, building + traffic + ped collisions. */
export class PlayerCar {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 40;
    this.health = 100;
    this.active = false;
    this.kind = 'sedan';
  }

  enter(mesh, x, z, heading, kind = 'sedan', maxSpeed = 40) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.maxSpeed = maxSpeed;
    this.kind = kind;
    this.active = true;
  }

  exit() { this.active = false; this.mesh = null; }

  update(dt, input, city, traffic, peds, onCrash) {
    if (!this.active) return;
    const accel = input.forward ? 15 : 0;
    const brake = input.back ? 22 : 0;
    if (input.forward) this.speed += accel * dt;
    if (input.back) {
      if (this.speed > 0.5) this.speed -= brake * dt;
      else this.speed = Math.max(-10, this.speed - 8 * dt);
    }
    // drag + rolling resistance
    this.speed -= this.speed * 0.55 * dt;
    if (!input.forward && !input.back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.speed = clamp(this.speed, -10, this.maxSpeed);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const spd = Math.abs(this.speed);
    const grip = input.handbrake ? 2.6 : 1.9;
    this.heading += steer * grip * clamp(spd / 9, 0, 1) * (this.speed >= 0 ? 1 : -1) * dt * (input.handbrake ? 1.25 : 1);
    if (input.handbrake) this.speed *= (1 - 0.9 * dt);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const p = { x: nx, z: nz };
    const hitWall = collideCircle(city.colliders, p, 2.1);
    if (hitWall) {
      if (spd > 9) {
        this.health -= (spd - 9) * 1.6;
        onCrash && onCrash(p.x, p.z, spd);
      }
      this.speed *= 0.45;
    }
    this.x = clamp(p.x, -245, 345);
    this.z = clamp(p.z, -245, 245);
    // traffic collisions: push apart, damage both
    for (const c of traffic.cars) {
      if (c.wrecked) continue;
      const dx = this.x - c.x, dz = this.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.6 && d > 0.01) {
        const push = (3.6 - d) / 2;
        const ux = dx / d, uz = dz / d;
        this.x += ux * push; this.z += uz * push;
        c.x -= ux * push; c.z -= uz * push;
        const impact = Math.abs(this.speed - c.speed);
        if (impact > 6) {
          this.health -= impact * 0.7;
          c.health -= impact * 1.4;
          onCrash && onCrash(this.x, this.z, impact);
          if (c.health <= 0) {
            c.wrecked = true;
            c.mesh.rotation.z = 0.35;
            c.mesh.position.y = 0.4;
          }
        }
        this.speed *= 0.82;
      }
    }
    // peds: running one over is a crime (handled by caller via return)
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const tilt = steer * clamp(spd / 30, 0, 1) * 0.05;
    this.mesh.rotation.z = damp(this.mesh.rotation.z, tilt, 8, dt);
    for (const w of this.mesh.userData.wheels) w.rotation.x += (this.speed * dt) / 0.36;
    if (this.health <= 0) this.health = 0;
  }
}
