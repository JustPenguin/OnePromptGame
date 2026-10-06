// On-screen touch controls: a floating steering pad (left) + GAS / DRIFT / ITEM / BRAKE buttons (right).  OWNER: Agent E.
// Writes into `input.touch` ({active, steer, throttle, brake, drift, item, lookBack}), which Agent A's Input merges with
// keyboard/gamepad.  Multi-touch via pointer events (one pointer per control), pointer capture, and a minimum hold on taps so a
// very quick tap on ITEM is never lost between two frames.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { clamp } from '../../core/math.js';

const MIN_HOLD_MS = 90;
const BTN_LAYOUT = {
  // [size, right, bottom] in em (relative to the HUD font-size * touchScale); one set per layout mode and per accelerator mode
  manual: { gas: [6.4, 1.2, 1.4], drift: [5, 8.4, 1.8], item: [4.4, 2.2, 8.6], brake: [3.8, 9.4, 7.4] },
  auto: { drift: [6.4, 1.2, 1.4], item: [4.6, 2.2, 8.6], brake: [4, 8.8, 2] },
};

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    this.steerId = null;
    this.steer = 0;
    this.state = { gas: false, brake: false, drift: false, item: false, respawn: false };
    this.release = {};
    this.shown = false;
    this.zone = h('div', { class: 'tzone' });
    this.knob = h('div', { class: 'tknob' });
    this.base = h('div', { class: 'tbase' }, this.knob);
    this.zone.append(this.base);
    this.root = h('div', { class: 'touchc' }, this.zone);
    this.btns = {};
    const mk = (id, ico, label, cls) => {
      const el = h('div', { class: `tbtn ${cls}`, role: 'button', 'aria-label': label }, icon(ico), h('span', {}, label));
      this.btns[id] = el;
      this.root.appendChild(el);
      const down = (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } el._pid = e.pointerId; el._t = performance.now(); this.set(id, true); el.classList.add('on'); if (app.settings.vibration && (id === 'item' || id === 'drift')) navigator.vibrate?.(8); };
      const up = (e) => { if (el._pid !== undefined && e.pointerId !== el._pid) return; el._pid = undefined; el.classList.remove('on'); const held = performance.now() - (el._t ?? 0); clearTimeout(this.release[id]); this.release[id] = setTimeout(() => this.set(id, false), Math.max(0, MIN_HOLD_MS - held)); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    mk('gas', 'up', 'GAS', 't-gas'); mk('brake', 'down', 'BRAKE', 't-brake'); mk('drift', 'drift', 'DRIFT', 't-drift'); mk('item', 'bolt', 'ITEM', 't-item');
    this._bindZone();
    this.applySettings();
  }

  _bindZone() {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      if (this.steerId !== null) return;
      e.preventDefault();
      this.steerId = e.pointerId;
      try { z.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const r = z.getBoundingClientRect();
      const bs = this.base.offsetWidth || 120;
      this.ox = e.clientX;
      this.base.style.left = `${clamp(e.clientX - r.left - bs / 2, 0, r.width - bs)}px`;
      this.base.style.top = `${clamp(e.clientY - r.top - bs / 2, 0, r.height - bs)}px`;
      this.base.style.right = 'auto'; this.base.style.bottom = 'auto';
      this.ox = r.left + clamp(e.clientX - r.left - bs / 2, 0, r.width - bs) + bs / 2;
      this.base.classList.add('on');
      this._steer(e.clientX);
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === this.steerId) this._steer(e.clientX); });
    const end = (e) => {
      if (e.pointerId !== this.steerId) return;
      this.steerId = null; this.steer = 0;
      this.knob.style.transform = '';
      this.base.classList.remove('on');
      this.base.style.cssText = '';
      this.sync();
    };
    z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end);
    z.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _steer(x) {
    const bs = this.base.offsetWidth || 120;
    const r = bs * 0.5;
    const dx = clamp(x - this.ox, -r, r);
    let s = dx / r;
    s = Math.abs(s) < 0.08 ? 0 : Math.sign(s) * ((Math.abs(s) - 0.08) / 0.92);
    this.steer = Math.sign(s) * Math.pow(Math.abs(s), 1.15);
    this.knob.style.transform = `translateX(${dx}px)`;
    this.sync();
  }

  set(id, v) { this.state[id] = v; this.sync(); }

  /** Hold-to-respawn (button lives in the HUD's top-right cluster; Agent A's Input reads input.touch.respawn). */
  setRespawn(on) { this.state.respawn = !!on; this.sync(); }

  /** Push the current state into input.touch. */
  sync() {
    const t = this.input.touch;
    const s = this.state;
    t.steer = this.steer;
    t.throttle = s.gas ? 1 : 0;
    t.brake = s.brake ? 1 : 0;
    t.drift = !!s.drift; t.item = !!s.item; t.lookBack = false; t.respawn = !!s.respawn;
    t.active = this.shown && (this.steerId !== null || s.gas || s.brake || s.drift || s.item || s.respawn);
  }

  applySettings() {
    const st = this.app.settings;
    const auto = !!st.assists?.autoAccelerate;
    const lay = auto ? BTN_LAYOUT.auto : BTN_LAYOUT.manual;
    const compact = document.getElementById('ui-root')?.classList.contains('l-compact');
    this.root.style.setProperty('--tsz', String((st.touchScale ?? 1) * (compact ? 0.86 : 1)));   // font-size comes from hudCss (.touchc), which also shrinks the pad + buttons to fit narrow screens
    for (const [id, el] of Object.entries(this.btns)) {
      const l = lay[id];
      el.style.display = l ? '' : 'none';
      if (l) { el.style.width = el.style.height = `${l[0]}em`; el.style.right = `${l[1]}em`; el.style.bottom = `${l[2]}em`; }
    }
  }

  /** Called by the HUD whenever visibility may change. */
  setShown(on) {
    on = !!on;
    if (this.shown === on) return;
    this.shown = on;
    this.root.style.display = on ? 'block' : 'none';
    if (!on) { this.steerId = null; this.steer = 0; Object.keys(this.state).forEach((k) => { this.state[k] = false; }); this.base.style.cssText = ''; this.knob.style.transform = ''; }
    this.sync();
  }

  destroy() {
    this.shown = false;
    Object.values(this.release).forEach(clearTimeout);
    const t = this.input.touch;
    t.active = false; t.steer = 0; t.throttle = 0; t.brake = 0; t.drift = false; t.item = false; t.lookBack = false; t.respawn = false;
  }
}
