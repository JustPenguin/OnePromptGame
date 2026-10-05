// Records: best times per track, Grand Prix trophies, career stats + unlock progress. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, portrait } from '../components.js';
import { paintOutline } from '../trackCard.js';
import { getCups, isCupUnlocked, trackColors } from '../../modes/catalog.js';
import { UNLOCK_RULES, isUnlocked, progress, unlockName } from '../../modes/unlocks.js';
import { ACHIEVEMENTS } from '../../modes/achievements.js';
import { TROPHY_NAMES } from '../../modes/points.js';
import { DRIVERS, KART_BODIES, SPEED_CLASSES, getDriver, getBody } from '../../data/roster.js';
import { formatTime } from '../../core/math.js';

export const recordsCss = /* css */ `
.s-records{align-items:center;}
.s-records .scrim-all{background:radial-gradient(120% 100% at 50% 40%,rgba(6,9,26,.6),rgba(6,9,26,.92));}
.rec-wrap{width:min(62rem,96vw);flex:1;min-height:0;display:flex;flex-direction:column;gap:.7rem;z-index:2;}
.rec-body{flex:1;min-height:0;} .rec-body > *{flex:none;}
.rec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem;padding:.3rem .2rem 1rem;}
.rcard{padding:.7rem .9rem .8rem;border-radius:1.1rem;}
.rcard.locked{opacity:.5;filter:grayscale(.8);}
.rc-head{display:flex;align-items:center;gap:.8rem;margin-bottom:.5rem;}
.rc-head canvas{width:3.6rem;height:3rem;border-radius:.6rem;background:var(--tg);flex:none;}
.rc-head .tn{font-family:var(--font-display);font-size:1.15rem;text-transform:uppercase;letter-spacing:.03em;line-height:1;}
.rc-head .tc{font-size:.72rem;color:var(--kr-ink-dim);margin-top:.2rem;}
.rtab{display:grid;grid-template-columns:5.6rem repeat(3,minmax(0,1fr));gap:.25rem .4rem;align-items:center;font-size:.82rem;}
.rtab .c{font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--kr-ink-dim);text-align:center;}
.rtab .l{font-size:.74rem;color:#b8c4f5;font-weight:900;}
.rtab .v{display:flex;align-items:center;justify-content:center;gap:.3rem;min-height:1.7rem;border-radius:.5rem;background:rgba(255,255,255,.06);font-family:var(--font-display);font-size:.88rem;font-variant-numeric:tabular-nums;}
.rtab .v.none{color:rgba(255,255,255,.25);font-family:var(--font-ui);}
.rtab .v .portrait{width:1.25rem;height:1.25rem;}
.rtab .v.best{background:linear-gradient(90deg,rgba(255,210,63,.3),rgba(255,210,63,.1));color:#ffe27a;}
.tro-grid{display:grid;gap:.7rem;padding:.3rem .2rem;}
.tro-cup{padding:.8rem 1rem;border-radius:1.1rem;display:grid;grid-template-columns:minmax(0,1fr) repeat(3,6.6rem);gap:.8rem;align-items:center;}
.tro-cup .cn{font-family:var(--font-display);font-size:1.3rem;text-transform:uppercase;} .tro-cup .cs{font-size:.78rem;color:var(--kr-ink-dim);}
.tro-cell{display:flex;flex-direction:column;align-items:center;gap:.15rem;padding:.5rem .3rem;border-radius:.9rem;background:rgba(255,255,255,.06);}
.tro-cell .ico{font-size:2.4rem;color:rgba(255,255,255,.18);} .tro-cell.gold .ico{color:#ffd23f;filter:drop-shadow(0 0 .6rem rgba(255,210,63,.6));} .tro-cell.silver .ico{color:#cfd8ee;filter:drop-shadow(0 0 .5rem rgba(207,216,238,.5));} .tro-cell.bronze .ico{color:#e8934f;filter:drop-shadow(0 0 .5rem rgba(232,147,79,.5));}
.tro-cell b{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--kr-ink-dim);font-weight:900;} .tro-cell span{font-family:var(--font-display);font-size:.9rem;}
.stat-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.6rem;padding:.3rem .2rem;}
.stile{padding:.7rem .8rem;border-radius:1rem;background:rgba(255,255,255,.07);} .stile b{display:block;font-family:var(--font-display);font-weight:400;font-size:1.6rem;line-height:1.1;} .stile span{font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--kr-ink-dim);font-weight:900;}
.coll{display:flex;flex-wrap:wrap;gap:.6rem;padding:.2rem;}
.cit{position:relative;display:flex;flex-direction:column;align-items:center;gap:.2rem;width:4.6rem;padding:.4rem .2rem;border-radius:.9rem;background:rgba(255,255,255,.06);font-size:.68rem;font-weight:900;text-align:center;}
.cit .portrait{width:2.8rem;height:2.8rem;} .cit.locked .portrait{filter:grayscale(1) brightness(.45);} .cit.locked{color:var(--kr-ink-dim);} .cit .lk{position:absolute;left:50%;top:1rem;transform:translateX(-50%);font-size:1.2rem;}
.cit .kk{width:2.8rem;height:2.8rem;border-radius:.7rem;display:grid;place-items:center;background:rgba(255,255,255,.1);font-size:1.5rem;}
.nxt{display:flex;flex-direction:column;gap:.4rem;padding:.2rem;} .nxt .ni{display:grid;grid-template-columns:2.2rem minmax(0,1fr);gap:.7rem;align-items:center;padding:.5rem .7rem;border-radius:.9rem;background:rgba(255,255,255,.06);} .nxt .ni .portrait,.nxt .ni .nic{width:2.2rem;height:2.2rem;} .nxt .ni .nic{border-radius:.6rem;display:grid;place-items:center;background:rgba(255,255,255,.1);font-size:1.2rem;}
.nxt .nt{font-family:var(--font-display);font-size:.98rem;} .nxt .ns{font-size:.78rem;color:var(--kr-ink-dim);} .nxt .pb{height:.35rem;border-radius:9px;background:rgba(0,0,0,.4);margin-top:.3rem;overflow:hidden;} .nxt .pb i{display:block;height:100%;background:linear-gradient(90deg,#22d3ff,#7be04a);}
.ach-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;padding:.2rem;} .ach{display:flex;gap:.7rem;align-items:center;padding:.5rem .7rem;border-radius:.9rem;background:rgba(255,255,255,.05);opacity:.6;} .ach .ai{width:2.3rem;height:2.3rem;border-radius:.7rem;display:grid;place-items:center;font-size:1.3rem;flex:none;background:rgba(255,255,255,.1);} .ach.got{opacity:1;background:linear-gradient(90deg,rgba(255,210,63,.18),rgba(255,255,255,.05));box-shadow:inset 0 0 0 .08rem rgba(255,210,63,.45);} .ach.got .ai{background:linear-gradient(180deg,#ffe985,#ffd23f);color:#3a2600;} .ach .an{font-family:var(--font-display);font-size:.92rem;line-height:1.05;} .ach .ad{font-size:.72rem;color:var(--kr-ink-dim);margin-top:.1rem;line-height:1.2;}
.l-portrait .ach-grid{grid-template-columns:1fr;} .l-compact .ach-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
.l-portrait .rec-grid{grid-template-columns:1fr;} .l-portrait .stat-tiles{grid-template-columns:repeat(2,minmax(0,1fr));} .l-portrait .tro-cup{grid-template-columns:repeat(3,1fr);} .l-portrait .tro-cup > div:first-child{grid-column:1/-1;}
.l-compact .rec-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .l-compact .stat-tiles{grid-template-columns:repeat(4,minmax(0,1fr));} .l-compact .rec-wrap{width:96vw;}
`;

const TABS = [['times', 'Times', 'stopwatch'], ['trophies', 'Trophies', 'trophy'], ['career', 'Career', 'chart']];
const CLASSES = Object.values(SPEED_CLASSES);

const fmtMin = (sec) => { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const fmtPlay = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.floor(sec / 60)}m`);

export class RecordsScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'tab' }, { k: 'back' }]; }
  navOptions() { return { onBack: () => this.onBack(), onTab: (d) => { this.switchTab(this.tabIndex + d, true); return true; } }; }

  build() {
    this.tabIndex = Math.max(0, TABS.findIndex((t) => t[0] === (this.params.tab ?? 'times')));
    this.tabEls = TABS.map(([id, label, ico], i) => {
      const el = h('button', { type: 'button', class: 'tab', role: 'tab', 'data-nav': '', 'data-sfx': 'tick', 'aria-selected': String(i === this.tabIndex), ...(i === this.tabIndex ? { 'data-default': '' } : {}) }, h('span', {}, icon(ico), label));
      el.addEventListener('navfocus', (e) => this.onTabFocus(e, i));
      el.addEventListener('click', () => this.switchTab(i));
      return el;
    });
    this.body = h('div', { class: 'rec-body scroll', role: 'tabpanel', tabindex: 0, 'data-nav': '', 'data-scroll': '', 'aria-label': 'Records' });
    const el = h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      h('div', { class: 'rec-wrap' },
        h('div', { class: 'set-head' }, button({ label: 'Back', icon: 'back', variant: 'glass', size: 'sm', sfx: 'back', onClick: () => this.onBack() }), h('h1', { class: 'h1' }, 'Records')),
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
    const node = id === 'times' ? this.times() : id === 'trophies' ? this.trophies() : this.career();
    node.classList.add('pop');
    this.body.replaceChildren(node);
    this.body.scrollTop = 0;
  }

  // ---- best times
  times() {
    const save = this.app.save;
    const groups = getCups().map((cup) => {
      const locked = !isCupUnlocked(save, cup.id);
      return h('div', {},
        h('div', { class: 'set-h', style: { display: 'flex', alignItems: 'center', gap: '.5rem' } }, icon('cup'), cup.name, locked ? icon('lock') : null),
        h('div', { class: 'rec-grid' }, cup.tracks.map((def) => this.trackCard(def, locked))));
    });
    return h('div', {}, groups.length ? groups : h('div', { class: 'set-note' }, 'No tracks yet.'));
  }

  trackCard(def, locked) {
    const rec = this.app.save.data.records[def.id] ?? {};
    const col = trackColors(def);
    const canvas = h('canvas', { width: 144, height: 120 });
    paintOutline(canvas, def, { pad: 10, lineWidth: 6 });
    const cell = (kind, cls) => {
      const e = rec[kind]?.[cls];
      if (!e) return h('div', { class: 'v none' }, '—');
      const by = e.by?.driverId ? portrait(e.by.driverId, 20) : null;
      return h('div', { class: 'v', title: e.by?.driverId ? `${getDriver(e.by.driverId).name} · ${getBody(e.by.bodyId).name}` : '' }, formatTime(e.time), by);
    };
    const best = (kind) => { let b = Infinity; for (const c of CLASSES) { const e = rec[kind]?.[c.id]; if (e && e.time < b) b = e.time; } return b; };
    const table = h('div', { class: 'rtab' },
      h('span'), CLASSES.map((c) => h('span', { class: 'c' }, c.name)),
      [['tt', 'Time trial'], ['lap', 'Best lap'], ['race', 'Race']].flatMap(([kind, label]) => {
        const b = best(kind);
        return [h('span', { class: 'l' }, label), ...CLASSES.map((c) => { const el = cell(kind, c.id); if (rec[kind]?.[c.id]?.time === b) el.classList.add('best'); return el; })];
      }));
    return h('div', { class: `panel rcard${locked ? ' locked' : ''}`, style: { '--tg': `linear-gradient(160deg, ${col.skyTop}, ${col.ground})` } },
      h('div', { class: 'rc-head' }, canvas, h('div', {}, h('div', { class: 'tn' }, def.name), h('div', { class: 'tc', style: { display: 'flex', alignItems: 'center', gap: '.3rem' } }, locked ? 'Locked' : [`${def.laps ?? 3} laps`, ...Array.from({ length: def.difficulty ?? 1 }, () => icon('star', { cls: 'gold' }))]))),
      table);
  }

  // ---- trophies
  trophies() {
    const save = this.app.save;
    return h('div', { class: 'tro-grid' }, getCups().map((cup) => {
      const gp = save.data.grandPrix[cup.id] ?? {};
      const locked = !isCupUnlocked(save, cup.id);
      return h('div', { class: `panel tro-cup${locked ? ' locked' : ''}`, style: locked ? { opacity: '.55' } : null },
        h('div', {}, h('div', { class: 'cn' }, cup.name), h('div', { class: 'cs' }, locked ? 'Locked' : `${cup.tracks.length} track${cup.tracks.length === 1 ? '' : 's'}`)),
        CLASSES.map((c) => {
          const e = gp[c.id];
          return h('div', { class: `tro-cell ${e?.trophy ?? ''}`, title: e?.trophy ? TROPHY_NAMES[e.trophy] : 'No trophy yet' }, icon('trophy'), h('b', {}, c.name), h('span', {}, e ? `${e.points} pts` : '—'));
        }));
    }));
  }

  // ---- career
  career() {
    const save = this.app.save, st = save.data.stats;
    const wr = st.races ? Math.round((st.wins / st.races) * 100) : 0;
    const records = Object.values(save.data.records).reduce((n, r) => n + Object.values(r).reduce((t, k) => t + Object.keys(k).length, 0), 0);
    const tiles = [
      ['Races', st.races], ['Wins', st.wins], ['Podiums', st.podiums], ['Win rate', `${wr}%`],
      ['Distance', `${(st.distance / 1000).toFixed(1)} km`], ['Drifting', fmtMin(st.driftSeconds)], ['Top speed', `${Math.round(st.topSpeed)} km/h`], ['Play time', fmtPlay(st.playSeconds)],
      ['Items hit', st.itemsHit], ['Hits taken', st.hitsTaken], ['Boosts', st.boosts], ['Overtakes', st.overtakes],
      ['Laps', st.laps], ['Cups played', st.gpPlayed], ['Cups won', st.gpWon], ['Records set', records],
    ];
    const coll = (title, items) => h('div', {}, h('div', { class: 'set-h' }, title), h('div', { class: 'coll' }, items));
    const drivers = DRIVERS.map((d) => { const un = isUnlocked(save, 'driver', d.id); return h('div', { class: `cit${un ? '' : ' locked'}`, title: un ? d.name : 'Locked' }, portrait(d.id, 44), un ? null : icon('lock', { cls: 'lk' }), d.name); });
    const bodies = KART_BODIES.map((b) => { const un = isUnlocked(save, 'body', b.id); return h('div', { class: `cit${un ? '' : ' locked'}`, title: un ? b.name : 'Locked' }, h('div', { class: 'kk' }, icon(un ? 'flag' : 'lock')), b.name); });
    const next = UNLOCK_RULES.filter((r) => !isUnlocked(save, r.kind, r.target) && (r.kind !== 'cup' || getCups().some((c) => c.id === r.target))).map((r) => ({ r, p: progress(r, save.data) })).sort((a, b) => b.p.cur / b.p.goal - a.p.cur / a.p.goal).slice(0, 4);
    const nxt = h('div', { class: 'nxt' }, next.length ? next.map(({ r, p }) => h('div', { class: 'ni' },
      r.kind === 'driver' ? portrait(r.target, 36) : h('div', { class: 'nic' }, icon(r.kind === 'cup' ? 'cup' : r.kind === 'speedClass' ? 'gauge' : 'flag')),
      h('div', {}, h('div', { class: 'nt' }, unlockName(r)), h('div', { class: 'ns' }, `${r.hint}${p.goal > 1 ? ` (${Math.floor(p.cur)}/${p.goal})` : ''}`), p.goal > 1 ? h('div', { class: 'pb' }, h('i', { style: { width: `${Math.round((p.cur / p.goal) * 100)}%` } })) : null))) : h('div', { class: 'set-note' }, 'Everything is unlocked. Nice driving!'));
    const done = ACHIEVEMENTS.filter((a) => save.data.achievements[a.id]).length;
    const ach = { done, el: h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map((a) => { const got = !!save.data.achievements[a.id]; return h('div', { class: `ach${got ? ' got' : ''}`, title: a.desc }, h('div', { class: 'ai' }, icon(got ? a.icon : 'lock')), h('div', {}, h('div', { class: 'an' }, a.name), h('div', { class: 'ad' }, a.desc))); })) };
    return h('div', {},
      h('div', { class: 'stat-tiles' }, tiles.map(([k, v]) => h('div', { class: 'stile' }, h('b', {}, String(v)), h('span', {}, k)))),
      h('div', {}, h('div', { class: 'set-h' }, `Achievements  ${ach.done}/${ACHIEVEMENTS.length}`), ach.el),
      coll('Drivers', drivers), coll('Karts', bodies), h('div', {}, h('div', { class: 'set-h' }, 'Next unlocks'), nxt));
  }
}
