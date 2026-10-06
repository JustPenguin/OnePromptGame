// Big built things beside / over the road: bridges, grandstands (more in later sections: tunnels, viaducts, ramps).   OWNER: Agent B.
// All return a THREE.Group already positioned in world space (add with world.place()).
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { makeRows, ribbon } from './ribbon.js';
import { _sweep, _posts } from './barriers.js';
import { woodTexture, bannerTexture, crowdTexture } from './textures.js';
import { toColor } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Wooden (or stone) bridge over s0..s1.  The terrain under it is free (see config `free`) so a stream can run below.
 * o = { s0, s1, wood:'#b07a45', plank:{...}, beam:'#6b4426', stone:'#9a9488', pileEvery:6, rails:true }
 */
export function buildBridge(world, o) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'bridge';
  const rows = makeRows(tr, o.s0, o.s1, 1.0);
  const beam = toColor(o.beam ?? '#6b4426'), beamTop = toColor(o.beamTop ?? '#8a5a34'), stone = toColor(o.stone ?? '#a39d90'), stoneTop = toColor(o.stoneTop ?? '#c2bcae');
  // deck
  const tex = world.tex(woodTexture({ base: o.wood ?? '#b07a45', dark: o.woodDark ?? '#7c4f2a', light: o.woodLight ?? '#d9a066', planks: 8, across: true }));
  const edge = (r) => r.hw + r.sh + 0.35;
  const deckMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5 });
  const deck = new THREE.Mesh(ribbon(rows, { l0: (r) => -edge(r), l1: (r) => edge(r), lift: 0.075, vScale: 4 }), deckMat);
  deck.receiveShadow = true; deck.name = 'bridge-deck';
  group.add(deck);

  const B = new GeoBuilder();
  const right = new THREE.Vector3(), fwd = new THREE.Vector3(), base = new THREE.Vector3(), p0 = new THREE.Vector3();
  // fascia beams along both edges (thick, hang below the deck)
  for (const side of [-1, 1]) {
    _sweep(B, tr, rows, side, [[-0.05, -1.05], [0.5, -1.05], [0.5, 0.08], [-0.05, 0.08]], (r, f) => (f === 2 ? beamTop : beam), { baseLateral: (row) => row.hw + row.sh + 0.12 });
    if (o.rails !== false) {
      // sturdy railing: posts + two heavy rails, sitting a little inside the physics wall line so nothing z-fights with the fence
      _posts(B, tr, rows, side, { every: 3, h: 1.35, w: 0.3, d: 0.3, color: beam, topColor: beamTop, lateral: (row) => row.hw + row.sh + 0.34, sink: 0.1 });
      for (const y of [0.55, 1.05]) _sweep(B, tr, rows, side, [[-0.06, y - 0.11], [0.2, y - 0.11], [0.2, y + 0.11], [-0.06, y + 0.11]], (r, f) => (f === 2 ? beamTop : beam), { baseLateral: (row) => row.hw + row.sh + 0.12 });
    }
  }
  // cross beams + piles
  const every = o.pileEvery ?? 6;
  for (let r = 0; r < rows.length; r += every) {
    const row = rows[r];
    right.set(row.right.x, 0, row.right.z).normalize(); fwd.set(row.tan.x, 0, row.tan.z).normalize();
    const w = edge(row) * 2;
    base.copy(row.pos); base.y -= 0.95;
    B.box(base.x, base.y, base.z, right, UP, fwd, w, 0.4, 0.45, { top: beamTop, side: beam, bottom: beam }, true);
    for (const side of [-1, 1]) {
      p0.copy(row.pos).addScaledVector(row.right, side * (row.hw + row.sh - 0.5));
      const gy = world.groundAt(p0.x, p0.z) - 1.2, top = row.pos.y - 0.6;
      const h = Math.max(1, top - gy);
      B.box(p0.x, gy, p0.z, right, UP, fwd, 0.55, h, 0.55, { top: beamTop, side: beam, bottom: beam }, true);
    }
  }
  // stone end posts at the four corners
  for (const [row, dir] of [[rows[0], 1], [rows[rows.length - 1], -1]]) {
    right.set(row.right.x, 0, row.right.z).normalize(); fwd.set(row.tan.x, 0, row.tan.z).normalize();
    for (const side of [-1, 1]) {
      p0.copy(row.pos).addScaledVector(row.right, side * (row.hw + row.sh + 0.4)).addScaledVector(row.tan, dir * 0.6);
      B.box(p0.x, p0.y - 0.9, p0.z, right, UP, fwd, 1.5, 3.1, 1.5, { top: stoneTop, side: stone, bottom: stone }, true);
      B.box(p0.x, p0.y + 2.2, p0.z, right, UP, fwd, 1.75, 0.35, 1.75, { top: stoneTop, side: stoneTop, bottom: stone }, true);
    }
  }
  const m = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return group;
}

/**
 * Grandstand beside the start straight.  o = { s, length, side:+1|-1 (right/left), gap (m beyond the barrier), tiers, depth,
 *   roof:'#e5413a', roof2:'#ffffff', frame:'#d9dfec', banner:{ text, bg } }
 */
export function buildGrandstand(world, o) {
  const tr = world.track, group = new THREE.Group();
  group.name = 'grandstand';
  const side = o.side ?? 1, len = o.length ?? 60, tiers = o.tiers ?? 6, treadD = o.tread ?? 1.15, riserH = o.riser ?? 0.9;
  const rowsAlong = makeRows(tr, o.s - len / 2, o.s + len / 2, 2.0);
  const frame = toColor(o.frame ?? '#cfd6e6'), dark = toColor(o.dark ?? '#4a5166'), roofA = toColor(o.roof ?? '#e5413a'), roofB = toColor(o.roof2 ?? '#f7f4ea');
  const B = new GeoBuilder();     // vertex-coloured structure
  const C = new GeoBuilder();     // crowd (textured)
  const smp = tr.sampleAt(o.s);
  const gap = o.gap ?? 5;
  // local frame (outward = away from the road on `side`)
  const out = new THREE.Vector3(smp.right.x * side, 0, smp.right.z * side).normalize();
  const fwd = new THREE.Vector3(smp.tangent.x, 0, smp.tangent.z).normalize();
  const rightV = new THREE.Vector3().crossVectors(fwd, UP).normalize(); // box width axis helper
  const base = new THREE.Vector3().copy(smp.position).addScaledVector(smp.right, side * (smp.halfWidth + smp.shoulder + gap));
  base.y = world.groundAt(base.x, base.z);
  const baseY = Math.max(base.y, smp.position.y - 1.5);
  const P = (d, h, a = 0) => new THREE.Vector3(base.x + out.x * d + fwd.x * a, baseY + h, base.z + out.z * d + fwd.z * a);
  const a0 = -len / 2, a1 = len / 2;
  const colUV = (k) => [0, k * 0.0, len / 10, 1];
  for (let k = 0; k < tiers; k++) {
    const d0 = k * treadD, h0 = k === 0 ? 0 : k * riserH, h1 = (k + 1) * riserH;
    // tread (concrete step) and riser (crowd)
    B.quad(P(d0, h1, a0), P(d0, h1, a1), P(d0 + treadD, h1, a1), P(d0 + treadD, h1, a0), frame);
    const v0 = (k % 3) / 3;
    C.quad(P(d0, h0, a0), P(d0, h0, a1), P(d0, h1, a1), P(d0, h1, a0), [1, 1, 1], [0, v0, len / 9, v0 + 1 / 3]);
    // side walls
    for (const a of [a0, a1]) B.quad(P(d0, 0, a), P(d0 + treadD, 0, a), P(d0 + treadD, h1, a), P(d0, h1, a), dark);
  }
  // back wall
  B.quad(P(tiers * treadD, 0, a0), P(tiers * treadD, 0, a1), P(tiers * treadD, tiers * riserH, a1), P(tiers * treadD, tiers * riserH, a0), dark);
  // roof: slightly tilted striped canopy on poles
  const roofH = tiers * riserH + 3.6, depth = tiers * treadD + 1.5;
  const stripes = Math.max(4, Math.round(len / 3));
  for (let i = 0; i < stripes; i++) {
    const t0 = a0 + (len * i) / stripes, t1 = a0 + (len * (i + 1)) / stripes;
    const c = i % 2 ? roofB : roofA;
    B.quad(P(-1.2, roofH - 0.6, t0), P(-1.2, roofH - 0.6, t1), P(depth, roofH + 0.2, t1), P(depth, roofH + 0.2, t0), c);
    B.quad(P(depth, roofH - 0.2, t0), P(depth, roofH - 0.2, t1), P(-1.2, roofH - 1.0, t1), P(-1.2, roofH - 1.0, t0), dark);
  }
  // roof front board with the track name
  for (const a of [a0 + 0.3, a1 - 0.3, 0]) {
    const pole = [P(-0.6, 0, a), P(-0.6, roofH - 0.7, a)];
    B.box(pole[0].x, pole[0].y, pole[0].z, out, UP, fwd, 0.35, roofH - 0.7, 0.35, { top: frame, side: frame, bottom: frame }, true);
  }
  group.add(new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const ctex = world.tex(crowdTexture({ seed: o.seed ?? 3 }));
  const crowd = new THREE.Mesh(C.build({ uv: true }), new THREE.MeshLambertMaterial({ map: ctex, vertexColors: true, side: THREE.DoubleSide }));
  group.add(crowd);
  // banner board on the front edge of the roof
  const btex = world.tex(bannerTexture({ text: o.banner?.text ?? 'GO GO GO!', sub: '', bg: o.banner?.bg ?? '#2f8be8', trim: '#ffd23f', w: 1024, h: 160, checker: false }));
  const bb = new GeoBuilder();
  const faceN = out.clone().multiplyScalar(-1);
  const ex = new THREE.Vector3().crossVectors(UP, faceN).normalize();
  const c0 = P(-1.25, roofH - 1.7, 0);
  bb.panel(c0.x, c0.y, c0.z, ex, UP, faceN, Math.min(len - 4, 24), 1.5, [1, 1, 1], [0, 0, 1, 1]);
  group.add(new THREE.Mesh(bb.build({ uv: true }), new THREE.MeshBasicMaterial({ map: btex, side: THREE.DoubleSide })));
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return group;
}
