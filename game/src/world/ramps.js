// Jump ramps and chasms.   OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { makeRows, ribbon } from './ribbon.js';
import { toColor } from './geo.js';
import { rampTexture } from './textures.js';

/**
 * Jump ramps. Each `ramp` zone becomes a solid wedge whose top surface height is EXACTLY what KartPhysics sees:
 *   height(s, l) = roadPlane(s, l) + zone.height * (s - s0) / (s1 - s0)   for s in [s0,s1], l in [l0,l1]
 * and a vertical lip at s1 (the physics height drops back to the road there, which is what launches the kart).
 * style = { tex:{base,grain,stripeA,stripeB,chevron,glow}, side:'#hex', lip:'#hex', roughness, emissive }
 */
export function buildRamps(world, style = {}) {
  const track = world.track, group = new THREE.Group();
  group.name = 'ramps';
  const tex = world.tex(rampTexture(style.tex ?? {}));
  const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: style.roughness ?? 0.75, metalness: style.metalness ?? 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (style.emissive) { topMat.emissive = toColor(style.emissive); topMat.emissiveMap = tex; topMat.emissiveIntensity = style.emissiveIntensity ?? 0.5; }
  const sideCol = toColor(style.side ?? '#5a4a3c'), lipCol = toColor(style.lip ?? '#ffd23f');
  for (const z of track.ramps) {
    const len = z.s1 - z.s0, H = z.height;
    const rows = makeRows(track, z.s0, z.s1, 0.5);
    const lift = 0.05;
    const yOff = (row) => H * Math.min(1, Math.max(0, (row.s - z.s0) / len));
    const top = new THREE.Mesh(ribbon(rows, { l0: z.l0, l1: z.l1, lift, vScale: len, vOffset: -z.s0 / len, yOff }), topMat);
    top.receiveShadow = true; top.castShadow = true; top.matrixAutoUpdate = false;
    group.add(top);
    const B = new GeoBuilder();
    const tp = (row, l) => new THREE.Vector3(row.pos.x + row.right.x * l + row.up.x * lift, row.pos.y + row.right.y * l + row.up.y * lift + yOff(row), row.pos.z + row.right.z * l + row.up.z * lift);
    const bp = (row, l) => new THREE.Vector3(row.pos.x + row.right.x * l, row.pos.y + row.right.y * l - 0.4, row.pos.z + row.right.z * l);
    for (let r = 0; r < rows.length - 1; r++) for (const l of [z.l0, z.l1]) {
      B.quad(tp(rows[r], l), bp(rows[r], l), bp(rows[r + 1], l), tp(rows[r + 1], l), sideCol);
    }
    const last = rows[rows.length - 1];
    B.quad(tp(last, z.l0), bp(last, z.l0), bp(last, z.l1), tp(last, z.l1), lipCol); // lip face (visible to anything past the edge)
    // a bright strip along the lip edge so the take-off point reads from far away
    const e0 = tp(last, z.l0), e1 = tp(last, z.l1), back = last.tan.clone().multiplyScalar(-0.5);
    B.quad(e0.clone().add(back), e1.clone().add(back), e1.clone().setY(e1.y + 0.02), e0.clone().setY(e0.y + 0.02), lipCol);
    const sm = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    sm.castShadow = true; sm.matrixAutoUpdate = false;
    group.add(sm);
  }
  return group;
}

/**
 * Terrain carver that digs a chasm under a `gap` zone: steep walls at the gap ends, fading out sideways.
 * Usage: world.terrain.addCarver(chasmCarver(world, gapZone, { depth: 34 }))   (reads world.road.out = the nearest-road query for (x,z)).
 */
export function chasmCarver(world, gap, { depth = 34, sideReach = 30, endEdge = 3 } = {}) {
  const tr = world.track, L = tr.length;
  const mid = (gap.s0 + gap.s1) / 2, half = (gap.s1 - gap.s0) / 2;
  return (x, z, nat) => {
    const q = world.road.out; // set by Terrain.heightAt for exactly this point
    if (!q.near) return nat;
    let ds = Math.abs(q.s - mid); if (ds > L / 2) ds = L - ds;
    const along = 1 - Math.min(1, Math.max(0, (ds - half) / endEdge));      // 1 inside the gap, 0 just beyond its ends
    if (along <= 0) return nat;
    const lat = Math.abs(q.lateral) - (q.hw + q.sh);
    const across = 1 - Math.min(1, Math.max(0, lat / sideReach));
    const w = along * (across * across * (3 - 2 * across));
    const floor = Math.min(nat, q.cy - depth * (0.75 + 0.25 * Math.sin(q.lateral * 0.31 + q.s * 0.17)));
    return nat + (floor - nat) * w;
  };
}
