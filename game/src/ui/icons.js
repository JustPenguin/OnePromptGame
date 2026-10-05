// Icon set: original, hand-built SVG glyphs on a 24x24 grid (no emoji, no external assets). OWNER: Agent E.
//   icon('trophy', { size: '1.2em', cls: 'x' }) -> <svg class="ico ...">
// "stroke" icons (s: true) inherit colour from `currentColor`; solid ones fill with it.
import { svg } from './dom.js';

const f = (n) => +n.toFixed(2);
const starPoints = (cx, cy, ro, ri, n = 5) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro; const a = -Math.PI / 2 + (i * Math.PI) / n; pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`); }
  return pts.join(' ');
};
const cogPath = (cx, cy, teeth, ro, ri, hole) => {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const pt = (r, da) => `${f(cx + r * Math.cos(a + da))} ${f(cy + r * Math.sin(a + da))}`;
    d += `${i ? 'L' : 'M'}${pt(ri, -step * 0.5 + step * 0.06)}L${pt(ri, -step * 0.28)}L${pt(ro, -step * 0.17)}L${pt(ro, step * 0.17)}L${pt(ri, step * 0.28)}`;
  }
  d += 'Z';
  d += `M${cx + hole} ${cy}a${hole} ${hole} 0 1 0 ${-hole * 2} 0a${hole} ${hole} 0 1 0 ${hole * 2} 0Z`;
  return d;
};
const checks = (() => {
  let s = '';
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) if ((i + j) % 2 === 0) s += `<rect x="${8.6 + i * 3}" y="${3.4 + j * 3}" width="3" height="3"/>`;
  return s;
})();

/** name -> { s: stroke-style?, b: inner markup } */
const ICONS = {
  play: { b: '<path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z"/>' },
  flag: { b: `<path d="M5 3.2a1.3 1.3 0 0 1 2.6 0v17.6a1.3 1.3 0 0 1-2.6 0z"/>${checks}` },
  trophy: { b: '<path d="M7 3.2h10v6.1a5 5 0 0 1-10 0z"/><path d="M7 5H4.4v2a3.6 3.6 0 0 0 3.3 3.6M17 5h2.6v2a3.6 3.6 0 0 1-3.3 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="10.8" y="13.8" width="2.4" height="3.6"/><path d="M7.6 18.3h8.8a1 1 0 0 1 1 1V21H6.6v-1.7a1 1 0 0 1 1-1z"/>' },
  stopwatch: { s: true, b: '<circle cx="12" cy="13.5" r="7.6"/><path d="M12 13.5V9.2M9.6 2.8h4.8M12 2.8v3M18.6 6.4l1.4-1.4"/>' },
  users: { b: '<circle cx="9" cy="8.2" r="3.3"/><path d="M2.6 19.5c0-3.5 2.8-5.8 6.4-5.8s6.4 2.3 6.4 5.8z"/><path d="M15.6 5.2a3.1 3.1 0 0 1 0 6.1c1.9.3 3.3 1.2 4.2 2.6 1 1.4 1.6 3.2 1.6 5.6h-3.6c0-2.5-.8-4.4-2.2-5.7" opacity=".75"/>' },
  gear: { b: `<path fill-rule="evenodd" d="${cogPath(12, 12, 8, 10, 7.6, 3.1)}"/>` },
  help: { s: true, b: '<circle cx="12" cy="12" r="9.2"/><path d="M9.2 9.4a2.9 2.9 0 1 1 4.5 2.4c-1 .7-1.7 1.2-1.7 2.5"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>' },
  info: { s: true, b: '<circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".7" fill="currentColor"/>' },
  left: { s: true, b: '<path d="M14.8 5l-7 7 7 7"/>' },
  right: { s: true, b: '<path d="M9.2 5l7 7-7 7"/>' },
  up: { s: true, b: '<path d="M5 14.8l7-7 7 7"/>' },
  down: { s: true, b: '<path d="M5 9.2l7 7 7-7"/>' },
  back: { s: true, b: '<path d="M10 5.5L4 12l6 6.5M4.5 12H20"/>' },
  close: { s: true, b: '<path d="M6 6l12 12M18 6L6 18"/>' },
  check: { s: true, b: '<path d="M4.8 12.6l4.7 4.7L19.2 7.4"/>' },
  plus: { s: true, b: '<path d="M12 5v14M5 12h14"/>' },
  minus: { s: true, b: '<path d="M5 12h14"/>' },
  lock: { b: '<rect x="5" y="10.6" width="14" height="10" rx="2.4"/><path d="M8.2 10.6V8a3.8 3.8 0 0 1 7.6 0v2.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1.5" fill="rgba(0,0,0,.45)"/>' },
  star: { b: `<polygon points="${starPoints(12, 12.6, 10, 4.3)}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>` },
  starO: { s: true, b: `<polygon points="${starPoints(12, 12.6, 9.4, 4.1)}"/>` },
  fullscreen: { s: true, b: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>' },
  fullscreenExit: { s: true, b: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>' },
  pause: { b: '<rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/>' },
  restart: { s: true, b: '<path d="M19.2 12a7.2 7.2 0 1 1-2.3-5.3"/><path d="M19.6 3.8v4.7h-4.7"/>' },
  home: { s: true, b: '<path d="M3.4 11.6L12 4l8.6 7.6M6 10.4V20h4.4v-5h3.2v5H18v-9.6"/>' },
  keyboard: { s: true, b: '<rect x="2.6" y="6" width="18.8" height="12" rx="2.6"/><path d="M6.4 10h.01M10 10h.01M14 10h.01M17.6 10h.01M7.5 14h9" stroke-width="2.6"/>' },
  gamepad: { b: '<path fill-rule="evenodd" d="M7.2 7h9.6a4.6 4.6 0 0 1 4.5 3.8l.9 5.2a2.7 2.7 0 0 1-4.7 2.2l-1.6-2.2H8.1l-1.6 2.2A2.7 2.7 0 0 1 1.8 16l.9-5.2A4.6 4.6 0 0 1 7.2 7zM7.2 9.6v1.4H5.8v1.5h1.4V14h1.5v-1.5h1.4V11H8.7V9.6zM16 10.1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2.6 1.9a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>' },
  touch: { s: true, b: '<rect x="6.8" y="2.6" width="10.4" height="18.8" rx="2.6"/><path d="M11 18.4h2"/><circle cx="12" cy="10.6" r="2.2"/>' },
  speaker: { b: '<path d="M3.5 9.5h3.7L12 5.4v13.2l-4.8-4.1H3.5z"/><path d="M15.4 9.2a4.1 4.1 0 0 1 0 5.6M18.2 6.6a8 8 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  speakerOff: { b: '<path d="M3.5 9.5h3.7L12 5.4v13.2l-4.8-4.1H3.5z"/><path d="M15.6 9.6l5 5M20.6 9.6l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  music: { b: '<path d="M9.4 17.6V5.8l10-2.2v11.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="7" cy="17.8" rx="2.8" ry="2.4"/><ellipse cx="17" cy="15.4" rx="2.8" ry="2.4"/>' },
  sliders: { s: true, b: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h16"/><circle cx="15" cy="7" r="2" fill="currentColor"/><circle cx="9" cy="17" r="2" fill="currentColor"/><circle cx="8" cy="12" r="2" fill="currentColor"/>' },
  camera: { b: '<path d="M8.4 5.5l1.1-1.7h5l1.1 1.7H19a2.4 2.4 0 0 1 2.4 2.4v9.6A2.4 2.4 0 0 1 19 19.9H5a2.4 2.4 0 0 1-2.4-2.4V7.9A2.4 2.4 0 0 1 5 5.5z"/><circle cx="12" cy="12.7" r="3.6" fill="rgba(0,0,0,.4)"/>' },
  eye: { s: true, b: '<path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="3"/>' },
  gauge: { s: true, b: '<path d="M4.6 17.6a8.6 8.6 0 1 1 14.8 0"/><path d="M12 13.4l3.6-4.4"/><circle cx="12" cy="13.4" r="1.2" fill="currentColor"/>' },
  flame: { b: '<path d="M12.4 2c.9 3.7 5.4 6 5.4 11a5.8 5.8 0 0 1-11.6 0c0-2.4 1-3.9 2.3-5.3.2 1.8 1 2.6 2 2.7C10.1 8.2 10.8 4.6 12.4 2z"/>' },
  bolt: { b: '<path d="M13.4 2.4L5.4 13.3h5.3l-1 8.3 8.9-11.5h-5.7z"/>' },
  shield: { b: '<path d="M12 2.6l7.2 2.7v6.2c0 4.5-3.1 8.4-7.2 10-4.1-1.6-7.2-5.5-7.2-10V5.3z"/>' },
  coin: { b: '<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/><path d="M12 8.2v7.6M9.8 10.2c0-1.2 1-1.7 2.2-1.7s2.2.6 2.2 1.6c0 2.2-4.4 1.2-4.4 3.5 0 1 1 1.7 2.2 1.7s2.2-.5 2.2-1.7" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.5" stroke-linecap="round"/>' },
  drift: { s: true, b: '<path d="M5.4 20.4C4.6 12 9.4 7 18 7.2"/><path d="M14.6 3.4L18.4 7.2l-3.8 3.8"/>' },
  copy: { s: true, b: '<rect x="8.6" y="8.6" width="12" height="12" rx="2.6"/><path d="M15.4 8.6V6.2a2.6 2.6 0 0 0-2.6-2.6H6.2a2.6 2.6 0 0 0-2.6 2.6v6.6a2.6 2.6 0 0 0 2.6 2.6h2.4"/>' },
  importIn: { s: true, b: '<path d="M12 4v11M7.4 10.6L12 15.2l4.6-4.6M4.8 19.6h14.4"/>' },
  exportOut: { s: true, b: '<path d="M12 15.4V4.4M7.4 8.8L12 4.2l4.6 4.6M4.8 19.6h14.4"/>' },
  trash: { s: true, b: '<path d="M4 6.6h16M9.4 6.6V4.2h5.2v2.4M6.2 6.6l.9 13.2h9.8l.9-13.2M10 10.6v5.6M14 10.6v5.6"/>' },
  user: { b: '<circle cx="12" cy="8" r="4"/><path d="M4.2 20.4c0-4.1 3.4-6.6 7.8-6.6s7.8 2.5 7.8 6.6z"/>' },
  edit: { s: true, b: '<path d="M4.4 19.6l1-4.4L16.6 4a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.8 18.6z"/><path d="M14.6 6l3.4 3.4"/>' },
  chart: { b: '<rect x="3.6" y="12" width="4.2" height="8.4" rx="1.2"/><rect x="9.9" y="5" width="4.2" height="15.4" rx="1.2"/><rect x="16.2" y="9" width="4.2" height="11.4" rx="1.2"/>' },
  medal: { b: '<path d="M7.2 2.6h3.4l1.4 4.6-2.2 1.2zM16.8 2.6h-3.4L12 7.2l2.2 1.2z" opacity=".7"/><circle cx="12" cy="14.6" r="6.2"/><polygon points="12,10.8 13.1,13.1 15.6,13.4 13.8,15.1 14.3,17.6 12,16.4 9.7,17.6 10.2,15.1 8.4,13.4 10.9,13.1" fill="rgba(0,0,0,.35)"/>' },
  crown: { b: '<path d="M3.2 18.6L2.2 7.6l5.2 4.2L12 4.4l4.6 7.4 5.2-4.2-1 11z"/><rect x="3.4" y="19.8" width="17.2" height="2" rx="1"/>' },
  ink: { b: '<path d="M12 3.2c2.1 0 3 1.6 3.9 3 .9 1.3 2.8.9 3.8 2.3 1 1.5-.1 3 .1 4.5.3 1.8 1.6 3 .5 4.5-1.2 1.6-3.3.7-4.8 1.6-1.4.9-2.1 2.3-3.7 2.3-1.9 0-2.5-1.7-3.8-2.6-1.4-1-3.6-.4-4.4-2-.8-1.7.8-3.1.9-4.7.1-1.5-1.3-2.8-.3-4.3 1-1.6 3-1.2 4.2-2.3C9 5 10 3.2 12 3.2z"/>' },
  rocket: { b: '<path d="M12 2.2c3.6 2.4 5.2 6.4 4.6 11.4l-2.2 1.6H9.6L7.4 13.6C6.8 8.6 8.4 4.6 12 2.2z"/><circle cx="12" cy="9.4" r="1.8" fill="rgba(0,0,0,.4)"/><path d="M7.6 12.6L4.6 16l.6 3 3.4-2zM16.4 12.6l3 3.4-.6 3-3.4-2z" opacity=".8"/><path d="M10.4 16.4h3.2L12 21z"/>' },
  ghost: { b: '<path fill-rule="evenodd" d="M4.6 20.6V11a7.4 7.4 0 0 1 14.8 0v9.6l-2.5-2-2.4 2-2.5-2-2.5 2-2.4-2zM9.4 9.6a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>' },
  warning: { b: '<path fill-rule="evenodd" d="M12 3.2c.7 0 1.3.4 1.7 1l8 14a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3l8-14c.4-.6 1-1 1.7-1zM11 9v5h2V9zm0 6.6v2h2v-2z"/>' },
  more: { b: '<circle cx="5.6" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.4" cy="12" r="1.9"/>' },
  bars: { s: true, b: '<path d="M4 7h16M4 12h16M4 17h16"/>' },
  list: { s: true, b: '<path d="M8.5 7H20M8.5 12H20M8.5 17H20"/><circle cx="4.6" cy="7" r="1" fill="currentColor"/><circle cx="4.6" cy="12" r="1" fill="currentColor"/><circle cx="4.6" cy="17" r="1" fill="currentColor"/>' },
  swap: { s: true, b: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>' },
  cup: { b: '<path d="M6.4 3.4h11.2l-.9 7.2a4.7 4.7 0 0 1-9.4 0z"/><rect x="10.7" y="14.4" width="2.6" height="3.2"/><rect x="7.4" y="18.2" width="9.2" height="2.6" rx="1.2"/>' },
  road: { b: '<path d="M8.4 2.6h2l-1 18.8H3.6zM15.6 2.6h-2l1 18.8h5.8z" opacity=".85"/><path d="M12 3.4v3.2M12 9.6v3.2M12 15.8v3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  tip: { s: true, b: '<path d="M9.4 18.6h5.2M10 21.4h4M12 2.8a6.2 6.2 0 0 0-3.4 11.4c.6.5.8 1 .8 1.6v.2h5.2v-.2c0-.6.2-1.1.8-1.6A6.2 6.2 0 0 0 12 2.8z"/>' },
};

/**
 * @param {string} name   key of ICONS
 * @param {{size?:string|number, cls?:string, title?:string}} [o]
 */
export function icon(name, o = {}) {
  const def = ICONS[name] ?? ICONS.info;
  const size = o.size ?? '1em';
  const el = svg('svg', { class: `ico ico-${name}${def.s ? ' ico-s' : ''}${o.cls ? ' ' + o.cls : ''}`, viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': o.title ? null : 'true', role: o.title ? 'img' : null, focusable: 'false' });
  el.innerHTML = (o.title ? `<title>${o.title.replace(/[<&>]/g, '')}</title>` : '') + def.b;
  return el;
}
export const ICON_NAMES = Object.keys(ICONS);
