// Handling report: measures how the karts drive and checks the numbers against the targets in docs/tasks/A-engine.md.
// Pure Node (no browser): real SplineTrack + KartPhysics + RaceManager on a mock session (see scripts/lib/rig.mjs).
//
//   node scripts/handling.mjs                    full report for Pip + Classic Racer at class `pro`
//   node scripts/handling.mjs --driver=bruno --body=crusher --class=master
//   node scripts/handling.mjs --roster           also print the stat-spread table (all drivers / bodies)
//   node scripts/handling.mjs --only=drift,wall  run only the named sections
//   node scripts/handling.mjs --verbose          print extra detail
// Exit code 1 if any target is missed (so it can guard regressions).
import { makeRig, DEFS, aim, makeBot, soloLap, angleDiff, wrapAngle, Surface } from './lib/rig.mjs';
import { DRIFT_LEVEL_TIME } from '../src/physics/tuning.js';
import { DRIVERS, KART_BODIES } from '../src/data/roster.js';
import { EV } from '../src/core/events.js';
import { Input } from '../src/core/Input.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const DRIVER = args.driver ?? 'pip', BODY = args.body ?? 'classic', CLASS = args.class ?? 'pro';
const only = args.only ? String(args.only).split(',') : null;
const verbose = !!args.verbose;
const want = (name) => !only || only.includes(name);
const D2R = Math.PI / 180;

let failures = 0;
const rows = [];
function section(title) { console.log(`\n== ${title}`); }
function check(name, value, lo, hi, unit = '', note = '') {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  if (!ok) failures++;
  const v = Number.isFinite(value) ? (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)) : String(value);
  const target = lo === -Infinity ? `<= ${hi}` : hi === Infinity ? `>= ${lo}` : `${lo} .. ${hi}`;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(46)} ${(v + ' ' + unit).padEnd(14)} target ${target} ${unit} ${note}`);
  rows.push({ name, value, ok });
  return ok;
}
function info(name, value, unit = '') { console.log(`       ${name.padEnd(46)} ${(typeof value === 'number' ? value.toFixed(2) : value) + ' ' + unit}`); }
const wrap = wrapAngle;
const newRig = (def = DEFS.open, o = {}) => makeRig(def, { speedClass: CLASS, ...o });
const kartOpts = (o = {}) => ({ driver: DRIVER, body: BODY, ...o });

/** Steady-state turn: pin the speed, hold steer, return { radius, yawRate, slipDeg, speed }. */
function steadyTurn(v, steer = -1, { seconds = 7, settle = 3, drift = false, k0 = {}, unpinned = false, def = DEFS.open } = {}) {
  const rig = newRig(def);
  const k = rig.addKart(kartOpts({ s: 60, speed: v, ...k0 }));
  const s = rig.run(seconds, () => { k.input.throttle = 1; k.input.steer = steer; k.input.drift = drift; }, { every: 1 / 60, pin: unpinned ? null : (kk) => { kk.speed = v; } });
  let tot = 0, n = 0, sp = 0, slip = 0;
  for (let i = 1; i < s.length; i++) if (s[i].t >= settle) { tot += wrap(s[i].moveYaw - s[i - 1].moveYaw); n++; sp += s[i].speed; slip += wrap(s[i].yaw - s[i].moveYaw); }
  const dt = n / 60;
  const w = Math.abs(tot) / dt, speed = sp / n;
  return { radius: speed / w, yawRate: w, speed, slipDeg: (slip / n) / D2R, rig, k };
}

// ---------------------------------------------------------------------------------------------------------------------
function longitudinal() {
  section(`Longitudinal  (${DRIVER} + ${BODY}, class ${CLASS})`);
  let rig = newRig();
  let k = rig.addKart(kartOpts({ s: 50 }));
  const top = k.stats.topSpeed;
  info('top speed (stats)', `${(top * 3.6).toFixed(1)} km/h  (${top.toFixed(2)} m/s)`);
  const s = rig.run(14, () => { k.input.throttle = 1; }, { every: 1 / 60 });
  let t100 = NaN, t98 = NaN, t60 = NaN;
  for (const r of s) { if (!(t100 > 0) && r.speed >= 100 / 3.6) t100 = r.t; if (!(t98 > 0) && r.speed >= 0.98 * top) t98 = r.t; if (!(t60 > 0) && r.speed >= 60 / 3.6) t60 = r.t; }
  if (CLASS === 'pro' && DRIVER === 'pip' && BODY === 'classic') {
    check('0 -> 100 km/h', t100, 2.6, 3.4, 's');
    check('0 -> 98 % of top speed', t98, 5, 7, 's');
    check('top speed (pro)', s.at(-1).kmh, 120, 130, 'km/h');
  } else { info('0 -> 100 km/h', t100, 's'); info('0 -> 98 % top', t98, 's'); info('final speed', s.at(-1).kmh, 'km/h'); }
  info('0 -> 60 km/h', t60, 's');

  // boosted top speed
  rig = newRig(); k = rig.addKart(kartOpts({ s: 50, speed: top * 0.99 }));
  const sb = rig.run(2.4, (t) => { k.input.throttle = 1; if (t === 0) k.applyBoost(0.38, 1.5, 'item'); }, { every: 1 / 60 });
  const peak = Math.max(...sb.map((r) => r.speed));
  check('boost item top-speed gain', (peak / top - 1) * 100, 33, 45, '%');
  const tEnd = sb.find((r) => r.t > 1.5 && r.speed <= top * 1.02);
  info('time from boost start until back to top speed', tEnd ? tEnd.t : '>2.4', 's');
  // smoothness of the boost ending: biggest deceleration after the timer ends
  let maxDec = 0; for (let i = 1; i < sb.length; i++) if (sb[i].t > 1.4) maxDec = Math.max(maxDec, (sb[i - 1].speed - sb[i].speed) * 60);
  check('peak deceleration as a boost fades', maxDec, 0, 24, 'm/s^2', '(no cliff)');

  // braking + coasting
  rig = newRig(); k = rig.addKart(kartOpts({ s: 50, speed: top }));
  const sbr = rig.run(4, () => { k.input.brake = 1; }, { every: 1 / 60 });
  const stopAt = sbr.find((r) => r.speed <= 0.1);
  info('brake 100 km/h -> 0', (() => { rig = newRig(); k = rig.addKart(kartOpts({ s: 50, speed: 100 / 3.6 })); const q = rig.run(4, () => { k.input.brake = 1; }, { every: 1 / 60 }); const z = q.find((r) => r.speed <= 0.1); return z ? `${z.t.toFixed(2)} s` : '>4 s'; })());
  check('brake top speed -> stop', stopAt ? stopAt.t : 99, 0.8, 1.8, 's');
  rig = newRig(); k = rig.addKart(kartOpts({ s: 50, speed: top }));
  const sc = rig.run(6, () => {}, { every: 1 / 60 });
  info('coast: top speed -> half speed', (sc.find((r) => r.speed <= top / 2)?.t ?? 99), 's');

  // reverse
  rig = newRig(); k = rig.addKart(kartOpts({ s: 50 }));
  const sr = rig.run(4, () => { k.input.brake = 1; }, { every: 1 / 60 });
  info('reverse speed after 4 s', sr.at(-1).kmh, 'km/h');
}

function steering() {
  section('Steering  (full lock, speed pinned)');
  const r10 = steadyTurn(10), r20 = steadyTurn(20);
  info('turn radius @ 10 m/s', r10.radius, 'm');
  check('turn radius @ 20 m/s', r20.radius, 12, 16, 'm');
  const k0 = newRig().addKart(kartOpts({ s: 10 }));
  const rt = steadyTurn(k0.stats.topSpeed);
  check('turn radius @ top speed (pinned)', rt.radius, 22, 32, 'm');
  const free = steadyTurn(k0.stats.topSpeed, -1, { unpinned: true, seconds: 9, settle: 6 });
  info('free full-lock turn: equilibrium speed', `${(free.speed * 3.6).toFixed(0)} km/h (${(free.speed / k0.stats.topSpeed * 100).toFixed(0)} % of top)  radius ${free.radius.toFixed(1)} m`);
  info('slip angle (chassis vs velocity) @ 20 m/s', r20.slipDeg, 'deg');
  // analog: half stick gives about half the yaw rate
  const half = steadyTurn(20, -0.5);
  check('half stick -> yaw-rate ratio', half.yawRate / r20.yawRate, 0.4, 0.6, '');
  // low speed pivot
  const lo = steadyTurn(3, -1, { seconds: 5, settle: 2 });
  info('turn radius @ 3 m/s (parking-lot)', lo.radius, 'm');
  // slalom like a keyboard player: lane changes every 1.1 s, pursuit chooses left / none / right, the real Input ramp shapes it
  {
    const rig = newRig(DEFS.walls);
    const k = rig.addKart(kartOpts({ s: 150, speed: 28 }));
    const inp = new Input();
    let walls = 0; rig.events.on(EV.WALL_HIT, () => walls++);
    let maxLat = 0, minSpeed = 99, prev = 0;
    const pt = new (k.position.constructor)();
    rig.run(16, (t) => {
      const lane = Math.floor(t / 1.1) % 2 ? -3.2 : 3.2;
      rig.track.pointAt(k.query.s + 9 + k.speed * 0.4, lane, pt);
      const err = angleDiff(Math.atan2(pt.x - k.position.x, pt.z - k.position.z), k.heading);
      const target = err > 0.07 ? -1 : err < -0.07 ? 1 : 0;          // + err = target is to the left = steer left (-1)
      inp.speedRatio = k.speed / k.stats.topSpeed;
      prev = inp._rampSteer(prev, target, 1 / 60);
      k.input.throttle = 1; k.input.steer = prev;
      if (t > 3) { maxLat = Math.max(maxLat, Math.abs(k.query.lateral)); minSpeed = Math.min(minSpeed, k.speed); }
    });
    info('slalom (+-3.2 m lanes every 1.1 s, keyboard ramp): max lateral / min speed / wall hits', `${maxLat.toFixed(1)} m / ${(minSpeed * 3.6).toFixed(0)} km/h / ${walls}`);
    check('slalom reaches the lanes without leaving the road', maxLat, 2.5, 6.5, 'm');
    check('slalom keeps most of its speed', minSpeed / k.stats.topSpeed, 0.78, 1.1, '');
    check('slalom never touches a wall', walls, 0, 0, '');
  }
  // planning helper: maxCornerSpeed(kart, curvature) must agree with what full lock actually achieves
  for (const R of [14, 20, 25]) {
    const rig = newRig(); const k = rig.addKart(kartOpts({ s: 10 }));
    const v = rig.physics.maxCornerSpeed(k, 1 / R);
    const t = steadyTurn(Math.min(v, k.stats.topSpeed), -1);
    info(`maxCornerSpeed for R=${R} m -> ${(v * 3.6).toFixed(0)} km/h; full-lock radius at that speed`, `${t.radius.toFixed(1)} m`);
    check(`maxCornerSpeed(R=${R}) matches the achieved radius`, t.radius / R, 0.9, 1.03, 'x');
  }
}

function drift() {
  section('Drift');
  // -- charge timeline + chassis angle (neutral steering inside the drift)
  let rig = newRig();
  let k = rig.addKart(kartOpts({ s: 60, speed: 28 }));
  const levelAt = {};
  rig.events.on(EV.DRIFT_LEVEL, ({ level }) => { levelAt[level] = rig.session.time; });
  let startT = null;
  rig.events.on(EV.DRIFT_START, () => { startT = rig.session.time; });
  const s = rig.run(4.2, (t) => { k.input.throttle = 1; k.input.drift = true; k.input.steer = t < 0.3 ? -1 : -0.35; }, { every: 1 / 60, pin: (kk) => { kk.speed = Math.max(kk.speed, 28 * 0.97); } });
  const mt = k.stats.miniTurbo;
  const tl = [1, 2, 3].map((l) => (levelAt[l] ?? NaN) - (startT ?? 0));
  info('mini-turbo multiplier (stats)', mt);
  info('charge timeline (blue / orange / pink)', tl.map((t) => t.toFixed(2)).join(' / '), 's');
  check('blue mini-turbo after', tl[0], 0.6, 1.2, 's');
  check('orange mini-turbo after', tl[1], 1.2, 2.2, 's');
  check('pink mini-turbo after', tl[2], 2.0, 3.4, 's');
  const mid = s.find((r) => r.t >= 1.5);
  check('chassis angle vs travel (committed drift)', Math.abs(wrap(mid.yaw - mid.moveYaw)) / D2R, 18, 45, 'deg');

  // -- radius control: inside / neutral / outside steering at 28 m/s
  const rad = {};
  for (const [name, steer] of [['inside', -1], ['neutral', -0.3], ['outside', 0.9]]) {
    rig = newRig(); k = rig.addKart(kartOpts({ s: 60, speed: 28 }));
    const ss = rig.run(5, (t) => { k.input.throttle = 1; k.input.drift = true; k.input.steer = t < 0.3 ? -1 : steer; }, { every: 1 / 60, pin: (kk) => { kk.speed = 28; } });
    let tot = 0, n = 0; for (let i = 1; i < ss.length; i++) if (ss[i].t >= 2) { tot += wrap(ss[i].moveYaw - ss[i - 1].moveYaw); n++; }
    rad[name] = 28 / (Math.abs(tot) / (n / 60));
  }
  info('drift radius inside / neutral / outside @ 28 m/s', `${rad.inside.toFixed(1)} / ${rad.neutral.toFixed(1)} / ${rad.outside.toFixed(1)}`, 'm');
  check('drift can be tightened (inside < neutral)', rad.neutral / rad.inside, 1.15, 2.2, 'x');
  check('drift can be widened (outside > neutral)', rad.outside / rad.neutral, 1.25, 6, 'x');
  const plain = steadyTurn(28, -1);
  info('plain full-lock radius @ 28 m/s', plain.radius, 'm');

  // -- release boost per level + continuity of the heading at release
  for (const [lvl, hold] of [[1, 1.3], [2, 2.2], [3, 3.4]]) {
    rig = newRig(); k = rig.addKart(kartOpts({ s: 60, speed: k.stats.topSpeed * 0.95 }));
    let released = false, pre = 0, maxStep = 0, boostSeen = 0, prevYaw = null, evLevel = 0;
    rig.events.on(EV.DRIFT_BOOST, ({ level }) => { evLevel = level; });
    const ss = rig.run(hold + 2.6, (t) => {
      k.input.throttle = 1;
      k.input.steer = t < 0.3 ? -1 : -0.4;
      k.input.drift = t < hold;
      if (!released && t >= hold) { released = true; pre = k.speed; }
    }, { every: 1 / 60 });
    for (const r of ss) { if (prevYaw !== null && r.t > hold - 0.05) maxStep = Math.max(maxStep, Math.abs(wrap(r.yaw - prevYaw))); prevYaw = r.yaw; }
    const peak = Math.max(...ss.filter((r) => r.t > hold).map((r) => r.speed));
    boostSeen = (peak / pre - 1) * 100;
    check(`level ${lvl}: mini-turbo fired`, evLevel, lvl, lvl, '', `(+${boostSeen.toFixed(0)} % over pre-release speed ${(pre * 3.6).toFixed(0)} km/h)`);
    if (lvl === 2) check('heading continuity at release (max yaw step / frame)', maxStep / D2R, 0, 6, 'deg');
  }
  // -- drift is only entered with speed and while steering
  rig = newRig(); k = rig.addKart(kartOpts({ s: 60, speed: 3 }));
  rig.run(1, () => { k.input.throttle = 0.2; k.input.drift = true; k.input.steer = -1; });
  check('no drift at walking pace', k.drift.dir, 0, 0, '');
  // -- drift on a banked + curvy real track: the bot completes a lap while drifting
}

function offroad() {
  section('Surfaces');
  // top speed held on the grass shoulder (shoulder surface = grass; road half width 8 m): displace the kart past the curb
  for (const [driver, body] of [[DRIVER, BODY], ['bruno', 'crusher'], ['quill', 'classic']]) {
    const rig = newRig(DEFS.strip);
    const k = rig.addKart({ driver, body, s: 100, lateral: 0 });
    const top = k.stats.topSpeed; k.speed = top;
    k.position.copy(rig.track.pointAt(100, 9.5, k.position.clone())); k.hint = -1; rig.track.project(k.position, k.query, -1);
    const s = rig.run(5, () => { k.input.throttle = 1; k.input.steer = Math.abs(k.query.lateral) > 11 ? Math.sign(k.query.lateral) * 0.3 : 0; }, { every: 1 / 60 });
    const late = s.filter((r) => r.t > 3);
    const sp = late.reduce((a, r) => a + r.speed, 0) / late.length;
    if (driver === DRIVER) check('grass: speed as a fraction of top speed', sp / top, 0.5, 0.64, '', `(${driver}+${body}, surface ${s.at(-1).surface})`);
    else info(`grass: speed fraction  ${driver}+${body}`, sp / top);
  }
  // transition feel: entering grass at top speed
  {
    const rig = newRig(DEFS.strip);
    const k = rig.addKart(kartOpts({ s: 100 }));
    const top = k.stats.topSpeed; k.speed = top;
    const p = rig.track.pointAt(100, 9.5, k.position.clone()); k.position.copy(p); k.hint = -1; rig.track.project(k.position, k.query, -1);
    const s = rig.run(3, () => { k.input.throttle = 1; }, { every: 1 / 60 });
    let maxDec = 0; for (let i = 1; i < s.length; i++) maxDec = Math.max(maxDec, (s[i - 1].speed - s[i].speed) * 60);
    check('peak deceleration entering grass at top speed', maxDec, 0, 28, 'm/s^2');
    const tRec = s.find((r) => r.speed < top * 0.62)?.t;
    info('time until speed < 62 % of top on grass', tRec ?? '>3', 's');
  }
  // ice: slidey but controllable
  {
    const road = steadyTurn(20, -1);
    const ice = steadyTurn(20, -1, { def: DEFS.ice, seconds: 6, settle: 2.5 });
    check('ice: turn radius vs tarmac', ice.radius / road.radius, 1.8, 6, 'x', `(surface ${ice.rig.session.karts[0].surface === Surface.ICE ? 'ice' : ice.rig.session.karts[0].surface})`);
    check('ice: slip angle (slidey but bounded)', Math.abs(ice.slipDeg), 12, 55, 'deg');
    // still controllable: a pursuit autopilot keeps the kart on a 16 m road across a long ice patch
    const k2 = newRig(DEFS.strip); const kk = k2.addKart(kartOpts({ s: 560, speed: 25 }));      // ice zone s 600..900
    let worst = 0, onIce = 0;
    k2.run(9, () => { kk.input.throttle = 1; const q = kk.query; const err = angleDiff(k2.track.sampleAt(q.s + 14).yaw, kk.heading); kk.input.steer = clampN(-err * 2.2 - q.lateral * 0.04, -1, 1); worst = Math.max(worst, Math.abs(q.lateral)); if (q.surface === Surface.ICE) onIce++; }, { every: 0.1 });
    info('ice patch: frames on ice / worst lateral', `${onIce} / ${worst.toFixed(1)} m`);
    check('ice: an autopilot keeps the kart on the 16 m road', worst, 0, 8.5, 'm');
  }
}
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

function walls() {
  section('Walls  (~30 m/s along a 16 m road, walls at +-14 m, tarmac shoulder so only the wall acts)');
  const results = {};
  for (const deg of [8, 15, 30, 60, 90]) {
    const rig = newRig(DEFS.walls);
    const k = rig.addKart(kartOpts({ s: 300, lateral: 4, speed: 30 }));
    aim(k, rig.track, -deg * D2R);                      // yaw decreases -> turn right, toward the right wall
    k.speed = 30; k.hint = -1;
    let hit = 0, scrape = 0;
    rig.events.on(EV.WALL_HIT, () => { hit++; });
    rig.events.on(EV.WALL_SCRAPE, ({ active }) => { if (active) scrape++; });
    const s = rig.run(5.0, () => { k.input.throttle = 1; }, { every: 1 / 60 });
    const iHit = s.findIndex((r) => r.lateral > 12.6);
    const c = s[Math.max(0, iHit)];
    const after = s.find((r) => r.t >= c.t + 0.6) ?? s.at(-1);
    const ratio = after.speed / c.speed;
    const yawRel = wrap(after.yaw - rig.track.sampleAt(after.s).yaw) / D2R;
    results[deg] = { ratio, hit, scrape, yawRel, lat: Math.max(...s.map((r) => r.lateral)), contactSpeed: c.speed };
    info(`${String(deg).padStart(2)} deg: speed 0.6 s after contact (vs at contact ${(c.speed * 3.6).toFixed(0)} km/h), events, yaw vs road`, `${(after.speed * 3.6).toFixed(0)} km/h (${(ratio * 100).toFixed(0)} %)  hit=${hit} scrape=${scrape}  yaw ${yawRel.toFixed(1)} deg  max lateral ${results[deg].lat.toFixed(2)}`);
  }
  check('shallow scrape (8 deg) keeps most speed', results[8].ratio * 100, 82, 105, '%');
  check('15 deg scrape keeps speed', results[15].ratio * 100, 70, 105, '%');
  check('30 deg hit still carries momentum', results[30].ratio * 100, 35, 90, '%');
  check('head-on (90 deg) costs real speed', results[90].ratio * 100, -15, 30, '%');
  check('shallow scrape swings the nose along the wall (|yaw|)', Math.abs(results[8].yawRel), 0, 7, 'deg');
  check('no pinball: never leaves the corridor (90 deg)', results[90].lat, -10, 13.2, 'm');
  // sticky-wall test: hold the stick into the wall for 4 s, speed must stay high while scraping along it
  {
    const rig = newRig(DEFS.walls);
    const k = rig.addKart(kartOpts({ s: 300, lateral: 12, speed: 30 }));
    const s = rig.run(4, () => { k.input.throttle = 1; k.input.steer = 0.6; }, { every: 0.1 });
    info('pressing into the wall for 4 s: speed at 4 s', `${(s.at(-1).speed * 3.6).toFixed(0)} km/h, yaw vs road ${(wrap(s.at(-1).yaw - rig.track.sampleAt(s.at(-1).s).yaw) / D2R).toFixed(1)} deg`);
    check('not glued to the wall (speed after 4 s of leaning on it)', s.at(-1).speed * 3.6, 70, 200, 'km/h');
  }
}

function start() {
  section('Start: rocket start window, burnout, late start (distance 3 s after GO)');
  const run = (pressAt) => {
    const rig = newRig(DEFS.strip);
    rig.addKart(kartOpts({ s: 100 }));
    const k = rig.session.karts[0];
    const race = rig.startRace();
    let boost = 0, burn = 0; rig.events.on(EV.START_BOOST, () => boost++); rig.events.on(EV.START_BURNOUT, () => burn++);
    let t = 0, s0 = null, goAt = null;
    while (t < 8) {
      k.input.throttle = pressAt !== null && t >= pressAt ? 1 : 0;
      rig.step(1 / 60); t += 1 / 60;
      if (race.phase === 'racing' && goAt === null) { goAt = t; s0 = k.race.distance; }
      if (goAt !== null && t - goAt >= 3) break;
    }
    return { dist: k.race.distance - s0, boost, burn, kmh: k.speed * 3.6 };
  };
  const perfect = run(2.65), okEarly = run(2.2), burnout = run(0.2), late = run(3.3), never = run(null);
  info('press 0.35 s before GO (rocket start)', `${perfect.dist.toFixed(1)} m, boost ${perfect.boost}, burnout ${perfect.burn}`);
  info('press 0.8 s before GO (too early to boost, no burnout)', `${okEarly.dist.toFixed(1)} m, boost ${okEarly.boost}, burnout ${okEarly.burn}`);
  info('hold from 2.8 s before GO (burnout)', `${burnout.dist.toFixed(1)} m, boost ${burnout.boost}, burnout ${burnout.burn}`);
  info('press 0.3 s after GO', `${late.dist.toFixed(1)} m`);
  check('rocket start fires its boost', perfect.boost, 1, 1, '');
  check('rocket start gains distance over a late start', perfect.dist - late.dist, 14, 32, 'm');
  check('rocket start gains distance over a well-timed normal start', perfect.dist - okEarly.dist, 8, 24, 'm');
  check('0.8 s early: neither boost nor burnout', okEarly.boost + okEarly.burn, 0, 0, '');
  check('burnout fires', burnout.burn, 1, 1, '');
  check('burnout costs distance versus a late start (but is still moving)', late.dist - burnout.dist, 3, 40, 'm');
  check('burnout is steerable wheelspin, not a stall (speed 3 s after GO)', burnout.kmh, 40, 200, 'km/h');
}

function karts() {
  section('Kart vs kart');
  // head-on-ish rear end: fast kart catches a slower one
  const mk = (a, b, speeds, gap = 6, lateral = [0, 0], yawB = 0) => {
    const rig = newRig();
    const A = rig.addKart({ ...a, s: 200, lateral: lateral[0], speed: speeds[0], player: true });
    const B = rig.addKart({ ...b, s: 200 + gap, lateral: lateral[1], speed: speeds[1], yawOffset: yawB });
    return { rig, A, B };
  };
  {
    const { rig, A, B } = mk({ driver: 'bruno', body: 'crusher' }, { driver: 'quill', body: 'classic' }, [30, 18]);
    let bump = 0, impact = 0; rig.events.on(EV.BUMP, (e) => { bump++; impact = Math.max(impact, e.impact); });
    let minSep = 99;
    const s = rig.run(3, () => { A.input.throttle = 1; B.input.throttle = 0.5; }, { every: 1 / 60 });
    for (let i = 0; i < 1; i++) minSep = Math.min(minSep, 99);
    info('rear-end: heavy (Bruno/Crusher) into light (Quill) : speeds after 3 s', `heavy ${(A.speed * 3.6).toFixed(0)} km/h, light ${(B.speed * 3.6).toFixed(0)} km/h, bumps ${bump}, impact ${impact.toFixed(1)}`);
    const d = Math.hypot(B.position.x - A.position.x, B.position.z - A.position.z);
    check('karts never overlap after contact (distance / (r1+r2))', d / (A.radius + B.radius), 0.97, 99, '');
    check('heavy kart keeps more speed than the light one', A.speed - B.speed, -5, 99, 'm/s');
  }
  {
    // symmetric head-on: equal masses, opposite directions
    const rig = newRig();
    const A = rig.addKart({ driver: 'pip', body: 'classic', s: 400, speed: 25, player: true });
    const B = rig.addKart({ driver: 'rusty', body: 'classic', s: 440, speed: 25, yawOffset: Math.PI });
    let bump = 0; rig.events.on(EV.BUMP, () => bump++);
    rig.run(2.5, () => { A.input.throttle = 1; B.input.throttle = 1; }, { every: 1 / 60 });
    info('head-on equal masses: speeds after 2.5 s', `${(A.speed * 3.6).toFixed(0)} / ${(B.speed * 3.6).toFixed(0)} km/h bumps ${bump}`);
    check('head-on: a handful of bumps, no chatter', bump, 1, 5, '');
  }
  {
    // side by side pushing: no jitter (energy shouldn't explode)
    const rig = newRig();
    const A = rig.addKart({ driver: 'pip', body: 'classic', s: 400, lateral: -0.9, speed: 30, player: true });
    const B = rig.addKart({ driver: 'rocco', body: 'crusher', s: 400, lateral: 0.9, speed: 30 });
    let bump = 0; rig.events.on(EV.BUMP, () => bump++);
    const s = rig.run(4, () => { A.input.throttle = 1; B.input.throttle = 1; A.input.steer = 0.15; B.input.steer = -0.15; }, { every: 1 / 60 });
    let jit = 0; for (let i = 2; i < s.length; i++) jit = Math.max(jit, Math.abs(s[i].lateral - 2 * s[i - 1].lateral + s[i - 2].lateral));
    info('side by side shoving (4 s): bumps', bump);
    check('no jitter (max second difference of lateral pos)', jit, 0, 0.12, 'm');
  }
  {
    // invincible kart barges through a normal one: a LIGHT invincible kart rear-ends a HEAVY slow one
    const rig = newRig();
    const A = rig.addKart({ driver: 'quill', body: 'classic', s: 400, speed: 33, player: true });
    const B = rig.addKart({ driver: 'bruno', body: 'crusher', s: 412, speed: 12 });
    A.invincible = 5;
    let rams = 0; rig.events.on(EV.BUMP, (e) => { if (e.ram === A) rams++; });
    rig.run(0.6, () => { A.input.throttle = 1; B.input.throttle = 0; }, { every: 1 / 60 });
    const vA = A.speed;
    info('invincible light kart (33 m/s) rams heavy kart (12 m/s): speeds after 0.6 s', `${(A.speed * 3.6).toFixed(0)} / ${(B.speed * 3.6).toFixed(0)} km/h  ram events ${rams}`);
    check('ram event reports the invincible kart', rams, 1, 3, '');
    check('invincible kart keeps most of its speed through the hit', vA / 33, 0.85, 1.1, '');
    const rig2 = newRig();
    const A2 = rig2.addKart({ driver: 'quill', body: 'classic', s: 400, speed: 33, player: true });
    const B2 = rig2.addKart({ driver: 'bruno', body: 'crusher', s: 412, speed: 12 });
    rig2.run(0.6, () => { A2.input.throttle = 1; B2.input.throttle = 0; }, { every: 1 / 60 });
    check('without invincibility the light kart loses much more speed', (vA - A2.speed) / 33, 0.05, 1, '');
  }
  {
    // shrunk karts get bullied
    const mkPair = (shrunk) => {
      const rig = newRig();
      const A = rig.addKart({ driver: 'pip', body: 'classic', s: 400, speed: 30, player: true });
      const B = rig.addKart({ driver: 'pip', body: 'classic', s: 410, speed: 14 });
      if (shrunk) { B.shrink = 5; B.scale = 0.55; }
      rig.run(0.8, () => { A.input.throttle = 1; B.input.throttle = 0; }, { every: 1 / 60 });
      return { A, B };
    };
    const n = mkPair(false), sh = mkPair(true);
    info('rear-ending a normal vs a shrunk kart: speed gained by the victim', `${(n.B.speed - 14).toFixed(1)} vs ${(sh.B.speed - 14).toFixed(1)} m/s`);
    check('shrunk kart is shoved harder', (sh.B.speed - 14) - (n.B.speed - 14), 0.5, 99, 'm/s');
  }
  {
    // 12 karts piled on one spot: must separate without NaN
    const rig = newRig();
    for (let i = 0; i < 12; i++) rig.addKart({ driver: DRIVERS[i % 8].id, body: KART_BODIES[i % 4].id, s: 300, lateral: (i % 3 - 1) * 0.05, speed: 0, player: i === 0 });
    const s = rig.run(4, () => { for (const k of rig.session.karts) k.input.throttle = 1; }, { every: 1 / 60, watch: rig.session.karts[0] });
    const finite = rig.session.karts.every((k) => Number.isFinite(k.position.x + k.speed));
    let overlap = 0; const ks = rig.session.karts;
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (Math.hypot(ks[i].position.x - ks[j].position.x, ks[i].position.z - ks[j].position.z) < 1.0) overlap++;
    check('12 stacked karts separate, all finite', finite && overlap === 0 ? 1 : 0, 1, 1, '', `(overlapping pairs ${overlap})`);
  }
}

function spinAndAir() {
  section('Spin-out, launch, air, respawn');
  {
    const rig = newRig();
    const k = rig.addKart(kartOpts({ s: 200, speed: 30 }));
    let recovered = null, maxAng = 0, yawStepMax = 0;
    rig.events.on(EV.RECOVER, () => { recovered = rig.session.time; });
    let prev = k.yaw;
    const s = rig.run(1.5, (t) => { k.input.throttle = 1; if (t === 0) { const ok = k.spinOut(1.3, 'test'); if (!ok) throw new Error('spinOut blocked'); } }, { every: 1 / 60 });
    for (const r of s) { maxAng = Math.max(maxAng, Math.abs(r.yaw - r.heading)); yawStepMax = Math.max(yawStepMax, Math.abs(wrap(r.yaw - prev))); prev = r.yaw; }
    check('spin-out rotates about two full turns', maxAng / (2 * Math.PI), 1.7, 2.1, 'turns');
    check('control returns after the spin', recovered ?? 99, 1.2, 1.5, 's');
    // the kart is back under control now (spin 1.3 s) but still inside the grace window: a second hit must be ignored
    const blocked = !k.spinOut(1.3, 'again');
    check('chain-hit is blocked while recovering', blocked ? 1 : 0, 1, 1, '', `(blockReason "${k.blockReason}")`);
    const rig2 = newRig(); const k2 = rig2.addKart(kartOpts({ s: 200, speed: 30 }));
    k2.spinOut(1.0, 'x');
    rig2.run(2.4, () => { k2.input.throttle = 1; });
    check('...but hits land again once the grace is over', k2.spinOut(1.0, 'y') ? 1 : 0, 1, 1, '');
    check('max yaw step per frame while spinning', yawStepMax / D2R, 0, 40, 'deg');
  }
  {
    // ramp at s=1400 (length 14, height 3.2)
    const rig = newRig(DEFS.strip);
    const k = rig.addKart(kartOpts({ s: 1340, speed: 30 }));
    let jump = null, land = null;
    rig.events.on(EV.JUMP, () => { jump = rig.session.time; }); rig.events.on(EV.LAND, (e) => { land = { t: rig.session.time, impact: e.impact }; });
    const s = rig.run(5, () => { k.input.throttle = 1; }, { every: 1 / 60 });
    const ground0 = s[0].y;
    const peak = Math.max(...s.map((r) => r.y)) - ground0;
    info('ramp: jump / land / flight time / peak height / landing impact', jump && land ? `${jump.toFixed(2)} s / ${land.t.toFixed(2)} s / ${(land.t - jump).toFixed(2)} s / ${peak.toFixed(2)} m / ${land.impact.toFixed(1)} m/s` : 'no jump?');
    check('ramp launches the kart', jump && land ? land.t - jump : 0, 0.5, 1.6, 's');
    check('landing keeps the kart on the road (|lateral|)', Math.abs(s.at(-1).lateral), 0, 3, 'm');
    // landing trick: hold drift through the jump
    const rig2 = newRig(DEFS.strip);
    const k2 = rig2.addKart(kartOpts({ s: 1340, speed: 30 }));
    let trick = 0; rig2.events.on(EV.BOOST, (e) => { if (e.source === 'trick') trick++; });
    rig2.run(5, () => { k2.input.throttle = 1; k2.input.drift = true; });
    info('landing trick boosts (holding drift through the jump)', trick);
    check('landing trick fires exactly once', trick, 1, 1, '');
  }
  {
    // hop + landing keeps control; no JUMP/LAND spam on flat road
    const rig = newRig();
    const k = rig.addKart(kartOpts({ s: 200, speed: 28 }));
    const s = rig.run(1.2, (t) => { k.input.throttle = 1; k.input.drift = t < 0.4; k.input.steer = 0; }, { every: 1 / 60 });
    const maxY = Math.max(...s.map((r) => r.y)) - s[0].y;
    check('hop height', maxY, 0.2, 0.9, 'm');
    check('hop does not eat speed', s.at(-1).speed / 28, 0.93, 1.2, '');
  }
  {
    // open edge -> fall -> rescue
    const rig = newRig(DEFS.edge);
    const k = rig.addKart(kartOpts({ s: 600, lateral: 4, speed: 25 }));
    aim(k, rig.track, -35 * D2R); k.speed = 25;
    let tResp = null, tDone = null, from = null;
    rig.events.on(EV.RESPAWN, () => { tResp = rig.session.time; from = k.query.s; });
    rig.events.on(EV.RESPAWN_DONE, () => { tDone = rig.session.time; });
    const s = rig.run(9, () => { k.input.throttle = 1; }, { every: 1 / 60 });
    info('fall: respawn at / done at / duration', tResp && tDone ? `${tResp.toFixed(2)} s / ${tDone.toFixed(2)} s / ${(tDone - tResp).toFixed(2)} s` : 'no respawn?');
    check('fall triggers a rescue', tResp ? 1 : 0, 1, 1, '');
    check('rescue duration', tDone && tResp ? tDone - tResp : 0, 1.6, 1.8, 's');
    const after = s.at(-1);
    check('after the rescue the kart is on the road again', Math.abs(after.lateral), 0, 8, 'm', `(finite ${after.finite})`);
    check('rescued kart is protected for a while', k.grace >= 0 ? 1 : 0, 1, 1, '');
  }
}

function slipstream() {
  section('Slipstream');
  const run = (withLeader) => {
    const rig = newRig();
    const A = rig.addKart(kartOpts({ s: 100, speed: 33, player: true }));
    const B = withLeader ? rig.addKart({ driver: 'pip', body: 'classic', s: 109, speed: 33 }) : null;
    let active = 0, bumps = 0; rig.events.on(EV.DRAFT, (e) => { if (e.kart === A && e.active) active++; }); rig.events.on(EV.BUMP, () => bumps++);
    const top = A.stats.topSpeed;
    let peak = 0;
    rig.run(4, () => { A.input.throttle = 1; if (B) { B.input.throttle = 1; B.speed = top; } peak = Math.max(peak, A.speed); }, { every: 1 / 60 });
    return { speed: A.speed, peak, active, bonus: A.draft.bonus, bumps, top };
  };
  const a = run(true), b = run(false);
  info('speed after 4 s drafting vs alone', `${(a.speed * 3.6).toFixed(1)} vs ${(b.speed * 3.6).toFixed(1)} km/h  (collisions ${a.bumps})`);
  check('slipstream gain over the leader at full tuck', (a.peak / a.top - 1) * 100, 3, 7, '%');
  check('EV.DRAFT fired once', a.active, 1, 1, '');
  check('no draft bonus when alone', b.bonus, 0, 0, '');
}

function frameRate() {
  section('Frame-rate independence');
  const out = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const rig = newRig();
    const k = rig.addKart(kartOpts({ s: 200 }));
    rig.run(9, (t) => {
      k.input.throttle = 1;
      k.input.steer = t < 2.5 ? 0 : t < 3.5 ? -1 : t < 4 ? 0 : t < 4.5 ? 0.6 : 0;
      k.input.drift = t >= 5 && t < 7.5;
      if (t >= 5 && t < 7.5) k.input.steer = t < 5.5 ? -1 : -0.35;
      if (t >= 7.5) k.input.steer = 0.5;
    }, { dt });
    out.push({ dt, x: k.position.x, z: k.position.z, yaw: k.yaw, speed: k.speed });
  }
  for (const o of out) info(`dt=1/${Math.round(1 / o.dt)}`, `x ${o.x.toFixed(2)} z ${o.z.toFixed(2)} yaw ${o.yaw.toFixed(3)} speed ${o.speed.toFixed(2)}`);
  const ref = out[1];
  const dist = (o) => Math.hypot(o.x - ref.x, o.z - ref.z);
  check('position drift 30 fps vs 60 fps after 9 s of mixed driving', dist(out[0]), 0, 0.6, 'm');
  check('position drift 144 fps vs 60 fps', dist(out[2]), 0, 0.6, 'm');
  check('speed difference 144 vs 60 fps', Math.abs(out[2].speed - ref.speed), 0, 0.15, 'm/s');
}

function rosterTable() {
  section('Roster spread (class ' + CLASS + ')');
  const combos = [['pip', 'classic'], ['bruno', 'crusher'], ['rocco', 'crusher'], ['quill', 'classic'], ['hopper', 'hopper'], ['luna', 'streak'], ['gizmo', 'classic'], ['rusty', 'streak']];
  console.log('  ' + ['combo'.padEnd(18), 'top km/h', '0-100 s', 'r@20 m', 'r@top m', 'blue s', 'mass', 'grass %'].join('  '));
  for (const [driver, body] of combos) {
    const rig = newRig(); const k = rig.addKart({ driver, body, s: 50 });
    const s = rig.run(10, () => { k.input.throttle = 1; }, { every: 1 / 60 });
    const t100 = s.find((r) => r.speed >= 100 / 3.6)?.t ?? NaN;
    const top = k.stats.topSpeed;
    const tr20 = (() => { const rg = newRig(); const kk = rg.addKart({ driver, body, s: 60, speed: 20 }); const ss = rg.run(6, () => { kk.input.throttle = 1; kk.input.steer = -1; }, { every: 1 / 60, pin: (x) => { x.speed = 20; } }); let tot = 0, n = 0; for (let i = 1; i < ss.length; i++) if (ss[i].t >= 2) { tot += wrap(ss[i].moveYaw - ss[i - 1].moveYaw); n++; } return 20 / (Math.abs(tot) / (n / 60)); })();
    const trt = (() => { const rg = newRig(); const kk = rg.addKart({ driver, body, s: 60, speed: top }); const ss = rg.run(6, () => { kk.input.throttle = 1; kk.input.steer = -1; }, { every: 1 / 60, pin: (x) => { x.speed = top; } }); let tot = 0, n = 0; for (let i = 1; i < ss.length; i++) if (ss[i].t >= 2) { tot += wrap(ss[i].moveYaw - ss[i - 1].moveYaw); n++; } return top / (Math.abs(tot) / (n / 60)); })();
    const blue = DRIFT_LEVEL_TIME[0] / k.stats.miniTurbo / 0.9;
    const grass = (() => { const rg = newRig(DEFS.strip); const kk = rg.addKart({ driver, body, s: 100 }); kk.speed = top; const p = rg.track.pointAt(100, 9.5, kk.position.clone()); kk.position.copy(p); kk.hint = -1; rg.track.project(kk.position, kk.query, -1); const ss = rg.run(5, () => { kk.input.throttle = 1; }, { every: 1 / 60 }); const a = ss.filter((r) => r.t > 3); return a.reduce((x, r) => x + r.speed, 0) / a.length / top * 100; })();
    console.log('  ' + [`${driver}+${body}`.padEnd(18), (top * 3.6).toFixed(0).padStart(8), t100.toFixed(2).padStart(7), tr20.toFixed(1).padStart(6), trt.toFixed(1).padStart(7), blue.toFixed(2).padStart(6), k.stats.mass.toFixed(2).padStart(4), grass.toFixed(0).padStart(7)].join('  '));
  }
}

function lapValue() {
  section('Value of drifting (solo laps, lookahead bot: no drift / one drift per corner / chained mini-turbos)');
  const res = {};
  for (const [name, def] of [['sweepers (R 90 m)', DEFS.sweepers], ['hairpins (R 45 m)', DEFS.hairpins], ['Sunny Meadows (baseline)', DEFS.meadows]]) {
    const plain = soloLap(def, { driver: DRIVER, body: BODY, speedClass: CLASS, drift: false });
    const one = soloLap(def, { driver: DRIVER, body: BODY, speedClass: CLASS, drift: true });
    const chain = soloLap(def, { driver: DRIVER, body: BODY, speedClass: CLASS, drift: true, botOpts: { chainLevel: 2 } });
    const g1 = (1 - one.time / plain.time) * 100, g2 = (1 - chain.time / plain.time) * 100;
    res[name] = { g1, g2 };
    info(`${name}: none ${plain.time.toFixed(2)} s | one ${one.time.toFixed(2)} s (${g1.toFixed(1)} %) | chained ${chain.time.toFixed(2)} s (${g2.toFixed(1)} %)`, `drifts ${chain.counts['kart:driftStart'] ?? 0}, boosts ${chain.counts['kart:driftBoost'] ?? 0}, wall hits ${chain.counts['kart:wallHit'] ?? 0}`);
  }
  check('chained mini-turbos clearly beat never drifting (sweepers)', res['sweepers (R 90 m)'].g2, 2, 10, '%');
  check('chained mini-turbos beat never drifting (hairpins, 2 corners per lap)', res['hairpins (R 45 m)'].g2, 1.5, 12, '%');
  check('a single drift per corner is never a loss (sweepers)', res['sweepers (R 90 m)'].g1, -0.5, 10, '%');
}

function abuse() {
  section('Abuse / robustness');
  {
    const rig = newRig(DEFS.strip);
    const ks = [];
    for (let i = 0; i < 12; i++) ks.push(rig.addKart({ driver: DRIVERS[i % 8].id, body: KART_BODIES[i % 4].id, s: 300 + (i % 3), lateral: (i % 4 - 1.5) * 1.5, speed: 10 + i * 2, player: i === 0 }));
    let bad = 0;
    for (let i = 0; i < 60 * 60; i++) {
      for (const k of ks) { k.input.throttle = 1; k.input.steer = Math.sin(i * 0.013 * (k.id + 1)) > 0 ? 1 : -1; k.input.drift = (i + k.id * 7) % 200 < 120; k.input.brake = (i + k.id * 13) % 400 < 20 ? 1 : 0; }
      if (i % 500 === 250) { const k = ks[(i / 500) | 0 % 12]; const t = rig.track.getRespawn(rig.track.length * ((i * 7919) % 1000) / 1000, 3); k.placeAt(t.position, t.yaw + 1.3, 20); }
      rig.step(1 / 60);
      for (const k of ks) if (!Number.isFinite(k.position.x + k.position.y + k.position.z + k.speed + k.yaw + k.slide)) bad++;
    }
    check('12 karts, 60 s of abuse (full lock, drift spam, teleports, brake taps): non-finite states', bad, 0, 0, '');
    info('events', Object.entries(rig.counts).map(([k, v]) => `${k.split(':')[1]}=${v}`).join(' '));
  }
  {
    const rig = newRig(DEFS.strip);
    const k = rig.addKart(kartOpts({ s: 300, speed: 30 }));
    let bad = 0;
    for (let i = 0; i < 3600; i++) { k.input.throttle = 1; k.input.steer = -1; k.input.drift = true; rig.step(1 / 60); if (!Number.isFinite(k.position.x + k.speed + k.yaw)) bad++; }
    check('60 s of full lock + drift held on a walled strip', bad, 0, 0, '');
    check('...kart is still inside the corridor', Math.abs(k.query.lateral), 0, 14.2, 'm');
  }
  {
    // huge dt (tab was in the background): the session clamps to 50 ms, physics must also survive a raw 0.5 s step
    const rig = newRig(DEFS.strip);
    const k = rig.addKart(kartOpts({ s: 300, speed: 30 }));
    for (let i = 0; i < 20; i++) { k.input.throttle = 1; rig.step(0.5); }
    check('0.5 s frames: finite and inside corridor', Number.isFinite(k.position.x + k.speed) && Math.abs(k.query.lateral) < 20 ? 1 : 0, 1, 1, '');
  }
  {
    const rig = newRig();
    const k = rig.addKart(kartOpts({ s: 300, speed: 0 }));
    k.position.set(NaN, 0, 0); rig.step(1 / 60); rig.step(1 / 60);
    check('NaN position is recovered by the safety net', Number.isFinite(k.position.x) ? 1 : 0, 1, 1, '');
  }
}

function eventsAudit() {
  section('Event audit (rules + pads + wrong way)');
  {
    // wrong way: driving against the track for >1 s raises it, turning round clears it
    const rig = newRig(DEFS.walls);
    const k = rig.addKart(kartOpts({ s: 400, lateral: 0, speed: 16 }));
    const race = rig.startRace(); race.setPhase('racing'); k.locked = false;
    const here = rig.track.getRespawn(400, 0); k.placeAt(here.position, here.yaw + Math.PI, 16);       // facing against the track
    rig.track.project(k.position, k.query, -1); k.hint = k.query.index; k.race.s = k.query.s; k.race.distance = 400;
    const ww = []; rig.events.on(EV.WRONG_WAY, (e) => ww.push({ t: rig.session.time, active: e.active }));
    rig.run(2.6, () => { k.input.throttle = 0.6; }, { every: 1 });
    const raised = ww.find((e) => e.active);
    check('wrong way is announced after about a second', raised ? raised.t : 99, 0.8, 2.2, 's');
    aim(k, rig.track, 0);
    rig.run(2.0, () => { k.input.throttle = 1; });
    check('wrong way clears after turning round', ww.some((e) => !e.active) ? 1 : 0, 1, 1, '');
    check('no wrong-way flag while driving the right way', k.race.wrongWay ? 1 : 0, 0, 0, '');
  }
  {
    // boost pad at s=1800 on the strip
    const rig = newRig(DEFS.strip);
    const k = rig.addKart(kartOpts({ s: 1730, speed: 25 }));
    let pad = 0, boostPad = 0; rig.events.on(EV.PAD_BOOST, () => pad++); rig.events.on(EV.BOOST, (e) => { if (e.source === 'pad') boostPad++; });
    const peak = Math.max(...rig.run(4, () => { k.input.throttle = 1; }, { every: 1 / 60 }).map((r) => r.speed));
    check('boost pad fires once (event + boost)', pad === 1 && boostPad === 1 ? 1 : 0, 1, 1, '');
    check('boost pad lifts the kart well above top speed', peak / k.stats.topSpeed, 1.2, 1.5, 'x');
  }
  {
    // laps / finish / results / place events on a real course with a bot
    const rig = newRig(DEFS.sweepers, { laps: 2 });
    const ks = [0, 1, 2].map((i) => rig.addKart({ driver: DRIVERS[i].id, body: 'classic', s: rig.track.length - 6 - i * 7, lateral: i % 2 ? 2 : -2, speed: 0, player: i === 0 }));
    const race = rig.startRace();
    const bots = ks.map((k, i) => makeBot(rig.session, k, { drift: i === 0 }));
    const seen = {}; rig.events.onAny((t) => { seen[t] = (seen[t] ?? 0) + 1; });
    let t = 0; while (t < 200 && race.phase !== 'results') { for (const b of bots) b(); rig.step(1 / 60); t += 1 / 60; }
    check('race reaches the results phase', race.phase === 'results' ? 1 : 0, 1, 1, '');
    check('LAP_COMPLETE fired for every kart and lap', seen['race:lap'], 6, 6, '');
    check('FINAL_LAP fired once per kart', seen['race:finalLap'], 3, 3, '');
    check('KART_FINISH once per kart', seen['race:finish'], 3, 3, '');
    check('RACE_RESULTS exactly once', seen['race:results'], 1, 1, '');
    const times = ks.map((k) => k.race.finishTime);
    check('finish times are consistent with lap times', Math.abs(ks[0].race.lapTimes.reduce((a, b) => a + b, 0) - ks[0].race.finishTime), 0, 0.001, 's');
    check('places are 1..3 without duplicates', new Set(ks.map((k) => k.race.place)).size, 3, 3, '');
    check('standings are sorted by place', race.standings().every((e, i, a) => i === 0 || a[i - 1].place < e.place) ? 1 : 0, 1, 1, '');
    void times;
  }
}

function chaos() {
  section('Chaos soak (12 bots + seeded random item effects, spins, launches, teleports)');
  for (const [name, def] of [['coaster (hills, banking, ramp)', DEFS.coaster], ['sunny meadows', DEFS.meadows]]) {
    const rig = newRig(def, { laps: 4 });
    const L = rig.track.length;
    const ks = [];
    for (let i = 0; i < 12; i++) ks.push(rig.addKart({ driver: DRIVERS[i % 8].id, body: KART_BODIES[(i * 3) % 4].id, s: L - 6 - i * 4, lateral: (i % 2 ? 1 : -1) * 3.2, speed: 0, player: i === 0 }));
    const race = rig.startRace(); race.setPhase('countdown');
    const bots = ks.map((k, i) => makeBot(rig.session, k, { drift: i % 3 !== 2, chainLevel: i % 2 ? 2 : 0 }));
    let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    let bad = 0, t = 0;
    const distAt = new Map(ks.map((k) => [k.id, 0]));
    let stuck = 0, maxRespawn = 0;
    const respawnSince = new Map();
    const dtF = 1 / 60;
    for (let i = 0; i < 60 * 150; i++) {
      for (const b of bots) b();
      if (race.phase === 'racing' && i % 20 === 0) {
        const k = ks[Math.floor(rnd() * ks.length)];
        const r = rnd();
        if (r < 0.22) k.spinOut(0.8 + rnd(), 'chaos');
        else if (r < 0.34) k.launch(8 + rnd() * 6, 'chaos');
        else if (r < 0.5) k.applyBoost(0.2 + rnd() * 0.25, 0.5 + rnd(), 'item');
        else if (r < 0.6) k.shrinkFor(2 + rnd() * 3);
        else if (r < 0.68) k.setInvincible(2 + rnd() * 3);
        else if (r < 0.72) k.setRocket(1 + rnd() * 2);
        else if (r < 0.78) rig.physics.respawnKart(k, 'manual');
        else if (r < 0.84) { const tt = rig.track.getRespawn(rnd() * L, (rnd() - 0.5) * 8); k.placeAt(tt.position, tt.yaw + (rnd() - 0.5), 10 + rnd() * 25); }
        else if (r < 0.88) k.addCoins(1 + Math.floor(rnd() * 3));
      }
      rig.step(dtF); t += dtF;
      for (const k of ks) {
        if (!Number.isFinite(k.position.x + k.position.y + k.position.z + k.speed + k.yaw + k.slide + k.vy + k.scale)) bad++;
        if (k.respawn.active) { respawnSince.set(k.id, (respawnSince.get(k.id) ?? 0) + dtF); maxRespawn = Math.max(maxRespawn, respawnSince.get(k.id)); } else respawnSince.set(k.id, 0);
      }
      if (race.phase === 'results') break;
    }
    const unfinished = ks.filter((k) => !k.race.finished).length;
    info(`${name}: sim time ${t.toFixed(0)} s, phase ${race.phase}, finished ${ks.length - unfinished}/12`, Object.entries(rig.counts).filter(([k]) => /spin|launch|respawn|wallHit|bump|draft|jump|land/.test(k)).map(([k, v]) => `${k.split(':')[1]}=${v}`).join(' '));
    check(`${name}: no non-finite state`, bad, 0, 0, '');
    check(`${name}: a rescue never lasts longer than the drone flight`, maxRespawn, 0, 2.0, 's');
    check(`${name}: races still end (karts keep making progress through the chaos)`, race.phase === 'results' || ks.filter((k) => k.race.progress > 0.5).length >= 8 ? 1 : 0, 1, 1, '');
  }
}

function perf() {
  section('Performance');
  const rig = newRig(DEFS.strip);
  for (let i = 0; i < 12; i++) rig.addKart({ driver: DRIVERS[i % 8].id, body: KART_BODIES[i % 4].id, s: 300 + i * 6, lateral: (i % 2 ? 1 : -1) * 3, speed: 20, player: i === 0 });
  const bots = rig.session.karts.map((k) => makeBot(rig.session, k));
  for (let i = 0; i < 300; i++) { for (const b of bots) b(); rig.step(1 / 60); }       // warm up the JIT
  const frames = 60 * 60;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < frames; i++) rig.step(1 / 60);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / frames;
  check('physics step for 12 karts (no AI)', ms, 0, 0.6, 'ms/frame');
}

function terrain() {
  section('Awkward geometry (hills, banking, ripples)');
  {
    const lap = (drift) => soloLap(DEFS.coaster, { driver: DRIVER, body: BODY, speedClass: CLASS, drift, laps: 2, maxT: 200 });
    const a = lap(true), b = lap(false);
    info('coaster 2 laps (drifting bot): time / lap times / respawns / wall hits / jumps', `${a.time.toFixed(1)} s / ${a.lapTimes.map((t) => t.toFixed(1)).join(', ')} / ${a.counts['kart:respawn'] ?? 0} / ${a.counts['kart:wallHit'] ?? 0} / ${a.counts['kart:jump'] ?? 0}`);
    check('hilly banked circuit: bot finishes 2 laps (drifting)', a.finished ? 1 : 0, 1, 1, '');
    check('hilly banked circuit: bot finishes 2 laps (no drift)', b.finished ? 1 : 0, 1, 1, '');
    check('no rescue needed on the coaster', (a.counts['kart:respawn'] ?? 0) + (b.counts['kart:respawn'] ?? 0), 0, 0, '');
    check('drifting bot lap times are consistent (lap 2 vs lap 1)', a.lapTimes[1] / a.lapTimes[0], 0.93, 1.03, '');
  }
  {
    // ripples: a bumpy circle (R 70 m, 16 m wavelength). The bot drifts round it: charge keeps building, the drift is never cancelled
    const rig = newRig(DEFS.ripples);
    const k = rig.addKart(kartOpts({ s: 30, speed: 30 }));
    const bot = makeBot(rig.session, k, { drift: true, startCurv: 0.005, holdCurv: 0.002 });
    let cancels = 0, maxLevel = 0, airFrames = 0, frames = 0, walls = 0;
    rig.events.on(EV.DRIFT_CANCEL, () => cancels++); rig.events.on(EV.WALL_HIT, () => walls++);
    for (let i = 0; i < 60 * 14; i++) { bot(); k.input.throttle = k.speed < 30 ? 1 : 0.8; rig.step(1 / 60); frames++; if (!k.grounded) airFrames++; maxLevel = Math.max(maxLevel, k.drift.level); }
    info('ripple circle: airborne fraction / max drift level / cancels / wall hits', `${(airFrames / frames).toFixed(2)} / ${maxLevel} / ${cancels} / ${walls}`);
    check('drift survives bumps (not cancelled)', cancels, 0, 0, '');
    check('drift charge keeps building over bumps', maxLevel, 2, 3, '');
    check('kart mostly stays on the ripples (airborne fraction)', airFrames / frames, 0, 0.25, '');
  }
  {
    // snaking exploit check: alternating short drifts on a straight must not out-run plain driving by much
    const run = (snake) => {
      const rig = newRig(DEFS.strip);
      const k = rig.addKart(kartOpts({ s: 200, speed: 0 }));
      let boosts = 0; rig.events.on(EV.DRIFT_BOOST, () => boosts++);
      let sign = -1, held = 0;
      rig.run(18, () => {
        k.input.throttle = 1;
        if (!snake) { k.input.steer = 0; return; }
        // keep the nose along the road with the stick (countering the drift's turn bias); swap sides every 1.1 s
        const err = angleDiff(rig.track.sampleAt(k.query.s + 14).yaw, k.heading) - k.query.lateral * 0.02;
        k.input.steer = clampN(rig.physics.steerForYawRate(k, clampN(err * 3, -1.5, 1.5)), -1, 1);
        held += 1 / 60;
        if (held < 1.1) { k.input.drift = true; if (k.drift.dir === 0) k.input.steer = sign; }
        else if (held < 1.2) k.input.drift = false; else { held = 0; sign = -sign; }
      }, { every: 1 });
      return { dist: k.query.s, boosts, walls: rig.counts['kart:wallHit'] ?? 0 };
    };
    const plain = run(false), snk = run(true);
    info('18 s on a straight: plain vs snaking (distance, boosts, wall hits)', `${plain.dist.toFixed(0)} m vs ${snk.dist.toFixed(0)} m, ${snk.boosts} boosts, ${snk.walls} wall hits`);
    check('snaking does not out-run plain driving by more than 6 %', snk.dist / plain.dist, 0, 1.06, 'x');
  }
}

const sections = { longitudinal, steering, start, drift, offroad, walls, karts, spinAndAir, slipstream, frameRate, lapValue, terrain, abuse, eventsAudit, chaos, perf };
for (const [name, fn] of Object.entries(sections)) if (want(name)) { try { fn(); } catch (e) { failures++; console.log(`  FAIL ${name} threw: ${e.stack}`); } }
if (args.roster || (only && only.includes('roster'))) rosterTable();
console.log(`\n${failures === 0 ? 'HANDLING REPORT: all targets met' : `HANDLING REPORT: ${failures} target(s) missed`}`);
process.exit(failures ? 1 : 0);
