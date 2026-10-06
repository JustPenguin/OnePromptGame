// Node-side physics rig: real SplineTrack + real Kart/KartPhysics/RaceManager on a mock session, no browser needed.
// Lets scripts/handling.mjs (and ad-hoc experiments) measure handling in milliseconds.
//
//   const rig = makeRig(DEFS.open);                         // wide open arena (no walls reachable)
//   const k = rig.addKart({ driver:'pip', body:'classic', s:200, speed:0 });
//   const samples = rig.run(8, (t) => { k.input.throttle = 1; }, { every: 0.1 });
import './node-env.mjs';
import * as THREE from 'three';
import { EventBus } from '../../src/core/EventBus.js';
import { mulberry32, clamp, angleDiff, wrapAngle } from '../../src/core/math.js';
import { SplineTrack } from '../../src/track/SplineTrack.js';
import { Kart } from '../../src/physics/Kart.js';
import { KartPhysics } from '../../src/physics/KartPhysics.js';
import { RaceManager } from '../../src/race/RaceManager.js';
import { sunnyMeadows } from '../../src/tracks/sunny-meadows.js';
import { Surface } from '../../src/track/surfaces.js';

export { THREE, clamp, angleDiff, wrapAngle, Surface, sunnyMeadows };

const D2R = Math.PI / 180;

/** Closed "stadium" loop: two straights joined by two semicircles.  Starts at the beginning of straight 1 heading +Z. */
export function stadiumPoints(Ls = 2400, R = 400, straightStep = 100, arcStepDeg = 12) {
  const pts = [];
  for (let z = 0; z < Ls - 1; z += straightStep) pts.push([0, 0, z]);
  for (let a = 0; a <= 180 + 1e-6; a += arcStepDeg) pts.push([-R + R * Math.cos(a * D2R), 0, Ls + R * Math.sin(a * D2R)]);
  for (let z = Ls - straightStep; z > 1; z -= straightStep) pts.push([-2 * R, 0, z]);
  for (let a = 180; a < 360 - 1e-6; a += arcStepDeg) pts.push([-R + R * Math.cos(a * D2R), 0, R * Math.sin(a * D2R)]);
  return pts;
}

/** Hilly, banked, twisty circuit with a ramp and a pad: [x, y, z, width, bankDeg] (positive bank rolls into a RIGHT turn). */
export const COASTER_POINTS = [
  [0, 0, 0, 16, 0], [0, 0, 120, 16, 0], [30, 3, 240, 16, 6], [110, 8, 320, 16, 10], [210, 12, 340, 16, 10], [300, 10, 290, 16, 6],
  [330, 4, 200, 16, 0], [300, 0, 100, 16, -6], [230, -2, 20, 15, -9], [240, -4, -90, 14, -10], [180, -2, -190, 14, -6], [80, 0, -240, 14, 8],
  [-20, 2, -210, 14, 10], [-90, 5, -140, 14, 4], [-110, 6, -50, 16, 0], [-60, 3, 20, 16, 0],
];

/** Circle of radius R whose centre line ripples: control points every ~8 m with alternating +-0.14 m heights (16 m wavelength). */
export function rippleCirclePoints(R = 70, spacing = 8) {
  const n = Math.round((2 * Math.PI * R) / spacing / 2) * 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([-R + R * Math.cos(a), i % 2 ? 0.14 : -0.14, R * Math.sin(a)]);   // starts at (0,0,0) heading +Z, curving right (-X)
  }
  return pts;
}

const basePalette = { skyTop: '#3d8bff', skyHorizon: '#cfe9ff', ground: '#5da13a', accent: '#ffd23f' };
const baseDef = { cup: 'test', theme: 'meadow', music: 'meadow', laps: 1, difficulty: 1, description: 'test', palette: basePalette };

export const DEFS = {
  /** 400 m wide road, 200 m shoulders: walls are unreachable, perfect for steady-state circles and straight-line speed runs. */
  open: { ...baseDef, id: 't-open', name: 'Open', width: 400, shoulder: 200, points: stadiumPoints(2400, 600) },
  /** Normal 16 m road with 6 m shoulders and walls on a long straight: wall / off-road / kart-vs-kart tests. */
  strip: { ...baseDef, id: 't-strip', name: 'Strip', width: 16, shoulder: 6, points: stadiumPoints(2400, 400),
    zones: [{ type: 'ice', s: 600, length: 300, width: 16 }, { type: 'ramp', s: 1400, length: 14, width: 10, height: 3.2 }, { type: 'boost', s: 1800, length: 12, width: 6 }] },
  /** Same as strip but the right-hand edge is open on the first straight (fall -> rescue). */
  edge: { ...baseDef, id: 't-edge', name: 'Edge', width: 16, shoulder: 6, points: stadiumPoints(2400, 400), openEdges: [{ s0: 300, s1: 1200, side: 'right' }] },
  /** Short circuit with an open (wall-less) right edge on its first straight: rescue + finish tests. */
  edgeShort: { ...baseDef, id: 't-edge-short', name: 'EdgeShort', width: 16, shoulder: 6, points: stadiumPoints(500, 90, 80, 10), openEdges: [{ s0: 120, s1: 460, side: 'right' }] },
  /** Walls at +-14 m like a normal course, but the shoulder is tarmac so wall tests are not confused by grass slowdown. */
  walls: { ...baseDef, id: 't-walls', name: 'Walls', width: 16, shoulder: 6, shoulderSurface: Surface.ROAD, points: stadiumPoints(2400, 400) },
  /** Whole arena is ice (road surface override through a giant ice zone). */
  ice: { ...baseDef, id: 't-ice', name: 'Ice', width: 400, shoulder: 200, points: stadiumPoints(2400, 600), zones: [{ type: 'ice', s: 50, length: 2000, width: 400 }] },
  /** Circuits with sustained corners (for the value-of-drifting lap-time comparison). */
  sweepers: { ...baseDef, id: 't-sweepers', name: 'Sweepers', width: 16, shoulder: 6, points: stadiumPoints(500, 90, 80, 10) },
  hairpins: { ...baseDef, id: 't-hairpins', name: 'Hairpins', width: 16, shoulder: 6, points: stadiumPoints(500, 45, 80, 10) },
  coaster: { ...baseDef, id: 't-coaster', name: 'Coaster', width: 16, shoulder: 6, points: COASTER_POINTS,
    zones: [{ type: 'ramp', s: 300, length: 12, width: 8, height: 2.4 }, { type: 'boost', s: 800, length: 12, width: 6 }] },
  /** Every slow / slidey surface in a row on the sweepers circuit (mud, sand, water, snow, ice), full road width. */
  surfaces: { ...baseDef, id: 't-surfaces', name: 'Surfaces', width: 16, shoulder: 6, points: stadiumPoints(500, 90, 80, 10),
    zones: [{ type: 'mud', s: 150, length: 60, width: 18 }, { type: 'sand', s: 260, length: 60, width: 18 }, { type: 'water', s: 370, length: 60, width: 18 },
      { type: 'snow', s: 480, length: 60, width: 18 }, { type: 'ice', s: 620, length: 80, width: 18 }, { type: 'mud', s: 1000, length: 80, width: 18 }] },
  ripples: { ...baseDef, id: 't-ripples', name: 'Ripples', width: 16, shoulder: 6, points: rippleCirclePoints(70, 8) },
  /** The shipped baseline course. */
  meadows: sunnyMeadows,
};

/**
 * Real SplineTrack. If its constructor needs more of a browser than the stubs provide (e.g. when the world/visual build was
 * rewritten), fall back to building only the data side (samples, zones, features, racing line, minimap) - all physics needs.
 * Set RIG_DATA_ONLY=1 to force the fallback.
 */
export function buildTrack(def) {
  if (!process.env.RIG_DATA_ONLY) {
    try { return new SplineTrack(def, {}); } catch (e) { if (process.env.RIG_VERBOSE) console.warn('[rig] full SplineTrack failed, data-only fallback:', e.message); }
  }
  const t = Object.create(SplineTrack.prototype);
  t.def = def; t.id = def.id; t.name = def.name; t.theme = def.theme ?? 'meadow'; t.laps = def.laps ?? 3; t.quality = {};
  const steps = [['_buildSamples', [def]], ['_buildZones', [def]], ['_buildFeatures', [def]], ['_buildRacingLine', []], ['_buildMinimap', []]];
  for (const [name, args] of steps) {
    if (typeof t[name] !== 'function') throw new Error(`rig: SplineTrack.${name} not found - adapt scripts/lib/rig.mjs buildTrack() to the new track internals`);
    t[name](...args);
  }
  return t;
}

export function makeRig(def = DEFS.open, { speedClass = 'pro', seed = 1, laps = 1, withRace = false } = {}) {
  const events = new EventBus();
  const track = buildTrack(def);
  const session = {
    events, track, karts: [], player: null, rng: mulberry32(seed), time: 0,
    config: { laps, mode: 'versus', skipIntro: true, speedClass, seed, racers: 1 },
    settings: { cameraShake: true, fovBoost: true }, quality: { id: 'low' },
    random() { return this.rng(); },
    on(type, fn) { return events.on(type, fn); },
  };
  const counts = {};
  events.onAny((t) => { counts[t] = (counts[t] ?? 0) + 1; });
  const log = [];
  events.onAny((t, p) => log.push({ t: session.time, type: t, p }));
  const rig = {
    session, track, events, counts, log, def,
    physics: null, race: null,
    addKart({ driver = 'pip', body = 'classic', s = 100, lateral = 0, speed = 0, yawOffset = 0, player = false, name } = {}) {
      const k = new Kart({ id: session.karts.length, name, driverId: driver, bodyId: body, isPlayer: player || session.karts.length === 0, speedClass, events });
      const t = track.getRespawn(s, lateral);
      k.placeAt(t.position, t.yaw + yawOffset, speed);
      k.locked = false;
      session.karts.push(k);
      if (k.isPlayer && !session.player) session.player = k;
      rig.physics ??= (session.physicsRef = new KartPhysics(session));
      // prime the query so the first substep has a valid hint
      track.project(k.position, k.query, -1); k.hint = k.query.index;
      rig.physics.finalize(k, 1 / 60);
      return k;
    },
    /** Advance one frame of dt seconds. */
    step(dt = 1 / 60) {
      rig.physics.update(dt);
      rig.race?.update(dt);
      session.time += dt;
    },
    /**
     * Run `seconds` of sim.  `ctl(t, i)` is called before each frame to set inputs.  Returns samples every `every` seconds
     * (0 = every frame) as { t, ...snap(kart) } for `watch` (default first kart).
     */
    run(seconds, ctl, { dt = 1 / 60, every = 0, watch = null, pin = null } = {}) {
      const k = watch ?? session.karts[0];
      const n = Math.round(seconds / dt);
      const out = [];
      let next = 0;
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        ctl?.(t, i);
        if (pin) pin(k);
        rig.step(dt);
        if (every === 0 || t + 1e-9 >= next) { out.push(rig.snap(k, t + dt)); next += every; }
      }
      return out;
    },
    snap(k, t = session.time) {
      return {
        t, x: k.position.x, y: k.position.y, z: k.position.z, yaw: k.yaw, heading: k.heading, moveYaw: k.moveYaw,
        speed: k.speed, kmh: k.speed * 3.6, slide: k.slide, vy: k.vy, grounded: k.grounded, s: k.query.s, lateral: k.query.lateral,
        drift: k.drift.dir, level: k.drift.level, charge: k.drift.charge, angle: k.drift.angle, boost: k.boost.timer,
        surface: k.surface, spin: k.spin.timer, finite: [k.position.x, k.position.y, k.position.z, k.speed, k.yaw, k.slide, k.vy].every(Number.isFinite),
      };
    },
    startRace() {
      rig.race = new RaceManager(session);
      session.race = rig.race;
      rig.race.placeOnGrid();
      return rig.race;
    },
    clearLog() { log.length = 0; for (const k of Object.keys(counts)) delete counts[k]; },
    /** Test-only chasm: no ground between s0 and s1 (what a `gap` zone of the real SplineTrack does: query.inBounds = false). */
    addGap(s0, s1) {
      const orig = track.project.bind(track);
      track.project = (p, out, hint) => { const r = orig(p, out, hint); if (r.s >= s0 && r.s <= s1) r.inBounds = false; return r; };
    },
  };
  return rig;
}

/** Aim a kart (position stays) at `yawDeg` degrees relative to the track direction, keeping its speed. */
export function aim(k, track, yawOffsetRad) {
  const t = track.getRespawn(k.query.s, 0);
  k.heading = k.moveYaw = t.yaw + yawOffsetRad; k.yaw = k.heading;
}

/**
 * Lookahead pursuit bot (like the baseline AI) with a "good player" drift policy: commit when a sustained corner is coming,
 * hold the drift through it, release at the exit.  Used for lap-time comparisons (drift vs no drift).
 */
export function makeBot(session, kart, { drift = true, lookMin = 11, lookGain = 0.55, yawGain = 3.2, cornerSpeedMul = 1, startCurv = 0.0075, holdCurv = 0.0035, flipCurv = 0.0035, physics = null, chainLevel = 0, naive = false } = {}) {
  const track = session.track;
  const p = new THREE.Vector3();
  let drifting = false, regap = 0, held = 0;
  return () => {
    const q = kart.query, inp = kart.input, st = kart.stats;
    const speed = Math.max(0, kart.speed);
    const look = clamp(9 + speed * lookGain, lookMin, 36);
    const sT = q.s + look;
    const off = track.lineOffsetAt(sT);
    track.pointAt(sT, clamp(off, -q.halfWidth * 0.8, q.halfWidth * 0.8), p);
    const desired = Math.atan2(p.x - kart.position.x, p.z - kart.position.z);
    const err = angleDiff(desired, kart.heading);
    const phys = naive ? null : (physics ?? session.physicsRef);
    const wDes = clamp(err * yawGain, -2.5, 2.5);            // desired heading rate, + = left
    inp.steer = phys ? phys.steerForYawRate(kart, wDes) : clamp(-err * 2.6, -1, 1);
    const corner = track.maxSpeedAt(q.s + 10 + speed * 0.9) * cornerSpeedMul;
    const vMax = Math.min(st.topSpeed * 1.2, corner);
    inp.throttle = speed < vMax ? 1 : 0;
    inp.brake = speed > vMax * 1.15 ? 0.7 : 0;
    if (drift) {
      if (!drifting) {
        drifting = speed > st.topSpeed * 0.65 && Math.abs(track.curvatureAt(q.s + 14)) > startCurv && Math.abs(track.curvatureAt(q.s + 40)) > startCurv;
        // like a human: stick into the corner while committing to the drift
        if (drifting && kart.drift.dir === 0 && Math.abs(inp.steer) < 0.5) inp.steer = Math.sign(-err || 1) * 0.5;
      } else if (held > 30 && Math.max(Math.abs(track.curvatureAt(q.s + 6)), Math.abs(track.curvatureAt(q.s + 22))) < holdCurv || speed < st.topSpeed * 0.35) drifting = false;
      // an S-bend: the corner reverses, and a drift cannot turn the other way - let go in good time (curvature > 0 = left, drift.dir -1 = left)
      if (drifting && kart.drift.dir !== 0 && Math.max(kart.drift.dir * track.curvatureAt(q.s + 12), kart.drift.dir * track.curvatureAt(q.s + 24)) > flipCurv) drifting = false;
      // chain mini-turbos: let go as soon as the wanted level is reached and re-hop if the corner goes on
      if (chainLevel && drifting && kart.drift.dir !== 0 && kart.drift.level >= chainLevel && Math.abs(track.curvatureAt(q.s + 30)) > startCurv) { drifting = false; regap = 3; }
    } else drifting = false;
    if (regap > 0) { regap--; inp.drift = false; return finish(); }
    held = drifting ? held + 1 : 0;
    inp.drift = drifting;
    return finish();
    function finish() { inp.item = false; inp.lookBack = false; }
  };
}

/** Solo flying lap(s) with the bot; returns { time, respawns, events } (time = seconds until finished or maxT). */
export function soloLap(def, { driver = 'pip', body = 'classic', speedClass = 'pro', drift = true, laps = 1, maxT = 240, botOpts = {}, driftAssist = null } = {}) {
  const rig = makeRig(def, { speedClass, laps });
  const k = rig.addKart({ driver, body, s: rig.track.length - 6, speed: 0 });
  if (driftAssist !== null) k.driftAssist = driftAssist;
  const race = rig.startRace();
  race.setPhase('countdown');
  rig.session.karts[0].input.reset();
  const bot = makeBot(rig.session, k, { drift, ...botOpts });
  let t = 0;
  while (t < 4 && race.phase !== 'racing') { k.input.throttle = 0; rig.step(1 / 60); t += 1 / 60; }
  t = 0;
  while (t < maxT && !k.race.finished) { bot(); rig.step(1 / 60); t += 1 / 60; }
  return { time: k.race.finishTime, finished: k.race.finished, counts: { ...rig.counts }, lapTimes: [...k.race.lapTimes] };
}
