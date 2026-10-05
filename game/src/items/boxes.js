// Item boxes (rainbow "?" cubes) and the coin field.  Both are InstancedMeshes (1-3 draw calls for the whole track).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, wrapS } from '../core/math.js';

const PICKUP_RADIUS = 2.4;
const BOX_RESPAWN = 4.5;
const COIN_RESPAWN = 16;
const COIN_RADIUS = 2.1;
const easeOutBack = (u) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };

export class ItemBoxField {
  constructor(sys) {
    this.sys = sys;
    const track = sys.session.track;
    const tex = sys.res.tex;
    this.defs = track.itemBoxes ?? [];
    const n = this.defs.length;
    this.enabled = true;
    this.geo = new RoundedBoxGeometry(1.5, 1.5, 1.5, 3, 0.2);
    this.mat = new THREE.MeshStandardMaterial({ map: tex.box, emissiveMap: tex.box, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, n));
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.name = 'item-boxes';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.haloGeo = new THREE.IcosahedronGeometry(1.15, 1);
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.halo = new THREE.InstancedMesh(this.haloGeo, this.haloMat, Math.max(1, n));
    this.halo.frustumCulled = false; this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.halo.renderOrder = 3;
    this.padGeo = new THREE.PlaneGeometry(2.6, 2.6); this.padGeo.rotateX(-Math.PI / 2);
    this.padMat = new THREE.MeshBasicMaterial({ map: tex.ring, color: 0x9fe8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.pads = new THREE.InstancedMesh(this.padGeo, this.padMat, Math.max(1, n));
    this.pads.frustumCulled = false; this.pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pads.renderOrder = 2;
    sys.group.add(this.mesh, this.halo, this.pads);
    this.boxes = this.defs.map((d, i) => ({ def: d, id: i, active: true, timer: 0, pop: 1, phase: i * 0.83 + (d.row ?? 0) * 0.4, hide: false }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3();
    this._qPad = new THREE.Quaternion();
    this.setEnabled(sys.session.config.items !== false);
    this.update(0, 0, []);
  }

  setEnabled(on) {
    this.enabled = on;
    this.mesh.visible = this.halo.visible = this.pads.visible = on;
  }

  /** Is box i currently collectable?  (AI reads this) */
  isActive(b) { return this.enabled && b.active && b.pop >= 0.95; }

  update(dt, t, karts) {
    if (!this.enabled) return;
    const m = this._m, q = this._q, e = this._e, p = this._p, s = this._s;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) { b.active = true; b.pop = 0; }
      } else if (b.pop < 1) b.pop = Math.min(1, b.pop + dt / 0.55);
      let sc = 0;
      if (b.active) {
        sc = b.pop >= 1 ? 1 : easeOutBack(b.pop);
        // pickup test (cheap: karts <= 12)
        if (b.pop > 0.6) {
          const bx = b.def.position.x, by = b.def.position.y, bz = b.def.position.z;
          for (let k = 0; k < karts.length; k++) {
            const kt = karts[k];
            if (kt.item.type || kt.item.roulette.active || kt.race.finished || kt.respawn.active || kt.locked) continue;
            const dx = kt.position.x - bx, dz = kt.position.z - bz;
            if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(kt.position.y + 1.2 - by) < 3) {
              b.active = false; b.timer = BOX_RESPAWN; sc = 0;
              this.sys.onBoxPickup(kt, b);
              break;
            }
          }
        }
      }
      const bob = Math.sin(t * 2.2 + b.phase) * 0.14;
      p.set(b.def.position.x, b.def.position.y + bob, b.def.position.z);
      e.set(0.5 + Math.sin(t * 0.9 + b.phase) * 0.15, t * 1.6 + b.phase, 0.38);
      q.setFromEuler(e);
      s.set(sc, sc, sc);
      m.compose(p, q, s); this.mesh.setMatrixAt(i, m);
      const hs = sc * (1.0 + 0.06 * Math.sin(t * 5 + b.phase));
      s.set(hs, hs, hs); m.compose(p, q, s); this.halo.setMatrixAt(i, m);
      // ground ring (flat), follows the road under the box
      p.y = b.def.position.y - 1.15;
      const ps = sc * (0.8 + 0.12 * Math.sin(t * 3 + b.phase));
      s.set(ps, ps, ps);
      m.compose(p, this._qPad.identity(), s); this.pads.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.halo.instanceMatrix.needsUpdate = true; this.pads.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent(); this.halo.removeFromParent(); this.pads.removeFromParent();
    this.geo.dispose(); this.mat.dispose(); this.haloGeo.dispose(); this.haloMat.dispose(); this.padGeo.dispose(); this.padMat.dispose();
    this.mesh.dispose(); this.halo.dispose(); this.pads.dispose();
  }
}

/** Gold coins: lines / zig-zags / arcs along the lap (the track may supply `track.coins`; otherwise we lay out a default set). */
export class CoinField {
  constructor(sys) {
    this.sys = sys;
    const track = sys.session.track;
    let defs = Array.isArray(track.coins) && track.coins.length ? track.coins.map((c) => ({ s: c.s, lateral: c.lateral ?? 0, position: c.position?.clone?.() ?? track.pointAt(c.s, c.lateral ?? 0, new THREE.Vector3(), 0.9) })) : generateCoins(track);
    this.coins = defs.map((d, i) => ({ s: d.s, lateral: d.lateral, pos: d.position, active: true, timer: 0, phase: i * 0.6, pop: 1 }));
    this.mesh = new THREE.InstancedMesh(sys.res.geo.coin, sys.res.mats.coin, Math.max(1, this.coins.length));
    this.mesh.frustumCulled = false; this.mesh.name = 'coins';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sys.group.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._ax = new THREE.Vector3(0, 1, 0);
    this.update(0, 0, []);
  }

  update(dt, t, karts) {
    const m = this._m, q = this._q, p = this._p, s = this._s;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c.active) {
        c.timer -= dt;
        if (c.timer <= 0) { c.active = true; c.pop = 0; } else { s.set(0, 0, 0); m.compose(c.pos, q.identity(), s); this.mesh.setMatrixAt(i, m); continue; }
      }
      if (c.pop < 1) c.pop = Math.min(1, c.pop + dt * 3);
      let collected = false;
      if (c.pop > 0.7) {
        for (let k = 0; k < karts.length; k++) {
          const kt = karts[k];
          if (kt.coins >= 10 || kt.respawn.active || kt.locked) continue;
          const dx = kt.position.x - c.pos.x, dz = kt.position.z - c.pos.z;
          if (dx * dx + dz * dz < COIN_RADIUS * COIN_RADIUS && Math.abs(kt.position.y + 0.9 - c.pos.y) < 2.4) {
            c.active = false; c.timer = COIN_RESPAWN; collected = true;
            this.sys.onCoin(kt, c);
            break;
          }
        }
      }
      if (collected) { s.set(0, 0, 0); m.compose(c.pos, q.identity(), s); this.mesh.setMatrixAt(i, m); continue; }
      const sc = c.pop < 1 ? 0.2 + 0.8 * c.pop : 1;
      q.setFromAxisAngle(this._ax, t * 3.2 + c.phase);
      p.set(c.pos.x, c.pos.y + Math.sin(t * 3 + c.phase) * 0.09, c.pos.z);
      s.set(sc, sc, sc);
      m.compose(p, q, s); this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.dispose(); }
}

/** Default coin layout when the track defines none: ~6 patterns per lap, away from the start grid, item rows and ramps. */
function generateCoins(track) {
  const L = track.length;
  const count = clamp(Math.round(L / 330), 4, 9);
  const out = [];
  const rampNear = (s) => (track.ramps ?? []).some((z) => { const a = wrapS(s - z.s0 + 12, L); return a < z.length + 26; });
  const rows = track.def?.itemBoxRows ?? 5;
  const nearBoxRow = (s) => { for (let r = 0; r < rows; r++) { const bs = ((r + 0.5) / rows) * L; const d = Math.abs(((s - bs + L * 1.5) % L) - L * 0.5); if (d < 14) return true; } return false; };
  for (let p = 0; p < count; p++) {
    const kind = p % 3;
    const s0 = ((p + 0.62) / count) * L;
    const n = kind === 1 ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const s = wrapS(s0 + i * 4.6, L);
      if (s < 40 || s > L - 30 || rampNear(s) || nearBoxRow(s)) continue;
      const base = track.lineOffsetAt(s);
      const hw = track.sampleAt(s).halfWidth;
      let lat = base;
      if (kind === 1) lat = base + (i % 2 ? 1 : -1) * Math.min(2.6, hw * 0.2);
      else if (kind === 2) lat = base + Math.sin((i / (n - 1)) * Math.PI * 2) * Math.min(3.4, hw * 0.28);
      lat = clamp(lat, -hw * 0.8, hw * 0.8);
      out.push({ s, lateral: lat, position: track.pointAt(s, lat, new THREE.Vector3(), 0.95) });
    }
  }
  return out;
}
