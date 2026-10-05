# Agent E — UI/UX, game flow, modes, persistence

**Goal:** a front-end and HUD that look and feel like a shipped AAA arcade racer: confident, juicy, effortless to navigate with keyboard, gamepad, mouse or touch —
from first launch ("Press Start") to a Grand Prix trophy ceremony — with all progress saved in `localStorage`.

**Read first:** `docs/ARCHITECTURE.md` (§4.7 is yours; §4.2 for kart fields the HUD reads), `docs/ART_DIRECTION.md` (UI section + palette), `docs/TESTING.md`, then your baseline:
`src/ui/UI.js`, `src/app/{App,MenuScene}.js`, `src/save/{Save,defaults}.js`, `src/shell/{shell.css,body.html}`; also `src/core/{Input,RaceSession,events}.js`, `src/data/roster.js`, `src/tracks/index.js`, `src/items/itemDefs.js`.

**You own:** `src/ui/*`, `src/app/*`, `src/save/*`, `src/modes/*`, `src/shell/*` (shell tokens: additive only). Keep the **App public API** (§4.7) working — the debug harness and tests use it.
The UI is plain DOM + CSS (+ small canvases) layered over the WebGL canvas in `#ui-root`; fonts `--font-display` / `--font-ui` are embedded (no network).

## Deliverables (priority order — commit after each)

### 1. App flow & screens (`src/ui/`, `src/app/`)
Boot → **Title** ("Press Start" gate that unlocks audio: `app.audio.unlock()`; animated logo, 3D kart backdrop via `MenuScene`) → **Main menu** (Grand Prix · Time Trial · Versus Race · Records · Settings · Help/Credits) →
**Driver select** (8 drivers, live 3D turntable preview using `MenuScene` + Agent C's `createKartShowcase`, portraits via `getDriverPortrait`, species/tagline, 5 stat bars incl. the *combined* driver+kart stats from `combinedStats`) →
**Kart select** (4 bodies, same treatment) → **Speed class** (Rookie/Pro/Master with descriptions) → **Cup select** (cards with trophy badges earned) → **Track select** (themed cards: gradient from `def.palette`, minimap outline from the track
registry/`createTrack(id).minimap` (cache it), best time/lap, difficulty stars, lock state) → **Loading** (progress bar, rotating tips) → **Race** → **Results**. Back always works (Esc / B / on-screen button); no dead ends.
Locked content shows a clear unlock hint. Menus are fully usable with **keyboard (arrows/Enter/Esc), gamepad (d-pad/stick/A/B), mouse and touch**; visible focus rings; every interaction plays `app.audio.ui(...)`.
`MenuScene`: make it gorgeous (stage, spotlights, reflective floor, floating particles, slow orbit camera, smooth cross-fades between kart/driver changes). Handle tab-hide auto-pause, resize/orientation, error boundary (friendly message + "reload"), a **fullscreen** button (feature-detected: may be unavailable inside the artifact frame), and audio gesture gating.

### 2. Race HUD (`src/ui/hud/`)
Reads `session.player`, `session.race`, `session.track`, `session.karts` and events. Must be readable over any background, scale with `settings.hudScale`, and adapt to portrait/landscape/phone:
speedometer (km/h|mph, animated arc/needle, boost glow) · lap counter + **FINAL LAP** banner · big position ordinal with change flash · **item slot** with roulette animation, `getItemIcon`, ×count badge · **minimap** (canvas; `track.minimap`; kart dots in driver colours, player highlighted, 20 Hz) ·
**drift/mini-turbo charge** indicator (blue → orange → pink by `kart.drift.level`) · race timer + lap-time list with delta vs best · **countdown** 3-2-1-GO with punchy animation (+ rocket-start hint) · wrong-way warning · event toasts ("+2 places!", "Hit by …", "New best lap!") · coins counter ·
**ink-splat overlay** when `kart.ink > 0`, shield/star/rocket status overlays, boost screen-edge glow · live mini leaderboard (top 5 + you) · track-name card during the intro · ghost indicator + live delta in time trial · optional FPS overlay (`settings.showFps`).
Touch: **on-screen controls overlay** (left/right steer pad or tilt-free split zones, drift + item + brake buttons) writing into `input.touch`; shown only on touch devices / when touch is used. Pause menu (Resume · Restart · Settings · Quit).

### 3. Modes (`src/modes/`)
- **Grand Prix**: pick a cup & class → race its tracks in order with the same driver/kart; points per place (15,12,10,9,8,7,6,5,4,3,2,1); standings screen after each race (animated table, driver portraits, points gained); after the last race a **podium ceremony** (3D podium in `MenuScene` with the top-3 `createKartShowcase`s, confetti, trophy gold/silver/bronze) and a result summary; grid order from standings after race 1. Save the best trophy per cup/class.
- **Time Trial**: 3 laps, no AI/items, 3 boosts; records best total/lap per track; records & loads **ghosts** (Agent A provides `session.ghostResult` / `config.ghost`); shows "New Record!".
- **Versus Race**: quick race — choose track, class, laps (1–5), racers (2–12), items on/off.
- **Unlocks**: start with drivers `pip, rusty, bruno, hopper`, bodies `classic, streak`, cup `blossom`, classes `rookie, pro`; unlock the rest via GP trophies (e.g. any trophy in Blossom → Starlight Cup; gold in Pro → Master; total races/wins unlock drivers/bodies). Show unlock toasts. Put the rules in one data table.
- **Records** screen (best times per track with who/what, trophies per cup/class), **Stats** (races, wins, podiums, distance, drift time…), **Settings** (see 4), **Help** (controls for keyboard/gamepad/touch; item guide using item defs), **Credits**.

### 4. Persistence & settings (`src/save/`)
All data in `localStorage` via `Save` (versioned schema + migration, merge-onto-defaults, debounced writes, try/catch everywhere, in-memory fallback when storage is blocked — show a gentle "Progress can't be saved in this browser mode" note in settings/title when `!save.persistent`).
**Export/Import**: show the save as a copyable text code (clipboard with fallback to a selectable textarea; **downloads/prompt()/alert()/confirm() do not work in the artifact frame** — build confirmations in-page) and import by paste, with validation.
Settings screen with live preview: Graphics (quality auto/low/medium/high/ultra → `app.renderer.setQuality`, resolution scale, post-FX, camera shake, FOV effect), Audio (master/music/sfx sliders → `app.audio.applySettings()`), Controls (keyboard **rebinding** UI via `input.captureNextKey`, reset to defaults, gamepad deadzone, vibration), Gameplay (auto-accelerate, speed units, minimap, camera mode, HUD scale), Accessibility (reduced motion, reduce flashes, large text). Everything applies immediately and persists.

## Quality bar / acceptance
- It looks designed: strong typographic hierarchy (display font + UI font), consistent chunky skewed style, spring animations, no default browser styling, no layout shifts, nothing clipped at 1920×1080, 1280×720, 390×844 (portrait phone) and 844×390 (landscape phone) — **test all four** with `playwright-cli resize` + screenshots and fix what you see.
- Complete flows verified with `playwright-cli`: title → menu → select → race (use `__kart.freeze/advance/render` to reach results) → results → GP standings → podium → back to menu; settings change + reload keeps them (`localstorage-list`); storage-blocked path works (simulate by overriding `Storage.prototype.setItem` to throw).
- Keyboard-only and gamepad-only navigation works (simulate gamepad via a mock in `eval` if needed). Zero console errors.
- No `alert/confirm/prompt`, no downloads, no external network requests. Respect `prefers-reduced-motion`.

## Stretch
Animated tutorial overlay for first race; daily-challenge style seeded races; per-driver profile (name entry on first launch with a tasteful on-screen keyboard fallback); achievement toasts; shareable result card (copyable text).
