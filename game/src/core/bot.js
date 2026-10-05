// A lookahead "good player" bot for tests and demos (window.__kart.bot).  OWNER: Agent A (engine).
// It steers by yaw rate through physics.steerForYawRate() so it works the same on plain steering and inside a drift, commits
// to a drift when a sustained corner is coming, holds it through the corner and releases at the exit (optionally chaining
// mini-turbos: let go at orange, hop again).  Not the race AI (that is Agent D's) - it exists so physics and camera can be
// exercised and compared (scripts/handling.mjs has the same logic for the Node-side lap-time comparisons).
import * as THREE from 'three';
import { clamp, angleDiff } from './math.js';

/** @returns {(out: import('../physics/Kart.js').KartInput, dt: number) => void} a controller that fills `out` */
export function makeBotController(session, kart, { drift = true, chain = 0, yawGain = 3.2, lookMin = 11, lookGain = 0.55, startCurv = 0.0075, holdCurv = 0.0035, cornerSpeedMul = 1 } = {}) {
  const track = session.track;
  const p = new THREE.Vector3();
  let drifting = false, regap = 0, held = 0;
  return (out) => {
    const race = session.race;
    if (race.phase === 'countdown') { out.throttle = race.rocketWindowOpen ? 1 : 0; return; }   // a perfect rocket start, never a burnout
    if (race.phase !== 'racing' && race.phase !== 'finishing') return;
    const q = kart.query, st = kart.stats;
    const speed = Math.max(0, kart.speed);
    const look = clamp(9 + speed * lookGain, lookMin, 36);
    const sT = q.s + look;
    track.pointAt(sT, clamp(track.lineOffsetAt(sT), -q.halfWidth * 0.8, q.halfWidth * 0.8), p);
    const err = angleDiff(Math.atan2(p.x - kart.position.x, p.z - kart.position.z), kart.heading);
    out.steer = session.physics.steerForYawRate(kart, clamp(err * yawGain, -2.5, 2.5));
    const corner = track.maxSpeedAt(q.s + 10 + speed * 0.9) * cornerSpeedMul;
    const vMax = Math.min(st.topSpeed * 1.2, corner);
    out.throttle = speed < vMax ? 1 : 0;
    out.brake = speed > vMax * 1.15 ? 0.7 : 0;
    const c = (d) => Math.abs(track.curvatureAt(q.s + d));
    if (drift && session.race.phase === 'racing') {
      if (!drifting) {
        drifting = speed > st.topSpeed * 0.65 && c(14) > startCurv && c(40) > startCurv;
        if (drifting && kart.drift.dir === 0 && Math.abs(out.steer) < 0.5) out.steer = Math.sign(-err || 1) * 0.5;   // stick into the corner while committing
      } else if ((held > 30 && Math.max(c(6), c(22)) < holdCurv) || speed < st.topSpeed * 0.35) drifting = false;
      if (chain && drifting && kart.drift.dir !== 0 && kart.drift.level >= chain && c(30) > startCurv) { drifting = false; regap = 3; }
    } else drifting = false;
    if (regap > 0) { regap--; out.drift = false; return; }
    held = drifting ? held + 1 : 0;
    out.drift = drifting;
  };
}
