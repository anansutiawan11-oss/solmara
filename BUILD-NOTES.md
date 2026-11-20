# BUILD-NOTES — SOLMARA (make.fun gta6-01)

Entry: **SOLMARA — Open-World Crime in a Sun-Soaked Coastal City**
Repo (local, ready to push): `~/workspace/makefun/gta6-01/` → GitHub `anansutiawan/solmara` (not created/pushed yet — parent's job after `gh` login)
Recording: `01a1f7f0-5986-7008-8e77-f0a0bf539c13` (do NOT seal until the parent seals it)
Deadline: 2026-11-24T15:00:00Z (22:00 WIB). Built 2026-11-20.

## 1. Research summary

### Judging (from RULES.txt — the judge prompt is quoted there verbatim)
- AI judge (z-ai/glm-5.3-flash) compares entries **pairwise**, two at a time, by (a) a
  contact sheet of the screenshots (cover large on top, 3 small below) and (b) a short
  outline of the source (file paths + first declarations). 1,536 input tokens per entry.
- Criteria, most important first:
  1. **Complete open world, shown in screenshots**: city on foot and by car, traffic +
     pedestrians, wanted level with police responding, missions.
  2. Depth/fun: missions + story, vehicles to steal/drive, activities, combat, progression.
  3. Feel/polish: controls/camera, HUD + minimap, effects, menus.
  4. Look/originality: coherent sun-soaked modern city, lighting, art direction, own names.
  5. Structure: source split into files with one clear job each, named for what they do.
- "A screen that shows several systems at once (a chase with the wanted level, the
  minimap and a mission objective on the HUD) shows more of the game than one that
  shows a menu alone." → the **cover is the police chase**, not the title screen.
- Final heat: fresh judging after the deadline — 3 Swiss rounds + playoff among the
  top 100. Dev leaderboard is provisional only.

### Past winners (make.fun "Make the best game", 19,307 entries)
- Winner @zor-vink, **"PEONY SKY"** — firework festival game, woodblock art style,
  dense systems (7 nights, 6 shells, 8 spirits, 18 recipes, 3 bosses). Lesson: a
  **distinctive art direction + dense content** beats generic 3D. SOLMARA answers with
  a golden-hour coastal city identity (not a grey generic city) and 7 missions +
  full wanted/police/traffic/combat systems.

### Live competitors in gta6-01 (leaderboard fetched 2026-11-20)
- **10,364 submissions, 7,749 ranked.** Scores are a Bradley-Terry rating, extremely
  compressed: rank 1 = 993,977; rank 100 = 992,057; rank 1,000 = 988,047; median
  984,522. Every entry in the top ~5,000 is 12–0 in dev heats, so placement is
  decided by **who you beat** (opponent strength), i.e. by how decisively the judge
  prefers your screenshots + outline over other strong entries.
- Top entries' titles all promise the same checklist: 8–12 story missions, 5-star
  police with helicopter + roadblocks, weapon wheel, carjacking, garage upgrades,
  respect ranks, saves, radio. The bar for top 100 is a **complete, polished game
  whose screenshots prove it at a glance** — a thin demo cannot crack it.
- Honest assessment: top 100 (≥$4) is achievable — the game is genuinely complete and
  its screenshots are dense with visible systems. Top 10 ($38+) would need the judge
  to prefer it over entries with 8–12 missions and heavier content; SOLMARA has 7
  missions and a smaller city, so top 10 is a stretch. Top 3 ($150–$500) is unlikely
  against the strongest entries. The realistic target is **top 100, stretch top 50**.

### Our edge
- Screenshots staged to show **many systems in one frame** (cover: 4-star chase +
  helicopter + roadblock cruiser + mission objective + minimap with police dots +
  speed + cash + dialogue).
- Deterministic `?shot=` scenes (same seed → same frame), real gameplay simulated
  forward — no mocked-up frames.
- Full source in the dossier (123,275 chars, under the 160 KiB cap — nothing cut),
  14 source files with one clear job each.

## 2. What was built

**SOLMARA** — original open-world crime game, three.js r160 (vendored as
`game/vendor/three.module.min.js`), no build step, no network requests, all art
procedural (canvas textures), all sound synthesized (WebAudio).

- `game/index.html` — page + full HUD (cash/rank/health, wanted stars, mission
  objective + distance, weapon/ammo, speed, radio, live minimap, dialogue, prompts,
  title/pause/busted/wasted/story-end overlays).
- `game/src/city.js` — procedural golden-hour coastal city: 9×9 road grid, ~120
  buildings with lit-window facades, beach + ocean + boardwalk, palms, lamps, market
  stalls, casino with neon, garage, safehouse, named places.
- `game/src/player.js` — Mara Voss on foot: WASD + mouse orbit camera, sprint, jump,
  punch, walk-cycle animation, health regen.
- `game/src/vehicles.js` — box-built cars (sedan/sport/taxi/truck/limo/police),
  traffic AI on the road graph (lane offsets, car-following, braking for the player),
  arcade driving (accel/steer/handbrake, collisions, car damage/wrecks).
- `game/src/peds.js` — 22 pedestrians strolling sidewalks, fleeing from danger,
  knock-downs.
- `game/src/police.js` — wanted 0–5 stars, patrol cars that chase/ram/block, foot
  cops that arrest (on foot) and shoot, helicopter with searchlight at 4+ stars,
  heat decay when unseen, busted/wasted flow.
- `game/src/combat.js` — fists + pistol (raycast, muzzle flash, ammo/reload).
- `game/src/missions.js` — 7 story missions (Homecoming, Hot Wheels, The Pickup,
  Beach Run race vs 3 AI rivals, The Drop on-foot delivery, Heat Wave escape,
  King of Solmara finale), dialogue, rewards, rank progression, autosave.
- `game/src/hud.js` — HUD + live minimap (roads, beach, player arrow, traffic,
  police, mission target + dashed route).
- `game/src/audio.js` — 3 radio stations (synthwave/chill/bass step sequencer),
  engine hum, sirens, gunshots/crashes/pickups.
- `game/src/save.js` — localStorage saves (autosave per mission, safehouse, pause).
- `game/src/shots.js` — deterministic screenshot staging (`?shot=drive|start|foot|mission&seed=1`).
- `main.ts` — written by the agent in-session; copies game/ + screenshots/ to
  `/output`, writes `dossier.json` via vendored `vendor/makefun-game.ts` (unchanged,
  sha256 `dc671875…` verified against the kit).
- `serve.ts`, `LICENSE` (MIT), `shots.json` from the kit starter; `README.md` from
  the reqs template; `.makefun/owner.json` with wallet
  `4RxDCSWH1usVnDYUGt8DYEVT8G7SrnhurvxGnfTUheay`.

## 3. How to run / grade

```sh
cd ~/workspace/makefun/gta6-01
node serve.ts            # http://localhost:8080 — play in desktop Chrome
# screenshots (deterministic): headless Chrome, 1280x720
#   ?shot=drive | start | foot | mission  (&seed=1)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

Verification done 2026-11-20 (this session):
- All 13 game modules parse (`node --check`); plain page loads with **zero JS
  console errors**; all 4 `?shot=` scenes render in headless Chrome (SwiftShader).
- `main.ts` runs clean; two runs are **byte-identical** (grader runs it twice).
- Caps: game/ 18 entries / 793,088 bytes (limits 993 / 48 MiB); index.html 10,877
  bytes (limit 1 MiB); output 25 entries / 1.86 MB (limits 1,000 / 64 MiB);
  dossier.json 664,722 bytes (limit 1.5 MiB); 4 screenshots 1280×720, 93–108 KiB
  each (limits: ≤4, ≤256 KiB, long side ≤1280, short side ≥480).
- Built output re-served from `/tmp/out-gta6/game` and screenshotted — plays
  identically (vendored three.js resolves offline).
- Dossier text holds the **full** source (14 files, 122,407 bytes, no truncation).

## 4. Blockers / notes for the parent

- **Do NOT create the GitHub repo / push / submit from this session** — `gh` is not
  logged in on this VM. Repo is committed locally on branch `main` as
  `anansutiawan` (77756125+anansutiawan@users.noreply.github.com). After login:
  create public repo `anansutiawan/solmara` (created after 2026-11-17T15:00Z),
  push, then set Repo About (description/homepage/topics per
  `reqs/gta6-01.json` → `how_to_submit.repo_about`) — About is pending login.
- **Do NOT seal the recording** from here — report back and the parent seals it
  (usage file `~/.makefun/muse-usage-gta6-01.jsonl` is written, see below).
- `MAKEFUN_CREDENTIALS=$HOME/.makefun/credentials-gta6-01` for kit CLI commands.
- Playwright MCP is a listed prerequisite but was **not** used: no MCP server is
  configured in this session, and screenshots were taken with headless Chrome
  (Playwright's bundled Chromium 159) via the shell instead. The game was
  play-tested via deterministic `?shot=` simulation + console-error checks, not by
  a live mouse/keyboard session — the parent may want a live play-through before
  submitting (missions 1–7 flow, save/load round-trip).
- Known small warts (accepted): low-poly/box art style is deliberate (procedural);
  the drive-shot helicopter sits near the top edge of the frame; traffic cars do
  not collide with parked cars (parked cars sit in off-road lots, so it never
  shows); the title-screen vista is a street canyon, not a skyline panorama.
- Starter files copied from the kit: `LICENSE`, `vendor/makefun-game.ts`
  (unchanged), `serve.ts`. `main.ts` and **all** game code were written fresh by
  the agent in this recorded session; three.js is vendored as `*.min.js` (excluded
  from the transcript gate's counted lines, per RULES.txt).
