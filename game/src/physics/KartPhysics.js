// Arcade kart physics: speed/steer model with tyre-grip slide, drift + 3-level mini-turbo, boosts, off-road,
// wall + kart + ground handling, airtime, respawn.  OWNER: Agent A (engine) - this is a competent BASELINE; the
// agent tunes it into something that feels as good as a AAA kart racer.
//
// State per kart: heading (steered), moveYaw (travel direction, follows heading with tyre grip), speed (along
// moveYaw), slide (lateral m/s).  chassis yaw = heading + drift.angle + spinAngle.  See math.js for conventions
// (steer +1 = right = heading DEcreases).
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { SURFACE_PROPS } from '../track/surfaces.js';
import { clamp, lerp, damp, angleDiff, smoothstep, TAU } from '../core/math.js';
import { KartInput } from './Kart.js';

const GRAVITY = 32;
const SUBSTEP_HZ = 120;
export const DRIFT_LEVEL_TIME = [0.85, 1.7, 2.7]; // seconds of charge to reach level 1, 2, 3
export const DRIFT_BOOST = [null, { strength: 0.22, duration: 0.7 }, { strength: 0.3, duration: 1.1 }, { strength: 0.38, duration: 1.6 }];
const ZERO = new KartInput();

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
  }

  update(dt) {
    if (!(dt > 0)) return;
    const karts = this.session.karts;
    const n = Math.max(1, Math.ceil(dt * SUBSTEP_HZ));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < karts.length; k++) this.stepKart(karts[k], h);
      this.collideKarts();
    }
    for (let k = 0; k < karts.length; k++) this.finalize(karts[k], dt);
  }

  // ------------------------------------------------------------------ one kart, one substep
  stepKart(k, h) {
    const st = k.stats, track = this.track, ev = this.events;
    if (k.respawn.active) { this.stepRespawn(k, h); return; }

    // timers
    if (k.boost.timer > 0) { k.boost.timer -= h; if (k.boost.timer <= 0) { k.boost.timer = 0; k.boost.strength = 0; } }
    if (k.invincible > 0) { k.invincible -= h; if (k.invincible <= 0) { k.invincible = 0; ev.emit(EV.INVINCIBLE, { kart: k, active: false }); } }
    if (k.shrink > 0) { k.shrink -= h; if (k.shrink <= 0) { k.shrink = 0; ev.emit(EV.SHRINK, { kart: k, active: false }); } }
    if (k.rocket > 0) { k.rocket -= h; if (k.rocket <= 0) { k.rocket = 0; ev.emit(EV.ROCKET, { kart: k, active: false }); } }
    if (k.stun > 0) k.stun = Math.max(0, k.stun - h);
    if (k.spin.timer > 0) {
      k.spin.timer -= h;
      k.spinAngle += (TAU * 2 / Math.max(0.3, k.spin.duration)) * k.spin.dir * h;
      k.speed *= Math.exp(-1.7 * h);
      k.slide *= Math.exp(-3 * h);
      if (k.spin.timer <= 0) { k.spin.timer = 0; k.spinAngle = 0; ev.emit(EV.RECOVER, { kart: k }); }
    }
    const controlled = !(k.locked || k.spin.timer > 0 || k.stun > 0);
    const inp = controlled ? k.input : ZERO;

    const q = k.query;
    const sp = SURFACE_PROPS[q.surface];
    const top = st.topSpeed;

    // ---- top-speed cap for the current surface / boost ----
    let surfMul = sp.speedMul;
    if (surfMul < 1) surfMul = lerp(surfMul, 1, st.offroadResist);
    const boosting = k.boost.timer > 0;
    if (boosting) surfMul = lerp(surfMul, 1, 0.85);
    let cap = top * (1 + k.coins * 0.012) * surfMul;
    if (k.shrink > 0) cap *= 0.93;
    if (boosting) cap *= 1 + k.boost.strength;
    if (k.rocket > 0) cap = top * 1.5;

    this.updateDrift(k, inp, h, top);
    const d = k.drift;

    // ---- steering ----
    const steerIn = clamp(inp.steer, -1, 1);
    k.steerVisual = damp(k.steerVisual, steerIn, 14, h);
    const sAbs = Math.abs(k.speed);
    const auth = clamp(sAbs / 5, 0, 1) * (1 - 0.3 * smoothstep(0.55 * top, 1.15 * top, sAbs));
    const air = k.grounded ? 1 : 0.35;
    const rev = k.speed < -0.3 ? -1 : 1;
    if (d.dir !== 0) {
      const along = clamp(steerIn * d.dir, -1, 1);
      const mul = lerp(0.45, 1.3, (along + 1) / 2);
      k.heading += -d.dir * st.steerRate * st.driftTurn * mul * 0.95 * air * h;
      d.angle = damp(d.angle, -d.dir * (0.34 + 0.12 * along), 9, h);
    } else {
      k.heading += -steerIn * st.steerRate * auth * rev * air * h;
      d.angle = damp(d.angle, 0, 8, h);
    }

    // ---- tyre grip: travel direction chases heading; lateral slide bleeds off ----
    const grip = st.grip * sp.grip * (k.grounded ? 1 : 0.15);
    const slip = angleDiff(k.heading, k.moveYaw);
    k.moveYaw += slip * (1 - Math.exp(-grip * h));
    k.slide *= Math.exp(-grip * 0.6 * h);

    // ---- longitudinal ----
    const throttle = inp.throttle, brake = inp.brake;
    if (throttle > 0.01 && k.speed < cap) {
      const frac = clamp(k.speed / cap, 0, 1);
      let acc = st.accel * (1 - Math.pow(frac, 2.2) * 0.92);
      if (boosting) acc = Math.max(acc, st.accel * 2.6);
      k.speed = Math.min(cap, k.speed + acc * throttle * h);
    }
    if (k.speed > cap) k.speed = Math.max(cap, k.speed - (k.speed - cap) * (boosting ? 1 : 2.2) * h - 6 * h);
    if (brake > 0.01) {
      if (k.speed > 0.8) k.speed = Math.max(0, k.speed - st.brake * brake * h);
      else if (throttle < 0.05) k.speed = Math.max(-cap * 0.32, k.speed - st.accel * 0.7 * brake * h);
    }
    if (throttle < 0.05 && brake < 0.05 && k.rocket <= 0) {
      const dec = 3.2 + 0.05 * Math.abs(k.speed);
      k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), dec * h);
    }
    // cornering scrub (hard lock at speed costs a little) + sliding scrub
    k.speed -= k.speed * (0.1 * Math.abs(steerIn) * clamp(k.speed / top, 0, 1) + 0.25 * Math.abs(Math.sin(slip))) * h;

    // ---- integrate position ----
    const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
    k.position.x += (f * k.speed - g * k.slide) * h;
    k.position.z += (g * k.speed + f * k.slide) * h;

    // ---- re-project, walls, ground ----
    track.project(k.position, q, k.hint);
    k.hint = q.index;
    k.surface = q.surface;
    k.onRoad = q.onRoad;
    this.handleWalls(k, q, h);
    this.handleGround(k, q, h);
    this.handleZones(k, q);
    this.handleSafety(k, q, h, inp);
  }

  updateDrift(k, inp, h, top) {
    const d = k.drift, ev = this.events, st = k.stats;
    const held = !!inp.drift;
    if (held && !d.held && k.grounded && k.speed > top * 0.3 && d.dir === 0 && k.spin.timer <= 0) {
      k.vy = 5; k.grounded = false; d.hop = 0.25; d.armed = true;
      ev.emit(EV.HOP, { kart: k });
    }
    d.held = held;
    if (!held) { if (d.dir !== 0) this.releaseDrift(k); d.armed = false; }
    if (d.hop > 0) d.hop -= h;
    if (held && d.armed && d.dir === 0 && Math.abs(inp.steer) > 0.25 && k.speed > top * 0.3) {
      d.dir = inp.steer > 0 ? 1 : -1; d.charge = 0; d.level = 0;
      ev.emit(EV.DRIFT_START, { kart: k, dir: d.dir });
    }
    if (d.dir !== 0) {
      if (k.speed < top * 0.2 || k.spin.timer > 0) { k.cancelDrift(); return; }
      if (k.grounded) {
        const along = clamp(inp.steer * d.dir, -1, 1);
        d.charge += h * st.miniTurbo * (0.8 + 0.2 * along);
        if (d.level < 3 && d.charge >= DRIFT_LEVEL_TIME[d.level]) { d.level++; ev.emit(EV.DRIFT_LEVEL, { kart: k, level: d.level }); }
      }
    }
  }

  releaseDrift(k) {
    const lvl = k.drift.level;
    k.drift.dir = 0; k.drift.charge = 0; k.drift.level = 0;
    if (lvl > 0) {
      const b = DRIFT_BOOST[lvl];
      k.applyBoost(b.strength, b.duration, 'drift');
      this.events.emit(EV.DRIFT_BOOST, { kart: k, level: lvl });
    }
  }

  handleWalls(k, q, h) {
    const W = this._wall;
    if (k._wallCool > 0) k._wallCool -= h;
    if (!this.track.resolveWalls(q, k.radius * k.scale, W)) { k.scraping = false; return; }
    k.position.x += W.nx * W.depth;
    k.position.z += W.nz * W.depth;
    const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
    let vx = f * k.speed - g * k.slide, vz = g * k.speed + f * k.slide;
    const vn = vx * W.nx + vz * W.nz;
    if (vn < 0) {
      const impact = -vn;
      vx -= (1 + 0.25) * vn * W.nx; vz -= (1 + 0.25) * vn * W.nz;
      const loss = clamp(0.05 + 0.55 * impact / k.stats.topSpeed, 0, 0.6);
      vx *= 1 - loss; vz *= 1 - loss;
      setVelocity(k, vx, vz);
      // swing the nose along the wall so we don't keep ramming it
      let tx = -W.nz, tz = W.nx;
      if (tx * vx + tz * vz < 0) { tx = -tx; tz = -tz; }
      const tYaw = Math.atan2(tx, tz);
      const nudge = clamp(impact / 9, 0.08, 0.5);
      k.heading += angleDiff(tYaw, k.heading) * nudge;
      k.moveYaw += angleDiff(tYaw, k.moveYaw) * nudge;
      if (impact > 3.5 && (k._wallCool ?? 0) <= 0) {
        k._wallCool = 0.18;
        this.events.emit(EV.WALL_HIT, { kart: k, impact, point: this._v3.set(k.position.x - W.nx * k.radius, k.position.y, k.position.z - W.nz * k.radius).clone(), normal: new THREE.Vector3(W.nx, 0, W.nz) });
      }
    }
    k.scraping = true;
  }

  handleGround(k, q, h) {
    if (!q.inBounds) {
      // off the edge with no wall: no ground here, fall
      k.grounded = false; k.vy -= GRAVITY * h; k.position.y += k.vy * h;
      return;
    }
    const ground = q.height;
    if (k.grounded) {
      const prevY = k.position.y;
      const ballistic = prevY + k.vy * h - 0.5 * GRAVITY * h * h;
      if (ballistic > ground + 0.2 && k.vy > 1.5) {
        // ground fell away faster than gravity: launch (crest / ramp lip)
        k.grounded = false;
        k.position.y = prevY + k.vy * h;
        this.events.emit(EV.JUMP, { kart: k });
      } else {
        k.vy = clamp((ground - prevY) / h, -30, 30) * 0.5 + k.vy * 0.5;
        k.position.y = ground;
      }
    } else {
      k.vy -= GRAVITY * h;
      k.position.y += k.vy * h;
      k.airTime += h;
      if (k.position.y <= ground && k.vy <= 0) {
        const impact = -k.vy;
        k.position.y = ground; k.vy = 0; k.grounded = true;
        if (k.airTime > 0.15 && impact > 5) this.events.emit(EV.LAND, { kart: k, impact });
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
    const off = SURFACE_PROPS[q.surface].offroad;
    if (off !== !!k._offroad) { k._offroad = off; this.events.emit(EV.OFFROAD, { kart: k, active: off, surface: q.surface }); }
  }

  handleSafety(k, q, h, inp) {
    if (q.inBounds && k.grounded) { k.lastSafeS = q.s; k.fallTimer = 0; }
    else if (!q.inBounds) { k.fallTimer += h; if (k.fallTimer > 1.1) { this.respawnKart(k, 'fall'); return; } }
    if (k.position.y < q.height - 25) { this.respawnKart(k, 'fall'); return; }
    // stuck: pedal down but going nowhere for a while
    if (!k.locked && inp.throttle > 0.5 && Math.abs(k.speed) < 1.2 && k.spin.timer <= 0) { k.stuckTimer += h; if (k.stuckTimer > 4.5) this.respawnKart(k, 'stuck'); }
    else k.stuckTimer = 0;
  }

  // ------------------------------------------------------------------ respawn ("rescue drone" carries the kart back)
  respawnKart(k, reason = 'manual') {
    if (k.respawn.active) return;
    const s = (k.lastSafeS ?? k.query.s) - 6;
    const target = this.track.getRespawn(s, 0);
    const r = k.respawn;
    r.active = true; r.t = 0; r.dur = 1.7; r.reason = reason; r.yaw = target.yaw;
    r.from.copy(k.position); r.to.copy(target.position);
    k.cancelDrift(); k.boost.timer = 0; k.boost.strength = 0; k.spin.timer = 0; k.spinAngle = 0;
    k.speed = 0; k.slide = 0; k.vy = 0; k.fallTimer = 0; k.stuckTimer = 0;
    this.events.emit(EV.RESPAWN, { kart: k, reason });
  }

  stepRespawn(k, h) {
    const r = k.respawn;
    r.t += h;
    const u = clamp(r.t / r.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    k.position.lerpVectors(r.from, r.to, e);
    k.position.y += Math.sin(u * Math.PI) * 6;
    k.heading += angleDiff(r.yaw, k.heading) * Math.min(1, h * 6);
    k.moveYaw = k.heading;
    if (u >= 1) {
      r.active = false;
      k.placeAt(r.to, r.yaw, 0);
      k.invincible = Math.max(k.invincible, 2);
      this.events.emit(EV.RESPAWN_DONE, { kart: k });
    }
  }

  // ------------------------------------------------------------------ kart vs kart
  collideKarts() {
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
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        if (Math.abs(b.position.y - a.position.y) > 1.6) continue;
        const dist = Math.sqrt(d2), nx = dx / dist, nz = dz / dist, pen = rr - dist;
        const ma = a.stats.mass * a.scale, mb = b.stats.mass * b.scale;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.position.x -= nx * pen * wa; a.position.z -= nz * pen * wa;
        b.position.x += nx * pen * wb; b.position.z += nz * pen * wb;
        const fa = Math.sin(a.moveYaw), ga = Math.cos(a.moveYaw), fb = Math.sin(b.moveYaw), gb = Math.cos(b.moveYaw);
        let avx = fa * a.speed - ga * a.slide, avz = ga * a.speed + fa * a.slide;
        let bvx = fb * b.speed - gb * b.slide, bvz = gb * b.speed + fb * b.slide;
        const rel = (bvx - avx) * nx + (bvz - avz) * nz;
        if (rel < 0) {
          const jn = (-(1 + 0.45) * rel) / (1 / ma + 1 / mb);
          avx -= (jn / ma) * nx; avz -= (jn / ma) * nz;
          bvx += (jn / mb) * nx; bvz += (jn / mb) * nz;
          setVelocity(a, avx, avz); setVelocity(b, bvx, bvz);
          if (-rel > 3 && (a._bumpCool ?? 0) <= 0) {
            a._bumpCool = b._bumpCool = 0.25;
            this.events.emit(EV.BUMP, { a, b, impact: -rel, point: new THREE.Vector3((a.position.x + b.position.x) / 2, a.position.y + 0.5, (a.position.z + b.position.z) / 2) });
          }
        }
      }
    }
    for (let i = 0; i < ks.length; i++) if (ks[i]._bumpCool > 0) ks[i]._bumpCool -= 1 / SUBSTEP_HZ;
  }

  // ------------------------------------------------------------------ per-frame: basis, orientation, scene transform
  finalize(k, dt) {
    k.yaw = k.heading + k.drift.angle + k.spinAngle;
    k.scale = damp(k.scale, k.shrink > 0 ? 0.55 : 1, 7, dt);
    // smooth the ground normal
    const gn = k.grounded ? k.query.normal : this._v3.set(0, 1, 0);
    k.groundNormal.lerp(gn, 1 - Math.exp(-(k.grounded ? 14 : 2.5) * dt)).normalize();
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
    k.lean = damp(k.lean, k.steerVisual * 0.14 * clamp(k.speed / k.stats.topSpeed, 0, 1) + (k.drift.dir !== 0 ? k.drift.dir * 0.1 : 0), 10, dt);
  }
}

function setVelocity(k, vx, vz) {
  const f = Math.sin(k.moveYaw), g = Math.cos(k.moveYaw);
  k.speed = vx * f + vz * g;
  k.slide = -vx * g + vz * f;
}
