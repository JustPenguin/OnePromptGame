// Input report: drives the real game in headless Chromium with real keyboard events and a mocked gamepad and checks the numbers
// (keyboard steering ramp, no stuck keys, taps shorter than a frame, hold-to-respawn, intro skip, rebinding, gamepad analog / d-pad /
// buttons / rumble rules, touch bridge, auto-accelerate, steering assist).  Same harness as scripts/check.mjs (window.__kart).
//
//   node scripts/input.mjs                  build, run everything (exit 1 on a miss)
//   node scripts/input.mjs --no-build       reuse dist/
//   node scripts/input.mjs --only=keyboard,gamepad   keyboard stuck taps respawn rebind gamepad touch assists
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const opt = { track: args.track ?? 'sunny-meadows', only: args.only ? String(args.only).split(',') : null };
const want = (n) => !opt.only || opt.only.includes(n);

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules_global/playwright']) { try { return req(c); } catch { /* next */ } }
  throw new Error('playwright not found (expected global install at /opt/node22/lib/node_modules/playwright)');
}
if (!args['no-build']) { const r = spawnSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' }); if (r.status !== 0) process.exit(1); }

const dist = resolve(root, 'dist');
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const f = resolve(dist, '.' + (p === '/' ? '/index.html' : p));
  if (f.startsWith(dist) && existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon/.test(t)) problems.push(`console.error: ${t}`); } });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/?quality=low`);
await page.waitForFunction(() => window.__kart?.ready, null, { timeout: 60000 });

let failures = 0;
function section(t) { console.log(`\n== ${t}`); }
function check(name, value, lo, hi, unit = '', note = '') {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  if (!ok) failures++;
  const v = Number.isFinite(value) ? (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)) : String(value);
  const target = lo === -Infinity ? `<= ${hi}` : hi === Infinity ? `>= ${lo}` : `${lo} .. ${hi}`;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(64)} ${(v + ' ' + unit).padEnd(10)} target ${target} ${unit} ${note}`);
}
function info(name, value) { console.log(`       ${name.padEnd(64)} ${value}`); }
const yes = (name, cond, note = '') => check(name, cond ? 1 : 0, 1, 1, '', note);
const ev = (fn, arg) => page.evaluate(fn, arg);

// in-page helpers: a private KartInput to read into, frame helpers
await ev(() => {
  const K = window.__kart, H = window.__inTest = {};
  H.input = () => K.app.input;
  H.out = () => (H.o ??= new (K.player.input.constructor)());
  H.read = (dt = 1 / 60) => { const o = H.out(); K.app.input.read(o, dt); return { steer: +o.steer.toFixed(3), throttle: +o.throttle.toFixed(2), brake: +o.brake.toFixed(2), drift: o.drift, item: o.item, look: o.lookBack }; };
  H.step = (n, dt = 1 / 60) => { const s = K.session; for (let i = 0; i < n; i++) { s.update(dt); K.app.input.endFrame(); } };
  H.reset = () => { const i = K.app.input; i.releaseAll(); i.override = null; i.controller = null; i.touch.active = false; i.speedRatio = 0; i.enabled = true; i.endFrame(); };
});
const start = (o = {}) => ev(async ({ trackId, o }) => {
  const K = window.__kart;
  K.clearInput(); K.bot(false);
  await K.startRace({ trackId, laps: 1, racers: 2, skipIntro: true, seed: 3, ...o });
  K.freeze(true);
  window.__inTest.reset();
}, { trackId: opt.track, o });

// ---------------------------------------------------------------------------------------------------------------- keyboard
if (want('keyboard')) {
  section('Keyboard (real key events)');
  await start();
  await ev(() => window.__kart.advance(3.2));
  await ev(() => window.__inTest.reset());
  await page.keyboard.down('ArrowLeft');
  const ramp = await ev(() => { const H = window.__inTest; const r = []; for (let i = 0; i < 6; i++) r.push(H.read(0.05).steer); return r; });
  info('left key: steer every 0.05 s', ramp.join('  '));
  check('first 0.05 s of left: not instant, not slow', -ramp[0], 0.15, 0.40, '');
  check('full lock after about 0.2 s', -ramp[4], 0.98, 1, '');
  await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowRight');
  const rev = await ev(() => { const H = window.__inTest; const r = []; for (let i = 0; i < 3; i++) r.push(H.read(0.05).steer); return r; });
  info('flip to right: steer every 0.05 s', rev.join('  '));
  check('counter-steer crosses zero within 0.1 s', rev[1], 0.01, 1, '');
  await page.keyboard.up('ArrowRight');
  const rel = await ev(() => { const H = window.__inTest; const a = H.read(0.05).steer; const b = H.read(0.05).steer; return [a, b]; });
  check('release returns to centre within 0.1 s', Math.abs(rel[1]), 0, 0.001, '');
  await ev(() => { window.__inTest.input().speedRatio = 1; });
  await page.keyboard.down('ArrowLeft');
  const fast = await ev(() => window.__inTest.read(0.05).steer);
  await page.keyboard.up('ArrowLeft');
  check('at speed the ramp is slower than at a standstill', -fast, 0.14, -ramp[0] - 0.015, '');
  await ev(() => window.__inTest.reset());
  await page.keyboard.down('ArrowUp');
  const thr = await ev(() => window.__inTest.read());
  await page.keyboard.up('ArrowUp'); await page.keyboard.down('KeyS');
  const brk = await ev(() => window.__inTest.read());
  await page.keyboard.up('KeyS');
  check('ArrowUp = full throttle', thr.throttle, 1, 1, '');
  check('S = full brake', brk.brake, 1, 1, '');
}

// ---------------------------------------------------------------------------------------------------------------- stuck keys
if (want('stuck')) {
  section('No stuck keys');
  await ev(() => window.__inTest.reset());
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowLeft');
  const held = await ev(() => { const H = window.__inTest; H.read(0.2); return H.read(0.05); });
  await ev(() => window.dispatchEvent(new Event('blur')));
  const afterBlur = await ev(() => window.__inTest.read(0.05));
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowLeft');
  check('held before the blur: throttle', held.throttle, 1, 1, '');
  check('after window blur: throttle released', afterBlur.throttle, 0, 0, '');
  check('after window blur: steer released', Math.abs(afterBlur.steer), 0, 0.001, '');
  await ev(() => window.__inTest.reset());
  await page.keyboard.down('ArrowUp');
  await ev(() => window.dispatchEvent(new Event('pagehide')));
  const afterHide = await ev(() => window.__inTest.read(0.05));
  await page.keyboard.up('ArrowUp');
  check('after pagehide: throttle released', afterHide.throttle, 0, 0, '');
  await ev(() => window.__inTest.reset());
  const meta = await ev(() => {
    const H = window.__inTest, win = window;
    win.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })); win.dispatchEvent(new KeyboardEvent('keydown', { code: 'MetaLeft' }));
    const a = H.read(0.05).throttle;
    win.dispatchEvent(new KeyboardEvent('keyup', { code: 'MetaLeft' }));           // macOS swallows the other keyups while Meta is down
    return [a, H.read(0.05).throttle];
  });
  check('releasing Meta forgets keys whose keyup was swallowed', meta[1], 0, 0, '');
}

// ---------------------------------------------------------------------------------------------------------------- taps shorter than a frame
if (want('taps')) {
  section('Taps shorter than a frame');
  const t = await ev(() => {
    const H = window.__inTest; H.reset();
    const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const r = {};
    fire('keydown', 'Space'); fire('keyup', 'Space'); r.driftTap1 = H.read().drift; r.driftTap2 = H.read().drift;
    fire('keydown', 'KeyE'); fire('keyup', 'KeyE'); r.itemTap1 = H.read().item; r.itemTap2 = H.read().item;
    fire('keydown', 'Space'); r.held1 = H.read().drift; r.held2 = H.read().drift; fire('keyup', 'Space'); r.released = H.read().drift;
    return r;
  });
  yes('a drift tap between two frames still registers once', t.driftTap1 === true && t.driftTap2 === false);
  yes('an item tap between two frames still registers once', t.itemTap1 === true && t.itemTap2 === false);
  yes('a held drift key stays down until released', t.held1 === true && t.held2 === true && t.released === false);
}

// ---------------------------------------------------------------------------------------------------------------- hold to respawn + intro skip
if (want('respawn')) {
  section('Hold-to-respawn and intro skip');
  await start();
  await ev(() => window.__kart.advance(3.2 + 2));
  await ev(() => window.__inTest.reset());
  await page.keyboard.down('KeyR');
  await ev(() => window.__inTest.step(15));
  const early = await ev(() => ({ active: window.__kart.player.respawn.active, hold: window.__kart.session.respawnHold, edge: window.__kart.app.input.pressed('respawn') }));
  await ev(() => window.__inTest.step(30));
  const late = await ev(() => ({ active: window.__kart.player.respawn.active, count: window.__kart.counts['kart:respawn'] ?? 0 }));
  await page.keyboard.up('KeyR');
  info('after 0.25 s / after 0.75 s', `active ${early.active} hold ${Number(early.hold).toFixed(2)} / active ${late.active}`);
  yes('a quarter second of R does not rescue yet', early.active === false);
  check('the hold progress is visible meanwhile (session.respawnHold)', early.hold, 0.15, 0.85, '');
  yes('R never reports as a key-down edge (hold-only action)', early.edge === false);
  yes('holding R for 0.75 s starts the rescue', late.active === true && late.count === 1);
  await ev(() => window.__inTest.step(60 * 3));
  await start();
  await ev(() => window.__kart.advance(3.2 + 2));
  await page.keyboard.down('KeyR');
  await ev(() => window.__inTest.step(6));
  await page.keyboard.up('KeyR');
  await ev(() => window.__inTest.step(60));
  yes('a quick tap of R does nothing', (await ev(() => window.__kart.counts['kart:respawn'] ?? 0)) === 0);

  await ev(async ({ trackId }) => { const K = window.__kart; await K.startRace({ trackId, laps: 1, racers: 6, skipIntro: false, seed: 2 }); K.freeze(true); window.__inTest.reset(); K.advance(0.6); }, { trackId: opt.track });
  const before = await ev(() => window.__kart.state().phase);
  await page.keyboard.press('Escape');
  await ev(() => window.__inTest.step(6));
  const afterEsc = await ev(() => window.__kart.state().phase);
  await page.keyboard.press('KeyX');
  await ev(() => window.__inTest.step(6));
  const afterKey = await ev(() => window.__kart.state().phase);
  yes('intro is running', before === 'intro');
  yes('Escape does not skip the intro (it opens the pause menu)', afterEsc === 'intro');
  yes('any other key skips it', afterKey !== 'intro', `(phase ${afterKey})`);
}

// ---------------------------------------------------------------------------------------------------------------- rebinding
if (want('rebind')) {
  section('Rebinding');
  const r = await ev(() => {
    const H = window.__inTest, i = H.input(); H.reset();
    const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    i.setBindings({ throttle: ['KeyI'] });
    fire('keydown', 'KeyI'); const a = H.read().throttle; fire('keyup', 'KeyI');
    fire('keydown', 'ArrowUp'); const b = H.read().throttle; fire('keyup', 'ArrowUp');
    fire('keydown', 'KeyS'); const c = H.read().brake; fire('keyup', 'KeyS');
    let captured = null; i.captureNextKey((code) => { captured = code; });
    fire('keydown', 'KeyJ'); const d = H.read().throttle; fire('keyup', 'KeyJ');
    i.setBindings(null);
    fire('keydown', 'ArrowUp'); const e = H.read().throttle; fire('keyup', 'ArrowUp');
    return { a, b, c, captured, d, e };
  });
  yes('a rebound key works', r.a === 1);
  yes('the old default key no longer drives that action', r.b === 0);
  yes('other actions keep their defaults', r.c === 1);
  yes('captureNextKey hands over the next key and swallows it', r.captured === 'KeyJ' && r.d === 0);
  yes('setBindings(null) restores the defaults', r.e === 1);
}

// ---------------------------------------------------------------------------------------------------------------- gamepad (mocked Gamepad API)
if (want('gamepad')) {
  section('Gamepad (mock standard pad)');
  const g = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__inTest, input = K.app.input;
    await K.startRace({ trackId, laps: 1, racers: 2, skipIntro: true, seed: 3 }); K.freeze(true);
    H.reset();
    const calls = [];
    const pad = {
      connected: true, id: 'Mock Pad (STANDARD GAMEPAD)', mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      vibrationActuator: { playEffect: (type, p) => { calls.push({ strong: p.strongMagnitude, weak: p.weakMagnitude, ms: p.duration }); return Promise.resolve('complete'); } },
    };
    const realGet = navigator.getGamepads;
    navigator.getGamepads = () => [pad];
    const btn = (i, pressed, value = pressed ? 1 : 0) => { pad.buttons[i] = { pressed, value }; };
    const res = {};
    const dz = K.app.settings.gamepadDeadzone ?? 0.14;
    res.deadzone = dz;
    pad.axes[0] = 0.1; res.inside = H.read().steer;
    pad.axes[0] = 0.5; res.half = H.read().steer;
    pad.axes[0] = -1; res.fullLeft = H.read().steer;
    pad.axes[0] = 0; btn(7, true, 0.6); res.rt = H.read().throttle; btn(7, false);
    btn(6, true, 0.8); res.lt = H.read().brake; btn(6, false);
    btn(0, true); res.a = H.read().throttle; btn(0, false);
    btn(5, true); res.rb = H.read().drift; btn(5, false);
    btn(2, true); res.x = H.read().item; btn(2, false);
    btn(3, true); res.y = H.read().look; btn(3, false);
    btn(14, true); res.dpad = []; for (let i = 0; i < 6; i++) res.dpad.push(H.read(0.05).steer); btn(14, false); H.read(0.2);
    // Start is polled in endFrame(), so its edge is visible next frame even while the game is paused / input disabled
    btn(9, true); input.enabled = false; input.endFrame(); res.startEdge = input.pressed('pause'); input.endFrame(); res.startEdgeCleared = !input.pressed('pause'); input.enabled = true; btn(9, false); input.endFrame();
    btn(10, true); H.read(); res.l3Held = input.isDown('respawn'); btn(10, false); H.read(); res.l3Released = !input.isDown('respawn');
    // rumble: the first effect plays, a weaker one inside its window is dropped, a stronger one replaces it
    await new Promise((r) => setTimeout(r, 300));
    calls.length = 0;
    input.rumble(0.8, 0.5, 200); input.rumble(0.2, 0.1, 100); input.rumble(1, 1, 100);
    res.rumble = calls.map((c) => `${c.strong}/${c.weak}/${c.ms}`);
    K.app.settings.vibration = false; await new Promise((r) => setTimeout(r, 300)); calls.length = 0; input.rumble(1, 1, 100); res.rumbleOff = calls.length; K.app.settings.vibration = true;
    // session events reach the pad
    await new Promise((r) => setTimeout(r, 300)); calls.length = 0;
    K.session.events.emit('kart:wallHit', { kart: K.player, impact: 15, point: K.player.position, normal: K.player.position });
    res.rumbleWall = calls.length;
    await new Promise((r) => setTimeout(r, 300)); calls.length = 0;
    K.session.events.emit('kart:wallHit', { kart: K.session.karts.find((k) => k !== K.player), impact: 15, point: K.player.position, normal: K.player.position });
    res.rumbleOther = calls.length;
    navigator.getGamepads = realGet;
    return res;
  }, { trackId: opt.track });
  check('stick inside the dead zone gives no steering', Math.abs(g.inside), 0, 0, '');
  check('half stick: fine control near the centre (rescaled + curved)', g.half, 0.2, 0.5, '');
  check('full left stick = full lock', g.fullLeft, -1, -1, '');
  check('right trigger is analog', g.rt, 0.6, 0.6, '');
  check('left trigger brakes, analog', g.lt, 0.8, 0.8, '');
  check('A = full throttle', g.a, 1, 1, '');
  yes('RB drifts, X uses the item, Y looks back', g.rb === true && g.x === true && g.y === true);
  info('d-pad left: steer every 0.05 s', g.dpad.join('  '));
  check('the d-pad ramps like the keyboard (not instant)', Math.abs(g.dpad[0]), 0.15, 0.40, '');
  check('...and reaches full lock', Math.abs(g.dpad[5]), 1, 1, '');
  yes('Start is seen as an edge on the next frame even while input is disabled, and clears', g.startEdge === true && g.startEdgeCleared === true);
  yes('L3 holds / releases hold-to-respawn', g.l3Held === true && g.l3Released === true);
  info('rumble effects played (strong/weak/ms)', g.rumble.join('  '));
  yes('a weaker rumble never replaces a stronger one that is still playing', g.rumble.length === 2 && g.rumble[0].startsWith('0.8/0.5') && g.rumble[1].startsWith('1/1'));
  yes('settings.vibration = false silences the pad', g.rumbleOff === 0);
  yes('a wall hit on the player rumbles the pad', g.rumbleWall >= 1);
  yes('a wall hit on another kart does not', g.rumbleOther === 0);
}

// ---------------------------------------------------------------------------------------------------------------- touch bridge
if (want('touch')) {
  section('Touch bridge (input.touch, written by the on-screen controls)');
  const t = await ev(() => {
    const H = window.__inTest, i = H.input(); H.reset();
    i.touch.active = false; i.touch.steer = -0.7; i.touch.throttle = 1;
    const ignored = H.read();
    i.touch.active = true; i.touch.drift = true; i.touch.item = true;
    const on = H.read(); const device = i.lastDevice;
    i.touch.active = false; i.touch.steer = 0; i.touch.throttle = 0; i.touch.drift = false; i.touch.item = false;
    return { ignored, on, device };
  });
  yes('input.touch is ignored while active = false', t.ignored.steer === 0 && t.ignored.throttle === 0);
  check('analog touch steer passes through', t.on.steer, -0.7, -0.7, '');
  yes('touch throttle / drift / item pass through', t.on.throttle === 1 && t.on.drift === true && t.on.item === true);
  yes('the active device is reported as touch', t.device === 'touch');
}

// ---------------------------------------------------------------------------------------------------------------- assists
if (want('assists')) {
  section('Assists');
  const a = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__inTest;
    const res = {};
    K.app.settings.assists.autoAccelerate = true; H.reset();
    res.auto = H.read().throttle;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' })); res.autoBrake = H.read().throttle; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown' }));
    K.app.settings.assists.autoAccelerate = false; res.autoOff = H.read().throttle;
    // steering assist: hold the stick straight for 25 s on the first section of the track
    const run = async (assist) => {
      K.clearInput(); K.bot(false);
      K.app.settings.assists.steeringAssist = assist;
      await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 2 });
      K.freeze(true); K.setInput({ throttle: 0 }); K.advance(3.2);
      K.setInput({ throttle: 1, steer: 0 });
      let worst = 0, off = 0, n = 0; const s = K.session, p = K.player;
      for (let i = 0; i < 60 * 25; i++) { s.update(1 / 60); K.app.input.endFrame(); n++; worst = Math.max(worst, Math.abs(p.query.lateral)); if (!p.onRoad) off++; }
      return { worst, offFrac: off / n, distance: p.race.distance };
    };
    res.plain = await run(false); res.assisted = await run(true);
    K.app.settings.assists.steeringAssist = false; K.clearInput();
    return res;
  }, { trackId: opt.track });
  check('auto-accelerate holds the throttle without a key', a.auto, 1, 1, '');
  check('...but braking still cancels it', a.autoBrake, 0, 0, '');
  check('...and it can be switched off again', a.autoOff, 0, 0, '');
  info('hands off the stick for 25 s, worst lateral / off-road fraction / distance', `plain ${a.plain.worst.toFixed(1)} m / ${a.plain.offFrac.toFixed(2)} / ${a.plain.distance.toFixed(0)} m,  assisted ${a.assisted.worst.toFixed(1)} m / ${a.assisted.offFrac.toFixed(2)} / ${a.assisted.distance.toFixed(0)} m`);
  check('steering assist keeps a hands-off kart on the road (off-road fraction)', a.assisted.offFrac, 0, 0.1, '');
  check('steering assist: the kart drives further than without it', a.assisted.distance / Math.max(1, a.plain.distance), 1.2, 99, 'x');
}

if (problems.length) { failures++; console.log('\nBROWSER ERRORS:'); [...new Set(problems)].slice(0, 20).forEach((p) => console.log(' - ' + p)); }
await browser.close();
server.close();
console.log(failures ? `\nINPUT REPORT: ${failures} target(s) missed` : '\nINPUT REPORT: all targets met');
process.exit(failures ? 1 : 0);
