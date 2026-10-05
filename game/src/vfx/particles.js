// GPU particle layer. OWNER: Agent C (vfx).
//
// Stateless particles: the CPU only WRITES a particle when it is spawned (into a ring buffer of instanced attributes); the vertex
// shader evaluates its whole life in closed form (drag + gravity integrated analytically), builds the billboard, fades colour and
// size, and collapses dead instances off-screen.  So cost per frame = (#spawned) typed-array writes + one partial buffer upload
// + two draw calls for the whole game (one additive layer, one alpha layer).  Zero per-frame allocation.
//
// Modes (aMisc.w):  0 = camera-facing billboard, 1 = flat on the ground (normal = +Y, for rings / shockwaves),
//                   2 = velocity-stretched streak (sparks, speed lines).
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from './sprites.js';
import { DirtyRange } from './dirty.js';

const STRIDE = { aPos0: 3, aVel: 3, aLife: 4, aSize: 4, aCol0: 4, aCol1: 4, aMisc: 4 };
const STRIDE_LIST = Object.entries(STRIDE);   // (iterated every flush: keep it allocation-free)

const VERT = /* glsl */`
attribute vec3 aPos0;
attribute vec3 aVel;
attribute vec4 aLife;   // birth, life, drag, gravity
attribute vec4 aSize;   // size0, size1, stretch, rot0
attribute vec4 aCol0;
attribute vec4 aCol1;
attribute vec4 aMisc;   // frame, rotSpeed, fadeIn, mode
uniform float uTime;
uniform vec2 uAtlas;
uniform float uNearFade;
varying vec4 vCol;
varying vec2 vUv;
varying float vDist;
void main() {
  float age = uTime - aLife.x;
  float t = age / aLife.y;
  if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vUv = vec2(0.0); vDist = 0.0; return; }
  float k = aLife.z;
  float e = k > 0.001 ? (1.0 - exp(-k * age)) / k : age;
  vec3 p = aPos0 + aVel * e;
  float g = aLife.w;
  p.y -= k > 0.001 ? (g / k) * (age - e) : 0.5 * g * age * age;
  float size = mix(aSize.x, aSize.y, t);
  float ang = aSize.w + aMisc.y * age;
  vec2 q = position.xy;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  int mode = int(aMisc.w + 0.5);
  if (mode == 1) {
    // flat on the ground: rotate in the XZ plane
    float c = cos(ang), s = sin(ang);
    vec3 off = vec3(q.x * c - q.y * s, 0.0, q.x * s + q.y * c) * size;
    mv = viewMatrix * vec4(p + off, 1.0);
  } else if (mode == 2) {
    // streak: long axis along the current velocity projected onto the view plane
    vec3 v = aVel * exp(-k * age);
    v.y -= (k > 0.001 ? (g / k) * (1.0 - exp(-k * age)) : g * age);
    vec3 vv = (viewMatrix * vec4(v, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
    float len = size + aSize.z * length(v);
    mv.xy += dir * q.x * len + vec2(-dir.y, dir.x) * q.y * size * 0.38;
  } else {
    float c = cos(ang), s = sin(ang);
    mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c) * size;
  }
  gl_Position = projectionMatrix * mv;
  vDist = -mv.z;
  float fadeIn = aMisc.z > 0.0 ? smoothstep(0.0, aMisc.z, t) : 1.0;
  vCol = mix(aCol0, aCol1, t);
  vCol.a *= fadeIn * smoothstep(0.0, uNearFade, vDist);
  float f = floor(aMisc.x + 0.5);
  vec2 cell = vec2(mod(f, uAtlas.x), uAtlas.y - 1.0 - floor(f / uAtlas.x));   // canvas rows count from the TOP, uv.v from the bottom
  vUv = (cell + uv) / uAtlas;
}
`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec3 uLight;
uniform float uAdditive;
varying vec4 vCol;
varying vec2 vUv;
varying float vDist;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vCol.a;
  if (a < 0.003) discard;
  vec3 col = vCol.rgb * tex.rgb;
  float fog = clamp((vDist - uFog.x) / max(1.0, uFog.y - uFog.x), 0.0, 1.0);
  if (uAdditive > 0.5) {
    col *= 1.0 - fog;                       // additive glints fade out with distance instead of tinting
  } else {
    col = mix(col * uLight, uFogColor, fog);
  }
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ParticleLayer {
  /**
   * @param {{ capacity: number, additive: boolean, map: THREE.Texture, renderOrder?: number }} o
   */
  constructor(o) {
    this.capacity = Math.max(16, o.capacity | 0);
    this.additive = !!o.additive;
    const n = this.capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.arrays = {};
    this.attrs = {};
    for (const [name, size] of Object.entries(STRIDE)) {
      const arr = new Float32Array(n * size);
      this.arrays[name] = arr;
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      this.attrs[name] = a;
      g.setAttribute(name, a);
    }
    // all particles start "dead": birth far in the past with a short life
    const life = this.arrays.aLife;
    for (let i = 0; i < n; i++) { life[i * 4] = -1000; life[i * 4 + 1] = 0.01; }
    g.instanceCount = 0;
    this.geometry = g;
    this.uniforms = {
      uTime: { value: 0 },
      uMap: { value: o.map },
      uAtlas: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
      uFogColor: { value: new THREE.Color(0xcfe9ff) },
      uFog: { value: new THREE.Vector2(180, 700) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uAdditive: { value: this.additive ? 1 : 0 },
      uNearFade: { value: 2.2 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? (this.additive ? 21 : 20);
    this.mesh.name = this.additive ? 'particles:add' : 'particles:alpha';
    this.head = 0;
    this.high = 0;
    this.dirty = new DirtyRange(this.mesh, STRIDE_LIST.map(([n, sz]) => [this.attrs[n], sz]));
    this.spawned = 0;
  }

  /** Resize the live capacity (quality changes); existing particles are dropped. */
  setCapacity(n) { /* capacity is fixed at construction; quality scales the spawn budget instead */ void n; }

  /**
   * Spawn one particle.  birth = current layer time.
   * position, velocity (m/s), life (s), size0 -> size1 (m), colour0 -> colour1 (rgba, linear, may exceed 1 for HDR/bloom),
   * frame (sprite index), drag (1/s), gravity (m/s^2, positive pulls down), stretch (streak length per m/s), rot0 / rotSpeed (rad), fadeIn (0..1 of life), mode.
   */
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r0, g0, b0, a0, r1, g1, b1, a1, frame, drag, grav, stretch, rot0, rotSpeed, fadeIn, mode) {
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    if (i > this.high) this.high = i;
    const A = this.arrays;
    let o = i * 3;
    A.aPos0[o] = x; A.aPos0[o + 1] = y; A.aPos0[o + 2] = z;
    A.aVel[o] = vx; A.aVel[o + 1] = vy; A.aVel[o + 2] = vz;
    o = i * 4;
    A.aLife[o] = this.uniforms.uTime.value; A.aLife[o + 1] = life; A.aLife[o + 2] = drag; A.aLife[o + 3] = grav;
    A.aSize[o] = s0; A.aSize[o + 1] = s1; A.aSize[o + 2] = stretch; A.aSize[o + 3] = rot0;
    A.aCol0[o] = r0; A.aCol0[o + 1] = g0; A.aCol0[o + 2] = b0; A.aCol0[o + 3] = a0;
    A.aCol1[o] = r1; A.aCol1[o + 1] = g1; A.aCol1[o + 2] = b1; A.aCol1[o + 3] = a1;
    A.aMisc[o] = frame; A.aMisc[o + 1] = rotSpeed; A.aMisc[o + 2] = fadeIn; A.aMisc[o + 3] = mode;
    this.dirty.mark(i);
    this.spawned++;
  }

  /** Advance the layer clock (call once per frame, before rendering). */
  setTime(t) { this.uniforms.uTime.value = t; }

  /** Hand what was spawned since the last flush to the GPU buffers (union-ed across steps until a render has consumed it). */
  flush() {
    this.geometry.instanceCount = this.high + 1;
    this.dirty.commit();
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
