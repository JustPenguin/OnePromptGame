// A Grand Prix run: a cup's tracks raced in order with the same driver/kart and a fixed field. OWNER: Agent E.
//   const gp = new GrandPrixRun({cup, speedClass, driverId, bodyId, name, seed})
//   gp.configForRace()      -> RaceSession config for the next race (grid order = standings after race 1)
//   gp.record(standings)    -> { rows, gained }   adds points; rows = standings table sorted best-first
//   gp.finished / gp.finalRows / gp.playerPlace / gp.trophy
import { DRIVERS, KART_BODIES } from '../data/roster.js';
import { mulberry32 } from '../core/math.js';
import { pointsForPlace, trophyForPlace } from './points.js';

export class GrandPrixRun {
  constructor({ cup, speedClass, driverId, bodyId, name, seed, racers = 8 }) {
    this.cup = cup;
    this.speedClass = speedClass;
    this.seed = seed ?? ((Math.random() * 0xffffffff) >>> 0);
    this.index = 0;                       // races completed
    this.tracks = cup.tracks;
    this.history = [];                    // per race: [{key, place, points}]
    const rng = mulberry32(this.seed);
    // fixed field: the player + (racers-1) distinct rivals, each with a body picked once so identities stay stable
    const pool = DRIVERS.filter((d) => d.id !== driverId).map((d) => d.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.entrants = [{ key: driverId, driverId, bodyId, name: name ?? 'You', isPlayer: true, points: 0, wins: 0, lastPlace: 0, places: [] }];
    for (let i = 0; i < Math.min(racers - 1, pool.length); i++) {
      this.entrants.push({ key: pool[i], driverId: pool[i], bodyId: KART_BODIES[Math.floor(rng() * KART_BODIES.length)].id, name: null, isPlayer: false, points: 0, wins: 0, lastPlace: 0, places: [] });
    }
    this.player = this.entrants[0];
  }

  get total() { return this.tracks.length; }
  get finished() { return this.index >= this.total; }
  get trackDef() { return this.tracks[Math.min(this.index, this.total - 1)]; }

  /** Entrants sorted by total points (ties: better last race). */
  rows() {
    return [...this.entrants].sort((a, b) => b.points - a.points || a.lastPlace - b.lastPlace || (a.isPlayer ? -1 : 1)).map((e, i) => ({ ...e, rank: i + 1 }));
  }

  configForRace() {
    const def = this.trackDef;
    const sorted = this.index === 0 ? null : this.rows();
    const others = (sorted ?? this.entrants).filter((e) => !e.isPlayer);
    const rng = mulberry32(this.seed ^ 0x9e3779b9);
    const order = sorted ? others : [...others].sort(() => rng() - 0.5);   // race 1: shuffled; after that: by standings
    const playerGrid = sorted ? sorted.findIndex((e) => e.isPlayer) : 'last';
    return {
      mode: 'grandprix', trackId: def.id, laps: def.laps ?? 3, speedClass: this.speedClass, racers: this.entrants.length,
      player: { driverId: this.player.driverId, bodyId: this.player.bodyId, name: this.player.name },
      opponents: order.map((e) => ({ driverId: e.driverId, bodyId: e.bodyId })),
      playerGrid, items: true, seed: (this.seed + this.index * 7919) >>> 0,
      extra: { gp: { index: this.index, total: this.total, cupId: this.cup.id } },
    };
  }

  /** Add the points from a finished race. `standings` = RACE_RESULTS standings. -> { rows, gained: Map(key -> points), prev: Map(key -> rank before) } */
  record(standings) {
    const gained = new Map();
    const prev = this.index === 0 ? null : new Map(this.rows().map((r) => [r.key, r.rank]));
    const entry = [];
    for (const s of standings) {
      const e = this.entrants.find((x) => x.driverId === s.driverId);
      if (!e) continue;
      const pts = pointsForPlace(s.place);
      e.points += pts; e.lastPlace = s.place; e.places.push(s.place);
      if (s.place === 1) e.wins++;
      gained.set(e.key, pts);
      entry.push({ key: e.key, place: s.place, points: pts, time: s.time, finished: s.finished });
    }
    this.history.push(entry);
    this.index++;
    return { rows: this.rows(), gained, prev };
  }

  get playerPlace() { return this.rows().find((r) => r.isPlayer)?.rank ?? this.entrants.length; }
  get trophy() { return trophyForPlace(this.playerPlace); }
}
