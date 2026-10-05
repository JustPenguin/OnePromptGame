// AI drivers. OWNER: Agent D (gameplay).
// Contract (keep stable): new AIManager(session); .update(dt) writes kart.input for every kart where
// kart.isAI || kart.autopilot || kart.rocket > 0.  (kart.autopilot is set for finished karts, incl. the player.)
// Uses ONLY the Track API (project/pointAt/lineOffsetAt/maxSpeedAt/curvatureAt) + kart state, so it works on every track.
// Baseline: racing-line follower with corner braking and simple drifting. Agent D builds the real thing
// (overtaking, hazard dodging, item use, rubber-banding, personalities, difficulty, stuck recovery).
import * as THREE from 'three';
import { SPEED_CLASSES, DEFAULT_SPEED_CLASS } from '../data/roster.js';
import { angleDiff, clamp, lerp } from '../core/math.js';

export class AIManager {
  constructor(session) {
    this.session = session;
    this.track = session.track;
    this._p = new THREE.Vector3();
    const cls = SPEED_CLASSES[session.config.speedClass] ?? SPEED_CLASSES[DEFAULT_SPEED_CLASS];
    this.skillRange = cls.aiSkill;
  }

  update(dt) {
    for (const k of this.session.karts) {
      if (k.isAI || k.autopilot || k.rocket > 0) this.drive(k, dt);
    }
  }

  drive(k, dt) {
    const ai = (k.ext.ai ??= { skill: lerp(this.skillRange[0], this.skillRange[1], this.session.random()), lane: (this.session.random() - 0.5) * 0.7 });
    const track = this.track, q = k.query, inp = k.input, st = k.stats;
    const speed = Math.max(0, k.speed);
    const look = clamp(9 + speed * 0.55, 11, 36);
    const sT = q.s + look;
    const off = track.lineOffsetAt(sT) + ai.lane * q.halfWidth * 0.45;
    const target = track.pointAt(sT, clamp(off, -q.halfWidth * 0.8, q.halfWidth * 0.8), this._p);
    const desired = Math.atan2(target.x - k.position.x, target.z - k.position.z);
    const err = angleDiff(desired, k.heading);
    let steer = clamp(-err * 2.6, -1, 1);
    const cruise = k.race.finished ? 0.7 : 1;
    const corner = track.maxSpeedAt(q.s + 10 + speed * 0.9);
    const vMax = Math.min(st.topSpeed * ai.skill * cruise * (k.rocket > 0 ? 1.5 : 1), corner);
    inp.steer = steer;
    inp.throttle = speed < vMax ? 1 : 0.0;
    inp.brake = speed > vMax * 1.15 ? 0.7 : 0;
    inp.item = false;
    inp.lookBack = false;
    // drift through long corners
    const curv = track.curvatureAt(q.s + 16);
    const wantDrift = !k.race.finished && Math.abs(curv) > 0.011 && speed > st.topSpeed * 0.6 && Math.abs(steer) > 0.35;
    inp.drift = wantDrift;
    inp.locked = false;
  }
}
