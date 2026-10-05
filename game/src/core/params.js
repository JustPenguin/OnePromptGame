// URL parameters (handy for tests / debugging; the published artifact ignores the query string).
//   ?quality=low|medium|high|ultra   force a quality preset
//   ?scale=0.5                       render-resolution scale
//   ?autostart=1&track=<id>&laps=1&racers=6&driver=<id>&kart=<id>&speed=rookie|pro|master
//   ?nomusic=1 ?nosfx=1              silence audio
//   ?fps=1                           show fps overlay
export const PARAMS = (() => {
  try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); }
})();
export const param = (k, fallback = null) => (PARAMS.has(k) ? PARAMS.get(k) : fallback);
export const paramNum = (k, fallback) => { const v = Number(PARAMS.get(k)); return PARAMS.has(k) && isFinite(v) ? v : fallback; };
export const paramFlag = (k) => PARAMS.has(k) && !['0', 'false', 'off', 'no'].includes(PARAMS.get(k));
