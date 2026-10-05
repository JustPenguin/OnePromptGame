// CSS post-processing for menu styles. OWNER: Agent E.
//
// `gateHover(css)` rewrites every selector that uses :hover so it only applies while the active input device is the mouse
// (`#ui-root[data-device="mouse"]`).  Why: `.is-focus` (set by Nav) is THE selection indicator for keyboard / gamepad / mouse / touch.
// A raw :hover would highlight a second, different item whenever the cursor rests over a screen while the player navigates by
// keyboard or pad, and it sticks after a tap on touch screens.  With the gate, hover and focus coincide for mouse users and
// never conflict for everyone else.
const LAYOUT = /^(\.l-(?:wide|portrait|compact))(\s+)(.*)$/;

function gateSel(sel) {
  const s = sel.trim();
  if (!s.includes(':hover')) return s;
  const m = LAYOUT.exec(s);
  return m ? `#ui-root${m[1]}[data-device="mouse"] ${m[3]}` : `#ui-root[data-device="mouse"] ${s}`;
}

export function gateHover(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const head = css.slice(i, open);
    // @keyframes / @media blocks: copy through, recursing into @media only
    if (head.trimStart().startsWith('@')) {
      let depth = 1, j = open + 1;
      while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      const body = css.slice(open + 1, j - 1);
      out += /^@media/.test(head.trim()) ? `${head}{${gateHover(body)}}` : `${head}{${body}}`;
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    const body = css.slice(open + 1, close);
    const lead = head.match(/^\s*/)[0];
    out += `${lead}${head.trim().split(',').map(gateSel).join(',')}{${body}}`;
    i = close + 1;
  }
  return out;
}
