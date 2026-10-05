// One AI racer (kart.ext.ai).  Human-like driving on ANY track using only the Track API + kart state:
//   perception   neighbours (ahead/behind/alongside), traps on the road, item boxes, boost pads, coins
//   planning     lateral target = racing line (+personal lane, wander) with overrides: hazard dodge > overtake/avoid > pads/boxes/coins
//   control      pure-pursuit steering with speed-scheduled gain and hand lag; speed from a braking-aware corner profile
//   drifting     opens on long corners, modulates the drift's turn rate to stay on the line, releases at the exit for the mini-turbo
//   humanity     class/driver-dependent mistakes, perception chance, imperfect lines, rubber-band catch-up
//   safety       stuck detection -> reverse / U-turn -> physics.respawnKart; wall + edge awareness
// Randomness: session.random() only (a seed reproduces the race).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, angleDiff, wrapAngle, wrapS, TAU } from '../core/math.js';
import { SURFACE_PROPS } from '../track/surfaces.js';
import { TrackSample } from '../track/SplineTrack.js';
import { RUBBER } from './tuning.js';
import { AIItems } from './AIItems.js';
import { DriveModel } from './driveModel.js';

const KART_HALF_W = 1.25;
const COIN_SPEED = 0.012;      // top-speed bonus per coin (physics: kart.coins * 1.2 %)

export class AIDriver {
  constructor(mgr, kart) {
    this.mgr = mgr; this.k = kart; this.session = mgr.session; this.track = mgr.track;
    const T = this.T = mgr.tuning;
    const rnd = () => this.session.random();
    const persona = kart.driver?.personality ?? { aggression: 0.5, boldness: 0.5 };
    const st = kart.driver?.stats ?? { speed: 3, accel: 3, handling: 3, weight: 3, drift: 3 };
    this.persona = { aggression: clamp(persona.aggression * T.aggression, 0, 1.2), boldness: persona.boldness };
    // --- skill & pace (compressed so a class's lap times stay within a few percent)
    const u = rnd();
    this.skill = clamp(T.skill + (rnd() - 0.5) * 0.24 + ((st.drift + st.handling) / 2 - 3) * 0.05, 0.05, 1);
    const mid = (T.pace[0] + T.pace[1]) / 2, half = ((T.pace[1] - T.pace[0]) / 2) * T.paceSpread * 2;
    this.pace = mid + (u - 0.5) * half * 2 * 0.5 + (this.skill - T.skill) * 0.05;
    this.cornerScale = T.cornerScale * (0.96 + 0.08 * this.persona.boldness);
    this.limitFrac = clamp((T.limit ?? 0.9) * (0.98 + 0.04 * this.persona.boldness), 0.5, 1);      // share of the engine's full-lock corner speed
    this.driftProb = clamp(T.driftProb * (0.8 + 0.4 * (st.drift / 5)), 0, 1);
    this.laneBias = (rnd() - 0.5) * 0.5 + (this.persona.boldness - 0.5) * 0.15;   // fraction of half-width
    this.wander = { f1: 0.25 + rnd() * 0.3, f2: 0.6 + rnd() * 0.5, p1: rnd() * TAU, p2: rnd() * TAU, amp: 0.35 + (1 - this.skill) * 0.9 };
    this.noise = { f1: 1.1 + rnd(), f2: 2.3 + rnd(), p1: rnd() * TAU, p2: rnd() * TAU };
    // --- dynamic state
    this.latCmd = kart.query?.lateral ?? 0;       // smoothed lateral target (m)
    this.steer = 0; this.prevHeading = kart.heading; this.yawRate = 0;
    this.pass = { side: 0, timer: 0 };
    this.shove = { cool: 1 + rnd() * 3, t: 0, dir: 0 };
    this.mistake = { kind: '', t: 0, mag: 0, cool: 3 + rnd() * 6 };
    this.dr = { phase: 'idle', t: 0, plan: null, latchS: null, dir: 0, cool: 0, hold: 0, wantEnd: 0 };
    this.recover = { mode: 'none', timer: 0, slowT: 0, tries: 0, lastTry: -99 };
    this.seen = new Map();            // hazard id -> perceived?
    this.padPick = new Map();
    this.scanT = rnd() * 0.2;
    this.coinLat = 0; this.coinW = 0;
    this.boxLat = 0; this.boxW = 0;
    this.near = { ahead: null, aheadDs: 1e9, aheadDl: 0, behind: null, behindDs: -1e9, behindDl: 0, blocker: null, blockDs: 1e9, blockDl: 0 };
    this.stats = { drifts: 0, driftBoosts: 0, mistakes: 0, recoveries: 0, respawns: 0, dodges: 0, passes: 0, hazardHits: 0 };
    this.vTarget = 0; this.pacing = 1; this.finishedCruise = false;
    this.avoid = null;                               // committed trap dodge: { e: entity, side: -1|1 }
    this.jump = { active: false, ds: 0, need: 0, toEnd: 0 };   // the ramp-over-gap we are approaching (see AIManager.jumpAhead)
    this.hz = { active: false, ds: 0, shift: 0 };    // the trap we are dodging right now (read by the drift logic: a drift cannot swerve)
    this.dm = new DriveModel(this.session);          // what the engine can tell us about steering limits (with baseline fallbacks)
    this._rg = { min: 0, neutral: 0, max: 0 };       // drift yaw-rate range scratch
    this._smp = new TrackSample(); this._p = new THREE.Vector3();
    this.items = new AIItems(this);
    this.t = rnd() * 20;
  }

  // =================================================================================================================
  update(dt) {
    const k = this.k, inp = k.input, track = this.track, P = this;
    this.t += dt;
    const q = k.query;
    // before GO / while respawning / spinning the physics ignores us: stay neutral and keep our smoothing in sync
    if (k.respawn.active || k.locked || k.spin.timer > 0) {
      inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.lookBack = false; inp.item = false;
      this.steer = 0; this.dr.phase = 'idle'; this.dr.plan = null; this.prevHeading = k.heading;
      this.latCmd = q.lateral; this.recover.slowT = 0;
      if (k.spin.timer > 0 || k.respawn.active) this.recover.mode = 'none';
      this.items.update(dt, null);
      return;
    }
    const s = q.s, lat = q.lateral, hw = q.halfWidth;
    const v = k.speed, top = k.stats.topSpeed;
    const finished = k.race.finished;
    this.finishedCruise = finished;
    // yaw rate (smoothed) for damping
    const yr = angleDiff(k.heading, this.prevHeading) / Math.max(dt, 1e-3);
    this.yawRate += (yr - this.yawRate) * Math.min(1, dt * 18);
    this.prevHeading = k.heading;

    this.scan(dt, s, lat, v);

    // ---------------------------------------------------------------- recovery (stuck / facing the wrong way)
    const trackYaw = Math.atan2(q.tangent.x, q.tangent.z);
    const headErr = angleDiff(trackYaw, k.heading);
    if (this.runRecovery(dt, v, headErr, finished)) { this.items.update(dt, null); return; }

    // ---------------------------------------------------------------- lateral plan + steering
    const drifting = k.drift.dir !== 0;
    const Ld = clamp(4.5 + Math.max(0, v) * 0.34 + (drifting ? 3 : 0), 7, 25);
    const latT = this.planLateral(dt, s, lat, v, Ld, hw, finished);
    this.latCmd += clamp(latT - this.latCmd, -this.latRate * dt, this.latRate * dt);
    // sidestepping a trap needs a sharp, early turn-in: aim at a nearer point of the new line (a long look-ahead is lazy)
    const LdA = this.hz.active ? clamp(this.hz.ds * 0.5, 6.5, Ld) : Ld;
    const aim = track.pointAt(s + LdA, this.latCmd, this._p, 0);
    const desired = Math.atan2(aim.x - k.position.x, aim.z - k.position.z);
    let e = angleDiff(desired, k.heading);
    const surf = SURFACE_PROPS[q.surface] ?? SURFACE_PROPS[0];
    const kp = lerp(3.3, 2.15, smoothstep(8, 36, Math.abs(v))) * (surf.grip < 0.5 ? 0.8 : 1);
    let steer = clamp(-kp * e, -1, 1);

    // ---------------------------------------------------------------- speed profile
    // coins (+1.2 % each) and the slipstream raise the kart's real top speed; the cruise speed has to follow or the bonus is braked away
    const topNow = top * (1 + COIN_SPEED * (k.coins || 0) + (k.draft?.bonus ?? 0));
    const boosting = k.boost.timer > 0;
    let vCruise = finished ? top * 0.62 : (boosting ? topNow * (1 + k.boost.strength) : topNow * this.pacing);
    if (k.rocket > 0) vCruise = top * 1.5;
    if (k.ink > 0) vCruise *= 0.88;
    let vAllowed = this.speedProfile(s, v, top, drifting);
    if (k.rocket > 0) vAllowed = Math.max(vAllowed * 1.5, top * 0.9);
    if (surf.grip < 0.4) vAllowed = Math.min(vAllowed, top * 0.74);     // ice
    if (!q.onRoad && !boosting) vAllowed = Math.min(vAllowed, top * 0.7);
    let vTarget = Math.min(vCruise, vAllowed);
    // a ramp over a gap: the speed that clears it beats corners, class pace and traffic (a kart that falls in loses far more)
    const jump = this.jump;
    if (!finished && this.mgr.jumpAhead(s, jump)) {
      vTarget = Math.max(vTarget, Math.min(jump.need, top * 1.3));
      this.mistake.t = 0; this.mistake.kind = ''; this.mistake.cool = Math.max(this.mistake.cool, 1.5);
    }
    // follow a slow kart we can't get around instead of ramming it
    const nb = this.near;
    if (!jump.active && nb.blocker && nb.blockDs < 9 && Math.abs(nb.blockDl) < 2.1 && this.pass.side === 0) vTarget = Math.min(vTarget, Math.max(4, nb.blocker.speed - 0.5 + nb.blockDs * 0.25));
    this.vTarget = vTarget;

    // ---------------------------------------------------------------- drifting
    let wantDrift = false;
    if (!finished && k.rocket <= 0) {
      const r = this.driftControl(dt, s, lat, v, top, e, kp);
      wantDrift = r.drift;
      if (r.steer !== null) steer = r.steer;
    } else { this.dr.phase = 'idle'; }

    // ---------------------------------------------------------------- human hands: mistakes, noise, lag
    steer = this.humanize(dt, steer, v);
    const rate = this.T.steerLag * (drifting ? 1.3 : 1);
    this.steer += clamp(steer - this.steer, -rate * dt, rate * dt);
    inp.steer = clamp(this.steer, -1, 1);

    let throttle, brake = 0;
    const dv = vTarget - v;
    if (this.mistake.kind === 'lift') throttle = 0;
    else if (dv > 0.6) throttle = 1;
    else if (dv < -0.5) throttle = 0;
    else throttle = clamp(0.55 + dv * 0.8, 0, 1);
    if (v > vTarget * 1.04 + 0.8 && !drifting) brake = clamp((v - vTarget) / (0.22 * top), 0.25, 1);
    if (v > vTarget * 1.25 + 2 && drifting) throttle = 0;
    inp.throttle = throttle; inp.brake = brake;
    inp.drift = wantDrift; inp.lookBack = false; inp.item = false;

    this.items.update(dt, headErr);
  }

  // =================================================================================================================
  // perception: nearest kart ahead/behind, the blocker we have to get around, plus box/pad/coin attractors
  scan(dt, s, lat, v) {
    const near = this.near, track = this.track, k = this.k;
    near.ahead = null; near.aheadDs = 1e9; near.behind = null; near.behindDs = -1e9; near.blocker = null; near.blockDs = 1e9;
    const dmax = 9 + clamp(v - 8, 0, 30) * 0.5;
    for (const o of this.session.karts) {
      if (o === k || o.respawn.active) continue;
      const ds = track.deltaS(s, o.query.s), dl = o.query.lateral - lat;
      if (ds >= 0) {
        if (ds < near.aheadDs) { near.ahead = o; near.aheadDs = ds; near.aheadDl = dl; }
        if (ds > 0.5 && ds < dmax + 6 && Math.abs(dl) < 3.4 && ds < near.blockDs) { near.blocker = o; near.blockDs = ds; near.blockDl = dl; }
      } else if (ds > near.behindDs) { near.behind = o; near.behindDs = ds; near.behindDl = dl; }
    }
    // coarse attractors every ~0.18 s
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.18; this.scanAttractors(s, lat, v); }
  }

  scanAttractors(s, lat, v) {
    const items = this.session.items, track = this.track, k = this.k, T = this.T;
    this.boxW = 0; this.coinW = 0;
    if (!items) return;
    // item boxes: only when we have nothing in hand
    if (!k.item.type && !k.item.roulette.active && items.boxField?.enabled) {
      let best = null, bd = 1e9;
      for (const b of items.boxes) {
        if (!b.active || b.pop < 0.9) continue;
        const ds = track.deltaS(s, b.def.s);
        if (ds < 7 || ds > 38 + v) continue;
        const dl = b.def.lateral - lat;
        if (Math.abs(dl) > 6.5 || ds + Math.abs(dl) * 2 > bd) continue;
        bd = ds + Math.abs(dl) * 2; best = b;
      }
      if (best) { this.boxLat = best.def.lateral; this.boxW = clamp(T.boxSkill, 0, 1); }
    }
    // coins
    if (k.coins < 10 && items.coinField && T.coinSkill > 0.2) {
      let best = null, bd = 1e9;
      for (const c of items.coinField.coins) {
        if (!c.active) continue;
        const ds = track.deltaS(s, c.s);
        if (ds < 3 || ds > 26) continue;
        const dl = c.lateral - lat;
        if (Math.abs(dl) > 2.6 || ds > bd) continue;
        bd = ds; best = c;
      }
      if (best) { this.coinLat = best.lateral; this.coinW = T.coinSkill * 0.8; }
    }
  }

  // =================================================================================================================
  // lateral planning
  planLateral(dt, s, lat, v, Ld, hw, finished) {
    const track = this.track, k = this.k, T = this.T, near = this.near;
    const sL = s + Ld;
    const smp = track.sampleAt(sL, this._smp);
    const hwL = smp.halfWidth;
    const q = k.query;
    const edgeOpen = !q.wall;                       // no wall on this side: keep further from the edge
    const margin = KART_HALF_W + 0.55 + (edgeOpen ? 1.6 : 0);
    const maxLat = Math.max(0.8, hwL - margin);
    // base: racing line (skill-weighted) + personal lane + slow wander
    let target = track.lineOffsetAt(sL) * T.lineWeight * this.mgr.lineGain + this.laneBias * hwL * 0.7;
    const w = this.wander;
    target += (Math.sin(this.t * w.f1 + w.p1) + 0.6 * Math.sin(this.t * w.f2 + w.p2)) * 0.5 * w.amp * (v > 5 ? 1 : 0.3);
    let rate = 5.5;
    // item boxes / coins
    if (this.boxW > 0) target = lerp(target, this.boxLat, this.boxW * 0.8);
    else if (this.coinW > 0) target = lerp(target, this.coinLat, this.coinW);
    // boost pads
    const pad = this.padTarget(s, lat, v);
    if (pad) target = lerp(target, pad.lat, pad.w);
    // overtaking / separation
    const ov = this.overtakeTarget(dt, s, lat, v, hw);
    if (ov) { target = lerp(target, ov.lat, ov.w); rate = Math.max(rate, 6.5); }
    // traps on the road
    const hz = this.hazardTarget(s, lat, target, v, hw);
    if (hz) { target = hz.lat; rate = 14; }
    // mistakes: drift wide
    const m = this.mistake;
    if (m.kind === 'wide') target += Math.sign(target || (lat >= 0 ? 1 : -1)) * m.mag * hwL * 0.35;
    // wall scrape / off-road: head back to the middle
    if (k.scraping) target = lerp(target, 0, 0.5);
    if (!q.onRoad) { target = Math.sign(lat) * hwL * 0.45; rate = 9; }
    this.latRate = rate;
    return clamp(target, -maxLat, maxLat);
  }

  padTarget(s, lat, v) {
    const pads = this.track.boostPads;
    if (!pads || !pads.length) return null;
    const L = this.track.length;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      let a = p.s0 - s; if (a < -L / 2) a += L; else if (a > L / 2) a -= L;
      if (a < 2 || a > 44 + v * 0.6) continue;
      const lapKey = `${i}:${Math.floor(this.k.race.distance / L)}`;
      let take = this.padPick.get(lapKey);
      if (take === undefined) { take = this.session.random() < this.T.padSkill; this.padPick.set(lapKey, take); }
      if (!take) continue;
      const centre = (p.l0 + p.l1) / 2;
      if (Math.abs(centre - lat) > 7.5) continue;
      return { lat: centre, w: clamp(1.1 - a / 55, 0.35, 1) };
    }
    return null;
  }

  overtakeTarget(dt, s, lat, v, hw) {
    const near = this.near, pass = this.pass, track = this.track, k = this.k, persona = this.persona;
    pass.timer -= dt;
    const b = near.blocker;
    let out = null;
    if (b) {
      const room = (side) => (side < 0 ? lat + hw - 1.8 : hw - 1.8 - lat);     // metres available toward `side` (-1 = left)
      if (pass.timer <= 0 || pass.side === 0) {
        let side = near.blockDl > 0.5 ? -1 : near.blockDl < -0.5 ? 1 : (this.laneBias > 0 ? -1 : 1);
        if (room(side) < 3.2 && room(-side) > room(side)) side = -side;
        if (pass.side !== side) this.stats.passes++;
        pass.side = side; pass.timer = 1.2;
      }
      const tl = b.query.lateral + pass.side * 3.5;
      const close = 1.15 - near.blockDs / (10 + clamp(v - b.speed, 0, 25));
      out = { lat: tl, w: clamp(close, 0.35, 1) };
    } else if (pass.timer <= 0) pass.side = 0;
    // alongside: keep a lane's width apart (unless this driver is in a shoving mood)
    const a = near.ahead, bh = near.behind;
    for (const o of [a, bh]) {
      if (!o) continue;
      const ds = track.deltaS(s, o.query.s), dl = o.query.lateral - lat;
      if (Math.abs(ds) > 4.6 || Math.abs(dl) > 3.4) continue;
      const sh = this.shove;
      sh.cool -= dt;
      if (persona.aggression > 0.75 && sh.cool <= 0 && !k.race.finished && Math.abs(dl) < 3.4 && this.session.random() < 0.02) { sh.t = 0.7; sh.cool = 2.5 + this.session.random() * 4; sh.dir = Math.sign(dl) || 1; }
      if (sh.t > 0) { sh.t -= dt; out = { lat: o.query.lateral - sh.dir * 1.2, w: 0.85 }; }
      else out = { lat: o.query.lateral - (Math.sign(dl) || (lat >= 0 ? 1 : -1)) * 3.6, w: 0.7 };
      break;
    }
    return out;
  }

  /**
   * Traps on the road (peels, bombs).  A driver that has noticed one commits to a side and keeps to it until the trap is behind
   * (no flip-flopping when the racing line wanders back toward it).  Whether it notices at all is rolled once per trap (class perceive).
   */
  hazardTarget(s, lat, planned, v, hw) {
    const hz = this.hz; hz.active = false;
    const items = this.session.items;
    if (!items) { this.avoid = null; return null; }
    const track = this.track;
    let c = this.avoid;
    if (c && (c.e.dead || track.deltaS(s, c.e.s) < -2.5)) c = this.avoid = null;
    if (!c && items.entities.length) {
      let best = null, bestDs = 1e9;
      for (const e of items.entities) {
        if (!e.hazard || e.kind === 'projectile') continue;
        const ds = track.deltaS(s, e.s);
        const reach = (e.type === 'bomb' ? 26 : 19) + Math.max(0, v) * 0.85;
        if (ds < 1.5 || ds > reach || ds > bestDs) continue;
        let seen = this.seen.get(e.id);
        if (seen === undefined) { seen = this.session.random() < this.T.perceive; this.seen.set(e.id, seen); if (this.seen.size > 80) this.seen.delete(this.seen.keys().next().value); }
        if (!seen) continue;
        const clear = (e.type === 'bomb' ? 4.6 : e.radius + 2.0);
        // would we get near it?  our lane now, or where the plan takes us by the time we get there
        const there = lat + (planned - lat) * clamp(ds / 20, 0, 1);
        if (Math.min(Math.abs(e.lat - lat), Math.abs(e.lat - there)) > clear + 0.5) continue;
        best = e; bestDs = ds;
      }
      if (best) { c = this.avoid = { e: best, side: 0 }; this.stats.dodges++; }
    }
    if (!c) return null;
    const e = c.e, lim = hw - 1.6, clear = (e.type === 'bomb' ? 4.9 : e.radius + 2.4);
    // pass on the side we are already on (hazard to our right -> go left of it); flip once if that side has no room
    if (c.side === 0) c.side = lat >= e.lat ? 1 : -1;
    let tl = e.lat + c.side * clear;
    if (Math.abs(tl) > lim + 0.3 && Math.abs(e.lat - c.side * clear) <= lim + 0.3) { c.side = -c.side; tl = e.lat + c.side * clear; }
    tl = clamp(tl, -lim, lim);
    hz.active = true; hz.ds = track.deltaS(s, e.s); hz.shift = Math.abs(tl - lat);
    return { lat: tl };
  }

  // =================================================================================================================
  // speed: braking-aware corner profile (the engine's real corner limit when it can tell us, combined with the track's maxSpeedAt hint)
  speedProfile(s, v, top, drifting) {
    const track = this.track, k = this.k, plan = this.dr.plan, dm = this.dm;
    const aB = this.T.brakeDecel * (0.9 + 0.2 * this.skill);
    const native = dm.caps.corner;
    // baseline engine: our own yaw-rate model at the current speed
    const auth = 1 - 0.3 * smoothstep(0.55 * top, 1.15 * top, Math.abs(v));
    const omega = k.stats.steerRate * auth * 0.74 * this.cornerScale;
    const hor = clamp(v * v / (2 * aB) + 24 + v * 0.45, 40, 160);
    let vAllowed = 1e9;
    for (let d = 0; d <= hor; d += 6 + d * 0.12) {
      const sd = s + d;
      const kappa = Math.abs(track.curvatureAt(sd));
      // a corner we intend to drift (or are drifting) can be taken faster: the drift's turn-rate range is higher
      const dg = drifting || (plan && track.deltaS(plan.s0 - 8, sd) >= 0 && track.deltaS(sd, plan.s1) >= 0) ? 1.35 : 1;
      let own = 1e9;
      if (native) { if (kappa > 0.003) own = dm.cornerSpeed(k, kappa, dg > 1) * this.limitFrac * (dg > 1 ? 0.95 : 1); }
      else if (kappa > 1e-4) own = (omega * dg) / kappa;
      const hint = track.maxSpeedAt(sd) * this.cornerScale * dg;
      const vc = Math.min(own, hint);
      const va = Math.sqrt(vc * vc + 2 * aB * d);
      if (va < vAllowed) vAllowed = va;
    }
    return Math.max(vAllowed, 6);
  }

  // =================================================================================================================
  // drifting
  driftControl(dt, s, lat, v, top, e, kp) {
    const k = this.k, d = k.drift, dr = this.dr, track = this.track, T = this.T, dm = this.dm;
    const out = this._dOut ?? (this._dOut = { drift: false, steer: null });
    out.drift = false; out.steer = null;
    dr.cool -= dt;
    const surf = SURFACE_PROPS[k.query.surface] ?? SURFACE_PROPS[0];
    const ok = k.grounded && k.spin.timer <= 0 && v > top * 0.55 && surf.grip >= 0.75 && k.query.onRoad;                 // may START a drift
    const okHold = k.spin.timer <= 0 && v > top * 0.4 && surf.grip >= 0.5 && k.query.offset < 1.5;                      // may KEEP one (the hop is airborne)
    // plan the next corner once (the latch holds until we have passed it)
    if (dr.plan && track.deltaS(s, dr.plan.s1) < -14) dr.plan = null;
    if (dr.phase === 'idle' && dr.cool <= 0 && this.driftProb > 0.02 && !k.race.finished && (dr.latchS === null || track.deltaS(s, dr.latchS) <= 0)) this.planDrift(s, v, top);

    const jumpNear = this.jump.active && this.jump.ds < 70;          // never hop / drift into a jump
    if (d.dir !== 0) {
      // ------------------------------------------------ in a drift: hold, steer the arc, release at the exit
      if (dr.phase !== 'active') { dr.phase = 'active'; dr.t = 0; dr.dir = d.dir; this.stats.drifts++; dr.hold = T.driftHold ? T.driftHold[0] + this.session.random() * (T.driftHold[1] - T.driftHold[0]) : 1e9; dr.wantEnd = 0; }
      dr.t += dt;
      const turnSide = -d.dir;                          // +1 = left turn
      const eTurn = e * turnSide;                       // >0: the target is on the side we are turning to
      // A drift turns the heading at a rate the stick can only modulate inside [min, max] (against .. into the drift).
      // Pick the turn rate that closes the pursuit error and let the engine (or the baseline mapping) find the stick for it.
      const rg = dm.driftRange(k, Math.max(v, 8), this._rg);
      out.steer = dm.stick(k, turnSide * clamp(4.6 * eTurn, rg.min, rg.max));
      out.drift = true;
      // look ahead to decide when the corner is over
      const bendNext = Math.abs(this.bend(s + 3, s + 3 + 26));
      const kapNow = track.curvatureAt(s + 5);
      const signOk = kapNow * turnSide > -0.002;
      if (eTurn < -0.12) dr.wantEnd += dt; else dr.wantEnd = Math.max(0, dr.wantEnd - dt);
      const exit = bendNext < 0.16 && Math.abs(kapNow) < 0.0055;
      const charged = d.level >= 3 && bendNext < 0.35;
      // a drift cannot swerve (it only turns one way): let go when a trap needs a bigger sidestep than the drift can deliver
      const swerve = this.hz.active && this.hz.shift > 1.4 && this.hz.ds < 11 + v * 0.45 && eTurn < 0.25;
      if (exit || charged || swerve || jumpNear || !signOk || dr.wantEnd > 0.3 || dr.t > dr.hold || !okHold) { out.drift = false; dr.phase = 'release'; dr.cool = 0.5; if (d.level > 0) this.stats.driftBoosts++; }
      return out;
    }
    // ------------------------------------------------ not drifting
    if (dr.phase === 'active' || dr.phase === 'release') { dr.phase = 'idle'; dr.cool = Math.max(dr.cool, 0.35); }
    if (dr.phase === 'arming') {
      dr.t += dt;
      out.drift = true;
      out.steer = clamp(Math.sign(dr.dir) * 0.6, -1, 1);          // enough stick for the engine to commit the drift direction
      if (dr.t > 0.55 || !okHold) { dr.phase = 'idle'; dr.cool = 1.0; out.drift = false; out.steer = null; }
      return out;
    }
    // a planned corner: press the drift button just before its entry
    const plan = dr.plan;
    if (!ok || !plan || dr.cool > 0 || jumpNear) return out;
    const lead = 3 + v * 0.1;
    const toEntry = track.deltaS(s, plan.s0) - lead;
    if (toEntry > 0 || track.deltaS(s, plan.s1) < 12) return out;
    dr.phase = 'arming'; dr.t = 0; dr.dir = plan.dir;
    out.drift = true; out.steer = dr.dir * 0.6;
    return out;
  }

  /**
   * Look for the next corner worth drifting.  A corner qualifies when the turn rate it needs at (near) full speed lies inside
   * the range a drift can hold (the engine's driftYawRange, or the baseline model), it is a real bend (>= ~30 deg), lasts long
   * enough to be worth a mini-turbo and the driver feels like it (class driftProb).  Decided once per corner (dr.latchS).
   */
  planDrift(s, v, top) {
    const track = this.track, dr = this.dr, dm = this.dm, k = this.k;
    const W = clamp(Math.max(v, top * 0.7) * 2.6, 70, 160);
    let peak = 0, dPeak = 0;
    for (let d = 8; d <= W; d += 5) { const kk = track.curvatureAt(s + d); if (Math.abs(kk) > Math.abs(peak)) { peak = kk; dPeak = d; } }
    if (Math.abs(peak) < 0.0075) return;                     // nothing worth a drift in sight yet
    const ap = Math.abs(peak);
    // the corner is still rising at the edge of our view: wait until we can see its peak
    if (dPeak >= W - 8 && Math.abs(track.curvatureAt(s + W)) >= 0.85 * ap && W < 160) return;
    const dbg = dr.dbg ?? (dr.dbg = { s: 0, peak: 0, need: 0, why: '' });
    dbg.s = Math.round(s); dbg.peak = peak; dbg.why = '';
    let dEntry = 8; for (let d = 0; d <= dPeak; d += 4) if (Math.abs(track.curvatureAt(s + d)) >= 0.5 * ap) { dEntry = d; break; }
    let dEnd = dPeak; for (let d = dPeak; d <= dPeak + 130; d += 5) { dEnd = d; const kk = track.curvatureAt(s + d); if (Math.abs(kk) < 0.35 * ap || kk * peak < 0) break; }
    dr.latchS = wrapS(s + dEnd + 12, track.length);          // do not re-plan until this corner is behind us
    // the speed we expect to carry through it: our speed, held back by the track's own corner hint
    const vHint = track.maxSpeedAt(s + dPeak) * this.cornerScale * 1.2;
    const vRef = Math.min(clamp(Math.max(v, top * 0.8), 0, top), Math.max(vHint, top * 0.5));
    const need = ap * vRef;
    dbg.need = need;
    const rg = dm.driftRange(k, vRef, this._rg);
    if (need < rg.min * (dm.native ? 1.4 : 1.11) || need > rg.max * 0.92) { dbg.why = 'rate'; return; }
    const H = this.bend(s + dEntry, s + dEnd);
    if (Math.abs(H) < 0.52 || H * peak < 0) { dbg.why = 'bend'; return; }
    const dur = (dEnd - dEntry) / vRef;
    if (dur < 0.9) { dbg.why = 'short'; return; }
    // is it worth it?  expected charge = duration * charge rate (stick into the drift charges faster) - at least a blue mini-turbo
    const along = dm.alongFor(need, rg);
    if (dur * (k.stats.miniTurbo ?? 1) * dm.chargeFactor(along) < 0.72) { dbg.why = 'charge'; return; }
    if (this.session.random() > this.driftProb) { dbg.why = 'prob'; return; }
    dbg.why = 'PLAN';
    dr.plan = { s0: wrapS(s + dEntry, track.length), s1: wrapS(s + dEnd, track.length), dir: peak > 0 ? -1 : 1 };
  }

  /** Signed heading change (rad, + = left) between two arc-length positions. */
  bend(s0, s1) {
    const a = this.track.sampleAt(s0, this._smp).yaw;
    const b = this.track.sampleAt(s1, this._smp).yaw;
    return wrapAngle(b - a);
  }

  // =================================================================================================================
  // human imperfection
  humanize(dt, steer, v) {
    const m = this.mistake, T = this.T, n = this.noise;
    // steering wobble: smaller for better drivers
    const amp = (1 - this.skill) * 0.07 + 0.008;
    steer += (Math.sin(this.t * n.f1 * 3 + n.p1) + Math.sin(this.t * n.f2 * 3 + n.p2)) * 0.5 * amp * (v > 8 ? 1 : 0.2);
    if (this.k.ink > 0) steer += Math.sin(this.t * 7 + n.p1) * 0.22;
    if (m.t > 0) {
      m.t -= dt;
      if (m.kind === 'oversteer') steer = clamp(steer * (1 + 0.7 * m.mag), -1, 1);
      if (m.t <= 0) { m.kind = ''; m.cool = 4 + this.session.random() * 8; }
    } else {
      m.cool -= dt;
      if (m.cool <= 0 && !this.k.race.finished && v > 10) {
        const kap = Math.abs(this.track.curvatureAt(this.k.query.s + 8));
        const rate = T.mistakeRate * (kap > 0.01 ? 4 : 1) * (1.15 - this.skill * 0.5);
        if (this.session.random() < rate * dt * 4) {
          const r = this.session.random();
          m.kind = r < 0.4 ? 'wide' : r < 0.7 ? 'lift' : 'oversteer';
          m.t = m.kind === 'lift' ? 0.45 + this.session.random() * 0.4 : 0.8 + this.session.random() * 0.7;
          m.mag = 0.5 + this.session.random() * 0.6;
          this.stats.mistakes++;
        } else m.cool = 0.25;
      }
    }
    return steer;
  }

  // =================================================================================================================
  // stuck detection and recovery.  Returns true when it took over the controls.
  runRecovery(dt, v, headErr, finished) {
    const k = this.k, inp = k.input, R = this.recover, now = this.session.time;
    const slow = Math.abs(v) < 2.2 && k.grounded;
    R.slowT = slow ? R.slowT + dt : 0;
    if (R.mode === 'none') {
      const facing = Math.abs(headErr);
      if (R.slowT > 1.0 || (facing > 2.0 && Math.abs(v) < 14 && R.slowT > 0.2)) {
        if (now - R.lastTry > 14) R.tries = 0;
        R.tries++; R.lastTry = now;
        this.stats.recoveries++;
        if (R.tries >= 4) { this.stats.respawns++; this.session.physics?.respawnKart?.(k, 'stuck'); R.tries = 0; R.mode = 'none'; R.slowT = 0; return false; }
        // facing the wrong way on open road: turn around going forward; nose in a wall: back out first
        R.mode = facing > 2.0 && R.tries < 3 && R.slowT < 0.9 ? 'uturn' : 'reverse';
        R.timer = R.mode === 'uturn' ? 2.2 : 0.8 + this.session.random() * 0.5;
      }
    }
    if (R.mode === 'none') return false;
    R.timer -= dt;
    const side = headErr >= 0 ? 1 : -1;        // + = the road direction is to our left
    if (R.mode === 'reverse') {
      inp.throttle = 0; inp.brake = 1; inp.drift = false;
      inp.steer = side * (Math.abs(headErr) > 0.3 ? 1 : 0);     // reversing flips steering: +steer swings the nose to the left
      this.steer = inp.steer;
      if (R.timer <= 0 || (v < -3 && Math.abs(headErr) < 0.5)) { R.mode = 'none'; R.slowT = 0; }
    } else {
      inp.throttle = 0.85; inp.brake = 0; inp.drift = false;
      inp.steer = -side;                          // forward: steer -1 turns left (heading +)
      this.steer = inp.steer;
      if (R.timer <= 0 || Math.abs(headErr) < 0.7) { R.mode = 'none'; R.slowT = 0; }
      else if (R.slowT > 0.9) { R.mode = 'reverse'; R.timer = 0.9; }
    }
    inp.item = false; inp.lookBack = false;
    return true;
  }

  /** Cruise pace multiplier incl. gentle rubber-banding (computed once per frame by the manager). */
  setPacing(p) { this.pacing = p; }
}
