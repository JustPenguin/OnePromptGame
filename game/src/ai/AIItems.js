// AI item use: humans don't spam items, they wait for the moment.  Each AI sits on a fresh item for a class-dependent
// reaction time, then applies simple situational rules (straight ahead for boosts, a kart lined up for throws, a threat
// for shields, a chaser for drops).  Uses itemSystem.useItem(kart, backward) directly (never fakes input.item).
import { clamp, lerp } from '../core/math.js';

export class AIItems {
  constructor(driver) {
    this.d = driver;
    this.session = driver.session;
    this.serial = -1;
    this.delay = 1;
    this.cool = 0;
    this.lastSpinT = -99;
    this.used = 0;
  }

  update(dt, headErr) {
    const d = this.d, k = d.k, it = k.item, items = this.session.items;
    if (k.spin.timer > 0) this.lastSpinT = this.session.time;
    if (!items || !it.type || it.roulette.active || k.locked || k.respawn.active || k.race.finished || k.rocket > 0) return;
    const st = k.ext.items;
    if (!st) return;
    if (st.serial !== this.serial) {          // a new item arrived: pick this driver's reaction time
      this.serial = st.serial;
      const [lo, hi] = d.T.itemDelay;
      this.delay = lerp(lo, hi, this.session.random() * this.session.random() * 1.0 + 0.0);
    }
    if (this.cool > 0) { this.cool -= dt; return; }
    if (st.heldTime < this.delay) return;
    const r = this.decide(it.type, it, st);
    if (r) {
      if (items.useItem(k, r.back)) {
        this.used++;
        this.cool = 0.6 + this.session.random() * 1.1 + (it.count > 0 ? 0.8 : 0);
      }
    }
  }

  /** @returns {{back:boolean}|null} */
  decide(type, it, st) {
    const d = this.d, k = d.k, near = d.near, T = d.T, items = this.session.items;
    const s = k.query.s, v = k.speed, top = k.stats.topSpeed, place = k.race.place, n = this.session.karts.length;
    const aggr = d.persona.aggression, held = st.heldTime;
    const rnd = () => this.session.random();
    const bendA = Math.abs(d.bend(s + 6, s + 58));
    const straight = bendA < 0.22;
    const front = near.ahead && near.aheadDs < 70 ? near.ahead : null;
    const lined = front && Math.abs(near.aheadDl) < 3.2 && near.aheadDs > 5;
    const chaser = near.behind && near.behindDs > -26 && Math.abs(near.behindDl) < 5.5 ? near.behind : null;
    const skill = d.skill;
    switch (type) {
      case 'boost': {
        const boosting = k.boost.timer > 0.5;
        const recovering = this.session.time - this.lastSpinT < 1.2 && k.spin.timer <= 0;
        const offroad = !k.query.onRoad;
        const pad = this.padSoon(s);
        if (boosting || pad || v < 8) return null;
        if ((straight && v > top * 0.55) || recovering || offroad || held > 13) return { back: false };
        return null;
      }
      case 'peel': {
        if (lined && near.aheadDs < 26 && rnd() < 0.5 + aggr * 0.4) return { back: false };
        if (chaser && (it.count > 1 || near.behindDs > -16 || aggr > 0.8) && (held > 1.0 || aggr > 0.6)) return { back: true };
        if (held > 24 && straight) return { back: true };
        return null;
      }
      case 'orb': {
        if (lined && near.aheadDs < 52) return { back: false };
        if (chaser && near.behindDs > -30 && Math.abs(near.behindDl) < 4 && (aggr > 0.45 || held > 6)) return { back: true };
        if (held > 22 && front) return { back: false };
        return null;
      }
      case 'seeker': {
        if (place > 1 && front) { if (held > 0.2 + (1 - skill) * 2 || near.aheadDs < 80) return { back: false }; }
        if (place === 1 && chaser && near.behindDs > -34) return { back: true };
        if (held > 7 && place > 1) return { back: false };
        if (held > 14 && chaser) return { back: true };
        return null;
      }
      case 'bomb': {
        if (lined && near.aheadDs > 8 && near.aheadDs < 40 && rnd() < 0.55 + aggr * 0.3) return { back: false };
        if (chaser && near.behindDs > -20) return { back: true };
        if (held > 20) return { back: true };
        return null;
      }
      case 'comet': {
        if (items.cometActive || !items.cometTarget(k)) return null;
        return { back: false };
      }
      case 'shock': {
        let close = 0;
        for (const o of this.session.karts) { if (o !== k && !o.race.finished && Math.abs(this.session.track.deltaS(s, o.query.s)) < 90) close++; }
        if (close >= 2 || (place <= 3 && chaser) || held > 9) return { back: false };
        return null;
      }
      case 'shield': {
        const threatened = st.incoming && st.incoming.dist < 48;
        const crowded = near.ahead && near.aheadDs < 7 && aggr > 0.5;
        const hazard = this.hazardAhead(items, s);
        if (threatened || crowded || hazard || held > 9) return { back: false };
        return null;
      }
      case 'rocket': {
        if (place >= 2 || held > 5) return { back: false };
        return null;
      }
      case 'ink': {
        if (place > 1 && near.ahead) return { back: false };
        if (held > 10) return { back: false };
        return null;
      }
      default: return { back: false };
    }
  }

  padSoon(s) {
    const pads = this.session.track.boostPads;
    if (!pads) return false;
    const L = this.session.track.length;
    for (const p of pads) { let a = p.s0 - s; if (a < -L / 2) a += L; else if (a > L / 2) a -= L; if (a > -2 && a < 30) return true; }
    return false;
  }
  hazardAhead(items, s) {
    const track = this.session.track;
    for (const e of items.entities) {
      if (!e.hazard) continue;
      const ds = track.deltaS(s, e.s);
      if (ds > 2 && ds < 20 && Math.abs(e.lat - this.d.k.query.lateral) < 3) return true;
    }
    return false;
  }
}
