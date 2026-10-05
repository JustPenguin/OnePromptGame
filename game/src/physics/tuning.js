// Every number that shapes how the karts FEEL, in one place.  OWNER: Agent A (engine).
// KartPhysics reads `T` (global feel) and `kart.phys` (per-kart values derived from the roster stats by derivePhys()).
// Units: metres, seconds, radians.  See docs/engine.md for what each knob does and how it was chosen.
import { lerp, smoothstep } from '../core/math.js';

/** Seconds of drift charge needed to reach mini-turbo level 1 / 2 / 3 (blue / orange / pink). */
export const DRIFT_LEVEL_TIME = [0.85, 1.7, 2.7];
/** Boost fired when a drift is released at level 1 / 2 / 3. strength = extra top-speed fraction. */
export const DRIFT_BOOST = [null, { strength: 0.25, duration: 0.85 }, { strength: 0.33, duration: 1.25 }, { strength: 0.42, duration: 1.75 }];

export const T = {
  substepHz: 120,            // physics sub-step: dt is cut into pieces of at most 1/substepHz s (frame-rate independence)
  gravity: 32,               // m/s^2 (arcade: heavier than 9.8 so jumps are short and punchy)

  // ---- longitudinal
  accelScale: 1.14,          // roster accel -> launch acceleration at standstill (a = launch * (1 - v/cap))
  boostTau: 0.36,            // while boosting the kart surges toward the boosted cap with this time constant ...
  boostAccelMax: 30,         // ... but never harder than this (m/s^2): a start boost from a standstill must not teleport the kart
  boostFade: 0.35,           // the last seconds of a boost taper the extra speed out (no cliff when it ends)
  brake: 34,                 // m/s^2 at full brake
  reverseCap: 0.3,           // reverse top speed as a fraction of top speed
  coastBase: 3.0, coastPerMs: 0.06,   // engine-braking decel: base + per m/s
  overcapRate: 1.7, overcapConst: 4, // how fast speed above the cap is shed (1/s, m/s^2)
  startBoost: { strength: 0.3, duration: 0.7 }, aiStartBoost: { strength: 0.24, duration: 0.55 },   // rocket start (player) / lucky starts (AI)
  burnoutTraction: 0.3, burnoutTime: 1.2,   // too-early start: wheelspin cuts launch acceleration to this fraction for this long
  coinSpeed: 0.012,          // +1.2 % top speed per coin

  // ---- steering
  turnReference: 0.6,        // `phys.turn` is the yaw rate (rad/s) at 60 % of top speed
  turnTaper: 0.3,            // yaw rate lost at top speed (stability)
  turnLowSpeed: 6.5,         // m/s below which the kart cannot pivot on the spot
  turnScale: 0.76,           // roster steerRate -> yaw rate at the reference speed
  gripSpeedLoss: 0.18,       // tyre grip softens a little at high speed (more visible slip)
  surfaceSteer: 0.7,         // low-grip surfaces also cut steering authority: yaw rate *= 1 - surfaceSteer * (1 - surface grip)
  scrubSteer: 0.13,          // speed lost per second at full lock, top speed
  scrubSlip: 0.25,           // speed lost per second per unit sin(slip angle)
  scrubDriftSteer: 0.045,    // ... while drifting (drifting is the efficient way through a corner)

  // ---- drift
  driftGrip: 0.5,            // tyre grip multiplier while drifting (the kart really slides)
  driftTurnMin: 0.14, driftTurnMid: 0.5, driftTurnMax: 1.3,  // yaw-rate multiplier: steering against / neutral / into the drift (wide corners need a gentle drift too)
  driftAngleMin: 0.2, driftAngleMax: 0.46, // chassis angle (rad) shown relative to the heading
  driftAngleRate: 9,
  driftBlendIn: 0.16, driftBlendOut: 0.22,   // the yaw-rate mapping eases between plain steering and drift steering over this long (no snap at entry / release)
  releaseLead: 0.5,          // on release the heading keeps this fraction of its lead over the travel direction (= driftGrip: the turn rate stays continuous)
  driftEnterSpeed: 0.3,      // fraction of top speed needed to hop / drift
  driftCancelSpeed: 0.2,
  hopVy: 5, hopTime: 0.33,   // hopTime covers the whole flight (2 * hopVy / gravity = 0.31 s): the hop keeps its steering until the wheels touch down
  driftChargeMin: 0.3,       // charge rate = miniTurbo * lerp(driftChargeMin, 1, stick-into-drift 0..1): no free boosts from straight-line snaking
  hopAirControl: 0.9,

  // ---- air
  airControl: 0.35,
  airTraction: 0.2,          // throttle / brake strength with the wheels off the ground (a slow kart cannot throttle its way over a gap)
  landMinImpact: 5, landMinAir: 0.15,
  trickMinAir: 0.45, trickBoost: { strength: 0.28, duration: 0.85 },

  // ---- walls
  wallBounce: 0.18,          // restitution of the normal velocity component
  wallScrape: 0.025,         // tangential speed lost per impact even when scraping flat
  wallAngleLoss: 0.45,       // extra tangential loss ~ sin^2(impact angle)
  wallDrag: 0.16,            // continuous speed loss rate (1/s) while sliding along a wall
  wallAlign: 16,             // 1/s: how fast the nose swings parallel to the wall on a shallow hit
  wallAlignSliding: 22,      // ... while already sliding along it
  wallHitMin: 3.5,           // m/s into the wall that fires EV.WALL_HIT
  wallHitCooldown: 0.18,

  // ---- kart vs kart
  bumpRestitution: 0.4,
  bumpMinImpact: 3,
  bumpCooldown: 0.25,
  ramMass: 12,               // effective mass multiplier of invincible / rocket karts
  massPower: 1.7,            // heavier karts win shoving matches by mass^massPower

  // ---- spin / launch
  spinTurns: 2,              // full rotations in a spin-out
  spinSpeedDecay: 1.7,
  recoverTime: 0.45, recoverSteer: 0.35, recoverAccel: 0.5,   // control returns smoothly after a spin-out: steering / throttle start at these fractions
  hitGraceExtra: 0.9,        // seconds after a spin-out during which further spins/launches are ignored

  // ---- respawn
  respawnTime: 1.7, respawnBack: 6, respawnSpeed: 0.28, respawnGrace: 2.2, fallTime: 1.1, chasmDepth: 2.5,   // chasmDepth: airborne this far below the ground = fell into a gap, no landing
  stuckTime: 4,

  // ---- slipstream
  draftRange: 14, draftMinRange: 2.2, draftHalfWidth: 2.0, draftBuild: 1.0, draftDecay: 0.45,
  draftBonus: 0.06, draftAccel: 4.0, draftMinSpeed: 0.55,
};

/** Per-kart physical values derived from the roster stats (kart.stats).  Cheap; computed once per kart. */
export function derivePhys(stats) {
  const top = stats.topSpeed;
  const ref = T.turnReference * top;
  const g = (v) => smoothstep(0.4, T.turnLowSpeed, v) * (1 - T.turnTaper * smoothstep(0.35 * top, 1.1 * top, v));
  const d = stats.display ?? { drift: 3, handling: 3, weight: 3 };
  const uDrift = (d.drift - 1) / 4;
  return {
    launch: stats.accel * T.accelScale,
    turn: stats.steerRate * T.turnScale,
    turnNorm: 1 / Math.max(0.2, g(ref)),   // normalises the speed curve so `turn` is the yaw rate at the reference speed
    driftAngle: lerp(0.9, 1.15, uDrift),   // high drift stat = more dramatic slide angle
  };
}

/** Speed-dependent yaw-rate multiplier (relative to phys.turn at the reference speed). */
export function steerAuthority(speedAbs, top, phys) {
  return smoothstep(0.4, T.turnLowSpeed, speedAbs) * (1 - T.turnTaper * smoothstep(0.35 * top, 1.1 * top, speedAbs)) * phys.turnNorm;
}

/** Drift yaw-rate multiplier for `along` in [-1, 1] (+1 = stick fully into the drift, -1 = fully against it). Piecewise linear. */
export function driftMul(along) {
  return along >= 0 ? lerp(T.driftTurnMid, T.driftTurnMax, along) : lerp(T.driftTurnMid, T.driftTurnMin, -along);
}
/** Inverse of driftMul: which `along` produces yaw-rate multiplier `mul` (clamped to the reachable range). */
export function driftAlongFor(mul) {
  if (mul >= T.driftTurnMid) return Math.min(1, (mul - T.driftTurnMid) / (T.driftTurnMax - T.driftTurnMid));
  return -Math.min(1, (T.driftTurnMid - mul) / (T.driftTurnMid - T.driftTurnMin));
}
