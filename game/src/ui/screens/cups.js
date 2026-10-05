// Cup select (Grand Prix) and Track select (Time Trial). OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, screenHeader } from '../components.js';
import { trackCard } from '../trackCard.js';
import { getCups, isCupUnlocked, trackColors, TRACK_DEFS } from '../../modes/catalog.js';
import { hintFor } from '../../modes/unlocks.js';
import { TROPHY_NAMES } from '../../modes/points.js';
import { MODE_NAMES } from '../../app/Flow.js';
import { SPEED_CLASSES } from '../../data/roster.js';
import { formatTime } from '../../core/math.js';

export const cupsCss = /* css */ `
.cup-cards{flex:1;display:flex;gap:1.6rem;align-items:center;justify-content:center;flex-wrap:wrap;z-index:2;overflow:auto;padding:.8rem .4rem 2.4rem;}
.cupcard{position:relative;width:21rem;border:0;padding:0;border-radius:1.5rem;overflow:hidden;cursor:pointer;color:#fff;text-align:left;background:linear-gradient(180deg,rgba(32,44,104,.96),rgba(14,20,52,.96));box-shadow:inset 0 0 0 .12rem rgba(255,255,255,.16),0 .5rem 0 rgba(0,0,0,.34),0 1.2rem 2.4rem rgba(0,0,0,.4);transition:transform .25s var(--ease-spring),box-shadow .2s;--tc:#ffd23f;}
.cup-head{position:relative;display:flex;align-items:center;gap:.9rem;padding:1rem 1.2rem;background:var(--tg);overflow:hidden;}
.cup-head::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.15),rgba(0,0,0,.45));}
.cup-head > *{position:relative;z-index:1;}
.cup-head .ci{width:3.6rem;height:3.6rem;border-radius:1rem;display:grid;place-items:center;font-size:2.2rem;background:linear-gradient(180deg,#ffe985,#ffd23f);color:#3a2600;box-shadow:0 .2rem 0 #9c6d06;flex:none;}
.cup-head .cn{font-family:var(--font-display);font-size:1.7rem;text-transform:uppercase;letter-spacing:.03em;line-height:1;text-shadow:0 .14rem 0 rgba(0,0,0,.5);}
.cup-head .cs{font-size:.8rem;color:#dfe6ff;margin-top:.25rem;display:flex;gap:.5rem;align-items:center;}
.cup-list{display:flex;flex-direction:column;gap:.35rem;padding:.9rem 1.2rem .6rem;}
.cup-list .ct{display:flex;align-items:center;gap:.6rem;font-size:.95rem;}
.cup-list .ct b{display:grid;place-items:center;width:1.5rem;height:1.5rem;border-radius:50%;background:rgba(255,255,255,.14);font-family:var(--font-display);font-weight:400;font-size:.85rem;flex:none;}
.cup-list .ct span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cup-list .ct .stars{display:inline-flex;color:var(--kr-warn);font-size:.8rem;}
.cup-tro{display:flex;gap:.6rem;padding:.7rem 1.2rem 1rem;border-top:.1rem solid var(--line);align-items:center;}
.cup-tro .lbl{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--kr-ink-dim);margin-right:auto;}
.tro{display:flex;flex-direction:column;align-items:center;gap:.1rem;width:3rem;}
.tro .ico{font-size:1.7rem;color:rgba(255,255,255,.2);}
.tro.gold .ico{color:#ffd23f;filter:drop-shadow(0 0 .5rem rgba(255,210,63,.7));} .tro.silver .ico{color:#cfd8ee;filter:drop-shadow(0 0 .4rem rgba(207,216,238,.5));} .tro.bronze .ico{color:#e8934f;filter:drop-shadow(0 0 .4rem rgba(232,147,79,.5));}
.tro span{font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--kr-ink-dim);}
.cupcard:hover,.cupcard.is-focus{transform:translateY(-.6rem) scale(1.04);box-shadow:inset 0 0 0 .18rem #fff,0 0 2rem var(--tc),0 .5rem 0 rgba(0,0,0,.34),0 1.4rem 2.6rem rgba(0,0,0,.45);}
.cupcard.locked > *:not(.lkov){filter:grayscale(.85) brightness(.5);}
.cupcard .lkov{position:absolute;inset:0;z-index:4;display:none;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;padding:1rem;text-align:center;background:rgba(8,12,34,.9);}
.cupcard.locked .lkov{display:flex;} .cupcard .lkov .ico{font-size:2.6rem;} .cupcard .lkov span{font-size:.92rem;color:#ffe0e8;}
.cupcard.cur::before{content:'';position:absolute;z-index:3;top:.8rem;right:.8rem;width:1.5rem;height:1.5rem;border-radius:50%;background:var(--kr-good) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310300a' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.6l4.7 4.7L19 7.4'/%3E%3C/svg%3E") center/70% no-repeat;}
.cupcard.shake{animation:shake .4s ease;}
.track-scroll{flex:1;min-height:0;overflow:auto;z-index:2;padding:.2rem .6rem .4rem;display:flex;flex-direction:column;gap:.5rem;}
.tgroup h3{margin:0 0 .7rem;display:flex;align-items:center;gap:.6rem;font-family:var(--font-display);font-weight:400;font-size:1.15rem;letter-spacing:.06em;text-transform:uppercase;color:#dfe6ff;}
.tgroup h3 .ico{color:var(--kr-warn);}
.tgrid{display:flex;flex-wrap:wrap;gap:1rem 1.1rem;padding:.6rem .3rem .8rem;}
.tt-bar{position:relative;display:flex;gap:1rem;align-items:center;justify-content:space-between;z-index:4;padding-top:.5rem;}
.tt-info{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.5rem 1rem;border-radius:1rem;background:rgba(8,12,34,.78);box-shadow:inset 0 0 0 .1rem var(--line);font-size:.9rem;}
.l-portrait .cup-cards{align-items:flex-start;} .l-portrait .cupcard{width:100%;} .l-portrait .tt-bar{flex-direction:column;align-items:stretch;}
.l-compact .cup-cards{flex-wrap:nowrap;justify-content:flex-start;padding-bottom:1rem;} .l-compact .cupcard{width:17rem;flex:none;} .l-compact .cup-head{padding:.6rem .9rem;} .l-compact .cup-head .ci{width:2.6rem;height:2.6rem;font-size:1.5rem;} .l-compact .cup-list{padding:.5rem .9rem .3rem;} .l-compact .cup-tro{padding:.4rem .9rem .6rem;}
`;

function trophyBadges(save, cupId) {
  const gp = save.data.grandPrix[cupId] ?? {};
  return Object.values(SPEED_CLASSES).map((c) => {
    const t = gp[c.id]?.trophy ?? null;
    return h('div', { class: `tro ${t ?? ''}`, title: t ? `${TROPHY_NAMES[t]} — ${c.name}` : `${c.name}: no trophy yet` }, icon('trophy'), h('span', {}, c.name[0]));
  });
}

// ------------------------------------------------------------------------------------------------ Cup select
export class CupScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, theme: this._theme ?? null, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Start Grand Prix' }, { k: 'back' }]; }
  get theme() { return this._theme; }

  build() {
    const f = this.flow, sel = f.sel;
    this.cups = getCups();
    this.cards = this.cups.map((cup, i) => {
      const locked = !isCupUnlocked(this.save, cup.id);
      const first = cup.tracks[0];
      const col = trackColors(first);
      const el = h('button', { type: 'button', class: `cupcard pop${locked ? ' locked' : ''}${cup.id === sel.cupId ? ' cur' : ''}`, style: { '--i': i, '--tc': col.primary, '--tg': `linear-gradient(135deg, ${col.skyTop}, ${col.ground})` }, 'data-nav': '', 'data-sfx': 'select', 'data-id': cup.id, 'aria-label': `${cup.name}${locked ? ', locked' : ''}`, ...(cup.id === sel.cupId ? { 'data-default': '' } : {}) },
        h('div', { class: 'cup-head' }, h('div', { class: 'ci' }, icon('cup')), h('div', {}, h('div', { class: 'cn' }, cup.name), h('div', { class: 'cs' }, `${cup.tracks.length} track${cup.tracks.length === 1 ? '' : 's'}`))),
        h('div', { class: 'cup-list' }, cup.tracks.map((t, k) => h('div', { class: 'ct' }, h('b', {}, String(k + 1)), h('span', {}, t.name), h('span', { class: 'stars' }, Array.from({ length: 3 }, (_, s) => icon(s < (t.difficulty ?? 1) ? 'star' : 'starO')))))),
        h('div', { class: 'cup-tro' }, h('span', { class: 'lbl' }, 'Trophies'), trophyBadges(this.save, cup.id)),
        h('div', { class: 'lkov' }, icon('lock'), h('b', { class: 'disp' }, 'Locked'), h('span', {}, hintFor(this.save, 'cup', cup.id))));
      el.addEventListener('navfocus', () => { this._theme = { primary: col.primary, secondary: col.ground }; this.ui._applyStage(); });
      el.addEventListener('click', () => this.confirm(cup.id, el));
      return el;
    });
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      screenHeader({ kicker: MODE_NAMES[f.mode], title: 'Choose the cup', steps: f.stepLabels(), step: f.stepIndex('cup'), back: () => this.onBack() }),
      h('div', { class: 'cup-cards', role: 'listbox', 'aria-label': 'Cups' }, this.cards));
  }

  onShow() { const s = this.flow.sel; this.app.menuScene.setKart(s.driverId, s.bodyId, { instant: true }); }

  confirm(id, el) {
    if (!isCupUnlocked(this.save, id)) { this.ui.sfx('error'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
    this.flow.sel.cupId = id;
    this.flow.launch();
  }
}

// ------------------------------------------------------------------------------------------------ Track select (Time Trial)
export class TrackScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, theme: this._theme ?? null, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Race' }, { k: 'x', label: 'Ghost on/off' }, { k: 'back' }]; }
  navOptions() { return { onBack: () => this.onBack(), onAction: (a) => { if (a === 'x') { this.toggleGhost(); return true; } return false; } }; }

  build() {
    const f = this.flow, sel = f.sel;
    this.cards = [];
    const groups = getCups().map((cup) => {
      const cupLocked = !isCupUnlocked(this.save, cup.id);
      const grid = h('div', { class: 'tgrid' }, cup.tracks.map((def, i) => {
        const locked = cupLocked;
        const rec = this.save.data.records[def.id]?.tt?.[sel.speedClass];
        const el = trackCard(def, { locked, hint: hintFor(this.save, 'cup', cup.id), cur: def.id === sel.trackId, best: rec ? { time: rec.time } : null, ghost: !!f.ghostFor(def.id, sel.speedClass) });
        el.classList.add('pop'); el.style.setProperty('--i', i);
        if (def.id === sel.trackId) el.setAttribute('data-default', '');
        el.addEventListener('navfocus', () => { this.focus(def); });
        el.addEventListener('click', () => this.confirm(def, el, locked));
        this.cards.push(el);
        return el;
      }));
      return h('div', { class: 'tgroup' }, h('h3', {}, icon('cup'), cup.name, cupLocked ? icon('lock') : null), grid);
    });
    this.ghostBtn = button({ label: '', icon: 'ghost', variant: 'glass', size: 'sm', onClick: () => this.toggleGhost(), sfx: 'select' });
    this.info = h('div', { class: 'tt-info' });
    this.updateBar(TRACK_DEFS.find((t) => t.id === sel.trackId) ?? TRACK_DEFS[0]);
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      screenHeader({ kicker: MODE_NAMES[f.mode], title: 'Choose the track', steps: f.stepLabels(), step: f.stepIndex('track'), back: () => this.onBack() }),
      h('div', { class: 'track-scroll scroll' }, groups),
      h('div', { class: 'tt-bar' }, this.info, this.ghostBtn));
  }

  onShow() { const s = this.flow.sel; this.app.menuScene.setKart(s.driverId, s.bodyId, { instant: true }); }

  focus(def) {
    const col = trackColors(def);
    this._theme = { primary: col.primary, secondary: col.ground };
    this.ui._applyStage();
    this.updateBar(def);
    this.focused = def;
  }

  updateBar(def) {
    const f = this.flow, sel = f.sel;
    const g = f.ghostFor(def.id, sel.speedClass);
    const rec = this.save.data.records[def.id]?.tt?.[sel.speedClass];
    const on = sel.ghost && !!g;
    this.info.replaceChildren(
      h('span', { class: 'chip or' }, SPEED_CLASSES[sel.speedClass].name),
      rec ? h('span', {}, icon('stopwatch'), ' Best ', h('b', { class: 'disp' }, formatTime(rec.time))) : h('span', { class: 'dim' }, 'No record yet'),
      g ? h('span', { class: 'chip ' + (on ? 'gn' : '') }, icon('ghost'), on ? 'Racing your ghost' : 'Ghost off') : h('span', { class: 'dim' }, 'Set a record to unlock your ghost'));
    this.ghostBtn.querySelector('.bl').textContent = g ? (sel.ghost ? 'Ghost: On' : 'Ghost: Off') : 'No ghost yet';
    this.ghostBtn.setAttribute('aria-disabled', g ? 'false' : 'true');
  }

  toggleGhost() {
    const f = this.flow, sel = f.sel;
    const def = this.focused ?? TRACK_DEFS.find((t) => t.id === sel.trackId) ?? TRACK_DEFS[0];
    if (!f.ghostFor(def.id, sel.speedClass)) { this.ui.sfx('error'); return; }
    sel.ghost = !sel.ghost;
    this.ui.sfx('select');
    this.updateBar(def);
  }

  confirm(def, el, locked) {
    if (locked) { this.ui.sfx('error'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
    this.flow.sel.trackId = def.id;
    this.flow.launch();
  }
}
