// Procedural particle sprite atlas (white shapes on transparent; tinted per particle). OWNER: Agent C (vfx).
// 4 x 4 cells of 128 px on one 512 px canvas: one texture serves every particle layer.
import * as THREE from 'three';

export const SPR = Object.freeze({
  SOFT: 0, DOT: 1, RING: 2, FLARE: 3, STAR5: 4, PUFF1: 5, PUFF2: 6, PUFF3: 7,
  FLAME: 8, STREAK: 9, CONFETTI: 10, DROP: 11, DUST: 12, GLOW: 13, CHEVRON: 14, CHUNK: 15,
});
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
const CELL = 128;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function radial(g, cx, cy, r, stops) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

function puff(g, seed, blobs, spread, base) {
  const r = rng(seed);
  const c = CELL / 2;
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    const rad = CELL * (0.16 + r() * 0.16);
    radial(g, c + Math.cos(a) * d, c + Math.sin(a) * d, rad, [[0, base], [0.55, base * 0.5], [1, 0]]);
  }
}

const DRAW = {
  [SPR.SOFT]: (g, c) => radial(g, c, c, c * 0.98, [[0, 1], [0.35, 0.62], [0.7, 0.18], [1, 0]]),
  [SPR.DOT]: (g, c) => radial(g, c, c, c * 0.9, [[0, 1], [0.5, 1], [0.78, 0.45], [1, 0]]),
  [SPR.RING]: (g, c) => radial(g, c, c, c * 0.98, [[0, 0], [0.62, 0], [0.74, 0.55], [0.82, 1], [0.9, 0.45], [1, 0]]),
  [SPR.FLARE]: (g, c) => {
    radial(g, c, c, c * 0.5, [[0, 1], [0.4, 0.45], [1, 0]]);
    for (const horiz of [true, false]) {
      g.save(); g.translate(c, c); if (!horiz) g.rotate(Math.PI / 2); g.scale(1, 0.09);
      radial(g, 0, 0, c * 0.98, [[0, 1], [0.35, 0.55], [1, 0]]); g.restore();
    }
  },
  [SPR.STAR5]: (g, c) => {
    g.save(); g.translate(c, c); g.shadowColor = '#fff'; g.shadowBlur = 8; g.fillStyle = '#fff'; g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? c * 0.34 : c * 0.78; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke(); g.restore();
  },
  [SPR.PUFF1]: (g) => puff(g, 11, 18, CELL * 0.2, 0.36),
  [SPR.PUFF2]: (g) => puff(g, 23, 20, CELL * 0.24, 0.32),
  [SPR.PUFF3]: (g) => puff(g, 37, 16, CELL * 0.18, 0.38),
  [SPR.FLAME]: (g, c) => {
    g.save(); g.translate(c, c);
    const gr = g.createLinearGradient(0, c * 0.9, 0, -c * 0.9);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.2, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.shadowColor = '#fff'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(0, c * 0.85);
    g.bezierCurveTo(c * 0.62, c * 0.5, c * 0.5, -c * 0.1, 0, -c * 0.9);
    g.bezierCurveTo(-c * 0.5, -c * 0.1, -c * 0.62, c * 0.5, 0, c * 0.85);
    g.fill(); g.restore();
  },
  [SPR.STREAK]: (g, c) => { g.save(); g.translate(c, c); g.scale(1, 0.16); radial(g, 0, 0, c * 0.98, [[0, 1], [0.45, 0.8], [1, 0]]); g.restore(); g.save(); g.translate(c, c); g.scale(0.5, 0.5); radial(g, 0, 0, c * 0.5, [[0, 0.7], [1, 0]]); g.restore(); },
  [SPR.CONFETTI]: (g, c) => { g.fillStyle = '#fff'; g.beginPath(); g.roundRect(c * 0.3, c * 0.5, c * 1.4, c * 1.0, 10); g.fill(); },
  [SPR.DROP]: (g, c) => {
    g.save(); g.translate(c, c); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(0, -c * 0.8); g.bezierCurveTo(c * 0.55, -c * 0.1, c * 0.5, c * 0.62, 0, c * 0.66); g.bezierCurveTo(-c * 0.5, c * 0.62, -c * 0.55, -c * 0.1, 0, -c * 0.8); g.fill(); g.restore();
  },
  [SPR.DUST]: (g) => puff(g, 53, 24, CELL * 0.26, 0.4),
  [SPR.GLOW]: (g, c) => radial(g, c, c, c * 0.99, [[0, 0.9], [0.25, 0.5], [0.6, 0.14], [1, 0]]),
  [SPR.CHEVRON]: (g, c) => {
    g.save(); g.translate(c, c); g.shadowColor = '#fff'; g.shadowBlur = 8; g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-c * 0.7, c * 0.55); g.lineTo(0, -c * 0.1); g.lineTo(c * 0.7, c * 0.55); g.lineTo(c * 0.7, c * 0.15); g.lineTo(0, -c * 0.5); g.lineTo(-c * 0.7, c * 0.15); g.closePath(); g.fill(); g.restore();
  },
  [SPR.CHUNK]: (g, c) => {
    const r = rng(7); g.save(); g.translate(c, c);
    const gr = g.createLinearGradient(-c, -c, c, c); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(120,120,120,1)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, rr = c * (0.45 + r() * 0.35); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.restore();
  },
};

let cached = null;
/** Shared atlas texture (mipmapped, premultiplied-free). */
export function getSpriteAtlas() {
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = cv.height = CELL * ATLAS_COLS;
  const g = cv.getContext('2d');
  for (const [id, fn] of Object.entries(DRAW)) {
    const i = Number(id), col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    g.save();
    g.beginPath(); g.rect(col * CELL, row * CELL, CELL, CELL); g.clip();
    g.translate(col * CELL, row * CELL);
    fn(g, CELL / 2);
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;      // alpha masks: values are used as-is
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  cached = t;
  return t;
}
export function disposeSpriteAtlas() { cached?.dispose(); cached = null; }
