// Soft contact ("blob") shadows under every kart: one InstancedMesh, one draw call. OWNER: Agent C (vfx).
// Grounds the karts on every quality level (with real shadow maps it just adds contact darkness; on `low` it IS the shadow).
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float iAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv; vA = iAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying float vA;
void main() {
  float s = texture2D(uMap, vUv).a * vA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(0.02, 0.03, 0.06, s);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  // rounded-rectangle-ish soft blob: stack of blurred rounded rects
  for (let i = 0; i < 6; i++) {
    const inset = 14 + i * 6, a = 0.18 + i * 0.07;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.beginPath(); g.roundRect(inset, inset * 0.9 + 4, 128 - inset * 2, 128 - inset * 1.8 - 8, 30 - i * 2); g.fill();
  }
  g.filter = 'blur(6px)';
  g.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class BlobShadows {
  constructor(max = 16) {
    this.max = max;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.iAlpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iAlpha', this.iAlpha);
    this.map = shadowTexture();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.map } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, this.material, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'blobshadows';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.n = 0;
    this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  begin() { this.n = 0; }
  add(position, quat, up, w, l, alpha, lift = 0.04) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._p.copy(position).addScaledVector(up, lift);
    this._s.set(w, 1, l);
    this._m.compose(this._p, quat, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.iAlpha.array[i] = alpha;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) { this.mesh.instanceMatrix.needsUpdate = true; this.iAlpha.needsUpdate = true; }
  }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.map.dispose(); }
}
