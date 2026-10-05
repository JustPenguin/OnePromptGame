// Lava flows: glowing rivers that run down a slope, as ribbons that follow the terrain height.   OWNER: Agent B.
// Same animated crust/glow shader as lava lakes (water.js, LAVA define), applied to a strip with its own UVs.
import * as THREE from 'three';
import { toColor } from './geo.js';
import { shaderMaterial } from './features.js';
import { GLSL_NOISE } from './sky.js';

const VERT = /* glsl */ `
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
const FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uHotA; uniform vec3 uHotB; uniform vec3 uCrust; uniform float uGlow; uniform float uSpeed;
  varying vec2 vUv; varying vec3 vWorld;
  ${GLSL_NOISE}
  #include <fog_pars_fragment>
  void main() {
    // u across (0..1), v along the flow (metres); the pattern slides along v with time
    float across = abs( vUv.x - 0.5 ) * 2.0;
    vec2 q = vec2( vUv.x * 2.2, vUv.y * 0.05 - uTime * uSpeed * 0.05 );
    float n = fbm( q * 3.0 + vec2( fbm( q * 5.0 + 7.0 ), fbm( q * 4.0 - 3.0 ) ) * 1.4 );
    float crust = smoothstep( 0.44, 0.66, n );
    float edge = smoothstep( 1.0, 0.55, across );
    float hotCore = smoothstep( 0.9, 0.0, across );
    vec3 hot = mix( uHotA, uHotB, smoothstep( 0.2, 0.9, ( 1.0 - n ) * 0.9 + hotCore * 0.35 ) );
    vec3 col = mix( hot * ( 1.15 + 0.35 * sin( uTime * 1.6 + n * 8.0 ) ), uCrust * ( 0.5 + n ), crust * ( 0.35 + 0.65 * across ) );
    col += uHotB * pow( max( 0.0, 1.0 - n ), 3.0 ) * 0.6;
    float a = edge * smoothstep( 0.0, 0.08, vUv.x ) * smoothstep( 1.0, 0.92, vUv.x );
    if ( a < 0.02 ) discard;
    gl_FragColor = vec4( col * uGlow, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * Follow steepest descent from (x,z) on world.terrain and build a lava ribbon.
 * o = { x, z, steps: 60, stepLen: 8, width: [4, 12], meander: 0.35, lift: 1.4, wander (seed), hot:'#ff5a1a', hotB:'#ffd23f', crust:'#2a1214', glow: 1.3, speed: 1, stopY }
 * Returns { mesh, points } (points = [[x,y,z]...]).
 */
export function addLavaFlow(world, o) {
  const T = world.terrain;
  const pts = [];
  let x = o.x, z = o.z, dirx = 0, dirz = 0;
  const step = o.stepLen ?? 8, rnd = world.rand;
  const phase = rnd() * 10;
  for (let i = 0; i < (o.steps ?? 60); i++) {
    const h = T.heightAt(x, z);
    pts.push([x, h, z]);
    const e = 3;
    let gx = T.heightAt(x + e, z) - T.heightAt(x - e, z), gz = T.heightAt(x, z + e) - T.heightAt(x, z - e);
    let l = Math.hypot(gx, gz) || 1;
    // descent direction, smoothed with the previous step so the river curves instead of jittering, plus a gentle meander
    let dx = -gx / l, dz = -gz / l;
    const m = (o.meander ?? 0.35) * Math.sin(i * 0.37 + phase);
    const cx = -dz * m, cz = dx * m;
    dx += cx; dz += cz;
    if (i > 0) { dx = dx * 0.5 + dirx * 0.5; dz = dz * 0.5 + dirz * 0.5; }
    l = Math.hypot(dx, dz) || 1; dirx = dx / l; dirz = dz / l;
    x += dirx * step; z += dirz * step;
    if (o.stopY !== undefined && h < o.stopY) break;
    if (o.avoidRoad !== undefined) { const q = world.road.query(x, z); if (q.near && q.dist < q.hw + q.sh + o.avoidRoad) break; }
  }
  const n = pts.length;
  if (n < 3) return null;
  const w0 = o.width?.[0] ?? 4, w1 = o.width?.[1] ?? 12;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  const idx = [];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const wd = (w0 + (w1 - w0) * (i / (n - 1))) * (0.8 + 0.4 * Math.sin(i * 1.7 + phase)) * (i < 3 ? (i + 1) / 4 : 1);
    const lift = o.lift ?? 1.4;
    for (const side of [-1, 1]) {
      const k = (i * 2 + (side + 1) / 2);
      const px = p[0] - tz * side * wd * 0.5, pz = p[2] + tx * side * wd * 0.5;
      pos[k * 3] = px; pos[k * 3 + 1] = T.heightAt(px, pz) + lift; pos[k * 3 + 2] = pz;
      uv[k * 2] = (side + 1) / 2; uv[k * 2 + 1] = along;
    }
    if (i > 0) along += Math.hypot(p[0] - a[0], p[2] - a[2]);
    if (i < n - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = shaderMaterial({
    uniforms: { uTime: world.timeUniform, uHotA: { value: toColor(o.hot ?? '#ff5a1a') }, uHotB: { value: toColor(o.hotB ?? '#ffd23f') }, uCrust: { value: toColor(o.crust ?? '#2a1214') }, uGlow: { value: o.glow ?? 1.3 }, uSpeed: { value: o.speed ?? 1 } },
    vertex: VERT, fragment: FRAG, polygonOffset: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'lava-flow'; mesh.matrixAutoUpdate = false; mesh.renderOrder = 2;
  world.group.add(mesh);
  return { mesh, points: pts };
}
