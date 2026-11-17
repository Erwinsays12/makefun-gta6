// Cars, pedestrians, police, bullets and particles for Solmar Bay.
// Traffic follows the road grid; pedestrians walk the sidewalks; police chase
// the player when the wanted level is up. All movement is plain 2D physics
// with building collision.

import { clamp, dist, angleDiff, circleRectResolve, makeRng } from './rng.js';
import { PITCH, GRID, nodePos, randomNode } from './city.js';

export const CAR_MODELS = [
  { name: 'Sunny', color: '#d8c25a', len: 52, wid: 26, top: 240, accel: 420 },
  { name: 'Comet GT', color: '#e05a2e', len: 56, wid: 27, top: 330, accel: 560 },
  { name: 'Harbor Van', color: '#7a9bb5', len: 62, wid: 30, top: 200, accel: 340 },
  { name: 'Palm Taxi', color: '#e8c832', len: 54, wid: 27, top: 250, accel: 440 },
  { name: 'Bay Cruiser', color: '#4a7a5c', len: 58, wid: 28, top: 260, accel: 430 },
  { name: 'Street Coupe', color: '#8a5fc0', len: 54, wid: 26, top: 300, accel: 520 },
];

const PED_SHIRTS = ['#d94f3d', '#3d7ad9', '#e8e8e8', '#e8b64c', '#5cb85c', '#c05cb8', '#3dc9d9', '#f2f2f2'];

export function makeCar(x, y, heading, modelIndex, opts = {}) {
  const model = CAR_MODELS[modelIndex % CAR_MODELS.length];
  return {
    kind: 'car',
    x, y, heading,
    speed: 0,
    model,
    color: opts.color || model.color,
    police: !!opts.police,
    parked: !!opts.parked,
    driver: opts.driver !== undefined ? opts.driver : true,
    // Traffic AI state: current road direction (0=right,1=down,2=left,3=up)
    dir: opts.dir !== undefined ? opts.dir : 0,
    targetSpeed: opts.targetSpeed || 0,
    health: 100,
    stuck: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    kind: 'ped',
    x, y,
    heading: rng.range(0, Math.PI * 2),
    speed: rng.range(38, 68),
    shirt: rng.pick(PED_SHIRTS),
    // Sidewalk walking: road direction + which side.
    dir: rng.int(0, 3),
    side: rng.chance(0.5) ? 1 : -1,
    flee: 0,
    panic: 0,
  };
}

export function makeCop(x, y) {
  return {
    kind: 'cop',
    x, y,
    heading: 0,
    speed: 0,
    bust: 0, // seconds spent touching the player
    shootCooldown: 0,
  };
}

export function makeParticle(x, y, vx, vy, life, color, size) {
  return { x, y, vx, vy, life, maxLife: life, color, size };
}

const DIRS = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

// Lane offset: drive on the right side of the road, 18px off the centre line.
function laneOffset(dir, side) {
  const d = DIRS[dir];
  return { x: -d.y * 18 * side, y: d.x * 18 * side };
}

export function placeOnRoad(car, node, dir) {
  const p = nodePos(node);
  const off = laneOffset(dir, 1);
  car.x = p.x + off.x;
  car.y = p.y + off.y;
  car.dir = dir;
  car.heading = Math.atan2(DIRS[dir].y, DIRS[dir].x);
}

// --- Traffic ----------------------------------------------------------------

export function updateTrafficCar(car, dt, city, rng, playerPos) {
  if (car.parked) return;
  const d = DIRS[car.dir];
  const target = car.targetSpeed || 110;
  car.speed += clamp(target - car.speed, -260 * dt, 180 * dt);
  car.x += d.x * car.speed * dt;
  car.y += d.y * car.speed * dt;

  // At an intersection, maybe turn (never U-turn).
  const nx = Math.round(car.x / PITCH);
  const ny = Math.round(car.y / PITCH);
  const nearNodeX = Math.abs(car.x - nx * PITCH) < 6;
  const nearNodeY = Math.abs(car.y - ny * PITCH) < 6;
  if (nearNodeX && nearNodeY && nx >= 0 && nx <= GRID && ny >= 0 && ny <= GRID) {
    const r = rng.next();
    let nextDir = car.dir;
    if (r < 0.18) nextDir = (car.dir + 1) % 4; // left turn
    else if (r < 0.36) nextDir = (car.dir + 3) % 4; // right turn
    // Stay on the grid: bouncing at the edge roads.
    const nd = DIRS[nextDir];
    const tx = nx + nd.x;
    const ty = ny + nd.y;
    if (tx < 0 || tx > GRID || ty < 0 || ty > GRID) nextDir = car.dir;
    if (nextDir !== car.dir) {
      car.dir = nextDir;
      const off = laneOffset(nextDir, 1);
      car.x = nx * PITCH + off.x;
      car.y = ny * PITCH + off.y;
      car.heading = Math.atan2(DIRS[nextDir].y, DIRS[nextDir].x);
    }
  }
  // Keep heading aligned to the road direction.
  car.heading = Math.atan2(DIRS[car.dir].y, DIRS[car.dir].x);

  // Slow down for the car ahead on the same road.
  car.stuck = Math.max(0, car.stuck - dt);
}

// --- Pedestrians ------------------------------------------------------------

export function updatePed(ped, dt, city, rng, danger) {
  if (ped.flee > 0) {
    ped.flee -= dt;
    const a = Math.atan2(ped.y - danger.y, ped.x - danger.x);
    ped.x += Math.cos(a) * 150 * dt;
    ped.y += Math.sin(a) * 150 * dt;
    ped.heading = a;
  } else {
    const d = DIRS[ped.dir];
    const off = laneOffset(ped.dir, ped.side);
    // Walk along the road, 62px off the centre line (on the sidewalk).
    const targetX = Math.round(ped.x / PITCH) * PITCH + off.x * 3.4;
    const targetY = Math.round(ped.y / PITCH) * PITCH + off.y * 3.4;
    ped.x += d.x * ped.speed * dt + (targetX - ped.x) * 0.4 * dt;
    ped.y += d.y * ped.speed * dt + (targetY - ped.y) * 0.4 * dt;
    ped.heading = Math.atan2(d.y, d.x);
    const nx = Math.round(ped.x / PITCH);
    const ny = Math.round(ped.y / PITCH);
    if (Math.abs(ped.x - nx * PITCH) < 8 && Math.abs(ped.y - ny * PITCH) < 8) {
      if (rng.chance(0.3)) {
        const nd = (ped.dir + rng.pick([1, 3])) % 4;
        const t = { i: nx + DIRS[nd].x, j: ny + DIRS[nd].y };
        if (t.i >= 0 && t.i <= GRID && t.j >= 0 && t.j <= GRID) ped.dir = nd;
      }
    }
    if (danger && dist(ped.x, ped.y, danger.x, danger.y) < 90) {
      ped.flee = 1.6;
    }
  }
  // Stay inside the world.
  ped.x = clamp(ped.x, 20, city.size - 20);
  ped.y = clamp(ped.y, 20, city.size - 20);
  for (const b of city.buildings) circleRectResolve(ped, 10, b);
}

// --- Player car physics -----------------------------------------------------

export function driveCar(car, dt, input, city) {
  const model = car.model;
  const forward = input.down('w', 'arrowup') ? 1 : input.down('s', 'arrowdown') ? -0.55 : 0;
  const steer = (input.down('a', 'arrowleft') ? -1 : 0) + (input.down('d', 'arrowright') ? 1 : 0);
  const handbrake = input.down(' ') ? 0.86 : 1;
  car.speed += forward * model.accel * dt;
  car.speed *= Math.pow(handbrake, dt * 60);
  car.speed *= Math.pow(0.4, dt); // rolling drag
  car.speed = clamp(car.speed, -model.top * 0.45, model.top);
  const steerFactor = clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.heading += steer * 2.3 * steerFactor * dt;
  const nx = car.x + Math.cos(car.heading) * car.speed * dt;
  const ny = car.y + Math.sin(car.heading) * car.speed * dt;
  car.x = nx;
  car.y = ny;
  car.x = clamp(car.x, 24, city.size - 24);
  car.y = clamp(car.y, 24, city.size - 24);
  // Building collision: treat the car as a circle at its centre.
  for (const b of city.buildings) {
    if (circleRectResolve(car, 20, b)) {
      car.speed *= 0.45;
    }
  }
  return car;
}

// --- Police -----------------------------------------------------------------

export function updatePoliceCar(car, dt, target, city) {
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(car.heading, want);
  car.heading += clamp(diff, -2.6 * dt, 2.6 * dt);
  const d = dist(car.x, car.y, target.x, target.y);
  const targetSpeed = d > 260 ? 330 : d > 90 ? 250 : 150;
  car.speed += clamp(targetSpeed - car.speed, -420 * dt, 380 * dt);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;
  car.x = clamp(car.x, 24, city.size - 24);
  car.y = clamp(car.y, 24, city.size - 24);
  for (const b of city.buildings) {
    if (circleRectResolve(car, 20, b)) car.speed *= 0.5;
  }
}

export function updateCop(cop, dt, target, city) {
  const a = Math.atan2(target.y - cop.y, target.x - cop.x);
  const d = dist(cop.x, cop.y, target.x, target.y);
  const speed = d > 40 ? 165 : 0;
  cop.heading = a;
  cop.x += Math.cos(a) * speed * dt;
  cop.y += Math.sin(a) * speed * dt;
  for (const b of city.buildings) circleRectResolve(cop, 12, b);
  cop.shootCooldown = Math.max(0, cop.shootCooldown - dt);
}

// --- Bullets ----------------------------------------------------------------

export function makeBullet(x, y, angle, fromPlayer) {
  return { x, y, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780, life: 0.9, fromPlayer };
}

export function updateBullet(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.life -= dt;
}

export function spawnTraffic(rng, city, count, avoid) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const node = randomNode(rng);
    const dir = rng.int(0, 3);
    const car = makeCar(0, 0, 0, rng.int(0, CAR_MODELS.length - 1), {
      dir,
      targetSpeed: rng.range(85, 140),
    });
    placeOnRoad(car, node, dir);
    if (avoid && dist(car.x, car.y, avoid.x, avoid.y) < 500) continue;
    cars.push(car);
  }
  return cars;
}

export function spawnPeds(rng, city, count, avoid) {
  const peds = [];
  for (let n = 0; n < count; n++) {
    const node = randomNode(rng);
    const p = nodePos(node);
    const ped = makePed(p.x + rng.range(-140, 140), p.y + rng.range(-140, 140), rng);
    if (avoid && dist(ped.x, ped.y, avoid.x, avoid.y) < 300) continue;
    peds.push(ped);
  }
  return peds;
}

export { makeRng };
