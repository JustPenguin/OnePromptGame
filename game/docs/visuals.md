# Visuals: karts, drivers, VFX and the render pipeline (Agent C)

Everything is procedural (no asset files, no network) and original. Owner modules: `src/vehicles/*`, `src/vfx/*`, `src/render/*`.
Conventions used everywhere in these modules:

* Kart **model space**: `+Z` forward, `+X` = the kart's **left**, `+Y` up, origin on the ground under the kart's centre.
* Physics fields read each frame (never written): `speed, steerVisual, lean (+ = roll right), pitch, grounded, vy, drift.{dir,level,angle}, boost.{timer,strength}, spin.timer, stun, invincible, shrink, rocket, respawn.active, input.{lookBack,brake,throttle}, race.{place,finished}, orientation, position, forward, right, up, velocity, slide, surface, scale`.
* Everything allocation-free in the per-frame paths; quality is read from `renderer.quality` (the live preset, see §3).

## 1. Karts and drivers (`src/vehicles/`)

| file | what |
|---|---|
| `build.js` | geometry kit (rounded boxes, lofts, lathes, tubes, swept fender arches, extrusions), `Rig` (bone layout) and `PartBuilder` (bakes dozens of parts into ONE indexed skinned geometry with per-vertex colour+AO, `aPbr`, decal UVs, bone index). Global detail factor for LODs. |
| `bodies.js` | the 4 bodies (`classic, streak, hopper, crusher`): specs (wheel layout, seat/steer positions, exhaust + headlight mounts, `fenderClear`, `exhaustDir`) and builders. `addWheel` makes tyres, lugs, hubs. |
| `drivers.js` | the 8 drivers (`pip` penguin, `rusty` fox, `bruno` bear, `hopper` frog, `luna` cat, `gizmo` robot, `rocco` rhino, `quill` duck) built on a shared humanoid base + species parts, with secondary-motion chains (ears, tails, antennae, crest, flag). |
| `faces.js` | face atlas per driver (8 expressions: open, blink, happy, wow, dizzy, ouch, determined, sad); drawn in angular coordinates and mapped on a sphere patch on the head. |
| `livery.js` | decal atlas (race number, signature flank design, top stripes) tinted with the driver's colours. |
| `kartMaterial.js` | the patched `MeshPhysicalMaterial` (clearcoat on `high`+) / `MeshStandardMaterial` used by every kart: per-vertex roughness/metalness/emissive/clearcoat mask, decals over vertex colour, fresnel rim, flash / rainbow / glow, custom paint. All karts of one quality share ONE compiled program. |
| `KartVisuals.js` | `KartVisual` (scene graph, animation, events), `attachKartVisual`, `createKartShowcase`, asset cache + LODs. |
| `portraits.js` | `getDriverPortrait`, `getKartPortrait`: real 3D renders cached in canvases. |
| `podium.js` | `createPodiumScene(top3)`. |

**Per kart: 1 SkinnedMesh + 1 face mesh = 2 draw calls** (+1 `Points` while dizzy). ~15-20k triangles at LOD0; AI karts swap to 45 % / 22 % geometry by camera distance (hysteresis 26/20 m and 62/50 m; lower LODs are built in the background so nothing hitches). The player kart is always LOD0.

### Public API

```js
import { attachKartVisual, createKartShowcase, createPodiumScene, getDriverPortrait, getKartPortrait } from '../vehicles/KartVisuals.js';

attachKartVisual(kart, session)            // sets kart.visual; called by RaceSession.createKarts (already wired)
   // optional custom paint: kart.paint / kart.ext.paint / session.config.player.paint  (any CSS colour, e.g. '#ff3d9a')
kart.visual.setGhost(true|false)           // translucent cyan time-trial ghost look (also stops it casting a blob shadow)
kart.visual.setPaint('#22d3ff' | null)     // custom paint colour: only the driver's primary paint is recoloured (AO kept, stripes/chrome untouched)
kart.visual.setQuality('low'|'medium'|'high'|'ultra')   // called by GameRenderer.setQuality for you
kart.visual.mountWorld(name, outVec3, kart)  // world position of 'exhaustL|R','headL|R','wheelFL|FR|RL|RR','head','nose','tail'

const show = createKartShowcase(driverId, bodyId, { pose, quality, envMap, paint });
show.root                  // THREE.Group: add it to any scene (model faces +Z)
show.update(dt)            // call every frame (solves the pose immediately, no flush needed)
show.setPose('idle'|'drive'|'drift'|'boost'|'cheer'|'sad'|'dizzy'|'lookback'|'star')
show.react('hit'|'wow'|'happy'|'sad'|'boost'), show.setGhost(on), show.setPaint(css|null), show.dispose()

getDriverPortrait(driverId, size = 128, opts?)          // -> HTMLCanvasElement (cached; transparent background)
getKartPortrait(driverId, bodyId, size = 192, opts?)    // opts: { az, el, expression, background, supersample, paint }
   // returned canvas is repainted IN PLACE with the 3D render as soon as the renderer exists (a coloured disc until then);
   // call refreshPortraits() once after the first frame if the UI created portraits before the renderer.

const pod = createPodiumScene([{ driverId, bodyId }, ...top 3 in finishing order]);   // or karts
app.renderer.render(pod.scene, pod.camera, null);    // + pod.update(dt) each frame, pod.setAspect(w/h), pod.dispose()
```

**Render-time flush.** `kart.visual.update()` only accumulates time; the pose solve (bones, LOD swap, materials) runs in `visual.flush()`, which `GameRenderer.render()` calls for every kart right before drawing. If you ever render a race scene with a different renderer, call `kart.visual.flush?.()` on every kart first (otherwise karts stay in their rest pose).

### Animation (all procedural, driven by kart state + events)
Wheel spin/steer (counter-steer in drift), body roll/pitch group, suspension and squash springs, steering wheel, torso lean, head look into turns/drift, look-back, blinking and expression logic, arms (wheel, flail, cheer, throw), secondary chains, flash/rainbow/glow uniforms, dizzy stars, respawn flicker, finish cheer/slump. Events used: `ITEM_HIT, SPIN_OUT, LAUNCH, LAND, HOP, JUMP, BOOST, DRIFT_START/LEVEL/BOOST, WALL_HIT, BUMP, SHRINK, RESPAWN_DONE, ITEM_USE, START_BURNOUT, KART_FINISH`. Fenders ride on their own bone (`fender`) that follows ride height but never squashes, so tyres never poke through the arches.

### How to add a driver
1. `src/data/roster.js` (lead): add the entry with `colors { primary, secondary, accent }`.
2. `drivers.js`: write `buildX(ctx)` (use `humanoidBase`, `addHelmet`, `addEars`, `addChain` ...) returning `{ head: { center, radii }, secondary: [...], faceOffset }`; register it in `DRIVER_BUILDERS`. Unknown ids fall back to Pip's builder.
3. `faces.js`: add a `FACE_STYLES[id]` entry (eye shape/colours, optional emissive).
4. `livery.js`: add `RACE_NUMBERS[id]` and a `DESIGNS[id]` flank design.
5. Look at it: `window.lab` (see §6) or `createKartShowcase(id, 'classic')`.

### How to add a kart body
Add `SPEC` + `buildX(B, rig, pal)` in `bodies.js` (use `B.add(geometry, { p, r, s, c, ...M.paint, bone, mirror, decal, tag })`), return `{...SPEC, mounts: { exhaustL, exhaustR, headL, headR } }`, register in `BODIES`. Tag optional detail parts (`spokes, rivet, whisker, lugs, ...`, see `LOD_MIN` in `build.js`) so LODs can drop them; keep every tyre-to-arch gap >= `fenderClear`.

## 2. VFX (`src/vfx/`)

`new VFX(session)`: `.group` (added to the scene by `RaceSession`), `.update(dt)`, `.dispose()`, `.spawn(name, position, opts)`, `.spawnForKart(kart, name, opts)`, `.setHeadlights(bool)`.

One-shot names (unknown names are a silent no-op): `explosion {scale,color}`, `sparkle {color,count}`, `smoke`, `hitStars`, `boostBurst {color,dir,scale}`, `pickup {color}`, `confetti {count}`, `splash {color,scale}`, `dust {color,scale}`, `ring {color,radius}`, `respawn`, `shockwave`.

Driven automatically by events and kart state: tyre smoke, surface dust / spray / mud chunks, drift sparks (blue, orange, pink by level) with ground glow and level-up rings, mini-turbo and boost flame cones (stack-aware direction) + trailing sparks + ring pop, wall scrape sparks, landing dust rings, pickup sparkle, item-hit stars, explosions, shield bubbles, invincibility star trail, slipstream streaks, skid marks, blob shadows, rescue drone on respawn, finish confetti, headlight beams on dark tracks (auto-detected from the horizon/fog luminance or `track.def.night`; override with `setHeadlights`).

Rendering budget: 2 particle draw calls (additive + alpha ring buffers, stateless GPU simulation: the CPU only writes a particle when it spawns), 1 skid-mark ribbon, 1 instanced flame mesh, 1 instanced blob-shadow mesh, 1 instanced beam mesh, plus pooled drones / shield bubbles only while active. `quality.particles` scales spawn rates and capacity. GPU buffer ranges are tracked in `dirty.js` so several simulation steps per rendered frame still upload everything.

### How to add an effect
Write a `_myEffect(x, y, z, ...)` in `VFX.js` out of the helpers `spark / glow / pool / star / ring / ringBB / puff / chunk` (colours may exceed 1: bloom turns them into light), add a `case` in `spawn()` and/or an `on(EV.X, ...)` handler in `_wire()`, then look at it with the lab or `__kart` (`__kart.session.vfx.spawn('myEffect', kart.position)`). New sprites go in `sprites.js` (4x4 atlas, ids in `SPR`).

## 3. Render pipeline (`src/render/`)

`GameRenderer(canvas)`: `.renderer`, `.quality`, `.pipeline` (`'post'|'direct'`), `.setQuality(q)` (live: karts re-pick materials/livery, sky probe rebuilt), `.resize()`, `.setResolutionScale(s)`, `.setAutoQuality(bool|null)`, `.render(scene, camera, session|null)`, `.setEnvironmentProfile(p)`, `.flash(r,g,b,amount)`, `.stats()`, `.renderToPixels(...)`, `.onSessionLoaded/onSessionDisposed`, `.dispose()`; `supportsVisualFlush = true`.

* **`post` pipeline** (medium and up, when WebGL2 float render targets exist): scene -> MSAA half-float target -> dual-filter bloom with soft threshold (Karis-averaged first pass, 3x3 tent upsample, additive) -> ONE composite pass: radial speed blur, chromatic aberration, speed lines, vignette, flash, exposure, tone mapping (`tonemap` 0 = Khronos Neutral ... 1 = ACES; default 0.2 blend), sRGB, saturation/contrast, dither/grain.
* **`direct` pipeline** (low or no float targets): scene straight to the canvas with `renderer.toneMapping`.
* **Environment**: an analytic sky dome (colours from `track.def.palette`, sun from the first `DirectionalLight`, soft boxes) is captured with PMREM into `scene.environment` per session (64/128/256 px by quality); karts also get it as an explicit `envMap`.
* **Presets** (`quality.js`): `low` (direct, no shadows, 0.35 particles), `medium` (post, 2x MSAA, 4 bloom levels, shadows 2048), `high` (4x MSAA, 5 levels, clearcoat), `ultra` (6 levels, 4096 shadows, 1.4 particles). `settings.quality === 'auto'` (and no `?quality=`) adapts `resolutionScale` from a frame-time EMA: `> 20 ms` for 2 s -> -0.1 (min 0.6); `< 12 ms` for 3 s -> +0.05.
* **Profile keys** for `setEnvironmentProfile`: `exposure, bloomStrength, bloomThreshold, bloomRadius, bloomKnee, vignette, saturation, contrast, chroma, grain, envIntensity, tonemap`.
* **Custom `ShaderMaterial`s must end with** `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` (the direct path needs them; the post path renders linear HDR and converts once). The track's sky dome currently lacks them, which is why `low` quality shows a more saturated sky than `high`.
* `?fps=1` (or `settings.showFps`) shows an overlay: fps, frame ms, draw calls, triangles, preset, scale. `?quality=low|medium|high|ultra`, `?scale=0.5`.
* WebGL context loss: the loop pauses, on restore a fresh environment factory and post targets are built; nothing throws.

## 4. Performance (measured)

__PERF__

## 5. Known issues / ideas

* Software GL (the QA environment) is ~10-30x slower than a GPU: frame times in this document come from the CPU side only; check a real GPU before tuning budgets.
* Chase camera distance / FOV are Agent A's: at speed the camera sits ~10.6 m back with a ~76 degree FOV, so the kart is ~110 px wide at 720p. VFX are sized to read at that distance.
* The kart skeleton has no per-wheel suspension travel (the chassis moves relative to the wheels); tyre deformation and emote bubbles are not implemented.
* Custom paint recolours by chromaticity match with the driver's primary; drivers with grey primary paint could pick up grey trim.
* The direct (low quality) path shows the baseline sky un-tonemapped (see §3).

## 6. Test tooling

`window.lab` (a scratch page bundling the production modules; kept out of the repo under `game/.qa/`) renders contact sheets and multi-view shots of any driver/body, portraits, atlases and stats. The standard checks: `npm run build`, `node scripts/check.mjs --quality=low|medium|high [--track=all --laps=2]`, `__kart.advance(n)` + `__kart.render()` in a `playwright-cli -s=<name>` session.
