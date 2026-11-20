// main.js — wires everything into one loop; exposes a read-only
// window.__solmara handle for automated play-testing.
import * as THREE from '../vendor/three.module.min.js';
import { buildCity, resolveCollisions } from './city.js';
import { createPlayer, updatePlayer, updateCamera, playerPunch } from './player.js';
import { makeCar, driveCar, spawnTraffic, updateTraffic, damageCar } from './vehicles.js';
import { spawnPeds, updatePeds, knockDownPed } from './peds.js';
import { createPolice, addWanted, setWanted, updatePolice, clearPolice } from './police.js';
import { createCombat, firePistol, reloadPistol, updateCombat, punchHit } from './combat.js';
import { createMissions, currentMission, currentStep, updateMissions, interactPressed, startMission } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';
import { dist2, clamp } from './utils.js';

export const GAME_VERSION = 'solmara-r3-1.0.0';

export function createGame(opts = {}) {
  const seed = opts.seed ?? 1;
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(-140, 40, -180);

  const city = buildCity(THREE, scene, seed);
  const audio = createAudio();
  const hud = createHud();
  const player = createPlayer(THREE, scene, city.places.safehouse);
  const police = createPolice(THREE, scene);
  const combat = createCombat(THREE, scene, camera);
  const missions = createMissions(city.places);
  const traffic = spawnTraffic(THREE, scene, city, 14, seed);
  const peds = spawnPeds(THREE, scene, city, 22, seed);

  // the player's starter sedan, parked by the safehouse
  const sedan = makeCar(THREE, scene, 'sedan', city.places.safehouse.x + 8, city.places.safehouse.z + 4, Math.PI / 2,
    { id: 'mara-sedan', color: 0x3f6fb5 });
  // the red Comet S at the marina (mission 2 target)
  const comet = makeCar(THREE, scene, 'sport', city.places.marina.x - 6, city.places.marina.z - 8, Math.PI,
    { id: 'comet-s', color: 0xd92020, isMission: true });
  const allCars = [sedan, comet, ...traffic];

  const game = {
    THREE, scene, camera, renderer, city, audio, hud, player, police, combat,
    missions, traffic, peds, cars: allCars, sedan, comet,
    keys: {}, time: 0, paused: true, started: false, over: null,
    shotMode: null, shotReady: false, raceRivals: [], raceSpawned: false,
    mouseDown: false, lastX: 0, lastY: 0,
  };

  // ---------- car enter / exit ----------
  function enterCar(car) {
    if (player.car) exitCar();
    player.car = car; car.isPlayer = true; player.onFoot = false;
    player.group.visible = false;
    player.pos.copy(car.pos); player.heading = car.heading;
    hud.showToast(car.id === 'comet-s' ? 'Comet S — nice ride!' : 'In the car — W to drive');
    audio.pickup();
  }
  function exitCar() {
    const car = player.car; if (!car) return;
    car.isPlayer = false; player.car = null; player.onFoot = true;
    player.group.visible = true;
    const side = player.heading + Math.PI / 2;
    player.pos.set(car.pos.x + Math.sin(side) * 2.5, 0, car.pos.z + Math.cos(side) * 2.5);
    player.heading = car.heading;
  }
  game.enterCar = enterCar; game.exitCar = exitCar;

  // nearest car within range (B1 handled in missions: steal prefers mission car)
  function nearestCar(maxD) {
    let best = null, bestD = maxD;
    for (const c of game.cars) {
      if (c.wrecked) continue;
      const d = dist2(c.pos.x, c.pos.z, player.pos.x, player.pos.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function pressE() {
    if (!game.started || game.over) return;
    // mission talk/steal takes priority when its step is active and in range
    if (missions.state === 'active') {
      const step = currentStep(missions);
      if (step && (step.type === 'talk' || step.type === 'steal')) {
        const d = dist2(player.pos.x, player.pos.z, step.target.x, step.target.z);
        if (d < step.radius + 2) {
          interactPressed(missions, {
            player, cars: game.cars, police,
            enterCar, addWanted: (n) => addWanted(police, n),
            onDialogue: (t, w) => hud.showDialogue(t, w),
            onComplete: (mis) => { audio.missionComplete(); hud.showToast(mis.name + ' complete! +' + '$' + mis.reward); },
            onSave: () => saveGame(game),
          });
          return;
        }
      }
    }
    if (player.car) { exitCar(); return; }
    const car = nearestCar(6);
    if (car) enterCar(car);
  }
  game.pressE = pressE;

  // ---------- input ----------
  const keyMap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'space' };
  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code] !== undefined) { game.keys[keyMap[e.code]] = true; if (e.code === 'Space') e.preventDefault(); }
    if (e.code === 'KeyE' && !e.repeat) pressE();
    if (e.code === 'KeyR' && !e.repeat) reloadPistol(player, audio);
    if (e.code === 'Digit1') { player.weapon = 'fists'; hud.showToast('Fists'); }
    if (e.code === 'Digit2') { player.weapon = 'pistol'; hud.showToast('Pistol'); }
    if (e.code === 'KeyQ' && !e.repeat) audio.cycleStation();
    if (e.code === 'Enter' && !e.repeat) {
      audio.unlock();
      if (!game.started) startGame();
      else if (missions.state === 'briefing') startMission(missions, { onDialogue: (t, w) => hud.showDialogue(t, w) });
      else if (game.over) respawn();
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && game.started) togglePause();
    if (e.code === 'KeyM' && !e.repeat) { audio.muted = !audio.muted; }
  });
  window.addEventListener('keyup', (e) => { if (keyMap[e.code] !== undefined) game.keys[keyMap[e.code]] = false; });
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    game.mouseDown = true; game.lastX = e.clientX; game.lastY = e.clientY;
    if (!game.started) return;
    if (player.weapon === 'pistol' && player.onFoot) {
      const targets = shootTargets();
      firePistol(combat, player, targets, audio);
    } else if (player.onFoot) {
      if (playerPunch(player)) {
        const targets = shootTargets();
        punchHit(player, targets);
        audio.click();
      }
    }
  });
  window.addEventListener('pointerup', () => { game.mouseDown = false; });
  window.addEventListener('pointermove', (e) => {
    if (!game.mouseDown) return;
    player.camYaw -= (e.clientX - game.lastX) * 0.005;
    player.camPitch = clamp(player.camPitch + (e.clientY - game.lastY) * 0.004, -0.1, 1.0);
    game.lastX = e.clientX; game.lastY = e.clientY;
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function shootTargets() {
    const targets = [];
    for (const p of peds) if (!p.down) targets.push({
      pos: p.pos, radius: 1.1,
      onHit: (dmg) => { knockDownPed(p); if (police.wanted < 2) addWanted(police, 1); },
    });
    for (const c of police.cops) targets.push({
      pos: c.pos, radius: 1.1,
      onHit: () => { police.scene.remove(c.group); police.cops.splice(police.cops.indexOf(c), 1); addWanted(police, 1); },
    });
    for (const car of game.cars) if (!car.wrecked) targets.push({
      pos: car.pos, radius: 2.2,
      onHit: (dmg) => { damageCar(car, dmg, audio); },
    });
    return targets;
  }

  // ---------- flow ----------
  function startGame() {
    game.started = true; game.paused = false;
    hud.hideScreens();
    hud.showDialogue(currentMission(missions).briefing, 'Mara');
    hud.showToast('WASD move · E enter car · Enter start mission');
    audio.unlock();
  }
  function togglePause() {
    game.paused = !game.paused;
    hud.showScreen(game.paused ? 'pause' : null);
    if (game.paused) saveGame(game);
  }
  function respawn() {
    game.over = null;
    player.health = 100; player.pos.set(city.places.safehouse.x, 0, city.places.safehouse.z);
    player.heading = 0; player.car = null; player.onFoot = true; player.group.visible = true;
    clearPolice(police);
    hud.hideScreens();
    hud.showToast('Back on your feet. Stay sharp, Mara.');
    saveGame(game);
  }
  game.startGame = startGame; game.respawn = respawn;

  function endGame(kind) {
    game.over = kind;
    if (kind === 'busted') {
      player.cash = Math.max(0, player.cash - 100);
      hud.showScreen('busted');
      hud.showToast('Busted! Lost $100 bail.');
    } else {
      hud.showScreen('wasted');
    }
    clearPolice(police);
    saveGame(game);
  }

  // ---------- save / load ----------
  function applySave(d) {
    player.cash = d.cash; player.rank = d.rank; player.health = d.health;
    player.ammo = d.ammo; player.reserveAmmo = d.reserveAmmo;
    missions.index = Math.min(d.missionIndex, missions.list.length - 1);
    missions.state = 'briefing'; missions.step = 0;
    player.pos.set(d.pos.x, 0, d.pos.z);
    player.heading = d.heading || 0;
    if (d.car) {
      const car = game.cars.find(c => c.id === d.car.id);
      if (car) { car.pos.set(d.car.x, 0, d.car.z); car.heading = d.car.heading; car.health = d.car.health; car.wrecked = false; enterCar(car); }
    }
    return true;
  }
  game.applySave = applySave;

  // ---------- race rivals (mission 4) ----------
  function spawnRaceRivals() {
    const bx = city.places.beach.x, bz = city.places.beach.z;
    game.raceRivals = [];
    for (let i = 0; i < 3; i++) {
      const car = makeCar(THREE, scene, i === 0 ? 'sport' : 'sedan', bx - 12 + i * 12, bz - 10, 0,
        { id: 'rival-' + i });
      car.speed = 0; car.raceSpeed = 20 + i * 1.5;
      game.raceRivals.push(car); game.cars.push(car);
    }
    game.raceSpawned = true;
  }

  // ---------- per-frame update ----------
  function update(dt) {
    game.time += dt;
    const step = currentStep(missions);
    // race: rivals drive toward the finish
    if (missions.state === 'active' && step && step.type === 'race') {
      if (!game.raceSpawned) spawnRaceRivals();
      for (const r of game.raceRivals) {
        const fx = city.places.finish.x, fz = city.places.finish.z;
        const dx = fx - r.pos.x, dz = fz - r.pos.z, d = Math.hypot(dx, dz);
        if (d > 4) {
          r.heading = Math.atan2(dx, dz);
          r.speed = r.raceSpeed;
          r.pos.x += Math.sin(r.heading) * r.speed * dt;
          r.pos.z += Math.cos(r.heading) * r.speed * dt;
          r.group.position.copy(r.pos); r.group.rotation.y = r.heading;
        } else if (!missions.raceDone) {
          // a rival finished first: restart the race step
          hud.showToast('Rival won the race! Try again.');
          missions.step = 0; missions.raceDone = false; game.raceSpawned = false;
          for (const rr of game.raceRivals) { scene.remove(rr.group); game.cars.splice(game.cars.indexOf(rr), 1); }
          game.raceRivals = [];
          player.pos.set(city.places.beach.x, 0, city.places.beach.z);
          if (player.car) { player.car.pos.set(city.places.beach.x + 6, 0, city.places.beach.z - 6); }
        }
      }
    }
    // heat-wave / finale: wanted spikes once when the mission starts
    if (missions.state === 'active') {
      const mis = currentMission(missions);
      if ((mis.id === 'm6' || mis.id === 'm7') && missions.step === 0 && game.heatFor !== mis.id) {
        addWanted(police, 3);
        game.heatFor = mis.id;
      }
    }
    // player / car
    if (player.car) {
      driveCar(player.car, game.keys, dt, city, game.cars, audio);
      player.pos.copy(player.car.pos); player.heading = player.car.heading;
      player.camYaw = player.heading; // chase cam behind the car, looking forward
      if (player.car.wrecked) {
        hud.showToast('Car wrecked!');
        exitCar();
        player.health -= 10;
      }
    } else {
      updatePlayer(player, game.keys, dt, city, audio);
    }
    updateTraffic(traffic, dt, city, player.car, player.onFoot ? player.pos : null);
    const danger = police.wanted > 0 ? player.pos : null;
    updatePeds(peds, dt, danger, police.wanted > 0 ? 26 : 0);
    const result = updatePolice(police, dt, player, city, audio, game.time);
    if (result && !game.over) endGame(result);
    updateCombat(combat, dt);
    // missions
    if (missions.state === 'active') {
      const r = updateMissions(missions, dt, {
        player, cars: game.cars, police,
        onDialogue: (t, w) => hud.showDialogue(t, w),
        onComplete: (mis) => { audio.missionComplete(); hud.showToast(mis.name + ' complete! +$' + mis.reward); },
        onSave: () => saveGame(game),
      });
      if (r === 'mission-complete' && missions.state === 'story-end') {
        hud.showScreen('end');
        game.over = 'story-end';
      }
    }
    // audio: engine + siren follow state
    audio.setEngine(player.car ? Math.abs(player.car.speed) / player.car.spec.maxSpeed : 0, !!player.car);
    audio.setSiren(police.wanted > 0);
    // HUD
    const mis = currentMission(missions);
    const st = currentStep(missions);
    const dist = st ? dist2(player.pos.x, player.pos.z, st.target.x, st.target.z) : 0;
    hud.update(dt, {
      player, police, mission: mis, step: missions.state === 'active' ? st : null,
      dist, speed: player.car ? player.car.speed : 0, station: audio.stationName(),
    });
    hud.drawMinimap(city, player, traffic, police, missions.state === 'active' && st ? st.target : null);
    // contextual prompt
    let prompt = '';
    if (game.started && !game.over) {
      if (missions.state === 'briefing') prompt = 'Press ENTER to start: ' + (mis ? mis.name : '');
      else if (missions.state === 'active' && st && (st.type === 'talk' || st.type === 'steal') &&
        dist < st.radius + 2) prompt = 'Press E — ' + st.text;
      else if (player.car) prompt = 'E — exit car · Q — radio';
      else if (nearestCar(6)) prompt = 'Press E — get in the car';
    }
    hud.setPrompt(prompt);
    updateCamera(THREE, camera, player, dt);
  }
  game.update = update;

  let last = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (game.paused || game.over === 'busted' || game.over === 'wasted') { renderer.render(scene, camera); return; }
    // real delta time (clamped) so the game runs at true speed on any hardware.
    // NOTE: use performance.now(), not the rAF timestamp — in headless/virtual
    // time the rAF timestamp advances in fixed 16ms steps even when a frame
    // really took 200ms+, which would crawl the game to ~0.07x speed.
    const nowMs = performance.now();
    const dt = last ? Math.min(0.1, Math.max(0.001, (nowMs - last) / 1000)) : 0.016;
    last = nowMs;
    update(dt);
    renderer.render(scene, camera);
  }

  // ---------- boot ----------
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (shot) {
    // screenshot mode: no title screen, deterministic staging
    game.shotMode = shot;
    game.started = true; game.paused = false;
    hud.hideScreens();
    const seedParam = Number(params.get('seed') || 1);
    stageShot(game, shot, seedParam, { enterCar, addWanted: (n) => addWanted(police, n), startMission });
    // simulate real gameplay forward with fixed steps, then render once
    for (let i = 0; i < 150; i++) update(1 / 60);
    renderer.render(scene, camera);
    game.shotReady = true;
    requestAnimationFrame(frame);
  } else {
    hud.showScreen('title');
    const saved = loadGame();
    if (saved && hasSave()) {
      const btn = document.getElementById('continue-btn');
      if (btn) {
        btn.style.display = 'inline-block';
        btn.addEventListener('click', () => { applySave(saved); startGame(); });
      }
    }
    document.getElementById('start-btn').addEventListener('click', () => startGame());
    document.getElementById('resume-btn')?.addEventListener('click', () => { game.paused = false; hud.hideScreens(); });
    document.getElementById('restart-btn')?.addEventListener('click', () => { respawn(); });
    document.getElementById('retry-btn')?.addEventListener('click', () => { respawn(); });
    requestAnimationFrame(frame);
  }

  // read-only handle for automated play-testing
  window.__solmara = {
    version: GAME_VERSION, game,
    get state() {
      return {
        cash: player.cash, rank: player.rank, health: Math.round(player.health),
        wanted: police.wanted, missionIndex: missions.index, missionState: missions.state,
        missionStep: missions.step, missionName: currentMission(missions)?.name ?? null,
        pos: { x: +player.pos.x.toFixed(1), y: +player.pos.y.toFixed(1), z: +player.pos.z.toFixed(1) },
        onFoot: player.onFoot, inCar: player.car?.id ?? null,
        carHealth: player.car ? Math.round(player.car.health) : null,
        speed: player.car ? +player.car.speed.toFixed(1) : 0,
        ammo: player.ammo, weapon: player.weapon, started: game.started,
        paused: game.paused, over: game.over, shotReady: game.shotReady,
      };
    },
    start: () => startGame(),
    pressE: () => pressE(),
    teleport: (x, z) => { if (player.car) exitCar(); player.pos.set(x, 0, z); },
    teleportCar: (x, z) => { if (player.car) { player.car.pos.set(x, 0, z); player.pos.copy(player.car.pos); } },
    startMission: (i) => {
      if (i !== undefined) { missions.index = i; missions.step = 0; }
      startMission(missions, { onDialogue: (t, w) => hud.showDialogue(t, w) });
    },
    setWanted: (n) => setWanted(police, n),
    addWanted: (n) => addWanted(police, n),
    setCash: (n) => { player.cash = n; },
    save: () => saveGame(game),
    load: () => { const d = loadGame(); if (d) applySave(d); return !!d; },
    keys: game.keys,
  };
  return game;
}

// boot when this module loads as the page script
createGame();
