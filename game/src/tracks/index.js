// Track registry. OWNER: Agent B.  UI reads TRACK_DEFS / CUPS; the session calls createTrack().
// Each def needs at least: id, name, cup, theme, music, laps, difficulty (1-3), description, palette, points | layout.
// Defs are plain data; a def with a `layout` gets its `points` compiled here so every consumer (UI, tools) sees them.
import { SplineTrack } from '../track/SplineTrack.js';
import { compileLayout } from './layout.js';
import { sunnyMeadows } from './sunny-meadows.js';
import { cactusCanyon } from './cactus-canyon.js';
import { frostbitePeak } from './frostbite-peak.js';
import { harborHeights } from './harbor-heights.js';
import { neonNights } from './neon-nights.js';
import { magmaMile } from './magma-mile.js';
import { spookyHollow } from './spooky-hollow.js';

function prepare(def) {
  if (def.layout && !def.points) {
    const lay = compileLayout({ width: def.width, shoulder: def.shoulder, ...def.layout });
    def.points = lay.points;
    def._layoutMarkers = lay.markers;
    def._layoutLength = lay.length;
  }
  return def;
}

export const TRACK_DEFS = [sunnyMeadows, cactusCanyon, frostbitePeak, harborHeights, neonNights, magmaMile, spookyHollow].map(prepare);

/** Cups are ordered groups of tracks (Grand Prix = race every track in a cup in order). */
export const CUPS = [
  { id: 'blossom', name: 'Blossom Cup', trackIds: ['sunny-meadows', 'cactus-canyon', 'frostbite-peak', 'harbor-heights'] },
  { id: 'starlight', name: 'Starlight Cup', trackIds: ['neon-nights', 'magma-mile', 'spooky-hollow'] },
];

export const getTrackDef = (id) => TRACK_DEFS.find((t) => t.id === id) ?? TRACK_DEFS[0];

/** Build a ready-to-use track. Synchronous; may take 100-400 ms for rich tracks (the session shows a loading bar).
 *  opts: { quality, headless (no visuals, for Node tools), mirror } */
export function createTrack(id, opts = {}) {
  return new SplineTrack(getTrackDef(id), opts);
}
