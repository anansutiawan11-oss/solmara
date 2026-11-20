# SOLMARA — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/anansutiawan11-oss/solmara/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/anansutiawan11-oss/solmara/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Mara Voss is back in Solmara after five years away — a golden-hour coastal
city of beach boardwalks, neon casinos, night markets and fast cars. Steal
cars, outrun the Solmara PD, run jobs for Rosa at the garage, and take the
crown as **King of Solmara**.

Built for the [make.fun](https://make.fun) bounty **gta6-01 — "Make GTA 6"**.

## How to run

No build step, no network needed at runtime. Serve the `game/` folder with
any static server and open it in a desktop browser:

```sh
node serve.ts
# then open http://localhost:8080
```

Or open `game/index.html` directly from any static host. three.js r160 is
vendored locally under `game/vendor/` — the game makes zero network requests
while running. All art is procedural (canvas textures) and all sound is
synthesized with WebAudio.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move on foot / drive |
| Mouse drag | Orbit camera |
| E | Enter a car / interact / exit car |
| Click | Punch / fire pistol |
| 1 / 2 | Fists / pistol |
| R | Reload |
| Shift | Sprint |
| Space | Jump / handbrake (in car) |
| Q | Change radio station |
| Enter | Start mission / continue |
| Esc / P | Pause |
| M | Mute |

## Missions

Seven story missions with dialogue, cash rewards and rank progression, with
autosave after every mission:

1. **Homecoming** — drive from the safehouse to Rosa Garage ($200)
2. **Hot Wheels** — steal the red Comet S at the marina and bring it back ($400)
3. **The Pickup** — collect a package at the Night Market ($500)
4. **Beach Run** — race three rivals along the boardwalk ($700)
5. **The Drop** — deliver a package on foot ($600)
6. **Heat Wave** — escape a 3-star police hunt ($800)
7. **King of Solmara** — the Casino Sol finale ($1,500)

## Features

- Procedural golden-hour coastal city: 9×9 road grid, ~120 buildings with
  lit windows, beach, ocean, boardwalk, palms, casino neon, market stalls
- Wanted system (0–5 stars): patrol cars that chase and ram, foot cops that
  arrest and shoot, helicopter with searchlight at 4+ stars
- Traffic AI on the road graph with lane offsets and car-following
- 22 pedestrians who stroll, flee danger and get knocked down
- Fists + pistol combat, car damage and wrecks, health regen
- Three synthesized radio stations, engine hum, sirens, gunshots
- Live minimap with mission route, autosave to localStorage
- Deterministic screenshot mode: `?shot=drive|start|foot|mission&seed=1`

## Tech

- three.js r160 (vendored, no CDN at runtime)
- Plain ES modules, no build step, no runtime network requests
- `main.ts` hands the entry in: copies `game/` + `screenshots/` to the
  output dir and writes `dossier.json` via the vendored make.fun library

---

Built with [make.fun](https://make.fun) — referral code: `n0b5d5hb`
