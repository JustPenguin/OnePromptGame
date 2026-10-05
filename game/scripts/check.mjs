// Headless regression check: builds, serves dist/, loads the game in Chromium (SwiftShader WebGL) and runs full
// AI-driven races on one or all tracks using the window.__kart harness (no real-time rendering needed).
//
//   node scripts/check.mjs                          sunny-meadows, 1 lap, 8 racers
//   node scripts/check.mjs --track=all --laps=2     every registered track
//   node scripts/check.mjs --track=neon-nights --shot=.qa/neon.png    also render one frame mid-race
//   node scripts/check.mjs --no-build               reuse dist/
//   options: --racers=8 --speed=pro --seconds=600 --seed=1 --quality=low --size=640x360 --verbose
//   --prod   test the minified production build        --csp   serve with an artifact-like Content-Security-Policy and
//                                                      fail on any CSP violation (no eval, no external loads...)
//
// Fails (exit 1) on: console/page errors, non-finite kart state, karts that never finish, stuck karts, excess respawns.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const opt = {
  track: args.track ?? 'sunny-meadows', laps: Number(args.laps ?? 1), racers: Number(args.racers ?? 8), speed: args.speed ?? 'pro',
  seconds: Number(args.seconds ?? 600), seed: Number(args.seed ?? 1), quality: args.quality ?? 'low', size: (args.size ?? '640x360').split('x').map(Number),
  verbose: !!args.verbose, shot: args.shot ?? null,
};

function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules_global/playwright'];
  const req = createRequire(import.meta.url);
  for (const c of candidates) { try { return req(c); } catch { /* try next */ } }
  throw new Error('playwright not found (expected global install at /opt/node22/lib/node_modules/playwright)');
}

if (!args['no-build']) {
  const r = spawnSync('node', ['scripts/build.mjs', ...(args.prod ? ['--prod'] : [])], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

const dist = resolve(root, 'dist');
// Approximation of the Claude Artifact sandbox CSP: inline script/style only (plus a few CDNs), data:/blob: media, no network.
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; object-src 'none'";
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const f = resolve(dist, '.' + (p === '/' ? '/index.html' : p));
  if (f.startsWith(dist) && existsSync(f)) {
    const h = { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' };
    if (args.csp) h['content-security-policy'] = CSP;
    res.writeHead(200, h); res.end(readFileSync(f));
  } else if (p === '/favicon.ico') { res.writeHead(204); res.end(); }
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
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon/.test(t)) problems.push(`console.error: ${t}`); } else if (opt.verbose && m.type() === 'warning') console.log('[warn]', m.text()); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
if (args.csp) await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`); }); });

await page.goto(`http://127.0.0.1:${port}/?quality=${opt.quality}`);
await page.waitForFunction(() => window.__kart?.ready, null, { timeout: 60000 });
const allTracks = await page.evaluate(() => window.__kart.trackIds());
const tracks = opt.track === 'all' ? allTracks : opt.track.split(',');

let failed = false;
for (const trackId of tracks) {
  const t0 = Date.now();
  const local = [];
  await page.evaluate((o) => window.__kart.startRace({ trackId: o.trackId, laps: o.laps, racers: o.racers, speedClass: o.speed, seed: o.seed, skipIntro: true }), { trackId, laps: opt.laps, racers: opt.racers, speed: opt.speed, seed: opt.seed });
  await page.evaluate(() => { window.__kart.freeze(true); window.__kart.autoDrive(true); });
  let st = await page.evaluate(() => window.__kart.state());
  const trackLength = st.trackLength;
  const history = [];
  let simTime = 0, shotDone = false;
  while (simTime < opt.seconds) {
    st = await page.evaluate(() => window.__kart.advance(10));
    simTime += 10;
    history.push({ t: simTime, d: st.karts.map((k) => k.distance), fin: st.karts.map((k) => k.finished) });
    if (!st.karts.every((k) => k.finite)) { local.push('non-finite kart state'); break; }
    if (opt.shot && !shotDone && simTime >= 20) {
      shotDone = true;
      mkdirSync(dirname(resolve(root, opt.shot)), { recursive: true });
      await page.evaluate(() => window.__kart.render());
      await page.screenshot({ path: resolve(root, opt.shot) });
    }
    if (st.phase === 'results') break;
    // stuck check: any unfinished kart that gained < 25 m in the last 20 s
    if (history.length >= 3) {
      const a = history[history.length - 3], b = history[history.length - 1];
      st.karts.forEach((k, i) => { if (!k.finished && b.d[i] - a.d[i] < 25 && simTime > 20) local.push(`kart ${k.name} (#${k.id}) stuck near s=${k.s} (gained ${(b.d[i] - a.d[i]).toFixed(1)} m in 20 s)`); });
    }
  }
  const counts = await page.evaluate(() => window.__kart.counts);
  const finishedAll = st.karts.every((k) => k.finished);
  if (!finishedAll) local.push(`not all karts finished within ${opt.seconds}s sim (finished: ${st.karts.filter((k) => k.finished).length}/${st.karts.length})`);
  const respawns = counts['kart:respawn'] ?? 0;
  if (respawns > st.karts.length) local.push(`too many respawns: ${respawns}`);
  const times = st.karts.filter((k) => k.finished).map((k) => k.finishTime).sort((a, b) => a - b);
  console.log(`\n== ${trackId}  (${trackLength} m, ${opt.laps} lap(s), ${opt.racers} racers, ${opt.speed})  wall ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   finish times: ${times.map((t) => t.toFixed(1)).join(', ') || '-'}   avg lap ≈ ${times.length ? (times.reduce((a, b) => a + b, 0) / times.length / opt.laps).toFixed(1) : '-'} s`);
  console.log(`   events: ${Object.entries(counts).map(([k, v]) => `${k.replace(/^[a-z]+:/, '')}=${v}`).join(' ')}`);
  if (local.length) { failed = true; console.log('   PROBLEMS:'); [...new Set(local)].forEach((p) => console.log('   - ' + p)); } else console.log('   OK');
}
if (args.csp) { const v = await page.evaluate(() => window.__csp ?? []); if (v.length) { failed = true; console.log('\nCSP VIOLATIONS:'); [...new Set(v)].forEach((x) => console.log(' - ' + x)); } else console.log('\nCSP: no violations'); }
if (problems.length) { failed = true; console.log('\nBROWSER ERRORS:'); [...new Set(problems)].slice(0, 20).forEach((p) => console.log(' - ' + p)); }
await browser.close();
server.close();
console.log(failed ? '\nCHECK FAILED' : '\nCHECK PASSED');
process.exit(failed ? 1 : 0);
