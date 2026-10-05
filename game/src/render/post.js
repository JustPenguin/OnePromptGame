// HDR post-processing chain. OWNER: Agent C (render).
//   scene -> MSAA half-float RT -> dual-filter bloom (Karis-averaged, soft threshold) -> ONE composite pass:
//   exposure, vignette, chromatic aberration, radial speed blur, speed lines, screen flash, ACES tone mapping,
//   sRGB, saturation/contrast grade, dither.  Everything shader-side; no per-frame allocation.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG_DOWN = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;       // 1 = apply threshold + Karis average
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 T(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}
void main() {
  vec3 a = T(vec2(-2.0, -2.0)), b = T(vec2(0.0, -2.0)), c = T(vec2(2.0, -2.0));
  vec3 d = T(vec2(-2.0, 0.0)),  e = T(vec2(0.0, 0.0)),  f = T(vec2(2.0, 0.0));
  vec3 g = T(vec2(-2.0, 2.0)),  h = T(vec2(0.0, 2.0)),  i = T(vec2(2.0, 2.0));
  vec3 j = T(vec2(-1.0, -1.0)), k = T(vec2(1.0, -1.0)), l = T(vec2(-1.0, 1.0)), m = T(vec2(1.0, 1.0));
  vec3 col;
  if (uFirst > 0.5) {
    vec3 g1 = prefilter((a + b + d + e) * 0.25), g2 = prefilter((b + c + e + f) * 0.25), g3 = prefilter((d + e + g + h) * 0.25), g4 = prefilter((e + f + h + i) * 0.25), g5 = prefilter((j + k + l + m) * 0.25);
    float w1 = 0.125 / (1.0 + luma(g1)), w2 = 0.125 / (1.0 + luma(g2)), w3 = 0.125 / (1.0 + luma(g3)), w4 = 0.125 / (1.0 + luma(g4)), w5 = 0.5 / (1.0 + luma(g5));
    col = (g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4 + g5 * w5) / (w1 + w2 + w3 + w4 + w5);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAG_UP = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;       // texel size of the SOURCE (smaller) mip
uniform float uRadius;
uniform float uWeight;
varying vec2 vUv;
vec3 T(vec2 o) { return texture2D(tSrc, vUv + o * uTexel * uRadius).rgb; }
void main() {
  vec3 c = T(vec2(-1.0, -1.0)) + T(vec2(0.0, -1.0)) * 2.0 + T(vec2(1.0, -1.0))
         + T(vec2(-1.0, 0.0)) * 2.0 + T(vec2(0.0, 0.0)) * 4.0 + T(vec2(1.0, 0.0)) * 2.0
         + T(vec2(-1.0, 1.0)) + T(vec2(0.0, 1.0)) * 2.0 + T(vec2(1.0, 1.0));
  gl_FragColor = vec4(c * (uWeight / 16.0), 1.0);
}
`;

const FRAG_COMPOSITE = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uSat;
uniform float uContrast;
uniform float uChroma;
uniform float uBlur;
uniform float uLines;
uniform float uBoost;
uniform float uGrain;
uniform float uTime;
uniform vec4 uFlash;
uniform vec2 uCenter;
uniform vec2 uAspect;
uniform float uHasBloom;
uniform float uTone;
varying vec2 vUv;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = ACESInputMat * color;
  vec3 a = color * (color + 0.0245786) - 0.000090537;
  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
  color = a / b;
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 neutralTM(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0, 1.0, 1.0), g);
}
vec3 tonemap(vec3 c) { return mix(neutralTM(c), aces(c), uTone); }

void main() {
  vec2 uv = vUv;
  vec2 d = (uv - uCenter) * uAspect;           // aspect-corrected offset from the focal point
  float r = length(d);
  // ---- scene sample: radial speed blur (centre stays sharp) + chromatic aberration (grows toward the edges)
  float mask = smoothstep(0.16, 0.75, r);
  vec2 dir = (uv - uCenter);
  vec3 col;
  float ca = uChroma * (0.35 + r * r * 2.2);
  if (uBlur > 0.0005) {
    col = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 9; i++) {
      float t = float(i) / 8.0;
      float w = 1.0 - t * 0.55;
      vec2 o = dir * (uBlur * mask * t);
      vec2 p = uv - o;
      col += vec3(texture2D(tScene, p - dir * ca).r, texture2D(tScene, p).g, texture2D(tScene, p + dir * ca).b) * w;
      wsum += w;
    }
    col /= wsum;
  } else {
    col = vec3(texture2D(tScene, uv - dir * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv + dir * ca).b);
  }
  if (uHasBloom > 0.5) col += texture2D(tBloom, uv).rgb * uBloom;
  // ---- speed lines (radial spokes near the edges only)
  if (uLines > 0.001) {
    float ang = atan(d.y, d.x) / 6.2831853 + 0.5;
    float lanes = 110.0;
    float lane = floor(ang * lanes);
    float h = hash11(lane + floor(uTime * 14.0) * 13.0);
    float fr = fract(ang * lanes);
    float spoke = step(0.84, h) * smoothstep(0.0, 0.2, fr) * (1.0 - smoothstep(0.55, 1.0, fr));
    float len = smoothstep(0.42 + h * 0.16, 0.95, r);
    col += mix(vec3(1.0, 0.97, 0.92), vec3(0.6, 0.9, 1.0), uBoost) * spoke * len * uLines * 0.9;
  }
  // ---- exposure, vignette, flash
  col *= uExposure;
  float vig = smoothstep(1.15, 0.38, r * 1.05);
  col *= mix(1.0, vig, uVignette);
  col += uFlash.rgb * uFlash.a;
  // ---- tone map, sRGB, grade (display space), dither
  col = tonemap(col);
  col = toSRGB(col);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  float n = hash12(gl_FragCoord.xy + fract(uTime) * 91.7) + hash12(gl_FragCoord.yx * 1.37 + fract(uTime * 1.7) * 53.1) - 1.0;
  col += n * (1.0 / 255.0 + uGrain);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Resolve pass used for portraits: tone map HDR + un-premultiply alpha into an 8-bit target. */
const FRAG_RESOLVE = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform float uExposure;
uniform float uTone;
varying vec2 vUv;
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = ACESInputMat * color;
  vec3 a = color * (color + 0.0245786) - 0.000090537;
  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
  color = a / b;
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 neutralTM(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0, 1.0, 1.0), g);
}
vec3 tonemap(vec3 c) { return mix(neutralTM(c), aces(c), uTone); }
void main() {
  vec4 t = texture2D(tSrc, vUv);
  vec3 c = t.a > 0.001 ? t.rgb / t.a : vec3(0.0);
  c = toSRGB(tonemap(c * uExposure));
  gl_FragColor = vec4(c, t.a);
}
`;

let _tri = null;
function triangle() {
  if (_tri) return _tri;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  _tri = g;
  return g;
}

export class PostChain {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.supported = this._detect();
    this.sceneRT = null;
    this.mips = [];
    this.levels = 5;
    this.samples = 4;
    this.w = 0; this.h = 0;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(triangle(), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    const common = { vertexShader: VERT, depthTest: false, depthWrite: false, toneMapped: false };
    this.downMat = new THREE.ShaderMaterial({ ...common, fragmentShader: FRAG_DOWN, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } } });
    this.upMat = new THREE.ShaderMaterial({ ...common, fragmentShader: FRAG_UP, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } } });
    this.compMat = new THREE.ShaderMaterial({
      ...common, fragmentShader: FRAG_COMPOSITE,
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.5 }, uVignette: { value: 0.35 }, uSat: { value: 1.08 }, uContrast: { value: 1.06 },
        uChroma: { value: 0.0015 }, uBlur: { value: 0 }, uLines: { value: 0 }, uBoost: { value: 0 }, uGrain: { value: 0.004 }, uTime: { value: 0 }, uFlash: { value: new THREE.Vector4() },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: new THREE.Vector2(1, 1) }, uHasBloom: { value: 1 }, uTone: { value: 0.2 },
      },
    });
    this.resolveMat = new THREE.ShaderMaterial({ ...common, fragmentShader: FRAG_RESOLVE, uniforms: { tSrc: { value: null }, uExposure: { value: 1 }, uTone: { value: 0.2 } } });
  }

  _detect() {
    const r = this.renderer;
    const gl2 = r.capabilities.isWebGL2;
    const ext = r.extensions;
    return !!gl2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  }

  /** (Re)allocate render targets for a drawing-buffer size. */
  resize(w, h, { samples = 4, levels = 5 } = {}) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    const maxS = this.renderer.capabilities.maxSamples ?? 4;
    samples = Math.min(samples, maxS);
    if (w === this.w && h === this.h && samples === this.samples && levels === this.levels && this.sceneRT) return;
    this.w = w; this.h = h; this.samples = samples; this.levels = levels;
    this._free();
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false, samples, generateMipmaps: false };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, opts);
    this.sceneRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.sceneRT.texture.name = 'sceneHDR';
    for (let i = 0; i < levels; i++) {
      const mw = Math.max(2, w >> (i + 1)), mh = Math.max(2, h >> (i + 1));
      const rt = new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
      this.mips.push(rt);
    }
  }

  _free() {
    this.sceneRT?.dispose(); this.sceneRT = null;
    for (const m of this.mips) m.dispose();
    this.mips.length = 0;
  }

  _pass(mat, target) {
    const r = this.renderer;
    this.quad.material = mat;
    r.setRenderTarget(target);
    r.render(this.quadScene, this.camera);
  }

  /**
   * Render `scene` through the chain to the canvas.
   * fx: { exposure, bloom, threshold, knee, radius, vignette, sat, contrast, chroma, blur, lines, boost, grain, flash:{r,g,b,a}, center:{x,y}, time, bloomOn }
   */
  render(scene, camera, fx) {
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = true;                 // clear + draw the scene...
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    r.autoClear = false;                // ...then full-screen passes must not clear (the bloom upsample accumulates)
    const hasBloom = fx.bloomOn && this.mips.length > 0 && fx.bloom > 0.001;
    if (hasBloom) {
      const D = this.downMat.uniforms;
      D.uThreshold.value = fx.threshold; D.uKnee.value = fx.knee;
      let src = this.sceneRT.texture, sw = this.w, sh = this.h;
      for (let i = 0; i < this.mips.length; i++) {
        D.tSrc.value = src; D.uTexel.value.set(1 / sw, 1 / sh); D.uFirst.value = i === 0 ? 1 : 0;
        this._pass(this.downMat, this.mips[i]);
        src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
      }
      const U = this.upMat.uniforms;
      for (let i = this.mips.length - 2; i >= 0; i--) {
        const s = this.mips[i + 1];
        U.tSrc.value = s.texture; U.uTexel.value.set(1 / s.width, 1 / s.height); U.uRadius.value = 0.7 + fx.radius * 0.9;
        U.uWeight.value = 0.55 + fx.radius * 0.5;
        this._pass(this.upMat, this.mips[i]);
      }
    }
    const C = this.compMat.uniforms;
    C.tScene.value = this.sceneRT.texture;
    C.tBloom.value = hasBloom ? this.mips[0].texture : this.sceneRT.texture;
    C.uHasBloom.value = hasBloom ? 1 : 0;
    C.uExposure.value = fx.exposure; C.uBloom.value = fx.bloom; C.uVignette.value = fx.vignette;
    C.uSat.value = fx.sat; C.uContrast.value = fx.contrast; C.uChroma.value = fx.chroma;
    C.uTone.value = fx.tone ?? 0.2;
    C.uBlur.value = fx.blur; C.uLines.value = fx.lines; C.uBoost.value = fx.boost; C.uGrain.value = fx.grain; C.uTime.value = fx.time;
    C.uFlash.value.set(fx.flash.r, fx.flash.g, fx.flash.b, fx.flash.a);
    C.uCenter.value.set(fx.center.x, fx.center.y);
    const asp = this.w / this.h;
    C.uAspect.value.set(asp > 1 ? asp : 1, asp > 1 ? 1 : 1 / asp);
    this._pass(this.compMat, null);
    r.autoClear = ac;
  }

  /** Tone-map an HDR render target (alpha-premultiplied by coverage) into an 8-bit target for readback. */
  resolve(srcTexture, dst, exposure = 1, tone = 0.2) {
    this.resolveMat.uniforms.uTone.value = tone;
    this.resolveMat.uniforms.tSrc.value = srcTexture;
    this.resolveMat.uniforms.uExposure.value = exposure;
    this._pass(this.resolveMat, dst);
  }

  dispose() {
    this._free();
    this.downMat.dispose(); this.upMat.dispose(); this.compMat.dispose(); this.resolveMat.dispose();
  }
}
