// Story: seven missions for Mara Voss, from wheelman to street legend. Each
// mission is a list of steps; the manager tracks the current step, shows the
// objective, fires dialogue and pays out on completion.
import { PLACES } from './city.js';

export const MISSIONS = [
  {
    id: 'm1', title: 'Homecoming', giver: 'Iris Duarte',
    brief: 'Mara, you are back. Rosa needs her tow truck at the garage — drive it over, nice and easy. The city missed you.',
    reward: 200,
    steps: [
      { type: 'goto', x: PLACES.garage.x, z: PLACES.garage.z - 14, r: 7, label: 'Drive to Rosa Garage', inCar: true },
    ],
  },
  {
    id: 'm2', title: 'Hot Wheels', giver: 'Iris Duarte',
    brief: 'A red Comet S sits at the marina, keys in the sun visor. Take it. Bring it to the garage — and try not to scratch the paint.',
    reward: 400,
    steps: [
      { type: 'steal', car: 'sport-red', x: PLACES.marina.x, z: PLACES.marina.z - 10, label: 'Steal the red Comet S at the marina' },
      { type: 'goto', x: PLACES.garage.x, z: PLACES.garage.z - 14, r: 7, label: 'Deliver the Comet to Rosa Garage', inCar: true },
    ],
  },
  {
    id: 'm3', title: 'The Pickup', giver: 'Iris Duarte',
    brief: 'Tomas is waiting at Mercado Square. Pick him up, then get him to Club Lumen. The PD is sniffing around tonight — keep it smooth.',
    reward: 600,
    steps: [
      { type: 'pickup', x: PLACES.market.x, z: PLACES.market.z, r: 4, label: 'Pick up Tomas at Mercado Square' },
      { type: 'goto', x: PLACES.club.x, z: PLACES.club.z - 12, r: 7, label: 'Drive Tomas to Club Lumen', inCar: true },
    ],
    onStep: 1,
  },
  {
    id: 'm4', title: 'Beach Run', giver: 'Tomas Voss',
    brief: 'Street race, Playa Sol to the marina. Three locals think they own the beachfront. Beat them through all six gates and the pot is yours.',
    reward: 800,
    steps: [
      {
        type: 'race', label: 'Win the Beach Run — hit all 6 gates',
        checkpoints: [
          { x: 224, z: -140 }, { x: 224, z: -28 }, { x: 224, z: 84 },
          { x: 224, z: 168 }, { x: 168, z: 168 }, { x: 196, z: 168 },
        ],
      },
    ],
  },
  {
    id: 'm5', title: 'The Drop', giver: 'Iris Duarte',
    brief: 'On foot now. Carry the package from Mercado Square to the plaza drop — no car, no noise. Cops patrol the square. Walk, do not run.',
    reward: 700,
    steps: [
      { type: 'pickup', x: PLACES.market.x, z: PLACES.market.z, r: 4, label: 'Collect the package at Mercado Square' },
      { type: 'deliver', x: PLACES.plaza.x, z: PLACES.plaza.z, r: 5, label: 'Deliver the package at Plaza Verde — on foot' },
    ],
  },
  {
    id: 'm6', title: 'Heat Wave', giver: 'Iris Duarte',
    brief: 'Kane put a price on you. Three stars and climbing — lose them, or get to the safehouse. Do not get caught, Mara.',
    reward: 900,
    steps: [
      { type: 'escape', label: 'Lose the heat — reach the safehouse or drop to 0 stars', x: PLACES.safehouse.x, z: PLACES.safehouse.z, r: 8 },
    ],
  },
  {
    id: 'm7', title: 'King of Solmara', giver: 'Tomas Voss',
    brief: 'Kane is at the casino with his black limo out front. Take it. Every cop in Solmara will be on you — bring it home to the garage and this city is ours.',
    reward: 1500,
    steps: [
      { type: 'steal', car: 'limo-black', x: PLACES.casino.x, z: PLACES.casino.z + 20, label: "Steal Kane's black limo at the casino" },
      { type: 'goto', x: PLACES.garage.x, z: PLACES.garage.z - 14, r: 7, label: 'Escape to Rosa Garage — 4 stars', inCar: true },
    ],
    onStep: 1,
  },
];

export const RANKS = [
  [0, 'Wheelman'], [1200, 'Hustler'], [3000, 'Street Racer'],
  [5200, 'Getaway Driver'], [8000, 'Kingpin Hunter'], [11000, 'Street Legend'],
];

export function rankFor(cash) {
  let r = RANKS[0][1];
  for (const [need, name] of RANKS) if (cash >= need) r = name;
  return r;
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.active = null;   // {def, step, stepData}
    this.done = 0;        // missions completed
    this.race = null;     // race state
  }

  get current() { return this.active ? this.active.def : null; }

  start(index) {
    const def = MISSIONS[index];
    if (!def) return false;
    this.active = { def, index, step: 0, stepData: {} };
    this.game.events.dialogue(def.giver, def.brief);
    this.game.events.objective(def.title, this.stepLabel());
    this.setupStep();
    return true;
  }

  stepLabel() {
    if (!this.active) return 'Explore Solmara';
    const s = this.active.def.steps[this.active.step];
    if (s.type === 'race' && this.race) return `${s.label} — gate ${this.race.gate + 1}/6`;
    return s.label;
  }

  /** Current objective position for the beacon + minimap, or null. */
  objectivePos() {
    if (!this.active) return null;
    const s = this.active.def.steps[this.active.step];
    if (s.type === 'race' && this.race) return this.race.checkpoints[this.race.gate] || null;
    return { x: s.x, z: s.z };
  }

  setupStep() {
    const g = this.game;
    const s = this.active.def.steps[this.active.step];
    if (s.type === 'steal') {
      g.events.spawnMissionCar(s.car, s.x, s.z);
    } else if (s.type === 'race') {
      this.race = { checkpoints: s.checkpoints, gate: 0, racers: [] };
      g.events.startRace(s.checkpoints);
    } else if (s.type === 'escape') {
      g.police.addHeat(3);
      g.events.dialogue('Iris Duarte', 'Three stars, Mara. Lose them or run for the safehouse — your call.');
    }
    if (this.active.def.onStep === this.active.step) {
      if (this.active.def.id === 'm3') g.police.addHeat(1, true);
      if (this.active.def.id === 'm7') g.police.addHeat(4);
    }
  }

  advance() {
    const g = this.game;
    this.active.step += 1;
    if (this.active.step >= this.active.def.steps.length) {
      this.complete();
      return;
    }
    g.events.objective(this.active.def.title, this.stepLabel());
    this.setupStep();
  }

  complete() {
    const g = this.game;
    const def = this.active.def;
    const place = this.race ? this.race.place : 1;
    const reward = place === 1 ? def.reward : Math.floor(def.reward / 2);
    g.cash += reward;
    this.done += 1;
    g.events.missionComplete(def.title, reward, place);
    g.audio.sfx('complete');
    g.saveGame();
    this.active = null;
    this.race = null;
    if (this.done >= MISSIONS.length) {
      g.events.storyComplete();
    }
  }

  fail(reason) {
    const g = this.game;
    g.events.missionFailed(reason);
    this.active = null;
    this.race = null;
    g.events.clearMissionCar();
  }

  abandon() {
    if (!this.active) return;
    const g = this.game;
    g.events.dialogue('Iris Duarte', 'Mission dropped. Call me when you are ready — H starts the next job.');
    this.active = null;
    this.race = null;
    g.events.clearMissionCar();
  }

  update(dt) {
    const g = this.game;
    if (!this.active) return;
    const s = this.active.def.steps[this.active.step];
    const px = g.playerPos.x, pz = g.playerPos.z;
    if (s.type === 'goto' || s.type === 'deliver') {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (s.type === 'deliver' && g.inCar) return; // must be on foot
      if (d < s.r && (!s.inCar || g.inCar)) {
        g.audio.sfx('pickup');
        this.advance();
      }
    } else if (s.type === 'pickup') {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d < s.r && !g.inCar) {
        g.audio.sfx('pickup');
        this.advance();
      }
    } else if (s.type === 'steal') {
      if (g.inCar && g.playerCarKind === s.car) this.advance();
    } else if (s.type === 'escape') {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d < s.r || g.police.wanted === 0) {
        g.police.clearWanted();
        this.advance();
      }
    } else if (s.type === 'race' && this.race) {
      const cp = this.race.checkpoints[this.race.gate];
      if (cp && Math.hypot(px - cp.x, pz - cp.z) < 10) {
        this.race.gate += 1;
        g.audio.sfx('pickup');
        if (this.race.gate >= this.race.checkpoints.length) {
          const racersDone = this.race.racers.filter((r) => r.finished).length;
          this.race.place = racersDone === 0 ? 1 : racersDone + 1;
          g.events.dialogue('Tomas Voss', this.race.place === 1
            ? 'First across the line! The beachfront is ours tonight.'
            : `P${this.race.place} — the pot is halved, but you finished. Rematch any time.`);
          this.advance();
        } else {
          g.events.objective(this.active.def.title, this.stepLabel());
        }
      }
    }
  }
}
