// Versus Race setup: track, class, laps, racers, items, then START. OWNER: Agent E.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { Screen } from './Screen.js';
import { button, row, segmentedCtl, stepperCtl, toggleCtl, screenHeader } from '../components.js';
import { trackCard } from '../trackCard.js';
import { TRACK_DEFS, isTrackUnlocked, cupOfTrack, trackColors } from '../../modes/catalog.js';
import { isUnlocked, hintFor } from '../../modes/unlocks.js';
import { SPEED_CLASSES } from '../../data/roster.js';
import { MODE_NAMES } from '../../app/Flow.js';
import { formatTime } from '../../core/math.js';

export const vsetupCss = /* css */ `
.s-vsetup .vs-main{flex:1;display:flex;gap:1.6rem;min-height:0;align-items:flex-start;z-index:2;}
.vs-panel{width:min(31rem,52vw);padding:.9rem .9rem 1rem;display:flex;flex-direction:column;gap:.55rem;}
.vs-preview{flex:1;min-width:0;max-width:30rem;display:flex;flex-direction:column;gap:.7rem;margin-left:auto;}
.vs-preview .tcard{pointer-events:none;}
.vs-meta{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
.vs-desc{font-size:.95rem;color:#dfe6ff;}
.tpick{display:flex;align-items:center;gap:.5rem;min-width:0;}
.tpick button{width:2.2rem;height:2.2rem;border:0;border-radius:.7rem;cursor:pointer;background:rgba(255,255,255,.14);display:grid;place-items:center;font-size:1.1rem;flex:none;transition:background .15s,transform .15s var(--ease-spring);}
.tpick button:hover{background:rgba(255,255,255,.28);transform:scale(1.1);}
.tpick .tv{font-family:var(--font-display);font-size:1.05rem;letter-spacing:.02em;text-transform:uppercase;text-align:center;min-width:9rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.vs-panel .row{grid-template-columns:minmax(0,.7fr) minmax(0,1.5fr);}
.vs-go{margin-top:.5rem;align-self:flex-start;}
.vs-lock{display:none;align-items:center;gap:.6rem;padding:.55rem .8rem;border-radius:.9rem;background:rgba(255,61,106,.14);box-shadow:inset 0 0 0 .1rem rgba(255,61,106,.5);font-size:.88rem;color:#ffe0e8;}
.vs-lock.on{display:flex;} .vs-lock .ico{color:#ff9fb4;font-size:1.3rem;flex:none;}
.l-portrait .vs-main{flex-direction:column;overflow:auto;} .l-portrait .vs-panel{width:100%;} .l-portrait .vs-preview{max-width:none;margin:0;} .l-portrait .vs-preview .tcard.big .tart{height:8rem;}
.l-compact .vs-panel{width:24rem;padding:.5rem;gap:.3rem;} .l-compact .row{min-height:2.4rem;padding:.25rem .7rem;} .l-compact .row .desc{display:none;} .l-compact .vs-preview{max-width:15rem;} .l-compact .vs-preview .tcard.big .tart{height:6rem;} .l-compact .vs-desc{display:none;}
`;

export class VersusSetupScreen extends Screen {
  get stage() { return { preset: 'dim', kart: false, theme: this._theme ?? null, comp: { x: 0, y: 0 } }; }
  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Change' }, { k: 'tab', label: '' }, { k: 'back' }].filter((x) => x.k !== 'tab'); }

  build() {
    const f = this.flow, sel = f.sel;
    const idx0 = Math.max(0, TRACK_DEFS.findIndex((t) => t.id === sel.trackId));
    this.idx = idx0;

    // ---- track picker
    this.tName = h('div', { class: 'tv' });
    const prev = h('button', { type: 'button', tabindex: -1, 'aria-label': 'Previous track' }, icon('left'));
    const next = h('button', { type: 'button', tabindex: -1, 'aria-label': 'Next track' }, icon('right'));
    prev.addEventListener('click', () => this.setTrack(-1)); next.addEventListener('click', () => this.setTrack(1));
    const trackCtl = { el: h('div', { class: 'tpick' }, prev, this.tName, next), adjust: (d) => { this.setTrack(d); return true; }, activate: () => this.setTrack(1) };

    const classOpts = Object.values(SPEED_CLASSES).map((c) => ({ value: c.id, label: c.name, disabled: !isUnlocked(this.save, 'speedClass', c.id) }));
    const classCtl = segmentedCtl(classOpts, sel.speedClass, (v) => { sel.speedClass = v; this.refresh(); },
      (o) => { this.ui.sfx('error'); this.ui.toast({ title: `${o.label} class locked`, text: hintFor(this.save, 'speedClass', o.value), icon: 'lock', kind: 'bad' }); });
    const lapsCtl = stepperCtl({ min: 1, max: 5, value: sel.laps, onChange: (v) => { sel.laps = v; } });
    const racersCtl = stepperCtl({ min: 2, max: 12, value: sel.racers, onChange: (v) => { sel.racers = v; } });
    const itemsCtl = toggleCtl(sel.items, (v) => { sel.items = v; });

    this.go = button({ label: 'Start race', icon: 'play', variant: 'green', size: 'lg', def: false, onClick: () => this.start(), sfx: 'confirm', cls: 'vs-go' });
    this.lockBox = h('div', { class: 'vs-lock' }, icon('lock'), h('span'));
    const rows = [
      row('Track', 'Where to race.', trackCtl, { cls: 'pop' }),
      row('Class', 'How fast and how fierce.', classCtl, { cls: 'pop' }),
      row('Laps', 'One to five laps.', lapsCtl, { cls: 'pop' }),
      row('Racers', 'Including you.', racersCtl, { cls: 'pop' }),
      row('Items', 'Item boxes on the track.', itemsCtl, { cls: 'pop' }),
    ];
    rows.forEach((r, i) => r.style.setProperty('--i', i));
    rows[0].setAttribute('data-default', '');
    this.previewHost = h('div', { class: 'vs-preview slide-r' });
    const el = h('div', { class: 'screen' },
      h('div', { class: 'scrim-all' }),
      screenHeader({ kicker: MODE_NAMES[f.mode], title: 'Race setup', steps: f.stepLabels(), step: f.stepIndex('vsetup'), back: () => this.onBack() }),
      h('div', { class: 'vs-main' }, h('div', { class: 'vs-panel panel slide-l' }, rows, this.lockBox, this.go), this.previewHost));
    this.refresh();
    return el;
  }

  onShow() { const s = this.flow.sel; this.app.menuScene.setKart(s.driverId, s.bodyId, { instant: true }); }

  get def() { return TRACK_DEFS[this.idx] ?? TRACK_DEFS[0]; }

  setTrack(dir) {
    const n = TRACK_DEFS.length;
    this.idx = (this.idx + dir + n) % n;
    this.flow.sel.trackId = this.def.id;
    this.ui.sfx('select');
    this.refresh();
  }

  refresh() {
    const def = this.def, sel = this.flow.sel;
    sel.trackId = def.id;
    const locked = !isTrackUnlocked(this.save, def.id);
    const cup = cupOfTrack(def.id);
    const col = trackColors(def);
    this._theme = { primary: col.primary, secondary: col.ground };
    this.ui._applyStage();
    this.tName.textContent = def.name;
    const rec = this.save.data.records[def.id]?.race?.[sel.speedClass];
    const card = trackCard(def, { tag: 'div', nav: false, big: true, locked, hint: cup ? hintFor(this.save, 'cup', cup.id) : '', best: rec ? { time: rec.time } : null });
    card.classList.add('pop');
    this.previewHost.replaceChildren(
      card,
      h('div', { class: 'vs-meta' }, cup ? h('span', { class: 'chip gd' }, icon('cup'), cup.name) : null, h('span', { class: 'chip cy' }, icon('flag'), `${def.laps ?? 3} laps default`), rec ? h('span', { class: 'chip' }, icon('stopwatch'), formatTime(rec.time)) : null),
      h('div', { class: 'vs-desc' }, def.description ?? ''));
    this.lockBox.classList.toggle('on', locked);
    this.lockBox.querySelector('span').textContent = locked && cup ? hintFor(this.save, 'cup', cup.id) : '';
    this.go.setAttribute('aria-disabled', locked ? 'true' : 'false');
    this.go.classList.toggle('lockdim', locked);
  }

  start() {
    if (!isTrackUnlocked(this.save, this.def.id)) { this.ui.sfx('error'); return; }
    this.flow.launch();
  }
}
