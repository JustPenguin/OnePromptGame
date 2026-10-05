// Default settings + save schema. OWNER: Agent E (ui/save).  Other agents READ settings via session.settings /
// app.settings (a live object that is never replaced, only mutated); they never write to storage themselves.
//
// Storage generations vs schema revisions:
//   STORAGE_KEY ('...v1')  = the localStorage slot.  It stays stable so a save is never orphaned.
//   data.version           = the schema REVISION inside the blob; Save.migrate() walks it up to SAVE_VERSION.
// docs/ui.md has the full schema + migration notes.
export const SAVE_VERSION = 2;
export const STORAGE_KEY = 'kartrush.save.v1';
export const BACKUP_KEY = 'kartrush.save.v1.bak';

export const DEFAULT_SETTINGS = {
  // ---- graphics ----
  quality: 'auto',              // 'auto' | 'low' | 'medium' | 'high' | 'ultra'
  resolutionScale: 1,           // 0.5 .. 1 (upper bound for the adaptive scaler)
  postfx: true,
  cameraMode: 'chase',          // 'chase' | 'far' | 'close'
  cameraShake: true,
  fovBoost: true,
  // ---- audio ----
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  // ---- gameplay / HUD ----
  speedUnit: 'kmh',             // 'kmh' | 'mph'
  showMinimap: true,
  showLeaderboard: true,
  hudScale: 1,                  // 0.7 .. 1.4
  assists: { autoAccelerate: false, steeringAssist: false },
  // ---- controls ----
  vibration: true,
  gamepadDeadzone: 0.14,
  bindings: null,               // null = defaults (see core/Input.js DEFAULT_BINDINGS)
  touchControls: 'auto',        // 'auto' (only on touch devices) | 'on' | 'off'
  touchScale: 1,                // 0.8 .. 1.4 size of the on-screen buttons
  // ---- diagnostics / accessibility ----
  showFps: false,
  reducedMotion: false,
  reduceFlashes: false,
  largeText: false,
  highContrastHud: false,
};

/** Allowed values / ranges used by Save.sanitizeSettings (anything else falls back to the default). */
export const SETTING_RULES = {
  quality: { enum: ['auto', 'low', 'medium', 'high', 'ultra'] },
  resolutionScale: { min: 0.5, max: 1 },
  cameraMode: { enum: ['chase', 'far', 'close'] },
  masterVolume: { min: 0, max: 1 },
  musicVolume: { min: 0, max: 1 },
  sfxVolume: { min: 0, max: 1 },
  speedUnit: { enum: ['kmh', 'mph'] },
  hudScale: { min: 0.7, max: 1.4 },
  gamepadDeadzone: { min: 0.05, max: 0.4 },
  touchControls: { enum: ['auto', 'on', 'off'] },
  touchScale: { min: 0.8, max: 1.4 },
};

export const MAX_GHOSTS = 12;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    profile: {
      name: 'Racer',
      favoriteDriver: 'pip',
      favoriteKart: 'classic',
      created: Date.now(),
      lastSpeedClass: 'pro',
      lastCup: 'blossom',
      lastTrack: 'sunny-meadows',
      versus: { laps: 3, racers: 8, items: true },
      tutorialDone: false,
      nameSet: false,
    },
    settings: structuredClone(DEFAULT_SETTINGS),
    // records[trackId] = { tt: {[class]: Entry}, race: {[class]: Entry}, lap: {[class]: Entry} }
    //   Entry = { time, laps, by: {driverId, bodyId}, date }   (lap entries: time = best single lap)
    records: {},
    // ghosts['trackId|class'] = { time, driverId, bodyId, trackId, speedClass, laps, date, data }  (data is Agent A's opaque blob)
    ghosts: {},
    // grandPrix[cupId][class] = { trophy: 'gold'|'silver'|'bronze'|null, points, place, completed, date }
    grandPrix: {},
    unlocks: { drivers: ['pip', 'rusty', 'bruno', 'hopper'], bodies: ['classic', 'streak'], cups: ['blossom'], speedClasses: ['rookie', 'pro'] },
    stats: {
      races: 0, wins: 0, podiums: 0, finishes: 0, distance: 0, driftSeconds: 0, itemsHit: 0, itemsUsed: 0, hitsTaken: 0, boosts: 0,
      overtakes: 0, coins: 0, laps: 0, topSpeed: 0, playSeconds: 0, gpPlayed: 0, gpWon: 0, ttRecords: 0, bestLapRecords: 0,
    },
    achievements: {},   // id -> timestamp
  };
}
