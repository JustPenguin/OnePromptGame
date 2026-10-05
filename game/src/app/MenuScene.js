// 3D backdrop for every menu screen. OWNER: Agent E (ui) with Agent C's createKartShowcase().
//
//   menu.setKart(driverId, bodyId)     crossfades (pop-in / shrink-out) the turntable kart
//   menu.setPreset('title'|'select'|'wide'|'dim'|'podium')   camera framing, tweened
//   menu.setTheme({primary, secondary}|null)                   tints rim lights / floor ring (track select)
//   menu.setComposition({x, y})        shift the subject on screen (fractions of the viewport; + = right / down)
//   menu.setKartVisible(bool)          hide the hero kart (e.g. on plain list screens)
//   menu.showPodium(entries) / hidePodium() / confetti()     (see podium section)
//   menu.update(dt)  menu.render()     driven by App.tick / App.renderFrame
//
// The scene is deliberately cheap (one kart, ~12 draw calls, a half-resolution planar reflection) and relies on nothing but
// three.js + createKartShowcase, so a richer showcase from Agent C simply drops in.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createKartShowcase } from '../vehicles/KartVisuals.js';
import { clamp, damp, lerp, wrapAngle } from '../core/math.js';

const PRESETS = {
  title:  { dist: 8.6, height: 1.25, look: [0, 0.95, 0], fov: 33, base: 0.62, sway: 0.34, speed: 0.16, spin: 0.42 },
  select: { dist: 6.6, height: 1.75, look: [0, 0.8, 0], fov: 37, base: 0.5, sway: 0.2, speed: 0.19, spin: 0.55 },
  wide:   { dist: 10, height: 3.2, look: [0, 0.6, 0], fov: 39, base: 0.5, sway: 0.14, speed: 0.12, spin: 0.3 },
  dim:    { dist: 11, height: 3.4, look: [0, 0.4, 0], fov: 41, base: 0.45, sway: 0.1, speed: 0.1, spin: 0.2 },
  podium: { dist: 12.5, height: 3.0, look: [0, 1.7, 0], fov: 38, base: 0, sway: 0.1, speed: 0.12, spin: 0 },
};

/** Look applied to the renderer's post chain (Agent C) while a menu is on screen. */
const MENU_PROFILE = { exposure: 1.05, bloomStrength: 0.6, bloomThreshold: 0.8, bloomRadius: 0.65, vignette: 0.4, saturation: 1.1, contrast: 1.06 };

const c = (hex) => new THREE.Color(hex);

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MenuScene {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(37, 16 / 9, 0.1, 200);
    this.t = 0;
    this.active = true;
    this.preset = 'title';
    this.cam = { dist: 8.6, height: 1.25, fov: 33, base: 0.62, sway: 0.34, speed: 0.16, spin: 0.42, look: new THREE.Vector3(0, 0.95, 0) };
    this.comp = { x: 0, y: 0, cx: 0, cy: 0 };
    this.drag = { on: false, vel: 0, extra: 0, lastX: 0 };
    this.theme = { primary: c('#22d3ff'), secondary: c('#ff7a1a'), tp: c('#22d3ff'), ts: c('#ff7a1a') };
    this.showcase = null;
    this.leaving = [];
    this.podium = null;
    this._disposables = [];
    this._build();
    this._bindPointer();
  }

  // ------------------------------------------------------------------------------------------------ build
  _own(o) { this._disposables.push(o); return o; }

  _build() {
    const scene = this.scene;
    const bg = this._own(canvasTex(8, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#070b1e'); grad.addColorStop(0.45, '#14205a'); grad.addColorStop(0.62, '#1b2a73'); grad.addColorStop(1, '#070b1e');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }));
    scene.background = bg;
    scene.fog = new THREE.Fog(0x0b1130, 20, 70);

    this._buildEnvironment();
    this._buildLights();
    this._buildStage();
    this._buildBackdrop();
    this._buildParticles();

    this.turntable = new THREE.Group();
    this.turntable.position.y = 0.06;
    scene.add(this.turntable);
    this.setKart(this.app.save?.profile?.favoriteDriver ?? 'pip', this.app.save?.profile?.favoriteKart ?? 'classic', { instant: true });
  }

  /** A tiny coloured "studio" turned into an environment map so glossy paint has something nice to reflect. */
  _buildEnvironment() {
    try {
      const gl = this.app.renderer?.renderer;
      if (!gl) return;
      const env = new THREE.Scene();
      const room = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({ color: 0x0b1130, side: THREE.BackSide }));
      env.add(room);
      const panel = (w, h, color, x, y, z, ry, rx = 0, k = 1) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c(color).multiplyScalar(k), side: THREE.DoubleSide, toneMapped: false }));
        m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
      };
      panel(14, 8, '#ffffff', 0, 9.8, 0, 0, Math.PI / 2, 3.2);            // big top softbox
      panel(2.4, 10, '#22d3ff', -12, 3, 2, Math.PI / 2, 0, 4);            // cyan strip left
      panel(2.4, 10, '#ff7a1a', 12, 3, -2, -Math.PI / 2, 0, 4);           // orange strip right
      panel(10, 3, '#ff3dcb', 0, 2, -14, 0, 0, 2.2);                      // magenta accent behind
      panel(8, 2.2, '#bcd2ff', 0, 1.6, 13, Math.PI, 0, 1.6);              // cool fill in front
      const pm = new THREE.PMREMGenerator(gl);
      const rt = pm.fromScene(env, 0.035);
      this._env = rt;
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.9;
      pm.dispose();
      env.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    } catch (e) { console.warn('[menu] environment map unavailable', e); }
  }

  _buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x8fa8ff, 0x10163a, 0.8);
    s.add(this.hemi);
    this.key = new THREE.SpotLight(0xfff0dc, 520, 40, 0.55, 0.6, 1.6);
    this.key.position.set(5.5, 10, 6.5);
    this.key.target.position.set(0, 0.6, 0);
    s.add(this.key, this.key.target);
    this.rimA = new THREE.DirectionalLight(0x22d3ff, 3.2);
    this.rimA.position.set(-7, 4, -7);
    this.rimB = new THREE.DirectionalLight(0xff7a1a, 2.8);
    this.rimB.position.set(7, 3, -6);
    this.fill = new THREE.DirectionalLight(0xbfd0ff, 0.7);
    this.fill.position.set(-5, 3, 7);
    s.add(this.rimA, this.rimB, this.fill);
  }

  _buildStage() {
    const s = this.scene;
    const stage = new THREE.Group();
    stage.name = 'menu-stage';
    s.add(stage);
    this.stage = stage;

    // planar reflection (half-res; skipped on 'low') under a dark glossy overlay
    const q = this.app.quality;
    if (q?.id !== 'low') {
      try {
        const refl = new Reflector(new THREE.CircleGeometry(9, 64), { textureWidth: 512, textureHeight: 512, color: 0x8a9cd8, clipBias: 0.003 });
        refl.rotation.x = -Math.PI / 2;
        stage.add(refl);
        this.reflector = refl;
      } catch (e) { console.warn('[menu] reflector unavailable', e); }
    }
    // dark glossy overlay: translucent when there is a mirror underneath, opaque (just a nice gradient) when there isn't
    const aMid = this.reflector ? 0.62 : 1, aOut = this.reflector ? 0.8 : 1;
    const floorTex = this._own(canvasTex(256, 256, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, `rgba(30,42,104,${aMid})`); grad.addColorStop(0.55, `rgba(16,24,66,${aOut})`); grad.addColorStop(0.93, 'rgba(10,15,40,0.96)'); grad.addColorStop(1, 'rgba(10,15,40,1)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }));
    this.floorMat = new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, toneMapped: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9.02, 64), this.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; floor.renderOrder = 1;
    stage.add(floor);

    // LED rings on the platform
    this.ringMat = new THREE.MeshBasicMaterial({ color: this.theme.primary.clone().multiplyScalar(2.4), toneMapped: false });
    this.ringMat2 = new THREE.MeshBasicMaterial({ color: this.theme.secondary.clone().multiplyScalar(2.2), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.035, 8, 120), this.ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.02, 8, 120), this.ringMat2);
    ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.025;
    stage.add(ring, ring2);
    this.rings = [ring, ring2];

    // soft contact shadow
    const shTex = this._own(canvasTex(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.75)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }));
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.012; this.shadow.renderOrder = 2;
    stage.add(this.shadow);

    // glowing pulse ring used when the kart changes
    this.pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    this.pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), this.pulseMat);
    this.pulseRing.rotation.x = -Math.PI / 2; this.pulseRing.position.y = 0.05; this.pulseRing.renderOrder = 3;
    stage.add(this.pulseRing);
    this.pulseT = 1;

    // neon grid out to the horizon (scrolls slowly)
    this.gridUniforms = { uTime: { value: 0 }, uColor: { value: this.theme.primary.clone() } };
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), this._own(new THREE.ShaderMaterial({
      uniforms: this.gridUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.); }',
      fragmentShader: `varying vec3 vP; uniform float uTime; uniform vec3 uColor;
        float line(float x, float w){ float d = abs(fract(x - .5) - .5); float fw = fwidth(x); return 1. - smoothstep(0., fw * w, d); }
        void main(){
          vec2 p = vP.xz; p.y += uTime * 1.2;
          float g = max(line(p.x / 4., 1.4), line(p.y / 4., 1.4));
          float r = length(vP.xz);
          float fade = smoothstep(9.5, 16., r) * (1. - smoothstep(55., 120., r));
          gl_FragColor = vec4(uColor * (.9 + .6 * g), g * fade * .55);
        }`,
    })));
    grid.rotation.x = -Math.PI / 2; grid.position.y = -0.03; grid.renderOrder = 0;
    s.add(grid);
    this.grid = grid;
  }

  /** Vertical light bars + spotlight cones: depth cues that orbit nicely and feed bloom. */
  _buildBackdrop() {
    const s = this.scene;
    // glowing neon light "tubes": camera-facing soft planes (bright core, fading ends), far enough never to read as slabs
    const bars = new THREE.Group();
    this.barMats = [];
    const cols = ['#22d3ff', '#8b4dff', '#ff7a1a', '#ff3dcb', '#22d3ff', '#ffd23f', '#8b4dff'];
    const barMat = (color) => this._own(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: c(color) }, uA: { value: 0.8 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying vec2 vUv; uniform vec3 uColor; uniform float uA; void main(){ float g = smoothstep(0., .22, vUv.y) * (1. - smoothstep(.55, 1., vUv.y)); float core = pow(max(0., 1. - abs(vUv.x - .5) * 2.), 1.6); gl_FragColor = vec4(uColor * (1.1 + 1.3 * core), g * uA * (.25 + .75 * core)); }',
    }));
    const N = 26;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (i % 2) * 0.05;
      const r = 26 + (i % 3) * 5.5;
      const hgt = 7 + ((i * 7) % 6) * 2.3;
      const mat = barMat(cols[i % cols.length]);
      this.barMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5 + (i % 3) * 0.5, hgt), mat);
      m.position.set(Math.sin(a) * r, hgt / 2 - 0.4, Math.cos(a) * r);
      m.lookAt(0, hgt / 2 - 0.4, 0);
      m.renderOrder = 0;
      bars.add(m);
    }
    s.add(bars);
    this.bars = bars;

    // volumetric-ish spotlight cones
    const coneMat = (color) => this._own(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: c(color) }, uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uTime; void main(){ float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float h = pow(clamp(vUv.y, 0., 1.), 1.4); gl_FragColor = vec4(uColor * 1.6, fres * h * (.30 + .06 * sin(uTime * 1.3))); }',
    }));
    this.cones = [];
    const mk = (color, x, z) => {
      const geo = new THREE.ConeGeometry(2.6, 14, 40, 1, true);
      geo.translate(0, -7, 0);                  // apex at the origin, base 14 m below it
      const m = new THREE.Mesh(geo, coneMat(color));
      m.position.set(x, 13, z);
      // aim the cone's axis (apex -> base, i.e. local -Y) at the middle of the stage
      const dir = new THREE.Vector3(-x * 0.55, -13, -z * 0.55).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      m.renderOrder = 4;
      s.add(m); this.cones.push(m);
    };
    mk('#22d3ff', -5.5, -3.5); mk('#ff7a1a', 5.5, -3.5); mk('#8b4dff', 0, -8);
  }

  _buildParticles() {
    const N = 150;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N);
    for (let i = 0; i < N; i++) this._respawnParticle(i, true);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    const tex = this._own(canvasTex(64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(160,200,255,0.5)'); grad.addColorStop(1, 'rgba(160,200,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    }));
    this.pMat = new THREE.PointsMaterial({ map: tex, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, sizeAttenuation: true, color: 0xbcd6ff, toneMapped: false });
    this.particles = new THREE.Points(geo, this.pMat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  _respawnParticle(i, initial = false) {
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 8;
    this.pPos[i * 3] = Math.cos(a) * r;
    this.pPos[i * 3 + 1] = initial ? Math.random() * 7 : -0.2;
    this.pPos[i * 3 + 2] = Math.sin(a) * r;
    this.pVel[i] = 0.12 + Math.random() * 0.4;
  }

  // ------------------------------------------------------------------------------------------------ pointer (drag to rotate)
  _bindPointer() {
    const canvas = this.app.canvas;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active || (e.target !== canvas)) return;
      this.drag.on = true; this.drag.lastX = e.clientX; this.drag.vel = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag.on) return;
      const dx = e.clientX - this.drag.lastX; this.drag.lastX = e.clientX;
      this.drag.extra += dx * 0.012; this.drag.vel = dx * 0.012;
    });
    const end = () => { this.drag.on = false; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------------------------------------ public API
  /** Swap the hero kart: the old one shrinks away, the new one pops in with a pulse ring. */
  setKart(driverId, bodyId, { instant = false, silhouette = false } = {}) {
    const key = `${driverId}:${bodyId}:${silhouette ? 's' : ''}`;
    if (this.showcase && this.showcase.key === key) return;
    const next = (() => {
      try { return createKartShowcase(driverId, bodyId); } catch (e) { console.warn('[menu] showcase failed', e); return null; }
    })();
    if (next && silhouette) {
      // "mystery" reveal for locked content: same model, flat dark glossy material with a faint blue glow
      const dark = new THREE.MeshStandardMaterial({ color: 0x0c1234, roughness: 0.35, metalness: 0.3, emissive: 0x1a2a8a, emissiveIntensity: 0.4 });
      next.root.traverse((o) => {
        if (!o.isMesh) return;
        const old = o.material;
        o.material = dark;
        (Array.isArray(old) ? old : [old]).forEach((m) => m?.dispose?.());
      });
      next.silhouetteMat = dark;
    }
    if (this.showcase) {
      const old = this.showcase;
      if (instant) this._dropShowcase(old);
      else { old.leave = 0; this.leaving.push(old); }
    }
    if (!next) { this.showcase = null; return; }
    next.key = key;
    next.driverId = driverId; next.bodyId = bodyId;
    next.enter = instant ? 1 : 0;
    next.holder = new THREE.Group();
    next.holder.add(next.root);
    next.holder.rotation.y = this.showcase?.holder ? this.showcase.holder.rotation.y : -0.55;
    next.holder.scale.setScalar(instant ? 1 : 0.01);
    next.holder.visible = this.kartVisible !== false;
    this.turntable.add(next.holder);
    this.showcase = next;
    if (!instant) this.pulse();
  }

  _dropShowcase(s) {
    s.holder?.removeFromParent();
    try { s.dispose?.(); } catch { /* ignore */ }
    s.silhouetteMat?.dispose?.();
  }

  setKartVisible(v) {
    this.kartVisible = !!v;
    if (this.showcase?.holder) this.showcase.holder.visible = this.kartVisible && !this.podium?.group.visible;
    this.shadow.visible = this.kartVisible && !this.podium?.group.visible;
  }

  setPreset(name) { if (PRESETS[name]) { this.preset = name; } }

  setComposition({ x = 0, y = 0 } = {}) { this.comp.x = x; this.comp.y = y; }

  /** Tint the rig toward a track's colours; null returns to the default cyan/orange. */
  setTheme(colors) {
    this.theme.tp.set(colors?.primary ?? '#22d3ff');
    this.theme.ts.set(colors?.secondary ?? '#ff7a1a');
  }

  /** Expanding ring + a little hop of the kart: acknowledges a selection. */
  pulse(color) {
    this.pulseT = 0;
    this.pulseMat.color.set(color ?? '#ffffff').multiplyScalar(2);
    if (this.showcase) this.showcase.hop = 1;
  }

  /** Make the renderer's post chain look like "the menu" (the last track's profile must not leak in). */
  applyProfile() { try { this.app.renderer.setEnvironmentProfile?.(MENU_PROFILE); } catch { /* optional hook */ } }

  // ------------------------------------------------------------------------------------------------ frame
  update(dt) {
    const rm = !!this.app.settings?.reducedMotion;
    dt = Math.min(dt, 0.1);
    this.t += rm ? dt * 0.35 : dt;
    const t = this.t;
    const P = PRESETS[this.preset];
    const k = 1 - Math.exp(-3.2 * dt);
    const cam = this.cam;
    for (const key of ['dist', 'height', 'fov', 'base', 'sway', 'speed', 'spin']) cam[key] += (P[key] - cam[key]) * k;
    cam.look.x += (P.look[0] - cam.look.x) * k; cam.look.y += (P.look[1] - cam.look.y) * k; cam.look.z += (P.look[2] - cam.look.z) * k;

    // theme colour tween
    const tk = 1 - Math.exp(-2.5 * dt);
    this.theme.primary.lerp(this.theme.tp, tk); this.theme.secondary.lerp(this.theme.ts, tk);
    this.ringMat.color.copy(this.theme.primary).multiplyScalar(2.4);
    this.ringMat2.color.copy(this.theme.secondary).multiplyScalar(2.2);
    this.rimA.color.copy(this.theme.primary); this.rimB.color.copy(this.theme.secondary);
    this.gridUniforms.uColor.value.copy(this.theme.primary);
    this.gridUniforms.uTime.value = rm ? 0 : t;
    if (this.cones[0]) { this.cones[0].material.uniforms.uColor.value.copy(this.theme.primary); this.cones[1].material.uniforms.uColor.value.copy(this.theme.secondary); }
    for (const m of this.cones) m.material.uniforms.uTime.value = t;

    // camera: gentle sway around a base angle (+ user drag shifts the kart, not the camera)
    const ang = cam.base + Math.sin(t * cam.speed * Math.PI * 2) * cam.sway * (rm ? 0.25 : 1);
    const bob = Math.sin(t * 0.37) * 0.12 * (rm ? 0 : 1);
    this.camera.position.set(Math.sin(ang) * cam.dist, cam.height + bob, Math.cos(ang) * cam.dist);
    this.camera.lookAt(cam.look);
    if (Math.abs(this.camera.fov - cam.fov) > 0.01) { this.camera.fov = cam.fov; this.camera.updateProjectionMatrix(); }

    // hero kart: turntable spin + drag, enter/leave animation, selection hop
    this.drag.vel = damp(this.drag.vel, 0, 3, dt);
    if (!this.drag.on) this.drag.extra += this.drag.vel;
    const sc = this.showcase;
    if (sc) {
      sc.enter = Math.min(1, sc.enter + dt * 2.6);
      const e = sc.enter;
      const pop = e < 1 ? 1 - Math.pow(1 - e, 3) * Math.cos(e * 7.5) : 1;   // springy overshoot (~20 %)
      sc.hop = Math.max(0, (sc.hop ?? 0) - dt * 2.4);
      const hopY = Math.sin((1 - sc.hop) * Math.PI) * (sc.hop > 0 ? 0.28 : 0);
      sc.holder.scale.setScalar(Math.max(0.01, pop) * (1 + sc.hop * 0.0));
      sc.holder.position.y = hopY;
      const spin = (this.drag.on ? 0 : cam.spin * (rm ? 0.3 : 1)) * dt;
      sc.holder.rotation.y = wrapAngle(sc.holder.rotation.y + spin + (this.drag.on ? this.drag.vel : 0));
      sc.update?.(dt);
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const o = this.leaving[i];
      o.leave += dt * 3.4;
      o.holder.scale.setScalar(Math.max(0.001, 1 - o.leave));
      o.holder.rotation.y += dt * 4;
      if (o.leave >= 1) { this._dropShowcase(o); this.leaving.splice(i, 1); }
    }

    // pulse ring
    if (this.pulseT < 1) {
      this.pulseT = Math.min(1, this.pulseT + dt * 1.8);
      const u = this.pulseT;
      const r = 1.6 + u * 4.2;
      this.pulseRing.scale.set(r, r, r);
      this.pulseMat.opacity = (1 - u) * (1 - u) * 0.9;
    } else this.pulseMat.opacity = 0;

    // bars + particles
    for (let i = 0; i < this.barMats.length; i++) this.barMats[i].uniforms.uA.value = 0.6 + 0.35 * Math.sin(t * 0.8 + i * 1.7);
    this.bars.rotation.y = rm ? 0 : t * 0.012;
    if (!rm) {
      const p = this.pPos;
      for (let i = 0; i < this.pVel.length; i++) {
        p[i * 3 + 1] += this.pVel[i] * dt;
        p[i * 3] += Math.sin(t * 0.7 + i) * 0.06 * dt;
        if (p[i * 3 + 1] > 7) this._respawnParticle(i);
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
    this.podium?.update?.(dt, t);
  }

  _applyComposition() {
    const r = this.app.renderer;
    const W = Math.max(2, r.width || 1280), H = Math.max(2, r.height || 720);
    const k = 0.18;
    this.comp.cx += (this.comp.x - this.comp.cx) * k; this.comp.cy += (this.comp.y - this.comp.cy) * k;
    if (Math.abs(this.comp.cx) < 0.0005 && Math.abs(this.comp.cy) < 0.0005) { if (this.camera.view?.enabled) this.camera.clearViewOffset(); return; }
    this.camera.setViewOffset(W, H, -this.comp.cx * W, -this.comp.cy * H, W, H);
  }

  render() {
    this._applyComposition();
    this.app.renderer.render(this.scene, this.camera, null);
  }

  dispose() {
    for (const o of this._disposables) o.dispose?.();
    this._env?.dispose?.();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material && !o.material.isShaderMaterial) o.material.dispose?.(); });
  }
}
