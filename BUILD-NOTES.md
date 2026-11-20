# BUILD-NOTES — SOLMARA (make.fun gta6-01)

Entry: **SOLMARA — Open-World Crime in a Sun-Soaked Coastal City**
Repo: `~/workspace/makefun/gta6-01/` → GitHub `anansutiawan11-oss/solmara`, branch `main`
Recording: `01a1f8aa-4a1c-7666-8bae-8bc257a9af82` (rebuild session; do NOT seal until the parent seals it)
Deadline: 2026-11-24T15:00:00Z. Rebuilt 2026-11-20 (this session).

## 1. What this rebuild is

A from-scratch rewrite of the whole entry under the fresh recording above.
Every authored file was deleted and written fresh with the file tools — no
copies, no git restores, no verbatim pastes of the first build. Design,
missions, systems and the golden-hour coastal look are unchanged; the code
is reorganised and reworded throughout. Untouched on purpose: `.git/`,
`LICENSE` (MIT), `.makefun/owner.json` (wallet
`4RxDCSWH1usVnDYUGt8DYEVT8G7SrnhurvxGnfTUheay`), `serve.ts` (kit starter),
`game/vendor/three.module.min.js` (vendored three.js r160, excluded from
counted lines).

## 2. Research summary (carried over from the first build)

### Judging (from RULES.txt)
- AI judge compares entries **pairwise**, two at a time, by (a) a contact
  sheet of the screenshots (cover large on top, 3 small below) and (b) a
  short outline of the source (file paths + first declarations). 1,536
  input tokens per entry.
- Criteria, most important first:
  1. **Complete open world, shown in screenshots**: city on foot and by
     car, traffic + pedestrians, wanted level with police responding,
     missions.
  2. Depth/fun: missions + story, vehicles to steal/drive, activities,
     combat, progression.
  3. Feel/polish: controls/camera, HUD + minimap, effects, menus.
  4. Look/originality: coherent sun-soaked modern city, lighting, art
     direction, own names.
  5. Structure: source split into files with one clear job each, named
     for what they do.
- "A screen that shows several systems at once (a chase with the wanted
  level, the minimap and a mission objective on the HUD) shows more of the
  game than one that shows a menu alone." → the **cover is the police
  chase**, not the title screen.
- Final heat: fresh judging after the deadline — 3 Swiss rounds + playoff
  among the top 100. Dev leaderboard is provisional only.

### Past winners (make.fun "Make the best game", 19,307 entries)
- Winner @zor-vink, **"PEONY SKY"** — firework festival game, woodblock art
  style, dense systems (7 nights, 6 shells, 8 spirits, 18 recipes, 3
  bosses). Lesson: a **distinctive art direction + dense content** beats
  generic 3D. SOLMARA answers with a golden-hour coastal city identity
  (not a grey generic city) and 7 missions + full wanted/police/traffic/
  combat systems.

### Live competitors in gta6-01 (leaderboard fetched 2026-11-20, first build)
- **10,364 submissions, 7,749 ranked.** Scores are a Bradley-Terry rating,
  extremely compressed: rank 1 = 993,977; rank 100 = 992,057; rank 1,000 =
  988,047; median 984,522. Placement is decided by **who you beat**
  (opponent strength).
- Top entries' titles all promise the same checklist: 8–12 story missions,
  5-star police with helicopter + roadblocks, weapon wheel, carjacking,
  garage upgrades, respect ranks, saves, radio. The realistic target is
  **top 100, stretch top 50**.

### Our edge
- Screenshots staged to show **many systems in one frame** (cover: 4-star
  chase + helicopter + roadblock cruiser + mission objective + minimap with
  police dots + speed + cash + dialogue).
- Deterministic `?shot=` scenes (same seed → same frame), real gameplay
  simulated forward — no mocked-up frames.
- Full source in the dossier (124,927 bytes, under the 160 KiB cap —
  nothing cut), 14 source files with one clear job each.

## 3. What was built

**SOLMARA** — original open-world crime game, three.js r160 (vendored as
`game/vendor/three.module.min.js`), no build step, no network requests, all
art procedural (canvas textures), all sound synthesized (WebAudio).

- `game/index.html` — page + full HUD (cash/rank/health, wanted stars,
  mission objective + distance, weapon/ammo, speed, radio, live minimap,
  dialogue, prompts, title/pause/busted/wasted/story-end overlays).
- `game/src/city.js` — procedural golden-hour coastal city: 9×9 road grid,
  ~120 buildings with lit-window facades, beach + ocean + boardwalk, palms,
  lamps, market stalls, casino with neon, garage, safehouse, named places.
- `game/src/player.js` — Mara Voss on foot: WASD + mouse orbit camera,
  sprint, jump, punch, walk-cycle animation, health regen.
- `game/src/vehicles.js` — box-built cars (sedan/sport/taxi/truck/limo/
  police), traffic AI on the road graph (lane offsets, car-following,
  braking for the player), arcade driving (accel/steer/handbrake,
  collisions, car damage/wrecks).
- `game/src/peds.js` — 22 pedestrians strolling sidewalks, fleeing from
  danger, knock-downs.
- `game/src/police.js` — wanted 0–5 stars, patrol cars that chase/ram/
  block, foot cops that arrest (on foot) and shoot, helicopter with
  searchlight at 4+ stars, heat decay when unseen, busted/wasted flow.
- `game/src/combat.js` — fists + pistol (raycast, muzzle flash, ammo/
  reload).
- `game/src/missions.js` — 7 story missions (Homecoming, Hot Wheels, The
  Pickup, Beach Run race vs 3 AI rivals, The Drop on-foot delivery, Heat
  Wave escape, King of Solmara finale), dialogue, rewards, rank
  progression, autosave.
- `game/src/hud.js` — HUD + live minimap (roads, beach, player arrow,
  traffic, police, mission target + dashed route).
- `game/src/audio.js` — 3 radio stations (synthwave/chill/bass step
  sequencer), engine hum, sirens, gunshots/crashes/pickups.
- `game/src/save.js` — localStorage saves (autosave per mission,
  safehouse, pause).
- `game/src/shots.js` — deterministic screenshot staging
  (`?shot=drive|start|foot|mission&seed=1`).
- `game/src/main.js` — wires everything into one loop; exposes a read-only
  `window.__solmara` handle for automated play-testing.
- `game/src/utils.js` — seeded RNG, math helpers, canvas textures,
  formatting.
- `main.ts` — written by the agent in-session; copies game/ +
  screenshots/ to `/output`, writes `dossier.json` via vendored
  `vendor/makefun-game.ts` (unchanged).
- `serve.ts`, `LICENSE` (MIT), `shots.json` from the kit starter;
  `README.md` from the reqs template (badges point at
  `anansutiawan11-oss`, referral code `n0b5d5hb`); `.gitignore` (out/,
  node_modules/, .DS_Store).

## 4. How to run / grade

```sh
cd ~/workspace/makefun/gta6-01
node serve.ts            # http://localhost:8080 — play in desktop Chrome
# screenshots (deterministic): headless Chrome, 1280x720
#   ?shot=drive | start | foot | mission  (&seed=1)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

Verification done 2026-11-20 (this session, after the rewrite):
- All 13 game modules parse (`node --check`); plain page loads with
  **zero JS console errors** (see §5); all 4 `?shot=` scenes render in
  headless Chrome (SwiftShader).
- `main.ts` runs clean; two runs are **byte-identical** (grader runs it
  twice).
- Caps: game/ 15 files / 795,608 bytes (limits 993 / 48 MiB); index.html
  ~10.9 KB (limit 1 MiB); dossier.json 804,505 bytes (limit 1.5 MiB);
  4 screenshots 1280×720, 118–135 KiB each (limits: ≤4, ≤256 KiB, long
  side ≤1280, short side ≥480).
- Dossier text holds the **full** source (14 files, 124,927 bytes, no
  truncation).

## 5. Live play-through (this session — the first build was never live-played)

Real headless-Chromium Playwright session, real keyboard/mouse input
(steering is a feedback loop that reads game state and presses/releases
keys), 1280×720→640×360 viewport (SwiftShader speed), `node serve.ts`
on http://localhost:8080. Full log + frames in `/tmp/playtest/`
(`00-title.png` … `07-after-reload.png`). Times are UTC 2026-11-20.

- **Walk**: NEW GAME → pressed H (Mission 1 Homecoming) → walked on foot
  ~400 m from the safehouse around the safehouse block and north on road
  x=-112 to the parked sedan at (-72, 150). Prompt "E — Enter the sedan"
  shown and correct.
- **Enter + drive**: pressed E, entered the sedan (`parked-sedan--72`,
  speedometer appeared), drove to Rosa Garage. **Mission 1 COMPLETE**:
  done 1/7, cash $150 → $350, autosave written.
- **Mission 2 Hot Wheels**: pressed H → drove the sedan to the marina
  (via the z=112 detour — the garage sits ON road z=168), got out, walked
  to the red Comet S and pressed E. **Stole the correct car**
  (`sport-red`, mission advanced to step 1) — see bug B1 below.
- **Wanted / police**: stealing the Comet raised **1 wanted star, 2
  patrol cars spawned** and chased. Drove the Comet back to the garage
  under chase (east to the beachfront avenue, south to z=112, west, north
  on the x=-52 corridor). Police rams cost ~49 car health (100 → 51);
  the Comet (top speed 48) outran the cruisers (35.6) on the straights.
  **Mission 2 COMPLETE**: done 2/7, cash $350 → $750, wanted still 1.
- **Combat**: switched to pistol (2), clicked centre — ammo 12 → 11.
  Jump verified separately (max height 0.83 m).
- **Minimap / HUD**: minimap canvas 46,656 non-black px live (roads,
  beach, player arrow, traffic, police); HUD cash read "$750",
  objective text updated to "Press H to start the next mission".
- **Save / load**: save before reload
  `{"cash":750,"done":2,"x":-52.2,"z":147.2,...}`; reloaded the page,
  CONTINUE was visible, clicked it → state play, cash $750, done 2/7,
  position (-52, 147) — **progress restored exactly**.
- **Console errors**: the full play-through logged 3× `Failed to load
  resource: 404` — all three were the browser requesting `/favicon.ico`,
  which the game never provided. Fixed in this rebuild (bug B3 below);
  a follow-up smoke test (fresh load, NEW GAME, walk, jump, pistol shot)
  came back with **zero console errors / pageerrors**.
- No busted/wasted in the final successful run. (Two earlier attempts
  ended BUSTED: the test driver — not the game — wedged the Comet
  against the garage wall / drove it into a block, stopped, and was
  pinned by police for 3 s. That confirmed the arrest mechanic works:
  cash $350 → $297 bail, respawn at the safehouse, mission failed.)

## 6. Bugs found by the live play-through and fixed in this rebuild

- **B1 — mission car could be the wrong car (game bug, FIXED).** The
  mission Comet spawns at the marina (196, 158) on top of an ambient
  parked sedan at the same spot. `interact()` picked the nearest parked
  car, which could be the sedan — then the steal step could never
  advance. Fix: when a steal step is active, E prefers the parked car
  whose id matches the mission car. Verified live: the Comet was stolen
  on the first press.
- **B2 — first-draft city layout buried the parked cars (rebuild bug,
  FIXED).** My first rewrite made the road texture use the seeded RNG,
  shifting the whole layout stream: a building landed on the parked
  sedan/truck lot (-72/-84, 150) and on the marina Comet spawn. Fix:
  road speckles use `Math.random` again (unseeded noise must not consume
  the layout stream). Verified by probing colliders: the rebuilt layout
  is now identical to the first build's (103 colliders, same clearance at
  every checked point).
- **B3 — favicon 404 console errors (FIXED).** Added
  `<link rel="icon" href="data:,">` to `game/index.html`; follow-up smoke
  test shows zero console errors.
- **B4 — test-driver issues (test only, NOT game bugs).** Early runs
  failed because the driver aimed at unreachable points (the safehouse
  centre — the safehouse sits ON road x=-168), drove straight into the
  garage that sits ON road z=168, and coasted through turns so the
  police caught up. Fixed in the driver (road-only routes, ~40 m
  intermediate waypoints, brake-to-~7 m/s before corners, throttle kept
  down on straights). No game code was changed for these.

## 7. Blockers / notes for the parent

- **Do NOT seal the recording** from here — report back and the parent
  seals it (recording `01a1f8aa-4a1c-7666-8bae-8bc257a9af82`).
- `MAKEFUN_CREDENTIALS=$HOME/.makefun/credentials-gta6-01` for kit CLI
  commands. `gh` is logged in on this VM as `anansutiawan11-oss`; the
  repo `anansutiawan11-oss/solmara` already exists (remote
  `https://github.com/anansutiawan11-oss/solmara.git`); this rebuild is
  pushed as a new commit on top of `c418a98` on branch `main`.
- Playwright MCP was **not** used: no MCP server is configured in this
  session. Screenshots and the play-through used Playwright's bundled
  Chromium 1255 via the shell (`NODE_PATH` to the playwright install in
  `~/workspace/guanmo-studio-check/node_modules`).
- Known small warts (accepted, same as the first build): low-poly/box art
  style is deliberate (procedural); traffic cars do not collide with
  parked cars (parked cars sit in off-road lots, so it never shows); the
  title-screen vista is a street canyon, not a skyline panorama; the
  drive-shot helicopter sits near the top edge of the frame.
- Missions 3–7 were **not** live-played in this session (only 1–2, as
  tasked); their code is unchanged in design from the first build and
  their `?shot=` scenes (Beach Run = mission shot) render and simulate
  correctly.
