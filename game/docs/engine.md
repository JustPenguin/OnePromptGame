# Engine core (Agent A): physics, camera, input, race rules

Owner: Agent A. Files: `src/physics/{Kart,KartPhysics,tuning}.js`, `src/camera/ChaseCamera.js`, `src/core/{Input,RaceSession,debug,bot,events,math}.js`,
`src/race/{RaceManager,ghost}.js`, plus the Node-side tooling `scripts/handling.mjs` and `scripts/lib/{rig,node-env}.mjs`.

Everything below is additive on top of the contracts in `docs/ARCHITECTURE.md`: no existing public field, method or event changed meaning.

## 1. Kart physics

### Model
Per kart we integrate `heading` (steered direction), `moveYaw` (direction of travel; it chases `heading` at the tyre-grip rate, so slip angle = yaw rate / grip),
`speed` (m/s along `moveYaw`) and `slide` (lateral m/s, only from impacts). Chassis `yaw = heading + drift.angle + spinAngle`.
`dt` is cut into sub-steps of at most 1/120 s (`T.substepHz`) and **every** integrator is written with the sub-step `h` (rates / exponentials, no per-step
constants), so results are identical at 30, 60 or 144 fps (`scripts/handling.mjs` checks 9 s of mixed driving: 30 vs 60 fps identical, 144 vs 60 fps 0.5 m apart).
Hot paths allocate nothing; event payload vectors (`WALL_HIT.point/normal`, `BUMP.point`) come from small ring buffers: **listeners must copy them** (as events.js says).

Per sub-step and kart (`KartPhysics.stepKart`): timers -> speed cap (surface, boost taper, coins, shrink, slipstream, rocket) -> drift state machine -> yaw (speed-dependent
authority, surface steer loss, drift mapping) -> tyre grip (slip) -> longitudinal (launch curve, boost surge, over-cap shedding, brake, coast, scrub) -> integrate ->
`track.project` -> walls -> ground/air -> zones (boost pad, off-road events) -> safety (fall, stuck, NaN). Then `collideKarts`, and per frame `finalize` (basis, orientation, lean, pitch, root transform).

### Where the numbers live
All feel constants are in `src/physics/tuning.js` (`T`), per-kart values derive from the roster stats in `derivePhys()` and are stored in `kart.phys`:
`launch` (standstill acceleration = roster `accel` x 1.14), `turn` (yaw rate at 60 % of top speed = roster `steerRate` x 0.76), `turnNorm`, `driftAngle`.
Roster (`src/data/roster.js`) is unchanged: `topSpeed, accel, grip, mass, driftTurn, miniTurbo, offroadResist` are used as given.

### Measured handling (Pip + Classic Racer, class `pro`; `node scripts/handling.mjs`)
| quantity | target | measured |
|---|---|---|
| 0 -> 100 km/h | 2.6-3.4 s | 2.95 s |
| 0 -> 98 % top speed | 5-7 s | 6.6 s |
| top speed | 120-130 km/h | 121 km/h |
| boost item gain | +35-45 % | +36 % (peak) |
| turn radius @ 20 m/s, full lock | 12-16 m | 13.1 m |
| turn radius @ top speed, full lock | 22-32 m | 28.2 m |
| free full-lock turn (speed bleeds to) | - | 81 % of top |
| drift mini-turbo levels | 0.85 / 1.7 / 2.7 s of charge | blue 0.8 / orange 1.6 / pink 2.5 s with the stick fully into the corner; 1.0 / 2.0 / 3.2 s with a light steer (from pressing drift) |
| drift radius @ 28 m/s: inside / neutral / outside | tighter + wider than plain | 15.6 / 27.4 / 115 m (plain full lock 21.4 m) |
| off-road (grass) speed | ~55 % | 60 % (Pip), 68 % (Bruno, heavy), 58 % (Quill) |
| brake top speed -> 0 | - | 1.0 s |
| wall scrape 8 deg / 15 deg / 30 deg / 60 deg / head-on | keeps most / ... / real loss | keeps 87 % / 82 % / 61 % / 21 % / ~0 % (0.6 s after contact) |
| chain-hit protection | no chain spins | spin 1.3 s + 0.9 s grace |
| 12-kart physics step | <= 0.6 ms | 0.03 ms (browser, 12 karts) |
| ghost size, 3 laps | <= 40 KB | 25.6 KB JSON |

### Drift (the part that matters most)
1. **Hop**: pressing drift while grounded and above 30 % of top speed hops (`T.hopVy`, EV.HOP) and *arms* the drift. Arming also works in the air so a press just before landing is not lost.
   The tyres keep 90 % grip during the hop so turn-in is not delayed.
2. **Commit**: while armed and steering > 0.25 the drift starts (`drift.dir` = -1 left / +1 right, EV.DRIFT_START). The direction is fixed until release.
3. **Steering inside a drift** is relative to the drift: `along = steer * dir` (+1 stick into the corner, -1 against it). Yaw-rate multiplier is piecewise-linear:
   0.14 (against) -> 0.5 (neutral) -> 1.3 (into) times the normal yaw-rate curve (`tuning.driftMul`). So a drift can be gentle (R ~ 115 m at 28 m/s) or tight (R ~ 16 m).
   Chassis shows `drift.angle` = 0.2..0.46 rad (more when steering into it, scaled by the driver's drift stat) on top of the slip, ~32 deg total.
4. **Charge**: `charge += h * miniTurbo * lerp(0.3, 1, along01)` (counts during the entry hop, not while airborne otherwise). Stick into the drift charges fastest; countersteering charges slowly,
   which kills "snaking" on straights. Levels at `DRIFT_LEVEL_TIME = [0.85, 1.7, 2.7]` charge-seconds (EV.DRIFT_LEVEL).
5. **Release**: boost `DRIFT_BOOST[level]` = +25 % 0.85 s / +33 % 1.25 s / +42 % 1.75 s (EV.BOOST source `'drift'`, EV.DRIFT_BOOST). The nose is handed over to the *velocity*
   (`heading := moveYaw + 0.25 * lead`) and `drift.angle` absorbs the difference, so `yaw` is continuous (max 3.3 deg per frame at release) and the chassis swings back smoothly;
   the travel direction does not change.
6. Cancelled by: speed < 20 % of top, spin-out, a hard wall hit (impact > 9 m/s), respawn. Bumps/ripples do not cancel it (airborne time only pauses charging).
7. **Landing trick**: holding drift through a ramp/crest jump (> 0.45 s of air) pays out a small boost on landing (`EV.BOOST` source `'trick'`).

Economy (lookahead bot, solo laps, `node scripts/handling.mjs --only=lapValue`): chained mini-turbos beat never drifting by ~2.7 % on R=90 m sweepers (2 corners/lap) and ~2.2 % on
R=45 m hairpins; the baseline Sunny Meadows has few real corners so the margin there is small. Skilled players on corner-rich tracks (6-10 corners/lap) gain proportionally more
(each orange boost is worth ~0.3 s). A sloppy drift into a wall costs far more than it earns.

### Other behaviours
* **Steering**: yaw rate = `phys.turn * authority(speed)`; authority ramps in below 6.5 m/s (no pivoting), tapers 30 % toward top speed; low-grip surfaces reduce it
  (`1 - 0.7 * (1 - surface grip)`: ice 0.45x, grass 0.83x). Cornering scrub: 13 %/s of speed at full lock at top speed (drifting: 4.5 %/s) + slip scrub.
* **Longitudinal**: `a = launch * (1 - v/cap)` (exponential approach: strong launch, long taper). Boosts surge toward the boosted cap at <= 30 m/s^2 (a start boost must not teleport the kart),
  and the last 0.35 s of a boost taper out (no cliff). Over-cap speed is shed at 1.7/s + 4 m/s^2.
* **Walls**: first contact after a gap is an *impact* (normal part bounces 18 %, tangential part loses 2.5 % + 45 % sin^2(angle)); continued contact is *sliding* (wall acts as a guide,
  16 %/s drag charged by time since the previous contact, nose swings parallel). Fires EV.WALL_HIT (impact > 3.5 m/s, 0.18 s cooldown) and, newly, **EV.WALL_SCRAPE** `{kart, active}` (starts on a repeat contact within 60 ms of the previous one while moving > 3 m/s, ends 120 ms after the last contact; a single bounce is not a scrape).
* **Kart vs kart**: circles r = 1.15 x scale; effective mass = `mass^1.7 * scale^2`; invincible / rocket karts get x12 mass (barge through; `EV.BUMP.ram` = that kart); restitution 0.4;
  time-based 0.25 s event cooldown. No tunnelling: relative speeds up to 80 m/s move < 0.7 m per 1/120 s sub-step vs 2.3 m contact distance.
* **Spin-out / launch**: spin angle is a pure function of elapsed time (2 turns, ease-out), speed bleeds 1.7/s; control then comes back smoothly (`kart.recover`: steering starts at 35 % and throttle at 50 %, ramping to full over 0.45 s). `spinOut()`/`launch()` return **false** when blocked and set `kart.blockReason`
  (`'shield' | 'rocket' | 'respawn' | 'finished' | 'recovering'`); while `hitGrace` (spin duration + 0.9 s) is running further spins/launches are ignored (no chain-spins). `shrinkFor()` ignores hitGrace.
* **Air**: gravity 32 m/s^2, 35 % steering control (90 % during a drift hop), nose follows the flight path (`finalize`), soft vertical focus for the camera. EV.JUMP / EV.LAND (impact > 5 m/s, air > 0.15 s).
* **Slipstream**: within 14 m (min 2.2 m) directly behind a kart going >= 55 % of top speed, same direction, lateral offset < 2 m (+5 % of distance): `kart.draft.t` builds over 1 s (decays in 0.45 s);
  bonus up to +6 % top speed plus +4 m/s^2 push. `EV.DRAFT {kart, target, active}` fires when it becomes visible (t > 0.3) / stops (t < 0.08). Applies to AI too.
* **Respawn** ("rescue drone"): fall (out of bounds 1.1 s / below the road), stuck (4 s, pedal down, < 1.2 m/s), manual (hold R / L3 / touch button 0.5 s). The kart is carried to `lastSafeS - 6 m` over 1.7 s on a smooth
  arc (EV.RESPAWN with `reason`, `kart.respawn.{from,to,t,dur}` for the drone), lands rolling at 28 % of top speed with `kart.grace` = 2.2 s of invulnerability (EV.RESPAWN_DONE). Race distance is delta-based so placement stays consistent.
* **Safety net**: a non-finite position/speed is recovered by an automatic rescue (`recoverNonFinite`). 60 s of abuse with 12 karts (full lock, drift spam, teleports) produces no NaN.

### New / extended public API
* `Kart`: `phys`, `grace`, `hitGrace`, `blockReason`, `draft {t, active, bonus, target}`, `air`, `scraping`, `pitch` (now written: squat/dive, **not** in `orientation`), `race.dnf`,
  `slipAngle` (chassis vs travel direction, rad) and `skid` (0..1 tyre slide: drives smoke / skid marks / squeal), getter `driftProgress` (0..1 toward the next mini-turbo level, for the HUD charge meter).
  `isInvulnerable()` also includes `grace`. `spinOut/launch/shrinkFor` document their false return (see above). `placeAt()` also clears drift/draft/wall state.
  `kart.orientation` includes the airborne nose pitch (up on the way up, down on the way down).
* `KartPhysics.steerForYawRate(kart, yawRate)` -> stick -1..1 that yields that yaw rate right now (speed, surface and drift aware; `+yawRate` = turn left). **AI should steer through this.**
  `maxYawRate(kart, speed?, drift?)` and `maxCornerSpeed(kart, curvature, {drift})` give the real limits for brake-point planning (verified: full lock at `maxCornerSpeed(1/R)` traces radius R within 1 %;
  e.g. R = 20 m -> 97 km/h, R = 14 m -> 76 km/h for Pip + Classic at `pro`). `track.maxSpeedAt()` assumes 24 m/s^2 lateral, the karts manage 29-41 m/s^2.
* `tuning.js` exports `T`, `DRIFT_LEVEL_TIME`, `DRIFT_BOOST`, `derivePhys`, `steerAuthority`, `driftMul`, `driftAlongFor` (`KartPhysics.js` re-exports the first three as before).
* Events: `EV.DRAFT` and `EV.PHOTO_FINISH` (new, race-flow section), `EV.WALL_SCRAPE` is now actually emitted, `EV.BUMP` payload gained `ram`, `EV.BOOST` sources gained `'trick'`.
* `EventBus` is now copy-on-write: emitting allocates nothing, handlers may (un)subscribe during an emit. Same API.

## 2. Camera (`ChaseCamera`)
* Modes `chase` / `far` / `close` (`CAMERA_MODES`), cycled by the camera key (`cameraRig.cycleMode()`), also follows `settings.cameraMode` live. `setMode(m)`, `snapToTarget()`, `cycleTarget(dir)`.
* Yaw follows the travel direction (60 % heading) with a speed-dependent lag, swings into drifts (`drift.angle * 0.45`); distance grows with speed (+1 m) and with boosts (pull-back), FOV = base + speed^1.5 * 8 deg + boost kick 9 deg + 1.5 deg in drifts
  (`settings.fovBoost`), landing dip, vertical focus smoothing (jumps feel soft), subtle camera roll, deterministic smooth shake (`settings.cameraShake`; everything above except pull/FOV is off with `settings.reducedMotion`).
* **Aspect-aware** (`framing()`): below aspect ~1.35 (portrait phones) the vertical FOV widens by up to +20 deg and the camera pulls back 28 % / up 20 %; above ~2.1 the vertical FOV is trimmed by up to 6 deg (verified at 390x844, 844x390, 1280x720, 1680x640).
* Never clips under the road or outside the walls: each frame `track.project(cameraPos)` -> height + 0.85 m minimum, and pulled inside `halfWidth + shoulder - 0.8` when the side has a wall.
* **Intro** (`race.phase === 'intro'`, 3.4 s): a quadratic-Bezier crane shot over the grid (high on the left -> beside the pack -> chase pose) whose aim point first sweeps along the REAL circuit ahead of the grid (`track.pointAt`: establishing shot of the first section) and then settles on the pack, smootherstep timing, FOV 44 -> chase FOV.
  The last keyframe is computed with the same numbers as the chase camera at standstill, so the hand-off is seamless (verified: the last intro frame and the first countdown frame are pixel-identical).
  Any key / tap / pad button after 0.35 s skips it (`input.anyPressed` -> `race.skipIntro()`); a skip eases into the chase pose.
* **Finish**: when the followed kart has finished the camera orbits it; after 5 s it auto-spectates (`cameraRig.autoSpectate`): the best-placed unfinished kart, the next one 2.5 s after each finishes, back to the player when everyone is done (`session.cameraTarget`). left/right (`input.pressed('left'|'right')`) cycles the target manually through the karts by race position and stops the automation.
* Respawn: slower yaw follow while the drone carries the kart, gentle catch-up afterwards. Slow tabs are safe (all exponential damping, session clamps dt to 50 ms).

## 3. Input (`core/Input.js`)
* Bindings unchanged (`DEFAULT_BINDINGS`, `setBindings`, `captureNextKey`). `pressed(action)` edges are cleared by `endFrame()`, which also samples the gamepad (so Start / Back edges are visible at the top of the next frame and while paused; in the baseline they were generated inside `read()` and cleared before `App.tick` could see them); **`respawn` never produces an edge** (it is hold-to-use: the session reads `isDown('respawn')`).
* Keyboard steering is a linear ramp: 5.6 units/s (4.2 at top speed) to build, 10/s to release, 17/s when reversing direction (counter-steer is instant). ~0.18 s to full lock.
* Gamepad: left stick x with `settings.gamepadDeadzone`, rescaled and curved (^1.25); d-pad steers (ramped); A/RT gas, B/LT brake, X/LB item, Y/R3 look back, RB drift, Back/D-up camera, Start pause, L3/D-down hold = respawn.
* `rumble(strong, weak, ms)` (honours `settings.vibration`, never stacks a weaker effect on a stronger one); `attachSession(session)` rumbles the player's pad on wall hits, bumps, landings, boosts, drift levels, hits, spins, respawn;
  `rumbleTick(dt, kart)` adds a low off-road rattle / drift hum (<= 9 Hz of calls).
* No stuck keys: `blur`, `pagehide`, `contextmenu`, `visibilitychange(hidden)` release everything; releasing Meta clears all keys (macOS swallows keyups).
* `input.anyPressed` (one frame after any key/tap/button except Escape), `input.speedRatio` (written by the session), `input.controller` (debug: `(out, dt) => void` replaces input every frame), `input.touch.respawn` (touch overlay may set it).
* Auto-accelerate assist and the touch bridge are unchanged. `settings.assists.steeringAssist` (and automatically a light version when the last device was touch) is implemented in `RaceSession.updateAssist`.

## 4. Race rules (`RaceManager`) and session
* Phases `intro -> countdown -> racing -> finishing -> results`; `race.countdownLeft`, `race.rocketWindowOpen`, `race.leader`, `race.isRacing` are new getters.
* **Progress** = signed distance from `deltaS`, so reversing, respawns and teleports can't double-count; laps/finish times are **interpolated inside the frame** they were crossed in (exact, frame-rate independent).
* **Positions**: insertion pass with a 0.4 m hysteresis (side-by-side karts don't chatter); finished karts rank by exact finish time. EV.PLACE_CHANGE / EV.OVERTAKE as before.
* **Rocket start**: throttle pressed no earlier than 0.45 s before GO gives +30 % for 0.7 s (`T.startBoost`; about 0.45 s / 15 m better than a well-timed normal start; EV.START_BOOST); throttle held from more than 1.0 s before GO = burnout (wheelspin: launch acceleration x0.3 for 1.2 s, `kart.burnout`, still steerable; EV.START_BURNOUT); in between nothing happens.
  AI karts get a modest +24 % / 0.55 s start boost 45 % of the time (`T.aiStartBoost`).
* **Wrong way** uses the velocity vector (so drifting/spinning chassis angles don't trip it), 1.0 s to trigger, quick to clear.
* **Finish flow**: player finishes -> autopilot cruise, `finishing` for up to 18 s, results when everyone is done (or DNF-scored by distance), solo/time trial ends immediately. `standings()` entries gained `lapTimes, distance, progress`.
* **Time trial** (`config.mode === 'timetrial'`): 1 racer, no AI, no item boxes (the session empties `track.itemBoxes` before the ItemSystem is built when `config.items` is false), the player starts with `giveItem(player,'boost',3)`.
  `session.ghostRecorder` records the run at 30 Hz of race time; when the player has finished `session.ghostResult` (a getter) is `{ time, bestLap, lapTimes, driverId, bodyId, trackId, laps, data }` - persist `data` (JSON-safe, ~25 KB for 3 laps)
  and pass it back as `config.ghost` (a ghostResult object also works) to race against it: `session.ghostPlayer` (translucent kart through `attachKartVisual` + `visual.setGhost?.(true)`, falls back to cloned translucent materials; hidden 4 s after its run ends).
  Format and size budget are documented at the top of `src/race/ghost.js`; replay error vs the original run was <= 5 cm.
* **Photo finish**: on the last lap, within ~15 m of the line with an unfinished rival within 3.5 m of the player, `session.timeScale` eases to 0.35 (everything in `update()` runs on scaled time, the camera narrows its FOV)
  and returns about 0.6 s after the player crosses. `EV.PHOTO_FINISH {active, rival}` for HUD / audio (e.g. a "PHOTO FINISH" flash, a pitch drop). Disabled under the debug `freeze` (tests stay deterministic),
  with `config.photoFinish === false` and with `settings.reducedMotion`.
* `session.ghostDelta` (getter): live time-trial delta against the ghost in seconds (+ = you are ahead), `null` when there is no ghost / before GO / after the ghost's run. `session.ghostPlayer.s` is the ghost's track position.
* `session.stats` (player only, while racing): `driftSeconds, airSeconds, boostSeconds, offroadSeconds, draftSeconds, distance, topSpeed, maxDriftLevel, driftBoosts, hops, jumps, wallHits, bumps, spinOuts, respawns` for the career stats.
* `session.respawnHold` 0..1 for a HUD ring.

## 5. Debug harness `window.__kart`
Existing: `startRace, counts, trackIds, driverIds, quit, freeze, pause, advance(s, step), advanceUntil, render, setInput, clearInput, autoDrive, state, teleport, giveItem`.
New (engine section): `bot(on, {drift, chain, ...})` drives the player with the test bot (rocket start, drifts, optional chained mini-turbos; uses `input.controller`), `trace({seconds, every, input})`,
`script(steps, until)`, `camera()`, `cameraMode(m)`, `skipIntro()`, `spin/launch/boost/respawn/setSpeed/shrink/invincible(kartId?, ...)`, `finishRace(order?, metresToGo)`, `perf(seconds)`, `physicsPerf(frames)`.
`state().karts[i]` gained `draft, grace, scraping, stun`. `teleport()` now re-projects the kart and snaps the camera.

## 6. How to test
```
cd game
node scripts/handling.mjs                      # Node-only handling report (~15 s): every number above, exit 1 on a miss
node scripts/handling.mjs --only=start,walls,eventsAudit,chaos   # sections: longitudinal steering start drift offroad walls karts spinAndAir slipstream frameRate lapValue terrain abuse eventsAudit chaos perf
node scripts/handling.mjs --roster             # + stat-spread table for 8 driver/kart combos
node scripts/handling.mjs --driver=bruno --body=crusher --class=master --only=drift,walls
node scripts/check.mjs --track=all --laps=2    # headless AI races in Chromium (D's AI on this physics)
```
Browser: `node scripts/serve.mjs --port=8101 &`, `playwright-cli -s=a open http://127.0.0.1:8101/?quality=low --config=tools/playwright-cli.config.json`, then run-code scripts that `startRace`, `freeze`, `bot(true)`/`setInput`, `advance`, `render`
and `page.screenshot` (see `docs/TESTING.md`). `scripts/lib/rig.mjs` builds real `SplineTrack`s with DOM stubs and a mock session (stadium / walls / ice / hairpin / hilly-banked "coaster" / rippled circuits) for physics experiments in Node.

## 7. Known issues / ideas
* The drift button always hops (like the genre); hop-spamming costs nothing but also gains nothing. A hop cooldown could be added if testers abuse it.
* Drift economy was tuned on test circuits and the baseline course; re-check `handling.mjs --only=lapValue` style numbers on the final tracks (target: chained drifting 4-7 % faster than never drifting on corner-rich courses).
* `steerForYawRate` assumes the wanted yaw rate is reachable; at the limit it saturates at full lock (AI should brake for corners it cannot take; `track.maxSpeedAt` assumes 24 m/s^2 lateral, the karts manage 29-41).
* Slope (uphill/downhill) does not change speed; banking is visual + height only (no extra grip).
* Camera clearance only knows the road surface and the corridor walls; scenery that overhangs the road (tunnels, trees) is not avoided.
* Stretch not done: replay camera at results.
