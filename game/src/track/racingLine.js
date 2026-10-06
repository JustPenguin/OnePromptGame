// Racing line + corner speed model for the AI.  OWNER: Agent B.
//
// Produces `track.racingLine = { offset[], maxSpeed[], curv[], minSpeed[] }` (per centreline sample) and fills `track.curvature`:
//   offset[i]    lateral metres from the centreline the ideal line runs at (+ = right)
//   maxSpeed[i]  corner-limited speed in m/s, already brake-limited (a kart at maxSpeed[i] can still slow down in time for what follows)
//   curv[i]      signed curvature of the LINE itself (rad/m, + = left)   - additive, optional for consumers
//   minSpeed[i]  speed the kart SHOULD carry here (>0 only just before ramps/gaps: below it a jump falls short)   - additive
//   track.curvature[i]  signed curvature of the CENTRELINE, smoothed over ~30 m (the original contract; used for drift decisions)
//
// How the line is found:  minimise the sum of squared second differences of the path (= minimum curvature, the classic racing line:
// wide entry, late apex, wide exit) over the lateral offsets, subject to  |offset| <= halfWidth - margin.  The problem is quadratic and
// banded, so projected Gauss-Seidel / SOR sweeps converge in ~a few hundred passes (a few ms per 1000 samples).
import { clamp, wrapAngle } from '../core/math.js';

const MARGIN = 2.7;        // keep the kart centre this far inside the road edge (kart radius 1.15 + curb + cushion)
const A_LAT = 25;          // m/s^2 sustainable lateral acceleration used for the speed profile (the arcade physics is generous; the AI is the limit)
const A_BRAKE = 19;        // m/s^2 the speed profile assumes the AI can shed speed with (it brakes harder than this when it must)
const A_ACCEL = 9;         // m/s^2 average acceleration out of corners (forward pass)
const V_TOP = 60;

export function buildRacingLine(track) {
  const N = track.count, sp = track.spacing;
  // ---- centreline curvature (for AI drift decisions + the original contract) -------------------------------------------------------------
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = track.yawArr[(i - 2 + N) % N], b = track.yawArr[(i + 2) % N];
    curv[i] = wrapAngle(b - a) / (4 * sp); // rad/m, + = turning left
  }
  const sm = track.curvature;
  const win = 8;
  for (let i = 0; i < N; i++) { let a = 0; for (let k = -win; k <= win; k++) a += curv[(i + k + N) % N]; sm[i] = a / (2 * win + 1); }

  // ---- bounds ----------------------------------------------------------------------------------------------------------------------------------
  const lim = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const open = track.wallL[i] === 0 || track.wallR[i] === 0;
    lim[i] = Math.max(0.6, track.hw[i] - (open ? 2.0 : MARGIN));      // on wall-less roads stay a little further from the void
  }
  // road width 'pinches' (bridges) get an extra-gentle bound so the line is a plain centreline there
  // ---- minimum curvature line ----------------------------------------------------------------------------------------------------------------------
  // E(o) = sum_i |d2c_i + R_{i-1} o_{i-1} - 2 R_i o_i + R_{i+1} o_{i+1}|^2  is quadratic in the lateral offsets o => a SPD pentadiagonal system.
  // The loop is unrolled to 3 laps (middle lap is used) and solved exactly with a banded Cholesky; the road-edge bounds are enforced with an
  // active-set loop (variables that violate a bound are pinned to it; pinned variables whose gradient points inward are released).
  const px = new Float64Array(N), pz = new Float64Array(N), rx = new Float64Array(N), rz = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = track.pos[i * 3]; pz[i] = track.pos[i * 3 + 2];
    const x = track.right[i * 3], z = track.right[i * 3 + 2], l = Math.hypot(x, z) || 1;
    rx[i] = x / l; rz[i] = z / l;
  }
  const off = solveMinCurvature(N, px, pz, rx, rz, lim);
  // gentle final smoothing (removes solver artefacts; keeps bounds)
  const tmp = new Float64Array(N);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) tmp[i] = 0.25 * off[(i - 1 + N) % N] + 0.5 * off[i] + 0.25 * off[(i + 1) % N];
    for (let i = 0; i < N; i++) off[i] = clamp(tmp[i], -lim[i], lim[i]);
  }
  // attractors: take jumps straight, and run over boost pads.  Each zone pulls the line to the zone's lateral centre: ease in over `lead`
  // metres, hold through the zone, ease out over `tail` (jumps need a longer approach than pads).
  const L = track.length;
  const sdist = (s, s0) => { let d = s - s0; if (d < -L / 2) d += L; else if (d > L / 2) d -= L; return d; };
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  for (const z of track.zones) {
    const jump = z.type === 'ramp' || z.type === 'gap';
    if (!jump && z.type !== 'boost') continue;
    const lead = jump ? 38 : 34, tail = jump ? 24 : 10;
    const target = jump ? 0 : (z.l0 + z.l1) / 2;
    for (let i = 0; i < N; i++) {
      const s = i * sp, d0 = sdist(s, z.s0), d1 = sdist(s, z.s1);
      let w = 0;
      if (d0 >= -lead && d1 <= tail) w = d0 < 0 ? sstep(1 + d0 / lead) : d1 > 0 ? sstep(1 - d1 / tail) : 1;
      if (w > 0) off[i] = clamp(off[i] * (1 - w) + target * w, -lim[i], lim[i]);
    }
  }
  const offset = new Float32Array(N);
  const sc = globalThis.__RL_SCALE ?? 1;                    // experiment hook: scale the line's deviation from the centreline
  for (let i = 0; i < N; i++) offset[i] = off[i] * sc;

  // ---- line curvature (Menger, from the actual line positions) ------------------------------------------------------------------------------------
  const lx = new Float64Array(N), lz = new Float64Array(N);
  for (let i = 0; i < N; i++) { lx[i] = px[i] + rx[i] * off[i]; lz[i] = pz[i] + rz[i] * off[i]; }
  const lineCurv = new Float32Array(N);
  const K = 2; // 4 m baseline: stable against sample noise, short enough to see tight apexes
  for (let i = 0; i < N; i++) {
    const a = (i - K + N) % N, b = (i + K) % N;
    const ax = lx[i] - lx[a], az = lz[i] - lz[a], bx = lx[b] - lx[i], bz = lz[b] - lz[i];
    const cross = ax * bz - az * bx;                         // + = left turn (x right-handed, z forward: matches yaw increasing to the left)
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(lx[b] - lx[a], lz[b] - lz[a]);
    lineCurv[i] = (2 * cross) / Math.max(1e-6, la * lb * lc) * -1;
  }
  // smooth ~10 m so a single noisy sample never forces a brake spike
  const lc2 = new Float32Array(N);
  for (let i = 0; i < N; i++) { let a = 0; for (let k = -3; k <= 3; k++) a += lineCurv[(i + k + N) % N]; lc2[i] = a / 7; }

  // ---- speed profile ------------------------------------------------------------------------------------------------------------------------------------
  const maxSpeed = new Float32Array(N);
  for (let i = 0; i < N; i++) maxSpeed[i] = Math.min(V_TOP, Math.sqrt(A_LAT / Math.max(Math.abs(lc2[i]), 1e-4)));
  // surfaces that are not tarmac: scale the budget (ice is slippery: take it slower)
  for (const z of track.zones) {
    if (z.type !== 'ice') continue;
    for (let i = 0; i < N; i++) { const s = i * sp; if (s >= z.s0 - 6 && s <= z.s1) maxSpeed[i] = Math.min(maxSpeed[i], 30); }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = N * 2 - 1; i >= 0; i--) {                 // braking: never faster than you can still shed before the next slow point
      const a = i % N, b = (i + 1) % N;
      maxSpeed[a] = Math.min(maxSpeed[a], Math.sqrt(maxSpeed[b] * maxSpeed[b] + 2 * A_BRAKE * sp));
    }
    // (no forward/acceleration pass: maxSpeed is a CAP the AI may exceed-by-nothing, not a prediction - the kart's own acceleration governs)
  }

  // ---- jump safety: speed a kart needs at the lip to clear a gap (KartPhysics: vy follows the ramp slope, g = 32 m/s^2) -----------------------------
  const minSpeed = new Float32Array(N);
  for (const g of track.gaps) {
    const ramp = track.ramps.find((r) => Math.abs(r.s1 - g.s0) < 6) ?? null;       // the ramp that launches into this gap
    const need = ramp ? requiredJumpSpeed(ramp.height, ramp.s1 - ramp.s0, g.s1 - g.s0) : 20;
    g.minSpeed = need;
    if (ramp) ramp.minSpeed = need;
    const start = ramp ? ramp.s0 : g.s0;
    for (let i = 0; i < N; i++) {
      const d = sdist(i * sp, start);
      if (d >= -70 && d <= g.s1 - start) { minSpeed[i] = Math.max(minSpeed[i], need * 1.12); maxSpeed[i] = Math.max(maxSpeed[i], need * 1.12); }
    }
  }
  return { offset, maxSpeed, curv: lc2, minSpeed };
}

/** Minimum speed (m/s) at which a kart clears `gapLen` after a ramp of `height` over `rampLen` (matches KartPhysics: launch vy = v * slope, g = 32). */
export function requiredJumpSpeed(height, rampLen, gapLen, g = 32) {
  const slope = height / Math.max(1, rampLen);
  for (let v = 12; v < 60; v += 0.25) {
    const vy = v * slope;
    const t = (vy + Math.sqrt(vy * vy + 2 * g * height)) / g;   // fall back to the far road, which sits at the ramp's BASE height
    if (v * t >= gapLen + 1.5) return v;
  }
  return 60;
}

/**
 * Minimum-curvature lateral offsets for a closed loop; returns Float64Array(N) with |o_i| <= lim_i.
 * Residual i = R_i . (P_{i-1} - 2 P_i + P_{i+1}) with P = C + R o: only the component ALONG THE NORMAL counts (that is the curvature; the
 * tangential part of the second difference just reflects uneven spacing and would reward collapsing the path onto the inside).
 *   rho_i = u_i + a_i o_{i-1} - 2 o_i + b_i o_{i+1},   u_i = R_i . d2c_i,  a_i = R_i . R_{i-1},  b_i = R_i . R_{i+1}
 */
function solveMinCurvature(N, px, pz, rx, rz, lim) {
  const LAPS = 3, M = N * LAPS, REG = 2e-6;
  const wrap = (j) => ((j % N) + N) % N;
  const ua = new Float64Array(M), aa = new Float64Array(M), bb = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    const c = wrap(i), p = wrap(i - 1), n = wrap(i + 1);
    ua[i] = rx[c] * (px[p] - 2 * px[c] + px[n]) + rz[c] * (pz[p] - 2 * pz[c] + pz[n]);
    aa[i] = rx[c] * rx[p] + rz[c] * rz[p];
    bb[i] = rx[c] * rx[n] + rz[c] * rz[n];
  }
  const d0 = new Float64Array(M), d1 = new Float64Array(M), d2 = new Float64Array(M), b = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const bm = j >= 1 ? bb[j - 1] : 0, ap = j + 1 < M ? aa[j + 1] : 0;        // coefficients of o_j in residuals j-1 and j+1 (absent at the chain ends)
    d0[j] = bm * bm + 4 + ap * ap + REG;
    if (j + 1 < M) d1[j] = -2 * bb[j] - 2 * aa[j + 1];
    if (j + 2 < M) d2[j] = aa[j + 1] * bb[j + 1];
    b[j] = -((j >= 1 ? bm * ua[j - 1] : 0) - 2 * ua[j] + (j + 1 < M ? ap * ua[j + 1] : 0));
  }
  // interior variables of the end laps lose some residuals (the ends are free); fine, only the middle lap is used
  const lower = new Float64Array(M), upper = new Float64Array(M);
  for (let j = 0; j < M; j++) { lower[j] = -lim[wrap(j)]; upper[j] = lim[wrap(j)]; }
  const state = new Int8Array(M);                        // 0 free, +1 pinned at upper, -1 pinned at lower
  let o = new Float64Array(M);
  const L0 = new Float64Array(M), L1 = new Float64Array(M), L2 = new Float64Array(M), y = new Float64Array(M);
  const e0 = new Float64Array(M), e1 = new Float64Array(M), e2 = new Float64Array(M), rb = new Float64Array(M);
  for (let iter = 0; iter < 60; iter++) {
    // assemble with pinned variables eliminated
    e0.set(d0); e1.set(d1); e2.set(d2); rb.set(b);
    for (let j = 0; j < M; j++) {
      if (!state[j]) continue;
      const v = state[j] > 0 ? upper[j] : lower[j];
      // move column j to the right-hand side of its neighbours, then make row/col j the identity
      if (j >= 2) { rb[j - 2] -= d2[j - 2] * v; e2[j - 2] = 0; }
      if (j >= 1) { rb[j - 1] -= d1[j - 1] * v; e1[j - 1] = 0; }
      if (j + 1 < M) { rb[j + 1] -= d1[j] * v; }
      if (j + 2 < M) { rb[j + 2] -= d2[j] * v; }
    }
    for (let j = 0; j < M; j++) {
      if (!state[j]) continue;
      const v = state[j] > 0 ? upper[j] : lower[j];
      e0[j] = 1; rb[j] = v; e1[j] = 0; e2[j] = 0;
      if (j >= 1) e1[j - 1] = 0;
      if (j >= 2) e2[j - 2] = 0;
    }
    // banded Cholesky A = L L^T
    for (let j = 0; j < M; j++) {
      const l2 = j >= 2 ? e2[j - 2] / L0[j - 2] : 0;
      const l1 = j >= 1 ? ((e1[j - 1]) - l2 * (j >= 2 ? L1[j - 1] : 0)) / L0[j - 1] : 0;
      L2[j] = l2; L1[j] = l1;
      L0[j] = Math.sqrt(Math.max(1e-9, e0[j] - l1 * l1 - l2 * l2));
    }
    for (let j = 0; j < M; j++) y[j] = (rb[j] - (j >= 1 ? L1[j] * y[j - 1] : 0) - (j >= 2 ? L2[j] * y[j - 2] : 0)) / L0[j];
    for (let j = M - 1; j >= 0; j--) o[j] = (y[j] - (j + 1 < M ? L1[j + 1] * o[j + 1] : 0) - (j + 2 < M ? L2[j + 2] * o[j + 2] : 0)) / L0[j];
    // active set update
    let changed = 0;
    for (let j = 0; j < M; j++) {
      if (!state[j]) {
        if (o[j] > upper[j]) { state[j] = 1; changed++; } else if (o[j] < lower[j]) { state[j] = -1; changed++; }
      } else {
        // gradient of the unconstrained objective at the current point: g = A o - b  (pinned variable wants to move inward if it points the wrong way)
        let g = d0[j] * o[j] - b[j];
        if (j >= 1) g += d1[j - 1] * o[j - 1];
        if (j >= 2) g += d2[j - 2] * o[j - 2];
        if (j + 1 < M) g += d1[j] * o[j + 1];
        if (j + 2 < M) g += d2[j] * o[j + 2];
        if ((state[j] > 0 && g > 2e-3) || (state[j] < 0 && g < -2e-3)) { state[j] = 0; changed++; }      // hysteresis: only release when clearly wanted
      }
    }
    if (globalThis.__RL_DEBUG) console.log('iter', iter, 'changed', changed, 'max|o|', o.reduce((a, v) => Math.max(a, Math.abs(v)), 0).toFixed(2), 'pinned', state.reduce((a, v) => a + (v ? 1 : 0), 0));
    if (changed < Math.max(3, M / 600)) break;
  }
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = clamp(o[N + i], -lim[i], lim[i]);
  return out;
}
