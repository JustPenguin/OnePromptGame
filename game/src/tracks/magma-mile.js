// MAGMA MILE (Starlight Cup 2) - a volcano at dusk.  A basalt start straight beside a lava lake with fire geysers, a banked climb up the
// flank, a crater-rim hairpin, the NARROW BRIDGE (10 m wide, no walls - miss the road and the rescue drone fetches you) across the lava
// and a canyon descent.  Counter-clockwise.  Difficulty 3.
export const magmaMile = {
  id: 'magma-mile',
  name: 'Magma Mile',
  cup: 'starlight',
  theme: 'volcano',
  music: 'volcano',
  laps: 3,
  difficulty: 3,
  description: 'Race the lava flow up the volcano, hold your nerve on the narrow bridge and dive into the canyon.',
  width: 17,
  shoulder: 4.5,
  palette: { skyTop: '#1a0608', skyHorizon: '#ff6a1a', ground: '#2a2224', accent: '#ff6a1a', ui: { primary: '#ff4a1a', secondary: '#ffd23f' } },
  layout: {
    width: 17,
    shoulder: 4.5,
    start: { at: 'S', offset: 120 },
    v: [
      { id: 'S', x: -210, z: 260, r: 80, y: 0, w: 20 },
      { id: 'A', x: 270, z: 260, r: 90, y: 0, bank: 4 },
      { id: 'B1', x: 300, z: 110, r: 70, y: 3, bank: 5 },
      { id: 'B2', x: 235, z: -15, r: 55, y: 9, bank: 6 },
      { id: 'B3', x: 330, z: -125, r: 42, y: 14, bank: 6 },
      // C> is the bridge straight: neck down to 10 m with no shoulder for ~110 m, then flare back out
      { id: 'C', x: 120, z: -185, r: 45, y: 19, bank: 5, keys: [{ at: 36, w: 17, sh: 4.5 }, { at: 62, w: 10, sh: 0 }, { at: 168, w: 10, sh: 0 }, { at: 194, w: 17, sh: 4.5 }] },
      { id: 'D', x: -135, z: -235, r: 32, y: 21, bank: 7 },
      { id: 'E', x: -255, z: -125, r: 34, y: 14, bank: 7 },
      { id: 'E2', x: -200, z: -15, r: 30, y: 9, bank: 6 },
      { id: 'F', x: -295, z: 85, r: 45, y: 4, bank: 5 },
    ],
  },
  zones: [
    { type: 'boost', at: 'S>', offset: 200, length: 14, lateral: 0, width: 6 },
    { type: 'boost', at: 'B3>', offset: 40, length: 14, lateral: -2, width: 5 },
    { type: 'boost', at: 'D>', offset: 14, length: 14, lateral: 0, width: 5 },
  ],
  // no walls on the bridge: the physics lets a kart roll 2 m past the road edge (sh = 0) before it falls
  openEdges: [{ at: 'C>', offset: 58, length: 114, side: 'both' }],
};
