// Unlock rules: ONE data table + a tiny evaluator.  OWNER: Agent E.
// Starter content lives in save defaults (drivers pip/rusty/bruno/hopper, bodies classic/streak, cup blossom, classes rookie/pro).
// Everything below is earned.  `hint` is the sentence shown on a locked card; progress (cur/goal) is shown when goal > 1.
//
//   when.type 'stat'    -> save.stats[stat] >= gte
//   when.type 'trophy'  -> some Grand Prix result (cup '*' = any, cls '*' = any) at least `min` (bronze < silver < gold)
//   when.type 'records' -> number of record entries (time-trial + race) >= gte
import { UNLOCK_ALL } from './catalog.js';

export const UNLOCK_RULES = [
  { kind: 'driver', target: 'luna',      when: { type: 'stat', stat: 'races', gte: 3 },              hint: 'Finish 3 races' },
  { kind: 'driver', target: 'gizmo',     when: { type: 'stat', stat: 'wins', gte: 2 },               hint: 'Win 2 races' },
  { kind: 'body',   target: 'hopper',    when: { type: 'stat', stat: 'driftSeconds', gte: 45 },      hint: 'Drift for 45 seconds in total' },
  { kind: 'cup',    target: 'starlight', when: { type: 'trophy', cup: 'blossom', cls: '*', min: 'bronze' }, hint: 'Win a trophy in the Blossom Cup' },
  { kind: 'driver', target: 'quill',     when: { type: 'stat', stat: 'podiums', gte: 6 },            hint: 'Reach the podium 6 times' },
  { kind: 'speedClass', target: 'master', when: { type: 'trophy', cup: '*', cls: 'pro', min: 'gold' }, hint: 'Win gold in a Pro Grand Prix' },
  { kind: 'driver', target: 'rocco',     when: { type: 'trophy', cup: '*', cls: '*', min: 'silver' }, hint: 'Win a silver or gold Grand Prix trophy' },
  { kind: 'body',   target: 'crusher',   when: { type: 'stat', stat: 'wins', gte: 8 },               hint: 'Win 8 races' },
];

const KIND_KEY = { driver: 'drivers', body: 'bodies', cup: 'cups', speedClass: 'speedClasses' };
const TROPHY_RANK = { bronze: 1, silver: 2, gold: 3 };

export const unlockKey = (kind) => KIND_KEY[kind];
export const ruleFor = (kind, target) => UNLOCK_RULES.find((r) => r.kind === kind && r.target === target) ?? null;

export function isUnlocked(save, kind, id) {
  if (UNLOCK_ALL) return true;
  return save.data.unlocks[KIND_KEY[kind]]?.includes(id) ?? false;
}

/** {cur, goal, done} for a rule given the current save data. */
export function progress(rule, data) {
  const w = rule.when;
  if (w.type === 'stat') { const cur = Math.min(w.gte, data.stats[w.stat] ?? 0); return { cur, goal: w.gte, done: cur >= w.gte }; }
  if (w.type === 'trophy') {
    let ok = false;
    for (const [cup, byClass] of Object.entries(data.grandPrix)) {
      if (w.cup !== '*' && w.cup !== cup) continue;
      for (const [cls, e] of Object.entries(byClass)) if ((w.cls === '*' || w.cls === cls) && (TROPHY_RANK[e.trophy] ?? 0) >= TROPHY_RANK[w.min]) ok = true;
    }
    return { cur: ok ? 1 : 0, goal: 1, done: ok };
  }
  if (w.type === 'records') {
    let n = 0;
    for (const r of Object.values(data.records)) for (const k of ['tt', 'race']) n += Object.keys(r[k] ?? {}).length;
    return { cur: Math.min(w.gte, n), goal: w.gte, done: n >= w.gte };
  }
  return { cur: 0, goal: 1, done: false };
}

/** Human line for a locked card: "Finish 3 races (1/3)". */
export function hintFor(save, kind, id) {
  const rule = ruleFor(kind, id);
  if (!rule) return 'Not available yet';
  const p = progress(rule, save.data);
  return p.goal > 1 ? `${rule.hint} (${Math.floor(p.cur)}/${p.goal})` : rule.hint;
}

/**
 * Apply every rule whose condition is now met.  Mutates save.data.unlocks and commits.
 * @returns {{kind:string,target:string,rule:object}[]} the NEW unlocks (for toasts / the results screen)
 */
export function evaluateUnlocks(save) {
  const fresh = [];
  for (const rule of UNLOCK_RULES) {
    const list = save.data.unlocks[KIND_KEY[rule.kind]];
    if (!list || list.includes(rule.target)) continue;
    if (progress(rule, save.data).done) { list.push(rule.target); fresh.push({ kind: rule.kind, target: rule.target, rule }); }
  }
  if (fresh.length) save.commit(true);
  return fresh;
}
