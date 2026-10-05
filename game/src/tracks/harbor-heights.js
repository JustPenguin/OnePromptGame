// HARBOR HEIGHTS (Blossom Cup 4) - golden-hour tropical harbour.  A waterfront promenade, a drawbridge jump over the harbour channel,
// a cliff road past the lighthouse, a whitewashed hill town and the container dockyard.  Counter-clockwise, sea to the south and east.
// Difficulty 2.
export const harborHeights = {
  id: 'harbor-heights',
  name: 'Harbor Heights',
  cup: 'blossom',
  theme: 'harbor',
  music: 'harbor',
  laps: 3,
  difficulty: 2,
  description: 'Leap the drawbridge, hug the cliffs under the lighthouse and race the golden sunset.',
  width: 17,
  shoulder: 5.5,
  shoulderSurface: 2, // Surface.SAND (beach)
  palette: { skyTop: '#2a7fd0', skyHorizon: '#ffd9a0', ground: '#ffd098', accent: '#ff9a3a', ui: { primary: '#22c8c0', secondary: '#ff9a3a' } },
  layout: {
    width: 17,
    start: { at: 'S0', offset: 90 },
    v: [
      { id: 'S0', x: -250, z: 235, r: 90, y: 1.6, w: 19, bank: 3 },
      { id: 'S1', x: 100, z: 248, r: 160, y: 1.8, w: 18 },
      { id: 'E', x: 320, z: 235, r: 70, y: 2.2, bank: 6 },
      { id: 'F', x: 345, z: 90, r: 120, y: 7, bank: 3 },
      { id: 'G', x: 315, z: -45, r: 100, y: 14, bank: 4 },
      { id: 'H', x: 345, z: -175, r: 50, y: 20, bank: 7 },
      { id: 'I', x: 205, z: -205, r: 70, y: 24, bank: 5 },
      { id: 'J', x: 85, z: -140, r: 62, y: 20, bank: 5 },
      { id: 'K', x: -60, z: -215, r: 95, y: 15, bank: 4 },
      { id: 'L', x: -240, z: -185, r: 80, y: 9, bank: 4 },
      { id: 'M', x: -308, z: -85, r: 46, y: 6, bank: 5 },
      { id: 'N', x: -240, z: 35, r: 46, y: 3.4, bank: 5 },
    ],
  },
  zones: [
    { type: 'boost', at: 'S0>', offset: 110, length: 14, lateral: 0, width: 6 },
    // drawbridge: the raised leaf is the ramp, the opening is the gap, then the lowered leaf
    { type: 'ramp', at: 'S1>', offset: 52, length: 12, height: 3.0, lateral: 0, width: 17 },
    { type: 'gap', at: 'S1>', offset: 64, length: 14, width: 120 },
    { type: 'boost', at: 'G', offset: 10, length: 14, lateral: 2, width: 5 },
    { type: 'boost', at: 'L>', offset: 20, length: 14, lateral: -2, width: 5 },
  ],
};
