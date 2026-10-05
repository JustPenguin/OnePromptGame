// Livery decal atlas (race numbers, stripes, signature patterns) tinted by the driver's colours. OWNER: Agent C (visuals).
// Canvas 1024x512 laid out as described in build.js (ATLAS): left flank 512x256 at (0,0), right flank at (0,256), top tile 256x512 at (512,0).
// Everything outside the decals is transparent (the vertex colour = paint shows through).
import * as THREE from 'three';

export const RACE_NUMBERS = { pip: '11', rusty: '22', bruno: '33', hopper: '44', luna: '55', gizmo: '66', rocco: '77', quill: '88' };
const FONT = '"KR Display","Lilita One","Arial Black",Impact,sans-serif';

// A flank is drawn in image space (x right, y down).  `fx(t)` maps t in [0,1] (rear -> front) to image x so that the same design
// reads correctly on both flanks (front is image-left on the kart's left side, image-right on its right side).
function flankCtx(side, W) { return side === 'left' ? (t) => (1 - t) * W : (t) => t * W; }
const yOf = (H, y) => H * (1 - y / 1.1);          // model height (m) -> image y
const tOf = (z) => (z + 1.45) / 2.9;              // model z -> 0..1 rear->front

function number(g, text, x, y, size, fill, ring, dark = '#10131c') {
  g.save();
  g.font = `italic ${size}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.2; g.strokeStyle = dark; g.strokeText(text, x, y + size * 0.04);
  g.lineWidth = size * 0.1; g.strokeStyle = ring; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
  g.restore();
}

function roundel(g, x, y, r, fill, ring) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.84, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
}

// ---- signature flank designs -----------------------------------------------------------------------------------
const DESIGNS = {
  // waves: two flowing ribbons
  pip(g, W, H, fx, c) {
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      const y0 = yOf(H, 0.36 + k * 0.17), amp = H * 0.045;
      g.moveTo(fx(0.02), y0);
      for (let i = 0; i <= 40; i++) { const t = 0.02 + (i / 40) * 0.96; g.lineTo(fx(t), y0 + Math.sin(i * 0.5 + k * 1.5) * amp); }
      g.lineWidth = H * (0.055 - k * 0.015); g.strokeStyle = k ? c.accent : c.secondary; g.lineCap = 'round'; g.stroke();
    }
  },
  // flames licking back from the nose
  rusty(g, W, H, fx, c) {
    for (let k = 0; k < 5; k++) {
      const t0 = 0.98 - k * 0.07, len = 0.34 - k * 0.04;
      const yb = yOf(H, 0.3 + k * 0.045);
      g.beginPath();
      g.moveTo(fx(t0), yb + H * 0.1);
      g.bezierCurveTo(fx(t0 - len * 0.4), yb + H * 0.1, fx(t0 - len * 0.7), yb - H * 0.02, fx(t0 - len), yb - H * 0.09);
      g.bezierCurveTo(fx(t0 - len * 0.6), yb - H * 0.01, fx(t0 - len * 0.45), yb - H * 0.1, fx(t0 - len * 0.2), yb - H * 0.13);
      g.bezierCurveTo(fx(t0 - len * 0.1), yb - H * 0.06, fx(t0), yb - H * 0.02, fx(t0), yb + H * 0.1);
      g.fillStyle = k % 2 ? c.secondary : c.accent; g.fill();
    }
  },
  // hazard chevrons
  bruno(g, W, H, fx, c) {
    for (let k = 0; k < 6; k++) {
      const t = 0.12 + k * 0.1;
      g.beginPath();
      g.moveTo(fx(t), yOf(H, 0.68)); g.lineTo(fx(t + 0.05), yOf(H, 0.46)); g.lineTo(fx(t), yOf(H, 0.28)); g.lineTo(fx(t + 0.035), yOf(H, 0.28)); g.lineTo(fx(t + 0.085), yOf(H, 0.46)); g.lineTo(fx(t + 0.035), yOf(H, 0.68));
      g.closePath(); g.fillStyle = k % 2 ? c.accent : c.secondary; g.fill();
    }
  },
  // lily-pad dots
  hopper(g, W, H, fx, c) {
    const pts = [[0.2, 0.62, 12], [0.3, 0.38, 9], [0.42, 0.62, 8], [0.56, 0.42, 13], [0.66, 0.64, 8], [0.78, 0.4, 10], [0.88, 0.58, 7], [0.1, 0.4, 7]];
    for (const [t, y, r] of pts) { g.beginPath(); g.arc(fx(t), yOf(H, y), r * (H / 256) * 1.5, 0, Math.PI * 2); g.fillStyle = c.secondary; g.fill(); g.beginPath(); g.arc(fx(t) + 2, yOf(H, y) + 2, r * (H / 256) * 0.6, 0, Math.PI * 2); g.fillStyle = c.accent; g.fill(); }
  },
  // moon + stars
  luna(g, W, H, fx, c) {
    const x = fx(0.78), y = yOf(H, 0.5), r = H * 0.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = c.accent; g.fill();
    g.beginPath(); g.arc(x + r * 0.42, y - r * 0.12, r * 0.86, 0, Math.PI * 2); g.globalCompositeOperation = 'destination-out'; g.fill(); g.globalCompositeOperation = 'source-over';
    g.fillStyle = c.secondary === c.primary ? '#fff' : '#e8fbff';
    for (const [t, yy, s] of [[0.18, 0.62, 9], [0.3, 0.38, 6], [0.44, 0.58, 7], [0.56, 0.4, 5]]) {
      g.save(); g.translate(fx(t), yOf(H, yy)); g.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? s * 0.45 : s; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * rr * (H / 256) * 1.4, Math.sin(a) * rr * (H / 256) * 1.4); }
      g.closePath(); g.fill(); g.restore();
    }
  },
  // checker band + circuit
  gizmo(g, W, H, fx, c) {
    const n = 14, h = H * 0.07;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const t0 = 0.08 + (i / n) * 0.62, t1 = 0.08 + ((i + 1) / n) * 0.62;
      g.fillStyle = (i + j) % 2 ? c.secondary : c.accent;
      const xa = fx(t0), xb = fx(t1);
      g.fillRect(Math.min(xa, xb), yOf(H, 0.5) + (j - 1) * h, Math.abs(xb - xa) + 0.5, h);
    }
    g.strokeStyle = c.accent; g.lineWidth = H * 0.018; g.lineCap = 'round'; g.beginPath();
    g.moveTo(fx(0.74), yOf(H, 0.34)); g.lineTo(fx(0.82), yOf(H, 0.34)); g.lineTo(fx(0.86), yOf(H, 0.46)); g.lineTo(fx(0.95), yOf(H, 0.46)); g.stroke();
    g.beginPath(); g.arc(fx(0.95), yOf(H, 0.46), H * 0.026, 0, Math.PI * 2); g.fillStyle = c.accent; g.fill();
  },
  // bold slanted stripes
  rocco(g, W, H, fx, c) {
    for (let k = 0; k < 4; k++) {
      const t = 0.1 + k * 0.1;
      g.beginPath();
      g.moveTo(fx(t), yOf(H, 0.7)); g.lineTo(fx(t + 0.045), yOf(H, 0.7)); g.lineTo(fx(t + 0.1), yOf(H, 0.26)); g.lineTo(fx(t + 0.055), yOf(H, 0.26)); g.closePath();
      g.fillStyle = k % 2 ? c.secondary : c.accent; g.fill();
    }
  },
  // lightning bolt
  quill(g, W, H, fx, c) {
    g.beginPath();
    g.moveTo(fx(0.9), yOf(H, 0.7)); g.lineTo(fx(0.64), yOf(H, 0.46)); g.lineTo(fx(0.74), yOf(H, 0.46)); g.lineTo(fx(0.56), yOf(H, 0.24)); g.lineTo(fx(0.86), yOf(H, 0.5)); g.lineTo(fx(0.76), yOf(H, 0.5)); g.closePath();
    g.fillStyle = c.accent; g.fill(); g.lineWidth = H * 0.02; g.strokeStyle = c.secondary; g.lineJoin = 'round'; g.stroke();
  },
};

function drawTop(g, x0, y0, W, H, driverId, c) {
  g.save();
  g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.translate(x0, y0);
  // twin racing stripes down the middle (x = 0 -> W/2)
  const cx = W / 2;
  g.fillStyle = c.secondary; g.fillRect(cx - W * 0.115, 0, W * 0.07, H); g.fillRect(cx + W * 0.045, 0, W * 0.07, H);
  g.fillStyle = c.accent; g.fillRect(cx - W * 0.012, 0, W * 0.024, H);
  // number on the bonnet area
  g.save(); g.translate(cx, H * 0.34); g.rotate(-Math.PI / 2);
  number(g, RACE_NUMBERS[driverId] ?? '1', 0, 0, W * 0.3, '#ffffff', c.primary);
  g.restore();
  g.restore();
}

function drawFlank(g, x0, y0, W, H, side, driverId, c) {
  g.save();
  g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.translate(x0, y0);
  const fx = flankCtx(side, W);
  // lower pinstripe along the whole flank
  g.fillStyle = c.accent; g.fillRect(0, yOf(H, 0.265), W, H * 0.016);
  (DESIGNS[driverId] ?? DESIGNS.pip)(g, W, H, fx, c);
  // number roundel on the pod
  const nx = fx(tOf(0.1)), ny = yOf(H, 0.5);
  roundel(g, nx, ny, H * 0.2, '#ffffff', c.accent);
  number(g, RACE_NUMBERS[driverId] ?? '1', nx, ny + H * 0.01, H * 0.25, c.primary, '#ffffff', '#10131c');
  g.restore();
}

/** @returns {HTMLCanvasElement} 1024x512 livery atlas */
export function createLiveryCanvas(driver, size = 1024) {
  const k = size / 1024;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size / 2;
  const g = cv.getContext('2d');
  g.scale(k, k);
  const c = { primary: driver.colors.primary, secondary: driver.colors.secondary, accent: driver.colors.accent };
  drawFlank(g, 0, 0, 512, 256, 'left', driver.id, c);
  drawFlank(g, 0, 256, 512, 256, 'right', driver.id, c);
  drawTop(g, 512, 0, 256, 512, driver.id, c);
  return cv;
}

const cache = new Map();
/** Shared decal texture per driver livery (+ resolution tier). */
export function getLiveryTexture(driver, size = 1024) {
  const key = `${driver.id}:${size}`;
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(createLiveryCanvas(driver, size));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.flipY = true;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    cache.set(key, t);
  }
  return t;
}
export function disposeLiveryCache() { for (const t of cache.values()) t.dispose(); cache.clear(); }
