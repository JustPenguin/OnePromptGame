// Skid marks: one pooled ribbon mesh (single draw call) holding the last N rubber segments of every wheel. OWNER: Agent C (vfx).
// Each wheel "slot" extends its streak while it slips; segments carry their own birth time + alpha and fade in the shader
// (alpha decays over `life` seconds), so there is no per-frame CPU work except appending new segments.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec2 aAlpha;   // alpha, birth
uniform float uTime;
uniform float uLife;
varying vec2 vUv;
varying float vA;
varying vec3 vPos;
varying float vFogDist;
void main() {
  float age = uTime - aAlpha.y;
  vA = aAlpha.x * (1.0 - smoothstep(uLife * 0.45, uLife, age));
  vUv = uv; vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */`
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec3 uTint;
varying vec2 vUv;
varying float vA;
varying vec3 vPos;
varying float vFogDist;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
  float n = 0.72 + 0.28 * hash(floor(vPos.xz * 22.0));
  float a = vA * edge * n;
  if (a < 0.01) discard;
  float fog = clamp((vFogDist - uFog.x) / max(1.0, uFog.y - uFog.x), 0.0, 1.0);
  vec3 col = mix(uTint, uFogColor, fog);
  gl_FragColor = vec4(col, a * (1.0 - fog));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SkidMarks {
  /** @param {number} segments pool size (quads) */
  constructor(segments = 2400, life = 9) {
    this.cap = segments;
    this.life = life;
    this.head = 0;
    this.pos = new Float32Array(segments * 4 * 3);
    this.uvs = new Float32Array(segments * 4 * 2);
    this.alpha = new Float32Array(segments * 4 * 2);
    for (let i = 0; i < segments; i++) { this.alpha[i * 8 + 1] = -1000; this.alpha[i * 8 + 3] = -1000; this.alpha[i * 8 + 5] = -1000; this.alpha[i * 8 + 7] = -1000; }
    const idx = new Uint32Array(segments * 6);
    for (let i = 0; i < segments; i++) {
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
      this.uvs.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    g.setAttribute('aAlpha', this.aAlpha);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry = g;
    this.uniforms = {
      uTime: { value: 0 }, uLife: { value: life },
      uFogColor: { value: new THREE.Color(0xcfe9ff) }, uFog: { value: new THREE.Vector2(180, 700) },
      uTint: { value: new THREE.Color(0.025, 0.025, 0.03) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'skidmarks';
    this.slots = new Map();
    this.lo = -1; this.hi = -1;
  }

  /** Per-wheel state (Float64-free plain object, created once per slot key). */
  slot(key) {
    let s = this.slots.get(key);
    if (!s) { s = { on: false, x: 0, y: 0, z: 0, a: 0, rx: 0, ry: 0, rz: 0 }; this.slots.set(key, s); }
    return s;
  }

  /**
   * Feed one wheel each frame.  (px,py,pz) = contact point lifted off the road, (rx,ry,rz) = unit wheel axis (lateral), w = half width.
   * active = the tyre is slipping; a = darkness 0..1.
   */
  feed(s, active, a, px, py, pz, rx, ry, rz, w, time) {
    if (!active) {
      if (s.on) { this._seg(s, px, py, pz, rx, ry, rz, w, 0, time); s.on = false; }
      return;
    }
    if (!s.on) { s.on = true; s.x = px; s.y = py; s.z = pz; s.a = 0; s.rx = rx; s.ry = ry; s.rz = rz; }
    const dx = px - s.x, dy = py - s.y, dz = pz - s.z;
    if (dx * dx + dy * dy + dz * dz >= 0.2 * 0.2) this._seg(s, px, py, pz, rx, ry, rz, w, a, time);
  }

  _seg(s, px, py, pz, rx, ry, rz, w, a1, time) {
    const dx = px - s.x, dy = py - s.y, dz = pz - s.z;
    if (dx * dx + dy * dy + dz * dz > 6 * 6) { s.x = px; s.y = py; s.z = pz; s.a = a1; s.rx = rx; s.ry = ry; s.rz = rz; return; } // teleport / respawn: restart
    const i = this.head;
    this.head = (i + 1) % this.cap;
    const P = this.pos, A = this.alpha, o = i * 12, q = i * 8;
    P[o] = s.x - s.rx * w; P[o + 1] = s.y - s.ry * w; P[o + 2] = s.z - s.rz * w;
    P[o + 3] = s.x + s.rx * w; P[o + 4] = s.y + s.ry * w; P[o + 5] = s.z + s.rz * w;
    P[o + 6] = px - rx * w; P[o + 7] = py - ry * w; P[o + 8] = pz - rz * w;
    P[o + 9] = px + rx * w; P[o + 10] = py + ry * w; P[o + 11] = pz + rz * w;
    A[q] = s.a; A[q + 1] = time; A[q + 2] = s.a; A[q + 3] = time; A[q + 4] = a1; A[q + 5] = time; A[q + 6] = a1; A[q + 7] = time;
    s.x = px; s.y = py; s.z = pz; s.a = a1; s.rx = rx; s.ry = ry; s.rz = rz;
    if (this.lo < 0) { this.lo = this.hi = i; } else { if (i < this.lo) this.lo = i; if (i > this.hi) this.hi = i; }
  }

  setTime(t) { this.uniforms.uTime.value = t; }

  flush() {
    if (this.lo < 0) return;
    const lo = this.lo, n = this.hi - this.lo + 1;
    this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(lo * 12, n * 12); this.aPos.needsUpdate = true;
    this.aAlpha.clearUpdateRanges(); this.aAlpha.addUpdateRange(lo * 8, n * 8); this.aAlpha.needsUpdate = true;
    this.lo = this.hi = -1;
  }

  /** Forget everything (new race). */
  clear() {
    for (let i = 0; i < this.cap; i++) for (let k = 0; k < 4; k++) this.alpha[i * 8 + k * 2 + 1] = -1000;
    this.aAlpha.needsUpdate = true;
    this.slots.clear();
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
