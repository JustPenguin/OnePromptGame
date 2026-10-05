// Arcade kart physics.  OWNER: Agent A (engine).  All feel constants live in physics/tuning.js; docs/engine.md explains them.
//
// Model: per kart we integrate
//   heading   the steered direction (the nose, before drift/spin offsets)
//   moveYaw   the direction of travel; it chases `heading` at the tyre-grip rate, so slip angle = yaw rate / grip
//   speed     m/s along moveYaw          slide   lateral m/s (only from impacts), bleeds off with grip
//   chassis yaw = heading + drift.angle + spinAngle     (conventions: see core/math.js; steer +1 = right = heading DEcreases)
// Time: dt is cut into sub-steps of at most 1/120 s and EVERY integrator below is written in terms of the sub-step `h`
// (exponentials / rates, never per-step constants), so the result is the same at 30, 60 or 144 fps.
// Hot paths are allocation-free; event payload vectors come from small ring buffers (listeners must copy, per events.js).
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { Surface, SURFACE_PROPS } from '../track/surfaces.js';
import { clamp, lerp, damp, angleDiff, wrapAngle, smoothstep, TAU } from '../core/math.js';
import { KartInput } from './Kart.js';
import { T, DRIFT_LEVEL_TIME, DRIFT_BOOST, steerAuthority, driftMul, driftAlongFor } from './tuning.js';

export { DRIFT_LEVEL_TIME, DRIFT_BOOST };
const ZERO = new KartInput();
const RING = 4;

export class KartPhysics {
  constructor(session) {
    this.session = session;
    this.track = session.track;
    this.events = session.events;
    this._wall = { depth: 0, nx: 0, nz: 0 };
    this._v3 = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._left = new THREE.Vector3();
    this._flat = new THREE.Vector3();
    this._air = new THREE.Vector3();
    this._pts = Array.from({ length: RING }, () => new THREE.Vector3());
    this._nrms = Array.from({ length: RING }, () => new THREE.Vector3());
    this._ring = 0;
    this.clock = 0;          // physics time (s), advances with every sub-step
  }

  update(dt) {
    if (!(dt > 0)) return;
    const karts = this.session.karts;
    const n = Math.max(1, Math.ceil(dt * T.substepHz - 1e-6));
    const h = dt / n;
    this.updateDraft(dt);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < karts.length; k++) this.stepKart(karts[k], h);
      this.collideKarts(h);
      this.clock += h;
    }
    for (let k = 0; k < karts.length; k++) this.finalize(karts[k], dt);
  }

  // ------------------------------------------------------------------ one kart, one substep
  stepKart(k, h) {
    if (k.respawn.active) { this.stepRespawn(k, h); return; }
    const st = k.stats, P = k.phys, track = this.track, ev = this.events;
    this.tickTimers(k, h);

    const controlled = !(k.locked || k.spin.timer > 0 || k.stun > 0);
    const inp = controlled ? k.input : ZERO;
    const q = k.query;
    const sp = SURFACE_PROPS[q.surface] ?? SURFACE_PROPS[Surface.ROAD];
    const top = st.topSpeed;
    const d = k.drift;

    // ---- speed cap for the current surface / boosts / coins / slipstream
    let surfMul = sp.speedMul;
    if (surfMul < 1) surfMul = lerp(surfMul, 1, st.offroadResist);
    const boosting = k.boost.timer > 0;
    let boostK = 0;
    if (boosting) { surfMul = lerp(surfMul, 1, 0.85); boostK = k.boost.strength * Math.min(1, k.boost.timer / T.boostFade); }
    let cap = top * (1 + k.coins * T.coinSpeed) * surfMul;
    if (k.shrink > 0) cap *= 0.93;
    cap *= 1 + boostK + k.draft.bonus;
    if (k.rocket > 0) cap = top * 1.5;

    // ---- steering input (assist is added per frame by updateAssist)
    const steerIn = clamp(inp.steer + k._assist, -1, 1);
    k.steerVisual = damp(k.steerVisual, steerIn, 14, h);

    this.updateDrift(k, inp, h, top, steerIn);

    // ---- yaw
    const sAbs = Math.abs(k.speed);
    const rev = k.speed < -0.3 ? -1 : 1;
    const airCtl = k.grounded ? 1 : d.hop > 0 ? T.hopAirControl : T.airControl;
    const omega = P.turn * steerAuthority(sAbs, top, P) * (1 - T.surfaceSteer * (1 - sp.grip));
    if (d.dir !== 0) {
      const along = clamp(steerIn * d.dir, -1, 1);
      const u = (along + 1) * 0.5;
      k.heading += -d.dir * omega * st.driftTurn * driftMul(along) * airCtl * h;
      d.angle = damp(d.angle, -d.dir * lerp(T.driftAngleMin, T.driftAngleMax, u) * P.driftAngle, T.driftAngleRate, h);
    } else {
      k.heading += -steerIn * omega * rev * airCtl * h;
      d.angle = damp(d.angle, 0, 8, h);
    }

    // ---- tyre grip: the travel direction chases the heading; lateral slide bleeds off
    let gripRate = st.grip * sp.grip * (1 - T.gripSpeedLoss * clamp(sAbs / top, 0, 1)) * (k.grounded ? 1 : d.hop > 0 ? 0.9 : 0.15);
    if (d.dir !== 0) gripRate *= T.driftGrip;
    const slip = angleDiff(k.heading, k.moveYaw);
    k.moveYaw += slip * (1 - Math.exp(-gripRate * h));
    k.slide *= Math.exp(-gripRate * 0.6 * h);

    // ---- longitudinal
    const thr = inp.throttle, brk = inp.brake;
    if (thr > 0.01 && k.speed < cap) {
      const f = clamp(k.speed / cap, 0, 1);
      let a = P.launch * (1 - f);
      if (boosting) a = Math.max(a, Math.min((cap - k.speed) / T.boostTau, T.boostAccelMax));
      if (k.draft.t > 0) a += T.draftAccel * k.draft.t;
      k.speed = Math.min(cap, k.speed + a * thr * h);
    }
    if (k.speed > cap) k.speed = Math.max(cap, k.speed - ((k.speed - cap) * T.overcapRate + T.overcapConst) * h);
    if (brk > 0.01) {
      if (k.speed > 0.8) k.speed = Math.max(0, k.speed - T.brake * brk * h);
      else if (thr < 0.05) k.speed = Math.max(-cap * T.reverseCap, k.speed - P.launch * 0.7 * brk * h);
    }
    if (thr < 0.05 && brk < 0.05 && k.rocket <= 0) {
      const dec = T.coastBase + T.coastPerMs * sAbs;
      k.speed -= Math.sign(k.speed) * Math.min(sAbs, dec * h);
    }
    // cornering scrub: hard lock at speed costs speed (less while drifting); sliding sideways costs speed too
    const scrub = (d.dir !== 0 ? T.scrubDriftSteer : T.scrubSteer) * Math.abs(steerIn) * clamp(k.speed / top, 0, 1) + T.scrubSlip * Math.abs(Math.sin(slip));
    k.speed -= k.speed * scrub * h;

    // ---- integrate position
    const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
    k.position.x += (f * k.speed - g * k.slide) * h;
    k.position.z += (g * k.speed + f * k.slide) * h;

    // ---- re-project, walls, ground, zones, safety
    track.project(k.position, q, k.hint);
    k.hint = q.index;
    k.surface = q.surface;
    k.onRoad = q.onRoad;
    this.handleWalls(k, q, h);
    this.handleGround(k, q, h, inp);
    this.handleZones(k, q);
    this.handleSafety(k, q, h, inp);
  }

  tickTimers(k, h) {
    const ev = this.events;
    if (k.boost.timer > 0) { k.boost.timer -= h; if (k.boost.timer <= 0) { k.boost.timer = 0; k.boost.strength = 0; k.boost.duration = 0; } }
    if (k.invincible > 0) { k.invincible -= h; if (k.invincible <= 0) { k.invincible = 0; ev.emit(EV.INVINCIBLE, { kart: k, active: false }); } }
    if (k.shrink > 0) { k.shrink -= h; if (k.shrink <= 0) { k.shrink = 0; ev.emit(EV.SHRINK, { kart: k, active: false }); } }
    if (k.rocket > 0) { k.rocket -= h; if (k.rocket <= 0) { k.rocket = 0; ev.emit(EV.ROCKET, { kart: k, active: false }); } }
    if (k.stun > 0) k.stun = Math.max(0, k.stun - h);
    if (k.grace > 0) k.grace = Math.max(0, k.grace - h);
    if (k.hitGrace > 0) k.hitGrace = Math.max(0, k.hitGrace - h);
    if (k._bumpCool > 0) k._bumpCool -= h;
    if (k.drift.hop > 0) k.drift.hop = Math.max(0, k.drift.hop - h);
    if (k.spin.timer > 0) {
      // the spin angle is a pure function of elapsed time (ease-out: fast whirl that settles facing forward again)
      k.spin.timer -= h;
      const u = clamp(1 - k.spin.timer / Math.max(0.3, k.spin.duration), 0, 1);
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      k.spinAngle = TAU * T.spinTurns * k.spin.dir * e;
      k.speed *= Math.exp(-T.spinSpeedDecay * h);
      k.slide *= Math.exp(-3 * h);
      if (k.spin.timer <= 0) { k.spin.timer = 0; k.spinAngle = 0; ev.emit(EV.RECOVER, { kart: k }); }
    }
  }

  /**
   * The stick position (-1 left .. +1 right) that makes `kart` turn at `yawRate` rad/s (+ = left) right now, honouring speed,
   * surface grip and drift state.  Lets any controller (AI, assists, tests) steer by yaw rate instead of by guesswork.
   * The result is clamped to [-1, 1], so an unreachable rate just gives full lock.
   */
  steerForYawRate(k, yawRate) {
    const st = k.stats, P = k.phys;
    const sp = SURFACE_PROPS[k.query.surface] ?? SURFACE_PROPS[Surface.ROAD];
    const sAbs = Math.abs(k.speed);
    const omega = P.turn * steerAuthority(sAbs, st.topSpeed, P) * (1 - T.surfaceSteer * (1 - sp.grip));
    if (omega < 1e-3) return 0;
    const d = k.drift;
    if (d.dir !== 0) {
      const mul = -yawRate / (d.dir * omega * st.driftTurn);     // wanted multiplier; <= 0 means "turn against the drift"
      return driftAlongFor(Math.max(0, mul)) * d.dir;
    }
    return clamp(-yawRate / (omega * (k.speed < -0.3 ? -1 : 1)), -1, 1);
  }

  // ------------------------------------------------------------------ drift: hop -> committed slide -> 3 mini-turbo levels -> release
  updateDrift(k, inp, h, top, steerIn) {
    const d = k.drift, ev = this.events, st = k.stats;
    const held = !!inp.drift;
    const fastEnough = k.speed > top * T.driftEnterSpeed;
    if (held && !d.held && fastEnough && d.dir === 0 && k.spin.timer <= 0) {
      d.armed = true;                         // arming works in the air too, so a press just before landing is not lost
      if (k.grounded) { k.vy = T.hopVy; k.grounded = false; d.hop = T.hopTime; ev.emit(EV.HOP, { kart: k }); }
    }
    d.held = held;
    if (!held) { if (d.dir !== 0) this.releaseDrift(k); d.armed = false; }
    if (held && d.armed && d.dir === 0 && Math.abs(steerIn) > 0.25 && fastEnough) {
      d.dir = steerIn > 0 ? 1 : -1; d.charge = 0; d.level = 0;
      ev.emit(EV.DRIFT_START, { kart: k, dir: d.dir });
    }
    if (d.dir !== 0) {
      if (k.speed < top * T.driftCancelSpeed || k.spin.timer > 0) { k.cancelDrift(); return; }
      if (k.grounded || d.hop > 0) {            // the entry hop counts: charge runs from the moment you commit
        const along = clamp(steerIn * d.dir, -1, 1);
        d.charge += h * st.miniTurbo * (T.driftChargeBase + T.driftChargeSteer * along);
        if (d.level < 3 && d.charge >= DRIFT_LEVEL_TIME[d.level]) { d.level++; ev.emit(EV.DRIFT_LEVEL, { kart: k, level: d.level }); }
      }
    }
  }

  releaseDrift(k) {
    const d = k.drift;
    const lvl = d.level;
    d.dir = 0; d.charge = 0; d.level = 0;
    // Hand the nose over to the velocity: the kart keeps travelling exactly the way it was, and the chassis swings back
    // in line smoothly (yaw = heading + angle stays continuous, so the heading never teleports).
    const old = k.heading;
    const lead = angleDiff(k.heading, k.moveYaw);
    k.heading = k.moveYaw + lead * 0.25;
    d.angle += old - k.heading;
    if (lvl > 0) {
      const b = DRIFT_BOOST[lvl];
      k.applyBoost(b.strength, b.duration, 'drift');
      this.events.emit(EV.DRIFT_BOOST, { kart: k, level: lvl });
    }
  }

  // ------------------------------------------------------------------ walls
  handleWalls(k, q, h) {
    const W = this._wall;
    if (k._wallCool > 0) k._wallCool -= h;
    if (!this.track.resolveWalls(q, k.radius * k.scale, W)) {
      k._wallT = 0;
      k._wallGap += h;
      if (k.scraping && k._wallGap > 0.12) { k.scraping = false; this.events.emit(EV.WALL_SCRAPE, { kart: k, active: false }); }
      return;
    }
    const fresh = k._wallGap > 0.06;          // first contact after a gap = a real impact; otherwise we are sliding along it
    k._wallGap = 0;
    k._wallT += h;
    k.position.x += W.nx * W.depth;
    k.position.z += W.nz * W.depth;
    const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
    let vx = f * k.speed - g * k.slide, vz = g * k.speed + f * k.slide;
    const vn = vx * W.nx + vz * W.nz;
    const spd = Math.hypot(vx, vz);
    if (vn < 0) {
      const impact = -vn;
      // tangent along the wall in the direction we are travelling
      let tx = -W.nz, tz = W.nx;
      if (tx * vx + tz * vz < 0) { tx = -tx; tz = -tz; }
      const vt = vx * tx + vz * tz;
      let nvx, nvz;
      if (fresh) {
        // impact: the normal part bounces (a little), the tangential part keeps most of its speed at shallow angles
        const sin2 = spd > 0.1 ? Math.min(1, (impact / spd) * (impact / spd)) : 1;
        const e = impact > 4 ? T.wallBounce : T.wallBounce * 0.3;
        const keep = 1 - clamp(T.wallScrape + T.wallAngleLoss * sin2, 0, 0.75);
        nvx = W.nx * impact * e + tx * vt * keep;
        nvz = W.nz * impact * e + tz * vt * keep;
      } else {
        // already sliding along it: the wall is just a guide (no bounce, no per-step loss)
        nvx = tx * vt; nvz = tz * vt;
      }
      setVelocity(k, nvx, nvz);
      // swing the nose along the wall on shallow hits so we slide on instead of ramming it again (head-on keeps its heading)
      const sinA = spd > 0.1 ? impact / spd : 1;
      const w = smoothstep(0.85, 0.3, sinA);
      if (w > 0) {
        const tYaw = Math.atan2(tx, tz);
        const a = 1 - Math.exp(-(fresh ? T.wallAlign : T.wallAlignSliding) * h);
        k.heading += angleDiff(tYaw, k.heading) * w * a;
        k.moveYaw += angleDiff(tYaw, k.moveYaw) * w * Math.min(1, a * (fresh ? 0.6 : 1.4));
      }
      if (fresh && impact > 9 && k.drift.dir !== 0) k.cancelDrift();           // a hard hit breaks the drift
      if (fresh && impact > T.wallHitMin && k._wallCool <= 0) {
        k._wallCool = T.wallHitCooldown;
        const pt = this._pts[this._ring].set(k.position.x - W.nx * k.radius * k.scale, k.position.y, k.position.z - W.nz * k.radius * k.scale);
        const nm = this._nrms[this._ring].set(W.nx, 0, W.nz);
        this._ring = (this._ring + 1) % RING;
        this.events.emit(EV.WALL_HIT, { kart: k, impact, point: pt, normal: nm });
      }
    }
    // pressed against the wall: keep scraping (small continuous drag), announce it once
    k.speed -= k.speed * T.wallDrag * h * (k.speed > 0 ? 1 : 0);
    if (!k.scraping && k._wallT > 0.05 && Math.abs(k.speed) > 3) { k.scraping = true; this.events.emit(EV.WALL_SCRAPE, { kart: k, active: true }); }
  }

  // ------------------------------------------------------------------ ground / air
  handleGround(k, q, h, inp) {
    if (!q.inBounds || q.surface === Surface.VOID) {
      // off the edge with no wall: no ground here, fall
      k.grounded = false; k.vy -= T.gravity * h; k.position.y += k.vy * h;
      return;
    }
    const ground = q.height;
    if (k.grounded) {
      const prevY = k.position.y;
      const ballistic = prevY + k.vy * h - 0.5 * T.gravity * h * h;
      if (ballistic > ground + 0.2 && k.vy > 1.5) {
        // the ground fell away faster than gravity: launch (crest / ramp lip)
        k.grounded = false;
        k.position.y = prevY + k.vy * h;
        k.air.trick = !!inp.drift && k.speed > k.stats.topSpeed * 0.5;
        k.air.peak = k.position.y;
        this.events.emit(EV.JUMP, { kart: k });
      } else {
        const gv = clamp((ground - prevY) / h, -30, 30);
        k.vy = damp(k.vy, gv, 60, h);
        k.position.y = ground;
      }
    } else {
      k.vy -= T.gravity * h;
      k.position.y += k.vy * h;
      k.airTime += h;
      if (k.position.y > k.air.peak) k.air.peak = k.position.y;
      if (k.position.y <= ground && k.vy <= 0) {
        const impact = -k.vy;
        k.position.y = ground; k.vy = 0; k.grounded = true;
        if (k.airTime > T.landMinAir && impact > T.landMinImpact) this.events.emit(EV.LAND, { kart: k, impact });
        // landing trick: keep the drift button down through a big jump and the landing pays out a small mini-turbo
        if (k.air.trick && inp.drift && k.airTime > T.trickMinAir) k.applyBoost(T.trickBoost.strength, T.trickBoost.duration, 'trick');
        k.air.trick = false;
        k.airTime = 0;
      }
    }
    if (k.grounded) k.airTime = 0;
  }

  handleZones(k, q) {
    const z = q.zone;
    if (z && z.type === 'boost') {
      if (k._pad !== z) {
        k._pad = z;
        k.applyBoost(0.42, 1.0, 'pad');
        if (k.speed < k.stats.topSpeed * 0.9) k.speed = Math.min(k.stats.topSpeed * 0.9, k.speed + 10);
        this.events.emit(EV.PAD_BOOST, { kart: k, pad: z });
      }
    } else if (!z) k._pad = null;
    const off = (SURFACE_PROPS[q.surface] ?? SURFACE_PROPS[Surface.ROAD]).offroad;
    if (off !== k._offroad) { k._offroad = off; this.events.emit(EV.OFFROAD, { kart: k, active: off, surface: q.surface }); }
  }

  handleSafety(k, q, h, inp) {
    if (q.inBounds && k.grounded && q.surface !== Surface.VOID) { k.lastSafeS = q.s; k.fallTimer = 0; }
    else if (!q.inBounds || q.surface === Surface.VOID) { k.fallTimer += h; if (k.fallTimer > T.fallTime) { this.respawnKart(k, 'fall'); return; } }
    if (k.position.y < q.height - 25) { this.respawnKart(k, 'fall'); return; }
    // stuck: pedal down but going nowhere for a while
    if (!k.locked && inp.throttle > 0.5 && Math.abs(k.speed) < 1.2 && k.spin.timer <= 0) { k.stuckTimer += h; if (k.stuckTimer > T.stuckTime) this.respawnKart(k, 'stuck'); }
    else k.stuckTimer = 0;
    // numerical safety net: never let a NaN into the world
    if (!Number.isFinite(k.position.x + k.position.y + k.position.z + k.speed + k.heading + k.slide + k.vy + k.moveYaw)) this.recoverNonFinite(k);
  }

  // ------------------------------------------------------------------ respawn ("rescue drone" carries the kart back)
  respawnKart(k, reason = 'manual') {
    if (k.respawn.active) return;
    const s = (k.lastSafeS ?? k.query.s) - T.respawnBack;
    const target = this.track.getRespawn(s, 0);
    const r = k.respawn;
    r.active = true; r.t = 0; r.dur = T.respawnTime; r.reason = reason; r.yaw = target.yaw;
    r.from.copy(k.position); r.to.copy(target.position);
    k.cancelDrift(); k.boost.timer = 0; k.boost.strength = 0; k.spin.timer = 0; k.spinAngle = 0; k.hitGrace = 0;
    k.speed = 0; k.slide = 0; k.vy = 0; k.fallTimer = 0; k.stuckTimer = 0;
    if (k.scraping) { k.scraping = false; this.events.emit(EV.WALL_SCRAPE, { kart: k, active: false }); }
    this.events.emit(EV.RESPAWN, { kart: k, reason });
  }

  stepRespawn(k, h) {
    const r = k.respawn;
    r.t += h;
    const u = clamp(r.t / r.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    k.position.lerpVectors(r.from, r.to, e);
    k.position.y += Math.sin(u * Math.PI) * 6;
    k.heading += angleDiff(r.yaw, k.heading) * (1 - Math.exp(-6 * h));
    k.moveYaw = k.heading;
    k.drift.angle = damp(k.drift.angle, 0, 8, h);
    if (u >= 1) {
      r.active = false;
      k.placeAt(r.to, r.yaw, k.stats.topSpeed * T.respawnSpeed);
      k.grace = Math.max(k.grace, T.respawnGrace);
      this.events.emit(EV.RESPAWN_DONE, { kart: k });
    }
  }

  recoverNonFinite(k) {
    const s = k.lastSafeS ?? 0;
    const t = this.track.getRespawn(s, 0);
    k.placeAt(t.position, t.yaw, 0);
    k.root.position.copy(t.position);
    k.query.index = 0;
    this.track.project(k.position, k.query, -1);
    k.hint = k.query.index;
    this.events.emit(EV.RESPAWN, { kart: k, reason: 'fall' });
    this.events.emit(EV.RESPAWN_DONE, { kart: k });
  }

  // ------------------------------------------------------------------ slipstream
  updateDraft(dt) {
    const ks = this.session.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i], dr = a.draft;
      let best = null, bestAlong = T.draftRange;
      if (!a.respawn.active && a.grounded && a.spin.timer <= 0 && a.speed > a.stats.topSpeed * T.draftMinSpeed) {
        const fx = a.forward.x, fz = a.forward.z;
        for (let j = 0; j < ks.length; j++) {
          if (j === i) continue;
          const b = ks[j];
          if (b.respawn.active || !b.grounded || b.speed < b.stats.topSpeed * T.draftMinSpeed * 0.8) continue;
          const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
          const along = dx * fx + dz * fz;
          if (along < T.draftMinRange || along > bestAlong) continue;
          const lat = dx * fz - dz * fx;                              // sideways offset in a's frame
          if (Math.abs(lat) > T.draftHalfWidth + along * 0.05) continue;
          if (Math.abs(b.position.y - a.position.y) > 2) continue;
          if (fx * b.forward.x + fz * b.forward.z < 0.5) continue;    // the leader must be driving the same way
          best = b; bestAlong = along;
        }
      }
      if (best) { dr.t = Math.min(1, dr.t + dt / T.draftBuild); dr.target = best; }
      else { dr.t = Math.max(0, dr.t - dt / T.draftDecay); if (dr.t <= 0) dr.target = null; }
      dr.bonus = T.draftBonus * smoothstep(0.2, 1, dr.t);
      const active = dr.t > 0.3 ? true : dr.t < 0.08 ? false : dr.active;
      if (active !== dr.active) { dr.active = active; this.events.emit(EV.DRAFT, { kart: a, target: dr.target, active }); }
    }
  }

  // ------------------------------------------------------------------ kart vs kart
  collideKarts(h) {
    const ks = this.session.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      if (a.respawn.active) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (b.respawn.active) continue;
        const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        const rr = a.radius * a.scale + b.radius * b.scale;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (Math.abs(b.position.y - a.position.y) > 1.6) continue;
        let nx, nz, dist;
        if (d2 < 1e-6) { nx = 1; nz = 0; dist = 0; }   // exactly stacked (teleports): push apart along +x
        else { dist = Math.sqrt(d2); nx = dx / dist; nz = dz / dist; }
        const pen = rr - dist;
        // effective masses: weight stat ^ massPower, shrunk karts are bullied, invincible / rocket karts barge through
        let ma = Math.pow(a.stats.mass, T.massPower) * a.scale * a.scale;
        let mb = Math.pow(b.stats.mass, T.massPower) * b.scale * b.scale;
        const ramA = a.invincible > 0 || a.rocket > 0, ramB = b.invincible > 0 || b.rocket > 0;
        if (ramA && !ramB) ma *= T.ramMass; else if (ramB && !ramA) mb *= T.ramMass;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.position.x -= nx * pen * wa; a.position.z -= nz * pen * wa;
        b.position.x += nx * pen * wb; b.position.z += nz * pen * wb;
        const fa = Math.sin(a.moveYaw), ga = Math.cos(a.moveYaw), fb = Math.sin(b.moveYaw), gb = Math.cos(b.moveYaw);
        let avx = fa * a.speed - ga * a.slide, avz = ga * a.speed + fa * a.slide;
        let bvx = fb * b.speed - gb * b.slide, bvz = gb * b.speed + fb * b.slide;
        const rel = (bvx - avx) * nx + (bvz - avz) * nz;
        if (rel < 0) {
          const jn = (-(1 + T.bumpRestitution) * rel) / (1 / ma + 1 / mb);
          avx -= (jn / ma) * nx; avz -= (jn / ma) * nz;
          bvx += (jn / mb) * nx; bvz += (jn / mb) * nz;
          setVelocity(a, avx, avz); setVelocity(b, bvx, bvz);
          if (-rel > T.bumpMinImpact && a._bumpCool <= 0 && b._bumpCool <= 0) {
            a._bumpCool = b._bumpCool = T.bumpCooldown;
            const pt = this._pts[this._ring].set((a.position.x + b.position.x) * 0.5, a.position.y + 0.5, (a.position.z + b.position.z) * 0.5);
            this._ring = (this._ring + 1) % RING;
            this.events.emit(EV.BUMP, { a, b, impact: -rel, point: pt, ram: ramA && !ramB ? a : ramB && !ramA ? b : null });
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ per-frame: basis, orientation, scene transform
  finalize(k, dt) {
    k.heading = wrapAngle(k.heading);
    k.moveYaw = wrapAngle(k.moveYaw);
    k.yaw = k.heading + k.drift.angle + k.spinAngle;
    k.scale = damp(k.scale, k.shrink > 0 ? 0.55 : 1, 7, dt);
    // smooth the ground normal; in the air the nose follows the flight path (up on the way up, down on the way down)
    let gn;
    if (k.grounded) gn = k.query.normal;
    else {
      const th = clamp(Math.atan2(k.vy, Math.max(8, Math.abs(k.speed))), -0.7, 0.7) * 0.8;
      const hs = Math.sin(k.moveYaw), hc = Math.cos(k.moveYaw), st = Math.sin(th), ct = Math.cos(th);
      gn = this._air.set(-hs * st, ct, -hc * st);
    }
    k.groundNormal.lerp(gn, 1 - Math.exp(-(k.grounded ? 14 : 6) * dt)).normalize();
    const n = k.groundNormal;
    const flat = this._flat.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    flat.addScaledVector(n, -flat.dot(n)).normalize();
    const left = this._left.crossVectors(n, flat).normalize();
    k.forward.copy(flat); k.up.copy(n); k.right.copy(left).negate();
    this._m.makeBasis(left, n, flat);
    k.orientation.setFromRotationMatrix(this._m);
    k.root.position.copy(k.position);
    k.root.quaternion.copy(k.orientation);
    k.root.scale.setScalar(k.scale);
    const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
    k.velocity.set(f * k.speed - g * k.slide, k.vy, g * k.speed + f * k.slide);
    const ratio = clamp(k.speed / k.stats.topSpeed, 0, 1);
    k.lean = damp(k.lean, k.steerVisual * 0.14 * ratio + (k.drift.dir !== 0 ? k.drift.dir * 0.1 : 0), 10, dt);
    // visual pitch from longitudinal acceleration (squat when pushing, dive when braking)
    if (dt > 1e-4) {
      const ax = clamp((k.speed - (k._prevSpeed ?? k.speed)) / dt, -50, 40);
      k.pitch = damp(k.pitch, clamp(ax * 0.0035, -0.09, 0.07), 9, dt);
    }
    k._prevSpeed = k.speed;
  }
}

function setVelocity(k, vx, vz) {
  const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
  k.speed = vx * f + vz * g;
  k.slide = -vx * g + vz * f;
}
