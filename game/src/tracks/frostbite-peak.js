// FROSTBITE PEAK (Blossom Cup 3) - twilight on a snowy mountain.  Summit straight past the lodge, a five-hairpin switchback descent,
// an icy valley floor (slippery ice patches) and a long climb back up.  Clockwise.  Difficulty 2.
export const frostbitePeak = {
  id: 'frostbite-peak',
  name: 'Frostbite Peak',
  cup: 'blossom',
  theme: 'snow',
  music: 'snow',
  laps: 3,
  difficulty: 2,
  description: 'Switchbacks down the glacier, slick ice at the bottom, and the aurora overhead.',
  width: 17,
  shoulder: 5,
  shoulderSurface: 3, // Surface.SNOW
  palette: { skyTop: '#0b1d52', skyHorizon: '#9cc6ff', ground: '#eef4ff', accent: '#7ee8ff', ui: { primary: '#5cc8ff', secondary: '#c8a0ff' } },
  layout: {
    width: 17,
    start: { at: 'N0', offset: 150 },
    v: [
      // the five switchbacks: U-turns made of two 90 deg corners (R 27), legs 57 m apart (>= 2R + a little straight)
      { id: 'N0', x: -195, z: -175, r: 62, y: -1, w: 19, bank: 4 },
      { id: 'V1', x: 205, z: -175, r: 27, y: -1, bank: 6 },
      { id: 'V2', x: 205, z: -118, r: 27, y: -4, bank: 6 },
      { id: 'V3', x: 60, z: -118, r: 27, y: -8, bank: 6 },
      { id: 'V4', x: 60, z: -61, r: 27, y: -11, bank: 6 },
      { id: 'V5', x: 205, z: -61, r: 27, y: -15, bank: 6 },
      { id: 'V6', x: 205, z: -4, r: 27, y: -18, bank: 6 },
      { id: 'V7', x: 60, z: -4, r: 27, y: -22, bank: 6 },
      { id: 'V8', x: 60, z: 53, r: 27, y: -25, bank: 6 },
      { id: 'V9', x: 205, z: 53, r: 27, y: -29, bank: 6 },
      { id: 'V10', x: 205, z: 110, r: 27, y: -33, bank: 6 },
      { id: 'V11', x: -30, z: 135, r: 120, y: -34, bank: 2 },
      { id: 'V12', x: -190, z: 115, r: 75, y: -29, bank: 5 },
      { id: 'V13', x: -230, z: 10, r: 110, y: -18, bank: 4 },
    ],
  },
  zones: [
    { type: 'boost', at: 'N0>', offset: 170, length: 14, lateral: 0, width: 6 },
    { type: 'ice', at: 'V10>', offset: 70, length: 60, lateral: -1, width: 12 },
    { type: 'ice', at: 'V10>', offset: 168, length: 46, lateral: 2, width: 11 },
    { type: 'boost', at: 'V12', offset: 20, length: 14, lateral: 0, width: 5 },
    { type: 'ice', at: 'V5>', offset: 24, length: 34, lateral: 3, width: 9 },
  ],
  // coin trails (data only: the item system draws/collects track.coins); `arch` lifts the middle of a line (air coins over jumps), `weave` is a sine slalom
  coinLines: [
    { at: 'N0>', offset: 40, count: 8, spacing: 7, lateral: 0, weave: 3 },
    { at: 'V2>', offset: 4, count: 6, spacing: 5, lateral: 0 },
    { at: 'V6>', offset: 4, count: 6, spacing: 5, lateral: 0 },
    { at: 'V10>', offset: 12, count: 8, spacing: 6, lateral: -3, lateralTo: 3 },
    { at: 'V13>', offset: 10, count: 8, spacing: 6, lateral: 2 },
  ],
};
