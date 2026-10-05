// STARLIGHT SPIRAL world recipe: deep space - a nebula + planet sky, a rainbow-lit wall-less road, glowing ring gates, a rainbow Starlight
// Core in the middle of the spiral, drifting asteroids and crystal rocks, mini planets, star dust and shooting stars.   OWNER: Agent B.
import * as THREE from 'three';
import { createAmbient } from '../ambient.js';
import { createBillboards } from '../billboards.js';
import { buildRainbowEdges, buildUnderglow, createRingGates } from '../edges.js';
import * as SP from '../scenery/space.js';
import { composeMatrix, toColor } from '../geo.js';
import { addPennants } from './common.js';

export function starlightSpiral(w) {
  const tr = w.track, L = tr.length;
  const b = tr.bounds;
  const centre = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const coreY = (b.minY + b.maxY) / 2 + 10;
  const gap = tr.gaps[0];

  w.configure({
    sky: {
      top: '#03010c', mid: '#14063a', horizon: '#3a1670', ground: '#06031a', horizonBand: 0.2,
      sun: { azimuth: 40, elevation: 26, size: 0.03, glow: 0.55, color: '#fff2ff' },
      stars: { density: 0.07, scale: 110 },
      nebula: { colors: ['#6a2cff', '#ff3dcb'], intensity: 0.85 },
      planets: [
        { azimuth: 215, elevation: 12, size: 15, colors: ['#7a4ad8', '#ffb36a'], bands: 15, atmosphere: '#b898ff', atmo: 0.9, seed: 2, ring: { inner: 1.35, outer: 2.15, color: '#f0dcc0', tilt: 14, rot: -18, opacity: 0.88 } },
        { azimuth: 105, elevation: 40, size: 6.5, colors: ['#2a8ac8', '#7be0b0'], bands: 8, atmosphere: '#7ad8ff', atmo: 0.9, seed: 5 },
        { azimuth: 320, elevation: -12, size: 9, colors: ['#c83a6a', '#ffcf8a'], bands: 22, atmosphere: '#ff8ab8', atmo: 0.7, seed: 9 },
      ],
    },
    light: { hemi: { sky: '#7a5ae8', ground: '#2a1a6a', intensity: 1.15 }, sun: { color: '#e8e0ff', intensity: 2.7, extent: 70 }, fill: { color: '#ff3dcb', intensity: 0.5 } },
    fog: { color: '#0a0524', near: 500, far: 3200 },
    profile: { exposure: 1.1, bloomStrength: 1.05, bloomThreshold: 0.62, bloomRadius: 0.85, vignette: 0.36, saturation: 1.18, contrast: 1.08 },
    road: {
      textureKind: 'cosmic', texture: { base: '#15123c', top: '#261b5e' },
      roughness: 0.72, metalness: 0.1, emissive: '#2a1a7a', emissiveIntensity: 0.28,
      curb: { width: 0 },
      shoulder: { ground: null },
      fascia: { depth: 0 },
      capColor: '#4a3aa8', capDepth: 3,
    },
    barriers: null,
    // the wall-less edge: a slim indigo lip + hull under the rainbow energy band (the band itself is the glow)
    edgeTrim: { lip: '#3a2c9a', lipTop: '#1a1450', girder: '#2a2278', glowStrip: false, depth: 1.9, reach: 2.2 },
    boost: { colorA: '#ff3dcb', colorB: '#22d3ff' },
    start: { banner: 'STARLIGHT SPIRAL', bg: '#5a2aa8', trim: '#22d3ff', structure: '#8a90c0', pillar: '#3a3f7a', light: '#ffe6ff', pillarInset: 1.3 },
    ramp: { tex: { base: '#241a58', grain: false, stripeA: '#22d3ff', stripeB: '#10082a', chevron: '#ff3dcb', glow: 'rgba(34,211,255,1)' }, side: '#3a2c8a', lip: '#22d3ff', emissive: '#22d3ff', emissiveIntensity: 0.45 },
    terrain: null,
  });

  // ---- the light road -------------------------------------------------------------------------------------------------------------------------
  w.place(buildRainbowEdges(w, { width: 2.2, strip: 0.3, hueScale: 0.011, speed: 0.17, gain: 1.0, sat: 0.95 }));
  w.place(buildUnderglow(w, { depth: 1.6, spread: 1.8, hueScale: 0.004, gain: 1.0 }));
  createRingGates(w, { ranges: [[40, gap.s0 - 40], [gap.s1 + 60, L - 20]], every: 64, radius: 15.5, tube: 0.42, lift: 7 });
  addPennants(w, { s0: -40, s1: 140, step: 30, colors: ['#ff3dcb', '#22d3ff', '#ffd23f'], sides: [-1, 1], pole: '#cfd6ff', offset: 2.6, height: 7 });

  // ---- the Starlight Core in the middle of the spiral -----------------------------------------------------------------------------------------
  const core = SP.starCore(w, { radius: 20, position: new THREE.Vector3(centre.x, coreY, centre.z) });
  w.addUpdater(core.update);
  createBillboards(w, [
    { x: centre.x, y: coreY, z: centre.z, size: 120, color: '#ff6aff', pulse: 0.5 },
    { x: centre.x, y: coreY, z: centre.z, size: 340, color: '#5a2aff', pulse: 0.3 },
  ], { name: 'core-halo', intensity: 0.7, fadeFar: 3000 });

  // ---- asteroids, crystal rocks and mini planets -----------------------------------------------------------------------------------------------
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const crystalMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#0a0a20') });
  const rnd = w.rand;
  const smp = new THREE.Vector3(), nrm = new THREE.Vector3();
  const place = (layer, count, { dist = [30, 260], sizeRange = [1, 8], bias = 1.4, spread = 1 } = {}) => {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 6) {
      const s = rnd() * L, sp = tr.sampleAt(s);
      const a = rnd() * Math.PI * 2, d = dist[0] + (dist[1] - dist[0]) * Math.pow(rnd(), bias);
      // random direction in the plane across the road (up / down / sideways), pushed outward
      const off = new THREE.Vector3().addScaledVector(sp.right, Math.cos(a) * d).addScaledVector(sp.up, Math.sin(a) * d * 0.8 * spread);
      smp.copy(sp.position).add(off);
      const q = w.road.query(smp.x, smp.z);
      if (q.near && Math.hypot(smp.x - sp.position.x, smp.z - sp.position.z) < 30 && Math.abs(smp.y - sp.position.y) < 24) continue;      // keep the road corridor clear
      // also keep clear of OTHER road stretches (the dive passes over the spiral)
      let clear = true;
      for (let k = 0; k < tr.count && clear; k += 6) { const dx = smp.x - tr.pos[k * 3], dy = smp.y - tr.pos[k * 3 + 1], dz = smp.z - tr.pos[k * 3 + 2]; if (dx * dx + dy * dy + dz * dz < 24 * 24) clear = false; }
      if (!clear) continue;
      if (Math.hypot(smp.x - centre.x, smp.z - centre.z) < 55 && Math.abs(smp.y - coreY) < 45) continue;                                // not inside the core's rings
      const sc = sizeRange[0] + (sizeRange[1] - sizeRange[0]) * Math.pow(rnd(), 2.2);
      layer.add(smp.x, smp.y, smp.z, rnd() * 6.28, [sc * (0.8 + rnd() * 0.5), sc * (0.7 + rnd() * 0.6), sc * (0.8 + rnd() * 0.5)], null, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2);
      n++;
    }
  };
  [1, 2, 3].forEach((i) => {
    const l = w.layer({ name: `asteroids-${i}`, geometry: SP.asteroid({ seed: i * 7, squash: 0.6 + i * 0.1 }), material: lam, castShadow: false, cull: 1.4, chunk: 220 });
    place(l, 150, { dist: [26, 300], sizeRange: [1.2, 9], bias: 1.3 });
  });
  const crystalLayers = [1, 2, 3, 4].map((i) => w.layer({ name: `crystals-${i}`, geometry: SP.crystalRock({ seed: i }), material: crystalMat, castShadow: false, cull: 1.2, chunk: 220 }));
  crystalLayers.forEach((l) => place(l, 22, { dist: [34, 240], sizeRange: [2.2, 7], bias: 1.2 }));
  const farRocks = w.layer({ name: 'far-asteroids', geometry: SP.asteroid({ seed: 11, squash: 0.7 }), material: lam, castShadow: false, cull: 2.4, chunk: 400 });
  place(farRocks, 150, { dist: [260, 900], sizeRange: [8, 40], bias: 1.0, spread: 1.6 });

  // a few near mini planets with parallax (the big ones live in the sky shader)
  {
    const planets = [
      { r: 55, colors: ['#7a5ad8', '#ffb36a', '#c8a0ff'], ring: { inner: 1.4, outer: 2.2, color: '#f0dcc0', tilt: 0.5 }, at: [centre.x + 560, coreY + 40, centre.z - 420], seed: 1 },
      { r: 36, colors: ['#2a8ac8', '#7be0b0', '#e8ffff'], ring: null, at: [centre.x - 520, coreY - 70, centre.z + 480], seed: 2 },
      { r: 24, colors: ['#c83a6a', '#ffcf8a', '#ff9acb'], ring: null, at: [centre.x - 360, coreY + 120, centre.z - 520], seed: 3 },
    ];
    const meshes = planets.map((p) => { const g = SP.miniPlanet({ radius: p.r, colors: p.colors, ring: p.ring, seed: p.seed }); g.position.set(...p.at); w.place(g); return g; });
    w.addUpdater((dt, t) => { meshes.forEach((g, i) => { g.userData.planet.rotation.y = t * (0.02 + i * 0.01); }); });
  }

  // a handful of tumbling asteroids that drift on slow orbits around the core (cheap CPU animation)
  {
    const g = SP.asteroid({ seed: 3 });
    const n = 28, inst = new THREE.InstancedMesh(g, lam, n);
    inst.frustumCulled = false; w.group.add(inst);
    const orb = Array.from({ length: n }, () => ({ r: 120 + rnd() * 260, a: rnd() * 6.28, sp: (0.01 + rnd() * 0.02) * (rnd() < 0.5 ? -1 : 1), y: coreY + (rnd() - 0.5) * 160, sc: 2 + rnd() * 6, ph: rnd() * 6 }));
    w.addUpdater((dt, t) => {
      for (let i = 0; i < n; i++) { const o = orb[i], a = o.a + t * o.sp; inst.setMatrixAt(i, composeMatrix(centre.x + Math.cos(a) * o.r, o.y + Math.sin(t * 0.2 + o.ph) * 4, centre.z + Math.sin(a) * o.r, t * 0.1 + o.ph, o.sc, o.sc * 0.8, o.sc, t * 0.07 + o.ph, t * 0.05)); }
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- star dust (parallax speed cues), shooting stars -----------------------------------------------------------------------------------------------
  w.addUpdater(createAmbient(w, { name: 'stardust', count: 1900, box: [110, 70, 110], size: [0.16, 0.16], color: '#ffffff', opacity: 0.95, velocity: [0.15, 0.05, 0.1], sway: 0.8, additive: true, twinkle: 4, map: 'hard' }));
  w.addUpdater(createAmbient(w, { name: 'dust-colour', count: 420, box: [90, 50, 90], size: [0.3, 0.3], color: '#ff6aff', opacity: 0.7, velocity: [0.3, 0.1, 0.2], sway: 1.4, additive: true, twinkle: 2 }));
  w.addUpdater(createAmbient(w, { name: 'shooting-stars', count: 18, box: [900, 420, 900], size: [0.5, 26], color: '#d8f0ff', opacity: 0.8, velocity: [80, -26, 44], sway: 0, additive: true, stretch: 1, map: 'hard', qualityScale: 0.8 }));
}
