// Race rules: grid placement, intro -> countdown -> racing -> finishing -> results, laps, positions, wrong-way,
// rocket start, finish handling.  OWNER: Agent A (engine).  Runs AFTER physics each frame (session.update).
//
// Progress model: kart.race.distance = signed metres travelled along the track (accumulated from arc-length
// deltas, so reversing, respawns or shortcuts can't double-count).  Start grid sits at negative distance.
//   lapIndex = floor(distance / length)  (completed laps),  lap = clamp(lapIndex + 1, 1, laps)
//   finished when distance >= laps * length
// Lap and finish times are interpolated inside the frame in which the line was crossed, so they are exact (to the physics
// step) and identical at 30, 60 or 144 fps - which also makes time-trial records and ghost comparisons fair.
import { EV } from '../core/events.js';
import { clamp } from '../core/math.js';

/** Rocket start: throttle pressed no earlier than this many seconds before GO gives the launch boost. */
export const ROCKET_WINDOW = 0.45;
/** Throttle held from earlier than this many seconds before GO is a burnout. */
export const BURNOUT_BEFORE = 1.0;
/** Karts closer than this (metres of track distance) keep their previous order: no overtake chatter between side-by-side karts. */
const ORDER_MARGIN = 0.4;

export class RaceManager {
  constructor(session) {
    this.session = session;
    this.track = session.track;
    this.events = session.events;
    this.laps = session.config.laps ?? session.track.laps;
    this.phase = 'intro';
    this.phaseTime = 0;
    this.time = 0;                 // race clock: seconds since GO (only runs while racing/finishing)
    this.introDuration = session.config.skipIntro ? 0 : 3.4;
    this.countdownLength = 3;      // seconds from "3" to GO
    this.rocketWindow = ROCKET_WINDOW;
    this._lastCount = 4;
    this.finishOrder = [];
    this.finishTimer = 0;
    this.finishTimeout = 18;       // seconds after the player finishes before stragglers are scored
    this.firstFinishTime = null;
    this._ordered = [];
  }

  /** Put karts on the grid. Called once by the session after karts exist. */
  placeOnGrid() {
    const karts = this.session.karts;
    const slots = this.track.getStartGrid(karts.length);
    // karts are listed best-slot-first in session.karts
    karts.forEach((k, i) => {
      const s = slots[i];
      k.placeAt(s.position, s.yaw, 0);
      k.locked = true;
      k.race.distance = s.s - this.track.length;   // slightly negative
      k.race.s = s.s;
      k.race.lap = 1; k.race.lapsDone = 0; k.race.finished = false; k.race.lapTimes = []; k.race.bestLap = Infinity;
      k.race.lapStartTime = 0; k.race.dnf = false; k.race.wrongWay = false; k.race.wrongWayTimer = 0;
      k.race.place = i + 1;
      k.ext.throttleSince = undefined;
    });
    this._ordered = karts.slice();
    if (this.introDuration <= 0) this.setPhase('countdown');
    else this.setPhase('intro');
  }

  setPhase(p) {
    this.phase = p;
    this.phaseTime = 0;
    this.events.emit(EV.RACE_PHASE, { phase: p });
  }

  skipIntro() { if (this.phase === 'intro') this.setPhase('countdown'); }

  get lapCount() { return this.laps; }
  get totalDistance() { return this.laps * this.track.length; }
  /** Seconds until GO while counting down (0 otherwise). Handy for "hold the gas now!" hints. */
  get countdownLeft() { return this.phase === 'countdown' ? Math.max(0, this.countdownLength - this.phaseTime) : 0; }
  /** True while a throttle press would count as a perfect rocket start. */
  get rocketWindowOpen() { return this.phase === 'countdown' && this.countdownLeft <= this.rocketWindow; }
  get isRacing() { return this.phase === 'racing' || this.phase === 'finishing'; }
  /** The kart in first place right now. */
  get leader() { return this._ordered[0] ?? null; }

  update(dt) {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= this.introDuration) this.setPhase('countdown');
        break;
      case 'countdown': this.updateCountdown(dt); break;
      case 'racing':
      case 'finishing':
        this.time += dt;
        break;
      default: break;
    }
    if (this.phase === 'racing' || this.phase === 'finishing') {
      this.updateProgress(dt);
      this.updatePlaces();
      this.updateFinishing(dt);
    } else {
      // still keep s/lateral fresh for HUD/camera/AI before GO
      for (const k of this.session.karts) { k.race.s = k.query.s; k.race.lateral = k.query.lateral; }
    }
  }

  // ------------------------------------------------------------------ countdown / start
  updateCountdown(dt) {
    const t = this.phaseTime;
    const karts = this.session.karts;
    // track when each kart first pressed the throttle (for the rocket start)
    for (const k of karts) {
      if (k.input.throttle > 0.5) { if (k.ext.throttleSince === undefined) k.ext.throttleSince = t; }
      else k.ext.throttleSince = undefined;
    }
    const remaining = this.countdownLength - t;
    const count = Math.ceil(remaining);
    if (count !== this._lastCount && count >= 1) { this._lastCount = count; this.events.emit(EV.COUNTDOWN, { count }); }
    if (remaining <= 0) this.go();
  }

  go() {
    this.events.emit(EV.COUNTDOWN, { count: 0 });
    this.time = 0;
    for (const k of this.session.karts) {
      k.locked = false;
      k.race.lapStartTime = 0;
      const since = k.ext.throttleSince;
      if (k.isAI) {
        // a few rivals nail the start; kept modest so they don't launch into the back of the pack-leader
        if (this.session.random() < 0.45) k.applyBoost(0.32, 0.7, 'start');
      } else if (since !== undefined) {
        const early = since - this.countdownLength; // negative = seconds before GO
        if (early >= -this.rocketWindow) { k.applyBoost(0.45, 1.0, 'start'); this.events.emit(EV.START_BOOST, { kart: k }); }
        else if (early < -BURNOUT_BEFORE) { k.stun = 0.7; this.events.emit(EV.START_BURNOUT, { kart: k }); }
      }
      k.ext.throttleSince = undefined;
    }
    this.setPhase('racing');
    this.events.emit(EV.RACE_START, {});
  }

  // ------------------------------------------------------------------ progress / laps
  updateProgress(dt) {
    const L = this.track.length;
    for (const k of this.session.karts) {
      const r = k.race;
      const q = k.query;
      const ds = this.track.deltaS(r.s, q.s);
      r.s = q.s;
      r.lateral = q.lateral;
      if (!r.finished) {
        const prev = r.distance;
        r.distance += ds;
        const lapIndex = Math.floor(r.distance / L);
        if (lapIndex > r.lapsDone) this.completeLap(k, lapIndex, this.crossTime(prev, r.distance, lapIndex * L, dt));
        r.lap = clamp(Math.floor(Math.max(0, r.distance) / L) + 1, 1, this.laps);
        r.progress = clamp(r.distance / (this.laps * L), 0, 1);
        if (r.distance >= this.laps * L) this.finishKart(k, this.crossTime(prev, r.distance, this.laps * L, dt));
      }
      this.updateWrongWay(k, q, dt);
    }
  }

  /** Race-clock time at which a kart moving from `a` to `b` this frame crossed `line` (clamped into the frame). */
  crossTime(a, b, line, dt) {
    const span = b - a;
    const f = span > 1e-6 ? clamp((line - a) / span, 0, 1) : 1;
    return this.time - dt + f * dt;
  }

  /** Travelling against the direction of the track (by velocity, so drifting / spinning chassis angles don't matter). */
  updateWrongWay(k, q, dt) {
    const r = k.race;
    const vx = k.velocity.x, vz = k.velocity.z;
    const v = Math.hypot(vx, vz);
    const against = v > 3 && k.spin.timer <= 0 && !k.respawn.active && (vx * q.tangent.x + vz * q.tangent.z) / v < -0.35;
    r.wrongWayTimer = against ? r.wrongWayTimer + dt : Math.max(0, r.wrongWayTimer - dt * 3);
    const ww = r.wrongWay ? r.wrongWayTimer > 0.25 : r.wrongWayTimer > 1.0;       // hysteresis: quick to clear, slow to trigger
    if (ww !== r.wrongWay) { r.wrongWay = ww; this.events.emit(EV.WRONG_WAY, { kart: k, active: ww }); }
  }

  completeLap(k, lapIndex, at = this.time) {
    const r = k.race;
    r.lapsDone = lapIndex;
    const lapTime = at - r.lapStartTime;
    r.lapStartTime = at;
    r.lapTimes.push(lapTime);
    const isBest = lapTime < r.bestLap;
    if (isBest) r.bestLap = lapTime;
    this.events.emit(EV.LAP_COMPLETE, { kart: k, lap: lapIndex, lapTime, isBest });
    if (lapIndex + 1 === this.laps) this.events.emit(EV.FINAL_LAP, { kart: k });
  }

  finishKart(k, at = this.time) {
    const r = k.race;
    if (r.finished) return;
    if ((r.lapsDone ?? 0) < this.laps) this.completeLap(k, this.laps, at);
    r.finished = true;
    r.finishTime = at;
    r.progress = 1;
    this.finishOrder.push(k);
    r.place = this.finishOrder.length;
    this.firstFinishTime ??= at;
    k.autopilot = true; // AIManager cruises finished karts
    this.events.emit(EV.KART_FINISH, { kart: k, place: r.place, time: r.finishTime });
    if (k.isPlayer && this.phase === 'racing') { this.setPhase('finishing'); this.finishTimer = 0; }
  }

  // ------------------------------------------------------------------ positions
  updatePlaces() {
    const ks = this._ordered;
    // insertion pass with a margin: an almost-sorted list stays stable, only real overtakes swap
    for (let i = 1; i < ks.length; i++) {
      let j = i;
      while (j > 0 && ahead(ks[j], ks[j - 1])) { const t = ks[j]; ks[j] = ks[j - 1]; ks[j - 1] = t; j--; }
    }
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const place = i + 1;
      if (k.race.place !== place) {
        const from = k.race.place;
        k.race.place = place;
        this.events.emit(EV.PLACE_CHANGE, { kart: k, from, to: place });
        if (place < from) { const passed = ks[i + 1]; if (passed) this.events.emit(EV.OVERTAKE, { kart: k, passed }); }
      }
    }
  }

  /** Karts sorted by current position (best first). Do not mutate. */
  get order() { return this._ordered; }

  // ------------------------------------------------------------------ finishing / results
  updateFinishing(dt) {
    if (this.phase !== 'finishing' && this.phase !== 'racing') return;
    const ks = this.session.karts;
    const allDone = ks.every((k) => k.race.finished);
    const player = this.session.player;
    if (this.phase === 'finishing') this.finishTimer += dt;
    // time trial / solo: end as soon as the player is done
    const soloEnd = ks.length === 1 && player?.race.finished;
    if (allDone || soloEnd || (this.phase === 'finishing' && this.finishTimer > this.finishTimeout)) this.endRace();
  }

  endRace() {
    if (this.phase === 'results') return;
    // score stragglers by distance
    this.updatePlaces();
    let n = this.finishOrder.length;
    for (const k of this._ordered) {
      if (!k.race.finished) { k.race.place = ++n; k.race.dnf = true; }
    }
    this.setPhase('results');
    this.events.emit(EV.RACE_RESULTS, { standings: this.standings() });
  }

  standings() {
    return [...this.session.karts]
      .sort((a, b) => a.race.place - b.race.place)
      .map((k) => ({
        kart: k, id: k.id, name: k.name, driverId: k.driverId, bodyId: k.bodyId, isPlayer: k.isPlayer, place: k.race.place,
        finished: k.race.finished, time: k.race.finishTime, bestLap: k.race.bestLap, dnf: !!k.race.dnf,
        lapTimes: [...k.race.lapTimes], distance: k.race.distance, progress: k.race.progress,
      }));
  }
}

/** Is `a` strictly ahead of `b` (and so should sit before it in the order)? */
function ahead(a, b) {
  const ra = a.race, rb = b.race;
  if (ra.finished !== rb.finished) return ra.finished;
  if (ra.finished) return ra.finishTime < rb.finishTime;
  return ra.distance - rb.distance > ORDER_MARGIN;
}
