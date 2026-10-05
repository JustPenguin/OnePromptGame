// The four kart bodies. OWNER: Agent C (visuals).
//   classic  - go-kart racer: nose cone, side pods, bucket seat, engine cover, little wing
//   streak   - low wedge GT with a big rear wing
//   hopper   - chunky buggy: knobbly oversized rear tyres, roll bar, coil springs, whip-flag
//   crusher  - heavy bruiser: bull-bar, exhaust stacks, armour plates
// Each builder bakes its parts into the shared PartBuilder `B` (bone names resolved through `rig`) and returns a spec
// that the driver builder + animation code use: wheel layout, seat/steering positions, effect mount points.
// Model space: +Z forward, +X = kart LEFT, Y up, origin on the ground at the kart centre.
import * as THREE from 'three';
import { rbox, box, sph, cyl, cone, capsule, torus, tube, lathe, loft, extrude, DEG } from './build.js';

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
      B.add(rbox(w * 0.36, lh * 1.5, o.lugW ?? r * 0.17, lh * 0.4, 1), { p: [x + stagger * w, y + cy, z + cz], r: [a, 0, 0], ...mir, ...M.rubber, c: '#23252c', ao: 0.5, tag: 'lugs' });
    }
  }
  // hub / rim on the outer side (+X for the left wheel)
  const out = hw - 0.012;
  const hubR = r * 0.62;
  if (o.hub === 'disc') {
    B.add(lathe([[0, out - 0.05], [hubR * 0.4, out - 0.04], [hubR * 0.62, out - 0.012], [hubR, out - 0.02], [hubR * 1.02, out - 0.07]], 22), { ...common, ...M.steel, c: hubCol, ao: 0.5, tag: 'hub' });
    B.add(sph(hubR * 0.2, 10, 6), { p: [x + out, y, z], s: [0.5, 1, 1], ...mir, ...M.chrome, c: CHROME, tag: 'hub' });
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

// ------------------------------------------------------------------------------------------------ registry
export const BODIES = {
  classic: { spec: CLASSIC, build: buildClassic },
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
