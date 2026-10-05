/** Tiny synchronous pub/sub. One bus per RaceSession (session.events); the App has its own (app.events). */
export class EventBus {
  constructor() { this._map = new Map(); }
  /** Subscribe. Returns an unsubscribe function. */
  on(type, fn) {
    let set = this._map.get(type);
    if (!set) this._map.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  once(type, fn) {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }
  off(type, fn) { this._map.get(type)?.delete(fn); }
  /** Listen to every event: fn(type, payload). Used by the debug harness for event counters. Returns unsubscribe. */
  onAny(fn) { (this._any ??= new Set()).add(fn); return () => this._any.delete(fn); }
  emit(type, payload) {
    if (this._any && this._any.size) for (const fn of this._any) { try { fn(type, payload); } catch (e) { console.error('[events] onAny handler threw', e); } }
    const set = this._map.get(type);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[events] handler for "${type}" threw`, e); }
    }
  }
  clear() { this._map.clear(); this._any?.clear(); }
}
