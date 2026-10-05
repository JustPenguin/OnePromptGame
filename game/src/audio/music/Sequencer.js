// Music engine: compiles the songs in songs.js into per-step events and schedules them against any AudioContext.
//   SongPlayer   one running song: per-layer gain nodes (intensity), echo bus, scheduleStep(step, time, state)
//   MusicPlayer  real-time wrapper: look-ahead scheduler, crossfades between songs, tempo / key lift, intensity layers
//   renderSong   offline render (OfflineAudioContext) used to verify loops, levels and layering without a speaker
import { SONGS } from './songs.js';
import { parseSteps, toEvents, parseChord, chordTone } from './notation.js';
import { INSTRUMENTS, drum } from './instruments.js';
import { midiToHz, makeImpulse } from '../synth.js';

const compiled = new Map();
const DEFAULT_PAN = { pad: 0, bass: 0, melody: 0, arp: 0.22, stab: -0.2, drums: 0 };
// The instrument voices are scaled for synth hygiene, not for the mix: these per-kind factors bring drums down and the
// melodic layers up so a track's own `vol` is a *relative* mix control (1.0 = balanced against the others).
const KIND_GAIN = { drums: 0.62, bass: 1.9, melody: 2.3, arp: 2.4, pad: 2.2, stab: 1.7 };

/** Parse a song once: per track a [bar][step] -> event lookup. */
export function compile(key) {
  if (compiled.has(key)) return compiled.get(key);
  const def = SONGS[key];
  if (!def) return null;
  const nBars = def.chords.length;
  const tracks = def.tracks.map((tr) => {
    const out = { ...tr, pan: tr.pan ?? DEFAULT_PAN[tr.kind] ?? 0 };
    if (tr.kind === 'drums') return out;
    if (tr.kind === 'pad') { out.byStep = null; return out; }
    out.byStep = Array.from({ length: nBars }, (_, b) => {
      const src = tr.bars[b % tr.bars.length];
      const evs = toEvents(parseSteps(src, tr.kind === 'melody' ? 'melody' : tr.kind === 'stab' ? 'stab' : 'num'));
      const row = new Array(16).fill(null);
      for (const e of evs) row[e.step] = e;
      return row;
    });
    return out;
  });
  const c = { key, name: def.name, bpm: def.bpm, swing: def.swing ?? 0, kit: def.kit ?? 'pop', echo: def.echo ?? null, gain: def.gain ?? 1, nBars, chords: def.chords.map(parseChord), tracks };
  compiled.set(key, c);
  return c;
}

export class SongPlayer {
  /** @param {BaseAudioContext} ctx @param {AudioNode} dest @param {string} key @param {{intensity?:number}} o */
  constructor(ctx, dest, key, o = {}) {
    this.ctx = ctx;
    this.song = compile(key);
    if (!this.song) throw new Error(`unknown song ${key}`);
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.intensity = o.intensity ?? 1;
    this.nodes = [];
    const stepDur = 60 / (this.song.bpm * (o.bpmScale ?? 1)) / 4;
    // optional echo bus (dotted-eighth delay with filtered feedback) shared by the layers that ask for it
    this.echoIn = null;
    if (this.song.echo) {
      const e = this.song.echo;
      const d = ctx.createDelay(2); d.delayTime.value = Math.min(1.9, stepDur * e.steps);
      const fb = ctx.createGain(); fb.gain.value = e.fb;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = e.lp;
      const wet = ctx.createGain(); wet.gain.value = e.mix;
      this.echoIn = ctx.createGain();
      this.echoIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(this.out);
      this.nodes.push(this.echoIn, d, fb, lp, wet);
    }
    // one gain (+pan) per layer so intensity can bring layers in and out smoothly
    this.layers = this.song.tracks.map((tr) => {
      const g = ctx.createGain(); g.gain.value = (tr.min ?? 0) <= this.intensity && (!o.solo || tr.id === o.solo) ? this.layerVol(tr) : 0;
      const p = ctx.createStereoPanner(); p.pan.value = tr.pan;
      g.connect(p); p.connect(this.out);
      let send = null;
      if (this.echoIn && tr.echo) { send = ctx.createGain(); send.gain.value = tr.echo; p.connect(send); send.connect(this.echoIn); }
      this.nodes.push(g, p, send);
      return { tr, gain: g, last: { hz: 0, end: -1 } };
    });
  }

  layerVol(tr) { return (tr.vol ?? 1) * (KIND_GAIN[tr.kind] ?? 1) * (this.song.gain ?? 1); }

  setIntensity(x, tc = 0.2) {
    this.intensity = x;
    const now = this.ctx.currentTime;
    for (const l of this.layers) l.gain.gain.setTargetAtTime((l.tr.min ?? 0) <= x ? this.layerVol(l.tr) : 0, now, tc);
  }

  /** Schedule everything that happens on global 16th-note `step` at `time`. state = { stepDur, keyShift } */
  scheduleStep(step, time, state) {
    const song = this.song, ctx = this.ctx;
    const bar = Math.floor(step / 16) % song.nBars, s16 = step % 16;
    const chord = song.chords[bar];
    const t = time + (s16 % 2 ? song.swing * state.stepDur : 0);
    const shift = state.keyShift ?? 0;
    for (const L of this.layers) {
      const tr = L.tr, out = L.gain;
      if (tr.kind === 'drums') {
        const pat = tr.pats[tr.seq[bar % tr.seq.length]];
        for (const voice in pat) {
          const ch = pat[voice][s16];
          if (ch !== '.') drum(ctx, out, t, voice, ch === 'X' ? 1 : ch === 'o' ? 0.45 : 0.8, song.kit);
        }
        continue;
      }
      const inst = INSTRUMENTS[tr.inst];
      if (tr.kind === 'pad') {
        if (s16 !== 0) continue;
        const dur = 16 * state.stepDur;
        const n = Math.min(chord.tones.length, 4);
        for (let i = 0; i < n; i++) inst(ctx, out, t, midiToHz(chordTone(chord, i, tr.base) + shift), dur, 0.8, {});
        continue;
      }
      const ev = tr.byStep[bar][s16];
      if (!ev) continue;
      const dur = ev.len * state.stepDur;
      const vel = ev.accent ? 1 : 0.85;
      if (tr.kind === 'stab') {
        for (const i of tr.tones ?? [0, 1, 2]) inst(ctx, out, t, midiToHz(chordTone(chord, i, tr.base) + shift), dur, vel, {});
        continue;
      }
      let midi;
      if (tr.kind === 'melody') midi = ev.n;
      else if (tr.kind === 'bass') midi = tr.base + chord.root + ev.n;
      else midi = chordTone(chord, ev.n, tr.base);          // arp
      const hz = midiToHz(midi + shift);
      const o = {};
      if (tr.glide && L.last.end >= t - state.stepDur * 1.5 && L.last.hz && Math.abs(L.last.hz - hz) > 1) o.glideFrom = L.last.hz;
      inst(ctx, out, t, hz, dur, vel, o);
      L.last.hz = hz; L.last.end = t + dur;
    }
  }

  dispose(fade = 0.4) {
    const now = this.ctx.currentTime;
    try { this.out.gain.cancelScheduledValues(now); this.out.gain.setTargetAtTime(0, now, fade / 4); } catch { /* closed */ }
    setTimeout(() => { try { this.out.disconnect(); } catch { /* gone */ } }, (fade + 2.5) * 1000);
  }
}

/** Real-time music: look-ahead scheduler + crossfades.  Create once per AudioContext. */
export class MusicPlayer {
  constructor(ctx, dest) {
    this.ctx = ctx; this.dest = dest;
    this.cur = null;              // { key, player, step, nextTime, bpmScale, keyShift, ... }
    this.old = [];                // fading-out songs (keep scheduling until faded)
    this.intensity = 1;
    this.tempoTarget = 1; this.keyTarget = 0;
    this.timer = null;
  }

  get key() { return this.cur?.key ?? null; }
  get playing() { return !!this.cur; }
  get bpm() { return this.cur ? this.cur.player.song.bpm * this.cur.bpmScale : 0; }
  get bar() { return this.cur ? Math.floor(this.cur.step / 16) % this.cur.player.song.nBars : 0; }

  /** Start (or crossfade to) a song.  Same key already playing = no-op. */
  play(key, { fade = 0.7, intensity = this.intensity, final = false } = {}) {
    if (!SONGS[key]) key = 'meadow';
    if (this.cur?.key === key) { this.setIntensity(intensity); return; }
    if (this.cur) { this.cur.player.dispose(fade); this.cur.fadeEnd = this.ctx.currentTime + fade + 0.1; this.old.push(this.cur); }
    this.intensity = intensity;
    const player = new SongPlayer(this.ctx, this.dest, key, { intensity });
    player.out.gain.value = 0.0001;
    player.out.gain.setTargetAtTime(1, this.ctx.currentTime, Math.max(0.05, fade / 4));
    this.tempoTarget = final ? 1.07 : 1; this.keyTarget = final ? 2 : 0;
    this.cur = { key, player, step: 0, nextTime: this.ctx.currentTime + 0.1, bpmScale: this.tempoTarget, keyShift: this.keyTarget };
    this.ensureTimer();
    this.tick();
  }

  stop(fade = 0.8) {
    if (this.cur) { this.cur.player.dispose(fade); this.cur.fadeEnd = this.ctx.currentTime + fade + 0.1; this.old.push(this.cur); this.cur = null; }
  }

  setIntensity(x) { this.intensity = x; this.cur?.player.setIntensity(x); }
  /** Final-lap lift: faster tempo and a whole-tone key change, applied at the next bar line. */
  setFinal(on) { this.tempoTarget = on ? 1.07 : 1; this.keyTarget = on ? 2 : 0; }

  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), 45); }

  tick() {
    const ctx = this.ctx, now = ctx.currentTime, horizon = now + 0.4;
    const run = (s) => {
      let guard = 0;
      while (s.nextTime < horizon && guard++ < 64) {
        const stepDur = 60 / (s.player.song.bpm * s.bpmScale) / 4;
        if (s.nextTime < now - 0.05) { s.step++; s.nextTime += stepDur; continue; }       // we fell behind (tab throttled): skip, don't burst
        if (s.step % 16 === 0 && !s.fadeEnd) { const d = this.tempoTarget - s.bpmScale; s.bpmScale += Math.abs(d) < 0.045 ? d : Math.sign(d) * 0.045; s.keyShift = this.keyTarget; }
        s.player.scheduleStep(s.step, s.nextTime, { stepDur, keyShift: s.keyShift });
        s.step++; s.nextTime += stepDur;
      }
    };
    if (this.cur) run(this.cur);
    for (let i = this.old.length - 1; i >= 0; i--) { const o = this.old[i]; if (now > o.fadeEnd) this.old.splice(i, 1); else run(o); }
    if (!this.cur && !this.old.length && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; this.stop(0.1); }
}

/**
 * Offline render of `bars` bars of a song.  Resolves to an AudioBuffer.
 * opts: { bars=16, sampleRate=44100, intensity=1, tail=1.2, bpmScale=1, keyShift=0, reverb=true }
 */
export async function renderSong(key, opts = {}) {
  const sr = opts.sampleRate ?? 44100, nBars = opts.bars ?? 16;
  const song = compile(key);
  if (!song) throw new Error(`unknown song ${key}`);
  const bpmScale = opts.bpmScale ?? 1;
  const stepDur = 60 / (song.bpm * bpmScale) / 4;
  const len = Math.ceil((nBars * 16 * stepDur + (opts.tail ?? 1.2)) * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const sp = new SongPlayer(ctx, out, key, { intensity: opts.intensity ?? 1, bpmScale, solo: opts.solo });
  for (let step = 0; step < nBars * 16; step++) sp.scheduleStep(step, step * stepDur + 0.02, { stepDur, keyShift: opts.keyShift ?? 0 });
  return ctx.startRendering();
}
