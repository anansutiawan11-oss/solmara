// missions.js — 7 story missions with dialogue, rewards, rank progression,
// autosave on completion. Steps: goto / enter / deliver (on foot) / race /
// escape (lose the heat) / finale. The manager only reads game state; it
// never reaches into the DOM — the HUD renders what getObjective returns.
import { dist2 } from './utils.js';

export const RANKS = ['Street Rat', 'Runner', 'Wheelman', 'Hustler', 'Made', 'Boss', 'King of Solmara'];

const P = (x, z) => ({ x, z });

export const MISSIONS = [
  {
    id: 1, name: 'Homecoming', reward: 200,
    intro: [
      ['Rosa', 'Mara! You came back to Solmara. About time.'],
      ['Mara', 'Missed the sun, the sea... and your garage, Rosa.'],
      ['Rosa', 'Ha! Drive over to my garage and we will talk work. Follow the yellow marker.'],
    ],
    steps: [
      { type: 'goto', text: 'Drive to Rosa Garage', target: P(90, 150), radius: 18 },
    ],
  },
  {
    id: 2, name: 'Hot Wheels', reward: 400,
    intro: [
      ['Rosa', 'A red Comet S is parked at the marina. "Borrow" it. Bring it here.'],
      ['Mara', 'Borrow. Right. And the cops?'],
      ['Rosa', 'Do not get caught. Or do — just bring me the car.'],
    ],
    steps: [
      { type: 'goto', text: 'Go to the marina', target: P(276, -72), radius: 10 },
      { type: 'enter', text: 'Steal the red Comet S (press E)', target: P(276, -72), radius: 6, carId: 'comet', onStart: 'steal' },
      { type: 'goto', text: 'Drive the Comet back to Rosa Garage', target: P(90, 150), radius: 18 },
    ],
  },
  {
    id: 3, name: 'The Pickup', reward: 350,
    intro: [
      ['Rosa', 'A package is waiting at the casino. Pick it up, then drop it at the market. No questions.'],
      ['Mara', 'No questions. Got it.'],
    ],
    steps: [
      { type: 'goto', text: 'Pick up the package at the casino', target: P(150, -150), radius: 14 },
      { type: 'goto', text: 'Deliver the package to Mercado Central', target: P(0, 0), radius: 12 },
    ],
  },
  {
    id: 4, name: 'Beach Run', reward: 600,
    intro: [
      ['Rival', 'Mara Voss? The girl who left? Race us down the beach road. Loser walks home.'],
      ['Mara', 'You are on. Three checkpoints. First one back wins.'],
    ],
    steps: [
      { type: 'race', text: 'Race! Checkpoint 1: Boardwalk', target: P(262, 60), radius: 12, race: true },
      { type: 'race', text: 'Race! Checkpoint 2: Playa Dorada', target: P(300, 180), radius: 12, race: true },
      { type: 'race', text: 'Race! Checkpoint 3: Pier 9', target: P(312, -60), radius: 12, race: true },
      { type: 'race', text: 'Race! Final: Rosa Garage', target: P(90, 150), radius: 18, race: true },
    ],
  },
  {
    id: 5, name: 'The Drop', reward: 300,
    intro: [
      ['Rosa', 'This one is on foot. The market is crawling with eyes. Walk in like you belong.'],
      ['Mara', 'On foot it is.'],
    ],
    steps: [
      { type: 'deliver', text: 'On foot: deliver to Mercado Central', target: P(0, 0), radius: 8, onFoot: true },
    ],
  },
  {
    id: 6, name: 'Heat Wave', reward: 500,
    intro: [
      ['Rosa', 'The whole force is looking for you. Lose them, then come home.'],
      ['Mara', 'Three stars. I have done worse.'],
    ],
    steps: [
      { type: 'escape', text: 'Lose the cops, then reach the Safehouse', target: P(-210, -210), radius: 14, onStart: 'heat3' },
    ],
  },
  {
    id: 7, name: 'King of Solmara', reward: 1000,
    intro: [
      ['Rosa', 'One last job. The casino, the beach, then home. Do this and the city is yours, Mara.'],
      ['Mara', 'Then let us take the city.'],
    ],
    steps: [
      { type: 'goto', text: 'Reach the casino', target: P(150, -150), radius: 14, onStart: 'heat4' },
      { type: 'goto', text: 'Reach Playa Dorada', target: P(300, 60), radius: 12 },
      { type: 'goto', text: 'Return to the Safehouse', target: P(-210, -210), radius: 14 },
    ],
  },
];

export function createMissions(game) {
  const state = {
    current: 0, // index into MISSIONS
    step: 0,
    active: false,
    dialogue: null, // {lines, index, onDone}
    rivals: [],
    raceTimer: 0,
    raceLimit: 90,
    done: [],
    finishedAll: false,
  };

  function mission() { return MISSIONS[state.current]; }
  function step() { const m = mission(); return m ? m.steps[state.step] : null; }

  function showDialogue(lines, onDone) {
    state.dialogue = { lines, index: 0, onDone };
    if (game.hud) game.hud.showDialogue(lines[0][0], lines[0][1]);
  }

  function advanceDialogue() {
    if (!state.dialogue) return false;
    state.dialogue.index += 1;
    if (state.dialogue.index >= state.dialogue.lines.length) {
      const done = state.dialogue.onDone;
      state.dialogue = null;
      if (game.hud) game.hud.hideDialogue();
      if (done) done();
      return true;
    }
    const [who, line] = state.dialogue.lines[state.dialogue.index];
    if (game.hud) game.hud.showDialogue(who, line);
    return false;
  }

  function startStep(s) {
    if (!s) return;
    if (s.onStart === 'steal') {
      game.police.addWanted(1, { now: game.now, playerPos: game.player.state.pos, playerInVehicle: !!game.vehicles.playerCar });
      game.police.spawnPatrolCar(game.player.state.pos.x, game.player.state.pos.z);
      game.police.spawnPatrolCar(game.player.state.pos.x, game.player.state.pos.z);
      if (game.hud) game.hud.toast('The Comet is hot — 1 star wanted!');
    } else if (s.onStart === 'heat3') {
      game.police.addWanted(3, { now: game.now, playerPos: game.player.state.pos, playerInVehicle: !!game.vehicles.playerCar });
    } else if (s.onStart === 'heat4') {
      game.police.addWanted(4, { now: game.now, playerPos: game.player.state.pos, playerInVehicle: !!game.vehicles.playerCar });
    }
    if (s.race && state.rivals.length === 0) spawnRivals();
  }

  function spawnRivals() {
    const spots = [[-60, 180, 0], [-60, 190, 0], [-60, 200, 0]];
    state.rivals = spots.map(([x, z], i) => {
      const car = game.vehicles.addCar(i === 0 ? 'sport' : 'sedan', x, z, 0, null, { id: `rival-${i}` });
      car.rival = { wp: 0, progress: 0 };
      return car;
    });
    state.raceTimer = 0;
  }

  function clearRivals() {
    for (const car of state.rivals) {
      car.rival = null;
      const idx = game.vehicles.cars.indexOf(car);
      if (idx >= 0) game.vehicles.cars.splice(idx, 1);
      game.vehicles.group.remove(car.mesh);
    }
    state.rivals = [];
  }

  function startMission(i) {
    state.current = i;
    state.step = 0;
    state.active = true;
    const m = mission();
    showDialogue(m.intro, () => startStep(step()));
  }

  function nextStep() {
    state.step += 1;
    const m = mission();
    if (state.step >= m.steps.length) {
      completeMission();
      return;
    }
    startStep(step());
  }

  function completeMission() {
    const m = mission();
    game.cash += m.reward;
    state.done.push(m.id);
    game.missionsDone = state.done.slice();
    game.rank = RANKS[Math.min(state.done.length, RANKS.length - 1)];
    clearRivals();
    if (game.hud) {
      game.hud.toast(`Mission complete: ${m.name}  +$${m.reward}`);
      game.hud.showBanner(`MISSION COMPLETE`, `${m.name}  —  +$${m.reward}`);
    }
    if (game.audio) game.audio.sfx('pickup');
    game.autosave();
    state.active = false;
    if (state.current + 1 < MISSIONS.length) {
      state.current += 1;
      state.step = 0;
      // Next mission starts on the player's say-so (Enter at the prompt).
      if (game.hud) game.hud.showPrompt(`Press Enter for the next mission: ${MISSIONS[state.current].name}`);
      game.nextMissionReady = true;
    } else {
      state.finishedAll = true;
      if (game.hud) game.hud.showStoryEnd(game.cash);
    }
  }

  function getObjective() {
    if (!state.active) {
      if (game.nextMissionReady) return { text: `Next: ${MISSIONS[state.current].name} (press Enter)`, target: null, distance: 0 };
      return { text: 'Free roam — press Enter for the next mission', target: null, distance: 0 };
    }
    const s = step();
    if (!s) return { text: '', target: null, distance: 0 };
    const p = effectivePos();
    const d = dist2(p.x, p.z, s.target.x, s.target.z);
    return { text: s.text, target: s.target, distance: d, step: s };
  }

  // Where "the player" is for objectives: the car while driving, Mara on foot.
  function effectivePos() {
    return game.vehicles.playerCar ? game.vehicles.playerCar.pos : game.player.state.pos;
  }

  function update(dt, ctx) {
    if (state.dialogue) return; // game waits on dialogue
    if (!state.active) return;
    const s = step();
    if (!s) return;
    const p = effectivePos();
    const d = dist2(p.x, p.z, s.target.x, s.target.z);

    if (s.type === 'goto' || s.type === 'deliver' || s.type === 'race') {
      if (s.type === 'deliver' && game.vehicles.playerCar) {
        if (game.hud) game.hud.showPrompt('Get out of the car (E) — this drop is on foot');
        return;
      }
      if (d <= s.radius) nextStep();
    } else if (s.type === 'enter') {
      if (game.vehicles.playerCar && game.vehicles.playerCar.id === s.carId) nextStep();
    } else if (s.type === 'escape') {
      if (game.police.state.wanted === 0 && d <= s.radius) nextStep();
    }

    // Race rivals: simple waypoint chase along the checkpoint list.
    if (s.race && state.rivals.length > 0) {
      state.raceTimer += dt;
      const wps = MISSIONS[3].steps.map((st) => st.target);
      for (const car of state.rivals) {
        if (car.wrecked) continue;
        const wp = wps[Math.min(car.rival.wp, wps.length - 1)];
        const dx = wp.x - car.pos.x, dz = wp.z - car.pos.z;
        const dd = Math.hypot(dx, dz) || 1;
        const want = Math.atan2(dx / dd, dz / dd);
        let diff = want - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
        car.speed = Math.min(car.spec.topSpeed * 0.82, car.speed + car.spec.accel * 0.5 * dt);
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        car.pos.z += Math.cos(car.heading) * car.speed * dt;
        car.mesh.position.copy(car.pos);
        car.mesh.rotation.y = car.heading;
        if (dd < 12) car.rival.wp += 1;
      }
      // Player loses the race if the timer runs out before the final checkpoint.
      if (state.raceTimer > state.raceLimit && state.step < 3) {
        if (game.hud) game.hud.toast('Race lost — the rivals finished first. Try again!');
        state.step = 0;
        state.raceTimer = 0;
        startStep(step());
      }
    }
  }

  return {
    state, MISSIONS,
    mission, step, startMission, nextStep, completeMission,
    getObjective, advanceDialogue, showDialogue, startStep, update,
  };
}
