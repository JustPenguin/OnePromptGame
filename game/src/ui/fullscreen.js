// Fullscreen, feature-detected: inside the artifact iframe it is usually unavailable (no allow="fullscreen"), so the UI hides
// the button when `canFullscreen()` is false and handles rejected requests with a friendly message.  OWNER: Agent E.
const doc = () => document;

export function canFullscreen() {
  const d = doc();
  const el = d.documentElement;
  return !!((d.fullscreenEnabled || d.webkitFullscreenEnabled) && (el.requestFullscreen || el.webkitRequestFullscreen));
}
export function isFullscreen() { const d = doc(); return !!(d.fullscreenElement || d.webkitFullscreenElement); }

/** @returns {Promise<{ok:boolean, error?:string}>} */
export async function toggleFullscreen() {
  const d = doc();
  try {
    if (isFullscreen()) { await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.()); return { ok: true }; }
    const el = d.documentElement;
    await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message ?? 'Fullscreen was refused by the browser.' };
  }
}

export function onFullscreenChange(fn) {
  const d = doc();
  d.addEventListener('fullscreenchange', fn);
  d.addEventListener('webkitfullscreenchange', fn);
  return () => { d.removeEventListener('fullscreenchange', fn); d.removeEventListener('webkitfullscreenchange', fn); };
}
