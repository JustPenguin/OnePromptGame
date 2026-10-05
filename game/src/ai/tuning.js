// AI tuning knobs per speed class.  Everything that makes Rookie / Pro / Master feel different lives in this table
// (plus the per-driver personality from data/roster.js).  docs/gameplay.md explains each knob.
//
//  pace          cruise speed as a fraction of the kart's top speed; the spread inside the range is compressed by `paceSpread`
//                so lap times of one class stay within about +-5 %.
//  skill         base 0..1 skill (drives the qualitative behaviours below); +-0.12 random and a driver-stat tilt are added.
//  cornerScale   multiplies the safe cornering speed (<1 = brakes early, >1 = brave); applied to the track's maxSpeedAt hint (and, on the
//                baseline engine, to our own yaw-rate model)
//  limit         share of the engine's own full-lock corner speed (physics.maxCornerSpeed) the driver dares to use
//  lineWeight    how faithfully the racing line is followed (1 = perfect apex hugging, 0 = drives down the middle)
//  driftProb     chance to drift a drift-worthy corner;  driftHold = seconds a sloppy driver holds a drift (null = until corner exit)
//  mistakeRate   random driving errors per second (x4 inside corners)
//  perceive      chance to notice a trap on the road ahead (otherwise it is driven over)
//  boxSkill / padSkill / coinSkill   how hard they go for item boxes / boost pads / coins
//  itemDelay     [min,max] seconds an AI sits on a fresh item before it thinks about using it
//  rubber        gentle catch-up strength (also read from SPEED_CLASSES[].rubber)
//  aggression    multiplies the driver's personality aggression (bumping, blocking, shoving)
//  steerLag      first-order lag on the steering command (higher = snappier hands)
export const CLASS_TUNING = {
  rookie: { pace: [0.74, 0.83], paceSpread: 0.55, skill: 0.28, cornerScale: 0.88, limit: 0.80, lineWeight: 0.55, driftProb: 0.3,  driftHold: [0.45, 1.2], mistakeRate: 0.040, perceive: 0.55, boxSkill: 0.45, padSkill: 0.45, coinSkill: 0.3,  itemDelay: [1.2, 4.5], aggression: 0.55, steerLag: 6.5, brakeDecel: 22 },
  pro:    { pace: [0.818, 0.882], paceSpread: 0.5,  skill: 0.62, cornerScale: 1.0,  limit: 0.90, lineWeight: 0.88, driftProb: 0.82, driftHold: null,         mistakeRate: 0.010, perceive: 0.86, boxSkill: 0.8,  padSkill: 0.85, coinSkill: 0.55, itemDelay: [0.6, 2.6], aggression: 1.0,  steerLag: 9,   brakeDecel: 27 },
  master: { pace: [0.887, 0.936], paceSpread: 0.45, skill: 0.92, cornerScale: 1.12, limit: 0.96, lineWeight: 1.0,  driftProb: 1.0,  driftHold: null,         mistakeRate: 0.002, perceive: 0.97, boxSkill: 1.0,  padSkill: 1.0,  coinSkill: 0.8,  itemDelay: [0.25, 1.4], aggression: 1.3, steerLag: 12,  brakeDecel: 31 },
};
export const DEFAULT_TUNING = 'pro';

/** Catch-up: gentle and invisible.  `behind` > 0 = this AI trails the human by that many metres. */
export const RUBBER = {
  trailStart: 30,      // metres behind the player before the boost starts
  trailFull: 330,      // ... and where it is at full strength
  trailBoost: 0.055,   // +5.5 % cruise pace at full strength (x class rubber)
  leadStart: 70,       // metres ahead of the player before easing off
  leadFull: 380,
  leadEase: 0.05,      // -5 % cruise pace at full strength (x class rubber)
};
