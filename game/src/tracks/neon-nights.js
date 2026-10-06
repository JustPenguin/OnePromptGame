// NEON NIGHTS (Starlight Cup 1) - a rain-slick night city.  A figure-8: the road crosses ITSELF on a banked viaduct (8.5 m above the
// street-level pass), runs through a lit tunnel, hops a ramp, snakes through a plaza chicane and a tight hairpin.  Difficulty 2.
// Layout corners sit on the 80 m city grid (the world recipe's streets/lots use the same grid).  The east lobe is driven clockwise,
// the west lobe counter-clockwise; the crossing is at (0,0).
export const neonNights = {
  id: 'neon-nights',
  name: 'Neon Nights',
  cup: 'starlight',
  theme: 'neon',
  music: 'neon',
  laps: 3,
  difficulty: 2,
  description: 'Rain-slick boulevards, a tunnel of light and a figure-8 flyover. Do not blink.',
  width: 18,
  shoulder: 4,
  palette: { skyTop: '#07041c', skyHorizon: '#3a1366', ground: '#120a2a', accent: '#ff3dcb', ui: { primary: '#ff3dcb', secondary: '#22d3ff' } },
  layout: {
    width: 18,
    shoulder: 4,
    start: { at: 'W3', offset: 62 },
    v: [
      { id: 'W3', x: -240, z: 0, r: 75, y: 0, w: 20, bank: 0 },
      { id: 'E1', x: 240, z: 0, r: 75, y: 0, bank: 4 },
      { id: 'E2', x: 240, z: 320, r: 66, y: 0, bank: 5 },
      { id: 'E3', x: 0, z: 320, r: 66, y: 0, bank: 5 },
      { id: 'Ob', x: 0, z: 110, r: 0, y: 8.5 },
      { id: 'Oa', x: 0, z: -110, r: 0, y: 8.5 },
      { id: 'W1', x: 0, z: -320, r: 66, y: 0, bank: 5 },
      { id: 'W2', x: -240, z: -320, r: 36, y: 0, bank: 7 },
      { id: 'C1', x: -200, z: -205, r: 58, y: 0, bank: 4 },
      { id: 'C2', x: -290, z: -105, r: 58, y: 0, bank: 4 },
    ],
  },
  zones: [
    { type: 'boost', at: 'W3>', offset: 142, length: 14, lateral: 0, width: 6 },
    { type: 'boost', at: 'E2>', offset: 12, length: 14, lateral: 0, width: 6 },
    { type: 'ramp', at: 'E2>', offset: 64, length: 11, height: 2.2, lateral: 0, width: 18 },
  ],
  // coin trails (data only: the item system draws/collects track.coins); `arch` lifts the middle of a line (air coins over jumps), `weave` is a sine slalom
  coinLines: [
    { at: 'W3>', offset: 40, count: 8, spacing: 7, lateral: 0, weave: 3 },
    { at: 'E1>', offset: 70, count: 8, spacing: 8, lateral: 0 },
    { at: 'E2>', offset: 60, count: 5, spacing: 4.2, lateral: 0, lift: 1.2, arch: 2.0 },
    { at: 'Ob>', offset: 30, count: 10, spacing: 8, lateral: 0, weave: 3 },
    { at: 'W1>', offset: 10, count: 6, spacing: 6, lateral: 2 },
  ],
};
