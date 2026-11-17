// All drawing for Solmar Bay: the city, cars, people, police, particles, the
// HUD with its minimap, the title screen and the pause screen. One canvas,
// warm sun-soaked colours, drawn in world space through the camera transform.

import { clamp, dist } from './rng.js';
import { PITCH, GRID, WORLD } from './city.js';
import { MISSIONS } from './missions.js';

const SKY_TOP = '#ffd9a0';
const SKY_BOTTOM = '#ff9e6b';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, state, view) {
  const { camera, city } = state;
  const { w, h } = view;
  // Warm sky gradient behind everything.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(1, '#ffe8c9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const zoom = camera.zoom;
  const left = camera.x - w / 2 / zoom;
  const top = camera.y - h / 2 / zoom;
  const right = camera.x + w / 2 / zoom;
  const bottom = camera.y + h / 2 / zoom;

  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-left, -top);

  drawGround(ctx, city, left, top, right, bottom);
  drawBuildings(ctx, city, left, top, right, bottom);
  drawLandmarkMarkers(ctx, state);
  drawPickups(ctx, state);
  drawPeds(ctx, state);
  drawCars(ctx, state);
  drawCops(ctx, state);
  drawPlayer(ctx, state);
  drawBullets(ctx, state);
  drawParticles(ctx, state);
  ctx.restore();
}

function drawGround(ctx, city, left, top, right, bottom) {
  // Grass / sand base.
  ctx.fillStyle = '#c9b183';
  ctx.fillRect(left, top, right - left, bottom - top);
  // Beach strip along the south edge.
  ctx.fillStyle = '#eed9a4';
  ctx.fillRect(0, GRID * PITCH - 90, WORLD, 90);
  ctx.fillStyle = '#7ec8e3';
  ctx.fillRect(0, WORLD - 26, WORLD, 26);

  // Parks.
  for (const p of city.parks) {
    ctx.fillStyle = '#7fb069';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#5c9450';
    for (let i = 0; i < 5; i++) {
      const tx = p.x + 40 + i * 55;
      const ty = p.y + 60 + (i % 2) * 120;
      ctx.beginPath();
      ctx.arc(tx, ty, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads: asphalt strips with sidewalks.
  ctx.fillStyle = '#8a8f96';
  for (let i = 0; i <= GRID; i++) {
    const c = i * PITCH;
    ctx.fillRect(c - PITCH / 2 - 46, -60, 92, WORLD + 120);
    ctx.fillRect(-60, c - 46, WORLD + 120, 92);
  }
  ctx.fillStyle = '#3f444a';
  for (let i = 0; i <= GRID; i++) {
    const c = i * PITCH;
    ctx.fillRect(c - 40, -60, 80, WORLD + 120);
    ctx.fillRect(-60, c - 40, WORLD + 120, 80);
  }
  // Centre dashes.
  ctx.fillStyle = '#e8d44d';
  for (let i = 0; i <= GRID; i++) {
    const c = i * PITCH;
    for (let d = -40; d < WORLD + 40; d += 64) {
      ctx.fillRect(c - 2, d, 4, 30);
      ctx.fillRect(d, c - 2, 30, 4);
    }
  }
  // Crosswalk stripes at intersections.
  ctx.fillStyle = 'rgba(240,240,240,0.75)';
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const cx = i * PITCH;
      const cy = j * PITCH;
      for (let k = -3; k <= 3; k++) {
        ctx.fillRect(cx + k * 11 - 3, cy - 40, 6, 12);
        ctx.fillRect(cx + k * 11 - 3, cy + 28, 6, 12);
        ctx.fillRect(cx - 40, cy + k * 11 - 3, 12, 6);
        ctx.fillRect(cx + 28, cy + k * 11 - 3, 12, 6);
      }
    }
  }
}

function drawBuildings(ctx, city, left, top, right, bottom) {
  for (const b of city.buildings) {
    if (b.x > right || b.x + b.w < left || b.y > bottom || b.y + b.h < top) continue;
    // Drop shadow for height.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const sh = b.height * 4;
    ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    // Windows.
    ctx.fillStyle = 'rgba(255,255,220,0.5)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 34));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        ctx.fillRect(b.x + 14 + c * 34, b.y + 14 + r * 34, 14, 10);
      }
    }
    if (b.zone === 'downtown') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x, b.y, b.w, 6);
    }
  }
}

function drawLandmarkMarkers(ctx, state) {
  const { city } = state;
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  for (const key of Object.keys(city.landmarks)) {
    const lm = city.landmarks[key];
    ctx.fillStyle = 'rgba(12,20,32,0.65)';
    const tw = ctx.measureText(lm.label).width + 16;
    roundRect(ctx, lm.x - tw / 2, lm.y - 34, tw, 20, 10);
    ctx.fill();
    ctx.fillStyle = lm.color;
    ctx.fillText(lm.label, lm.x, lm.y - 20);
    ctx.fillStyle = lm.color;
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission waypoint: a pulsing beacon + a guiding arrow from the player.
  const target = state.missionTarget;
  if (target) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 52);
    ctx.lineTo(target.x - 10, target.y - 30);
    ctx.lineTo(target.x + 10, target.y - 30);
    ctx.closePath();
    ctx.fill();
    const p = state.player;
    const d = dist(p.x, p.y, target.x, target.y);
    if (d > 260) {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      const ax = p.x + Math.cos(a) * 120;
      const ay = p.y + Math.sin(a) * 120;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawPickups(ctx, state) {
  for (const pk of state.pickups) {
    if (pk.kind === 'health') {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, pk.x - 12, pk.y - 12, 24, 24, 5);
      ctx.fill();
      ctx.fillStyle = '#d93d3d';
      ctx.fillRect(pk.x - 3, pk.y - 9, 6, 18);
      ctx.fillRect(pk.x - 9, pk.y - 3, 18, 6);
    } else {
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5c00';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A', pk.x, pk.y + 4);
    }
  }
}

function drawCarShape(ctx, car) {
  const m = car.model;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -m.len / 2 + 3, -m.wid / 2 + 3, m.len, m.wid, 8);
  ctx.fill();
  ctx.fillStyle = car.police ? '#1c2f4a' : car.color;
  roundRect(ctx, -m.len / 2, -m.wid / 2, m.len, m.wid, 8);
  ctx.fill();
  if (car.police) {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-m.len / 2 + 8, -m.wid / 2, m.len - 16, m.wid);
    ctx.fillStyle = '#1c2f4a';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 4);
  }
  // Windshield + roof + headlights.
  ctx.fillStyle = 'rgba(180,220,240,0.85)';
  ctx.fillRect(-m.len / 2 + 10, -m.wid / 2 + 4, 12, m.wid - 8);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, -4, -m.wid / 2 + 4, 16, m.wid - 8, 4);
  ctx.fill();
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(m.len / 2 - 4, -m.wid / 2 + 3, 3, 6);
  ctx.fillRect(m.len / 2 - 4, m.wid / 2 - 9, 3, 6);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-m.len / 2, -m.wid / 2 + 3, 3, 6);
  ctx.fillRect(-m.len / 2, m.wid / 2 - 9, 3, 6);
  if (car.police) {
    const t = Date.now() / 300;
    ctx.fillStyle = Math.floor(t) % 2 === 0 ? '#ff3b30' : '#3b82ff';
    ctx.beginPath();
    ctx.arc(-2, -m.wid / 2 + 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Math.floor(t) % 2 === 0 ? '#3b82ff' : '#ff3b30';
    ctx.beginPath();
    ctx.arc(-2, m.wid / 2 - 1, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCars(ctx, state) {
  for (const car of state.cars) drawCarShape(ctx, car);
}

function drawPeds(ctx, state) {
  for (const ped of state.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(Math.cos(ped.heading) * 4, Math.sin(ped.heading) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCops(ctx, state) {
  for (const cop of state.cops) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c2f4a';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(Math.cos(cop.heading) * 4, Math.sin(cop.heading) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c2f4a';
    ctx.fillRect(-7, -13, 14, 5);
    ctx.restore();
  }
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rico: teal jacket, dark jeans.
  ctx.fillStyle = '#0e7a6b';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(Math.cos(p.heading) * 5, Math.sin(p.heading) * 5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(Math.cos(p.heading) * 5 - Math.sin(p.heading) * 2, Math.sin(p.heading) * 5 + Math.cos(p.heading) * 2, 6, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();
  if (p.armed) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(p.heading) * 18, Math.sin(p.heading) * 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBullets(ctx, state) {
  ctx.fillStyle = '#ffe27a';
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx, state) {
  for (const pt of state.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- HUD ----------------------------------------------------------------------

export function drawHUD(ctx, state, view) {
  const { w, h } = view;
  const p = state.player;
  ctx.save();
  // Top-left: cash + health.
  ctx.fillStyle = 'rgba(10,16,26,0.72)';
  roundRect(ctx, 14, 14, 220, 74, 10);
  ctx.fill();
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('$' + state.cash.toLocaleString('en-US'), 28, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('RICO MARLOW', 28, 62);
  ctx.fillStyle = '#333';
  roundRect(ctx, 28, 70, 180, 10, 5);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#e84c3d' : '#ff9e2e';
  roundRect(ctx, 28, 70, 180 * clamp(p.health / 100, 0, 1), 10, 5);
  ctx.fill();

  // Top-right: wanted stars.
  ctx.fillStyle = 'rgba(10,16,26,0.72)';
  roundRect(ctx, w - 214, 14, 200, 46, 10);
  ctx.fill();
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < state.wanted ? '#ffd23d' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', w - 188 + i * 36, 46);
  }

  // Bottom-left: minimap.
  drawMinimap(ctx, state, 14, h - 174, 160);

  // Bottom-centre: mission objective.
  if (state.mission && !state.mission.done && !state.mission.failed) {
    const stage = state.mission.def.stages[state.mission.stage];
    if (stage) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      const text = state.mission.def.title + ' — ' + stage.text;
      const tw = ctx.measureText(text).width + 28;
      ctx.fillStyle = 'rgba(10,16,26,0.78)';
      roundRect(ctx, (w - tw) / 2, h - 52, tw, 34, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23d';
      ctx.textAlign = 'center';
      ctx.fillText(text, w / 2, h - 30);
      if (stage.time && stage.type === 'goto') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillText(Math.max(0, Math.ceil(stage.time - state.mission.stageTime)) + 's', w / 2, h - 62);
      }
      if (stage.type === 'survive' || stage.type === 'wait') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillText(Math.max(0, Math.ceil(stage.time - state.mission.stageTime)) + 's', w / 2, h - 62);
      }
    }
  }

  // Speed when driving.
  if (p.inCar && p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.12);
    ctx.fillStyle = 'rgba(10,16,26,0.72)';
    roundRect(ctx, w - 134, h - 64, 120, 50, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(mph), w - 40, h - 30);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText('MPH  ' + p.car.model.name.toUpperCase(), w - 40, h - 14);
  }

  // Ammo + controls hint (the hint hides while a mission banner is showing,
  // so the two never overlap).
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const hint = p.inCar
    ? 'WASD drive · E exit car · Space handbrake · H horn · M mission · P pause'
    : 'WASD move · Shift run · E enter car · Click/F shoot · M mission · P pause';
  const missionActive = state.mission && !state.mission.done && !state.mission.failed;
  if (!missionActive) ctx.fillText(hint, 188, h - 18);
  if (!p.inCar) {
    ctx.fillStyle = '#ffd23d';
    ctx.fillText('Ammo ' + p.ammo, 188, missionActive ? h - 62 : h - 38);
  }

  // Toast message.
  if (state.toastTime > 0 && state.toast) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const tw = ctx.measureText(state.toast).width + 32;
    ctx.fillStyle = 'rgba(10,16,26,0.85)';
    roundRect(ctx, (w - tw) / 2, 84, tw, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(state.toast, w / 2, 110);
  }
  ctx.restore();
}

function drawMinimap(ctx, state, x, y, size) {
  const { city } = state;
  const scale = size / WORLD;
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,26,0.78)';
  roundRect(ctx, x - 6, y - 6, size + 12, size + 12, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  // Water + sand.
  ctx.fillStyle = '#7ec8e3';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#c9b183';
  ctx.fillRect(x, y, size, size - 4);
  // Roads.
  ctx.fillStyle = '#3f444a';
  for (let i = 0; i <= GRID; i++) {
    const c = x + i * PITCH * scale;
    ctx.fillRect(c - 2, y, 4, size);
    ctx.fillRect(x, c - 2, size, 4);
  }
  // Buildings.
  ctx.fillStyle = '#6b7c8c';
  for (const b of city.buildings) {
    ctx.fillRect(x + b.x * scale, y + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  }
  // Mission target.
  if (state.missionTarget) {
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath();
    ctx.arc(x + state.missionTarget.x * scale, y + state.missionTarget.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#3b82ff';
  for (const car of state.cars) {
    if (car.police) {
      ctx.beginPath();
      ctx.arc(x + car.x * scale, y + car.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const cop of state.cops) {
    ctx.beginPath();
    ctx.arc(x + cop.x * scale, y + cop.y * scale, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(x + p.x * scale, y + p.y * scale);
  ctx.rotate(p.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // North + label.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR BAY', x, y + size + 22);
  ctx.restore();
}

// --- Screens ------------------------------------------------------------------

export function drawTitle(ctx, state, view) {
  const { w, h } = view;
  // A painted backdrop: the city seen from above, dimmed.
  drawWorld(ctx, { ...state, missionTarget: null }, view);
  ctx.fillStyle = 'rgba(8,12,20,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('SOLMAR BAY', w / 2, h / 2 - 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('An open-world crime story', w / 2, h / 2 - 52);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0f0';
  ctx.fillText('Steal cars. Outrun the police. Work off the debt, one job at a time.', w / 2, h / 2 - 18);

  const items = [
    state.hasSave ? '1 — Continue  (your saved game)' : null,
    '2 — New Game',
    '3 — How to Play',
  ].filter(Boolean);
  ctx.font = 'bold 20px system-ui, sans-serif';
  items.forEach((item, i) => {
    const y = h / 2 + 34 + i * 40;
    ctx.fillStyle = state.menuIndex === i ? '#ffd23d' : '#ffffff';
    ctx.fillText(item, w / 2, y);
  });
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#9fb3c8';
  ctx.fillText('WASD move / drive · E enter or steal a car · Click shoot · M start a mission · P pause', w / 2, h - 36);
  ctx.fillText('A game by the Solmar Bay crew — an original city, story and cast. No Rockstar assets.', w / 2, h - 14);
}

export function drawHowTo(ctx, view) {
  const { w, h } = view;
  ctx.fillStyle = 'rgba(8,12,20,0.88)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', w / 2, h / 2 - 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px system-ui, sans-serif';
  const lines = [
    'On foot: WASD to walk, Shift to run. Walk up to any car and press E to steal it.',
    'Driving: W accelerate, S brake and reverse, A/D steer, Space handbrake, H horn.',
    'Combat: aim with the mouse, click or press F to shoot. Ammo pickups are gold boxes.',
    'Wanted stars: stealing, hitting people and shooting cops raise the heat. Police cars',
    'and foot cops chase you. Lose them, or get busted and pay a fine.',
    'Missions: press M to start the next job. Follow the gold marker — finish it for cash.',
    'Health: red crosses heal you. If your health hits zero you wake up at the hospital.',
    'Progress saves automatically after every mission. Press Esc to go back.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 - 110 + i * 30));
}

export function drawPause(ctx, view) {
  const { w, h } = view;
  ctx.fillStyle = 'rgba(8,12,20,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h / 2 - 20);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0f0';
  ctx.fillText('P resume · M mission list · S save game · Q quit to title', w / 2, h / 2 + 24);
}

export function drawDead(ctx, state, view) {
  const { w, h } = view;
  ctx.fillStyle = 'rgba(8,12,20,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = state.deadKind === 'busted' ? '#3b82ff' : '#e84c3d';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(state.deadKind === 'busted' ? 'BUSTED!' : 'WASTED', w / 2, h / 2 - 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(state.deadReason || '', w / 2, h / 2 + 20);
  ctx.fillStyle = '#cfe0f0';
  ctx.fillText('Press Enter to get back on the streets', w / 2, h / 2 + 56);
}

export function drawMissionList(ctx, state, view) {
  const { w, h } = view;
  ctx.fillStyle = 'rgba(8,12,20,0.85)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('JOBS — THE HARBOR CREW', w / 2, h / 2 - 170);
  ctx.font = '16px system-ui, sans-serif';
  MISSIONS.forEach((m, i) => {
    const y = h / 2 - 120 + i * 56;
    const done = i < state.missionsDone;
    const current = i === state.missionsDone;
    ctx.fillStyle = done ? '#7ee787' : current ? '#ffffff' : '#7a8a9a';
    ctx.fillText(
      (done ? '✓ ' : current ? '▶ ' : '· ') + (i + 1) + '. ' + m.title + ' — $' + m.reward + (done ? '  DONE' : ''),
      w / 2, y,
    );
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(m.brief, w / 2, y + 20);
    ctx.font = '16px system-ui, sans-serif';
  });
  ctx.fillStyle = '#cfe0f0';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Press M to start the next job, Esc to close', w / 2, h / 2 + 190);
}
