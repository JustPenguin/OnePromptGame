// Low-level WebAudio synthesis helpers.  Everything takes a BaseAudioContext so the same code runs in real time and in
// an OfflineAudioContext (which is how the audio is verified headlessly).  No clicks: every envelope has >= 2 ms attack
// and release; every source is stopped; nothing is left running.
const noiseCache = new WeakMap();

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TWO_PI = Math.PI * 2;

/** Shared looping noise buffers (white / pink / brown), 2 s long, generated once per context. */
export function noiseBuffer(ctx, color = 'white') {
  let m = noiseCache.get(ctx);
  if (!m) { m = {}; noiseCache.set(ctx, m); }
  if (m[color]) return m[color];
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // deterministic LCG so offline renders are reproducible
  let seed = color === 'pink' ? 12345 : color === 'brown' ? 777 : 4242;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  if (color === 'white') for (let i = 0; i < len; i++) d[i] = rnd();
  else if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * rnd()) / 1.02; d[i] = last * 3.5; }
  }
  // crossfade the loop seam so the loop never clicks
  const x = Math.floor(ctx.sampleRate * 0.01);
  for (let i = 0; i < x; i++) { const k = i / x; d[len - x + i] = d[len - x + i] * (1 - k) + d[i] * k; }
  m[color] = buf;
  return buf;
}

/** exponential-ish release helper: schedules gain 0 -> peak (attack) -> hold -> exp decay to ~0 */
export function adsr(param, t, { peak = 1, attack = 0.004, hold = 0, decay = 0.2, sustain = 0, release = 0 }) {
  const a = Math.max(0.002, attack);
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + a);
  let end = t + a;
  if (hold > 0) { param.setValueAtTime(peak, t + a + hold); end = t + a + hold; }
  const sus = Math.max(0.0001, peak * sustain);
  param.exponentialRampToValueAtTime(sus, end + Math.max(0.01, decay));
  end += Math.max(0.01, decay);
  if (release > 0) { param.exponentialRampToValueAtTime(0.0001, end + release); end += release; }
  else if (sustain > 0) { param.exponentialRampToValueAtTime(0.0001, end + 0.03); end += 0.03; }
  return end;
}

/**
 * One oscillator voice with an amplitude envelope and optional filter / pan / vibrato.
 * o: { type, f, f1 (end freq), fCurve:'exp'|'lin', dur, vol, attack, release, detune, lp, lp1, q, hp, pan, vib:{rate,depth}, delay }
 * Returns the time the voice ends.
 */
export function tone(ctx, dest, t, o) {
  const dur = Math.max(0.01, o.dur ?? 0.2), release = o.release ?? Math.min(0.08, dur * 0.5);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const f0 = Math.max(10, o.f ?? 440);
  osc.frequency.setValueAtTime(f0, t);
  if (o.f1 !== undefined) {
    const f1 = Math.max(10, o.f1);
    if (o.fCurve === 'lin') osc.frequency.linearRampToValueAtTime(f1, t + (o.fDur ?? dur));
    else osc.frequency.exponentialRampToValueAtTime(f1, t + (o.fDur ?? dur));
  }
  if (o.detune) osc.detune.value = o.detune;
  let node = osc;
  if (o.lp !== undefined || o.hp !== undefined) {
    if (o.hp !== undefined) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = o.hp; h.Q.value = 0.7; node.connect(h); node = h; }
    if (o.lp !== undefined) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q ?? 0.8;
      f.frequency.setValueAtTime(Math.max(40, o.lp), t);
      if (o.lp1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.lp1), t + dur);
      node.connect(f); node = f;
    }
  }
  const g = ctx.createGain();
  node.connect(g);
  const end = adsr(g.gain, t, { peak: o.vol ?? 0.3, attack: o.attack ?? 0.004, decay: Math.max(0.01, dur - (o.attack ?? 0.004)), release });
  let out = g;
  if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); out = p; }
  out.connect(dest);
  if (o.vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = o.vib.rate ?? 6; lg.gain.value = o.vib.depth ?? 10;   // cents
    l.connect(lg); lg.connect(osc.detune);
    l.start(t); l.stop(end + 0.02);
  }
  osc.start(t); osc.stop(end + 0.02);
  return end;
}

/** Filtered noise burst.  o: { color, dur, vol, attack, release, ftype, f, f1, q, hp, pan } */
export function noise(ctx, dest, t, o) {
  const dur = Math.max(0.01, o.dur ?? 0.2), release = o.release ?? Math.min(0.1, dur * 0.5);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.color ?? 'white');
  src.loop = true;
  const startOff = (o.offset ?? ((t * 7.31) % 1.5));
  let node = src;
  if (o.ftype) {
    const f = ctx.createBiquadFilter(); f.type = o.ftype; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(Math.max(20, o.f ?? 1000), t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.fDur ?? dur));
    node.connect(f); node = f;
  }
  if (o.hp !== undefined) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = o.hp; node.connect(h); node = h; }
  const g = ctx.createGain();
  node.connect(g);
  const end = adsr(g.gain, t, { peak: o.vol ?? 0.3, attack: o.attack ?? 0.003, decay: Math.max(0.01, dur - (o.attack ?? 0.003)), release });
  let out = g;
  if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); out = p; }
  out.connect(dest);
  src.start(t, startOff); src.stop(end + 0.02);
  return end;
}

/** Two-operator FM voice (bells, marimba, EP).  o: { f, ratio, index, index1, dur, vol, attack, release, type, pan } */
export function fm(ctx, dest, t, o) {
  const dur = Math.max(0.02, o.dur ?? 0.4), release = o.release ?? 0.05;
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.type = o.type ?? 'sine'; mod.type = 'sine';
  const f = Math.max(20, o.f ?? 440);
  car.frequency.setValueAtTime(f, t);
  if (o.f1 !== undefined) car.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
  mod.frequency.value = f * (o.ratio ?? 2);
  const idx = (o.index ?? 2) * f * (o.ratio ?? 2) / (o.ratio ?? 2);
  mg.gain.setValueAtTime(idx, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, (o.index1 ?? 0.1) * f), t + dur);
  mod.connect(mg); mg.connect(car.frequency);
  car.connect(g);
  const end = adsr(g.gain, t, { peak: o.vol ?? 0.25, attack: o.attack ?? 0.003, decay: Math.max(0.02, dur - (o.attack ?? 0.003)), release });
  let out = g;
  if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); out = p; }
  out.connect(dest);
  car.start(t); mod.start(t); car.stop(end + 0.02); mod.stop(end + 0.02);
  return end;
}

/** Soft clipper curve for a WaveShaper: unity gain below `knee`, tanh-compressed above; output never exceeds ~0.93 for |x| <= 1. */
export function softClipCurve(knee = 0.72, n = 4096) {
  const c = new Float32Array(n);
  const room = 0.985 - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    c[i] = x < 0 ? -y : y;
  }
  return c;
}
/** Harder distortion curve (volcano bass / guitar). */
export function distortionCurve(amount = 30, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
  return c;
}

/** Synthesised room reverb impulse response (decaying filtered noise, stereo-decorrelated). */
export function makeImpulse(ctx, seconds = 1.4, decay = 3.2, lowpassHz = 6000) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 91 + ch * 53, lp = 0;
    const a = Math.exp(-TWO_PI * lowpassHz / ctx.sampleRate);
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = (seed / 4294967296) * 2 - 1;
      lp = (1 - a) * n + a * lp;
      const tt = i / len;
      d[i] = lp * Math.pow(1 - tt, decay) * (tt < 0.004 ? tt / 0.004 : 1);
    }
  }
  return buf;
}

/** Peak + RMS + NaN check over rendered channel data (verification helper). */
export function analyse(buffer) {
  let peak = 0, sum = 0, n = 0, nan = 0, nonSilent = 0;
  const win = Math.floor(buffer.sampleRate * 0.05);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    let wsum = 0, wn = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v !== v) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v; n++;
      wsum += v * v; wn++;
      if (wn === win) { if (Math.sqrt(wsum / wn) > 0.002) nonSilent++; wsum = 0; wn = 0; }
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), nan, seconds: buffer.length / buffer.sampleRate, activeFraction: nonSilent / Math.max(1, Math.floor(buffer.length / win) * buffer.numberOfChannels) };
}
