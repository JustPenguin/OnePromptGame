// Procedural SFX catalogue.  Every entry is a pure function  (ctx, out, t, o) -> duration (s)  that schedules a small node
// graph into `out` starting at time t.  o = { volume (0..1.5), pitch (multiplier), level (0..1 intensity), index (counter) }.
// SFX_META carries per-sound mixing hints: wet (reverb send), cooldown (min seconds between plays), prio (voice stealing).
// All sounds are short and punchy; pitch is varied +-5 % by the AudioManager to avoid machine-gun repetition.
import { tone, noise, fm } from './synth.js';

const rnd = (a, b) => a + Math.random() * (b - a);   // cosmetic randomness only (never gameplay)
const T = tone, N = noise, F = fm;
const vol = (o) => o.volume ?? 1;
const P = (o) => o.pitch ?? 1;

/** quick plucked note (triangle + square) used by jingles */
function pluck(ctx, out, t, hz, v = 0.2, dur = 0.28, lp = 4200) {
  T(ctx, out, t, { type: 'triangle', f: hz, dur, vol: v, lp, lp1: lp * 0.4, release: 0.1 });
  T(ctx, out, t, { type: 'square', f: hz, dur: dur * 0.6, vol: v * 0.35, lp: lp * 0.6, release: 0.06 });
}
/** brassy sawtooth note */
function brass(ctx, out, t, hz, v = 0.18, dur = 0.4, lp = 2600) {
  for (const d of [-7, 0, 7]) T(ctx, out, t, { type: 'sawtooth', f: hz, detune: d, dur, vol: v / 3, attack: 0.02, release: 0.12, lp, lp1: lp * 0.6, q: 1.2 });
}
function boom(ctx, out, t, size, v) {
  v *= 0.58;   // the layers below stack up: keep the raw peak under ~0.8 so the master limiter only ever sees a clean signal
  N(ctx, out, t, { color: 'brown', ftype: 'lowpass', f: 1400, f1: 70, q: 0.7, dur: 0.9 * size, vol: 0.85 * v, release: 0.4 * size });
  T(ctx, out, t, { type: 'sine', f: 110, f1: 28, dur: 0.75 * size, vol: 0.7 * v, release: 0.3 * size });
  N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 1800, dur: 0.14, vol: 0.28 * v, release: 0.08 });
  N(ctx, out, t + 0.06, { color: 'pink', ftype: 'bandpass', f: 320, q: 0.8, dur: 1.1 * size, vol: 0.22 * v, release: 0.6 * size });
  return 1.5 * size;
}

export const SFX = {
  // ------------------------------------------------------------------ race flow
  countdown(ctx, out, t, o) { const f = 660 * P(o), v = vol(o); T(ctx, out, t, { type: 'sine', f, dur: 0.26, vol: 0.4 * v, release: 0.14 }); T(ctx, out, t, { type: 'triangle', f: f * 2, dur: 0.14, vol: 0.12 * v }); return 0.45; },
  go(ctx, out, t, o) {
    const v = vol(o);
    for (const f of [880, 1109, 1320, 1760]) T(ctx, out, t, { type: 'square', f, dur: 0.6, vol: 0.095 * v, lp: 5200, lp1: 1800, release: 0.25 });
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 600, f1: 5200, q: 1, dur: 0.5, vol: 0.2 * v, release: 0.25 });
    T(ctx, out, t, { type: 'sine', f: 1760, f1: 3520, dur: 0.18, vol: 0.12 * v });
    return 0.9;
  },
  lap(ctx, out, t, o) { const v = vol(o); [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => pluck(ctx, out, t + i * 0.085, hz, 0.2 * v, 0.3)); return 0.7; },
  finalLap(ctx, out, t, o) {
    const v = vol(o);
    [[392, 0], [523.25, 0.14], [659.25, 0.28], [783.99, 0.42]].forEach(([hz, dt]) => brass(ctx, out, t + dt, hz, 0.22 * v, 0.2));
    brass(ctx, out, t + 0.62, 1046.5, 0.26 * v, 0.7); brass(ctx, out, t + 0.62, 783.99, 0.18 * v, 0.7); brass(ctx, out, t + 0.62, 523.25, 0.18 * v, 0.7);
    N(ctx, out, t + 0.62, { color: 'white', ftype: 'highpass', f: 6500, dur: 0.9, vol: 0.12 * v, release: 0.5 });
    return 1.6;
  },
  finishWin(ctx, out, t, o) {
    const v = vol(o);
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]].forEach(([hz, dt]) => brass(ctx, out, t + dt, hz, 0.22 * v, 0.14));
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((hz) => brass(ctx, out, t + 0.52, hz, 0.2 * v, 1.3, 3000));
    N(ctx, out, t + 0.52, { color: 'white', ftype: 'highpass', f: 5000, dur: 1.6, vol: 0.2 * v, release: 1.0 });
    for (let i = 0; i < 6; i++) T(ctx, out, t + 0.6 + i * 0.1, { type: 'sine', f: rnd(2200, 4400), dur: 0.14, vol: 0.06 * v });
    return 2.4;
  },
  finishPodium(ctx, out, t, o) {
    const v = vol(o);
    [[392, 0], [523.25, 0.13], [659.25, 0.26]].forEach(([hz, dt]) => brass(ctx, out, t + dt, hz, 0.2 * v, 0.14));
    [392, 523.25, 659.25, 783.99].forEach((hz) => brass(ctx, out, t + 0.42, hz, 0.17 * v, 0.9, 2600));
    N(ctx, out, t + 0.42, { color: 'white', ftype: 'highpass', f: 6000, dur: 0.9, vol: 0.1 * v, release: 0.5 });
    return 1.5;
  },
  finishLose(ctx, out, t, o) {
    const v = vol(o);
    [[392, 0], [349.23, 0.22], [329.63, 0.44], [261.63, 0.66]].forEach(([hz, dt]) => T(ctx, out, t + dt, { type: 'sawtooth', f: hz, f1: hz * 0.94, dur: 0.3, vol: 0.14 * v, lp: 1400, lp1: 600, attack: 0.03, release: 0.12 }));
    return 1.2;
  },
  overtake(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 700, f1: 2600, q: 1.1, dur: 0.3, vol: 0.26 * v, release: 0.12 }); T(ctx, out, t + 0.03, { type: 'sine', f: 900 * P(o), f1: 1400 * P(o), dur: 0.12, vol: 0.12 * v }); return 0.45; },
  wrongWay(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'square', f: 880, dur: 0.13, vol: 0.12 * v, lp: 3200, release: 0.04 }); T(ctx, out, t + 0.16, { type: 'square', f: 660, dur: 0.13, vol: 0.12 * v, lp: 3200, release: 0.04 }); return 0.35; },

  // ------------------------------------------------------------------ driving
  hop(ctx, out, t, o) { const v = vol(o), p = P(o); T(ctx, out, t, { type: 'sine', f: 360 * p, f1: 760 * p, dur: 0.1, vol: 0.2 * v }); T(ctx, out, t, { type: 'triangle', f: 720 * p, f1: 1500 * p, dur: 0.07, vol: 0.06 * v }); return 0.14; },
  driftStart(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 2700, f1: 1700, q: 3, dur: 0.18, vol: 0.24 * v, release: 0.08 }); T(ctx, out, t, { type: 'sine', f: 520, f1: 300, dur: 0.12, vol: 0.08 * v }); return 0.25; },
  driftLevel(ctx, out, t, o) {
    const v = vol(o), lvl = lvlOf(o);
    const hz = [988, 1319, 1760][lvl - 1] * P(o);
    F(ctx, out, t, { f: hz, ratio: 3.01, index: 1.1, index1: 0.04, dur: 0.38, vol: 0.2 * v, release: 0.1 });
    T(ctx, out, t, { type: 'sine', f: hz * 2, dur: 0.12, vol: 0.05 * v });
    N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 7000, dur: 0.08, vol: 0.05 * v });
    return 0.5;
  },
  driftBoost(ctx, out, t, o) {
    const v = vol(o), lvl = lvlOf(o), k = 0.65 + 0.18 * lvl;
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 500, f1: 2800 + lvl * 500, q: 1.2, dur: 0.45, vol: 0.3 * k * v, release: 0.2 });
    T(ctx, out, t, { type: 'sawtooth', f: 160 * P(o), f1: 520 * P(o), dur: 0.4, vol: 0.12 * k * v, lp: 1400, release: 0.15 });
    T(ctx, out, t, { type: 'sine', f: 95, f1: 42, dur: 0.26, vol: 0.38 * k * v });
    F(ctx, out, t + 0.02, { f: 1200 + lvl * 300, ratio: 2, index: 0.5, index1: 0.05, dur: 0.3, vol: 0.07 * v });
    return 0.7;
  },
  boost(ctx, out, t, o) {
    const v = vol(o), p = P(o);
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 300, f1: 4200, q: 1, dur: 0.85, vol: 0.38 * v, attack: 0.02, release: 0.35 });
    T(ctx, out, t, { type: 'sawtooth', f: 120 * p, f1: 900 * p, dur: 0.65, vol: 0.14 * v, lp: 2500, release: 0.2 });
    T(ctx, out, t, { type: 'sine', f: 90, f1: 38, dur: 0.3, vol: 0.45 * v });
    T(ctx, out, t + 0.05, { type: 'sine', f: 1200 * p, f1: 1800 * p, dur: 0.5, vol: 0.05 * v });
    return 1.15;
  },
  padBoost(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sawtooth', f: 200, f1: 1400, dur: 0.38, vol: 0.12 * v, lp: 3000, release: 0.12 }); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 1000, f1: 5200, q: 1, dur: 0.4, vol: 0.2 * v, release: 0.18 }); T(ctx, out, t, { type: 'sine', f: 80, f1: 50, dur: 0.2, vol: 0.2 * v }); return 0.6; },
  startBoost(ctx, out, t, o) {
    const v = vol(o);
    SFX.boost(ctx, out, t, { volume: 1.1 * v, pitch: 1.1 });
    [1046.5, 1318.5, 1568, 2093].forEach((hz, i) => F(ctx, out, t + 0.05 + i * 0.05, { f: hz, ratio: 3.01, index: 0.9, index1: 0.04, dur: 0.4, vol: 0.12 * v }));
    return 1.2;
  },
  burnout(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 2400, q: 6, dur: 0.7, vol: 0.34 * v, release: 0.3 }); T(ctx, out, t, { type: 'sawtooth', f: 520, f1: 700, dur: 0.6, vol: 0.06 * v, lp: 1500 }); return 1.0; },
  wallHit(ctx, out, t, o) {
    const v = vol(o), s = clamp01((o.level ?? 0.6));
    T(ctx, out, t, { type: 'sine', f: 140, f1: 45, dur: 0.2, vol: 0.55 * s * v });
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 1100, q: 1.4, dur: 0.14, vol: 0.32 * s * v, release: 0.06 });
    T(ctx, out, t, { type: 'square', f: 230 * P(o), f1: 170, dur: 0.1, vol: 0.1 * s * v, lp: 900 });
    return 0.35;
  },
  wallScrape(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'pink', ftype: 'bandpass', f: 1800, q: 4, dur: 0.22, vol: 0.12 * v, release: 0.1 }); T(ctx, out, t, { type: 'sawtooth', f: rnd(900, 1300), dur: 0.15, vol: 0.03 * v, lp: 2500 }); return 0.3; },
  bump(ctx, out, t, o) {
    const v = vol(o), s = clamp01(o.level ?? 0.6);
    T(ctx, out, t, { type: 'sine', f: 115, f1: 58, dur: 0.14, vol: 0.45 * s * v });
    N(ctx, out, t, { color: 'brown', ftype: 'lowpass', f: 800, dur: 0.1, vol: 0.28 * s * v });
    F(ctx, out, t, { f: 320 * P(o), ratio: 2.4, index: 1.4, index1: 0.1, dur: 0.12, vol: 0.12 * s * v });
    return 0.25;
  },
  spin(ctx, out, t, o) {
    const v = vol(o);
    T(ctx, out, t, { type: 'triangle', f: 900, f1: 260, dur: 0.95, vol: 0.22 * v, lp: 3200, vib: { rate: 9, depth: 120 }, release: 0.2 });
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 2300, q: 5, dur: 0.75, vol: 0.08 * v, release: 0.25 });
    return 1.2;
  },
  launch(ctx, out, t, o) {
    const v = vol(o);
    boom(ctx, out, t, 0.7, 0.8 * v);
    T(ctx, out, t, { type: 'sawtooth', f: 200, f1: 900, dur: 0.38, vol: 0.12 * v, lp: 2200, release: 0.15 });
    return 1.1;
  },
  recover(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 480 * P(o), f1: 900 * P(o), dur: 0.12, vol: 0.16 * v }); return 0.18; },
  jump(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 400, f1: 1600, q: 1, dur: 0.26, vol: 0.12 * v }); T(ctx, out, t, { type: 'sine', f: 300, f1: 560, dur: 0.14, vol: 0.1 * v }); return 0.35; },
  land(ctx, out, t, o) {
    const v = vol(o), s = clamp01(o.level ?? 0.5);
    T(ctx, out, t, { type: 'sine', f: 105, f1: 50, dur: 0.16, vol: 0.42 * s * v });
    N(ctx, out, t, { color: 'brown', ftype: 'lowpass', f: 700, dur: 0.14, vol: 0.28 * s * v });
    return 0.3;
  },
  respawn(ctx, out, t, o) {
    const v = vol(o);
    T(ctx, out, t, { type: 'sawtooth', f: 62, dur: 1.65, vol: 0.12 * v, lp: 700, vib: { rate: 22, depth: 70 }, attack: 0.15, release: 0.25 });
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 1500, q: 2, dur: 1.65, vol: 0.05 * v, attack: 0.2, release: 0.3 });
    T(ctx, out, t, { type: 'sine', f: 500, f1: 1100, dur: 1.5, vol: 0.04 * v, fCurve: 'lin' });
    return 1.95;
  },
  respawnDone(ctx, out, t, o) { const v = vol(o); F(ctx, out, t, { f: 1175, ratio: 3.01, index: 0.9, index1: 0.05, dur: 0.4, vol: 0.18 * v }); F(ctx, out, t + 0.1, { f: 1760, ratio: 3.01, index: 0.9, index1: 0.05, dur: 0.4, vol: 0.14 * v }); return 0.6; },
  coin(ctx, out, t, o) {
    const v = vol(o), p = P(o);
    T(ctx, out, t, { type: 'square', f: 1568 * p, dur: 0.07, vol: 0.13 * v, lp: 6000, release: 0.02 });
    T(ctx, out, t + 0.065, { type: 'square', f: 2093 * p, dur: 0.24, vol: 0.13 * v, lp: 6000, lp1: 2500, release: 0.1 });
    T(ctx, out, t + 0.065, { type: 'sine', f: 4186 * p, dur: 0.12, vol: 0.04 * v });
    return 0.4;
  },
  coinLost(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'square', f: 1568, f1: 700, dur: 0.18, vol: 0.09 * v, lp: 3000 }); return 0.25; },

  // ------------------------------------------------------------------ item boxes + roulette
  itemBox(ctx, out, t, o) {
    const v = vol(o);
    N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 3200, dur: 0.28, vol: 0.22 * v, release: 0.14 });
    for (let i = 0; i < 6; i++) T(ctx, out, t + rnd(0, 0.06), { type: 'sine', f: rnd(1800, 4400), dur: rnd(0.1, 0.2), vol: 0.07 * v });
    T(ctx, out, t, { type: 'sine', f: 700, f1: 200, dur: 0.16, vol: 0.2 * v });
    return 0.4;
  },
  rouletteTick(ctx, out, t, o) { const v = vol(o), i = o.index ?? 0; T(ctx, out, t, { type: 'triangle', f: 520 * Math.pow(2, i * 0.045) * P(o), dur: 0.055, vol: 0.14 * v, lp: 4000 }); N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 5000, dur: 0.012, vol: 0.05 * v }); return 0.1; },
  itemGot(ctx, out, t, o) { const v = vol(o); [1318.5, 1568, 1975.5, 2637].forEach((hz, i) => pluck(ctx, out, t + i * 0.06, hz * P(o), 0.15 * v, 0.2, 6000)); N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 7500, dur: 0.18, vol: 0.05 * v }); return 0.5; },
  itemGotRare(ctx, out, t, o) {
    const v = vol(o);
    SFX.itemGot(ctx, out, t, o);
    [523.25, 659.25, 783.99, 1046.5].forEach((hz) => brass(ctx, out, t + 0.22, hz, 0.15 * v, 0.5, 3000));
    return 0.9;
  },

  // ------------------------------------------------------------------ item use / effects
  peelDrop(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 700, f1: 180, dur: 0.15, vol: 0.3 * v, vib: { rate: 24, depth: 90 } }); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 500, q: 2, dur: 0.07, vol: 0.1 * v }); return 0.2; },
  peelThrow(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 500, f1: 1800, q: 1.2, dur: 0.22, vol: 0.14 * v }); T(ctx, out, t + 0.02, { type: 'sine', f: 600, f1: 300, dur: 0.12, vol: 0.12 * v }); return 0.3; },
  peelLand(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 420, f1: 160, dur: 0.12, vol: 0.2 * v }); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 900, q: 2, dur: 0.05, vol: 0.1 * v }); return 0.18; },
  peelHit(ctx, out, t, o) {
    const v = vol(o);
    T(ctx, out, t, { type: 'triangle', f: 1100, f1: 200, dur: 0.6, vol: 0.24 * v, lp: 3500, vib: { rate: 14, depth: 220 }, release: 0.15 });
    T(ctx, out, t + 0.05, { type: 'sine', f: 300, f1: 90, dur: 0.35, vol: 0.2 * v, vib: { rate: 10, depth: 80 } });
    T(ctx, out, t + 0.02, { type: 'square', f: 1700, f1: 900, dur: 0.1, vol: 0.05 * v, lp: 3000 });
    return 0.8;
  },
  orbThrow(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sawtooth', f: 260 * P(o), f1: 1500 * P(o), dur: 0.22, vol: 0.14 * v, lp: 3500, release: 0.08 }); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 1500, q: 1, dur: 0.26, vol: 0.12 * v }); F(ctx, out, t + 0.04, { f: 2200, ratio: 2.4, index: 0.7, index1: 0.05, dur: 0.2, vol: 0.06 * v }); return 0.4; },
  orbBounce(ctx, out, t, o) { const v = vol(o); F(ctx, out, t, { f: 1800 * P(o), ratio: 1.5, index: 0.9, index1: 0.06, dur: 0.26, vol: 0.2 * v }); T(ctx, out, t, { type: 'sine', f: 620, f1: 300, dur: 0.09, vol: 0.14 * v }); return 0.35; },
  orbHit(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 3000, q: 1.2, dur: 0.1, vol: 0.3 * v, release: 0.05 }); T(ctx, out, t, { type: 'sine', f: 520, f1: 120, dur: 0.22, vol: 0.32 * v }); F(ctx, out, t, { f: 2300, ratio: 2.7, index: 1, index1: 0.05, dur: 0.3, vol: 0.1 * v }); return 0.45; },
  seekerLaunch(ctx, out, t, o) {
    const v = vol(o);
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 700, f1: 2600, q: 0.9, dur: 0.65, vol: 0.3 * v, attack: 0.02, release: 0.3 });
    T(ctx, out, t, { type: 'sawtooth', f: 140, f1: 420, dur: 0.45, vol: 0.1 * v, lp: 1500, release: 0.2 });
    T(ctx, out, t, { type: 'sine', f: 140, f1: 55, dur: 0.14, vol: 0.3 * v });
    return 0.95;
  },
  lockBeep(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'square', f: 1250 * P(o), dur: 0.07, vol: 0.1 * v, lp: 4200, release: 0.02 }); return 0.12; },
  bombThrow(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 350, f1: 1200, q: 1, dur: 0.28, vol: 0.14 * v }); T(ctx, out, t, { type: 'sine', f: 200, f1: 400, dur: 0.1, vol: 0.12 * v }); return 0.35; },
  bombTick(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'square', f: 1900 * P(o), dur: 0.03, vol: 0.09 * v, lp: 5000, release: 0.015 }); N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 4000, dur: 0.02, vol: 0.08 * v }); return 0.06; },
  explosion(ctx, out, t, o) { const s = o.level ?? 1; return boom(ctx, out, t, 0.7 + 0.5 * s, vol(o)); },
  explosionSmall(ctx, out, t, o) { return boom(ctx, out, t, 0.55, 0.75 * vol(o)); },
  cometLaunch(ctx, out, t, o) {
    const v = vol(o);
    T(ctx, out, t, { type: 'sine', f: 400, f1: 3200, dur: 1.6, vol: 0.14 * v, vib: { rate: 6, depth: 40 }, attack: 0.05, release: 0.4 });
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 600, f1: 4200, q: 1.5, dur: 1.4, vol: 0.18 * v, attack: 0.1, release: 0.4 });
    T(ctx, out, t, { type: 'sine', f: 70, f1: 40, dur: 0.5, vol: 0.3 * v });
    return 2.0;
  },
  cometImpact(ctx, out, t, o) {
    const v = vol(o);
    boom(ctx, out, t, 1.4, v);
    T(ctx, out, t, { type: 'sine', f: 60, f1: 22, dur: 1.4, vol: 0.28 * v, release: 0.5 });
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 2000, f1: 300, q: 0.7, dur: 0.8, vol: 0.12 * v });
    return 2.4;
  },
  cometWarn(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 880, f1: 1320, dur: 0.22, vol: 0.13 * v, release: 0.05 }); T(ctx, out, t + 0.24, { type: 'sine', f: 1320, f1: 880, dur: 0.22, vol: 0.13 * v, release: 0.05 }); return 0.5; },
  shock(ctx, out, t, o) {
    const v = vol(o);
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 3200, q: 2, dur: 0.55, vol: 0.28 * v, release: 0.25 });
    T(ctx, out, t, { type: 'square', f: 58, dur: 0.6, vol: 0.14 * v, lp: 600, vib: { rate: 38, depth: 400 } });
    for (let i = 0; i < 7; i++) T(ctx, out, t + rnd(0, 0.4), { type: 'sawtooth', f: rnd(900, 2600), f1: rnd(150, 400), dur: 0.06, vol: 0.1 * v, lp: 5000 });
    T(ctx, out, t + 0.1, { type: 'sine', f: 1800, f1: 160, dur: 0.9, vol: 0.14 * v, release: 0.3 });
    return 1.2;
  },
  shrink(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 300, f1: 1700, dur: 0.28, vol: 0.15 * v, vib: { rate: 22, depth: 60 } }); N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 6000, dur: 0.1, vol: 0.05 * v }); return 0.4; },
  unshrink(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 1500, f1: 260, dur: 0.3, vol: 0.14 * v, vib: { rate: 14, depth: 60 } }); return 0.4; },
  shieldUp(ctx, out, t, o) {
    const v = vol(o);
    T(ctx, out, t, { type: 'sine', f: 900, f1: 2800, dur: 0.6, vol: 0.1 * v, attack: 0.05, release: 0.2 });
    F(ctx, out, t, { f: 1760, ratio: 2.76, index: 1.4, index1: 0.05, dur: 1.0, vol: 0.12 * v, release: 0.3 });
    F(ctx, out, t + 0.08, { f: 2349, ratio: 2.76, index: 1.2, index1: 0.05, dur: 0.9, vol: 0.09 * v, release: 0.3 });
    N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 6500, dur: 0.6, vol: 0.06 * v, attack: 0.1, release: 0.3 });
    T(ctx, out, t, { type: 'sine', f: 220, f1: 330, dur: 0.5, vol: 0.14 * v });
    return 1.3;
  },
  shieldDown(ctx, out, t, o) { const v = vol(o); F(ctx, out, t, { f: 1568, f1: 784, ratio: 2.76, index: 1, index1: 0.05, dur: 0.5, vol: 0.14 * v, release: 0.2 }); T(ctx, out, t, { type: 'sine', f: 600, f1: 200, dur: 0.4, vol: 0.1 * v }); return 0.7; },
  blocked(ctx, out, t, o) { const v = vol(o); F(ctx, out, t, { f: 1318.5, ratio: 2.4, index: 1.1, index1: 0.05, dur: 0.3, vol: 0.18 * v }); F(ctx, out, t + 0.06, { f: 1975, ratio: 2.4, index: 1.1, index1: 0.05, dur: 0.3, vol: 0.14 * v }); N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 4000, q: 3, dur: 0.06, vol: 0.12 * v }); return 0.5; },
  rocketStart(ctx, out, t, o) {
    const v = vol(o);
    N(ctx, out, t, { color: 'white', ftype: 'lowpass', f: 200, f1: 3200, q: 0.8, dur: 1.1, vol: 0.4 * v, attack: 0.05, release: 0.5 });
    T(ctx, out, t, { type: 'sawtooth', f: 60, f1: 320, dur: 1.2, vol: 0.18 * v, lp: 1500, release: 0.3 });
    T(ctx, out, t, { type: 'sine', f: 100, f1: 40, dur: 0.3, vol: 0.45 * v });
    F(ctx, out, t + 0.1, { f: 880, ratio: 2, index: 0.4, index1: 0.05, dur: 0.6, vol: 0.06 * v });
    return 1.8;
  },
  rocketEnd(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'white', ftype: 'lowpass', f: 3000, f1: 200, dur: 0.5, vol: 0.2 * v, release: 0.25 }); T(ctx, out, t, { type: 'sawtooth', f: 300, f1: 70, dur: 0.45, vol: 0.1 * v, lp: 1200 }); return 0.7; },
  inkSplat(ctx, out, t, o) { const v = vol(o); N(ctx, out, t, { color: 'brown', ftype: 'lowpass', f: 900, dur: 0.26, vol: 0.32 * v }); T(ctx, out, t, { type: 'sine', f: 360, f1: 90, dur: 0.3, vol: 0.26 * v }); N(ctx, out, t + 0.03, { color: 'white', ftype: 'bandpass', f: 400, f1: 950, q: 2, dur: 0.14, vol: 0.12 * v }); return 0.45; },
  stormCharge(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sawtooth', f: 200, f1: 1600, dur: 0.35, vol: 0.08 * v, lp: 3000 }); return 0.4; },

  // ------------------------------------------------------------------ UI (also reachable as audio.ui(name))
  uiClick(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'triangle', f: 740 * P(o), f1: 620 * P(o), dur: 0.075, vol: 0.2 * v, lp: 5000 }); N(ctx, out, t, { color: 'white', ftype: 'highpass', f: 5500, dur: 0.012, vol: 0.05 * v }); return 0.12; },
  uiHover(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 1400 * P(o), dur: 0.035, vol: 0.07 * v }); return 0.06; },
  uiConfirm(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'triangle', f: 523.25, dur: 0.09, vol: 0.2 * v }); T(ctx, out, t + 0.075, { type: 'triangle', f: 784, dur: 0.18, vol: 0.2 * v, release: 0.1 }); F(ctx, out, t + 0.075, { f: 1568, ratio: 3.01, index: 0.5, index1: 0.04, dur: 0.22, vol: 0.06 * v }); return 0.4; },
  uiBack(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'triangle', f: 440, f1: 330, dur: 0.1, vol: 0.18 * v }); T(ctx, out, t + 0.07, { type: 'triangle', f: 294, dur: 0.12, vol: 0.16 * v }); return 0.25; },
  uiError(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'square', f: 150, dur: 0.12, vol: 0.18 * v, lp: 900 }); T(ctx, out, t + 0.14, { type: 'square', f: 140, dur: 0.16, vol: 0.18 * v, lp: 800 }); return 0.4; },
  uiSelect(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 740 * P(o), f1: 1100 * P(o), dur: 0.1, vol: 0.22 * v }); F(ctx, out, t, { f: 1480 * P(o), ratio: 2.01, index: 0.6, index1: 0.05, dur: 0.15, vol: 0.06 * v }); return 0.2; },
  uiTick(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 900 * P(o), dur: 0.028, vol: 0.1 * v }); return 0.06; },
  uiToast(ctx, out, t, o) { const v = vol(o); F(ctx, out, t, { f: 1568, ratio: 3.01, index: 0.8, index1: 0.04, dur: 0.4, vol: 0.14 * v }); F(ctx, out, t + 0.09, { f: 2093, ratio: 3.01, index: 0.8, index1: 0.04, dur: 0.4, vol: 0.12 * v }); return 0.6; },
  uiStart(ctx, out, t, o) {
    const v = vol(o);
    [261.63, 329.63, 392, 523.25].forEach((hz) => brass(ctx, out, t, hz, 0.16 * v, 0.7, 2400));
    N(ctx, out, t, { color: 'white', ftype: 'bandpass', f: 400, f1: 4000, q: 1, dur: 0.5, vol: 0.14 * v, release: 0.2 });
    return 1.0;
  },
  uiPause(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 800, f1: 300, dur: 0.18, vol: 0.18 * v }); return 0.25; },
  uiResume(ctx, out, t, o) { const v = vol(o); T(ctx, out, t, { type: 'sine', f: 300, f1: 800, dur: 0.18, vol: 0.18 * v }); return 0.25; },
  uiUnlock(ctx, out, t, o) { const v = vol(o); [659.25, 783.99, 987.77, 1318.5].forEach((hz, i) => pluck(ctx, out, t + i * 0.08, hz, 0.15 * v, 0.3, 5500)); return 0.6; },
};

/** Mixing hints per sound: wet = reverb send, cd = cooldown (s), prio 0 (drop first) .. 2 (never dropped), pv = pitch variation */
export const SFX_META = {
  explosion: { wet: 0.35, prio: 2 }, explosionSmall: { wet: 0.25, prio: 2 }, cometImpact: { wet: 0.45, prio: 2 }, cometLaunch: { wet: 0.2, prio: 2 }, launch: { wet: 0.25, prio: 2 },
  boost: { wet: 0.12, prio: 1, cd: 0.12 }, driftBoost: { wet: 0.12, prio: 1, cd: 0.1 }, padBoost: { wet: 0.1, prio: 1, cd: 0.15 }, startBoost: { wet: 0.2, prio: 2 },
  wallHit: { wet: 0.1, prio: 1, cd: 0.12 }, bump: { wet: 0.08, prio: 1, cd: 0.1 }, wallScrape: { prio: 0, cd: 0.05 }, land: { prio: 1, cd: 0.1 }, jump: { prio: 0, cd: 0.1 },
  shock: { wet: 0.3, prio: 2 }, shieldUp: { wet: 0.3, prio: 2 }, shieldDown: { wet: 0.2, prio: 1 }, blocked: { wet: 0.15, prio: 1, cd: 0.08 }, rocketStart: { wet: 0.2, prio: 2 }, rocketEnd: { prio: 1 },
  finalLap: { wet: 0.25, prio: 2, pv: 0 }, finishWin: { wet: 0.3, prio: 2, pv: 0 }, finishPodium: { wet: 0.25, prio: 2, pv: 0 }, finishLose: { wet: 0.2, prio: 2, pv: 0 }, lap: { wet: 0.15, prio: 1, pv: 0 },
  countdown: { prio: 2, pv: 0 }, go: { wet: 0.2, prio: 2, pv: 0 }, itemBox: { wet: 0.15, prio: 1 }, rouletteTick: { prio: 0, pv: 0.02 }, itemGot: { wet: 0.2, prio: 1 }, itemGotRare: { wet: 0.25, prio: 2 },
  coin: { prio: 0, cd: 0.04, pv: 0.01 }, lockBeep: { prio: 1, pv: 0 }, cometWarn: { prio: 1, pv: 0 }, bombTick: { prio: 0, cd: 0.04, pv: 0.02 }, wrongWay: { prio: 1, pv: 0 },
  uiClick: { prio: 2, pv: 0.03 }, uiHover: { prio: 0, cd: 0.04, pv: 0.03 }, uiConfirm: { prio: 2, pv: 0 }, uiBack: { prio: 2, pv: 0 }, uiError: { prio: 2, pv: 0 }, uiSelect: { prio: 2, pv: 0.02 }, uiTick: { prio: 0, cd: 0.03, pv: 0.03 },
  uiToast: { prio: 1, pv: 0 }, uiStart: { wet: 0.2, prio: 2, pv: 0 }, uiPause: { prio: 2, pv: 0, cd: 0.6 }, uiResume: { prio: 2, pv: 0, cd: 0.6 }, uiUnlock: { wet: 0.1, prio: 2, pv: 0 },
};

/** drift level 1..3 from opts.level / opts.index */
function lvlOf(o) { return Math.min(3, Math.max(1, Math.round(o.level ?? o.index ?? 1))); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
