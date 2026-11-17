// Deterministic screenshot scenes for Solmar Bay. The ?shot= query parameter
// picks a scene; the setup places the player, cars, police and a mission, then
// the game simulates a fixed number of frames so the screenshot is stable.
// These are real renders of the game's own code, not composites.

import { makeCar, makePed, makeCop, spawnTraffic, spawnPeds } from './entities.js';
import { startMission } from './missions.js';

function downtown(state) {
  // A busy downtown intersection.
  return { x: 4 * 400, y: 4 * 400 };
}

export function applyShot(state, shot) {
  const rng = state.rng;
  const city = state.city;
  const c = downtown(state);

  if (shot === 'start') {
    state.screen = 'title';
    state.menuIndex = 0;
    state.player.x = c.x;
    state.player.y = c.y;
    state.camera.x = c.x;
    state.camera.y = c.y;
    return;
  }

  if (shot === 'drive') {
    state.screen = 'playing';
    const car = makeCar(c.x + 30, c.y, 0, 1, { dir: 0, targetSpeed: 0 });
    car.speed = 210;
    state.cars = [car];
    state.player.inCar = true;
    state.player.car = car;
    state.player.x = car.x;
    state.player.y = car.y;
    state.cars.push(...spawnTraffic(rng, city, 10, state.player));
    state.peds = spawnPeds(rng, city, 26, state.player);
    state.camera.x = car.x;
    state.camera.y = car.y;
    state.cash = 2450;
    return;
  }

  if (shot === 'chase') {
    state.screen = 'playing';
    const car = makeCar(c.x - 60, c.y + 20, 0, 1, { dir: 0, targetSpeed: 0 });
    car.speed = 260;
    state.cars = [car];
    state.player.inCar = true;
    state.player.car = car;
    state.player.x = car.x;
    state.player.y = car.y;
    state.wanted = 3;
    state.cash = 3120;
    state.player.health = 82;
    // Two police cars closing in from behind and ahead, one foot cop.
    const p1 = makeCar(c.x - 320, c.y + 18, 0, 0, { police: true, dir: 0 });
    p1.speed = 300;
    const p2 = makeCar(c.x + 420, c.y - 18, Math.PI, 0, { police: true, dir: 2 });
    p2.speed = 280;
    state.cars.push(p1, p2);
    state.cops = [makeCop(c.x + 90, c.y + 120)];
    state.cars.push(...spawnTraffic(rng, city, 8, state.player));
    state.peds = spawnPeds(rng, city, 18, state.player);
    state.camera.x = car.x;
    state.camera.y = car.y;
    return;
  }

  if (shot === 'mission') {
    state.screen = 'playing';
    startMission(state, 0);
    const lm = city.landmarks.pier;
    state.player.x = lm.x - 260;
    state.player.y = lm.y + 40;
    state.player.heading = Math.atan2(lm.y - state.player.y, lm.x - state.player.x);
    const car = makeCar(state.player.x + 60, state.player.y + 40, 0, 3, { dir: 0, targetSpeed: 0 });
    state.cars = [car];
    state.cars.push(...spawnTraffic(rng, city, 8, state.player));
    state.peds = spawnPeds(rng, city, 22, state.player);
    state.cash = 1250;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    return;
  }

  // Unknown shot name: plain free-roam downtown.
  state.screen = 'playing';
  state.player.x = c.x;
  state.player.y = c.y;
  state.cars = spawnTraffic(rng, city, 8, state.player);
  state.peds = spawnPeds(rng, city, 20, state.player);
  state.camera.x = c.x;
  state.camera.y = c.y;
}

// After the settle simulation, re-stage the action so the frozen frame reads
// as the scene it is: the getaway car moving again, the police closing in
// behind it, the wanted level still at full heat.
export function finalizeShot(state, shot) {
  const p = state.player;
  if (shot === 'drive' && p.inCar && p.car) {
    p.car.speed = 200;
    state.toast = '';
    state.toastTime = 0;
  }
  if (shot === 'chase' && p.inCar && p.car) {
    p.car.speed = 250;
    p.car.heading = 0;
    p.heading = 0;
    state.wanted = 3;
    state.crimeTimer = 25;
    state.wantedTimer = 15;
    state.player.health = 82;
    state.toast = '3 stars — lose the cops!';
    state.toastTime = 4;
    state.particles = [];
    // Police cars: one closing in from behind, one cutting across ahead.
    const police = state.cars.filter((c) => c.police);
    if (police[0]) {
      police[0].x = p.x - 300;
      police[0].y = p.y + 18;
      police[0].heading = 0;
      police[0].speed = 300;
    }
    if (police[1]) {
      police[1].x = p.x + 380;
      police[1].y = p.y + 18;
      police[1].heading = Math.PI;
      police[1].speed = 280;
    }
    state.camera.x = p.x;
    state.camera.y = p.y;
  }
  if (shot === 'mission') {
    state.toast = '';
    state.toastTime = 0;
  }
}
