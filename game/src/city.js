// Solmar Bay city generation: a fixed 9x9 block grid of streets, districts and
// named landmarks. Everything is derived from one seed, so the map is the same
// every time the game loads. Roads run on a 400px pitch; blocks hold buildings.

import { makeRng, clamp } from './rng.js';

export const WORLD = 3600;
export const PITCH = 400;
export const ROAD_HALF = 46;
export const GRID = 9; // blocks per side; road centre lines at 0, 400, ... 3600

const DOWNTOWN_COLORS = ['#5b7fa6', '#6b8cae', '#4a6b8a', '#7d9bbd', '#557a9e'];
const BEACH_COLORS = ['#f2b8a0', '#f7cfae', '#e8a58c', '#f5d3a1', '#eda98f'];
const HOMES_COLORS = ['#c98f6b', '#b57d5e', '#d9a06f', '#a97a55', '#c48a62'];
const PORT_COLORS = ['#7a7f85', '#8a6f5c', '#6b7280', '#9a8a7a', '#5f6b7a'];
const ROOF_COLORS = ['#3a4a5c', '#4a3a2e', '#2e3d33', '#5c4a3a', '#33302e'];

export function roadCenter(i) { return i * PITCH; }

// Nearest point on the road network (centre line) to (x, y).
export function nearestRoadPoint(x, y) {
  const ix = clamp(Math.round(x / PITCH), 0, GRID);
  const iy = clamp(Math.round(y / PITCH), 0, GRID);
  const cx = ix * PITCH;
  const cy = iy * PITCH;
  // Snap to the closest axis road: compare distance to the vertical road x=cx
  // and the horizontal road y=cy.
  const dv = Math.abs(x - cx);
  const dh = Math.abs(y - cy);
  if (dv <= dh) return { x: cx, y, onVertical: true, node: { i: ix, j: clamp(Math.round(y / PITCH), 0, GRID) } };
  return { x, y: cy, onVertical: false, node: { i: clamp(Math.round(x / PITCH), 0, GRID), j: iy } };
}

export function buildCity(seed = 20261117) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];

  const zoneAt = (i, j) => {
    if (i >= 3 && i <= 5 && j >= 3 && j <= 5) return 'downtown';
    if (j === 8) return 'beach';
    if (i === 0) return 'port';
    if ((i === 4 && j === 1) || (i === 7 && j === 6)) return 'park';
    return 'homes';
  };

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const zone = zoneAt(i, j);
      const bx = i * PITCH + ROAD_HALF + 8;
      const by = j * PITCH + ROAD_HALF + 8;
      const bw = PITCH - 2 * ROAD_HALF - 16;
      const bh = PITCH - 2 * ROAD_HALF - 16;
      if (zone === 'park') {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        continue;
      }
      const palette = zone === 'downtown' ? DOWNTOWN_COLORS
        : zone === 'beach' ? BEACH_COLORS
        : zone === 'port' ? PORT_COLORS : HOMES_COLORS;
      const split = zone === 'downtown' ? rng.chance(0.55) : rng.chance(0.35);
      const spots = split
        ? [
          { x: bx, y: by, w: bw / 2 - 6, h: bh / 2 - 6 },
          { x: bx + bw / 2 + 6, y: by, w: bw / 2 - 6, h: bh / 2 - 6 },
          { x: bx, y: by + bh / 2 + 6, w: bw / 2 - 6, h: bh / 2 - 6 },
          { x: bx + bw / 2 + 6, y: by + bh / 2 + 6, w: bw / 2 - 6, h: bh / 2 - 6 },
        ]
        : [{ x: bx, y: by, w: bw, h: bh }];
      for (const s of spots) {
        const inset = zone === 'downtown' ? 0 : 6;
        buildings.push({
          x: s.x + inset, y: s.y + inset,
          w: s.w - inset * 2, h: s.h - inset * 2,
          color: rng.pick(palette),
          roof: rng.pick(ROOF_COLORS),
          height: zone === 'downtown' ? rng.int(3, 9) : zone === 'port' ? rng.int(1, 2) : rng.int(1, 3),
          zone,
        });
      }
    }
  }

  // Named landmarks (mission anchors). Each sits on a road edge so it is reachable.
  const landmark = (name, i, j, dx, dy, color, label) => ({
    name, x: i * PITCH + dx, y: j * PITCH + dy, color, label,
  });
  const landmarks = {
    hideout: landmark('hideout', 7, 7, -30, 120, '#e8b64c', 'HIDEOUT'),
    pier: landmark('pier', 8, 8, -160, 60, '#f2b8a0', 'PIER 9'),
    dealership: landmark('dealership', 2, 2, 120, -30, '#7d9bbd', 'SUNSET MOTORS'),
    chopshop: landmark('chopshop', 0, 5, 60, -120, '#8a6f5c', 'CHOP SHOP'),
    docks: landmark('docks', 0, 8, 140, -60, '#6b7280', 'DOCKS'),
    bank: landmark('bank', 4, 4, 60, 60, '#c9a227', 'SOLMAR BANK'),
    hospital: landmark('hospital', 6, 2, -120, 40, '#e8e8e8', 'GENERAL HOSPITAL'),
    policeHQ: landmark('policeHQ', 5, 6, 120, -40, '#3a5a8a', 'POLICE HQ'),
    garage: landmark('garage', 3, 7, -60, -120, '#5c7a5c', 'GARAGE'),
  };

  return { size: WORLD, pitch: PITCH, roadHalf: ROAD_HALF, grid: GRID, buildings, parks, landmarks, rng };
}

// Is (x, y) on a road (inside the asphalt strip)?
export function onRoad(city, x, y) {
  const mx = x % PITCH;
  const my = y % PITCH;
  const nearX = Math.min(mx, PITCH - mx) <= ROAD_HALF;
  const nearY = Math.min(my, PITCH - my) <= ROAD_HALF;
  return nearX || nearY;
}

// Pick a random road node (intersection) index pair.
export function randomNode(rng) {
  return { i: rng.int(0, GRID), j: rng.int(0, GRID) };
}

export function nodePos(node) {
  return { x: node.i * PITCH, y: node.j * PITCH };
}
