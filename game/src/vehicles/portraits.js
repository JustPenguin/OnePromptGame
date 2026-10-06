// Driver / kart portraits for menus, select screens and results. OWNER: Agent C (visuals).
//   getDriverPortrait(driverId, size = 128, opts?) -> HTMLCanvasElement  (cached; head-and-shoulders render of the real 3D driver)
//   getKartPortrait(driverId, bodyId, size = 192, opts?) -> HTMLCanvasElement  (cached; whole kart, 3/4 view)
// Both return a transparent-background canvas immediately (a coloured-disc fallback until/unless the 3D render is possible) and
// repaint the SAME canvas element in place, so UI that already inserted it keeps working.
//   opts: { az, el, expression: 'open'|'happy'|'wow'|'determined'|'sad', background: css colour | null, supersample = 2, paint: custom paint colour }
import * as THREE from 'three';
import { getDriver } from '../data/roster.js';
import { getSharedRenderer, getSharedEnvironment } from '../render/shared.js';
import { createKartShowcase } from './KartVisuals.js';
import { FACE } from './faces.js';

const cache = new Map();
let studio = null;

function getStudio() {
  if (studio) return studio;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x5a5f78, 0.85));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.6); key.position.set(3, 4.5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc6ff, 1.7); rim.position.set(-4, 2.5, -3.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd8c0, 0.65); fill.position.set(-3.5, 0.6, 3); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  studio = { scene, camera };
  return studio;
}

function fallback(canvas, d, size) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, size, size);
  const grad = g.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size / 2, size / 2, size * 0.55);
  grad.addColorStop(0, d.colors.secondary); grad.addColorStop(1, d.colors.primary);
  g.fillStyle = grad; g.beginPath(); g.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0f24'; g.font = `${size * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(d.name[0], size / 2, size / 2 + size * 0.03);
}

const EXPR = { open: FACE.OPEN, happy: FACE.HAPPY, wow: FACE.WOW, determined: FACE.DETERMINED, sad: FACE.SAD, ouch: FACE.OUCH };

/** Render a showcase to RGBA pixels (bottom-to-top). kind: 'head' | 'kart'. */
function renderPixels(driverId, bodyId, kind, px, opts) {
  const R = getSharedRenderer();
  if (!R || R.contextLost || !R.renderToPixels || !getSharedEnvironment()) return null;
  const { scene, camera } = getStudio();
  const show = createKartShowcase(driverId, bodyId, { pose: 'idle', quality: 'high', paint: opts.paint });
  const vis = show.visual;
  vis.s.blinkT = 999; vis.s.blinkLeft = 0;
  if (opts.expression && EXPR[opts.expression] !== undefined) vis.react(EXPR[opts.expression], 99);
  scene.add(show.root);
  for (let i = 0; i < 12; i++) show.update(1 / 60);
  show.flush();
  const az = ((opts.az ?? (kind === 'head' ? 24 : 36)) * Math.PI) / 180, el = ((opts.el ?? (kind === 'head' ? 6 : 17)) * Math.PI) / 180;
  const hc = vis.assets.drv.head.center, hr = vis.assets.drv.head.radii;
  let focus, dist, fov;
  if (kind === 'head') { focus = new THREE.Vector3(hc[0], hc[1] - 0.03, hc[2]); fov = 26; dist = (Math.max(hr[0], hr[1]) * 2.0) / Math.tan((fov * Math.PI) / 360); }
  else { focus = new THREE.Vector3(0, 0.88, 0.05); fov = 30; dist = 7.6; }
  camera.fov = fov; camera.aspect = 1; camera.updateProjectionMatrix();
  camera.position.set(focus.x + Math.sin(az) * Math.cos(el) * dist, focus.y + Math.sin(el) * dist, focus.z + Math.cos(az) * Math.cos(el) * dist);
  camera.lookAt(focus);
  camera.updateMatrixWorld();
  scene.environment = getSharedEnvironment(); scene.environmentIntensity = 0.5;
  const pixels = R.renderToPixels(scene, camera, px, px, { exposure: 1, samples: 4, clearAlpha: 0 });
  scene.remove(show.root);
  show.dispose();
  return pixels;
}

function paint(canvas, pixels, px, size, background) {
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = px;
  const tg = tmp.getContext('2d');
  const img = tg.createImageData(px, px);
  // flip rows (GL readback is bottom-to-top)
  for (let y = 0; y < px; y++) img.data.set(pixels.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
  tg.putImageData(img, 0, 0);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, size, size);
  if (background) { g.fillStyle = background; g.fillRect(0, 0, size, size); }
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(tmp, 0, 0, size, size);
}

function make(key, driverId, bodyId, kind, size, opts) {
  let c = cache.get(key);
  if (c) return c.canvas;
  const d = getDriver(driverId);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.dataset.portrait = key;
  fallback(canvas, d, size);
  c = { canvas, done: false, args: [driverId, bodyId, kind, size, opts] };
  cache.set(key, c);
  const px = Math.round(size * (opts.supersample ?? 2));
  let pixels = null;
  try { pixels = renderPixels(driverId, bodyId, kind, px, opts); } catch (e) { console.warn('[portraits] 3D render failed', e); }
  if (pixels) { paint(canvas, pixels, px, size, opts.background ?? null); c.done = true; }
  else c.retry = true;
  return canvas;
}

/** Re-render any portraits that could not be rendered earlier (e.g. renderer not ready yet). Cheap to call repeatedly. */
export function refreshPortraits() {
  for (const [key, c] of cache) {
    if (c.done || !c.retry) continue;
    const [driverId, bodyId, kind, size, opts] = c.args;
    const px = Math.round(size * (opts.supersample ?? 2));
    try {
      const pixels = renderPixels(driverId, bodyId, kind, px, opts);
      if (pixels) { paint(c.canvas, pixels, px, size, opts.background ?? null); c.done = true; c.retry = false; }
    } catch { /* keep the fallback */ }
  }
}

export function getDriverPortrait(driverId, size = 128, opts = {}) {
  const extra = Object.keys(opts).length ? `|${JSON.stringify(opts)}` : '';
  return make(`head|${driverId}|classic|${size}${extra}`, driverId, 'classic', 'head', size, opts);
}

export function getKartPortrait(driverId, bodyId = 'classic', size = 192, opts = {}) {
  const extra = Object.keys(opts).length ? `|${JSON.stringify(opts)}` : '';
  return make(`kart|${driverId}|${bodyId}|${size}${extra}`, driverId, bodyId, 'kart', size, opts);
}

export function disposePortraits() { cache.clear(); studio = null; }
