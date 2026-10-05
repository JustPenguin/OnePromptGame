// Node self-test for the pure game-mode logic (no DOM):   node src/modes/selftest.mjs
// Covers: ghost gap sign convention, Grand Prix scoring / grid / trophies, unlock + achievement rules, career records & ghosts.
import assert from 'node:assert/strict';

globalThis.window = { localStorage: null, addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const { ghostGapSeconds, formatGap } = await import('./ghostGap.js');
const { GrandPrixRun } = await import('./GrandPrix.js');
const { GP_POINTS, pointsForPlace, trophyForPlace, betterTrophy } = await import('./points.js');
const { evaluateUnlocks, UNLOCK_RULES, hintFor, isUnlocked, progress } = await import('./unlocks.js');
const { evaluateAchievements, ACHIEVEMENTS } = await import('./achievements.js');
const { recordRace, saveGhost, recordGrandPrix } = await import('./career.js');
const { getCups } = await import('./catalog.js');
const { defaultSave } = await import('../save/defaults.js');

let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('  ok  ' + name); }, (e) => { console.error('  FAIL ' + name + '\n', e); process.exitCode = 1; });
const fakeSave = () => ({ data: defaultSave(), commits: 0, commit() { this.commits++; } });
const fakeApp = (save) => ({ save });

await ok('ghost gap: + = I am behind, - = I am ahead (distance fallback)', () => {
  const me = { speed: 30, race: { distance: 1000 } };
  const ghostAhead = { ghostPlayer: { kart: { race: { distance: 1030 } } } };      // ghost 30 m ahead at 30 m/s -> I am 1.0 s behind
  const ghostBehind = { ghostPlayer: { kart: { race: { distance: 970 } } } };
  assert.ok(Math.abs(ghostGapSeconds(ghostAhead, me) - 1) < 1e-9);
  assert.ok(Math.abs(ghostGapSeconds(ghostBehind, me) + 1) < 1e-9);
  assert.equal(formatGap(1.234), '+1.23'); assert.equal(formatGap(-0.8), '-0.80'); assert.equal(formatGap(0.001), '0.00'); assert.equal(formatGap(NaN), '--');
  assert.equal(ghostGapSeconds({}, me), null);
  // standstill never explodes
  assert.ok(Math.abs(ghostGapSeconds(ghostAhead, { speed: 0, race: { distance: 1000 } })) <= 3.0001);
});

await ok('ghost gap prefers the engine: ghostDelta + = player AHEAD, so it is negated', () => {
  const me = { speed: 30, race: { distance: 1000 } };
  assert.equal(ghostGapSeconds({ ghostDelta: 1.7 }, me), -1.7);      // I am 1.7 s ahead -> shown "-1.70" green
  assert.equal(ghostGapSeconds({ ghostDelta: -0.4 }, me), 0.4);      // I am 0.4 s behind -> shown "+0.40" red
  assert.equal(ghostGapSeconds({ ghostDelta: null, ghostPlayer: { kart: { race: { distance: 1030 } } } }, me), 1);   // null -> fallback
});

await ok('points table, trophies', () => {
  assert.deepEqual(GP_POINTS.slice(0, 4), [15, 12, 10, 9]); assert.equal(pointsForPlace(12), 1); assert.equal(pointsForPlace(13), 0);
  assert.equal(trophyForPlace(1), 'gold'); assert.equal(trophyForPlace(3), 'bronze'); assert.equal(trophyForPlace(4), null);
  assert.equal(betterTrophy('silver', 'gold'), 'gold'); assert.equal(betterTrophy(null, 'bronze'), 'bronze'); assert.equal(betterTrophy('gold', null), 'gold');
});

const cup = getCups()[0];
const mkStandings = (run, order) => order.map((e, i) => ({ driverId: e.driverId, place: i + 1, time: 80 + i, finished: true }));

await ok('Grand Prix run: fixed field, points, grid after race 1, determinism', () => {
  const run = new GrandPrixRun({ cup: { ...cup, tracks: [cup.tracks[0], cup.tracks[0], cup.tracks[0]] }, speedClass: 'pro', driverId: 'pip', bodyId: 'classic', name: 'Me', seed: 7 });
  assert.equal(run.entrants.length, 8); assert.equal(new Set(run.entrants.map((e) => e.driverId)).size, 8);
  const c0 = run.configForRace();
  assert.equal(c0.mode, 'grandprix'); assert.equal(c0.playerGrid, 'last'); assert.equal(c0.racers, 8); assert.equal(c0.opponents.length, 7);
  assert.equal(JSON.stringify(c0), JSON.stringify(new GrandPrixRun({ cup: { ...cup, tracks: [cup.tracks[0], cup.tracks[0], cup.tracks[0]] }, speedClass: 'pro', driverId: 'pip', bodyId: 'classic', name: 'Me', seed: 7 }).configForRace()), 'same seed -> same config');
  // race 1: player wins, rival #1 second ...
  const order = [run.entrants[0], ...run.entrants.slice(1)];
  const r1 = run.record(mkStandings(run, order));
  assert.equal(run.entrants[0].points, 15); assert.equal(run.entrants[1].points, 12); assert.equal(run.index, 1);
  assert.equal(r1.rows[0].isPlayer, true);
  const c1 = run.configForRace();
  assert.equal(c1.playerGrid, 0, 'standings leader starts on pole in race 2');
  // race 2: player last -> total points order changes
  const rev = [...order].reverse();
  run.record(mkStandings(run, rev));
  assert.equal(run.player.points, 15 + pointsForPlace(8));
  run.record(mkStandings(run, order));
  assert.ok(run.finished); assert.equal(run.playerPlace, 1); assert.equal(run.trophy, 'gold');
});

await ok('unlocks: rule table drives the evaluator, hints carry progress', () => {
  const save = fakeSave();
  assert.deepEqual(evaluateUnlocks(save), []);
  assert.match(hintFor(save, 'driver', 'luna'), /Finish 3 races \(0\/3\)/);
  save.data.stats.races = 3; save.data.stats.wins = 2;
  const fresh = evaluateUnlocks(save).map((u) => u.target).sort();
  assert.deepEqual(fresh, ['gizmo', 'luna']);
  assert.ok(isUnlocked(save, 'driver', 'luna'));
  assert.deepEqual(evaluateUnlocks(save), [], 'idempotent');
  // trophies: bronze in blossom -> starlight cup; gold in pro -> master; silver -> rocco
  save.data.grandPrix.blossom = { pro: { trophy: 'gold', points: 60, place: 1, completed: 1, date: 1 } };
  const t = evaluateUnlocks(save).map((u) => `${u.kind}:${u.target}`).sort();
  assert.deepEqual(t, ['cup:starlight', 'driver:rocco', 'speedClass:master']);
  assert.equal(UNLOCK_RULES.length, 8);
  const p = progress(UNLOCK_RULES.find((r) => r.target === 'quill'), save.data);
  assert.deepEqual([p.cur, p.goal, p.done], [0, 6, false]);
});

await ok('achievements: single-race context and totals', () => {
  const save = fakeSave();
  assert.deepEqual(evaluateAchievements(save, null), []);
  save.data.stats.finishes = 1;
  assert.deepEqual(evaluateAchievements(save, { summary: { stats: { overtakes: 7 } } }).map((a) => a.id).sort(), ['comeback', 'first-finish']);
  assert.deepEqual(evaluateAchievements(save, null), []);
  save.data.stats.wins = 10; save.data.stats.topSpeed = 170;
  const ids = evaluateAchievements(save).map((a) => a.id);
  assert.ok(ids.includes('first-win') && ids.includes('wins-10') && ids.includes('speed'));
  assert.ok(ACHIEVEMENTS.every((a) => a.id && a.name && a.desc && a.icon && typeof a.test === 'function'));
});

const mkSession = (over = {}) => ({
  player: { race: { distance: 5000 } }, race: { laps: 3 }, track: { length: 1649 },
  _krStats: { s: { driftSeconds: 10, boosts: 3, itemsHit: 2, itemsUsed: 2, hitsTaken: 1, overtakes: 4, coins: 0, topSpeed: 36, playSeconds: 90, laps: 3 } },
  ...over,
  config: { mode: 'versus', trackId: 'sunny-meadows', laps: 3, speedClass: 'pro', ...over.config },   // merged AFTER the spread so partial overrides keep the defaults
});
const standing = (place, time, extra = {}) => ({ isPlayer: true, place, finished: true, time, bestLap: time / 3.2, driverId: 'pip', bodyId: 'classic', name: 'Me', ...extra });

await ok('career: race stats, records, new-record detection, partial laps vs full length', () => {
  const save = fakeSave(), app = fakeApp(save);
  const s1 = recordRace(app, mkSession(), [standing(1, 90), { isPlayer: false, place: 2, finished: true, time: 95, driverId: 'rusty', bodyId: 'classic' }]);
  assert.equal(s1.place, 1); assert.equal(s1.newRecord, true); assert.equal(s1.newLapRecord, true);
  assert.equal(save.data.stats.races, 1); assert.equal(save.data.stats.wins, 1); assert.equal(save.data.stats.podiums, 1);
  assert.ok(Math.abs(save.data.stats.topSpeed - 36 * 3.6) < 1e-6, 'top speed is stored in km/h');
  assert.equal(save.data.records['sunny-meadows'].race.pro.time, 90);
  // slower second run: no record, delta vs previous
  const s2 = recordRace(app, mkSession(), [standing(2, 95)]);
  assert.equal(s2.newRecord, false); assert.ok(Math.abs(s2.race.delta - 5) < 1e-9);
  // idempotent per session
  const sess = mkSession(); const a = recordRace(app, sess, [standing(1, 80)]); const b = recordRace(app, sess, [standing(1, 80)]);
  assert.equal(a, b); assert.equal(save.data.stats.races, 3);
  // a 1-lap race must not overwrite the 3-lap record
  const s3 = recordRace(app, mkSession({ config: { laps: 1 } }), [standing(1, 20, { bestLap: 20 })]);
  assert.equal(s3.race, null); assert.equal(save.data.records['sunny-meadows'].race.pro.time, 80);
  // DNF counts as a race but not a finish
  const before = save.data.stats.finishes;
  recordRace(app, mkSession(), [standing(8, null, { finished: false })]);
  assert.equal(save.data.stats.finishes, before);
});

await ok('career: time trial record + ghost persistence only on a new record', () => {
  const save = fakeSave(), app = fakeApp(save);
  const tt = (time, ghost) => mkSession({ config: { mode: 'timetrial', racers: 1 }, ghostResult: ghost });
  const g1 = { time: 70, driverId: 'pip', bodyId: 'classic', trackId: 'sunny-meadows', data: { f: [1] } };
  const sess1 = tt(70, g1);
  const sum1 = recordRace(app, sess1, [standing(1, 70)], { mode: 'timetrial' });
  assert.equal(sum1.newRecord, true); assert.equal(save.data.stats.ttRecords, 1);
  assert.equal(saveGhost(app, sess1, sum1), true); assert.ok(save.data.ghosts['sunny-meadows|pro'].data);
  assert.equal(save.data.records['sunny-meadows'].tt.pro.time, 70);
  const sess2 = tt(75, { ...g1, time: 75 });
  const sum2 = recordRace(app, sess2, [standing(1, 75)], { mode: 'timetrial' });
  assert.equal(sum2.newRecord, false); assert.equal(saveGhost(app, sess2, sum2), false);
  assert.equal(save.data.ghosts['sunny-meadows|pro'].time, 70, 'slower run keeps the old ghost');
});

await ok('career: cup result keeps the BEST trophy and counts completions', () => {
  const save = fakeSave(), app = fakeApp(save);
  const mk = (place, points) => ({ cup: { id: 'blossom' }, speedClass: 'pro', playerPlace: place, player: { points } });
  const r1 = recordGrandPrix(app, mk(3, 40)); assert.equal(r1.trophy, 'bronze'); assert.equal(r1.isNewTrophy, true);
  const r2 = recordGrandPrix(app, mk(5, 30)); assert.equal(r2.trophy, null); assert.equal(save.data.grandPrix.blossom.pro.trophy, 'bronze');
  const r3 = recordGrandPrix(app, mk(1, 60)); assert.equal(r3.isNewTrophy, true);
  const e = save.data.grandPrix.blossom.pro;
  assert.deepEqual([e.trophy, e.points, e.place, e.completed], ['gold', 60, 1, 3]);
  assert.ok(save.data.stats.gpWon === 1 && save.data.stats.gpPlayed === 3);
  assert.ok(r1.unlocked.some((u) => u.target === 'starlight'), 'a Blossom trophy opens the Starlight cup');
});

console.log(process.exitCode ? '\nMODES SELFTEST FAILED' : `\nMODES SELFTEST PASSED (${n} checks)`);
