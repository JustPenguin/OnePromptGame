# Agent A — Engine core: physics, camera, input, race rules

**Goal:** the game must *feel* like a AAA kart racer the moment you touch the keys: responsive, weighty, forgiving, and
deeply satisfying to drift. You own the feel. Everything else (tracks, items, visuals) is judged by how good the driving is.

**Read first:** `docs/ARCHITECTURE.md`, `docs/TESTING.md`, then the files you own (they are a working baseline, not a sketch to throw away — improve it):
`src/physics/Kart.js`, `src/physics/KartPhysics.js`, `src/race/RaceManager.js`, `src/camera/ChaseCamera.js`, `src/core/{Input,RaceSession,debug}.js`.
Also skim `src/track/SplineTrack.js` (the Track API you consume) and `src/core/events.js`.

**You own:** `src/core/*`, `src/physics/*`, `src/camera/*`, `src/race/*` (+ new files in them). Keep every public field/method signature that
other agents use (see ARCHITECTURE §4.2); add, don't rename.

## Deliverables (in priority order — commit after each)

### 1. Handling feel (highest priority)
Tune `KartPhysics` until a player can pick up the game and love it. Build a small repeatable **handling report** (a script under
`scripts/` or a `__kart` helper) that measures and prints the numbers below for Classic kart + Pip at class `pro`, and keep them inside the targets:
- 0→100 km/h ≈ 2.6–3.4 s; 0→top ≈ 5–7 s (strong initial launch, tapering). Top speed (pro) ≈ 120–130 km/h; boosted ≈ +35–45 %.
- Steering: tight at low speed, stable at top speed; turning radius at full lock ≈ 12–16 m @ 20 m/s, 22–32 m @ top speed. Keyboard steering is digital: make it feel analog (ramps in `Input`; consider a speed-sensitive steer limiter).
- **Drift**: tap drift (hop) while steering → committed drift with visible chassis angle; counter-steer to widen/tighten the arc; charge 3 mini-turbo levels
  (blue ≈ 0.85 s, orange ≈ 1.7 s, pink ≈ 2.7 s of charge — tune the feel, not just the numbers); release = boost kick (+ `EV.DRIFT_BOOST`).
  A skilled player must be clearly faster than someone who never drifts, but not by a silly margin. Drift must work on banked roads and survive small bumps; ending a drift must not teleport the kart's heading.
- Off-road: strong but fair slowdown (~55 % top speed), recoverable; heavy karts suffer less (`stats.offroadResist`). Ice (`Surface.ICE`): visibly slidey, still controllable.
- **Walls**: scraping along a wall at a shallow angle keeps most speed and swings the nose along the wall (no sticky walls, no pinball explosions); head-on hits cost real speed. Emit `WALL_HIT/WALL_SCRAPE`.
- **Kart–kart**: weight-based bumping, no sticking/jitter, no tunnelling at high closing speed; shrunk karts get bullied; invincible/rocket karts barge through (items system will spin victims on `EV.BUMP`).
- Spin-out / launch / recover (`Kart.spinOut/launch`): looks great (2 full rotations), control returns smoothly, brief grace so you can't be chain-hit unfairly.
- **Air**: ramps (zone `type:'ramp'` raises `query.height`), crests and drift hops; modest air control; soft landing recovery; `EV.JUMP/LAND`; optional *landing trick boost* if the player holds drift on take-off (small mini-boost).
- **Slipstream/drafting** (new): staying ≤ ~14 m directly behind another kart for ~1 s gives a gradual speed bonus (up to +6 %) and emits an event (add `EV.DRAFT` {kart, target, active} at the END of the race-flow section of events.js). Players and AI both benefit.
- Respawn ("rescue drone"): falling off an open edge or hitting the manual-respawn key (R, hold) carries the kart back over ~1.7 s with a smooth arc and brief invulnerability; make sure placement/lap logic stays consistent. Emit `RESPAWN/RESPAWN_DONE` (visuals will draw the drone).
- Rocket start (perfect launch at GO) and burnout (too early) — already stubbed; make them feel good and fair for keyboard players (window ≈ 0.45 s).
- Stats from `roster.js` must be *felt*: Bruno plows and tops out; Quill/Hopper zip and slide; Rocco bullies. Verify with the report.
- Frame-rate independence: results must be the same at 30/60/144 fps (`dt` sub-stepping is in place; keep it).

### 2. Camera (`ChaseCamera`)
Cinematic but never nauseating or in the way: smooth lag, speed FOV, boost kick + brief pull-back, drift swing (look into the turn), landing dip, hit shake (honour `settings.cameraShake`),
`lookBack`, three modes (`chase/far/close`, cycled by key `C`). **Never clip under the road/terrain** (use `track.project` height). Intro fly-over that is a real cinematic
(sweep the circuit from above/low angles using `track.sampleAt`, ends exactly behind the player's kart; ≈ 3.4 s, skippable by any key — expose `race.skipIntro()` use). Finish cam (orbit, then
spectate other karts: `session.cameraTarget`, cycle with left/right during `finishing/results`). Respawn camera behaviour. Camera must be correct when the browser tab is slow (dt clamps).

### 3. Input (`core/Input.js`)
Keyboard (rebindable), gamepad (analog steer/triggers, deadzone from settings, **rumble** via `vibrationActuator` on hits/boost/landing when `settings.vibration`; add `input.rumble(strong, weak, ms)`),
touch bridge (`input.touch`, consumed in `read()` — the overlay UI is Agent E's). No stuck keys on blur/focus loss/tab switch. Auto-accelerate assist. Look-back, camera cycle, pause, respawn actions.

### 4. Race rules (`RaceManager`, `RaceSession`)
Rock-solid lap/position logic on every track (hairpins, shortcuts, respawns, reversing at the line, ties); wrong-way detection; finish flow
(player finishes → AI takes over the kart, `finishing` phase, results after everyone finishes or timeout, DNF scoring); `race.standings()`; `EV.OVERTAKE/PLACE_CHANGE`.
**Time Trial support + ghosts**: `src/race/ghost.js` with `GhostRecorder` (records the player at ~30 Hz while racing, compact: ≤ 40 KB JSON for a 3-lap run — e.g. fixed-point int arrays) and
`GhostPlayer` (translucent kart via `attachKartVisual` + `kart.visual.setGhost?.(true)`, interpolated, optional). Wire into `RaceSession` for `config.mode === 'timetrial'`:
`session.ghostRecorder`, `session.ghostPlayer` (from `config.ghost`), and on `EV.RACE_RESULTS` expose `session.ghostResult = { time, driverId, bodyId, trackId, data }` so Agent E can persist it.
In time trial: no AI, no item boxes, the player starts with `items.giveItem(player, 'boost', 3)` (item system supports count>1), 3 laps by default.
Coins are handled by Agent D (item system) — you only provide `Kart.addCoins` / the speed bonus (already in physics).

### 5. Debug harness
Keep `window.__kart` solid and documented (`src/core/debug.js`). Add what you need for testing (e.g. `__kart.handling()` report, scripted-input macros). Other agents depend on `startRace/advance/render/state/setInput/autoDrive/counts`.

### 6. Performance
Physics + race update for 12 karts ≤ 0.6 ms/frame on a normal CPU; zero allocations in `stepKart/collideKarts` (the baseline emits `new Vector3` on wall/bump events only — keep it that way or pool).
Measure with `performance.now()` around `__kart.advance(60)`.

## Quality bar / acceptance
- `node scripts/check.mjs --track=all --laps=2` passes (AI finishes everywhere, no stuck karts) as tracks from Agent B land (on your branch only `sunny-meadows` exists — test with it, and write physics so it is robust on narrow roads, banking, elevation, ramps, hairpins).
- Handling report numbers in range; you personally *drove* it with scripted inputs (straight, slalom, drift, off-road, wall scrape, jump) and the traces look right (print `state()` series, view screenshots from the chase cam at key moments).
- No NaN under abuse tests (teleports, 12 karts piled on the grid, spinning at walls, 60 s of full lock).
- Camera screenshots in: normal, boosting, drifting, look-back, intro (3 frames), finish cam.

## Stretch (only after the above is excellent)
Replay camera at results; photo-finish slow-mo; tire-slip based controller vibration; adaptive steering assist for touch; "stats screen" data hooks (drift time, air time, distance) written to `session.stats` for Agent E's career stats.
