// Rainbow edge glow, underglow and glowing ring gates for roads that float in space.   OWNER: Agent B.
//   buildRainbowEdges(world, o)  two solid-bright edge strips + a soft energy field that fades outward (this band is DRIVABLE: pair with
//                                shoulder 0 / shoulderSurface ROAD, KartPhysics lets karts roll up to 2 m past the edge before they fall)
//   buildUnderglow(world, o)     a soft additive carpet under the road so it reads as a floating light-bridge
//   createRingGates(world, o)    instanced torus rings across the road, a colour wave running along the track
import * as THREE from 'three';
import { makeRows, ribbon } from './ribbon.js';
import { toColor } from './geo.js';

const HSV = /* glsl */ `
  vec3 hsv2rgb( vec3 c ) { vec3 p = abs( fract( c.xxx + vec3( 1.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ); return c.z * mix( vec3( 1.0 ), clamp( p - 1.0, 0.0, 1.0 ), c.y ); }
`;

const EDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
`;
const EDGE_FRAG = /* glsl */ `
  uniform float uTime; uniform float uHueScale; uniform float uSpeed; uniform float uStrip; uniform float uGain; uniform float uSat; uniform float uBand;
  varying vec2 vUv;
  ${HSV}
  void main() {
    // u: 0 at the road edge .. 1 at the outer limit of the energy field;  v: metres along the track
    float u = vUv.x;
    float hue = fract( vUv.y * uHueScale - uTime * uSpeed + u * 0.12 );
    vec3 col = hsv2rgb( vec3( hue, uSat, 1.0 ) );
    col = pow( col, vec3( 1.4 ) );                       // deeper, more saturated colours (the strip is very bright: keep it from clipping to white)
    float strip = 1.0 - smoothstep( uStrip * 0.7, uStrip, u );
    float field = pow( 1.0 - u, 2.2 ) * 0.5;
    float pulse = 0.85 + 0.15 * sin( vUv.y * 0.35 - uTime * 4.0 );
    float a = max( strip, field ) * uBand;
    if ( a < 0.01 ) discard;
    gl_FragColor = vec4( col * ( strip * 1.05 + field * 0.8 ) * pulse * uGain, a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** o = { width: 2.2 (energy band beyond the edge), strip: 0.28 (solid fraction), hueScale: 0.012 (hue cycles per metre), speed: 0.18, gain: 1, sat: 0.7, inner: 0.15 (overlap onto the road) } */
export function buildRainbowEdges(world, o = {}) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'rainbow-edges';
  const width = o.width ?? 2.2, inner = o.inner ?? 0.15;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: world.timeUniform, uHueScale: { value: o.hueScale ?? 0.012 }, uSpeed: { value: o.speed ?? 0.18 }, uStrip: { value: o.strip ?? 0.28 }, uGain: { value: o.gain ?? 1 }, uSat: { value: o.sat ?? 0.7 }, uBand: { value: 1 } },
    vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const runs = world._roadRuns();
  for (const run of runs) {
    const rows = makeRows(tr, run.s0, run.s1, tr.spacing);
    for (const side of [-1, 1]) {
      const g = ribbon(rows, {
        l0: side < 0 ? (r) => -r.hw - width : (r) => r.hw - inner, l1: side < 0 ? (r) => -r.hw + inner : (r) => r.hw + width,
        lift: 0.06, vScale: 1, uMode: 'norm', segs: 6, flip: side < 0,
      });
      // u must run 0 (at the road edge) -> 1 (outer): mirror it on the left side
      if (side < 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); uv.needsUpdate = true; }
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 4; m.matrixAutoUpdate = false; m.frustumCulled = false;
      group.add(m);
    }
  }
  return group;
}

const UNDER_FRAG = /* glsl */ `
  uniform float uTime; uniform float uHueScale; uniform float uGain;
  varying vec2 vUv;
  ${HSV}
  void main() {
    float across = abs( vUv.x - 0.5 ) * 2.0;
    float hue = fract( vUv.y * uHueScale + 0.5 - uTime * 0.05 );
    vec3 col = hsv2rgb( vec3( hue, 0.55, 1.0 ) );
    float a = pow( 1.0 - across, 1.6 ) * 0.5;
    if ( a < 0.01 ) discard;
    gl_FragColor = vec4( col * a * uGain, a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Soft additive carpet below the deck: o = { depth: 1.4, spread: 1.7 (x road width), hueScale: 0.004, gain: 1 } */
export function buildUnderglow(world, o = {}) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'underglow';
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: world.timeUniform, uHueScale: { value: o.hueScale ?? 0.004 }, uGain: { value: o.gain ?? 1 } },
    vertexShader: EDGE_VERT, fragmentShader: UNDER_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  for (const run of world._roadRuns()) {
    const rows = makeRows(tr, run.s0, run.s1, tr.spacing * 2);
    const sp = o.spread ?? 1.7;
    const g = ribbon(rows, { l0: (r) => -r.hw * sp, l1: (r) => r.hw * sp, lift: -(o.depth ?? 1.4), vScale: 1, segs: 4 });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2; m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

// ------------------------------------------------------------------------------------------------------------------
const RING_VERT = /* glsl */ `
  uniform float uTime; uniform float uWave; uniform float uHueScale; uniform float uSpeed;
  varying vec3 vCol; varying float vA;
  ${HSV}
  void main() {
    vec3 pivot = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
    float s = instanceColor.r;                                  // arc length along the track (packed per instance)
    float wave = 0.5 + 0.5 * sin( s * uWave - uTime * 3.2 );     // brightness wave travelling along the lap
    float hue = fract( s * uHueScale - uTime * uSpeed );
    vCol = pow( hsv2rgb( vec3( hue, 0.85, 1.0 ) ), vec3( 1.3 ) ) * ( 0.45 + 1.0 * wave );
    vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
    vec4 mv = viewMatrix * wp;
    vA = smoothstep( 4.0, 16.0, -mv.z );                        // fade out right before the camera passes through
    gl_Position = projectionMatrix * mv;
  }
`;
const RING_FRAG = /* glsl */ `
  varying vec3 vCol; varying float vA;
  void main() {
    gl_FragColor = vec4( vCol * vA, vA );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Giant glowing rings the road passes through (purely cosmetic).
 * o = { ranges: [[s0,s1]], every: 60 (m), radius: 15, tube: 0.45, lift: 7 (ring centre above the road), hueScale, speed, wave }
 */
export function createRingGates(world, o = {}) {
  const tr = world.track;
  const items = [];
  for (const [a, b] of o.ranges ?? [[0, tr.length]]) for (let s = a; s < b; s += o.every ?? 60) items.push(s);
  if (!items.length) return null;
  const geo = new THREE.TorusGeometry(o.radius ?? 15, o.tube ?? 0.45, 8, 56);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: world.timeUniform, uWave: { value: o.wave ?? 0.045 }, uHueScale: { value: o.hueScale ?? 0.006 }, uSpeed: { value: o.speed ?? 0.12 } },
    vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), basis = new THREE.Matrix4(), col = new THREE.Color();
  items.forEach((s, i) => {
    const smp = tr.sampleAt(s);
    // torus lies in the XY plane (axis +Z): orient so its axis follows the track tangent and its "up" follows the road's up vector
    basis.makeBasis(new THREE.Vector3().copy(smp.right).negate(), smp.up, smp.tangent);
    q.setFromRotationMatrix(basis);
    pos.copy(smp.position).addScaledVector(smp.up, o.lift ?? 7);
    m.compose(pos, q, sc);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setRGB(s, 0, 0));
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.matrixAutoUpdate = false;
  mesh.name = 'ring-gates';
  world.group.add(mesh);
  return mesh;
}
