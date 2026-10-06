// SUNNY MEADOWS world recipe: bright morning, rolling green hills, patchwork fields, a stream with a wooden bridge, a pond,
// a windmill on a knoll, a barn, hot-air balloons, a grandstand and flag-lined start straight.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture } from '../textures.js';
import * as N from '../scenery/nature.js';
import * as BLD from '../scenery/buildings.js';
import { addWater } from '../water.js';
import { buildBridge, buildGrandstand } from '../structures.js';
import { GeoBuilder } from '../builder.js';
import { windMaterial, toColor } from '../geo.js';
import { TrackQuery } from '../../track/types.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function sunnyMeadows(w) {
  const tr = w.track, L = tr.length;
  const mk = (id) => tr.markers[id] ?? { s0: 0, s1: 100 };
  const mid = (id) => (mk(id).s0 + mk(id).s1) / 2;
  const pt = (s, lat) => tr.pointAt(s, lat, new THREE.Vector3());
  const yawAt = (s) => tr.sampleAt(s).yaw;

  // ---- layout-derived anchor points (everything is placed relative to the road so layout edits move the world with it) ----
  const sBridge = mid('D>');
  const bridge = [sBridge - 22, sBridge + 22];
  const pPond = pt(sBridge + 6, 168);
  const pMill = pt(mid('F>') + 4, 92);
  const pBarn = pt(mid('T>') - 70, -88);
  const roadY = tr.sampleAt(sBridge).position.y;

  // ---- colours ----
  const cGrassA = new THREE.Color('#4a9a32'), cGrassB = new THREE.Color('#8ed253'), cGrassC = new THREE.Color('#b9dc5a'), cDirt = new THREE.Color('#9a7a4a'), cRock = new THREE.Color('#8b8f96');
  const cFar = new THREE.Color('#6fb6a8'), cBank = new THREE.Color('#7a6a44');
  const fieldDefs = [
    { s: 40, lat: -85, w: 70, d: 120, a: '#e6c34a', b: '#d9ad3b' },                    // wheat
    { s: 90, lat: 95, w: 90, d: 100, a: '#67b946', b: '#4f9d36' },                     // green crop
    { s: mid('C>') + 10, lat: 82, w: 80, d: 70, a: '#a074dc', b: '#8456c4' },          // lavender
    { s: mid('B>') + 10, lat: -70, w: 90, d: 80, a: '#ffd23f', b: '#f0b820' },         // sunflowers
    { s: mid('G>'), lat: -78, w: 70, d: 100, a: '#ff8fb4', b: '#f06a9a' },             // cosmos
    { s: mid('I>') + 30, lat: 90, w: 100, d: 70, a: '#e9d36a', b: '#d3b447' },         // wheat
  ].map((f) => {
    const p = pt(f.s, f.lat), yaw = yawAt(f.s), c = Math.cos(yaw), s = Math.sin(yaw);
    return { ...f, x: p.x, z: p.z, c, s, ca: new THREE.Color(f.a), cb: new THREE.Color(f.b) };
  });
  const tmpC = new THREE.Color();
  const fieldAt = (x, z) => {
    for (const f of fieldDefs) {
      const dx = x - f.x, dz = z - f.z;
      const u = dx * f.c - dz * f.s, v = dx * f.s + dz * f.c;             // u across (road right), v along
      const e = Math.max(Math.abs(u) / (f.w / 2), Math.abs(v) / (f.d / 2));
      if (e < 1.0) return { f, e, u, v };
    }
    return null;
  };

  w.configure({
    sky: {
      top: '#2a78f0', mid: '#62aef8', horizon: '#d6eeff', ground: '#cde6f4', horizonBand: 0.06,
      sun: { azimuth: 150, elevation: 50, size: 0.04 },
      clouds: { scale: 1.5, low: 0.52, high: 0.8, opacity: 0.95, shade: '#b4c8e6' },
    },
    light: { hemi: { sky: '#b5d6ff', ground: '#9bbd6a', intensity: 1.0 }, sun: { color: '#fff0d2', intensity: 3.7 }, fill: { color: '#d6e6ff', intensity: 0.75 } },
    fog: { color: '#d0e8f6', near: 220, far: 1050 },
    profile: { exposure: 1.0, bloomStrength: 0.28, bloomThreshold: 0.92, bloomRadius: 0.55, vignette: 0.22, saturation: 1.1, contrast: 1.04 },
    road: {
      texture: { base: '#585b67', light: '#6e7281', dark: '#454851', patches: 0.2, cracks: 0.5 },
      curb: { a: '#e5413a', b: '#f8f6ee' },
      shoulder: { ground: 'meadow', tint: '#d8ffae' },
      fascia: { color: '#8d8576', depth: 0.9 },
    },
    barriers: { type: 'fence', rail: '#fffdf4', post: '#8a5a32', cap: '#c08a52', skip: [bridge] },
    start: { banner: 'SUNNY MEADOWS', sub: 'BLOSSOM CUP · ROUND 1', bg: '#2f8be8', trim: '#ffd23f' },
    free: [{ s0: bridge[0] - 4, s1: bridge[1] + 4, fade: 22 }],
    terrain: {
      map: w.tex(groundTexture('meadow')),
      uvMeters: 11, blend: 42, sink: 0.35, cell: 5, clearance: 3.2,
      natural(x, z, c) {
        const n = c.noise, d = c.dist;
        const hills = n.fbm(x * 0.0055, z * 0.0055, 3);
        const detail = n.fbm(x * 0.02 + 40, z * 0.02, 2);
        const amp = 4.5 + 22 * smooth(25, 320, d);
        const bowl = 82 * Math.pow(smooth(130, 960, d), 1.5);
        let h = c.refY + hills * amp + detail * (1.0 + 2.6 * smooth(25, 220, d)) + bowl;
        // windmill knoll
        const km = Math.hypot(x - pMill.x, z - pMill.z);
        if (km < 62) h += 10 * Math.pow(1 - smooth(8, 62, km), 1.2);
        return h;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.028, z * 0.028, 3) * 0.5 + 0.5;
        const m = c.noise.fbm(x * 0.009 + 9, z * 0.009, 2) * 0.5 + 0.5;
        out.copy(cGrassA).lerp(cGrassB, clamp01(n * 1.3 - 0.1));
        out.lerp(cGrassC, smooth(0.62, 0.9, m) * 0.7);
        if (ny < 0.82) out.lerp(cDirt, smooth(0.82, 0.62, ny) * 0.55);
        if (ny < 0.6) out.lerp(cRock, smooth(0.6, 0.45, ny));
        const hh = y - c.refY;
        out.lerp(cGrassC, smooth(3, 14, hh) * 0.4);
        out.multiplyScalar(1 - 0.14 * smooth(0, -7, hh));
        // patchwork fields (soft edges at the grid resolution on purpose: reads as painted farmland from the road)
        const fh = fieldAt(x, z);
        if (fh) {
          const row = 0.5 + 0.5 * Math.sin(fh.v * 0.55);
          tmpC.copy(fh.f.ca).lerp(fh.f.cb, row);
          out.lerp(tmpC, 1 - smooth(0.72, 1.0, fh.e));
        }
        out.multiplyScalar(1 + 0.12 * (1 - smooth(8, 40, c.dist)));
        out.lerp(cFar, smooth(380, 1100, c.dist) * 0.45);
      },
    },
  });

  // ---- water: pond (source) -> stream -> under the bridge -> tapers into the marsh outside the loop ----
  const pondP = pPond;
  const sp = (s, lat) => { const p = pt(sBridge + s, lat); return [p.x, p.z]; };
  const streamPts = [[pondP.x, pondP.z], sp(30, 112), sp(14, 66), sp(4, 30), sp(0, 0), sp(-6, -34), sp(-20, -72), sp(-34, -120), sp(-30, -175), sp(-20, -235)];
  const waterLevel = roadY - 2.35;
  addWater(w, { kind: 'pond', x: pondP.x, z: pondP.z, rx: 40, rz: 27, rot: yawAt(sBridge) + 0.4, level: waterLevel, depth: 2.4, bank: 20, colors: { shallow: '#3fd6c6', deep: '#0d63b0' }, waveScale: 0.16 });
  addWater(w, {
    kind: 'stream', points: streamPts, level: waterLevel, depth: 1.9, bank: 13, flow: [0.02, 0.0],
    width: (t) => 9.5 * smooth(0, 0.09, t) * (1 - 0.88 * smooth(0.62, 1.0, t)) + 1.2, colors: { shallow: '#4ae0cd', deep: '#0f6fb8' }, waveScale: 0.3, waveSpeed: 0.9,
  });
  w.exclude(pondP.x, pondP.z, 62);

  // ---- set pieces ----
  w.place(buildBridge(w, { s0: bridge[0], s1: bridge[1], wood: '#b98450' }));
  // windmill, turned to face the road
  {
    const mill = BLD.windmill({ scale: 1.15 });
    const gy = w.groundAt(pMill.x, pMill.z);
    mill.group.position.set(pMill.x, gy - 0.3, pMill.z);
    const tq = tr.project(pMill, new TrackQuery(), -1);               // nearest road point: the sails face it
    const rp = tr.pointAt(tq.s, 0, new THREE.Vector3());
    mill.group.rotation.y = Math.atan2(rp.x - pMill.x, rp.z - pMill.z);
    mill.group.name = 'windmill';
    w.place(mill.group);
    w.exclude(pMill.x, pMill.z, 24);
    w.addUpdater((dt, t) => { mill.pivot.rotation.z = t * 0.55; });
  }
  // barn + silo
  {
    const barn = BLD.barn();
    const gy = w.groundAt(pBarn.x, pBarn.z);
    barn.group.position.set(pBarn.x, gy - 0.2, pBarn.z);
    barn.group.rotation.y = yawAt(mid('T>')) + Math.PI / 2;
    barn.group.name = 'barn';
    w.place(barn.group);
    w.exclude(pBarn.x, pBarn.z, 20);
  }
  // hot-air balloons drifting over the infield
  {
    const defs = [
      { c: ['#ff3d6a', '#ffd23f', '#ffffff'], at: pt(mid('B>'), 130), alt: 85, r: 38, sp: 0.045, ph: 0 },
      { c: ['#22d3ff', '#ffffff', '#2f8be8'], at: pt(mid('G>'), 150), alt: 120, r: 55, sp: -0.035, ph: 2 },
      { c: ['#ff7a1a', '#ffd23f', '#ff3d6a', '#ffffff'], at: pt(mid('I>'), 190), alt: 70, r: 30, sp: 0.05, ph: 4 },
    ].map((d) => { const b = BLD.balloon({ colors: d.c, scale: 1.0 }); w.place(b.group); return { ...d, g: b.group }; });
    w.addUpdater((dt, t) => {
      for (const d of defs) {
        const a = t * d.sp + d.ph;
        d.g.position.set(d.at.x + Math.cos(a) * d.r, d.at.y + d.alt + Math.sin(t * 0.4 + d.ph) * 2.2, d.at.z + Math.sin(a) * d.r);
        d.g.rotation.y = a * 0.5;
      }
    });
  }
  // grandstand on the right of the start straight + a second smaller one opposite
  w.place(buildGrandstand(w, { s: -6, length: 64, side: 1, gap: 7, tiers: 6, banner: { text: 'GO GO GO!', bg: '#2f8be8' } }));
  w.place(buildGrandstand(w, { s: 22, length: 44, side: -1, gap: 7, tiers: 4, roof: '#ffd23f', roof2: '#ffffff', banner: { text: 'MEADOWS GP', bg: '#e5413a' }, seed: 8 }));
  w.exclude(...(() => { const p = pt(-6, 40); return [p.x, p.z, 40]; })());

  // pennant poles along the start straight
  {
    const GBp = new GeoBuilder();
    GBp.box(0, 0, 0, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 0.16, 8.5, 0.16, { top: toColor('#e8ecf5'), side: toColor('#e8ecf5'), bottom: toColor('#e8ecf5') }, true);
    const flagCols = ['#e5413a', '#ffd23f', '#2f8be8'];
    const mat = windMaterial(w.timeUniform, { flag: 0.55, side: THREE.DoubleSide });
    flagCols.forEach((fc, vi) => {
      const B = new GeoBuilder();
      B.box(0, 0, 0, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 0.16, 8.5, 0.16, { top: toColor('#e8ecf5'), side: toColor('#e8ecf5'), bottom: toColor('#e8ecf5') }, true);
      const c = toColor(fc);
      // tapering pennant: the free end waves most (weight grows along the cloth)
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const x0 = 0.08 + (i / segs) * 2.6, x1 = 0.08 + ((i + 1) / segs) * 2.6;
        const h0 = 1.25 * (1 - 0.7 * (i / segs)), h1 = 1.25 * (1 - 0.7 * ((i + 1) / segs));
        const a = new THREE.Vector3(x0, 8.3 - h0, 0), b = new THREE.Vector3(x1, 8.3 - h1, 0), cc = new THREE.Vector3(x1, 8.3, 0), d = new THREE.Vector3(x0, 8.3, 0);
        B.quadW(a, b, cc, d, c, [i / segs, (i + 1) / segs, (i + 1) / segs, i / segs]);
      }
      const g = B.build({ wave: true });
      const layer = w.layer({ name: `pennants-${vi}`, geometry: g, material: mat, castShadow: true, cull: 0.5, chunk: 300 });
      for (let s = -50 + vi * 7; s < 230; s += 21) for (const side of [-1, 1]) {
        const smp = tr.sampleAt(s);
        const p = tr.pointAt(s, side * (smp.halfWidth + smp.shoulder + 3.2), new THREE.Vector3());
        layer.add(p.x, w.groundAt(p.x, p.z) - 0.1, p.z, smp.yaw + (side > 0 ? 0 : 0), 1, null);
      }
    });
  }

  // ---- vegetation ------------------------------------------------------------------------------------------------------
  const sway = windMaterial(w.timeUniform, { sway: 0.6 });
  const foliage = (g, name, shadow = true, cull = 1) => w.layer({ name, geometry: g, material: sway, castShadow: shadow, cull });
  const leaf = N.lambert();
  const tints = [new THREE.Color('#ffffff'), new THREE.Color('#e9ffd0'), new THREE.Color('#d6f5ff'), new THREE.Color('#ffe9b8'), new THREE.Color('#c8ffc0')];
  const tintFn = (rnd) => tints[(rnd() * tints.length) | 0];
  // reject spots in / right beside water
  const wet = (c) => {
    for (const b of w.waters) if (b.depthAt(c.x, c.z) > 0 || b.depthAt(c.x + 3, c.z) > 0 || b.depthAt(c.x - 3, c.z) > 0 || b.depthAt(c.x, c.z + 3) > 0 || b.depthAt(c.x, c.z - 3) > 0) return false;
    return true;
  };

  const blobs = w.blobLayer({ opacity: 0.4 });
  const treesNear = foliage(N.roundTree({ detail: 1, trunk: ['#5b3820', '#8a5a34'], seed: 2 }), 'trees-near');
  w.scatter(treesNear, { perKm: 40, side: 'both', dist: [3, 50], bias: 1.5, scale: [0.9, 1.7], scaleBias: 1.2, cluster: { freq: 0.011, threshold: 0.36 }, clearance: 4, color: tintFn, maxSlope: 0.8, accept: wet, excludeMargin: 2, blob: { layer: blobs, k: 4.6 } });
  const ovals = foliage(N.ovalTree({ detail: 1 }), 'trees-oval');
  w.scatter(ovals, { perKm: 16, side: 'both', dist: [6, 66], bias: 1.3, scale: [0.9, 1.6], cluster: { freq: 0.013, threshold: 0.42 }, color: tintFn, maxSlope: 0.8, accept: wet, blob: { layer: blobs, k: 3.2 } });
  const treesFar = foliage(N.roundTree({ detail: 0, blobs: 3, trunk: ['#5b3820', '#8a5a34'], seed: 6 }), 'trees-far', false, 1.2);
  w.scatter(treesFar, { count: 800, side: 'both', dist: [50, 560], bias: 1.1, scale: [1.3, 2.9], cluster: { freq: 0.006, threshold: 0.4 }, color: tintFn, maxSlope: 0.78, clearance: 8, accept: wet });
  const pines = foliage(N.pineTree({ tiers: 3 }), 'pines', false, 1.2);
  w.scatter(pines, { count: 260, side: 'both', dist: [60, 600], scale: [1.5, 3.4], cluster: { freq: 0.008, threshold: 0.5 }, minY: roadY + 4, color: tintFn, maxSlope: 0.78 });
  const bushes = foliage(N.bush({ detail: 1 }), 'bushes', false, 0.6);
  w.scatter(bushes, { perKm: 80, side: 'both', dist: [0.8, 24], bias: 1.6, scale: [0.7, 1.5], color: tintFn, clearance: 2.2, accept: wet, blob: { layer: blobs, k: 2.4 } });
  const berryBush = foliage(N.bush({ detail: 0, berry: '#ff3d6a', seed: 8 }), 'bushes-berry', false, 0.5);
  w.scatter(berryBush, { perKm: 16, side: 'both', dist: [1, 18], bias: 1.4, scale: [0.8, 1.3], clearance: 2.2, accept: wet });
  const rocks = w.layer({ name: 'rocks', geometry: N.rock({ detail: 1 }), material: leaf, castShadow: true, cull: 0.6 });
  w.scatter(rocks, { perKm: 12, side: 'both', dist: [2, 60], bias: 1.3, scale: [0.5, 1.8], scaleBias: 2, clearance: 3, color: [new THREE.Color('#ffffff'), new THREE.Color('#ffe8d0'), new THREE.Color('#d8e4ff')], sink: 0.2, accept: wet, blob: { layer: blobs, k: 2.8 } });

  // flowers: four colour layers (no per-instance tint so stems stay green) + sunflowers + grass tufts
  ['#ff5fa2', '#ffd23f', '#ffffff', '#a870ff'].forEach((col, i) => {
    const l = w.layer({ name: `flowers-${i}`, geometry: N.flowerTuft({ head: col, seed: i + 1 }), material: sway, castShadow: false, cull: 0.16, chunk: 90 });
    w.scatter(l, { perKm: 300, side: 'both', dist: [0.4, 28], bias: 1.7, scale: [0.9, 1.7], cluster: { freq: 0.03 + i * 0.004, threshold: 0.56 }, clearance: 1.8, accept: wet });
  });
  const tufts = w.layer({ name: 'grass-tufts', geometry: N.grassTuft({}), material: sway, castShadow: false, cull: 0.14, chunk: 90 });
  w.scatter(tufts, { perKm: 520, side: 'both', dist: [0.3, 32], bias: 1.8, scale: [0.9, 1.8], clearance: 1.6, accept: wet });
  const sunf = w.layer({ name: 'sunflowers', geometry: N.sunflower({}), material: sway, castShadow: false, cull: 0.3, chunk: 90 });
  w.scatter(sunf, { count: 320, side: 'both', dist: [1.5, 70], bias: 1.2, scale: [0.85, 1.3], clearance: 2.5, accept: (c) => { const f = fieldAt(c.x, c.z); return !!f && f.f.a === '#ffd23f' && wet(c); }, tries: 60 });
  const hay = w.layer({ name: 'hay', geometry: N.hayBale({}), material: leaf, castShadow: true, cull: 0.4 });
  w.scatter(hay, { count: 26, side: 'both', dist: [4, 50], clearance: 3, scale: [0.9, 1.2], accept: (c) => { const f = fieldAt(c.x, c.z); return !!f && f.f.a === '#e6c34a'; }, tries: 80, sink: 0.05 });
}
