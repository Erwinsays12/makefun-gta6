// Seeded randomness and small math helpers for Solmar Bay.
// The city layout is deterministic (fixed seed) so every run of the game
// builds the same streets; live traffic uses the same stream after it.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    chance(p) { return next() < p; },
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

// Shortest signed turn from angle a toward angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Circle vs axis-aligned rectangle: push the circle out, return true on hit.
export function circleRectResolve(c, r, rect) {
  const nx = clamp(c.x, rect.x, rect.x + rect.w);
  const ny = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * r;
    c.y = ny + (dy / d) * r;
  } else {
    // Centre inside the rect: push out along the smallest penetration axis.
    const left = c.x - rect.x;
    const right = rect.x + rect.w - c.x;
    const top = c.y - rect.y;
    const bottom = rect.y + rect.h - c.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) c.x = rect.x - r;
    else if (m === right) c.x = rect.x + rect.w + r;
    else if (m === top) c.y = rect.y - r;
    else c.y = rect.y + rect.h + r;
  }
  return true;
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
