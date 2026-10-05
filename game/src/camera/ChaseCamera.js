// Camera rig. OWNER: Agent A (engine).  Drives session.camera.
// Modes: intro fly-over (race.phase === 'intro'), chase (default), finish orbit (player finished / results).
// Reads: session.cameraTarget ?? session.player, session.race, session.settings (cameraMode, cameraShake, fovBoost),
//        kart speed/boost/drift, events (hits add shake).
import * as THREE from 'three';
import { EV } from '../core/events.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/math.js';

const MODES = {
  chase: { dist: 7.4, height: 3.3, look: 5.5, fov: 64 },
  far: { dist: 11, height: 5.2, look: 7, fov: 62 },
  close: { dist: 5, height: 2.3, look: 4.5, fov: 68 },
};
const MODE_ORDER = ['chase', 'far', 'close'];

export class ChaseCamera {
  constructor(session) {
    this.session = session;
    this.camera = session.camera;
    this.mode = session.settings?.cameraMode ?? 'chase';
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = 64;
    this.shake = 0;
    this.lookBackBlend = 0;
    this._init = false;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._smp = null;
    const on = (t, f) => session.on(t, f);
    on(EV.WALL_HIT, ({ kart, impact }) => { if (kart === this.target) this.addShake(clamp(impact / 25, 0.1, 0.5)); });
    on(EV.BUMP, ({ a, b, impact }) => { if (a === this.target || b === this.target) this.addShake(clamp(impact / 30, 0.1, 0.35)); });
    on(EV.LAND, ({ kart, impact }) => { if (kart === this.target) this.addShake(clamp(impact / 40, 0.1, 0.3)); });
    on(EV.ITEM_HIT, ({ victim }) => { if (victim === this.target) this.addShake(0.6); });
    on(EV.BOOST, ({ kart, source }) => { if (kart === this.target) { this.fovKick = source === 'drift' ? 6 : 12; this.addShake(0.12); } });
    this.fovKick = 0;
  }

  get target() { return this.session.cameraTarget ?? this.session.player ?? this.session.karts[0]; }
  addShake(v) { if (this.session.settings?.cameraShake !== false) this.shake = Math.min(1, this.shake + v); }
  cycleMode() { this.mode = MODE_ORDER[(MODE_ORDER.indexOf(this.mode) + 1) % MODE_ORDER.length]; return this.mode; }

  update(dt) {
    const s = this.session, cam = this.camera, k = this.target;
    if (!k) return;
    const phase = s.race?.phase;
    const cfg = MODES[this.mode] ?? MODES.chase;
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    let targetFov = cfg.fov;

    if (phase === 'intro') {
      this.updateIntro(dt);
      return;
    }
    if (!this._init) { this._init = true; this.yaw = k.yaw; this.snap(k, cfg); }

    const finished = k.race.finished && (phase === 'finishing' || phase === 'results');
    const lookBack = !!k.input.lookBack && !finished;
    this.lookBackBlend = damp(this.lookBackBlend, lookBack ? 1 : 0, 12, dt);
    // camera yaw follows heading (with drift swing) but lags a little for a sense of speed
    const swing = k.drift.dir !== 0 ? -k.drift.dir * 0.0 + k.drift.angle * 0.5 : 0;
    const targetYaw = k.heading + swing + this.lookBackBlend * Math.PI + (finished ? performance.now() * 0.0004 : 0);
    this.yaw = dampAngle(this.yaw, targetYaw, finished ? 3 : 7.5, dt);
    const dist = cfg.dist * (finished ? 1.5 : 1);
    const height = cfg.height * (finished ? 0.8 : 1);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const desired = this._tmp.set(k.position.x - fx * dist, k.position.y + height, k.position.z - fz * dist);
    // keep the camera above the road surface
    const lag = 1 - Math.exp(-(finished ? 4 : 11) * dt);
    this.pos.lerp(desired, lag);
    const lookAt = this._tmp2.set(k.position.x + fx * cfg.look * (1 - this.lookBackBlend * 2), k.position.y + 1.3, k.position.z + fz * cfg.look * (1 - this.lookBackBlend * 2));
    this.look.lerp(lookAt, 1 - Math.exp(-14 * dt));

    // FOV: speed + boost kick
    if (s.settings?.fovBoost !== false) targetFov += clamp(k.speed / k.stats.topSpeed, 0, 1.4) * 12 + this.fovKick;
    this.fov = damp(this.fov, targetFov, 6, dt);

    cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      const a = this.shake * this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  snap(k, cfg) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.pos.set(k.position.x - fx * cfg.dist, k.position.y + cfg.height, k.position.z - fz * cfg.dist);
    this.look.set(k.position.x + fx * cfg.look, k.position.y + 1.3, k.position.z + fz * cfg.look);
  }

  /** Baseline intro: a sweeping crane shot that ends right behind the pole-position kart. */
  updateIntro(dt) {
    const s = this.session, cam = this.camera, track = s.track, race = s.race;
    const k = this.target;
    const u = clamp(race.phaseTime / Math.max(0.01, race.introDuration), 0, 1);
    const e = u * u * (3 - 2 * u);
    this._smp ??= new (track.sampleAt(0).constructor)();
    const startS = 40 - 120 * e;                       // sweep from ahead of the line back to the grid
    const smp = track.sampleAt(startS, this._smp);
    const side = lerp(26, 0, e);
    const heightUp = lerp(22, 3.3, e);
    cam.position.copy(smp.position).addScaledVector(smp.right, side).addScaledVector(smp.tangent, lerp(-20, -7.4, e));
    cam.position.y += heightUp;
    this.look.copy(k.position).addScaledVector(smp.tangent, lerp(30, 5.5, e));
    this.look.y += 1.3;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.fov = lerp(48, 64, e); cam.updateProjectionMatrix();
    this.pos.copy(cam.position);
    this.yaw = k.heading;
    this._init = false;
  }
}
