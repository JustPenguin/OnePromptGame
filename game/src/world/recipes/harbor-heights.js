// HARBOR HEIGHTS world recipe: golden-hour tropical harbour - animated sea, beach + boardwalk, a drawbridge channel, cliff road,
// lighthouse with a sweeping beam, whitewashed hill town, dockyard with a freighter and cranes, boats, palms, gulls.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture, woodTexture } from '../textures.js';
import * as N from '../scenery/nature.js';
import * as H from '../scenery/harbor.js';
import { addWater } from '../water.js';
import { createAmbient } from '../ambient.js';
import { createFlock } from '../birds.js';
import { createBillboards } from '../billboards.js';
import { buildGrandstand } from '../structures.js';
import { makeRows, ribbon } from '../ribbon.js';
import { GeoBuilder } from '../builder.js';
import { windMaterial, toColor, composeMatrix } from '../geo.js';
import { smooth, colors, ramp, clamp01 } from './kit.js';
import { addPennants } from './common.js';

export function harborHeights(w) {
  const tr = w.track;
  const mk = (id) => tr.markers[id];
  const mid = (id) => (mk(id).s0 + mk(id).s1) / 2;
  const pt = (s, lat) => tr.pointAt(s, lat, new THREE.Vector3());
  const yawAt = (s) => tr.sampleAt(s).yaw;
  const gap = tr.gaps[0];
  const sGap = (gap.s0 + gap.s1) / 2;
  const pGap = pt(sGap, 0);
  const headland = (() => { const p = pt(mid('H'), 72); return { x: p.x, z: p.z }; })();
  const townR = [mk('I').s0 - 20, mk('K>').s1 + 20];

  // ---- coast: signed distance to the shoreline (positive inland): sea to the south and east, a headland at the lighthouse -------------
  const coastZ = (x, n) => 292 + 14 * Math.sin(x * 0.012) + n * 9;
  const coastX = (z, n) => 398 + 18 * Math.sin(z * 0.01 + 1) + n * 8;
  const shore = (x, z, n) => {
    let cd = Math.min(coastZ(x, n) - z, coastX(z, n) - x);
    cd = Math.max(cd, 56 - Math.hypot(x - headland.x, z - headland.z));
    return cd;
  };
  const cSandA = new THREE.Color('#f0d8a0'), cSandB = new THREE.Color('#fbeac0'), cWet = new THREE.Color('#c9a874');
  const cGrassA = new THREE.Color('#5aa83c'), cGrassB = new THREE.Color('#8cc050'), cDry = new THREE.Color('#c0b060'), cRock = new THREE.Color('#9a8a78'), cMountain = new THREE.Color('#4f8a68');
  const cFar = new THREE.Color('#d8b890');

  w.configure({
    sky: {
      top: '#2d7ad6', mid: '#78b6ee', horizon: '#ffd9a4', ground: '#ffd098', horizonBand: 0.08,
      sun: { azimuth: 232, elevation: 15, size: 0.05, glow: 1.5, color: '#ffc882' },
      clouds: { scale: 1.4, low: 0.52, high: 0.8, opacity: 0.9, color: '#fff0dc', shade: '#e6a888', wind: [0.005, 0.002] },
    },
    light: { hemi: { sky: '#8fc2f4', ground: '#e0b080', intensity: 1.0 }, sun: { color: '#ffc77c', intensity: 3.7, extent: 76 }, fill: { color: '#a8c8ff', intensity: 0.5 } },
    fog: { color: '#ffd6a0', near: 170, far: 980 },
    profile: { exposure: 1.02, bloomStrength: 0.45, bloomThreshold: 0.86, bloomRadius: 0.6, vignette: 0.26, saturation: 1.12, contrast: 1.05 },
    road: {
      texture: { base: '#5c5a62', light: '#76747e', dark: '#434149', centerColor: '#ffffff', patches: 0.35, cracks: 0.7 },
      curb: { a: '#e5413a', b: '#fffdf4' },
      shoulder: { ground: 'sand', tint: '#fff0c8' },
      fascia: { color: '#b8a890', depth: 1.0 },
      capColor: '#8a8a92', capDepth: 4,
    },
    barriers: { type: 'rail', rail: '#f4f6fb', post: '#2a8ac8', height: 0.95, lowerRail: true },
    start: { banner: 'HARBOR HEIGHTS', sub: 'BLOSSOM CUP · ROUND 4', bg: '#18b8b0', trim: '#ffd23f' },
    ramp: { tex: { base: '#6a7488', grain: false, stripeA: '#ff9a3a', stripeB: '#1b2230', chevron: '#ffffff' }, side: '#8892a8', lip: '#ff9a3a', metalness: 0.2 },
    free: [{ s0: gap.s0 - 4, s1: gap.s1 + 4, fade: 5 }],
    terrain: {
      map: w.tex(groundTexture('neutral')),
      uvMeters: 12, cell: 5, sink: 0.35, clearance: 3, blend: 34,
      natural(x, z, c) {
        const n = c.noise, d = c.dist;
        const cn = n.fbm(x * 0.02, z * 0.02, 2);
        const cd = shore(x, z, cn);
        // land
        const hills = n.fbm(x * 0.006 + 5, z * 0.006, 3);
        let land = c.refY + hills * (2 + 20 * smooth(30, 260, d)) + n.fbm(x * 0.03, z * 0.03, 2) * 0.8;
        const inland = smooth(0, 240, cd);
        land += 120 * Math.pow(smooth(120, 560, cd), 1.4) * (0.55 + 0.45 * (n.ridge(x * 0.004, z * 0.004, 3)));   // mountain backdrop inland
        // beaches are gentle where the road is low, cliffs where it is high
        const shoreW = 34 - 22 * smooth(2.5, 9, c.refY);
        const w1 = smooth(-3, shoreW, cd);
        const seabed = -1.4 + Math.min(0, cd) * 0.07 - 1.2 * smooth(-60, -400, cd) * 10;
        const beach = Math.max(0, Math.min(land, c.refY * 0.6)) * smooth(-3, shoreW, cd);
        let h = seabed + (land - seabed) * w1;
        // headland knoll
        const hk = Math.hypot(x - headland.x, z - headland.z);
        if (hk < 70) h += 13 * Math.pow(1 - smooth(10, 70, hk), 1.3);
        if (cd > 6) h = Math.max(h, 0.7 + 0.5 * smooth(6, 40, cd));   // no inland puddles: dips stay above sea level
        return h;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;
        const cd = shore(x, z, c.noise.fbm(x * 0.02, z * 0.02, 2));
        // tropical green inland, sand near the water, dry scrub on high ground
        out.copy(cGrassA).lerp(cGrassB, clamp01(n * 1.2));
        out.lerp(cDry, smooth(14, 40, y) * 0.5 * n);
        const sandMask = smooth(40, 6, cd) * smooth(1.2, 3.8, 4.2 - y + 1.0) ;
        out.lerp(cSandA, smooth(30, 8, cd) * 0.95).lerp(cSandB, smooth(0.6, 0.9, n) * smooth(30, 8, cd) * 0.5);
        out.lerp(cWet, smooth(2.0, -0.4, y) * 0.8);
        if (ny < 0.8) out.lerp(cRock, smooth(0.8, 0.55, ny) * 0.9);
        out.lerp(cMountain, smooth(50, 140, y) * 0.5);
        out.multiplyScalar(1 + 0.1 * (1 - smooth(8, 40, c.dist)));
        out.lerp(cFar, smooth(500, 1400, c.dist) * 0.4);
      },
    },
  });

  // ---- water: harbour channel under the drawbridge, inner basin, the sea -----------------------------------------------------------
  const chCross = pGap;
  const across = (lat, along = 0) => { const p = tr.pointAt(sGap + along, lat, new THREE.Vector3()); return [p.x, p.z]; };
  const basinC = (() => { const p = pt(sGap - 8, -150); return p; })();
  addWater(w, { kind: 'pond', x: basinC.x, z: basinC.z, rx: 66, rz: 46, rot: yawAt(sGap) + 0.2, level: 0, depth: 4, bank: 16, colors: { shallow: '#48dcd0', deep: '#0b66b4' }, waveScale: 0.12, waveAmp: 0.6, foam: 0.6 });
  addWater(w, {
    kind: 'stream', points: [across(-150), across(-96, 4), across(-52, -2), across(-26), across(0), across(34, 6), across(80, 0), across(118, -8), across(170, 10)], level: 0, depth: 4.2, bank: 12,
    width: (t) => 22 - 7 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 4 * smooth(0.55, 1, t), colors: { shallow: '#48dcd0', deep: '#0b66b4' }, waveScale: 0.13, waveAmp: 0.7, foam: 0.7,
  });
  w.terrain.ensureGrid();
  const inn = w.terrain.inner;
  const shoreDist = (x, z) => shore(x, z, w.noise.fbm(x * 0.02, z * 0.02, 2));
  addWater(w, { kind: 'sea', level: 0, box: [inn.x0, inn.z0, inn.x1, inn.z1], depth: 8, texel: 3, depthFn: (x, z) => (shoreDist(x, z) < 3 ? Math.max(0, -w.groundAt(x, z)) : 0), colors: { shallow: '#46e2d2', deep: '#0a62b2' }, waveScale: 0.085, waveSpeed: 0.55, waveAmp: 0.9, foam: 1.0, depthScale: 8 });
  addWater(w, { kind: 'sea', level: 0, box: [-2600, -2600, 2600, 2600], depth: 8, texel: 600, colors: { shallow: '#2cb0d6', deep: '#0a5aa8' }, waveScale: 0.05, waveSpeed: 0.45, waveAmp: 0.9, foam: 0.0, depthScale: 8, depthFn: (x, z) => (shoreDist(x, z) < 3 ? 6 : 0) });
  w.exclude(basinC.x, basinC.z, 80);
  w.exclude(chCross.x, chCross.z, 40);

  // ---- structures ----------------------------------------------------------------------------------------------------------------
  w.place(buildGrandstand(w, { s: -10, length: 60, side: -1, gap: 6.5, tiers: 5, roof: '#18b8b0', roof2: '#ffffff', frame: '#f0e8d8', dark: '#5a6a78', banner: { text: 'GO GO GO!', bg: '#ff9a3a' } }));
  addPennants(w, { s0: -60, s1: 250, step: 24, colors: ['#18b8b0', '#ff9a3a', '#ffffff'], sides: [1], pole: '#f4f6fb', offset: 3.4 });

  // drawbridge towers on both sides of the opening
  {
    const tower = H.bridgeTower({});
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const along of [-17, 17]) for (const side of [-1, 1]) {
      const smp = tr.sampleAt(sGap + along);
      const p = tr.pointAt(sGap + along, side * (smp.halfWidth + smp.shoulder + 2.2), new THREE.Vector3());
      const m = new THREE.Mesh(tower, mat);
      m.position.set(p.x, w.groundAt(p.x, p.z) - 1.0, p.z);
      m.rotation.y = smp.yaw + (along > 0 ? Math.PI : 0);
      m.scale.setScalar(0.85);
      m.castShadow = true;
      w.place(m);
    }
    // warning lights across the opening
    createBillboards(w, [-17, 17].flatMap((al) => [-1, 1].map((sd) => { const smp = tr.sampleAt(sGap + al); const p = tr.pointAt(sGap + al, sd * (smp.halfWidth + smp.shoulder + 2.2), new THREE.Vector3()); return { x: p.x, y: p.y + 17.5, z: p.z, size: 5, color: '#ff4a3a', flicker: 0.0, pulse: 1, phase: sd * 0.3 + al }; })), { name: 'bridge-lights', intensity: 1.2, fadeFar: 500 });
  }

  // boardwalk strip beside the beach along the promenade (outside the barrier, sea side)
  {
    const s0 = mk('S0>').s0 + 4, s1 = mk('S1>').s0 + 40;
    const rows = makeRows(tr, s0, s1 + 0, 2.0).filter((r) => Math.abs(r.s - sGap) > 26);
    const tex = w.tex(woodTexture({ base: '#b88a54', dark: '#7a5230', light: '#d8a86a', planks: 8, across: false }));
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const g = ribbon(rows, { l0: (r) => r.hw + r.sh + 1.4, l1: (r) => r.hw + r.sh + 5.6, lift: 0.14, vScale: 4, uMode: 'metres', uScale: 4 });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'boardwalk'; w.place(m);
  }

  // ---- lighthouse ----------------------------------------------------------------------------------------------------------------------
  {
    const lh = H.lighthouse({});
    const m = new THREE.Mesh(lh.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.position.set(headland.x, w.groundAt(headland.x, headland.z) - 1.0, headland.z);
    m.castShadow = true; m.receiveShadow = true; m.name = 'lighthouse';
    w.place(m);
    w.exclude(headland.x, headland.z, 16);
    const bg = H.beamGeometry(260, 34);
    const bm = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0.34 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'attribute float aWave; varying float vA; void main(){ vA = aWave; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uI; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0,0.86,0.5) * vA * vA * uI, vA * vA * uI); }',
    });
    const beam = new THREE.Mesh(bg, bm);
    beam.position.set(headland.x, m.position.y + lh.lampY + 1.0, headland.z);
    beam.frustumCulled = false; beam.renderOrder = 7;
    w.place(beam);
    w.addUpdater((dt, t) => { beam.rotation.y = t * 0.7; });
    createBillboards(w, [{ x: headland.x, y: m.position.y + lh.lampY + 1.0, z: headland.z, size: 26, color: '#ffe39a', pulse: 0.4 }], { name: 'lighthouse-glow', intensity: 1.1, fadeFar: 1200 });
  }

  // ---- hill town -------------------------------------------------------------------------------------------------------------------------
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wallTints = [new THREE.Color('#ffffff'), new THREE.Color('#fff6e4'), new THREE.Color('#f4ecd8'), new THREE.Color('#ffeadb')];
  const wallTint = (rnd) => wallTints[(rnd() * wallTints.length) | 0];
  const houseVariants = [
    { roof: '#c8532f', shutter: '#2a8ac8' }, { roof: '#c8532f', shutter: '#2aa86a' }, { roof: '#d88a2a', shutter: '#c8302a' }, { roof: '#e8e0d0', shutter: '#2a8ac8', flat: true },
  ];
  const onLand = (c) => shoreDist(c.x, c.z) > 8;
  const dryWater = (c) => !w.waters.some((b) => b.kind !== 'sea' && (b.depthAt(c.x, c.z) > 0 || b.depthAt(c.x + 5, c.z) > 0 || b.depthAt(c.x - 5, c.z) > 0 || b.depthAt(c.x, c.z + 5) > 0 || b.depthAt(c.x, c.z - 5) > 0));
  houseVariants.forEach((v, i) => {
    const layer = w.layer({ name: `houses-${i}`, geometry: H.house({ seed: i + 3, wall: '#f8f3e8', ...v, floors: i % 2 ? 2 : 3 }), material: lam, castShadow: true, cull: 1.5 });
    w.scatter(layer, { perKm: 15, ranges: [townR], side: 'both', dist: [4, 44], bias: 1.3, scale: [0.95, 1.4], align: 'facing', alignJitter: 0.3, color: wallTint, maxSlope: 0.86, accept: (c) => onLand(c) && dryWater(c), clearance: 3, tries: 12 });
    w.scatter(layer, { count: 36, side: 'both', dist: [40, 360], bias: 1.1, scale: [1.0, 1.9], color: wallTint, maxSlope: 0.8, accept: (c) => c.y > mk('I').s0 * 0 + 6 && onLand(c) && dryWater(c), clearance: 8, tries: 16 });
  });
  {
    const bt = new THREE.Mesh(H.bellTower({}), lam);
    const p = pt(mid('J'), 44); bt.position.set(p.x, w.groundAt(p.x, p.z) - 0.5, p.z); bt.castShadow = true; w.place(bt); w.exclude(p.x, p.z, 8);
  }

  // ---- dockyard: containers, cranes and a freighter beyond the start straight -------------------------------------------------------------
  {
    const palette = ['#e5413a', '#2f8be8', '#ffd23f', '#35c759', '#ff7a1a', '#8b4dff', '#f4f6fb', '#22d3ff'];
    const layers = palette.map((c, i) => w.layer({ name: `container-${i}`, geometry: H.container({ color: c }), material: lam, castShadow: true, cull: 1.1, chunk: 120 }));
    const rnd = w.rand;
    for (let s = -230; s < 180; s += 14.5) {
      if (Math.abs(s - mid('S0>')) < 0) continue;
      const smp = tr.sampleAt(s);
      for (let row = 0; row < 2; row++) {
        const lat = smp.halfWidth + smp.shoulder + 12 + row * 4.5;
        const stack = 1 + ((rnd() * 3) | 0);
        if (rnd() < 0.18) continue;
        const p = tr.pointAt(s, lat, new THREE.Vector3());
        const gy = w.groundAt(p.x, p.z);
        for (let k = 0; k < stack; k++) layers[(rnd() * layers.length) | 0].add(p.x, gy + k * 2.6, p.z, smp.yaw + Math.PI / 2 * 0 + (rnd() < 0.5 ? 0 : 0), 1, null);
      }
    }
    // quay cranes + moored freighter further towards the sea
    const crane = H.gantryCrane({});
    const cm = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const s of [-170, -60]) {
      const smp = tr.sampleAt(s);
      const p = tr.pointAt(s, smp.halfWidth + smp.shoulder + 40, new THREE.Vector3());
      const m = new THREE.Mesh(crane, cm);
      m.position.set(p.x, w.groundAt(p.x, p.z) - 0.2, p.z);
      m.rotation.y = smp.yaw - Math.PI / 2 * 0 + Math.PI;   // boom over the water (south)
      m.castShadow = true; w.place(m); w.exclude(p.x, p.z, 14);
    }
    const lamDS = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const ship = new THREE.Mesh(H.freighter({}), lamDS);
    const sp = tr.sampleAt(-90);
    const pp = tr.pointAt(-90, sp.halfWidth + sp.shoulder + 78, new THREE.Vector3());
    ship.position.set(pp.x, 0.2, pp.z); ship.rotation.y = sp.yaw - Math.PI / 2 * 0 + Math.PI / 2; ship.castShadow = true;
    w.place(ship); w.addUpdater((dt, t) => { ship.position.y = 0.2 + Math.sin(t * 0.6) * 0.06; ship.rotation.z = Math.sin(t * 0.5) * 0.004; });
  }

  // ---- boats ------------------------------------------------------------------------------------------------------------------------------
  {
    const sailMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const specs = [];
    const sailG = [H.sailboat({ sail: '#ffffff', jib: '#ff9a3a', trimColor: '#2a6ad0' }), H.sailboat({ sail: '#fff4e0', jib: '#22d3ff', trimColor: '#e5413a' }), H.sailboat({ sail: '#ffffff', jib: '#ff3d6a', trimColor: '#18b8b0' })];
    const launchG = [H.launch({ hullColor: '#e5413a' }), H.launch({ hullColor: '#2f8be8', topColor: '#fff4e0' })];
    // moored in the basin (around its rim), drifting at sea (slow circles)
    const mkBoat = (geo, x, z, yaw, scale, kind, extra = {}) => specs.push({ geo, x, z, yaw, scale, kind, ph: w.rand() * 6.28, ...extra });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; mkBoat(i % 3 === 2 ? launchG[i % 2] : sailG[i % 3], basinC.x + Math.cos(a) * 44, basinC.z + Math.sin(a) * 30, a + Math.PI / 2, 1, 'moored'); }
    for (let i = 0; i < 6; i++) { const a = 0.9 + i * 0.5; mkBoat(sailG[i % 3], tr.bounds.maxX + 150 + i * 60, 40 + i * 70 + (i % 2) * 90, a, 1.1, 'drift', { r: 14 + i * 3, sp: 0.04 + i * 0.006 }); }
    for (let i = 0; i < 5; i++) mkBoat(launchG[i % 2], 100 + i * 120, tr.bounds.maxZ + 140 + (i % 3) * 70, 1.6, 1.0, 'drift', { r: 25, sp: 0.05 });
    const groups = new Map();
    for (const s of specs) { const k = s.geo.uuid; if (!groups.has(k)) groups.set(k, { geo: s.geo, list: [] }); groups.get(k).list.push(s); }
    const meshes = [...groups.values()].map((g) => { const m = new THREE.InstancedMesh(g.geo, sailMat, g.list.length); m.frustumCulled = false; m.castShadow = true; w.group.add(m); return { m, list: g.list }; });
    w.addUpdater((dt, t) => {
      for (const { m, list } of meshes) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          const bob = Math.sin(t * 1.1 + b.ph) * 0.09, roll = Math.sin(t * 0.9 + b.ph * 1.7) * 0.05, pitch = Math.sin(t * 0.7 + b.ph) * 0.025;
          let x = b.x, z = b.z, yaw = b.yaw;
          if (b.kind === 'drift') { const a = t * b.sp + b.ph; x += Math.cos(a) * b.r; z += Math.sin(a) * b.r; yaw = -a + Math.PI; }
          m.setMatrixAt(i, composeMatrix(x, bob + 0.05, z, yaw, b.scale, b.scale, b.scale, pitch, roll));
        }
        m.instanceMatrix.needsUpdate = true;
      }
    });
    // a distant freighter on the horizon
    const far = new THREE.Mesh(H.freighter({ seed: 5, hullColor: '#2a4a8a' }), sailMat);
    far.position.set(tr.bounds.maxX + 520, 0.2, tr.bounds.maxZ + 300); far.rotation.y = 2.3; far.scale.setScalar(1.4); w.place(far);
  }

  // ---- beach & palms ---------------------------------------------------------------------------------------------------------------------------
  const wind = windMaterial(w.timeUniform, { sway: 0.5, flag: 0.5, side: THREE.DoubleSide });
  const blobs = w.blobLayer({ opacity: 0.32, color: '#40280a' });
  const palmA = w.layer({ name: 'palms-a', geometry: H.palmTree({ seed: 1 }), material: wind, castShadow: true, cull: 1.2 });
  const palmB = w.layer({ name: 'palms-b', geometry: H.palmTree({ seed: 2, height: 9, fronds: 12 }), material: wind, castShadow: true, cull: 1.2 });
  for (const l of [palmA, palmB]) w.scatter(l, { perKm: 34, side: 'both', dist: [2, 52], bias: 1.4, scale: [0.85, 1.4], accept: (c) => shoreDist(c.x, c.z) > 4 && dryWater(c), maxSlope: 0.85, clearance: 3.5, blob: { layer: blobs, k: 3.4 }, cluster: { freq: 0.015, threshold: 0.35 } });
  const palmFar = w.layer({ name: 'palms-far', geometry: H.palmTree({ seed: 3, fronds: 8 }), material: wind, castShadow: false, cull: 1.4 });
  w.scatter(palmFar, { count: 260, side: 'both', dist: [50, 420], bias: 1.1, scale: [1.2, 2.2], accept: (c) => shoreDist(c.x, c.z) > 4 && dryWater(c), maxSlope: 0.78, clearance: 8 });
  const veg = windMaterial(w.timeUniform, { sway: 0.4 });
  const bush = w.layer({ name: 'bushes', geometry: N.bush({ detail: 1, leaf: ['#2f8f48', '#79cf58'] }), material: veg, castShadow: false, cull: 0.6 });
  w.scatter(bush, { perKm: 70, side: 'both', dist: [1, 30], bias: 1.6, scale: [0.7, 1.5], accept: (c) => shoreDist(c.x, c.z) > 6 && dryWater(c), clearance: 2.5 });
  const flowers = ['#ff3d9a', '#ffd23f', '#ff7a1a', '#ffffff'].map((cc, i) => w.layer({ name: `flowers-${i}`, geometry: N.flowerTuft({ head: cc, seed: i + 7 }), material: veg, castShadow: false, cull: 0.16, chunk: 90 }));
  flowers.forEach((l, i) => w.scatter(l, { perKm: 160, side: 'both', dist: [0.5, 24], bias: 1.7, scale: [0.9, 1.6], cluster: { freq: 0.03 + i * 0.004, threshold: 0.58 }, accept: (c) => shoreDist(c.x, c.z) > 8 && dryWater(c), clearance: 1.8 }));
  const rocks = w.layer({ name: 'rocks', geometry: N.rock({ detail: 1, color: ['#8a7a68', '#c4b49c'] }), material: lam, castShadow: true, cull: 0.7 });
  w.scatter(rocks, { perKm: 26, side: 'both', dist: [2, 70], bias: 1.4, scale: [0.6, 2.4], scaleBias: 2, sink: 0.25, accept: dryWater, maxSlope: 0.85, blob: { layer: blobs, k: 2.4 } });
  // beach umbrellas + loungers on the sand south of the promenade
  {
    const umb = ['#ff3d6a', '#22d3ff', '#ffd23f', '#ff7a1a'].map((c, i) => w.layer({ name: `umbrella-${i}`, geometry: H.umbrella({ a: c, b: '#ffffff' }), material: lam, castShadow: true, cull: 0.6 }));
    umb.forEach((l) => w.scatter(l, { count: 9, ranges: [[mk('S0>').s0 + 40, mk('S1>').s0 + 40]], side: 'right', dist: [8, 22], scale: [0.9, 1.2], accept: (c) => shoreDist(c.x, c.z) > 2 && c.y > 0.15, clearance: 2, tries: 40, blob: { layer: blobs, k: 2.6 } }));
    const lounge = w.layer({ name: 'loungers', geometry: H.lounger({}), material: lam, castShadow: false, cull: 0.4 });
    w.scatter(lounge, { count: 22, ranges: [[mk('S0>').s0 + 40, mk('S1>').s0 + 40]], side: 'right', dist: [8, 22], align: 'road', scale: [1, 1.15], accept: (c) => shoreDist(c.x, c.z) > 2 && c.y > 0.15, clearance: 2, tries: 40 });
  }

  // ---- seagulls --------------------------------------------------------------------------------------------------------------------------------------
  w.addUpdater(createFlock(w, { name: 'gulls-start', count: 9, center: [pt(60, 100).x, tr.sampleAt(60).position.y, pt(60, 100).z], radius: 70, height: 38, speed: 0.2, size: 1.5, flap: 8 }));
  w.addUpdater(createFlock(w, { name: 'gulls-light', count: 7, center: [headland.x, 6, headland.z], radius: 55, height: 52, speed: 0.17, size: 1.6, flap: 7 }));
  w.addUpdater(createFlock(w, { name: 'gulls-basin', count: 8, center: [basinC.x, 0, basinC.z], radius: 60, height: 30, speed: 0.24, size: 1.4, flap: 9 }));
  // sea sparkle motes in the low sun
  w.addUpdater(createAmbient(w, { name: 'motes', count: 420, box: [90, 24, 90], size: [0.14, 0.14], color: '#ffe6b0', opacity: 0.4, velocity: [0.8, 0.12, 0.3], sway: 1.0, additive: true }));
}
