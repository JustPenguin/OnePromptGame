// Main menu: the six top-level destinations over the 3D stage. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { iconButton, portrait } from '../components.js';
import { canFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from '../fullscreen.js';
import { getDriver, getBody } from '../../data/roster.js';
import { TROPHY_RANK } from '../../modes/points.js';

export const menuCss = /* css */ `
.s-menu{padding-top:max(1.1rem,var(--sat));}
.menu-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;z-index:3;}
.logo-mini{font-family:var(--font-display);font-size:1.9rem;letter-spacing:.03em;transform:skewX(-8deg);color:#fff;text-shadow:0 .14rem 0 #b34700,0 .5rem 1rem rgba(0,0,0,.45);}
.logo-mini b{color:var(--kr-accent);font-weight:400;text-shadow:0 .14rem 0 #6b2a00,0 .5rem 1rem rgba(0,0,0,.45);}
.top-r{display:flex;align-items:center;gap:.8rem;}
.profile{display:flex;align-items:center;gap:.7rem;padding:.3rem 1rem .3rem .35rem;border-radius:99px;background:rgba(14,20,52,.8);box-shadow:inset 0 0 0 .1rem var(--line);}
.profile .portrait{width:2.4rem;height:2.4rem;}
.profile .pn{font-family:var(--font-display);font-size:1.05rem;line-height:1;letter-spacing:.03em;}
.profile .ps{font-size:.72rem;color:var(--kr-ink-dim);margin-top:.15rem;}
.menu-body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:1.2rem;max-width:25rem;z-index:3;}
.mlist{display:flex;flex-direction:column;gap:.7rem;}
.mbtn{position:relative;display:flex;align-items:center;gap:1rem;width:100%;padding:0 1.4rem 0 0;height:3.9rem;border:0;cursor:pointer;text-align:left;color:#fff;background:none;transform:skewX(-8deg);transition:transform .22s var(--ease-spring),filter .15s;isolation:isolate;--tone:#ff7a1a;--tone2:#ffb04a;--lip:#a34400;}
.mbtn::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:.9rem;background:linear-gradient(180deg,rgba(40,54,120,.94),rgba(20,28,72,.94));box-shadow:inset 0 0 0 .1rem rgba(255,255,255,.14),0 .3rem 0 rgba(0,0,0,.34),0 .7rem 1.2rem rgba(0,0,0,.3);transition:background .18s,box-shadow .18s;}
.mbtn::after{content:'';position:absolute;inset:-.26rem;border-radius:1.15rem;border:.2rem solid transparent;transition:border-color .12s,box-shadow .12s;pointer-events:none;}
.mbtn .mi{flex:none;width:3.9rem;height:100%;display:grid;place-items:center;font-size:1.8rem;border-radius:.9rem 0 0 .9rem;background:linear-gradient(180deg,var(--tone2),var(--tone));box-shadow:inset 0 .09rem 0 rgba(255,255,255,.5),.2rem 0 0 rgba(0,0,0,.25);color:#fff;}
.mbtn .mi .ico{transform:skewX(8deg);filter:drop-shadow(0 .1rem 0 rgba(0,0,0,.35));}
.mbtn .ml{font-family:var(--font-display);font-size:1.55rem;letter-spacing:.04em;text-transform:uppercase;transform:skewX(8deg);text-shadow:0 .12rem 0 rgba(0,0,0,.45);}
.mbtn .mx{margin-left:auto;transform:skewX(8deg);opacity:0;font-size:1.3rem;transition:opacity .15s,transform .2s var(--ease-spring);}
.mbtn:hover,.mbtn.is-focus{transform:skewX(-8deg) translateX(1rem) scale(1.03);}
.mbtn.is-focus::before,.mbtn:hover::before{background:linear-gradient(180deg,var(--tone2),var(--tone) 60%,var(--tone));box-shadow:inset 0 .09rem 0 rgba(255,255,255,.5),0 .3rem 0 var(--lip),0 .8rem 1.4rem rgba(0,0,0,.4);}
.mbtn.is-focus::after{border-color:#fff;box-shadow:0 0 1.4rem var(--tone),inset 0 0 .8rem rgba(255,255,255,.15);}
.mbtn.is-focus .mi,.mbtn:hover .mi{background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,.08));}
.mbtn.is-focus .mx,.mbtn:hover .mx{opacity:1;transform:skewX(8deg) translateX(.2rem);}
.mbtn:active{transform:skewX(-8deg) translateX(.8rem) scale(.99);}
.mbtn.orange{--tone:#ff7a1a;--tone2:#ffb04a;--lip:#a34400;} .mbtn.cyan{--tone:#12b6e6;--tone2:#6fe6ff;--lip:#0a6a88;} .mbtn.green{--tone:#4fb52a;--tone2:#9bef62;--lip:#2d7712;}
.mbtn.gold{--tone:#f0ae14;--tone2:#ffe27a;--lip:#9c6d06;} .mbtn.violet{--tone:#6a30d8;--tone2:#a878ff;--lip:#3d1788;} .mbtn.glass{--tone:#4a5aa6;--tone2:#7f8fd6;--lip:#161d4a;}
.mdesc{min-height:3.1rem;padding:.7rem 1.1rem;border-radius:.9rem;background:rgba(8,12,34,.62);box-shadow:inset 0 0 0 .1rem var(--line);font-size:.98rem;color:#dfe6ff;max-width:25rem;}
.mdesc b{color:var(--kr-warn);}
.menu-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;z-index:3;}
.racer-card{display:flex;align-items:center;gap:.8rem;padding:.55rem 1.2rem .55rem .6rem;border-radius:1rem;background:rgba(14,20,52,.82);box-shadow:inset 0 0 0 .1rem var(--line),0 .3rem 0 rgba(0,0,0,.3);}
.racer-card .portrait{width:3.2rem;height:3.2rem;}
.racer-card .rn{font-family:var(--font-display);font-size:1.25rem;line-height:1;letter-spacing:.03em;}
.racer-card .rs{font-size:.78rem;color:var(--kr-ink-dim);margin-top:.2rem;}
.l-portrait .menu-body{max-width:none;justify-content:flex-end;}
.l-portrait .mdesc{max-width:none;}
.l-portrait .mbtn{height:3.4rem;} .l-portrait .mbtn .mi{width:3.4rem;} .l-portrait .mbtn .ml{font-size:1.35rem;}
.l-portrait .menu-foot{display:none;}
.l-compact .menu-body{max-width:21rem;gap:.6rem;justify-content:flex-start;} .l-compact .mlist{gap:.38rem;} .l-compact .mbtn{height:2.7rem;} .l-compact .mbtn .mi{width:2.7rem;font-size:1.3rem;} .l-compact .mbtn .ml{font-size:1.15rem;}
.l-compact .mdesc{display:none;} .l-compact .menu-foot{display:none;} .l-compact .logo-mini{font-size:1.4rem;} .l-compact .s-menu{padding-top:.5rem;}
`;

const ENTRIES = [
  { id: 'grandprix', icon: 'trophy', label: 'Grand Prix', tone: 'orange', desc: 'Race a whole cup, collect points and fight for the <b>trophy</b>.' },
  { id: 'timetrial', icon: 'stopwatch', label: 'Time Trial', tone: 'cyan', desc: 'Alone on the track. Chase the perfect lap and <b>race your ghost</b>.' },
  { id: 'versus', icon: 'users', label: 'Versus Race', tone: 'green', desc: 'A quick race: any track, any rivals, any number of laps.' },
  { id: 'records', icon: 'medal', label: 'Records', tone: 'gold', desc: 'Best times, trophies and your career stats.' },
  { id: 'settings', icon: 'gear', label: 'Settings', tone: 'violet', desc: 'Graphics, audio, controls and accessibility.' },
  { id: 'help', icon: 'help', label: 'Help & Credits', tone: 'glass', desc: 'Controls for every device, the item guide and credits.' },
];

export class MainMenuScreen extends Screen {
  get stage() {
    return { preset: 'select', kart: true, theme: null, comp: (l) => (l.mode === 'portrait' ? { x: 0, y: -0.2 } : l.mode === 'compact' ? { x: 0.2, y: 0.02 } : { x: 0.2, y: 0.02 }) };
  }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Select' }]; }
  navOptions() { return { onBack: () => {}, wrap: true }; }

  build() {
    const save = this.app.save;
    const p = save.profile;
    const stats = save.data.stats;
    let trophies = 0;
    for (const byClass of Object.values(save.data.grandPrix)) for (const e of Object.values(byClass)) if (TROPHY_RANK[e.trophy]) trophies++;

    this.desc = h('div', { class: 'mdesc', 'aria-live': 'polite' });
    const setDesc = (e) => { this.desc.innerHTML = e.desc; };
    this.buttons = ENTRIES.map((e, i) => {
      const b = h('button', { type: 'button', class: `mbtn ${e.tone} slide-l`, style: { '--i': i }, 'data-nav': '', 'data-sfx': 'confirm', 'data-id': e.id, ...(i === 0 ? { 'data-default': '' } : {}) },
        h('span', { class: 'mi' }, icon(e.icon)), h('span', { class: 'ml' }, e.label), h('span', { class: 'mx' }, icon('right')));
      b.addEventListener('navfocus', () => setDesc(e));
      b.addEventListener('click', () => this.choose(e.id));
      return b;
    });
    setDesc(ENTRIES[0]);

    const fs = canFullscreen() ? iconButton({ icon: isFullscreen() ? 'fullscreenExit' : 'fullscreen', title: 'Toggle fullscreen', onClick: async () => { const r = await toggleFullscreen(); if (!r.ok) this.ui.toast({ title: 'Fullscreen unavailable', text: 'This browser window did not allow it.', icon: 'fullscreen' }); } }) : null;
    if (fs) this._offFs = onFullscreenChange(() => { fs.replaceChildren(icon(isFullscreen() ? 'fullscreenExit' : 'fullscreen')); });

    const driver = getDriver(p.favoriteDriver), body = getBody(p.favoriteKart);
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-side' }),
      h('div', { class: 'menu-top' },
        h('div', { class: 'logo-mini pop' }, 'KART RUSH ', h('b', {}, 'GP')),
        h('div', { class: 'top-r' },
          h('div', { class: 'profile pop', style: { '--i': 2 } }, portrait(p.favoriteDriver, 38), h('div', {}, h('div', { class: 'pn' }, p.name), h('div', { class: 'ps' }, `${stats.races} races · ${trophies} trophies`))),
          fs)),
      h('div', { class: 'menu-body' }, h('div', { class: 'mlist', role: 'menu' }, this.buttons), this.desc),
      h('div', { class: 'menu-foot' },
        h('div', { class: 'racer-card rise', style: { '--i': 7 } }, portrait(p.favoriteDriver, 52), h('div', {}, h('div', { class: 'rn' }, driver.name), h('div', { class: 'rs' }, `${body.name} · ${driver.species}`)))));
  }

  onShow() {
    const p = this.app.save.profile;
    this.app.menuScene.setKart(p.favoriteDriver, p.favoriteKart);
    if (!p.seen.welcome) setTimeout(() => { if (this.root?.isConnected && this.ui.currentId === 'menu') this.welcome(); }, 650);
  }

  /** First launch: say hello and ask for a name (skippable; works with keyboard, gamepad and touch). */
  async welcome() {
    const p = this.app.save.profile;
    p.seen.welcome = true; this.app.save.commit();
    const input = h('input', { type: 'text', class: 'txt', maxlength: 14, placeholder: 'Racer', 'aria-label': 'Your racer name', spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'go', 'data-nav': '', 'data-default': '' });
    input.value = p.nameSet ? p.name : '';
    const body = h('div', {}, h('p', { style: { margin: '0 0 .7rem' } }, 'Pick a name for the results board. You can change it any time in Settings.'), input);
    const go = await this.ui.modal({ title: 'Welcome to Kart Rush GP!', body, dismissValue: false,
      onBuild: ({ close }) => { input._onEnter = () => close(true); input._onEsc = () => close(false); },    // Enter in the field = "Let's race", Esc = "Skip"
      buttons: [{ label: 'Skip', value: false, variant: 'glass', icon: 'right' }, { label: 'Let\'s race', value: true, variant: 'green', icon: 'check', def: true }] });
    const v = input.value.replace(/[<>]/g, '').trim().slice(0, 14);
    if (go && v) { p.name = v; p.nameSet = true; this.app.save.commit(); this.root?.querySelector('.profile .pn')?.replaceChildren(v); }
  }

  choose(id) {
    const ui = this.ui;
    if (id === 'grandprix' || id === 'timetrial' || id === 'versus') this.app.flow.start(id);
    else if (id === 'records') ui.push('records');
    else if (id === 'settings') ui.push('settings', { from: 'menu' });
    else if (id === 'help') ui.push('help');
  }

  destroy() { this._offFs?.(); }
}
