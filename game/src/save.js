// save.js — localStorage saves: autosave per mission, safehouse, pause menu.
export const SAVE_KEY = 'solmara-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

// Snapshot the parts of game state worth restoring.
export function snapshot(game) {
  return {
    version: 1,
    savedAt: Date.now(),
    cash: game.cash,
    rank: game.rank,
    missionsDone: game.missionsDone.slice(),
    currentMission: game.currentMission,
    player: {
      x: game.player.state.pos.x,
      y: game.player.state.pos.y,
      z: game.player.state.pos.z,
      heading: game.player.state.heading,
      health: game.player.state.health,
    },
    wanted: game.police.state.wanted,
    ammo: game.combat.state.ammo,
    inVehicle: game.vehicles.playerCar ? game.vehicles.playerCar.id : null,
  };
}

export function applySave(game, data) {
  if (!data) return false;
  game.cash = data.cash ?? 150;
  game.rank = data.rank ?? 'Street Rat';
  game.missionsDone = Array.isArray(data.missionsDone) ? data.missionsDone : [];
  game.currentMission = typeof data.currentMission === 'number' ? data.currentMission : 0;
  if (data.player) {
    game.player.state.pos.set(data.player.x ?? -210, data.player.y ?? 0, data.player.z ?? -204);
    game.player.state.heading = data.player.heading ?? 0;
    game.player.state.health = data.player.health ?? 100;
  }
  if (data.ammo !== undefined) game.combat.state.ammo = data.ammo;
  return true;
}
