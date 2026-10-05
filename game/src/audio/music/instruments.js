// Synth voices + drum kit for the soundtrack.  Every function schedules one note into `out` at time t and works with any
// BaseAudioContext (so the soundtrack renders offline for verification).
//   INSTRUMENTS[name](ctx, out, t, hz, dur, vel, o)     o = { glideFrom }
//   drum(ctx, out, t, kind, vel, kit)                   kinds: k s c h o t1 t2 t3 sh cb ch cl rim cr tk hb
import { tone, noise, fm, distortionCurve } from '../synth.js';

const detunes = [-9, 0, 9];

export const INSTRUMENTS = {
  /** bright plucky lead (meadow): triangle + square, fast filter pluck */
  pluck(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur + 0.06, 0.45);
    tone(ctx, out, t, { type: 'triangle', f: hz, dur: d, vol: 0.34 * v, lp: hz * 7, lp1: hz * 2, q: 1.5, release: 0.08 });
    tone(ctx, out, t, { type: 'square', f: hz, detune: 4, dur: d * 0.7, vol: 0.1 * v, lp: hz * 5, lp1: hz * 1.5, release: 0.05 });
  },
  marimba(ctx, out, t, hz, dur, v) {
    fm(ctx, out, t, { f: hz, ratio: 4, index: 0.9, index1: 0.04, dur: Math.min(dur + 0.12, 0.55), vol: 0.34 * v, release: 0.1 });
    tone(ctx, out, t, { type: 'sine', f: hz, dur: 0.25, vol: 0.12 * v, release: 0.1 });
  },
  steel(ctx, out, t, hz, dur, v) {
    fm(ctx, out, t, { f: hz, ratio: 1.5, index: 1.7, index1: 0.08, dur: Math.min(dur + 0.2, 0.6), vol: 0.3 * v, release: 0.15 });
    tone(ctx, out, t, { type: 'triangle', f: hz * 2, dur: 0.12, vol: 0.05 * v });
  },
  bell(ctx, out, t, hz, dur, v) {
    fm(ctx, out, t, { f: hz, ratio: 3.5, index: 1.2, index1: 0.04, dur: 0.75, vol: 0.2 * v, release: 0.25 });
    tone(ctx, out, t, { type: 'sine', f: hz * 2, dur: 0.3, vol: 0.04 * v });
  },
  glass(ctx, out, t, hz, dur, v) {
    fm(ctx, out, t, { f: hz, ratio: 5.07, index: 0.8, index1: 0.03, dur: 0.5, vol: 0.17 * v, release: 0.2 });
    tone(ctx, out, t, { type: 'triangle', f: hz * 2, dur: 0.18, vol: 0.06 * v, lp: 6000 });
  },
  epiano(ctx, out, t, hz, dur, v) {
    fm(ctx, out, t, { f: hz, ratio: 1, index: 1.1, index1: 0.12, dur: Math.min(dur + 0.2, 1.1), vol: 0.24 * v, release: 0.2 });
    fm(ctx, out, t, { f: hz, ratio: 14, index: 0.25, index1: 0.01, dur: 0.12, vol: 0.05 * v });
  },
  pad(ctx, out, t, hz, dur, v) {
    for (const d of detunes) tone(ctx, out, t, { type: 'sawtooth', f: hz, detune: d, dur: dur + 0.2, vol: 0.075 * v, lp: 1200, lp1: 1500, q: 0.6, attack: 0.35, release: 0.5 });
  },
  strings(ctx, out, t, hz, dur, v) {
    for (const d of detunes) tone(ctx, out, t, { type: 'sawtooth', f: hz, detune: d, dur: dur + 0.15, vol: 0.07 * v, lp: 2600, q: 0.5, attack: 0.18, release: 0.4, vib: { rate: 5.2, depth: 9 } });
  },
  fatBass(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur, 0.5);
    tone(ctx, out, t, { type: 'sawtooth', f: hz, dur: d, vol: 0.34 * v, lp: 1200, lp1: 340, q: 2, release: 0.06 });
    tone(ctx, out, t, { type: 'square', f: hz * 0.5, dur: d, vol: 0.2 * v, lp: 400, release: 0.06 });
  },
  pickBass(ctx, out, t, hz, dur, v) {
    tone(ctx, out, t, { type: 'triangle', f: hz, dur: Math.min(dur, 0.32), vol: 0.45 * v, lp: 900, lp1: 320, release: 0.06 });
    tone(ctx, out, t, { type: 'sawtooth', f: hz, dur: 0.12, vol: 0.12 * v, lp: 700, release: 0.04 });
  },
  dubBass(ctx, out, t, hz, dur, v) {
    tone(ctx, out, t, { type: 'sine', f: hz, dur: Math.min(dur + 0.05, 0.9), vol: 0.5 * v, attack: 0.01, release: 0.12 });
    tone(ctx, out, t, { type: 'triangle', f: hz * 2, dur: 0.2, vol: 0.08 * v, lp: 600 });
  },
  synthBass(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur, 0.45);
    for (const dt of [-6, 6]) tone(ctx, out, t, { type: 'sawtooth', f: hz, detune: dt, dur: d, vol: 0.2 * v, lp: 1500, lp1: 280, q: 4, release: 0.05 });
    tone(ctx, out, t, { type: 'sine', f: hz, dur: d, vol: 0.2 * v, release: 0.05 });
  },
  /** distorted palm-muted guitar-ish bass (volcano) */
  driveBass(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur, 0.3);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = o2.type = 'sawtooth'; o.frequency.value = hz; o2.frequency.value = hz * 1.5; o2.detune.value = 4;   // power chord: root + fifth
    sh.curve = distortionCurve(55); sh.oversample = '2x';
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + d); lp.Q.value = 1.4;
    const mix = ctx.createGain(); mix.gain.value = 0.5; o.connect(mix); o2.connect(mix);
    mix.connect(sh); sh.connect(lp); lp.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
    g.connect(out);
    o.start(t); o2.start(t); o.stop(t + d + 0.08); o2.stop(t + d + 0.08);
    tone(ctx, out, t, { type: 'sine', f: hz, dur: d, vol: 0.28 * v, release: 0.05 });
  },
  sawLead(ctx, out, t, hz, dur, v, o = {}) {
    for (const d of [-9, 9]) tone(ctx, out, t, { type: 'sawtooth', f: o.glideFrom ?? hz, f1: o.glideFrom ? hz : undefined, fDur: 0.07, detune: d, dur: dur + 0.05, vol: 0.12 * v, lp: 3800, lp1: 2400, q: 1.1, attack: 0.012, release: 0.1, vib: { rate: 5.6, depth: 14 } });
  },
  theremin(ctx, out, t, hz, dur, v, o = {}) {
    const f0 = o.glideFrom ?? hz;
    tone(ctx, out, t, { type: 'sine', f: f0, f1: o.glideFrom ? hz : undefined, fDur: 0.12, fCurve: 'lin', dur: dur + 0.1, vol: 0.3 * v, attack: 0.09, release: 0.28, vib: { rate: 5.5, depth: 22 } });
    tone(ctx, out, t, { type: 'sine', f: f0 * 2, f1: o.glideFrom ? hz * 2 : undefined, fDur: 0.12, fCurve: 'lin', dur: dur + 0.1, vol: 0.05 * v, attack: 0.1, release: 0.28, vib: { rate: 5.5, depth: 22 } });
  },
  twang(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur + 0.1, 0.55);
    tone(ctx, out, t, { type: 'sawtooth', f: hz * 0.985, f1: hz, fDur: 0.03, dur: d, vol: 0.26 * v, lp: hz * 6, lp1: hz * 1.6, q: 3.5, release: 0.08 });
    tone(ctx, out, t, { type: 'square', f: hz, dur: d * 0.5, vol: 0.06 * v, lp: hz * 4, release: 0.05 });
    noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 3500, q: 1, dur: 0.02, vol: 0.06 * v });
  },
  organ(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur, 0.14);
    tone(ctx, out, t, { type: 'square', f: hz, dur: d, vol: 0.12 * v, lp: 2600, release: 0.03 });
    tone(ctx, out, t, { type: 'sine', f: hz * 2, dur: d, vol: 0.08 * v, release: 0.03 });
    tone(ctx, out, t, { type: 'sine', f: hz * 3, dur: d, vol: 0.04 * v, release: 0.03 });
  },
  brass(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur + 0.05, 0.45);
    for (const dt of [-8, 0, 8]) tone(ctx, out, t, { type: 'sawtooth', f: hz, detune: dt, dur: d, vol: 0.1 * v, lp: 3000, lp1: 1000, q: 1.2, attack: 0.012, release: 0.08 });
  },
  harpsichord(ctx, out, t, hz, dur, v) {
    tone(ctx, out, t, { type: 'sawtooth', f: hz, dur: 0.2, vol: 0.2 * v, hp: 300, lp: hz * 8, lp1: hz * 2.5, release: 0.06 });
    tone(ctx, out, t, { type: 'square', f: hz * 2, dur: 0.1, vol: 0.06 * v, lp: 5000 });
    noise(ctx, out, t, { color: 'white', ftype: 'highpass', f: 5000, dur: 0.012, vol: 0.05 * v });
  },
  chime(ctx, out, t, hz, dur, v) { fm(ctx, out, t, { f: hz, ratio: 3.01, index: 0.8, index1: 0.03, dur: 0.5, vol: 0.14 * v, release: 0.2 }); },
  blip(ctx, out, t, hz, dur, v) { tone(ctx, out, t, { type: 'square', f: hz, dur: Math.min(dur, 0.12), vol: 0.11 * v, lp: 3500, lp1: 1800, release: 0.03 }); },
  gatedArp(ctx, out, t, hz, dur, v) {
    const d = Math.min(dur * 0.8, 0.14);
    tone(ctx, out, t, { type: 'sawtooth', f: hz, dur: d, vol: 0.13 * v, lp: 3600, lp1: 1400, q: 2, release: 0.03 });
    tone(ctx, out, t, { type: 'square', f: hz, detune: 7, dur: d, vol: 0.06 * v, lp: 3000, release: 0.03 });
  },
};

const KIT = {
  pop:    { kf: 150, kf1: 46, kd: 0.24, sf: 1900, hh: 7500 },
  electro: { kf: 170, kf1: 44, kd: 0.28, sf: 2300, hh: 8200 },
  heavy:  { kf: 125, kf1: 38, kd: 0.32, sf: 1500, hh: 6500 },
  dub:    { kf: 110, kf1: 42, kd: 0.34, sf: 1700, hh: 7000 },
  soft:   { kf: 130, kf1: 48, kd: 0.2, sf: 1700, hh: 8000 },
};

/** One drum hit. kind: k s c h o t1 t2 t3 sh cb ch cl rim cr tk hb */
export function drum(ctx, out, t, kind, v, kit = 'pop') {
  const K = KIT[kit] ?? KIT.pop;
  switch (kind) {
    case 'k':
      tone(ctx, out, t, { type: 'sine', f: K.kf, f1: K.kf1, fDur: 0.09, dur: K.kd, vol: 0.9 * v, attack: 0.002, release: 0.08 });
      tone(ctx, out, t, { type: 'sine', f: 62, f1: 44, dur: K.kd + 0.06, vol: 0.4 * v, attack: 0.004, release: 0.1 });
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 3200, q: 1, dur: 0.012, vol: 0.2 * v, release: 0.01 });
      break;
    case 's':
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: K.sf, q: 0.9, dur: kit === 'electro' ? 0.24 : 0.17, vol: 0.42 * v, release: 0.1 });
      tone(ctx, out, t, { type: 'triangle', f: 200, f1: 160, dur: 0.1, vol: 0.25 * v, release: 0.05 });
      noise(ctx, out, t, { color: 'white', ftype: 'highpass', f: 5500, dur: 0.06, vol: 0.12 * v, release: 0.03 });
      break;
    case 'c':
      for (let i = 0; i < 3; i++) noise(ctx, out, t + i * 0.011, { color: 'white', ftype: 'bandpass', f: 1450, q: 1.2, dur: 0.02, vol: 0.28 * v, release: 0.01 });
      noise(ctx, out, t + 0.033, { color: 'white', ftype: 'bandpass', f: 1500, q: 1, dur: 0.14, vol: 0.3 * v, release: 0.1 });
      break;
    case 'h': noise(ctx, out, t, { color: 'white', ftype: 'highpass', f: K.hh, dur: 0.035, vol: 0.17 * v, release: 0.02 }); break;
    case 'o':
      noise(ctx, out, t, { color: 'white', ftype: 'highpass', f: K.hh - 800, dur: 0.24, vol: 0.13 * v, release: 0.12 });
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 9500, q: 0.8, dur: 0.18, vol: 0.05 * v, release: 0.1 });
      break;
    case 't1': case 't2': case 't3': {
      const hz = { t1: 195, t2: 145, t3: 105 }[kind] * (kit === 'heavy' ? 0.8 : 1);
      tone(ctx, out, t, { type: 'sine', f: hz * 1.4, f1: hz * 0.6, dur: 0.3, vol: 0.55 * v, release: 0.1 });
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 1200, q: 1, dur: 0.02, vol: 0.12 * v });
      break;
    }
    case 'sh': noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 6000, q: 1, dur: 0.06, vol: 0.11 * v, attack: 0.012, release: 0.03 }); break;
    case 'cb':
      tone(ctx, out, t, { type: 'square', f: 587, dur: 0.2, vol: 0.09 * v, lp: 1800, release: 0.1 });
      tone(ctx, out, t, { type: 'square', f: 845, dur: 0.2, vol: 0.09 * v, lp: 1800, release: 0.1 });
      break;
    case 'ch':
      tone(ctx, out, t, { type: 'sine', f: 400, f1: 300, dur: 0.14, vol: 0.38 * v, release: 0.06 });
      noise(ctx, out, t, { color: 'white', ftype: 'highpass', f: 3000, dur: 0.015, vol: 0.1 * v });
      break;
    case 'cl':
      tone(ctx, out, t, { type: 'sine', f: 260, f1: 190, dur: 0.18, vol: 0.45 * v, release: 0.08 });
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 1800, q: 1, dur: 0.015, vol: 0.1 * v });
      break;
    case 'rim':
      tone(ctx, out, t, { type: 'triangle', f: 1700, dur: 0.035, vol: 0.22 * v, release: 0.02 });
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 4200, q: 2, dur: 0.02, vol: 0.14 * v });
      break;
    case 'cr':
      noise(ctx, out, t, { color: 'white', ftype: 'highpass', f: 5000, dur: 1.3, vol: 0.2 * v, attack: 0.004, release: 0.6 });
      noise(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 8500, q: 0.5, dur: 0.9, vol: 0.1 * v, release: 0.4 });
      break;
    case 'tk':
      tone(ctx, out, t, { type: 'sine', f: 100, f1: 50, dur: 0.5, vol: 0.8 * v, release: 0.18 });
      tone(ctx, out, t, { type: 'triangle', f: 190, f1: 95, dur: 0.22, vol: 0.28 * v, release: 0.1 });
      noise(ctx, out, t, { color: 'brown', ftype: 'lowpass', f: 700, dur: 0.1, vol: 0.3 * v });
      break;
    case 'hb':
      tone(ctx, out, t, { type: 'sine', f: 72, f1: 42, dur: 0.18, vol: 0.62 * v, release: 0.08 });
      tone(ctx, out, t + 0.17, { type: 'sine', f: 62, f1: 38, dur: 0.16, vol: 0.4 * v, release: 0.08 });
      break;
    default: break;
  }
}
