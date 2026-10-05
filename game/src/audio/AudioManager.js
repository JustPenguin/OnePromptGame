// Procedural audio (WebAudio, no files). OWNER: Agent D (audio).
// Contract (keep stable) - other modules only use these:
//   audio.unlock()                  call from a user gesture (click/key); creates/resumes the AudioContext
//   audio.ui(name)                  'click' | 'hover' | 'confirm' | 'back' | 'error' | 'select' | 'tick'
//   audio.sfx(name, opts?)          one-shot effects by name (see D's task doc), opts {volume, pitch, position}
//   audio.attachSession(session)    called when a race session is created: subscribe to session.events, start the
//                                   engine voices + music;   audio.detachSession()  on dispose
//   audio.update(dt, session)       per frame while racing (engine pitch, drift loop, doppler-ish panning)
//   audio.playMusic(key) / stopMusic()   key = track.def.music ('meadow' ...) or 'menu' | 'results'
//   audio.applySettings()           re-read volumes from settings (master/music/sfx)
// Browsers only allow audio after a gesture: everything must be a silent no-op until unlock() ran.
import { EV } from '../core/events.js';

export class AudioManager {
  constructor(settingsProvider = () => ({})) {
    this.settings = settingsProvider;
    this.ctx = null;
    this.master = null;
    this.session = null;
    this.unlocked = false;
    this._offs = [];
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applySettings();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.unlocked = true;
    } catch (e) { console.warn('[audio] unavailable', e); }
  }

  applySettings() {
    if (!this.master) return;
    const s = this.settings();
    this.master.gain.value = (s.masterVolume ?? 0.8);
  }

  _beep(freq, dur = 0.12, type = 'square', vol = 0.12, when = 0) {
    if (!this.ctx || !this.unlocked) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  ui(name) {
    const f = { click: 660, hover: 520, confirm: 880, back: 380, error: 180, select: 740, tick: 600 }[name] ?? 600;
    this._beep(f, 0.08, 'triangle', 0.1);
  }

  sfx(name, opts = {}) {
    if (name === 'countdown') this._beep(440, 0.18, 'square', 0.12);
    else if (name === 'go') this._beep(880, 0.4, 'square', 0.14);
    else if (name === 'boost') this._beep(300, 0.3, 'sawtooth', 0.08);
  }

  attachSession(session) {
    this.detachSession();
    this.session = session;
    this._offs.push(session.on(EV.COUNTDOWN, ({ count }) => this.sfx(count === 0 ? 'go' : 'countdown')));
    this._offs.push(session.on(EV.BOOST, ({ kart }) => { if (kart.isPlayer) this.sfx('boost'); }));
  }
  detachSession() { this._offs.forEach((o) => o()); this._offs = []; this.session = null; }
  update(dt, session) {}
  playMusic(key) {}
  stopMusic() {}
  setMusicIntensity(x) {}
  setPaused(paused) {}
  stats() { return { voices: 0 }; }
}
