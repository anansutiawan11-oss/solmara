// HUD: cash, health, wanted stars, mission objective, weapon, speed, radio and
// a live minimap drawn on a 2D canvas (roads, beach, player, police, target).
import { money, clockString } from './utils.js';
import { ROADS, BEACH_X } from './city.js';
import { rankFor } from './missions.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cashEl = this.el('cash');
    this.rankEl = this.el('rank');
    this.healthFill = this.el('healthfill');
    this.starsEl = this.el('stars');
    this.clockEl = this.el('clock');
    this.objTitle = this.el('objtitle');
    this.objText = this.el('objtext');
    this.objDist = this.el('objdist');
    this.weaponEl = this.el('weapon');
    this.ammoEl = this.el('ammo');
    this.speedEl = this.el('speed');
    this.radioEl = this.el('radio');
    this.carHealthEl = this.el('carhealth');
    this.promptEl = this.el('prompt');
    this.dialogueEl = this.el('dialogue');
    this.dlgName = this.el('dlgname');
    this.dlgText = this.el('dlgtext');
    this.crosshairEl = this.el('crosshair');
    this.bannerEl = this.el('banner');
    this.bannerTitle = this.el('bannerTitle');
    this.bannerSub = this.el('bannerSub');
    this.damageEl = this.el('damage');
    this.flashEl = this.el('wantedflash');
    this.map = this.el('minimap').getContext('2d');
    this.bannerUntil = 0;
    this.dialogueUntil = 0;
    this.flashPhase = 0;
  }

  show() {
    this.el('hud').classList.remove('hidden');
  }

  hide() {
    this.el('hud').classList.add('hidden');
  }

  banner(title, sub, seconds = 3) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.remove('hidden');
    this.bannerUntil = performance.now() / 1000 + seconds;
  }

  dialogue(name, text, seconds = 6) {
    this.dlgName.textContent = name;
    this.dlgText.textContent = text;
    this.dialogueEl.classList.remove('hidden');
    this.dialogueUntil = performance.now() / 1000 + seconds;
  }

  prompt(html) {
    if (!html) {
      this.promptEl.classList.add('hidden');
      return;
    }
    this.promptEl.innerHTML = html;
    this.promptEl.classList.remove('hidden');
  }

  damageFlash(strength = 1) {
    this.damageEl.style.opacity = String(0.35 + 0.65 * strength);
    setTimeout(() => {
      this.damageEl.style.opacity = '0';
    }, 160);
  }

  update(game, now) {
    const t = performance.now() / 1000;
    if (t > this.bannerUntil) this.bannerEl.classList.add('hidden');
    if (t > this.dialogueUntil) this.dialogueEl.classList.add('hidden');
    this.cashEl.textContent = money(game.cash);
    this.rankEl.textContent = rankFor(game.cash);
    this.healthFill.style.width = Math.max(0, game.player.health) + '%';
    let stars = '';
    for (let i = 0; i < 5; i++) {
      stars += `<span class="${i < game.police.wanted ? '' : 'off'}">★</span>`;
    }
    this.starsEl.innerHTML = stars;
    this.clockEl.textContent = `${clockString(game.clockSeconds)} · SOLMARA`;
    const m = game.missions.active;
    if (m) {
      this.objTitle.textContent = `Mission ${m.index + 1}/7 · ${m.def.title}`;
      this.objText.textContent = game.missions.stepLabel();
    } else {
      this.objTitle.textContent = game.missions.done >= 7 ? 'Free Roam' : 'No Active Mission';
      this.objText.textContent =
        game.missions.done >= 7 ? 'Solmara is yours — press H for jobs' : 'Press H to start the next mission';
    }
    const obj = game.missions.objectivePos();
    if (obj) {
      const d = Math.hypot(game.playerPos.x - obj.x, game.playerPos.z - obj.z);
      this.objDist.textContent = `${Math.round(d)} m`;
    } else {
      this.objDist.textContent = '';
    }
    const w = game.combat.weapon;
    this.weaponEl.textContent = w === 'pistol' ? 'Pistol' : 'Fists';
    this.ammoEl.textContent =
      w === 'pistol'
        ? game.combat.reloading > 0
          ? 'RELOADING…'
          : `Ammo ${game.combat.ammo} / 12 — R reload`
        : 'F — punch';
    this.crosshairEl.classList.toggle('hidden', !(w === 'pistol' && !game.inCar));
    if (game.inCar) {
      this.speedEl.classList.remove('hidden');
      this.speedEl.innerHTML = `${Math.round(Math.abs(game.playerCar.speed) * 3.6)} <small>km/h</small>`;
      this.carHealthEl.textContent = `CAR ${Math.round(game.playerCar.health)}%`;
    } else {
      this.speedEl.classList.add('hidden');
      this.carHealthEl.textContent = '';
    }
    this.radioEl.textContent = game.audio.stationName();
    // red pulse around the screen edge while wanted
    this.flashPhase += 0.016;
    this.flashEl.style.opacity =
      game.police.wanted > 0 ? String(0.25 + 0.2 * Math.sin(this.flashPhase * 3)) : '0';
    this.drawMinimap(game, now);
  }

  drawMinimap(game, now) {
    const g = this.map;
    const S = 216;
    const half = 360; // world units shown across the map
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    g.clearRect(0, 0, S, S);
    // sea, beach, city base
    g.fillStyle = '#0e2a3a';
    g.fillRect(0, 0, S, S);
    const [bx] = toMap(BEACH_X, 0);
    g.fillStyle = '#14586e';
    g.fillRect(bx, 0, S - bx, S);
    g.fillStyle = '#c9a06a';
    g.fillRect(bx - 8, 0, 8, S);
    // blocks
    g.fillStyle = '#232a3a';
    for (let ix = 0; ix < ROADS.length - 1; ix++) {
      for (let iz = 0; iz < ROADS.length - 1; iz++) {
        const [x1, y1] = toMap(ROADS[ix] + 6, ROADS[iz] + 6);
        const [x2, y2] = toMap(ROADS[ix + 1] - 6, ROADS[iz + 1] - 6);
        g.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
    // roads
    g.strokeStyle = '#4a5568';
    g.lineWidth = 3;
    for (const c of ROADS) {
      const [x] = toMap(c, 0);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, S);
      g.stroke();
      const [, y] = toMap(0, c);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y);
      g.stroke();
    }
    // safehouse marker
    const [sx, sy] = toMap(game.city.places.safehouse.x, game.city.places.safehouse.z);
    g.fillStyle = '#37e6ff';
    g.fillRect(sx - 3, sy - 3, 6, 6);
    // mission target: pulsing diamond + dashed route from the player
    const obj = game.missions.objectivePos();
    if (obj) {
      const [ox, oy] = toMap(obj.x, obj.z);
      const pulse = 5 + 2.5 * Math.sin(now * 5);
      g.fillStyle = '#ffd166';
      g.beginPath();
      g.moveTo(ox, oy - pulse);
      g.lineTo(ox + pulse, oy);
      g.lineTo(ox, oy + pulse);
      g.lineTo(ox - pulse, oy);
      g.closePath();
      g.fill();
      const [px, py] = toMap(game.playerPos.x, game.playerPos.z);
      g.strokeStyle = 'rgba(255,209,102,0.5)';
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(ox, oy);
      g.stroke();
      g.setLineDash([]);
    }
    // traffic: white dots
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of game.traffic.cars) {
      if (c.wrecked) continue;
      const [x, y] = toMap(c.x, c.z);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // police: blinking red/blue dots, helicopter bigger
    const blink = Math.floor(now * 4) % 2 === 0;
    g.fillStyle = blink ? '#ff3b3b' : '#3b82ff';
    for (const c of game.police.cars) {
      const [x, y] = toMap(c.x, c.z);
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    for (const c of game.police.cops) {
      if (c.down > 0) continue;
      const [x, y] = toMap(c.x, c.z);
      g.beginPath();
      g.arc(x, y, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    if (game.police.heli) {
      const [x, y] = toMap(game.police.heli.x, game.police.heli.z);
      g.fillStyle = '#ff3b3b';
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    // player arrow, rotated to the heading
    const [px, py] = toMap(game.playerPos.x, game.playerPos.z);
    const heading = game.inCar ? game.playerCar.heading : game.player.heading;
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)));
    g.fillStyle = '#ffd166';
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // north label + border
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = 'bold 11px sans-serif';
    g.fillText('N', 6, 14);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
