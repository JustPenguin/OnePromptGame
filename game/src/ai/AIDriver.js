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

const KART_HALF_W = 1.25;

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
    const aim = track.pointAt(s + Ld, this.latCmd, this._p, 0);
    const desired = Math.atan2(aim.x - k.position.x, aim.z - k.position.z);
    let e = angleDiff(desired, k.heading);
    const surf = SURFACE_PROPS[q.surface] ?? SURFACE_PROPS[0];
    const kp = lerp(3.3, 2.15, smoothstep(8, 36, Math.abs(v))) * (surf.grip < 0.5 ? 0.8 : 1);
    let steer = clamp(-kp * e, -1, 1);

    // ---------------------------------------------------------------- speed profile
    const boosting = k.boost.timer > 0;
    let vCruise = finished ? top * 0.62 : (boosting ? top * (1 + k.boost.strength) : top * this.pacing);
    if (k.rocket > 0) vCruise = top * 1.5;
    if (k.ink > 0) vCruise *= 0.88;
    let vAllowed = this.speedProfile(s, v, top, drifting);
    if (k.rocket > 0) vAllowed = Math.max(vAllowed * 1.5, top * 0.9);
    if (surf.grip < 0.4) vAllowed = Math.min(vAllowed, top * 0.74);     // ice
    if (!q.onRoad && !boosting) vAllowed = Math.min(vAllowed, top * 0.7);
    let vTarget = Math.min(vCruise, vAllowed);
    // follow a slow kart we can't get around instead of ramming it
    const nb = this.near;
    if (nb.blocker && nb.blockDs < 9 && Math.abs(nb.blockDl) < 2.1 && this.pass.side === 0) vTarget = Math.min(vTarget, Math.max(4, nb.blocker.speed - 0.5 + nb.blockDs * 0.25));
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
    if (hz) { target = hz.lat; rate = 11; }
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

  hazardTarget(s, lat, planned, v, hw) {
    const items = this.session.items;
    if (!items || !items.entities.length) return null;
    const track = this.track, T = this.T;
    let best = null, bestDs = 1e9;
    for (const e of items.entities) {
      if (!e.hazard || e.kind === 'projectile') continue;
      const ds = track.deltaS(this.k.query.s, e.s);
      const reach = (e.type === 'bomb' ? 22 : 15) + Math.max(0, v) * 0.75;
      if (ds < 1.5 || ds > reach || ds > bestDs) continue;
      let seen = this.seen.get(e.id);
      if (seen === undefined) { seen = this.session.random() < T.perceive; this.seen.set(e.id, seen); if (this.seen.size > 80) this.seen.delete(this.seen.keys().next().value); }
      if (!seen) continue;
      const clear = (e.type === 'bomb' ? 4.6 : e.radius + 2.0);
      // where will we be when we get there?  blend between current lane and the plan
      const there = lat + (planned - lat) * clamp(ds / 20, 0, 1);
      if (Math.abs(e.lat - there) > clear + 0.4) continue;
      best = e; bestDs = ds;
    }
    if (!best) return null;
    const clear = (best.type === 'bomb' ? 4.8 : best.radius + 2.2);
    const lim = hw - 1.6;
    // pass on the side we are already on (hazard to our right -> go left of it); flip if that side has no room
    let tl = best.lat >= lat ? best.lat - clear : best.lat + clear;
    if (Math.abs(tl) > lim) tl = best.lat >= lat ? best.lat + clear : best.lat - clear;
    this.stats.dodges++;
    return { lat: clamp(tl, -lim, lim) };
  }

  // =================================================================================================================
  // speed: braking-aware corner profile (own physics-based limit, combined with the track's maxSpeedAt hint)
  speedProfile(s, v, top, drifting) {
    const track = this.track, k = this.k, plan = this.dr.plan;
    const aB = this.T.brakeDecel * (0.9 + 0.2 * this.skill);
    const auth = 1 - 0.3 * smoothstep(0.55 * top, 1.15 * top, Math.abs(v));
    const omega = k.stats.steerRate * auth * 0.74 * this.cornerScale;
    const hor = clamp(v * v / (2 * aB) + 24 + v * 0.45, 40, 160);
    let vAllowed = 1e9;
    for (let d = 0; d <= hor; d += 6 + d * 0.12) {
      const sd = s + d;
      const kappa = Math.abs(track.curvatureAt(sd));
      // a corner we intend to drift (or are drifting) can be taken faster: the drift's turn-rate range is higher
      const dg = drifting || (plan && track.deltaS(plan.s0 - 8, sd) >= 0 && track.deltaS(sd, plan.s1) >= 0) ? 1.35 : 1;
      const own = kappa > 1e-4 ? (omega * dg) / kappa : 1e9;
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
    const k = this.k, d = k.drift, dr = this.dr, track = this.track, T = this.T;
    const out = { drift: false, steer: null };
    dr.cool -= dt;
    const surf = SURFACE_PROPS[k.query.surface] ?? SURFACE_PROPS[0];
    const ok = k.grounded && k.spin.timer <= 0 && v > top * 0.55 && surf.grip >= 0.75 && k.query.onRoad;                 // may START a drift
    const okHold = k.spin.timer <= 0 && v > top * 0.4 && surf.grip >= 0.5 && k.query.offset < 1.5;                      // may KEEP one (the hop is airborne)
    const baseRate = k.stats.steerRate * k.stats.driftTurn * 0.95;
    // plan the next corner once (the latch holds until we have passed it)
    if (dr.plan && track.deltaS(s, dr.plan.s1) < -14) dr.plan = null;
    if (dr.phase === 'idle' && dr.cool <= 0 && this.driftProb > 0.02 && !k.race.finished && (dr.latchS === null || track.deltaS(s, dr.latchS) <= 0)) this.planDrift(s, v, top, baseRate);

    if (d.dir !== 0) {
      // ------------------------------------------------ in a drift: hold, steer the arc, release at the exit
      if (dr.phase !== 'active') { dr.phase = 'active'; dr.t = 0; dr.dir = d.dir; this.stats.drifts++; dr.hold = T.driftHold ? T.driftHold[0] + this.session.random() * (T.driftHold[1] - T.driftHold[0]) : 1e9; dr.wantEnd = 0; }
      dr.t += dt;
      const turnSide = -d.dir;                          // +1 = left turn
      const eTurn = e * turnSide;                       // >0: the target is on the side we are turning to
      // In a drift the heading always turns toward d.dir at baseRate * mul with mul = lerp(.45, 1.3, (along+1)/2),
      // along = steer * d.dir.  Pick the turn rate that closes the pursuit error, then invert that mapping.
      const wDes = clamp(4.6 * eTurn, 0.45 * baseRate, 1.3 * baseRate);
      const along = clamp((wDes / baseRate - 0.875) / 0.425, -1, 1);
      out.steer = d.dir * along;
      out.drift = true;
      // look ahead to decide when the corner is over
      const bendNext = Math.abs(this.bend(s + 3, s + 3 + 26));
      const kapNow = track.curvatureAt(s + 5);
      const signOk = kapNow * turnSide > -0.002;
      if (eTurn < -0.12) dr.wantEnd += dt; else dr.wantEnd = Math.max(0, dr.wantEnd - dt);
      const exit = bendNext < 0.16 && Math.abs(kapNow) < 0.0055;
      const charged = d.level >= 3 && bendNext < 0.35;
      if (exit || charged || !signOk || dr.wantEnd > 0.3 || dr.t > dr.hold || !okHold) { out.drift = false; dr.phase = 'release'; dr.cool = 0.5; if (d.level > 0) this.stats.driftBoosts++; }
      return out;
    }
    // ------------------------------------------------ not drifting
    if (dr.phase === 'active' || dr.phase === 'release') { dr.phase = 'idle'; dr.cool = Math.max(dr.cool, 0.35); }
    if (dr.phase === 'arming') {
      dr.t += dt;
      out.drift = true;
      out.steer = clamp(Math.sign(dr.dir) * 0.8, -1, 1);
      if (dr.t > 0.55 || !okHold) { dr.phase = 'idle'; dr.cool = 1.0; out.drift = false; out.steer = null; }
      return out;
    }
    // a planned corner: press the drift button just before its entry
    const plan = dr.plan;
    if (!ok || !plan || dr.cool > 0) return out;
    const lead = 3 + v * 0.1;
    const toEntry = track.deltaS(s, plan.s0) - lead;
    if (toEntry > 0 || track.deltaS(s, plan.s1) < 12) return out;
    dr.phase = 'arming'; dr.t = 0; dr.dir = plan.dir;
    out.drift = true; out.steer = dr.dir * 0.8;
    return out;
  }

  /**
   * Look for the next corner worth drifting.  The heading always turns at 0.45..1.3 x baseRate while drifting, so a corner
   * qualifies when the turn rate it needs at (near) full speed falls inside that window, it is a real bend (>= ~30 deg)
   * and lasts at least a second.  Decided once per corner (dr.latchS), with the class's driftProb.
   */
  planDrift(s, v, top, baseRate) {
    const track = this.track, dr = this.dr;
    const W = clamp(Math.max(v, top * 0.7) * 2.6, 70, 160);
    let peak = 0, dPeak = 0;
    for (let d = 8; d <= W; d += 5) { const kk = track.curvatureAt(s + d); if (Math.abs(kk) > Math.abs(peak)) { peak = kk; dPeak = d; } }
    if (Math.abs(peak) < 0.011) return;                      // nothing worth a drift in sight yet
    const ap = Math.abs(peak);
    // the corner is still rising at the edge of our view: wait until we can see its peak
    if (dPeak >= W - 8 && Math.abs(track.curvatureAt(s + W)) >= 0.85 * ap && W < 160) return;
    dr.dbg = { s: Math.round(s), peak: +peak.toFixed(4), dPeak };
    dr.decision = dr.dbg;
    let dEntry = 8; for (let d = 0; d <= dPeak; d += 4) if (Math.abs(track.curvatureAt(s + d)) >= 0.5 * ap) { dEntry = d; break; }
    let dEnd = dPeak; for (let d = dPeak; d <= dPeak + 130; d += 5) { dEnd = d; const kk = track.curvatureAt(s + d); if (Math.abs(kk) < 0.35 * ap || kk * peak < 0) break; }
    dr.latchS = wrapS(s + dEnd + 12, track.length);          // do not re-plan until this corner is behind us
    const vRef = clamp(Math.max(v, top * 0.8), 0, top);
    const need = ap * vRef;
    dr.dbg.need = +need.toFixed(2); dr.dbg.baseRate = +baseRate.toFixed(2); dr.dbg.dEntry = dEntry; dr.dbg.dEnd = dEnd;
    if (need < 0.5 * baseRate || need > 1.18 * baseRate) { dr.dbg.why = 'rate'; return; }
    const H = this.bend(s + dEntry, s + dEnd);
    dr.dbg.H = +H.toFixed(2);
    if (Math.abs(H) < 0.52 || H * peak < 0) { dr.dbg.why = 'bend'; return; }
    if ((dEnd - dEntry) / vRef < 0.9) { dr.dbg.why = 'short'; return; }
    if (this.session.random() > this.driftProb) { dr.dbg.why = 'prob'; return; }
    dr.dbg.why = 'PLAN';
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
