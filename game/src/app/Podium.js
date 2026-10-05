// 3D podium ceremony used by the Grand Prix finale. OWNER: Agent E.  Lives inside MenuScene's scene.
//   const podium = new PodiumStage(scene);  podium.show(entries, {trophy})  podium.hide()  podium.update(dt, t)  podium.confetti()
//   entries = [{ driverId, bodyId, place: 1|2|3, isPlayer }]  (any subset of the top 3)
// Blocks rise 3rd -> 2nd -> 1st, each kart drops in with a bounce, confetti rains from the lights, a metal trophy spins in front.
import * as THREE from 'three';
import { createKartShowcase } from '../vehicles/KartVisuals.js';
import { wrapAngle } from '../core/math.js';

const COLORS = { 1: '#ffd23f', 2: '#cfd8ee', 3: '#e8934f' };
const HEIGHT = { 1: 1.9, 2: 1.3, 3: 0.9 };
const X = { 1: 0, 2: -3.3, 3: 3.3 };
const KART_SCALE = 0.8;
const CONFETTI = 220;

function numberTexture(n, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#121a4a'; g.fillRect(0, 0, 256, 256);
  g.font = "190px 'KR Display','Lilita One',sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#070b24'; g.strokeText(String(n), 128, 140);
  g.fillStyle = color; g.fillText(String(n), 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PodiumStage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.slots = {};
    this.t = 0;
    this.active = false;
    this._geo = new THREE.BoxGeometry(2.7, 1, 2.7);
    this._capGeo = new THREE.BoxGeometry(2.8, 0.1, 2.8);
    this._planeGeo = new THREE.PlaneGeometry(1.8, 1.8);
    this._tex = {};
    this._buildConfetti();
    this.trophy = null;
    this.spot = new THREE.SpotLight(0xfff0d0, 700, 40, 0.5, 0.7, 1.4);
    this.spot.position.set(0, 12, 6);
    this.spot.target.position.set(0, 1.2, 0);
    this.group.add(this.spot, this.spot.target);
  }

  _buildConfetti() {
    const geo = new THREE.PlaneGeometry(0.13, 0.22);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.conf = new THREE.InstancedMesh(geo, mat, CONFETTI);
    this.conf.frustumCulled = false;
    this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cd = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3(), a: 0, on: false }));
    const palette = ['#ff3d6a', '#ffd23f', '#22d3ff', '#7be04a', '#8b4dff', '#ff7a1a', '#ffffff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < CONFETTI; i++) this.conf.setColorAt(i, palette[i % palette.length]);
    this.conf.visible = false;
    this.group.add(this.conf);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._sc = new THREE.Vector3(1, 1, 1); this._zero = new THREE.Vector3(0, 0, 0);
    this.emit = 0;
  }

  _slot(place) {
    let s = this.slots[place];
    if (s) return s;
    const color = COLORS[place];
    const block = new THREE.Group();
    const body = new THREE.Mesh(this._geo, new THREE.MeshStandardMaterial({ color: 0x1a2260, roughness: 0.4, metalness: 0.35, emissive: 0x0a1030 }));
    const cap = new THREE.Mesh(this._capGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.85, emissive: new THREE.Color(color).multiplyScalar(0.12) }));
    const tex = this._tex[place] ??= numberTexture(place, color);
    const face = new THREE.Mesh(this._planeGeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.z = 1.355;
    block.add(body, cap, face);
    block.position.x = X[place];
    this.group.add(block);
    s = { block, body, cap, face, kart: null, holder: null, t: 0, delay: place === 3 ? 0 : place === 2 ? 0.55 : 1.15, drop: 0 };
    this.slots[place] = s;
    return s;
  }

  /** @param {{driverId:string, bodyId:string, place:number, isPlayer?:boolean}[]} entries */
  show(entries, { trophy = null } = {}) {
    this.hide(true);
    this.group.visible = true;
    this.active = true;
    this.t = 0;
    for (const e of entries) {
      const s = this._slot(e.place);
      s.entry = e; s.t = -s.delay; s.drop = 0;
      s.block.visible = true;
      let showcase = null;
      try { showcase = createKartShowcase(e.driverId, e.bodyId, { pose: e.place === 1 ? 'cheer' : e.place === 2 ? 'happy' : 'ok' }); } catch (err) { console.warn('[podium] showcase failed', err); }
      if (showcase) {
        const holder = new THREE.Group();
        holder.add(showcase.root);
        holder.rotation.y = e.place === 2 ? 0.35 : e.place === 3 ? -0.35 : 0;
        holder.scale.setScalar(0.001);
        s.block.add(holder);
        s.kart = showcase; s.holder = holder;
      }
    }
    this._trophyKind = trophy;
    if (trophy) this._buildTrophy(trophy);
    this.emit = 0;
  }

  _buildTrophy(kind) {
    const color = COLORS[{ gold: 1, silver: 2, bronze: 3 }[kind]] ?? '#ffd23f';
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.22, emissive: new THREE.Color(color).multiplyScalar(0.18) });
    const prof = [[0, 0], [0.55, 0], [0.6, 0.08], [0.45, 0.16], [0.2, 0.3], [0.14, 0.7], [0.22, 0.78], [0.5, 0.92], [0.78, 1.5], [0.82, 1.9], [0.7, 2.0], [0.0, 2.0]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 36), mat));
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 24, Math.PI * 1.25), mat); h.position.set(sx * 0.8, 1.55, 0); h.rotation.z = sx > 0 ? -Math.PI * 0.62 : -Math.PI * 0.12 + Math.PI; g.add(h); }
    g.scale.setScalar(0.9);
    g.position.set(-6.4, 0.3, 3.2);
    g.userData.mat = mat;
    this.trophy = g;
    this.group.add(g);
  }

  hide(keepVisible = false) {
    for (const s of Object.values(this.slots)) {
      if (s.holder) { s.holder.removeFromParent(); try { s.kart?.dispose?.(); } catch { /* ignore */ } s.holder = null; s.kart = null; }
      s.block.visible = false;
    }
    if (this.trophy) { this.trophy.removeFromParent(); this.trophy.userData.mat?.dispose?.(); this.trophy.traverse((o) => o.geometry?.dispose?.()); this.trophy = null; }
    this.conf.visible = false;
    this.emit = 0;
    this.active = false;
    if (!keepVisible) this.group.visible = false;
  }

  /** Rain confetti for `seconds`. */
  confetti(seconds = 7) { this.emit = seconds; this.conf.visible = true; for (let i = 0; i < CONFETTI; i++) this._spawn(i, true); }

  _spawn(i, initial = false) {
    const c = this.cd[i];
    c.p.set((Math.random() - 0.5) * 12, (initial ? Math.random() * 6 : 0) + 7 + Math.random() * 3, (Math.random() - 0.4) * 6);
    c.v.set((Math.random() - 0.5) * 0.8, -(0.8 + Math.random() * 1.2), (Math.random() - 0.5) * 0.8);
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    c.s.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    c.a = 0.6 + Math.random();
    c.on = true;
  }

  update(dt, _t) {
    if (!this.active) return;
    this.t += dt;
    for (const [place, s] of Object.entries(this.slots)) {
      if (!s.block.visible || !s.entry) continue;
      s.t += dt;
      const u = Math.min(1, Math.max(0, s.t / 0.7));
      const eb = u < 1 ? 1 - Math.pow(1 - u, 3) * Math.cos(u * 6) : 1;           // springy rise
      s.body.scale.y = Math.max(0.001, HEIGHT[place] * eb);
      s.body.position.y = s.body.scale.y / 2;
      s.cap.position.y = s.body.scale.y + 0.05;
      s.face.position.y = s.body.scale.y / 2;
      s.face.scale.set(1, Math.min(1, s.body.scale.y / 1.2), 1);
      if (s.holder) {
        s.drop = Math.max(0, Math.min(1, (s.t - 0.7) / 0.5));
        const e2 = s.drop < 1 ? 1 - Math.pow(1 - s.drop, 3) * Math.cos(s.drop * 7) : 1;
        s.holder.scale.setScalar(Math.max(0.001, e2) * KART_SCALE);
        const celebrate = place === '1' ? Math.abs(Math.sin(this.t * 4.2)) * 0.22 * (s.drop >= 1 ? 1 : 0) : place === '2' ? Math.abs(Math.sin(this.t * 3 + 1)) * 0.07 : 0;
        s.holder.position.y = s.body.scale.y + 0.1 + celebrate;
        s.holder.rotation.y = wrapAngle(s.holder.rotation.y + Math.sin(this.t * 1.3 + Number(place)) * dt * 0.4);
        s.kart?.update?.(dt);
      }
    }
    if (this.trophy) {
      this.trophy.rotation.y += dt * 0.9;
      this.trophy.position.y = 0.3 + Math.sin(this.t * 1.6) * 0.12;
    }
    if (this.emit > 0 || this.conf.visible) {
      this.emit = Math.max(0, this.emit - dt);
      let alive = 0;
      for (let i = 0; i < CONFETTI; i++) {
        const c = this.cd[i];
        if (!c.on) continue;
        c.p.addScaledVector(c.v, dt);
        c.p.x += Math.sin(this.t * 2 + i) * 0.5 * dt;
        c.r.x += c.s.x * dt; c.r.y += c.s.y * dt; c.r.z += c.s.z * dt;
        if (c.p.y < -0.2) { if (this.emit > 0) this._spawn(i); else c.on = false; }
        if (c.on) alive++;
        this._q.setFromEuler(c.r);
        this._m.compose(c.p, this._q, c.on ? this._sc : this._zero);
        this.conf.setMatrixAt(i, this._m);
      }
      this.conf.instanceMatrix.needsUpdate = true;
      if (!alive && this.emit <= 0) this.conf.visible = false;
    }
  }

  dispose() {
    this.hide();
    this._geo.dispose(); this._capGeo.dispose(); this._planeGeo.dispose();
    Object.values(this._tex).forEach((t) => t.dispose());
    this.conf.geometry.dispose(); this.conf.material.dispose();
    for (const s of Object.values(this.slots)) { s.body.material.dispose(); s.cap.material.dispose(); s.face.material.dispose(); }
    this.group.removeFromParent();
  }
}
