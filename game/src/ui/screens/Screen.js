// Base class for every full-screen menu. OWNER: Agent E.  See docs/ui.md ("how to add a screen").
//
//   class MyScreen extends Screen {
//     build()   -> root element (the UI adds class "screen s-<id>")
//     get stage() -> { preset, kart, comp, theme }   what the 3D backdrop should do while this screen is up
//     hints()   -> [{k:'move'}, {k:'confirm', label:'Select'}, {k:'back'}]
//     navOptions() -> { onBack, onTab, onAction, wrap }
//     onShow() / onHide() / update(dt) / onResize() / destroy()
//   }
// Screens are re-created on every visit (state lives in app.flow / app.save), so "Back" always reflects fresh data.
import { h } from '../dom.js';

export class Screen {
  /** @param {import('../UI.js').UI} ui */
  constructor(ui, params = {}) {
    this.ui = ui;
    this.app = ui.app;
    this.params = params;
    this.root = null;
    this._scope = null;
  }

  build() { return h('div', { class: 'screen' }); }

  /** What the 3D menu stage should look like behind this screen. comp: {x,y} or (layout) => {x,y}. */
  get stage() { return { preset: 'select', kart: true, comp: { x: 0, y: 0 }, theme: null }; }

  hints() { return [{ k: 'move' }, { k: 'confirm', label: 'Select' }, { k: 'back', label: 'Back' }]; }

  navOptions() { return { onBack: () => this.onBack() }; }

  onBack() { this.ui.back(); }
  onShow() {}
  onHide() {}
  update(dt) {}
  onResize() {}
  destroy() {}

  get layout() { return this.ui.layout; }
  get save() { return this.app.save; }
  get flow() { return this.app.flow; }
}
