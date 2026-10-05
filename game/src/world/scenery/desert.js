// Desert / canyon props: cacti, agave, hoodoos, boulders, tumbleweed, dead trees and the sandstone arch.   OWNER: Agent B.
import * as THREE from 'three';
import { blob, cyl, cone, box, sphere, merge, jitter, paint, xf, torus } from '../geo.js';
import { mulberry32 } from '../../core/math.js';

/** Saguaro ~6 m: ribbed trunk with 2 arms, rounded tips, a pink flower crown. */
export function saguaro({ seed = 1, skin = ['#3f8a3e', '#74c55a'], bloom = '#ff7ab0' } = {}) {
  const rnd = mulberry32(seed * 977 + 3);
  const parts = [];
  const H = 5.2 + rnd() * 1.6;
  parts.push(cyl(0.5, 0.62, H, 10, skin[0], skin[1]));
  parts.push(blob(0.5, 1, skin[1], skin[1], { pos: [0, H, 0], squash: 0.9 }));
  const arm = (side, y, len, up) => {
    parts.push(cyl(0.3, 0.34, len, 8, skin[0], skin[1], { pos: [0, y, 0], rot: [0, 0, -side * Math.PI / 2], }));                        // horizontal elbow
    const ox = side * len;
    parts.push(cyl(0.3, 0.33, up, 8, skin[0], skin[1], { pos: [ox, y - 0.15, 0] }));                                                      // upward branch
    parts.push(blob(0.31, 1, skin[1], skin[1], { pos: [ox, y - 0.15 + up, 0], squash: 0.9 }));
    parts.push(blob(0.12, 0, bloom, '#ffd1e6', { pos: [ox, y - 0.15 + up + 0.28, 0], squash: 0.6 }));
  };
  arm(1, H * 0.5, 1.5 + rnd() * 0.6, 1.5 + rnd());
  if (rnd() < 0.85) arm(-1, H * 0.38, 1.3 + rnd() * 0.5, 1.2 + rnd() * 0.8);
  parts.push(blob(0.16, 0, bloom, '#ffd1e6', { pos: [0, H + 0.4, 0], squash: 0.6 }));
  return merge(parts);
}

/** Barrel cactus ~1 m: ribbed squashed sphere with a flower ring. */
export function barrelCactus({ seed = 2 } = {}) {
  const g = new THREE.SphereGeometry(0.55, 10, 7);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); const rib = 1 + 0.07 * Math.cos(a * 10); pos.setX(i, pos.getX(i) * rib); pos.setZ(i, pos.getZ(i) * rib); }
  g.scale(1, 1.2, 1); g.translate(0, 0.62, 0);
  paint(g, '#3c8a4a', '#79c860', 0, 1.3);
  const parts = [g];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(blob(0.1, 0, '#ff5f8f', '#ffd1a0', { pos: [Math.cos(a) * 0.22, 1.28, Math.sin(a) * 0.22], squash: 0.6 })); }
  return merge(parts);
}

/** Prickly pear: stacked flat pads with red fruit. */
export function pricklyPear({ seed = 3 } = {}) {
  const rnd = mulberry32(seed * 31 + 5);
  const parts = [];
  const pad = (x, y, z, s, rz) => parts.push(blob(0.55 * s, 1, '#2f8466', '#69c09a', { pos: [x, y, z], squash: 1, rot: [0, rnd() * 3, rz], scale: [1, 1, 0.22], jit: 0.08, seed: seed + parts.length }));
  pad(0, 0.6, 0, 1, 0);
  pad(0.55, 1.2, 0.05, 0.8, -0.5);
  pad(-0.5, 1.15, -0.05, 0.75, 0.45);
  pad(0.85, 1.75, 0.1, 0.6, -0.9);
  pad(-0.15, 1.7, 0, 0.62, 0.15);
  for (const [x, y, z] of [[0.95, 2.1, 0.12], [-0.2, 2.05, 0.05], [0.5, 1.6, 0.18], [-0.65, 1.5, 0.1]]) parts.push(blob(0.12, 0, '#e8365d', '#ff7a8a', { pos: [x, y, z], squash: 1.2 }));
  return merge(parts);
}

/** Agave rosette ~1.3 m. */
export function agave({ leaf = ['#2e7a63', '#79c9a5'] } = {}) {
  const parts = [];
  for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + ring * 0.4, tilt = 0.35 + ring * 0.45;
    parts.push(cone(0.17, 1.5 - ring * 0.2, 4, leaf[0], leaf[1], { pos: [0, 0.1, 0], rot: [tilt * Math.cos(a), a, tilt * Math.sin(a)], scale: [1, 1, 0.45] }));
  }
  return merge(parts);
}

/** Hoodoo: balancing stack of rock discs ~5 m. */
export function hoodoo({ seed = 4, rock = ['#b9602f', '#e69a5a'] } = {}) {
  const rnd = mulberry32(seed * 41 + 9);
  const parts = [];
  let y = 0;
  const n = 4 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const r = 1.05 - i * 0.1 + (i === n - 1 ? 0.55 : 0) + (rnd() - 0.5) * 0.25, h = 0.9 + rnd() * 0.6;
    const g = cyl(r * 0.85, r, h, 7, i % 2 ? rock[0] : rock[1], i % 2 ? rock[1] : rock[0], { pos: [(rnd() - 0.5) * 0.3, y, (rnd() - 0.5) * 0.3] });
    jitter(g, 0.18, seed + i);
    parts.push(g); y += h * 0.92;
  }
  const g = merge(parts); g.computeVertexNormals();
  return g;
}

/** Faceted boulder, sandstone colours. */
export function sandBoulder({ seed = 5, color = ['#a8532c', '#e8a066'], squash = 0.75 } = {}) {
  const g = merge([blob(1, 1, color[0], color[1], { jit: 0.3, seed, squash, pos: [0, 0.55, 0] })]);
  g.computeVertexNormals();
  return g;
}

/** Tumbleweed ~1 m: interlocking twig rings. */
export function tumbleweed({ color = '#b99256' } = {}) {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(torus(0.42 + (i % 3) * 0.04, 0.025, 4, 14, color, { rot: [i * 0.9, i * 1.3, i * 0.5], pos: [0, 0.5, 0] }));
  for (let i = 0; i < 4; i++) parts.push(torus(0.34, 0.02, 3, 10, '#8a6a3a', { rot: [i * 1.1 + 0.4, i * 0.7, i * 1.9], pos: [0, 0.5, 0] }));
  return merge(parts);
}

/** Dead tree ~4 m: bare forked branches. */
export function deadTree({ seed = 6, wood = ['#5a4636', '#8a735a'] } = {}) {
  const rnd = mulberry32(seed * 53 + 1);
  const parts = [cyl(0.1, 0.24, 2.6, 5, wood[0], wood[1], { rot: [0.04, 0, 0.06] })];
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, y = 1.4 + rnd() * 1.4, len = 1.0 + rnd() * 1.3, tilt = 0.7 + rnd() * 0.6;
    parts.push(cyl(0.02, 0.09, len, 4, wood[0], wood[1], { pos: [0, y, 0], rot: [tilt * Math.cos(a), a, tilt * Math.sin(a)] }));
  }
  return merge(parts);
}

/** Wagon-wheel / barrel / crate camp props can be added by recipes; skull for flavour. */
export function cattleSkull() {
  const parts = [blob(0.28, 0, '#e6dcc4', '#f7f0de', { pos: [0, 0.25, 0], squash: 0.8, scale: [1, 1, 1.4] })];
  for (const s of [-1, 1]) parts.push(cone(0.06, 0.7, 5, '#ddd2b8', '#f7f0de', { pos: [s * 0.25, 0.35, 0], rot: [0, 0, -s * 1.15] }));
  return merge(parts);
}

/**
 * Sandstone arch spanning the road.  `span` = inner width at the feet (m), `height` = inner clearance at the crown (m),
 * `thick` = rock thickness, `depth` = extent along the road.  Built by lofting a noisy ellipse along legs + semi-ellipse.
 * Local frame: X = across the road, Y = up, Z = along the road, origin = road centre on the ground, feet buried below y=0.
 */
export function rockArch({ span = 34, height = 17, thick = 6, depth = 11, seed = 7, rock = ['#a24d28', '#e69a58', '#f0c58a'], legDrop = 14 } = {}) {
  const rnd = mulberry32(seed * 131 + 11);
  const rings = [];
  const addRing = (cx, cy, nx, ny, t, d) => rings.push({ cx, cy, nx, ny, t, d });
  // path: left leg (down), arc over the top, right leg
  const steps = 26;
  for (let i = 0; i <= 5; i++) { const k = i / 5; addRing(-span / 2 - thick * 0.15, -legDrop + k * (legDrop), 1, 0, thick * (1.35 - 0.25 * k), depth * (1.25 - 0.2 * k)); }
  for (let i = 1; i < steps; i++) {
    const a = Math.PI - (i / steps) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const x = ca * (span / 2 + thick * 0.15 * ca), y = sa * height;
    addRing(x, y, ca, sa, thick * (1.1 - 0.42 * sa), depth * (1.05 - 0.2 * sa));
  }
  for (let i = 5; i >= 0; i--) { const k = i / 5; addRing(span / 2 + thick * 0.15, -legDrop + k * legDrop, -1, 0, thick * (1.35 - 0.25 * k), depth * (1.25 - 0.2 * k)); }
  const seg = 12, R = rings.length;
  const pos = [], col = [], idx = [];
  const c0 = new THREE.Color(rock[0]), c1 = new THREE.Color(rock[1]), c2 = new THREE.Color(rock[2]), tmp = new THREE.Color();
  rings.forEach((r, ri) => {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const n1 = 1 + (rnd() - 0.5) * 0.28;
      const u = Math.cos(a) * r.t * n1, w = Math.sin(a) * r.d * 0.5 * n1;       // u along the ring normal (thickness), w along the road
      const x = r.cx + r.nx * u, y = r.cy + r.ny * u;
      pos.push(x, y, w);
      // strata: horizontal bands by world height + warm lighten towards the top
      const band = 0.5 + 0.5 * Math.sin(y * 1.35 + rnd() * 0.5);
      tmp.copy(c0).lerp(c1, band).lerp(c2, Math.max(0, Math.sin(a) * 0.35 + 0.1 * (y / height)));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  });
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < seg; j++) {
    const a = r * seg + j, b = r * seg + ((j + 1) % seg), c = (r + 1) * seg + j, d = (r + 1) * seg + ((j + 1) % seg);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}
