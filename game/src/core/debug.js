// window.__kart: the test/debug harness. OWNER: Agent A (engine); other agents may ADD methods in their own section.
// Lets playwright-cli (and scripts/check.mjs) drive the game deterministically even on the slow software renderer:
//   await __kart.startRace({ trackId:'sunny-meadows', laps:1, racers:6, skipIntro:true })
//   __kart.freeze(true)            stop the real-time loop (so only advance()/render() move time)
//   __kart.advance(30)             simulate 30 s in 1/60 s steps WITHOUT rendering (fast); advance(s, step) picks the frame time
//   __kart.render()                draw one frame, then take a screenshot
//   __kart.autoDrive(true)         let the race AI drive the player's kart
//   __kart.bot(true, {drift:true, chain:2})   engine test bot: drives the player with a drifting, rocket-starting controller
//   __kart.setInput({throttle:1, steer:-0.5, drift:true})   /  __kart.clearInput()
//   __kart.state()                 JSON snapshot of the race (player + all karts)
// Engine helpers (section "A" below): trace / script / camera / kart effects / finishRace / perf.  See docs/engine.md.
import { KartInput } from '../physics/Kart.js';
import { PARAMS } from './params.js';
import { TRACK_DEFS } from '../tracks/index.js';
import { DRIVERS } from '../data/roster.js';
import { makeBotController } from './bot.js';

const r2 = (v) => Math.round(v * 100) / 100;

export function installDebug(app) {
  const kartInfo = (k) => ({
    id: k.id, name: k.name, driver: k.driverId, body: k.bodyId, isPlayer: k.isPlayer,
    pos: [r2(k.position.x), r2(k.position.y), r2(k.position.z)], yaw: r2(k.yaw),
    speed: r2(k.speed), kmh: Math.round(Math.abs(k.speed) * 3.6), slide: r2(k.slide),
    lap: k.race.lap, place: k.race.place, distance: r2(k.race.distance), s: r2(k.race.s), lateral: r2(k.race.lateral),
    finished: k.race.finished, finishTime: r2(k.race.finishTime), bestLap: isFinite(k.race.bestLap) ? r2(k.race.bestLap) : null,
    item: k.item.type, itemCount: k.item.count, roulette: k.item.roulette.active,
    drift: k.drift.dir, driftLevel: k.drift.level, boost: r2(k.boost.timer), spin: r2(k.spin.timer),
    surface: k.surface, onRoad: k.onRoad, grounded: k.grounded, wrongWay: k.race.wrongWay,
    invincible: r2(k.invincible), shrink: r2(k.shrink), rocket: r2(k.rocket), respawning: k.respawn.active,
    draft: r2(k.draft.bonus), grace: r2(k.grace), scraping: k.scraping, stun: r2(k.stun),
    finite: [k.position.x, k.position.y, k.position.z, k.speed, k.yaw].every(Number.isFinite),
  });
  const kartById = (id) => { const s = app.session; return id === undefined || id === null ? s?.player : s?.karts.find((x) => x.id === id) ?? s?.player; };
  let botOn = false;

  const api = {
    version: 2,
    ready: false,
    app,
    params: Object.fromEntries(PARAMS.entries()),
    get session() { return app.session; },
    get player() { return app.session?.player ?? null; },

    async startRace(cfg = {}) {
      api.bot(false);
      await app.startRace({ skipIntro: true, laps: 1, ...cfg });
      api.counts = {};
      app.session.events.onAny((type) => { api.counts[type] = (api.counts[type] ?? 0) + 1; });
      return api.state();
    },
    /** event-name -> count since the current race started (race:lap, kart:wallHit, kart:respawn, ...) */
    counts: {},
    trackIds() { return TRACK_DEFS.map((t) => t.id); },
    driverIds() { return DRIVERS.map((d) => d.id); },
    quit() { api.bot(false); app.quitToMenu(); return true; },
    freeze(on = true) { app.freeze = !!on; return app.freeze; },
    pause(on = true) { app.setPaused(!!on); return app.paused; },
    /** Simulate `seconds` of game time without rendering. Returns the state. */
    advance(seconds = 1, step = 1 / 60) {
      const s = app.session;
      if (!s?.loaded) return null;
      const n = Math.max(1, Math.round(seconds / step));
      for (let i = 0; i < n; i++) { s.update(step); app.input.endFrame(); }
      return api.state();
    },
    /** Advance until `pred(state)` is true or `maxSeconds` pass. */
    advanceUntil(predSrc, maxSeconds = 300, step = 1 / 60) {
      const s = app.session; if (!s?.loaded) return null;
      const pred = new Function('state', `return (${predSrc});`);
      const n = Math.round(maxSeconds / step);
      for (let i = 0; i < n; i++) { s.update(step); app.input.endFrame(); if (i % 30 === 0 && pred(api.state())) break; }
      return api.state();
    },
    render() { app.renderFrame(); return true; },
    setInput(partial) { const i = new KartInput(); Object.assign(i, partial); app.input.override = i; return true; },
    clearInput() { app.input.override = null; return true; },
    autoDrive(on = true) { const p = app.session?.player; if (p) p.autopilot = !!on; return !!p?.autopilot; },
    state() {
      const s = app.session;
      if (!s) return { scene: 'menu' };
      return {
        scene: 'race', loaded: s.loaded, phase: s.race?.phase, raceTime: r2(s.race?.time ?? 0),
        track: s.track?.id, trackLength: r2(s.track?.length ?? 0), laps: s.race?.lapCount,
        paused: app.paused, quality: s.quality?.id, mode: s.config?.mode,
        ghostDelta: s.ghostDelta == null ? null : r2(s.ghostDelta), respawnHold: r2(s.respawnHold ?? 0),
        player: s.player ? kartInfo(s.player) : null,
        karts: s.karts.map(kartInfo),
      };
    },
    teleport(kartId, sArc, lateral = 0) {
      const s = app.session; const k = s?.karts.find((x) => x.id === kartId) ?? s?.player; if (!k) return false;
      const t = s.track.getRespawn(sArc, lateral);
      k.placeAt(t.position, t.yaw, k.speed);
      s.track.project(k.position, k.query, -1); k.hint = k.query.index;
      s.physics.finalize(k, 0.016);
      if (k === s.player || k === s.cameraTarget) s.cameraRig?.snapToTarget?.();
      return true;
    },
    giveItem(type, count = 1, kartId) {
      const s = app.session; const k = kartId === undefined ? s?.player : s?.karts.find((x) => x.id === kartId);
      if (!k) return false; s.items.giveItem(k, type, count); return true;
    },

    // ================================================================== A: engine helpers
    /** Drive the player with the engine test bot (drifting, rocket start). api.bot(false) hands control back. */
    bot(on = true, opts = {}) {
      const s = app.session;
      if (!on || !s?.loaded) { app.input.controller = null; botOn = false; return false; }
      app.input.controller = makeBotController(s, s.player, opts);
      app.input.override = null;
      botOn = true;
      return true;
    },
    get botActive() { return botOn; },
    /**
     * Run `seconds` of sim with a fixed input and record the player: [{t, s, lateral, speed, kmh, yaw, slide, drift, level, boost, y}...]
     * every `every` seconds. input = a KartInput-like partial, or a function (t) => partial.
     */
    trace({ seconds = 5, every = 0.1, input = null, step = 1 / 60 } = {}) {
      const s = app.session; if (!s?.loaded) return null;
      const out = []; let next = 0;
      const n = Math.round(seconds / step);
      for (let i = 0; i < n; i++) {
        const t = i * step;
        if (input) { const v = typeof input === 'function' ? input(t) : input; api.setInput(v ?? {}); }
        s.update(step); app.input.endFrame();
        if (t + 1e-9 >= next) {
          const k = s.player;
          out.push({ t: r2(t + step), s: r2(k.query.s), lateral: r2(k.query.lateral), speed: r2(k.speed), kmh: Math.round(k.speed * 3.6), yaw: r2(k.yaw), slide: r2(k.slide), drift: k.drift.dir, level: k.drift.level, charge: r2(k.drift.charge), boost: r2(k.boost.timer), y: r2(k.position.y), grounded: k.grounded, surface: k.surface });
          next += every;
        }
      }
      return out;
    },
    /**
     * Scripted input macro. steps = [{ t: seconds-from-start, input: {...} }, ...] (sorted by t); advances to `until` (default last t + 1)
     * and returns the state after each step.  e.g. script([{t:0,input:{throttle:1}},{t:3,input:{throttle:1,steer:-1,drift:true}}], 6)
     */
    script(steps, until) {
      const s = app.session; if (!s?.loaded) return null;
      const end = until ?? (steps.length ? steps[steps.length - 1].t + 1 : 1);
      const results = []; let t = 0; let i = 0;
      while (t < end - 1e-9) {
        while (i < steps.length && steps[i].t <= t + 1e-9) { api.setInput(steps[i].input ?? {}); results.push({ t: r2(t), state: api.state().player }); i++; }
        const nextT = i < steps.length ? Math.min(steps[i].t, end) : end;
        api.advance(Math.max(1 / 60, nextT - t));
        t = Math.max(nextT, t + 1 / 60);
      }
      results.push({ t: r2(t), state: api.state().player });
      return results;
    },
    /** Camera pose + settings (position, look target, fov, mode, yaw, shake). */
    camera() {
      const s = app.session; if (!s?.loaded) return null;
      const c = s.camera, r = s.cameraRig;
      return { pos: c.position.toArray().map(r2), look: r.look.toArray().map(r2), fov: r2(c.fov), mode: r.mode, yaw: r2(r.yaw), shake: r2(r.shake), lookBack: r2(r.lookBackBlend), boostKick: r2(r.boostKick), target: r.target?.name, phase: s.race.phase };
    },
    cameraMode(m) { const r = app.session?.cameraRig; return r ? (m ? r.setMode(m) : r.cycleMode()) : null; },
    skipIntro() { app.session?.race.skipIntro(); return app.session?.race.phase; },
    /** Kart effects for tests. kartId defaults to the player. */
    spin(kartId, duration = 1.3) { return !!kartById(kartId)?.spinOut(duration, 'debug'); },
    launch(kartId, vy = 11) { return !!kartById(kartId)?.launch(vy, 'debug'); },
    boost(kartId, strength = 0.38, duration = 1.4) { kartById(kartId)?.applyBoost(strength, duration, 'item'); return true; },
    respawn(kartId, reason = 'manual') { const k = kartById(kartId); if (k) app.session.physics.respawnKart(k, reason); return !!k; },
    setSpeed(kartId, ms) { const k = kartById(kartId); if (k) k.speed = ms; return !!k; },
    shrink(kartId, seconds = 5) { return !!kartById(kartId)?.shrinkFor(seconds); },
    invincible(kartId, seconds = 6) { kartById(kartId)?.setInvincible(seconds); return true; },
    /**
     * Fast-forward to the end: every kart is moved to the last stretch of the final lap in its current order (or `order` =
     * kart ids best-first) and keeps its speed, so a few seconds of advance() reach the results.
     */
    finishRace(order = null, metresToGo = 25) {
      const s = app.session; if (!s?.loaded || !s.race.isRacing) return null;
      const L = s.track.length, race = s.race;
      const list = order ? order.map((id) => s.karts.find((k) => k.id === id)).filter(Boolean) : [...race.order];
      list.forEach((k, i) => {
        const toGo = metresToGo + i * 7;
        const t = s.track.getRespawn(L - toGo, (i % 2 ? 1 : -1) * 2.5);
        k.placeAt(t.position, t.yaw, Math.max(k.speed, 18));
        s.track.project(k.position, k.query, -1); k.hint = k.query.index;
        k.race.s = k.query.s; k.race.distance = (race.laps - 1) * L + (L - toGo); k.race.lapsDone = race.laps - 1; k.race.lap = race.laps;
        k.race.lapTimes = Array.from({ length: race.laps - 1 }, (_, j) => 50 + j * 0.37 + i * 0.11);
        k.race.lapStartTime = Math.max(0, race.time - 20);
        k.locked = false;
      });
      s.cameraRig?.snapToTarget?.();
      return api.state();
    },
    /** Wall-clock cost of simulating `seconds` of game time (no rendering): ms per simulated second and per frame. */
    perf(seconds = 20) {
      const s = app.session; if (!s?.loaded) return null;
      const n = Math.round(seconds * 60);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { s.update(1 / 60); app.input.endFrame(); }
      const ms = performance.now() - t0;
      return { simSeconds: seconds, wallMs: r2(ms), msPerFrame: r2(ms / n), karts: s.karts.length };
    },
    /** Time one physics.update(1/60) over many frames (physics only). */
    physicsPerf(frames = 600) {
      const s = app.session; if (!s?.loaded) return null;
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) s.physics.update(1 / 60);
      return { frames, msPerFrame: r2((performance.now() - t0) / frames), karts: s.karts.length };
    },
  };
  window.__kart = api;
  return api;
}
