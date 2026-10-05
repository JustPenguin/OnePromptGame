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
import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { mulberry32 } from './math.js';
import { Kart } from '../physics/Kart.js';
import { KartPhysics } from '../physics/KartPhysics.js';
import { RaceManager } from '../race/RaceManager.js';
import { ChaseCamera } from '../camera/ChaseCamera.js';
import { createTrack, getTrackDef } from '../tracks/index.js';
import { attachKartVisual } from '../vehicles/KartVisuals.js';
import { VFX } from '../vfx/VFX.js';
import { ItemSystem } from '../items/ItemSystem.js';
import { AIManager } from '../ai/AIManager.js';
import { DRIVERS, KART_BODIES, DEFAULT_SPEED_CLASS } from '../data/roster.js';

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
    this.events = new EventBus();
    this.rng = mulberry32(this.config.seed);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.3, 1800);
    this.settings = app.settings;   // live
    this.quality = app.quality;     // live
    this.karts = [];
    this.player = null;
    this.cameraTarget = null;       // set to spectate another kart
    this.time = 0;                  // seconds since the session started (incl. intro)
    this.loaded = false;
    this.disposed = false;
    this._unsubs = [];
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
    this.items = new ItemSystem(this);
    this.ai = new AIManager(this);
    this.vfx = new VFX(this);
    this.scene.add(this.vfx.group);
    this.cameraRig = new ChaseCamera(this);
    onProgress(0.85, 'Lining up on the grid…');
    await tick();
    this.race.placeOnGrid();
    for (const k of this.karts) { this.physics.finalize(k, 0.016); }
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

  update(dt) {
    if (this.disposed || !this.loaded) return;
    dt = Math.min(Math.max(dt, 0), 1 / 20);
    this.time += dt;
    const p = this.player;
    if (p && !p.autopilot) this.app.input.read(p.input, dt);
    this.ai.update(dt);
    this.items.update(dt);
    this.physics.update(dt);
    this.race.update(dt);
    this.track.update(dt, this);
    for (const k of this.karts) k.visual?.update(dt, k, this);
    this.vfx.update(dt);
    this.cameraRig.update(dt);
    this.app.audio?.update?.(dt, this);
  }

  render() { this.app.renderer.render(this.scene, this.camera, this); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._unsubs.forEach((o) => o());
    this._unsubs = [];
    this.app.audio?.detachSession?.();
    this.app.renderer.onSessionDisposed?.(this);  // optional hook (Agent C)
    this.items?.dispose();
    this.vfx?.dispose();
    for (const k of this.karts) { k.visual?.dispose?.(); k.root.removeFromParent(); }
    this.track?.dispose();
    this.events.clear();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
