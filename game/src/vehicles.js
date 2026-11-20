// vehicles.js — box-built cars (sedan/sport/taxi/truck/limo/police), traffic AI
// on the road graph (lane offsets, car-following, braking for the player),
// arcade driving, collisions, damage/wrecks. M2: collision damage is gentle
// so a careful drive arrives with comfortable health.
import { clamp, lerp, angleDiff, angleLerp, dist2, makeRng } from './utils.js';
import { resolveCollisions } from './city.js';

export const CAR_TYPES = {
  sedan:   { color: 0x8a9ab0, accel: 14, maxSpeed: 26, turn: 2.1, len: 4.4, hp: 100 },
  sport:   { color: 0xd92020, accel: 20, maxSpeed: 38, turn: 2.5, len: 4.2, hp: 100 },
  taxi:    { color: 0xe8b93a, accel: 13, maxSpeed: 24, turn: 2.1, len: 4.4, hp: 100 },
  truck:   { color: 0x6b7a5a, accel: 9,  maxSpeed: 19, turn: 1.6, len: 6.0, hp: 140 },
  limo:    { color: 0x1a1a22, accel: 12, maxSpeed: 27, turn: 1.8, len: 6.4, hp: 120 },
  police:  { color: 0x1a2a4a, accel: 17, maxSpeed: 33, turn: 2.4, len: 4.4, hp: 120 },
};

let nextId = 1;
export function buildCarMesh(THREE, type, opts = {}) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: opts.color ?? spec.color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });
  const L = spec.len, W = 2.0;
  const box = new THREE.BoxGeometry(1, 1, 1);
  function part(mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); return m;
  }
  part(bodyMat, W, 0.62, L, 0, 0.55, 0);                    // body
  part(glassMat, W * 0.86, 0.5, L * 0.42, 0, 1.05, -L * 0.06); // cabin
  part(bodyMat, W * 0.9, 0.18, L * 0.46, 0, 1.28, -L * 0.06);  // roof
  part(darkMat, W * 0.7, 0.2, 0.3, 0, 0.5, L / 2);          // grille/bumper front
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, L * 0.32], [0.95, L * 0.32], [-0.95, -L * 0.32], [0.95, -L * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w); wheels.push(w);
  }
  // headlights / taillights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  part(lightMat, 0.34, 0.16, 0.06, -0.6, 0.62, L / 2 + 0.01);
  part(lightMat, 0.34, 0.16, 0.06, 0.6, 0.62, L / 2 + 0.01);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  part(tailMat, 0.34, 0.16, 0.06, -0.6, 0.62, -L / 2 - 0.01);
  part(tailMat, 0.34, 0.16, 0.06, 0.6, 0.62, -L / 2 - 0.01);
  if (type === 'taxi') {
    const sign = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffe94a }));
    sign.scale.set(0.7, 0.22, 0.4); sign.position.set(0, 1.5, 0); g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bar.scale.set(0.9, 0.18, 0.3); bar.position.set(0, 1.45, -0.1); g.add(bar);
    const bar2 = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    bar2.scale.set(0.9, 0.18, 0.3); bar2.position.set(0, 1.45, 0.35); g.add(bar2);
  }
  return { group: g, wheels };
}

export function makeCar(THREE, scene, type, x, z, heading, opts = {}) {
  const spec = CAR_TYPES[type];
  const { group, wheels } = buildCarMesh(THREE, type, opts);
  group.position.set(x, 0, z); group.rotation.y = heading;
  scene.add(group);
  return {
    id: opts.id ?? ('car' + (nextId++)),
    type, spec, group, wheels,
    pos: new THREE.Vector3(x, 0, z), heading,
    speed: 0, health: opts.hp ?? spec.hp, maxHealth: opts.hp ?? spec.hp,
    wrecked: false, isPlayer: false, isMission: !!opts.isMission,
    ai: opts.ai ?? null, // {edge, t, dir, targetSpeed} for traffic
    brakeLight: false, smoke: 0,
  };
}

// --- player driving (arcade) ---
// keys: w/a/s/d + space (handbrake). Returns speed for HUD.
export function driveCar(car, keys, dt, city, others, audio) {
  if (car.wrecked) { car.speed *= Math.pow(0.2, dt); return; }
  const spec = car.spec;
  let accel = 0;
  if (keys.w) accel += spec.accel;
  if (keys.s) accel -= spec.accel * 0.7;
  if (keys.space) { car.speed *= Math.pow(0.05, dt); accel = 0; } // handbrake
  car.speed += accel * dt;
  // drag + rolling resistance
  car.speed -= car.speed * 0.55 * dt;
  if (!keys.w && !keys.s) car.speed -= Math.sign(car.speed) * 4 * dt;
  if (Math.abs(car.speed) < 0.15 && !keys.w && !keys.s) car.speed = 0;
  car.speed = clamp(car.speed, -spec.maxSpeed * 0.45, spec.maxSpeed);
  const steer = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += steer * spec.turn * dt * clamp(Math.abs(car.speed) / 6, 0, 1) * dir;
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  // building collision: gentle scrape, M2 — small damage, strong slide
  const before = { x: car.pos.x, z: car.pos.z };
  const r = resolveCollisions(city, nx, nz, 1.6);
  const hitWall = Math.hypot(r.x - nx, r.z - nz) > 0.01;
  car.pos.x = r.x; car.pos.z = r.z;
  if (hitWall && Math.abs(car.speed) > 8) {
    // scrape: tiny damage, rate-limited, so a routine drive never wrecks the car (M2)
    car.scrapeCd = (car.scrapeCd || 0) - dt;
    if (car.scrapeCd <= 0) { damageCar(car, 0.5, audio); car.scrapeCd = 0.8; }
    car.speed *= 0.55;
  }
  // car-car collisions (player car vs traffic): soft bump, low damage
  for (const o of others) {
    if (o === car || o.wrecked) continue;
    const d = dist2(car.pos.x, car.pos.z, o.pos.x, o.pos.z);
    if (d < 3.4) {
      const push = (3.4 - d) / 2;
      const dx = (car.pos.x - o.pos.x) / (d || 1), dz = (car.pos.z - o.pos.z) / (d || 1);
      car.pos.x += dx * push; car.pos.z += dz * push;
      o.pos.x -= dx * push; o.pos.z -= dz * push;
      const rel = Math.abs(car.speed - o.speed);
      if (rel > 6) { // soft bump: small, rate-limited damage (M2)
        car.bumpCd = (car.bumpCd || 0) - dt;
        if (car.bumpCd <= 0) {
          damageCar(car, Math.min(1, rel * 0.06), audio);
          damageCar(o, Math.min(1, rel * 0.06), null);
          car.bumpCd = 0.5;
        }
      }
      car.speed *= 0.7; o.speed *= 0.7;
    }
  }
  car.group.position.copy(car.pos);
  car.group.rotation.y = car.heading;
  // wheel spin
  const spin = car.speed * dt * 2.2;
  for (const w of car.wheels) w.rotation.x += spin;
}

export function damageCar(car, amount, audio) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) { car.health = 0; car.wrecked = true; if (audio) audio.crash(); }
}

// --- traffic AI ---
export function spawnTraffic(THREE, scene, city, count, seed) {
  const rng = makeRng(seed + 77);
  const types = ['sedan', 'sedan', 'taxi', 'truck', 'limo', 'sedan'];
  const cars = [];
  for (let i = 0; i < count; i++) {
    const edge = city.edges[Math.floor(rng.next() * city.edges.length)];
    const t = rng.next();
    const x = edge[0].x + (edge[1].x - edge[0].x) * t;
    const z = edge[0].z + (edge[1].z - edge[0].z) * t;
    const heading = Math.atan2(edge[1].x - edge[0].x, edge[1].z - edge[0].z);
    const type = rng.pick(types);
    const car = makeCar(THREE, scene, type, x, z, heading, { ai: { edge, t, dir: 1 } });
    // lane offset: drive on the right side of the road
    const perp = heading + Math.PI / 2;
    car.pos.x += Math.cos(perp) * 2.6; car.pos.z += Math.sin(perp) * 2.6;
    car.speed = rng.range(8, 13);
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(cars, dt, city, playerCar, playerPos) {
  for (const car of cars) {
    if (car.wrecked || !car.ai) continue;
    const ai = car.ai;
    // next node along the edge
    const target = ai.dir > 0 ? ai.edge[1] : ai.edge[0];
    const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    car.heading = angleLerp(car.heading, wantHeading, clamp(dt * 2.2, 0, 1));
    // car-following: brake if a car (or the player car / player) is ahead
    let targetSpeed = 11;
    const aheadX = car.pos.x + Math.sin(car.heading) * 7;
    const aheadZ = car.pos.z + Math.cos(car.heading) * 7;
    for (const o of cars) {
      if (o === car || o.wrecked) continue;
      if (dist2(aheadX, aheadZ, o.pos.x, o.pos.z) < 5) { targetSpeed = 0; break; }
    }
    if (playerCar && !playerCar.wrecked && dist2(aheadX, aheadZ, playerCar.pos.x, playerCar.pos.z) < 5) targetSpeed = 0;
    if (playerPos && dist2(aheadX, aheadZ, playerPos.x, playerPos.z) < 4.5) targetSpeed = 0;
    car.speed = lerp(car.speed, targetSpeed, clamp(dt * 1.5, 0, 1));
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    if (d < 6) { // reached the node: pick a new edge continuing from it
      const node = target;
      const next = city.edges.filter(e => e[0] === node || e[1] === node);
      // deterministic pick (seeded by arrival count) so ?shot= frames are stable
      ai.picks = (ai.picks || 0) + 1;
      const pick = next[ai.picks % next.length] || ai.edge;
      ai.edge = pick; ai.dir = pick[0] === node ? 1 : -1;
    }
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    const spin = car.speed * dt * 2.2;
    for (const w of car.wheels) w.rotation.x += spin;
  }
}
