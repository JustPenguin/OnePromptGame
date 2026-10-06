// HUD overlap detector (Agent E).  npm run build && node src/ui/hud/overlap.check.mjs [--only=p390,w1280] [--states=A,B,C,D,E] [--shots=A|all|none] [--wait=120] [--quality=low] [--debug]
// States: A racing worst case (wrong-way, 3 events, 4 chips, coins, item x3, 8th, lap rows, tip pill, drift)  B countdown (coach card + rocket hint)
//         C holding respawn + ghost delta (time trial: no standings)  D intro (coach card + skip pill)  E fps overlay.  Exit code 1 when anything overlaps.
// Starts one real race, forces a worst-case dynamic HUD state, resizes the window to each scenario and reports every pair of visible HUD
// elements whose bounding boxes intersect (plus anything outside the viewport).  Screenshots go to .qa/ov/.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');       // game/
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const outDir = resolve(root, '.qa/ov'); mkdirSync(outDir, { recursive: true });
const dist = resolve(root, 'dist');
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const f = resolve(dist, '.' + (p === '/' ? '/index.html' : p));
  if (f.startsWith(dist) && existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); res.end(readFileSync(f)); }
  else { res.writeHead(p === '/favicon.ico' ? 204 : 404); res.end(); }
});
await new Promise((r) => server.listen(Number(args.port ?? 0), '127.0.0.1', r));
const PORT = server.address().port;
const req = createRequire(import.meta.url);
let pw; for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = req(c); break; } catch { /* next */ } }
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl'] });

const SCEN = [
  ['p390', 390, 844, { touch: true }], ['p390n', 390, 844, {}], ['p360', 360, 640, { touch: true }], ['p320', 320, 568, { touch: true }], ['p768', 768, 1024, { touch: true }],
  ['l844', 844, 390, { touch: true }], ['l844n', 844, 390, {}], ['l740', 740, 360, { touch: true }], ['l568', 568, 320, { touch: true }], ['l932', 932, 430, { touch: true }],
  ['w1280', 1280, 720, {}], ['w1280t', 1280, 720, { touch: true }], ['w1920', 1920, 1080, {}], ['w1024t', 1024, 768, { touch: true }], ['w2560', 2560, 1080, {}],
  ['w1280h12', 1280, 720, { hudScale: 1.2 }], ['w1280h14', 1280, 720, { hudScale: 1.4 }], ['w1280L', 1280, 720, { large: true }], ['w1280h07', 1280, 720, { hudScale: 0.7 }],
  ['p390h14', 390, 844, { touch: true, hudScale: 1.4 }], ['l844h14', 844, 390, { touch: true, hudScale: 1.4 }], ['p390L', 390, 844, { touch: true, large: true }],
];
const only = args.only ? String(args.only).split(',') : null;
const states = String(args.states ?? 'A,B,C,D,E').split(',');
const shots = String(args.shots ?? 'A').split(',');

const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${PORT}/?quality=${args.quality ?? 'low'}`);
await page.waitForFunction(() => window.__kart?.ready, null, { timeout: 90000 });
await page.evaluate(async () => {
  const k = window.__kart;
  k.app.save.profile.seen.controls = false;
  await k.startRace({ trackId: 'harbor-heights', laps: 3, racers: 8, seed: 3, skipIntro: true, player: { driverId: 'pip', bodyId: 'classic', name: 'You' } });
  k.freeze(true); k.autoDrive(true); k.advance(10);
});

const setup = (cfg) => page.evaluate((c) => {
  const k = window.__kart, app = k.app, s = app.session, me = s.player, ui = app.ui, st = app.settings;
  st.touchControls = c.touch ? 'on' : 'off'; st.hudScale = c.hudScale ?? 1; st.largeText = !!c.large; st.showFps = c.state === 'E';
  st.showMinimap = true; st.showLeaderboard = true; st.reducedMotion = true;
  ui.applyPrefs(); ui.hud.applySettings();
  me.coins = 88; me.invincible = 5; me.rocket = 3; me.shrink = 4;
  me.item.type = 'boost'; me.item.count = 3; me.item.roulette.active = false;
  const o = s.race.order; o.splice(o.indexOf(me), 1); o.push(me); me.race.place = o.length;
  s.config.mode = 'timetrial'; s.config.ghost = c.state === 'C';
  const hud = ui.hud;
  hud.status.setDraft(true); hud.fps.style.display = 'none';
  hud.lapList.replaceChildren(); hud._addLapRow(1, 62.12, -0.5, true); hud._addLapRow(2, 63.9, 1.2, false); hud._addLapRow(3, 64.1, 1.4, false);
  me.drift.dir = 1; me.drift.level = 2; me.drift.charge = 1.2;
  ui.update(0.016, s, true); k.render();
  hud.respawnRing.el.classList.remove('on'); hud.drift.el.classList.remove('on');
  // ---- DOM overrides AFTER the last update so the worst case sticks
  if (c.state === 'C') { hud.ghostBox.style.display = ''; hud.ghostD.textContent = '+12.34'; hud.ghostD.className = 'gd dn'; hud.board.el.style.display = 'none'; hud.posEl.style.display = 'none'; } else { hud.ghostBox.style.display = 'none'; hud.board.el.style.display = ''; hud.posEl.style.display = ''; }
  hud.feed.clear(); for (const [t, kind] of [['Hit by Hopper!', 'bad'], ['Hit Rusty!', 'gold'], ['+2 places!', 'good']]) hud.feed.push(t, { ico: 'bolt', kind, ms: 1e9 });
  hud.drift.el.classList.add('on'); hud.drift.label.textContent = 'Super mini-turbo!'; hud.drift.label.classList.add('show');
  hud.root.dataset.phase = 'racing'; hud.root.classList.remove('alert', 'respawning', 'tip', 'showfps'); hud.banners.wrongWay(false); hud._setSkip(null); hud.countdown.hint.classList.remove('on');
  hud.coach.cardOn = false; hud.coach.card.style.display = 'none'; hud.coach.pill.style.display = 'none';
  if (c.state === 'A') {            // racing: wrong-way + everything dynamic
    hud.banners.wrongWay(true); hud.root.classList.add('alert');
    const sp = document.createElement('span'); sp.textContent = 'Tap ITEM to use it. Hold BRAKE to throw it behind you.'; hud.coach.nudge(sp);
  } else if (c.state === 'B') {     // before / at the start: coach card + rocket-start hint + skip pill + fps
    hud.coach.cardOn = true; hud.coach.card.style.display = ''; hud.coach.render(); hud.coach.card.classList.remove('fade');
    hud.root.dataset.phase = 'countdown'; hud.countdown.show(3, hud._gasNode()); hud.feed.clear();
  } else if (c.state === 'D') {     // intro: coach card + skip pill (HUD zones are invisible then, but must still not collide)
    hud.root.dataset.phase = 'intro'; hud.coach.cardOn = true; hud.coach.card.style.display = ''; hud.coach.render(); hud.coach.card.classList.remove('fade'); hud._setSkip('intro'); hud.feed.clear();
  } else if (c.state === 'E') {     // fps overlay + a nudge pill
    hud.fps.style.display = 'block'; hud.fps.textContent = '60 fps  16.7 ms\n123 calls  45k tris'; hud.root.classList.add('showfps');
  } else if (c.state === 'C') {     // holding respawn while going the wrong way
    hud.banners.wrongWay(true); hud.root.classList.add('alert', 'respawning'); hud.respawnRing.el.classList.add('on');
  }
  return { l: ui.layout, em: parseFloat(getComputedStyle(hud.root).fontSize), touch: hud.root.classList.contains('touch'), phase: hud.root.dataset.phase, card: getComputedStyle(hud.coach.card).display, skip: getComputedStyle(hud.skip).display, zl: getComputedStyle(hud.root.querySelector('.zl')).opacity };
}, cfg);

const measure = () => page.evaluate(() => {
  const hud = document.querySelector('.hud'); const items = [];
  const add = (name, sel, group = name) => {
    for (const el of hud.querySelectorAll(sel)) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const nm = name === 'btn' ? 'btn-' + /t-(\w+)/.exec(el.className)?.[1] : name;
      items.push({ name: nm, group: name === 'btn' ? nm : group, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
  };
  add('item', '.zl .item-frame', 'item'); add('count', '.zl .item-count', 'item'); add('itemmeta', '.zl .item-meta', 'item');
  add('pos', '.zl .pos'); add('coins', '.zl .coins'); add('chip', '.zl .chipst', 'chips'); add('row', '.zl .board .br', 'board'); add('gap', '.zl .board .gap', 'board'); add('ghost', '.zl .ghostbox');
  add('lapbox', '.zr .lapbox'); add('respawnbtn', '.zr .hud-respawn'); add('pause', '.zr .hud-pause:not(.hud-respawn)'); add('timer', '.zr .timer'); add('lr', '.zr .laps .lr', 'laps'); add('mini', '.zr .mini'); add('speedo', '.zr .speedo');
  add('coach', '.zb .coach'); add('pill', '.zb .coachpill'); add('cdhint', '.zb .cdhint'); add('skip', '.zb .skip'); add('dmeter', '.zb .dmeter'); add('dlabel', '.zb .driftlbl'); add('fps', '.zb .fps');
  add('wrong', '.zt .wrongway'); add('ring', '.zt .respawn-ring'); add('ev', '.zt .ev', 'evs');
  add('btn', '.touchc .tbtn'); add('tbase', '.touchc .tbase');
  const W = innerWidth, H = innerHeight, over = [], outside = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.l < -2 || a.t < -2 || a.r > W + 2 || a.b > H + 2) outside.push(`${a.name}[${Math.round(a.l)},${Math.round(a.t)},${Math.round(a.r)},${Math.round(a.b)}]`);
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]; if (a.group === b.group) continue;
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (ox > 2 && oy > 2) over.push(`${a.name}x${b.name}(${Math.round(ox)}x${Math.round(oy)})`);
    }
  }
  // columns must not run off the bottom either
  const cols = [...hud.querySelectorAll('.zl,.zr')].map((c) => {
    const cr = c.getBoundingClientRect(); let deep = null, db = -1;
    for (const d of c.querySelectorAll('*')) { const r = d.getBoundingClientRect(); if (r.height && r.bottom > db) { db = r.bottom; deep = d; } }
    return { c: c.className, over: c.scrollHeight - c.clientHeight, deep: deep ? `${deep.tagName}.${String(deep.className).slice(0, 20)}` : '', deepOver: Math.round(db - cr.bottom) };
  }).filter((c) => c.over > 1 && c.deepOver > 1);
  return { over, outside, cols, n: items.length };
});

let bad = 0;
for (const [name, w, h, cfg] of SCEN) {
  if (only && !only.includes(name)) continue;
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  for (const state of states) {
    const info = await setup({ ...cfg, state });
    await page.waitForTimeout(Number(args.wait ?? 120));
    const m = await measure();
    const ok = !m.over.length && !m.outside.length && !m.cols.length;
    if (!ok) bad++;
    if (args.debug) console.log(JSON.stringify({ name, state, phase: info.phase, card: info.card, skip: info.skip, zl: info.zl }));
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} ${state} ${w}x${h} em=${info.em.toFixed(1)} ${info.l.mode}${info.touch ? ' touch' : ''} n=${m.n}${m.over.length ? ' OVER ' + m.over.join(' ') : ''}${m.outside.length ? ' OUT ' + m.outside.join(' ') : ''}${m.cols.length ? ' COLS ' + JSON.stringify(m.cols) : ''}`);
    if (shots.includes(state) || args.shots === 'all') await page.screenshot({ path: resolve(outDir, `${name}-${state}.png`) });
  }
}
console.log(`\n${bad} failing combos`);
process.exitCode = bad ? 1 : 0;
console.log(errors.length ? 'CONSOLE ERRORS:\n' + [...new Set(errors)].slice(0, 10).join('\n') : 'no console errors');
await browser.close(); server.close();
