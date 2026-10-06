// Title: logo + "press start" gate (this first gesture unlocks audio). OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';

export const titleCss = /* css */ `
.s-title{align-items:center;justify-content:space-between;padding-top:max(3.2vh,var(--sat));padding-bottom:max(2.4rem,var(--sab));}
.logo{display:flex;flex-direction:column;align-items:center;gap:.7rem;transform:skewX(-8deg);margin-top:1.2vh;animation:logo-in .9s var(--ease-spring) both;}
.logo-row{display:flex;gap:1.5rem;align-items:baseline;justify-content:center;flex-wrap:wrap;}
.lw{position:relative;display:inline-block;font-family:var(--font-display);font-size:7.6rem;line-height:.95;letter-spacing:.01em;isolation:isolate;padding:0 .12em;--sh2:#c25400;}
.lw .s1,.lw .s2{position:absolute;left:.12em;top:0;pointer-events:none;white-space:nowrap;}
.lw .s1{color:#0a0f24;-webkit-text-stroke:.62rem #0a0f24;transform:translateY(.38rem);z-index:0;}
.lw .s2{color:var(--sh2);-webkit-text-stroke:.62rem var(--sh2);transform:translateY(.86rem);z-index:-1;}
.lw .t{position:relative;z-index:1;color:transparent;-webkit-background-clip:text;background-clip:text;background-size:260% 100%,100% 100%;background-repeat:no-repeat;background-position:150% 0,0 0;}
.lw.k .t{background-image:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.95) 50%,transparent 60%),linear-gradient(180deg,#ffffff 0%,#ffffff 44%,#cfe8ff 60%,#86c2ff 100%);animation:shine 5s ease-in-out 1.2s infinite;}
.lw.r{--sh2:#7a2c00;}
.lw.r .t{background-image:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.9) 50%,transparent 60%),linear-gradient(180deg,#fff3c4 0%,#ffd45a 40%,#ff9a2a 62%,#ff6a10 100%);animation:shine 5s ease-in-out 1.5s infinite;}
@keyframes shine{0%,60%{background-position:150% 0,0 0}100%{background-position:-60% 0,0 0}}
@keyframes logo-in{from{opacity:0;transform:skewX(-8deg) translateY(-3rem) scale(.8)}to{opacity:1;transform:skewX(-8deg)}}
.logo-sub{display:flex;align-items:center;gap:1.1rem;margin-top:.9rem;}
.gp-badge{font-family:var(--font-display);font-size:2.3rem;line-height:1;padding:.18rem 1.1rem .1rem;border-radius:.6rem;color:#2b1700;background:linear-gradient(180deg,#ffe985,#ffd23f 55%,#f0ae14);box-shadow:0 .28rem 0 #9c6d06,0 .6rem 1.2rem rgba(0,0,0,.45),inset 0 .08rem 0 rgba(255,255,255,.65);}
.tagline{font-family:var(--font-display);font-size:1.15rem;letter-spacing:.42em;text-transform:uppercase;color:#d8e6ff;text-shadow:0 .14rem 0 rgba(0,0,0,.6);}
.flagstrip{height:.9rem;width:min(34rem,60vw);margin-top:.6rem;border-radius:.2rem;background:repeating-conic-gradient(#fff 0 25%,#10163a 0 50%) 0 0/1.8rem 1.8rem;opacity:.92;box-shadow:0 .2rem .8rem rgba(0,0,0,.5);}
.press{margin:0 auto;border:0;background:none;cursor:pointer;display:grid;grid-template-columns:auto auto;align-items:center;justify-content:center;column-gap:.8rem;row-gap:.45rem;font-family:var(--font-display);font-size:2rem;letter-spacing:.14em;text-transform:uppercase;color:#fff;text-shadow:0 .16rem 0 rgba(0,0,0,.65),0 0 1.4rem rgba(34,211,255,.75);animation:press-pulse 1.7s ease-in-out infinite;padding:.6rem 1.6rem;}
.press .ico{font-size:1.1em;color:var(--kr-accent);filter:drop-shadow(0 .1rem 0 rgba(0,0,0,.5));}
.press .bar{grid-column:1/-1;width:100%;height:.28rem;border-radius:9px;background:linear-gradient(90deg,transparent,#fff,transparent);opacity:.75;}
.press:focus{outline:none;}
@keyframes press-pulse{0%,100%{transform:scale(1);opacity:.92}50%{transform:scale(1.07);opacity:1}}
.title-foot{position:absolute;left:max(1.6rem,var(--sal));right:max(1.6rem,var(--sar));bottom:max(.8rem,var(--sab));display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;font-size:.78rem;color:var(--kr-ink-dim);text-shadow:0 .1rem .3rem rgba(0,0,0,.8);pointer-events:none;}
.title-foot .note{display:inline-flex;align-items:center;gap:.5rem;padding:.3rem .8rem;border-radius:99px;background:rgba(255,210,63,.16);color:#ffe27a;pointer-events:auto;}
.l-compact .logo{gap:.3rem;} .l-compact .lw{font-size:4.6rem;} .l-compact .tagline{font-size:.8rem;letter-spacing:.3em;} .l-compact .gp-badge{font-size:1.5rem;} .l-compact .flagstrip{display:none;} .l-compact .logo-sub{margin-top:.3rem;} .l-compact .press{font-size:1.4rem;}
.l-portrait .lw{font-size:4.4rem;} .l-portrait .logo-row{gap:.4rem;} .l-portrait .tagline{font-size:.8rem;letter-spacing:.28em;} .l-portrait .press{font-size:1.5rem;} .l-portrait .title-foot{flex-direction:column;align-items:center;}
`;

const PROMPT = { keyboard: 'Press any key to start', mouse: 'Click or press any key', touch: 'Tap to start', gamepad: 'Press A to start' };

/** One logo word: two decorative shadow layers + the gradient-filled text on top. */
const logoWord = (text, cls) => h('span', { class: `lw ${cls}`, 'aria-hidden': 'true' },
  h('span', { class: 's2' }, text), h('span', { class: 's1' }, text), h('span', { class: 't' }, text));

export class TitleScreen extends Screen {
  get stage() { return { preset: 'title', kart: true, comp: { x: 0, y: 0.06 }, theme: null }; }
  hints() { return []; }
  navOptions() { return { onBack: () => {}, wrap: false, onKey: (e) => this.anyKey(e) }; }

  build() {
    const save = this.app.save;
    this.label = h('span', {}, PROMPT[this.ui.device] ?? PROMPT.keyboard);
    this.press = h('button', { type: 'button', class: 'press', 'data-nav': '', 'data-default': '', 'aria-label': 'Start' }, icon('play'), this.label, h('i', { class: 'bar' }));
    this.press.addEventListener('click', () => this.start());
    const notes = [];
    if (!save.persistent) notes.push(h('span', { class: 'note' }, icon('warning'), "Progress can't be saved in this browser mode."));
    const root = h('div', { class: 'screen' },
      h('div', { class: 'scrim-top' }), h('div', { class: 'scrim-bottom' }),
      h('div', { class: 'logo' },
        h('div', { class: 'logo-row', role: 'heading', 'aria-level': '1', 'aria-label': 'Kart Rush GP' }, logoWord('KART', 'k'), logoWord('RUSH', 'r')),
        h('div', { class: 'logo-sub' }, h('span', { class: 'gp-badge' }, 'GP'), h('span', { class: 'tagline' }, 'Arcade Kart Racing')),
        h('div', { class: 'flagstrip' })),
      h('div', { class: 'spacer' }),
      this.press,
      h('div', { class: 'title-foot' }, h('span', {}, 'An original game. All characters and tracks are made up.'), h('span', {}, notes)));
    root.addEventListener('pointerdown', (e) => { if (e.target === root || e.target.closest('.logo')) this.start(); });
    return root;
  }

  /** Nav hands us every key first: anything except modifiers / browser shortcuts starts the game. */
  anyKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab', 'F5', 'F11', 'F12', 'Escape'].includes(e.code)) return false;
    this.start();
    return true;
  }

  onDevice(d) { if (this.label) this.label.textContent = PROMPT[d] ?? PROMPT.keyboard; }

  update() {
    // any gamepad button counts as "start"
    try {
      for (const p of navigator.getGamepads?.() ?? []) if (p && p.buttons.some((b) => b.pressed)) { this.start(); break; }
    } catch { /* blocked */ }
  }

  start() {
    if (this._started) return;
    this._started = true;
    const app = this.app;
    app.audio?.unlock?.();
    this.ui.sfx('confirm');
    app.menuScene.pulse('#ffd23f');
    app.audio?.playMusic?.('menu');
    this.ui.reset('menu', {}, 'fade');
  }

}
