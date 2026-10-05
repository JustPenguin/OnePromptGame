// Grand Prix: animated standings after each race + the podium ceremony. OWNER: Agent E.
import { h, wait } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, portrait } from '../components.js';
import { trackCard } from '../trackCard.js';
import { countUp } from '../anim.js';
import { ordinal } from '../../core/math.js';
import { getDriver, SPEED_CLASSES } from '../../data/roster.js';
import { TROPHY_COLORS, TROPHY_NAMES } from '../../modes/points.js';
import { recordGrandPrix } from '../../modes/career.js';
import { unlockName } from '../../modes/unlocks.js';

export const gpCss = /* css */ `
.s-standings{flex-direction:row;gap:1.8rem;align-items:center;}
.s-standings .scrim-all{background:radial-gradient(120% 100% at 35% 45%,rgba(6,9,26,.55),rgba(6,9,26,.9));}
.st-left{flex:1.5;min-width:0;display:flex;flex-direction:column;gap:.7rem;z-index:2;}
.st-right{flex:1;max-width:19rem;display:flex;flex-direction:column;gap:.9rem;z-index:2;}
.st-wrap{position:relative;padding:.6rem .7rem;}
.st-head,.srow{display:grid;grid-template-columns:2.2rem 2.4rem 2.8rem minmax(0,1fr) 4.4rem 4.4rem;align-items:center;gap:.6rem;}
.st-head{padding:0 .9rem .35rem;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--kr-ink-dim);}
.st-head span:nth-child(n+5){text-align:right;}
.st-rows{position:relative;--rh:3.1rem;--pitch:3.4rem;height:calc(var(--n) * var(--pitch));}
.srow{position:absolute;left:0;right:0;height:var(--rh);top:calc((var(--r) - 1) * var(--pitch));padding:0 .9rem;border-radius:.8rem;background:rgba(255,255,255,.06);transition:top 1s cubic-bezier(.2,1.15,.3,1);}
.srow .rk{font-family:var(--font-display);font-size:1.45rem;text-align:center;}
.srow.r1 .rk{color:var(--kr-gold);text-shadow:0 0 .8rem rgba(255,210,63,.6);} .srow.r2 .rk{color:var(--kr-silver);} .srow.r3 .rk{color:var(--kr-bronze);}
.srow .ar{font-family:var(--font-display);font-size:.78rem;text-align:center;opacity:0;transition:opacity .4s;}
.srow .ar.show{opacity:1;} .srow .ar.up{color:var(--kr-good);} .srow .ar.dn{color:var(--kr-bad);}
.srow .portrait{width:2.5rem;height:2.5rem;}
.srow .sn{font-family:var(--font-display);font-size:1.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:.5rem;}
.srow.me{background:linear-gradient(90deg,rgba(255,122,26,.5),rgba(255,122,26,.14));box-shadow:inset .3rem 0 0 var(--kr-accent);}
.srow.me .sn::after{content:'YOU';font-family:var(--font-ui);font-weight:900;font-size:.6rem;letter-spacing:.12em;padding:.1rem .45rem;border-radius:99px;background:var(--kr-accent);color:#fff;}
.srow .sg{text-align:right;font-family:var(--font-display);font-size:1.05rem;color:var(--kr-good);opacity:0;transform:scale(.5);transition:opacity .3s,transform .4s var(--ease-spring);}
.srow .sg.show{opacity:1;transform:none;}
.srow .stt{text-align:right;font-family:var(--font-display);font-size:1.5rem;font-variant-numeric:tabular-nums;}
.st-next{overflow:hidden;}
.st-next .lbl{padding:.7rem 1rem .2rem;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--kr-ink-dim);}
.st-next .tcard{width:100%;border-radius:0 0 1.2rem 1.2rem;box-shadow:none;pointer-events:none;} .st-next .tcard .tart{height:8.5rem;}
.st-actions{display:flex;flex-direction:column;gap:.8rem;}
.l-portrait .s-standings{flex-direction:column;overflow:auto;align-items:stretch;gap:.8rem;} .l-portrait .st-right{max-width:none;flex:none;} .l-portrait .st-next{display:none;} .l-portrait .st-left{flex:none;}
.l-portrait .st-wrap{padding:.4rem .35rem;} .l-portrait .st-head,.l-portrait .srow{grid-template-columns:1.4rem 1.7rem 2.3rem minmax(0,1fr) 2.6rem 3rem;gap:.35rem;padding:0 .5rem;font-size:.7rem;}
.l-portrait .st-head{padding-bottom:.25rem;font-size:.6rem;} .l-portrait .st-rows{--rh:2.7rem;--pitch:3rem;} .l-portrait .srow .portrait{width:2rem;height:2rem;} .l-portrait .srow .rk{font-size:1.2rem;} .l-portrait .srow .sn{font-size:.95rem;gap:.3rem;} .l-portrait .srow.me .sn::after{display:none;} .l-portrait .srow .sg{font-size:.85rem;} .l-portrait .srow .stt{font-size:1.25rem;} .l-portrait .srow .ar{font-size:.7rem;}
.l-compact .s-standings{flex-direction:row;gap:1rem;align-items:flex-start;} .l-compact .st-left{gap:.25rem;} .l-compact .st-left .kicker{font-size:.62rem;} .l-compact .st-left .h1{font-size:1.4rem;} .l-compact .st-right{max-width:11.5rem;gap:.5rem;} .l-compact .st-next{display:none;}
.l-compact .st-wrap{padding:.3rem .4rem;} .l-compact .st-rows{--rh:1.95rem;--pitch:2.12rem;} .l-compact .st-head,.l-compact .srow{grid-template-columns:1.6rem 1.6rem 2rem minmax(0,1fr) 3rem 3.2rem;gap:.35rem;padding:0 .6rem;} .l-compact .st-head{padding-bottom:.15rem;font-size:.58rem;} .l-compact .srow{border-radius:.5rem;} .l-compact .srow .portrait{width:1.55rem;height:1.55rem;} .l-compact .srow .rk{font-size:1rem;} .l-compact .srow .sn{font-size:.85rem;} .l-compact .srow .sg{font-size:.78rem;} .l-compact .srow .stt{font-size:1.05rem;} .l-compact .srow .ar{font-size:.62rem;}
.s-podium{justify-content:space-between;}
.pd-top{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;z-index:3;}
.pd-mid{flex:1;display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;z-index:3;min-height:0;}
.pd-table{width:18.5rem;padding:.5rem .6rem;align-self:flex-end;} .pd-table .prow{display:grid;grid-template-columns:1.6rem 2rem minmax(0,1fr) 2.8rem;align-items:center;gap:.5rem;height:2.45rem;padding:0 .5rem;border-radius:.6rem;font-size:.9rem;} .pd-table .prow .portrait{width:1.8rem;height:1.8rem;}
.pd-table .prow b{font-family:var(--font-display);font-weight:400;font-size:1.05rem;text-align:center;} .pd-table .prow .nm{font-family:var(--font-display);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;} .pd-table .prow .pt{text-align:right;font-family:var(--font-display);font-size:1.05rem;}
.pd-table .prow.me{background:linear-gradient(90deg,rgba(255,122,26,.5),rgba(255,122,26,.12));} .pd-table .prow:nth-child(1) b{color:var(--kr-gold);} .pd-table .prow:nth-child(2) b{color:var(--kr-silver);} .pd-table .prow:nth-child(3) b{color:var(--kr-bronze);}
.pd-res{width:19rem;padding:1.1rem 1.2rem 1.2rem;display:flex;flex-direction:column;gap:.7rem;align-items:center;text-align:center;align-self:flex-end;}
.pd-res .tro-big{font-size:5.4rem;line-height:1;color:var(--tc,#fff);filter:drop-shadow(0 .3rem 0 rgba(0,0,0,.4)) drop-shadow(0 0 1.4rem var(--tc,#fff));animation:place-in .8s var(--ease-spring) both .3s;}
.pd-res .pl{font-family:var(--font-display);font-size:2.2rem;line-height:1;text-transform:uppercase;color:var(--tc,#fff);text-shadow:0 .14rem 0 rgba(0,0,0,.5);}
.pd-res .tn{font-family:var(--font-display);font-size:1.15rem;letter-spacing:.04em;text-transform:uppercase;color:#dfe6ff;}
.pd-res .sm{font-size:.9rem;color:var(--kr-ink-dim);}
.pd-res .newb{animation:badge-pop .7s var(--ease-spring) both .9s;}
.pd-res .res-unlocks{width:100%;text-align:left;}
.unl-chip{display:none;}
.l-portrait .pd-mid{align-items:flex-end;justify-content:center;} .l-portrait .pd-res{width:100%;padding:.7rem .9rem .8rem;gap:.35rem;} .l-portrait .pd-res .tro-big{font-size:2.8rem;} .l-portrait .pd-res .pl{font-size:1.6rem;} .l-portrait .pd-res .tn{font-size:.95rem;} .l-portrait .pd-res .res-unlocks{display:none;} .l-portrait .pd-res .unl-chip{display:inline-flex;} .l-compact .pd-res{width:15rem;padding:.6rem .8rem;gap:.35rem;} .l-compact .pd-res .tro-big{font-size:3rem;} .l-compact .pd-res .pl{font-size:1.4rem;}
`;

// ------------------------------------------------------------------------------------------------ standings
export class StandingsScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Continue' }]; }
  navOptions() { return { onBack: () => {} }; }

  build() {
    const f = this.flow, gp = f.gp;
    const rec = gp.lastRecord ?? { rows: gp.rows(), gained: new Map(), prev: null };
    this.rec = rec;
    const n = rec.rows.length;
    // starting layout = standings BEFORE this race
    const before = [...rec.rows].map((r) => ({ ...r, pts0: r.points - (rec.gained.get(r.key) ?? 0) }));
    before.sort((a, b) => b.pts0 - a.pts0 || (rec.prev ? (rec.prev.get(a.key) ?? 99) - (rec.prev.get(b.key) ?? 99) : 0));
    const beforeRank = new Map(before.map((r, i) => [r.key, rec.prev?.get(r.key) ?? i + 1]));
    this.rows = rec.rows.map((r) => {
      const gained = rec.gained.get(r.key) ?? 0;
      const rk = h('div', { class: 'rk' }, String(beforeRank.get(r.key)));
      const ar = h('div', { class: 'ar' });
      const sg = h('div', { class: 'sg' }, gained ? `+${gained}` : '');
      const stt = h('div', { class: 'stt' }, String(r.points - gained));
      const d = getDriver(r.driverId);
      const el = h('div', { class: `srow r${beforeRank.get(r.key)}${r.isPlayer ? ' me' : ''}`, style: { '--r': beforeRank.get(r.key) } }, rk, ar, portrait(r.driverId, 40), h('div', { class: 'sn' }, r.isPlayer ? gp.player.name : d.name), sg, stt);
      return { r, el, rk, ar, sg, stt, gained, from: beforeRank.get(r.key) };
    });
    const next = gp.finished ? null : gp.trackDef;
    this.go = button({ label: gp.finished ? 'Podium' : 'Next race', icon: gp.finished ? 'trophy' : 'right', variant: 'green', size: 'lg', def: true, sfx: 'confirm', onClick: () => this.next() });
    const quit = button({ label: 'Quit cup', icon: 'home', variant: 'glass', size: 'sm', onClick: () => this.quit(), sfx: 'back' });
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      h('div', { class: 'st-left' },
        h('div', { class: 'kicker' }, `${gp.cup.name} · ${SPEED_CLASSES[gp.speedClass].name} · Race ${gp.index} of ${gp.total} complete`),
        h('h1', { class: 'h1' }, 'Standings'),
        h('div', { class: 'panel st-wrap' },
          h('div', { class: 'st-head' }, h('span', {}, '#'), h('span', {}), h('span', {}), h('span', {}, 'Racer'), h('span', {}, 'Race'), h('span', {}, 'Points')),
          h('div', { class: 'st-rows', style: { '--n': n } }, this.rows.map((x) => x.el)))),
      h('div', { class: 'st-right' },
        next ? h('div', { class: 'panel st-next' }, h('div', { class: 'lbl' }, `Next: race ${gp.index + 1} of ${gp.total}`), trackCard(next, { tag: 'div', nav: false, showBest: false })) : null,
        h('div', { class: 'st-actions' }, this.go, quit)));
  }

  async onShow() {
    const rm = this.ui.reducedMotion;
    await wait(rm ? 0 : 700);
    if (!this.root?.isConnected) return;
    this.ui.sfx('tick');
    const jobs = [];
    for (const x of this.rows) {
      if (x.gained) { x.sg.classList.add('show'); }
      jobs.push(countUp(x.stt, x.r.points - x.gained, x.r.points, { ms: 900, reduced: rm }));
    }
    await wait(rm ? 0 : 600);
    if (!this.root?.isConnected) return;
    // slide into the new order
    for (const x of this.rows) {
      x.el.style.setProperty('--r', x.r.rank);
      x.el.className = `srow r${x.r.rank}${x.r.isPlayer ? ' me' : ''}`;
      x.rk.textContent = String(x.r.rank);
      const delta = x.from - x.r.rank;
      if (delta !== 0) { x.ar.textContent = delta > 0 ? `+${delta}` : String(delta); x.ar.className = `ar show ${delta > 0 ? 'up' : 'dn'}`; }
    }
    await Promise.all(jobs);
  }

  next() {
    const f = this.flow;
    if (f.gp.finished) this.ui.reset('podium', {}, 'fade');
    else f.startGpRace();
  }

  async quit() {
    const ok = await this.ui.confirm({ title: 'Quit the Grand Prix?', body: 'Your points for this cup will be lost.', confirm: 'Quit cup', cancel: 'Keep racing', danger: true, confirmIcon: 'home' });
    if (ok) this.app.quitToMenu();
  }
}

// ------------------------------------------------------------------------------------------------ podium
export class PodiumScreen extends Screen {
  get stage() { return { preset: 'podium', kart: false, comp: (l) => (l.mode === 'portrait' ? { x: 0, y: -0.18 } : { x: -0.07, y: -0.02 }) }; }
  hints() { return [{ k: 'confirm', label: 'Continue' }]; }
  navOptions() { return { onBack: () => {} }; }

  build() {
    const gp = this.flow.gp;
    if (!gp.recorded) { gp.recorded = true; gp.result = recordGrandPrix(this.app, gp); }
    const res = gp.result;
    this.res = res;
    const rows = gp.rows();
    const place = gp.playerPlace;
    const tcol = res.trophy ? TROPHY_COLORS[res.trophy] : '#9aa6d6';
    const clsName = SPEED_CLASSES[gp.speedClass].name;
    this.rows3 = rows.slice(0, 3).map((r) => ({ driverId: r.driverId, bodyId: r.bodyId, place: r.rank, isPlayer: r.isPlayer }));
    const unl = h('div', { class: 'res-unlocks' }, (res.unlocked ?? []).map((u, i) => h('div', { class: 'unlock-card', style: { '--i': i } },
      h('div', { class: 'ui-ic' }, u.kind === 'driver' ? portrait(u.target, 42) : icon(u.kind === 'cup' ? 'cup' : u.kind === 'speedClass' ? 'gauge' : 'flag')),
      h('div', {}, h('div', { class: 'ut' }, `New ${u.kind === 'speedClass' ? 'class' : u.kind === 'body' ? 'kart' : u.kind} unlocked`), h('div', { class: 'us' }, unlockName(u))))));
    const resultCard = h('div', { class: 'panel pd-res rise', style: { '--tc': tcol, '--i': 4 } },
      icon(res.trophy ? 'trophy' : 'medal', { cls: 'tro-big' }),
      h('div', { class: 'pl' }, res.trophy ? TROPHY_NAMES[res.trophy] : `${ordinal(place)} place`),
      h('div', { class: 'tn' }, res.trophy ? `${ordinal(place)} place · ${clsName} class` : `${gp.cup.name} · ${clsName} class`),
      res.isNewTrophy ? h('span', { class: 'chip gd newb' }, icon('star'), 'New trophy!') : null,
      h('div', { class: 'sm' }, `${gp.player.points} points · ${gp.total} race${gp.total === 1 ? '' : 's'}`),
      unl,
      (res.unlocked?.length ?? 0) > 0 ? h('span', { class: 'chip gd unl-chip' }, icon('lock'), `${res.unlocked.length} new unlock${res.unlocked.length === 1 ? '' : 's'}`) : null,
      button({ label: 'Continue', icon: 'right', variant: 'green', def: true, block: true, sfx: 'confirm', onClick: () => this.app.quitToMenu() }));
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-bottom' }), h('div', { class: 'scrim-top' }),
      h('div', { class: 'pd-top' }, h('div', {}, h('div', { class: 'kicker' }, `${gp.cup.name} · ${clsName}`), h('h1', { class: 'h1' }, 'Grand Prix complete'))),
      h('div', { class: 'pd-mid' }, h('div', {}), resultCard));
  }

  onShow() {
    this.app.menuScene.showPodium(this.rows3, { trophy: this.res.trophy });
    this.app.audio?.playMusic?.('results');
    (this.res.achievements ?? []).forEach((a, i) => setTimeout(() => this.ui.toast({ title: 'Achievement unlocked', text: a.name, kind: 'unlock', icon: a.icon, ms: 4200 }), 5200 + i * 900));
    (this.res.unlocked ?? []).forEach((u, i) => setTimeout(() => this.ui.toast({ title: 'Unlocked!', text: unlockName(u), kind: 'unlock', driverId: u.kind === 'driver' ? u.target : undefined, icon: 'lock', ms: 4200 }), 2600 + i * 700));
  }

  onHide() { this.app.menuScene.hidePodium(); }
}
