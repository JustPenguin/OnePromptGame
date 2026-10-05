// Layout compiler: a circuit is drawn as a closed polygon of waypoints, each with a corner radius ("fillet"), and compiled
// into the control points SplineTrack wants.  OWNER: Agent B.
//
// Why: raw spline control points are hard to reason about (radii, straights, hairpins).  Here every corner is an exact
// circular arc tangent to its two neighbouring straights, so "R 90 sweeper", "R 22 hairpin" and "280 m straight" are literal.
// Closure is automatic (it is a closed polygon).  Pure maths: also runs in Node (src/tracks/tools/preview.mjs).
//
// layout = {
//   width: 18,                                   default road width (m)
//   start: { at: 'vId', offset: 60 },            the start/finish line sits `offset` metres after corner `vId`
//   y0 (optional),
//   v: [                                         waypoints in driving order; map axes: x right, z down (+Z = initial "south")
//     { id:'a', x: 300, z: 260, r: 110, y: 0, w: 20, bank: 5, sh: 6 },
//     ...
//   ],
// }
//   r      corner radius (m). r = 0 makes the waypoint a pass-through key (no corner; use it to pin height/width on a straight)
//   y      road height keyed at the apex of this waypoint (smooth monotone interpolation between keys)
//   w      road width keyed at the apex;   sh = shoulder width keyed at the apex
//   bank   peak bank in degrees leaning INTO the turn (auto sign), eased in/out along the arc
// Returns { points: [[x,y,z,width,bankDeg,shoulder]], markers, length, warnings }.
//   markers[id]        = the corner arc;   markers[id + '>'] = the straight leaving that corner.
import { DEG, TAU } from '../core/math.js';

const MAX_ARC_STEP = 7 * DEG;   // sampling resolution on arcs
const MAX_ARC_LEN = 20;         // ... and in metres
const MAX_STRAIGHT_STEP = 24;   // sampling resolution on straights (keeps Catmull-Rom from bulging out of a straight)

const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const round = (v, d = 2) => { const p = 10 ** d; return Math.round(v * p) / p; };

/** Periodic monotone-cubic (PCHIP) profile through keys [[s, v], ...] on a loop of length L. Returns f(s). */
export function periodicProfile(keys, L) {
  const ks = keys.slice().sort((a, b) => a[0] - b[0]);
  const K = [];
  for (const k of ks) { if (!K.length || k[0] - K[K.length - 1][0] > 1e-2) K.push([k[0], k[1]]); }
  const n = K.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => K[0][1];
  const S = (i) => K[((i % n) + n) % n][0] + Math.floor(i / n) * L;
  const V = (i) => K[((i % n) + n) % n][1];
  const m = new Float64Array(n); // slopes
  for (let i = 0; i < n; i++) {
    const h0 = S(i) - S(i - 1), h1 = S(i + 1) - S(i);
    const d0 = (V(i) - V(i - 1)) / h0, d1 = (V(i + 1) - V(i)) / h1;
    if (d0 * d1 <= 0) m[i] = 0;
    else { const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d0 + w2 / d1); }
  }
  return (s) => {
    s = ((s % L) + L) % L;
    let lo = -1, hi = n - 1;
    if (s >= S(0)) { lo = 0; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S(mid) <= s) lo = mid; else hi = mid - 1; } }
    const i0 = lo, i1 = lo + 1;
    const a = S(i0), h = S(i1) - a, t = (s - a) / h;
    const t2 = t * t, t3 = t2 * t;
    const mi0 = m[((i0 % n) + n) % n], mi1 = m[((i1 % n) + n) % n];
    return (2 * t3 - 3 * t2 + 1) * V(i0) + (t3 - 2 * t2 + t) * h * mi0 + (-2 * t3 + 3 * t2) * V(i1) + (t3 - t2) * h * mi1;
  };
}

export function compileLayout(spec) {
  const warnings = [];
  const V = spec.v.map((p, i) => ({ r: 0, ...p, id: p.id ?? `v${i}` }));
  const n = V.length;
  const defW = spec.width ?? 16;

  // ---- edges + fillets ----------------------------------------------------------------------------------------
  const edge = V.map((p, i) => {
    const q = V[(i + 1) % n];
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    return { len, dx: dx / len, dz: dz / len, yaw: Math.atan2(dx, dz) };
  });
  V.forEach((p, i) => {
    const e0 = edge[(i - 1 + n) % n], e1 = edge[i];
    p.turn = wrap(e1.yaw - e0.yaw);              // + = left
    p.hasArc = p.r > 0 && Math.abs(p.turn) > 0.5 * DEG;
    p.t = p.hasArc ? p.r * Math.tan(Math.abs(p.turn) / 2) : 0;
  });
  // shrink radii where two fillets would overlap on a shared straight
  for (let pass = 0; pass < 4; pass++) {
    V.forEach((p, i) => {
      const q = V[(i + 1) % n], D = edge[i].len;
      if (p.t + q.t > D - 1) {
        const k = (D - 1) / (p.t + q.t);
        if (pass === 0) warnings.push(`corners ${p.id}/${q.id}: radii shrunk x${k.toFixed(2)} to fit the ${D.toFixed(0)} m between them`);
        for (const c of [p, q]) if (c.hasArc) { c.t *= k; c.r *= k; }
      }
    });
  }

  // ---- primitives, in driving order starting at the first waypoint's arc ----------------------------------------
  // each: { kind:'arc'|'line', s0, s1, x0,z0,yaw0 (start), r, turn }
  const prims = [];
  let s = 0;
  const addLine = (x0, z0, yaw, len, tag) => { if (len > 1e-3) { prims.push({ kind: 'line', s0: s, s1: s + len, x0, z0, yaw0: yaw, tag }); s += len; } };
  V.forEach((p, i) => {
    const e0 = edge[(i - 1 + n) % n], e1 = edge[i];
    if (p.hasArc) {
      const x0 = p.x - e0.dx * p.t, z0 = p.z - e0.dz * p.t;
      const arcLen = p.r * Math.abs(p.turn);
      p.arc = { s0: s, s1: s + arcLen, x0, z0 };
      prims.push({ kind: 'arc', s0: s, s1: s + arcLen, x0, z0, yaw0: e0.yaw, r: p.r, turn: p.turn, id: p.id });
      s += arcLen;
    } else p.arc = { s0: s, s1: s, x0: p.x, z0: p.z };
    const next = V[(i + 1) % n];
    const ox = p.x + e1.dx * p.t, oz = p.z + e1.dz * p.t;
    const lineLen = e1.len - p.t - next.t;
    p.lineOut = { s0: s, s1: s + lineLen };
    addLine(ox, oz, e1.yaw, lineLen, p.id + '>');
  });
  const L = s;

  const at = (S) => {
    S = ((S % L) + L) % L;
    // binary search over prims
    let lo = 0, hi = prims.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prims[mid].s0 <= S) lo = mid; else hi = mid - 1; }
    const p = prims[lo], d = S - p.s0;
    if (p.kind === 'line') return { x: p.x0 + Math.sin(p.yaw0) * d, z: p.z0 + Math.cos(p.yaw0) * d, yaw: p.yaw0 };
    const a = (d / p.r) * Math.sign(p.turn), aa = Math.abs(a), sg = Math.sign(p.turn);
    const fx = Math.sin(p.yaw0), fz = Math.cos(p.yaw0), lx = Math.cos(p.yaw0), lz = -Math.sin(p.yaw0);
    return { x: p.x0 + fx * p.r * Math.sin(aa) + lx * sg * p.r * (1 - Math.cos(aa)), z: p.z0 + fz * p.r * Math.sin(aa) + lz * sg * p.r * (1 - Math.cos(aa)), yaw: p.yaw0 + a };
  };

  // ---- start line ------------------------------------------------------------------------------------------------
  const startV = V.find((p) => p.id === (spec.start?.at ?? V[0].id)) ?? V[0];
  const S0 = startV.lineOut.s0 + (spec.start?.offset ?? 0);
  const rel = (v) => ((v - S0) % L + L) % L; // path s measured from the start line

  // ---- profile keys (at corner apexes / pass-through points) ------------------------------------------------------
  const yKeys = [], wKeys = [], shKeys = [];
  V.forEach((p) => {
    const apex = rel((p.arc.s0 + p.arc.s1) / 2);
    if (p.y !== undefined) yKeys.push([apex, p.y]);
    if (p.w !== undefined) wKeys.push([apex, p.w]);
    if (p.sh !== undefined) shKeys.push([apex, p.sh]);
    if (p.yOut !== undefined) yKeys.push([rel(p.lineOut.s0 + Math.min(20, (p.lineOut.s1 - p.lineOut.s0) / 3)), p.yOut]);
  });
  if (!yKeys.length) yKeys.push([0, spec.y0 ?? 0]);
  if (!wKeys.length) wKeys.push([0, defW]);
  const yAt = periodicProfile(yKeys, L), wAt = periodicProfile(wKeys, L);
  const shAt = shKeys.length ? periodicProfile(shKeys, L) : null;

  const bankAt = (sRel) => {
    for (const p of V) {
      if (!p.hasArc || !p.bank) continue;
      const a0 = rel(p.arc.s0), len = p.arc.s1 - p.arc.s0;
      let u = sRel - a0; if (u < -1e-6) u += L;
      if (u < 0 || u > len) continue;
      const edgeLen = Math.min(0.32, Math.max(0.1, 45 / len));
      const sign = p.turn < 0 ? 1 : -1; // right turn -> positive bank
      return sign * p.bank * smooth01(u / len / edgeLen) * smooth01((1 - u / len) / edgeLen);
    }
    return 0;
  };

  // ---- sample control points starting at the line ------------------------------------------------------------------
  // breakpoints: every primitive boundary (relative to the line), then subdivide
  const cuts = [0];
  for (const p of prims) { const r0 = rel(p.s0); if (r0 > 1e-3) cuts.push(r0); }
  cuts.sort((a, b) => a - b);
  cuts.push(L);
  const primAt = (sRel) => { const S = (sRel + S0) % L; let lo = 0, hi = prims.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prims[mid].s0 <= S) lo = mid; else hi = mid - 1; } return prims[lo]; };
  const points = [];
  const hasSh = shAt !== null || spec.shoulder !== undefined;
  for (let c = 0; c < cuts.length - 1; c++) {
    const a = cuts[c], b = cuts[c + 1], len = b - a;
    const pr = primAt(a + len / 2);
    const steps = pr.kind === 'arc'
      ? Math.max(1, Math.ceil(Math.max((len / pr.r) / MAX_ARC_STEP, len / MAX_ARC_LEN)))
      : Math.max(1, Math.ceil(len / MAX_STRAIGHT_STEP));
    for (let k = 0; k < steps; k++) {
      const sr = a + (len * k) / steps;
      const q = at(sr + S0);
      const row = [round(q.x), round(yAt(sr)), round(q.z), round(wAt(sr)), round(bankAt(sr), 2)];
      if (hasSh) row.push(round(shAt ? shAt(sr) : spec.shoulder, 2));
      points.push(row);
    }
  }

  // ---- markers ----------------------------------------------------------------------------------------------------
  const markers = {};
  for (const p of V) {
    const mk = (id, s0, s1) => {
      const q = at(s0);
      markers[id] = { s0: rel(s0), s1: rel(s0) + (s1 - s0), len: s1 - s0, x: q.x, z: q.z, y: yAt(rel(s0)), heading: q.yaw / DEG };
    };
    if (p.hasArc) mk(p.id, p.arc.s0, p.arc.s1);
    else mk(p.id, p.arc.s0, p.arc.s0);
    mk(p.id + '>', p.lineOut.s0, p.lineOut.s1);
  }
  return { points, markers, length: L, warnings, vertices: V, startS: S0 };
}
