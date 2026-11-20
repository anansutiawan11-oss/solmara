// missions.js — 7 story missions with dialogue, rewards, rank progression,
// autosave. Cash starts at $150; M1 pays $200 ($150→$350), M2 pays $400
// ($350→$750). Stealing the Comet raises 1 wanted star with 2 patrol cars.
import { dist2 } from './utils.js';

export const RANKS = ['Street', 'Hustler', 'Runner', 'Enforcer', 'Boss', 'King of Solmara'];

export function missionList(places) {
  return [
    {
      id: 'm1', name: 'Homecoming', reward: 200,
      briefing: "Back in Solmara after five years. Rosa's waiting at the garage — drive over and say hi.'",
      steps: [
        { type: 'drive', target: places.garage, text: 'Drive to Rosa Garage', radius: 10 },
        { type: 'talk', target: places.garage, text: 'Talk to Rosa (press E)', radius: 6 },
      ],
      done: "Mara! The city's yours again, kid. Take the sedan — you'll need wheels.'",
    },
    {
      id: 'm2', name: 'Hot Wheels', reward: 400,
      briefing: "A red Comet S is parked at the marina, keys in it. Bring it back here. Quietly... or not.'",
      steps: [
        { type: 'goto', target: places.marina, text: 'Go to the marina', radius: 14 },
        { type: 'steal', target: places.marina, text: 'Steal the red Comet S (press E)', radius: 9, carId: 'comet-s' },
        { type: 'drive', target: places.garage, text: 'Drive the Comet back to Rosa Garage', radius: 10, inCar: 'comet-s' },
      ],
      done: "Beautiful. The cops noticed, but you lost them. $400, and the Comet's yours to keep.'",
    },
    {
      id: 'm3', name: 'The Pickup', reward: 500,
      briefing: "Pick up a package from the Night Market. Don't let the cops see you carrying it.'",
      steps: [
        { type: 'goto', target: places.market, text: 'Go to the Night Market', radius: 8 },
        { type: 'talk', target: places.market, text: 'Pick up the package (press E)', radius: 6 },
        { type: 'drive', target: places.garage, text: 'Bring the package to Rosa Garage', radius: 10 },
      ],
      done: "Clean. The buyer paid in full — $500.'",
    },
    {
      id: 'm4', name: 'Beach Run', reward: 700,
      briefing: "You think you're fast, Mara? Three of us, boardwalk to boardwalk. Loser walks home.'",
      steps: [
        { type: 'goto', target: places.beach, text: 'Get to the beach start line', radius: 8 },
        { type: 'race', target: places.finish, text: 'Race! Beat the rivals to the boardwalk finish', radius: 12 },
      ],
      done: "'King of the beach, huh? $700. Spend it before I win it back.'",
    },
    {
      id: 'm5', name: 'The Drop', reward: 600,
      briefing: "On foot this time. Walk the package to the drop point, north-east corner. No cars, no noise.'",
      steps: [
        { type: 'goto', target: places.drop, text: 'Walk to the drop point (on foot)', radius: 7, onFoot: true },
        { type: 'talk', target: places.drop, text: 'Make the drop (press E)', radius: 6 },
      ],
      done: "'Package delivered. $600. You're getting good at this.'",
    },
    {
      id: 'm6', name: 'Heat Wave', reward: 800,
      briefing: "The whole force is coming down on us. Lose the heat — outrun them, then lay low till the stars fade.'",
      steps: [
        { type: 'escape', target: places.safehouse, text: 'Escape the police, then reach the safehouse', radius: 10 },
      ],
      done: "'They'll forget by morning. $800 for the trouble.'",
    },
    {
      id: 'm7', name: 'King of Solmara', reward: 1500,
      briefing: "One last job. The Casino Sol vault, the full crew, the whole city watching. Take the crown.'",
      steps: [
        { type: 'goto', target: places.casino, text: 'Get to Casino Sol', radius: 10 },
        { type: 'talk', target: places.casino, text: 'Hit the vault (press E)', radius: 7 },
        { type: 'escape', target: places.safehouse, text: 'Escape to the safehouse', radius: 10 },
      ],
      done: "King of Solmara. The whole coast is yours now, Mara.'",
    },
  ];
}

export function createMissions(places) {
  return {
    list: missionList(places),
    index: 0, step: 0,
    state: 'briefing', // briefing | active | done | story-end
    timer: 0, raceRivals: [], raceDone: false,
  };
}

export function currentMission(m) { return m.list[m.index] || null; }
export function currentStep(m) {
  const mis = currentMission(m);
  return mis ? mis.steps[m.step] : null;
}

// Advance the mission state machine. ctx: {player, cars, police, audio, onSave,
// onDialogue, onComplete, missionCar}. Returns 'mission-complete' | 'step' | null.
export function updateMissions(m, dt, ctx) {
  const mis = currentMission(m);
  if (!mis || m.state === 'done' || m.state === 'story-end') return null;
  const step = mis.steps[m.step];
  if (!step) return null;
  const p = ctx.player;
  const d = dist2(p.pos.x, p.pos.z, step.target.x, step.target.z);

  if (step.type === 'goto' || step.type === 'drive' || step.type === 'talk' || step.type === 'steal') {
    const inRightCar = !step.inCar || (p.car && p.car.id === step.inCar);
    const onFootOk = !step.onFoot || p.onFoot;
    if (d < step.radius && inRightCar && onFootOk) {
      if (step.type === 'talk' || step.type === 'steal') return null; // waits for E
      return advanceStep(m, ctx);
    }
    return null;
  }
  if (step.type === 'race') {
    if (d < step.radius && !m.raceDone) {
      m.raceDone = true;
      return advanceStep(m, ctx);
    }
    return null;
  }
  if (step.type === 'escape') {
    if (ctx.police.wanted === 0 && d < step.radius) return advanceStep(m, ctx);
    return null;
  }
  return null;
}

function advanceStep(m, ctx) {
  const mis = currentMission(m);
  m.step += 1;
  if (m.step >= mis.steps.length) {
    // mission complete: pay, rank up, autosave
    ctx.player.cash += mis.reward;
    const rankIdx = Math.min(m.index + 1, RANKS.length - 1);
    ctx.player.rank = RANKS[rankIdx];
    ctx.onDialogue && ctx.onDialogue(mis.done, 'Rosa');
    ctx.onComplete && ctx.onComplete(mis);
    m.index += 1; m.step = 0; m.raceDone = false;
    if (m.index >= m.list.length) m.state = 'story-end';
    else m.state = 'briefing';
    ctx.onSave && ctx.onSave();
    return 'mission-complete';
  }
  return 'step';
}

// Called when the player presses E. Handles talk/steal steps (B1: steal prefers
// the mission car by id). Returns true if the press did something.
export function interactPressed(m, ctx) {
  const mis = currentMission(m);
  if (!mis || m.state !== 'active') return false;
  const step = mis.steps[m.step];
  if (!step || (step.type !== 'talk' && step.type !== 'steal')) return false;
  const p = ctx.player;
  const d = dist2(p.pos.x, p.pos.z, step.target.x, step.target.z);
  if (d > step.radius + 2) return false;
  if (step.type === 'steal') {
    // B1: prefer the parked car whose id matches the mission car
    const car = ctx.cars.find(c => c.id === step.carId) ||
      ctx.cars.find(c => dist2(c.pos.x, c.pos.z, p.pos.x, p.pos.z) < 6);
    if (!car) return false;
    ctx.enterCar(car);
    ctx.police && ctx.addWanted && ctx.addWanted(1);
    ctx.onDialogue && ctx.onDialogue("Got it. Now drive like you stole it — because you did.'", 'Mara');
    return advanceStep(m, ctx) === 'step' || true;
  }
  ctx.onDialogue && ctx.onDialogue(step.type === 'talk' ? 'Package secured. Now move.' : '', 'Mara');
  return advanceStep(m, ctx) === 'step' || true;
}

export function startMission(m, ctx) {
  const mis = currentMission(m);
  if (!mis) return;
  m.state = 'active'; m.step = 0; m.raceDone = false;
  ctx.onDialogue && ctx.onDialogue(mis.briefing, 'Mara');
}
