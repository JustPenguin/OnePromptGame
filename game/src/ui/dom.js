// Tiny DOM toolkit for the UI layer. OWNER: Agent E.  Never builds HTML from player-controlled strings:
// text always goes through text nodes; `html` is for static, trusted markup only (icons, logos).
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Join class names, skipping falsy values. */
export const cx = (...a) => a.filter(Boolean).join(' ');

function applyProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

function appendKids(el, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false || kid === true) continue;
    if (Array.isArray(kid)) appendKids(el, kid);
    else if (kid instanceof Node) el.appendChild(kid);
    else el.appendChild(document.createTextNode(String(kid)));
  }
}

/** h('div', {class:'x', onClick}, child, 'text', [more]) -> HTMLElement */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) applyProps(el, props);
  else if (props !== undefined && props !== null) kids.unshift(props);
  appendKids(el, kids);
  return el;
}

/** svg('path', {d:'...'}) -> SVGElement */
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  appendKids(el, kids);
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
/** addEventListener that returns its own remover. */
export function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); return () => target.removeEventListener(type, fn, opts); }
/** Run `fn` after layout has been committed (two frames), e.g. to trigger CSS transitions on freshly added nodes. */
export const afterLayout = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
/** Force a reflow so a class change right after insertion animates. */
export const reflow = (el) => void el.offsetWidth;
/** Wait `ms` (resolves immediately when ms <= 0). */
export const wait = (ms) => new Promise((r) => (ms > 0 ? setTimeout(r, ms) : r()));
/** Resolve when an element's animation/transition ends (or after `max` ms as a safety net). */
export function whenDone(el, max = 900) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; el.removeEventListener('animationend', fin); el.removeEventListener('transitionend', fin); resolve(); };
    el.addEventListener('animationend', fin, { once: true });
    el.addEventListener('transitionend', fin, { once: true });
    setTimeout(fin, max);
  });
}
