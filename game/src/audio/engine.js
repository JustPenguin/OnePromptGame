// Engine sound: EngineModel (pure maths: stepped-gear rpm with shift dips, revving at the start line) drives an
// EngineVoice (layered detuned saws + sub + intake noise + turbine whine + tyre skid + off-road rumble + wind).
// The player gets the full voice; up to four nearby AI karts get a "lite" voice (two oscillators + filter) that is
// panned / attenuated / doppler-shifted by the AudioManager.  Every parameter is smoothed (setTargetAtTime): no zipper noise.
import { noiseBuffer, clamp } from './synth.js';

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class EngineModel {
  constructor() { this.rpm = 0.22; this.gear = 0; this.shiftT = 0; this.rev = 0; this.up = 0; }
  /** s = { speed (m/s, abs), top, throttle, grounded, locked, spin, boosting } -> this.rpm (0..1), this.gear */
  update(dt, s) {
    const r = clamp(s.speed / Math.max(1, s.top), 0, 1.6);
    const g = Math.min(5, Math.floor(r * 5.4));
    if (g > this.gear) { this.shiftT = 0.1; this.up = 1; }
    this.gear = g;
    const within = clamp(r * 5.4 - g, 0, 1);
    let target = 0.26 + 0.74 * Math.pow(within, 0.85);
    if (s.locked) target = 0.24 + 0.6 * s.throttle;                 // rev the engine on the grid
    else if (!s.grounded) target = Math.min(1, this.rpm + 0.5 * dt * Math.max(0.2, s.throttle) + 0.05);   // wheels free in the air
    if (s.spin) target *= 0.65;
    if (s.throttle < 0.05 && !s.locked) target = this.rpm * 0.97 + 0.22 * 0.03;                       // lift off: rpm falls slowly
    if (s.boosting) target = Math.min(1.05, target + 0.1);
    this.shiftT = Math.max(0, this.shiftT - dt);
    this.rpm = damp(this.rpm, target - (this.shiftT > 0 ? 0.26 : 0), 15, dt);
    return this;
  }
}

const baseHz = (rpm, gear) => 55 * Math.pow(2, rpm * 1.5 + gear * 0.12);

export class EngineVoice {
  /**
   * @param {BaseAudioContext} ctx @param {AudioNode} dest
   * @param {{lite?:boolean, tune?:number, level?:number}} o  tune = pitch multiplier for this kart, level = loudness
   */
  constructor(ctx, dest, o = {}) {
    this.ctx = ctx; this.lite = !!o.lite; this.tune = o.tune ?? 1; this.level = o.level ?? 1;
    this.dead = false;
    const t = ctx.currentTime;
    this.out = ctx.createGain(); this.out.gain.value = 0.0001;
    this.pan = ctx.createStereoPanner();
    this.dist = ctx.createBiquadFilter(); this.dist.type = 'lowpass'; this.dist.frequency.value = 12000; this.dist.Q.value = 0.5;
    this.out.connect(this.dist); this.dist.connect(this.pan); this.pan.connect(dest);
    this.nodes = [];
    const src = (type, f, detune = 0) => { const o2 = ctx.createOscillator(); o2.type = type; o2.frequency.value = f; o2.detune.value = detune; this.nodes.push(o2); return o2; };
    // --- core: two detuned saws + square sub through a resonant low-pass
    this.oscA = src('sawtooth', 70); this.oscB = src('sawtooth', 70, 11); this.sub = src('square', 35);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const subG = ctx.createGain(); subG.gain.value = this.lite ? 0.22 : 0.3;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = this.lite ? 2 : 3.2; this.lp.frequency.value = 600;
    this.amp = ctx.createGain(); this.amp.gain.value = 0.4;
    this.oscA.connect(mix); this.oscB.connect(mix); this.sub.connect(subG); subG.connect(mix);
    mix.connect(this.lp); this.lp.connect(this.amp); this.amp.connect(this.out);
    // tremolo: the "putt" of the firing pulses
    this.lfo = src('sine', 12); const lg = ctx.createGain(); lg.gain.value = this.lite ? 0.08 : 0.12; this.lfo.connect(lg); lg.connect(this.amp.gain);
    this.nodes.forEach((n) => n.start(t));
    if (!this.lite) this.buildFull(ctx, t);
  }

  buildFull(ctx, t) {
    const loop = (color) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, color); s.loop = true; s.start(t, Math.random() * 1.5); this.nodes.push(s); return s; };
    // intake / exhaust rasp
    const n = loop('pink'); this.intake = ctx.createBiquadFilter(); this.intake.type = 'bandpass'; this.intake.Q.value = 0.9; this.intake.frequency.value = 600;
    this.intakeG = ctx.createGain(); this.intakeG.gain.value = 0; n.connect(this.intake); this.intake.connect(this.intakeG); this.intakeG.connect(this.out);
    // turbine whine (boost / rocket)
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turbo.frequency.value = 900; this.turbo.start(t); this.nodes.push(this.turbo);
    this.turboG = ctx.createGain(); this.turboG.gain.value = 0; this.turbo.connect(this.turboG); this.turboG.connect(this.out);
    // tyre skid: noise + a thin squeal
    const sk = loop('white'); this.skidF = ctx.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.Q.value = 5; this.skidF.frequency.value = 2200;
    this.skidG = ctx.createGain(); this.skidG.gain.value = 0; sk.connect(this.skidF); this.skidF.connect(this.skidG); this.skidG.connect(this.out);
    this.squeal = ctx.createOscillator(); this.squeal.type = 'sawtooth'; this.squeal.frequency.value = 880; this.squeal.start(t); this.nodes.push(this.squeal);
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 1900; this.squealG = ctx.createGain(); this.squealG.gain.value = 0;
    this.squeal.connect(sl); sl.connect(this.squealG); this.squealG.connect(this.out);
    // off-road rumble
    const of = loop('brown'); this.offF = ctx.createBiquadFilter(); this.offF.type = 'lowpass'; this.offF.frequency.value = 380; this.offF.Q.value = 0.7;
    this.offG = ctx.createGain(); this.offG.gain.value = 0; of.connect(this.offF); this.offF.connect(this.offG); this.offG.connect(this.out);
    // wind
    const w = loop('pink'); this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 900; this.windF.Q.value = 0.5;
    this.windG = ctx.createGain(); this.windG.gain.value = 0; w.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.out);
    // wall scrape: metallic grind
    const sc = loop('pink'); this.scrF = ctx.createBiquadFilter(); this.scrF.type = 'bandpass'; this.scrF.Q.value = 6; this.scrF.frequency.value = 1700;
    this.scrG = ctx.createGain(); this.scrG.gain.value = 0; sc.connect(this.scrF); this.scrF.connect(this.scrG); this.scrG.connect(this.out);
  }

  /**
   * p: { rpm, gear, throttle, boost (0..1), skid (0..1), squeal (0..1), off (0..1), offKind ('grass'|'sand'|...), wind (0..1),
   *      scrape (0..1), gain (0..1), pan (-1..1), lp (Hz), doppler (pitch multiplier), pitchLift }
   */
  apply(p, tc = 0.035) {
    if (this.dead) return;
    const now = this.ctx.currentTime;
    const rpm = clamp(fin(p.rpm, 0.2), 0, 1.1), thr = clamp(fin(p.throttle, 0), 0, 1);
    const boost = clamp(fin(p.boost, 0), 0, 1);
    const f = baseHz(rpm, p.gear ?? 0) * this.tune * fin(p.doppler, 1) * (1 + 0.06 * boost) * fin(p.pitchLift, 1);
    this.oscA.frequency.setTargetAtTime(f, now, tc); this.oscB.frequency.setTargetAtTime(f, now, tc); this.sub.frequency.setTargetAtTime(f * 0.5, now, tc);
    this.lfo.frequency.setTargetAtTime(f * 0.33, now, tc);
    this.lp.frequency.setTargetAtTime(clamp(380 + rpm * 1500 + thr * 1100 + boost * 1400, 200, 7000), now, tc);
    this.amp.gain.setTargetAtTime((0.22 + 0.4 * thr + 0.12 * rpm) * (this.lite ? 0.8 : 1), now, tc);
    this.out.gain.setTargetAtTime(clamp(fin(p.gain, 1), 0, 1.5) * this.level, now, 0.05);
    this.pan.pan.setTargetAtTime(clamp(fin(p.pan, 0), -1, 1), now, 0.05);
    this.dist.frequency.setTargetAtTime(clamp(fin(p.lp, 14000), 300, 16000), now, 0.06);
    if (this.lite) return;
    this.intake.frequency.setTargetAtTime(380 + rpm * 1100, now, tc);
    this.intakeG.gain.setTargetAtTime((0.04 + 0.2 * thr) * (0.5 + rpm * 0.7), now, tc);
    this.turbo.frequency.setTargetAtTime(900 + rpm * 700 + boost * 1100, now, tc);
    this.turboG.gain.setTargetAtTime(boost * 0.05, now, 0.06);
    const sk = clamp(fin(p.skid, 0), 0, 1);
    this.skidG.gain.setTargetAtTime(sk * 0.13, now, 0.05);
    this.skidF.frequency.setTargetAtTime(1900 + sk * 900, now, 0.08);
    this.squeal.frequency.setTargetAtTime(760 + 280 * clamp(fin(p.squeal, 0), 0, 1) + 90 * Math.sin(now * 17), now, 0.04);
    this.squealG.gain.setTargetAtTime(clamp(fin(p.squeal, 0), 0, 1) * 0.022, now, 0.06);
    const off = clamp(fin(p.off, 0), 0, 1);
    this.offG.gain.setTargetAtTime(off * 0.34, now, 0.08);
    this.offF.frequency.setTargetAtTime({ sand: 900, snow: 1500, mud: 260, water: 1300, grass: 420 }[p.offKind] ?? 420, now, 0.1);
    const wind = clamp(fin(p.wind, 0), 0, 1);
    this.windG.gain.setTargetAtTime(wind * wind * 0.11, now, 0.1);
    this.windF.frequency.setTargetAtTime(600 + wind * 1500, now, 0.1);
    this.scrG.gain.setTargetAtTime(clamp(fin(p.scrape, 0), 0, 1) * 0.16, now, 0.03);
  }

  /** Fade out and release every node. */
  stop(fade = 0.12) {
    if (this.dead) return;
    this.dead = true;
    const now = this.ctx.currentTime;
    try { this.out.gain.cancelScheduledValues(now); this.out.gain.setTargetAtTime(0, now, Math.max(0.02, fade / 4)); } catch { /* ctx closed */ }
    const end = now + fade + 0.1;
    for (const n of this.nodes) { try { n.stop(end); } catch { /* already stopped */ } }
    setTimeout(() => { try { this.out.disconnect(); this.dist.disconnect(); this.pan.disconnect(); } catch { /* gone */ } }, (fade + 0.3) * 1000);
  }
}
