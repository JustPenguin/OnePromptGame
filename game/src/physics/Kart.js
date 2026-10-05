// The Kart entity: pure data + a small "effects" API. EVERY subsystem talks about karts through this object.
// OWNER: Agent A (engine).  Field names/semantics here are a contract (docs/ARCHITECTURE.md): add fields freely,
// never rename/remove existing ones.  Per-system private data goes in kart.ext.<system> (e.g. kart.ext.ai).
import * as THREE from 'three';
import { getDriver, getBody, resolveStats } from '../data/roster.js';
import { TrackQuery } from '../track/SplineTrack.js';
import { Surface } from '../track/surfaces.js';
import { EV } from '../core/events.js';

export class KartInput {
  constructor() {
    this.throttle = 0;   // 0..1
    this.brake = 0;      // 0..1  (also reverse when stopped, and "throw backward" modifier for items)
    this.steer = 0;      // -1 (left) .. +1 (right)
    this.drift = false;  // held
    this.item = false;   // held (consumers detect the press edge themselves)
    this.lookBack = false;
  }
  copy(o) { this.throttle = o.throttle; this.brake = o.brake; this.steer = o.steer; this.drift = o.drift; this.item = o.item; this.lookBack = o.lookBack; return this; }
  reset() { this.throttle = 0; this.brake = 0; this.steer = 0; this.drift = false; this.item = false; this.lookBack = false; return this; }
}

export class Kart {
  /** @param {{id:number,name?:string,driverId:string,bodyId:string,isPlayer?:boolean,speedClass?:string,events:import('../core/EventBus.js').EventBus}} o */
  constructor(o) {
    this.id = o.id;
    this.events = o.events;
    this.isPlayer = !!o.isPlayer;
    this.isAI = !this.isPlayer;
    this.driverId = o.driverId;
    this.bodyId = o.bodyId;
    this.driver = getDriver(o.driverId);
    this.body = getBody(o.bodyId);
    this.name = o.name ?? this.driver.name;
    this.stats = resolveStats(o.driverId, o.bodyId, o.speedClass);
    this.radius = 1.15;           // collision circle (metres, before scale)
    this.scale = 1;               // 1 normally; <1 while shrunk (visual + collision)

    // ---- motion (written by KartPhysics) ----
    this.position = new THREE.Vector3();  // ground-contact point under the kart's centre
    this.velocity = new THREE.Vector3();  // world velocity, m/s (derived)
    this.heading = 0;             // steered heading (internal)
    this.yaw = 0;                 // CHASSIS yaw = heading + drift angle + spin; model faces +Z at yaw 0
    this.moveYaw = 0;             // direction of travel (differs from yaw when sliding / drifting)
    this.speed = 0;               // signed m/s along moveYaw
    this.slide = 0;               // lateral m/s (positive = toward the kart's right of moveYaw)
    this.vy = 0;                  // vertical m/s
    this.grounded = true;
    this.airTime = 0;
    this.forward = new THREE.Vector3(0, 0, 1);   // chassis basis (unit)
    this.right = new THREE.Vector3(-1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.orientation = new THREE.Quaternion();   // chassis orientation (yaw + ground normal)
    this.steerVisual = 0;         // smoothed steer -1..1, for wheel/driver animation
    this.spinAngle = 0;           // extra yaw while spinning out (already included in yaw)
    this.pitch = 0;               // visual pitch (rad), + = nose up
    this.lean = 0;                // visual body roll (rad), + = roll to the right

    // ---- surface ----
    this.query = new TrackQuery();
    this.hint = -1;
    this.surface = Surface.ROAD;
    this.onRoad = true;

    // ---- drift / effects ----
    this.drift = { dir: 0, charge: 0, level: 0, hop: 0, armed: false, angle: 0, held: false };
    this.boost = { timer: 0, duration: 0, strength: 0, source: null };
    this.spin = { timer: 0, duration: 0, dir: 1 };
    this.invincible = 0;          // seconds (shield / star)
    this.shrink = 0;              // seconds
    this.rocket = 0;              // seconds of rocket-rider auto-drive
    this.stun = 0;                // seconds of "can't steer" (burnout)
    this.ink = 0;                 // seconds the screen is splattered by an ink item (written by ItemSystem, read by HUD)
    this.respawn = { active: false, t: 0, dur: 1.6, from: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, reason: '' };
    this.fallTimer = 0;
    this.stuckTimer = 0;
    this.coins = 0;

    // ---- control ----
    this.input = new KartInput();  // written by Input (player) / AIManager (AI) each frame
    this.locked = true;            // RaceManager unlocks at GO
    this.autopilot = false;        // true while an AI/ghost controller drives this kart (finish cruise, rocket)

    // ---- race progress (written by RaceManager) ----
    this.race = {
      distance: 0,      // signed metres travelled along the track (lap = floor(distance / length) + 1)
      s: 0,             // arc-length position [0, length)
      lateral: 0,
      lap: 1,           // current lap, 1-based (clamped to laps once finished)
      lapsDone: 0,      // completed laps
      place: 1,         // 1-based live position
      finished: false,
      finishTime: 0,
      lapTimes: [],
      bestLap: Infinity,
      wrongWay: false,
      wrongWayTimer: 0,
      lapStartTime: 0,
      progress: 0,      // 0..1 overall race completion
    };

    // ---- item slot (written by ItemSystem) ----
    this.item = { type: null, count: 0, roulette: { active: false, timer: 0, shown: null } };

    // ---- scene ----
    this.root = new THREE.Group();   // world transform synced from position/orientation every frame
    this.root.name = `kart:${this.name}`;
    this.visual = null;              // set by vehicles/ (update(dt, kart, session), dispose())
    this.ext = {};                   // private per-system data: kart.ext.ai, kart.ext.items, kart.ext.vfx ...
  }

  get speedRatio() { return Math.max(0, this.speed) / this.stats.topSpeed; }
  get isBoosting() { return this.boost.timer > 0; }
  get isDrifting() { return this.drift.dir !== 0; }
  get isSpinning() { return this.spin.timer > 0; }
  /** True while hits (shells, hazards, rams) must be ignored. */
  isInvulnerable() { return this.invincible > 0 || this.rocket > 0 || this.respawn.active || this.race.finished; }

  // ------------------------------------------------------------------ effects API (used by items, tracks, rules)
  /** Speed boost. strength = extra top-speed fraction (0.35 = +35%). Keeps the stronger/longer of overlapping boosts. */
  applyBoost(strength = 0.35, duration = 1.2, source = 'item') {
    const b = this.boost;
    if (b.timer <= 0 || strength >= b.strength) { b.strength = strength; b.source = source; }
    b.timer = Math.max(b.timer, duration);
    b.duration = Math.max(b.duration, b.timer);
    this.events?.emit(EV.BOOST, { kart: this, source, strength, duration });
  }

  /** Lose control and spin for `duration` seconds. Returns false if the kart is invulnerable. */
  spinOut(duration = 1.3, cause = 'hit', dir = Math.random() < 0.5 ? -1 : 1) {
    if (this.isInvulnerable()) return false;
    this.spin.timer = duration; this.spin.duration = duration; this.spin.dir = dir;
    this.drift.dir !== 0 && this.cancelDrift();
    this.events?.emit(EV.SPIN_OUT, { kart: this, cause });
    return true;
  }

  /** Knocked into the air (explosions). */
  launch(vy = 11, cause = 'explosion') {
    if (this.isInvulnerable()) return false;
    this.vy = vy; this.grounded = false; this.speed *= 0.25; this.slide *= 0.25;
    this.spin.timer = 1.7; this.spin.duration = 1.7; this.spin.dir = Math.random() < 0.5 ? -1 : 1;
    this.cancelDrift();
    this.events?.emit(EV.LAUNCH, { kart: this, cause });
    return true;
  }

  cancelDrift() {
    if (this.drift.dir !== 0) this.events?.emit(EV.DRIFT_CANCEL, { kart: this });
    this.drift.dir = 0; this.drift.charge = 0; this.drift.level = 0; this.drift.armed = false;
  }

  setInvincible(duration) { this.invincible = Math.max(this.invincible, duration); this.events?.emit(EV.INVINCIBLE, { kart: this, active: true }); }
  shrinkFor(duration) { if (this.isInvulnerable()) return false; this.shrink = Math.max(this.shrink, duration); this.events?.emit(EV.SHRINK, { kart: this, active: true }); return true; }
  setRocket(duration) { this.rocket = Math.max(this.rocket, duration); this.events?.emit(EV.ROCKET, { kart: this, active: true }); }
  addCoins(n = 1) { this.coins = Math.min(10, this.coins + n); this.events?.emit(EV.COIN, { kart: this, total: this.coins }); }

  /** Teleport onto the track (grid placement, respawn). Resets motion. */
  placeAt(position, yaw, speed = 0) {
    this.position.copy(position);
    this.heading = this.yaw = this.moveYaw = yaw;
    this.speed = speed; this.slide = 0; this.vy = 0; this.grounded = true; this.airTime = 0;
    this.spin.timer = 0; this.spinAngle = 0; this.drift.angle = 0;
    this.hint = -1;
    this.root.position.copy(position);
  }
}
