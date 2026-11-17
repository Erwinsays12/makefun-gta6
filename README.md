[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Erwinsays12/makefun-gta6/rank.svg)](https://make.fun/c/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Erwinsays12/makefun-gta6/reward.svg)](https://make.fun/c/gta6-01)

# Solmar Bay — an open-world crime game

An entry for the [Make GTA 6 competition on make.fun](https://make.fun/c/gta6-01):
an original open-world crime game that runs entirely from static files, in a
desktop browser, with no network requests.

You are **Rico Marlow**, a getaway driver who owes the Harbor Crew. Work the
debt off one job at a time across **Solmar Bay** — a sun-soaked city of your
own, with downtown towers, a beachfront, a port and the docks.

## What is in the game

- **A city to explore on foot and by car** — 9×9 blocks of streets, traffic,
  pedestrians, parks, a beach and a harbour.
- **Cars to steal and drive** — walk up to any car, press E, and take it.
  Parked cars are free; stealing one with a driver raises the heat.
- **Wanted level and police** — five stars of heat. Police cars chase and ram
  you; foot cops chase you down and bust you. Lay low and the stars fade.
- **Missions and a story** — five jobs for the Harbor Crew: a pickup at
  Pier 9, a stolen Comet GT, a timed drop at the Docks, surviving a 3-star
  heat wave, and the big bank score. Press M to start the next job.
- **Combat** — aim with the mouse, click or press F to shoot. Ammo and
  health pickups are scattered around the city.
- **HUD with a minimap** — cash, health, wanted stars, mission objective,
  speedometer, and a live minimap of Solmar Bay with police blips.
- **Start screen and saves** — title menu, how-to-play, pause, and automatic
  saving after every mission (plus manual save with S while paused).
- **Sound, all synthesised** — engine hum, sirens, gunshots and a bass loop,
  generated with the Web Audio API. No audio files.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Run |
| E | Enter or steal a car / exit a car |
| Mouse click or F | Shoot (on foot) |
| Space | Handbrake |
| H | Horn |
| M | Start the next mission / job list |
| P | Pause |
| S (while paused) | Save game |

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network.

## How it is built

- `game/index.html` + `game/src/*.js` — the game itself, plain ES modules,
  no library, no build step. Split into files with one job each: `city.js`
  (the map), `entities.js` (cars, pedestrians, police), `missions.js` (the
  story), `render.js` (drawing and HUD), `audio.js` (synthesised sound),
  `input.js`, `shots.js` (deterministic screenshot scenes) and `main.js`
  (the loop and game state).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored
  `vendor/makefun-game.ts`.
- `screenshots/` — four real renders of the game, taken in a desktop browser.

## License

MIT — see [LICENSE](LICENSE).
