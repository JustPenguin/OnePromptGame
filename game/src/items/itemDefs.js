// Item catalogue + icons. OWNER: Agent D (items).
// UI (Agent E) reads ITEM_DEFS and getItemIcon() for the HUD item slot / roulette; keep these exports stable.
//   ITEM_DEFS[id] = { id, name, desc, color, count (uses per pickup), kind: 'boost'|'trap'|'projectile'|'defense'|'attack' }
//   ITEM_ORDER    = ids in roulette display order
//   getItemIcon(id, size) -> HTMLCanvasElement (cached, procedurally drawn)
export const ITEM_DEFS = {
  boost: { id: 'boost', name: 'Nitro Boost', desc: 'A quick burst of speed.', color: '#22d3ff', count: 1, kind: 'boost' },
};
export const ITEM_ORDER = Object.keys(ITEM_DEFS);

const cache = new Map();
export function getItemIcon(id, size = 96) {
  const key = `${id}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const def = ITEM_DEFS[id] ?? { color: '#888', name: '?' };
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = def.color; g.beginPath(); g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = `${size * 0.4}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((def.name ?? '?')[0], size / 2, size / 2 + size * 0.03);
  cache.set(key, c);
  return c;
}
