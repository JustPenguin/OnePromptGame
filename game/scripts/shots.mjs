// Visual QA: renders chase-cam frames of races (and menu screens) to PNGs in .qa/shots/ for human/agent review.
//   node scripts/shots.mjs --track=all --at=14,40 --quality=high --size=960x540
//   node scripts/shots.mjs --track=neon-nights --at=3 --driver=luna --kart=streak
//   node scripts/shots.mjs --menus                  title/menu/select screens (real UI, via keyboard)
// Uses the same freeze/advance/render harness as check.mjs; --no-build reuses dist/.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const size = (args.size ?? '960x540').split('x').map(Number);
const at = String(args.at ?? '12').split(',').map(Number);
const outDir = resolve(root, '.qa/shots');
mkdirSync(outDir, { recursive: true });
if (!args['no-build']) { const r = spawnSync('node', ['scripts/build.mjs', ...(args.prod ? ['--prod'] : [])], { cwd: root, stdio: 'inherit' }); if (r.status !== 0) process.exit(1); }

const dist = resolve(root, 'dist');
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const f = resolve(dist, '.' + (p === '/' ? '/index.html' : p));
  if (f.startsWith(dist) && existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); res.end(readFileSync(f)); }
  else { res.writeHead(p === '/favicon.ico' ? 204 : 404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const req = createRequire(import.meta.url);
let pw; for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = req(c); break; } catch { /* next */ } }
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const quality = args.quality ?? 'high';
await page.goto(`http://127.0.0.1:${port}/?quality=${quality}`);
await page.waitForFunction(() => window.__kart?.ready, null, { timeout: 90000 });

if (args.menus) {
  const shot = async (name) => { await page.waitForTimeout(args.wait ? Number(args.wait) : 1500); await page.screenshot({ path: resolve(outDir, `menu-${name}.png`) }); console.log('shot', name); };
  await shot('00-title');
  for (const [i, key] of ['Enter', 'Enter', 'Enter'].entries()) { await page.keyboard.press(key); await shot(`0${i + 1}`); }
} else {
  const allTracks = await page.evaluate(() => window.__kart.trackIds());
  const tracks = (args.track ?? 'sunny-meadows') === 'all' ? allTracks : String(args.track).split(',');
  for (const trackId of tracks) {
    await page.evaluate((o) => window.__kart.startRace({ trackId: o.trackId, laps: 3, racers: 8, seed: 3, skipIntro: !o.intro, player: { driverId: o.driver, bodyId: o.kart, name: 'You' } }), { trackId, driver: args.driver ?? 'pip', kart: args.kart ?? 'classic', intro: !!args.intro });
    await page.evaluate(() => { window.__kart.freeze(true); window.__kart.autoDrive(true); });
    let t = 0;
    for (const s of at) {
      await page.evaluate((dt) => window.__kart.advance(dt), Math.max(0.1, s - t)); t = s;
      await page.evaluate(() => { window.__kart.app.ui?.update?.(0.016, window.__kart.session); window.__kart.render(); });
      await page.waitForTimeout(150);
      const f = `${trackId}-${String(s).padStart(3, '0')}.png`;
      await page.screenshot({ path: resolve(outDir, f) });
      console.log('shot', f);
    }
  }
}
console.log(errors.length ? 'CONSOLE ERRORS:\n' + [...new Set(errors)].slice(0, 15).join('\n') : 'no console errors');
await browser.close(); server.close();
