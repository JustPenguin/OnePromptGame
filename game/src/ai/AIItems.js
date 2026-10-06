// AI item use: humans don't spam items, they wait for the moment.  Each AI sits on a fresh item for a class-dependent
// reaction time, then looks for a good opportunity a few times a second (straight ahead for boosts, a kart lined up for
// throws, a threat for shields, a chaser for drops).  Attacks are rationed: every opportunity is taken only with a
// probability, a driver that just fired holds the next shot back (fireCool), forward shots carry a skill-dependent aim
// error, and only a long-held item is used "because it is there".
// Uses itemSystem.useItem(kart, backward) directly (never fakes input.item).
import { clamp, lerp } from '../core/math.js';

const ATTACK = new Set(['peel', 'orb', 'seeker', 'bomb', 'comet', 'ink', 'shock']);

export class AIItems {
  constructor(driver) {
    this.d = driver;
    this.session = driver.session;
    this.serial = -1;
    this.delay = 1;
    this.cool = 0;               // pause between two uses of a stack
    this.fireCd = 0;             // pause between two attacks (class fireCool)
    this.think = 0;              // next opportunity check
    this.lastSpinT = -99;
    this.used = 0;
  }

  update(dt, headErr) {
    const d = this.d, k = d.k, it = k.item, items = this.session.items;
    if (k.spin.timer > 0) this.lastSpinT = this.session.time;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (!items || !it.type || it.roulette.active || k.locked || k.respawn.active || k.race.finished || k.rocket > 0) return;
    const st = k.ext.items;
    if (!st) return;
    if (st.serial !== this.serial) {          // a new item arrived: pick this driver's reaction time
      this.serial = st.serial;
      const [lo, hi] = d.T.itemDelay;
      this.delay = lerp(lo, hi, this.session.random() * this.session.random() * 1.0 + 0.0);
      this.think = 0;
    }
    if (this.cool > 0) { this.cool -= dt; return; }
    const jumpBoost = it.type === 'boost' && this.jumpNeedsBoost();
    if (st.heldTime < this.delay && !jumpBoost) return;
    // opportunities are looked for a few times a second, not every frame
    this.think -= dt;
    if (this.think > 0 && !jumpBoost) return;
    this.think = 0.28 + this.session.random() * 0.22;
    const r = this.decide(it.type, it, st);
    if (!r) return;
    const attack = ATTACK.has(it.type);
    const rnd = () => this.session.random();
    if (attack && !r.urgent) {
      if (this.fireCd > 0) return;                                                    // fired recently: hold the next one back
      const fireP = clamp(0.22 + 0.3 * d.persona.aggression, 0.15, 0.75);
      if (rnd() > fireP) return;                                                      // not every opportunity is taken
    }
    // a forward shot is never perfect: sloppy drivers miss by metres, masters by centimetres
    if (attack && !r.back) st.aimErr = (rnd() * 2 - 1) * lerp(5.5, 0.8, d.skill);
    if (items.useItem(k, r.back)) {
      this.used++;
      this.cool = 0.6 + rnd() * 1.1 + (it.count > 0 ? 0.8 : 0);
      if (attack) {
        const [lo, hi] = d.T.fireCool ?? [12, 26];
        this.fireCd = lerp(lo, hi, rnd());
        if (it.count > 0) this.fireCd = Math.max(this.fireCd, 7);                     // keep the rest of a stack for later
      }
    }
    st.aimErr = 0;
  }

  /** @returns {{back:boolean, urgent?:boolean}|null}  urgent = use-it-or-lose-it (ignores the fire cool-down and the odds) */
  decide(type, it, st) {
    const d = this.d, k = d.k, near = d.near, items = this.session.items;
    const s = k.query.s, v = k.speed, top = k.stats.topSpeed, place = k.race.place, n = this.session.karts.length;
    const aggr = d.persona.aggression, held = st.heldTime;
    const bendA = Math.abs(d.bend(s + 6, s + 58));
    const straight = bendA < 0.22;
    const front = near.ahead && near.aheadDs < 70 ? near.ahead : null;
    const lined = front && Math.abs(near.aheadDl) < 2.6 && near.aheadDs > 5;
    const chaser = near.behind && near.behindDs > -22 && Math.abs(near.behindDl) < 5 ? near.behind : null;
    const skill = d.skill;
    switch (type) {
      case 'boost': {
        if (this.jumpNeedsBoost()) return { back: false };          // too slow for the ramp: nitro now
        const boosting = k.boost.timer > 0.5;
        const recovering = this.session.time - this.lastSpinT < 1.2 && k.spin.timer <= 0;
        const offroad = !k.query.onRoad;
        const pad = this.padSoon(s);
        if (boosting || pad || v < 8) return null;
        if ((straight && v > top * 0.55) || recovering || offroad || held > 13) return { back: false };
        return null;
      }
      case 'peel': {
        if (lined && near.aheadDs < 20) return { back: false };
        if (chaser && (it.count > 1 || near.behindDs > -14 || aggr > 0.8) && (held > 1.5 || aggr > 0.6)) return { back: true };
        if (held > 22 && straight) return { back: true, urgent: true };
        return null;
      }
      case 'orb': {
        if (lined && near.aheadDs < 42) return { back: false };
        if (chaser && near.behindDs > -26 && Math.abs(near.behindDl) < 3.5 && (aggr > 0.55 || held > 8)) return { back: true };
        if (held > 22 && front) return { back: false, urgent: true };
        return null;
      }
      case 'seeker': {
        if (place > 1 && front && near.aheadDs < 75 && held > 1.2 + (1 - skill) * 3) return { back: false };
        if (place === 1 && chaser && near.behindDs > -30 && held > 1.5) return { back: true };
        if (held > 12 && place > 1 && front) return { back: false, urgent: true };
        if (held > 18 && chaser) return { back: true, urgent: true };
        return null;
      }
      case 'bomb': {
        if (lined && near.aheadDs > 10 && near.aheadDs < 34) return { back: false };
        if (chaser && near.behindDs > -18 && held > 1.2) return { back: true };
        if (held > 20) return { back: true, urgent: true };
        return null;
      }
      case 'comet': {
        if (items.cometActive || !items.cometTarget(k)) return null;
        if (held > 2 + (1 - skill) * 4) return { back: false };
        return null;
      }
      case 'shock': {
        // Storm Zap shrinks every kart AHEAD of the driver: worth it when a few of them are within reach
        let ahead = 0;
        for (const o of this.session.karts) { if (o !== k && !o.race.finished && o.race.place < place && Math.abs(this.session.track.deltaS(s, o.query.s)) < 150) ahead++; }
        if (ahead >= 2 && held > 1.5) return { back: false };
        if (held > 14 && ahead >= 1) return { back: false, urgent: true };
        return null;
      }
      case 'shield': {
        const threatened = st.incoming && st.incoming.dist < 48;
        const hazard = this.hazardAhead(items, s);
        if (threatened || hazard) return { back: false };
        if (held > 12) return { back: false };
        return null;
      }
      case 'rocket': {
        if ((place >= 3 && held > 1.5) || held > 8) return { back: false };
        return null;
      }
      case 'ink': {
        if (place > 1 && near.ahead && near.aheadDs < 60 && held > 2) return { back: false };
        if (held > 14) return { back: false, urgent: true };
        return null;
      }
      default: return { back: false };
    }
  }

  /** Approaching a ramp over a gap faster boosts would help: slower than the speed that clears it, and close enough for a boost to matter. */
  jumpNeedsBoost() {
    const d = this.d, j = d.jump, k = d.k;
    return j.active && j.ds > 4 && j.ds < 80 && k.speed < j.need * 1.04 && k.boost.timer < 0.4 && k.grounded;
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
