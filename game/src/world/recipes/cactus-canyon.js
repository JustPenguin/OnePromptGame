// CACTUS CANYON world recipe: low sunset sun, terraced mesas, canyon walls at the squeeze, a chasm under the jump, a sandstone arch.   OWNER: Agent B.
import * as THREE from 'three';
import { groundTexture } from '../textures.js';
import * as N from '../scenery/nature.js';
import * as D from '../scenery/desert.js';
import { chasmCarver } from '../ramps.js';
import { createAmbient } from '../ambient.js';
import { buildGrandstand } from '../structures.js';
import { windMaterial, toColor, composeMatrix } from '../geo.js';
import { smooth, terrace, ramp, colors, maskS, fract } from './kit.js';

export function cactusCanyon(w) {
  const tr = w.track;
  const mk = (id) => tr.markers[id];
  const gap = tr.gaps[0];
  const squeeze = [mk('E>').s0 + 20, mk('H').s0 + 6];
  const canyon = maskS(tr, [squeeze], 36);
  const archS = (mk('F>').s0 + mk('F>').s1) / 2;
  const hairpin = mk('H');
  const hairpinC = (() => { // centre of the hairpin fillet = inside of the turn: a mesa pillar stands there
    const s = (hairpin.s0 + hairpin.s1) / 2, smp = tr.sampleAt(s), r = 26;
    return tr.pointAt(s, -(r), new THREE.Vector3()); // left turn: centre is on the LEFT (negative lateral)
  })();

  const cSandA = new THREE.Color('#e6b676'), cSandB = new THREE.Color('#f4cf92'), cRedSand = new THREE.Color('#d98a52');
  const strata = colors(['#b5502c', '#d97a44', '#eeae6e', '#c25f34', '#f3c98a', '#a54626']);
  const tmp = new THREE.Color();
  const cFar = new THREE.Color('#c98a78');

  w.configure({
    sky: {
      top: '#12406a', mid: '#8a6aa2', horizon: '#ffb072', ground: '#f2a272', horizonBand: 0.1,
      sun: { azimuth: 262, elevation: 11, size: 0.07, glow: 1.8, color: '#ffc27a' },
      clouds: { scale: 1.2, low: 0.55, high: 0.82, opacity: 0.8, color: '#ffc8a0', shade: '#7c5578', wind: [0.003, 0.001] },
    },
    light: { hemi: { sky: '#9a86d8', ground: '#d58a58', intensity: 0.95 }, sun: { color: '#ffb871', intensity: 3.8, extent: 78 }, fill: { color: '#b08ad8', intensity: 0.7 } },
    fog: { color: '#f4a577', near: 140, far: 820 },
    profile: { exposure: 1.0, bloomStrength: 0.4, bloomThreshold: 0.85, bloomRadius: 0.6, vignette: 0.3, saturation: 1.12, contrast: 1.06 },
    road: {
      texture: { base: '#5a5058', light: '#746a72', dark: '#403a42', centerColor: '#ffd23f', patches: 0.4, cracks: 0.9, speckle: 1.2 },
      curb: { a: '#e8742a', b: '#fff0d0' },
      shoulder: { ground: 'sand', tint: '#ffe2b8' },
      fascia: { color: '#a2623d', depth: 1.1 },
      capColor: '#a2623d',
    },
    barriers: { type: 'wall', height: 1.15, thickness: 1.1, a: '#d4814a', b: '#efb97f', cap: '#f7dcae', base: '#8c5a3a', stripe: 3 },
    start: { banner: 'CACTUS CANYON', sub: 'BLOSSOM CUP · ROUND 2', bg: '#e8742a', trim: '#27c3b4' },
    ramp: { tex: { base: '#8a5a34', grain: true, stripeA: '#ffd23f', stripeB: '#2a1c12', chevron: '#fff0c8' }, side: '#a8794c', lip: '#ffd23f' },
    free: [{ s0: gap.s0 - 3, s1: gap.s1 + 3, fade: 4 }],
    terrain: {
      map: w.tex(groundTexture('sand')),
      uvMeters: 12, cell: 5, sink: 0.35, clearance: 3,
      blend: (q) => 44 - 36 * canyon(q.s),
      natural(x, z, c) {
        const n = c.noise, d = c.dist, q = c.q;
        const cm = q.near ? canyon(q.s) : 0;
        let h = c.refY + n.fbm(x * 0.008, z * 0.008, 3) * (1.5 + 7 * smooth(20, 220, d)) + n.fbm(x * 0.03, z * 0.03, 2) * 0.7;
        // terraced mesas far from the road
        const m = n.fbm(x * 0.0046 + 7, z * 0.0046 - 3, 3) * 0.5 + 0.5;
        const mesa = smooth(0.5, 0.62, m) * smooth(95, 240, d);
        h += mesa * (20 + 52 * terrace(smooth(0.5, 0.9, m), 3, 0.2));
        // canyon walls hug the road through the squeeze
        h += cm * (34 * smooth(0, 15, d - 8) + 14 * n.ridge(x * 0.025, z * 0.025, 3) * smooth(5, 30, d - 8));
        // mesa pillar inside the hairpin
        const dp = Math.hypot(x - hairpinC.x, z - hairpinC.z);
        if (dp < 30) h += 42 * (1 - smooth(11, 29, dp)) + (dp < 14 ? n.fbm(x * 0.2, z * 0.2, 2) * 1.5 : 0);
        h += 60 * Math.pow(smooth(420, 1300, d), 1.3);
        return h;
      },
      color(x, z, y, ny, c, out) {
        const n = c.noise.fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
        out.copy(cSandA).lerp(cSandB, n).lerp(cRedSand, smooth(0.6, 0.9, c.noise.fbm(x * 0.006 + 3, z * 0.006, 2) * 0.5 + 0.5) * 0.6);
        const hh = y - c.refY;
        const steep = smooth(0.9, 0.55, ny);
        const band = fract(y * 0.075 + c.noise.fbm(x * 0.015, z * 0.015, 2) * 0.35);
        ramp(strata, band, tmp);
        out.lerp(tmp, clamp(steep * 0.95 + smooth(8, 26, hh) * 0.75));
        out.multiplyScalar(1 + 0.12 * (1 - smooth(6, 36, c.dist)));
        out.lerp(cFar, smooth(450, 1300, c.dist) * 0.5);
      },
    },
  });
  const clamp = (v) => Math.min(1, Math.max(0, v));

  // chasm under the jump
  w.terrain.addCarver(chasmCarver(w, gap, { depth: 42, sideReach: 34 }));

  // ---- sandstone arch over the squeeze ------------------------------------------------------------------------------
  {
    const smp = tr.sampleAt(archS);
    const span = (smp.halfWidth + smp.shoulder) * 2 + 11;
    const geo = D.rockArch({ span, height: 17, thick: 6.2, depth: 12, seed: 3 });
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.copy(smp.position); mesh.position.y -= 0.5;
    mesh.rotation.y = smp.yaw;      // local Z = along the road
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'arch';
    w.place(mesh);
    w.exclude(smp.position.x, smp.position.z, 22);
  }

  // ---- grandstand at the start ------------------------------------------------------------------------------------------
  w.place(buildGrandstand(w, { s: -4, length: 56, side: 1, gap: 6, tiers: 5, roof: '#e8742a', roof2: '#fff0d0', frame: '#e6c8a0', dark: '#6a4a38', banner: { text: 'GO GO GO!', bg: '#27c3b4' } }));

  // ---- vegetation & rocks -------------------------------------------------------------------------------------------------
  const veg = windMaterial(w.timeUniform, { sway: 0.15 });
  const lam = N.lambert();
  const blobs = w.blobLayer({ opacity: 0.38, color: '#40180a' });
  const open = (c) => canyon(c.s) < 0.35;
  const sag = [1, 2, 3].map((i) => w.layer({ name: `saguaro-${i}`, geometry: D.saguaro({ seed: i }), material: veg, castShadow: true, cull: 1.1 }));
  sag.forEach((l) => w.scatter(l, { perKm: 20, side: 'both', dist: [3, 110], bias: 1.4, scale: [0.85, 1.6], cluster: { freq: 0.011, threshold: 0.38 }, maxSlope: 0.82, accept: open, blob: { layer: blobs, k: 1.8 } }));
  w.scatter(w.layer({ name: 'barrel', geometry: D.barrelCactus({}), material: veg, castShadow: true, cull: 0.5 }), { perKm: 80, side: 'both', dist: [1, 30], bias: 1.8, scale: [0.8, 1.5], accept: open, maxSlope: 0.85, blob: { layer: blobs, k: 1.6 } });
  w.scatter(w.layer({ name: 'pear', geometry: D.pricklyPear({}), material: veg, castShadow: true, cull: 0.6 }), { perKm: 55, side: 'both', dist: [2, 45], bias: 1.6, scale: [0.9, 1.6], accept: open, maxSlope: 0.85, blob: { layer: blobs, k: 2.0 } });
  w.scatter(w.layer({ name: 'agave', geometry: D.agave({}), material: veg, castShadow: false, cull: 0.5 }), { perKm: 70, side: 'both', dist: [1, 40], bias: 1.6, scale: [0.8, 1.7], accept: open, maxSlope: 0.85 });
  const boulderL = [1, 2].map((i) => w.layer({ name: `boulders-${i}`, geometry: D.sandBoulder({ seed: i * 5 }), material: lam, castShadow: true, cull: 0.9 }));
  boulderL.forEach((l) => w.scatter(l, { maxSlope: 0.72, perKm: 55, side: 'both', dist: [1, 70], bias: 1.5, scale: [0.6, 2.8], scaleBias: 2.2, sink: 0.25, color: [new THREE.Color('#ffffff'), new THREE.Color('#ffd9b0'), new THREE.Color('#e8b8a0')], blob: { layer: blobs, k: 2.6 } }));
  w.scatter(w.layer({ name: 'canyon-rocks', geometry: D.sandBoulder({ seed: 11, squash: 1.1 }), material: lam, castShadow: true, cull: 0.9 }), { perKm: 160, side: 'both', dist: [0.5, 22], bias: 1.2, scale: [0.9, 3.4], scaleBias: 1.6, sink: 0.4, accept: (c) => canyon(c.s) > 0.6, maxSlope: 0.7, color: [new THREE.Color('#ffffff'), new THREE.Color('#ffd9b0')] });
  w.scatter(w.layer({ name: 'hoodoo', geometry: D.hoodoo({ seed: 2 }), material: lam, castShadow: true, cull: 1.3 }), { perKm: 22, side: 'both', dist: [14, 190], bias: 1.1, scale: [1.2, 2.6], cluster: { freq: 0.009, threshold: 0.45 }, accept: open, maxSlope: 0.8 });
  w.scatter(w.layer({ name: 'deadtree', geometry: D.deadTree({}), material: lam, castShadow: true, cull: 0.7 }), { perKm: 18, side: 'both', dist: [3, 80], scale: [0.9, 1.6], accept: open, maxSlope: 0.85 });
  w.scatter(w.layer({ name: 'skull', geometry: D.cattleSkull(), material: lam, castShadow: false, cull: 0.25 }), { perKm: 7, side: 'both', dist: [2, 18], scale: [0.9, 1.3], accept: open });
  const dry = w.layer({ name: 'dry-tufts', geometry: N.grassTuft({ color: ['#a98a48', '#e2c27a'], blades: 6, seed: 3 }), material: veg, castShadow: false, cull: 0.14, chunk: 90 });
  w.scatter(dry, { perKm: 520, side: 'both', dist: [0.3, 32], bias: 1.8, scale: [0.9, 1.9], accept: open });

  // tumbleweeds roll along the verge
  {
    const g = D.tumbleweed({});
    const inst = new THREE.InstancedMesh(g, lam, 7);
    inst.frustumCulled = false; inst.castShadow = false;
    const seeds = Array.from({ length: 7 }, (_, i) => ({ s: (i / 7) * tr.length + w.rand() * 80, side: i % 2 ? 1 : -1, off: 1.5 + w.rand() * 3, sp: 4 + w.rand() * 3, ph: w.rand() * 6 }));
    w.group.add(inst);
    const v = new THREE.Vector3();
    w.addUpdater((dt, t) => {
      for (let i = 0; i < seeds.length; i++) {
        const e = seeds[i];
        const s = (e.s + t * e.sp) % tr.length;
        const smp = tr.sampleAt(s);
        const lat = e.side * (smp.halfWidth + smp.shoulder - 1.6 + e.off + Math.sin(t * 0.5 + e.ph) * 1.5);
        tr.pointAt(s, lat, v);
        const hop = Math.abs(Math.sin(t * 2.4 + e.ph)) * 0.35;
        inst.setMatrixAt(i, composeMatrix(v.x, v.y + 0.3 + hop, v.z, 0, 1, 1, 1, t * e.sp * 1.4 + e.ph, t * 0.7));
      }
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  // dust motes in the low sun
  w.addUpdater(createAmbient(w, { name: 'dust', count: 650, box: [90, 26, 90], size: [0.16, 0.16], color: '#ffd7a0', opacity: 0.55, velocity: [1.1, 0.05, 0.35], sway: 1.2, additive: true, qualityScale: 1 }));
}
