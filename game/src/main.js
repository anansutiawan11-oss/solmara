// main.js — wires every module into one loop; exposes a read-only
// window.__solmara handle for automated play-testing.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave, clearSave, snapshot, applySave } from './save.js';
import { parseShot, seedRandomForShot, applyShot } from './shots.js';
import { clamp, mulberry32, RNG } from './utils.js';

const SPAWN = { x: -210, z: -196, heading: Math.PI * 0.75 };
const shot = parseShot();
if (shot) seedRandomForShot(shot.seed);

// --- Renderer / scene / camera.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffb36b);
scene.fog = new THREE.Fog(0xf2a35e, 260, 900);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

// Golden-hour light: low sun over the ocean (east), warm sky fill.
const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a3a2a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb347, 2.4);
sun.position.set(420, 95, -60);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 1200;
scene.add(sun);
scene.add(sun.target);

// --- World.
const seed = shot ? shot.seed : 1337;
const city = buildCity(THREE, seed);
scene.add(city.group);

const game = {
  cash: 150,
  rank: 'Street Rat',
  missionsDone: [],
  currentMission: 0,
  nextMissionReady: false,
  now: 0,
  state: 'title', // title | playing | paused | busted | wasted | storyend
  frozen: false,
  shotMode: !!shot,
  camYaw: SPAWN.heading + Math.PI,
  camPitch: 0.3,
  camDist: 9,
  camFocus: new THREE.Vector3(SPAWN.x, 2, SPAWN.z),
  lastShot: null,
  lastCrashSfx: -99,
  radioStarted: false,
};
game.city = city;

const player = createPlayer(THREE, {
  colliders: city.colliders,
  onPunch: (ps) => {
    const res = combat.punch(ps, punchTargets(), {
      onPunchHit: (t) => {
        audio.sfx('punch');
        if (t.kind === 'ped') {
          peds.knockDown(t.ref, {});
          police.addWanted(0, { now: game.now, playerPos: player.state.pos, playerInVehicle: false });
        } else if (t.kind === 'cop') {
          t.ref.health -= 30;
          police.addWanted(1, { now: game.now, playerPos: player.state.pos, playerInVehicle: false });
          if (t.ref.health <= 0) removeCop(t.ref);
        }
      },
    });
    return res;
  },
});
game.player = player;
scene.add(player.state.group);

const vehicles = createVehicles(THREE, city, new RNG(seed + 7));
game.vehicles = vehicles;
scene.add(vehicles.group);

const peds = createPeds(THREE, city, new RNG(seed + 11));
game.peds = peds;
scene.add(peds.group);

const police = createPolice(THREE, city, vehicles, new RNG(seed + 13));
game.police = police;
scene.add(police.group);

const combat = createCombat(THREE, scene, camera);
game.combat = combat;

const hud = createHud(document);
game.hud = hud;

const audio = createAudio();
game.audio = audio;

const missions = createMissions(game);
game.missions = missions;

game.autosave = () => writeSave(snapshot(game));

function punchTargets() {
  const out = [];
  for (const ped of peds.peds) if (ped.state !== 'down') out.push({ kind: 'ped', ref: ped, pos: ped.pos });
  for (const cop of police.state.cops) out.push({ kind: 'cop', ref: cop, pos: cop.pos });
  return out;
}

function shootables() {
  const out = [];
  for (const ped of peds.peds) if (ped.state !== 'down') out.push({ root: ped.g, kind: 'ped', ref: ped });
  for (const cop of police.state.cops) out.push({ root: cop.g, kind: 'cop', ref: cop });
  for (const car of vehicles.cars) out.push({ root: car.mesh, kind: 'car', ref: car });
  return out;
}

function removeCop(cop) {
  const i = police.state.cops.indexOf(cop);
  if (i >= 0) police.state.cops.splice(i, 1);
  police.group.remove(cop.g);
}

// --- Camera.
function updateCamera(dt) {
  const focus = vehicles.playerCar
    ? vehicles.playerCar.pos
    : player.state.pos;
  game.camFocus.lerp(new THREE.Vector3(focus.x, focus.y + 1.6, focus.z), Math.min(1, dt * 8));
  const cp = Math.cos(game.camPitch), sp = Math.sin(game.camPitch);
  const tx = game.camFocus.x + Math.sin(game.camYaw) * cp * game.camDist;
  const ty = game.camFocus.y + sp * game.camDist;
  const tz = game.camFocus.z + Math.cos(game.camYaw) * cp * game.camDist;
  camera.position.lerp(new THREE.Vector3(tx, Math.max(1.2, ty), tz), Math.min(1, dt * 10));
  camera.lookAt(game.camFocus);
}
game.updateCamera = updateCamera;

// --- One simulation tick (live loop and shot staging share this).
function step(dt, input) {
  game.now += dt;
  if (game.state === 'title' || game.state === 'paused') return;
  if (game.state === 'busted' || game.state === 'wasted' || game.state === 'storyend') return;

  // Player on foot (hidden while driving).
  player.state.group.visible = !vehicles.playerCar;
  if (!vehicles.playerCar) {
    player.update(dt, input, game.camYaw, game.now);
  }

  // Vehicles (player driving + traffic).
  vehicles.update(dt, input, {
    now: game.now,
    playerPos: player.state.pos,
    playerInVehicle: !!vehicles.playerCar,
    onCrash: (impact) => {
      if (game.now - game.lastCrashSfx > 0.6) {
        game.lastCrashSfx = game.now;
        audio.sfx('crash');
      }
    },
    onWreck: (car) => {
      if (car.isPlayer) hud.toast('Your car is wrecked! Find another ride.');
    },
  });

  // Peds.
  const danger = game.lastShot && game.now - game.lastShot.at < 1.5
    ? { x: game.lastShot.x, z: game.lastShot.z }
    : (vehicles.playerCar && Math.abs(vehicles.playerCar.speed) > 15
      ? { x: vehicles.playerCar.pos.x, z: vehicles.playerCar.pos.z } : null);
  peds.update(dt, {
    colliders: city.colliders,
    cars: vehicles.cars,
    danger,
    onCarHitPed: (ped, car) => {
      if (car.isPlayer) {
        police.addWanted(1, { now: game.now, playerPos: player.state.pos, playerInVehicle: true });
        hud.toast('Hit and run! The cops noticed.');
      }
    },
  });

  // Police.
  police.update(dt, {
    now: game.now,
    playerPos: player.state.pos,
    playerInVehicle: !!vehicles.playerCar,
    playerState: player.state,
    onRam: (car) => {
      if (vehicles.playerCar && game.now - (game.lastRamAt || -99) > 1.0) {
        game.lastRamAt = game.now;
        vehicles.damageCar(vehicles.playerCar, 2);
        if (game.now - game.lastCrashSfx > 0.8) {
          game.lastCrashSfx = game.now;
          audio.sfx('crash');
        }
      }
    },
    onCopShot: (cop, d) => {
      player.damage(5, game.now);
      audio.sfx('shot');
    },
    onBusted: () => {
      game.cash = Math.max(0, game.cash - 100);
      game.state = 'busted';
      audio.sfx('busted');
      hud.showBusted();
    },
  });

  // Combat timers (reload, muzzle flash).
  combat.update(dt);

  // Missions.
  missions.update(dt, {});

  // Wasted?
  if (player.state.health <= 0 && game.state === 'playing') {
    game.cash = Math.max(0, game.cash - 150);
    game.state = 'wasted';
    audio.sfx('busted');
    hud.showWasted();
  }

  // Audio follows the world.
  const car = vehicles.playerCar;
  audio.setEngine(car ? Math.abs(car.speed) / car.spec.topSpeed : 0, !!car);
  audio.setSiren(police.state.wanted > 0);

  updateCamera(dt);
  hud.update(game);
}
game.step = step; // shots.js stages scenes by stepping the live simulation

// --- Input.
const keys = new Set();
const pressed = new Set(); // edge-triggered keys, consumed each frame
let mouseDown = false;
let lastMouse = { x: 0, y: 0 };

function liveInput() {
  return {
    keys,
    jumpPressed: pressed.has('Space') && !vehicles.playerCar,
    punchPressed: pressed.has('KeyF'),
  };
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  pressed.add(e.code);
  audio.resume();
  if (!game.radioStarted) {
    game.radioStarted = true;
    audio.startRadio();
    hud.setRadio(audio.stationName);
  }
  handleKeyAction(e.code);
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

renderer.domElement.addEventListener('mousedown', (e) => {
  mouseDown = true;
  lastMouse = { x: e.clientX, y: e.clientY };
  audio.resume();
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  game.camYaw -= (e.clientX - lastMouse.x) * 0.005;
  game.camPitch = clamp(game.camPitch + (e.clientY - lastMouse.y) * 0.004, 0.05, 1.1);
  lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('wheel', (e) => {
  game.camDist = clamp(game.camDist + Math.sign(e.deltaY) * 1.5, 6, 24);
}, { passive: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function firePistol() {
  if (game.state !== 'playing' || vehicles.playerCar || missions.state.dialogue) return;
  combat.fire(player.state, shootables(), {
    onShot: (from) => {
      audio.sfx('shot');
      game.lastShot = { x: from.x, z: from.z, at: game.now };
    },
    onShootPed: (ped) => {
      ped.health -= 50;
      if (ped.health <= 0) peds.knockDown(ped, {});
      else peds.flee(ped, player.state.pos.x, player.state.pos.z);
      police.addWanted(1, { now: game.now, playerPos: player.state.pos, playerInVehicle: false });
    },
    onShootCop: (cop) => {
      cop.health -= 50;
      police.addWanted(2, { now: game.now, playerPos: player.state.pos, playerInVehicle: false });
      if (cop.health <= 0) removeCop(cop);
    },
    onShootCar: (car) => {
      vehicles.damageCar(car, 25);
      if (car.isPolice) police.addWanted(1, { now: game.now, playerPos: player.state.pos, playerInVehicle: !!vehicles.playerCar });
    },
  });
}

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) firePistol();
});

function enterOrExitCar() {
  if (game.state !== 'playing' || missions.state.dialogue) return;
  if (vehicles.playerCar) {
    vehicles.exitCar(player.state);
    game.camDist = 9;
    return;
  }
  // B1: a steal step's mission car wins over the nearest ambient car.
  let preferId = null;
  const st = missions.step();
  if (missions.state.active && st && st.type === 'enter') preferId = st.carId;
  const car = vehicles.nearestCar(player.state.pos, 4.5, preferId);
  if (car) {
    vehicles.enterCar(car, player.state);
    game.camDist = 13;
    audio.sfx('click');
    if (preferId && car.id === preferId) hud.toast('You stole the Comet S! Lose the cops!');
  }
}

function newGame() {
  clearSave();
  game.cash = 150;
  game.rank = 'Street Rat';
  game.missionsDone = [];
  game.currentMission = 0;
  game.nextMissionReady = false;
  player.state.pos.set(SPAWN.x, 0, SPAWN.z);
  player.state.heading = SPAWN.heading;
  player.state.health = 100;
  police.clearWanted();
  missions.state.done = [];
  missions.state.finishedAll = false;
  hud.hideTitle();
  hud.hideBusted();
  hud.hideWasted();
  game.state = 'playing';
  missions.startMission(0);
}

function continueGame() {
  const data = loadSave();
  if (!data) { newGame(); return; }
  applySave(game, data);
  missions.state.done = game.missionsDone.slice();
  missions.state.current = game.currentMission;
  missions.state.finishedAll = false;
  game.nextMissionReady = true;
  if (data.wanted > 0) {
    police.addWanted(data.wanted, { now: game.now, playerPos: player.state.pos, playerInVehicle: false });
  }
  hud.hideTitle();
  hud.hideBusted();
  hud.hideWasted();
  game.state = 'playing';
  hud.toast(`Welcome back, Mara. ${fmtContinueHint()}`);
}

function fmtContinueHint() {
  return game.missionsDone.length > 0
    ? `${game.missionsDone.length} mission${game.missionsDone.length > 1 ? 's' : ''} done — press Enter for the next one.`
    : 'Press Enter for the next mission.';
}

function respawn() {
  const atHospital = game.state === 'wasted';
  const place = atHospital ? city.places.hospital : city.places.safehouse;
  if (vehicles.playerCar) vehicles.exitCar(player.state);
  player.state.pos.set(place.x, 0, place.z + 14);
  player.state.heading = SPAWN.heading;
  player.state.health = 100;
  police.clearWanted();
  hud.hideBusted();
  hud.hideWasted();
  game.state = 'playing';
  game.autosave();
}

function handleKeyAction(code) {
  if (code === 'Enter') {
    if (game.state === 'title') {
      if (loadSave()) continueGame();
      else newGame();
      return;
    }
    if (game.state === 'busted' || game.state === 'wasted') { respawn(); return; }
    if (game.state === 'storyend') { hud.hideStoryEnd(); game.state = 'playing'; return; }
    if (missions.state.dialogue) { missions.advanceDialogue(); return; }
    if (game.nextMissionReady && game.state === 'playing') {
      game.nextMissionReady = false;
      hud.hidePrompt();
      missions.startMission(missions.state.current);
      return;
    }
    return;
  }
  if (code === 'KeyN' && game.state === 'title') { newGame(); return; }
  if (code === 'KeyE') { enterOrExitCar(); return; }
  if (code === 'KeyF') { /* punch is consumed in player.update */ return; }
  if (code === 'KeyK') { firePistol(); return; }
  if (code === 'KeyR') {
    combat.reload();
    audio.sfx('reload');
    return;
  }
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
    const name = audio.nextStation();
    hud.setRadio(name);
    hud.toast(name);
    return;
  }
  if (code === 'KeyM') {
    audio.setMuted(!audio.isMuted);
    hud.toast(audio.isMuted ? 'Sound off' : 'Sound on');
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (game.state === 'playing' && !missions.state.dialogue) {
      game.state = 'paused';
      hud.showPause();
      game.autosave();
    } else if (game.state === 'paused') {
      game.state = 'playing';
      hud.hidePause();
    }
    return;
  }
  if (code === 'ArrowLeft') game.camYaw += 0.12;
  if (code === 'ArrowRight') game.camYaw -= 0.12;
  if (code === 'ArrowUp') game.camPitch = clamp(game.camPitch + 0.05, 0.05, 1.1);
  if (code === 'ArrowDown') game.camPitch = clamp(game.camPitch - 0.05, 0.05, 1.1);
}

// Story-end overlay sets state when the last mission completes.
const origShowStoryEnd = hud.showStoryEnd;
hud.showStoryEnd = (cash) => {
  origShowStoryEnd(cash);
  game.state = 'storyend';
};

// --- Read-only handle for automated play-testing.
const api = {
  get cash() { return game.cash; },
  get rank() { return game.rank; },
  get wanted() { return police.state.wanted; },
  get health() { return player.state.health; },
  get ammo() { return combat.state.ammo; },
  get state() { return game.state; },
  get missionsDone() { return game.missionsDone.slice(); },
  get dialogueOpen() { return !!missions.state.dialogue; },
  get objective() {
    const o = missions.getObjective();
    return { text: o.text, target: o.target, distance: o.distance };
  },
  get mission() {
    const m = missions.mission();
    return m ? { id: m.id, name: m.name, step: missions.state.step, steps: m.steps.length } : null;
  },
  get player() {
    const p = player.state;
    return { x: p.pos.x, y: p.pos.y, z: p.pos.z, heading: p.heading, grounded: p.grounded, inVehicle: !!p.inVehicle };
  },
  get vehicle() {
    const c = vehicles.playerCar;
    return c ? { id: c.id, type: c.type, speed: c.speed, heading: c.heading, health: c.health, x: c.pos.x, z: c.pos.z } : null;
  },
  get cars() {
    return vehicles.cars.map((c) => ({ id: c.id, type: c.type, x: c.pos.x, z: c.pos.z, wrecked: c.wrecked }));
  },
  version: 'solmara-r2-1.0',
};
Object.freeze(api);
window.__solmara = api;

// --- Boot.
const existingSave = loadSave();
if (!shot) {
  hud.showTitle();
  const hint = document.getElementById('title-hint');
  if (hint) {
    hint.textContent = existingSave
      ? 'SAVE FOUND — press Enter to continue, N for a new game'
      : 'Press Enter to start';
  }
} else {
  applyShot(game, shot.kind);
}

// --- Main loop.
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!game.frozen) {
    const input = liveInput();
    if (game.state === 'title') {
      // Slow cinematic orbit behind the title screen.
      game.camYaw += dt * 0.02;
      updateCamera(dt);
      hud.update(game);
    } else {
      step(dt, input);
    }
    pressed.clear();
  }
  renderer.render(scene, camera);
}
loop();

export { game };
