// Procedural geometry kit + PartBuilder. OWNER: Agent C (visuals).
//
// Every kart (body + driver + wheels) is authored as dozens of small parts (rounded boxes, lathes, tubes, lofts ...).
// PartBuilder bakes them into ONE non-indexed BufferGeometry with these per-vertex attributes:
//   position, normal, color (linear rgb, incl. baked AO), aPbr (roughness, metalness, emissive, clearcoat mask),
//   uv (planar decal-atlas projection chosen per triangle), skinIndex/skinWeight (rigid bind to ONE bone).
// So the whole kart renders in a single draw call with a single (patched) physical material - see kartMaterial.js.
//
// Conventions: model space is the kart's: +Z forward, +X is the kart's LEFT, Y up, origin on the ground under the
// kart centre.  Cylinders / capsules / lathes are built along +Y (like three.js) - rotate them with `r`.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;

// ------------------------------------------------------------------------------------------------ primitives
// Segment counts scale with a global detail factor (LOD variants rebuild the kart with a smaller one).
let DETAIL = 1;
export function setDetail(d) { DETAIL = d; }
export function getDetail() { return DETAIL; }
const sg = (n, min = 3) => Math.max(min, Math.round(n * DETAIL));

/** Bevelled box. `r` = corner radius, `seg` = rounding segments (1 = 108 tris, 2 = 300 tris). */
export const rbox = (w, h, d, r = Math.min(w, h, d) * 0.3, seg = 1) => new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round(seg * (DETAIL > 0.7 ? 1 : 0.5))), Math.min(r, Math.min(w, h, d) * 0.5 - 1e-4));
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const sph = (r = 0.5, ws = 16, hs = 10) => new THREE.SphereGeometry(r, sg(ws, 6), sg(hs, 4));
export const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, sg(seg, 5), 1);
export const cylOpen = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, sg(seg, 5), 1, true);
export const cone = (r, h, seg = 14) => new THREE.ConeGeometry(r, h, sg(seg, 5), 1);
export const capsule = (r, len, cs = 3, rs = 10) => new THREE.CapsuleGeometry(r, len, Math.max(2, sg(cs, 2)), sg(rs, 6));
export const torus = (R, r, rs = 8, ts = 22, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, sg(rs, 4), sg(ts, 8), arc);
export const disc = (r, seg = 20) => new THREE.CircleGeometry(r, sg(seg, 5));
export const plane = (w, h) => new THREE.PlaneGeometry(w, h);

/** Surface of revolution about +Y.  profile = [[radius, y], ...] ordered bottom -> top. */
export function lathe(profile, seg = 24) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), sg(seg, 6));
}

/** Smooth tube through points [[x,y,z],...] with round end caps. */
export function tube(points, r, { seg = 6, rs = 7, caps = true, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', tension);
  const t = new THREE.TubeGeometry(curve, Math.max(2, Math.round(seg * (points.length - 1) * DETAIL)), r, sg(rs, 4), false);
  if (!caps) return t;
  const a = new THREE.SphereGeometry(r, sg(rs, 4), 3).translate(points[0][0], points[0][1], points[0][2]);
  const b = new THREE.SphereGeometry(r, sg(rs, 4), 3).translate(points[points.length - 1][0], points[points.length - 1][1], points[points.length - 1][2]);
  const out = mergeGeometries([t.toNonIndexed(), a.toNonIndexed(), b.toNonIndexed()]);
  t.dispose(); a.dispose(); b.dispose();
  return out;
}

/**
 * Lofted solid along Z.  stations: [{ z, hw (half width), y0 (bottom), y1 (top), n (superellipse exponent: 2 = ellipse,
 * 4-8 = rounded rectangle), x (centre offset) }].  Smooth in section and along the length; both ends are capped flat.
 */
export function loft(stations, { m = 20 } = {}) {
  m = sg(m, 8);
  const S = stations.length;
  const pos = [];
  const idx = [];
  const ring = (st) => {
    const out = [];
    const n = st.n ?? 3;
    const cy = (st.y0 + st.y1) * 0.5, hh = Math.max(1e-4, (st.y1 - st.y0) * 0.5), hw = Math.max(1e-4, st.hw), cx = st.x ?? 0;
    for (let j = 0; j < m; j++) {
      const a = (j / m) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      out.push([cx + hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), st.z]);
    }
    return out;
  };
  const rings = stations.map(ring);
  for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
  // The ring runs counter-clockwise seen from +Z, so for stations ordered by increasing z the outward-facing
  // winding is (a, b, c); for decreasing z it is mirrored.  Caps follow the same rule.
  const asc = stations[S - 1].z >= stations[0].z;
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + ((j + 1) % m), c = (i + 1) * m + j, d = (i + 1) * m + ((j + 1) % m);
      if (asc) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // flat caps with their own vertices so the end faces keep a crisp normal; outZ = the +/-1 direction the cap faces
  const cap = (i, outZ) => {
    const base = pos.length / 3;
    const st = stations[i];
    for (const p of rings[i]) pos.push(p[0], p[1], p[2]);
    pos.push(st.x ?? 0, (st.y0 + st.y1) * 0.5, st.z);
    const ci = base + m;
    for (let j = 0; j < m; j++) { const a = base + j, b = base + ((j + 1) % m); if (outZ > 0) idx.push(ci, a, b); else idx.push(ci, b, a); }
  };
  cap(0, asc ? -1 : 1); cap(S - 1, asc ? 1 : -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Extruded closed 2D outline (points in the XY plane, extruded along +Z by `depth`, centred on z = 0) with a soft bevel. */
export function extrude(outline, depth, { bevel = 0.02, bs = 2, curve = 10 } = {}) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-3, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bs, curveSegments: curve });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}

/** Merge a list of geometries (made non-indexed) into one. */
export function mergeAll(list) {
  const out = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  list.forEach((g) => g.dispose());
  return out;
}

// ------------------------------------------------------------------------------------------------ skeleton layout
/**
 * Bone layout shared by bodies and drivers: names -> indices.  Pure data, instantiated per kart by KartVisuals.
 * Bones are authored with MODEL-SPACE bind positions (the same coordinates the geometry is built in); the rig converts them
 * to parent-local positions/rotations.  `aim` (a direction) gives the bone a rest rotation whose local +Y points along it
 * (limbs), which lets animation scale a limb along its own axis.
 */
export class Rig {
  constructor() { this.defs = []; this.index = new Map(); }
  /** @param {string} name  @param {string|null} parent  @param {number[]} pos model-space bind position  @param {{aim?: number[]}} [o] */
  add(name, parent = null, pos = [0, 0, 0], o = {}) {
    if (this.index.has(name)) return this.index.get(name);
    const i = this.defs.length;
    const pd = parent ? this.defs[this.index.get(parent)] : null;
    if (parent && !pd) throw new Error(`Rig: unknown parent "${parent}" for "${name}"`);
    const wq = new THREE.Quaternion();
    if (o.aim) wq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(o.aim[0], o.aim[1], o.aim[2]).normalize());
    const wpos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const lpos = wpos.clone();
    const lq = wq.clone();
    if (pd) {
      lpos.sub(pd.wpos).applyQuaternion(pd.wq.clone().invert());
      lq.premultiply(pd.wq.clone().invert());
    }
    this.defs.push({ name, parent, index: i, wpos, wq, pos: lpos.toArray(), quat: [lq.x, lq.y, lq.z, lq.w], world: [pos[0], pos[1], pos[2]] });
    this.index.set(name, i);
    return i;
  }
  has(name) { return this.index.has(name); }
  idx(name) {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`Rig: unknown bone "${name}"`);
    return i;
  }
}

// ------------------------------------------------------------------------------------------------ PartBuilder
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _nm = new THREE.Matrix3();
const _col = new THREE.Color();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Resolve any colour spec ('#rrggbb' | 0xrrggbb | THREE.Color | [r,g,b] sRGB 0-1) to a linear THREE.Color (shared scratch!). */
export function toColor(c, out = _col) {
  if (c === undefined || c === null) return out.setRGB(1, 1, 1);
  if (c.isColor) return out.copy(c);
  if (Array.isArray(c)) return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return out.set(c);
}
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a || 1))); return t * t * (3 - 2 * t); };

// Decal atlas layout (UV space, v up), canvas 1024x512: left flank (512x256), right flank below it, a tall "top" tile and a
// transparent "none" tile that everything else samples.  Model-space extents are projected onto the tiles.
export const ATLAS = {
  left:  { u0: 0.0, v0: 0.5, du: 0.5, dv: 0.5 },
  right: { u0: 0.0, v0: 0.0, du: 0.5, dv: 0.5 },
  top:   { u0: 0.5, v0: 0.0, du: 0.25, dv: 1.0 },
  none:  { u: 0.875, v: 0.5 },
  z: [-1.45, 1.45], y: [0.0, 1.1], x: [-1.0, 1.0],
};

export class PartBuilder {
  /** @param {Rig} rig  @param {{ao?: [number, number, number]}} [opts] ao = [y0, y1, minFactor]: darken vertices below y1 */
  constructor(rig, opts = {}) {
    this.rig = rig;
    this.ao = opts.ao ?? [0.02, 0.55, 0.62];
    this.P = []; this.N = []; this.C = []; this.R = []; this.B = []; this.D = []; // D = decal flag per vertex
    this.tris = 0;
    this.log = []; // [tag, triangles] per add(): lets tools rank the heaviest parts
  }

  /**
   * Bake geometry `geo` into the kart.  Options:
   *   p [x,y,z]  r [rx,ry,rz] (XYZ euler, rad)  s number|[x,y,z]   or  m Matrix4
   *   c colour (default white)  cf (x,y,z,nx,ny,nz) => colour override per vertex (model space)
   *   rough (0.5) metal (0) emit (0) cc clearcoat mask (0)   ao 0..1 multiplier of the baked bottom-darkening (default 1)
   *   bone name   mirror true -> also add the X-mirrored copy (bound to `bm` or `bone`)   decal true -> receives livery decals
   */
  add(geo, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pa = g.attributes.position, na = g.attributes.normal;
    if (o.m) _m.copy(o.m);
    else {
      const r = o.r ?? [0, 0, 0];
      const s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
      const p = o.p ?? [0, 0, 0];
      _q.setFromEuler(_e.set(r[0], r[1], r[2], 'XYZ'));
      _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    }
    _nm.getNormalMatrix(_m);
    const flip = _m.determinant() < 0;
    const boneA = this.rig.idx(o.bone ?? 'chassis');
    const boneB = o.mirror ? this.rig.idx(o.bm ?? o.bone ?? 'chassis') : 0;
    const base = toColor(o.c).clone();
    const rough = o.rough ?? 0.5, metal = o.metal ?? 0, emit = o.emit ?? 0, cc = o.cc ?? 0;
    const aoK = o.ao ?? 1;
    const decal = o.decal ? 1 : 0;
    const cf = o.cf;
    const n = pa.count;
    const tmpP = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const tmpN = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const cols = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) {
        tmpP[k].fromBufferAttribute(pa, i + k).applyMatrix4(_m);
        tmpN[k].fromBufferAttribute(na, i + k).applyMatrix3(_nm).normalize();
        if (cf) {
          const cc2 = cf(tmpP[k].x, tmpP[k].y, tmpP[k].z, tmpN[k].x, tmpN[k].y, tmpN[k].z);
          cols[k].copy(toColor(cc2));
        } else cols[k].copy(base);
      }
      this._emit(tmpP, tmpN, cols, flip, boneA, rough, metal, emit, cc, aoK, decal, false);
      if (o.mirror) this._emit(tmpP, tmpN, cols, flip, boneB, rough, metal, emit, cc, aoK, decal, true);
    }
    this.log.push([o.tag ?? o.bone ?? 'chassis', (n / 3) * (o.mirror ? 2 : 1)]);
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  _emit(P, N, C, flip, bone, rough, metal, emit, cc, aoK, decal, mirror) {
    const order = (flip !== mirror) ? [0, 2, 1] : [0, 1, 2];
    for (let q = 0; q < 3; q++) {
      const k = order[q];
      const x = mirror ? -P[k].x : P[k].x;
      const nx = mirror ? -N[k].x : N[k].x;
      this.P.push(x, P[k].y, P[k].z);
      this.N.push(nx, N[k].y, N[k].z);
      // baked ambient occlusion: darker toward the ground and on downward faces (skipped for emissive parts)
      let ao = 1;
      if (aoK > 0 && emit <= 0) {
        const [y0, y1, mn] = this.ao;
        ao = 1 - (1 - (mn + (1 - mn) * smooth(y0, y1, P[k].y))) * aoK;
        ao *= 1 - 0.18 * Math.max(0, -N[k].y) * aoK;
      }
      this.C.push(C[k].r * ao, C[k].g * ao, C[k].b * ao);
      this.R.push(rough, metal, emit, cc);
      this.B.push(bone);
      this.D.push(decal);
    }
    this.tris++;
  }

  /** Finish: one welded, indexed BufferGeometry ready for a SkinnedMesh. */
  build() {
    const n = this.P.length / 3;
    const P = this.P, N = this.N, C = this.C, R = this.R, Bn = this.B;
    // planar decal UVs, chosen per triangle by the dominant face-normal axis
    const uv = new Float32Array(n * 2);
    const [zMin, zMax] = ATLAS.z, [yMin, yMax] = ATLAS.y, [xMin, xMax] = ATLAS.x;
    for (let t = 0; t < n; t += 3) {
      let tile = null;
      if (this.D[t]) {
        const ax = P[(t + 1) * 3] - P[t * 3], ay = P[(t + 1) * 3 + 1] - P[t * 3 + 1], az = P[(t + 1) * 3 + 2] - P[t * 3 + 2];
        const bx = P[(t + 2) * 3] - P[t * 3], by = P[(t + 2) * 3 + 1] - P[t * 3 + 1], bz = P[(t + 2) * 3 + 2] - P[t * 3 + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1;
        const fx = nx / l, fy = ny / l;
        if (Math.abs(fx) > 0.55 && Math.abs(fx) >= Math.abs(fy)) tile = fx > 0 ? 'left' : 'right';
        else if (fy > 0.55) tile = 'top';
      }
      for (let k = 0; k < 3; k++) {
        const i = t + k;
        let u = ATLAS.none.u, v = ATLAS.none.v;
        if (tile) {
          const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
          const T = ATLAS[tile];
          let a, b;
          if (tile === 'left') { a = (zMax - z) / (zMax - zMin); b = (y - yMin) / (yMax - yMin); }
          else if (tile === 'right') { a = (z - zMin) / (zMax - zMin); b = (y - yMin) / (yMax - yMin); }
          else { a = (xMax - x) / (xMax - xMin); b = (z - zMin) / (zMax - zMin); }
          a = Math.min(1, Math.max(0, a)); b = Math.min(1, Math.max(0, b));
          // inset so bilinear filtering never bleeds into the neighbouring tile
          u = T.u0 + (0.004 + a * 0.992) * T.du; v = T.v0 + (0.004 + b * 0.992) * T.dv;
        }
        uv[i * 2] = u; uv[i * 2 + 1] = v;
      }
    }
    // ---- weld identical vertices (quantised) -> indexed geometry
    const Q = 19;
    const key = new Int32Array(n * Q);
    const buckets = new Map();
    const remap = new Uint32Array(n);
    const keep = [];
    for (let i = 0; i < n; i++) {
      const o = i * Q;
      key[o] = Math.round(P[i * 3] * 2000); key[o + 1] = Math.round(P[i * 3 + 1] * 2000); key[o + 2] = Math.round(P[i * 3 + 2] * 2000);
      key[o + 3] = Math.round(N[i * 3] * 90); key[o + 4] = Math.round(N[i * 3 + 1] * 90); key[o + 5] = Math.round(N[i * 3 + 2] * 90);
      key[o + 6] = Math.round(C[i * 3] * 300); key[o + 7] = Math.round(C[i * 3 + 1] * 300); key[o + 8] = Math.round(C[i * 3 + 2] * 300);
      key[o + 9] = Math.round(R[i * 4] * 60); key[o + 10] = Math.round(R[i * 4 + 1] * 60); key[o + 11] = Math.round(R[i * 4 + 2] * 20); key[o + 12] = Math.round(R[i * 4 + 3] * 20);
      key[o + 13] = Math.round(uv[i * 2] * 3000); key[o + 14] = Math.round(uv[i * 2 + 1] * 3000);
      key[o + 15] = Bn[i];
      let h = 2166136261;
      for (let q = 0; q < 16; q++) { h ^= key[o + q]; h = Math.imul(h, 16777619); }
      let list = buckets.get(h);
      let found = -1;
      if (list) {
        for (let j = 0; j < list.length; j++) {
          const c = list[j] * Q;
          let same = true;
          for (let q = 0; q < 16; q++) if (key[c + q] !== key[o + q]) { same = false; break; }
          if (same) { found = list[j]; break; }
        }
      } else { list = []; buckets.set(h, list); }
      if (found < 0) { list.push(i); remap[i] = keep.length; keep.push(i); } else remap[i] = remap[found];
    }
    const m = keep.length;
    const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), pbr = new Float32Array(m * 4), uvs = new Float32Array(m * 2);
    const si = new Uint8Array(m * 4), sw = new Uint8Array(m * 4);
    for (let j = 0; j < m; j++) {
      const i = keep[j];
      pos[j * 3] = P[i * 3]; pos[j * 3 + 1] = P[i * 3 + 1]; pos[j * 3 + 2] = P[i * 3 + 2];
      nor[j * 3] = N[i * 3]; nor[j * 3 + 1] = N[i * 3 + 1]; nor[j * 3 + 2] = N[i * 3 + 2];
      col[j * 3] = C[i * 3]; col[j * 3 + 1] = C[i * 3 + 1]; col[j * 3 + 2] = C[i * 3 + 2];
      pbr[j * 4] = R[i * 4]; pbr[j * 4 + 1] = R[i * 4 + 1]; pbr[j * 4 + 2] = R[i * 4 + 2]; pbr[j * 4 + 3] = R[i * 4 + 3];
      uvs[j * 2] = uv[i * 2]; uvs[j * 2 + 1] = uv[i * 2 + 1];
      si[j * 4] = Bn[i]; sw[j * 4] = 255;
    }
    const idxArr = [];
    for (let t = 0; t < n; t += 3) {
      const a = remap[t], b = remap[t + 1], c = remap[t + 2];
      if (a === b || b === c || a === c) continue;
      idxArr.push(a, b, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
    g.setIndex(m < 65535 ? new THREE.Uint16BufferAttribute(idxArr, 1) : new THREE.Uint32BufferAttribute(idxArr, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.triangles = idxArr.length / 3;
    g.userData.vertices = m;
    g.userData.rawTriangles = this.tris;
    g.userData.log = this.log;
    return g;
  }
}

/** Convenience: colour gradient along Y inside a part: cf factory blending two colours between y0 and y1. */
export function gradY(c0, c1, y0, y1) {
  const a = toColor(c0).clone(), b = toColor(c1).clone();
  const out = new THREE.Color();
  return (x, y) => out.copy(a).lerp(b, smooth(y0, y1, y));
}
/** cf factory: `c1` where predicate(x,y,z,nx,ny,nz) is true else `c0` (hard edge - use for stripes / pupils on dense meshes). */
export function maskColor(c0, c1, pred) {
  const a = toColor(c0).clone(), b = toColor(c1).clone();
  return (x, y, z, nx, ny, nz) => (pred(x, y, z, nx, ny, nz) ? b : a);
}
export { smooth as smoothstep };
