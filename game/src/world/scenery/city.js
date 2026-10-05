// City kit: procedural skyscrapers (ONE shader draws every building: windows, neon trim, roof lights), neon-lit lamp posts, rooftop props.
// OWNER: Agent B.
//
// Buildings are instances of a UNIT box (x,z in -0.5..0.5, y in 0..1) scaled per instance to (width, height, depth) metres.  The fragment
// shader derives everything from the model position * instance scale (so window grids are metric and never stretch), a per-building seed
// from the instance translation, and the time uniform (a few windows switch on/off, TV flicker).
import * as THREE from 'three';
import { GeoBuilder } from '../builder.js';
import { toColor, merge, cyl, box, blob } from '../geo.js';
import { shaderMaterial } from '../features.js';

const VERT = /* glsl */ `
  varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying float vSeed; varying vec3 vScale; varying vec3 vTint;
  #include <fog_pars_vertex>
  void main() {
    vec3 sc = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
    vec3 pivot = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
    vSeed = fract( sin( dot( pivot.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    vScale = sc;
    vLocal = position * sc;                        // metres from the building base centre (y from 0)
    vN = normalize( mat3( instanceMatrix ) * normal );
    vTint = instanceColor;
    vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uWall; uniform vec3 uWall2; uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform float uLit; uniform float uGlow;
  uniform vec3 uPalA; uniform vec3 uPalB; uniform vec3 uPalC; uniform vec3 uWinWarm; uniform vec3 uWinCool;
  varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying float vSeed; varying vec3 vScale; varying vec3 vTint;
  #include <fog_pars_fragment>
  float h11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
  float h21( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
  void main() {
    vec3 N = normalize( vN );
    vec3 col; vec3 emis = vec3( 0.0 );
    float y = vLocal.y;                                // height above the building base (m)
    if ( N.y > 0.5 ) {
      col = uWall * 0.55;                              // roof slab
      // rooftop edge light strip
      vec2 e = abs( vLocal.xz ) / ( vScale.xz * 0.5 );
      float rim = smoothstep( 0.93, 0.97, max( e.x, e.y ) );
      emis += mix( uPalA, uPalB, step( 0.5, vSeed ) ) * rim * 1.1;
    } else {
      // pick the face coordinate: u runs along the wall
      bool alongX = abs( N.z ) > 0.5;
      float u = alongX ? vLocal.x : vLocal.z;
      float faceId = alongX ? ( N.z > 0.0 ? 0.0 : 1.0 ) : ( N.x > 0.0 ? 2.0 : 3.0 );
      float cw = 3.2, ch = 3.8;
      vec2 cell = vec2( floor( u / cw ), floor( y / ch ) );
      vec2 f = vec2( fract( u / cw ), fract( y / ch ) );
      float seed = vSeed * 91.7 + faceId * 13.1;
      float rnd = h21( cell + seed );
      float lit = step( 1.0 - uLit * ( 0.28 + 0.62 * h11( seed ) ), rnd );
      // occasional change over time (people turning lights on/off) + tv flicker
      float tcell = floor( uTime * 0.25 + rnd * 40.0 );
      lit *= step( 0.035, h21( cell + tcell + seed ) );
      // anti-aliased window rectangle: edges are smoothed by the pixel footprint, and cells smaller than a pixel fall back to their average
      vec2 fw = fwidth( vec2( u / cw, y / ch ) );
      vec2 e0 = smoothstep( vec2( 0.17, 0.22 ) - fw, vec2( 0.17, 0.22 ) + fw, f );
      vec2 e1 = 1.0 - smoothstep( vec2( 0.83, 0.78 ) - fw, vec2( 0.83, 0.78 ) + fw, f );
      float lod = smoothstep( 0.3, 0.7, max( fw.x, fw.y ) );
      float win = mix( e0.x * e0.y * e1.x * e1.y, 0.37, lod );
      // height fade: no windows on the bottom storey (shopfronts get neon instead) and under the parapet
      float floorOn = step( ch * 1.0, y ) * step( y, vScale.y - 1.2 );
      float c3 = h21( cell + seed + 7.7 );
      vec3 lc = c3 < 0.62 ? uWinWarm : ( c3 < 0.85 ? uWinCool : ( c3 < 0.93 ? uPalA : uPalB ) );
      lc *= 0.75 + 0.5 * h21( cell + seed + 3.1 );
      float tv = step( 0.96, h21( cell + seed + 5.5 ) ) * ( 0.6 + 0.4 * sin( uTime * 9.0 + rnd * 50.0 ) );
      vec3 dark = vec3( 0.03, 0.04, 0.09 );
      vec3 wall = mix( uWall, uWall2, smoothstep( 0.0, vScale.y, y ) ) * ( 0.7 + 0.5 * h11( seed + 4.0 ) );
      wall *= 0.85 + 0.3 * h21( floor( vec2( u, y ) * 0.5 ) );
      col = wall;
      col = mix( col, dark * 0.6, win * floorOn * ( 1.0 - lit ) );
      vec3 emWin = lc * win * floorOn * lit * ( 1.0 + 0.8 * tv ) * 1.5;
      vec3 emAvg = mix( lc, vec3( 1.0, 0.86, 0.6 ), 0.6 ) * 0.37 * floorOn * ( uLit * 0.62 ) * 1.4;
      emis += mix( emWin, emAvg, lod );
      // neon trim bands at a few floors, per building
      float band = step( 0.62, h11( seed + 9.0 ) );
      float bandY = floor( 4.0 + h11( seed + 11.0 ) * max( 1.0, vScale.y / ch - 6.0 ) ) * ch;
      float bandOn = band * step( bandY, y ) * step( y, bandY + 0.35 );
      emis += mix( uPalA, uPalC, step( 0.5, h11( seed + 21.0 ) ) ) * bandOn * 1.6;
      // vertical neon edge strip on some towers
      float vedge = step( 0.55, h11( seed + 31.0 ) ) * step( vScale.y, 200.0 );
      float edgeX = min( abs( u - ( alongX ? -1.0 : -1.0 ) * 0.0 + ( alongX ? vScale.x : vScale.z ) * 0.5 ), abs( u + ( alongX ? vScale.x : vScale.z ) * 0.5 ) );
      emis += mix( uPalB, uPalA, step( 0.5, h11( seed + 41.0 ) ) ) * vedge * smoothstep( 0.35, 0.0, edgeX ) * 1.3;
      // shopfront band at street level: bright neon-lit glass
      float shop = step( y, ch * 0.9 ) * step( 0.2, y );
      vec3 sc = mix( uPalA, uPalB, h21( vec2( cell.x, seed ) ) );
      emis += mix( vec3( 0.0 ), sc * ( 0.5 + 0.9 * h21( vec2( cell.x + 3.0, seed ) ) ), shop * step( 0.3, f.x ) * step( f.x, 0.9 ) * step( 0.55, h21( vec2( cell.x, seed + 1.0 ) ) ) );
      // red aircraft warning light handled by roof edge on tall buildings
    }
    // fake lighting: moon key + cool ambient + neon bounce close to the ground
    float key = max( dot( N, uMoonDir ), 0.0 );
    vec3 lightCol = vec3( 0.16, 0.18, 0.34 ) + uMoonCol * key * 0.55;
    float street = exp( -max( y, 0.0 ) / 9.0 );
    lightCol += mix( uPalA, uPalB, 0.5 + 0.5 * sin( vWorld.x * 0.02 + vWorld.z * 0.017 ) ) * street * 0.28;
    vec3 outc = col * lightCol * vTint + emis * uGlow;
    gl_FragColor = vec4( outc, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * Skyscraper material.  o = { wall:'#1a1d3a', wall2:'#2a2a5a', palette:['#ff3dcb','#22d3ff','#ffd23f'], lit: 0.9 (share of lit windows), glow: 1,
 *   moonDir (Vector3), moonColor, warm:'#ffd9a0', cool:'#bfe4ff' }
 */
export function cityMaterial(world, o = {}) {
  const pal = o.palette ?? ['#ff3dcb', '#22d3ff', '#ffd23f'];
  const uniforms = {
    uTime: world.timeUniform, uWall: { value: toColor(o.wall ?? '#202648') }, uWall2: { value: toColor(o.wall2 ?? '#3a2f6e') },
    uMoonDir: { value: o.moonDir ?? world.sunDir }, uMoonCol: { value: toColor(o.moonColor ?? '#7f9cff') }, uLit: { value: o.lit ?? 0.9 }, uGlow: { value: o.glow ?? 1 },
    uPalA: { value: toColor(pal[0]) }, uPalB: { value: toColor(pal[1]) }, uPalC: { value: toColor(pal[2] ?? pal[0]) }, uWinWarm: { value: toColor(o.warm ?? '#ffd9a0') }, uWinCool: { value: toColor(o.cool ?? '#bfe4ff') },
  };
  return shaderMaterial({ uniforms, vertex: VERT, fragment: FRAG });
}

/** Unit box with the base at y=0 and no UV/colour attributes (the shader needs only position + normal). */
export function unitBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  g.deleteAttribute('uv');
  return g;
}

// ------------------------------------------------------------------------------------------------------------------
/** Neon street lamp ~7 m: tall pole, long arm, flat lamp head (bright vertex colour), small base box.  Arm points along +X. */
export function streetLamp({ pole = '#262b45', glow = '#ffcf8a', arm = 2.4, height = 8 } = {}) {
  const B = new GeoBuilder();
  const p = toColor(pole), g = toColor(glow).multiplyScalar(2.8);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  B.tube(V(0, 0, 0), V(0, height, 0), 0.16, 0.1, 6, p, p);
  B.box(0, 0, 0, V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.5, 0.5, 0.5, { top: p, side: p, bottom: p }, true);
  B.tube(V(0, height, 0), V(arm * 0.55, height + 0.5, 0), 0.09, 0.07, 5, p, p);
  B.tube(V(arm * 0.55, height + 0.5, 0), V(arm, height + 0.2, 0), 0.07, 0.06, 5, p, p);
  B.box(arm, height - 0.08, 0, V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.9, 0.12, 0.42, { top: p, side: p, bottom: g }, true);
  return B.build();
}

/** Rooftop clutter: antenna mast with red light, water tank, AC boxes (neutral dark colours; the lit parts come from the city shader). */
export function rooftopClutter({ seed = 1 } = {}) {
  const B = new GeoBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const dark = toColor('#2b2f4a'), mid = toColor('#3b4166'), red = toColor('#ff2a2a').multiplyScalar(2.4);
  B.tube(V(0, 0, 0), V(0, 14, 0), 0.25, 0.08, 5, dark, mid);
  B.tube(V(0, 13.6, 0), V(0, 14.4, 0), 0.22, 0.2, 6, red, red);
  B.tube(V(-2.5, 7, 0), V(2.5, 7, 0), 0.06, 0.06, 4, mid, mid);
  B.tube(V(-1.7, 10, 0), V(1.7, 10, 0), 0.06, 0.06, 4, mid, mid);
  B.tube(V(5, 0, 2), V(5, 3.6, 2), 1.5, 1.5, 8, dark, mid);
  B.tube(V(5, 3.6, 2), V(5, 4.8, 2), 1.5, 0.2, 8, mid, mid);
  B.box(-4, 0, -2, V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 3, 1.6, 2.2, { top: mid, side: dark, bottom: dark }, true);
  return B.build();
}

/** Elevated-rail style pillar / support column (round, with a neon ring). */
export function pillarGeometry({ color = '#3a3f66', ring = '#22d3ff', radius = 1.1, height = 10 } = {}) {
  const B = new GeoBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const c = toColor(color), r = toColor(ring).multiplyScalar(2.4);
  B.tube(V(0, 0, 0), V(0, height, 0), radius, radius * 0.92, 10, c, c);
  B.tube(V(0, 0.9, 0), V(0, 1.1, 0), radius * 1.04, radius * 1.04, 10, r, r);
  B.tube(V(0, height - 1.2, 0), V(0, height - 1.0, 0), radius * 1.0, radius * 1.0, 10, r, r);
  return B.build();
}
