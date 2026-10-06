// Covered bridge: the wooden bridge (structures.js) plus plank walls with a window band, a gabled shingle roof on rafters and gable ends.
// OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { makeRows } from './ribbon.js';
import { buildBridge } from './structures.js';
import { toColor } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0);

/** o = { s0, s1, eave: 4.6, ridge: 8.8, plank, plank2, beam, roof, roofTop } (plus buildBridge options: wood, woodDark, woodLight, beamTop, stone...) */
export function buildCoveredBridge(world, o) {
  const tr = world.track;
  const group = buildBridge(world, { ...o, rails: false });
  group.name = 'covered-bridge';
  const rows = makeRows(tr, o.s0, o.s1, 2.0);
  const eave = o.eave ?? 4.6, ridge = o.ridge ?? 8.8;
  const plank = toColor(o.plank ?? '#4a3426'), plank2 = toColor(o.plank2 ?? '#5a4230'), beam = toColor(o.beam ?? '#2e2018'), roof = toColor(o.roof ?? '#2a3a3a'), roofTop = toColor(o.roofTop ?? '#3a5048');
  const B = new GeoBuilder();
  const P = (row, lat, h) => new THREE.Vector3(row.pos.x + row.right.x * lat, row.pos.y + row.right.y * lat + h, row.pos.z + row.right.z * lat);
  for (let r = 0; r < rows.length - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    const ea = a.hw + a.sh + 0.55, eb = b.hw + b.sh + 0.55;
    const rv = r % 2 ? plank : plank2;
    for (const side of [-1, 1]) {
      B.quad(P(a, side * ea, 0), P(b, side * eb, 0), P(b, side * eb, 1.15), P(a, side * ea, 1.15), rv);          // lower planks
      B.quad(P(a, side * ea, 2.75), P(b, side * eb, 2.75), P(b, side * eb, eave), P(a, side * ea, eave), rv);   // upper planks
      B.quad(P(a, side * (ea + 1.1), eave - 0.5), P(b, side * (eb + 1.1), eave - 0.5), P(b, 0, ridge), P(a, 0, ridge), r % 2 ? roof : roofTop); // roof slope
    }
    B.quad(P(a, -0.3, ridge + 0.14), P(b, -0.3, ridge + 0.14), P(b, 0.3, ridge + 0.14), P(a, 0.3, ridge + 0.14), beam);                          // ridge cap
  }
  const right = new THREE.Vector3(), fwd = new THREE.Vector3(), base = new THREE.Vector3();
  const strut = (p0, p1, w) => {
    const d = new THREE.Vector3().subVectors(p1, p0), l = d.length(); d.normalize();
    const rr = new THREE.Vector3().crossVectors(d, UP).normalize(), uu = new THREE.Vector3().crossVectors(rr, d).normalize();
    B.box(p0.x, p0.y, p0.z, rr, uu, d, w, w, l, { top: beam, side: beam, bottom: beam }, true);
  };
  for (let r = 0; r < rows.length; r += 3) {
    const row = rows[r];
    right.set(row.right.x, 0, row.right.z).normalize(); fwd.set(row.tan.x, 0, row.tan.z).normalize();
    const e = row.hw + row.sh + 0.55;
    for (const side of [-1, 1]) {
      base.copy(row.pos).addScaledVector(row.right, side * e);
      B.box(base.x, base.y, base.z, right, UP, fwd, 0.45, eave + 0.2, 0.45, { top: beam, side: beam, bottom: beam }, true);
      strut(P(row, side * e, eave - 1.4), P(row, side * (e - 1.6), eave + 0.1), 0.18);
      strut(P(row, side * (e + 1.0), eave - 0.45), P(row, 0, ridge), 0.24);                                    // rafter
    }
    B.box(row.pos.x, row.pos.y + eave - 0.1, row.pos.z, right, UP, fwd, e * 2 + 0.4, 0.28, 0.32, { top: beam, side: beam, bottom: beam }, true); // tie beam
  }
  for (const [row, dir] of [[rows[0], -1], [rows[rows.length - 1], 1]]) {
    const e = row.hw + row.sh + 0.55;
    const push = (v) => v.addScaledVector(row.tan, dir * 0.3);
    B.tri(push(P(row, -(e + 1.0), eave - 0.45)), push(P(row, e + 1.0, eave - 0.45)), push(P(row, 0, ridge)), plank2);
    B.quad(push(P(row, -e, eave - 0.45)), push(P(row, e, eave - 0.45)), push(P(row, e, eave - 1.0)), push(P(row, -e, eave - 1.0)), beam);          // header beam
  }
  const m = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
  group.add(m);
  return group;
}
