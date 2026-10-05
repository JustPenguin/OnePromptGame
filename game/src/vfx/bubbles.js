// Shield bubbles (a fresnel sphere around protected karts) and the little "ring pop" meshes. OWNER: Agent C (vfx).
// Pooled: a handful of meshes shared by all karts; each is only visible while its kart is shielded.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */`
uniform float uTime;
uniform float uStrength;
uniform vec3 uColor;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  // slow rolling hexagon-ish interference bands
  float b = 0.5 + 0.5 * sin(vP.y * 9.0 + uTime * 2.0) * sin(vP.x * 9.0 - uTime * 1.3) * sin(vP.z * 9.0 + uTime * 1.7);
  float a = (0.07 + f * 0.85) * (0.8 + 0.2 * b) * uStrength;
  vec3 col = mix(uColor, vec3(1.0), f * 0.55) * (1.2 + f * 1.8);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ShieldBubbles {
  constructor(max = 6) {
    this.max = max;
    this.geo = new THREE.SphereGeometry(1, 24, 16);
    this.uniformsShared = { uTime: { value: 0 } };
    this.items = [];
    for (let i = 0; i < max; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uniformsShared.uTime, uStrength: { value: 1 }, uColor: { value: new THREE.Color(0.25, 0.85, 1.0) } },
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      });
      const m = new THREE.Mesh(this.geo, mat);
      m.visible = false; m.frustumCulled = false; m.renderOrder = 23;
      this.items.push({ mesh: m, kart: null, pop: 0 });
    }
  }
  attachTo(group) { for (const it of this.items) group.add(it.mesh); }
  setTime(t) { this.uniformsShared.uTime.value = t; }

  /** Show a bubble for each kart in `list` (array of {kart, strength}); returns nothing. */
  update(dt, karts, isShielded) {
    let n = 0;
    for (const k of karts) {
      const s = isShielded(k);
      if (s <= 0 || n >= this.max) continue;
      const it = this.items[n++];
      if (it.kart !== k) { it.kart = k; it.pop = 0; }
      it.pop = Math.min(1, it.pop + dt * 5);
      const m = it.mesh;
      m.visible = true;
      const pop = 1 - Math.pow(1 - it.pop, 3);
      const sc = (1.55 + Math.sin(performance.now() * 0.004 + k.id) * 0.03) * pop * (k.scale ?? 1);
      m.position.copy(k.position); m.position.y += 0.75 * (k.scale ?? 1);
      m.scale.setScalar(Math.max(0.01, sc));
      m.material.uniforms.uStrength.value = Math.min(1, s);
    }
    for (let i = n; i < this.max; i++) { this.items[i].mesh.visible = false; this.items[i].kart = null; }
  }

  dispose() { this.geo.dispose(); for (const it of this.items) { it.mesh.removeFromParent(); it.mesh.material.dispose(); } }
}
