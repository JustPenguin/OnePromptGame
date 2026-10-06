// SUNNY MEADOWS (Blossom Cup 1) - the friendly first lap.  Wide forgiving sweepers, gentle banking, a flowing esse over a crest,
// a wooden bridge over the stream, a windmill hill and a sunflower chicane.  Difficulty 1.
// Track DEFINITION = data.  The layout is a fillet polygon compiled to control points (src/tracks/layout.js); the scenery
// recipe is src/world/recipes/sunny-meadows.js.  Zones / item rows are placed by marker so they follow the layout when edited.
export const sunnyMeadows = {
  id: 'sunny-meadows',
  name: 'Sunny Meadows',
  cup: 'blossom',
  theme: 'meadow',
  music: 'meadow',
  laps: 3,
  difficulty: 1,
  description: 'Rolling green hills, a babbling stream and a lazy windmill. A friendly first lap.',
  width: 18,
  shoulder: 6,
  palette: { skyTop: '#3d8bff', skyHorizon: '#cfe9ff', ground: '#5da13a', accent: '#ffd23f', ui: { primary: '#5fd35a', secondary: '#ffd23f' } },
  layout: {
    width: 18,
    start: { at: 'T', offset: 100 },
    v: [
      { id: 'T', x: 335, z: -175, r: 115, y: 0, w: 20, bank: 4 },
      { id: 'A', x: 335, z: 245, r: 105, y: 4, bank: 5, w: 18 },
      { id: 'B', x: 190, z: 318, r: 95, y: 8, bank: 4 },
      { id: 'C', x: 40, z: 270, r: 95, y: 7, bank: 5 },
      { id: 'D', x: -120, z: 345, r: 80, y: 2, bank: 4 },
      { id: 'E', x: -345, z: 285, r: 52, y: 0.5, bank: 6 },
      { id: 'F', x: -300, z: 90, r: 70, y: 6, bank: 4 },
      { id: 'G', x: -340, z: -40, r: 60, y: 10, bank: 3 },
      { id: 'H', x: -230, z: -150, r: 70, y: 8, bank: 3 },
      { id: 'I', x: -60, z: -150, r: 90, y: 5, bank: 4 },
      { id: 'J', x: 110, z: -225, r: 110, y: 3, bank: 4 },
    ],
  },
  zones: [
    { type: 'boost', at: 'T>', offset: 120, length: 14, lateral: 0, width: 6 },
  ],
  // coin trails (data only: the item system draws/collects track.coins); `arch` lifts the middle of a line (air coins over jumps), `weave` is a sine slalom
  coinLines: [
    { at: 'T>', offset: 50, count: 8, spacing: 7, lateral: 0, weave: 3.5 },
    { at: 'A>', offset: 30, count: 6, spacing: 6, lateral: -4, lateralTo: 4 },
    { at: 'C>', offset: 10, count: 8, spacing: 6, lateral: 0, weave: 2.5 },
    { at: 'D>', offset: 50, count: 8, spacing: 6, lateral: 0 },
    { at: 'F>', offset: 5, count: 6, spacing: 6, lateral: 3 },
    { at: 'I>', offset: 10, count: 8, spacing: 7, lateral: -3, lateralTo: 3 },
  ],
};
