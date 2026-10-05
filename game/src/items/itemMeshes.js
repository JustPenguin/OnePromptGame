// Procedural meshes for the world items (peel, orb, seeker, bomb, comet, coin) built from three.js primitives.
// Model space: +Z forward, +Y up, origin = the item's centre.  Each recipe is MERGED into a single vertex-coloured
// geometry (one draw call); glow/flame parts are separate additive meshes.  One resource set per ItemSystem.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const tmpColor = new THREE.Color();

/** Paint every vertex of a geometry one colour (linear working space). */
function paint(geo, hex) {
  const c = tmpColor.set(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const place = (geo, x = 0, y = 0, z = 0) => { geo.translate(x, y, z); return geo; };
const mergeAll = (parts) => {
  // mergeGeometries needs identical attribute sets and all-indexed or all-non-indexed (polyhedra are non-indexed)
  const flat = parts.map((g) => {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g.index ? g.toNonIndexed() : g;
  });
  const out = mergeGeometries(flat, false);
  parts.forEach((g) => g.dispose());
  return out;
};

/** One curled peel petal lying along +Z: lens-shaped strip, ridge in the middle, edges drooping, tip curling up. */
function petalGeometry(L, W, curl, nU = 12, nV = 6) {
  const pos = [], col = [], idx = [];
  const yellow = new THREE.Color('#ffe94a'), lime = new THREE.Color('#8fe01a'), white = new THREE.Color('#ffffff'), c = new THREE.Color();
  for (let i = 0; i <= nU; i++) {
    const u = i / nU;
    const w = W * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * u)), 0.85);
    const ridge = 0.2 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.1)) + curl * u * u * u;
    for (let j = 0; j <= nV; j++) {
      const v = (j / nV) * 2 - 1;
      pos.push(v * w, ridge - 0.2 * v * v * (w / W) - 0.02, 0.1 + L * u);
      c.copy(yellow).lerp(lime, Math.pow(u, 0.8)).multiplyScalar(1 - 0.14 * v * v).lerp(white, 0.3 * Math.pow(1 - Math.abs(v), 3) * (1 - u));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
    const a = i * (nV + 1) + j, b = a + 1, d = a + nV + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function peelGeometry() {
  const parts = [];
  const N = 4;
  for (let i = 0; i < N; i++) {
    const g = petalGeometry(0.95, 0.42, 0.55);
    g.rotateY((i * TAU) / N + 0.4);
    parts.push(g);
  }
  parts.push(place(paint(new THREE.SphereGeometry(0.24, 12, 8), '#ff9d1a'), 0, 0.2, 0));
  parts.push(place(paint(new THREE.SphereGeometry(0.1, 8, 6), '#fff0a0'), -0.06, 0.4, -0.06));
  return mergeAll(parts);
}

function orbGeometry() {
  const parts = [paint(new THREE.IcosahedronGeometry(0.5, 2), '#34f59a')];
  const ring1 = paint(new THREE.TorusGeometry(0.7, 0.045, 8, 28), '#d6fff0'); ring1.rotateX(Math.PI / 2); parts.push(ring1);
  const ring2 = paint(new THREE.TorusGeometry(0.7, 0.045, 8, 28), '#9bffd2'); ring2.rotateY(Math.PI / 2); ring2.rotateZ(0.5); parts.push(ring2);
  return mergeAll(parts);
}

function bombGeometry() {
  const parts = [paint(new THREE.SphereGeometry(0.55, 18, 14), '#1a2036')];
  parts.push(place(paint(new THREE.CylinderGeometry(0.17, 0.21, 0.2, 12), '#8f99bd'), 0, 0.56, 0));
  parts.push(place(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), '#d6b27a'), 0.0, 0.78, 0));
  const f2 = paint(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), '#d6b27a'); f2.rotateZ(-0.9); parts.push(place(f2, 0.14, 0.97, 0));
  // highlight band
  const hi = paint(new THREE.SphereGeometry(0.57, 14, 4, 0, TAU, 0.5, 0.18), '#4a5686'); parts.push(hi);
  return mergeAll(parts);
}

function seekerGeometry() {
  const parts = [];
  const body = paint(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 12), '#f3f5ff'); body.rotateX(Math.PI / 2); parts.push(body);
  const nose = paint(new THREE.ConeGeometry(0.2, 0.5, 12), '#ff3d4a'); nose.rotateX(Math.PI / 2); parts.push(place(nose, 0, 0, 0.8));
  const band = paint(new THREE.CylinderGeometry(0.212, 0.212, 0.16, 12), '#ff3d4a'); band.rotateX(Math.PI / 2); parts.push(place(band, 0, 0, -0.12));
  const window_ = paint(new THREE.SphereGeometry(0.1, 8, 6), '#52d6ff'); parts.push(place(window_, 0, 0.17, 0.2));
  for (let i = 0; i < 3; i++) {
    const fin = paint(new THREE.BoxGeometry(0.05, 0.36, 0.42), '#ff3d4a');
    fin.translate(0, 0.3, -0.38);
    fin.rotateZ((i * TAU) / 3);
    parts.push(fin);
  }
  const nozzle = paint(new THREE.CylinderGeometry(0.15, 0.12, 0.16, 10), '#2b3050'); nozzle.rotateX(Math.PI / 2); parts.push(place(nozzle, 0, 0, -0.62));
  return mergeAll(parts);
}

function cometGeometry() {
  // a rocky, icy fireball core: displaced icosahedron, white at the poles -> pale blue at the equator
  const g = new THREE.IcosahedronGeometry(0.85, 2);
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), c = new THREE.Color(), w = new THREE.Color('#ffffff'), b = new THREE.Color('#8fc4ff');
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + 0.11 * Math.sin(x * 7.1 + 1.3) * Math.sin(y * 6.3 + 0.4) * Math.sin(z * 5.7 + 2.1);
    p.setXYZ(i, x * bump, y * bump, z * bump);
    c.copy(w).lerp(b, 0.25 + 0.55 * Math.abs(Math.sin(x * 5 + z * 4)) * (1 - Math.abs(y)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function coinGeometry() {
  const face = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 24); face.rotateX(Math.PI / 2);
  paint(face, '#ffffff');
  const rim = paint(new THREE.TorusGeometry(0.62, 0.075, 8, 24), '#ffb81f');
  return mergeAll([face, rim]);
}

/** Per-session shared geometries + materials for the world items. */
export function createItemResources(tex) {
  const geo = {
    peel: peelGeometry(), orb: orbGeometry(), bomb: bombGeometry(), seeker: seekerGeometry(), comet: cometGeometry(), coin: coinGeometry(),
    flame: new THREE.ConeGeometry(0.17, 1.0, 10, 1, true),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    ringFlat: new THREE.RingGeometry(0.82, 1, 48, 1),
    disc: new THREE.CircleGeometry(1, 32),
  };
  geo.flame.rotateX(-Math.PI / 2); geo.flame.translate(0, 0, -0.5);   // tip points -Z (behind the rocket)
  geo.ringFlat.rotateX(-Math.PI / 2);
  geo.disc.rotateX(-Math.PI / 2);
  const mats = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.12 }),
    bodyDouble: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide, emissive: 0x3d5410, emissiveIntensity: 0.55 }),
    orb: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.0, emissive: 0x1f9e63, emissiveIntensity: 0.9 }),
    comet: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.0, emissive: 0x5c9cff, emissiveIntensity: 1.25 }),
    coin: new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.coin, roughness: 0.3, metalness: 0.35, emissive: 0xc47a00, emissiveIntensity: 0.65 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    glowSphere: new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    flatAdd: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
  };

  const sprites = [];
  /** Additive glow sprite using the shared glow texture. */
  const sprite = (map = tex.glow, color = 0xffffff, scale = 2, opacity = 1) => {
    const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    sprites.push(m);
    const s = new THREE.Sprite(m);
    s.scale.setScalar(scale);
    s.renderOrder = 6;
    return s;
  };

  /** A fresh mesh group for an item type. `parts` exposes pieces the entity animates. */
  function make(type) {
    const g = new THREE.Group();
    g.name = `item:${type}`;
    const parts = {};
    switch (type) {
      case 'peel': { const m = new THREE.Mesh(geo.peel, mats.bodyDouble); m.castShadow = true; g.add(m); parts.body = m; break; }
      case 'orb': {
        const m = new THREE.Mesh(geo.orb, mats.orb); m.castShadow = true; g.add(m); parts.body = m;
        parts.glow = sprite(tex.glow, 0x3dffa0, 2.6, 0.7); g.add(parts.glow);
        break;
      }
      case 'bomb': {
        const m = new THREE.Mesh(geo.bomb, mats.body); m.castShadow = true; g.add(m); parts.body = m;
        const gs = new THREE.Mesh(geo.sphere, mats.glowSphere.clone()); gs.scale.setScalar(0.78); g.add(gs); parts.blink = gs;
        parts.spark = sprite(tex.star, 0xffc84a, 0.9, 1); parts.spark.position.set(0.3, 1.02, 0); g.add(parts.spark);
        break;
      }
      case 'seeker': {
        const m = new THREE.Mesh(geo.seeker, mats.body); m.castShadow = true; g.add(m); parts.body = m;
        const f = new THREE.Mesh(geo.flame, mats.flame); f.position.z = -0.68; g.add(f); parts.flame = f;
        parts.glow = sprite(tex.glow, 0xff7a3a, 1.8, 0.8); parts.glow.position.z = -0.7; g.add(parts.glow);
        break;
      }
      case 'comet': {
        const m = new THREE.Mesh(geo.comet, mats.comet); g.add(m); parts.body = m;
        parts.glow = sprite(tex.glow, 0x7fb8ff, 7, 1); g.add(parts.glow);
        parts.star = sprite(tex.star, 0xffffff, 4.5, 0.9); g.add(parts.star);
        break;
      }
      default: break;
    }
    g.userData.parts = parts;
    return g;
  }

  return {
    geo, mats, tex, make, sprite,
    dispose() {
      Object.values(geo).forEach((x) => x.dispose());
      Object.values(mats).forEach((x) => x.dispose());
      sprites.forEach((x) => x.dispose());
    },
  };
}
