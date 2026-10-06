// Ghosts: cute translucent sprites that drift in lazy loops and bob, plus a mist-sheet layer.   OWNER: Agent B.  Cosmetic only.
import * as THREE from 'three';
import { createBillboards } from './billboards.js';
import { toColor } from './geo.js';

function ghostCanvas() {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // soft outer glow
  const grd = g.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, H * 0.5);
  grd.addColorStop(0, 'rgba(190,255,220,0.55)'); grd.addColorStop(1, 'rgba(190,255,220,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // body: dome head, straight sides, wavy hem
  g.beginPath();
  g.moveTo(52, 190); g.lineTo(52, 108);
  g.bezierCurveTo(52, 36, 204, 36, 204, 108); g.lineTo(204, 190);
  for (let i = 0; i < 4; i++) { const x0 = 204 - i * 38, x1 = x0 - 38; g.quadraticCurveTo((x0 + x1) / 2, i % 2 ? 176 : 214, x1, 190); }
  g.closePath();
  const bg = g.createLinearGradient(0, 40, 0, 215);
  bg.addColorStop(0, 'rgba(255,255,255,0.96)'); bg.addColorStop(1, 'rgba(200,235,255,0.6)');
  g.fillStyle = bg; g.fill();
  g.strokeStyle = 'rgba(160,220,255,0.7)'; g.lineWidth = 4; g.stroke();
  // face
  g.fillStyle = '#10142a';
  g.beginPath(); g.ellipse(100, 112, 13, 19, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(156, 112, 13, 19, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(128, 152, 15, 21, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,150,170,0.55)';
  g.beginPath(); g.ellipse(78, 140, 11, 7, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(178, 140, 11, 7, 0, 0, 7); g.fill();
  return c;
}

/**
 * items = [{ x, y, z, r (orbit radius), size, speed, phase, bob, ax (orbit stretch) }]  -> ghosts circle (x, z) at height y.
 * Returns { mesh, update }.  Billboarded, normal alpha blending so they read as pale ghosts against dark forest.
 */
export function createGhosts(world, items, { intensity = 1.0, name = 'ghosts' } = {}) {
  const tex = world.tex(new THREE.CanvasTexture(ghostCanvas()));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = createBillboards(world, items.map((g) => ({ x: g.x, y: g.y, z: g.z, size: g.size ?? 3.2, color: '#ffffff', flicker: 0.0, pulse: 0 })), { name, map: tex, additive: false, intensity, fadeFar: 260, aspect: 1 });
  const m4 = new THREE.Matrix4();
  const upd = (dt, t) => {
    for (let i = 0; i < items.length; i++) {
      const g = items[i], a = t * (g.speed ?? 0.25) + (g.phase ?? 0);
      const s = g.size ?? 3.2;
      m4.makeScale(s, s, s).setPosition(g.x + Math.cos(a) * (g.r ?? 8) * (g.ax ?? 1), g.y + Math.sin(t * 1.3 + (g.phase ?? 0) * 3) * (g.bob ?? 0.6), g.z + Math.sin(a) * (g.r ?? 8));
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  upd(0, 0);
  return { mesh, update: upd };
}

/**
 * Drifting mist: a few large soft sheets lying just above the ground, all sharing one scrolling noise texture.
 * o = { sheets: [{x, z, y, size}], color:'#9ab0c8', opacity:0.22 }
 */
export function createMist(world, o) {
  const W = 256, c = document.createElement('canvas'); c.width = W; c.height = W;
  const g = c.getContext('2d'); const img = g.createImageData(W, W);
  const rnd = world.rand;
  // tileable value-noise fbm
  const lat = (p) => { const a = new Float32Array(p * p); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const L = [lat(4), lat(8), lat(16)];
  const val = (a, p, u, v) => { const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const sm = (t) => t * t * (3 - 2 * t); const x0 = ((xi % p) + p) % p, x1 = (x0 + 1) % p, y0 = ((yi % p) + p) % p, y1 = (y0 + 1) % p; const fx = sm(xf), fy = sm(yf); return (a[y0 * p + x0] * (1 - fx) + a[y0 * p + x1] * fx) * (1 - fy) + (a[y1 * p + x0] * (1 - fx) + a[y1 * p + x1] * fx) * fy; };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / W;
    const n = val(L[0], 4, u, v) * 0.55 + val(L[1], 8, u, v) * 0.3 + val(L[2], 16, u, v) * 0.15;
    const edge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v)) * 2;
    const a = Math.max(0, Math.min(1, (n - 0.35) * 2.2)) * Math.min(1, edge * 3.0);
    const k = (y * W + x) * 4; img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const tex = world.tex(new THREE.CanvasTexture(c));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pos = [], uv = [], idx = [];
  o.sheets.forEach((s, i) => {
    const h = s.size / 2, b = pos.length / 3;
    for (const [dx, dz, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) { pos.push(s.x + dx * h, s.y, s.z + dz * h); uv.push(u * (s.size / 110) + i * 0.37, v * (s.size / 110) + i * 0.21); }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: toColor(o.color ?? '#9ab0c8'), transparent: true, opacity: o.opacity ?? 0.22, depthWrite: false, fog: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'mist'; mesh.renderOrder = 5; mesh.matrixAutoUpdate = false;
  world.group.add(mesh);
  return { mesh, update(dt, t) { tex.offset.set(t * 0.006, t * 0.0035); } };
}
