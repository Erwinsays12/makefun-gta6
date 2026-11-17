// Solmar Bay — main loop and game state. Wires input, city, entities, missions,
// rendering and sound together. The player is Rico Marlow, a getaway driver
// working off a debt to the Harbor Crew across one open city.

import { makeRng, clamp, dist, angleDiff, circleRectResolve } from './rng.js';
import { buildCity, WORLD } from './city.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import {
  makeCar, makePed, makeCop, makeBullet, makeParticle,
  updateTrafficCar, updatePed, updatePoliceCar, updateCop,
  updateBullet, driveCar, spawnTraffic, spawnPeds,
} from './entities.js';
import { MISSIONS, startMission, updateMission, missionTarget, applyMissionStartEffects } from './missions.js';
import { drawWorld, drawHUD, drawTitle, drawHowTo, drawPause, drawDead, drawMissionList } from './render.js';
import { applyShot, finalizeShot } from './shots.js';

const SAVE_KEY = 'solmarbay-save-v1';
const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

function newPlayer(x, y) {
  return {
    x, y, heading: -Math.PI / 2,
    health: 100, ammo: 24, armed: true,
    inCar: false, car: null,
    shootCooldown: 0, punchCooldown: 0,
  };
}

const state = {
  time: 0,
  screen: 'title', // title | howto | playing | paused | missions | dead
  menuIndex: 1,
  hasSave: false,
  city: buildCity(20261117),
  rng: makeRng(987654321),
  player: newPlayer(4 * 400, 4 * 400),
  camera: { x: 4 * 400, y: 4 * 400, zoom: 1 },
  cars: [],
  peds: [],
  cops: [],
  bullets: [],
  enemyBullets: [],
  particles: [],
  pickups: [],
  cash: 150,
  wanted: 0,
  wantedTimer: 0,
  crimeTimer: 0,
  bustTimer: 0,
  missionsDone: 0,
  mission: null,
  missionCar: null,
  missionCarTaken: false,
  missionTarget: null,
  toast: '',
  toastTime: 0,
  deadKind: null,
  deadReason: '',
  frozen: false,
  shotMode: null,
};

const input = new Input(canvas);
const sound = new SoundEngine();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- Save / load --------------------------------------------------------------

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionsDone: state.missionsDone,
      health: state.player.health,
      x: state.player.x,
      y: state.player.y,
    }));
    state.hasSave = true;
    return true;
  } catch {
    return false;
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySave(save) {
  state.cash = save.cash;
  state.missionsDone = save.missionsDone;
  state.player.health = save.health;
  state.player.x = save.x;
  state.player.y = save.y;
  state.camera.x = save.x;
  state.camera.y = save.y;
}

// --- World setup ---------------------------------------------------------------

function resetWorld() {
  const p = state.player;
  state.cars = [];
  state.peds = [];
  state.cops = [];
  state.bullets = [];
  state.enemyBullets = [];
  state.particles = [];
  state.pickups = [];
  state.wanted = 0;
  state.bustTimer = 0;
  state.mission = null;
  state.missionCar = null;
  state.missionCarTaken = false;
  state.missionTarget = null;
  const lm = state.city.landmarks;
  state.cars.push(...spawnTraffic(state.rng, state.city, 12, p));
  state.peds = spawnPeds(state.rng, state.city, 26, p);
  // Parked cars the player can take, parked along the roads (never inside a
  // building) near the hideout and downtown.
  const parkedSpots = [
    { x: 2900, y: 2840, model: 0 },
    { x: 1700, y: 1600, model: 4 },
    { x: 2380, y: 900, model: 2 },
    { x: 860, y: 2400, model: 5 },
  ];
  for (const s of parkedSpots) {
    state.cars.push(makeCar(s.x, s.y, 0, s.model, { parked: true, driver: false }));
  }
  // Health + ammo pickups around the map.
  state.pickups.push(
    { kind: 'health', x: lm.hospital.x, y: lm.hospital.y + 40 },
    { kind: 'health', x: 2 * 400, y: 7 * 400 },
    { kind: 'ammo', x: lm.garage.x, y: lm.garage.y + 30 },
    { kind: 'ammo', x: 7 * 400, y: 3 * 400 },
    { kind: 'ammo', x: lm.chopshop.x, y: lm.chopshop.y - 30 },
  );
}

function startNewGame() {
  state.player = newPlayer(7 * 400 - 60, 7 * 400 + 40);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.cash = 150;
  state.missionsDone = 0;
  resetWorld();
  state.screen = 'playing';
  state.toast = 'Welcome to Solmar Bay. Press M to start your first job.';
  state.toastTime = 6;
}

function continueGame() {
  const save = loadSave();
  if (!save) { startNewGame(); return; }
  state.player = newPlayer(save.x, save.y);
  applySave(save);
  resetWorld();
  state.screen = 'playing';
  state.toast = 'Welcome back, Rico. The Crew is still waiting.';
  state.toastTime = 5;
}

// --- Wanted level ---------------------------------------------------------------

function addWanted(n, reason) {
  if (state.wanted >= 5) return;
  state.wanted = Math.min(5, state.wanted + n);
  state.crimeTimer = 25;
  state.wantedTimer = 15;
  if (reason) {
    state.toast = reason;
    state.toastTime = 3;
  }
}

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function enterCar(car) {
  const p = state.player;
  if (car.driver && !car.police && !car.mission) {
    // Steal it: the driver bails out and runs.
    const driver = makePed(car.x + 20, car.y + 20, state.rng);
    driver.flee = 3;
    state.peds.push(driver);
    car.driver = false;
    addWanted(1, 'Car stolen — the cops are on to you!');
  } else if (car.police) {
    state.toast = 'That is a police car. Steal something else.';
    state.toastTime = 2;
    return;
  }
  if (car.mission) state.missionCarTaken = true;
  p.inCar = true;
  p.car = car;
  car.parked = false;
  car.driver = false;
  car.targetSpeed = 0;
  sound.door();
}

function exitCar() {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.speed = 0;
  car.parked = true;
  const a = car.heading + Math.PI / 2;
  p.x = car.x + Math.cos(a) * 34;
  p.y = car.y + Math.sin(a) * 34;
  p.heading = car.heading;
  p.inCar = false;
  p.car = null;
  sound.door();
}

// --- Combat ---------------------------------------------------------------------

function playerShoot() {
  const p = state.player;
  if (p.shootCooldown > 0 || p.ammo <= 0) return;
  p.shootCooldown = 0.18;
  p.ammo -= 1;
  const mouseWorld = screenToWorld(input.mouseX, input.mouseY);
  const a = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
  p.heading = a;
  state.bullets.push(makeBullet(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, true));
  sound.shoot();
  spawnMuzzle(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18);
}

function spawnMuzzle(x, y) {
  for (let i = 0; i < 4; i++) {
    state.particles.push(makeParticle(x, y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.12, '#ffe27a', 3));
  }
}

function explode(x, y) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 220;
    state.particles.push(makeParticle(
      x, y, Math.cos(a) * s, Math.sin(a) * s,
      0.4 + Math.random() * 0.5,
      ['#ff9e2e', '#e84c3d', '#ffd23d', '#555'][i % 4],
      3 + Math.random() * 5,
    ));
  }
  sound.crash();
}

function screenToWorld(sx, sy) {
  const view = { w: canvas.width, h: canvas.height };
  const cam = state.camera;
  return {
    x: cam.x + (sx - view.w / 2) / cam.zoom,
    y: cam.y + (sy - view.h / 2) / cam.zoom,
  };
}

// --- Police ----------------------------------------------------------------------

function spawnPolice(dt) {
  if (state.wanted === 0) return;
  const wantCars = Math.min(state.wanted * 2, 6);
  const policeCars = state.cars.filter((c) => c.police).length;
  const wantCops = state.wanted >= 2 && !state.player.inCar ? Math.min(state.wanted, 4) : 0;
  const p = state.player;
  if (policeCars < wantCars && Math.random() < dt * 0.8) {
    // Spawn at a road node just off screen.
    const a = Math.random() * Math.PI * 2;
    const sx = clamp(p.x + Math.cos(a) * 750, 60, WORLD - 60);
    const sy = clamp(p.y + Math.sin(a) * 750, 60, WORLD - 60);
    const car = makeCar(sx, sy, 0, 0, { police: true, dir: 0 });
    car.color = '#1c2f4a';
    state.cars.push(car);
  }
  if (state.cops.length < wantCops && Math.random() < dt * 0.6) {
    const a = Math.random() * Math.PI * 2;
    const cop = makeCop(
      clamp(p.x + Math.cos(a) * 420, 40, WORLD - 40),
      clamp(p.y + Math.sin(a) * 420, 40, WORLD - 40),
    );
    state.cops.push(cop);
  }
}

function die(kind, reason) {
  const p = state.player;
  state.screen = 'dead';
  state.deadKind = kind;
  state.deadReason = reason;
  sound.busted();
  if (p.inCar) exitCar();
  if (kind === 'busted') {
    const fine = Math.min(state.cash, Math.max(50, Math.floor(state.cash * 0.2)));
    state.cash -= fine;
    state.deadReason = reason + ' Fine: $' + fine + '.';
  } else {
    const loss = Math.min(state.cash, Math.max(25, Math.floor(state.cash * 0.1)));
    state.cash -= loss;
    state.deadReason = reason + ' Lost $' + loss + ' at the hospital.';
  }
  state.wanted = 0;
  state.cops = [];
  state.cars = state.cars.filter((c) => !c.police);
  state.bustTimer = 0;
  p.health = 100;
  const lm = state.city.landmarks;
  if (kind === 'busted') { p.x = lm.policeHQ.x; p.y = lm.policeHQ.y; }
  else { p.x = lm.hospital.x; p.y = lm.hospital.y; }
  state.camera.x = p.x;
  state.camera.y = p.y;
}

// --- Per-frame update -------------------------------------------------------------

function updatePlaying(dt) {
  const p = state.player;
  state.time += dt;
  state.toastTime = Math.max(0, state.toastTime - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  state.crimeTimer = Math.max(0, state.crimeTimer - dt);

  // Wanted decay: lay low and the heat fades one star at a time.
  if (state.wanted > 0 && state.crimeTimer <= 0) {
    state.wantedTimer -= dt;
    if (state.wantedTimer <= 0) {
      state.wanted -= 1;
      state.wantedTimer = 15;
      state.toast = state.wanted === 0 ? 'You lost them. The streets are quiet again.' : 'Heat dropping — ' + state.wanted + ' stars left.';
      state.toastTime = 3;
    }
  }

  // Player movement.
  if (p.inCar && p.car) {
    driveCar(p.car, dt, input, state.city);
    p.x = p.car.x;
    p.y = p.car.y;
    p.heading = p.car.heading;
    if (input.wasPressed('h')) sound.horn();
    if (input.wasPressed('e')) exitCar();
    // Hitting a pedestrian while driving is a crime.
    for (const ped of state.peds) {
      if (dist(ped.x, ped.y, p.x, p.y) < 26 && Math.abs(p.car.speed) > 60) {
        ped.flee = 2;
        addWanted(1, 'You hit a pedestrian!');
        p.car.speed *= 0.6;
        sound.hit();
        break;
      }
    }
  } else {
    const mv = input.moveVector();
    const run = input.down('shift') ? 1.55 : 1;
    const speed = 185 * run;
    p.x += mv.x * speed * dt;
    p.y += mv.y * speed * dt;
    p.x = clamp(p.x, 20, WORLD - 20);
    p.y = clamp(p.y, 20, WORLD - 20);
    for (const b of state.city.buildings) circleRectResolve(p, 12, b);
    // Aim at the mouse.
    const mw = screenToWorld(input.mouseX, input.mouseY);
    if (dist(mw.x, mw.y, p.x, p.y) > 30) p.heading = Math.atan2(mw.y - p.y, mw.x - p.x);
    if (input.wasPressed('e')) {
      const car = nearestCar(95);
      if (car) enterCar(car);
    }
    if (input.consumeClick() || input.down('f')) playerShoot();
    // Slow health regen on foot.
    p.health = Math.min(100, p.health + 1.5 * dt);
  }

  // Mission progress.
  const missionEvent = updateMission(state, dt);
  if (missionEvent) {
    if (missionEvent.type === 'complete') {
      state.cash += missionEvent.mission.reward;
      state.missionsDone += 1;
      state.toast = missionEvent.mission.title + ' complete! +$' + missionEvent.mission.reward;
      state.toastTime = 5;
      sound.missionDone();
      saveGame();
    } else if (missionEvent.type === 'failed') {
      state.toast = 'Mission failed — ' + missionEvent.reason;
      state.toastTime = 5;
      sound.missionFail();
      state.mission = null;
    }
  }
  state.missionTarget = missionTarget(state);

  // Traffic + pedestrians.
  for (const car of state.cars) {
    if (car.police) updatePoliceCar(car, dt, p, state.city);
    else if (!car.parked && car !== p.car) updateTrafficCar(car, dt, state.city, state.rng, p);
  }
  for (const ped of state.peds) {
    updatePed(ped, dt, state.city, state.rng, p.inCar ? p : null);
  }
  // Keep the streets alive: top traffic and peds back up near the player.
  if (state.cars.filter((c) => !c.police && !c.parked).length < 10 && Math.random() < dt * 0.5) {
    state.cars.push(...spawnTraffic(state.rng, state.city, 2, p));
  }
  if (state.peds.length < 22 && Math.random() < dt * 0.5) {
    state.peds.push(...spawnPeds(state.rng, state.city, 2, p));
  }
  // Remove traffic that wandered far away.
  state.cars = state.cars.filter((c) => c.police || c.parked || c === p.car || c.mission || dist(c.x, c.y, p.x, p.y) < 1800);
  state.peds = state.peds.filter((pd) => dist(pd.x, pd.y, p.x, p.y) < 1600);

  // Police.
  spawnPolice(dt);
  for (const cop of state.cops) {
    updateCop(cop, dt, p, state.city);
    if (!p.inCar && dist(cop.x, cop.y, p.x, p.y) < 32) {
      state.bustTimer += dt;
      if (state.bustTimer > 1.5) {
        die('busted', 'The Solmar Bay PD caught you.');
        return;
      }
    } else if (state.bustTimer > 0) {
      state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
    }
    // Cops shoot when the heat is on.
    if (state.wanted >= 2 && cop.shootCooldown <= 0 && dist(cop.x, cop.y, p.x, p.y) < 380) {
      cop.shootCooldown = 1.4;
      const a = Math.atan2(p.y - cop.y, p.x - cop.x) + (Math.random() - 0.5) * 0.25;
      state.enemyBullets.push(makeBullet(cop.x, cop.y, a, false));
      sound.shoot();
    }
  }
  state.cops = state.cops.filter((c) => dist(c.x, c.y, p.x, p.y) < 1400);

  // Police cars ram the player (with a cooldown so one touch is one hit).
  for (const car of state.cars) {
    if (!car.police) continue;
    car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
    if (dist(car.x, car.y, p.x, p.y) < 34 && car.ramCd <= 0) {
      car.ramCd = 0.9;
      if (p.inCar && p.car) {
        p.car.speed *= 0.55;
        p.health -= 6;
        sound.crash();
      } else {
        p.health -= 10;
        const a = Math.atan2(p.y - car.y, p.x - car.x);
        p.x += Math.cos(a) * 120 * dt;
        p.y += Math.sin(a) * 120 * dt;
        sound.hit();
      }
    }
  }

  // Bullets.
  for (const b of state.bullets) {
    updateBullet(b, dt);
    let dead = b.life <= 0;
    for (const bd of state.city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { dead = true; break; }
    }
    if (!dead) {
      for (let i = state.peds.length - 1; i >= 0; i--) {
        if (dist(b.x, b.y, state.peds[i].x, state.peds[i].y) < 14) {
          state.peds.splice(i, 1);
          addWanted(1, 'You shot a civilian!');
          explode(b.x, b.y);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (let i = state.cops.length - 1; i >= 0; i--) {
        if (dist(b.x, b.y, state.cops[i].x, state.cops[i].y) < 14) {
          state.cops.splice(i, 1);
          addWanted(2, 'You shot a cop!');
          explode(b.x, b.y);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (let i = state.cars.length - 1; i >= 0; i--) {
        const car = state.cars[i];
        if (car === p.car) continue;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const ca = Math.cos(-car.heading);
        const sa = Math.sin(-car.heading);
        const lx = dx * ca - dy * sa;
        const ly = dx * sa + dy * ca;
        if (Math.abs(lx) < car.model.len / 2 && Math.abs(ly) < car.model.wid / 2) {
          car.health -= 34;
          if (car.health <= 0) {
            explode(car.x, car.y);
            state.cars.splice(i, 1);
            addWanted(1, 'You blew up a car!');
          } else {
            sound.hit();
          }
          dead = true;
          break;
        }
      }
    }
    b.dead = dead;
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
  for (const b of state.enemyBullets) {
    updateBullet(b, dt);
    let dead = b.life <= 0;
    if (!p.inCar && dist(b.x, b.y, p.x, p.y) < 14) {
      p.health -= 9;
      sound.hit();
      dead = true;
    }
    if (p.inCar && dist(b.x, b.y, p.x, p.y) < 26) {
      p.health -= 4;
      dead = true;
    }
    b.dead = dead;
  }
  state.enemyBullets = state.enemyBullets.filter((b) => !b.dead);

  // Pickups.
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    if (dist(pk.x, pk.y, p.x, p.y) < 30) {
      if (pk.kind === 'health') p.health = Math.min(100, p.health + 50);
      else p.ammo += 12;
      state.pickups.splice(i, 1);
      sound.pickup();
      state.toast = pk.kind === 'health' ? '+50 health' : '+12 ammo';
      state.toastTime = 2;
    }
  }

  // Particles.
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // Camera follows the player.
  const cam = state.camera;
  cam.x += (p.x - cam.x) * Math.min(1, 5 * dt);
  cam.y += (p.y - cam.y) * Math.min(1, 5 * dt);
  cam.zoom = p.inCar ? 0.85 : 1;
  cam.x = clamp(cam.x, 0, WORLD);
  cam.y = clamp(cam.y, 0, WORLD);

  // Sound: engine + sirens.
  sound.setEngine(p.inCar ? Math.abs(p.car.speed) / p.car.model.top : 0, p.inCar);
  sound.setSiren(state.wanted > 0 && state.cars.some((c) => c.police));

  if (p.health <= 0) {
    die('wasted', 'You got wasted on the streets of Solmar Bay.');
    return;
  }

  // Global keys.
  if (input.wasPressed('p', 'escape')) state.screen = 'paused';
  if (input.wasPressed('m')) state.screen = 'missions';
  if (input.wasPressed('s') && input.down('control')) saveGame();
}

function updateTitle(dt) {
  state.time += dt;
  // Drift the camera over downtown behind the menu.
  state.camera.x = 4 * 400 + Math.sin(state.time * 0.05) * 500;
  state.camera.y = 4 * 400 + Math.cos(state.time * 0.04) * 500;
  const items = state.hasSave ? 3 : 2;
  if (input.wasPressed('arrowup', 'w')) state.menuIndex = (state.menuIndex + items - 1) % items;
  if (input.wasPressed('arrowdown', 's')) state.menuIndex = (state.menuIndex + 1) % items;
  if (input.wasPressed('1') && state.hasSave) continueGame();
  if (input.wasPressed('2') || (input.wasPressed('enter') && (!state.hasSave || state.menuIndex === 1))) startNewGame();
  if (input.wasPressed('enter') && state.hasSave && state.menuIndex === 0) continueGame();
  if (input.wasPressed('3') || (input.wasPressed('enter') && state.menuIndex === (state.hasSave ? 2 : 1))) state.screen = 'howto';
  if (input.consumeClick()) {
    // Clicking anywhere on the title starts a new game (or continues).
    if (state.hasSave) continueGame();
    else startNewGame();
  }
}

function updateHowTo() {
  if (input.wasPressed('escape', 'enter') || input.consumeClick()) state.screen = 'title';
}

function updatePaused() {
  if (input.wasPressed('p', 'escape')) state.screen = 'playing';
  if (input.wasPressed('s')) { saveGame(); state.toast = 'Game saved.'; state.toastTime = 2; state.screen = 'playing'; }
  if (input.wasPressed('m')) state.screen = 'missions';
  if (input.wasPressed('q')) { state.screen = 'title'; state.menuIndex = 0; }
}

function updateMissions() {
  if (input.wasPressed('escape')) { state.screen = state.screen === 'missions' ? 'playing' : state.screen; state.screen = 'playing'; return; }
  if (input.wasPressed('m')) {
    if (state.missionsDone < MISSIONS.length && !state.mission) {
      startMission(state, state.missionsDone);
      applyMissionStartEffects(state);
      state.screen = 'playing';
    } else if (state.mission) {
      state.toast = 'You already have a job running.';
      state.toastTime = 3;
      state.screen = 'playing';
    } else {
      state.toast = 'You cleared every job. The debt is paid, Rico.';
      state.toastTime = 4;
      state.screen = 'playing';
    }
  }
}

function updateDead() {
  if (input.wasPressed('enter')) {
    state.screen = 'playing';
    state.toast = 'Back on the streets. Stay sharp.';
    state.toastTime = 4;
  }
}

// --- Render -----------------------------------------------------------------------

function render() {
  const ctx = canvas.getContext('2d');
  const view = { w: canvas.width, h: canvas.height };
  if (state.screen === 'title') {
    drawTitle(ctx, state, view);
  } else if (state.screen === 'howto') {
    drawWorld(ctx, state, view);
    drawHowTo(ctx, view);
  } else if (state.screen === 'paused') {
    drawWorld(ctx, state, view);
    drawHUD(ctx, state, view);
    drawPause(ctx, view);
  } else if (state.screen === 'missions') {
    drawWorld(ctx, state, view);
    drawMissionList(ctx, state, view);
  } else if (state.screen === 'dead') {
    drawWorld(ctx, state, view);
    drawHUD(ctx, state, view);
    drawDead(ctx, state, view);
  } else {
    drawWorld(ctx, state, view);
    drawHUD(ctx, state, view);
  }
  if (state.screen === 'playing' && state.time < 1) {
    statusEl.textContent = 'Solmar Bay. Cash $' + state.cash + '. Wanted level ' + state.wanted + '.';
  }
}

// --- Boot -------------------------------------------------------------------------

function init() {
  state.hasSave = !!loadSave();
  state.menuIndex = 0;
  // Read-only handle for automated play-testing (used by the maker's own
  // probe scripts; the game never reads it).
  window.__solmarBay = state;
  // Seed the title backdrop with a living downtown.
  resetWorld();
  state.player.x = 4 * 400;
  state.player.y = 4 * 400;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    state.shotMode = shot;
    state.hasSave = false;
    applyShot(state, shot);
    // Simulate a fixed stretch so traffic, police and particles settle.
    for (let i = 0; i < 150; i++) {
      if (state.screen === 'playing') updatePlaying(1 / 60);
      else state.time += 1 / 60;
    }
    finalizeShot(state, shot);
    state.frozen = true;
    render();
    return;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.screen === 'title') updateTitle(dt);
    else if (state.screen === 'howto') updateHowTo();
    else if (state.screen === 'paused') updatePaused();
    else if (state.screen === 'missions') updateMissions();
    else if (state.screen === 'dead') updateDead();
    else if (state.screen === 'playing') updatePlaying(dt);
    render();
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// First gesture unlocks audio.
window.addEventListener('pointerdown', () => sound.ensure(), { once: true });
window.addEventListener('keydown', () => sound.ensure(), { once: true });

init();
