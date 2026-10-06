// FROSTBITE PEAK world recipe: blue-hour alpine twilight under an aurora, snowy pines, a frozen lake, a chalet lodge and a ski lift.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture } from '../textures.js';
import * as N from '../scenery/nature.js';
import * as S from '../scenery/snow.js';
import { addWater } from '../water.js';
import { createAmbient } from '../ambient.js';
import { createPlume } from '../plumes.js';
import { createBillboards } from '../billboards.js';
import { buildGrandstand } from '../structures.js';
import { GeoBuilder } from '../builder.js';
import { windMaterial, toColor, composeMatrix } from '../geo.js';
import { smooth, ramp, colors } from './kit.js';
import { addPennants, addLamps } from './common.js';

export function frostbitePeak(w) {
  const tr = w.track;
  const Y = new THREE.Vector3(0, 1, 0);
  const mk = (id) => tr.markers[id];
  const mid = (id) => (mk(id).s0 + mk(id).s1) / 2;
  const pt = (s, lat) => tr.pointAt(s, lat, new THREE.Vector3());
  const yawAt = (s) => tr.sampleAt(s).yaw;
  const clamp = (v) => Math.min(1, Math.max(0, v));

  const pLake = pt(mid('V10>') - 30, 74);
  const lakeYaw = yawAt(mid('V10>'));
  const lakeLevel = tr.sampleAt(mid('V10>')).position.y - 3.4;
  const sLodge = -40;

  const cSnowA = new THREE.Color('#dfe9ff'), cSnowB = new THREE.Color('#f7fbff'), cShade = new THREE.Color('#9fb6e8'), cRock = new THREE.Color('#566586'), cFar = new THREE.Color('#a8c0f0');
  const tmp = new THREE.Color();

  w.configure({
    sky: {
      top: '#050c33', mid: '#16348a', horizon: '#7aa8ec', ground: '#a8c4f0', horizonBand: 0.12,
      sun: { azimuth: 28, elevation: 20, size: 0.04, glow: 0.7, color: '#d8e4ff' },
      stars: { density: 0.05, scale: 95 },
      aurora: { colors: ['#38ffa6', '#7a6bff'], intensity: 1.05 },
    },
    light: { hemi: { sky: '#7fa4ee', ground: '#cfe0ff', intensity: 1.45 }, sun: { color: '#cfdcff', intensity: 2.5, extent: 74 }, fill: { color: '#8aa6ff', intensity: 0.45 } },
    fog: { color: '#7fa6e6', near: 90, far: 760 },
    profile: { exposure: 1.18, bloomStrength: 0.6, bloomThreshold: 0.72, bloomRadius: 0.7, vignette: 0.32, saturation: 1.1, contrast: 1.06 },
    road: {
      texture: { base: '#3a4662', light: '#52607e', dark: '#283249', wear: '#1a2234', centerColor: '#ffb347', edgeColor: '#ffffff', patches: 0.3, cracks: 0.7 },
      curb: { a: '#2bb5ff', b: '#ffffff' },
      shoulder: { ground: 'snow', tint: '#f2f7ff' },
      fascia: { color: '#a9bad8', depth: 1.0 },
    },
    barriers: { type: 'wall', height: 1.25, thickness: 1.35, a: '#bcdcff', b: '#eef7ff', cap: '#ffffff', base: '#7fa4d6', stripe: 2.3, emissive: '#101c30' },
    start: { banner: 'FROSTBITE PEAK', bg: '#2b7fe8', trim: '#7ee8ff', pillar: '#8aa0cc' },
    terrain: {
      map: w.tex(groundTexture('snow')),
      uvMeters: 11, cell: 5, sink: 0.35, blend: 38, clearance: 3,
      natural(x, z, c) {
        const n = c.noise, d = c.dist;
        let h = c.refY + n.fbm(x * 0.011, z * 0.011, 3) * (2.2 + 7 * smooth(14, 170, d)) + n.fbm(x * 0.045, z * 0.045, 2) * 0.5;
        const r = n.ridge(x * 0.0036 + 3, z * 0.0036 - 7, 4);
        h += smooth(110, 540, d) * (26 + 190 * Math.pow(r, 1.7));
        h += 45 * Math.pow(smooth(520, 1400, d), 1.3);
        return h;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;
        out.copy(cSnowA).lerp(cSnowB, n);
        // blue shadows in hollows / on slopes facing away
        const hh = y - c.refY;
        out.lerp(cShade, smooth(0.9, 0.7, ny) * 0.55 + smooth(2, -10, hh) * 0.2);
        // dark rock where the slope is too steep for snow
        out.lerp(tmp.copy(cRock), smooth(0.62, 0.42, ny) * 0.9);
        out.multiplyScalar(1 + 0.08 * (1 - smooth(8, 40, c.dist)));
        out.lerp(cFar, smooth(420, 1300, c.dist) * 0.45);
      },
    },
  });

  // ---- frozen lake ------------------------------------------------------------------------------------------------------
  addWater(w, { kind: 'pond', look: 'ice', x: pLake.x, z: pLake.z, rx: 64, rz: 40, rot: lakeYaw, level: lakeLevel, depth: 2.6, bank: 24, colors: { shallow: '#5fb0ea', deep: '#1f58a8', sky: '#8fb4f0', horizon: '#c0d8ff' }, texel: 1.2, carve: true });
  w.exclude(pLake.x, pLake.z, 82);

  // ---- structures --------------------------------------------------------------------------------------------------------
  w.place(buildGrandstand(w, { s: -6, length: 58, side: -1, gap: 7, tiers: 5, roof: '#2b7fe8', roof2: '#ffffff', frame: '#cdd9f0', dark: '#4a5978', banner: { text: 'GO GO GO!', bg: '#2b7fe8' } }));
  const lampMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  {
    // chalet lodge behind the grandstand, lit windows + chimney smoke
    const lod = S.lodge({});
    const p = pt(sLodge + 6, -64);
    lod.group.position.set(p.x, w.groundAt(p.x, p.z) - 0.3, p.z);
    lod.group.rotation.y = Math.atan2(pt(sLodge + 6, 0).x - p.x, pt(sLodge + 6, 0).z - p.z) + Math.PI * 0.5 * 0;
    w.place(lod.group);
    w.exclude(p.x, p.z, 16);
    const sm = lod.smokeAt.clone().applyMatrix4(lod.group.matrixWorld.identity().compose(lod.group.position, new THREE.Quaternion().setFromEuler(lod.group.rotation), new THREE.Vector3(1, 1, 1)));
    w.addUpdater(createPlume(w, { name: 'chimney', origin: [sm.x, sm.y, sm.z], count: 16, life: 6, rise: 1.6, spread: 2.4, size: [0.7, 4.2], color: '#dfe6f4', color2: '#aeb9d0', opacity: 0.45, wind: [1.4, 0, 0.5] }));
    // second cabin + a few lit cabins around the lake
    for (const [s, lat, rot] of [[mid('V10>') + 60, 105, 0.6], [mid('V10>') - 140, 118, 3.9]]) {
      const c = S.lodge({ wood: '#7a4a2c', roof: '#e8f0ff' });
      const q = pt(s, lat);
      c.group.position.set(q.x, w.groundAt(q.x, q.z) - 0.3, q.z);
      c.group.rotation.y = rot; c.group.scale.setScalar(0.6);
      w.place(c.group); w.exclude(q.x, q.z, 10);
    }
  }
  addLamps(w, { geometry: S.lampPost({}), material: lampMat, s0: -80, s1: 260, every: 38, side: -1, glow: '#ffd9a0', glowSize: 3.6, offset: 2.4 });
  addLamps(w, { geometry: S.lampPost({}), material: lampMat, s0: mid('V10>') - 130, s1: mid('V10>') + 130, every: 46, side: 1, glow: '#9fd8ff', glowSize: 3.2, offset: 2.4 });
  addPennants(w, { s0: -60, s1: 240, step: 24, colors: ['#2b7fe8', '#7ee8ff', '#ffffff'], sides: [1], pole: '#dfe8f8' });

  // igloos on the lake shore
  {
    const g = S.igloo({});
    const layer = w.layer({ name: 'igloos', geometry: g, material: lampMat, castShadow: true, cull: 1.2 });
    [[-0.55, 74], [1.15, 76], [2.05, 74], [3.4, 78]].forEach(([a, r]) => {
      const x = pLake.x + Math.cos(a + lakeYaw) * r, z = pLake.z + Math.sin(a + lakeYaw) * (r * 0.66);
      const gy = w.groundAt(x, z);
      layer.add(x, gy - 0.1, z, Math.atan2(pLake.x - x, pLake.z - z), 1.15 + (a % 1) * 0.15, null);
      w.exclude(x, z, 7);
    });
  }

  // ski lift across the infield with moving gondolas
  {
    const A = pt(mid('V12'), 66), B = pt(mid('N0>') + 70, 66);
    const ground = (p) => w.groundAt(p.x, p.z);
    const pylonG = S.liftPylon({});
    const pylons = w.layer({ name: 'lift-pylons', geometry: pylonG, material: lampMat, castShadow: true, cull: 1.3 });
    const nP = 5, tops = [];
    const dir = new THREE.Vector3().subVectors(B, A).setY(0), len = dir.length(); dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < nP; i++) {
      const u = i / (nP - 1);
      const x = A.x + (B.x - A.x) * u, z = A.z + (B.z - A.z) * u, gy = w.groundAt(x, z);
      pylons.add(x, gy - 0.3, z, Math.atan2(perp.x, perp.z) + Math.PI / 2, 1, null);
      tops.push(new THREE.Vector3(x, gy + 10.4, z));
      w.exclude(x, z, 5);
    }
    // cables (two parallel lines, 3.2 m apart) with a small sag between pylons
    const CB = new GeoBuilder();
    const steel = toColor('#4a5470');
    const pointOn = (u, off) => {
      const f = u * (nP - 1), i = Math.min(nP - 2, Math.floor(f)), t = f - i;
      const a = tops[i], b = tops[i + 1];
      const sag = 0.018 * a.distanceTo(b) * 4 * t * (1 - t);
      return new THREE.Vector3(a.x + (b.x - a.x) * t + perp.x * off, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t + perp.z * off);
    };
    for (const off of [-1.6, 1.6]) {
      const segs = 60;
      for (let i = 0; i < segs; i++) {
        const p0 = pointOn(i / segs, off), p1 = pointOn((i + 1) / segs, off);
        const d = new THREE.Vector3().subVectors(p1, p0), l = d.length(); d.normalize();
        const r = new THREE.Vector3().crossVectors(d, Y).normalize();
        const u = new THREE.Vector3().crossVectors(r, d).normalize();
        CB.box(p0.x, p0.y - 0.04, p0.z, r, u, d, 0.07, 0.07, l, steel, true);
      }
    }
    const cm = new THREE.Mesh(CB.build(), new THREE.MeshLambertMaterial({ vertexColors: true })); w.place(cm);
    const gGeo = S.gondola({ color: '#e5413a' });
    const gond = new THREE.InstancedMesh(gGeo, lampMat, 10);
    gond.frustumCulled = false; gond.castShadow = true;
    w.group.add(gond);
    w.addUpdater((dt, t) => {
      for (let i = 0; i < 10; i++) {
        const up = i < 5, base = (i % 5) / 5;
        const u = up ? (base + t * 0.012) % 1 : 1 - ((base + 0.1 + t * 0.012) % 1);
        const p = pointOn(u, up ? -1.6 : 1.6);
        const sway = Math.sin(t * 1.3 + i) * 0.05;
        gond.setMatrixAt(i, composeMatrix(p.x, p.y, p.z, Math.atan2(dir.x, dir.z), 1, 1, 1, sway, 0));
      }
      gond.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- vegetation & props ------------------------------------------------------------------------------------------------
  const veg = windMaterial(w.timeUniform, { sway: 0.2 });
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const blobs = w.blobLayer({ opacity: 0.3, color: '#0a1a40' });
  const tints = [new THREE.Color('#ffffff'), new THREE.Color('#e8f4ff'), new THREE.Color('#d4e8ff'), new THREE.Color('#f0ffff')];
  const tintFn = (rnd) => tints[(rnd() * tints.length) | 0];
  const dry = (c) => !w.waters.some((b) => b.depthAt(c.x, c.z) > 0 || b.depthAt(c.x + 4, c.z) > 0 || b.depthAt(c.x - 4, c.z) > 0 || b.depthAt(c.x, c.z + 4) > 0 || b.depthAt(c.x, c.z - 4) > 0);
  const pineA = w.layer({ name: 'pines-a', geometry: N.pineTree({ tiers: 4, snow: '#f4f9ff', leaf: ['#1a5a48', '#3f9a72'] }), material: veg, castShadow: true, cull: 1.1 });
  w.scatter(pineA, { perKm: 80, side: 'both', dist: [3, 70], bias: 1.5, scale: [0.9, 1.9], cluster: { freq: 0.012, threshold: 0.34 }, color: tintFn, maxSlope: 0.78, accept: dry, blob: { layer: blobs, k: 4.2 }, excludeMargin: 2 });
  const pineB = w.layer({ name: 'pines-b', geometry: N.pineTree({ tiers: 3, snow: '#f4f9ff', leaf: ['#17504a', '#33806a'] }), material: veg, castShadow: false, cull: 1.3 });
  w.scatter(pineB, { count: 900, side: 'both', dist: [55, 640], bias: 1.1, scale: [1.6, 4.2], cluster: { freq: 0.006, threshold: 0.38 }, color: tintFn, maxSlope: 0.75, clearance: 8, accept: dry });
  const drifts = w.layer({ name: 'drifts', geometry: S.snowDrift({}), material: lam, castShadow: false, cull: 0.6 });
  w.scatter(drifts, { perKm: 70, side: 'both', dist: [1, 30], bias: 1.6, scale: [0.8, 2.4], clearance: 2, accept: dry });
  const rocks = w.layer({ name: 'snow-rocks', geometry: S.snowRock({ seed: 2 }), material: lam, castShadow: true, cull: 0.9 });
  w.scatter(rocks, { perKm: 30, side: 'both', dist: [2, 90], bias: 1.4, scale: [0.6, 2.6], scaleBias: 2, sink: 0.25, maxSlope: 0.8, accept: dry, blob: { layer: blobs, k: 2.4 } });
  const crystalMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#1c4a7a') });
  const crystals = w.layer({ name: 'crystals', geometry: S.iceCrystals({}), material: crystalMat, castShadow: false, cull: 0.8 });
  w.scatter(crystals, { perKm: 16, side: 'both', dist: [4, 70], bias: 1.2, scale: [0.8, 1.9], accept: dry, maxSlope: 0.85 });
  const snowmen = w.layer({ name: 'snowmen', geometry: S.snowman({}), material: lam, castShadow: true, cull: 0.6 });
  w.scatter(snowmen, { perKm: 11, side: 'both', dist: [3, 34], scale: [0.9, 1.3], clearance: 3, accept: dry, maxSlope: 0.85, blob: { layer: blobs, k: 2.6 } });
  w.scatter(snowmen, { count: 8, ranges: [[-60, 200]], side: 'right', dist: [4, 30], scale: [0.9, 1.4], clearance: 3, accept: dry, blob: { layer: blobs, k: 2.6 } });

  // ---- weather: falling snow (two layers) -------------------------------------------------------------------------------------
  w.addUpdater(createAmbient(w, { name: 'snow-fine', count: 1500, box: [64, 36, 64], size: [0.09, 0.09], color: '#ffffff', opacity: 0.85, velocity: [0.9, -2.2, 0.35], sway: 0.9, map: 'hard' }));
  w.addUpdater(createAmbient(w, { name: 'snow-big', count: 360, box: [46, 28, 46], size: [0.22, 0.22], color: '#ffffff', opacity: 0.6, velocity: [0.6, -1.5, 0.2], sway: 1.3 }));

  // glowing windows of far cabins on the hillsides (little warm lights)
  {
    const items = [];
    for (let i = 0; i < 26; i++) {
      const a = w.rand() * Math.PI * 2, r = 220 + w.rand() * 380;
      const c = tr.bounds, cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      const x = cx + Math.cos(a) * r * 1.2, z = cz + Math.sin(a) * r;
      items.push({ x, y: w.groundAt(x, z) + 2.5, z, size: 9, color: '#ffc77a', flicker: 0.1, phase: w.rand() });
    }
    createBillboards(w, items, { name: 'far-cabins', intensity: 0.8, fadeFar: 900 });
  }
}
