// Race rules: grid placement, intro -> countdown -> racing -> finishing -> results, laps, positions, wrong-way,
// rocket start, finish handling.  OWNER: Agent A (engine).  Runs AFTER physics each frame (session.update).
//
// Progress model: kart.race.distance = signed metres travelled along the track (accumulated from arc-length
// deltas, so reversing or shortcuts can't double-count).  Start grid sits at negative distance.
//   lapIndex = floor(distance / length)  (completed laps),  lap = clamp(lapIndex + 1, 1, laps)
//   finished when distance >= laps * length
import { EV } from '../core/events.js';
import { clamp } from '../core/math.js';

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
    this._lastCount = 4;
    this.finishOrder = [];
    this.finishTimer = 0;
    this.finishTimeout = 18;       // seconds after the player finishes before stragglers are scored
    this._placeCache = new Map();
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
      k.race.lapStartTime = 0;
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
        if (this.session.random() < 0.55) { k.applyBoost(0.4, 0.8, 'start'); }
      } else if (since !== undefined) {
        const early = since - this.countdownLength; // negative = seconds before GO
        if (early >= -0.8) { k.applyBoost(0.45, 1.0, 'start'); this.events.emit(EV.START_BOOST, { kart: k }); }
        else if (early < -1.9) { k.stun = 0.7; this.events.emit(EV.START_BURNOUT, { kart: k }); }
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
        r.distance += ds;
        const lapIndex = Math.floor(r.distance / L);
        if (lapIndex > r.lapsDone) this.completeLap(k, lapIndex);
        r.lap = clamp(Math.floor(Math.max(0, r.distance) / L) + 1, 1, this.laps);
        r.progress = clamp(r.distance / (this.laps * L), 0, 1);
        if (r.distance >= this.laps * L) this.finishKart(k);
      }
      // wrong way: facing against the track direction while moving
      const against = k.forward.dot(q.tangent) < -0.35 && k.speed > 3;
      r.wrongWayTimer = against ? r.wrongWayTimer + dt : 0;
      const ww = r.wrongWayTimer > 1.0;
      if (ww !== r.wrongWay) { r.wrongWay = ww; this.events.emit(EV.WRONG_WAY, { kart: k, active: ww }); }
    }
  }

  completeLap(k, lapIndex) {
    const r = k.race;
    r.lapsDone = lapIndex;
    const lapTime = this.time - r.lapStartTime;
    r.lapStartTime = this.time;
    r.lapTimes.push(lapTime);
    const isBest = lapTime < r.bestLap;
    if (isBest) r.bestLap = lapTime;
    this.events.emit(EV.LAP_COMPLETE, { kart: k, lap: lapIndex, lapTime, isBest });
    if (lapIndex + 1 === this.laps) this.events.emit(EV.FINAL_LAP, { kart: k });
  }

  finishKart(k) {
    const r = k.race;
    if (r.finished) return;
    if ((r.lapsDone ?? 0) < this.laps) this.completeLap(k, this.laps);
    r.finished = true;
    r.finishTime = this.time;
    this.finishOrder.push(k);
    r.place = this.finishOrder.length;
    k.autopilot = true; // AIManager cruises finished karts
    this.events.emit(EV.KART_FINISH, { kart: k, place: r.place, time: r.finishTime });
    if (k.isPlayer && this.phase === 'racing') { this.setPhase('finishing'); this.finishTimer = 0; }
  }

  // ------------------------------------------------------------------ positions
  updatePlaces() {
    const ks = this._ordered;
    ks.sort((a, b) => {
      const ra = a.race, rb = b.race;
      if (ra.finished !== rb.finished) return ra.finished ? -1 : 1;
      if (ra.finished) return ra.finishTime - rb.finishTime;
      return rb.distance - ra.distance || a.id - b.id;
    });
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
    else if (!player && ks.some((k) => k.race.finished) && this.time > 1) { /* spectator races: wait for all */ }
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
      .map((k) => ({ kart: k, id: k.id, name: k.name, driverId: k.driverId, bodyId: k.bodyId, isPlayer: k.isPlayer, place: k.race.place, finished: k.race.finished, time: k.race.finishTime, bestLap: k.race.bestLap, dnf: !!k.race.dnf }));
  }
}
