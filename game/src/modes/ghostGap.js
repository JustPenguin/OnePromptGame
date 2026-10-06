// Time-trial ghost gap for the HUD. OWNER: Agent E.  Pure (no DOM) so it can be unit-tested: node src/modes/selftest.mjs
//
// Convention (the one every racing game uses): POSITIVE = you are BEHIND / slower than the ghost (shown "+1.23", red),
// NEGATIVE = you are AHEAD / faster (shown "-0.80", green).
//
// Sources, best first:
//   session.ghostDelta      Agent A's engine: live seconds, + = the player is AHEAD of the ghost, null when n/a (so we negate it)
//   session.ghostPlayer.kart.race.distance  fallback estimate: metres the ghost leads / my speed (floored at 10 m/s so it never explodes at standstill)
/**
 * @param {{ghostDelta?:number|null, ghostPlayer?:{kart?:any, ghost?:any}}} session
 * @param {{speed:number, race:{distance:number}}} me
 * @returns {number|null} seconds (+ = behind), or null when unknown
 */
export function ghostGapSeconds(session, me) {
  const d = session?.ghostDelta;
  if (Number.isFinite(d)) return -d;
  const gk = session?.ghostPlayer?.kart ?? session?.ghostPlayer?.ghost;
  if (gk?.race && Number.isFinite(gk.race.distance) && Number.isFinite(me?.race?.distance)) {
    const ghostLeadsBy = gk.race.distance - me.race.distance;   // metres; + = ghost is ahead of me
    return ghostLeadsBy / Math.max(10, Math.abs(me.speed ?? 0));
  }
  return null;
}

/** "+1.23" / "-0.80" / "0.00" */
export function formatGap(sec) {
  if (!Number.isFinite(sec)) return '--';
  const a = Math.abs(sec);
  if (a < 0.005) return '0.00';
  return `${sec > 0 ? '+' : '-'}${a.toFixed(2)}`;
}
