// Buildings & landmarks: windmill, barn, silo, houses, lighthouse etc.   OWNER: Agent B.
// Each returns { group, ...animated parts } built from merged vertex-coloured geometry (few draw calls), base at y = 0,
// model +Z = "front".  Materials are MeshLambertMaterial({vertexColors:true}) unless noted.
import * as THREE from 'three';
import { box, cyl, cone, blob, merge, xf, paint } from '../geo.js';
import { GeoBuilder } from '../builder.js';

const lam = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
const U = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/** Classic windmill ~19 m tall.  Returns { group, blades (Group to spin about local Z), bladesPivot }. */
export function windmill({ wall = '#f1e8d6', wood = '#8a5a34', roof = '#c0392b', stone = '#b8ae9c', sail = '#f7f1e1', scale = 1 } = {}) {
  const parts = [];
  // stone foundation + tapered body in two bands
  parts.push(cyl(3.7, 4.6, 2.2, 14, stone, '#d6ccb8'));
  parts.push(cyl(2.7, 3.7, 8.2, 14, wall, '#fffaf0', { pos: [0, 2.0, 0] }));
  parts.push(cyl(2.82, 2.82, 0.35, 14, wood, wood, { pos: [0, 4.6, 0] }));       // wooden band
  parts.push(cyl(2.95, 2.95, 0.3, 14, wood, wood, { pos: [0, 2.0, 0] }));
  parts.push(cyl(2.55, 2.7, 0.3, 14, wood, wood, { pos: [0, 9.8, 0] }));
  // cap (roof) + little finial
  parts.push(cone(3.45, 3.4, 14, roof, '#e25a46', { pos: [0, 10.1, 0] }));
  parts.push(cyl(0.12, 0.12, 1.2, 5, wood, wood, { pos: [0, 13.4, 0] }));
  parts.push(blob(0.35, 1, '#ffd23f', '#fff0a0', { pos: [0, 14.7, 0] }));
  // door, windows, balcony
  parts.push(box(1.5, 2.5, 0.5, wood, '#a8743f', { pos: [0, 0.3, 3.55] }));
  parts.push(cone(0.8, 0.6, 3, wood, wood, { pos: [0, 2.8, 3.62], rot: [0, 0, 0], scale: [1.1, 0.6, 0.3] }));
  for (const [y, a] of [[5.6, 0.4], [5.6, -0.4 + Math.PI * 0.5], [5.6, Math.PI * 1.1], [7.4, 0]]) {
    const x = Math.sin(a) * 2.5, z = Math.cos(a) * 2.5;
    parts.push(box(0.8, 1.0, 0.35, '#3a4a66', '#4f6288', { pos: [x, y, z], rot: [0, a, 0] }));
    parts.push(box(1.0, 0.16, 0.45, '#fffaf0', '#fffaf0', { pos: [x * 1.02, y - 0.12, z * 1.02], rot: [0, a, 0] }));
  }
  const body = merge(parts);
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(body, lam());
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  // sails: hub + 4 arms with lattice cloth, built around the Z axis
  const sp = [];
  sp.push(cyl(0.55, 0.7, 1.6, 8, '#5a3a22', '#7a5230', { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.8] }));
  sp.push(blob(0.9, 1, '#3f2a18', '#5a3a22', { pos: [0, 0, 1.7] }));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arm = [];
    arm.push(box(0.4, 15.5, 0.28, wood, '#a8743f', { pos: [0, 0.3, 0], rot: [0, 0, 0] }));
    // sail cloth panel (slightly twisted) + cross bars
    arm.push(box(2.6, 10.8, 0.1, sail, '#ffffff', { pos: [1.5, 3.4, 0.02] }));
    for (let k = 0; k < 6; k++) arm.push(box(2.8, 0.14, 0.22, wood, wood, { pos: [1.5, 3.8 + k * 1.75, 0.05] }));
    arm.push(box(0.16, 11.2, 0.22, wood, wood, { pos: [2.85, 3.3, 0.05] }));
    const am = merge(arm);
    xf(am, { rot: [0, 0, a] });
    sp.push(am);
  }
  const sails = merge(sp);
  const bladesMesh = new THREE.Mesh(sails, lam({ side: THREE.DoubleSide }));
  bladesMesh.castShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(0, 8.6, 3.35);
  pivot.rotation.x = -0.05;
  pivot.add(bladesMesh);
  group.add(pivot);
  group.scale.setScalar(scale);
  return { group, pivot, blades: bladesMesh };
}

/** Red barn with a gambrel roof ~9 m tall, 14 x 10 m footprint. */
export function barn({ wall = '#c0392b', trim = '#f7f1e1', roof = '#6b6f7a', wood = '#7a4e2c' } = {}) {
  const B = new GeoBuilder();
  const ex = X, ey = U, ez = Z;
  const add = (cx, cy, cz, sx, sy, sz, c) => B.box(cx, cy, cz, ex, ey, ez, sx, sy, sz, c, true);
  const c = (h) => new THREE.Color(h);
  add(0, 0, 0, 14, 4.6, 10, { top: c(wall), side: c(wall), bottom: c(wall) });
  // gambrel roof: two sloped lower panels + two upper
  const roofC = c(roof), roofD = c('#4f535e');
  const roofQuad = (a, b, cc, d, col) => B.quad(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...cc), new THREE.Vector3(...d), col);
  const w2 = 7.6, d2 = 5.5;
  // lower slopes (y 4.6 -> 7.2) and upper slopes (7.2 -> 9.2)
  roofQuad([-w2, 4.6, d2], [-w2, 4.6, -d2], [-4.6, 7.2, -d2], [-4.6, 7.2, d2], roofC);
  roofQuad([4.6, 7.2, d2], [4.6, 7.2, -d2], [w2, 4.6, -d2], [w2, 4.6, d2], roofC);
  roofQuad([-4.6, 7.2, d2], [-4.6, 7.2, -d2], [0, 9.3, -d2], [0, 9.3, d2], roofD);
  roofQuad([0, 9.3, d2], [0, 9.3, -d2], [4.6, 7.2, -d2], [4.6, 7.2, d2], roofD);
  // gable walls (wall colour), front (+z) and back (-z): convex pentagon fanned into triangles
  {
    const prof = [[-7, 4.6], [7, 4.6], [7, 4.9], [4.6, 7.2], [0, 9.3], [-4.6, 7.2], [-7, 4.9]];
    for (const [z, flip] of [[5, false], [-5, true]]) {
      const pts = (flip ? prof.slice().reverse() : prof).map(([x, y]) => new THREE.Vector3(x, y, z));
      for (let i = 1; i < pts.length - 1; i++) B.tri(pts[0], pts[i], pts[i + 1], c(wall));
    }
  }
  // big doors with white X trim, loft window
  add(0, 0, 5.02, 4.4, 3.8, 0.2, { top: c(wood), side: c(wood), bottom: c(wood) });
  for (const [x0, x1] of [[-2.1, 0], [0, 2.1]]) {
    B.quad(new THREE.Vector3(x0 + 0.1, 0.1, 5.15), new THREE.Vector3(x1 - 0.1, 3.7, 5.15), new THREE.Vector3(x1 - 0.1, 3.9, 5.15), new THREE.Vector3(x0 + 0.1, 0.3, 5.15), c(trim));
  }
  add(0, 5.2, 5.05, 1.6, 1.8, 0.15, { top: c('#2d3a52'), side: c('#2d3a52'), bottom: c('#2d3a52') });
  add(-7.05, 0, 0, 0.18, 4.6, 10.2, { top: c(trim), side: c(trim), bottom: c(trim) });
  add(7.05, 0, 0, 0.18, 4.6, 10.2, { top: c(trim), side: c(trim), bottom: c(trim) });
  // silo
  const silo = merge([cyl(1.9, 1.9, 9.5, 12, '#d8dde8', '#f4f6fb', { pos: [10.2, 0, -1.5] }), blob(1.9, 1, '#9aa2b2', '#c9d0de', { pos: [10.2, 9.5, -1.5], squash: 0.7 })]);
  const group = new THREE.Group();
  const m1 = new THREE.Mesh(B.build(), lam({ side: THREE.DoubleSide }));
  const m2 = new THREE.Mesh(silo, lam());
  [m1, m2].forEach((m) => { m.castShadow = true; m.receiveShadow = true; group.add(m); });
  return { group };
}

/** Hot air balloon: striped envelope + basket.  Returns { group, flame }.  ~22 m tall at scale 1. */
export function balloon({ colors = ['#ff3d6a', '#ffd23f', '#22d3ff', '#ffffff'], gores = 16, scale = 1, basket = '#8a5a34' } = {}) {
  const R = 6.2, ws = gores, hs = 18;
  const g = new THREE.SphereGeometry(R, ws, hs);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const cols = colors.map((h) => new THREE.Color(h));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // pinch the bottom into a neck, lift the whole shape
    const t = y / R;
    const k = t < 0 ? 1 - 0.78 * Math.pow(-t, 2.1) : 1;
    pos.setXYZ(i, x * k, (y < 0 ? y * 0.95 : y * 1.12) + R * 1.1, z * k);
    const az = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    c.copy(cols[Math.floor(az * ws) % cols.length]);
    const shade = 0.72 + 0.28 * Math.max(0, t * 0.5 + 0.5);
    col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const parts = [g];
  parts.push(cyl(0.9, 0.9, 0.18, 10, '#2a2a2a', '#2a2a2a', { pos: [0, 0.35, 0] }));
  parts.push(box(1.8, 1.1, 1.8, basket, '#a8743f', { pos: [0, -1.6, 0] }));
  for (const [x, z] of [[0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]]) parts.push(cyl(0.04, 0.04, 2.6, 3, '#d9d0c0', '#d9d0c0', { pos: [x * 0.8, -0.6, z * 0.8], rot: [x * 0.1, 0, -z * 0.1] }));
  const body = merge(parts);
  const group = new THREE.Group();
  const m = new THREE.Mesh(body, lam());
  m.castShadow = false;
  group.add(m);
  group.scale.setScalar(scale);
  return { group };
}
