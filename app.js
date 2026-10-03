/* SIEGE AIM LAB — R6S-style tracking / combat trainer
   - WebGL2 renderer, uncapped (syncs to display refresh: 360Hz+ monitors run 360fps+)
   - Raw mouse input: pointer lock w/ unadjustedMovement + pointerrawupdate
   - Sensitivity: exact R6S formulas (hipfire / per-zoom ADS / vertical FOV)
   - Player movement (walk / sprint / crouch / lean), cover props, peeking bots, recoil
*/
'use strict';

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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

// ---------------------------------------------------------------- R6S movement / weapon model (approximations of live values)
const MOVE = {
  walk: 3.1,            // m/s (3-speed operator)
  sprint: 5.3,
  crouch: 1.55,
  adsMul: 0.6,          // ADS walking speed multiplier
  backMul: 0.8,
  strafeMul: 0.9,
  eyeStand: 1.6, eyeCrouch: 1.05,
  leanOffset: 0.42, leanRoll: 12 * DEG, leanSpeed: 10,
  crouchSpeed: 9,
  radius: 0.38,
};
const WEAPON = {
  name: 'AR (generic)', rpm: 800, mag: 30, reload: 2.4, dmgBody: 40, dmgHead: 100,
  hipSpread: 2.2, hipMoveSpread: 1.2, adsSpread: 0.12, adsMoveSpread: 0.35, crouchMul: 0.7,
  range: 120,
  // Siege-style recoil: the view itself climbs and never auto-recovers — you pull down.
  recoil(shot) {
    const v = shot < 3 ? 0.62 : shot < 8 ? 0.48 : 0.36;              // vertical deg per shot
    const phase = shot < 4 ? 0 : shot < 11 ? 1 : shot < 19 ? -1 : 1;  // horizontal drift pattern
    const h = phase * 0.12 + rand(-0.09, 0.09);
    return { v: v * rand(0.9, 1.1), h };
  },
};

// ---------------------------------------------------------------- settings
const settings = {
  dpi: 800, fov: 90, sensH: 10, sensV: 10, msmu: 0.02, xfactor: 0.02,
  ads: { '1': 50, '1.5': 50, '2': 50, '2.5': 50, '3': 50, '12': 50 },
  scope: 2.5, adsmode: 'hold', crouchmode: 'toggle', leanmode: 'hold', bots: 'auto', invert: false,
  difficulty: 1, duration: 60, mode: 'cqb',
};
const ADS_IDS = { '1': 'ads1', '1.5': 'ads15', '2': 'ads2', '2.5': 'ads25', '3': 'ads3', '12': 'ads12' };
const SIMPLE_IDS = ['dpi', 'fov', 'sensH', 'sensV', 'msmu', 'xfactor'];

function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem('sal-settings') || '{}')); } catch (e) {}
  settings.ads = Object.assign({ '1': 50, '1.5': 50, '2': 50, '2.5': 50, '3': 50, '12': 50 }, settings.ads || {});
  for (const id of SIMPLE_IDS) $(id).value = settings[id];
  for (const k in ADS_IDS) $(ADS_IDS[k]).value = settings.ads[k];
  $('scope').value = String(settings.scope); $('adsmode').value = settings.adsmode; $('crouchmode').value = settings.crouchmode || 'toggle'; $('leanmode').value = settings.leanmode || 'hold'; $('bots').value = String(settings.bots ?? 'auto');
  $('invert').checked = settings.invert;
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
  settings.scope = +$('scope').value; settings.adsmode = $('adsmode').value; settings.crouchmode = $('crouchmode').value; settings.leanmode = $('leanmode').value; settings.bots = $('bots').value; settings.invert = $('invert').checked;
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
  $('si-hip').textContent = `${R6.cm360(s.hipYawH, settings.dpi).toFixed(2)} cm`;
  $('si-hip2').textContent = `${s.hipYawH.toFixed(5)}°/count · eDPI ${settings.dpi * settings.sensH}`;
  $('si-ads').textContent = `${R6.cm360(s.adsYawH, settings.dpi).toFixed(2)} cm`;
  $('si-ads2').textContent = `${settings.scope}x · ${s.adsYawH.toFixed(5)}°/count`;
  $('si-fov').textContent = `${s.hipFov}° → ${s.adsFov.toFixed(1)}°`;
}

// ---------------------------------------------------------------- scenarios
const MODES = [
  // --- combat (move + shoot + recoil) ---
  { id: 'cqb', group: 'combat', name: 'Close Quarters', tag: '近距離 5–12m', bots: 2, zones: ['near'],
    desc: '箱・壁の間を走り回りピークする BOT を近距離で撃つ。腰だめ/ホロ主体。' },
  { id: 'mid', group: 'combat', name: 'Mid Range', tag: '中距離 15–28m', bots: 2, zones: ['mid'],
    desc: 'カバーから頭出し・リーンする BOT。ADS でのリコイル制御を鍛える。' },
  { id: 'long', group: 'combat', name: 'Long Range', tag: '遠距離 32–50m', bots: 2, zones: ['far'],
    desc: 'ACOG 推奨。ホール奥の BOT を細かいトラッキングとタップ撃ちで倒す。' },
  { id: 'mixed', group: 'combat', name: 'Mixed Range', tag: '全距離', bots: 3, zones: ['near', 'mid', 'far'],
    desc: '全距離に BOT。自分も移動しつつ距離に応じて腰だめ/ADS を切り替える。' },
  // --- tracking (laser, no recoil) ---
  { id: 'track', group: 'track', name: 'Smooth Tracking', tag: 'TRACKING', desc: 'オペレーター型ターゲットが高速で左右ストレイフ。追従時間で採点。' },
  { id: 'reactive', group: 'track', name: 'Reactive Strafe', tag: 'TRACKING · PEEK', desc: 'R6S のピーク/カウンターストレイフを模した急な方向転換・しゃがみ・リーン。' },
  { id: 'air', group: 'track', name: 'Air Tracking', tag: 'TRACKING · 3D', desc: '上下左右＋前後に飛び回るターゲットを追い続ける。' },
  { id: 'vision', group: 'track', name: 'Dynamic Vision', tag: '動体視力', desc: '5体が高速に動き回り、光る1体が切り替わる。光っている1体だけを追え。' },
  { id: 'flicktrack', group: 'track', name: 'Flick + Track', tag: 'HYBRID', desc: 'ターゲットがワープ→即ストレイフ。フリックから追従への切り替え。' },
  { id: 'microdot', group: 'track', name: 'Micro Dot Track', tag: 'PRECISION · ADS', desc: '小さなヘッド大のターゲットが細かく揺れる。ADS での微調整。' },
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
uniform vec3 uColor; uniform float uGrid; uniform float uEmis; uniform vec3 uCam; uniform float uFog;
float gridLine(vec2 p, float scale, float width){
  vec2 q = p*scale; vec2 d = fwidth(q);
  vec2 a = abs(fract(q-0.5)-0.5)/max(d, vec2(1e-4));
  float l = 1.0-clamp(min(a.x,a.y)/width,0.0,1.0);
  return l*(1.0-smoothstep(0.25,0.6,max(d.x,d.y)));
}
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(0.35,1.0,0.5));
  float d = max(dot(n,L),0.0)*0.4+0.7;
  vec3 c = uColor*d;
  if(uGrid>0.5){
    vec3 an = abs(n); vec2 p = an.y>0.5 ? vW.xz : (an.x>0.5 ? vW.zy : vW.xy);
    float l1 = gridLine(p, 1.0, 1.2), l2 = gridLine(p, 4.0, 1.0);
    c = mix(c, c*0.55+vec3(0.14,0.15,0.16), l1*0.95);
    c = mix(c, c*0.8+vec3(0.03), l2*0.6);
    if(uGrid>1.5 && an.y<0.5 && vW.y>1.0 && vW.y<1.1) c = mix(c, vec3(0.9,0.5,0.1), 0.65);
  }
  float dist = length(vW-uCam); c = mix(c, vec3(0.045,0.05,0.06), (1.0-exp(-dist*0.012))*uFog);
  float rim = pow(1.0-max(dot(n, normalize(uCam-vW)),0.0), 3.0);
  c += uColor*uEmis*(0.6+rim*0.8);
  o = vec4(c,1.0);
}`;
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const U = {}; for (const n of ['uProj', 'uView', 'uModel', 'uColor', 'uGrid', 'uEmis', 'uCam', 'uFog']) U[n] = gl.getUniformLocation(prog, n);

function makeMesh(pos, nrm, idx) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null); return { vao, n: idx.length };
}
function boxMesh(inward = false) {
  const P = [], N = [], I = [];
  const face = (a, b, c, d, n) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); if (inward) I.push(o, o + 2, o + 1, o, o + 3, o + 2); else I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  face([-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]);
  face([.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]);
  face([.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]);
  face([-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]);
  face([-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]);
  face([-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0]);
  if (inward) for (let i = 0; i < N.length; i++) N[i] = -N[i];
  return makeMesh(P, N, I);
}
function capsuleMesh(r, hh, seg = 20, rings = 8) {
  const P = [], N = [], I = [];
  const addRing = (y, rr, ny, nyScale) => { for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a); P.push(cx * rr, y, sz * rr); const nx = cx * nyScale, nz = sz * nyScale; const l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l); } };
  for (let j = 0; j <= rings; j++) { const t = -Math.PI / 2 + (j / rings) * Math.PI / 2; addRing(-hh + Math.sin(t) * r, Math.cos(t) * r, Math.sin(t), Math.cos(t)); }
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
const meshRoom = boxMesh(true);
const meshBox = boxMesh(false);
const meshBody = capsuleMesh(0.28, 0.55);
const meshHead = sphereMesh(0.16);
const meshDot = sphereMesh(0.14);
const meshUnit = sphereMesh(1.0, 10, 6);

// matrices
function perspective(fovyDeg, aspect, n, f) { const t = 1 / Math.tan(fovyDeg * DEG / 2); const m = new Float32Array(16); m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
function viewMatrix(yaw, pitch, roll, eye) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = [sy * cp, sp, -cy * cp]; let r = [cy, 0, sy]; let u = [-sy * sp, cp, cy * sp];
  if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); const r2 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr]; u = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr]; r = r2; }
  const m = new Float32Array(16);
  m[0] = r[0]; m[4] = r[1]; m[8] = r[2]; m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot(r, eye); m[13] = -dot(u, eye); m[14] = dot(f, eye); m[15] = 1;
  return { m, f, r, u };
}
const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MODEL = new Float32Array(16);
function modelTRS(x, y, z, sx = 1, sy = 1, sz = 1, lean = 0) {
  const c = Math.cos(lean), s = Math.sin(lean);
  MODEL.set([sx * c, sx * s, 0, 0, -sy * s, sy * c, 0, 0, 0, 0, sz, 0, x, y, z, 1]); return MODEL;
}
function draw(mesh, model, color, grid = 0, emis = 0) {
  gl.uniformMatrix4fv(U.uModel, false, model); gl.uniform3fv(U.uColor, color); gl.uniform1f(U.uGrid, grid); gl.uniform1f(U.uEmis, emis);
  gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
}

// ---------------------------------------------------------------- map
const ROOM = { xmin: -12, xmax: 12, zmin: -52, zmax: 10, h: 5 };
// props: axis-aligned boxes {x,z,w,d,h,kind}  (y from 0 to h). kind: crate | wall | pillar
const PROPS = [];
function addProp(x, z, w, d, h, kind = 'crate') { PROPS.push({ x, z, w, d, h, kind, xmin: x - w / 2, xmax: x + w / 2, zmin: z - d / 2, zmax: z + d / 2 }); }
function buildMap() {
  PROPS.length = 0;
  // player zone (z -1..9): cover for the shooter — break line of sight, then peek
  addProp(-5.5, -0.6, 7.0, 0.4, 2.4, 'wall');   // left wall segment  (doorway between x -2.0 .. 1.0)
  addProp(4.5, -0.6, 7.0, 0.4, 2.4, 'wall');    // right wall segment (side gaps at |x| > 9)
  addProp(-3.0, 2.4, 1.6, 1.6, 1.2);            // low crates for head peeks
  addProp(3.2, 2.0, 1.6, 1.6, 1.2);
  addProp(-8.5, 4.5, 1.2, 1.2, 2.0, 'pillar');
  addProp(8.5, 4.0, 1.2, 1.2, 2.0, 'pillar');
  addProp(0, 7.5, 1.2, 1.2, 0.9);
  // near zone (z -12..-2)
  addProp(-6, -5, 1.6, 1.6, 1.2); addProp(6, -6, 1.6, 1.6, 1.2); addProp(0, -9, 3.0, 1.0, 2.2, 'wall');
  addProp(-9, -10, 1.2, 1.2, 1.2); addProp(9, -11, 1.2, 1.2, 2.0, 'pillar'); addProp(-2.5, -3, 1.2, 1.2, 0.9);
  // mid zone (z -28..-14)
  addProp(-7, -17, 2.0, 1.0, 2.2, 'wall'); addProp(7, -19, 2.0, 1.0, 2.2, 'wall'); addProp(0, -22, 1.6, 1.6, 1.2);
  addProp(-3.5, -26, 1.6, 1.6, 1.2); addProp(4, -25, 1.2, 1.2, 2.0, 'pillar'); addProp(-10, -22, 1.6, 1.6, 1.2); addProp(10, -27, 1.6, 1.6, 1.2);
  // far zone (z -50..-32)
  addProp(-5, -35, 2.4, 1.0, 2.2, 'wall'); addProp(6, -38, 1.6, 1.6, 1.2); addProp(0, -42, 1.6, 1.6, 1.2);
  addProp(-8, -45, 1.2, 1.2, 2.0, 'pillar'); addProp(8, -47, 2.4, 1.0, 2.2, 'wall'); addProp(-2, -49, 1.6, 1.6, 1.2);
}
const ZONES = { near: { zmin: -12, zmax: -2 }, mid: { zmin: -28, zmax: -14 }, far: { zmin: -50, zmax: -32 } };
function coverSpots(zone) {
  const z = ZONES[zone]; const spots = [];
  for (const p of PROPS) if (p.z >= z.zmin && p.z <= z.zmax) {
    const back = p.zmin - 0.55;           // hide behind (farther from player)
    spots.push({ hide: [p.x, back], peeks: [[p.xmin - 0.55, back], [p.xmax + 0.55, back]], low: p.h < 1.6, prop: p });
  }
  return spots;
}
// movement collision: circle (x,z,r) vs props & room; returns corrected position
function collide(x, z, r) {
  x = clamp(x, ROOM.xmin + r, ROOM.xmax - r); z = clamp(z, ROOM.zmin + r, ROOM.zmax - r);
  for (const p of PROPS) {
    const cx = clamp(x, p.xmin, p.xmax), cz = clamp(z, p.zmin, p.zmax);
    let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-8) { // inside: push out along smallest axis
        const px = Math.min(x - p.xmin, p.xmax - x), pz = Math.min(z - p.zmin, p.zmax - z);
        if (px < pz) x = (x - p.xmin < p.xmax - x) ? p.xmin - r : p.xmax + r; else z = (z - p.zmin < p.zmax - z) ? p.zmin - r : p.zmax + r;
      } else { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
    }
  }
  return [x, z];
}
// ray vs AABB (slab). returns t or Infinity
function rayBox(o, d, p) {
  let tmin = 0, tmax = Infinity;
  const mins = [p.xmin, 0, p.zmin], maxs = [p.xmax, p.h, p.zmax];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mins[i] || o[i] > maxs[i]) return Infinity; continue; }
    let t1 = (mins[i] - o[i]) / d[i], t2 = (maxs[i] - o[i]) / d[i]; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayProps(o, d) { let t = Infinity; for (const p of PROPS) t = Math.min(t, rayBox(o, d, p)); return t; }
// ray vs segment capsule: returns {dist, t}
function segRay(o, d, a, b) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [a[0] - o[0], a[1] - o[1], a[2] - o[2]];
  const aa = dot(d, d), bb = dot(d, u), cc = dot(u, u), dd = dot(d, w), ee = dot(u, w);
  const den = aa * cc - bb * bb; let s, t;
  if (den < 1e-9) { s = 0; t = dd / aa; } else { s = clamp((bb * dd - aa * ee) / den, 0, 1); t = (dd + bb * s) / aa; }
  if (t < 0) t = 0;
  const px = o[0] + d[0] * t - (a[0] + u[0] * s), py = o[1] + d[1] * t - (a[1] + u[1] * s), pz = o[2] + d[2] * t - (a[2] + u[2] * s);
  return { dist: Math.hypot(px, py, pz), t };
}
function raySphere(o, d, c, r) {
  const m = [o[0] - c[0], o[1] - c[1], o[2] - c[2]]; const b = dot(m, d), cc = dot(m, m) - r * r;
  if (cc > 0 && b > 0) return Infinity; const disc = b * b - cc; if (disc < 0) return Infinity;
  return Math.max(0, -b - Math.sqrt(disc));
}

// ---------------------------------------------------------------- game state
const game = {
  running: false, yaw: 0, pitch: 0, ads: false, firing: false,
  t: 0, timeLeft: 60, onTargetTime: 0, fireTime: 0, score: 0, hitStreak: 0,
  shots: 0, hits: 0, headshots: 0, kills: 0, damage: 0,
  mode: MODES[0], diff: 1, targets: [], bots: [],
  aimFov: 90, combat: false,
  // player
  px: 0, pz: 5.5, eyeY: MOVE.eyeStand, crouch: 0, crouchHeld: false, lean: 0, leanTarget: 0, leanToggle: 0, sprint: false, moving: false, speedNow: 0,
  // weapon
  ammo: WEAPON.mag, reloading: 0, fireCd: 0, shotIdx: 0, recoilVis: 0, muzzle: 0, hitMarker: 0, impacts: [],
  visionTimer: 1.5,
};
const COLORS = {
  body: [0.82, 0.84, 0.86], bodyHit: [1.0, 0.72, 0.25], head: [0.95, 0.35, 0.25], dead: [0.35, 0.15, 0.12],
  active: [1.0, 0.62, 0.1], inactive: [0.42, 0.48, 0.56], wall: [0.42, 0.44, 0.48],
  crate: [0.55, 0.42, 0.25], propwall: [0.5, 0.52, 0.56], pillar: [0.46, 0.48, 0.52],
  gun: [0.16, 0.17, 0.19], gun2: [0.24, 0.25, 0.28], flash: [1.0, 0.85, 0.5], spark: [1.0, 0.7, 0.3],
};

// ---------------------------------------------------------------- tracking targets (laser modes)
class Target {
  constructor(opts) { Object.assign(this, { x: 0, y: 1.0, z: -6, vx: 0, vy: 0, vz: 0, r: 0.28, hh: 0.55, lean: 0, crouch: 0, active: true, kind: 'op', timer: 0 }, opts); }
  rayHit(o, d) {
    const hh = this.hh * (1 - this.crouch * 0.45);
    const a = [this.x, this.y - hh, this.z], b = [this.x + Math.sin(-this.lean) * 2 * hh, this.y + hh * Math.cos(this.lean), this.z];
    return segRay(o, d, a, b).dist <= this.r;
  }
}
const B = { xmin: -10, xmax: 10, ymin: 0.9, ymax: 4.2, zmin: -24, zmax: -4 };
function spawnTargets() {
  const T = game.targets = []; const m = game.mode.id; const D = game.diff;
  if (m === 'track') T.push(new Target({ x: 0, z: -8, vx: 6 * D }));
  else if (m === 'reactive') T.push(new Target({ x: 0, z: -7, vx: 7 * D, timer: 0.4 }));
  else if (m === 'air') T.push(new Target({ x: 0, y: 2.5, z: -10, vx: 5 * D, vy: 3 * D, vz: 3 * D, kind: 'ball', r: 0.33, hh: 0 }));
  else if (m === 'vision') { for (let i = 0; i < 5; i++) T.push(new Target({ x: rand(-8, 8), y: rand(1.2, 4), z: rand(-18, -6), vx: rand(-1, 1) * 7 * D, vy: rand(-1, 1) * 3 * D, vz: rand(-1, 1) * 3 * D, kind: 'ball', r: 0.3, hh: 0, active: i === 0 })); }
  else if (m === 'flicktrack') T.push(new Target({ x: 0, z: -9, vx: 6 * D, timer: 2.2 }));
  else if (m === 'microdot') T.push(new Target({ x: 0, y: 1.5, z: -13, kind: 'dot', r: 0.15, hh: 0, vx: 0.8 * D, vy: 0.4 * D }));
}
function updateTargets(dt) {
  const m = game.mode.id, D = game.diff, t = game.t;
  for (const T of game.targets) {
    switch (m) {
      case 'track':
        T.vx += rand(-1, 1) * 30 * D * dt; T.vx = clamp(T.vx, -9 * D, 9 * D);
        if (Math.abs(T.vx) < 2.5 * D) T.vx += Math.sign(T.vx || 1) * 2 * D * dt;
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx * rand(0.8, 1.1); T.timer = rand(0.6, 1.8) / D; }
        T.vz = Math.sin(t * 0.7) * 1.5 * D; break;
      case 'reactive':
        T.timer -= dt;
        if (T.timer <= 0) {
          const roll = Math.random();
          if (roll < 0.55) T.vx = -Math.sign(T.vx || 1) * rand(5, 9) * D; else if (roll < 0.7) T.vx = 0; else if (roll < 0.85) T.vx = Math.sign(T.vx || 1) * rand(5, 9) * D; else { T.vx = rand(-1, 1) * 9 * D; T.vz = rand(-1, 1) * 4 * D; }
          T.crouchTarget = Math.random() < 0.35 ? 1 : 0; T.leanTarget = Math.random() < 0.4 ? (Math.random() < 0.5 ? -0.35 : 0.35) : 0;
          T.timer = rand(0.18, 0.75) / D;
        }
        T.crouch += ((T.crouchTarget || 0) - T.crouch) * Math.min(1, dt * 14); T.lean += ((T.leanTarget || 0) - T.lean) * Math.min(1, dt * 16);
        T.vz *= Math.exp(-dt * 2); break;
      case 'air': case 'vision': {
        const k = m === 'air' ? 40 : 30; T.vx += rand(-1, 1) * k * D * dt; T.vy += rand(-1, 1) * 20 * D * dt; T.vz += rand(-1, 1) * 15 * D * dt;
        const sp = Math.hypot(T.vx, T.vy, T.vz), mx = (m === 'air' ? 10 : 9) * D; if (sp > mx) { T.vx *= mx / sp; T.vy *= mx / sp; T.vz *= mx / sp; }
        if (m === 'air') { T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx; T.timer = rand(0.5, 1.5) / D; } } break; }
      case 'flicktrack':
        T.timer -= dt;
        if (T.timer <= 0) { T.x = rand(-9, 9); T.y = rand(1.0, 3.0); T.z = rand(-20, -5); T.vx = (Math.random() < 0.5 ? -1 : 1) * rand(4, 8) * D; T.timer = rand(1.6, 2.6) / Math.sqrt(D); T.flash = 0.25; }
        T.flash = Math.max(0, (T.flash || 0) - dt); T.vx += rand(-1, 1) * 20 * D * dt; break;
      case 'microdot':
        T.vx += rand(-1, 1) * 14 * D * dt; T.vy += rand(-1, 1) * 10 * D * dt;
        T.vx = clamp(T.vx, -2.2 * D, 2.2 * D); T.vy = clamp(T.vy, -1.4 * D, 1.4 * D);
        T.timer -= dt; if (T.timer <= 0) { T.vx = -T.vx; T.timer = rand(0.3, 1.0) / D; } break;
    }
    T.x += T.vx * dt; T.y += T.vy * dt; T.z += T.vz * dt;
    if (T.x < B.xmin) { T.x = B.xmin; T.vx = Math.abs(T.vx); } if (T.x > B.xmax) { T.x = B.xmax; T.vx = -Math.abs(T.vx); }
    if (T.hh > 0) { T.y = T.hh + T.r + 0.05; T.vy = 0; } else { if (T.y < B.ymin) { T.y = B.ymin; T.vy = Math.abs(T.vy); } if (T.y > B.ymax) { T.y = B.ymax; T.vy = -Math.abs(T.vy); } }
    if (T.z < B.zmin) { T.z = B.zmin; T.vz = Math.abs(T.vz); } if (T.z > B.zmax) { T.z = B.zmax; T.vz = -Math.abs(T.vz); }
  }
  if (m === 'vision') {
    game.visionTimer -= dt;
    if (game.visionTimer <= 0) {
      const cur = game.targets.findIndex(x => x.active); let nx; do { nx = Math.floor(Math.random() * game.targets.length); } while (nx === cur);
      game.targets.forEach((x, i) => x.active = i === nx); game.visionTimer = rand(0.9, 2.0) / Math.sqrt(D);
    }
  }
}

// ---------------------------------------------------------------- bots (combat modes)
const BOT = { r: 0.28, hh: 0.55, headR: 0.16, hp: 100, walk: 3.1, sprint: 5.3, crouch: 1.55, respawn: 1.2 };
class Bot {
  constructor(zone) { this.zone = zone; this.spawn(); }
  spawn() {
    const spots = coverSpots(this.zone); this.spot = pick(spots);
    this.x = this.spot.hide[0]; this.z = this.spot.hide[1]; this.hp = BOT.hp; this.dead = 0; this.alive = true;
    this.crouch = this.spot.low ? 1 : 0; this.crouchT = this.crouch; this.lean = 0; this.leanT = 0; this.flash = 0;
    this.state = 'hide'; this.timer = rand(0.3, 1.0); this.dest = null; this.sprint = false;
  }
  get bodyY() { return (BOT.hh * (1 - this.crouch * 0.45)) + BOT.r + 0.05; }
  get segs() { // body capsule segment + head center
    const hh = BOT.hh * (1 - this.crouch * 0.45), y = this.bodyY;
    const a = [this.x, y - hh, this.z], b = [this.x + Math.sin(-this.lean) * 2 * hh, y + hh * Math.cos(this.lean), this.z];
    const head = [this.x + Math.sin(-this.lean) * (hh + BOT.r + 0.05), y + (hh + BOT.r + 0.05) * Math.cos(this.lean), this.z];
    return { a, b, head };
  }
  update(dt, D) {
    if (!this.alive) { this.dead += dt; if (this.dead > BOT.respawn) this.spawn(); return; }
    this.timer -= dt; this.flash = Math.max(0, this.flash - dt);
    switch (this.state) {
      case 'hide':
        if (this.timer <= 0) {
          const r = Math.random();
          if (r < 0.6) { // peek out sideways
            this.state = 'peek'; this.dest = pick(this.spot.peeks); this.timer = rand(0.5, 1.4) / D; this.crouchT = Math.random() < 0.3 ? 1 : 0;
            this.leanT = Math.random() < 0.5 ? (this.dest[0] < this.x ? 0.4 : -0.4) : 0;
          } else if (r < 0.8 && this.spot.low) { // stand up over low cover (head peek)
            this.state = 'headpeek'; this.crouchT = 0; this.timer = rand(0.35, 0.9) / D;
          } else { // relocate to another cover (walk or sprint)
            const spots = coverSpots(this.zone).filter(s => s.prop !== this.spot.prop); this.spot = pick(spots); this.dest = this.spot.hide;
            this.state = 'move'; this.sprint = Math.random() < 0.55; this.crouchT = 0; this.leanT = 0;
          }
        }
        break;
      case 'peek':
        this.moveTo(this.dest, this.crouchT ? BOT.crouch : BOT.walk, dt);
        if (this.timer <= 0) { // sometimes counter-strafe to the other side, else back to cover
          if (Math.random() < 0.35) { this.dest = this.spot.peeks.find(p => p !== this.dest) || this.spot.hide; this.leanT = -this.leanT; this.timer = rand(0.4, 1.0) / D; }
          else { this.state = 'return'; this.dest = this.spot.hide; this.leanT = 0; this.timer = 2; }
        }
        break;
      case 'return':
        if (this.moveTo(this.dest, BOT.walk, dt) || this.timer <= 0) { this.state = 'hide'; this.crouchT = this.spot.low ? 1 : 0; this.timer = rand(0.3, 1.2) / D; }
        break;
      case 'headpeek':
        if (this.timer <= 0) { this.crouchT = 1; this.state = 'hide'; this.timer = rand(0.4, 1.2) / D; }
        break;
      case 'move':
        if (this.moveTo(this.dest, this.sprint ? BOT.sprint : BOT.walk, dt)) { this.state = 'hide'; this.crouchT = this.spot.low ? 1 : 0; this.timer = rand(0.2, 0.8) / D; }
        break;
    }
    this.crouch += (this.crouchT - this.crouch) * Math.min(1, dt * 10); this.lean += (this.leanT - this.lean) * Math.min(1, dt * 12);
  }
  moveTo(dest, speed, dt) {
    const dx = dest[0] - this.x, dz = dest[1] - this.z; const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt); let nx = this.x + dx / d * step, nz = this.z + dz / d * step;
    [nx, nz] = collide(nx, nz, BOT.r);
    // if stuck on a prop, slide along the axis that still moves
    if (Math.hypot(nx - this.x, nz - this.z) < step * 0.3) {
      const [ax, az] = collide(this.x + Math.sign(dx) * step, this.z, BOT.r); const [bx, bz] = collide(this.x, this.z + Math.sign(dz) * step, BOT.r);
      if (Math.hypot(ax - this.x, az - this.z) > Math.hypot(bx - this.x, bz - this.z)) { nx = ax; nz = az; } else { nx = bx; nz = bz; }
      this.stuck = (this.stuck || 0) + dt; if (this.stuck > 1.5) { this.stuck = 0; return true; }
    } else this.stuck = 0;
    this.x = nx; this.z = nz; return false;
  }
  hitTest(o, d) { // returns {t, part} or null
    const s = this.segs; const th = raySphere(o, d, s.head, BOT.headR); const body = segRay(o, d, s.a, s.b);
    if (th < Infinity) return { t: th, part: 'head' };
    if (body.dist <= BOT.r) return { t: body.t, part: 'body' };
    return null;
  }
}
function spawnBots() {
  game.bots = []; const m = game.mode; const n = settings.bots === 'auto' ? m.bots + (game.diff >= 1.35 ? 1 : 0) : clamp(+settings.bots || 1, 1, 10);
  for (let i = 0; i < n; i++) game.bots.push(new Bot(m.zones[i % m.zones.length]));
}

// ---------------------------------------------------------------- input
const input = { dx: 0, dy: 0, events: 0, hz: 0, hzT: 0 };
const keys = {};
let locked = false;
function onMove(e) { if (!locked) return; input.dx += e.movementX; input.dy += e.movementY; input.events++; }
if ('onpointerrawupdate' in window) {
  document.addEventListener('pointerrawupdate', (e) => { const ev = e.getCoalescedEvents?.() || []; if (ev.length > 1) { for (const c of ev) onMove(c); } else onMove(e); });
} else {
  document.addEventListener('mousemove', (e) => { const ev = e.getCoalescedEvents?.() || []; if (ev.length > 1) { for (const c of ev) onMove(c); } else onMove(e); });
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && game.running) pauseToMenu(); });
canvas.addEventListener('mousedown', (e) => {
  if (!locked) return; e.preventDefault();
  if (e.button === 0) game.firing = true;
  if (e.button === 2) { if (settings.adsmode === 'hold') game.ads = true; else game.ads = !game.ads; }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) game.firing = false; if (e.button === 2 && settings.adsmode === 'hold') game.ads = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!game.running) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ControlLeft', 'KeyC', 'KeyQ', 'KeyE', 'KeyR', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && game.combat) startReload();
  if (e.code === 'Backspace') startRun();
  if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat && settings.leanmode === 'toggle') { const dir = e.code === 'KeyQ' ? 1 : -1; game.leanToggle = game.leanToggle === dir ? 0 : dir; }
  if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) { if (settings.crouchmode === 'toggle') game.crouchHeld = !game.crouchHeld; else game.crouchHeld = true; }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; if ((e.code === 'KeyC' || e.code === 'ControlLeft') && settings.crouchmode === 'hold') game.crouchHeld = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; game.firing = false; });

async function requestLock() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) await p.catch(() => canvas.requestPointerLock()); }
  catch (e) { try { canvas.requestPointerLock(); } catch (_) {} }
}

// ---------------------------------------------------------------- player
function updatePlayer(dt) {
  const crouchT = game.crouchHeld ? 1 : 0; game.crouch += (crouchT - game.crouch) * Math.min(1, dt * MOVE.crouchSpeed);
  game.leanTarget = settings.leanmode === 'toggle' ? game.leanToggle : (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0); game.lean += (game.leanTarget - game.lean) * Math.min(1, dt * MOVE.leanSpeed);
  game.eyeY = MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * game.crouch;
  // movement (R6S: no acceleration, sprint only forward, ADS slows, crouch slows)
  let fx = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), sx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  game.sprint = !!keys.ShiftLeft && fx > 0 && !game.ads && game.crouch < 0.5;
  game.moving = fx !== 0 || sx !== 0;
  let speed = game.sprint ? MOVE.sprint : MOVE.walk;
  if (game.crouch > 0.5) speed = MOVE.crouch;
  if (game.ads) speed *= MOVE.adsMul;
  if (fx < 0) speed *= MOVE.backMul; if (fx === 0 && sx !== 0) speed *= MOVE.strafeMul;
  game.speedNow = game.moving ? speed : 0;
  if (game.moving) {
    const len = Math.hypot(fx, sx); fx /= len; sx /= len;
    const cy = Math.cos(game.yaw), sy = Math.sin(game.yaw);
    const mx = (sy * fx + cy * sx) * speed * dt, mz = (-cy * fx + sy * sx) * speed * dt;
    const [nx, nz] = collide(game.px + mx, game.pz + mz, MOVE.radius); game.px = nx; game.pz = nz;
  }
}
function eyePos() { // lean shifts the camera sideways (R6S lean ≈ 0.4m) along the un-rolled right vector
  const cy = Math.cos(game.yaw), sy = Math.sin(game.yaw); const off = -game.lean * MOVE.leanOffset;
  return [game.px + cy * off, game.eyeY - Math.abs(game.lean) * 0.12, game.pz + sy * off];
}

// ---------------------------------------------------------------- weapon
function startReload() { if (game.reloading > 0 || game.ammo === WEAPON.mag) return; game.reloading = WEAPON.reload; }
function spreadDeg() {
  let s = game.ads ? WEAPON.adsSpread : WEAPON.hipSpread;
  if (game.moving) s += (game.ads ? WEAPON.adsMoveSpread : WEAPON.hipMoveSpread) * (game.sprint ? 2 : 1);
  if (game.crouch > 0.5) s *= WEAPON.crouchMul;
  return s;
}
function fireShot(eye, view) {
  game.ammo--; game.shots++; game.fireCd += 60 / WEAPON.rpm; game.muzzle = 0.05; game.recoilVis = 1;
  const sp = spreadDeg() * DEG; const ang = Math.random() * Math.PI * 2, mag = Math.sqrt(Math.random()) * sp;
  const d = [0, 1, 2].map(i => view.f[i] + view.r[i] * Math.cos(ang) * mag + view.u[i] * Math.sin(ang) * mag);
  const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
  const tProp = rayProps(eye, d);
  let best = null;
  for (const b of game.bots) { if (!b.alive) continue; const h = b.hitTest(eye, d); if (h && h.t < tProp && (!best || h.t < best.t)) best = { ...h, bot: b }; }
  if (best) {
    const dmg = best.part === 'head' ? WEAPON.dmgHead : WEAPON.dmgBody; best.bot.hp -= dmg; best.bot.flash = 0.12; game.hits++; game.damage += dmg; game.hitMarker = 0.12;
    game.score += 10;
    if (best.bot.hp <= 0) { best.bot.alive = false; best.bot.dead = 0; game.kills++; if (best.part === 'head') { game.headshots++; game.score += 150; } else game.score += 100; }
    game.impacts.push({ p: [eye[0] + d[0] * best.t, eye[1] + d[1] * best.t, eye[2] + d[2] * best.t], t: 0.08, c: best.part === 'head' ? [1, 0.2, 0.2] : COLORS.spark });
  } else {
    const t = Math.min(tProp, WEAPON.range); game.impacts.push({ p: [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t], t: 0.06, c: [0.8, 0.8, 0.8] });
  }
  // recoil: moves the actual view (no auto recovery, as in Siege)
  const rc = WEAPON.recoil(Math.floor(game.shotIdx)); game.shotIdx++; game.pitch += rc.v * DEG; game.yaw += rc.h * DEG;
  if (game.ammo <= 0) startReload();
}
function updateWeapon(dt, eye, view) {
  game.fireCd -= dt; game.muzzle = Math.max(0, game.muzzle - dt); game.hitMarker = Math.max(0, game.hitMarker - dt);
  game.recoilVis = Math.max(0, game.recoilVis - dt * 12);
  if (game.reloading > 0) { game.reloading -= dt; if (game.reloading <= 0) { game.reloading = 0; game.ammo = WEAPON.mag; game.shotIdx = 0; } }
  if (game.firing && game.reloading <= 0 && game.ammo > 0) { let guard = 0; while (game.fireCd <= 0 && game.ammo > 0 && guard++ < 8) fireShot(eye, view); }
  else { if (game.fireCd < 0) game.fireCd = 0; if (!game.firing) game.shotIdx = Math.max(0, game.shotIdx - dt * 10); } // pattern resets a bit when you let go
  if (game.firing) game.fireTime += dt;
  for (let i = game.impacts.length - 1; i >= 0; i--) { game.impacts[i].t -= dt; if (game.impacts[i].t <= 0) game.impacts.splice(i, 1); }
}

// ---------------------------------------------------------------- run control
let selectedMode = 'cqb';
function buildModeList() {
  for (const g of ['combat', 'track']) {
    const box = $('modes-' + g); box.innerHTML = '';
    for (const m of MODES.filter(x => x.group === g)) {
      const b = document.createElement('button'); b.className = 'mode' + (m.id === selectedMode ? ' sel' : ''); b.dataset.id = m.id;
      b.innerHTML = `<b>${m.name}</b><span>${m.desc}</span><em class="tag">${m.tag}</em>`;
      b.onclick = () => { selectedMode = m.id; settings.mode = m.id; buildModeList(); showBest(); };
      box.appendChild(b);
    }
  }
}
function bestKey() { return `sal-best-${selectedMode}-${$('difficulty').value}-${$('duration').value}`; }
function showBest() {
  let v = null; try { v = JSON.parse(localStorage.getItem(bestKey())); } catch (e) {}
  const m = MODES.find(x => x.id === selectedMode);
  $('best').innerHTML = v ? `<b>BEST</b> ${m.name} · ${$('difficulty').selectedOptions[0].text} · ${$('duration').value}s — スコア <b>${v.score}</b>${v.acc != null ? ` · ${v.acc.toFixed(1)}%` : ''}` : `<b>BEST</b> ${m.name} — 記録なし`;
}
function startRun() {
  readSettings();
  game.mode = MODES.find(m => m.id === selectedMode); game.diff = settings.difficulty; game.combat = game.mode.group === 'combat';
  Object.assign(game, { t: 0, timeLeft: settings.duration, onTargetTime: 0, fireTime: 0, score: 0, hitStreak: 0, shots: 0, hits: 0, headshots: 0, kills: 0, damage: 0,
    ads: false, firing: false, yaw: 0, pitch: 0, visionTimer: 1.5, px: 0, pz: 5.5, crouchHeld: false, crouch: 0, lean: 0, leanToggle: 0, ammo: WEAPON.mag, reloading: 0, fireCd: 0, shotIdx: 0, impacts: [], hitMarker: 0, muzzle: 0 });
  input.dx = input.dy = 0; fps.sum = 0; fps.n = 0;
  buildMap(); game.targets = []; game.bots = [];
  if (game.combat) spawnBots(); else spawnTargets();
  game.running = true;
  $('menu').classList.add('hidden'); $('results').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('h-mode').textContent = game.mode.name;
  const s = sensState();
  $('h-sens').textContent = `${settings.dpi}DPI · H${settings.sensH}/V${settings.sensV} · ${R6.cm360(s.hipYawH, settings.dpi).toFixed(1)}cm/360`;
  $('hud').classList.toggle('combat', game.combat);
  updateScopeUI();
}
function pauseToMenu() { game.running = false; game.firing = false; $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); if (game.t > 0.5) showResults(false); }
function finishRun() { game.running = false; game.firing = false; if (document.pointerLockElement) document.exitPointerLock(); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); showResults(true); }
function showResults(complete) {
  const played = settings.duration - game.timeLeft; const score = Math.round(game.score);
  let rows = []; let acc = null;
  if (game.combat) {
    acc = game.shots ? game.hits / game.shots * 100 : 0;
    rows = [['キル', game.kills], ['ヘッドショット', game.headshots], ['命中率', `${acc.toFixed(1)}% (${game.hits}/${game.shots})`], ['与ダメージ', game.damage], ['キル/分', (game.kills / Math.max(played, 1) * 60).toFixed(1)]];
  } else {
    acc = played > 0 ? game.onTargetTime / played * 100 : 0; const fireAcc = game.fireTime > 0 ? game.onTargetTime / game.fireTime * 100 : 0;
    rows = [['オンターゲット率（全時間）', `${acc.toFixed(1)}%`], ['命中率（射撃中）', `${fireAcc.toFixed(1)}%`], ['オンターゲット時間', `${game.onTargetTime.toFixed(2)}s / ${played.toFixed(1)}s`]];
  }
  let best = null; try { best = JSON.parse(localStorage.getItem(bestKey())); } catch (e) {}
  let isBest = false;
  if (complete && (!best || score > best.score)) { isBest = true; try { localStorage.setItem(bestKey(), JSON.stringify({ score, acc })); } catch (e) {} }
  $('results-score').innerHTML = `${score}${isBest ? '<small>★ NEW BEST</small>' : ''}`;
  $('results-title').textContent = `${game.mode.name} · ${$('difficulty').selectedOptions[0].text} · ${settings.duration}s` + (complete ? '' : '（中断 — 記録は保存されません）');
  $('results-body').innerHTML = rows.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('') + `<div class="r"><span>平均FPS</span><b>${fps.avg.toFixed(0)}</b></div>`;
  $('results').classList.remove('hidden'); showBest();
}
function updateScopeUI() {
  const sc = $('scope-ov'); const ch = $('crosshair');
  if (game.ads) { ch.classList.add('ads'); sc.className = settings.scope <= 1.5 ? 'holo' : 'acog'; $('h-zoom').textContent = `ADS ${settings.scope}x`; }
  else { sc.classList.add('hidden'); ch.classList.remove('ads'); $('h-zoom').textContent = 'HIPFIRE'; }
}

// ---------------------------------------------------------------- main loop
const fps = { frames: 0, acc: 0, cur: 0, avg: 0, sum: 0, n: 0 };
let lastAds = null, lastHudText = '';
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
  fps.frames++; fps.acc += dt; if (fps.acc >= 0.25) { fps.cur = fps.frames / fps.acc; fps.frames = 0; fps.acc = 0; if (game.running) { fps.sum += fps.cur; fps.n++; fps.avg = fps.sum / fps.n; } }
  input.hzT += dt; if (input.hzT >= 0.5) { input.hz = input.events / input.hzT; input.events = 0; input.hzT = 0; }

  // --- mouse look (R6S formulas) ---
  const s = sensState();
  const yawPer = game.ads ? s.adsYawH : s.hipYawH, pitchPer = game.ads ? s.adsYawV : s.hipYawV;
  game.yaw += input.dx * yawPer * DEG; game.pitch -= input.dy * pitchPer * DEG * (settings.invert ? -1 : 1);
  game.pitch = clamp(game.pitch, -89 * DEG, 89 * DEG);
  input.dx = input.dy = 0;
  const targetFov = game.ads ? s.adsFov : s.hipFov;
  game.aimFov += (targetFov - game.aimFov) * Math.min(1, dt * 22); if (Math.abs(game.aimFov - targetFov) < 0.02) game.aimFov = targetFov;
  if (lastAds !== game.ads) { lastAds = game.ads; if (game.running) updateScopeUI(); }

  // --- simulation ---
  if (game.running) { game.t += dt; game.timeLeft -= dt; updatePlayer(dt); }
  const roll = game.lean * MOVE.leanRoll;
  const eye = eyePos(); const view = viewMatrix(game.yaw, game.pitch, roll, eye);
  let onTarget = false;
  if (game.running) {
    if (game.combat) {
      for (const b of game.bots) b.update(dt, game.diff);
      updateWeapon(dt, eye, view);
    } else {
      updateTargets(dt);
      for (const T of game.targets) { T.hit = T.active && T.rayHit(eye, view.f); if (T.hit) onTarget = true; }
      if (game.firing) { game.fireTime += dt; if (onTarget) { game.onTargetTime += dt; game.hitStreak += dt; game.score += dt * 100 * (1 + Math.min(game.hitStreak, 2) * 0.25) * game.diff; } else game.hitStreak = 0; } else game.hitStreak = 0;
      $('hit-flash').classList.toggle('on', game.firing && onTarget);
    }
    // HUD
    $('h-time').textContent = Math.max(0, game.timeLeft).toFixed(1);
    $('h-score').textContent = Math.round(game.score);
    if (game.combat) { $('h-acc').textContent = (game.shots ? game.hits / game.shots * 100 : 0).toFixed(1) + '%'; $('h-kills').textContent = game.kills; $('h-ammo').textContent = game.reloading > 0 ? 'RELOAD' : `${game.ammo} / ∞`; $('h-ammo').classList.toggle('low', game.ammo <= 8); }
    else { const played = settings.duration - game.timeLeft; $('h-acc').textContent = (played > 0 ? game.onTargetTime / played * 100 : 0).toFixed(1) + '%'; }
    $('crosshair').classList.toggle('hit', game.hitMarker > 0);
    const st = `${game.sprint ? 'SPRINT' : game.crouch > 0.5 ? 'CROUCH' : game.moving ? 'WALK' : 'STAND'}${game.lean > 0.3 ? ' · LEAN L' : game.lean < -0.3 ? ' · LEAN R' : ''}`;
    if (st !== lastHudText) { lastHudText = st; $('h-stance').textContent = st; }
    if (game.timeLeft <= 0) finishRun();
  }
  $('h-fps').textContent = fps.cur.toFixed(0); $('h-hz').textContent = input.hz.toFixed(0);

  // --- render ---
  gl.clearColor(0.03, 0.035, 0.045, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const aspect = canvas.width / canvas.height;
  gl.uniformMatrix4fv(U.uProj, false, perspective(game.aimFov, aspect, 0.05, 250));
  gl.uniformMatrix4fv(U.uView, false, view.m); gl.uniform3fv(U.uCam, eye); gl.uniform1f(U.uFog, 1);
  draw(meshRoom, modelTRS((ROOM.xmin + ROOM.xmax) / 2, ROOM.h / 2, (ROOM.zmin + ROOM.zmax) / 2, ROOM.xmax - ROOM.xmin, ROOM.h, ROOM.zmax - ROOM.zmin), COLORS.wall, 2, 0);
  if (game.combat || !game.running) for (const p of PROPS) draw(meshBox, modelTRS(p.x, p.h / 2, p.z, p.w, p.h, p.d), p.kind === 'crate' ? COLORS.crate : p.kind === 'wall' ? COLORS.propwall : COLORS.pillar, 1, 0);
  for (const T of game.targets) {
    if (T.kind === 'op') {
      const hh = T.hh * (1 - T.crouch * 0.45); const col = T.hit ? COLORS.bodyHit : (T.flash ? [1, 0.9, 0.5] : COLORS.body);
      draw(meshBody, modelTRS(T.x, T.y, T.z, 1, hh / T.hh, 1, T.lean), col, 0, T.hit ? 0.5 : 0.05);
      draw(meshHead, modelTRS(T.x + Math.sin(-T.lean) * (hh + T.r + 0.05), T.y + (hh + T.r + 0.05) * Math.cos(T.lean), T.z), T.hit ? COLORS.bodyHit : COLORS.head, 0, T.hit ? 0.6 : 0.15);
    } else {
      const col = !T.active ? COLORS.inactive : (T.hit ? COLORS.bodyHit : COLORS.active); const sc = T.r / 0.14;
      draw(meshDot, modelTRS(T.x, T.y, T.z, sc, sc, sc), col, 0, T.active ? (T.hit ? 0.9 : 0.5) : 0.0);
    }
  }
  for (const b of game.bots) {
    if (!b.alive) { if (b.dead < 0.6) draw(meshBody, modelTRS(b.x, 0.3, b.z, 1, 0.35, 1, 1.4), COLORS.dead, 0, 0); continue; }
    const hh = BOT.hh * (1 - b.crouch * 0.45); const s2 = b.segs; const col = b.flash > 0 ? COLORS.bodyHit : COLORS.body;
    draw(meshBody, modelTRS(b.x, b.bodyY, b.z, 1, hh / BOT.hh, 1, b.lean), col, 0, b.flash > 0 ? 0.6 : 0.05);
    draw(meshHead, modelTRS(s2.head[0], s2.head[1], s2.head[2]), b.flash > 0 ? COLORS.bodyHit : COLORS.head, 0, 0.15);
  }
  for (const im of game.impacts) { const r = 0.06 + (0.08 - im.t) * 0.8; draw(meshUnit, modelTRS(im.p[0], im.p[1], im.p[2], r, r, r), im.c, 0, 1.0); }
  // weapon viewmodel (camera space; hidden in ADS — the scope overlay takes over)
  if (game.combat && !game.ads) {
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.uniformMatrix4fv(U.uView, false, IDENT); gl.uniform3fv(U.uCam, [0, 0, 0]); gl.uniform1f(U.uFog, 0);
    gl.uniformMatrix4fv(U.uProj, false, perspective(55, aspect, 0.02, 10));
    const k = game.recoilVis;
    const gx = 0.2, gy = -0.17, gz = -0.5 + k * 0.05 + (game.reloading > 0 ? Math.sin(game.reloading * 6) * 0.05 : 0);
    const bob = game.moving ? Math.sin(game.t * (game.sprint ? 16 : 11)) * 0.006 : 0;
    draw(meshBox, modelTRS(gx, gy + bob - k * 0.01, gz, 0.034, 0.055, 0.26), COLORS.gun, 0, 0);                // receiver
    draw(meshBox, modelTRS(gx, gy + bob + 0.015, gz - 0.24, 0.016, 0.016, 0.24), COLORS.gun2, 0, 0);            // barrel
    draw(meshBox, modelTRS(gx, gy + bob - 0.055, gz + 0.02, 0.028, 0.1, 0.04), COLORS.gun2, 0, 0);              // magazine
    draw(meshBox, modelTRS(gx, gy + bob + 0.042, gz - 0.02, 0.02, 0.024, 0.06), COLORS.gun2, 0, 0);             // sight
    if (game.muzzle > 0) draw(meshUnit, modelTRS(gx, gy + bob + 0.015, gz - 0.38, 0.035, 0.035, 0.05), COLORS.flash, 0, 1.5);
  }
}

// ---------------------------------------------------------------- boot
loadSettings(); selectedMode = MODES.some(m => m.id === settings.mode) ? settings.mode : 'cqb';
buildMap(); buildModeList(); updateSensInfo(); showBest();
for (const id of [...SIMPLE_IDS, 'scope', 'adsmode', 'crouchmode', 'leanmode', 'bots', 'invert', ...Object.values(ADS_IDS)]) $(id).addEventListener('input', readSettings);
for (const id of ['difficulty', 'duration']) $(id).addEventListener('change', () => { readSettings(); showBest(); });
$('start').addEventListener('click', async () => { startRun(); await requestLock(); });
$('again').addEventListener('click', async () => { startRun(); await requestLock(); });
$('close-results').addEventListener('click', () => { $('results').classList.add('hidden'); });
canvas.addEventListener('click', async () => { if (game.running && !locked) await requestLock(); });
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.id !== b.dataset.tab)); }));
game.aimFov = settings.fov;
requestAnimationFrame(frame);
