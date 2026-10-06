// Driver faces: canvas-drawn expression atlases wrapped onto a spherical "face patch" mesh. OWNER: Agent C (visuals).
//
// Each driver has an atlas of 8 expression frames (4 x 2 cells).  A kart owns a cloned Texture sharing the atlas image, so
// swapping frames is just `texture.offset` (no re-upload).  Features are drawn in ANGULAR coordinates (azimuth/elevation on
// the head sphere, degrees) so eyes stay round after being wrapped on the head.
import * as THREE from 'three';

export const FACE = Object.freeze({ OPEN: 0, BLINK: 1, HAPPY: 2, WOW: 3, DIZZY: 4, OUCH: 5, DETERMINED: 6, SAD: 7, COUNT: 8 });
export const CELL = 192;
export const COLS = 4;
export const ROWS = 2;
const D2R = Math.PI / 180;

/** Per-driver face styles (see header).  `patch` = angular extent of the decal on the head (degrees). */
export const FACE_STYLES = {
  pip: {
    patch: { az: 62, up: 40, down: 42 },
    mask: { kind: 'heart', color: '#f4f7ff' },
    eye: { az: 21, el: 6, r: 10.5, ry: 1.3, sclera: null, pupil: '#0c1230', glint: true },
    brow: { color: '#1a2a66', el: 20, az: 21, len: 13, w: 3.1 },
    cheek: { color: 'rgba(255,120,150,0.5)', az: 37, el: -8, r: 7.5 },
    skin: '#1d3a9e',
  },
  rusty: {
    patch: { az: 62, up: 40, down: 42 },
    mask: { kind: 'cheeks', color: '#fff1dc' },
    eye: { az: 23, el: 7, r: 10.5, ry: 1.12, sclera: '#fffdf6', iris: '#d8761c', pupil: '#14100c', slit: false, tilt: 10, glint: true },
    brow: { color: '#3a2412', el: 21, az: 23, len: 15, w: 3.3, tilt: 8 },
    cheek: null,
    skin: '#ff7a1a',
  },
  bruno: {
    patch: { az: 62, up: 40, down: 42 },
    mask: { kind: 'muzzle', color: '#e8c9a0', nose: '#2a1810' },
    eye: { az: 24, el: 8, r: 7.2, ry: 1.1, sclera: null, pupil: '#120a06', glint: true },
    brow: { color: '#4d2711', el: 17, az: 24, len: 15, w: 4 },
    cheek: { color: 'rgba(255,140,110,0.38)', az: 40, el: -10, r: 7 },
    mouth: { kind: 'bear' },
    skin: '#8a4b24',
  },
  hopper: {
    patch: { az: 66, up: 34, down: 46 },
    mask: { kind: 'throat', color: '#d8ff9a' },
    eye: null, // geometric bulging eyes (see drivers.js)
    brow: null,
    cheek: { color: 'rgba(255,90,130,0.5)', az: 44, el: -4, r: 8 },
    mouth: { kind: 'frog', color: '#17652b' },
    skin: '#35c759',
  },
  luna: {
    patch: { az: 62, up: 40, down: 42 },
    mask: { kind: 'muzzle', color: '#3d2f66', nose: '#ff7fb8' },
    eye: { az: 23, el: 6, r: 11.5, ry: 1.05, sclera: '#e8fbff', iris: '#22d3ff', pupil: '#05121a', slit: true, tilt: 14, glint: true, glow: true },
    brow: { color: '#7fe9ff', el: 20, az: 23, len: 16, w: 2.2, tilt: 10 },
    cheek: null,
    mouth: { kind: 'cat' },
    skin: '#2b2146',
  },
  gizmo: {
    patch: { az: 60, up: 34, down: 34 },
    mask: { kind: 'visor', color: '#0b1220' },
    eye: { az: 21, el: 4, r: 11, ry: 1, led: '#ffd23f', glow: true },
    brow: null,
    cheek: null,
    mouth: { kind: 'led', color: '#22d3c5' },
    skin: '#c9d4e6',
    emissive: true,
  },
  rocco: {
    patch: { az: 62, up: 40, down: 42 },
    mask: { kind: 'none' },
    eye: { az: 31, el: 8, r: 6.4, ry: 1.0, sclera: null, pupil: '#0d1018', glint: true },
    brow: { color: '#3a4258', el: 15, az: 31, len: 16, w: 4.6, tilt: 10 },
    cheek: { color: 'rgba(255,100,130,0.35)', az: 42, el: -12, r: 7 },
    skin: '#7d8aa6',
  },
  quill: {
    patch: { az: 62, up: 40, down: 42 },
    mask: { kind: 'none' },
    eye: { az: 19, el: 9, r: 11, ry: 1.12, sclera: '#ffffff', pupil: '#0e0e14', pupilR: 0.52, glint: true, outline: '#2a2010' },
    brow: { color: '#d96a10', el: 25, az: 19, len: 14, w: 3.2 },
    cheek: { color: 'rgba(255,130,80,0.5)', az: 38, el: -8, r: 7.5 },
    skin: '#ffd23f',
  },
};

// ------------------------------------------------------------------------------------------------ drawing
function mapper(ctx, st) {
  const { az, up, down } = st.patch;
  const sx = CELL / (az * 2), sy = CELL / (up + down);
  return {
    x: (a) => (a + az) * sx,
    y: (e) => (up - e) * sy,
    rx: (deg) => deg * sx,
    ry: (deg) => deg * sy,
    sx, sy,
  };
}

function ellipse(g, cx, cy, rx, ry, rot = 0) { g.beginPath(); g.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); }

function drawMask(g, M, st) {
  const m = st.mask;
  if (!m || m.kind === 'none') return;
  g.fillStyle = m.color;
  if (m.kind === 'heart') {
    // white face mask: two lobes around the eyes joined to a point toward the beak, fully inside the patch
    for (const sd of [-1, 1]) { ellipse(g, M.x(sd * 21), M.y(5), M.rx(31), M.ry(27), sd * 0.18); g.fill(); }
    g.beginPath();
    g.moveTo(M.x(-47), M.y(0));
    g.bezierCurveTo(M.x(-46), M.y(-22), M.x(-14), M.y(-36), M.x(0), M.y(-37));
    g.bezierCurveTo(M.x(14), M.y(-36), M.x(46), M.y(-22), M.x(47), M.y(0));
    g.bezierCurveTo(M.x(30), M.y(10), M.x(10), M.y(2), M.x(0), M.y(-2));
    g.bezierCurveTo(M.x(-10), M.y(2), M.x(-30), M.y(10), M.x(-47), M.y(0));
    g.closePath(); g.fill();
  } else if (m.kind === 'cheeks') {
    for (const s of [-1, 1]) { ellipse(g, M.x(s * 36), M.y(-14), M.rx(24), M.ry(15), s * 0.25); g.fill(); }
    ellipse(g, M.x(0), M.y(-26), M.rx(20), M.ry(11)); g.fill();
  } else if (m.kind === 'muzzle') {
    ellipse(g, M.x(0), M.y(-14), M.rx(26), M.ry(18)); g.fill();
    g.fillStyle = m.nose;
    ellipse(g, M.x(0), M.y(-6), M.rx(7.5), M.ry(5.5)); g.fill();
  } else if (m.kind === 'throat') {
    ellipse(g, M.x(0), M.y(-30), M.rx(44), M.ry(14)); g.fill();
  } else if (m.kind === 'visor') {
    g.beginPath();
    const w = 54, t = 28, b = -28, r = 14;
    g.moveTo(M.x(-w + r), M.y(t)); g.lineTo(M.x(w - r), M.y(t)); g.quadraticCurveTo(M.x(w), M.y(t), M.x(w), M.y(t - r));
    g.lineTo(M.x(w), M.y(b + r)); g.quadraticCurveTo(M.x(w), M.y(b), M.x(w - r), M.y(b));
    g.lineTo(M.x(-w + r), M.y(b)); g.quadraticCurveTo(M.x(-w), M.y(b), M.x(-w), M.y(b + r));
    g.lineTo(M.x(-w), M.y(t - r)); g.quadraticCurveTo(M.x(-w), M.y(t), M.x(-w + r), M.y(t));
    g.closePath(); g.fill();
    // glass sheen
    const gr = g.createLinearGradient(0, M.y(t), 0, M.y(b));
    gr.addColorStop(0, 'rgba(120,200,255,0.20)'); gr.addColorStop(0.45, 'rgba(120,200,255,0.02)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fill();
  }
}

function glint(g, x, y, r) {
  g.fillStyle = '#fff';
  ellipse(g, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.3); g.fill();
  ellipse(g, x + r * 0.28, y + r * 0.35, r * 0.14, r * 0.14); g.fill();
}

function stroke(g, w, color) { g.lineWidth = w; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; }

/** One eye (side = -1 viewer-left, +1 viewer-right). `f` = expression frame. */
function drawEye(g, M, st, side, f) {
  const e = st.eye;
  if (!e) return;
  const cx = M.x(side * e.az), cy = M.y(e.el);
  const rx = M.rx(e.r), ry = M.ry(e.r) * (e.ry ?? 1);
  if (e.led) { drawLedEye(g, M, st, side, f, cx, cy, rx, ry); return; }
  const ink = e.outline ?? '#14100c';
  const lw = Math.max(3.4, rx * 0.26);
  if (f === FACE.BLINK) {
    stroke(g, lw, ink);
    g.beginPath(); g.moveTo(cx - rx * 0.9, cy - ry * 0.05); g.quadraticCurveTo(cx, cy + ry * 0.62, cx + rx * 0.9, cy - ry * 0.05); g.stroke();
    return;
  }
  if (f === FACE.HAPPY) {
    stroke(g, lw * 1.15, ink);
    g.beginPath(); g.moveTo(cx - rx * 0.85, cy + ry * 0.4); g.quadraticCurveTo(cx, cy - ry * 0.85, cx + rx * 0.85, cy + ry * 0.4); g.stroke();
    return;
  }
  if (f === FACE.OUCH) {
    stroke(g, lw * 1.2, ink);
    const o = side; // chevrons point toward the face centre: > on the left eye, < on the right
    g.beginPath(); g.moveTo(cx - o * rx * 0.85, cy - ry * 0.8); g.lineTo(cx + o * rx * 0.55, cy); g.lineTo(cx - o * rx * 0.85, cy + ry * 0.8); g.stroke();
    return;
  }
  const big = f === FACE.WOW ? 1.2 : 1;
  const ex = rx * big, ey = ry * big;
  const tilt = (e.tilt ?? 0) * D2R * side;
  g.save();
  g.translate(cx, cy); g.rotate(-tilt);
  // ---- eye base
  if (e.sclera) {
    g.fillStyle = e.sclera; ellipse(g, 0, 0, ex, ey); g.fill();
    if (e.glow) { g.shadowColor = e.iris; g.shadowBlur = 10; }
    g.fillStyle = e.iris ?? e.pupil;
    const ir = f === FACE.WOW ? 0.66 : 0.76;
    ellipse(g, 0, ey * 0.04, ex * ir, ey * (ir + 0.1)); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = e.pupil;
    const pr = f === FACE.WOW ? 0.26 : 0.42;
    if (e.slit) ellipse(g, 0, ey * 0.04, ex * (f === FACE.WOW ? 0.36 : 0.16), ey * 0.8);
    else ellipse(g, 0, ey * 0.05, ex * pr, ey * (pr + 0.12));
    g.fill();
    stroke(g, 2.4, ink); ellipse(g, 0, 0, ex, ey); g.stroke();
  } else {
    g.fillStyle = e.pupil; ellipse(g, 0, 0, ex, ey); g.fill();
  }
  if (f !== FACE.DIZZY) glint(g, ex * 0.24, -ey * 0.2, Math.min(ex, ey) * 0.72);
  // ---- dizzy spiral (contrasting colour)
  if (f === FACE.DIZZY) {
    stroke(g, Math.max(2.4, ex * 0.15), e.sclera ? '#2a1a50' : '#ffffff');
    g.beginPath();
    for (let i = 0; i <= 56; i++) {
      const a = i * 0.36 * side, r = (i / 56) * 0.92;
      const x = Math.cos(a) * r * ex, y = Math.sin(a) * r * ey;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  // ---- eyelid (squinting frames): skin-coloured cap clipped to the eye, with an ink edge
  if (f === FACE.DETERMINED || f === FACE.SAD) {
    const lid = st.lid ?? (st.mask && st.mask.kind === 'heart' ? st.mask.color : st.skin);
    const outer = side, inner = -side;
    const [fo, fi] = f === FACE.DETERMINED ? [0.12, 0.52] : [0.55, 0.1]; // fraction of the eye height covered at the outer / inner corner
    const yo = -ey + 2 * ey * fo, yi = -ey + 2 * ey * fi;
    g.save();
    ellipse(g, 0, 0, ex * 1.02, ey * 1.02); g.clip();
    g.fillStyle = lid;
    g.beginPath(); g.moveTo(outer * ex * 1.6, -ey * 1.8); g.lineTo(outer * ex * 1.6, yo); g.lineTo(inner * ex * 1.6, yi); g.lineTo(inner * ex * 1.6, -ey * 1.8); g.closePath(); g.fill();
    g.restore();
    stroke(g, 2.8, ink);
    g.beginPath(); g.moveTo(outer * ex * 1.05, yo + (yi - yo) * 0.03); g.lineTo(inner * ex * 1.05, yi - (yi - yo) * 0.03); g.stroke();
  }
  g.restore();
}

function drawLedEye(g, M, st, side, f, cx, cy, rx, ry) {
  const e = st.eye;
  g.save();
  g.shadowColor = e.led; g.shadowBlur = 14;
  g.fillStyle = e.led; stroke(g, Math.max(5, rx * 0.34), e.led);
  const rrect = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, r); g.fill(); };
  switch (f) {
    case FACE.BLINK: rrect(cx, cy, rx * 1.5, ry * 0.2, ry * 0.1); break;
    case FACE.HAPPY: g.beginPath(); g.moveTo(cx - rx * 0.8, cy + ry * 0.4); g.quadraticCurveTo(cx, cy - ry * 0.8, cx + rx * 0.8, cy + ry * 0.4); g.stroke(); break;
    case FACE.WOW: g.beginPath(); g.ellipse(cx, cy, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#0b1220'; g.beginPath(); g.ellipse(cx, cy, rx * 0.4, ry * 0.4, 0, 0, Math.PI * 2); g.fill(); break;
    case FACE.OUCH: g.beginPath(); g.moveTo(cx - side * rx * 0.8, cy - ry * 0.8); g.lineTo(cx + side * rx * 0.5, cy); g.lineTo(cx - side * rx * 0.8, cy + ry * 0.8); g.stroke(); break;
    case FACE.DIZZY: g.beginPath(); g.moveTo(cx - rx * 0.8, cy - ry * 0.8); g.lineTo(cx + rx * 0.8, cy + ry * 0.8); g.moveTo(cx + rx * 0.8, cy - ry * 0.8); g.lineTo(cx - rx * 0.8, cy + ry * 0.8); g.stroke(); break;
    case FACE.DETERMINED: g.save(); g.translate(cx, cy); g.rotate(-side * 0.28); rrect(0, 0, rx * 1.7, ry * 0.7, ry * 0.2); g.restore(); break;
    case FACE.SAD: g.save(); g.translate(cx, cy + ry * 0.15); g.rotate(side * 0.3); rrect(0, 0, rx * 1.5, ry * 0.7, ry * 0.2); g.restore(); break;
    default: rrect(cx, cy, rx * 1.35, ry * 1.5, rx * 0.5);
  }
  g.restore();
}

function drawBrow(g, M, st, side, f) {
  const b = st.brow;
  if (!b) return;
  let lift = 0, tilt = (b.tilt ?? 0) * D2R;
  if (f === FACE.WOW) lift = 7;
  else if (f === FACE.DETERMINED) { lift = -4; tilt = 0.5; }
  else if (f === FACE.SAD) { lift = 1; tilt = -0.42; }
  else if (f === FACE.OUCH) { lift = -2; tilt = 0.35; }
  else if (f === FACE.HAPPY) lift = 4;
  else if (f === FACE.BLINK) lift = -1;
  const cx = M.x(side * b.az), cy = M.y(b.el + lift);
  const hl = M.rx(b.len) / 2;
  const a = -side * tilt; // inner end lower for positive tilt
  stroke(g, b.w * M.sx, b.color);
  g.beginPath();
  g.moveTo(cx - Math.cos(a) * hl, cy - Math.sin(a) * hl * 0.6);
  g.quadraticCurveTo(cx, cy - hl * 0.28, cx + Math.cos(a) * hl, cy + Math.sin(a) * hl * 0.6);
  g.stroke();
}

function drawMouth(g, M, st, f) {
  const m = st.mouth;
  if (!m) return;
  if (m.kind === 'frog') {
    const y0 = M.y(-17);
    const smile = f === FACE.HAPPY ? 11 : f === FACE.SAD ? -7 : f === FACE.DETERMINED ? 3 : f === FACE.OUCH ? -3 : 7;
    stroke(g, 5, m.color);
    g.beginPath();
    g.moveTo(M.x(-44), y0 - M.ry(smile * 0.2));
    g.quadraticCurveTo(M.x(0), y0 + M.ry(smile), M.x(44), y0 - M.ry(smile * 0.2));
    g.stroke();
    if (f === FACE.HAPPY || f === FACE.WOW) {
      g.fillStyle = '#7a1230';
      g.beginPath();
      g.moveTo(M.x(-34), y0 + M.ry(smile * 0.2));
      g.quadraticCurveTo(M.x(0), y0 + M.ry(smile + (f === FACE.WOW ? 26 : 16)), M.x(34), y0 + M.ry(smile * 0.2));
      g.quadraticCurveTo(M.x(0), y0 + M.ry(smile + 1), M.x(-34), y0 + M.ry(smile * 0.2));
      g.fill();
      g.fillStyle = '#ff6a8a'; ellipse(g, M.x(0), y0 + M.ry(smile + 11), M.rx(13), M.ry(5)); g.fill();
    }
    // nostrils
    g.fillStyle = '#17652b';
    for (const s of [-1, 1]) { ellipse(g, M.x(s * 8), M.y(0), M.rx(2.2), M.ry(1.8)); g.fill(); }
    return;
  }
  if (m.kind === 'cat') {
    g.fillStyle = '#ff7fb8';
    g.beginPath(); g.moveTo(M.x(-4.5), M.y(-5)); g.lineTo(M.x(4.5), M.y(-5)); g.lineTo(M.x(0), M.y(-9.5)); g.closePath(); g.fill();
    stroke(g, 3, '#f6d6ff');
    g.beginPath(); g.moveTo(M.x(0), M.y(-9.5)); g.lineTo(M.x(0), M.y(-12.5)); g.stroke();
    if (f === FACE.HAPPY || f === FACE.WOW) {
      g.fillStyle = '#4a1230'; ellipse(g, M.x(0), M.y(-16), M.rx(f === FACE.WOW ? 5 : 7), M.ry(f === FACE.WOW ? 6 : 4.5)); g.fill();
      g.fillStyle = '#ff7fb8'; ellipse(g, M.x(0), M.y(-17.5), M.rx(3.5), M.ry(2)); g.fill();
    } else {
      const dn = f === FACE.SAD || f === FACE.OUCH ? 1 : -1;
      g.beginPath();
      g.moveTo(M.x(-9), M.y(-14 - dn * 2)); g.quadraticCurveTo(M.x(-4.5), M.y(-14 + dn * 3), M.x(0), M.y(-12.5));
      g.quadraticCurveTo(M.x(4.5), M.y(-14 + dn * 3), M.x(9), M.y(-14 - dn * 2));
      g.stroke();
    }
    return;
  }
  if (m.kind === 'bear') {
    stroke(g, 3.4, '#2a1810');
    g.beginPath(); g.moveTo(M.x(0), M.y(-9)); g.lineTo(M.x(0), M.y(-13)); g.stroke();
    if (f === FACE.HAPPY || f === FACE.WOW) {
      g.fillStyle = '#5a1620'; ellipse(g, M.x(0), M.y(-18), M.rx(f === FACE.WOW ? 7 : 10), M.ry(f === FACE.WOW ? 8 : 6)); g.fill();
      g.fillStyle = '#ff7a8a'; ellipse(g, M.x(0), M.y(-20), M.rx(5), M.ry(2.6)); g.fill();
    } else {
      const dn = f === FACE.SAD || f === FACE.OUCH ? 1 : -1;
      g.beginPath();
      g.moveTo(M.x(-11), M.y(-16 - dn * 2.5)); g.quadraticCurveTo(M.x(-5), M.y(-16 + dn * 3.5), M.x(0), M.y(-13));
      g.quadraticCurveTo(M.x(5), M.y(-16 + dn * 3.5), M.x(11), M.y(-16 - dn * 2.5));
      g.stroke();
    }
    return;
  }
  if (m.kind === 'led') {
    g.save();
    g.shadowColor = m.color; g.shadowBlur = 10; g.fillStyle = m.color;
    const y = M.y(-18);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) / ((n - 1) / 2);
      let yy = y;
      if (f === FACE.HAPPY) yy = y + M.ry(6 * (t * t - 0.35));
      else if (f === FACE.SAD || f === FACE.OUCH) yy = y - M.ry(6 * (t * t - 0.35));
      else if (f === FACE.DIZZY) yy = y + M.ry(Math.sin(i * 1.6) * 3);
      const h = f === FACE.WOW ? M.ry(6 - Math.abs(t) * 3) : M.ry(2.4);
      g.beginPath(); g.roundRect(M.x(t * 15) - M.rx(1.9), yy - h / 2, M.rx(3.4), Math.max(3, h), 3); g.fill();
    }
    g.restore();
  }
}

function drawCheeks(g, M, st, f) {
  const c = st.cheek;
  if (!c) return;
  const boost = f === FACE.HAPPY ? 1.25 : f === FACE.OUCH ? 0.7 : 1;
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(M.x(s * c.az), M.y(c.el), 0, M.x(s * c.az), M.y(c.el), M.rx(c.r) * boost);
    gr.addColorStop(0, c.color); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; ellipse(g, M.x(s * c.az), M.y(c.el), M.rx(c.r) * boost, M.ry(c.r) * boost); g.fill();
  }
}

function drawFrame(g, st, f) {
  const M = mapper(g, st);
  drawMask(g, M, st);
  drawCheeks(g, M, st, f);
  drawMouth(g, M, st, f);
  for (const s of [-1, 1]) { drawBrow(g, M, st, s, f); drawEye(g, M, st, s, f); }
  // little sweat drops / stars for flavour on OUCH
  if (f === FACE.OUCH && !st.emissive) {
    g.fillStyle = '#9fe3ff'; ellipse(g, M.x(st.patch.az * 0.78), M.y(st.patch.up * 0.5), M.rx(2.6), M.ry(4)); g.fill();
  }
}

/** Build the 4x2 atlas canvas for a driver. */
export function createFaceAtlas(driverId) {
  const st = FACE_STYLES[driverId] ?? FACE_STYLES.pip;
  const c = document.createElement('canvas');
  c.width = CELL * COLS; c.height = CELL * ROWS;
  const g = c.getContext('2d');
  for (let f = 0; f < FACE.COUNT; f++) {
    const col = f % COLS, row = Math.floor(f / COLS);
    g.save();
    g.beginPath(); g.rect(col * CELL, row * CELL, CELL, CELL); g.clip();
    g.translate(col * CELL, row * CELL);
    drawFrame(g, st, f);
    g.restore();
  }
  return c;
}

const atlasCache = new Map();
/** Shared base texture (do not mutate offsets on it - clone via cloneFaceTexture). */
export function getFaceTexture(driverId) {
  let t = atlasCache.get(driverId);
  if (!t) {
    t = new THREE.CanvasTexture(createFaceAtlas(driverId));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.repeat.set(1 / COLS, 1 / ROWS);
    atlasCache.set(driverId, t);
  }
  return t;
}
/** Per-kart clone (shares the GPU image); use setFaceFrame to pick the expression. */
export function cloneFaceTexture(driverId) {
  const t = getFaceTexture(driverId).clone();
  t.needsUpdate = true;
  t.repeat.set(1 / COLS, 1 / ROWS);
  return t;
}
export function setFaceFrame(tex, frame) {
  const col = frame % COLS, row = Math.floor(frame / COLS);
  tex.offset.set(col / COLS, 1 - (row + 1) / ROWS);
}

/** Spherical face-patch geometry (unit-radius; scale it by the head radii). UV spans 0..1 over the patch. */
export function faceGeometry(driverId) {
  const st = FACE_STYLES[driverId] ?? FACE_STYLES.pip;
  const { az, up, down } = st.patch;
  // SphereGeometry: phi=PI/2 faces +Z; theta from the top pole.
  const phiLen = az * 2 * D2R, thetaLen = (up + down) * D2R;
  return new THREE.SphereGeometry(1, 36, 28, Math.PI / 2 - az * D2R, phiLen, Math.PI / 2 - up * D2R, thetaLen);
}

export function disposeFaceCaches() {
  for (const t of atlasCache.values()) t.dispose();
  atlasCache.clear();
}
