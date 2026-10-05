// Water & lava: streams, ponds, seas.   OWNER: Agent B.
//
// A body = a flat quad at a constant `level` + a small depth map (R8 DataTexture, metres below the surface).  The terrain provides the
// exact shoreline through the depth test; the depth map drives shallow->deep colour and animated shore foam in the fragment shader,
// so shores look right regardless of mesh resolution.  Streams / ponds ALSO carve the terrain (world.terrain carvers) so the bed
// and banks exist where the water is.  `kind: 'lava'` swaps the shader for a glowing animated crust.
//
//   const body = addWater(world, { kind:'stream', points:[[x,z],...], width:10, level:0.5, depth:1.8, bank:9, ... });
//   body.depthAt(x, z)        analytic depth (metres, 0 = dry)
import * as THREE from 'three';
import { shaderMaterial } from './features.js';
import { toColor } from './geo.js';
import { GLSL_NOISE } from './sky.js';

const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime; uniform sampler2D uDepth; uniform vec4 uBox; uniform float uDepthScale;
  uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uSky; uniform vec3 uHorizon;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec2 uFlow; uniform float uWaveScale; uniform float uWaveSpeed; uniform float uWaveAmp;
  uniform float uOpacity; uniform float uFoamAmt; uniform vec3 uLavaA; uniform vec3 uLavaB; uniform float uGlow;
  varying vec3 vWorld;
  ${GLSL_NOISE}
  #include <fog_pars_fragment>
  void main() {
    vec2 uvm = ( vWorld.xz - uBox.xy ) / uBox.zw;
    float depth = texture2D( uDepth, uvm ).r * uDepthScale;
    // the depth map is authoritative: no water where it says dry (the quad covers a bounding box, terrain only occludes part of it)
    if ( depth < 0.012 || uvm.x < 0.0 || uvm.y < 0.0 || uvm.x > 1.0 || uvm.y > 1.0 ) discard;
    vec2 p = vWorld.xz * uWaveScale;
    float t = uTime * uWaveSpeed;
    #ifdef LAVA
      vec2 q = vWorld.xz * 0.045 + uFlow * uTime * 0.04;
      float n = fbm( q + vec2( fbm( q * 1.7 + t * 0.15 ), fbm( q * 1.3 - t * 0.12 ) ) * 1.6 );
      float crust = smoothstep( 0.46, 0.66, n );
      float cracks = smoothstep( 0.0, 0.1, abs( fbm( q * 2.6 - t * 0.1 ) - 0.5 ) );
      vec3 hot = mix( uLavaA, uLavaB, smoothstep( 0.3, 0.9, 1.0 - n ) );
      vec3 dark = uDeep * ( 0.55 + 0.9 * n );
      vec3 col = mix( hot * ( 1.2 + 0.5 * sin( t * 2.0 + n * 9.0 ) ), dark, crust * cracks );
      col += uLavaB * pow( max( 0.0, 1.0 - n ), 3.0 ) * 0.7;
      float edge = 1.0 - smoothstep( 0.0, 0.7, depth );
      col += uLavaB * edge * 0.8;
      gl_FragColor = vec4( col * uGlow, 1.0 );
    #else
      vec2 f = uFlow * uTime;
      float a = fbm3( p + f + vec2( t * 0.7, -t * 0.4 ) ), b = fbm3( p * 1.9 - f * 1.3 + vec2( -t * 0.5, t * 0.6 ) + 7.0 );
      float e = 0.9;
      float ax = fbm3( p + f + vec2( t * 0.7 + e * 0.05, -t * 0.4 ) ) - a, az = fbm3( p + f + vec2( t * 0.7, -t * 0.4 + e * 0.05 ) ) - a;
      vec3 N = normalize( vec3( -( ax * 22.0 + ( b - 0.5 ) * 0.6 ) * uWaveAmp, 1.0, -( az * 22.0 + ( b - 0.5 ) * 0.6 ) * uWaveAmp ) );
      vec3 V = normalize( cameraPosition - vWorld );
      float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 3.5 );
      vec3 body = mix( uShallow, uDeep, smoothstep( 0.0, 3.0, depth ) );
      vec3 refl = mix( uHorizon, uSky, clamp( N.y * 0.8 + ( b - 0.5 ) * 0.3, 0.0, 1.0 ) );
      vec3 col = mix( body, refl, 0.05 + fres * 0.62 );
      vec3 H = normalize( uSunDir + V );
      float spec = pow( max( dot( N, H ), 0.0 ), 140.0 );
      col += uSunColor * spec * 2.2;
      // shore foam: a bright band hugging the shoreline, broken up by moving noise
      float shore = 1.0 - smoothstep( 0.0, 0.38, depth );
      float fn = vnoise( p * 3.0 + vec2( t * 1.1, t * 0.7 ) ) * 0.6 + vnoise( p * 7.0 - t ) * 0.4;
      float foam = shore * smoothstep( 0.45, 0.8, fn + shore * 0.4 ) * uFoamAmt;
      float ripple = smoothstep( 0.0, 0.18, depth ) * ( 1.0 - smoothstep( 0.18, 0.9, depth ) ) * smoothstep( 0.55, 0.8, vnoise( p * 2.2 - t * 1.4 ) ) * 0.35 * uFoamAmt;
      col = mix( col, uFoam, clamp( foam + ripple, 0.0, 1.0 ) );
      float alpha = uOpacity * mix( 0.72, 1.0, smoothstep( 0.0, 1.2, depth ) );
      alpha = max( alpha, foam );
      gl_FragColor = vec4( col, alpha );
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ------------------------------------------------------------------------------------------------------------------
/** Distance from (x,z) to a polyline, plus the interpolated parameter along it.  Returns shared scratch {d, t}. */
function makePolyline(points) {
  const n = points.length - 1, seg = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    seg.push({ ax, az, dx, dz, len, l0: L });
    L += len;
  }
  const out = { d: 0, t: 0 };
  return {
    length: L, out,
    query(x, z) {
      let best = Infinity, bt = 0;
      for (let i = 0; i < seg.length; i++) {
        const s = seg[i];
        const u = Math.min(1, Math.max(0, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.len * s.len)));
        const px = s.ax + s.dx * u - x, pz = s.az + s.dz * u - z, d2 = px * px + pz * pz;
        if (d2 < best) { best = d2; bt = (s.l0 + u * s.len) / L; }
      }
      out.d = Math.sqrt(best); out.t = bt;
      return out;
    },
    bbox() { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of points) { a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; } return a; },
  };
}

/**
 * spec = {
 *   kind: 'stream' | 'pond' | 'sea' | 'lava',
 *   level: world Y of the surface,
 *   stream:  points [[x,z],...], width (m, number | fn(t)), depth (m), bank (m of blend into natural terrain)
 *   pond:    x, z, rx, rz, rot (rad), depth, bank
 *   sea/lava lake: box [x0,z0,x1,z1]  (+ optional heightFn via terrain), depth map taken from the terrain
 *   colors:  { shallow, deep, foam, sky, horizon }   flow: [dx,dz]  waveScale, waveSpeed, waveAmp, opacity, foam
 *   carve:   false to skip terrain carving
 * }
 * Returns { mesh, depthAt(x,z), carve(x,z,nat), update(), dispose() }.
 */
export function addWater(world, spec) {
  const level = spec.level;
  const kind = spec.kind ?? 'stream';
  const bank = spec.bank ?? 8, depthMax = spec.depth ?? 2;
  let carve = null, depthAt = null, box;
  if (kind === 'stream') {
    const poly = makePolyline(spec.points);
    const widthAt = typeof spec.width === 'function' ? spec.width : () => spec.width ?? 8;
    const pad = (typeof spec.width === 'number' ? spec.width : 14) + bank + 8;
    const bb = poly.bbox();
    box = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    depthAt = (x, z) => { const q = poly.query(x, z), hw = widthAt(q.t) / 2; if (q.d >= hw) return 0; const u = q.d / hw; return depthMax * (1 - u * u); };
    carve = (x, z, nat) => {
      const q = poly.query(x, z), hw = widthAt(q.t) / 2;
      if (q.d > hw + bank) return nat;
      const bed = q.d < hw ? level - depthMax * (1 - (q.d / hw) * (q.d / hw)) : level + 0.18;
      const t = smooth((q.d - hw) / bank);
      return bed + (nat - bed) * t;
    };
  } else if (kind === 'pond') {
    const { x, z, rx, rz = rx, rot = 0 } = spec;
    const c = Math.cos(rot), s = Math.sin(rot);
    const ellip = (px, pz) => { const dx = px - x, dz = pz - z; const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz; return Math.hypot(u, v); }; // 1 at the shore
    const reach = Math.max(rx, rz) + bank + 6;
    box = [x - reach, z - reach, x + reach, z + reach];
    depthAt = (px, pz) => { const e = ellip(px, pz); return e >= 1 ? 0 : depthMax * (1 - e * e); };
    carve = (px, pz, nat) => {
      const e = ellip(px, pz), shoreR = Math.min(rx, rz);
      if (e > 1 + bank / shoreR) return nat;
      const bed = e < 1 ? level - depthMax * (1 - e * e) : level + 0.2;
      const t = smooth((e - 1) * shoreR / bank);
      return bed + (nat - bed) * t;
    };
  } else {
    box = spec.box;
    depthAt = (px, pz) => Math.max(0, level - world.groundAt(px, pz));
    carve = null; // sea / lava lakes are defined by the terrain itself (natural() dips below `level`)
  }
  if (spec.carve !== false && carve && world.terrain) world.terrain.addCarver(carve);

  // ---- depth map ----
  const res = Math.min(512, Math.max(32, Math.round(Math.max(box[2] - box[0], box[3] - box[1]) / (spec.texel ?? 1.5))));
  const sx = box[2] - box[0], sz = box[3] - box[1];
  const rw = sx >= sz ? res : Math.max(16, Math.round(res * sx / sz)), rh = sx >= sz ? Math.max(16, Math.round(res * sz / sx)) : res;
  const data = new Uint8Array(rw * rh);
  const depthScale = Math.max(2.5, depthMax * (kind === 'sea' ? 1 : 1.25), spec.depthScale ?? 0);
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
    const x = box[0] + ((i + 0.5) / rw) * sx, z = box[1] + ((j + 0.5) / rh) * sz;
    const d = depthAt(x, z);
    data[j * rw + i] = Math.min(255, Math.round((d / depthScale) * 255));
  }
  const dtex = new THREE.DataTexture(data, rw, rh, THREE.RedFormat, THREE.UnsignedByteType);
  dtex.magFilter = dtex.minFilter = THREE.LinearFilter;
  dtex.wrapS = dtex.wrapT = THREE.ClampToEdgeWrapping;
  dtex.needsUpdate = true;
  world.tex(dtex);

  const col = spec.colors ?? {};
  const sky = world.cfg.sky ?? {};
  const uniforms = {
    uTime: world.timeUniform, uDepth: { value: dtex }, uBox: { value: new THREE.Vector4(box[0], box[1], sx, sz) }, uDepthScale: { value: depthScale },
    uShallow: { value: toColor(col.shallow ?? '#6fe0d8') }, uDeep: { value: toColor(col.deep ?? '#1d7fc4') }, uFoam: { value: toColor(col.foam ?? '#ffffff') },
    uSky: { value: toColor(col.sky ?? sky.top ?? '#4a90e8') }, uHorizon: { value: toColor(col.horizon ?? sky.horizon ?? '#cfe9ff') },
    uSunDir: { value: world.sunDir }, uSunColor: { value: toColor(sky.sun?.color ?? '#fff1d6') },
    uFlow: { value: new THREE.Vector2(...(spec.flow ?? [0, 0])) }, uWaveScale: { value: spec.waveScale ?? 0.22 }, uWaveSpeed: { value: spec.waveSpeed ?? 0.5 }, uWaveAmp: { value: spec.waveAmp ?? 0.4 },
    uOpacity: { value: spec.opacity ?? 0.92 }, uFoamAmt: { value: spec.foam ?? 1 },
    uLavaA: { value: toColor(col.lavaA ?? '#ff3d0a') }, uLavaB: { value: toColor(col.lavaB ?? '#ffd23f') }, uGlow: { value: spec.glow ?? 1.4 },
  };
  const mat = shaderMaterial({ uniforms, vertex: WATER_VERT, fragment: WATER_FRAG, transparent: kind !== 'lava', depthWrite: kind === 'lava', defines: kind === 'lava' ? { LAVA: 1 } : undefined });
  const geo = new THREE.PlaneGeometry(sx, sz, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(box[0] + sx / 2, level, box[1] + sz / 2);
  mesh.renderOrder = 3;
  mesh.name = `water:${kind}`;
  mesh.frustumCulled = true;
  world.group.add(mesh);
  const body = { mesh, depthAt, carve, level, box, kind, uniforms, dispose() { geo.dispose(); mat.dispose(); } };
  world.waters.push(body);
  return body;
}
