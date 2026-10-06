// Snow-world props: snowman, igloo, ice crystals, snow-capped rocks, drifts, chalet lodge, lamp posts, ski-lift gear.   OWNER: Agent B.
import * as THREE from 'three';
import { blob, cyl, cone, box, sphere, merge, jitter, paint, xf, lathe } from '../geo.js';
import { GeoBuilder } from '../builder.js';
import { toColor } from '../geo.js';
import { mulberry32 } from '../../core/math.js';

/** Snowman ~2 m: three balls, carrot nose, stick arms, scarf and a top hat. */
export function snowman({ scarf = '#e5413a', hat = '#22262f', seed = 1 } = {}) {
  const parts = [
    blob(0.78, 1, '#e6eefc', '#ffffff', { pos: [0, 0.7, 0], squash: 0.95, jit: 0.04, seed }),
    blob(0.56, 1, '#e6eefc', '#ffffff', { pos: [0, 1.62, 0], jit: 0.04, seed: seed + 1 }),
    blob(0.4, 1, '#eaf1ff', '#ffffff', { pos: [0, 2.28, 0], jit: 0.03, seed: seed + 2 }),
    cone(0.07, 0.42, 5, '#ff8a2a', '#ff5a1a', { pos: [0, 2.28, 0.34], rot: [Math.PI / 2, 0, 0] }),
    cyl(0.44, 0.44, 0.1, 10, scarf, scarf, { pos: [0, 1.98, 0] }),
    box(0.16, 0.5, 0.1, scarf, scarf, { pos: [0.18, 1.42, 0.5], rot: [0.2, 0, 0.1] }),
    cyl(0.46, 0.46, 0.08, 10, hat, hat, { pos: [0, 2.6, 0] }),
    cyl(0.27, 0.27, 0.34, 10, hat, hat, { pos: [0, 2.62, 0] }),
    cyl(0.28, 0.28, 0.07, 10, '#ff5f8f', '#ff5f8f', { pos: [0, 2.66, 0] }),
  ];
  for (const s of [-1, 1]) parts.push(cyl(0.03, 0.03, 1.0, 4, '#5a3a22', '#7a5230', { pos: [s * 0.45, 1.7, 0], rot: [0, 0, -s * 1.1] }));
  for (const [x, y] of [[-0.14, 2.38], [0.14, 2.38]]) parts.push(blob(0.05, 0, '#111', '#111', { pos: [x, y, 0.36] }));
  for (let i = 0; i < 4; i++) parts.push(blob(0.045, 0, '#222', '#222', { pos: [0, 1.4 + i * 0.22, 0.54 - i * 0.02] }));
  return merge(parts);
}

/** Igloo ~4 m across with an arched entrance and ice-block lines. */
export function igloo({ seed = 1 } = {}) {
  const dome = new THREE.SphereGeometry(2.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = dome.attributes.position;
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), a = Math.atan2(pos.getZ(i), pos.getX(i));
    // horizontal courses of blocks: alternate brightness per course and per block
    const course = Math.floor(y * 3.2), block = Math.floor((a + Math.PI) * (3.2 + course * 0.4) / 1.0);
    const k = 0.88 + 0.12 * (((course * 7 + block * 3) % 5) / 4);
    c.set('#f2f8ff').multiplyScalar(k).lerp(new THREE.Color('#cfe4ff'), 0.2 * (1 - y / 2.1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts = [dome];
  const tunnel = cyl(0.95, 0.95, 1.9, 12, '#eef6ff', '#ffffff', { rot: [Math.PI / 2, 0, 0], pos: [0, 0.0, 1.0] });
  const tp = tunnel.attributes.position;
  parts.push(tunnel);
  parts.push(blob(0.95, 1, '#eef6ff', '#ffffff', { pos: [0, 0.45, 2.0], squash: 0.7, scale: [1, 1, 0.4] }));
  parts.push(blob(0.62, 1, '#1b2740', '#2a3a5c', { pos: [0, 0.4, 2.2], squash: 0.9, scale: [1, 1, 0.3] })); // dark doorway
  return merge(parts);
}

/** Cluster of translucent-looking ice crystals (emissive blue-white). */
export function iceCrystals({ seed = 3 } = {}) {
  const rnd = mulberry32(seed * 17);
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.9 + rnd() * 2.0, r = 0.18 + rnd() * 0.22, a = rnd() * 6.28, d = rnd() * 0.9, tilt = (rnd() - 0.5) * 0.5;
    parts.push(cone(r, h, 5, '#5aa8e8', '#d8f4ff', { pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [tilt, a, tilt] }));
    parts.push(cyl(r, r * 1.05, h * 0.25, 5, '#4a98d8', '#8ac8f0', { pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [tilt, a, tilt] }));
  }
  const g = merge(parts); g.computeVertexNormals();
  return g;
}

/** Boulder with a snow cap. */
export function snowRock({ seed = 4 } = {}) {
  const parts = [blob(1, 1, '#4a5873', '#7a8aa6', { jit: 0.28, seed, squash: 0.8, pos: [0, 0.55, 0] }), blob(0.84, 1, '#f4f8ff', '#ffffff', { jit: 0.22, seed: seed + 1, squash: 0.45, pos: [0, 1.0, 0] })];
  const g = merge(parts); g.computeVertexNormals();
  return g;
}

/** Low snow drift mound (squashed blobs), ~3 m. */
export function snowDrift({ seed = 2 } = {}) {
  const parts = [blob(1.4, 1, '#e4eeff', '#ffffff', { pos: [0, 0.2, 0], squash: 0.35, jit: 0.1, seed }), blob(0.9, 1, '#e4eeff', '#ffffff', { pos: [1.1, 0.1, 0.3], squash: 0.35, jit: 0.1, seed: seed + 1 })];
  return merge(parts);
}

/** Street lamp ~5 m: pole, curved arm, lantern head (emissive via bright vertex colour). */
export function lampPost({ pole = '#2a2f3c', glow = '#ffd9a0' } = {}) {
  const gl = toColor(glow).multiplyScalar(2.6);
  const parts = [cyl(0.09, 0.14, 5.0, 6, pole, pole), cyl(0.07, 0.07, 1.1, 5, pole, pole, { pos: [0.5, 4.95, 0], rot: [0, 0, Math.PI / 2 - 0.1] }), cyl(0.2, 0.28, 0.14, 6, pole, pole, { pos: [1.0, 4.86, 0] }), blob(0.24, 1, gl, gl, { pos: [1.0, 4.68, 0], squash: 1.3 })];
  return merge(parts);
}

/**
 * Alpine chalet lodge ~12 m wide: stone base, timber walls, big snowy roof, chimney, lit windows (emissive vertex colours),
 * porch posts.  Returns a Group {group, smokeAt: Vector3 (chimney top, world-local)}.
 */
export function lodge({ wood = '#8a5a34', stone = '#8d95a5', roof = '#dfe8f8', trim = '#5a3a22', window: win = '#ffc766' } = {}) {
  const B = new GeoBuilder();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const c = (h) => toColor(h);
  const add = (cx, cy, cz, sx, sy, sz, cols) => B.box(cx, cy, cz, X, Y, Z, sx, sy, sz, cols, true);
  add(0, 0, 0, 13, 1.4, 9, { top: c(stone), side: c(stone), bottom: c(stone) });
  add(0, 1.4, 0, 12.2, 4.2, 8.2, { top: c(wood), side: c(wood), bottom: c(wood) });
  // horizontal log lines
  for (let k = 0; k < 6; k++) add(0, 1.55 + k * 0.7, 0, 12.35, 0.1, 8.35, { top: c(trim), side: c(trim), bottom: c(trim) });
  // roof (two big sloped panels + ridge snow), overhanging
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rc = c(roof), rd = c('#c4d2ea');
  B.quad(V(-7.3, 5.4, 5.2), V(7.3, 5.4, 5.2), V(7.3, 8.6, 0), V(-7.3, 8.6, 0), rc);
  B.quad(V(-7.3, 8.6, 0), V(7.3, 8.6, 0), V(7.3, 5.4, -5.2), V(-7.3, 5.4, -5.2), rc);
  B.quad(V(-7.3, 5.4, 5.2), V(-7.3, 8.6, 0), V(-7.3, 8.3, 0), V(-7.3, 5.1, 5.2), rd);
  B.quad(V(7.3, 5.4, -5.2), V(7.3, 8.6, 0), V(7.3, 8.3, 0), V(7.3, 5.1, -5.2), rd);
  // gable ends (timber)
  for (const x of [-6.1, 6.1]) B.tri(V(x, 5.6, -4.1), V(x, 5.6, 4.1), V(x, 8.4, 0), c(wood));
  // chimney
  add(3.8, 6.2, -1.6, 1.3, 3.6, 1.3, { top: c(stone), side: c(stone), bottom: c(stone) });
  add(3.8, 9.7, -1.6, 1.6, 0.25, 1.6, { top: c('#e8eefa'), side: c('#e8eefa'), bottom: c(stone) });
  // door + lit windows (bright vertex colours -> glow with bloom)
  add(0, 1.4, 4.18, 1.6, 2.6, 0.15, { top: c(trim), side: c(trim), bottom: c(trim) });
  const lit = c(win).multiplyScalar(2.2);
  for (const x of [-4, -2.2, 2.2, 4]) add(x, 2.6, 4.18, 1.0, 1.2, 0.12, { top: lit, side: lit, bottom: lit });
  for (const z of [-2, 1.5]) add(6.12, 2.6, z, 0.12, 1.2, 1.0, { top: lit, side: lit, bottom: lit });
  // porch posts + canopy
  for (const x of [-2.2, 2.2]) add(x, 0.0, 6.0, 0.3, 3.4, 0.3, { top: c(trim), side: c(trim), bottom: c(trim) });
  B.quad(V(-3.2, 3.5, 6.6), V(3.2, 3.5, 6.6), V(3.2, 4.0, 4.1), V(-3.2, 4.0, 4.1), rc);
  const mesh = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, smokeAt: new THREE.Vector3(3.8, 10.0, -1.6) };
}

/** Ski-lift pylon ~11 m with a cross-arm. */
export function liftPylon({ steel = '#6a7690' } = {}) {
  return merge([cyl(0.18, 0.28, 11, 6, steel, steel), box(4.2, 0.28, 0.34, steel, steel, { pos: [0, 10.4, 0] }), cyl(0.12, 0.12, 0.7, 5, '#c0c8d8', '#c0c8d8', { pos: [-2.0, 10.1, 0] }), cyl(0.12, 0.12, 0.7, 5, '#c0c8d8', '#c0c8d8', { pos: [2.0, 10.1, 0] })]);
}

/** Gondola cabin hanging from a cable ~2.4 m (cable grip at the top, y=0 at the cable). */
export function gondola({ color = '#e5413a' } = {}) {
  const lit = toColor('#ffe3a0').multiplyScalar(1.8);
  return merge([cyl(0.04, 0.04, 1.0, 4, '#444', '#444', { pos: [0, -1.0, 0] }), box(1.5, 1.2, 1.1, color, color, { pos: [0, -2.4, 0] }), box(1.52, 0.5, 1.12, lit, lit, { pos: [0, -2.05, 0] }), box(1.7, 0.12, 1.3, '#f4f6fb', '#f4f6fb', { pos: [0, -1.16, 0] })]);
}
