// city.js — procedural golden-hour coastal city of Solmara (seeded layout).
// 9x9 road grid, ~120 buildings with lit facades, beach + ocean + boardwalk,
// palms, lamps, market stalls, casino, garage, safehouse, named places.
import { makeRng, clamp, facadeTexture, roadTexture, neonTexture } from './utils.js';

export const GRID = 9;          // roads per axis
export const BLOCK = 40;        // block pitch (m)
export const ROAD_W = 12;       // road width (m)
export const HALF = (GRID * BLOCK) / 2; // 180 — city edge
export const BEACH_Z = HALF + 26;       // sand starts here
export const SEA_Z = HALF + 90;         // ocean plane centre

// Road centre lines: -160, -120, ..., 160
export const roadLines = () => { const a = []; for (let i = 0; i < GRID; i++) a.push(-HALF + BLOCK / 2 + i * BLOCK); return a; };

export function buildCity(THREE, scene, seed) {
  const rng = makeRng(seed);
  const lines = roadLines();
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);
  const colliders = [];   // {x,z,hw,hd} AABBs the player/cars push out of
  const buildings = [];   // {x,z,w,d,h,kind}
  const places = {};

  // --- sky, sun, fog: golden hour ---
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x3a4a6b, 0.85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb347, 1.6);
  sun.position.set(-120, 90, -140); sun.castShadow = false; scene.add(sun);
  scene.fog = new THREE.Fog(0xf2a65a, 260, 720);
  scene.background = new THREE.Color(0xf7b267);
  // gradient sky dome
  const skyGeo = new THREE.SphereGeometry(700, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0xf7b267, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  sunDisc.position.set(-260, 120, -420); sunDisc.lookAt(0, 60, 0); scene.add(sunDisc);

  // --- ground: grass/concrete base, roads, beach, ocean ---
  const base = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 260, HALF * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0x8a7f6a }));
  base.rotation.x = -Math.PI / 2; base.position.set(0, -0.05, 40); group.add(base);

  const roadTex = roadTexture(THREE);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadGeoX = new THREE.PlaneGeometry(HALF * 2, ROAD_W);
  const roadGeoZ = new THREE.PlaneGeometry(ROAD_W, HALF * 2);
  for (const l of lines) {
    const rx = new THREE.Mesh(roadGeoX, roadMat); rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.01, l); group.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMat); rz.rotation.x = -Math.PI / 2; rz.position.set(l, 0.01, 0); group.add(rz);
  }
  // sidewalks (pale strips along every road)
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9a98c });
  for (const l of lines) {
    const sx = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 3), walkMat);
    sx.rotation.x = -Math.PI / 2; sx.position.set(0, 0.02, l + ROAD_W / 2 + 1.5); group.add(sx);
    const sz = new THREE.Mesh(new THREE.PlaneGeometry(3, HALF * 2), walkMat);
    sz.rotation.x = -Math.PI / 2; sz.position.set(l + ROAD_W / 2 + 1.5, 0.02, 0); group.add(sz);
  }
  // beach sand + ocean
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 260, 64),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9e }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, BEACH_Z + 6); group.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 220),
    new THREE.MeshLambertMaterial({ color: 0x2e7f9e }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, SEA_Z + 60); group.add(sea);
  // animated-ish foam strip
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 260, 3),
    new THREE.MeshBasicMaterial({ color: 0xdff4f7 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.05, BEACH_Z + 34); group.add(foam);
  // boardwalk along the beach edge
  const board = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.6, 8),
    new THREE.MeshLambertMaterial({ color: 0x9c6b3f }));
  board.position.set(0, 0.3, BEACH_Z - 6); group.add(board);

  // --- buildings: one or two per block, seeded ---
  const palette = ['#c98f5f', '#b5764f', '#d9a441', '#7d8aa0', '#a05f6e', '#5f7d6e', '#8c6fb0', '#c96f4a'];
  const litColors = ['#ffd98a', '#ffb36b', '#fff3c4'];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < GRID - 1; i++) for (let j = 0; j < GRID - 1; j++) {
    const cx = lines[i] + BLOCK / 2, cz = lines[j] + BLOCK / 2;
    // keep the central plaza + safehouse block open
    if (i === 4 && j === 4) continue;
    if (i === 0 && j === 0) continue; // garage block handled below
    const n = rng.chance(0.35) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const ox = n === 2 ? (k === 0 ? -8 : 8) : 0;
      const oz = n === 2 ? (k === 0 ? -8 : 8) : 0;
      const w = rng.range(14, 20), d = rng.range(14, 20);
      const h = rng.range(9, 34);
      const base = rng.pick(palette), lit = rng.pick(litColors);
      const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(THREE, rng, base, lit) });
      const m = new THREE.Mesh(boxGeo, mat);
      m.scale.set(w, h, d);
      m.position.set(cx + ox, h / 2, cz + oz);
      group.add(m);
      // rooftop box
      if (rng.chance(0.5)) {
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x4a4038 }));
        roof.scale.set(w * 0.3, 2, d * 0.3); roof.position.set(cx + ox, h + 1, cz + oz); group.add(roof);
      }
      buildings.push({ x: cx + ox, z: cz + oz, w, d, h, kind: 'tower' });
      colliders.push({ x: cx + ox, z: cz + oz, hw: w / 2, hd: d / 2 });
    }
  }

  // --- named places ---
  // Safehouse: small villa at (-140, -140); the yard in front is the spawn point
  places.safehouse = { x: -140, z: -124, name: 'Safehouse' };
  const house = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }));
  house.scale.set(16, 7, 12); house.position.set(-140, 3.5, -140); group.add(house);
  const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(11, 4, 4),
    new THREE.MeshLambertMaterial({ color: 0xa34a2a }));
  houseRoof.position.set(-140, 9, -140); houseRoof.rotation.y = Math.PI / 4; group.add(houseRoof);
  colliders.push({ x: -140, z: -140, hw: 8, hd: 6 });
  // plaza fountain at the centre block (20,20) — never on a road
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 16),
    new THREE.MeshLambertMaterial({ color: 0x7fb2c9 }));
  fountain.position.set(20, 0.6, 20); group.add(fountain);
  colliders.push({ x: 20, z: 20, hw: 8, hd: 8 });
  places.plaza = { x: 20, z: 20, name: 'Solmara Plaza' };

  // Rosa Garage: block centre (-140,140); the mission target is the forecourt
  // in front of its doors, (-140,126) — reachable from the z=120 road
  places.garage = { x: -140, z: 126, name: 'Rosa Garage' };
  const gar = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3f6fb5 }));
  gar.scale.set(24, 8, 16); gar.position.set(-140, 4, 140); group.add(gar);
  const garSign = new THREE.Mesh(new THREE.PlaneGeometry(20, 4),
    new THREE.MeshBasicMaterial({ map: neonTexture(THREE, 'ROSA GARAGE', '#ff5a5a') }));
  garSign.position.set(-140, 8.5, 131.5); group.add(garSign);
  colliders.push({ x: -140, z: 140, hw: 12, hd: 8 });

  // Marina on the beach east end; the red Comet S parks here
  places.marina = { x: 120, z: BEACH_Z - 2, name: 'Marina' };
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 46),
    new THREE.MeshLambertMaterial({ color: 0x8a5a33 }));
  pier.position.set(120, 0.4, BEACH_Z + 22); group.add(pier);
  // Casino with neon on the boardwalk west end; target is the front steps
  places.casino = { x: -140, z: BEACH_Z - 28, name: 'Casino Sol' };
  const cas = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x5a2a6e }));
  cas.scale.set(30, 16, 18); cas.position.set(-140, 8, BEACH_Z - 14); group.add(cas);
  const casSign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6),
    new THREE.MeshBasicMaterial({ map: neonTexture(THREE, 'CASINO SOL', '#ff2fd6') }));
  casSign.position.set(-140, 17, BEACH_Z - 23); group.add(casSign);
  colliders.push({ x: -140, z: BEACH_Z - 14, hw: 15, hd: 9 });

  places.beach = { x: 40, z: BEACH_Z + 12, name: 'Solmara Beach' };
  places.market = { x: 100, z: 60, name: 'Night Market' }; // block centre, stalls stay off the roads
  places.drop = { x: 160, z: -120, name: 'The Drop' };
  places.finish = { x: 0, z: BEACH_Z + 4, name: 'Boardwalk Finish' };

  // --- palms along beach + boardwalk ---
  const palmTrunk = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const palmLeaf = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  function palm(x, z) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), palmTrunk);
    t.position.y = 3.5; g.add(t);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), palmLeaf);
      leaf.position.y = 7.4; leaf.rotation.z = 1.1; leaf.rotation.y = (i / 5) * Math.PI * 2;
      leaf.position.x = Math.cos((i / 5) * Math.PI * 2) * 1.2;
      leaf.position.z = Math.sin((i / 5) * Math.PI * 2) * 1.2;
      g.add(leaf);
    }
    g.position.set(x, 0, z); group.add(g);
  }
  for (let x = -170; x <= 170; x += 28) { palm(x, BEACH_Z - 12); if (rng.chance(0.6)) palm(x + 12, BEACH_Z + 20); }
  for (let i = 0; i < 10; i++) palm(rng.range(-160, 160), rng.range(-160, 160));

  // --- street lamps at intersections ---
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  for (const lx of lines) for (const lz of lines) {
    if (!rng.chance(0.5)) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), poleMat);
    pole.position.set(lx + 8, 3, lz + 8); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
    bulb.position.set(lx + 8, 6.2, lz + 8); group.add(bulb);
  }

  // --- market stalls near the market place ---
  const stallColors = [0xd94f3d, 0x3d8fd9, 0x3dd97a, 0xe8b93a];
  for (let i = 0; i < 6; i++) {
    const sx = places.market.x - 14 + (i % 3) * 14, sz = places.market.z + (i < 3 ? -6 : 6);
    const stall = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: stallColors[i % 4] }));
    stall.scale.set(8, 0.6, 6); stall.position.set(sx, 3.2, sz); group.add(stall);
    const legs = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
    legs.scale.set(7, 3, 5); legs.position.set(sx, 1.5, sz); group.add(legs);
    colliders.push({ x: sx, z: sz, hw: 4, hd: 3 });
  }

  // Road graph: nodes at intersections, edges along lines (for traffic AI).
  const nodes = [];
  const nodeAt = (i, j) => nodes[j * GRID + i];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++)
    nodes.push({ x: lines[i], z: lines[j], i, j });
  const edges = [];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    if (i + 1 < GRID) edges.push([nodeAt(i, j), nodeAt(i + 1, j)]);
    if (j + 1 < GRID) edges.push([nodeAt(i, j), nodeAt(i, j + 1)]);
  }
  return { group, colliders, buildings, places, nodes, edges, lines, seed,
    bounds: { minX: -HALF - 10, maxX: HALF + 10, minZ: -HALF - 10, maxZ: BEACH_Z + 44 } };
}

// Push a circle (x,z,r) out of every building AABB. Returns corrected {x,z}.
export function resolveCollisions(city, x, z, r) {
  for (const c of city.colliders) {
    const nx = clamp(x, c.x - c.hw, c.x + c.hw);
    const nz = clamp(z, c.z - c.hd, c.z + c.hd);
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) { const d = Math.sqrt(d2); x = nx + (dx / d) * r; z = nz + (dz / d) * r; }
      else { x += r; }
    }
  }
  x = clamp(x, city.bounds.minX, city.bounds.maxX);
  z = clamp(z, city.bounds.minZ, city.bounds.maxZ);
  return { x, z };
}
