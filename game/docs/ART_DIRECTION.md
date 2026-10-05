# Art & Audio Direction — "Kart Rush GP"

One cohesive look across five people's work. When in doubt: **bright, saturated, chunky, bouncy, readable at speed.**

## Pillars
1. **Stylised, not realistic.** Rounded shapes, bevelled edges, big clear silhouettes, slightly exaggerated proportions
   (big heads, big wheels). Soft toon-ish shading achieved with PBR materials + strong hemisphere/sun lighting + gentle rim/fresnel highlights. No harsh black.
2. **Colour is the language.** Saturated albedos, warm sun (`#fff1d6`) against cool sky/shadow fill. Each track has a distinct dominant hue
   so players recognise it at a glance (meadow green/sky blue, canyon orange/teal, snow white/ice blue, harbor turquoise/sand, neon magenta/cyan on navy,
   volcano red/charcoal, haunted purple/sickly green, starlight indigo/rainbow glow).
3. **Readable road.** The racing surface is always the highest-contrast thing on screen: lighter/darker than its surroundings, crisp edge lines, red/white curbs,
   bright boost chevrons. Hazards and item boxes pop with emissive colour.
4. **Juice everywhere.** Everything that happens should be *felt*: squash & stretch, camera kicks, particles, flashes, sounds, UI springs. Never let an event be silent or still.
5. **Performance is part of quality.** Instance, merge, share materials. Fake what you can (blob shadows, baked gradients, billboard props at distance).

## Palette (shared tokens — also in `src/shell/shell.css`)
`--kr-bg #0a0f24` navy · `--kr-bg-2 #141b3d` · `--kr-ink #f4f7ff` · `--kr-ink-dim #9aa6d6` · **accent orange `#ff7a1a`** · **cyan `#22d3ff`** ·
lime `#7be04a` · sunny yellow `#ffd23f` · hot pink-red `#ff3d6a` · violet `#8b4dff`.
Drift spark levels: **blue `#3aa0ff` → orange `#ff9a1f` → pink `#ff3dcb`**. Boost = cyan→white. Hit/danger = pink-red. Gold/first = `#ffd23f`.

## 3D guidance
- Karts ≈ 2.5 m long. Paint = glossy (low roughness, clearcoat on high quality), chrome trim, black rubber tyres with coloured hubs, emissive head/tail lights.
  Each driver has a livery in their colours (`roster.js`); each kart body has a distinct silhouette.
- Tracks: ground detail via procedural canvas textures (noise, speckle, wear). Add **depth cues**: layered hills, fog tuned per theme, distant silhouettes,
  animated things (windmill, flags, water, lava, neon flicker, floating debris). Props are low-poly with flat/soft shading, instanced.
- Lighting: one shadowed directional "sun" + hemisphere fill + per-theme fog/exposure. Night tracks use emissive neon + bloom, not many real lights.
- Post-processing: subtle bloom, gentle vignette, speed-based radial blur/chromatic aberration at high speed & boost, mild colour grade per track. Never wash out the road.

## UI guidance (Agent E leads; others follow when they add on-screen text)
- **Display font** `var(--font-display)` (Lilita One): titles, numbers, buttons — usually italic/skewed (`transform: skewX(-8deg)`) with a thick offset drop-shadow
  (`text-shadow: 0 4px 0 <darker shade>`). **UI font** `var(--font-ui)` (Nunito 700/900): body, labels.
- Chunky rounded panels, glossy gradient buttons with a bottom "lip" shadow, diagonal speed-stripe accents, plenty of contrast on top of busy 3D.
  Every interactive thing has hover/focus/active states and a sound (`app.audio.ui(...)`).
- Motion: spring/overshoot easing (cubic-bezier(.2,1.4,.4,1)), staggered reveals, numbers that tick up. Respect `prefers-reduced-motion` and `settings.reducedMotion`.
- Layout: works from 1920×1080 down to a 390×844 phone (portrait: stack; landscape: compact HUD). Min tap target 44 px. Safe-area aware.
- Copy: short, friendly, active voice. Name things by what players recognise. No lorem ipsum, no placeholder text, no emoji as icons (draw icons with SVG/canvas/CSS).

## Audio guidance (Agent D)
Bouncy, upbeat, arcade-funk. Synth bass + bright lead + rhythmic drums (kick/snare/hat from noise + oscillators), swung 16ths. Each theme has its own key/tempo/instrumentation
(meadow: major pentatonic, 128 bpm, plucky; desert: phrygian, 116 bpm, twangy; snow: bells/arps, 124; harbor: reggae-ish offbeats, 112; neon: synthwave 132;
volcano: heavy minor 140; haunted: spooky minor 100 with theremin-like lead; starlight: shimmering arps 136). SFX are short, punchy, pitch-varied (±5 %) to avoid repetition.
Engine = layered detuned saws + filtered noise, pitch/gain/filter follow speed & throttle. Mix: SFX never masks the engine; music ducks 3–6 dB during boosts/hits; limiter on master.
