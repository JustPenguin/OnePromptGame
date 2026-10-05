// Harbour & tropical props: palms, boats, lighthouse, whitewashed houses, containers, gantry cranes, beach gear, drawbridge parts.
// OWNER: Agent B.  Geometry is built with GeoBuilder (vertex colours, optional `aWave` for fronds / sails) at metre scale, base at y = 0.
import * as THREE from 'three';
import { GeoBuilder } from '../builder.js';
import { toColor, merge, blob, cyl, cone, box } from '../geo.js';
import { mulberry32 } from '../../core/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const col = (h, k = 1) => toColor(h).multiplyScalar(k);

/** Coconut palm ~8 m: bent ringed trunk, drooping fronds (wave weight along each leaf), coconuts.  Use with windMaterial({ sway, flag }). */
export function palmTree({ seed = 1, height = 7.5, fronds = 11, trunk = ['#9a7348', '#c9a26a'], leaf = ['#1f7a3a', '#6ccf5a'] } = {}) {
  const rnd = mulberry32(seed * 733 + 5);
  const B = new GeoBuilder();
  const lean = (rnd() - 0.5) * 2.2, curl = (rnd() - 0.5) * 1.4;
  const at = (t) => V(lean * t * t * 1.4 + curl * t * 0.3, height * t, curl * t * t * 0.9);
  const segs = 9;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const c0 = col(i % 2 ? trunk[0] : trunk[1]), c1 = col(i % 2 ? trunk[1] : trunk[0]);
    B.tube(at(t0), at(t1), 0.32 - 0.16 * t0, 0.32 - 0.16 * t1, 7, c0, c1, false);
  }
  const crown = at(1);
  B.tube(crown, V(crown.x, crown.y + 0.5, crown.z), 0.2, 0.05, 6, col('#6a4a2a'), col('#8a6a3a'));
  // fronds: each a curved strip of 7 segments, widest in the middle, drooping with distance
  const cl = col(leaf[0]), ch = col(leaf[1]);
  const n = fronds, len0 = 3.4;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + rnd() * 0.4, len = len0 * (0.8 + rnd() * 0.5), lift = 0.5 + rnd() * 0.9;
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz, pz = dx;
    const segsF = 7;
    let prevC = null, prevL = null, prevR = null;
    for (let k = 0; k <= segsF; k++) {
      const t = k / segsF;
      const out = len * t, y = crown.y + 0.35 + Math.sin(t * Math.PI * 0.6) * lift - Math.pow(t, 2) * 2.2 * (len / len0);
      const w = 0.62 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.02)) ** 0.7 + 0.05;
      const cc = V(crown.x + dx * out, y, crown.z + dz * out);
      const L = V(cc.x + px * w, cc.y - w * 0.28, cc.z + pz * w), R = V(cc.x - px * w, cc.y - w * 0.28, cc.z - pz * w);
      if (prevC) {
        const c0 = cl.clone().lerp(ch, (k - 1) / segsF), c1 = cl.clone().lerp(ch, k / segsF);
        const w0 = (k - 1) / segsF, w1 = k / segsF;
        B.quadW(prevL, prevR, R, L, c0.clone().lerp(c1, 0.5), [w0, w0, w1, w1]);
      }
      prevC = cc; prevL = L; prevR = R;
    }
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + rnd(); B.tube(V(crown.x + Math.cos(a) * 0.2, crown.y - 0.15, crown.z + Math.sin(a) * 0.2), V(crown.x + Math.cos(a) * 0.26, crown.y - 0.55, crown.z + Math.sin(a) * 0.26), 0.17, 0.12, 6, col('#5a3a1a'), col('#7a5a2a')); }
  return B.build({ wave: true });
}

/** Hull from cross-sections [{z, hw (half width at deck), hk (half width at keel), yd (deck y), yk (keel y)}], closed deck and bow. */
function hull(B, sections, hullCol, deckCol, trimCol) {
  const P = (s, side, top) => V(side * (top ? s.hw : s.hk), top ? s.yd : s.yk, s.z);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    for (const side of [-1, 1]) {
      const q = [P(a, side, true), P(b, side, true), P(b, side, false), P(a, side, false)];
      if (side > 0) B.quad(q[0], q[3], q[2], q[1], hullCol); else B.quad(q[0], q[1], q[2], q[3], hullCol);
    }
    B.quad(P(a, -1, true), P(b, -1, true), P(b, 1, true), P(a, 1, true), deckCol);   // deck
    B.quad(P(a, -1, false), P(a, 1, false), P(b, 1, false), P(b, -1, false), hullCol.clone().multiplyScalar(0.6)); // bottom
    // trim stripe near the waterline-top
    B.quad(P(a, -1, true).setY(a.yd - 0.02), P(b, -1, true).setY(b.yd - 0.02), P(b, -1, true).setY(b.yd - 0.14), P(a, -1, true).setY(a.yd - 0.14), trimCol);
    B.quad(P(a, 1, true).setY(a.yd - 0.14), P(b, 1, true).setY(b.yd - 0.14), P(b, 1, true).setY(b.yd - 0.02), P(a, 1, true).setY(a.yd - 0.02), trimCol);
  }
  const f = sections[0], l = sections[sections.length - 1];
  B.quad(P(f, -1, true), P(f, 1, true), P(f, 1, false), P(f, -1, false), hullCol.clone().multiplyScalar(0.85)); // transom
}

/** Sailboat ~7 m: white hull, two triangular sails (wave weight along the sail), mast.  Bow toward +Z. */
export function sailboat({ hullColor = '#f4f6fb', trimColor = '#2a6ad0', sail = '#ffffff', jib = '#ff9a3a', seed = 1 } = {}) {
  const B = new GeoBuilder();
  hull(B, [
    { z: -2.6, hw: 0.85, hk: 0.55, yd: 0.7, yk: -0.3 }, { z: -1.0, hw: 1.15, hk: 0.7, yd: 0.75, yk: -0.45 }, { z: 1.0, hw: 1.1, hk: 0.55, yd: 0.8, yk: -0.4 },
    { z: 2.4, hw: 0.55, hk: 0.2, yd: 0.9, yk: -0.25 }, { z: 3.4, hw: 0.0, hk: 0.0, yd: 1.05, yk: -0.05 },
  ], col(hullColor), col('#d8b27a'), col(trimColor));
  B.box(0, 0.8, -0.5, X, Y, Z, 1.0, 0.45, 1.6, { top: col('#f4f6fb'), side: col('#e6eaf2'), bottom: col('#e6eaf2') }, true); // cabin
  B.tube(V(0, 0.8, 0.9), V(0, 8.2, 0.9), 0.07, 0.04, 5, col('#cfd6e4'), col('#e8edf6'));
  B.tube(V(0, 2.1, 0.9), V(0, 2.1, -2.1), 0.05, 0.05, 4, col('#cfd6e4'));
  const sc = col(sail), jc = col(jib);
  const ds = (p, q, r, c) => { B.tri(p, q, r, c); B.tri(p, r, q, c.clone().multiplyScalar(0.85)); };
  // main sail: triangle mast-base / boom-end / mast-top with a gentle belly, built from 5 slices
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5, t1 = (i + 1) / 5;
    const x0 = 0.16 * Math.sin(Math.PI * t0), x1 = 0.16 * Math.sin(Math.PI * t1);
    const z0 = 0.9 - 3.0 * t0, z1 = 0.9 - 3.0 * t1, y0 = 8.0 - 5.8 * t0, y1 = 8.0 - 5.8 * t1;
    ds(V(x0, 2.2, z0), V(x1, 2.2, z1), V(x1, y1, z1), sc); ds(V(x0, 2.2, z0), V(x1, y1, z1), V(x0, y0, z0), sc);
  }
  // jib: head at the mast top, tack at the bow, clew near the mast
  ds(V(0.05, 7.4, 1.0), V(0.05, 1.3, 3.0), V(0.15, 1.6, 0.95), jc);
  B.tube(V(0, 8.2, 0.9), V(0, 8.8, 0.9), 0.02, 0.0, 4, col('#ff3d6a'));
  return B.build({ wave: true });
}

/** Motor launch ~6 m with a small wheelhouse. */
export function launch({ hullColor = '#e5413a', topColor = '#f4f6fb' } = {}) {
  const B = new GeoBuilder();
  hull(B, [{ z: -2.2, hw: 1.0, hk: 0.7, yd: 0.8, yk: -0.35 }, { z: 0.2, hw: 1.15, hk: 0.75, yd: 0.85, yk: -0.4 }, { z: 2.0, hw: 0.7, hk: 0.3, yd: 0.95, yk: -0.3 }, { z: 3.0, hw: 0, hk: 0, yd: 1.1, yk: -0.1 }], col(hullColor), col('#e8d2a6'), col('#ffffff'));
  B.box(0, 0.85, -0.4, X, Y, Z, 1.5, 1.1, 1.8, { top: col(topColor), side: col(topColor), bottom: col(topColor) }, true);
  B.box(0, 1.45, 0.52, X, Y, Z, 1.2, 0.5, 0.06, { top: col('#223048'), side: col('#223048'), bottom: col('#223048') }, true);
  B.tube(V(0, 1.95, -0.6), V(0, 3.0, -0.6), 0.04, 0.03, 4, col('#cfd6e4'));
  return B.build({ wave: true });
}

/** Big cargo ship ~70 m, container stacks on deck, bridge at the stern.  Bow toward +Z. */
export function freighter({ hullColor = '#a8322a', seed = 2 } = {}) {
  const rnd = mulberry32(seed * 91 + 3);
  const B = new GeoBuilder();
  hull(B, [{ z: -34, hw: 7.5, hk: 5.5, yd: 5.0, yk: -3.5 }, { z: -10, hw: 8.4, hk: 6.0, yd: 5.2, yk: -4.0 }, { z: 18, hw: 8.2, hk: 5.4, yd: 5.4, yk: -3.8 }, { z: 31, hw: 4.2, hk: 1.8, yd: 6.2, yk: -2.5 }, { z: 38, hw: 0, hk: 0, yd: 7.4, yk: -0.5 }], col(hullColor), col('#5a5f6a'), col('#f4f6fb'));
  // bridge superstructure
  B.box(0, 5.2, -26, X, Y, Z, 11, 8, 7, { top: col('#f4f6fb'), side: col('#e8ecf4'), bottom: col('#cfd6e4') }, true);
  B.box(0, 13.2, -26.5, X, Y, Z, 12, 1.4, 5, { top: col('#223048'), side: col('#2a3a58'), bottom: col('#223048') }, true);
  B.tube(V(0, 14.6, -26), V(0, 22, -26), 0.35, 0.22, 6, col('#e8ecf4'), col('#e5413a'));
  const palette = ['#e5413a', '#2f8be8', '#ffd23f', '#35c759', '#ff7a1a', '#8b4dff', '#f4f6fb'];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) {
    if (row > 0 && rnd() < 0.3) continue;
    const c = col(palette[(rnd() * palette.length) | 0]);
    B.box(-5.0 + k * 3.3, 5.4 + row * 2.6, -14 + i * 6.2, X, Y, Z, 3.1, 2.5, 6.0, { top: c.clone().multiplyScalar(1.1), side: c, bottom: c }, true);
  }
  return B.build();
}

/** Lighthouse ~34 m: banded tapered tower, gallery, glass lamp room, dome roof.  Returns { geometry, lampY }. */
export function lighthouse({ red = '#e5413a', white = '#f7f5ee' } = {}) {
  const B = new GeoBuilder();
  const bands = 6, H = 24, r0 = 3.9, r1 = 2.5;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands, t1 = (i + 1) / bands;
    B.tube(V(0, H * t0, 0), V(0, H * t1, 0), r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, 12, col(i % 2 ? red : white), col(i % 2 ? red : white), false);
  }
  B.tube(V(0, -2, 0), V(0, 0.4, 0), 4.6, 4.3, 12, col('#8a8f9c'), col('#a8adba'));
  B.tube(V(0, H, 0), V(0, H + 0.5, 0), 4.0, 3.6, 12, col('#2a2f3c'), col('#3a4152'));                    // gallery deck
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; B.tube(V(Math.cos(a) * 3.8, H + 0.5, Math.sin(a) * 3.8), V(Math.cos(a) * 3.8, H + 1.7, Math.sin(a) * 3.8), 0.07, 0.07, 4, col('#2a2f3c')); }
  B.tube(V(0, H + 1.7, 0), V(0, H + 1.7, 0.001), 0.01, 0.01, 3, col('#2a2f3c'));
  const lamp = col('#ffe9a8', 2.4);
  B.tube(V(0, H + 0.5, 0), V(0, H + 4.2, 0), 2.1, 2.1, 10, lamp, lamp, false);                           // glowing lamp room
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; B.tube(V(Math.cos(a) * 2.15, H + 0.5, Math.sin(a) * 2.15), V(Math.cos(a) * 2.15, H + 4.2, Math.sin(a) * 2.15), 0.09, 0.09, 4, col('#2a2f3c')); }
  B.tube(V(0, H + 4.2, 0), V(0, H + 6.2, 0), 2.5, 0.0, 10, col(red), col('#c0302a'));
  B.tube(V(0, H + 6.2, 0), V(0, H + 7.4, 0), 0.08, 0.02, 4, col('#2a2f3c'));
  return { geometry: B.build(), lampY: H + 2.5 };
}

/** Rotating light beam (two additive cones/blades), lies along +Z from the origin; spin it around Y. */
export function beamGeometry(len = 220, width = 26) {
  const B = new GeoBuilder();
  const c = col('#fff0c0');
  for (const s of [1, -1]) {
    const a = V(0, 0.3, 0), b = V(-width * 0.5, 0, s * len), cc = V(width * 0.5, 0, s * len), d = V(0, 0.3, 0);
    B.quadW(V(-1.5, 0.2, 0), V(1.5, 0.2, 0), V(width * 0.5, 0, s * len), V(-width * 0.5, 0, s * len), c, [1, 1, 0, 0]);
  }
  return B.build({ wave: true });
}

/** Whitewashed Mediterranean/tropical house ~7 m: cube body, terracotta or flat roof, shutters, door, balcony. */
export function house({ seed = 1, wall = '#f6f1e6', roof = '#c8532f', shutter = '#2a8ac8', floors = 2, flat = false } = {}) {
  const rnd = mulberry32(seed * 311 + 17);
  const B = new GeoBuilder();
  const w = 6 + rnd() * 4, d = 5.5 + rnd() * 3.5, h = 3.1 * floors;
  const cw = col(wall);
  B.box(0, 0, 0, X, Y, Z, w, h, d, { top: cw, side: cw, bottom: cw }, true);
  if (flat) {
    B.box(0, h, 0, X, Y, Z, w + 0.3, 0.3, d + 0.3, { top: col('#e8e0d0'), side: cw, bottom: cw }, true);
  } else {
    const rc = col(roof), rd = col(roof, 0.8);
    const ov = 0.5, y0 = h, y1 = h + 2.4;
    B.quad(V(-w / 2 - ov, y0, d / 2 + ov), V(w / 2 + ov, y0, d / 2 + ov), V(w / 2 + ov, y1, 0), V(-w / 2 - ov, y1, 0), rc);
    B.quad(V(-w / 2 - ov, y1, 0), V(w / 2 + ov, y1, 0), V(w / 2 + ov, y0, -d / 2 - ov), V(-w / 2 - ov, y0, -d / 2 - ov), rd);
    for (const x of [-w / 2, w / 2]) B.tri(V(x, y0, d / 2), V(x, y0, -d / 2), V(x, y1 - 0.1, 0), cw);
  }
  const sc = col(shutter), glass = col('#2a3a52');
  for (let f = 0; f < floors; f++) {
    const y = 0.9 + f * 3.1;
    const nx = Math.max(2, Math.round(w / 2.6));
    for (let i = 0; i < nx; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / nx;
      if (f === 0 && i === Math.floor(nx / 2)) { B.box(x, 0, d / 2 + 0.02, X, Y, Z, 1.1, 2.2, 0.12, { top: col('#7a4a2c'), side: col('#7a4a2c'), bottom: col('#7a4a2c') }, true); continue; }
      B.box(x, y, d / 2 + 0.02, X, Y, Z, 0.9, 1.3, 0.1, { top: glass, side: glass, bottom: glass }, true);
      for (const s of [-1, 1]) B.box(x + s * 0.65, y - 0.05, d / 2 + 0.03, X, Y, Z, 0.35, 1.4, 0.08, { top: sc, side: sc, bottom: sc }, true);
    }
  }
  if (floors > 1 && rnd() < 0.6) B.box(0, 3.0, d / 2 + 0.6, X, Y, Z, w * 0.5, 0.18, 1.2, { top: col('#d8d0c0'), side: col('#d8d0c0'), bottom: col('#a8a090') }, true); // balcony slab
  return B.build();
}

/** Church / bell tower landmark ~14 m. */
export function bellTower({ wall = '#f6f1e6', roof = '#2a8ac8' } = {}) {
  const B = new GeoBuilder();
  const cw = col(wall);
  B.box(0, 0, 0, X, Y, Z, 5, 12, 5, { top: cw, side: cw, bottom: cw }, true);
  B.box(0, 12, 0, X, Y, Z, 5.6, 0.4, 5.6, { top: col('#e8e0d0'), side: col('#d8d0c0'), bottom: cw }, true);
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) B.box(x, 12.4, z, X, Y, Z, 0.7, 2.6, 0.7, { top: cw, side: cw, bottom: cw }, true);
  B.tube(V(0, 15, 0), V(0, 19.2, 0), 3.6, 0.0, 4, col(roof), col(roof, 1.3), false);
  B.box(0, 12.6, 0, X, Y, Z, 1.2, 1.6, 1.2, { top: col('#d8a838'), side: col('#c89828'), bottom: col('#c89828') }, true);
  return B.build();
}

/** ISO shipping container 12 x 2.6 x 2.4 m with corrugation (door end toward +Z).  Tint with instance colours. */
export function container({ color = '#e5413a' } = {}) {
  const B = new GeoBuilder();
  const c = col(color), cd = col(color, 0.78), ct = col(color, 1.12);
  B.box(0, 0, 0, X, Y, Z, 2.4, 2.6, 12, { top: ct, side: c, bottom: cd }, true);
  for (let i = 0; i < 22; i++) { const z = -5.5 + i * 0.5; B.box(1.205, 0.1, z, X, Y, Z, 0.06, 2.4, 0.16, { top: cd, side: cd, bottom: cd }, true); B.box(-1.205, 0.1, z, X, Y, Z, 0.06, 2.4, 0.16, { top: cd, side: cd, bottom: cd }, true); }
  for (const x of [-0.5, 0.5]) B.box(x, 0.15, 6.01, X, Y, Z, 0.9, 2.3, 0.05, { top: cd, side: col(color, 0.86), bottom: cd }, true);
  B.box(0, 1.2, 6.03, X, Y, Z, 0.05, 0.2, 0.05, { top: col('#cfd6e4'), side: col('#cfd6e4'), bottom: col('#cfd6e4') }, true);
  return B.build();
}

/** Quay gantry crane ~36 m: A-frame legs, boom reaching over the water (toward +Z), cab, trolley. */
export function gantryCrane({ steel = '#ff9a3a', dark = '#3a4152' } = {}) {
  const B = new GeoBuilder();
  const s = col(steel), s2 = col(steel, 0.8), d = col(dark);
  const leg = (x, z) => { B.tube(V(x, 0, z), V(x, 30, z * 0.7), 0.6, 0.45, 6, s2, s); };
  for (const x of [-8, 8]) for (const z of [-5, 5]) leg(x, z);
  B.box(0, 29.5, 0, X, Y, Z, 18, 1.4, 12, { top: s, side: s2, bottom: s2 }, true);
  for (const x of [-8, 8]) B.box(x, 26, 0, X, Y, Z, 1.2, 0.8, 11, { top: s, side: s2, bottom: s2 }, true);
  for (let i = 0; i < 4; i++) B.tube(V(-8, 2 + i * 6.5, -5), V(8, 8.5 + i * 6.5, 5), 0.18, 0.18, 4, s2); // cross bracing
  B.box(0, 30.5, 22, X, Y, Z, 2.2, 1.6, 52, { top: s, side: s2, bottom: s2 }, false);
  B.box(0, 31.8, -12, X, Y, Z, 4, 3.4, 8, { top: col('#cfd6e4'), side: s, bottom: d }, true); // machinery house
  B.box(0, 28.6, 14, X, Y, Z, 2.4, 1.8, 3.0, { top: d, side: col('#223048'), bottom: d }, true); // trolley / cab
  B.tube(V(0, 28.6, 14), V(0, 22, 14), 0.06, 0.06, 4, d);
  B.box(0, 20, 14, X, Y, Z, 2.4, 0.6, 1.0, { top: d, side: d, bottom: d }, true);
  return B.build();
}

/** Striped beach umbrella ~2.4 m. */
export function umbrella({ a = '#ff3d6a', b = '#ffffff' } = {}) {
  const B = new GeoBuilder();
  B.tube(V(0, 0, 0), V(0, 2.3, 0), 0.04, 0.03, 5, col('#e8e0d0'));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const c = col(i % 2 ? a : b);
    const top = V(0, 2.75, 0);
    B.tri(top, V(Math.cos(a0) * 1.3, 2.25, Math.sin(a0) * 1.3), V(Math.cos(a1) * 1.3, 2.25, Math.sin(a1) * 1.3), c);
    B.tri(top, V(Math.cos(a1) * 1.3, 2.25, Math.sin(a1) * 1.3), V(Math.cos(a0) * 1.3, 2.25, Math.sin(a0) * 1.3), c.clone().multiplyScalar(0.8));
  }
  return B.build();
}

/** Beach lounger + towel. */
export function lounger({ towel = '#22d3ff' } = {}) {
  const B = new GeoBuilder();
  const w = col('#f4f1e8'), t = col(towel);
  B.box(0, 0.25, 0, X, Y, Z, 0.7, 0.12, 1.4, { top: t, side: w, bottom: w }, true);
  B.quad(V(-0.35, 0.37, 0.7), V(0.35, 0.37, 0.7), V(0.35, 0.95, 1.1), V(-0.35, 0.95, 1.1), t);
  for (const x of [-0.3, 0.3]) B.tube(V(x, 0, -0.6), V(x, 0.25, -0.6), 0.03, 0.03, 4, w);
  return B.build();
}

/** Bollard, buoy, barrel & crates for docks. */
export function bollard() { return merge([cyl(0.2, 0.26, 0.7, 7, '#2a2f3c', '#4a5266'), cyl(0.3, 0.2, 0.2, 7, '#3a4152', '#5a6278', { pos: [0, 0.7, 0] })]); }
export function crate({ color = '#c98a4a' } = {}) { return merge([box(1, 1, 1, color, color), box(1.02, 0.1, 1.02, '#8a5a30', '#8a5a30', { pos: [0, 0.1, 0] }), box(1.02, 0.1, 1.02, '#8a5a30', '#8a5a30', { pos: [0, 0.8, 0] })]); }

/** Drawbridge tower with counterweight and signal light (placed at both sides of the opening). */
export function bridgeTower({ steel = '#c8d0e0', accent = '#e5413a' } = {}) {
  const B = new GeoBuilder();
  const s = col(steel), a = col(accent), d = col('#3a4152');
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) B.tube(V(x, 0, z), V(x * 0.8, 15, z * 0.8), 0.28, 0.2, 5, s, s);
  for (let i = 0; i < 4; i++) { const y = 2 + i * 3.4; B.box(0, y, 0, X, Y, Z, 2.8 - i * 0.12, 0.2, 2.8 - i * 0.12, { top: s, side: s, bottom: d }, true); }
  B.box(0, 15, 0, X, Y, Z, 3.6, 3.2, 3.6, { top: a, side: col('#f4f6fb'), bottom: d }, true);                       // control cabin
  B.box(0, 16.4, 1.82, X, Y, Z, 3.0, 1.0, 0.06, { top: col('#223048'), side: col('#223048'), bottom: col('#223048') }, true);
  const lit = col('#ff4a3a', 2.6);
  B.tube(V(0, 18.2, 0), V(0, 19.6, 0), 0.5, 0.5, 8, lit, lit);                                                            // signal beacon
  B.box(0, 7.5, -2.6, X, Y, Z, 2.6, 5.0, 2.2, { top: d, side: col('#5a6278'), bottom: d }, true);                      // counterweight
  return B.build();
}
