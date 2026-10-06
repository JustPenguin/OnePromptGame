// Respawn "rescue drone": a cute little quad-copter that drops in, hoists the kart back onto the road and flies off. OWNER: Agent C (vfx).
// Reads kart.respawn.{from,to,t,dur} (set by physics) - the drone only decorates; physics moves the kart.
import * as THREE from 'three';
import { Rig, PartBuilder } from '../vehicles/build.js';
import { M } from '../vehicles/bodies.js';
import { rbox, sph, cyl, capsule, torus } from '../vehicles/build.js';
import { createKartMaterial } from '../vehicles/kartMaterial.js';
import { limb } from '../vehicles/drivers.js';
import { clamp } from '../core/math.js';

let droneGeo = null;
function buildDroneGeometry() {
  if (droneGeo) return droneGeo;
  const rig = new Rig();
  rig.add('chassis', null, [0, 0, 0]);
  const B = new PartBuilder(rig, { ao: [0, 0.01, 1] });
  const white = '#f4f7ff', orange = '#ff7a1a', dark = '#262a3a';
  const ell = (p, s, o) => B.add(sph(1, 16, 10), { p, s, ...o });
  ell([0, 0, 0], [0.36, 0.27, 0.36], { ...M.paint, c: white });
  ell([0, 0.12, 0], [0.3, 0.2, 0.3], { ...M.paint, c: orange });
  ell([0, -0.16, 0.02], [0.2, 0.1, 0.2], { ...M.steel, c: '#59607a' });
  // camera eye
  ell([0, 0.0, 0.3], [0.15, 0.15, 0.08], { ...M.gloss, c: '#0e1424' });
  ell([0, 0.0, 0.34], [0.07, 0.07, 0.04], { ...M.glow(2.8), c: '#22d3ff' });
  // four arms with motors + rotor hubs
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ex = sx * 0.62, ez = sz * 0.62;
    limb(B, [0, 0.02, 0], [ex, 0.06, ez], 0.04, { ...M.steel, c: '#59607a' });
    B.add(cyl(0.09, 0.09, 0.1, 10), { p: [ex, 0.06, ez], ...M.gloss, c: orange });
    B.add(cyl(0.025, 0.025, 0.07, 6), { p: [ex, 0.14, ez], ...M.steel, c: dark });
  }
  // landing skids
  B.add(torus(0.3, 0.02, 4, 14, Math.PI), { p: [0, -0.3, 0], r: [Math.PI / 2, 0, 0], ...M.steel, c: '#59607a' });
  droneGeo = B.build();
  return droneGeo;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export class RescueDrone {
  constructor(envMap) {
    this.root = new THREE.Group();
    this.root.name = 'rescueDrone';
    this.mat = createKartMaterial({ physical: false, envMap, envIntensity: 0.6 });
    this.body = new THREE.Mesh(buildDroneGeometry(), this.mat);
    this.body.castShadow = true;
    this.root.add(this.body);
    // translucent rotor discs
    this.rotorMat = new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const disc = new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2);
    this.rotors = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const m = new THREE.Mesh(disc, this.rotorMat);
      m.position.set(sx * 0.62, 0.19, sz * 0.62);
      this.root.add(m); this.rotors.push(m);
    }
    this.discGeo = disc;
    // two cables to the kart
    this.cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 5);
    this.cableMat = new THREE.MeshStandardMaterial({ color: 0x20222c, roughness: 0.6 });
    this.cables = [new THREE.Mesh(this.cableGeo, this.cableMat), new THREE.Mesh(this.cableGeo, this.cableMat)];
    this.cables.forEach((c) => { c.frustumCulled = false; this.root.add(c); });
    this.active = false;
    this.kart = null;
    this.t = 0;
    this.leave = 0;
    this.root.visible = false;
    this.sway = Math.random() * 6;
  }
  start(kart) { this.kart = kart; this.active = true; this.leave = 0; this.t = 0; this.root.visible = true; }
  finish() { if (this.active && this.leave <= 0) this.leave = 0.0001; }

  /** @returns {boolean} still alive */
  update(dt, hover) {
    if (!this.active) return false;
    const k = this.kart, r = k.respawn;
    this.t += dt;
    const u = r.active ? clamp(r.t / r.dur, 0, 1) : 1;
    this.sway += dt;
    // hover target above the kart
    _a.copy(k.position); _a.y += 2.5 + Math.sin(this.sway * 3) * 0.08;
    let drop = 0;
    if (r.active) {
      drop = clamp(1 - r.t / 0.35, 0, 1); drop = drop * drop;                 // drops in from the sky during the first 0.35 s
    }
    _b.set(Math.sin(this.sway * 1.7) * 0.05, 0, 0);
    this.root.position.copy(_a).add(_b);
    this.root.position.y += drop * 14;
    this.root.position.x += drop * 5;
    if (this.leave > 0) {
      this.leave += dt;
      const l = this.leave;
      this.root.position.y += l * l * 22;
      this.root.position.z += l * 6;
      if (l > 1.1) { this.active = false; this.root.visible = false; return false; }
    }
    // face along the carry direction, tilt into it
    const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z;
    const yaw = Math.atan2(dx, dz);
    this.root.rotation.set(Math.sin(u * Math.PI) * 0.18, yaw, Math.sin(this.sway * 2.3) * 0.05);
    for (let i = 0; i < 4; i++) this.rotors[i].rotation.y += dt * 60;
    // cables from the belly to the kart's nose and tail
    const showCables = r.active || this.leave === 0;
    const vis = k.visual;
    for (let i = 0; i < 2; i++) {
      const c = this.cables[i];
      c.visible = showCables && this.leave <= 0;
      if (!c.visible) continue;
      _a.copy(this.root.position); _a.y -= 0.28;
      if (vis?.mountWorld) vis.mountWorld(i === 0 ? 'nose' : 'tail', _b, k); else _b.copy(k.position);
      _b.y += 0.55;
      // express in the root's local space (cables are children of the root)
      this.root.worldToLocal(_a); this.root.worldToLocal(_b);
      const mid = _a.clone().add(_b).multiplyScalar(0.5);
      const d = _b.clone().sub(_a); const len = d.length() || 0.01;
      _q.setFromUnitVectors(_up, d.normalize());
      c.position.copy(mid); c.quaternion.copy(_q); c.scale.set(1, len, 1);
    }
    void hover; void _m;
    return true;
  }

  dispose() {
    this.root.removeFromParent();
    this.mat.dispose(); this.rotorMat.dispose(); this.discGeo.dispose(); this.cableGeo.dispose(); this.cableMat.dispose();
  }
}

export function disposeDroneGeometry() { droneGeo?.dispose(); droneGeo = null; }
