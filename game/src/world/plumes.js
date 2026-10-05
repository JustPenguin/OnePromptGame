// Plumes: smoke, steam, ash and fire columns rising from a fixed point (chimneys, geysers, volcano, vents).   OWNER: Agent B.
// One instanced draw call per plume, ALL motion in the vertex shader (no CPU work): each puff has a looping age, rises, spreads, grows and fades.
import * as THREE from 'three';
import { toColor } from './geo.js';
import { glowTexture } from './textures.js';

const VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform vec3 uOrigin; uniform float uTime; uniform float uLife; uniform float uRise; uniform float uSpread;
  uniform float uSize0; uniform float uSize1; uniform float uOpacity; uniform vec3 uWind; uniform float uPulse; uniform float uPhase;
  varying vec2 vUv; varying float vA; varying float vAge;
  void main() {
    float eruptions = 1.0;
    if ( uPulse > 0.0 ) {      // geyser: active for part of every cycle
      float c = fract( ( uTime + uPhase ) / uPulse );
      eruptions = smoothstep( 0.0, 0.08, c ) * ( 1.0 - smoothstep( 0.35, 0.5, c ) );
    }
    float age = mod( uTime / uLife + aSeed.x, 1.0 );
    vec3 p = uOrigin + vec3( ( aSeed.y - 0.5 ) * uSpread * age, uRise * uLife * age, ( aSeed.z - 0.5 ) * uSpread * age ) + uWind * age * uLife;
    p.x += sin( uTime * 0.7 + aSeed.w * 20.0 ) * age * 0.9;
    vec4 mv = viewMatrix * vec4( p, 1.0 );
    float size = mix( uSize0, uSize1, age ) * ( 0.7 + 0.6 * aSeed.w ) * mix( 0.2, 1.0, eruptions );
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vUv = uv; vAge = age;
    vA = smoothstep( 0.0, 0.1, age ) * ( 1.0 - smoothstep( 0.5, 1.0, age ) ) * uOpacity * eruptions;
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uColor2; uniform float uHeat;
  varying vec2 vUv; varying float vA; varying float vAge;
  void main() {
    vec4 t = texture2D( uMap, vUv );
    float a = t.a * vA;
    if ( a < 0.004 ) discard;
    vec3 c = mix( uColor, uColor2, smoothstep( 0.0, 0.7, vAge ) );
    c *= mix( 1.0, 1.6 - vAge * 1.2, uHeat );          // hot plumes glow near the source
    gl_FragColor = vec4( c * t.rgb, a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * spec = { origin:[x,y,z], count: 14, life: 4 (s), rise: 2.5 (m/s), spread: 3, size: [0.8, 4], color:'#cfd6e6', color2: '#9aa4b8', opacity: 0.5,
 *          wind:[0.8,0,0.3], additive:false, heat: 0..1 (glow), pulse: 0 | seconds per eruption cycle (geysers), phase }
 */
export function createPlume(world, spec) {
  const count = spec.count ?? 14;
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { seed[i * 4] = i / count + world.rand() * 0.04; seed[i * 4 + 1] = world.rand(); seed[i * 4 + 2] = world.rand(); seed[i * 4 + 3] = world.rand(); }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = count;
  const map = world.tex(glowTexture({ inner: 'rgba(255,255,255,0.9)', outer: 'rgba(255,255,255,0)', hard: 0.05, size: 64 }));
  const uniforms = {
    uOrigin: { value: new THREE.Vector3(...spec.origin) }, uTime: world.timeUniform, uLife: { value: spec.life ?? 4 }, uRise: { value: spec.rise ?? 2.5 }, uSpread: { value: spec.spread ?? 3 },
    uSize0: { value: spec.size?.[0] ?? 0.8 }, uSize1: { value: spec.size?.[1] ?? 4 }, uOpacity: { value: spec.opacity ?? 0.5 }, uWind: { value: new THREE.Vector3(...(spec.wind ?? [0.8, 0, 0.3])) },
    uPulse: { value: spec.pulse ?? 0 }, uPhase: { value: spec.phase ?? world.rand() * 10 }, uMap: { value: map }, uColor: { value: toColor(spec.color ?? '#cfd6e6') }, uColor2: { value: toColor(spec.color2 ?? spec.color ?? '#9aa4b8') }, uHeat: { value: spec.heat ?? 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.name = `plume:${spec.name ?? 'plume'}`;
  world.group.add(mesh);
  return { mesh, uniforms, onQuality(q) { geo.instanceCount = Math.max(2, Math.round(count * Math.min(1, 0.5 + 0.5 * (q.particles ?? 1)))); } };
}
