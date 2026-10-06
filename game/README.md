# Kart Rush GP

An original arcade kart racer for the browser, built with **Three.js**. Drift for mini-turbos, grab item boxes, race seven AI critters across
eight courses in two cups, chase Grand Prix trophies and Time Trial ghosts. Everything is procedural (models, textures, audio), the game is
frontend-only, and all progress is saved in `localStorage`.

It is an homage to the *genre*: every character, track, item and tune is original.

## What is in it
- **8 courses in 2 cups** — Blossom Cup: Sunny Meadows, Cactus Canyon, Frostbite Peak, Harbor Heights · Starlight Cup: Neon Nights, Magma Mile, Spooky Hollow, Starlight Spiral. Each has its own look, lighting, set-pieces, boost pads, ramps and music.
- **8 critter drivers** (penguin, fox, bear, frog, cat, robot, rhino, duck) with different stats, and **4 kart bodies** — all built from code, with animated faces, tails and secondary motion.
- **Handling that rewards skill** — tap-to-hop drifting with three mini-turbo levels, slipstreaming, rocket starts, off-road and ice, jumps, weight-based bumping.
- **Ten items** — Nitro Boost, Slick Peel, Ricochet Orb, Seeker Rocket, Time Bomb, Comet, Storm Zap, Prism Shield, Rocket Rider, Ink Splat (some come as triples) — plus coins; position-weighted so the pack stays close.
- **AI rivals** that drift, dodge, use items and bump, in three classes (Rookie, Pro, Master).
- **Modes** — Grand Prix (points, standings, podium, trophies, unlocks), Time Trial (ghost replay, records), Versus Race (tracks, laps, racers, items on/off).
- **Procedural audio** — engines, drift/boost/hit effects and a different original tune for every course.
- **Polish** — post-processing (bloom, speed FX), adaptive resolution, quality presets, keyboard / gamepad / touch controls with rebinding, responsive HUD, accessibility options, export/import of saves, an "Unlock everything" switch in Settings → Data.

## Run it
```bash
cd game
npm install
npm run build          # dist/index.html  (single self-contained file; add --prod via `node scripts/build.mjs --prod` to minify)
npm run serve          # http://127.0.0.1:8100/
```
`dist/artifact.html` is the same game as an HTML fragment for the Claude Artifact tool.

## Controls
| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Accelerate / brake-reverse | `W` `S` / `↑` `↓` | RT / LT (or A / B) | on-screen pedals |
| Steer | `A` `D` / `←` `→` | left stick | on-screen pad |
| Drift (hop, then hold) | `Space` / `Shift` | RB | on-screen button |
| Use item (hold brake = throw backward) | `E` / `F` / `Ctrl` | LB / X | on-screen button |
| Look back / camera / respawn / pause | `Q` / `C` / `R` (hold) / `Esc` | Y / Back / – / Start | |

## Project layout
```
game/
  src/        game source (ES modules): core, physics, race, camera, track/tracks/world, vehicles/vfx/render, items/ai/audio, ui/app/modes/save
  scripts/    build.mjs  serve.mjs  check.mjs  shots.mjs  handling.mjs  camera.mjs  input.mjs
  docs/       ARCHITECTURE.md (contracts) · TESTING.md · ART_DIRECTION.md · engine.md tracks.md visuals.md gameplay.md ui.md (per-module notes)
  tools/      playwright-cli config (headless Chromium + SwiftShader WebGL)
```

## Quality gates
```bash
node scripts/check.mjs --track=all --laps=2 --prod --csp   # minified build served with an artifact-like CSP; full AI races on every track;
                                                           # fails on console errors, NaNs, stuck karts, CSP violations
node scripts/handling.mjs                                  # driving-feel report (accel, turn radii, drift economy, rocket start)
node scripts/camera.mjs ; node scripts/input.mjs           # camera and input reports
node scripts/shots.mjs --track=all --at=9,38               # chase-cam screenshots into .qa/shots/ for visual review
node src/save/selftest.mjs ; node src/modes/selftest.mjs   # save layer and game-mode logic
```

## Tech notes
- Three.js r186, esbuild (IIFE bundle inlined into one HTML file with embedded fonts), no runtime network access, no workers, no eval.
- Subsystems talk through a typed event bus and a small set of documented APIs (`docs/ARCHITECTURE.md`), so each can be improved independently.
- `window.__kart` is a test harness (freeze / advance / render / state / setInput) used by the automated checks and the screenshot tools.
- Built by a five-agent team working in parallel git worktrees (engine, tracks, visuals, gameplay, UI), then integrated and verified headlessly.
