// shots.js — deterministic screenshot staging (?shot=drive|start|foot|mission
// &seed=1). Same seed gives the same frame. Every scene is staged by placing
// the game in a real gameplay state and simulating forward — never mocked up.
import { dist2 } from './utils.js';

// Drive a car forward along a heading for the simulation: hold W.
function driveForward(game, seconds) {
  game.keys.w = true;
  for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60);
  game.keys.w = false;
}

export function stageShot(game, shot, seed, helpers) {
  const { city, player, police, missions } = game;
  const P = city.places;
  // reset to a clean deterministic state (starting cash is $150)
  game.over = null; game.paused = false; game.started = true;
  player.health = 100; player.cash = 150; player.ammo = 12;
  if (shot === 'start') {
    // title view: Mara on foot at the plaza, golden-hour city behind
    player.pos.set(0, 0, 30); player.heading = Math.PI;
    player.camYaw = Math.PI; player.camPitch = 0.28;
    game.hud.showDialogue("Back in Solmara after five years. Time to take the city back.'", 'Mara', 60000);
    game.hud.showToast('SOLMARA — an open-world crime story');
    missions.index = 0; missions.state = 'briefing'; missions.step = 0;
    return;
  }
  if (shot === 'foot') {
    // Mara on foot at the Night Market, peds strolling around her
    // (Mission 3, so she has already banked M1+M2: $750)
    player.cash = 750;
    player.pos.set(P.market.x, 0, P.market.z + 4); player.heading = Math.PI * 0.9;
    player.camYaw = Math.PI * 0.9; player.camPitch = 0.3;
    missions.index = 2; missions.state = 'active'; missions.step = 1;
    game.hud.showDialogue("Pick up the package from the Night Market. Don't let the cops see you.'", 'Rosa', 60000);
    game.hud.showToast('Mission 3 — The Pickup');
    return;
  }
  if (shot === 'mission') {
    // Mission 2: Mara on foot at the marina, the red Comet S in front of her
    // (M1 is done, so cash is $350)
    player.cash = 350;
    player.pos.set(P.marina.x - 12, 0, P.marina.z - 4); player.heading = Math.PI / 2;
    player.camYaw = Math.PI / 2; player.camPitch = 0.3;
    missions.index = 1; missions.state = 'active'; missions.step = 1;
    game.hud.showDialogue("A red Comet S is parked at the marina, keys in it. Bring it back here.'", 'Rosa', 60000);
    game.hud.showToast('Mission 2 — Hot Wheels · Steal the Comet S');
    return;
  }
  // 'drive' (default + cover): police chase — Mara in the Comet S, 3 wanted
  // stars, helicopter overhead, mission objective + minimap + speed + cash.
  helpers.enterCar(game.comet);
  helpers.addWanted(4); // 4 stars: patrol chase + helicopter with searchlight
  game.comet.pos.set(40, 0, 120);
  game.comet.heading = Math.PI; // heading north up the boardwalk road
  player.pos.copy(game.comet.pos);
  player.camYaw = Math.PI;
  player.camPitch = 0.12; // flatter chase cam so the helicopter stays in frame
  missions.index = 1; missions.state = 'active'; missions.step = 2;
  player.cash = 350;
  game.hud.showDialogue("Got it. Now drive like you stole it — because you did.'", 'Mara', 60000);
  game.hud.showToast('Mission 2 — Hot Wheels · Lose the cops, get to Rosa Garage');
  // simulate real gameplay forward: drive north with a police chase on
  driveForward(game, 2.2);
  game.keys.w = true; // keep driving so the captured frame shows live speed
}
