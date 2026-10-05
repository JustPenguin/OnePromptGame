// Position-weighted item distribution.  Leaders get weak/defensive items, the back of the pack gets the big comeback tools.
// rank u: 0 = leading .. 1 = last.  Each table row is [w(u=0), w(.25), w(.5), w(.75), w(1)]; linear in between.
// Entries ending in "3" are x3 packs (same item type, count 3).
import { clamp } from '../core/math.js';

export const ITEM_TABLE = {
  boost:  { type: 'boost',  count: 1, w: [5, 9, 12, 12, 8] },
  boost3: { type: 'boost',  count: 3, w: [0, 2, 6, 11, 13] },
  peel:   { type: 'peel',   count: 1, w: [18, 14, 8, 3, 0] },
  peel3:  { type: 'peel',   count: 3, w: [6, 8, 4, 0, 0] },
  orb:    { type: 'orb',    count: 1, w: [14, 13, 9, 4, 0] },
  orb3:   { type: 'orb',    count: 3, w: [2, 6, 6, 3, 0] },
  seeker: { type: 'seeker', count: 1, w: [2, 12, 17, 14, 7] },
  bomb:   { type: 'bomb',   count: 1, w: [14, 12, 8, 4, 0] },
  comet:  { type: 'comet',  count: 1, w: [0, 0, 0, 4, 9] },     // gated below: back of the pack only
  shock:  { type: 'shock',  count: 1, w: [7, 10, 6, 0, 0] },    // leader-ish only
  shield: { type: 'shield', count: 1, w: [4, 8, 10, 8, 4] },
  rocket: { type: 'rocket', count: 1, w: [0, 2, 7, 15, 22] },
  ink:    { type: 'ink',    count: 1, w: [0, 4, 8, 6, 2] },
};
const KEYS = Object.keys(ITEM_TABLE);

function weightAt(w, u) {
  const f = clamp(u, 0, 1) * 4, i = Math.min(3, Math.floor(f)), t = f - i;
  return w[i] + (w[i + 1] - w[i]) * t;
}

/**
 * Roll an item for `kart`.
 * @param {{racers:number, order:Array, cometActive:boolean, random:()=>number, rubber:number}} ctx
 * @returns {{type:string,count:number,key:string}}
 */
export function rollItem(kart, ctx) {
  const n = Math.max(1, ctx.racers);
  const place = kart.race.place;
  let u = n <= 1 ? 0 : (place - 1) / (n - 1);
  // AI far behind the human gets a nudge towards better items (invisible rubber-banding)
  if (kart.isAI && ctx.rubber && ctx.behindBy > 0) u = clamp(u + ctx.rubber * clamp(ctx.behindBy / 400, 0, 1) * 0.25, 0, 1);
  const last = kart.ext.items?.lastGiven;
  const weights = new Array(KEYS.length);
  let total = 0;
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i], ent = ITEM_TABLE[key];
    let w = weightAt(ent.w, u);
    // gates
    if (ent.type === 'comet' && (n < 4 || place < Math.ceil(n * 0.55) || place <= 3 || ctx.cometActive || kart.ext.items?.cometCooldown > 0)) w = 0;
    if (ent.type === 'shock' && n < 3) w = 0;
    if ((ent.type === 'seeker' || ent.type === 'ink') && place <= 1) w = ent.type === 'seeker' ? w * 0.2 : 0;
    if (ent.type === 'rocket' && place <= 2 && n > 2) w *= 0.3;
    if (ent.type === last) w *= 0.2;               // no immediate repeats
    weights[i] = w; total += w;
  }
  if (total <= 0) return { type: 'boost', count: 1, key: 'boost' };
  let r = ctx.random() * total;
  for (let i = 0; i < KEYS.length; i++) { r -= weights[i]; if (r <= 0 && weights[i] > 0) return { type: ITEM_TABLE[KEYS[i]].type, count: ITEM_TABLE[KEYS[i]].count, key: KEYS[i] }; }
  return { type: 'boost', count: 1, key: 'boost' };
}

/** Expected probabilities for a rank u (docs / balancing tool). */
export function itemOdds(u, opts = {}) {
  const out = {};
  let total = 0;
  for (const key of KEYS) { out[key] = weightAt(ITEM_TABLE[key].w, u); total += out[key]; }
  for (const key of KEYS) out[key] = total ? out[key] / total : 0;
  return out;
}
