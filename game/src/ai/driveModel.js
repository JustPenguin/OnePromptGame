// What the AI knows about how a kart steers.  Everything here is a thin, defensive layer over the physics engine:
//   * with the engine's yaw-rate API (physics.steerForYawRate / maxYawRate / maxCornerSpeed / driftYawRange) the AI asks the engine
//     for the exact stick that yields a wanted turn rate, for the real limits and for the range a drift can hold;
//   * without it (the baseline engine) the same questions are answered from the baseline formulas, so the AI runs on both.
// Convention: yaw rates are rad/s, + = turning left (heading increases); stick -1 = left, +1 = right.
import { clamp, smoothstep } from '../core/math.js';

// Baseline drift: heading turns at steerRate * driftTurn * 0.95 * mul, mul = lerp(0.45, 1.3, (along + 1) / 2), along = stick * dir.
const BASE_MUL_MIN = 0.45, BASE_MUL_MAX = 1.3, BASE_DRIFT_K = 0.95;
// Engine drift multipliers (against / neutral / into) used only when an engine offers maxYawRate() but not driftYawRange().
const ENG_MUL = [0.14, 0.5, 1.3];

export class DriveModel {
  constructor(session) {
    this.session = session;
    this.api = null;
  }

  /** Detect the engine's optional API once (physics may be created after us). */
  get caps() {
    if (this.api) return this.api;
    const p = this.session.physics;
    if (!p) return { stick: false, limit: false, corner: false, range: false };
    return (this.api = {
      stick: typeof p.steerForYawRate === 'function',
      limit: typeof p.maxYawRate === 'function',
      corner: typeof p.maxCornerSpeed === 'function',
      range: typeof p.driftYawRange === 'function',
    });
  }

  /** True when the engine can convert a wanted yaw rate into a stick itself (drift aware). */
  get native() { return this.caps.stick; }

  /** Largest plain-steering yaw rate at `v` (drift: the largest a drift can hold). */
  maxYaw(k, v, drift = false) {
    const c = this.caps;
    if (c.limit) return this.session.physics.maxYawRate(k, v, drift);
    const st = k.stats, top = st.topSpeed, sAbs = Math.abs(v);
    const auth = clamp(sAbs / 5, 0, 1) * (1 - 0.3 * smoothstep(0.55 * top, 1.15 * top, sAbs));
    return drift ? st.steerRate * st.driftTurn * BASE_DRIFT_K * BASE_MUL_MAX : st.steerRate * auth;
  }

  /** Range of yaw rates a drift can hold at speed `v`: out = { min (stick against), neutral, max (stick into) }. */
  driftRange(k, v, out) {
    const c = this.caps;
    if (c.range) return this.session.physics.driftYawRange(k, v, out);
    if (c.limit) {
      const mx = this.session.physics.maxYawRate(k, v, true);
      out.max = mx; out.neutral = mx * ENG_MUL[1] / ENG_MUL[2]; out.min = mx * ENG_MUL[0] / ENG_MUL[2];
      return out;
    }
    const base = k.stats.steerRate * k.stats.driftTurn * BASE_DRIFT_K;
    out.min = base * BASE_MUL_MIN; out.neutral = base * (BASE_MUL_MIN + BASE_MUL_MAX) / 2; out.max = base * BASE_MUL_MAX;
    return out;
  }

  /**
   * Stick (-1..1) that turns the kart at `yaw` rad/s right now.  Plain steering when not drifting; inside a drift the stick is
   * drift-relative (the engine knows how, the baseline mapping is inverted by hand).
   */
  stick(k, yaw) {
    const c = this.caps;
    if (c.stick) return this.session.physics.steerForYawRate(k, yaw);
    const d = k.drift;
    if (d.dir !== 0) {
      const base = k.stats.steerRate * k.stats.driftTurn * BASE_DRIFT_K;
      const mul = -yaw / (d.dir * base);                                  // heading rate = -dir * base * mul
      const along = clamp((mul - (BASE_MUL_MIN + BASE_MUL_MAX) / 2) / ((BASE_MUL_MAX - BASE_MUL_MIN) / 2), -1, 1);
      return d.dir * along;
    }
    const w = this.maxYaw(k, k.speed);
    return w < 1e-3 ? 0 : clamp(-yaw / w, -1, 1);
  }

  /** Stick-into-the-drift (-1 fully against .. +1 fully into) a drift needs to hold the yaw rate `need` (>= 0), given its range. */
  alongFor(need, rg) {
    if (need >= rg.neutral) return rg.max > rg.neutral ? Math.min(1, (need - rg.neutral) / (rg.max - rg.neutral)) : 1;
    return rg.neutral > rg.min ? -Math.min(1, (rg.neutral - need) / (rg.neutral - rg.min)) : -1;
  }

  /** How fast the mini-turbo charges relative to its best rate for a given stick-into-the-drift (the engine slows it when countersteering). */
  chargeFactor(along) {
    return this.caps.limit ? 0.3 + 0.7 * (along + 1) * 0.5 : 1;
  }

  /** Fastest speed at which a corner of curvature `kappa` (1/m) can be followed at full lock (plain or drifting); null = unknown. */
  cornerSpeed(k, kappa, drift = false) {
    const c = this.caps;
    if (!c.corner) return null;
    return this.session.physics.maxCornerSpeed(k, kappa, { drift });
  }
}
