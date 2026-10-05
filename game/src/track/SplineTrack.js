// SplineTrack: the generic closed-circuit track used by every course (src/tracks/*.js are just data).
// OWNER: Agent B (tracks). Physics, race rules, AI, items, HUD and camera all talk to the track ONLY through the
// public API documented in docs/ARCHITECTURE.md ("Track contract").  Keep those signatures + semantics stable;
// everything under "baseline visuals" is yours to replace with something beautiful.
//
// Coordinate model: the centreline is a closed centripetal Catmull-Rom spline through def.points
// ([x, y, z, width?, bankDeg?]), resampled every ~2 m.  A world position projects to
//   s        arc length along the track in metres [0, length)
//   lateral  signed metres from the centreline, + = RIGHT of the driving direction
//   height   world Y of the road surface under that point (includes ramp profiles)
// Positive bank rolls the road into a RIGHT-hand turn (right edge lower).
import * as THREE from 'three';
import { Surface } from './surfaces.js';
import { DEG, clamp, clamp01, lerp, wrapAngle, wrapS } from '../core/math.js';

const SPACING = 2.0;      // metres between centreline samples
const HINT_WINDOW = 30;   // samples searched around a hint before falling back to a global scan

export class TrackQuery {
  constructor() {
    this.index = 0;       // fractional sample index
    this.s = 0;           // arc length along the track [0, length)
    this.lateral = 0;     // metres from centreline, + = right
    this.halfWidth = 8;   // road half width here
    this.shoulder = 6;    // extra drivable off-road band beyond the road edge
    this.offset = 0;      // |lateral| - halfWidth (<0 = on the road)
    this.height = 0;      // road surface world Y at this x,z
    this.normal = new THREE.Vector3(0, 1, 0);
    this.tangent = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.surface = Surface.ROAD;
    this.onRoad = true;   // |lateral| <= halfWidth
    this.inBounds = true; // inside the drivable corridor (road + shoulder, or a wall exists there)
    this.zone = null;     // feature zone under the point: {type:'boost'|'ramp'|...} or null
    this.dist = 0;        // horizontal distance to the centreline
    this.wall = true;     // is there a solid wall on the side the point is on?
  }
}

export class TrackSample {
  constructor() {
    this.s = 0;
    this.position = new THREE.Vector3();
    this.tangent = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.halfWidth = 8;
    this.shoulder = 6;
    this.yaw = 0;
  }
}

export class SplineTrack {
  /** @param def track definition (see src/tracks/sunny-meadows.js)  @param opts { quality } */
  constructor(def, opts = {}) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.theme = def.theme ?? 'meadow';
    this.laps = def.laps ?? 3;
    this.quality = opts.quality ?? { shadows: true, shadowMapSize: 2048, sceneryDensity: 1 };
    this._q = new TrackQuery();
    this._buildSamples(def);
    this._buildZones(def);
    this._buildFeatures(def);
    this._buildRacingLine();
    this._buildMinimap();
    this.group = new THREE.Group();
    this.group.name = `track:${this.id}`;
    this._buildBaselineVisuals();
  }

  // ------------------------------------------------------------------ data build
  _buildSamples(def) {
    const raw = def.points;
    const n = raw.length;
    const pts = raw.map((p) => new THREE.Vector3(p[0], p[1] ?? 0, p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = Math.max(1200, n * 150);
    curve.updateArcLengths();
    const L = curve.getLength();
    const N = Math.max(48, Math.round(L / SPACING));
    this.length = L;
    this.count = N;
    this.spacing = L / N;
    const defW = def.width ?? 16;
    const widths = raw.map((p) => p[3] ?? defW);
    const banks = raw.map((p) => (p[4] ?? 0) * DEG);
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
      const R = new THREE.Vector3().copy(r0).multiplyScalar(cb).addScaledVector(u0, -sb);
      const U = new THREE.Vector3().copy(u0).multiplyScalar(cb).addScaledVector(r0, sb);
      p.toArray(this.pos, i * 3);
      t.toArray(this.tan, i * 3);
      R.toArray(this.right, i * 3);
      U.toArray(this.up, i * 3);
      this.hw[i] = w * 0.5;
      this.shoulderW[i] = def.shoulder ?? 6;
      this.yawArr[i] = Math.atan2(t.x, t.z);
    }
    // optional open (no wall) stretches: def.openEdges = [{ s0, s1, side: 'left'|'right'|'both' }]
    for (const e of def.openEdges ?? []) {
      for (let i = 0; i < N; i++) {
        const s = i * this.spacing;
        if (s >= e.s0 && s <= e.s1) {
          if (e.side !== 'right') this.wallL[i] = 0;
          if (e.side !== 'left') this.wallR[i] = 0;
        }
      }
    }
  }

  _buildZones(def) {
    // def.zones: [{ type: 'boost'|'ramp'|'ice'|'mud'|'sand'|'water', s, length, lateral = 0, width, height? }]
    this.zones = (def.zones ?? []).map((z) => {
      const surfaceByType = { ice: Surface.ICE, mud: Surface.MUD, sand: Surface.SAND, water: Surface.WATER, snow: Surface.SNOW };
      return {
        ...z,
        s0: z.s,
        s1: z.s + z.length,
        l0: (z.lateral ?? 0) - z.width / 2,
        l1: (z.lateral ?? 0) + z.width / 2,
        surface: surfaceByType[z.type] ?? null,
        feature: z.type === 'boost' || z.type === 'ramp',
      };
    });
    this.boostPads = this.zones.filter((z) => z.type === 'boost');
    this.ramps = this.zones.filter((z) => z.type === 'ramp');
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
    // item boxes: rows across the road
    const rows = def.itemBoxRows ?? 5;
    const perRow = def.itemBoxesPerRow ?? 5;
    this.itemBoxes = [];
    for (let r = 0; r < rows; r++) {
      const s = ((r + 0.5) / rows) * L;
      const smp = this.sampleAt(s);
      const span = smp.halfWidth * 1.3;
      for (let k = 0; k < perRow; k++) {
        const lateral = perRow === 1 ? 0 : lerp(-span / 2, span / 2, k / (perRow - 1));
        const position = this.pointAt(s, lateral, new THREE.Vector3(), 1.2);
        this.itemBoxes.push({ id: this.itemBoxes.length, row: r, s, lateral, position });
      }
    }
    // coins (optional): def.coins = [{ s, lateral }]
    this.coins = (def.coins ?? []).map((c, i) => ({ id: i, s: c.s, lateral: c.lateral ?? 0, position: this.pointAt(c.s, c.lateral ?? 0, new THREE.Vector3(), 0.9) }));
  }

  _buildRacingLine() {
    const N = this.count;
    const curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.yawArr[(i - 2 + N) % N], b = this.yawArr[(i + 2) % N];
      curv[i] = wrapAngle(b - a) / (4 * this.spacing); // rad/m, + = turning left
    }
    // smooth curvature over ~30 m
    const sm = new Float32Array(N);
    const win = 8;
    for (let i = 0; i < N; i++) { let a = 0; for (let k = -win; k <= win; k++) a += curv[(i + k + N) % N]; sm[i] = a / (2 * win + 1); }
    this.curvature = sm;
    const offset = new Float32Array(N);
    const maxSpeed = new Float32Array(N);
    const vTop = 60, aLat = 24, aBrake = 20;
    for (let i = 0; i < N; i++) {
      // hug the inside of the corner: left turn (+curv) -> negative lateral
      offset[i] = clamp(-sm[i] * 110, -0.6, 0.6) * this.hw[i];
      maxSpeed[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(Math.abs(sm[i]), 1e-4)));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = N * 2 - 1; i >= 0; i--) {
        const a = i % N, b = (i + 1) % N;
        maxSpeed[a] = Math.min(maxSpeed[a], Math.sqrt(maxSpeed[b] * maxSpeed[b] + 2 * aBrake * this.spacing));
      }
    }
    this.racingLine = { offset, maxSpeed };
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
    this.minimap = { points: pts, bounds: { minX, maxX, minZ, maxZ }, start: [this.pos[0], this.pos[2]] };
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

  // ------------------------------------------------------------------ lifecycle
  /** Add the track to the session's scene and set up lighting/fog/sky. */
  attach(session) {
    session.scene.add(this.group);
    session.scene.background = this._skyColor;
    session.scene.fog = this._fog;
    this.applyQuality(session.quality);
  }

  applyQuality(q) {
    this.quality = q ?? this.quality;
    if (this.sun) {
      this.sun.castShadow = !!this.quality.shadows;
      const size = this.quality.shadowMapSize ?? 2048;
      if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    }
  }

  /** Per-frame: animate scenery, make the sun's shadow follow the player. */
  update(dt, session) {
    const focus = session.player?.position ?? this.group.position;
    if (this.sun) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).add(this._sunOffset);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    });
    this.group.removeFromParent();
  }

  // ------------------------------------------------------------------ baseline visuals (Agent B replaces)
  _ribbon(l0, l1, lift, uvScaleV, material, uvFlip = false) {
    // strip between lateral offsets l0..l1 (metres; they are ADDED to +/- halfWidth by the caller if needed)
    const N = this.count;
    const pos = new Float32Array((N + 1) * 2 * 3), nrm = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2);
    const idx = [];
    const R = new THREE.Vector3(), U = new THREE.Vector3(), P = new THREE.Vector3();
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      P.fromArray(this.pos, i * 3); R.fromArray(this.right, i * 3); U.fromArray(this.up, i * 3);
      const a = l0(i), b = l1(i);
      for (let side = 0; side < 2; side++) {
        const l = side === 0 ? a : b;
        const o = (k * 2 + side) * 3;
        pos[o] = P.x + R.x * l + U.x * lift; pos[o + 1] = P.y + R.y * l + U.y * lift; pos[o + 2] = P.z + R.z * l + U.z * lift;
        nrm[o] = U.x; nrm[o + 1] = U.y; nrm[o + 2] = U.z;
        uv[(k * 2 + side) * 2] = uvFlip ? 1 - side : side;
        uv[(k * 2 + side) * 2 + 1] = (k * this.spacing) / uvScaleV;
      }
      if (k < N) { const v = k * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
  }

  _buildBaselineVisuals() {
    const theme = this.def.palette ?? {};
    const skyTop = new THREE.Color(theme.skyTop ?? '#4aa3ff');
    const skyHorizon = new THREE.Color(theme.skyHorizon ?? '#cfe9ff');
    this._skyColor = skyHorizon.clone();
    this._fog = new THREE.Fog(skyHorizon.getHex(), 180, 700);
    // road
    const road = this._ribbon((i) => -this.hw[i], (i) => this.hw[i], 0.02, 16, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.92, metalness: 0 }));
    road.name = 'road';
    this.group.add(road);
    // curbs
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.8 });
    this.group.add(this._ribbon((i) => -this.hw[i] - 0.9, (i) => -this.hw[i], 0.04, 4, curbMat));
    this.group.add(this._ribbon((i) => this.hw[i], (i) => this.hw[i] + 0.9, 0.04, 4, curbMat));
    // shoulders (off-road band)
    const grass = new THREE.MeshStandardMaterial({ map: grassTexture(theme.ground ?? '#5da13a'), roughness: 1 });
    this.group.add(this._ribbon((i) => -this.hw[i] - this.shoulderW[i], (i) => -this.hw[i] - 0.9, 0.0, 12, grass));
    this.group.add(this._ribbon((i) => this.hw[i] + 0.9, (i) => this.hw[i] + this.shoulderW[i], 0.0, 12, grass));
    // walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9eef7, roughness: 0.7, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const w = this._ribbon((i) => side * (this.hw[i] + this.shoulderW[i]), (i) => side * (this.hw[i] + this.shoulderW[i]), 0, 6, wallMat);
      // turn the zero-width strip into a vertical wall by lifting the second vertex row
      const p = w.geometry.attributes.position;
      for (let k = 0; k < p.count; k += 2) { p.setY(k + 1, p.getY(k + 1) + 1.1); }
      p.needsUpdate = true;
      w.geometry.computeVertexNormals();
      w.castShadow = true;
      this.group.add(w);
    }
    // ground plane
    let minY = Infinity;
    for (let i = 0; i < this.count; i++) minY = Math.min(minY, this.pos[i * 3 + 1]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: grassTexture(theme.ground ?? '#5da13a', 400), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = minY - 0.15;
    ground.receiveShadow = true;
    this.group.add(ground);
    // start / finish line
    const line = this._ribbon((i) => -this.hw[i], (i) => this.hw[i], 0.05, 3, new THREE.MeshBasicMaterial({ map: checkerTexture() }));
    line.geometry.setDrawRange(0, 6 * 3); // first 3 quads (~6 m) only
    this.group.add(line);
    // sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: skyTop }, horizon: { value: skyHorizon } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }',
      }),
    );
    sky.name = 'sky';
    sky.renderOrder = -10;
    this.sky = sky;
    this.group.add(sky);
    // lights
    this.group.add(new THREE.HemisphereLight(skyTop.getHex(), 0x6b8a4a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.2);
    this._sunOffset = new THREE.Vector3(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
    this.sun = sun;
    this.group.add(sun, sun.target);
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

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function roadTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#4b4e5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 60 + ((Math.random() * 55) | 0); g.fillStyle = `rgba(${v},${v},${v + 8},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#f2f2ee'; g.fillRect(9, 0, 6, h); g.fillRect(w - 15, 0, 6, h);
    g.fillStyle = '#e9e9e4'; for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y + 20, 6, 64);
  });
}
function curbTexture() {
  return canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#e8403a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f7f7f2'; g.fillRect(0, h / 2, w, h / 2); });
}
function grassTexture(base, repeat = 1) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,40,0'},0.07)`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  });
  t.repeat.set(repeat, repeat);
  return t;
}
function checkerTexture() {
  return canvasTex(64, 16, (g, w, h) => { const s = 8; for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s, y * s, s, s); } });
}
