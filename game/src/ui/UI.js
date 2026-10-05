// UI manager. OWNER: Agent E (ui).  BASELINE: a minimal title screen, loading bar, HUD and results list so the
// pipeline works end to end.  Agent E replaces everything under src/ui/ (and src/app/) with the real,
// beautiful UI.  The App <-> UI contract is E's to define; only the App's public API (see src/app/App.js) and the
// session/kart fields documented in docs/ARCHITECTURE.md are relied on by other modules and the debug API.
import { EV } from '../core/events.js';
import { formatTime, ordinal } from '../core/math.js';
import { ITEM_DEFS, getItemIcon } from '../items/itemDefs.js';

export class UI {
  constructor(app) {
    this.app = app;
    this.root = app.uiRoot;
    this.hud = null;
    this.screen = null;
    const style = document.createElement('style');
    style.textContent = `
      .bl-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(10,15,36,.55);text-align:center}
      .bl-title{font-family:var(--font-display);font-size:clamp(40px,9vw,110px);transform:skewX(-8deg);text-shadow:0 5px 0 #b34700,0 12px 40px rgba(255,122,26,.5)}
      .bl-btn{font-family:var(--font-display);font-size:24px;padding:12px 28px;border-radius:14px;border:0;background:var(--kr-accent);color:#fff;cursor:pointer;box-shadow:0 5px 0 #b34700}
      .bl-hud{position:absolute;inset:0;pointer-events:none;font-family:var(--font-display);text-shadow:0 3px 0 rgba(0,0,0,.45)}
      .bl-hud .tl{position:absolute;top:16px;left:20px;font-size:34px}
      .bl-hud .tr{position:absolute;top:16px;right:20px;font-size:64px;color:var(--kr-warn)}
      .bl-hud .br{position:absolute;bottom:18px;right:24px;font-size:44px}
      .bl-hud .bl{position:absolute;top:70px;left:20px;display:flex;gap:10px;align-items:center;font-size:20px}
      .bl-hud .cd{position:absolute;inset:0;display:grid;place-items:center;font-size:clamp(80px,22vw,260px);color:var(--kr-warn)}
      .bl-list{font-size:22px;min-width:min(420px,80vw);text-align:left}
    `;
    document.head.appendChild(style);
  }

  clear() { this.root.replaceChildren(); this.hud = null; this.screen = null; }

  showTitle() {
    this.clear();
    const el = document.createElement('div');
    el.className = 'bl-screen';
    el.innerHTML = `<div class="bl-title">KART RUSH <span style="color:var(--kr-accent)">GP</span></div><button class="bl-btn" id="bl-start">Race!</button><div style="color:var(--kr-ink-dim)">Arrows / WASD to drive · Space to drift · E for items</div>`;
    this.root.appendChild(el);
    el.querySelector('#bl-start').onclick = () => { this.app.audio.unlock(); this.app.startRace(this.app.defaultRaceConfig()); };
    this.screen = el;
  }

  showLoading(p, msg) {
    if (!this.screen || !this.screen.classList.contains('loading')) {
      this.clear();
      const el = document.createElement('div'); el.className = 'bl-screen loading'; el.innerHTML = '<div class="bl-title" style="font-size:48px">Loading…</div><div class="lm"></div>';
      this.root.appendChild(el); this.screen = el;
    }
    this.screen.querySelector('.lm').textContent = `${Math.round(p * 100)}% ${msg ?? ''}`;
  }

  showHud(session) {
    this.clear();
    const el = document.createElement('div');
    el.className = 'bl-hud';
    el.innerHTML = '<div class="tl"></div><div class="tr"></div><div class="br"></div><div class="bl"></div><div class="cd"></div>';
    this.root.appendChild(el);
    this.hud = { el, tl: el.querySelector('.tl'), tr: el.querySelector('.tr'), br: el.querySelector('.br'), bl: el.querySelector('.bl'), cd: el.querySelector('.cd'), session };
    session.on(EV.COUNTDOWN, ({ count }) => { this.hud.cd.textContent = count === 0 ? 'GO!' : String(count); setTimeout(() => { if (this.hud?.cd.textContent === (count === 0 ? 'GO!' : String(count))) this.hud.cd.textContent = ''; }, count === 0 ? 900 : 950); });
  }

  update(dt, session) {
    const h = this.hud;
    if (!h || !session?.player) return;
    const k = session.player;
    h.tl.textContent = `LAP ${k.race.lap}/${session.race.lapCount}  ${formatTime(session.race.time)}`;
    h.tr.textContent = ordinal(k.race.place);
    h.br.textContent = `${Math.round(Math.abs(k.speed) * 3.6)} km/h`;
    const it = k.item;
    if (it.roulette.active) h.bl.replaceChildren(getItemIcon(it.roulette.shown ?? 'boost', 48));
    else if (it.type) h.bl.replaceChildren(getItemIcon(it.type, 48), Object.assign(document.createElement('span'), { textContent: ITEM_DEFS[it.type]?.name ?? it.type }));
    else h.bl.replaceChildren();
  }

  showResults(standings) {
    this.clear();
    const el = document.createElement('div');
    el.className = 'bl-screen';
    el.innerHTML = `<div class="bl-title" style="font-size:56px">Results</div><div class="bl-list">${standings.map((s) => `<div>${s.place}. ${s.name}${s.isPlayer ? ' (you)' : ''} — ${s.finished ? formatTime(s.time) : 'DNF'}</div>`).join('')}</div><button class="bl-btn" id="bl-again">Race again</button>`;
    this.root.appendChild(el);
    el.querySelector('#bl-again').onclick = () => this.app.startRace(this.app.defaultRaceConfig());
    this.screen = el;
  }
}
