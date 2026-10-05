# Agent B — Tracks & world: the courses and everything you see around the road

**Goal:** eight unforgettable, instantly distinguishable courses that look like a AAA kart racer and are a joy to race. The world is half of what makes this
game feel premium: lighting, colour, depth, animation, little surprises.

**Read first:** `docs/ARCHITECTURE.md` (esp. §4.3 Track contract + conventions), `docs/ART_DIRECTION.md`, `docs/TESTING.md`, then `src/track/SplineTrack.js` (a working generic track:
spline → samples → queries → baseline visuals) and `src/tracks/{index,sunny-meadows}.js`.

**You own:** `src/track/*`, `src/tracks/*`, `src/world/*` (+ new files). **Never break the Track API** in §4.3 — physics, AI, items, HUD all depend on it. Extend it additively.
Replace `_buildBaselineVisuals()` with a proper world system in `src/world/` (keep `SplineTrack` as the data/query engine; split visuals out).

## Deliverables (priority order — commit after EACH track so progress is never lost)

### 1. World engine (do this first, benchmark it on Sunny Meadows)
- **Surfaces & textures**: richly detailed procedural canvas textures (asphalt with wear/cracks/tyre marks and crisp lane lines, curbs, themed ground: grass, sand, snow, rock, lava rock,
  boardwalk, neon grid), tiled with variation (no obvious repetition), mip-mapped/anisotropic. Optional procedural normal/bump maps. Shared texture library in `src/world/textures.js`.
- **Terrain**: a real ground mesh that follows the road's elevation, blends from the road shoulder out into themed rolling hills/mountains/dunes (noise-based, low-poly, vertex-coloured), extends
  to the horizon, never lets the road float. Roads with elevation changes, banking, tunnels/overpasses where the theme wants them.
- **Barriers**: walls/rails that read per theme (tyre stacks, hay bales, guard rails, ice blocks, neon barriers, stone walls). Merged geometry; match the physics boundary (`halfWidth + shoulder`).
  Support `def.openEdges` (no wall: floating roads) with a clear visual edge.
- **Sky & light**: per-theme sky dome (gradient, sun disc/glow, procedural clouds, stars, aurora, nebula, planets), sun with shadow that follows the player (already in baseline; improve shadow
  stability/quality), hemisphere fill, fog tuned per theme, and **`app.renderer.setEnvironmentProfile({...})`** (exposure, bloom, vignette, saturation) called from `attach()` for the track's look.
  Expose the sky as `track.sky` (an Object3D/scene) so Agent C's renderer can build an environment map from it if it wants.
- **Scenery framework** (`src/world/scenery/*`): builders that return merged/instanced geometry — trees, bushes, flowers, rocks, cacti, pine trees, palm trees, crystals, lamp posts, buildings,
  signs, boats, windmill, lighthouse, tombstones, lava plumes, floating islands, etc. Scatter along the track by rules (distance from road, density, clustering, avoidance) using the **seeded** RNG; honour
  `quality.sceneryDensity` and `quality.drawDistance`; use `InstancedMesh`; far props can be billboards. Animated props (windmill, flags, water, lava, neon flicker) animate in `track.update(dt)` with zero allocations.
- **Features**: banking & elevation; **jump ramps** (zone `type:'ramp'`: the visible wedge MUST match the physics height profile — read `project()`), **boost pads** (animated glowing chevrons that pulse),
  `ice/mud/sand/water` zones with distinct looks, start/finish gantry with banner + checkered line, item-box rows (the item system draws the boxes; you only place `itemBoxes`), optional `coins`,
  grandstands/crowd billboards at the start, directional arrows before sharp corners, shortcut routes (risky, rewarding) where fun.
- **Performance**: ≤ ~350 draw calls for the whole static track at high; merged static geometry; instancing; shared materials; shadows only from what matters; no per-frame allocation; `applyQuality()` really scales cost.
- **Racing line for the AI**: improve `racingLine.offset/maxSpeed` so AI laps look natural (apex hugging, braking before hairpins) against the *real* kart physics (read `KartPhysics.js`; validate with `check.mjs` lap times and by watching screenshots).

### 2. The eight tracks (original; data in `src/tracks/*.js`, registered in `src/tracks/index.js`)
Two cups of four (`CUPS`): **Blossom Cup** and **Starlight Cup**. Each lap should take an AI at class `pro` about **50–75 s** (length ≈ 1500–2300 m), 3 laps default, road width 14–20 m.
Each needs: unique layout, unique palette/lighting, ≥ 2 signature set-pieces, at least one boost pad, items rows, a themed `music` key, `difficulty` (1–3), `description`, `palette` (+ add `ui:{primary,secondary}` colours for menu cards).

| # | id | cup | theme & set-pieces |
|---|---|---|---|
| 1 | `sunny-meadows` | blossom | Bright day. Rolling green hills, flower fields, a stream with a wooden bridge, windmill, pond; wide forgiving curves, gentle banking. **Your benchmark — make it gorgeous first.** |
| 2 | `cactus-canyon` | blossom | Desert sunset (orange/teal). Sandstone arches & canyon walls, cacti, tumbleweeds, a **jump ramp over a gap**, sand off-road, a narrow canyon squeeze. |
| 3 | `frostbite-peak` | blossom | Snowy mountain (blue/white). Pines, snowmen, igloos, aurora sky, falling snow, **ice patches** (slidey zones), a long downhill hairpin sequence. |
| 4 | `harbor-heights` | blossom | Tropical harbor. Animated sea, palm trees, boats, lighthouse, boardwalk, a drawbridge/ramp, beach off-road, golden-hour light. |
| 5 | `neon-nights` | starlight | Night city. Skyscrapers with emissive windows, neon signs (flicker), wet-looking road, elevated overpass with banking, a tunnel, big bloom. |
| 6 | `magma-mile` | starlight | Volcano. Animated lava rivers + glow, rock spires, fire geysers, a narrow bridge section (open edges → fall → respawn), red/charcoal palette, heat haze (cheap). |
| 7 | `spooky-hollow` | starlight | Haunted forest at night. Fog, twisted trees, tombstones, a mansion silhouette, floating lanterns/ghost wisps, bats, huge moon; narrow, tricky. |
| 8 | `starlight-spiral` | starlight | A glowing ribbon road through space: stars, planets, nebulae, rainbow-ish glow, spiral/vertical elevation, **no walls** (open edges), rescue-on-fall. The finale. |

Layout rules: a real kart-racer flow (long straight with boost pad, sweepers, S-curves, a hairpin, a chicane, one ramp or risk/reward spot). No unintentional self-overlap (intentional crossings need > 6 m vertical separation).
Control-point density must keep the spline smooth (no kinks). Validate EVERY track: `node scripts/check.mjs --track=<id> --laps=2` (all AI finish, no stuck/respawn spam) and view screenshots from the chase cam at 3–4 points of the lap (start, a set-piece, a corner, a long shot).

### 3. Hand-offs to other agents (document in `docs/tracks.md`)
`track.minimap` (polyline + bounds; add `track.minimap.width` profile if useful), `def.palette.ui`, `track.sky`, `track.theme`, `def.music`. Physics/AI constants you rely on. How to add a new track in 10 minutes.

## Quality bar / acceptance
- Each track is recognisable from a single screenshot, has depth (foreground/mid/background layers) and a clear road. Compare your screenshots against ART_DIRECTION: saturated, readable, stylised, no flat grey voids, no z-fighting, no floating road, no visible tiling seams.
- `check.mjs --track=all --laps=2` passes; no console errors; sensible draw-call counts (`renderer.info`); track build time ≤ ~400 ms each (`createTrack` timing).
- `quality: low` still looks good (fewer props, no shadows); `high` is lush.

## Stretch
Weather particles (snow/rain/embers) as an ambient `world/ambient.js`; day-night variants; dynamic crowd; track-specific hazards that are *cosmetic only* unless you define a zone type physics already supports; mirror mode (`createTrack(id,{mirror:true})` flips x).
