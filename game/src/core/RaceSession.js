// RaceSession: the hub that wires one race together.  OWNER: Agent A (engine).  Other agents should NOT edit this file:
// each subsystem is created here from a FIXED module path with a FIXED constructor (new X(session)) and lifecycle
// (update(dt) / dispose()), so you upgrade your own module behind that seam.  If you need a new hook, add it to YOUR
// module and tell the lead in your report.
//
// Update order (per frame, dt <= 50 ms):
//   player input -> AIManager -> ItemSystem -> KartPhysics -> RaceManager -> Track -> kart visuals -> VFX -> Camera -> Audio
//
// config (see normalizeConfig): { mode, trackId, laps, speedClass, racers, player:{driverId,bodyId,name},
//   opponents?:[{driverId,bodyId,name}], playerGrid, items:true, seed, skipIntro, ghost }
//
// Extras owned here:
//   session.ghostRecorder / ghostPlayer / ghostResult   time trial (see race/ghost.js); ghostResult is { time, bestLap, lapTimes,
//                                                       driverId, bodyId, trackId, laps, data } once the player has finished
//   session.stats                                       live per-race counters for the career stats (drift time, air time, ...)
//   session.respawnHold                                 0..1 progress of the hold-to-respawn key (for a HUD ring)
import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { EV } from './events.js';
import { mulberry32, clamp, angleDiff } from './math.js';
import { Kart } from '../physics/Kart.js';
import { KartPhysics } from '../physics/KartPhysics.js';
import { RaceManager } from '../race/RaceManager.js';
import { GhostRecorder, GhostPlayer } from '../race/ghost.js';
import { ChaseCamera } from '../camera/ChaseCamera.js';
import { createTrack, getTrackDef } from '../tracks/index.js';
import { attachKartVisual } from '../vehicles/KartVisuals.js';
import { VFX } from '../vfx/VFX.js';
import { ItemSystem } from '../items/ItemSystem.js';
import { AIManager } from '../ai/AIManager.js';
import { DRIVERS, KART_BODIES, DEFAULT_SPEED_CLASS } from '../data/roster.js';

const RESPAWN_HOLD = 0.5;      // seconds the respawn key must be held

export function normalizeConfig(c = {}) {
  const def = getTrackDef(c.trackId);
  return {
    mode: c.mode ?? 'versus',                       // 'versus' | 'grandprix' | 'timetrial'
    trackId: def.id,
    laps: c.laps ?? def.laps ?? 3,
    speedClass: c.speedClass ?? DEFAULT_SPEED_CLASS, // 'rookie' | 'pro' | 'master'
    racers: Math.max(1, Math.min(12, c.racers ?? (c.mode === 'timetrial' ? 1 : 8))),
    player: { driverId: 'pip', bodyId: 'classic', name: 'You', ...(c.player ?? {}) },
    opponents: c.opponents ?? null,                 // explicit list or null = auto-fill
    playerGrid: c.playerGrid ?? 'last',             // 'last' | 'first' | 'random' | index
    items: c.items ?? c.mode !== 'timetrial',
    seed: c.seed ?? ((Math.random() * 0xffffffff) >>> 0),
    skipIntro: !!c.skipIntro,
    ghost: c.ghost ?? null,                         // time-trial ghost data (Agent E) or null
    ...c.extra,
  };
}

export class RaceSession {
  constructor(app, config) {
    this.app = app;
    this.config = normalizeConfig(config);
    if (this.config.mode === 'timetrial') this.config.racers = 1;       // time trial is always you against the clock (and a ghost)
    this.events = new EventBus();
    this.rng = mulberry32(this.config.seed);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 1800);
    this.settings = app.settings;   // live
    this.quality = app.quality;     // live
    this.karts = [];
    this.player = null;
    this.cameraTarget = null;       // set to spectate another kart
    this.time = 0;                  // seconds since the session started (incl. intro)
    this.loaded = false;
    this.disposed = false;
    this.ghostRecorder = null;
    this.ghostPlayer = null;
    this.respawnHold = 0;
    this._respawnLatch = false;
    this._ghostResult = null;
    this._unsubs = [];
    this.stats = {
      driftSeconds: 0, airSeconds: 0, boostSeconds: 0, offroadSeconds: 0, draftSeconds: 0, distance: 0, topSpeed: 0,
      maxDriftLevel: 0, driftBoosts: 0, hops: 0, jumps: 0, wallHits: 0, bumps: 0, spinOuts: 0, respawns: 0,
    };
  }

  /** Deterministic gameplay RNG in [0,1). Never use Math.random() for gameplay. */
  random() { return this.rng(); }
  /** Subscribe to session events; auto-unsubscribed on dispose. */
  on(type, fn) { const off = this.events.on(type, fn); this._unsubs.push(off); return off; }

  async load(onProgress = () => {}) {
    const cfg = this.config;
    onProgress(0.05, 'Building the track…');
    await tick();
    this.track = createTrack(cfg.trackId, { quality: this.quality });
    this.track.attach(this);
    this.app.renderer.onSessionLoaded?.(this);   // optional hook (Agent C): build env map / post chain for this scene
    onProgress(0.45, 'Warming up the karts…');
    await tick();
    this.createKarts();
    this.physics = new KartPhysics(this);
    this.race = new RaceManager(this);
    // no item boxes when items are off (time trial): the item system builds its boxes from track.itemBoxes (this session's own copy)
    if (!cfg.items) this.track.itemBoxes = [];
    this.items = new ItemSystem(this);
    this.ai = new AIManager(this);
    this.vfx = new VFX(this);
    this.scene.add(this.vfx.group);
    this.cameraRig = new ChaseCamera(this);
    onProgress(0.85, 'Lining up on the grid…');
    await tick();
    this.race.placeOnGrid();
    for (const k of this.karts) { this.physics.finalize(k, 0.016); }
    this.setupStats();
    if (cfg.mode === 'timetrial') this.setupTimeTrial();
    this.app.input?.attachSession?.(this);
    this.app.audio?.attachSession?.(this);
    this.loaded = true;
    onProgress(1, 'Ready!');
  }

  createKarts() {
    const cfg = this.config;
    const n = cfg.racers;
    // opponents: explicit or auto (distinct drivers, seeded)
    let opp = cfg.opponents;
    if (!opp) {
      const pool = DRIVERS.filter((d) => d.id !== cfg.player.driverId).map((d) => d.id);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      opp = [];
      for (let i = 0; i < n - 1; i++) {
        opp.push({ driverId: pool[i % pool.length], bodyId: KART_BODIES[Math.floor(this.random() * KART_BODIES.length)].id });
      }
    }
    const grid = cfg.playerGrid === 'first' ? 0 : cfg.playerGrid === 'random' ? Math.floor(this.random() * n) : typeof cfg.playerGrid === 'number' ? cfg.playerGrid : n - 1;
    let oi = 0;
    for (let i = 0; i < n; i++) {
      const isPlayer = i === Math.min(grid, n - 1);
      const spec = isPlayer ? cfg.player : opp[oi++ % opp.length];
      const kart = new Kart({ id: i, name: spec.name, driverId: spec.driverId, bodyId: spec.bodyId, isPlayer, speedClass: cfg.speedClass, events: this.events });
      attachKartVisual(kart, this);
      this.karts.push(kart);
      if (isPlayer) this.player = kart;
    }
  }

  /** Time trial: you, the clock, a ghost of your best run and three boosts. */
  setupTimeTrial() {
    const cfg = this.config;
    this.ghostRecorder = new GhostRecorder(this);
    if (cfg.ghost) {
      const gp = new GhostPlayer(this, cfg.ghost);
      if (gp.ready) this.ghostPlayer = gp; else gp.dispose();
    }
    if (this.player) this.items.giveItem(this.player, 'boost', 3);
  }

  /** The finished time-trial recording: { time, bestLap, lapTimes, driverId, bodyId, trackId, laps, data } or null until the player finished. */
  get ghostResult() {
    if (this._ghostResult) return this._ghostResult;
    const p = this.player, rec = this.ghostRecorder;
    if (!rec || !p?.race.finished) return null;
    if (!rec.done) rec.update(0);
    const info = { time: p.race.finishTime, trackId: this.track.id, driverId: p.driverId, bodyId: p.bodyId };
    this._ghostResult = { ...info, bestLap: p.race.bestLap, lapTimes: [...p.race.lapTimes], laps: this.race.laps, data: rec.finish(info) };
    return this._ghostResult;
  }

  /**
   * Live time-trial delta against the ghost in seconds: positive = you are AHEAD of the ghost (it reached your current distance
   * later than you did), negative = behind. null when there is no ghost, before GO, or once the ghost's run has ended.
   */
  get ghostDelta() {
    const gp = this.ghostPlayer, p = this.player;
    if (!gp?.ready || !p || (this.race.phase !== 'racing' && this.race.phase !== 'finishing') || p.race.finished) return null;
    const tg = gp.timeAtDistance(p.race.distance);
    return tg === null ? null : tg - this.race.time;
  }

  setupStats() {
    const S = this.stats, me = () => this.player;
    this.on(EV.HOP, ({ kart }) => { if (kart === me()) S.hops++; });
    this.on(EV.DRIFT_BOOST, ({ kart }) => { if (kart === me()) S.driftBoosts++; });
    this.on(EV.JUMP, ({ kart }) => { if (kart === me()) S.jumps++; });
    this.on(EV.WALL_HIT, ({ kart }) => { if (kart === me()) S.wallHits++; });
    this.on(EV.BUMP, ({ a, b }) => { if (a === me() || b === me()) S.bumps++; });
    this.on(EV.SPIN_OUT, ({ kart }) => { if (kart === me()) S.spinOuts++; });
    this.on(EV.RESPAWN, ({ kart }) => { if (kart === me()) S.respawns++; });
  }

  update(dt) {
    if (this.disposed || !this.loaded) return;
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    this.time += dt;
    const p = this.player, input = this.app.input, race = this.race;
    if (input) input.speedRatio = p ? clamp(p.speed / p.stats.topSpeed, 0, 1) : 0;
    if (p && !p.autopilot) input.read(p.input, dt);
    this.updateIntroSkip(input);
    this.updateRespawnHold(dt, input);
    this.updateAssist(p, input);
    this.ai.update(dt);
    this.items.update(dt);
    this.physics.update(dt);
    race.update(dt);
    this.track.update(dt, this);
    this.ghostRecorder?.update(dt);
    this.ghostPlayer?.update(dt);
    for (const k of this.karts) k.visual?.update(dt, k, this);
    this.vfx.update(dt);
    this.cameraRig.update(dt);
    this.updateStats(dt);
    input?.rumbleTick?.(dt, p);
    this.app.audio?.update?.(dt, this);
  }

  /** Any key / tap / button during the fly-over skips it (after a beat, so the key that started the race doesn't). */
  updateIntroSkip(input) {
    const race = this.race;
    if (race.phase === 'intro' && race.phaseTime > 0.35 && input?.anyPressed) race.skipIntro();
  }

  /** Hold the respawn key (R / L3 / touch button) for half a second: the rescue drone carries you back to the road. */
  updateRespawnHold(dt, input) {
    const p = this.player;
    const holding = !!input?.isDown?.('respawn') && !!p && this.race.phase === 'racing' && !p.respawn.active && !p.race.finished && !p.locked;
    if (!holding) { this.respawnHold = 0; this._respawnLatch = false; return; }
    if (this._respawnLatch) return;
    this.respawnHold = Math.min(1, this.respawnHold + dt / RESPAWN_HOLD);
    if (this.respawnHold >= 1) { this.physics.respawnKart(p, 'manual'); this._respawnLatch = true; this.respawnHold = 0; }
  }

  /**
   * Optional steering assist for the player (settings.assists.steeringAssist, or automatically a light version for touch):
   * nudges the stick toward a lookahead point near the road centre so the kart stays on the road when you are not steering,
   * and backs off the moment you steer yourself, drift, or leave the road.
   */
  updateAssist(p, input) {
    if (!p) return;
    const level = this.settings?.assists?.steeringAssist ? 1 : input?.lastDevice === 'touch' ? 0.55 : 0;
    if (level <= 0 || p.autopilot || p.locked || p.drift.dir !== 0 || !p.grounded || !p.onRoad || p.speed < 4 || p.respawn.active) { p._assist = 0; return; }
    const q = p.query, track = this.track;
    const look = 7 + p.speed * 0.45;
    const tgt = track.pointAt(q.s + look, clamp(q.lateral * 0.45, -q.halfWidth * 0.5, q.halfWidth * 0.5), this._assistPt ??= new THREE.Vector3());
    const err = angleDiff(Math.atan2(tgt.x - p.position.x, tgt.z - p.position.z), p.heading);
    const want = this.physics.steerForYawRate(p, clamp(err * 2.2, -1.4, 1.4));
    const own = Math.abs(p.input.steer);
    const w = level * (0.18 + 0.5 * (1 - clamp(own * 1.6, 0, 1)));
    p._assist = clamp((want - p.input.steer) * w, -0.5, 0.5);
  }

  updateStats(dt) {
    const p = this.player, S = this.stats, ph = this.race.phase;
    if (!p || (ph !== 'racing' && ph !== 'finishing')) return;
    if (p.drift.dir !== 0) { S.driftSeconds += dt; S.maxDriftLevel = Math.max(S.maxDriftLevel, p.drift.level); }
    if (!p.grounded) S.airSeconds += dt;
    if (p.boost.timer > 0) S.boostSeconds += dt;
    if (!p.onRoad && p.grounded) S.offroadSeconds += dt;
    if (p.draft.active) S.draftSeconds += dt;
    S.distance += Math.abs(p.speed) * dt;
    S.topSpeed = Math.max(S.topSpeed, Math.abs(p.speed));
  }

  render() { this.app.renderer.render(this.scene, this.camera, this); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._unsubs.forEach((o) => o());
    this._unsubs = [];
    this.app.input?.detachSession?.();
    this.app.audio?.detachSession?.();
    this.app.renderer.onSessionDisposed?.(this);  // optional hook (Agent C)
    this.ghostPlayer?.dispose();
    this.items?.dispose();
    this.vfx?.dispose();
    for (const k of this.karts) { k.visual?.dispose?.(); k.root.removeFromParent(); }
    this.track?.dispose();
    this.events.clear();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
