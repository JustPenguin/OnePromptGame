// Headlight beams for dark tracks: ONE InstancedMesh (additive soft cones) for every lamp in the race. OWNER: Agent C (vfx).
// A beam is a hollow cone with its apex at the lamp, brightest at the lens and fading with distance and toward its silhouette,
// so it reads as light scattering in the air without any extra lighting cost.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec4 iParams;   // intensity, -, -, length
attribute vec3 iCol;
varying float vS;
varying vec3 vCol;
varying float vI;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 p = position;
  vS = p.z;
  p.z *= iParams.w;
  mat4 mm = modelViewMatrix * instanceMatrix;
  vec4 mv = mm * vec4(p, 1.0);
  vN = normalize(mat3(mm) * normal);
  vView = normalize(-mv.xyz);
  vCol = iCol; vI = iParams.x;
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
  float facing = abs(dot(normalize(vN), normalize(vView)));
  float edge = pow(facing, 1.6);                         // soft silhouette: no hard cone outline
  float along = pow(max(1.0 - vS, 0.0), 1.35) * smoothstep(0.0, 0.05, vS);
  float a = along * edge * vI * 0.34;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * (1.0 + 0.8 * (1.0 - vS)), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class BeamSystem {
  constructor(max = 48) {
    this.max = max;
    const g = new THREE.ConeGeometry(0.5, 1, 18, 1, true);
    g.translate(0, -0.5, 0);          // apex at the origin, opening toward -Y
    g.rotateX(-Math.PI / 2);          // ... and now toward +Z
    this.iParams = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iParams', this.iParams);
    g.setAttribute('iCol', this.iCol);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, this.material, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 19;
    this.mesh.name = 'beams';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.n = 0;
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
  }
  begin() { this.n = 0; }
  /** Beam from `pos` along `quat`'s +Z: `width` = radius of the far end (m), `length` m, `intensity` 0..1, linear rgb. */
  add(pos, quat, width, length, intensity, r, g, b) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._s.set(width * 2, width * 2, 1);
    this._m.compose(pos, quat, this._s);
    this.mesh.setMatrixAt(i, this._m);
    const P = this.iParams.array, C = this.iCol.array;
    P[i * 4] = intensity; P[i * 4 + 3] = length;
    C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) { this.mesh.instanceMatrix.needsUpdate = true; this.iParams.needsUpdate = true; this.iCol.needsUpdate = true; }
  }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.mesh.dispose?.(); }
}
