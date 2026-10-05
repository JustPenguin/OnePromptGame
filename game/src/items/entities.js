// World entities spawned by item use: Slick Peel, Ricochet Orb, Seeker Rocket, Time Bomb, Comet.
// Every entity: { id, type, owner, position, radius, hazard, s, lat, dead, update(dt), dispose() }.  The ItemSystem owns the
// list (session.items.entities); the AI reads `hazard` entities to dodge them; audio follows `position`.
// All gameplay randomness uses session.random().  Hits go through sys.hitKart() so guards/blocks/grace are uniform.
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { TrackQuery } from '../track/SplineTrack.js';
import { clamp, wrapS, damp } from '../core/math.js';
import { Ribbon } from './Ribbon.js';

const G = 32;
const TAU = Math.PI * 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class Entity {
  constructor(sys, type, owner) {
    this.sys = sys; this.type = type; this.owner = owner;
    this.id = sys.nextEntityId++;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = 0.8;
    this.age = 0; this.life = 10; this.dead = false;
    this.hazard = false;      // the AI should steer around it
    this.kind = 'trap';       // 'trap' | 'projectile' | 'strike'
    this.s = 0; this.lat = 0; // track coordinates (kept fresh while hazard/moving)
    this.q = new TrackQuery(); this.hint = -1;
    this.group = null;
    this.onGround = false;
  }
  project() { const t = this.sys.track; t.project(this.position, this.q, this.hint); this.hint = this.q.index; this.s = this.q.s; this.lat = this.q.lateral; return this.q; }
  /** horizontal circle test against a kart (with a vertical window so airborne karts fly over ground traps) */
  touching(k, extra = 0, dyMax = 1.7) {
    if (k.respawn.active) return false;
    const dx = k.position.x - this.position.x, dz = k.position.z - this.position.z;
    const rr = this.radius + k.radius * k.scale * 0.9 + extra;
    return dx * dx + dz * dz < rr * rr && Math.abs(k.position.y + 0.5 - this.position.y) < dyMax;
  }
  update(dt) { this.age += dt; if (this.age > this.life) this.dead = true; }
  dispose() { this.group?.removeFromParent(); }
}

/** Heading-based flat forward vector of a kart (its steering intent, not the drift-offset chassis). */
export function flatForward(k, out) { return out.set(Math.sin(k.heading), 0, Math.cos(k.heading)); }

// =====================================================================================================================
// Slick Peel: a trap.  Dropped right behind the kart, or lobbed ahead onto an aim point.
export class PeelEntity extends Entity {
  constructor(sys, owner, backward, aim) {
    super(sys, 'peel', owner);
    this.radius = 0.95; this.life = 42; this.kind = 'trap';
    this.group = sys.res.make('peel'); this.group.scale.setScalar(1.0);
    sys.group.add(this.group);
    const f = flatForward(owner, _a);
    this.state = 'air';
    this.graceOwner = 0.9;
    if (backward) {
      this.position.copy(owner.position).addScaledVector(f, -2.5 * owner.scale); this.position.y += 0.5;
      this.velocity.set(owner.velocity.x * 0.25, 4.5, owner.velocity.z * 0.25);
    } else {
      this.position.copy(owner.position).addScaledVector(f, 2.0); this.position.y += 0.9;
      sys.lobTo(this, aim, 0.62);
    }
    this.group.position.copy(this.position);
    this.spinPhase = sys.rand() * TAU;
    this.project();
  }

  land(q) {
    const t = this.sys.track;
    // keep the trap on the tarmac (a lob can overshoot a narrow road)
    const lim = q.halfWidth - 0.9;
    if (Math.abs(q.lateral) > lim) { t.pointAt(q.s, Math.sign(q.lateral) * lim, this.position, 0); }
    this.project();
    this.position.y = this.q.height + 0.12;
    this.velocity.set(0, 0, 0);
    this.state = 'ground'; this.onGround = true; this.hazard = true; this.graceOwner = Math.max(0.5, this.graceOwner - this.age);
    this.sys.fx.ring(this.position, 0xd6ff5a, 0.4, 2.4, 0.35);
    this.sys.events.emit(EV.ITEM_LAND, { type: 'peel', entity: this, point: this.position });
  }

  update(dt) {
    this.age += dt;
    if (this.age > this.life) { this.dead = true; return; }
    const g = this.group;
    if (this.state === 'air') {
      this.velocity.y -= G * dt;
      this.position.addScaledVector(this.velocity, dt);
      const q = this.project();
      if (this.velocity.y < 0 && this.position.y <= q.height + 0.15) this.land(q);
      g.rotation.y += dt * 9; g.rotation.x = Math.sin(this.age * 12) * 0.2;
      g.position.copy(this.position);
      if (this.age > 3) this.dead = true;
      return;
    }
    // idle on the road: gentle wobble, blink the rim a little so it reads as "hazard"
    this.graceOwner -= dt;
    this.spinPhase += dt;
    g.position.copy(this.position); g.position.y += Math.sin(this.spinPhase * 3) * 0.02;
    g.rotation.y = this.spinPhase * 0.7; g.rotation.z = Math.sin(this.spinPhase * 2.2) * 0.05;
    if (this.age > this.life - 3) g.scale.setScalar(Math.max(0.05, (this.life - this.age) / 3));
    for (const k of this.sys.session.karts) {
      if (k === this.owner && this.graceOwner > 0) continue;
      if (!this.touching(k, 0, 1.4)) continue;
      const r = this.sys.hitKart(this, k, 'peel', this.position, { kind: 'spin', dur: 1.5, guard: false });
      if (r !== 'skip') { this.sys.fx.shatter(this.position, 8, [0xf2ff7a, 0x8fe01a, 0xffd23f]); this.dead = true; return; }
    }
  }
}

// =====================================================================================================================
// Ricochet Orb: fast ball that rolls along the road, bounces off the walls, spins the first kart it touches.
export class OrbEntity extends Entity {
  constructor(sys, owner, backward) {
    super(sys, 'orb', owner);
    this.radius = 0.72; this.life = 9; this.kind = 'projectile'; this.hazard = true;
    this.speed = 58; this.bounces = 0; this.maxBounces = 4;
    this.group = sys.res.make('orb'); sys.group.add(this.group);
    const f = flatForward(owner, _a);
    this.dir = new THREE.Vector3(backward ? -f.x : f.x, 0, backward ? -f.z : f.z);
    // gentle aim assist toward a kart roughly in front
    const tgt = sys.aimTarget(owner, backward, 70, 0.22);
    if (tgt) {
      const dx = tgt.position.x - owner.position.x, dz = tgt.position.z - owner.position.z, l = Math.hypot(dx, dz) || 1;
      this.dir.x = this.dir.x * 0.6 + (dx / l) * 0.4; this.dir.z = this.dir.z * 0.6 + (dz / l) * 0.4; this.dir.normalize();
    }
    this.position.copy(owner.position).addScaledVector(this.dir, 2.3 * owner.scale); this.position.y += 0.75;
    this.trail = new Ribbon(12); sys.group.add(this.trail.mesh);
    this.group.position.copy(this.position);
    this.project();
  }

  update(dt) {
    this.age += dt;
    if (this.age > this.life) { this.pop(); return; }
    const track = this.sys.track, W = this.sys._wall;
    const dist = this.speed * dt, n = Math.max(1, Math.ceil(dist / 0.9)), step = dist / n;
    for (let i = 0; i < n; i++) {
      this.position.x += this.dir.x * step; this.position.z += this.dir.z * step;
      const q = this.project();
      const limit = q.halfWidth + q.shoulder - this.radius;
      const over = Math.abs(q.lateral) - limit;
      if (over > 0) {
        if (q.wall) {
          const side = q.lateral >= 0 ? 1 : -1;
          let nx = -q.right.x * side, nz = -q.right.z * side; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
          const d = this.dir.x * nx + this.dir.z * nz;
          if (d < 0) { this.dir.x -= 2 * d * nx; this.dir.z -= 2 * d * nz; this.dir.normalize(); }
          this.position.x += nx * (over + 0.05); this.position.z += nz * (over + 0.05);
          this.bounces++;
          this.sys.events.emit(EV.ITEM_BOUNCE, { entity: this, type: 'orb', point: this.position, bounces: this.bounces });
          this.sys.fx.ring(this.position, 0x3dffa0, 0.3, 2.2, 0.28);
          if (this.bounces > this.maxBounces) { this.pop(); return; }
        } else if (!q.inBounds) { this.pop(); return; }
      }
      if (this.hitTest()) return;
    }
    const ty = this.q.height + 0.7 + Math.sin(this.age * 14) * 0.05;
    this.position.y = damp(this.position.y, ty, 18, dt);
    this.velocity.set(this.dir.x * this.speed, 0, this.dir.z * this.speed);
    const g = this.group; g.position.copy(this.position); g.rotation.y += dt * 10; g.rotation.x += dt * 7;
    this.trail.push(this.position.x, this.position.y, this.position.z);
    this.trail.rebuild(this.sys.session.camera.position, 0.7, 0x3dffa0, 0x0a8a50, 0.8, 0.1);
  }

  hitTest() {
    for (const k of this.sys.session.karts) {
      if (k === this.owner && this.age < 0.55) continue;
      if (!this.touching(k, 0.1, 1.8)) continue;
      const r = this.sys.hitKart(this, k, 'orb', this.position, { kind: 'spin', dur: 1.4, guard: true });
      if (r !== 'skip') { this.pop(r === 'hit'); return true; }
    }
    return false;
  }

  pop(hit = false) {
    this.sys.fx.blast(this.position, hit ? 3.2 : 2.2, 0x3dffa0, 0.35);
    this.sys.fx.shatter(this.position, hit ? 8 : 4, [0x3dffa0, 0xd6fff0]);
    this.sys.events.emit(EV.ITEM_EXPLODE, { type: 'orb', point: this.position.clone(), radius: 1.6, hit });
    this.dead = true;
  }
  dispose() { super.dispose(); this.trail.dispose(); }
}

// =====================================================================================================================
// Seeker Rocket: chases the kart ahead (or behind) in TRACK coordinates, so it follows the road around any corner.
export class SeekerEntity extends Entity {
  constructor(sys, owner, backward) {
    super(sys, 'seeker', owner);
    this.radius = 0.85; this.life = 16; this.kind = 'projectile'; this.hazard = false;
    this.backward = backward;
    this.dirS = backward ? -1 : 1;
    this.speed = Math.max(34, Math.abs(owner.speed) * 1.1);
    this.maxSpeed = 66;
    this.group = sys.res.make('seeker'); sys.group.add(this.group);
    const q = owner.query;
    this.sTrack = wrapS(q.s + this.dirS * 2.8, sys.track.length);
    this.latTrack = q.lateral;
    this.target = null; this.scan = 0; this.noTarget = 0;
    this.trail = new Ribbon(14); sys.group.add(this.trail.mesh);
    sys.track.pointAt(this.sTrack, this.latTrack, this.position, 0.7);
    this.position.y = Math.max(this.position.y, owner.position.y + 0.5);
    this.group.position.copy(this.position);
    this.setTarget(sys.seekerTarget(owner, backward));
    this.prev = new THREE.Vector3().copy(this.position);
    this.project();
    this.heading = owner.heading + (backward ? Math.PI : 0);
  }

  setTarget(k) {
    if (k === this.target) return;
    if (this.target) this.sys.events.emit(EV.ITEM_LOCK, { kart: this.target, type: 'seeker', active: false, entity: this });
    this.target = k;
    if (k) this.sys.events.emit(EV.ITEM_LOCK, { kart: k, type: 'seeker', active: true, entity: this });
  }

  update(dt) {
    this.age += dt;
    const sys = this.sys, track = sys.track, L = track.length;
    if (this.age > this.life) { this.fizzle(); return; }
    this.speed = Math.min(this.maxSpeed, this.speed + 70 * dt);
    let tgt = this.target;
    if (tgt && (tgt.race.finished)) { this.setTarget(null); tgt = null; }
    if (!tgt) {
      this.scan -= dt;
      if (this.scan <= 0) {
        this.scan = 0.2;
        this.setTarget(sys.seekerTarget(this.owner, this.backward, this.sTrack, 90));
        tgt = this.target;
      }
    }
    if (tgt) {
      this.noTarget = 0;
      const tq = tgt.query;
      const gap = track.deltaS(this.sTrack, tq.s);
      const ds = clamp(gap, -this.speed * dt, this.speed * dt);
      this.sTrack = wrapS(this.sTrack + ds, L);
      const latRate = 15 + Math.max(0, 40 - Math.abs(gap)) * 0.7;
      this.latTrack += clamp(tq.lateral - this.latTrack, -latRate * dt, latRate * dt);
      sys.lock(tgt, clamp(1 - Math.abs(gap) / 120, 0.2, 1), this);
    } else {
      this.noTarget += dt;
      this.sTrack = wrapS(this.sTrack + this.dirS * this.speed * dt, L);
      if (this.noTarget > 5) { this.fizzle(); return; }
    }
    const smp = track.sampleAt(this.sTrack);
    this.latTrack = clamp(this.latTrack, -(smp.halfWidth + smp.shoulder - 1), smp.halfWidth + smp.shoulder - 1);
    this.prev.copy(this.position);
    track.pointAt(this.sTrack, this.latTrack, this.position, 0.75);
    this.project();
    // ramps raise the surface above the sampled centreline: follow the query height
    if (this.q.height + 0.6 > this.position.y) this.position.y = this.q.height + 0.7;
    const vx = this.position.x - this.prev.x, vz = this.position.z - this.prev.z;
    if (dt > 0) this.velocity.set(vx / dt, 0, vz / dt);
    if (vx * vx + vz * vz > 1e-6) this.heading = Math.atan2(vx, vz);
    const g = this.group;
    g.position.copy(this.position); g.rotation.y = this.heading; g.rotation.z += dt * 6;
    const fl = 0.7 + 0.5 * Math.sin(this.age * 60) + 0.3 * Math.random();
    const parts = g.userData.parts; parts.flame.scale.set(1, 1, fl * 1.5); parts.glow.material.opacity = 0.6 + 0.25 * fl;
    this.trail.push(this.position.x - Math.sin(this.heading) * 0.7, this.position.y, this.position.z - Math.cos(this.heading) * 0.7);
    this.trail.rebuild(sys.session.camera.position, 0.55, 0xffc27a, 0xff4a2a, 0.75, 0.05);
    // hit test: first kart touched (the owner is safe while we clear their bumper)
    for (const k of sys.session.karts) {
      if (k === this.owner && this.age < 1.1) continue;
      if (!this.touching(k, 0.15, 2.2)) continue;
      const r = sys.hitKart(this, k, 'seeker', this.position, { kind: 'launch', vy: 9, guard: true });
      if (r !== 'skip') { this.explode(k, r); return; }
    }
  }

  explode(victim, result) {
    const sys = this.sys;
    sys.explosion(this.position, 5.5, 'seeker', 0xff6a2a);
    // small splash on neighbours
    for (const k of sys.session.karts) {
      if (k === victim || (k === this.owner && this.age < 1.4)) continue;
      const dx = k.position.x - this.position.x, dz = k.position.z - this.position.z;
      if (dx * dx + dz * dz < 3.4 * 3.4 && Math.abs(k.position.y - this.position.y) < 3) sys.hitKart(this, k, 'seeker', this.position, { kind: 'spin', dur: 1.1, guard: false });
    }
    this.setTarget(null);
    this.dead = true;
  }

  fizzle() {
    this.sys.fx.blast(this.position, 2.4, 0xff8a3a, 0.3);
    this.setTarget(null);
    this.dead = true;
  }
  dispose() { this.setTarget(null); super.dispose(); this.trail.dispose(); }
}

// =====================================================================================================================
// Time Bomb: lobbed onto an aim point (or dropped behind), bounces, then goes off on a fuse or when someone gets close.
export const BOMB_BLAST = 9.5, BOMB_INNER = 4.6, BOMB_FUSE = 4.4;
export class BombEntity extends Entity {
  constructor(sys, owner, backward, aim) {
    super(sys, 'bomb', owner);
    this.radius = 0.6; this.life = 12; this.kind = 'trap';
    this.fuse = BOMB_FUSE; this.state = 'air'; this.sinceLand = 0; this.graceOwner = 1.7;
    this.group = sys.res.make('bomb'); sys.group.add(this.group);
    const f = flatForward(owner, _a);
    if (backward) {
      this.position.copy(owner.position).addScaledVector(f, -2.6 * owner.scale); this.position.y += 0.6;
      this.velocity.set(owner.velocity.x * 0.3, 5, owner.velocity.z * 0.3);
    } else {
      this.position.copy(owner.position).addScaledVector(f, 2.0); this.position.y += 1.0;
      sys.lobTo(this, aim, aim.T ?? 0.85, 0.6);
    }
    this.group.position.copy(this.position);
    // blast-radius marker (only visible in the last second)
    this.marker = new THREE.Mesh(sys.res.geo.disc, sys.res.mats.flatAdd.clone()); this.marker.material.color.set(0xff5a1a); this.marker.material.opacity = 0;
    this.marker.scale.setScalar(BOMB_BLAST); this.marker.renderOrder = 2; this.marker.visible = false; sys.group.add(this.marker);
    this.project();
  }

  update(dt) {
    this.age += dt; this.fuse -= dt;
    const sys = this.sys, g = this.group;
    if (this.fuse <= 0) { this.detonate(null); return; }
    if (this.state === 'air') {
      this.velocity.y -= G * dt;
      this.position.addScaledVector(this.velocity, dt);
      const q = this.project();
      if (this.velocity.y < 0 && this.position.y <= q.height + 0.58) {
        this.position.y = q.height + 0.58;
        if (-this.velocity.y > 5) { this.velocity.y = -this.velocity.y * 0.3; this.velocity.x *= 0.4; this.velocity.z *= 0.4; sys.events.emit(EV.ITEM_BOUNCE, { entity: this, type: 'bomb', point: this.position, bounces: 1 }); }
        else { this.state = 'ground'; this.velocity.y = 0; this.hazard = true; this.onGround = true; sys.events.emit(EV.ITEM_LAND, { type: 'bomb', entity: this, point: this.position }); }
      }
      // never leave the corridor
      if (!q.inBounds && q.wall) { this.velocity.x *= 0.3; this.velocity.z *= 0.3; }
    } else {
      this.sinceLand += dt;
      const fr = Math.exp(-4.5 * dt);
      this.velocity.x *= fr; this.velocity.z *= fr;
      this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt;
      const q = this.project();
      const lim = q.halfWidth + q.shoulder - 0.7;
      if (Math.abs(q.lateral) > lim) sys.track.pointAt(q.s, Math.sign(q.lateral) * lim, this.position, 0);
      this.project();
      this.position.y = this.q.height + 0.58;
    }
    // blink: faster as the fuse burns down
    const k = 1 - this.fuse / BOMB_FUSE;
    const rate = 3 + 13 * k * k;
    const blink = 0.5 + 0.5 * Math.sin(this.age * rate * Math.PI * 2 * 0.5);
    const parts = g.userData.parts;
    parts.blink.material.opacity = (0.2 + 0.6 * blink) * (0.3 + k);
    parts.spark.material.opacity = 0.7 + 0.3 * blink; parts.spark.scale.setScalar(0.7 + 0.5 * blink);
    g.position.copy(this.position); g.rotation.y += dt * 1.5;
    const warn = clamp((1.2 - this.fuse) / 1.2, 0, 1);
    this.marker.visible = warn > 0 && this.state === 'ground';
    if (this.marker.visible) { this.marker.position.set(this.position.x, this.q.height + 0.12, this.position.z); this.marker.material.opacity = warn * (0.1 + 0.12 * blink); }
    this.graceOwner -= dt;
    if (this.state === 'ground' && this.sinceLand > 0.3) {
      for (const kt of sys.session.karts) {
        if (kt === this.owner && this.graceOwner > 0) continue;
        if (kt.respawn.active || kt.race.finished) continue;
        const dx = kt.position.x - this.position.x, dz = kt.position.z - this.position.z;
        const rr = 2.5 + kt.radius * kt.scale * 0.4;
        if (dx * dx + dz * dz < rr * rr && Math.abs(kt.position.y - this.position.y) < 2.2) { this.detonate(kt); return; }
      }
    }
  }

  detonate(trigger) {
    const sys = this.sys, p = this.position;
    sys.explosion(p, BOMB_BLAST, 'bomb', 0xff7a1a);
    for (const k of sys.session.karts) {
      const dx = k.position.x - p.x, dz = k.position.z - p.z, d = Math.hypot(dx, dz);
      if (d > BOMB_BLAST || Math.abs(k.position.y - p.y) > 5) continue;
      if (k === this.owner && this.age < 0.35) continue;
      if (d < BOMB_INNER) sys.hitKart(this, k, 'bomb', p, { kind: 'launch', vy: 12.5, guard: false });
      else sys.hitKart(this, k, 'bomb', p, { kind: 'spin', dur: 1.15, guard: false });
    }
    this.dead = true;
  }
  dispose() { super.dispose(); this.marker.removeFromParent(); this.marker.material.dispose(); this.group.userData.parts.blink.material.dispose(); }
}

// =====================================================================================================================
// Comet: a high, fast fireball that arcs over the pack and dives onto the race leader.  Area blast; a shield saves you.
export const COMET_BLAST = 12.5;
export class CometEntity extends Entity {
  constructor(sys, owner, target) {
    super(sys, 'comet', owner);
    this.radius = 1; this.life = 8; this.kind = 'strike';
    this.target = target;
    this.T = 3.4;
    this.start = new THREE.Vector3().copy(owner.position); this.start.y += 2.5;
    this.group = sys.res.make('comet'); this.group.scale.setScalar(1.15); sys.group.add(this.group);
    this.trail = new Ribbon(18); sys.group.add(this.trail.mesh);
    this.marker = new THREE.Mesh(sys.res.geo.disc, sys.res.mats.flatAdd.clone()); this.marker.material.color.set(0x66b3ff); this.marker.material.opacity = 0; this.marker.visible = false; this.marker.renderOrder = 2; sys.group.add(this.marker);
    this.ring = new THREE.Mesh(sys.fx.planeGeo, new THREE.MeshBasicMaterial({ map: sys.res.tex.ring, color: 0x9fd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.ring.visible = false; this.ring.renderOrder = 3; sys.group.add(this.ring);
    this.position.copy(this.start);
    this.group.position.copy(this.position);
    this.locked = false;
    this.last = new THREE.Vector3().copy(target.position);
    sys.cometActive = this;
  }

  update(dt) {
    this.age += dt;
    const sys = this.sys;
    let tgt = this.target;
    if (tgt.race.finished || tgt.respawn.active) { const alt = sys.cometTarget(this.owner); if (alt) { this.target = tgt = alt; } }
    const u = clamp(this.age / this.T, 0, 1);
    const e = Math.pow(u, 1.55);
    this.last.copy(tgt.position); this.last.y = tgt.position.y;
    const hx = this.start.x + (this.last.x - this.start.x) * e, hz = this.start.z + (this.last.z - this.start.z) * e;
    const baseY = this.start.y + (this.last.y - this.start.y) * e;
    const H = 40;
    let h;
    if (u < 0.3) h = H * Math.sin((u / 0.3) * Math.PI / 2);
    else if (u < 0.55) h = H;
    else h = H * (1 - Math.pow((u - 0.55) / 0.45, 1.7));
    this.position.set(hx, baseY + h, hz);
    this.velocity.set(0, 0, 0);
    const g = this.group; g.position.copy(this.position); g.rotation.y += dt * 4; g.rotation.x += dt * 2.5;
    const fl = 0.85 + 0.15 * Math.sin(this.age * 40);
    g.userData.parts.glow.scale.setScalar(7 * fl); g.userData.parts.star.material.rotation += dt * 3;
    this.trail.push(this.position.x, this.position.y, this.position.z);
    this.trail.rebuild(sys.session.camera.position, 3.2 * fl, 0xe6f4ff, 0x2f7bff, 0.95, 0.05);
    // ground warning on the target from u > 0.45
    if (u > 0.45) {
      if (!this.locked) { this.locked = true; sys.events.emit(EV.ITEM_LOCK, { kart: tgt, type: 'comet', active: true, entity: this }); }
      const w = clamp((u - 0.45) / 0.55, 0, 1);
      this.marker.visible = this.ring.visible = true;
      this.marker.position.set(tgt.position.x, tgt.position.y + 0.15, tgt.position.z);
      this.marker.scale.setScalar(COMET_BLAST * (0.35 + 0.65 * w));
      const pulse = 0.5 + 0.5 * Math.sin(this.age * (10 + 18 * w));
      this.marker.material.opacity = (0.08 + 0.2 * w) * (0.5 + 0.5 * pulse);
      this.ring.position.set(tgt.position.x, tgt.position.y + 0.3, tgt.position.z); this.ring.scale.setScalar(COMET_BLAST * (1.25 - 0.55 * w)); this.ring.material.opacity = 0.3 + 0.6 * w;
      sys.lock(tgt, 1, this);
    }
    if (u >= 1) this.impact();
  }

  impact() {
    const sys = this.sys, p = _c.set(this.last.x, this.last.y, this.last.z);
    sys.explosion(p, COMET_BLAST, 'comet', 0x6aa8ff, 1.5);
    for (const k of sys.session.karts) {
      const dx = k.position.x - p.x, dz = k.position.z - p.z, d = Math.hypot(dx, dz);
      if (d > COMET_BLAST || Math.abs(k.position.y - p.y) > 8) continue;
      if (k === this.target) sys.hitKart(this, k, 'comet', p, { kind: 'launch', vy: 15, guard: false });
      else if (d < COMET_BLAST * 0.55) sys.hitKart(this, k, 'comet', p, { kind: 'launch', vy: 11, guard: false });
      else sys.hitKart(this, k, 'comet', p, { kind: 'spin', dur: 1.2, guard: false });
    }
    this.dead = true;
  }

  dispose() {
    if (this.locked) this.sys.events.emit(EV.ITEM_LOCK, { kart: this.target, type: 'comet', active: false, entity: this });
    if (this.sys.cometActive === this) this.sys.cometActive = null;
    super.dispose(); this.trail.dispose();
    this.marker.removeFromParent(); this.marker.material.dispose(); this.ring.removeFromParent(); this.ring.material.dispose();
  }
}
