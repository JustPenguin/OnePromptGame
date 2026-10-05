// Transient visual effects owned by the item system: box shatter shards, blast flashes + rings, lightning bolts,
// ink blobs, lock-on reticles and ground shock-rings.  Pooled; zero allocation per frame.
// These are deliberately small and cheap - Agent C's VFX (session.vfx.spawn('explosion'...)) layers the big fireball on top.
import * as THREE from 'three';
import { Ribbon } from './Ribbon.js';

const MAX_SHARDS = 160;
const easeOut = (u) => 1 - (1 - u) * (1 - u);

export class ItemFX {
  constructor(sys) {
    this.sys = sys;
    this.session = sys.session;
    this.res = sys.res;
    this.group = new THREE.Group();
    this.group.name = 'item-fx';
    sys.group.add(this.group);
    const tex = this.res.tex;
    this._planeGeo = this.planeGeo = new THREE.PlaneGeometry(2, 2); this._planeGeo.rotateX(-Math.PI / 2);
    this._mats = [];
    const add = (m) => { this._mats.push(m); return m; };

    // ---- shards (instanced) ----
    this._shardMat = add(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1, emissive: 0x555555, emissiveIntensity: 0.6 }));
    this._shardGeo = new THREE.BoxGeometry(1, 1, 1);
    this.shards = new THREE.InstancedMesh(this._shardGeo, this._shardMat, MAX_SHARDS);
    this.shards.frustumCulled = false;
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const sd = (this._sh = {
      p: new Float32Array(MAX_SHARDS * 3), v: new Float32Array(MAX_SHARDS * 3), r: new Float32Array(MAX_SHARDS * 3), w: new Float32Array(MAX_SHARDS * 3),
      size: new Float32Array(MAX_SHARDS), life: new Float32Array(MAX_SHARDS), max: new Float32Array(MAX_SHARDS), next: 0,
    });
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_SHARDS; i++) { this.shards.setMatrixAt(i, zero); this.shards.setColorAt(i, new THREE.Color(1, 1, 1)); sd.life[i] = 0; }
    this.group.add(this.shards);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();

    // ---- blasts: flash sphere + flat ring + glow ----
    this.blasts = [];
    for (let i = 0; i < 8; i++) {
      const flash = new THREE.Mesh(this.res.geo.sphere, add(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
      const ring = new THREE.Mesh(this._planeGeo, add(new THREE.MeshBasicMaterial({ map: tex.ring, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
      const glow = this.res.sprite(tex.glow, 0xffffff, 1, 0);
      flash.visible = ring.visible = glow.visible = false;
      flash.renderOrder = 6; ring.renderOrder = 6;
      this.group.add(flash, ring, glow);
      this.blasts.push({ flash, ring, glow, t: 0, dur: 0, r: 1, active: false, color: new THREE.Color() });
    }
    // ---- ground rings ----
    this.rings = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this._planeGeo, add(new THREE.MeshBasicMaterial({ map: tex.ring, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
      m.visible = false; m.renderOrder = 4;
      this.group.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 0, r0: 1, r1: 2, active: false });
    }
    // ---- lightning bolts ----
    this.bolts = [];
    for (let i = 0; i < 14; i++) {
      const rb = new Ribbon(12);
      rb.mesh.visible = false;
      this.group.add(rb.mesh);
      const tip = this.res.sprite(tex.glow, 0xfff2a0, 3, 0); tip.visible = false;
      this.group.add(tip);
      this.bolts.push({ rb, tip, t: 0, dur: 0, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), jitter: 0, color: new THREE.Color() });
    }
    // ---- ink blobs ----
    this._inkMat = add(new THREE.MeshStandardMaterial({ color: 0x4a2bb8, emissive: 0x2a1580, emissiveIntensity: 0.8, roughness: 0.25 }));
    this.blobs = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this.res.geo.sphere, this._inkMat);
      m.visible = false; m.scale.setScalar(0.34);
      this.group.add(m);
      this.blobs.push({ mesh: m, t: 0, dur: 0, active: false, from: new THREE.Vector3(), kart: null, to: new THREE.Vector3() });
    }
    // ---- lock-on reticles ----
    this.locks = [];
    for (let i = 0; i < 8; i++) {
      const s = this.res.sprite(tex.reticle, 0xff4a38, 3.2, 0.95); s.visible = false;
      this.group.add(s);
      this.locks.push({ sprite: s, kart: null, t: 0, active: false });
    }
  }

  // ------------------------------------------------------------------ spawners
  /** Box shatter: coloured cubes burst out of `pos`. */
  shatter(pos, n = 14, palette = [0xff5a7a, 0xffb23a, 0x5ae87a, 0x3ac8ff, 0x8a6aff]) {
    const sd = this._sh;
    for (let k = 0; k < n; k++) {
      const i = sd.next; sd.next = (sd.next + 1) % MAX_SHARDS;
      const a = Math.random() * Math.PI * 2, up = 4 + Math.random() * 7, out = 3 + Math.random() * 6;
      sd.p[i * 3] = pos.x; sd.p[i * 3 + 1] = pos.y; sd.p[i * 3 + 2] = pos.z;
      sd.v[i * 3] = Math.cos(a) * out; sd.v[i * 3 + 1] = up; sd.v[i * 3 + 2] = Math.sin(a) * out;
      sd.r[i * 3] = Math.random() * 6; sd.r[i * 3 + 1] = Math.random() * 6; sd.r[i * 3 + 2] = Math.random() * 6;
      sd.w[i * 3] = (Math.random() - 0.5) * 14; sd.w[i * 3 + 1] = (Math.random() - 0.5) * 14; sd.w[i * 3 + 2] = (Math.random() - 0.5) * 14;
      sd.size[i] = 0.14 + Math.random() * 0.2;
      sd.life[i] = sd.max[i] = 0.55 + Math.random() * 0.35;
      this.shards.setColorAt(i, this._c.set(palette[k % palette.length]));
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  /** Fast flash + expanding ring (+ glow) for explosions. */
  blast(pos, radius = 6, color = 0xffa23a, dur = 0.55) {
    let b = this.blasts.find((x) => !x.active);
    if (!b) b = this.blasts.reduce((a, c) => (a.t > c.t ? a : c));
    b.active = true; b.t = 0; b.dur = dur; b.r = radius; b.color.set(color);
    b.flash.position.copy(pos); b.glow.position.copy(pos); b.ring.position.copy(pos); b.ring.position.y += 0.15;
    b.flash.material.color.set(0xffffff).lerp(b.color, 0.35); b.ring.material.color.copy(b.color); b.glow.material.color.copy(b.color);
    b.flash.visible = b.ring.visible = b.glow.visible = true;
  }

  /** Expanding flat ring lying on the ground (shock-waves, spawn markers). */
  ring(pos, color = 0xffffff, r0 = 0.5, r1 = 6, dur = 0.5) {
    let r = this.rings.find((x) => !x.active);
    if (!r) r = this.rings[0];
    r.active = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1;
    r.mesh.position.copy(pos); r.mesh.position.y += 0.2;
    r.mesh.material.color.set(color); r.mesh.visible = true;
  }

  /** Jagged lightning bolt between two points. */
  bolt(from, to, color = 0xfff2a0, dur = 0.32) {
    let b = this.bolts.find((x) => !x.active);
    if (!b) return;
    b.active = true; b.t = 0; b.dur = dur; b.jitter = 0; b.from.copy(from); b.to.copy(to); b.color.set(color);
    b.rb.mesh.visible = true; b.tip.visible = true; b.tip.material.color.copy(b.color);
    this._jag(b);
  }

  /** Ink blob flying from a point to a kart. */
  ink(from, kart, dur = 0.5) {
    const b = this.blobs.find((x) => !x.active);
    if (!b) return;
    b.active = true; b.t = 0; b.dur = dur; b.from.copy(from); b.kart = kart; b.mesh.visible = true;
  }

  /** Show the lock-on reticle above `kart` (call every frame while locked; it hides when you stop). */
  lock(kart, strength = 1) {
    let l = this.locks.find((x) => x.active && x.kart === kart);
    if (!l) { l = this.locks.find((x) => !x.active); if (!l) return; l.active = true; l.kart = kart; l.t = 0; l.sprite.visible = true; }
    l.seen = true; l.strength = strength;
  }

  // ------------------------------------------------------------------ per-frame
  _jag(b) {
    const rb = b.rb, n = rb.max;
    const dx = b.to.x - b.from.x, dy = b.to.y - b.from.y, dz = b.to.z - b.from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // an arbitrary perpendicular pair (jitter lives in the plane facing the camera, approximated by world X/Z)
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const amp = Math.sin(u * Math.PI) * Math.min(4, len * 0.12);
      rb.set(i, b.from.x + dx * u + (Math.random() - 0.5) * amp * 2, b.from.y + dy * u, b.from.z + dz * u + (Math.random() - 0.5) * amp * 2);
    }
    b.tip.position.copy(b.to);
  }

  update(dt) {
    const cam = this.session.camera.position;
    // shards
    const sd = this._sh, m4 = this._m4, q = this._q, e = this._e, sc = this._s, pv = this._v;
    let dirty = false;
    for (let i = 0; i < MAX_SHARDS; i++) {
      if (sd.life[i] <= 0) continue;
      sd.life[i] -= dt;
      dirty = true;
      if (sd.life[i] <= 0) { m4.makeScale(0, 0, 0); this.shards.setMatrixAt(i, m4); continue; }
      sd.v[i * 3 + 1] -= 24 * dt;
      sd.p[i * 3] += sd.v[i * 3] * dt; sd.p[i * 3 + 1] += sd.v[i * 3 + 1] * dt; sd.p[i * 3 + 2] += sd.v[i * 3 + 2] * dt;
      sd.r[i * 3] += sd.w[i * 3] * dt; sd.r[i * 3 + 1] += sd.w[i * 3 + 1] * dt; sd.r[i * 3 + 2] += sd.w[i * 3 + 2] * dt;
      const u = 1 - sd.life[i] / sd.max[i];
      const s = sd.size[i] * (1 - u * u);
      e.set(sd.r[i * 3], sd.r[i * 3 + 1], sd.r[i * 3 + 2]); q.setFromEuler(e);
      pv.set(sd.p[i * 3], sd.p[i * 3 + 1], sd.p[i * 3 + 2]); sc.set(s, s, s);
      m4.compose(pv, q, sc); this.shards.setMatrixAt(i, m4);
    }
    if (dirty) this.shards.instanceMatrix.needsUpdate = true;

    // blasts
    for (const b of this.blasts) {
      if (!b.active) continue;
      b.t += dt;
      const u = b.t / b.dur;
      if (u >= 1) { b.active = false; b.flash.visible = b.ring.visible = b.glow.visible = false; continue; }
      const eo = easeOut(u);
      b.flash.scale.setScalar(b.r * 0.5 * (0.25 + 0.95 * eo)); b.flash.material.opacity = (1 - u) * (1 - u) * 0.85;
      b.ring.scale.setScalar(b.r * (0.2 + 1.05 * eo)); b.ring.material.opacity = (1 - u) * 0.95;
      const gs = b.r * 2.4 * (1 - u * 0.35); b.glow.scale.set(gs, gs, 1); b.glow.material.opacity = Math.pow(1 - u, 1.6);
    }
    // rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * easeOut(u)); r.mesh.material.opacity = (1 - u) * 0.9;
    }
    // bolts
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt; b.jitter += dt;
      const u = b.t / b.dur;
      if (u >= 1) { b.active = false; b.rb.mesh.visible = false; b.tip.visible = false; b.rb.clear(); continue; }
      if (b.jitter > 0.045) { b.jitter = 0; this._jag(b); }
      const flick = 0.55 + 0.45 * Math.random();
      b.rb.rebuild(cam, 0.55 * (1 - u * 0.5), b.color, 0xffffff, flick * (1 - u * u), 0.7);
      b.tip.material.opacity = flick * (1 - u); b.tip.scale.setScalar(3 + 3 * flick);
    }
    // ink blobs
    for (const b of this.blobs) {
      if (!b.active) continue;
      b.t += dt;
      const u = b.t / b.dur;
      if (u >= 1 || !b.kart) { b.active = false; b.mesh.visible = false; b.kart = null; continue; }
      const k = b.kart.position;
      b.mesh.position.set(b.from.x + (k.x - b.from.x) * u, b.from.y + (k.y + 1.2 - b.from.y) * u + Math.sin(u * Math.PI) * 3.2, b.from.z + (k.z - b.from.z) * u);
      const sz = 0.34 + Math.sin(u * 18) * 0.04; b.mesh.scale.set(sz * (1 + u * 0.5), sz * (1 - u * 0.2), sz * (1 + u * 0.5));
    }
    // locks
    for (const l of this.locks) {
      if (!l.active) continue;
      l.t += dt;
      if (!l.seen || !l.kart) { l.active = false; l.sprite.visible = false; l.kart = null; continue; }
      l.seen = false;
      const k = l.kart;
      const pulse = 1 + 0.18 * Math.sin(l.t * 14);
      l.sprite.position.set(k.position.x, k.position.y + 2.2 * k.scale, k.position.z);
      l.sprite.scale.setScalar(3.4 * pulse * (0.8 + 0.2 * (l.strength ?? 1)));
      l.sprite.material.rotation = l.t * 2.6;
      l.sprite.material.opacity = 0.75 + 0.25 * Math.sin(l.t * 22);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this._shardGeo.dispose(); this._planeGeo.dispose();
    this.shards.dispose();
    this._mats.forEach((m) => m.dispose());
    this.bolts.forEach((b) => b.rb.dispose());
  }
}
