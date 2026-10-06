// Recipe building blocks reused by several tracks.   OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from '../builder.js';
import { windMaterial, toColor } from '../geo.js';
import { createBillboards } from '../billboards.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/**
 * Pennant poles along a stretch of road (both sides).  o = { s0, s1, step, colors:[...], pole:'#e8ecf5', height: 8.5, offset: 3.2, cloth: 2.6 }
 * One animated (shader-waved) layer per colour.
 */
export function addPennants(w, o) {
  const tr = w.track;
  const h = o.height ?? 8.5, cloth = o.cloth ?? 2.6, ch = o.clothHeight ?? 1.25;
  const mat = windMaterial(w.timeUniform, { flag: o.wave ?? 0.55, side: THREE.DoubleSide });
  (o.colors ?? ['#e5413a', '#ffd23f', '#2f8be8']).forEach((fc, vi) => {
    const B = new GeoBuilder();
    const pole = toColor(o.pole ?? '#e8ecf5');
    B.box(0, 0, 0, X, Y, Z, 0.16, h, 0.16, { top: pole, side: pole, bottom: pole }, true);
    const c = toColor(fc), segs = 6;
    for (let i = 0; i < segs; i++) {
      const x0 = 0.08 + (i / segs) * cloth, x1 = 0.08 + ((i + 1) / segs) * cloth;
      const h0 = ch * (1 - 0.7 * (i / segs)), h1 = ch * (1 - 0.7 * ((i + 1) / segs));
      B.quadW(new THREE.Vector3(x0, h - 0.2 - h0, 0), new THREE.Vector3(x1, h - 0.2 - h1, 0), new THREE.Vector3(x1, h - 0.2, 0), new THREE.Vector3(x0, h - 0.2, 0), c, [i / segs, (i + 1) / segs, (i + 1) / segs, i / segs]);
    }
    const layer = w.layer({ name: `pennants-${vi}`, geometry: B.build({ wave: true }), material: mat, castShadow: true, cull: 0.5, chunk: 300 });
    for (let s = o.s0 + vi * ((o.step ?? 21) / colors(o).length); s < o.s1; s += o.step ?? 21) for (const side of o.sides ?? [-1, 1]) {
      const smp = tr.sampleAt(s);
      const p = tr.pointAt(s, side * (smp.halfWidth + smp.shoulder + (o.offset ?? 3.2)), new THREE.Vector3());
      layer.add(p.x, w.groundAt(p.x, p.z) - 0.1, p.z, smp.yaw, 1, null);
    }
  });
}
const colors = (o) => o.colors ?? ['#e5413a', '#ffd23f', '#2f8be8'];

/**
 * A line of lamp posts with glow halos.  o = { geometry (lampPost()), s0, s1, every: 36, side: -1|1|0 (both), offset: 2.6, glow:'#ffd9a0', glowSize: 5, glowHeight: 4.7,
 *   material, flicker }
 * The lantern hangs 1 m toward the road from the pole (geometry convention: arm along +X), so poles face the road.
 */
export function addLamps(w, o) {
  const tr = w.track;
  const layer = w.layer({ name: 'lamps', geometry: o.geometry, material: o.material, castShadow: false, cull: 0.7, chunk: 200 });
  const glows = [];
  for (let s = o.s0; s < o.s1; s += o.every ?? 36) {
    for (const side of o.side ? [o.side] : [-1, 1]) {
      const smp = tr.sampleAt(s);
      const lat = side * (smp.halfWidth + smp.shoulder + (o.offset ?? 2.6));
      const p = tr.pointAt(s, lat, new THREE.Vector3());
      p.y = w.groundAt(p.x, p.z);
      // arm points to the road: local +X must map to the direction toward the road centre
      const toRoad = new THREE.Vector3(-smp.right.x * side, 0, -smp.right.z * side).normalize();
      const yaw = Math.atan2(-toRoad.z, toRoad.x);
      layer.add(p.x, p.y - 0.05, p.z, yaw, 1, null);
      glows.push({ x: p.x + toRoad.x * 1.0, y: p.y + (o.glowHeight ?? 4.7), z: p.z + toRoad.z * 1.0, size: o.glowSize ?? 5, color: o.glow ?? '#ffd9a0', flicker: o.flicker ?? 0 });
    }
  }
  if (glows.length) createBillboards(w, glows, { name: 'lamp-glows', intensity: o.glowIntensity ?? 0.9, fadeFar: 360 });
  return layer;
}
