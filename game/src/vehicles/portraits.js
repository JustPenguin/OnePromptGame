// 2D driver portraits for menus / results. OWNER: Agent C (visuals).
//   getDriverPortrait(driverId, size = 128) -> HTMLCanvasElement (cached; render the 3D model to a canvas)
// Baseline: coloured disc with the initial. Agent C replaces with a real render of the 3D driver.
import { getDriver } from '../data/roster.js';

const cache = new Map();
export function getDriverPortrait(driverId, size = 128) {
  const key = `${driverId}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const d = getDriver(driverId);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size / 2, size / 2, size * 0.55);
  grad.addColorStop(0, d.colors.secondary); grad.addColorStop(1, d.colors.primary);
  g.fillStyle = grad; g.beginPath(); g.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0f24'; g.font = `${size * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(d.name[0], size / 2, size / 2 + size * 0.03);
  cache.set(key, c);
  return c;
}
