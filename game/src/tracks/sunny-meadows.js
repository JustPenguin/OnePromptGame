// Track DEFINITION = pure data.  The runtime (SplineTrack) turns it into geometry + queries.
// points: [x, y, z, width?, bankDeg?]  (closed loop, first point = start/finish line, road runs toward point 1)
// zones:  [{ type: 'boost'|'ramp'|'ice'|'mud'|'sand'|'water', s, length, lateral?, width, height? }]  (s = metres from the line)
// This one is the BASELINE oval-ish loop; Agent B turns it into the real "Sunny Meadows" and adds the other 7 courses.
export const sunnyMeadows = {
  id: 'sunny-meadows',
  name: 'Sunny Meadows',
  cup: 'blossom',
  theme: 'meadow',
  music: 'meadow',
  laps: 3,
  difficulty: 1,
  description: 'Rolling green hills and a lazy windmill. A friendly first lap.',
  width: 16,
  shoulder: 6,
  palette: { skyTop: '#3d8bff', skyHorizon: '#cfe9ff', ground: '#5da13a', accent: '#ffd23f' },
  points: [
    [0, 0, 0], [0, 0, 140], [20, 0.5, 250, 16, -2], [90, 1.5, 330, 16, -6], [190, 2.5, 350, 16, -6],
    [270, 3, 300, 16, -6], [300, 3, 200], [260, 2, 110], [180, 1, 70], [150, 0.5, -10, 13, 4],
    [190, 0, -90, 13, 3], [170, 0, -190], [90, 0, -250, 16, -4], [-10, 0, -230, 16, -4], [-80, 0, -200, 14],
    [-35, 0, -140, 15], [0, 0, -80, 16],
  ],
  zones: [
    { type: 'boost', s: 190, length: 12, lateral: 0, width: 5 },
    { type: 'boost', s: 900, length: 12, lateral: -3, width: 4 },
  ],
};
