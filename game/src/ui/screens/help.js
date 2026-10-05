// Help & Credits: controls (keyboard / gamepad / touch), item guide, driving tips, credits. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, keycap, padGlyph, cloneCanvas } from '../components.js';
import { BIND_ACTIONS } from './settings.js';
import { ITEM_DEFS, ITEM_ORDER, getItemIcon } from '../../items/itemDefs.js';

export const helpCss = /* css */ `
.s-help{align-items:center;}
.s-help .scrim-all{background:radial-gradient(120% 100% at 50% 40%,rgba(6,9,26,.6),rgba(6,9,26,.92));}
.help-wrap{width:min(62rem,96vw);flex:1;min-height:0;display:flex;flex-direction:column;gap:.7rem;z-index:2;}
.help-body{flex:1;min-height:0;}
.hcols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem;padding:.3rem .2rem 1rem;}
.hcol{padding:.9rem 1rem 1rem;border-radius:1.1rem;display:flex;flex-direction:column;gap:.4rem;}
.hcol h3{margin:0 0 .3rem;display:flex;align-items:center;gap:.5rem;font-family:var(--font-display);font-weight:400;font-size:1.15rem;letter-spacing:.05em;text-transform:uppercase;}
.hrow{display:flex;align-items:center;justify-content:space-between;gap:.6rem;min-height:2rem;font-size:.9rem;padding:.1rem .1rem;border-bottom:.08rem solid rgba(255,255,255,.06);}
.hrow:last-child{border-bottom:0;} .hrow .k{display:inline-flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end;}
.hnote{font-size:.8rem;color:var(--kr-ink-dim);margin-top:.3rem;line-height:1.35;}
.tmock{position:relative;height:8.5rem;border-radius:1rem;background:linear-gradient(180deg,#2b4ea0,#142a66);overflow:hidden;box-shadow:inset 0 0 0 .1rem var(--line);margin-bottom:.4rem;}
.tmock i{position:absolute;display:grid;place-items:center;border-radius:50%;font-style:normal;font-size:.62rem;font-weight:900;color:#fff;box-shadow:inset 0 0 0 .12rem rgba(255,255,255,.6);}
.tmock .pad{left:.8rem;bottom:.8rem;width:4.2rem;height:4.2rem;background:rgba(255,255,255,.14);} .tmock .a{right:1rem;bottom:.8rem;width:3.2rem;height:3.2rem;background:rgba(255,154,31,.75);} .tmock .b{right:4.6rem;bottom:1.1rem;width:2.5rem;height:2.5rem;background:rgba(255,61,106,.7);} .tmock .c{right:1.4rem;bottom:4.5rem;width:2.5rem;height:2.5rem;background:rgba(34,211,255,.7);}
.items-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem;padding:.3rem .2rem 1rem;}
.icard{display:flex;gap:.8rem;align-items:center;padding:.7rem .9rem;border-radius:1rem;}
.icard canvas{width:3.6rem;height:3.6rem;flex:none;filter:drop-shadow(0 .2rem .2rem rgba(0,0,0,.4));}
.icard .in{font-family:var(--font-display);font-size:1.05rem;letter-spacing:.03em;text-transform:uppercase;line-height:1.05;} .icard .id{font-size:.82rem;color:#dfe6ff;margin-top:.2rem;line-height:1.25;} .icard .ik{margin-top:.3rem;}
.tips-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;padding:.3rem .2rem 1rem;}
.tcardx{padding:.9rem 1.1rem;border-radius:1.1rem;} .tcardx h3{margin:0 0 .4rem;display:flex;align-items:center;gap:.5rem;font-family:var(--font-display);font-weight:400;font-size:1.1rem;text-transform:uppercase;letter-spacing:.04em;} .tcardx p{margin:0;font-size:.9rem;color:#dfe6ff;line-height:1.4;}
.sparks{display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap;} .sp{display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .7rem;border-radius:99px;font-size:.78rem;font-weight:900;color:#fff;} .sp i{width:.7rem;height:.7rem;border-radius:50%;background:currentColor;box-shadow:0 0 .6rem currentColor;display:block;}
.credits{max-width:40rem;margin:0 auto;padding:1.2rem 1.4rem 1.6rem;display:flex;flex-direction:column;gap:.9rem;text-align:center;align-items:center;} .credits .logo-mini{font-size:2.4rem;} .credits p{margin:0;color:#dfe6ff;line-height:1.5;font-size:.95rem;} .credits .cl{font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;color:var(--kr-accent-2);font-weight:900;margin-bottom:.15rem;}
.l-portrait .hcols,.l-portrait .items-grid,.l-portrait .tips-grid{grid-template-columns:1fr;} .l-compact .hcols{grid-template-columns:repeat(3,minmax(0,1fr));} .l-compact .items-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .l-compact .help-wrap{width:96vw;}
`;

const TABS = [['controls', 'Controls', 'gamepad'], ['items', 'Items', 'bolt'], ['tips', 'Tips', 'tip'], ['credits', 'Credits', 'info']];
const KIND_LABEL = { boost: 'Speed', trap: 'Trap', projectile: 'Projectile', defense: 'Defence', attack: 'Attack' };

export class HelpScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'tab' }, { k: 'back' }]; }
  navOptions() { return { onBack: () => this.onBack(), onTab: (d) => { this.switchTab(this.tabIndex + d, true); return true; } }; }

  build() {
    this.tabIndex = Math.max(0, TABS.findIndex((t) => t[0] === (this.params.tab ?? 'controls')));
    this.tabEls = TABS.map(([id, label, ico], i) => {
      const el = h('button', { type: 'button', class: 'tab', role: 'tab', 'data-nav': '', 'data-sfx': 'tick', 'aria-selected': String(i === this.tabIndex), ...(i === this.tabIndex ? { 'data-default': '' } : {}) }, h('span', {}, icon(ico), label));
      el.addEventListener('navfocus', (e) => this.onTabFocus(e, i));
      el.addEventListener('click', () => this.switchTab(i));
      return el;
    });
    this.body = h('div', { class: 'help-body scroll', role: 'tabpanel', tabindex: 0, 'data-nav': '', 'data-scroll': '', 'aria-label': 'Help content' });
    const el = h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      h('div', { class: 'help-wrap' },
        h('div', { class: 'set-head' }, button({ label: 'Back', icon: 'back', variant: 'glass', size: 'sm', sfx: 'back', onClick: () => this.onBack() }), h('h1', { class: 'h1' }, 'Help & Credits')),
        h('div', { class: 'tabs', role: 'tablist' }, this.tabEls),
        this.body));
    this.renderTab();
    return el;
  }

  /** Coming down from content with keyboard/pad, land on the selected tab; moving along the strip switches tabs. */
  onTabFocus(e, i) {
    const nav = this.ui.nav, from = e.detail?.from;
    if (from && !this.tabEls.includes(from) && i !== this.tabIndex && (nav.device === 'keyboard' || nav.device === 'gamepad')) { nav.setFocus(this.tabEls[this.tabIndex], { silent: true }); return; }
    this.switchTab(i);
  }

  switchTab(i, focus = false) {
    i = Math.max(0, Math.min(TABS.length - 1, i));
    if (i === this.tabIndex && !focus) return;
    this.tabIndex = i;
    this.tabEls.forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    this.renderTab();
    if (focus) this.ui.nav.setFocus(this.tabEls[i]);
  }

  renderTab() {
    const id = TABS[this.tabIndex][0];
    const node = this[id]();
    node.classList.add('pop');
    this.body.replaceChildren(node);
    this.body.scrollTop = 0;
  }

  controls() {
    const b = this.app.input.bindings;
    const kb = h('div', { class: 'panel hcol' }, h('h3', {}, icon('keyboard'), 'Keyboard'),
      BIND_ACTIONS.map(([id, label]) => h('div', { class: 'hrow' }, h('span', {}, label), h('span', { class: 'k' }, (b[id] ?? []).slice(0, 2).map((c) => keycap(c))))),
      h('div', { class: 'hnote' }, 'Change these in Settings. Menus use the arrow keys, Enter and Esc.'));
    const rows = [['Steer', [padGlyph('stick')]], ['Accelerate', [padGlyph('a'), ' / ', padGlyph('rt')]], ['Brake / reverse', [padGlyph('b'), ' / ', padGlyph('lt')]], ['Drift', [padGlyph('rb')]], ['Use item', [padGlyph('x'), ' / ', padGlyph('lb')]], ['Look back', [padGlyph('y')]], ['Change camera', [padGlyph('dpad')]], ['Pause', [padGlyph('start')]]];
    const pad = h('div', { class: 'panel hcol' }, h('h3', {}, icon('gamepad'), 'Gamepad'),
      rows.map(([l, g]) => h('div', { class: 'hrow' }, h('span', {}, l), h('span', { class: 'k' }, g))),
      h('div', { class: 'hnote' }, 'Menus: D-pad or stick to move, A to select, B to go back.'));
    const touch = h('div', { class: 'panel hcol' }, h('h3', {}, icon('touch'), 'Touch'),
      h('div', { class: 'tmock' }, h('i', { class: 'pad' }, 'STEER'), h('i', { class: 'a' }, 'DRIFT'), h('i', { class: 'b' }, 'BRAKE'), h('i', { class: 'c' }, 'ITEM')),
      [['Steer', 'Drag on the left side'], ['Drift', 'Hold the orange button'], ['Item', 'Tap the blue button'], ['Brake', 'Hold the red button']].map(([l, d]) => h('div', { class: 'hrow' }, h('span', {}, l), h('span', { class: 'dim small' }, d))),
      h('div', { class: 'hnote' }, 'Auto-accelerate keeps the gas on for you. Turn it on or off in Settings.'));
    return h('div', { class: 'hcols' }, kb, pad, touch);
  }

  items() {
    const ids = ITEM_ORDER.length ? ITEM_ORDER : Object.keys(ITEM_DEFS);
    return h('div', { class: 'items-grid' }, ids.map((id, i) => {
      const d = ITEM_DEFS[id];
      let ic = null;
      try { ic = cloneCanvas(getItemIcon(id, 128)); } catch { /* icons are decoration */ }
      return h('div', { class: 'panel icard pop', style: { '--i': Math.min(i, 8) } }, ic ?? h('div', {}),
        h('div', {}, h('div', { class: 'in' }, d.name ?? id), h('div', { class: 'id' }, d.desc ?? ''), h('div', { class: 'ik' }, h('span', { class: 'chip' }, KIND_LABEL[d.kind] ?? d.kind ?? 'Item'), d.count > 1 ? h('span', { class: 'chip or', style: { marginLeft: '.3rem' } }, `×${d.count}`) : null)));
    }));
  }

  tips() {
    const card = (ico, title, text, extra) => h('div', { class: 'panel tcardx' }, h('h3', {}, icon(ico), title), h('p', {}, text), extra ?? null);
    const spark = (c, label) => h('span', { class: 'sp', style: { color: c, background: 'rgba(255,255,255,.08)' } }, h('i'), label);
    return h('div', { class: 'tips-grid' },
      card('drift', 'Drifting', 'Tap the drift button while turning to hop into a slide. Keep holding to charge sparks, then let go for a speed boost.', h('div', { class: 'sparks' }, spark('#3aa0ff', 'Blue: small'), spark('#ff9a1f', 'Orange: better'), spark('#ff3dcb', 'Pink: biggest'))),
      card('rocket', 'Rocket start', 'Hold the accelerator as the countdown reaches 1 for a burst off the line. Too early and you will burn out.'),
      card('bolt', 'Items', 'Drive through item boxes. The further back you are, the stronger the item. Hold the brake when you use an item to throw it backwards.'),
      card('flame', 'Boosts', 'Boost pads, drift boosts, rocket starts and items stack. Chain them together for the fastest laps.'),
      card('road', 'Staying on track', 'The grass slows you down, heavy karts less so. If you get stuck, respawn and a rescue drone will bring you back.'),
      card('trophy', 'Grand Prix', 'Win points in every race: 15 for first, 12 for second, 10 for third. The best total takes the trophy.'));
  }

  credits() {
    return h('div', { class: 'panel credits' },
      h('div', { class: 'logo-mini' }, 'KART RUSH ', h('b', {}, 'GP')),
      h('p', {}, 'An original arcade kart racer. Every character, track, item and sound was made up for this game, and every model, texture and sound is generated in code.'),
      h('div', {}, h('div', { class: 'cl' }, 'Engine'), h('p', {}, 'Built with three.js and plain web technology. Runs entirely in your browser, and your progress stays on your device.')),
      h('div', {}, h('div', { class: 'cl' }, 'Fonts'), h('p', {}, 'Lilita One by Juan Montoreano and Nunito by Vernon Adams, used under the SIL Open Font License 1.1.')),
      h('div', {}, h('div', { class: 'cl' }, 'Thanks'), h('p', {}, 'Thank you for playing. See you on the podium.')));
  }
}
