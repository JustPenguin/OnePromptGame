// Surface-zone decals: ice patches, mud, sand drifts and water fords drawn ON the road where the physics zone is.   OWNER: Agent B.
// The visuals come straight from track.zones (type ice | mud | sand | water | snow) so what looks slippery IS slippery.
import * as THREE from 'three';
import { makeRows, ribbon } from './ribbon.js';
import { toColor } from './geo.js';
import { shaderMaterial } from './features.js';
import { groundTexture } from './textures.js';
import { GLSL_NOISE } from './sky.js';

const ICE_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const ICE_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uTint; uniform vec3 uSky; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec2 uLen;
  varying vec2 vUv; varying vec3 vWorld;
  ${GLSL_NOISE}
  #include <fog_pars_fragment>
  void main() {
    // soft ends / sides so the patch fades into the asphalt
    float edge = smoothstep( 0.0, 0.07, vUv.x ) * smoothstep( 1.0, 0.93, vUv.x ) * smoothstep( 0.0, 0.14, vUv.y ) * smoothstep( 1.0, 0.86, vUv.y );
    vec2 p = vWorld.xz;
    float n = fbm( p * 0.35 );
    float cracks = 1.0 - smoothstep( 0.0, 0.05, abs( vnoise( p * 1.7 + n * 2.0 ) - 0.5 ) );
    float cracks2 = 1.0 - smoothstep( 0.0, 0.035, abs( vnoise( p * 4.3 - 3.0 ) - 0.5 ) );
    vec3 V = normalize( cameraPosition - vWorld );
    float fres = pow( 1.0 - max( V.y, 0.0 ), 3.0 );
    vec3 N = normalize( vec3( ( vnoise( p * 2.1 ) - 0.5 ) * 0.25, 1.0, ( vnoise( p * 2.1 + 9.0 ) - 0.5 ) * 0.25 ) );
    vec3 H = normalize( uSunDir + V );
    float spec = pow( max( dot( N, H ), 0.0 ), 90.0 );
    float sparkle = step( 0.985, vnoise( p * 9.0 + floor( uTime * 3.0 ) ) ) * 0.9;
    vec3 col = mix( uTint, uSky, 0.18 + fres * 0.7 );
    col += vec3( 0.55, 0.75, 1.0 ) * ( cracks * 0.5 + cracks2 * 0.3 );
    col += uSunColor * ( spec * 1.4 + sparkle * 0.8 );
    gl_FragColor = vec4( col, edge * ( 0.78 + 0.2 * fres ) );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** style = { ice:{ tint:'#9fd8ff', sky:'#cfe8ff' }, mud:{...}, sand:{...} } */
export function buildSurfaceZones(world, style = {}) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'surface-zones';
  const sky = world.cfg.sky ?? {};
  for (const z of tr.zones) {
    if (!['ice', 'mud', 'sand'].includes(z.type)) continue;
    const len = z.s1 - z.s0;
    const rows = makeRows(tr, z.s0, z.s1, 1.0);
    const st = style[z.type] ?? {};
    let mat;
    if (z.type === 'ice') {
      mat = shaderMaterial({
        uniforms: { uTime: world.timeUniform, uTint: { value: toColor(st.tint ?? '#7fc4f0') }, uSky: { value: toColor(st.sky ?? sky.horizon ?? '#d8ecff') }, uSunDir: { value: world.sunDir }, uSunColor: { value: toColor(sky.sun?.color ?? '#fff4e0') }, uLen: { value: new THREE.Vector2(len, z.width) } },
        vertex: ICE_VERT, fragment: ICE_FRAG, transparent: true, depthWrite: false, polygonOffset: true,
      });
    } else if (z.type === 'mud') {
      mat = new THREE.MeshStandardMaterial({ map: world.tex(groundTexture('dirt', { base: '#4a3220', dark: '#2a1a10', light: '#6a4a2c' })), roughness: 0.35, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
    } else {
      mat = new THREE.MeshLambertMaterial({ map: world.tex(groundTexture('sand')), transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
    }
    const g = ribbon(rows, { l0: z.l0, l1: z.l1, lift: 0.06, vScale: len, vOffset: -z.s0 / len, uMode: z.type === 'ice' ? 'norm' : 'metres', uScale: 10, segs: 1 });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2; m.matrixAutoUpdate = false; m.name = `zone:${z.type}`;
    if (z.type !== 'ice') m.receiveShadow = true;
    group.add(m);
  }
  return group.children.length ? group : null;
}
