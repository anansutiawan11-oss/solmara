// hud.js — HUD + live minimap (roads, beach, player arrow, traffic, police,
// mission target + dashed route). All DOM is in index.html.
import { fmtMoney, fmtDist, clamp } from './utils.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('hud-cash'), rank: $('hud-rank'), health: $('hud-health'),
    healthFill: $('hud-health-fill'), stars: $('hud-stars'),
    objective: $('hud-objective'), objDist: $('hud-obj-dist'),
    weapon: $('hud-weapon'), ammo: $('hud-ammo'),
    speed: $('hud-speed'), radio: $('hud-radio'),
    minimap: $('minimap'), dialogue: $('dialogue'), dialogueText: $('dialogue-text'),
    prompt: $('prompt'), title: $('title-screen'), pause: $('pause-screen'),
    busted: $('busted-screen'), wasted: $('wasted-screen'), end: $('end-screen'),
    missionName: $('mission-name'), toast: $('toast'),
  };
  const mapCtx = els.minimap.getContext('2d');
  let toastTimer = 0;
  return {
    els, mapCtx,
    showToast(text, ms = 2600) {
      els.toast.textContent = text; els.toast.style.display = 'block';
      toastTimer = ms;
    },
    showDialogue(text, who = 'Mara', ms = 4200) {
      els.dialogueText.textContent = (who ? who + ': ' : '') + text;
      els.dialogue.style.display = 'block';
      els.dialogue.dataset.ms = String(ms);
    },
    hideDialogue() { els.dialogue.style.display = 'none'; },
    setPrompt(text) {
      if (text) { els.prompt.textContent = text; els.prompt.style.display = 'block'; }
      else els.prompt.style.display = 'none';
    },
    update(dt, s) {
      // s: {player, police, mission, step, speed, station, time}
      els.cash.textContent = fmtMoney(s.player.cash);
      els.rank.textContent = s.player.rank;
      els.health.textContent = Math.ceil(s.player.health) + '';
      els.healthFill.style.width = clamp(s.player.health, 0, 100) + '%';
      els.healthFill.style.background = s.player.health > 50 ? '#4ade80' : s.player.health > 25 ? '#facc15' : '#ef4444';
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < s.police.wanted ? '★' : '☆';
      els.stars.textContent = stars;
      els.stars.style.color = s.police.wanted > 0 ? '#facc15' : 'rgba(255,255,255,0.35)';
      if (s.mission && s.step) {
        els.missionName.textContent = s.mission.name;
        els.objective.textContent = s.step.text;
        els.objDist.textContent = fmtDist(s.dist);
      } else if (s.mission) {
        els.missionName.textContent = s.mission.name;
        els.objective.textContent = 'Press ENTER to start';
        els.objDist.textContent = '';
      } else {
        els.missionName.textContent = 'SOLMARA';
        els.objective.textContent = 'Story complete — free roam!';
        els.objDist.textContent = '';
      }
      els.weapon.textContent = s.player.weapon === 'pistol' ? 'Pistol' : 'Fists';
      els.ammo.textContent = s.player.weapon === 'pistol' ? s.player.ammo + ' / ' + s.player.reserveAmmo : '—';
      els.speed.textContent = Math.round(Math.abs(s.speed) * 3.6) + ' km/h';
      els.radio.textContent = '♪ ' + s.station;
      if (toastTimer > 0) { toastTimer -= dt * 1000; if (toastTimer <= 0) els.toast.style.display = 'none'; }
      if (els.dialogue.style.display === 'block') {
        const ms = Number(els.dialogue.dataset.ms || 4200) - dt * 1000;
        els.dialogue.dataset.ms = String(ms);
        if (ms <= 0) els.dialogue.style.display = 'none';
      }
    },
    drawMinimap(city, player, traffic, police, missionTarget) {
      const c = mapCtx, W = 180, H = 180;
      c.clearRect(0, 0, W, H);
      // world → map: x -200..200 → 0..180, z -200..260 → 0..180
      const mx = (x) => ((x + 200) / 400) * W;
      const mz = (z) => ((z + 200) / 460) * H;
      c.fillStyle = 'rgba(10,14,24,0.82)'; c.fillRect(0, 0, W, H);
      // ocean + beach
      c.fillStyle = '#2e7f9e'; c.fillRect(0, mz(206), W, H - mz(206));
      c.fillStyle = '#e8cf9e'; c.fillRect(0, mz(180), W, mz(206) - mz(180));
      // roads
      c.strokeStyle = '#5a6274'; c.lineWidth = 3;
      for (const l of city.lines) {
        c.beginPath(); c.moveTo(mx(-180), mz(l)); c.lineTo(mx(180), mz(l)); c.stroke();
        c.beginPath(); c.moveTo(mx(l), mz(-180)); c.lineTo(mx(l), mz(180)); c.stroke();
      }
      // mission target + dashed route from player
      if (missionTarget) {
        c.strokeStyle = '#ffd23a'; c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(mx(player.pos.x), mz(player.pos.z));
        c.lineTo(mx(missionTarget.x), mz(missionTarget.z)); c.stroke();
        c.setLineDash([]);
        c.fillStyle = '#ffd23a';
        c.beginPath(); c.arc(mx(missionTarget.x), mz(missionTarget.z), 6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(mx(missionTarget.x), mz(missionTarget.z), 6, 0, Math.PI * 2); c.stroke();
      }
      // traffic dots
      c.fillStyle = '#cbd5e1';
      for (const car of traffic) { c.fillRect(mx(car.pos.x) - 1.5, mz(car.pos.z) - 1.5, 3, 3); }
      // police dots (blue/red)
      for (const car of police.patrols) {
        c.fillStyle = '#3b82f6';
        c.beginPath(); c.arc(mx(car.pos.x), mz(car.pos.z), 3.5, 0, Math.PI * 2); c.fill();
      }
      // player arrow
      c.save();
      c.translate(mx(player.pos.x), mz(player.pos.z));
      c.rotate(Math.PI - player.heading);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
      c.restore();
    },
    showScreen(which) {
      for (const k of ['title', 'pause', 'busted', 'wasted', 'end']) {
        if (els[k]) els[k].style.display = k === which ? 'flex' : 'none';
      }
    },
    hideScreens() { this.showScreen(null); },
  };
}
