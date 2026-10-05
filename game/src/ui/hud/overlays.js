// Full-screen status effects (boost glow, shield/star/rocket/shrink edges, ink splat) + status chips. OWNER: Agent E.
// Layers are plain divs whose opacity is eased every frame; they never receive pointer events.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { clamp, damp } from '../../core/math.js';
import { setText } from './widgets.js';

const INK_BLOBS = 6;
const rnd = (a, b) => a + Math.random() * (b - a);

/** One organic ink splat: a wobbly closed curve, glossy radial fill, flung droplets and a drip or two. */
function drawSplat(g, cx, cy, r) {
  const n = 16;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.08, 0.08);
    const spike = Math.random() < 0.2 ? rnd(1.25, 1.55) : 1;
    const rr = r * rnd(0.72, 1.12) * spike;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const path = () => {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (i === 0) { const pl = pts[n - 1]; g.moveTo((pl[0] + p0[0]) / 2, (pl[1] + p0[1]) / 2); }
      g.quadraticCurveTo(p0[0], p0[1], mx, my);
    }
    g.closePath();
  };
  // drips first (they sit behind the body)
  const drips = Math.floor(rnd(1, 3.4));
  for (let d = 0; d < drips; d++) {
    const x = cx + rnd(-0.6, 0.6) * r, len = r * rnd(0.5, 1.15), w = r * rnd(0.09, 0.16);
    g.fillStyle = '#150d38';
    g.beginPath(); g.roundRect?.(x - w / 2, cy + r * 0.3, w, len, w / 2); g.fill();
    g.beginPath(); g.arc(x, cy + r * 0.3 + len, w * 0.85, 0, 6.2832); g.fill();
  }
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.08, cx, cy, r * 1.25);
  grad.addColorStop(0, '#56429e'); grad.addColorStop(0.28, '#271a5a'); grad.addColorStop(0.7, '#0e0830'); grad.addColorStop(1, '#070418');
  path(); g.fillStyle = grad; g.fill();
  g.lineWidth = r * 0.04; g.strokeStyle = 'rgba(150,130,255,.28)'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.2)';
  g.beginPath(); g.ellipse(cx - r * 0.38, cy - r * 0.42, r * 0.2, r * 0.1, -0.5, 0, 6.2832); g.fill();
  // flung droplets
  const m = Math.floor(rnd(4, 9));
  for (let i = 0; i < m; i++) {
    const a = rnd(0, 6.2832), dd = r * rnd(1.25, 1.95), rr = r * rnd(0.05, 0.13);
    g.fillStyle = '#12093a';
    g.beginPath(); g.arc(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, rr, 0, 6.2832); g.fill();
  }
}

export class Effects {
  constructor() {
    this.boost = h('div', { class: 'fx fx-boost' });
    this.shield = h('div', { class: 'fx fx-star' });
    this.rocket = h('div', { class: 'fx fx-rocket' });
    this.shrink = h('div', { class: 'fx fx-shrink' });
    this.inkCanvas = h('canvas', { width: 960, height: 540 });
    this.ink = h('div', { class: 'fx fx-ink' }, this.inkCanvas);
    this.el = h('div', { class: 'fxwrap', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, this.boost, this.shield, this.rocket, this.shrink, this.ink);
    this.v = { boost: 0, shield: 0, rocket: 0, shrink: 0, ink: 0 };
    this.prevInk = 0;
    this.reduceFlashes = false;
  }

  _splat() {
    const c = this.inkCanvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < INK_BLOBS; i++) {
      const big = i < 2;
      drawSplat(g, c.width * rnd(0.14, 0.86), c.height * rnd(big ? 0.18 : 0.08, big ? 0.55 : 0.7), Math.min(c.width, c.height) * (big ? rnd(0.17, 0.25) : rnd(0.08, 0.15)));
    }
    this.ink.classList.remove('splat'); void this.ink.offsetWidth; this.ink.classList.add('splat');
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
    mk('draft', 'flame', 'Slipstream', '#7be04a');
    this.chips.draft.t.style.display = 'none';
    this.draft = false;
  }

  /** Agent A's EV.DRAFT: a chip while the player is slipstreaming. */
  setDraft(on) { this.draft = !!on; }
  update(kart) {
    const set = (id, t) => {
      const c = this.chips[id];
      const on = t > 0;
      const d = on ? '' : 'none';
      if (c.el.style.display !== d) c.el.style.display = d;
      if (on) setText(c.t, `${Math.ceil(t)}s`);
    };
    set('invincible', kart.invincible); set('rocket', kart.rocket); set('shrink', kart.shrink);
    const d = this.draft ? '' : 'none';
    if (this.chips.draft.el.style.display !== d) this.chips.draft.el.style.display = d;
  }
}
