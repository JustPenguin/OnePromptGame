// Race HUD. OWNER: Agent E.  Reads session.player / race / track / karts and session events; never writes to the game.
//   new Hud(ui, session)  .root (mount in ui.layers.hud)  .update(dt, session, snap)  .destroy()
//   .setDim(on) .hide() .applySettings() .onResize() .onDevice(d)
// Zones: tl (item, coins, status) · ml (standings) · bl (position) · tr (lap, timer, lap times, ghost) · mr (minimap) · br (speedometer)
//        bc (drift meter) · tc (event toasts) · c (countdown, banners, intro).  CSS: ./hudCss.js
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { EV } from '../../core/events.js';
import { clamp, damp, formatTime, ordinal } from '../../core/math.js';
import { keycap, padGlyph } from '../components.js';
import { ITEM_DEFS } from '../../items/itemDefs.js';
import { getTrackDef, cupOfTrack } from '../../modes/catalog.js';
import { Speedo, Minimap, ItemSlot, Leaderboard, DriftMeter, setText, setClass } from './widgets.js';
import { Countdown, Banners, IntroCard, EventFeed, replay } from './banners.js';
import { Effects, StatusChips } from './overlays.js';
import { TouchControls } from './TouchControls.js';

const MS = { kmh: 3.6, mph: 2.23694 };
const UNIT = { kmh: 'km/h', mph: 'mph' };
const DRIFT_LABELS = ['', 'Mini-turbo!', 'Super mini-turbo!', 'Ultra mini-turbo!'];
const DRIFT_COLORS = ['', '#6fb7ff', '#ffb04a', '#ff7be0'];
const MODE_NAMES = { grandprix: 'Grand Prix', timetrial: 'Time Trial', versus: 'Versus Race' };

export class Hud {
  /** @param {import('../UI.js').UI} ui @param {import('../../core/RaceSession.js').RaceSession} session */
  constructor(ui, session) {
    this.ui = ui;
    this.app = ui.app;
    this.session = session;
    this.me = session.player;
    this.offs = [];
    this.t = 0;
    this._place = -1; this._lap = -1; this._phase = '';
    this.laps = [];
    this.bestLap = null;
    this.placeAcc = null;
    this.finishedAt = -1;
    this.gotoResultsReady = false;
    this.fpsAcc = 0; this.fpsFrames = 0; this.fpsText = '';

    const def = getTrackDef(session.config.trackId);
    this.def = def;
    const rec = this.app.save.data.records[def.id]?.lap?.[session.config.speedClass];
    if (rec) this.bestLap = rec.time;

    // ---- widgets
    this.item = new ItemSlot();
    this.coinN = h('b', {}, '0');
    this.coins = h('div', { class: 'coins glass', style: { display: 'none' } }, icon('coin'), this.coinN);
    this.status = new StatusChips();
    this.board = new Leaderboard();
    this.speedo = new Speedo();
    this.mini = new Minimap();
    this.drift = new DriftMeter();
    this.effects = new Effects();
    this.countdown = new Countdown();
    this.banners = new Banners();
    this.introCard = new IntroCard();
    this.feed = new EventFeed();

    this.pn = h('span', { class: 'pn' }); this.ps = h('span', { class: 'ps' }); this.po = h('span', { class: 'po' });
    this.posEl = h('div', { class: 'pos', 'aria-label': 'Position' }, this.pn, this.ps, this.po);
    this.lapNow = h('span', {}, '1'); this.lapTot = h('small', {}, '/3');
    this.lapbox = h('div', { class: 'lapbox glass' }, h('span', { class: 'll' }, 'LAP'), h('span', { class: 'ln' }, this.lapNow, this.lapTot));
    this.timerMain = document.createTextNode('0:00'); this.timerMs = h('small', {}, '.000');
    this.timerEl = h('div', { class: 'timer', 'aria-label': 'Race time' }, this.timerMain, this.timerMs);
    this.lapList = h('div', { class: 'laps' });
    this.ghostD = h('span', { class: 'gd' }, '--');
    this.ghostBox = h('div', { class: 'ghostbox glass', style: { display: 'none' } }, icon('ghost'), h('span', { class: 'gl' }, 'GHOST'), this.ghostD);
    this.skip = h('div', { class: 'skip hint', style: { pointerEvents: 'auto', cursor: 'pointer' } });
    this.pauseBtn = h('button', { class: 'hud-pause', type: 'button', 'aria-label': 'Pause' }, icon('pause'));
    this.pauseBtn.addEventListener('click', () => this.app.setPaused(true));
    this.fps = h('div', { class: 'fps', style: { display: 'none' } });
    this.touch = new TouchControls(this.app);

    this.root = h('div', { class: 'hud', 'data-phase': session.race?.phase ?? 'intro' },
      this.effects.el,
      h('div', { class: 'hz tl' }, this.item.el, this.coins, this.status.el),
      h('div', { class: 'hz ml' }, this.board.el),
      h('div', { class: 'hz bl' }, this.posEl),
      h('div', { class: 'hz tr' }, this.lapbox, this.timerEl, this.lapList, this.ghostBox),
      h('div', { class: 'hz mr' }, this.mini.el),
      h('div', { class: 'hz br' }, this.speedo.el),
      h('div', { class: 'hz bc' }, h('div', { style: { position: 'relative' } }, this.drift.label, this.drift.el)),
      h('div', { class: 'hz tc' }, this.feed.el),
      this.countdown.el, this.banners.el, this.introCard.el, this.skip,
      this.pauseBtn, this.touch.root, this.fps);

    this.mini.setTrack(session);
    this._bindEvents();
    this._bindInput();
    this.applySettings();
    this.onDevice(ui.device);
    const phase = session.race?.phase;
    if (phase === 'intro') this._showIntro();
    this.update(0.016, session, true);
  }

  // ------------------------------------------------------------------------------------------------ wiring
  _bindEvents() {
    const s = this.session, me = this.me;
    const on = (type, fn) => this.offs.push(s.events.on(type, fn));
    on(EV.RACE_PHASE, ({ phase }) => {
      this.root.dataset.phase = phase;
      if (phase === 'intro') this._showIntro();
      else { this.introCard.hide(); this._setSkip(null); }
      if (phase === 'countdown') this.feed.clear();
      if (phase === 'results') { this.banners.clearFinish(); this._setSkip(null); }
    });
    on(EV.COUNTDOWN, ({ count }) => this.countdown.show(count, this._gasNode()));
    on(EV.FINAL_LAP, ({ kart }) => { if (kart === me) this.banners.final(); });
    on(EV.LAP_COMPLETE, ({ kart, lap, lapTime, isBest }) => {
      if (kart !== me) return;
      replay(this.lapbox, 'pulse');
      const delta = this.bestLap == null ? null : lapTime - this.bestLap;
      const best = this.bestLap == null || lapTime < this.bestLap;
      if (best) this.bestLap = lapTime;
      this._addLapRow(lap, lapTime, delta, best);
      if (isBest && lap > 1) this.feed.push('New best lap!', { ico: 'bolt', kind: 'gold' });
    });
    on(EV.KART_FINISH, ({ kart, place, time }) => {
      if (kart !== me) return;
      this.finishedAt = this.t;
      this.banners.finish(place, time);
      this.feed.clear();
    });
    on(EV.PLACE_CHANGE, ({ kart, from, to }) => {
      if (kart !== me || from === to) return;
      if (this.session.race.phase !== 'racing') return;
      this.posEl.classList.remove('up', 'down'); void this.posEl.offsetWidth;
      this.posEl.classList.add(to < from ? 'up' : 'down');
      this.placeAcc = { from: this.placeAcc?.from ?? from, last: this.t };
    });
    on(EV.WRONG_WAY, ({ kart, active }) => { if (kart === me) this.banners.wrongWay(active); });
    on(EV.ITEM_HIT, ({ victim, attacker, type }) => {
      const nm = ITEM_DEFS[type]?.name;
      if (victim === me && attacker !== me) this.feed.push(attacker ? `Hit by ${attacker.name}!` : (nm ? `Hit by ${nm}!` : 'Ouch!'), { ico: 'bolt', kind: 'bad' });
      else if (attacker === me && victim !== me) this.feed.push(`Hit ${victim.name}!`, { ico: 'star', kind: 'gold' });
    });
    on(EV.ITEM_BLOCKED, ({ victim }) => { if (victim === me) this.feed.push('Blocked!', { ico: 'shield', kind: 'cy' }); });
    on(EV.START_BOOST, ({ kart }) => { if (kart === me) this.feed.push('Rocket start!', { ico: 'rocket', kind: 'gold' }); });
    on(EV.START_BURNOUT, ({ kart }) => { if (kart === me) this.feed.push('Too early!', { ico: 'flame', kind: 'bad' }); });
    on(EV.COIN, ({ kart }) => { if (kart === me) replay(this.coins, 'pulse'); });
    on(EV.DRIFT_BOOST, ({ kart, level }) => {
      if (kart !== me || !DRIFT_LABELS[level]) return;
      this.drift.label.textContent = DRIFT_LABELS[level];
      this.drift.label.style.color = DRIFT_COLORS[level];
      this.drift.label.classList.remove('show'); void this.drift.label.offsetWidth; this.drift.label.classList.add('show');
    });
  }

  _bindInput() {
    // intro: any key / tap skips; finishing: Enter / click / tap goes to the results right away
    this._onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || this.app.paused || ['F5', 'F11', 'F12', 'Tab'].includes(e.code)) return;
      const phase = this.session.race?.phase;
      if (phase === 'intro') this.session.race.skipIntro?.();
      else if (phase === 'finishing' && this.gotoResultsReady && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) this._toResults();
    };
    this._onPointer = (e) => {
      const phase = this.session.race?.phase;
      if (e.target?.closest?.('.hud-pause')) return;
      if (phase === 'intro') this.session.race.skipIntro?.();
    };
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('pointerdown', this._onPointer);
    this.skip.addEventListener('click', () => { if (this.session.race?.phase === 'finishing') this._toResults(); });
    this._padPrev = false;
  }

  _toResults() { this.gotoResultsReady = false; this.session.race.endRace?.(); }

  _showIntro() {
    const cfg = this.session.config;
    const cup = cupOfTrack(this.def.id);
    this.introCard.show({ kicker: [MODE_NAMES[cfg.mode] ?? 'Race', cup?.name].filter(Boolean).join(' · '), title: this.def.name, laps: this.session.race?.lapCount ?? cfg.laps, stars: this.def.difficulty ?? 1 });
    this._setSkip('intro');
  }

  /** Little "press X to ..." pill at the bottom-right. */
  _setSkip(kind) {
    if (this._skipKind === kind) return;
    this._skipKind = kind;
    this.skip.classList.remove('show');
    if (!kind) return;
    const d = this.ui.device;
    const glyph = d === 'gamepad' ? padGlyph('a') : d === 'touch' || d === 'mouse' ? icon('right') : keycap('Enter');
    this.skip.replaceChildren(kind === 'intro' ? (d === 'touch' ? 'Tap to skip' : d === 'gamepad' ? 'Press any button to skip' : 'Press any key to skip') : [glyph, ' Results']);
    void this.skip.offsetWidth; this.skip.classList.add('show');
  }

  _gasNode() {
    const d = this.ui.device;
    if (d === 'touch') return h('b', {}, 'GAS');
    if (d === 'gamepad') return padGlyph('a');
    const code = this.app.input.bindings?.throttle?.[0] ?? 'ArrowUp';
    return keycap(code);
  }

  _itemHint() {
    const d = this.ui.device;
    if (d === 'touch') return h('span', {}, 'tap ITEM');
    const glyph = d === 'gamepad' ? padGlyph('x') : keycap(this.app.input.bindings?.item?.[0] ?? 'KeyE');
    return h('span', { style: { display: 'inline-flex', gap: '.3em', alignItems: 'center' } }, glyph, 'use');
  }

  onDevice(d) {
    this.root.classList.toggle('touch', this.touchWanted());
    this.touch.setShown(this.touchWanted());
    this.item.setHint(this._itemHint());
    if (this._skipKind) { const k = this._skipKind; this._skipKind = null; this._setSkip(k); }
  }

  touchWanted() {
    const mode = this.app.settings.touchControls ?? 'auto';
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    const d = this.ui.device;
    if (d === 'touch') return true;
    if (d === 'keyboard' || d === 'gamepad') return false;
    return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  }

  applySettings() {
    const st = this.app.settings;
    this.root.classList.toggle('nomap', st.showMinimap === false);
    this.root.classList.toggle('noboard', st.showLeaderboard === false);
    this.effects.reduceFlashes = !!st.reduceFlashes;
    this.fps.style.display = st.showFps ? '' : 'none';
    this.touch.applySettings();
    this.onDevice(this.ui.device);
  }

  onResize() { this.mini.base = null; }
  setDim(on) { this.root.classList.toggle('dim', !!on); }
  hide() { this.root.classList.add('gone'); }

  // ------------------------------------------------------------------------------------------------ frame
  _addLapRow(lap, time, delta, best) {
    const di = delta == null ? null : h('i', { class: delta < 0 ? 'up' : 'dn' }, `${delta < 0 ? '-' : '+'}${Math.abs(delta).toFixed(2)}`);
    const row = h('div', { class: `lr${best ? ' best' : ''}` }, h('b', {}, `L${lap}`), h('span', {}, formatTime(time)), di);
    this.lapList.appendChild(row);
    while (this.lapList.children.length > 3) this.lapList.firstElementChild.remove();
  }

  update(dt, session, snap = false) {
    const me = this.me;
    if (!me || session !== this.session) return;
    const race = session.race;
    const st = this.app.settings;
    this.t += dt;

    // phase attribute (also covers phases we missed before subscribing)
    if (race.phase !== this._phase) { this._phase = race.phase; this.root.dataset.phase = race.phase; }

    // position
    const solo = session.karts.length <= 1;
    if (solo !== this._solo) { this._solo = solo; this.posEl.style.display = solo ? 'none' : ''; this.board.el.style.display = solo ? 'none' : ''; }
    const place = me.race.place;
    if (place !== this._place) {
      this._place = place;
      setText(this.pn, String(place));
      setText(this.ps, ordinal(place).replace(/^\d+/, ''));
      setText(this.po, `of ${session.karts.length}`);
      this.posEl.classList.toggle('p1', place === 1); this.posEl.classList.toggle('p2', place === 2); this.posEl.classList.toggle('p3', place === 3);
    }
    if (this.placeAcc && this.t - this.placeAcc.last > 0.6) {
      const net = this.placeAcc.from - place;
      if (net > 0) this.feed.push(`+${net} place${net === 1 ? '' : 's'}!`, { ico: 'up', kind: 'good' });
      else if (net < 0) this.feed.push(`${net} place${net === -1 ? '' : 's'}`, { ico: 'down', kind: 'bad' });
      this.placeAcc = null;
    }

    // lap + timer
    const laps = race.lapCount;
    const lap = clamp(me.race.lap, 1, laps);
    if (lap !== this._lap) { this._lap = lap; setText(this.lapNow, String(lap)); setText(this.lapTot, `/${laps}`); }
    const tm = me.race.finished ? me.race.finishTime : race.time;
    const ft = formatTime(tm);
    const dot = ft.indexOf('.');
    setText(this.timerMain, ft.slice(0, dot)); setText(this.timerMs, ft.slice(dot));

    // speed
    const unit = st.speedUnit === 'mph' ? 'mph' : 'kmh';
    const f = MS[unit];
    const max = Math.ceil((me.stats.topSpeed * f * 1.45) / 20) * 20;
    this.speedo.update(dt, Math.abs(me.speed) * f, max, UNIT[unit], me.boost.timer > 0, snap);

    // item, coins, drift, effects
    this.item.update(me, this.t, dt);
    setClass(this.item.el, 'canuse', this.item.hasItem);
    this.item.hint.style.visibility = this.item.hasItem ? 'visible' : 'hidden';
    const coins = me.coins ?? 0;
    const showCoins = coins > 0 || (session.track?.coins?.length ?? 0) > 0;
    const cd = showCoins ? '' : 'none';
    if (this.coins.style.display !== cd) this.coins.style.display = cd;
    setText(this.coinN, `${coins}`);
    this.drift.update(me);
    this.effects.update(dt, me, snap);
    this.status.update(me);

    // map + standings
    if (st.showMinimap !== false) this.mini.update(dt, session);
    if (st.showLeaderboard !== false) this.board.update(dt, session);

    // time trial ghost
    const gp = session.ghostPlayer;
    const showGhost = session.config.mode === 'timetrial' && !!session.config.ghost;
    const gd = showGhost ? '' : 'none';
    if (this.ghostBox.style.display !== gd) this.ghostBox.style.display = gd;
    if (showGhost) {
      const gk = gp?.kart ?? gp?.ghost;
      if (gk?.race && Number.isFinite(gk.race.distance)) {
        const ahead = gk.race.distance - me.race.distance;                    // metres the ghost is ahead
        const sec = -ahead / Math.max(10, Math.abs(me.speed));               // negative = we are ahead
        this._gd = this._gd === undefined || snap ? sec : damp(this._gd, sec, 6, dt);
        setText(this.ghostD, `${this._gd > 0 ? '+' : '-'}${Math.abs(this._gd).toFixed(2)}`);
        this.ghostD.className = `gd ${this._gd > 0.05 ? 'dn' : this._gd < -0.05 ? 'up' : ''}`;
      } else setText(this.ghostD, 'racing');
    }

    // finishing: offer to skip the wait for the other racers
    if (race.phase === 'finishing' && me.race.finished && this.finishedAt >= 0 && this.t - this.finishedAt > 2.4 && !this.gotoResultsReady) { this.gotoResultsReady = true; this._setSkip('finish'); }

    // gamepad: A skips intro / goes to results (Input only polls pads while racing)
    this._padPoll();

    // touch overlay follows the active input device
    const tw = this.touchWanted();
    if (tw !== this.touch.shown) { this.root.classList.toggle('touch', tw); this.touch.setShown(tw); }

    // fps overlay
    if (st.showFps) {
      this.fpsFrames++; this.fpsAcc += dt;
      if (this.fpsAcc >= 0.5) {
        const info = this.app.renderer?.renderer?.info?.render;
        this.fpsText = `${Math.round(this.fpsFrames / this.fpsAcc)} fps  ${(1000 * this.fpsAcc / this.fpsFrames).toFixed(1)} ms${info ? `\n${info.calls} calls  ${Math.round(info.triangles / 1000)}k tris` : ''}`;
        this.fpsFrames = 0; this.fpsAcc = 0;
      }
      setText(this.fps, this.fpsText);
    }
  }

  _padPoll() {
    let down = false;
    try { for (const p of navigator.getGamepads?.() ?? []) if (p && p.buttons.some((b) => b.pressed)) { down = true; break; } } catch { /* blocked */ }
    const edge = down && !this._padPrev;
    this._padPrev = down;
    if (!edge || this.app.paused) return;
    const phase = this.session.race?.phase;
    if (phase === 'intro') this.session.race.skipIntro?.();
    else if (phase === 'finishing' && this.gotoResultsReady) this._toResults();
  }

  destroy() {
    for (const off of this.offs) { try { off(); } catch { /* ignore */ } }
    this.offs = [];
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointerdown', this._onPointer);
    this.touch.destroy();
  }
}
