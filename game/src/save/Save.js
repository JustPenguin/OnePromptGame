// Persistence: ALL player data lives in localStorage (frontend-only game). OWNER: Agent E (ui/save).
// Rules: every storage access is wrapped in try/catch (private windows, blocked storage, previews can throw) and the
// game must work identically with an in-memory fallback.  `save.persistent` says whether data will survive a reload.
import { SAVE_VERSION, STORAGE_KEY, defaultSave, DEFAULT_SETTINGS } from './defaults.js';

function getStorage() {
  try {
    const s = window.localStorage;
    const k = '__kr_probe__';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }
}

export class Save {
  constructor() {
    this.storage = getStorage();
    this.persistent = !!this.storage;
    this.data = defaultSave();
    this._timer = 0;
    this.load();
  }

  get settings() { return this.data.settings; }
  get profile() { return this.data.profile; }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.data = this.migrate(parsed);
    } catch (e) {
      console.warn('[save] could not read save, starting fresh', e);
      this.data = defaultSave();
    }
  }

  /** Merge a stored blob onto fresh defaults so new fields always exist. */
  migrate(stored) {
    const base = defaultSave();
    const out = { ...base, ...stored, version: SAVE_VERSION };
    out.settings = { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}), assists: { ...DEFAULT_SETTINGS.assists, ...(stored.settings?.assists ?? {}) } };
    out.profile = { ...base.profile, ...(stored.profile ?? {}) };
    out.unlocks = { ...base.unlocks, ...(stored.unlocks ?? {}) };
    out.stats = { ...base.stats, ...(stored.stats ?? {}) };
    return out;
  }

  /** Debounced write. */
  commit(immediate = false) {
    if (!this.storage) return;
    const write = () => {
      try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
      catch (e) { console.warn('[save] write failed (quota?)', e); this.persistent = false; }
    };
    if (immediate) { clearTimeout(this._timer); write(); return; }
    clearTimeout(this._timer);
    this._timer = setTimeout(write, 250);
  }

  reset() { this.data = defaultSave(); this.commit(true); }
}
