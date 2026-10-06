// Ambient particles: snow, embers, rain, dust, pollen, fireflies, stardust.   OWNER: Agent B.
// ONE instanced draw call; every particle's position is computed in the vertex shader from a per-instance seed, the elapsed time and the
// camera position (the field wraps around the camera inside a box), so there is NO per-frame CPU work except two uniforms.
// Particles are camera-facing quads, optionally stretched along their velocity (rain streaks).
import * as THREE from 'three';
import { toColor } from './geo.js';
import { glowTexture } from './textures.js';

const VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uVel; uniform float uTime; uniform vec2 uSize;
  uniform float uSway; uniform float uStretch; uniform float uTwinkle; uniform float uFadeNear;
  varying vec2 vUv; varying float vAlpha; varying float vTw;
  void main() {
    vec3 box = uBox;
    vec3 p = aSeed.xyz * box + uVel * uTime * ( 0.65 + 0.7 * aSeed.w );
    p.x += sin( uTime * 0.8 + aSeed.w * 40.0 ) * uSway;
    p.z += cos( uTime * 0.65 + aSeed.w * 23.0 ) * uSway;
    vec3 rel = mod( p - uCam + box * 0.5, box ) - box * 0.5;
    vec3 wp = uCam + rel;
    vec4 mv = viewMatrix * vec4( wp, 1.0 );
    float k = 0.6 + 0.8 * aSeed.w;
    vec2 c = position.xy;
    if ( uStretch > 0.0 ) {
      vec3 vd = ( viewMatrix * vec4( normalize( uVel ), 0.0 ) ).xyz;
      vec2 d = normalize( vd.xy + vec2( 1e-4 ) );
      vec2 perp = vec2( -d.y, d.x );
      c = perp * position.x * uSize.x * k + d * position.y * uSize.y * k * uStretch;
    } else c = position.xy * uSize * k;
    mv.xy += c;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    float dist = length( rel ) / ( min( min( box.x, box.z ) * 0.5, box.y * 0.5 ) );
    vAlpha = ( 1.0 - smoothstep( 0.55, 1.0, dist ) ) * smoothstep( 0.0, uFadeNear, -mv.z );
    vTw = uTwinkle > 0.0 ? 0.55 + 0.45 * sin( uTime * uTwinkle + aSeed.w * 60.0 ) : 1.0;
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
  varying vec2 vUv; varying float vAlpha; varying float vTw;
  void main() {
    vec4 t = texture2D( uMap, vUv );
    float a = t.a * vAlpha * uOpacity * vTw;
    if ( a < 0.01 ) discard;
    gl_FragColor = vec4( uColor * t.rgb, a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * spec = { count: 1200, box: [70, 40, 70], size: [0.12, 0.12] (m), color: '#fff', opacity: 0.9, velocity: [0.3,-2.2,0.1], sway: 0.6,
 *          additive: false, stretch: 0 (1 = rain streak), twinkle: 0 (rate), map: 'soft'|'hard' }
 */
export function createAmbient(world, spec) {
  const count = spec.count ?? 1200;
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv; geo.attributes.normal = quad.attributes.normal;
  const seed = new Float32Array(count * 4);
  const rnd = world.rand;
  for (let i = 0; i < count * 4; i++) seed[i] = rnd();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = count;
  const map = world.tex(glowTexture({ inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)', hard: spec.map === 'hard' ? 0.55 : 0.05, size: 64 }));
  const uniforms = {
    uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...(spec.box ?? [70, 40, 70])) }, uVel: { value: new THREE.Vector3(...(spec.velocity ?? [0.3, -2.2, 0.1])) },
    uTime: world.timeUniform, uSize: { value: new THREE.Vector2(...(spec.size ?? [0.12, 0.12])) }, uSway: { value: spec.sway ?? 0.6 }, uStretch: { value: spec.stretch ?? 0 },
    uTwinkle: { value: spec.twinkle ?? 0 }, uFadeNear: { value: spec.fadeNear ?? 1.5 }, uMap: { value: map }, uColor: { value: toColor(spec.color ?? '#ffffff') }, uOpacity: { value: spec.opacity ?? 0.9 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = `ambient:${spec.name ?? 'particles'}`;
  world.group.add(mesh);
  return {
    mesh,
    update(dt, t, cam) { uniforms.uCam.value.copy(cam); },
    onQuality(q) { geo.instanceCount = Math.max(0, Math.round(count * Math.min(1, (q.particles ?? 1) * (spec.qualityScale ?? 1)))); mesh.visible = (q.particles ?? 1) > 0.05; },
    uniforms,
  };
}
