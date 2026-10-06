// SPOOKY HOLLOW world recipe: a haunted forest under a huge moon - twisted trees with glowing eyes, a graveyard behind iron fences, a
// mansion on the hill, a covered bridge over the swamp, ghosts, bats, wisps, mist and hanging lanterns.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture } from '../textures.js';
import * as N from '../scenery/nature.js';
import * as SP from '../scenery/spooky.js';
import * as D from '../scenery/desert.js';
import { addWater } from '../water.js';
import { createAmbient } from '../ambient.js';
import { createBillboards } from '../billboards.js';
import { createFlock } from '../birds.js';
import { createGhosts, createMist } from '../ghosts.js';
import { createLightPools } from '../neon.js';
import { buildGrandstand } from '../structures.js';
import { buildCoveredBridge } from '../coveredBridge.js';
import { windMaterial, toColor, composeMatrix } from '../geo.js';
import { smooth, colors, maskS } from './kit.js';
import { addPennants } from './common.js';

export function spookyHollow(w) {
  const tr = w.track, L = tr.length;
  const mk = (id) => tr.markers[id];
  const pt = (s, lat) => tr.pointAt(s, lat, new THREE.Vector3());
  const yawAt = (s) => tr.sampleAt(s).yaw;
  const sBridge = mk('P0>').s0 + 160;
  const bridge = [sBridge - 30, sBridge + 30];
  const graveR = [mk('P8>').s0 - 10, mk('P10>').s1 + 30];
  const hill = { x: 40, z: -70, r: 140, h: 44 };
  const swampC = pt(sBridge, 70);
  const cMoss = new THREE.Color('#2e4a3c'), cMoss2 = new THREE.Color('#4a6a44'), cDirt = new THREE.Color('#3a2c2a'), cLeaf = new THREE.Color('#5a3a22'), cFar = new THREE.Color('#1e2c42'), cRock = new THREE.Color('#4a4e5a');

  w.configure({
    sky: {
      top: '#03051a', mid: '#0e1a3a', horizon: '#2c3e66', ground: '#10182c', horizonBand: 0.1,
      sun: { azimuth: 205, elevation: 27, size: 0.12, glow: 1.5, color: '#dce8ff', moon: true },
      clouds: { scale: 1.3, low: 0.5, high: 0.8, opacity: 0.8, color: '#6a7aa8', shade: '#0a1024', wind: [0.003, 0.001] },
      stars: { density: 0.035, scale: 85 },
    },
    light: { hemi: { sky: '#46629a', ground: '#2a4a3a', intensity: 1.15 }, sun: { color: '#9ab4ff', intensity: 2.4, extent: 66 }, fill: { color: '#6a4aff', intensity: 0.4 } },
    fog: { color: '#101a30', near: 28, far: 360 },
    profile: { exposure: 1.15, bloomStrength: 0.85, bloomThreshold: 0.7, bloomRadius: 0.8, vignette: 0.45, saturation: 1.1, contrast: 1.08 },
    road: {
      texture: { base: '#3c4258', light: '#5a6280', dark: '#2a3044', wear: '#161a28', centerColor: '#cfd8ff', edgeColor: '#aab4d8', glowEdge: '#8bff6a', patches: 0.5, cracks: 1.0, rubber: 0.5 },
      curb: { a: '#6a4cc8', b: '#c8d0f0' },
      shoulder: { ground: 'moss', tint: '#8aa090' },
      fascia: { color: '#2a2e3c', depth: 1.1 },
    },
    barriers: {
      layers: [
        { type: 'wall', height: 1.0, thickness: 1.0, a: '#4a5262', b: '#3a4252', cap: '#5a6a58', base: '#1c2230', stripe: 2.2, skip: [bridge] },
        { type: 'ironfence', ranges: [graveR], bar: '#12141c', stone: '#4a505e', stoneTop: '#6a7080', height: 1.9 },
      ],
    },
    start: { banner: 'SPOOKY HOLLOW', sub: 'STARLIGHT CUP · ROUND 3', bg: '#5a2aa8', trim: '#8bff6a', structure: '#4a506a', pillar: '#2a2e40', light: '#d8ffd0' },
    free: [{ s0: bridge[0] - 4, s1: bridge[1] + 4, fade: 18 }],
    terrain: {
      map: w.tex(groundTexture('moss', { base: '#d0d8d0', dark: '#a0aaa0', light: '#f0f8f0' })),
      uvMeters: 10, cell: 5, sink: 0.35, blend: 30, clearance: 3, outerMargin: 1300,
      natural(x, z, c) {
        const n = c.noise, d = c.dist;
        let h = c.refY + n.fbm(x * 0.012, z * 0.012, 3) * (2.2 + 9 * smooth(15, 160, d)) + n.fbm(x * 0.05, z * 0.05, 2) * 0.7;
        const hk = Math.hypot(x - hill.x, z - hill.z);
        if (hk < hill.r) h += hill.h * Math.pow(1 - smooth(10, hill.r, hk), 1.4);
        h += 55 * Math.pow(smooth(380, 1200, d), 1.2) * (0.6 + 0.4 * n.ridge(x * 0.004, z * 0.004, 3));
        return h;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;
        out.copy(cMoss).lerp(cMoss2, n * 0.8);
        out.lerp(cDirt, smooth(0.55, 0.85, c.noise.fbm(x * 0.012 + 3, z * 0.012, 2) * 0.5 + 0.5) * 0.7);
        out.lerp(cLeaf, smooth(0.6, 0.8, c.noise.fbm(x * 0.05 - 9, z * 0.05, 2) * 0.5 + 0.5) * 0.35);
        if (ny < 0.8) out.lerp(cRock, smooth(0.8, 0.55, ny));
        out.multiplyScalar(0.8 + 0.5 * (1 - smooth(5, 40, c.dist)) * 0.4);
        out.lerp(cFar, smooth(280, 1200, c.dist) * 0.5);
      },
    },
  });

  // ---- swamp + the stream under the covered bridge ---------------------------------------------------------------------------------------
  const swampLevel = tr.sampleAt(sBridge).position.y - 2.2;
  const cross = (lat, along = 0) => { const p = pt(sBridge + along, lat); return [p.x, p.z]; };
  addWater(w, { kind: 'pond', x: swampC.x, z: swampC.z, rx: 70, rz: 46, rot: yawAt(sBridge) + 0.4, level: swampLevel, depth: 3, bank: 22, colors: { shallow: '#2f6a4a', deep: '#0a2018', sky: '#2a3a6a', horizon: '#3a4a7a' }, waveScale: 0.14, waveAmp: 0.25, foam: 0.2, opacity: 0.96 });
  addWater(w, { kind: 'stream', points: [cross(70, 6), cross(36, 2), cross(10), cross(-10), cross(-34, 4), cross(-70, 12), cross(-120, 0)], level: swampLevel, depth: 2.6, bank: 14, width: (t) => 15 - 3 * Math.sin(t * 6), colors: { shallow: '#2f6a4a', deep: '#0a2018', sky: '#2a3a6a', horizon: '#3a4a7a' }, waveScale: 0.2, waveAmp: 0.3, flow: [0.02, 0], foam: 0.3, opacity: 0.96 });
  w.exclude(swampC.x, swampC.z, 82);

  // ---- structures ----------------------------------------------------------------------------------------------------------------------------
  w.place(buildCoveredBridge(w, { s0: bridge[0], s1: bridge[1], wood: '#4a3426', woodDark: '#2e2018', woodLight: '#6a4a34', beam: '#2e2018', beamTop: '#3e2c22', stone: '#6a7080', stoneTop: '#8a90a0' }));
  w.place(buildGrandstand(w, { s: -4, length: 50, side: -1, gap: 5.5, tiers: 4, roof: '#5a2aa8', roof2: '#8bff6a', frame: '#4a506a', dark: '#1e2234', banner: { text: 'BOO!', bg: '#5a2aa8' } }));
  addPennants(w, { s0: -40, s1: 200, step: 24, colors: ['#5a2aa8', '#8bff6a', '#e5e8f4'], sides: [1], pole: '#8a90a8', offset: 3 });
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#10142a') });
  // the mansion on the hill, facing the start of the climb
  {
    const mg = SP.mansion({});
    const gy = w.groundAt(hill.x, hill.z);
    const m = new THREE.Mesh(mg, lit);
    m.position.set(hill.x, gy - 0.8, hill.z);
    m.rotation.y = Math.atan2(pt(mk('P7').s0, 0).x - hill.x, pt(mk('P7').s0, 0).z - hill.z) * 0 + Math.PI * 0.9;   // front (+Z) turned toward the south-east loop
    m.castShadow = true; m.receiveShadow = true; m.name = 'mansion';
    w.place(m);
    w.exclude(hill.x, hill.z, 46);
    const wins = [];
    for (let i = -4; i <= 4; i += 2) wins.push({ x: hill.x + Math.sin(m.rotation.y + Math.PI / 2) * i * 2.8 + Math.sin(m.rotation.y) * 8, y: gy + 7, z: hill.z + Math.cos(m.rotation.y + Math.PI / 2) * i * 2.8 + Math.cos(m.rotation.y) * 8, size: 16, color: i % 4 === 0 ? '#9bff8a' : '#ffc870', flicker: 0.4, phase: i });
    createBillboards(w, wins, { name: 'mansion-glow', intensity: 0.45, fadeFar: 900 });
  }
  // lantern posts along the road (green + warm) with light pools
  {
    const geo = SP.lanternPost({});
    const layer = w.layer({ name: 'lantern-posts', geometry: geo, material: lam, castShadow: false, cull: 0.8, chunk: 180 });
    const glows = [], pools = [];
    let k = 0;
    for (let s = 6; s < L; s += 30) {
      if (s > bridge[0] - 8 && s < bridge[1] + 8) continue;
      const smp = tr.sampleAt(s), side = k++ % 2 ? 1 : -1;
      const p = tr.pointAt(s, side * (smp.halfWidth + smp.shoulder + 1.0), new THREE.Vector3());
      const gy = w.groundAt(p.x, p.z);
      const toRoad = new THREE.Vector3(-smp.right.x * side, 0, -smp.right.z * side).normalize();
      layer.add(p.x, gy - 0.05, p.z, Math.atan2(-toRoad.z, toRoad.x), 1, null);
      const green = k % 3 !== 0;
      const col = green ? '#9bff8a' : '#ffc070';
      glows.push({ x: p.x + toRoad.x * 1.6, y: gy + 3.5, z: p.z + toRoad.z * 1.6, size: 5.2, color: col, flicker: 0.5, phase: k * 0.7 });
      const pp = tr.pointAt(s, side * smp.halfWidth * 0.45, new THREE.Vector3());
      pools.push({ x: pp.x, y: pp.y, z: pp.z, r: smp.halfWidth * 0.9, color: col, ux: smp.up.x, uy: smp.up.y, uz: smp.up.z });
    }
    createBillboards(w, glows, { name: 'lantern-glows', intensity: 0.85, fadeFar: 300 });
    createLightPools(w, pools, { intensity: 0.4 });
    // lanterns hanging inside the covered bridge
    const inner = [];
    for (let s = bridge[0] + 6; s < bridge[1]; s += 12) { const p = pt(s, 0); inner.push({ x: p.x, y: p.y + 6.2, z: p.z, size: 4.4, color: '#ffb060', flicker: 0.6, phase: s }); }
    createBillboards(w, inner, { name: 'bridge-lanterns', intensity: 0.9, fadeFar: 260 });
  }

  // ---- forest ----------------------------------------------------------------------------------------------------------------------------------
  const sway = windMaterial(w.timeUniform, { sway: 0.15 });
  const blobs = w.blobLayer({ opacity: 0.38, color: '#03060c' });
  const wet = (c) => !w.waters.some((b) => b.depthAt(c.x, c.z) > 0 || b.depthAt(c.x + 4, c.z) > 0 || b.depthAt(c.x - 4, c.z) > 0 || b.depthAt(c.x, c.z + 4) > 0 || b.depthAt(c.x, c.z - 4) > 0);
  const notYard = (c) => { const q = w.road.query(c.x, c.z); return !(q.near && q.s > graveR[0] - 5 && q.s < graveR[1] + 5 && q.dist < 40); };
  const eyesPts = [];
  const treeVariants = [1, 2, 3].map((i) => w.layer({ name: `twisted-${i}`, geometry: SP.twistedTree({ seed: i, height: 6.5 + i, depth: 2 }), material: sway, castShadow: true, cull: 1.0 }));
  treeVariants.forEach((l, i) => {
    w.scatter(l, { perKm: 56, side: 'both', dist: [2.5, 70], bias: 1.4, scale: [0.85, 1.7], cluster: { freq: 0.012, threshold: 0.3 }, maxSlope: 0.82, accept: (c) => wet(c) && notYard(c), blob: { layer: blobs, k: 4.2 }, clearance: 3, excludeMargin: 2, color: [new THREE.Color('#ffffff'), new THREE.Color('#d8e0ff'), new THREE.Color('#e8d8ff')] });
  });
  const treeMid = w.layer({ name: 'twisted-far', geometry: SP.twistedTree({ seed: 7, height: 8, depth: 1, segs: 3, sides: 4 }), material: sway, castShadow: false, cull: 1.5 });
  w.scatter(treeMid, { count: 520, side: 'both', dist: [60, 560], bias: 1.05, scale: [1.2, 2.6], cluster: { freq: 0.006, threshold: 0.36 }, maxSlope: 0.78, accept: (c) => wet(c) && notYard(c), clearance: 8 });
  // dead pines on the ridges for height variation
  const spikes = w.layer({ name: 'dead-pines', geometry: N.pineTree({ tiers: 5, leaf: ['#10201c', '#1c3a30'], trunk: ['#14100e', '#2a201c'] }), material: lam, castShadow: false, cull: 1.8 });
  w.scatter(spikes, { count: 260, side: 'both', dist: [90, 760], scale: [1.8, 4.2], maxSlope: 0.75, accept: wet, clearance: 10 });
  // glowing eyes peeking out of tree trunks near the road
  {
    const rnd = w.rand;
    for (let i = 0; i < 70; i++) {
      const s = rnd() * L, smp = tr.sampleAt(s), side = rnd() < 0.5 ? -1 : 1;
      if (s > bridge[0] - 10 && s < bridge[1] + 10) continue;
      const lat = side * (smp.halfWidth + smp.shoulder + 3 + rnd() * 9);
      const p = tr.pointAt(s, lat, new THREE.Vector3()); const gy = w.groundAt(p.x, p.z);
      if (!wet({ x: p.x, z: p.z })) continue;
      const toRoad = new THREE.Vector3(-smp.right.x * side, 0, -smp.right.z * side).normalize();
      const y = gy + 1.2 + rnd() * 2.2, ex = -toRoad.z * 0.28, ez = toRoad.x * 0.28;
      const col = rnd() < 0.6 ? '#ffd23f' : '#9bff8a';
      eyesPts.push({ x: p.x + toRoad.x * 0.4 + ex, y, z: p.z + toRoad.z * 0.4 + ez, size: 0.62, color: col, flicker: 0.5, phase: i }, { x: p.x + toRoad.x * 0.4 - ex, y, z: p.z + toRoad.z * 0.4 - ez, size: 0.62, color: col, flicker: 0.5, phase: i });
    }
    createBillboards(w, eyesPts, { name: 'eyes', intensity: 1.6, fadeFar: 120 });
  }

  // ---- graveyard & friends -----------------------------------------------------------------------------------------------------------------------
  const stoneTints = [new THREE.Color('#ffffff'), new THREE.Color('#d0d8e8'), new THREE.Color('#b8c0d0')];
  const tombs = [0, 1, 2, 3].map((k) => w.layer({ name: `tomb-${k}`, geometry: SP.tombstone({ kind: k }), material: lam, castShadow: true, cull: 0.9 }));
  tombs.forEach((l) => {
    w.scatter(l, { count: 36, ranges: [graveR], side: 'both', dist: [2, 38], bias: 1.2, scale: [0.9, 1.5], tilt: 0.25, color: (rnd) => stoneTints[(rnd() * 3) | 0], accept: wet, clearance: 2.5, tries: 20, blob: { layer: blobs, k: 2.2 } });
    w.scatter(l, { perKm: 6, side: 'both', dist: [4, 60], scale: [0.9, 1.4], tilt: 0.3, color: (rnd) => stoneTints[(rnd() * 3) | 0], accept: (c) => wet(c) && notYard(c), clearance: 3 });
  });
  const crypts = w.layer({ name: 'crypts', geometry: SP.crypt({}), material: lam, castShadow: true, cull: 1.2 });
  w.scatter(crypts, { count: 6, ranges: [graveR], side: 'both', dist: [14, 46], align: 'facing', scale: [1.0, 1.4], accept: wet, clearance: 6, tries: 30, blob: { layer: blobs, k: 7 } });
  const pumpkins = w.layer({ name: 'pumpkins', geometry: SP.pumpkin({}), material: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#301000') }), castShadow: false, cull: 0.5 });
  w.scatter(pumpkins, { perKm: 26, side: 'both', dist: [0.8, 9], bias: 1.5, align: 'facing', alignOffset: 0, scale: [0.8, 1.5], accept: wet, clearance: 1.6 });
  const pumpkinGlow = [];
  for (const m of pumpkins.chunks) { /* positions come from instance matrices */ const t = new THREE.Matrix4(), v = new THREE.Vector3(); for (let i = 0; i < m.userData.full; i++) { m.getMatrixAt(i, t); v.setFromMatrixPosition(t); pumpkinGlow.push({ x: v.x, y: v.y + 0.5, z: v.z, size: 1.8, color: '#ffa030', flicker: 0.6, phase: i }); } }
  if (pumpkinGlow.length) createBillboards(w, pumpkinGlow, { name: 'pumpkin-glow', intensity: 0.6, fadeFar: 120 });
  const reeds = w.layer({ name: 'reeds', geometry: SP.reeds({ seed: 1 }), material: windMaterial(w.timeUniform, { flag: 0.35, side: THREE.DoubleSide }), castShadow: false, cull: 0.45, chunk: 100 });
  for (const b of w.waters) w.scatter(reeds, { count: 90, ranges: [[bridge[0] - 140, bridge[1] + 140]], side: 'both', dist: [0, 40], scale: [0.8, 1.6], tries: 40, accept: (c) => !b.depthAt(c.x, c.z) && (b.depthAt(c.x + 2.5, c.z) > 0 || b.depthAt(c.x - 2.5, c.z) > 0 || b.depthAt(c.x, c.z + 2.5) > 0 || b.depthAt(c.x, c.z - 2.5) > 0), clearance: 1 });
  const rocks = w.layer({ name: 'rocks', geometry: N.rock({ detail: 1, color: ['#3e4452', '#6a7282'] }), material: lam, castShadow: true, cull: 0.7 });
  w.scatter(rocks, { perKm: 20, side: 'both', dist: [2, 70], bias: 1.3, scale: [0.6, 2.2], scaleBias: 2, sink: 0.25, accept: wet, maxSlope: 0.85, blob: { layer: blobs, k: 2.4 } });

  // ---- the supernatural: ghosts, wisps, lanterns, bats, mist ----------------------------------------------------------------------------------
  {
    const rnd = w.rand, items = [];
    for (let i = 0; i < 14; i++) {
      const s = (i / 14) * L + rnd() * 60, smp = tr.sampleAt(s), side = rnd() < 0.5 ? -1 : 1;
      const p = tr.pointAt(s, side * (smp.halfWidth + smp.shoulder + 8 + rnd() * 24), new THREE.Vector3());
      items.push({ x: p.x, y: w.groundAt(p.x, p.z) + 2.4 + rnd() * 2.6, z: p.z, r: 5 + rnd() * 9, size: 3.2 + rnd() * 1.8, speed: (0.14 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), phase: rnd() * 6.28, bob: 0.5 + rnd() * 0.7 });
    }
    for (let i = 0; i < 6; i++) { const a = i * 1.05; items.push({ x: hill.x + Math.cos(a) * 36, y: w.groundAt(hill.x, hill.z) + 14 + i * 2, z: hill.z + Math.sin(a) * 36, r: 14, size: 5, speed: 0.1, phase: a, bob: 1.1 }); }
    w.addUpdater(createGhosts(w, items, { intensity: 0.9 }));
    w.addUpdater(createMist(w, { sheets: Array.from({ length: 16 }, () => { const s = rnd() * L, p = pt(s, (rnd() - 0.5) * 70); return { x: p.x, z: p.z, y: w.groundAt(p.x, p.z) + 0.9 + rnd() * 0.8, size: 90 + rnd() * 90 }; }), color: '#8aa0c0', opacity: 0.2 }));
  }
  w.addUpdater(createAmbient(w, { name: 'wisps', count: 520, box: [80, 14, 80], size: [0.22, 0.22], color: '#9bff8a', opacity: 0.8, velocity: [0.35, 0.18, 0.15], sway: 2.4, additive: true, twinkle: 3 }));
  w.addUpdater(createAmbient(w, { name: 'fireflies', count: 200, box: [60, 8, 60], size: [0.14, 0.14], color: '#ffe08a', opacity: 0.95, velocity: [0.1, 0.05, 0.05], sway: 3.2, additive: true, twinkle: 5 }));
  {
    // floating paper lanterns drifting up and away across the forest
    const rnd = w.rand, n = 26, st = [];
    for (let i = 0; i < n; i++) { const s = rnd() * L, p = pt(s, (rnd() - 0.5) * 140); st.push({ x: p.x, z: p.z, y0: w.groundAt(p.x, p.z) + 6, ph: rnd() * 60, sp: 0.8 + rnd() * 0.6 }); }
    const mesh = createBillboards(w, st.map((q) => ({ x: q.x, y: q.y0, z: q.z, size: 2.6, color: '#ffa850', flicker: 0.35, phase: q.ph })), { name: 'floating-lanterns', intensity: 1.2, fadeFar: 420 });
    const m4 = new THREE.Matrix4();
    w.addUpdater((dt, t) => { for (let i = 0; i < n; i++) { const q = st[i], u = ((t * 0.02 * q.sp + q.ph) % 1); mesh.setMatrixAt(i, m4.makeScale(2.6, 2.6, 2.6).setPosition(q.x + Math.sin(t * 0.3 + q.ph) * 6 + u * 40, q.y0 + u * 70, q.z + Math.cos(t * 0.25 + q.ph) * 5)); } mesh.instanceMatrix.needsUpdate = true; });
  }
  const mp = tr.sampleAt(0).position;
  w.addUpdater(createFlock(w, { name: 'bats-moon', count: 14, center: [hill.x, 30, hill.z - 30], radius: 90, height: 70, speed: 0.34, size: 1.3, flap: 22, bob: 7, body: '#07060c', wing: '#0e0b16', tip: '#1a1424' }));
  w.addUpdater(createFlock(w, { name: 'bats-road', count: 8, center: [mp.x + 60, 0, mp.z - 120], radius: 70, height: 22, speed: 0.42, size: 1.2, flap: 24, bob: 3, body: '#07060c', wing: '#0e0b16', tip: '#1a1424' }));
}
