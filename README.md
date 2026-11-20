# SOLMARA

[![repo](https://img.shields.io/badge/repo-anansutiawan11--oss%2Fsolmara-blue)](https://github.com/anansutiawan11-oss/solmara)
[![make.fun](https://img.shields.io/badge/bounty-make.fun%20gta6--01-orange)](https://make.fun)

**SOLMARA** is an original open-world crime game set in a golden-hour coastal
city. You are **Mara Voss**, back in Solmara after years away — broke, with a
pistol, a fast car to steal, and a city to take.

Drive the grid streets, steal cars, outrun the Solmara PD (0–5 wanted stars,
patrol cars that ram, foot cops that arrest, a helicopter searchlight at 4+
stars), and work through **7 story missions** — from driving home to Rosa
Garage to becoming the King of Solmara.

## How to run

No build step, no install, no network at runtime. Everything is vendored or
procedural: three.js r160 lives in `game/vendor/`, all art is procedural
(canvas textures), all sound is synthesized (WebAudio).

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` directly from any static file server.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move on foot / drive |
| Mouse drag / Arrow keys | Orbit camera |
| E | Enter / exit car |
| F | Punch |
| K or Click | Shoot pistol |
| R | Reload |
| Space | Jump (on foot) / handbrake (driving) |
| Shift | Sprint |
| 1 / 2 / 3 | Radio stations (Synthwave / Chill / Bass) |
| M | Mute |
| P / Esc | Pause (autosaves) |
| Enter | Start / advance dialogue / next mission / respawn |

## Missions

1. **Homecoming** — drive from the safehouse to Rosa Garage. +$200
2. **Hot Wheels** — steal the red Comet S at the marina, bring it back under a
   1-star police chase. +$400
3. **The Pickup** — casino to market, no questions. +$350
4. **Beach Run** — race 3 rivals down the beach road. +$600
5. **The Drop** — an on-foot delivery at Mercado Central. +$300
6. **Heat Wave** — lose a 3-star heat, then get home. +$500
7. **King of Solmara** — the finale. +$1,000

Progress autosaves after every mission (localStorage) — reload the page and
press Enter to continue where you left off.

## The city

A seeded procedural city: a 9×9 road grid, ~120 buildings with lit-window
facades, a beach and ocean, boardwalk, palms, market stalls, the Solmara
Royale casino in neon, Rosa Garage, and the marina — all deterministic from
one seed, all bathed in golden-hour light.

## Tech

- three.js r160 (vendored, `game/vendor/three.module.min.js`)
- 14 ES modules under `game/src/` — city, player, vehicles, peds, police,
  combat, missions, HUD + live minimap, synth audio, saves, screenshot
  staging
- Deterministic screenshots: `?shot=drive|start|foot|mission&seed=1`
  simulates real gameplay forward a fixed number of ticks — same seed, same
  frame

## License

MIT — see [LICENSE](LICENSE).

---

Built for the make.fun bounty **gta6-01 "Make GTA 6"**.
Referral code: `n0b5d5hb`
