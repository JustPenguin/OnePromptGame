// Unified input: keyboard + gamepad + touch -> KartInput.  OWNER: Agent A (engine).
// UI (Agent E) owns the on-screen touch overlay and the rebinding screen; they talk to this class through:
//   input.touch            mutable object the touch overlay writes (steer/throttle/brake/drift/item/lookBack)
//   input.bindings         { action: [KeyboardEvent.code,...] }   input.setBindings(map)   DEFAULT_BINDINGS
//   input.captureNextKey(cb)   rebinding helper: next keydown is passed to cb(code) and swallowed
//   input.pressed(action)  true once per press (pause, camera, respawn, ...)  - edges are cleared by endFrame()
//   input.enabled          gameplay keys are only captured (preventDefault) while true (i.e. during a race)
import { KartInput } from '../physics/Kart.js';
import { clamp, damp } from './math.js';

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

export class Input {
  constructor(settingsProvider = () => ({})) {
    this.settings = settingsProvider;
    this.bindings = structuredCloneSafe(DEFAULT_BINDINGS);
    this.keys = new Set();
    this.edges = new Set();
    this.enabled = false;
    this.override = null;     // debug/test: a KartInput-like object that replaces real input
    this.touch = { active: false, steer: 0, throttle: 0, brake: 0, drift: false, item: false, lookBack: false };
    this.gamepad = { connected: false, id: '' };
    this._steer = 0;
    this._pad = { buttons: [], };
    this._capture = null;
    this.lastDevice = 'keyboard';
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => this._down(e));
      window.addEventListener('keyup', (e) => this._up(e));
      window.addEventListener('blur', () => { this.keys.clear(); });
      window.addEventListener('gamepadconnected', (e) => { this.gamepad.connected = true; this.gamepad.id = e.gamepad.id; });
      window.addEventListener('gamepaddisconnected', () => { this.gamepad.connected = false; });
    }
  }

  setBindings(map) { this.bindings = { ...structuredCloneSafe(DEFAULT_BINDINGS), ...structuredCloneSafe(map ?? {}) }; }
  captureNextKey(cb) { this._capture = cb; }

  _down(e) {
    if (this._capture) { const cb = this._capture; this._capture = null; e.preventDefault(); cb(e.code); return; }
    if (e.repeat) { if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault(); return; }
    this.keys.add(e.code);
    this.lastDevice = 'keyboard';
    for (const [action, codes] of Object.entries(this.bindings)) if (codes.includes(e.code)) this.edges.add(action);
    if (this.enabled && (GAME_KEYS.has(e.code) || Object.values(this.bindings).some((c) => c.includes(e.code)))) e.preventDefault();
  }
  _up(e) { this.keys.delete(e.code); }

  /** True exactly once per press of `action` (keyboard or gamepad). */
  pressed(action) { return this.edges.has(action); }
  /** Call once per frame after everything has consumed edges. */
  endFrame() { this.edges.clear(); }
  isDown(action) { return this.bindings[action]?.some((c) => this.keys.has(c)) ?? false; }

  _pollPad(dt) {
    let pad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) { pad = p; break; }
    } catch { /* gamepad API blocked (e.g. permissions policy) */ }
    if (!pad) { this.gamepad.connected = false; return null; }
    this.gamepad.connected = true; this.gamepad.id = pad.id;
    const dz = this.settings().gamepadDeadzone ?? 0.14;
    const ax = pad.axes[0] ?? 0;
    const steer = Math.abs(ax) < dz ? 0 : Math.sign(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.25);
    const b = (i) => pad.buttons[i]?.pressed ?? false;
    const v = (i) => pad.buttons[i]?.value ?? 0;
    // standard mapping: A(0) gas, B(1) brake, X(2)/LB(4) item, Y(3)/R3(11) look back, RB(5) drift, RT(7)/LT(6) analog, Back(8)/Up(12) camera, Start(9) pause
    const prev = this._pad.buttons;
    const names = { 9: 'pause', 8: 'camera', 12: 'camera' };
    [9, 8, 12].forEach((i) => { if (b(i) && !prev[i]) this.edges.add(names[i]); });
    this._pad.buttons = pad.buttons.map((x) => x.pressed);
    const out = { steer, throttle: Math.max(v(7), b(0) ? 1 : 0), brake: Math.max(v(6), b(1) ? 1 : 0), drift: b(5), item: b(4) || b(2), lookBack: b(3) || b(11) };
    if (Math.abs(steer) > 0.2 || out.throttle > 0.2) this.lastDevice = 'gamepad';
    return out;
  }

  /** Fill `out` (a KartInput) with the current merged input. dt in seconds. */
  read(out, dt = 1 / 60) {
    if (this.override) return out.copy(this.override);
    out.reset();
    if (!this.enabled) { this._steer = 0; return out; }
    const down = (a) => this.isDown(a);
    const kSteerT = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    this._steer = damp(this._steer, kSteerT, kSteerT === 0 ? 16 : 11, dt);
    if (Math.abs(this._steer) < 0.001) this._steer = 0;
    let throttle = down('throttle') ? 1 : 0, brake = down('brake') ? 1 : 0, steer = this._steer;
    let drift = down('drift'), item = down('item'), lookBack = down('lookBack');
    const pad = this._pollPad(dt);
    if (pad) {
      if (Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer;
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
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
export { KartInput };
