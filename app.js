/* SIEGE AIM LAB — R6S-faithful tracking / dynamic-vision trainer
   - WebGL2 renderer, uncapped (syncs to display refresh: 360Hz+ monitors run 360fps+)
   - Raw mouse input: pointer lock w/ unadjustedMovement + pointerrawupdate
   - Sensitivity: exact R6S formulas (hipfire / per-zoom ADS / vertical FOV)
*/
'use strict';

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- R6S sensitivity model
// Hipfire: yaw per count (deg) = sens * MSMU * (180/pi) / 200  -> 0.005729°/count per sens unit at MSMU 0.02
// ADS:     yaw = hipfire yaw * (adsSens/100) * (XFactorAiming / 0.02)   (same formula for every zoom level)
// FOV:     R6S FOV setting is VERTICAL. ADS: tan(vfov_ads/2) = tan(vfov/2) / zoom
const R6 = {
  hipYaw(sens, msmu) { return sens * msmu * (180 / Math.PI) / 200; },
  adsYaw(hipYawDeg, adsSens, xfactor) { return hipYawDeg * (adsSens / 100) * (xfactor / 0.02); },
  adsFov(vfovDeg, zoom) { return 2 * Math.atan(Math.tan(vfovDeg * DEG / 2) / zoom) / DEG; },
  cm360(yawDeg, dpi) { return 2.54 * 360 / (yawDeg * dpi); },
};

const settings = {
  dpi: 800, fov: 90, sensH: 10, sensV: 10, msmu: 0.02, xfactor: 0.02,
  ads: { '1': 50, '1.5': 50, '2': 50, '2.5': 50, '3': 50, '12': 50 },
  scope: 2.5, adsmode: 'hold', invert: false,
  difficulty: 1, duration: 60, mode: 'track',
};
const ADS_IDS = { '1': 'ads1', '1.5': 'ads15', '2': 'ads2', '2.5': 'ads25', '3': 'ads3', '12': 'ads12' };

function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem('sal-settings') || '{}')); } catch (e) {}
  settings.ads = Object.assign({ '1': 50, '1.5': 50, '2': 50, '2.5': 50, '3': 50, '12': 50 }, settings.ads || {});
  $('dpi').value = settings.dpi; $('fov').value = settings.fov; $('sensH').value = settings.sensH; $('sensV').value = settings.sensV;
  $('msmu').value = settings.msmu; $('xfactor').value = settings.xfactor;
  for (const k in ADS_IDS) $(ADS_IDS[k]).value = settings.ads[k];
  $('scope').value = String(settings.scope); $('adsmode').value = settings.adsmode; $('invert').checked = settings.invert;
  $('difficulty').value = String(settings.difficulty); $('duration').value = String(settings.duration);
}
function readSettings() {
  settings.dpi = clamp(+$('dpi').value || 800, 100, 32000);
  settings.fov = clamp(+$('fov').value || 90, 60, 90);
  settings.sensH = clamp(+$('sensH').value || 10, 1, 100);
  settings.sensV = clamp(+$('sensV').value || 10, 1, 100);
  settings.msmu = clamp(+$('msmu').value || 0.02, 0.0001, 1);
  settings.xfactor = clamp(+$('xfactor').value || 0.02, 0.0001, 1);
  for (const k in ADS_IDS) settings.ads[k] = clamp(+$(ADS_IDS[k]).value || 50, 1, 100);
  settings.scope = +$('scope').value; settings.adsmode = $('adsmode').value; settings.invert = $('invert').checked;
  settings.difficulty = +$('difficulty').value; settings.duration = +$('duration').value;
  try { localStorage.setItem('sal-settings', JSON.stringify(settings)); } catch (e) {}
  updateSensInfo();
}
function sensState() {
  const hipYawH = R6.hipYaw(settings.sensH, settings.msmu);
  const hipYawV = R6.hipYaw(settings.sensV, settings.msmu);
  const adsSens = settings.ads[String(settings.scope)] ?? 50;
  return {
    hipYawH, hipYawV,
    adsYawH: R6.adsYaw(hipYawH, adsSens, settings.xfactor),
    adsYawV: R6.adsYaw(hipYawV, adsSens, settings.xfactor),
    hipFov: settings.fov,
    adsFov: R6.adsFov(settings.fov, settings.scope),
  };
}
function updateSensInfo() {
  const s = sensState();
  $('sensinfo').innerHTML =
    `腰だめ: <b>${s.hipYawH.toFixed(5)}°/count</b> → <b>${R6.cm360(s.hipYawH, settings.dpi).toFixed(2)} cm/360</b> <small>(eDPI ${settings.dpi * settings.sensH})</small><br>` +
    `ADS ${settings.scope}x: <b>${s.adsYawH.toFixed(5)}°/count</b> → <b>${R6.cm360(s.adsYawH, settings.dpi).toFixed(2)} cm/360</b> ` +
    `<small>垂直FOV ${s.hipFov}° → ${s.adsFov.toFixed(2)}°</small>`;
}

// ---------------------------------------------------------------- scenarios
const MODES = [
  { id: 'track', name: 'Smooth Tracking', tag: 'TRACKING',
    desc: 'オペレーター型ターゲットが高速で左右ストレイフ。追従時間で採点。' },
  { id: 'reactive', name: 'Reactive Strafe', tag: 'TRACKING · R6S PEEK',
    desc: 'R6Sのピーク/カウンターストレイフを模した急な方向転換・しゃがみ・リーン。' },
  { id: 'air', name: 'Air Tracking', tag: 'TRACKING · 3D',
    desc: '上下左右＋前後に飛び回るターゲットを追い続ける。ADS時の感度変化も鍛える。' },
  { id: 'vision', name: 'Dynamic Vision', tag: '動体視力',
    desc: '5体が高速に動き回り、光るターゲットが1〜2秒で切り替わる。光っている1体だけを追え。' },
  { id: 'flicktrack', name: 'Flick + Track', tag: 'HYBRID',
    desc: 'ターゲットがワープ→即ストレイフ。フリックから追従への切り替えを鍛える。' },
  { id: 'microdot', name: 'Micro Dot Track', tag: 'PRECISION · ADS',
    desc: '小さなヘッド大のターゲットが細かく揺れる。ACOG/ADSでの微調整トラッキング。' },
];

// ---------------------------------------------------------------- WebGL
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, desynchronized: true, powerPreference: 'high-performance' });
if (!gl) { alert('WebGL2 が利用できません。Chrome / Edge / Firefox の最新版をご利用ください。'); }

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uProj, uView, uModel; out vec3 vN; out vec3 vW;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW=w.xyz; vN=mat3(uModel)*aNrm; gl_Position=uProj*uView*w; }`;
const FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; out vec4 o;
uniform vec3 uColor; uniform float uGrid; uniform float uEmis; uniform vec3 uCam;
float gridLine(vec2 p, float scale, float width){
  vec2 q = p*scale; vec2 d = fwidth(q);
  vec2 a = abs(fract(q-0.5)-0.5)/max(d, vec2(1e-4));
  float l = 1.0-clamp(min(a.x,a.y)/width,0.0,1.0);
  // fade lines out when they get denser than ~2px to avoid moire
  return l*(1.0-smoothstep(0.25,0.6,max(d.x,d.y)));
}
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(0.35,1.0,0.5));
  float d = max(dot(n,L),0.0)*0.4+0.7;
  vec3 c = uColor*d;
  if(uGrid>0.5){
    // Siege training-ground wall: concrete + 1m grid + 0.25m sub-grid on the surface tangent plane
    vec3 an = abs(n); vec2 p = an.y>0.5 ? vW.xz : (an.x>0.5 ? vW.zy : vW.xy);
    float l1 = gridLine(p, 1.0, 1.2), l2 = gridLine(p, 4.0, 1.0);
    c = mix(c, c*0.55+vec3(0.14,0.15,0.16), l1*0.95);
    c = mix(c, c*0.8+vec3(0.03), l2*0.6);
    // orange R6S-style stripe at 1.0–1.1m on walls
    if(an.y<0.5 && vW.y>1.0 && vW.y<1.1) c = mix(c, vec3(0.9,0.5,0.1), 0.65);
    float dist = length(vW-uCam); c = mix(c, vec3(0.045,0.05,0.06), 1.0-exp(-dist*0.014));
  }
  float rim = pow(1.0-max(dot(n, normalize(uCam-vW)),0.0), 3.0);
  c += uColor*uEmis*(0.6+rim*0.8);
  o = vec4(c,1.0);
}`;
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const U = {}; for (const n of ['uProj', 'uView', 'uModel', 'uColor', 'uGrid', 'uEmis', 'uCam']) U[n] = gl.getUniformLocation(prog, n);

function makeMesh(pos, nrm, idx) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null); return { vao, n: idx.length };
}
// inward-facing box (room)
function roomMesh(w, h, d) {
  const x = w / 2, y = h, z = d / 2, P = [], N = [], I = [];
  const face = (a, b, c, dd, n) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...dd); for (let i = 0; i < 4; i++) N.push(...n); I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  face([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [0, 1, 0]);      // floor
  face([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, -1, 0]);     // ceiling
  face([x, 0, -z], [-x, 0, -z], [-x, y, -z], [x, y, -z], [0, 0, 1]);    // back wall (z-)
  face([-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z], [0, 0, -1]);       // front wall (z+)
  face([-x, 0, -z], [-x, 0, z], [-x, y, z], [-x, y, -z], [1, 0, 0]);    // left
  face([x, 0, z], [x, 0, -z], [x, y, -z], [x, y, z], [-1, 0, 0]);       // right
  return makeMesh(P, N, I);
}
// capsule along Y: radius r, cylinder half-height hh (total height = 2hh + 2r), centered at origin
function capsuleMesh(r, hh, seg = 20, rings = 8) {
  const P = [], N = [], I = [];
  const addRing = (y, rr, ny, nyScale) => { for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a); P.push(cx * rr, y, sz * rr); const nx = cx * nyScale, nz = sz * nyScale; const l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l); } };
  // bottom hemisphere
  for (let j = 0; j <= rings; j++) { const t = -Math.PI / 2 + (j / rings) * Math.PI / 2; addRing(-hh + Math.sin(t) * r, Math.cos(t) * r, Math.sin(t), Math.cos(t)); }
  // top hemisphere
  for (let j = 0; j <= rings; j++) { const t = (j / rings) * Math.PI / 2; addRing(hh + Math.sin(t) * r, Math.cos(t) * r, Math.sin(t), Math.cos(t)); }
  const rowCount = 2 * (rings + 1);
  for (let j = 0; j < rowCount - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  return makeMesh(P, N, I);
}
function sphereMesh(r, seg = 20, rings = 12) {
  const P = [], N = [], I = [];
  for (let j = 0; j <= rings; j++) { const t = -Math.PI / 2 + j / rings * Math.PI; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; const x = Math.cos(t) * Math.cos(a), y = Math.sin(t), z = Math.cos(t) * Math.sin(a); P.push(x * r, y * r, z * r); N.push(x, y, z); } }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  return makeMesh(P, N, I);
}
const ROOM = { w: 30, h: 6, d: 40 };
const meshRoom = roomMesh(ROOM.w, ROOM.h, ROOM.d);
const meshBody = capsuleMesh(0.28, 0.55);     // ~1.7m operator body
const meshHead = sphereMesh(0.16);
const meshDot = sphereMesh(0.14);
const meshPillar = capsuleMesh(0.35, 3.0, 12, 2);

// matrices
function perspective(fovyDeg, aspect, n, f) { const t = 1 / Math.tan(fovyDeg * DEG / 2); const m = new Float32Array(16); m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
function viewMatrix(yaw, pitch, eye) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // forward (camera looks toward -Z at yaw 0)
  const f = [sy * cp, sp, -cy * cp]; const r = [cy, 0, sy]; const u = [-sy * sp, cp, cy * sp];
  const m = new Float32Array(16);
  m[0] = r[0]; m[4] = r[1]; m[8] = r[2]; m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]); m[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]); m[14] = (f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]); m[15] = 1;
  return { m, f };
}
const MODEL = new Float32Array(16);
function modelTRS(x, y, z, sx = 1, sy = 1, sz = 1, lean = 0) { // lean: rotation about Z (R6S lean)
  const c = Math.cos(lean), s = Math.sin(lean);
  MODEL.set([sx * c, sx * s, 0, 0, -sy * s, sy * c, 0, 0, 0, 0, sz, 0, x, y, z, 1]); return MODEL;
}
function draw(mesh, model, color, grid = 0, emis = 0) {
  gl.uniformMatrix4fv(U.uModel, false, model); gl.uniform3fv(U.uColor, color); gl.uniform1f(U.uGrid, grid); gl.uniform1f(U.uEmis, emis);
  gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
}

// ---------------------------------------------------------------- game state
const EYE = [0, 1.6, 14];
const game = {
  running: false, paused: false, yaw: 0, pitch: 0, ads: false, firing: false,
  t: 0, timeLeft: 60, onTargetTime: 0, fireTime: 0, score: 0, targets: [], hitStreak: 0,
  mode: MODES[0], diff: 1,
  curYawH: 0, curYawV: 0, aimFov: 90,
};
const COLORS = {
  body: [0.82, 0.84, 0.86], bodyHit: [1.0, 0.72, 0.25], head: [0.95, 0.35, 0.25],
  active: [1.0, 0.62, 0.1], inactive: [0.42, 0.48, 0.56], wall: [0.42, 0.44, 0.48], pillar: [0.5, 0.52, 0.56],
};

class Target {
  constructor(opts) { Object.assign(this, { x: 0, y: 1.0, z: -6, vx: 0, vy: 0, vz: 0, r: 0.28, hh: 0.55, lean: 0, crouch: 0, active: true, kind: 'op', timer: 0, dir: 1 }, opts); }
  // distance from ray (origin o, dir d) to the capsule segment; returns true if hit
  rayHit(o, d) {
    const r = this.r * (this.kind === 'dot' ? 1 : 1.0);
    const hh = this.hh * (1 - this.crouch * 0.45);
    // segment endpoints (lean rotates about base)
    const ax = this.x, az = this.z, ay = this.y - hh, bx = this.x + Math.sin(-this.lean) * 2 * hh, by = this.y + hh * Math.cos(this.lean), bz = this.z;
    return segRayDist(o, d, [ax, ay, az], [bx, by, bz]) <= r;
  }
}
// closest distance between a ray and a line segment
function segRayDist(o, d, a, b) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [a[0] - o[0], a[1] - o[1], a[2] - o[2]];
  const aa = dot(d, d), bb = dot(d, u), cc = dot(u, u), dd = dot(d, w), ee = dot(u, w);
  const den = aa * cc - bb * bb; let s, t;
  if (den < 1e-9) { s = 0; t = clamp(dd / aa, 0, 1e9); } else { s = clamp((bb * dd - aa * ee) / den, 0, 1); t = (dd + bb * s) / aa; }
  if (t < 0) t = 0;
  const px = o[0] + d[0] * t - (a[0] + u[0] * s), py = o[1] + d[1] * t - (a[1] + u[1] * s), pz = o[2] + d[2] * t - (a[2] + u[2] * s);
  return Math.hypot(px, py, pz);
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// playfield bounds for targets
const B = { xmin: -11, xmax: 11, ymin: 0.9, ymax: 5.5, zmin: -17, zmax: 2 };

function spawnTargets() {
  const T = game.targets = []; const m = game.mode.id; const D = game.diff;
  if (m === 'track') T.push(new Target({ x: 0, z: -4, vx: 6 * D, dir: 1 }));
  else if (m === 'reactive') T.push(new Target({ x: 0, z: -3, vx: 7 * D, timer: 0.4 }));
  else if (m === 'air') T.push(new Target({ x: 0, y: 2.5, z: -6, vx: 5 * D, vy: 3 * D, vz: 3 * D, kind: 'ball', r: 0.33, hh: 0 }));
  else if (m === 'vision') { for (let i = 0; i < 5; i++) T.push(new Target({ x: rand(-8, 8), y: rand(1.2, 4.5), z: rand(-14, -4), vx: rand(-1, 1) * 7 * D, vy: rand(-1, 1) * 3 * D, vz: rand(-1, 1) * 3 * D, kind: 'ball', r: 0.3, hh: 0, active: i === 0, timer: rand(1.0, 2.0) })); }
  else if (m === 'flicktrack') T.push(new Target({ x: 0, z: -5, vx: 6 * D, timer: 2.2 }));
  else if (m === 'microdot') T.push(new Target({ x: 0, y: 1.5, z: -9, kind: 'dot', r: 0.15, hh: 0, vx: 0.8 * D, vy: 0.4 * D }));
}

function updateTargets(dt) {
  const m = game.mode.id, D = game.diff, t = game.t;
  for (const T of game.targets) {
    switch (m) {
      case 'track': {
        // continuous strafe with smooth random acceleration and occasional reversal
        T.vx += rand(-1, 1) * 30 * D * dt; T.vx = clamp(T.vx, -9 * D, 9 * D);
        if (Math.abs(T.vx) < 2.5 * D) T.vx += Math.sign(T.vx || 1) * 2 * D * dt;
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx * rand(0.8, 1.1); T.timer = rand(0.6, 1.8) / D; }
        T.vz = Math.sin(t * 0.7) * 1.5 * D;
        break; }
      case 'reactive': {
        // R6S peek: hard counter-strafes, random crouch, lean. Pauses occasionally (hold angle)
        T.timer -= dt;
        if (T.timer <= 0) {
          const roll = Math.random();
          if (roll < 0.55) { T.vx = -Math.sign(T.vx || 1) * rand(5, 9) * D; }         // counter strafe
          else if (roll < 0.7) { T.vx = 0; }                                             // stop
          else if (roll < 0.85) { T.vx = Math.sign(T.vx || 1) * rand(5, 9) * D; }       // keep
          else { T.vx = rand(-1, 1) * 9 * D; T.vz = rand(-1, 1) * 4 * D; }
          T.crouchTarget = Math.random() < 0.35 ? 1 : 0; T.leanTarget = Math.random() < 0.4 ? (Math.random() < 0.5 ? -0.35 : 0.35) : 0;
          T.timer = rand(0.18, 0.75) / D;
        }
        T.crouch += ((T.crouchTarget || 0) - T.crouch) * Math.min(1, dt * 14); T.lean += ((T.leanTarget || 0) - T.lean) * Math.min(1, dt * 16);
        T.vz *= Math.exp(-dt * 2);
        break; }
      case 'air': {
        T.vx += rand(-1, 1) * 40 * D * dt; T.vy += rand(-1, 1) * 24 * D * dt; T.vz += rand(-1, 1) * 24 * D * dt;
        const sp = Math.hypot(T.vx, T.vy, T.vz), mx = 10 * D; if (sp > mx) { T.vx *= mx / sp; T.vy *= mx / sp; T.vz *= mx / sp; }
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx; T.timer = rand(0.5, 1.5) / D; }
        break; }
      case 'vision': {
        T.vx += rand(-1, 1) * 30 * D * dt; T.vy += rand(-1, 1) * 18 * D * dt; T.vz += rand(-1, 1) * 10 * D * dt;
        const sp = Math.hypot(T.vx, T.vy, T.vz), mx = 9 * D; if (sp > mx) { T.vx *= mx / sp; T.vy *= mx / sp; T.vz *= mx / sp; }
        break; }
      case 'flicktrack': {
        T.timer -= dt;
        if (T.timer <= 0) { T.x = rand(-9, 9); T.y = rand(1.0, 3.5); T.z = rand(-14, -3); T.vx = (Math.random() < 0.5 ? -1 : 1) * rand(4, 8) * D; T.timer = rand(1.6, 2.6) / Math.sqrt(D); T.flash = 0.25; }
        T.flash = Math.max(0, (T.flash || 0) - dt);
        T.vx += rand(-1, 1) * 20 * D * dt;
        break; }
      case 'microdot': {
        // jittery micro-movement: sum of sines + random kicks
        T.vx += rand(-1, 1) * 14 * D * dt; T.vy += rand(-1, 1) * 10 * D * dt;
        T.vx = clamp(T.vx, -2.2 * D, 2.2 * D); T.vy = clamp(T.vy, -1.4 * D, 1.4 * D);
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx; T.timer = rand(0.3, 1.0) / D; }
        break; }
    }
    T.x += T.vx * dt; T.y += T.vy * dt; T.z += T.vz * dt;
    // bounce in bounds
    const yl = T.hh + T.r + 0.05;
    if (T.x < B.xmin) { T.x = B.xmin; T.vx = Math.abs(T.vx); } if (T.x > B.xmax) { T.x = B.xmax; T.vx = -Math.abs(T.vx); }
    if (T.hh > 0) { T.y = yl; T.vy = 0; } else { if (T.y < B.ymin) { T.y = B.ymin; T.vy = Math.abs(T.vy); } if (T.y > B.ymax) { T.y = B.ymax; T.vy = -Math.abs(T.vy); } }
    if (T.z < B.zmin) { T.z = B.zmin; T.vz = Math.abs(T.vz); } if (T.z > B.zmax) { T.z = B.zmax; T.vz = -Math.abs(T.vz); }
  }
  if (m === 'vision') {
    // switch highlighted target
    game.visionTimer = (game.visionTimer ?? 1.5) - dt;
    if (game.visionTimer <= 0) {
      const cur = game.targets.findIndex(x => x.active); let nx; do { nx = Math.floor(Math.random() * game.targets.length); } while (nx === cur);
      game.targets.forEach((x, i) => x.active = i === nx); game.visionTimer = rand(0.9, 2.0) / Math.sqrt(D);
    }
  }
}

// ---------------------------------------------------------------- input
const input = { dx: 0, dy: 0, events: 0, hz: 0, hzAcc: 0, hzT: 0 };
let locked = false;
function onMove(e) {
  if (!locked) return;
  input.dx += e.movementX; input.dy += e.movementY; input.events++;
}
if ('onpointerrawupdate' in window) {
  // Chromium: raw, uncoalesced mouse events (up to the mouse polling rate)
  document.addEventListener('pointerrawupdate', (e) => { const ev = e.getCoalescedEvents?.() || []; if (ev.length > 1) { for (const c of ev) { input.dx += c.movementX; input.dy += c.movementY; input.events++; } } else onMove(e); });
} else {
  document.addEventListener('mousemove', (e) => { const ev = e.getCoalescedEvents?.() || []; if (ev.length > 1) { for (const c of ev) onMove(c); } else onMove(e); });
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && game.running) pauseToMenu(); });
document.addEventListener('pointerlockerror', () => { /* ignore */ });
canvas.addEventListener('mousedown', (e) => {
  if (!locked) return; e.preventDefault();
  if (e.button === 0) game.firing = true;
  if (e.button === 2) { if (settings.adsmode === 'hold') game.ads = true; else game.ads = !game.ads; }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) game.firing = false; if (e.button === 2 && settings.adsmode === 'hold') game.ads = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (!game.running) return;
  if (e.code === 'KeyR') { startRun(); }
});

async function requestLock() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) await p.catch(() => canvas.requestPointerLock());
  } catch (e) { try { canvas.requestPointerLock(); } catch (_) {} }
}

// ---------------------------------------------------------------- run control
let selectedMode = 'track';
function buildModeList() {
  const box = $('modes'); box.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button'); b.className = 'mode' + (m.id === selectedMode ? ' sel' : ''); b.dataset.id = m.id;
    b.innerHTML = `<b>${m.name}</b><span>${m.desc}</span><em class="tag">${m.tag}</em>`;
    b.onclick = () => { selectedMode = m.id; settings.mode = m.id; buildModeList(); showBest(); };
    box.appendChild(b);
  }
}
function bestKey() { return `sal-best-${selectedMode}-${$('difficulty').value}-${$('duration').value}`; }
function showBest() { let v = null; try { v = JSON.parse(localStorage.getItem(bestKey())); } catch (e) {} $('best').textContent = v ? `BEST (${MODES.find(m => m.id === selectedMode).name} / ${$('difficulty').selectedOptions[0].text} / ${$('duration').value}s): スコア ${v.score} · オンターゲット ${v.acc.toFixed(1)}%` : 'このシナリオの記録はまだありません。'; }

function startRun() {
  readSettings();
  game.mode = MODES.find(m => m.id === selectedMode); game.diff = settings.difficulty;
  game.t = 0; game.timeLeft = settings.duration; game.onTargetTime = 0; game.fireTime = 0; game.score = 0; game.hitStreak = 0; game.ads = false; game.firing = false;
  game.yaw = 0; game.pitch = 0; game.visionTimer = 1.5; input.dx = input.dy = 0;
  spawnTargets();
  game.running = true; game.paused = false;
  $('menu').classList.add('hidden'); $('results').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('h-mode').textContent = game.mode.name;
  const s = sensState();
  $('h-sens').textContent = `${settings.dpi}DPI · H${settings.sensH}/V${settings.sensV} · ${R6.cm360(s.hipYawH, settings.dpi).toFixed(1)}cm/360`;
  updateScopeUI();
}
function pauseToMenu() {
  game.running = false; game.firing = false;
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
  if (game.t > 0.5) showResults(false);
}
function finishRun() {
  game.running = false; game.firing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
  showResults(true);
}
function showResults(complete) {
  const played = settings.duration - game.timeLeft;
  const acc = played > 0 ? game.onTargetTime / played * 100 : 0;
  const fireAcc = game.fireTime > 0 ? game.onTargetTime / game.fireTime * 100 : 0;
  const score = Math.round(game.score);
  let best = null; try { best = JSON.parse(localStorage.getItem(bestKey())); } catch (e) {}
  let isBest = false;
  if (complete && (!best || score > best.score)) { isBest = true; try { localStorage.setItem(bestKey(), JSON.stringify({ score, acc })); } catch (e) {} }
  $('results-body').innerHTML =
    `<div class="r"><span>シナリオ</span><b>${game.mode.name} · ${$('difficulty').selectedOptions[0].text}</b></div>` +
    `<div class="r"><span>スコア</span><b>${score}${isBest ? ' ★ NEW BEST' : ''}</b></div>` +
    `<div class="r"><span>オンターゲット率（全時間）</span><b>${acc.toFixed(1)}%</b></div>` +
    `<div class="r"><span>命中率（射撃中）</span><b>${fireAcc.toFixed(1)}%</b></div>` +
    `<div class="r"><span>オンターゲット時間</span><b>${game.onTargetTime.toFixed(2)}s / ${played.toFixed(1)}s</b></div>` +
    `<div class="r"><span>平均FPS</span><b>${fps.avg.toFixed(0)}</b></div>` +
    (complete ? '' : `<div class="r"><span>※ 中断</span><b>記録は保存されません</b></div>`);
  $('results').classList.remove('hidden'); showBest();
}
function updateScopeUI() {
  const sc = $('scope-ov');
  const ch = $('crosshair');
  if (game.ads) {
    ch.classList.add('ads');
    sc.className = settings.scope <= 1.5 ? 'holo' : 'acog';
    $('h-zoom').textContent = `ADS ${settings.scope}x (${settings.ads[String(settings.scope)]})`;
  } else { sc.classList.add('hidden'); ch.classList.remove('ads'); $('h-zoom').textContent = 'HIPFIRE'; }
}

// ---------------------------------------------------------------- main loop
const fps = { last: performance.now(), frames: 0, acc: 0, cur: 0, avg: 0, sum: 0, n: 0 };
let lastAds = null;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
}
window.addEventListener('resize', resize);
gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

let prevT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - prevT) / 1000; prevT = now; if (dt > 0.1) dt = 0.1;
  resize();

  // fps
  fps.frames++; fps.acc += dt; if (fps.acc >= 0.25) { fps.cur = fps.frames / fps.acc; fps.frames = 0; fps.acc = 0; if (game.running) { fps.sum += fps.cur; fps.n++; fps.avg = fps.sum / fps.n; } }
  input.hzT += dt; if (input.hzT >= 0.5) { input.hz = input.events / input.hzT; input.events = 0; input.hzT = 0; }

  // --- apply mouse (R6S formulas) ---
  const s = sensState();
  const yawPer = game.ads ? s.adsYawH : s.hipYawH, pitchPer = game.ads ? s.adsYawV : s.hipYawV;
  game.yaw += input.dx * yawPer * DEG; game.pitch -= input.dy * pitchPer * DEG * (settings.invert ? -1 : 1);
  game.pitch = clamp(game.pitch, -89 * DEG, 89 * DEG);
  input.dx = input.dy = 0;
  const targetFov = game.ads ? s.adsFov : s.hipFov;
  // R6S ADS transition is ~0.15-0.25s; smooth FOV toward target
  game.aimFov += (targetFov - game.aimFov) * Math.min(1, dt * 22); if (Math.abs(game.aimFov - targetFov) < 0.02) game.aimFov = targetFov;
  if (lastAds !== game.ads) { lastAds = game.ads; if (game.running) updateScopeUI(); }

  // --- simulation ---
  const view = viewMatrix(game.yaw, game.pitch, EYE);
  let onTarget = false;
  if (game.running) {
    game.t += dt; game.timeLeft -= dt;
    updateTargets(dt);
    for (const T of game.targets) { T.hit = T.active && T.rayHit(EYE, view.f); if (T.hit) onTarget = true; }
    if (game.firing) {
      game.fireTime += dt;
      if (onTarget) { game.onTargetTime += dt; game.hitStreak += dt; game.score += dt * 100 * (1 + Math.min(game.hitStreak, 2) * 0.25) * game.diff; }
      else game.hitStreak = 0;
    } else game.hitStreak = 0;
    $('hit-flash').classList.toggle('on', game.firing && onTarget);
    // HUD (cheap updates)
    $('h-time').textContent = Math.max(0, game.timeLeft).toFixed(1);
    $('h-score').textContent = Math.round(game.score);
    const played = settings.duration - game.timeLeft; $('h-acc').textContent = (played > 0 ? game.onTargetTime / played * 100 : 0).toFixed(1) + '%';
    if (game.timeLeft <= 0) finishRun();
  }
  $('h-fps').textContent = fps.cur.toFixed(0); $('h-hz').textContent = input.hz.toFixed(0);

  // --- render ---
  gl.clearColor(0.03, 0.035, 0.045, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const aspect = canvas.width / canvas.height;
  gl.uniformMatrix4fv(U.uProj, false, perspective(game.aimFov, aspect, 0.05, 200));
  gl.uniformMatrix4fv(U.uView, false, view.m); gl.uniform3fv(U.uCam, EYE);
  gl.disable(gl.CULL_FACE); draw(meshRoom, modelTRS(0, 0, -6), COLORS.wall, 1, 0); gl.enable(gl.CULL_FACE);
  // pillars (Siege-like cover columns)
  for (const [px, pz] of [[-13, -16], [13, -16], [-13, -2], [13, -2]]) draw(meshPillar, modelTRS(px, 3.0, pz), COLORS.pillar, 1, 0);
  for (const T of game.targets) {
    if (T.kind === 'op') {
      const hh = T.hh * (1 - T.crouch * 0.45);
      const col = T.hit ? COLORS.bodyHit : (T.flash ? [1, 0.9, 0.5] : COLORS.body);
      draw(meshBody, modelTRS(T.x, T.y, T.z, 1, hh / T.hh, 1, T.lean), col, 0, T.hit ? 0.5 : 0.05);
      // head on top of capsule
      const hx = T.x + Math.sin(-T.lean) * (hh + T.r + 0.05), hy = T.y + (hh + T.r + 0.05) * Math.cos(T.lean);
      draw(meshHead, modelTRS(hx, hy, T.z), T.hit ? COLORS.bodyHit : COLORS.head, 0, T.hit ? 0.6 : 0.15);
    } else {
      const col = !T.active ? COLORS.inactive : (T.hit ? COLORS.bodyHit : COLORS.active);
      const sc = T.r / (T.kind === 'dot' ? 0.14 : 0.14);
      draw(meshDot, modelTRS(T.x, T.y, T.z, sc, sc, sc), col, 0, T.active ? (T.hit ? 0.9 : 0.5) : 0.0);
    }
  }
}

// ---------------------------------------------------------------- boot
loadSettings(); selectedMode = MODES.some(m => m.id === settings.mode) ? settings.mode : 'track';
buildModeList(); updateSensInfo(); showBest();
for (const id of ['dpi', 'fov', 'sensH', 'sensV', 'msmu', 'xfactor', 'scope', 'adsmode', 'invert', ...Object.values(ADS_IDS)]) $(id).addEventListener('input', readSettings);
for (const id of ['difficulty', 'duration']) $(id).addEventListener('change', () => { readSettings(); showBest(); });
$('start').addEventListener('click', async () => { startRun(); await requestLock(); });
$('again').addEventListener('click', async () => { startRun(); await requestLock(); });
$('close-results').addEventListener('click', () => { $('results').classList.add('hidden'); });
canvas.addEventListener('click', async () => { if (game.running && !locked) await requestLock(); });
window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && game.running && !locked) pauseToMenu(); });
game.aimFov = settings.fov;
requestAnimationFrame(frame);
