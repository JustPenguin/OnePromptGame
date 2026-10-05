// In-page dialogs. OWNER: Agent E.  alert()/confirm()/prompt() are dead inside the sandboxed iframe, so every confirmation is
// built here.  A modal pushes its own Nav scope (focus trap; Esc/B = dismiss) and resolves a promise with the chosen value.
import { h, afterLayout } from './dom.js';
import { button } from './components.js';

/**
 * @param {import('./UI.js').UI} ui
 * @param {{title:string, body?:string|Node|Node[], buttons:{label:string,value:any,variant?:string,icon?:string,def?:boolean}[], danger?:boolean, wide?:boolean, dismissValue?:any, onBuild?:(api)=>void}} def
 * @returns {Promise<any>}
 */
export function showModal(ui, def) {
  return new Promise((resolve) => {
    let closed = false;
    const body = h('div', { class: 'mb scroll' }, typeof def.body === 'string' ? h('p', { style: { margin: 0 } }, def.body) : def.body);
    const btns = def.buttons.map((b) => button({ label: b.label, icon: b.icon, variant: b.variant ?? 'glass', def: !!b.def, sfx: b.value === false || b.value === null ? 'back' : 'confirm', onClick: () => close(b.value) }));
    const dialog = h('div', { class: `modal panel${def.danger ? ' danger' : ''}${def.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': def.title },
      h('div', { class: 'mh' }, h('div', { class: 'h2' }, def.title)),
      body,
      h('div', { class: 'mf' }, btns));
    const scrim = h('div', { class: 'modal-scrim' }, dialog);
    ui.layers.modal.appendChild(scrim);
    // everything underneath stops reacting while the dialog is open
    ui.layers.screens.setAttribute('inert', '');
    const scope = ui.nav.push(scrim, { onBack: () => close(def.dismissValue ?? false) });
    const close = (value) => {
      if (closed) return; closed = true;
      scrim.classList.add('out');
      ui.nav.remove(scope);
      ui.layers.screens.removeAttribute('inert');
      setTimeout(() => scrim.remove(), 200);
      resolve(value);
    };
    def.onBuild?.({ close, body, dialog, scope });
    afterLayout(() => { if (!closed) ui.nav.autofocus(scope); });
  });
}

/** ui.confirm({title, body, confirm, cancel, danger}) -> Promise<boolean>. The SAFE option has default focus when danger. */
export function confirmModal(ui, o) {
  const yes = { label: o.confirm ?? 'Yes', value: true, variant: o.danger ? 'red' : 'green', icon: o.confirmIcon ?? 'check', def: !o.danger };
  const no = { label: o.cancel ?? 'Cancel', value: false, variant: 'glass', icon: 'close', def: !!o.danger };
  return showModal(ui, { title: o.title, body: o.body, danger: o.danger, buttons: [no, yes], dismissValue: false });
}
