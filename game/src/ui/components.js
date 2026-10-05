// Reusable UI building blocks. OWNER: Agent E.  Every interactive component is a real <button>/<input>/role element
// carrying `data-nav` so Nav can drive it from keyboard / gamepad / mouse / touch.
import { h, cx } from './dom.js';
import { icon } from './icons.js';
import { clamp } from '../core/math.js';
import { getDriverPortrait } from '../vehicles/portraits.js';

/** Game button. opts: {label, icon, variant, size, onClick, sfx, id, disabled, block, def} */
export function button(o) {
  const el = h('button', {
    type: 'button', class: cx('btn', o.variant, o.size, o.block && 'block', o.cls), 'data-nav': '', 'data-sfx': o.sfx ?? 'click', id: o.id,
    'aria-label': o.aria ?? (typeof o.label === 'string' ? o.label : null), 'aria-disabled': o.disabled ? 'true' : null,
  }, h('span', { class: 'in' }, o.icon ? icon(o.icon) : null, o.label != null ? h('span', { class: 'bl' }, o.label) : null));
  if (o.def) el.setAttribute('data-default', '');
  if (o.onClick) el.addEventListener('click', (e) => { if (el.getAttribute('aria-disabled') === 'true') return; o.onClick(e); });
  return el;
}

export function iconButton(o) {
  const el = h('button', { type: 'button', class: cx('icon-btn', o.cls), 'data-nav': '', 'data-sfx': o.sfx ?? 'click', 'aria-label': o.title, title: o.title, id: o.id }, icon(o.icon));
  if (o.onClick) el.addEventListener('click', o.onClick);
  return el;
}

export const STAT_KEYS = ['speed', 'accel', 'handling', 'weight', 'drift'];
const STAT_LABELS = { speed: 'Speed', accel: 'Accel', handling: 'Handling', weight: 'Weight', drift: 'Drift' };
const fmtStat = (v) => (Math.round(v * 2) / 2).toFixed(1).replace(/\.0$/, '');

/** Five animated segmented bars (supports half values). set(stats, baseStats?) shows +/- deltas vs the base. */
export function statBars() {
  const rows = {};
  const el = h('div', { class: 'stats', style: { display: 'grid', gap: '.4rem' } });
  for (const k of STAT_KEYS) {
    const segs = [0, 1, 2, 3, 4].map((j) => h('i', { style: { '--k': j } }));
    const val = h('span', { class: 'val' });
    const delta = h('span', { class: 'delta' });
    val.append(delta);
    const row = h('div', { class: `stat ${k}` }, h('span', {}, STAT_LABELS[k]), h('div', { class: 'seg5' }, segs), val);
    rows[k] = { segs, val, delta, text: document.createTextNode('') };
    val.insertBefore(rows[k].text, delta);
    el.append(row);
  }
  return {
    el,
    set(stats, base = null) {
      for (const k of STAT_KEYS) {
        const v = clamp(stats[k] ?? 0, 0, 5);
        const r = rows[k];
        r.segs.forEach((s, j) => s.style.setProperty('--f', clamp(v - j, 0, 1).toFixed(2)));
        r.text.nodeValue = fmtStat(v);
        const d = base ? v - (base[k] ?? v) : 0;
        r.delta.textContent = Math.abs(d) < 0.01 ? '' : (d > 0 ? '+' : '') + fmtStat(d).replace(/^-0$/, '0');
        r.delta.className = 'delta ' + (d > 0.01 ? 'up' : d < -0.01 ? 'down' : '');
      }
    },
  };
}

/** A copy of the (cached, possibly shared) portrait canvas that can live in the DOM. */
export function portrait(driverId, size = 96, cls = '') {
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  c.className = 'portrait ' + cls;
  c.style.setProperty('--ps', size + 'px');   // default size; screen CSS can override width/height per layout
  try {
    const src = getDriverPortrait(driverId, Math.max(96, px));
    c.getContext('2d').drawImage(src, 0, 0, px, px);
  } catch { /* portraits are decoration; never fail a screen because of one */ }
  return c;
}

/** Copy any canvas (item icons etc.) into a fresh element. */
export function cloneCanvas(src, cssSize) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  if (cssSize) { c.style.width = c.style.height = cssSize; }
  return c;
}

// ------------------------------------------------------------------------------------------------ settings-style rows
/**
 * A nav-stop row: label + description on the left, a control on the right.
 * `ctl` = { el, adjust(dir)->bool, activate()->void }
 */
export function row(label, desc, ctl, o = {}) {
  const el = h('div', { class: cx('row', o.cls), 'data-nav': '', role: 'group', tabindex: 0, 'aria-label': label },
    h('div', { class: 'lt' }, h('div', { class: 'lbl' }, label), desc ? h('div', { class: 'desc' }, desc) : null),
    h('div', { class: 'ctl' }, ctl.el));
  el._adjust = (dir) => ctl.adjust?.(dir) ?? false;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.slider, .seg button, .stepper button, .toggle, .keybtn, .btn')) return; // those handle themselves
    ctl.activate?.();
  });
  el._ctl = ctl;
  return el;
}

export function toggleCtl(value, onChange) {
  let v = !!value;
  const el = h('button', { type: 'button', class: 'toggle', role: 'switch', 'aria-checked': String(v), tabindex: -1 });
  const set = (nv, user = true) => { v = nv; el.setAttribute('aria-checked', String(v)); if (user) onChange?.(v); };
  el.addEventListener('click', () => { set(!v); });
  return { el, adjust(dir) { if ((dir > 0) === v) return true; set(dir > 0); return true; }, activate() { set(!v); }, set: (nv) => set(nv, false), get value() { return v; } };
}

export function sliderCtl({ min = 0, max = 1, step = 0.05, value = 0, format = (v) => `${Math.round(v * 100)}%`, onChange }) {
  let v = clamp(value, min, max);
  const fill = h('div', { class: 'fill' });
  const knob = h('div', { class: 'knob' });
  const el = h('div', { class: 'slider', role: 'slider', tabindex: -1, 'aria-valuemin': min, 'aria-valuemax': max }, h('div', { class: 'trk' }, fill), knob);
  const val = h('div', { class: 'sval' });
  const wrap = h('div', { style: { display: 'flex', alignItems: 'center', gap: '.8rem', width: '100%' } }, el, val);
  const render = () => { const f = (v - min) / (max - min); el.style.setProperty('--v', f.toFixed(4)); el.setAttribute('aria-valuenow', String(v)); val.textContent = format(v); };
  const snap = (x) => clamp(Math.round(x / step) * step, min, max);
  const set = (nv, user = true) => { const s = +snap(nv).toFixed(4); if (s === v) return; v = s; render(); if (user) onChange?.(v); };
  const fromPointer = (e) => { const r = el.getBoundingClientRect(); set(min + clamp((e.clientX - r.left) / r.width, 0, 1) * (max - min)); };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); fromPointer(e); const mv = (ev) => fromPointer(ev); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); });
  render();
  return { el: wrap, adjust(dir) { set(v + dir * step); return true; }, activate() {}, set: (nv) => { v = clamp(nv, min, max); render(); }, get value() { return v; } };
}

/**
 * Segmented control. options: [{value, label, disabled?, hint?}]  - disabled options show a lock and call onDenied(option) when picked.
 */
export function segmentedCtl(options, value, onChange, onDenied) {
  let v = value;
  const btns = options.map((o) => h('button', { type: 'button', role: 'radio', tabindex: -1, 'aria-checked': String(o.value === v), 'aria-disabled': o.disabled ? 'true' : null, 'data-v': o.value, style: o.disabled ? { opacity: '.55' } : null }, o.disabled ? icon('lock') : null, o.label));
  const el = h('div', { class: 'seg', role: 'radiogroup' }, btns);
  const refresh = () => btns.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === v)));
  const set = (nv, user = true) => { if (nv === v) return; v = nv; refresh(); if (user) onChange?.(v); };
  const pick = (o) => { if (o.disabled) { onDenied?.(o); return false; } set(o.value); return true; };
  btns.forEach((b, i) => b.addEventListener('click', () => pick(options[i])));
  const idx = () => Math.max(0, options.findIndex((o) => o.value === v));
  return {
    el,
    adjust(dir) { const i = clamp(idx() + dir, 0, options.length - 1); if (i !== idx()) pick(options[i]); return true; },
    activate() { for (let k = 1; k <= options.length; k++) { const o = options[(idx() + k) % options.length]; if (!o.disabled) { set(o.value); return; } } },
    set: (nv) => set(nv, false), get value() { return v; },
  };
}

export function stepperCtl({ min = 1, max = 5, value = 1, step = 1, format = (v) => String(v), onChange }) {
  let v = clamp(value, min, max);
  const sv = h('span', { class: 'sv' });
  const dec = h('button', { type: 'button', tabindex: -1, 'aria-label': 'Decrease' }, icon('minus'));
  const inc = h('button', { type: 'button', tabindex: -1, 'aria-label': 'Increase' }, icon('plus'));
  const el = h('div', { class: 'stepper' }, dec, sv, inc);
  const render = () => { sv.textContent = format(v); dec.style.opacity = v <= min ? '.35' : '1'; inc.style.opacity = v >= max ? '.35' : '1'; };
  const set = (nv, user = true) => { const c = clamp(nv, min, max); if (c === v) return; v = c; render(); if (user) onChange?.(v); };
  dec.addEventListener('click', () => set(v - step)); inc.addEventListener('click', () => set(v + step));
  render();
  return { el, adjust(dir) { set(v + dir * step); return true; }, activate() { set(v >= max ? min : v + step); }, set: (nv) => { v = clamp(nv, min, max); render(); }, get value() { return v; } };
}

// ------------------------------------------------------------------------------------------------ key / pad glyphs
const KEY_NAMES = {
  ArrowUp: ['ico', 'up'], ArrowDown: ['ico', 'down'], ArrowLeft: ['ico', 'left'], ArrowRight: ['ico', 'right'],
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Backspace: 'Back', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt', CapsLock: 'Caps', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};
export function keyLabel(code) {
  const n = KEY_NAMES[code];
  if (n) return n;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num' + code.slice(6);
  if (/^F\d+$/.test(code)) return code;
  return code;
}
/** A keycap element for a KeyboardEvent.code. */
export function keycap(code, cls = '') {
  const n = keyLabel(code);
  return h('span', { class: cx('key', cls) }, Array.isArray(n) ? icon(n[1]) : n);
}
export const padGlyph = (name) => {
  const map = { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', start: 'Start', dpad: 'D-Pad', stick: 'L-Stick' };
  const kind = ['a', 'b', 'x', 'y'].includes(name) ? name : name === 'dpad' || name === 'stick' ? 'dp' : 'sh';
  return h('span', { class: cx('pad', kind) }, map[name] ?? name);
};

// ------------------------------------------------------------------------------------------------ screen furniture
/** Header: optional back button, kicker, title and a step breadcrumb. */
export function screenHeader({ kicker, title, steps, step, back }) {
  const crumbs = steps ? h('div', { class: 'crumbs' }, steps.map((s, i) => h('span', { class: cx('crumb', i === step && 'on', i < step && 'done') }, h('b', {}, i < step ? icon('check') : String(i + 1)), h('span', {}, s)))) : null;
  return h('div', { class: 'scr-head' },
    back ? button({ label: 'Back', icon: 'back', variant: 'glass', size: 'sm', onClick: back, sfx: 'back', cls: 'bk' }) : null,
    h('div', { class: 'ttl' }, kicker ? h('div', { class: 'kicker' }, kicker) : null, title ? h('h1', { class: 'h1' }, title) : null),
    crumbs);
}

export const headerCss = /* css */ `
.scr-head{display:flex;align-items:flex-end;gap:1.4rem;flex-wrap:wrap;margin-bottom:.8rem;z-index:3;}
.scr-head .bk{align-self:center;}
.scr-head .ttl{flex:1;min-width:12rem;}
.crumbs{display:flex;gap:.4rem;align-self:center;}
.crumb{display:inline-flex;align-items:center;gap:.4rem;padding:.25rem .7rem .25rem .3rem;border-radius:99px;background:rgba(255,255,255,.08);font-size:.74rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--kr-ink-dim);}
.crumb b{display:grid;place-items:center;width:1.4rem;height:1.4rem;border-radius:50%;background:rgba(255,255,255,.14);font-size:.74rem;}
.crumb b .ico{font-size:.8rem;stroke-width:3;}
.crumb.on{background:rgba(255,122,26,.25);color:#fff;box-shadow:inset 0 0 0 .1rem rgba(255,160,70,.6);}
.crumb.on b{background:var(--kr-accent);}
.crumb.done{color:#c9d4f5;} .crumb.done b{background:var(--kr-good);color:#10300a;}
.l-compact .crumb span,.l-portrait .crumb span{display:none;} .l-compact .crumb,.l-portrait .crumb{padding:.25rem;}
.l-compact .crumb.on span,.l-portrait .crumb.on span{display:inline;padding-right:.4rem;}
.portrait{width:var(--ps,2rem);height:var(--ps,2rem);border-radius:50%;background:rgba(255,255,255,.1);display:block;flex:none;}
`;
