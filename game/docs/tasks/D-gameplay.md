# Agent D — Items, AI opponents, and procedural audio

**Goal:** the chaos and the soundtrack. Items that create the classic "oh no!" / "YES!" moments, AI rivals that race like humans (clean lines, mistakes, drama,
overtakes, comebacks), and a fully procedural soundscape (engines, drifts, hits, music) that makes every moment feel punchy.

**Read first:** `docs/ARCHITECTURE.md` (§4.2 Kart effects API, §4.6 yours), `docs/ART_DIRECTION.md` (audio section), `docs/TESTING.md`, then your baseline: `src/items/{ItemSystem,itemDefs}.js`,
`src/ai/AIManager.js`, `src/audio/AudioManager.js`; plus `src/physics/{Kart,KartPhysics}.js` (what you can affect), `src/core/events.js`, `src/data/roster.js` (stats + `personality`), `src/track/SplineTrack.js` (Track API for AI).

**You own:** `src/items/*`, `src/ai/*`, `src/audio/*` (+ new files). Keep exported APIs; add, don't rename.

## Deliverables (priority order — commit after each)

### 1. Items (original designs; ids in code, names on screen)
Item slot model: `kart.item = {type, count, roulette}`; **multi-use items are the same `type` with `count > 1`** (e.g. `giveItem(kart,'boost',3)`; the HUD shows a ×3 badge). Pickup → roulette (≈ 1.7 s, ticking icons) → item.
Use = press of `kart.input.item`; **hold brake while pressing to throw/drop BACKWARD**; forward otherwise. Held projectiles/traps can trail/orbit behind the kart as a shield while held (count>1 orbit visibly).
Distribution is **position-weighted** (leaders get weak items, last place gets strong ones), seeded (`session.random()`), no immediate repeats, Time Trial disables boxes.

| id | name | behaviour |
|---|---|---|
| `boost` | Nitro Boost | burst of speed (`applyBoost`), also ×3 |
| `peel` | Slick Peel | trap dropped behind (or thrown forward); spins whoever hits it; ×3 trail |
| `orb` | Ricochet Orb | rolls along the road, bounces off walls ≈ 4×, spins what it hits, expires; ×3 orbit |
| `seeker` | Seeker Rocket | homes on the next kart ahead, follows the road (uses Track API), explodes on hit |
| `bomb` | Time Bomb | thrown/dropped, timer + proximity, blast radius → `launch` |
| `comet` | Comet | rare, only back of the pack: arcs over the pack and dives onto the race leader (area blast); shield saves |
| `shock` | Storm Zap | everyone else shrinks (`shrinkFor`) and slows for ~6 s, screen flash event; leader-ish only |
| `shield` | Prism Shield | invincibility ≈ 7 s + speed bonus; rams spin others (listen to `EV.BUMP`) |
| `rocket` | Rocket Rider | auto-drive (uses `kart.setRocket`; AIManager drives it) fast + invulnerable ≈ 6 s |
| `ink` | Ink Splat | splatters ahead karts' screens: sets `victim.ink = 5` (HUD overlay is Agent E's) |
Also: **coins** (`track.coins` → collect with `kart.addCoins`; respawn each lap; mini sparkle), item-box visuals (animated glossy cube, "?" glyph, shatter burst via `session.vfx.spawn('pickup')`),
hazard/projectile meshes with trails & glow, explosions via `session.vfx.spawn('explosion', pos, {scale})`, `EV.ITEM_*` events for everything (audio/camera/UI/VFX listen).
`getItemIcon(id, size)`: **beautiful procedurally drawn icons** (canvas, gradients, outlines; consistent style) — used in the HUD roulette. Extend `ITEM_DEFS` with `name, desc, color, kind`.
Hits: call `victim.spinOut/launch/shrinkFor` — if it returns `false` emit `EV.ITEM_BLOCKED`. Spatial queries must be cheap (≤ 12 karts × ≤ 40 entities per frame).

### 2. AI opponents
Own the whole `AIManager` (`kart.ext.ai`): human-like racing on ANY track using only the Track API (`project/pointAt/lineOffsetAt/maxSpeedAt/curvatureAt`) — never hard-code a track.
- Racing line with lookahead steering (PD), corner-speed control from `maxSpeedAt`, **drift through long corners** to charge mini-turbos (release on exit), start boost, use boost pads, recover from walls/spins, **stuck recovery** (reverse/re-aim/respawn via `session.physics.respawnKart`).
- Lane choice/overtaking (offset around slower karts), **hazard dodging** (peels/bombs/orbs ahead), slipstream use, avoiding contact when pointless, bumping when aggressive.
- **Item use heuristics**: boost on straights/after hits, throw forward when a kart is ahead & aligned, drop traps when chased, fire seekers at the next kart, shield when threatened, save defensive items, wait for a good moment (not always instantly).
- **Difficulty** via `config.speedClass` (`SPEED_CLASSES.aiSkill` range): Rookie = slower, makes mistakes (wide lines, missed drifts); Pro = solid; Master = near-perfect, aggressive item play. **Rubber-banding** that is gentle and invisible (a few % speed, better items when far behind; leaders ease slightly) — races stay close without feeling fake.
- **Personalities** from `driver.personality` (aggression, boldness) and driver stats: Bruno/Rocco bully, Hopper/Luna take clean drift lines, Rusty takes risks.
- Finished karts and the player after finishing (`kart.autopilot`) cruise sensibly. AI must **finish every race on every track** (Agent B's tracks will land later; keep it generic and robust). Lap-time spread among AI should be ≈ ±5 %; position changes should happen.

### 3. Audio (fully procedural WebAudio; silent no-op until `unlock()`)
- **Engine** per kart: layered detuned saw/square + filtered noise; pitch/gain/filter follow speed, throttle, gearing-style stepped rpm for flavour, boost whine, off-road rumble, drifting squeal. Player at full fidelity; up to ~4 nearest AI karts spatialised (StereoPanner, distance attenuation, subtle doppler). Voice budget capped; no clicks/pops.
- **SFX** (pitch-varied ±5 %): countdown beeps + GO, tyre skid/drift hiss loop, drift level-up chimes (3 pitches), mini-turbo fire, boost whoosh, wall scrape/hit, kart bump, jump/land, item box shatter + roulette ticks + got-item sting, each item's use/hit/explosion, spin-out, respawn drone, coin, lap complete jingle, **final-lap fanfare**, overtake whoosh, wrong-way alarm, finish fanfare (win vs other), UI sounds `audio.ui('click'|'hover'|'confirm'|'back'|'error'|'select'|'tick')`.
- **Music**: a small step-sequencer + synth voices (bass, lead, pad, arps, drums from noise/oscillators) producing a distinct, catchy, looping tune per theme key (`menu, meadow, desert, snow, harbor, neon, volcano, haunted, space, results`) per `ART_DIRECTION.md`; sections A/B, 8–16 bars; **tempo/pitch lift on the final lap**; ducking under boosts/hits; limiter/compressor on master. `playMusic(key)`, `stopMusic()`, `setMusicIntensity(x)`.
- Also: `audio.setPaused(bool)` (duck/suspend when the game is paused or the tab is hidden — listen to `visibilitychange`), `applySettings()` honours `masterVolume/musicVolume/sfxVolume` live, `audio.stats()` (active voices) for tests.
- Everything event-driven from `session.events` + per-frame kart state in `update(dt, session)`. Dispose all nodes on `detachSession`.

## Quality bar / acceptance
- Item showcase test script: spawn each item via `__kart.giveItem`, use it, assert the expected effect on victims (spin/launch/shrink/boost) and that nothing leaks (entity counts return to 0). Run a 12-kart, 3-lap race on `sunny-meadows` at each class with items on: no crashes, no NaN, sensible event counts (hits, blocks, overtakes), AI finish times spread ≈ ±5 %, no stuck karts (`check.mjs` passes).
- Audio: offline-render verification (see TESTING.md): no NaN/clipping (peak < 1.0), music loops are the designed length and not silent, voice counts bounded, no AudioContext errors in the console, engine params change with speed in a scripted drive.
- Everything uses `session.random()`; no `Math.random()` in gameplay paths (same seed ⇒ same race).

## Stretch
Item "combo" moments (shield + rocket), AI trash-talk-free reactions via events, dynamic music layers that follow race position, reverb zones (tunnels) via an optional `track.audioZones` hook (coordinate via INTEGRATION NOTES), Master-class "ghost car" challenger.
