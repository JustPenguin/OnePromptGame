// Toast stack (unlocks, achievements, save notices). OWNER: Agent E.  Non-interactive; announced through an aria-live region.
import { h } from './dom.js';
import { icon } from './icons.js';
import { portrait } from './components.js';

export class Toasts {
  constructor(layer) {
    this.el = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    layer.appendChild(this.el);
    this.max = 3;
  }

  /**
   * @param {{title:string, text?:string, icon?:string, kind?:'info'|'good'|'bad'|'unlock', driverId?:string, ms?:number}} o
   */
  show(o) {
    const thumb = o.driverId ? portrait(o.driverId, 42) : icon(o.icon ?? (o.kind === 'unlock' ? 'lock' : 'info'));
    const el = h('div', { class: `toast ${o.kind ?? 'info'}` }, h('div', { class: 'ti' }, thumb), h('div', { class: 'tx' }, h('div', { class: 'tt' }, o.title), o.text ? h('div', { class: 'ts' }, o.text) : null));
    this.el.appendChild(el);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    const ms = o.ms ?? 3800;
    const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
    setTimeout(dismiss, ms);
    return { dismiss };
  }

  clear() { this.el.replaceChildren(); }
}
