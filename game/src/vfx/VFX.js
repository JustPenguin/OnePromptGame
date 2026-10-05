// Visual effects hub. OWNER: Agent C (vfx).
// Contract (keep stable; other agents call these and must not crash if an effect name is unknown):
//   new VFX(session)   .group (added to session.scene by the session)   .update(dt)   .dispose()
//   vfx.spawn(name, position, opts)   one-shot effects. Known names (implement all; unknown -> no-op):
//        'explosion' {scale,color}  'sparkle' {color}  'smoke'  'hitStars'  'boostBurst' {color}  'pickup' {color}
//        'confetti'  'splash'  'dust' {color}  'ring' {color,radius}  'respawn'  'shockwave'
//   vfx.spawnForKart(kart, name, opts)   same but anchored to a kart
// VFX listens to session.events (drift sparks by level, boost flames, wall sparks, landings, item hits...) and reads
// kart state every frame (dust off-road, tyre smoke while drifting, skid marks).  session.quality.particles scales counts.
import * as THREE from 'three';

export class VFX {
  constructor(session) {
    this.session = session;
    this.group = new THREE.Group();
    this.group.name = 'vfx';
  }
  spawn(name, position, opts = {}) { /* baseline: no effects */ }
  spawnForKart(kart, name, opts = {}) { this.spawn(name, kart.position, opts); }
  update(dt) {}
  dispose() { this.group.removeFromParent(); }
}
