// The soundtrack: ten ORIGINAL looping tunes (16 bars each: an A section and a B section), one per track theme.
//   menu  meadow  desert  snow  harbor  neon  volcano  haunted  space  results
// Each song: bpm, swing (delay of odd 16ths as a fraction of a step), a kit, an optional echo bus, a chord per bar and a list
// of tracks (notation in ./notation.js).  `min` = intensity (0..1) at which a layer enters, so the mix builds:
//   0.00 groove (kick/bass/pad) -> 0.25 hats -> 0.5 lead -> 0.7 arps/extras.  The final lap lifts tempo and key.
import { bars } from './notation.js';

const rep = (n, x) => Array.from({ length: n }, () => x);
const seq = (s) => s.replace(/\s+/g, '').split('');

export const SONGS = {
  // =====================================================================================================================
  meadow: {
    name: 'Sunny Pluck', bpm: 128, gain: 0.8, swing: 0.09, kit: 'pop',
    chords: 'C G Am F C G F G  F G Em Am F G C G'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'pad', vol: 0.55, min: 0, base: 60 },
      { id: 'bass', kind: 'bass', inst: 'pickBass', vol: 0.9, min: 0, base: 36, bars: [...rep(3, '0 . . 0 . . 7 . 0 . . 12 . . 7 .'), '0 . . 0 . . 7 . 0 . 7 . 9 . 12 .', ...rep(3, '0 . . 0 . . 7 . 0 . . 12 . . 7 .'), '0 . . 0 . . 7 . 0 . 7 . 9 . 12 .'] },
      { id: 'lead', kind: 'melody', inst: 'pluck', vol: 0.8, min: 0.45, bars: bars(`
        E5 . . G5 . . A5 . G5 . . E5 . . G5 .
        D5 . . G5 . . B4 . D5 . . . . . . .
        C5 . . E5 . . A5 . G5 . . E5 . . C5 .
        A4 . . C5 . . F5 . E5 . . D5 . . C5 .
        E5 . . G5 . . C6 . B5 . . G5 . . E5 .
        D5 . . G5 . . B5 . A5 . . G5 . . D5 .
        C5 . . F5 . . A5 . G5 . . F5 . . E5 .
        G5 _ _ _ . . D5 . E5 . . G5 . . A5 .
        C6 . . A5 . . F5 . A5 . . C6 . . A5 .
        B5 . . G5 . . D5 . G5 . . B5 . . G5 .
        G5 . . E5 . . B4 . E5 . . G5 . . B5 .
        A5 . . C6 . . E6 . D6 . . C6 . . A5 .
        C6 . . A5 . . F5 . A5 . . C6 . . D6 .
        E6 . . D6 . . B5 . G5 . . B5 . . D6 .
        C6 . . G5 . . E5 . G5 . . C6 _ _ _ _
        . . . . D5 . E5 . F5 . G5 . A5 . B5 .`) },
      { id: 'sparkle', kind: 'arp', inst: 'bell', vol: 0.65, min: 0.7, base: 72, bars: [...rep(8, '. 0 . 2 . 1 . 2 . 0 . 2 . 1 . 2'), ...rep(8, '0 . 2 . 1 . 2 . 0 . 2 . 1 . 2 .')] },
      { id: 'drums', kind: 'drums', vol: 0.85, min: 0, pats: {
        C: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.X.x.X.x.X.x.X.', cr: 'X...............' },
        A: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.X.x.X.x.X.x.X.' },
        B: { k: 'x...x..xx...x...', s: '....x.......x..o', h: 'x.X.x.X.x.X.x.X.', o: '..............o.' },
        F: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: 'x.X.x.X.x.X.x...' },
      }, seq: seq('CBABABAF CBABABAF') },
    ],
  },

  // =====================================================================================================================
  desert: {
    name: 'Dune Runner', bpm: 116, gain: 0.95, swing: 0, kit: 'pop',
    chords: 'E F E F Am F E E  Am G F E Am G F E'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'strings', vol: 0.75, min: 0, base: 48 },
      { id: 'bass', kind: 'bass', inst: 'pickBass', vol: 0.9, min: 0, base: 36, bars: [...rep(3, '0 . . 0 . 0 . . 0 . . 7 . 0 . .'), '0 . . 0 . 0 . . 0 . 7 . 5 . 7 .', ...rep(3, '0 . . 0 . 0 . . 0 . . 7 . 0 . .'), '0 . . 0 . 0 . . 0 . 7 . 5 . 7 .'] },
      { id: 'lead', kind: 'melody', inst: 'twang', vol: 0.85, min: 0.45, bars: bars(`
        E5 . F5 E5 . . B4 . E5 . F5 E5 . . . .
        F5 . G#5 F5 . . C5 . F5 . G#5 F5 . . . .
        E5 . F5 E5 . . B4 . G#4 . B4 . E5 _ _ _
        F5 _ _ . E5 . D5 . C5 . . . B4 . . .
        A5 . . A5 G#5 . A5 . B5 . A5 . G#5 . F5 .
        E5 . F5 E5 . . D5 . C5 . . D5 . . C5 .
        B4 . E5 . G#5 . B5 . A5 . G#5 . F5 . E5 .
        E5 _ _ _ _ _ . . . . . . B4 . C5 .
        A5 . C6 . B5 . A5 . G#5 . A5 . . . . .
        G5 . B5 . A5 . G5 . F5 . G5 . . . . .
        F5 . A5 . G#5 . F5 . E5 . F5 . . . . .
        E5 . G#5 . B5 . G#5 . E5 . F5 E5 . . . .
        C6 . E6 . D6 . C6 . B5 . A5 . G#5 . A5 .
        B5 . D6 . C6 . B5 . A5 . G5 . A5 . B5 .
        C6 . A5 . F5 . A5 . C6 . A5 . F5 . E5 .
        E5 . F5 E5 . . B4 . E5 . G#5 . F5 E5 . .`) },
      { id: 'shimmer', kind: 'arp', inst: 'glass', vol: 0.8, min: 0.7, base: 72, bars: rep(16, '. . 0 . . . 2 . . . 1 . . . 2 .') },
      { id: 'drums', kind: 'drums', vol: 0.85, min: 0, pats: {
        A: { k: 'x.......x.......', cl: 'x.....o.x.......', ch: '..x...x...x...x.', rim: '............x...', sh: 'x.xxx.xxx.xxx.xx' },
        B: { k: 'x.......x.....x.', cl: 'x.....o.x.o.....', ch: '..x...x...x.o.x.', rim: '........x...x...', sh: 'x.xxx.xxx.xxx.xx', h: '..x...x...x...x.' },
        F: { k: 'x.......x.......', cl: 'x.x.x.x.x.x.xxxx', ch: '..x...x...x.....', rim: '............x.x.', sh: 'x.xxx.xxx.xxx.xx' },
      }, seq: seq('AAAAAAAF BBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  snow: {
    name: 'Sleigh Bells & Snowflakes', bpm: 124, gain: 0.72, swing: 0, kit: 'soft', echo: { steps: 3, fb: 0.32, mix: 0.2, lp: 3600 },
    chords: 'Em C G D Em C G D  C G Am D C D G D'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'strings', vol: 0.85, min: 0, base: 55 },
      { id: 'bass', kind: 'bass', inst: 'pickBass', vol: 0.9, min: 0, base: 36, bars: rep(16, '0 . . . . . . . 7 . . . 0 . . .') },
      { id: 'lead', kind: 'melody', inst: 'bell', vol: 0.75, min: 0.4, echo: 0.35, bars: bars(`
        B5 . . E6 . . D6 . B5 . . G5 . . E5 .
        G5 . . C6 . . E6 . D6 . . C6 . . G5 .
        B5 . . D6 . . G6 . D6 . . B5 . . G5 .
        A5 . . D6 . . F#6 . E6 . . D6 . . A5 .
        B5 . E6 . G6 . E6 . D6 . B5 . . . G5 .
        E6 . G6 . C7 . G6 . E6 . D6 . C6 . . .
        D6 . G6 . B6 . G6 . D6 . B5 . D6 . G6 .
        F#6 . A6 . F#6 . D6 . E6 . D6 . A5 . . .
        G6 . . E6 . . C6 . E6 . . G6 . . E6 .
        D6 . . B5 . . G5 . B5 . . D6 . . B5 .
        E6 . . C6 . . A5 . C6 . . E6 . . A6 .
        F#6 . . D6 . . A5 . D6 . . F#6 . . A6 .
        G6 . E6 . C6 . E6 . G6 . C7 . B6 . G6 .
        A6 . F#6 . D6 . F#6 . A6 . D7 . C#7 . A6 .
        B6 . G6 . D6 . G6 . B6 _ _ _ D7 _ _ _
        . . . . A5 . B5 . C#6 . D6 . E6 . F#6 .`) },
      { id: 'arp', kind: 'arp', inst: 'glass', vol: 0.65, min: 0.3, base: 72, echo: 0.3, bars: rep(16, '0 2 1 3 0 2 1 3 0 2 1 3 0 2 1 2') },
      { id: 'drums', kind: 'drums', vol: 1.1, min: 0, pats: {
        A: { k: 'x.......x.......', rim: '....x.......x...', sh: 'X.x.X.x.X.x.X.x.' },
        B: { k: 'x.......x...x...', rim: '....x.......x...', sh: 'X.x.X.x.X.x.X.x.', h: '..x...x...x...x.' },
        F: { k: 'x.......x.......', rim: '....x...x.x.x.xx', sh: 'X.x.X.x.X.xxXxxx' },
      }, seq: seq('AAAAAAAF AABABABF') },
    ],
  },

  // =====================================================================================================================
  harbor: {
    name: 'Harbor Skank', bpm: 112, gain: 0.9, swing: 0.16, kit: 'dub',
    chords: 'A D A E F#m D E A  D E C#m F#m D E A E'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'strings', vol: 0.7, min: 0.3, base: 48 },
      { id: 'bass', kind: 'bass', inst: 'dubBass', vol: 0.8, min: 0, base: 36, bars: [...rep(3, '0 _ _ _ _ _ _ . . . 0 . 7 . 5 .'), '0 _ _ _ . . 0 . 7 _ _ _ 5 . 3 .', ...rep(3, '0 _ _ _ _ _ _ . . . 0 . 7 . 5 .'), '0 _ _ _ . . 0 . 7 _ _ _ 5 . 3 .'] },
      { id: 'skank', kind: 'stab', inst: 'organ', vol: 1.1, min: 0, base: 48, tones: [0, 1, 2], bars: rep(16, '. . x . . . x . . . x . . . x .') },
      { id: 'lead', kind: 'melody', inst: 'steel', vol: 0.95, min: 0.45, bars: bars(`
        E5 . . A5 . B5 . . C#6 . . B5 . A5 . .
        A5 . . D6 . C#6 . . B5 . . A5 . F#5 . .
        E5 . . A5 . B5 . . C#6 . . E6 . C#6 . B5
        B5 . . G#5 . B5 . . E6 _ _ _ . . . .
        C#6 . . A5 . F#5 . . A5 . . C#6 . . A5 .
        D6 . . A5 . F#5 . . A5 . . D6 . . F#6 .
        E6 . . B5 . G#5 . . B5 . . E6 . . G#6 .
        A5 _ _ _ . . . . E5 . . A5 . . B5 .
        F#6 . . D6 . A5 . . D6 . . F#6 . A6 . .
        G#6 . . E6 . B5 . . E6 . . G#6 . B6 . .
        E6 . . C#6 . G#5 . . C#6 . . E6 . G#6 . .
        A6 . . F#6 . C#6 . . F#6 . . A6 . C#7 . .
        A5 . D6 . F#6 . D6 . A5 . D6 . F#6 . A6 .
        B5 . E6 . G#6 . E6 . B5 . E6 . G#6 . B6 .
        C#6 . E6 . A6 . E6 . C#6 . A5 . E5 . . .
        . . . . B5 . . . G#5 . . . B5 . E6 .`) },
      { id: 'bubble', kind: 'arp', inst: 'marimba', vol: 0.45, min: 0.7, base: 60, bars: rep(16, '. . . . 0 . 2 . . . . . 1 . 2 .') },
      { id: 'drums', kind: 'drums', vol: 0.85, min: 0, pats: {
        A: { k: '........x.......', rim: '........x.......', h: 'x.x.x.x.x.x.x.x.', ch: '..x..x....x..x..' },
        B: { k: '........x.......', rim: '........x...x...', h: 'x.x.x.x.x.x.x.x.', ch: '..x..x....x..x..', o: '..............o.' },
        F: { k: '........x.......', rim: '....x...x.x.xxxx', h: 'x.x.x.x.x.x.x.x.', ch: '..x..x..x.x..x..' },
      }, seq: seq('AAAAAAAF BBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  neon: {
    name: 'Midnight Grid', bpm: 132, gain: 0.95, swing: 0, kit: 'electro', echo: { steps: 3, fb: 0.38, mix: 0.3, lp: 3200 },
    chords: 'Am F C G Am F G G  F G Am Am F G C E'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'pad', vol: 0.75, min: 0, base: 55 },
      { id: 'bass', kind: 'bass', inst: 'synthBass', vol: 0.75, min: 0, base: 36, bars: rep(16, '0 . 0 . 12 . 0 . 0 . 0 . 12 . 0 .') },
      { id: 'arp', kind: 'arp', inst: 'gatedArp', vol: 0.8, min: 0.55, base: 60, echo: 0.3, bars: rep(16, '0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 3') },
      { id: 'lead', kind: 'melody', inst: 'sawLead', vol: 1.6, min: 0.4, echo: 0.4, bars: bars(`
        E5 _ _ _ _ _ A5 _ _ _ C6 _ B5 _ A5 _
        A5 _ _ _ G5 _ F5 _ _ _ . . C5 . F5 .
        G5 _ _ _ _ _ E5 _ _ _ G5 _ C6 _ _ _
        B5 _ _ _ A5 _ G5 _ _ _ D5 . G5 . A5 .
        E6 _ _ _ _ _ C6 _ _ _ A5 _ C6 _ E6 _
        D6 _ _ _ C6 _ A5 _ _ _ F5 _ A5 _ C6 _
        B5 _ _ _ D6 _ G6 _ _ _ D6 _ B5 _ G5 _
        A5 _ _ _ _ _ . . . . . . E5 . A5 .
        C6 . . C6 A5 . F5 . . . A5 . C6 . . .
        D6 . . D6 B5 . G5 . . . B5 . D6 . . .
        E6 . . E6 C6 . A5 . . . C6 . E6 . . .
        A6 _ _ _ G6 _ E6 _ _ _ C6 _ . . E6 .
        C6 . . C6 A5 . F5 . . . A5 . C6 . . .
        D6 . . D6 B5 . G5 . . . B5 . D6 . . .
        E6 _ _ _ G6 _ E6 _ C6 _ _ _ G5 . . .
        G#5 _ _ _ B5 _ E6 _ D6 _ B5 _ G#5 _ B5 .`) },
      { id: 'drums', kind: 'drums', vol: 0.9, min: 0, pats: {
        C: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', cr: 'X...............' },
        A: { k: 'x...x...x...x...', c: '....x.......x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
        B: { k: 'x...x...x...x..x', c: '....x.......x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
        F: { k: 'x...x...x...x...', c: '....x...x.x.xxxx', s: '....x...x.x.xxxx', t1: '............x...', t2: '.............x..', t3: '..............x.' },
      }, seq: seq('CAAAAAAF CBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  volcano: {
    name: 'Magma Run', bpm: 140, gain: 1.0, swing: 0, kit: 'heavy',
    chords: 'Em Em C D Em Em C B  C D Em Em C D B B'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'strings', vol: 0.7, min: 0, base: 48 },
      { id: 'riff', kind: 'bass', inst: 'driveBass', vol: 0.85, min: 0, base: 36, bars: [
        ...rep(3, '0 . 0 0 . 0 . 0 0 . 0 0 . 0 . .'), '0 . 0 0 . 0 . 0 0 . 3 . 5 . 3 .',
        ...rep(3, '0 . 0 0 . 0 . 0 0 . 0 0 . 0 . .'), '0 0 0 0 . 0 . 0 0 . 7 . 5 . 3 .',
        '0 . . 0 . . 0 . . 0 . . 0 . . 0', '0 . . 0 . . 0 . . 0 . . 0 . . 0', '0 . 0 0 . 0 . 0 0 . 0 0 . 0 . .', '0 . 0 0 . 0 . 0 0 . 3 . 5 . 3 .',
        '0 . . 0 . . 0 . . 0 . . 0 . . 0', '0 . . 0 . . 0 . . 0 . . 0 . . 0', '0 . 0 0 . 0 . 0 0 . 0 0 . 0 . .', '0 0 0 0 . 0 . 0 0 . 7 . 5 . 3 .'] },
      { id: 'lead', kind: 'melody', inst: 'sawLead', vol: 1.7, min: 0.4, bars: bars(`
        E5 . . E5 . . G5 . . F#5 . E5 . . . .
        B5 . . A5 . . G5 . F#5 . . G5 . . . .
        E5 . . E5 . . G5 . . E5 . C5 . . . .
        F#5 . . F#5 . . A5 . . F#5 . D5 . . . .
        E5 . . E5 . . G5 . . F#5 . E5 . . . .
        B5 . . B5 . . D6 . . B5 . A5 . . G5 .
        C6 . . B5 . . G5 . . E5 . G5 . . . .
        D#5 . . F#5 . . B5 . . A5 . F#5 . D#5 . .
        G5 _ _ _ E5 _ _ _ C5 _ _ _ E5 _ G5 _
        A5 _ _ _ F#5 _ _ _ D5 _ _ _ F#5 _ A5 _
        B5 _ _ _ G5 _ _ _ E5 _ _ _ G5 _ B5 _
        E6 _ _ _ D6 _ B5 _ G5 _ A5 _ B5 _ . .
        G5 _ _ _ E5 _ _ _ C5 _ _ _ E5 _ G5 _
        A5 _ _ _ F#5 _ _ _ D5 _ _ _ F#5 _ A5 _
        F#5 _ _ _ D#5 _ _ _ B4 _ _ _ D#5 _ F#5 _
        B5 _ _ _ _ _ _ _ A5 . G5 . F#5 . D#5 .`) },
      { id: 'hits', kind: 'stab', inst: 'brass', vol: 0.7, min: 0.7, base: 48, tones: [0, 2], bars: rep(16, 'X . . . . . x . . . . . . . . .') },
      { id: 'drums', kind: 'drums', vol: 0.75, min: 0, pats: {
        C: { k: 'x.x...x.x.x...x.', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', cr: 'X...............' },
        A: { k: 'x.x...x.x.x...x.', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
        B: { k: 'x.xx..x.x.xx..x.', s: '....o...x...o...', h: 'x.x.x.x.x.x.x.x.', o: '..............o.' },
        F: { k: 'x.x...x.x.x...x.', s: '........x...xxxx', tk: 'x...x...x.x.x.x.', t2: '............x...', t3: '..............x.' },
      }, seq: seq('CAAAAAAF CBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  haunted: {
    name: 'Hollow Hymn', bpm: 100, gain: 1.0, swing: 0.05, kit: 'soft', echo: { steps: 6, fb: 0.45, mix: 0.3, lp: 2400 },
    chords: 'Dm Dm Gm A Dm Bb A A  Gm Dm Bb A Gm Dm A Dm'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'strings', vol: 0.7, min: 0, base: 48 },
      { id: 'pedal', kind: 'bass', inst: 'dubBass', vol: 0.7, min: 0, base: 36, bars: rep(16, '0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _') },
      { id: 'lead', kind: 'melody', inst: 'theremin', vol: 0.9, min: 0.4, glide: true, echo: 0.4, bars: bars(`
        D5 _ _ _ _ _ _ _ F5 _ _ _ E5 _ D5 _
        A5 _ _ _ _ _ _ _ G5 _ F5 _ E5 _ _ _
        Bb5 _ _ _ A5 _ G5 _ F5 _ _ _ G5 _ _ _
        A5 _ _ _ C#6 _ _ _ E6 _ _ _ . . . .
        D6 _ _ _ _ _ C#6 _ D6 _ _ _ F6 _ _ _
        D6 _ _ _ _ _ _ _ C6 _ Bb5 _ A5 _ _ _
        C#6 _ _ _ E6 _ _ _ A5 _ _ _ . . . .
        A5 _ _ _ _ _ _ _ _ _ _ _ . . . .
        Bb5 _ _ _ _ _ _ _ A5 _ G5 _ F5 _ _ _
        F5 _ _ _ A5 _ _ _ D6 _ _ _ C6 _ A5 _
        D6 _ _ _ F6 _ _ _ E6 _ D6 _ Bb5 _ _ _
        C#6 _ _ _ E6 _ _ _ A6 _ _ _ . . . .
        Bb5 _ _ _ _ _ A5 _ G5 _ _ _ F5 _ G5 _
        A5 _ _ _ _ _ _ _ F5 _ _ _ D5 _ F5 _
        E5 _ _ _ G5 _ _ _ C#6 _ _ _ E6 _ _ _
        D6 _ _ _ _ _ _ _ _ _ _ _ . . . .`) },
      { id: 'harp', kind: 'arp', inst: 'harpsichord', vol: 0.55, min: 0.55, base: 60, echo: 0.3, bars: rep(16, '0 . 1 . 2 . 1 . 0 . 1 . 2 . 3 .') },
      { id: 'drums', kind: 'drums', vol: 1.6, min: 0, pats: {
        A: { hb: 'x.......x.......', sh: '..x...x...x...x.' },
        B: { hb: 'x.......x...x...', sh: '..x...x...x...x.', rim: '............x...' },
        F: { hb: 'x...x...x...x...', sh: 'x.x.x.x.x.x.x.x.', rim: '..............xx' },
      }, seq: seq('AAAAAAAF BBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  space: {
    name: 'Starlight Spiral', bpm: 136, gain: 0.95, swing: 0, kit: 'electro', echo: { steps: 3, fb: 0.42, mix: 0.34, lp: 4200 },
    chords: 'Cmaj7 D Cmaj7 D Em7 D Cmaj7 G  Am7 G Cmaj7 D Em7 D Cmaj7 D'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'pad', vol: 0.7, min: 0, base: 55 },
      { id: 'bass', kind: 'bass', inst: 'synthBass', vol: 0.76, min: 0, base: 36, bars: rep(16, '0 . 0 . 12 . 0 . 0 . 0 . 12 . 7 .') },
      { id: 'arp', kind: 'arp', inst: 'glass', vol: 0.75, min: 0.3, base: 72, echo: 0.4, bars: [...rep(8, '0 1 2 3 2 1 2 3 0 1 2 3 2 1 2 1'), ...rep(8, '0 2 1 3 0 2 1 3 4 3 2 1 4 3 2 1')] },
      { id: 'lead', kind: 'melody', inst: 'sawLead', vol: 1.5, min: 0.5, glide: true, echo: 0.45, bars: bars(`
        E5 _ _ _ G5 _ B5 _ _ _ . . D6 _ _ _
        F#5 _ _ _ A5 _ D6 _ _ _ . . F#6 _ _ _
        G5 _ _ _ B5 _ E6 _ _ _ D6 _ B5 _ G5 _
        A5 _ _ _ F#5 _ D6 _ _ _ . . A5 _ _ _
        B5 _ _ _ G5 _ E6 _ _ _ . . B5 _ _ _
        A5 _ _ _ F#5 _ D6 _ _ _ F#6 _ A6 _ _ _
        E6 _ _ _ D6 _ B5 _ G5 _ B5 _ E6 _ _ _
        D6 _ _ _ B5 _ G5 _ D5 _ G5 _ B5 _ D6 _
        C6 _ _ _ E6 _ A6 _ _ _ G6 _ E6 _ C6 _
        B5 _ _ _ D6 _ G6 _ _ _ F#6 _ D6 _ B5 _
        E6 _ _ _ G6 _ B6 _ _ _ . . G6 _ E6 _
        F#6 _ _ _ A6 _ D7 _ _ _ . . A6 _ F#6 _
        G6 _ _ _ B6 _ E7 _ _ _ D7 _ B6 _ G6 _
        A6 _ _ _ F#6 _ D6 _ A5 _ D6 _ F#6 _ A6 _
        G6 _ _ _ E6 _ C6 _ G5 _ C6 _ E6 _ G6 _
        A6 _ _ _ _ _ F#6 _ _ _ D6 _ A5 _ D6 _`) },
      { id: 'drums', kind: 'drums', vol: 0.9, min: 0, pats: {
        C: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', cr: 'X...............' },
        A: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
        B: { k: 'x...x...x...x...', c: '....x.......x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', o: '..x...x...x...x.', sh: 'xxxxxxxxxxxxxxxx' },
        F: { k: 'x...x...x...x...', c: '....x...x.x.xxxx', t1: '............x...', t2: '.............x..', t3: '..............x.' },
      }, seq: seq('CAAAAAAF CBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  menu: {
    name: 'Garage Groove', bpm: 108, gain: 0.7, swing: 0.2, kit: 'soft',
    chords: 'Cmaj7 Am7 Dm7 G7 Cmaj7 Em7 Fmaj7 G7  Am7 Dm7 G7 Cmaj7 Fmaj7 Em7 Dm7 G7'.split(/\s+/),
    tracks: [
      { id: 'comp', kind: 'stab', inst: 'epiano', vol: 0.4, min: 0, base: 48, tones: [0, 1, 2, 3], bars: rep(16, 'x . . x . . x . . . x . . . . .') },
      { id: 'bass', kind: 'bass', inst: 'pickBass', vol: 0.85, min: 0, base: 36, bars: rep(16, '0 . . . . . 7 . . . 4 . . . 7 .') },
      { id: 'lead', kind: 'melody', inst: 'bell', vol: 1.25, min: 0.3, bars: bars(`
        E5 . . G5 . . B5 . . . A5 . G5 . . .
        E5 . . A5 . . C6 . . . B5 . A5 . . .
        D5 . . F5 . . A5 . . . G5 . F5 . . .
        D5 . . G5 . . B5 . . . D6 . B5 . G5 .
        E5 . . G5 . . B5 . . . C6 . B5 . . .
        G5 . . B5 . . D6 . . . C6 . B5 . . .
        A5 . . C6 . . E6 . . . D6 . C6 . A5 .
        B5 _ _ _ . . D6 . . . F6 . D6 . B5 .
        C6 . . E6 . . A6 . . . G6 . E6 . . .
        D6 . . F6 . . A6 . . . G6 . F6 . . .
        B5 . . D6 . . G6 . . . F6 . D6 . . .
        E6 _ _ _ . . G6 . . . E6 . C6 . . .
        A5 . . C6 . . F6 . . . E6 . C6 . A5 .
        G5 . . B5 . . E6 . . . D6 . B5 . . .
        F5 . . A5 . . D6 . . . C6 . A5 . F5 .
        G5 . . B5 . . D6 . . . G6 _ _ _ . .`) },
      { id: 'drums', kind: 'drums', vol: 1.05, min: 0, pats: {
        A: { k: 'x.....x...x.....', rim: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.' },
        B: { k: 'x.....x...x...x.', rim: '....x.......x...', sh: 'x.x.x.x.x.x.x.x.', h: '..x...x...x...x.' },
        F: { k: 'x.....x...x.....', rim: '....x...x.x.x.xx', sh: 'x.x.x.x.x.x.x.x.' },
      }, seq: seq('AAAAAAAF BBBBBBBF') },
    ],
  },

  // =====================================================================================================================
  results: {
    name: 'Podium Parade', bpm: 120, gain: 1.0, swing: 0, kit: 'pop',
    chords: 'G C D G Em C D G  C D Bm Em C D G G'.split(/\s+/),
    tracks: [
      { id: 'pad', kind: 'pad', inst: 'strings', vol: 0.7, min: 0, base: 55 },
      { id: 'bass', kind: 'bass', inst: 'pickBass', vol: 0.8, min: 0, base: 36, bars: rep(16, '0 . . 0 . . 7 . 0 . . 12 . . 7 .') },
      { id: 'lead', kind: 'melody', inst: 'brass', vol: 1.35, min: 0, bars: bars(`
        G5 . . B5 . . D6 . . . G6 _ _ _ . .
        E6 . . D6 . . C6 . . . E6 _ _ _ . .
        F#6 . . A6 . . F#6 . . . D6 . E6 . F#6 .
        G6 _ _ _ . . D6 . B5 . D6 . G6 _ _ _
        E6 . . G6 . . B6 . . . A6 . G6 . E6 .
        E6 . . C6 . . G5 . . . C6 . E6 . G6 .
        A6 . . F#6 . . D6 . . . A5 . D6 . F#6 .
        G6 _ _ _ _ _ . . D6 . G6 . B6 _ _ _
        C6 . E6 . G6 . E6 . C6 . E6 . G6 . C7 .
        D6 . F#6 . A6 . F#6 . D6 . F#6 . A6 . D7 .
        B5 . D6 . F#6 . D6 . B5 . D6 . F#6 . B6 .
        E6 . G6 . B6 . G6 . E6 . G6 . B6 . E7 .
        E6 . . D6 . . C6 . . . D6 . E6 . G6 .
        F#6 . . E6 . . D6 . . . E6 . F#6 . A6 .
        G6 _ _ _ D6 _ _ _ B5 _ _ _ D6 _ G6 _
        G6 _ _ _ _ _ _ _ . . . . . . . .`) },
      { id: 'sparkle', kind: 'arp', inst: 'chime', vol: 1.0, min: 0.2, base: 72, bars: rep(16, '0 . 2 . 1 . 2 . 0 . 2 . 1 . 2 .') },
      { id: 'drums', kind: 'drums', vol: 0.9, min: 0, pats: {
        C: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.X.x.X.x.X.x.X.', cr: 'X...............' },
        A: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.X.x.X.x.X.x.X.' },
        F: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: 'x.X.x.X.x.X.x...' },
      }, seq: seq('CAAAAAAF CAAAAAAF') },
    ],
  },
};

export const SONG_KEYS = Object.keys(SONGS);

/** Check structure: 16 bars, 16 tokens per bar, valid chords/notes.  Returns a list of problems (empty = fine). */
export function validateSongs(parseChord, noteToMidi) {
  const problems = [];
  for (const [key, s] of Object.entries(SONGS)) {
    if (s.chords.length !== 16) problems.push(`${key}: ${s.chords.length} chords (need 16)`);
    for (const c of s.chords) { try { parseChord(c); } catch (e) { problems.push(`${key}: ${e.message}`); } }
    for (const tr of s.tracks) {
      if (tr.kind === 'drums') {
        const used = new Set(tr.seq);
        for (const k of used) if (!tr.pats[k]) problems.push(`${key}/${tr.id}: pattern ${k} missing`);
        if (tr.seq.length !== 16) problems.push(`${key}/${tr.id}: seq has ${tr.seq.length} bars`);
        for (const [pk, pat] of Object.entries(tr.pats)) for (const [v, str] of Object.entries(pat)) if (str.length !== 16) problems.push(`${key}/${tr.id}/${pk}.${v}: ${str.length} chars`);
        continue;
      }
      if (!tr.bars && tr.kind !== 'pad') problems.push(`${key}/${tr.id}: no bars`);
      (tr.bars ?? []).forEach((b, i) => {
        const toks = b.replace(/\|/g, ' ').trim().split(/\s+/);
        if (toks.length !== 16) problems.push(`${key}/${tr.id} bar ${i + 1}: ${toks.length} tokens`);
        if (tr.kind === 'melody') for (const t of toks) if (t !== '.' && t !== '_' && noteToMidi(t) === null) problems.push(`${key}/${tr.id} bar ${i + 1}: bad note ${t}`);
      });
      if (tr.bars && tr.bars.length !== 16 && tr.bars.length !== 1 && 16 % tr.bars.length) problems.push(`${key}/${tr.id}: ${tr.bars.length} bars does not tile 16`);
    }
  }
  return problems;
}
