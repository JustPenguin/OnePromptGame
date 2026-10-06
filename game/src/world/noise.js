// Seeded 2D/3D gradient noise + fbm helpers.  OWNER: Agent B.  Pure maths (no DOM) so it also runs in Node tools.
import { mulberry32 } from '../core/math.js';

/** Deterministic integer hash -> [0,1). Good enough for scatter jitter / cell randomness. */
export function hash2(ix, iz, seed = 0) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createNoise(seed = 1) {
  const rand = mulberry32(seed * 7919 + 17);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  // 12 gradient directions for 2D (angles) and 3D classic set
  const G2 = new Float32Array(32);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; G2[i * 2] = Math.cos(a); G2[i * 2 + 1] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  /** Gradient noise in [-1, 1]. */
  function n2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const X = xi & 255, Z = zi & 255;
    const g = (hx, hz, dx, dz) => { const k = (perm[perm[X + hx] + Z + hz] & 15) * 2; return G2[k] * dx + G2[k + 1] * dz; };
    const u = fade(xf), v = fade(zf);
    const a = g(0, 0, xf, zf), b = g(1, 0, xf - 1, zf), c = g(0, 1, xf, zf - 1), d = g(1, 1, xf - 1, zf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
  }

  /** Fractal sum, roughly in [-1, 1]. */
  function fbm(x, z, oct = 4, lac = 2, gain = 0.5) {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += n2(x * f, z * f) * amp; norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  /** Ridged multifractal in [0, 1] (sharp crests: mountains, canyon rims). */
  function ridge(x, z, oct = 4, lac = 2, gain = 0.5) {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(n2(x * f, z * f)); sum += n * n * amp; norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  /** Cellular-ish bumps in [0,1] (rock fields, dunes) - cheap value-noise worley approximation. */
  function cells(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    let d = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i + hash2(xi + i, zi + j, seed), cz = zi + j + hash2(xi + i, zi + j, seed + 91);
      const dd = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (dd < d) d = dd;
    }
    return Math.min(1, Math.sqrt(d));
  }
  return { n2, fbm, ridge, cells, seed, rand };
}

/** Periodic (tileable) value noise on a lattice of `period` cells, returns [0,1].  For texture generation. */
export function makeTileNoise(seed = 1) {
  const cache = new Map();
  const lattice = (period) => {
    let a = cache.get(period);
    if (!a) {
      const r = mulberry32(seed * 131 + period);
      a = new Float32Array(period * period);
      for (let i = 0; i < a.length; i++) a[i] = r();
      cache.set(period, a);
    }
    return a;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  /** u,v in [0,1) tile space. */
  function value(u, v, period) {
    const a = lattice(period);
    const x = u * period, y = v * period;
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period, y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
    const v00 = a[y0 * period + x0], v10 = a[y0 * period + x1], v01 = a[y1 * period + x0], v11 = a[y1 * period + x1];
    return v00 + (v10 - v00) * xf + (v01 - v00) * yf + (v00 - v10 - v01 + v11) * xf * yf;
  }
  function fbm(u, v, basePeriod = 4, oct = 4, gain = 0.5) {
    let amp = 1, sum = 0, norm = 0, per = basePeriod;
    for (let i = 0; i < oct; i++) { sum += value(u, v, per) * amp; norm += amp; amp *= gain; per *= 2; }
    return sum / norm;
  }
  return { value, fbm };
}
