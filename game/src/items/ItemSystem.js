// Items: boxes, roulette, held items, projectiles, hazards, coins.  OWNER: Agent D (gameplay).
// Contract (stable):
//   new ItemSystem(session)   .group (added to the scene)   .update(dt)   .dispose()
//   itemSystem.giveItem(kart, type, count)      debug / rules can hand out items (count > 1 = a x3 pack)
//   itemSystem.useItem(kart, backward=false)    use the held item (backward = throw/drop behind)
//   kart.item = { type, count, roulette:{active,timer,shown} }  is the single source of truth the HUD reads.
// Use input: edge of kart.input.item.  backward = kart.input.brake > 0.5 at the moment of the press.
// All gameplay randomness goes through session.random() so a seed reproduces a race.
//
// Additions beyond the baseline (all additive):
//   .entities        live world entities (peels, bombs, orbs, rockets, comet) - the AI dodges the `hazard` ones
//   .boxes           item-box records [{def, active, timer, ...}]      .boxField / .coinField   the instanced fields
//   .stats()         counters for tests (entities by type, boxes, coins, fx)
//   .clearKartItem(kart)   .placeHazard(type, s, lateral, owner)   (debug)
//   kart.ext.items = { grace, shieldT, zapT, incoming:{type,dist,t}|null, lastGiven, heldTime, ... }  (read-only for others)
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { clamp, lerp, damp } from '../core/math.js';
import { SPEED_CLASSES, DEFAULT_SPEED_CLASS } from '../data/roster.js';
import { TrackQuery } from '../track/SplineTrack.js';
import { ITEM_DEFS, ITEM_ORDER } from './itemDefs.js';
import { rollItem } from './distribution.js';
import { createFxTextures } from './fxTextures.js';
import { createItemResources } from './itemMeshes.js';
import { disposeRibbonMaterial } from './Ribbon.js';
import { ItemFX } from './ItemFX.js';
import { ItemBoxField, CoinField } from './boxes.js';
import { HeldVisuals } from './held.js';
import { PeelEntity, OrbEntity, SeekerEntity, BombEntity, CometEntity } from './entities.js';

export const ROULETTE_TIME = 1.7;
export const SHIELD_TIME = 5.5;
export const ROCKET_TIME = 4.5;
export const ZAP_TIME = 4.5;
export const INK_TIME = 4;
const ZAP_REACH = 4;             // Storm Zap hits at most this many karts directly ahead of the user
const ZAP_COOLDOWN = 35;         // seconds between two Storm Zaps in a race (rollItem stops handing it out meanwhile)
const HIT_GRACE = 2.4;            // seconds after recovering from a hit during which no further item hit lands (no chain-stacking)
const MAX_ENTITIES = 48;
const GRAVITY = 32;

export class ItemSystem {
  constructor(session) {
    this.session = session;
    this.events = session.events;
    this.track = session.track;
    this.group = new THREE.Group();
    this.group.name = 'items';
    session.scene.add(this.group);
    this.t = 0;
    this.nextEntityId = 1;
    this.entities = [];
    this.cometActive = null;
    this._wall = { depth: 0, nx: 0, nz: 0 };
    this._aimQ = new TrackQuery();
    this.tex = createFxTextures();
    this.res = createItemResources(this.tex);
    this.fx = new ItemFX(this);
    this.boxField = new ItemBoxField(this);
    this.boxes = this.boxField.boxes;
    this.coinField = new CoinField(this);
    this.held = new HeldVisuals(this);
    this._order = [];
    for (const k of session.karts) this.kartState(k);
    const on = (t, f) => session.on(t, f);
    on(EV.BUMP, (p) => this.onBump(p));
    on(EV.KART_FINISH, ({ kart }) => this.onFinish(kart));
    on(EV.ROCKET, ({ kart, active }) => this.onRocket(kart, active));
  }

  // ------------------------------------------------------------------ helpers
  rand() { return this.session.random(); }
  kartState(k) {
    return (k.ext.items ??= { prevUse: false, grace: 0, shieldT: 0, zapT: 0, shield: 0, rocketOn: false, held: null, incoming: null, lastGiven: null, heldTime: 0, pending: null, rouletteIdx: 0, rouletteNext: 0, cometCooldown: 0, aimErr: 0 });
  }
  /** Karts best-first (RaceManager keeps this sorted; fall back to our own sort). */
  order() {
    const o = this.session.race?.order;
    if (o && o.length === this.session.karts.length) return o;
    const a = this._order; a.length = 0; for (const k of this.session.karts) a.push(k);
    a.sort((x, y) => y.race.distance - x.race.distance);
    return a;
  }
  targetable(k) { return !k.race.finished && !k.respawn.active; }

  /** Nearest targetable kart within `maxAngle` of the kart's heading (or opposite) and `maxDist` metres. */
  aimTarget(kart, backward, maxDist, maxAngle) {
    let best = null, bd = maxDist * maxDist;
    const sgn = backward ? -1 : 1, hx = Math.sin(kart.heading) * sgn, hz = Math.cos(kart.heading) * sgn, cmin = Math.cos(maxAngle);
    for (const k of this.session.karts) {
      if (k === kart || !this.targetable(k)) continue;
      const dx = k.position.x - kart.position.x, dz = k.position.z - kart.position.z, d2 = dx * dx + dz * dz;
      if (d2 > bd || d2 < 1) continue;
      if ((dx * hx + dz * hz) / Math.sqrt(d2) < cmin) continue;
      bd = d2; best = k;
    }
    return best;
  }

  /** Seeker target: the next kart ahead (or behind) in race order; in flight (`fromS`) the nearest kart in the travel direction. */
  seekerTarget(owner, backward, fromS = null, range = 0) {
    if (fromS === null) {
      const order = this.order(), i = order.indexOf(owner);
      if (i < 0) return null;
      if (!backward) { for (let j = i - 1; j >= 0; j--) if (this.targetable(order[j])) return order[j]; }
      else for (let j = i + 1; j < order.length; j++) if (this.targetable(order[j])) return order[j];
      return null;
    }
    const dirS = backward ? -1 : 1;
    let best = null, bd = range;
    for (const k of this.session.karts) {
      if (k === owner || !this.targetable(k)) continue;
      const d = this.track.deltaS(fromS, k.query.s) * dirS;
      if (d > 1.5 && d < bd) { bd = d; best = k; }
    }
    return best;
  }
  /** Comet target: the race leader (or the best kart that is not the owner). */
  cometTarget(owner) {
    for (const k of this.order()) if (k !== owner && this.targetable(k)) return k;
    return null;
  }

  /** Ballistic launch of entity `e` so it lands on `aim` after T seconds. */
  lobTo(e, aim, T, yOff = 0.15) {
    e.velocity.set((aim.x - e.position.x) / T, (aim.y + yOff - e.position.y + 0.5 * GRAVITY * T * T) / T, (aim.z - e.position.z) / T);
  }

  /** Where a lobbed peel/bomb should land: on a kart ahead if one is lined up, else down the road. */
  aimPoint(kart, kind) {
    const track = this.track, q = kart.query;
    const bomb = kind === 'bomb';
    const T = bomb ? 0.85 : 0.62;
    const speed = Math.max(0, kart.speed);
    const d = bomb ? clamp(speed * 0.8 + 12, 20, 46) : clamp(speed * 0.5 + 7, 11, 24);
    const out = new THREE.Vector3();
    const tgt = this.aimTarget(kart, false, bomb ? 60 : 32, 0.2);
    if (tgt) {
      out.copy(tgt.position).addScaledVector(tgt.velocity, T);
      out.x += (this.rand() - 0.5) * 1.2; out.z += (this.rand() - 0.5) * 1.2;
    } else track.pointAt(q.s + d, clamp(q.lateral, -3, 3), out, 0);
    const err = this.kartState(kart).aimErr;
    if (err) { out.x += -Math.cos(kart.heading) * err; out.z += Math.sin(kart.heading) * err; }     // AI drivers miss by a skill-dependent distance
    track.project(out, this._aimQ, -1);
    out.y = this._aimQ.height;
    out.T = T;
    return out;
  }

  spawn(e) {
    this.entities.push(e);
    if (this.entities.length > MAX_ENTITIES) {
      const i = this.entities.findIndex((x) => x.kind === 'trap' && x.state === 'ground');
      if (i >= 0) { this.entities[i].dispose(); this.entities.splice(i, 1); }
    }
    this.events.emit(EV.ITEM_SPAWN, { type: e.type, entity: e, owner: e.owner });
    return e;
  }

  explosion(pos, radius, type, color = 0xff7a1a, scale = 1) {
    this.fx.blast(pos, radius, color, 0.5);
    this.fx.shatter(pos, Math.min(26, Math.round(8 + radius)), [color, 0xffffff, 0xffd23f]);
    // the big fireball / shockwave is the VFX system's job: it reacts to ITEM_EXPLODE (calling vfx.spawn here as well would double it)
    this.events.emit(EV.ITEM_EXPLODE, { type, point: pos.clone(), radius });
  }

  /** A seeker/comet is homing on `kart` (called every frame by the entity). */
  lock(kart, strength, entity) {
    const st = this.kartState(kart);
    const inc = (st.incoming ??= { type: '', dist: 0, t: 0 });
    inc.type = entity.type; inc.t = 0.2;
    const dx = entity.position.x - kart.position.x, dz = entity.position.z - kart.position.z;
    inc.dist = Math.hypot(dx, dz);
    this.fx.lock(kart, strength);
  }

  // ------------------------------------------------------------------ hits
  consumeGuard(victim) {
    const it = victim.item;
    if ((it.type === 'peel' || it.type === 'orb') && it.count > 0 && !it.roulette.active) {
      it.count -= 1;
      if (it.count <= 0) { it.type = null; it.count = 0; }
      return true;
    }
    return false;
  }

  /**
   * Apply an item hit.  effect = { kind:'spin', dur } | { kind:'launch', vy }, guard = trailing peel/orb may absorb it.
   * @returns {'hit'|'blocked'|'skip'}  'skip' = nothing happened (grace / finished): the projectile keeps going.
   */
  hitKart(entity, victim, type, point, effect, attacker = entity?.owner ?? null) {
    const st = this.kartState(victim);
    if (victim.race.finished || victim.respawn.active) return 'skip';
    if (st.grace > 0 && !effect.ignoreGrace) return 'skip';
    if (effect.guard && this.consumeGuard(victim)) {
      this.events.emit(EV.ITEM_BLOCKED, { victim, type, guard: true });
      this.fx.blast(point, 2.4, 0xffffff, 0.3);
      return 'blocked';
    }
    let ok;
    if (effect.kind === 'launch') {
      ok = victim.launch(effect.vy ?? 11, type);
      if (ok) victim.spin.dir = this.rand() < 0.5 ? -1 : 1;     // Kart.launch picks its spin direction with Math.random()
    } else ok = victim.spinOut(effect.dur ?? 1.3, type, this.rand() < 0.5 ? -1 : 1);
    if (!ok) { this.events.emit(EV.ITEM_BLOCKED, { victim, type }); this.fx.blast(point, 2.2, 0xb06bff, 0.3); return 'blocked'; }
    st.grace = (effect.kind === 'launch' ? 1.7 : effect.dur ?? 1.3) + HIT_GRACE;
    if (victim.coins > 0) { victim.coins -= 1; this.events.emit(EV.COIN, { kart: victim, total: victim.coins, lost: true }); }
    this.events.emit(EV.ITEM_HIT, { victim, attacker, type, point: point.clone ? point.clone() : point });   // VFX draws the hit stars
    return 'hit';
  }

  // ------------------------------------------------------------------ pickups
  onBoxPickup(kart, box) {
    this.fx.shatter(box.def.position, 16);
    this.fx.ring(box.def.position, 0x9fe8ff, 0.5, 4.5, 0.45);
    this.startRoulette(kart, box);          // (ITEM_BOX is emitted there: the VFX system adds its pickup burst)
  }
  onCoin(kart, coin) {
    kart.addCoins(1);                       // EV.COIN: audio + the VFX system's sparkle
  }

  startRoulette(kart, box) {
    const st = this.kartState(kart), r = kart.item.roulette;
    r.active = true; r.timer = ROULETTE_TIME;
    st.pending = rollItem(kart, this.rollContext(kart));
    st.rouletteIdx = Math.floor(this.rand() * ITEM_ORDER.length);
    st.rouletteNext = 0.05;
    r.shown = ITEM_ORDER[st.rouletteIdx];
    this.events.emit(EV.ITEM_BOX, { kart, box: box?.def ?? null });
    this.events.emit(EV.ITEM_ROULETTE, { kart, active: true, shown: r.shown, tick: true });
  }

  rollContext(kart) {
    const s = this.session, cls = SPEED_CLASSES[s.config.speedClass] ?? SPEED_CLASSES[DEFAULT_SPEED_CLASS];
    const p = s.player;
    return {
      racers: s.karts.length, order: this.order(), cometActive: !!this.cometActive, random: () => s.random(),
      zapRecent: this.lastZapT !== undefined && this.t - this.lastZapT < ZAP_COOLDOWN,
      rubber: cls.rubber ?? 0.8, behindBy: p && kart !== p ? p.race.distance - kart.race.distance : 0,
    };
  }

  /** Put an item in a kart's slot (debug / rules / roulette result). count > 1 = a pack of uses. */
  giveItem(kart, type, count = 1) {
    const st = this.kartState(kart);
    const r = kart.item.roulette; r.active = false; r.shown = null;
    kart.item.type = type; kart.item.count = count;
    st.heldTime = 0; st.lastGiven = type; st.serial = (st.serial ?? 0) + 1;
    this.events.emit(EV.ITEM_GOT, { kart, type, count });
  }
  clearKartItem(kart) { const it = kart.item; it.type = null; it.count = 0; it.roulette.active = false; it.roulette.shown = null; this.kartState(kart).pending = null; }

  // ------------------------------------------------------------------ using items
  /** Use the held item.  `backward` = throw/drop behind (hold brake).  Returns true if something was used. */
  useItem(kart, backward = false) {
    const type = kart.item.type;
    if (!type || kart.item.roulette.active) return false;
    const fn = this._use[type];
    if (fn) { if (fn.call(this, kart, backward) === false) return false; }
    this.events.emit(EV.ITEM_USE, { kart, type, backward, count: Math.max(0, kart.item.count - 1) });
    kart.item.count -= 1;
    if (kart.item.count <= 0) { kart.item.type = null; kart.item.count = 0; }
    return true;
  }

  get _use() { return USE; }

  // ------------------------------------------------------------------ event handlers
  onBump({ a, b, point }) {
    const ra = this.isRammer(a), rb = this.isRammer(b);
    if (ra === rb) return;
    const [att, vic] = ra ? [a, b] : [b, a];
    const pos = point ?? vic.position;
    this.hitKart(null, vic, 'ram', pos, { kind: 'spin', dur: 1.25, guard: false }, att);
  }
  isRammer(k) { const st = k.ext.items; return !!(st && st.shieldT > 0) || k.rocket > 0; }

  onFinish(kart) {
    this.clearKartItem(kart);
    const st = this.kartState(kart);
    this.held.clear(st);
  }

  onRocket(kart, active) {
    const st = this.kartState(kart);
    if (active) st.rocketOn = true;           // (the rocket exhaust / shimmer is drawn by the VFX system from kart.rocket / kart.invincible)
    else if (st.rocketOn) {
      st.rocketOn = false;
      kart.setInvincible(1.3);
      this.events.emit(EV.ITEM_END, { kart, type: 'rocket' });
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!(dt > 0)) return;
    this.t += dt;
    const t = this.t, karts = this.session.karts;
    this.boxField.update(dt, t, karts);
    this.coinField.update(dt, t, karts);

    for (let i = 0; i < karts.length; i++) {
      const k = karts[i], st = this.kartState(k), it = k.item, r = it.roulette;
      if (st.grace > 0) st.grace -= dt;
      if (st.cometCooldown > 0) st.cometCooldown -= dt;
      if (k.ink > 0) k.ink = Math.max(0, k.ink - dt);
      if (it.type) st.heldTime += dt;
      if (st.incoming) { st.incoming.t -= dt; if (st.incoming.t <= 0) st.incoming = null; }

      // ---- roulette
      if (r.active) {
        r.timer -= dt;
        if (r.timer > 0) {
          st.rouletteNext -= dt;
          if (st.rouletteNext <= 0) {
            const f = 1 - r.timer / ROULETTE_TIME;
            st.rouletteNext += lerp(0.065, 0.23, f * f);
            st.rouletteIdx = (st.rouletteIdx + 1) % ITEM_ORDER.length;
            r.shown = ITEM_ORDER[st.rouletteIdx];
            this.events.emit(EV.ITEM_ROULETTE, { kart: k, active: true, shown: r.shown, tick: true });
          }
          if (r.timer < 0.22 && st.pending) r.shown = st.pending.type;     // lock onto the real prize just before it lands
        } else {
          r.active = false; r.shown = null;
          this.events.emit(EV.ITEM_ROULETTE, { kart: k, active: false });
          const p = st.pending ?? { type: 'boost', count: 1 };
          st.pending = null;
          this.giveItem(k, p.type, p.count);
        }
      }

      // ---- use (player presses; AI calls useItem directly and never sets input.item)
      const press = k.input.item && !st.prevUse;
      st.prevUse = k.input.item;
      if (press && it.type && !r.active && !k.locked && !k.respawn.active && !k.race.finished && !(k.rocket > 0)) this.useItem(k, k.input.brake > 0.5);

      // ---- timed effects
      if (st.shieldT > 0) {
        st.shieldT -= dt; st.shield = st.shieldT;       // `shield` (seconds left) is what the VFX system's shield bubble reads
        // speed bonus without EV.BOOST spam / boost-timer exploits: keep a small boost floor alive (physics treats it as a boost)
        const b = k.boost;
        if (b.timer < 0.12) { b.timer = 0.12; b.strength = Math.max(b.strength, 0.13); b.source = 'shield'; b.duration = Math.max(b.duration, 0.12); }
        if (st.shieldT <= 0) { st.shieldT = 0; st.shield = 0; this.events.emit(EV.ITEM_END, { kart: k, type: 'shield' }); }
      }
      if (st.zapT > 0) {
        st.zapT -= dt;
        const u = Math.max(0, st.zapT / ZAP_TIME);                      // 1 -> 0
        const cap = k.stats.topSpeed * (0.78 + 0.22 * (1 - u) * (1 - u));
        if (k.speed > cap) k.speed = damp(k.speed, cap, 5, dt);
      }

      this.held.sync(k, st, dt, t);
    }

    // ---- entities
    const ents = this.entities;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      e.update(dt);
      if (e.dead) { e.dispose(); ents.splice(i, 1); }
    }
    this.fx.update(dt);
  }

  // ------------------------------------------------------------------ debug / tests
  stats() {
    const byType = {};
    for (const e of this.entities) byType[e.type] = (byType[e.type] ?? 0) + 1;
    let held = 0, shields = 0, packs = 0;
    for (const k of this.session.karts) { const st = k.ext.items; if (st?.held) held++; if (st?.shieldT > 0) shields++; if (k.rocket > 0) packs++; }
    return {
      entities: this.entities.length, byType, held, shields, rocketPacks: packs, cometActive: !!this.cometActive,
      boxesActive: this.boxes.filter((b) => b.active).length, boxes: this.boxes.length, coins: this.coinField.coins.length, coinsActive: this.coinField.coins.filter((c) => c.active).length,
    };
  }

  /** Test helper: drop a stationary hazard on the road. */
  placeHazard(type, s, lateral = 0, owner = this.session.karts[0]) {
    const track = this.track;
    const p = track.pointAt(s, lateral, new THREE.Vector3(), 0);
    let e = null;
    if (type === 'peel') e = new PeelEntity(this, owner, true, null);
    else if (type === 'bomb') e = new BombEntity(this, owner, true, null);
    if (!e) return null;
    e.position.copy(p); e.position.y += 0.3; e.graceOwner = 0; e.age = 0;
    this.spawn(e);
    if (type === 'peel') e.land(e.project());
    else { e.state = 'ground'; e.hazard = true; e.sinceLand = 1; e.graceOwner = 0; e.project(); }
    return e;
  }

  dispose() {
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    for (const k of this.session.karts) {
      const st = k.ext.items; if (!st) continue;
      this.held.clear(st);
    }
    this.boxField.dispose(); this.coinField.dispose(); this.held.dispose(); this.fx.dispose();
    this.res.dispose(); this.tex.dispose(); disposeRibbonMaterial();
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// per-item "use" behaviours.  `this` = the ItemSystem.  Return false to refuse (item stays in the slot).
const USE = {
  boost(k) {
    k.applyBoost(0.42, 1.5, 'item');
  },
  peel(k, back) {
    this.spawn(new PeelEntity(this, k, back, back ? null : this.aimPoint(k, 'peel')));
  },
  orb(k, back) {
    this.spawn(new OrbEntity(this, k, back));
  },
  seeker(k, back) {
    this.spawn(new SeekerEntity(this, k, back));
  },
  bomb(k, back) {
    this.spawn(new BombEntity(this, k, back, back ? null : this.aimPoint(k, 'bomb')));
  },
  comet(k) {
    if (this.cometActive) return false;
    const target = this.cometTarget(k);
    if (!target) return false;
    this.kartState(k).cometCooldown = 30;
    this.spawn(new CometEntity(this, k, target));
  },
  shock(k) {
    const victims = [];
    const eye = new THREE.Vector3();
    const order = this.order(), me = order.indexOf(k);
    for (let j = 0; j < order.length; j++) {
      const v = order[j];
      if (v === k || v.race.finished || v.respawn.active) continue;
      if (me >= 0 && order.length > 3 && (j > me || j < me - ZAP_REACH)) continue;   // a comeback tool: it only slows the few karts directly AHEAD of the user
      if (v.shrink > 1 || this.kartState(v).grace > 0.5) continue;       // no stacking on a kart that is already shrunk / still reeling
      if (!v.shrinkFor(ZAP_TIME)) { this.events.emit(EV.ITEM_BLOCKED, { victim: v, type: 'shock' }); this.fx.blast(v.position, 2.5, 0xb06bff, 0.3); continue; }
      const st = this.kartState(v);
      st.zapT = ZAP_TIME;
      st.grace = Math.max(st.grace, 1.2);
      v.speed *= 0.65;
      victims.push(v);
      this.events.emit(EV.ITEM_HIT, { victim: v, attacker: k, type: 'shock', point: v.position.clone() });
      eye.set(v.position.x + (this.rand() - 0.5) * 5, v.position.y + 55, v.position.z + (this.rand() - 0.5) * 5);
      this.fx.bolt(eye, v.position, 0xfff2a0, 0.34);
      this.fx.ring(v.position, 0xfff2a0, 0.6, 5.5, 0.5);
    }
    this.fx.ring(k.position, 0xffe23a, 1, 9, 0.6);
    this.lastZapT = this.t;
    this.events.emit(EV.ITEM_SHOCK, { kart: k, victims });
  },
  shield(k) {
    const st = this.kartState(k);
    k.setInvincible(SHIELD_TIME);
    st.shieldT = SHIELD_TIME;
    this.fx.ring(k.position, 0xb06bff, 1, 6, 0.5);
    this.fx.blast(k.position, 3, 0xd2b0ff, 0.35);
  },
  rocket(k) {
    k.setRocket(ROCKET_TIME);
    k.applyBoost(0.5, 1.4, 'rocket');
    this.fx.blast(k.position, 4, 0xff8a3a, 0.4);
  },
  ink(k) {
    const order = this.order(), i = order.indexOf(k);
    let n = 0;
    const hit = (v) => {
      if (v === k || v.race.finished || v.respawn.active) return;
      if (v.isInvulnerable()) { this.events.emit(EV.ITEM_BLOCKED, { victim: v, type: 'ink' }); return; }
      v.ink = Math.max(v.ink, INK_TIME);
      this.fx.ink(k.position, v, 0.5);
      this.events.emit(EV.ITEM_HIT, { victim: v, attacker: k, type: 'ink', point: v.position.clone() });
      n++;
    };
    for (let j = Math.max(0, i - 3); j < i; j++) hit(order[j]);
    if (n === 0) for (let j = i + 1; j < Math.min(order.length, i + 3); j++) hit(order[j]);   // leading: splat the pursuers instead
  },
};
