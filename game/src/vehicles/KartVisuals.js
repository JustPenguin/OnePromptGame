// Kart + driver visuals. OWNER: Agent C (visuals).
// Contract (keep stable):
//   attachKartVisual(kart, session)  builds kart.visual = { root, update(dt, kart, session), dispose() } and adds
//                                    it under kart.root (kart.root is positioned/oriented by physics; the model
//                                    faces +Z, its origin is on the ground under the kart's centre).
//   createKartShowcase(driverId, bodyId, opts) -> { root, update(dt), dispose() }   for menu turntables.
// The visual may read ANY kart field (steerVisual, lean, drift, boost, spin, speed, shrink, invincible, race.finished...)
// and listen to session.events for one-shot reactions (hit, win, lose...).
import * as THREE from 'three';
import { getDriver, getBody } from '../data/roster.js';

export function createKartShowcase(driverId, bodyId, opts = {}) {
  const driver = getDriver(driverId);
  const body = getBody(bodyId);
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: driver.colors.primary, roughness: 0.35, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 0.8 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.5), paint);
  chassis.position.y = 0.55; chassis.castShadow = true;
  root.add(chassis);
  const wheels = [];
  for (const [x, z] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.32, 16), dark);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z); w.castShadow = true;
    root.add(w); wheels.push(w);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: driver.colors.secondary, roughness: 0.6 }));
  head.position.set(0, 1.25, -0.2); head.castShadow = true;
  root.add(head);
  return { root, wheels, head, update() {}, dispose() { root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); } };
}

export function attachKartVisual(kart, session) {
  const v = createKartShowcase(kart.driverId, kart.bodyId);
  const api = {
    root: v.root,
    wheelSpin: 0,
    update(dt, k) {
      this.wheelSpin += (k.speed / 0.4) * dt;
      for (const w of v.wheels) w.rotation.x = this.wheelSpin;
      v.root.rotation.z = -k.lean;
      v.root.visible = !(k.respawn.active && Math.floor(performance.now() / 90) % 2 === 0);
    },
    dispose: v.dispose,
  };
  kart.visual = api;
  kart.root.add(api.root);
  session.scene.add(kart.root);
  return api;
}
