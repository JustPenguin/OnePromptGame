// Geometry toolkit for procedural props: build small vertex-coloured parts, transform them, merge into ONE geometry.
// OWNER: Agent B.  Everything here is allocation-at-build-time only (never called per frame).
// Conventions: parts are built around the origin with +Y up and base at y=0 unless stated.  Colours are baked into the
// `color` attribute (linear sRGB working space) so a single MeshLambertMaterial({vertexColors:true}) draws a whole tree.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function toColor(c, out = new THREE.Color()) {
  if (c && c.isColor) return out.copy(c);
  if (Array.isArray(c)) return out.setRGB(c[0], c[1], c[2]);
  return out.set(c);
}

/** Paint a flat colour (or a vertical gradient bottom->top between y0..y1) into the vertex colours.  Returns geo. */
export function paint(geo, color, color2 = null, y0 = 0, y1 = 1) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const a = toColor(color, new THREE.Color());
  const b = color2 ? toColor(color2, new THREE.Color()) : a;
  for (let i = 0; i < n; i++) {
    if (color2) {
      const t = THREE.MathUtils.clamp((geo.attributes.position.getY(i) - y0) / (y1 - y0 || 1), 0, 1);
      _c.copy(a).lerp(b, t);
    } else _c.copy(a);
    arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Multiply existing vertex colours by a gradient (ambient-occlusion-ish darkening near y0, full brightness at y1). */
export function shadeBottom(geo, y0, y1, amount = 0.45) {
  const col = geo.attributes.color, pos = geo.attributes.position;
  for (let i = 0; i < col.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0 || 1), 0, 1);
    const k = 1 - amount * (1 - t) * (1 - t);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

/** Randomly displace vertices (shared vertices of indexed geometry move together => organic blobs / rocks). */
export function jitter(geo, amount, seed = 1, yScale = 1) {
  const rnd = mulberry32(seed);
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = map.get(key);
    if (!d) { d = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount * yScale, (rnd() - 0.5) * amount]; map.set(key, d); }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
  return geo;
}

/** Transform a geometry in place: position, euler rotation (radians), scale (number | [x,y,z]). */
export function xf(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  const sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ'));
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s.set(sc[0], sc[1], sc[2]));
  geo.applyMatrix4(_m);
  return geo;
}

/** Make attribute sets identical so mergeGeometries accepts any mix (position, normal, color, uv). */
function normalise(g, wantUV) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  if (!out.attributes.normal) out.computeVertexNormals();
  const n = out.attributes.position.count;
  if (!out.attributes.color) { out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
  if (wantUV && !out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!wantUV && out.attributes.uv) out.deleteAttribute('uv');
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) out.deleteAttribute(k);
  return out;
}

/** Merge parts (any indexed/non-indexed mix) into one non-indexed geometry with position/normal/color(/uv). */
export function merge(parts, { uv = false } = {}) {
  const list = parts.filter(Boolean).map((g) => normalise(g, uv));
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  parts.forEach((g) => g && g.dispose());
  return merged;
}

// ---- primitive factories (all return coloured, optionally transformed geometries) -------------------------------------
export function box(w, h, d, color, color2 = null, t = {}) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  paint(g, color, color2, 0, h);
  return xf(g, t);
}
/** Tapered cylinder, base at y=0. */
export function cyl(rTop, rBot, h, seg, color, color2 = null, t = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1); g.translate(0, h / 2, 0);
  paint(g, color, color2, 0, h);
  return xf(g, t);
}
export function cone(r, h, seg, color, color2 = null, t = {}) {
  const g = new THREE.ConeGeometry(r, h, seg, 1); g.translate(0, h / 2, 0);
  paint(g, color, color2, 0, h);
  return xf(g, t);
}
/** Icosphere blob centred at the origin (radius r), optional jitter (fraction of r) -> organic foliage / rocks. */
export function blob(r, detail, color, color2 = null, { jit = 0, seed = 1, squash = 1, ...t } = {}) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  if (jit) jitter(g, jit * r, seed);
  g.scale(1, squash, 1);
  paint(g, color, color2, -r * squash, r * squash);
  return xf(g, t);
}
export function sphere(r, ws, hs, color, color2 = null, t = {}) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  paint(g, color, color2, -r, r);
  return xf(g, t);
}
export function torus(r, tube, rs, ts, color, t = {}) {
  const g = new THREE.TorusGeometry(r, tube, rs, ts);
  paint(g, color);
  return xf(g, t);
}
export function plane(w, h, color, t = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  paint(g, color);
  return xf(g, t);
}
/** Lathe / revolve profile [[r,y],...] around Y. */
export function lathe(profile, seg, color, color2 = null, t = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  let y1 = 0; for (const [, y] of profile) y1 = Math.max(y1, y);
  paint(g, color, color2, 0, y1);
  return xf(g, t);
}

/** Extrude a closed 2D polygon [[x,y],...] along +Z by `depth` (centred), coloured. */
export function extrude(poly, depth, color, color2 = null, t = {}) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  let y0 = Infinity, y1 = -Infinity; for (const [, y] of poly) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  paint(g, color, color2, y0, y1);
  return xf(g, t);
}

/** Build an InstancedMesh-ready matrix from components (reused scratch objects: do not keep the returned reference). */
export function composeMatrix(x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  return _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Count triangles in a geometry (for budget logging). */
export const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
