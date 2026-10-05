// Application shell: owns the renderer, input, audio, save, UI, the menu backdrop and the current RaceSession, and runs
// the single requestAnimationFrame loop.  OWNER: Agent E (ui/app).
//
// PUBLIC API that the debug harness (src/core/debug.js) and other modules rely on - keep these names working:
//   app.boot()                         -> Promise, resolves when the first screen is interactive
//   app.startRace(config)              -> Promise<RaceSession>; config as in core/RaceSession.js normalizeConfig()
//   app.quitToMenu()
//   app.setPaused(bool)  app.paused
//   app.session                        current RaceSession | null
//   app.input / app.renderer / app.audio / app.save / app.settings / app.quality / app.events / app.ui
//   app.freeze                         true = main loop does nothing (tests drive time via __kart.advance/render)
//   app.renderFrame()                  render one frame of whatever is on screen (menu or race)
//   app.defaultRaceConfig()            sensible config from URL params + profile (used by autostart)
import { EventBus } from '../core/EventBus.js';
import { Save } from '../save/Save.js';
import { GameRenderer } from '../render/GameRenderer.js';
import { makeQuality, resolveQualityId } from '../render/quality.js';
import { Input } from '../core/Input.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UI } from '../ui/UI.js';
import { MenuScene } from './MenuScene.js';
import { RaceSession } from '../core/RaceSession.js';
import { EV } from '../core/events.js';
import { param, paramNum, paramFlag } from '../core/params.js';

export class App {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
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
    this.session = null;
    this.paused = false;
    this.freeze = false;
    this.last = 0;
    this._tick = (t) => this.tick(t);
  }

  async boot() {
    const fill = document.getElementById('boot-fill');
    if (fill) fill.style.width = '60%';
    this.ui.showTitle();
    requestAnimationFrame(this._tick);
    if (paramFlag('autostart')) await this.startRace(this.defaultRaceConfig());
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

  async startRace(config) {
    this.input.enabled = false;
    if (this.session) { this.session.dispose(); this.session = null; }
    this.ui.showLoading(0, 'Starting…');
    const session = new RaceSession(this, config);
    this.session = session;
    await session.load((p, m) => this.ui.showLoading(p, m));
    session.on(EV.RACE_RESULTS, ({ standings }) => {
      setTimeout(() => { if (this.session === session) { this.input.enabled = false; this.ui.showResults(standings); } }, 1800);
    });
    this.ui.showHud(session);
    this.input.enabled = true;
    this.paused = false;
    return session;
  }

  quitToMenu() {
    this.input.enabled = false;
    if (this.session) { this.session.dispose(); this.session = null; }
    this.paused = false;
    this.ui.showTitle();
  }

  setPaused(p) { this.paused = !!p; this.input.enabled = !p && !!this.session; }

  renderFrame() {
    const s = this.session;
    if (s?.loaded) s.render(); else this.menuScene.render();
  }

  tick(now) {
    requestAnimationFrame(this._tick);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    if (this.freeze) return;
    const s = this.session;
    if (s?.loaded) {
      if (this.input.pressed('pause') && s.race.phase !== 'results') this.setPaused(!this.paused);
      if (!this.paused) {
        if (this.input.pressed('camera')) s.cameraRig.cycleMode();
        if (this.input.pressed('respawn') && s.player && s.race.phase === 'racing') s.physics.respawnKart(s.player, 'manual');
        s.update(dt);
      }
      s.render();
      this.ui.update(dt, s);
    } else {
      this.menuScene.update(dt);
      this.menuScene.render();
    }
    this.input.endFrame();
  }
}
