// Tiny registry so vehicles / portraits / vfx can reach the renderer-owned resources without importing GameRenderer
// (avoids import cycles).  OWNER: Agent C (render).  GameRenderer fills it in its constructor.
let renderer = null;      // GameRenderer instance
let studioEnv = null;     // neutral PMREM environment (menus, portraits, lab)

export function setSharedRenderer(r) { renderer = r; }
export function getSharedRenderer() { return renderer; }
export function setSharedEnvironment(t) { studioEnv = t; }
export function getSharedEnvironment() { return studioEnv; }
