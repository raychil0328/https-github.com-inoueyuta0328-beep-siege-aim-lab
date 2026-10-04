/* VALO AIM TRAINER — game: settings, player movement (accel / counter-strafe / jump), weapons (spread, recoil, ADS),
   deathmatch bots, drills, HUD, audio, render loop. */
'use strict';

// ---------------------------------------------------------------- settings
// Keyboard Lock only works in a top-level fullscreen page (not inside an embedding frame)
const KB_LOCK = !!(navigator.keyboard && navigator.keyboard.lock) && window.self === window.top;
// Default crouch is L-Ctrl as in the game; browsers without Keyboard Lock would close the tab on Ctrl+W, so they get C.
const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', walk: 'ShiftLeft', crouch: KB_LOCK ? 'ControlLeft' : 'KeyC', jump: 'Space',
  fire: 'Mouse0', ads: 'Mouse2', reload: 'KeyR', primary: 'Digit1', secondary: 'Digit2', knife: 'Digit3', scoreboard: 'Tab', restart: 'Backspace' };
const KEY_ACTIONS = Object.keys(DEFAULT_KEYS);
// VALORANT crosshair profile (primary). Field names follow the in-game share code.
const XH_DEFAULT = { c: 0, u: 'FFFFFF', h: 1, t: 1, o: 0.5, d: 0, z: 2, a: 1,
  ib: 1, it: 2, il: 6, ig: 0, iv: 6, io: 3, ia: 0.8, im: 0, is: 1, if: 1, ie: 1,
  ob: 1, ot: 2, ol: 2, og: 0, ov: 2, oo: 10, oa: 0.35, om: 1, os: 1, of: 1, oe: 1 };
// sniper scope centre dot (code section S): show, colour, thickness, opacity
const XHS_DEFAULT = { d: 1, c: 7, u: 'FF0000', s: 1, o: 0.75 };
const XH_COLORS = ['#FFFFFF', '#00FF00', '#7FFF00', '#DFFF00', '#FFFF00', '#00FFFF', '#FF00FF', '#FF0000'];
const settings = {
  dpi: 800, sens: 0.4, scoped: 1.0, zoomTime: 0.2, invert: false,
  map: 'sandstone', bots: '7', botDiff: 'normal', botMove: 'normal', botSpeed: 1, shootBack: true, killGoal: 20, minutes: 3,
  primary: 'vandal', secondary: 'sheriff', ammo: 'real',
  enemyColor: 'red', outline: true, viewmodel: true, speedo: true, volume: 0.6, footsteps: true,
  adsmode: 'hold', crouchmode: 'hold', walkmode: 'hold',
  menuMode: 'dm', mode: 'dm', difficultyLab: 1, durationLab: 60, drillGun: 'vandal',
  xh: { ...XH_DEFAULT }, xhAds: { ...XH_DEFAULT }, xhAdsOn: false, xhSn: { ...XHS_DEFAULT }, xhBg: 'wall',
};
const ENEMY_COLORS = { red: [1.0, 0.18, 0.22], yellow: [1.0, 0.92, 0.1], purple: [0.78, 0.25, 1.0] };
function saveSettings() { try { localStorage.setItem('vat-settings', JSON.stringify(settings)); } catch (e) {} }
function loadSettingsRaw() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem('vat-settings') || '{}')); } catch (e) {}
  settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys || {});
  settings.xh = Object.assign({}, XH_DEFAULT, settings.xh || {});
  settings.xhAds = Object.assign({}, XH_DEFAULT, settings.xhAds || {});
  settings.xhSn = Object.assign({}, XHS_DEFAULT, settings.xhSn || {});
  if (!WEAPONS[settings.primary] || WEAPONS[settings.primary].slot !== 1) settings.primary = 'vandal';
  if (!WEAPONS[settings.secondary] || WEAPONS[settings.secondary].slot !== 2) settings.secondary = 'sheriff';
  if (!MAP_DEFS[settings.map] || MAP_DEFS[settings.map].drill) settings.map = 'sandstone';
}
function sensState(zoom) {
  const hip = VAL.yaw(settings.sens);
  return { hip, ads: zoom ? VAL.adsYaw(settings.sens, settings.scoped, zoom) : hip };
}

// ---------------------------------------------------------------- modes
const MODES = [
  { id: 'dm', group: 'dm', get name() { return t('mode.dm'); }, tag: 'DEATHMATCH', get desc() { return t('mode.dm.desc'); } },
  { id: 'stopping', group: 'lab', weapon: true, name: 'Strafe Stop', get tag() { return t('mode.stopping.tag'); }, get desc() { return t('mode.stopping.desc'); } },
  { id: 'onetap', group: 'lab', weapon: true, name: 'Headline Tap', get tag() { return t('mode.onetap.tag'); }, get desc() { return t('mode.onetap.desc'); } },
  { id: 'track', group: 'lab', name: 'Smooth Tracking', tag: 'TRACKING', get desc() { return t('mode.track.desc'); } },
  { id: 'reactive', group: 'lab', name: 'ADAD Reactive', tag: 'TRACKING · ADAD', get desc() { return t('mode.reactive.desc'); } },
  { id: 'flicktrack', group: 'lab', name: 'Flick + Track', tag: 'HYBRID', get desc() { return t('mode.flicktrack.desc'); } },
  { id: 'vision', group: 'lab', name: 'Dynamic Vision', get tag() { return t('mode.vision.tag'); }, get desc() { return t('mode.vision.desc'); } },
  { id: 'air', group: 'lab', name: 'Air Tracking', tag: 'TRACKING · 3D', get desc() { return t('mode.air.desc'); } },
  { id: 'microdot', group: 'lab', name: 'Micro Dot', tag: 'PRECISION', get desc() { return t('mode.microdot.desc'); } },
];

// ---------------------------------------------------------------- game state
const game = {
  running: false, t: 0, timeLeft: 0, mode: MODES[0], weaponMode: false, laser: false, diff: 1, dur: 60,
  yaw: 0, pitch: 0, px: 0, py: 0, pz: 0, vx: 0, vz: 0, vy: 0, onGround: true, landT: 0, crouch: 0, crouchHeld: false, walkToggle: false,
  hp: 100, armor: 50, alive: true, deadT: 0, protectT: 0, killer: null,
  slots: {}, cur: 1, last: 2, equipT: 0, reloading: 0, fireCd: 0, burstLeft: 0, semiQueued: 0, firing: false, adsHeld: false, zoomLevel: 0, adsBlend: 0, spinT: 0,
  rec: { up: 0, side: 0, n: 0, dir: 1, sprayT: 0, since: 9 },
  kills: 0, deaths: 0, hsKills: 0, shots: 0, hits: 0, headHits: 0, legHits: 0, damage: 0, stopShots: 0, score: 0,
  onTargetTime: 0, fireTime: 0, hitStreak: 0, targets: [], bots: [], packs: [], tracers: [], impacts: [], feed: [], dmgInd: [],
  hitMarker: 0, hitHead: false, killT: 0, killHead: false, muzzle: 0, recoilVis: 0, reveal: 0, tapTimes: [], misses: 0,
};

// ---------------------------------------------------------------- body geometry (bots and drill dummies)
// height ≈ 1.9 m standing (approx – the official wiki lists 1.96 m capsules); head centre = player eye height
function botGeom(crouch, y = 0) {
  const headY = lerp(MOVE.eyeStand, MOVE.eyeCrouch, crouch) + y;
  const hipY = lerp(0.95, 0.66, crouch) + y;
  return { headY, headR: 0.14, chestTop: headY - 0.22, hipY, torsoR: 0.22, legR: 0.15, footY: y + 0.06 };
}
function bodyHit(o, d, x, z, g) { // returns {t, part} or null
  const th = raySphere(o, d, [x, g.headY, z], g.headR);
  const tor = segRay(o, d, [x, g.hipY + g.torsoR * 0.5, z], [x, g.chestTop - g.torsoR * 0.4, z]);
  const leg = segRay(o, d, [x, g.footY + g.legR, z], [x, g.hipY, z]);
  let best = null;
  if (th < Infinity) best = { t: th, part: 'head' };
  if (tor.dist <= g.torsoR && (!best || tor.t < best.t - 0.05)) best = { t: tor.t, part: 'body' };
  if (leg.dist <= g.legR && (!best || leg.t < best.t - 0.05)) best = { t: leg.t, part: 'leg' };
  return best;
}

// ---------------------------------------------------------------- audio (synthesised, nothing to download)
const AU = {
  ctx: null, master: null, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); this.setVol();
    const n = this.ctx.sampleRate * 0.6; this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const ch = this.noise.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  },
  setVol() { if (this.master) this.master.gain.value = settings.volume * 0.5; },
  out(pan) { if (!this.ctx) return null; if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(this.master); return p; } return this.master; },
  burst(dur, freq, q, vol, pan, type = 'bandpass') {
    const o = this.out(pan); if (!o) return; const c = this.ctx, t0 = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(o); s.start(t0, Math.random() * 0.4); s.stop(t0 + dur + 0.02);
  },
  tone(freq, dur, vol, type = 'sine', pan = 0, slide = 0) {
    const o = this.out(pan); if (!o) return; const c = this.ctx, t0 = c.currentTime;
    const os = c.createOscillator(); os.type = type; os.frequency.setValueAtTime(freq, t0); if (slide) os.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    os.connect(g); g.connect(o); os.start(t0); os.stop(t0 + dur + 0.02);
  },
  shot(cls, vol = 1, pan = 0) {
    if (cls === 'MELEE') { this.burst(0.08, 2400, 1.2, 0.25 * vol, pan); return; }
    const sn = cls === 'SNIPER', pi = cls === 'SIDEARM';
    this.burst(sn ? 0.28 : 0.11, sn ? 900 : pi ? 2200 : 1500, 0.7, (sn ? 0.9 : 0.55) * vol, pan);
    this.tone(sn ? 70 : 110, sn ? 0.25 : 0.09, (sn ? 0.7 : 0.35) * vol, 'triangle', pan, 0.5);
  },
  hit(head) { if (head) { this.tone(2350, 0.16, 0.28); this.tone(3520, 0.1, 0.12); } else this.tone(900, 0.05, 0.12, 'square'); },
  kill(head) { this.tone(head ? 1200 : 800, 0.12, 0.2, 'triangle'); setTimeout(() => this.tone(head ? 1800 : 1200, 0.18, 0.2, 'triangle'), 70); },
  hurt() { this.tone(120, 0.18, 0.5, 'sawtooth', 0, 0.6); this.burst(0.12, 400, 0.8, 0.3, 0, 'lowpass'); },
  step(pan, vol) { this.burst(0.05, 600 + Math.random() * 300, 1.5, vol, pan); },
  click() { this.tone(1400, 0.03, 0.1, 'square'); },
};
function panOf(x, z) { const a = Math.atan2(x - game.px, -(z - game.pz)) - game.yaw; return Math.sin(a); }

// ---------------------------------------------------------------- player
function curW() { return WEAPONS[game.slots[game.cur].key]; }
function maxSpeed() {
  const w = curW(); let s = runSpeed(w);
  if (game.crouch > 0.5) s *= MOVE.crouchMul; else if (isWalking()) s *= MOVE.walkMul;
  if (game.zoomLevel > 0) s = Math.min(s, runSpeed(w) * (w.adsMove || 0.76));
  return s;
}
function isWalking() { return settings.walkmode === 'toggle' ? game.walkToggle : isDown('walk'); }
function hSpeed() { return Math.hypot(game.vx, game.vz); }
function updatePlayer(dt) {
  if (!game.alive) { game.vx = game.vz = 0; return; }
  const crouchT = game.crouchHeld ? 1 : 0; game.crouch += (crouchT - game.crouch) * Math.min(1, dt * MOVE.crouchSpeed);
  let fx = (isDown('forward') ? 1 : 0) - (isDown('back') ? 1 : 0), sx = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  const cy = Math.cos(game.yaw), sy = Math.sin(game.yaw);
  let wx = sy * fx + cy * sx, wz = -cy * fx + sy * sx; const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; if (game.protectT > 0 && game.t - game.spawnedAt > 0.2) game.protectT = 0; }
  const vmax = maxSpeed();
  if (game.onGround) {
    const sp = hSpeed();
    if (wl > 0) {
      // accelerate toward wish velocity; when the input opposes the current velocity (counter-strafe) the stronger
      // counter deceleration applies to the opposing component
      const tx = wx * vmax, tz = wz * vmax; let dx = tx - game.vx, dz = tz - game.vz; const dl = Math.hypot(dx, dz);
      const opp = sp > 0.01 && (game.vx * wx + game.vz * wz) / sp < -0.2;
      const a = (opp ? MOVE.counter : MOVE.accel) * dt;
      if (dl > a) { dx = dx / dl * a; dz = dz / dl * a; }
      game.vx += dx; game.vz += dz;
    } else if (sp > 0) { const ns = Math.max(0, sp - MOVE.friction * dt); game.vx *= ns / sp; game.vz *= ns / sp; }
    if (isDown('jump') && game.jumpReady) { game.vy = MOVE.jumpV; game.onGround = false; game.jumpReady = false; }
  } else if (wl > 0) {
    game.vx += wx * MOVE.airAccel * dt; game.vz += wz * MOVE.airAccel * dt;
    const sp = hSpeed(), cap = Math.max(vmax, sp - 0.001); if (sp > cap) { game.vx *= cap / sp; game.vz *= cap / sp; }
  }
  if (!isDown('jump')) game.jumpReady = true;
  // horizontal move with collision against anything taller than a step above the feet
  // on the ground you walk up steps; in the air only a small margin, plus the leg tuck when crouching (crouch-jump)
  const top = game.py + (game.onGround ? MOVE.stepUp : MOVE.airStep + MOVE.tuck * game.crouch);
  const ox = game.px, oz = game.pz;
  const [nx, nz] = collide(game.px + game.vx * dt, game.pz + game.vz * dt, MOVE.radius, top);
  game.px = nx; game.pz = nz;
  if (dt > 0) { const rx = (nx - ox) / dt, rz = (nz - oz) / dt; if (Math.abs(rx) < Math.abs(game.vx) - 0.05) game.vx = rx; if (Math.abs(rz) < Math.abs(game.vz) - 0.05) game.vz = rz; }
  // vertical
  const g = groundAt(game.px, game.pz, MOVE.radius, top);
  if (game.onGround) {
    if (g >= game.py - 0.01) game.py = g;                 // flat or step up
    else if (g < game.py - 0.05) { game.onGround = false; game.vy = 0; }   // walked off a ledge
  }
  if (!game.onGround) {
    game.vy -= MOVE.gravity * dt; game.py += game.vy * dt;
    if (game.py <= g && game.vy <= 0) { game.py = g; game.vy = 0; game.onGround = true; game.landT = MOVE.landTime; }
  }
  game.landT = Math.max(0, game.landT - dt);
  // health packs
  for (let i = game.packs.length - 1; i >= 0; i--) { const p = game.packs[i]; if (Math.hypot(p.x - game.px, p.z - game.pz) < 1.1 && Math.abs(game.py) < 1.2) { game.hp = DM.hp; game.armor = DM.armor; game.packs.splice(i, 1); AU.tone(660, 0.12, 0.2); setTimeout(() => AU.tone(990, 0.14, 0.2), 60); } }
  // own footsteps (running is audible, walking / crouching is silent)
  if (settings.footsteps && game.onGround && hSpeed() > runSpeed(curW()) * 0.6) { game.stepT = (game.stepT || 0) - dt; if (game.stepT <= 0) { game.stepT = 0.34; AU.step(0, 0.05); } }
}
function eyePos() { return [game.px, game.py + lerp(MOVE.eyeStand, MOVE.eyeCrouch, game.crouch), game.pz]; }
function isAccurate() { return game.onGround && game.landT <= 0 && hSpeed() <= runSpeed(curW()) * MOVE.deadzone + 0.01; }

// ---------------------------------------------------------------- weapons
function giveLoadout() {
  const mk = k => ({ key: k, ammo: WEAPONS[k].mag, reserve: WEAPONS[k].reserve });
  const drill = game.mode.id !== 'dm', dg = WEAPONS[settings.drillGun] ? settings.drillGun : 'vandal';
  game.slots = { 1: mk(drill && WEAPONS[dg].slot === 1 ? dg : settings.primary), 2: mk(drill && WEAPONS[dg].slot === 2 ? dg : settings.secondary), 3: mk('knife') };
  game.cur = drill && WEAPONS[dg].slot === 2 ? 2 : 1; game.last = game.cur === 1 ? 2 : 1;
  game.equipT = 0; game.reloading = 0; game.fireCd = 0; game.burstLeft = 0; game.zoomLevel = 0; game.adsBlend = 0; resetRecoil();
}
function resetRecoil() { Object.assign(game.rec, { rate: null, up: 0, side: 0, n: 0, dir: Math.random() < 0.5 ? -1 : 1, sprayT: 0, since: 9 }); }
function switchSlot(s) {
  if (!game.slots[s] || s === game.cur || !game.alive) return;
  game.last = game.cur; game.cur = s; game.equipT = WEAPONS[game.slots[s].key].equip; game.reloading = 0; game.zoomLevel = 0; game.burstLeft = 0; resetRecoil();
  updateScopeUI(); updateAmmoHud();
}
function startReload() {
  const sl = game.slots[game.cur], w = curW();
  if (w.cls === 'MELEE' || game.reloading > 0 || sl.ammo === w.mag || (settings.ammo === 'real' && sl.reserve <= 0)) return;
  game.reloading = w.reload; game.zoomLevel = 0; game.burstLeft = 0; updateScopeUI();
}
function finishReload() {
  const sl = game.slots[game.cur], w = curW(); const need = w.mag - sl.ammo;
  if (settings.ammo === 'real') { const n = Math.min(need, sl.reserve); sl.ammo += n; sl.reserve -= n; } else sl.ammo = w.mag;
  game.reloading = 0; updateAmmoHud();
}
function toggleZoom() {
  const w = curW(); if (!w.zoom || game.reloading > 0 || game.equipT > 0) return;
  if (w.zoom2) game.zoomLevel = (game.zoomLevel + 1) % 3; else game.zoomLevel = game.zoomLevel ? 0 : 1;
  updateScopeUI();
}
function zoomNow() { const w = curW(); return game.zoomLevel === 2 ? w.zoom2 : game.zoomLevel === 1 ? w.zoom : 1; }
// current firing-error cone (degrees) and its parts, for the crosshair too
function spreadNow() {
  const w = curW(); const zoomed = game.zoomLevel > 0 && game.adsBlend > 0.6;
  let s = zoomed ? w.spread[1] : w.spread[0];
  // firing error grows from the first-shot value to the official max (wiki: Vandal 0.25° → 1.0° hip); zoomed max is
  // scaled by the same zoomed/hip ratio (approx – no published zoomed max). Ramp length (6 shots) is approx.
  if (game.rec.n > 0 && w.cls !== 'MELEE') { const mx = zoomed && w.spread[0] > 0 ? w.maxSpread * w.spread[1] / w.spread[0] : w.maxSpread; s += Math.max(0, mx - s) * Math.min(1, game.rec.n / 6); }
  if (w.tighten && game.rec.n > 3) s = Math.min(s, w.tighten);
  let mv = 0;
  const run = runSpeed(w), f = hSpeed() / run;
  if (!game.onGround) mv = w.err[2];
  else if (f > MOVE.deadzone) mv = f <= MOVE.walkMul ? w.err[0] * (f - MOVE.deadzone) / (MOVE.walkMul - MOVE.deadzone) : lerp(w.err[0], w.err[1], (f - MOVE.walkMul) / (1 - MOVE.walkMul));
  if (game.landT > 0 && w.cls !== 'MELEE') mv += MOVE.landPenalty;
  let total = s + mv; if (game.crouch > 0.5 && game.onGround) total *= 0.85;
  return { total, fire: s, move: mv };
}
function fireShot(eye) {
  const sl = game.slots[game.cur], w = curW();
  if (w.cls !== 'MELEE') { sl.ammo--; }
  game.shots++; if (isAccurate()) game.stopShots++;
  game.protectT = 0; game.muzzle = 0.045; game.recoilVis = 1; game.rec.since = 0; game.rec.rate = null;
  AU.shot(w.cls);
  // direction: aim (yaw/pitch) + full recoil offset + random point in the firing-error cone
  const sp = spreadNow().total * DEG; const ang = Math.random() * Math.PI * 2, mag = (w.cls === 'MELEE' ? 0 : Math.sqrt(Math.random())) * sp;
  const base = viewMatrix(game.yaw + game.rec.side * DEG, game.pitch + game.rec.up * DEG, 0, eye);
  const d = [0, 1, 2].map(i => base.f[i] + base.r[i] * Math.cos(ang) * Math.tan(mag) + base.u[i] * Math.sin(ang) * Math.tan(mag));
  const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
  const range = w.cls === 'MELEE' ? w.dmg[0][0] : 200;
  const tProp = Math.min(rayProps(eye, d), range);
  let best = null;
  for (const b of game.bots) { if (!b.alive) continue; const h = bodyHit(eye, d, b.x, b.z, b.geom()); if (h && h.t < tProp && (!best || h.t < best.t)) best = { ...h, bot: b }; }
  for (const T of game.targets) { if (!T.active || T.kind !== 'op') continue; const h = bodyHit(eye, d, T.x, T.z, botGeom(T.crouch, 0)); if (h && h.t < tProp && (!best || h.t < best.t)) best = { ...h, dummy: T }; }
  if (best) {
    const dist = best.t; const dmg = weaponDamage(w, dist, best.part);
    game.hits++; if (best.part === 'head') game.headHits++; if (best.part === 'leg') game.legHits++;
    game.hitMarker = 0.12; game.hitHead = best.part === 'head'; AU.hit(best.part === 'head');
    const p = [eye[0] + d[0] * dist, eye[1] + d[1] * dist, eye[2] + d[2] * dist];
    game.impacts.push({ p, t: 0.1, c: best.part === 'head' ? [1, 0.25, 0.3] : [1, 0.85, 0.4] });
    if (best.bot) best.bot.takeDamage(dmg, best.part); else drillHit(best.dummy, dmg, best.part);
  } else {
    game.misses++;
    if (tProp < 199) game.impacts.push({ p: [eye[0] + d[0] * tProp, eye[1] + d[1] * tProp, eye[2] + d[2] * tProp], t: 0.25, c: [0.15, 0.15, 0.17], hole: true });
  }
  if (w.cls !== 'MELEE') { const m = viewMatrix(game.yaw, game.pitch, 0, eye); game.tracers.push({ a: [eye[0] + m.r[0] * 0.18 - m.u[0] * 0.12, eye[1] + m.r[1] * 0.18 - m.u[1] * 0.12, eye[2] + m.r[2] * 0.18 - m.u[2] * 0.12], b: [eye[0] + d[0] * (best ? best.t : tProp), eye[1] + d[1] * (best ? best.t : tProp), eye[2] + d[2] * (best ? best.t : tProp)], t: 0.05, c: [1, 0.9, 0.6] }); }
  // recoil: bullets climb, a share of it moves the camera, it resets by itself after you stop
  const R = w.recoil, n = game.rec.n; const runK = !game.onGround || hSpeed() > runSpeed(w) * 0.5 ? (R.runMul || 1) : 1;
  const upStep = (R.up[n] ?? R.up[R.up.length - 1] * 0.35) * runK;
  game.rec.up = Math.min(R.upMax, game.rec.up + upStep);
  if (n >= R.protect) { game.rec.side += game.rec.dir * R.side * rand(0.5, 1.2); if (game.rec.sprayT > 0.6 && Math.random() < 0.1) game.rec.dir *= -1; }
  else game.rec.side += rand(-0.04, 0.04);
  const sideCap = R.upMax * 0.7; if (Math.abs(game.rec.side) > sideCap) { game.rec.side = Math.sign(game.rec.side) * sideCap; game.rec.dir = -Math.sign(game.rec.side); }
  game.rec.n++;
  if (sl.ammo <= 0 && w.cls !== 'MELEE') startReload();
  updateAmmoHud();
}
function updateWeapon(dt, eye) {
  game.muzzle = Math.max(0, game.muzzle - dt); game.hitMarker = Math.max(0, game.hitMarker - dt); game.killT = Math.max(0, game.killT - dt); game.recoilVis = Math.max(0, game.recoilVis - dt * 12);
  const w = curW(), sl = game.slots[game.cur];
  // zoom blend (ADS transition time is a setting: no public value)
  game.adsBlend = clamp(game.adsBlend + (game.zoomLevel > 0 ? dt : -dt) / Math.max(0.05, settings.zoomTime), 0, 1);
  if (game.equipT > 0) { game.equipT -= dt; game.fireCd = Math.max(game.fireCd, 0); }
  if (game.reloading > 0) { game.reloading -= dt; if (game.reloading <= 0) finishReload(); }
  game.fireCd -= dt; game.semiQueued = Math.max(0, game.semiQueued - dt);
  const zoomed = game.zoomLevel > 0 && game.adsBlend > 0.6;
  let rps = zoomed && w.adsRps ? w.adsRps : w.rps;
  if (w.rpsMax) { game.spinT = game.firing ? game.spinT + dt : 0; rps = lerp(w.rps, w.rpsMax, clamp(game.spinT / 1.0, 0, 1)); }
  const can = game.alive && game.equipT <= 0 && game.reloading <= 0;
  if (can && sl.ammo <= 0 && w.cls !== 'MELEE' && (game.firing || game.semiQueued > 0)) { startReload(); if (game.reloading <= 0) { game.semiQueued = 0; if (game.firing && game.fireCd <= 0) { AU.click(); game.fireCd = 0.3; } } }
  const burstMode = zoomed && w.adsBurst;
  if (can && (sl.ammo > 0 || w.cls === 'MELEE')) {
    if (burstMode) {
      if (game.burstLeft > 0 && game.fireCd <= 0) { fireShot(eye); game.burstLeft--; game.fireCd += game.burstLeft > 0 ? 1 / rps : w.burstGap; }
      else if (game.burstLeft === 0 && game.fireCd <= 0 && (game.firing && game.semiQueued > 0 || game.semiQueued > 0)) { game.burstLeft = w.adsBurst; game.semiQueued = 0; }
    } else if (w.auto) {
      let guard = 0; while (game.firing && game.fireCd <= 0 && (sl.ammo > 0 || w.cls === 'MELEE') && guard++ < 6) { fireShot(eye); game.fireCd += 1 / rps; }
    } else if (game.semiQueued > 0 && game.fireCd <= 0) { game.semiQueued = 0; fireShot(eye); game.fireCd = 1 / rps; }
  }
  if (game.fireCd < 0 && !game.firing && game.burstLeft === 0) game.fireCd = 0;
  // recoil recovery: VALORANT resets the pattern by itself. The whole reset, counted from the last shot, takes
  // `recover` seconds (src 0.50: Vandal 0.375 s, Phantom 0.35 s); it starts once the next shot would have been due.
  const R = w.recoil; game.rec.since += dt;
  if (game.firing && game.rec.n > 0) game.rec.sprayT += dt;
  const wait = Math.max(1 / rps, 0.08) * 1.05;
  if (game.rec.since > wait && (game.rec.up > 0 || game.rec.side !== 0)) {
    if (!game.rec.rate) { const left = Math.max(0.05, R.recover - wait); game.rec.rate = [game.rec.up / left, Math.abs(game.rec.side) / left]; }
    const prev = game.rec.up + Math.abs(game.rec.side) + 1e-6;
    game.rec.up = Math.max(0, game.rec.up - game.rec.rate[0] * dt); const sd = Math.max(0, Math.abs(game.rec.side) - game.rec.rate[1] * dt); game.rec.side = Math.sign(game.rec.side) * sd;
    const now = game.rec.up + Math.abs(game.rec.side); game.rec.n = now < 0.02 ? 0 : Math.ceil(game.rec.n * now / prev - 0.01); if (game.rec.n === 0) { game.rec.sprayT = 0; game.rec.up = 0; game.rec.side = 0; }
  } else if (!game.firing && game.rec.since > 0.3) { game.rec.n = 0; game.rec.sprayT = 0; }
  if (game.firing) game.fireTime += dt;
  for (let i = game.impacts.length - 1; i >= 0; i--) { game.impacts[i].t -= dt; if (game.impacts[i].t <= 0) game.impacts.splice(i, 1); }
  for (let i = game.tracers.length - 1; i >= 0; i--) { game.tracers[i].t -= dt; if (game.tracers[i].t <= 0) game.tracers.splice(i, 1); }
}

// ---------------------------------------------------------------- deathmatch bots
const BOTS_ALIVE = () => game.bots.filter(b => b.alive);
function playerTargetPoints() { const e = eyePos(); return { head: e, chest: [e[0], e[1] - 0.45, e[2]], legs: [e[0], game.py + 0.6, e[2]] }; }
function chooseSpawn(avoid, mustHideFrom) {
  let best = null, bestS = -1;
  for (const s of SPAWNS) {
    let d = 99; for (const a of avoid) d = Math.min(d, Math.hypot(s[0] - a[0], s[1] - a[1]));
    let sc = Math.min(d, 30) + Math.random() * 6;
    if (mustHideFrom && visible(mustHideFrom, [s[0], 1.5, s[1]])) sc -= 25;
    if (sc > bestS) { bestS = sc; best = s; }
  }
  return best || [0, 0];
}
class Bot {
  constructor(i) { this.name = BOT_NAMES[i % BOT_NAMES.length]; this.kills = 0; this.deaths = 0; this.id = i; this.respawn(true); }
  respawn(first) {
    const avoid = game.bots.filter(b => b !== this && b.alive).map(b => [b.x, b.z]); avoid.push([game.px, game.pz], [game.px, game.pz]);
    const s = chooseSpawn(avoid, game.alive ? eyePos() : null);
    Object.assign(this, { x: s[0], z: s[1], y: 0, vy: 0, vx: 0, vz: 0, yaw: Math.random() * 6.28, hp: DM.hp, armor: DM.armor, alive: true, deadT: 0, flash: 0, crouch: 0, crouchT: 0,
      state: 'roam', path: null, pi: 0, seeT: 0, lastSeen: null, alertT: 0, fireCd: 0, burst: 0, phase: 'strafe', phaseT: rand(0.2, 0.5), strafeDir: Math.random() < 0.5 ? -1 : 1,
      thinkT: rand(0, 0.1), canSee: false, headOnly: false, stuckT: 0, stepT: 0, reveal: 0, muzzle: 0, gun: game.weaponMode ? 'vandal' : pick(BOT_GUNS), aimT: 0 });
    this.goal = null; if (!first) this.reveal = 0;
  }
  geom() { return botGeom(this.crouch, this.y); }
  eye() { return [this.x, this.geom().headY, this.z]; }
  speedMul() { return settings.botSpeed; }
  takeDamage(dmg, part) {
    this.flash = 0.1; this.alertT = 3; this.lastSeen = { x: game.px, z: game.pz, t: game.t };
    const toArmor = Math.min(this.armor, dmg); this.armor -= toArmor; this.hp -= dmg - toArmor; game.damage += dmg;
    if (this.hp <= 0) this.die(part === 'head');
  }
  die(head) {
    this.alive = false; this.deadT = 0; this.deaths++; game.kills++; if (head) game.hsKills++;
    game.killT = 1.1; game.killHead = head; game.streak = (game.streak || 0) + 1; AU.kill(head);
    game.packs.push({ x: this.x, z: this.z, t: DM.packLife });
    const sl = game.slots[game.cur]; const w = curW(); if (w.cls !== 'MELEE') { sl.ammo = w.mag; game.reloading = 0; }   // DM: a kill reloads your weapon
    pushFeed(t('feed.you'), WEAPONS[game.slots[game.cur].key].name, this.name, head, true);
    updateAmmoHud();
    if (settings.killGoal && game.kills >= settings.killGoal && game.mode.id === 'dm') game.timeLeft = Math.min(game.timeLeft, 0.6);
  }
  update(dt) {
    if (!this.alive) { this.deadT += dt; if (this.deadT > DM.respawn) this.respawn(false); return; }
    const D = BOT_DIFF[settings.botDiff] || BOT_DIFF.normal; const mv = settings.botMove;
    this.flash = Math.max(0, this.flash - dt); this.alertT = Math.max(0, this.alertT - dt); this.reveal = Math.max(0, this.reveal - dt); this.muzzle = Math.max(0, this.muzzle - dt);
    // --- senses (10 Hz)
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.1;
      this.canSee = false; this.headOnly = false;
      if (game.alive) {
        const e = this.eye(), P = playerTargetPoints(); const dx = game.px - this.x, dz = game.pz - this.z, dist = Math.hypot(dx, dz);
        const ang = Math.abs(wrapAng(Math.atan2(dx, -dz) - this.yaw));
        if (dist < 75 && (ang < 1.2 || this.alertT > 0 || dist < 3)) {
          const vh = visible(e, P.head), vc = visible(e, P.chest);
          if (vh || vc) { this.canSee = true; this.headOnly = vh && !vc; this.lastSeen = { x: game.px, z: game.pz, t: game.t }; }
        }
        // hearing: running footsteps (≈ 20 m, approx) and gunfire (≈ 45 m)
        if (!this.canSee && dist < 20 && game.onGround && hSpeed() > runSpeed(curW()) * 0.6) { this.alertT = Math.max(this.alertT, 1.5); this.lastSeen = { x: game.px, z: game.pz, t: game.t }; }
        if (!this.canSee && dist < 45 && game.rec.since < 0.1) { this.alertT = Math.max(this.alertT, 1.5); this.lastSeen = { x: game.px, z: game.pz, t: game.t }; }
      }
      if (this.canSee) this.reveal = Math.max(this.reveal, 0.15);
    }
    if (this.canSee) this.seeT += dt; else this.seeT = Math.max(0, this.seeT - dt * 2);
    // --- decide movement
    let wantX = 0, wantZ = 0, speed = runSpeed(WEAPONS[this.gun]) * this.speedMul(), faceTo = null;
    if (mv === 'walk') speed *= MOVE.walkMul;
    if (this.canSee && game.alive) {
      faceTo = [game.px, game.pz]; this.path = null;
      const dx = game.px - this.x, dz = game.pz - this.z, dist = Math.hypot(dx, dz) || 1;
      const reacted = this.seeT >= D.reaction;
      if (mv !== 'static') {
        this.phaseT -= dt;
        if (this.phase === 'strafe') {
          const px = -dz / dist * this.strafeDir, pz = dx / dist * this.strafeDir; wantX = px; wantZ = pz;
          if (dist > 22) { wantX += dx / dist * 0.6; wantZ += dz / dist * 0.6; }
          if (this.phaseT <= 0 && reacted) { this.phase = 'shoot'; this.burst = Math.round(rand(D.burst[0], D.burst[1])); this.phaseT = 2; if (mv === 'wild' && Math.random() < 0.3) this.crouchT = 1; }
          else if (this.phaseT <= 0) { this.strafeDir *= -1; this.phaseT = rand(0.15, 0.45); }
          if (mv === 'wild' && this.y === 0 && Math.random() < dt * 0.8) this.vy = MOVE.jumpV;
        } else { // stop and shoot (bots counter-strafe too: they only fire once they are slow)
          if (this.burst <= 0 || this.phaseT <= 0) { this.phase = 'strafe'; this.crouchT = 0; this.strafeDir = Math.random() < 0.6 ? -this.strafeDir : this.strafeDir; this.phaseT = rand(0.18, 0.55); }
        }
      } else if (reacted && this.burst <= 0) this.burst = Math.round(rand(D.burst[0], D.burst[1]));
      // shooting
      this.fireCd -= dt;
      const stopped = Math.hypot(this.vx, this.vz) < runSpeed(WEAPONS[this.gun]) * MOVE.deadzone + 0.05;
      if (reacted && this.burst > 0 && this.fireCd <= 0 && (stopped || mv === 'static')) { this.shoot(D, dist); this.burst--; this.fireCd = 1 / WEAPONS[this.gun].rps; if (this.burst <= 0) this.fireCd = rand(0.15, 0.4); }
    } else {
      this.crouchT = 0; this.phase = 'strafe';
      if (mv === 'static') { /* hold position */ }
      else {
        const hunting = this.lastSeen && game.t - this.lastSeen.t < 5;
        if (!this.path || this.pi >= this.path.length) {
          let gx, gz;
          if (hunting) { gx = this.lastSeen.x; gz = this.lastSeen.z; this.lastSeen = null; }
          else if (Math.random() < 0.6 && game.alive) { [gx, gz] = randomFreePoint(game.px, game.pz, 14); }
          else { const s = pick(SPAWNS); gx = s[0]; gz = s[1]; }
          this.path = findPath(this.x, this.z, gx, gz); this.pi = 0; if (!this.path) this.path = [randomFreePoint(this.x, this.z, 6)];
        }
        const wp = this.path[this.pi]; const dx = wp[0] - this.x, dz = wp[1] - this.z, d = Math.hypot(dx, dz);
        if (d < 0.45) this.pi++; else { wantX = dx / d; wantZ = dz / d; faceTo = [wp[0], wp[1]]; }
        if (this.alertT > 0 && this.lastSeen) faceTo = [this.lastSeen.x, this.lastSeen.z];
      }
    }
    // --- physics (same accel / deceleration model as the player)
    const wl = Math.hypot(wantX, wantZ);
    if (wl > 0) { const tx = wantX / wl * speed, tz = wantZ / wl * speed; let dx = tx - this.vx, dz = tz - this.vz; const dl = Math.hypot(dx, dz), a = MOVE.counter * dt; if (dl > a) { dx = dx / dl * a; dz = dz / dl * a; } this.vx += dx; this.vz += dz; }
    else { const sp = Math.hypot(this.vx, this.vz); if (sp > 0) { const ns = Math.max(0, sp - MOVE.friction * dt); this.vx *= ns / sp; this.vz *= ns / sp; } }
    const ox = this.x, oz = this.z;
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    for (const o of game.bots) {   // bots do not walk through each other
      if (o === this || !o.alive) continue; const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), m = BOT_R * 2.2;
      if (d < m && d > 1e-4) { nx += dx / d * (m - d) * 0.5; nz += dz / d * (m - d) * 0.5; } else if (d <= 1e-4) nx += 0.05;
    }
    [this.x, this.z] = collide(nx, nz, BOT_R);
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (wl > 0 && moved < speed * dt * 0.25) { this.stuckT += dt; if (this.canSee) this.strafeDir *= -1; if (this.stuckT > 0.8) { this.path = null; this.stuckT = 0; } } else this.stuckT = 0;
    if (this.y > 0 || this.vy > 0) { this.vy -= MOVE.gravity * dt; this.y += this.vy * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; } }
    this.crouch += (this.crouchT - this.crouch) * Math.min(1, dt * 10);
    if (faceTo) { const want = Math.atan2(faceTo[0] - this.x, -(faceTo[1] - this.z)); this.yaw += clamp(wrapAng(want - this.yaw), -9 * dt, 9 * dt); }
    // footsteps you can hear (running only – walking bots are silent, as in the game)
    const sp = Math.hypot(this.vx, this.vz);
    if (settings.footsteps && this.y === 0 && sp > runSpeed(WEAPONS[this.gun]) * 0.6) {
      this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.34; const d = Math.hypot(this.x - game.px, this.z - game.pz); if (d < 28) AU.step(panOf(this.x, this.z), 0.2 * Math.pow(1 - d / 28, 1.6)); }
    }
  }
  shoot(D, dist) {
    const w = WEAPONS[this.gun]; this.muzzle = 0.05; this.reveal = 1.5;
    const pmove = hSpeed() / runSpeed(curW());
    let p = D.hit * Math.pow(clamp(10 / Math.max(dist, 1), 0.35, 1.6), 0.6);
    if (!game.onGround) p *= 0.55; else if (pmove > MOVE.deadzone) p *= lerp(1, 0.55, clamp((pmove - MOVE.deadzone) / 0.6, 0, 1));
    if (game.crouch > 0.5) p *= 0.92;
    if (this.headOnly) p *= 0.55;
    p *= clamp(0.55 + (this.seeT - D.reaction) * 1.2, 0.55, 1) * D.track / (D.track || 1);
    const hit = settings.shootBack && game.alive && Math.random() < p;
    const P = playerTargetPoints(); const e = this.eye(); const mz = [this.x + Math.sin(this.yaw) * 0.45, e[1] - 0.25, this.z - Math.cos(this.yaw) * 0.45];
    let end;
    if (hit) {
      const part = this.headOnly || Math.random() < D.hs ? 'head' : Math.random() < 0.85 ? 'body' : 'leg';
      end = part === 'head' ? P.head : part === 'leg' ? P.legs : P.chest;
      damagePlayer(weaponDamage(w, dist, part), this, part);
    } else {
      const m = 0.5 + Math.random() * 0.9, a = Math.random() * 6.28; end = [P.chest[0] + Math.cos(a) * m, P.chest[1] + Math.sin(a) * m * 0.8, P.chest[2] + Math.sin(a) * m];
      const d = [end[0] - mz[0], end[1] - mz[1], end[2] - mz[2]], L = Math.hypot(...d); d[0] /= L; d[1] /= L; d[2] /= L; const tt = Math.min(rayProps(mz, d), 80); end = [mz[0] + d[0] * tt, mz[1] + d[1] * tt, mz[2] + d[2] * tt];
    }
    game.tracers.push({ a: mz, b: end, t: 0.07, c: [1, 0.55, 0.45] });
    AU.shot(w.cls, clamp(1.2 - dist / 50, 0.15, 1) * 0.7, panOf(this.x, this.z));
  }
}
function damagePlayer(dmg, bot, part) {
  if (!game.alive || game.protectT > 0) return;
  const toArmor = Math.min(game.armor, dmg); game.armor -= toArmor; game.hp -= dmg - toArmor; game.hurtT = 0.35; AU.hurt();
  const a = Math.atan2(bot.x - game.px, -(bot.z - game.pz)); game.dmgInd.push({ a, t: 1.0 });
  game.lastHitBy = bot;
  if (game.hp <= 0) {
    game.hp = 0; game.alive = false; game.deadT = 0; game.deaths++; game.streak = 0; bot.kills++;
    game.killer = { name: bot.name, gun: WEAPONS[bot.gun].name, part, hpLeft: bot.hp + bot.armor };
    pushFeed(bot.name, WEAPONS[bot.gun].name, t('feed.you'), part === 'head', false);
    game.firing = false; game.zoomLevel = 0; updateScopeUI();
    $('death').classList.remove('hidden'); $('death-by').textContent = `${bot.name} · ${WEAPONS[bot.gun].name}${part === 'head' ? ' · HEADSHOT' : ''}`;
  }
}
function respawnPlayer(first) {
  const avoid = BOTS_ALIVE().map(b => [b.x, b.z]);
  const s = avoid.length ? chooseSpawn(avoid, null) : pick(SPAWNS);
  Object.assign(game, { px: s[0], pz: s[1], py: 0, vx: 0, vz: 0, vy: 0, onGround: true, hp: DM.hp, armor: DM.armor, alive: true, protectT: DM.protect, spawnedAt: game.t, crouchHeld: false, crouch: 0, landT: 0 });
  // face the map centre-ish
  game.yaw = Math.atan2(-s[0] * 0.3, s[1] * 0.3) || 0; game.pitch = 0;
  giveLoadout(); game.reveal = first ? 0 : 2.0;   // DM: respawning reveals enemies briefly
  $('death').classList.add('hidden'); updateAmmoHud(); updateScopeUI();
}
function pushFeed(a, gun, b, head, mine) { game.feed.unshift({ a, gun, b, head, mine, t: 4.5 }); if (game.feed.length > 5) game.feed.pop(); renderFeed(); }

// ---------------------------------------------------------------- drills
class Target {
  constructor(o) { Object.assign(this, { x: 0, y: 1.0, z: -6, vx: 0, vy: 0, vz: 0, r: 0.3, crouch: 0, active: true, kind: 'op', timer: 0, lean: 0 }, o); }
  rayHit(o, d) {
    if (this.kind !== 'op') return raySphere(o, d, [this.x, this.y, this.z], this.r) < Infinity;
    return !!bodyHit(o, d, this.x, this.z, botGeom(this.crouch, 0));
  }
}
const B = { xmin: -10, xmax: 10, ymin: 0.9, ymax: 4.2, zmin: -26, zmax: -5 };
// onetap: head-height cover boxes the dummy peeks over
const TAP_SPOTS = [[-8, -10], [-3, -14], [4, -12], [9, -18], [-6, -22], [1, -26], [7, -28], [-10, -30], [3, -20], [-1, -9]];
function drillExtra() {
  if (game.mode.id === 'onetap') for (const [x, z] of TAP_SPOTS) addProp(x, z, 1.4, 0.5, 1.45, 'cover');
  if (game.mode.id === 'stopping') { addProp(-12.5, 2, 1, 4, 1.0, 'crate'); addProp(12.5, 2, 1, 4, 1.0, 'crate'); }
}
function spawnTargets() {
  const T = game.targets = []; const m = game.mode.id; const D = game.diff; const RUN = 5.4;
  if (m === 'track') T.push(new Target({ x: 0, z: -9, vx: RUN * D }));
  else if (m === 'reactive') T.push(new Target({ x: 0, z: -8, vx: RUN * D, timer: 0.4 }));
  else if (m === 'air') T.push(new Target({ x: 0, y: 2.5, z: -11, vx: 5 * D, vy: 3 * D, vz: 3 * D, kind: 'ball', r: 0.33 }));
  else if (m === 'vision') { for (let i = 0; i < 5; i++) T.push(new Target({ x: rand(-8, 8), y: rand(1.2, 4), z: rand(-18, -6), vx: rand(-1, 1) * 7 * D, vy: rand(-1, 1) * 3 * D, vz: rand(-1, 1) * 3 * D, kind: 'ball', r: 0.3, active: i === 0 })); }
  else if (m === 'flicktrack') T.push(new Target({ x: 0, z: -10, vx: RUN * D, timer: 2.2 }));
  else if (m === 'microdot') T.push(new Target({ x: 0, y: 1.6, z: -14, kind: 'dot', r: 0.14, vx: 0.8 * D, vy: 0.4 * D }));
  else if (m === 'stopping') { T.push(newStopDummy()); }
  else if (m === 'onetap') { T.push(newTapDummy()); }
}
function newStopDummy() { const z = rand(-24, -9); return new Target({ x: rand(-8, 8), z, vx: (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 2.6) * game.diff, hp: 150, timer: rand(0.4, 1.2), born: game.t }); }
function newTapDummy() {
  let s; do { s = pick(TAP_SPOTS); } while (game.lastTap === s && TAP_SPOTS.length > 1); game.lastTap = s;
  return new Target({ x: s[0], z: s[1] - 0.75, crouch: 1, crouchT: 1, hp: 150, timer: rand(0.4, 1.0), window: 1.4 / Math.sqrt(game.diff), state: 'wait', born: game.t, shownAt: game.t, active: false });
}
function drillHit(T, dmg, part) {
  T.hp -= dmg; T.flash = 0.1;
  if (game.mode.id === 'onetap' && part !== 'head') { T.hp = Math.max(T.hp, 1); }
  if (T.hp <= 0) {
    game.kills++; if (part === 'head') game.hsKills++; game.killT = 0.8; game.killHead = part === 'head'; AU.kill(part === 'head');
    if (game.mode.id === 'onetap') { game.tapTimes.push(game.t - T.shownAt); game.score += 100 + Math.max(0, Math.round((T.window - (game.t - T.shownAt)) * 60)); game.targets = [newTapDummy()]; }
    else { game.score += part === 'head' ? 150 : 100; game.targets = [newStopDummy()]; game.targets[0].timer = 0.3; }
    const sl = game.slots[game.cur]; sl.ammo = curW().mag; updateAmmoHud();
  }
}
function updateTargets(dt) {
  const m = game.mode.id, D = game.diff, tt = game.t;
  for (const T of game.targets) {
    T.flash = Math.max(0, (T.flash || 0) - dt);
    switch (m) {
      case 'track':
        T.vx += rand(-1, 1) * 30 * D * dt; T.vx = clamp(T.vx, -6.75 * D, 6.75 * D);
        if (Math.abs(T.vx) < 2.5 * D) T.vx += Math.sign(T.vx || 1) * 2 * D * dt;
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx * rand(0.8, 1.1); T.timer = rand(0.6, 1.8) / D; }
        T.vz = Math.sin(tt * 0.7) * 1.5 * D; break;
      case 'reactive': // VALORANT-style ADAD: full run speed both ways, instant-ish reversals, occasional crouch
        T.timer -= dt;
        if (T.timer <= 0) { const roll = Math.random(); T.goal = roll < 0.6 ? -Math.sign(T.goal || T.vx || 1) * 5.4 * D : roll < 0.75 ? 0 : Math.sign(T.goal || 1) * 5.4 * D; T.crouchTarget = Math.random() < 0.2 ? 1 : 0; T.timer = rand(0.16, 0.6) / D; }
        { const dv = (T.goal || 0) - T.vx, a = MOVE.counter * dt * 1.2; T.vx += clamp(dv, -a, a); }
        T.crouch += ((T.crouchTarget || 0) - T.crouch) * Math.min(1, dt * 14); T.vz *= Math.exp(-dt * 2); break;
      case 'air': case 'vision': {
        const k = m === 'air' ? 40 : 30; T.vx += rand(-1, 1) * k * D * dt; T.vy += rand(-1, 1) * 20 * D * dt; T.vz += rand(-1, 1) * 15 * D * dt;
        const sp = Math.hypot(T.vx, T.vy, T.vz), mx = (m === 'air' ? 10 : 9) * D; if (sp > mx) { T.vx *= mx / sp; T.vy *= mx / sp; T.vz *= mx / sp; }
        if (m === 'air') { T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx; T.timer = rand(0.5, 1.5) / D; } } break; }
      case 'flicktrack':
        T.timer -= dt;
        if (T.timer <= 0) { T.x = rand(-9, 9); T.z = rand(-22, -6); T.vx = (Math.random() < 0.5 ? -1 : 1) * rand(3, 6) * D; T.timer = rand(1.6, 2.6) / Math.sqrt(D); }
        T.vx += rand(-1, 1) * 20 * D * dt; break;
      case 'microdot':
        T.vx += rand(-1, 1) * 14 * D * dt; T.vy += rand(-1, 1) * 10 * D * dt;
        T.vx = clamp(T.vx, -2.2 * D, 2.2 * D); T.vy = clamp(T.vy, -1.4 * D, 1.4 * D);
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx; T.timer = rand(0.3, 1.0) / D; } break;
      case 'stopping': // dummy walks a lane and stops now and then; you strafe and must stop to hit
        T.timer -= dt; if (T.timer <= 0) { T.vx = Math.abs(T.vx) > 0.1 ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 2.6) * D; T.timer = rand(0.5, 1.4); } break;
      case 'onetap':
        T.timer -= dt;
        if (T.state === 'wait' && T.timer <= 0) { T.state = 'up'; T.crouchT = 0; T.active = true; T.shownAt = game.t; T.timer = T.window; }
        else if (T.state === 'up' && T.timer <= 0) { T.state = 'gone'; game.tapMiss = (game.tapMiss || 0) + 1; game.targets = [newTapDummy()]; return; }
        T.crouch += ((T.crouchT ?? 1) - T.crouch) * Math.min(1, dt * 16); break;
    }
    if (m === 'onetap') continue;
    T.x += T.vx * dt; T.y += T.vy * dt; T.z += T.vz * dt;
    if (T.x < B.xmin) { T.x = B.xmin; T.vx = Math.abs(T.vx); T.goal = Math.abs(T.goal || 0); } if (T.x > B.xmax) { T.x = B.xmax; T.vx = -Math.abs(T.vx); T.goal = -Math.abs(T.goal || 0); }
    if (T.kind !== 'op') { if (T.y < B.ymin) { T.y = B.ymin; T.vy = Math.abs(T.vy); } if (T.y > B.ymax) { T.y = B.ymax; T.vy = -Math.abs(T.vy); } } else { T.y = 0; T.vy = 0; }
    if (T.z < B.zmin) { T.z = B.zmin; T.vz = Math.abs(T.vz); } if (T.z > B.zmax) { T.z = B.zmax; T.vz = -Math.abs(T.vz); }
  }
  if (m === 'vision') {
    game.visionTimer -= dt;
    if (game.visionTimer <= 0) { const cur = game.targets.findIndex(x => x.active); let nx; do { nx = Math.floor(Math.random() * game.targets.length); } while (nx === cur); game.targets.forEach((x, i) => x.active = i === nx); game.visionTimer = rand(0.9, 2.0) / Math.sqrt(D); }
  }
}

// ---------------------------------------------------------------- input
const input = { dx: 0, dy: 0, events: 0, hz: 0, hzT: 0 };
const keys = {};
let locked = false;
function onMove(e) { if (!locked) return; input.dx += e.movementX; input.dy += e.movementY; input.events++; }
if ('onpointerrawupdate' in window) document.addEventListener('pointerrawupdate', (e) => { const ev = e.getCoalescedEvents?.() || []; if (ev.length > 1) { for (const c of ev) onMove(c); } else onMove(e); });
else document.addEventListener('mousemove', (e) => { const ev = e.getCoalescedEvents?.() || []; if (ev.length > 1) { for (const c of ev) onMove(c); } else onMove(e); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && game.running) pauseToMenu(); });
function isDown(action) { const c = settings.keys[action]; return !!(c && keys[c]); }
function actionsOf(code) { return KEY_ACTIONS.filter(a => settings.keys[a] === code); }
function keyName(code) {
  if (!code) return '—';
  const m = { Mouse0: 'Mouse L', Mouse1: 'Mouse M', Mouse2: 'Mouse R', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Backspace: 'BackSpace', Escape: 'Esc', Tab: 'Tab', CapsLock: 'CapsLock', Enter: 'Enter' };
  return m[code] || code.replace(/^Key|^Digit|^Arrow/, '') || code;
}
function pressCode(code, repeat) {
  keys[code] = true; if (!game.running) return;
  for (const act of actionsOf(code)) {
    switch (act) {
      case 'fire': game.firing = true; if (!repeat) game.semiQueued = 0.15; break;
      case 'ads': if (!repeat) { if (settings.adsmode === 'toggle' || curW().zoom2) toggleZoom(); else { game.adsHeld = true; if (!game.zoomLevel) toggleZoom(); } } break;
      case 'walk': if (!repeat && settings.walkmode === 'toggle') game.walkToggle = !game.walkToggle; break;
      case 'crouch': if (!repeat) { if (settings.crouchmode === 'toggle') game.crouchHeld = !game.crouchHeld; else game.crouchHeld = true; } break;
      case 'reload': if (game.weaponMode && game.alive) startReload(); break;
      case 'primary': if (game.weaponMode) switchSlot(1); break;
      case 'secondary': if (game.weaponMode) switchSlot(2); break;
      case 'knife': if (game.weaponMode) switchSlot(3); break;
      case 'scoreboard': if (game.mode.id === 'dm') { renderScoreboard(); $('scoreboard').classList.remove('hidden'); } break;
      case 'restart': if (!repeat) { startRun(); } break;
    }
  }
}
function releaseCode(code) {
  keys[code] = false;
  for (const act of actionsOf(code)) {
    if (act === 'fire') game.firing = false;
    if (act === 'ads' && settings.adsmode === 'hold' && !(game.slots[game.cur] && curW().zoom2)) { game.adsHeld = false; if (game.zoomLevel) { game.zoomLevel = 0; updateScopeUI(); } }
    if (act === 'crouch' && settings.crouchmode === 'hold') game.crouchHeld = false;
    if (act === 'scoreboard') $('scoreboard').classList.add('hidden');
  }
}
canvas.addEventListener('mousedown', (e) => { if (!locked) return; e.preventDefault(); pressCode('Mouse' + e.button, false); });
window.addEventListener('mouseup', (e) => releaseCode('Mouse' + e.button));
window.addEventListener('contextmenu', (e) => { if (game.running) e.preventDefault(); });
window.addEventListener('wheel', (e) => { if (!game.running || !locked) return; const c = e.deltaY < 0 ? 'WheelUp' : 'WheelDown'; pressCode(c, false); setTimeout(() => releaseCode(c), 40); }, { passive: true });
window.addEventListener('keydown', (e) => {
  if (KEYBIND.waiting) return;
  if (game.running) {
    if (e.code === 'Escape') { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); else pauseToMenu(); return; }
    if (actionsOf(e.code).length || e.ctrlKey || ['Space', 'Tab', 'AltLeft', 'AltRight', 'ControlLeft'].includes(e.code)) e.preventDefault();
  }
  pressCode(e.code, e.repeat);
});
window.addEventListener('keyup', (e) => releaseCode(e.code));
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; game.firing = false; });
async function requestLock() {
  AU.init();
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { if (KB_LOCK && document.fullscreenElement) await navigator.keyboard.lock(); } catch (e) {}
  try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) await p.catch(() => canvas.requestPointerLock()); }
  catch (e) { try { canvas.requestPointerLock(); } catch (_) {} }
}

// ---------------------------------------------------------------- HUD
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateAmmoHud() {
  if (!game.weaponMode || !game.slots[game.cur]) return;
  const sl = game.slots[game.cur], w = curW();
  setText('h-gun', w.name.toUpperCase());
  setText('h-ammo', w.cls === 'MELEE' ? '—' : String(sl.ammo));
  setText('h-res', w.cls === 'MELEE' ? '' : settings.ammo === 'real' ? String(sl.reserve) : '∞');
  $('h-ammo').classList.toggle('low', w.cls !== 'MELEE' && sl.ammo <= Math.ceil(w.mag * 0.25));
  document.querySelectorAll('#h-slots i').forEach(el => el.classList.toggle('on', +el.dataset.s === game.cur));
  const s1 = game.slots[1], s2 = game.slots[2]; if (s1 && s2) { setText('h-s1', WEAPONS[s1.key].name); setText('h-s2', WEAPONS[s2.key].name); }
}
function renderFeed() {
  $('killfeed').innerHTML = game.feed.map(f => `<div class="kf${f.mine ? ' mine' : ' dead'}"><b>${f.a}</b><span class="g">${f.gun}</span>${f.head ? '<i class="hs" title="headshot"></i>' : ''}<b>${f.b}</b></div>`).join('');
}
function renderScoreboard() {
  const rows = [{ name: t('feed.you'), k: game.kills, d: game.deaths, me: true }, ...game.bots.map(b => ({ name: b.name, k: b.kills, d: b.deaths }))].sort((a, b) => b.k - a.k || a.d - b.d);
  $('sb-body').innerHTML = rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.k}</td><td>${r.d}</td></tr>`).join('');
}
function placement() { const ks = game.bots.map(b => b.kills); return 1 + ks.filter(k => k > game.kills).length; }
// ---- VALORANT-style crosshair drawn on a small 2D canvas (redrawn only when the error changes)
const xh = $('xh'), xctx = xh.getContext('2d'); let xhSig = '';
function xhColor(x) { return x.c === 8 ? '#' + (x.u || 'FFFFFF').slice(0, 6) : XH_COLORS[x.c] || '#FFFFFF'; }
// which profile is on screen: ADS profile while zoomed with a non-scoped gun (if enabled), else primary
function xhProfile() { return settings.xhAdsOn && game.zoomLevel > 0 && game.slots[game.cur] && !curW().scope ? settings.xhAds : settings.xh; }
function drawCrosshair(errPx, movePx, preview, prof) {
  const x = prof || xhProfile(); const c = preview || xh; const ctx = preview ? c.getContext('2d') : xctx;
  const dpr = window.devicePixelRatio || 1; const scale = preview ? 3 : Math.max(1, Math.round((window.innerHeight * dpr / 1080) * 100) / 100);
  const S = preview ? 192 : 220; const sig = `${errPx.toFixed(1)}|${movePx.toFixed(1)}|${JSON.stringify(x)}|${scale}`;
  if (!preview && sig === xhSig) return; if (!preview) xhSig = sig;
  const px = Math.round(S * (preview ? 1 : dpr)); if (c.width !== px) { c.width = px; c.height = px; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px);
  const cx = Math.floor(px / 2), col = xhColor(x), u = scale;
  const rect = (x0, y0, w, h, alpha) => {
    if (x.h) { ctx.globalAlpha = x.o * alpha; ctx.fillStyle = '#000'; const o = Math.round(x.t * u); ctx.fillRect(x0 - o, y0 - o, w + 2 * o, h + 2 * o); }
    ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fillRect(x0, y0, w, h);
  };
  // VALORANT line set: horizontal length / optional independent vertical length, offset grows with movement / firing
  // error × their multipliers
  const lines = (show, th, len, vind, vlen, off, alpha, mErr, mMul, fErr, fMul) => {
    if (!show || alpha <= 0) return;
    const T = Math.max(1, Math.round(th * u)), L = Math.round(len * u), LV = Math.round((vind ? vlen : len) * u);
    const O = Math.round(off * u + (fErr ? errPx * fMul : 0) + (mErr ? movePx * mMul : 0)); const h0 = Math.floor(T / 2), e = T % 2 ? 1 : 0;
    if (LV > 0) { rect(cx - h0, cx - O - LV, T, LV, alpha); rect(cx - h0, cx + O + e, T, LV, alpha); }
    if (L > 0) { rect(cx - O - L, cx - h0, L, T, alpha); rect(cx + O + e, cx - h0, L, T, alpha); }
  };
  lines(x.ob, x.ot, x.ol, x.og, x.ov, x.oo, x.oa, x.om, x.os, x.of, x.oe);
  lines(x.ib, x.it, x.il, x.ig, x.iv, x.io, x.ia, x.im, x.is, x.if, x.ie);
  if (x.d) { const T = Math.max(1, Math.round(x.z * u)); rect(cx - Math.floor(T / 2), cx - Math.floor(T / 2), T, T, x.a); }
  ctx.globalAlpha = 1;
}
function applySniperDot() {
  const sn = settings.xhSn, el = $('scope-dot'); if (!el) return;
  const col = sn.c === 8 ? '#' + (sn.u || 'FF0000').slice(0, 6) : XH_COLORS[sn.c] || '#FF0000'; const d = Math.max(2, sn.s * 4);
  el.style.display = sn.d ? '' : 'none'; el.style.background = col; el.style.opacity = sn.o; el.style.width = el.style.height = d + 'px';
}
function errToPx(deg) { const v = VAL.vfov(zoomBlend()) * DEG; return Math.tan(deg * DEG) / Math.tan(v / 2) * (window.innerHeight * (window.devicePixelRatio || 1) / 2); }
function zoomBlend() { const z = zoomNow(); const k = smooth(0, 1, game.adsBlend); return 1 + (z - 1) * k; }
let scopeShown = '';
function updateScopeUI() {
  const w = game.slots[game.cur] ? curW() : null; const zl = game.zoomLevel > 0 && w;
  const mode = !zl ? '' : w.scope ? 'scope' : 'ads';
  if (mode !== scopeShown) {
    scopeShown = mode;
    $('scope-ov').classList.toggle('hidden', mode !== 'scope'); $('ads-ov').classList.toggle('hidden', mode !== 'ads');
  }
  $('xh').classList.toggle('hidden', mode === 'scope'); if (mode === 'scope') applySniperDot(); xhSig = '';
  setText('h-zoom', zl ? `${zoomNow()}x` : '');
}

// ---------------------------------------------------------------- minimap (static layer drawn once per map)
const mm = $('minimap'), mctx = mm.getContext('2d');
function mmXY(x, z, S) { const w = ROOM.xmax - ROOM.xmin, d = ROOM.zmax - ROOM.zmin, k = S / Math.max(w, d); return [(x - ROOM.xmin) * k + (S - w * k) / 2, (z - ROOM.zmin) * k + (S - d * k) / 2, k]; }
function drawMinimap() {
  const S = mm.width;
  if (!minimapStatic) {
    minimapStatic = document.createElement('canvas'); minimapStatic.width = S; minimapStatic.height = S; const c = minimapStatic.getContext('2d');
    c.fillStyle = 'rgba(15,25,35,.78)'; c.fillRect(0, 0, S, S);
    const [x0, y0, k] = mmXY(ROOM.xmin, ROOM.zmin, S); c.fillStyle = 'rgba(236,232,225,.16)'; c.fillRect(x0, y0, (ROOM.xmax - ROOM.xmin) * k, (ROOM.zmax - ROOM.zmin) * k);
    for (const p of PROPS) { const [a, b] = mmXY(p.xmin, p.zmin, S); c.fillStyle = p.kind === 'wall' || p.kind === 'pillar' ? 'rgba(15,25,35,.95)' : p.h >= 2.4 ? 'rgba(120,135,150,.85)' : 'rgba(160,170,180,.55)'; c.fillRect(a, b, p.w * k, p.d * k); }
  }
  mctx.clearRect(0, 0, S, S); mctx.drawImage(minimapStatic, 0, 0);
  for (const p of game.packs) { const [a, b] = mmXY(p.x, p.z, S); mctx.fillStyle = '#7dffb0'; mctx.fillRect(a - 2, b - 2, 4, 4); }
  for (const b of game.bots) { if (!b.alive || (b.reveal <= 0 && game.reveal <= 0)) continue; const [a, c] = mmXY(b.x, b.z, S); mctx.fillStyle = '#ff4655'; mctx.beginPath(); mctx.arc(a, c, 3.4, 0, 6.29); mctx.fill(); }
  const [a, c] = mmXY(game.px, game.pz, S); mctx.save(); mctx.translate(a, c); mctx.rotate(game.yaw);
  mctx.fillStyle = 'rgba(236,232,225,.18)'; mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, 26, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9); mctx.fill();
  mctx.fillStyle = '#5ef0e0'; mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 4.5); mctx.lineTo(0, 2.5); mctx.lineTo(-4.5, 4.5); mctx.closePath(); mctx.fill(); mctx.restore();
}

// ---------------------------------------------------------------- run control
let selectedMode = 'dm';
function curMode() { return MODES.find(m => m.id === selectedMode) || MODES[0]; }
function isLab() { return curMode().group === 'lab'; }
function bestKey() {
  const m = curMode();
  return m.id === 'dm' ? `vat-best-dm-${settings.map}-${settings.botDiff}-${settings.botMove}-${settings.killGoal}-${settings.minutes}-${settings.shootBack ? 1 : 0}`
    : `vat-best-${m.id}-${settings.difficultyLab}-${settings.durationLab}`;
}
function startRun() {
  readSettings();
  game.mode = curMode(); const dm = game.mode.id === 'dm';
  game.weaponMode = dm || !!game.mode.weapon; game.laser = !game.weaponMode; game.diff = dm ? 1 : settings.difficultyLab;
  game.dur = dm ? settings.minutes * 60 : settings.durationLab;
  Object.assign(game, { t: 0, timeLeft: game.dur, kills: 0, deaths: 0, hsKills: 0, shots: 0, hits: 0, headHits: 0, legHits: 0, damage: 0, stopShots: 0, score: 0, misses: 0,
    onTargetTime: 0, fireTime: 0, hitStreak: 0, targets: [], bots: [], packs: [], tracers: [], impacts: [], feed: [], dmgInd: [], tapTimes: [], tapMiss: 0, streak: 0,
    firing: false, adsHeld: false, zoomLevel: 0, adsBlend: 0, pitch: 0, killT: 0, hitMarker: 0, visionTimer: 1.5, walkToggle: false, crouchHeld: false, crouch: 0, reveal: 0, jumpReady: true, killer: null });
  input.dx = input.dy = 0; fps.sum = 0; fps.n = 0;
  if (dm) { buildMap(settings.map); respawnPlayer(true); const n = clamp(+settings.bots || 7, 1, 11); for (let i = 0; i < n; i++) game.bots.push(new Bot(i)); }
  else {
    buildMap('range', drillExtra); const sp = MAP_DEFS.range.spawn;
    Object.assign(game, { px: sp.x, pz: sp.z, py: 0, vx: 0, vz: 0, vy: 0, onGround: true, yaw: 0, hp: 100, armor: 50, alive: true, protectT: 0 });
    if (game.weaponMode) giveLoadout(); else { game.slots = { 1: { key: 'knife', ammo: 0, reserve: 0 } }; game.cur = 1; }
    spawnTargets();
  }
  game.running = true; track(`run/${dm ? 'dm/' + settings.map : game.mode.id}`);
  $('menu').classList.add('hidden'); $('results').classList.add('hidden'); $('hud').classList.remove('hidden'); $('death').classList.add('hidden');
  const hud = $('hud'); hud.classList.toggle('dm', dm); hud.classList.toggle('weapon', game.weaponMode); hud.classList.toggle('laser', game.laser);
  setText('h-mode', dm ? `${MAP.name} · DEATHMATCH` : game.mode.name);
  setText('h-goal', dm ? `/ ${settings.killGoal || '∞'}` : '');
  const s = sensState(0); setText('h-sens', `${settings.dpi}DPI · ${settings.sens} · ${VAL.cm360(s.hip, settings.dpi).toFixed(1)}cm/360`);
  renderFeed(); updateAmmoHud(); updateScopeUI(); xhSig = '';
}
function pauseToMenu() { if (!game.running) return; game.running = false; game.firing = false; try { navigator.keyboard?.unlock?.(); } catch (e) {} $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); if (game.t > 2) showResults(false); }
function finishRun() { game.running = false; game.firing = false; try { navigator.keyboard?.unlock?.(); } catch (e) {} if (document.pointerLockElement) document.exitPointerLock(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); showResults(true); }

// ---------------------------------------------------------------- main loop
const fps = { frames: 0, acc: 0, cur: 0, avg: 0, sum: 0, n: 0 };
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); xhSig = ''; }
}
window.addEventListener('resize', resize);
gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
// dynamic line buffer for tracers
const lineVao = gl.createVertexArray(), lineBuf = gl.createBuffer(), lineNrm = gl.createBuffer();
gl.bindVertexArray(lineVao); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, 6 * 4 * 64, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, lineNrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(6 * 64).fill(0), gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
const lineData = new Float32Array(6 * 64);
function drawTracers() {
  const n = Math.min(64, game.tracers.length); if (!n) return;
  for (let i = 0; i < n; i++) { const tr = game.tracers[i]; lineData.set(tr.a, i * 6); lineData.set(tr.b, i * 6 + 3); }
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, n * 6));
  gl.uniform1f(U.uFlat, 1); gl.uniformMatrix4fv(U.uModel, false, IDENT); gl.bindVertexArray(lineVao);
  for (let i = 0; i < n; i++) { gl.uniform3fv(U.uColor, game.tracers[i].c); gl.drawArrays(gl.LINES, i * 2, 2); }
  gl.uniform1f(U.uFlat, 0);
}
function drawCapsule(x, y0, y1, z, r, color, emis = 0, rotY = 0, rotZ = 0) { const cy = (y0 + y1) / 2, sy = (y1 - y0) / 4; draw(meshCap, modelTRS(x, cy, z, r, sy, r, rotY, rotZ), color, 0, emis); }
const BOT_BODY = [0.16, 0.18, 0.22], BOT_SUIT = [0.30, 0.33, 0.38], BOT_SKIN = [0.78, 0.66, 0.58], GUNC = [0.10, 0.11, 0.13];
function drawBody(x, z, g, yaw, flash, gun = true) {
  const fl = flash > 0;
  drawCapsule(x - Math.cos(yaw) * 0.09, g.footY, g.hipY + 0.05, z - Math.sin(yaw) * 0.09, g.legR * 0.8, BOT_BODY, 0);
  drawCapsule(x + Math.cos(yaw) * 0.09, g.footY, g.hipY + 0.05, z + Math.sin(yaw) * 0.09, g.legR * 0.8, BOT_BODY, 0);
  drawCapsule(x, g.hipY, g.chestTop, z, g.torsoR, fl ? [1, 0.85, 0.5] : BOT_SUIT, fl ? 0.8 : 0.04);
  draw(meshSphere, modelTRS(x, g.headY, z, g.headR, g.headR * 1.05, g.headR), fl ? [1, 0.6, 0.5] : BOT_SKIN, 0, fl ? 0.8 : 0.05);
  if (gun) { const fx = Math.sin(yaw), fz = -Math.cos(yaw); draw(meshBox, modelTRS(x + fx * 0.38 + Math.cos(yaw) * 0.12, g.chestTop - 0.12, z + fz * 0.38 + Math.sin(yaw) * 0.12, 0.07, 0.1, 0.62, -yaw), GUNC, 0, 0); }
}
// enemy highlight: inverted hull pass (front faces culled, flat colour, slightly larger)
function drawOutline(x, z, g, col, yaw = 0) {
  gl.cullFace(gl.FRONT); gl.uniform1f(U.uFlat, 1); const e = 0.03;
  for (const sgn of [-1, 1]) drawCapsule(x + sgn * Math.cos(yaw) * 0.09, g.footY - e, g.hipY + 0.05 + e, z + sgn * Math.sin(yaw) * 0.09, g.legR * 0.8 + e, col);
  drawCapsule(x, g.hipY, g.chestTop + e, z, g.torsoR + e, col);
  draw(meshSphere, modelTRS(x, g.headY, z, g.headR + e, g.headR * 1.05 + e, g.headR + e), col);
  gl.uniform1f(U.uFlat, 0); gl.cullFace(gl.BACK);
}
let prevT = performance.now(), mmT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - prevT) / 1000; prevT = now; if (dt > 0.1) dt = 0.1;
  resize();
  fps.frames++; fps.acc += dt; if (fps.acc >= 0.25) { fps.cur = fps.frames / fps.acc; fps.frames = 0; fps.acc = 0; if (game.running) { fps.sum += fps.cur; fps.n++; fps.avg = fps.sum / fps.n; } }
  input.hzT += dt; if (input.hzT >= 0.5) { input.hz = input.events / input.hzT; input.events = 0; input.hzT = 0; }
  if (!game.running) { game.yaw += dt * 0.035; renderScene(dt); return; }

  // --- mouse look
  const z = game.slots[game.cur] ? zoomNow() : 1; const s = sensState(game.zoomLevel > 0 && game.adsBlend > 0.5 ? z : 0);
  const yawPer = s.ads, pitchPer = s.ads;
  if (game.alive) { game.yaw += input.dx * yawPer * DEG; game.pitch -= input.dy * pitchPer * DEG * (settings.invert ? -1 : 1); }
  game.pitch = clamp(game.pitch, -88 * DEG, 88 * DEG); input.dx = input.dy = 0;

  // --- simulation
  game.t += dt; game.timeLeft -= dt; game.reveal = Math.max(0, game.reveal - dt); game.protectT = Math.max(0, game.protectT - dt); game.hurtT = Math.max(0, (game.hurtT || 0) - dt);
  updatePlayer(dt);
  const eye = eyePos();
  if (game.weaponMode && game.slots[game.cur]) updateWeapon(dt, eye);
  if (game.mode.id === 'dm') {
    for (const b of game.bots) b.update(dt);
    if (!game.alive) { game.deadT += dt; setText('death-t', Math.max(0, DM.respawn - game.deadT).toFixed(1)); if (game.deadT >= DM.respawn) respawnPlayer(false); }
    for (let i = game.packs.length - 1; i >= 0; i--) { game.packs[i].t -= dt; if (game.packs[i].t <= 0) game.packs.splice(i, 1); }
  } else updateTargets(dt);
  let onTarget = false;
  if (game.laser) {
    const view = viewMatrix(game.yaw, game.pitch, 0, eye);
    for (const T of game.targets) { T.hit = T.active && T.rayHit(eye, view.f); if (T.hit) onTarget = true; }
    if (game.firing) { game.fireTime += dt; if (onTarget) { game.onTargetTime += dt; game.hitStreak += dt; game.score += dt * 100 * (1 + Math.min(game.hitStreak, 2) * 0.25) * game.diff; } else game.hitStreak = 0; } else game.hitStreak = 0;
  }
  for (let i = game.feed.length - 1; i >= 0; i--) { game.feed[i].t -= dt; if (game.feed[i].t <= 0) { game.feed.splice(i, 1); renderFeed(); } }
  for (let i = game.dmgInd.length - 1; i >= 0; i--) { game.dmgInd[i].t -= dt; if (game.dmgInd[i].t <= 0) game.dmgInd.splice(i, 1); }
  updateHud(dt, onTarget);
  renderScene(dt);
  if (game.timeLeft <= 0) finishRun();
}
function updateHud(dt, onTarget) {
  const dm = game.mode.id === 'dm';
  const tl = Math.max(0, game.timeLeft); setText('h-time', dm ? `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}` : tl.toFixed(1));
  if (dm) { setText('h-kills', String(game.kills)); setText('h-rank', `#${placement()}`); setText('h-hp', String(Math.max(0, Math.ceil(game.hp)))); setText('h-armor', String(Math.max(0, Math.ceil(game.armor)))); $('h-hp').classList.toggle('low', game.hp <= 30); }
  else if (game.weaponMode) { setText('h-kills', String(game.kills)); setText('h-score2', String(Math.round(game.score))); }
  else { setText('h-score2', String(Math.round(game.score))); const played = game.dur - game.timeLeft; setText('h-acc', (played > 0 ? game.onTargetTime / played * 100 : 0).toFixed(1) + '%'); $('hit-flash').classList.toggle('on', game.firing && onTarget); }
  if (game.weaponMode && game.shots) setText('h-acc', (game.hits / game.shots * 100).toFixed(0) + '%');
  setText('h-fps', fps.cur.toFixed(0)); setText('h-hz', input.hz.toFixed(0));
  $('protect').classList.toggle('hidden', !(dm && game.protectT > 0 && game.alive));
  $('hurt').style.opacity = game.alive ? Math.min(0.85, (game.hurtT || 0) * 2.4 + (game.hp < 40 ? 0.25 : 0)) : 0.6;
  // hit / kill feedback
  $('hitmark').classList.toggle('on', game.hitMarker > 0); $('hitmark').classList.toggle('head', game.hitHead);
  const km = $('killmsg'); km.classList.toggle('on', game.killT > 0); if (game.killT > 0) { setText('killmsg', game.killHead ? 'HEADSHOT' : 'ELIMINATED'); km.classList.toggle('head', game.killHead); km.style.opacity = Math.min(1, game.killT * 2.5); }
  // damage direction indicators
  const di = $('dmgdir'); if (di.childElementCount !== game.dmgInd.length) di.innerHTML = game.dmgInd.map(() => '<i></i>').join('');
  game.dmgInd.forEach((d, i) => { const el = di.children[i]; el.style.transform = `rotate(${(d.a - game.yaw) / DEG}deg)`; el.style.opacity = Math.min(1, d.t * 1.6); });
  // speed / stopping meter
  if (game.weaponMode && settings.speedo) {
    const run = runSpeed(curW()), sp = hSpeed(), acc = isAccurate();
    $('speedo-bar').style.width = `${Math.min(100, sp / run * 100)}%`; $('speedo').classList.toggle('ok', acc);
    setText('speedo-v', `${sp.toFixed(2)} m/s`); setText('speedo-s', acc ? 'ACCURATE' : !game.onGround ? 'AIRBORNE' : game.landT > 0 ? 'LANDING' : 'MOVING');
    setText('h-stop', game.shots ? `${(game.stopShots / game.shots * 100).toFixed(0)}%` : '—');
  }
  // crosshair firing / movement error
  if (game.weaponMode) { const sp = spreadNow(); drawCrosshair(errToPx(sp.fire - curW().spread[game.zoomLevel > 0 ? 1 : 0] + game.rec.up * 0), errToPx(sp.move)); }
  else drawCrosshair(0, 0);
  mmT -= dt; if (mmT <= 0 && game.mode.id === 'dm') { mmT = 1 / 30; drawMinimap(); }
  if (game.reloading > 0) setText('h-ammo', '…');
}
function renderScene(dt) {
  if (!MAP) return;
  const P = MAP.pal;
  gl.clearColor(P.sky[0], P.sky[1], P.sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const aspect = canvas.width / canvas.height;
  const zb = game.running && game.slots[game.cur] ? zoomBlend() : 1;
  gl.uniformMatrix4fv(U.uProj, false, perspective(VAL.vfov(zb), aspect, 0.05, 300));
  const eye = eyePos(); const w = game.slots[game.cur] ? curW() : null; const vk = w ? w.recoil.viewKick : 0;
  const kickP = game.rec.up * vk * DEG, kickY = game.rec.side * vk * DEG;
  const view = viewMatrix(game.yaw + kickY, game.pitch + kickP + game.recoilVis * 0.002, 0, eye);
  gl.uniformMatrix4fv(U.uView, false, view.m); gl.uniform3fv(U.uCam, eye); gl.uniform1f(U.uFog, 1); gl.uniform3fv(U.uFogC, P.fog); gl.uniform3fv(U.uAccent, P.wall2); gl.uniform1f(U.uFlat, 0);
  const cx = (ROOM.xmin + ROOM.xmax) / 2, cz = (ROOM.zmin + ROOM.zmax) / 2, W = ROOM.xmax - ROOM.xmin + 4, Dd = ROOM.zmax - ROOM.zmin + 4;
  draw(meshFloor, modelTRS(cx, 0, cz, W, 1, Dd), P.floor, 1, 0);
  if (MAP.roof) draw(meshCeil, modelTRS(cx, ROOM.h, cz, W, 1, Dd), [P.floor[0] * 0.6, P.floor[1] * 0.6, P.floor[2] * 0.62], 0, 0);
  for (const s2 of STATIC) draw(s2.mesh, IDENT, s2.color, s2.kind === 'wall' ? 2 : s2.kind === 'step' ? 1 : 0, 0);
  const ecol = ENEMY_COLORS[settings.enemyColor] || ENEMY_COLORS.red;
  // bots
  for (const b of game.bots) {
    if (!b.alive) { if (b.deadT < 0.7) drawCapsule(b.x, 0.05, 0.45, b.z, 0.3, [0.25, 0.1, 0.1], 0, b.yaw, 1.5); continue; }
    const g = b.geom(); if (settings.outline) drawOutline(b.x, b.z, g, ecol, b.yaw);
    drawBody(b.x, b.z, g, b.yaw, b.flash);
    if (b.muzzle > 0) { const fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw); draw(meshUnit, modelTRS(b.x + fx * 0.75, g.chestTop - 0.1, b.z + fz * 0.75, 0.09, 0.09, 0.09), [1, 0.8, 0.4], 0, 1.6); }
  }
  // drill targets
  for (const T of game.targets) {
    if (T.kind === 'op') { const g = botGeom(T.crouch, 0); if (settings.outline && game.weaponMode) drawOutline(T.x, T.z, g, ecol); drawBody(T.x, T.z, g, 0, T.hit ? 0.1 : T.flash || 0, game.weaponMode); }
    else { const col = !T.active ? [0.42, 0.48, 0.56] : (T.hit ? [1, 0.85, 0.4] : [1.0, 0.27, 0.33]); draw(meshSphere, modelTRS(T.x, T.y, T.z, T.r, T.r, T.r), col, 0, T.active ? (T.hit ? 0.9 : 0.5) : 0); }
  }
  // health packs
  for (const p of game.packs) { const bob = 0.5 + Math.sin(game.t * 3 + p.x) * 0.08, r = game.t * 1.5; draw(meshBox, modelTRS(p.x, bob, p.z, 0.36, 0.12, 0.12, r), [0.45, 1, 0.7], 0, 0.9); draw(meshBox, modelTRS(p.x, bob, p.z, 0.12, 0.36, 0.12, r), [0.45, 1, 0.7], 0, 0.9); }
  for (const im of game.impacts) { const r = im.hole ? 0.04 : 0.05 + (0.1 - im.t) * 0.6; draw(meshUnit, modelTRS(im.p[0], im.p[1], im.p[2], r, r, r), im.c, 0, im.hole ? 0 : 1.0); }
  drawTracers();
  // first-person weapon (hidden while scoped)
  if (game.running && w && game.alive && settings.viewmodel && !(w.scope && game.adsBlend > 0.5)) drawViewmodel(w, aspect);
}
function drawViewmodel(w, aspect) {
  gl.clear(gl.DEPTH_BUFFER_BIT); gl.uniformMatrix4fv(U.uView, false, IDENT); gl.uniform3fv(U.uCam, [0, 0, 0]); gl.uniform1f(U.uFog, 0);
  gl.uniformMatrix4fv(U.uProj, false, perspective(60, aspect, 0.02, 10));
  const k = game.recoilVis, ads = smooth(0, 1, game.adsBlend), eq = clamp(game.equipT / Math.max(0.1, w.equip), 0, 1);
  const moving = hSpeed() > 0.5 && game.onGround; const bob = moving ? Math.sin(game.t * 11) * 0.007 * (1 - ads) : 0;
  const gx = lerp(0.15, 0.0, ads), gy = lerp(-0.15, -0.1, ads) + bob - eq * 0.25 - (game.reloading > 0 ? 0.06 : 0), gz = lerp(-0.56, -0.5, ads) + k * 0.035;
  const C1 = [0.13, 0.14, 0.16], C2 = [0.22, 0.23, 0.26], AC = [1.0, 0.27, 0.33];
  if (w.cls === 'MELEE') { draw(meshBox, modelTRS(gx + 0.02, gy + 0.03, gz - 0.06, 0.012, 0.04, 0.22), [0.75, 0.77, 0.8], 0, 0.05); draw(meshBox, modelTRS(gx + 0.02, gy - 0.02, gz + 0.06, 0.02, 0.05, 0.08), C1, 0, 0); return; }
  // zoomed: shorter, lower model so the barrel does not converge onto the sight line
  const len = (w.cls === 'SIDEARM' ? 0.13 : w.cls === 'SNIPER' ? 0.36 : w.cls === 'SMG' ? 0.22 : 0.27) * lerp(1, 0.4, ads);
  draw(meshBox, modelTRS(gx, gy, gz, 0.028, 0.046, len), C1, 0, 0);
  if (ads < 0.5) draw(meshBox, modelTRS(gx, gy + 0.012, gz - len / 2 - 0.08, 0.013, 0.013, 0.16 + (w.cls === 'SNIPER' ? 0.16 : 0)), C2, 0, 0);
  if (w.cls !== 'SIDEARM') draw(meshBox, modelTRS(gx, gy - 0.055, gz - 0.01, 0.024, 0.08, 0.035), C2, 0, 0);
  draw(meshBox, modelTRS(gx + 0.017, gy + 0.005, gz + 0.02, 0.004, 0.012, len * 0.6), AC, 0, 0.4);
  if (w.scope) draw(meshBox, modelTRS(gx, gy + 0.045, gz - 0.02, 0.03, 0.03, 0.16), C2, 0, 0);
  else if (w.cls !== 'SIDEARM') draw(meshBox, modelTRS(gx, gy + 0.034, gz - 0.02, 0.012, 0.016, 0.03), C2, 0, 0);
  if (game.muzzle > 0 && ads < 0.5) draw(meshUnit, modelTRS(gx, gy + 0.012, gz - len / 2 - 0.2, 0.03, 0.03, 0.05), [1, 0.85, 0.5], 0, 1.6);
}
