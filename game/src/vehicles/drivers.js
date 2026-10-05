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

// ------------------------------------------------------------------------------------------------ shared species helpers
/** Surface point + outward normal on an ellipsoid (centre c, radii rad) at azimuth az (+ = kart left), elevation el. */
function surfFrame(c, rad, az, el, out = 0) {
  const ce = Math.cos(el), dx = Math.sin(az) * ce, dy = Math.sin(el), dz = Math.cos(az) * ce;
  const n = new THREE.Vector3(dx / rad[0], dy / rad[1], dz / rad[2]).normalize();
  const p = new THREE.Vector3(c[0] + rad[0] * dx, c[1] + rad[1] * dy, c[2] + rad[2] * dz).addScaledVector(n, out);
  return { p, n };
}
/** Matrix placing a part whose +Y axis should point along `dir` at p. */
function aimMatrix(p, dir, scale = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, dir.clone().normalize());
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(p, q, s);
}
/** Translate a cone/cylinder so its BASE sits at the origin and it points along +Y. */
function baseUp(geo, h) { geo.translate(0, h / 2, 0); return geo; }

/**
 * A pair of ears growing out of a reference ellipsoid (usually the helmet shell).  Adds bones earL / earR (springy).
 * o: { az, el, r, h, sides, c, inner, tip, splay, lift, back, round }
 */
function addEars(ctx, ref, o) {
  const { B, rig } = ctx;
  for (const [side, name] of [[1, 'earL'], [-1, 'earR']]) {
    const f = surfFrame(ref.center, ref.R, side * o.az, o.el, -0.035);
    const d = f.n.clone().add(new THREE.Vector3(side * (o.splay ?? 0.3), o.lift ?? 0.55, o.back ?? -0.12)).normalize();
    rig.add(name, 'head', f.p.toArray());
    if (o.round) {
      const c2 = f.p.clone().addScaledVector(d, o.r * 0.5);
      B.add(sph(1, 14, 9), { m: aimMatrix(c2, d, [o.r, o.r * 0.82, o.r]), ...M.fur, c: o.c, bone: name, tag: 'ear' });
      const c3 = c2.clone().addScaledVector(d, o.r * 0.18).add(new THREE.Vector3(side * -0.01, 0, 0.045));
      B.add(sph(1, 12, 8), { m: aimMatrix(c3, d, [o.r * 0.66, o.r * 0.3, o.r * 0.66]), ...M.fur, c: o.inner ?? o.c, bone: name, tag: 'ear' });
      continue;
    }
    B.add(baseUp(cone(o.r, o.h, o.sides ?? 8), o.h), { m: aimMatrix(f.p, d), ...M.fur, c: o.c, bone: name, tag: 'ear' });
    const pin = f.p.clone().add(new THREE.Vector3(0, 0.0, 0.04));
    B.add(baseUp(cone(o.r * 0.66, o.h * 0.82, o.sides ?? 8), o.h * 0.82), { m: aimMatrix(pin, d, [1, 1, 0.5]), ...M.fur, c: o.inner ?? o.c, bone: name, tag: 'ear' });
    if (o.tip) {
      const pt = f.p.clone().addScaledVector(d, o.h * 0.7);
      B.add(baseUp(cone(o.r * 0.32, o.h * 0.31, o.sides ?? 8), o.h * 0.31), { m: aimMatrix(pt, d), ...M.fur, c: o.tip, bone: name, tag: 'ear' });
    }
  }
}

/**
 * Chain of tail segments between model-space points, each segment bound to its own bone (prefix1, prefix2, ...), parented
 * in sequence under `parent`.  radii[i] / colors[i] describe segment i.  Shape 'cap' = capsule, otherwise a stretched ellipsoid.
 */
function addChain(ctx, prefix, parent, pts, radii, colors, o = {}) {
  const { B, rig } = ctx;
  for (let i = 0; i < pts.length - 1; i++) {
    const name = prefix + (i + 1);
    rig.add(name, i === 0 ? parent : prefix + i, pts[i]);
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const dir = b.clone().sub(a), len = dir.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const r = radii[i];
    const rz = Array.isArray(r) ? r : [r, r];
    if (o.shape === 'cap') B.add(capsule(rz[0], Math.max(0.01, len - 2 * rz[0]), 2, 8), { m: aimMatrix(mid, dir), ...M.fur, c: colors[i], bone: name, tag: prefix });
    else B.add(sph(1, 14, 9), { m: aimMatrix(mid, dir, [rz[0], len * 0.62, rz[1]]), ...M.fur, c: colors[i], bone: name, tag: prefix });
  }
}

/** Add whiskers (thin tubes) fanning out from a cheek point. */
function addWhiskers(ctx, hc, rad, o = {}) {
  const { B } = ctx;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const el = (-0.02 + (k - 1) * 0.14), az = s * (0.88 + k * 0.03);
      const f = surfFrame(hc, rad, az, el, 0);
      const out = new THREE.Vector3(s * 1, (k - 1) * 0.16, 0.22).normalize();
      const e = f.p.clone().addScaledVector(out, o.len ?? 0.36);
      e.y += (k - 1) * 0.03;
      B.add(tube([f.p.toArray(), f.p.clone().addScaledVector(out, (o.len ?? 0.36) * 0.5).add(new THREE.Vector3(0, 0.02, 0)).toArray(), e.toArray()], o.r ?? 0.009, { rs: 4, seg: 3, caps: true }), { ...M.plastic, c: o.c ?? '#eaf6ff', bone: 'head', tag: 'whisker', ao: 0 });
    }
  }
}

// ------------------------------------------------------------------------------------------------ RUSTY (fox)
function buildRusty(ctx) {
  const { B, rig, colors } = ctx;
  const orange = colors.primary, cream = colors.secondary, dark = colors.accent;
  humanoidBase(ctx, { torso: { c: orange, rad: [0.33, 0.3, 0.28] }, arm: { c: orange, r: 0.088, glove: dark, gloveR: 0.1, mat: M.fur } });
  const S = ctx.body.seat;
  ell(B, [S.x, S.y + 0.3, S.z + 0.12], [0.21, 0.25, 0.2], { ...M.fur, c: cream, bone: 'torso', tag: 'belly' });
  const hc = [S.x, S.y + 0.92, S.z + 0.04], rad = [0.5, 0.45, 0.47];
  ell(B, hc, rad, { ...M.fur, c: orange, bone: 'head', ao: 0.4, seg: [26, 18], tag: 'head' });
  ell(B, [hc[0], hc[1] - 0.1, hc[2] + rad[2] * 0.78], [0.17, 0.145, 0.27], { ...M.fur, c: cream, bone: 'head', tag: 'snout' });
  ell(B, [hc[0], hc[1] - 0.04, hc[2] + rad[2] * 0.78 + 0.265], [0.068, 0.052, 0.058], { ...M.gloss, c: '#15110e', bone: 'head', tag: 'snout' });
  for (const s of [-1, 1]) ell(B, [hc[0] + s * 0.34, hc[1] - 0.14, hc[2] + 0.15], [0.17, 0.14, 0.18], { ...M.fur, c: cream, bone: 'head', tag: 'cheek' });
  const helmet = addHelmet(ctx, hc, { c: dark, stripe: orange, rim: orange });
  addGoggles(ctx, helmet, { lens: '#ffd9a0', frame: CHROME, glow: 0.8 });
  const ref = { center: helmet.center, R: helmet.R };
  addEars(ctx, ref, { az: 0.78, el: 0.62, r: 0.17, h: 0.44, sides: 8, c: orange, inner: cream, tip: dark, splay: 0.28, lift: 0.7, back: -0.2 });
  // bushy tail: 3 springy segments, cream tip
  const tb = [S.x, S.y + 0.2, S.z - 0.5];
  addChain(ctx, 'tail', 'hip', [tb, [S.x, S.y + 0.36, S.z - 0.78], [S.x, S.y + 0.66, S.z - 0.98], [S.x, S.y + 0.98, S.z - 1.04]], [[0.15, 0.15], [0.19, 0.19], [0.17, 0.17]], [orange, orange, cream]);
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'earL', kind: 'ear', amp: 0.9, side: 1 }, { bone: 'earR', kind: 'ear', amp: 0.9, side: -1 }, { bone: 'tail1', kind: 'tail', amp: 0.55, freq: 5.5, k: 55, c: 4.4 }, { bone: 'tail2', kind: 'tail', amp: 0.7, freq: 5.5, k: 50, c: 4 }, { bone: 'tail3', kind: 'tail', amp: 0.8, freq: 5.5, k: 46, c: 3.6 }], faceOffset: 1.014 };
}

// ------------------------------------------------------------------------------------------------ BRUNO (bear)
function buildBruno(ctx) {
  const { B, rig, colors } = ctx;
  const brown = colors.primary, tan = colors.secondary, gold = colors.accent;
  humanoidBase(ctx, { shoulderX: 0.34, torso: { c: brown, rad: [0.4, 0.34, 0.32] }, arm: { c: brown, r: 0.108, glove: gold, gloveR: 0.118, mat: M.fur } });
  const S = ctx.body.seat;
  ell(B, [S.x, S.y + 0.3, S.z + 0.13], [0.28, 0.27, 0.22], { ...M.fur, c: tan, bone: 'torso', tag: 'belly' });
  const hc = [S.x, S.y + 0.94, S.z + 0.04], rad = [0.53, 0.48, 0.5];
  ell(B, hc, rad, { ...M.fur, c: brown, bone: 'head', ao: 0.4, seg: [26, 18], tag: 'head' });
  ell(B, [hc[0], hc[1] - 0.12, hc[2] + 0.4], [0.2, 0.155, 0.17], { ...M.fur, c: tan, bone: 'head', tag: 'snout' });
  ell(B, [hc[0], hc[1] - 0.045, hc[2] + 0.55], [0.07, 0.05, 0.045], { ...M.gloss, c: '#1a0e08', bone: 'head', tag: 'snout' });
  const helmet = addHelmet(ctx, hc, { c: gold, stripe: brown, rim: brown, r: [0.55, 0.51, 0.53] });
  addGoggles(ctx, helmet, { lens: '#ffb44a', frame: shade(brown, 1.3), glow: 0.8 });
  addEars(ctx, { center: helmet.center, R: helmet.R }, { az: 0.92, el: 0.55, r: 0.14, round: true, c: brown, inner: tan, splay: 0.4, lift: 0.3, back: -0.1 });
  rig.add('tail1', 'hip', [S.x, S.y + 0.12, S.z - 0.5]);
  ell(B, [S.x, S.y + 0.14, S.z - 0.58], [0.13, 0.13, 0.13], { ...M.fur, c: brown, bone: 'tail1', tag: 'tail' });
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'earL', kind: 'ear', amp: 0.5, side: 1 }, { bone: 'earR', kind: 'ear', amp: 0.5, side: -1 }, { bone: 'tail1', kind: 'tail', amp: 0.5, freq: 6 }], faceOffset: 1.014 };
}

// ------------------------------------------------------------------------------------------------ HOPPER (frog)
function buildHopper(ctx) {
  const { B, rig, colors } = ctx;
  const green = colors.primary, belly = colors.secondary, pink = colors.accent;
  humanoidBase(ctx, { torso: { c: green, rad: [0.31, 0.29, 0.27] }, arm: { c: green, r: 0.078, glove: pink, gloveR: 0.098, mat: M.skin } });
  const S = ctx.body.seat;
  ell(B, [S.x, S.y + 0.3, S.z + 0.11], [0.2, 0.24, 0.18], { ...M.skin, c: belly, bone: 'torso', tag: 'belly' });
  const hc = [S.x, S.y + 0.9, S.z + 0.05], rad = [0.56, 0.4, 0.48];
  ell(B, hc, rad, { ...M.skin, c: green, bone: 'head', ao: 0.4, seg: [26, 16], tag: 'head' });
  // throat pouch
  rig.add('throat', 'head', [hc[0], hc[1] - 0.22, hc[2] + 0.22]);
  ell(B, [hc[0], hc[1] - 0.24, hc[2] + 0.22], [0.26, 0.16, 0.2], { ...M.skin, c: belly, bone: 'throat', tag: 'throat' });
  // bulging eyes with lazy lids
  const eyeR = 0.185;
  for (const [s, lid] of [[1, 'lidL'], [-1, 'lidR']]) {
    const ec = [hc[0] + s * 0.27, hc[1] + 0.3, hc[2] + 0.16];
    ell(B, [ec[0], ec[1] - 0.05, ec[2] - 0.04], [0.22, 0.19, 0.22], { ...M.skin, c: green, bone: 'head', tag: 'socket' });
    ell(B, ec, [eyeR, eyeR, eyeR], { ...M.gloss, c: '#ffffff', bone: 'head', seg: [18, 12], tag: 'eye', ao: 0.15 });
    ell(B, [ec[0] + s * -0.01, ec[1] - 0.005, ec[2] + eyeR * 0.9], [0.095, 0.095, 0.05], { ...M.gloss, c: '#0c1812', bone: 'head', tag: 'pupil', ao: 0 });
    ell(B, [ec[0] + s * 0.02, ec[1] + 0.03, ec[2] + eyeR * 0.98], [0.03, 0.03, 0.02], { ...M.glow(1.2), c: '#ffffff', bone: 'head', tag: 'pupil' });
    rig.add(lid, 'head', ec);
    const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    B.add(cap, { p: ec, s: eyeR * 1.1, r: [-0.45, 0, 0], ...M.skin, c: shade(green, 0.92), bone: lid, tag: 'lid', ao: 0.2 });
  }
  const helmet = addHelmet(ctx, hc, { c: pink, stripe: colors.secondary, rim: shade(pink, 0.8), r: [0.5, 0.4, 0.44], tilt: -0.85, theta: 1.15, dy: -0.02, dz: -0.12 });
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'lidL', kind: 'lid' }, { bone: 'lidR', kind: 'lid' }, { bone: 'throat', kind: 'throat' }], faceOffset: 1.016 };
}

// ------------------------------------------------------------------------------------------------ LUNA (cat)
function buildLuna(ctx) {
  const { B, rig, colors } = ctx;
  const violet = colors.primary, fur = colors.secondary, cyan = colors.accent;
  humanoidBase(ctx, { torso: { c: violet, rad: [0.31, 0.3, 0.27] }, arm: { c: violet, r: 0.082, glove: cyan, gloveR: 0.095, mat: M.cloth } });
  const S = ctx.body.seat;
  // cyan chest stripe
  B.add(rbox(0.06, 0.4, 0.04, 0.02, 1), { p: [S.x, S.y + 0.32, S.z + 0.27], r: [0.1, 0, 0], ...M.gloss, c: cyan, bone: 'torso', tag: 'suit' });
  const hc = [S.x, S.y + 0.92, S.z + 0.04], rad = [0.47, 0.43, 0.45];
  ell(B, hc, rad, { ...M.fur, c: fur, bone: 'head', ao: 0.4, seg: [26, 18], tag: 'head' });
  addWhiskers(ctx, hc, rad, { c: '#dff6ff', len: 0.4 });
  const helmet = addHelmet(ctx, hc, { c: violet, stripe: cyan, rim: cyan });
  addGoggles(ctx, helmet, { lens: cyan, frame: CHROME, glow: 1.4 });
  addEars(ctx, { center: helmet.center, R: helmet.R }, { az: 0.74, el: 0.7, r: 0.17, h: 0.42, sides: 6, c: fur, inner: '#ff8ec4', tip: null, splay: 0.2, lift: 0.75, back: -0.15 });
  // long curling tail
  addChain(ctx, 'tail', 'hip', [[S.x, S.y + 0.18, S.z - 0.5], [S.x + 0.05, S.y + 0.32, S.z - 0.8], [S.x + 0.12, S.y + 0.6, S.z - 0.96], [S.x + 0.1, S.y + 0.92, S.z - 0.95], [S.x - 0.02, S.y + 1.1, S.z - 0.82]], [0.065, 0.062, 0.058, 0.055], [fur, fur, fur, cyan], { shape: 'cap' });
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'earL', kind: 'ear', amp: 0.8, side: 1 }, { bone: 'earR', kind: 'ear', amp: 0.8, side: -1 }, { bone: 'tail1', kind: 'tail', amp: 0.5, freq: 4, k: 60, c: 4.6 }, { bone: 'tail2', kind: 'tail', amp: 0.7, freq: 4, k: 55, c: 4.2 }, { bone: 'tail3', kind: 'tail', amp: 0.8, freq: 4, k: 50, c: 3.8 }, { bone: 'tail4', kind: 'tail', amp: 0.9, freq: 4, k: 46, c: 3.5 }], faceOffset: 1.014 };
}

// ------------------------------------------------------------------------------------------------ GIZMO (robot)
function buildGizmo(ctx) {
  const { B, rig, colors } = ctx;
  const teal = colors.primary, silver = colors.secondary, yellow = colors.accent;
  const S = ctx.body.seat;
  humanoidBase(ctx, { torso: { c: teal, rad: [0.001, 0.001, 0.001], mat: M.gloss }, arm: { c: silver, r: 0.07, glove: yellow, gloveR: 0.1, mat: M.steel } });
  // boxy torso, chest plate with status lights
  B.add(rbox(0.66, 0.56, 0.5, 0.17, 2), { p: [S.x, S.y + 0.33, S.z + 0.01], ...M.paint, c: teal, bone: 'torso', tag: 'torso' });
  B.add(rbox(0.4, 0.28, 0.05, 0.05, 1), { p: [S.x, S.y + 0.34, S.z + 0.27], r: [0.1, 0, 0], ...M.steel, c: silver, bone: 'torso', tag: 'torso' });
  [[-0.11, '#ff5a5a'], [0, yellow], [0.11, '#5affb0']].forEach(([x, c]) => B.add(sph(0.035, 8, 6), { p: [S.x + x, S.y + 0.36, S.z + 0.3], ...M.glow(2.4), c, bone: 'torso', tag: 'lights' }));
  for (const s of [-1, 1]) ell(B, [S.x + s * 0.34, S.y + 0.46, S.z + 0.02], [0.13, 0.13, 0.13], { ...M.steel, c: silver, bone: 'torso', tag: 'shoulder' });
  // neck + head (dome with visor)
  B.add(cyl(0.12, 0.14, 0.14, 12), { p: [S.x, S.y + 0.64, S.z + 0.02], ...M.steel, c: '#59607a', bone: 'torso', tag: 'neck' });
  const hc = [S.x, S.y + 0.92, S.z + 0.04], rad = [0.5, 0.42, 0.46];
  ell(B, hc, rad, { ...M.paint, rough: 0.2, metal: 0.55, c: silver, bone: 'head', ao: 0.3, seg: [26, 18], tag: 'head' });
  // speaker pods + glowing rings
  for (const s of [-1, 1]) {
    B.add(cyl(0.15, 0.15, 0.1, 16), { p: [hc[0] + s * 0.5, hc[1] - 0.02, hc[2]], r: [0, 0, Math.PI / 2], ...M.gloss, c: teal, bone: 'head', tag: 'pod' });
    B.add(torus(0.13, 0.016, 5, 16), { p: [hc[0] + s * 0.555, hc[1] - 0.02, hc[2]], r: [0, Math.PI / 2, 0], ...M.glow(2.2), c: yellow, bone: 'head', tag: 'pod' });
  }
  // dome cap on top
  const cap = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, 1.05);
  B.add(cap, { p: [hc[0], hc[1] + 0.03, hc[2] - 0.05], r: [-0.3, 0, 0], s: [0.53, 0.46, 0.5], ...M.paint, c: teal, bone: 'head', tag: 'cap', ao: 0.25 });
  // antenna (springy two-bone chain) with glowing ball
  const top = [hc[0], hc[1] + 0.43, hc[2] - 0.12];
  rig.add('ant1', 'head', top);
  rig.add('ant2', 'ant1', [top[0], top[1] + 0.16, top[2] - 0.01]);
  B.add(cyl(0.022, 0.026, 0.17, 8), { p: [top[0], top[1] + 0.08, top[2]], ...M.steel, c: '#59607a', bone: 'ant1', tag: 'ant' });
  B.add(cyl(0.016, 0.02, 0.15, 8), { p: [top[0], top[1] + 0.24, top[2] - 0.01], ...M.steel, c: '#59607a', bone: 'ant2', tag: 'ant' });
  B.add(sph(0.07, 10, 8), { p: [top[0], top[1] + 0.34, top[2] - 0.01], ...M.glow(2.6), c: yellow, bone: 'ant2', tag: 'ant' });
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'ant1', kind: 'ant', amp: 0.8, k: 70, c: 3.5 }, { bone: 'ant2', kind: 'ant', amp: 1.2, k: 60, c: 3 }], faceOffset: 1.012 };
}

// ------------------------------------------------------------------------------------------------ ROCCO (rhino)
function buildRocco(ctx) {
  const { B, rig, colors } = ctx;
  const grey = colors.primary, light = colors.secondary, pink = colors.accent;
  humanoidBase(ctx, { shoulderX: 0.36, torso: { c: grey, rad: [0.42, 0.36, 0.34] }, arm: { c: grey, r: 0.112, glove: pink, gloveR: 0.124, mat: M.skin } });
  const S = ctx.body.seat;
  ell(B, [S.x, S.y + 0.3, S.z + 0.14], [0.29, 0.28, 0.22], { ...M.skin, c: light, bone: 'torso', tag: 'belly' });
  const hc = [S.x, S.y + 0.94, S.z + 0.04], rad = [0.55, 0.46, 0.5];
  ell(B, hc, rad, { ...M.skin, c: grey, bone: 'head', ao: 0.4, seg: [26, 18], tag: 'head' });
  ell(B, [hc[0], hc[1] - 0.14, hc[2] + 0.4], [0.31, 0.21, 0.27], { ...M.skin, c: shade(grey, 1.12), bone: 'head', tag: 'snout' });
  for (const s of [-1, 1]) ell(B, [hc[0] + s * 0.1, hc[1] - 0.1, hc[2] + 0.64], [0.04, 0.032, 0.03], { ...M.gloss, c: '#171a24', bone: 'head', tag: 'snout' });
  // horns (ivory)
  const horn = '#f4ecd6';
  B.add(baseUp(cone(0.125, 0.46, 12), 0.46), { m: aimMatrix(new THREE.Vector3(hc[0], hc[1] - 0.06, hc[2] + 0.55), new THREE.Vector3(0, 0.62, 0.78)), ...M.gloss, c: horn, bone: 'head', tag: 'horn', rough: 0.35 });
  B.add(baseUp(cone(0.075, 0.22, 10), 0.22), { m: aimMatrix(new THREE.Vector3(hc[0], hc[1] + 0.1, hc[2] + 0.36), new THREE.Vector3(0, 0.7, 0.55)), ...M.gloss, c: horn, bone: 'head', tag: 'horn', rough: 0.35 });
  const helmet = addHelmet(ctx, hc, { c: pink, stripe: light, rim: shade(pink, 0.7), r: [0.57, 0.52, 0.54], tilt: -0.55 });
  addGoggles(ctx, helmet, { lens: '#ffd0da', frame: '#3b4258', glow: 0.8, az: 0.4 });
  addEars(ctx, { center: helmet.center, R: helmet.R }, { az: 1.0, el: 0.45, r: 0.1, h: 0.17, sides: 8, c: grey, inner: '#d5a0b0', splay: 0.7, lift: 0.1, back: -0.1 });
  addChain(ctx, 'tail', 'hip', [[S.x, S.y + 0.12, S.z - 0.5], [S.x, S.y + 0.3, S.z - 0.78], [S.x, S.y + 0.52, S.z - 0.9]], [0.075, 0.07], [grey, '#3b4258'], { shape: 'cap' });
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'earL', kind: 'ear', amp: 0.45, side: 1 }, { bone: 'earR', kind: 'ear', amp: 0.45, side: -1 }, { bone: 'tail1', kind: 'tail', amp: 0.4, freq: 5, k: 70, c: 5 }, { bone: 'tail2', kind: 'tail', amp: 0.5, freq: 5, k: 60, c: 4.5 }], faceOffset: 1.014 };
}

// ------------------------------------------------------------------------------------------------ QUILL (duck)
function buildQuill(ctx) {
  const { B, rig, colors } = ctx;
  const yellow = colors.primary, cream = colors.secondary, orange = colors.accent;
  humanoidBase(ctx, { shoulderX: 0.27, torso: { c: yellow, rad: [0.3, 0.29, 0.26] }, arm: { c: yellow, r: 0.075, glove: orange, gloveR: 0.09, mat: M.fur } });
  const S = ctx.body.seat;
  ell(B, [S.x, S.y + 0.3, S.z + 0.1], [0.2, 0.24, 0.18], { ...M.fur, c: cream, bone: 'torso', tag: 'belly' });
  const hc = [S.x, S.y + 0.92, S.z + 0.04], rad = [0.49, 0.45, 0.47];
  ell(B, hc, rad, { ...M.fur, c: yellow, bone: 'head', ao: 0.4, seg: [26, 18], tag: 'head' });
  // flat bill: upper + lower
  ell(B, [hc[0], hc[1] - 0.075, hc[2] + 0.5], [0.21, 0.07, 0.27], { ...M.gloss, c: orange, bone: 'head', tag: 'bill' });
  ell(B, [hc[0], hc[1] - 0.145, hc[2] + 0.46], [0.18, 0.05, 0.21], { ...M.gloss, c: shade(orange, 0.8), bone: 'head', tag: 'bill' });
  const helmet = addHelmet(ctx, hc, { c: orange, stripe: yellow, rim: yellow });
  addGoggles(ctx, helmet, { lens: '#fff2a8', frame: CHROME, glow: 1.0 });
  // feather crest poking out of the helmet
  const topf = surfFrame(helmet.center, helmet.R, 0, 1.38, -0.02);
  rig.add('crest1', 'head', topf.p.toArray());
  for (const [k, ang] of [[0, 0], [1, 0.5], [-1, -0.5]]) {
    const d = new THREE.Vector3(Math.sin(ang) * 0.5, 1, -0.55 + Math.abs(ang) * -0.1).normalize();
    B.add(baseUp(cone(0.05, 0.24, 6), 0.24), { m: aimMatrix(topf.p.clone().add(new THREE.Vector3(k * 0.03, 0, 0)), d), ...M.fur, c: yellow, bone: 'crest1', tag: 'crest' });
  }
  // fan tail
  rig.add('tail1', 'hip', [S.x, S.y + 0.2, S.z - 0.46]);
  for (const [k, ang] of [[0, 0], [1, 0.45], [-1, -0.45]]) {
    const d = new THREE.Vector3(Math.sin(ang), 0.75, -0.7).normalize();
    const p = new THREE.Vector3(S.x, S.y + 0.22, S.z - 0.5).addScaledVector(d, 0.2);
    B.add(sph(1, 10, 7), { m: aimMatrix(p, d, [0.07, 0.2, 0.025]), ...M.fur, c: k === 0 ? orange : yellow, bone: 'tail1', tag: 'tail' });
  }
  return { head: { center: hc, radii: rad }, secondary: [{ bone: 'crest1', kind: 'ant', amp: 0.9, k: 90, c: 4 }, { bone: 'tail1', kind: 'tail', amp: 0.7, freq: 7, k: 80, c: 5 }], faceOffset: 1.014 };
}

export const DRIVER_BUILDERS = { pip: buildPip, rusty: buildRusty, bruno: buildBruno, hopper: buildHopper, luna: buildLuna, gizmo: buildGizmo, rocco: buildRocco, quill: buildQuill };
export function hasDriver(id) { return !!DRIVER_BUILDERS[id]; }
export function buildDriver(driverId, ctx) {
  const f = DRIVER_BUILDERS[driverId] ?? DRIVER_BUILDERS.pip;
  return f(ctx);
}
