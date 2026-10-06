// Haunted-forest props: twisted trees, tombstones, crypt, mansion, pumpkins, hanging lanterns, reeds, ghost sprite.   OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from '../builder.js';
import { toColor, merge, cyl, cone, blob } from '../geo.js';
import { mulberry32 } from '../../core/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const col = (h, k = 1) => toColor(h).multiplyScalar(k);

/** Gnarled leafless tree ~8 m: a trunk that bends and splits recursively into twisting limbs, plus a few hanging moss strands. */
export function twistedTree({ seed = 1, height = 7.5, bark = ['#1f1a1c', '#3d3238'], moss = '#3f6a4a', limbs = 3, depth = 2, segs = 3, sides = 5 } = {}) {
  const rnd = mulberry32(seed * 733 + 11);
  const B = new GeoBuilder();
  const c0 = col(bark[0]), c1 = col(bark[1]), cm = col(moss);
  const limb = (p, dir, len, r, lvl) => {
    let cur = p.clone();
    let d = dir.clone();
    for (let i = 0; i < segs; i++) {
      d.x += (rnd() - 0.5) * 0.9; d.z += (rnd() - 0.5) * 0.9; d.y += 0.12 + (lvl === 0 ? 0.25 : 0); d.normalize();
      const rr0 = r * (1 - i / segs * 0.6), rr1 = r * (1 - (i + 1) / segs * 0.6);
      const nxt = cur.clone().addScaledVector(d, len / segs);
      B.tube(cur, nxt, rr0, rr1, lvl === 0 ? sides + 2 : sides, c0.clone().lerp(c1, rnd() * 0.5), c0.clone().lerp(c1, 0.2 + rnd() * 0.5), false);
      if (lvl < depth && i >= 1 && rnd() < 0.8) {
        const n = lvl === 0 ? limbs : 2;
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2, up = 0.3 + rnd() * 0.7;
          const nd = V(Math.cos(a) * (0.7 + rnd() * 0.5), up, Math.sin(a) * (0.7 + rnd() * 0.5)).normalize();
          limb(nxt, nd, len * (0.55 + rnd() * 0.25), r * 0.55, lvl + 1);
        }
      }
      if (lvl >= depth - 1 && rnd() < 0.3) B.tube(nxt, V(nxt.x + (rnd() - 0.5) * 0.4, nxt.y - 1.2 - rnd() * 1.6, nxt.z + (rnd() - 0.5) * 0.4), 0.025, 0.005, 3, cm, cm, false); // moss strand
      cur = nxt;
    }
  };
  // buttressed base + trunk
  B.tube(V(0, -0.6, 0), V(0, 0.9, 0), 0.9, 0.55, 8, c0, c0);
  limb(V(0, 0.8, 0), V(0, 1, 0), height * 0.55, 0.5, 0);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + rnd(); B.tube(V(Math.cos(a) * 1.1, -0.2, Math.sin(a) * 1.1), V(Math.cos(a) * 0.35, 0.9, Math.sin(a) * 0.35), 0.28, 0.12, 5, c0, c1, false); }
  return B.build();
}

/** Tombstone variants merged in one geometry set: `kind` 0 rounded slab, 1 cross, 2 obelisk, 3 slanted slab with a skull-less cap. */
export function tombstone({ kind = 0, stone = '#7a8290', moss = '#3f6a4a' } = {}) {
  const B = new GeoBuilder();
  const c = col(stone), cd = col(stone, 0.7), cm = col(moss);
  const slab = (w, h, d, tilt = 0) => { B.box(0, 0, 0, X, Y, Z, w, h, d, { top: c, side: c.clone().lerp(cd, 0.35), bottom: cd }, true); };
  if (kind === 0) {
    B.box(0, 0, 0, X, Y, Z, 0.9, 1.2, 0.2, { top: c, side: c, bottom: cd }, true);
    B.tube(V(0, 1.2, 0), V(0, 1.2, 0.001), 0.45, 0.45, 10, c, c, false);
    B.tube(V(0, 1.2, -0.1), V(0, 1.2, 0.1), 0.45, 0.45, 10, c, c);
    B.box(0, -0.2, 0, X, Y, Z, 1.2, 0.3, 0.7, { top: cd, side: cd, bottom: cd }, true);
  } else if (kind === 1) {
    B.box(0, 0, 0, X, Y, Z, 0.32, 1.7, 0.22, { top: c, side: c, bottom: cd }, true);
    B.box(0, 1.0, 0, X, Y, Z, 1.0, 0.3, 0.22, { top: c, side: c, bottom: cd }, true);
    B.box(0, -0.2, 0, X, Y, Z, 1.0, 0.3, 0.8, { top: cd, side: cd, bottom: cd }, true);
  } else if (kind === 2) {
    B.tube(V(0, 0, 0), V(0, 2.4, 0), 0.4, 0.22, 4, c, c.clone().lerp(cd, 0.3));
    B.tube(V(0, 2.4, 0), V(0, 2.9, 0), 0.22, 0.0, 4, c, c, false);
    B.box(0, -0.2, 0, X, Y, Z, 1.3, 0.4, 1.3, { top: cd, side: cd, bottom: cd }, true);
  } else {
    B.box(0, 0, 0, X, Y, Z, 0.8, 1.0, 0.24, { top: c, side: c, bottom: cd }, true);
    B.box(0, 1.0, 0, X, Y, Z, 0.9, 0.18, 0.3, { top: cd, side: c, bottom: cd }, true);
  }
  // moss patch at the foot
  B.box(0, 0, 0.0, X, Y, Z, 0.75, 0.25, 0.28, { top: cm, side: cm, bottom: cm }, true);
  return B.build();
}

/** Small mausoleum / crypt ~5 m: columns, pediment, iron door, cross finial. */
export function crypt({ stone = '#8a929e' } = {}) {
  const B = new GeoBuilder();
  const c = col(stone), cd = col(stone, 0.65), door = col('#1a1c24'), cm = col('#3f6a4a');
  B.box(0, 0, 0, X, Y, Z, 5, 3.2, 4.2, { top: c, side: c, bottom: cd }, true);
  B.box(0, 3.2, 0, X, Y, Z, 5.4, 0.3, 4.6, { top: c, side: cd, bottom: cd }, true);
  B.tri(V(-2.7, 3.5, 2.3), V(2.7, 3.5, 2.3), V(0, 4.9, 2.3), c);
  B.quad(V(-2.7, 3.5, 2.3), V(0, 4.9, 2.3), V(0, 4.9, -2.3), V(-2.7, 3.5, -2.3), cd);
  B.quad(V(0, 4.9, 2.3), V(2.7, 3.5, 2.3), V(2.7, 3.5, -2.3), V(0, 4.9, -2.3), cd);
  B.box(0, 0, 2.12, X, Y, Z, 1.5, 2.3, 0.12, { top: door, side: door, bottom: door }, true);
  for (const x of [-2.3, 2.3]) B.tube(V(x, 0, 2.5), V(x, 3.2, 2.5), 0.22, 0.2, 8, c, c);
  B.box(0, 4.9, 0, X, Y, Z, 0.14, 1.1, 0.14, { top: c, side: c, bottom: c }, true);
  B.box(0, 5.5, 0, X, Y, Z, 0.7, 0.14, 0.14, { top: c, side: c, bottom: c }, true);
  B.box(-1.0, 0, 2.18, X, Y, Z, 0.6, 0.3, 0.2, { top: cm, side: cm, bottom: cm }, true);
  return B.build();
}

/** Gothic mansion ~30 m: main hall, two wings, a tall tower with a spire, gables, chimneys, many lit windows (bright vertex colours). */
export function mansion({ wall = '#2e2c3a', roof = '#1a1824', trim = '#4a4658', window: win = '#ffd98a', accent = '#9bff8a' } = {}) {
  const B = new GeoBuilder();
  const w = col(wall), r = col(roof), t = col(trim), lit = col(win, 2.4), lit2 = col(accent, 2.0);
  const box = (cx, cy, cz, sx, sy, sz, c) => B.box(cx, cy, cz, X, Y, Z, sx, sy, sz, { top: c, side: c, bottom: c }, true);
  const gable = (cx, cz, wx, base, h, depthZ) => {
    const hx = wx / 2, hz = depthZ / 2, o = 0.7;
    B.quad(V(cx - hx - o, base, cz + hz + o), V(cx + hx + o, base, cz + hz + o), V(cx + hx + o, base + h, cz), V(cx - hx - o, base + h, cz), r);
    B.quad(V(cx - hx - o, base + h, cz), V(cx + hx + o, base + h, cz), V(cx + hx + o, base, cz - hz - o), V(cx - hx - o, base, cz - hz - o), r.clone().multiplyScalar(0.8));
    for (const sx of [-1, 1]) B.tri(V(cx + sx * hx, base, cz - hz), V(cx + sx * hx, base, cz + hz), V(cx + sx * hx, base + h - 0.2, cz), w);
  };
  // wings + hall
  box(0, 0, 0, 16, 11, 11, w); gable(0, 0, 16, 11, 7, 11);
  box(-14, 0, 1, 12, 8, 9, w); gable(-14, 1, 12, 8, 5, 9);
  box(14, 0, 1, 12, 8, 9, w); gable(14, 1, 12, 8, 5, 9);
  // tower
  box(0, 0, 5.4, 6, 20, 6, w);
  B.tube(V(0, 20, 5.4), V(0, 31, 5.4), 4.6, 0.0, 4, r, r.clone().multiplyScalar(0.6), false);
  B.tube(V(0, 20, 5.4), V(0, 20.4, 5.4), 4.4, 4.4, 4, t, t);
  B.tube(V(0, 31, 5.4), V(0, 34, 5.4), 0.08, 0.02, 4, t, t);
  // chimneys
  for (const [x, z] of [[-5, -2], [6, -3], [-18, 1], [18, 1]]) { box(x, 11 + (Math.abs(x) > 10 ? -3 : 0), z, 1.4, 4, 1.4, t); }
  // windows: front face grid (+Z side), warm + a few ghostly green
  const winAt = (cx, y, cz, sx, sz, c) => box(cx, y, cz, sx, 1.7, sz, c);
  for (const [cx, cz, cols, rows, y0] of [[0, 5.55, 5, 3, 1.4], [-14, 5.55, 3, 2, 1.2], [14, 5.55, 3, 2, 1.2]]) {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = cx + (i - (cols - 1) / 2) * 2.8, y = y0 + j * 3.4, flick = ((i * 7 + j * 3 + (cx > 0 ? 5 : 0)) % 5) === 0;
      winAt(x, y, cz + (cz > 5 ? 0 : 0) + (cx === 0 ? 0 : -0.8), 1.2, 0.14, flick ? lit2 : ((i + j) % 3 === 0 ? col('#1a1820') : lit));
    }
  }
  winAt(0, 12.5, 8.45, 1.2, 0.14, lit2); winAt(0, 16, 8.45, 1.0, 0.14, lit);
  // front door and steps
  box(0, 0, 5.5, 2.2, 3.6, 0.2, col('#120f18'));
  box(0, 0, 7.4, 6, 0.4, 2.2, t); box(0, 0, 8.6, 7, 0.25, 1.4, t);
  return B.build();
}

/** Pumpkin ~0.9 m (ribbed orange) with a bright carved face on the +Z side. */
export function pumpkin({ color = '#ff7a1a' } = {}) {
  const g = new THREE.SphereGeometry(0.5, 14, 10);
  const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
  const base = toColor(color), tmp = new THREE.Color();
  const face = toColor('#ffd23f').multiplyScalar(2.6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const rib = 1 + 0.08 * Math.cos(a * 9);
    pos.setXYZ(i, x * rib, y * 0.78 + 0.4, z * rib);
    tmp.copy(base).multiplyScalar(0.7 + 0.3 * Math.abs(Math.cos(a * 4.5)));
    // carved face on +Z (a = atan2(z,x) near PI/2): two eyes, a nose and a jagged mouth are bright
    const f = Math.abs(a - Math.PI / 2) < 0.62;
    if (f && z > 0.25) {
      const u = (x) / 0.5, v = (y * 0.78 + 0.4 - 0.4) / 0.39;
      const eye = (Math.abs(u - 0.34) < 0.17 || Math.abs(u + 0.34) < 0.17) && v > 0.12 && v < 0.5;
      const mouth = v < -0.12 && v > -0.55 && Math.abs(u) < 0.62 && ((Math.floor((u + 1) * 5) & 1) || v > -0.36);
      const nose = Math.abs(u) < 0.12 && v > -0.08 && v < 0.1;
      if (eye || mouth || nose) tmp.copy(face);
    }
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const ng = g.toNonIndexed(); g.dispose(); ng.deleteAttribute('uv'); ng.computeVertexNormals();
  const stem = cyl(0.06, 0.1, 0.22, 5, '#4a6a2a', '#3a5a22', { pos: [0, 0.76, 0] });
  return merge([ng, stem]);
}

/** Hanging iron lantern post ~4 m: post, arm, chain and a glowing lantern cage (arm points along +X).  Glow comes from bright vertex colours. */
export function lanternPost({ glow = '#9bff8a', iron = '#1a1c24' } = {}) {
  const B = new GeoBuilder();
  const d = col(iron), m = col('#3a3d4c'), g = toColor(glow).multiplyScalar(2.8);
  B.tube(V(0, 0, 0), V(0, 4.2, 0), 0.13, 0.09, 6, d, m);
  B.box(0, 0, 0, X, Y, Z, 0.5, 0.35, 0.5, { top: m, side: d, bottom: d }, true);
  B.tube(V(0, 4.2, 0), V(0.9, 4.45, 0), 0.07, 0.06, 5, d, d);
  B.tube(V(0.9, 4.45, 0), V(1.6, 4.1, 0), 0.06, 0.05, 5, d, d);
  B.tube(V(1.6, 4.1, 0), V(1.6, 3.7, 0), 0.015, 0.015, 3, m, m);
  B.tube(V(1.6, 3.7, 0), V(1.6, 3.25, 0), 0.24, 0.24, 6, g, g, false);        // glowing glass
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; B.tube(V(1.6 + Math.cos(a) * 0.25, 3.25, Math.sin(a) * 0.25), V(1.6 + Math.cos(a) * 0.25, 3.72, Math.sin(a) * 0.25), 0.02, 0.02, 3, d, d); }
  B.tube(V(1.6, 3.72, 0), V(1.6, 3.95, 0), 0.3, 0.02, 6, d, d, false);
  return B.build();
}

/** Reed / cattail clump ~1.6 m for swamp edges (wave weights so windMaterial({flag}) sways the tips). */
export function reeds({ seed = 1 } = {}) {
  const rnd = mulberry32(seed * 61 + 3);
  const B = new GeoBuilder();
  const g0 = col('#2c4a32'), g1 = col('#5f8a4a'), brown = col('#4a3426');
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.45, h = 1.1 + rnd() * 0.9, lean = (rnd() - 0.5) * 0.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const p0 = V(x, 0, z), p1 = V(x + lean * 0.5, h * 0.55, z), p2 = V(x + lean, h, z);
    B.quadW(V(p0.x - 0.03, 0, p0.z), V(p0.x + 0.03, 0, p0.z), V(p1.x + 0.03, p1.y, p1.z), V(p1.x - 0.03, p1.y, p1.z), g0, [0, 0, 0.25, 0.25]);
    B.quadW(V(p1.x - 0.03, p1.y, p1.z), V(p1.x + 0.03, p1.y, p1.z), V(p2.x + 0.015, p2.y, p2.z), V(p2.x - 0.015, p2.y, p2.z), g1, [0.25, 0.25, 1, 1]);
    if (i % 3 === 0) B.tube(V(p2.x, p2.y - 0.5, p2.z), V(p2.x + lean * 0.1, p2.y - 0.1, p2.z), 0.05, 0.04, 5, brown, brown); // cattail
  }
  return B.build({ wave: true });
}
