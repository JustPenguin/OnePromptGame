// Track card: palette gradient + top-down outline + name/difficulty/best time. OWNER: Agent E.
// Used by Time Trial track select, Versus setup, Records and the Grand Prix cup cards.
import { h } from './dom.js';
import { icon } from './icons.js';
import { getTrackOutline, drawOutline, trackColors, trackGradient } from '../modes/catalog.js';
import { formatTime } from '../core/math.js';

export const trackCardCss = /* css */ `
.tcard{position:relative;display:flex;flex-direction:column;width:13.6rem;flex:none;border:0;padding:0;border-radius:1.2rem;overflow:hidden;cursor:pointer;color:#fff;text-align:left;background:#10163a;box-shadow:inset 0 0 0 .12rem rgba(255,255,255,.16),0 .4rem 0 rgba(0,0,0,.34),0 1rem 1.8rem rgba(0,0,0,.35);transition:transform .22s var(--ease-spring),box-shadow .2s;--tc:#ffd23f;}
.tcard .tart{position:relative;height:7.2rem;background:var(--tg);overflow:hidden;}
.tcard .tart::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(0,0,0,.35));pointer-events:none;}
.tcard .tart canvas{position:absolute;inset:.35rem;width:calc(100% - .7rem);height:calc(100% - .7rem);z-index:1;}
.tcard .tbody{padding:.6rem .8rem .7rem;display:flex;flex-direction:column;gap:.28rem;background:linear-gradient(180deg,#1b2562,#10163a);}
.tcard .tn{font-family:var(--font-display);font-size:1.1rem;letter-spacing:.03em;text-transform:uppercase;line-height:1.05;}
.tcard .tm{display:flex;gap:.45rem;align-items:center;font-size:.74rem;color:var(--kr-ink-dim);}
.tcard .tm .ico{font-size:.9rem;}
.tcard .tm .stars{display:inline-flex;gap:.05rem;color:var(--kr-warn);}
.tcard .tb{display:flex;align-items:center;gap:.4rem;font-size:.82rem;color:#dfe6ff;min-height:1.2rem;}
.tcard .tb .ico{font-size:1rem;color:var(--kr-accent-2);}
.tcard .tb em{font-style:normal;color:var(--kr-ink-dim);font-size:.74rem;}
.tcard:hover,.tcard.is-focus{transform:translateY(-.5rem) scale(1.05);box-shadow:inset 0 0 0 .18rem #fff,0 0 1.8rem var(--tc),0 .4rem 0 rgba(0,0,0,.34),0 1.2rem 2rem rgba(0,0,0,.45);}
.tcard.cur::before{content:'';position:absolute;z-index:3;top:.5rem;right:.5rem;width:1.3rem;height:1.3rem;border-radius:50%;background:var(--kr-good) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310300a' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.6l4.7 4.7L19 7.4'/%3E%3C/svg%3E") center/70% no-repeat;box-shadow:0 .1rem .3rem rgba(0,0,0,.5);}
.tcard.locked .tart,.tcard.locked .tbody{filter:grayscale(.85) brightness(.5);}
.tcard .lkov{position:absolute;left:0;right:0;top:0;height:7.2rem;z-index:4;display:none;flex-direction:column;align-items:center;justify-content:center;gap:.25rem;padding:.5rem .7rem;text-align:center;background:rgba(6,9,26,.55);}
.tcard.locked .lkov{display:flex;} .tcard .lkov .ico{font-size:1.8rem;color:#ff9fb4;} .tcard .lkov span{font-size:.74rem;color:#ffe0e8;line-height:1.2;}
.tcard.big{width:100%;}.tcard.big .tart,.tcard.big .lkov{height:12rem;} .tcard.big .tn{font-size:1.6rem;} .tcard.big .tm{font-size:.86rem;}
.tcard.mini{width:5.6rem;border-radius:.8rem;box-shadow:inset 0 0 0 .1rem rgba(255,255,255,.16),0 .2rem 0 rgba(0,0,0,.3);} .tcard.mini .tart{height:3.6rem;} .tcard.mini .tbody{display:none;}
.tcard.shake{animation:shake .4s ease;}
.l-compact .tcard{width:10.4rem;} .l-compact .tcard .tart{height:4.6rem;} .l-compact .tcard .tn{font-size:.9rem;} .l-compact .tcard .tm{font-size:.66rem;}
`;

/** Draw the outline into a canvas (cheap; cached geometry). */
export function paintOutline(canvas, def, o = {}) {
  const col = trackColors(def);
  const outline = getTrackOutline(def.id);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (outline) drawOutline(g, outline, canvas.width, canvas.height, { pad: o.pad ?? 20, lineWidth: o.lineWidth ?? Math.max(5, canvas.width * 0.034), color: '#ffffff', casing: 'rgba(8,12,34,.9)', glow: col.primary });
}

/**
 * @param {object} def  track definition
 * @param {{ tag?:string, locked?:boolean, hint?:string, cur?:boolean, best?:{time:number,cls?:string}|null, big?:boolean, mini?:boolean, nav?:boolean, ghost?:boolean, id?:string }} [o]
 */
export function trackCard(def, o = {}) {
  const col = trackColors(def);
  const canvas = h('canvas', { width: o.big ? 640 : o.mini ? 160 : 360, height: o.big ? 360 : o.mini ? 100 : 200 });
  paintOutline(canvas, def, o.mini ? { pad: 12, lineWidth: 8 } : {});
  const stars = h('span', { class: 'stars' }, Array.from({ length: 3 }, (_, i) => icon(i < (def.difficulty ?? 1) ? 'star' : 'starO')));
  const best = o.best
    ? h('div', { class: 'tb' }, icon('stopwatch'), formatTime(o.best.time), o.best.cls ? h('em', {}, o.best.cls) : null, o.ghost ? icon('ghost') : null)
    : h('div', { class: 'tb' }, h('em', {}, 'No record yet'));
  const el = h(o.tag ?? 'button', {
    ...(o.tag && o.tag !== 'button' ? {} : { type: 'button' }),
    class: `tcard${o.big ? ' big' : ''}${o.mini ? ' mini' : ''}${o.locked ? ' locked' : ''}${o.cur ? ' cur' : ''}`,
    style: { '--tg': trackGradient(def), '--tc': col.primary },
    ...(o.nav === false ? {} : { 'data-nav': '', 'data-sfx': 'select' }),
    'data-id': def.id, 'aria-label': `${def.name}${o.locked ? ', locked' : ''}`, ...(o.locked ? { 'aria-disabled': 'true' } : {}),
  },
  h('div', { class: 'tart' }, canvas),
  h('div', { class: 'tbody' }, h('div', { class: 'tn' }, def.name), h('div', { class: 'tm' }, stars, icon('flag'), `${def.laps ?? 3} laps`), o.showBest === false ? null : best),
  h('div', { class: 'lkov' }, icon('lock'), h('span', {}, o.hint ?? 'Locked')));
  el._repaint = () => paintOutline(canvas, def, o.mini ? { pad: 12, lineWidth: 8 } : {});
  return el;
}
