// Shared math helpers. CONVENTIONS (see docs/ARCHITECTURE.md):
//   Y up, right-handed, metres/seconds/radians.
//   A kart/object with yaw=0 faces +Z.  forward(yaw) = (sin yaw, 0, cos yaw).  object.rotation.y = yaw.
//   yaw increases toward +X, which is the LEFT of a +Z-facing kart.  So turning LEFT = yaw increases,
//   turning RIGHT = yaw decreases.  right(yaw) = (-cos yaw, 0, sin yaw).
//   Steering input: -1 = full left, +1 = full right (hence yawRate = -steer * rate).
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (a, b, v) => { const t = clamp01(invLerp(a, b, v)); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential smoothing: move `a` toward `b` with rate `lambda` (1/s). */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
/** Shortest signed angle from `current` to `target`. */
export const angleDiff = (target, current) => wrapAngle(target - current);
export const dampAngle = (current, target, lambda, dt) => current + angleDiff(target, current) * (1 - Math.exp(-lambda * dt));

export function forwardFromYaw(yaw, out) { return out.set(Math.sin(yaw), 0, Math.cos(yaw)); }
export function rightFromYaw(yaw, out) { return out.set(-Math.cos(yaw), 0, Math.sin(yaw)); }
export const yawFromDir = (x, z) => Math.atan2(x, z);

/** Wrap an arc-length position into [0, L). */
export function wrapS(s, L) { s %= L; return s < 0 ? s + L : s; }
/** Signed shortest distance from arc-length a to b on a loop of length L (positive = b is ahead of a). */
export function deltaS(a, b, L) {
  let d = (b - a) % L;
  if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
  return d;
}

/** Deterministic PRNG (mulberry32). Gameplay randomness must use session.random(), not Math.random(). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const formatTime = (sec) => {
  if (!isFinite(sec) || sec < 0) return '--:--.---';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};
export const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
