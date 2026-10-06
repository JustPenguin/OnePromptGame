// Game-flow controller: the select-screen wizard for each mode, race launching and the Grand Prix loop. OWNER: Agent E.
//
//   flow.start('grandprix'|'timetrial'|'versus')   from the main menu -> first select screen
//   flow.next('driver')                             push the screen after `driver` in this mode's steps
//   flow.launch()                                   build the race config from flow.sel and start it (with transitions)
//   flow.afterRace(session, standings)              results -> records -> (GP) standings / podium
// State: flow.sel (current choices), flow.mode, flow.gp (GrandPrixRun | null).  Screens read/write flow.sel only.
import { DRIVERS, KART_BODIES, SPEED_CLASSES } from '../data/roster.js';
import { getCups, getCup, getTrackDef, isCupUnlocked, isTrackUnlocked, TRACK_DEFS } from '../modes/catalog.js';
import { isUnlocked } from '../modes/unlocks.js';
import { GrandPrixRun } from '../modes/GrandPrix.js';

export const FLOW_STEPS = {
  grandprix: ['driver', 'kart', 'class', 'cup'],
  timetrial: ['driver', 'kart', 'class', 'track'],
  versus: ['driver', 'kart', 'vsetup'],
};
export const STEP_LABELS = { driver: 'Driver', kart: 'Kart', class: 'Class', cup: 'Cup', track: 'Track', vsetup: 'Setup' };
export const MODE_NAMES = { grandprix: 'Grand Prix', timetrial: 'Time Trial', versus: 'Versus Race' };

export class Flow {
  constructor(app) {
    this.app = app;
    this.mode = null;
    this.sel = null;
    this.gp = null;
    this.lastConfig = null;     // for "Race again"
  }

  get ui() { return this.app.ui; }
  get save() { return this.app.save; }
  get steps() { return FLOW_STEPS[this.mode] ?? []; }
  stepIndex(id) { return this.steps.indexOf(id); }
  stepLabels() { return this.steps.map((s) => STEP_LABELS[s]); }

  /** A sane starting selection from the profile (never a locked item). */
  defaults(mode) {
    const p = this.save.profile;
    const ok = (kind, id, fallback) => (isUnlocked(this.save, kind, id) ? id : fallback);
    const cups = getCups();
    const cup = cups.find((c) => c.id === p.lastCup && isCupUnlocked(this.save, c.id)) ?? cups[0];
    const track = TRACK_DEFS.find((t) => t.id === p.lastTrack && isTrackUnlocked(this.save, t.id)) ?? TRACK_DEFS.find((t) => isTrackUnlocked(this.save, t.id)) ?? TRACK_DEFS[0];
    return {
      mode,
      driverId: ok('driver', p.favoriteDriver, 'pip'),
      bodyId: ok('body', p.favoriteKart, 'classic'),
      speedClass: ok('speedClass', p.lastSpeedClass, 'pro'),
      cupId: cup?.id ?? 'blossom',
      trackId: track?.id ?? 'sunny-meadows',
      laps: p.versus.laps, racers: p.versus.racers, items: p.versus.items,
      ghost: true,
    };
  }

  start(mode) {
    this.mode = mode;
    this.gp = null;
    this.sel = this.defaults(mode);
    this.ui.push(this.steps[0], {});
  }

  /** Push the screen after `id`; the last step launches via its own button. */
  next(id) {
    const i = this.stepIndex(id);
    const nextId = this.steps[i + 1];
    if (nextId) this.ui.push(nextId, {});
  }

  /** Remember the choices (favourites show up first next time). */
  remember() {
    const p = this.save.profile, s = this.sel;
    p.favoriteDriver = s.driverId; p.favoriteKart = s.bodyId; p.lastSpeedClass = s.speedClass; p.lastCup = s.cupId; p.lastTrack = s.trackId;
    if (this.mode === 'versus') p.versus = { laps: s.laps, racers: s.racers, items: s.items };
    this.save.commit();
  }

  ghostFor(trackId, speedClass) { return this.save.data.ghosts[`${trackId}|${speedClass}`] ?? null; }

  /** RaceSession config for the current selection (non-GP modes; GP uses GrandPrixRun.configForRace()). */
  buildConfig() {
    const s = this.sel;
    const player = { driverId: s.driverId, bodyId: s.bodyId, name: this.save.profile.name };
    const seed = (Math.random() * 0xffffffff) >>> 0;
    if (s.mode === 'timetrial') {
      const ghost = s.ghost ? this.ghostFor(s.trackId, s.speedClass) : null;
      return { mode: 'timetrial', trackId: s.trackId, laps: 3, speedClass: s.speedClass, racers: 1, items: false, player, ghost, seed };
    }
    return { mode: 'versus', trackId: s.trackId, laps: s.laps, speedClass: s.speedClass, racers: s.racers, items: s.items, player, seed };
  }

  /** Start the race for the current selection. */
  async launch() {
    this.remember();
    if (this.mode === 'grandprix') {
      const cup = getCup(this.sel.cupId);
      if (!cup) return;
      this.gp = new GrandPrixRun({ cup, speedClass: this.sel.speedClass, driverId: this.sel.driverId, bodyId: this.sel.bodyId, name: this.save.profile.name });
      return this.startGpRace();
    }
    const config = this.buildConfig();
    this.lastConfig = config;
    return this.app.startRace(config, { transition: true, flow: this });
  }

  startGpRace() {
    const config = this.gp.configForRace();
    this.lastConfig = config;
    return this.app.startRace(config, { transition: true, flow: this });
  }

  /** "Race again" with the same settings (new seed). */
  again() {
    if (this.mode === 'grandprix' && this.gp) return this.startGpRace();
    if (!this.lastConfig) return null;
    const config = { ...this.lastConfig, seed: (Math.random() * 0xffffffff) >>> 0 };
    if (config.mode === 'timetrial') config.ghost = this.sel?.ghost !== false ? this.ghostFor(config.trackId, config.speedClass) : null;
    this.lastConfig = config;
    return this.app.startRace(config, { transition: true, flow: this });
  }

  /** Time Trial: next unlocked track in registry order. */
  nextTrackId(trackId) {
    const list = TRACK_DEFS.filter((t) => isTrackUnlocked(this.save, t.id));
    const i = list.findIndex((t) => t.id === trackId);
    return list[(i + 1) % list.length]?.id ?? trackId;
  }

  cancel() { this.gp = null; this.mode = null; }

  /** Drivers / bodies / classes for the select screens. */
  get drivers() { return DRIVERS; }
  get bodies() { return KART_BODIES; }
  get classes() { return Object.values(SPEED_CLASSES); }
}

export { getTrackDef };
