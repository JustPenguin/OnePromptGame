// Camera-facing ribbon (trails, lightning bolts, comet tail).  Allocation-free after construction.
// Points are stored newest-first; rebuild(cameraPosition) turns them into a tapered strip with per-vertex RGBA.
import * as THREE from 'three';

let sharedMaterial = null;
/** One additive, vertex-coloured, unlit material shared by every ribbon (alpha comes from the vertex colour). */
export function ribbonMaterial() {
  return (sharedMaterial ??= new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
  }));
}
export function disposeRibbonMaterial() { sharedMaterial?.dispose(); sharedMaterial = null; }

export class Ribbon {
  /** @param {number} max number of points */
  constructor(max = 12, material = ribbonMaterial()) {
    this.max = max;
    this.count = 0;
    this.pts = new Float32Array(max * 3);
    const g = this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 2 * 4), 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage); this.colAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this._d = new THREE.Vector3(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._c0 = new THREE.Color(); this._c1 = new THREE.Color();
  }

  clear() { this.count = 0; this.geometry.setDrawRange(0, 0); }

  /** Add a new head point (oldest dropped when full). */
  push(x, y, z) {
    const p = this.pts;
    const n = Math.min(this.count, this.max - 1);
    p.copyWithin(3, 0, n * 3);
    p[0] = x; p[1] = y; p[2] = z;
    this.count = Math.min(this.count + 1, this.max);
  }

  /** Overwrite point i (used by lightning to jitter the same polyline each frame). */
  set(i, x, y, z) { const p = this.pts; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; if (i >= this.count) this.count = i + 1; }

  /**
   * @param {THREE.Vector3} camPos camera position (for facing)
   * @param {number} width ribbon width at the head (m)
   * @param {number|string} head colour at the head   @param {number|string} tail colour at the tail
   * @param {number} alpha overall alpha  @param {number} taper tail width fraction (0 = point)
   */
  rebuild(camPos, width, head, tail, alpha = 1, taper = 0) {
    const n = this.count;
    if (n < 2) { this.geometry.setDrawRange(0, 0); return; }
    const p = this.pts, pos = this.posAttr.array, col = this.colAttr.array;
    this._c0.set(head); this._c1.set(tail);
    const d = this._d, v = this._v, s = this._s;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      d.set(p[i0 * 3] - p[i1 * 3], p[i0 * 3 + 1] - p[i1 * 3 + 1], p[i0 * 3 + 2] - p[i1 * 3 + 2]);
      v.set(camPos.x - p[i * 3], camPos.y - p[i * 3 + 1], camPos.z - p[i * 3 + 2]);
      s.crossVectors(d, v);
      const l = s.length();
      if (l < 1e-6) s.set(0, 1, 0); else s.multiplyScalar(1 / l);
      const u = i / (n - 1);
      const w = width * 0.5 * (1 - u * (1 - taper));
      const k = i * 6;
      pos[k] = p[i * 3] + s.x * w; pos[k + 1] = p[i * 3 + 1] + s.y * w; pos[k + 2] = p[i * 3 + 2] + s.z * w;
      pos[k + 3] = p[i * 3] - s.x * w; pos[k + 4] = p[i * 3 + 1] - s.y * w; pos[k + 5] = p[i * 3 + 2] - s.z * w;
      const a = alpha * (1 - u) * (1 - u * 0.4);
      const r = this._c0.r + (this._c1.r - this._c0.r) * u, g = this._c0.g + (this._c1.g - this._c0.g) * u, b = this._c0.b + (this._c1.b - this._c0.b) * u;
      const c = i * 8;
      col[c] = r; col[c + 1] = g; col[c + 2] = b; col[c + 3] = a;
      col[c + 4] = r; col[c + 5] = g; col[c + 6] = b; col[c + 7] = a;
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * 6);
  }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); }
}
