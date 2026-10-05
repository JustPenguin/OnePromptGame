// UI manager: layers, layout/scale, screen stack + transitions, modals, toasts, hint bar, HUD mount.  OWNER: Agent E.
// Plain DOM + CSS over the WebGL canvas.  docs/ui.md has the screen map and state machine.
//
//   ui.reset(id, params)   show a screen with an empty history (title / main menu)
//   ui.push(id, params)    forward (slides in; Back returns here)       ui.back()   pop the history
//   ui.replace(id, params) swap the current screen without growing the history
//   ui.clearScreens()      remove every screen (race starts)           ui.confirm({...}) / ui.modal({...}) -> Promise
//   ui.toast({...})        ui.wipe(fn)  diagonal chequered transition   ui.sfx(name)
//   ui.showHud(session) / ui.hideHud() / ui.update(dt, session)         HUD lives in ./hud/
import { h, clear, afterLayout, wait } from './dom.js';
import { clamp } from '../core/math.js';
import { baseCss } from './css/base.js';
import { headerCss } from './components.js';
import { Nav } from './nav.js';
import { renderHints } from './hints.js';
import { showModal, confirmModal } from './modal.js';
import { Toasts } from './toasts.js';
import { SCREENS, SCREEN_CSS } from './screens/index.js';
import { Hud } from './hud/Hud.js';
import { hudCss } from './hud/hudCss.js';

export class UI {
  constructor(app) {
    this.app = app;
    this.root = app.uiRoot;
    this.hud = null;
    this.screen = null;
    this.current = null;
    this.stack = [];
    this.device = 'mouse';
    this.layout = { w: 1280, h: 720, mode: 'wide', scale: 1 };

    const style = document.createElement('style');
    style.id = 'kr-ui-css';
    style.textContent = [baseCss, headerCss, ...SCREEN_CSS, hudCss].join('\n');
    document.head.appendChild(style);

    this.layers = {};
    for (const name of ['hud', 'screens', 'modal', 'toast', 'wipe', 'error']) {
      const el = h('div', { class: `layer layer-${name}` });
      this.layers[name] = el;
      this.root.appendChild(el);
    }
    this.hintbar = h('div', { class: 'hintbar hidden', 'aria-hidden': 'true' });
    this.layers.screens.appendChild(this.hintbar);
    this.toasts = new Toasts(this.layers.toast);
    this.nav = new Nav(this);

    this.applyPrefs();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    // every interactive element names its sound with data-sfx; one delegated listener plays it (capture: runs even if a handler stops the event)
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest?.('[data-sfx]');
      if (!el) return;
      this.sfx(el.getAttribute('aria-disabled') === 'true' ? 'error' : el.dataset.sfx);
    }, true);
    // browsers only allow audio after a gesture: unlock on the very first one, wherever it happens
    const unlock = () => { this.app.audio?.unlock?.(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  // ------------------------------------------------------------------------------------------------ prefs / layout
  /** Apply accessibility + display preferences from settings. Call after every settings change. */
  applyPrefs() {
    const s = this.app.settings;
    const osRm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rm = !!s.reducedMotion || osRm;
    this.reducedMotion = rm;
    document.documentElement.toggleAttribute('data-rm', rm);
    this.root.classList.toggle('noflash', !!s.reduceFlashes);
    this.root.classList.toggle('hc', !!s.highContrastHud);
    this.root.classList.toggle('lg', !!s.largeText);
    document.documentElement.style.setProperty('--hud-scale', String(clamp(s.hudScale ?? 1, 0.7, 1.4)));
    this.resize();
  }

  resize() {
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    let mode = 'wide', scale;
    if (h > w * 1.12) { mode = 'portrait'; scale = clamp(w / 390, 0.85, 1.5); }
    else if (h < 520) { mode = 'compact'; scale = clamp(h / 390, 0.8, 1.15); }
    else scale = clamp(Math.min(w / 1280, h / 720), 0.72, 1.9);
    if (this.app.settings?.largeText) scale *= 1.14;
    this.layout = { w, h, mode, scale };
    document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
    for (const m of ['wide', 'portrait', 'compact']) this.root.classList.toggle(`l-${m}`, m === mode);
    this.screen?.onResize?.();
    this._applyStage();
    this.hud?.onResize?.();
  }

  onDeviceChange(d) {
    this.device = d;
    this.root.dataset.device = d;
    this._updateHints();
    this.screen?.onDevice?.(d);
    this.hud?.onDevice?.(d);
  }

  sfx(name) { try { this.app.audio?.ui?.(name); } catch { /* audio is optional */ } }

  // ------------------------------------------------------------------------------------------------ screens
  _make(id, params) {
    const Cls = SCREENS[id];
    if (!Cls) throw new Error(`Unknown screen "${id}"`);
    return new Cls(this, params);
  }

  /** Show `id`; dir: 'fwd' | 'back' | 'fade'. */
  go(id, params = {}, { dir = 'fwd', push = true } = {}) {
    const prev = this.screen;
    if (push && this.current) this.stack.push(this.current);
    this.current = { id, params };
    const screen = this._make(id, params);
    const el = screen.build();
    el.classList.add('screen', `s-${id}`, `in-${dir}`);
    if (prev) this._retire(prev, dir === 'fwd' ? 'out-fwd' : dir === 'back' ? 'out-back' : 'out-fade');
    this.layers.screens.insertBefore(el, this.hintbar);
    screen.root = el;
    screen._scope = this.nav.push(el, screen.navOptions());
    this.screen = screen;
    this._applyStage();
    this._updateHints();
    afterLayout(() => { el.classList.remove(`in-${dir}`); });
    screen.onShow();
    return screen;
  }

  _retire(screen, cls) {
    try { screen.onHide(); } catch (e) { console.error(e); }
    if (screen._scope) this.nav.remove(screen._scope);
    const el = screen.root;
    el.classList.add(cls);
    el.setAttribute('inert', '');
    setTimeout(() => { try { screen.destroy(); } catch (e) { console.error(e); } el.remove(); }, 300);
  }

  push(id, params) { return this.go(id, params, { dir: 'fwd' }); }
  replace(id, params, dir = 'fade') { return this.go(id, params, { dir, push: false }); }
  reset(id, params, dir = 'fade') { this.stack = []; this.current = null; return this.go(id, params, { dir, push: false }); }

  back() {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.go(prev.id, prev.params, { dir: 'back', push: false });
    this.sfx('back');
    return true;
  }

  /** Pop back to the nearest history entry with this id (or reset to it). */
  backTo(id, fallbackParams) {
    let found = -1;
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].id === id) { found = i; break; }
    if (found < 0) return this.reset(id, fallbackParams, 'back');
    const target = this.stack[found];
    this.stack.length = found;
    return this.go(target.id, target.params, { dir: 'back', push: false });
  }

  clearScreens() {
    if (this.screen) this._retire(this.screen, 'out-fade');
    this.screen = null; this.current = null; this.stack = [];
    this._updateHints();
  }

  get currentId() { return this.current?.id ?? null; }

  /** Tell the 3D backdrop what this screen needs. */
  _applyStage() {
    const m = this.app.menuScene;
    if (!m) return;
    const st = this.screen?.stage;
    if (!st) return;
    m.setPreset(st.preset ?? 'select');
    m.setKartVisible(st.kart !== false);
    const comp = typeof st.comp === 'function' ? st.comp(this.layout) : st.comp ?? { x: 0, y: 0 };
    m.setComposition(comp);
    m.setTheme(st.theme ?? null);
  }

  _updateHints() {
    const items = this.screen && !this.modalOpen ? this.screen.hints() : null;
    renderHints(this.hintbar, items, this.device);
  }

  // ------------------------------------------------------------------------------------------------ overlays
  modal(def) { this.modalOpen = true; this._updateHints(); return showModal(this, def).finally(() => { this.modalOpen = false; this._updateHints(); }); }
  confirm(def) { this.modalOpen = true; this._updateHints(); return confirmModal(this, def).finally(() => { this.modalOpen = false; this._updateHints(); }); }
  toast(o) { return this.toasts.show(o); }

  /** Diagonal chequered wipe: covers the screen, runs fn (swap scenes) while covered, then reveals. */
  async wipe(fn, { hold = 120 } = {}) {
    if (this.reducedMotion) { await fn?.(); return; }
    const el = h('div', { class: 'wipe cover' }, Array.from({ length: 12 }, (_, n) => h('i', { style: { '--n': n } })));
    this.layers.wipe.appendChild(el);
    await wait(380 + 12 * 28);
    try { await fn?.(); } finally {
      await wait(hold);
      el.className = 'wipe reveal';
      await wait(420 + 12 * 24);
      el.remove();
    }
  }

  // ------------------------------------------------------------------------------------------------ HUD
  showHud(session) {
    this.hideHud();
    this.hud = new Hud(this, session);
    this.layers.hud.appendChild(this.hud.root);
    this.hud.root.classList.toggle('touch', this.device === 'touch');
    return this.hud;
  }
  hideHud() { if (this.hud) { this.hud.destroy(); this.hud.root.remove(); this.hud = null; } }

  // ------------------------------------------------------------------------------------------------ frame
  update(dt, session, snap = false) {
    this.nav.pollGamepad(dt);
    this.screen?.update(dt);
    if (this.hud && session) this.hud.update(dt, session, snap);
  }

  // ------------------------------------------------------------------------------------------------ app-facing helpers
  showTitle() { this.hideHud(); this.reset('title'); }
  showMenu() { this.hideHud(); this.reset('menu'); }

  showFatal(error, { canReload = true } = {}) {
    clear(this.layers.error);
    const msg = String(error?.message ?? error ?? 'Unknown error');
    const stack = String(error?.stack ?? '').split('\n').slice(0, 6).join('\n');
    this.layers.error.append(h('div', { class: 'fatal' }, h('div', { class: 'panel' },
      h('div', { class: 'kicker' }, 'Pit stop'),
      h('h1', { class: 'h1', style: { fontSize: '2rem', margin: '.2rem 0 .6rem' } }, 'Something went wrong'),
      h('p', { style: { margin: 0, color: '#dfe6ff' } }, 'The game hit an unexpected problem. Your saved progress is safe. You can head back to the menu, or reload the page.'),
      h('pre', {}, msg + (stack ? '\n' + stack : '')),
      h('div', { class: 'row-gap', style: { marginTop: '1.1rem', justifyContent: 'flex-end', gap: '1.1rem' } },
        h('button', { class: 'btn glass', type: 'button', onClick: () => { clear(this.layers.error); this.app.quitToMenu(); } }, h('span', { class: 'in' }, 'Back to menu')),
        canReload ? h('button', { class: 'btn', type: 'button', onClick: () => location.reload() }, h('span', { class: 'in' }, 'Reload')) : null))));
  }
}
