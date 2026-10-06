// Ribbons: strips of geometry that follow the track between two lateral offsets (road, curbs, shoulders, decals, fascia).
// OWNER: Agent B.  Build-time only.  Rows are sampled from the SAME centreline data the physics uses, so what you see
// is exactly what you drive on (bank, width, elevation).  Positive lateral = RIGHT of the driving direction.
import * as THREE from 'three';

/** metres-per-v so that a texture tile of ~`tile` metres repeats an INTEGER number of times around the loop (no seam at the line). */
export function loopVScale(track, tile) {
  return track.length / Math.max(1, Math.round(track.length / tile));
}

/**
 * Rows of track frames from s0 to s1 (s1 may exceed length to wrap).  step <= track.spacing gives the sample resolution;
 * `exact` = also emit rows exactly at s0 and s1 (for features that must start/stop at precise metres).
 */
export function makeRows(track, s0 = 0, s1 = track.length, step = track.spacing) {
  const rows = [];
  const total = s1 - s0;
  const n = Math.max(1, Math.round(total / step));
  for (let k = 0; k <= n; k++) {
    const s = s0 + (total * k) / n;
    const smp = track.sampleAt(s);
    rows.push({
      s,                              // unwrapped arc length (continues past `length` when wrapping)
      pos: smp.position.clone(), right: smp.right.clone(), up: smp.up.clone(), tan: smp.tangent.clone(),
      hw: smp.halfWidth, sh: smp.shoulder, idx: Math.round(smp.s / track.spacing) % track.count,
    });
  }
  return rows;
}

const asFn = (v) => (typeof v === 'function' ? v : () => v);

/**
 * o = {
 *   l0, l1:   lateral extents (number or fn(row) -> metres). Rows with l1 <= l0 collapse to a line.
 *   lift:     metres along the surface normal (number or fn(row)), default 0
 *   segs:     subdivisions across (default 1)
 *   vScale:   metres of track per texture-v unit (default 10);  uMode 'norm' (0..1 across, default) | 'metres' (uScale metres per u)
 *   uScale:   when uMode === 'metres'
 *   color:    optional fn(row, t, lateral) -> Color|[r,g,b] vertex colour (t = 0..1 across)
 *   yOff:     optional fn(row, lateral) -> extra WORLD-Y metres (ramp wedges)
 *   normals:  'up' (default: the road's up vector) | 'compute'
 *   flip:     reverse winding
 * }
 */
export function ribbon(rows, o) {
  const l0 = asFn(o.l0), l1 = asFn(o.l1), lift = asFn(o.lift ?? 0);
  const segs = Math.max(1, o.segs ?? 1);
  const vScale = o.vScale ?? 10;
  const uMode = o.uMode ?? 'norm', uScale = o.uScale ?? 1;
  const R = rows.length, C = segs + 1;
  const pos = new Float32Array(R * C * 3), nrm = new Float32Array(R * C * 3), uv = new Float32Array(R * C * 2);
  const col = o.color ? new Float32Array(R * C * 3) : null;
  const tmp = new THREE.Color();
  for (let r = 0; r < R; r++) {
    const row = rows[r];
    const a = l0(row), b = l1(row), lf = lift(row);
    for (let c = 0; c < C; c++) {
      const t = c / segs, l = a + (b - a) * t;
      const k = r * C + c;
      let y = row.pos.y + row.right.y * l + row.up.y * lf;
      if (o.yOff) y += o.yOff(row, l);
      pos[k * 3] = row.pos.x + row.right.x * l + row.up.x * lf;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = row.pos.z + row.right.z * l + row.up.z * lf;
      nrm[k * 3] = row.up.x; nrm[k * 3 + 1] = row.up.y; nrm[k * 3 + 2] = row.up.z;
      uv[k * 2] = uMode === 'norm' ? t : l / uScale;
      uv[k * 2 + 1] = row.s / vScale + (o.vOffset ?? 0);
      if (col) { const cc = o.color(row, t, l); if (cc.isColor) tmp.copy(cc); else tmp.setRGB(cc[0], cc[1], cc[2]); col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b; }
    }
  }
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < segs; c++) {
    const i0 = r * C + c, i1 = i0 + 1, i2 = i0 + C, i3 = i2 + 1;
    // default winding faces UP (right x forward = +Y); `flip` reverses it (undersides)
    if (o.flip) idx.push(i0, i2, i1, i1, i2, i3); else idx.push(i0, i1, i2, i1, i3, i2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(R * C > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  if (o.normals === 'compute') g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Vertical fascia / skirt hanging below one road edge (hides gaps between the road and terrain, gives elevated roads a body).
 * side = -1 (left) | +1 (right). lateral = where the top edge sits (default road edge).  depth in metres (down along world -Y).
 */
export function skirt(rows, { side = 1, lateral = (r) => r.hw, depth = 0.6, lift = 0, vScale = 10, tilt = 0 } = {}) {
  const lat = asFn(lateral), dep = asFn(depth);
  const R = rows.length;
  const pos = new Float32Array(R * 2 * 3), nrm = new Float32Array(R * 2 * 3), uv = new Float32Array(R * 2 * 2);
  const out = new THREE.Vector3();
  for (let r = 0; r < R; r++) {
    const row = rows[r];
    const l = side * lat(row);
    const top = new THREE.Vector3().copy(row.pos).addScaledVector(row.right, l).addScaledVector(row.up, lift);
    const d = dep(row);
    const bx = top.x + row.right.x * side * tilt * d, bz = top.z + row.right.z * side * tilt * d;
    pos.set([top.x, top.y, top.z, bx, top.y - d, bz], r * 6);
    out.set(row.right.x * side, 0, row.right.z * side).normalize();
    nrm.set([out.x, out.y, out.z, out.x, out.y, out.z], r * 6);
    uv.set([0, row.s / vScale, 1, row.s / vScale], r * 4);
  }
  const idx = [];
  for (let r = 0; r < R - 1; r++) { const a = r * 2; if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
