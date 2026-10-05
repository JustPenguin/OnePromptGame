// HUD widgets: speedometer, minimap, item slot, leaderboard, drift meter. OWNER: Agent E.
// Rules: read kart/session state only; touch the DOM only when a value actually changed; no allocation in update() paths
// beyond what the (rare) rebuilds need.
import { h, svg } from '../dom.js';
import { icon } from '../icons.js';
import { clamp, damp } from '../../core/math.js';
import { portrait } from '../components.js';
import { ITEM_DEFS, ITEM_ORDER, getItemIcon } from '../../items/itemDefs.js';
import { getDriver } from '../../data/roster.js';
import { fitOutline, getTrackOutline } from '../../modes/catalog.js';
import * as KartPhysics from '../../physics/KartPhysics.js';

export const setText = (node, s) => { if (node._t !== s) { node._t = s; node.textContent = s; } };
export const setClass = (el, name, on) => { if (el._c?.[name] !== !!on) { (el._c ??= {})[name] = !!on; el.classList.toggle(name, !!on); } };

// ------------------------------------------------------------------------------------------------ speedometer
export class Speedo {
  constructor() {
    const cx = 110, cy = 112, r = 86;
    const pt = (t, rad = r) => { const a = ((135 + 270 * t) * Math.PI) / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
    const arc = (t0, t1, rad = r) => { const [x0, y0] = pt(t0, rad), [x1, y1] = pt(t1, rad); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${rad} ${rad} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    this.pt = pt;
    const gradId = 'kr-spd-grad';
    const grad = svg('linearGradient', { id: gradId, gradientUnits: 'userSpaceOnUse', x1: 20, y1: 0, x2: 200, y2: 0 },
      svg('stop', { offset: '0', 'stop-color': '#22d3ff' }), svg('stop', { offset: '.5', 'stop-color': '#7be04a' }), svg('stop', { offset: '.78', 'stop-color': '#ffd23f' }), svg('stop', { offset: '1', 'stop-color': '#ff3d6a' }));
    const ticks = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, major = i % 5 === 0;
      const [x0, y0] = pt(t, r - (major ? 21 : 18)), [x1, y1] = pt(t, r - 12);
      ticks.push(svg('line', { class: `tick${major ? ' maj' : ''}`, x1: x0.toFixed(1), y1: y0.toFixed(1), x2: x1.toFixed(1), y2: y1.toFixed(1), 'stroke-width': major ? 2.6 : 1.6, 'stroke-linecap': 'round' }));
    }
    this.fill = svg('path', { class: 'fill', d: arc(0, 1), fill: 'none', stroke: `url(#${gradId})`, 'stroke-width': 13, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '0 100' });
    this.tip = svg('circle', { class: 'tip', r: 5.5, cx: pt(0)[0], cy: pt(0)[1] });
    const svgEl = svg('svg', { viewBox: '0 0 220 150', 'aria-hidden': 'true' },
      svg('defs', {}, grad),
      svg('path', { class: 'trk', d: arc(0, 1), fill: 'none', 'stroke-width': 22, 'stroke-linecap': 'round' }),
      svg('path', { class: 'rim', d: arc(0, 1, r + 14), fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      ticks, this.fill, this.tip);
    this.num = h('b', {}, '0');
    this.unit = h('span', {}, 'km/h');
    this.el = h('div', { class: 'speedo', 'aria-label': 'Speed' }, svgEl, h('div', { class: 'num' }, this.num, this.unit), h('div', { class: 'boostlbl' }, 'BOOST'));
    this._v = 0; this._shownT = -1; this._max = 180;
  }

  /** value in the display unit; max = full-scale value in that unit */
  update(dt, value, max, unit, boosting, snap) {
    this._v = snap ? value : damp(this._v, value, 16, dt);
    const t = clamp(this._v / max, 0, 1);
    if (Math.abs(t - this._shownT) > 0.0015) {
      this._shownT = t;
      this.fill.setAttribute('stroke-dasharray', `${Math.max(0.01, t * 100).toFixed(2)} 100`);
      this.fill.style.opacity = t < 0.004 ? '0' : '1';
      const [x, y] = this.pt(t);
      this.tip.setAttribute('cx', x.toFixed(1)); this.tip.setAttribute('cy', y.toFixed(1));
      this.tip.style.opacity = t < 0.004 ? '0' : '1';
    }
    setText(this.num, String(Math.round(this._v)));
    setText(this.unit, unit);
    setClass(this.el, 'boost', boosting);
  }
}

// ------------------------------------------------------------------------------------------------ minimap
export class Minimap {
  constructor() {
    this.canvas = h('canvas', {});
    this.el = h('div', { class: 'mini glass', 'aria-hidden': 'true' }, this.canvas);
    this.base = null; this.px = 0; this.outline = null; this.fit = null; this.acc = 1;
  }

  setTrack(session) {
    const m = session.track?.minimap;
    this.outline = m?.points?.length ? m : getTrackOutline(session.track?.id ?? session.config.trackId);
    this.base = null; this.px = 0;
  }

  _rebuild(px) {
    this.px = px;
    this.canvas.width = this.canvas.height = px;
    this.fit = this.outline ? fitOutline(this.outline, px, px, px * 0.1) : null;
    const b = document.createElement('canvas');
    b.width = b.height = px;
    const g = b.getContext('2d');
    if (this.outline && this.fit) {
      g.lineJoin = g.lineCap = 'round';
      const path = () => { g.beginPath(); this.outline.points.forEach((p, i) => { const [x, y] = this.fit.project(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
      const w = px * 0.062;
      path(); g.strokeStyle = 'rgba(4,7,22,.92)'; g.lineWidth = w * 1.75; g.stroke();
      path(); g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = w; g.stroke();
      path(); g.strokeStyle = 'rgba(120,150,230,.5)'; g.lineWidth = w * 0.45; g.stroke();
      // start / finish line: a short chequered bar across the road
      const s0 = this.outline.points[0], s1 = this.outline.points[1];
      const [ax, ay] = this.fit.project(s0), [bx, by] = this.fit.project(s1);
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, hw = w * 0.9;
      g.strokeStyle = '#ffd23f'; g.lineWidth = w * 0.55; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(ax - nx * hw, ay - ny * hw); g.lineTo(ax + nx * hw, ay + ny * hw); g.stroke();
    }
    this.base = b;
  }

  /** Redraw (call at ~20 Hz). */
  draw(session) {
    const css = this.canvas.clientWidth || 120;
    const px = Math.max(64, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
    if (!this.base || px !== this.px) this._rebuild(px);
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, px, px);
    g.drawImage(this.base, 0, 0);
    if (!this.fit) return;
    const karts = session.race?.order ?? session.karts;
    const me = session.player;
    const R = px * 0.034;
    for (let i = karts.length - 1; i >= 0; i--) {
      const k = karts[i];
      if (k === me) continue;
      const [x, y] = this.fit.project([k.position.x, k.position.z]);
      g.beginPath(); g.arc(x, y, R, 0, 6.2832);
      g.fillStyle = k.driver?.colors?.primary ?? '#fff'; g.fill();
      g.lineWidth = px * 0.012; g.strokeStyle = 'rgba(4,7,22,.9)'; g.stroke();
    }
    const gk = session.ghostPlayer?.kart ?? session.ghostPlayer?.ghost;
    if (gk?.position) {
      const [x, y] = this.fit.project([gk.position.x, gk.position.z]);
      g.globalAlpha = 0.6; g.beginPath(); g.arc(x, y, R, 0, 6.2832); g.fillStyle = '#cfe6ff'; g.fill(); g.globalAlpha = 1;
    }
    if (me) {
      const [x, y] = this.fit.project([me.position.x, me.position.z]);
      const fx = -Math.sin(me.yaw), fy = -Math.cos(me.yaw), r2 = R * 1.9;
      g.beginPath();
      g.moveTo(x + fx * r2, y + fy * r2);
      g.lineTo(x - fx * r2 * 0.7 - fy * r2 * 0.75, y - fy * r2 * 0.7 + fx * r2 * 0.75);
      g.lineTo(x - fx * r2 * 0.35, y - fy * r2 * 0.35);
      g.lineTo(x - fx * r2 * 0.7 + fy * r2 * 0.75, y - fy * r2 * 0.7 - fx * r2 * 0.75);
      g.closePath();
      g.fillStyle = me.driver?.colors?.primary ?? '#ff7a1a'; g.fill();
      g.lineWidth = px * 0.026; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.stroke();
    }
  }

  update(dt, session) { this.acc += dt; if (this.acc >= 0.05) { this.acc = 0; this.draw(session); } }
}

// ------------------------------------------------------------------------------------------------ item slot
export class ItemSlot {
  constructor() {
    this.canvas = h('canvas', { width: 128, height: 128 });
    this.q = h('span', { class: 'q' }, '?');
    this.count = h('span', { class: 'item-count' });
    this.name = h('div', { class: 'item-name' });
    this.hint = h('div', { class: 'item-hint' });
    this.frame = h('div', { class: 'item-frame' }, this.q, this.canvas, this.count);
    this.el = h('div', { class: 'item', 'aria-label': 'Item' }, this.frame, h('div', { class: 'item-meta' }, this.name, this.hint));
    this.shown = null; this.prevType = null; this.prevRoul = false; this.gotT = 0;
    this.canvas.style.display = 'none';
  }

  _draw(id) {
    if (this.shown === id) return;
    this.shown = id;
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    if (id) { try { g.drawImage(getItemIcon(id, 128), 0, 0, 128, 128); } catch { /* icons are decoration */ } }
    this.canvas.style.display = id ? '' : 'none';
    this.q.style.display = id ? 'none' : '';
  }

  setHint(node) { this.hint.replaceChildren(node ?? ''); }

  update(kart, t, dt) {
    const it = kart.item;
    const roul = it.roulette.active;
    const type = it.type;
    if (roul) {
      const id = it.roulette.shown ?? ITEM_ORDER[Math.floor(t * 13) % ITEM_ORDER.length];
      this._draw(id);
      setText(this.name, '…'); setText(this.count, '');
    } else if (type) {
      this._draw(type);
      setText(this.name, ITEM_DEFS[type]?.name ?? type);
      setText(this.count, it.count > 1 ? `×${it.count}` : '');
      this.frame.style.setProperty('--ic', ITEM_DEFS[type]?.color ?? '#22d3ff');
    } else {
      this._draw(null); setText(this.name, ''); setText(this.count, '');
    }
    this.count.style.display = !roul && type && it.count > 1 ? '' : 'none';
    if ((!roul && type && (this.prevRoul || this.prevType !== type)) ) { this.el.classList.remove('got'); void this.el.offsetWidth; this.el.classList.add('got'); }
    this.prevRoul = roul; this.prevType = type;
    setClass(this.el, 'roulette', roul);
    setClass(this.el, 'has', !roul && !!type);
    this.hasItem = !roul && !!type;
  }
}

// ------------------------------------------------------------------------------------------------ leaderboard
export class Leaderboard {
  constructor() { this.el = h('div', { class: 'board', 'aria-label': 'Standings' }); this.sig = ''; this.acc = 1; this.max = 5; }

  update(dt, session) {
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    const order = session.race?.order ?? session.karts;
    const me = session.player;
    const n = Math.min(this.max, order.length);
    const top = order.slice(0, n);
    const showMe = me && !top.includes(me);
    const sig = top.map((k) => k.id).join(',') + (showMe ? `|${me.id}:${me.race.place}` : '') + `/${order.length}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const row = (k, place) => h('div', { class: `br p${place}${k === me ? ' me' : ''}` },
      h('span', { class: 'bp' }, String(place)), portrait(k.driverId, 22), h('span', { class: 'bn' }, k.isPlayer ? (k.name ?? getDriver(k.driverId).name) : getDriver(k.driverId).name));
    const rows = top.map((k, i) => row(k, i + 1));
    if (showMe) rows.push(h('div', { class: 'gap' }), row(me, me.race.place));
    this.el.replaceChildren(...rows);
  }
}

// ------------------------------------------------------------------------------------------------ drift / mini-turbo meter
export class DriftMeter {
  constructor() {
    this.segs = [0, 1, 2].map(() => h('i'));
    this.el = h('div', { class: 'dmeter', 'aria-hidden': 'true' }, this.segs);
    this.label = h('div', { class: 'driftlbl' });
    this.prevLevel = 0;
    this.times = KartPhysics['DRIFT_LEVEL_TIME'] ?? [0.85, 1.7, 2.7];
  }

  update(kart) {
    const d = kart.drift;
    const on = d.dir !== 0;
    setClass(this.el, 'on', on);
    if (!on) { this.prevLevel = 0; for (const s of this.segs) { s.style.setProperty('--f', '0'); s.classList.remove('lit'); } return; }
    const T = this.times;
    // Agent A may expose kart.driftProgress (0..1 toward the NEXT level); otherwise derive it from the charge and the level times
    const prog = Number.isFinite(kart.driftProgress) ? kart.driftProgress : null;
    for (let i = 0; i < 3; i++) {
      const lo = i === 0 ? 0 : T[i - 1], hi = T[i];
      const f = d.level > i ? 1 : d.level === i ? (prog ?? clamp((d.charge - lo) / (hi - lo), 0, 1)) : 0;
      this.segs[i].style.setProperty('--f', f.toFixed(3));
      const lit = d.level > i;
      if (lit && !this.segs[i].classList.contains('lit')) { this.segs[i].classList.add('lit'); }
      else if (!lit) this.segs[i].classList.remove('lit');
    }
    this.prevLevel = d.level;
  }
}

// ------------------------------------------------------------------------------------------------ hold-to-respawn ring
export class RespawnRing {
  constructor() {
    const r = 26, c = 2 * Math.PI * r;
    this.c = c;
    this.arc = svg('circle', { cx: 32, cy: 32, r, fill: 'none', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-dasharray': `0 ${c}`, transform: 'rotate(-90 32 32)', class: 'rr-arc' });
    this.el = h('div', { class: 'respawn-ring', 'aria-hidden': 'true' },
      svg('svg', { viewBox: '0 0 64 64', class: 'rr-svg' }, svg('circle', { cx: 32, cy: 32, r, fill: 'none', 'stroke-width': 7, class: 'rr-bg' }), this.arc),
      icon('restart'), h('span', {}, 'Respawning'));
    this.v = -1;
  }
  update(v) {
    const on = v > 0.03;
    setClass(this.el, 'on', on);
    if (!on) { this.v = -1; return; }
    if (Math.abs(v - this.v) > 0.004) { this.v = v; this.arc.setAttribute('stroke-dasharray', `${(this.c * Math.min(1, v)).toFixed(1)} ${this.c.toFixed(1)}`); }
  }
}

export { icon };
