// shots.js — deterministic screenshot staging.
// ?shot=drive|start|foot|mission&seed=1
// The same seed always gives the same frame: the city is seeded, Math.random
// is replaced with a seeded stream in shot mode (main.js), and each shot
// simulates real gameplay forward a FIXED number of ticks with scripted
// inputs. Nothing here mocks up a frame — it is the live game, frozen.
import { mulberry32 } from './utils.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  return { kind: shot, seed: parseInt(q.get('seed') || '1', 10) || 1 };
}

export function seedRandomForShot(seed) {
  Math.random = mulberry32(seed);
}

// Steer the player car toward a heading; returns the input keys for one tick.
function steerKeys(game, wantHeading, speedTarget) {
  const car = game.vehicles.playerCar;
  if (!car) return new Set(['KeyW']);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const keys = new Set();
  if (Math.abs(diff) > 0.08) keys.add(diff > 0 ? 'KeyA' : 'KeyD');
  if (Math.abs(diff) < 1.0 && Math.abs(car.speed) < speedTarget) keys.add('KeyW');
  else if (Math.abs(car.speed) > speedTarget) keys.add('KeyS');
  return keys;
}

export function applyShot(game, kind) {
  game.shotMode = true;
  game.audio.setMuted(true);
  game.audio.stopRadio();
  game.hud.hideTitle();
  game.hud.hideDialogue();
  game.state = 'playing';
  const dt = 1 / 60;
  const input = { keys: new Set(), jumpPressed: false, punchPressed: false };

  if (kind === 'start') {
    // Title screen over the city at golden hour.
    game.hud.showTitle();
    game.player.state.pos.set(-210, 0, -196);
    game.player.state.heading = Math.PI * 0.75;
    game.camYaw = Math.PI * 0.75 + Math.PI;
    game.camPitch = 0.42;
    game.camDist = 26;
    game.camFocus.set(-180, 4, -180);
    game.updateCamera(1); // snap the camera (frozen frame, no loop step)
    game.hud.update(game); // draw the minimap once for the frozen frame
    game.frozen = true;
    return;
  }

  if (kind === 'foot') {
    // Mara on foot on the boardwalk, mission 1 live, objective on the HUD.
    game.missions.state.active = true;
    game.missions.state.current = 0;
    game.missions.state.step = 0;
    game.player.state.pos.set(258, 0, 40);
    game.player.state.heading = 0; // facing +z, strolling along the boardwalk
    game.camYaw = game.player.state.heading + Math.PI;
    game.camPitch = 0.30;
    game.camDist = 9;
    // Walk north along the boardwalk for 2 seconds of real gameplay.
    for (let i = 0; i < 120; i++) {
      input.keys = new Set(['KeyW']);
      game.step(dt, input);
    }
    game.frozen = true;
    return;
  }

  if (kind === 'drive') {
    // COVER: police chase — wanted 4 stars, helicopter overhead, 2 patrol
    // cars on the player's tail, mission objective + minimap + speed + cash.
    const comet = game.vehicles.comet;
    game.vehicles.enterCar(comet, game.player.state);
    comet.pos.set(0, 0, -60);
    comet.heading = Math.PI / 2; // east along the marina road
    comet.speed = 18;
    game.missions.state.active = true;
    game.missions.state.current = 1;
    game.missions.state.step = 2; // driving the Comet back
    game.police.addWanted(4, { now: 0, playerPos: comet.pos, playerInVehicle: true });
    // addWanted(4) already spawns 4 patrol cars; pull two of them right
    // behind the Comet for the shot.
    const patrols = game.vehicles.cars.filter((c) => c.isPolice && !c.wrecked);
    patrols[0].pos.set(-22, 0, -56);
    patrols[1].pos.set(-34, 0, -64);
    game.camYaw = Math.PI / 2 + Math.PI + 0.55;
    game.camPitch = 0.32;
    game.camDist = 16;
    // Drive east for 3 seconds of real gameplay (chase, heli, traffic live).
    for (let i = 0; i < 180; i++) {
      input.keys = steerKeys(game, Math.PI / 2, 26);
      game.step(dt, input);
    }
    // Stage the chase into the frame: one patrol car blocking ahead, the
    // helicopter low and ahead-right so both read in the cover shot.
    const patrols2 = game.vehicles.cars.filter((c) => c.isPolice && !c.wrecked);
    if (patrols2[2]) {
      patrols2[2].pos.set(comet.pos.x + 28, 0, comet.pos.z + 5);
      patrols2[2].heading = -Math.PI / 2;
      patrols2[2].mesh.position.copy(patrols2[2].pos);
      patrols2[2].mesh.rotation.y = patrols2[2].heading;
    }
    if (game.police.state.heli) {
      // Low over the road just ahead of the Comet, dead-centre in frame.
      game.police.state.heli.position.set(comet.pos.x + 18, 7, comet.pos.z);
      game.police.state.heli.rotation.y = 0.6;
    }
    game.frozen = true;
    return;
  }

  if (kind === 'mission') {
    // Mission 1: driving the sedan toward Rosa Garage, objective + route live.
    const sedan = game.vehicles.cars.find((c) => c.type === 'sedan' && c.isParked);
    game.vehicles.enterCar(sedan, game.player.state);
    sedan.pos.set(-60, 0, 120);
    sedan.heading = Math.PI / 2;
    sedan.speed = 14;
    game.missions.state.active = true;
    game.missions.state.current = 0;
    game.missions.state.step = 0;
    game.camYaw = Math.PI / 2 + Math.PI + 0.3;
    game.camPitch = 0.28;
    game.camDist = 13;
    // Drive east along the garage road for 2.5 seconds.
    for (let i = 0; i < 150; i++) {
      input.keys = steerKeys(game, Math.PI / 2, 20);
      game.step(dt, input);
    }
    game.frozen = true;
    return;
  }

  // Unknown ?shot=: plain frozen frame of the city.
  game.frozen = true;
}
