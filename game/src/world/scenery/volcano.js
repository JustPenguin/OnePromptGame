// Volcano props: basalt columns, lava-lit spires, braziers, charred trees, obsidian shards, bridge lanterns.   OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from '../builder.js';
import { toColor, merge, cyl, cone, blob, jitter } from '../geo.js';
import { mulberry32 } from '../../core/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (h, k = 1) => toColor(h).multiplyScalar(k);

/** Cluster of hexagonal basalt columns (the classic causeway look), varied heights with slightly tilted tops. */
export function basaltColumns({ seed = 1, count = 12, spread = 3.6, maxH = 7.5, color = ['#2a2426', '#4a4044'], rim = '#ff6a1a' } = {}) {
  const rnd = mulberry32(seed * 211 + 7);
  const B = new GeoBuilder();
  const c0 = col(color[0]), c1 = col(color[1]), cr = col(rim);
  const hex = (cx, cz, r, h, top) => {
    const a = (i) => (i / 6) * Math.PI * 2 + 0.52;
    for (let i = 0; i < 6; i++) {
      const p0 = V(cx + Math.cos(a(i)) * r, -0.6, cz + Math.sin(a(i)) * r), p1 = V(cx + Math.cos(a(i + 1)) * r, -0.6, cz + Math.sin(a(i + 1)) * r);
      const t0 = V(p0.x, h + top * Math.cos(a(i)), p0.z), t1 = V(p1.x, h + top * Math.cos(a(i + 1)), p1.z);
      // glowing lava-light on the lower part of each facet (vertex colours: dark top, warm base)
      B.quadC(p0, p1, t1, t0, [cr.clone().multiplyScalar(0.55), cr.clone().multiplyScalar(0.55), c1, c1]);
    }
    const apex = V(cx, h + 0.1, cz);
    for (let i = 0; i < 6; i++) B.tri(apex, V(cx + Math.cos(a(i)) * r, h + top * Math.cos(a(i)), cz + Math.sin(a(i)) * r), V(cx + Math.cos(a(i + 1)) * r, h + top * Math.cos(a(i + 1)), cz + Math.sin(a(i + 1)) * r), c0.clone().lerp(c1, rnd() * 0.5));
  };
  const placed = [];
  for (let n = 0, tries = 0; n < count && tries < 200; tries++) {
    const ang = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread, x = Math.cos(ang) * d, z = Math.sin(ang) * d, r = 0.55 + rnd() * 0.4;
    if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < (p[2] + r) * 1.9)) continue;
    placed.push([x, z, r]);
    const h = maxH * (0.25 + 0.75 * (1 - d / spread) ** 1.2) * (0.6 + 0.6 * rnd());
    hex(x, z, r, h, (rnd() - 0.5) * 0.5);
    n++;
  }
  return B.build();
}

/** Tall jagged rock spire ~14 m: faceted cone with a pinched waist, dark basalt with a hot base glow. */
export function rockSpire({ seed = 1, height = 14, radius = 3.2, color = ['#3a2e30', '#6e5c5e'], glow = '#ff4a1a' } = {}) {
  const g = new THREE.CylinderGeometry(0.05, radius, height, 7, 6, false);
  g.translate(0, height / 2, 0);
  const pos = g.attributes.position, col2 = new Float32Array(pos.count * 3);
  const rnd = mulberry32(seed * 97 + 3);
  const c0 = toColor(color[0]), c1 = toColor(color[1]), cg = toColor(glow);
  const tmp = new THREE.Color();
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), t = y / height;
    const key = `${pos.getX(i).toFixed(3)},${y.toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = map.get(key); if (!j) { j = [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.9]; map.set(key, j); }
    const waist = 1 - 0.35 * Math.sin(t * Math.PI * 1.4);
    pos.setXYZ(i, pos.getX(i) * waist + j[0] * (1 - t) * 1.2, y, pos.getZ(i) * waist + j[2] * (1 - t) * 1.2);
    tmp.copy(c0).lerp(c1, t * 0.55 + rnd() * 0.2).lerp(cg, Math.pow(1 - t, 6.0) * 0.8);
    col2[i * 3] = tmp.r; col2[i * 3 + 1] = tmp.g; col2[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col2, 3));
  const flat = g.toNonIndexed(); g.dispose();
  flat.deleteAttribute('uv');
  flat.computeVertexNormals();
  return flat;
}

/** Faceted lava-lit boulder (rim-lit bottom). */
export function lavaBoulder({ seed = 1 } = {}) {
  const g = blob(1, 1, '#ff5a1a', '#3a3032', { jit: 0.3, seed, squash: 0.7, pos: [0, 0.55, 0] });
  const m = merge([g]); m.computeVertexNormals();
  return m;
}

/** Charred dead tree ~5 m: black trunk with bare forked branches. */
export function charredTree({ seed = 1 } = {}) {
  const rnd = mulberry32(seed * 53 + 9);
  const B = new GeoBuilder();
  const dark = col('#1a1416'), mid = col('#3a2c2c'), ember = col('#ff5a1a', 0.5);
  const lean = (rnd() - 0.5) * 0.5;
  B.tube(V(0, -0.2, 0), V(lean, 3.2, 0), 0.32, 0.12, 6, dark, mid);
  for (let i = 0; i < 6; i++) {
    const a = rnd() * 6.28, y0 = 1.6 + rnd() * 1.8, len = 1.0 + rnd() * 1.4, up = 0.4 + rnd() * 0.8;
    const p0 = V(lean * y0 / 3.2, y0, 0), p1 = V(p0.x + Math.cos(a) * len, y0 + up * len, Math.sin(a) * len);
    B.tube(p0, p1, 0.1, 0.03, 5, mid, i % 3 === 0 ? ember : dark);
    const p2 = V(p1.x + Math.cos(a + 0.7) * len * 0.5, p1.y + up * len * 0.6, p1.z + Math.sin(a + 0.7) * len * 0.5);
    B.tube(p1, p2, 0.05, 0.015, 4, dark, dark);
  }
  return B.build();
}

/** Obsidian shard cluster: glossy black crystals with a purple rim. */
export function obsidianShards({ seed = 1 } = {}) {
  const rnd = mulberry32(seed * 19 + 5);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 1.2 + rnd() * 2.6, r = 0.25 + rnd() * 0.3, a = rnd() * 6.28, d = rnd() * 0.9, t = (rnd() - 0.5) * 0.5;
    parts.push(cone(r, h, 5, '#120c16', '#4a3070', { pos: [Math.cos(a) * d, -0.1, Math.sin(a) * d], rot: [t, a, t] }));
  }
  const g = merge(parts); g.computeVertexNormals();
  return g;
}

/** Brazier / fire bowl on a post ~1.8 m: the flame itself is a plume (additive) added by the recipe at brazierTop(). */
export function brazier({ iron = '#2a2224' } = {}) {
  const B = new GeoBuilder();
  const d = col(iron), m = col('#4a3c3e'), hot = col('#ff7a1a', 2.2);
  B.tube(V(0, 0, 0), V(0, 1.3, 0), 0.13, 0.09, 6, d, m);
  B.tube(V(0, 1.3, 0), V(0, 1.55, 0), 0.4, 0.55, 8, m, d);
  B.tube(V(0, 1.5, 0), V(0, 1.58, 0), 0.5, 0.5, 8, hot, hot, false);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; B.tube(V(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), V(0, 1.0, 0), 0.05, 0.05, 4, d, d); }
  return B.build();
}
export const BRAZIER_FLAME_Y = 1.65;

/** Bridge guard-post: a squat obsidian pillar with a glowing lantern on top (edge marker for the no-wall bridge). */
export function bridgePost({ glow = '#ff7a1a' } = {}) {
  const B = new GeoBuilder();
  const d = col('#1c1618'), m = col('#3a3032'), g = col(glow, 2.6);
  B.tube(V(0, 0, 0), V(0, 1.0, 0), 0.34, 0.26, 6, d, m);
  B.tube(V(0, 1.0, 0), V(0, 1.12, 0), 0.4, 0.4, 6, m, m);
  B.tube(V(0, 1.12, 0), V(0, 1.55, 0), 0.22, 0.22, 6, g, g);
  B.tube(V(0, 1.55, 0), V(0, 1.7, 0), 0.34, 0.1, 6, m, m);
  return B.build();
}
