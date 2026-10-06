// Device-aware button prompts ("Enter Select / Esc Back" vs "A Select / B Back"). OWNER: Agent E.
import { h } from './dom.js';
import { keycap, padGlyph } from './components.js';

const KB = {
  move: () => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((c) => keycap(c)),
  confirm: () => [keycap('Enter')],
  back: () => [keycap('Escape')],
  tab: () => [keycap('KeyQ'), keycap('KeyE')],
  x: () => [keycap('KeyX')],
  y: () => [keycap('KeyR')],
  pause: () => [keycap('Escape')],
};
const PAD = {
  move: () => [padGlyph('dpad')],
  confirm: () => [padGlyph('a')],
  back: () => [padGlyph('b')],
  tab: () => [padGlyph('lb'), padGlyph('rb')],
  x: () => [padGlyph('x')],
  y: () => [padGlyph('y')],
  pause: () => [padGlyph('start')],
};
const DEFAULT_LABEL = { move: 'Move', confirm: 'Select', back: 'Back', tab: 'Tabs', x: 'Action', y: 'Action', pause: 'Pause' };

/** items: [{k: 'move'|'confirm'|'back'|'tab'|'x'|'y', label?}] -> fills `el`; hidden for pointer/touch devices. */
export function renderHints(el, items, device) {
  el.replaceChildren();
  const show = (device === 'keyboard' || device === 'gamepad') && items?.length;
  el.classList.toggle('hidden', !show);
  if (!show) return;
  const map = device === 'gamepad' ? PAD : KB;
  for (const it of items) {
    const glyphs = map[it.k]?.();
    if (!glyphs) continue;
    el.append(h('span', { class: 'h' }, h('span', { style: { display: 'inline-flex', gap: '.2rem' } }, glyphs), it.label ?? DEFAULT_LABEL[it.k] ?? ''));
  }
}
