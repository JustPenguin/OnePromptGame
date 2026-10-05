// WebGL renderer wrapper. OWNER: Agent C (render).
// Public API used by the App/session (keep stable):
//   new GameRenderer(canvas)     .renderer (THREE.WebGLRenderer)    .width/.height (CSS px)
//   .setQuality(qualityObj)      .resize()                          .setResolutionScale(s)
//   .render(scene, camera, session)    session may be null (menus) - session.player drives the speed FX
//   .setEnvironmentProfile({ exposure, bloomStrength, bloomThreshold, bloomRadius, vignette, saturation, contrast, envIntensity })
//        called by tracks (Agent B) to set the per-track look
//   .onSessionLoaded(session) / .onSessionDisposed(session)    environment map + resources per race
//   .stats()  .flash(r,g,b,amount)  .setAutoQuality(bool)  .renderToPixels(scene, camera, w, h, opts)  .dispose()
//
// Pipelines (chosen by session.quality / what the GPU supports):
//   'direct'  low quality (or no float render targets): scene straight to the canvas, ACES via renderer.toneMapping.
//   'post'    scene -> MSAA half-float RT -> dual-filter bloom -> single composite pass (see post.js).
import * as THREE from 'three';
import { makeQuality } from './quality.js';
import { EnvironmentFactory, STUDIO_SPEC, specFromScene } from './environment.js';
import { setSharedRenderer, setSharedEnvironment } from './shared.js';
import { PostChain } from './post.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const _v2 = new THREE.Vector2();

const DEFAULT_PROFILE = Object.freeze({
  exposure: 1, bloomStrength: 0.4, bloomThreshold: 1.05, bloomRadius: 0.55, bloomKnee: 0.4,
  vignette: 0.38, saturation: 1.08, contrast: 1.06, chroma: 0.0016, grain: 0.004, envIntensity: 0.45,
  tonemap: 0.2,   // 0 = Khronos Neutral (hue-preserving, saturated) .. 1 = ACES filmic (contrasty, desaturates highlights)
});

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    // MSAA happens on our own render targets (post path); the default framebuffer needs none.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.info.autoReset = false;      // we sum draw calls over all passes of a frame ourselves
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in three r18x
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.quality = makeQuality('medium');
    this.width = 1; this.height = 1;
    this.profile = { ...DEFAULT_PROFILE };
    /** kart visuals defer their pose solve to render time when this is true (see KartVisuals.flush) */
    this.supportsVisualFlush = true;
    this.post = new PostChain(this.renderer);
    this.hdrOk = this.post.supported;
    this.forceDirect = false;
    // environment (IBL)
    this.envFactory = new EnvironmentFactory(this.renderer);
    this.studioEnv = this.envFactory.create({ ...STUDIO_SPEC, size: 128 });
    setSharedRenderer(this);
    setSharedEnvironment(this.studioEnv);
    this.sessionEnv = null;
    this._envSession = null;
    // per-frame state
    this._fx = { exposure: 1, bloom: 0.5, threshold: 1, knee: 0.5, radius: 0.6, vignette: 0.35, sat: 1.08, contrast: 1.06, chroma: 0.0015, blur: 0, lines: 0, boost: 0, grain: 0.004, flash: { r: 1, g: 1, b: 1, a: 0 }, center: { x: 0.5, y: 0.47 }, time: 0, bloomOn: true };
    this._flash = { r: 1, g: 1, b: 1, a: 0 };
    this._fxSpeed = 0; this._fxBoost = 0;
    this._last = 0; this._ema = 16.7; this._slowT = 0; this._fastT = 0;
    this._auto = null;               // null = decide from session.settings.quality / URL
    this._urlQuality = typeof location !== 'undefined' && new URLSearchParams(location.search).has('quality');
    this._frameStats = { calls: 0, triangles: 0, points: 0, lines: 0 };
    this._fpsEl = null; this._fpsT = 0; this._frames = 0;
    this.contextLost = false;
    this._wireContext();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  // ------------------------------------------------------------------------------------------ quality / size
  get pipeline() { return this.hdrOk && !this.forceDirect && (this.quality.postfx || this.quality.bloom) ? 'post' : 'direct'; }

  setQuality(q) {
    const prev = this.quality;
    this.quality = q;
    this.renderer.shadowMap.enabled = !!q.shadows;
    this._qSig = '';
    this.resize();
    // a live change (settings menu): karts re-pick their material / livery size, the sky probe is rebuilt at the new resolution
    const S = this._envSession;
    if (S && prev && prev.id !== q.id) {
      for (const k of S.karts ?? []) k.visual?.setQuality?.(q.id);
      this._buildSessionEnv(S);
    }
  }
  setResolutionScale(s) { this.quality.resolutionScale = s; this.resize(); }
  /** Force/disable adaptive resolution (otherwise: on when settings.quality === 'auto' and no ?quality= override). */
  setAutoQuality(on) { this._auto = on === null ? null : !!on; }

  resize() {
    const c = this.canvas;
    const w = Math.max(2, c.clientWidth || window.innerWidth), h = Math.max(2, c.clientHeight || window.innerHeight);
    const q = this.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatioMax) * (q.resolutionScale ?? 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.width = w; this.height = h;
    if (this.pipeline === 'post') {
      const bs = this.renderer.getDrawingBufferSize(_v2);
      this.post.resize(bs.x, bs.y, { samples: q.antialias ? (q.msaa ?? 4) : 0, levels: q.bloom ? (q.bloomLevels ?? 5) : 0 });
    }
  }

  setEnvironmentProfile(p) {
    this.profile = { ...this.profile, ...p };
    this.renderer.toneMappingExposure = this.profile.exposure ?? 1;
    this.renderer.toneMapping = (this.profile.tonemap ?? 0.2) < 0.5 ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    if (this._envSession) this._envSession.scene.environmentIntensity = this.profile.envIntensity ?? 0.45;
  }

  /** Brief additive screen flash (explosions, hits). amount ~0..1 */
  flash(r = 1, g = 1, b = 1, amount = 0.5) {
    const f = this._flash;
    if (amount > f.a) { f.r = r; f.g = g; f.b = b; f.a = Math.min(1.2, amount); }
  }

  // ------------------------------------------------------------------------------------------ environment per session
  /** Build the sky/sun image-based lighting for a freshly loaded session and hand it to the karts. */
  onSessionLoaded(session) {
    this._envSession = session;
    this._buildSessionEnv(session);
    session._envPending = true; // refresh once after the first update (the track positions its sun then)
    this._fxSpeed = 0; this._fxBoost = 0;
  }
  _buildSessionEnv(session) {
    const old = this.sessionEnv;
    const q = this.quality ?? session.quality;
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

  // ------------------------------------------------------------------------------------------ context loss
  _wireContext() {
    this._onLost = (e) => { e.preventDefault(); this.contextLost = true; };
    this._onRestored = () => {
      this.contextLost = false;
      // GL objects are gone.  PMREM environments hold GPU-only content and must be re-rendered, and the old generator's internals must
      // NOT be disposed (three's stale dispose listeners would delete handles of the dead context), so start a fresh factory.
      this.envFactory = new EnvironmentFactory(this.renderer);
      this.studioEnv = this.envFactory.create({ ...STUDIO_SPEC, size: 128 });
      setSharedEnvironment(this.studioEnv);
      if (this._envSession) { this.sessionEnv = null; this._buildSessionEnv(this._envSession); }
      this.post.sceneRT = null; this.post.mips.length = 0; this.post.w = 0;
      this.resize();
      this.onContextRestored?.();
    };
    this.canvas.addEventListener('webglcontextlost', this._onLost, false);
    this.canvas.addEventListener('webglcontextrestored', this._onRestored, false);
  }

  // ------------------------------------------------------------------------------------------ frame
  render(scene, camera, session = null) {
    const now = performance.now();
    const dtMs = this._last ? Math.min(100, now - this._last) : 16.7;
    this._last = now;
    const dt = dtMs / 1000;
    if (this.contextLost) return;
    const aspect = this.width / this.height;
    if (Math.abs(camera.aspect - aspect) > 1e-3) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    if (session) {
      if (session._envPending && session.time > 0.05) { session._envPending = false; this._buildSessionEnv(session); }
      for (const k of session.karts) k.visual?.flush?.();
    } else if (!scene.environment) {
      scene.environment = this.studioEnv; scene.environmentIntensity = 0.5;
    }
    this._adapt(session, dtMs);
    const r = this.renderer;
    r.info.reset();
    if (this.pipeline === 'post' && this.post.sceneRT) {
      this._buildFx(session, dt);
      const ac = r.autoClear;
      r.autoClear = true;
      // the chain toggles autoClear itself between scene and passes
      this.post.render(scene, camera, this._fx);
      r.autoClear = ac;
      r.setRenderTarget(null);
    } else {
      r.setRenderTarget(null);
      r.render(scene, camera);
    }
    const info = r.info.render;
    this._frameStats.calls = info.calls; this._frameStats.triangles = info.triangles; this._frameStats.points = info.points; this._frameStats.lines = info.lines;
    this._overlay(session, dtMs);
  }

  /** Assemble the composite-pass parameters from the track profile + player speed state. */
  _buildFx(session, dt) {
    const p = this.profile, q = this.quality, fx = this._fx;
    const lvl = q.fxLevel ?? 1;
    fx.exposure = p.exposure ?? 1;
    fx.tone = p.tonemap ?? 0.2;
    fx.bloomOn = !!q.bloom;
    fx.bloom = (p.bloomStrength ?? 0.4) * (q.bloom ? 1 : 0);
    fx.threshold = p.bloomThreshold ?? 1.05; fx.knee = p.bloomKnee ?? 0.4; fx.radius = p.bloomRadius ?? 0.55;
    fx.vignette = p.vignette ?? 0.38; fx.sat = p.saturation ?? 1.08; fx.contrast = p.contrast ?? 1.06; fx.grain = p.grain ?? 0.004;
    fx.time = performance.now() * 0.001;
    // speed feel from the followed kart
    let spd = 0, boost = 0;
    const k = session ? (session.cameraTarget ?? session.player) : null;
    const reduced = !!(session?.settings?.reducedMotion || session?.settings?.motionBlur === false);
    if (k && session.race?.phase !== 'intro' && !k.respawn?.active) {
      spd = clamp((k.speed ?? 0) / (k.stats?.topSpeed || 36), 0, 1.5);
      boost = (k.boost?.timer ?? 0) > 0 ? clamp(0.55 + (k.boost.strength ?? 0.3) * 1.2, 0, 1) : 0;
      if ((k.rocket ?? 0) > 0) boost = 1;
    }
    this._fxSpeed = damp(this._fxSpeed, spd, 4, dt);
    this._fxBoost = damp(this._fxBoost, boost, boost > this._fxBoost ? 10 : 3.2, dt);
    const m = reduced ? 0 : lvl;
    const sp = this._fxSpeed, bo = this._fxBoost;
    fx.blur = m * (clamp((sp - 0.72) * 0.11, 0, 0.04) + bo * 0.055);
    fx.lines = m * (bo * 0.95 + clamp((sp - 0.95) * 1.2, 0, 0.3));
    fx.boost = bo;
    fx.chroma = (p.chroma ?? 0.0016) * (0.8 + m * (sp * 0.8 + bo * 2.6));
    fx.vignette += m * bo * 0.12;
    // decaying flash
    const f = this._flash;
    f.a = Math.max(0, f.a - dt * 4.2);
    fx.flash.r = f.r; fx.flash.g = f.g; fx.flash.b = f.b; fx.flash.a = f.a;
  }

  // ------------------------------------------------------------------------------------------ adaptive resolution
  _adapt(session, dtMs) {
    this._ema = this._ema * 0.92 + dtMs * 0.08;
    this._frames++;
    const auto = this._auto ?? (!this._urlQuality && session?.settings?.quality === 'auto');
    if (!auto || !session) { this._slowT = this._fastT = 0; return; }
    const q = this.quality;
    const s = q.resolutionScale ?? 1;
    if (this._ema > 20) { this._slowT += dtMs / 1000; this._fastT = 0; } else if (this._ema < 12) { this._fastT += dtMs / 1000; this._slowT = 0; } else { this._slowT = this._fastT = 0; }
    if (this._slowT > 2 && s > 0.6) { this.setResolutionScale(Math.max(0.6, +(s - 0.1).toFixed(2))); this._slowT = 0; }
    else if (this._fastT > 3 && s < 1) { this.setResolutionScale(Math.min(1, +(s + 0.05).toFixed(2))); this._fastT = 0; }
  }

  // ------------------------------------------------------------------------------------------ stats / overlay
  /** Draw calls etc. of the last frame plus smoothed frame time. */
  stats() {
    const m = this.renderer.info.memory;
    return {
      fps: Math.round(1000 / Math.max(1, this._ema)), frameMs: +this._ema.toFixed(1), calls: this._frameStats.calls, triangles: this._frameStats.triangles,
      geometries: m.geometries, textures: m.textures, programs: this.renderer.info.programs?.length ?? 0, scale: this.quality.resolutionScale ?? 1,
      width: this.width, height: this.height, pipeline: this.pipeline, quality: this.quality.id, msaa: this.pipeline === 'post' ? this.post.samples : 0,
    };
  }
  _overlay(session, dtMs) {
    const want = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('fps') === '1') || session?.settings?.showFps;
    if (!want) { if (this._fpsEl) { this._fpsEl.remove(); this._fpsEl = null; } return; }
    if (!this._fpsEl) {
      const el = document.createElement('div');
      el.id = 'kr-fps';
      el.style.cssText = 'position:fixed;top:6px;right:8px;z-index:60;font:700 11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#b6ffb6;background:rgba(5,10,25,.62);padding:3px 7px;border-radius:6px;pointer-events:none;white-space:pre;text-align:right';
      document.body.appendChild(el);
      this._fpsEl = el;
    }
    this._fpsT += dtMs;
    if (this._fpsT > 500) {
      this._fpsT = 0;
      const s = this.stats();
      this._fpsEl.textContent = `${s.fps} fps  ${s.frameMs} ms\n${s.calls} calls  ${(s.triangles / 1000).toFixed(0)}k tris\n${s.quality}${s.pipeline === 'post' ? '+post' : ''}  ${Math.round(s.scale * 100)}%`;
    }
  }

  // ------------------------------------------------------------------------------------------ offscreen helper (portraits)
  /**
   * Render a scene with `camera` into an HDR target, tone-map it and return RGBA8 pixels (bottom-to-top rows, straight alpha),
   * or null when float targets are unavailable.  Restores all renderer state.
   */
  renderToPixels(scene, camera, w, h, { exposure = 1, samples = 4, clearAlpha = 0 } = {}) {
    if (!this.hdrOk || this.contextLost) return null;
    const r = this.renderer;
    const oldRT = r.getRenderTarget(), oldAuto = r.autoClear, oldShadow = r.shadowMap.enabled;
    const oldClear = r.getClearColor(new THREE.Color()), oldAlpha = r.getClearAlpha(), oldBg = scene.background;
    const hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: Math.min(samples, r.capabilities.maxSamples ?? 4), depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    hdr.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
    const px = new Uint8Array(w * h * 4);
    try {
      scene.background = null;
      r.autoClear = true;
      r.setClearColor(0x000000, clearAlpha);
      r.setRenderTarget(hdr);
      r.clear();
      r.render(scene, camera);
      r.autoClear = false;
      this.post.resolve(hdr.texture, out, exposure, this.profile.tonemap ?? 0.2);
      r.readRenderTargetPixels(out, 0, 0, w, h, px);
    } finally {
      scene.background = oldBg;
      r.autoClear = oldAuto;
      r.setClearColor(oldClear, oldAlpha);
      r.shadowMap.enabled = oldShadow;
      r.setRenderTarget(oldRT);
      hdr.dispose(); out.dispose();
    }
    return px;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this._fpsEl?.remove();
    this.post.dispose();
    this.envFactory.destroy();
    this.renderer.dispose();
  }
}
