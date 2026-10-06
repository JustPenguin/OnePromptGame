// Road infrastructure: tunnels, viaducts (elevated road on piers), plus an unlit "glow" mesh helper.   OWNER: Agent B.
// Both build from the same centreline frames the physics uses, so walls/ceilings/decks line up exactly with the drivable corridor.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { makeRows, ribbon, skirt } from './ribbon.js';
import { toColor } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/** Unlit vertex-coloured mesh (for neon strips / lamps: values > 1 bloom). */
export function glowMesh(geometry, { name = 'glow', fog = true, side = THREE.DoubleSide } = {}) {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog, side }));
  m.name = name; m.matrixAutoUpdate = false;
  return m;
}

/**
 * Tunnel over s0..s1.
 * o = { s0, s1, height: 8.8, wall:'#2a2d4a', wall2:'#3a3f66', ceiling:'#1e2038', strip:['#22d3ff','#ff3dcb'], stripEvery..., lights:'#fff0d0', portal:'#3a3f66',
 *       portalTrim:'#ff3dcb', roofColor:'#2c2f4a', roofExtra: 1.4, ribEvery: 6, lampEvery: 9 }
 * Returns a Group { lit mesh, glow mesh }.
 */
export function buildTunnel(world, o) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'tunnel';
  const rows = makeRows(tr, o.s0, o.s1, 2.0);
  const Hh = o.height ?? 8.8, roof = o.roofExtra ?? 1.6;
  const wall = toColor(o.wall ?? '#2a2d4a'), wall2 = toColor(o.wall2 ?? '#3a3f66'), ceil = toColor(o.ceiling ?? '#1e2038'), roofC = toColor(o.roofColor ?? '#2c2f4a');
  const stripC = (o.strip ?? ['#22d3ff', '#ff3dcb']).map((c) => toColor(c).multiplyScalar(2.6));
  const lampC = toColor(o.lights ?? '#fff0d0').multiplyScalar(3.0);
  const L = new GeoBuilder(), G = new GeoBuilder();
  const P = (row, lat, h) => new THREE.Vector3(row.pos.x + row.right.x * lat, row.pos.y + row.right.y * lat + h, row.pos.z + row.right.z * lat);
  const E = (row) => row.hw + row.sh;                // inner wall line = the physics barrier line
  const ribEvery = Math.max(1, Math.round((o.ribEvery ?? 6) / 2)), lampEvery = Math.max(1, Math.round((o.lampEvery ?? 9) / 2));
  for (let r = 0; r < rows.length - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    const ea = E(a), eb = E(b);
    const rib = r % ribEvery === 0;
    for (const side of [-1, 1]) {
      // inner wall: lower half darker, upper half lighter; ribs are slightly proud panels
      const w0 = rib ? wall2 : wall;
      L.quad(P(a, side * ea, 0), P(b, side * eb, 0), P(b, side * eb, Hh * 0.55), P(a, side * ea, Hh * 0.55), w0);
      L.quad(P(a, side * ea, Hh * 0.55), P(b, side * eb, Hh * 0.55), P(b, side * eb, Hh), P(a, side * ea, Hh), rib ? wall : wall2);
      // continuous neon strip along the wall (alternating colours per side)
      const sc = stripC[side > 0 ? 0 : 1 % stripC.length];
      const n = side > 0 ? 0 : 0.0;
      G.quad(P(a, side * (ea - 0.04), 3.4), P(b, side * (eb - 0.04), 3.4), P(b, side * (eb - 0.04), 3.75), P(a, side * (ea - 0.04), 3.75), sc);
      G.quad(P(a, side * (ea - 0.04), Hh - 1.4), P(b, side * (eb - 0.04), Hh - 1.4), P(b, side * (eb - 0.04), Hh - 1.1), P(a, side * (ea - 0.04), Hh - 1.1), stripC[(side > 0 ? 1 : 0) % stripC.length].clone().multiplyScalar(0.8));
    }
    // ceiling (inside) and roof (outside)
    L.quad(P(a, -ea, Hh), P(a, ea, Hh), P(b, eb, Hh), P(b, -eb, Hh), ceil);
    L.quad(P(a, -ea - 1.5, Hh + roof), P(a, ea + 1.5, Hh + roof), P(b, eb + 1.5, Hh + roof), P(b, -eb - 1.5, Hh + roof), roofC);
    for (const side of [-1, 1]) {
      // outer side walls from the street up to the roof so the tunnel reads as a solid structure from the viaduct / buildings
      L.quad(P(a, side * (ea + 1.5), -2), P(b, side * (eb + 1.5), -2), P(b, side * (eb + 1.5), Hh + roof), P(a, side * (ea + 1.5), Hh + roof), roofC.clone().multiplyScalar(0.8));
    }
    // ceiling light bars
    if (r % lampEvery === 0) {
      for (const k of [-0.5, 0.5]) G.quad(P(a, k * ea - 0.8, Hh - 0.04), P(a, k * ea + 0.8, Hh - 0.04), P(b, k * eb + 0.8, Hh - 0.04), P(b, k * eb - 0.8, Hh - 0.04), lampC);
    }
  }
  // portals: thick frames with a neon outline at both ends
  const portal = toColor(o.portal ?? '#3a3f66'), trim = toColor(o.portalTrim ?? '#ff3dcb').multiplyScalar(2.6);
  for (const [row, dir] of [[rows[0], -1], [rows[rows.length - 1], 1]]) {
    const e = E(row), t = row.tan, f = 0.0;
    const push = (v) => v.addScaledVector(t, dir * 0.6);
    const ring = (lat, h, w, hh) => [push(P(row, lat - w, h)), push(P(row, lat + w, h)), push(P(row, lat + w, h + hh)), push(P(row, lat - w, h + hh))];
    // lintel above the opening and two thick piers
    const lintel = ring(0, Hh - 1.2, e + 3.2, Hh * 0 + 2.8);
    L.quad(lintel[0], lintel[1], lintel[2], lintel[3], portal);
    for (const side of [-1, 1]) { const p = ring(side * (e + 1.6), -1, 1.6, Hh + roof + 1); L.quad(p[0], p[1], p[2], p[3], portal); }
    // neon outline of the opening
    const o0 = (lat, h) => push(P(row, lat, h));
    const y1 = Hh - 1.2;
    G.quad(o0(-e, y1), o0(e, y1), o0(e, y1 + 0.35), o0(-e, y1 + 0.35), trim);
    for (const side of [-1, 1]) G.quad(o0(side * e, 0), o0(side * (e - 0.35), 0), o0(side * (e - 0.35), y1), o0(side * e, y1), trim);
  }
  const lit = new THREE.Mesh(L.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: toColor(o.ambient ?? '#1c2250') }));
  lit.castShadow = false; lit.receiveShadow = true; lit.matrixAutoUpdate = false;
  group.add(lit, glowMesh(G.build(), { name: 'tunnel-glow' }));
  return group;
}

/**
 * Viaduct: a box girder under the road + piers down to the ground every `every` metres.
 * o = { s0, s1, every: 22, girder: 1.7, concrete:'#4a4f6e', concrete2:'#6a7094', ring:'#22d3ff', glow: ['#ff3dcb','#22d3ff'] }
 */
export function buildViaduct(world, o) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'viaduct';
  const rows = makeRows(tr, o.s0, o.s1, 2.0);
  const girder = o.girder ?? 1.7;
  const c1 = toColor(o.concrete ?? '#4a4f6e'), c2 = toColor(o.concrete2 ?? '#6a7094');
  const L = new GeoBuilder(), G = new GeoBuilder();
  const glowC = (o.glow ?? ['#ff3dcb', '#22d3ff']).map((c) => toColor(c).multiplyScalar(2.6));
  const P = (row, lat, h) => new THREE.Vector3(row.pos.x + row.right.x * lat, row.pos.y + row.right.y * lat + h, row.pos.z + row.right.z * lat);
  for (let r = 0; r < rows.length - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    const ea = a.hw + a.sh + 0.6, eb = b.hw + b.sh + 0.6;
    // girder sides (sloping inwards), underside
    for (const side of [-1, 1]) {
      L.quad(P(a, side * ea, 0), P(b, side * eb, 0), P(b, side * (eb - 1.2), -girder), P(a, side * (ea - 1.2), -girder), c1);
      const gc = glowC[(side > 0 ? 0 : 1) % glowC.length];
      G.quad(P(a, side * (ea - 1.2), -girder + 0.02), P(b, side * (eb - 1.2), -girder + 0.02), P(b, side * (eb - 1.2), -girder + 0.28), P(a, side * (ea - 1.2), -girder + 0.28), gc);
    }
    L.quad(P(a, -(ea - 1.2), -girder), P(b, -(eb - 1.2), -girder), P(b, eb - 1.2, -girder), P(a, ea - 1.2, -girder), c1.clone().multiplyScalar(0.55));
  }
  // piers
  const every = o.piers === false ? 1e9 : (o.every ?? 22);
  let acc = every * 0.5;
  const right = new THREE.Vector3(), fwd = new THREE.Vector3(), base = new THREE.Vector3();
  const ringC = toColor(o.ring ?? '#22d3ff').multiplyScalar(2.4);
  for (let r = 0; r < rows.length; r++) {
    if (r > 0) acc += 2.0;
    if (acc < every) continue;
    acc -= every;
    const row = rows[r];
    right.set(row.right.x, 0, row.right.z).normalize(); fwd.set(row.tan.x, 0, row.tan.z).normalize();
    const e = row.hw + row.sh;
    const under = row.pos.y - girder;
    // two columns (left/right of centre) + a cap beam
    for (const side of [-1, 1]) {
      const lat = side * e * 0.62;
      const px = row.pos.x + row.right.x * lat, pz = row.pos.z + row.right.z * lat;
      const gy = world.groundAt(px, pz);
      const h = under - 0.5 - gy;
      if (h < 1.2) continue;
      L.box(px, gy - 0.4, pz, right, UP, fwd, 2.4, h + 0.4, 2.4, { top: c2, side: c1, bottom: c1 }, true);
      G.box(px, gy + 0.6, pz, right, UP, fwd, 2.5, 0.16, 2.5, ringC, true);
      G.box(px, under - 1.4, pz, right, UP, fwd, 2.5, 0.14, 2.5, ringC, true);
    }
    const cy = under - 0.5;
    L.box(row.pos.x + row.right.x * 0, cy, row.pos.z, right, UP, fwd, e * 2 + 1.0, 0.9, 3.0, { top: c2, side: c1, bottom: c1 }, true);
  }
  const lit = new THREE.Mesh(L.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  lit.castShadow = true; lit.receiveShadow = true; lit.matrixAutoUpdate = false;
  group.add(lit, glowMesh(G.build(), { name: 'viaduct-glow' }));
  return group;
}

/**
 * Edge trim for OPEN (wall-less) road stretches (track.openEdges): a raised stone lip out to the physics limit (road edge + 2 m, the slack
 * KartPhysics allows before a kart falls), a glowing outline strip, and a deep girder under the deck.  Returns a Group or null.
 * o = { lip:'#2a2224', lipTop:'#4a3c3e', glow:'#ff6a1a', depth: 2.6, reach: 2.0, girder:'#2a2224' }
 */
export function buildOpenEdgeTrim(world, o = {}) {
  const tr = world.track;
  if (!tr.openEdges.length) return null;
  const group = new THREE.Group();
  group.name = 'open-edge-trim';
  const lip = toColor(o.lip ?? '#2a2224'), lipTop = toColor(o.lipTop ?? '#4a3c3e'), glow = toColor(o.glow ?? '#ff6a1a').multiplyScalar(2.6), girderC = toColor(o.girder ?? '#2a2224');
  const reach = o.reach ?? 2.0, depth = o.depth ?? 2.6;
  const L = new GeoBuilder(), G = new GeoBuilder();
  const P = (row, lat, h) => new THREE.Vector3(row.pos.x + row.right.x * lat, row.pos.y + row.right.y * lat + h, row.pos.z + row.right.z * lat);
  for (const e of tr.openEdges) {
    const rows = makeRows(tr, e.s0, e.s1, 1.0);
    const sides = e.side === 'left' ? [-1] : e.side === 'right' ? [1] : [-1, 1];
    for (let r = 0; r < rows.length - 1; r++) {
      const a = rows[r], b = rows[r + 1];
      for (const side of sides) {
        const ha = a.hw, hb = b.hw, ra = ha + reach, rb = hb + reach;
        // lip: top face, outer face, and an under-chamfer into the girder
        L.quad(P(a, side * ha, 0.16), P(b, side * hb, 0.16), P(b, side * rb, 0.16), P(a, side * ra, 0.16), lipTop);
        L.quad(P(a, side * ra, 0.16), P(b, side * rb, 0.16), P(b, side * rb, -depth * 0.55), P(a, side * ra, -depth * 0.55), lip);
        L.quad(P(a, side * ra, -depth * 0.55), P(b, side * rb, -depth * 0.55), P(b, side * (rb - 1.3), -depth), P(a, side * (ra - 1.3), -depth), girderC);
        if (o.glowStrip !== false) {
          G.quad(P(a, side * (ra - 0.34), 0.18), P(b, side * (rb - 0.34), 0.18), P(b, side * (rb - 0.04), 0.18), P(a, side * (ra - 0.04), 0.18), glow);
          G.quad(P(a, side * (ra + 0.02), 0.0), P(b, side * (rb + 0.02), 0.0), P(b, side * (rb + 0.02), 0.2), P(a, side * (ra + 0.02), 0.2), glow);
        }
      }
      L.quad(P(a, -(a.hw + reach - 1.3), -depth), P(b, -(b.hw + reach - 1.3), -depth), P(b, b.hw + reach - 1.3, -depth), P(a, a.hw + reach - 1.3, -depth), girderC.clone().multiplyScalar(0.5));
    }
  }
  const lit = new THREE.Mesh(L.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  lit.castShadow = true; lit.receiveShadow = true; lit.matrixAutoUpdate = false;
  group.add(lit, glowMesh(G.build(), { name: 'edge-glow' }));
  return group;
}
