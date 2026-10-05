// The "uber" kart material. OWNER: Agent C (visuals).
//
// One MeshPhysicalMaterial (clearcoat, quality >= high) or MeshStandardMaterial drives the WHOLE kart: paint, chrome, rubber,
// fur, emissive lights.  Per-vertex attributes written by PartBuilder choose the surface:
//   color  albedo (with baked AO)      aPbr = (roughness, metalness, emissive strength, clearcoat mask)
// plus a decal atlas (`map`, alpha-blended OVER the vertex colour), a fresnel rim light and a few cheap per-kart uniforms:
//   uFlash   white hit flash 0..1       uRainbow  star / invincible shimmer 0..1     uGlow  emissive multiplier (brake lights, boost)
//   uPaintOn/From/To/Lum  optional custom paint colour (see KartVisual.setPaint)
// Everything lives in ONE draw call per kart, and every kart with the same quality shares ONE compiled program.
import * as THREE from 'three';

const VERT_DECL = /* glsl */`
attribute vec4 aPbr;
varying vec4 vPbr;
varying vec3 vObj;
`;
const FRAG_DECL = /* glsl */`
varying vec4 vPbr;
varying vec3 vObj;
uniform float uFlash;
uniform float uRainbow;
uniform float uGlow;
uniform float uTime;
uniform float uRim;
uniform vec3 uRimColor;
uniform float uPaintOn;
uniform vec3 uPaintFrom;
uniform vec3 uPaintTo;
uniform float uPaintLum;
`;
// Custom paint: vertices whose colour has the driver's primary chromaticity (and carry the clearcoat/paint mask) are re-coloured to
// uPaintTo, keeping the baked ambient occlusion (luminance ratio); stripes / chrome / rubber of other hues are untouched.
const FRAG_DECAL = /* glsl */`
if ( uPaintOn > 0.5 ) {
  vec3 pc = diffuseColor.rgb;
  float pd = length( normalize( pc + 1e-4 ) - normalize( uPaintFrom + 1e-4 ) );
  float pw = ( 1.0 - smoothstep( 0.12, 0.3, pd ) ) * step( 0.5, vPbr.w );
  float pl = dot( pc, vec3( 0.2126, 0.7152, 0.0722 ) ) / uPaintLum;
  diffuseColor.rgb = mix( pc, uPaintTo * pl, pw );
}
#ifdef USE_MAP
  vec4 decalTexel = texture2D( map, vMapUv );
  diffuseColor.rgb = mix( diffuseColor.rgb, decalTexel.rgb, decalTexel.a );
#endif
`;
const FRAG_FINAL = /* glsl */`
{
  vec3 kv = normalize( vViewPosition );
  float kfr = pow( 1.0 - saturate( dot( normal, kv ) ), 3.0 );
  // gentle sky-coloured rim keeps silhouettes readable against any backdrop (less on bare metal)
  outgoingLight += uRimColor * kfr * uRim * ( 0.3 + 0.7 * ( 1.0 - vPbr.y ) );
  if ( uRainbow > 0.001 ) {
    vec3 rb = 0.5 + 0.5 * cos( 6.2831853 * ( vec3( 0.0, 0.33, 0.67 ) + vObj.y * 0.9 + vObj.z * 0.55 - uTime * 0.9 ) );
    outgoingLight = mix( outgoingLight, outgoingLight * 0.35 + rb * 1.1, uRainbow * 0.8 ) + rb * kfr * uRainbow * 1.6;
  }
  outgoingLight = mix( outgoingLight, vec3( 1.3, 1.2, 1.05 ), uFlash );
}
`;

/**
 * @param {{ map?: THREE.Texture|null, envMap?: THREE.Texture|null, physical?: boolean, ghost?: boolean, envIntensity?: number }} o
 * @returns {THREE.MeshStandardMaterial & { userData: { u: Record<string,{value:any}> } }}
 */
export function createKartMaterial(o = {}) {
  const physical = o.physical !== false;
  const ghost = !!o.ghost;
  const params = { vertexColors: true, roughness: 1, metalness: 0, map: o.map ?? null, envMap: o.envMap ?? null, envMapIntensity: o.envIntensity ?? 1 };
  if (ghost) Object.assign(params, { transparent: true, opacity: 0.42, depthWrite: true });
  const mat = physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
  if (physical) { mat.clearcoat = 1; mat.clearcoatRoughness = 0.05; }
  const u = {
    uFlash: { value: 0 },
    uRainbow: { value: 0 },
    uGlow: { value: 1 },
    uTime: { value: 0 },
    uRim: { value: ghost ? 1.6 : 0.22 },
    uRimColor: { value: ghost ? new THREE.Color(0.35, 0.9, 1.0) : new THREE.Color(0.62, 0.78, 1.0) },
    uPaintOn: { value: 0 },
    uPaintFrom: { value: new THREE.Color(1, 1, 1) },
    uPaintTo: { value: new THREE.Color(1, 1, 1) },
    uPaintLum: { value: 1 },
  };
  mat.userData.u = u;
  mat.userData.kartMaterial = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vPbr = aPbr; vObj = position;');
    let f = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_DECAL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = max( 0.04, vPbr.x );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vPbr.z * uGlow;')
      .replace('#include <opaque_fragment>', FRAG_FINAL + '\n#include <opaque_fragment>');
    if (physical) f = f.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n  material.clearcoat *= vPbr.w;\n#endif');
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `kart:${physical ? 'P' : 'S'}${o.map ? 'm' : ''}${ghost ? 'g' : ''}`;
  return mat;
}

/** Plain lit material for small separate meshes (face decals, steering wheels...) sharing the kart's look. */
export function createPropMaterial(params = {}) {
  return new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, ...params });
}
