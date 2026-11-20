// city.js — procedural golden-hour coastal city of Solmara.
// Layout comes ONLY from the seeded RNG (deterministic per seed).
// Decorative noise (road speckles, grain) uses unseeded Math.random (B2) so it
// never consumes the seeded layout stream.
import * as THREE from 'three';
import { RNG, canvasTexture, colorTexture } from './utils.js';

export const ROAD_LINES = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const ROAD_W = 14;
export const BLOCK = 60;
export const CITY_MIN = -270, CITY_MAX = 270;
export const BEACH_X0 = 270, BEACH_X1 = 330, OCEAN_X = 330;

// Named places — the mission system and HUD read these.
export const PLACES = {
  safehouse: { name: 'Safehouse', x: -210, z: -210 },
  garage: { name: 'Rosa Garage', x: 90, z: 150 },
  marina: { name: 'Marina', x: 288, z: -60 },
  casino: { name: 'Solmara Royale Casino', x: 150, z: -150 },
  market: { name: 'Mercado Central', x: 0, z: 0 },
  beach: { name: 'Playa Dorada', x: 300, z: 60 },
  boardwalk: { name: 'Boardwalk', x: 262, z: 60 },
  hospital: { name: 'St. Mar Hospital', x: -150, z: 210 },
  pier: { name: 'Pier 9', x: 312, z: -60 },
};

function facadeTexture(THREE, rng, base, litRatio) {
  return canvasTexture(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // Subtle vertical shading.
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // Windows: golden-hour lit glass.
    const cols = 4, rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng.chance(litRatio);
        g.fillStyle = lit ? (rng.chance(0.6) ? '#ffd27a' : '#ff9e57') : '#2c3542';
        g.fillRect(10 + c * 30, 12 + r * 30, 18, 20);
      }
    }
    // Ground-floor shopfront glow on some buildings.
    if (rng.chance(0.4)) {
      g.fillStyle = '#ffb347';
      g.fillRect(0, h - 26, w, 26);
      g.fillStyle = '#1a1a22';
      g.fillRect(6, h - 22, w - 12, 18);
    }
  });
}

function roadTexture(THREE) {
  return canvasTexture(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = '#33333c'; g.fillRect(0, 0, w, h);
    // Decorative speckles — UNSEEDED Math.random on purpose (B2).
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Centre dashed line.
    g.fillStyle = '#e8c85a';
    for (let y = 0; y < h; y += 32) g.fillRect(w / 2 - 2, y, 4, 18);
  }, [1, 1]);
}

function sandTexture(THREE) {
  return canvasTexture(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = '#e8c98f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { // decorative grain: unseeded (B2)
      g.fillStyle = Math.random() < 0.5 ? 'rgba(180,140,80,0.25)' : 'rgba(255,240,200,0.25)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [6, 6]);
}

function neonSignTexture(THREE, text, color) {
  return canvasTexture(THREE, 512, 128, (g, w, h) => {
    g.fillStyle = '#14081f'; g.fillRect(0, 0, w, h);
    g.font = 'bold 64px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 28;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2);
  });
}

function makePalm(THREE, rng) {
  const palm = new THREE.Group();
  const trunkH = rng.range(5, 8);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.32, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 })
  );
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = rng.range(-0.12, 0.12);
  palm.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.4, trunkH + 0.2, Math.sin(a) * 1.4);
    leaf.rotation.set(Math.sin(a) * 0.9, -a + Math.PI / 2, Math.cos(a) * 0.2);
    leaf.rotation.y = -a;
    leaf.rotation.x = -0.7;
    palm.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a1f }));
  nut.position.y = trunkH - 0.2;
  palm.add(nut);
  return palm;
}

function makeLamp(THREE) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 }));
  pole.position.y = 3;
  g.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb347, emissiveIntensity: 1.6 }));
  bulb.position.y = 6.1;
  g.add(bulb);
  // No real PointLight per lamp: ~30 lamps would blow the forward renderer's
  // light budget. The emissive bulb + golden-hour sun carries the look.
  return g;
}

export function buildCity(THREE, seed = 1337) {
  const rng = new RNG(seed);
  const group = new THREE.Group();
  group.name = 'city';
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const buildings = [];
  const roads = ROAD_LINES.slice();

  // --- Ground: grass-ish city base, sand beach, ocean plane.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0x4a6b3f, roughness: 1 }));
  base.rotation.x = -Math.PI / 2; base.position.set(30, -0.1, 0);
  base.receiveShadow = true;
  group.add(base);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(BEACH_X1 - BEACH_X0 + 8, 620),
    new THREE.MeshStandardMaterial({ map: sandTexture(THREE), roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((BEACH_X0 + BEACH_X1) / 2, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(500, 900),
    new THREE.MeshStandardMaterial({ color: 0x1e6f8e, roughness: 0.25, metalness: 0.1 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 250, -0.35, 0);
  group.add(ocean);

  // Boardwalk planks.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 620),
    new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.95 }));
  board.rotation.x = -Math.PI / 2;
  board.position.set(261, 0.06, 0);
  board.receiveShadow = true;
  group.add(board);

  // --- Roads: dark strips + centre dashes, both directions.
  const roadTex = roadTexture(THREE);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  for (const r of roads) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(560, ROAD_W), roadMat.clone());
    h.material.map = roadTex.clone();
    h.material.map.repeat.set(9, 1);
    h.material.map.needsUpdate = true;
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.05, r);
    h.receiveShadow = true;
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 560), roadMat.clone());
    v.material.map = roadTex.clone();
    v.material.map.repeat.set(9, 1);
    v.material.map.needsUpdate = true;
    v.rotation.x = -Math.PI / 2; v.rotation.z = Math.PI / 2;
    v.position.set(r, 0.05, 0);
    v.receiveShadow = true;
    group.add(v);
  }

  // --- Sidewalk strips along every road (pale concrete).
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 });
  for (const r of roads) {
    for (const off of [-9.5, 9.5]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(560, 5), walkMat);
      s.rotation.x = -Math.PI / 2; s.position.set(0, 0.04, r + off);
      group.add(s);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 560), walkMat);
      s2.rotation.x = -Math.PI / 2; s2.position.set(r + off, 0.04, 0);
      group.add(s2);
    }
  }

  // --- Buildings: seeded per block. Special blocks are reserved.
  const palette = ['#c98f5f', '#b0764a', '#8f7d6b', '#a8564f', '#5f7d8a', '#7d8a5f', '#9c6b8a', '#6b7d9c'];
  const special = new Set(['-210,-210', '90,150', '150,-150', '0,0', '-150,210']);
  const blockCenters = [];
  for (let ix = 0; ix < 9; ix++) for (let iz = 0; iz < 9; iz++) blockCenters.push([-210 + ix * 60, -210 + iz * 60]);

  for (const [bx, bz] of blockCenters) {
    const key = `${bx},${bz}`;
    if (special.has(key)) continue;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      // Footprint stays clear of the roads: block half-width 30, road
      // half-width 7, so extent from the block centre must stay under ~21.
      // Offset ±8 + half-size 11 = 19 max. (A bigger footprint overhangs
      // the road surface and wedges cars driving the road edge.)
      const w = rng.range(14, 22), d = rng.range(14, 22), hgt = rng.range(12, 58);
      const ox = rng.range(-8, 8), oz = rng.range(-8, 8);
      const x = bx + ox, z = bz + oz;
      const color = rng.pick(palette);
      const tex = facadeTexture(THREE, rng, color, 0.55);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), mat);
      b.position.set(x, hgt / 2, z);
      b.castShadow = true; b.receiveShadow = true;
      group.add(b);
      // Flat roof cap.
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
        new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 1 }));
      roof.position.set(x, hgt + 0.4, z);
      group.add(roof);
      buildings.push({ x, z, w, d, h: hgt });
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // --- Safehouse: small warm house with porch + pink neon "MARA".
  const sh = new THREE.Group();
  const house = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.9 }));
  house.position.y = 3.5; house.castShadow = true;
  sh.add(house);
  const roofH = new THREE.Mesh(new THREE.ConeGeometry(11, 4, 4),
    new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 1 }));
  roofH.position.y = 9; roofH.rotation.y = Math.PI / 4;
  sh.add(roofH);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4),
    new THREE.MeshStandardMaterial({ color: 0x4a2c1a }));
  door.position.set(0, 2, 6.05);
  sh.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2),
    new THREE.MeshStandardMaterial({ map: neonSignTexture(THREE, 'MARA', '#ff6ec7'), emissive: 0xffffff, emissiveMap: neonSignTexture(THREE, 'MARA', '#ff6ec7') }));
  sign.position.set(0, 6, 6.15);
  sh.add(sign);
  sh.position.set(PLACES.safehouse.x, 0, PLACES.safehouse.z);
  group.add(sh);
  colliders.push({ minX: -218, maxX: -202, minZ: -216, maxZ: -204 });

  // --- Rosa Garage: wide low building, open bay, "ROSA GARAGE" sign.
  const gar = new THREE.Group();
  const gbody = new THREE.Mesh(new THREE.BoxGeometry(30, 9, 20),
    new THREE.MeshStandardMaterial({ color: 0x5f6b7a, roughness: 0.85 }));
  gbody.position.y = 4.5; gbody.castShadow = true;
  gar.add(gbody);
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(18, 6.5),
    new THREE.MeshStandardMaterial({ color: 0x14141c, emissive: 0xffc46b, emissiveIntensity: 0.25 }));
  bay.position.set(0, 3.4, 10.05);
  gar.add(bay);
  const gsign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3),
    new THREE.MeshStandardMaterial({ map: neonSignTexture(THREE, 'ROSA GARAGE', '#ffb347'), emissive: 0xffffff, emissiveMap: neonSignTexture(THREE, 'ROSA GARAGE', '#ffb347') }));
  gsign.position.set(0, 8.2, 10.15);
  gar.add(gsign);
  gar.position.set(PLACES.garage.x, 0, PLACES.garage.z);
  group.add(gar);
  colliders.push({ minX: 75, maxX: 105, minZ: 140, maxZ: 160 });

  // --- Casino: tall tower + neon sign + pink glow.
  const cas = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(26, 46, 22),
    new THREE.MeshStandardMaterial({ map: facadeTexture(THREE, rng, '#3a2a5f', 0.8), roughness: 0.8 }));
  tower.position.y = 23; tower.castShadow = true;
  cas.add(tower);
  const csign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5),
    new THREE.MeshStandardMaterial({ map: neonSignTexture(THREE, 'SOLMARA ROYALE', '#ff2e88'), emissive: 0xffffff, emissiveMap: neonSignTexture(THREE, 'SOLMARA ROYALE', '#ff2e88') }));
  csign.position.set(0, 40, 11.15);
  cas.add(csign);
  const glow = new THREE.PointLight(0xff2e88, 60, 60, 1.6);
  glow.position.set(0, 12, 14);
  cas.add(glow);
  cas.position.set(PLACES.casino.x, 0, PLACES.casino.z);
  group.add(cas);
  colliders.push({ minX: 137, maxX: 163, minZ: -161, maxZ: -139 });

  // --- Hospital (respawn point): white block with red cross sign.
  const hosp = new THREE.Group();
  const hbody = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 }));
  hbody.position.y = 9; hbody.castShadow = true;
  hosp.add(hbody);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(6, 6),
    new THREE.MeshStandardMaterial({ map: neonSignTexture(THREE, '+', '#ff3b30'), emissive: 0xffffff, emissiveMap: neonSignTexture(THREE, '+', '#ff3b30') }));
  cross.position.set(0, 12, 9.15);
  hosp.add(cross);
  hosp.position.set(PLACES.hospital.x, 0, PLACES.hospital.z);
  group.add(hosp);
  colliders.push({ minX: -162, maxX: -138, minZ: 201, maxZ: 219 });

  // --- Market plaza: stalls with striped awnings.
  const market = new THREE.Group();
  const awnColors = ['#e8574f', '#f2a541', '#4f9de8', '#5fbf6b'];
  for (let i = 0; i < 6; i++) {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 4),
      new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }));
    counter.position.y = 1;
    stall.add(counter);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 5),
      new THREE.MeshStandardMaterial({ color: awnColors[i % 4], roughness: 0.9 }));
    awn.position.y = 3.4; awn.rotation.z = 0.08;
    stall.add(awn);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(3, 1.7, 2);
    stall.add(pole);
    const pole2 = pole.clone(); pole2.position.set(-3, 1.7, 2);
    stall.add(pole2);
    stall.position.set(-18 + (i % 3) * 18, 0, -8 + Math.floor(i / 3) * 16);
    market.add(stall);
  }
  market.position.set(0, 0, 0);
  group.add(market);

  // --- Marina pier + moored boats.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 }));
  pier.position.set(PLACES.pier.x, 0.4, PLACES.pier.z);
  pier.castShadow = true;
  group.add(pier);
  for (let i = 0; i < 3; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 3.4),
      new THREE.MeshStandardMaterial({ color: [0xe8e8e8, 0x3a6bd8, 0xd84a4a][i], roughness: 0.6 }));
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    cabin.position.set(-1, 2.2, 0);
    boat.add(cabin);
    boat.position.set(PLACES.pier.x - 12 + i * 13, -0.2, PLACES.pier.z + 8);
    group.add(boat);
  }

  // --- Palms: beach row + scattered street palms (seeded).
  const palms = [];
  for (let z = -260; z <= 260; z += 40) {
    const p = makePalm(THREE, rng);
    p.position.set(274 + rng.range(-2, 2), 0, z + rng.range(-6, 6));
    group.add(p); palms.push(p);
  }
  for (let i = 0; i < 26; i++) {
    const p = makePalm(THREE, rng);
    const along = rng.pick(roads);
    const side = rng.chance(0.5) ? 1 : -1;
    p.position.set(rng.chance(0.5) ? along + side * 12 : rng.range(-240, 240), 0,
      rng.chance(0.5) ? rng.range(-240, 240) : along + side * 12);
    if (p.position.x > 250) p.position.x = 250;
    group.add(p); palms.push(p);
  }

  // --- Street lamps at seeded intersections.
  const lamps = [];
  for (const r of roads) {
    for (const c of roads) {
      if (!rng.chance(0.35)) continue;
      const lamp = makeLamp(THREE);
      lamp.position.set(r + 9.5, 0, c + 9.5);
      group.add(lamp); lamps.push(lamp);
    }
  }

  // Ocean horizon glow (sun low over the water — golden hour).
  const sunBall = new THREE.Mesh(new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }));
  sunBall.position.set(620, 60, -40);
  sunBall.lookAt(0, 40, 0);
  group.add(sunBall);

  return {
    group, colliders, buildings, roads, palms, lamps,
    places: PLACES,
    // Road-graph helpers for traffic / route drawing.
    nearestRoadLine(v) {
      let best = roads[0], bd = Infinity;
      for (const r of roads) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = r; } }
      return best;
    },
  };
}

// Point-in-AABB test used by cars, peds and the player.
export function hitsCollider(colliders, x, z, pad = 0) {
  for (const c of colliders) {
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return c;
  }
  return null;
}

// Resolve a circle (entity radius r) out of building AABBs; returns corrected {x,z}.
export function resolveCollisions(colliders, x, z, r) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      z = cz + (dz / d) * r;
    } else if (d2 <= 1e-6) {
      // Inside the box: push out along the smallest penetration axis.
      const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
      else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
    }
  }
  return { x, z };
}

export { colorTexture };
