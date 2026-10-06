/**
 * Tiny synchronous pub/sub. One bus per RaceSession (session.events); the App has its own (app.events).
 * Handler lists are copy-on-write: subscribing / unsubscribing (rare) replaces the array, emitting (hot) iterates the current
 * array without copying or allocating, and a handler may safely (un)subscribe while an emit is in flight.
 */
export class EventBus {
  constructor() { this._map = new Map(); this._any = []; }
  /** Subscribe. Returns an unsubscribe function. */
  on(type, fn) {
    const cur = this._map.get(type);
    this._map.set(type, cur ? [...cur, fn] : [fn]);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }
  off(type, fn) {
    const cur = this._map.get(type);
    if (!cur) return;
    const next = cur.filter((f) => f !== fn);
    if (next.length) this._map.set(type, next); else this._map.delete(type);
  }
  /** Listen to every event: fn(type, payload). Used by the debug harness for event counters. Returns unsubscribe. */
  onAny(fn) {
    this._any = [...this._any, fn];
    return () => { this._any = this._any.filter((f) => f !== fn); };
  }
  emit(type, payload) {
    const any = this._any;
    for (let i = 0; i < any.length; i++) {
      try { any[i](type, payload); } catch (e) { console.error('[events] onAny handler threw', e); }
    }
    const list = this._map.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (e) { console.error(`[events] handler for "${type}" threw`, e); }
    }
  }
  clear() { this._map.clear(); this._any = []; }
}
