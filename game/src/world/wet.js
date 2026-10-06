// Wet-asphalt look for a MeshStandardMaterial: patchy puddles that mirror coloured neon (fresnel-weighted), glossy streaks and rain ripples.
// OWNER: Agent B.  No env map needed: the "reflection" is procedural (stretched colour streaks keyed on world position), so it also works
// on `low` where the renderer has no environment.  Adds only a few ALU ops to the road fragment shader.
import * as THREE from 'three';
import { toColor } from './geo.js';

/** o = { colors:['#ff3dcb','#22d3ff'], strength: 1, puddles: 0.55, scale: 0.05, ripples: true } */
export function wetRoad(material, time, o = {}) {
  const c1 = toColor(o.colors?.[0] ?? '#ff3dcb'), c2 = toColor(o.colors?.[1] ?? '#22d3ff'), c3 = toColor(o.colors?.[2] ?? '#ffd9a0');
  material.roughness = o.roughness ?? 0.42;
  material.metalness = o.metalness ?? 0.0;
  material.customProgramCacheKey = () => 'wet-road-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWTime = time;
    shader.uniforms.uWetA = { value: c1 }; shader.uniforms.uWetB = { value: c2 }; shader.uniforms.uWetC = { value: c3 };
    shader.uniforms.uWetK = { value: new THREE.Vector4(o.strength ?? 1, o.puddles ?? 0.55, o.scale ?? 0.05, o.ripples === false ? 0 : 1) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetW = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWetW; uniform float uWTime; uniform vec3 uWetA; uniform vec3 uWetB; uniform vec3 uWetC; uniform vec4 uWetK;
        float wh( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
        float wn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( wh( i ), wh( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wh( i + vec2( 0.0, 1.0 ) ), wh( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 wp = vWetW.xz;
          float pud = smoothstep( 0.8 - uWetK.y * 0.32, 0.9, wn( wp * uWetK.z ) * 0.6 + wn( wp * uWetK.z * 2.7 + 5.0 ) * 0.4 );
          vec3 V = normalize( vViewPosition );
          float fres = pow( 1.0 - clamp( dot( normal, V ), 0.0, 1.0 ), 4.0 );
          // neon reflections: long soft streaks (stretched along the view-ish axis), coloured by position
          float st = wn( vec2( wp.x * 0.9, wp.y * 0.11 ) + 3.0 ) * wn( vec2( wp.x * 0.23 + 7.0, wp.y * 0.35 ) );
          float st2 = wn( vec2( wp.x * 0.13 - 4.0, wp.y * 0.95 ) ) * wn( vec2( wp.x * 0.37, wp.y * 0.21 + 2.0 ) );
          vec3 refl = uWetA * smoothstep( 0.18, 0.6, st ) + uWetB * smoothstep( 0.18, 0.6, st2 ) + uWetC * smoothstep( 0.32, 0.7, wn( wp * 0.045 + 9.0 ) ) * 0.35;
          float ripple = 0.0;
          if ( uWetK.w > 0.5 ) { vec2 q = wp * 3.0; vec2 g = fract( q ) - 0.5; vec2 id = floor( q ); float ph = wh( id ); float r = length( g ); float tt = fract( uWTime * 0.7 + ph ); ripple = smoothstep( 0.04, 0.0, abs( r - tt * 0.5 ) ) * ( 1.0 - tt ) * step( 0.92, wh( id + 3.3 ) ) * pud; }
          totalEmissiveRadiance += refl * ( 0.05 + 0.95 * fres ) * ( 0.05 + 0.95 * pud ) * uWetK.x * 0.55;
          totalEmissiveRadiance += vec3( 0.6, 0.75, 1.0 ) * ripple * 0.5;
        }`);
  };
  return material;
}
