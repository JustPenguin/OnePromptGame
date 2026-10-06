// Winner's podium for the results screen / end of a Grand Prix. OWNER: Agent C (visuals).
//
//   const pod = createPodiumScene([{ driverId, bodyId }, ...top 3 in finishing order])   // also accepts karts (kart.driverId / kart.bodyId)
//   pod.scene   THREE.Scene (own sky colour, lights, floor, podium, stage beams, confetti)        pod.camera  PerspectiveCamera
//   pod.update(dt)    animate (call every frame)     pod.setAspect(w / h)     pod.dispose()
//   render:  app.renderer.render(pod.scene, pod.camera, null)       (GameRenderer handles tone mapping / bloom)
// The drivers cheer (arms up, happy face); the winner hops.  Everything is procedural, nothing is loaded.
import * as THREE from 'three';
import { createKartShowcase } from './KartVisuals.js';
import { getSharedEnvironment } from '../render/shared.js';
import { getSpriteAtlas, SPR } from '../vfx/sprites.js';
import { ParticleLayer } from '../vfx/particles.js';
import { BeamSystem } from '../vfx/beams.js';

const BLOCKS = [
  { place: 1, x: 0, h: 1.7, w: 3.2, color: '#f2c14e', trim: [2.2, 1.6, 0.4], yaw: 0 },
  { place: 2, x: -3.5, h: 1.15, w: 3.2, color: '#c9d2e3', trim: [1.4, 1.7, 2.2], yaw: 0.28 },
  { place: 3, x: 3.5, h: 0.8, w: 3.2, color: '#d08a4f', trim: [2.2, 1.1, 0.5], yaw: -0.28 },
];
const CONFETTI = [[1, 0.2, 0.36], [1, 0.82, 0.25], [0.13, 0.82, 1], [0.48, 0.88, 0.29], [0.55, 0.3, 1], [1, 0.48, 0.1], [1, 1, 1]];

function numberTexture(n, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a3158'); grad.addColorStop(1, '#141935');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = color; g.lineWidth = 10; g.strokeRect(14, 14, 228, 228);
  g.fillStyle = color; g.font = 'italic 900 170px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillText(String(n), 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** @param {Array<{driverId:string, bodyId:string}>} top3 @param {{ quality?: string, scene?: THREE.Scene, aspect?: number }} [opts] */
export function createPodiumScene(top3, opts = {}) {
  const scene = opts.scene ?? new THREE.Scene();
  const own = !opts.scene;
  const root = new THREE.Group();
  root.name = 'podium';
  scene.add(root);
  if (own) {
    scene.background = new THREE.Color('#0d1230');
    scene.fog = new THREE.Fog('#0d1230', 22, 60);
    const env = getSharedEnvironment();
    if (env) { scene.environment = env; scene.environmentIntensity = 0.55; }
  }
  const disposables = [];

  // ---- lights: warm key from the front, cool rims from behind, soft hemisphere fill
  root.add(new THREE.HemisphereLight(0x8fa8ff, 0x201a33, 0.6));
  const key = new THREE.SpotLight(0xfff0d2, 250, 40, 0.5, 0.55, 1.6);
  key.position.set(2.5, 11, 9); key.target.position.set(0, 1.2, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.camera.near = 4; key.shadow.camera.far = 30;
  root.add(key, key.target);
  const rimA = new THREE.DirectionalLight(0x6fa8ff, 1.6); rimA.position.set(-6, 5, -6); root.add(rimA);
  const rimB = new THREE.DirectionalLight(0xff7ad9, 1.3); rimB.position.set(6, 4, -6); root.add(rimB);

  // ---- floor + podium blocks
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x151a38, roughness: 0.32, metalness: 0.35 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  root.add(floor);
  disposables.push(floor.geometry, floorMat);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(geo);
  const trimGeo = new THREE.BoxGeometry(1, 0.07, 1);
  disposables.push(trimGeo);
  const karts = [];
  const beams = new BeamSystem(6);
  root.add(beams.mesh);
  disposables.push({ dispose: () => beams.dispose() });
  const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  const beamDefs = [];

  top3.slice(0, 3).forEach((entry, i) => {
    const B = BLOCKS[i];
    const tex = numberTexture(B.place, B.color);
    disposables.push(tex);
    const side = new THREE.MeshPhysicalMaterial({ color: B.color, metalness: 0.75, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    const front = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.35, roughness: 0.4 });
    const top = new THREE.MeshPhysicalMaterial({ color: B.color, metalness: 0.4, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.2 });
    disposables.push(side, front, top);
    const block = new THREE.Mesh(geo, [side, side, top, side, front, side]);
    block.scale.set(B.w, B.h, B.w);
    block.position.set(B.x, B.h / 2, 0);
    block.castShadow = true; block.receiveShadow = true;
    root.add(block);
    const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(B.trim[0], B.trim[1], B.trim[2]) });
    disposables.push(trimMat);
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.scale.set(B.w + 0.1, 1, B.w + 0.1); trim.position.set(B.x, B.h + 0.01, 0);
    root.add(trim);
    // the kart + driver
    const driverId = entry.driverId, bodyId = entry.bodyId;
    const show = createKartShowcase(driverId, bodyId, { pose: 'cheer', quality: opts.quality ?? 'high', trim: 0.9 });
    show.root.position.set(B.x, B.h + 0.06, 0.1);
    show.root.rotation.y = B.yaw;
    show.react('happy');
    root.add(show.root);
    karts.push({ show, base: B.h + 0.06, place: B.place, phase: i * 1.7 });
    beamDefs.push({ x: B.x, h: B.h, color: B.trim });
  });

  // ---- confetti (one alpha particle layer)
  const confetti = new ParticleLayer({ capacity: 900, additive: false, map: getSpriteAtlas() });
  confetti.uniforms.uFog.value.set(1e4, 2e4);
  confetti.uniforms.uNearFade.value = 0.5;
  root.add(confetti.mesh);
  disposables.push(confetti);
  let confettiT = 0, confettiAcc = 0;
  const burst = (n) => {
    for (let k = 0; k < n; k++) {
      const c = CONFETTI[(Math.random() * CONFETTI.length) | 0];
      confetti.spawn((Math.random() - 0.5) * 11, 7 + Math.random() * 2, (Math.random() - 0.5) * 5 - 0.5, (Math.random() - 0.5) * 1.2, -(0.6 + Math.random() * 1.2), (Math.random() - 0.5) * 1.2,
        5 + Math.random() * 2.5, 0.2 + Math.random() * 0.12, 0.2, c[0], c[1], c[2], 1, c[0], c[1], c[2], 0.9, SPR.CONFETTI, 0.9, 1.6, 0, Math.random() * 6.28, (Math.random() - 0.5) * 9, 0, 0);
    }
  };

  // ---- camera
  const camera = new THREE.PerspectiveCamera(30, opts.aspect ?? 16 / 9, 0.2, 80);
  const look = new THREE.Vector3(0, 1.75, 0);
  let t = 0;
  burst(200);

  const api = {
    scene, root, camera, karts: karts.map((k) => k.show),
    setAspect(a) {
      camera.aspect = a;
      // keep the three karts in frame on narrow (portrait) screens
      camera.fov = a < 1 ? 46 : a < 1.5 ? 36 : 30;
      camera.updateProjectionMatrix();
    },
    update(dt = 1 / 60) {
      t += dt;
      for (const k of karts) {
        const hop = k.place === 1 ? Math.max(0, Math.sin(t * 5.2 + k.phase)) * 0.22 : Math.max(0, Math.sin(t * 3.6 + k.phase)) * 0.07;
        k.show.root.position.y = k.base + hop;
        k.show.update(dt);
      }
      confettiT += dt; confettiAcc += dt * 70;
      const n = confettiAcc | 0; confettiAcc -= n; if (n > 0) burst(n);
      confetti.setTime(confettiT); confetti.flush();
      // slow camera sweep
      camera.position.set(Math.sin(t * 0.35) * 1.6, 3.1 + Math.sin(t * 0.21) * 0.2, 13.2);
      camera.lookAt(look);
      // stage beams from above onto each block (slight sway)
      beams.begin();
      for (let i = 0; i < beamDefs.length; i++) {
        const b = beamDefs[i];
        _p.set(b.x + Math.sin(t * 0.8 + i) * 0.9, 10, -2.2);
        _d.set(b.x, b.h + 0.5, 0).sub(_p).normalize();
        _q.setFromUnitVectors(_z, _d);
        beams.add(_p, _q, 2.2, 12.5, 0.8, b.color[0] * 0.6, b.color[1] * 0.6, b.color[2] * 0.6);
      }
      beams.end();
    },
    dispose() {
      for (const k of karts) k.show.dispose();
      root.removeFromParent();
      for (const d of disposables) d.dispose?.();
    },
  };
  api.setAspect(opts.aspect ?? 16 / 9);
  api.update(1 / 60);
  return api;
}
