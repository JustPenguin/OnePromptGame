// Camera rig. OWNER: Agent A (engine).  Drives session.camera.
//
// States:   intro fly-over (race.phase === 'intro')  ->  chase / far / close (cycled with the camera key)
//           ->  finish orbit (the followed kart has finished)  ->  spectate (session.cameraTarget = another kart)
// Reads:    session.cameraTarget ?? session.player, session.race, session.settings (cameraMode, cameraShake, fovBoost,
//           reducedMotion), kart speed / boost / drift / airborne state, and events (hits, landings, boosts add kicks).
//
// Design notes (see docs/engine.md):
//  * the camera yaw chases the kart's travel direction with a speed-dependent lag, so corners swing the camera outside the
//    turn (you see the kart's flank) and drifts swing it into the turn;
//  * position is "focus - forward * dist + up * height" with a short positional smoothing, and the distance itself grows with
//    speed and boosts, so the speed feel is explicit rather than an accident of lag;
//  * everything is exponential damping with the real dt (the session clamps dt to 50 ms), so a slow tab never makes it jump;
//  * the camera is kept above the road surface and inside the walls using track.project (never clips under terrain);
//  * shake is deterministic smooth noise (no Math.random) so it reads as rumble, not static.
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { clamp, damp, dampAngle, lerp, smoothstep, angleDiff } from '../core/math.js';
import { TrackQuery } from '../track/SplineTrack.js';

// dist/height: metres behind/above the focus point; look: metres ahead of the kart to aim at; fov: base vertical FOV (deg)
export const CAMERA_MODES = {
  chase: { dist: 6.2, height: 2.85, look: 6.5, lookUp: 1.2, fov: 58, speedDist: 1.0, speedFov: 8 },
  far: { dist: 9.6, height: 4.5, look: 8, lookUp: 1.2, fov: 56, speedDist: 1.6, speedFov: 7 },
  close: { dist: 4.3, height: 2.0, look: 5, lookUp: 1.05, fov: 63, speedDist: 0.6, speedFov: 9 },
};
const MODE_ORDER = ['chase', 'far', 'close'];
const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(session) {
    this.session = session;
    this.camera = session.camera;
    this.mode = session.settings?.cameraMode ?? 'chase';
    this._seenSetting = session.settings?.cameraMode;   // last value of settings.cameraMode we looked at (only a CHANGE overrides the key-cycled mode)
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.fov = 60;
    this.shake = 0;
    this.roll = 0;
    this.lookBackBlend = 0;
    this.boostKick = 0;     // 0..1, decays: FOV punch + pull-back after a boost
    this.dip = 0;           // metres the camera sinks after a hard landing
    this.orbit = 0;         // finish-orbit angle
    this.settle = 0;        // seconds left of "gentle catch-up" after the intro is skipped / the target changes
    this.time = 0;
    this._init = false;
    this._wasIntro = false;
    this._followed = null;
    this._finishT = 0;
    this._hint = -1;
    this._q = new TrackQuery();
    this._smp = null;       // TrackSample scratch, created from the track on first use
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._tmp3 = new THREE.Vector3();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._la = new THREE.Vector3(); this._lb = new THREE.Vector3(); this._lc = new THREE.Vector3();
    this.fovKick = 0;       // legacy field (kept for anything that peeks at it)

    const on = (t, f) => session.on(t, f);
    on(EV.WALL_HIT, ({ kart, impact }) => { if (kart === this.target) this.addShake(clamp(impact / 28, 0.12, 0.55)); });
    on(EV.BUMP, ({ a, b, impact }) => { if (a === this.target || b === this.target) this.addShake(clamp(impact / 32, 0.1, 0.4)); });
    on(EV.LAND, ({ kart, impact }) => { if (kart === this.target) { this.addShake(clamp(impact / 45, 0.08, 0.3)); this.dip = Math.min(0.55, this.dip + impact * 0.018); } });
    on(EV.ITEM_HIT, ({ victim }) => { if (victim === this.target) this.addShake(0.65); });
    on(EV.SPIN_OUT, ({ kart }) => { if (kart === this.target) this.addShake(0.4); });
    on(EV.LAUNCH, ({ kart }) => { if (kart === this.target) this.addShake(0.6); });
    on(EV.RESPAWN_DONE, ({ kart }) => { if (kart === this.target) this.settle = 0.8; });
    on(EV.BOOST, ({ kart, source, strength }) => {
      if (kart !== this.target) return;
      const k = source === 'drift' ? 0.55 : source === 'trick' ? 0.6 : source === 'pad' ? 0.85 : 1;
      this.boostKick = Math.max(this.boostKick, k * clamp(strength / 0.38, 0.5, 1.2));
      this.addShake(0.1 + 0.08 * k);
    });
  }

  /** The kart being followed: session.cameraTarget (spectating) or the player. */
  get target() { return this.session.cameraTarget ?? this.session.player ?? this.session.karts[0]; }
  get reduced() { return !!this.session.settings?.reducedMotion; }
  addShake(v) { if (this.session.settings?.cameraShake !== false && !this.reduced) this.shake = Math.min(1, this.shake + v); }
  cycleMode() { this.mode = MODE_ORDER[(MODE_ORDER.indexOf(this.mode) + 1) % MODE_ORDER.length]; return this.mode; }
  setMode(m) { if (CAMERA_MODES[m]) { this.mode = m; } return this.mode; }
  /** Jump straight to the chase pose of the current target (after teleports / debug moves). */
  snapToTarget() { this._init = false; }

  update(dt) {
    const s = this.session, k = this.target;
    if (!k) return;
    this.time += dt;
    // settings can change live (settings screen) - follow them unless the player cycled the mode with the key since
    const wanted = s.settings?.cameraMode;
    if (wanted !== this._seenSetting) { this._seenSetting = wanted; if (wanted && CAMERA_MODES[wanted]) this.mode = wanted; }
    const cfg = CAMERA_MODES[this.mode] ?? CAMERA_MODES.chase;
    const phase = s.race?.phase;
    this.boostKick = damp(this.boostKick, 0, 2.2, dt);
    this.dip = damp(this.dip, 0, 7, dt);
    this.shake = Math.max(0, this.shake - dt * 1.9);
    if (this.settle > 0) this.settle = Math.max(0, this.settle - dt);

    if (phase === 'intro') { this.updateIntro(dt, k, cfg); this._wasIntro = true; return; }
    if (this._wasIntro) {
      // intro ended (or was skipped): continue from wherever the camera is, no snap, with a gentle catch-up
      this._wasIntro = false;
      this.yaw = k.heading;
      this.focus.copy(k.position);
      this.settle = 0.9;
      this._init = true;
    }
    if (this._followed !== k) { this._followed = k; this._finishT = 0; if (this._init) this.settle = 0.7; }
    if (!this._init) { this._init = true; this.yaw = k.heading; this.focus.copy(k.position); this.snap(k, cfg); }

    const finished = k.race.finished && (phase === 'finishing' || phase === 'results');
    if (finished) this.updateFinish(dt, k, cfg);
    else this.updateChase(dt, k, cfg);
    this.applyClearance(dt, k);
    this.applyShakeAndRoll(dt, k);
  }

  // ------------------------------------------------------------------ chase
  updateChase(dt, k, cfg) {
    const s = this.session, cam = this.camera;
    const reduced = this.reduced;
    const ratio = clamp(k.speed / k.stats.topSpeed, 0, 1.45);
    const lookBack = !!k.input.lookBack && !k.race.finished;
    this.lookBackBlend = damp(this.lookBackBlend, lookBack ? 1 : 0, 11, dt);

    // yaw: travel direction (plus a bit of the steered heading so it reacts the instant you steer), swung into a drift
    const d = k.drift;
    const base = k.moveYaw + angleDiff(k.heading, k.moveYaw) * 0.6;
    const swing = d.dir !== 0 ? d.angle * 0.45 : 0;
    const respawning = k.respawn.active;
    const targetYaw = (respawning ? k.respawn.yaw : base + swing) + this.lookBackBlend * Math.PI;
    // faster follow when crawling (so reversing / turning on the spot feels tight), looser at speed
    const rate = (this.settle > 0 ? 3.2 : lerp(6.6, 4.6, smoothstep(0.3, 1.1, ratio))) * (respawning ? 0.6 : 1);
    this.yaw = dampAngle(this.yaw, targetYaw, rate, dt);

    // distance / height: speed pulls the camera back, a boost pulls it back further for a moment
    const air = !k.grounded ? clamp(k.airTime * 2, 0, 1) : 0;
    const dist = cfg.dist + cfg.speedDist * smoothstep(0, 1.1, ratio) + (reduced ? 0 : this.boostKick * 1.25) + air * 0.4;
    const height = cfg.height + air * 0.5 - (d.dir !== 0 ? 0.12 : 0) - this.dip;

    // focus: horizontal rigid, vertical smoothed (jumps & landings feel soft, slopes stay glued)
    const f = this.focus;
    f.x = k.position.x; f.z = k.position.z;
    f.y = damp(f.y, k.position.y, k.grounded ? 12 : 4.5, dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const desired = this._tmp.set(f.x - fx * dist, f.y + height, f.z - fz * dist);
    const lag = 1 - Math.exp(-(this.settle > 0 ? 4 : 24) * dt);
    this.pos.lerp(desired, lag);
    const lb = 1 - this.lookBackBlend * 1.7;                                    // look-back: aim at the kart behind us
    const aim = this._tmp2.set(f.x + fx * cfg.look * lb, f.y + cfg.lookUp, f.z + fz * cfg.look * lb);
    this.look.lerp(aim, 1 - Math.exp(-(this.settle > 0 ? 5 : 18) * dt));

    // FOV: speed + boost kick + a touch in drifts
    let fov = cfg.fov;
    if (s.settings?.fovBoost !== false && !reduced) fov += Math.pow(clamp(ratio, 0, 1.4), 1.5) * cfg.speedFov + this.boostKick * 9 + (d.dir !== 0 ? 1.5 : 0);
    this.fov = damp(this.fov, fov, 5, dt);
    this.fovKick = this.boostKick * 9;
    cam.position.copy(this.pos);
  }

  // ------------------------------------------------------------------ finish: orbit the kart that crossed the line
  updateFinish(dt, k, cfg) {
    this._finishT += dt;
    this.orbit += dt * 0.5;
    const f = this.focus;
    f.x = damp(f.x, k.position.x, 8, dt); f.z = damp(f.z, k.position.z, 8, dt); f.y = damp(f.y, k.position.y, 6, dt);
    // ease from the chase yaw into a slow orbit
    const e = smoothstep(0, 1.2, this._finishT);
    const yaw = this.yaw + this.orbit * e;
    const dist = lerp(cfg.dist, cfg.dist * 1.55, e);
    const h = lerp(cfg.height, cfg.height * 0.8, e);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const desired = this._tmp.set(f.x - fx * dist, f.y + h, f.z - fz * dist);
    this.pos.lerp(desired, 1 - Math.exp(-5 * dt));
    this.look.lerp(this._tmp2.set(f.x, f.y + 0.9, f.z), 1 - Math.exp(-9 * dt));
    this.fov = damp(this.fov, cfg.fov - 2, 4, dt);
    this.camera.position.copy(this.pos);
    // left / right cycles through the other karts while the race wraps up
    const inp = this.session.app?.input;
    if (inp && (inp.pressed('left') || inp.pressed('right'))) this.cycleTarget(inp.pressed('right') ? 1 : -1);
  }

  /** Spectate the next / previous kart (by race position). Sets session.cameraTarget. */
  cycleTarget(dir = 1) {
    const order = this.session.race?.order ?? this.session.karts;
    if (!order.length) return null;
    const cur = order.indexOf(this.target);
    const next = order[(cur + dir + order.length) % order.length];
    this.session.cameraTarget = next === this.session.player ? null : next;
    return this.target;
  }

  // ------------------------------------------------------------------ clearance: stay above the road, inside the walls
  applyClearance(dt, k) {
    const track = this.session.track;
    if (!track?.project) return;
    const p = this.pos;
    const q = track.project(p, this._q, this._hint);
    this._hint = q.index;
    const minY = q.height + 0.85;
    if (p.y < minY) p.y = minY;
    if (q.wall) {
      const limit = q.halfWidth + q.shoulder - 0.8;
      const over = Math.abs(q.lateral) - limit;
      if (over > 0) {
        const side = q.lateral >= 0 ? 1 : -1;
        p.x -= q.right.x * side * over; p.z -= q.right.z * side * over;
      }
    }
    this.camera.position.copy(p);
  }

  // ------------------------------------------------------------------ shake, roll, aim
  applyShakeAndRoll(dt, k) {
    const cam = this.camera, t = this.time;
    if (this.shake > 0.002) {
      const a = this.shake * this.shake * 0.5;
      cam.position.x += (Math.sin(t * 53.1) + Math.sin(t * 31.7 + 1.3)) * 0.5 * a;
      cam.position.y += (Math.sin(t * 47.9 + 2.1) + Math.sin(t * 27.3 + 0.4)) * 0.5 * a;
      cam.position.z += (Math.sin(t * 41.3 + 4.2) + Math.sin(t * 23.9 + 3.3)) * 0.5 * a;
    }
    // a hair of roll into corners and drifts (never for reduced motion)
    const rollT = this.reduced || this.session.settings?.cameraShake === false ? 0 : -(k.steerVisual * 0.018 + k.drift.dir * 0.016) * clamp(k.speed / k.stats.topSpeed, 0, 1) + (this.shake > 0.002 ? Math.sin(t * 37.7) * this.shake * 0.02 : 0);
    this.roll = damp(this.roll, rollT, 6, dt);
    cam.up.copy(UP);
    cam.lookAt(this.look);
    if (Math.abs(this.roll) > 1e-4) {
      // rotate the up vector about the view axis
      const axis = this._tmp3.copy(this.look).sub(cam.position).normalize();
      cam.up.applyAxisAngle(axis, this.roll);
      cam.lookAt(this.look);
    }
    if (Math.abs(cam.fov - this.fov) > 0.005) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  snap(k, cfg) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.focus.copy(k.position);
    this.pos.set(k.position.x - fx * cfg.dist, k.position.y + cfg.height, k.position.z - fz * cfg.dist);
    this.look.set(k.position.x + fx * cfg.look, k.position.y + cfg.lookUp, k.position.z + fz * cfg.look);
    this.fov = cfg.fov;
    this.camera.position.copy(this.pos);
  }

  // ------------------------------------------------------------------ intro: a crane shot over the grid that lands exactly on the chase pose
  /**
   * Quadratic-Bezier fly-through of three track-relative keyframes (all expressed around the player's grid slot so it works on
   * any course): high and wide on the left of the pack looking down the course, then down beside the pack, then the exact
   * chase pose behind the player's kart.  The last keyframe is computed with the same numbers the chase camera uses at standstill.
   */
  updateIntro(dt, k, cfg) {
    const s = this.session, cam = this.camera, race = s.race, track = s.track;
    const u = clamp(race.phaseTime / Math.max(0.01, race.introDuration), 0, 1);
    const e = u * u * u * (u * (u * 6 - 15) + 10);               // smootherstep: zero velocity at both ends
    this._smp ??= track.sampleAt(0);
    const smp = track.sampleAt(k.query.s, this._smp);
    const T = this._a.copy(smp.tangent).setY(0).normalize();     // flatten so "ahead" is horizontal
    const R = this._b.set(-T.z, 0, T.x);                         // right-hand vector (horizontal): right(yaw) = (-cos, 0, sin)
    const P = k.position;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    // keyframe positions (camera) and aim points
    const c0 = this._c.copy(P).addScaledVector(R, -30).addScaledVector(T, -34); c0.y += 34;
    const c1 = this._tmp.copy(P).addScaledVector(R, -13).addScaledVector(T, -21); c1.y += 11;
    const c2 = this._tmp2.set(P.x - fx * cfg.dist, P.y + cfg.height, P.z - fz * cfg.dist);
    const a0 = this._la.copy(P).addScaledVector(T, 70); a0.y += 1;
    const a1 = this._lb.copy(P).addScaledVector(T, 26); a1.y += 1.2;
    const a2 = this._lc.set(P.x + fx * cfg.look, P.y + cfg.lookUp, P.z + fz * cfg.look);
    bezier3(this.pos, c0, c1, c2, e);
    bezier3(this.look, a0, a1, a2, e);
    cam.position.copy(this.pos);
    this.fov = lerp(44, cfg.fov, smoothstep(0, 1, e));
    cam.up.copy(UP);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.005) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.yaw = k.heading;
    this.focus.copy(P);
    this._init = false;
  }
}

/** Quadratic Bezier that passes through `mid` at t = 0.5 (control point derived from the three keyframes). */
function bezier3(out, p0, mid, p2, t) {
  const cx = 2 * mid.x - 0.5 * (p0.x + p2.x), cy = 2 * mid.y - 0.5 * (p0.y + p2.y), cz = 2 * mid.z - 0.5 * (p0.z + p2.z);
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return out.set(a * p0.x + b * cx + c * p2.x, a * p0.y + b * cy + c * p2.y, a * p0.z + b * cz + c * p2.z);
}
