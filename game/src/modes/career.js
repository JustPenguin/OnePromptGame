// Career bookkeeping: per-race stats collection, records, ghosts, Grand Prix trophies and unlocks. OWNER: Agent E.
//   const stats = new RaceStats(session)         collects drift time, boosts, hits... (wraps session.update, see below)
//   recordRace(app, session, standings, ctx)     -> summary for the results screen (call once per finished race)
//   recordPartial(app, session)                  quit / restart mid-race: keeps drift time, distance... but no race result
//   recordGrandPrix(app, gp)                     trophy + stats after the last race of a cup
import { EV } from '../core/events.js';
import { MAX_GHOSTS } from '../save/defaults.js';
import { getTrackDef } from './catalog.js';
import { evaluateUnlocks } from './unlocks.js';
import { evaluateAchievements } from './achievements.js';
import { betterTrophy, trophyForPlace } from './points.js';

export class RaceStats {
  /** @param {import('../core/RaceSession.js').RaceSession} session */
  constructor(session) {
    this.session = session;
    this.s = { driftSeconds: 0, boosts: 0, itemsHit: 0, itemsUsed: 0, hitsTaken: 0, overtakes: 0, coins: 0, topSpeed: 0, playSeconds: 0, laps: 0 };
    const me = () => session.player;
    session.on(EV.BOOST, ({ kart }) => { if (kart === me()) this.s.boosts++; });
    session.on(EV.ITEM_HIT, ({ victim, attacker }) => { if (attacker === me() && victim !== me()) this.s.itemsHit++; if (victim === me()) this.s.hitsTaken++; });
    session.on(EV.ITEM_USE, ({ kart }) => { if (kart === me()) this.s.itemsUsed++; });
    session.on(EV.OVERTAKE, ({ kart }) => { if (kart === me()) this.s.overtakes++; });
    session.on(EV.COIN, ({ kart }) => { if (kart === me()) this.s.coins++; });
    session.on(EV.LAP_COMPLETE, ({ kart }) => { if (kart === me()) this.s.laps++; });
    // The session has no per-frame hook for us, and tests drive it with advance() (no UI frames), so wrap the instance's update().
    const orig = session.update.bind(session);
    session.update = (dt) => { orig(dt); try { this.tick(dt); } catch (e) { /* stats must never break a race */ } };
  }

  tick(dt) {
    const s = this.session, k = s.player;
    if (!k || !s.race) return;
    if (s.race.phase !== 'racing' && s.race.phase !== 'finishing') return;
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.s.playSeconds += dt;
    if (k.drift.dir !== 0) this.s.driftSeconds += dt;
    const v = Math.abs(k.speed);
    if (v > this.s.topSpeed) this.s.topSpeed = v;
  }
}

const num = (v) => (Number.isFinite(v) ? v : 0);

function addStats(save, collected, player, session) {
  const st = save.data.stats;
  for (const k of ['driftSeconds', 'boosts', 'itemsHit', 'itemsUsed', 'hitsTaken', 'overtakes', 'coins', 'playSeconds']) st[k] = num(st[k]) + num(collected?.[k]);
  const dist = Math.max(0, Math.min(num(player?.race.distance), (session.race?.laps ?? 1) * (session.track?.length ?? 0)));
  st.distance = num(st.distance) + dist;
  st.topSpeed = Math.max(num(st.topSpeed), num(collected?.topSpeed) * 3.6);   // stored in km/h
  st.laps = num(st.laps) + num(collected?.laps);
}

/** Result of comparing a time against the stored record. */
function compare(prev, now) { return { prev: prev ?? null, now, isNew: Number.isFinite(now) && (prev == null || now < prev), delta: prev != null && Number.isFinite(now) ? now - prev : null }; }

/**
 * @param {import('../app/App.js').App} app
 * @param {import('../core/RaceSession.js').RaceSession} session
 * @param {any[]} standings   RACE_RESULTS standings
 * @param {{ mode?:string }} [ctx]
 */
export function recordRace(app, session, standings, ctx = {}) {
  if (session._krSummary) return session._krSummary;
  const save = app.save;
  const cfg = session.config;
  const me = standings.find((s) => s.isPlayer) ?? null;
  const def = getTrackDef(cfg.trackId);
  const cls = cfg.speedClass;
  const mode = ctx.mode ?? cfg.mode;
  const finished = !!me?.finished;
  const place = me?.place ?? standings.length;
  const summary = {
    mode, trackId: def.id, trackName: def.name, speedClass: cls, laps: cfg.laps, racers: standings.length,
    place, finished, time: finished ? me.time : null, bestLap: me && Number.isFinite(me.bestLap) ? me.bestLap : null,
    player: me, newRecord: false, newLapRecord: false, race: null, lap: null, unlocked: [], ghost: false, stats: session._krStats?.s ?? null,
  };

  const st = save.data.stats;
  st.races++;
  if (finished) st.finishes++;
  if (finished && place === 1) st.wins++;
  if (finished && place <= 3) st.podiums++;
  addStats(save, session._krStats?.s, session.player, session);
  session._krAccounted = true;

  if (finished) {
    const rec = ((save.data.records[def.id] ??= {}));
    const by = { driverId: me.driverId, bodyId: me.bodyId };
    const date = Date.now();
    const kind = mode === 'timetrial' ? 'tt' : 'race';
    const fullLength = cfg.laps === (def.laps ?? 3);
    if (fullLength) {
      const prev = rec[kind]?.[cls]?.time;
      summary.race = { kind, ...compare(prev, me.time) };
      if (summary.race.isNew) { ((rec[kind] ??= {})[cls]) = { time: me.time, laps: cfg.laps, by, date }; summary.newRecord = true; if (kind === 'tt') st.ttRecords++; }
    }
    if (summary.bestLap != null) {
      const prev = rec.lap?.[cls]?.time;
      summary.lap = compare(prev, summary.bestLap);
      if (summary.lap.isNew) { ((rec.lap ??= {})[cls]) = { time: summary.bestLap, laps: 1, by, date }; summary.newLapRecord = true; st.bestLapRecords++; }
    }
  }
  summary.unlocked = evaluateUnlocks(save);
  summary.achievements = evaluateAchievements(save, { summary });
  save.commit(true);
  session._krSummary = summary;
  return summary;
}

/** Store the time-trial ghost once Agent A's `session.ghostResult` exists (it may appear a moment after RACE_RESULTS). */
export function saveGhost(app, session, summary) {
  const g = session.ghostResult;
  if (!g || summary.mode !== 'timetrial' || !summary.newRecord || summary.ghost) return false;
  const save = app.save;
  const key = `${summary.trackId}|${summary.speedClass}`;
  save.data.ghosts[key] = { ...g, time: Number.isFinite(g.time) ? g.time : summary.time, trackId: summary.trackId, speedClass: summary.speedClass, laps: summary.laps, date: Date.now() };
  const keys = Object.keys(save.data.ghosts);
  if (keys.length > MAX_GHOSTS) { keys.sort((a, b) => num(save.data.ghosts[a].date) - num(save.data.ghosts[b].date)); delete save.data.ghosts[keys[0]]; }
  summary.ghost = true;
  save.commit(true);
  return true;
}

/** Quit / restart before the end: keep what the player did (drift time, distance...) but not a "race". */
export function recordPartial(app, session) {
  if (!session || session._krAccounted || !session.player) return;
  session._krAccounted = true;
  addStats(app.save, session._krStats?.s, session.player, session);
  app.save.commit();
}

/** After the last race of a cup. Returns { trophy, isNewTrophy, points, place, unlocked }. */
export function recordGrandPrix(app, gp) {
  const save = app.save;
  const place = gp.playerPlace;
  const trophy = trophyForPlace(place);
  const points = gp.player.points;
  const byClass = ((save.data.grandPrix[gp.cup.id] ??= {}));
  const prev = byClass[gp.speedClass] ?? { trophy: null, points: 0, place: null, completed: 0, date: 0 };
  const best = betterTrophy(prev.trophy, trophy);
  const isNewTrophy = !!trophy && (prev.trophy == null || (best === trophy && best !== prev.trophy));
  byClass[gp.speedClass] = {
    trophy: best ?? null, points: Math.max(prev.points, points), place: Math.min(prev.place ?? 99, place) === 99 ? null : Math.min(prev.place ?? 99, place),
    completed: prev.completed + 1, date: Date.now(),
  };
  save.data.stats.gpPlayed++;
  if (place === 1) save.data.stats.gpWon++;
  const unlocked = evaluateUnlocks(save);
  const achievements = evaluateAchievements(save, null);
  save.commit(true);
  return { trophy, isNewTrophy, points, place, unlocked, achievements, entry: byClass[gp.speedClass] };
}
