// Item catalogue + icons. OWNER: Agent D (items).
// UI (Agent E) reads ITEM_DEFS and getItemIcon() for the HUD item slot / roulette / help screen; keep these exports stable.
//   ITEM_DEFS[id] = { id, name, desc, color, color2, count (default uses per pickup), kind, tip, triple }
//        kind: 'boost' | 'trap' | 'projectile' | 'defense' | 'attack'
//        triple: true when the item can also be found as a x3 pack (HUD shows a x3 badge from kart.item.count)
//   ITEM_ORDER    = ids in roulette display order
//   getItemIcon(id, size) -> HTMLCanvasElement (cached per id+size, procedurally drawn; id 'box' = the "?" badge)
//   getItemIconURL(id, size) -> data URL of the same icon (safe to use in several <img> elements at once)
// Everything is drawn with the 2D canvas: no image assets.
import { hexToRgb } from '../core/math.js';

export const ITEM_DEFS = {
  boost:  { id: 'boost',  name: 'Nitro Boost',   desc: 'A big burst of speed. Also found as a pack of three.',            color: '#22d3ff', color2: '#bff4ff', count: 1, kind: 'boost',      triple: true,  tip: 'Save one for the long straight.' },
  peel:   { id: 'peel',   name: 'Slick Peel',    desc: 'Drop it behind you or lob it ahead. Whoever hits it spins out.',  color: '#b7f23a', color2: '#f2ff9a', count: 1, kind: 'trap',       triple: true,  tip: 'Hold brake to drop behind. A trailing peel blocks rockets.' },
  orb:    { id: 'orb',    name: 'Ricochet Orb',  desc: 'Rolls down the road and bounces off the walls. Spins what it hits.', color: '#3dffa0', color2: '#c9ffe4', count: 1, kind: 'projectile', triple: true,  tip: 'Three orbs orbit you as a shield until you fire them.' },
  seeker: { id: 'seeker', name: 'Seeker Rocket', desc: 'Locks on to the racer in front and chases them down the road.',   color: '#ff4d3d', color2: '#ffb3a8', count: 1, kind: 'projectile', triple: false, tip: 'Hold brake to fire at the kart behind you.' },
  bomb:   { id: 'bomb',   name: 'Time Bomb',     desc: 'Lob it or drop it. Goes off on a timer or when someone gets close.', color: '#ff8a1f', color2: '#ffd9a8', count: 1, kind: 'trap',       triple: false, tip: 'The blast radius is big: do not stick around.' },
  comet:  { id: 'comet',  name: 'Comet',         desc: 'Arcs over the pack and crashes down on the race leader.',         color: '#5aa8ff', color2: '#d6ebff', count: 1, kind: 'attack',     triple: false, tip: 'Only the unlucky back of the pack gets one. A shield saves the leader.' },
  shock:  { id: 'shock',  name: 'Storm Zap',     desc: 'Zaps everyone else: they shrink and slow down for a few seconds.', color: '#ffe23a', color2: '#fff6b0', count: 1, kind: 'attack',     triple: false, tip: 'Best used when the pack is bunched up behind you.' },
  shield: { id: 'shield', name: 'Prism Shield',  desc: 'Seven seconds of invincibility and extra speed. Ram rivals to spin them.', color: '#b06bff', color2: '#e8d2ff', count: 1, kind: 'defense',    triple: false, tip: 'Blocks every hit. Karts you bump will spin out.' },
  rocket: { id: 'rocket', name: 'Rocket Rider',  desc: 'Strap on a rocket: autopilot at full blast, and nothing can touch you.', color: '#ff3d6a', color2: '#ffb0c2', count: 1, kind: 'boost',      triple: false, tip: 'Sit back and enjoy the ride.' },
  ink:    { id: 'ink',    name: 'Ink Splat',     desc: 'Splatters the screens of every racer ahead of you.',              color: '#8b4dff', color2: '#d9c4ff', count: 1, kind: 'attack',     triple: false, tip: 'Rivals ahead lose their view and drive worse for five seconds.' },
};
export const ITEM_ORDER = ['boost', 'peel', 'orb', 'seeker', 'bomb', 'shield', 'shock', 'ink', 'rocket', 'comet'];

// ---------------------------------------------------------------------------------------------------------------
// icon rendering
const TAU = Math.PI * 2;
const OUT = '#0a0f2a';
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);

/** Circular glossy badge: coloured rim, dark tinted inner disc, specular highlight. Draws in pixel space. */
function badge(g, S, color) {
  const c = S / 2, R = S * 0.475;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = S * 0.06; g.shadowOffsetY = S * 0.035;
  g.beginPath(); g.arc(c, c, R, 0, TAU); g.fillStyle = OUT; g.fill();
  g.restore();
  let gr = g.createLinearGradient(0, c - R, 0, c + R);
  gr.addColorStop(0, lighten(color, 0.45)); gr.addColorStop(0.5, color); gr.addColorStop(1, darken(color, 0.5));
  g.beginPath(); g.arc(c, c, R * 0.97, 0, TAU); g.fillStyle = gr; g.fill();
  const r2 = R * 0.8;
  gr = g.createRadialGradient(c, c - r2 * 0.4, r2 * 0.05, c, c, r2);
  gr.addColorStop(0, mix(color, '#26327a', 0.7)); gr.addColorStop(0.65, mix(color, '#0f1740', 0.84)); gr.addColorStop(1, '#080c26');
  g.beginPath(); g.arc(c, c, r2, 0, TAU); g.fillStyle = gr; g.fill();
  g.lineWidth = Math.max(1, S * 0.014); g.strokeStyle = 'rgba(255,255,255,.3)'; g.stroke();
  g.lineWidth = Math.max(1, S * 0.02); g.strokeStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.arc(c, c, R * 0.97, 0, TAU); g.stroke();
}
function gloss(g, S) {
  const c = S / 2, R = S * 0.475;
  g.save();
  g.beginPath(); g.arc(c, c, R * 0.93, 0, TAU); g.clip();
  const gr = g.createLinearGradient(0, c - R, 0, c);
  gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(c, c - R * 0.52, R * 0.74, R * 0.42, 0, 0, TAU); g.fill();
  g.restore();
}

// path helpers (unit box [-50,50])
function strokeFill(g, fill, lw = 5, stroke = OUT) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = lw; g.strokeStyle = stroke; g.stroke();
  g.fillStyle = fill; g.fill();
}
const lin = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
const rad = (g, x, y, r0, r1, stops, x1 = x, y1 = y) => { const gr = g.createRadialGradient(x, y, r0, x1, y1, r1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
function star(g, x, y, r, rot = 0, pts = 4, inner = 0.28) {
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) { const a = rot + (i * Math.PI) / pts - Math.PI / 2, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}
function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
const noGlow = (g) => { g.shadowColor = 'transparent'; g.shadowBlur = 0; };

const SYMBOLS = {
  boost(g) {
    // three stacked chevrons pointing up: pure speed
    const cols = ['#ffffff', '#8ff0ff', '#22b4ff'];
    [-24, -2, 20].forEach((y, i) => {
      g.save(); glow(g, '#22d3ff', i === 0 ? 14 : 8);
      g.beginPath(); g.moveTo(-28, y + 14); g.lineTo(0, y - 14); g.lineTo(28, y + 14);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 19; g.strokeStyle = OUT; g.stroke();
      noGlow(g); g.lineWidth = 11; g.strokeStyle = cols[i]; g.stroke();
      g.restore();
    });
    g.fillStyle = '#fff'; star(g, 33, -33, 8, 0, 4); g.fill(); star(g, -34, -26, 5, 0, 4); g.fill();
  },
  peel(g) {
    // trefoil of curled peel petals around a stem
    const petal = (a, c0, c1) => {
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(0, -3); g.bezierCurveTo(-22, -8, -23, -33, -1, -45); g.bezierCurveTo(21, -33, 20, -8, 0, -3); g.closePath();
      strokeFill(g, lin(g, 0, -4, 0, -44, [[0, c0], [1, c1]]), 5);
      // curl highlight along the petal
      g.beginPath(); g.moveTo(-8, -16); g.quadraticCurveTo(-11, -30, -3, -38);
      g.lineWidth = 3.2; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.65)'; g.stroke();
      g.restore();
    };
    g.save(); glow(g, 'rgba(183,242,58,.7)', 12);
    petal(0, '#f2ff7a', '#8fd61c'); petal(TAU / 3, '#f2ff7a', '#8fd61c'); petal((TAU * 2) / 3, '#f2ff7a', '#8fd61c');
    g.restore();
    g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); strokeFill(g, rad(g, -3, -3, 1, 10, [[0, '#fff3a8'], [1, '#ff9d1a']]), 4.5);
  },
  orb(g) {
    // glossy orb with a tilted orbit ring carrying two satellites
    const ring = (back) => {
      g.save(); g.rotate(-0.42);
      g.beginPath(); g.ellipse(0, 0, 41, 14, 0, back ? Math.PI : 0, back ? TAU : Math.PI);
      g.lineCap = 'round'; g.lineWidth = 9; g.strokeStyle = OUT; g.stroke();
      g.lineWidth = 4.5; g.strokeStyle = back ? '#1fbf7a' : '#c9ffe4'; g.stroke();
      g.restore();
    };
    ring(true);
    g.beginPath(); g.arc(0, 0, 25, 0, TAU);
    strokeFill(g, rad(g, -8, -10, 2, 30, [[0, '#f0fff8'], [0.35, '#52ffb0'], [1, '#0f8a55']]), 5);
    g.beginPath(); g.ellipse(-9, -11, 8, 5, -0.6, 0, TAU); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
    ring(false);
    g.save(); g.rotate(-0.42);
    [[-41, 0], [29, 10.6]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 7, 0, TAU); strokeFill(g, rad(g, x - 2, y - 2, 1, 8, [[0, '#fff'], [1, '#2fe08a']]), 3.5); });
    g.restore();
  },
  seeker(g) {
    // rocket in a lock-on reticle
    g.save(); glow(g, '#ff4d3d', 8);
    g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.lineWidth = 3.5; g.strokeStyle = '#ff7a6a'; g.setLineDash([9, 6]); g.stroke(); g.setLineDash([]);
    [[0, -46, 0, -30], [0, 46, 0, 30], [-46, 0, -30, 0], [46, 0, 30, 0]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineWidth = 5; g.strokeStyle = '#ff5a48'; g.lineCap = 'round'; g.stroke(); });
    g.restore();
    g.save(); g.rotate(0.62);
    // flame
    g.beginPath(); g.moveTo(-6, 22); g.quadraticCurveTo(0, 50, 6, 22); g.closePath(); strokeFill(g, lin(g, 0, 20, 0, 44, [[0, '#fff3a0'], [1, '#ff7a1a']]), 3.5);
    // fins
    g.beginPath(); g.moveTo(-8, 8); g.lineTo(-19, 26); g.lineTo(-8, 21); g.closePath(); strokeFill(g, '#ff3d4a', 4);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(19, 26); g.lineTo(8, 21); g.closePath(); strokeFill(g, '#ff3d4a', 4);
    // body
    g.beginPath(); g.moveTo(0, -34); g.bezierCurveTo(13, -22, 11, 6, 8, 24); g.lineTo(-8, 24); g.bezierCurveTo(-11, 6, -13, -22, 0, -34); g.closePath();
    strokeFill(g, lin(g, -11, 0, 11, 0, [[0, '#ffffff'], [0.55, '#e8eefc'], [1, '#aeb9d6']]), 5);
    g.beginPath(); g.moveTo(0, -34); g.bezierCurveTo(8, -28, 10, -20, 10.4, -14); g.lineTo(-10.4, -14); g.bezierCurveTo(-10, -20, -8, -28, 0, -34); g.closePath();
    g.fillStyle = '#ff3d4a'; g.fill();
    g.beginPath(); g.arc(0, -2, 5, 0, TAU); strokeFill(g, '#52d6ff', 3);
    g.restore();
  },
  bomb(g) {
    // round black bomb with a lit fuse
    g.save(); glow(g, 'rgba(255,138,31,.6)', 10);
    g.beginPath(); g.moveTo(6, -26); g.bezierCurveTo(10, -40, 24, -42, 28, -34);
    g.lineCap = 'round'; g.lineWidth = 9; g.strokeStyle = OUT; g.stroke(); g.lineWidth = 4.5; g.strokeStyle = '#d6b27a'; g.stroke();
    g.restore();
    g.beginPath(); g.arc(-2, 6, 30, 0, TAU);
    strokeFill(g, rad(g, -12, -7, 3, 38, [[0, '#6c7699'], [0.35, '#252c48'], [1, '#05070f']]), 5);
    g.beginPath(); g.ellipse(-12, -6, 9, 5.5, -0.7, 0, TAU); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    g.beginPath(); g.rect(-10, -28, 16, 9); strokeFill(g, lin(g, 0, -28, 0, -19, [[0, '#8e9ac0'], [1, '#444e75']]), 4);
    g.save(); glow(g, '#ffb02e', 16);
    star(g, 29, -36, 12, 0.3, 4, 0.34); g.fillStyle = '#fff3a8'; g.fill();
    star(g, 29, -36, 7, 0.3, 4, 0.4); g.fillStyle = '#ffffff'; g.fill();
    g.restore();
    g.fillStyle = '#ff5a1f'; star(g, 40, -22, 4.5, 0, 4); g.fill(); star(g, 18, -46, 3.5, 0, 4); g.fill();
  },
  comet(g) {
    // fireball with a long tail
    g.save(); glow(g, '#5aa8ff', 14);
    g.beginPath(); g.moveTo(14, -14); g.bezierCurveTo(-10, -4, -30, 18, -46, 42); g.bezierCurveTo(-26, 34, -6, 30, 8, 14); g.closePath();
    g.fillStyle = lin(g, 14, -14, -46, 42, [[0, 'rgba(214,235,255,.95)'], [0.5, 'rgba(90,168,255,.65)'], [1, 'rgba(90,168,255,0)']]); g.fill();
    g.beginPath(); g.moveTo(8, -20); g.bezierCurveTo(-4, -16, -14, -4, -32, 8); g.bezierCurveTo(-10, 4, 4, 0, 16, -8); g.closePath();
    g.fillStyle = lin(g, 8, -20, -32, 8, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]); g.fill();
    g.restore();
    g.beginPath(); g.arc(14, -14, 22, 0, TAU);
    strokeFill(g, rad(g, 9, -19, 1, 26, [[0, '#ffffff'], [0.4, '#bfe0ff'], [1, '#3a86ff']]), 5);
    g.fillStyle = '#fff'; star(g, -30, -30, 7, 0, 4); g.fill(); star(g, 36, 22, 6, 0, 4); g.fill(); star(g, -8, 36, 4.5, 0, 4); g.fill();
  },
  shock(g) {
    // lightning bolt
    g.save(); glow(g, '#ffe23a', 18);
    g.beginPath(); g.moveTo(10, -46); g.lineTo(-24, 6); g.lineTo(-3, 6); g.lineTo(-12, 46); g.lineTo(26, -10); g.lineTo(4, -10); g.lineTo(18, -46); g.closePath();
    strokeFill(g, lin(g, 0, -46, 0, 46, [[0, '#fffbd0'], [0.5, '#ffe23a'], [1, '#ff9d1a']]), 6);
    g.restore();
    g.beginPath(); g.moveTo(10, -36); g.lineTo(-13, 3); g.lineTo(2, 3); g.lineTo(-4, 30); g.lineTo(11, 4); g.lineTo(-3, 4);
    g.lineWidth = 2.6; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = '#fff6b0'; star(g, -34, -24, 6, 0, 4); g.fill(); star(g, 36, 28, 5, 0, 4); g.fill();
  },
  shield(g) {
    // faceted prism shield
    const outline = () => {
      g.beginPath(); g.moveTo(0, -46); g.bezierCurveTo(16, -40, 30, -37, 40, -34); g.bezierCurveTo(40, 0, 28, 28, 0, 48);
      g.bezierCurveTo(-28, 28, -40, 0, -40, -34); g.bezierCurveTo(-30, -37, -16, -40, 0, -46); g.closePath();
    };
    g.save(); glow(g, '#b06bff', 14); outline(); strokeFill(g, '#7b3df2', 6); g.restore();
    g.save(); outline(); g.clip();
    const C = [0, -4];
    const P = [[0, -46], [40, -34], [40, 0], [28, 28], [0, 48], [-28, 28], [-40, 0], [-40, -34]];
    const cols = ['#ff7ad9', '#7ad8ff', '#b79bff', '#ffd27a', '#7affc4', '#b06bff', '#ff9ad2', '#8ab4ff'];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      g.beginPath(); g.moveTo(C[0], C[1]); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath();
      g.fillStyle = lin(g, C[0], C[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, [[0, '#ffffff'], [0.55, cols[i]], [1, darken(cols[i], 0.25)]]); g.fill();
      g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
    }
    g.restore();
    outline(); g.lineWidth = 5; g.strokeStyle = OUT; g.lineJoin = 'round'; g.stroke();
    outline(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.7)'; g.stroke();
    g.fillStyle = '#fff'; star(g, -26, -22, 6, 0, 4); g.fill();
  },
  rocket(g) {
    // chunky cartoon rocket with porthole and a huge flame
    g.save(); g.rotate(0.72);
    g.save(); glow(g, '#ff9d1a', 16);
    g.beginPath(); g.moveTo(-10, 26); g.bezierCurveTo(-18, 46, -3, 52, 0, 62); g.bezierCurveTo(3, 52, 18, 46, 10, 26); g.closePath();
    strokeFill(g, lin(g, 0, 24, 0, 62, [[0, '#fff6b0'], [0.45, '#ffb02e'], [1, '#ff4d1a']]), 4);
    g.restore();
    g.beginPath(); g.moveTo(-12, 8); g.lineTo(-27, 30); g.lineTo(-10, 25); g.closePath(); strokeFill(g, '#ff3d6a', 4.5);
    g.beginPath(); g.moveTo(12, 8); g.lineTo(27, 30); g.lineTo(10, 25); g.closePath(); strokeFill(g, '#ff3d6a', 4.5);
    g.beginPath(); g.moveTo(0, -48); g.bezierCurveTo(22, -32, 17, 4, 12, 28); g.lineTo(-12, 28); g.bezierCurveTo(-17, 4, -22, -32, 0, -48); g.closePath();
    strokeFill(g, lin(g, -16, 0, 16, 0, [[0, '#ffffff'], [0.6, '#e6ecfb'], [1, '#aab6d6']]), 5.5);
    g.beginPath(); g.moveTo(0, -48); g.bezierCurveTo(13, -40, 18, -28, 19.5, -20); g.lineTo(-19.5, -20); g.bezierCurveTo(-18, -28, -13, -40, 0, -48); g.closePath();
    g.fillStyle = lin(g, 0, -48, 0, -20, [[0, '#ff6a8a'], [1, '#e0244f']]); g.fill();
    g.beginPath(); g.arc(0, -4, 8.5, 0, TAU); strokeFill(g, rad(g, -2, -6, 1, 9, [[0, '#d6f6ff'], [1, '#2aa6e6']]), 4);
    g.beginPath(); g.rect(-14, 18, 28, 6); g.fillStyle = '#ff3d6a'; g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.lineCap = 'round';
    [[-40, -8, -28, -2], [-42, 8, -30, 12], [-36, 24, -26, 24]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
  },
  ink(g) {
    // glossy ink splat with drips
    const blob = () => {
      g.beginPath();
      const pts = [[0, -36], [14, -28], [30, -30], [26, -12], [40, -2], [26, 8], [34, 26], [14, 22], [8, 40], [-4, 24], [-22, 36], [-22, 14], [-40, 8], [-26, -6], [-34, -24], [-14, -22]];
      g.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
      for (let i = 1; i <= pts.length; i++) { const p = pts[i % pts.length], n = pts[(i + 1) % pts.length]; g.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2); }
      g.closePath();
    };
    g.save(); glow(g, 'rgba(139,77,255,.7)', 12);
    blob(); strokeFill(g, rad(g, -8, -10, 4, 50, [[0, '#9a6bff'], [0.45, '#4a2bb8'], [1, '#1a0f4d']]), 5.5);
    g.restore();
    g.beginPath(); g.ellipse(-13, -14, 11, 6, -0.55, 0, TAU); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill();
    g.beginPath(); g.arc(6, -4, 3, 0, TAU); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
    g.beginPath(); g.arc(40, -30, 4.5, 0, TAU); strokeFill(g, '#5b34d6', 2.5);
    g.beginPath(); g.arc(-40, 30, 5.5, 0, TAU); strokeFill(g, '#5b34d6', 2.5);
  },
  box(g) {
    g.font = '900 78px "KR Display", "Arial Rounded MT Bold", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = OUT; g.strokeText('?', 0, 4);
    g.fillStyle = lin(g, 0, -34, 0, 40, [[0, '#ffffff'], [1, '#ffd23f']]); g.fillText('?', 0, 4);
  },
};
const BADGE_COLORS = { box: '#22d3ff' };

const cache = new Map();
/** Procedurally drawn badge icon. Cached: the SAME canvas instance is returned for the same (id,size) - use
 *  getItemIconURL() if you need the picture in several places at once. */
export function getItemIcon(id, size = 96) {
  size = Math.max(8, Math.round(size));
  const key = `${id}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = ITEM_DEFS[id];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  badge(g, size, def?.color ?? BADGE_COLORS[id] ?? '#8a93b8');
  const draw = SYMBOLS[id] ?? SYMBOLS.box;
  g.save();
  g.translate(size / 2, size / 2);
  const k = (size * 0.8) / 100;
  g.scale(k * 0.78, k * 0.78);
  draw(g);
  g.restore();
  gloss(g, size);
  cache.set(key, c);
  return c;
}

const urlCache = new Map();
export function getItemIconURL(id, size = 96) {
  const key = `${id}:${size}`;
  let u = urlCache.get(key);
  if (!u) { u = getItemIcon(id, size).toDataURL('image/png'); urlCache.set(key, u); }
  return u;
}

/** A plain-data helper for "what is this item worth in a given place" lives in distribution.js; the defs above are just presentation. */
export const itemDef = (id) => ITEM_DEFS[id] ?? null;
