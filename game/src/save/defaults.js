// Default settings + save schema. OWNER: Agent E (ui/save).  Other agents READ settings via session.settings /
// app.settings (a live object); they never write to storage themselves.
export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'kartrush.save.v1';

export const DEFAULT_SETTINGS = {
  quality: 'auto',              // 'auto' | 'low' | 'medium' | 'high' | 'ultra'
  resolutionScale: 1,           // 0.5 .. 1
  cameraMode: 'chase',          // 'chase' | 'far' | 'close'
  cameraShake: true,
  fovBoost: true,
  postfx: true,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  speedUnit: 'kmh',             // 'kmh' | 'mph'
  showMinimap: true,
  hudScale: 1,
  assists: { autoAccelerate: false, steeringAssist: false },
  vibration: true,
  gamepadDeadzone: 0.14,
  bindings: null,               // null = defaults (see core/Input.js DEFAULT_BINDINGS)
  showFps: false,
  reducedMotion: false,
};

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    profile: { name: 'Racer', favoriteDriver: 'pip', favoriteKart: 'classic', created: Date.now() },
    settings: structuredClone(DEFAULT_SETTINGS),
    records: {},      // trackId -> { bestTime, bestLap, bestTimeBy: {driverId, bodyId}, speedClass }
    ghosts: {},       // trackId -> { time, driverId, bodyId, hz, frames: [x,z,yaw,...] }   (Agent E / time trial)
    grandPrix: {},    // cupId -> { [speedClass]: { trophy: 'gold'|'silver'|'bronze'|null, points, completed } }
    unlocks: { drivers: ['pip', 'rusty', 'bruno', 'hopper'], bodies: ['classic', 'streak'], cups: ['blossom'], speedClasses: ['rookie', 'pro'] },
    stats: { races: 0, wins: 0, podiums: 0, distance: 0, driftSeconds: 0, itemsHit: 0, boosts: 0, playSeconds: 0 },
  };
}
