// Birds: seagulls, vultures, bats - flocks circling a point, ONE instanced draw call, all motion + wing flapping in the vertex shader.
// OWNER: Agent B.  Cosmetic only (no collision, nothing per frame on the CPU).
import * as THREE from 'three';
import { toColor } from './geo.js';

const VERT = /* glsl */ `
  attribute vec4 aFlight;       // x = phase, y = radius factor, z = speed factor, w = height jitter
  uniform float uTime; uniform vec3 uCenter; uniform float uRadius; uniform float uSpeed; uniform float uHeight; uniform float uFlap; uniform float uSize; uniform float uBob;
  varying vec3 vCol; varying float vShade;
  attribute vec3 color;
  void main() {
    float spd = uSpeed * ( 0.75 + 0.5 * aFlight.z ) / max( 0.35, aFlight.y );
    float a = uTime * spd + aFlight.x * 6.2831;
    float r = uRadius * ( 0.55 + 0.6 * aFlight.y );
    vec3 c = uCenter + vec3( cos( a ) * r, uHeight * ( 0.85 + 0.3 * aFlight.w ) + sin( a * 2.0 + aFlight.x * 9.0 ) * uBob, sin( a ) * r );
    vec3 fwd = normalize( vec3( -sin( a ), 0.0, cos( a ) ) );         // tangent of the circle (direction of travel)
    vec3 right = normalize( vec3( -fwd.z, 0.0, fwd.x ) );
    vec3 p = position * uSize;
    float flap = sin( uTime * uFlap * ( 0.8 + 0.4 * aFlight.z ) + aFlight.x * 12.0 );
    float wing = abs( p.x );
    p.y += flap * wing * 0.55;                                         // wings beat up/down, tips move most
    p.z += abs( flap ) * wing * 0.12;
    float bank = -0.35;                                                 // lean into the turn
    float cb = cos( bank ), sb = sin( bank );
    vec3 q = vec3( p.x * cb - p.y * sb, p.x * sb + p.y * cb, p.z );
    vec3 world = c + right * q.x + vec3( 0.0, 1.0, 0.0 ) * q.y + fwd * q.z;
    gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
    vCol = color; vShade = 0.75 + 0.25 * flap;
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vCol; varying float vShade;
  void main() {
    gl_FragColor = vec4( vCol * vShade, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Bird silhouette: body + two wings (a shallow V), nose toward +Z, wing span ~1 unit. */
function birdGeometry(body, wing, tip) {
  const pos = [], col = [];
  const tri = (a, b, c, cc) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(cc.r, cc.g, cc.b); };
  const cb = toColor(body), cw = toColor(wing), ct = toColor(tip);
  // body (a small diamond), wings (two swept triangles each), double-sided via 2 windings
  const ds = (a, b, c, cc) => { tri(a, b, c, cc); tri(a, c, b, cc); };
  ds([0, 0, 0.32], [0.07, 0.02, -0.12], [-0.07, 0.02, -0.12], cb);
  ds([0, 0.0, 0.32], [0, 0.07, -0.05], [0.0, 0.0, -0.18], cb);
  for (const s of [-1, 1]) {
    ds([0.04 * s, 0, 0.12], [0.5 * s, 0, -0.08], [0.04 * s, 0, -0.14], cw);
    ds([0.5 * s, 0, -0.08], [0.9 * s, 0, -0.22], [0.2 * s, 0, -0.14], ct);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * o = { count: 8, center:[x,y,z] (circle centre at ground level), radius: 60, height: 40 (above centre y), speed: 0.22 rad/s, size: 1.6 (m, wingspan = size),
 *       flap: 9 (rad/s), bob: 3, body:'#f4f4f0', wing:'#ffffff', tip:'#303844' }
 */
export function createFlock(world, o) {
  const n = o.count ?? 8;
  const base = birdGeometry(o.body ?? '#f2f2ee', o.wing ?? '#ffffff', o.tip ?? '#2a3038');
  const geo = new THREE.InstancedBufferGeometry();
  geo.attributes.position = base.attributes.position; geo.attributes.color = base.attributes.color;
  const fl = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { fl[i * 4] = world.rand(); fl[i * 4 + 1] = world.rand(); fl[i * 4 + 2] = world.rand(); fl[i * 4 + 3] = world.rand(); }
  geo.setAttribute('aFlight', new THREE.InstancedBufferAttribute(fl, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: world.timeUniform, uCenter: { value: new THREE.Vector3(...o.center) }, uRadius: { value: o.radius ?? 60 }, uSpeed: { value: o.speed ?? 0.22 }, uHeight: { value: o.height ?? 40 }, uFlap: { value: o.flap ?? 9 }, uSize: { value: o.size ?? 1.6 }, uBob: { value: o.bob ?? 3 } },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = `flock:${o.name ?? 'birds'}`;
  world.group.add(mesh);
  return { mesh, uniforms: mat.uniforms, onQuality(q) { geo.instanceCount = Math.max(1, Math.round(n * Math.min(1, 0.4 + 0.6 * (q.particles ?? 1)))); } };
}
