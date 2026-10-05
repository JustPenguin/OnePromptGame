// Race results: your place, time and records on the left, the full table on the right. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, portrait } from '../components.js';
import { formatTime, ordinal } from '../../core/math.js';
import { getDriver } from '../../data/roster.js';
import { getTrackDef } from '../../modes/catalog.js';
import { TROPHY_COLORS } from '../../modes/points.js';
import { unlockName } from '../../modes/unlocks.js';

export const resultsCss = /* css */ `
.s-results{flex-direction:row;gap:1.6rem;align-items:stretch;}
.s-results .scrim-all{background:radial-gradient(120% 100% at 30% 40%,rgba(6,9,26,.5),rgba(6,9,26,.9));}
.res-left{flex:1 1 42%;display:flex;flex-direction:column;justify-content:center;gap:.9rem;min-width:0;z-index:2;}
.res-right{flex:1 1 52%;display:flex;flex-direction:column;justify-content:center;min-width:0;z-index:2;}
.res-place{display:flex;align-items:flex-end;gap:1rem;}
.place-n{font-family:var(--font-display);font-size:9rem;line-height:.82;transform:skewX(-8deg);background:linear-gradient(180deg,#fff,var(--pc,#ff9a2a));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .28rem 0 rgba(0,0,0,.55)) drop-shadow(0 0 1.6rem var(--pg,rgba(255,150,40,.5)));animation:place-in .8s var(--ease-spring) both;}
@keyframes place-in{from{opacity:0;transform:skewX(-8deg) scale(2.2) rotate(-6deg)}to{opacity:1;transform:skewX(-8deg)}}
.place-t{padding-bottom:.6rem;}
.place-t .h2{font-size:2rem;color:var(--pc,#fff);}
.res-times{display:grid;grid-template-columns:auto 1fr;gap:.2rem 1rem;align-items:baseline;}
.res-times .k{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--kr-ink-dim);}
.res-times .v{font-family:var(--font-display);font-size:1.7rem;letter-spacing:.02em;}
.res-times .v small{font-size:.85rem;color:var(--kr-ink-dim);margin-left:.5rem;font-family:var(--font-ui);}
.res-badges{display:flex;gap:.5rem;flex-wrap:wrap;}
.res-badges .chip{font-size:.9rem;padding:.3rem .9rem;}
.badge-new{animation:badge-pop .7s var(--ease-spring) both;animation-delay:calc(var(--i,0) * 160ms + 500ms);}
@keyframes badge-pop{from{opacity:0;transform:scale(.3) rotate(-8deg)}to{opacity:1;transform:none}}
.res-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5rem;}
.res-stats .rs{padding:.45rem .6rem;border-radius:.7rem;background:rgba(255,255,255,.07);}
.res-stats .rs b{display:block;font-family:var(--font-display);font-size:1.2rem;font-weight:400;}
.res-stats .rs span{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--kr-ink-dim);}
.res-unlocks{display:flex;flex-direction:column;gap:.45rem;}
.unlock-card{display:flex;align-items:center;gap:.8rem;padding:.5rem 1rem .5rem .55rem;border-radius:1rem;background:linear-gradient(90deg,rgba(255,210,63,.28),rgba(255,210,63,.08));box-shadow:inset 0 0 0 .12rem rgba(255,210,63,.6);animation:badge-pop .7s var(--ease-spring) both;animation-delay:calc(var(--i,0) * 200ms + 900ms);}
.unlock-card .ui-ic{width:2.6rem;height:2.6rem;border-radius:.8rem;display:grid;place-items:center;font-size:1.5rem;background:linear-gradient(180deg,#ffe985,#ffd23f);color:#3a2600;flex:none;overflow:hidden;}
.unlock-card .portrait{width:2.6rem;height:2.6rem;}
.unlock-card .ut{font-family:var(--font-display);font-size:1.05rem;letter-spacing:.04em;text-transform:uppercase;color:#ffe27a;}
.unlock-card .us{font-size:.8rem;color:#dfe6ff;}
.res-actions{display:flex;gap:1.1rem;flex-wrap:wrap;margin-top:.3rem;}
.res-table{overflow:hidden;}
.res-table .th,.rrow{display:grid;grid-template-columns:2.4rem 2.8rem minmax(0,1fr) 6.6rem 5.4rem;align-items:center;gap:.7rem;padding:.35rem 1rem;}
.res-table .th{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--kr-ink-dim);padding-top:.7rem;border-bottom:.1rem solid var(--line);}
.rrow{min-height:3.2rem;border-bottom:.08rem solid rgba(255,255,255,.06);}
.rrow .pl{font-family:var(--font-display);font-size:1.5rem;text-align:center;}
.rrow.p1 .pl{color:var(--kr-gold);text-shadow:0 0 .8rem rgba(255,210,63,.6);} .rrow.p2 .pl{color:var(--kr-silver);} .rrow.p3 .pl{color:var(--kr-bronze);}
.rrow .portrait{width:2.5rem;height:2.5rem;}
.rrow .nm{font-family:var(--font-display);font-size:1.15rem;letter-spacing:.02em;display:flex;align-items:center;gap:.5rem;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.rrow .tm{font-family:var(--font-display);font-size:1.05rem;text-align:right;}
.rrow .gap{font-size:.88rem;text-align:right;color:var(--kr-ink-dim);}
.rrow.me{background:linear-gradient(90deg,rgba(255,122,26,.42),rgba(255,122,26,.12));box-shadow:inset .3rem 0 0 var(--kr-accent);}
.rrow.me .nm::after{content:'YOU';font-family:var(--font-ui);font-weight:900;font-size:.62rem;letter-spacing:.12em;padding:.1rem .45rem;border-radius:99px;background:var(--kr-accent);color:#fff;}
.rrow.dnf .tm{color:var(--kr-bad);}
.l-portrait .s-results{flex-direction:column;overflow:auto;gap:.8rem;} .l-portrait .place-n{font-size:5.4rem;} .l-portrait .res-right{flex:none;} .l-portrait .res-left{flex:none;justify-content:flex-start;} .l-portrait .place-t .h2{font-size:1.4rem;} .l-portrait .res-stats{grid-template-columns:repeat(2,minmax(0,1fr));} .l-portrait .res-table .th,.l-portrait .rrow{grid-template-columns:2rem 2.4rem minmax(0,1fr) 5.4rem 4.2rem;gap:.5rem;padding:.3rem .6rem;}
.l-compact .s-results{gap:1rem;} .l-compact .res-left{gap:.4rem;justify-content:flex-start;overflow:auto;} .l-compact .place-n{font-size:4.6rem;} .l-compact .place-t{padding-bottom:.2rem;} .l-compact .place-t .h2{font-size:1.2rem;} .l-compact .res-times .v{font-size:1.2rem;} .l-compact .res-times .k{font-size:.66rem;} .l-compact .res-stats{display:none;} .l-compact .res-badges .chip{font-size:.74rem;padding:.15rem .6rem;} .l-compact .unlock-card{padding:.3rem .7rem .3rem .4rem;} .l-compact .unlock-card .ui-ic{width:1.9rem;height:1.9rem;font-size:1.1rem;} .l-compact .unlock-card .portrait{width:1.9rem;height:1.9rem;} .l-compact .unlock-card .ut{font-size:.8rem;} .l-compact .unlock-card .us{font-size:.7rem;} .l-compact .res-actions{margin-top:.1rem;gap:.7rem;}
.l-compact .res-right{justify-content:flex-start;overflow:auto;} .l-compact .res-table .th{padding:.3rem .7rem 0;font-size:.6rem;} .l-compact .rrow{min-height:2.25rem;padding:.1rem .7rem;grid-template-columns:1.6rem 1.9rem minmax(0,1fr) 5rem 3.6rem;gap:.45rem;} .l-compact .rrow .portrait{width:1.7rem;height:1.7rem;} .l-compact .rrow .pl{font-size:1.05rem;} .l-compact .rrow .nm{font-size:.9rem;} .l-compact .rrow .tm{font-size:.82rem;} .l-compact .rrow .gap{font-size:.7rem;}
`;

const PLACE_STYLE = {
  1: { c: '#ffd23f', g: 'rgba(255,210,63,.6)', t: 'Winner!' },
  2: { c: '#cfd8ee', g: 'rgba(207,216,238,.45)', t: 'Podium finish' },
  3: { c: '#e8934f', g: 'rgba(232,147,79,.5)', t: 'Podium finish' },
};

const fmtGap = (t, best) => (Number.isFinite(t) && Number.isFinite(best) ? (t - best < 0.0005 ? '' : '+' + (t - best).toFixed(3)) : '');

export class ResultsScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Select' }]; }
  navOptions() { return { onBack: () => {}, wrap: true }; }

  build() {
    const { summary: s, standings } = this.params;
    const def = getTrackDef(s.trackId);
    const ps = PLACE_STYLE[s.place] ?? { c: '#ff9a2a', g: 'rgba(255,150,40,.4)', t: s.finished ? 'Finished' : 'Did not finish' };
    const winner = standings[0];
    const run = this.app.run;

    // ---- left column
    const times = h('div', { class: 'res-times' });
    if (s.finished) {
      times.append(h('div', { class: 'k' }, 'Race time'), h('div', { class: 'v' }, formatTime(s.time), s.race?.prev != null && !s.race.isNew ? h('small', {}, `record ${formatTime(s.race.prev)}`) : null));
    }
    if (s.bestLap != null) times.append(h('div', { class: 'k' }, 'Best lap'), h('div', { class: 'v' }, formatTime(s.bestLap), s.lap?.prev != null && !s.lap.isNew ? h('small', {}, `record ${formatTime(s.lap.prev)}`) : null));
    const badges = h('div', { class: 'res-badges' });
    let bi = 0;
    if (s.newRecord) badges.append(h('span', { class: 'chip gd badge-new', style: { '--i': bi++ } }, icon('star'), s.mode === 'timetrial' ? 'New record!' : 'New best time!', s.race?.delta != null ? ` ${s.race.delta.toFixed(3)}s` : ''));
    if (s.newLapRecord) badges.append(h('span', { class: 'chip cy badge-new', style: { '--i': bi++ } }, icon('bolt'), 'Best lap!'));
    const ghost = this.app.session?.config.ghost;
    if (s.mode === 'timetrial' && ghost && s.finished) badges.append(h('span', { class: `chip badge-new ${s.time < ghost.time ? 'gn' : 'rd'}`, style: { '--i': bi++ } }, icon('ghost'), s.time < ghost.time ? `Ghost beaten by ${(ghost.time - s.time).toFixed(3)}s` : `Ghost wins by ${(s.time - ghost.time).toFixed(3)}s`));
    if (s.mode === 'timetrial' && s.ghost) badges.append(h('span', { class: 'chip gn badge-new', style: { '--i': bi++ } }, icon('ghost'), 'Ghost saved'));

    const st = s.stats;
    const stats = st ? h('div', { class: 'res-stats' },
      [['Top speed', `${Math.round(st.topSpeed * 3.6)} km/h`], ['Drifting', `${st.driftSeconds.toFixed(1)} s`], ['Overtakes', String(st.overtakes)], ['Boosts', String(st.boosts)]]
        .map(([k, v]) => h('div', { class: 'rs' }, h('b', {}, v), h('span', {}, k)))) : null;

    const unlocks = h('div', { class: 'res-unlocks' }, (s.unlocked ?? []).map((u, i) => {
      const nm = unlockName(u);
      return h('div', { class: 'unlock-card', style: { '--i': i } },
        h('div', { class: 'ui-ic' }, u.kind === 'driver' ? portrait(u.target, 42) : icon(u.kind === 'cup' ? 'cup' : u.kind === 'speedClass' ? 'gauge' : 'flag')),
        h('div', {}, h('div', { class: 'ut' }, `New ${u.kind === 'speedClass' ? 'class' : u.kind === 'body' ? 'kart' : u.kind} unlocked`), h('div', { class: 'us' }, nm)));
    }));

    // ---- actions (mode dependent)
    const acts = [];
    const mode = run?.kind === 'flow' ? run.flow.mode : 'adhoc';
    if (mode === 'grandprix') acts.push(button({ label: 'Standings', icon: 'right', variant: 'green', def: true, onClick: () => this.app.afterRaceContinue() }));
    else if (mode === 'timetrial') {
      acts.push(button({ label: 'Retry', icon: 'restart', variant: 'green', def: true, onClick: () => run.flow.again() }));
      acts.push(button({ label: 'Next track', icon: 'right', variant: 'cyan', onClick: () => this._nextTrack() }));
    } else {
      acts.push(button({ label: 'Race again', icon: 'restart', variant: 'green', def: true, onClick: () => (run?.flow ? run.flow.again() : this.app.restartRace(true)) }));
      if (mode === 'versus') acts.push(button({ label: 'Change setup', icon: 'sliders', variant: 'cyan', onClick: () => this.app.toSetup() }));
    }
    acts.push(button({ label: 'Menu', icon: 'home', variant: 'glass', onClick: () => this._menu(mode) }));

    // ---- right column: table
    const best = winner?.finished ? winner.time : null;
    const rows = standings.map((r, i) => {
      const d = getDriver(r.driverId);
      return h('div', { class: `rrow pop p${r.place}${r.isPlayer ? ' me' : ''}${r.finished ? '' : ' dnf'}`, style: { '--i': Math.min(i, 9) } },
        h('div', { class: 'pl' }, String(r.place)), portrait(r.driverId, 40),
        h('div', { class: 'nm' }, r.isPlayer ? r.name : d.name),
        h('div', { class: 'tm' }, r.finished ? formatTime(r.time) : 'DNF'),
        h('div', { class: 'gap' }, r.finished && r.place > 1 ? fmtGap(r.time, best) : ''));
    });

    this.root = null;
    return h('div', { class: 'screen', style: { '--pc': ps.c, '--pg': ps.g } },
      h('div', { class: 'scrim-all' }),
      h('div', { class: 'res-left' },
        h('div', { class: 'kicker' }, `${def.name} · ${{ grandprix: 'Grand Prix', timetrial: 'Time Trial', versus: 'Versus Race' }[s.mode] ?? 'Race'}`),
        h('div', { class: 'res-place' }, h('div', { class: 'place-n' }, s.finished ? ordinal(s.place) : 'DNF'), h('div', { class: 'place-t' }, h('div', { class: 'h2' }, ps.t))),
        times, badges, stats, unlocks, h('div', { class: 'res-actions' }, acts)),
      h('div', { class: 'res-right' }, h('div', { class: 'panel res-table' }, h('div', { class: 'th' }, h('span', {}, '#'), h('span', {}), h('span', {}, 'Racer'), h('span', { style: { textAlign: 'right' } }, 'Time'), h('span', { style: { textAlign: 'right' } }, 'Gap')), rows)));
  }

  _nextTrack() {
    const run = this.app.run, flow = run.flow;
    const id = flow.nextTrackId(this.app.session?.config.trackId ?? flow.sel.trackId);
    flow.sel.trackId = id;
    flow.lastConfig = { ...flow.lastConfig, trackId: id };
    flow.again();
  }

  _menu(mode) { this.app.quitToMenu(); }
}
