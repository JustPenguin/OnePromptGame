# Kart Rush GP

An original arcade kart racer for the browser, built with **Three.js**. Drift for mini-turbos, grab item boxes, race eight AI
critters across eight courses in two cups, and chase trophies and ghost records. Everything is procedural (geometry, textures, audio),
frontend-only, and all progress is saved in `localStorage`.

This is an homage to the *genre*; all characters, tracks, items and music are original.

## Run it
```bash
cd game
npm install
npm run build          # dist/index.html  (single self-contained file)
npm run serve          # http://127.0.0.1:8100/
```
Open `dist/index.html` through any static server (or publish `dist/artifact.html` as a Claude Artifact).

## Controls
| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Accelerate / brake-reverse | `W` `S` / `↑` `↓` | RT / LT (or A / B) | on-screen pedals |
| Steer | `A` `D` / `←` `→` | left stick | on-screen pad |
| Drift (hop, then hold) | `Space` / `Shift` | RB | on-screen button |
| Use item (hold brake = throw backward) | `E` / `F` / `Ctrl` | LB / X | on-screen button |
| Look back / camera / respawn / pause | `Q` / `C` / `R` / `Esc` | Y / Back / – / Start | |

## Project layout
```
game/
  src/           game source (ES modules)       docs/ARCHITECTURE.md – module contracts and conventions
  scripts/       build.mjs  serve.mjs  check.mjs   (esbuild single-file build, static server, headless AI-race regression)
  docs/          architecture, testing guide, art direction, per-module notes
  tools/         playwright-cli config (headless Chromium + SwiftShader WebGL)
```
Quality gate: `node scripts/check.mjs --track=all --laps=2 --prod --csp` builds the minified bundle, serves it with an artifact-like
Content-Security-Policy, runs full AI races on every track in a headless browser and fails on console errors, NaNs, stuck karts or CSP violations.

## Tech notes
- Three.js r186, esbuild (IIFE bundle inlined into one HTML file with embedded fonts), no runtime network access.
- Fixed seams between subsystems (physics, race rules, tracks, items/AI/audio, visuals, UI) communicate through a typed event bus and a small set of documented APIs.
- `window.__kart` is a test harness (freeze / advance / render / state) used by the automated checks.
