# Kart Rush GP — Architecture & Contracts

An original, AAA-polish arcade kart racer in the spirit of the classic console kart racers.
**No third-party IP**: original critter drivers, original tracks, original item names. Do not use or reference
Nintendo/Mario Kart names, characters, logos, music or assets anywhere (code, comments, UI text, file names).

- Tech: **Three.js r186** (`import * as THREE from 'three'`, addons via `three/addons/...`), plain ES modules + JSDoc,
  bundled by **esbuild** into ONE self-contained HTML file (JS + CSS + fonts inlined). No runtime network access.
- Frontend only. ALL persistence = `localStorage` (try/catch everything, in-memory fallback). See `src/save/`.
- Everything procedural: models are built from three.js geometry, textures from canvas, audio from WebAudio.
  No binary assets, no external files.
- Target: smooth 60 fps on an average laptop at "high" quality; degrade gracefully (quality presets, adaptive resolution).

## 1. Team, ownership, and how we avoid stepping on each other

Five agents work **in parallel in isolated git worktrees**; the lead merges. A baseline of the whole game already
exists and runs end to end: every agent *upgrades their own modules behind fixed seams*. Because the baseline is a
complete game, you can always test your work in context.

| Agent | Area | Owns (edit freely) | Brief |
|---|---|---|---|
| **A** engine | physics, camera, input, race rules, session hub, debug harness | `src/core/*`, `src/physics/*`, `src/camera/*`, `src/race/*` | `docs/tasks/A-engine.md` |
| **B** tracks | track engine, world, scenery, all courses | `src/track/*`, `src/tracks/*`, `src/world/*` | `docs/tasks/B-tracks.md` |
| **C** visuals | karts, drivers, VFX, renderer + post-processing | `src/vehicles/*`, `src/vfx/*`, `src/render/*` | `docs/tasks/C-visuals.md` |
| **D** gameplay | items, AI, audio | `src/items/*`, `src/ai/*`, `src/audio/*` | `docs/tasks/D-gameplay.md` |
| **E** ui | all UI, app flow, game modes, persistence | `src/ui/*`, `src/app/*`, `src/save/*`, `src/modes/*`, `src/shell/*` | `docs/tasks/E-ui.md` |
| lead | build, data, docs | `scripts/*`, `src/data/*`, `src/main.js`, `docs/*`, `package.json` | — |

Rules:
1. **Only edit files you own.** You may create new files inside your directories freely.
2. Shared append-only files: `src/core/events.js` (add events at the end of the right section), `src/core/math.js`
   (add helpers at the end). Anyone may append; never change/remove existing entries.
3. **Never change an existing public signature or field meaning** listed in this document. Additive changes only
   (new optional params, new fields, new methods). Others are coding against it right now.
4. Need something from another module? Code defensively against its absence (`obj.method?.()`), and put the request
   in your final report under **INTEGRATION NOTES** ("I need X from agent Y, file Z, because …"). Do NOT edit their files.
5. Do not add npm dependencies. Do not edit `package.json`, `scripts/build.mjs`, `RaceSession.js` (A only), roster data.
6. **Commit early and often** on your worktree branch (small, verified increments; clear messages). Unpushed/uncommitted
   work can be lost. Do NOT push to GitHub and do NOT create PRs — the lead merges your branch locally.
7. Keep a short `docs/<your-module>.md` (API, decisions, how to test, known issues) up to date — a successor may continue your work.

## 2. Conventions (get these right or nothing lines up)

- **Units**: metres, seconds, radians. A kart is ~2.5 m long, a road is 14–20 m wide, top speed ≈ 33–40 m/s (×3.6 = km/h).
- **Axes**: Y up, right-handed. **A kart (or any model) with `yaw = 0` faces +Z.** `forward(yaw) = (sin yaw, 0, cos yaw)`,
  `mesh.rotation.y = yaw`. `yaw` increases toward +X, which is the kart's **LEFT**. So *turning left = yaw increases*,
  *turning right = yaw decreases*, `right(yaw) = (-cos yaw, 0, sin yaw)`. Model-space: +X is the kart's left, +Z forward.
  Helpers in `core/math.js` (`forwardFromYaw`, `rightFromYaw`, `wrapAngle`, `angleDiff`, `damp`, `dampAngle`…).
- **Steering input**: `-1` = left, `+1` = right (so `yaw rate ∝ -steer`).
- **Track coordinates**: `s` = metres along the track in the driving direction `[0, length)`, `lateral` = metres from the
  centreline, **positive = RIGHT** of the driving direction. Positive `bank` rolls the road into a right-hand turn.
- **Randomness**: gameplay randomness (item rolls, AI mistakes, spawn jitter) MUST use `session.random()` (seeded) so races
  are reproducible. Cosmetic-only randomness may use `Math.random()`.
- **Performance**: no allocations in per-frame hot paths (reuse `Vector3`s). Merge static geometry, use `InstancedMesh`
  for repeated props, share materials/geometries, dispose what you create. Budget ≈ 600 draw calls total at "high",
  ≤ 8 draw calls per kart. Honour `session.quality` (see §4).
- **three r186 notes**: `PCFSoftShadowMap` no longer exists (use `PCFShadowMap`/`VSMShadowMap`); `THREE.Clock` is deprecated
  (use `performance.now()`); colour textures need `texture.colorSpace = THREE.SRGBColorSpace`; light intensities are
  physical (sun ≈ 2–4, hemisphere ≈ 0.6–1.2); `BufferGeometryUtils.mergeGeometries` is in `three/addons/utils/BufferGeometryUtils.js`.
- **Style**: ES modules, `const`/`let`, JSDoc on public APIs, no globals except `window.__kart`. Match the comment density of
  the existing code (explain *why*, not *what*). No TODO placeholders in finished code.

## 3. Runtime architecture

```
index.html (shell: canvas#game-canvas + div#ui-root)
 └─ main.js ─ new App()  ───────────────────────────────────────────────────  (E)
     ├─ Save/settings (E)   Input (A)   AudioManager (D)   GameRenderer (C)   UI (E)   MenuScene (E+C)
     └─ RaceSession (A hub) — one per race, created by app.startRace(config)
         ├─ track        Track  (B)          session.track
         ├─ karts[]      Kart   (A)          session.karts, session.player
         ├─ physics      KartPhysics (A)     race   RaceManager (A)    cameraRig ChaseCamera (A)
         ├─ items        ItemSystem (D)      ai     AIManager (D)
         ├─ vfx          VFX (C)             kart.visual  per-kart visuals (C)
         └─ events       EventBus            ← THE decoupling mechanism (src/core/events.js)
```

Per-frame order in `RaceSession.update(dt)` (dt ≤ 50 ms):
`player input → AIManager → ItemSystem → KartPhysics → RaceManager → track.update → kart.visual.update → VFX → ChaseCamera → audio.update`;
then `app.renderer.render(scene, camera, session)`, then `app.ui.update(dt, session)`.

**Events are how modules talk.** Physics/race/items *emit*; audio, vfx, visuals, camera, UI *listen*
(`session.on(EV.X, fn)` — auto-unsubscribed at dispose). Payloads are documented in `src/core/events.js`.
Read kart *state* directly when you need continuous values (speed, drift level, boost timer…).

## 4. Public contracts

### 4.1 `session` (RaceSession, owner A)
`session.app` · `.config` · `.events` · `.scene` (THREE.Scene) · `.camera` (PerspectiveCamera) · `.track` · `.karts[]` (grid order, `kart.id`
== grid slot) · `.player` (Kart) · `.cameraTarget` (Kart|null, set to spectate) · `.race` (RaceManager) · `.physics` · `.items` · `.ai` ·
`.vfx` · `.cameraRig` · `.settings` (live settings object) · `.quality` (live quality preset) · `.time` · `.random()` · `.on(type, fn)`.
`config = { mode:'versus'|'grandprix'|'timetrial', trackId, laps, speedClass:'rookie'|'pro'|'master', racers (1–12), player:{driverId,bodyId,name}, opponents?, playerGrid:'last'|'first'|'random'|n, items, seed, skipIntro, ghost }`.

### 4.2 `Kart` (owner A) — `src/physics/Kart.js`
Everything about a racer lives here; read the file, it is the contract. Key fields: `position` (ground contact point), `velocity`,
`yaw` (chassis) / `heading` / `moveYaw`, `speed` (signed m/s), `slide`, `grounded`, `vy`, `forward/right/up`, `orientation`,
`steerVisual`, `lean`, `spinAngle`, `surface`, `onRoad`, `query` (latest `TrackQuery`), `drift {dir, charge, level, hop, angle}`,
`boost {timer, duration, strength, source}`, `spin {timer}`, `invincible`, `shrink`, `rocket`, `stun`, `ink`, `coins`, `scale`,
`input` (`KartInput`), `locked`, `autopilot`, `race {distance, s, lateral, lap, place, finished, finishTime, lapTimes, bestLap, wrongWay, progress}`,
`item {type, count, roulette{active,timer,shown}}`, `root` (THREE.Group synced to the physics transform), `visual`, `ext` (private per-system data), `stats`, `driver`, `body`.
Effects API (items/rules call these): `applyBoost(strength, duration, source)`, `spinOut(duration, cause, dir)`, `launch(vy, cause)`,
`setInvincible(s)`, `shrinkFor(s)`, `setRocket(s)`, `addCoins(n)`, `cancelDrift()`, `placeAt(pos, yaw, speed)`, `isInvulnerable()`.
Hits that return `false` were blocked (invulnerable) — the attacker should emit `EV.ITEM_BLOCKED`.

### 4.3 Track (owner B) — `src/track/SplineTrack.js` (read it; it is the reference implementation)
`createTrack(id, {quality})` (from `src/tracks/index.js`) returns an object with:
- data: `id, name, theme, laps, length, count, spacing, def, hw[], zones[], boostPads[], ramps[], checkpoints[], itemBoxes[], coins[], minimap, racingLine{offset[],maxSpeed[]}, curvature[]`
- **queries (hot path, allocation-free)**: `project(worldPos, out:TrackQuery, hintIndex) → TrackQuery {s, lateral, halfWidth, shoulder, offset, height, normal, tangent, right, surface, onRoad, inBounds, zone, wall}` ·
  `sampleAt(s, out?) → TrackSample {position, tangent, right, up, halfWidth, shoulder, yaw}` · `pointAt(s, lateral, out, lift)` · `deltaS(a,b)` ·
  `resolveWalls(query, radius, out{depth,nx,nz}) → bool` · `getStartGrid(n) → [{s,lateral,position,yaw}]` · `getRespawn(s, lateral)` ·
  `lineOffsetAt(s)`, `maxSpeedAt(s)`, `curvatureAt(s)` (AI helpers).
- lifecycle: `attach(session)` (add to scene, set fog/background/lights, apply quality) · `applyQuality(q)` · `update(dt, session)` · `dispose()`.
- `surface` values: `Surface` enum + `SURFACE_PROPS` in `src/track/surfaces.js` (road, grass, sand, snow, ice, mud, water, boost, void).
- Zones (`def.zones`): `boost` pads (physics gives a boost), `ramp` (adds a height profile to `project().height` so karts launch naturally), `ice/mud/sand/water` (change surface).
- Registry (`src/tracks/index.js`): `TRACK_DEFS`, `CUPS`, `getTrackDef(id)`, `createTrack(id, opts)`. Each def needs
  `id, name, cup, theme, music, laps, difficulty (1–3), description, palette{skyTop,skyHorizon,ground,accent}, points[]` (+ optional zones, width, shoulder, openEdges, itemBoxRows…).
  UI uses the registry + `track.minimap` for cards; audio uses `def.music`.

### 4.4 Renderer (owner C) — `src/render/GameRenderer.js`, `quality.js`
`GameRenderer`: `.renderer`, `.setQuality(q)`, `.resize()`, `.setResolutionScale(s)`, `.render(scene, camera, session|null)`,
`.setEnvironmentProfile({exposure, bloomStrength, bloomThreshold, bloomRadius, vignette, saturation, contrast})` (tracks call it to set their look),
optional hooks `.onSessionLoaded(session)` / `.onSessionDisposed(session)`.
`session.quality = { id, pixelRatioMax, resolutionScale, shadows, shadowMapSize, bloom, postfx, particles (0–1.4 multiplier), sceneryDensity (0–1.25), antialias, drawDistance }`.
Budget-spending code (scenery, particles, shadows) must read it. Presets: `low`, `medium`, `high`, `ultra`; settings value `auto` adapts.

### 4.5 Visuals & VFX (owner C)
`attachKartVisual(kart, session)` sets `kart.visual = { root, update(dt, kart, session), dispose() }` and adds it under `kart.root`.
`createKartShowcase(driverId, bodyId, opts) → { root, update(dt), dispose() }` (menu turntables, podium). `getDriverPortrait(driverId, size) → canvas`.
`session.vfx.spawn(name, position, opts)` / `spawnForKart(kart, name, opts)` with names: `explosion, sparkle, smoke, hitStars, boostBurst, pickup, confetti, splash, dust, ring, respawn, shockwave`.
Unknown names must be a silent no-op (other agents call them). VFX also reacts to events and kart state by itself (drift sparks, boost flames, dust…).

### 4.6 Items / AI / Audio (owner D)
- `ItemSystem(session)`: `.group`, `.update(dt)`, `.giveItem(kart, type, count)`, `.useItem(kart, backward)`, `.dispose()`. `src/items/itemDefs.js`: `ITEM_DEFS`, `ITEM_ORDER`, `getItemIcon(id, size) → canvas`.
  HUD reads only `kart.item`, `kart.ink`, `kart.invincible`, `kart.shrink`, `kart.rocket` and the item defs.
- `AIManager(session)`: `.update(dt)` writes `kart.input` for `isAI || autopilot || rocket>0` karts. Only uses the Track API + kart state, so it works on any track.
- `AudioManager` (in `app.audio`): `unlock()` (from a user gesture), `ui(name)`, `sfx(name, opts)`, `attachSession/detachSession`, `update(dt, session)`, `playMusic(key)/stopMusic()`, `applySettings()`. Silent no-op until unlocked.

### 4.7 App / UI / Save (owner E)
`App` public API (used by the debug harness — keep working): `boot()`, `startRace(config)`, `quitToMenu()`, `setPaused(b)`, `paused`, `session`, `input`, `renderer`, `audio`, `save`, `settings`, `quality`, `events`, `ui`, `freeze`, `renderFrame()`, `defaultRaceConfig()`.
`Save`: `data`, `settings`, `profile`, `persistent`, `commit()`, `reset()`; schema in `src/save/defaults.js`. Other modules only READ `settings`.
Input hooks for the UI: `input.touch` (touch overlay writes it), `input.bindings` / `setBindings` / `captureNextKey`, `input.enabled`, `input.pressed(action)`.
Settings changes must apply live (quality → `app.renderer.setQuality`, volumes → `audio.applySettings()`).

### 4.8 Data (lead) — `src/data/roster.js`
8 drivers (`pip, rusty, bruno, hopper, luna, gizmo, rocco, quill`), 4 kart bodies (`classic, streak, hopper, crusher`), speed classes
(`rookie, pro, master`), `resolveStats()`, `combinedStats()`. Read-only for everyone else.

## 5. Debug / test harness — `window.__kart` (see `src/core/debug.js`)
```
await __kart.startRace({ trackId, laps:1, racers:6, speedClass:'pro', skipIntro:true, seed:1 })
__kart.freeze(true)      // stop the real-time loop; then YOU control time:
__kart.advance(30)       // simulate 30 s (1/60 s steps) with no rendering — fast
__kart.render()          // draw one frame (then screenshot)
__kart.autoDrive(true)   // AI drives the player kart
__kart.setInput({throttle:1, steer:-0.4, drift:true}) / clearInput()
__kart.state()           // JSON: phase, raceTime, player + all karts
__kart.teleport(kartId, s, lateral) / giveItem(type, count) / counts (event counters) / trackIds() / driverIds()
```
URL params: `?quality=low|medium|high|ultra  &scale=0.5  &autostart=1  &track=<id>  &laps=1  &racers=6  &driver=<id>  &kart=<id>  &speed=rookie|pro|master  &skipintro=1  &fps=1`.
Add your own helpers to `__kart` in a clearly marked section of `debug.js` (A owns the file: put requests in INTEGRATION NOTES) or expose them
from your module and call them via `__kart.app.session.<yourSystem>` in `playwright-cli eval`.

## 6. Build & test (details in `docs/TESTING.md`)
```
cd game && npm install            # once per worktree
npm run build                     # dist/index.html (single file) — < 1 s
node scripts/serve.mjs --port=81xx &      # then drive it with playwright-cli
node scripts/check.mjs --track=all --laps=2     # headless AI-race regression (exit 1 on problems)
```

## 7. Definition of done (every agent)
1. `npm run build` passes with no warnings; the game runs with **zero console errors** (ignore favicon).
2. `node scripts/check.mjs --track=all` passes (where your module affects races).
3. You verified visually/behaviourally with `playwright-cli` + screenshots (view PNGs with the Read tool) and scripted `__kart` tests.
4. Everything committed on your branch; `docs/<module>.md` written.
5. Final report: what you built, public API additions, **INTEGRATION NOTES**, known issues, how to test, branch name.
