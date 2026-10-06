// Corner detection on a track's curvature profile.   OWNER: Agent B.  Pure maths (works headless).
// Returns corners ordered by s: { s0, s1, sApex, dir (+1 = left turn), angle (rad, absolute), minRadius (m), radiusAt (apex) }.
import { wrapAngle } from '../core/math.js';

export function detectCorners(track, { threshold = 1 / 220, minAngle = 0.35 } = {}) {
  const N = track.count, sp = track.spacing, L = track.length;
  // raw (lightly smoothed) curvature from yaw differences over ~8 m so tight apexes are not averaged away
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = wrapAngle(track.yawArr[(i + 2) % N] - track.yawArr[(i - 2 + N) % N]) / (4 * sp);
  const corners = [];
  let cur = null;
  for (let k = 0; k < N * 2; k++) {
    const i = k % N, c = track.curvature[i];
    const on = Math.abs(c) > threshold && (!cur || Math.sign(c) === cur.dir);
    if (on) {
      if (!cur) cur = { s0: k * sp, dir: Math.sign(c), angle: 0, kmax: 0, sApex: k * sp };
      cur.angle += Math.abs(c) * sp; cur.s1 = (k + 1) * sp;
      if (Math.abs(raw[i]) > cur.kmax) { cur.kmax = Math.abs(raw[i]); cur.sApex = k * sp; }
    } else if (cur) {
      if (cur.s0 < L && cur.angle >= minAngle) corners.push(cur);
      cur = null;
    }
  }
  if (cur && cur.s0 < L && cur.angle >= minAngle) corners.push(cur);
  // a corner that wraps past the start line appears twice (k in [0,N) and [N,2N)): keep the first
  const out = [];
  for (const c of corners) {
    if (out.some((o) => Math.abs(((o.sApex - c.sApex) % L + L) % L) < 6 || Math.abs(((c.sApex - o.sApex) % L + L) % L) < 6)) continue;
    out.push({ s0: c.s0 % L, s1: c.s1 % L, len: c.s1 - c.s0, sApex: c.sApex % L, dir: c.dir, angle: c.angle, minRadius: 1 / Math.max(c.kmax, 1e-4) });
  }
  return out.sort((a, b) => a.sApex - b.sApex);
}
