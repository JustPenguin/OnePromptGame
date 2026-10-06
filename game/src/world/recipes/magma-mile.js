// MAGMA MILE world recipe: a volcano at dusk - glowing crack-network terrain, lava lakes + flows, pulsing fire geysers, basalt columns,
// obsidian, braziers, a wall-less bridge with lantern posts, ash and embers.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture, crackGlowTexture } from '../textures.js';
import * as VOL from '../scenery/volcano.js';
import * as D from '../scenery/desert.js';
import { addWater } from '../water.js';
import { addLavaFlow } from '../lavaflow.js';
import { createAmbient } from '../ambient.js';
import { createPlume } from '../plumes.js';
import { createBillboards } from '../billboards.js';
import { buildGrandstand } from '../structures.js';
import { buildViaduct } from '../infrastructure.js';
import { createFlock } from '../birds.js';
import { toColor } from '../geo.js';
import { smooth, ramp, colors, maskS, clamp01 } from './kit.js';
import { addPennants } from './common.js';

export function magmaMile(w) {
  const tr = w.track;
  const mk = (id) => tr.markers[id];
  const pt = (s, lat) => tr.pointAt(s, lat, new THREE.Vector3());
  const yawAt = (s) => tr.sampleAt(s).yaw;
  const bridge = tr.openEdges[0];
  const bMid = (bridge.s0 + bridge.s1) / 2;
  const bridgeP = pt(bMid, 0);
  const roadYBridge = bridgeP.y;
  const canyon = maskS(tr, [[mk('E').s0 - 20, mk('F>').s1 + 10]], 50);
  const vol = { x: -30, z: -720, R: 600, H: 330, craterR: 95, craterDepth: 62 };
  const startLake = { x: -10, z: 430, rx: 340, rz: 105, level: -2.4 };

  const cA = new THREE.Color('#5a4849'), cB = new THREE.Color('#766162'), cAsh = new THREE.Color('#a39391'), cRed = new THREE.Color('#924634'), cCoal = new THREE.Color('#463736'), cFar = new THREE.Color('#923822');
  const tmp = new THREE.Color();

  w.configure({
    sky: {
      top: '#0f0405', mid: '#4a1410', horizon: '#ff7a2a', ground: '#5a1a10', horizonBand: 0.12,
      sun: { azimuth: 118, elevation: 9, size: 0.06, glow: 1.9, color: '#ff7a3a' },
      clouds: { scale: 1.05, low: 0.46, high: 0.74, opacity: 0.92, color: '#6a3228', shade: '#120707', wind: [0.006, 0.002] },
    },
    // road readability: warm sun vs COOL dusk shadows (an all-orange fill flattened every form), less haze, bloom only on real fire
    light: { hemi: { sky: '#5c4c7e', ground: '#a8502c', intensity: 1.05 }, sun: { color: '#ffa45a', intensity: 2.9, extent: 76 }, fill: { color: '#ff6a2a', intensity: 0.4 } },
    fog: { color: '#4a160e', near: 130, far: 980 },
    profile: { exposure: 1.0, bloomStrength: 0.72, bloomThreshold: 0.95, bloomRadius: 0.7, vignette: 0.44, saturation: 1.14, contrast: 1.14, envIntensity: 0.26 },
    road: {
      roughness: 1, specular: 0.2,
      texture: { base: '#40363c', light: '#5c4e56', dark: '#2a2126', wear: '#171114', centerColor: '#ffb04a', edgeColor: '#ffe8c0', glowEdge: '#ff5a1a', patches: 0.4, cracks: 1.0, rubber: 0.8 },
      emissive: '#3a1a0e', emissiveIntensity: 0.07,
      curb: { a: '#ff5a1a', b: '#2a2224' },
      shoulder: { ground: 'basalt', tint: '#c8a090' },
      fascia: { color: '#2a2224', depth: 1.6 },
      capColor: '#2a2224',
    },
    barriers: { type: 'wall', height: 1.2, thickness: 1.2, a: '#3a3032', b: '#4e4244', cap: '#6a5a5c', base: '#1c1618', stripe: 3.5, emissive: '#3a1204' },
    start: { banner: 'MAGMA MILE', sub: 'STARLIGHT CUP · ROUND 2', bg: '#c02a10', trim: '#ffd23f', structure: '#6a5a5c', pillar: '#2a2224', light: '#ffe0b0' },
    edgeTrim: { glow: '#ff6a1a', lip: '#2a2224', lipTop: '#5a4a4c', depth: 2.8 },
    free: [{ s0: bridge.s0 - 14, s1: bridge.s1 + 14, fade: 24 }],
    terrain: {
      map: w.tex(groundTexture('basalt')),
      glow: { map: w.tex(crackGlowTexture('basalt')), color: '#ff7a2a', intensity: 1.45, scale: 0.0075, threshold: 0.6, soft: 0.1, uvScale: 0.3, time: w.timeUniform },
      uvMeters: 11, cell: 5, sink: 0.35, clearance: 3, blend: (q) => 36 - 22 * canyon(q.s), outerMargin: 1700,
      natural(x, z, c) {
        const n = c.noise, d = c.dist, q = c.q;
        const cm = q.near ? canyon(q.s) : 0;
        let h = c.refY + n.fbm(x * 0.009, z * 0.009, 3) * (2.5 + 16 * smooth(20, 220, d)) + n.fbm(x * 0.04, z * 0.04, 2) * 0.9 + n.ridge(x * 0.016, z * 0.016, 3) * 7 * smooth(40, 240, d);
        h += cm * (26 * smooth(0, 14, d - 8) + 16 * n.ridge(x * 0.03, z * 0.03, 3) * smooth(5, 30, d - 8));
        // the volcano
        const r = Math.hypot(x - vol.x, z - vol.z);
        if (r < vol.R) {
          const t = 1 - r / vol.R;
          h += vol.H * Math.pow(t, 1.32) + n.fbm(x * 0.012, z * 0.012, 3) * 14 * t;
          if (r < vol.craterR * 1.7) h -= vol.craterDepth * (1 - smooth(vol.craterR * 0.25, vol.craterR * 1.45, r));
        }
        h += 40 * Math.pow(smooth(550, 1500, d), 1.3);
        return h;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.024, z * 0.024, 3) * 0.5 + 0.5;
        out.copy(cA).lerp(cB, n);
        out.lerp(cRed, smooth(0.62, 0.9, c.noise.fbm(x * 0.007 + 4, z * 0.007, 2) * 0.5 + 0.5) * 0.55);
        const hh = y - c.refY;
        out.lerp(cAsh, smooth(30, 140, hh) * 0.55);
        if (ny < 0.8) out.lerp(cCoal, smooth(0.8, 0.5, ny) * 0.8);
        out.multiplyScalar(0.9 + 0.35 * n);
        out.multiplyScalar(1 + 0.18 * (1 - smooth(6, 40, c.dist)));
        out.lerp(cFar, smooth(520, 1500, c.dist) * 0.45);
      },
    },
  });

  // ---- lava: the lake beside the start straight, the pool under the bridge, the crater, and flows down the flank ------------------------------
  const lavaColors = { deep: '#1a0a0a', lavaA: '#ff3d0a', lavaB: '#ffd23f' };
  addWater(w, { kind: 'pond', look: 'lava', x: startLake.x, z: startLake.z, rx: startLake.rx, rz: startLake.rz, rot: 0, level: startLake.level, depth: 6, bank: 40, colors: lavaColors, glow: 1.35, texel: 2 });
  w.exclude(startLake.x, startLake.z, startLake.rx + 40);
  const basinRot = yawAt(bMid);
  addWater(w, { kind: 'pond', look: 'lava', x: bridgeP.x, z: bridgeP.z, rx: 150, rz: 70, rot: basinRot, level: roadYBridge - 10.5, depth: 12, bank: 46, colors: lavaColors, glow: 1.35, texel: 1.6 });
  w.exclude(bridgeP.x, bridgeP.z, 90);
  w.terrain.ensureGrid();
  const craterY = w.terrain.heightAt(vol.x, vol.z);
  addWater(w, { kind: 'sea', look: 'lava', level: craterY + 6, box: [vol.x - 220, vol.z - 220, vol.x + 220, vol.z + 220], depth: 20, texel: 2, depthScale: 20, colors: lavaColors, glow: 1.5 });
  const flows = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.18 + (i / 6) * Math.PI * 0.64;          // the south-facing half of the cone (towards the course)
    const rr = vol.craterR * 1.35;
    const f = addLavaFlow(w, { x: vol.x + Math.cos(a) * rr, z: vol.z + Math.sin(a) * rr, steps: 95, stepLen: 9, width: [7, 22], lift: 1.2, meander: 0.5, avoidRoad: 70, glow: 0.55, hot: '#ff3a10', hotB: '#ff8a28' });
    if (f) flows.push(f);
  }

  // ---- structures --------------------------------------------------------------------------------------------------------------------------
  w.place(buildGrandstand(w, { s: -8, length: 56, side: -1, gap: 6, tiers: 4, roof: '#c02a10', roof2: '#ffd23f', frame: '#6a5a5c', dark: '#2a2224', banner: { text: 'MAGMA GP', bg: '#ff5a1a' } }));
  addPennants(w, { s0: -50, s1: 230, step: 25, colors: ['#ff5a1a', '#ffd23f', '#2a2224'], sides: [-1], pole: '#8a7a78', offset: 3.4 });
  w.place(buildViaduct(w, { s0: bridge.s0 - 6, s1: bridge.s1 + 6, piers: false, girder: 2.2, concrete: '#2a2224', concrete2: '#4a3c3e', glow: ['#ff6a1a', '#ff6a1a'] }));

  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lamE = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#2a0c04') });
  const ground = (c) => c.y;

  // bridge posts + lantern glows along both edges
  {
    const geo = VOL.bridgePost({});
    const layer = w.layer({ name: 'bridge-posts', geometry: geo, material: lam, castShadow: true, cull: 1.0, chunk: 200 });
    const glows = [];
    for (let s = bridge.s0 + 4; s <= bridge.s1 - 3; s += 12) for (const side of [-1, 1]) {
      const smp = tr.sampleAt(s);
      const p = tr.pointAt(s, side * (smp.halfWidth + 2.05), new THREE.Vector3());
      layer.add(p.x, p.y + 0.12, p.z, 0, 1, null);
      glows.push({ x: p.x, y: p.y + 1.4, z: p.z, size: 4.2, color: '#ff7a1a', flicker: 0.5, phase: s * 0.17 + side });
    }
    createBillboards(w, glows, { name: 'bridge-lanterns', intensity: 1.0, fadeFar: 340 });
  }

  // fire geysers on the start lake + braziers along the road
  {
    const glows = [];
    const geyserXs = [-170, -80, 10, 100, 190];
    geyserXs.forEach((gx, i) => {
      const gz = startLake.z - startLake.rz * 0.62 + (i % 2) * 18;
      w.addUpdater(createPlume(w, { name: 'geyser', origin: [gx, startLake.level, gz], count: 18, life: 2.6, rise: 20, spread: 5, size: [2.2, 9], color: '#ffe08a', color2: '#ff3d0a', opacity: 0.85, wind: [1.5, 0, 0.5], additive: true, heat: 1, pulse: 6 + i * 0.9, phase: i * 1.7 }));
      glows.push({ x: gx, y: startLake.level + 1.5, z: gz, size: 26, color: '#ff5a1a', pulse: 0.8, phase: i });
    });
    createBillboards(w, glows, { name: 'geyser-glow', intensity: 0.7, fadeFar: 800 });
    // braziers on the outside of the corners and along the start straight
    const geo = VOL.brazier({});
    const layer = w.layer({ name: 'braziers', geometry: geo, material: lam, castShadow: false, cull: 0.8, chunk: 200 });
    const flames = [];
    for (let s = 20; s < tr.length; s += 52) {
      const smp = tr.sampleAt(s);
      if (s > bridge.s0 - 20 && s < bridge.s1 + 20) continue;
      const side = ((s / 52) | 0) % 2 ? 1 : -1;
      const p = tr.pointAt(s, side * (smp.halfWidth + smp.shoulder + 2.2), new THREE.Vector3());
      const gy = w.groundAt(p.x, p.z);
      layer.add(p.x, gy - 0.05, p.z, 0, 1, null);
      flames.push({ x: p.x, y: gy + VOL.BRAZIER_FLAME_Y + 0.5, z: p.z, size: 3.6, color: '#ff8a2a', flicker: 0.7, phase: s * 0.13 });
      flames.push({ x: p.x, y: gy + VOL.BRAZIER_FLAME_Y + 0.9, z: p.z, size: 1.8, color: '#ffe08a', flicker: 0.9, phase: s * 0.29 });
    }
    createBillboards(w, flames, { name: 'brazier-flames', intensity: 1.15, fadeFar: 360 });
  }

  // ---- rocks & plants ---------------------------------------------------------------------------------------------------------------------------
  const blobs = w.blobLayer({ opacity: 0.4, color: '#100505' });
  const open = (c) => !w.waters.some((b) => b.depthAt(c.x, c.z) > 0 || b.depthAt(c.x + 5, c.z) > 0 || b.depthAt(c.x - 5, c.z) > 0 || b.depthAt(c.x, c.z + 5) > 0 || b.depthAt(c.x, c.z - 5) > 0);
  const columns = [1, 2, 3].map((i) => w.layer({ name: `basalt-${i}`, geometry: VOL.basaltColumns({ seed: i, count: 11 + i * 2 }), material: lam, castShadow: true, cull: 1.2 }));
  columns.forEach((l) => w.scatter(l, { perKm: 11, side: 'both', dist: [6, 130], bias: 1.2, scale: [0.8, 1.7], maxSlope: 0.85, accept: open, blob: { layer: blobs, k: 8 } }));
  const spires = [1, 2].map((i) => w.layer({ name: `spire-${i}`, geometry: VOL.rockSpire({ seed: i * 5, height: 13 + i * 3 }), material: lam, castShadow: true, cull: 1.5 }));
  spires.forEach((l) => w.scatter(l, { perKm: 20, side: 'both', dist: [14, 240], bias: 1.1, scale: [0.7, 1.5], maxSlope: 0.8, accept: open, cluster: { freq: 0.011, threshold: 0.42 } }));
  const boulders = w.layer({ name: 'lava-boulders', geometry: VOL.lavaBoulder({}), material: lamE, castShadow: true, cull: 0.8 });
  w.scatter(boulders, { perKm: 55, side: 'both', dist: [1.5, 70], bias: 1.3, scale: [0.6, 2.6], scaleBias: 2, sink: 0.3, accept: open, blob: { layer: blobs, k: 2.6 } });
  const trees = w.layer({ name: 'charred', geometry: VOL.charredTree({}), material: lam, castShadow: true, cull: 0.8 });
  w.scatter(trees, { perKm: 22, side: 'both', dist: [3, 80], scale: [0.9, 1.7], accept: open, maxSlope: 0.85 });
  const shards = w.layer({ name: 'obsidian', geometry: VOL.obsidianShards({}), material: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#1c0a28') }), castShadow: true, cull: 0.8 });
  w.scatter(shards, { perKm: 14, side: 'both', dist: [3, 90], scale: [0.9, 2.0], accept: open });
  // distant spires on the horizon for depth
  const farSpires = w.layer({ name: 'far-spires', geometry: VOL.rockSpire({ seed: 9, height: 26, radius: 6 }), material: lam, castShadow: false, cull: 2.2 });
  w.scatter(farSpires, { count: 90, side: 'both', dist: [220, 900], scale: [1.4, 3.6], maxSlope: 0.7, accept: open });

  // ---- sky glow, smoke and embers --------------------------------------------------------------------------------------------------------------------
  w.addUpdater(createPlume(w, { name: 'ash-plume', origin: [vol.x, craterY + 10, vol.z], count: 26, life: 16, rise: 10, spread: 70, size: [50, 260], color: '#4a2a22', color2: '#140a0a', opacity: 0.6, wind: [26, 0, 12], heat: 0.5 }));
  w.addUpdater(createPlume(w, { name: 'crater-glow', origin: [vol.x, craterY + 8, vol.z], count: 10, life: 5, rise: 14, spread: 30, size: [40, 130], color: '#ff9a3a', color2: '#ff3d0a', opacity: 0.45, wind: [6, 0, 3], additive: true, heat: 1 }));
  createBillboards(w, [{ x: vol.x, y: craterY + 30, z: vol.z, size: 260, color: '#ff5a1a', pulse: 0.5 }, { x: vol.x, y: craterY + 90, z: vol.z, size: 420, color: '#ff3d0a', pulse: 0.3 }], { name: 'crater-halo', intensity: 0.75, fadeFar: 3000 });
  w.addUpdater(createAmbient(w, { name: 'embers', count: 1500, box: [80, 46, 80], size: [0.16, 0.16], color: '#ff9a3a', opacity: 0.9, velocity: [2.2, 3.2, 0.8], sway: 1.6, additive: true, twinkle: 7 }));
  w.addUpdater(createAmbient(w, { name: 'ash', count: 700, box: [70, 40, 70], size: [0.2, 0.2], color: '#8a7a78', opacity: 0.4, velocity: [1.8, -0.9, 0.6], sway: 1.2 }));
  w.addUpdater(createFlock(w, { name: 'vultures', count: 5, center: [vol.x + 160, 90, vol.z + 340], radius: 120, height: 70, speed: 0.07, size: 5, flap: 2.2, body: '#2a2224', wing: '#3a3032', tip: '#120c0e' }));
}
