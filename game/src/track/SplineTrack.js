// SplineTrack: the generic closed-circuit track used by every course (src/tracks/*.js are data + a world recipe).
// OWNER: Agent B (tracks). Physics, race rules, AI, items, HUD and camera all talk to the track ONLY through the
// public API documented in docs/ARCHITECTURE.md ("Track contract").  This file is the DATA + QUERY engine; everything
// you can see (road, terrain, sky, props, animation) lives in src/world/ and is built by `World` (see docs/tracks.md).
//
// Coordinate model: the centreline is a closed centripetal Catmull-Rom spline through def.points
// ([x, y, z, width?, bankDeg?, shoulder?]), resampled every ~2 m.  A world position projects to
//   s        arc length along the track in metres [0, length)
//   lateral  signed metres from the centreline, + = RIGHT of the driving direction
//   height   world Y of the road surface under that point (includes ramp profiles)
// Positive bank rolls the road into a RIGHT-hand turn (right edge lower).
//
// Additive extensions on top of the original contract (nothing existing changed):
//   def.layout            readable turtle layout compiled to def.points (see src/tracks/layout.js)
//   def.points[i][5]      per-point shoulder width; def.shoulder stays the default
//   zones / openEdges     may use markers instead of raw metres: { at:'markerId', offset, length } or { from:'a', to:'b' }
//   zone type 'gap'       no ground inside the zone (karts that do not clear it fall and are rescued)
//   track.markers         { id: { s0, s1 } } named stretches of the layout (exact on the final spline)
//   track.world           the visual world (null when constructed with { headless: true }, e.g. in Node tools)
import * as THREE from 'three';
import { Surface } from './surfaces.js';
import { TrackQuery, TrackSample } from './types.js';
import { DEG, clamp, lerp, wrapAngle, wrapS } from '../core/math.js';
import { compileLayout } from '../tracks/layout.js';
import { buildRacingLine } from './racingLine.js';
import { World } from '../world/World.js';

const SPACING = 2.0;      // metres between centreline samples
const HINT_WINDOW = 30;   // samples searched around a hint before falling back to a global scan

export { TrackQuery, TrackSample };

export class SplineTrack {
  /** @param def track definition (see src/tracks/sunny-meadows.js)  @param opts { quality, headless } */
  constructor(def, opts = {}) {
    if (!def.points && def.layout) {
      const lay = compileLayout({ width: def.width, shoulder: def.shoulder, ...def.layout });
      def = { ...def, points: lay.points, _layoutMarkers: lay.markers, _layoutLength: lay.length, _layoutWarnings: lay.warnings };
    }
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.theme = def.theme ?? 'meadow';
    this.laps = def.laps ?? 3;
    this.quality = opts.quality ?? { id: 'high', shadows: true, shadowMapSize: 2048, sceneryDensity: 1, drawDistance: 1000, particles: 1 };
    this.mirror = !!opts.mirror;
    this._q = new TrackQuery();
    this._buildSamples(def);
    this._resolveMarkers(def);
    this._buildZones(def);
    this._applyOpenEdges(def);
    this._buildFeatures(def);
    this._buildRacingLine();
    this._buildMinimap();
    this.group = new THREE.Group();
    this.group.name = `track:${this.id}`;
    this.world = null;
    this.sky = null;
    if (!opts.headless) {
      this.world = new World(this, opts);
      this.sky = this.world.sky;          // THREE.Group (rotation-only dome, safe to render in a CubeCamera / PMREM pass for environment maps)
    }
  }

  // ------------------------------------------------------------------ data build
  _buildSamples(def) {
    const raw = def.points;
    const n = raw.length;
    const mir = this.mirror ? -1 : 1;
    const pts = raw.map((p) => new THREE.Vector3(p[0] * mir, p[1] ?? 0, p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = Math.max(1200, n * 150);
    curve.updateArcLengths();
    const L = curve.getLength();
    const N = Math.max(48, Math.round(L / SPACING));
    this.length = L;
    this.count = N;
    this.spacing = L / N;
    const defW = def.width ?? 16;
    const defSh = def.shoulder ?? 6;
    const widths = raw.map((p) => p[3] ?? defW);
    const banks = raw.map((p) => (p[4] ?? 0) * DEG * mir);
    const shoulders = raw.map((p) => p[5] ?? defSh);
    this.pos = new Float32Array(N * 3);
    this.tan = new Float32Array(N * 3);
    this.right = new Float32Array(N * 3);
    this.up = new Float32Array(N * 3);
    this.hw = new Float32Array(N);
    this.shoulderW = new Float32Array(N);
    this.yawArr = new Float32Array(N);
    this.wallL = new Uint8Array(N).fill(1);
    this.wallR = new Uint8Array(N).fill(1);
    this.surf = new Uint8Array(N).fill(def.roadSurface ?? Surface.ROAD);
    this.shoulderSurface = def.shoulderSurface ?? Surface.GRASS;
    const p = new THREE.Vector3(), t = new THREE.Vector3(), r0 = new THREE.Vector3(), u0 = new THREE.Vector3();
    const R = new THREE.Vector3(), U = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const u = i / N;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      const idx = curve.getUtoTmapping(u) * n;
      const w = cr(widths, idx);
      const bank = cr(banks, idx);
      r0.crossVectors(t, worldUp).normalize();
      u0.crossVectors(r0, t).normalize();
      const cb = Math.cos(bank), sb = Math.sin(bank);
      R.copy(r0).multiplyScalar(cb).addScaledVector(u0, -sb);
      U.copy(u0).multiplyScalar(cb).addScaledVector(r0, sb);
      p.toArray(this.pos, i * 3);
      t.toArray(this.tan, i * 3);
      R.toArray(this.right, i * 3);
      U.toArray(this.up, i * 3);
      this.hw[i] = w * 0.5;
      this.shoulderW[i] = Math.max(0, cr(shoulders, idx));
      this.yawArr[i] = Math.atan2(t.x, t.z);
    }
    // bounds (used by the world for terrain extents)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
  }

  /** Re-project layout markers (measured on the compiled path) onto the final spline => exact s ranges. */
  _resolveMarkers(def) {
    this.markers = {};
    const src = def._layoutMarkers;
    if (!src) return;
    const scale = this.length / (def._layoutLength || this.length);
    const N = this.count, P = this.pos, mir = this.mirror ? -1 : 1;
    for (const [id, m] of Object.entries(src)) {
      const expect = m.s0 * scale;
      const win = Math.ceil(70 / this.spacing);
      const c = Math.round(expect / this.spacing);
      let best = c, bd = Infinity;
      for (let k = -win; k <= win; k++) {
        const i = (((c + k) % N) + N) % N;
        const dx = P[i * 3] - m.x * mir, dz = P[i * 3 + 2] - m.z, dy = P[i * 3 + 1] - m.y;
        const d = dx * dx + dz * dz + dy * dy * 0.25;
        if (d < bd) { bd = d; best = i; }
      }
      const s0 = best * this.spacing;
      this.markers[id] = { s0, s1: s0 + m.len * scale, len: m.len * scale };
    }
  }

  /** {s0,s1} | {s, length} | {at, offset=0, length?, from:'start'|'end'} | {from:'a', to:'b'}  ->  [s0, s1] in metres. */
  resolveRange(spec) {
    const L = this.length;
    if (spec.at !== undefined) {
      const m = this.markers[spec.at];
      if (!m) throw new Error(`track ${this.id}: unknown marker "${spec.at}"`);
      const len = spec.length ?? (m.s1 - m.s0);
      const off = spec.offset ?? 0;
      const s0 = spec.anchor === 'end' ? m.s1 - off - len : m.s0 + off;
      return [wrapS(s0, L), wrapS(s0, L) + len];
    }
    if (typeof spec.from === 'string' && typeof spec.to === 'string') {
      const a = this.markers[spec.from], b = this.markers[spec.to];
      if (!a || !b) throw new Error(`track ${this.id}: unknown marker in range ${spec.from}->${spec.to}`);
      return [a.s0, b.s1 > a.s0 ? b.s1 : b.s1 + L];
    }
    if (spec.s0 !== undefined) return [spec.s0, spec.s1];
    const s = spec.s ?? 0;
    return [s, s + (spec.length ?? 0)];
  }

  _buildZones(def) {
    // def.zones: [{ type: 'boost'|'ramp'|'gap'|'ice'|'mud'|'sand'|'water'|'snow', s | at+offset, length, lateral = 0, width, height? }]
    const surfaceByType = { ice: Surface.ICE, mud: Surface.MUD, sand: Surface.SAND, water: Surface.WATER, snow: Surface.SNOW };
    this.zones = (def.zones ?? []).map((z) => {
      const [s0, s1] = this.resolveRange(z);
      const width = z.width ?? 200;
      return {
        ...z,
        s: s0,
        length: s1 - s0,
        s0,
        s1,
        l0: (z.lateral ?? 0) - width / 2,
        l1: (z.lateral ?? 0) + width / 2,
        width,
        surface: surfaceByType[z.type] ?? null,
        feature: z.type === 'boost' || z.type === 'ramp',
      };
    });
    this.boostPads = this.zones.filter((z) => z.type === 'boost');
    this.ramps = this.zones.filter((z) => z.type === 'ramp');
    this.gaps = this.zones.filter((z) => z.type === 'gap');
  }

  _applyOpenEdges(def) {
    // optional open (no wall) stretches: def.openEdges = [{ s0, s1, side: 'left'|'right'|'both' }] (or marker based)
    this.openEdges = (def.openEdges ?? []).map((e) => {
      const [s0, s1] = this.resolveRange(e);
      return { s0, s1: Math.min(s1, s0 + this.length), side: e.side ?? 'both' };   // never longer than one lap
    });
    const N = this.count, L = this.length;
    for (const e of this.openEdges) {
      for (let i = 0; i < N; i++) {
        let s = i * this.spacing;
        if (s < e.s0 && s + L <= e.s1) s += L;
        if (s >= e.s0 && s <= e.s1) {
          if (e.side !== 'right') this.wallL[i] = 0;
          if (e.side !== 'left') this.wallR[i] = 0;
        }
      }
    }
  }

  _buildFeatures(def) {
    const L = this.length;
    // checkpoints (sector gates / respawn anchors) roughly every 110 m; checkpoint 0 is the start line
    const cpCount = Math.max(6, Math.round(L / 110));
    this.checkpoints = [];
    for (let k = 0; k < cpCount; k++) {
      const s = (k / cpCount) * L;
      const smp = this.sampleAt(s);
      this.checkpoints.push({ index: k, s, position: smp.position.clone(), yaw: smp.yaw });
    }
    // item boxes: rows across the road.  def.itemRows = [{ s | at+offset, count? }] places rows explicitly (recommended);
    // otherwise `itemBoxRows` rows are spread evenly and nudged clear of ramps / gaps / boost pads.
    const perRowDefault = def.itemBoxesPerRow ?? 5;
    let rows;
    if (def.itemRows?.length) {
      rows = def.itemRows.map((r) => ({ s: wrapS(this.resolveRange(r)[0], L), count: r.count ?? perRowDefault }));
    } else {
      const n = def.itemBoxRows ?? 5;
      rows = [];
      for (let r = 0; r < n; r++) rows.push({ s: this._clearOfFeatures(((r + 0.5) / n) * L, 30), count: perRowDefault });
    }
    this.itemBoxes = [];
    rows.forEach((row, r) => {
      const smp = this.sampleAt(row.s);
      const span = smp.halfWidth * 1.3;
      for (let k = 0; k < row.count; k++) {
        const lateral = row.count === 1 ? 0 : lerp(-span / 2, span / 2, k / (row.count - 1));
        const position = this.pointAt(row.s, lateral, new THREE.Vector3(), 1.2);
        this.itemBoxes.push({ id: this.itemBoxes.length, row: r, s: row.s, lateral, position });
      }
    });
    // coins (optional): def.coins = [{ s | at+offset, lateral, lift? }]  and  def.coinLines = [{ s | at+offset, count, spacing, lateral, lateralTo?, lift?, arc?: metres of sine weave }]
    const coinDefs = [...(def.coins ?? [])];
    for (const line of def.coinLines ?? []) {
      const s0 = this.resolveRange(line)[0], n = line.count ?? 8, step = line.spacing ?? 6;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1);
        const lateral = (line.lateral ?? 0) + ((line.lateralTo ?? line.lateral ?? 0) - (line.lateral ?? 0)) * t + Math.sin(t * Math.PI * 2) * (line.weave ?? 0);
        coinDefs.push({ s: s0 + k * step, lateral, lift: (line.lift ?? 0.9) + Math.sin(t * Math.PI) * (line.arch ?? 0) });
      }
    }
    this.coins = coinDefs.map((c, i) => {
      const s = wrapS(c.at !== undefined ? this.resolveRange(c)[0] : c.s ?? 0, L);
      return { id: i, s, lateral: c.lateral ?? 0, position: this.pointAt(s, c.lateral ?? 0, new THREE.Vector3(), c.lift ?? 0.9) };
    });
  }

  /** Shift s away from ramps / gaps / pads so item boxes never float in a jump or hide in a pad. */
  _clearOfFeatures(s, margin) {
    const L = this.length;
    for (let tries = 0; tries < 8; tries++) {
      let moved = false;
      for (const z of this.zones) {
        if (!(z.type === 'ramp' || z.type === 'gap' || z.type === 'boost')) continue;
        const a = z.s0 - margin, b = z.s1 + margin;
        const t = wrapS(s - a, L);
        if (t <= b - a) { s = wrapS(a - 4, L); moved = true; }
      }
      if (!moved) break;
    }
    return s;
  }

  _buildRacingLine() {
    this.curvature = new Float32Array(this.count);
    this.racingLine = buildRacingLine(this);
  }

  _buildMinimap() {
    const pts = [];
    const step = Math.max(1, Math.round(this.count / 180));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.count; i += step) {
      const x = this.pos[i * 3], z = this.pos[i * 3 + 2];
      pts.push([x, z]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    // width profile + elevation (handy for fancy minimaps: 0..1 along the polyline, same order as points)
    const width = [], height = [];
    for (let i = 0; i < this.count; i += step) { width.push(this.hw[i] * 2); height.push(this.pos[i * 3 + 1]); }
    // features for fancy minimaps: boost pads / ramps / gaps / ice as short polylines in the same x,z space as `points`
    const features = [];
    for (const z of this.zones) {
      if (!['boost', 'ramp', 'gap', 'ice', 'mud', 'sand', 'water'].includes(z.type)) continue;
      const a = this.sampleAt(z.s0), b = this.sampleAt(z.s1);
      features.push({ type: z.type, s0: z.s0, s1: z.s1, from: [a.position.x, a.position.z], to: [b.position.x, b.position.z] });
    }
    this.minimap = { points: pts, bounds: { minX, maxX, minZ, maxZ }, start: [this.pos[0], this.pos[2]], width, height, closed: true, features };
  }

  // ------------------------------------------------------------------ public queries (HOT PATH: no allocation)
  /**
   * Project a world position onto the track.  `hint` = previous query.index for this kart (disambiguates
   * overlapping road sections and is faster); pass -1 for a global search.  Returns `out`.
   * @param {THREE.Vector3} p  @param {TrackQuery} out  @param {number} [hint]
   */
  project(p, out = new TrackQuery(), hint = -1) {
    const N = this.count, P = this.pos;
    const px = p.x, py = p.y, pz = p.z;
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      const h = Math.floor(hint);
      for (let k = -HINT_WINDOW; k <= HINT_WINDOW; k++) {
        const i = (((h + k) % N) + N) % N;
        const dx = px - P[i * 3], dz = pz - P[i * 3 + 2], dy = py - P[i * 3 + 1];
        const d = dx * dx + dz * dz + dy * dy * 0.25;
        if (d < bestD) { bestD = d; best = i; }
      }
      const lim = this.hw[best] + this.shoulderW[best] + 40;
      if (bestD > lim * lim) best = -1;
    }
    if (best < 0) {
      bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = px - P[i * 3], dz = pz - P[i * 3 + 2], dy = py - P[i * 3 + 1];
        const d = dx * dx + dz * dz + dy * dy * 0.25;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    // refine on the two neighbouring segments (no allocation: segDist2 returns d^2 and leaves t in _segT)
    const j0 = (best - 1 + N) % N;
    const d0 = segDist2(P, N, j0, px, pz); const t0 = _segT;
    const d1 = segDist2(P, N, best, px, pz); const t1 = _segT;
    let j, t;
    if (d0 < d1) { j = j0; t = t0; } else { j = best; t = t1; }
    const j2 = (j + 1) % N;
    const a = j * 3, b = j2 * 3;
    const cx = lerp(P[a], P[b], t), cy = lerp(P[a + 1], P[b + 1], t), cz = lerp(P[a + 2], P[b + 2], t);
    const T = out.tangent.set(lerp(this.tan[a], this.tan[b], t), lerp(this.tan[a + 1], this.tan[b + 1], t), lerp(this.tan[a + 2], this.tan[b + 2], t)).normalize();
    const R = out.right.set(lerp(this.right[a], this.right[b], t), lerp(this.right[a + 1], this.right[b + 1], t), lerp(this.right[a + 2], this.right[b + 2], t)).normalize();
    const U = out.normal.set(lerp(this.up[a], this.up[b], t), lerp(this.up[a + 1], this.up[b + 1], t), lerp(this.up[a + 2], this.up[b + 2], t)).normalize();
    const rxz = R.x * R.x + R.z * R.z || 1;
    const lateral = ((px - cx) * R.x + (pz - cz) * R.z) / rxz;
    const hw = lerp(this.hw[j], this.hw[j2], t);
    const sh = lerp(this.shoulderW[j], this.shoulderW[j2], t);
    out.index = j + t;
    out.s = wrapS(out.index * this.spacing, this.length);
    out.lateral = lateral;
    out.halfWidth = hw;
    out.shoulder = sh;
    out.offset = Math.abs(lateral) - hw;
    out.height = cy + R.y * lateral;
    out.dist = Math.hypot(px - cx, pz - cz);
    out.onRoad = out.offset <= 0;
    out.wall = lateral >= 0 ? this.wallR[best] === 1 : this.wallL[best] === 1;
    out.inBounds = out.offset <= sh + (out.wall ? 0 : 2);
    let surface = out.onRoad ? this.surf[best] : this.shoulderSurface;
    out.zone = null;
    const zs = this.zones;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      let s = out.s;
      if (s < z.s0 && s + this.length <= z.s1) s += this.length; // zone that wraps the start line
      if (s >= z.s0 && s <= z.s1 && lateral >= z.l0 && lateral <= z.l1) {
        if (z.type === 'ramp') {
          const f = (s - z.s0) / (z.s1 - z.s0);
          out.height += z.height * f;
          const pitch = Math.atan2(z.height, z.length);
          out.normal.addScaledVector(T, -Math.sin(pitch)).normalize();
          out.zone = z;
        } else if (z.type === 'boost') {
          out.zone = z;
        } else if (z.type === 'gap') {
          out.inBounds = false;   // no ground: a kart that does not clear the gap falls and gets rescued
          out.zone = z;
        } else if (z.surface !== null && out.onRoad) {
          surface = z.surface;
        }
      }
    }
    out.surface = surface;
    return out;
  }

  /** Frame of the track at arc length s (wraps). Returns `out`. */
  sampleAt(s, out = new TrackSample()) {
    const N = this.count;
    const f = wrapS(s, this.length) / this.spacing;
    const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N, t = f - Math.floor(f);
    const a = i0 * 3, b = i1 * 3;
    out.s = wrapS(s, this.length);
    out.position.set(lerp(this.pos[a], this.pos[b], t), lerp(this.pos[a + 1], this.pos[b + 1], t), lerp(this.pos[a + 2], this.pos[b + 2], t));
    out.tangent.set(lerp(this.tan[a], this.tan[b], t), lerp(this.tan[a + 1], this.tan[b + 1], t), lerp(this.tan[a + 2], this.tan[b + 2], t)).normalize();
    out.right.set(lerp(this.right[a], this.right[b], t), lerp(this.right[a + 1], this.right[b + 1], t), lerp(this.right[a + 2], this.right[b + 2], t)).normalize();
    out.up.set(lerp(this.up[a], this.up[b], t), lerp(this.up[a + 1], this.up[b + 1], t), lerp(this.up[a + 2], this.up[b + 2], t)).normalize();
    out.halfWidth = lerp(this.hw[i0], this.hw[i1], t);
    out.shoulder = lerp(this.shoulderW[i0], this.shoulderW[i1], t);
    out.yaw = this.yawArr[i0] + wrapAngle(this.yawArr[i1] - this.yawArr[i0]) * t;
    return out;
  }

  /** World point on the road surface at (s, lateral), lifted `lift` metres along the surface normal. */
  pointAt(s, lateral, out = new THREE.Vector3(), lift = 0) {
    const smp = this.sampleAt(s, (this._tmpSample ??= new TrackSample()));
    return out.copy(smp.position).addScaledVector(smp.right, lateral).addScaledVector(smp.up, lift);
  }

  /** Signed shortest distance along the track from arc-length a to b (positive = b is ahead). */
  deltaS(a, b) {
    let d = (b - a) % this.length;
    if (d > this.length / 2) d -= this.length; else if (d < -this.length / 2) d += this.length;
    return d;
  }

  /** Wall response. Call after project(). If the circle (centre p, `radius`) pokes through a solid wall returns
   *  true and fills out = { depth, nx, nz } (unit normal pointing back INTO the track, depth in metres). */
  resolveWalls(q, radius, out) {
    if (!q.wall) return false;
    const limit = q.halfWidth + q.shoulder - radius;
    const over = Math.abs(q.lateral) - limit;
    if (over <= 0) return false;
    const side = q.lateral >= 0 ? 1 : -1;
    let nx = -q.right.x * side, nz = -q.right.z * side;
    const l = Math.hypot(nx, nz) || 1;
    out.depth = over; out.nx = nx / l; out.nz = nz / l;
    return true;
  }

  /** Start-grid slots (index 0 = pole). Staggered two-wide rows behind the line. */
  getStartGrid(count) {
    const slots = [];
    const smp = new TrackSample();
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      const s = -(5 + row * 6.5 + col * 2.6);
      this.sampleAt(s, smp);
      const lateral = (col === 0 ? -1 : 1) * smp.halfWidth * 0.34;
      const position = this.pointAt(s, lateral, new THREE.Vector3());
      slots.push({ index: i, s: wrapS(s, this.length), lateral, position, yaw: smp.yaw });
    }
    return slots;
  }

  /** A safe respawn pose at/behind arc length s. */
  getRespawn(s, lateral = 0) {
    const smp = this.sampleAt(s);
    const position = this.pointAt(s, clamp(lateral, -smp.halfWidth * 0.6, smp.halfWidth * 0.6), new THREE.Vector3());
    return { s: wrapS(s, this.length), position, yaw: smp.yaw };
  }

  lineOffsetAt(s) { const f = wrapS(s, this.length) / this.spacing; const i = Math.floor(f) % this.count; return lerp(this.racingLine.offset[i], this.racingLine.offset[(i + 1) % this.count], f - Math.floor(f)); }
  maxSpeedAt(s) { const f = wrapS(s, this.length) / this.spacing; const i = Math.floor(f) % this.count; return lerp(this.racingLine.maxSpeed[i], this.racingLine.maxSpeed[(i + 1) % this.count], f - Math.floor(f)); }
  curvatureAt(s) { return this.curvature[Math.floor(wrapS(s, this.length) / this.spacing) % this.count]; }
  /** Curvature of the racing LINE itself (rad/m, + = left) - tighter than the centreline's in corners, 0 on straights. */
  lineCurvatureAt(s) { return this.racingLine.curv[Math.floor(wrapS(s, this.length) / this.spacing) % this.count]; }
  /** Speed the kart should carry here (m/s), > 0 only just before / over a jump (ramp + gap): below it the jump falls short. */
  minSpeedAt(s) { return this.racingLine.minSpeed[Math.floor(wrapS(s, this.length) / this.spacing) % this.count]; }

  // ------------------------------------------------------------------ lifecycle (visuals live in World)
  /** Add the track to the session's scene and set up lighting/fog/sky. */
  attach(session) {
    session.scene.add(this.group);
    this.world?.attach(session);
    this.applyQuality(session.quality);
  }

  applyQuality(q) {
    this.quality = q ?? this.quality;
    this.world?.applyQuality(this.quality);
  }

  /** Per-frame: animate scenery, make the sun's shadow follow the player. */
  update(dt, session) {
    this.world?.update(dt, session);
  }

  dispose() {
    this.world?.dispose();
    this.group.removeFromParent();
  }
}

// ---- helpers ----------------------------------------------------------------------------------------------
let _segT = 0;
function segDist2(P, N, j, px, pz) {
  const a = j * 3, b = ((j + 1) % N) * 3;
  const abx = P[b] - P[a], abz = P[b + 2] - P[a + 2];
  const t = clamp(((px - P[a]) * abx + (pz - P[a + 2]) * abz) / (abx * abx + abz * abz || 1), 0, 1);
  const cx = P[a] + abx * t - px, cz = P[a + 2] + abz * t - pz;
  _segT = t;
  return cx * cx + cz * cz;
}
/** Periodic Catmull-Rom interpolation of a per-control-point scalar at control-index `idx` (float). */
function cr(values, idx) {
  const n = values.length;
  const i1 = Math.floor(idx) % n, t = idx - Math.floor(idx);
  const p0 = values[(i1 - 1 + n) % n], p1 = values[i1], p2 = values[(i1 + 1) % n], p3 = values[(i1 + 2) % n];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
