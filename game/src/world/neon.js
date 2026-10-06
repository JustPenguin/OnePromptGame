// Neon signage + light pools.   OWNER: Agent B.
//   createNeonSigns(world, [{ pos:[x,y,z], yaw, w, h, sign: index | name, flicker }])   ONE merged mesh, flicker/dropouts in the shader
//   createLightPools(world, [{ x, y, z, r, color, nx, ny, nz }])                          flat additive glow discs lying on the road
// The atlas is drawn with canvas: coloured tube-lettering with a soft outer glow, each cell 512x256.
import * as THREE from 'three';
import { toColor } from './geo.js';
import { glowTexture } from './textures.js';
import { mulberry32 } from '../core/math.js';

const SIGNS = [
  { name: 'KART', text: 'KART', color: '#ff3dcb', sub: 'RUSH' },
  { name: 'RAMEN', text: 'RAMEN', color: '#ffb347', frame: true },
  { name: 'HOTEL', text: 'HOTEL', color: '#22d3ff', frame: true },
  { name: 'ARCADE', text: 'ARCADE', color: '#7be04a', frame: true },
  { name: 'DISCO', text: 'DISCO', color: '#b86bff', frame: true },
  { name: 'BAR', text: 'BAR', color: '#ff3d6a', frame: true },
  { name: '24H', text: '24H', color: '#ffd23f', frame: true },
  { name: 'SUSHI', text: 'SUSHI', color: '#ff5f8f', frame: true },
  { name: 'TAXI', text: 'TAXI', color: '#ffd23f', frame: true },
  { name: 'NOODLE', text: 'NOODLES', color: '#22d3ff', frame: true },
  { name: 'PIZZA', text: 'PIZZA', color: '#ff7a1a', frame: true },
  { name: 'ARROW', arrow: true, color: '#ff3dcb' },
  { name: 'STAR', star: true, color: '#ffd23f' },
  { name: 'HEART', heart: true, color: '#ff3d6a' },
  { name: 'GAME', text: 'GAME', color: '#22d3ff', sub: 'OVER?' },
  { name: 'SPEED', text: 'SPEED', color: '#7be04a', frame: true },
];
export const NEON_SIGN_COUNT = SIGNS.length;
export const neonSignIndex = (name) => Math.max(0, SIGNS.findIndex((s) => s.name === name));

let atlas = null;
function buildAtlas() {
  if (atlas) return atlas;
  const cols = 4, rows = Math.ceil(SIGNS.length / cols), W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = cols * W; c.height = rows * H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  SIGNS.forEach((s, i) => {
    const x0 = (i % cols) * W, y0 = Math.floor(i / cols) * H;
    g.save(); g.translate(x0, y0);
    // dark backing plate (so the sign reads as a physical board) with a thin tube border
    g.fillStyle = 'rgba(10,8,24,0.78)'; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 26); g.fill();
    const glow = (draw, color, blur = 30) => {
      g.shadowColor = color; g.shadowBlur = blur; g.lineJoin = 'round'; g.lineCap = 'round';
      draw(); draw();
      g.shadowBlur = 0;
    };
    if (s.frame || s.sub) { glow(() => { g.strokeStyle = s.color; g.lineWidth = 7; g.beginPath(); g.roundRect(26, 26, W - 52, H - 52, 20); g.stroke(); }, s.color, 22); }
    if (s.text) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = s.sub ? 112 : 132;
      g.font = `900 italic ${fs}px "KR Display", "Lilita One", Impact, sans-serif`;
      const ty = s.sub ? H * 0.43 : H * 0.52;
      glow(() => { g.strokeStyle = s.color; g.lineWidth = 9; g.strokeText(s.text, W / 2, ty); }, s.color, 34);
      g.fillStyle = '#fff6ff'; g.globalAlpha = 0.9; g.fillText(s.text, W / 2, ty); g.globalAlpha = 1;
      g.strokeStyle = s.color; g.lineWidth = 3; g.strokeText(s.text, W / 2, ty);
      if (s.sub) { g.font = `800 56px "KR UI", Nunito, Arial, sans-serif`; glow(() => { g.fillStyle = s.color; g.fillText(s.sub, W / 2, H * 0.77); }, s.color, 24); }
    }
    if (s.arrow) {
      glow(() => { g.strokeStyle = s.color; g.lineWidth = 16; g.beginPath(); g.moveTo(70, H / 2); g.lineTo(W - 120, H / 2); g.moveTo(W - 190, H * 0.22); g.lineTo(W - 90, H / 2); g.lineTo(W - 190, H * 0.78); g.stroke(); }, s.color, 30);
    }
    if (s.star) {
      glow(() => { g.strokeStyle = s.color; g.lineWidth = 11; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 46 : 100; const px = W / 2 + Math.cos(a) * r * 1.2, py = H / 2 + Math.sin(a) * r; if (k) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); g.stroke(); }, s.color, 30);
    }
    if (s.heart) {
      glow(() => { g.strokeStyle = s.color; g.lineWidth = 12; g.beginPath(); g.moveTo(W / 2, H * 0.8); g.bezierCurveTo(W * 0.1, H * 0.5, W * 0.28, H * 0.12, W / 2, H * 0.36); g.bezierCurveTo(W * 0.72, H * 0.12, W * 0.9, H * 0.5, W / 2, H * 0.8); g.stroke(); }, s.color, 30);
    }
    g.restore();
  });
  atlas = { canvas: c, cols, rows };
  return atlas;
}

const VERT = /* glsl */ `
  attribute float aInfo;           // x = flicker amount + phase packed: floor(aInfo) = phase seed, fract = flicker
  uniform float uTime;
  varying vec2 vUv; varying float vB;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    float seed = floor( aInfo ), fl = fract( aInfo ) * 1.0101;
    float a = 0.5 + 0.5 * sin( uTime * ( 2.0 + mod( seed, 5.0 ) ) + seed );
    float drop = step( 0.9, fract( sin( floor( uTime * 5.0 + seed * 13.0 ) * 12.9898 + seed * 78.233 ) * 43758.5453 ) );
    vB = 1.0 - fl * ( 0.18 * a + 0.85 * drop );
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform float uGain;
  varying vec2 vUv; varying float vB;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D( uMap, vUv );
    if ( t.a < 0.02 ) discard;
    vec3 c = t.rgb * vB * uGain;
    gl_FragColor = vec4( c, t.a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** items = [{ x, y, z (centre), yaw (the sign faces +Z rotated by yaw), w, h, sign: name|index, flicker: 0..1 }] */
export function createNeonSigns(world, items, { gain = 1.6, name = 'neon-signs' } = {}) {
  const at = buildAtlas();
  const tex = world.tex(new THREE.CanvasTexture(at.canvas));
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  const pos = [], uv = [], info = [], idx = [];
  const rnd = mulberry32(77);
  items.forEach((it, k) => {
    const si = typeof it.sign === 'number' ? it.sign : neonSignIndex(it.sign);
    const cx = si % at.cols, cy = Math.floor(si / at.cols);
    const u0 = cx / at.cols, u1 = (cx + 1) / at.cols, v1 = 1 - cy / at.rows, v0 = 1 - (cy + 1) / at.rows;
    const hw = it.w / 2, h = it.h;
    const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
    const corners = [[-hw, 0], [hw, 0], [hw, h], [-hw, h]];
    const base = pos.length / 3;
    const seed = 1 + Math.floor(rnd() * 400);
    for (const [lx, ly] of corners) {
      // local +X is the sign's right-hand side seen from the front; the front normal = (sin yaw, 0, cos yaw)
      pos.push(it.x + lx * c, it.y + ly, it.z - lx * s);
      info.push(seed + Math.min(0.99, (it.flicker ?? 0.3)) / 1.0101);
    }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: world.timeUniform, uMap: { value: tex }, uGain: { value: gain } }]),
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name; mesh.renderOrder = 6; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
  world.group.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------------------------------------------------------
/** Flat additive glow discs lying on a surface (street-lamp light pools on the asphalt).  items: { x, y, z, r, color, ux,uy,uz (surface up) } */
export function createLightPools(world, items, { name = 'light-pools', intensity = 0.55 } = {}) {
  const map = world.tex(glowTexture({ inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)', hard: 0.0, size: 128 }));
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const up = new THREE.Vector3(), r = new THREE.Vector3(), f = new THREE.Vector3();
  for (const it of items) {
    up.set(it.ux ?? 0, it.uy ?? 1, it.uz ?? 0).normalize();
    r.crossVectors(Math.abs(up.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), up).normalize();
    f.crossVectors(up, r).normalize();
    toColor(it.color ?? '#ffcf8a', c);
    const base = pos.length / 3;
    const rr = it.r ?? 8, lift = 0.07;
    for (const [a, b, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      pos.push(it.x + r.x * a * rr + f.x * b * rr + up.x * lift, it.y + r.y * a * rr + f.y * b * rr + up.y * lift, it.z + r.z * a * rr + f.z * b * rr + up.z * lift);
      uv.push(u, v); col.push(c.r, c.g, c.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: intensity, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true });
  const m = new THREE.Mesh(g, mat);
  m.name = name; m.renderOrder = 4; m.matrixAutoUpdate = false;
  world.group.add(m);
  return m;
}
