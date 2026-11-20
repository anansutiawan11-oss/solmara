// save.js — localStorage saves (autosave per mission, safehouse, pause).
const KEY = 'solmara-save-v1';

export function saveGame(state) {
  try {
    const data = {
      v: 1, savedAt: Date.now(),
      cash: state.player.cash, rank: state.player.rank,
      health: state.player.health, ammo: state.player.ammo, reserveAmmo: state.player.reserveAmmo,
      missionIndex: state.missions.index, missionsDone: state.missions.index,
      pos: { x: state.player.pos.x, y: state.player.pos.y, z: state.player.pos.z },
      heading: state.player.heading, wanted: state.police.wanted,
      car: state.player.car ? { id: state.player.car.id, type: state.player.car.type,
        x: state.player.car.pos.x, z: state.player.car.pos.z,
        heading: state.player.car.heading, health: state.player.car.health } : null,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}
