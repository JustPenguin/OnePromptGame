// Persistence: ALL player data lives in localStorage (frontend-only game). OWNER: Agent E (ui/save).
// Rules: every storage access is wrapped in try/catch (private windows, sandboxed iframes, blocked storage and quota errors
// can all throw) and the game must work identically with an in-memory fallback.  `save.persistent` says whether data
// will survive a reload.
//
//   save.data / save.settings / save.profile      live objects.  They are only ever MUTATED in place (import/reset included),
//                                                 so `app.settings` references held by other modules never go stale.
//   save.commit(immediate?)                       debounced write (250 ms); `immediate` writes now.  save.flush() = write if dirty.
//   save.reset()   save.exportCode()   save.inspectCode()/applyCode()   (see codec.js)
//   save.onChange(fn) -> off                      fired after every commit()
//
// Schema + migration notes: docs/ui.md.
import { SAVE_VERSION, STORAGE_KEY, BACKUP_KEY, defaultSave, DEFAULT_SETTINGS, SETTING_RULES, MAX_GHOSTS } from './defaults.js';
import { encodeSave, decodeSave } from './codec.js';
import { DRIVERS, KART_BODIES, SPEED_CLASSES } from '../data/roster.js';

function getStorage() {
  try {
    const s = window.localStorage;
    const k = '__kr_probe__';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ------------------------------------------------------------------------------------------------ sanitizers
export function sanitizeSettings(raw) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!isObj(raw)) return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const def = DEFAULT_SETTINGS[key];
    const v = raw[key];
    if (v === undefined) continue;
    const rule = SETTING_RULES[key];
    if (key === 'assists') {
      if (isObj(v)) for (const k of Object.keys(def)) if (typeof v[k] === 'boolean') out.assists[k] = v[k];
    } else if (key === 'bindings') {
      if (v === null) out.bindings = null;
      else if (isObj(v)) {
        const b = {};
        for (const [action, codes] of Object.entries(v)) if (Array.isArray(codes) && codes.every((c) => typeof c === 'string')) b[action] = codes.slice(0, 4);
        out.bindings = Object.keys(b).length ? b : null;
      }
    } else if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (typeof def === 'number') {
      if (Number.isFinite(v)) out[key] = rule ? Math.min(rule.max, Math.max(rule.min, v)) : v;
    } else if (typeof def === 'string') {
      if (typeof v === 'string' && (!rule?.enum || rule.enum.includes(v))) out[key] = v;
    }
  }
  return out;
}

function sanitizeProfile(raw, base) {
  const out = { ...base, versus: { ...base.versus }, seen: { ...base.seen } };
  if (!isObj(raw)) return out;
  if (typeof raw.name === 'string') out.name = raw.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || base.name;
  for (const k of ['favoriteDriver', 'favoriteKart', 'lastSpeedClass', 'lastCup', 'lastTrack']) if (typeof raw[k] === 'string' && raw[k].length < 40) out[k] = raw[k];
  if (Number.isFinite(raw.created)) out.created = raw.created;
  if (typeof raw.tutorialDone === 'boolean') out.tutorialDone = raw.tutorialDone;
  if (typeof raw.nameSet === 'boolean') out.nameSet = raw.nameSet;
  if (isObj(raw.seen)) { out.seen = { ...base.seen }; for (const k of Object.keys(base.seen)) if (typeof raw.seen[k] === 'boolean') out.seen[k] = raw.seen[k]; }
  else out.seen = { ...base.seen };
  if (isObj(raw.versus)) {
    const v = raw.versus;
    out.versus = { ...base.versus };
    if (Number.isFinite(v.laps)) out.versus.laps = Math.min(5, Math.max(1, Math.round(v.laps)));
    if (Number.isFinite(v.racers)) out.versus.racers = Math.min(12, Math.max(2, Math.round(v.racers)));
    if (typeof v.items === 'boolean') out.versus.items = v.items;
  }
  return out;
}

function sanitizeStats(raw, base) {
  const out = { ...base };
  if (isObj(raw)) for (const k of Object.keys(base)) if (Number.isFinite(raw[k]) && raw[k] >= 0) out[k] = raw[k];
  return out;
}

function sanitizeBy(by) {
  return isObj(by) ? { driverId: String(by.driverId ?? '').slice(0, 24), bodyId: String(by.bodyId ?? '').slice(0, 24) } : null;
}

function sanitizeRecords(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [tid, r] of Object.entries(raw)) {
    if (!isObj(r)) continue;
    const o = {};
    for (const kind of ['tt', 'race', 'lap']) {
      if (!isObj(r[kind])) continue;
      for (const [cls, e] of Object.entries(r[kind])) {
        if (isObj(e) && Number.isFinite(e.time) && e.time > 0) (o[kind] ??= {})[cls] = { time: e.time, laps: Number.isFinite(e.laps) ? e.laps : null, by: sanitizeBy(e.by), date: num(e.date) };
      }
    }
    if (Object.keys(o).length) out[tid] = o;
  }
  return out;
}

function sanitizeGhosts(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [key, g] of Object.entries(raw)) {
    if (isObj(g) && Number.isFinite(g.time) && g.data !== undefined && g.data !== null) out[key] = g;
  }
  return capGhosts(out);
}

/** Keep at most MAX_GHOSTS ghosts: drop the oldest. */
function capGhosts(ghosts) {
  const keys = Object.keys(ghosts);
  if (keys.length <= MAX_GHOSTS) return ghosts;
  keys.sort((a, b) => num(ghosts[b].date) - num(ghosts[a].date));
  const out = {};
  for (const k of keys.slice(0, MAX_GHOSTS)) out[k] = ghosts[k];
  return out;
}

const TROPHY_RANK = { gold: 3, silver: 2, bronze: 1 };
function sanitizeGP(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [cup, byClass] of Object.entries(raw)) {
    if (!isObj(byClass)) continue;
    for (const [cls, e] of Object.entries(byClass)) {
      if (!isObj(e)) continue;
      (out[cup] ??= {})[cls] = {
        trophy: TROPHY_RANK[e.trophy] ? e.trophy : null,
        points: num(e.points), place: Number.isFinite(e.place) ? e.place : null, completed: Math.max(0, Math.round(num(e.completed))), date: num(e.date),
      };
    }
  }
  return out;
}

function sanitizeUnlocks(raw, base) {
  const out = {};
  for (const k of Object.keys(base)) {
    const list = Array.isArray(raw?.[k]) ? raw[k].filter((x) => typeof x === 'string' && x.length < 40) : [];
    out[k] = [...new Set([...base[k], ...list])];   // the starter roster can never be locked
  }
  return out;
}

function sanitizeAchievements(raw) {
  const out = {};
  if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (Number.isFinite(v) && k.length < 40) out[k] = v;
  return out;
}

/** Normalise any blob onto the current schema (merge onto defaults, clamp, drop garbage). Pure. */
export function normalizeSave(d) {
  const base = defaultSave();
  const src = isObj(d) ? d : {};
  return {
    version: SAVE_VERSION,
    profile: sanitizeProfile(src.profile, base.profile),
    settings: sanitizeSettings(src.settings),
    records: sanitizeRecords(src.records),
    ghosts: sanitizeGhosts(src.ghosts),
    grandPrix: sanitizeGP(src.grandPrix),
    unlocks: sanitizeUnlocks(src.unlocks, base.unlocks),
    stats: sanitizeStats(src.stats, base.stats),
    achievements: sanitizeAchievements(src.achievements),
  };
}

// ------------------------------------------------------------------------------------------------ migrations
// MIGRATIONS[n] upgrades a revision-n blob to revision n+1.  Keep them pure and forgiving: stored data may be partial.
export const MIGRATIONS = {
  // v1 (the foundation baseline) -> v2: per-speed-class records, ghost keys 'trackId|class', achievements, richer stats/profile.
  1(d) {
    const records = {};
    const oldRecords = isObj(d.records) ? d.records : {};
    for (const [trackId, r] of Object.entries(oldRecords)) {
      if (!isObj(r)) continue;
      const cls = typeof r.speedClass === 'string' ? r.speedClass : 'pro';
      const e = {};
      if (Number.isFinite(r.bestTime)) e.race = { [cls]: { time: r.bestTime, laps: r.laps ?? 3, by: r.bestTimeBy ?? null, date: r.date ?? 0 } };
      if (Number.isFinite(r.bestLap)) e.lap = { [cls]: { time: r.bestLap, by: r.bestTimeBy ?? null, date: r.date ?? 0 } };
      records[trackId] = e;
    }
    d.records = records;
    const ghosts = {};
    for (const [trackId, g] of Object.entries(isObj(d.ghosts) ? d.ghosts : {})) {
      if (!isObj(g)) continue;
      // v1 ghosts carried no class: borrow it from that track's record, else assume the default class
      const cls = typeof g.speedClass === 'string' ? g.speedClass : typeof oldRecords[trackId]?.speedClass === 'string' ? oldRecords[trackId].speedClass : 'pro';
      ghosts[`${trackId}|${cls}`] = { ...g, trackId, speedClass: cls, data: g.data ?? { hz: g.hz, frames: g.frames } };
    }
    d.ghosts = ghosts;
    d.achievements = isObj(d.achievements) ? d.achievements : {};
    return d;
  },
};

export function migrateBlob(stored) {
  let d = structuredClone(isObj(stored) ? stored : {});
  let v = Number.isInteger(d.version) && d.version >= 1 ? d.version : 1;
  const from = v;
  while (v < SAVE_VERSION) { d = MIGRATIONS[v] ? MIGRATIONS[v](d) : d; v++; }
  const out = normalizeSave(d);
  out._from = from; // informational only (stripped before writing)
  return out;
}

// ------------------------------------------------------------------------------------------------ merging (import)
/** Merge `b` (imported) into a copy of `a` (current): union unlocks, best records/trophies, max stats. Settings/profile stay `a`'s. */
export function mergeSaves(a, b) {
  const out = structuredClone(a);
  const nb = normalizeSave(b);
  for (const k of Object.keys(out.unlocks)) out.unlocks[k] = [...new Set([...out.unlocks[k], ...nb.unlocks[k]])];
  for (const k of Object.keys(out.stats)) out.stats[k] = Math.max(out.stats[k], nb.stats[k]);
  for (const [tid, r] of Object.entries(nb.records)) {
    for (const kind of Object.keys(r)) for (const [cls, e] of Object.entries(r[kind])) {
      const cur = ((out.records[tid] ??= {})[kind] ??= {})[cls];
      if (!cur || e.time < cur.time) out.records[tid][kind][cls] = e;
    }
  }
  for (const [key, g] of Object.entries(nb.ghosts)) if (!out.ghosts[key] || g.time < out.ghosts[key].time) out.ghosts[key] = g;
  out.ghosts = capGhosts(out.ghosts);
  for (const [cup, byClass] of Object.entries(nb.grandPrix)) for (const [cls, e] of Object.entries(byClass)) {
    const cur = (out.grandPrix[cup] ??= {})[cls];
    if (!cur) { out.grandPrix[cup][cls] = e; continue; }
    out.grandPrix[cup][cls] = {
      trophy: (TROPHY_RANK[e.trophy] ?? 0) > (TROPHY_RANK[cur.trophy] ?? 0) ? e.trophy : cur.trophy,
      points: Math.max(cur.points, e.points), place: Math.min(cur.place ?? 99, e.place ?? 99) === 99 ? null : Math.min(cur.place ?? 99, e.place ?? 99),
      completed: Math.max(cur.completed, e.completed), date: Math.max(cur.date, e.date),
    };
  }
  for (const [id, t] of Object.entries(nb.achievements)) out.achievements[id] = Math.min(out.achievements[id] ?? Infinity, t);
  if (!out.profile.nameSet && nb.profile.nameSet) { out.profile.name = nb.profile.name; out.profile.nameSet = true; }
  return out;
}

/** Short human summary of a save blob (import preview, records header). */
export function summarizeSave(d) {
  const n = normalizeSave(d);
  let trophies = 0;
  for (const byClass of Object.values(n.grandPrix)) for (const e of Object.values(byClass)) if (e.trophy) trophies++;
  const records = Object.values(n.records).reduce((s, r) => s + Object.values(r).reduce((t, k) => t + Object.keys(k).length, 0), 0);
  return {
    name: n.profile.name, races: n.stats.races, wins: n.stats.wins, trophies, records,
    drivers: n.unlocks.drivers.length, bodies: n.unlocks.bodies.length, cups: n.unlocks.cups.length, classes: n.unlocks.speedClasses.length,
    ghosts: Object.keys(n.ghosts).length, playSeconds: n.stats.playSeconds,
    totalDrivers: DRIVERS.length, totalBodies: KART_BODIES.length, totalClasses: Object.keys(SPEED_CLASSES).length,
  };
}

// ------------------------------------------------------------------------------------------------ the store
/** Objects other modules may hold references to (app.settings etc.) are updated in place, never replaced. */
const KEEP_IDENTITY = new Set(['settings', 'profile', 'assists', 'versus', 'stats', 'seen']);
function assignInPlace(target, source) {
  for (const k of Object.keys(target)) if (!(k in source)) delete target[k];
  for (const [k, v] of Object.entries(source)) {
    if (isObj(v) && isObj(target[k]) && KEEP_IDENTITY.has(k)) assignInPlace(target[k], v);
    else target[k] = v;
  }
  return target;
}

export class Save {
  constructor() {
    this.storage = getStorage();
    this.persistent = !!this.storage;
    this.data = defaultSave();
    /** One-shot message for the UI after load ('recovered' = unreadable save moved to a backup; 'migrated'; 'newer'). */
    this.notice = null;
    this.lastError = null;
    this._timer = 0;
    this._dirty = false;
    this._listeners = new Set();
    this.load();
    if (typeof window !== 'undefined') {
      const flush = () => this.flush();
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
  }

  get settings() { return this.data.settings; }
  get profile() { return this.data.profile; }
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  load() {
    if (!this.storage) return;
    let raw = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const migrated = migrateBlob(parsed);
      const from = migrated._from;
      delete migrated._from;
      if (Number.isInteger(parsed?.version) && parsed.version > SAVE_VERSION) { this.notice = 'newer'; this._backup(raw); }
      else if (from < SAVE_VERSION) { this.notice = 'migrated'; this._backup(raw); this._dirty = true; }
      this.data = migrated;
      if (this._dirty) this.commit();
    } catch (e) {
      console.warn('[save] could not read save, starting fresh', e);
      if (raw) this._backup(raw);
      this.notice = 'recovered';
      this.data = defaultSave();
    }
  }

  _backup(raw) { try { this.storage?.setItem(BACKUP_KEY, raw); } catch { /* quota: the main save matters more */ } }

  /** Debounced write. `immediate` writes now. */
  commit(immediate = false) {
    this._dirty = true;
    for (const fn of this._listeners) { try { fn(); } catch (e) { console.warn('[save] listener failed', e); } }
    if (!this.storage) return;
    clearTimeout(this._timer);
    if (immediate) this._write();
    else this._timer = setTimeout(() => this._write(), 250);
  }

  flush() { if (this._dirty && this.storage) { clearTimeout(this._timer); this._write(); } }

  _write() {
    this._dirty = false;
    const attempt = () => this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    let err = null;
    try { attempt(); this.lastError = null; return true; } catch (e) { err = e; }
    // quota: ghosts are the bulk of the data, so shed the oldest one at a time until the write fits
    const keys = Object.keys(this.data.ghosts).sort((a, b) => num(this.data.ghosts[a].date) - num(this.data.ghosts[b].date));
    for (const k of keys) {
      delete this.data.ghosts[k];
      try { attempt(); this.lastError = null; return true; } catch (e) { err = e; }
    }
    console.warn('[save] write failed (storage blocked or full)', err);
    this.lastError = String(err?.message ?? err);
    this.persistent = false;
    return false;
  }

  /** Replace everything with `blob` (already-normalised or raw), mutating in place. */
  replaceWith(blob) {
    const n = normalizeSave(blob);
    assignInPlace(this.data, n);
    this.commit(true);
  }

  reset() { this.replaceWith(defaultSave()); }

  // ---- export / import ----
  exportCode(opts = {}) { return encodeSave(this.data, opts); }
  /** Decode + validate without applying. -> {ok, data, summary} | {ok:false, error} */
  async inspectCode(code) {
    const r = await decodeSave(code);
    if (!r.ok) return r;
    const data = normalizeSave(migrateBlob(r.data));
    delete data._from;
    return { ok: true, data, summary: summarizeSave(data) };
  }
  /** Apply a decoded save. mode: 'replace' | 'merge'. */
  applyImport(data, mode = 'replace') {
    if (mode === 'merge') this.replaceWith(mergeSaves(this.data, data));
    else this.replaceWith(data);
  }
}
