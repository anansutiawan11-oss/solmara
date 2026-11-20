// Mara Voss on foot: a low-poly character with a walk cycle, sprint, jump and
// a punch. Movement is relative to the camera yaw; the camera itself lives in
// main.js so the screenshot stager can drive it.
import * as THREE from 'three';
import { clamp, damp } from './utils.js';
import { makePersonMesh } from './peds.js';
import { collideCircle } from './city.js';

export class Player {
  constructor(scene) {
    // Mara: teal jacket, dark jeans, dark hair, a little taller than a ped.
    this.mesh = makePersonMesh(0x2fae8e, 0x2a2a33, 0xd9a986);
    this.mesh.scale.set(1.05, 1.08, 1.05);
    scene.add(this.mesh);
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.speedNow = 0;
    this.health = 100;
    this.lastHurtAt = -99;
    this.punchAt = -99;
  }

  setPosition(x, z, heading = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  update(dt, input, camYaw, city, now) {
    const speed = input.sprint ? 6.6 : 4.1;
    let mx = 0;
    let mz = 0;
    // camera-relative movement: forward is away from the camera
    if (input.forward) { mx += -Math.sin(camYaw); mz += -Math.cos(camYaw); }
    if (input.back) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.left) { mx += -Math.cos(camYaw); mz += Math.sin(camYaw); }
    if (input.right) { mx += Math.cos(camYaw); mz += -Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    if (this.moving) {
      mx /= len;
      mz /= len;
      const wantHeading = Math.atan2(mx, mz);
      let dh = wantHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += clamp(dh, -10 * dt, 10 * dt);
      const p = { x: this.x + mx * speed * dt, z: this.z + mz * speed * dt };
      collideCircle(city.colliders, p, 0.55);
      this.x = clamp(p.x, -245, 345);
      this.z = clamp(p.z, -245, 245);
      this.speedNow = speed;
      this.walkPhase += speed * dt * 2.6;
    } else {
      this.speedNow = 0;
      // settle the walk cycle back to a neutral pose
      this.walkPhase = damp(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 10, dt);
    }
    // jump: simple gravity, ground at y = 0
    if (input.jump && this.y === 0) this.vy = 6.4;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    // walk cycle + punch animation on the shared person rig
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    const punchT = (now - this.punchAt) / 0.28;
    if (punchT >= 0 && punchT < 1) {
      u.armR.rotation.x = -1.9 * Math.sin(punchT * Math.PI);
    }
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    // slow health regen once out of combat for a while
    if (now - this.lastHurtAt > 6 && this.health < 100) {
      this.health = Math.min(100, this.health + 4 * dt);
    }
  }

  hurt(amount, now) {
    this.health = Math.max(0, this.health - amount);
    this.lastHurtAt = now;
  }

  punch(now) {
    this.punchAt = now;
  }
}
