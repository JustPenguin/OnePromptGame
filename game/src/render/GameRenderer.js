// WebGL renderer wrapper. OWNER: Agent C (render).
// Public API used by the App/session (keep stable):
//   new GameRenderer(canvas)     .renderer (THREE.WebGLRenderer)    .width/.height (CSS px)
//   .setQuality(qualityObj)      .resize()                          .setResolutionScale(s)
//   .render(scene, camera, session)    session may be null (menus) - use session.player for speed FX
//   .setEnvironmentProfile({ exposure, bloomStrength, bloomThreshold, bloomRadius, vignette, saturation, contrast })
//        called by tracks (Agent B) to set the per-track look
//   .onSessionLoaded(session) / .onSessionDisposed(session)    environment map + resources per race
//   .dispose()
import * as THREE from 'three';
import { makeQuality } from './quality.js';
import { EnvironmentFactory, STUDIO_SPEC, specFromScene } from './environment.js';
import { setSharedRenderer, setSharedEnvironment } from './shared.js';

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
    this.profile = { exposure: 1, envIntensity: 0.45 };
    /** kart visuals defer their pose solve to render time when this is true (see KartVisuals.flush) */
    this.supportsVisualFlush = true;
    this.envFactory = new EnvironmentFactory(this.renderer);
    this.studioEnv = this.envFactory.create({ ...STUDIO_SPEC, size: 128 });
    setSharedRenderer(this);
    setSharedEnvironment(this.studioEnv);
    this.sessionEnv = null;
    this._envSession = null;
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
    if (this._envSession) this._envSession.scene.environmentIntensity = this.profile.envIntensity ?? 0.45;
  }

  // ------------------------------------------------------------------------------------------ session environment
  /** Build the sky/sun image-based lighting for a freshly loaded session and hand it to the karts. */
  onSessionLoaded(session) {
    this._envSession = session;
    this._buildSessionEnv(session);
    session._envPending = true; // refresh once after the first update (the track positions its sun then)
  }
  _buildSessionEnv(session) {
    const old = this.sessionEnv;
    const q = session.quality ?? this.quality;
    const spec = specFromScene(session.scene, session.track);
    spec.size = q.id === 'low' ? 64 : q.id === 'medium' ? 128 : 256;
    const tex = this.envFactory.create(spec);
    this.sessionEnv = tex;
    session.envMap = tex;
    session.scene.environment = tex;
    session.scene.environmentIntensity = this.profile.envIntensity ?? 0.45;
    for (const k of session.karts ?? []) k.visual?.setEnvMap?.(tex);
    if (old) this.envFactory.dispose(old);
  }
  onSessionDisposed(session) {
    if (this._envSession === session) this._envSession = null;
    if (session.scene.environment === this.sessionEnv) session.scene.environment = null;
    if (this.sessionEnv) { this.envFactory.dispose(this.sessionEnv); this.sessionEnv = null; }
  }

  render(scene, camera, session = null) {
    const aspect = this.width / this.height;
    if (Math.abs(camera.aspect - aspect) > 1e-3) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    if (session) {
      if (session._envPending && session.time > 0.05) { session._envPending = false; this._buildSessionEnv(session); }
      for (const k of session.karts) k.visual?.flush?.();
    } else if (!scene.environment) {
      scene.environment = this.studioEnv; scene.environmentIntensity = 0.5;
    }
    this.renderer.render(scene, camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.envFactory.destroy();
    this.renderer.dispose();
  }
}
