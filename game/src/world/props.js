// Props: chunked InstancedMesh layers + rule-based scattering along the track.   OWNER: Agent B.
//
//   const layer = world.layer({ name:'trees', geometry, material, castShadow:true });
//   world.scatter(layer, { perKm: 90, side:'both', dist:[2, 70], scale:[0.8,1.5], ... });
//
// * Instances are bucketed into spatial chunks so frustum culling works (an InstancedMesh is otherwise one big sphere) and
//   far chunks can be hidden by `quality.drawDistance` with a couple of squared-distance tests per frame (no allocation).
// * Each instance has a random `rank`; `setDensity(d)` just changes `mesh.count` per chunk (instances are sorted by rank), so
//   quality.sceneryDensity scales cost without rebuilding anything.
import * as THREE from 'three';
import { composeMatrix, toColor } from './geo.js';
import { TrackSample } from '../track/types.js';

const _col = new THREE.Color();

export class PropLayer {
  constructor(world, { name = 'props', geometry, material, castShadow = false, receiveShadow = false, chunk = 150, cull = 1, minDensityRank = 0 }) {
    this.world = world;
    this.name = name;
    this.geometry = geometry;
    this.material = material;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.chunkSize = chunk;
    this.cullScale = cull;        // multiplies the draw distance for this layer (small props: 0.5, mountains: 2)
    this.inst = [];
    this.chunks = [];
    this.built = false;
    this.maxRank = 1;
  }

  /** x,y,z position, ry yaw, scale (number | [sx,sy,sz]), optional THREE.Color-like tint, optional tilt rx/rz. */
  add(x, y, z, ry = 0, scale = 1, color = null, rx = 0, rz = 0, rank = null) {
    const sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
    this.inst.push({ x, y, z, ry, sx: sc[0], sy: sc[1], sz: sc[2], rx, rz, c: color ? toColor(color).toArray() : null, rank: rank ?? this.world.rand() });
    return this;
  }
  get count() { return this.inst.length; }

  build() {
    if (this.built || !this.inst.length) { this.built = true; return this; }
    const cs = this.chunkSize, buckets = new Map();
    for (const it of this.inst) {
      const k = `${Math.floor(it.x / cs)},${Math.floor(it.z / cs)}`;
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = []));
      b.push(it);
    }
    const useColor = this.inst.some((i) => i.c);
    this.geometry.computeBoundingSphere();
    for (const list of buckets.values()) {
      list.sort((a, b) => a.rank - b.rank);
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      const ranks = new Float32Array(list.length);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        mesh.setMatrixAt(i, composeMatrix(it.x, it.y, it.z, it.ry, it.sx, it.sy, it.sz, it.rx, it.rz));
        if (useColor) { const c = it.c ?? [1, 1, 1]; mesh.setColorAt(i, _col.setRGB(c[0], c[1], c[2])); }
        ranks[i] = it.rank;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.name = this.name;
      mesh.userData.ranks = ranks;
      mesh.userData.full = list.length;
      mesh.matrixAutoUpdate = false;
      this.world.group.add(mesh);
      this.chunks.push(mesh);
    }
    this.inst = []; // free build-time data (counts live on the meshes)
    this.built = true;
    return this;
  }

  /** d in [0, 1.25]: fraction of instances drawn (rank threshold d/1.25). */
  setDensity(d) {
    const thr = Math.max(0, Math.min(1, d / 1.25));
    for (const m of this.chunks) {
      const r = m.userData.ranks;
      let lo = 0, hi = r.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (r[mid] < thr) lo = mid + 1; else hi = mid; }
      m.count = lo;
    }
  }

  cullTo(camPos, drawDistance) {
    const dd = drawDistance * this.cullScale;
    for (let i = 0; i < this.chunks.length; i++) {
      const m = this.chunks[i], bs = m.boundingSphere;
      const dx = bs.center.x - camPos.x, dz = bs.center.z - camPos.z, r = bs.radius + dd;
      m.visible = m.count > 0 && dx * dx + dz * dz < r * r;
    }
  }

  dispose() {
    for (const m of this.chunks) { m.dispose?.(); m.removeFromParent(); }
    this.chunks.length = 0;
    this.geometry.dispose();
  }
}

// ------------------------------------------------------------------------------------------------------------------
const _smp = new TrackSample();

/**
 * Scatter instances along the track.
 * r = {
 *   count | perKm        how many instances to try to place
 *   ranges: [[s0,s1],...]   only these stretches (default whole lap);  `markers:['id',..]` resolves marker names
 *   side: 'both'|'left'|'right'     dist: [min,max] metres BEYOND the barrier line (hw + shoulder)    bias: >1 clusters near the road
 *   scale: [a,b] | fn(rnd)->number|[x,y,z]    scaleBias   align: false | 'road' (yaw follows the track) | 'facing' (faces the road)
 *   clearance: min metres from ANY road edge (default 3)   avoid: [{x,z,r}] extra circles   minY / maxY: ground height window
 *   maxSlope: reject if the ground normal.y is below this   cluster: { freq, threshold, octave }  noise mask
 *   color: fn(rnd, ctx) -> Color-like | palette array       sink: metres to embed        tilt: random lean (radians)
 *   accept(ctx) -> bool  custom filter,  ctx = { x, y, z, s, side, lateral, dist, nrm }
 * }
 * Returns the number of instances placed.
 */
export function scatter(world, layer, r) {
  const tr = world.track, rnd = r.rng ?? world.rand, L = tr.length;
  let ranges = r.ranges ?? [[0, L]];
  if (r.markers) ranges = r.markers.map((id) => { const m = tr.markers[id]; return m ? [m.s0, m.s1] : null; }).filter(Boolean);
  const totalLen = ranges.reduce((a, [s0, s1]) => a + (s1 - s0), 0);
  const want = r.count ?? Math.round(((r.perKm ?? 60) * totalLen) / 1000);
  const dist = r.dist ?? [2, 40], bias = r.bias ?? 1, margin = r.margin ?? 1;
  const clearance = r.clearance ?? 3;
  const nrm = new THREE.Vector3();
  const ctx = { x: 0, y: 0, z: 0, s: 0, side: 1, lateral: 0, dist: 0, nrm, world };
  let placed = 0, tries = 0;
  const maxTries = want * (r.tries ?? 6) + 20;
  while (placed < want && tries++ < maxTries) {
    // pick a stretch weighted by length
    let pick = rnd() * totalLen, s = 0;
    for (const [a, b] of ranges) { const len = b - a; if (pick <= len) { s = a + pick; break; } pick -= len; }
    tr.sampleAt(s, _smp);
    const side = r.side === 'left' ? -1 : r.side === 'right' ? 1 : rnd() < 0.5 ? -1 : 1;
    const d = dist[0] + (dist[1] - dist[0]) * Math.pow(rnd(), bias);
    const lateral = side * (_smp.halfWidth + _smp.shoulder + margin + d);
    const x = _smp.position.x + _smp.right.x * lateral, z = _smp.position.z + _smp.right.z * lateral;
    // keep clear of every road (this stretch AND any other that passes nearby)
    const q = world.road.query(x, z);
    if (q.near && q.dist < q.hw + q.sh + clearance && Math.abs(q.lateral) < q.hw + q.sh + clearance) continue;
    if (r.avoid && r.avoid.some((c) => (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r)) continue;
    if (world.isExcluded(x, z, r.excludeMargin ?? 0)) continue;
    if (r.cluster) {
      const n = world.noise.fbm(x * r.cluster.freq, z * r.cluster.freq, r.cluster.octave ?? 2) * 0.5 + 0.5;
      if (n < r.cluster.threshold) continue;
    }
    const y = world.groundAt(x, z);
    if (r.minY !== undefined && y < r.minY) continue;
    if (r.maxY !== undefined && y > r.maxY) continue;
    if (r.maxSlope !== undefined) { world.terrain?.normalAt(x, z, nrm, 2.5); if (nrm.y < r.maxSlope) continue; }
    ctx.x = x; ctx.y = y; ctx.z = z; ctx.s = s; ctx.side = side; ctx.lateral = lateral; ctx.dist = d;
    if (r.accept && !r.accept(ctx)) continue;
    let sc = typeof r.scale === 'function' ? r.scale(rnd, ctx) : r.scale ? r.scale[0] + (r.scale[1] - r.scale[0]) * Math.pow(rnd(), r.scaleBias ?? 1) : 1;
    let ry = rnd() * Math.PI * 2;
    if (r.align === 'road') ry = _smp.yaw + (r.alignOffset ?? 0);
    else if (r.align === 'facing') ry = _smp.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (r.alignOffset ?? 0) + (rnd() - 0.5) * (r.alignJitter ?? 0);
    let color = null;
    if (r.color) { const c = typeof r.color === 'function' ? r.color(rnd, ctx) : r.color[(rnd() * r.color.length) | 0]; color = c; }
    const tilt = r.tilt ?? 0;
    layer.add(x, y - (r.sink ?? 0), z, ry, sc, color, (rnd() - 0.5) * tilt, (rnd() - 0.5) * tilt);
    if (r.blob) { // soft contact shadow under the prop: { layer, k } (k = blob diameter per unit of prop scale)
      const sz = (typeof sc === 'number' ? sc : sc[0]) * r.blob.k;
      r.blob.layer.add(x, y + 0.04, z, 0, sz, null, 0, 0);
    }
    placed++;
  }
  return placed;
}
