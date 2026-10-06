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
| `shock` | Storm Zap | attack | every other kart shrinks 6 s, loses 40 % speed and is capped at ~78 % top speed (ramping back); lightning bolts + flash event (`ITEM_SHOCK`) | leader-ish (1st..mid) |
| `shield` | Prism Shield | defense | invincible 7 s, small speed floor (+13 %, no `EV.BOOST` spam), rams spin other karts (`EV.BUMP`) | iridescent bubble, last 1.8 s flickers |
| `rocket` | Rocket Rider | boost | `setRocket(6)` + 0.5 boost: AIManager autopilots the kart at 1.5x top speed, invulnerable, rams spin others; 1.3 s grace afterwards | rocket pack with flame on the kart |
| `ink` | Ink Splat | attack | `victim.ink = 5` for every kart ahead (HUD overlay is Agent E's); AI victims drive worse | falls back to the 2 pursuers when you lead |

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
| boost | 5 9 12 12 8 | | seeker | 2 12 17 14 7 |
| boost x3 | 0 2 6 11 13 | | bomb | 14 12 8 4 0 |
| peel | 18 14 8 3 0 | | comet | 0 0 0 4 9 (gated) |
| peel x3 | 6 8 4 0 0 | | shock | 7 10 6 0 0 |
| orb | 14 13 9 4 0 | | shield | 4 8 10 8 4 |
| orb x3 | 2 6 6 3 0 | | rocket | 0 2 7 15 22 |
| ink | 0 4 8 6 2 | | | |

Gates: no immediate repeat (x0.2), seeker x0.2 and ink 0 when leading, rocket x0.3 in the top 2, comet only if >= 4 racers, back 45 %, none in flight.
AI karts far behind the *human* get a gentle nudge toward better rolls (`rubber`).

### Hits (`ItemSystem.hitKart`)
Every hit goes through one function: `'hit' | 'blocked' | 'skip'`.  Order of checks: finished/respawning -> **grace** (a hit kart cannot be
re-hit for spin time + 0.9 s: no chain-hits) -> trailing peel/orb **guard** (consumes one count, `ITEM_BLOCKED {guard:true}`) ->
`spinOut/launch` (returns false for shield/rocket -> `ITEM_BLOCKED`) -> loses 1 coin -> `EV.ITEM_HIT`.  Spin directions use `session.random()`.

### Events (all in `src/core/events.js`)
Existing: `ITEM_BOX, ITEM_ROULETTE, ITEM_GOT, ITEM_USE {kart,type,backward,count}, ITEM_SPAWN {type,entity,owner}, ITEM_HIT, ITEM_BLOCKED, ITEM_EXPLODE`.
Added: `ITEM_BOUNCE {entity,type,point,bounces}`, `ITEM_LAND`, `ITEM_LOCK {kart,type,active,entity}` (HUD "incoming!"), `ITEM_SHOCK {kart,victims}` (flash),
`ITEM_END {kart,type:'shield'|'rocket'}`.  `COIN` payload gained `lost:true` when a hit costs a coin.

### Public API additions
`itemSystem.entities` (live peels/bombs/orbs/rockets/comet), `.boxes`, `.boxField`, `.coinField`, `.stats()`, `.clearKartItem(kart)`,
`.placeHazard(type, s, lateral)`, `.order()`, `kart.ext.items = { grace, shieldT, zapT, incoming:{type,dist,t}|null, heldTime, ... }`.
`itemDefs.js`: `ITEM_DEFS[id] = {id,name,desc,color,color2,count,kind,triple,tip}`, `ITEM_ORDER`, `getItemIcon(id,size)` (+ `'box'` = "?"), `getItemIconURL`.

### Coins
Gold coin lines / zig-zags / arcs (instanced).  Uses `track.coins` if the track defines them, otherwise ~one pattern per 330 m of track
(skips start, item rows, ramps).  `kart.addCoins(1)` on touch, respawn after 16 s, cap 10 (physics gives +1.2 % top speed each), a hit costs 1 coin.

### Visuals
All procedural: rounded rainbow "?" boxes with halo + ground ring, merged vertex-coloured meshes for every item, camera-facing ribbons for
trails/bolts, pooled sprites/shards for blasts (`ItemFX`).  Explosions also call `session.vfx.spawn('explosion'|'shockwave'|'hitStars'|'pickup'|'sparkle')`
(no-ops until Agent C's VFX lands); ItemSystem draws its own small flash/ring/shards so items read well either way.

---------------------------------------------------------------------------------------------------------------------

## 2. AI opponents

`AIManager` (contract unchanged) creates one `AIDriver` per kart in `kart.ext.ai` for `isAI || autopilot || rocket > 0`.

### Architecture (`src/ai/AIDriver.js`)
1. **Perception** - nearest kart ahead/behind, the lane **blocker** (kart ahead in our lane), item boxes/coins to go for (every 0.18 s), boost pads, traps.
2. **Lateral plan** - target lateral = racing line (`track.lineOffsetAt`, weight by class) + personal lane bias + slow wander; overrides in priority order:
   trap dodge > overtake/separation (pass on the roomier side, 3.5 m clearance, kept 1.2 s to avoid flip-flop; aggressive drivers sometimes shove) >
   boost pad > item box > coin; clamped to the road (extra margin beside open edges); rate-limited so lane changes look human.
3. **Steering** - pure pursuit on `pointAt(s + lookahead, lateralTarget)`, gain scheduled by speed and surface grip, lagged like human hands (`steerLag`).
4. **Speed** - braking-aware corner profile: for each point ahead `v <= sqrt(vCorner^2 + 2*a*d)` with `vCorner = min(own physics limit, track.maxSpeedAt * cornerScale)`;
   own limit = `steerRate * auth(v) * 0.74 / |curvature|`.  Cruise = `pace * topSpeed`; boosting raises the cruise; following a slow kart that cannot be passed.
5. **Drifting** - `planDrift` finds the next corner's peak curvature, decides ONCE per corner (class `driftProb`) if its required turn rate fits the
   drift's `0.5..1.18 x baseRate` window, then presses drift just before the entry (hop), keeps the arc by inverting the physics mapping
   `turnRate = baseRate * lerp(.45, 1.3, (along+1)/2)`, and **releases at the exit for the mini-turbo**.  The speed profile uses a 1.35x corner capacity
   for planned/active drifts so drifting karts really carry more speed.
6. **Humanity** - class-dependent random mistakes (wide line / lift / over-steer, 4x likelier in corners), steering noise, perception chance for traps, rubber-banding.
7. **Safety** - stuck detection (speed < 2.2 m/s for 1 s, or facing > 115 deg away): reverse / U-turn / after 4 tries `physics.respawnKart(k,'stuck')`.
8. **Items** (`AIItems.js`) - reaction delay per class, then situational rules: boost on straights / after a hit / off-road, throws when a kart is lined up,
   drops when chased (keeps a trailing peel/orb as a shield when it can), seekers at the next kart, shield on incoming lock / hazards, comet and rocket at once...

### Difficulty (`src/ai/tuning.js`, `CLASS_TUNING`)
| knob | rookie | pro | master |
|---|---|---|---|
| `pace` (x top speed, spread compressed) | 0.80-0.90 | 0.88-0.95 | 0.95-1.00 |
| `cornerScale` | 0.88 | 1.0 | 1.12 |
| `lineWeight` | 0.55 | 0.88 | 1.0 |
| `driftProb` / hold | 0.30 / sloppy 0.45-1.2 s | 0.82 | 1.0 |
| `mistakeRate` (/s) | 0.040 | 0.010 | 0.002 |
| `perceive` (traps) | 0.55 | 0.86 | 0.97 |
| `boxSkill / padSkill` | 0.45 / 0.45 | 0.8 / 0.85 | 1 / 1 |
| `itemDelay` (s) | 1.2-4.5 | 0.6-2.6 | 0.25-1.4 |
| `aggression` x | 0.55 | 1.0 | 1.3 |

Personalities come from `driver.personality` (aggression 0.3-0.9 -> shoving, boldness -> lane + corner speed) and driver stats (drift/handling tilt the skill).
**Rubber-banding** (`RUBBER`): AI more than 30 m behind the *player* gains up to +5.5 % cruise pace (x class `rubber`), AI more than 70 m ahead eases up to -5 %;
only affects cruise pace (never the physics), and item rolls shift slightly for AI far behind.

### Measured (sunny-meadows, 8 racers, 2 laps, items off): pro lap 51 s, spread -3 %/+3 %; paperclip hairpin test track 38 s; no wall hits, spins or respawns.

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
  `session.app.paused` and tab visibility) muffles the music and silences engines.
* **SFX** (`sfx.js`, ~70 sounds): every race/item/UI event; pure functions `(ctx, out, t, opts)`; pitch varied +-5 %; per-sound cooldowns, priorities (voice budget 36 + 12),
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
node .qa/ai-run.mjs ...      # (scratch, git-ignored) per-kart metrics incl. stress tracks - see the report
```
* Items: `__kart.giveItem('seeker', 1)`, then `__kart.app.session.items.useItem(__kart.player, false)`; `session.items.stats()` must return to `entities: 0`.
* AI: `session.ai.stats()` (drifts, mistakes, dodges, recoveries).  Same seed => same race (`__kart.startRace({seed})`).
* Audio (headless): `app.audio.unlock()` then `app.audio.stats()` ({voices, engines, music, requested, played}); offline renders with `OfflineAudioContext`
  (`renderSong(key)`, each `SFX[name]`) check peak/RMS/NaN/loop length; the mix test renders the real output chain.

## 5. Known issues / ideas
* Audio could only be verified numerically (offline renders, spectrograms, counters), not by ear.
* Shield bubble and rocket pack are drawn by ItemSystem; Agent C's VFX may add its own shield/rocket effects (duplicate glow) - see INTEGRATION NOTES in the report.
* `Kart.launch` picks its spin direction with `Math.random()` (visual only; ItemSystem overrides `spin.dir` deterministically right after).
