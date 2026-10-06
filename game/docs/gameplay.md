# Gameplay systems: items, AI opponents, procedural audio (Agent D)

Everything here is deterministic where it affects the race (all gameplay randomness uses `session.random()`; the same seed
reproduces the same race, verified) and fully procedural (no assets).  Cosmetic randomness (particles, pitch variation) uses `Math.random()`.

Files: `src/items/*`, `src/ai/*`, `src/audio/*`.

---------------------------------------------------------------------------------------------------------------------

## 1. Items

### Item table

| id | name | kind | what it does | notes |
|---|---|---|---|---|
| `boost` | Nitro Boost | boost | `applyBoost(0.42, 1.5 s)` | also a x3 pack |
| `peel` | Slick Peel | trap | spins whoever touches it (1.5 s). Press = lob 11-24 m ahead (lands on a kart in line), **hold brake = drop behind**. A trailing peel guards you against orbs/rockets | x3 pack trails behind on a springy chain, 42 s lifetime |
| `orb` | Ricochet Orb | projectile | 58 m/s ball, bounces off walls up to 4 times, spins the first kart it touches (1.4 s) | x3 pack orbits you (blocks incoming orbs/rockets). Hold brake = fire backward |
| `seeker` | Seeker Rocket | projectile | homes on the kart one place ahead, **driving in track coordinates** so it follows the road around any corner; launches the victim (9 m/s up, 1.7 s spin) | hold brake = targets the kart behind. Red lock-on reticle on the target + `ITEM_LOCK` event |
| `bomb` | Time Bomb | trap | lobbed (aims at a lined-up kart) or dropped; goes off after a 4.4 s fuse or when a kart gets within ~3 m; blast 9.5 m: inner 4.6 m = launch, outer = spin | blast-radius marker in the last second; dangles behind you while held |
| `comet` | Comet | attack | arcs high over the pack and dives on the race leader (blast 12.5 m, leader launched hardest). Shield saves | back of the pack only (place >= 55 % of field, never top 3), one in flight at a time, 30 s cooldown per kart |
| `shock` | Storm Zap | attack | the (up to) 4 karts directly **ahead** of you shrink 4.5 s, lose 35 % speed and are capped at ~78 % top speed (ramping back); skips karts already shrunk or still reeling; lightning bolts + flash event (`ITEM_SHOCK`) | rare comeback tool: back 40 % of the field only, at most one per 35 s (`ZAP_COOLDOWN`) |
| `shield` | Prism Shield | defense | invincible 5.5 s, small speed floor (+13 %, no `EV.BOOST` spam), rams spin other karts (`EV.BUMP`) | the bubble is drawn by the VFX system (reads `kart.ext.items.shield` = seconds left) |
| `rocket` | Rocket Rider | boost | `setRocket(4.5)` + 0.5 boost: AIManager autopilots the kart at 1.5x top speed, invulnerable, rams spin others; 1.3 s grace afterwards | exhaust / shimmer drawn by the VFX system (`kart.rocket`, `kart.invincible`) |
| `ink` | Ink Splat | attack | `victim.ink = 4` for the 3 karts directly ahead (HUD overlay reads `kart.ink`); AI victims drive worse | falls back to the 2 pursuers when you lead |

**Using an item:** press `kart.input.item`; hold brake (`input.brake > 0.5`) at that moment to throw/drop **backward**.  AI uses
`itemSystem.useItem(kart, backward)` directly.  `itemSystem.giveItem(kart, type, count)` hands out items (count > 1 = pack).
The slot is `kart.item = { type, count, roulette:{active, timer, shown} }`; the HUD only needs that plus `getItemIcon(id, size)`.

**Pickup flow:** box (rainbow "?" cube, instanced, respawns after 4.5 s) -> `EV.ITEM_BOX` -> roulette 1.7 s (`EV.ITEM_ROULETTE`
with `tick:true, shown` for every icon change; ticks slow down, the real prize shows for the last 0.22 s) -> `EV.ITEM_GOT`.
Boxes are not collected while holding an item or during the roulette.  Time Trial (`config.items === false`) has no boxes.

### Distribution (`src/items/distribution.js`)
Weights are piecewise-linear in rank `u = (place-1)/(racers-1)`; rows are `[1st, .25, .5, .75, last]`:

| item | w(u) | | item | w(u) |
|---|---|---|---|---|
| boost | 9 11 13 13 9 | | seeker | 1 7 11 10 5 |
| boost x3 | 0 2 6 11 13 | | bomb | 9 8 5 3 0 |
| peel | 13 11 7 3 0 | | comet | 0 0 0 2 4 (gated) |
| peel x3 | 3 5 3 0 0 | | shock | 0 0 0 2 3 (gated) |
| orb | 10 10 7 3 0 | | shield | 3 5 6 5 3 |
| orb x3 | 1 3 3 2 0 | | rocket | 0 1 4 8 12 |
| ink | 0 2 5 4 1 | | | |

Gates: no immediate repeat (x0.2), seeker x0.2 and ink 0 when leading, rocket x0.3 in the top 2, comet only if >= 4 racers, back 45 %, none in flight;
Storm Zap only with >= 4 racers, in the back 40 % of the field and not within 35 s of the previous zap (`ctx.zapRecent`).
**Balance target** (wave 2): about one damaging hit per kart per minute (8 racers, 2 laps: ~21 hits, was 62).  Levers, all in this table / `ItemSystem` constants / `tuning.js`: weights above,
`SHIELD_TIME 5.5`, `ROCKET_TIME 4.5`, `ZAP_TIME 4.5`, `INK_TIME 4`, `ZAP_REACH 4`, `HIT_GRACE 2.4`, class `fireCool`.
AI karts far behind the *human* get a gentle nudge toward better rolls (`rubber`).

### Hits (`ItemSystem.hitKart`)
Every hit goes through one function: `'hit' | 'blocked' | 'skip'`.  Order of checks: finished/respawning -> **grace** (a hit kart cannot be
re-hit for spin time + 2.4 s: no chain-stacking) -> trailing peel/orb **guard** (consumes one count, `ITEM_BLOCKED {guard:true}`) ->
`spinOut/launch` (returns false for shield/rocket -> `ITEM_BLOCKED`) -> loses 1 coin -> `EV.ITEM_HIT`.  Spin directions use `session.random()`.

### Events (all in `src/core/events.js`)
Existing: `ITEM_BOX, ITEM_ROULETTE, ITEM_GOT, ITEM_USE {kart,type,backward,count}, ITEM_SPAWN {type,entity,owner}, ITEM_HIT, ITEM_BLOCKED, ITEM_EXPLODE`.
Added: `ITEM_BOUNCE {entity,type,point,bounces}`, `ITEM_LAND`, `ITEM_LOCK {kart,type,active,entity}` (HUD "incoming!"), `ITEM_SHOCK {kart,victims}` (flash),
`ITEM_END {kart,type:'shield'|'rocket'}`.  `COIN` payload gained `lost:true` when a hit costs a coin.
`ITEM_EXPLODE` is emitted only for real explosions (bomb, seeker, comet): the VFX system turns every one into a fireball, so the Storm Zap (`ITEM_SHOCK`) and orb pops do not use it.

### Public API additions
`itemSystem.entities` (live peels/bombs/orbs/rockets/comet), `.boxes`, `.boxField`, `.coinField`, `.stats()`, `.clearKartItem(kart)`,
`.placeHazard(type, s, lateral)`, `.order()`, `kart.ext.items = { grace, shieldT, zapT, incoming:{type,dist,t}|null, heldTime, ... }`.
`itemDefs.js`: `ITEM_DEFS[id] = {id,name,desc,color,color2,count,kind,triple,tip}`, `ITEM_ORDER`, `getItemIcon(id,size)` (+ `'box'` = "?"), `getItemIconURL`.

### Coins
Gold coin lines / zig-zags / arcs (instanced).  Uses `track.coins` if the track defines them, otherwise ~one pattern per 330 m of track
(skips start, item rows, ramps).  `kart.addCoins(1)` on touch, respawn after 16 s, cap 10 (physics gives +1.2 % top speed each), a hit costs 1 coin.

### Visuals
All procedural: rounded rainbow "?" boxes with halo + ground ring, merged vertex-coloured meshes for every item, camera-facing ribbons for
trails/bolts, pooled sprites/shards for blasts (`ItemFX`).  **Ownership split with the VFX system (Agent C):** ItemSystem draws the items themselves (boxes, coins,
held/trailing items, projectiles, hazards, lock-on reticles, ink blobs, its own small flash/ring/shards); the VFX system draws pickup bursts, hit stars, fireballs/shockwaves,
the shield bubble, the invincibility shimmer and the rocket exhaust, all driven by events (`ITEM_BOX`, `ITEM_HIT`, `ITEM_EXPLODE`, `ITEM_BLOCKED`, `COIN`, `INVINCIBLE`, `ROCKET`, `SHRINK`) and
`kart.ext.items.shield`.  ItemSystem therefore makes no `vfx.spawn` calls (a raw colour string once poisoned the HDR bloom with NaNs and painted black squares).

---------------------------------------------------------------------------------------------------------------------

## 2. AI opponents

`AIManager` (contract unchanged) creates one `AIDriver` per kart in `kart.ext.ai` for `isAI || autopilot || rocket > 0`.

### Architecture (`src/ai/AIDriver.js`)
1. **Perception** - nearest kart ahead/behind, the lane **blocker** (kart ahead in our lane), item boxes/coins to go for (every 0.18 s), boost pads, traps.
2. **Lateral plan** - target lateral = racing line (`track.lineOffsetAt`, weight by class) + personal lane bias + slow wander; overrides in priority order:
   trap dodge > overtake/separation (pass on the roomier side, 3.5 m clearance, kept 1.2 s to avoid flip-flop; aggressive drivers sometimes shove) >
   boost pad > item box > coin; clamped to the road (extra margin beside open edges); rate-limited so lane changes look human.
3. **Steering** - pure pursuit on `pointAt(s + lookahead, lateralTarget)`, gain scheduled by speed and surface grip, lagged like human hands (`steerLag`).  While sidestepping a trap
   it aims at a nearer point (sharper turn-in).  `driveModel.js` (`DriveModel`) is the only place that knows how the engine steers: with the engine's yaw-rate API
   (`physics.steerForYawRate / maxYawRate / maxCornerSpeed / driftYawRange`) it asks for the exact stick for a wanted turn rate, the real limits and the range a drift can hold;
   without it (baseline engine) the same answers come from the baseline formulas.
4. **Speed** - braking-aware corner profile: for each point ahead `v <= sqrt(vCorner^2 + 2*a*d)` with `vCorner = min(engine corner limit * class limit, track.maxSpeedAt * cornerScale)`.
   Cruise = `pace * topSpeed * (1 + 1.2 % per coin + slipstream bonus)`; boosting raises the cruise; following a slow kart that cannot be passed.
   **Jumps**: `AIManager.buildJumps()` finds every ramp that launches over a gap and computes the speed that clears it (ballistic flight over the drop, +12 %); inside that window
   the target speed never drops below it (beats corners, class pace and traffic), mistakes and drifts are off and a boost item is used if the kart is too slow.
5. **Drifting** - `planDrift` finds the next corner's peak curvature (>= 0.0075), decides ONCE per corner (class `driftProb`) if the turn rate it needs fits the drift's yaw range
   (`driftYawRange`), the bend is >= 30 deg and long enough for a blue mini-turbo at the expected charge rate, then presses drift just before the entry (hop), holds the arc by asking
   the engine for the stick that gives the pursuit turn rate, and **releases at the exit for the mini-turbo** (or at once when a trap needs a sidestep or a jump is coming).
   The speed profile takes planned/active drifts faster (drift corner limit).
6. **Humanity** - class-dependent random mistakes (wide line / lift / over-steer, 4x likelier in corners), steering noise, perception chance for traps, rubber-banding.
7. **Safety** - stuck detection (speed < 2.2 m/s for 1 s, or facing > 115 deg away): reverse / U-turn / after 4 tries `physics.respawnKart(k,'stuck')`.
8. **Items** (`AIItems.js`) - reaction delay per class, then an opportunity check ~3x a second: boost on straights / after a hit / off-road / before a jump, throws when a kart is lined up
   (|dl| < 2.6 m, range limits), drops when chased, seekers at the next kart, Storm Zap when >= 2 karts are ahead, shield on incoming lock / hazards, rocket from 3rd place back.
   **Attacks are rationed**: each opportunity is taken with probability `0.22 + 0.3 * aggression`, a driver that just fired waits `fireCool` seconds, forward shots miss by
   up to `lerp(5.5, 0.8, skill)` m, and an item held for 12-22 s is used anyway (`urgent`).  Trap dodging is committed (a driver that noticed a trap keeps its side until it is behind).

### Difficulty (`src/ai/tuning.js`, `CLASS_TUNING`)
| knob | rookie | pro | master |
|---|---|---|---|
| `pace` (x top speed, spread compressed) | 0.74-0.83 | 0.82-0.88 | 0.89-0.94 |
| `cornerScale` (x track hint) / `limit` (x engine corner speed) | 0.88 / 0.80 | 1.0 / 0.90 | 1.12 / 0.96 |
| `lineWeight` | 0.55 | 0.88 | 1.0 |
| `driftProb` / hold | 0.30 / sloppy 0.45-1.2 s | 0.82 | 1.0 |
| `mistakeRate` (/s) | 0.040 | 0.010 | 0.002 |
| `perceive` (traps) | 0.55 | 0.86 | 0.97 |
| `boxSkill / padSkill` | 0.45 / 0.45 | 0.8 / 0.85 | 1 / 1 |
| `itemDelay` (s) / `fireCool` (s) | 1.2-4.5 / 22-44 | 0.6-2.6 / 18-36 | 0.25-1.4 / 14-28 |
| `aggression` x | 0.55 | 1.0 | 1.3 |

Personalities come from `driver.personality` (aggression 0.3-0.9 -> shoving, boldness -> lane + corner speed) and driver stats (drift/handling tilt the skill).
**Rubber-banding** (`RUBBER`): AI more than 30 m behind the *player* gains up to +5.5 % cruise pace (x class `rubber`), AI more than 70 m ahead eases up to -5 %;
only affects cruise pace (never the physics), and item rolls shift slightly for AI far behind.

### Measured (integrated build)
* **Calibration against the engine's drifting test bot** (`__kart.bot(true)`, solo, same speed class, best lap, 7 tracks): rookie AI +23 % slower, pro +7 %, master -1 % (target +25 / +9 / +1;
  per track master ranges -5 %..+3 %).  Pace is the lever (`CLASS_TUNING.pace`); the AI uses coins, slipstream, pads and mini-turbos like a player.
* AI drifts 10-20 times per kart per 2-lap race on every track, 70-90 % of them reach a mini-turbo, ~0 wall hits; all classes finish all 8 tracks with 0 respawns.
* **Item hits** (8 racers, 2 laps, sunny-meadows, `check.mjs`): `hit` events 62 -> 22 / 21 / 21 (rookie / pro / master), spin 24 -> 7-11, shrink 28 -> 0-8; about one hit per kart per minute
  (was 2.2-3.4 per kart-minute).  Trap dodging (peel dropped 30 m ahead of the leader, 20 trials): rookie 5-12 hits, pro 2, master 2.
* Rubber-banding: with the human standing still the field is 3 % slower than without it.

---------------------------------------------------------------------------------------------------------------------

## 3. Audio

`AudioManager` (contract unchanged) is a silent no-op until `unlock()`; calls are still counted in `stats().requested`.

```
engines -> engineBus --+
sfx -> sfxBus (+reverb send) -+-> master (user volume x1.5) -> compressor (limiter) -> soft clipper (<0.93) -> speakers
music -> glue compressor -> musicBus -> duck -> lowpass (pause muffle) -+
ui -> uiBus ---+
```
* **Settings**: `masterVolume / musicVolume / sfxVolume` live via `applySettings()`; `?nomusic=1`, `?nosfx=1`.  Pause (`setPaused`, also auto-detected from
  `session.app.paused` and tab visibility; verified: pause -> music low-pass 650 Hz + engines muted, hidden tab -> context suspended, back -> running) muffles the music and silences engines.
* **Engine events** (A): `EV.DRAFT` -> slipstream whoosh, `EV.PHOTO_FINISH` -> slow-motion dive (music low-pass 1.4 kHz, engine pitch x0.74, sting in/out), `kart.skid` feeds the tyre squeal, `kart.scraping` the wall scrape.
* **SFX** (`sfx.js`, ~74 sounds): every race/item/UI event; pure functions `(ctx, out, t, opts)`; pitch varied +-5 %; per-sound cooldowns, priorities (voice budget 36 + 12),
  reverb sends, spatial chain (pan/gain/low-pass by camera distance) for other karts' actions.  `audio.sfx(name, {volume, pitch, position, level})`, `audio.ui(name)`.
* **Engines** (`engine.js`): `EngineModel` = 5-gear stepped rpm with shift dips, revs on the grid, wheelspin in the air; `EngineVoice` = 2 detuned saws + square sub through a
  resonant low-pass + intake noise + turbine whine (boost/rocket) + tyre skid/squeal (drift level) + off-road rumble by surface + wind + wall scrape.  The player gets the full
  voice, the 4 nearest AI karts a lite voice (pan, distance gain/filter, doppler).
* **Music** (`music/`): tracker-style notation -> sequencer with look-ahead, crossfade between songs, **intensity layers** (groove -> hats -> lead -> arps; 0.4 during intro/countdown,
  1.0 at GO), **final lap = +7 % tempo and +2 semitones at the next bar**, ducking under boosts/hits/explosions, results jingle at the end, menu loop on unlock / quit.
  Offline renderer (`renderSong`) for verification.

| key | title | tempo | feel |
|---|---|---|---|
| `menu` | Garage Groove | 108, swing | jazzy EP chords, bell hook |
| `meadow` | Sunny Pluck | 128 | C major, plucky 3-3-2 hook, bell sparkles |
| `desert` | Dune Runner | 116 | E phrygian-dominant, twang guitar, darbuka maqsum |
| `snow` | Sleigh Bells & Snowflakes | 124 | G major bells + glass arps + echo |
| `harbor` | Harbor Skank | 112, swing | reggae one-drop, organ skank, steel-drum lead |
| `neon` | Midnight Grid | 132 | A minor synthwave: 8th bass, gated arps, saw lead + echo |
| `volcano` | Magma Run | 140 | E minor, distorted gallop riff, brass hits, double kick |
| `haunted` | Hollow Hymn | 100 | D harmonic minor, theremin, harpsichord, heartbeat |
| `space` | Starlight Spiral | 136 | C lydian glass arps with deep echo, gliding saw lead |
| `results` | Podium Parade | 120 | G major brass fanfare |

Songs are 16 bars (A: 8, B: 8), defined in `music/songs.js`; `track.def.music` selects one (unknown -> `meadow`).

---------------------------------------------------------------------------------------------------------------------

## 4. How to test

```bash
cd game && npm run build
node scripts/check.mjs --track=all --laps=2 --speed=rookie|pro|master      # headless AI race regression (items on)
node scripts/shots.mjs --no-build --track=all --at=9,38 --quality=high      # frames of the integrated game
node .qa/ai-run.mjs --track=sunny-meadows --laps=2 --racers=8 --speed=pro --seeds=1,2   # (scratch, git-ignored) per-kart metrics, item use/hit breakdown
node .qa/probe.mjs .qa/p-smoke.js      # every item, player + AI, forward/backward: effects, entities back to 0, no NaN
node .qa/probe.mjs .qa/p-solo.js --tracks=sunny-meadows --modes=bot:pro,ai:rookie,ai:pro,ai:master   # lap-time calibration against the engine bot
node .qa/probe.mjs .qa/p-audio.js      # live audio: engine events, pause, hidden tab        |   node .qa/audio-run.mjs   # offline SFX / songs / engine renders
```
* Items: `__kart.giveItem('seeker', 1[, kartId])`, then `__kart.app.session.items.useItem(kart, false)`; `session.items.stats()` must return to `entities: 0`.
* AI: `session.ai.stats()` (drifts, mistakes, dodges, recoveries).  Same seed => same race (`__kart.startRace({seed})`).
* Audio (headless): `app.audio.unlock()` then `app.audio.stats()` ({voices, engines, music, requested, played}); offline renders with `OfflineAudioContext`
  (`renderSong(key)`, each `SFX[name]`) check peak/RMS/NaN/loop length; the mix test renders the real output chain (everything on: peak 0.66).

## 5. Known issues / ideas
* Audio could only be verified numerically (offline renders, spectrograms, counters), not by ear.
* `Kart.launch` picks its spin direction with `Math.random()` (visual only; ItemSystem overrides `spin.dir` deterministically right after).
* Storm Zap only hits karts ahead of the user (a comeback item): in a 3-kart race it falls back to hitting everybody.
* Rocket Rider autopilot takes the engine's corner limit at 1.5x speed on hairpins (Frostbite Peak) and may scrape a wall once.
