// Camera report: drives the real game in headless Chromium through the camera's states and checks the numbers
// (intro hand-over, speed FOV, boost kick, drift swing, look-back, modes, wall clearance, shake settings, slow frames,
// finish orbit / spectating, aspect ratios, cost).  Same harness as scripts/check.mjs (window.__kart).
//
//   node scripts/camera.mjs                      build, run every scenario on sunny-meadows (exit 1 on a miss)
//   node scripts/camera.mjs --no-build           reuse dist/
//   node scripts/camera.mjs --track=cactus-canyon --size=960x540
//   node scripts/camera.mjs --shots=.qa/camera   also save a screenshot of every scenario state (view them with the Read tool)
//   node scripts/camera.mjs --only=intro,wall    run only the named scenarios (intro chase boost lookback drift modes lap wall shake slow finish aspect cost)
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const opt = { track: args.track ?? 'sunny-meadows', size: String(args.size ?? '960x540').split('x').map(Number), shots: args.shots ?? null, only: args.only ? String(args.only).split(',') : null, verbose: !!args.verbose };
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
const page = await (await browser.newContext({ viewport: { width: opt.size[0], height: opt.size[1] } })).newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon/.test(t)) problems.push(`console.error: ${t}`); } });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/?quality=low`);
await page.waitForFunction(() => window.__kart?.ready, null, { timeout: 60000 });
if (opt.shots) mkdirSync(resolve(root, opt.shots), { recursive: true });

// ---------------------------------------------------------------------------------------------------------------- reporting
let failures = 0;
function section(t) { console.log(`\n== ${t}`); }
function check(name, value, lo, hi, unit = '', note = '') {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  if (!ok) failures++;
  const v = Number.isFinite(value) ? (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)) : String(value);
  const target = lo === -Infinity ? `<= ${hi}` : hi === Infinity ? `>= ${lo}` : `${lo} .. ${hi}`;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(62)} ${(v + ' ' + unit).padEnd(12)} target ${target} ${unit} ${note}`);
}
function info(name, value) { console.log(`       ${name.padEnd(62)} ${value}`); }
const shot = async (name) => { if (!opt.shots) return; await page.evaluate(() => window.__kart.render()); await page.screenshot({ path: resolve(root, opt.shots, `${name}.png`) }); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const R2D = 180 / Math.PI;

// helpers that run inside the page (installed once)
await ev(() => {
  const K = window.__kart;
  const H = window.__camTest = {};
  H.step = (n, dt = 1 / 60) => { const s = K.session; for (let i = 0; i < n; i++) { s.update(dt); K.app.input.endFrame(); } };
  H.wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  /** angle (rad, + = left) of the camera's line of sight (camera -> kart) and its distance / height relative to the kart */
  H.view = () => {
    const s = K.session, k = s.cameraTarget ?? s.player, c = s.camera.position;
    const dx = k.position.x - c.x, dz = k.position.z - c.z;
    return { sight: Math.atan2(dx, dz), dist: Math.hypot(dx, dz), height: c.y - k.position.y, fov: s.camera.fov };
  };
  H.q = null;
  H.clear = () => {   // metres between the camera and the road under it / the terrain (if the world has one)
    const s = K.session, c = s.camera.position, k = s.cameraTarget ?? s.player;
    H.q ??= new (s.player.query.constructor)();
    s.track.project(c, H.q, k.query.index);          // continuity from the kart's own projection (like the camera itself): circuits that cross over themselves have two roads under one spot
    const road = c.y - H.q.height;
    const g = s.track.world?.groundAt ? c.y - s.track.world.groundAt(c.x, c.z) : Infinity;
    return { road, ground: g, lateral: H.q.lateral, corridor: H.q.halfWidth + H.q.shoulder };
  };
});

const startSolo = (o = {}) => ev(async ({ trackId, o }) => {
  const K = window.__kart;
  K.clearInput(); K.bot(false);
  await K.startRace({ trackId, laps: 2, racers: 1, mode: 'timetrial', skipIntro: true, seed: 7, ...o });
  K.freeze(true);
}, { trackId: opt.track, o });

// ---------------------------------------------------------------------------------------------------------------- intro
if (want('intro')) {
  section('Intro fly-over');
  const r = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    K.clearInput(); K.bot(false);
    await K.startRace({ trackId, laps: 2, racers: 8, skipIntro: false, seed: 3 });
    K.freeze(true);
    const s = K.session, rig = s.cameraRig, cam = s.camera;
    let n = 0, minRoad = 99, minGround = 99, maxMove = 0, maxFovStep = 0, prev = null, last = null, prevFov = null, aerial = 0;
    while (s.race.phase === 'intro' && n < 60 * 10) {
      H.step(1);
      const p = cam.position;
      if (prev) maxMove = Math.max(maxMove, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z));
      if (prevFov !== null) maxFovStep = Math.max(maxFovStep, Math.abs(cam.fov - prevFov));
      const c = H.clear(); minRoad = Math.min(minRoad, c.road); minGround = Math.min(minGround, c.ground);
      aerial = Math.max(aerial, p.y - s.player.position.y);
      prev = { x: p.x, y: p.y, z: p.z }; prevFov = cam.fov; last = { x: p.x, y: p.y, z: p.z, fov: cam.fov };
      n++;
    }
    const duration = n / 60;
    H.step(1);
    const first = { x: cam.position.x, y: cam.position.y, z: cam.position.z, fov: cam.fov };
    const handOver = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
    // the chase pose the camera should have arrived at: snap a fresh pose for the (stationary) player and compare
    H.step(70);
    const settled = { x: cam.position.x, y: cam.position.y, z: cam.position.z, fov: cam.fov };
    rig.snapToTarget(); H.step(1);
    const ref = { x: cam.position.x, y: cam.position.y, z: cam.position.z, fov: cam.fov };
    return { duration, endsOn: Math.hypot(settled.x - last.x, settled.y - last.y, settled.z - last.z), endsOnRef: Math.hypot(ref.x - last.x, ref.y - last.y, ref.z - last.z), fovErr: Math.abs(ref.fov - last.fov), handOver, maxMove, maxFovStep, minRoad, minGround, aerial, phase: s.race.phase };
  }, { trackId: opt.track });
  check('intro length', r.duration, 3.2, 3.8, 's');
  check('last intro frame is the chase pose (position error)', r.endsOnRef, 0, 0.6, 'm');
  check('last intro frame is the chase pose (FOV error)', r.fovErr, 0, 1.0, 'deg');
  check('hand-over to the chase camera does not jump', r.handOver, 0, 0.5, 'm');
  check('fastest camera movement during the intro (per frame)', r.maxMove * 60, 0, 130, 'm/s');
  check('FOV change per frame during the intro', r.maxFovStep, 0, 1.2, 'deg');
  check('camera stays above the road', r.minRoad, 1.0, Infinity, 'm');
  check('camera stays above the terrain (when the world has one)', r.minGround, 0.8, Infinity, 'm');
  check('the fly-over really goes up (max height over the kart)', r.aerial, 12, Infinity, 'm');
  await shot('intro-end');
  // skipping: any key -> straight back to the chase camera
  const sk = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    await K.startRace({ trackId, laps: 1, racers: 4, skipIntro: false, seed: 3 }); K.freeze(true);
    const s = K.session, cam = s.camera;
    H.step(70);
    const mid = s.race.phase;
    K.skipIntro();
    H.step(100);
    const a = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    s.cameraRig.snapToTarget(); H.step(1);
    return { mid, phase: s.race.phase, err: Math.hypot(a.x - cam.position.x, a.y - cam.position.y, a.z - cam.position.z) };
  }, { trackId: opt.track });
  check('skip: still in the intro after 1.2 s', sk.mid === 'intro' ? 1 : 0, 1, 1, '');
  check('skip: the race moves on at once', sk.phase !== 'intro' ? 1 : 0, 1, 1, '', `(phase ${sk.phase})`);
  check('skip: camera is on the chase pose 1.6 s later', sk.err, 0, 0.8, 'm');
}

// ---------------------------------------------------------------------------------------------------------------- chase: speed, boost, look-back, modes
if (want('chase') || want('boost') || want('lookback') || want('modes')) {
  await startSolo();
  const base = await ev(() => { const H = window.__camTest; H.step(30); return H.view(); });
  // Cruise at exactly top speed with the bot steering and the speed pinned; a boost pad on the way would contaminate a measurement,
  // so a window that saw one is discarded and measured again further down the road.
  const run = await ev(() => {
    const K = window.__kart, H = window.__camTest, s = K.session, k = s.player, rig = s.cameraRig;
    K.bot(true, { drift: false });
    const cruise = () => { k.boost.timer = 0; k.boost.strength = 0; k.speed = Math.min(k.speed, k.stats.topSpeed); };
    let pad = false; s.events.on('kart:boost', (e) => { if (e.kart === k && e.source === 'pad') pad = true; });
    const hold = (frames) => { for (let i = 0; i < frames; i++) { cruise(); H.step(1); } };
    hold(60 * 5);
    for (let attempt = 0; attempt < 12; attempt++) {
      pad = false;
      hold(60 * 2);
      const before = { ...H.view(), kmh: k.speed * 3.6 };
      if (pad) continue;
      K.boost(null, 0.38, 1.4);
      let maxFov = before.fov, maxDist = before.dist, maxKick = 0;
      for (let i = 0; i < 48; i++) { H.step(1); const v = H.view(); maxFov = Math.max(maxFov, v.fov); maxDist = Math.max(maxDist, v.dist); maxKick = Math.max(maxKick, rig.boostKick); }
      for (let i = 0; i < 60 * 4; i++) { if (i > 60 * 2.2) cruise(); H.step(1); }
      const after = H.view();
      if (pad) continue;
      return { attempt, before, maxFov, maxDist, maxKick, after };
    }
    return null;
  });
  if (!run) { failures++; console.log('  FAIL could not find a boost-pad-free stretch to measure the cruise camera'); }
  const top = run?.before ?? { dist: NaN, height: NaN, fov: NaN, kmh: NaN };
  if (want('chase') && run) {
    section('Chase camera');
    info('standstill: distance / height / fov', `${base.dist.toFixed(2)} m / ${base.height.toFixed(2)} m / ${base.fov.toFixed(1)} deg`);
    info('top speed (' + top.kmh.toFixed(0) + ' km/h): distance / height / fov', `${top.dist.toFixed(2)} m / ${top.height.toFixed(2)} m / ${top.fov.toFixed(1)} deg`);
    check('standstill: sits behind and above the kart (distance)', base.dist, 5.0, 8.0, 'm');
    check('standstill: height above the kart', base.height, 2.0, 4.0, 'm');
    check('speed widens the FOV', top.fov - base.fov, 3.5, 11, 'deg');
    check('speed pulls the camera back', top.dist - base.dist, 0.3, 3.0, 'm');
    await shot('chase-top-speed');
  }
  if (want('boost') && run) {
    section('Boost kick');
    check('boost: FOV kick', run.maxFov - run.before.fov, 3, 14, 'deg');
    check('boost: pull-back', run.maxDist - run.before.dist, 0.4, 3.5, 'm');
    check('after the boost the FOV is back to the cruise value', Math.abs(run.after.fov - run.before.fov), 0, 1.5, 'deg');
    check('after the boost the distance is back to the cruise value', Math.abs(run.after.dist - run.before.dist), 0, 0.6, 'm');
    await shot('boost');
  }
  if (want('lookback')) {
    section('Look back');
    const l = await ev(() => {
      const K = window.__kart, H = window.__camTest, s = K.session, k = s.player;
      K.bot(false);
      K.setInput({ throttle: 1, steer: 0, lookBack: true });
      H.step(36);
      const back = Math.abs(H.wrap(H.view().sight - k.heading));
      K.setInput({ throttle: 1, steer: 0, lookBack: false });
      H.step(24);
      const early = Math.abs(H.wrap(H.view().sight - k.heading));
      H.step(36);
      const later = Math.abs(H.wrap(H.view().sight - k.heading));
      return { back, early, later };
    });
    check('looking back: the camera ends up in front of the kart', l.back * R2D, 150, 200, 'deg', '(0.6 s after pressing)');
    check('released: back behind the kart within 1 s', l.later * R2D, 0, 12, 'deg');
    await shot('lookback');
    await ev(() => window.__kart.clearInput());
  }
  if (want('modes')) {
    section('Camera modes (C key)');
    const m = await ev(() => {
      const K = window.__kart, H = window.__camTest;
      K.bot(true, { drift: false });
      const out = {};
      for (const mode of ['chase', 'far', 'close']) { K.cameraMode(mode); H.step(90); out[mode] = H.view(); }
      K.cameraMode('chase');
      out.cycle = [K.cameraMode(), K.cameraMode(), K.cameraMode()];
      return out;
    });
    info('distance / height / fov  close | chase | far', `${m.close.dist.toFixed(1)}/${m.close.height.toFixed(1)}/${m.close.fov.toFixed(0)}  |  ${m.chase.dist.toFixed(1)}/${m.chase.height.toFixed(1)}/${m.chase.fov.toFixed(0)}  |  ${m.far.dist.toFixed(1)}/${m.far.height.toFixed(1)}/${m.far.fov.toFixed(0)}`);
    check('far is further than chase', m.far.dist - m.chase.dist, 1.5, 8, 'm');
    check('close is nearer than chase', m.chase.dist - m.close.dist, 1.0, 5, 'm');
    check('far is higher than chase', m.far.height - m.chase.height, 0.8, 4, 'm');
    check('the key cycles chase -> far -> close -> chase', m.cycle.join('>') === 'far>close>chase' ? 1 : 0, 1, 1, '', `(${m.cycle.join('>')})`);
    await shot('mode-far');
  }
}

// ---------------------------------------------------------------------------------------------------------------- drift swing
if (want('drift')) {
  section('Drift swing');
  const d = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    const lap = async (drift) => {
      K.clearInput(); K.bot(false);
      await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 7 }); K.freeze(true);
      K.bot(true, { drift, chain: 0 });
      const s = K.session, k = s.player, track = s.track;
      let sum = 0, n = 0, i = 0;
      while (!k.race.finished && i < 60 * 150) {
        H.step(1); i++;
        const curv = track.curvatureAt(k.query.s);
        const inTurn = Math.abs(curv) > 0.006 && k.speed > 20 && k.grounded && s.race.phase === 'racing';
        if (inTurn && (drift ? k.drift.dir !== 0 && k.drift.level >= 1 : k.drift.dir === 0)) { sum += Math.sign(curv) * H.wrap(H.view().sight - k.moveYaw); n++; }
      }
      return { swing: n ? sum / n : NaN, samples: n };
    };
    const plain = await lap(false), drifting = await lap(true);
    return { plain, drifting };
  }, { trackId: opt.track });
  info('mean camera line of sight vs travel direction in corners (+ = looks into the turn)', `plain steering ${(d.plain.swing * R2D).toFixed(1)} deg (${d.plain.samples} frames), drifting ${(d.drifting.swing * R2D).toFixed(1)} deg (${d.drifting.samples} frames)`);
  check('the bot drifted (frames in a drift above level 1)', d.drifting.samples, 30, Infinity, '');
  check('a drift swings the camera further into the turn than plain steering', (d.drifting.swing - d.plain.swing) * R2D, 2.0, 40, 'deg');
  await shot('drift');
}

// ---------------------------------------------------------------------------------------------------------------- a whole lap
if (want('lap')) {
  section('A whole lap with the drifting bot (camera never loses the kart, never clips)');
  const l = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    K.clearInput(); K.bot(false);
    await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 5 }); K.freeze(true);
    K.bot(true, { drift: true, chain: 2 });
    const s = K.session, k = s.player;
    let n = 0, maxDist = 0, minRoad = 99, minGround = 99, over = -99, drifts = 0, finite = true, maxFov = 0, minFov = 99, respawns = 0;
    s.events.on('kart:respawn', (e) => { if (e.kart === k) respawns++; });
    while (!k.race.finished && n < 60 * 160) {
      H.step(1); n++;
      if (s.race.phase !== 'racing' || k.respawn.active) continue;
      const v = H.view();
      finite = finite && Number.isFinite(v.dist + v.fov);
      maxDist = Math.max(maxDist, v.dist); maxFov = Math.max(maxFov, v.fov); minFov = Math.min(minFov, v.fov);
      const c = H.clear();
      minRoad = Math.min(minRoad, c.road); minGround = Math.min(minGround, c.ground); over = Math.max(over, Math.abs(c.lateral) - c.corridor);
      if (k.drift.dir !== 0) drifts++;
    }
    return { time: k.race.finished ? k.race.finishTime : NaN, maxDist, minRoad, minGround, over, drifts, finite, maxFov, minFov, respawns };
  }, { trackId: opt.track });
  info('lap time / frames in a drift / respawns', `${l.time.toFixed(1)} s / ${l.drifts} / ${l.respawns}`);
  check('the lap was completed', Number.isFinite(l.time) ? 1 : 0, 1, 1, '');
  check('camera never loses the kart (max distance, respawn flights excluded)', l.finite ? l.maxDist : NaN, 4, 13, 'm');
  check('camera never clips under the road', l.minRoad, 0.8, Infinity, 'm');
  check('camera never clips under the terrain (when the world has one)', l.minGround, 0.6, Infinity, 'm');
  check('camera never leaves the corridor by more than a metre', l.over, -Infinity, 1.0, 'm');
  check('FOV stays within a sane band over the lap', l.maxFov - l.minFov, 0, 30, 'deg');
}

// ---------------------------------------------------------------------------------------------------------------- walls: the camera must stay inside the corridor
if (want('wall')) {
  section('Wall slide');
  const w = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 3 }); K.freeze(true); K.advance(3.2);
    const s = K.session, k = s.player;
    const res = [];
    for (const side of [1, -1]) {
      K.teleport(null, 120, 8 * side);
      k.heading = k.moveYaw = k.heading - 0.43 * side; k.speed = 22;       // 25 degrees into the wall, then slide along it
      K.setInput({ throttle: 1, steer: 0 });
      let worstCam = 0, minRoad = 99, minGround = 99, corridor = 0;
      for (let i = 0; i < 60 * 3; i++) {
        H.step(1);
        const c = H.clear();
        worstCam = Math.max(worstCam, Math.abs(c.lateral) - c.corridor); minRoad = Math.min(minRoad, c.road); minGround = Math.min(minGround, c.ground); corridor = c.corridor;
      }
      res.push({ side, over: worstCam, minRoad, minGround, corridor });
    }
    return res;
  }, { trackId: opt.track });
  for (const r of w) {
    check(`side ${r.side > 0 ? 'right' : 'left'}: camera beyond the corridor edge (road + shoulder)`, r.over, -Infinity, 1.0, 'm');
    check(`side ${r.side > 0 ? 'right' : 'left'}: camera above the road`, r.minRoad, 1.0, Infinity, 'm');
    check(`side ${r.side > 0 ? 'right' : 'left'}: camera above the terrain`, r.minGround, 0.8, Infinity, 'm');
  }
  await shot('wall');
  await ev(() => window.__kart.clearInput());
}

// ---------------------------------------------------------------------------------------------------------------- shake and accessibility
if (want('shake')) {
  section('Shake settings');
  const sh = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 3 }); K.freeze(true); K.advance(3.2);
    const s = K.session, k = s.player, rig = s.cameraRig;
    K.setInput({ throttle: 1 }); H.step(120);
    const hit = () => { rig.shake = 0; K.spin(null, 1.0); H.step(3); const v = rig.shake; H.step(120); return v; };
    const out = {};
    s.settings.cameraShake = true; s.settings.reducedMotion = false; out.on = hit();
    s.settings.cameraShake = false; out.off = hit();
    s.settings.cameraShake = true; s.settings.reducedMotion = true; out.reduced = hit();
    s.settings.reducedMotion = false;
    // fovBoost off: no speed FOV (the speed is pinned so the comparison does not depend on how the road bends)
    const hold = (n) => { for (let i = 0; i < n; i++) { k.speed = k.stats.topSpeed; k.boost.timer = 0; H.step(1); } };
    s.settings.fovBoost = true; hold(120); const fovOn = s.camera.fov;
    s.settings.fovBoost = false; hold(120); const fovOff = s.camera.fov;
    s.settings.fovBoost = true;
    // deterministic: the same hit gives the same shake path
    return { ...out, fovOn, fovOff };
  }, { trackId: opt.track });
  check('hit shake with the setting on', sh.on, 0.25, 1, '');
  check('no shake when settings.cameraShake is off', sh.off, 0, 0.001, '');
  check('no shake with reducedMotion', sh.reduced, 0, 0.001, '');
  check('settings.fovBoost off removes the speed FOV (FOV on - off)', sh.fovOn - sh.fovOff, 3, 12, 'deg');
  await ev(() => window.__kart.clearInput());
}

// ---------------------------------------------------------------------------------------------------------------- slow frames
if (want('slow')) {
  section('Slow frames (tab in the background / low-end device)');
  const sl = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 3 }); K.freeze(true);
    const s = K.session, k = s.player;
    K.bot(true, { drift: false }); H.step(60 * 9);
    const res = {};
    for (const [name, dt] of [['10 fps', 0.1], ['4 fps', 0.25], ['1 fps', 1.0]]) {
      let worstDist = 0, finite = true, maxFov = 0, minFov = 99;
      for (let i = 0; i < 12; i++) {
        H.step(1, dt);
        const v = H.view();
        finite = finite && Number.isFinite(v.dist + v.fov + s.camera.position.x + s.camera.position.y + s.camera.position.z);
        worstDist = Math.max(worstDist, v.dist); maxFov = Math.max(maxFov, v.fov); minFov = Math.min(minFov, v.fov);
      }
      res[name] = { worstDist, finite, fovRange: maxFov - minFov, speed: k.speed * 3.6 };
    }
    return res;
  }, { trackId: opt.track });
  for (const [name, r] of Object.entries(sl)) {
    check(`${name}: camera stays finite and near the kart (max distance)`, r.finite ? r.worstDist : NaN, 3, 14, 'm');
    check(`${name}: FOV stays sane (range over 12 frames)`, r.fovRange, 0, 14, 'deg');
  }
  await ev(() => window.__kart.bot(false));
}

// ---------------------------------------------------------------------------------------------------------------- finish orbit + spectating
if (want('finish')) {
  section('Finish camera and spectating');
  const f = await ev(async ({ trackId }) => {
    const K = window.__kart, H = window.__camTest;
    K.clearInput(); K.bot(false);
    await K.startRace({ trackId, laps: 1, racers: 5, skipIntro: true, seed: 8, playerGrid: 'first' }); K.freeze(true);
    K.bot(true, { drift: false }); K.advance(3.2 + 4);
    K.finishRace([K.player.id], 14);                    // only the player jumps to the line
    const s = K.session, k = s.player, rig = s.cameraRig;
    let n = 0; while (!k.race.finished && n < 60 * 20) { H.step(1); n++; }
    const orbit = [];
    for (let i = 0; i < 6; i++) { H.step(30); const v = H.view(); orbit.push({ d: v.dist, a: v.sight }); }
    let turned = 0; for (let i = 1; i < orbit.length; i++) turned += Math.abs(H.wrap(orbit[i].a - orbit[i - 1].a));
    const targetsSeen = new Set();
    for (let i = 0; i < 60 * 14; i++) { H.step(1); targetsSeen.add((s.cameraTarget ?? s.player).name); }
    const tgt = s.cameraTarget;
    // manual cycling with left / right
    rig.cycleTarget(1); const t1 = (s.cameraTarget ?? s.player).name; rig.cycleTarget(-1); const t2 = (s.cameraTarget ?? s.player).name;
    H.step(60);
    const v = H.view();
    return { place: k.race.place, orbitMin: Math.min(...orbit.map((o) => o.d)), orbitMax: Math.max(...orbit.map((o) => o.d)), turned, spectated: targetsSeen.size, phase: s.race.phase, t1, t2, finalDist: v.dist, finite: Number.isFinite(v.dist) };
  }, { trackId: opt.track });
  check('orbit keeps a sensible distance (min)', f.orbitMin, 3.5, 20, 'm');
  check('orbit keeps a sensible distance (max)', f.orbitMax, 3.5, 20, 'm');
  check('the orbit really moves round the kart (total sight-line change over 1.5 s)', f.turned * R2D, 15, 400, 'deg');
  check('afterwards the camera follows other karts (distinct targets seen)', f.spectated, 2, 99, '');
  check('left / right changes the followed kart', f.t1 !== f.t2 ? 1 : 0, 1, 1, '', `(${f.t1} / ${f.t2})`);
  check('spectating keeps a finite chase distance', f.finite ? f.finalDist : NaN, 2, 20, 'm');
  await shot('finish');
  await ev(() => window.__kart.clearInput());
}

// ---------------------------------------------------------------------------------------------------------------- aspect ratios
if (want('aspect')) {
  section('Aspect ratios (the kart must stay framed)');
  for (const [name, w, h] of [['desktop 16:9', 960, 540], ['ultra-wide 21:9', 1260, 540], ['landscape phone', 844, 390], ['portrait phone', 390, 844], ['square-ish tablet', 800, 700]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    const a = await ev(async ({ trackId }) => {
      const K = window.__kart, H = window.__camTest;
      K.clearInput(); K.bot(false);
      await K.startRace({ trackId, laps: 1, racers: 1, mode: 'timetrial', skipIntro: true, seed: 7 }); K.freeze(true);
      K.bot(true, { drift: false }); H.step(60 * 6);
      K.render(); H.step(90); K.render();              // the renderer applies the new aspect at render time; the camera then reframes
      const s = K.session, k = s.player, cam = s.camera;
      cam.updateMatrixWorld(true);
      const p = k.position.clone(); p.y += 0.6;
      p.project(cam);
      const vfov = cam.fov, hfov = 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * cam.aspect) * 180 / Math.PI;
      return { aspect: cam.aspect, x: p.x, y: p.y, vfov, hfov };
    }, { trackId: opt.track });
    info(`${name} (${w}x${h}): aspect ${a.aspect.toFixed(2)}, fov v/h`, `${a.vfov.toFixed(0)} / ${a.hfov.toFixed(0)} deg, kart at ndc (${a.x.toFixed(2)}, ${a.y.toFixed(2)})`);
    check(`${name}: kart is horizontally centred`, Math.abs(a.x), 0, 0.12, 'ndc');
    check(`${name}: kart sits in the lower half, fully on screen`, a.y, -0.85, -0.05, 'ndc');
    check(`${name}: horizontal FOV is comfortable`, a.hfov, 42, 118, 'deg');
    await shot(`aspect-${name.replace(/[^a-z0-9]+/gi, '-')}`);
  }
  await page.setViewportSize({ width: opt.size[0], height: opt.size[1] });
  await ev(() => window.__kart.bot(false));
}

// ---------------------------------------------------------------------------------------------------------------- cost
if (want('cost')) {
  section('Cost');
  const c = await ev(async ({ trackId }) => {
    const K = window.__kart;
    await K.startRace({ trackId, laps: 1, racers: 8, skipIntro: true, seed: 3 }); K.freeze(true); K.autoDrive(true); K.advance(3.2 + 10);
    const s = K.session, rig = s.cameraRig;
    const t0 = performance.now(); for (let i = 0; i < 2000; i++) rig.update(1 / 60); const t1 = performance.now();
    return { ms: (t1 - t0) / 2000 };
  }, { trackId: opt.track });
  check('camera update', c.ms, 0, 0.1, 'ms/frame');
}

if (problems.length) { failures++; console.log('\nBROWSER ERRORS:'); [...new Set(problems)].slice(0, 20).forEach((p) => console.log(' - ' + p)); }
await browser.close();
server.close();
console.log(failures ? `\nCAMERA REPORT: ${failures} target(s) missed` : '\nCAMERA REPORT: all targets met');
process.exit(failures ? 1 : 0);
