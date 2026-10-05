// Procedural texture library (canvas 2D, no external assets).  OWNER: Agent B.
// Every function returns a fresh THREE.CanvasTexture built from a CACHED source canvas (small LRU), so re-loading a track is
// fast while GPU memory is released when the World disposes its textures.  All textures are sRGB, mip-mapped + anisotropic.
// Ground/road textures are tileable; `uvMeters` documents how many metres one tile should cover.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { makeTileNoise } from './noise.js';

const LRU_MAX = 22;
const lru = new Map();

export const texStats = { ms: 0, built: 0 };
function cachedCanvas(key, make) {
  let c = lru.get(key);
  if (c) { lru.delete(key); lru.set(key, c); return c; }
  const t0 = performance.now();
  c = make();
  texStats.ms += performance.now() - t0; texStats.built++;
  lru.set(key, c);
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
  return c;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: false });
  return [c, g];
}

export function toTexture(cv, { repeat = true, aniso = 8, mirror = false } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

const hexRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Draw a soft tileable noise layer (colour ramp dark->light) scaled up with bilinear filtering over the whole canvas. */
function noiseLayer(g, W, H, { seed = 1, period = 4, oct = 4, gain = 0.5, dark, light, alpha = 1, res = 128, contrast = 1 }) {
  const tn = makeTileNoise(seed);
  const [lc, lg] = canvas(res, res);
  const img = lg.createImageData(res, res);
  const d = hexRgb(dark), l = hexRgb(light);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    let n = tn.fbm(x / res, y / res, period, oct, gain);
    n = Math.min(1, Math.max(0, (n - 0.5) * contrast + 0.5));
    const o = (y * res + x) * 4;
    img.data[o] = d[0] + (l[0] - d[0]) * n; img.data[o + 1] = d[1] + (l[1] - d[1]) * n; img.data[o + 2] = d[2] + (l[2] - d[2]) * n; img.data[o + 3] = 255;
  }
  lg.putImageData(img, 0, 0);
  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lc, 0, 0, W, H);
  g.restore();
}

/** Run `draw(dx,dy)` once, plus wrapped copies when a feature of radius r at (x,y) touches a tile border (tileable art). */
function wrapped(W, H, x, y, r, draw) {
  draw(0, 0);
  const nx = x < r ? 1 : x > W - r ? -1 : 0, ny = y < r ? 1 : y > H - r ? -1 : 0;
  if (nx) draw(nx * W, 0);
  if (ny) draw(0, ny * H);
  if (nx && ny) draw(nx * W, ny * H);
}

// ------------------------------------------------------------------------------------------------------------------
// ROAD
/**
 * style: { base, light, dark, wear, line, centerLine:'dash'|'double'|'solid'|'none', edgeLine:true, centerColor, edgeColor,
 *          glowEdge (neon): colour, cracks:0..1, patches:0..1, speckle:0..1, rubber:0..1, gloss (wet sheen strokes) }
 * Texture space: u across the road [0,1] (width varies in metres per track), v along it (tile = 12 m).
 */
export function roadTexture(style = {}) {
  const s = { base: '#4f525e', light: '#666a78', dark: '#3a3d48', wear: '#2b2d36', edgeLine: true, centerLine: 'dash', edgeColor: '#f6f4ea', centerColor: '#f2efe2', cracks: 0.6, patches: 0.5, speckle: 1, rubber: 0.6, seed: 11, ...style };
  const cv = cachedCanvas('road:' + JSON.stringify(s), () => {
    const W = 1024, H = 1024;
    const [c, g] = canvas(W, H);
    g.fillStyle = s.base; g.fillRect(0, 0, W, H);
    noiseLayer(g, W, H, { seed: s.seed, period: 3, oct: 4, dark: s.dark, light: s.light, alpha: 0.85, contrast: 1.6 });
    const rnd = mulberry32(s.seed * 97);
    // tyre-polished racing lines: two soft darker bands + a lighter rubbered centre
    if (s.rubber > 0) {
      for (const [u, w] of [[0.30, 0.12], [0.70, 0.12]]) {
        const grd = g.createLinearGradient((u - w) * W, 0, (u + w) * W, 0);
        grd.addColorStop(0, rgba(hexRgb(s.wear), 0)); grd.addColorStop(0.5, rgba(hexRgb(s.wear), 0.38 * s.rubber)); grd.addColorStop(1, rgba(hexRgb(s.wear), 0));
        g.fillStyle = grd; g.fillRect((u - w) * W, 0, 2 * w * W, H);
      }
      // streaky wear: long faint vertical strokes
      for (let i = 0; i < 520; i++) {
        const u = rnd() < 0.5 ? 0.30 + (rnd() - 0.5) * 0.2 : 0.70 + (rnd() - 0.5) * 0.2;
        const x = u * W, y = rnd() * H, len = 40 + rnd() * 220;
        g.strokeStyle = rgba(hexRgb(rnd() < 0.5 ? s.wear : s.light), 0.05 + rnd() * 0.07);
        g.lineWidth = 1 + rnd() * 2.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y + len); g.stroke();
        if (y + len > H) { g.beginPath(); g.moveTo(x, y - H); g.lineTo(x + (rnd() - 0.5) * 4, y + len - H); g.stroke(); }
      }
    }
    // aggregate speckle
    const nSp = Math.round(16000 * s.speckle);
    for (let i = 0; i < nSp; i++) {
      const v = rnd();
      const c0 = v < 0.5 ? hexRgb(s.dark) : hexRgb(s.light);
      g.fillStyle = rgba(c0, 0.12 + rnd() * 0.25);
      const sz = 1 + rnd() * 2.4;
      g.fillRect(rnd() * W, rnd() * H, sz, sz);
    }
    // patches (tar repairs): slightly different tone rectangles with crisp edges
    for (let i = 0, n = Math.round(7 * s.patches); i < n; i++) {
      const x = rnd() * W * 0.8 + W * 0.06, y = rnd() * H, w = 90 + rnd() * 240, h = 40 + rnd() * 160;
      const c0 = mix3(hexRgb(s.base), hexRgb(rnd() < 0.5 ? s.dark : s.light), 0.5);
      wrapped(W, H, x, y, h, (dx, dy) => { g.fillStyle = rgba(c0, 0.55); g.fillRect(x + dx, y + dy, w, h); g.strokeStyle = rgba(hexRgb(s.dark), 0.55); g.lineWidth = 2; g.strokeRect(x + dx, y + dy, w, h); });
    }
    // cracks: meandering thin dark polylines
    for (let i = 0, n = Math.round(16 * s.cracks); i < n; i++) {
      let x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI * 2;
      g.strokeStyle = rgba(hexRgb(s.wear), 0.55 + rnd() * 0.25); g.lineWidth = 1 + rnd() * 1.4;
      g.beginPath(); g.moveTo(x, y);
      const segs = 6 + (rnd() * 10) | 0;
      for (let k = 0; k < segs; k++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * (14 + rnd() * 28); y += Math.sin(a) * (14 + rnd() * 28); g.lineTo(x, y); }
      g.stroke();
    }
    // oil stains
    for (let i = 0; i < 5; i++) {
      const x = (0.2 + rnd() * 0.6) * W, y = rnd() * H, r = 14 + rnd() * 32;
      wrapped(W, H, x, y, r, (dx, dy) => { const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); grd.addColorStop(0, rgba(hexRgb(s.wear), 0.35)); grd.addColorStop(1, rgba(hexRgb(s.wear), 0)); g.fillStyle = grd; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); });
    }
    // edge grime + baked ambient occlusion near the barriers
    for (const side of [0, 1]) {
      const x0 = side ? W : 0, x1 = side ? W * 0.9 : W * 0.1;
      const grd = g.createLinearGradient(x0, 0, x1, 0);
      grd.addColorStop(0, rgba(hexRgb(s.wear), 0.55)); grd.addColorStop(1, rgba(hexRgb(s.wear), 0));
      g.fillStyle = grd; g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), H);
    }
    // painted lines go on their own layer so they can be weathered
    const [lc, lg] = canvas(W, H);
    const lw = W * 0.0205;
    if (s.edgeLine) {
      lg.fillStyle = s.edgeColor;
      lg.fillRect(W * 0.040, 0, lw, H); lg.fillRect(W * (1 - 0.040) - lw, 0, lw, H);
    }
    lg.fillStyle = s.centerColor;
    if (s.centerLine === 'dash') {
      const cw = W * 0.0185;
      for (let k = 0; k < 1; k++) lg.fillRect(W / 2 - cw / 2, H * 0.08, cw, H * 0.34);
    } else if (s.centerLine === 'double') {
      const cw = W * 0.011, gap = W * 0.014; lg.fillRect(W / 2 - gap - cw / 2, 0, cw, H); lg.fillRect(W / 2 + gap - cw / 2, 0, cw, H);
    } else if (s.centerLine === 'solid') lg.fillRect(W / 2 - W * 0.009, 0, W * 0.018, H);
    // weathering: punch tiny holes / scuffs through the paint
    lg.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) { lg.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.5})`; const sz = 1 + rnd() * 3; lg.fillRect(rnd() * W, rnd() * H, sz, sz * (1 + rnd() * 2)); }
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(lc, 0, 0);
    // optional neon edge glow (night themes)
    if (s.glowEdge) {
      for (const side of [0, 1]) {
        const x = side ? W * (1 - 0.05) : W * 0.05;
        const grd = g.createLinearGradient(x - W * 0.07, 0, x + W * 0.07, 0);
        grd.addColorStop(0, rgba(hexRgb(s.glowEdge), 0)); grd.addColorStop(0.5, rgba(hexRgb(s.glowEdge), 0.28)); grd.addColorStop(1, rgba(hexRgb(s.glowEdge), 0));
        g.globalCompositeOperation = 'lighter'; g.fillStyle = grd; g.fillRect(x - W * 0.07, 0, W * 0.14, H); g.globalCompositeOperation = 'source-over';
      }
    }
    return c;
  });
  return toTexture(cv, { aniso: 16 });
}

// ------------------------------------------------------------------------------------------------------------------
// CURBS (stripes along v; tile = 4 m = two stripes)
export function curbTexture({ a = '#e5413a', b = '#f8f6ee', seed = 5 } = {}) {
  const cv = cachedCanvas(`curb:${a}:${b}`, () => {
    const W = 128, H = 256;
    const [c, g] = canvas(W, H);
    const rnd = mulberry32(seed);
    g.fillStyle = a; g.fillRect(0, 0, W, H / 2);
    g.fillStyle = b; g.fillRect(0, H / 2, W, H / 2);
    // bevel: bright outer lip + darker inner edge so the curb reads as a raised object
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.30)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.0)'); grd.addColorStop(0.8, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, W, 3); g.fillRect(0, H / 2 - 1, W, 3);
    return c;
  });
  return toTexture(cv, { aniso: 8 });
}

// ------------------------------------------------------------------------------------------------------------------
// GROUND (tileable, `tileMeters` ~ 10 m).  kinds: grass, sand, snow, rock, dirt, moss, lava, ash, ice
const GROUND = {
  grass: { base: '#5aa83a', dark: '#3f8a2c', light: '#86cc4c', blade: ['#2f7d27', '#a6dc5c', '#4c9a30'], bladeAlpha: 0.5, blades: 5200, dots: ['#fff7c4', '#ffffff', '#ffd23f'], dotCount: 36 },
  meadow: { base: '#66b53f', dark: '#478f2e', light: '#98d654', blade: ['#2f7d27', '#b6e866', '#58a834'], bladeAlpha: 0.5, blades: 5200, dots: ['#fff7c4', '#ffffff', '#ffb0d0', '#ffe35c'], dotCount: 90 },
  sand: { base: '#e2b774', dark: '#c99955', light: '#f3d18f', ripple: true, speck: ['#b98a4a', '#fff0c4'] },
  snow: { base: '#eef4ff', dark: '#c4d8f4', light: '#ffffff', sparkle: true },
  rock: { base: '#9a6b4a', dark: '#6e4630', light: '#c18d63', strata: true, cracks: true },
  dirt: { base: '#8a6540', dark: '#5f4228', light: '#b08a5c', pebbles: true },
  moss: { base: '#3d5a3a', dark: '#26402b', light: '#5f8650', blade: ['#1f3a22', '#7aa35f', '#35552f'], bladeAlpha: 0.45, blades: 4200, dots: ['#8fd2a0', '#c8f0d0'], dotCount: 24 },
  ash: { base: '#3a3636', dark: '#241f20', light: '#585050', pebbles: true, cracks: true },
  lava: { base: '#2a2224', dark: '#150f11', light: '#453a3c', cracks: true, glowCracks: '#ff6a1a' },
  neutral: { base: '#e6e6e6', dark: '#c8c8c8', light: '#f8f8f8', blade: ['#bcbcbc', '#ffffff', '#d4d4d4'], bladeAlpha: 0.4, blades: 4200 },
  ice: { base: '#b6dcf5', dark: '#7fb7e6', light: '#eaf8ff', cracks: true, sparkle: true },
};

export function groundTexture(kind = 'grass', overrides = {}) {
  const p = { ...(GROUND[kind] ?? GROUND.grass), ...overrides };
  const cv = cachedCanvas(`ground:${kind}:${JSON.stringify(overrides)}`, () => {
    const W = 512, H = 512;
    const [c, g] = canvas(W, H);
    const rnd = mulberry32(hashStr(kind) + 3);
    g.fillStyle = p.base; g.fillRect(0, 0, W, H);
    noiseLayer(g, W, H, { seed: hashStr(kind), period: 3, oct: 5, dark: p.dark, light: p.light, alpha: 0.9, contrast: 1.5, res: 128 });
    if (p.blades) {
      for (let i = 0; i < p.blades; i++) {
        const x = rnd() * W, y = rnd() * H, len = 4 + rnd() * 9, a = -Math.PI / 2 + (rnd() - 0.5) * 1.4;
        const col = p.blade[(rnd() * p.blade.length) | 0];
        wrapped(W, H, x, y, len, (dx, dy) => {
          g.strokeStyle = rgba(hexRgb(col), p.bladeAlpha * (0.5 + rnd() * 0.7)); g.lineWidth = 1 + rnd() * 1.2;
          g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len); g.stroke();
        });
      }
    }
    if (p.dots) for (let i = 0; i < p.dotCount; i++) {
      const x = rnd() * W, y = rnd() * H, r = 1.2 + rnd() * 1.6, col = p.dots[(rnd() * p.dots.length) | 0];
      wrapped(W, H, x, y, r + 2, (dx, dy) => { g.fillStyle = col; g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,220,60,0.9)'; g.beginPath(); g.arc(x + dx, y + dy, r * 0.4, 0, 7); g.fill(); });
    }
    if (p.ripple) {
      for (let i = 0; i < 70; i++) {
        const y0 = rnd() * H, amp = 2 + rnd() * 5, ph = rnd() * 6.28, f = 0.01 + rnd() * 0.02;
        g.strokeStyle = rgba(hexRgb(rnd() < 0.5 ? p.dark : p.light), 0.22); g.lineWidth = 1 + rnd() * 2;
        g.beginPath(); for (let x = 0; x <= W; x += 6) { const y = y0 + Math.sin(x * f * 6.28 + ph) * amp; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      }
      for (let i = 0; i < 2600; i++) { g.fillStyle = rgba(hexRgb(p.speck[(rnd() * 2) | 0]), 0.2 + rnd() * 0.3); g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
    }
    if (p.strata) {
      for (let i = 0; i < 40; i++) {
        const y = rnd() * H, h = 3 + rnd() * 22;
        g.fillStyle = rgba(hexRgb(rnd() < 0.5 ? p.dark : p.light), 0.2 + rnd() * 0.2); g.fillRect(0, y, W, h);
      }
    }
    if (p.pebbles) {
      for (let i = 0; i < 520; i++) {
        const x = rnd() * W, y = rnd() * H, r = 1.5 + rnd() * 4.5;
        wrapped(W, H, x, y, r + 2, (dx, dy) => {
          g.fillStyle = rgba(hexRgb(rnd() < 0.5 ? p.dark : p.light), 0.55); g.beginPath(); g.ellipse(x + dx, y + dy, r, r * 0.75, rnd() * 3, 0, 7); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + dx + 1, y + dy + 1.5, r, r * 0.7, 0, 0, 7); g.fill();
        });
      }
    }
    if (p.cracks) {
      for (let i = 0; i < 22; i++) {
        let x = rnd() * W, y = rnd() * H, a = rnd() * 6.28;
        const path = [[x, y]];
        for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * (12 + rnd() * 26); y += Math.sin(a) * (12 + rnd() * 26); path.push([x, y]); }
        const draw = (col, w, al) => { g.strokeStyle = rgba(hexRgb(col), al); g.lineWidth = w; g.beginPath(); path.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); };
        if (p.glowCracks) { draw(p.glowCracks, 5, 0.25); draw('#ffb347', 1.6, 0.95); } else draw(p.dark, 1.4, 0.6);
      }
    }
    if (p.sparkle) {
      for (let i = 0; i < 520; i++) { g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.65})`; const sz = rnd() < 0.9 ? 1 : 2; g.fillRect(rnd() * W, rnd() * H, sz, sz); }
    }
    return c;
  });
  return toTexture(cv, { aniso: 8 });
}

// ------------------------------------------------------------------------------------------------------------------
// WOOD planks (bridges, boardwalks): planks run ACROSS the road (u), tile = 4 m along v, 8 planks
export function woodTexture({ base = '#b07a45', dark = '#7c4f2a', light = '#d9a066', seed = 21, planks = 8, across = true } = {}) {
  const cv = cachedCanvas(`wood:${base}:${planks}:${across}`, () => {
    const W = 512, H = 512;
    const [c, g] = canvas(W, H);
    const rnd = mulberry32(seed);
    const ph = H / planks;
    for (let i = 0; i < planks; i++) {
      const t = rnd();
      const col = mix3(hexRgb(dark), hexRgb(light), 0.35 + t * 0.55);
      g.fillStyle = rgba(mix3(col, hexRgb(base), 0.4)); g.fillRect(0, i * ph, W, ph);
      // grain
      for (let k = 0; k < 26; k++) {
        const y = i * ph + 2 + rnd() * (ph - 4);
        g.strokeStyle = rgba(hexRgb(rnd() < 0.5 ? dark : light), 0.18 + rnd() * 0.2); g.lineWidth = 0.8 + rnd();
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + (rnd() - 0.5) * 5, W * 0.7, y + (rnd() - 0.5) * 5, W, y + (rnd() - 0.5) * 3); g.stroke();
      }
      // knots
      if (rnd() < 0.5) { const x = rnd() * W, y = i * ph + ph / 2; g.fillStyle = rgba(hexRgb(dark), 0.5); g.beginPath(); g.ellipse(x, y, 7 + rnd() * 5, 4 + rnd() * 2, 0, 0, 7); g.fill(); }
      // dark gap + nails
      g.fillStyle = 'rgba(25,14,6,0.8)'; g.fillRect(0, i * ph + ph - 3, W, 3);
      g.fillStyle = 'rgba(30,22,16,0.9)'; for (const x of [18, W - 18]) { g.beginPath(); g.arc(x, i * ph + ph / 2, 2.4, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, i * ph, W, 2);
    }
    if (!across) { const [r, rg] = canvas(H, W); rg.translate(H / 2, W / 2); rg.rotate(Math.PI / 2); rg.drawImage(c, -W / 2, -H / 2); return r; }
    return c;
  });
  return toTexture(cv, { aniso: 8 });
}

// ------------------------------------------------------------------------------------------------------------------
// misc small textures
export function checkerTexture({ a = '#ffffff', b = '#161616', cells = 8, rows = 2 } = {}) {
  const cv = cachedCanvas(`checker:${a}:${b}:${cells}:${rows}`, () => {
    const s = 32, [c, g] = canvas(s * cells, s * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cells; x++) { g.fillStyle = (x + y) % 2 ? b : a; g.fillRect(x * s, y * s, s, s); }
    return c;
  });
  return toTexture(cv, { aniso: 8 });
}

/** Soft round glow sprite (additive halos, lamp glows, fireflies, snow flakes with `hard`). */
export function glowTexture({ inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', hard = 0.0, size = 128 } = {}) {
  const cv = cachedCanvas(`glow:${inner}:${outer}:${hard}:${size}`, () => {
    const [c, g] = canvas(size, size);
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, inner); grd.addColorStop(Math.min(0.95, hard), inner); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return c;
  });
  return toTexture(cv, { repeat: false, aniso: 1 });
}

/** Banner / signboard: text on a coloured plate with a checker or stripe trim.  Used by the start gantry & sponsor boards. */
export function bannerTexture({ text = 'START', sub = '', bg = '#e8403a', fg = '#ffffff', trim = '#ffd23f', w = 1024, h = 256, checker = true } = {}) {
  const cv = cachedCanvas(`banner:${text}:${sub}:${bg}:${fg}:${trim}:${checker}`, () => {
    const [c, g] = canvas(w, h);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, shade(bg, 1.25)); grd.addColorStop(1, shade(bg, 0.78));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    if (checker) { const s = h / 8; for (let x = 0; x < w / s; x++) for (let y = 0; y < 1; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s, 0, s, s / 2); g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * s, h - s / 2, s, s / 2); } }
    g.fillStyle = trim; g.fillRect(0, h * 0.09, w, 6); g.fillRect(0, h * 0.91 - 6, w, 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 900 ${h * (sub ? 0.46 : 0.58)}px "KR Display", "Lilita One", Impact, sans-serif`;
    g.lineWidth = h * 0.05; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(text, w / 2, h * (sub ? 0.43 : 0.52));
    g.fillStyle = fg; g.fillText(text, w / 2, h * (sub ? 0.43 : 0.52));
    if (sub) { g.font = `800 ${h * 0.17}px "KR UI", Nunito, Arial, sans-serif`; g.fillStyle = trim; g.fillText(sub, w / 2, h * 0.78); }
    return c;
  });
  return toTexture(cv, { repeat: false, aniso: 8 });
}

/**
 * Jump-ramp surface: plate with hazard-striped side borders and big forward chevrons (u across 0..1, v along 0..1 = one tile per ramp).
 * style: { base, plank (wood grain), stripeA, stripeB, chevron }
 */
export function rampTexture(style = {}) {
  const s = { base: '#3b4258', grain: false, stripeA: '#ffd23f', stripeB: '#1b1e29', chevron: '#ffffff', glow: null, seed: 4, ...style };
  const cv = cachedCanvas('ramp:' + JSON.stringify(s), () => {
    const W = 512, H = 512, [c, g] = canvas(W, H);
    const rnd = mulberry32(s.seed);
    g.fillStyle = s.base; g.fillRect(0, 0, W, H);
    if (s.grain) {
      for (let i = 0; i < 16; i++) { const y = (i / 16) * H; g.fillStyle = i % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)'; g.fillRect(0, y, W, H / 16); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y, W, 2); }
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rnd() * 0.08})`; g.fillRect(rnd() * W, rnd() * H, 20 + rnd() * 80, 1); }
    } else {
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.1})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    }
    // hazard-striped borders
    const bw = W * 0.085;
    for (const x0 of [0, W - bw]) {
      g.save(); g.beginPath(); g.rect(x0, 0, bw, H); g.clip();
      for (let k = -2; k < 24; k++) { g.fillStyle = k % 2 ? s.stripeA : s.stripeB; g.beginPath(); const y = k * 44; g.moveTo(x0, y); g.lineTo(x0 + bw, y - 26); g.lineTo(x0 + bw, y + 18); g.lineTo(x0, y + 44); g.fill(); }
      g.restore();
    }
    // forward chevrons (point toward +v = driving direction = up the texture)
    g.fillStyle = s.chevron;
    for (let k = 0; k < 4; k++) {
      const y = H * (0.12 + k * 0.23), th = 38;
      g.beginPath(); g.moveTo(W * 0.2, y + 70); g.lineTo(W * 0.5, y); g.lineTo(W * 0.8, y + 70); g.lineTo(W * 0.8, y + 70 + th); g.lineTo(W * 0.5, y + th); g.lineTo(W * 0.2, y + 70 + th); g.closePath();
      g.globalAlpha = 0.55 + k * 0.12; g.fill(); g.globalAlpha = 1;
    }
    if (s.glow) { g.globalCompositeOperation = 'lighter'; const grd = g.createLinearGradient(0, H, 0, 0); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, s.glow); g.fillStyle = grd; g.globalAlpha = 0.18; g.fillRect(0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    return c;
  });
  return toTexture(cv, { aniso: 8, repeat: false });
}

/** Chevron warning board (320x256): `dir` = +1 points LEFT (left-hand corner), -1 points RIGHT. Corners are dark border (posts sample them). */
export function arrowTexture({ dir = 1, a = '#e5413a', b = '#ffffff', border = '#22262f' } = {}) {
  const cv = cachedCanvas(`arrow:${dir}:${a}:${b}`, () => {
    const W = 320, H = 256, [c, g] = canvas(W, H);
    g.fillStyle = border; g.fillRect(0, 0, W, H);
    g.fillStyle = a; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 16); g.fill();
    g.fillStyle = b;
    const n = 3, gap = 78, w0 = W / 2 - gap * (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const cx = w0 + i * gap - dir * 6, s = -dir; // s = +1 means pointing RIGHT
      g.beginPath();
      g.moveTo(cx - 34 * s, 40); g.lineTo(cx + 18 * s, H / 2); g.lineTo(cx - 34 * s, H - 40);
      g.lineTo(cx - 6 * s, H - 40); g.lineTo(cx + 46 * s, H / 2); g.lineTo(cx - 6 * s, 40);
      g.closePath(); g.fill();
    }
    return c;
  });
  return toTexture(cv, { repeat: false, aniso: 8 });
}

/** Spectators: 3 horizontal bands of cheering people (tileable across; 1024 px = 9 m, each band 0.9 m tall). */
export function crowdTexture({ seed = 3, shirts = ['#e5413a', '#ffd23f', '#2f8be8', '#35c759', '#ff7a1a', '#8b4dff', '#ff3d6a', '#22d3ff', '#ffffff', '#1d2a5c'] } = {}) {
  const cv = cachedCanvas(`crowd:${seed}:${shirts.join('')}`, () => {
    const W = 1024, H = 384, [c, g] = canvas(W, H);
    const rnd = mulberry32(seed * 313 + 7);
    const skins = ['#f4c8a0', '#e0a070', '#b8784a', '#8a5a3a', '#f8d8b8', '#c98e5e'], hairs = ['#2a1c10', '#5a3a1c', '#c89a4a', '#111111', '#d94a2a', '#e8d8a8'];
    g.fillStyle = '#2b2436'; g.fillRect(0, 0, W, H);
    for (let band = 0; band < 3; band++) {
      const y0 = band * 128;
      const grd = g.createLinearGradient(0, y0, 0, y0 + 128); grd.addColorStop(0, '#3a3148'); grd.addColorStop(1, '#1f1a29'); g.fillStyle = grd; g.fillRect(0, y0, W, 128);
      for (let row = 0; row < 2; row++) {
        const n = 30, yBase = y0 + 128 - row * 22 - 4;
        for (let i = 0; i < n; i++) {
          const x = ((i + rnd() * 0.6 + row * 0.5) / n) * W, w = 30 + rnd() * 10, bodyH = 44 + rnd() * 12;
          const shirt = shirts[(rnd() * shirts.length) | 0], skin = skins[(rnd() * skins.length) | 0], hair = hairs[(rnd() * hairs.length) | 0];
          const arms = rnd() < 0.35, flag = rnd() < 0.08;
          const draw = (dx) => {
            const cx = x + dx, top = yBase - bodyH;
            g.fillStyle = shirt; g.beginPath(); g.roundRect(cx - w / 2, top, w, bodyH + 30, 10); g.fill();
            g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(cx - w / 2, top + bodyH * 0.55, w, bodyH);
            if (arms) { g.strokeStyle = skin; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - w / 2 + 4, top + 8); g.lineTo(cx - w / 2 - 8, top - 22); g.moveTo(cx + w / 2 - 4, top + 8); g.lineTo(cx + w / 2 + 8, top - 22); g.stroke(); }
            if (flag) { g.fillStyle = '#5a3a1c'; g.fillRect(cx + w / 2 + 6, top - 40, 3, 50); g.fillStyle = shirts[(rnd() * shirts.length) | 0]; g.fillRect(cx + w / 2 + 9, top - 40, 22, 14); }
            g.fillStyle = skin; g.beginPath(); g.arc(cx, top - 9, 11, 0, 7); g.fill();
            g.fillStyle = hair; g.beginPath(); g.arc(cx, top - 13, 11, Math.PI, 0); g.fill();
            g.fillStyle = '#222'; g.fillRect(cx - 5, top - 10, 2, 3); g.fillRect(cx + 3, top - 10, 2, 3);
          };
          draw(0); if (x < 40) draw(W); if (x > W - 40) draw(-W);
        }
      }
    }
    return c;
  });
  return toTexture(cv, { aniso: 8 });
}

function shade(hex, k) { const [r, g, b] = hexRgb(hex); return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }

/** Free every GPU texture in a list (call from World.dispose). The cached source canvases stay in the LRU. */
export function disposeTextures(list) { for (const t of list) t?.dispose?.(); }
