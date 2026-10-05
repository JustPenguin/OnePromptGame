# Testing & verifying your work (read this before your first test)

You verify with a **real browser** (headless Chromium + SwiftShader software WebGL) driven by **`playwright-cli`**, and with
the `window.__kart` harness. The software renderer is SLOW (≈3–20 fps for a full scene) so we never rely on real time:
we **freeze** the loop, **advance** the simulation in code, **render** single frames, and look at screenshots.

## Setup (once per worktree)
```bash
cd game               # the game lives in <repo>/game
npm install --no-audit --no-fund      # ~4 s
npm run build                         # -> dist/index.html (single file), < 1 s
node scripts/serve.mjs --port=<YOUR PORT> &     # static server for dist/ (playwright-cli blocks file:// URLs)
```
Ports (so five agents don't collide): **A=8101, B=8102, C=8103, D=8104, E=8105**.
Rebuild (`npm run build`) after every code change, then `reload` the page. (`npm run watch` also works.)

## playwright-cli
`playwright-cli` is installed globally. ALWAYS use a **named session** unique to you (`-s=<your-letter>`), the project's config, and
never touch other sessions: **never run `close-all`, `kill-all`, or `delete-data` without `-s=`**.
```bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers      # already set in most shells
S="playwright-cli -s=a"                                # <- your letter
$S open "http://127.0.0.1:8101/?quality=low" --config=tools/playwright-cli.config.json     # config = host Chromium + SwiftShader flags
$S --raw eval "JSON.stringify(window.__kart.state())"                                     # evaluate JS in the page
$S --raw run-code --filename=.qa/my-test.js                                               # run a Playwright script (see below)
$S screenshot --filename=.qa/a-shot-01.png                                                # then VIEW it with the Read tool
$S console                                                                                # console errors / warnings
$S resize 1280 720                                                                        # default viewport is 960x540
$S reload ; $S close                                                                      # close when you're idle (saves CPU for the others!)
```
`run-code` executes in the Playwright (Node) context with `page` in scope — wrap page code in `page.evaluate`:
```js
// .qa/my-test.js
async page => {
  return await page.evaluate(async () => {
    const K = window.__kart;
    await K.startRace({ trackId: 'sunny-meadows', laps: 1, racers: 6, skipIntro: true });
    K.freeze(true);               // stop the real-time loop
    K.setInput({ throttle: 1 });  // drive the player
    K.advance(5);                 // simulate 5 s (no rendering, fast)
    K.render();                   // draw one frame so a screenshot shows it
    return JSON.stringify(K.state().player);
  });
}
```
Screenshots: take them AFTER `K.render()` (frozen pages don't repaint by themselves). Save into **`.qa/`** (git-ignored) and open them with the **Read tool**
(it displays PNGs) — actually LOOK at what you built, critique it, iterate. For UI work, click through screens with
`$S snapshot` / `$S click <ref>` / `$S press Enter`, or call your own functions via `eval`.
For animation/FX, take 2–3 screenshots at different `advance()` offsets.

## Headless regression check (all agents run this before finishing)
```bash
node scripts/check.mjs                              # sunny-meadows, 1 lap, 8 AI-driven racers (builds first)
node scripts/check.mjs --track=all --laps=2         # every registered track
node scripts/check.mjs --track=<id> --shot=.qa/x.png --size=960x540    # + a mid-race render
node scripts/check.mjs --no-build --racers=12 --speed=master --seed=7 --verbose
```
Fails (exit 1) on console/page errors, NaN state, stuck karts, karts that never finish, excess respawns. It prints finish times, lap time, and event counters.

## Tips for the software renderer
- Use `?quality=low` (or `&scale=0.5`) and the default 960×540 viewport for logic checks; use `medium/high` + a screenshot only when judging visuals/post-fx.
- One browser session at a time, and `close` it when idle — the machine has 4 cores shared by five agents.
- Don't judge performance by headless fps. Judge it by: draw calls / triangle counts (`renderer.renderer.info.render`), allocations in hot loops, and sim step cost
  (`performance.now()` around `__kart.advance(60)`; the baseline does ~25 sim-seconds per wall-second with 8 karts).
- `playwright-cli --raw eval "..."` returns JSON strings; wrap objects in `JSON.stringify`.
- Inspect localStorage: `$S localstorage-list`.
- Web research is NOT needed and the self-hosted Firecrawl stack is NOT running in this sandbox — don't try to start it and don't use WebFetch/WebSearch. Use your own knowledge.

## Audio verification (agent D)
You can't hear headless audio. Verify with `OfflineAudioContext` renders in the page: render N seconds of a music loop / SFX, then check peak < 1.0, RMS above silence,
no NaN, loop length as designed, no clipping. Count events (`__kart.counts`) to prove SFX triggers fire. Keep voice counts bounded.

## What "verified" means
A claim in your final report is only valid if you actually ran it. Say exactly what you ran and saw ("check.mjs --track=all --laps=2 passed;
screenshot .qa/b-neon-1.png shows …"), and list anything you could not verify.
