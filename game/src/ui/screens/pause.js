// Pause menu: Resume · Restart · Settings · Controls · Quit. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button } from '../components.js';
import { getTrackDef } from '../../modes/catalog.js';
import { formatTime } from '../../core/math.js';
import { SPEED_CLASSES } from '../../data/roster.js';

export const pauseCss = /* css */ `
.s-pause{align-items:center;justify-content:center;}
.s-pause .scrim-all{background:radial-gradient(110% 100% at 50% 45%,rgba(6,9,26,.45),rgba(6,9,26,.86));backdrop-filter:blur(2px);}
.pause-card{width:min(25rem,92vw);padding:1.4rem 1.6rem 1.7rem;display:flex;flex-direction:column;gap:.95rem;align-items:stretch;}
.pause-card .h1{font-size:2.6rem;margin:0;}
.pause-info{display:flex;gap:.5rem;flex-wrap:wrap;margin:.3rem 0 .4rem;}
.pause-card .btn{justify-content:flex-start;}
.pause-card .btn .in{width:100%;}
.pause-card .btn .ico{margin-right:.2rem;}
`;

export class PauseScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Select' }, { k: 'back', label: 'Resume' }]; }
  navOptions() { return { onBack: () => this.resume(), onStart: () => this.resume(), backKeys: this.app.input.bindings?.pause ?? [] }; }

  build() {
    const s = this.app.session;
    const def = s ? getTrackDef(s.config.trackId) : null;
    const mode = { grandprix: 'Grand Prix', timetrial: 'Time Trial', versus: 'Versus' }[s?.config.mode] ?? 'Race';
    const info = h('div', { class: 'pause-info' },
      def ? h('span', { class: 'chip cy' }, icon('flag'), def.name) : null,
      h('span', { class: 'chip or' }, mode),
      s ? h('span', { class: 'chip' }, SPEED_CLASSES[s.config.speedClass]?.name ?? '') : null,
      s?.race?.time > 0 ? h('span', { class: 'chip gd' }, icon('stopwatch'), formatTime(s.race.time)) : null);
    const items = [
      button({ label: 'Resume', icon: 'play', variant: 'green', block: true, def: true, onClick: () => this.resume(), sfx: 'confirm' }),
      button({ label: 'Restart', icon: 'restart', variant: 'glass', block: true, onClick: () => this.restart() }),
      button({ label: 'Settings', icon: 'gear', variant: 'glass', block: true, onClick: () => this.ui.push('settings', { from: 'pause' }) }),
      button({ label: 'Controls', icon: 'gamepad', variant: 'glass', block: true, onClick: () => this.ui.push('help', { from: 'pause', tab: 'controls' }) }),
      button({ label: 'Quit', icon: 'home', variant: 'red', block: true, onClick: () => this.quit() }),
    ];
    items.forEach((b, i) => { b.classList.add('pop'); b.style.setProperty('--i', i); });
    return h('div', { class: 'screen' }, h('div', { class: 'scrim-all' }),
      h('div', { class: 'pause-card panel' }, h('div', { class: 'kicker' }, 'Race paused'), h('h1', { class: 'h1' }, 'Paused'), info, items));
  }

  resume() { this.app.setPaused(false); }

  async restart() {
    const ok = await this.ui.confirm({ title: 'Restart the race?', body: 'You will go back to the starting grid. This race will not count.', confirm: 'Restart', cancel: 'Keep racing', confirmIcon: 'restart' });
    if (ok) this.app.restartRace();
  }

  async quit() {
    const gp = this.app.run?.flow?.mode === 'grandprix' && this.app.run.flow.gp;
    const ok = await this.ui.confirm({
      title: gp ? 'Quit the Grand Prix?' : 'Quit to the main menu?',
      body: gp ? 'Your points for this cup will be lost.' : 'This race will not count.', confirm: 'Quit', cancel: 'Keep racing', danger: true, confirmIcon: 'home',
    });
    if (ok) this.app.quitToMenu();
  }
}
