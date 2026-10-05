// Track features drawn ON or ACROSS the road: boost pads, start/finish line + gantry, jump ramps, direction signs.
// OWNER: Agent B.  All of it is derived from the same zone data the physics reads (track.zones), so visuals always match gameplay.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { makeRows, ribbon } from './ribbon.js';
import { toColor } from './geo.js';
import { checkerTexture, bannerTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------------------------------------------------
// shared shader plumbing (fog + tonemapping aware so custom materials match the rest of the scene)
export const FOG_VERT_PARS = '#include <fog_pars_vertex>';
export function shaderMaterial({ uniforms, vertex, fragment, transparent = false, depthWrite = true, blending = THREE.NormalBlending, side = THREE.FrontSide, polygonOffset = false, defines }) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
    vertexShader: vertex, fragmentShader: fragment, fog: true, transparent, depthWrite, blending, side,
    polygonOffset, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (defines) m.defines = defines;
  return m;
}

const BOOST_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uColA; uniform vec3 uColB; uniform float uRepeat;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    vec2 uv = vUv;
    float edgeD = min( min( uv.x, 1.0 - uv.x ) * 1.0, min( uv.y, 1.0 - uv.y ) * 0.35 );
    float u = abs( uv.x - 0.5 ) * 2.0;                       // 0 centre .. 1 sides
    float phase = fract( uv.y * uRepeat + u * 0.55 - uTime * 1.6 );
    float chev = smoothstep( 0.0, 0.08, phase ) * ( 1.0 - smoothstep( 0.30, 0.42, phase ) );
    float pulse = 0.78 + 0.22 * sin( uTime * 7.0 );
    vec3 base = mix( uColA * 0.35, uColA * 0.7, 0.5 + 0.5 * sin( uv.y * 40.0 ) * 0.2 );
    vec3 col = base + mix( uColA, uColB, uv.y ) * chev * 1.8 * pulse;
    float border = 1.0 - smoothstep( 0.0, 0.07, edgeD );
    col += uColB * border * 1.4 * pulse;
    // soft glow falloff towards the sides so the pad blends into the asphalt
    gl_FragColor = vec4( col, 0.94 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const BOOST_VERT = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** One merged mesh for all boost pads of the track; `uTime` is advanced by World.update. Returns { mesh, uniforms } or null. */
export function buildBoostPads(world, { colorA = '#22d3ff', colorB = '#ffffff' } = {}) {
  const track = world.track;
  if (!track.boostPads.length) return null;
  const uniforms = { uTime: world.timeUniform, uColA: { value: toColor(colorA) }, uColB: { value: toColor(colorB) }, uRepeat: { value: 5.0 } };
  const mat = shaderMaterial({ uniforms, vertex: BOOST_VERT, fragment: BOOST_FRAG, transparent: true, depthWrite: false, polygonOffset: true });
  const geos = [];
  for (const pad of track.boostPads) {
    const len = pad.s1 - pad.s0;
    const rows = makeRows(track, pad.s0, pad.s1, 1.0);
    const g = ribbon(rows, { l0: pad.l0, l1: pad.l1, lift: 0.055, vScale: len, vOffset: -pad.s0 / len, segs: 1 });
    geos.push(g);
  }
  const merged = mergeBuffer(geos);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'boost-pads';
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function mergeBuffer(geos) {
  if (geos.length === 1) return geos[0];
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3); nrm.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += g.attributes.position.count; io += ix.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// ------------------------------------------------------------------------------------------------------------------
/**
 * Start / finish: checkered line across the road at s = 0 and an overhead gantry with a banner.
 * cfg = { banner:'KART RUSH GP', sub:'SUNNY MEADOWS', bg, fg, trim, structure:'#hex', pillar:'#hex', light:'#hex' }
 */
export function buildStartLine(world, cfg = {}) {
  const track = world.track, group = new THREE.Group();
  group.name = 'start-line';
  // checkered strip (decal)
  {
    const rows = makeRows(track, -1.3, 1.3, 0.65);
    const tex = world.tex(checkerTexture({ a: '#ffffff', b: '#141414', cells: 14, rows: 2 }));
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const g = ribbon(rows, { l0: (r) => -r.hw, l1: (r) => r.hw, lift: 0.05, vScale: 2.6, vOffset: 0.5 });
    const mat = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(g, mat); m.renderOrder = 1; m.matrixAutoUpdate = false; group.add(m);
  }
  // gantry
  const smp = track.sampleAt(0);
  const hw = smp.halfWidth, edge = hw + smp.shoulder + 1.4;
  const right = new THREE.Vector3(smp.right.x, 0, smp.right.z).normalize();
  const fwd = new THREE.Vector3(smp.tangent.x, 0, smp.tangent.z).normalize();
  const B = new GeoBuilder();
  const steel = toColor(cfg.structure ?? '#dfe5f2'), dark = toColor(cfg.pillar ?? '#3a4156'), accent = toColor(cfg.trim ?? '#ffd23f');
  const topY = cfg.height ?? 8.2;
  for (const side of [-1, 1]) {
    const base = new THREE.Vector3().copy(smp.position).addScaledVector(smp.right, side * edge);
    base.y -= 0.6;
    B.box(base.x, base.y, base.z, right, UP, fwd, 1.5, topY + 0.6, 1.5, { top: steel, side: dark, bottom: dark }, true);
    B.box(base.x, base.y, base.z, right, UP, fwd, 2.1, 0.9, 2.1, { top: steel, side: steel, bottom: dark }, true);
    B.box(base.x, base.y + topY * 0.55, base.z, right, UP, fwd, 1.62, 0.28, 1.62, accent, true);
  }
  const cx = smp.position.x, cz = smp.position.z, cy = smp.position.y + topY - 0.5;
  const beamW = edge * 2 + 1.6;
  B.box(cx, cy, cz, right, UP, fwd, beamW, 1.5, 1.2, { top: steel, side: dark, bottom: dark }, true);
  B.box(cx, cy + 1.5, cz, right, UP, fwd, beamW, 0.18, 1.3, accent, true);
  // light bar under the beam (emissive-looking via bright vertex colour; real glow comes from bloom)
  const lamp = toColor(cfg.light ?? '#fff3c0').multiplyScalar(2.2);
  for (let k = -3; k <= 3; k++) B.box(cx + right.x * k * (beamW / 8), cy - 0.1, cz + right.z * k * (beamW / 8), right, UP, fwd, 0.6, 0.18, 0.5, lamp, true);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const gm = new THREE.Mesh(B.build(), mat); gm.castShadow = true; gm.receiveShadow = true; group.add(gm);
  // banners on both faces (front faces the approaching karts)
  const tex = world.tex(bannerTexture({ text: cfg.banner ?? 'KART RUSH GP', sub: cfg.sub ?? '', bg: cfg.bg ?? '#e8403a', fg: cfg.fg ?? '#ffffff', trim: cfg.trim ?? '#ffd23f' }));
  const bw = beamW - 1.2, bh = bw / 4;
  for (const dir of [-1, 1]) {
    const PB = new GeoBuilder();
    const n = fwd.clone().multiplyScalar(dir);
    const px = right.clone().multiplyScalar(-dir); // keep text readable from each side
    const c = new THREE.Vector3(cx, cy + 0.2, cz).addScaledVector(fwd, dir * 0.64);
    PB.panel(c.x, c.y, c.z, px, UP, n, bw, bh, [1, 1, 1], [0, 0, 1, 1]);
    const bg = PB.build({ uv: true });
    const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: true }));
    group.add(bm);
  }
  group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  return group;
}
