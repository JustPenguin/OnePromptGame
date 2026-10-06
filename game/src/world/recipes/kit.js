// Small helpers shared by world recipes.   OWNER: Agent B.
import * as THREE from 'three';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (v) => v - Math.floor(v);

/** Stepped plateaus: quantise v (0..1+) into `steps` terraces with soft risers. */
export function terrace(v, steps, soft = 0.25) {
  const f = v * steps, i = Math.floor(f), r = f - i;
  return (i + smooth(1 - soft, 1, r)) / steps;
}

/** Colour ramp: stops = ['#hex', ...] evenly spaced over t in [0,1]; writes into `out`. */
export function ramp(stops, t, out) {
  const n = stops.length - 1;
  const f = clamp01(t) * n, i = Math.min(n - 1, Math.floor(f));
  return out.copy(stops[i]).lerp(stops[i + 1], f - i);
}
export const colors = (list) => list.map((h) => new THREE.Color(h));

/**
 * Soft mask along the track: 1 inside any of the s ranges [[s0,s1],...], easing to 0 over `fade` metres outside.  Wraps the loop.
 * Returns f(s) -> 0..1 (cheap, allocation free).
 */
export function maskS(track, ranges, fade = 30) {
  const L = track.length;
  return (s) => {
    let best = 0;
    for (let i = 0; i < ranges.length; i++) {
      const [a, b] = ranges[i];
      let d = ((s - a) % L + L) % L;
      const len = b - a;
      let out;
      if (d <= len) out = 0; else out = Math.min(d - len, L - d);
      const w = out >= fade ? 0 : 1 - smooth(0, fade, out);
      if (w > best) best = w;
    }
    return best;
  };
}

/** Point `lat` metres to the right of the road at arc length s (on the road plane). */
export const roadPoint = (track, s, lat = 0, lift = 0) => track.pointAt(s, lat, new THREE.Vector3(), lift);
