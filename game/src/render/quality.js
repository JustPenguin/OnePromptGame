// Quality presets. OWNER: Agent C (render).  `session.quality` is one of these objects (live: auto-quality may
// mutate resolutionScale).  Everyone who spends GPU/CPU budget MUST read it:
//   B (world):  shadows, shadowMapSize, sceneryDensity, drawDistance
//   C (vfx/render): pixelRatioMax, bloom, postfx, particles, antialias, msaa (samples), bloomLevels, fxLevel (speed FX strength 0..1)
export const QUALITY_PRESETS = {
  low:    { id: 'low',    pixelRatioMax: 1,    resolutionScale: 1, shadows: false, shadowMapSize: 1024, bloom: false, postfx: false, particles: 0.35, sceneryDensity: 0.4, antialias: false, drawDistance: 450, msaa: 0, bloomLevels: 0, fxLevel: 0 },
  medium: { id: 'medium', pixelRatioMax: 1.25, resolutionScale: 1, shadows: true,  shadowMapSize: 2048, bloom: true,  postfx: true,  particles: 0.7,  sceneryDensity: 0.7, antialias: true,  drawDistance: 700, msaa: 2, bloomLevels: 4, fxLevel: 0.7 },
  high:   { id: 'high',   pixelRatioMax: 1.75, resolutionScale: 1, shadows: true,  shadowMapSize: 2048, bloom: true,  postfx: true,  particles: 1.0,  sceneryDensity: 1.0, antialias: true,  drawDistance: 1000, msaa: 4, bloomLevels: 5, fxLevel: 1 },
  ultra:  { id: 'ultra',  pixelRatioMax: 2,    resolutionScale: 1, shadows: true,  shadowMapSize: 4096, bloom: true,  postfx: true,  particles: 1.4,  sceneryDensity: 1.25, antialias: true, drawDistance: 1400, msaa: 4, bloomLevels: 6, fxLevel: 1 },
};

/** Settings value 'auto' picks 'high' on desktop-class devices and 'medium' on touch/small screens. */
export function resolveQualityId(settingsQuality, override) {
  const q = override ?? settingsQuality ?? 'auto';
  if (QUALITY_PRESETS[q]) return q;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return touch ? 'medium' : 'high';
}
export function makeQuality(id, scaleOverride) {
  const q = { ...QUALITY_PRESETS[id] };
  if (scaleOverride) q.resolutionScale = scaleOverride;
  return q;
}
