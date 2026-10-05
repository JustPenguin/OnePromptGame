// World: everything you can SEE around a track.  OWNER: Agent B.   See docs/tracks.md for the full guide.
//
//   new World(track, opts)  builds all visuals into track.group, driven by a RECIPE (src/world/recipes/<id>.js):
//     recipe(world) -> world.configure({ sky, light, fog, profile, road, barriers, terrain, free, start, boost, ... })
//                      + world.layer()/scatter()/place()/addUpdater() for props and set pieces.
//   Lifecycle (called by SplineTrack): attach(session) / applyQuality(q) / update(dt, session) / dispose().
//   Public: world.sky (Group), world.sunDir, world.terrain, world.groundAt(x,z), world.group.
import * as THREE from 'three';
import { createNoise } from './noise.js';
import { RoadIndex, Terrain } from './terrain.js';
import { PropLayer, scatter as scatterRules } from './props.js';
import { makeRows, ribbon, skirt, loopVScale } from './ribbon.js';
import { roadTexture, curbTexture, groundTexture, glowTexture, disposeTextures, texStats } from './textures.js';
import { buildBarriers } from './barriers.js';
import { buildBoostPads, buildStartLine } from './features.js';
import { buildRamps } from './ramps.js';
import { buildCornerSigns } from './signs.js';
import { buildSurfaceZones } from './surfaces.js';
import { GeoBuilder } from './builder.js';
import { createSky } from './sky.js';
import { getRecipe } from './recipes/index.js';
import { wetRoad } from './wet.js';
import { mulberry32 } from '../core/math.js';
import { toColor } from './geo.js';

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export class World {
  constructor(track, opts = {}) {
    this.track = track;
    this.def = track.def;
    this.group = track.group;
    this.quality = track.quality;
    const seed = hashStr(track.id);
    this.noise = createNoise((seed % 9973) + 1);
    this.rand = mulberry32(seed ^ 0x5bd1e995);
    this.road = new RoadIndex(track);
    this.timeUniform = { value: 0 };           // shared animation clock (seconds) for every custom shader
    this.cfg = { free: [], barriers: null, road: {}, start: {}, boost: {}, light: {}, fog: {}, profile: {} };
    this.textures = [];
    this.updaters = [];
    this.layers = [];
    this.waters = [];
    this.excludes = [];
    this.terrain = null;
    this.sky = null;
    this.skyObj = null;
    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
    this._focus = new THREE.Vector3();
    this._snap = new THREE.Vector3();
    this._lr = new THREE.Vector3();
    this._lu = new THREE.Vector3();
    this._lf = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this.t = 0;
    this.session = null;
    this.stats = { buildMs: 0, layers: 0, instances: 0 };
    const t0 = performance.now();
    this.stats.phases = {};
    getRecipe(this.def)(this);
    this.stats.phases.recipe = performance.now() - t0;
    this.stats.phases.gridMs = this.terrain?.gridMs ?? 0;
    this._build();
    this.stats.buildMs = performance.now() - t0;
    this.stats.phases.textures = texStats.ms;
    for (const k of Object.keys(this.stats.phases)) this.stats.phases[k] = Math.round(this.stats.phases[k]);
  }

  // ---- services for recipes ---------------------------------------------------------------------------------------
  /** Merge recipe config. Creating `terrain` here makes world.groundAt() usable immediately inside the recipe. */
  configure(cfg) {
    for (const [k, v] of Object.entries(cfg)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && this.cfg[k] && typeof this.cfg[k] === 'object' && !v.isTexture) this.cfg[k] = { ...this.cfg[k], ...v };
      else this.cfg[k] = v;
    }
    if (cfg.free) this.road.setFreeSections(this.cfg.free);
    if (cfg.terrain) this.terrain = new Terrain(this, this.cfg.terrain);
    return this;
  }

  tex(t) { this.textures.push(t); return t; }
  addUpdater(fn) { this.updaters.push(fn); return fn; }
  place(obj) { this.group.add(obj); return obj; }
  layer(opts) { const l = new PropLayer(this, opts); this.layers.push(l); return l; }
  scatter(layer, rules) { const t = performance.now(); const n = scatterRules(this, layer, rules); this.stats.phases.scatter = (this.stats.phases.scatter ?? 0) + performance.now() - t; return n; }
  /** A layer of flat soft dark discs (fake contact shadows). Use via scatter(..., { blob: { layer, k } }). */
  blobLayer({ opacity = 0.42, color = '#0a1a05', name = 'blobs' } = {}) {
    const g = new THREE.CircleGeometry(0.5, 14); g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex(glowTexture({ inner: 'rgba(0,0,0,1)', outer: 'rgba(0,0,0,0)', hard: 0.1, size: 64 })), transparent: true, opacity, depthWrite: false, color: toColor(color), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    const l = this.layer({ name, geometry: g, material: mat, castShadow: false, cull: 0.35, chunk: 120 });
    return l;
  }
  groundAt(x, z) { return this.terrain ? this.terrain.meshHeightAt(x, z) : this.track.bounds.minY - 30; }
  /** Keep scatter away from a footprint (set pieces, ponds...). */
  exclude(x, z, r) { this.excludes.push({ x, z, r }); }
  isExcluded(x, z, margin = 0) {
    for (let i = 0; i < this.excludes.length; i++) { const e = this.excludes[i]; const dx = x - e.x, dz = z - e.z, rr = e.r + margin; if (dx * dx + dz * dz < rr * rr) return true; }
    return false;
  }
  /** World point beside the road at (s, lateral) standing on the GROUND (terrain), lifted by `lift`. */
  groundPoint(s, lateral, out = new THREE.Vector3(), lift = 0) {
    this.track.pointAt(s, lateral, out, 0);
    out.y = this.groundAt(out.x, out.z) + lift;
    return out;
  }

  // ---- build --------------------------------------------------------------------------------------------------------
  _build() {
    const c = this.cfg, ph = this.stats.phases;
    let t = performance.now();
    const lap = (k) => { const n = performance.now(); ph[k] = (ph[k] ?? 0) + (n - t); t = n; };
    this._buildLightsAndSky(); lap('sky');
    if (this.terrain) {
      this.terrain.build(this.quality);
      this.group.add(this.terrain.group);
    }
    lap('terrain');
    this._buildRoadSurface(); lap('road');
    const gapSkip = this.track.gaps.map((g) => [g.s0 - 2, g.s1 + 2]);
    const barriers = buildBarriers(this, c.barriers ? { ...c.barriers, skip: [...(c.barriers.skip ?? []), ...gapSkip] } : null);
    if (barriers) this.group.add(barriers);
    lap('barriers');
    const pads = buildBoostPads(this, c.boost);
    if (pads) this.group.add(pads);
    if (this.track.ramps.length) this.group.add(buildRamps(this, c.ramp ?? {}));
    { const sz = buildSurfaceZones(this, c.zones ?? {}); if (sz) this.group.add(sz); }
    if (c.signs !== false) { const signs = buildCornerSigns(this, c.signs ?? {}); if (signs) this.group.add(signs); }
    if (c.start !== false) this.group.add(buildStartLine(this, { sub: this.def.name?.toUpperCase(), ...c.start }));
    lap('features');
    let inst = 0;
    for (const l of this.layers) { l.build(); inst += l.chunks.reduce((a, m) => a + m.userData.full, 0); }
    lap('layers');
    this.stats.layers = this.layers.length; this.stats.instances = inst;
    this.applyQuality(this.quality);
  }

  /** Stretches of road between `gap` zones (a closed loop when there are none). */
  _roadRuns() {
    const tr = this.track, L = tr.length;
    const g = tr.gaps.slice().sort((a, b) => a.s0 - b.s0);
    if (!g.length) return [{ s0: 0, s1: L, loop: true }];
    return g.map((gap, i) => ({ s0: gap.s1, s1: i + 1 < g.length ? g[i + 1].s0 : g[0].s0 + L, loop: false }));
  }

  _buildRoadSurface() {
    const tr = this.track, rc = this.cfg.road;
    const roadTex = this.tex(roadTexture(rc.texture ?? {}));
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: rc.roughness ?? 0.88, metalness: rc.metalness ?? 0 });
    if (rc.emissive) { roadMat.emissive = toColor(rc.emissive); roadMat.emissiveMap = roadTex; roadMat.emissiveIntensity = rc.emissiveIntensity ?? 0.2; }
    if (rc.wet) wetRoad(roadMat, this.timeUniform, rc.wet);
    const cu = { a: '#e5413a', b: '#f8f6ee', width: 0.95, ...(rc.curb ?? {}) };
    let curbMat = null;
    if (cu.width > 0) {
      curbMat = new THREE.MeshStandardMaterial({ map: this.tex(curbTexture({ a: cu.a, b: cu.b })), roughness: 0.7, metalness: 0 });
      if (cu.emissive) { curbMat.emissive = toColor(cu.emissive); curbMat.emissiveIntensity = cu.emissiveIntensity ?? 0.6; }
    }
    const sh = { ground: 'grass', tint: '#ffffff', tile: 10, ...(rc.shoulder ?? {}) };
    let shMat = null;
    if (sh.ground) {
      shMat = new THREE.MeshLambertMaterial({ map: this.tex(sh.map ?? groundTexture(sh.ground, sh.groundOverrides)), color: toColor(sh.tint) });
      if (sh.emissive) shMat.emissive = toColor(sh.emissive);
    }
    const fa = { color: '#4a4f5e', depth: 0.9, ...(rc.fascia ?? {}) };
    const faMat = fa.depth > 0 ? new THREE.MeshLambertMaterial({ color: toColor(fa.color), side: THREE.DoubleSide }) : null;
    const cw = cu.width > 0 ? cu.width : 0;
    const add = (geo, mat, name, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.receiveShadow = shadow; m.matrixAutoUpdate = false; this.group.add(m); return m; };

    for (const run of this._roadRuns()) {
      const rows = makeRows(tr, run.s0, run.s1, tr.spacing);
      const vRoad = run.loop ? loopVScale(tr, 12) : 12, vCurb = run.loop ? loopVScale(tr, 4) : 4;
      this.roadMesh = add(ribbon(rows, { l0: (r) => -r.hw, l1: (r) => r.hw, lift: 0.02, vScale: vRoad }), roadMat, 'road');
      if (curbMat) {
        add(ribbon(rows, { l0: (r) => -r.hw - cu.width, l1: (r) => -r.hw, lift: 0.045, vScale: vCurb }), curbMat, 'curb');
        add(ribbon(rows, { l0: (r) => r.hw, l1: (r) => r.hw + cu.width, lift: 0.045, vScale: vCurb }), curbMat, 'curb');
      }
      if (shMat) {
        for (const side of [-1, 1]) {
          add(ribbon(rows, {
            l0: side < 0 ? (r) => -r.hw - r.sh : (r) => r.hw + cw, l1: side < 0 ? (r) => -r.hw - cw : (r) => r.hw + r.sh,
            lift: 0.0, vScale: sh.tile, uMode: 'metres', uScale: sh.tile, vOffset: side * 0.37,
          }), shMat, 'shoulder');
        }
      }
      if (faMat) for (const side of [-1, 1]) add(skirt(rows, { side, lateral: (r) => r.hw + r.sh, depth: fa.depth }), faMat, 'fascia', false);
      if (!run.loop) this._buildRunCaps(rows, fa);
    }
  }

  /** Rock/concrete end faces where the road stops at a gap (so the cut-off road has thickness, not a paper edge). */
  _buildRunCaps(rows, fa) {
    const B = new GeoBuilder();
    const col = toColor(this.cfg.road.capColor ?? this.cfg.road.fascia?.color ?? '#7a6a58');
    for (const [row, dir] of [[rows[0], -1], [rows[rows.length - 1], 1]]) {
      const e = row.hw + row.sh, d = this.cfg.road.capDepth ?? 3.2;
      const l = new THREE.Vector3().copy(row.pos).addScaledVector(row.right, -e), r = new THREE.Vector3().copy(row.pos).addScaledVector(row.right, e);
      const lb = l.clone(); lb.y -= d; const rb = r.clone(); rb.y -= d;
      // front face (towards the gap) + a darker underside slab so it reads as a ledge
      if (dir > 0) B.quad(l, r, rb, lb, col); else B.quad(r, l, lb, rb, col);
      const lb2 = lb.clone().addScaledVector(row.tan, -dir * 2.5), rb2 = rb.clone().addScaledVector(row.tan, -dir * 2.5);
      B.quad(lb, rb, rb2, lb2, col.clone().multiplyScalar(0.7));
    }
    const m = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.name = 'run-caps'; m.matrixAutoUpdate = false; this.group.add(m);
  }

  _buildLightsAndSky() {
    const c = this.cfg, lt = c.light, fg = c.fog;
    // sky
    const skyCfg = { top: '#3d8bff', horizon: '#cfe9ff', ...(c.sky ?? {}) };
    this.skyObj = createSky(skyCfg);
    this.sky = this.skyObj.group;
    this.sunDir.copy(this.skyObj.sunDir);
    this.group.add(this.sky);
    this.skyColor = new THREE.Color(skyCfg.horizon);
    // fog
    this.fog = new THREE.Fog(toColor(fg.color ?? skyCfg.ground ?? skyCfg.horizon).getHex(), fg.near ?? 160, fg.far ?? 900);
    this._fogBase = { near: fg.near ?? 160, far: fg.far ?? 900 };
    // hemisphere + sun
    const hemi = lt.hemi ?? {};
    this.hemi = new THREE.HemisphereLight(toColor(hemi.sky ?? skyCfg.top), toColor(hemi.ground ?? '#6b8a4a'), hemi.intensity ?? 1.05);
    this.group.add(this.hemi);
    if (lt.ambient) { this.ambient = new THREE.AmbientLight(toColor(lt.ambient.color ?? '#ffffff'), lt.ambient.intensity ?? 0.2); this.group.add(this.ambient); }
    const sunc = lt.sun ?? {};
    this.sun = new THREE.DirectionalLight(toColor(sunc.color ?? '#fff1d6'), sunc.intensity ?? 3.2);
    this._sunDist = sunc.distance ?? 150;
    this._shadowExtent = sunc.extent ?? 72;
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -this._shadowExtent; sc.right = this._shadowExtent; sc.top = this._shadowExtent; sc.bottom = -this._shadowExtent;
    sc.near = 1; sc.far = this._sunDist * 2 + 160;
    this.sun.shadow.bias = -0.00035; this.sun.shadow.normalBias = 0.35;
    this.group.add(this.sun, this.sun.target);
    // second fill light (night/neon themes may add a cool rim from the opposite side)
    if (lt.fill) {
      this.fill = new THREE.DirectionalLight(toColor(lt.fill.color ?? '#6a7cff'), lt.fill.intensity ?? 0.5);
      this.fill.position.copy(this.sunDir).multiplyScalar(-1).setY(0.4);
      this.group.add(this.fill);
    }
  }

  // ---- lifecycle ----------------------------------------------------------------------------------------------------
  attach(session) {
    this.session = session;
    const scene = session.scene;
    scene.background = this.skyColor;
    scene.fog = this.fog;
    session.app?.renderer?.setEnvironmentProfile?.({ exposure: 1, bloomStrength: 0.35, bloomThreshold: 0.9, bloomRadius: 0.5, vignette: 0.25, saturation: 1.05, contrast: 1.03, ...this.cfg.profile });
    this.applyQuality(session.quality ?? this.quality);
  }

  applyQuality(q) {
    this.quality = q ?? this.quality;
    const qq = this.quality;
    this.sun.castShadow = !!qq.shadows;
    const size = qq.shadowMapSize ?? 2048;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    const dd = qq.drawDistance ?? 1000;
    this.fog.far = Math.min(this._fogBase.far, dd * 0.95);
    this.fog.near = Math.min(this._fogBase.near, this.fog.far * 0.45);
    const dens = qq.sceneryDensity ?? 1;
    for (const l of this.layers) l.setDensity(dens);
    this.skyObj?.setFeatures?.({ clouds: !!this.cfg.sky?.clouds && qq.id !== 'low', stars: !!this.cfg.sky?.stars, aurora: !!this.cfg.sky?.aurora && qq.id !== 'low', nebula: !!this.cfg.sky?.nebula && qq.id !== 'low' });
    for (const u of this.updaters) u.onQuality?.(qq);
  }

  update(dt, session) {
    this.t += dt;
    this.timeUniform.value = this.t;
    this.skyObj.update(dt);
    const cam = session?.camera, tgt = session?.cameraTarget ?? session?.player;
    const cp = cam ? cam.position : this._camPos;
    // sun + shadow follow the action; snap to shadow-map texels so shadows do not shimmer while moving
    if (this.sun) {
      const f = this._focus.copy(tgt ? tgt.position : cp);
      const dir = this.sunDir;
      const lf = this._lf.copy(dir).negate();
      const lr = this._lr.crossVectors(lf, THREE.Object3D.DEFAULT_UP).normalize();
      const lu = this._lu.crossVectors(lr, lf).normalize();
      const texel = (this._shadowExtent * 2) / (this.sun.shadow.mapSize.x || 2048);
      const a = f.dot(lr), b = f.dot(lu);
      f.addScaledVector(lr, Math.round(a / texel) * texel - a).addScaledVector(lu, Math.round(b / texel) * texel - b);
      this.sun.target.position.copy(f);
      this.sun.position.copy(f).addScaledVector(dir, this._sunDist);
      this.sun.target.updateMatrixWorld();
    }
    // cull by distance
    const dd = this.quality.drawDistance ?? 1000;
    this.terrain?.cull(cp, dd);
    for (let i = 0; i < this.layers.length; i++) this.layers[i].cullTo(cp, dd);
    for (let i = 0; i < this.updaters.length; i++) { const u = this.updaters[i]; const f = typeof u === 'function' ? u : u.update; if (f) f(dt, this.t, cp, session); }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !o.userData.keepGeometry) o.geometry.dispose?.();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.emissiveMap?.dispose?.(); x.dispose?.(); });
    });
    this.terrain?.dispose();
    for (const l of this.layers) l.dispose();
    this.skyObj?.dispose();
    this.sun?.shadow?.map?.dispose();
    disposeTextures(this.textures);
    this.textures.length = 0;
    this.layers.length = 0;
    this.updaters.length = 0;
  }
}
