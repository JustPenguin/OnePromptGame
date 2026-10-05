// Achievements: ONE data table + evaluator. OWNER: Agent E.  Unlocked ids are stored in save.data.achievements {id: timestamp}.
// A rule is `test(data, ctx)`; `ctx` carries single-race facts when evaluated right after a race ({summary}) so "in one race"
// achievements are possible.  Toasts are shown by the App.
import { DRIVERS } from '../data/roster.js';

const trophies = (d, min) => {
  const rank = { bronze: 1, silver: 2, gold: 3 };
  let n = 0;
  for (const byClass of Object.values(d.grandPrix)) for (const e of Object.values(byClass)) if ((rank[e.trophy] ?? 0) >= rank[min]) n++;
  return n;
};

export const ACHIEVEMENTS = [
  { id: 'first-finish', name: 'Off the Grid', desc: 'Finish your first race', icon: 'flag', test: (d) => d.stats.finishes >= 1 },
  { id: 'first-win', name: 'Winner Winner', desc: 'Win a race', icon: 'crown', test: (d) => d.stats.wins >= 1 },
  { id: 'podium-5', name: 'Regular on the Podium', desc: 'Reach the podium 5 times', icon: 'medal', test: (d) => d.stats.podiums >= 5 },
  { id: 'wins-10', name: 'Ten Out of Ten', desc: 'Win 10 races', icon: 'trophy', test: (d) => d.stats.wins >= 10 },
  { id: 'drifter', name: 'Sideways Spirit', desc: 'Drift for 2 minutes in total', icon: 'drift', test: (d) => d.stats.driftSeconds >= 120 },
  { id: 'speed', name: 'Needle Pinned', desc: 'Hit 160 km/h', icon: 'gauge', test: (d) => d.stats.topSpeed >= 160 },
  { id: 'sniper', name: 'Sharpshooter', desc: 'Hit 10 rivals with items', icon: 'bolt', test: (d) => d.stats.itemsHit >= 10 },
  { id: 'comeback', name: 'Comeback Kid', desc: 'Overtake 6 racers in a single race', icon: 'up', test: (d, c) => (c?.summary?.stats?.overtakes ?? 0) >= 6 },
  { id: 'trophy', name: 'Cup of Tea', desc: 'Win any Grand Prix trophy', icon: 'cup', test: (d) => trophies(d, 'bronze') >= 1 },
  { id: 'gold', name: 'Golden Hour', desc: 'Win a gold trophy', icon: 'crown', test: (d) => trophies(d, 'gold') >= 1 },
  { id: 'record', name: 'Against the Clock', desc: 'Set a Time Trial record', icon: 'stopwatch', test: (d) => d.stats.ttRecords >= 1 },
  { id: 'marathon', name: 'Marathon Racer', desc: 'Complete 30 races', icon: 'road', test: (d) => d.stats.races >= 30 },
  { id: 'roster', name: 'Full Garage', desc: 'Unlock every driver', icon: 'users', test: (d) => DRIVERS.every((x) => d.unlocks.drivers.includes(x.id)) },
];

export const getAchievement = (id) => ACHIEVEMENTS.find((a) => a.id === id) ?? null;

/** Apply any newly satisfied achievements; returns the new ones. Commits when something changed. */
export function evaluateAchievements(save, ctx = null) {
  const fresh = [];
  const now = Date.now();
  for (const a of ACHIEVEMENTS) {
    if (save.data.achievements[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(save.data, ctx); } catch { ok = false; }
    if (ok) { save.data.achievements[a.id] = now; fresh.push(a); }
  }
  if (fresh.length) save.commit(true);
  return fresh;
}
