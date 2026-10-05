// GeoBuilder: append quads / boxes / sweeps into plain arrays and emit ONE BufferGeometry (position, normal, color, uv).
// OWNER: Agent B.  Build-time only.  Used for barriers, fences, gantries, ramps, signs - anything that follows the track.
import * as THREE from 'three';

export class GeoBuilder {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.uv = []; this.idx = [];
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._n = new THREE.Vector3();
  }
  get vertexCount() { return this.p.length / 3; }

  /** One vertex. Returns its index. */
  vert(x, y, z, nx, ny, nz, r, g, b, u = 0, v = 0) {
    const i = this.p.length / 3;
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); this.uv.push(u, v);
    return i;
  }

  /** Flat-shaded quad a-b-c-d (counter-clockwise seen from the FRONT).  col = THREE.Color | [r,g,b]; uvs optional [u0,v0,u1,v1] (a,b,c,d order: a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1)). */
  quad(a, b, c, d, col, uvs = null, nOverride = null) {
    const n = nOverride ?? this._n.subVectors(b, a).cross(this._a.subVectors(d, a)).normalize();
    // if the quad is degenerate fall back to the other diagonal
    if (!isFinite(n.x) || n.lengthSq() < 0.5) n.set(0, 1, 0);
    const r = col.r ?? col[0], g = col.g ?? col[1], bl = col.b ?? col[2];
    const u0 = uvs ? uvs[0] : 0, v0 = uvs ? uvs[1] : 0, u1 = uvs ? uvs[2] : 1, v1 = uvs ? uvs[3] : 1;
    const i = this.vert(a.x, a.y, a.z, n.x, n.y, n.z, r, g, bl, u0, v0);
    this.vert(b.x, b.y, b.z, n.x, n.y, n.z, r, g, bl, u1, v0);
    this.vert(c.x, c.y, c.z, n.x, n.y, n.z, r, g, bl, u1, v1);
    this.vert(d.x, d.y, d.z, n.x, n.y, n.z, r, g, bl, u0, v1);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** Same as quad() but with per-vertex colours cols=[ca,cb,cc,cd]. */
  quadC(a, b, c, d, cols, uvs = null) {
    const n = this._n.subVectors(b, a).cross(this._a.subVectors(d, a)).normalize();
    const u0 = uvs ? uvs[0] : 0, v0 = uvs ? uvs[1] : 0, u1 = uvs ? uvs[2] : 1, v1 = uvs ? uvs[3] : 1;
    const q = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [d, u0, v1]];
    const i = this.p.length / 3;
    q.forEach(([p, u, v], k) => { const cc = cols[k]; this.vert(p.x, p.y, p.z, n.x, n.y, n.z, cc.r ?? cc[0], cc.g ?? cc[1], cc.b ?? cc[2], u, v); });
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  tri(a, b, c, col) {
    const n = this._n.subVectors(b, a).cross(this._a.subVectors(c, a)).normalize();
    const r = col.r ?? col[0], g = col.g ?? col[1], bl = col.b ?? col[2];
    const i = this.vert(a.x, a.y, a.z, n.x, n.y, n.z, r, g, bl);
    this.vert(b.x, b.y, b.z, n.x, n.y, n.z, r, g, bl);
    this.vert(c.x, c.y, c.z, n.x, n.y, n.z, r, g, bl);
    this.idx.push(i, i + 1, i + 2);
  }

  /**
   * Oriented box. centre (x,y,z) = base centre when `base` is true (else geometric centre); axes ex (right), ey (up), ez (forward)
   * are unit THREE.Vector3; half-extents sx, sy, sz are FULL sizes along each axis.  cols: colour or {top, side, bottom}.
   */
  box(cx, cy, cz, ex, ey, ez, sx, sy, sz, cols, base = true) {
    const top = cols.top ?? cols, side = cols.side ?? cols, bot = cols.bottom ?? side;
    const hx = sx / 2, hz = sz / 2, y0 = base ? 0 : -sy / 2, y1 = y0 + sy;
    const P = (x, y, z) => new THREE.Vector3(cx + ex.x * x + ey.x * y + ez.x * z, cy + ex.y * x + ey.y * y + ez.y * z, cz + ex.z * x + ey.z * y + ez.z * z);
    const v000 = P(-hx, y0, -hz), v100 = P(hx, y0, -hz), v110 = P(hx, y1, -hz), v010 = P(-hx, y1, -hz);
    const v001 = P(-hx, y0, hz), v101 = P(hx, y0, hz), v111 = P(hx, y1, hz), v011 = P(-hx, y1, hz);
    this.quad(v010, v110, v111, v011, top);          // top (+y)
    this.quad(v000, v001, v101, v100, bot);          // bottom
    this.quad(v001, v011, v111, v101, side);         // +z
    this.quad(v100, v110, v010, v000, side);         // -z
    this.quad(v101, v111, v110, v100, side);         // +x
    this.quad(v000, v010, v011, v001, side);         // -x
  }

  /** Vertical quad "billboard" board facing +ez: a flat textured panel (centre bottom at cx,cy,cz). */
  panel(cx, cy, cz, ex, ey, ez, w, h, col, uvs = [0, 0, 1, 1]) {
    const hw = w / 2;
    const a = new THREE.Vector3(cx - ex.x * hw, cy - ex.y * hw, cz - ex.z * hw);
    const b = new THREE.Vector3(cx + ex.x * hw, cy + ex.y * hw, cz + ex.z * hw);
    const c = b.clone().addScaledVector(ey, h), d = a.clone().addScaledVector(ey, h);
    this.quad(a, b, c, d, col, uvs);
  }

  build({ uv = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
