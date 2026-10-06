// Small animation helpers (no dependencies). OWNER: Agent E.
import { wait } from './dom.js';

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Tween a number: calls onUpdate(value) every frame for `ms`. Resolves when done. Honors reduced motion (jumps to the end). */
export function tween({ from = 0, to = 1, ms = 600, ease = easeOutCubic, onUpdate, reduced = false }) {
  return new Promise((resolve) => {
    if (reduced || ms <= 0) { onUpdate(to); resolve(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      onUpdate(from + (to - from) * ease(u));
      if (u < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Count a number up/down inside `el` (textContent). fmt(n) -> string. */
export function countUp(el, from, to, { ms = 700, fmt = (n) => String(Math.round(n)), reduced = false } = {}) {
  return tween({ from, to, ms, reduced, onUpdate: (v) => { el.textContent = fmt(v); } });
}

export { wait };
