// Recipe registry: one function per track that dresses the world.  OWNER: Agent B.
// recipe(world) is called once while the track is built; it calls world.configure({...}) and registers props / set pieces.
import { sunnyMeadows } from './sunny-meadows.js';
import { cactusCanyon } from './cactus-canyon.js';
import { frostbitePeak } from './frostbite-peak.js';
import { harborHeights } from './harbor-heights.js';
import { neonNights } from './neon-nights.js';
import { magmaMile } from './magma-mile.js';

const RECIPES = {
  'sunny-meadows': sunnyMeadows,
  'cactus-canyon': cactusCanyon,
  'frostbite-peak': frostbitePeak,
  'harbor-heights': harborHeights,
  'neon-nights': neonNights,
  'magma-mile': magmaMile,
};

/** Fallback for a track without a recipe: a plain daylit meadow so a brand-new track def is playable immediately. */
function plainRecipe(w) {
  w.configure({ sky: { top: '#3d8bff', horizon: '#cfe9ff' }, fog: { color: '#cfe9ff' }, barriers: { type: 'wall' }, terrain: null });
}

export function getRecipe(def) {
  return RECIPES[def.id] ?? RECIPES[def.theme] ?? plainRecipe;
}
