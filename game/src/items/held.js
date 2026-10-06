// Held-item visuals + kart attachments.
//  - HeldVisuals: peels trail behind the kart on a springy chain, orbs orbit it, a bomb dangles, a rocket rides on the
//    back, a comet hovers overhead.  They double as a shield (see ItemSystem.consumeGuard) so the visual matters.
//  (The Prism Shield bubble and the Rocket Rider exhaust are drawn by the VFX system: it reads kart.ext.items.shield / kart.rocket / kart.invincible.)
import * as THREE from 'three';
import { damp } from '../core/math.js';

const TAU = Math.PI * 2;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3();

export const HELD_TYPES = new Set(['peel', 'orb', 'bomb', 'seeker', 'comet']);

export class HeldVisuals {
  constructor(sys) {
    this.sys = sys;
    this.group = new THREE.Group(); this.group.name = 'held-items';
    sys.group.add(this.group);
  }

  clear(st) {
    if (!st.held) return;
    for (const m of st.held.meshes) m.removeFromParent();
    st.held = null;
  }

  /** Called once per kart per frame (after roulette/use handling). */
  sync(k, st, dt, t) {
    const it = k.item;
    const want = it.type && HELD_TYPES.has(it.type) && !it.roulette.active && !k.race.finished && !k.respawn.active && it.count > 0;
    if (!want) { this.clear(st); return; }
    let h = st.held;
    const n = it.type === 'peel' || it.type === 'orb' ? Math.min(3, it.count) : 1;
    if (!h || h.type !== it.type || h.n !== n) {
      this.clear(st);
      h = st.held = { type: it.type, n, meshes: [], init: false };
      for (let i = 0; i < n; i++) { const m = this.sys.res.make(it.type); this.group.add(m); h.meshes.push(m); }
    }
    const s = k.scale;
    const f = _f.set(Math.sin(k.heading), 0, Math.cos(k.heading));
    const r = _r.set(-Math.cos(k.heading), 0, Math.sin(k.heading));   // right(yaw) per core/math.js
    const px = k.position.x, py = k.position.y, pz = k.position.z;
    const first = !h.init;
    for (let i = 0; i < h.meshes.length; i++) {
      const m = h.meshes[i];
      let tx, ty, tz, sc = 1, snap = first;
      switch (h.type) {
        case 'peel': {
          const back = (2.7 + i * 1.05) * s;
          tx = px - f.x * back + r.x * Math.sin(t * 2.6 + i * 1.7) * 0.16;
          tz = pz - f.z * back + r.z * Math.sin(t * 2.6 + i * 1.7) * 0.16;
          ty = py + 0.42 * s; sc = 0.62 * s;
          m.rotation.y = t * 1.3 + i; m.rotation.z = Math.sin(t * 3 + i) * 0.08;
          break;
        }
        case 'orb': {
          const a = t * 4.4 + (i * TAU) / h.meshes.length;
          tx = px + Math.cos(a) * 1.95 * s; tz = pz + Math.sin(a) * 1.95 * s; ty = py + (0.9 + Math.sin(t * 5 + i * 2) * 0.1) * s;
          sc = 0.62 * s; snap = true;
          m.rotation.y += dt * 8; m.rotation.x += dt * 5;
          break;
        }
        case 'bomb': {
          const back = 2.5 * s;
          tx = px - f.x * back + r.x * Math.sin(t * 2.1) * 0.25; tz = pz - f.z * back + r.z * Math.sin(t * 2.1) * 0.25;
          ty = py + (0.62 + Math.abs(Math.sin(t * 3.2)) * 0.12) * s; sc = 0.66 * s;
          m.rotation.y += dt * 1.2;
          const pb = m.userData.parts; if (pb?.blink) pb.blink.material.opacity = 0.18 + 0.2 * (0.5 + 0.5 * Math.sin(t * 5));
          break;
        }
        case 'seeker': {
          tx = px - f.x * 0.95 * s; tz = pz - f.z * 0.95 * s; ty = py + 1.6 * s; sc = 0.62 * s; snap = true;
          m.rotation.set(-0.5, k.heading + Math.sin(t * 1.6) * 0.05, 0, 'YXZ');
          const pp = m.userData.parts; if (pp?.flame) pp.flame.scale.set(0.001, 0.001, 0.001);
          if (pp?.glow) pp.glow.material.opacity = 0;
          break;
        }
        default: { // comet: a small blue sun above the kart
          tx = px; tz = pz; ty = py + (2.35 + Math.sin(t * 3) * 0.16) * s; sc = 0.5 * s; snap = true;
          m.rotation.y += dt * 3;
          const pp = m.userData.parts; if (pp) { pp.glow.scale.setScalar(2.6 + 0.4 * Math.sin(t * 9)); pp.star.scale.setScalar(1.8); }
          break;
        }
      }
      if (snap) m.position.set(tx, ty, tz);
      else {
        const k1 = 1 - Math.exp(-13 * dt);
        m.position.x += (tx - m.position.x) * k1; m.position.z += (tz - m.position.z) * k1; m.position.y += (ty - m.position.y) * (1 - Math.exp(-20 * dt));
      }
      m.scale.setScalar(sc);
    }
    h.init = true;
  }

  dispose() { this.group.removeFromParent(); }
}
