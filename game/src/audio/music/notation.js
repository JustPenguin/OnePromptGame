// Tracker-style notation for the procedural soundtrack.  A bar is 16 sixteenth-note steps written as 16 whitespace-
// separated tokens ('|' separators are ignored):
//   melody:  note names  C5 F#4 Bb3   '.' = rest   '_' = hold the previous note   (absolute pitch)
//   bass:    integers = semitones above the CHORD ROOT (12 = octave up, -5 = fifth below)   '.' '_' as above
//   arp:     integers = chord-tone index (0 root, 1 third, 2 fifth, 3 seventh/octave, 4 ... wraps up an octave)
//   stab:    'x' = chord stab on that step (reggae skank, brass hits)
//   drums:   one 16-char string per drum voice: x = hit, X = accent, o = ghost, . = none
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)$/;
const BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function noteToMidi(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + BASE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Split a multi-line template literal into bars (one bar per non-empty line). */
export const bars = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/** Parse one bar string into 16 steps: { n: midi|int|null, hold: bool }. */
export function parseSteps(str, kind) {
  const toks = str.replace(/\|/g, ' ').trim().split(/\s+/);
  const out = [];
  for (let i = 0; i < 16; i++) {
    const t = toks[i] ?? '.';
    if (t === '.') out.push({ n: null, hold: false });
    else if (t === '_') out.push({ n: null, hold: true });
    else if (kind === 'melody') { const m = noteToMidi(t); out.push({ n: m, hold: false }); }
    else if (kind === 'stab') out.push({ n: t === 'x' || t === 'X' ? 1 : null, hold: false, accent: t === 'X' });
    else { const v = Number(t); out.push({ n: Number.isFinite(v) ? v : null, hold: false }); }
  }
  return out;
}

/** Turn parsed steps into note events { step, n, len } where len counts the steps until the next event (holds extend). */
export function toEvents(steps) {
  const ev = [];
  for (let i = 0; i < 16; i++) {
    const s = steps[i];
    if (s.n === null) continue;
    let len = 1;
    while (i + len < 16 && steps[i + len].hold) len++;
    ev.push({ step: i, n: s.n, len, accent: s.accent });
  }
  return ev;
}

// ---- chords -------------------------------------------------------------------------------------------------------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], sus: [0, 5, 7], sus4: [0, 5, 7], sus2: [0, 2, 7],
  dim: [0, 3, 6], aug: [0, 4, 8], '5': [0, 7, 12], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
};
const chordCache = new Map();
/** 'C' 'Am' 'F#m7' 'Bbmaj7' 'G7' 'Dsus' -> { root: 0..11, tones: [semitones above root] } */
export function parseChord(name) {
  let c = chordCache.get(name);
  if (c) return c;
  const m = /^([A-G])([#b]?)(.*)$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const tones = QUAL[m[3]] ?? (() => { throw new Error(`unknown chord quality "${m[3]}" in ${name}`); })();
  c = { root, tones, name };
  chordCache.set(name, c);
  return c;
}

/** nth chord tone (index may exceed the chord size: wraps up by octaves) as an absolute MIDI note near `base` (root's octave start). */
export function chordTone(chord, index, baseMidi) {
  const n = chord.tones.length;
  const oct = Math.floor(index / n), i = ((index % n) + n) % n;
  return baseMidi + chord.root + chord.tones[i] + 12 * oct;
}
