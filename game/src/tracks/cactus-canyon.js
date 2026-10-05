// CACTUS CANYON (Blossom Cup 2) - desert sunset.  Open sand flats, a cactus garden esse, a ramp jump over a chasm, a narrow canyon squeeze
// under a sandstone arch, and a tight hairpin around a mesa.  Counter-clockwise (left-hand corners dominate).  Difficulty 2.
// Markers (corner ids; "X>" = the straight leaving X) place everything: boost, ramp + gap, canyon squeeze, arch, item rows.
export const cactusCanyon = {
  id: 'cactus-canyon',
  name: 'Cactus Canyon',
  cup: 'blossom',
  theme: 'canyon',
  music: 'desert',
  laps: 3,
  difficulty: 2,
  description: 'Sun-baked sandstone, a daring jump over the chasm and a squeeze under the great arch.',
  width: 17,
  shoulder: 5,
  shoulderSurface: 2, // Surface.SAND
  palette: { skyTop: '#16486e', skyHorizon: '#ffb072', ground: '#d9965a', accent: '#ff7a1a', ui: { primary: '#ff8a2a', secondary: '#27c3b4' } },
  layout: {
    width: 17,
    start: { at: 'T', offset: 110 },
    v: [
      { id: 'T', x: -285, z: -150, r: 100, y: 0, w: 19, bank: 4 },
      { id: 'A', x: -285, z: 245, r: 100, y: 2, bank: 5, w: 17 },
      { id: 'B', x: -120, z: 290, r: 85, y: 6, bank: 4 },
      { id: 'C', x: 15, z: 228, r: 85, y: 7, bank: 5 },
      { id: 'D', x: 170, z: 280, r: 110, y: 3 },
      { id: 'E', x: 355, z: 255, r: 66, y: 0, bank: 6, sh: 5 },
      { id: 'F', x: 365, z: 70, r: 85, y: -6, bank: 4, w: 14, sh: 2.4 },
      { id: 'G', x: 335, z: -75, r: 85, y: -8, bank: 4, w: 14, sh: 2.4 },
      { id: 'H', x: 355, z: -195, r: 26, y: -2, bank: 7, w: 16, sh: 4.5 },
      { id: 'I', x: 210, z: -135, r: 85, y: 4, bank: 5 },
      { id: 'J', x: 50, z: -210, r: 100, y: 8, bank: 4 },
    ],
  },
  zones: [
    { type: 'boost', at: 'T>', offset: 130, length: 14, lateral: 0, width: 6 },
    { type: 'boost', at: 'A>', offset: 40, length: 14, lateral: 2, width: 5 },
    // the big jump: a ramp, then 15 m of nothing (chasm), then road again.  Karts that arrive too slowly fall and are rescued.
    { type: 'ramp', at: 'J>', offset: 64, length: 12, height: 3.2, lateral: 0, width: 17 },
    { type: 'gap', at: 'J>', offset: 76, length: 14, width: 120 },
  ],
};
