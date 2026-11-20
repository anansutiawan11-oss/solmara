// Pedestrians: low-poly people strolling the sidewalks, fleeing from danger,
// knock-downable (a crime). Built from boxes and spheres — no assets.
import * as THREE from 'three';
import { mulberry32, pick, range, clamp } from './utils.js';
import { ROADS, collideCircle } from './city.js';

const SHIRTS = [0xe85d5d, 0x5da8e8, 0x7ad87a, 0xe8c85a, 0xd88ad8, 0xffffff, 0x3a3a42, 0xff9a5d];
const PANTS = [0x2a2a33, 0x3a4a6a, 0x6a5a3a, 0x4a3a4a];

export function makePersonMesh(shirt, pants, skin = 0xd9a986) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.18;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
  head.position.y = 1.72;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a1c12 }),
  );
  hair.position.set(0, 1.78, -0.04);
  hair.scale.set(1, 0.75, 1);
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), pantsMat);
  legL.position.set(-0.16, 0.39, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.18), shirtMat);
  armL.position.set(-0.4, 1.2, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Pedestrians {
  constructor(scene, city, seed = 23) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.list = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const mesh = makePersonMesh(pick(this.rng, SHIRTS), pick(this.rng, PANTS));
      this.scene.add(mesh);
      const road = pick(this.rng, ROADS);
      const along = range(this.rng, -220, 220);
      const vertical = this.rng() < 0.5;
      const p = {
        mesh,
        x: vertical ? road + 8.5 : along,
        z: vertical ? along : road + 8.5,
        heading: this.rng() * Math.PI * 2,
        speed: range(this.rng, 0.9, 1.6),
        walkPhase: this.rng() * 6,
        down: 0,
        flee: 0,
        fleeX: 0,
        fleeZ: 0,
        tx: 0,
        tz: 0,
      };
      this.retarget(p);
      this.list.push(p);
    }
  }

  /** Pick a fresh sidewalk waypoint near the ped's current block. */
  retarget(p) {
    const road = pick(this.rng, ROADS);
    const along = range(this.rng, -220, 220);
    if (this.rng() < 0.5) {
      p.tx = road + 8.5;
      p.tz = along;
    } else {
      p.tx = along;
      p.tz = road + 8.5;
    }
  }

  scare(x, z, radius) {
    for (const p of this.list) {
      if (p.down > 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.flee = 2.2;
        const a = Math.atan2(p.x - x, p.z - z);
        p.fleeX = Math.sin(a);
        p.fleeZ = Math.cos(a);
      }
    }
  }

  update(dt) {
    for (const p of this.list) {
      if (p.down > 0) {
        p.down -= dt;
        if (p.down <= 0) {
          // gets back up, shaken, and runs off
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          p.flee = 2;
          p.fleeX = Math.sin(p.heading + 2.4);
          p.fleeZ = Math.cos(p.heading + 2.4);
        }
        continue;
      }
      let dirX;
      let dirZ;
      let speed = p.speed;
      if (p.flee > 0) {
        p.flee -= dt;
        dirX = p.fleeX;
        dirZ = p.fleeZ;
        speed = 4.6;
      } else {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          this.retarget(p);
          continue;
        }
        dirX = dx / d;
        dirZ = dz / d;
      }
      const wantHeading = Math.atan2(dirX, dirZ);
      let dh = wantHeading - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      p.x = clamp(p.x, -238, 330);
      p.z = clamp(p.z, -238, 238);
      const pos = { x: p.x, z: p.z };
      collideCircle(this.city.colliders, pos, 0.5);
      p.x = pos.x;
      p.z = pos.z;
      p.walkPhase += speed * dt * 3.4;
      const swing = Math.sin(p.walkPhase) * 0.55;
      const u = p.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  /** Knock a ped down (car hit or punch). Returns the ped or null. */
  knockDown(x, z, radius) {
    let best = null;
    let bd = Infinity;
    for (const p of this.list) {
      if (p.down > 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) {
      best.down = 6;
      best.mesh.rotation.x = -Math.PI / 2 + 0.15;
      best.mesh.position.y = 0.35;
    }
    return best;
  }

  near(x, z, r) {
    return this.list.filter((p) => p.down <= 0 && Math.hypot(p.x - x, p.z - z) < r);
  }
}
