// Track layout analyser + top-down preview (runs in plain Node, no browser).   OWNER: Agent B.
//
//   node src/tracks/tools/preview.mjs sunny-meadows            analysis + .qa/layout-sunny-meadows.png
//   node src/tracks/tools/preview.mjs all --no-png             analysis of every registered track
//   node src/tracks/tools/preview.mjs neon-nights --size=1200x900 --mirror
//
// Prints: length, widths, elevation range + max grade, every corner (s range, direction, min radius, angle), straights,
// self-overlap / crossing report (crossings need > 6 m vertical separation), zone list, and an estimated lap time from
// the racing-line speed profile.  The PNG shows the road to scale (colour = corner speed), zones, 100 m ticks and an
// elevation strip.  Orientation: screen x = world X, screen y = world Z  (the same, un-mirrored map E should draw).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACK_DEFS } from '../index.js';
import { SplineTrack } from '../../track/SplineTrack.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const ids = args.filter((a) => !a.startsWith('--'));
const wanted = ids.length === 0 || ids[0] === 'all' ? TRACK_DEFS.map((d) => d.id) : ids;
const [W, H] = String(flags.size ?? '1100x900').split('x').map(Number);

// ---------------------------------------------------------------------------------------------------------------
function analyse(track, buildMs) {
  const N = track.count, sp = track.spacing, L = track.length;
  console.log(`\n== ${track.id}  length ${L.toFixed(0)} m  (${N} samples, build ${buildMs.toFixed(0)} ms)`);
  let wMin = 1e9, wMax = 0, gradeMax = 0, gradeAt = 0;
  for (let i = 0; i < N; i++) {
    wMin = Math.min(wMin, track.hw[i] * 2); wMax = Math.max(wMax, track.hw[i] * 2);
    const j = (i + 3) % N;
    const dy = track.pos[j * 3 + 1] - track.pos[i * 3 + 1];
    const dh = Math.hypot(track.pos[j * 3] - track.pos[i * 3], track.pos[j * 3 + 2] - track.pos[i * 3 + 2]);
    const g = Math.abs(dy / dh);
    if (g > gradeMax) { gradeMax = g; gradeAt = i * sp; }
  }
  const b = track.bounds;
  console.log(`   width ${wMin.toFixed(1)}-${wMax.toFixed(1)} m   height ${b.minY.toFixed(1)}..${b.maxY.toFixed(1)} m   max grade ${(gradeMax * 100).toFixed(1)}% @ s=${gradeAt.toFixed(0)}   bbox ${(b.maxX - b.minX).toFixed(0)} x ${(b.maxZ - b.minZ).toFixed(0)} m`);

  // raw curvature over ~8 m for corner radius (the smoothed one in track.curvature is for the AI)
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let d = track.yawArr[(i + 2) % N] - track.yawArr[(i - 2 + N) % N];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    raw[i] = d / (4 * sp);
  }
  // corners: runs where smoothed |curvature| > 1/260
  const TH = 1 / 260;
  const corners = [];
  let cur = null;
  const total = N * 2; // wrap once so a corner crossing the line is found
  for (let k = 0; k < total; k++) {
    const i = k % N, c = track.curvature[i];
    if (Math.abs(c) > TH && (!cur || Math.sign(c) === cur.dir)) {
      if (!cur) cur = { s0: k * sp, dir: Math.sign(c), ang: 0, kmax: 0, sMin: 0 };
      cur.ang += c * sp; cur.s1 = (k + 1) * sp;
      if (Math.abs(raw[i]) > cur.kmax) { cur.kmax = Math.abs(raw[i]); cur.sMin = k * sp; }
    } else if (cur) { if (cur.s0 < L) corners.push(cur); cur = null; }
  }
  const dedup = corners.filter((c, i) => !(c.s0 >= L - 1 && corners.some((o) => Math.abs(o.s0 - (c.s0 - L)) < 5)));
  const fmt = dedup.map((c) => `${c.dir > 0 ? 'L' : 'R'} s${(c.s0 % L).toFixed(0)}-${(c.s1 % L).toFixed(0)} ${(Math.abs(c.ang) / Math.PI * 180).toFixed(0)}deg R${(1 / c.kmax).toFixed(0)}`);
  console.log(`   corners (${dedup.length}): ${fmt.join(' | ')}`);
  // straights: gaps between corners longer than 150 m
  const straights = [];
  for (let i = 0; i < dedup.length; i++) {
    const a = dedup[i], bn = dedup[(i + 1) % dedup.length];
    let gap = (bn.s0 - a.s1 + L) % L; if (dedup.length === 1) gap = L - (a.s1 - a.s0);
    if (gap > 150) straights.push(`${gap.toFixed(0)} m after s${(a.s1 % L).toFixed(0)}`);
  }
  console.log(`   straights >150 m: ${straights.join(' | ') || 'none'}`);
  // self-overlap / crossing
  const issues = [];
  const near = Math.round(90 / sp);
  const seen = new Set();
  for (let i = 0; i < N; i++) for (let j = i + near; j < N; j++) {
    if (Math.min(j - i, N - (j - i)) < near) continue;
    const dx = track.pos[i * 3] - track.pos[j * 3], dz = track.pos[i * 3 + 2] - track.pos[j * 3 + 2];
    const dy = Math.abs(track.pos[i * 3 + 1] - track.pos[j * 3 + 1]);
    const d = Math.hypot(dx, dz);
    const need = track.hw[i] + track.hw[j] + track.shoulderW[i] + track.shoulderW[j] + 4;
    if (d < need) {
      const key = `${Math.round(i * sp / 40)}-${Math.round(j * sp / 40)}`;
      if (seen.has(key)) continue; seen.add(key);
      issues.push({ s1: i * sp, s2: j * sp, d, dy, bad: dy < 6.5 });
    }
  }
  const bad = issues.filter((x) => x.bad), okx = issues.filter((x) => !x.bad);
  console.log(`   overlaps/crossings: ${issues.length ? '' : 'none'}${bad.length ? `  BAD(${bad.length}): ` + bad.slice(0, 6).map((x) => `s${x.s1.toFixed(0)}~s${x.s2.toFixed(0)} d=${x.d.toFixed(0)} dy=${x.dy.toFixed(1)}`).join(', ') : ''}${okx.length ? `  ok-crossings: ` + okx.slice(0, 4).map((x) => `s${x.s1.toFixed(0)}~s${x.s2.toFixed(0)} dy=${x.dy.toFixed(1)}`).join(', ') : ''}`);
  // zones
  const z = track.zones.map((q) => `${q.type}@${q.s0.toFixed(0)}+${(q.s1 - q.s0).toFixed(0)}${q.height ? ' h' + q.height : ''}`);
  console.log(`   zones: ${z.join('  ') || 'none'}`);
  // lap time estimate from the speed profile (accel-limited)
  let v = 20, time = 0;
  for (let k = 0; k < N * 2; k++) {
    const i = k % N;
    const vmax = Math.min(track.racingLine.maxSpeed[i], 33);
    v = Math.min(vmax, Math.sqrt(v * v + 2 * 9 * sp));
    if (k >= N) time += sp / v;
  }
  let vmin = 1e9, vsum = 0; for (let i = 0; i < N; i++) { vmin = Math.min(vmin, track.racingLine.maxSpeed[i]); vsum += Math.min(33, track.racingLine.maxSpeed[i]); }
  const offMax = track.racingLine.offset.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  console.log(`   est. lap ${time.toFixed(1)} s  (avg ${(L / time).toFixed(1)} m/s)   line: |offset| max ${offMax.toFixed(1)} m, slowest ${vmin.toFixed(1)} m/s, mean(min(33,v)) ${(vsum / N).toFixed(1)}`);
  if (track.gaps.length) console.log(`   jumps: ${track.gaps.map((g) => `gap@${g.s0.toFixed(0)}+${(g.s1 - g.s0).toFixed(0)} needs ${g.minSpeed?.toFixed(1)} m/s`).join(' | ')}`);
  const mk = Object.entries(track.markers).map(([k, m]) => `${k}:${m.s0.toFixed(0)}`);
  if (mk.length) console.log(`   markers: ${mk.join(' ')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// tiny rasteriser + PNG writer
function render(track) {
  const img = new Uint8Array(W * H * 3);
  const set = (x, y, c, a = 1) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 3;
    img[o] = img[o] * (1 - a) + c[0] * a; img[o + 1] = img[o + 1] * (1 - a) + c[1] * a; img[o + 2] = img[o + 2] * (1 - a) + c[2] * a;
  };
  for (let i = 0; i < W * H; i++) { img[i * 3] = 24; img[i * 3 + 1] = 32; img[i * 3 + 2] = 54; }
  const stripH = 150, mapH = H - stripH;
  const b = track.bounds, pad = 70;
  const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (mapH - pad * 2) / (b.maxZ - b.minZ));
  const ox = (W - (b.maxX - b.minX) * sc) / 2 - b.minX * sc, oy = (mapH - (b.maxZ - b.minZ) * sc) / 2 - b.minZ * sc;
  const X = (x) => x * sc + ox, Y = (z) => z * sc + oy;
  const disc = (cx, cy, r, c, a = 1) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx + x, cy + y, c, a); };
  const line = (x0, y0, x1, y1, r, c, a = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1; for (let k = 0; k <= n; k++) disc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r, c, a); };
  // grid
  for (let gx = Math.ceil(b.minX / 100) * 100; gx < b.maxX + 100; gx += 100) for (let y = 0; y < mapH; y++) set(X(gx), y, [255, 255, 255], 0.06);
  for (let gz = Math.ceil(b.minZ / 100) * 100; gz < b.maxZ + 100; gz += 100) for (let x = 0; x < W; x++) set(x, Y(gz), [255, 255, 255], 0.06);
  const N = track.count;
  // shoulder + road
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const hw = track.hw[i] + (pass === 0 ? track.shoulderW[i] : 0);
    const r = Math.max(1, Math.round(hw * sc));
    const v = Math.min(1, track.racingLine.maxSpeed[i] / 34);
    const col = pass === 0 ? [46, 64, 98] : [Math.round(255 - 190 * v), Math.round(80 + 150 * v), 90];
    line(X(track.pos[i * 3]), Y(track.pos[i * 3 + 2]), X(track.pos[j * 3]), Y(track.pos[j * 3 + 2]), r, col, pass === 0 ? 1 : 0.95);
  }
  // centre line (thin white) + the racing line (yellow) offset by racingLine.offset along the right vector
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; line(X(track.pos[i * 3]), Y(track.pos[i * 3 + 2]), X(track.pos[j * 3]), Y(track.pos[j * 3 + 2]), 0, [255, 255, 255], 0.35); }
  const rl = (i) => [track.pos[i * 3] + track.right[i * 3] * track.racingLine.offset[i], track.pos[i * 3 + 2] + track.right[i * 3 + 2] * track.racingLine.offset[i]];
  for (let i = 0; i < N; i++) { const j = (i + 1) % N, a = rl(i), b = rl(j); line(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), 1, [255, 214, 63], 0.95); }
  for (let s = 0; s < track.length; s += 100) {
    const smp = track.sampleAt(s);
    const px = X(smp.position.x), py = Y(smp.position.z);
    disc(px, py, 4, [255, 255, 255]);
    text(set, `${s}`, px + 6, py - 8, [255, 255, 255]);
  }
  // zones
  const zc = { boost: [34, 211, 255], ramp: [255, 154, 31], gap: [255, 61, 106], ice: [190, 233, 255], mud: [140, 100, 60], sand: [232, 201, 138], water: [60, 140, 255] };
  for (const z of track.zones) for (let s = z.s0; s <= z.s1; s += 2) { const smp = track.sampleAt(s); disc(X(smp.position.x), Y(smp.position.z), 3, zc[z.type] ?? [255, 255, 255]); }
  // start arrow
  const s0 = track.sampleAt(0);
  line(X(s0.position.x), Y(s0.position.z), X(s0.position.x + s0.tangent.x * 40), Y(s0.position.z + s0.tangent.z * 40), 3, [255, 214, 63]);
  disc(X(s0.position.x), Y(s0.position.z), 7, [255, 214, 63]);
  // elevation strip
  const y0 = mapH + 10, yh = stripH - 30, yr = Math.max(1, b.maxY - b.minY);
  for (let x = 0; x < W; x++) set(x, mapH, [255, 255, 255], 0.2);
  for (let k = 0; k < W - 2 * pad; k++) {
    const s = (k / (W - 2 * pad)) * track.length;
    const smp = track.sampleAt(s);
    const yy = y0 + yh - ((smp.position.y - b.minY) / yr) * (yh - 10) - 5;
    disc(pad + k, yy, 1, [255, 214, 63]);
  }
  for (const z of track.zones) { const x0 = pad + (z.s0 / track.length) * (W - 2 * pad), x1 = pad + (z.s1 / track.length) * (W - 2 * pad); line(x0, y0 + yh + 8, x1, y0 + yh + 8, 2, zc[z.type] ?? [255, 255, 255]); }
  text(set, `${track.id} ${track.length.toFixed(0)}M  Y ${b.minY.toFixed(0)}..${b.maxY.toFixed(0)}`, pad, 12, [255, 255, 255]);
  return encodePng(img, W, H);
}

const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000' };
function text(set, str, x, y, c) {
  for (const ch of String(str)) {
    const g = FONT[ch];
    if (g) for (let k = 0; k < 15; k++) if (g[k] === '1') { const px = x + (k % 3) * 2, py = y + Math.floor(k / 3) * 2; set(px, py, c); set(px + 1, py, c); set(px, py + 1, c); set(px + 1, py + 1, c); }
    x += 8;
  }
}

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function main() {
  for (const id of wanted) {
    const def = TRACK_DEFS.find((d) => d.id === id);
    if (!def) { console.log(`unknown track ${id}`); continue; }
    const t0 = performance.now();
    const track = new SplineTrack(def, { headless: true, mirror: !!flags.mirror });
    const build = performance.now() - t0;
    analyse(track, build);
    if (!flags['no-png']) {
      const png = render(track);
      mkdirSync(resolve(root, '.qa'), { recursive: true });
      const file = resolve(root, `.qa/layout-${id}.png`);
      writeFileSync(file, png);
      console.log(`   preview -> ${file}`);
    }
  }
}
main();
