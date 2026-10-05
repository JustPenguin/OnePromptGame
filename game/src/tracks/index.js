// Track registry. OWNER: Agent B.  UI reads TRACK_DEFS / CUPS; the session calls createTrack().
// Each def needs at least: id, name, cup, theme, music, laps, difficulty (1-3), description, palette, points.
import { SplineTrack } from '../track/SplineTrack.js';
import { sunnyMeadows } from './sunny-meadows.js';

export const TRACK_DEFS = [sunnyMeadows];

/** Cups are ordered groups of tracks (Grand Prix = race every track in a cup in order). */
export const CUPS = [
  { id: 'blossom', name: 'Blossom Cup', trackIds: ['sunny-meadows'] },
];

export const getTrackDef = (id) => TRACK_DEFS.find((t) => t.id === id) ?? TRACK_DEFS[0];

/** Build a ready-to-use track. Synchronous; may take 100-400 ms for rich tracks (the session shows a loading bar). */
export function createTrack(id, opts = {}) {
  return new SplineTrack(getTrackDef(id), opts);
}
