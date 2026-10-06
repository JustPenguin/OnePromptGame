// First-run coaching: a device-aware "how to drive" card before the start, then one-off contextual nudges (drift, items).
// OWNER: Agent E.  What was already shown is remembered in profile.seen so veterans never see it again
// (Settings > Data > "Show tips again" resets it).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { keycap, padGlyph } from '../components.js';
import { EV } from '../../core/events.js';
import { replay } from './banners.js';

export class Coach {
  /** @param {import('./Hud.js').Hud} hud */
  constructor(hud) {
    this.hud = hud;
    this.app = hud.app;
    this.seen = this.app.save.profile.seen;
    this.cardOn = !this.seen.controls;
    this.card = h('div', { class: 'coach glass' });
    this.pill = h('div', { class: 'coachpill hint' });
    this.el = h('div', { class: 'coachwrap' }, this.card, this.pill);   // lives in the HUD's bottom-centre stack (.zb)
    this.pillTimer = 0; this.itemSince = null; this.driftTried = false;
    this.card.style.display = this.cardOn ? '' : 'none';
    this.pill.style.display = 'none';
    this.render();
  }

  _glyphs() {
    const d = this.hud.ui.device;
    const b = this.app.input.bindings ?? {};
    const k = (a, i = 0) => keycap(b[a]?.[i] ?? { left: 'ArrowLeft', right: 'ArrowRight', throttle: 'ArrowUp', brake: 'ArrowDown', drift: 'Space', item: 'KeyE' }[a]);
    if (d === 'touch') return { steer: h('b', {}, 'DRAG'), gas: h('b', {}, 'GAS'), drift: h('b', {}, 'DRIFT'), item: h('b', {}, 'ITEM'), touch: true };
    if (d === 'gamepad') return { steer: padGlyph('stick'), gas: padGlyph('a'), drift: padGlyph('rb'), item: padGlyph('x') };
    return { steer: h('span', { class: 'cg' }, k('left'), k('right')), gas: k('throttle'), drift: k('drift'), item: k('item') };
  }

  render() {
    if (!this.cardOn) return;
    const g = this._glyphs();
    const cell = (glyph, label) => h('div', { class: 'cc' }, h('div', { class: 'cgl' }, glyph), h('span', {}, label));
    this.card.replaceChildren(
      h('div', { class: 'ch' }, icon('flag'), 'How to drive'),
      h('div', { class: 'crow' }, cell(g.steer, g.touch ? 'Steer (left side)' : 'Steer'), cell(g.gas, 'Accelerate'), cell(g.drift, 'Drift in turns'), cell(g.item, 'Use item')));
  }

  onDevice() { this.render(); }

  /** Show a one-line nudge for a few seconds. */
  nudge(node) {
    this.pill.replaceChildren(icon('tip'), node);
    this.pill.style.display = '';
    this.hud.root.classList.add('tip');
    replay(this.pill, 'show');
    this.pillTimer = 5.5;
  }

  bind(session, on) {
    const me = session.player;
    on(EV.ITEM_USE, ({ kart }) => { if (kart === me) { this.itemSince = null; this._mark('item'); } });
    on(EV.DRIFT_START, ({ kart }) => { if (kart === me) { this.driftTried = true; this._mark('drift'); } });
  }

  _mark(key) { if (!this.seen[key]) { this.seen[key] = true; this.app.save.commit(); } }

  update(dt, session) {
    const race = session.race, me = session.player;
    const phase = race.phase;
    // Everything keys off the RACE clock (not UI frames) so it behaves under slow frame rates, tab throttling and test fast-forward.
    const rt = phase === 'racing' ? race.time : 0;
    // the card lives from the intro until a few seconds into the race
    if (this.cardOn) {
      if (rt > 6) { this.cardOn = false; this.card.style.display = 'none'; this._mark('controls'); }
      this.card.classList.toggle('fade', rt > 4.8);
    }
    if (phase !== 'racing' || me.race.finished) { if (this.pillTimer > 0) this.pillTimer = 0.01; }
    if (this.pillTimer > 0) { this.pillTimer -= dt; if (this.pillTimer <= 0) { this.pill.style.display = 'none'; this.hud.root.classList.remove('tip'); } }
    if (phase !== 'racing' || this.pillTimer > 0 || this.cardOn) return;
    // contextual nudges (each at most once per profile)
    if (!this.seen.drift && !this.driftTried && rt > 9 && me.speed > 12) {
      this.seen.drift = true; this.app.save.commit();
      const g = this._glyphs();
      this.nudge(g.touch ? h('span', {}, 'Hold DRIFT while turning, then let go for a boost!')
        : h('span', { style: { display: 'inline-flex', gap: '.5em', alignItems: 'center' } }, 'Tap', g.drift, 'while turning to drift. Hold it, then let go for a boost!'));
      return;
    }
    const hasItem = !me.item.roulette.active && !!me.item.type;
    if (!hasItem) this.itemSince = null;
    else if (this.itemSince == null) this.itemSince = rt;
    if (!this.seen.item && hasItem && this.itemSince != null && rt - this.itemSince > 3.5) {
      this.seen.item = true; this.app.save.commit();
      const g = this._glyphs();
      this.nudge(g.touch ? h('span', {}, 'Tap ITEM to use it. Hold BRAKE to throw it behind you.')
        : h('span', { style: { display: 'inline-flex', gap: '.5em', alignItems: 'center' } }, 'Press', g.item, 'to use your item. Hold brake to throw it behind you.'));
    }
  }
}

export const coachCss = `
.coachwrap{display:flex;flex-direction:column;align-items:center;gap:.6em;pointer-events:none;max-width:100%;}
.coach{padding:.6em 1.1em .8em;border-radius:1em;max-width:34em;transition:opacity .6s;animation:rise .6s var(--ease-out) both .2s;}
.coach.fade{opacity:0;}
.coach .ch{display:flex;align-items:center;gap:.5em;font-size:.95em;letter-spacing:.08em;text-transform:uppercase;color:#ffd23f;margin-bottom:.45em;}
.coach .crow{display:flex;gap:1.1em;align-items:flex-start;justify-content:center;flex-wrap:wrap;}
.coach .cc{display:flex;flex-direction:column;align-items:center;gap:.35em;min-width:5.4em;}
.coach .cc > span{font-family:var(--font-ui);font-weight:900;font-size:.62em;letter-spacing:.08em;text-transform:uppercase;color:#dfe6ff;text-align:center;}
.coach .cgl{display:flex;gap:.2em;align-items:center;min-height:1.7em;} .coach .cg{display:inline-flex;gap:.2em;} .coach .cgl b{font-size:1em;letter-spacing:.06em;}
.coachpill{font-size:.78em;max-width:100%;text-align:center;justify-content:center;white-space:normal;}
.coachpill.show{animation:fade-in .35s ease both;}
`;
