// Live HUD preview for Settings > Gameplay. OWNER: Agent E.
// Renders the REAL HUD widgets (speedometer, minimap, item slot ...) with fake race data inside a full-viewport-sized box that is
// scaled down with a CSS transform, so "HUD size", "speed unit", "minimap" and "standings" changes are visible instantly and at
// true proportions (the box has the viewport's aspect ratio).  Reads app.settings; nothing is written.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Speedo, Minimap, ItemSlot, setText } from './widgets.js';
import { portrait } from '../components.js';
import { getDriver, DRIVERS } from '../../data/roster.js';
import { getTrackOutline } from '../../modes/catalog.js';

export const previewCss = /* css */ `
.hudprev{position:relative;flex:none;width:min(100%,27rem);margin:.2rem auto .5rem;border-radius:1rem;overflow:hidden;box-shadow:inset 0 0 0 .12rem rgba(255,255,255,.2),0 .4rem 0 rgba(0,0,0,.3);background:linear-gradient(180deg,#4a8cff 0%,#9fd0ff 42%,#6fb04a 42.5%,#4f8f33 100%);}
.hudprev::before{content:'';position:absolute;left:50%;bottom:0;width:44%;height:58%;transform:translateX(-50%);background:linear-gradient(180deg,#5b6070,#3b3f4c);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);}
.hudprev::after{content:'';position:absolute;left:50%;bottom:6%;width:3%;height:46%;transform:translateX(-50%);background:repeating-linear-gradient(180deg,#fff 0 22%,transparent 22% 44%);clip-path:polygon(35% 0,65% 0,100% 100%,0 100%);opacity:.8;}
.hudprev .kartmock{position:absolute;left:50%;bottom:11%;width:15%;height:11%;transform:translateX(-50%);z-index:1;border-radius:18% 18% 30% 30%;background:linear-gradient(180deg,#5d8bff,#2b5cff);box-shadow:0 .35em 0 rgba(0,0,0,.35);}
.hudprev .kartmock::before,.hudprev .kartmock::after{content:'';position:absolute;bottom:-18%;width:20%;height:46%;border-radius:30%;background:#161a2c;}
.hudprev .kartmock::before{left:-10%;} .hudprev .kartmock::after{right:-10%;}
.hudprev-inner{position:absolute;left:0;top:0;transform-origin:0 0;z-index:2;pointer-events:none;}
.hudprev .hud{position:absolute;inset:0;}
.hudprev .hud .zl,.hudprev .hud .zr{transition:none;}
.hudprev .tag{position:absolute;left:50%;transform:translateX(-50%);top:.4rem;z-index:3;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;font-weight:900;padding:.15rem .5rem;border-radius:99px;background:rgba(0,0,0,.5);color:#dfe6ff;}
.l-portrait .hudprev{width:auto;height:15rem;} .l-portrait .hudprev .tag{display:none;} .l-compact .hudprev{display:none;}
`;

let seq = 0;

export class HudPreview {
  constructor(app) {
    this.app = app;
    this.id = `p${++seq}`;
    const s = app.settings;
    this.speedo = new Speedo();
    this.item = new ItemSlot();
    this.mini = new Minimap();
    this.me = { item: { type: 'boost', count: 2, roulette: { active: false, shown: null } }, position: { x: 0, z: 0 }, yaw: 0, driver: getDriver(app.save.profile.favoriteDriver) };
    this.fakeSession = null;

    this.pn = h('span', { class: 'pn' }, '2'); this.ps = h('span', { class: 'ps' }, 'nd'); this.po = h('span', { class: 'po' }, 'of 8');
    this.posEl = h('div', { class: 'pos p2' }, this.pn, this.ps, this.po);
    this.lapbox = h('div', { class: 'lapbox glass' }, h('span', { class: 'll' }, 'LAP'), h('span', { class: 'ln' }, '2', h('small', {}, '/3')));
    this.timerEl = h('div', { class: 'timer' }, '1:07', h('small', {}, '.482'));
    const rows = [['1', 'rusty'], ['2', app.save.profile.favoriteDriver], ['3', 'luna']].map(([p, id]) => h('div', { class: `br p${p}${p === '2' ? ' me' : ''}` }, h('span', { class: 'bp' }, p), portrait(id, 22), h('span', { class: 'bn' }, p === '2' ? app.save.profile.name : getDriver(id).name)));
    this.board = h('div', { class: 'board' }, rows);

    this.hud = h('div', { class: `hud preview` },
      h('div', { class: 'zl' }, this.item.el, h('div', { class: 'zl-mid' }, this.posEl), h('div', { class: 'status' }), this.board),
      h('div', { class: 'zr' }, h('div', { class: 'trrow' }, this.lapbox), this.timerEl, h('div', { class: 'zr-inst' }, this.mini.el, this.speedo.el)));
    this.inner = h('div', { class: 'hudprev-inner' }, this.hud);
    this.el = h('div', { class: 'hudprev', 'aria-label': 'HUD preview', role: 'img' }, h('div', { class: 'kartmock' }), this.inner, h('span', { class: 'tag' }, 'Preview'));
    this._onResize = () => this.layout();
    window.addEventListener('resize', this._onResize);
    requestAnimationFrame(() => { this.layout(); this.apply(); });
  }

  /** Match the viewport's aspect ratio and scale the full-size HUD box down into the card. */
  layout() {
    if (!this.el.isConnected) return;
    const W = window.innerWidth, H = window.innerHeight;
    const w = this.el.clientWidth || 400;
    this.el.style.aspectRatio = `${W} / ${H}`;
    this.inner.style.width = `${W}px`; this.inner.style.height = `${H}px`;
    this.inner.style.transform = `scale(${(w / W).toFixed(4)})`;
    this.mini.base = null;
    this.draw();
  }

  /** Re-read the settings (call after every change). */
  apply() {
    const s = this.app.settings;
    this.hud.classList.toggle('nomap', s.showMinimap === false);
    this.hud.classList.toggle('noboard', s.showLeaderboard === false);
    const unit = s.speedUnit === 'mph' ? 'mph' : 'kmh';
    const f = unit === 'mph' ? 2.23694 : 3.6;
    const top = 36;                                              // m/s, a plausible top speed for the dial range
    this.speedo.update(0, 31 * f, Math.ceil((top * f * 1.45) / 20) * 20, unit === 'mph' ? 'mph' : 'km/h', false, true);
    this.item.update(this.me, 0, 0);
    this.item.setHint('');
    this.draw();
  }

  draw() {
    // minimap with fake racers spread along the real outline of the favourite track
    const outline = getTrackOutline(this.app.save.profile.lastTrack) ?? getTrackOutline('sunny-meadows');
    if (!outline) return;
    this.mini.outline = outline;
    const P = outline.points, n = P.length;
    const at = (f) => P[Math.floor(f * n) % n];
    const karts = DRIVERS.slice(0, 5).map((d, i) => ({ driver: d, position: { x: at(0.08 + i * 0.17)[0], z: at(0.08 + i * 0.17)[1] }, yaw: 0 }));
    const me = { ...karts[1], yaw: 0.8 };
    this.fakeSession = { track: { id: 'preview', minimap: null }, config: {}, karts, player: me, race: { order: karts } };
    this.mini.draw(this.fakeSession);
  }

  destroy() { window.removeEventListener('resize', this._onResize); }
}

export { icon, setText };
