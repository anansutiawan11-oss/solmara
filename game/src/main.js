// SOLMARA — main game. Wires the city, player, traffic, police, missions, HUD
// and audio into one playable loop, plus the deterministic ?shot= scenes the
// screenshots are taken from.
import * as THREE from 'three';
import { buildCity, PLACES, collideCircle } from './city.js';
import { Player } from './player.js';
import { Traffic, PlayerCar, makeCarMesh } from './vehicles.js';
import { Pedestrians, makePersonMesh } from './peds.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionManager, MISSIONS, rankFor } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { clamp, damp, mulberry32, angleDelta, money } from './utils.js';
import { stageShot } from './shots.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

    this.city = buildCity(this.scene);
    this.player = new Player(this.scene);
    this.traffic = new Traffic(this.scene, this.city);
    this.peds = new Pedestrians(this.scene, this.city);
    this.police = new Police(this.scene, this.city);
    this.combat = new Combat(this.scene, this.camera);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.missions = new MissionManager(this);
    this.playerCar = new PlayerCar(this.scene);

    this.state = 'title'; // title | play | pause | busted | wasted | end
    this.now = 0;
    this.clockSeconds = 18 * 3600 + 42 * 60;
    this.cash = 150;
    this.inCar = false;
    this.playerCarKind = null;
    this.playerPos = { x: 0, z: 0 };
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.camDistWant = 8;
    this.racers = [];
    this.parked = [];
    this.missionCar = null;
    this.shotMode = false;
    this.scriptedInput = null;
    this.shake = 0;
    this.lastCrashAt = -99;
    this.lastRamAt = -99;
    this.missionNpc = null;
    this.missionProp = null;
    this.markerKey = '';
    this.respawnAt = { x: PLACES.safehouse.x, z: PLACES.safehouse.z - 10 };

    this.input = {
      forward: false, back: false, left: false, right: false,
      sprint: false, jump: false, handbrake: false,
    };
    this.mouseDown = false;

    // --- beacon: floating objective marker ---
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 36, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 18;
    this.beacon.add(beam);
    this.beaconDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    this.beaconDiamond.position.y = 5.4;
    this.beacon.add(this.beaconDiamond);
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    // --- particles: one Points pool, reused for sparks / muzzle / pickups ---
    this.pMax = 320;
    this.pPos = new Float32Array(this.pMax * 3);
    this.pCol = new Float32Array(this.pMax * 3);
    this.pVel = new Float32Array(this.pMax * 3);
    this.pLife = new Float32Array(this.pMax);
    for (let i = 0; i < this.pMax; i++) this.pPos[i * 3 + 1] = -999;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pCursor = 0;
    this.pPoints = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.pPoints.frustumCulled = false;
    this.scene.add(this.pPoints);

    // callbacks the mission manager + police call into
    this.events = {
      dialogue: (name, text) => this.hud.dialogue(name, text),
      objective: () => { /* HUD reads the mission manager directly */ },
      missionComplete: (title, reward, place) => {
        this.hud.banner('MISSION COMPLETE', `${title} · +${money(reward)}${place > 1 ? ` · P${place}` : ''}`, 3.5);
      },
      missionFailed: (reason) => this.hud.banner('MISSION FAILED', reason, 3),
      storyComplete: () => {
        this.state = 'end';
        this.hud.hide();
        document.getElementById('end-screen').classList.remove('hidden');
      },
      spawnMissionCar: (kind, x, z) => this.spawnMissionCar(kind, x, z),
      clearMissionCar: () => this.clearMissionCar(),
      startRace: (checkpoints) => this.startRace(checkpoints),
    };
    this.police.onHeat = () => { /* HUD reads wanted directly */ };

    this.bindInput();
    this.bindButtons();
    this.resetWorld(7);
    this.setupTitle();
    // read-only handle for automated play-testing / debugging
    window.__solmara = this;
  }

  // ------------------------------------------------------------------ setup

  resetWorld(seed) {
    this.cash = 150;
    this.missions.active = null;
    this.missions.done = 0;
    this.missions.race = null;
    this.police.clearWanted();
    for (const c of [...this.police.cars]) this.scene.remove(c.mesh);
    for (const c of [...this.police.cops]) this.scene.remove(c.mesh);
    this.police.cars = [];
    this.police.cops = [];
    if (this.police.heli) {
      this.scene.remove(this.police.heli.group);
      this.police.heli = null;
    }
    this.police.arrest = 0;
    this.police.busted = false;
    for (const p of this.parked) this.scene.remove(p.mesh);
    this.parked = [];
    for (const r of this.racers) this.scene.remove(r.mesh);
    this.racers = [];
    this.missionCar = null;
    this.clearMissionMarkers();
    for (const c of this.traffic.cars) this.scene.remove(c.mesh);
    this.traffic.cars = [];
    this.traffic.rng = mulberry32(seed);
    this.traffic.spawn(12);
    for (const p of this.peds.list) this.scene.remove(p.mesh);
    this.peds.list = [];
    this.peds.rng = mulberry32(seed + 16);
    this.peds.spawn(22);
    // ambient parked cars in lots (off the roads, so traffic never hits them)
    const spots = [
      ['sedan', 0xd84a4a, 186, 158, 1.57], ['sedan', 0x4a7dd8, 196, 158, 1.57],
      ['sport', 0xe8c85a, 206, 158, 1.57], ['sedan', 0x7a7a82, -72, 150, 0],
      ['truck', 0x3fae7a, -84, 150, 0], ['sedan', 0xd8d8d8, 66, 210, 3.14],
    ];
    for (const [kind, color, x, z, h] of spots) {
      const mesh = makeCarMesh(kind, color);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = h;
      this.scene.add(mesh);
      this.parked.push({ mesh, x, z, heading: h, kind, id: 'parked-' + kind + '-' + x, maxSpeed: kind === 'sport' ? 46 : 38, health: 100 });
    }
    // player starts on foot at the safehouse
    this.exitCar(true);
    this.player.setPosition(this.respawnAt.x, this.respawnAt.z, Math.PI * 0.75);
    this.player.health = 100;
    this.playerCar.health = 100;
    this.camYaw = Math.PI * 0.9;
    this.camPitch = 0.32;
    this.clockSeconds = 18 * 3600 + 42 * 60;
  }

  setupTitle() {
    const save = loadSave();
    document.getElementById('btn-continue').classList.toggle('hidden', !save);
    if (save) {
      document.getElementById('saveinfo').textContent =
        `Save found: ${money(save.cash)} · ${save.done}/7 missions · rank ${rankFor(save.cash)}. Progress saves after every mission.`;
    }
    this.state = 'title';
    this.hud.hide();
  }

  startGame(fromSave) {
    this.audio.init();
    this.resetWorld(7);
    if (fromSave) {
      const s = loadSave();
      if (s) {
        this.cash = s.cash ?? 150;
        this.missions.done = Math.min(7, s.done ?? 0);
        this.player.setPosition(s.x ?? this.respawnAt.x, s.z ?? this.respawnAt.z, s.heading ?? 0);
        this.hud.dialogue('Iris Duarte', 'Welcome back, Mara. The city kept your seat warm — press H when you want the next job.');
      }
    } else {
      this.hud.dialogue('Iris Duarte', 'Mara Voss, back in Solmara at last. Press H to start your first job — or just drive. The city is yours.');
    }
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    this.state = 'play';
    this.hud.show();
  }

  saveGame() {
    writeSave({
      cash: this.cash,
      done: this.missions.done,
      x: this.playerPos.x,
      z: this.playerPos.z,
      heading: this.inCar ? this.playerCar.heading : this.player.heading,
      time: this.clockSeconds,
    });
  }

  // -------------------------------------------------------------- input

  bindInput() {
    const keymap = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint',
      Space: 'jump',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.input.jump = true;
        this.input.handbrake = true;
        e.preventDefault();
      }
      if (keymap[e.code]) this.input[keymap[e.code]] = true;
      if (e.repeat) return;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.punch();
      if (e.code === 'KeyR') this.combat.reload(this.now);
      if (e.code === 'Digit1') this.combat.setWeapon('fists');
      if (e.code === 'Digit2') this.combat.setWeapon('pistol');
      if (e.code === 'KeyQ') {
        this.audio.init();
        this.hud.dialogue('Radio', this.audio.cycleStation() + ' — now playing.');
      }
      if (e.code === 'KeyC') {
        this.camDistWant = this.camDistWant > 9 ? 6.5 : 11;
      }
      if (e.code === 'KeyM') {
        this.audio.init();
        this.audio.setMuted(!this.audio.muted);
      }
      if (e.code === 'KeyH') this.toggleMission();
      if (e.code === 'Escape') this.togglePause();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.input.jump = false;
        this.input.handbrake = false;
      }
      if (keymap[e.code]) this.input[keymap[e.code]] = false;
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.shotMode) {
        this.audio.init();
        this.canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.camYaw -= e.movementX * 0.0032;
      this.camPitch = clamp(this.camPitch + e.movementY * 0.0028, -0.12, 0.62);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.tryShoot();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    this.canvas.addEventListener('wheel', (e) => {
      this.camDistWant = clamp(this.camDistWant + Math.sign(e.deltaY) * 1.5, 5, 14);
    }, { passive: true });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  bindButtons() {
    const on = (id, fn) =>
      document.getElementById(id).addEventListener('click', () => {
        this.audio.init();
        this.audio.sfx('click');
        fn();
      });
    on('btn-new', () => this.startGame(false));
    on('btn-continue', () => this.startGame(true));
    on('btn-resume', () => this.togglePause());
    on('btn-save', () => {
      this.saveGame();
      this.hud.dialogue('System', 'Game saved.');
    });
    on('btn-quit', () => {
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('title-screen').classList.remove('hidden');
      this.setupTitle();
    });
    on('btn-busted', () => this.respawn('The PD let you go — bail paid.'));
    on('btn-wasted', () => this.respawn('Patched up at the safehouse.'));
    on('btn-freeroam', () => {
      document.getElementById('end-screen').classList.add('hidden');
      this.state = 'play';
      this.hud.show();
    });
    on('btn-endtitle', () => {
      document.getElementById('end-screen').classList.add('hidden');
      document.getElementById('title-screen').classList.remove('hidden');
      this.setupTitle();
    });
  }

  togglePause() {
    if (this.state === 'play') {
      this.state = 'pause';
      document.getElementById('pause-stats').textContent =
        `${money(this.cash)} · ${this.missions.done}/7 missions · rank ${rankFor(this.cash)} · wanted ${this.police.wanted}★`;
      document.getElementById('pause-screen').classList.remove('hidden');
      document.exitPointerLock?.();
    } else if (this.state === 'pause') {
      this.state = 'play';
      document.getElementById('pause-screen').classList.add('hidden');
    }
  }

  toggleMission() {
    if (this.state !== 'play') return;
    if (this.missions.active) {
      this.missions.abandon();
      return;
    }
    const next = this.missions.done;
    if (next < MISSIONS.length) {
      this.missions.start(next);
      this.audio.sfx('pickup');
    } else {
      this.hud.dialogue('Iris Duarte', 'All seven jobs are done, legend. Free roam is yours — the city never closes.');
    }
  }

  respawn(note) {
    document.getElementById('busted-screen').classList.add('hidden');
    document.getElementById('wasted-screen').classList.add('hidden');
    this.police.clearWanted();
    this.police.busted = false;
    this.exitCar(true);
    this.player.setPosition(this.respawnAt.x, this.respawnAt.z, 0);
    this.player.health = 100;
    this.playerCar.health = 100;
    if (this.missions.active) this.missions.fail('The job fell apart.');
    this.hud.dialogue('Iris Duarte', note);
    this.state = 'play';
    this.hud.show();
  }

  // -------------------------------------------------------------- actions

  nearestParked(maxD) {
    let best = null;
    let bd = Infinity;
    for (const p of this.parked) {
      const d = Math.hypot(p.x - this.playerPos.x, p.z - this.playerPos.z);
      if (d < maxD && d < bd && p.health > 0) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  interact() {
    if (this.state !== 'play') return;
    if (this.inCar) {
      this.exitCar();
      return;
    }
    // A steal step always wants its own car: the mission car can sit right on
    // top of an ambient parked car (the marina), and grabbing the wrong one
    // would leave the mission stuck.
    const m = this.missions.active;
    if (m) {
      const s = m.def.steps[m.step];
      if (s.type === 'steal') {
        const target = this.parked.find((p) => p.id === s.car && Math.hypot(p.x - this.playerPos.x, p.z - this.playerPos.z) < 4.2);
        if (target) {
          this.enterCar(target);
          return;
        }
      }
    }
    const car = this.nearestParked(4.2);
    if (car) {
      this.enterCar(car);
      return;
    }
    // safehouse door: save
    const d = Math.hypot(this.playerPos.x - PLACES.safehouse.x, this.playerPos.z - (PLACES.safehouse.z - 7));
    if (d < 4.5) {
      this.saveGame();
      this.hud.dialogue('System', 'Game saved at the safehouse.');
      this.audio.sfx('pickup');
    }
  }

  enterCar(parked) {
    this.parked = this.parked.filter((p) => p !== parked);
    this.playerCar.enter(parked.mesh, parked.x, parked.z, parked.heading, parked.kind, parked.maxSpeed);
    this.playerCar.health = parked.health;
    this.playerCarKind = parked.id;
    this.inCar = true;
    this.player.mesh.visible = false;
    this.camDistWant = 11;
    this.audio.sfx('click');
    if (parked.id === 'sport-red' || parked.id === 'limo-black') {
      this.police.addHeat(1);
      this.hud.dialogue(
        'Iris Duarte',
        parked.id === 'limo-black'
          ? 'That is Kane’s limo. Every cop in Solmara just got the call — DRIVE.'
          : 'Nice. The Comet is yours now — the owner will not miss it. Much.',
      );
    }
    this.updatePlayerPos();
  }

  exitCar(silent = false) {
    if (!this.inCar) return;
    const mesh = this.playerCar.mesh;
    const health = this.playerCar.health;
    const kind = this.playerCarKind;
    const id = kind;
    const maxSpeed = this.playerCar.maxSpeed;
    const x = this.playerCar.x;
    const z = this.playerCar.z;
    const h = this.playerCar.heading;
    this.playerCar.exit();
    this.inCar = false;
    this.playerCarKind = null;
    this.player.mesh.visible = true;
    // step out to the side of the car
    const sx = x + Math.cos(h) * 2.2;
    const sz = z - Math.sin(h) * 2.2;
    this.player.setPosition(sx, sz, h);
    if (health > 0 && mesh) {
      this.parked.push({ mesh, x, z, heading: h, kind: kind || 'sedan', id: id || 'parked-x', maxSpeed, health });
    } else if (mesh) {
      mesh.rotation.z = 0.3;
      mesh.position.y = 0.35;
    }
    this.camDistWant = 8;
    if (!silent) this.audio.sfx('click');
    this.updatePlayerPos();
  }

  punch() {
    if (this.state !== 'play' || this.inCar) return;
    this.player.punch(this.now);
    this.audio.sfx('punch', 0.8);
    const fwd = { x: Math.sin(this.player.heading), z: Math.cos(this.player.heading) };
    const res = this.combat.punch(this.now, this.combatTargets(), { x: this.player.x, z: this.player.z }, fwd);
    if (res && res.hit) {
      const t = res.hit;
      if (t.kind === 'cop') {
        const cop = t.ref;
        cop.health -= 1;
        if (cop.health <= 0) {
          cop.down = 9;
          cop.mesh.rotation.x = -Math.PI / 2 + 0.15;
          cop.mesh.position.y = 0.35;
          this.police.addHeat(1);
        }
      } else if (t.kind === 'ped') {
        this.peds.knockDown(t.x, t.z, 2.5);
        this.police.addHeat(1);
        this.peds.scare(t.x, t.z, 14);
      }
      this.spawnBurst(t.x, 1.4, t.z, 0xffd166, 8, 3);
    }
  }

  tryShoot() {
    if (this.state !== 'play' || this.inCar || this.combat.weapon !== 'pistol') return;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const res = this.combat.shoot(this.now, this.combatTargets(), origin, dir);
    if (!res) return;
    this.audio.sfx('shot', 0.9);
    this.peds.scare(this.player.x, this.player.z, 26);
    if (res.hit) {
      const t = res.hit;
      this.spawnBurst(res.point.x, res.point.y, res.point.z, 0xffa040, 10, 4);
      if (t.kind === 'cop') {
        const cop = t.ref;
        cop.health -= 1;
        if (cop.health <= 0) {
          cop.down = 9;
          cop.mesh.rotation.x = -Math.PI / 2 + 0.15;
          cop.mesh.position.y = 0.35;
        }
        this.police.addHeat(1);
      } else if (t.kind === 'ped') {
        this.peds.knockDown(t.x, t.z, 2);
        this.police.addHeat(1);
      } else if (t.kind === 'car') {
        const car = t.ref;
        car.health -= 20;
        if (car.health <= 0 && !car.wrecked) {
          car.wrecked = true;
          car.mesh.rotation.z = 0.35;
          car.mesh.position.y = 0.4;
          this.spawnBurst(car.x, 1.5, car.z, 0xff8020, 26, 7);
          this.audio.sfx('crash');
        }
      }
    }
  }

  combatTargets() {
    const targets = [];
    for (const c of this.police.cops) if (c.down <= 0) targets.push({ mesh: c.mesh, x: c.x, z: c.z, kind: 'cop', ref: c });
    for (const p of this.peds.list) if (p.down <= 0) targets.push({ mesh: p.mesh, x: p.x, z: p.z, kind: 'ped', ref: p });
    for (const c of this.traffic.cars) if (!c.wrecked) targets.push({ mesh: c.mesh, x: c.x, z: c.z, kind: 'car', ref: c });
    for (const c of this.police.cars) targets.push({ mesh: c.mesh, x: c.x, z: c.z, kind: 'car', ref: c });
    return targets;
  }

  spawnMissionCar(kindId, x, z) {
    this.clearMissionCar();
    const conf =
      kindId === 'limo-black'
        ? { kind: 'limo', color: 0x111114, maxSpeed: 38 }
        : { kind: 'sport', color: 0xd81f2a, maxSpeed: 48 };
    const mesh = makeCarMesh(conf.kind, conf.color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = 1.57;
    this.scene.add(mesh);
    const car = { mesh, x, z, heading: 1.57, kind: conf.kind, id: kindId, maxSpeed: conf.maxSpeed, health: 100 };
    this.parked.push(car);
    this.missionCar = car;
  }

  clearMissionCar() {
    if (!this.missionCar) return;
    if (this.playerCarKind === this.missionCar.id) {
      this.missionCar = null;
      return;
    }
    this.scene.remove(this.missionCar.mesh);
    this.parked = this.parked.filter((p) => p !== this.missionCar);
    this.missionCar = null;
  }

  clearMissionMarkers() {
    if (this.missionNpc) {
      this.scene.remove(this.missionNpc);
      this.missionNpc = null;
    }
    if (this.missionProp) {
      this.scene.remove(this.missionProp);
      this.missionProp = null;
    }
  }

  startRace(checkpoints) {
    for (const r of this.racers) this.scene.remove(r.mesh);
    this.racers = [];
    const colors = [0x2fd8c8, 0xe8e83a, 0xd88ad8];
    const names = ['Juno', 'Rafi', 'Bea'];
    for (let i = 0; i < 3; i++) {
      const mesh = makeCarMesh('sport', colors[i]);
      const x = 221 + i * 3;
      const z = -158 - i * 7;
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.racers.push({ mesh, x, z, heading: 0, speed: 0, cruise: 30 + i * 1.6, cp: 0, finished: false, name: names[i], lane: (i - 1) * 3 });
    }
    if (this.missions.race) this.missions.race.racers = this.racers;
  }

  updateRacers(dt) {
    const race = this.missions.race;
    if (!race) return;
    for (const r of this.racers) {
      if (r.finished) continue;
      const cp = race.checkpoints[r.cp];
      if (!cp) {
        r.finished = true;
        continue;
      }
      const tx = cp.x + (r.lane || 0);
      const dx = tx - r.x;
      const dz = cp.z - r.z;
      const d = Math.hypot(dx, dz);
      if (d < 9) {
        r.cp += 1;
        if (r.cp >= race.checkpoints.length) r.finished = true;
        continue;
      }
      const want = Math.atan2(dx, dz);
      r.heading += angleDelta(r.heading, want) * Math.min(1, dt * 2.4);
      r.speed = damp(r.speed, r.cruise, 1, dt);
      r.x += Math.sin(r.heading) * r.speed * dt;
      r.z += Math.cos(r.heading) * r.speed * dt;
      r.mesh.position.set(r.x, 0, r.z);
      r.mesh.rotation.y = r.heading;
    }
  }

  // -------------------------------------------------------------- particles

  spawnBurst(x, y, z, colorHex, n = 12, spread = 5) {
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < n; i++) {
      const idx = this.pCursor;
      this.pCursor = (this.pCursor + 1) % this.pMax;
      this.pPos[idx * 3] = x;
      this.pPos[idx * 3 + 1] = y;
      this.pPos[idx * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 0.6) * spread;
      this.pVel[idx * 3] = Math.cos(a) * sp;
      this.pVel[idx * 3 + 1] = Math.random() * spread * 0.8 + 1;
      this.pVel[idx * 3 + 2] = Math.sin(a) * sp;
      this.pCol[idx * 3] = c.r;
      this.pCol[idx * 3 + 1] = c.g;
      this.pCol[idx * 3 + 2] = c.b;
      this.pLife[idx] = 0.5 + Math.random() * 0.5;
    }
    this.pPoints.geometry.attributes.position.needsUpdate = true;
    this.pPoints.geometry.attributes.color.needsUpdate = true;
  }

  updateParticles(dt) {
    for (let i = 0; i < this.pMax; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        this.pPos[i * 3 + 1] = -999;
        continue;
      }
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      this.pVel[i * 3 + 1] -= 9 * dt;
    }
    this.pPoints.geometry.attributes.position.needsUpdate = true;
  }

  // -------------------------------------------------------------- loop

  updatePlayerPos() {
    if (this.inCar) {
      this.playerPos.x = this.playerCar.x;
      this.playerPos.z = this.playerCar.z;
    } else {
      this.playerPos.x = this.player.x;
      this.playerPos.z = this.player.z;
    }
  }

  update(dt) {
    const input = this.scriptedInput || this.input;
    this.now += dt;
    this.clockSeconds += dt * 12;
    this.city.update(dt);

    // --- player ---
    if (this.inCar) {
      this.playerCar.update(dt, input, this.city, this.traffic, this.peds, (x, z, spd) => {
        if (this.now - this.lastCrashAt < 0.8) return;
        this.lastCrashAt = this.now;
        this.audio.sfx('crash', clamp(spd / 30, 0.3, 1));
        this.spawnBurst(x, 1, z, 0xffa040, Math.floor(spd), 5);
        this.shake = Math.min(0.5, this.shake + spd * 0.01);
        this.hud.damageFlash(0.4);
      });
      // running a ped over
      if (Math.abs(this.playerCar.speed) > 6) {
        const hit = this.peds.list.find((p) => p.down <= 0 && Math.hypot(p.x - this.playerCar.x, p.z - this.playerCar.z) < 2.4);
        if (hit) {
          this.peds.knockDown(hit.x, hit.z, 2.5);
          this.police.addHeat(1);
          this.peds.scare(hit.x, hit.z, 20);
          this.audio.sfx('crash', 0.7);
          this.playerCar.speed *= 0.85;
          this.hud.damageFlash(0.3);
        }
      }
      if (this.playerCar.health <= 0) {
        this.spawnBurst(this.playerCar.x, 1.5, this.playerCar.z, 0x666666, 30, 6);
        this.hud.dialogue('System', 'Your car is wrecked. Get out and find another ride.');
        this.exitCar();
      }
      // Rosa's garage repairs a slow car parked on it
      const gd = Math.hypot(this.playerCar.x - PLACES.garage.x, this.playerCar.z - PLACES.garage.z);
      if (gd < 12 && Math.abs(this.playerCar.speed) < 1 && this.playerCar.health < 100) {
        this.playerCar.health = Math.min(100, this.playerCar.health + 20 * dt);
      }
    } else {
      this.player.update(dt, input, this.camYaw, this.city, this.now);
      if (this.player.health <= 0) {
        this.cash = Math.max(0, Math.floor(this.cash * 0.85));
        this.state = 'wasted';
        document.getElementById('wasted-screen').classList.remove('hidden');
        this.hud.hide();
        this.audio.sfx('busted');
        document.exitPointerLock?.();
        return;
      }
    }
    this.updatePlayerPos();

    // --- world ---
    this.traffic.update(dt, this.inCar ? this.playerCar : null);
    this.peds.update(dt);
    const policeEvents = {
      onRam: (spd) => {
        if (!this.inCar) return;
        if (this.now - this.lastRamAt < 0.9) return;
        this.lastRamAt = this.now;
        this.playerCar.health -= spd * 0.35;
        this.audio.sfx('crash', clamp(spd / 34, 0.3, 1));
        this.spawnBurst(this.playerCar.x, 1, this.playerCar.z, 0xffa040, 10, 5);
        this.shake = Math.min(0.5, this.shake + spd * 0.008);
        this.hud.damageFlash(0.5);
      },
      onCopShot: (cop, dist) => {
        this.audio.sfx('shot', clamp(1 - dist / 40, 0.15, 0.6));
        if (Math.random() < clamp(0.34 - dist * 0.008, 0.08, 0.34)) {
          this.player.hurt(6 + Math.random() * 4, this.now);
          this.hud.damageFlash(0.7);
          this.shake = Math.min(0.5, this.shake + 0.2);
        }
      },
      onBusted: () => {
        this.cash = Math.max(0, Math.floor(this.cash * 0.85));
        this.state = 'busted';
        document.getElementById('busted-screen').classList.remove('hidden');
        this.hud.hide();
        this.audio.sfx('busted');
        document.exitPointerLock?.();
      },
    };
    this.police.update(dt, this.playerPos, this.inCar, this.inCar ? this.playerCar.speed : 0, this.now, policeEvents);
    this.missions.update(dt);
    this.updateRacers(dt);
    this.combat.update(dt, this.now);
    if (this.mouseDown) this.tryShoot();
    this.updateParticles(dt);

    // --- mission NPC / prop markers ---
    this.updateMissionMarkers();

    // --- beacon ---
    const obj = this.missions.objectivePos();
    if (obj && this.state === 'play') {
      this.beacon.visible = true;
      this.beacon.position.set(obj.x, 0, obj.z);
      this.beaconDiamond.position.y = 5.4 + Math.sin(this.now * 2.2) * 0.7;
      this.beaconDiamond.rotation.y += dt * 1.4;
    } else {
      this.beacon.visible = false;
    }

    // --- camera, audio, prompt, HUD ---
    this.updateCamera(dt);
    this.audio.setEngine(this.inCar ? clamp(Math.abs(this.playerCar.speed) / 40, 0, 1) : 0, this.inCar);
    this.audio.setSiren(this.police.sirenNear, this.police.wanted > 0);
    this.updatePrompt();
    if (this.state === 'play') this.hud.update(this, this.now);
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  updateMissionMarkers() {
    const m = this.missions.active;
    const key = m ? `${m.def.id}:${m.step}` : '';
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.clearMissionMarkers();
    if (!m) return;
    const s = m.def.steps[m.step];
    if (s.type !== 'pickup') return;
    if (m.def.id === 'm3') {
      // Tomas waits at Mercado Square
      const npc = makePersonMesh(0xd8d8d8, 0x2a2a33, 0xc98d64);
      npc.position.set(s.x, 0, s.z);
      npc.rotation.y = 2.2;
      this.scene.add(npc);
      this.missionNpc = npc;
    } else if (m.def.id === 'm5') {
      // the package: a small glowing case
      const prop = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.6, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xffd166 }),
      );
      prop.position.set(s.x, 0.6 + Math.sin(this.now * 2) * 0.1, s.z);
      this.scene.add(prop);
      this.missionProp = prop;
    }
  }

  updatePrompt() {
    if (this.state !== 'play') {
      this.hud.prompt(null);
      return;
    }
    if (this.inCar) {
      this.hud.prompt('<b>E</b> — Get out');
      return;
    }
    const car = this.nearestParked(4.2);
    if (car) {
      const label =
        car.id === 'sport-red' ? 'Steal the Comet S'
        : car.id === 'limo-black' ? "Steal Kane's limo"
        : `Enter the ${car.kind}`;
      this.hud.prompt(`<b>E</b> — ${label}`);
      return;
    }
    const d = Math.hypot(this.playerPos.x - PLACES.safehouse.x, this.playerPos.z - (PLACES.safehouse.z - 7));
    if (d < 4.5) {
      this.hud.prompt('<b>E</b> — Save game');
      return;
    }
    const gd = Math.hypot(this.playerPos.x - PLACES.garage.x, this.playerPos.z - PLACES.garage.z);
    if (gd < 12 && !this.inCar) {
      this.hud.prompt('Rosa Garage — drive a car in to repair it');
      return;
    }
    this.hud.prompt(null);
  }

  updateCamera(dt) {
    let targetX;
    let targetY;
    let targetZ;
    let dist;
    let pitch;
    if (this.inCar) {
      // chase cam: swing behind the car, widen the FOV with speed
      const wantYaw = this.playerCar.heading + Math.PI;
      let dy = wantYaw - this.camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.camYaw += dy * Math.min(1, dt * 1.6);
      targetX = this.playerCar.x;
      targetY = 1.6;
      targetZ = this.playerCar.z;
      dist = this.camDistWant;
      pitch = 0.3;
      const wantFov = 62 + clamp(Math.abs(this.playerCar.speed) / 40, 0, 1) * 10;
      if (Math.abs(this.camera.fov - wantFov) > 0.1) {
        this.camera.fov = damp(this.camera.fov, wantFov, 4, dt);
        this.camera.updateProjectionMatrix();
      }
    } else {
      targetX = this.player.x;
      targetY = 1.7;
      targetZ = this.player.z;
      dist = this.camDistWant;
      pitch = this.camPitch;
      if (Math.abs(this.camera.fov - 62) > 0.1) {
        this.camera.fov = damp(this.camera.fov, 62, 4, dt);
        this.camera.updateProjectionMatrix();
      }
    }
    this.camDist = damp(this.camDist, dist, 6, dt);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    let cx = targetX + Math.sin(this.camYaw) * cp * this.camDist;
    let cy = targetY + sp * this.camDist;
    let cz = targetZ + Math.cos(this.camYaw) * cp * this.camDist;
    // keep the camera out of buildings
    const p = { x: cx, z: cz };
    if (collideCircle(this.city.colliders, p, 1.2)) {
      cx = p.x;
      cz = p.z;
    }
    cy = Math.max(0.7, cy);
    if (this.shake > 0.01) {
      cx += (Math.random() - 0.5) * this.shake;
      cy += (Math.random() - 0.5) * this.shake;
      cz += (Math.random() - 0.5) * this.shake;
    }
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(targetX, targetY, targetZ);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  run() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) {
      this.shotMode = true;
      const seed = Number(params.get('seed') || 1);
      stageShot(shot, this, seed);
      document.title = `SOLMARA — ${shot}`;
      // frozen frame: keep presenting the staged scene
      const loop = () => {
        this.render();
        requestAnimationFrame(loop);
      };
      loop();
      return;
    }
    let last = performance.now();
    const loop = (t) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (this.state === 'play') this.update(dt);
      else if (this.state === 'title') {
        // slow cinematic orbit behind the title screen
        this.now += dt;
        this.camera.position.set(260 + Math.sin(this.now * 0.03) * 40, 55, 190 + Math.cos(this.now * 0.02) * 30);
        this.camera.lookAt(-60, 18, -20);
        this.city.update(dt);
      }
      this.render();
    };
    requestAnimationFrame(loop);
  }
}

const game = new Game();
game.run();
