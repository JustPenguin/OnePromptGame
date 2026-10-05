// Dev/QA aid: `?mocktracks=1` pads the registry with 7 stand-in courses (2 cups x 4) so menu layouts (cup cards, track grids,
// locks, records) can be reviewed before Agent B's real tracks land.  Inert unless the URL flag is present and the registry
// still has a single track.  OWNER: Agent E.
import { TRACK_DEFS, CUPS } from '../tracks/index.js';
import { param } from '../core/params.js';

const SPECS = [
  ['cactus-canyon', 'Cactus Canyon', 'blossom', 'desert', 2, '#ff7a3d', '#1fb6c9', '#f0b15a', 'A desert sunset, sandstone arches and a daring jump over the gap.'],
  ['frostbite-peak', 'Frostbite Peak', 'blossom', 'snow', 2, '#6fb7ff', '#e6f3ff', '#9fd2ff', 'Snowy pines, icy patches and a long downhill hairpin run.'],
  ['harbor-heights', 'Harbor Heights', 'blossom', 'harbor', 3, '#ffb347', '#17c3b2', '#f2d9a0', 'Golden hour on the docks. Watch out for the drawbridge.'],
  ['neon-nights', 'Neon Nights', 'starlight', 'neon', 2, '#ff3dcb', '#22d3ff', '#1a1d4a', 'A glowing city after dark with a looping overpass.'],
  ['magma-mile', 'Magma Mile', 'starlight', 'volcano', 3, '#ff5a1f', '#2b2b33', '#5a1a14', 'Lava rivers, a narrow bridge and fire geysers.'],
  ['spooky-hollow', 'Spooky Hollow', 'starlight', 'haunted', 3, '#9bff6a', '#8b4dff', '#251a3a', 'Fog, lanterns and twisted trees. Tricky and tight.'],
  ['starlight-spiral', 'Starlight Spiral', 'starlight', 'space', 3, '#ffd23f', '#8b4dff', '#0e0b2a', 'A glowing ribbon road through space. No walls.'],
];

function blobLoop(seed, radius = 240) {
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (1 + 0.28 * Math.sin(a * 2 + seed) + 0.16 * Math.sin(a * 3 + seed * 1.7) + 0.08 * Math.cos(a * 5 + seed * 0.6));
    pts.push([Math.round(Math.cos(a) * r * 1.25), 0, Math.round(Math.sin(a) * r), 16, 0]);
  }
  return pts;
}

export function installMocks() {
  if (param('mocktracks') === null || TRACK_DEFS.length > 1) return;
  const base = TRACK_DEFS[0];
  CUPS.push({ id: 'starlight', name: 'Starlight Cup', trackIds: [] });
  SPECS.forEach(([id, name, cup, theme, difficulty, accent, ground, skyTop, description], i) => {
    TRACK_DEFS.push({
      ...base, id, name, cup, theme, music: theme, difficulty, description, zones: [],
      palette: { skyTop, skyHorizon: '#ffffff', ground, accent, ui: { primary: accent, secondary: ground } },
      points: blobLoop(i * 1.3 + 0.4, 200 + (i % 3) * 25),
    });
    CUPS.find((c) => c.id === cup).trackIds.push(id);
  });
}
