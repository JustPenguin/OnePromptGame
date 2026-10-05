// Menu navigation: ONE focus model for keyboard, gamepad, mouse and touch.  OWNER: Agent E.
//
// Every interactive element carries `data-nav` (and is a real <button>/<input> so assistive tech works).  The nav keeps a
// stack of *scopes* (a screen, then a modal on top of it); only elements inside the top scope can be focused, so a modal
// traps focus and Esc/B closes the modal first.  Visuals use `.is-focus` (set here) so mouse-hover, d-pad and Tab all look
// identical.  Elements may define `el._adjust(dir)` (sliders / segmented controls consume left/right).
//
// The race Input class (Agent A) polls gamepads only while racing, so menus read the pad here.  Keys are captured in the
// capture phase and swallowed when handled so a menu keypress never leaks into the game's Input.
import { clamp } from '../core/math.js';

const MOVE_KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
const isTyping = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
const rectOf = (el) => el.getBoundingClientRect();

export class Nav {
  /** @param {import('./UI.js').UI} ui */
  constructor(ui) {
    this.ui = ui;
    this.scopes = [];
    this.focused = null;
    this.device = 'mouse';
    this.capturing = false;           // true while the rebinding screen waits for a key (Input swallows it)
    this._padPrev = [];
    this._rep = { dir: null, next: 0 };
    this._onKey = (e) => this._keydown(e);
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('pointermove', (e) => this._pointerMove(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this._pointerDown(e), { passive: true, capture: true });
    this.root = ui.root;
    this.root.addEventListener('focusin', (e) => this._focusIn(e));
  }

  get scope() { return this.scopes[this.scopes.length - 1] ?? null; }
  get active() { return this.scopes.length > 0; }

  /** Register a screen/modal root as the new top scope. opts: { onBack, onTab, onAction, wrap, autofocus } */
  push(root, opts = {}) {
    const prevTop = this.scope;
    if (prevTop && this.focused) prevTop.last = this.focused;
    const scope = { root, onBack: opts.onBack, onTab: opts.onTab, onAction: opts.onAction, onStart: opts.onStart, wrap: opts.wrap !== false, last: null, backKeys: opts.backKeys ?? null };
    this.scopes.push(scope);
    if (opts.autofocus !== false) requestAnimationFrame(() => { if (this.scope === scope) this.autofocus(scope); });
    return scope;
  }

  remove(scope) {
    const i = this.scopes.indexOf(scope);
    if (i < 0) return;
    const wasTop = i === this.scopes.length - 1;
    this.scopes.splice(i, 1);
    if (wasTop) {
      this.focused = null;
      const top = this.scope;
      if (top) requestAnimationFrame(() => { if (this.scope === top) this.autofocus(top); });
    }
  }

  navigables(scope = this.scope) {
    if (!scope) return [];
    return [...scope.root.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0 && !el.closest('[inert]'));
  }

  autofocus(scope = this.scope) {
    if (!scope) return;
    const list = this.navigables(scope);
    if (!list.length) return;
    let target = scope.last && list.includes(scope.last) ? scope.last : null;
    target ??= list.find((el) => el.hasAttribute('data-default')) ?? list[0];
    this.setFocus(target, { silent: true, scroll: true });
  }

  /** Move focus to `el` (must be inside the current scope). */
  setFocus(el, { silent = false, scroll = true } = {}) {
    if (!el) return;
    if (this.focused === el) { if (document.activeElement !== el) try { el.focus({ preventScroll: true }); } catch { /* detached */ } return; }
    const from = this.focused;
    this.focused?.classList.remove('is-focus');
    this.focused = el;
    el.classList.add('is-focus');
    if (this.scope) this.scope.last = el;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (scroll) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ } }
    if (!silent) this.ui.sfx('hover');
    el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true, detail: { from } }));
  }

  _focusIn(e) {
    const el = e.target.closest?.('[data-nav]');
    if (!el || !this.scope || !this.scope.root.contains(el)) return;
    if (this.focused !== el) { this.focused?.classList.remove('is-focus'); this.focused = el; el.classList.add('is-focus'); this.scope.last = el; el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true })); }
  }

  _setDevice(d) { if (this.device !== d) { this.device = d; this.ui.onDeviceChange?.(d); } }

  _pointerMove(e) {
    if (e.pointerType !== 'mouse') return;
    this._setDevice('mouse');
    const scope = this.scope; if (!scope) return;
    const el = e.target?.closest?.('[data-nav]');
    if (el && scope.root.contains(el) && el !== this.focused && !el.disabled && !el.closest('[inert]')) this.setFocus(el, { scroll: false });
  }
  _pointerDown(e) { this._setDevice(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse'); }

  // ------------------------------------------------------------------------------------------ actions
  move(dir) {
    const scope = this.scope; if (!scope) return false;
    const cur = this.focused && scope.root.contains(this.focused) ? this.focused : null;
    if (!cur) { this.autofocus(scope); return true; }
    if ((dir === 'left' || dir === 'right') && cur._adjust?.(dir === 'left' ? -1 : 1)) return true;
    // a focused scroll area (data-scroll) scrolls with Up/Down until it hits its end, then focus moves on
    if (cur.hasAttribute('data-scroll') && (dir === 'up' || dir === 'down')) {
      const before = cur.scrollTop;
      cur.scrollTop += (dir === 'down' ? 1 : -1) * Math.max(60, cur.clientHeight * 0.3);
      if (cur.scrollTop !== before) return true;
    }
    const list = this.navigables(scope);
    const next = this._pick(cur, dir, list) ?? (scope.wrap ? this._wrap(cur, dir, list) : null);
    if (next && next !== cur) { this.setFocus(next); return true; }
    return false;
  }

  _pick(from, dir, list) {
    const r = rectOf(from);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const q = rectOf(el);
      const dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      let along, across;
      if (dir === 'right') { along = dx; across = Math.abs(dy); } else if (dir === 'left') { along = -dx; across = Math.abs(dy); }
      else if (dir === 'down') { along = dy; across = Math.abs(dx); } else { along = -dy; across = Math.abs(dx); }
      if (along < 2) continue;                     // must be in that direction
      // Horizontal moves use a tight cone (a row wraps instead of jumping to a button above it). Vertical moves have NO cone:
      // "down" from a tab strip must reach the first row even when it is far to one side; nearest row wins, same column breaks ties.
      const horizontal = dir === 'left' || dir === 'right';
      if (horizontal && across > along * 0.9 + 16) continue;
      const score = along + across * (horizontal ? 2.6 : 1.4);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  /** No neighbour in that direction: wrap around to the far side of the list (feels right for menus). */
  _wrap(from, dir, list) {
    const r = rectOf(from);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const q = rectOf(el);
      const x = q.left + q.width / 2, y = q.top + q.height / 2;
      let primary, across;
      if (dir === 'down') { primary = y; across = Math.abs(x - cx); } else if (dir === 'up') { primary = -y; across = Math.abs(x - cx); }
      else if (dir === 'right') { primary = x; across = Math.abs(y - cy); } else { primary = -x; across = Math.abs(y - cy); }
      const score = primary + across * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  activate() {
    const el = this.focused;
    if (!el || !this.scope?.root.contains(el)) return false;
    if (el.getAttribute('aria-disabled') === 'true' && !el.hasAttribute('data-clickable-disabled')) { el.dispatchEvent(new CustomEvent('navdenied')); this.ui.sfx('error'); return true; }
    el.click();
    return true;
  }

  back() {
    const scope = this.scope; if (!scope) return false;
    if (scope.onBack) { scope.onBack(); return true; }
    return false;
  }

  tab(dir) { return this.scope?.onTab?.(dir) ?? false; }

  // ------------------------------------------------------------------------------------------ keyboard
  _keydown(e) {
    if (this.capturing) return;                    // rebinding: Input.captureNextKey owns this key
    const scope = this.scope;
    if (!scope) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = isTyping(e.target);
    const code = e.code;
    this._setDevice('keyboard');
    let handled = false;
    // inside a text field: Esc / Enter finish editing (never leave the screen); only Up/Down move on
    if (typing && (code === 'Escape' || ((code === 'Enter' || code === 'NumpadEnter') && e.target.tagName !== 'TEXTAREA'))) {
      e.target.blur?.();
      if (this.focused && this.scope?.root.contains(this.focused)) { try { this.focused.focus({ preventScroll: true }); } catch { /* ignore */ } }
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if (MOVE_KEYS[code] && !(typing && (code.startsWith('Key') || code === 'ArrowLeft' || code === 'ArrowRight'))) {
      this.move(MOVE_KEYS[code]);
      handled = true;   // arrows at a list end still count as handled so the page never scrolls and the game never sees them
    } else if ((code === 'Enter' || code === 'NumpadEnter' || (code === 'Space' && !typing)) && !(typing && e.target.tagName === 'TEXTAREA')) {
      if (!e.repeat) handled = this.activate();
      else handled = true;
    } else if (code === 'Escape' || (code === 'Backspace' && !typing) || (scope.backKeys && scope.backKeys.includes(code))) {
      if (!e.repeat) handled = this.back();
      else handled = true;
    } else if (!typing && (code === 'KeyQ' || code === 'PageUp')) handled = this.tab(-1);
    else if (!typing && (code === 'KeyE' || code === 'PageDown')) handled = this.tab(1);
    else if (!typing && (code === 'KeyX' || code === 'KeyF')) handled = !!scope.onAction?.('x');
    else if (!typing && code === 'KeyR') handled = !!scope.onAction?.('y');
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  // ------------------------------------------------------------------------------------------ gamepad
  pollGamepad(dt, now = performance.now() / 1000) {
    let pad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) { pad = p; break; }
    } catch { return; }
    if (!pad) { this._padPrev = []; return; }
    const btn = (i) => !!pad.buttons[i]?.pressed;
    const prev = this._padPrev;
    const edge = (i) => btn(i) && !prev[i];
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    let dir = null;
    if (btn(12)) dir = 'up'; else if (btn(13)) dir = 'down'; else if (btn(14)) dir = 'left'; else if (btn(15)) dir = 'right';
    else if (Math.hypot(ax, ay) > 0.6) dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
    const anyBtn = pad.buttons.some((b) => b?.pressed);
    if (anyBtn || dir) this._setDevice('gamepad');
    if (this.scope) {
      if (dir) {
        if (this._rep.dir !== dir) { this._rep.dir = dir; this._rep.next = now + 0.38; this.move(dir); }
        else if (now >= this._rep.next) { this._rep.next = now + 0.1; this.move(dir); }
      } else this._rep.dir = null;
      if (edge(0)) this.activate();
      if (edge(1)) this.back();
      if (edge(9)) { if (this.scope.onStart) this.scope.onStart(); else this.activate(); }
      if (edge(2)) this.scope.onAction?.('x');
      if (edge(3)) this.scope.onAction?.('y');
      if (edge(4)) this.tab(-1);
      if (edge(5)) this.tab(1);
    }
    this._padPrev = pad.buttons.map((b) => !!b?.pressed);
  }

  dispose() { window.removeEventListener('keydown', this._onKey, true); }
}

export { clamp };
