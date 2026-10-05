// Drivers, kart bodies and speed classes: the single source of truth for names, colours and stats.
// Physics reads resolveStats(); UI reads stats (1-5) for the select-screen bars; vehicles/ reads colours.
// All characters are ORIGINAL (no third-party IP). Stats: 1 (low) .. 5 (high).
import { clamp, lerp } from '../core/math.js';

export const DRIVERS = [
  { id: 'pip',    name: 'Pip',    species: 'Penguin', tagline: 'Slides into first on pure style.',
    colors: { primary: '#2b5cff', secondary: '#f2f6ff', accent: '#ff9a1f' }, stats: { speed: 3, accel: 3, handling: 4, weight: 2, drift: 3 }, personality: { aggression: 0.5, boldness: 0.5 } },
  { id: 'rusty',  name: 'Rusty',  species: 'Fox',     tagline: 'Quick off the line, quicker with a plan.',
    colors: { primary: '#ff7a1a', secondary: '#fff1dc', accent: '#2a2018' }, stats: { speed: 3, accel: 4, handling: 3, weight: 2, drift: 4 }, personality: { aggression: 0.7, boldness: 0.7 } },
  { id: 'bruno',  name: 'Bruno',  species: 'Bear',    tagline: 'Unstoppable once he gets rolling.',
    colors: { primary: '#8a4b24', secondary: '#e8c9a0', accent: '#ffd23f' }, stats: { speed: 5, accel: 1, handling: 2, weight: 5, drift: 2 }, personality: { aggression: 0.8, boldness: 0.4 } },
  { id: 'hopper', name: 'Hopper', species: 'Frog',    tagline: 'Drifts like the road owes him money.',
    colors: { primary: '#35c759', secondary: '#d8ff9a', accent: '#ff3d6a' }, stats: { speed: 2, accel: 4, handling: 5, weight: 1, drift: 5 }, personality: { aggression: 0.4, boldness: 0.9 } },
  { id: 'luna',   name: 'Luna',   species: 'Cat',     tagline: 'Silent, sleek, always on the racing line.',
    colors: { primary: '#8b4dff', secondary: '#2b2146', accent: '#22d3ff' }, stats: { speed: 3, accel: 3, handling: 5, weight: 1, drift: 4 }, personality: { aggression: 0.3, boldness: 0.6 } },
  { id: 'gizmo',  name: 'Gizmo',  species: 'Robot',   tagline: 'Calculates the perfect lap. Mostly.',
    colors: { primary: '#22d3c5', secondary: '#c9d4e6', accent: '#ffd23f' }, stats: { speed: 4, accel: 3, handling: 3, weight: 3, drift: 3 }, personality: { aggression: 0.5, boldness: 0.3 } },
  { id: 'rocco',  name: 'Rocco',  species: 'Rhino',   tagline: 'Treats corners as suggestions.',
    colors: { primary: '#7d8aa6', secondary: '#e6ebf5', accent: '#ff3d6a' }, stats: { speed: 4, accel: 2, handling: 2, weight: 5, drift: 2 }, personality: { aggression: 0.9, boldness: 0.5 } },
  { id: 'quill',  name: 'Quill',  species: 'Duck',    tagline: 'Small, loud, and gone before you blink.',
    colors: { primary: '#ffd23f', secondary: '#fff7cf', accent: '#ff7a1a' }, stats: { speed: 2, accel: 5, handling: 4, weight: 1, drift: 3 }, personality: { aggression: 0.6, boldness: 0.8 } },
];

export const KART_BODIES = [
  { id: 'classic',  name: 'Classic Racer', tagline: 'Balanced, honest, reliable.',     stats: { speed: 3, accel: 3, handling: 3, weight: 3, drift: 3 } },
  { id: 'streak',   name: 'Streak GT',     tagline: 'Long, low and fast in a straight line.', stats: { speed: 4, accel: 2, handling: 3, weight: 2, drift: 3 } },
  { id: 'hopper',   name: 'Dune Hopper',   tagline: 'Big tyres, big grin, big drifts.', stats: { speed: 2, accel: 4, handling: 4, weight: 3, drift: 4 } },
  { id: 'crusher',  name: 'Crusher XL',    tagline: 'Heavy metal. Everything gets out of the way.', stats: { speed: 4, accel: 1, handling: 2, weight: 5, drift: 2 } },
];

/** Speed classes. speedMul scales every kart's top speed; AI/rubber-band tuning lives in src/ai. */
export const SPEED_CLASSES = {
  rookie: { id: 'rookie', name: 'Rookie', speedMul: 0.84, aiSkill: [0.72, 0.9], rubber: 0.5 },
  pro:    { id: 'pro',    name: 'Pro',    speedMul: 0.92, aiSkill: [0.82, 0.97], rubber: 0.8 },
  master: { id: 'master', name: 'Master', speedMul: 1.0,  aiSkill: [0.92, 1.03], rubber: 1.0 },
};
export const DEFAULT_SPEED_CLASS = 'pro';

export const getDriver = (id) => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
export const getBody = (id) => KART_BODIES.find((b) => b.id === id) ?? KART_BODIES[0];

/** Combined 1-5 display stats for a driver+kart pairing. */
export function combinedStats(driverId, bodyId) {
  const d = getDriver(driverId).stats;
  const b = getBody(bodyId).stats;
  const out = {};
  for (const k of ['speed', 'accel', 'handling', 'weight', 'drift']) out[k] = clamp((d[k] + b[k]) / 2, 1, 5);
  return out;
}

/** Physical parameters used by KartPhysics (metres, seconds). */
export function resolveStats(driverId, bodyId, speedClass = DEFAULT_SPEED_CLASS) {
  const cls = SPEED_CLASSES[speedClass] ?? SPEED_CLASSES[DEFAULT_SPEED_CLASS];
  const c = combinedStats(driverId, bodyId);
  const u = (k) => (c[k] - 1) / 4; // 0..1
  return {
    display: c,
    topSpeed: lerp(33, 40, u('speed')) * cls.speedMul,   // m/s  (x3.6 = km/h)
    accel: lerp(13, 22, u('accel')),                      // m/s^2 at low speed
    brake: 42,                                            // m/s^2
    steerRate: lerp(1.55, 2.3, u('handling')),            // rad/s peak yaw rate
    grip: lerp(11, 15, u('handling')),                    // 1/s: how fast velocity re-aligns with heading
    mass: lerp(0.8, 1.4, u('weight')),
    driftTurn: lerp(0.9, 1.15, u('handling')),            // multiplier on yaw rate while drifting
    miniTurbo: lerp(0.85, 1.3, u('drift')),               // charge-rate multiplier
    offroadResist: lerp(0, 0.3, u('weight')),             // fraction of the off-road slowdown ignored
  };
}
