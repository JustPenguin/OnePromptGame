// SUNNY MEADOWS world recipe: bright morning, rolling green hills, flower fields, fence-lined road.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture } from '../textures.js';
import * as N from '../scenery/nature.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function sunnyMeadows(w) {
  const cGrassA = new THREE.Color('#4a9a32'), cGrassB = new THREE.Color('#8ed253'), cGrassC = new THREE.Color('#b9dc5a'), cDirt = new THREE.Color('#9a7a4a'), cRock = new THREE.Color('#8b8f96');
  const cFar = new THREE.Color('#6fb6a8');
  const tint = new THREE.Color();

  w.configure({
    sky: {
      top: '#2a78f0', mid: '#62aef8', horizon: '#d6eeff', ground: '#cde6f4', horizonBand: 0.06,
      sun: { azimuth: 150, elevation: 50, size: 0.04 },
      clouds: { scale: 1.5, low: 0.52, high: 0.8, opacity: 0.95, shade: '#b4c8e6' },
    },
    light: { hemi: { sky: '#b5d6ff', ground: '#7c9c58', intensity: 1.15 }, sun: { color: '#fff0d2', intensity: 3.4 } },
    fog: { color: '#d0e8f6', near: 220, far: 1050 },
    profile: { exposure: 1.0, bloomStrength: 0.28, bloomThreshold: 0.92, bloomRadius: 0.55, vignette: 0.22, saturation: 1.1, contrast: 1.04 },
    road: {
      texture: { base: '#585b67', light: '#6e7281', dark: '#454851' },
      curb: { a: '#e5413a', b: '#f8f6ee' },
      shoulder: { ground: 'meadow', tint: '#d8ffae' },
    },
    barriers: { type: 'fence' },
    start: { banner: 'SUNNY MEADOWS', bg: '#2f8be8', trim: '#ffd23f' },
    terrain: {
      map: w.tex(groundTexture('meadow')),
      uvMeters: 11, blend: 42, sink: 0.35, cell: 5,
      natural(x, z, c) {
        const n = c.noise, d = c.dist;
        const hills = n.fbm(x * 0.0042, z * 0.0042, 3);
        const detail = n.fbm(x * 0.017 + 40, z * 0.017, 2);
        const amp = 2.5 + 20 * smooth(30, 340, d);
        const bowl = 78 * Math.pow(smooth(140, 980, d), 1.5);
        return c.refY + hills * amp + detail * (0.8 + 2.4 * smooth(25, 220, d)) + bowl;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.028, z * 0.028, 3) * 0.5 + 0.5;
        const m = c.noise.fbm(x * 0.009 + 9, z * 0.009, 2) * 0.5 + 0.5;
        out.copy(cGrassA).lerp(cGrassB, clamp01(n * 1.3 - 0.1));
        out.lerp(cGrassC, smooth(0.62, 0.9, m) * 0.7);
        if (ny < 0.82) out.lerp(cDirt, smooth(0.82, 0.62, ny) * 0.55);
        if (ny < 0.6) out.lerp(cRock, smooth(0.6, 0.45, ny));
        // mowed, brighter strip close to the road
        out.multiplyScalar(1 + 0.12 * (1 - smooth(8, 40, c.dist)));
        // aerial perspective towards the horizon (also handled by fog; this keeps far hills blue-green)
        out.lerp(cFar, smooth(380, 1100, c.dist) * 0.45);
      },
    },
  });

  // ---- props ---------------------------------------------------------------------------------------------------------
  const leaf = N.lambert();
  const foliage = (g, name, shadow = true, cull = 1) => w.layer({ name, geometry: g, material: leaf, castShadow: shadow, cull });
  const tints = [new THREE.Color('#ffffff'), new THREE.Color('#e9ffd0'), new THREE.Color('#d6f5ff'), new THREE.Color('#ffe9b8'), new THREE.Color('#c8ffc0')];
  const tintFn = (rnd) => tints[(rnd() * tints.length) | 0];

  const treesNear = foliage(N.roundTree({ detail: 1, trunk: ['#5b3820', '#8a5a34'], seed: 2 }), 'trees-near');
  w.scatter(treesNear, { perKm: 34, side: 'both', dist: [3, 48], bias: 1.5, scale: [0.85, 1.55], scaleBias: 1.2, cluster: { freq: 0.011, threshold: 0.38 }, clearance: 4, color: tintFn, maxSlope: 0.8 });
  const ovals = foliage(N.ovalTree({ detail: 1 }), 'trees-oval');
  w.scatter(ovals, { perKm: 12, side: 'both', dist: [6, 60], bias: 1.3, scale: [0.9, 1.5], cluster: { freq: 0.013, threshold: 0.42 }, color: tintFn, maxSlope: 0.8 });
  const treesFar = foliage(N.roundTree({ detail: 0, blobs: 3, trunk: ['#5b3820', '#8a5a34'], seed: 6 }), 'trees-far', false, 1.2);
  w.scatter(treesFar, { count: 700, side: 'both', dist: [50, 520], bias: 1.1, scale: [1.3, 2.8], cluster: { freq: 0.006, threshold: 0.4 }, color: tintFn, maxSlope: 0.78, clearance: 8 });
  const pines = foliage(N.pineTree({ tiers: 3 }), 'pines', false, 1.2);
  w.scatter(pines, { count: 220, side: 'both', dist: [60, 560], scale: [1.5, 3.2], cluster: { freq: 0.008, threshold: 0.5 }, minY: 4, color: tintFn, maxSlope: 0.78 });
  const bushes = foliage(N.bush({ detail: 1 }), 'bushes', false, 0.6);
  w.scatter(bushes, { perKm: 70, side: 'both', dist: [0.8, 22], bias: 1.6, scale: [0.7, 1.5], color: tintFn, clearance: 2.2 });
  const berryBush = foliage(N.bush({ detail: 0, berry: '#ff3d6a', seed: 8 }), 'bushes-berry', false, 0.5);
  w.scatter(berryBush, { perKm: 14, side: 'both', dist: [1, 16], bias: 1.4, scale: [0.8, 1.3], clearance: 2.2 });
  const rocks = foliage(N.rock({ detail: 1 }), 'rocks', true, 0.6);
  w.scatter(rocks, { perKm: 12, side: 'both', dist: [2, 60], bias: 1.3, scale: [0.5, 1.8], scaleBias: 2, clearance: 3, color: [new THREE.Color('#ffffff'), new THREE.Color('#ffe8d0'), new THREE.Color('#d8e4ff')], sink: 0.2 });

  // flower fields: four colour layers (no per-instance tint so stems stay green)
  const flowerCols = ['#ff5fa2', '#ffd23f', '#ffffff', '#a870ff'];
  flowerCols.forEach((col, i) => {
    const l = w.layer({ name: `flowers-${i}`, geometry: N.flowerTuft({ head: col, seed: i + 1 }), material: leaf, castShadow: false, cull: 0.16, chunk: 90 });
    w.scatter(l, { perKm: 260, side: 'both', dist: [0.4, 26], bias: 1.7, scale: [0.9, 1.7], cluster: { freq: 0.03 + i * 0.004, threshold: 0.56 }, clearance: 1.8 });
  });
  const tufts = w.layer({ name: 'grass-tufts', geometry: N.grassTuft({}), material: leaf, castShadow: false, cull: 0.14, chunk: 90 });
  w.scatter(tufts, { perKm: 500, side: 'both', dist: [0.3, 30], bias: 1.8, scale: [0.9, 1.8], clearance: 1.6 });
}
