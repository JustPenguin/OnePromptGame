// PLACEHOLDER HUD (replaced by the full HUD in the next commit).
import { h } from '../dom.js';
import { formatTime, ordinal } from '../../core/math.js';

export class Hud {
  constructor(ui, session) {
    this.ui = ui; this.session = session;
    this.tl = h('div', { style: { position: 'absolute', top: '1rem', left: '1.2rem', fontSize: '2rem' } });
    this.tr = h('div', { style: { position: 'absolute', top: '1rem', right: '1.2rem', fontSize: '4rem', color: 'var(--kr-warn)' } });
    this.br = h('div', { style: { position: 'absolute', bottom: '1rem', right: '1.4rem', fontSize: '2.6rem' } });
    this.root = h('div', { class: 'hud' }, this.tl, this.tr, this.br);
  }
  update(dt, session) {
    const k = session.player; if (!k) return;
    this.tl.textContent = `LAP ${k.race.lap}/${session.race.lapCount}  ${formatTime(session.race.time)}`;
    this.tr.textContent = ordinal(k.race.place);
    this.br.textContent = `${Math.round(Math.abs(k.speed) * 3.6)} km/h`;
  }
  destroy() {}
}
