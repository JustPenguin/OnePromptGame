# Agent C — Karts, drivers, VFX and the render pipeline

**Goal:** the karts and drivers are the stars — characterful, glossy, expressive, and alive — and the whole frame (lighting, particles, post-processing)
looks like a polished AAA arcade racer. Players should grin when they see a kart drift sparks, a boost flame, a driver reacting.

**Read first:** `docs/ARCHITECTURE.md` (§4.4–4.5 are yours), `docs/ART_DIRECTION.md`, `docs/TESTING.md`, then your baseline files:
`src/vehicles/{KartVisuals,portraits}.js`, `src/vfx/VFX.js`, `src/render/{GameRenderer,quality}.js`, plus `src/physics/Kart.js` (the state you animate from), `src/core/events.js`, `src/data/roster.js`.

**You own:** `src/vehicles/*`, `src/vfx/*`, `src/render/*` (+ new files). Keep the exported API in §4.4/4.5; add, don't rename.

## Deliverables (priority order — commit after each)

### 1. Karts & drivers (`src/vehicles/`)
- **4 kart bodies** (ids in `roster.js`: `classic, streak, hopper, crusher`) each with a distinct silhouette: classic go-kart racer; low wedge GT with big rear wing; chunky buggy with oversized
  knobbly rear tyres and roll bar; heavy bruiser with bull-bar, exhaust stacks and armour plates. Built procedurally from rounded geometry (capsules, lathe, extruded bevelled shapes,
  spheres, tori) and **merged per material** (≤ 8 draw calls per kart). Materials: glossy paint (low roughness; `MeshPhysicalMaterial` clearcoat on `quality ≥ high`), chrome/metal trim, rubber
  tyres with coloured hubs and tread, emissive head/tail lights and under-glow, canvas-texture decals (race numbers, stripes, flames) tinted by the driver's livery (`driver.colors`).
- **8 drivers** (`pip` penguin, `rusty` fox, `bruno` bear, `hopper` frog, `luna` cat, `gizmo` robot, `rocco` rhino, `quill` duck): original, lovable, readable from 8 m behind. Big expressive heads, helmets/goggles
  in their colours, hands on the wheel, species features (penguin flippers & beak, fox tail & ears, bear round ears, frog huge eyes, cat whiskers/tail, robot antenna & visor lights, rhino horn, duck bill).
  Faces via canvas textures with blinking eyes and swappable expressions.
- **Animation** (driven by `kart` fields every frame, all allocation-free): wheel spin & steering, suspension bounce (speed/bumps), body roll (`kart.lean`), pitch on accel/brake, drift lean + driver looks into the turn,
  hop squash/stretch, landing squash, boost (driver leans back, eyes widen, tail/ears fly), spin-out (dizzy stars), launched (flail), shrink (`kart.scale` is handled by physics; add shrink cartoon wobble), invincible/rocket (rainbow/star glow
  shader or emissive pulse), respawn flicker, look-back (head turn), finish celebration (cheer jump) / loser slump (use `kart.race.place` & `EV.KART_FINISH`). Secondary motion (springy tails/ears/antenna).
  Optional `kart.visual.setGhost(true)` → translucent ghost look (used by time-trial ghosts).
- `createKartShowcase(driverId, bodyId, {pose})` for menus/podium (idle animation, cheer, sad poses) and `getDriverPortrait(driverId, size)` → real 3D renders cached to canvases (render once to an offscreen target; the UI shows them in selects/results). Also export `getKartPortrait(driverId, bodyId, size)`.
- Karts must look great in every theme: give them a proper `scene.environment` (see 3) and rim light.

### 2. VFX (`src/vfx/`)
One pooled, **GPU-friendly particle system** (instanced quads/points, soft sprite atlas generated on a canvas, additive + alpha layers, `quality.particles` scales budgets) and these effects — all triggered by events and kart state, plus `vfx.spawn(name, pos, opts)` for others:
tyre smoke while drifting/skidding, surface-coloured dust/spray off-road (`SURFACE_PROPS[..].particle`), **drift sparks** from both rear wheels (blue → orange → pink by `drift.level`), **mini-turbo & boost flames** from the exhausts (stretched additive cones + particles, bigger for stronger boosts) with
a brief speed-ring pop, wall-scrape sparks, landing dust ring, item-box pickup sparkle, item hit stars, big **explosion** (fireball + shockwave ring + debris + smoke), shield bubble / star sparkle trail / rocket exhaust, water splash,
snow spray, **skid marks** (pooled decal ribbons fading over ~8 s), respawn **rescue drone** (a small cute drone/balloon model lifts the kart: listen to `EV.RESPAWN` and read `kart.respawn.{from,to,t,dur}`), finish **confetti**, slipstream wind streaks (`EV.DRAFT` if Agent A adds it).
Zero per-frame allocation; hard caps on live particles; cheap on `low`. Unknown effect names → silent no-op.

### 3. Render pipeline (`src/render/`)
- `GameRenderer`: EffectComposer chain — scene → **bloom** (UnrealBloom/threshold-tuned, only bright things glow) → custom pass(es) for **vignette, subtle chromatic aberration and radial speed blur scaled by speed/boost, colour grade (exposure, contrast, saturation from
  `setEnvironmentProfile`)** → OutputPass (tone mapping + sRGB). MSAA render targets (WebGL2 `samples`) for AA where `quality.antialias`. `low` quality = direct render, no composer.
- `onSessionLoaded(session)`: build a `scene.environment` (PMREM from the track's `track.sky` if present, else a neutral studio/sky environment) so paint and chrome reflect the world; set up shadow/light helpers if needed. `onSessionDisposed`: free everything.
- **Quality system**: presets in `quality.js` (`low/medium/high/ultra`); `settings.quality === 'auto'` → adaptive resolution scaling from a frame-time EMA (drop `resolutionScale` toward 0.6 when > ~20 ms for 2 s; recover when < 12 ms), plus DPR clamp; changes apply live via `setQuality`. Handle WebGL context loss/restore gracefully. Expose `renderer.stats()` (draw calls, triangles, frame ms) and an optional tiny FPS/frame-time overlay when `?fps=1` or `settings.showFps`.
- Speed-FX overlay: screen-space speed lines at high speed / boost (cheap shader quad), subtle camera-motion feel — but never obscure the road.

## Quality bar / acceptance
- Screenshots (view them!) of: each of the 8 drivers on each of the 4 bodies (turntable contact sheet via `createKartShowcase`), in-race chase-cam shots in different lighting, drift sparks at each level, boost flames, explosion, off-road dust, skid marks, post-FX on/off comparison.
- Draw calls per kart ≤ 8; 12 karts + VFX + post ≤ ~250 draw calls of yours; no per-frame allocations in `update` paths (profile by running `__kart.advance(60)` and watching heap via `performance.memory` if available, or reasoning + code review).
- `check.mjs --track=all` still passes with all quality presets (`--quality=low|medium|high`); zero console errors/warnings from your code; WebGL context loss doesn't crash.
- It should look *expensive*: clear depth, crisp highlights, saturated-but-not-clipped colour, no banding in gradients, no shimmering shadows.

## Stretch
Driver voice-less "emotes" bubbles; tyre deformation; headlight cones at night tracks (cheap additive cones); photo-mode-like podium scene helper `createPodiumScene(top3)` for Agent E; per-kart custom paint colour option in `createKartShowcase`.
