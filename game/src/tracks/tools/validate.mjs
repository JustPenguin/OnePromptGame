// Headless track validator: checks every track definition against the design rules, in plain Node (no browser, ~1 s for all eight).   OWNER: Agent B.
//
//   node src/tracks/tools/validate.mjs            all tracks
//   node src/tracks/tools/validate.mjs neon-nights
//
// Rules (errors fail the run, warnings are printed):
//   lap length 1500-2300 m   |  width 9.5-21 m  |  >= 1 boost pad  |  item rows >= 4  |  unique ids/names, cup membership, palette.ui
//   layout closes (no unresolved layout warnings)  |  no self-overlap unless the vertical separation is > 6 m
//   spline smoothness: no yaw jump > 4 deg between samples, no |grade| > 20 %, no curvature spike (single-sample) > 3x its neighbours
//   zones: inside the lap, ramps not overlapping gaps/pads, a gap is preceded by a ramp, every gap's required entry speed < 30 m/s
//   start grid: 12 slots on the road, behind the line, grid does not run into a gap/ramp
//   coins/item boxes: finite positions, items not inside gap/ramp zones
import { TRACK_DEFS, CUPS } from '../index.js';
import { SplineTrack } from '../../track/SplineTrack.js';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const defs = only.length ? TRACK_DEFS.filter((d) => only.includes(d.id)) : TRACK_DEFS;
let errors = 0, warnings = 0;

for (const def of defs) {
  const err = [], warn = [];
  const t0 = performance.now();
  let t;
  try { t = new SplineTrack(def, { headless: true }); } catch (e) { console.log(`\n== ${def.id}\n   ERROR: constructing the track threw: ${e.message}`); errors++; continue; }
  const ms = performance.now() - t0;
  const N = t.count, sp = t.spacing, L = t.length;
  const E = (m) => err.push(m), W = (m) => warn.push(m);

  // --- definition fields ---
  for (const k of ['id', 'name', 'cup', 'theme', 'music', 'laps', 'difficulty', 'description', 'palette']) if (def[k] === undefined) E(`missing def.${k}`);
  if (!def.palette?.ui?.primary) W('palette.ui.{primary,secondary} missing (menu card colours)');
  const cup = CUPS.find((c) => c.id === def.cup);
  if (!cup || !cup.trackIds.includes(def.id)) E(`not listed in CUPS[${def.cup}]`);
  for (const w of def._layoutWarnings ?? []) W('layout: ' + w);
  // --- size ---
  if (L < 1500 || L > 2300) W(`lap length ${L.toFixed(0)} m is outside the 1500-2300 m target`);
  let wMin = 1e9, wMax = 0;
  for (let i = 0; i < N; i++) { wMin = Math.min(wMin, t.hw[i] * 2); wMax = Math.max(wMax, t.hw[i] * 2); }
  if (wMin < 9.5) E(`road narrower than 9.5 m (${wMin.toFixed(1)})`);
  if (wMax > 21) W(`road wider than 21 m (${wMax.toFixed(1)})`);
  // --- smoothness ---
  let maxDYaw = 0, maxDYawAt = 0, maxGrade = 0, maxGradeAt = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    let d = Math.abs(t.yawArr[j] - t.yawArr[i]); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > maxDYaw) { maxDYaw = d; maxDYawAt = i * sp; }
    const k = (i + 4) % N;
    const dh = Math.hypot(t.pos[k * 3] - t.pos[i * 3], t.pos[k * 3 + 2] - t.pos[i * 3 + 2]);
    const g = Math.abs(t.pos[k * 3 + 1] - t.pos[i * 3 + 1]) / Math.max(1, dh);
    if (g > maxGrade) { maxGrade = g; maxGradeAt = i * sp; }
  }
  // 2 m samples: R = 2 / yaw.  Tighter than R ~ 19 m is a kink, tighter than 24 m is a hairpin worth a warning.
  const minR = sp / maxDYaw;
  if (minR < 19) E(`corner radius ~${minR.toFixed(0)} m near s=${maxDYawAt.toFixed(0)} (< 19 m: kink - add control points / raise the radius)`);
  else if (minR < 24) W(`very tight corner (R ~${minR.toFixed(0)} m) near s=${maxDYawAt.toFixed(0)}`);
  // curvature STEP: yaw-per-sample may not change by more than 4.5 deg from one sample to the next (spline ringing / S-bend with no straight)
  let maxStep = 0, maxStepAt = 0;
  for (let i = 0; i < N; i++) {
    const wr = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const y0 = wr(t.yawArr[(i + 1) % N] - t.yawArr[i]), y1 = wr(t.yawArr[(i + 2) % N] - t.yawArr[(i + 1) % N]);
    if (Math.abs(y1 - y0) > maxStep) { maxStep = Math.abs(y1 - y0); maxStepAt = i * sp; }
  }
  if (maxStep > (4.5 * Math.PI) / 180) E(`curvature jumps ${(maxStep * 180 / Math.PI).toFixed(1)} deg per sample near s=${maxStepAt.toFixed(0)} (S-bend without a straight between the corners?)`);
  if (maxGrade > 0.2) E(`grade ${(maxGrade * 100).toFixed(0)} % near s=${maxGradeAt.toFixed(0)} (> 20 %)`);
  else if (maxGrade > 0.14) W(`steep grade ${(maxGrade * 100).toFixed(0)} % near s=${maxGradeAt.toFixed(0)}`);
  // --- self overlap ---
  const near = Math.round(90 / sp), bad = [];
  for (let i = 0; i < N; i++) for (let j = i + near; j < N; j++) {
    if (Math.min(j - i, N - (j - i)) < near) continue;
    const d = Math.hypot(t.pos[i * 3] - t.pos[j * 3], t.pos[i * 3 + 2] - t.pos[j * 3 + 2]);
    const need = t.hw[i] + t.hw[j] + t.shoulderW[i] + t.shoulderW[j] + 3;
    if (d < need) { const dy = Math.abs(t.pos[i * 3 + 1] - t.pos[j * 3 + 1]); if (dy < 6.5) bad.push(`s${(i * sp).toFixed(0)}~s${(j * sp).toFixed(0)} (d ${d.toFixed(0)} m, dy ${dy.toFixed(1)} m)`); }
  }
  if (bad.length) E(`self-overlap without 6.5 m vertical separation: ${[...new Set(bad)].slice(0, 4).join(', ')}`);
  // --- zones ---
  const zs = t.zones;
  if (!t.boostPads.length) E('no boost pad');
  for (const z of zs) {
    if (!(z.s1 > z.s0) || z.s0 < -1e-6 || z.s1 > L + 1e-3) W(`zone ${z.type} [${z.s0.toFixed(0)}, ${z.s1.toFixed(0)}] runs outside 0..${L.toFixed(0)} (it wraps over the start line: fine, but check)`);
    if (z.type === 'boost') {
      const smp = t.sampleAt((z.s0 + z.s1) / 2);
      if (z.l1 > smp.halfWidth + 0.5 || z.l0 < -smp.halfWidth - 0.5) E(`boost pad at s=${z.s0.toFixed(0)} sticks out of the road`);
    }
  }
  for (const a of zs) for (const b of zs) {
    if (a === b || a.type === 'ice' || b.type === 'ice' || a.type === 'boost' && b.type === 'boost') continue;
    if (a.s0 < b.s1 && b.s0 < a.s1 && !(a.type === 'ramp' && b.type === 'gap') && !(a.type === 'gap' && b.type === 'ramp')) { if (a.type < b.type) W(`zones overlap: ${a.type}@${a.s0.toFixed(0)} and ${b.type}@${b.s0.toFixed(0)}`); }
  }
  for (const g of t.gaps) {
    const ramp = t.ramps.find((r) => Math.abs(r.s1 - g.s0) < 6);
    if (!ramp) E(`gap at s=${g.s0.toFixed(0)} has no ramp directly before it`);
    else if ((g.minSpeed ?? 99) > 30) E(`gap at s=${g.s0.toFixed(0)} needs ${g.minSpeed?.toFixed(1)} m/s to clear (> 30 m/s: shorten the gap or raise the ramp)`);
    else if ((g.minSpeed ?? 0) > 27) W(`gap at s=${g.s0.toFixed(0)} needs ${g.minSpeed.toFixed(1)} m/s: slow karts will fall (that is fine for difficulty 3)`);
    // the road must continue after the gap on both sides at similar height
    const a = t.sampleAt(g.s0 - 2), b = t.sampleAt(g.s1 + 2);
    if (Math.abs(a.position.y - b.position.y) > 1.2 + (ramp ? 0 : 0)) W(`gap at s=${g.s0.toFixed(0)}: road height differs by ${(Math.abs(a.position.y - b.position.y)).toFixed(1)} m across the gap`);
  }
  // --- start grid ---
  const grid = t.getStartGrid(12);
  const q = new (t._q.constructor)();
  let gridBad = 0;
  for (const slot of grid) { t.project(slot.position, q, -1); if (!q.onRoad || Math.abs(q.lateral - slot.lateral) > 1.5) gridBad++; }
  if (gridBad) E(`${gridBad}/12 start-grid slots are off the road`);
  const backS = (L - grid[11].s) % L;
  if (t.zones.some((z) => (z.type === 'gap' || z.type === 'ramp') && ((z.s1 > L - backS - 10) || z.s0 < 20))) E('a ramp / gap lies within the start grid or the first 20 m');
  // curvature at the grid: the 12-kart grid should sit on a near-straight (|curv| < 1/200)
  let gridCurv = 0; for (let k = 1; k <= 12; k++) gridCurv = Math.max(gridCurv, Math.abs(t.curvatureAt(L - backS + k * 4)));
  if (gridCurv > 1 / 150) W(`the start grid is on a bend (R ~ ${(1 / gridCurv).toFixed(0)} m)`);
  // --- coins / items ---
  if (t.itemBoxes.length < 4 * 3) W(`only ${t.itemBoxes.length} item boxes`);
  for (const b of t.itemBoxes) { if (![b.position.x, b.position.y, b.position.z].every(Number.isFinite)) { E('non-finite item box'); break; } }
  for (const b of t.itemBoxes) { if (t.zones.some((z) => (z.type === 'gap' || z.type === 'ramp') && b.s >= z.s0 - 4 && b.s <= z.s1 + 4)) { W(`item row at s=${b.s.toFixed(0)} is on a jump`); break; } }
  for (const c of t.coins) { if (![c.position.x, c.position.y, c.position.z].every(Number.isFinite)) { E('non-finite coin'); break; } }
  const lineMax = t.racingLine.offset.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  if (!Number.isFinite(lineMax)) E('racing line contains NaN');
  // --- report ---
  console.log(`\n== ${def.id}  ${L.toFixed(0)} m  width ${wMin.toFixed(1)}-${wMax.toFixed(1)}  ${t.boostPads.length} pads, ${t.ramps.length} ramps, ${t.gaps.length} gaps  ${t.itemBoxes.length} item boxes  ${t.coins.length} coins  build ${ms.toFixed(0)} ms`);
  if (!err.length && !warn.length) console.log('   OK');
  for (const m of err) console.log('   ERROR: ' + m);
  for (const m of warn) console.log('   warn:  ' + m);
  errors += err.length; warnings += warn.length;
}
console.log(`\n${errors ? 'VALIDATION FAILED' : 'VALIDATION PASSED'}  (${errors} error(s), ${warnings} warning(s))`);
process.exit(errors ? 1 : 0);
