// Event names + payloads for session.events (EventBus).  THIS FILE IS THE DECOUPLING CONTRACT:
// physics/race/items EMIT; audio, vfx, vehicles, ui, camera LISTEN.  Add new events at the bottom of the
// right section; never rename or change the payload shape of an existing one (additive changes only).
// `kart` always means a Kart instance (src/physics/Kart.js); Vector3s are THREE.Vector3 (copy, don't keep).
export const EV = Object.freeze({
  // ---- race flow (RaceManager) ----
  RACE_PHASE: 'race:phase',          // { phase }  'intro' | 'countdown' | 'racing' | 'finishing' | 'results'
  COUNTDOWN: 'race:countdown',       // { count }  3, 2, 1, then 0 (= GO!)
  RACE_START: 'race:start',          // {}
  LAP_COMPLETE: 'race:lap',          // { kart, lap, lapTime, isBest }   lap = the lap number just COMPLETED (1-based)
  FINAL_LAP: 'race:finalLap',        // { kart }  kart just started its final lap
  KART_FINISH: 'race:finish',        // { kart, place, time }
  RACE_RESULTS: 'race:results',      // { standings }  array of kart.race summaries, best first
  PLACE_CHANGE: 'race:place',        // { kart, from, to }
  OVERTAKE: 'race:overtake',         // { kart, passed }  kart just passed `passed`
  WRONG_WAY: 'race:wrongWay',        // { kart, active }

  // ---- kart physics ----
  HOP: 'kart:hop',                   // { kart }
  DRIFT_START: 'kart:driftStart',    // { kart, dir }  dir: -1 left, +1 right
  DRIFT_LEVEL: 'kart:driftLevel',    // { kart, level }  mini-turbo charge reached level 1|2|3
  DRIFT_BOOST: 'kart:driftBoost',    // { kart, level }  drift released with a charge -> mini-turbo fires
  DRIFT_CANCEL: 'kart:driftCancel',  // { kart }
  BOOST: 'kart:boost',               // { kart, source, strength, duration }  source: 'drift'|'item'|'pad'|'start'|'rocket'
  START_BOOST: 'kart:startBoost',    // { kart }  perfect launch at GO
  START_BURNOUT: 'kart:burnout',     // { kart }  throttled too early
  WALL_HIT: 'kart:wallHit',          // { kart, impact, point, normal }  impact = m/s into wall
  WALL_SCRAPE: 'kart:wallScrape',    // { kart, active }
  BUMP: 'kart:bump',                 // { a, b, impact, point }  kart-vs-kart
  SPIN_OUT: 'kart:spin',             // { kart, cause }
  LAUNCH: 'kart:launch',             // { kart }  knocked into the air (explosion)
  RECOVER: 'kart:recover',           // { kart }  control regained after spin/launch
  JUMP: 'kart:jump',                 // { kart }  left the ground off a ramp / crest
  LAND: 'kart:land',                 // { kart, impact }
  OFFROAD: 'kart:offroad',           // { kart, active, surface }
  RESPAWN: 'kart:respawn',           // { kart, reason }  'fall' | 'stuck' | 'manual'
  RESPAWN_DONE: 'kart:respawnDone',  // { kart }
  SHRINK: 'kart:shrink',             // { kart, active }
  INVINCIBLE: 'kart:invincible',     // { kart, active }
  ROCKET: 'kart:rocket',             // { kart, active }  rocket-rider auto-drive on/off
  PAD_BOOST: 'pad:boost',            // { kart, pad }
  COIN: 'coin:collect',              // { kart, total }

  // ---- items (ItemSystem) ----
  ITEM_BOX: 'item:box',              // { kart, box }  kart hit an item box -> roulette starts
  ITEM_ROULETTE: 'item:roulette',    // { kart, active }
  ITEM_GOT: 'item:got',              // { kart, type, count }
  ITEM_USE: 'item:use',              // { kart, type, backward }
  ITEM_SPAWN: 'item:spawn',          // { type, entity, owner }
  ITEM_HIT: 'item:hit',              // { victim, attacker, type, point }  attacker may be null
  ITEM_BLOCKED: 'item:blocked',      // { victim, type }  shield / invincibility absorbed it
  ITEM_EXPLODE: 'item:explode',      // { type, point, radius }
});
