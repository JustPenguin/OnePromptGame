// Track / cup catalogue helpers for menus. OWNER: Agent E.  Reads Agent B's registry (src/tracks/index.js) only through its
// documented exports (TRACK_DEFS, CUPS, getTrackDef) and tolerates 1..N tracks and cups.
import * as THREE from 'three';
import { TRACK_DEFS, CUPS, getTrackDef } from '../tracks/index.js';
import { param } from '../core/params.js';
import { hexToRgb } from '../core/math.js';

export { TRACK_DEFS, CUPS, getTrackDef };

/** All cups, in registry order; each gets `tracks` (defs) resolved. Tracks that no cup lists are gathered in an "Exhibition" pseudo-cup. */
export function getCups() {
  const known = new Set();
  const cups = CUPS.map((c) => {
    const tracks = c.trackIds.map((id) => TRACK_DEFS.find((t) => t.id === id)).filter(Boolean);
    tracks.forEach((t) => known.add(t.id));
    return { ...c, tracks };
  }).filter((c) => c.tracks.length);
  const orphans = TRACK_DEFS.filter((t) => !known.has(t.id));
  if (orphans.length) cups.push({ id: 'exhibition', name: 'Exhibition Cup', trackIds: orphans.map((t) => t.id), tracks: orphans });
  return cups;
}

export const cupOfTrack = (trackId) => getCups().find((c) => c.tracks.some((t) => t.id === trackId)) ?? null;
export const getCup = (id) => getCups().find((c) => c.id === id) ?? null;

/** Everything unlocked (debug / review aid): ?unlockall=1 */
export const UNLOCK_ALL = param('unlockall') !== null && !['0', 'false', 'off'].includes(param('unlockall'));

export function isCupUnlocked(save, cupId) { return UNLOCK_ALL || save.data.unlocks.cups.includes(cupId) || cupId === 'exhibition'; }
export function isTrackUnlocked(save, trackId) {
  if (UNLOCK_ALL) return true;
  const cup = cupOfTrack(trackId);
  return !cup || isCupUnlocked(save, cup.id);
}
export function unlockedTracks(save) { return TRACK_DEFS.filter((t) => isTrackUnlocked(save, t.id)); }

// ------------------------------------------------------------------------------------------------ track outlines
const outlineCache = new Map();

/**
 * Top-down outline of a track WITHOUT building the track (SplineTrack builds all its visuals in its constructor, far too heavy for
 * a menu thumbnail).  Uses the same closed centripetal Catmull-Rom through def.points that SplineTrack samples, so it matches the
 * HUD minimap (`track.minimap`).  Cached.  -> { points:[[x,z]...], bounds:{minX,maxX,minZ,maxZ}, start:[x,z] } | null
 */
export function getTrackOutline(trackId) {
  if (outlineCache.has(trackId)) return outlineCache.get(trackId);
  let out = null;
  try {
    const def = getTrackDef(trackId);
    const pts = (def.points ?? []).map((p) => new THREE.Vector3(p[0], 0, p[2]));
    if (pts.length >= 3) {
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      curve.arcLengthDivisions = Math.max(600, pts.length * 60);
      const N = 200;
      const points = [];
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const v = new THREE.Vector3();
      for (let i = 0; i < N; i++) {
        curve.getPointAt(i / N, v);
        points.push([v.x, v.z]);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
      }
      out = { points, bounds: { minX, maxX, minZ, maxZ }, start: points[0] };
    }
  } catch (e) { console.warn('[catalog] outline failed for', trackId, e); }
  outlineCache.set(trackId, out);
  return out;
}

/**
 * Fit a minimap-like object ({points, bounds, start}) into w x h and return a projector.  Map convention: forward (+Z) is UP and
 * +X is to the LEFT, i.e. what you would see from a helicopter behind a kart at yaw 0.
 */
export function fitOutline(outline, w, h, pad = 8) {
  const b = outline.bounds;
  const sx = (w - pad * 2) / Math.max(1, b.maxX - b.minX), sz = (h - pad * 2) / Math.max(1, b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  const ox = (w - (b.maxX - b.minX) * s) / 2, oz = (h - (b.maxZ - b.minZ) * s) / 2;
  const px = (x) => ox + (b.maxX - x) * s;
  const pz = (z) => oz + (b.maxZ - z) * s;
  return { s, px, pz, project: (p) => [px(p[0]), pz(p[1])] };
}

/** Stroke a track outline onto a 2D context (thick dark casing, bright core, start dot). */
export function drawOutline(ctx, outline, w, h, o = {}) {
  const fit = fitOutline(outline, w, h, o.pad ?? 10);
  const lw = o.lineWidth ?? Math.max(3, Math.min(w, h) * 0.05);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => { ctx.beginPath(); outline.points.forEach((p, i) => { const [x, y] = fit.project(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = lw * 1.4; }
  path(); ctx.strokeStyle = o.casing ?? 'rgba(6,9,26,.85)'; ctx.lineWidth = lw * 1.9; ctx.stroke();
  ctx.shadowBlur = 0;
  path(); ctx.strokeStyle = o.color ?? '#ffffff'; ctx.lineWidth = lw; ctx.stroke();
  if (o.start !== false && outline.start) {
    const [sx, sy] = fit.project(outline.start);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(sx, sy, lw * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0f24'; ctx.lineWidth = lw * 0.35; ctx.stroke();
  }
  ctx.restore();
  return fit;
}

// ------------------------------------------------------------------------------------------------ colour helpers
export function trackColors(def) {
  const p = def.palette ?? {};
  const ui = p.ui ?? {};
  return {
    primary: ui.primary ?? p.accent ?? '#ffd23f',
    secondary: ui.secondary ?? p.ground ?? '#5da13a',
    skyTop: p.skyTop ?? '#3d8bff', skyHorizon: p.skyHorizon ?? '#cfe9ff', ground: p.ground ?? '#5da13a', accent: p.accent ?? '#ffd23f',
  };
}
export const rgba = (hex, a) => { try { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; } catch { return `rgba(255,255,255,${a})`; } };
/** CSS gradient for a track card from its palette. */
export function trackGradient(def, angle = 160) {
  const c = trackColors(def);
  return `linear-gradient(${angle}deg, ${c.skyTop} 0%, ${c.skyHorizon} 33%, ${c.ground} 38%, ${rgba('#000000', 0.35)} 100%), ${c.ground}`;
}
