// Visual effects hub. OWNER: Agent C (vfx).
// Contract (keep stable; other agents call these and must not crash if an effect name is unknown):
//   new VFX(session)   .group (added to session.scene by the session)   .update(dt)   .dispose()
//   vfx.spawn(name, position, opts)   one-shot effects.  Known names (unknown -> silent no-op):
//        'explosion' {scale,color}  'sparkle' {color}  'smoke'  'hitStars'  'boostBurst' {color}  'pickup' {color}
//        'confetti'  'splash'  'dust' {color}  'ring' {color,radius}  'respawn'  'shockwave'
//   vfx.spawnForKart(kart, 'emote', {kind})  /  vfx.emote(kart, kind): speech-bubble emotes (anger shock note heart sweat question star zzz)
//   vfx.spawnForKart(kart, name, opts)   same but anchored to a kart
// VFX listens to session.events (drift sparks by level, boost flames, wall sparks, landings, item hits...) and reads
// kart state every frame (dust off-road, tyre smoke while drifting, skid marks, status trails).  session.quality.particles scales counts.
//
// Rendering budget: 2 draw calls of particles (additive + alpha), 1 skid-mark ribbon, 1 instanced flame mesh, 1 instanced blob shadow,
// plus pooled drones / shield bubbles only while active.  No per-frame allocation in update().
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { Surface, SURFACE_PROPS } from '../track/surfaces.js';
import { clamp, mulberry32 } from '../core/math.js';
import { getSpriteAtlas, SPR } from './sprites.js';
import { ParticleLayer } from './particles.js';
import { SkidMarks } from './skids.js';
import { FlameSystem } from './flames.js';
import { BeamSystem } from './beams.js';
import { EmoteBubbles } from './emotes.js';
import { BlobShadows } from './shadows.js';
import { RescueDrone } from './drone.js';
import { ShieldBubbles } from './bubbles.js';

const FAR2 = 160 * 160;           // karts further than this from the camera emit no particles
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const LV = [[0.95, 0.95, 1.0], hex('#3aa0ff'), hex('#ff9a1f'), hex('#ff3dcb')];   // drift level 0..3 spark colours (linear)
const CYAN = hex('#22d3ff'), GOLD = hex('#ffd23f'), HOT = hex('#ff8a1f'), WHITE = [1, 1, 1], PINK = hex('#ff3d6a');
const CONFETTI = [hex('#ff3d6a'), hex('#ffd23f'), hex('#22d3ff'), hex('#7be04a'), hex('#8b4dff'), hex('#ff7a1a'), hex('#ffffff')];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qq = new THREE.Quaternion(), _exq = new THREE.Quaternion();
const _Z = new THREE.Vector3(0, 0, 1), _X = new THREE.Vector3(1, 0, 0), _ed = new THREE.Vector3(), _dw = new THREE.Vector3();
const _qp = new THREE.Quaternion().setFromAxisAngle(_X, 0.07), _qb = new THREE.Quaternion();
const _white = [1, 1, 1];
const R = Object.freeze({ SM0: 0, SM1: 1, SP0: 2, SP1: 3, DU0: 4, DU1: 5, SCR: 6, FL0: 7, FL1: 8, FS0: 9, FS1: 10, INV: 11, DR: 12 });   // emission accumulator slots
// constant colours used in per-frame paths (never allocate array literals there)
const SMOKE_ICE = [0.8, 0.92, 1], SMOKE_ROAD = [0.9, 0.9, 0.93], SMOKE_ROCKET = [0.22, 0.2, 0.2], SMOKE_BOOST = [0.62, 0.7, 0.78];
const SPLASH_C = [0.7, 0.88, 1], DUST_C = [0.7, 0.62, 0.48];

const SURF_FX = (() => {
  const t = [];
  for (let s = 0; s < SURFACE_PROPS.length; s++) {
    const p = SURFACE_PROPS[s];
    t.push(p.particle ? { rgb: hex(p.particle), size: s === Surface.SNOW ? 1.25 : s === Surface.MUD ? 0.85 : 1, up: s === Surface.WATER ? 3.4 : s === Surface.SNOW ? 1.1 : 1.8, a: s === Surface.SNOW ? 0.7 : 0.55, chunk: s === Surface.MUD || s === Surface.SAND, drop: s === Surface.WATER, frame: s === Surface.SNOW ? SPR.PUFF3 : SPR.DUST } : null);
  }
  return t;
})();

/** Rainbow colour from a 0..1 phase into out[0..2] (linear-ish, vivid). */
function rainbow(h, out) {
  const f = (n) => { const k = (n + h * 6) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)); };
  out[0] = 0.15 + f(5) * 0.95; out[1] = 0.15 + f(3) * 0.95; out[2] = 0.15 + f(1) * 0.95;
  return out;
}
const _rb = [0, 0, 0];

export class VFX {
  constructor(session) {
    this.session = session;
    this.group = new THREE.Group();
    this.group.name = 'vfx';
    this.time = 0;
    this.rng = mulberry32(0x51f15e);
    this.q = session.app?.renderer?.quality ?? session.quality;
    this.pm = clamp(this.q?.particles ?? 1, 0.2, 1.5);
    /** colour gain for additive particles: >1 only makes sense when bloom/HDR is active (GameRenderer sets renderer.hdr) */
    this.gain = 0.55;
    const map = getSpriteAtlas();
    this.add = new ParticleLayer({ capacity: Math.round(6500 * Math.max(0.4, this.pm)), additive: true, map });
    this.alpha = new ParticleLayer({ capacity: Math.round(4500 * Math.max(0.4, this.pm)), additive: false, map });
    this.skids = new SkidMarks(Math.round(2600 * Math.max(0.35, this.pm)), 9);
    this.flames = new FlameSystem(36);
    this.beams = new BeamSystem(Math.max(24, (session.karts?.length ?? 8) * 2 + 4));
    this.emotes = new EmoteBubbles();
    /** emote bubbles over drivers (hit / overtaken / finish ...): set false to disable */
    this.emotesOn = true;
    /** headlight beams: on by default for dark tracks (night / dusk sky), switchable with setHeadlights() */
    this.headlights = false;
    this.shadows = new BlobShadows(Math.max(16, (session.karts?.length ?? 8) + 2));
    this.bubbles = new ShieldBubbles(6);
    this.drones = [];
    this.group.add(this.shadows.mesh, this.skids.mesh, this.beams.mesh, this.alpha.mesh, this.add.mesh, this.flames.mesh, this.emotes.mesh);
    this.bubbles.attachTo(this.group);
    this._sceneSync = 0;
    // seconds of Prism Shield / star / Rocket Rider protection left (one look for all of them: kart shimmer + this bubble + sparkles)
    this._shieldLeft = (k) => {
      const it = k.ext?.items;
      if (it?.bubble || k.respawn?.active) return 0;        // Agent D's own bubble on screen (or a rescue in progress): never draw a second one
      let l = k.invincible > 0 ? k.invincible : 0;
      if (k.rocket > l) l = k.rocket;
      if (it?.shieldT > l) l = it.shieldT;
      if (k.ext?.shield > l) l = k.ext.shield;
      if (k.shield > l) l = k.shield;
      return l;
    };
    this._shieldHot = (k) => k.rocket > 0;
    this._light = new THREE.Color(1, 1, 1);
    this._camPos = session.camera?.position ?? null;
    this._wire(session);
    this.headlights = this._isDark();
  }

  /** Turn the headlight beams on/off (default: on when the track's sky/fog is dark). */
  setHeadlights(on) { this.headlights = !!on; }
  /** Pop an emote bubble over a kart's driver: kind = 'anger'|'shock'|'note'|'heart'|'sweat'|'question'|'star'|'zzz' (a kart shows one at a time, rate-limited). */
  emote(kart, kind, dur = 1.4) {
    if (!this.emotesOn || !kart) return false;
    const st = this.st(kart);
    if (this.time < (st.emoteCool ?? 0)) return false;
    st.emoteCool = this.time + 0.9;
    return this.emotes.show(kart, kind, dur);
  }
  _isDark() {
    const S = this.session, d = S.track?.def;
    if (d?.night !== undefined) return !!d.night;
    if (d?.headlights !== undefined) return !!d.headlights;
    const c = S.scene?.fog?.color ?? (S.scene?.background?.isColor ? S.scene.background : null);
    if (!c) return false;
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.16;   // linear luminance of the horizon / fog colour
  }

  // ------------------------------------------------------------------------------------------ small random helpers
  r() { return this.rng(); }
  sr() { return this.rng() * 2 - 1; }
  cnt(x) { const n = Math.floor(x); return n + (this.rng() < x - n ? 1 : 0); }
  st(k) {
    let s = k.ext.vfx;
    if (!s) s = k.ext.vfx = { acc: new Float64Array(16), skidL: this.skids.slot(k.id * 2), skidR: this.skids.slot(k.id * 2 + 1), flame: 0, boostLevel: 0, boostSrc: '', boostT: 0, scrape: false, burnout: 0, lastLand: 0, shield: 0, starPhase: this.rng() };
    return s;
  }
  /** Emission accumulator `slot` (0..15) of a kart's state: how many particles to spawn this step at `perSec` (typed array: no boxing / allocation). */
  rate(st, slot, perSec, dt) { const acc = st.acc; const a = acc[slot] + perSec * this.pm * dt; const n = a | 0; acc[slot] = a - n; return n > 6 ? 6 : n; }

  // ------------------------------------------------------------------------------------------ particle shorthands
  /** additive spark / streak */
  spark(x, y, z, vx, vy, vz, life, size, c, gain = 2.2, grav = 11, drag = 0.5, stretch = 0.02, frame = SPR.DOT) {
    gain *= this.gain;
    // hot start: the colour is pushed toward white at birth and settles into the effect colour over the spark's life
    const hot = 0.3;
    this.add.spawn(x, y, z, vx, vy, vz, life, size, size * 0.35, (c[0] + (1 - c[0]) * hot) * gain, (c[1] + (1 - c[1]) * hot) * gain, (c[2] + (1 - c[2]) * hot) * gain, 1, c[0], c[1] * 0.6, c[2] * 0.6, 0, frame, drag, grav, stretch, 0, 0, 0, 2);
  }
  /** additive soft sprite that does not move (flashes, ground glows) */
  glow(x, y, z, s0, s1, c, a, life, frame = SPR.SOFT) {
    this.add.spawn(x, y, z, 0, 0, 0, life, s0, s1, c[0], c[1], c[2], a, c[0], c[1], c[2], 0, frame, 0, 0, 0, 0, 0, 0, 0);
  }
  /** additive light pool lying flat on the ground (no hard clipping against the road) */
  pool(x, y, z, s0, s1, c, a, life) {
    this.add.spawn(x, y + 0.045, z, 0, 0, 0, life, s0, s1, c[0], c[1], c[2], a, c[0], c[1], c[2], 0, SPR.GLOW, 0, 0, 0, 0, 0, 0, 1);
  }
  /** additive star / flare */
  star(x, y, z, vx, vy, vz, life, size, c, gain = 2, frame = SPR.STAR5, grav = 0, rotSp = 3) {
    gain *= this.gain;
    this.add.spawn(x, y, z, vx, vy, vz, life, size, size * 0.2, c[0] * gain, c[1] * gain, c[2] * gain, 1, c[0], c[1], c[2], 0, frame, 1.2, grav, 0, this.r() * 6.28, rotSp * this.sr(), 0.05, 0);
  }
  /** additive ground-aligned ring */
  ring(x, y, z, s0, s1, life, c, a = 0.9, gain = 1.6) {
    gain *= this.gain;
    this.add.spawn(x, y + 0.05, z, 0, 0, 0, life, s0, s1, c[0] * gain, c[1] * gain, c[2] * gain, a, c[0], c[1], c[2], 0, SPR.RING, 0, 0, 0, 0, 0, 0, 1);
  }
  /** additive camera-facing ring (speed ring pop) */
  ringBB(x, y, z, s0, s1, life, c, a = 0.8, gain = 1.8) {
    gain *= this.gain;
    this.add.spawn(x, y, z, 0, 0, 0, life, s0, s1, c[0] * gain, c[1] * gain, c[2] * gain, a, c[0], c[1], c[2], 0, SPR.RING, 0, 0, 0, 0, 0, 0, 0);
  }
  /** alpha puff (smoke / dust) */
  puff(x, y, z, vx, vy, vz, life, s0, s1, c, a, frame, drag = 1.6, grav = -0.3) {
    this.alpha.spawn(x, y, z, vx, vy, vz, life, s0, s1, c[0], c[1], c[2], a, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, 0, frame, drag, grav, 0, this.r() * 6.28, this.sr() * 0.9, 0.08, 0);
  }
  /** alpha solid chunk (debris / mud) */
  chunk(x, y, z, vx, vy, vz, life, size, c, grav = 16) {
    this.alpha.spawn(x, y, z, vx, vy, vz, life, size, size * 0.8, c[0], c[1], c[2], 1, c[0], c[1], c[2], 0, SPR.CHUNK, 0.15, grav, 0, this.r() * 6.28, this.sr() * 9, 0, 0);
  }
  pf() { return SPR.PUFF1 + ((this.rng() * 3) | 0); }

  // ------------------------------------------------------------------------------------------ one-shot effects (public)
  /** @param {string} name  @param {THREE.Vector3} position  @param {object} [opts] */
  spawn(name, position, opts) {
    if (!position) return;
    opts = opts ?? {};
    const x = position.x, y = position.y, z = position.z;
    if (x + y + z - (x + y + z) !== 0) return;                 // NaN / Infinity position: ignore (it would poison the HDR chain)
    // every option is normalised ONCE here: colours may be '#hex' strings, numbers, THREE.Color or [r,g,b]; numbers must be finite
    const col = opts.color != null ? this._rgb(opts.color) : undefined;
    const sc = Number.isFinite(opts.scale) ? opts.scale : 1;
    switch (name) {
      case 'explosion': this._explosion(x, y, z, sc, col); break;
      case 'sparkle': this._sparkle(x, y, z, col ?? null, Number.isFinite(opts.count) ? opts.count : 22); break;
      case 'smoke': for (let i = this.cnt(8); i-- > 0;) this.puff(x + this.sr() * 0.3, y + 0.2, z + this.sr() * 0.3, this.sr() * 1.2, 1 + this.r() * 1.5, this.sr() * 1.2, 1.0 + this.r() * 0.8, 0.5, 2.2, [0.5, 0.5, 0.54], 0.4, this.pf()); break;
      case 'hitStars': this._hitStars(x, y, z); break;
      case 'boostBurst': this._boostBurst(x, y, z, col ?? CYAN, opts.dir ?? null, sc); break;
      case 'pickup': this._pickup(x, y, z, col ?? CYAN); break;
      case 'confetti': this._confetti(x, y, z, Number.isFinite(opts.count) ? opts.count : 110); break;
      case 'splash': this._splash(x, y, z, col ?? SPLASH_C, sc); break;
      case 'dust': this._dustBurst(x, y, z, col ?? DUST_C, sc); break;
      case 'ring': this.ring(x, y, z, 0.3, (Number.isFinite(opts.radius) ? opts.radius : 3) * 2, 0.5, col ?? CYAN); break;
      case 'respawn': this._respawnPop(x, y, z); break;
      case 'shockwave': this._shockwave(x, y, z, sc); break;
      default: break; // unknown names are a silent no-op by contract
    }
  }

  /** Anchored variant: positions come from the kart (head / exhausts / wheels). */
  spawnForKart(kart, name, opts) {
    if (!kart) return;
    opts = opts ?? {};
    const vis = kart.visual;
    switch (name) {
      case 'emote': this.emote(kart, opts.kind ?? 'shock', opts.duration ?? 1.4); return;
      case 'hitStars': if (vis?.mountWorld) { vis.mountWorld('head', _a, kart); this._hitStars(_a.x, _a.y + 0.55, _a.z); return; } break;
      case 'boostBurst': {
        if (vis?.mountWorld) {
          for (const m of ['exhaustL', 'exhaustR']) { vis.mountWorld(m, _a, kart); this._boostBurst(_a.x, _a.y, _a.z, opts.color != null ? this._rgb(opts.color) : CYAN, kart.forward, 0.7); }
          return;
        }
        break;
      }
      case 'sparkle': case 'respawn': case 'explosion': case 'smoke': case 'pickup': {
        if (vis?.mountWorld) { vis.mountWorld('head', _a, kart); this.spawn(name, _a, opts); return; }
        break;
      }
      case 'confetti': _a.copy(kart.position); _a.y += 1; this.spawn(name, _a, opts); return;
      default: break;
    }
    this.spawn(name, kart.position, opts);
  }

  /** Any colour spelling -> a finite [r, g, b] (linear): '#hex' / css strings, numbers, THREE.Color, arrays; anything else = white. */
  _rgb(c) {
    if (Array.isArray(c)) return c.length >= 3 && Number.isFinite(c[0] + c[1] + c[2]) ? c : WHITE;
    if (typeof c === 'string' || typeof c === 'number') { const k = new THREE.Color(c); return Number.isFinite(k.r + k.g + k.b) ? [k.r, k.g, k.b] : WHITE; }
    if (c?.isColor) return Number.isFinite(c.r + c.g + c.b) ? [c.r, c.g, c.b] : WHITE;
    return WHITE;
  }

  _explosion(x, y, z, s, color) {
    const base = color ? this._rgb(color) : HOT;
    // hot core flash + big soft glow
    this.glow(x, y + 0.6 * s, z, 1.2 * s, 9 * s, [1, 0.95, 0.8], 1, 0.2);
    this.glow(x, y + 0.5 * s, z, 2 * s, 12 * s, base, 0.8, 0.45);
    // fireball puffs (additive)
    for (let i = this.cnt(16); i-- > 0;) {
      const a = this.r() * 6.283, e = this.r() * 1.2, sp = (2 + this.r() * 7) * s;
      this.add.spawn(x, y + 0.5 * s, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp * 0.9 + 1.5 * s, Math.sin(a) * Math.cos(e) * sp, 0.55 + this.r() * 0.5, 1.3 * s, (3 + this.r() * 2.2) * s,
        base[0] * 2.4, base[1] * 2.1, base[2] * 1.2, 0.9, 0.35, 0.05, 0.01, 0, this.pf(), 2.6, -1.4, 0, this.r() * 6.28, this.sr() * 1.2, 0.04, 0);
    }
    // shockwave rings (ground + camera-facing)
    this.ring(x, y, z, 0.8 * s, 11 * s, 0.5, [1, 0.9, 0.7], 0.9, 2);
    this.ring(x, y, z, 0.5 * s, 6.5 * s, 0.38, base, 0.8, 2);
    this.ringBB(x, y + 0.6 * s, z, 0.8 * s, 8 * s, 0.34, [1, 0.85, 0.6], 0.55, 2.2);
    // sparks + debris + smoke
    for (let i = this.cnt(46); i-- > 0;) {
      const a = this.r() * 6.283, e = this.r() * 1.4 + 0.1, sp = (8 + this.r() * 16) * s;
      this.spark(x, y + 0.4, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp, 0.5 + this.r() * 0.7, 0.07 + this.r() * 0.06, this.r() < 0.5 ? HOT : GOLD, 3, 16, 0.7, 0.022);
    }
    for (let i = this.cnt(14); i-- > 0;) {
      const a = this.r() * 6.283, sp = (4 + this.r() * 10) * s;
      this.chunk(x, y + 0.5, z, Math.cos(a) * sp, 5 + this.r() * 9, Math.sin(a) * sp, 1.0 + this.r() * 0.8, (0.16 + this.r() * 0.2) * s, [0.1 + this.r() * 0.1, 0.1, 0.1 + this.r() * 0.08], 22);
    }
    for (let i = this.cnt(12); i-- > 0;) {
      const a = this.r() * 6.283, sp = (1 + this.r() * 3.5) * s;
      this.puff(x + Math.cos(a) * 0.6 * s, y + 0.6 * s, z + Math.sin(a) * 0.6 * s, Math.cos(a) * sp, 1.2 + this.r() * 3, Math.sin(a) * sp, 1.6 + this.r() * 1.0, 1.2 * s, (3.4 + this.r() * 1.6) * s, [0.16, 0.16, 0.18], 0.55, this.pf(), 1.4, -0.6);
    }
    // screen flash if it happens near the camera
    const cam = this.session.camera;
    const r = this.session.app?.renderer;
    if (cam && r?.flash) { const d = cam.position.distanceTo(_a.set(x, y, z)); if (d < 30) r.flash(1, 0.82, 0.55, 0.55 * (1 - d / 30) * Math.min(1.5, s)); }
  }

  _sparkle(x, y, z, color, count) {
    for (let i = this.cnt(count); i-- > 0;) {
      const c = color ? this._rgb(color) : rainbow(this.r(), _rb);
      const a = this.r() * 6.283, sp = 1.5 + this.r() * 4;
      this.star(x + this.sr() * 0.4, y + this.r() * 0.6, z + this.sr() * 0.4, Math.cos(a) * sp, 1 + this.r() * 4, Math.sin(a) * sp, 0.5 + this.r() * 0.6, 0.18 + this.r() * 0.22, c, 2, this.r() < 0.5 ? SPR.STAR5 : SPR.FLARE, 3);
    }
    this.glow(x, y + 0.4, z, 0.4, 3, color ? this._rgb(color) : [1, 0.95, 0.7], 0.8, 0.28);
  }

  _hitStars(x, y, z) {
    this.glow(x, y, z, 0.5, 4.2, [1, 0.95, 0.6], 1, 0.16);
    this.ringBB(x, y, z, 0.5, 4.5, 0.3, [1, 0.9, 0.5], 0.8, 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 + this.r() * 0.4, sp = 3.5 + this.r() * 2.5;
      this.star(x, y, z, Math.cos(a) * sp, 2.5 + this.r() * 2.5, Math.sin(a) * sp, 0.7 + this.r() * 0.3, 0.32, GOLD, 2.4, SPR.STAR5, 11);
    }
    for (let i = this.cnt(10); i-- > 0;) { const a = this.r() * 6.283; this.spark(x, y, z, Math.cos(a) * 7, 2 + this.r() * 5, Math.sin(a) * 7, 0.35, 0.06, WHITE, 2.5, 12, 0.6, 0.02); }
  }

  /** electric crackle over one kart (shock item victims) */
  _zap(k) {
    if (!k?.position) return;
    const sc = k.scale ?? 1;
    for (let i = this.cnt(16); i-- > 0;) {
      const a = this.r() * 6.283, e = this.sr() * 0.9, sp = 3 + this.r() * 6;
      this.spark(k.position.x + Math.cos(a) * 0.6 * sc, k.position.y + (0.3 + this.r() * 1.2) * sc, k.position.z + Math.sin(a) * 0.6 * sc, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1.5, Math.sin(a) * Math.cos(e) * sp, 0.2 + this.r() * 0.25, 0.09 + this.r() * 0.06, this.r() < 0.5 ? CYAN : WHITE, 3, 6, 1.2, 0.04);
    }
    this.glow(k.position.x, k.position.y + 0.8 * sc, k.position.z, 0.6 * sc, 3.2 * sc, CYAN, 0.8, 0.2);
    this.emote(k, 'shock', 1.1);
  }

  _boostBurst(x, y, z, c, dir, scale) {
    this.glow(x, y, z, 0.3 * scale, 3.2 * scale, c, 0.9, 0.18);
    this.ringBB(x, y, z, 0.4 * scale, 3.8 * scale, 0.32, c, 0.75, 2);
    const dx = dir ? -dir.x : 0, dz = dir ? -dir.z : 0;
    for (let i = this.cnt(26); i-- > 0;) {
      const a = this.r() * 6.283, sp = 4 + this.r() * 9;
      const vx = dir ? dx * (6 + this.r() * 10) + Math.cos(a) * 2.6 : Math.cos(a) * sp, vz = dir ? dz * (6 + this.r() * 10) + Math.sin(a) * 2.6 : Math.sin(a) * sp;
      this.spark(x, y, z, vx, (this.r() - 0.2) * 3.2, vz, 0.25 + this.r() * 0.3, 0.09 * scale + this.r() * 0.05, c, 3, 3, 1.2, 0.04);
    }
  }

  _pickup(x, y, z, c) {
    this.ring(x, y - 0.3, z, 0.4, 5, 0.45, c, 0.9, 1.8);
    this.ringBB(x, y, z, 0.3, 3.4, 0.35, c, 0.8, 1.8);
    for (let i = this.cnt(22); i-- > 0;) {
      const a = this.r() * 6.283, sp = 1.5 + this.r() * 3.8;
      this.star(x, y, z, Math.cos(a) * sp, 1.5 + this.r() * 4.5, Math.sin(a) * sp, 0.6 + this.r() * 0.5, 0.18 + this.r() * 0.18, this.r() < 0.5 ? c : WHITE, 2.2, this.r() < 0.5 ? SPR.STAR5 : SPR.FLARE, 4);
    }
    this.glow(x, y, z, 0.5, 3.5, c, 0.9, 0.22);
  }

  _confetti(x, y, z, count) {
    for (let i = this.cnt(count); i-- > 0;) {
      const c = CONFETTI[(this.r() * CONFETTI.length) | 0];
      const a = this.r() * 6.283, d = this.r() * 3.2;
      this.alpha.spawn(x + Math.cos(a) * d, y + 2.5 + this.r() * 4, z + Math.sin(a) * d, this.sr() * 2.4, 1.5 + this.r() * 4, this.sr() * 2.4, 3.2 + this.r() * 1.8, 0.2 + this.r() * 0.12, 0.2, c[0] * 1.4, c[1] * 1.4, c[2] * 1.4, 1, c[0], c[1], c[2], 0.0, SPR.CONFETTI, 0.9, 4.5, 0, this.r() * 6.283, this.sr() * 9, 0.02, 0);
    }
  }

  _splash(x, y, z, c, s) {
    this.ring(x, y, z, 0.3, 3.4 * s, 0.5, c, 0.7, 1.1);
    for (let i = this.cnt(16); i-- > 0;) {
      const a = this.r() * 6.283, sp = 1.2 + this.r() * 3;
      this.alpha.spawn(x, y + 0.1, z, Math.cos(a) * sp, 4 + this.r() * 4.5, Math.sin(a) * sp, 0.55 + this.r() * 0.3, 0.2 * s, 0.1 * s, c[0], c[1], c[2], 0.9, c[0], c[1], c[2], 0, SPR.DROP, 0.3, 14, 0, this.r() * 6.283, 0, 0, 0);
    }
    for (let i = this.cnt(5); i-- > 0;) this.puff(x + this.sr() * 0.4, y + 0.2, z + this.sr() * 0.4, this.sr() * 1.4, 1.2 + this.r(), this.sr() * 1.4, 0.8, 0.6 * s, 1.8 * s, [0.85, 0.93, 1], 0.45, SPR.PUFF2, 2, -0.2);
  }

  _dustBurst(x, y, z, c, s) {
    for (let i = this.cnt(9); i-- > 0;) {
      const a = this.r() * 6.283, sp = 1.5 + this.r() * 3;
      this.puff(x + Math.cos(a) * 0.4, y + 0.15, z + Math.sin(a) * 0.4, Math.cos(a) * sp * s, 0.6 + this.r() * 1.2, Math.sin(a) * sp * s, 0.7 + this.r() * 0.5, 0.35 * s, 1.5 * s, c, 0.5, SPR.DUST, 2.2, -0.1);
    }
  }

  _respawnPop(x, y, z) {
    this.ringBB(x, y, z, 0.4, 3.4, 0.5, CYAN, 0.8, 1.8);
    this.glow(x, y, z, 0.6, 4, CYAN, 0.8, 0.3);
    for (let i = this.cnt(16); i-- > 0;) { const a = this.r() * 6.283, sp = 1 + this.r() * 3; this.star(x, y, z, Math.cos(a) * sp, 1 + this.r() * 3, Math.sin(a) * sp, 0.7 + this.r() * 0.4, 0.2, this.r() < 0.5 ? CYAN : WHITE, 2, SPR.FLARE, 3); }
  }

  _shockwave(x, y, z, s) {
    this.ring(x, y, z, 0.5, 14 * s, 0.6, WHITE, 0.9, 2);
    this.ring(x, y, z, 0.3, 8 * s, 0.45, CYAN, 0.8, 2);
    for (let i = this.cnt(30); i-- > 0;) { const a = (i / 30) * 6.283; this.spark(x, y + 0.2, z, Math.cos(a) * 14 * s, 1, Math.sin(a) * 14 * s, 0.35, 0.07, WHITE, 2.5, 0, 0.6, 0.05); }
  }

  // ------------------------------------------------------------------------------------------ event wiring
  _wire(session) {
    const on = (t, f) => session.on(t, f);
    const rear = (k, fn) => { const v = k.visual; if (v?.mountWorld) { v.mountWorld('wheelRL', _a, k); v.mountWorld('wheelRR', _b, k); fn(_a, _b); } };
    on(EV.DRIFT_LEVEL, ({ kart, level }) => {
      const c = LV[level] ?? LV[1];
      rear(kart, (a, b) => {
        for (const p of [a, b]) {
          this.pool(p.x, p.y, p.z, 0.6, 3.2, c, 0.9, 0.2);
          this.ring(p.x, p.y, p.z, 0.2, 2.2, 0.3, c, 0.9, 2);
          for (let i = this.cnt(10); i-- > 0;) this.spark(p.x, p.y + 0.1, p.z, this.sr() * 5, 2 + this.r() * 4, this.sr() * 5, 0.3 + this.r() * 0.25, 0.08, c, 3, 11, 0.5, 0.02);
        }
      });
      kart.ext.vfx && (kart.ext.vfx.boostLevel = level);
    });
    on(EV.DRIFT_BOOST, ({ kart, level }) => {
      const s = this.st(kart); s.boostLevel = level; s.boostSrc = 'drift'; s.boostT = 0;
      const c = LV[level] ?? LV[1];
      const v = kart.visual;
      if (v?.mountWorld) for (const m of ['exhaustL', 'exhaustR']) { v.mountWorld(m, _a, kart); this._boostBurst(_a.x, _a.y, _a.z, c, kart.forward, 0.6 + level * 0.25); }
    });
    on(EV.BOOST, ({ kart, source, strength }) => {
      const s = this.st(kart); s.boostSrc = source; s.boostT = 0; s.boostStrength = strength;
      if (source === 'drift') return;
      const v = kart.visual;
      const c = source === 'rocket' ? HOT : CYAN;
      if (v?.mountWorld) {
        v.mountWorld('exhaustL', _a, kart); v.mountWorld('exhaustR', _b, kart);
        _c.copy(_a).add(_b).multiplyScalar(0.5);
        this._boostBurst(_a.x, _a.y, _a.z, c, kart.forward, 0.9); this._boostBurst(_b.x, _b.y, _b.z, c, kart.forward, 0.9);
        this.ringBB(_c.x - kart.forward.x * 0.6, _c.y + 0.4, _c.z - kart.forward.z * 0.6, 0.5, 4.8, 0.34, c, 0.7, 2);
      }
    });
    on(EV.START_BOOST, ({ kart }) => {
      const v = kart.visual; if (!v?.mountWorld) return;
      for (const m of ['exhaustL', 'exhaustR']) { v.mountWorld(m, _a, kart); this._boostBurst(_a.x, _a.y, _a.z, GOLD, kart.forward, 1.3); }
    });
    on(EV.START_BURNOUT, ({ kart }) => { this.st(kart).burnout = 0.9; });
    on(EV.PAD_BOOST, ({ kart }) => {
      _a.copy(kart.position);
      this.ring(_a.x, _a.y, _a.z, 0.5, 6, 0.45, CYAN, 0.9, 2);
      for (let i = this.cnt(16); i-- > 0;) this.spark(_a.x + this.sr() * 0.9, _a.y + 0.2, _a.z + this.sr() * 0.9, -kart.forward.x * (6 + this.r() * 8), 1 + this.r() * 3, -kart.forward.z * (6 + this.r() * 8), 0.3, 0.08, CYAN, 3, 6, 1, 0.04);
    });
    on(EV.WALL_HIT, ({ kart, impact, point, normal }) => {
      const p = point ?? kart.position;
      const n = Math.min(26, 6 + impact * 1.4);
      for (let i = this.cnt(n); i-- > 0;) {
        const sp = 3 + this.r() * 8;
        this.spark(p.x, p.y + 0.4, p.z, (normal ? normal.x * sp * 0.6 : 0) + this.sr() * 4, 1 + this.r() * 4, (normal ? normal.z * sp * 0.6 : 0) + this.sr() * 4, 0.25 + this.r() * 0.3, 0.07 + this.r() * 0.05, this.r() < 0.5 ? GOLD : HOT, 3, 14, 0.6, 0.02);
      }
      this.glow(p.x, p.y + 0.4, p.z, 0.4, 1.8, [1, 0.8, 0.4], 0.9, 0.12);
    });
    on(EV.WALL_SCRAPE, ({ kart, active }) => { this.st(kart).scrape = !!active; });
    on(EV.LAND, ({ kart, impact }) => {
      const s = Math.min(1.8, 0.5 + impact * 0.07);
      rear(kart, (a, b) => { this._dustBurst(a.x, a.y, a.z, [0.7, 0.66, 0.58], s); this._dustBurst(b.x, b.y, b.z, [0.7, 0.66, 0.58], s); });
      _a.copy(kart.position); this.ring(_a.x, _a.y, _a.z, 0.4, 3.6 * s, 0.4, [0.9, 0.9, 0.95], 0.45, 1);
    });
    on(EV.HOP, ({ kart }) => rear(kart, (a, b) => { this._dustBurst(a.x, a.y, a.z, [0.78, 0.76, 0.72], 0.45); this._dustBurst(b.x, b.y, b.z, [0.78, 0.76, 0.72], 0.45); }));
    on(EV.JUMP, ({ kart }) => rear(kart, (a, b) => { this._dustBurst(a.x, a.y, a.z, [0.78, 0.76, 0.72], 0.5); this._dustBurst(b.x, b.y, b.z, [0.78, 0.76, 0.72], 0.5); }));
    on(EV.ITEM_BOX, ({ kart, box }) => {
      const p = box?.position ?? kart.position;
      this._pickup(p.x, p.y + 0.2, p.z, this.r() < 0.5 ? CYAN : GOLD);
    });
    on(EV.ITEM_HIT, ({ victim, point }) => { if (victim) { this.spawnForKart(victim, 'hitStars'); this.emote(victim, 'anger', 1.5); } else if (point) this._hitStars(point.x, point.y + 1, point.z); });
    on(EV.OVERTAKE, ({ kart, passed }) => { if (passed && (passed.isPlayer || kart?.isPlayer)) this.emote(passed, 'shock', 1.0); });
    on(EV.WRONG_WAY, ({ kart, active }) => { if (active && kart?.isPlayer) this.emote(kart, 'question', 1.8); });
    on(EV.LAP_COMPLETE, ({ kart, isBest }) => { if (isBest && kart?.isPlayer) this.emote(kart, 'star', 1.6); });
    on(EV.ITEM_EXPLODE, ({ point, radius }) => { if (point) this._explosion(point.x, point.y, point.z, clamp((radius ?? 4) / 4, 0.6, 2.4), null); });
    on(EV.ITEM_BLOCKED, ({ victim }) => {
      if (!victim) return;
      _a.copy(victim.position); _a.y += 0.9;
      this.ringBB(_a.x, _a.y, _a.z, 0.8, 4.6, 0.3, CYAN, 0.9, 2);
      for (let i = this.cnt(14); i-- > 0;) { const a = this.r() * 6.283; this.spark(_a.x, _a.y, _a.z, Math.cos(a) * 6, this.sr() * 3, Math.sin(a) * 6, 0.3, 0.07, CYAN, 3, 4, 1, 0.03); }
    });
    on(EV.RESPAWN, ({ kart }) => {
      _a.copy(kart.position); this._respawnPop(_a.x, _a.y + 0.6, _a.z);
      let d = this.drones.find((x) => !x.active);
      if (!d) { if (this.drones.length >= 4) return; d = new RescueDrone(session.scene.environment ?? null); this.drones.push(d); this.group.add(d.root); }
      d.start(kart);
    });
    on(EV.RESPAWN_DONE, ({ kart }) => {
      for (const d of this.drones) if (d.active && d.kart === kart) d.finish();
      _a.copy(kart.position); this._respawnPop(_a.x, _a.y + 0.6, _a.z);
    });
    on(EV.KART_FINISH, ({ kart, place }) => {
      if (kart.isPlayer || place <= 3) { _a.copy(kart.position); this._confetti(_a.x, _a.y, _a.z, kart.isPlayer ? 150 : 50); }
      const n = session.karts?.length ?? 8;
      this.emote(kart, place === 1 ? 'heart' : place <= 3 ? 'note' : place > Math.ceil(n / 2) ? 'sweat' : 'zzz', 3.2);
    });
    on(EV.COIN, ({ kart }) => { _a.copy(kart.position); this._sparkle(_a.x, _a.y + 1, _a.z, GOLD, 8); });
    on(EV.SPIN_OUT, ({ kart }) => {
      rear(kart, (a, b) => { for (const p of [a, b]) for (let i = this.cnt(5); i-- > 0;) this.puff(p.x, p.y + 0.2, p.z, this.sr() * 2, 1 + this.r(), this.sr() * 2, 0.9, 0.5, 2, [0.8, 0.8, 0.84], 0.4, this.pf()); });
    });
    on(EV.SHRINK, ({ kart }) => {
      _a.copy(kart.position); _a.y += 0.7;
      for (let i = this.cnt(10); i-- > 0;) this.puff(_a.x + this.sr() * 0.6, _a.y + this.sr() * 0.3, _a.z + this.sr() * 0.6, this.sr() * 3, 1 + this.r() * 2, this.sr() * 3, 0.6, 0.4, 1.4, [0.95, 0.9, 1], 0.5, this.pf(), 2.5, 0);
      this._sparkle(_a.x, _a.y, _a.z, [1, 0.7, 1], 14);
    });
    on(EV.INVINCIBLE, ({ kart, active }) => { if (active) { _a.copy(kart.position); this._sparkle(_a.x, _a.y + 0.8, _a.z, null, 26); } });
    if (EV.DRAFT) on(EV.DRAFT, ({ kart, active }) => { this.st(kart).draft = !!active; });
    // storm / zap style items (Agent D): a screen flash + shock ring at the caster and electric sparks on every victim
    if (EV.ITEM_SHOCK) on(EV.ITEM_SHOCK, ({ kart, victims }) => {
      const r = session.app?.renderer;
      r?.flash?.(0.75, 0.9, 1, 0.5);
      if (kart) { _a.copy(kart.position); this.ring(_a.x, _a.y, _a.z, 0.5, 16, 0.55, CYAN, 0.9, 2); this.ringBB(_a.x, _a.y + 0.9, _a.z, 0.6, 8, 0.4, WHITE, 0.7, 2); }
      if (Array.isArray(victims)) for (let i = 0; i < victims.length; i++) this._zap(victims[i]);
    });
  }

  // ------------------------------------------------------------------------------------------ per-frame
  update(dt) {
    if (!(dt > 0)) return;
    const S = this.session;
    this.time += dt;
    const T = this.time;
    this.q = S.app?.renderer?.quality ?? S.quality;        // the renderer's preset is the live one (settings changes call renderer.setQuality)
    this.pm = clamp(this.q?.particles ?? 1, 0.2, 1.5);
    this.gain = S.app?.renderer?.pipeline === 'post' ? 1.0 : 0.55;   // HDR + bloom can take hotter sparks than the direct path
    if (this._sceneSync <= 0) { this._syncScene(); this._sceneSync = 1.0; } else this._sceneSync -= dt;
    this.add.setTime(T); this.alpha.setTime(T); this.skids.setTime(T); this.flames.setTime(T); this.bubbles.setTime(T);
    const cam = S.camera;
    this.flames.begin(); this.shadows.begin(); this.beams.begin();
    const karts = S.karts;
    for (let i = 0; i < karts.length; i++) {
      const k = karts[i];
      const st = this.st(k);
      this._shadow(k, S);
      const d2 = cam ? cam.position.distanceToSquared(k.position) : 0;
      if (d2 > FAR2) { st.skidL.on = false; st.skidR.on = false; continue; }
      if (k.respawn?.active) { st.skidL.on = false; st.skidR.on = false; continue; }
      this._wheels(k, st, dt, T);
      this._boost(k, st, dt);
      this._status(k, st, dt, T);
      if (this.headlights) this._beams(k, d2);
    }
    this.flames.end(); this.shadows.end(); this.beams.end();
    this.emotes.update(dt, cam);
    for (let i = 0; i < this.drones.length; i++) this.drones[i].update(dt);
    this.bubbles.update(dt, karts, this._shieldLeft, this._shieldHot);
    this.add.flush(); this.alpha.flush(); this.skids.flush();
  }

  /** Copy scene fog + estimate the ambient tint so smoke/dust sit in the world's light. */
  _syncScene() {
    const sc = this.session.scene;
    const f = sc.fog;
    for (const u of [this.add.uniforms, this.alpha.uniforms, this.skids.uniforms]) {
      if (f) {
        u.uFogColor.value.copy(f.color);
        if (f.isFogExp2) u.uFog.value.set(Math.max(1, 0.4 / (f.density || 0.002)), 2.6 / (f.density || 0.002)); else u.uFog.value.set(f.near, f.far);
      }
    }
    let r = 0, g = 0, b = 0, w = 0;
    sc.traverse((o) => {
      if (o.isHemisphereLight) { r += (o.color.r * 0.6 + o.groundColor.r * 0.4) * o.intensity * 0.6; g += (o.color.g * 0.6 + o.groundColor.g * 0.4) * o.intensity * 0.6; b += (o.color.b * 0.6 + o.groundColor.b * 0.4) * o.intensity * 0.6; w++; }
      else if (o.isDirectionalLight) { r += o.color.r * o.intensity * 0.17; g += o.color.g * o.intensity * 0.17; b += o.color.b * o.intensity * 0.17; w++; }
      else if (o.isAmbientLight) { r += o.color.r * o.intensity; g += o.color.g * o.intensity; b += o.color.b * o.intensity; w++; }
    });
    if (w > 0) {
      const m = Math.max(r, g, b, 1e-3);
      const lum = clamp(m / 1.2, 0.28, 1.05);
      this._light.setRGB(clamp(r / m, 0.45, 1) * lum, clamp(g / m, 0.45, 1) * lum, clamp(b / m, 0.45, 1) * lum);
      this.alpha.uniforms.uLight.value.copy(this._light);
    }
  }

  _shadow(k, S) {
    const vr = k.visual;
    if (vr && (vr.ghost || vr.root.visible === false)) return;     // translucent ghosts and blinking (post-respawn) karts cast no blob shadow
    const hq = this.q?.shadows;
    const h = k.grounded ? 0 : Math.max(0, k.position.y - (k.query?.height ?? k.position.y));
    const a = clamp((hq ? 0.5 : 0.62) - h * 0.12, 0, 0.7) * (k.respawn?.active ? 0 : 1);
    if (a <= 0.01) return;
    const sc = k.scale ?? 1;
    _c.copy(k.position); if (h > 0) _c.addScaledVector(k.up, -h);
    this.shadows.add(_c, k.orientation, k.up, (hq ? 1.9 : 2.2) * sc * (1 + h * 0.08), (hq ? 2.8 : 3.2) * sc * (1 + h * 0.06), a);
  }

  /** tyre smoke, drift sparks, dust, skid marks for one kart */
  _wheels(k, st, dt, T) {
    const vis = k.visual;
    const grounded = k.grounded;
    const slip = Math.abs(k.slide);
    const dr = k.drift;
    const drifting = dr.dir !== 0;
    const onRoadish = k.surface === Surface.ROAD || k.surface === Surface.BOOST || k.surface === Surface.ICE;
    const speed = Math.abs(k.speed);
    st.burnout = Math.max(0, (st.burnout ?? 0) - dt);
    const slipping = grounded && (drifting || slip > 2.2 || k.stun > 0 || k.spin.timer > 0 || st.burnout > 0 || (k.input.brake > 0.9 && speed > 16));
    const sc = k.scale ?? 1;
    // wheel contact points (rear), lifted slightly off the road
    if (vis?.mountWorld) { vis.mountWorld('wheelRL', _a, k); vis.mountWorld('wheelRR', _b, k); }
    else { _a.copy(k.position).addScaledVector(k.right, -0.8).addScaledVector(k.forward, -0.9); _b.copy(k.position).addScaledVector(k.right, 0.8).addScaledVector(k.forward, -0.9); }
    // skid marks
    const skidOn = slipping && onRoadish && speed > 2 && k.surface !== Surface.ICE;
    const dark = clamp(0.35 + slip * 0.07 + (drifting ? 0.25 : 0) + (st.burnout > 0 ? 0.3 : 0), 0, 0.85);
    const lat = k.right;
    const lift = 0.035;
    this.skids.feed(st.skidL, skidOn, dark, _a.x + k.up.x * lift, _a.y + k.up.y * lift, _a.z + k.up.z * lift, lat.x, lat.y, lat.z, 0.17 * sc, T);
    this.skids.feed(st.skidR, skidOn, dark, _b.x + k.up.x * lift, _b.y + k.up.y * lift, _b.z + k.up.z * lift, lat.x, lat.y, lat.z, 0.17 * sc, T);
    if (!grounded) return;
    const mvx = k.velocity.x, mvz = k.velocity.z;
    const msp = Math.hypot(mvx, mvz);
    const ux = msp > 0.5 ? mvx / msp : k.forward.x, uz = msp > 0.5 ? mvz / msp : k.forward.z;
    // ---- tyre smoke (road) while slipping
    if (slipping && (onRoadish || k.surface === Surface.ICE)) {
      const perSec = (st.burnout > 0 ? 70 : 8 + slip * 2.4 + (drifting ? 16 : 0) + (k.stun > 0 ? 40 : 0));
      const ice = k.surface === Surface.ICE;
      for (let w = 0; w < 2; w++) {
        const P = w ? _b : _a;
        const n = this.rate(st, w ? R.SM1 : R.SM0, perSec, dt);
        for (let i = 0; i < n; i++) {
          this.puff(P.x + this.sr() * 0.12, P.y + 0.1, P.z + this.sr() * 0.12, -ux * (0.8 + this.r() * 1.4) + this.sr() * 0.5, 0.7 + this.r() * 1.0, -uz * (0.8 + this.r() * 1.4) + this.sr() * 0.5,
            0.6 + this.r() * 0.5, 0.35 * sc, (1.2 + this.r() * 0.8) * sc, ice ? SMOKE_ICE : SMOKE_ROAD, clamp(0.2 + slip * 0.03, 0.2, 0.42), this.pf(), 1.7, -0.25);
        }
      }
    }
    // ---- drift sparks (blue -> orange -> pink by level)
    if (drifting) {
      const L = dr.level;
      const c = LV[L];
      const perSec = L === 0 ? 10 : 44 + L * 30;
      for (let w = 0; w < 2; w++) {
        const P = w ? _b : _a;
        const n = this.rate(st, w ? R.SP1 : R.SP0, perSec, dt);
        for (let i = 0; i < n; i++) {
          const sp = 2.5 + this.r() * 5.5;
          this.spark(P.x, P.y + 0.08, P.z, mvx * 0.35 - ux * sp * 0.5 + this.sr() * 2.4 + (w ? -1 : 1) * 1.0 * dr.dir, 2 + this.r() * 4.5, mvz * 0.35 - uz * sp * 0.5 + this.sr() * 2.4,
            0.3 + this.r() * 0.36, (0.17 + this.r() * 0.14) * (L === 0 ? 0.55 : 1), c, L === 0 ? 1.1 : 2.4, 11, 0.4, L === 0 ? 0.04 : 0.055);
          // a few hot glints (soft flare) so the spray reads from the chase camera
          if (L > 0 && this.r() < 0.3) this.glow(P.x + this.sr() * 0.25, P.y + 0.12 + this.r() * 0.12, P.z + this.sr() * 0.25, 0.28 + 0.06 * L, 0.05, c, 0.9, 0.14, SPR.FLARE);
        }
        if (L > 0) this.pool(P.x, P.y, P.z, 0.9 + 0.2 * L, 1.5 + 0.3 * L, c, 0.5, 0.07);
      }
    }
    // ---- off-road dust / spray
    const fx = SURF_FX[k.surface];
    if (fx && speed > 3) {
      const base = (10 + speed * 1.3) * (k.onRoad ? 0.5 : 1);
      for (let w = 0; w < 2; w++) {
        const P = w ? _b : _a;
        const n = this.rate(st, w ? R.DU1 : R.DU0, base, dt);
        for (let i = 0; i < n; i++) {
          const s = fx.size * sc;
          if (fx.drop && this.r() < 0.55) {
            this.alpha.spawn(P.x, P.y + 0.1, P.z, -ux * 1.2 + this.sr() * 1.6, fx.up + this.r() * 2.2, -uz * 1.2 + this.sr() * 1.6, 0.5 + this.r() * 0.35, 0.2 * s, 0.1 * s, fx.rgb[0], fx.rgb[1], fx.rgb[2], 0.9, fx.rgb[0], fx.rgb[1], fx.rgb[2], 0, SPR.DROP, 0.2, 14, 0, this.r() * 6.28, 0, 0, 0);
          } else if (fx.chunk && this.r() < 0.3) {
            this.chunk(P.x, P.y + 0.2, P.z, -ux * (2 + this.r() * 3) + this.sr() * 1.5, 2 + this.r() * 3, -uz * (2 + this.r() * 3) + this.sr() * 1.5, 0.6 + this.r() * 0.4, (0.07 + this.r() * 0.08) * sc, fx.rgb, 12);
          } else {
            this.puff(P.x + this.sr() * 0.15, P.y + 0.12, P.z + this.sr() * 0.15, -ux * (1 + this.r() * 2) + this.sr() * 0.9, fx.up * (0.5 + this.r() * 0.7), -uz * (1 + this.r() * 2) + this.sr() * 0.9,
              0.6 + this.r() * 0.6, 0.35 * s, (1.3 + this.r() * 0.9) * s, fx.rgb, fx.a, fx.frame, 1.9, -0.15);
          }
        }
      }
    }
    // ---- wall scrape sparks along the side that faces the wall
    if (st.scrape) {
      const side = (k.query?.lateral ?? 0) >= 0 ? -1 : 1; // kart-right is -x in model space
      const n = this.rate(st, R.SCR, 55, dt);
      for (let i = 0; i < n; i++) {
        _d.copy(k.position).addScaledVector(k.right, -side * 0.95 * sc).addScaledVector(k.forward, (this.r() - 0.5) * 1.6 * sc); _d.y += 0.3 + this.r() * 0.35;
        this.spark(_d.x, _d.y, _d.z, -ux * (3 + this.r() * 6) + this.sr() * 2.2, 1 + this.r() * 3.5, -uz * (3 + this.r() * 6) + this.sr() * 2.2, 0.2 + this.r() * 0.3, 0.06 + this.r() * 0.05, this.r() < 0.4 ? WHITE : GOLD, 3, 14, 0.6, 0.022);
      }
    }
  }

  /** two soft headlight cones per kart (night tracks) */
  _beams(k, d2) {
    const vis = k.visual;
    if (!vis?.mountWorld || vis.ghost || d2 > 120 * 120) return;
    const sc = k.scale ?? 1;
    _qb.copy(k.orientation).multiply(_qp);       // aimed a few degrees down onto the road
    const fade = clamp(1.4 - d2 / (90 * 90), 0.15, 1);
    for (let m = 0; m < 2; m++) {
      vis.mountWorld(m ? 'headR' : 'headL', _a, k);
      this.beams.add(_a, _qb, 1.7 * sc, 15 * sc, fade, 1.0, 0.92, 0.74);
    }
  }

  /** boost / mini-turbo / rocket flames + trailing particles */
  _boost(k, st, dt) {
    const rocket = k.rocket > 0;
    const on = (k.boost.timer > 0 || rocket) && !(rocket && k.ext?.items?.rocketPack);   // (D's rocket pack, if still present, draws its own flame)
    st.flame += ((on ? 1 : 0) - st.flame) * Math.min(1, dt * (on ? 16 : 7));
    if (st.flame < 0.02) { st.boostT = 0; return; }
    st.boostT += dt;
    const vis = k.visual;
    if (!vis?.mountWorld) return;
    const src = rocket ? 'rocket' : st.boostSrc;
    let c, w, len;
    if (src === 'drift') { c = LV[st.boostLevel] ?? LV[1]; w = 0.3 + st.boostLevel * 0.07; len = 0.9 + st.boostLevel * 0.45; }
    else if (src === 'rocket') { c = HOT; w = 0.5; len = 2.3; }
    else if (src === 'start') { c = GOLD; w = 0.38; len = 1.5; }
    else { c = CYAN; w = 0.34; len = 1.15 + clamp((k.boost.strength ?? 0.35) - 0.3, 0, 0.4) * 2.2; }
    const sc = k.scale ?? 1;
    const fade = Math.min(1, k.boost.timer / 0.25 + (rocket ? 1 : 0));
    const inten = st.flame * (0.75 + 0.25 * fade);
    // flame axis: backwards along the kart unless the body's exhausts point elsewhere (Crusher's stacks aim up and back)
    const ed = vis.assets?.body?.exhaustDir;
    if (ed) _ed.set(ed[0], ed[1], ed[2]); else _ed.set(0, 0, -1);
    _exq.setFromUnitVectors(_Z, _ed);
    _q.copy(k.orientation).multiply(_exq);
    _dw.copy(_ed).applyQuaternion(k.orientation);
    for (let m = 0; m < 2; m++) {
      vis.mountWorld(m ? 'exhaustR' : 'exhaustL', _a, k);
      this.flames.add(_a, _q, w * sc, len * sc * inten, inten, c[0], c[1], c[2], m * 2.1 + k.id);
      // trailing flame sparks + a little smoke
      const n = this.rate(st, m ? R.FL1 : R.FL0, 80, dt);
      for (let i = 0; i < n; i++) {
        const sp = 7 + this.r() * 8 + Math.abs(k.speed) * 0.2;
        this.spark(_a.x + _dw.x * 0.2, _a.y + _dw.y * 0.2 + this.sr() * 0.08, _a.z + _dw.z * 0.2, _dw.x * sp + this.sr() * 1.3, _dw.y * sp + this.sr() * 1.1, _dw.z * sp + this.sr() * 1.3, 0.18 + this.r() * 0.22, 0.13 * sc + this.r() * 0.08, c, 3.2, -0.5, 1.6, 0.03, this.r() < 0.5 ? SPR.FLAME : SPR.DOT);
      }
      if (this.rate(st, m ? R.FS1 : R.FS0, 14, dt) > 0) this.puff(_a.x, _a.y, _a.z, _dw.x * 4, 0.5 + _dw.y * 3, _dw.z * 4, 0.7, 0.25, 1.1, src === 'rocket' ? SMOKE_ROCKET : SMOKE_BOOST, src === 'rocket' ? 0.55 : 0.22, this.pf(), 2.2, -0.3);
    }
  }

  /** shield / star / rocket sparkle trail, slipstream streaks */
  _status(k, st, dt, T) {
    const rk = k.rocket > 0.05;
    if (k.invincible > 0.05 || rk) {
      const n = this.rate(st, R.INV, rk ? 36 : 30, dt);
      for (let i = 0; i < n; i++) {
        const c = rk ? (this.r() < 0.5 ? GOLD : HOT) : rainbow((T * 0.8 + this.r() * 0.35) % 1, _rb);
        _d.copy(k.position).addScaledVector(k.right, this.sr() * 0.9).addScaledVector(k.forward, this.sr() * 1.3); _d.y += 0.15 + this.r() * 1.5;
        this.star(_d.x, _d.y, _d.z, -k.velocity.x * 0.12 + this.sr() * 0.8, this.r() * 1.4, -k.velocity.z * 0.12 + this.sr() * 0.8, 0.45 + this.r() * 0.35, 0.14 + this.r() * 0.13, c, 1.35, this.r() < 0.5 ? SPR.STAR5 : SPR.FLARE, 0, 4);
      }
    }
    if (st.draft && k.speed > 10) {
      const n = this.rate(st, R.DR, 30, dt);
      for (let i = 0; i < n; i++) {
        _d.copy(k.position).addScaledVector(k.right, this.sr() * 1.6).addScaledVector(k.forward, 1 + this.r() * 3); _d.y += 0.3 + this.r() * 1.2;
        this.spark(_d.x, _d.y, _d.z, -k.forward.x * (12 + this.r() * 8), 0, -k.forward.z * (12 + this.r() * 8), 0.22, 0.05, WHITE, 1.2, 0, 0, 0.1);
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.add.dispose(); this.alpha.dispose(); this.skids.dispose(); this.flames.dispose(); this.shadows.dispose(); this.bubbles.dispose(); this.beams.dispose(); this.emotes.dispose();
    for (const d of this.drones) d.dispose();
    this.drones.length = 0;
    for (const k of this.session.karts ?? []) if (k.ext) delete k.ext.vfx;
  }
}
