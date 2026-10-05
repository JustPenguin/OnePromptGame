// Kart + driver visuals. OWNER: Agent C (visuals).
// Contract (keep stable):
//   attachKartVisual(kart, session)  builds kart.visual = { root, update(dt, kart, session), dispose(), ... } and adds it under
//                                    kart.root (positioned/oriented by physics; the model faces +Z, origin on the ground under the kart's centre).
//   createKartShowcase(driverId, bodyId, opts) -> { root, update(dt), dispose(), setPose(name), ... }   for menu turntables / podium.
// Each kart is ONE SkinnedMesh (rigid-bound bones, one patched PBR material, see kartMaterial.js) + one face-decal mesh = 2 draw calls.
// Animation is procedural, driven every frame by kart fields (speed, steerVisual, lean, drift, boost, spin, grounded, race...) and by
// session events, and is allocation-free.  The pose solve is deferred to render time (`flush()`), so fast headless simulation
// (__kart.advance) pays almost nothing for visuals.
import * as THREE from 'three';
import { getDriver } from '../data/roster.js';
import { EV } from '../core/events.js';
import { clamp, damp, lerp } from '../core/math.js';
import { Rig, PartBuilder } from './build.js';
import { BODIES, bodyPalette, addCoreBones } from './bodies.js';
import { buildDriver } from './drivers.js';
import { createKartMaterial } from './kartMaterial.js';
import { getLiveryTexture } from './livery.js';
import { cloneFaceTexture, setFaceFrame, faceGeometry, FACE, FACE_STYLES } from './faces.js';
import { getSharedEnvironment } from '../render/shared.js';

const TAU = Math.PI * 2;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ geometry assets (cached)
const assetCache = new Map();
const ASSET_LIMIT = 40;

/** Build (or fetch) the shared, immutable assets for a driver+body pairing: merged skinned geometry, rig layout, specs. */
export function getKartAssets(driverId, bodyId) {
  const driver = getDriver(driverId);
  const bodyDef = BODIES[bodyId] ?? BODIES.classic;
  const key = `${driver.id}:${bodyDef.spec.id}`;
  let a = assetCache.get(key);
  if (a) { assetCache.delete(key); assetCache.set(key, a); return a; }
  const rig = new Rig();
  addCoreBones(rig, bodyDef.spec);
  const B = new PartBuilder(rig);
  const pal = bodyPalette(driver.colors);
  const body = bodyDef.build(B, rig, pal);
  const drv = buildDriver(driver.id, { B, rig, pal, body, colors: driver.colors });
  const geometry = B.build();
  const faceGeo = faceGeometry(driver.id);
  a = { key, driver, bodyId: bodyDef.spec.id, rig, body, drv, geometry, faceGeo };
  assetCache.set(key, a);
  while (assetCache.size > ASSET_LIMIT) {
    const [oldKey, old] = assetCache.entries().next().value;
    assetCache.delete(oldKey);
    old.geometry.dispose(); old.faceGeo.dispose();
  }
  return a;
}
export function disposeKartAssets() {
  for (const a of assetCache.values()) { a.geometry.dispose(); a.faceGeo.dispose(); }
  assetCache.clear();
}

// ------------------------------------------------------------------------------------------------ small helpers
/** Critically-damped-ish spring (allocation-free). */
class Spring {
  constructor(k = 160, c = 14) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  step(target, dt) {
    // sub-step for stability at large dt
    const n = Math.min(8, Math.ceil(dt / 0.012));
    const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  kick(v) { this.v += v; }
}

let _starTex = null;
function starTexture() {
  if (_starTex) return _starTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  const grad = g.createRadialGradient(0, 0, 2, 0, 0, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,224,90,0.9)'); grad.addColorStop(1, 'rgba(255,200,40,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
  g.fillStyle = '#fff6b0'; g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 19; const a = (i / 10) * TAU - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  _starTex = new THREE.CanvasTexture(c); _starTex.colorSpace = THREE.SRGBColorSpace;
  return _starTex;
}

const MAT_QUALITY = { low: false, medium: false, high: true, ultra: true };

// ------------------------------------------------------------------------------------------------ KartVisual
export class KartVisual {
  /**
   * @param {string} driverId @param {string} bodyId
   * @param {{ kart?: any, session?: any, envMap?: THREE.Texture|null, quality?: string, liveryRes?: number }} [opts]
   */
  constructor(driverId, bodyId, opts = {}) {
    const A = getKartAssets(driverId, bodyId);
    this.assets = A;
    this.driver = A.driver;
    this.kart = opts.kart ?? null;
    this.session = opts.session ?? null;
    this.deferred = false;
    this.pending = 0;
    this.time = Math.random() * 10;
    this.qualityId = opts.quality ?? 'high';
    this.envMap = opts.envMap ?? getSharedEnvironment() ?? null;
    this.ghost = false;
    this._offs = [];

    // ---- scene graph
    this.root = new THREE.Group();
    this.root.name = `kartVisual:${driverId}:${A.bodyId}`;
    this.tilt = new THREE.Group();            // rigid roll / pitch (+ shrink wobble) of the whole kart, pivot on the ground
    this.tilt.rotation.order = 'ZXY';
    this.root.add(this.tilt);

    // ---- bones
    const defs = A.rig.defs;
    this.bones = defs.map((d) => { const b = new THREE.Bone(); b.name = d.name; b.position.fromArray(d.pos); b.quaternion.fromArray(d.quat); return b; });
    this.rest = defs.map((d) => new THREE.Quaternion().fromArray(d.quat));
    this.restPos = defs.map((d) => new THREE.Vector3().fromArray(d.pos));
    defs.forEach((d, i) => { if (d.parent) this.bones[A.rig.index.get(d.parent)].add(this.bones[i]); });
    const I = (n) => A.rig.index.get(n) ?? -1;
    this.i = {
      chassis: I('chassis'), hip: I('hip'), torso: I('torso'), head: I('head'), steerFL: I('steerFL'), steerFR: I('steerFR'),
      wheelFL: I('wheelFL'), wheelFR: I('wheelFR'), wheelRL: I('wheelRL'), wheelRR: I('wheelRR'), steerWheel: I('steerWheel'),
      armL: I('armL'), armR: I('armR'), foreL: I('foreL'), foreR: I('foreR'),
    };
    // secondary-motion chains declared by the driver / body builders
    this.secondary = [];
    for (const s of [...(A.drv.secondary ?? []), ...(A.body.secondary ?? [])]) {
      const bi = I(s.bone);
      if (bi >= 0) this.secondary.push({ ...s, bi, ax: new Spring(s.k ?? 90, s.c ?? 5), az: new Spring(s.k ?? 90, s.c ?? 5), ph: Math.random() * TAU });
    }

    // ---- material + skinned mesh
    this.livery = getLiveryTexture(A.driver, MAT_QUALITY[this.qualityId] ? 1024 : 512);
    this.matHigh = null; this.matStd = null; this.matGhost = null;
    this.mat = this._pickMaterial();
    this.mesh = new THREE.SkinnedMesh(A.geometry, this.mat);
    this.mesh.name = 'kart';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.add(this.bones[0]);
    this.tilt.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton, this.mesh.matrixWorld);

    // ---- face decal (child of the head bone)
    const st = FACE_STYLES[A.driver.id] ?? FACE_STYLES.pip;
    this.faceTex = cloneFaceTexture(A.driver.id);
    setFaceFrame(this.faceTex, FACE.OPEN);
    const fm = new THREE.MeshStandardMaterial({
      map: this.faceTex, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0, envMap: this.envMap, envMapIntensity: 0.55,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    if (st.emissive) { fm.emissive = new THREE.Color(1, 1, 1); fm.emissiveMap = this.faceTex; fm.emissiveIntensity = 1.7; }
    this.faceMat = fm;
    const h = A.drv.head;
    this.face = new THREE.Mesh(A.faceGeo, fm);
    this.face.name = 'face';
    this.face.position.set(h.center[0] - defs[this.i.head].world[0], h.center[1] - defs[this.i.head].world[1], h.center[2] - defs[this.i.head].world[2]);
    const fo = A.drv.faceOffset ?? 1.012;
    this.face.scale.set(h.radii[0] * fo, h.radii[1] * fo, h.radii[2] * fo);
    this.face.renderOrder = 2;
    this.bones[this.i.head].add(this.face);
    this.faceFrame = FACE.OPEN;

    // ---- dizzy stars (shown while spinning / stunned)
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    this.starMat = new THREE.PointsMaterial({ map: starTexture(), size: 0.3, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.visible = false;
    this.stars.position.set(h.center[0], h.center[1] + h.radii[1] * 1.15, h.center[2]);
    this.tilt.add(this.stars);

    // ---- mount points (kart-local) for VFX
    const W = A.body.wheels;
    this.mounts = {
      exhaustL: new THREE.Vector3(...A.body.exhaust[0]),
      exhaustR: new THREE.Vector3(...A.body.exhaust[1]),
      wheelFL: new THREE.Vector3(W.FL.x, 0, W.FL.z), wheelFR: new THREE.Vector3(-W.FL.x, 0, W.FL.z),
      wheelRL: new THREE.Vector3(W.RL.x, 0, W.RL.z), wheelRR: new THREE.Vector3(-W.RL.x, 0, W.RL.z),
      head: new THREE.Vector3(...h.center),
      nose: new THREE.Vector3(0, 0.45, (A.body.size?.length ?? 2.7) / 2),
      tail: new THREE.Vector3(0, 0.5, -(A.body.size?.length ?? 2.7) / 2),
      ...(A.body.mounts ?? {}),
    };
    // mounts given as arrays by builders -> Vector3
    for (const k of Object.keys(this.mounts)) if (Array.isArray(this.mounts[k])) this.mounts[k] = new THREE.Vector3(...this.mounts[k]);
    this.wheelRadius = { front: W.FL.r, rear: W.RL.r };

    // ---- animation state
    this.s = {
      spin: 0, steerS: 0, leanS: 0, pitchS: 0, accS: 0, prevSpeed: 0, prevVy: 0,
      susp: new Spring(260, 18), squash: new Spring(210, 13), bob: new Spring(90, 7), roll: new Spring(120, 10),
      torsoRoll: 0, torsoPitch: 0, headYaw: 0, headPitch: 0, headRoll: 0, lookBack: 0, boostBlend: 0, driftBlend: 0,
      blinkT: 1 + Math.random() * 3, blinkLeft: 0, hold: 0, holdFrame: FACE.OPEN, flash: 0, wobble: 0, flicker: 0,
      throwT: 0, throwDir: 1, cheerT: 0, bump: 0, boostPunch: 0, wasAir: false, steerWheel: 0, rainbow: 0, glow: 1,
      celebrate: 0, slump: 0, finishPose: 0, airT: 0, idle: Math.random() * 6,
    };

    if (opts.kart && opts.session) this._subscribe(opts.session, opts.kart);
  }

  // ------------------------------------------------------------------------------------------ materials / quality
  _pickMaterial() {
    if (this.ghost) return (this.matGhost ??= createKartMaterial({ map: this.livery, envMap: this.envMap, physical: false, ghost: true }));
    if (MAT_QUALITY[this.qualityId]) return (this.matHigh ??= createKartMaterial({ map: this.livery, envMap: this.envMap, physical: true, envIntensity: 0.6 }));
    return (this.matStd ??= createKartMaterial({ map: this.livery, envMap: this.envMap, physical: false, envIntensity: 0.6 }));
  }
  setQuality(id) {
    if (!id || id === this.qualityId) return;
    const hi = MAT_QUALITY[this.qualityId], nh = MAT_QUALITY[id];
    this.qualityId = id;
    if (hi !== nh) { this.livery = getLiveryTexture(this.driver, nh ? 1024 : 512); this._disposeMats(); }
    this._applyMaterial();
  }
  _disposeMats() { for (const m of [this.matHigh, this.matStd, this.matGhost]) m?.dispose(); this.matHigh = this.matStd = this.matGhost = null; }
  _applyMaterial() { this.mat = this._pickMaterial(); this.mesh.material = this.mat; }
  setEnvMap(tex) {
    if (tex === this.envMap) return;
    this.envMap = tex;
    for (const m of [this.matHigh, this.matStd, this.matGhost, this.faceMat]) if (m) { m.envMap = tex; m.needsUpdate = false; }
  }
  /** Translucent time-trial ghost look. */
  setGhost(on) {
    on = !!on;
    if (on === this.ghost) return;
    this.ghost = on;
    this._applyMaterial();
    this.mesh.castShadow = !on;
    this.faceMat.opacity = on ? 0.5 : 1;
  }

  // ------------------------------------------------------------------------------------------ events
  _subscribe(session, kart) {
    const on = (t, f) => { this._offs.push(session.on(t, f)); };
    const s = this.s;
    const mine = (p) => p && (p.kart === kart || p.victim === kart);
    on(EV.ITEM_HIT, (p) => { if (p.victim === kart) { s.flash = 1; this.react(FACE.OUCH, 0.9); s.squash.kick(-5); } });
    on(EV.SPIN_OUT, (p) => { if (mine(p)) { this.react(FACE.DIZZY, (kart.spin?.duration ?? 1.3) + 0.3); s.flash = Math.max(s.flash, 0.6); } });
    on(EV.LAUNCH, (p) => { if (mine(p)) { this.react(FACE.WOW, 1.2); s.flash = 1; } });
    on(EV.LAND, (p) => { if (mine(p)) { s.squash.kick(Math.min(7, p.impact * 0.32)); s.susp.kick(-Math.min(2.4, p.impact * 0.14)); } });
    on(EV.HOP, (p) => { if (mine(p)) { s.squash.kick(3.2); } });
    on(EV.JUMP, (p) => { if (mine(p)) { s.squash.kick(-2.4); } });
    on(EV.BOOST, (p) => { if (mine(p)) { s.boostPunch = 1; if (p.source !== 'drift' || p.strength > 0.3) this.react(FACE.WOW, 0.55); s.susp.kick(-0.9); } });
    on(EV.DRIFT_BOOST, (p) => { if (mine(p)) { s.boostPunch = 1; s.squash.kick(-2.6); } });
    on(EV.DRIFT_LEVEL, (p) => { if (mine(p)) { s.squash.kick(1.6); } });
    on(EV.DRIFT_START, (p) => { if (mine(p)) { s.squash.kick(1.2); } });
    on(EV.WALL_HIT, (p) => { if (mine(p)) { s.bump = clamp(s.bump + p.impact * 0.02, 0, 0.35); s.susp.kick(-0.8); this.react(FACE.OUCH, 0.35); } });
    on(EV.BUMP, (p) => { if (p.a === kart || p.b === kart) { s.susp.kick(-0.6); s.squash.kick(1.4); } });
    on(EV.SHRINK, (p) => { if (mine(p)) s.wobble = 1; });
    on(EV.RESPAWN_DONE, (p) => { if (mine(p)) s.flicker = 2; });
    on(EV.ITEM_USE, (p) => { if (mine(p)) { s.throwT = 1; s.throwDir = p.backward ? -1 : 1; } });
    on(EV.START_BURNOUT, (p) => { if (mine(p)) { this.react(FACE.OUCH, 0.8); } });
    on(EV.KART_FINISH, (p) => { if (mine(p)) { s.cheerT = 0; } });
  }
  /** Hold an expression for `t` seconds (stronger reactions override weaker ones). */
  react(frame, t) { const s = this.s; if (t >= s.hold || frame === FACE.DIZZY) { s.hold = t; s.holdFrame = frame; } }

  // ------------------------------------------------------------------------------------------ update / flush
  /** Called every sim step by the session.  Cheap: the pose solve happens in flush() (once per rendered frame). */
  update(dt, kart, session) {
    if (kart) this.kart = kart;
    if (session) this.session = session;
    this.pending += dt;
    if (!this.deferred) this.flush();
  }

  /** Resolve the pose for the elapsed time. Called by GameRenderer before drawing (and directly when not deferred). */
  flush() {
    const k = this.kart;
    if (!k) return;
    let dt = this.pending;
    this.pending = 0;
    if (dt <= 0) dt = 1e-4;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this._solve(dt, k);
  }

  _setBone(i, x, y, z) {
    if (i < 0) return;
    this.bones[i].quaternion.copy(this.rest[i]).multiply(_q.setFromEuler(_e.set(x, y, z)));
  }

  _solve(dt, k) {
    const s = this.s, I = this.i, B = this.bones;
    const t = this.time;
    const top = k.stats?.topSpeed ?? 36;
    const speed = k.speed ?? 0;
    const spN = clamp(speed / top, -0.5, 1.5);
    const grounded = k.grounded !== false;
    const dr = k.drift ?? { dir: 0, level: 0, angle: 0 };
    const boosting = (k.boost?.timer ?? 0) > 0;
    const spinning = (k.spin?.timer ?? 0) > 0;
    const finished = !!k.race?.finished;
    const place = k.race?.place ?? 1;
    const steer = k.steerVisual ?? 0;
    const lean = k.lean ?? 0;
    const flying = !grounded && (k.airTime ?? 0) > 0.12;

    // ---- smoothing / derived values
    s.steerS = damp(s.steerS, steer, 22, dt);
    const acc = clamp((speed - s.prevSpeed) / dt, -40, 40);
    s.prevSpeed = speed;
    s.accS = damp(s.accS, acc, 7, dt);
    const brake = k.input?.brake ?? 0;
    s.boostBlend = damp(s.boostBlend, boosting ? 1 : 0, boosting ? 9 : 4, dt);
    s.driftBlend = damp(s.driftBlend, dr.dir !== 0 ? 1 : 0, 10, dt);
    s.lookBack = damp(s.lookBack, k.input?.lookBack && !finished ? 1 : 0, 10, dt);
    s.boostPunch = Math.max(0, s.boostPunch - dt * 2.4);
    s.flash = Math.max(0, s.flash - dt * 3.2);
    s.wobble = Math.max(0, s.wobble - dt * 1.7);
    s.flicker = Math.max(0, s.flicker - dt);
    s.bump = Math.max(0, s.bump - dt * 1.8);
    s.throwT = Math.max(0, s.throwT - dt * 2.6);
    s.hold = Math.max(0, s.hold - dt);
    s.idle += dt;
    s.airT = flying ? s.airT + dt : 0;
    const vy = k.vy ?? 0;

    // ---- body attitude (whole kart, rigid): roll into the turn, pitch with acceleration / airtime
    const rollT = lean * 0.5 + (dr.dir !== 0 ? -dr.dir * 0.0 : 0) + (s.bump * (k.query?.lateral > 0 ? 1 : -1)) * 0.0;
    s.rollS = damp(s.rollS ?? 0, rollT, 12, dt);
    let pitchT = clamp(s.accS * 0.0042, -0.07, 0.085) - brake * clamp(spN, 0, 1) * 0.045 + (grounded ? 0 : clamp(vy * 0.018, -0.28, 0.28));
    if (finished && place <= 3) pitchT += 0.0;
    s.pitchS = damp(s.pitchS, pitchT, 9, dt);
    const sh = k.scale !== undefined && k.scale < 0.95 ? 1 : 0;
    this.tilt.rotation.set(-s.pitchS, 0, s.rollS);
    const wob = s.wobble > 0 ? Math.sin(t * 26) * 0.1 * s.wobble : 0;
    this.tilt.scale.set(1 + wob, 1 - wob, 1 + wob);
    void sh;

    // ---- suspension / squash
    const noise = (Math.sin(t * 43) * 0.0035 + Math.sin(t * 29 + 1.7) * 0.0025) * (0.25 + clamp(spN, 0, 1) * 0.75) * (grounded ? 1 : 0);
    const idleShake = Math.sin(t * 61) * 0.0016 * (1 - clamp(spN * 3, 0, 1));
    s.susp.kick(-(vy - s.prevVy) * 0.05);
    s.prevVy = vy;
    const suspY = s.susp.step(0, dt) + noise + idleShake - (flying ? 0.03 : 0);
    const sq = clamp(s.squash.step(flying && (k.vy ?? 0) > 0 ? -0.05 : 0, dt), -0.2, 0.25);
    const ch = B[I.chassis];
    ch.position.set(0, suspY, 0);
    ch.scale.set(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45);

    // ---- wheels
    const WR = this.wheelRadius;
    s.spin = (s.spin + (speed / WR.rear) * dt) % TAU;
    const spinF = (s.spin * WR.rear / WR.front) % TAU;
    let burn = 0;
    if ((k.stun ?? 0) > 0) burn = ((t * 38) % TAU);
    const steerAng = -s.steerS * 0.46 - (dr.angle ?? 0) * 0.85;
    const roll = this.tilt.rotation.z, pit = s.pitchS;
    const droop = grounded ? 0 : 0.06;
    const W = this.assets.body.wheels;
    const wy = (x, z, y0) => y0 - x * Math.sin(roll) - z * Math.sin(pit) - droop;
    this._wheel(I.wheelFL, I.steerFL, spinF + pit, steerAng, roll, W.FL.x, W.FL.z, W.FL.y, wy);
    this._wheel(I.wheelFR, I.steerFR, spinF + pit, steerAng, roll, -W.FL.x, W.FL.z, W.FL.y, wy);
    this._wheel(I.wheelRL, -1, s.spin + burn + pit, 0, roll, W.RL.x, W.RL.z, W.RL.y, wy);
    this._wheel(I.wheelRR, -1, s.spin + burn + pit, 0, roll, -W.RL.x, W.RL.z, W.RL.y, wy);

    // ---- steering wheel
    if (I.steerWheel >= 0) {
      const st = this.assets.body.steer;
      _axis.set(st.axis[0], st.axis[1], st.axis[2]).normalize();
      s.steerWheel = damp(s.steerWheel, -s.steerS * 1.3 + (spinning ? Math.sin(t * 20) * 1.2 : 0), 25, dt);
      B[I.steerWheel].quaternion.setFromAxisAngle(_axis, s.steerWheel);
    }

    // ---- driver
    const driftSide = -dr.dir; // yaw sign: drifting right (+1) = look right = negative yaw
    let cheer = 0, slump = 0;
    if (finished) {
      const racers = this.session?.karts?.length ?? 8;
      if (place <= 3) cheer = 1; else if (place > Math.ceil(racers / 2)) slump = 1;
      s.cheerT += dt;
    }
    s.celebrate = damp(s.celebrate, cheer, 6, dt);
    s.slump = damp(s.slump, slump, 5, dt);
    const bob = s.bob.step(suspY * -1.5, dt);
    if (I.hip >= 0) B[I.hip].position.set(this.restPos[I.hip].x, this.restPos[I.hip].y + bob * 0.55 + s.celebrate * Math.abs(Math.sin(s.cheerT * 7.5)) * 0.18, this.restPos[I.hip].z);
    const breathe = Math.sin(s.idle * 2.2) * 0.012;
    const tr = lean * 0.9 + s.steerS * 0.1 + driftSide * -0.08 * s.driftBlend + (s.bump * 0.5) * Math.sin(t * 30);
    const tp = -0.2 * s.boostBlend - s.accS * 0.0035 + brake * 0.1 * clamp(spN, 0, 1) + s.slump * 0.32 - s.celebrate * 0.12 + breathe;
    this._setBone(I.torso, tp, 0, tr + (spinning ? Math.sin(t * 17) * 0.25 : 0));
    // head: look into the turn / drift, whip around to look back, nod on bumps, dizzy wobble
    const idleLook = Math.sin(s.idle * 0.7) * 0.18 * (1 - clamp(spN * 2, 0, 1)) + Math.sin(s.idle * 1.9) * 0.05;
    const hy = -s.steerS * 0.3 + driftSide * 0.38 * s.driftBlend * -1 + s.lookBack * 2.5 + idleLook + (spinning ? Math.sin(t * 9) * 0.6 : 0) + s.celebrate * Math.sin(s.cheerT * 5) * 0.25;
    const hp = 0.05 - 0.1 * s.boostBlend + s.slump * 0.5 + suspY * -2.2 + (flying ? 0.12 : 0) + (spinning ? Math.sin(t * 12) * 0.14 : 0) - s.celebrate * 0.18;
    const hr = -lean * 0.55 + s.boostPunch * Math.sin(t * 50) * 0.03 + (spinning ? Math.cos(t * 9) * 0.25 : 0) + s.celebrate * Math.sin(s.cheerT * 6) * 0.1 + s.slump * -0.1;
    this._setBone(I.head, hp, hy, hr);
    this._arms(dt, k, spinning, cheer, flying);

    // ---- secondary motion (ears, tails, antennae, flags)
    this._secondary(dt, k, spN, boosting, grounded);

    // ---- face expression
    this._face(dt, k, { boosting, spinning, finished, place, dr, spN, flying, cheer, slump });

    // ---- shader state
    const u = this.mat.userData.u;
    u.uTime.value = t;
    u.uFlash.value = s.flash > 0 ? Math.min(1, s.flash) * (0.55 + 0.45 * Math.sin(t * 40)) : 0;
    const inv = (k.invincible ?? 0) > 0 || (k.rocket ?? 0) > 0;
    s.rainbow = damp(s.rainbow, inv ? 1 : 0, 8, dt);
    u.uRainbow.value = s.rainbow;
    u.uGlow.value = 1 + s.boostBlend * 0.8 + s.boostPunch * 0.8;
    // respawn / post-respawn flicker
    this.root.visible = !(s.flicker > 0 && Math.floor(t * 14) % 2 === 0);
    // dizzy stars
    const showStars = spinning || (s.hold > 0 && s.holdFrame === FACE.DIZZY);
    this.stars.visible = showStars;
    if (showStars) {
      const pos = this.stars.geometry.attributes.position;
      for (let i = 0; i < 5; i++) {
        const a = t * 5 + (i / 5) * TAU;
        pos.setXYZ(i, Math.cos(a) * 0.55, Math.sin(t * 7 + i) * 0.04, Math.sin(a) * 0.55);
      }
      pos.needsUpdate = true;
    }
  }

  _wheel(wi, si, spin, steerAng, roll, x, z, y0, wy) {
    const B = this.bones;
    if (si >= 0) this._setBone(si, 0, steerAng, 0);
    this._setBone(wi, spin, 0, -roll);
    B[wi].position.y = si >= 0 ? 0 : this.restPos[wi].y;
    // vertical compensation so the contact patch stays on the ground when the body rolls/pitches
    const dy = wy(x, z, 0);
    if (si >= 0) B[si].position.y = this.restPos[si].y + dy; else B[wi].position.y = this.restPos[wi].y + dy;
  }

  _arms(dt, k, spinning, cheer, flying) {
    const s = this.s, I = this.i;
    if (I.armL < 0) return;
    const t = this.time;
    const flail = spinning || (s.hold > 0 && s.holdFrame === FACE.OUCH) ? 1 : 0;
    const cheerArm = s.celebrate;
    const th = s.throwT;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const ai = i === 0 ? I.armL : I.armR, fi = i === 0 ? I.foreL : I.foreR;
      // steering sway (hands follow the wheel) + flail / cheer / throw overlays
      const sway = this.s.steerS * 0.2 * side;
      const lift = cheerArm * (-2.1 + Math.sin(s.cheerT * 9 + i) * 0.35) + flail * Math.sin(t * 14 + i * 2.1) * 0.9 + (flying ? -0.25 : 0);
      const thr = th > 0 ? Math.sin((1 - th) * Math.PI) * (s.throwDir > 0 ? -1.1 : 1.3) * (i === 0 ? 1 : 0.2) : 0;
      this._setBone(ai, lift * 0.55 + thr * 0.5, 0, sway + cheerArm * side * -0.5 + flail * Math.sin(t * 11 + i) * 0.4);
      this._setBone(fi, lift * 0.4 + thr * 0.5, 0, cheerArm * side * -0.2);
    }
  }

  _secondary(dt, k, spN, boosting, grounded) {
    const sec = this.secondary;
    if (!sec.length) return;
    const s = this.s, t = this.time;
    const acc = s.accS, lat = (k.steerVisual ?? 0) * spN;
    const wind = clamp(spN, 0, 1.2) + (boosting ? 0.5 : 0);
    for (let n = 0; n < sec.length; n++) {
      const c = sec[n];
      const amp = c.amp ?? 0.5;
      // drive: streams back with speed, lags with acceleration, swings opposite to lateral acceleration, idle flutter
      const tx = (c.kind === 'ear' ? -0.2 : -0.45) * wind * amp - acc * 0.012 * amp + Math.sin(t * (c.freq ?? 7) + c.ph) * 0.05 * amp * (0.4 + wind);
      const tz = lat * 0.5 * amp * (c.side ?? 1) * -1 + (c.kind === 'tail' ? Math.sin(t * (c.freq ?? 5) + c.ph) * 0.18 * amp * (0.35 + 0.65 * (1 - clamp(spN, 0, 1))) : Math.sin(t * 5.2 + c.ph) * 0.03);
      const rx = c.ax.step(tx + (c.rest?.[0] ?? 0), dt);
      const rz = c.az.step(tz + (c.rest?.[2] ?? 0), dt);
      this._setBone(c.bi, rx, 0, rz);
    }
  }

  _face(dt, k, f) {
    const s = this.s;
    let frame = FACE.OPEN;
    if (f.finished) frame = f.cheer ? FACE.HAPPY : f.slump ? FACE.SAD : FACE.OPEN;
    else if (f.spinning) frame = FACE.DIZZY;
    else if (s.hold > 0) frame = s.holdFrame;
    else if (f.boosting) frame = s.boostPunch > 0.3 ? FACE.WOW : FACE.HAPPY;
    else if (f.dr.dir !== 0) frame = FACE.DETERMINED;
    else if (f.flying && s.airT > 0.35) frame = FACE.WOW;
    else if (f.spN > 0.88) frame = FACE.DETERMINED;
    // blink on calm frames
    if (frame === FACE.OPEN || frame === FACE.DETERMINED) {
      if (s.blinkLeft > 0) { s.blinkLeft -= dt; frame = FACE.BLINK; }
      else { s.blinkT -= dt; if (s.blinkT <= 0) { s.blinkLeft = 0.13; s.blinkT = 1.8 + Math.random() * 3.6; } }
    }
    if (frame !== this.faceFrame) { this.faceFrame = frame; setFaceFrame(this.faceTex, frame); }
  }

  // ------------------------------------------------------------------------------------------ API for VFX / UI
  /** World position of a mount point (exhaustL/R, wheelRL..., head, nose, tail) for the attached kart. */
  mountWorld(name, out, kart = this.kart) {
    const m = this.mounts[name];
    if (!m || !kart) return out.copy(kart?.position ?? _v.set(0, 0, 0));
    out.copy(m).multiplyScalar(kart.scale ?? 1).applyQuaternion(kart.orientation).add(kart.position);
    return out;
  }

  dispose() {
    this._offs.forEach((o) => o());
    this._offs = [];
    this.root.removeFromParent();
    this._disposeMats();
    this.faceMat.dispose();
    this.faceTex.dispose();
    this.starMat.dispose();
    this.stars.geometry.dispose();
    this.skeleton.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ public factory API
/** Standard session hook: build the visual for a kart and add it to the scene. */
export function attachKartVisual(kart, session) {
  const env = session?.scene?.environment ?? session?.envMap ?? null;
  const qid = session?.quality?.id ?? 'high';
  const v = new KartVisual(kart.driverId, kart.bodyId, { kart, session, envMap: env, quality: qid });
  v.deferred = !!session?.app?.renderer?.supportsVisualFlush;
  v.mat.userData.u.uTime.value = 0;
  kart.visual = v;
  kart.root.add(v.root);
  session.scene.add(kart.root);
  v._solveInitial?.();
  return v;
}

/**
 * Menu turntable / podium / portrait model: the same visual driven by a synthetic kart.
 * opts: { pose: 'idle'|'drive'|'drift'|'boost'|'cheer'|'sad'|'dizzy', quality, envMap }
 */
export function createKartShowcase(driverId, bodyId, opts = {}) {
  const fake = makeFakeKart(driverId, bodyId);
  const vis = new KartVisual(driverId, bodyId, { kart: fake, quality: opts.quality ?? 'high', envMap: opts.envMap });
  vis.deferred = false;
  const root = new THREE.Group();
  root.name = 'kartShowcase';
  root.add(vis.root);
  const api = {
    root, visual: vis, kart: fake,
    pose: 'idle',
    t: 0,
    setPose(name) { api.pose = name; api.poseT = 0; },
    setGhost(on) { vis.setGhost(on); },
    update(dt = 1 / 60) {
      api.t += dt; api.poseT = (api.poseT ?? 0) + dt;
      poseFake(fake, api.pose, api.t, api.poseT);
      vis.update(dt, fake);
    },
    flush() { vis.flush(); },
    /** Trigger a one-shot reaction: 'hit' | 'wow' | 'happy' | 'sad' | 'boost'. */
    react(name) {
      if (name === 'hit') { vis.react(FACE.OUCH, 0.9); vis.s.flash = 1; }
      else if (name === 'wow') vis.react(FACE.WOW, 1);
      else if (name === 'happy') vis.react(FACE.HAPPY, 1.5);
      else if (name === 'sad') vis.react(FACE.SAD, 1.5);
      else if (name === 'boost') { vis.s.boostPunch = 1; vis.react(FACE.WOW, 0.5); }
    },
    dispose() { vis.dispose(); root.removeFromParent(); },
  };
  api.setPose(opts.pose ?? 'idle');
  poseFake(fake, api.pose, 0, 0);
  vis.flush();
  return api;
}

function makeFakeKart(driverId, bodyId) {
  return {
    driverId, bodyId, isPlayer: true, stats: { topSpeed: 36 }, speed: 0, steerVisual: 0, lean: 0, pitch: 0, grounded: true, vy: 0, airTime: 0, scale: 1,
    drift: { dir: 0, level: 0, angle: 0, hop: 0 }, boost: { timer: 0, strength: 0 }, spin: { timer: 0, duration: 1 }, stun: 0, invincible: 0, shrink: 0, rocket: 0,
    respawn: { active: false }, input: { lookBack: false, throttle: 0, brake: 0 }, race: { finished: false, place: 1 }, query: { lateral: 0 },
    position: new THREE.Vector3(), orientation: new THREE.Quaternion(),
  };
}

function poseFake(k, pose, t, pt) {
  const top = 36;
  k.speed = 0; k.steerVisual = 0; k.lean = 0; k.boost.timer = 0; k.drift.dir = 0; k.drift.angle = 0; k.spin.timer = 0; k.race.finished = false; k.race.place = 1; k.invincible = 0; k.input.lookBack = false; k.grounded = true; k.vy = 0; k.airTime = 0; k.stun = 0;
  switch (pose) {
    case 'drive': k.speed = top * 0.7; k.steerVisual = Math.sin(t * 0.9) * 0.6; k.lean = k.steerVisual * 0.14; break;
    case 'drift': k.speed = top * 0.8; k.steerVisual = 0.5; k.drift.dir = 1; k.drift.level = 2; k.drift.angle = -0.42; k.lean = 0.24; break;
    case 'boost': k.speed = top * 1.1; k.boost.timer = 1; k.boost.strength = 0.4; break;
    case 'cheer': k.race.finished = true; k.race.place = 1; break;
    case 'sad': k.race.finished = true; k.race.place = 8; break;
    case 'dizzy': k.spin.timer = 1; break;
    case 'lookback': k.input.lookBack = true; k.speed = top * 0.6; break;
    case 'star': k.invincible = 5; k.speed = top * 0.7; break;
    default: break;
  }
  void pt;
}

// portraits live in portraits.js; re-exported here so `import { getKartPortrait } from '../vehicles/KartVisuals.js'` works too
export { getDriverPortrait, getKartPortrait } from './portraits.js';
