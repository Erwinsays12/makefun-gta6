// Story missions for Solmar Bay. Rico Marlow, a getaway driver who owes the
// Harbor Crew, works off the debt one job at a time. Each mission is a list of
// stages: go somewhere, pick something up, wait it out, or survive the heat.
// The main loop calls updateMission every frame; it returns events the loop
// turns into toasts, sounds and cash.

import { dist } from './rng.js';

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'The Pickup',
    brief: 'Lena is waiting at Pier 9. Pick her up and bring her to the Hideout. No cops, no fuss.',
    reward: 300,
    stages: [
      { type: 'goto', at: 'pier', radius: 90, text: 'Drive to Pier 9 and pick up Lena' },
      { type: 'goto', at: 'hideout', radius: 100, text: 'Bring Lena to the Hideout' },
    ],
  },
  {
    id: 'hotwheels',
    title: 'Hot Wheels',
    brief: 'A Comet GT is parked outside Sunset Motors. Take it — quietly — and deliver it to the Chop Shop.',
    reward: 500,
    stages: [
      { type: 'steal', at: 'dealership', radius: 80, text: 'Steal the Comet GT at Sunset Motors' },
      { type: 'goto', at: 'chopshop', radius: 100, text: 'Deliver the Comet GT to the Chop Shop' },
    ],
  },
  {
    id: 'drop',
    title: 'The Drop',
    brief: 'A package is waiting at the Garage. Get it to the Docks in 100 seconds — the buyers do not wait.',
    reward: 600,
    stages: [
      { type: 'goto', at: 'garage', radius: 90, text: 'Pick up the package at the Garage' },
      { type: 'goto', at: 'docks', radius: 100, time: 100, text: 'Deliver the package to the Docks — fast!' },
    ],
  },
  {
    id: 'heat',
    title: 'Heat Wave',
    brief: 'The crew set you up: three stars and every cop in Solmar Bay is on you. Survive 60 seconds and lose them.',
    reward: 800,
    stages: [
      { type: 'survive', time: 60, wanted: 3, text: 'Survive the heat — 3 stars, 60 seconds' },
    ],
  },
  {
    id: 'bigscore',
    title: 'The Big Score',
    brief: 'Solmar Bank. Walk in, empty the vault, and get to the Hideout with four stars on your tail. This clears the debt.',
    reward: 2000,
    stages: [
      { type: 'goto', at: 'bank', radius: 90, text: 'Get to Solmar Bank' },
      { type: 'wait', at: 'bank', radius: 70, time: 6, text: 'Empty the vault — stay inside!' },
      { type: 'goto', at: 'hideout', radius: 100, wanted: 4, text: 'Escape to the Hideout — 4 stars!' },
    ],
  },
];

export function startMission(state, index) {
  const def = MISSIONS[index];
  state.mission = {
    def,
    index,
    stage: 0,
    stageTime: 0,
    done: false,
    failed: false,
  };
  state.toast = def.title + ' — ' + def.brief;
  state.toastTime = 6;
  return state.mission;
}

export function missionTarget(state) {
  const m = state.mission;
  if (!m || m.done || m.failed) return null;
  const stage = m.def.stages[m.stage];
  if (!stage) return null;
  if (stage.at) {
    const lm = state.city.landmarks[stage.at];
    return { x: lm.x, y: lm.y, label: lm.label, radius: stage.radius || 90 };
  }
  return null;
}

export function updateMission(state, dt) {
  const m = state.mission;
  if (!m || m.done || m.failed) return null;
  const stage = m.def.stages[m.stage];
  if (!stage) {
    m.done = true;
    return { type: 'complete', mission: m.def };
  }
  m.stageTime += dt;
  const px = state.player.x;
  const py = state.player.y;

  if (stage.type === 'goto' || stage.type === 'wait') {
    const lm = state.city.landmarks[stage.at];
    const d = dist(px, py, lm.x, lm.y);
    if (stage.type === 'goto') {
      if (d < stage.radius) return advanceStage(state);
    } else {
      if (d < stage.radius) {
        if (m.stageTime >= stage.time) return advanceStage(state);
      } else {
        m.stageTime = 0; // leaving the vault resets the timer
      }
    }
  } else if (stage.type === 'steal') {
    // Complete when the player is driving the mission car (the orange Comet GT
    // parked at the dealership) — main.js sets state.missionCarTaken.
    if (state.missionCarTaken) return advanceStage(state);
  } else if (stage.type === 'survive') {
    if (m.stageTime >= stage.time) return advanceStage(state);
  }
  // A timed goto stage that runs out fails the mission.
  if (stage.time && stage.type === 'goto' && m.stageTime > stage.time) {
    m.failed = true;
    return { type: 'failed', mission: m.def, reason: 'Out of time — the buyers walked away.' };
  }
  return null;
}

function advanceStage(state) {
  const m = state.mission;
  m.stage++;
  m.stageTime = 0;
  if (m.stage >= m.def.stages.length) {
    m.done = true;
    return { type: 'complete', mission: m.def };
  }
  const next = m.def.stages[m.stage];
  state.toast = next.text;
  state.toastTime = 4;
  // A stage can raise the heat the moment it starts.
  if (next.wanted) state.wanted = Math.max(state.wanted, next.wanted);
  if (m.def.stages[m.stage - 1] && m.def.stages[m.stage - 1].wanted) {
    // keep the wanted level set by the previous stage
  }
  return { type: 'stage', mission: m.def, stage: next };
}

export function applyMissionStartEffects(state) {
  const m = state.mission;
  if (!m) return;
  const stage = m.def.stages[0];
  if (stage && stage.wanted) state.wanted = Math.max(state.wanted, stage.wanted);
  if (m.def.id === 'hotwheels') {
    // Park the orange Comet GT outside Sunset Motors for the player to take.
    const lm = state.city.landmarks.dealership;
    state.missionCar = {
      x: lm.x + 40, y: lm.y + 30, heading: 0,
      speed: 0, model: { name: 'Comet GT', color: '#e05a2e', len: 56, wid: 27, top: 330, accel: 560 },
      color: '#e05a2e', police: false, parked: true, driver: false,
      dir: 0, targetSpeed: 0, health: 100, stuck: 0, kind: 'car', mission: true,
    };
    state.cars.push(state.missionCar);
  }
}
