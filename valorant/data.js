/* VALO AIM TRAINER — game data: sensitivity / FOV model, movement, weapons, deathmatch rules, bot presets.
   Values with a public source say (src). Values without one say (approx); they are tuned approximations or settings and
   are never called a "reproduction". */
'use strict';
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- sensitivity / FOV
// Yaw per mouse count = 0.07° × in-game sensitivity (community standard; Riot publishes no figure).
// FOV: vertical FOV fixed at 70.53°, Hor+ (src: setup.gg / fovcalculatorpro): 103° horizontal at 16:9, 86.6° at 4:3,
// 117.6° at 21:9. Zoom "1.25x" divides tan(FOV/2).
// Scoped sensitivity multiplier 1.0 = MDH 100% (community: mouse-sensitivity.com, edpi-calculator.org): a flick to the
// horizontal screen edge (16:9) takes the same mouse distance scoped or unscoped → zoomed yaw = yaw × mult × hfov_zoom / 103.
const VAL = {
  YAW: 0.07, HFOV: 103, VFOV: 70.53,
  yaw(sens) { return VAL.YAW * sens; },
  vfov(zoom = 1) { return 2 * Math.atan(Math.tan(VAL.VFOV / 2 * DEG) / zoom) / DEG; },
  hfov(aspect, zoom = 1) { return 2 * Math.atan(Math.tan(VAL.VFOV / 2 * DEG) * aspect / zoom) / DEG; },
  hfovZoom(zoom) { return 2 * Math.atan(Math.tan(VAL.HFOV / 2 * DEG) / zoom) / DEG; },
  adsYaw(sens, mult, zoom) { return VAL.yaw(sens) * mult * VAL.hfovZoom(zoom) / VAL.HFOV; },
  cm360(yawDeg, dpi) { return 2.54 * 360 / (yawDeg * dpi); },
  // other games' yaw per count, for the converter (cm/360 match)
  OTHER: { cs2: 0.022, apex: 0.022, ow2: 0.0066 },
};

// ---------------------------------------------------------------- movement (metres, seconds)
const MOVE = {
  base: 6.75,        // m/s knife-out run speed (src: official wiki "Melee"); guns run at base × weapon.runMul
  walkMul: 0.56,     // walk (Shift) ≈ 56% of run (approx: no official value; community ≈ 3.8 m/s with the knife)
  crouchMul: 0.34,   // crouch walk (approx: no public value)
  // Riot (Classick) stop timings with a Phantom from full run: counter-strafe reaches the accuracy deadzone at 0.104 s and
  // a full stop at 0.160 s; releasing + walk 0.110 / 0.170 s. These decelerations reproduce those timings closely.
  accel: 38,         // m/s² toward the input direction (approx – start-up time has no public value)
  friction: 35,      // m/s² with no input (→ deadzone ≈ 0.11 s, stop ≈ 0.155 s)
  counter: 38,       // m/s² when the input opposes your velocity (→ deadzone ≈ 0.104 s, stop ≈ 0.142 s)
  airAccel: 5,       // m/s² air steering (approx)
  jumpV: 2.30,       // m/s → apex ≈ 0.26 m (approx: jump height has no public value; halved twice after play-testing)
  airStep: 0.25,     // m – mid-air ledge grab margin above the feet
  tuck: 0.32,        // m – crouching in the air lifts the legs (crouch-jump onto 1.0 m crates)
  gravity: 10.3,     // m/s² (approx)
  landPenalty: 7, landTime: 0.225,   // ° extra spread for 0.225 s after landing (src: official wiki, v1.09)
  stepUp: 0.55,      // m – walk up stairs / ledges up to this height
  eyeStand: 1.72, eyeCrouch: 1.28,   // approx (no public value); enemy head centre = eye height, so headline = eye line
  crouchSpeed: 12,
  radius: 0.34,
  deadzone: 0.275,   // fully accurate below 27.5% of max speed (src: patch notes 3.0)
};

// ---------------------------------------------------------------- weapons
// Sources: official wiki (wiki.playvalorant.com) + datamined valorant-api.com weaponStats.
// dmg: [[maxRange m, head, body, leg], ...]. rps / adsRps: rounds per second hip / zoomed. runMul: run speed = 6.75 × runMul.
// spread: [hip first-shot, ADS first-shot] degrees; maxSpread: firing-error cap. err: [walk, run, air] added degrees (src: wiki).
// recoil (shape is approx – Riot publishes no per-shot angles): up[] = bullet climb per shot (deg), upMax cap, side = sway step,
// protect = bullets before the sideways direction may switch (src 11.08: Vandal 6, Phantom 8, Spectre 5),
// recover = seconds to fully reset after you stop (src 0.50: Vandal 0.375, Phantom/Bulldog/Guardian 0.35),
// viewKick = share of the climb that also moves the camera (approx), runMul = vertical recoil × while running (src 6.11).
const ERR = { rifle: [3, 6, 10], smg: [1, 2.5, 10], pistol: [1.1, 2.3, 7], sheriff: [1.2, 3, 7], sniper: [10, 15, 20], heavy: [3, 6, 10], melee: [0, 0, 0] };
const WEAPONS = {
  classic: { slot: 2, name: 'Classic', cls: 'SIDEARM', auto: false, rps: 6.75, mag: 12, reserve: 36, reload: 1.75, equip: 0.75, runMul: 0.85, pen: 'Low',
    dmg: [[30, 78, 26, 22.1], [999, 66, 22, 18.7]], zoom: 0, spread: [0.4, 0.4], maxSpread: 1.8, err: ERR.pistol,
    recoil: { up: [0.6, 0.9, 1.1], upMax: 3, side: 0.5, protect: 3, recover: 0.3, viewKick: 0.35 } },
  ghost: { slot: 2, name: 'Ghost', cls: 'SIDEARM', auto: false, rps: 6.75, mag: 13, reserve: 39, reload: 1.5, equip: 0.75, runMul: 0.85, pen: 'Med',
    dmg: [[30, 105, 30, 25.5], [999, 87.5, 25, 21.25]], zoom: 0, spread: [0.3, 0.3], maxSpread: 1.65, err: ERR.pistol,
    recoil: { up: [0.5, 0.8, 1.0], upMax: 2.6, side: 0.4, protect: 3, recover: 0.3, viewKick: 0.35 } },
  bandit: { slot: 2, name: 'Bandit', cls: 'SIDEARM', auto: false, rps: 5.1, mag: 8, reserve: 24, reload: 1.5, equip: 0.75, runMul: 0.85, pen: 'Med',
    dmg: [[10, 152, 39, 33], [30, 128, 39, 33], [999, 112, 34, 28]], zoom: 0, spread: [0.275, 0.275], maxSpread: 1.97, err: ERR.pistol,
    recoil: { up: [0.9, 1.2, 1.4], upMax: 4, side: 0.6, protect: 3, recover: 0.32, viewKick: 0.4 } },
  frenzy: { slot: 2, name: 'Frenzy', cls: 'SIDEARM', auto: true, rps: 10, mag: 15, reserve: 45, reload: 1.5, equip: 1, runMul: 0.85, pen: 'Low',
    dmg: [[20, 78, 26, 22.1], [999, 63, 21, 17.85]], zoom: 0, spread: [0.65, 0.65], maxSpread: 1.7, err: ERR.pistol,
    recoil: { up: [0.4, 0.6, 0.8, 0.8, 0.7], upMax: 4, side: 0.6, protect: 3, recover: 0.35, viewKick: 0.3, runMul: 1.5 } },
  sheriff: { slot: 2, name: 'Sheriff', cls: 'SIDEARM', auto: false, rps: 4, mag: 6, reserve: 24, reload: 2.25, equip: 1, runMul: 0.8, pen: 'High',
    dmg: [[30, 159.5, 55, 46.75], [999, 145, 50, 42.5]], zoom: 0, spread: [0.25, 0.25], maxSpread: 2.75, err: ERR.sheriff,
    recoil: { up: [1.8, 2.2, 2.4], upMax: 6, side: 0.8, protect: 2, recover: 0.45, viewKick: 0.45 } },
  stinger: { slot: 1, name: 'Stinger', cls: 'SMG', auto: true, rps: 16, mag: 20, reserve: 60, reload: 2.25, equip: 0.75, runMul: 0.85, pen: 'Low',
    dmg: [[15, 67.5, 27, 22.95], [999, 57, 23, 19]], zoom: 1.15, adsRps: 18, adsBurst: 4, burstGap: 0.47, spread: [0.65, 0.35], maxSpread: 1.5, err: ERR.smg,
    recoil: { up: [0.2, 0.3, 0.35, 0.4, 0.4, 0.35], upMax: 3.6, side: 0.45, protect: 4, recover: 0.3, viewKick: 0.3 } },
  spectre: { slot: 1, name: 'Spectre', cls: 'SMG', auto: true, rps: 13.33, mag: 30, reserve: 90, reload: 2.25, equip: 0.75, runMul: 0.85, pen: 'Low',
    dmg: [[15, 78, 26, 22.1], [30, 66, 22, 18.7], [999, 60, 20, 17]], zoom: 1.15, adsRps: 12, spread: [0.4, 0.25], maxSpread: 1.4, err: ERR.smg,
    recoil: { up: [0.15, 0.25, 0.3, 0.35, 0.35, 0.3, 0.25], upMax: 3.0, side: 0.35, protect: 5, recover: 0.3, viewKick: 0.3, runMul: 1.8 } },
  bulldog: { slot: 1, name: 'Bulldog', cls: 'RIFLE', auto: true, rps: 10, mag: 24, reserve: 72, reload: 2.5, equip: 1, runMul: 0.8, pen: 'Med',
    dmg: [[999, 115.5, 35, 29.75]], zoom: 1.25, adsRps: 13.33, adsBurst: 3, burstGap: 0.25, spread: [0.3, 0.1], maxSpread: 1.25, err: ERR.rifle,
    recoil: { up: [0.2, 0.45, 0.65, 0.75, 0.75, 0.65], upMax: 4.5, side: 0.5, protect: 5, recover: 0.35, viewKick: 0.3 } },
  guardian: { slot: 1, name: 'Guardian', cls: 'RIFLE', auto: false, rps: 5.25, mag: 12, reserve: 36, reload: 2.5, equip: 1, runMul: 0.8, pen: 'High',
    dmg: [[999, 195, 65, 48.75]], zoom: 1.5, adsRps: 5.25, spread: [0.1, 0], maxSpread: 1.58, err: ERR.rifle,
    recoil: { up: [1.0, 1.0, 1.0], upMax: 4, side: 0.3, protect: 3, recover: 0.35, viewKick: 0.4 } },
  phantom: { slot: 1, name: 'Phantom', cls: 'RIFLE', auto: true, rps: 11, mag: 30, reserve: 60, reload: 2.5, equip: 1, runMul: 0.8, pen: 'Med',
    dmg: [[20, 156, 39, 33.15], [999, 140, 35, 29.75]], zoom: 1.25, adsRps: 9.9, spread: [0.2, 0.11], maxSpread: 0.9, err: ERR.rifle,
    recoil: { up: [0.1, 0.22, 0.4, 0.55, 0.6, 0.55, 0.45, 0.4], upMax: 5.0, side: 0.45, protect: 8, recover: 0.35, viewKick: 0.3, runMul: 1.8 } },
  vandal: { slot: 1, name: 'Vandal', cls: 'RIFLE', auto: true, rps: 9.75, mag: 25, reserve: 50, reload: 2.5, equip: 1, runMul: 0.8, pen: 'Med',
    dmg: [[999, 160, 40, 34]], zoom: 1.25, adsRps: 8.775, spread: [0.25, 0.1575], maxSpread: 1.0, err: ERR.rifle,
    recoil: { up: [0.12, 0.28, 0.5, 0.7, 0.75, 0.7, 0.6, 0.5], upMax: 5.6, side: 0.55, protect: 6, recover: 0.375, viewKick: 0.3, runMul: 1.8 } },
  ares: { slot: 1, name: 'Ares', cls: 'HEAVY', auto: true, rps: 13, mag: 50, reserve: 100, reload: 3.25, equip: 1.25, runMul: 0.76, pen: 'High',
    dmg: [[30, 75, 30, 25.5], [999, 70, 28, 23.8]], zoom: 1.15, adsRps: 13, spread: [1.0, 0.9], maxSpread: 1.0, tighten: 0.7, err: ERR.heavy,
    recoil: { up: [0.3, 0.35, 0.35, 0.3, 0.25], upMax: 3.2, side: 0.4, protect: 6, recover: 0.4, viewKick: 0.3 } },
  odin: { slot: 1, name: 'Odin', cls: 'HEAVY', auto: true, rps: 12, rpsMax: 15.6, mag: 100, reserve: 200, reload: 5, equip: 1.25, runMul: 0.76, pen: 'High',
    dmg: [[30, 95, 38, 32.3], [999, 77.5, 31, 26.35]], zoom: 1.15, adsRps: 15.6, spread: [0.8, 0.79], maxSpread: 1.3, err: ERR.heavy,
    recoil: { up: [0.3, 0.35, 0.35, 0.3, 0.25], upMax: 3.4, side: 0.45, protect: 6, recover: 0.45, viewKick: 0.3 } },
  marshal: { slot: 1, name: 'Marshal', cls: 'SNIPER', auto: false, rps: 1.5, mag: 5, reserve: 10, reload: 2.5, equip: 1.25, runMul: 0.8, adsMove: 0.9, pen: 'Med',
    dmg: [[999, 202, 101, 85.85]], zoom: 3.5, scope: true, adsRps: 1.2, spread: [1.0, 0], maxSpread: 1.0, err: ERR.sniper,
    recoil: { up: [2.0], upMax: 2.0, side: 0.2, protect: 1, recover: 0.5, viewKick: 0.7 } },
  outlaw: { slot: 1, name: 'Outlaw', cls: 'SNIPER', auto: false, rps: 2.75, mag: 2, reserve: 10, reload: 3.8, equip: 1.25, runMul: 0.8, adsMove: 0.8, pen: 'High',
    dmg: [[999, 238, 140, 119]], zoom: 3.5, scope: true, adsRps: 2.75, spread: [3.5, 0], maxSpread: 3.5, err: ERR.sniper,
    recoil: { up: [2.2], upMax: 2.2, side: 0.2, protect: 1, recover: 0.5, viewKick: 0.7 } },
  operator: { slot: 1, name: 'Operator', cls: 'SNIPER', auto: false, rps: 0.6, mag: 5, reserve: 10, reload: 3.7, equip: 1.5, runMul: 0.76, adsMove: 0.72, pen: 'High',
    dmg: [[999, 255, 150, 120]], zoom: 2.5, zoom2: 5, scope: true, adsRps: 0.6, spread: [5, 0], maxSpread: 5, err: ERR.sniper,
    recoil: { up: [3.0], upMax: 3.0, side: 0.3, protect: 1, recover: 0.6, viewKick: 0.8 } },
  knife: { slot: 3, name: 'Knife', cls: 'MELEE', auto: true, rps: 2.2, mag: 0, reserve: 0, reload: 0, equip: 0.5, runMul: 1.0, pen: '-',
    dmg: [[2.4, 75, 50, 50]], zoom: 0, spread: [0, 0], maxSpread: 0, err: ERR.melee,
    recoil: { up: [0], upMax: 0, side: 0, protect: 1, recover: 0.1, viewKick: 0 } },
};
const PRIMARIES = ['vandal', 'phantom', 'spectre', 'stinger', 'bulldog', 'guardian', 'ares', 'odin', 'marshal', 'outlaw', 'operator'];
const SECONDARIES = ['classic', 'ghost', 'sheriff', 'bandit', 'frenzy'];
function weaponDamage(w, dist, part) {
  const band = w.dmg.find(b => dist <= b[0]) || w.dmg[w.dmg.length - 1];
  return part === 'head' ? band[1] : part === 'leg' ? band[3] : band[2];
}
function runSpeed(w) { return MOVE.base * w.runMul; }

// ---------------------------------------------------------------- deathmatch rules (src: official wiki "Deathmatch")
// 12 players, 40 kills or 9 minutes; respawn 1.5 s with Heavy Armor (50); a kill instantly reloads your weapon and the
// victim drops a health pack (10 s) that restores full HP + armor. Respawn invulnerability lasts a few seconds or until you
// move / shoot (exact duration not published – 3 s here).
const DM = { hp: 100, armor: 50, respawn: 1.5, protect: 3, packLife: 10, players: 12, kills: 40, minutes: 9 };

// ---------------------------------------------------------------- bots
// Training presets, not measurements: reaction = seconds from first sight to first shot; hit = per-shot hit chance at 10 m
// against a standing target; hs = share of hits on the head; strafe = how often they ADAD between bursts.
const BOT_DIFF = {
  easy:   { reaction: 0.62, hit: 0.16, hs: 0.10, burst: [2, 4], track: 0.6 },
  normal: { reaction: 0.44, hit: 0.26, hs: 0.16, burst: [2, 5], track: 0.8 },
  hard:   { reaction: 0.31, hit: 0.36, hs: 0.24, burst: [3, 6], track: 1.0 },
  insane: { reaction: 0.22, hit: 0.46, hs: 0.32, burst: [3, 7], track: 1.2 },
};
const BOT_NAMES = ['KESTREL', 'NOVA', 'RIFT', 'SABLE', 'ORBIT', 'MOTH', 'QUILL', 'VESPER', 'TALON', 'EMBER', 'HALO', 'GRIT', 'ZEPHYR', 'CINDER', 'PIKE'];
const BOT_GUNS = ['vandal', 'phantom', 'vandal', 'phantom', 'spectre', 'bulldog', 'sheriff', 'guardian', 'marshal'];

// ---------------------------------------------------------------- first-person gun kick (visual only, approx)
// What the weapon model does when it fires: back = slide toward the camera (m), up = muzzle climb (deg), roll (deg),
// side = random yaw (deg), k = spring stiffness (higher = snappier return). Purely cosmetic: aim and bullets follow the
// recoil model above, not this.
const KICK_CLASS = {
  RIFLE: { back: 0.032, up: 3.5, roll: 1.2, side: 0.6, k: 260 },
  SMG: { back: 0.018, up: 2.0, roll: 0.8, side: 0.7, k: 320 },
  HEAVY: { back: 0.026, up: 2.4, roll: 1.0, side: 0.8, k: 240 },
  SIDEARM: { back: 0.028, up: 8, roll: 2.0, side: 0.6, k: 230 },
  SNIPER: { back: 0.085, up: 9, roll: 3.0, side: 0.8, k: 90 },
  MELEE: { back: -0.09, up: -10, roll: 12, side: 4, k: 160 },
};
const KICK = {
  vandal: { back: 0.036, up: 4.2, roll: 1.6, side: 0.7, k: 250 },
  phantom: { back: 0.028, up: 3.0, roll: 1.0, side: 0.5, k: 280 },
  bulldog: { back: 0.034, up: 3.8, roll: 1.2, side: 0.6, k: 260 },
  guardian: { back: 0.05, up: 6.5, roll: 1.8, side: 0.6, k: 200 },
  sheriff: { back: 0.05, up: 17, roll: 3.5, side: 1.0, k: 150 },
  ghost: { back: 0.02, up: 5, roll: 1.2, side: 0.4, k: 260 },
  bandit: { back: 0.04, up: 12, roll: 2.6, side: 0.8, k: 180 },
  frenzy: { back: 0.016, up: 4, roll: 1.4, side: 1.0, k: 300 },
  odin: { back: 0.03, up: 2.6, roll: 1.2, side: 1.0, k: 230 },
  operator: { back: 0.11, up: 12, roll: 3.5, side: 0.8, k: 70 },
  outlaw: { back: 0.09, up: 10, roll: 3.0, side: 0.8, k: 85 },
};
function kickOf(key) { return KICK[key] || KICK_CLASS[WEAPONS[key].cls] || KICK_CLASS.RIFLE; }
