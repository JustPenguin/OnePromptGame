// Full-screen status effects (boost glow, shield/star/rocket/shrink edges, ink splat) + status chips. OWNER: Agent E.
// Layers are plain divs whose opacity is eased every frame; they never receive pointer events.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { clamp, damp } from '../../core/math.js';
import { setText } from './widgets.js';

const INK_BLOBS = 7;

export class Effects {
  constructor() {
    this.boost = h('div', { class: 'fx fx-boost' });
    this.shield = h('div', { class: 'fx fx-star' });
    this.rocket = h('div', { class: 'fx fx-rocket' });
    this.shrink = h('div', { class: 'fx fx-shrink' });
    this.ink = h('div', { class: 'fx fx-ink' });
    this.el = h('div', { class: 'fxwrap', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, this.boost, this.shield, this.rocket, this.shrink, this.ink);
    this.v = { boost: 0, shield: 0, rocket: 0, shrink: 0, ink: 0 };
    this.prevInk = 0;
    this.reduceFlashes = false;
  }

  _splat() {
    this.ink.replaceChildren();
    for (let i = 0; i < INK_BLOBS; i++) {
      const size = 16 + Math.random() * 26;                 // % of the viewport's smaller side
      const b = h('i', { style: { width: `${size}vmin`, height: `${size * (0.8 + Math.random() * 0.35)}vmin`, left: `${6 + Math.random() * 78}%`, top: `${4 + Math.random() * 62}%`, transform: 'scale(.1)', transition: `transform ${0.18 + Math.random() * 0.2}s cubic-bezier(.2,1.4,.4,1)` } });
      this.ink.appendChild(b);
      requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transform = `scale(1) rotate(${Math.round(Math.random() * 40 - 20)}deg)`; }));
    }
  }

  update(dt, kart, snap) {
    const k = snap ? 1 : 1 - Math.exp(-14 * dt);
    const boostT = kart.boost.timer > 0 ? clamp(0.45 + kart.boost.strength * 1.3, 0.3, 1) : 0;
    const ease = (key, target, el, max = 1) => {
      this.v[key] += (target - this.v[key]) * k;
      const o = this.v[key] < 0.01 ? 0 : this.v[key] * max;
      const s = o.toFixed(2);
      if (el._o !== s) { el._o = s; el.style.opacity = s; }
    };
    // boost: pulse gently unless the player asked for fewer flashes
    const pulse = this.reduceFlashes ? 1 : 0.88 + 0.12 * Math.sin(performance.now() * 0.02);
    ease('boost', boostT, this.boost, pulse);
    ease('shield', kart.invincible > 0 ? (kart.invincible < 1 ? kart.invincible : 1) : 0, this.shield, 0.85);
    ease('rocket', kart.rocket > 0 ? 1 : 0, this.rocket, 0.9);
    ease('shrink', kart.shrink > 0 ? 1 : 0, this.shrink, 0.9);
    // ink: new splat on the rising edge; fully opaque until the last second and a half, then wipes away
    if (kart.ink > 0 && this.prevInk <= 0) this._splat();
    this.prevInk = kart.ink;
    const inkT = kart.ink > 0 ? clamp(kart.ink / 1.5, 0, 1) : 0;
    this.v.ink += (inkT - this.v.ink) * (snap ? 1 : 1 - Math.exp(-10 * dt));
    const os = (this.v.ink < 0.01 ? 0 : this.v.ink).toFixed(2);
    if (this.ink._o !== os) { this.ink._o = os; this.ink.style.opacity = os; }
  }
}

/** Little pills for timed effects: invincible / shrunk / rocket / ink. */
export class StatusChips {
  constructor() {
    this.el = h('div', { class: 'status' });
    this.chips = {};
    const mk = (id, ico, label, color) => {
      const t = h('small', {});
      const el = h('div', { class: 'chipst', style: { '--sc': color, display: 'none' } }, icon(ico), label, t);
      this.el.appendChild(el);
      this.chips[id] = { el, t };
    };
    mk('invincible', 'shield', 'Shield ', '#22d3ff');
    mk('rocket', 'rocket', 'Rocket ', '#ff7a1a');
    mk('shrink', 'bolt', 'Shrunk ', '#a878ff');
  }
  update(kart) {
    const set = (id, t) => {
      const c = this.chips[id];
      const on = t > 0;
      const d = on ? '' : 'none';
      if (c.el.style.display !== d) c.el.style.display = d;
      if (on) setText(c.t, `${Math.ceil(t)}s`);
    };
    set('invincible', kart.invincible); set('rocket', kart.rocket); set('shrink', kart.shrink);
  }
}
