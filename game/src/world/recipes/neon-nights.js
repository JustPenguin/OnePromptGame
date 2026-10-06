// NEON NIGHTS world recipe: a procedural night city on an 80 m street grid - skyscrapers lit by ONE window shader, neon signs that flicker,
// street lamps with light pools, a lit tunnel, a figure-8 viaduct, wet asphalt, hover traffic and heavy bloom.   OWNER: Agent B.
import * as THREE from 'three';
import { cityGroundTexture, glowTexture } from '../textures.js';
import * as C from '../scenery/city.js';
import { createNeonSigns, createLightPools, neonSignIndex, NEON_SIGN_COUNT } from '../neon.js';
import { createBillboards } from '../billboards.js';
import { createAmbient } from '../ambient.js';
import { buildTunnel, buildViaduct, glowMesh } from '../infrastructure.js';
import { buildGrandstand } from '../structures.js';
import { GeoBuilder } from '../builder.js';
import { toColor, composeMatrix } from '../geo.js';
import { smooth, colors } from './kit.js';
import { mulberry32 } from '../../core/math.js';

const TILE = 80;

export function neonNights(w) {
  const tr = w.track, L = tr.length;
  const mk = (id) => tr.markers[id];
  const pt = (s, lat) => tr.pointAt(s, lat, new THREE.Vector3());
  const tunnelR = [mk('E1>').s0 + 20, mk('E1>').s0 + 20 + 138];

  // the viaduct = every stretch where the road is more than 0.8 m above street level (found by scanning the centreline)
  const viaducts = [];
  {
    let start = null;
    for (let s = 0; s <= L; s += 2) {
      const y = tr.sampleAt(s).position.y;
      if (y > 0.8 && start === null) start = s;
      if ((y <= 0.8 || s + 2 > L) && start !== null) { viaducts.push([start, s]); start = null; }
    }
  }
  const gapRanges = viaducts.map(([a, b]) => ({ s0: a - 2, s1: b + 2, fade: 14 }));

  w.configure({
    sky: {
      top: '#05021a', mid: '#1a0b45', horizon: '#6a1a8c', ground: '#2a0f4a', horizonBand: 0.1,
      sun: { azimuth: 215, elevation: 34, size: 0.035, glow: 0.35, color: '#c8d4ff' },    // the moon
      clouds: { scale: 1.1, low: 0.55, high: 0.85, opacity: 0.55, color: '#b04cc8', shade: '#1a0b45', wind: [0.004, 0.0015] },
      stars: { density: 0.025, scale: 80 },
    },
    light: { hemi: { sky: '#4a4aa8', ground: '#6a2a8a', intensity: 0.8 }, sun: { color: '#8aa4ff', intensity: 1.6, extent: 64 }, fill: { color: '#ff3dcb', intensity: 0.35 } },
    fog: { color: '#2a0e55', near: 70, far: 760 },
    // bloom only on the really bright things (windows, signs, neon); a low threshold + wide radius smeared the road pale
    profile: { exposure: 1.04, bloomStrength: 0.78, bloomThreshold: 0.8, bloomRadius: 0.75, vignette: 0.42, saturation: 1.16, contrast: 1.13, envIntensity: 0.2 },
    road: {
      specular: 0.4,
      texture: { base: '#2c2f44', light: '#4a4f6e', dark: '#1c1e2e', wear: '#10121f', centerColor: '#ffd23f', edgeColor: '#f2f6ff', glowEdge: '#22d3ff', patches: 0.5, cracks: 0.5, rubber: 0.8 },
      wet: { colors: ['#ff3dcb', '#22d3ff', '#7a5cff'], strength: 0.5, puddles: 0.34, roughness: 0.6 },
      curb: { a: '#ff3dcb', b: '#22d3ff', emissive: '#ffffff', emissiveIntensity: 0.42 },
      shoulder: { ground: 'neutral', tint: '#3a3d66' },
      fascia: { color: '#3a3f66', depth: 1.4 },
    },
    barriers: { type: 'jersey', concrete: '#353a5c', top: '#4a5078', strip: '#22d3ff', height: 1.05 },
    start: { banner: 'NEON NIGHTS', sub: 'STARLIGHT CUP · ROUND 1', bg: '#7a1ab8', trim: '#ff3dcb', structure: '#8a90c0', pillar: '#4a5078', light: '#ffe6ff', height: 8.6 },
    ramp: { tex: { base: '#2e3350', grain: false, stripeA: '#ff3dcb', stripeB: '#10132a', chevron: '#22d3ff', glow: 'rgba(255,61,203,1)' }, side: '#3a4166', lip: '#ff3dcb', emissive: '#ff3dcb', emissiveIntensity: 0.35 },
    free: gapRanges,
    terrain: {
      map: w.tex(cityGroundTexture({})),
      uvMeters: TILE, cell: 5, sink: 0.35, blend: 10, clearance: 2.5, outerMargin: 1300,
      natural(x, z, c) { return -0.1 + c.noise.fbm(x * 0.01, z * 0.01, 2) * 0.12; },
      color(x, z, y, ny, c, out) {
        out.setRGB(1, 1, 1);
        out.multiplyScalar(0.95 + 0.1 * c.noise.fbm(x * 0.05, z * 0.05, 2));
      },
    },
  });

  // ---- infrastructure -----------------------------------------------------------------------------------------------------
  w.place(buildTunnel(w, { s0: tunnelR[0], s1: tunnelR[1], height: 8.8, portalTrim: '#ff3dcb', strip: ['#22d3ff', '#ff3dcb'] }));
  for (const [a, b] of viaducts) w.place(buildViaduct(w, { s0: a, s1: b, glow: ['#ff3dcb', '#22d3ff'] }));
  w.place(buildGrandstand(w, { s: -8, length: 56, side: -1, gap: 6, tiers: 4, roof: '#7a1ab8', roof2: '#ff3dcb', frame: '#4a5078', dark: '#2a2f4a', banner: { text: 'NEON GP', bg: '#ff3dcb' } }));

  // ---- the city ------------------------------------------------------------------------------------------------------------
  const rnd = mulberry32(2026);
  const bb = tr.bounds;
  const ext = 440;
  const i0 = Math.floor((bb.minX - ext) / TILE), i1 = Math.ceil((bb.maxX + ext) / TILE), j0 = Math.floor((bb.minZ - ext) / TILE), j1 = Math.ceil((bb.maxZ + ext) / TILE);
  const bgeo = C.unitBox();
  const cmat = C.cityMaterial(w, { palette: ['#ff3dcb', '#22d3ff', '#ffd23f'], lit: 0.9 });
  const chunk = (name, cull) => w.layer({ name, geometry: bgeo, material: cmat, castShadow: false, cull, chunk: 140 });
  const near = chunk('city-near', 1.0), mid = chunk('city-mid', 1.4), far = chunk('city-far', 2.2);
  const tints = [new THREE.Color('#ffffff'), new THREE.Color('#d8d4ff'), new THREE.Color('#ffd8f4'), new THREE.Color('#d0f0ff')];
  const signItems = [], poolDummy = [];
  const roofClutter = w.layer({ name: 'roof-clutter', geometry: C.rooftopClutter({}), material: new THREE.MeshLambertMaterial({ vertexColors: true }), castShadow: false, cull: 0.7 });
  const road = w.road;
  const clearOfRoad = (x, z, pad) => { const q = road.query(x, z); return !(q.near && Math.abs(q.lateral) < q.hw + q.sh + pad && q.dist < q.hw + q.sh + pad + 4) ; };
  const roadDist = (x, z) => { const q = road.query(x, z); return q.near ? q.dist - (q.hw + q.sh) : 1e9; };
  const lotOk = (cx, cz, sx, sz, pad) => {
    const hx = sx / 2, hz = sz / 2;
    for (const [dx, dz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [0, -hz], [0, hz], [-hx, 0], [hx, 0], [0, 0]]) if (!clearOfRoad(cx + dx, cz + dz, pad)) return false;
    return true;
  };
  const centreX = (bb.minX + bb.maxX) / 2, centreZ = (bb.minZ + bb.maxZ) / 2;
  let nBuild = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const cx = i * TILE + TILE / 2, cz = j * TILE + TILE / 2;
    const dC = Math.hypot(cx - centreX, cz - centreZ);
    const rd = roadDist(cx, cz);
    // lot subdivision
    const r = rnd();
    const subs = r < 0.38 ? 1 : r < 0.7 ? 2 : 4;
    const lot = 44;
    const boxes = [];
    if (subs === 1) boxes.push([cx, cz, lot - rnd() * 8, lot - rnd() * 8]);
    else if (subs === 2) { const ax = rnd() < 0.5; const a = lot / 2 - 1.5; for (const sgn of [-1, 1]) boxes.push(ax ? [cx + sgn * lot * 0.25, cz, a - rnd() * 3, lot - rnd() * 8] : [cx, cz + sgn * lot * 0.25, lot - rnd() * 8, a - rnd() * 3]); }
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxes.push([cx + sx * lot * 0.25, cz + sz * lot * 0.25, lot / 2 - 2 - rnd() * 3, lot / 2 - 2 - rnd() * 3]);
    for (const [bx, bz, sx, sz] of boxes) {
      if (!lotOk(bx, bz, sx, sz, 5.5)) continue;
      const d2 = roadDist(bx, bz);
      // taller toward the middle of the city and when far from the road (so the road is not boxed in by a wall of sky-high towers)
      const downtown = 1 - smooth(60, 620, dC);
      let h = 16 + rnd() * 26 + rnd() * rnd() * (60 + 230 * downtown) * smooth(10, 90, d2);
      if (rnd() < 0.05 + 0.1 * downtown) h += 40 + rnd() * 70;
      h = Math.min(h, 320);
      // a few mid-size neon "billboard towers" right at the road
      const g = Math.min(w.groundAt(bx - sx / 2, bz - sz / 2), w.groundAt(bx + sx / 2, bz + sz / 2), w.groundAt(bx - sx / 2, bz + sz / 2), w.groundAt(bx + sx / 2, bz - sz / 2));
      const layer = d2 < 70 ? near : d2 < 260 ? mid : far;
      layer.add(bx, g - 0.6, bz, 0, [sx, h, sz], tints[(rnd() * tints.length) | 0]);
      nBuild++;
      if (h > 40 && rnd() < 0.55 && d2 < 160) roofClutter.add(bx + (rnd() - 0.5) * sx * 0.3, g - 0.6 + h, bz + (rnd() - 0.5) * sz * 0.3, rnd() * 6.28, 0.8 + rnd() * 0.7, null);
      // neon sign on the face that looks at the road
      if (d2 < 110 && rnd() < 0.62) {
        const q = road.query(bx, bz);
        const sp = tr.sampleAt(q.s);
        const rp = sp.position;
        const toRoad = new THREE.Vector3(rp.x - bx, 0, rp.z - bz).normalize();
        // snap to the dominant axis (building faces are axis aligned)
        const axisX = Math.abs(toRoad.x) > Math.abs(toRoad.z);
        const nx = axisX ? Math.sign(toRoad.x) : 0, nz = axisX ? 0 : Math.sign(toRoad.z);
        const face = axisX ? sx / 2 : sz / 2;
        const sw = Math.min(axisX ? sz * 0.9 : sx * 0.9, 12 + rnd() * 6);
        const sh = sw * 0.5;
        const sy = g + 7 + rnd() * Math.max(2, Math.min(h - 14, 44));
        const lateralShift = (rnd() - 0.5) * Math.max(0, (axisX ? sz : sx) - sw - 2);
        signItems.push({ x: bx + nx * (face + 0.4) + (axisX ? 0 : lateralShift), y: sy, z: bz + nz * (face + 0.4) + (axisX ? lateralShift : 0), yaw: Math.atan2(nx, nz), w: sw, h: sh, sign: (rnd() * NEON_SIGN_COUNT) | 0, flicker: rnd() < 0.4 ? 0.9 : 0.15 });
      }
    }
  }

  // ---- neon signs, glow halos behind them -------------------------------------------------------------------------------------
  if (signItems.length) {
    createNeonSigns(w, signItems);
    const palette = ['#ff3dcb', '#22d3ff', '#ffb347', '#b86bff', '#7be04a'];
    createBillboards(w, signItems.map((s, i) => ({ x: s.x + Math.sin(s.yaw) * 0.6, y: s.y + s.h / 2, z: s.z + Math.cos(s.yaw) * 0.6, size: s.w * 1.7, color: palette[i % palette.length], flicker: s.flicker * 0.8, phase: i * 0.37 })), { name: 'sign-halos', intensity: 0.5, fadeFar: 420 });
  }

  // ---- street lamps + light pools --------------------------------------------------------------------------------------------------
  {
    const geo = C.streetLamp({});
    const lampLayer = w.layer({ name: 'street-lamps', geometry: geo, material: new THREE.MeshLambertMaterial({ vertexColors: true }), castShadow: false, cull: 0.8, chunk: 160 });
    const halos = [], pools = [];
    const V = new THREE.Vector3();
    let k = 0;
    for (let s = 12; s < L; s += 38) {
      const smp = tr.sampleAt(s);
      if (smp.position.y > 0.6 && smp.position.y < 7) continue;                        // not on the ramps
      if (s > tunnelR[0] - 4 && s < tunnelR[1] + 4) continue;                          // the tunnel has its own lights
      const side = k++ % 2 ? 1 : -1;
      const lat = side * (smp.halfWidth + smp.shoulder + 1.6);
      const p = tr.pointAt(s, lat, new THREE.Vector3());
      const gy = smp.position.y + smp.right.y * lat + (smp.position.y > 7 ? 0 : 0);
      const base = smp.position.y > 7 ? gy : w.groundAt(p.x, p.z);
      const toRoad = new THREE.Vector3(-smp.right.x * side, 0, -smp.right.z * side).normalize();
      lampLayer.add(p.x, base - 0.05, p.z, Math.atan2(-toRoad.z, toRoad.x), 1, null);
      const warm = k % 3 === 0 ? '#9fe8ff' : '#ffc77a';
      halos.push({ x: p.x + toRoad.x * 2.4, y: base + 8.1, z: p.z + toRoad.z * 2.4, size: 6.5, color: warm, flicker: k % 7 === 0 ? 0.6 : 0, phase: k * 0.31 });
      const pp = tr.pointAt(s, side * smp.halfWidth * 0.3, V);
      pools.push({ x: pp.x, y: pp.y, z: pp.z, r: smp.halfWidth * 0.95, color: warm, ux: smp.up.x, uy: smp.up.y, uz: smp.up.z });
    }
    createBillboards(w, halos, { name: 'lamp-halos', intensity: 0.85, fadeFar: 360 });
    createLightPools(w, pools, { intensity: 0.2 });
  }

  // ---- hover traffic: streams of tiny lights gliding along sky lanes ------------------------------------------------------------------------
  {
    const lanes = [];
    const n = 4;
    for (let i = 0; i < n; i++) { const y = 95 + i * 34, a = i * 0.8, len = 1100; lanes.push({ y, a, len, dirX: Math.cos(a), dirZ: Math.sin(a), ox: Math.sin(a) * (i - 1.5) * 140, oz: -Math.cos(a) * (i - 1.5) * 140 }); }
    const items = [], meta = [];
    lanes.forEach((ln, li) => { for (let k = 0; k < 16; k++) { const t = k / 16 + rnd() * 0.02; meta.push({ ln, t, sp: 0.018 + li * 0.004, jit: (rnd() - 0.5) * 18, col: k % 3 === 0 ? '#ff3dcb' : k % 3 === 1 ? '#22d3ff' : '#ffffff' }); items.push({ x: 0, y: 0, z: 0, size: 3.2, color: meta[meta.length - 1].col, flicker: 0, pulse: 0.5 }); } });
    const mesh = createBillboards(w, items, { name: 'hover-traffic', intensity: 1.3, fadeFar: 900 });
    const m4 = new THREE.Matrix4();
    w.addUpdater((dt, t) => {
      for (let i = 0; i < meta.length; i++) {
        const e = meta[i], ln = e.ln;
        const u = ((e.t + t * e.sp) % 1) - 0.5;
        mesh.setMatrixAt(i, m4.makeScale(3.2, 3.2, 3.2).setPosition(centreX + ln.ox + ln.dirX * u * ln.len - ln.dirZ * e.jit, ln.y, centreZ + ln.oz + ln.dirZ * u * ln.len + ln.dirX * e.jit));
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- rain ---------------------------------------------------------------------------------------------------------------------------------------
  w.addUpdater(createAmbient(w, { name: 'rain', count: 1800, box: [60, 34, 60], size: [0.035, 0.9], color: '#bcd0ff', opacity: 0.38, velocity: [-1.2, -26, 0.4], sway: 0, stretch: 1, qualityScale: 1, map: 'hard' }));
}
