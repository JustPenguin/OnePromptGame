// Sky dome: ONE procedural shader (gradient + sun + clouds + stars + aurora + nebula, toggled by defines) pinned to the far
// plane using only the camera ROTATION - so it never has to follow the camera, can never be clipped by the far plane,
// and renders correctly inside a CubeCamera / PMREM pass too (Agent C builds the environment map from `track.sky`).
// OWNER: Agent B.
import * as THREE from 'three';

export const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    // rotation-only view: the dome is "at infinity".  z = w pins it to the far plane (depth 1.0) so everything draws over it.
    vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
    gl_Position = p.xyww;
  }
`;

const NOISE = /* glsl */ `
  float hash21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
  float hash31( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yxz + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }
  float vnoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
  float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i ++ ) { s += a * vnoise( p ); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  float fbm3( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 3; i ++ ) { s += a * vnoise( p ); p = p * 2.07 + 5.3; a *= 0.5; } return s; }
`;

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGround;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize; uniform float uSunGlow;
  uniform float uTime;
  uniform vec3 uCloudColor; uniform vec3 uCloudShade; uniform vec4 uCloud; // x scale, y low, z high, w opacity
  uniform vec2 uCloudWind; uniform float uHorizonBand;
  uniform vec3 uAur1; uniform vec3 uAur2; uniform float uAurI;
  uniform vec3 uNeb1; uniform vec3 uNeb2; uniform float uNebI;
  uniform float uStarD; uniform float uStarS;
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 d = normalize( vDir );
    float h = d.y;
    vec3 col = mix( uHorizon, uMid, smoothstep( 0.0, 0.20 + uHorizonBand, h ) );
    col = mix( col, uTop, smoothstep( 0.10, 0.85, h ) );
    col = mix( col, uGround, smoothstep( 0.0, -0.10, h ) );
    float sd = max( dot( d, uSunDir ), 0.0 );
    #ifdef SUN
      col += uSunColor * ( pow( sd, 5.0 ) * 0.10 + pow( sd, 48.0 ) * 0.28 * uSunGlow + pow( sd, 900.0 ) * 0.35 );
      float cosR = cos( uSunSize );
      float disc = smoothstep( cosR - 0.0016, cosR + 0.0006, sd );
      #ifdef MOON
        // moon: disc coordinates -> maria + craters + soft limb darkening
        vec3 t1 = normalize( cross( uSunDir, vec3( 0.0, 1.0, 0.0 ) ) ); vec3 t2 = cross( t1, uSunDir );
        vec2 mp = vec2( dot( d, t1 ), dot( d, t2 ) ) / sin( uSunSize );
        float mr = length( mp );
        float mare = fbm( mp * 1.7 + 3.0 ), cr = fbm( mp * 7.0 + 11.0 ), cr2 = fbm( mp * 15.0 - 5.0 );
        float surf = 0.78 + 0.22 * smoothstep( 0.35, 0.7, mare ) - 0.2 * smoothstep( 0.55, 0.75, cr ) * 0.8 - 0.12 * smoothstep( 0.6, 0.8, cr2 );
        float limb = 0.72 + 0.28 * sqrt( max( 0.0, 1.0 - mr * mr ) );
        vec3 moonCol = uSunColor * 1.5 * surf * limb;
        col = mix( col, moonCol, disc );
      #else
        col = mix( col, uSunColor * 1.9, disc );
      #endif
    #endif
    #ifdef NEBULA
      if ( h > -0.2 ) {
        vec2 np = d.xz / ( abs( h ) + 0.45 ) * 1.6 + 3.0;
        float n1 = fbm( np * 1.3 + uTime * 0.004 ), n2 = fbm( np * 2.7 - 11.0 );
        float band = smoothstep( 0.42, 0.78, n1 ) * ( 0.35 + 0.65 * n2 );
        col += mix( uNeb1, uNeb2, n2 ) * band * uNebI * smoothstep( -0.2, 0.15, h );
      }
    #endif
    #ifdef CLOUDS
      if ( h > -0.02 ) {
        vec2 p = d.xz / ( max( h, 0.0 ) + 0.16 ) * uCloud.x + uCloudWind * uTime;
        float n = fbm( p );
        float c = smoothstep( uCloud.y, uCloud.z, n ) * smoothstep( -0.02, 0.10, h );
        float nl = fbm( p + uSunDir.xz * 0.22 );
        float lit = clamp( ( n - nl ) * 3.2 + 0.62, 0.0, 1.0 );
        vec3 cc = mix( uCloudShade, uCloudColor, lit );
        cc += uSunColor * pow( sd, 6.0 ) * 0.5;
        col = mix( col, cc, c * uCloud.w );
      }
    #endif
    #ifdef STARS
      if ( h > -0.05 ) {
        vec3 g = d * uStarS; vec3 id = floor( g ); vec3 f = fract( g ) - 0.5;
        float r = hash31( id );
        if ( r > 1.0 - uStarD ) {
          vec3 off = vec3( hash31( id + 7.1 ), hash31( id + 13.7 ), hash31( id + 29.3 ) ) - 0.5;
          float dd = length( f - off * 0.7 );
          float tw = 0.65 + 0.35 * sin( uTime * ( 1.5 + r * 4.0 ) + r * 40.0 );
          float st = smoothstep( 0.12 + 0.1 * r, 0.0, dd ) * tw;
          vec3 sc = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.9, 0.75 ), hash31( id + 3.3 ) );
          col += sc * st * ( 0.6 + 1.6 * r ) * smoothstep( -0.05, 0.12, h );
        }
      }
    #endif
    #ifdef AURORA
      if ( h > 0.02 ) {
        vec2 ap = d.xz / ( h + 0.25 ) * 1.2;
        float wave = fbm3( vec2( ap.x * 1.6 + uTime * 0.03, ap.y * 0.5 ) );
        float curtain = smoothstep( 0.35, 0.62, wave ) * smoothstep( 0.0, 0.25, h ) * ( 1.0 - smoothstep( 0.55, 0.95, h ) );
        float rays = 0.55 + 0.45 * vnoise( vec2( ap.x * 14.0 + uTime * 0.1, 0.0 ) );
        vec3 ac = mix( uAur1, uAur2, smoothstep( 0.1, 0.7, h + wave * 0.3 ) );
        col += ac * curtain * rays * uAurI;
      }
    #endif
    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const col = (c, fallback = '#ffffff') => new THREE.Color(c ?? fallback);

/**
 * cfg = { top, mid, horizon, ground, sun:{azimuth, elevation, color, size, glow} | null,
 *         clouds:{ scale, low, high, opacity, color, shade, wind:[x,z] } | null, stars:{ density, scale } | null,
 *         aurora:{ colors:[a,b], intensity } | null, nebula:{ colors:[a,b], intensity } | null, horizonBand }
 * Returns { group, mesh, uniforms, sunDir (THREE.Vector3, unit, pointing TOWARD the sun), update(dt), dispose() }.
 */
export function createSky(cfg) {
  const sun = cfg.sun === null ? null : { azimuth: 35, elevation: 48, color: '#fff1d6', size: 0.035, glow: 1, ...(cfg.sun ?? {}) };
  const sunDir = new THREE.Vector3(0, 1, 0);
  if (sun) {
    const az = (sun.azimuth * Math.PI) / 180, el = (sun.elevation * Math.PI) / 180;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  }
  const defines = {};
  if (sun) defines.SUN = 1;
  if (cfg.clouds) defines.CLOUDS = 1;
  if (cfg.stars) defines.STARS = 1;
  if (cfg.aurora) defines.AURORA = 1;
  if (cfg.nebula) defines.NEBULA = 1;
  if (sun?.moon) defines.MOON = 1;
  const cl = cfg.clouds ?? {}, au = cfg.aurora ?? {}, ne = cfg.nebula ?? {}, st = cfg.stars ?? {};
  const uniforms = {
    uTop: { value: col(cfg.top, '#3d8bff') }, uMid: { value: col(cfg.mid ?? cfg.top, '#7dbbff') }, uHorizon: { value: col(cfg.horizon, '#cfe9ff') }, uGround: { value: col(cfg.ground ?? cfg.horizon, '#cfe9ff') },
    uSunDir: { value: sunDir }, uSunColor: { value: col(sun?.color, '#fff1d6') }, uSunSize: { value: sun?.size ?? 0.03 }, uSunGlow: { value: sun?.glow ?? 1 },
    uTime: { value: 0 },
    uCloudColor: { value: col(cl.color, '#ffffff') }, uCloudShade: { value: col(cl.shade, '#aebfdc') },
    uCloud: { value: new THREE.Vector4(cl.scale ?? 1.6, cl.low ?? 0.5, cl.high ?? 0.78, cl.opacity ?? 0.95) },
    uCloudWind: { value: new THREE.Vector2(...(cl.wind ?? [0.004, 0.0015])) }, uHorizonBand: { value: cfg.horizonBand ?? 0 },
    uAur1: { value: col(au.colors?.[0], '#41ffa0') }, uAur2: { value: col(au.colors?.[1], '#4a8bff') }, uAurI: { value: au.intensity ?? 0.6 },
    uNeb1: { value: col(ne.colors?.[0], '#6a2cff') }, uNeb2: { value: col(ne.colors?.[1], '#ff3dcb') }, uNebI: { value: ne.intensity ?? 0.5 },
    uStarD: { value: st.density ?? 0.04 }, uStarS: { value: st.scale ?? 70 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), mat);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(mesh);
  return {
    group, mesh, uniforms, sunDir,
    update(dt) { uniforms.uTime.value += dt; },
    /** Cheap variants for low quality: drop clouds' fbm cost by shrinking octaves is not possible, so just disable features. */
    setFeatures({ clouds = !!cfg.clouds, stars = !!cfg.stars, aurora = !!cfg.aurora, nebula = !!cfg.nebula } = {}) {
      const d = mat.defines;
      const set = (k, on) => { if (on) d[k] = 1; else delete d[k]; };
      set('CLOUDS', clouds); set('STARS', stars); set('AURORA', aurora); set('NEBULA', nebula);
      mat.needsUpdate = true;
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}

/** A tiny helper for other shader code (water, planets): the shared noise library as a GLSL string. */
export const GLSL_NOISE = NOISE;
