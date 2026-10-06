// Image-based lighting for karts (and, at low intensity, the world). OWNER: Agent C (render).
//
// We never ship HDR files: the environment is an analytic dome (sky gradient, ground bounce, HDR sun disc, a few
// softbox "cards" for crisp, flattering highlights on glossy paint) captured by PMREMGenerator.
//   const env = new EnvironmentFactory(webglRenderer);
//   const tex = env.create({ top, horizon, ground, sunDir, sunColor, sunIntensity, studio });   // -> THREE.Texture (PMREM)
//   env.dispose(tex)
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
`;

const FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunI;
uniform float uStudio;
uniform float uSkyGain;

// soft rectangle "light card": gnomonic projection onto the plane facing direction c
float card( vec3 d, vec3 c, vec3 up0, vec2 size, float soft ) {
  float f = dot( d, c );
  if ( f <= 0.02 ) return 0.0;
  vec3 r = normalize( cross( up0, c ) );
  vec3 u = cross( c, r );
  vec2 p = vec2( dot( d, r ), dot( d, u ) ) / f;
  vec2 q = abs( p ) - size;
  float m = max( q.x, q.y );
  return 1.0 - smoothstep( -soft, soft, m );
}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  vec3 sky = mix( uHorizon, uTop, pow( clamp( h, 0.0, 1.0 ), 0.55 ) ) * uSkyGain;
  vec3 gnd = mix( uHorizon * 0.55 + uGround * 0.45, uGround * 0.6, clamp( -h * 2.6, 0.0, 1.0 ) );
  vec3 col = h >= 0.0 ? sky : gnd;
  col += uHorizon * exp( -abs( h ) * 12.0 ) * 0.4;           // horizon haze band
  float sd = max( dot( d, uSunDir ), 0.0 );
  col += uSunCol * uSunI * ( pow( sd, 2200.0 ) * 9.0 + pow( sd, 90.0 ) * 0.5 + pow( sd, 7.0 ) * 0.07 );
  // studio softboxes: key (front-left high), rim (rear-right), fill strip (low front-right)
  float k = card( d, normalize( vec3( 0.55, 0.85, 0.7 ) ), vec3( 0.0, 1.0, 0.0 ), vec2( 0.62, 0.3 ), 0.18 );
  float r = card( d, normalize( vec3( -0.8, 0.45, -0.7 ) ), vec3( 0.0, 1.0, 0.0 ), vec2( 0.45, 0.22 ), 0.18 );
  float f = card( d, normalize( vec3( -0.9, 0.12, 0.55 ) ), vec3( 0.0, 1.0, 0.0 ), vec2( 0.5, 0.08 ), 0.1 );
  col += uStudio * ( vec3( 1.0, 0.97, 0.92 ) * k * 3.4 + vec3( 0.85, 0.92, 1.0 ) * r * 2.4 + vec3( 1.0, 1.0, 1.0 ) * f * 1.4 );
  gl_FragColor = vec4( col, 1.0 );
}
`;

const _sun = new THREE.Vector3();

export class EnvironmentFactory {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = new THREE.Scene();
    this.uniforms = {
      uTop: { value: new THREE.Color('#3d8bff') },
      uHorizon: { value: new THREE.Color('#cfe9ff') },
      uGround: { value: new THREE.Color('#5da13a') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.35).normalize() },
      uSunCol: { value: new THREE.Color('#fff1d6') },
      uSunI: { value: 1 },
      uStudio: { value: 0.35 },
      uSkyGain: { value: 1.5 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 20),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false }),
    );
    this.scene.add(this.dome);
    this.targets = new Set();
  }

  /**
   * @param {{top?:any, horizon?:any, ground?:any, sunDir?:THREE.Vector3, sunColor?:any, sunIntensity?:number, studio?:number, skyGain?:number, size?:number}} spec
   * @returns {THREE.Texture} prefiltered environment (owned by this factory; free with dispose(tex))
   */
  create(spec = {}) {
    const u = this.uniforms;
    if (spec.top !== undefined) u.uTop.value.set(spec.top);
    if (spec.horizon !== undefined) u.uHorizon.value.set(spec.horizon);
    if (spec.ground !== undefined) u.uGround.value.set(spec.ground);
    if (spec.sunDir) u.uSunDir.value.copy(spec.sunDir).normalize();
    if (spec.sunColor !== undefined) u.uSunCol.value.set(spec.sunColor);
    u.uSunI.value = spec.sunIntensity ?? 1;
    u.uStudio.value = spec.studio ?? 0.35;
    u.uSkyGain.value = spec.skyGain ?? 1.5;
    const rt = this.pmrem.fromScene(this.scene, 0, 0.1, 100, { size: spec.size ?? 256 });
    this.targets.add(rt);
    rt.texture.userData.envTarget = rt;
    return rt.texture;
  }

  dispose(tex) {
    const rt = tex?.userData?.envTarget;
    if (rt && this.targets.delete(rt)) rt.dispose();
  }

  destroy() {
    for (const rt of this.targets) rt.dispose();
    this.targets.clear();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.pmrem.dispose();
  }
}

/** Neutral bright "photo studio" look used by menus, portraits and the lab. */
export const STUDIO_SPEC = Object.freeze({ top: '#5f93e8', horizon: '#dcebff', ground: '#9aa3b4', sunDir: new THREE.Vector3(0.45, 0.85, 0.4), sunColor: '#fff1d6', sunIntensity: 0.9, studio: 1.0, skyGain: 1.35 });

/**
 * Derive an environment spec from a loaded scene + track: sky colours from track.def.palette (documented in the track
 * registry), the sun from the scene's shadow-casting directional light.
 */
export function specFromScene(scene, track) {
  const pal = track?.def?.palette ?? {};
  const bg = scene?.background?.isColor ? scene.background : null;
  const horizon = pal.skyHorizon ?? (bg ? '#' + bg.getHexString() : '#cfe9ff');
  const top = pal.skyTop ?? '#4aa3ff';
  const ground = pal.ground ?? '#5d8a3a';
  let sunDir = STUDIO_SPEC.sunDir, sunColor = '#fff1d6', sunIntensity = 1, found = false;
  scene?.traverse?.((o) => {
    if (found || !o.isDirectionalLight) return;
    found = true;
    _sun.copy(o.position).sub(o.target?.position ?? _sunZero);
    if (_sun.lengthSq() > 4) { sunDir = _sun.clone().normalize(); }
    sunColor = '#' + o.color.getHexString();
    sunIntensity = Math.min(2, Math.max(0.15, o.intensity / 3));
  });
  return { top, horizon, ground, sunDir, sunColor, sunIntensity, studio: 0.4, skyGain: 1.5 };
}
const _sunZero = new THREE.Vector3();
