// Unified input: keyboard + gamepad + touch -> KartInput.  OWNER: Agent A (engine).
// UI (Agent E) owns the on-screen touch overlay and the rebinding screen; they talk to this class through:
//   input.touch            mutable object the touch overlay writes (steer/throttle/brake/drift/item/lookBack/respawn)
//   input.bindings         { action: [KeyboardEvent.code,...] }   input.setBindings(map)   DEFAULT_BINDINGS
//   input.captureNextKey(cb)   rebinding helper: next keydown is passed to cb(code) and swallowed
//   input.pressed(action)  true once per press (pause, camera, ...)  - edges are cleared by endFrame()
//   input.enabled          gameplay keys are only captured (preventDefault) while true (i.e. during a race)
// Engine-side extras:
//   input.rumble(strong, weak, ms)   gamepad vibration (honours settings.vibration); the session also rumbles on hits automatically
//   input.isDown(action)             true while any key / button / touch for the action is held (respawn is hold-to-use)
//   input.anyPressed                 true for one frame after any key / button / tap (the session uses it to skip the intro)
//   input.speedRatio                 0..1, written by the session; keyboard steering ramps slower at speed
//   input.lastDevice                 'keyboard' | 'gamepad' | 'touch'
//
// Keyboard steering is digital, so it is shaped to feel analog: a linear ramp (about 0.18 s to full lock), a faster return to
// centre, and a very fast reversal when you flip direction (so counter-steering in a slide is instant).
import { KartInput } from '../physics/Kart.js';
import { EV } from './events.js';
import { clamp } from './math.js';
import { SURFACE_PROPS } from '../track/surfaces.js';

export const DEFAULT_BINDINGS = {
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['KeyE', 'KeyF', 'ControlLeft'],
  lookBack: ['KeyQ', 'KeyB'],
  pause: ['Escape', 'KeyP'],
  camera: ['KeyC'],
  respawn: ['KeyR'],
};

const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
/** Actions that never fire on the key-down edge (hold-to-use; the session reads isDown()). */
const HOLD_ACTIONS = new Set(['respawn']);
export const KEYBOARD_STEER = { attack: 5.6, attackAtSpeed: 4.2, release: 10, reverse: 17 };   // units of steer per second

export class Input {
  constructor(settingsProvider = () => ({})) {
    this.settings = settingsProvider;
    this.bindings = structuredCloneSafe(DEFAULT_BINDINGS);
    this.keys = new Set();
    this.edges = new Set();
    this.enabled = false;
    this.override = null;     // debug/test: a KartInput-like object that replaces real input
    this.controller = null;   // debug/test: (out: KartInput, dt) => void, computed every frame (e.g. __kart.bot())
    this.touch = { active: false, steer: 0, throttle: 0, brake: 0, drift: false, item: false, lookBack: false, respawn: false };
    this.gamepad = { connected: false, id: '', rumble: false };
    this.anyPressed = false;
    this.speedRatio = 0;
    this._anyNext = false;
    this._steer = 0;
    this._pad = { buttons: [] };
    this._padEdgeHeld = { respawn: false };
    this._capture = null;
    this._rumbleUntil = 0;
    this._rumbleMag = 0;
    this._rumbleKeep = 0;
    this.lastDevice = 'keyboard';
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => this._down(e));
      window.addEventListener('keyup', (e) => this._up(e));
      // never leave a key "stuck": losing focus, hiding the tab, or opening a context menu swallows the matching keyup
      window.addEventListener('blur', () => this.releaseAll());
      window.addEventListener('pagehide', () => this.releaseAll());
      window.addEventListener('contextmenu', () => this.releaseAll());
      window.addEventListener('pointerdown', () => { this._anyNext = true; }, { passive: true });
      window.addEventListener('gamepadconnected', (e) => { this.gamepad.connected = true; this.gamepad.id = e.gamepad.id; });
      window.addEventListener('gamepaddisconnected', () => { this.gamepad.connected = false; });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    }
  }

  setBindings(map) { this.bindings = { ...structuredCloneSafe(DEFAULT_BINDINGS), ...structuredCloneSafe(map ?? {}) }; }
  captureNextKey(cb) { this._capture = cb; }
  /** Forget every held key / ramp (focus loss, pause, scene changes). */
  releaseAll() { this.keys.clear(); this._steer = 0; this._padEdgeHeld.respawn = false; }

  _down(e) {
    if (this._capture) { const cb = this._capture; this._capture = null; e.preventDefault(); cb(e.code); return; }
    if (e.repeat) { if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault(); return; }
    this.keys.add(e.code);
    this.lastDevice = 'keyboard';
    if (e.code !== 'Escape') this._anyNext = true;
    for (const [action, codes] of Object.entries(this.bindings)) if (codes.includes(e.code) && !HOLD_ACTIONS.has(action)) this.edges.add(action);
    if (this.enabled && (GAME_KEYS.has(e.code) || Object.values(this.bindings).some((c) => c.includes(e.code)))) e.preventDefault();
  }
  _up(e) {
    this.keys.delete(e.code);
    // macOS swallows the keyup of every other key while Meta is down: forget everything when it is released
    if (e.code === 'MetaLeft' || e.code === 'MetaRight') this.keys.clear();
  }

  /** True exactly once per press of `action` (keyboard or gamepad). Hold-to-use actions (respawn) never report here: use isDown(). */
  pressed(action) { return this.edges.has(action); }
  /** Call once per frame after everything has consumed edges. */
  endFrame() { this.edges.clear(); this.anyPressed = this._anyNext; this._anyNext = false; }
  isDown(action) {
    if (this.bindings[action]?.some((c) => this.keys.has(c))) return true;
    if (action === 'respawn') return this._padEdgeHeld.respawn || (this.touch.active && !!this.touch.respawn);
    return false;
  }

  _activePad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
    } catch { /* gamepad API blocked (e.g. permissions policy) */ }
    return null;
  }

  _pollPad() {
    const pad = this._activePad();
    if (!pad) { this.gamepad.connected = false; return null; }
    this.gamepad.connected = true; this.gamepad.id = pad.id;
    this.gamepad.rumble = !!(pad.vibrationActuator);
    const dz = this.settings().gamepadDeadzone ?? 0.14;
    const ax = pad.axes[0] ?? 0;
    // rescale past the dead zone, then a gentle curve: fine control near the centre, full lock at the rim
    const steerAnalog = Math.abs(ax) < dz ? 0 : Math.sign(ax) * Math.pow(Math.min(1, (Math.abs(ax) - dz) / (1 - dz)), 1.25);
    const b = (i) => pad.buttons[i]?.pressed ?? false;
    const v = (i) => pad.buttons[i]?.value ?? 0;
    // standard mapping: A(0) gas, B(1) brake, X(2)/LB(4) item, Y(3)/R3(11) look back, RB(5) drift, RT(7)/LT(6) analog,
    // Back(8)/D-pad up(12) camera, Start(9) pause, L3(10) / D-pad down(13) hold to respawn, D-pad left/right(14/15) steer
    const prev = this._pad.buttons;
    const names = { 9: 'pause', 8: 'camera', 12: 'camera' };
    for (const i of [9, 8, 12]) if (b(i) && !prev[i]) { this.edges.add(names[i]); this._anyNext = true; }
    for (const i of [0, 1, 2, 3, 4, 5]) if (b(i) && !prev[i]) this._anyNext = true;
    this._pad.buttons = pad.buttons.map((x) => x.pressed);
    this._padEdgeHeld.respawn = b(10) || b(13);
    const dpad = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    const out = {
      steer: dpad !== 0 && Math.abs(steerAnalog) < 0.1 ? dpad : steerAnalog, dpad: dpad !== 0 && Math.abs(steerAnalog) < 0.1,
      throttle: Math.max(v(7), b(0) ? 1 : 0), brake: Math.max(v(6), b(1) ? 1 : 0),
      drift: b(5), item: b(4) || b(2), lookBack: b(3) || b(11),
    };
    if (Math.abs(steerAnalog) > 0.2 || out.throttle > 0.2 || out.brake > 0.2) this.lastDevice = 'gamepad';
    return out;
  }

  /** Fill `out` (a KartInput) with the current merged input. dt in seconds. */
  read(out, dt = 1 / 60) {
    if (this.override) return out.copy(this.override);
    if (this.controller) { out.reset(); this.controller(out, dt); return out; }     // debug/test: a function that fills `out` every frame
    out.reset();
    if (!this.enabled) { this._steer = 0; return out; }
    const down = (a) => this.isDown(a);
    const target = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    this._steer = this._rampSteer(this._steer, target, dt);
    let throttle = down('throttle') ? 1 : 0, brake = down('brake') ? 1 : 0, steer = this._steer;
    let drift = down('drift'), item = down('item'), lookBack = down('lookBack');
    const pad = this._pollPad();
    if (pad) {
      if (pad.dpad) { this._padSteer = this._rampSteer(this._padSteer ?? 0, pad.steer, dt); if (Math.abs(this._padSteer) > Math.abs(steer)) steer = this._padSteer; }
      else { this._padSteer = 0; if (Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer; }
      throttle = Math.max(throttle, pad.throttle); brake = Math.max(brake, pad.brake);
      drift = drift || pad.drift; item = item || pad.item; lookBack = lookBack || pad.lookBack;
    }
    const t = this.touch;
    if (t.active) {
      if (Math.abs(t.steer) > Math.abs(steer)) steer = t.steer;
      throttle = Math.max(throttle, t.throttle); brake = Math.max(brake, t.brake);
      drift = drift || t.drift; item = item || t.item; lookBack = lookBack || t.lookBack;
      this.lastDevice = 'touch';
    }
    if (this.settings().assists?.autoAccelerate && brake < 0.1) throttle = 1;
    out.throttle = clamp(throttle, 0, 1); out.brake = clamp(brake, 0, 1); out.steer = clamp(steer, -1, 1);
    out.drift = drift; out.item = item; out.lookBack = lookBack;
    return out;
  }

  /** Linear ramp toward the digital target: slower to build at speed, quick to release, instant to reverse. */
  _rampSteer(cur, target, dt) {
    if (target === cur) return cur;
    const attack = KEYBOARD_STEER.attack + (KEYBOARD_STEER.attackAtSpeed - KEYBOARD_STEER.attack) * clamp(this.speedRatio, 0, 1);
    let rate;
    if (target === 0) rate = KEYBOARD_STEER.release;
    else if (cur * target < 0) rate = KEYBOARD_STEER.reverse;
    else rate = attack;
    const step = rate * dt;
    const next = cur + clamp(target - cur, -step, step);
    return Math.abs(next) < 0.001 ? 0 : next;
  }

  // ------------------------------------------------------------------ vibration
  /** Gamepad rumble. strong/weak 0..1 (low / high frequency motor), ms duration. Never stacks a weaker effect on a stronger one. */
  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (this.settings().vibration === false) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const mag = strong + weak;
    if (now < this._rumbleUntil && mag <= this._rumbleMag) return;
    const pad = this._activePad();
    const act = pad?.vibrationActuator;
    if (!act?.playEffect) return;
    this._rumbleUntil = now + ms; this._rumbleMag = mag;
    try {
      const r = act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: clamp(weak, 0, 1), strongMagnitude: clamp(strong, 0, 1) });
      r?.catch?.(() => {});
    } catch { /* unsupported effect */ }
  }

  /** Subscribe to the session's events so the player's pad rumbles on hits, boosts, landings... Called by RaceSession. */
  attachSession(session) {
    this.detachSession();
    const me = () => session.player;
    const on = (t, f) => this._offs.push(session.on(t, f));
    this._offs = [];
    on(EV.WALL_HIT, ({ kart, impact }) => { if (kart === me()) this.rumble(clamp(impact / 22, 0.25, 0.9), 0.35, 130); });
    on(EV.BUMP, ({ a, b, impact }) => { if (a === me() || b === me()) this.rumble(clamp(impact / 18, 0.2, 0.7), 0.3, 110); });
    on(EV.LAND, ({ kart, impact }) => { if (kart === me()) this.rumble(clamp(impact / 28, 0.2, 0.8), 0.25, 140); });
    on(EV.BOOST, ({ kart, source }) => { if (kart === me()) this.rumble(0.3, source === 'drift' ? 0.55 : 0.75, source === 'drift' ? 160 : 260); });
    on(EV.DRIFT_LEVEL, ({ kart }) => { if (kart === me()) this.rumble(0.0, 0.5, 70); });
    on(EV.ITEM_HIT, ({ victim }) => { if (victim === me()) this.rumble(1, 0.8, 360); });
    on(EV.SPIN_OUT, ({ kart }) => { if (kart === me()) this.rumble(0.8, 0.6, 320); });
    on(EV.LAUNCH, ({ kart }) => { if (kart === me()) this.rumble(1, 0.7, 380); });
    on(EV.RESPAWN, ({ kart }) => { if (kart === me()) this.rumble(0.3, 0.3, 200); });
    on(EV.START_BOOST, ({ kart }) => { if (kart === me()) this.rumble(0.6, 0.9, 300); });
  }
  detachSession() { this._offs?.forEach((o) => o()); this._offs = []; }

  /** Continuous, low-level rumble from the tyres: off-road rattle and drift hum.  Called every frame by the session. */
  rumbleTick(dt, kart) {
    if (!kart || !this.gamepad.rumble || this.settings().vibration === false) return;
    this._rumbleKeep -= dt;
    if (this._rumbleKeep > 0) return;
    const fast = clamp(Math.abs(kart.speed) / kart.stats.topSpeed, 0, 1);
    let weak = 0, strong = 0;
    if (kart.grounded && kart.speed > 4) {
      if (SURFACE_PROPS[kart.surface]?.offroad) { weak = 0.18 + 0.32 * fast; strong = 0.1 * fast; }
      if (kart.drift.dir !== 0) weak = Math.max(weak, 0.12 + 0.1 * kart.drift.level);
    }
    if (weak > 0 || strong > 0) { this.rumble(strong, weak, 140); this._rumbleKeep = 0.11; }
  }
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
export { KartInput };
