// Barriers: the visible boundary at lateral = halfWidth + shoulder (exactly where KartPhysics stops karts).   OWNER: Agent B.
// Built as ONE merged vertex-coloured geometry per style (cross-section sweeps + posts), honouring openEdges (no wall => no mesh,
// the road edge gets an edge strip instead).  Heights are along world Y so walls stand upright on banked roads.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { makeRows } from './ribbon.js';
import { toColor } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const _o = new THREE.Vector3();

/** Horizontal outward unit vector for a side (-1 left | +1 right) of a row. */
function outward(row, side, out = _o) { return out.set(row.right.x, 0, row.right.z).normalize().multiplyScalar(side); }

/** Base point of the wall line at this row (on the extended road plane). */
function basePoint(row, side, lateral, out) { return out.copy(row.pos).addScaledVector(row.right, side * lateral); }

/** True where the barrier exists on `side` for the segment row r -> r+1. */
let _skip = null;
function wallOn(track, rows, r, side) {
  if (_skip) { const s = rows[r].s % track.length; for (let k = 0; k < _skip.length; k++) if (s >= _skip[k][0] && s <= _skip[k][1]) return false; }
  const a = rows[r].idx, b = rows[r + 1].idx;
  const arr = side > 0 ? track.wallR : track.wallL;
  return arr[a] === 1 && arr[b] === 1;
}

/**
 * Sweep a closed 2D polygon (dx outward from the wall's inner face, h up) along the wall line.
 * colorFn(rowIndex, faceIndex) -> Color.  Faces whose colour fn returns null are skipped.
 */
function sweep(B, track, rows, side, poly, colorFn, { baseLateral = (row) => row.hw + row.sh, uvLen = 4 } = {}) {
  const n = poly.length;
  let cx = 0, cy = 0; for (const [x, y] of poly) { cx += x; cy += y; } cx /= n; cy /= n;
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3(), D = new THREE.Vector3(), nrm = new THREE.Vector3(), o0 = new THREE.Vector3(), o1 = new THREE.Vector3(), g = new THREE.Vector3(), t = new THREE.Vector3();
  for (let r = 0; r < rows.length - 1; r++) {
    if (!wallOn(track, rows, r, side)) continue;
    const r0 = rows[r], r1 = rows[r + 1];
    outward(r0, side, o0); outward(r1, side, o1);
    const b0 = basePoint(r0, side, baseLateral(r0), new THREE.Vector3()), b1 = basePoint(r1, side, baseLateral(r1), new THREE.Vector3());
    for (let f = 0; f < n; f++) {
      const p = poly[f], q = poly[(f + 1) % n];
      const col = colorFn(r, f);
      if (!col) continue;
      A.copy(b0).addScaledVector(o0, p[0]); A.y += p[1];
      Bv.copy(b0).addScaledVector(o0, q[0]); Bv.y += q[1];
      Cv.copy(b1).addScaledVector(o1, q[0]); Cv.y += q[1];
      D.copy(b1).addScaledVector(o1, p[0]); D.y += p[1];
      // outward 2D normal of this edge, then to 3D
      let ex = q[0] - p[0], ey = q[1] - p[1];
      let nx = ey, ny = -ex;
      const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      nrm.set(0, 0, 0).addScaledVector(o0, nx).addScaledVector(UP, ny).normalize();
      // winding so the geometric normal matches `nrm`
      g.subVectors(Bv, A); t.subVectors(D, A); g.cross(t);
      if (g.dot(nrm) < 0) B.quad(A, D, Cv, Bv, col, [0, 0, 1, 1], nrm); else B.quad(A, Bv, Cv, D, col, [0, 0, 1, 1], nrm);
    }
  }
}

/** Posts (boxes) every `every` metres of track on a side. */
function posts(B, track, rows, side, { every = 4, w = 0.18, h = 1.2, d = 0.18, color, topColor, lateral = (row) => row.hw + row.sh + 0.2, sink = 0.4, skip = null }) {
  const right = new THREE.Vector3(), fwd = new THREE.Vector3(), base = new THREE.Vector3();
  let acc = 0;
  for (let r = 0; r < rows.length - 1; r++) {
    acc += track.spacing;
    if (acc < every) continue;
    acc -= every;
    if (!wallOn(track, rows, r, side)) continue;
    const row = rows[r];
    if (skip && skip(row)) continue;
    outward(row, side, right); fwd.copy(row.tan).setY(0).normalize();
    basePoint(row, side, lateral(row), base); base.y -= sink;
    B.box(base.x, base.y, base.z, right, UP, fwd, w, h + sink, d, { top: topColor ?? color, side: color, bottom: color }, true);
  }
}

// ------------------------------------------------------------------------------------------------------------------
/** Style table. Each builder fills B for both sides and returns nothing. `o` = style options from the recipe. */
const STYLES = {
  /** Wooden post-and-rail fence (meadow, harbor boardwalk, spooky).  o: { wood, rail, post, height, rails:2, every } */
  fence(B, track, rows, o) {
    const post = toColor(o.post ?? '#8a5a32'), rail = toColor(o.rail ?? '#f1ece0'), cap = toColor(o.cap ?? o.post ?? '#b5834f');
    const h = o.height ?? 1.15, nRails = o.rails ?? 2;
    for (const side of [-1, 1]) {
      posts(B, track, rows, side, { every: o.every ?? 4, h, w: 0.2, d: 0.2, color: post, topColor: cap, lateral: (row) => row.hw + row.sh + 0.16 });
      for (let k = 0; k < nRails; k++) {
        const y = 0.35 + ((h - 0.55) * k) / Math.max(1, nRails - 1);
        const c = rail;
        sweep(B, track, rows, side, [[0, y - 0.09], [0.1, y - 0.09], [0.1, y + 0.09], [0, y + 0.09]], (r) => c);
      }
    }
  },

  /** Solid block wall with alternating colour blocks + a cap.  o: { height, thickness, a, b, cap, stripe (m), base } */
  wall(B, track, rows, o) {
    const h = o.height ?? 1.1, w = o.thickness ?? 0.9, a = toColor(o.a ?? '#e8403a'), b = toColor(o.b ?? '#f6f4ee'), cap = toColor(o.cap ?? '#ffffff'), base = toColor(o.base ?? '#555a66');
    const stripe = o.stripe ?? 4, rowsPerStripe = Math.max(1, Math.round(stripe / track.spacing));
    const poly = o.profile ?? [[0, -0.7], [0, h - 0.12], [0.12, h], [w - 0.12, h], [w, h - 0.12], [w, -0.7]];
    for (const side of [-1, 1]) {
      sweep(B, track, rows, side, poly, (r, f) => {
        const blockCol = Math.floor(r / rowsPerStripe) % 2 ? b : a;
        if (f === 2 || f === 3) return cap;            // top
        if (f === 5) return null;                      // bottom / buried
        return f <= 1 || f === 4 ? blockCol : base;
      });
    }
  },

  /** Concrete jersey barrier with an optional glowing strip (neon).  o: { height, concrete, strip, stripEmissive } */
  jersey(B, track, rows, o) {
    const h = o.height ?? 1.0, conc = toColor(o.concrete ?? '#9aa0b0'), strip = toColor(o.strip ?? '#22d3ff'), top = toColor(o.top ?? '#b9bfce');
    const poly = [[0, -0.7], [0, 0.28], [0.18, 0.62], [0.28, h], [0.62, h], [0.72, 0.62], [0.9, 0.28], [0.9, -0.7]];
    for (const side of [-1, 1]) {
      sweep(B, track, rows, side, poly, (r, f) => {
        if (f === 7) return null;
        if (f === 3) return top;
        if (o.strip && f === 1 && (r & 1) === 0) return null;
        if (o.strip && f === 2) return strip;
        return conc;
      });
    }
  },

  /** Wrought-iron fence: thin bars with spear tips between stone pillars, two rails.  o: { bar, cap, height, pillarEvery, barEvery } */
  ironfence(B, track, rows, o) {
    const bar = toColor(o.bar ?? '#1a1c24'), stone = toColor(o.stone ?? '#4a4f5c'), stoneTop = toColor(o.stoneTop ?? '#5f6575');
    const h = o.height ?? 1.9, base0 = (row) => row.hw + row.sh + 0.2;
    const A = new THREE.Vector3(), Bp = new THREE.Vector3(), right = new THREE.Vector3(), fwd = new THREE.Vector3();
    for (const side of [-1, 1]) {
      posts(B, track, rows, side, { every: o.pillarEvery ?? 6, h: h + 0.5, w: 0.5, d: 0.5, color: stone, topColor: stoneTop, lateral: (row) => row.hw + row.sh + 0.2, sink: 0.4 });
      for (const y of [0.35, h - 0.3]) sweep(B, track, rows, side, [[-0.05, y - 0.05], [0.07, y - 0.05], [0.07, y + 0.05], [-0.05, y + 0.05]], () => bar, { baseLateral: base0 });
      const perRow = Math.max(1, Math.round(track.spacing / (o.barEvery ?? 0.55)));
      for (let r = 0; r < rows.length - 1; r++) {
        if (!wallOn(track, rows, r, side)) continue;
        for (let k = 0; k < perRow; k++) {
          const t = k / perRow;
          const r0 = rows[r], r1 = rows[r + 1];
          basePoint(r0, side, base0(r0), A); basePoint(r1, side, base0(r1), Bp);
          A.lerp(Bp, t);
          outward(r0, side, right); fwd.copy(r0.tan).setY(0).normalize();
          B.box(A.x, A.y - 0.1, A.z, right, UP, fwd, 0.07, h + 0.1, 0.07, { top: bar, side: bar, bottom: bar }, true);
          // spear tip: a four-sided pyramid
          const tip = A.clone(); tip.y += h;
          const v = (dx, dz) => new THREE.Vector3(tip.x + right.x * dx + fwd.x * dz, tip.y, tip.z + right.z * dx + fwd.z * dz);
          const ap = new THREE.Vector3(tip.x, tip.y + 0.28, tip.z);
          B.tri(v(-0.07, -0.07), v(0.07, -0.07), ap, bar); B.tri(v(0.07, -0.07), v(0.07, 0.07), ap, bar); B.tri(v(0.07, 0.07), v(-0.07, 0.07), ap, bar); B.tri(v(-0.07, 0.07), v(-0.07, -0.07), ap, bar);
        }
      }
    }
  },

  /** Metal guard rail on posts.  o: { rail, post, height } */
  rail(B, track, rows, o) {
    const rail = toColor(o.rail ?? '#cfd6e2'), post = toColor(o.post ?? '#6b7384'), h = o.height ?? 0.9;
    for (const side of [-1, 1]) {
      posts(B, track, rows, side, { every: o.every ?? 4, h, w: 0.14, d: 0.14, color: post, lateral: (row) => row.hw + row.sh + 0.25 });
      sweep(B, track, rows, side, [[0, h - 0.34], [0.12, h - 0.3], [0.2, h - 0.17], [0.12, h - 0.04], [0, h - 0.0], [0.04, h - 0.17]], () => rail);
      if (o.lowerRail) sweep(B, track, rows, side, [[0, 0.2], [0.1, 0.2], [0.1, 0.32], [0, 0.32]], () => rail);
    }
  },
};

/** Complement of s-ranges on a loop of length L (the stretches NOT covered), as [[a,b],...] with a <= b. */
function complement(ranges, L) {
  const r = ranges.map(([a, b]) => [((a % L) + L) % L, ((a % L) + L) % L + (b - a)]).sort((x, y) => x[0] - y[0]);
  const out = [];
  let cur = 0;
  for (const [a, b] of r) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < L) out.push([cur, L]);
  return out;
}

function buildLayer(world, spec) {
  const track = world.track;
  const rows = makeRows(track, 0, track.length, track.spacing);
  const B = new GeoBuilder();
  const skip = [...(spec.skip ?? []), ...(spec.ranges ? complement(spec.ranges, track.length) : [])];
  _skip = skip.length ? skip.map(([a, b]) => [a % track.length, a % track.length + (b - a)]) : null;
  (STYLES[spec.type] ?? STYLES.wall)(B, track, rows, spec);
  _skip = null;
  if (!B.vertexCount) return null;
  const geo = B.build();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (spec.emissive) mat.emissive = new THREE.Color(spec.emissive);
  if (spec.emissiveMap) mat.emissiveMap = spec.emissiveMap;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `barrier:${spec.type}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Build all barriers for a track.  Returns a Mesh / Group (or null) ready to add to the scene.
 * spec = { type:'fence'|'wall'|'jersey'|'rail'|'ironfence', skip:[[s0,s1]...], ranges:[[s0,s1]...] (only here), ...style options }
 *      | { layers: [spec, spec, ...], skip }   several styles on different stretches (e.g. forest wall + cemetery iron fence)
 *      | null for none (floating roads)
 */
export function buildBarriers(world, spec) {
  if (!spec || spec.type === 'none') return null;
  if (spec.layers) {
    const g = new THREE.Group();
    g.name = 'barriers';
    for (const l of spec.layers) { const m = buildLayer(world, { ...l, skip: [...(l.skip ?? []), ...(spec.skip ?? [])] }); if (m) g.add(m); }
    return g.children.length ? g : null;
  }
  return buildLayer(world, spec);
}

export { posts as _posts, sweep as _sweep };
