// Billboards: camera-facing glow sprites (lamp halos, neon bloom, lanterns, fireflies, stars, lava sparks) in ONE instanced draw call.
// OWNER: Agent B.  Static positions, optional per-instance flicker / pulse computed in the vertex shader from the shared clock.
import * as THREE from 'three';
import { toColor } from './geo.js';
import { glowTexture } from './textures.js';

const VERT = /* glsl */ `
  uniform float uTime; uniform float uFadeFar; uniform float uFlicker; uniform float uAspect;
  attribute vec3 aInfo;            // x = phase, y = flicker amount 0..1, z = size multiplier for pulse
  varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
  void main() {
    vec3 center = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
    float size = length( instanceMatrix[0].xyz );
    vec4 mv = viewMatrix * modelMatrix * vec4( center, 1.0 );
    float dist = -mv.z;
    float ph = aInfo.x;
    float fl = 1.0;
    if ( aInfo.y > 0.0 ) {
      // irregular neon-style flicker: a slow pulse with occasional dropouts
      float a = sin( uTime * ( 3.0 + ph * 5.0 ) + ph * 40.0 ) * 0.5 + 0.5;
      float b = step( 0.93, fract( sin( floor( uTime * 7.0 + ph * 50.0 ) * 12.9898 + ph * 78.233 ) * 43758.5453 ) );
      fl = 1.0 - aInfo.y * ( 0.25 * a + 0.75 * b );
    }
    float pulse = 1.0 + aInfo.z * 0.18 * sin( uTime * 2.0 + ph * 30.0 );
    mv.xy += position.xy * size * pulse * vec2( uAspect, 1.0 );
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vColor = instanceColor * fl;
    vAlpha = 1.0 - smoothstep( uFadeFar * 0.6, uFadeFar, dist );
    vAlpha *= smoothstep( 4.0, 14.0, dist );   // never blot out the screen when a lamp is right beside the camera
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform float uIntensity;
  varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 t = texture2D( uMap, vUv );
    vec3 c = vColor * t.rgb * uIntensity;
    float a = t.a * vAlpha;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( c * a, a );   // premultiplied-style additive
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * items = [{ x, y, z, size (m), color: '#hex'|Color, flicker: 0..1, phase, pulse: 0..1 }]
 * opts  = { name, intensity: 1, fadeFar: 400, texture: { inner, outer, hard } , additive: true, aspect: 1 }
 */
export function createBillboards(world, items, opts = {}) {
  const n = items.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const info = new Float32Array(n * 3);
  const geo = quad.clone();
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 3));
  const map = world.tex(glowTexture({ inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)', hard: 0.02, ...(opts.texture ?? {}), size: 128 }));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: world.timeUniform, uMap: { value: map }, uFadeFar: { value: opts.fadeFar ?? 420 }, uFlicker: { value: 1 }, uIntensity: { value: opts.intensity ?? 1 }, uAspect: { value: opts.aspect ?? 1 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  items.forEach((it, i) => {
    m.makeScale(it.size ?? 1, it.size ?? 1, it.size ?? 1).setPosition(it.x, it.y, it.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, toColor(it.color ?? '#ffffff', c));
    info[i * 3] = it.phase ?? world.rand(); info[i * 3 + 1] = it.flicker ?? 0; info[i * 3 + 2] = it.pulse ?? 0;
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  geo.attributes.aInfo.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.name = `glow:${opts.name ?? 'billboards'}`;
  mesh.matrixAutoUpdate = false;
  world.group.add(mesh);
  return mesh;
}
