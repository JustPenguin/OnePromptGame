// Loading: a track card with live progress and rotating tips. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { portrait } from '../components.js';
import { getTrackDef, getCup, cupOfTrack, getTrackOutline, drawOutline, trackColors, trackGradient } from '../../modes/catalog.js';
import { getDriver, getBody, SPEED_CLASSES } from '../../data/roster.js';

export const TIPS = [
  'Tap drift while turning to hop into a slide. Hold it to charge a mini-turbo.',
  'Release a charged drift for a boost: blue is small, orange is better, pink is the biggest kick.',
  'Hold the accelerator as the countdown reaches 1 for a rocket start.',
  'The further back you are, the better the items in the boxes.',
  'Hold the brake while using an item to throw it backwards.',
  'Leaving the road slows you down. Heavy karts lose less speed on the grass.',
  'Stay close behind a rival to catch their slipstream.',
  'Boost pads, drift boosts and items all stack. Chain them together.',
  'Grand Prix points: 15 for first, 12 for second, 10 for third.',
  'Press C to change the camera view and Q to look behind you.',
  'Stuck? Press R to get a lift back onto the track.',
  'Win races, drift and earn trophies to unlock new drivers, karts and cups.',
];

export const loadingCss = /* css */ `
.s-loading{align-items:center;justify-content:center;}
.ld-card{width:min(54rem,94vw);padding:1.6rem 1.8rem 1.4rem;display:grid;grid-template-columns:minmax(0,1fr) 14rem;gap:1.2rem 1.8rem;overflow:hidden;}
.ld-card::before{content:'';position:absolute;inset:0;background:var(--tg);opacity:.32;border-radius:inherit;pointer-events:none;}
.ld-card > *{position:relative;}
.ld-main .kicker{color:var(--tc,#22d3ff);}
.ld-main .h1{font-size:3rem;margin:.2rem 0 .5rem;}
.ld-desc{font-size:1rem;color:#dfe6ff;max-width:26rem;}
.ld-meta{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem;}
.ld-map{display:grid;place-items:center;border-radius:1rem;background:rgba(6,9,26,.55);box-shadow:inset 0 0 0 .1rem var(--line);aspect-ratio:1;align-self:start;}
.ld-map canvas{width:100%;height:100%;display:block;}
.ld-racer{grid-column:1/-1;display:flex;align-items:center;gap:.8rem;}
.ld-racer .portrait{width:3rem;height:3rem;}
.ld-bar{grid-column:1/-1;}
.bar{position:relative;height:1.05rem;border-radius:99px;background:rgba(0,0,0,.4);box-shadow:inset 0 .1rem .3rem rgba(0,0,0,.5);overflow:hidden;transform:skewX(-14deg);}
.bar i{position:absolute;left:0;top:0;bottom:0;width:0%;border-radius:99px;background:linear-gradient(90deg,#ff7a1a,#ffd23f);box-shadow:0 0 1rem rgba(255,160,40,.7);transition:width .25s ease-out;}
.bar i::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.28) 0 .6rem,transparent .6rem 1.2rem);animation:bar-slide .8s linear infinite;}
@keyframes bar-slide{to{background-position:1.2rem 0}}
.ld-msg{display:flex;justify-content:space-between;margin-top:.55rem;font-size:.9rem;color:var(--kr-ink-dim);}
.ld-tip{grid-column:1/-1;display:flex;gap:.7rem;align-items:flex-start;font-size:.95rem;color:#e8eeff;min-height:2.6rem;}
.ld-tip .ico{font-size:1.3rem;color:var(--kr-warn);margin-top:.1rem;}
.l-portrait .ld-card{grid-template-columns:1fr;} .l-portrait .ld-map{max-width:12rem;justify-self:center;order:-1;} .l-portrait .ld-main .h1{font-size:2.3rem;}
.l-compact .ld-card{padding:.9rem 1.2rem;grid-template-columns:minmax(0,1fr) 8.5rem;gap:.6rem 1.2rem;} .l-compact .ld-main .h1{font-size:2rem;margin:0 0 .2rem;} .l-compact .ld-desc{display:none;} .l-compact .ld-tip{min-height:0;font-size:.8rem;} .l-compact .ld-racer{display:none;}
`;

export class LoadingScreen extends Screen {
  get stage() { return { preset: 'dim', kart: true, comp: { x: 0, y: 0 }, theme: this._theme }; }
  hints() { return []; }
  navOptions() { return { onBack: () => {}, autofocus: false }; }

  build() {
    const cfg = this.params.config ?? {};
    const def = getTrackDef(cfg.trackId);
    const col = trackColors(def);
    this._theme = { primary: col.primary, secondary: col.secondary };
    const cup = cupOfTrack(def.id);
    const player = cfg.player ?? {};
    const driver = getDriver(player.driverId), body = getBody(player.bodyId);
    const cls = SPEED_CLASSES[cfg.speedClass]?.name ?? '';
    const modeName = { grandprix: 'Grand Prix', timetrial: 'Time Trial', versus: 'Versus Race' }[cfg.mode] ?? 'Race';
    const gp = cfg.extra?.gp;

    this.canvas = h('canvas', { width: 280, height: 280 });
    const outline = getTrackOutline(def.id);
    if (outline) drawOutline(this.canvas.getContext('2d'), outline, 280, 280, { pad: 26, lineWidth: 9, color: col.primary, glow: col.primary });
    this.fill = h('i');
    this.msg = h('span', {}, 'Starting…');
    this.pct = h('span', {}, '0%');
    this.tip = h('span', {}, TIPS[Math.floor(Math.random() * TIPS.length)]);
    this._tipTimer = setInterval(() => { this.tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }, 4200);
    const stars = Array.from({ length: 3 }, (_, i) => icon(i < (def.difficulty ?? 1) ? 'star' : 'starO'));
    return h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      h('div', { class: 'ld-card panel', style: { '--tg': trackGradient(def, 180), '--tc': col.primary } },
        h('div', { class: 'ld-main' },
          h('div', { class: 'kicker' }, [modeName, gp ? `Race ${gp.index + 1} of ${gp.total}` : null, cup?.name].filter(Boolean).join('  ·  ')),
          h('h1', { class: 'h1' }, def.name),
          h('div', { class: 'ld-desc' }, def.description ?? ''),
          h('div', { class: 'ld-meta' },
            h('span', { class: 'chip cy' }, icon('flag'), `${cfg.laps ?? def.laps ?? 3} laps`),
            h('span', { class: 'chip or' }, icon('gauge'), cls),
            h('span', { class: 'chip gd' }, stars))),
        h('div', { class: 'ld-map' }, this.canvas),
        h('div', { class: 'ld-racer' }, portrait(player.driverId ?? 'pip', 48), h('div', {}, h('div', { class: 'disp', style: { fontSize: '1.2rem' } }, driver.name), h('div', { class: 'small dim' }, body.name))),
        h('div', { class: 'ld-bar' }, h('div', { class: 'bar' }, this.fill), h('div', { class: 'ld-msg' }, this.msg, this.pct)),
        h('div', { class: 'ld-tip' }, icon('tip'), this.tip)));
  }

  /** progress 0..1 */
  set(p, msg) {
    if (!this.fill) return;
    const v = Math.max(0, Math.min(1, p));
    this.fill.style.width = `${(v * 100).toFixed(0)}%`;
    this.pct.textContent = `${Math.round(v * 100)}%`;
    if (msg) this.msg.textContent = msg;
  }

  destroy() { clearInterval(this._tipTimer); }
}
