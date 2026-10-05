// Emote bubbles: little voice-less speech bubbles that pop up over a driver's head (anger when hit, "!" when overtaken, a heart when
// they win, a sweat drop when they lose...).  OWNER: Agent C (vfx).
// ONE instanced camera-facing quad mesh for every bubble in the race (one draw call), a procedural 4x2 sprite atlas, no allocation per frame.
import * as THREE from 'three';

export const EMOTE = Object.freeze({ ANGER: 0, SHOCK: 1, NOTE: 2, HEART: 3, SWEAT: 4, QUESTION: 5, STAR: 6, ZZZ: 7 });
const NAMES = { anger: 0, shock: 1, note: 2, heart: 3, sweat: 4, question: 5, star: 6, zzz: 7 };
export const EMOTE_NAMES = Object.keys(NAMES);
const COLS = 4, ROWS = 2, CELL = 128;

function bubble(g, c) {
  // white rounded speech bubble with a soft tail, dark outline
  g.save();
  g.translate(c, c * 0.92);
  g.lineJoin = 'round';
  g.beginPath();
  g.roundRect(-c * 0.78, -c * 0.62, c * 1.56, c * 1.18, c * 0.42);
  g.moveTo(-c * 0.18, c * 0.5); g.lineTo(-c * 0.34, c * 0.86); g.lineTo(c * 0.14, c * 0.54);
  g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = c * 0.075; g.strokeStyle = '#1b2140'; g.stroke();
  g.restore();
}
function star(g, x, y, r, r2, n, fill, stroke) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? r2 : r; const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = 3; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
}

const DRAW = [
  // 0 anger: red vein mark (four bent strokes)
  (g, c) => {
    g.save(); g.translate(c, c * 0.92); g.fillStyle = '#ff3b3b'; g.strokeStyle = '#7a0c14'; g.lineWidth = 3.5; g.lineJoin = 'round';
    for (let k = 0; k < 4; k++) {
      g.save(); g.rotate((k * Math.PI) / 2 + Math.PI / 4);
      g.beginPath(); g.moveTo(c * 0.1, c * 0.1); g.quadraticCurveTo(c * 0.5, c * 0.12, c * 0.52, c * 0.52); g.quadraticCurveTo(c * 0.3, c * 0.4, c * 0.1, c * 0.1); g.fill(); g.stroke(); g.restore();
    }
    g.restore();
  },
  // 1 shock: exclamation mark
  (g, c) => {
    g.save(); g.translate(c, c * 0.9); g.fillStyle = '#ff9d1f'; g.strokeStyle = '#8a4a00'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-c * 0.13, -c * 0.46); g.lineTo(c * 0.13, -c * 0.46); g.lineTo(c * 0.09, c * 0.12); g.lineTo(-c * 0.09, c * 0.12); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, c * 0.33, c * 0.12, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  },
  // 2 music note
  (g, c) => {
    g.save(); g.translate(c, c * 0.9); g.fillStyle = '#7b4dff'; g.strokeStyle = '#2b1a73'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.ellipse(-c * 0.16, c * 0.28, c * 0.2, c * 0.15, -0.4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(c * 0.0, c * 0.24); g.lineTo(c * 0.0, -c * 0.44); g.lineTo(c * 0.36, -c * 0.3); g.lineTo(c * 0.36, -c * 0.12); g.lineTo(c * 0.0, -c * 0.26); g.closePath(); g.fill(); g.stroke();
    g.restore();
  },
  // 3 heart
  (g, c) => {
    g.save(); g.translate(c, c * 0.9); g.fillStyle = '#ff3d6a'; g.strokeStyle = '#8a1535'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, c * 0.36);
    g.bezierCurveTo(-c * 0.62, -c * 0.04, -c * 0.4, -c * 0.5, 0, -c * 0.2);
    g.bezierCurveTo(c * 0.4, -c * 0.5, c * 0.62, -c * 0.04, 0, c * 0.36);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-c * 0.24, -c * 0.16, c * 0.08, c * 0.05, -0.6, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  // 4 sweat drop
  (g, c) => {
    g.save(); g.translate(c, c * 0.9); g.fillStyle = '#4cc3ff'; g.strokeStyle = '#124a7a'; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, -c * 0.46); g.bezierCurveTo(c * 0.46, c * 0.04, c * 0.34, c * 0.42, 0, c * 0.42); g.bezierCurveTo(-c * 0.34, c * 0.42, -c * 0.46, c * 0.04, 0, -c * 0.46); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(-c * 0.12, c * 0.12, c * 0.06, c * 0.13, 0.3, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  // 5 question mark
  (g, c) => {
    g.save(); g.translate(c, c * 0.9); g.strokeStyle = '#2b9a4a'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = c * 0.2; g.beginPath(); g.moveTo(-c * 0.24, -c * 0.22); g.bezierCurveTo(-c * 0.24, -c * 0.52, c * 0.3, -c * 0.52, c * 0.28, -c * 0.2); g.bezierCurveTo(c * 0.26, 0.0, 0, 0.0, 0, c * 0.14); g.stroke();
    g.fillStyle = '#2b9a4a'; g.beginPath(); g.arc(0, c * 0.4, c * 0.11, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  // 6 star
  (g, c) => { g.save(); g.translate(c, c * 0.9); star(g, 0, 0, c * 0.5, c * 0.22, 5, '#ffd23f', '#9a6a00'); g.restore(); },
  // 7 zzz
  (g, c) => {
    g.save(); g.translate(c, c * 0.9); g.fillStyle = '#5f7bff'; g.strokeStyle = '#1b2a8a'; g.lineWidth = 2.5; g.lineJoin = 'round';
    g.font = `900 ${c * 0.62}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText('Zz', 0, 0); g.fillText('Zz', 0, 0);
    g.restore();
  },
];

let atlas = null;
function getAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = COLS * CELL; cv.height = ROWS * CELL;
  const g = cv.getContext('2d');
  for (let i = 0; i < DRAW.length; i++) {
    const col = i % COLS, row = (i / COLS) | 0;
    g.save(); g.beginPath(); g.rect(col * CELL, row * CELL, CELL, CELL); g.clip(); g.translate(col * CELL, row * CELL);
    bubble(g, CELL / 2); DRAW[i](g, CELL / 2);
    g.restore();
  }
  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4; atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}
export function disposeEmoteAtlas() { atlas?.dispose(); atlas = null; }

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iData;     // size (m), alpha, cell, -
uniform vec2 uAtlas;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iData.x;
  gl_Position = projectionMatrix * mv;
  float f = floor(iData.z + 0.5);
  vec2 cell = vec2(mod(f, uAtlas.x), uAtlas.y - 1.0 - floor(f / uAtlas.x));
  vUv = (cell + uv) / uAtlas;
  vA = iData.y;
}
`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SLOTS = 14;
const _p = new THREE.Vector3();

export class EmoteBubbles {
  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.iPos);
    g.setAttribute('iData', this.iData);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: getAtlas() }, uAtlas: { value: new THREE.Vector2(COLS, ROWS) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    this.mesh.name = 'emotes';
    this.mesh.visible = false;
    this.slots = [];
    for (let i = 0; i < SLOTS; i++) this.slots.push({ kart: null, kind: 0, t: 0, dur: 0 });
  }

  /** Show `kind` (EMOTE value or name) over `kart` for `dur` seconds.  A kart shows one bubble at a time (the newest wins). */
  show(kart, kind, dur = 1.4) {
    const k = typeof kind === 'string' ? NAMES[kind] : kind;
    if (k === undefined || !kart) return false;
    let slot = null;
    for (const s of this.slots) if (s.kart === kart) { slot = s; break; }
    if (!slot) for (const s of this.slots) if (!s.kart) { slot = s; break; }
    if (!slot) { slot = this.slots[0]; for (const s of this.slots) if (s.t / s.dur > slot.t / slot.dur) slot = s; }   // evict the oldest
    slot.kart = kart; slot.kind = k; slot.t = 0; slot.dur = dur;
    return true;
  }

  /** Move / animate the active bubbles.  `cam` = the camera (to skip far karts), `maxDist` metres. */
  update(dt, cam, maxDist = 90) {
    const P = this.iPos.array, D = this.iData.array;
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.kart) continue;
      s.t += dt;
      if (s.t >= s.dur) { s.kart = null; continue; }
      const k = s.kart;
      if (k.respawn?.active) continue;
      const u = s.t / s.dur;
      // pop in with an overshoot, hold, then rise + fade
      const pop = s.t < 0.22 ? (s.t / 0.22) : 1;
      const scl = pop < 1 ? 1.28 * Math.sin(pop * Math.PI * 0.5) - 0.28 * pop * pop * pop : 1 + 0.06 * Math.sin(s.t * 6);
      const fade = u > 0.78 ? 1 - (u - 0.78) / 0.22 : 1;
      const sc = k.scale ?? 1;
      const up = k.up;
      const head = k.visual?.mountWorld ? k.visual.mountWorld('head', _p, k) : _p.copy(k.position);
      const lift = (0.95 + 0.25 * u) * sc + 0.2;
      const x = head.x + up.x * lift, y = head.y + up.y * lift, z = head.z + up.z * lift;
      if (cam) {
        const dx = cam.position.x - x, dy = cam.position.y - y, dz = cam.position.z - z;
        if (dx * dx + dy * dy + dz * dz > maxDist * maxDist) continue;
      }
      P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z;
      D[n * 4] = 1.15 * sc * Math.max(0.01, scl); D[n * 4 + 1] = Math.max(0, fade); D[n * 4 + 2] = s.kind; D[n * 4 + 3] = 0;
      n++;
    }
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) { this.iPos.needsUpdate = true; this.iData.needsUpdate = true; }
  }

  clear() { for (const s of this.slots) s.kart = null; this.geometry.instanceCount = 0; this.mesh.visible = false; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
