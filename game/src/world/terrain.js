// Terrain: a real ground mesh that follows the road's elevation and blends from the shoulder out into themed hills.
// OWNER: Agent B.
//
//   height(x,z) = blend( graded road plane  <->  natural terrain(x,z) )
//     inside the corridor (road + curb + shoulder) the ground IS the road plane (minus a small sink so it never pokes through
//     the ribbons); beyond it, it eases into `cfg.natural(x, z, ctx)` over `blend` metres.  Stretches flagged `free`
//     (bridges, viaducts) are not graded: the natural ground (stream bed, street level) shows through, clamped to stay
//     `clearance` metres below the deck.
//   An inner fine grid covers the circuit (+margin); a coarse outer ring runs to the horizon (hidden by fog).
//
// The same height function drives prop placement (props sit exactly on the ground) and the water bodies.
import * as THREE from 'three';

const _tmpC = new THREE.Color();

// ------------------------------------------------------------------------------------------------------------------
/** Spatial index over the centreline samples: nearest-road queries (plan distance, lateral, plane height) + a coarse distance field. */
export class RoadIndex {
  constructor(track, cell = 24) {
    this.track = track;
    this.cell = cell;
    this.inv = 1 / cell;
    const N = track.count, inv = this.inv, bd = track.bounds;
    // flat uniform grid (counting sort of the centreline samples into cells): no Map lookups / array allocations in the hot query path
    this.gx0 = Math.floor(bd.minX * inv) - 4; this.gz0 = Math.floor(bd.minZ * inv) - 4;
    this.gnx = Math.floor(bd.maxX * inv) + 5 - this.gx0 + 1; this.gnz = Math.floor(bd.maxZ * inv) + 5 - this.gz0 + 1;
    const cells = this.gnx * this.gnz;
    this.start = new Int32Array(cells + 1);
    const cellOf = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const c = (Math.floor(track.pos[i * 3 + 2] * inv) - this.gz0) * this.gnx + (Math.floor(track.pos[i * 3] * inv) - this.gx0);
      cellOf[i] = c; this.start[c + 1]++;
    }
    for (let c = 0; c < cells; c++) this.start[c + 1] += this.start[c];
    this.items = new Int32Array(N);
    const fill = this.start.slice(0, cells);
    for (let i = 0; i < N; i++) this.items[fill[cellOf[i]]++] = i;
    this.free = new Float32Array(N); // 1 = road is on a structure here (not graded); smoothed
    this.out = { i: 0, t: 0, s: 0, dist: 1e9, lateral: 0, planeY: 0, cy: 0, hw: 8, sh: 6, free: 0, near: false };
    this.df = null;
    this._segD = 0; this._segT = 0;
  }

  /** Mark s ranges [{s0,s1,fade}] as "free" (not graded): 1 inside, easing to 0 over `fade` metres outside. */
  setFreeSections(ranges) {
    const tr = this.track, N = tr.count, L = tr.length;
    this.free.fill(0);
    for (const r of ranges ?? []) {
      const fade = r.fade ?? 20;
      for (let i = 0; i < N; i++) {
        const s = i * tr.spacing;
        let d = 0;
        const a = ((s - r.s0) % L + L) % L, len = r.s1 - r.s0;
        if (a <= len) d = 0; else d = Math.min(a - len, L - a);
        const w = d >= fade ? 0 : 1 - smooth(d / fade);
        if (w > this.free[i]) this.free[i] = w;
      }
    }
  }

  /** Squared plan distance from (x,z) to segment j (leaves the segment parameter in this._segT). */
  _seg(j, x, z) {
    const tr = this.track, P = tr.pos, N = tr.count, a = j * 3, b = ((j + 1) % N) * 3;
    const abx = P[b] - P[a], abz = P[b + 2] - P[a + 2];
    const t = Math.min(1, Math.max(0, ((x - P[a]) * abx + (z - P[a + 2]) * abz) / (abx * abx + abz * abz || 1)));
    const qx = P[a] + abx * t - x, qz = P[a + 2] + abz * t - z;
    this._segT = t;
    return qx * qx + qz * qz;
  }

  /** Nearest road under (x,z) in plan.  Returns the shared `out` object (do not keep). `near` is false when nothing is within ~70 m. */
  query(x, z, o = this.out) {
    const tr = this.track, P = tr.pos, inv = this.inv, st = this.start, items = this.items, gnx = this.gnx, gnz = this.gnz;
    const cx = Math.floor(x * inv) - this.gx0, cz = Math.floor(z * inv) - this.gz0;
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 3 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        const zz = cz + dz;
        if (zz < 0 || zz >= gnz) continue;
        const step = (r > 1 && dz !== -r && dz !== r) ? 2 * r : 1;           // ring only: interior rows touch just the two end cells
        for (let dx = -r; dx <= r; dx += step) {
          const xx = cx + dx;
          if (xx < 0 || xx >= gnx) continue;
          const c = zz * gnx + xx;
          for (let k = st[c], e = st[c + 1]; k < e; k++) {
            const i = items[k], ex = x - P[i * 3], ez = z - P[i * 3 + 2], d2 = ex * ex + ez * ez;
            if (d2 < bd) { bd = d2; best = i; }
          }
        }
      }
    }
    if (best < 0) { o.near = false; o.dist = this.farDist(x, z); o.cy = this.farRef(x, z); o.free = 0; return o; }
    // lower-road-wins at crossings: among samples on a DIFFERENT stretch (> 40 m of track away) within 6 m of the best, take the lowest
    const N = tr.count, sp = tr.spacing, d0 = Math.sqrt(bd), lim = (d0 + 6) * (d0 + 6);
    let pick = best, py = P[best * 3 + 1];
    for (let dz = -1; dz <= 1; dz++) {
      const zz = cz + dz;
      if (zz < 0 || zz >= gnz) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= gnx) continue;
        const c = zz * gnx + xx;
        for (let k = st[c], e = st[c + 1]; k < e; k++) {
          const i = items[k], ds = Math.abs(i - best), sep = Math.min(ds, N - ds) * sp;
          if (sep < 40) continue;
          const ex = x - P[i * 3], ez = z - P[i * 3 + 2];
          if (ex * ex + ez * ez <= lim && P[i * 3 + 1] < py - 1) { pick = i; py = P[i * 3 + 1]; }
        }
      }
    }
    best = pick;
    // refine on the neighbouring segments (same maths as track.project, in plan)
    const j0 = (best - 1 + N) % N;
    const d0s = this._seg(j0, x, z), t0 = this._segT;
    const d1s = this._seg(best, x, z), t1 = this._segT;
    const j = d0s < d1s ? j0 : best, t = d0s < d1s ? t0 : t1;
    const j2 = (j + 1) % N, a = j * 3, b = j2 * 3;
    const lx = P[a] + (P[b] - P[a]) * t, ly = P[a + 1] + (P[b + 1] - P[a + 1]) * t, lz = P[a + 2] + (P[b + 2] - P[a + 2]) * t;
    const R = tr.right;
    let rx = R[a] + (R[b] - R[a]) * t, ry = R[a + 1] + (R[b + 1] - R[a + 1]) * t, rz = R[a + 2] + (R[b + 2] - R[a + 2]) * t;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const rxz = rx * rx + rz * rz || 1;
    const lateral = ((x - lx) * rx + (z - lz) * rz) / rxz;
    o.near = true;
    o.i = j; o.t = t; o.s = (j + t) * sp;
    o.dist = Math.hypot(x - lx, z - lz);
    o.lateral = lateral;
    o.planeY = ly + ry * lateral;
    o.cy = ly;
    o.hw = tr.hw[j] + (tr.hw[j2] - tr.hw[j]) * t;
    o.sh = tr.shoulderW[j] + (tr.shoulderW[j2] - tr.shoulderW[j]) * t;
    o.free = this.free[j] + (this.free[j2] - this.free[j]) * t;
    return o;
  }

  /** Coarse distance-to-road field (bilinear) for far queries; also propagates the nearest road's centreline height ("reference height"). */
  buildDistanceField(bounds, margin = 1600, cell = 24) {
    const x0 = bounds.minX - margin, z0 = bounds.minZ - margin;
    const nx = Math.ceil((bounds.maxX - bounds.minX + margin * 2) / cell) + 1, nz = Math.ceil((bounds.maxZ - bounds.minZ + margin * 2) / cell) + 1;
    const d = new Float32Array(nx * nz).fill(1e9);
    const y = new Float32Array(nx * nz);
    const tr = this.track;
    for (let i = 0; i < tr.count; i++) {
      const gx = Math.round((tr.pos[i * 3] - x0) / cell), gz = Math.round((tr.pos[i * 3 + 2] - z0) / cell);
      const k = gz * nx + gx;
      if (d[k] > 0) { d[k] = 0; y[k] = tr.pos[i * 3 + 1]; } else y[k] = (y[k] + tr.pos[i * 3 + 1]) / 2;
    }
    // two-pass chamfer (distance + nearest-source height)
    const a = cell, b = cell * 1.4142;
    const relax = (k, kn, w) => { const v = d[kn] + w; if (v < d[k]) { d[k] = v; y[k] = y[kn]; } };
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const k = z * nx + x;
      if (x > 0) relax(k, k - 1, a);
      if (z > 0) { relax(k, k - nx, a); if (x > 0) relax(k, k - nx - 1, b); if (x < nx - 1) relax(k, k - nx + 1, b); }
    }
    for (let z = nz - 1; z >= 0; z--) for (let x = nx - 1; x >= 0; x--) {
      const k = z * nx + x;
      if (x < nx - 1) relax(k, k + 1, a);
      if (z < nz - 1) { relax(k, k + nx, a); if (x < nx - 1) relax(k, k + nx + 1, b); if (x > 0) relax(k, k + nx - 1, b); }
    }
    // blur the reference height so the medial-axis creases between far-apart road sections disappear
    let src = y;
    for (let pass = 0; pass < 6; pass++) {
      const dst = new Float32Array(nx * nz);
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
        let sum = 0, c = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) continue; sum += src[zz * nx + xx]; c++; }
        dst[z * nx + x] = sum / c;
      }
      src = dst;
    }
    this.df = { d, y: src, nx, nz, x0, z0, cell };
  }
  _bilerp(arr, x, z) {
    const f = this.df;
    const u = (x - f.x0) / f.cell, v = (z - f.z0) / f.cell;
    const ix = Math.min(f.nx - 2, Math.max(0, Math.floor(u))), iz = Math.min(f.nz - 2, Math.max(0, Math.floor(v)));
    const fx = Math.min(1, Math.max(0, u - ix)), fz = Math.min(1, Math.max(0, v - iz));
    const i = iz * f.nx + ix;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fz) + (arr[i + f.nx] * (1 - fx) + arr[i + f.nx + 1] * fx) * fz;
  }
  farDist(x, z) { return this.df ? this._bilerp(this.df.d, x, z) : 400; }
  /** Smoothed height of the road "region" around (x,z): the terrain's reference level far from the road. */
  farRef(x, z) { return this.df ? this._bilerp(this.df.y, x, z) : 0; }
}

const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------------------------
export class Terrain {
  /**
   * cfg = {
   *   natural(x, z, ctx) -> world Y of the un-graded ground.  ctx = { dist (plan distance to the road), noise, road }
   *   color(x, z, y, slope01, ctx, out:THREE.Color)       vertex colour (default: flat `base`)
   *   base: '#5da13a', blend: 40 (m to ease from the road corridor into natural ground), sink: 0.35, clearance: 3,
   *   cell: 5, margin: 130, outerCell: 48, outerMargin: 1500, tile: 32 (cells per chunk side),
   *   uvMeters: 10,  map, map2 (textures), roughness...
   *   free: [{s0,s1,fade}]   un-graded stretches (bridges / viaducts)
   * }
   */
  constructor(world, cfg) {
    this.world = world;
    this.track = world.track;
    this.cfg = cfg;
    this.noise = world.noise;
    this.road = world.road;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.tiles = [];
    this._q = null;
    this._ctx = { dist: 0, noise: this.noise, road: this.road, q: null };
    this.carvers = [];       // fn(x,z,nat)->nat modifiers (water beds, chasms...) applied to the natural ground before road grading
    // the distance / reference-height field must exist before the first heightAt() call (recipes scatter props immediately)
    this.road.buildDistanceField(this.track.bounds, cfg.outerMargin ?? 1500, 24);
  }

  /** Final ground height at (x,z). */
  heightAt(x, z) {
    const cfg = this.cfg, q = this.road.query(x, z);
    const ctx = this._ctx; ctx.dist = q.dist; ctx.q = q;
    ctx.refY = this.refAt(q, x, z);
    let nat = cfg.natural(x, z, ctx);
    for (let i = 0; i < this.carvers.length; i++) nat = this.carvers[i](x, z, nat);
    if (!q.near) return nat;
    const edge = q.hw + q.sh + (cfg.curb ?? 1);
    const dd = Math.max(0, Math.abs(q.lateral) - edge);
    const bl = typeof cfg.blend === 'function' ? cfg.blend(q) : (cfg.blend ?? 40);
    const w = smooth(dd / bl);
    const hRoad = q.planeY - (cfg.sink ?? 0.35);
    let hCorr = hRoad;
    if (q.free > 0) {
      const hFree = Math.min(nat, q.planeY - (cfg.clearance ?? 3));
      hCorr = hRoad + (hFree - hRoad) * q.free;
    }
    return hCorr + (nat - hCorr) * w;
  }

  /** Reference level for natural terrain: the road's centreline height when close, the smoothed regional height when far. */
  refAt(q, x, z) {
    const far = this.road.farRef(x, z);
    if (!q.near) return far;
    const w = smooth((q.dist - 30) / 80);
    return q.cy + (far - q.cy) * w;
  }

  /** Surface normal from finite differences (allocation-free into `out`). */
  normalAt(x, z, out, e = 2) {
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z), hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // ---- height grid + mesh -------------------------------------------------------------------------------------------
  /** (Re)compute the fine height grid. Cheap to call repeatedly: it only recomputes after a carver was added. */
  ensureGrid() {
    if (this.H) return;
    const tg = performance.now();
    const cfg = this.cfg, tr = this.track, quality = this.world.quality;
    const lowQ = quality?.id === 'low';
    const cell = (cfg.cell ?? 5) * (lowQ ? 1.6 : quality?.id === 'ultra' ? 0.85 : 1);
    const margin = cfg.margin ?? 130;
    const b = tr.bounds;
    const x0 = Math.floor((b.minX - margin) / cell) * cell, z0 = Math.floor((b.minZ - margin) / cell) * cell;
    const ALIGN = 8; // the coarse ring uses cells of ALIGN x the fine cell and shares the fine grid's boundary lines exactly
    const nx = Math.ceil(Math.ceil((b.maxX + margin - x0) / cell) / ALIGN) * ALIGN, nz = Math.ceil(Math.ceil((b.maxZ + margin - z0) / cell) / ALIGN) * ALIGN;
    this.inner = { x0, z0, nx, nz, cell, x1: x0 + nx * cell, z1: z0 + nz * cell, ALIGN };
    const VX = nx + 1, VZ = nz + 1;
    const H = new Float32Array(VX * VZ);
    const C = new Uint8Array(VX * VZ); // 1 = deep inside the road corridor (cells fully inside are skipped)
    const Dg = new Float32Array(VX * VZ), Rg = new Float32Array(VX * VZ);   // per-vertex plan distance to the road + reference height (reused for vertex colours)
    for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) {
      const x = x0 + i * cell, z = z0 + j * cell, k = j * VX + i;
      H[k] = this.heightAt(x, z);
      const q = this.road.out;
      Dg[k] = this._ctx.dist; Rg[k] = this._ctx.refY;
      C[k] = q.near && Math.abs(q.lateral) < q.hw + q.sh - 1.2 && q.free < 0.01 ? 1 : 0;
    }
    this.H = H; this.C = C; this.Dg = Dg; this.Rg = Rg; this.VX = VX; this.VZ = VZ;
    this.gridMs = (this.gridMs ?? 0) + performance.now() - tg;
  }

  addCarver(fn) { this.carvers.push(fn); this.H = null; }

  /** Height of the RENDERED mesh at (x,z) (exact triangle interpolation inside the fine grid, analytic outside). */
  meshHeightAt(x, z) {
    this.ensureGrid();
    const g = this.inner, VX = this.VX, H = this.H;
    const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
    if (fx < 0 || fz < 0 || fx >= g.nx || fz >= g.nz) return this.heightAt(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const ha = H[j * VX + i], hb = H[j * VX + i + 1], hc = H[(j + 1) * VX + i], hd = H[(j + 1) * VX + i + 1];
    if ((i + j) & 1) { // diagonal b-c : triangles (a,c,b) and (b,c,d)
      return u + v <= 1 ? ha + (hb - ha) * u + (hc - ha) * v : hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
    }
    // diagonal a-d : triangles (a,c,d) and (a,d,b)
    return v >= u ? ha + (hd - hc) * u + (hc - ha) * v : ha + (hb - ha) * u + (hd - hb) * v;
  }

  build(quality) {
    const cfg = this.cfg;
    this.ensureGrid();
    const { x0, z0, nx, nz, cell, ALIGN } = this.inner;
    const H = this.H, C = this.C, VX = this.VX, VZ = this.VZ;
    // chunked tiles
    const tile = cfg.tile ?? 32;
    const mat = this.material = makeTerrainMaterial(cfg);
    for (let tz = 0; tz < nz; tz += tile) for (let tx = 0; tx < nx; tx += tile) {
      const cx = Math.min(tile, nx - tx), cz = Math.min(tile, nz - tz);
      const g = this._tileGeometry(H, C, VX, tx, tz, cx, cz, x0, z0, cell, true);
      if (!g) continue;
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.userData.tile = true;
      this.group.add(m); this.tiles.push(m);
    }

    // skirt: a vertical curtain around the fine grid so the T-junction cracks against the coarse ring never show the sky
    this._addSkirt(H, VX, VZ, x0, z0, cell, mat);

    // outer coarse ring to the horizon: cells of 8x the fine cell on lines shared with the fine grid; cells fully inside the fine
    // grid are dropped, the skirt hides the T-junction cracks along the shared boundary
    const b = this.track.bounds;
    const oc = cell * ALIGN, K = Math.ceil((cfg.outerMargin ?? 1500) / oc);
    const ox0 = x0 - K * oc, oz0 = z0 - K * oc;
    const onx = nx / ALIGN + 2 * K, onz = nz / ALIGN + 2 * K;
    const OX = onx + 1, OZ = onz + 1;
    const OH = new Float32Array(OX * OZ), OD = new Float32Array(OX * OZ), OR = new Float32Array(OX * OZ);
    for (let j = 0; j < OZ; j++) for (let i = 0; i < OX; i++) { const k = j * OX + i; OH[k] = this.heightAt(ox0 + i * oc, oz0 + j * oc); OD[k] = this._ctx.dist; OR[k] = this._ctx.refY; }
    this.OD = OD; this.OR = OR;
    const otile = 16;
    for (let tz = 0; tz < onz; tz += otile) for (let tx = 0; tx < onx; tx += otile) {
      const cx = Math.min(otile, onx - tx), cz = Math.min(otile, onz - tz);
      const g = this._outerGeometry(OH, OX, tx, tz, cx, cz, ox0, oz0, oc);
      if (!g) continue;
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      m.userData.outer = true;
      this.group.add(m); this.tiles.push(m);
    }
    return this;
  }

  _addSkirt(H, VX, VZ, x0, z0, cell, mat) {
    const per = [];
    for (let i = 0; i < VX; i++) per.push([i, 0]);
    for (let j = 1; j < VZ; j++) per.push([VX - 1, j]);
    for (let i = VX - 2; i >= 0; i--) per.push([i, VZ - 1]);
    for (let j = VZ - 2; j >= 1; j--) per.push([0, j]);
    const n = per.length;
    const pos = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), nrm = new Float32Array(n * 2 * 3);
    const drop = 40;
    per.forEach(([i, j], k) => {
      const x = x0 + i * cell, z = z0 + j * cell, y = H[j * VX + i];
      this._colorFrom(this.Dg[j * VX + i], this.Rg[j * VX + i], x, z, y, 0.9, _tmpC);
      const o = k * 6;
      pos[o] = x; pos[o + 1] = y + 0.2; pos[o + 2] = z; pos[o + 3] = x; pos[o + 4] = y - drop; pos[o + 5] = z;
      col[o] = _tmpC.r * 0.85; col[o + 1] = _tmpC.g * 0.85; col[o + 2] = _tmpC.b * 0.85; col[o + 3] = _tmpC.r * 0.5; col[o + 4] = _tmpC.g * 0.5; col[o + 5] = _tmpC.b * 0.5;
      nrm[o + 1] = 1; nrm[o + 4] = 1;
    });
    const idx = [];
    for (let k = 0; k < n; k++) { const a = k * 2, b = ((k + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.userData.skirt = true;
    this.group.add(m); this.skirt = m;
  }

  /** Vertex colour from precomputed per-vertex data (dist, refY): no road query. */
  _colorFrom(dist, refY, x, z, y, ny, out) {
    const cfg = this.cfg;
    this._ctx.dist = dist; this._ctx.refY = refY; this._ctx.q = this.road.out;
    if (cfg.color) cfg.color(x, z, y, ny, this._ctx, out); else out.set(cfg.base ?? '#5da13a');
    return out;
  }

  _vertexColor(x, z, y, ny, out) {
    const cfg = this.cfg;
    const q = this.road.query(x, z);
    this._ctx.dist = q.dist; this._ctx.q = q; this._ctx.refY = this.refAt(q, x, z);
    if (cfg.color) cfg.color(x, z, y, ny, this._ctx, out); else out.set(cfg.base ?? '#5da13a');
    return out;
  }

  _tileGeometry(H, C, VX, tx, tz, cx, cz, x0, z0, cell, withSkirt) {
    const nv = (cx + 1) * (cz + 1);
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const uvm = 1 / (this.cfg.uvMeters ?? 10);
    const VZ = this.VZ;
    let p = 0, u = 0;
    for (let j = 0; j <= cz; j++) for (let i = 0; i <= cx; i++) {
      const gi = tx + i, gj = tz + j;
      const x = x0 + gi * cell, z = z0 + gj * cell, y = H[gj * VX + gi];
      // normal from the global grid so tile borders shade seamlessly
      const hl = H[gj * VX + Math.max(0, gi - 1)], hr = H[gj * VX + Math.min(VX - 1, gi + 1)];
      const hd = H[Math.max(0, gj - 1) * VX + gi], hu = H[Math.min(VZ - 1, gj + 1) * VX + gi];
      const nx_ = hl - hr, nz_ = hd - hu, ny_ = 2 * cell;
      const il = 1 / Math.hypot(nx_, ny_, nz_);
      pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
      nrm[p] = nx_ * il; nrm[p + 1] = ny_ * il; nrm[p + 2] = nz_ * il;
      this._colorFrom(this.Dg[gj * VX + gi], this.Rg[gj * VX + gi], x, z, y, nrm[p + 1], _tmpC);
      col[p] = _tmpC.r; col[p + 1] = _tmpC.g; col[p + 2] = _tmpC.b;
      uv[u++] = x * uvm; uv[u++] = z * uvm;
      p += 3;
    }
    const idx = [];
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      const gi = tx + i, gj = tz + j;
      // skip cells hidden under the road corridor
      if (C[gj * VX + gi] && C[gj * VX + gi + 1] && C[(gj + 1) * VX + gi] && C[(gj + 1) * VX + gi + 1]) continue;
      const a = j * (cx + 1) + i, b = a + 1, c = a + cx + 1, d = c + 1;
      // alternate the diagonal for a less regular facet pattern
      if ((gi + gj) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  _outerGeometry(OH, OX, tx, tz, cx, cz, x0, z0, cell) {
    const inn = this.inner;
    const nv = (cx + 1) * (cz + 1);
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const uvm = 1 / (this.cfg.uvMeters ?? 10) * 0.5;
    const OZ = OH.length / OX;
    let p = 0, u = 0;
    for (let j = 0; j <= cz; j++) for (let i = 0; i <= cx; i++) {
      const gi = tx + i, gj = tz + j;
      const x = x0 + gi * cell, z = z0 + gj * cell, y = OH[gj * OX + gi];
      const hl = OH[gj * OX + Math.max(0, gi - 1)], hr = OH[gj * OX + Math.min(OX - 1, gi + 1)];
      const hd = OH[Math.max(0, gj - 1) * OX + gi], hu = OH[Math.min(OZ - 1, gj + 1) * OX + gi];
      const nx_ = hl - hr, nz_ = hd - hu, ny_ = 2 * cell, il = 1 / Math.hypot(nx_, ny_, nz_);
      pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
      nrm[p] = nx_ * il; nrm[p + 1] = ny_ * il; nrm[p + 2] = nz_ * il;
      this._colorFrom(this.OD[gj * OX + gi], this.OR[gj * OX + gi], x, z, y, nrm[p + 1], _tmpC);
      col[p] = _tmpC.r; col[p + 1] = _tmpC.g; col[p + 2] = _tmpC.b;
      uv[u++] = x * uvm; uv[u++] = z * uvm;
      p += 3;
    }
    const idx = [];
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      const x = x0 + (tx + i) * cell, z = z0 + (tz + j) * cell;
      // drop cells fully covered by the fine inner grid (the shared boundary lines are aligned, so no partial overlaps exist)
      if (x >= inn.x0 - 1e-3 && x + cell <= inn.x1 + 1e-3 && z >= inn.z0 - 1e-3 && z + cell <= inn.z1 + 1e-3) continue;
      const a = j * (cx + 1) + i, b = a + 1, c = a + cx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /** Distance culling of tiles (cheap, no allocation). */
  cull(camPos, drawDistance) {
    for (let i = 0; i < this.tiles.length; i++) {
      const m = this.tiles[i], bs = m.geometry.boundingSphere;
      const dx = bs.center.x - camPos.x, dz = bs.center.z - camPos.z, r = bs.radius + drawDistance;
      m.visible = m.userData.outer ? true : dx * dx + dz * dz < r * r;
    }
  }

  /** Debug: max amount the terrain pokes ABOVE the road plane inside the corridor (should be <= 0). */
  verifyBelowRoad(samples = 6000) {
    const tr = this.track; let worst = -Infinity, at = null;
    for (let k = 0; k < samples; k++) {
      const s = (k * 37.17) % tr.length, l = ((k * 13.7) % 1) * 2 - 1;
      const smp = tr.sampleAt(s);
      const lat = l * (smp.halfWidth + smp.shoulder);
      const p = tr.pointAt(s, lat);
      const h = this.heightAt(p.x, p.z);
      const over = h - p.y;
      if (this.road.out.free < 0.01 && over > worst) { worst = over; at = { s, lat, over }; }
    }
    return { worst, at };
  }

  dispose() {
    for (const m of this.tiles) m.geometry.dispose();
    if (this.skirt) { this.skirt.geometry.dispose(); this.skirt.material.dispose(); }
    this.material?.dispose();
    this.tiles.length = 0;
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------------------------------------------------------------
/** Lambert terrain material with an anti-tiling macro sample, and an optional emissive "glow network" (lava cracks). */
function makeTerrainMaterial(cfg) {
  const m = new THREE.MeshLambertMaterial({ map: cfg.map ?? null, vertexColors: true });
  if (cfg.emissive) m.emissive = new THREE.Color(cfg.emissive);
  const glow = cfg.glow ?? null;
  m.customProgramCacheKey = () => `terrain:${cfg.map ? 'm' : '-'}:${glow ? 'g' : '-'}`;
  if (cfg.map || glow) {
    m.onBeforeCompile = (shader) => {
      if (glow) {
        shader.uniforms.uGlowMap = { value: glow.map };
        shader.uniforms.uGlowK = { value: new THREE.Vector4(glow.scale ?? 0.01, glow.threshold ?? 0.5, glow.soft ?? 0.15, glow.intensity ?? 1) };
        shader.uniforms.uGlowCol = { value: new THREE.Color(glow.color ?? '#ffffff') };
        shader.uniforms.uGlowTime = glow.time ?? { value: 0 };
        shader.uniforms.uGlowUv = { value: glow.uvScale ?? 0.35 };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlowW; varying float vGlowUp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowW = ( modelMatrix * vec4( position, 1.0 ) ).xyz; vGlowUp = normalize( mat3( modelMatrix ) * normal ).y;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vGlowW; varying float vGlowUp; uniform sampler2D uGlowMap; uniform vec4 uGlowK; uniform vec3 uGlowCol; uniform float uGlowTime; uniform float uGlowUv;
          float gh( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
          float gn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( gh( i ), gh( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gh( i + vec2( 0.0, 1.0 ) ), gh( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float gm = smoothstep( uGlowK.y - uGlowK.z, uGlowK.y + uGlowK.z, gn( vGlowW.xz * uGlowK.x ) * 0.65 + gn( vGlowW.xz * uGlowK.x * 3.1 + 9.0 ) * 0.35 );
            float pulse = 0.82 + 0.18 * sin( uGlowTime * 1.7 + vGlowW.x * 0.03 + vGlowW.z * 0.021 );
            gm *= smoothstep( 0.55, 0.82, vGlowUp );          // cracks only on gentle ground: top-down UVs would smear them down cliffs
            vec3 g1 = texture2D( uGlowMap, vMapUv * uGlowUv ).rgb, g2 = texture2D( uGlowMap, vec2( vMapUv.y, vMapUv.x ) * uGlowUv * 0.37 + 0.31 ).rgb;   // two scales: no visible tiling
            totalEmissiveRadiance += max( g1, g2 * 0.8 ) * uGlowCol * uGlowK.w * gm * pulse;
          }`);
      }
      if (cfg.map) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 tA = texture2D( map, vMapUv );
            vec4 tB = texture2D( map, vMapUv * 0.137 + vec2( 0.31, 0.77 ) );
            vec4 tC = texture2D( map, vec2( vMapUv.y, vMapUv.x ) * 0.0531 + vec2( 0.62, 0.19 ) );
            float macro = dot( tB.rgb, vec3( 0.3333 ) ) * 0.6 + dot( tC.rgb, vec3( 0.3333 ) ) * 0.4;
            vec3 detail = tA.rgb * ( 0.62 + 0.76 * macro );
            diffuseColor.rgb *= detail * 1.12;
          #endif`,
        );
      }
    };
  }
  return m;
}
