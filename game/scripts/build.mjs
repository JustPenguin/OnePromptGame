// Single-file build: bundles src/main.js with esbuild, inlines JS + CSS + fonts.
//
//   node scripts/build.mjs            dev build   (unminified, readable stack traces)
//   node scripts/build.mjs --prod     release     (minified)
//   node scripts/build.mjs --watch    rebuild on change
//
// Outputs (all in dist/, which is git-ignored):
//   index.html     full document, open it over http (npm run serve)
//   artifact.html  HTML *fragment* (title + style + body + script) for the Claude Artifact tool,
//                  which wraps it in its own <html>/<head>/<body> skeleton
//   game.js        the raw bundle
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const argv = new Set(process.argv.slice(2));
const prod = argv.has('--prod');
const watch = argv.has('--watch');
const TITLE = 'Kart Rush GP';

const FONTS = [
  { family: 'KR Display', pkg: 'lilita-one', file: 'lilita-one-latin-400-normal.woff2', weight: 400 },
  { family: 'KR UI', pkg: 'nunito', file: 'nunito-latin-700-normal.woff2', weight: 700 },
  { family: 'KR UI', pkg: 'nunito', file: 'nunito-latin-900-normal.woff2', weight: 900 },
];

function fontCss() {
  return FONTS.map((f) => {
    const b64 = readFileSync(resolve(root, 'node_modules/@fontsource', f.pkg, 'files', f.file)).toString('base64');
    return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
}

function assemble(js) {
  const css = fontCss() + '\n' + readFileSync(resolve(root, 'src/shell/shell.css'), 'utf8');
  const body = readFileSync(resolve(root, 'src/shell/body.html'), 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const fragment = `<title>${TITLE}</title>\n<style>\n${css}\n</style>\n${body}\n<script>\n${safeJs}\n</script>\n`;
  const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">\n<meta name="theme-color" content="#0a0f24">\n<link rel="icon" href="data:,">\n${fragment.replace(/<script>[\s\S]*$/, '')}</head>\n<body>\n${body}\n<script>\n${safeJs}\n</script>\n</body>\n</html>\n`;
  return { fragment, full };
}

const buildOptions = {
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  minify: prod,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': prod ? '"production"' : '"development"', __PROD__: prod ? 'true' : 'false' },
};

function emit(result) {
  const js = result.outputFiles[0].text;
  const { fragment, full } = assemble(js);
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, 'game.js'), js);
  writeFileSync(resolve(dist, 'index.html'), full);
  writeFileSync(resolve(dist, 'artifact.html'), fragment);
  const kb = (p) => (statSync(resolve(dist, p)).size / 1024).toFixed(0) + ' KB';
  console.log(`[build] ${prod ? 'prod' : 'dev'}  game.js ${kb('game.js')}  index.html ${kb('index.html')}  artifact.html ${kb('artifact.html')}`);
}

if (watch) {
  const ctx = await context({
    ...buildOptions,
    plugins: [{ name: 'emit', setup(b) { b.onEnd((r) => { if (r.errors.length === 0) emit(r); }); } }],
  });
  await ctx.watch();
  console.log('[build] watching src/ ...');
} else {
  try {
    emit(await build(buildOptions));
  } catch (e) {
    console.error('[build] FAILED');
    process.exit(1);
  }
}
