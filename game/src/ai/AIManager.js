// AI drivers. OWNER: Agent D (gameplay).
// Contract (stable): new AIManager(session); .update(dt) writes kart.input for every kart where
// kart.isAI || kart.autopilot || kart.rocket > 0.  (kart.autopilot is set for finished karts, incl. the player.)
// Uses ONLY the Track API (project/pointAt/sampleAt/lineOffsetAt/maxSpeedAt/curvatureAt/boostPads) + kart state and the
// item system's public lists, so it works on every track.  The real work is in AIDriver.js (one per kart, kart.ext.ai),
// AIItems.js (when to use items) and tuning.js (class/difficulty knobs).
import { SPEED_CLASSES, DEFAULT_SPEED_CLASS } from '../data/roster.js';
import { clamp } from '../core/math.js';
import { CLASS_TUNING, DEFAULT_TUNING, RUBBER } from './tuning.js';
import { AIDriver } from './AIDriver.js';

export class AIManager {
  constructor(session) {
    this.session = session;
    this.track = session.track;
    const id = SPEED_CLASSES[session.config.speedClass] ? session.config.speedClass : DEFAULT_SPEED_CLASS;
    this.classId = id;
    this.classInfo = SPEED_CLASSES[id];
    this.skillRange = this.classInfo.aiSkill;           // kept for API compatibility with the baseline
    this.tuning = CLASS_TUNING[id] ?? CLASS_TUNING[DEFAULT_TUNING];
    this.rubber = this.classInfo.rubber ?? 0.8;
    this.lineGain = 1;                                  // test knob: scales how hard the racing line is followed
    this.rubberOn = true;                               // test knob: disable catch-up
  }

  update(dt) {
    if (!(dt > 0)) return;
    const karts = this.session.karts;
    const ref = this.session.player;
    for (let i = 0; i < karts.length; i++) {
      const k = karts[i];
      if (!(k.isAI || k.autopilot || k.rocket > 0)) continue;
      const drv = k.ext.ai instanceof AIDriver ? k.ext.ai : (k.ext.ai = new AIDriver(this, k));
      drv.setPacing(this.pacingFor(drv, k, ref));
      drv.update(dt);
    }
  }

  /** Cruise fraction of top speed for this kart: its own pace plus gentle, invisible catch-up relative to the human. */
  pacingFor(drv, k, ref) {
    let p = drv.pace;
    if (!this.rubberOn || !ref || k === ref || ref.race.finished || k.race.finished) return p;
    const gap = k.race.distance - ref.race.distance;           // > 0: this AI is ahead of the human
    if (gap > RUBBER.leadStart) p *= 1 - RUBBER.leadEase * this.rubber * clamp((gap - RUBBER.leadStart) / (RUBBER.leadFull - RUBBER.leadStart), 0, 1);
    else if (gap < -RUBBER.trailStart) p *= 1 + RUBBER.trailBoost * this.rubber * clamp((-gap - RUBBER.trailStart) / (RUBBER.trailFull - RUBBER.trailStart), 0, 1);
    return p;
  }

  /** Per-kart AI counters (drifts, mistakes, dodges...) for tests / the docs. */
  stats() {
    return this.session.karts.filter((k) => k.ext.ai).map((k) => ({ id: k.id, name: k.name, pace: +k.ext.ai.pace.toFixed(3), skill: +k.ext.ai.skill.toFixed(2), ...k.ext.ai.stats, itemsUsed: k.ext.ai.items.used }));
  }
}
