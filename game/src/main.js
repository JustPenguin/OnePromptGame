// Entry point. Boots the App, installs the window.__kart debug harness.
import { App } from './app/App.js';
import { installDebug } from './core/debug.js';

const boot = document.getElementById('boot');
const msg = document.getElementById('boot-msg');

try {
  const app = new App({ canvas: document.getElementById('game-canvas'), uiRoot: document.getElementById('ui-root') });
  const dbg = installDebug(app);
  app.boot()
    .then(() => { dbg.ready = true; boot?.classList.add('done'); setTimeout(() => boot?.remove(), 700); })
    .catch((e) => { console.error(e); if (msg) msg.textContent = 'Something went wrong while starting: ' + (e?.message ?? e); });
} catch (e) {
  console.error(e);
  if (msg) msg.textContent = 'This game needs WebGL. ' + (e?.message ?? '');
}
