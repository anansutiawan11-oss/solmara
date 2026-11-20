// Solmara: a procedural golden-hour coastal city. A 9x9 road grid, dusk-lit
// towers, a beach and ocean on the east edge, palms, lamps and the named places
// the story drives to. All art is boxes plus canvas textures — no assets.
import * as THREE from 'three';
import { mulberry32, pick, range, canvasTexture } from './utils.js';

export const PITCH = 56; // block + road, centre to centre
export const ROAD_W = 12;
export const GRID_N = 4; // roads at -4..4 * PITCH
export const CITY_HALF = GRID_N * PITCH + ROAD_W / 2; // 230
export const BEACH_X = CITY_HALF + 14; // sand starts here
export const OCEAN_X = BEACH_X + 40;

export const ROADS = [];
for (let i = -GRID_N; i <= GRID_N; i++) ROADS.push(i * PITCH);

// Named places the story uses.
export const PLACES = {
  garage: { x: -52, z: 168, name: 'Rosa Garage' },
  safehouse: { x: -168, z: -112, name: 'Safehouse' },
  marina: { x: 196, z: 168, name: 'Marina' },
  casino: { x: 112, z: -168, name: "Kane's Palms Casino" },
  market: { x: 28, z: -28, name: 'Mercado Square' },
  club: { x: 56, z: 224, name: 'Club Lumen' },
  beach: { x: 268, z: 28, name: 'Playa Sol' },
  plaza: { x: -112, z: 56, name: 'Plaza Verde' },
};

function facadeTexture(base, litRatio, rng) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // faint vertical weathering
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`;
      g.fillRect(rng() * w, 0, 2 + rng() * 6, h);
    }
    // window grid, some lit warm
    const cols = 6;
    const rows = 10;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#20242e';
        g.fillRect(c * cw + 6, r * ch + 8, cw - 12, ch - 16);
        if (lit) {
          g.fillStyle = 'rgba(255,190,90,0.55)';
          g.fillRect(c * cw + 6, r * ch + 8, cw - 12, 3);
        }
      }
    }
  });
}

function roadTexture() {
  // Speckles use Math.random on purpose: the seeded stream below lays out the
  // city, and road noise must not consume from it (the layout is seed-stable).
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3d3d47';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#e8c85a';
    g.fillRect(w / 2 - 2, 0, 4, 26);
    g.fillRect(w / 2 - 2, 64, 4, 26);
  });
}

function sandTexture(rng) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#d9b380';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(120,80,30,${0.05 + rng() * 0.08})`;
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
  }, 6, 6);
}

function waterTexture(rng) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#14607a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(180,230,240,${0.12 + rng() * 0.2})`;
      g.lineWidth = 1 + rng() * 2;
      g.beginPath();
      const y = rng() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + rng() * 8 - 4, w * 0.7, y + rng() * 8 - 4, w, y);
      g.stroke();
    }
  }, 8, 8);
}

function skyTexture() {
  return canvasTexture(16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#1b1440');
    grad.addColorStop(0.35, '#5b2a63');
    grad.addColorStop(0.55, '#c65a4e');
    grad.addColorStop(0.68, '#ff9a4d');
    grad.addColorStop(0.78, '#ffc46b');
    grad.addColorStop(1.0, '#ffdf9e');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function buildCity(scene, seed = 7) {
  const rng = mulberry32(seed);
  const colliders = []; // {x, z, hw, hd} — building footprints
  const group = new THREE.Group();
  scene.add(group);

  // --- sky, sun, fog, lights ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(58, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }),
  );
  sun.position.set(-760, 240, 420);
  sun.lookAt(0, 60, 0);
  group.add(sun);
  scene.fog = new THREE.Fog(0xcf8a6a, 260, 820);

  scene.add(new THREE.HemisphereLight(0x8a6bb8, 0x4a3a2e, 1.05));
  const sunLight = new THREE.DirectionalLight(0xffb36b, 2.2);
  sunLight.position.set(-300, 190, 220);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x6b7bb8, 0.7);
  fill.position.set(300, 200, 300);
  scene.add(fill);

  // --- ground, roads, beach, ocean, boardwalk ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 24, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ color: 0x6a6258 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const roadTex = roadTexture();
  const span = CITY_HALF * 2 + 24;
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadTexV = roadTex.clone();
  roadTexV.rotation = Math.PI / 2;
  roadTexV.center.set(0.5, 0.5);
  roadTexV.needsUpdate = true;
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTexV });
  for (const c of ROADS) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_W), roadMatH);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.03, c);
    h.material.map.repeat.set(span / 14, 1);
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, span), roadMatV);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.03, 0);
    v.material.map.repeat.set(1, span / 14);
    group.add(v);
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(48, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ map: sandTexture(rng) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X + 17, 0.02, 0);
  group.add(sand);
  const waterTex = waterTexture(rng);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 1600),
    new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd8e8, shininess: 120, specular: 0xffc46b }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(OCEAN_X + 450, -0.15, 0);
  group.add(water);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(10, CITY_HALF * 2 + 24),
    new THREE.MeshLambertMaterial({ color: 0x8a6a48 }),
  );
  board.rotation.x = -Math.PI / 2;
  board.position.set(BEACH_X - 4, 0.04, 0);
  group.add(board);

  // --- buildings: one or two per block, taller near the centre ---
  const facades = [
    facadeTexture('#c9a37e', 0.45, rng),
    facadeTexture('#b0705a', 0.4, rng),
    facadeTexture('#7e8a94', 0.5, rng),
    facadeTexture('#d8c9a8', 0.35, rng),
    facadeTexture('#5f6f7e', 0.55, rng),
    facadeTexture('#a85f4e', 0.42, rng),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x2a3a4a, shininess: 90, specular: 0xffc46b });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const blocks = [];
  for (let ix = 0; ix < ROADS.length - 1; ix++) {
    for (let iz = 0; iz < ROADS.length - 1; iz++) {
      blocks.push({ cx: (ROADS[ix] + ROADS[ix + 1]) / 2, cz: (ROADS[iz] + ROADS[iz + 1]) / 2 });
    }
  }
  // the market square and the plaza stay open
  const openBlocks = new Set(['28,-28', '-28,28']);
  for (const b of blocks) {
    if (openBlocks.has(`${b.cx},${b.cz}`)) continue;
    const tall = Math.hypot(b.cx, b.cz) < 130;
    const count = rng() < 0.45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const w = range(rng, 16, 26);
      const d = range(rng, 16, 26);
      const h = tall ? range(rng, 18, 52) : range(rng, 8, 26);
      const ox = count === 1 ? 0 : k === 0 ? -9 : 9;
      const oz = count === 1 ? 0 : k === 0 ? -8 : 8;
      const tex = pick(rng, facades).clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 11)));
      const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffb060, emissiveMap: tex, emissiveIntensity: 0.5 });
      const m = new THREE.Mesh(boxGeo, mat);
      m.scale.set(w, h, d);
      m.position.set(b.cx + ox, h / 2, b.cz + oz);
      group.add(m);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w * 0.92, 1.2, d * 0.92);
      roof.position.set(b.cx + ox, h + 0.6, b.cz + oz);
      group.add(roof);
      if (h > 34) {
        const pent = new THREE.Mesh(boxGeo, glassMat);
        pent.scale.set(w * 0.4, 4, d * 0.4);
        pent.position.set(b.cx + ox, h + 3, b.cz + oz);
        group.add(pent);
      }
      colliders.push({ x: b.cx + ox, z: b.cz + oz, hw: w / 2, hd: d / 2 });
    }
  }

  // --- casino landmark: big block + two neon bands ---
  const casinoMap = facades[1].clone();
  casinoMap.needsUpdate = true;
  casinoMap.repeat.set(4, 3);
  const casino = new THREE.Mesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ map: casinoMap, emissive: 0xffb060, emissiveMap: casinoMap, emissiveIntensity: 0.6 }),
  );
  casino.scale.set(34, 22, 26);
  casino.position.set(PLACES.casino.x, 11, PLACES.casino.z);
  group.add(casino);
  colliders.push({ x: PLACES.casino.x, z: PLACES.casino.z, hw: 17, hd: 13 });
  for (const [color, y] of [[0xff4dd2, 20], [0x37e6ff, 16.5]]) {
    const neon = new THREE.Mesh(
      new THREE.BoxGeometry(30, 2.2, 0.6),
      new THREE.MeshBasicMaterial({ color }),
    );
    neon.position.set(PLACES.casino.x, y, PLACES.casino.z + 13.4);
    group.add(neon);
  }

  // --- garage + safehouse: small, distinct, easy to spot ---
  const garage = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3f6f8e }));
  garage.scale.set(22, 7, 16);
  garage.position.set(PLACES.garage.x, 3.5, PLACES.garage.z);
  group.add(garage);
  colliders.push({ x: PLACES.garage.x, z: PLACES.garage.z, hw: 11, hd: 8 });
  const gdoor = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffd166 }));
  gdoor.scale.set(10, 4.6, 0.4);
  gdoor.position.set(PLACES.garage.x, 2.3, PLACES.garage.z - 8.2);
  group.add(gdoor);
  const safe = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7e9a6a }));
  safe.scale.set(14, 6, 12);
  safe.position.set(PLACES.safehouse.x, 3, PLACES.safehouse.z);
  group.add(safe);
  colliders.push({ x: PLACES.safehouse.x, z: PLACES.safehouse.z, hw: 7, hd: 6 });
  const sdoor = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x37e6ff }));
  sdoor.scale.set(2.4, 4, 0.4);
  sdoor.position.set(PLACES.safehouse.x, 2, PLACES.safehouse.z - 6.2);
  group.add(sdoor);

  // --- market stalls on the open block centred at (28, -28) ---
  const stallColors = [0xff5d5d, 0xffd166, 0x37e6ff, 0x7dff9a, 0xff9a5d];
  for (let i = 0; i < 8; i++) {
    const sx = 28 - 16 + (i % 4) * 11;
    const sz = -28 - 10 + Math.floor(i / 4) * 20;
    const stall = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    stall.scale.set(8, 2.4, 5);
    stall.position.set(sx, 1.2, sz);
    group.add(stall);
    const awn = new THREE.Mesh(
      new THREE.ConeGeometry(5.4, 2.2, 4),
      new THREE.MeshLambertMaterial({ color: stallColors[i % stallColors.length] }),
    );
    awn.position.set(sx, 3.4, sz);
    awn.rotation.y = Math.PI / 4;
    group.add(awn);
    colliders.push({ x: sx, z: sz, hw: 4, hd: 2.5 });
  }

  // --- palms: a row along the beachfront, plus scattered ones ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x54a864, side: THREE.DoubleSide });
  const palmSpots = [];
  for (let z = -CITY_HALF + 20; z <= CITY_HALF - 20; z += 28) palmSpots.push([BEACH_X - 12, z]);
  for (let i = 0; i < 14; i++) {
    const b = pick(rng, blocks);
    palmSpots.push([b.cx + range(rng, -14, 14), b.cz + range(rng, -14, 14)]);
  }
  for (const [px, pz] of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = range(rng, -0.08, 0.08);
    palm.add(trunk);
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5.2, 4), leafMat);
      leaf.position.set(Math.cos(a) * 2.1, 7.0, Math.sin(a) * 2.1);
      leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      leaf.scale.set(1, 1, 0.22);
      palm.add(leaf);
    }
    palm.position.set(px, 0, pz);
    group.add(palm);
  }

  // --- street lamps at every other intersection ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e2e36 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  for (const x of ROADS) {
    for (const z of ROADS) {
      if ((Math.abs(x) + Math.abs(z)) % 112 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 6), poleMat);
      pole.position.set(x + 7.4, 3.2, z + 7.4);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat);
      head.position.set(x + 7.4, 6.5, z + 7.4);
      group.add(head);
    }
  }

  // --- beach umbrellas ---
  for (let i = 0; i < 9; i++) {
    const ux = BEACH_X + 8 + rng() * 24;
    const uz = -180 + rng() * 360;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), poleMat);
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const um = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 1.4, 8),
      new THREE.MeshLambertMaterial({ color: pick(rng, stallColors) }),
    );
    um.position.set(ux, 3.4, uz);
    group.add(um);
  }

  // road graph: a node at every intersection, for traffic + police
  const nodes = [];
  for (const x of ROADS) for (const z of ROADS) nodes.push({ x, z });

  return {
    group,
    colliders,
    nodes,
    places: PLACES,
    waterTex,
    update(dt) {
      waterTex.offset.x += dt * 0.008;
      waterTex.offset.y += dt * 0.003;
    },
  };
}

/** Push a circle (p.x, p.z, radius) out of every building collider. True if it hit. */
export function collideCircle(colliders, p, radius) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hw, Math.min(p.x, c.x + c.hw));
    const cz = Math.max(c.z - c.hd, Math.min(p.z, c.z + c.hd));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.001;
      const push = radius - d;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      hit = true;
    }
  }
  return hit;
}

/** Nearest road-graph node to a point. */
export function nearestNode(nodes, x, z) {
  let best = nodes[0];
  let bd = Infinity;
  for (const n of nodes) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}
