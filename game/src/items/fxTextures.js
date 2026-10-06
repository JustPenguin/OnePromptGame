// Small canvas-generated textures used by the item visuals (glows, rings, reticles, the item-box glyph).
// One set per ItemSystem; dispose() frees them.  Browser-only (needs document).
import * as THREE from 'three';

const TAU = Math.PI * 2;

function make(size, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = opts.w ?? size; c.height = opts.h ?? size;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createFxTextures() {
  const tex = {
    /** soft round glow, white centre fading to transparent (tint with material.color) */
    glow: make(128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.6)');
      gr.addColorStop(0.55, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }),
    /** thin bright ring with soft edges (shock-waves, blast rings) */
    ring: make(256, (g, w, h) => {
      const c = w / 2;
      const gr = g.createRadialGradient(c, c, c * 0.62, c, c, c * 0.98);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.95)'); gr.addColorStop(0.7, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }),
    /** 4-point lens flare star */
    star: make(128, (g, w, h) => {
      const c = w / 2;
      g.translate(c, c);
      for (const [sx, sy] of [[1, 0.1], [0.1, 1]]) {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, c);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.scale(sx, sy); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, c, 0, TAU); g.fill(); g.restore();
      }
      const gr2 = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.4);
      gr2.addColorStop(0, 'rgba(255,255,255,1)'); gr2.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr2; g.beginPath(); g.arc(0, 0, c * 0.4, 0, TAU); g.fill();
    }),
    /** lock-on reticle: dashed ring + four brackets */
    reticle: make(256, (g, w, h) => {
      const c = w / 2;
      g.translate(c, c);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 9; g.setLineDash([26, 16]); g.beginPath(); g.arc(0, 0, c * 0.62, 0, TAU); g.stroke(); g.setLineDash([]);
      g.lineWidth = 13;
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate((i * Math.PI) / 2);
        g.beginPath(); g.moveTo(c * 0.88, -c * 0.2); g.lineTo(c * 0.88, 0); g.lineTo(c * 0.88, c * 0.2); g.stroke();
        g.beginPath(); g.moveTo(c * 0.72, 0); g.lineTo(c * 0.92, 0); g.stroke();
        g.restore();
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
    }),
    /** the "?" glyph on a rainbow rounded square: all six faces of an item box */
    box: make(256, (g, w, h) => {
      const r = 46;
      const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + ww, y, x + ww, y + hh, rad); g.arcTo(x + ww, y + hh, x, y + hh, rad); g.arcTo(x, y + hh, x, y, rad); g.arcTo(x, y, x + ww, y, rad); g.closePath(); };
      // base: rainbow diagonal
      const gr = g.createLinearGradient(0, 0, w, h);
      ['#ff5a7a', '#ffb23a', '#fff04a', '#5ae87a', '#3ac8ff', '#8a6aff', '#ff5ad0'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // inner panel (lighter, glossy) with dark frame
      g.fillStyle = 'rgba(255,255,255,.16)'; rr(14, 14, w - 28, h - 28, r); g.fill();
      g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,.9)'; rr(14, 14, w - 28, h - 28, r); g.stroke();
      g.lineWidth = 5; g.strokeStyle = 'rgba(20,20,60,.35)'; rr(24, 24, w - 48, h - 48, r - 8); g.stroke();
      // question mark drawn with strokes (no font dependency)
      g.translate(w / 2, h / 2 + 6);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const path = () => { g.beginPath(); g.arc(0, -34, 36, Math.PI * 1.08, Math.PI * 2.42); g.quadraticCurveTo(26, 2, 0, 18); g.lineTo(0, 30); };
      g.lineWidth = 38; g.strokeStyle = '#1a1a4a'; path(); g.stroke(); g.beginPath(); g.arc(0, 62, 4, 0, TAU); g.stroke();
      g.lineWidth = 24; g.strokeStyle = '#ffffff'; path(); g.stroke(); g.beginPath(); g.arc(0, 62, 4, 0, TAU); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 62, 12.5, 0, TAU); g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);
      // gloss band
      const gl = g.createLinearGradient(0, 0, 0, h * 0.5);
      gl.addColorStop(0, 'rgba(255,255,255,.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(0, 0, w, h * 0.45);
    }),
    /** gold coin face (star on a disc) */
    coin: make(128, (g, w, h) => {
      const c = w / 2;
      const gr = g.createRadialGradient(c * 0.8, c * 0.7, 4, c, c, c);
      gr.addColorStop(0, '#fff6a8'); gr.addColorStop(0.55, '#ffd23f'); gr.addColorStop(1, '#e08a00');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.beginPath(); g.arc(c, c, c * 0.72, 0, TAU); g.lineWidth = 8; g.strokeStyle = 'rgba(160,90,0,.65)'; g.stroke();
      g.fillStyle = 'rgba(190,110,0,.75)';
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? c * 0.2 : c * 0.46; g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }),
    dispose() { for (const k of Object.keys(tex)) tex[k]?.dispose?.(); },
  };
  return tex;
}
