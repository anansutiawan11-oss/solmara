// Screenshot scenes behind ?shot=start|drive|foot|mission. Each one plays the
// real rules forward from a fresh world for a fixed number of steps with a
// scripted input, so the frame is what real play looks like — and the same
// seed always gives the same frame.
import { makeCarMesh } from './vehicles.js';

const STEP = 1 / 60;

function driveInput() {
  return { forward: true, back: false, left: false, right: false, sprint: false, jump: false, handbrake: false };
}
function walkInput() {
  return { forward: true, back: false, left: false, right: false, sprint: true, jump: false, handbrake: false };
}

/** Run the real update loop forward for `seconds` with a scripted input. */
function simulate(game, seconds, input) {
  game.scriptedInput = input;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i++) game.update(STEP);
  game.scriptedInput = null;
}

function setCamera(game, yaw, pitch, dist) {
  game.camYaw = yaw;
  game.camPitch = pitch;
  game.camDistWant = dist;
  game.camDist = dist;
  game.updateCamera(1);
  game.updateCamera(1);
}

/** Put the player in a fresh parked car of `kind`/`color` at (x, z). */
function giveCar(game, kind, color, x, z, heading, maxSpeed) {
  const mesh = makeCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  game.scene.add(mesh);
  const car = { mesh, x, z, heading, kind, id: 'shot-' + kind, maxSpeed, health: 100 };
  game.parked.push(car);
  game.enterCar(car);
  return car;
}

export function stageShot(name, game, seed = 1) {
  game.resetWorld(seed);
  game.cash = 2450;
  const title = document.getElementById('title-screen');
  const hud = document.getElementById('hud');

  if (name === 'start') {
    // Title screen over a golden-hour avenue: street level, facades both
    // sides, the road running west toward the sun at the card's left edge.
    game.state = 'title';
    game.camera.position.set(140, 6, 168);
    game.camera.lookAt(-200, 18, 100);
    game.render();
    return;
  }

  title.classList.add('hidden');
  game.state = 'play';
  game.hud.show();

  if (name === 'drive') {
    // Police chase: Mara in Kane's limo, 4 stars, helicopter overhead, two
    // patrol cars on her tail, racing down the beachfront avenue.
    game.missions.start(6); // King of Solmara (step 0 spawns the casino limo)
    game.clearMissionCar(); // we drive our own limo for the shot
    game.missions.active.step = 1;
    game.missions.setupStep(); // escape leg: adds the 4-star heat
    giveCar(game, 'limo', 0x111114, 224, 96, Math.PI, 38);
    game.playerCar.speed = 30;
    simulate(game, 5, driveInput());
    // stage the chase into the frame: a roadblock cruiser ahead, the
    // helicopter hanging over the road in front of the limo.
    const px = game.playerCar.x, pz = game.playerCar.z;
    const block = game.police.cars[0];
    if (block) {
      block.x = px - 5; block.z = pz - 38;
      block.heading = 0;
      block.speed = 0;
      block.mesh.position.set(block.x, 0, block.z);
      block.mesh.rotation.y = block.heading;
    }
    if (game.police.heli) {
      const h = game.police.heli;
      h.x = px + 24; h.z = pz - 32;
      h.y = 15; // the update loop re-applies h.y every frame
      h.group.position.set(h.x, h.y, h.z);
      h.group.rotation.y = Math.PI;
    }
    setCamera(game, game.playerCar.heading + Math.PI, 0.32, 12);
  } else if (name === 'foot') {
    // On foot down the avenue: traffic, pedestrians, a patrol car closing in,
    // the delivery beacon glowing over Plaza Verde.
    game.missions.start(4); // The Drop
    game.missions.active.step = 1; // deliver leg
    game.player.setPosition(4, -96, Math.PI);
    game.camYaw = Math.PI;
    game.police.addHeat(1);
    game.hud.dialogue('Iris Duarte', 'Walk, do not run. The package goes to Plaza Verde — the square is watched.');
    simulate(game, 4, walkInput());
    setCamera(game, Math.PI, 0.3, 8);
  } else if (name === 'mission') {
    // Beach Run: mid-race on the beachfront avenue, rivals ahead, gate beacon lit.
    game.missions.start(3); // Beach Run
    giveCar(game, 'sport', 0xd81f2a, 224, -168, 0, 48);
    game.playerCar.speed = 20;
    simulate(game, 5, driveInput());
    setCamera(game, game.playerCar.heading + Math.PI, 0.3, 12);
  } else {
    // unknown shot name: plain play frame downtown
    game.player.setPosition(4, 40, Math.PI);
    simulate(game, 3, walkInput());
    setCamera(game, Math.PI, 0.3, 8);
  }
  hud.classList.remove('hidden');
  game.update(STEP);
  game.render();
}
