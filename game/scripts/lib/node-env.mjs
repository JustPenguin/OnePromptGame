// Minimal DOM stubs so the real SplineTrack (which paints canvas textures in its constructor) and other engine modules
// can be imported and run in plain Node - no browser, no WebGL.  Used by scripts/handling.mjs and friends.
// Everything the stubbed 2D context is asked to do is swallowed.

function anyProxy() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get: (_t, p) => (p === 'then' ? undefined : p === Symbol.toPrimitive ? () => 0 : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy;
}

function fakeCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => anyProxy(), addEventListener() {}, removeEventListener() {} };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => fakeCanvas(),
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById: () => null,
    addEventListener() {},
  };
}
export const NODE_ENV_READY = true;
