// Combat: fists and a pistol. Raycast shooting from the camera centre against
// cops, peds and cars, with a muzzle flash, ammo and reload.
import * as THREE from 'three';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = 12;
    this.reserve = Infinity;
    this.reloading = 0;
    this.lastShotAt = -99;
    this.lastPunchAt = -99;
    this.raycaster = new THREE.Raycaster();
    this.flash = new THREE.PointLight(0xffc46b, 0, 14, 2);
    this.scene.add(this.flash);
    this.flashAt = -99;
  }

  setWeapon(w) {
    this.weapon = w;
    if (w === 'pistol' && this.ammo === 0) this.reload();
  }

  reload(now = 0) {
    if (this.weapon !== 'pistol' || this.ammo === 12 || this.reloading > 0) return false;
    this.reloading = 1.4;
    return true;
  }

  update(dt, now) {
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = 12;
        this.reloading = 0;
      }
    }
    this.flash.intensity = now - this.flashAt < 0.06 ? 60 : 0;
  }

  /** Fire the pistol. targets: [{mesh, x, z, kind, ref}]. Hit info or null. */
  shoot(now, targets, origin, direction) {
    if (this.weapon !== 'pistol' || this.reloading > 0 || now - this.lastShotAt < 0.22) return null;
    if (this.ammo <= 0) {
      this.reload(now);
      return { empty: true };
    }
    this.ammo -= 1;
    this.lastShotAt = now;
    this.flashAt = now;
    this.flash.position.copy(origin).addScaledVector(direction, 1.2);
    this.raycaster.set(origin, direction);
    this.raycaster.far = 70;
    const hits = this.raycaster.intersectObjects(targets.map((t) => t.mesh), true);
    if (hits.length === 0) return { miss: true };
    // walk up from the hit child mesh to the target's root group
    let obj = hits[0].object;
    while (obj.parent && !targets.some((t) => t.mesh === obj)) obj = obj.parent;
    const target = targets.find((t) => t.mesh === obj);
    if (!target) return { miss: true };
    return { hit: target, point: hits[0].point };
  }

  /** Punch: the nearest target in front, within arm's reach. */
  punch(now, targets, origin, forward) {
    if (now - this.lastPunchAt < 0.45) return null;
    this.lastPunchAt = now;
    let best = null;
    let bd = Infinity;
    for (const t of targets) {
      const dx = t.x - origin.x;
      const dz = t.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4) continue;
      const dot = (dx * forward.x + dz * forward.z) / (d || 1);
      if (dot < 0.35) continue;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best ? { hit: best } : { miss: true };
  }
}
