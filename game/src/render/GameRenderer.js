// WebGL renderer wrapper. OWNER: Agent C (render).
// Public API used by the App/session (keep stable):
//   new GameRenderer(canvas)     .renderer (THREE.WebGLRenderer)    .width/.height (CSS px)
//   .setQuality(qualityObj)      .resize()                          .setResolutionScale(s)
//   .render(scene, camera, session)    session may be null (menus) - use session.player for speed FX
//   .setEnvironmentProfile({ exposure, bloomStrength, bloomThreshold, bloomRadius, vignette, saturation, contrast })
//        called by tracks (Agent B) to set the per-track look
//   .dispose()
import * as THREE from 'three';
import { makeQuality } from './quality.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in three r18x
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.quality = makeQuality('medium');
    this.width = 1; this.height = 1;
    this.profile = { exposure: 1 };
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = !!q.shadows;
    this.resize();
  }
  setResolutionScale(s) { this.quality.resolutionScale = s; this.resize(); }

  resize() {
    const c = this.canvas;
    const w = Math.max(2, c.clientWidth || window.innerWidth), h = Math.max(2, c.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioMax) * (this.quality.resolutionScale ?? 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.width = w; this.height = h;
  }

  setEnvironmentProfile(p) {
    this.profile = { ...this.profile, ...p };
    this.renderer.toneMappingExposure = this.profile.exposure ?? 1;
  }

  render(scene, camera, session = null) {
    const aspect = this.width / this.height;
    if (Math.abs(camera.aspect - aspect) > 1e-3) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    this.renderer.render(scene, camera);
  }

  dispose() { window.removeEventListener('resize', this._onResize); this.renderer.dispose(); }
}
