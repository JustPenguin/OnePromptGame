// SPOOKY HOLLOW (Starlight Cup 3) - a haunted forest under a huge moon.  A narrow, twisting road through gnarled trees, a covered bridge
// over the swamp, a graveyard straight, a climb past the mansion on the hill and a hairpin back into the dark.  Counter-clockwise.
// Difficulty 3 (narrow: 14 m).
export const spookyHollow = {
  id: 'spooky-hollow',
  name: 'Spooky Hollow',
  cup: 'starlight',
  theme: 'haunted',
  music: 'haunted',
  laps: 3,
  difficulty: 3,
  description: 'Twisting forest road, a covered bridge over the swamp and a very hungry mansion.',
  width: 14,
  shoulder: 3.5,
  palette: { skyTop: '#05061a', skyHorizon: '#2a3a5a', ground: '#14201c', accent: '#8bff6a', ui: { primary: '#9a5cff', secondary: '#8bff6a' } },
  layout: {
    width: 14,
    shoulder: 3.5,
    start: { at: 'P0', offset: 20 },
    v: [
      { id: 'P0', x: -145, z: 263, r: 60, y: 0, w: 16 },
      { id: 'P1', x: 180, z: 263, r: 55, y: 0, bank: 4 },
      { id: 'P2', x: 302, z: 123, r: 44, y: 3, bank: 5 },
      { id: 'P3', x: 230, z: -28, r: 40, y: 6, bank: 5 },
      { id: 'P4', x: 342, z: -151, r: 38, y: 9, bank: 6 },
      { id: 'P5', x: 134, z: -263, r: 45, y: 14, bank: 5 },
      { id: 'P6', x: -67, z: -230, r: 30, y: 18, bank: 7 },
      { id: 'P7', x: -39, z: -90, r: 30, y: 14, bank: 6 },
      { id: 'P8', x: -213, z: -134, r: 30, y: 9, bank: 6 },
      { id: 'P9', x: -300, z: 20, r: 40, y: 5, bank: 5 },
      { id: 'P9b', x: -232, z: 98, r: 36, y: 3, bank: 5 },
      { id: 'P10', x: -295, z: 180, r: 40, y: 1, bank: 5 },
    ],
  },
  zones: [
    { type: 'boost', at: 'P0>', offset: 100, length: 14, lateral: 0, width: 5 },
    { type: 'boost', at: 'P5>', offset: 24, length: 14, lateral: 0, width: 5 },
  ],
};
