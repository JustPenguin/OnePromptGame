// Driver / Kart / Speed-class select screens. OWNER: Agent E.
// Focus = preview: moving the focus (d-pad, hover, Tab) swaps the 3D kart + info panel; Enter/click confirms and advances the flow.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, portrait, statBars, screenHeader } from '../components.js';
import { DRIVERS, KART_BODIES, SPEED_CLASSES, getDriver, getBody, combinedStats } from '../../data/roster.js';
import { isUnlocked, hintFor, ruleFor, progress } from '../../modes/unlocks.js';
import { MODE_NAMES } from '../../app/Flow.js';
import * as KartPortraits from '../../vehicles/portraits.js';

export const selectCss = /* css */ `
.sel-main{flex:1;display:flex;gap:1.6rem;min-height:0;align-items:flex-start;z-index:2;}
.sel-info{width:22.5rem;max-width:46vw;padding:.9rem 1.2rem 1rem;display:flex;flex-direction:column;gap:.5rem;align-self:flex-start;margin-top:.1rem;}
.si-top{display:flex;align-items:center;gap:.8rem;}
.si-top .portrait{width:3.8rem;height:3.8rem;flex:none;box-shadow:0 0 0 .18rem rgba(255,255,255,.3),0 .25rem 0 rgba(0,0,0,.3);}
.si-name{font-family:var(--font-display);font-size:2.1rem;line-height:.95;text-transform:uppercase;letter-spacing:.015em;transform:skewX(-8deg);transform-origin:left;text-shadow:0 .14rem 0 #b34700,0 .5rem 1rem rgba(0,0,0,.4);}
.si-sub{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.35rem;}
.si-tag{font-size:.92rem;color:#dfe6ff;font-style:italic;line-height:1.25;}
.si-note{font-size:.72rem;color:var(--kr-ink-dim);letter-spacing:.02em;line-height:1.2;}
.si-lock{display:none;gap:.6rem;align-items:center;padding:.45rem .7rem;border-radius:.9rem;background:rgba(255,61,106,.14);box-shadow:inset 0 0 0 .1rem rgba(255,61,106,.5);}
.si-lock.on{display:flex;animation:pop-in .4s var(--ease-spring) both;}
.si-lock .ico{font-size:1.5rem;color:#ff9fb4;flex:none;}
.si-lock b{display:block;font-family:var(--font-display);font-weight:400;letter-spacing:.05em;text-transform:uppercase;color:#ff9fb4;font-size:.95rem;}
.si-lock span{font-size:.86rem;color:#ffe0e8;}
.si-lock .pbar{height:.4rem;border-radius:9px;background:rgba(0,0,0,.4);margin-top:.35rem;overflow:hidden;}
.si-lock .pbar i{display:block;height:100%;background:linear-gradient(90deg,#ff3d6a,#ffd23f);}
.sel-fill{flex:1;min-width:0;}
.sel-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:1.2rem;z-index:2;margin-top:.4rem;}
.chips{display:flex;gap:.7rem;flex-wrap:wrap;align-items:flex-end;}
.chip-d{position:relative;display:flex;flex-direction:column;align-items:center;gap:.3rem;padding:.55rem .5rem .45rem;min-width:5.2rem;border:0;border-radius:1rem;cursor:pointer;color:#fff;background:linear-gradient(180deg,rgba(40,54,120,.9),rgba(20,28,72,.9));box-shadow:inset 0 0 0 .1rem rgba(255,255,255,.14),0 .28rem 0 rgba(0,0,0,.34);transition:transform .2s var(--ease-spring),background .15s,box-shadow .15s;}
.chip-d .portrait{width:3.7rem;height:3.7rem;transition:transform .2s var(--ease-spring);}
.chip-d .cn{font-family:var(--font-display);font-size:.95rem;letter-spacing:.04em;text-transform:uppercase;}
.chip-d:hover,.chip-d.is-focus{transform:translateY(-.35rem) scale(1.06);background:linear-gradient(180deg,#ffa23d,#ff7a1a);box-shadow:inset 0 0 0 .14rem #fff,0 0 1.3rem rgba(255,160,70,.7),0 .28rem 0 #a34400;}
.chip-d.is-focus .portrait{transform:scale(1.08);}
.chip-d.cur::after{content:'';position:absolute;top:.35rem;right:.35rem;width:1.15rem;height:1.15rem;border-radius:50%;background:var(--kr-good) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310300a' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.6l4.7 4.7L19 7.4'/%3E%3C/svg%3E") center/70% no-repeat;box-shadow:0 .1rem .3rem rgba(0,0,0,.5);}
.chip-d.locked .portrait{filter:grayscale(1) brightness(.5);}
.chip-d.locked .cn{color:var(--kr-ink-dim);}
.chip-d .lk{position:absolute;left:50%;top:1.3rem;transform:translateX(-50%);font-size:1.5rem;color:#fff;filter:drop-shadow(0 .1rem .2rem rgba(0,0,0,.8));}
.chip-d.shake{animation:shake .4s ease;}
@keyframes shake{20%{transform:translateX(-.5rem)}40%{transform:translateX(.5rem)}60%{transform:translateX(-.35rem)}80%{transform:translateX(.35rem)}}
.kart-cards{display:flex;gap:.8rem;flex-wrap:wrap;}
.kcard{position:relative;width:11.4rem;padding:.7rem .8rem .75rem;border:0;border-radius:1.1rem;cursor:pointer;color:#fff;text-align:left;background:linear-gradient(180deg,rgba(40,54,120,.9),rgba(20,28,72,.9));box-shadow:inset 0 0 0 .1rem rgba(255,255,255,.14),0 .3rem 0 rgba(0,0,0,.34);transition:transform .2s var(--ease-spring),background .15s,box-shadow .15s;}
.kcard svg.ks{display:block;width:100%;height:3.4rem;color:#c9d4f5;}
.kcard .cn{font-family:var(--font-display);font-size:1.1rem;letter-spacing:.04em;text-transform:uppercase;margin-top:.35rem;}
.kcard .cs{font-size:.74rem;color:var(--kr-ink-dim);line-height:1.2;min-height:1.8rem;}
.kcard:hover,.kcard.is-focus{transform:translateY(-.35rem) scale(1.05);background:linear-gradient(180deg,#ffa23d,#ff7a1a);box-shadow:inset 0 0 0 .14rem #fff,0 0 1.3rem rgba(255,160,70,.7),0 .3rem 0 #a34400;}
.kcard.is-focus svg.ks,.kcard:hover svg.ks{color:#fff;} .kcard.is-focus .cs,.kcard:hover .cs{color:#fff2dc;}
.kcard.locked svg.ks{opacity:.35;} .kcard.locked .lk{position:absolute;right:.7rem;top:.6rem;font-size:1.4rem;}
.kcard.cur::after{content:'';position:absolute;top:.5rem;left:.5rem;width:1.15rem;height:1.15rem;border-radius:50%;background:var(--kr-good) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310300a' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.6l4.7 4.7L19 7.4'/%3E%3C/svg%3E") center/70% no-repeat;}
.class-cards{flex:1;display:flex;gap:1.2rem;align-items:center;justify-content:center;flex-wrap:wrap;z-index:2;}
.ccard{position:relative;width:15.5rem;min-height:21rem;padding:1.2rem 1.2rem 1.1rem;border:0;border-radius:1.4rem;cursor:pointer;color:#fff;text-align:left;display:flex;flex-direction:column;gap:.5rem;background:linear-gradient(180deg,rgba(32,44,104,.94),rgba(14,20,52,.94));box-shadow:inset 0 0 0 .12rem rgba(255,255,255,.16),0 .5rem 0 rgba(0,0,0,.32),0 1.2rem 2.4rem rgba(0,0,0,.4);transition:transform .25s var(--ease-spring),box-shadow .2s;overflow:hidden;--cc:#7be04a;--cc2:#b5f67d;}
.ccard::before{content:'';position:absolute;inset:0 0 auto 0;height:5.2rem;background:linear-gradient(180deg,var(--cc2),var(--cc));opacity:.9;}
.ccard > *{position:relative;}
.ccard.pro{--cc:#ff7a1a;--cc2:#ffb04a;} .ccard.master{--cc:#ff3d6a;--cc2:#ff8fa8;}
.ccard .flames{display:flex;gap:.1rem;height:2.6rem;align-items:flex-end;color:#fff;filter:drop-shadow(0 .14rem 0 rgba(0,0,0,.35));font-size:2.2rem;}
.ccard .flames .ico.off{opacity:.3;}
.ccard .cn{font-family:var(--font-display);font-size:2rem;text-transform:uppercase;letter-spacing:.03em;margin-top:.9rem;text-shadow:0 .14rem 0 rgba(0,0,0,.4);}
.ccard .cd{font-size:.93rem;color:#dfe6ff;line-height:1.3;flex:1;}
.ccard .cm{display:flex;gap:.4rem;flex-wrap:wrap;}
.ccard:hover,.ccard.is-focus{transform:translateY(-.6rem) scale(1.04);box-shadow:inset 0 0 0 .18rem #fff,0 0 2rem var(--cc),0 .5rem 0 rgba(0,0,0,.32),0 1.4rem 2.6rem rgba(0,0,0,.45);}
.ccard.locked{filter:saturate(.4) brightness(.8);} .ccard.locked .lkov{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;background:#0a0f2a;padding:1rem;text-align:center;}
.ccard .lkov .ico{font-size:2.6rem;color:#ff9fb4;} .ccard .lkov b{font-size:1.4rem;} .ccard .lkov span{font-size:.92rem;color:#ffe0e8;}
.ccard.cur::after{content:'';position:absolute;top:.7rem;right:.7rem;width:1.5rem;height:1.5rem;border-radius:50%;background:var(--kr-good) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310300a' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.6l4.7 4.7L19 7.4'/%3E%3C/svg%3E") center/70% no-repeat;}
.l-portrait .sel-main{display:contents;} .l-portrait .sel-fill{order:1;flex:1;min-height:7rem;} .l-portrait .sel-info{order:2;width:100%;max-width:none;padding:.7rem .9rem;gap:.4rem;margin-top:0;} .l-portrait .sel-foot{order:3;} .l-portrait .si-name{font-size:1.7rem;} .l-portrait .si-top .portrait{width:3.2rem;height:3.2rem;} .l-portrait .si-tag{font-size:.82rem;} .l-portrait .si-note{display:none;} .l-portrait .stats{gap:.3rem!important;} .l-portrait .h1{font-size:2.1rem;}
.l-portrait .si-tag{min-height:0;} .l-portrait .si-note{display:none;}
.l-portrait .chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));width:100%;} .l-portrait .chip-d{min-width:0;padding:.4rem .2rem .35rem;} .l-portrait .chip-d .portrait{width:2.9rem;height:2.9rem;} .l-portrait .chip-d .cn{font-size:.78rem;}
.l-portrait .sel-foot{flex-direction:column;align-items:stretch;} .l-portrait .sel-foot > .btn{align-self:center;}
.l-portrait .kart-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;} .l-portrait .kcard{width:auto;}
.l-portrait .class-cards{flex-direction:column;flex-wrap:nowrap;gap:.8rem;justify-content:flex-start;align-items:stretch;overflow:auto;padding:.3rem .2rem 1rem;} .l-portrait .ccard{width:100%;min-height:7.6rem;display:grid;grid-template-columns:4.6rem minmax(0,1fr);grid-template-rows:auto auto auto;column-gap:.9rem;row-gap:.25rem;align-items:center;padding:.8rem 1rem .8rem 0;} .l-portrait .ccard::before{width:4.6rem;height:100%;inset:0 auto 0 0;} .l-portrait .ccard .flames{grid-row:1/4;grid-column:1;justify-content:center;flex-direction:column-reverse;height:auto;align-items:center;font-size:1.3rem;gap:.1rem;} .l-portrait .ccard .cn{grid-column:2;margin:0;font-size:1.5rem;} .l-portrait .ccard .cd{grid-column:2;font-size:.82rem;} .l-portrait .ccard .cm{grid-column:2;} .l-portrait .ccard .lkov{padding:.5rem;}
.l-compact .sel-main{gap:1rem;} .l-compact .sel-info{width:15rem;padding:.5rem .7rem;gap:.3rem;margin-top:0;} .l-compact .si-name{font-size:1.5rem;} .l-compact .si-top{gap:.6rem;} .l-compact .si-top .portrait{width:2.6rem;height:2.6rem;} .l-compact .si-sub{margin-top:.15rem;} .l-compact .si-sub .chip{padding:.05rem .5rem;font-size:.68rem;} .l-compact .si-tag{display:none;} .l-compact .si-note{display:none;} .l-compact .stat{grid-template-columns:3.7rem 1fr 2.4rem;font-size:.62rem;gap:.35rem;} .l-compact .stats{gap:.18rem!important;} .l-compact .stat .seg5{height:.55rem;} .l-compact .stat .val{font-size:.8rem;}
.l-compact .chips{gap:.35rem;flex-wrap:nowrap;} .l-compact .chip-d{min-width:3.4rem;padding:.25rem .2rem .2rem;border-radius:.7rem;} .l-compact .chip-d .portrait{width:2.2rem;height:2.2rem;} .l-compact .chip-d .cn{font-size:.6rem;} .l-compact .chip-d .lk{top:.8rem;font-size:1rem;}
.l-compact .kart-cards{gap:.45rem;flex-wrap:nowrap;} .l-compact .kcard{width:8rem;padding:.35rem .5rem .4rem;} .l-compact .kcard svg.ks{height:1.7rem;} .l-compact .kcard .cn{font-size:.8rem;margin-top:.1rem;} .l-compact .kcard .cs{display:none;}
.l-compact .sel-foot{margin-top:.2rem;} .l-compact .sel-foot > .btn{display:none;}
.l-compact .ccard{width:11rem;min-height:12.5rem;padding:.6rem .8rem;} .l-compact .ccard .cn{font-size:1.4rem;margin-top:.4rem;} .l-compact .ccard .cd{font-size:.74rem;} .l-compact .ccard::before{height:3.2rem;} .l-compact .ccard .flames{font-size:1.4rem;height:1.6rem;} .l-compact .class-cards{gap:.9rem;}
`;

// ------------------------------------------------------------------------------------------------ helpers
const dyn = (ns, key) => ns[key];   // dynamic lookup: Agent C may or may not export getKartPortrait yet (avoids a static missing-export warning)

/** Side-view silhouettes (original art) for the four kart bodies. */
export function kartSilhouette(bodyId) {
  const wheel = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0b1030"/><circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="currentColor" opacity=".9"/>`;
  const shapes = {
    classic: `<path d="M12 40h78c5 0 8-3 8-7v-5c0-3-2-5-5-5H78l-9-12c-1-1-2-2-4-2H50c-2 0-3 1-4 2l-6 9H22c-5 0-10 4-10 9z" fill="currentColor"/><rect x="88" y="14" width="3" height="14" rx="1.5" fill="currentColor"/><rect x="82" y="12" width="15" height="3.5" rx="1.7" fill="currentColor"/>${wheel(30, 44, 9.5)}${wheel(80, 44, 9.5)}`,
    streak: `<path d="M6 41h92c4 0 6-2 6-5v-4c-3-3-10-6-22-8L66 22c-4-3-9-4-14-4H44c-4 0-7 1-9 3l-6 7H10c-3 0-5 2-5 5z" fill="currentColor"/><path d="M96 12h16v4H98l-3 14h-4z" fill="currentColor"/>${wheel(28, 43, 8.5)}${wheel(84, 43, 8.5)}`,
    hopper: `<path d="M14 40h74c4 0 7-3 7-7v-6c0-2-2-4-4-4H74l-7-10H48l-5 10H22c-5 0-8 3-8 7z" fill="currentColor"/><path d="M40 28V12c0-2 2-3 4-3h26c2 0 4 1 4 3v6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>${wheel(26, 42, 9)}${wheel(84, 40, 13)}`,
    crusher: `<path d="M10 42h92c3 0 5-2 5-5V22c0-3-2-5-5-5H84l-5-8H44l-6 8H18c-4 0-8 3-8 7z" fill="currentColor"/><rect x="103" y="26" width="7" height="14" rx="2" fill="currentColor"/><rect x="18" y="1" width="4" height="16" rx="2" fill="currentColor"/><rect x="26" y="3" width="4" height="14" rx="2" fill="currentColor"/>${wheel(30, 43, 11)}${wheel(84, 43, 11)}`,
  };
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 120 56'); el.setAttribute('class', 'ks'); el.setAttribute('aria-hidden', 'true');
  el.innerHTML = shapes[bodyId] ?? shapes.classic;
  return el;
}

/** Info panel shared by driver + kart screens. */
function infoPanel() {
  const stats = statBars();
  const lockBar = h('i');
  const lockText = h('span');
  const lock = h('div', { class: 'si-lock' }, icon('lock'), h('div', { style: { flex: 1 } }, h('b', {}, 'Locked'), lockText, h('div', { class: 'pbar' }, lockBar)));
  const ph = h('div', { class: 'si-pt' });
  const name = h('div', { class: 'si-name' });
  const sub = h('div', { class: 'si-sub' });
  const tag = h('div', { class: 'si-tag' });
  const note = h('div', { class: 'si-note' });
  const el = h('div', { class: 'sel-info panel slide-l' }, h('div', { class: 'si-top' }, ph, h('div', {}, name, sub)), tag, stats.el, note, lock);
  return {
    el, stats,
    set({ title, chips, tagline, statsNow, statsBase, noteText, portraitEl, locked, hint, prog }) {
      name.textContent = title; tag.textContent = tagline; note.textContent = noteText ?? '';
      sub.replaceChildren(...chips);
      ph.replaceChildren(portraitEl ?? '');
      stats.set(statsNow, statsBase);
      lock.classList.toggle('on', !!locked);
      lockText.textContent = hint ?? '';
      lockBar.style.width = prog ? `${Math.round((prog.cur / prog.goal) * 100)}%` : '0%';
      lock.querySelector('.pbar').style.display = prog && prog.goal > 1 ? 'block' : 'none';
    },
  };
}

function cardHeader(screen, id, title) {
  const f = screen.flow;
  return screenHeader({ kicker: MODE_NAMES[f.mode], title, steps: f.stepLabels(), step: f.stepIndex(id), back: () => screen.onBack() });
}

// ------------------------------------------------------------------------------------------------ Driver
export class DriverScreen extends Screen {
  get stage() { return { preset: 'select', kart: true, theme: null, comp: (l) => (l.mode === 'portrait' ? { x: 0, y: -0.2 } : l.mode === 'compact' ? { x: 0.2, y: 0.04 } : { x: 0.17, y: 0.02 }) }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Choose' }, { k: 'back' }]; }

  build() {
    const sel = this.flow.sel;
    this.cur = sel.driverId;
    this.panel = infoPanel();
    this.chips = DRIVERS.map((d, i) => {
      const locked = !isUnlocked(this.save, 'driver', d.id);
      const b = h('button', { type: 'button', class: `chip-d pop${locked ? ' locked' : ''}${d.id === sel.driverId ? ' cur' : ''}`, style: { '--i': i }, 'data-nav': '', 'data-sfx': 'select', 'data-id': d.id, 'aria-label': `${d.name}, ${d.species}${locked ? ', locked' : ''}`, ...(d.id === sel.driverId ? { 'data-default': '' } : {}) },
        portrait(d.id, 60), h('span', { class: 'cn' }, d.name), locked ? icon('lock', { cls: 'lk' }) : null);
      b.addEventListener('navfocus', () => this.preview(d.id));
      b.addEventListener('click', () => { if (this.ui.nav.device === 'touch' && this.cur !== d.id) { this.preview(d.id); this.ui.nav.setFocus(b, { silent: true }); return; } this.confirm(d.id, b); });
      return b;
    });
    this.go = button({ label: 'Choose', icon: 'right', variant: 'green', onClick: () => this.confirm(this.cur), sfx: 'confirm' });
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-bottom' }), h('div', { class: 'scrim-top' }),
      cardHeader(this, 'driver', 'Choose your driver'),
      h('div', { class: 'sel-main' }, this.panel.el, h('div', { class: 'sel-fill' })),
      h('div', { class: 'sel-foot' }, h('div', { class: 'chips', role: 'listbox', 'aria-label': 'Drivers' }, this.chips), this.go));
  }

  onShow() { this.preview(this.cur, true); }

  preview(id, instant = false) {
    this.cur = id;
    const sel = this.flow.sel;
    const d = getDriver(id), body = getBody(sel.bodyId);
    const locked = !isUnlocked(this.save, 'driver', id);
    const rule = ruleFor('driver', id);
    this.panel.set({
      title: d.name, chips: [h('span', { class: 'chip cy' }, icon('user'), d.species)], tagline: `"${d.tagline}"`,
      statsNow: combinedStats(id, sel.bodyId), noteText: `Stats include your ${body.name}.`,
      portraitEl: portrait(id, 74), locked, hint: locked ? hintFor(this.save, 'driver', id) : '', prog: rule ? progress(rule, this.save.data) : null,
    });
    this.app.menuScene.setKart(id, sel.bodyId, { instant, silhouette: locked });
    this.go.classList.toggle('lockdim', locked);
    this.go.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }

  confirm(id, chip) {
    if (!isUnlocked(this.save, 'driver', id)) { this.denied(chip ?? this.chips.find((c) => c.dataset.id === id)); return; }
    this.flow.sel.driverId = id;
    this.app.menuScene.pulse(getDriver(id).colors.primary);
    this.flow.next('driver');
  }

  denied(chip) {
    this.ui.sfx('error');
    if (chip) { chip.classList.remove('shake'); void chip.offsetWidth; chip.classList.add('shake'); }
  }
}

// ------------------------------------------------------------------------------------------------ Kart
export class KartScreen extends Screen {
  get stage() { return { preset: 'select', kart: true, theme: null, comp: (l) => (l.mode === 'portrait' ? { x: 0, y: -0.2 } : l.mode === 'compact' ? { x: 0.2, y: 0.04 } : { x: 0.17, y: 0.02 }) }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Choose' }, { k: 'back' }]; }

  build() {
    const sel = this.flow.sel;
    this.cur = sel.bodyId;
    this.base = combinedStats(sel.driverId, sel.bodyId);
    this.panel = infoPanel();
    this.cards = KART_BODIES.map((b, i) => {
      const locked = !isUnlocked(this.save, 'body', b.id);
      const el = h('button', { type: 'button', class: `kcard pop${locked ? ' locked' : ''}${b.id === sel.bodyId ? ' cur' : ''}`, style: { '--i': i }, 'data-nav': '', 'data-sfx': 'select', 'data-id': b.id, 'aria-label': `${b.name}${locked ? ', locked' : ''}`, ...(b.id === sel.bodyId ? { 'data-default': '' } : {}) },
        kartSilhouette(b.id), h('div', { class: 'cn' }, b.name), h('div', { class: 'cs' }, b.tagline), locked ? icon('lock', { cls: 'lk' }) : null);
      el.addEventListener('navfocus', () => this.preview(b.id));
      el.addEventListener('click', () => { if (this.ui.nav.device === 'touch' && this.cur !== b.id) { this.preview(b.id); this.ui.nav.setFocus(el, { silent: true }); return; } this.confirm(b.id, el); });
      return el;
    });
    this.go = button({ label: 'Choose', icon: 'right', variant: 'green', onClick: () => this.confirm(this.cur), sfx: 'confirm' });
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-bottom' }), h('div', { class: 'scrim-top' }),
      cardHeader(this, 'kart', 'Pick your kart'),
      h('div', { class: 'sel-main' }, this.panel.el, h('div', { class: 'sel-fill' })),
      h('div', { class: 'sel-foot' }, h('div', { class: 'kart-cards', role: 'listbox', 'aria-label': 'Karts' }, this.cards), this.go));
  }

  onShow() { this.preview(this.cur, true); }

  preview(id, instant = false) {
    this.cur = id;
    const sel = this.flow.sel;
    const b = getBody(id), d = getDriver(sel.driverId);
    const locked = !isUnlocked(this.save, 'body', id);
    const rule = ruleFor('body', id);
    const kp = dyn(KartPortraits, 'getKartPortrait');
    this.panel.set({
      title: b.name, chips: [h('span', { class: 'chip or' }, icon('flag'), 'Kart body')], tagline: `"${b.tagline}"`,
      statsNow: combinedStats(sel.driverId, id), statsBase: id === sel.bodyId ? null : this.base, noteText: `Stats include ${d.name}. Green and red show the change.`,
      portraitEl: portrait(sel.driverId, 74), locked, hint: locked ? hintFor(this.save, 'body', id) : '', prog: rule ? progress(rule, this.save.data) : null,
    });
    void kp;
    this.app.menuScene.setKart(sel.driverId, id, { instant, silhouette: locked });
    this.go.classList.toggle('lockdim', locked);
    this.go.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }

  confirm(id, el) {
    if (!isUnlocked(this.save, 'body', id)) { this.ui.sfx('error'); if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } return; }
    this.flow.sel.bodyId = id;
    this.app.menuScene.pulse('#ffffff');
    this.flow.next('kart');
  }
}

// ------------------------------------------------------------------------------------------------ Speed class
const CLASS_INFO = {
  rookie: { flames: 1, desc: 'A relaxed pace. Rivals make mistakes and the road is forgiving. Ideal for learning the tracks.', chips: ['Gentle rivals', 'Top speed 84%'] },
  pro: { flames: 2, desc: 'The standard challenge. Rivals drive clean lines and fight for every position.', chips: ['Clean rivals', 'Top speed 92%'] },
  master: { flames: 3, desc: 'Full speed and ruthless rivals. Every mistake costs you the win.', chips: ['Ruthless rivals', 'Top speed 100%'] },
};

export class ClassScreen extends Screen {
  get stage() { return { preset: 'wide', kart: false, theme: null, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Choose' }, { k: 'back' }]; }

  build() {
    const sel = this.flow.sel;
    this.cards = Object.values(SPEED_CLASSES).map((c, i) => {
      const info = CLASS_INFO[c.id];
      const locked = !isUnlocked(this.save, 'speedClass', c.id);
      const el = h('button', { type: 'button', class: `ccard ${c.id} pop${locked ? ' locked' : ''}${c.id === sel.speedClass ? ' cur' : ''}`, style: { '--i': i }, 'data-nav': '', 'data-sfx': 'select', 'data-id': c.id, 'aria-label': `${c.name} class${locked ? ', locked' : ''}`, ...(c.id === sel.speedClass ? { 'data-default': '' } : {}) },
        h('div', { class: 'flames' }, [0, 1, 2].map((k) => icon('flame', { cls: k < info.flames ? '' : 'off' }))),
        h('div', { class: 'cn' }, c.name), h('div', { class: 'cd' }, info.desc),
        h('div', { class: 'cm' }, info.chips.map((t) => h('span', { class: 'chip' }, t))),
        locked ? h('div', { class: 'lkov' }, icon('lock'), h('b', { class: 'disp' }, 'Locked'), h('span', {}, hintFor(this.save, 'speedClass', c.id))) : null);
      el.addEventListener('click', () => this.confirm(c.id, el));
      el.addEventListener('navfocus', () => this.app.menuScene.pulse(['#7be04a', '#ff9a1f', '#ff3d6a'][i]));
      return el;
    });
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      cardHeader(this, 'class', 'Choose the class'),
      h('div', { class: 'class-cards', role: 'listbox', 'aria-label': 'Speed class' }, this.cards));
  }

  onShow() { this.app.menuScene.setKart(this.flow.sel.driverId, this.flow.sel.bodyId, { instant: true }); }

  confirm(id, el) {
    if (!isUnlocked(this.save, 'speedClass', id)) { this.ui.sfx('error'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
    this.flow.sel.speedClass = id;
    this.flow.next('class');
  }
}
