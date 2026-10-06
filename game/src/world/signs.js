// Corner warning signs: chevron boards on the OUTSIDE of sharp corners, pointing the way the road turns.   OWNER: Agent B.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { detectCorners } from '../track/corners.js';
import { toColor } from './geo.js';
import { arrowTexture } from './textures.js';

/**
 * opts = { radius: 85 (corners tighter than this get signs), colors:{a:'#e5413a', b:'#ffffff', post:'#3a4156'}, size: 3.2, rows: 3 }
 * Returns a Group (2 instanced-free merged meshes: left-pointing and right-pointing boards), or null when no corner qualifies.
 */
export function buildCornerSigns(world, opts = {}) {
  const tr = world.track;
  const corners = detectCorners(tr).filter((c) => c.minRadius < (opts.radius ?? 85) && c.angle > 0.5);
  if (!corners.length) return null;
  const size = opts.size ?? 3.2, postH = 1.5;
  const col = { a: '#e5413a', b: '#ffffff', post: '#4a5166', ...(opts.colors ?? {}) };
  const group = new THREE.Group();
  group.name = 'corner-signs';
  const up = new THREE.Vector3(0, 1, 0);
  for (const dir of [1, -1]) {
    const list = corners.filter((c) => c.dir === dir);
    if (!list.length) continue;
    const B = new GeoBuilder();
    const tex = world.tex(arrowTexture({ dir, a: col.a, b: col.b }));
    const postC = toColor(col.post);
    for (const c of list) {
      const n = c.minRadius < 45 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const s = c.sApex + (k - (n - 1) / 2) * (size + 3.2) * 1.15;
        const smp = tr.sampleAt(s);
        // outside of the turn: a left turn (dir +1) has its outside on the RIGHT
        const side = dir > 0 ? 1 : -1;
        const lat = side * (smp.halfWidth + smp.shoulder + 2.4);
        const p = tr.pointAt(s, lat, new THREE.Vector3());
        p.y = world.groundAt(p.x, p.z);
        const roadP = tr.pointAt(s, 0, new THREE.Vector3());
        // board faces the road centre (kept horizontal)
        const n3 = new THREE.Vector3(roadP.x - p.x, 0, roadP.z - p.z).normalize();
        const ex = new THREE.Vector3().crossVectors(up, n3).normalize();
        // posts (sample the dark border swatch of the board texture)
        B.uvDefault = [0.012, 0.012, 0.02, 0.02];
        for (const dx of [-0.8, 0.8]) B.box(p.x + ex.x * dx, p.y - 0.3, p.z + ex.z * dx, ex, up, n3, 0.12, postH + 0.3, 0.12, { top: postC, side: postC, bottom: postC }, true);
        // board (uv region = the full texture)
        B.panel(p.x, p.y + postH, p.z, ex, up, n3, size, size * 0.8, [1, 1, 1], [0, 0, 1, 1]);
        // thin back plate so the board has some thickness from behind
        B.panel(p.x - n3.x * 0.05, p.y + postH, p.z - n3.z * 0.05, ex.clone().negate(), up, n3.clone().negate(), size, size * 0.8, [0.35, 0.35, 0.4], [0.012, 0.012, 0.02, 0.02]);
        B.uvDefault = [0, 0, 1, 1];
      }
    }
    const m = new THREE.Mesh(B.build({ uv: true }), new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = false; m.matrixAutoUpdate = false;
    group.add(m);
  }
  return group;
}
