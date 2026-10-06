# Tracks & world (Agent B): track engine, world engine, the eight courses

Owner: Agent B.  Files: `src/track/*` (data + queries), `src/tracks/*` (definitions, layout compiler, registry, tools), `src/world/*` (everything you see).
Everything is additive on top of the Track API in `docs/ARCHITECTURE.md` section 4.3; nothing that existed changed meaning.  All art is procedural (canvas textures, merged
vertex-coloured geometry, shaders): no assets, no network.

## 1. How a track is assembled

```
src/tracks/<id>.js         DATA: id/name/cup/theme/music/difficulty/palette(.ui), layout (fillet polygon), zones, openEdges, coinLines
src/tracks/layout.js       compileLayout(spec) -> closed centripetal Catmull-Rom control points + named markers (corner `X`, straight `X>`)
src/track/SplineTrack.js   resamples every ~2 m, builds hw/shoulder/bank/surface arrays, zones, features, racing line, minimap; project()/sampleAt()/...
src/world/recipes/<id>.js  LOOK: `w.configure({sky, light, fog, profile, road, barriers, start, terrain, ...})` + scenery / structures / water / ambient
src/world/World.js         builds road ribbon, terrain, barriers, features, scenery layers; owns sky + lights; attach/applyQuality/update/dispose
```

`createTrack(id, { quality, headless, mirror })` (in `src/tracks/index.js`) returns a `SplineTrack`; `headless: true` skips the world (Node tools, validator, AI tests).

### Layout compiler (`src/tracks/layout.js`)
`layout: { width, shoulder, start: {at, offset}, minStraight, v: [...] }` where `v` is a polygon of waypoints `{ id, x, z, r, y, w, sh, bank, keys }`.
Each corner is filleted with radius `r` (so the loop is closed and smooth by construction).  `y` = road height, `w`/`sh` = width / shoulder, `bank` = degrees (positive rolls into a
right turn).  `keys: [{ at: metres-along-the-straight, w, sh, y, bank }]` pin values along the straight after a corner (the Magma bridge neck is one).
Markers: `id` = the corner, `id>` = the straight that follows.  Zones and item rows address `{ at: 'J>', offset: 64, length: 12 }` so they follow the layout when it is edited.
Two opposite corners closer than `minStraight` (10 m) get a straight inserted (S-bend rule).  `turtleVertices(start, steps)` builds spirals (Starlight Spiral).

### World engine (`src/world`)
* **Terrain** (`terrain.js`): the road corridor is graded and blended into natural noise terrain (`natural(x,z,c)` / `color(...)` callbacks per recipe), carvers (water basins), `free` ranges
  (bridges / viaducts / gaps have no ground), an aligned coarse LOD ring + skirt out to `outerMargin`; `RoadIndex` is a flat counting-sorted grid (no allocation per query).
  `verifyBelowRoad()` guarantees no terrain pokes through the road.
* **Layers** (`World.layer({ geometry, material, cull, chunk })`): chunked `InstancedMesh`, rank-based density (`quality.sceneryDensity` drops the *last* instances, so props never pop),
  distance culling, seeded RNG (`mulberry32`) so every run is identical.  Scatter helpers use `w.groundAt`, `w.road.query` and `w.exclude(x, z, r)` to keep props off the road.
* **Merged geometry** (`builder.js` `GeoBuilder`): quads/tubes/boxes with vertex colours; HDR colours (> 1) are used for bloom glow.
* **Sky** (`sky.js`): one shader dome (gradient, sun/moon disc + glow, procedural clouds, stars, aurora, nebula, planets).  `track.sky` is rotation-only so Agent C can PMREM it.
* **Road surface**: ribbon with `road.texture` (canvas), kerbs, shoulders, fascia skirts; `road.wet` adds a procedural wet look; `road.specular` (default 0.55) caps the grazing Fresnel.
* **Features**: barriers (`barriers.js`, several types, gaps/open edges handled), boost pads, ramps (visible wedge == physics profile), surface zones, open-edge trim, corner signs,
  start gantry + checker line + grandstands, item-box row markers, coin lines.
* **Ambient**: GPU-driven particles / plumes / flocks / billboards (`ambient.js`, `plumes.js`, `birds.js`, `billboards.js`, `ghosts.js`) - zero CPU work per frame.
* **Water / lava / ice** (`water.js`, `lavaflow.js`): depth-map shader; `look: 'water'|'lava'|'ice'`.
* **Quality**: `applyQuality(q)` scales scenery density, draw distance (fog far), shadows, sky features (clouds / aurora / nebula off on `low`), ambient counts.

### Racing line (`src/track/racingLine.js`)
Minimum-curvature solve on the unrolled 3-lap loop (banded Cholesky + active set for the road edges), attractors for boost pads and jump lines, speed profile from the line's own curvature
(`A_LAT 25`, `A_BRAKE 19` m/s^2), `minSpeed` before ramps / gaps.  Exposed as `track.racingLine.{offset,maxSpeed,curv,minSpeed}`.

## 2. The eight tracks

| # | id | cup | look | length | AI lap (pro, 8 racers) | pads / ramps / gaps | signature set-pieces |
|---|----|-----|------|-------:|-----------------------:|---------------------|----------------------|
| 1 | `sunny-meadows` | blossom | bright day, flower hills | 2141 m | 70.6 s | 2 / 0 / 0 | stream + wooden bridge, windmill hill, pond, flower fields, sunflower chicane, grandstands |
| 2 | `cactus-canyon` | blossom | desert sunset, orange/teal | 2074 m | 69.1 s | 2 / 1 / 1 | sandstone arches + canyon squeeze (14 m), 14 m jump gap (needs >= 23 m/s), sand off-road, tumbleweeds |
| 3 | `frostbite-peak` | blossom | blue-hour snow, aurora | 1825 m | 61.7 s | 2 / 0 / 0 | five-hairpin switchback descent, three ice patches, frozen lake, lodge + gondola lift, igloos, falling snow |
| 4 | `harbor-heights` | blossom | golden-hour tropical harbor | 1974 m | 66.6 s | 3 / 1 / 1 | animated sea, lighthouse, boardwalk, boats, cranes/containers, drawbridge jump (14 m gap, >= 23.8 m/s), beach |
| 5 | `neon-nights` | starlight | night city, heavy bloom | 2117 m | 70.4 s | 2 / 1 / 0 | one-draw-call window skyscrapers, flickering neon signs, wet road, lit tunnel, figure-8 viaduct (8.5 m), hover traffic, rain |
| 6 | `magma-mile` | starlight | volcano dusk | 1901 m | 64.8 s | 3 / 0 / 0 | wall-less 10 m bridge over lava (114 m; fall = rescue drone), lava lake + flows, geysers, glowing cracks, canyon descent |
| 7 | `spooky-hollow` | starlight | haunted forest, moon | 2020 m | 67.6 s | 2 / 0 / 0 | fog, twisted trees, graveyard, mansion, covered bridge, ghosts, bats, 14 m wide and tricky |
| 8 | `starlight-spiral` | starlight | space ribbon, nebula | 1907 m | 65.0 s | 3 / 1 / 1 | spiral climb (built with `turtleVertices`), summit gap leap (21 m, >= 26.8 m/s), rainbow edges, ring gates, planets, no walls |

Cups (`CUPS`): **Blossom Cup** = 1-4, **Starlight Cup** = 5-8.  All 25 item boxes (5 rows x 5), 34-44 coins, 3 laps, `difficulty` 1 / 2 / 2 / 2 / 2 / 3 / 3 / 3.
Start gantry banner: the track name, subline `<CUP> CUP · ROUND n` (`recipe.start.sub`).

### Readability rules every look must obey (the road is the most readable thing on screen)
1. The road is the darkest, most contrasty surface in the frame; markings and kerbs are the brightest things *on* it.
2. No pale sheen on the tarmac: `road.specular` (0.2-0.55) caps grazing Fresnel; wet roads (`road.wet`) only mirror neon in puddles / streaks.
3. Kerbs / barriers must separate from the ground colour (red-white kerbs and blue-white walls on snow; glowing kerb stripes keep their own colour: `curb.emissive` uses the kerb map).
4. Fog is a depth cue, not a veil: keep `fog.near` >= ~130 on bright themes; bloom threshold >= 0.8 so only emissives bloom (windows, lava, neon, boost glow).
5. Use `profile` (exposure / contrast / saturation / bloom / vignette / `envIntensity`) per track; it is applied in `attach()` through `renderer.setEnvironmentProfile`.
6. Check with `node scripts/shots.mjs --track=all --at=9,38 --quality=high` (and `medium`).  Note: after a hit the renderer flash only decays with wall-clock time, so a frozen-harness
   frame taken right after an `advance()` that contained a hit shows a flat veil over the whole scene - that is the harness, not the track.

## 3. Add a track in 10 minutes
1. **Def** - copy `src/tracks/sunny-meadows.js` to `src/tracks/<id>.js`, set `id/name/cup/theme/music/difficulty/description/palette` (+ `palette.ui.{primary,secondary}` for the menu card).
2. **Layout** - 8-12 waypoints `{ id, x, z, r, y }`, radius >= 40 for sweepers (>= 27 for hairpins; the validator rejects R < 19 m), lap 1500-2300 m, width 14-20 m.
   `node src/tracks/tools/preview.mjs <id>` prints an analysis and writes a top-down PNG with the racing line.
3. **Zones** - `zones: [{ type: 'boost', at: 'T>', offset: 120, length: 14, lateral: 0, width: 6 }, ...]` (types `boost ramp gap ice mud sand water snow`).  A jump = a `ramp` (12 m, `height` 2-4 m)
   directly followed by a `gap`; the validator prints the entry speed the gap needs (keep <= 27 m/s).  `openEdges: [{ at, offset, length, side }]` removes walls (wall-less bridges).
4. **Coins / items** - `coinLines: [{ at, offset, count, spacing, lateral, lateralTo?, weave? }]`; item rows are auto-placed (5 x 5) or `itemRows: [{ at, offset }]`.
5. **Register** - add the def to `TRACK_DEFS` and the cup in `src/tracks/index.js`.
6. **Recipe** - copy the closest `src/world/recipes/*.js`, call `w.configure({...})`, add scenery, register it in `src/world/recipes/index.js`.
7. **Verify** - `node src/tracks/tools/validate.mjs <id>`, `node scripts/check.mjs --track=<id> --laps=2`, `node scripts/shots.mjs --track=<id> --at=1,9,38`.

## 4. Hand-offs (other agents / lead)
* **Menus (E)**: `def.palette.ui.{primary,secondary}`, `def.description`, `def.difficulty`, `def.cup`, `CUPS[].trackIds`.  `track.minimap = { points: [[x,z]...], bounds, start, width, height, closed, features: [{type, s0, s1, from, to}] }`
  (about 180 points; `features` = boost pads / ramps / gaps / ice as short polylines in the same space).  `def.music` is the key for the audio layer (`meadow desert snow harbor neon volcano haunted starlight`).
* **Renderer (C)**: `track.sky` (Object3D, rotation-only dome, safe to PMREM; the environment is rebuilt after the first update when the sun is positioned); the look is pushed in `attach()` via
  `renderer.setEnvironmentProfile({ exposure, bloomStrength, bloomThreshold, bloomRadius, vignette, saturation, contrast, envIntensity })`.  Emissive vertex colours > 1 are intentional (bloom).
  Custom ShaderMaterials include the fog / tonemapping / colour-space chunks, so they work in the `direct` (low) pipeline too.
* **Engine (A)**: `project().height` = road plane extended sideways + ramp profile; `inBounds` is false inside a `gap` zone and past `shoulder (+2 m without walls)`; leaving bounds for >= 1.1 s = respawn
  at `getRespawn(s)`.  Wall-less roads (Magma bridge, Spiral) use `shoulder 0`.  Jump launch velocity follows the ramp slope (g = 32) => `gap.minSpeed`.
* **Items / AI / audio (D)**: `track.racingLine.{offset,maxSpeed,curv,minSpeed}`, `track.lineOffsetAt(s)`, `maxSpeedAt(s)`, `minSpeedAt(s)` (must be >= this before a ramp), `lineCurvatureAt(s)`,
  `curvatureAt(s)`, `track.itemBoxes` (`{ id, row, s, lateral, position }`), `track.coins` (`{ id, s, lateral, position }`; `lift` / `arch` are baked into `position`), `track.gaps[].minSpeed`, zone types (`track.zones`, `boostPads`, `ramps`, `gaps`).
* **Lead**: registry in `src/tracks/index.js`; `createTrack(id, { mirror: true })` flips x for layout / physics (scenery recipes are not mirrored: partial).

## 5. Physics / AI constants relied on
Gravity 32 m/s^2 (`requiredJumpSpeed(height, rampLen, gapLen)` in `racingLine.js`), road width 14-20 m, kart radius ~1 m, arcade karts corner far tighter than real ones so the AI is mostly speed-capped
(skill x topSpeed ~ 36 m/s), `A_LAT 25` / `A_BRAKE 19` for the line's speed profile, respawn after 1.1 s out of bounds, start grid = 12 slots 4 m apart behind the line on a near-straight.

## 6. Performance (headless Chromium, SwiftShader software GL, 640x360, 1 racer, 12 lap positions; `node .qa/perf.mjs`-style probe of `renderer.info.render`)
Whole frame = world + post chain.  Budget: < ~400 draw calls at high.

| track | high calls max/avg | high tris max/avg | medium calls max/avg | medium tris max/avg |
|-------|-------------------:|------------------:|---------------------:|--------------------:|
| sunny-meadows | 245 / 187 | 421k / 350k | 196 / 158 | 338k / 292k |
| cactus-canyon | 260 / 175 | 333k / 261k | 211 / 154 | 270k / 226k |
| frostbite-peak | 201 / 149 | 282k / 225k | 190 / 142 | 244k / 201k |
| harbor-heights | 290 / 201 | 492k / 381k | 250 / 182 | 408k / 327k |
| neon-nights | 201 / 146 | 221k / 197k | 188 / 138 | 212k / 192k |
| magma-mile | 227 / 164 | 207k / 180k | 202 / 148 | 193k / 171k |
| spooky-hollow | 312 / 226 | 583k / 423k | 271 / 204 | 469k / 355k |
| starlight-spiral | 114 / 101 | 249k / 240k | 110 / 96 | 230k / 223k |

Build time (`world.stats.buildMs`, warm, software-GL box shared with other jobs, so noisy): 85-350 ms for most tracks; Sunny Meadows (~570-900 ms) and Spooky Hollow (~280-820 ms) are the heaviest
(most scattered instances, textures).  `world.stats.phases` breaks it down.  No GPU / geometry / texture leaks across repeated `startRace` (checked with 3 rebuilds per track).

## 7. Tools
* `node src/tracks/tools/validate.mjs [id]` - headless design-rule check (lap length, width, smoothness, overlaps, zones, jump speeds, start grid, coins / items).  Run after every layout edit.
* `node src/tracks/tools/preview.mjs <id>` - layout analysis + top-down PNG with racing line and jump needs.
* `node scripts/check.mjs --track=all --laps=2` - AI race regression (all finish, no stuck / respawn spam).  `node scripts/shots.mjs --track=<id|all> --at=9,38 --quality=high` - integrated race frames.

## 8. Known issues / not done
* Mirror mode flips the layout and physics but not the scenery recipes.
* No shortcut routes (stretch item skipped in favour of readability and polish).
* Spooky Hollow is the heaviest at high (~580k triangles, twisted-tree detail); Harbor Heights ~490k.  Fine on real GPUs, consider fewer tree segments on `medium` if a low-end target needs it.
* Warm build time of Sunny Meadows / Spooky Hollow exceeds the ~400 ms target on the software-GL CI box (terrain tiles + scatter dominate).
* `low` quality: nebula, clouds and aurora are off by design; the direct pipeline has no bloom / grade, so `profile` only affects exposure and tone mapping there.
