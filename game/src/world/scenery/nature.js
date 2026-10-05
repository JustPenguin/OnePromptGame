// Nature prop geometries: stylised low-poly trees, bushes, rocks, flowers.  OWNER: Agent B.
// Each builder returns ONE merged vertex-coloured BufferGeometry (units: metres, base at y=0, ~real size at scale 1) meant for
// an InstancedMesh with a MeshLambertMaterial({ vertexColors: true }).  Per-instance tints (instanceColor) multiply the colours,
// so keep baked colours in a neutral-to-bright range and let instances shift hue/brightness.
import * as THREE from 'three';
import { blob, cyl, cone, merge, shadeBottom, xf, paint, box } from '../geo.js';

/** Lollipop broadleaf tree ~6 m.  detail: icosphere subdivision of the foliage (0 = very chunky, 1 = round). */
export function roundTree({ detail = 1, trunk = ['#7a4c2a', '#5b3820'], leaf = ['#2c8a3a', '#8bd84f'], size = 1, seed = 1, blobs = 4 } = {}) {
  const parts = [];
  parts.push(cyl(0.22 * size, 0.38 * size, 2.7 * size, 6, trunk[0], trunk[1], { rot: [0, 0, 0] }));
  parts[0].attributes.color.needsUpdate = true;
  // trunk colours: darker at the base (paint(a=top?) -> cyl paints bottom colour = color, top = color2); swap so base is dark
  const layout = [
    [0, 4.15, 0, 2.05], [1.0, 3.55, 0.25, 1.5], [-0.95, 3.5, -0.3, 1.55], [0.1, 5.15, -0.1, 1.35], [0.2, 3.7, -1.05, 1.3], [-0.2, 3.6, 1.0, 1.25],
  ].slice(0, blobs);
  layout.forEach(([x, y, z, r], i) => {
    parts.push(blob(r * size, detail, leaf[0], leaf[1], { jit: 0.16, seed: seed * 7 + i, pos: [x * size, y * size, z * size], squash: 0.92 }));
  });
  const g = merge(parts);
  return g;
}

/** Tall oval tree (poplar / cypress-ish) ~8 m. */
export function ovalTree({ detail = 1, leaf = ['#2a7d3e', '#7fcf55'], trunk = ['#6e4528', '#523219'], seed = 3 } = {}) {
  const parts = [cyl(0.18, 0.3, 2.0, 6, trunk[0], trunk[1])];
  [[0, 3.6, 0, 1.35, 1.7], [0, 5.3, 0, 1.15, 1.5], [0, 6.8, 0, 0.8, 1.1]].forEach(([x, y, z, r, sq], i) => {
    parts.push(blob(r, detail, leaf[0], leaf[1], { jit: 0.12, seed: seed + i, pos: [x, y, z], squash: sq }));
  });
  return merge(parts);
}

/** Snow-free conifer ~7 m: stacked cones. */
export function pineTree({ tiers = 4, leaf = ['#1f6b3a', '#4fae5a'], trunk = ['#5b3a22', '#3f2816'], snow = null, size = 1 } = {}) {
  const parts = [cyl(0.2 * size, 0.34 * size, 1.6 * size, 6, trunk[0], trunk[1])];
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1 || 1);
    const r = (2.1 - t * 1.25) * size, h = (2.3 - t * 0.5) * size, y = (1.1 + i * 1.35) * size;
    parts.push(cone(r, h, 8, leaf[0], leaf[1], { pos: [0, y, 0], rot: [0, i * 0.6, 0] }));
    if (snow) parts.push(cone(r * 0.82, h * 0.62, 8, snow, snow, { pos: [0, y + h * 0.4, 0], rot: [0, i * 0.6, 0] }));
  }
  return merge(parts);
}

/** Low bush: 2-3 overlapping blobs ~1.1 m. */
export function bush({ detail = 1, leaf = ['#2f8c3c', '#7fd04c'], seed = 5, berry = null } = {}) {
  const parts = [
    blob(0.8, detail, leaf[0], leaf[1], { jit: 0.2, seed, pos: [0, 0.55, 0], squash: 0.78 }),
    blob(0.6, detail, leaf[0], leaf[1], { jit: 0.2, seed: seed + 1, pos: [0.65, 0.42, 0.15], squash: 0.8 }),
    blob(0.55, detail, leaf[0], leaf[1], { jit: 0.2, seed: seed + 2, pos: [-0.55, 0.4, -0.2], squash: 0.8 }),
  ];
  if (berry) for (let i = 0; i < 7; i++) { const a = i * 2.4; parts.push(blob(0.1, 0, berry, berry, { pos: [Math.cos(a) * 0.7, 0.55 + Math.sin(a * 1.7) * 0.25, Math.sin(a) * 0.7] })); }
  const g = merge(parts);
  return g;
}

/** Chunky boulder ~1.5 m. flat = faceted look (non-indexed normals recomputed). */
export function rock({ detail = 1, color = ['#7d8087', '#b5b8be'], seed = 9, flat = true, squash = 0.8, jit = 0.28 } = {}) {
  const g0 = blob(1, detail, color[0], color[1], { jit, seed, squash, pos: [0, 0.55, 0] });
  const g = merge([g0]);
  if (flat) g.computeVertexNormals(); // non-indexed => faceted
  return g;
}

/** Flat-topped stack of small stones for borders. */
export function pebbles({ color = ['#8a8d94', '#c4c6cc'], seed = 2 } = {}) {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(blob(0.34 + (i % 2) * 0.12, 0, color[0], color[1], { jit: 0.3, seed: seed + i, squash: 0.65, pos: [Math.cos(i * 2.1) * 0.55, 0.15, Math.sin(i * 2.1) * 0.55] }));
  const g = merge(parts); g.computeVertexNormals(); return g;
}

/** A tuft of N small flowers on stems with a given head colour (~0.5 m tall).  Baked colours, no instance tint needed. */
export function flowerTuft({ head = '#ff5fa2', center = '#ffd23f', n = 4, seed = 1, height = 0.55 } = {}) {
  const parts = [];
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = 0.12 + rnd() * 0.32, h = height * (0.7 + rnd() * 0.5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push(cyl(0.012, 0.016, h, 3, '#3a8a2c', '#5bb84a', { pos: [x, 0, z] }));
    // flat petal disc + bright centre
    parts.push(cyl(0.11, 0.09, 0.03, 6, head, head, { pos: [x, h, z], rot: [(rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5] }));
    parts.push(cyl(0.045, 0.045, 0.045, 5, center, center, { pos: [x, h + 0.015, z] }));
    // a leaf
    parts.push(blob(0.07, 0, '#3f9a33', '#69c24f', { pos: [x * 0.6, h * 0.3, z * 0.6], squash: 0.35, jit: 0.2, seed: i + seed }));
  }
  return merge(parts);
}

/** Grass tuft: crossed blades, ~0.35 m. */
export function grassTuft({ color = ['#3b8f2c', '#9fe05a'], blades = 5, seed = 1 } = {}) {
  const parts = [];
  let s = seed * 7919 + 13;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < blades; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.12, h = 0.22 + rnd() * 0.3, lean = (rnd() - 0.2) * 0.5;
    parts.push(cone(0.035, h, 3, color[0], color[1], { pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [lean * Math.sin(a), 0, lean * Math.cos(a)], scale: [1, 1, 0.3] }));
  }
  return merge(parts);
}

/** Sunflower ~2.2 m with a big face. */
export function sunflower({ petal = '#ffcf23', seed = 4 } = {}) {
  const parts = [cyl(0.05, 0.075, 1.9, 5, '#3a8c2e', '#62b947')];
  parts.push(blob(0.22, 0, '#3f9a33', '#69c24f', { pos: [0.22, 0.8, 0], squash: 0.3, jit: 0.2, seed }));
  parts.push(blob(0.22, 0, '#3f9a33', '#69c24f', { pos: [-0.2, 1.2, 0.05], squash: 0.3, jit: 0.2, seed: seed + 1 }));
  // head tilts forward (+Z) a bit
  const face = [];
  face.push(cyl(0.62, 0.55, 0.07, 12, petal, '#ffe46a', { pos: [0, 0, 0] }));
  face.push(cyl(0.36, 0.36, 0.13, 10, '#5a3418', '#7a4a22', { pos: [0, 0.02, 0] }));
  const fm = merge(face);
  xf(fm, { pos: [0, 2.05, 0.08], rot: [1.15, 0, 0] });
  parts.push(fm);
  return merge(parts);
}

/** Round haybale ~1.4 m (lying cylinder). */
export function hayBale({ color = ['#d9b24a', '#f2d36b'] } = {}) {
  const g = cyl(0.7, 0.7, 1.15, 12, color[0], color[1], { rot: [0, 0, Math.PI / 2], pos: [0.575, 0.7, 0] });
  const ring = cyl(0.72, 0.72, 0.1, 12, '#b88f35', '#b88f35', { rot: [0, 0, Math.PI / 2], pos: [0.2, 0.7, 0] });
  const ring2 = cyl(0.72, 0.72, 0.1, 12, '#b88f35', '#b88f35', { rot: [0, 0, Math.PI / 2], pos: [0.95, 0.7, 0] });
  return merge([g, ring, ring2]);
}

export function lambert(extra = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
}
