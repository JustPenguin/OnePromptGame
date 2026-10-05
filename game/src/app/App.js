// Application shell: owns the renderer, input, audio, save, UI, the menu backdrop and the current RaceSession, and runs
// the single requestAnimationFrame loop.  OWNER: Agent E (ui/app).
//
// PUBLIC API that the debug harness (src/core/debug.js) and other modules rely on - keep these names working:
//   app.boot()                         -> Promise, resolves when the first screen is interactive
//   app.startRace(config, opts?)       -> Promise<RaceSession>; config as in core/RaceSession.js normalizeConfig()
//                                         opts (additive): { transition: bool (chequered wipes), flow: Flow }
//   app.quitToMenu()
//   app.setPaused(bool)  app.paused    (setPaused(true) also opens the pause menu)
//   app.session                        current RaceSession | null
//   app.input / app.renderer / app.audio / app.save / app.settings / app.quality / app.events / app.ui
//   app.freeze                         true = main loop does nothing (tests drive time via __kart.advance/render)
//   app.renderFrame()                  render one frame of whatever is on screen (menu or race) + sync the HUD
//   app.defaultRaceConfig()            sensible config from URL params + profile (used by autostart)
// Additive: app.flow (mode wizard + Grand Prix), app.run ({kind:'flow'|'adhoc', flow, config}), app.menuScene,
//           app.restartRace(), app.afterRaceContinue(), app.toSetup().
import { EventBus } from '../core/EventBus.js';
import { Save } from '../save/Save.js';
import { GameRenderer } from '../render/GameRenderer.js';
import { makeQuality, resolveQualityId } from '../render/quality.js';
import { Input } from '../core/Input.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UI } from '../ui/UI.js';
import { MenuScene } from './MenuScene.js';
import { Flow } from './Flow.js';
import { RaceSession } from '../core/RaceSession.js';
import { EV } from '../core/events.js';
import { param, paramNum, paramFlag } from '../core/params.js';
import { applySetting } from './settingsApply.js';
import { installMocks } from './devMocks.js';
import { RaceStats, recordRace, recordPartial, saveGhost } from '../modes/career.js';

const RESULTS_DELAY_MS = 1400;     // let the finish camera breathe before the results card appears

export class App {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    installMocks();                       // ?mocktracks=1 only (QA aid)
    this.events = new EventBus();
    this.save = new Save();
    this.settings = this.save.settings;
    this.renderer = new GameRenderer(canvas);
    this.quality = makeQuality(resolveQualityId(this.settings.quality, param('quality')), paramNum('scale', 0) || undefined);
    this.renderer.setQuality(this.quality);
    this.input = new Input(() => this.settings);
    if (this.settings.bindings) this.input.setBindings(this.settings.bindings);
    this.audio = new AudioManager(() => this.settings);
    this.ui = new UI(this);
    this.menuScene = new MenuScene(this);
    this.flow = new Flow(this);
    applySetting(this);                   // quality/audio/bindings/ui prefs from the saved settings
    this.session = null;
    this.run = null;
    this.paused = false;
    this.freeze = false;
    this.last = 0;
    this._pauseUi = false;
    this._broken = false;
    this._hold = false;
    this._tick = (t) => this.tick(t);

    // a hidden tab must never keep a race running (and rAF throttles anyway): pause + silence
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      const s = this.session;
      if (s?.loaded && !this.paused && s.race.phase !== 'results') this.setPaused(true);
    });
    // unexpected errors in event handlers: keep playing, tell the player once
    let warned = false;
    const soft = (e) => { console.error(e?.error ?? e?.reason ?? e); if (!warned) { warned = true; this.ui.toast({ title: 'Something hiccuped', text: 'If anything looks odd, reload the page.', kind: 'bad', icon: 'warning' }); } };
    window.addEventListener('error', soft);
    window.addEventListener('unhandledrejection', soft);
  }

  async boot() {
    const fill = document.getElementById('boot-fill');
    if (fill) fill.style.width = '60%';
    this.menuScene.applyProfile();
    requestAnimationFrame(this._tick);
    if (paramFlag('autostart')) await this.startRace(this.defaultRaceConfig());
    else this.ui.showTitle();
    const n = this.save.notice;
    if (n === 'recovered') this.ui.toast({ title: 'Saved progress unreadable', text: 'It was set aside as a backup and you start fresh.', kind: 'bad', icon: 'warning', ms: 6000 });
    else if (n === 'newer') this.ui.toast({ title: 'Save from a newer version', text: 'Loaded what could be understood. A backup was kept.', icon: 'info', ms: 6000 });
    if (fill) fill.style.width = '100%';
  }

  defaultRaceConfig() {
    const p = this.save.profile;
    return {
      mode: 'versus',
      trackId: param('track', 'sunny-meadows'),
      laps: paramNum('laps', 3),
      racers: paramNum('racers', 8),
      speedClass: param('speed', 'pro'),
      player: { driverId: param('driver', p.favoriteDriver), bodyId: param('kart', p.favoriteKart), name: p.name },
      skipIntro: paramFlag('skipintro'),
    };
  }

  /** Tear down the current session (recording partial stats if it never finished). */
  _disposeSession() {
    const s = this.session;
    if (!s) return;
    try { recordPartial(this, s); } catch (e) { console.warn('[app] partial stats failed', e); }
    this.session = null;
    s.dispose();
  }

  async startRace(config, opts = {}) {
    const flow = opts.flow ?? null;
    this.input.enabled = false;
    this._pauseUi = false;
    this._disposeSession();
    this.ui.hideHud();
    this.run = { kind: flow ? 'flow' : 'adhoc', flow, config };
    const loadCfg = { ...config };
    const showLoading = () => this.ui.reset('loading', { config: loadCfg }, 'fade');
    if (opts.transition) await this.ui.wipe(showLoading); else showLoading();
    const loading = this.ui.screen;

    const session = new RaceSession(this, config);
    this.session = session;
    this.paused = false;
    try {
      await session.load((p, m) => loading?.set?.(p, m));
    } catch (e) {
      console.error('[app] race failed to load', e);
      if (this.session === session) this._disposeSession();
      this.ui.clearScreens();
      this.ui.showFatal(e);
      throw e;
    }
    if (this.session !== session) return session;       // quit while loading
    this._hold = true;                                  // keep the intro cinematic frozen until the player can actually see it
    session._krStats = new RaceStats(session);
    session.on(EV.RACE_RESULTS, ({ standings }) => this._onResults(session, standings));
    this.audio?.setPaused?.(false);
    const begin = () => {
      this.ui.clearScreens();
      this.ui.showHud(session);
      this.input.enabled = true;
      this._hold = false;
    };
    if (opts.transition) await this.ui.wipe(begin); else begin();
    return session;
  }

  /** Same race, from the grid (pause menu "Restart"). */
  async restartRace(fromResults = false) {
    const cfg = this.run?.config ?? this.session?.config;
    if (!cfg) return null;
    const flow = this.run?.flow ?? null;
    return this.startRace(fromResults ? { ...cfg, seed: (Math.random() * 0xffffffff) >>> 0 } : cfg, { transition: true, flow });
  }

  quitToMenu() {
    this.input.enabled = false;
    this._broken = false;
    this._hold = false;
    this._pauseUi = false;
    this.paused = false;
    this._disposeSession();
    this.run = null;
    this.flow.cancel();
    this.ui.hideHud();
    this.audio?.setPaused?.(false);
    this.audio?.playMusic?.('menu');
    this.menuScene.applyProfile();
    this.ui.layers.error.replaceChildren();
    this.ui.reset('menu');
  }

  /** Versus results -> "Change setup": back into the setup screen with the same selections. */
  toSetup() {
    const flow = this.run?.flow;
    this._disposeSession();
    this.ui.hideHud();
    this.menuScene.applyProfile();
    this.ui.reset('menu');
    if (flow) { this.ui.push(flow.mode === 'versus' ? 'vsetup' : flow.steps[flow.steps.length - 1], {}); }
  }

  /** Grand Prix: results -> standings (or podium after the last race). */
  afterRaceContinue() {
    const flow = this.run?.flow;
    this._disposeSession();
    this.ui.hideHud();
    this.menuScene.applyProfile();
    this.audio?.playMusic?.('menu');
    const gp = flow?.gp;
    if (!gp) { this.ui.reset('menu'); return; }
    this.ui.reset('standings', {}, 'fade');      // after the last race too: the final table, then its "Podium" button
  }

  _onResults(session, standings) {
    if (this.session !== session) return;
    const flow = this.run?.flow;
    const summary = recordRace(this, session, standings, { mode: flow?.mode ?? session.config.mode });
    if (flow?.mode === 'grandprix' && flow.gp && !session._krGp) session._krGp = summary.gp = flow.gp.record(standings);
    this.events.emit('race:recorded', { summary });
    setTimeout(() => {
      if (this.session !== session || this.paused) return;
      saveGhost(this, session, summary);
      this.input.enabled = false;
      this.audio?.playMusic?.('results');
      this.ui.hud?.hide?.();
      this.ui.reset('results', { summary, standings }, 'fade');
    }, RESULTS_DELAY_MS);
  }

  setPaused(p) {
    p = !!p;
    const s = this.session;
    this.paused = p;
    this.input.enabled = !p && !!s && s.loaded && s.race?.phase !== 'results';
    this.audio?.setPaused?.(p);
    if (p && s?.loaded && !this._pauseUi) {
      this._pauseUi = true;
      this.ui.hud?.setDim?.(true);
      this.ui.reset('pause', {}, 'fade');
    } else if (!p && this._pauseUi) {
      this._pauseUi = false;
      this.ui.hud?.setDim?.(false);
      this.ui.clearScreens();
    }
  }

  renderFrame() {
    const s = this.session;
    if (s?.loaded) { s.render(); this.ui.update(0.05, s, true); }
    else { this.menuScene.render(); this.ui.update(0.05, null, true); }
  }

  tick(now) {
    requestAnimationFrame(this._tick);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    if (this.freeze || this._broken) { if (this._broken) this.input.endFrame(); return; }
    try {
      const s = this.session;
      this.menuScene.active = !s?.loaded;
      if (s?.loaded) {
        if (!this.paused && !this._hold && this.input.pressed('pause') && s.race.phase !== 'results') this.setPaused(true);
        if (!this.paused && !this._hold) {
          if (this.input.pressed('camera')) { const m = s.cameraRig.cycleMode(); if (m) { this.settings.cameraMode = m; this.save.commit(); } }
          if (this.input.pressed('respawn') && s.player && s.race.phase === 'racing') s.physics.respawnKart(s.player, 'manual');
          s.update(dt);
        }
        s.render();
        this.ui.update(dt, s);
      } else {
        this.menuScene.update(dt);
        this.menuScene.render();
        this.ui.update(dt, null);
      }
      this.input.endFrame();
    } catch (e) {
      console.error('[app] frame failed', e);
      this._broken = true;
      this.input.enabled = false;
      this.ui.showFatal(e);
    }
  }
}
