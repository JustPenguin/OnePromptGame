// Settings: Graphics · Audio · Controls (rebinding) · Gameplay · Access · Data (profile, export/import, reset). OWNER: Agent E.
// Every control applies immediately (applySetting) and persists (save.commit); nothing needs an "Apply" button.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, row, sliderCtl, toggleCtl, segmentedCtl, keycap } from '../components.js';
import { applySetting, resolvedQualityId } from '../../app/settingsApply.js';
import { canFullscreen, toggleFullscreen, isFullscreen } from '../fullscreen.js';
import { summarizeSave } from '../../save/Save.js';
import { copyText } from '../clipboard.js';
import { HudPreview } from '../hud/preview.js';
import { DRIVERS, KART_BODIES, SPEED_CLASSES } from '../../data/roster.js';
import { getCups } from '../../modes/catalog.js';

export const settingsCss = /* css */ `
.s-settings{align-items:center;}
.s-settings .scrim-all{background:radial-gradient(120% 100% at 30% 50%,rgba(6,9,26,.6),rgba(6,9,26,.9));}
.set-wrap{width:min(50rem,94vw);flex:1;min-height:0;display:flex;flex-direction:column;gap:.7rem;z-index:2;}
.set-head{display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;}
.set-head .h1{flex:1;min-width:10rem;margin:0;font-size:2.3rem;}
.set-panel{flex:1;min-height:0;display:flex;flex-direction:column;border-radius:1.2rem;overflow:hidden;}
.set-body{flex:1;min-height:0;padding:.8rem .9rem 1rem;display:flex;flex-direction:column;gap:.45rem;}
.set-body > *{flex:none;}   /* rows keep their natural height; the body scrolls instead of squashing them */
.set-h{margin:.7rem .2rem .1rem;font-size:.74rem;letter-spacing:.18em;text-transform:uppercase;color:var(--kr-accent-2);font-weight:900;}
.set-h:first-child{margin-top:.1rem;}
.set-note{font-size:.84rem;color:var(--kr-ink-dim);padding:.2rem .4rem;}
.infobox{display:flex;gap:.7rem;align-items:center;padding:.6rem .9rem;border-radius:.9rem;background:rgba(255,255,255,.06);font-size:.9rem;}
.infobox.warn{background:rgba(255,210,63,.14);box-shadow:inset 0 0 0 .1rem rgba(255,210,63,.5);color:#ffe9a8;} .infobox.ok{background:rgba(123,224,74,.12);box-shadow:inset 0 0 0 .1rem rgba(123,224,74,.4);color:#d6f7bf;}
.infobox .ico{font-size:1.3rem;flex:none;}
.krow{display:grid;grid-template-columns:minmax(0,1fr) 8rem 8rem;align-items:center;gap:.6rem;padding:.3rem .8rem;border-radius:.9rem;background:rgba(255,255,255,.04);min-height:3.1rem;}
.krow .klbl{font-weight:900;font-size:1rem;}
.keybtn{position:relative;height:2.4rem;border:0;border-radius:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.4rem;background:rgba(0,0,0,.36);box-shadow:inset 0 0 0 .1rem rgba(255,255,255,.14);color:#dfe6ff;font-weight:900;font-size:.85rem;transition:background .15s,box-shadow .15s,transform .15s var(--ease-spring);}
.keybtn:hover,.keybtn.is-focus{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 .14rem #fff,0 0 1rem rgba(34,211,255,.35);transform:translateY(-.06rem);}
.keybtn.listening{background:rgba(255,122,26,.3);box-shadow:inset 0 0 0 .14rem var(--kr-accent);animation:listen 1s ease-in-out infinite;color:#fff;}
@keyframes listen{50%{background:rgba(255,122,26,.5)}}
.keybtn .none{opacity:.4;font-weight:700;}
.btn-row{display:flex;gap:1.1rem;flex-wrap:wrap;padding:.4rem .2rem;}
.set-foot{display:flex;justify-content:space-between;align-items:center;gap:1rem;min-height:0;} .set-foot:empty{display:none;}
.modal textarea.txt{height:7.5rem;margin:.5rem 0;}
.modal .st{font-size:.9rem;margin-top:.4rem;min-height:1.3rem;} .modal .st.bad{color:#ff9fb4;} .modal .st.good{color:#b5f67d;}
.sumgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem;margin-top:.5rem;} .sumgrid div{padding:.4rem .6rem;border-radius:.6rem;background:rgba(255,255,255,.07);font-size:.78rem;color:var(--kr-ink-dim);} .sumgrid b{display:block;font-family:var(--font-display);font-weight:400;font-size:1.15rem;color:#fff;}
.l-portrait .krow{grid-template-columns:minmax(0,1fr) 5.4rem 5.4rem;} .l-portrait .row{grid-template-columns:1fr;gap:.3rem;} .l-portrait .row .ctl{justify-content:flex-start;}
.l-portrait .tab{padding:.45rem .7rem;font-size:.85rem;} .l-portrait .tab .ico{display:none;}
.l-compact .set-wrap{width:min(46rem,96vw);gap:.35rem;} .l-compact .set-head{gap:.8rem;} .l-compact .set-head .h1{font-size:1.5rem;} .l-compact .row{min-height:2.5rem;padding:.25rem .8rem;} .l-compact .row .desc{display:none;} .l-compact .krow{min-height:2.5rem;} .l-compact .keybtn{height:2rem;} .l-compact .tab{padding:.35rem .8rem;font-size:.85rem;}
`;

const TABS = [
  { id: 'graphics', label: 'Graphics', icon: 'camera' },
  { id: 'audio', label: 'Audio', icon: 'speaker' },
  { id: 'controls', label: 'Controls', icon: 'gamepad' },
  { id: 'gameplay', label: 'Gameplay', icon: 'flag' },
  { id: 'access', label: 'Access', icon: 'eye' },
  { id: 'data', label: 'Data', icon: 'chart' },
];

export const BIND_ACTIONS = [
  ['throttle', 'Accelerate'], ['brake', 'Brake / reverse'], ['left', 'Steer left'], ['right', 'Steer right'], ['drift', 'Drift'],
  ['item', 'Use item'], ['lookBack', 'Look back'], ['camera', 'Change camera'], ['respawn', 'Respawn'], ['pause', 'Pause'],
];
const REQUIRED = new Set(['throttle', 'brake', 'left', 'right', 'drift']);

export class SettingsScreen extends Screen {
  get stage() { return { preset: 'select', kart: true, theme: null, comp: (l) => (l.mode === 'wide' ? { x: 0.3, y: 0.02 } : { x: 0, y: -0.2 }) }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Change' }, { k: 'tab' }, { k: 'back' }]; }
  navOptions() { return { onBack: () => this.onBack(), onTab: (d) => { this.switchTab(this.tabIndex + d, true); return true; } }; }

  build() {
    this.tabIndex = Math.max(0, TABS.findIndex((t) => t.id === (this.params.tab ?? this.ui._lastSettingsTab ?? 'graphics')));
    this.tabEls = TABS.map((t, i) => {
      const el = h('button', { type: 'button', class: 'tab', role: 'tab', 'data-nav': '', 'data-sfx': 'tick', 'aria-selected': String(i === this.tabIndex), ...(i === this.tabIndex ? { 'data-default': '' } : {}) }, h('span', {}, icon(t.icon), t.label));
      el.addEventListener('navfocus', (e) => this.onTabFocus(e, i));
      el.addEventListener('click', () => this.switchTab(i));
      return el;
    });
    this.body = h('div', { class: 'set-body scroll fade-b', role: 'tabpanel' });
    this.foot = h('div', { class: 'set-foot' });
    const from = this.params.from;
    const el = h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      h('div', { class: 'set-wrap' },
        h('div', { class: 'set-head' }, button({ label: 'Back', icon: 'back', variant: 'glass', size: 'sm', sfx: 'back', onClick: () => this.onBack() }), h('h1', { class: 'h1' }, from === 'pause' ? 'Settings' : 'Settings')),
        h('div', { class: 'tabs', role: 'tablist' }, this.tabEls),
        h('div', { class: 'panel set-panel' }, this.body),
        this.foot));
    this.renderTab();
    return el;
  }

  onShow() { const p = this.app.save.profile; if (!this.app.session) this.app.menuScene.setKart(p.favoriteDriver, p.favoriteKart); }
  onHide() { if (this._listening) this.cancelListen(); }
  destroy() { if (this._listening) this.cancelListen(); this.preview?.destroy(); }

  get tab() { return TABS[this.tabIndex].id; }

  /** Coming down from content with keyboard/pad, land on the selected tab; moving along the strip switches tabs. */
  onTabFocus(e, i) {
    const nav = this.ui.nav, from = e.detail?.from;
    if (from && !this.tabEls.includes(from) && i !== this.tabIndex && (nav.device === 'keyboard' || nav.device === 'gamepad')) { nav.setFocus(this.tabEls[this.tabIndex], { silent: true }); return; }
    this.switchTab(i);
  }

  switchTab(i, focus = false) {
    const n = TABS.length;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === this.tabIndex && !focus) return;
    this.tabIndex = i;
    this.ui._lastSettingsTab = TABS[i].id;
    this.tabEls.forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    this.renderTab();
    if (focus) this.ui.nav.setFocus(this.tabEls[i], { silent: false });
  }

  renderTab() {
    if (this._listening) this.cancelListen();
    this.preview?.destroy(); this.preview = null;
    const rows = this['tab_' + this.tab]();
    rows.forEach((r, i) => { if (r.classList?.contains('row') || r.classList?.contains('krow')) { r.classList.add('pop'); r.style.setProperty('--i', Math.min(i, 8)); } });
    this.body.replaceChildren(...rows);
    this.body.scrollTop = 0;
    this.foot.replaceChildren();
  }

  set(key, value, afterApply) {
    this.app.settings[key] = value;
    applySetting(this.app, key);
    afterApply?.();
  }

  // ------------------------------------------------------------------------------------------------ tabs
  tab_graphics() {
    const s = this.app.settings;
    const autoNote = h('span', {});
    const upd = () => { autoNote.textContent = s.quality === 'auto' ? `Auto is using ${resolvedQualityId(this.app)}.` : ''; };
    upd();
    const q = segmentedCtl([['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']].map(([value, label]) => ({ value, label })), s.quality, (v) => this.set('quality', v, upd));
    const rows = [
      row('Quality', 'Overall detail. Auto picks a level for your device.', q),
      h('div', { class: 'set-note' }, autoNote),
      row('Resolution scale', 'Lower it for smoother play on slower devices.', sliderCtl({ min: 0.5, max: 1, step: 0.05, value: s.resolutionScale, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('resolutionScale', v) })),
      row('Post-processing', 'Bloom glow, vignette and colour grading.', toggleCtl(s.postfx, (v) => this.set('postfx', v))),
      row('Camera shake', 'Shake on hits, landings and boosts.', toggleCtl(s.cameraShake, (v) => this.set('cameraShake', v))),
      row('Speed field of view', 'The view widens as you go faster.', toggleCtl(s.fovBoost, (v) => this.set('fovBoost', v))),
      row('Show FPS', 'A small performance read-out during races.', toggleCtl(s.showFps, (v) => this.set('showFps', v))),
    ];
    if (canFullscreen()) {
      const fsBtn = button({ label: isFullscreen() ? 'Exit' : 'Enter', icon: isFullscreen() ? 'fullscreenExit' : 'fullscreen', variant: 'glass', size: 'sm', onClick: async () => { const r = await toggleFullscreen(); if (!r.ok) this.ui.toast({ title: 'Fullscreen unavailable', text: 'The browser did not allow it here.', icon: 'fullscreen' }); else setTimeout(() => this.renderTab(), 250); } });
      rows.push(row('Fullscreen', 'Fill the whole screen.', { el: fsBtn, activate: () => fsBtn.click() }));
    }
    return rows;
  }

  tab_audio() {
    const s = this.app.settings;
    let last = 0;
    const slider = (key) => sliderCtl({ min: 0, max: 1, step: 0.05, value: s[key], onChange: (v) => { this.set(key, v); const n = performance.now(); if (n - last > 120) { last = n; this.ui.sfx('tick'); } } });
    return [
      row('Master volume', 'Everything.', slider('masterVolume')),
      row('Music', 'Menu and race music.', slider('musicVolume')),
      row('Sound effects', 'Engines, drifts, items and menus.', slider('sfxVolume')),
      h('div', { class: 'set-note' }, 'Sound starts after your first click, tap or key press (a browser rule).'),
    ];
  }

  tab_gameplay() {
    const s = this.app.settings;
    const preview = this.preview = new HudPreview(this.app);
    const upd = () => preview.apply();
    return [
      preview.el,
      row('Speed unit', 'Used by the speedometer.', segmentedCtl([{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }], s.speedUnit, (v) => this.set('speedUnit', v, upd))),
      row('Camera', 'The default view. Press C in a race to cycle.', segmentedCtl([{ value: 'chase', label: 'Chase' }, { value: 'far', label: 'Far' }, { value: 'close', label: 'Close' }], s.cameraMode, (v) => this.set('cameraMode', v))),
      row('Auto-accelerate', 'The gas is always on. You only steer, drift and brake.', toggleCtl(s.assists.autoAccelerate, (v) => { s.assists.autoAccelerate = v; applySetting(this.app, 'assists'); })),
      row('Steering assist', 'Gentle help staying on the road.', toggleCtl(s.assists.steeringAssist, (v) => { s.assists.steeringAssist = v; applySetting(this.app, 'assists'); })),
      row('Minimap', 'Show the track map during races.', toggleCtl(s.showMinimap, (v) => this.set('showMinimap', v, upd))),
      row('Standings list', 'Show the top racers during races.', toggleCtl(s.showLeaderboard, (v) => this.set('showLeaderboard', v, upd))),
      row('HUD size', 'Scale the race display.', sliderCtl({ min: 0.7, max: 1.4, step: 0.05, value: s.hudScale, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('hudScale', v, () => setTimeout(() => preview.layout(), 0)) })),
    ];
  }

  tab_access() {
    const s = this.app.settings;
    return [
      row('Reduced motion', 'Calmer menus, no camera sway. Also follows your system setting.', toggleCtl(s.reducedMotion, (v) => this.set('reducedMotion', v))),
      row('Reduce flashes', 'Removes screen flashes and pulsing glows.', toggleCtl(s.reduceFlashes, (v) => this.set('reduceFlashes', v))),
      row('Large text', 'Makes menus and the HUD bigger.', toggleCtl(s.largeText, (v) => this.set('largeText', v))),
      row('High-contrast HUD', 'Solid backgrounds behind HUD elements.', toggleCtl(s.highContrastHud, (v) => this.set('highContrastHud', v))),
      row('Vibration', 'Controller rumble on hits and boosts.', toggleCtl(s.vibration, (v) => this.set('vibration', v))),
      h('div', { class: 'set-note' }, 'Menus work with keyboard, gamepad, mouse and touch. Every action has an on-screen button.'),
    ];
  }

  // ---- controls: keyboard rebinding + gamepad + touch
  tab_controls() {
    const s = this.app.settings, input = this.app.input;
    const pad = h('span', { class: 'chip' }, '');
    const refreshPad = () => { pad.className = `chip ${input.gamepad.connected ? 'gn' : ''}`; pad.replaceChildren(icon('gamepad'), input.gamepad.connected ? 'Connected' : 'Not detected'); };
    refreshPad();
    this._padTimer?.(); const iv = setInterval(refreshPad, 700); this._padTimer = () => clearInterval(iv);
    const out = [h('div', { class: 'set-h' }, 'Keyboard')];
    this.keyRows = BIND_ACTIONS.map(([id, label]) => {
      const slots = [0, 1].map((idx) => {
        const b = h('button', { type: 'button', class: 'keybtn', 'data-nav': '', 'data-sfx': 'click', 'aria-label': `${label}, key ${idx + 1}` });
        b.addEventListener('click', () => this.listen(id, idx, b));
        return b;
      });
      const r = h('div', { class: 'krow pop', role: 'group', 'aria-label': label }, h('span', { class: 'klbl' }, label), slots);
      r._slots = slots; r._id = id;
      return r;
    });
    this.keyRows.forEach((r, i) => r.style.setProperty('--i', Math.min(i, 8)));
    this.paintKeys();
    out.push(...this.keyRows);
    out.push(h('div', { class: 'btn-row' }, button({ label: 'Reset keys', icon: 'restart', variant: 'glass', size: 'sm', onClick: () => this.resetKeys() })));
    out.push(h('div', { class: 'set-note' }, 'Select a key, then press the new one. Esc cancels, Backspace clears.'));
    out.push(h('div', { class: 'set-h' }, 'Gamepad'));
    out.push(row('Controller', 'Plug in or pair one and press any button.', { el: pad }));
    out.push(row('Vibration', 'Rumble on hits and boosts.', toggleCtl(s.vibration, (v) => this.set('vibration', v))));
    out.push(row('Stick dead zone', 'Ignore tiny stick movements.', sliderCtl({ min: 0.05, max: 0.4, step: 0.01, value: s.gamepadDeadzone, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('gamepadDeadzone', v) })));
    out.push(h('div', { class: 'set-h' }, 'Touch'));
    out.push(row('On-screen controls', 'Auto shows them on touch screens.', segmentedCtl([{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], s.touchControls, (v) => this.set('touchControls', v))));
    out.push(row('Button size', 'Size of the on-screen buttons.', sliderCtl({ min: 0.8, max: 1.4, step: 0.05, value: s.touchScale, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => this.set('touchScale', v) })));
    return out;
  }

  paintKeys() {
    const b = this.app.input.bindings;
    for (const r of this.keyRows) {
      const codes = b[r._id] ?? [];
      r._slots.forEach((btn, i) => {
        btn.classList.remove('listening');
        btn.replaceChildren(codes[i] ? keycap(codes[i]) : h('span', { class: 'none' }, 'Not set'));
      });
    }
  }

  listen(action, idx, btn) {
    if (this._listening) this.cancelListen();
    const ui = this.ui, input = this.app.input;
    this._listening = { action, idx, btn };
    ui.nav.capturing = true;
    btn.classList.add('listening');
    btn.replaceChildren('Press a key…');
    this.foot.replaceChildren(h('span', { class: 'chip or' }, 'Listening…'), h('span', { class: 'dim small' }, 'Esc cancels · Backspace clears'));
    const undo = () => { ui.nav.capturing = false; this._listening = null; this.foot.replaceChildren(); };
    this._cancelPointer = (e) => { if (!e.target.closest?.('.keybtn.listening')) { input.captureNextKey(null); undo(); this.paintKeys(); } };
    setTimeout(() => window.addEventListener('pointerdown', this._cancelPointer, { once: true, capture: true }), 0);
    input.captureNextKey((code) => {
      window.removeEventListener('pointerdown', this._cancelPointer, true);
      undo();
      if (code === 'Escape') { this.paintKeys(); return; }
      const map = JSON.parse(JSON.stringify(input.bindings));
      const list = (map[action] ??= []);
      if (code === 'Backspace' || code === 'Delete') {
        const next = list.filter((_, i) => i !== idx);
        if (REQUIRED.has(action) && next.length === 0) { ui.sfx('error'); ui.toast({ title: 'A key is needed', text: 'This action must keep at least one key.', icon: 'keyboard', kind: 'bad' }); this.paintKeys(); return; }
        map[action] = next;
      } else {
        // a key can only do one thing: take it from whichever action had it
        let moved = null;
        for (const [other, codes] of Object.entries(map)) if (other !== action && codes.includes(code)) {
          if (REQUIRED.has(other) && codes.length === 1) { ui.sfx('error'); ui.toast({ title: 'Key in use', text: `That key is the only one for "${BIND_ACTIONS.find((a) => a[0] === other)?.[1]}".`, icon: 'keyboard', kind: 'bad' }); this.paintKeys(); return; }
          map[other] = codes.filter((c) => c !== code); moved = other;
        }
        list[idx] = code;
        map[action] = list.filter(Boolean);
        if (moved) ui.toast({ title: 'Key moved', text: `It no longer does "${BIND_ACTIONS.find((a) => a[0] === moved)?.[1]}".`, icon: 'keyboard' });
      }
      this.app.settings.bindings = map;
      input.setBindings(map);
      this.app.save.commit();
      ui.sfx('confirm');
      this.paintKeys();
      this.ui.nav.setFocus(btn, { silent: true });
    });
  }

  cancelListen() {
    this.app.input.captureNextKey(null);
    window.removeEventListener('pointerdown', this._cancelPointer, true);
    this.ui.nav.capturing = false;
    this._listening = null;
    this.foot.replaceChildren();
    this.paintKeys();
  }

  resetKeys() {
    this.app.settings.bindings = null;
    this.app.input.setBindings(null);
    this.app.save.commit();
    this.ui.sfx('confirm');
    this.paintKeys();
    this.ui.toast({ title: 'Keys reset', text: 'Back to the default keyboard layout.', icon: 'keyboard' });
  }

  // ---- data: profile, persistence, export / import / reset
  tab_data() {
    const save = this.app.save, p = save.profile;
    const input = h('input', { type: 'text', class: 'txt', maxlength: 14, value: p.name, 'aria-label': 'Racer name', spellcheck: 'false', autocomplete: 'off' });
    input.addEventListener('input', () => { const v = input.value.replace(/[<>]/g, '').slice(0, 14); p.name = v.trim() || 'Racer'; p.nameSet = true; save.commit(); });
    input.addEventListener('blur', () => { if (!input.value.trim()) input.value = 'Racer'; });
    const nameRow = row('Racer name', 'Shown on results and the standings.', { el: input, activate: () => input.focus() });
    const status = save.persistent
      ? h('div', { class: 'infobox ok' }, icon('check'), 'Your progress is saved in this browser.')
      : h('div', { class: 'infobox warn' }, icon('warning'), "Progress can't be saved in this browser mode. Use Export to keep a backup code.");
    const sum = summarizeSave(save.data);
    return [
      h('div', { class: 'set-h' }, 'Profile'), nameRow, status,
      h('div', { class: 'set-note' }, `${sum.races} races · ${sum.wins} wins · ${sum.trophies} trophies · ${Math.round(sum.playSeconds / 60)} min played`),
      h('div', { class: 'set-h' }, 'Unlocks'),
      h('div', { class: 'set-note' }, p.unlockAll
        ? 'Everything is unlocked. Your records and real progress are still tracked.'
        : 'Drivers, karts, cups and speed classes normally open as you race. Want to try them all right away?'),
      h('div', { class: 'btn-row' }, p.unlockAll
        ? button({ label: 'Back to normal', icon: 'lock', variant: 'glass', size: 'sm', onClick: () => this.unlockAllFlow(false) })
        : button({ label: 'Unlock everything', icon: 'star', variant: 'green', size: 'sm', onClick: () => this.unlockAllFlow(true) })),
      h('div', { class: 'set-h' }, 'Backup'),
      h('div', { class: 'set-note' }, 'Downloads are not available here, so your save is shared as a text code you can copy and paste.'),
      h('div', { class: 'btn-row' },
        button({ label: 'Export', icon: 'exportOut', variant: 'cyan', size: 'sm', onClick: () => this.exportFlow() }),
        button({ label: 'Import', icon: 'importIn', variant: 'glass', size: 'sm', onClick: () => this.importFlow() }),
        button({ label: 'Show tips again', icon: 'tip', variant: 'glass', size: 'sm', onClick: () => { const seen = this.app.save.profile.seen; for (const k of Object.keys(seen)) seen[k] = false; this.app.save.commit(); this.ui.toast({ title: 'Tips are back', text: 'You will see the driving hints in your next race.', icon: 'tip' }); } }),
        button({ label: 'Reset progress', icon: 'trash', variant: 'red', size: 'sm', onClick: () => this.resetFlow() })),
    ];
  }

  /** "Unlock everything": a saved switch (profile.unlockAll), confirmed in-page. Earned progress keeps being tracked underneath it. */
  async unlockAllFlow(on) {
    const save = this.app.save;
    if (on) {
      const what = `${DRIVERS.length} drivers, ${KART_BODIES.length} karts, ${getCups().length} cups and all ${Object.keys(SPEED_CLASSES).length} speed classes`;
      const ok = await this.ui.confirm({ title: 'Unlock everything?', body: `${what} will be open right away. Your records and real progress are kept, and you can switch this off again here whenever you like.`, confirm: 'Unlock everything', cancel: 'Not now', confirmIcon: 'star' });
      if (!ok) return;
    }
    save.profile.unlockAll = !!on;
    save.commit(true);
    this.ui.sfx(on ? 'unlock' : 'back');
    this.ui.toast(on ? { title: 'Everything unlocked', text: 'Try any driver, kart, cup and speed class.', kind: 'good', icon: 'star' } : { title: 'Back to normal', text: 'Locked items open as you earn them again.', icon: 'lock' });
    this.renderTab();
  }

  async exportFlow() {
    let ghosts = false;
    const ta = h('textarea', { class: 'txt', readonly: true, 'data-nav': '', 'aria-label': 'Save code', spellcheck: 'false' });
    const st = h('div', { class: 'st' });
    const refresh = async () => { ta.value = 'Preparing your code…'; ta.value = await this.app.save.exportCode({ ghosts }); st.textContent = `${ta.value.length.toLocaleString()} characters`; st.className = 'st'; };
    const gh = toggleCtl(false, (v) => { ghosts = v; refresh(); });
    const body = h('div', {}, h('p', { style: { margin: '0 0 .2rem' } }, 'Copy this code and keep it somewhere safe. Paste it into Import on any device to restore your progress.'), ta, row('Include ghosts', 'Makes the code longer.', gh), st);
    ta.addEventListener('focus', () => ta.select());
    const done = this.ui.modal({
      title: 'Export save', body, wide: true,
      buttons: [
        { label: 'Copy', icon: 'copy', variant: 'cyan', onClick: async () => { const r = await copyText(ta.value, ta); st.className = 'st good'; st.textContent = r === 'ok' ? 'Copied to the clipboard.' : 'Selected. Press Ctrl+C (or Cmd+C) to copy.'; } },
        { label: 'Done', value: true, variant: 'green', icon: 'check', def: true },
      ],
    });
    refresh();
    await done;
  }

  async importFlow() {
    const ta = h('textarea', { class: 'txt', 'data-nav': '', placeholder: 'Paste your save code here', 'aria-label': 'Paste save code', spellcheck: 'false' });
    const st = h('div', { class: 'st' });
    const actions = h('div', { class: 'btn-row', style: { display: 'none' } });
    const sumBox = h('div', {});
    let pending = null, closeFn = null;
    const apply = (mode) => {
      this.app.save.applyImport(pending, mode);
      applySetting(this.app);
      this.ui.sfx('confirm');
      this.ui.toast({ title: mode === 'merge' ? 'Progress merged' : 'Save imported', text: 'Your progress has been restored.', kind: 'good', icon: 'check' });
      closeFn?.(true);
      this.renderTab();
    };
    const check = async () => {
      const r = await this.app.save.inspectCode(ta.value);
      actions.style.display = 'none'; sumBox.replaceChildren();
      if (!r.ok) { st.className = 'st bad'; st.textContent = r.error; this.ui.sfx('error'); return; }
      pending = r.data;
      const s = r.summary;
      st.className = 'st good'; st.textContent = `Valid save for "${s.name}".`;
      sumBox.replaceChildren(h('div', { class: 'sumgrid' }, [['Races', s.races], ['Wins', s.wins], ['Trophies', s.trophies], ['Drivers', `${s.drivers}/${s.totalDrivers}`], ['Karts', `${s.bodies}/${s.totalBodies}`], ['Records', s.records]].map(([k, v]) => h('div', {}, h('b', {}, String(v)), k))));
      actions.replaceChildren(
        button({ label: 'Replace my save', icon: 'importIn', variant: 'red', size: 'sm', onClick: () => apply('replace') }),
        button({ label: 'Merge, keep the best', icon: 'swap', variant: 'cyan', size: 'sm', onClick: () => apply('merge') }));
      actions.style.display = 'flex';
      this.ui.nav.autofocus(this.ui.nav.scope);
    };
    const body = h('div', {}, h('p', { style: { margin: '0 0 .2rem' } }, 'Paste a code you exported earlier. You can check it first; nothing changes until you choose.'), ta, st, sumBox, actions);
    const pasteBtn = navigator.clipboard?.readText ? { label: 'Paste', icon: 'copy', variant: 'glass', onClick: async () => { try { ta.value = await navigator.clipboard.readText(); check(); } catch { st.className = 'st bad'; st.textContent = 'The browser blocked pasting. Press Ctrl+V in the box instead.'; } } } : null;
    await this.ui.modal({
      title: 'Import save', body, wide: true, onBuild: ({ close }) => { closeFn = close; },
      buttons: [{ label: 'Cancel', value: false, variant: 'glass', icon: 'close' }, ...(pasteBtn ? [pasteBtn] : []), { label: 'Check code', icon: 'check', variant: 'green', onClick: check, def: true }],
    });
  }

  async resetFlow() {
    const ok = await this.ui.confirm({ title: 'Reset all progress?', body: 'This erases your records, trophies, unlocks and statistics on this device. Your settings are kept. It cannot be undone, so export a backup code first if you may want it back.', confirm: 'Erase progress', cancel: 'Keep it', danger: true, confirmIcon: 'trash' });
    if (!ok) return;
    const s = this.app.settings;
    const keep = JSON.parse(JSON.stringify(s));
    this.app.save.reset();
    Object.assign(this.app.save.settings, keep);
    this.app.save.commit(true);
    applySetting(this.app);
    this.ui.toast({ title: 'Progress reset', text: 'Starting fresh.', icon: 'trash' });
    this.renderTab();
  }
}

