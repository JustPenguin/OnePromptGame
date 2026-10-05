// Racing line + corner speed model for the AI.  OWNER: Agent B.
// Produces `track.racingLine = { offset[], maxSpeed[] }` (per centreline sample) and fills `track.curvature`.
//   offset[i]   lateral metres from the centreline the ideal line runs at (+ = right)
//   maxSpeed[i] corner-limited speed in m/s (already brake-limited: a kart at maxSpeed[i] can slow down in time for i+1...)
import { clamp, wrapAngle } from '../core/math.js';

export function buildRacingLine(track) {
  const N = track.count, sp = track.spacing;
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = track.yawArr[(i - 2 + N) % N], b = track.yawArr[(i + 2) % N];
    curv[i] = wrapAngle(b - a) / (4 * sp); // rad/m, + = turning left
  }
  // smooth curvature over ~30 m
  const sm = track.curvature;
  const win = 8;
  for (let i = 0; i < N; i++) { let a = 0; for (let k = -win; k <= win; k++) a += curv[(i + k + N) % N]; sm[i] = a / (2 * win + 1); }
  const offset = new Float32Array(N);
  const maxSpeed = new Float32Array(N);
  const vTop = 60, aLat = 24, aBrake = 20;
  for (let i = 0; i < N; i++) {
    // hug the inside of the corner: left turn (+curv) -> negative lateral
    offset[i] = clamp(-sm[i] * 110, -0.6, 0.6) * track.hw[i];
    maxSpeed[i] = Math.min(vTop, Math.sqrt(aLat / Math.max(Math.abs(sm[i]), 1e-4)));
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = N * 2 - 1; i >= 0; i--) {
      const a = i % N, b = (i + 1) % N;
      maxSpeed[a] = Math.min(maxSpeed[a], Math.sqrt(maxSpeed[b] * maxSpeed[b] + 2 * aBrake * sp));
    }
  }
  return { offset, maxSpeed };
}
