// The eight drivers. OWNER: Agent C (visuals).
// Every driver is built from a shared humanoid base (hip / torso / head / two 2-bone arms bound to the steering wheel) plus species
// features (ears, tails, beak, antenna ...).  A builder bakes parts into the kart's PartBuilder (rigid-bound to bones) and returns
// { head: {center, radii}, face, secondary: [...], eyes: ... } which KartVisuals uses to attach the face decal and drive secondary motion.
import * as THREE from 'three';
import { rbox, sph, cyl, cone, capsule, torus, tube, lathe, loft, extrude, DEG, toColor } from './build.js';
import { M, CHROME, STEEL, DARK, RUBBER } from './bodies.js';

const _Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mid = new THREE.Vector3();
const _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _m4 = new THREE.Matrix4();

/** Darken / lighten helper returning a THREE.Color (linear). */
export function shade(c, k) { const o = toColor(c).clone(); o.multiplyScalar(k); return o; }
export function mixc(a, b, t) { return toColor(a).clone().lerp(toColor(b), t); }

/** Capsule limb between two model-space points. */
export function limb(B, A, Bp, r, o = {}) {
  _a.set(A[0], A[1], A[2]); _b.set(Bp[0], Bp[1], Bp[2]);
  _mid.copy(_a).add(_b).multiplyScalar(0.5);
  const d = _b.clone().sub(_a); const len = d.length();
  _q.setFromUnitVectors(_Y, d.normalize());
  _m4.compose(_mid, _q, _one);
  B.add(capsule(r, Math.max(0.001, len - 2 * r), 2, 8), { ...o, m: _m4.clone(), p: undefined, r: undefined });
}
/** Ellipsoid at p. */
export function ell(B, p, rad, o = {}) { const [ws, hs] = o.seg ?? [16, 10]; B.add(sph(1, ws, hs), { ...o, p, s: rad }); }

/**
 * Shared skeleton + torso + arms.
 * @param {object} ctx { B, rig, pal, body }
 * @param {object} o   { torso: {c, rad, dy}, arm: {c, r, glove, gloveR}, shoulderX, neckDy }
 * @returns geometry anchors used by species builders
 */
export function humanoidBase(ctx, o = {}) {
  const { B, rig, body } = ctx;
  const S = body.seat;
  const hip = [S.x, S.y, S.z];
  const waist = [S.x, S.y + 0.06, S.z];
  const neckDy = o.neckDy ?? 0.58;
  const neck = [S.x, S.y + neckDy, S.z + 0.02];
  const shX = o.shoulderX ?? 0.3;
  const sh = [[S.x + shX, S.y + 0.44, S.z + 0.02], [S.x - shX, S.y + 0.44, S.z + 0.02]];
  const st = body.steer;
  const grip = [[st.pos[0] + st.radius * 0.95, st.pos[1], st.pos[2]], [st.pos[0] - st.radius * 0.95, st.pos[1], st.pos[2]]];
  const elbow = sh.map((s, i) => {
    const side = i === 0 ? 1 : -1;
    const g = grip[i];
    return [(s[0] + g[0]) / 2 + side * 0.07, (s[1] + g[1]) / 2 - 0.12, (s[2] + g[2]) / 2 - 0.02];
  });
  rig.add('hip', 'chassis', hip);
  rig.add('torso', 'hip', waist);
  rig.add('head', 'torso', neck);
  const names = ['L', 'R'];
  const lens = [];
  for (let i = 0; i < 2; i++) {
    const dU = _b.set(...elbow[i]).sub(_a.set(...sh[i]));
    const dF = new THREE.Vector3(...grip[i]).sub(new THREE.Vector3(...elbow[i]));
    rig.add('arm' + names[i], 'torso', sh[i], { aim: dU.toArray() });
    rig.add('fore' + names[i], 'arm' + names[i], elbow[i], { aim: dF.toArray() });
    lens.push([dU.length(), dF.length()]);
  }
  // torso
  const t = o.torso ?? {};
  const tr = t.rad ?? [0.33, 0.3, 0.28];
  const tc = [S.x, S.y + 0.33 + (t.dy ?? 0), S.z + 0.01];
  ell(B, tc, tr, { ...(t.mat ?? M.cloth), c: t.c ?? '#3a4a7a', bone: 'torso', cf: t.cf, seg: [20, 14], tag: 'torso' });
  // pelvis / lap (hidden mostly by the seat) so the driver never floats
  ell(B, [S.x, S.y + 0.08, S.z + 0.04], [0.3, 0.17, 0.28], { ...M.cloth, c: o.pelvis ?? t.c ?? '#3a4a7a', bone: 'hip' });
  // arms: upper arm (aimed bone) + forearm + mitt
  const a = o.arm ?? {};
  for (let i = 0; i < 2; i++) {
    const n = names[i];
    ell(B, sh[i], [a.r ?? 0.1, a.r ?? 0.1, a.r ?? 0.1], { ...(a.mat ?? M.cloth), c: a.c ?? '#3a4a7a', bone: 'arm' + n });
    limb(B, sh[i], elbow[i], a.r ?? 0.088, { ...(a.mat ?? M.cloth), c: a.c ?? '#3a4a7a', bone: 'arm' + n });
    limb(B, elbow[i], grip[i], (a.r ?? 0.088) * 0.92, { ...(a.mat ?? M.cloth), c: a.c ?? '#3a4a7a', bone: 'fore' + n });
    ell(B, grip[i], [a.gloveR ?? 0.1, a.gloveR ?? 0.1, a.gloveR ?? 0.1], { ...M.gloss, c: a.glove ?? '#ff9a1f', bone: 'fore' + n });
  }
  return { hip, waist, neck, sh, elbow, grip, lens, tc, tr };
}

const _Z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3(), _p = new THREE.Vector3(), _qq = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _s1 = new THREE.Vector3(1, 1, 1);
/**
 * Place a part on an ellipsoid surface (centre c, radii rad) at azimuth `az` (rad, + = kart left) and elevation `el`.
 * The part's local +Y (or +Z with o.axis === 'z') is aligned with the outward normal; o.out lifts it off the surface,
 * o.roll spins it about the normal, o.sc scales it.
 */
export function onSurface(B, geo, c, rad, az, el, o = {}) {
  const ce = Math.cos(el), dx = Math.sin(az) * ce, dy = Math.sin(el), dz = Math.cos(az) * ce;
  _n.set(dx / rad[0], dy / rad[1], dz / rad[2]).normalize();
  _p.set(c[0] + rad[0] * dx, c[1] + rad[1] * dy, c[2] + rad[2] * dz).addScaledVector(_n, o.out ?? 0);
  _qq.setFromUnitVectors(o.axis === 'z' ? _Z : _Y, _n);
  if (o.roll) { _qr.setFromAxisAngle(o.axis === 'z' ? _Z : _Y, o.roll); _qq.multiply(_qr); }
  const sc = o.sc ?? 1;
  _s1.set(...(typeof sc === 'number' ? [sc, sc, sc] : sc));
  _m4.compose(_p, _qq, _s1);
  B.add(geo, { ...o, m: _m4.clone(), p: undefined, r: undefined, s: undefined });
}

/** Racing helmet cap (partial sphere + rim band), tilted back so the face stays open. */
export function addHelmet(ctx, c, o = {}) {
  const { B } = ctx;
  const R = o.r ?? [0.51, 0.48, 0.5];
  const tilt = o.tilt ?? -0.5;
  const theta = o.theta ?? 1.41;
  const stripe = o.stripe ?? null;
  const dy = o.dy ?? 0.03, dz = o.dz ?? -0.04;
  const cap = new THREE.SphereGeometry(1, 26, 14, 0, Math.PI * 2, 0, theta);
  const col = o.c ?? '#ffffff';
  const cf = stripe ? (x, y, z) => (Math.abs(x - c[0]) < (o.stripeW ?? 0.065) ? stripe : col) : undefined;
  B.add(cap, { p: [c[0], c[1] + dy, c[2] + dz], r: [tilt, 0, 0], s: R, ...M.paint, c: col, cf, bone: 'head', ao: 0.25, tag: 'helmet' });
  // rim band around the opening
  const rr = Math.sin(theta);
  B.add(torus(1, 0.055, 6, 28), {
    p: [c[0], c[1] + dy + Math.cos(theta) * R[1] * Math.cos(tilt), c[2] + dz + Math.cos(theta) * R[1] * Math.sin(tilt)],
    r: [Math.PI / 2 + tilt, 0, 0], s: [R[0] * rr * 1.0, R[2] * rr * 1.0, 0.7], ...M.gloss, c: o.rim ?? '#ff9a1f', bone: 'head', ao: 0.25, tag: 'helmet',
  });
  return { R, tilt, theta, center: [c[0], c[1] + dy, c[2] + dz] };
}

/** Goggles resting on the front of the helmet shell. */
export function addGoggles(ctx, helmet, o = {}) {
  const { B } = ctx;
  const { R, center } = helmet;
  const az = o.az ?? 0.34, el = o.el ?? 0.95;
  for (const s of [-1, 1]) {
    onSurface(B, torus(0.1, 0.027, 6, 14), center, R, s * az, el, { axis: 'z', out: 0.012, ...M.chrome, c: o.frame ?? CHROME, bone: 'head', tag: 'goggles' });
    onSurface(B, cyl(0.093, 0.093, 0.026, 14), center, R, s * az, el, { out: 0.01, ...M.glow(o.glow ?? 0.9), c: o.lens ?? '#ff9a1f', bone: 'head', tag: 'goggles' });
  }
  onSurface(B, rbox(0.12, 0.05, 0.05, 0.02, 1), center, R, 0, el + 0.02, { axis: 'z', out: 0.012, ...M.chrome, c: o.frame ?? CHROME, bone: 'head', tag: 'goggles' });
}

// ------------------------------------------------------------------------------------------------ PIP (penguin)
function buildPip(ctx) {
  const { B, rig, pal, colors } = ctx;
  const navy = shade(colors.primary, 0.34);
  const base = humanoidBase(ctx, {
    torso: { c: navy, rad: [0.34, 0.3, 0.29] },
    arm: { c: navy, r: 0.09, glove: colors.accent, gloveR: 0.098, mat: M.fur },
  });
  const S = ctx.body.seat;
  // white belly + harness straps
  ell(B, [S.x, S.y + 0.31, S.z + 0.13], [0.23, 0.26, 0.2], { ...M.fur, c: colors.secondary, bone: 'torso', tag: 'belly' });
  // head
  const hc = [S.x, S.y + 0.92, S.z + 0.04];
  const rad = [0.5, 0.46, 0.47];
  ell(B, hc, rad, { ...M.fur, c: navy, bone: 'head', ao: 0.4, seg: [26, 18], tag: 'head' });
  // beak: two flattened cones
  B.add(cone(0.17, 0.34, 16), { p: [hc[0], hc[1] - 0.075, hc[2] + rad[2] + 0.04], r: [Math.PI / 2, 0, 0], s: [1.35, 1, 0.62], ...M.gloss, c: colors.accent, bone: 'head', ao: 0.5, tag: 'beak' });
  B.add(cone(0.13, 0.26, 16), { p: [hc[0], hc[1] - 0.14, hc[2] + rad[2] - 0.02], r: [Math.PI / 2, 0, 0], s: [1.25, 1, 0.5], ...M.gloss, c: shade(colors.accent, 0.78), bone: 'head', ao: 0.5, tag: 'beak' });
  // helmet + goggles (white shell, blue stripe, orange rim)
  const helmet = addHelmet(ctx, hc, { c: colors.secondary, stripe: colors.primary, rim: colors.accent });
  addGoggles(ctx, helmet, { lens: colors.accent, frame: CHROME });
  // stubby tail wedge (wags)
  rig.add('tail1', 'hip', [S.x, S.y + 0.22, S.z - 0.42]);
  B.add(cone(0.12, 0.26, 12), { p: [S.x, S.y + 0.2, S.z - 0.52], r: [-Math.PI / 2 - 0.4, 0, 0], s: [1.4, 1, 0.6], ...M.fur, c: navy, bone: 'tail1' });
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'tail1', kind: 'tail', amp: 0.35 }], faceOffset: 1.014 };
}

export const DRIVER_BUILDERS = { pip: buildPip };
export function hasDriver(id) { return !!DRIVER_BUILDERS[id]; }
export function buildDriver(driverId, ctx) {
  const f = DRIVER_BUILDERS[driverId] ?? DRIVER_BUILDERS.pip;
  return f(ctx);
}
