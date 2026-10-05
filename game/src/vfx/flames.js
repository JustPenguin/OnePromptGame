// Boost / mini-turbo / rocket flame cones: ONE InstancedMesh for every exhaust in the race. OWNER: Agent C (vfx).
// Each instance is an additive teardrop cone aligned to the exhaust, with flicker, a hot white core and a coloured fringe.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec4 iParams;   // intensity, -, phase, length
attribute vec3 iCol;
uniform float uTime;
varying float vS;
varying vec3 vCol;
varying float vI;
varying vec3 vN;
varying vec3 vView;
void main() {
  float s = position.z;
  vec3 p = position;
  float flick = 0.5 * sin(uTime * 41.0 + iParams.z + s * 12.0) + 0.5 * sin(uTime * 63.0 + iParams.z * 1.7 + s * 7.0);
  p.xy *= 1.0 + 0.16 * flick * s;
  p.xy += vec2(sin(uTime * 29.0 + iParams.z), cos(uTime * 33.0 + iParams.z)) * 0.03 * s;
  p.z *= iParams.w;
  mat4 mm = modelViewMatrix * instanceMatrix;
  vec4 mv = mm * vec4(p, 1.0);
  vN = normalize(mat3(mm) * normal);
  vView = normalize(-mv.xyz);
  vS = s; vCol = iCol; vI = iParams.x;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */`
varying float vS;
varying vec3 vCol;
varying float vI;
varying vec3 vN;
varying vec3 vView;
void main() {
  float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.3);
  float core = smoothstep(0.7, 0.0, vS);
  vec3 col = mix(vCol, vec3(1.0), clamp(core * 0.85 + edge * 0.35, 0.0, 1.0)) * (1.5 + 2.2 * vI);
  float a = pow(max(1.0 - vS, 0.0), 1.15) * edge * clamp(vI, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class FlameSystem {
  constructor(maxFlames = 32) {
    this.max = maxFlames;
    const g = new THREE.ConeGeometry(0.5, 1, 14, 5, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    this.iParams = new THREE.InstancedBufferAttribute(new Float32Array(maxFlames * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(maxFlames * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iParams', this.iParams);
    g.setAttribute('iCol', this.iCol);
    this.uniforms = { uTime: { value: 0 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, this.material, maxFlames);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.name = 'flames';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.n = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }
  begin() { this.n = 0; }
  /** Add a flame at `pos`, pointing along `dirQuat`'s +Z, with width/length in metres. */
  add(pos, quat, width, length, intensity, r, g, b, phase) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._s.set(width, width, 1);
    this._m.compose(pos, quat, this._s);
    this.mesh.setMatrixAt(i, this._m);
    const P = this.iParams.array, C = this.iCol.array;
    P[i * 4] = intensity; P[i * 4 + 1] = 0; P[i * 4 + 2] = phase; P[i * 4 + 3] = length;
    C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) { this.mesh.instanceMatrix.needsUpdate = true; this.iParams.needsUpdate = true; this.iCol.needsUpdate = true; }
  }
  setTime(t) { this.uniforms.uTime.value = t; }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.dispose?.(); }
}
