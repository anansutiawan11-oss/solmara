// combat.js — fists + pistol (raycast, muzzle flash, ammo/reload).
import { clamp } from './utils.js';

export function createCombat(THREE, scene, camera) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe94a }));
  flash.visible = false;
  scene.add(flash);
  return { THREE, scene, camera, flash, flashTimer: 0, raycaster: new THREE.Raycaster() };
}

// Fire the pistol from the player toward the camera aim point.
// targets: array of {pos, radius, onHit(dmg)} — peds, cops, cars.
// Returns 'hit' | 'miss' | 'empty' | 'no-ammo'.
export function firePistol(combat, player, targets, audio) {
  if (player.ammo <= 0) { if (audio) audio.click(); return 'no-ammo'; }
  player.ammo -= 1;
  const { camera, raycaster } = combat;
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 80;
  // muzzle flash at the player's hand, in front of the camera
  const dir = new combat.THREE.Vector3();
  camera.getWorldDirection(dir);
  combat.flash.position.copy(player.pos).add(new combat.THREE.Vector3(0, 1.4, 0)).add(dir.clone().multiplyScalar(1.2));
  combat.flash.visible = true; combat.flashTimer = 0.06;
  if (audio) audio.gunshot();
  // test targets against the ray (sphere test in world space)
  let best = null, bestT = Infinity;
  const origin = raycaster.ray.origin, d = raycaster.ray.direction;
  for (const t of targets) {
    const ox = t.pos.x - origin.x, oy = (t.pos.y + 1) - origin.y, oz = t.pos.z - origin.z;
    const proj = ox * d.x + oy * d.y + oz * d.z;
    if (proj < 0 || proj > 80) continue;
    const cx = origin.x + d.x * proj, cy = origin.y + d.y * proj, cz = origin.z + d.z * proj;
    const dist = Math.hypot(t.pos.x - cx, (t.pos.y + 1) - cy, t.pos.z - cz);
    if (dist < (t.radius ?? 1.2) && proj < bestT) { best = t; bestT = proj; }
  }
  if (best) { best.onHit(34); return 'hit'; }
  return 'miss';
}

export function reloadPistol(player, audio) {
  if (player.weapon !== 'pistol') return false;
  const need = 12 - player.ammo;
  if (need <= 0 || player.reserveAmmo <= 0) return false;
  const take = Math.min(need, player.reserveAmmo);
  player.ammo += take; player.reserveAmmo -= take;
  if (audio) audio.reload();
  return true;
}

export function updateCombat(combat, dt) {
  if (combat.flashTimer > 0) {
    combat.flashTimer -= dt;
    if (combat.flashTimer <= 0) combat.flash.visible = false;
  }
}

// Punch: short-range hit on the nearest ped/cop in front of the player.
export function punchHit(player, targets) {
  let best = null, bestD = 2.2;
  for (const t of targets) {
    const d = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
    if (d < bestD) { best = t; bestD = d; }
  }
  if (best) { best.onHit(20); return true; }
  return false;
}
