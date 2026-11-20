// combat.js — fists + pistol (raycast, muzzle flash, ammo/reload).
import * as THREE from 'three';

export function createCombat(THREE, scene, camera) {
  const raycaster = new THREE.Raycaster();
  const state = {
    ammo: 12, magSize: 12,
    reloading: false, reloadTimer: 0,
    flashTimer: 0,
    hasPistol: true,
  };
  // Muzzle flash: a small bright sprite at the gun + a point light.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffd27a, 0, 14, 1.5);
  scene.add(flashLight);

  function muzzleWorldPos(playerState) {
    const p = playerState.pos;
    const fx = Math.sin(playerState.heading), fz = Math.cos(playerState.heading);
    return new THREE.Vector3(p.x + fx * 0.7, p.y + 1.35, p.z + fz * 0.7);
  }

  // Fire the pistol from the camera centre toward the crosshair.
  // `shootables` is a live list of {root, kind, ref} — peds, foot cops and
  // cars — built by main.js each shot so dynamically spawned targets count.
  function fire(playerState, shootables, ctx) {
    if (state.reloading) return { ok: false, reason: 'reloading' };
    if (state.ammo <= 0) { reload(); return { ok: false, reason: 'empty' }; }
    state.ammo -= 1;
    state.flashTimer = 0.07;
    const from = muzzleWorldPos(playerState);
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = 90;
    const roots = shootables.map((s) => s.root);
    const hits = raycaster.intersectObjects(roots, true);
    let hit = null;
    if (hits.length > 0) {
      const h = hits[0];
      // Walk up to the shootable root that owns the hit mesh.
      let o = h.object;
      let info = null;
      while (o) {
        info = shootables.find((s) => s.root === o);
        if (info) break;
        o = o.parent;
      }
      hit = { point: h.point, tag: info ? info.kind : null, object: info ? info.root : null, distance: h.distance };
      if (info) {
        if (info.kind === 'ped' && ctx.onShootPed) ctx.onShootPed(info.ref, h.point);
        else if (info.kind === 'cop' && ctx.onShootCop) ctx.onShootCop(info.ref, h.point);
        else if (info.kind === 'car' && ctx.onShootCar) ctx.onShootCar(info.ref, h.point);
      }
    }
    // Place the flash at the muzzle, facing the camera.
    flash.position.copy(from);
    flash.lookAt(camera.position);
    flash.visible = true;
    flashLight.position.copy(from);
    flashLight.intensity = 60;
    if (ctx.onShot) ctx.onShot(from, hit);
    return { ok: true, hit };
  }

  function reload() {
    if (state.reloading || state.ammo === state.magSize) return;
    state.reloading = true;
    state.reloadTimer = 1.0;
  }

  // Melee: punch hits anything damageable within 1.8m in front of the player.
  function punch(playerState, targets, ctx) {
    const fx = Math.sin(playerState.heading), fz = Math.cos(playerState.heading);
    let best = null, bd = 1.9;
    for (const t of targets) {
      const dx = t.pos.x - playerState.pos.x, dz = t.pos.z - playerState.pos.z;
      const d = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (d < bd && facing > 0.3) { bd = d; best = t; }
    }
    if (best) {
      if (ctx.onPunchHit) ctx.onPunchHit(best);
      return { ok: true, target: best };
    }
    return { ok: false };
  }

  function update(dt) {
    if (state.reloading) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        state.reloading = false;
        state.ammo = state.magSize;
      }
    }
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      flashMat.opacity = Math.max(0, state.flashTimer / 0.07);
      flashLight.intensity = 60 * Math.max(0, state.flashTimer / 0.07);
      if (state.flashTimer <= 0) { flash.visible = false; flashLight.intensity = 0; }
    }
  }

  return { state, fire, reload, punch, update };
}
