// Held-item visuals + kart attachments.
//  - HeldVisuals: peels trail behind the kart on a springy chain, orbs orbit it, a bomb dangles, a rocket rides on the
//    back, a comet hovers overhead.  They double as a shield (see ItemSystem.consumeGuard) so the visual matters.
//  - ShieldBubble / RocketPack: attached to kart.root while Prism Shield / Rocket Rider are active.
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

// ---------------------------------------------------------------------------------------------------------------------
const SHIELD_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`;
const SHIELD_FS = `uniform float uTime; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying vec3 vP;
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float hue = fract(vP.y * 0.32 + vP.x * 0.22 - vP.z * 0.18 + uTime * 0.4);
  vec3 col = hsv2rgb(vec3(hue, 0.78, 1.0));
  float facets = 0.5 + 0.5 * sin(vP.x * 9.0) * sin(vP.y * 9.0 + uTime * 2.0) * sin(vP.z * 9.0);
  float a = (0.12 + 0.95 * f) * uAlpha * (0.72 + 0.28 * facets);
  gl_FragColor = vec4(col * (1.0 + f * 1.9), a);
}`;

export class ShieldBubble {
  constructor(sys, kart) {
    this.kart = kart;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } }, vertexShader: SHIELD_VS, fragmentShader: SHIELD_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false, fog: false,
    });
    this.geo = new THREE.IcosahedronGeometry(1, 3);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.scale.set(1.45, 1.2, 2.05); this.mesh.position.set(0, 0.85, 0);
    this.mesh.renderOrder = 7; this.mesh.frustumCulled = false;
    kart.root.add(this.mesh);
    this.age = 0;
  }
  update(dt, remaining) {
    this.age += dt;
    const ramp = Math.min(1, this.age / 0.25);
    let a = ramp;
    if (remaining < 1.8) a *= 0.55 + 0.45 * Math.sin(this.age * 28);       // about to expire: flicker
    this.mat.uniforms.uTime.value += dt; this.mat.uniforms.uAlpha.value = a;
    const pulse = 1 + 0.025 * Math.sin(this.age * 9) + (1 - ramp) * 0.5;
    this.mesh.scale.set(1.45 * pulse, 1.2 * pulse, 2.05 * pulse);
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

export class RocketPack {
  constructor(sys, kart) {
    this.kart = kart; this.sys = sys;
    this.group = new THREE.Group(); this.group.name = 'rocket-pack';
    const body = new THREE.Mesh(sys.res.geo.seeker, sys.res.mats.body);
    body.scale.setScalar(1.75); body.position.set(0, 1.0, -0.9);
    this.group.add(body);
    this.flame = new THREE.Mesh(sys.res.geo.flame, sys.res.mats.flame.clone());
    this.flame.position.set(0, 1.0, -0.9 - 1.15); this.flame.scale.set(2.4, 2.4, 3.2);
    this.group.add(this.flame);
    this.core = new THREE.Mesh(sys.res.geo.flame, sys.res.mats.flame.clone()); this.core.material.color.set(0xfff4c0);
    this.core.position.copy(this.flame.position); this.core.scale.set(1.2, 1.2, 2.2);
    this.group.add(this.core);
    this.glow = sys.res.sprite(sys.res.tex.glow, 0xffa04a, 4, 0.9); this.glow.position.set(0, 1.0, -2.3);
    this.group.add(this.glow);
    this.group.scale.setScalar(0.01);
    kart.root.add(this.group);
    this.age = 0;
  }
  update(dt, remaining) {
    this.age += dt;
    const grow = Math.min(1, this.age / 0.3);
    const shrink = Math.min(1, remaining / 0.4);
    this.group.scale.setScalar(Math.max(0.001, grow * shrink));
    const fl = 0.75 + 0.25 * Math.sin(this.age * 55) + 0.15 * Math.random();
    this.flame.scale.set(2.4 * fl, 2.4 * fl, 3.2 * fl); this.core.scale.set(1.2 * fl, 1.2 * fl, 2.2 * fl);
    this.glow.material.opacity = 0.6 + 0.3 * fl;
  }
  dispose() { this.group.removeFromParent(); this.flame.material.dispose(); this.core.material.dispose(); }
}
