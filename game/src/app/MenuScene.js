// 3D backdrop for menus (title, selects). OWNER: Agent E (ui) with Agent C's createKartShowcase().
// Baseline: a dusk-coloured stage with the player's kart on a slow turntable.
import * as THREE from 'three';
import { createKartShowcase } from '../vehicles/KartVisuals.js';

export class MenuScene {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141b3d);
    this.scene.fog = new THREE.Fog(0x141b3d, 14, 40);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    this.camera.position.set(4.2, 2.4, 5.2);
    this.camera.lookAt(0, 0.8, 0);
    this.scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x203050, 1.4));
    const key = new THREE.DirectionalLight(0xffe2c0, 3);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x1d2650, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.showcase = null;
    this.setKart('pip', 'classic');
    this.t = 0;
  }
  setKart(driverId, bodyId) {
    if (this.showcase) { this.scene.remove(this.showcase.root); this.showcase.dispose(); }
    this.showcase = createKartShowcase(driverId, bodyId);
    this.scene.add(this.showcase.root);
  }
  update(dt) {
    this.t += dt;
    if (this.showcase) { this.showcase.root.rotation.y += dt * 0.5; this.showcase.update?.(dt); }
  }
  render() { this.app.renderer.render(this.scene, this.camera, null); }
}
