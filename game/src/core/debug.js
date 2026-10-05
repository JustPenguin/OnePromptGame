// window.__kart: the test/debug harness. OWNER: Agent A (engine); other agents may ADD methods in their own section.
// Lets playwright-cli (and scripts/check.mjs) drive the game deterministically even on the slow software renderer:
//   await __kart.startRace({ trackId:'sunny-meadows', laps:1, racers:6, skipIntro:true })
//   __kart.freeze(true)            stop the real-time loop (so only advance()/render() move time)
//   __kart.advance(30)             simulate 30 s in 1/60 s steps WITHOUT rendering (fast)
//   __kart.render()                draw one frame, then take a screenshot
//   __kart.autoDrive(true)         let the AI drive the player's kart
//   __kart.setInput({throttle:1, steer:-0.5, drift:true})   /  __kart.clearInput()
//   __kart.state()                 JSON snapshot of the race (player + all karts)
import { KartInput } from '../physics/Kart.js';
import { PARAMS } from './params.js';
import { TRACK_DEFS } from '../tracks/index.js';
import { DRIVERS } from '../data/roster.js';

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
    finite: [k.position.x, k.position.y, k.position.z, k.speed, k.yaw].every(Number.isFinite),
  });

  const api = {
    version: 1,
    ready: false,
    app,
    params: Object.fromEntries(PARAMS.entries()),
    get session() { return app.session; },
    get player() { return app.session?.player ?? null; },

    async startRace(cfg = {}) {
      await app.startRace({ skipIntro: true, laps: 1, ...cfg });
      api.counts = {};
      app.session.events.onAny((type) => { api.counts[type] = (api.counts[type] ?? 0) + 1; });
      return api.state();
    },
    /** event-name -> count since the current race started (race:lap, kart:wallHit, kart:respawn, ...) */
    counts: {},
    trackIds() { return TRACK_DEFS.map((t) => t.id); },
    driverIds() { return DRIVERS.map((d) => d.id); },
    quit() { app.quitToMenu(); return true; },
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
      for (let i = 0; i < n; i++) { s.update(step); if (i % 30 === 0 && pred(api.state())) break; }
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
        paused: app.paused, quality: s.quality?.id,
        player: s.player ? kartInfo(s.player) : null,
        karts: s.karts.map(kartInfo),
      };
    },
    teleport(kartId, sArc, lateral = 0) {
      const s = app.session; const k = s?.karts.find((x) => x.id === kartId) ?? s?.player; if (!k) return false;
      const t = s.track.getRespawn(sArc, lateral);
      k.placeAt(t.position, t.yaw, k.speed);
      return true;
    },
    giveItem(type, count = 1, kartId) {
      const s = app.session; const k = kartId === undefined ? s?.player : s?.karts.find((x) => x.id === kartId);
      if (!k) return false; s.items.giveItem(k, type, count); return true;
    },
  };
  window.__kart = api;
  return api;
}
