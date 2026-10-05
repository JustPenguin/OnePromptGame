// Time-trial ghosts.  OWNER: Agent A (engine).
//
//   GhostRecorder   records the player at 30 Hz of RACE time (interpolated to the exact sample instants, so the recording is
//                   independent of the frame rate) and produces a compact, JSON-serialisable `data` object.
//   GhostPlayer     replays such data as a translucent kart (real kart visual + visual.setGhost?.(true)), interpolated, driven
//                   by the same race clock as the player so the two are directly comparable.
//
// Wire format (data):  { v:1, hz:30, n, x0,z0,y0,w0 (quantised start values), b:'<base64>', fl:[sample,flags,...], time, trackId, driverId, bodyId }
//   Channels x, z (1 cm), y (2 cm), yaw (0.01 rad, unwrapped) are quantised to integers, then DPCM coded with a second-order
//   (constant velocity) predictor run on the DECODED values (closed loop => lossless on the quantised values, no drift).
//   Each residual is one signed byte; -128 escapes to a 32-bit absolute value (teleports, wall bounces, spin starts).
//   A 3-lap run (~200 s) is ~6000 samples x 4 bytes = 24 KB binary = ~32 KB base64, inside the 40 KB budget.
//   Flags per sample (stored only when they change): bits 0-1 drift dir (0 none, 1 left, 2 right), bits 2-3 drift level,
//   bit 4 boosting, bit 5 airborne, bit 6 spinning.
import { Kart } from '../physics/Kart.js';
import { attachKartVisual } from '../vehicles/KartVisuals.js';
import { clamp, damp, angleDiff } from '../core/math.js';

const QX = 0.01, QY = 0.02, QW = 0.01;
const HZ = 30;
const MAX_SAMPLES = 60 * 60 * HZ;   // a one-hour run is plenty

export class GhostRecorder {
  constructor(session, { hz = HZ } = {}) {
    this.session = session;
    this.hz = hz;
    this.reset();
  }

  reset() {
    this.n = 0;
    this.nextT = 0;
    this.done = false;
    this.prev = null;
    this.yawU = 0;
    this._lastYaw = null;
    this.bytes = [];
    this.pred = { x: [0, 0], z: [0, 0], y: [0, 0], w: [0, 0] };   // last two decoded values per channel
    this.first = null;
    this.fl = [];
    this._lastFlags = -1;
  }

  /** Call every frame after the race update. Records while racing until the player finishes. */
  update(dt) {
    if (this.done) return;
    const s = this.session, k = s.player, race = s.race;
    if (!k || !race) return;
    if (this._lastYaw === null) { this._lastYaw = k.yaw; this.yawU = k.yaw; }
    this.yawU += angleDiff(k.yaw, this._lastYaw); this._lastYaw = k.yaw;
    const now = { x: k.position.x, y: k.position.y, z: k.position.z, w: this.yawU };
    const racing = race.phase === 'racing' || race.phase === 'finishing';
    if (racing && this.prev) {
      const tNow = race.time, tPrev = tNow - dt;
      const tEnd = k.race.finished ? k.race.finishTime : Infinity;
      const flags = this.flagsOf(k);
      while (this.nextT <= tNow + 1e-9 && this.nextT <= tEnd + 1e-9 && this.n < MAX_SAMPLES) {
        const u = tNow > tPrev ? clamp((this.nextT - tPrev) / (tNow - tPrev), 0, 1) : 1;
        this.push(this.prev.x + (now.x - this.prev.x) * u, this.prev.y + (now.y - this.prev.y) * u, this.prev.z + (now.z - this.prev.z) * u, this.prev.w + (now.w - this.prev.w) * u, flags);
        this.nextT += 1 / this.hz;
      }
      if (k.race.finished || this.n >= MAX_SAMPLES) this.done = true;
    }
    this.prev = now;
  }

  flagsOf(k) {
    const d = k.drift;
    return (d.dir === 0 ? 0 : d.dir < 0 ? 1 : 2) | (Math.min(3, d.level) << 2) | (k.boost.timer > 0 ? 16 : 0) | (k.grounded ? 0 : 32) | (k.spin.timer > 0 ? 64 : 0);
  }

  push(x, y, z, w, flags) {
    const qx = Math.round(x / QX), qy = Math.round(y / QY), qz = Math.round(z / QX), qw = Math.round(w / QW);
    if (this.n === 0) { this.first = { x: qx, y: qy, z: qz, w: qw }; this.pred.x = [qx, qx]; this.pred.y = [qy, qy]; this.pred.z = [qz, qz]; this.pred.w = [qw, qw]; }
    else { this.code('x', qx); this.code('z', qz); this.code('y', qy); this.code('w', qw); }
    if (flags !== this._lastFlags) { this.fl.push(this.n, flags); this._lastFlags = flags; }
    this.n++;
  }

  code(ch, q) {
    const p = this.pred[ch];
    const guess = 2 * p[1] - p[0];
    const r = q - guess;
    if (r >= -126 && r <= 126) this.bytes.push(r & 255);
    else { this.bytes.push(0x80, q & 255, (q >> 8) & 255, (q >> 16) & 255, (q >> 24) & 255); }
    p[0] = p[1]; p[1] = q;
  }

  /** The finished recording as a JSON-safe object (call after the player has finished). */
  finish(info = {}) {
    const f = this.first ?? { x: 0, y: 0, z: 0, w: 0 };
    return { v: 1, hz: this.hz, n: this.n, x0: f.x, y0: f.y, z0: f.z, w0: f.w, b: bytesToB64(this.bytes), fl: this.fl, ...info };
  }
}

/** Decode `data` into Float32Arrays. Accepts the object from GhostRecorder.finish() or a full ghostResult ({ data }). */
export function decodeGhost(input) {
  try { return decodeGhostUnsafe(input); } catch { return null; }      // corrupted / foreign data must never break a race load
}

function decodeGhostUnsafe(input) {
  const d = input?.data && input.data.b !== undefined ? input.data : input;
  if (!d || d.v !== 1 || typeof d.b !== 'string' || !(d.n > 0) || d.n > 400000) return null;
  const bytes = b64ToBytes(d.b);
  const n = d.n;
  const out = { n, hz: d.hz ?? HZ, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), w: new Float32Array(n), flags: new Uint8Array(n), info: d };
  const pred = { x: [d.x0, d.x0], z: [d.z0, d.z0], y: [d.y0, d.y0], w: [d.w0, d.w0] };
  let pos = 0;
  const read = (ch) => {
    const p = pred[ch];
    let q;
    const b = bytes[pos++];
    if (b === 0x80) { q = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24); pos += 4; }
    else q = 2 * p[1] - p[0] + (b > 127 ? b - 256 : b);
    p[0] = p[1]; p[1] = q;
    return q;
  };
  out.x[0] = d.x0 * QX; out.z[0] = d.z0 * QX; out.y[0] = d.y0 * QY; out.w[0] = d.w0 * QW;
  for (let i = 1; i < n; i++) {
    if (pos >= bytes.length) { for (let j = i; j < n; j++) { out.x[j] = out.x[i - 1]; out.y[j] = out.y[i - 1]; out.z[j] = out.z[i - 1]; out.w[j] = out.w[i - 1]; } break; }
    out.x[i] = read('x') * QX; out.z[i] = read('z') * QX; out.y[i] = read('y') * QY; out.w[i] = read('w') * QW;
  }
  let fv = 0, fi = 0;
  const fl = d.fl ?? [];
  for (let i = 0; i < n; i++) { while (fi < fl.length && fl[fi] <= i) { fv = fl[fi + 1]; fi += 2; } out.flags[i] = fv; }
  return out;
}

export class GhostPlayer {
  /** @param session RaceSession  @param data GhostRecorder.finish() output or a ghostResult */
  constructor(session, data, { fadeAfter = 4 } = {}) {
    this.session = session;
    this.track = decodeGhost(data);
    this.ready = !!this.track;
    this.fadeAfter = fadeAfter;
    this.kart = null;
    this.visible = true;
    this._lastX = 0; this._lastZ = 0; this._lastW = 0; this._init = false;
    if (!this.ready) return;
    const info = this.track.info;
    this.kart = new Kart({ id: -1, name: 'Ghost', driverId: info.driverId ?? 'pip', bodyId: info.bodyId ?? 'classic', isPlayer: false, speedClass: session.config.speedClass, events: session.events });
    this.kart.isAI = false;
    this.kart.locked = true;
    attachKartVisual(this.kart, session);
    if (this.kart.visual?.setGhost) this.kart.visual.setGhost(true);
    else this.fallbackGhostLook();
    this.kart.root.name = 'kart:ghost';
    this.buildDistance();
    this.update(0);
  }

  /** Cumulative race distance of every sample (same convention as kart.race.distance), so a live time delta can be computed. */
  buildDistance() {
    const g = this.track, track = this.session.track, L = track.length;
    const q = this.kart.query, p = this.kart.position;
    this.dist = new Float32Array(g.n);
    let hint = -1, prevS = 0, acc = 0;
    for (let i = 0; i < g.n; i++) {
      p.set(g.x[i], g.y[i], g.z[i]);
      track.project(p, q, hint); hint = q.index;
      if (i === 0) acc = q.s > L / 2 ? q.s - L : q.s;
      else acc += track.deltaS(prevS, q.s);
      prevS = q.s;
      this.dist[i] = acc;
    }
    this._cursor = 0;
    this.kart.hint = -1;
  }

  /** Race time at which the ghost had covered `distance` metres (null if it never did). Monotone cursor: call with rising distances. */
  timeAtDistance(distance) {
    if (!this.dist) return null;
    const d = this.dist, n = d.length;
    if (distance > d[n - 1]) return null;
    let i = this._cursor;
    if (i > 0 && d[i] > distance) i = 0;                         // the player went backwards (respawn): rescan
    while (i < n - 1 && d[i + 1] < distance) i++;
    this._cursor = i;
    const span = d[Math.min(n - 1, i + 1)] - d[i];
    const f = span > 1e-4 ? clamp((distance - d[i]) / span, 0, 1) : 0;
    return (i + f) / this.track.hz;
  }

  /** Visual fallback when the kart visual has no setGhost(): clone the materials so only this kart goes translucent. */
  fallbackGhostLook() {
    this.kart.root.traverse((o) => {
      if (!o.material) return;
      const clone = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.42; c.depthWrite = false; return c; };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
      o.castShadow = false;
    });
  }

  get duration() { return this.ready ? (this.track.n - 1) / this.track.hz : 0; }
  /** Position of the ghost along the track (s) - handy for a "ghost is X m ahead" HUD. */
  get s() { return this.kart?.query.s ?? 0; }

  update(dt) {
    if (!this.ready) return;
    const s = this.session, k = this.kart, g = this.track;
    const t = Math.max(0, s.race?.time ?? 0);
    const f = clamp(t * g.hz, 0, g.n - 1);
    const i0 = Math.floor(f), i1 = Math.min(g.n - 1, i0 + 1), u = f - i0;
    const x = g.x[i0] + (g.x[i1] - g.x[i0]) * u, z = g.z[i0] + (g.z[i1] - g.z[i0]) * u;
    const y = g.y[i0] + (g.y[i1] - g.y[i0]) * u, w = g.w[i0] + (g.w[i1] - g.w[i0]) * u;
    const fl = g.flags[u > 0.5 ? i1 : i0];
    if (!this._init) { this._lastX = x; this._lastZ = z; this._lastW = w; this._init = true; }
    k.position.set(x, y, z);
    if (dt > 1e-4) {
      const spd = Math.hypot(x - this._lastX, z - this._lastZ) / dt;
      k.speed = damp(k.speed, Math.min(spd, 70), 12, dt);
      const yawRate = (w - this._lastW) / dt;
      k.steerVisual = damp(k.steerVisual, clamp(-yawRate / 1.7, -1, 1), 10, dt);
    }
    this._lastX = x; this._lastZ = z; this._lastW = w;
    k.heading = k.moveYaw = w; k.spinAngle = 0; k.drift.angle = 0;
    k.drift.dir = (fl & 3) === 0 ? 0 : (fl & 3) === 1 ? -1 : 1;
    k.drift.level = (fl >> 2) & 3;
    k.boost.timer = fl & 16 ? 0.5 : 0; k.boost.strength = fl & 16 ? 0.3 : 0;
    k.grounded = !(fl & 32);
    k.spin.timer = fl & 64 ? 0.5 : 0;
    k.race.finished = f >= g.n - 1;
    const q = s.track.project(k.position, k.query, k.hint);
    k.hint = q.index; k.surface = q.surface; k.onRoad = q.onRoad;
    s.physics?.finalize(k, Math.max(dt, 1e-3));
    k.heading = w;     // finalize() wraps heading; keep the raw value so yaw stays exact
    k.yaw = w;
    // fade out a few seconds after the recorded run ended
    const vis = t <= this.duration + this.fadeAfter;
    if (vis !== this.visible) { this.visible = vis; k.root.visible = vis; }
    k.visual?.update(dt, k, s);
  }

  dispose() {
    if (!this.kart) return;
    this.kart.visual?.dispose?.();
    this.kart.root.removeFromParent();
    this.kart = null;
  }
}

function bytesToB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.slice(i, i + CH));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}
function b64ToBytes(b64) {
  const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
