// The four kart bodies. OWNER: Agent C (visuals).
//   classic  - go-kart racer: nose cone, side pods, bucket seat, engine cover, little wing
//   streak   - low wedge GT with a big rear wing
//   hopper   - chunky buggy: knobbly oversized rear tyres, roll bar, coil springs, whip-flag
//   crusher  - heavy bruiser: bull-bar, exhaust stacks, armour plates
// Each builder bakes its parts into the shared PartBuilder `B` (bone names resolved through `rig`) and returns a spec
// that the driver builder + animation code use: wheel layout, seat/steering positions, effect mount points.
// Model space: +Z forward, +X = kart LEFT, Y up, origin on the ground at the kart centre.
import * as THREE from 'three';
import { rbox, box, sph, cyl, cone, capsule, torus, tube, lathe, loft, extrude, arch, DEG } from './build.js';

/** Surface presets spread into PartBuilder.add options. */
export const M = {
  paint:   { rough: 0.3, metal: 0.08, cc: 1 },
  panel:   { rough: 0.38, metal: 0.05, cc: 0.6 },
  chrome:  { rough: 0.1, metal: 1 },
  steel:   { rough: 0.34, metal: 0.9 },
  rubber:  { rough: 0.88, metal: 0 },
  plastic: { rough: 0.5, metal: 0 },
  fur:     { rough: 0.78, metal: 0 },
  skin:    { rough: 0.55, metal: 0 },
  cloth:   { rough: 0.7, metal: 0 },
  gloss:   { rough: 0.22, metal: 0, cc: 0.8 },
  glow: (e) => ({ rough: 1, metal: 0, emit: e }),
};

export const CHROME = '#e6ebf5';
export const STEEL = '#59607a';
export const DARK = '#1f222c';
export const RUBBER = '#16171c';

/** Colours a body is painted with (derived from the driver's livery by KartVisuals). */
export function bodyPalette(colors) {
  return { paint: colors.primary, stripe: colors.secondary, accent: colors.accent, dark: DARK, chrome: CHROME, steel: STEEL, rubber: RUBBER, seat: '#2a2e3b' };
}

// ------------------------------------------------------------------------------------------------ shared pieces
/**
 * A wheel built around (x, y, z) with its axle along X; `x > 0` is the kart's left (hub faces +X), mirrored for the right.
 * o: { r radius, w tread width, bone, bm (mirror bone), hub: 'spoke'|'disc'|'dish', rim: colour of the hub, lugs: knob count (0 = smooth),
 *      lugH knob height, band: coloured sidewall ring colour, sidewall: radius of the inner sidewall as a fraction of r }
 */
export function addWheel(B, pal, o) {
  const { x, y, z, r, w } = o;
  const hubCol = o.rim ?? pal.chrome;
  const side = o.sidewall ?? 0.6;
  const hw = w / 2;
  const rr = Math.min(w * 0.34, r * 0.3);
  // tyre profile (radius, axial position): flat sidewalls, rounded shoulders, slightly domed tread
  const prof = [[r * side, -hw], [r - rr * 1.15, -hw]];
  for (const a of [0.45, 0.95, 1.3]) prof.push([r - rr + rr * Math.sin(a), -hw + rr - rr * Math.cos(a)]);
  prof.push([r, -hw * 0.3], [r, hw * 0.3]);
  for (const a of [1.3, 0.95, 0.45]) prof.push([r - rr + rr * Math.sin(a), hw - rr + rr * Math.cos(a)]);
  prof.push([r - rr * 1.15, hw], [r * side, hw]);
  const common = { p: [x, y, z], r: [0, 0, -Math.PI / 2], bone: o.bone, bm: o.bm, mirror: o.mirror !== false };
  B.add(lathe(prof, 26), { ...common, ...M.rubber, c: RUBBER, ao: 0.55, tag: 'tyre' });
  // close the inside of the tyre with a dark disc so wheels are never hollow when seen from the inner side
  B.add(lathe([[0, -hw + 0.03], [r * side + 0.01, -hw + 0.03]], 20), { ...common, ...M.plastic, c: '#0e0f14', ao: 0.4, tag: 'tyre' });
  // coloured sidewall band on the outer face (a thin ring just proud of the rubber)
  if (o.band) B.add(lathe([[r * 0.66, hw + 0.002], [r * 0.82, hw + 0.002]], 24), { ...common, ...M.plastic, rough: 0.5, c: o.band, ao: 0.3, tag: 'band' });
  const mir = { bone: o.bone, bm: o.bm, mirror: o.mirror !== false };
  // knobby lugs around the tread
  if (o.lugs) {
    const lh = o.lugH ?? r * 0.1;
    for (let i = 0; i < o.lugs; i++) {
      const a = (i / o.lugs) * Math.PI * 2;
      const stagger = i % 2 ? 0.2 : -0.2;
      const cy = Math.cos(a) * (r + lh * 0.18), cz = Math.sin(a) * (r + lh * 0.18);
      B.add(cyl((o.lugW ?? r * 0.17) * 0.5, (o.lugW ?? r * 0.17) * 0.72, lh * 1.4, 4), { p: [x + stagger * w, y + cy, z + cz], r: [a, Math.PI / 4, 0], s: [1.15, 1, 1.15], ...mir, ...M.rubber, c: '#2a2c34', ao: 0.5, tag: 'lugs' });
    }
  }
  // hub / rim on the outer side (+X for the left wheel)
  const out = hw - 0.012;
  const hubR = r * 0.62;
  if (o.hub === 'disc') {
    B.add(lathe([[0, out - 0.05], [hubR * 0.4, out - 0.04], [hubR * 0.62, out - 0.012], [hubR, out - 0.02], [hubR * 1.02, out - 0.07]], 18), { ...common, ...M.steel, c: hubCol, ao: 0.5, tag: 'hub' });
    B.add(sph(hubR * 0.2, 8, 5), { p: [x + out, y, z], s: [0.5, 1, 1], ...mir, ...M.chrome, c: CHROME, tag: 'hub' });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      B.add(cyl(hubR * 0.075, hubR * 0.075, 0.03, 6), { p: [x + out + 0.002, y + Math.cos(a) * hubR * 0.62, z + Math.sin(a) * hubR * 0.62], r: [0, 0, -Math.PI / 2], ...mir, ...M.chrome, c: CHROME, tag: 'hub' });
    }
  } else {
    // 5-spoke sport rim: rim lip + dark dish + round spokes + cap
    B.add(lathe([[hubR * 0.94, out - 0.07], [hubR * 1.02, out - 0.07], [hubR * 1.04, out - 0.02], [hubR * 0.96, out - 0.005], [hubR * 0.86, out - 0.03]], 22), { ...common, ...M.chrome, c: hubCol, ao: 0.5, tag: 'rim' });
    B.add(lathe([[0, out - 0.045], [hubR * 0.9, out - 0.062]], 18), { ...common, ...M.plastic, c: '#10121a', ao: 0.4, tag: 'rim' });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      B.add(capsule(hubR * 0.095, hubR * 0.55, 2, 6), { p: [x + out - 0.03, y + Math.cos(a) * hubR * 0.47, z + Math.sin(a) * hubR * 0.47], r: [a, 0, 0], s: [0.62, 1, 1.25], ...mir, ...M.chrome, c: hubCol, ao: 0.6, tag: 'spokes' });
    }
    B.add(sph(hubR * 0.19, 10, 6), { p: [x + out - 0.005, y, z], s: [0.55, 1, 1], ...mir, ...M.chrome, c: pal.accent, tag: 'rim' });
  }
}

/** Exhaust tip with a dark glowing mouth; returns nothing (mount points are returned by the body spec). */
function addExhaust(B, pal, x, y, z, { len = 0.3, r = 0.062, tilt = 0, mirror = true } = {}) {
  B.add(tube([[x, y + 0.05, z + len + 0.12], [x, y, z + len * 0.5], [x, y - 0.0, z]], r, { rs: 10, caps: false }), { ...M.chrome, c: CHROME, bone: 'chassis', mirror, ao: 0.6 });
  B.add(cyl(r * 1.22, r * 1.1, 0.07, 14), { p: [x, y, z - 0.01], r: [Math.PI / 2 + tilt, 0, 0], ...M.steel, c: '#3a4054', bone: 'chassis', mirror, ao: 0.5 });
  B.add(cyl(r * 0.78, r * 0.78, 0.02, 14), { p: [x, y, z - 0.042], r: [Math.PI / 2 + tilt, 0, 0], ...M.glow(1.6), c: '#ffb36a', bone: 'chassis', mirror });
}

function addHeadlight(B, pal, x, y, z, { r = 0.085, yaw = 0, mirror = true, col = '#fff6dc', emit = 3 } = {}) {
  B.add(cyl(r * 1.05, r * 0.9, 0.12, 14), { p: [x, y, z - 0.03], r: [Math.PI / 2, 0, 0], ...M.chrome, c: CHROME, bone: 'chassis', mirror, tag: 'lamp' });
  B.add(torus(r * 1.0, r * 0.2, 6, 16), { p: [x, y, z + 0.03], r: [0, yaw, 0], ...M.chrome, c: CHROME, bone: 'chassis', mirror, tag: 'lamp' });
  B.add(sph(r * 0.9, 12, 8), { p: [x, y, z + 0.03], s: [1, 1, 0.5], r: [0, yaw, 0], ...M.glow(emit), c: col, bone: 'chassis', mirror, tag: 'lamp' });
}

function addTailLight(B, x, y, z, { w = 0.17, h = 0.075, mirror = true, col = '#ff3030', emit = 2.4 } = {}) {
  B.add(rbox(w, h, 0.05, 0.03), { p: [x, y, z], ...M.glow(emit), c: col, bone: 'chassis', mirror });
}

/** Rounded bucket seat. */
function addSeat(B, pal, { x = 0, y = 0.42, z = -0.2, w = 0.62, tilt = 0.18, piping = true } = {}) {
  B.add(rbox(w, 0.13, 0.54, 0.06), { p: [x, y, z], ...M.cloth, c: pal.seat, bone: 'chassis' });
  B.add(rbox(w * 0.98, 0.66, 0.15, 0.07), { p: [x, y + 0.34, z - 0.26], r: [-tilt, 0, 0], ...M.cloth, c: pal.seat, bone: 'chassis' });
  B.add(rbox(w * 0.52, 0.22, 0.14, 0.06), { p: [x, y + 0.7, z - 0.33], r: [-tilt, 0, 0], ...M.cloth, c: pal.seat, bone: 'chassis' });
  if (piping) {
    B.add(rbox(0.05, 0.66, 0.04, 0.015), { p: [x + w * 0.5, y + 0.34, z - 0.19], r: [-tilt, 0, 0], ...M.plastic, c: pal.accent, bone: 'chassis', mirror: true });
  }
}

// ------------------------------------------------------------------------------------------------ CLASSIC
export const CLASSIC = {
  id: 'classic',
  wheels: { FL: { x: 0.8, y: 0.4, z: 0.88, r: 0.4, w: 0.32 }, RL: { x: 0.82, y: 0.4, z: -0.88, r: 0.4, w: 0.38 } },
  seat: { x: 0, y: 0.6, z: -0.2 },
  steer: { pos: [0, 0.9, 0.36], axis: [0, 0.58, -0.81], radius: 0.19 },
  exhaust: [[0.22, 0.5, -1.45], [-0.22, 0.5, -1.45]],
  size: { length: 2.7, width: 1.9, height: 1.0 },
};

function buildClassic(B, rig, pal) {
  const S = CLASSIC;
  // floor pan + underbody
  B.add(rbox(1.0, 0.13, 2.25, 0.055), { p: [0, 0.29, -0.06], ...M.steel, c: '#303546', bone: 'chassis' });
  // nose cone (lofted) with decal-receiving paint
  B.add(loft([
    { z: 0.52, hw: 0.5, y0: 0.27, y1: 0.66, n: 3.4 },
    { z: 0.95, hw: 0.43, y0: 0.27, y1: 0.58, n: 3.4 },
    { z: 1.25, hw: 0.29, y0: 0.28, y1: 0.5, n: 3 },
    { z: 1.45, hw: 0.1, y0: 0.31, y1: 0.45, n: 2.4 },
  ]), { ...M.paint, c: pal.paint, decal: true, bone: 'chassis' });
  // front bumper loop (chrome) + front fairing wing
  B.add(tube([[-0.5, 0.38, 0.88], [-0.36, 0.34, 1.34], [0, 0.32, 1.5], [0.36, 0.34, 1.34], [0.5, 0.38, 0.88]], 0.04, { rs: 8 }), { ...M.chrome, c: CHROME, bone: 'chassis' });
  B.add(rbox(1.3, 0.05, 0.3, 0.022), { p: [0, 0.25, 1.28], ...M.paint, c: pal.stripe, bone: 'chassis', decal: true });
  // side pods (mirror): long rounded pods flanking the seat
  B.add(loft([
    { z: -0.72, hw: 0.13, y0: 0.27, y1: 0.55, n: 3, x: 0.43 },
    { z: -0.25, hw: 0.15, y0: 0.25, y1: 0.7, n: 3.2, x: 0.43 },
    { z: 0.3, hw: 0.14, y0: 0.25, y1: 0.66, n: 3.2, x: 0.43 },
    { z: 0.7, hw: 0.1, y0: 0.29, y1: 0.5, n: 2.8, x: 0.43 },
    { z: 0.88, hw: 0.04, y0: 0.31, y1: 0.43, n: 2.4, x: 0.43 },
  ]), { ...M.paint, c: pal.paint, decal: true, bone: 'chassis', mirror: true });
  // seat
  addSeat(B, pal, { z: -0.2 });
  // engine cover (decal top) + air filter + exhausts
  B.add(rbox(0.8, 0.36, 0.6, 0.13), { p: [0, 0.52, -0.95], ...M.paint, c: pal.paint, decal: true, bone: 'chassis' });
  B.add(cyl(0.1, 0.11, 0.1, 18), { p: [0.2, 0.76, -0.9], ...M.chrome, c: CHROME, bone: 'chassis' });
  B.add(cyl(0.085, 0.085, 0.03, 18), { p: [0.2, 0.82, -0.9], ...M.steel, c: '#454c63', bone: 'chassis' });
  addExhaust(B, pal, 0.22, 0.5, -1.38, { len: 0.28 });
  // rear bumper + little wing on posts
  B.add(tube([[-0.52, 0.4, -1.12], [-0.4, 0.37, -1.45], [0, 0.35, -1.5], [0.4, 0.37, -1.45], [0.52, 0.4, -1.12]], 0.045, { rs: 8 }), { ...M.chrome, c: CHROME, bone: 'chassis' });
  B.add(rbox(1.04, 0.045, 0.3, 0.02), { p: [0, 1.02, -1.18], r: [0.12, 0, 0], ...M.paint, c: pal.stripe, bone: 'chassis', decal: true });
  B.add(rbox(0.05, 0.3, 0.32, 0.02), { p: [0.52, 1.02, -1.18], ...M.paint, c: pal.paint, bone: 'chassis', mirror: true });
  B.add(rbox(0.05, 0.36, 0.05, 0.02), { p: [0.2, 0.86, -1.12], ...M.steel, c: STEEL, bone: 'chassis', mirror: true });
  // lights
  addHeadlight(B, pal, 0.43, 0.43, 0.96, { r: 0.086, yaw: 0.12 });
  addTailLight(B, 0.3, 0.55, -1.27);
  // underglow strip
  B.add(rbox(0.86, 0.02, 1.9, 0.01), { p: [0, 0.2, -0.1], ...M.glow(2.2), c: pal.accent, bone: 'chassis' });
  // steering column + wheel (wheel rotates about the column axis)
  steeringAssembly(B, pal, S.steer, 0.3);
  // wheels
  const W = S.wheels;
  addWheel(B, pal, { ...W.FL, bone: 'wheelFL', bm: 'wheelFR', hub: 'spoke', rim: CHROME, band: pal.accent });
  addWheel(B, pal, { ...W.RL, bone: 'wheelRL', bm: 'wheelRR', hub: 'spoke', rim: CHROME, band: pal.accent });
  return { ...S, mounts: { exhaustL: S.exhaust[0], exhaustR: S.exhaust[1] } };
}

/** Column (static, chassis) + wheel rim, spokes and cap (bone 'steerWheel'). */
function steeringAssembly(B, pal, st, colLen = 0.5) {
  const [px, py, pz] = st.pos;
  const ax = new THREE.Vector3(...st.axis).normalize();
  // column: from the hub down/forward along -axis
  const end = new THREE.Vector3(px, py, pz).addScaledVector(ax, -colLen);
  B.add(tube([[end.x, end.y, end.z], [px, py, pz]], 0.022, { rs: 6, caps: false }), { ...M.steel, c: '#454c63', bone: 'chassis', tag: 'column' });
  // wheel plane normal = axis; torus default normal = +Z, so rotate Z -> axis
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const rot = [e.x, e.y, e.z];
  B.add(torus(st.radius, 0.032, 8, 24), { p: [px, py, pz], r: rot, ...M.rubber, c: '#14151b', bone: 'steerWheel', tag: 'steer' });
  B.add(box(st.radius * 1.9, 0.026, 0.03), { p: [px, py, pz], r: rot, ...M.steel, c: '#59607a', bone: 'steerWheel', tag: 'steer' });
  B.add(box(0.026, st.radius * 0.95, 0.03), { p: [px, py - st.radius * 0.48, pz], r: rot, ...M.steel, c: '#59607a', bone: 'steerWheel', tag: 'steer' });
  B.add(cyl(0.055, 0.06, 0.05, 12), { p: [px, py, pz], r: [rot[0] + Math.PI / 2, rot[1], rot[2]], ...M.gloss, c: pal.accent, bone: 'steerWheel', tag: 'steer' });
}

// ------------------------------------------------------------------------------------------------ shared extras
/** Arch (fender) over a wheel: smooth swept section, thickness rOut - rIn, `width` along X. */
const archGeo = (rIn, rOut, a0, a1, width) => arch(rIn, rOut, a0, a1, width, 0.028);

/** Vertical exhaust stack with a glowing mouth (returns the top position). */
function addStack(B, x, y0, y1, z, { r = 0.07, mirror = true } = {}) {
  B.add(tube([[x, y0, z], [x, (y0 + y1) / 2, z - 0.03], [x, y1 - 0.06, z - 0.02]], r, { rs: 8, seg: 4, caps: false }), { ...M.chrome, c: CHROME, bone: 'chassis', mirror, tag: 'stack' });
  B.add(cyl(r * 1.25, r * 1.1, 0.1, 12), { p: [x, y1 - 0.02, z - 0.02], ...M.steel, c: '#3a4054', bone: 'chassis', mirror, tag: 'stack' });
  B.add(cyl(r * 0.8, r * 0.8, 0.02, 12), { p: [x, y1 + 0.032, z - 0.02], ...M.glow(1.5), c: '#ffb36a', bone: 'chassis', mirror, tag: 'stack' });
}

// ------------------------------------------------------------------------------------------------ STREAK (low GT)
export const STREAK = {
  id: 'streak',
  wheels: { FL: { x: 0.78, y: 0.38, z: 1.02, r: 0.38, w: 0.3 }, RL: { x: 0.85, y: 0.44, z: -0.98, r: 0.44, w: 0.44 } },
  seat: { x: 0, y: 0.5, z: -0.14 },
  steer: { pos: [0, 0.82, 0.36], axis: [0, 0.5, -0.86], radius: 0.19 },
  exhaust: [[0.36, 0.36, -1.7], [-0.36, 0.36, -1.7]],
  size: { length: 3.2, width: 1.98, height: 1.1 },
};

function buildStreak(B, rig, pal) {
  const S = STREAK;
  B.add(rbox(0.96, 0.1, 2.7, 0.04), { p: [0, 0.25, -0.1], ...M.steel, c: '#262a38', bone: 'chassis', tag: 'floor' });
  // long wedge hood + rear deck
  B.add(loft([
    { z: 0.2, hw: 0.5, y0: 0.24, y1: 0.64, n: 4 }, { z: 0.75, hw: 0.47, y0: 0.23, y1: 0.56, n: 4 }, { z: 1.2, hw: 0.37, y0: 0.23, y1: 0.46, n: 3.4 },
    { z: 1.58, hw: 0.2, y0: 0.24, y1: 0.38, n: 3 }, { z: 1.78, hw: 0.05, y0: 0.26, y1: 0.33, n: 2.6 },
  ]), { ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'hood' });
  B.add(loft([
    { z: -0.5, hw: 0.5, y0: 0.24, y1: 0.58, n: 4 }, { z: -1.0, hw: 0.53, y0: 0.26, y1: 0.74, n: 4 }, { z: -1.45, hw: 0.45, y0: 0.3, y1: 0.7, n: 3.6 }, { z: -1.68, hw: 0.3, y0: 0.34, y1: 0.6, n: 3 },
  ]), { ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'deck' });
  // cockpit: tub rails, dash, dark interior
  B.add(rbox(0.09, 0.34, 0.95, 0.04), { p: [0.49, 0.43, -0.14], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', mirror: true, tag: 'rails' });
  B.add(rbox(1.0, 0.1, 0.5, 0.04), { p: [0, 0.3, -0.14], ...M.plastic, c: '#1b1e28', bone: 'chassis', tag: 'tub' });
  B.add(rbox(0.96, 0.2, 0.26, 0.08, 1), { p: [0, 0.66, 0.26], r: [-0.25, 0, 0], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'dash' });
  addSeat(B, pal, { y: 0.34, z: -0.2, tilt: 0.3, w: 0.58 });
  // windscreen frame (chrome arch)
  B.add(tube([[-0.46, 0.66, 0.32], [-0.4, 0.88, 0.14], [0.4, 0.88, 0.14], [0.46, 0.66, 0.32]], 0.024, { rs: 6 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'screen' });
  // front splitter, side skirts, diffuser
  B.add(rbox(1.64, 0.045, 0.4, 0.02), { p: [0, 0.2, 1.62], ...M.plastic, c: '#15171f', bone: 'chassis', tag: 'splitter' });
  B.add(rbox(1.46, 0.025, 0.1, 0.01), { p: [0, 0.225, 1.8], ...M.panel, c: pal.accent, bone: 'chassis', tag: 'splitter' });
  B.add(rbox(0.07, 0.1, 1.5, 0.03), { p: [0.58, 0.26, -0.1], ...M.plastic, c: '#15171f', bone: 'chassis', mirror: true, tag: 'skirt' });
  for (const x of [-0.18, 0, 0.18]) B.add(rbox(0.05, 0.14, 0.42, 0.02, 1), { p: [x, 0.3, -1.6], r: [0.28, 0, 0], ...M.plastic, c: '#15171f', bone: 'chassis', tag: 'diffuser' });
  // fenders over the rear wheels + small arches over the fronts
  const R = S.wheels.RL, F = S.wheels.FL;
  B.add(archGeo(R.r + 0.05, R.r + 0.12, 0.2, Math.PI - 0.2, R.w + 0.12), { p: [R.x, R.y, R.z], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', mirror: true, tag: 'fender' });
  B.add(archGeo(F.r + 0.04, F.r + 0.09, 0.45, Math.PI - 0.45, F.w + 0.1), { p: [F.x, F.y, F.z], ...M.paint, c: pal.paint, bone: 'chassis', mirror: true, tag: 'fender' });
  // big rear wing: pylons, plane, endplates, gurney
  B.add(rbox(0.07, 0.5, 0.16, 0.03), { p: [0.34, 0.95, -1.38], ...M.panel, c: '#20232e', bone: 'chassis', mirror: true, tag: 'wing' });
  B.add(rbox(1.78, 0.05, 0.44, 0.02), { p: [0, 1.2, -1.45], r: [0.1, 0, 0], ...M.paint, c: pal.stripe, decal: true, bone: 'chassis', tag: 'wing' });
  B.add(rbox(1.78, 0.04, 0.12, 0.015, 1), { p: [0, 1.28, -1.58], r: [0.5, 0, 0], ...M.paint, c: pal.accent, bone: 'chassis', tag: 'wing' });
  B.add(rbox(0.05, 0.36, 0.56, 0.02), { p: [0.9, 1.16, -1.46], ...M.paint, c: pal.paint, bone: 'chassis', mirror: true, tag: 'wing' });
  // lights: slim LED headlights, wide tail light bar, twin exhausts
  B.add(rbox(0.26, 0.045, 0.05, 0.02, 1), { p: [0.3, 0.38, 1.46], r: [0, -0.35, 0.12], ...M.glow(3), c: '#fff6dc', bone: 'chassis', mirror: true, tag: 'lamp' });
  B.add(sph(0.045, 8, 6), { p: [0.46, 0.36, 1.38], ...M.glow(3), c: '#fff6dc', bone: 'chassis', mirror: true, tag: 'lamp' });
  B.add(rbox(1.0, 0.06, 0.05, 0.025, 1), { p: [0, 0.56, -1.74], ...M.glow(2.6), c: '#ff2a2a', bone: 'chassis', tag: 'lamp' });
  addExhaust(B, pal, 0.36, 0.36, -1.7, { len: 0.2, r: 0.07 });
  B.add(rbox(0.84, 0.02, 2.1, 0.01), { p: [0, 0.19, -0.1], ...M.glow(2.2), c: pal.accent, bone: 'chassis', tag: 'glow' });
  steeringAssembly(B, pal, S.steer, 0.3);
  const W = S.wheels;
  addWheel(B, pal, { ...W.FL, bone: 'wheelFL', bm: 'wheelFR', hub: 'spoke', rim: pal.accent, band: pal.stripe });
  addWheel(B, pal, { ...W.RL, bone: 'wheelRL', bm: 'wheelRR', hub: 'spoke', rim: pal.accent, band: pal.stripe, sidewall: 0.58 });
  return { ...S, mounts: { exhaustL: S.exhaust[0], exhaustR: S.exhaust[1] } };
}

// ------------------------------------------------------------------------------------------------ HOPPER (dune buggy)
export const HOPPER = {
  id: 'hopper',
  wheels: { FL: { x: 0.82, y: 0.4, z: 1.04, r: 0.4, w: 0.3 }, RL: { x: 0.96, y: 0.6, z: -0.92, r: 0.6, w: 0.54 } },
  seat: { x: 0, y: 0.66, z: -0.18 },
  steer: { pos: [0, 1.0, 0.36], axis: [0, 0.6, -0.8], radius: 0.2 },
  exhaust: [[0.34, 0.74, -1.55], [-0.34, 0.74, -1.55]],
  size: { length: 3.1, width: 2.3, height: 1.7 },
};

function buildHopper(B, rig, pal) {
  const S = HOPPER;
  B.add(rbox(1.02, 0.22, 2.2, 0.08, 2), { p: [0, 0.42, -0.1], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'tub' });
  B.add(rbox(0.9, 0.1, 2.0, 0.04), { p: [0, 0.3, -0.1], ...M.steel, c: '#262a38', bone: 'chassis', tag: 'floor' });
  // chunky hood
  B.add(loft([
    { z: 0.4, hw: 0.5, y0: 0.4, y1: 0.78, n: 4 }, { z: 0.9, hw: 0.46, y0: 0.38, y1: 0.8, n: 4 }, { z: 1.3, hw: 0.36, y0: 0.38, y1: 0.7, n: 3.4 }, { z: 1.5, hw: 0.16, y0: 0.4, y1: 0.6, n: 2.8 },
  ]), { ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'hood' });
  addSeat(B, pal, { y: 0.5, z: -0.2, w: 0.64 });
  // exposed engine block + air filter + stacks
  B.add(rbox(0.86, 0.42, 0.56, 0.12, 1), { p: [0, 0.68, -1.0], ...M.steel, c: '#323848', bone: 'chassis', tag: 'engine' });
  B.add(rbox(0.74, 0.1, 0.44, 0.04), { p: [0, 0.94, -1.0], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'engine' });
  B.add(cyl(0.12, 0.14, 0.16, 14), { p: [0.18, 1.05, -1.0], ...M.chrome, c: CHROME, bone: 'chassis', tag: 'filter' });
  addExhaust(B, pal, 0.34, 0.74, -1.58, { len: 0.3, r: 0.07 });
  // roll cage (chrome) with accent clamps
  const hoop = [[0.55, 0.6, -0.52], [0.52, 1.3, -0.56], [0.0, 1.5, -0.58], [-0.52, 1.3, -0.56], [-0.55, 0.6, -0.52]];
  B.add(tube(hoop, 0.04, { rs: 7, seg: 6 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'cage' });
  B.add(tube([[0.5, 0.62, 0.38], [0.44, 1.0, 0.24], [0.4, 1.38, 0.08], [0.52, 1.3, -0.56]], 0.036, { rs: 7, seg: 6 }), { ...M.chrome, c: CHROME, bone: 'chassis', mirror: true, tag: 'cage' });
  B.add(tube([[-0.4, 1.38, 0.08], [0, 1.44, 0.04], [0.4, 1.38, 0.08]], 0.036, { rs: 7, seg: 4 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'cage' });
  for (const [x, y, z] of [[0.52, 1.3, -0.56], [0.4, 1.38, 0.08]]) { B.add(cyl(0.06, 0.06, 0.1, 10), { p: [x, y, z], r: [0, 0, Math.PI / 2], ...M.gloss, c: pal.accent, bone: 'chassis', mirror: true, tag: 'clamp' }); }
  // big round headlights on the cage
  addHeadlight(B, pal, 0.3, 1.26, 0.2, { r: 0.115, yaw: 0.08, emit: 3 });
  // rear springs (coil stack) + shock
  for (const s of [1, -1]) {
    B.add(cyl(0.035, 0.035, 0.5, 8), { p: [s * 0.62, 0.8, -0.98], ...M.chrome, c: CHROME, bone: 'chassis', tag: 'spring' });
    for (let i = 0; i < 5; i++) B.add(torus(0.075, 0.018, 4, 9), { p: [s * 0.62, 0.64 + i * 0.085, -0.98], r: [Math.PI / 2, 0, 0], ...M.plastic, c: pal.accent, bone: 'chassis', tag: 'spring' });
  }
  // big flared fenders
  const R = S.wheels.RL, F = S.wheels.FL;
  // (clearance covers the knobs: lug tips reach r + 0.106 behind, r + 0.062 in front)
  B.add(archGeo(R.r + 0.125, R.r + 0.205, 0.1, Math.PI - 0.1, R.w + 0.14), { p: [R.x, R.y, R.z], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', mirror: true, tag: 'fender' });
  B.add(archGeo(F.r + 0.08, F.r + 0.145, 0.35, Math.PI - 0.35, F.w + 0.12), { p: [F.x, F.y, F.z], ...M.paint, c: pal.paint, bone: 'chassis', mirror: true, tag: 'fender' });
  // front bumper + skid plate, tail lights
  B.add(tube([[-0.5, 0.42, 0.9], [-0.4, 0.4, 1.5], [0.4, 0.4, 1.5], [0.5, 0.42, 0.9]], 0.06, { rs: 8 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'bumper' });
  B.add(rbox(0.8, 0.05, 0.5, 0.02), { p: [0, 0.27, 1.25], ...M.steel, c: '#59607a', bone: 'chassis', tag: 'skid' });
  addTailLight(B, 0.4, 0.62, -1.3, { w: 0.13, h: 0.09 });
  B.add(rbox(0.9, 0.02, 1.9, 0.01), { p: [0, 0.2, -0.1], ...M.glow(2.2), c: pal.accent, bone: 'chassis', tag: 'glow' });
  // whip antenna with a pennant (two springy bones)
  const ax = 0.58, ay = 0.94, az = -1.28;
  rig.add('flag1', 'chassis', [ax, ay, az]);
  rig.add('flag2', 'flag1', [ax, ay + 0.5, az - 0.04]);
  B.add(tube([[ax, ay, az], [ax, ay + 0.25, az - 0.01], [ax, ay + 0.5, az - 0.04]], 0.012, { rs: 4, seg: 3 }), { ...M.chrome, c: CHROME, bone: 'flag1', tag: 'flag' });
  B.add(tube([[ax, ay + 0.5, az - 0.04], [ax, ay + 0.72, az - 0.08], [ax, ay + 0.94, az - 0.14]], 0.009, { rs: 4, seg: 3 }), { ...M.chrome, c: CHROME, bone: 'flag2', tag: 'flag' });
  B.add(extrude([[0, 0], [0, 0.2], [-0.34, 0.1]], 0.02, { bevel: 0.004, bs: 1 }), { p: [ax, ay + 0.74, az - 0.1], r: [0, Math.PI / 2, 0], ...M.cloth, c: pal.accent, bone: 'flag2', tag: 'flag', ao: 0 });
  steeringAssembly(B, pal, S.steer, 0.32);
  const W = S.wheels;
  addWheel(B, pal, { ...W.FL, bone: 'wheelFL', bm: 'wheelFR', hub: 'disc', rim: pal.accent, lugs: 10, lugH: 0.07, lugW: 0.1 });
  addWheel(B, pal, { ...W.RL, bone: 'wheelRL', bm: 'wheelRR', hub: 'disc', rim: pal.accent, lugs: 14, lugH: 0.12, lugW: 0.17, sidewall: 0.5 });
  return { ...S, mounts: { exhaustL: S.exhaust[0], exhaustR: S.exhaust[1] }, secondary: [{ bone: 'flag1', kind: 'ant', amp: 1.0, k: 55, c: 3 }, { bone: 'flag2', kind: 'ant', amp: 1.6, k: 45, c: 2.6 }] };
}

// ------------------------------------------------------------------------------------------------ CRUSHER (heavy bruiser)
export const CRUSHER = {
  id: 'crusher',
  wheels: { FL: { x: 0.94, y: 0.5, z: 1.0, r: 0.5, w: 0.42 }, RL: { x: 0.98, y: 0.52, z: -0.94, r: 0.52, w: 0.46 } },
  seat: { x: 0, y: 0.68, z: -0.16 },
  steer: { pos: [0, 1.04, 0.36], axis: [0, 0.58, -0.81], radius: 0.2 },
  exhaust: [[0.64, 1.68, -0.92], [-0.64, 1.68, -0.92]],
  size: { length: 3.1, width: 2.4, height: 1.8 },
};

function buildCrusher(B, rig, pal) {
  const S = CRUSHER;
  // heavy tub + armoured sides
  B.add(rbox(1.34, 0.38, 2.5, 0.1, 2), { p: [0, 0.48, -0.1], ...M.steel, c: '#3a4054', bone: 'chassis', tag: 'tub' });
  B.add(loft([
    { z: 0.3, hw: 0.64, y0: 0.5, y1: 1.0, n: 6 }, { z: 0.9, hw: 0.62, y0: 0.5, y1: 0.94, n: 6 }, { z: 1.35, hw: 0.52, y0: 0.5, y1: 0.82, n: 5 }, { z: 1.62, hw: 0.36, y0: 0.52, y1: 0.72, n: 4 },
  ]), { ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'hood' });
  for (const [z, w] of [[0.5, 0.9], [-0.55, 0.7]]) B.add(rbox(0.1, 0.5, w, 0.03, 1), { p: [0.72, 0.72, z], ...M.panel, c: '#3a4054', bone: 'chassis', mirror: true, tag: 'plate' });
  for (const z of [0.15, 0.45, 0.75, 1.0]) B.add(sph(0.035, 6, 5), { p: [0.78, 0.82, z], ...M.chrome, c: CHROME, bone: 'chassis', mirror: true, tag: 'rivet' });
  addSeat(B, pal, { y: 0.52, z: -0.2, w: 0.7 });
  // engine bay + rear cover
  B.add(rbox(1.0, 0.46, 0.6, 0.1, 1), { p: [0, 0.76, -1.05], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', tag: 'cover' });
  B.add(rbox(0.8, 0.16, 0.5, 0.05), { p: [0, 1.05, -1.04], ...M.steel, c: '#59607a', bone: 'chassis', tag: 'cover' });
  // exhaust stacks (tall chrome pipes) behind the seat
  addStack(B, 0.64, 0.7, 1.68, -0.92, { r: 0.075 });
  // bull bar + grille
  B.add(rbox(0.9, 0.34, 0.12, 0.04, 1), { p: [0, 0.66, 1.58], ...M.plastic, c: '#15171f', bone: 'chassis', tag: 'grille' });
  for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) B.add(box(0.025, 0.28, 0.03), { p: [x, 0.66, 1.65], ...M.chrome, c: CHROME, bone: 'chassis', tag: 'grille' });
  B.add(tube([[-0.56, 0.5, 1.26], [-0.56, 0.62, 1.72], [0.56, 0.62, 1.72], [0.56, 0.5, 1.26]], 0.06, { rs: 8 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'bullbar' });
  for (const x of [-0.36, 0, 0.36]) B.add(tube([[x, 0.48, 1.7], [x, 0.78, 1.76], [x, 1.05, 1.62]], 0.045, { rs: 7, seg: 4 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'bullbar' });
  B.add(tube([[-0.46, 1.02, 1.64], [0.46, 1.02, 1.64]], 0.05, { rs: 7, seg: 3 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'bullbar' });
  // hazard stripes on the bumper bar plate
  B.add(rbox(1.2, 0.1, 0.22, 0.03), { p: [0, 0.4, 1.6], ...M.panel, cf: (x) => (Math.floor(x * 9) % 2 === 0 ? pal.accent : '#15171f'), bone: 'chassis', tag: 'hazard' });
  // big round headlights
  addHeadlight(B, pal, 0.4, 0.82, 1.5, { r: 0.12, yaw: 0.1, emit: 3.2 });
  addTailLight(B, 0.42, 0.76, -1.36, { w: 0.2, h: 0.1 });
  // roll hoop behind the driver
  B.add(tube([[0.7, 0.7, -0.62], [0.66, 1.62, -0.64], [0, 1.74, -0.66], [-0.66, 1.62, -0.64], [-0.7, 0.7, -0.62]], 0.055, { rs: 8, seg: 6 }), { ...M.chrome, c: CHROME, bone: 'chassis', tag: 'cage' });
  B.add(rbox(1.0, 0.12, 0.1, 0.04, 1), { p: [0, 1.5, -0.64], ...M.panel, c: pal.paint, bone: 'chassis', tag: 'cage' });
  B.add(rbox(0.96, 0.02, 2.2, 0.01), { p: [0, 0.24, -0.1], ...M.glow(2.2), c: pal.accent, bone: 'chassis', tag: 'glow' });
  steeringAssembly(B, pal, S.steer, 0.3);
  // fender plates over the wheels
  const R = S.wheels.RL, F = S.wheels.FL;
  // (lug tips reach r + 0.088, so the plates sit 0.02 above them)
  B.add(archGeo(R.r + 0.11, R.r + 0.19, 0.15, Math.PI - 0.15, R.w + 0.1), { p: [R.x, R.y, R.z], ...M.paint, c: pal.paint, decal: true, bone: 'chassis', mirror: true, tag: 'fender' });
  B.add(archGeo(F.r + 0.11, F.r + 0.19, 0.3, Math.PI - 0.3, F.w + 0.1), { p: [F.x, F.y, F.z], ...M.paint, c: pal.paint, bone: 'chassis', mirror: true, tag: 'fender' });
  const W = S.wheels;
  addWheel(B, pal, { ...W.FL, bone: 'wheelFL', bm: 'wheelFR', hub: 'disc', rim: '#59607a', lugs: 12, lugH: 0.1, lugW: 0.15, band: pal.accent });
  addWheel(B, pal, { ...W.RL, bone: 'wheelRL', bm: 'wheelRR', hub: 'disc', rim: '#59607a', lugs: 12, lugH: 0.1, lugW: 0.16, band: pal.accent });
  return { ...S, mounts: { exhaustL: S.exhaust[0], exhaustR: S.exhaust[1] } };
}

// ------------------------------------------------------------------------------------------------ registry
export const BODIES = {
  classic: { spec: CLASSIC, build: buildClassic },
  streak: { spec: STREAK, build: buildStreak },
  hopper: { spec: HOPPER, build: buildHopper },
  crusher: { spec: CRUSHER, build: buildCrusher },
};

/** Register the bones every kart needs (positions are model-space bind positions). */
export function addCoreBones(rig, spec) {
  const W = spec.wheels;
  const fl = W.FL, rl = W.RL ?? W.FL;
  rig.add('root', null, [0, 0, 0]);
  rig.add('chassis', 'root', [0, 0, 0]);
  rig.add('steerFL', 'root', [fl.x, fl.y, fl.z]);
  rig.add('steerFR', 'root', [-fl.x, fl.y, fl.z]);
  rig.add('wheelFL', 'steerFL', [fl.x, fl.y, fl.z]);
  rig.add('wheelFR', 'steerFR', [-fl.x, fl.y, fl.z]);
  rig.add('wheelRL', 'root', [rl.x, rl.y, rl.z]);
  rig.add('wheelRR', 'root', [-rl.x, rl.y, rl.z]);
  rig.add('steerWheel', 'chassis', spec.steer.pos);
}
