// hud.js — DOM HUD + live minimap (roads, beach, player arrow, traffic,
// police, mission target + dashed route). All DOM ids live in index.html.
import { ROAD_LINES } from './city.js';
import { fmtMoney } from './utils.js';

export function createHud(document) {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('cash'), rank: $('rank'), healthFill: $('health-fill'),
    stars: $('stars'), objective: $('objective'), objDist: $('objective-dist'),
    weapon: $('weapon'), ammo: $('ammo'), speed: $('speed'), radio: $('radio'),
    toast: $('toast'), prompt: $('prompt'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    dialogue: $('dialogue'), dlgSpeaker: $('dlg-speaker'), dlgText: $('dlg-text'),
    title: $('title-overlay'), pause: $('pause-overlay'), busted: $('busted-overlay'),
    wasted: $('wasted-overlay'), storyEnd: $('story-end-overlay'),
    endCash: $('end-cash'), minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  let toastTimer = null;
  let bannerTimer = null;

  function show(node) { if (node) node.classList.remove('hidden'); }
  function hide(node) { if (node) node.classList.add('hidden'); }

  function toast(msg, ms = 3200) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    show(el.toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(el.toast), ms);
  }

  function showPrompt(msg) { if (el.prompt) { el.prompt.textContent = msg; show(el.prompt); } }
  function hidePrompt() { hide(el.prompt); }

  function showBanner(title, sub) {
    if (!el.banner) return;
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    show(el.banner);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => hide(el.banner), 3600);
  }

  function showDialogue(who, text) {
    if (!el.dialogue) return;
    el.dlgSpeaker.textContent = who;
    el.dlgText.textContent = text;
    show(el.dialogue);
  }
  function hideDialogue() { hide(el.dialogue); }

  function showTitle() { show(el.title); }
  function hideTitle() { hide(el.title); }
  function showPause() { show(el.pause); }
  function hidePause() { hide(el.pause); }
  function showBusted() { show(el.busted); }
  function hideBusted() { hide(el.busted); }
  function showWasted() { show(el.wasted); }
  function hideWasted() { hide(el.wasted); }
  function showStoryEnd(cash) {
    if (el.endCash) el.endCash.textContent = fmtMoney(cash);
    show(el.storyEnd);
  }
  function hideStoryEnd() { hide(el.storyEnd); }

  function setRadio(name) { if (el.radio) el.radio.textContent = '♪ ' + name; }

  // --- Minimap: world [-360, 360] -> 190px canvas.
  function drawMinimap(game) {
    const W = 190, S = W / 720;
    const X = (x) => (x + 360) * S;
    const Z = (z) => (z + 360) * S;
    mm.clearRect(0, 0, W, W);
    mm.fillStyle = '#20242e';
    mm.fillRect(0, 0, W, W);
    // Ocean + beach (east edge).
    mm.fillStyle = '#1e6f8e';
    mm.fillRect(X(330), 0, W - X(330), W);
    mm.fillStyle = '#e8c98f';
    mm.fillRect(X(270), 0, X(330) - X(270), W);
    // Roads.
    mm.strokeStyle = '#55555f';
    mm.lineWidth = 3;
    for (const r of ROAD_LINES) {
      mm.beginPath(); mm.moveTo(X(-270), Z(r)); mm.lineTo(X(270), Z(r)); mm.stroke();
      mm.beginPath(); mm.moveTo(X(r), Z(-270)); mm.lineTo(X(r), Z(270)); mm.stroke();
    }
    // Buildings as dots.
    mm.fillStyle = '#8a8a96';
    for (const b of game.city.buildings) mm.fillRect(X(b.x) - 1, Z(b.z) - 1, 2, 2);
    // Mission target + dashed route (Manhattan path via the grid).
    const obj = game.missions.getObjective();
    if (obj.target) {
      const p = game.vehicles.playerCar ? game.vehicles.playerCar.pos : game.player.state.pos;
      mm.strokeStyle = '#ffd21f';
      mm.setLineDash([4, 4]);
      mm.lineWidth = 2;
      mm.beginPath();
      mm.moveTo(X(p.x), Z(p.z));
      mm.lineTo(X(obj.target.x), Z(p.z));
      mm.lineTo(X(obj.target.x), Z(obj.target.z));
      mm.stroke();
      mm.setLineDash([]);
      mm.fillStyle = '#ffd21f';
      mm.beginPath();
      mm.arc(X(obj.target.x), Z(obj.target.z), 5, 0, Math.PI * 2);
      mm.fill();
      mm.fillStyle = '#20242e';
      mm.font = 'bold 7px sans-serif';
      mm.textAlign = 'center';
      mm.fillText('★', X(obj.target.x), Z(obj.target.z) + 2.5);
    }
    // Traffic (grey), police (blue).
    for (const car of game.vehicles.cars) {
      if (car.isPlayer) continue;
      mm.fillStyle = car.isPolice ? '#3a7bff' : '#c8c8c8';
      mm.beginPath();
      mm.arc(X(car.pos.x), Z(car.pos.z), car.isPolice ? 3.5 : 2.2, 0, Math.PI * 2);
      mm.fill();
    }
    // Player arrow (car position while driving).
    const p = game.vehicles.playerCar ? game.vehicles.playerCar.pos : game.player.state.pos;
    const h = game.vehicles.playerCar ? game.vehicles.playerCar.heading : game.player.state.heading;
    mm.save();
    mm.translate(X(p.x), Z(p.z));
    mm.rotate(Math.atan2(Math.sin(h), -Math.cos(h)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.strokeStyle = '#111111';
    mm.lineWidth = 1;
    mm.beginPath();
    mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(0, 2.5); mm.lineTo(-5, 5); mm.closePath();
    mm.fill(); mm.stroke();
    mm.restore();
  }

  function update(game) {
    if (el.cash) el.cash.textContent = fmtMoney(game.cash);
    if (el.rank) el.rank.textContent = game.rank;
    if (el.healthFill) {
      const hp = Math.max(0, game.player.state.health);
      el.healthFill.style.width = hp + '%';
      el.healthFill.style.background = hp > 50 ? '#5fbf6b' : hp > 25 ? '#f2a541' : '#e8574f';
    }
    if (el.stars) {
      const w = game.police.state.wanted;
      el.stars.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
      el.stars.style.color = w > 0 ? '#ffd21f' : '#666';
    }
    const obj = game.missions.getObjective();
    if (el.objective) el.objective.textContent = obj.text;
    if (el.objDist) el.objDist.textContent = obj.target ? Math.round(obj.distance) + 'm' : '';
    if (el.weapon) el.weapon.textContent = game.combat.state.hasPistol ? 'Pistol' : 'Fists';
    if (el.ammo) el.ammo.textContent = game.combat.state.reloading ? 'RELOADING' : `${game.combat.state.ammo} / ${game.combat.state.magSize}`;
    if (el.speed) {
      const car = game.vehicles.playerCar;
      el.speed.textContent = car ? Math.round(Math.abs(car.speed) * 2.237) + ' mph' : '—';
    }
    drawMinimap(game);
  }

  return {
    update, toast, showPrompt, hidePrompt, showBanner,
    showDialogue, hideDialogue,
    showTitle, hideTitle, showPause, hidePause,
    showBusted, hideBusted, showWasted, hideWasted,
    showStoryEnd, hideStoryEnd, setRadio, drawMinimap,
  };
}
