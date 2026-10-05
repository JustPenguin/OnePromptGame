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

// Simple primitives are memoised per parameter set: kart builders create the same lug / spoke / bolt over and over.
// Callers must treat them as read-only (PartBuilder.add only reads them); use .clone() before mutating.
const memo = new Map();
const mk = (key, make) => {
  const k = key + '@' + DETAIL;
  let g = memo.get(k);
  if (!g) { if (memo.size > 600) memo.clear(); g = make(); memo.set(k, g); }
  return g;
};
/** Bevelled box. `r` = corner radius, `seg` = rounding segments (1 = 108 tris, 2 = 300 tris). */
export const rbox = (w, h, d, r = Math.min(w, h, d) * 0.3, seg = 1) => mk(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round(seg * (DETAIL > 0.7 ? 1 : 0.5))), Math.min(r, Math.min(w, h, d) * 0.5 - 1e-4)));
export const box = (w, h, d) => mk(`bx${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sph = (r = 0.5, ws = 16, hs = 10) => mk(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, sg(ws, 6), sg(hs, 4)));
export const cyl = (rt, rb, h, seg = 16) => mk(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, sg(seg, 5), 1));
export const cylOpen = (rt, rb, h, seg = 16) => mk(`co${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, sg(seg, 5), 1, true));
export const cone = (r, h, seg = 14) => mk(`cn${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, sg(seg, 5), 1));
export const capsule = (r, len, cs = 3, rs = 10) => mk(`cp${r},${len},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, len, Math.max(2, sg(cs, 2)), sg(rs, 6)));
export const torus = (R, r, rs = 8, ts = 22, arc = Math.PI * 2) => mk(`to${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, sg(rs, 4), sg(ts, 8), arc));
export const disc = (r, seg = 20) => mk(`di${r},${seg}`, () => new THREE.CircleGeometry(r, sg(seg, 5)));
export const plane = (w, h) => mk(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h));

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

// Parts that only exist at higher detail levels: tag -> minimum detail factor (LOD0 = 1, LOD1 = 0.5, LOD2 = 0.3).
const LOD_MIN = {
  spokes: 0.7, rivet: 0.7, whisker: 0.7, clamp: 0.7, band: 0.7, diffuser: 0.7, lights: 0.7, hub: 0.45, rim: 0.45, goggles: 0.45, lamp: 0.45,
  spring: 0.45, steer: 0.45, column: 0.45, filter: 0.45, pod: 0.45, lugs: 0.45, glow: 0.45, ant: 0.3, crest: 0.45, horn: 0.3,
};

export class PartBuilder {
  /** @param {Rig} rig  @param {{ao?: [number, number, number]}} [opts] ao = [y0, y1, minFactor]: darken vertices below y1 */
  constructor(rig, opts = {}) {
    this.rig = rig;
    this.ao = opts.ao ?? [0.02, 0.55, 0.62];
    this.cap = 8192;
    this.P = new Float32Array(this.cap * 3); this.N = new Float32Array(this.cap * 3); this.C = new Float32Array(this.cap * 3); this.R = new Float32Array(this.cap * 4);
    this.B = new Uint8Array(this.cap);
    this.I = new Uint32Array(this.cap * 6);
    this.n = 0; this.ni = 0; this.tris = 0;
    this.decalSpans = [];                // [startVertex, endVertex) of parts that receive livery decals (non-indexed triples)
    this.log = [];                       // [tag, triangles] per add(): lets tools rank the heaviest parts
  }

  _grow(nv, ni) {
    if (this.n + nv > this.cap) {
      let cap = this.cap; while (this.n + nv > cap) cap *= 2;
      const f = (a, k) => { const o = new Float32Array(cap * k); o.set(a.subarray(0, this.n * k)); return o; };
      this.P = f(this.P, 3); this.N = f(this.N, 3); this.C = f(this.C, 3); this.R = f(this.R, 4);
      const b = new Uint8Array(cap); b.set(this.B.subarray(0, this.n)); this.B = b;
      this.cap = cap;
    }
    if (this.ni + ni > this.I.length) {
      let len = this.I.length; while (this.ni + ni > len) len *= 2;
      const o = new Uint32Array(len); o.set(this.I.subarray(0, this.ni)); this.I = o;
    }
  }

  /**
   * Bake geometry `geo` into the kart.  Options:
   *   p [x,y,z]  r [rx,ry,rz] (XYZ euler, rad)  s number|[x,y,z]   or  m Matrix4
   *   c colour (default white)  cf (x,y,z,nx,ny,nz) => colour override per vertex (model space)
   *   rough (0.5) metal (0) emit (0) cc clearcoat mask (0)   ao 0..1 multiplier of the baked bottom-darkening (default 1)
   *   bone name   mirror true -> also add the X-mirrored copy (bound to `bm` or `bone`)   decal true -> receives livery decals
   *   tag  label for profiling; some tags are skipped on low-detail (LOD) builds
   */
  add(geo, o = {}) {
    const minD = o.tag !== undefined ? LOD_MIN[o.tag] : undefined;
    if (minD !== undefined && DETAIL < minD) { geo.dispose(); return this; }
    const decal = !!o.decal;
    const g = decal && geo.index ? geo.toNonIndexed() : geo;
    if (o.m) _m.copy(o.m);
    else {
      const r = o.r ?? [0, 0, 0];
      const s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
      const p = o.p ?? [0, 0, 0];
      _q.setFromEuler(_e.set(r[0], r[1], r[2], 'XYZ'));
      _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    }
    _nm.getNormalMatrix(_m);
    const me = _m.elements, ne = _nm.elements;
    const flip = _m.determinant() < 0;
    const boneA = this.rig.idx(o.bone ?? 'chassis');
    const boneB = o.mirror ? this.rig.idx(o.bm ?? o.bone ?? 'chassis') : 0;
    const base = toColor(o.c).clone();
    const rough = o.rough ?? 0.5, metal = o.metal ?? 0, emit = o.emit ?? 0, cc = o.cc ?? 0;
    const aoK = o.ao ?? 1;
    const cf = o.cf;
    const [ay0, ay1, amn] = this.ao;
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    const nv = g.attributes.position.count;
    const idx = g.index ? g.index.array : null;
    const triCount = idx ? idx.length / 3 : nv / 3;
    const copies = o.mirror ? 2 : 1;
    this._grow(nv * copies, triCount * 3 * copies);
    for (let c = 0; c < copies; c++) {
      const mir = c === 1;
      const bone = mir ? boneB : boneA;
      const v0 = this.n;
      for (let i = 0; i < nv; i++) {
        const px = pa[i * 3], py = pa[i * 3 + 1], pz = pa[i * 3 + 2];
        let x = me[0] * px + me[4] * py + me[8] * pz + me[12];
        const y = me[1] * px + me[5] * py + me[9] * pz + me[13];
        const z = me[2] * px + me[6] * py + me[10] * pz + me[14];
        const qx = na[i * 3], qy = na[i * 3 + 1], qz = na[i * 3 + 2];
        let nx = ne[0] * qx + ne[3] * qy + ne[6] * qz, ny = ne[1] * qx + ne[4] * qy + ne[7] * qz, nz = ne[2] * qx + ne[5] * qy + ne[8] * qz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        let cr = base.r, cg = base.g, cb = base.b;
        // (colour functions see the un-mirrored position so mirrored copies match their originals)
        if (cf) { const k = toColor(cf(x, y, z, nx, ny, nz)); cr = k.r; cg = k.g; cb = k.b; }
        if (mir) { x = -x; nx = -nx; }
        // baked ambient occlusion: darker toward the ground and on downward faces (skipped for emissive parts)
        let ao = 1;
        if (aoK > 0 && emit <= 0) {
          ao = 1 - (1 - (amn + (1 - amn) * smooth(ay0, ay1, y))) * aoK;
          ao *= 1 - 0.18 * Math.max(0, -ny) * aoK;
        }
        const j = v0 + i;
        const j3 = j * 3, j4 = j * 4;
        this.P[j3] = x; this.P[j3 + 1] = y; this.P[j3 + 2] = z;
        this.N[j3] = nx; this.N[j3 + 1] = ny; this.N[j3 + 2] = nz;
        this.C[j3] = cr * ao; this.C[j3 + 1] = cg * ao; this.C[j3 + 2] = cb * ao;
        this.R[j4] = rough; this.R[j4 + 1] = metal; this.R[j4 + 2] = emit; this.R[j4 + 3] = cc;
        this.B[j] = bone;
      }
      const rev = flip !== mir;
      const I = this.I;
      let k = this.ni;
      for (let t = 0; t < triCount; t++) {
        const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, cc2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
        I[k++] = v0 + a;
        I[k++] = v0 + (rev ? cc2 : b);
        I[k++] = v0 + (rev ? b : cc2);
      }
      this.ni = k;
      this.n += nv;
      if (decal) this.decalSpans.push([v0, v0 + nv]);
    }
    this.tris += triCount * copies;
    this.log.push([o.tag ?? o.bone ?? 'chassis', triCount * copies]);
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  /** Finish: one indexed BufferGeometry ready for a SkinnedMesh. */
  build() {
    const n = this.n;
    const P = this.P;
    // planar decal UVs, chosen per triangle by the dominant face-normal axis (decal parts are stored as vertex triples)
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = ATLAS.none.u; uv[i * 2 + 1] = ATLAS.none.v; }
    const [zMin, zMax] = ATLAS.z, [yMin, yMax] = ATLAS.y, [xMin, xMax] = ATLAS.x;
    for (const [s0, s1] of this.decalSpans) {
      for (let t = s0; t + 2 < s1; t += 3) {
        // tile by the average of the three vertex normals (correct for mirrored copies, whose index order is flipped)
        const Nn = this.N;
        const fx = (Nn[t * 3] + Nn[(t + 1) * 3] + Nn[(t + 2) * 3]) / 3, fy = (Nn[t * 3 + 1] + Nn[(t + 1) * 3 + 1] + Nn[(t + 2) * 3 + 1]) / 3;
        let tile = null;
        if (Math.abs(fx) > 0.55 && Math.abs(fx) >= Math.abs(fy)) tile = fx > 0 ? 'left' : 'right';
        else if (fy > 0.55) tile = 'top';
        if (!tile) continue;
        const T = ATLAS[tile];
        for (let k = 0; k < 3; k++) {
          const i = t + k;
          const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
          let a, b;
          if (tile === 'left') { a = (zMax - z) / (zMax - zMin); b = (y - yMin) / (yMax - yMin); }
          else if (tile === 'right') { a = (z - zMin) / (zMax - zMin); b = (y - yMin) / (yMax - yMin); }
          else { a = (xMax - x) / (xMax - xMin); b = (z - zMin) / (zMax - zMin); }
          a = Math.min(1, Math.max(0, a)); b = Math.min(1, Math.max(0, b));
          // inset so bilinear filtering never bleeds into the neighbouring tile
          uv[i * 2] = T.u0 + (0.004 + a * 0.992) * T.du; uv[i * 2 + 1] = T.v0 + (0.004 + b * 0.992) * T.dv;
        }
      }
    }
    const si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = this.B[i]; sw[i * 4] = 255; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3));
    g.setAttribute('aPbr', new THREE.BufferAttribute(this.R.slice(0, n * 4), 4));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
    const ind = this.I.subarray(0, this.ni);
    g.setIndex(n < 65535 ? new THREE.BufferAttribute(new Uint16Array(ind), 1) : new THREE.BufferAttribute(new Uint32Array(ind), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.triangles = this.ni / 3;
    g.userData.vertices = n;
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
