// Applies settings to the live game, immediately. OWNER: Agent E.
// Other modules READ settings (app.settings is a live object that is never replaced); this is the only place that pushes
// changes OUT to them: renderer quality, audio volumes, key bindings, camera mode, UI preferences.
import { makeQuality, resolveQualityId } from '../render/quality.js';
import { param, paramNum } from '../core/params.js';

const QUALITY_KEYS = new Set(['quality', 'resolutionScale', 'postfx']);
const AUDIO_KEYS = new Set(['masterVolume', 'musicVolume', 'sfxVolume']);
const UI_KEYS = new Set(['hudScale', 'reducedMotion', 'reduceFlashes', 'largeText', 'highContrastHud']);

/** The preset a settings value resolves to (URL ?quality= wins so tests can force one). */
export function resolvedQualityId(app) { return resolveQualityId(app.settings.quality, param('quality')); }

export function applyQuality(app) {
  const s = app.settings;
  const forcedScale = paramNum('scale', 0) || undefined;
  const preset = makeQuality(resolvedQualityId(app), forcedScale);
  // Mutate in place: session.quality IS app.quality (same object), so a running race follows the change.
  Object.assign(app.quality, preset);
  if (!forcedScale) app.quality.resolutionScale = s.resolutionScale ?? 1;
  app.quality.postfx = !!preset.postfx && s.postfx !== false;
  app.quality.bloom = !!preset.bloom && s.postfx !== false;
  app.renderer.setQuality(app.quality);
  app.session?.track?.applyQuality?.(app.quality);
}

/** Apply one setting (or everything when `key` is omitted). */
export function applySetting(app, key) {
  const all = key === undefined;
  if (all || QUALITY_KEYS.has(key)) applyQuality(app);
  if (all || AUDIO_KEYS.has(key)) app.audio?.applySettings?.();
  if (all || key === 'bindings') app.input.setBindings(app.settings.bindings);
  if (all || key === 'cameraMode') { const rig = app.session?.cameraRig; if (rig && app.settings.cameraMode) rig.mode = app.settings.cameraMode; }
  if (all || UI_KEYS.has(key)) app.ui?.applyPrefs?.();
  if (all || key === 'showFps' || key === 'showMinimap' || key === 'showLeaderboard' || key === 'speedUnit' || key === 'touchControls' || key === 'touchScale') app.ui?.hud?.applySettings?.();
  if (key !== undefined) app.save.commit();
}
