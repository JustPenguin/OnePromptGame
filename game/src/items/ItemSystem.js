// Items: boxes, roulette, held items, projectiles, hazards. OWNER: Agent D (gameplay).
// Baseline: item boxes + roulette + a single "boost" item so the whole pipeline (pickup -> HUD -> use -> physics) works.
// Contract (keep stable):
//   new ItemSystem(session)   .group (added to the scene by the session)   .update(dt)   .dispose()
//   itemSystem.giveItem(kart, type, count)      debug / rules can hand out items
//   itemSystem.useItem(kart, backward=false)    use the held item
//   kart.item = { type, count, roulette:{active,timer,shown} }  is the single source of truth the HUD reads
// Use input: edge of kart.input.item (track the previous value in kart.ext.items).  Throw backward when
// kart.input.brake > 0.5 at the moment of use.  Use session.random() for ALL gameplay randomness.
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { ITEM_DEFS, ITEM_ORDER } from './itemDefs.js';

const PICKUP_RADIUS = 2.3;
const BOX_RESPAWN = 4;
const ROULETTE_TIME = 1.7;

export class ItemSystem {
  constructor(session) {
    this.session = session;
    this.events = session.events;
    this.group = new THREE.Group();
    this.group.name = 'items';
    session.scene.add(this.group);
    const geo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x22d3ff, emissive: 0x0a5a78, transparent: true, opacity: 0.8, roughness: 0.2 });
    this.boxes = session.track.itemBoxes.map((b) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(b.position);
      this.group.add(mesh);
      return { def: b, mesh, active: true, timer: 0 };
    });
    this._geo = geo; this._mat = mat;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    const karts = this.session.karts;
    for (const b of this.boxes) {
      if (!b.active) { b.timer -= dt; if (b.timer <= 0) { b.active = true; b.mesh.visible = true; } continue; }
      b.mesh.rotation.y += dt * 1.8; b.mesh.rotation.x = 0.4;
      b.mesh.position.y = b.def.position.y + Math.sin(this.t * 2.2 + b.def.id) * 0.12;
      for (const k of karts) {
        if (k.item.type || k.item.roulette.active || k.race.finished || k.respawn.active) continue;
        const dx = k.position.x - b.mesh.position.x, dz = k.position.z - b.mesh.position.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(k.position.y - b.def.position.y) < 3) {
          b.active = false; b.timer = BOX_RESPAWN; b.mesh.visible = false;
          this.startRoulette(k, b);
          break;
        }
      }
    }
    for (const k of karts) {
      const st = (k.ext.items ??= { prevUse: false });
      const r = k.item.roulette;
      if (r.active) {
        r.timer -= dt;
        r.shown = ITEM_ORDER[Math.floor(this.t * 14) % ITEM_ORDER.length];
        if (r.timer <= 0) {
          r.active = false; r.shown = null;
          this.events.emit(EV.ITEM_ROULETTE, { kart: k, active: false });
          this.giveItem(k, this.pick(k), 1);
        }
      }
      const press = k.input.item && !st.prevUse;
      st.prevUse = k.input.item;
      if (press && k.item.type && !r.active && !k.locked) this.useItem(k, k.input.brake > 0.5);
    }
  }

  startRoulette(kart, box) {
    kart.item.roulette.active = true;
    kart.item.roulette.timer = ROULETTE_TIME;
    this.events.emit(EV.ITEM_BOX, { kart, box: box.def });
    this.events.emit(EV.ITEM_ROULETTE, { kart, active: true });
  }

  /** Pick an item for a kart (position-weighted in the real implementation). */
  pick(kart) { return 'boost'; }

  giveItem(kart, type, count = 1) {
    kart.item.type = type; kart.item.count = count;
    this.events.emit(EV.ITEM_GOT, { kart, type, count });
  }

  useItem(kart, backward = false) {
    const type = kart.item.type;
    if (!type) return;
    this.events.emit(EV.ITEM_USE, { kart, type, backward });
    if (type === 'boost') kart.applyBoost(0.38, 1.4, 'item');
    kart.item.count -= 1;
    if (kart.item.count <= 0) { kart.item.type = null; kart.item.count = 0; }
  }

  dispose() {
    this._geo.dispose(); this._mat.dispose();
    this.group.removeFromParent();
  }
}
