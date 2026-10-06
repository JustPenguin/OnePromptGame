// Space props: asteroids, glowing crystal rocks, the Starlight Core, mini planets, orbit rings.   OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from '../builder.js';
import { toColor, merge, blob, cone, cyl, jitter } from '../geo.js';
import { shaderMaterial } from '../features.js';
import { mulberry32 } from '../../core/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Faceted asteroid ~2 m radius at scale 1: dark violet-grey with a lighter top (lit by the star), flat normals. */
export function asteroid({ seed = 1, color = ['#2c2640', '#6a6288'], squash = 0.75, jit = 0.38 } = {}) {
  const g = merge([blob(1, 1, color[0], color[1], { jit, seed, squash, pos: [0, 0, 0] })]);
  g.computeVertexNormals();
  return g;
}

/** A rock with glowing crystals growing out of it (bright vertex colours -> bloom).  ~3 m. */
export function crystalRock({ seed = 1, colors = ['#22d3ff', '#ff3dcb', '#ffd23f', '#7be04a'], rock = ['#2c2640', '#5a5278'] } = {}) {
  const rnd = mulberry32(seed * 91 + 5);
  const parts = [blob(1.2, 1, rock[0], rock[1], { jit: 0.32, seed, squash: 0.7 })];
  const hot = toColor(colors[seed % colors.length]);
  const n = 5 + ((rnd() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, up = 0.35 + rnd() * 0.65, h = 1.4 + rnd() * 2.8, r = 0.2 + rnd() * 0.28;
    const dir = V(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize();
    // crystal: hexagonal prism + pointed tip, aligned along dir
    const body = cyl(r, r * 1.05, h * 0.72, 6, hot.clone().multiplyScalar(0.8), hot.clone().multiplyScalar(2.2));
    const tip = cone(r, h * 0.38, 6, hot.clone().multiplyScalar(2.2), hot.clone().multiplyScalar(3.2), { pos: [0, h * 0.72, 0] });
    const m = merge([body, tip]);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
    m.applyMatrix4(new THREE.Matrix4().compose(dir.clone().multiplyScalar(0.4), q, V(1, 1, 1)));
    parts.push(m);
  }
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}

/** Banded mini-planet (vertex colours) with optional ring.  Returns a Group { planet, ring }.  Radius in metres. */
export function miniPlanet({ radius = 40, colors = ['#7a5ad8', '#ffb36a', '#c8a0ff'], bands = 9, ring = null, seed = 1 } = {}) {
  const g = new THREE.SphereGeometry(radius, 36, 24);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const c = colors.map((h) => toColor(h)), tmp = new THREE.Color();
  const rnd = mulberry32(seed * 17 + 3);
  const ph = rnd() * 6;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius, x = pos.getX(i) / radius, z = pos.getZ(i) / radius;
    const swirl = Math.sin(x * 4 + z * 3 + ph) * 0.18 + Math.sin(z * 7 - x * 2) * 0.08;
    const t = 0.5 + 0.5 * Math.sin((y + swirl) * bands);
    tmp.copy(c[0]).lerp(c[1], t).lerp(c[2], Math.max(0, Math.sin((y + swirl * 2) * bands * 0.37)) * 0.4);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const group = new THREE.Group();
  const planet = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#1a0e3a') }));
  group.add(planet);
  if (ring) {
    const rg = new THREE.RingGeometry(radius * (ring.inner ?? 1.35), radius * (ring.outer ?? 2.1), 80, 4);
    const rp = rg.attributes.position, rc = new Float32Array(rp.count * 3), base = toColor(ring.color ?? '#e8d8b8');
    for (let i = 0; i < rp.count; i++) { const r = Math.hypot(rp.getX(i), rp.getY(i)) / radius; const b = 0.55 + 0.45 * Math.sin(r * 38) * Math.sin(r * 11); tmp.copy(base).multiplyScalar(0.6 + 0.8 * b); rc[i * 3] = tmp.r; rc[i * 3 + 1] = tmp.g; rc[i * 3 + 2] = tmp.b; }
    rg.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    rg.rotateX(-Math.PI / 2);
    const rm = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    rm.rotation.z = ring.tilt ?? 0.4;
    group.add(rm);
    group.userData.ring = rm;
  }
  group.userData.planet = planet;
  return group;
}

// ------------------------------------------------------------------------------------------------------------------
const CORE_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
  void main() {
    vN = normalize( mat3( modelMatrix ) * normal );
    vLocal = position;
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vP = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CORE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vN; varying vec3 vP; varying vec3 vLocal;
  vec3 hsv2rgb( vec3 c ) { vec3 p = abs( fract( c.xxx + vec3( 1.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ); return c.z * mix( vec3( 1.0 ), clamp( p - 1.0, 0.0, 1.0 ), c.y ); }
  void main() {
    vec3 N = normalize( vN );
    vec3 V = normalize( cameraPosition - vP );
    float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.2 );
    float hue = fract( 0.78 + 0.18 * sin( uTime * 0.4 + vLocal.y * 0.08 ) + 0.12 * N.x + uTime * 0.03 );
    vec3 col = hsv2rgb( vec3( hue, 0.8, 1.0 ) ) * ( 0.75 + 1.1 * fres );
    col += vec3( 1.0, 0.9, 1.0 ) * pow( max( dot( N, normalize( vec3( 0.4, 0.8, 0.3 ) ) ), 0.0 ), 8.0 ) * 0.7;
    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * The Starlight Core: a faceted rainbow crystal with a halo and orbit rings.  Returns { group, update(dt, t) }.
 * o = { radius: 20, position: Vector3 }
 */
export function starCore(world, o = {}) {
  const R = o.radius ?? 20;
  const group = new THREE.Group();
  group.name = 'starlight-core';
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: world.timeUniform }, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, fog: false });
  const geo = new THREE.IcosahedronGeometry(R, 1);
  geo.computeVertexNormals();
  const core = new THREE.Mesh(geo, mat);
  core.frustumCulled = false;
  group.add(core);
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.55, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 2.4), fog: false }));
  group.add(inner);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const tor = new THREE.Mesh(new THREE.TorusGeometry(R * (1.7 + i * 0.55), 0.35 + i * 0.1, 6, 90), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.78 + i * 0.1, 0.9, 0.62).multiplyScalar(2.6), fog: false }));
    tor.rotation.set(Math.PI / 2 + (i - 1) * 0.5, i * 0.7, i * 0.4);
    group.add(tor); rings.push(tor);
  }
  group.position.copy(o.position ?? new THREE.Vector3());
  world.group.add(group);
  return {
    group,
    update(dt, t) {
      core.rotation.y = t * 0.18; core.rotation.x = Math.sin(t * 0.13) * 0.2;
      inner.rotation.y = -t * 0.4; inner.rotation.z = t * 0.3;
      rings.forEach((r, i) => { r.rotation.z += dt * (0.12 + i * 0.07) * (i % 2 ? -1 : 1); r.rotation.x += dt * 0.03 * (i + 1); });
    },
  };
}
