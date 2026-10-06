# UI, game flow, modes and persistence (Agent E)

Everything the player touches outside the 3D race: title, menus, selects, loading, the race HUD, pause, results, Grand Prix,
Time Trial, Versus, records, settings, help, plus the app shell, the 3D menu stage and all `localStorage` persistence.
Plain DOM + CSS over the WebGL canvas (`#ui-root`), no UI framework, no external assets. Fonts are the embedded `--font-display` / `--font-ui`.

## 1. Module map

| Path | What |
|---|---|
| `src/app/App.js` | Shell + rAF loop. Public API (see §6). Owns pause, results routing, partial-race stats, error boundary |
| `src/app/Flow.js` | Select-screen wizard per mode (`FLOW_STEPS`), race config building, GP loop, "race again" |
| `src/app/MenuScene.js` | 3D stage behind every menu (reflective floor, rig lights, neon backdrop, crossfading kart, podium) |
| `src/app/Podium.js` | 3D podium ceremony (rising blocks, top-3 showcases, spinning trophy, confetti) |
| `src/app/settingsApply.js` | Pushes a changed setting to the live game (quality, audio, bindings, camera, UI prefs) |
| `src/app/devMocks.js` | `?mocktracks=1` pads the registry to 8 tracks / 2 cups for layout review. Inert once Agent B's tracks exist |
| `src/ui/UI.js` | Layers, layout/scale, screen stack + transitions, modals, toasts, hint bar, HUD mount, fatal-error card |
| `src/ui/nav.js` | One focus model: keyboard, gamepad, mouse, touch. Scopes (screen, modal), spatial navigation, d-pad repeat |
| `src/ui/components.js` `dom.js` `icons.js` `modal.js` `toasts.js` `hints.js` `anim.js` `clipboard.js` `fullscreen.js` | Toolkit (buttons, stat bars, sliders, segmented/stepper/toggle controls, keycaps/pad glyphs, 60 SVG icons) |
| `src/ui/css/base.js` | The design system (tokens, buttons, panels, rows, tabs, modal, toasts, wipe) + `coarseCss` (44 px touch targets, appended last). UI CSS lives in JS strings (the build only inlines `shell.css`) |
| `src/ui/css/gate.js` | `gateHover(css)`: rewrites every `:hover` rule to apply only while the active device is the mouse, so hover and keyboard/pad focus can never highlight two things |
| `src/ui/screens/*.js` | One class per screen + its CSS string; registry in `screens/index.js` |
| `src/ui/hud/*.js` | Race HUD: `Hud` (assembly + events), `widgets` (speedo, minimap, item slot, standings, drift meter, respawn ring), `banners` (countdown, final lap, finish, photo finish, intro card, event feed), `overlays` (boost/ink/shield/rocket/status chips), `TouchControls`, `coach` (first-run hints), `preview` (live HUD preview for Settings), `hudCss` (scoped under `.hud` at load) |
| `src/modes/*.js` | `catalog` (tracks/cups/outlines), `unlocks` (rule table), `achievements`, `points`, `GrandPrix` (run state), `career` (stats, records, ghosts, trophies), `ghostGap` (HUD ghost delta + sign convention), `selftest.mjs` |
| `src/save/*.js` | `defaults` (schema), `Save` (store + migrations + sanitizers), `codec` (export/import text code), `selftest.mjs` |

## 2. Screen map and state machine

```
boot -> TITLE --any key/click/A--> MENU (first launch: welcome + name prompt)
MENU: Grand Prix -> driver -> kart -> class -> cup ------------------------------> LOADING -> RACE
      Time Trial -> driver -> kart -> class -> track (ghost on/off: X / button) --> LOADING -> RACE
      Versus     -> driver -> kart -> setup (track, class, laps 1-5, racers 2-12, items) -> LOADING -> RACE
      Records (Times / Trophies / Career) · Settings (Graphics / Audio / Controls / Gameplay / Access / Data) · Help (Controls / Items / Tips / Credits)
RACE: intro -> countdown -> racing -> finishing -> RESULTS      pause (Esc / P / Start / button): Resume · Restart · Settings · Controls · Quit
RESULTS: Versus: Race again · Change setup · Menu · Share        Time Trial: Retry · Next track · Menu · Share
         Grand Prix: Standings (animated table; "Next race" / after the last race "Podium") -> PODIUM (trophy, unlocks) -> Menu
```

Rules: Back (Esc / B / on-screen button / Backspace) always works and pops one level; there are no dead ends. Modals trap focus and Esc/B dismisses
only the modal. Locked content is selectable (to read the hint) but cannot be started; a locked card shows what unlocks it and progress.
The race is a *separate state*: `App.session` is set, `ui.hud` is mounted, `ui.screen` is null. `App.quitToMenu()` always returns to `menu`.

Screen API (`ui/screens/Screen.js`): `build()` -> root element, `stage` (backdrop preset/kart/composition/theme), `hints()` (device-aware prompt bar),
`navOptions()` (`onBack`, `onTab`, `onAction`, `onStart`, `onKey`), lifecycle `onShow/onHide/update/onResize/onDevice/destroy`.

## 3. How to add a screen

1. Create `src/ui/screens/myscreen.js` exporting a CSS string `myCss` and `class MyScreen extends Screen` with a `build()` that returns the root element. Use `button()`, `row()`, `h()`; every interactive element needs `data-nav` and (for sounds) `data-sfx="click|confirm|back|select|tick"`.
2. Register in `src/ui/screens/index.js` (`SCREENS.my = MyScreen`, push `myCss` to `SCREEN_CSS`).
3. Navigate with `ui.push('my', params)` (slides in, Back returns) / `ui.replace` / `ui.reset`. State shared across steps lives in `app.flow.sel`, not in the screen.
4. Check at 1920x1080, 1280x720, 844x390 and 390x844 (layout classes `l-wide | l-portrait | l-compact` are on `#ui-root`; write `.l-compact .x {...}` overrides).

## 4. Save schema (localStorage key `kartrush.save.v1`, `SAVE_VERSION = 2`)

```
version, profile{name, favoriteDriver, favoriteKart, created, lastSpeedClass, lastCup, lastTrack, versus{laps,racers,items}, tutorialDone, nameSet, unlockAll, seen{controls,drift,item,welcome}}
settings{quality, resolutionScale, postfx, cameraMode, cameraShake, fovBoost, masterVolume, musicVolume, sfxVolume, speedUnit, showMinimap, showLeaderboard, hudScale,
         assists{autoAccelerate,steeringAssist}, vibration, gamepadDeadzone, bindings|null, touchControls, touchScale, showFps, reducedMotion, reduceFlashes, largeText, highContrastHud}
records[trackId]{ tt|race|lap : { [speedClass]: {time, laps, by:{driverId,bodyId}, date} } }
ghosts['trackId|class']{time, driverId, bodyId, trackId, speedClass, laps, date, data}      (data = Agent A's opaque ghost blob; max 12, oldest dropped)
grandPrix[cupId][class]{trophy:'gold'|'silver'|'bronze'|null, points, place, completed, date}
unlocks{drivers[], bodies[], cups[], speedClasses[]}       stats{races, wins, podiums, finishes, distance(m), driftSeconds, itemsHit, itemsUsed, hitsTaken, boosts, overtakes, coins, laps, topSpeed(km/h), playSeconds, gpPlayed, gpWon, ttRecords, bestLapRecords}
achievements{id: timestamp}
```
`profile.seen{controls,drift,item,welcome}` records which one-off coaching/welcome UI was already shown (Settings > Data > "Show tips again" resets it).
`profile.unlockAll` (boolean, default false) is the player's **Unlock everything** switch (see section 5): sanitised as a strict boolean, kept by *Merge* import, carried by export/import, cleared by *Reset progress*.

* **Load path**: `JSON.parse` -> `migrateBlob` (walk `MIGRATIONS[n]` from the stored `version` to `SAVE_VERSION`) -> `normalizeSave` (merge onto defaults, clamp ranges, enum-check, drop unknown keys, cap name length, rebuild unlocks so starter content can never be locked).
* **Migrations**: `MIGRATIONS[1]` (baseline v1 -> v2) converts flat `records{bestTime,bestLap}` into per-class `race`/`lap` entries and ghost keys into `'track|class'`. A migrated or *newer-version* save is first copied to `kartrush.save.v1.bak`; unreadable JSON is backed up too and the game starts fresh with a toast. To add v3: bump `SAVE_VERSION`, add `MIGRATIONS[2](d)` that returns the upgraded blob, extend `normalizeSave`, add a case to `src/save/selftest.mjs`.
* **Writes**: `save.commit()` debounced 250 ms (`commit(true)` immediate), flushed on `pagehide` / tab hidden. On `QuotaExceededError` the oldest ghosts are shed until the write fits; if storage is blocked entirely `save.persistent = false` and everything keeps working in memory (title + Settings > Data show a gentle note).
* `app.settings` / `app.save.profile` are **never replaced**, only mutated in place (import/reset included), so other modules' references stay valid.
* **Export / import**: `KRGP1.<base64url(deflate-raw(json))>.<crc32>` (falls back to `KRGP0` uncompressed). Ghosts are excluded by default (toggle). Import validates the checksum and shape, previews a summary, then offers *Replace* or *Merge* (best times / trophies / unlocks / max stats). Everything is in-page: no downloads, `prompt()`, `confirm()` or `alert()`; if the clipboard is blocked the text stays selected for Ctrl+C.
* Self-test: `node src/save/selftest.mjs` (sanitising, migration, codec round trip + tamper, merge, blocked/full storage).

## 5. Unlocks and achievements (data tables)

`src/modes/unlocks.js` `UNLOCK_RULES` (evaluated after every race and cup; shown as cards on the results screen / Grand Prix podium):

| Unlock | Rule |
|---|---|
| Driver Luna | finish 3 races |
| Driver Gizmo | win 2 races |
| Kart Dune Hopper | 45 s of total drift time |
| Driver Quill | 6 podiums |
| Driver Rocco | a silver or gold Grand Prix trophy |
| Kart Crusher XL | win 8 races |
| Cup `starlight` | any trophy in the Blossom Cup |
| Class Master | gold in a Pro Grand Prix |

Starter set (`save/defaults.js`): drivers pip, rusty, bruno, hopper · karts classic, streak · cup blossom · classes rookie, pro.
Grand Prix: points 15-12-10-9-8-7-6-5-4-3-2-1 (`modes/points.js`), grid after race 1 = standings, trophy = final place 1/2/3 (best per cup+class is kept).
Achievements (`modes/achievements.js`, 13 of them) are shown on Records > Career and, when earned, as a gold chip row *inside* the results layout (no overlay toast, so they can never cover the table or the NEW RECORD badge; the Grand Prix podium still uses toasts in its free top-centre area).

**Unlock everything** (Settings > Data > Unlocks): a real player-facing switch, because query strings never reach the published page. A button opens an in-page confirm ("8 drivers, 4 karts, 2 cups and all 3 speed classes will be open right away...") and sets `profile.unlockAll`; "Back to normal" clears it. `modes/catalog.js` `allUnlocked(save)` (= `?unlockall=1` review flag OR `profile.unlockAll`) is the single check used by `isUnlocked` / `isCupUnlocked` / `isTrackUnlocked`, so every select screen, the Records collection and the Flow defaults follow it. The switch never writes into `save.unlocks`: earned progress and achievements (Full Garage ...) keep working underneath, and `evaluateUnlocks` stops *announcing* new unlocks while it is on. Normal progression is untouched when it is off. Tests: `src/save/selftest.mjs` (sanitise / round trip / merge / persist / reset) and `src/modes/selftest.mjs`.

## 6. App public API (unchanged contract, additive extensions)

`boot()`, `startRace(config, opts?)`, `quitToMenu()`, `setPaused(b)`, `paused`, `session`, `input`, `renderer`, `audio`, `save`, `settings`, `quality`, `events`, `ui`, `freeze`, `renderFrame()`, `defaultRaceConfig()`.
Additive: `app.flow`, `app.run`, `app.menuScene`, `app.restartRace()`, `app.afterRaceContinue()`, `app.toSetup()`, `startRace(config, {transition, flow})`, app event `'race:recorded'`.
`__kart.startRace()` still starts a race directly (adhoc run) and the HUD/results work the same; the autostart URL param skips the title.

`App.tick` handles the input edges `pause` / `camera` / `respawn` both before and after `session.update` (gamepad edges are produced inside `Input.read()` and `endFrame()` clears them at the end of the tick). The camera cycle is skipped when the engine already changed `cameraRig.mode` during the update; the legacy instant manual respawn only runs when the engine has no `session.respawnHold`.

## 7. Integration contracts with other agents (all optional, all tolerated when absent)

| From | What the UI uses | Fallback today |
|---|---|---|
| A | `session.race` (phase, time, order, lapCount, `skipIntro()`, `endRace()`), kart fields in ARCHITECTURE §4.2, `EV.*`, `input.touch`, `input.bindings/setBindings/captureNextKey`, `session.cameraRig.mode` | baseline |
| A | `session.ghostResult = {time, driverId, bodyId, trackId, data}` after `RACE_RESULTS`; stored whole + `{speedClass, laps, date}` and passed back as `config.ghost` | no ghost saved |
| A | `session.ghostPlayer.kart` (or `.ghost`) with `.race.distance` for the live ghost delta; minimap dot from `.position` | HUD shows "racing" |
| A | `DRIFT_LEVEL_TIME` export from `physics/KartPhysics.js` (mini-turbo thresholds); `kart.driftProgress` 0..1 toward the next level | derived from `drift.charge` |
| A | `session.ghostDelta` (+ = player AHEAD; negated for the HUD), `session.respawnHold` 0..1, `race.rocketWindowOpen`, `session.stats` (preferred for career drift time / top speed), `input.touch.respawn`; events `EV.DRAFT`, `EV.PHOTO_FINISH` | distance-based ghost gap, no ring/chip/banner |
| B | `TRACK_DEFS`, `CUPS`, `getTrackDef`, `def.palette.{skyTop,skyHorizon,ground,accent,ui:{primary,secondary}}`, `track.minimap {points, bounds, start}` | outline rebuilt from `def.points` |
| C | `createKartShowcase(driverId, bodyId, opts)`, `getDriverPortrait(id, size)`, `renderer.setQuality`, `renderer.setEnvironmentProfile` (called once per menu) | box kart + initial discs |
| D | `ITEM_DEFS` (`name, desc, color, count, kind`), `ITEM_ORDER`, `getItemIcon(id, size)`, `audio.ui(name)`, `audio.unlock()`, `audio.applySettings()`, `audio.playMusic('menu'|'results')`, `audio.setPaused(b)` | placeholder icons, silent |

## 8. Testing recipes

```
npm run build && node scripts/serve.mjs --port=8105 &       # then playwright-cli -s=e ... (see TESTING.md)
node src/save/selftest.mjs                                  # save layer
node src/modes/selftest.mjs                                 # modes: ghost gap sign, GP points/grid/trophies, unlocks, achievements, records, ghosts
node scripts/check.mjs --track=all --laps=2                 # AI races (the UI wraps session.update only to collect stats)
URL params (QA only):  ?mocktracks=1 (8 stand-in tracks)  ?unlockall=1 (players use Settings > Data instead)  ?gpraces=2&gplaps=1 (short Grand Prix)  + the engine's ?quality= ?scale= ?autostart=1 ...
```
Gamepad: override `navigator.getGamepads` in `eval` (standard mapping, d-pad = buttons 12-15, A=0, B=1, Start=9, LB/RB=4/5). Touch: dispatch `PointerEvent`s with `pointerType:'touch'` at `.tzone` and `.tbtn`.
Storage-blocked path: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('x','SecurityError')}})` before load.

## 9. Design decisions worth knowing

* **One focus model** (`nav.js`): `.is-focus` is the single visual for hover, d-pad, Tab and touch-selection; `data-nav` marks every stop; modals push their own scope. Arrow/WASD keys are swallowed while a menu is open so they never reach the game's `Input`.
* **Screen scale**: `html` font-size = 16 px x `--ui-scale` (from viewport), all UI sizes are `rem`; the HUD uses `em` off `.hud` (x `settings.hudScale`). Layout class (`l-wide|l-portrait|l-compact`) is chosen in `UI.resize`.
* **HUD CSS is scoped** under `.hud` at build time (`hudCss.js`) so its short class names cannot collide with menu classes (layout prefixes `.l-*`, `[data-rm]`, `.hc`, `.noflash` are kept in front).
* **HUD layout contract (nothing can overlap)**: four reserved zones, and every widget, dynamic or not, flows *inside* its zone: `.zl` left column (item + count badge | position + coins (+ghost delta) | status-chip row | standings), `.zr` right column (lap / respawn / pause | timer | lap times | minimap + speedometer), `.zb` bottom-centre stack (coach card / nudge, rocket-start hint, skip pill, drift label + meter, fps; the drift row is always reserved), `.zt` top-centre stack (wrong-way, respawn ring, event toasts). Per layout: *wide* pins the position to the bottom-left and minimap + speedometer to the bottom-right; *portrait* stacks everything top-down in two ~11 em columns (touch buttons own the bottom 14 em, `.zb` sits above them via `--ts`); *compact* (phone landscape) puts speedometer and minimap side by side under the timer so the dial is never over the road. Status chips are icon-only on phones. The HUD root is a size container (`container: hud / size`): short windows, HUD size and large text trigger `@container hud (...)` rules in HUD em that drop the standings / lap times or shrink the instruments instead of colliding, and phone layouts cap the HUD size (touch: 100 %). The touch pad + buttons scale to the container width (`--tsz`, `cqw`) and re-fit on rotation. Transient full-width flourishes (countdown number, FINAL LAP / finish ribbons, intro card) are the only things that may sit over zones.
* **HUD overlap detector**: `src/ui/hud/overlap.check.mjs` starts a real race, forces a worst-case dynamic state (4 chips, coins, item x3, 8th place, 3 lap rows, ghost, 3 events, wrong-way, respawn ring, coach card / pill, rocket hint, skip pill, drift label, fps) and reports every pair of intersecting element boxes and anything off-screen in 22 viewport / HUD-size scenarios (390x844, 844x390, 1280x720, 1920x1080, phones down to 320x568, tablets, hudScale 0.7-1.4, large text). `npm run build && node src/ui/hud/overlap.check.mjs [--only=p390] [--shots=A]` (screenshots land in `.qa/ov/`; exit code 1 on any overlap).
* **Text fields** may claim Enter / Esc with `input._onEnter` / `input._onEsc` (the welcome dialog: Enter = "Let's race", Esc = "Skip"); otherwise Enter / Esc only finish editing. Soft keyboards that report an empty `KeyboardEvent.code` fall back to `key`.
* **Reduced motion** (OS setting or `settings.reducedMotion`): transitions collapse, menu camera sway/particles stop, count-ups jump, wipes are skipped. **Reduce flashes** disables boost pulses, rainbow star edge, screen-burst and wrong-way blink.
* The race clock, not UI frames, drives timed UI logic (coach) so it behaves under throttled frame rates and test fast-forward.
* **Input hygiene**: Nav swallows menu keydowns (so they never reach the game's `Input`) but lets every keyup through (a key released during a pause must not stay "held"); a freshly opened screen/modal swallows gamepad buttons that are already down (Start opens the pause menu and must not instantly close it).
* **Touch**: first tap on a driver/kart card previews it, a second tap (or "Choose") confirms; all targets are >= 44 px under `(any-pointer: coarse)`; the first coarse pointer switches `ui.device` to `touch`, which shows the on-screen race controls.
* **Scroll bodies** (`.set-body`, `.rec-body`, `.help-body`) never shrink their children (`> * { flex: none }`) and focus only scrolls inside the nearest scroll area (`nav.reveal`), never the `overflow:hidden` screen.

## 10. Known issues / next steps

* The HUD item slot shows Agent D's `getItemIcon` canvases; until D lands it is a lettered disc. Portraits likewise (C).
* Ghost live delta and the ghost minimap dot need `session.ghostPlayer` (Agent A); the saved-ghost/`config.ghost` path is implemented and tested with a simulated `ghostResult`.
* Software GL is slow, so animation timing was judged from stepped frames; real-device 60 fps behaviour of the CSS animations was not measured.
* Not implemented: daily challenge, per-driver profiles (one profile per browser), on-screen letter keyboard (the name field uses the native keyboard; Skip works with a pad).
