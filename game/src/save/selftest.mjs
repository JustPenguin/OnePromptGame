// Node self-test for the save layer (not bundled into the game):   node src/save/selftest.mjs
// Covers: defaults, sanitising garbage, v1 -> v2 migration, export/import codec round trip, merge, blocked + full storage.
import assert from 'node:assert/strict';

function fakeStorage({ failWrites = false, quota = Infinity } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new Error('blocked'); if (String(v).length > quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
const listeners = {};
globalThis.window = { localStorage: fakeStorage(), addEventListener: (t, f) => { (listeners[t] ??= []).push(f); } };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const { Save, migrateBlob, normalizeSave, mergeSaves, summarizeSave } = await import('./Save.js');
const { SAVE_VERSION, STORAGE_KEY, BACKUP_KEY, defaultSave, DEFAULT_SETTINGS } = await import('./defaults.js');
const { encodeSave, decodeSave, crc32 } = await import('./codec.js');

let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('  ok  ' + name); }, (e) => { console.error('  FAIL ' + name + '\n', e); process.exitCode = 1; });

await ok('defaults are valid and stable under normalise', () => {
  const d = defaultSave();
  const nd = normalizeSave(d);
  assert.equal(nd.version, SAVE_VERSION);
  assert.deepEqual(nd.settings, d.settings);
  assert.deepEqual(nd.unlocks, d.unlocks);
});

await ok('garbage is sanitised, not trusted', () => {
  const nd = normalizeSave({
    settings: { quality: 'ultra-mega', masterVolume: 9, hudScale: -4, bindings: { throttle: ['KeyZ', 5] }, assists: { autoAccelerate: 'yes' }, evil: 1 },
    profile: { name: '  <b>Hax</b>\u0000orzzzzzzzzzzzzzzzzz  ' },
    stats: { races: -5, wins: 'x', distance: 1234 },
    unlocks: { drivers: ['luna', 7, null] },
    records: { a: { tt: { pro: { time: -1 }, rookie: { time: 61.5, by: { driverId: 'pip', bodyId: 'classic' } } } }, b: 5 },
  });
  assert.equal(nd.settings.quality, 'auto');
  assert.equal(nd.settings.masterVolume, 1);
  assert.equal(nd.settings.hudScale, 0.7);
  assert.equal(nd.settings.bindings, null);
  assert.equal(nd.settings.assists.autoAccelerate, false);
  assert.ok(!('evil' in nd.settings));
  assert.ok(!/[<>\u0000]/.test(nd.profile.name) && nd.profile.name.length <= 14);
  assert.equal(nd.stats.races, 0); assert.equal(nd.stats.wins, 0); assert.equal(nd.stats.distance, 1234);
  assert.deepEqual(nd.unlocks.drivers.sort(), ['bruno', 'hopper', 'luna', 'pip', 'rusty']);
  assert.deepEqual(Object.keys(nd.records), ['a']);
  assert.deepEqual(Object.keys(nd.records.a.tt), ['rookie']);
});

await ok('v1 baseline save migrates to the current revision', () => {
  const v1 = { version: 1, profile: { name: 'Old', favoriteDriver: 'rusty', favoriteKart: 'streak', created: 5 },
    settings: { quality: 'high', masterVolume: 0.3 }, records: { 'sunny-meadows': { bestTime: 70.5, bestLap: 22.1, bestTimeBy: { driverId: 'pip', bodyId: 'classic' }, speedClass: 'master' } },
    ghosts: { 'sunny-meadows': { time: 70.5, driverId: 'pip', bodyId: 'classic', hz: 30, frames: [1, 2, 3] } } };
  const m = migrateBlob(v1);
  assert.equal(m._from, 1); assert.equal(m.version, SAVE_VERSION);
  assert.equal(m.profile.favoriteDriver, 'rusty'); assert.equal(m.settings.quality, 'high');
  assert.equal(m.records['sunny-meadows'].race.master.time, 70.5);
  assert.equal(m.records['sunny-meadows'].lap.master.time, 22.1);
  assert.ok(m.ghosts['sunny-meadows|master']);
  assert.deepEqual(m.ghosts['sunny-meadows|master'].data, { hz: 30, frames: [1, 2, 3] });
});

await ok('export -> import round trip (compressed + checksum + tamper detection)', async () => {
  const d = defaultSave();
  d.profile.name = 'Ünï';
  d.stats.races = 42;
  d.records['x'] = { tt: { pro: { time: 61.2, laps: 3, by: { driverId: 'pip', bodyId: 'classic' }, date: 1 } } };
  d.ghosts['x|pro'] = { time: 61.2, data: { f: [1, 2, 3] }, date: 1 };
  const code = await encodeSave(d);
  assert.match(code, /^KRGP[01]\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  const r = await decodeSave(code);
  assert.ok(r.ok, r.error);
  assert.equal(r.data.stats.races, 42);
  assert.deepEqual(r.data.ghosts, {}, 'ghosts are excluded by default');
  const withGhosts = await decodeSave(await encodeSave(d, { ghosts: true }));
  assert.ok(withGhosts.data.ghosts['x|pro']);
  const bad = code.slice(0, -3) + (code.endsWith('aaa') ? 'bbb' : 'aaa');
  assert.equal((await decodeSave(bad)).ok, false);
  assert.equal((await decodeSave('hello')).ok, false);
  assert.equal((await decodeSave(code.slice(0, 20))).ok, false);
  assert.equal((await decodeSave(code.replace(/(.{20})/g, '$1\n  '))).ok, true, 'whitespace/newlines in a pasted code are tolerated');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 'cbf43926');
});

await ok('merge keeps best records, unions unlocks, max stats', () => {
  const a = defaultSave(), b = defaultSave();
  a.records.t = { tt: { pro: { time: 60, laps: 3, by: null, date: 1 } } };
  b.records.t = { tt: { pro: { time: 58, laps: 3, by: null, date: 2 }, rookie: { time: 70, laps: 3, by: null, date: 2 } } };
  b.unlocks.drivers.push('luna'); b.stats.wins = 9; a.stats.wins = 3;
  b.grandPrix.blossom = { pro: { trophy: 'gold', points: 60, place: 1, completed: 1, date: 3 } };
  a.grandPrix.blossom = { pro: { trophy: 'bronze', points: 40, place: 3, completed: 2, date: 4 } };
  const m = mergeSaves(a, b);
  assert.equal(m.records.t.tt.pro.time, 58); assert.equal(m.records.t.tt.rookie.time, 70);
  assert.ok(m.unlocks.drivers.includes('luna')); assert.equal(m.stats.wins, 9);
  assert.equal(m.grandPrix.blossom.pro.trophy, 'gold'); assert.equal(m.grandPrix.blossom.pro.completed, 2); assert.equal(m.grandPrix.blossom.pro.place, 1);
  assert.equal(summarizeSave(m).trophies, 1);
});

await ok('Save persists, reloads, migrates with backup, recovers from corruption', () => {
  window.localStorage = fakeStorage();
  const s = new Save();
  assert.ok(s.persistent);
  const settingsRef = s.settings;
  s.settings.quality = 'low'; s.profile.name = 'Zed'; s.commit(true);
  const s2 = new Save();
  assert.equal(s2.settings.quality, 'low'); assert.equal(s2.profile.name, 'Zed'); assert.equal(s2.notice, null);
  // in-place identity survives replace/reset
  s.replaceWith({ settings: { quality: 'medium' } });
  assert.equal(s.settings, settingsRef); assert.equal(settingsRef.quality, 'medium');
  s.reset();
  assert.equal(s.settings, settingsRef); assert.equal(settingsRef.quality, DEFAULT_SETTINGS.quality);
  // v1 on disk -> migrated, backed up
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: { name: 'Legacy' } }));
  const s3 = new Save();
  assert.equal(s3.notice, 'migrated'); assert.equal(s3.profile.name, 'Legacy');
  assert.ok(window.localStorage.getItem(BACKUP_KEY));
  // corrupt JSON -> fresh save + backup + notice
  window.localStorage.setItem(STORAGE_KEY, '{not json');
  const s4 = new Save();
  assert.equal(s4.notice, 'recovered'); assert.equal(s4.profile.name, 'Racer'); assert.equal(window.localStorage.getItem(BACKUP_KEY), '{not json');
  // a newer game's save is read leniently and backed up
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, profile: { name: 'Future' } }));
  const s5 = new Save();
  assert.equal(s5.notice, 'newer'); assert.equal(s5.profile.name, 'Future');
});

await ok('blocked storage -> in-memory fallback, never throws', () => {
  window.localStorage = fakeStorage({ failWrites: true });
  const s = new Save();
  assert.equal(s.persistent, false);
  s.settings.quality = 'high'; s.commit(true); s.flush();
  assert.equal(s.settings.quality, 'high');
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
  const s2 = new Save();
  assert.equal(s2.persistent, false);
  Object.defineProperty(window, 'localStorage', { value: fakeStorage(), writable: true, configurable: true });
});

await ok('quota errors drop old ghosts first and keep persisting', () => {
  const st = fakeStorage({ quota: 5000 });
  window.localStorage = st;
  const s = new Save();
  for (let i = 0; i < 6; i++) s.data.ghosts[`t${i}|pro`] = { time: 60 + i, date: i, data: { f: 'x'.repeat(1500) } };
  s.commit(true);
  assert.ok(s.persistent, 'still persistent after dropping ghosts');
  assert.ok(Object.keys(s.data.ghosts).length < 6);
});

console.log(process.exitCode ? `\nSAVE SELFTEST FAILED` : `\nSAVE SELFTEST PASSED (${n} checks)`);
