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
uniform float uHot;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.3);      // 0 facing the camera .. 1 on the silhouette
  float ph = f * 1.3 + vP.y * 0.7 - uTime * 0.45;
  vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + ph));  // soap-film colours
  vec3 fire = mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.75, 0.25), 0.5 + 0.5 * sin(ph * 6.2831853));
  vec3 tint = mix(irid, fire, uHot);
  // slow rolling interference bands
  float b = 0.5 + 0.5 * sin(vP.y * 9.0 + uTime * 2.0) * sin(vP.x * 9.0 - uTime * 1.3) * sin(vP.z * 9.0 + uTime * 1.7);
  float a = (0.03 + f * 0.5) * (0.8 + 0.2 * b) * uStrength;
  // additive, but bounded (rim contribution <= ~0.65): the kart behind it keeps its colours and bloom never clips it to white
  gl_FragColor = vec4(tint * (0.6 + f * 0.6), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ShieldBubbles {
  constructor(max = 8) {
    this.max = max;
    this.geo = new THREE.SphereGeometry(1, 24, 16);
    this.uniformsShared = { uTime: { value: 0 } };
    this.items = [];
    for (let i = 0; i < max; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uniformsShared.uTime, uStrength: { value: 1 }, uHot: { value: 0 } },
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      });
      const m = new THREE.Mesh(this.geo, mat);
      m.visible = false; m.frustumCulled = false; m.renderOrder = 23;
      this.items.push({ mesh: m, kart: null, pop: 0 });
    }
  }
  attachTo(group) { for (const it of this.items) group.add(it.mesh); }
  setTime(t) { this.uniformsShared.uTime.value = t; }

  /**
   * One bubble per protected kart.  leftFn(kart) = seconds of protection left (<= 0: none), hotFn(kart) = fiery (rocket) instead of prism palette.
   * The bubble fades over the last second and blinks over the last 1.5 s.
   */
  update(dt, karts, leftFn, hotFn) {
    let n = 0;
    const T = this.uniformsShared.uTime.value;
    for (let i = 0; i < karts.length; i++) {
      const k = karts[i];
      const left = leftFn(k);
      if (!(left > 0) || n >= this.max) continue;
      const it = this.items[n++];
      if (it.kart !== k) { it.kart = k; it.pop = 0; }
      it.pop = Math.min(1, it.pop + dt * 5);
      const m = it.mesh;
      m.visible = true;
      const pop = 1 - Math.pow(1 - it.pop, 3);
      const ks = k.scale ?? 1;
      const sc = (1.7 + Math.sin(T * 4 + k.id) * 0.03) * pop * ks;
      m.position.copy(k.position).addScaledVector(k.up, 0.85 * ks);
      m.scale.setScalar(Math.max(0.01, sc));
      const u = m.material.uniforms;
      u.uStrength.value = Math.min(1, left) * (left < 1.5 ? 0.65 + 0.35 * Math.sin(T * 22) : 1);
      u.uHot.value = hotFn && hotFn(k) ? 1 : 0;
    }
    for (let i = n; i < this.max; i++) { this.items[i].mesh.visible = false; this.items[i].kart = null; }
  }

  dispose() { this.geo.dispose(); for (const it of this.items) { it.mesh.removeFromParent(); it.mesh.material.dispose(); } }
}
