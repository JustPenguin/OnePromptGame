// Procedural audio (WebAudio, no files). OWNER: Agent D (audio).
// Contract (stable) - other modules only use these:
//   audio.unlock()                  call from a user gesture (click/key); creates/resumes the AudioContext
//   audio.ui(name)                  'click' | 'hover' | 'confirm' | 'back' | 'error' | 'select' | 'tick' (+ 'toast' 'start' 'pause' 'resume' 'unlock')
//   audio.sfx(name, opts?)          one-shot effects by name (see sfx.js), opts {volume, pitch, position, level, index}
//   audio.attachSession(session)    called when a race session is created: subscribe to session.events, start the
//                                   engine voices + music;   audio.detachSession()  on dispose
//   audio.update(dt, session)       per frame while racing (engine pitch, drift loop, doppler-ish panning)
//   audio.playMusic(key) / stopMusic()   key = track.def.music ('meadow' ...) or 'menu' | 'results'
//   audio.setMusicIntensity(x) / setPaused(bool) / applySettings() / stats()
// Browsers only allow audio after a gesture: everything is a silent no-op until unlock() ran (calls are still counted in
// stats().requested so tests can prove the triggers fire).
//
// Graph:   engines -> engineBus --\
//          sfx -> sfxBus (+reverb send) -+-> master -> compressor (limiter) -> soft clipper (< 1.0) -> destination
//          music -> comp -> musicBus -> duck -> lowpass --/        ui -> uiBus --/
import { EV } from '../core/events.js';
import { paramFlag } from '../core/params.js';
import { SURFACE_PROPS } from '../track/surfaces.js';
import { SFX, SFX_META } from './sfx.js';
import { EngineModel, EngineVoice } from './engine.js';
import { MusicPlayer } from './music/Sequencer.js';
import { SONGS } from './music/songs.js';
import { makeImpulse, softClipCurve, clamp } from './synth.js';

const MAX_VOICES = 36;          // concurrent one-shots (low-priority ones are dropped beyond this)
const MAX_AI_ENGINES = 4;
const UI_NAMES = { click: 'uiClick', hover: 'uiHover', confirm: 'uiConfirm', back: 'uiBack', error: 'uiError', select: 'uiSelect', tick: 'uiTick', toast: 'uiToast', start: 'uiStart', pause: 'uiPause', resume: 'uiResume', unlock: 'uiUnlock' };

export class AudioManager {
  constructor(settingsProvider = () => ({})) {
    this.settings = settingsProvider;
    this.ctx = null;
    this.session = null;
    this.unlocked = false;
    this.paused = false;
    this.noMusic = paramFlag('nomusic');
    this.noSfx = paramFlag('nosfx');
    this.counters = { requested: {}, played: {} };
    this.active = 0;                  // live one-shot voices
    this._last = {};
    this._offs = [];
    this._pendingMusic = null;
    this.music = null;
    this.musicKey = null;
    this._acc = 0;
    this._rouletteIdx = 0;
    this._tmp = { right: null, v: null };
    this.engines = new Map();         // kart -> { voice, model }
    this.playerEngine = null;
    this._aiT = 0;
    this._lock = null; this._lockT = 0;
    this._wrongWay = 0; this._wrongT = 0;
    this._bombT = new Map();
    this.shieldHum = null;
    this._slowMo = false;             // photo-finish slow motion (engine EV.PHOTO_FINISH)
  }

  // ================================================================================================================ context
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this._build();
        this.applySettings();
        document.addEventListener('visibilitychange', this._onVis = () => {
          if (!this.ctx) return;
          if (document.hidden) this.ctx.suspend?.(); else if (this.unlocked) this.ctx.resume?.();
        });
        this._poll = setInterval(() => this._pollState(), 150);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const first = !this.unlocked;
      this.unlocked = true;
      if (first) {
        if (this.session) this._startSession();
        else setTimeout(() => { if (!this.session && !this.musicKey && !this._pendingMusic) this.playMusic('menu'); }, 350);
        if (this._pendingMusic) { const k = this._pendingMusic; this._pendingMusic = null; this.playMusic(k); }
      }
    } catch (e) { console.warn('[audio] unavailable', e); }
  }

  _build() {
    const c = this.ctx;
    // buses -> master (user volume + make-up gain) -> compressor (acts as the limiter) -> soft clipper (< 1.0) -> speakers
    this.clip = c.createWaveShaper(); this.clip.curve = softClipCurve(0.72); this.clip.oversample = '2x';
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = 1.2;
    this.master.connect(this.comp); this.comp.connect(this.clip); this.clip.connect(c.destination);
    this.out = this.master;
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.out);
    this.uiBus = c.createGain(); this.uiBus.connect(this.out);
    this.engineBus = c.createGain(); this.engineBus.connect(this.out);
    // music: glue compressor (kick + bass coincide) -> volume -> sidechain-style duck -> pause muffle
    this.musicIn = c.createGain();
    this.musicComp = c.createDynamicsCompressor();
    this.musicComp.threshold.value = -20; this.musicComp.knee.value = 12; this.musicComp.ratio.value = 3.5; this.musicComp.attack.value = 0.006; this.musicComp.release.value = 0.14;
    this.musicBus = c.createGain(); this.musicDuck = c.createGain(); this.musicLP = c.createBiquadFilter();
    this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 18000; this.musicLP.Q.value = 0.5;
    this.musicIn.connect(this.musicComp); this.musicComp.connect(this.musicBus);
    this.musicBus.connect(this.musicDuck); this.musicDuck.connect(this.musicLP); this.musicLP.connect(this.out);
    // short room reverb shared by SFX and (a little) the music
    this.reverb = c.createConvolver(); this.reverb.buffer = makeImpulse(c, 1.5, 3.0, 5500);
    this.reverbSend = c.createGain(); this.reverbSend.gain.value = 1;
    this.reverbRet = c.createGain(); this.reverbRet.gain.value = 0.55;
    this.reverbSend.connect(this.reverb); this.reverb.connect(this.reverbRet); this.reverbRet.connect(this.out);
    this._tmp.right = { x: 1, y: 0, z: 0 };
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings() ?? {}, now = this.ctx.currentTime;
    const v = (x, d) => (Number.isFinite(x) ? clamp(x, 0, 1) : d);
    this.master.gain.setTargetAtTime(v(s.masterVolume, 0.8) * 1.5, now, 0.03);
    this.musicBus.gain.setTargetAtTime(this.noMusic ? 0 : v(s.musicVolume, 0.6) * 0.8, now, 0.05);
    const sfx = this.noSfx ? 0 : v(s.sfxVolume, 0.9);
    this.sfxBus.gain.setTargetAtTime(sfx * 1.5, now, 0.03);
    this.uiBus.gain.setTargetAtTime(sfx * 1.5, now, 0.03);
    this.engineBus.gain.setTargetAtTime(this.paused ? 0 : sfx * 0.55, now, 0.05);
    this.reverbSend.gain.setTargetAtTime(1, now, 0.05);
  }

  /** Pause: duck engines, muffle the music.  Also driven automatically from session.app.paused / tab visibility. */
  setPaused(paused) {
    paused = !!paused;
    if (paused === this.paused) return;
    this.paused = paused;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._musicFilter(0.08);
    this.musicDuck.gain.setTargetAtTime(paused ? 0.55 : 1, now, 0.1);
    this.applySettings();
    if (paused) for (const e of this.engines.values()) e.voice.apply({ gain: 0 }, 0.02);
    if (paused) this.playerEngine?.voice.apply({ gain: 0 }, 0.02);
    this.sfx(paused ? 'uiPause' : 'uiResume', { ui: true });
  }

  /** Music muffle: paused > photo-finish slow motion > open. */
  _musicFilter(tc = 0.1) {
    if (!this.ctx) return;
    this.musicLP.frequency.setTargetAtTime(this.paused ? 650 : this._slowMo ? 1400 : 18000, this.ctx.currentTime, tc);
  }

  /** Photo-finish slow motion: dive the music into a low-pass, drop the engine pitch, sting in / out. */
  setSlowMo(on) {
    on = !!on;
    if (on === this._slowMo) return;
    this._slowMo = on;
    this.sfx(on ? 'slowMoIn' : 'slowMoOut');
    this._musicFilter(on ? 0.12 : 0.25);
  }

  _pollState() {
    const app = this.session?.app;
    if (app && typeof app.paused === 'boolean') this.setPaused(app.paused);
  }

  // ================================================================================================================ one-shots
  /** Play a UI sound (menus work while paused). */
  ui(name) { return this.sfx(UI_NAMES[name] ?? 'uiClick', { ui: true }); }

  /**
   * One-shot effect by name.  opts: { volume, pitch, position: {x,y,z}, level, index, delay }
   * Returns true if the sound was scheduled.
   */
  sfx(name, opts = {}) {
    this.counters.requested[name] = (this.counters.requested[name] ?? 0) + 1;
    if (!this.ctx || !this.unlocked || this.noSfx) return false;
    const fn = SFX[name];
    if (!fn) return false;
    const meta = SFX_META[name] ?? {};
    const c = this.ctx, now = c.currentTime;
    if (meta.cd && now - (this._last[name] ?? -9) < meta.cd) return false;
    if (this.active >= MAX_VOICES && (meta.prio ?? 1) < 2) return false;
    if (this.active >= MAX_VOICES + 12) return false;
    this._last[name] = now;
    const pv = meta.pv ?? 0.05;
    const o = { ...opts, pitch: (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * pv) };
    const t = now + (opts.delay ?? 0.004);
    // routing: dry gain -> (spatial chain) -> bus, optional reverb send
    const bus = opts.ui ? this.uiBus : this.sfxBus;
    let out = bus, extra = null;
    const wet = meta.wet ?? 0;
    const sp = opts.position && this.session ? this._spatial(opts.position) : null;
    if (sp && sp.gain < 0.02) return false;
    if (sp || wet > 0) {
      extra = c.createGain(); extra.gain.value = sp ? sp.gain : 1;
      let tail = extra;
      if (sp) {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.lp; lp.Q.value = 0.4;
        const pan = c.createStereoPanner(); pan.pan.value = sp.pan;
        tail.connect(lp); lp.connect(pan); tail = pan;
      }
      tail.connect(bus);
      if (wet > 0) { const w = c.createGain(); w.gain.value = wet * (sp ? Math.max(0.2, sp.gain) : 1); tail.connect(w); w.connect(this.reverbSend); }
      out = extra;
    }
    let dur = 0.5;
    try { dur = fn(c, out, t, o) ?? 0.5; } catch (e) { console.warn('[audio] sfx failed', name, e); return false; }
    this.active++;
    setTimeout(() => { this.active = Math.max(0, this.active - 1); }, (dur + 0.25) * 1000);
    this.counters.played[name] = (this.counters.played[name] ?? 0) + 1;
    return true;
  }

  /** gain / pan / low-pass for a sound at a world position, relative to the camera. */
  _spatial(p) {
    const cam = this.session.camera;
    const dx = p.x - cam.position.x, dy = p.y - cam.position.y, dz = p.z - cam.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const r = this._tmp.right;
    const pan = clamp(((dx * r.x + dy * r.y + dz * r.z) / Math.max(d, 4)) * 1.25, -0.95, 0.95);
    return { gain: clamp(1 / (1 + (d / 16) * (d / 16)), 0.0, 1) * 0.9, pan, lp: clamp(16000 / (1 + d / 18), 700, 16000), d };
  }

  duck(amount = 0.4, release = 0.5) {
    if (!this.ctx || this.paused) return;
    const g = this.musicDuck.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1 - amount, now, 0.015);
    g.setTargetAtTime(1, now + 0.12, release / 3);
  }

  // ================================================================================================================ music
  playMusic(key, opts = {}) {
    this.musicKey = SONGS[key] ? key : 'meadow';
    if (!this.ctx || !this.unlocked) { this._pendingMusic = this.musicKey; return; }
    this.music ??= new MusicPlayer(this.ctx, this.musicIn);
    this.music.play(this.musicKey, { fade: opts.fade ?? 0.8, intensity: opts.intensity ?? 1, final: !!opts.final });
  }
  stopMusic(fade = 0.8) { this.musicKey = null; this._pendingMusic = null; this.music?.stop(fade); }
  setMusicIntensity(x) { this.music?.setIntensity(clamp(Number.isFinite(x) ? x : 1, 0, 1)); }

  // ================================================================================================================ session
  attachSession(session) {
    this.detachSession(true);
    this.session = session;
    if (this.unlocked) this._startSession();
  }

  _startSession() {
    const s = this.session;
    if (!s || this._started === s) return;
    this._started = s;
    const on = (t, f) => this._offs.push(s.on(t, f));
    this._subscribe(on, s);
    // music: groove layers during the intro/countdown, everything at GO
    const key = s.track?.def?.music ?? s.track?.theme ?? 'meadow';
    this.playMusic(key, { fade: 0.6, intensity: 0.4 });
    this._rouletteIdx = 0;
    this.focus = null;
  }

  detachSession(keepMusic = false) {
    this._offs.forEach((o) => { try { o(); } catch { /* gone */ } });
    this._offs = [];
    for (const e of this.engines.values()) e.voice.stop(0.1);
    this.engines.clear();
    this.playerEngine?.voice.stop(0.15); this.playerEngine = null;
    this.shieldHum?.stop?.(); this.shieldHum = null;
    this._lock = null; this._wrongWay = 0; this._bombT.clear();
    if (this._slowMo) { this._slowMo = false; this._musicFilter(0.1); }
    const had = !!this.session;
    this.session = null; this._started = null; this.focus = null;
    if (had && !keepMusic && this.unlocked) this.playMusic('menu', { fade: 1.0 });
  }

  /** Is `k` the kart we are listening from? */
  _mine(k) { const s = this.session; return !!k && (k === (s.cameraTarget ?? s.player)); }
  _near(pos, r = 70) { const cam = this.session.camera.position; const dx = pos.x - cam.x, dz = pos.z - cam.z; return dx * dx + dz * dz < r * r; }

  _subscribe(on, s) {
    const A = this;
    const kartSfx = (kart, name, o = {}, nearOpts = null) => {
      if (A._mine(kart)) A.sfx(name, o);
      else if (nearOpts && kart && A._near(kart.position)) A.sfx(name, { ...o, ...nearOpts, position: kart.position });
    };
    on(EV.COUNTDOWN, ({ count }) => A.sfx(count === 0 ? 'go' : 'countdown', { pitch: count === 0 ? 1 : 1 }));
    on(EV.RACE_START, () => A.music?.setIntensity(1));
    on(EV.RACE_PHASE, ({ phase }) => { if (phase === 'results') A.music?.setIntensity(1); });
    on(EV.START_BOOST, ({ kart }) => kartSfx(kart, 'startBoost'));
    on(EV.START_BURNOUT, ({ kart }) => kartSfx(kart, 'burnout'));
    on(EV.HOP, ({ kart }) => kartSfx(kart, 'hop', { volume: 0.8 }));
    on(EV.DRIFT_START, ({ kart }) => kartSfx(kart, 'driftStart', {}, { volume: 0.5 }));
    on(EV.DRIFT_LEVEL, ({ kart, level }) => kartSfx(kart, 'driftLevel', { level }));
    on(EV.DRIFT_BOOST, ({ kart, level }) => { kartSfx(kart, 'driftBoost', { level }, { volume: 0.55 }); if (A._mine(kart)) A.duck(0.18, 0.6); });
    on(EV.BOOST, ({ kart, source }) => {
      if (source === 'drift' || source === 'start' || source === 'shield') return;
      if (source === 'pad') return;                                                   // PAD_BOOST plays its own sound
      if (source === 'rocket') return;                                                // the rocket start sound covers it
      kartSfx(kart, 'boost', {}, { volume: 0.5 });
      if (A._mine(kart)) A.duck(0.25, 0.8);
    });
    on(EV.PAD_BOOST, ({ kart }) => { kartSfx(kart, 'padBoost', {}, { volume: 0.5 }); if (A._mine(kart)) A.duck(0.2, 0.7); });
    on(EV.WALL_HIT, ({ kart, impact }) => { kartSfx(kart, 'wallHit', { level: clamp(impact / 22, 0.25, 1) }, { volume: 0.6, level: clamp(impact / 22, 0.25, 1) }); if (A._mine(kart)) A.duck(0.3, 0.5); });
    on(EV.BUMP, ({ a, b, impact, point }) => {
      const lvl = clamp(impact / 14, 0.25, 1);
      if (A._mine(a) || A._mine(b)) { A.sfx('bump', { level: lvl }); A.duck(0.25, 0.4); }
      else if (point && A._near(point, 50)) A.sfx('bump', { level: lvl * 0.7, position: point, volume: 0.7 });
    });
    on(EV.SPIN_OUT, ({ kart }) => { kartSfx(kart, 'spin', {}, { volume: 0.6 }); if (A._mine(kart)) A.duck(0.35, 0.8); });
    on(EV.LAUNCH, ({ kart }) => { kartSfx(kart, 'launch', {}, { volume: 0.6 }); if (A._mine(kart)) A.duck(0.45, 1.0); });
    on(EV.RECOVER, ({ kart }) => kartSfx(kart, 'recover'));
    on(EV.JUMP, ({ kart }) => kartSfx(kart, 'jump'));
    on(EV.LAND, ({ kart, impact }) => kartSfx(kart, 'land', { level: clamp(impact / 22, 0.2, 1) }));
    on(EV.RESPAWN, ({ kart }) => kartSfx(kart, 'respawn', {}, { volume: 0.5 }));
    on(EV.RESPAWN_DONE, ({ kart }) => kartSfx(kart, 'respawnDone'));
    on(EV.SHRINK, ({ kart, active }) => kartSfx(kart, active ? 'shrink' : 'unshrink', {}, { volume: 0.5 }));
    on(EV.ROCKET, ({ kart, active }) => { if (active) kartSfx(kart, 'rocketStart', {}, { volume: 0.6 }); else kartSfx(kart, 'rocketEnd', {}, { volume: 0.5 }); });
    on(EV.COIN, ({ kart, total, lost }) => { if (!A._mine(kart)) return; if (lost) A.sfx('coinLost'); else A.sfx('coin', { pitch: 1 + (total ?? 0) * 0.03 }); });
    on(EV.LAP_COMPLETE, ({ kart, lap }) => { if (A._mine(kart) && lap < (A.session.race?.lapCount ?? 99)) A.sfx('lap'); });
    on(EV.FINAL_LAP, ({ kart }) => { if (A._mine(kart)) { A.sfx('finalLap'); A.music?.setFinal(true); } });
    on(EV.KART_FINISH, ({ kart, place }) => {
      if (!A._mine(kart)) return;
      A.sfx(place === 1 ? 'finishWin' : place <= 3 ? 'finishPodium' : 'finishLose');
      A.music?.setFinal(false);
    });
    on(EV.RACE_RESULTS, () => A.playMusic('results', { fade: 1.2 }));
    on(EV.OVERTAKE, ({ kart }) => { if (A._mine(kart)) A.sfx('overtake'); });
    on(EV.WRONG_WAY, ({ kart, active }) => { if (A._mine(kart)) { A._wrongWay = active ? 1 : 0; A._wrongT = 0; } });
    if (EV.DRAFT) on(EV.DRAFT, ({ kart, active }) => { if (active && A._mine(kart)) A.sfx('draftOn'); });          // slipstream (engine)
    if (EV.PHOTO_FINISH) on(EV.PHOTO_FINISH, ({ active }) => A.setSlowMo(active));                                  // slow-motion finish (engine)
    // ---- items
    on(EV.ITEM_BOX, ({ kart, box }) => { A._rouletteIdx = 0; if (A._mine(kart)) A.sfx('itemBox'); else if (box && A._near(box.position, 60)) A.sfx('itemBox', { position: box.position, volume: 0.7 }); });
    on(EV.ITEM_ROULETTE, ({ kart, tick }) => { if (tick && A._mine(kart)) A.sfx('rouletteTick', { index: A._rouletteIdx++ }); });
    on(EV.ITEM_GOT, ({ kart, type }) => { if (A._mine(kart)) A.sfx(type === 'rocket' || type === 'comet' || type === 'shield' || type === 'shock' ? 'itemGotRare' : 'itemGot'); });
    on(EV.ITEM_USE, ({ kart, type, backward }) => {
      const m = { peel: backward ? 'peelDrop' : 'peelThrow', orb: 'orbThrow', seeker: 'seekerLaunch', bomb: 'bombThrow', comet: 'cometLaunch', shield: 'shieldUp', ink: 'inkSplat' }[type];
      if (m) kartSfx(kart, m, {}, { volume: 0.75 });
    });
    on(EV.ITEM_LAND, ({ type, point }) => { if (type === 'peel' && point && A._near(point, 50)) A.sfx('peelLand', { position: point, volume: 0.8 }); });
    on(EV.ITEM_BOUNCE, ({ type, point }) => { if (point && A._near(point, 70)) A.sfx(type === 'orb' ? 'orbBounce' : 'bump', { position: point, volume: type === 'orb' ? 0.9 : 0.4, level: 0.3 }); });
    on(EV.ITEM_HIT, ({ victim, type }) => {
      const m = { peel: 'peelHit', orb: 'orbHit', ink: 'inkSplat', ram: 'bump', seeker: null, bomb: null, comet: null, shock: null }[type];
      if (!m) return;
      if (A._mine(victim)) A.sfx(m, { level: 0.8 });
      else if (A._near(victim.position, 60)) A.sfx(m, { position: victim.position, volume: 0.7, level: 0.6 });
    });
    on(EV.ITEM_BLOCKED, ({ victim }) => { if (A._mine(victim)) A.sfx('blocked'); else if (victim && A._near(victim.position, 50)) A.sfx('blocked', { position: victim.position, volume: 0.7 }); });
    on(EV.ITEM_EXPLODE, ({ type, point, radius }) => {
      if (!point || radius > 200 || type === 'orb') return;
      if (!A._near(point, 120)) return;
      const name = type === 'comet' ? 'cometImpact' : type === 'seeker' ? 'explosionSmall' : 'explosion';
      A.sfx(name, { position: point, level: clamp(radius / 9, 0.5, 1.5) });
      const sp = A._spatial(point);
      if (sp.d < 40) A.duck(0.5 * (1 - sp.d / 50), 1.0);
    });
    on(EV.ITEM_SHOCK, ({ kart, victims }) => { A.sfx('shock', { volume: A._mine(kart) || (victims ?? []).some((v) => A._mine(v)) ? 1 : 0.6 }); A.duck(0.5, 1.2); });
    on(EV.ITEM_LOCK, ({ kart, type, active }) => {
      if (!A._mine(kart)) return;
      A._lock = active ? { type } : null; A._lockT = 0;
    });
    on(EV.ITEM_END, ({ kart, type }) => { if (A._mine(kart) && type === 'shield') A.sfx('shieldDown'); });
  }

  // ================================================================================================================ per frame
  update(dt, session) {
    if (!this.ctx || !this.unlocked || !this.session || this.paused) return;
    this._acc += dt;
    if (this._acc < 1 / 30) return;
    dt = this._acc; this._acc = 0;
    const s = this.session, cam = s.camera;
    // listener basis (camera right vector)
    const q = cam.quaternion, r = this._tmp.right;
    r.x = 1 - 2 * (q.y * q.y + q.z * q.z); r.y = 2 * (q.x * q.y + q.w * q.z); r.z = 2 * (q.x * q.z - q.w * q.y);
    const focus = s.cameraTarget ?? s.player;
    if (!focus) return;
    this.focus = focus;
    this._updatePlayerEngine(dt, focus);
    this._updateAIEngines(dt, s, focus);
    this._updateLoops(dt, s, focus);
  }

  _updatePlayerEngine(dt, k) {
    if (!this.playerEngine || this.playerEngine.kart !== k) {
      this.playerEngine?.voice.stop(0.1);
      this.playerEngine = { kart: k, model: new EngineModel(), voice: new EngineVoice(this.ctx, this.engineBus, { level: 0.32 }) };
    }
    const E = this.playerEngine, top = k.stats.topSpeed, speed = Math.abs(k.speed);
    const thr = k.input.throttle;
    E.model.update(dt, { speed, top, throttle: thr, grounded: k.grounded, locked: k.locked, spin: k.spin.timer > 0, boosting: k.boost.timer > 0 || k.rocket > 0 });
    const ratio = clamp(speed / top, 0, 1.5);
    const drifting = k.drift.dir !== 0;
    const surf = SURFACE_PROPS[k.surface];
    const off = surf?.offroad && !k.respawn.active ? clamp(ratio * 1.3, 0, 1) : 0;
    const rocket = k.rocket > 0 ? 1 : 0;
    E.voice.apply({
      rpm: E.model.rpm, gear: E.model.gear, throttle: clamp(thr + rocket, 0, 1),
      boost: rocket ? 1 : clamp(k.boost.timer / 0.35, 0, 1) * (k.boost.timer > 0 ? 1 : 0),
      skid: Math.max(drifting ? 0.55 + 0.15 * k.drift.level : clamp(Math.abs(k.slide) / 7, 0, 0.7) * (k.grounded ? 1 : 0) + (k.spin.timer > 0 ? 0.7 : 0), (k.skid ?? 0) * 0.85),
      squeal: Math.max(drifting ? 0.5 + 0.2 * k.drift.level : k.spin.timer > 0 ? 0.6 : 0, (k.skid ?? 0) > 0.4 ? ((k.skid - 0.4) * 1.1) : 0),
      off, offKind: surf?.name, wind: clamp((ratio - 0.45) / 0.9 + (k.draft?.active ? 0.22 : 0), 0, 1), scrape: k.scraping && speed > 4 ? clamp(speed / 20, 0.2, 1) : 0,
      gain: k.respawn.active ? 0.15 : 1, pitchLift: rocket ? 1.18 : this._slowMo ? 0.74 : 1,
    });
  }

  _updateAIEngines(dt, s, focus) {
    this._aiT -= dt;
    const cam = s.camera.position;
    if (this._aiT <= 0) {
      this._aiT = 0.25;
      // choose the nearest karts (other than the one we listen from)
      const cand = [];
      for (const k of s.karts) {
        if (k === focus) continue;
        const dx = k.position.x - cam.x, dz = k.position.z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 < 85 * 85) cand.push([d2, k]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const keep = new Set(cand.slice(0, MAX_AI_ENGINES).map((c) => c[1]));
      for (const [k, e] of this.engines) if (!keep.has(k)) { e.voice.stop(0.15); this.engines.delete(k); }
      for (const k of keep) if (!this.engines.has(k)) {
        const tune = 0.9 + ((k.id * 37) % 17) / 100 + (3 - (k.stats.display?.weight ?? 3)) * 0.02;
        this.engines.set(k, { model: new EngineModel(), voice: new EngineVoice(this.ctx, this.engineBus, { lite: true, tune, level: 0.2 }) });
      }
    }
    const vf = focus.velocity, r = this._tmp.right;
    for (const [k, e] of this.engines) {
      const rx = k.position.x - cam.x, ry = k.position.y - cam.y, rz = k.position.z - cam.z;
      const d = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      const closing = ((k.velocity.x - vf.x) * rx + (k.velocity.y - vf.y) * ry + (k.velocity.z - vf.z) * rz) / d;     // + = moving apart
      const top = k.stats.topSpeed;
      e.model.update(dt, { speed: Math.abs(k.speed), top, throttle: k.input.throttle, grounded: k.grounded, locked: k.locked, spin: k.spin.timer > 0, boosting: k.boost.timer > 0 || k.rocket > 0 });
      e.voice.apply({
        rpm: e.model.rpm, gear: e.model.gear, throttle: k.input.throttle, boost: k.boost.timer > 0 ? 1 : 0,
        gain: clamp(1 / (1 + (d / 12) * (d / 12)), 0, 1) * (k.respawn.active ? 0.2 : 1),
        pan: clamp(((rx * r.x + ry * r.y + rz * r.z) / Math.max(d, 4)) * 1.3, -0.95, 0.95),
        lp: clamp(14000 / (1 + d / 14), 600, 14000), doppler: clamp(1 / (1 + closing / 160), 0.8, 1.25),
      }, 0.05);
    }
  }

  _updateLoops(dt, s, focus) {
    // wrong-way alarm
    if (this._wrongWay) { this._wrongT -= dt; if (this._wrongT <= 0) { this.sfx('wrongWay'); this._wrongT = 0.6; } }
    // incoming-missile / comet warnings: faster beeps as it closes in
    if (this._lock && focus.ext.items?.incoming) {
      const inc = focus.ext.items.incoming;
      this._lockT -= dt;
      if (this._lockT <= 0) {
        if (this._lock.type === 'comet') { this.sfx('cometWarn'); this._lockT = 0.6; }
        else { this.sfx('lockBeep', { pitch: 1 + clamp(1 - inc.dist / 60, 0, 1) * 0.35 }); this._lockT = clamp(0.1 + inc.dist / 90, 0.1, 0.7); }
      }
    }
    // bomb fuse ticks (accelerating) for bombs we can hear
    const items = s.items;
    if (items) {
      const now = this.ctx.currentTime;
      for (const e of items.entities) {
        if (e.type !== 'bomb' || !this._near(e.position, 45)) continue;
        let nt = this._bombT.get(e.id) ?? 0;
        if (now >= nt) {
          this.sfx('bombTick', { position: e.position, pitch: 1 + (1 - e.fuse / 4.4) * 0.5 });
          nt = now + 0.07 + Math.max(0, e.fuse) * 0.11;
          this._bombT.set(e.id, nt);
        }
      }
      if (this._bombT.size > 24) for (const id of this._bombT.keys()) if (!items.entities.some((x) => x.id === id)) this._bombT.delete(id);
    }
    // prism shield hum
    const shield = (focus.ext.items?.shieldT ?? 0) > 0;
    if (shield && !this.shieldHum) this.shieldHum = this._makeHum();
    else if (!shield && this.shieldHum) { this.shieldHum.stop(); this.shieldHum = null; }
    if (this.shieldHum) this.shieldHum.set(clamp((focus.ext.items?.shieldT ?? 0) / 1.5, 0, 1));
  }

  _makeHum() {
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.gain.value = 0.0001; g.connect(this.sfxBus);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
    o1.type = 'sine'; o2.type = 'triangle'; o1.frequency.value = 330; o2.frequency.value = 495.7; lfo.frequency.value = 6.5; lg.gain.value = 0.02;
    o1.connect(g); o2.connect(g); lfo.connect(lg); lg.connect(g.gain);
    o1.start(t); o2.start(t); lfo.start(t);
    g.gain.setTargetAtTime(0.045, t, 0.2);
    let dead = false;
    return {
      set: (u) => { if (!dead) g.gain.setTargetAtTime(0.03 + 0.03 * u, c.currentTime, 0.1); },
      stop: () => { if (dead) return; dead = true; const n = c.currentTime; g.gain.setTargetAtTime(0, n, 0.08); for (const o of [o1, o2, lfo]) { try { o.stop(n + 0.5); } catch { /* done */ } } setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 800); },
    };
  }

  // ================================================================================================================ tests
  /** Live counters for tests and the docs. */
  stats() {
    return {
      voices: this.active + this.engines.size + (this.playerEngine ? 1 : 0) + (this.shieldHum ? 1 : 0),
      oneShots: this.active, engines: this.engines.size + (this.playerEngine ? 1 : 0),
      music: this.music?.key ?? null, bpm: this.music ? Math.round(this.music.bpm * 10) / 10 : 0, bar: this.music?.bar ?? 0, intensity: this.music?.intensity ?? 0,
      ctx: this.ctx?.state ?? 'none', unlocked: this.unlocked, paused: this.paused,
      requested: { ...this.counters.requested }, played: { ...this.counters.played },
    };
  }
}
