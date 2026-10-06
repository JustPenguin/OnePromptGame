// STARLIGHT SPIRAL (Starlight Cup 4, the finale) - a ribbon of light through deep space.  The road climbs a 1.5-turn spiral around a
// glowing star (wall-less, banked, rainbow edge glow), launches over a gap at the summit and dives back to the start line, passing
// OVER the spiral turns it crossed on the way up.  Fall off the edge and the rescue drone brings you back.  Difficulty 3.
import { turtleVertices } from './layout.js';

const R0 = 190, R1 = 78, TURNS = 12, ARC = 45;
const coilSteps = [];
for (let k = 0; k < TURNS; k++) {
  const u = k / (TURNS - 1);
  coilSteps.push({ id: `c${k}`, turn: ARC, r: R0 + (R1 - R0) * u, y: 3 + 40 * Math.pow(u, 0.92), bank: 9 });
  if (k < TURNS - 1) coilSteps.push({ straight: 1.6 });
}
const coil = turtleVertices({ x: 0, z: 0, heading: 0 }, coilSteps);
const e = coil.end;                                   // after 540 degrees the heading is 180: due north (-Z)
const E0 = { id: 'E0', x: e.x, z: e.z - 215, r: 62, y: 43, bank: 6 };            // top: left turn (west)
const E1 = { id: 'E1', x: 0, z: e.z - 215, r: 62, y: 24, bank: 8 };              // left turn (south) into the start straight

export const starlightSpiral = {
  id: 'starlight-spiral',
  name: 'Starlight Spiral',
  cup: 'starlight',
  theme: 'space',
  music: 'starlight',
  laps: 3,
  difficulty: 3,
  description: 'A ribbon of light through the stars: climb the spiral, leap the gap and trust the glow. No walls.',
  width: 19,
  shoulder: 0,
  shoulderSurface: 0, // Surface.ROAD: the 2 m energy band past the edge is drivable; beyond it you fall
  palette: { skyTop: '#04010f', skyHorizon: '#3a1a7a', ground: '#04010f', accent: '#ff3dcb', ui: { primary: '#b86bff', secondary: '#22d3ff' } },
  layout: {
    width: 19,
    shoulder: 0,
    start: { at: 'E1', offset: 110 },
    v: [
      ...coil.vertices,
      { ...E0 },
      { ...E1 },
    ],
  },
  zones: [
    { type: 'boost', at: 'E1>', offset: 40, length: 14, lateral: 0, width: 6 },
    // the summit leap: boost pad -> ramp -> 26 m of nothing (too slow and you fall to the rescue drone)
    { type: 'boost', at: 'c11>', offset: 20, length: 14, lateral: 0, width: 6 },
    { type: 'ramp', at: 'c11>', offset: 70, length: 12, height: 4.0, lateral: 0, width: 19 },
    { type: 'gap', at: 'c11>', offset: 82, length: 21, width: 200 },
    { type: 'boost', at: 'E0>', offset: 20, length: 14, lateral: 0, width: 6 },
  ],
  openEdges: [{ s0: 0, s1: 1e6, side: 'both' }],
  // coin trails (data only: the item system draws/collects track.coins); `arch` lifts the middle of a line (air coins over jumps), `weave` is a sine slalom
  coinLines: [
    { at: 'E1>', offset: 30, count: 8, spacing: 7, lateral: 0, weave: 3 },
    { at: 'c2>', offset: 30, count: 8, spacing: 7, lateral: 0 },
    { at: 'c6>', offset: 20, count: 7, spacing: 6, lateral: 0, weave: 2.5 },
    { at: 'c11>', offset: 72, count: 9, spacing: 4.4, lateral: 0, lift: 1.3, arch: 3.6 },
    { at: 'E0>', offset: 40, count: 7, spacing: 7, lateral: 0 },
  ],
};
