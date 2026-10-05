// Centre-screen HUD pieces: countdown, banners, wrong-way warning, intro card, event feed. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { keycap } from '../components.js';
import { ordinal, formatTime } from '../../core/math.js';

/** Restart a CSS animation class on an element. */
export function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

export class Countdown {
  constructor() {
    this.burst = h('div', { class: 'burst' });
    this.num = h('div', { class: 'cd' });
    this.hint = h('div', { class: 'cdhint hint' });
    this.el = h('div', { class: 'hz c' }, this.burst, this.num, this.hint);
  }

  /** gasNode: keycap / glyph / text shown in the rocket-start hint. */
  show(count, gasNode) {
    const go = count === 0;
    this.num.className = `cd ${go ? 'go' : 'n' + count}`;
    this.num.textContent = go ? 'GO!' : String(count);
    replay(this.num, 'show');
    replay(this.burst, 'show');
    if (count === 3) {
      this.hint.replaceChildren(icon('rocket'), 'Hold ', gasNode, ' when ', h('b', {}, '1'), ' appears for a rocket start');
      this.hint.classList.add('on');
    } else if (count === 1 || go) this.hint.classList.remove('on');
  }
  hideHint() { this.hint.classList.remove('on'); }
  /** Agent A's race.rocketWindowOpen: the 0.45 s before GO where pressing the gas gives the rocket start. */
  setWindow(on) { if (this._w !== on) { this._w = on; this.num.classList.toggle('rwin', on); this.hint.classList.toggle('hot', on); } }
}

export class Banners {
  constructor() {
    this.finalBanner = h('div', { class: 'banner final' }, h('div', {}, 'Final lap!'));
    this.finBanner = h('div', { class: 'banner fin stay' }, h('div', {}, h('span', { class: 'fp' }), h('small', {})));
    this.wrong = h('div', { class: 'wrongway', role: 'alert' }, icon('down'), 'Wrong way', icon('down'));
    this.photo = h('div', { class: 'banner photo' }, h('div', {}, 'Photo finish!', h('small', {})));
    this.el = h('div', { class: 'hz c' }, this.finalBanner, this.finBanner, this.photo, this.wrong);
  }
  final() { replay(this.finalBanner, 'show'); }
  finish(place, time, name = 'Finish!') {
    this.finBanner.querySelector('.fp').textContent = place === 1 ? 'Winner!' : `${ordinal(place)} place`;
    this.finBanner.querySelector('small').textContent = Number.isFinite(time) ? `${name}  ·  ${formatTime(time)}` : name;
    replay(this.finBanner, 'show');
  }
  clearFinish() { this.finBanner.classList.remove('show'); this.finBanner.style.opacity = '0'; }
  wrongWay(on) { this.wrong.classList.toggle('on', !!on); }
  /** Agent A's EV.PHOTO_FINISH: a banner while the finish slow-motion plays. */
  photoFinish(active, rival) {
    if (active) { this.photo.querySelector('small').textContent = rival ? `vs ${rival}` : ''; this.photo.style.opacity = '1'; replay(this.photo, 'show'); }
    else { this.photo.classList.remove('show'); this.photo.style.opacity = '0'; }
  }
}

export class IntroCard {
  constructor() {
    this.k = h('div', { class: 'ik' });
    this.t = h('div', { class: 'it' });
    this.m = h('div', { class: 'im' });
    this.el = h('div', { class: 'intro' }, this.k, this.t, this.m);
  }
  show({ kicker, title, laps, stars }) {
    this.k.textContent = kicker; this.t.textContent = title;
    this.m.replaceChildren(h('span', {}, `${laps} lap${laps === 1 ? '' : 's'}`), h('span', { class: 'stars' }, Array.from({ length: 3 }, (_, i) => icon(i < stars ? 'star' : 'starO'))));
    replay(this.el, 'show');
  }
  hide() { this.el.classList.remove('show'); this.el.style.opacity = '0'; }
}

export class EventFeed {
  constructor() { this.el = h('div', { class: 'evs', 'aria-live': 'polite' }); this.max = 3; }
  /** kind: good | bad | gold | cy */
  push(text, { ico = 'bolt', kind = 'cy', ms = 2100 } = {}) {
    const el = h('div', { class: `ev ${kind}` }, icon(ico), text);
    this.el.appendChild(el);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
  }
  clear() { this.el.replaceChildren(); }
}

export { keycap };
