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
// mulberry32 — deterministic RNG for the 1000 spawn patterns per map
function seededRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PATTERN_COUNT = 1000;
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- R6S sensitivity model
// Hipfire: yaw per count (deg) = sens * MSMU * (180/pi) / 200  -> 0.005729°/count per sens unit at MSMU 0.02
// ADS:     yaw = hipfire yaw * (adsSens/100) * (XFactorAiming / 0.02)   (same formula for every zoom level)
// FOV:     R6S FOV setting is VERTICAL. ADS: tan(vfov_ads/2) = tan(vfov/2) / zoom
// Source: Ubisoft "FOV and Input Sensitivity" dev article —
//   ADS FOV  = FOV x optic modifier   (Holo / Red Dot / Reflex / Iron = 0.9, ACOG = 0.35, OTs-03 flip = 0.3)
//   ADS sens = Hipfire x min(max((ADS slider x XFactorAiming) x optic modifier, 0), 1)   (1x = 0.6, ACOG = 0.35)
// 1.5x / 2.0x / 3.0x / 12x were added later without published modifiers; they are interpolated on the
// same curve through the two published points (1x and 2.5x).
const OPTIC = {
  fovMod(zoom) { return zoom === 1 ? 0.9 : zoom === 2.5 ? 0.35 : 0.9 * Math.pow(0.35 / 0.9, Math.log(zoom) / Math.log(2.5)); },
  sensMod(zoom) { return zoom === 1 ? 0.6 : zoom === 2.5 ? 0.35 : 0.6 * Math.pow(0.35 / 0.6, Math.log(zoom) / Math.log(2.5)); },
  adsTime(zoom) { return zoom === 1 ? 0.32 : zoom <= 2 ? 0.38 : zoom <= 3 ? 0.45 : 0.55; },   // seconds, approximate in-game ADS transition
};
const R6 = {
  hipYaw(sens, msmu) { return sens * msmu * (180 / Math.PI) / 200; },
  adsYaw(hipYawDeg, adsSens, xfactor, zoom) { return hipYawDeg * clamp(adsSens * xfactor * OPTIC.sensMod(zoom), 0, 1); },
  adsFov(vfovDeg, zoom) { return vfovDeg * OPTIC.fovMod(zoom); },
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
  leanOffset: 0.42, leanRoll: 12 * DEG, leanSpeed: 5.5,
  crouchSpeed: 9,
  radius: 0.38,
};
const WEAPON = {
  name: 'AR (generic)', rpm: 800, mag: 30, reload: 2.4, dmgBody: 40, dmgHead: 100,
  hipSpread: 2.2, hipMoveSpread: 1.2, adsSpread: 0.12, adsMoveSpread: 0.35, crouchMul: 0.7,
  range: 120,
  // Siege-style recoil: the view itself climbs and never auto-recovers — you pull down.
  recoil(shot) {
    const v = shot < 3 ? 1.24 : shot < 8 ? 0.96 : 0.72;              // vertical deg per shot (2x previous baseline)
    const phase = shot < 4 ? 0 : shot < 11 ? 1 : shot < 19 ? -1 : 1;  // horizontal drift pattern
    const h = phase * 0.24 + rand(-0.18, 0.18);
    return { v: v * rand(0.9, 1.1), h };
  },
};

// ---------------------------------------------------------------- settings
const settings = {
  dpi: 800, fov: 90, sensH: 10, sensV: 10, msmu: 0.02, xfactor: 0.02,
  ads: { '1': 50, '1.5': 50, '2': 50, '2.5': 50, '3': 50, '12': 50 },
  scope: 2.5, sight: '2.5', reticle: '#ff2b2b', ammomode: 'mag', adsmode: 'hold', crouchmode: 'toggle', leanmode: 'hold', bots: 'auto', map: 'hall', recoil: 1, botsize: 'm', invert: false,
  difficulty: 1, duration: 60, mode: 'cqb',
};
const ADS_IDS = { '1': 'ads1', '1.5': 'ads15', '2': 'ads2', '2.5': 'ads25', '3': 'ads3', '12': 'ads12' };
const SIMPLE_IDS = ['dpi', 'fov', 'sensH', 'sensV', 'msmu', 'xfactor'];

function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem('sal-settings') || '{}')); } catch (e) {}
  settings.ads = Object.assign({ '1': 50, '1.5': 50, '2': 50, '2.5': 50, '3': 50, '12': 50 }, settings.ads || {});
  for (const id of SIMPLE_IDS) $(id).value = settings[id];
  for (const k in ADS_IDS) $(ADS_IDS[k]).value = settings.ads[k];
  $('sight').value = settings.sight || '2.5'; $('reticle').value = settings.reticle || '#ff2b2b'; $('ammomode').value = settings.ammomode || 'mag'; $('adsmode').value = settings.adsmode; $('crouchmode').value = settings.crouchmode || 'toggle'; $('leanmode').value = settings.leanmode || 'hold'; $('bots').value = String(settings.bots ?? 'auto'); $('map').value = MAPS[settings.map] ? settings.map : 'hall'; $('recoil').value = String(settings.recoil ?? 1); $('botsize').value = settings.botsize || 'm';
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
  settings.sight = $('sight').value; settings.scope = SIGHTS[settings.sight].zoom; settings.reticle = $('reticle').value; settings.ammomode = $('ammomode').value; settings.adsmode = $('adsmode').value; settings.crouchmode = $('crouchmode').value; settings.leanmode = $('leanmode').value; settings.bots = $('bots').value; settings.map = $('map').value; settings.recoil = +$('recoil').value; settings.botsize = $('botsize').value; settings.invert = $('invert').checked;
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
    adsYawH: R6.adsYaw(hipYawH, adsSens, settings.xfactor, settings.scope),
    adsYawV: R6.adsYaw(hipYawV, adsSens, settings.xfactor, settings.scope),
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
  $('si-fov').textContent = `${s.hipFov}° → ${s.adsFov.toFixed(1)}° (×${OPTIC.fovMod(settings.scope).toFixed(3)})`;
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
  if (idx.length > 65535 || pos.length / 3 > 65535) return makeMesh32(pos, nrm, idx);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null); return { vao, n: idx.length };
}
function makeMesh32(pos, nrm, idx) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos instanceof Float32Array ? pos : new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, nrm instanceof Float32Array ? nrm : new Float32Array(nrm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx instanceof Uint32Array ? idx : new Uint32Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null); return { vao, n: idx.length, u32: true, bufs: [vb, nb, ib] };
}
// all props of one kind merged into a single static mesh (one draw call per kind)
const BOX_FACES = [[[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]]];
function mergedPropMesh(list) {
  const n = list.length, P = new Float32Array(n * 60), N = new Float32Array(n * 60), I = new Uint32Array(n * 30);
  let v = 0, ii = 0;
  for (const p of list) {
    for (const f of BOX_FACES) {
      const base = v / 3;
      for (let k = 0; k < 4; k++) { const c = f[k]; P[v] = p.x + c[0] * p.w; P[v + 1] = (c[1] + 0.5) * p.h; P[v + 2] = p.z + c[2] * p.d; N[v] = f[4][0]; N[v + 1] = f[4][1]; N[v + 2] = f[4][2]; v += 3; }
      I[ii++] = base; I[ii++] = base + 1; I[ii++] = base + 2; I[ii++] = base; I[ii++] = base + 2; I[ii++] = base + 3;
    }
  }
  return makeMesh32(P, N, I);
}
let STATIC = [];
function rebuildStatic() {
  for (const m of STATIC) for (const b of m.mesh.bufs) gl.deleteBuffer(b);
  STATIC = [];
  const groups = {}; for (const p of PROPS) (groups[p.kind] = groups[p.kind] || []).push(p);
  for (const [kind, list] of Object.entries(groups)) STATIC.push({ kind, mesh: mergedPropMesh(list) });
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
  gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, mesh.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
}

// ---------------------------------------------------------------- maps
// props: axis-aligned boxes {x,z,w,d,h,kind} (y from 0 to h). kind: crate | wall | pillar | furniture
let ROOM = { xmin: -12, xmax: 12, zmin: -52, zmax: 10, h: 5 };
const PROPS = [];
const DOORS = [];   // {x,z,axis:'x'|'z'} doorway centers (for bot door-peek spots)
let MAP = null;
function addProp(x, z, w, d, h, kind = 'crate') { PROPS.push({ x, z, w, d, h, kind, xmin: x - w / 2, xmax: x + w / 2, zmin: z - d / 2, zmax: z + d / 2 }); }
// wall along x (z fixed) from x1..x2, or along z (x fixed) from z1..z2, with door gaps [[a,b],...] in the running coordinate
function wallX(z, x1, x2, doors = [], h = ROOM.h, t = 0.4) {
  for (const [a, b] of cut(x1, x2, doors)) addProp((a + b) / 2, z, b - a, t, h, 'wall');
  for (const [a, b] of doors) DOORS.push({ x: (a + b) / 2, z, axis: 'x' });
}
function wallZ(x, z1, z2, doors = [], h = ROOM.h, t = 0.4) {
  for (const [a, b] of cut(z1, z2, doors)) addProp(x, (a + b) / 2, t, b - a, h, 'wall');
  for (const [a, b] of doors) DOORS.push({ x, z: (a + b) / 2, axis: 'z' });
}
function cut(a, b, doors) { const out = []; let cur = Math.min(a, b); const end = Math.max(a, b); for (const [d0, d1] of [...doors].sort((p, q) => p[0] - q[0])) { if (d0 > cur) out.push([cur, d0]); cur = Math.max(cur, d1); } if (end > cur) out.push([cur, end]); return out.filter(([x, y]) => y - x > 0.05); }
const R = (xmin, xmax, zmin, zmax) => ({ xmin, xmax, zmin, zmax });

const MAPS = {
  hall: {
    name: 'トレーニングホール', room: { xmin: -12, xmax: 12, zmin: -52, zmax: 10, h: 5 },
    spawn: { x: 0, z: 5.5, yaw: 0 },
    zones: { near: [R(-12, 12, -12, -2)], mid: [R(-12, 12, -28, -14)], far: [R(-12, 12, -50, -32)] },
    build() {
      addProp(-5.5, -0.6, 7.0, 0.4, 2.4, 'wall'); addProp(4.5, -0.6, 7.0, 0.4, 2.4, 'wall');
      DOORS.push({ x: -0.5, z: -0.6, axis: 'x' });
      addProp(-3.0, 2.4, 1.6, 1.6, 1.2); addProp(3.2, 2.0, 1.6, 1.6, 1.2); addProp(-8.5, 4.5, 1.2, 1.2, 2.0, 'pillar'); addProp(8.5, 4.0, 1.2, 1.2, 2.0, 'pillar'); addProp(0, 7.5, 1.2, 1.2, 0.9);
      addProp(-6, -5, 1.6, 1.6, 1.2); addProp(6, -6, 1.6, 1.6, 1.2); addProp(0, -9, 3.0, 1.0, 2.2, 'wall'); addProp(-9, -10, 1.2, 1.2, 1.2); addProp(9, -11, 1.2, 1.2, 2.0, 'pillar'); addProp(-2.5, -3, 1.2, 1.2, 0.9);
      addProp(-7, -17, 2.0, 1.0, 2.2, 'wall'); addProp(7, -19, 2.0, 1.0, 2.2, 'wall'); addProp(0, -22, 1.6, 1.6, 1.2); addProp(-3.5, -26, 1.6, 1.6, 1.2); addProp(4, -25, 1.2, 1.2, 2.0, 'pillar'); addProp(-10, -22, 1.6, 1.6, 1.2); addProp(10, -27, 1.6, 1.6, 1.2);
      addProp(-5, -35, 2.4, 1.0, 2.2, 'wall'); addProp(6, -38, 1.6, 1.6, 1.2); addProp(0, -42, 1.6, 1.6, 1.2); addProp(-8, -45, 1.2, 1.2, 2.0, 'pillar'); addProp(8, -47, 2.4, 1.0, 2.2, 'wall'); addProp(-2, -49, 1.6, 1.6, 1.2);
    },
  },
  // ---- Clubhouse basement (schematic): Garage / Church / Arsenal / Gym / Basement Hallway / Red & Blue Stairs ----
  clubhouse: {
    name: 'クラブハウス 地下', room: { xmin: -18, xmax: 18, zmin: -22, zmax: 6, h: 3.2 },
    spawn: { x: 5, z: 4.2, yaw: 0 },   // basement entrance (south), looking north into Arsenal
    zones: { near: [R(0, 10, -8, 6)], mid: [R(-10, 10, -12, 4)], far: [R(-18, -4, -22, -8), R(10, 18, -22, 2)] },
    build() {
      wallX(-8, -18, 0, [[-7.6, -6.4]]);                     // Garage south wall (door -> Church)
      wallZ(-4, -22, -8, [[-11.4, -10.2]]);                  // Garage east wall (door -> Hallway)
      wallZ(0, -22, -12);                                    // Red stairs east wall
      wallX(-12, -4, 0, [[-2.6, -1.4]]);                     // Red stairs -> Hallway
      wallX(-8, 0, 10, [[-2.6, -1.4], [4.4, 5.6]]);          // Hallway south wall (doors -> Church, Arsenal)
      wallX(-12, 0, 10);                                     // Hallway north wall
      wallZ(0, -8, 4, [[-3.6, -2.4]]);                       // Church | Arsenal (door)
      wallX(0, 0, 10, [[4.4, 5.6]]);                         // Arsenal south wall (door -> Entrance)
      wallZ(10, -22, 2, [[-10.6, -9.4], [-4.6, -3.4]]);      // Gym west wall (doors -> Hallway, Arsenal)
      wallX(-14, 10, 18, [[13.4, 14.6]]);                    // Gym | Blue stairs
      wallX(4, -10, 0); wallZ(-10, -8, 4);                   // Church south / west walls
      wallX(2, 10, 18);                                      // Gym south wall
      wallX(6, 0, 10); wallZ(0, 0, 6); wallZ(10, 0, 6);      // Entrance room
      // Garage: two cars, workbench, tool chest
      addProp(-13, -13.5, 2.0, 4.6, 1.5, 'furniture'); addProp(-8.5, -17.5, 2.0, 4.6, 1.5, 'furniture');
      addProp(-16.5, -20, 2.4, 0.8, 1.0); addProp(-6, -11, 1.2, 0.8, 1.0); addProp(-16, -9.5, 1.6, 1.2, 1.2);
      addProp(-2, -19, 3.4, 5.0, 1.6, 'furniture');          // Red stairs block
      for (let i = 0; i < 4; i++) { addProp(-7.3, -5.5 + i * 2.2, 3.6, 0.5, 0.95, 'furniture'); addProp(-2.7, -5.5 + i * 2.2, 3.6, 0.5, 0.95, 'furniture'); } // pews
      addProp(-5, 3.0, 4.0, 1.2, 0.9, 'furniture'); addProp(-9.2, -6.8, 1.0, 1.0, 1.2);   // altar, crate
      addProp(9.3, -5.5, 0.8, 2.6, 2.0, 'furniture'); addProp(9.3, -1.5, 0.8, 2.0, 2.0, 'furniture'); // gun racks
      addProp(3, -4, 1.6, 1.6, 1.2); addProp(6.5, -2, 1.2, 1.2, 0.9); addProp(2, -1, 2.0, 0.9, 0.9, 'furniture');
      addProp(7.5, -11.5, 2.4, 0.6, 2.0, 'furniture'); addProp(1.5, -11.3, 1.2, 1.0, 1.2);  // hallway lockers
      addProp(13, -9, 0.7, 2.0, 0.6, 'furniture'); addProp(16, -9, 0.7, 2.0, 0.6, 'furniture'); addProp(17.2, -4, 0.8, 3.0, 1.6, 'furniture'); // gym
      addProp(12.5, -3, 0.6, 0.6, 2.4, 'pillar'); addProp(14.5, 0, 2.4, 1.6, 0.5, 'furniture'); addProp(11.5, -12.5, 1.2, 1.2, 1.2);
      addProp(16, -19, 3.4, 5.0, 1.6, 'furniture');          // Blue stairs block
      addProp(2, 3.5, 1.4, 1.4, 1.2); addProp(8.3, 2.5, 1.2, 1.2, 0.9);  // entrance crates
    },
  },
  // ---- Oregon 1F: traced from the r6maps.com floor plan (walls exact, furniture auto-detected, heights estimated) ----
  // ---- Oregon: real geometry exported from the game files, voxelized to boxes (maps/obj2map.py) ----
  oregonb:  { name: 'オレゴン 地下', data: 'maps/oregon-b.json', zones: 'dist' },
  oregon1f: { name: 'オレゴン 1F', data: 'maps/oregon-1f.json', zones: 'dist' },
  oregon2f: { name: 'オレゴン 2F', data: 'maps/oregon-2f.json', zones: 'dist' },
  // ---- Oregon basement (schematic): Laundry / Supply / Blue Bunker / Freezer / Electric / Basement Corridor / Tower stairs ----
  oregon: {
    name: 'オレゴン 地下', room: { xmin: -16, xmax: 16, zmin: -20, zmax: 6, h: 3.2 },
    spawn: { x: 14.8, z: 4.6, yaw: -0.45 },
    zones: { near: [R(0, 16, -8, 6)], mid: [R(-8, 8, -14, 0)], far: [R(-16, -4, -20, -2), R(-6, 10, -20, -12)] },
    build() {
      wallZ(0, -8, 6, [[-1.6, -0.4], [3.4, 4.6]]);                        // Supply | Laundry
      wallX(-8, -16, 16, [[-5.6, -4.4], [3.4, 4.6], [10.4, 11.6]]);       // corridor south wall
      wallX(-12, -16, 16, [[-13.6, -12.4], [-3.6, -2.4], [6.4, 7.6]]);    // corridor north wall
      wallZ(-8, -8, 6, [[-4.6, -3.4]]);                                   // Supply | Blue bunker
      wallZ(8, -8, 6, [[0.4, 1.6]]);                                      // Laundry | Tower stairs
      wallZ(-6, -20, -12); wallZ(4, -20, -12, [[-17.6, -16.4]]);          // Freezer walls
      wallX(-16, -6, 4, [[-1.6, -0.4]]);                                  // Freezer entry
      addProp(-12.5, 2, 3.0, 0.8, 2.0, 'furniture'); addProp(-10, -4, 1.6, 1.6, 1.2); addProp(-14, -5.5, 1.4, 1.4, 1.0);   // blue bunker
      addProp(-4, 3, 4.0, 0.8, 2.0, 'furniture'); addProp(-2, -3, 1.6, 1.6, 1.2); addProp(-6, -5, 1.2, 1.2, 0.9); addProp(-5.5, 0.5, 1.0, 1.0, 1.0, 'pillar'); // supply
      addProp(1.2, 4.6, 0.8, 2.4, 1.0, 'furniture'); addProp(4, 2, 2.4, 1.0, 0.9, 'furniture'); addProp(6, -4, 1.4, 1.4, 1.2); addProp(2.5, -5.5, 1.2, 1.2, 0.9); // laundry
      addProp(12.5, 1, 3.0, 4.0, 1.6, 'furniture'); addProp(14, -5, 1.2, 1.2, 1.2);          // tower stairs
      addProp(-10, -10, 1.2, 1.0, 1.2); addProp(9, -10.3, 2.0, 0.6, 2.0, 'furniture');      // corridor
      addProp(-1, -15, 1.6, 1.6, 1.2); addProp(2.5, -18, 2.4, 0.8, 1.6, 'furniture'); addProp(-11, -16, 1.6, 1.0, 1.4, 'furniture'); addProp(8, -16, 1.6, 1.6, 1.2); addProp(13, -17, 1.2, 1.2, 1.0); // freezer / electric
    },
  },
  // ---- Bank basement (schematic): Lockers / CCTV / Server / Gold Vault / Main stairs / Garage ramp ----
  bank: {
    name: 'バンク 地下', room: { xmin: -16, xmax: 16, zmin: -20, zmax: 6, h: 3.2 },
    spawn: { x: -11, z: 4, yaw: -0.4 },
    zones: { near: [R(-16, -2, -8, 6)], mid: [R(-6, 10, -12, 2)], far: [R(2, 16, -20, -6), R(-16, 0, -20, -10)] },
    build() {
      wallX(-8, -16, 16, [[-13.6, -12.4], [-3.6, -2.4], [6.4, 7.6]]);     // main corridor south wall
      wallX(-12, -16, 16, [[-9.6, -8.4], [1.4, 2.6], [11.4, 12.6]]);      // main corridor north wall
      wallZ(-2, -8, 6, [[1.4, 2.6]]);                                     // Garage ramp | Lockers
      wallZ(10, -8, 6, [[-5.6, -4.4]]);                                   // Lockers | CCTV
      wallZ(2, -20, -12, [[-17.6, -16.4]]);                               // Server | Vault
      wallZ(-8, -20, -12);                                                // Main stairs | Server
      addProp(-9, -4, 3.0, 5.0, 1.4, 'furniture'); addProp(-14, -5, 0.8, 0.8, 3.2, 'pillar'); addProp(-4, 3, 1.4, 1.4, 1.2);   // garage ramp
      addProp(0, -4, 0.6, 3.0, 2.0, 'furniture'); addProp(4, -4, 0.6, 3.0, 2.0, 'furniture'); addProp(8, -1, 0.6, 3.0, 2.0, 'furniture'); addProp(2, 2.5, 2.0, 0.5, 0.5, 'furniture'); addProp(6, -6.5, 1.2, 1.2, 1.0); // lockers
      addProp(13, 0, 2.0, 1.0, 0.9, 'furniture'); addProp(15.3, -4, 0.8, 2.4, 2.0, 'furniture'); addProp(12, -5.5, 1.2, 1.2, 1.2);   // CCTV
      addProp(-6, -10, 0.8, 0.8, 3.2, 'pillar'); addProp(6, -10, 0.8, 0.8, 3.2, 'pillar'); addProp(0, -10.5, 1.2, 1.0, 1.2);     // corridor
      addProp(-3.5, -15, 0.8, 3.0, 2.0, 'furniture'); addProp(-0.5, -15, 0.8, 3.0, 2.0, 'furniture'); addProp(-5.5, -18.5, 1.6, 1.0, 1.2); // server racks
      addProp(9, -14, 1.6, 1.6, 1.2); addProp(13, -16.5, 1.8, 1.2, 1.0, 'furniture'); addProp(5, -17.5, 1.4, 1.4, 1.0); addProp(14.5, -13, 0.8, 0.8, 3.2, 'pillar'); // vault
      addProp(-12, -17, 3.4, 4.0, 1.6, 'furniture'); addProp(-14.5, -13, 1.2, 1.2, 1.0);   // main stairs
    },
  },
};
const MAP_DATA = {};
async function loadMapData(only) {
  for (const [k, m] of Object.entries(MAPS)) if (m.data && !MAP_DATA[k] && (!only || k === only)) { try { MAP_DATA[k] = await (await fetch(m.data)).json(); } catch (e) { console.warn('map load failed', k, e); } }
}
function buildMap(key) {
  MAP = MAPS[key] || MAPS.hall; PROPS.length = 0; DOORS.length = 0;
  if (MAP.data) {
    const d = MAP_DATA[key]; if (!d) { MAP = MAPS.hall; }
    else {
      ROOM = { xmin: d.bounds[0], xmax: d.bounds[1], zmin: d.bounds[2], zmax: d.bounds[3], h: 3.2 };
      for (const [x, z, w, dd, h] of d.walls) addProp(x, z, w, dd, h, 'wall');
      for (const [x, z, w, dd, h] of d.furn) addProp(x, z, w, dd, h, 'furniture');
      buildGrid(); detectDoors();
      // spawn: nearest free spot to the requested point (spiral search)
      let sx = d.spawn[0], sz = d.spawn[1];
      if (!posFree(sx, sz, MOVE.radius + 0.05)) { outer: for (let r = 0.3; r < 6; r += 0.3) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) { const tx = d.spawn[0] + Math.cos(a) * r, tz = d.spawn[1] + Math.sin(a) * r; if (posFree(tx, tz, MOVE.radius + 0.05)) { sx = tx; sz = tz; break outer; } } }
      MAP.spawn = { x: sx, z: sz, yaw: d.spawnYaw || 0 };
      rebuildStatic(); return;
    }
  }
  ROOM = { ...MAP.room };
  MAP.build(); buildGrid(); rebuildStatic();
}
// doorways = 0.8–1.7 m gaps between collinear wall pieces
function detectDoors() {
  const walls = PROPS.filter(p => p.kind === 'wall');
  // x-running walls: sort by z then x; consecutive pieces on the same line with a 0.8–1.7 m gap = doorway
  const hx = walls.filter(w => w.d < 0.9 && w.w > w.d).sort((a, b) => a.z - b.z || a.xmin - b.xmin);
  const hz = walls.filter(w => w.w < 0.9 && w.d > w.w).sort((a, b) => a.x - b.x || a.zmin - b.zmin);
  const scan = (arr, key, lo, hi, axis) => {
    for (let k = 0; k < arr.length; k++) {
      const a = arr[k]; let next = null;
      for (let m = k + 1; m < arr.length && Math.abs(arr[m][key] - a[key]) < 0.45; m++) { const b = arr[m]; if (b[lo] > a[hi] - 0.01 && (!next || b[lo] < next[lo])) next = b; }
      if (!next) continue;
      const gap = next[lo] - a[hi];
      if (gap >= 0.8 && gap <= 1.7) DOORS.push(axis === 'x' ? { x: (a[hi] + next[lo]) / 2, z: a.z, axis } : { x: a.x, z: (a[hi] + next[lo]) / 2, axis });
    }
  };
  scan(hx, 'z', 'xmin', 'xmax', 'x'); scan(hz, 'x', 'zmin', 'zmax', 'z');
}
function inZone(x, z, zone) {
  if (MAP.zones === 'dist') { const d = Math.hypot(x - MAP.spawn.x, z - MAP.spawn.z); return zone === 'near' ? d < 10 : zone === 'mid' ? d >= 8 && d < 18 : d >= 16; }
  return (MAP.zones[zone] || []).some(r => x >= r.xmin && x <= r.xmax && z >= r.zmin && z <= r.zmax);
}
// uniform 2 m grid over PROPS so collision / rays / cover queries stay O(local) on maps with thousands of props
const GRID = { cs: 2, x0: 0, z0: 0, nx: 1, nz: 1, cells: [], stamp: 0 };
function buildGrid() {
  GRID.x0 = ROOM.xmin; GRID.z0 = ROOM.zmin; GRID.nx = Math.max(1, Math.ceil((ROOM.xmax - ROOM.xmin) / GRID.cs)); GRID.nz = Math.max(1, Math.ceil((ROOM.zmax - ROOM.zmin) / GRID.cs));
  GRID.cells = Array.from({ length: GRID.nx * GRID.nz }, () => []);
  for (const p of PROPS) {
    p._s = 0;
    const i0 = clamp(Math.floor((p.xmin - GRID.x0) / GRID.cs), 0, GRID.nx - 1), i1 = clamp(Math.floor((p.xmax - GRID.x0) / GRID.cs), 0, GRID.nx - 1);
    const j0 = clamp(Math.floor((p.zmin - GRID.z0) / GRID.cs), 0, GRID.nz - 1), j1 = clamp(Math.floor((p.zmax - GRID.z0) / GRID.cs), 0, GRID.nz - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) GRID.cells[j * GRID.nx + i].push(p);
  }
  COVER_CACHE.clear();
}
function propsIn(xmin, xmax, zmin, zmax, out = []) {
  const st = ++GRID.stamp; out.length = 0;
  const i0 = clamp(Math.floor((xmin - GRID.x0) / GRID.cs), 0, GRID.nx - 1), i1 = clamp(Math.floor((xmax - GRID.x0) / GRID.cs), 0, GRID.nx - 1);
  const j0 = clamp(Math.floor((zmin - GRID.z0) / GRID.cs), 0, GRID.nz - 1), j1 = clamp(Math.floor((zmax - GRID.z0) / GRID.cs), 0, GRID.nz - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const p of GRID.cells[j * GRID.nx + i]) if (p._s !== st) { p._s = st; out.push(p); }
  return out;
}
const COVER_CACHE = new Map();
function posFree(x, z, r) { const [cx, cz] = collide(x, z, r); return Math.hypot(cx - x, cz - z) < 0.02; }
// cover spots: hide behind props (away from player spawn) + door-frame peeks
function coverSpots(zone) {
  if (COVER_CACHE.has(zone)) return COVER_CACHE.get(zone);
  const spots = []; const sp = MAP.spawn; const off = 0.6; COVER_CACHE.set(zone, spots);
  for (const p of PROPS) {
    if (p.kind === 'wall' || !inZone(p.x, p.z, zone) || Math.hypot(p.x - sp.x, p.z - sp.z) < 4) continue;   // never right on top of the player
    const dx = p.x - sp.x, dz = p.z - sp.z;
    let hide, peeks;
    if (Math.abs(dz) >= Math.abs(dx)) { const s2 = Math.sign(dz) || -1; const hz = p.z + s2 * (p.d / 2 + off); hide = [p.x, hz]; peeks = [[p.xmin - off, hz], [p.xmax + off, hz]]; }
    else { const s2 = Math.sign(dx) || 1; const hx = p.x + s2 * (p.w / 2 + off); hide = [hx, p.z]; peeks = [[hx, p.zmin - off], [hx, p.zmax + off]]; }
    if (!posFree(hide[0], hide[1], BOT.r)) continue;
    peeks = peeks.filter(q => posFree(q[0], q[1], BOT.r)); if (!peeks.length) continue;
    spots.push({ hide, peeks, low: p.h < 1.6, prop: p });
  }
  for (const d of DOORS) {
    if (!inZone(d.x, d.z, zone) || Math.hypot(d.x - sp.x, d.z - sp.z) < 4) continue;
    const away = d.axis === 'x' ? [0, Math.sign(d.z - sp.z) || -1] : [Math.sign(d.x - sp.x) || 1, 0];
    const lat = d.axis === 'x' ? [1, 0] : [0, 1];
    for (const sgn of [1, -1]) {
      const hide = [d.x + away[0] * 1.0 + lat[0] * sgn * 1.3, d.z + away[1] * 1.0 + lat[1] * sgn * 1.3];
      const peek = [d.x + away[0] * 0.9 + lat[0] * sgn * 0.25, d.z + away[1] * 0.9 + lat[1] * sgn * 0.25];
      if (posFree(hide[0], hide[1], BOT.r) && posFree(peek[0], peek[1], BOT.r)) spots.push({ hide, peeks: [peek], low: false, prop: d });
    }
  }
  return spots;
}
const _q1 = [], _q2 = [], _q3 = [];
// 2D segment vs props (inflated by r): true if blocked
function segBlocked(ax, az, bx, bz, r = BOT.r) {
  const dx = bx - ax, dz = bz - az;
  for (const p of propsIn(Math.min(ax, bx) - r, Math.max(ax, bx) + r, Math.min(az, bz) - r, Math.max(az, bz) + r, _q1)) {
    let t0 = 0, t1 = 1, ok = true;
    for (const [o, d, mn, mx] of [[ax, dx, p.xmin - r, p.xmax + r], [az, dz, p.zmin - r, p.zmax + r]]) {
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
      let ta = (mn - o) / d, tb = (mx - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}
// movement collision: circle (x,z,r) vs props & room; returns corrected position
function collide(x, z, r) {
  x = clamp(x, ROOM.xmin + r, ROOM.xmax - r); z = clamp(z, ROOM.zmin + r, ROOM.zmax - r);
  for (const p of propsIn(x - r - 0.05, x + r + 0.05, z - r - 0.05, z + r + 0.05, _q2)) {
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
// ray vs props: walk the 2 m grid along the ray (2D DDA) and stop at the first cell that yields a hit
function rayProps(o, d, maxT = 150) {
  const cs = GRID.cs; let i = Math.floor((o[0] - GRID.x0) / cs), j = Math.floor((o[2] - GRID.z0) / cs);
  const sx = Math.sign(d[0]), sz = Math.sign(d[2]);
  const tdx = sx ? cs / Math.abs(d[0]) : Infinity, tdz = sz ? cs / Math.abs(d[2]) : Infinity;
  let tx = sx ? ((sx > 0 ? (i + 1) * cs : i * cs) + GRID.x0 - o[0]) / d[0] : Infinity;
  let tz = sz ? ((sz > 0 ? (j + 1) * cs : j * cs) + GRID.z0 - o[2]) / d[2] : Infinity;
  let best = Infinity, tcell = 0; const st = ++GRID.stamp;
  while (tcell < maxT) {
    if (i >= 0 && j >= 0 && i < GRID.nx && j < GRID.nz) for (const p of GRID.cells[j * GRID.nx + i]) { if (p._s === st) continue; p._s = st; const t = rayBox(o, d, p); if (t < best) best = t; }
    const tnext = Math.min(tx, tz); if (best <= tnext) break;
    if (tx < tz) { i += sx; tcell = tx; tx += tdx; } else { j += sz; tcell = tz; tz += tdz; }
    if ((i < -1 && sx <= 0) || (j < -1 && sz <= 0) || (i > GRID.nx && sx >= 0) || (j > GRID.nz && sz >= 0)) break;
  }
  return best;
}
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
  aimFov: 90, adsBlend: 0, combat: false,
  // player
  px: 0, pz: 5.5, eyeY: MOVE.eyeStand, crouch: 0, crouchHeld: false, lean: 0, leanTarget: 0, leanToggle: 0, sprint: false, moving: false, speedNow: 0,
  // weapon
  ammo: WEAPON.mag, reloading: 0, fireCd: 0, shotIdx: 0, recoilVis: 0, muzzle: 0, hitMarker: 0, impacts: [],
  visionTimer: 1.5,
};
const COLORS = {
  body: [0.82, 0.84, 0.86], bodyHit: [1.0, 0.72, 0.25], head: [0.95, 0.35, 0.25], dead: [0.35, 0.15, 0.12],
  active: [1.0, 0.62, 0.1], inactive: [0.42, 0.48, 0.56], wall: [0.42, 0.44, 0.48],
  crate: [0.55, 0.42, 0.25], propwall: [0.5, 0.52, 0.56], furniture: [0.36, 0.40, 0.46], pillar: [0.46, 0.48, 0.52],
  gun: [0.16, 0.17, 0.19], gun2: [0.24, 0.25, 0.28], flash: [1.0, 0.85, 0.5], spark: [1.0, 0.7, 0.3],
};

// ---------------------------------------------------------------- tracking targets (laser modes)
// Operator body geometry. Head centre = eye height (1.60 m standing / 1.05 m crouched) so your crosshair at
// headline is exactly on the enemy head, as in Siege. Offsets are [dx, y] with lean rotating about the body centre.
const BOT_SIZES = { s: 0.75, m: 1.0, l: 1.3 };
function opGeom(crouch, lean) {
  const k = BOT_SIZES[settings.botsize] || 1;
  const headY = MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * crouch;   // fixed regardless of size
  const r = 0.27 * k, headR = 0.15 * k, bottom = 0.2, top = headY - headR - 0.02;
  const hh = Math.max(0.02, (top - bottom) / 2 - r), cy = (top + bottom) / 2;
  const sn = Math.sin(-lean), cs = Math.cos(lean);
  return { r, headR, hh, cy, a: [-sn * hh, cy - hh * cs], b: [sn * hh, cy + hh * cs], head: [sn * (headY - cy), cy + (headY - cy) * cs] };
}
class Target {
  constructor(opts) { Object.assign(this, { x: 0, y: 1.0, z: -6, vx: 0, vy: 0, vz: 0, r: 0.28, hh: 0.55, lean: 0, crouch: 0, active: true, kind: 'op', timer: 0 }, opts); }
  rayHit(o, d) {
    if (this.kind !== 'op') { const a = [this.x, this.y - this.hh, this.z], b = [this.x, this.y + this.hh, this.z]; return segRay(o, d, a, b).dist <= this.r; }
    const g = opGeom(this.crouch, this.lean);
    if (raySphere(o, d, [this.x + g.head[0], g.head[1], this.z], g.headR) < Infinity) return true;
    return segRay(o, d, [this.x + g.a[0], g.a[1], this.z], [this.x + g.b[0], g.b[1], this.z]).dist <= g.r;
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
const BOT = { r: 0.27, headR: 0.15, hp: 100, walk: 3.1, sprint: 5.3, crouch: 1.55, respawn: 1.2 };
class Bot {
  constructor(zone, preset) { this.zone = zone; this.spawn(preset); }
  spawn(preset) {
    let spots = coverSpots(this.zone); if (!spots.length) for (const z of ['near', 'mid', 'far']) { spots = coverSpots(z); if (spots.length) { this.zone = z; break; } }
    this.spot = preset ? spots[preset.spotIndex % spots.length] : pick(spots);
    this.x = this.spot.hide[0]; this.z = this.spot.hide[1]; this.hp = BOT.hp; this.dead = 0; this.alive = true;
    this.crouch = this.spot.low ? 1 : 0; this.crouchT = this.crouch; this.lean = 0; this.leanT = 0; this.flash = 0;
    this.state = 'hide'; this.timer = preset ? preset.delay : rand(0.3, 1.0); this.dest = null; this.sprint = false;
  }
  get segs() { // body capsule segment + head centre (world space)
    const g = opGeom(this.crouch, this.lean);
    return { a: [this.x + g.a[0], g.a[1], this.z], b: [this.x + g.b[0], g.b[1], this.z], head: [this.x + g.head[0], g.head[1], this.z], g };
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
            const spots = coverSpots(this.zone).filter(s => s.prop !== this.spot.prop && !segBlocked(this.x, this.z, s.hide[0], s.hide[1]));
            if (spots.length) { this.spot = pick(spots); this.dest = this.spot.hide; this.state = 'move'; this.sprint = Math.random() < 0.55; this.crouchT = 0; this.leanT = 0; }
            else this.timer = rand(0.3, 0.8) / D;
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
    const s = this.segs; const th = raySphere(o, d, s.head, s.g.headR); const body = segRay(o, d, s.a, s.b);
    if (th < Infinity) return { t: th, part: 'head' };
    if (body.dist <= s.g.r) return { t: body.t, part: 'body' };
    return null;
  }
}
// 1000 spawn patterns per map: pattern k is a deterministic layout (cover spot + first-move delay per bot)
// generated from seed hash(map, k); one is picked at random for every run.
function spawnPattern(mapKey, k, n, zones) {
  let h = 2166136261; for (const ch of mapKey + ':' + k) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rng = seededRng(h);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ zone: zones[i % zones.length], spotIndex: Math.floor(rng() * 100000), delay: 0.2 + rng() * 1.6 });
  return out;
}
function spawnBots() {
  game.bots = []; const m = game.mode; const n = settings.bots === 'auto' ? m.bots + (game.diff >= 1.35 ? 1 : 0) : clamp(+settings.bots || 1, 1, 10);
  game.pattern = Math.floor(Math.random() * PATTERN_COUNT);
  const pat = spawnPattern(settings.map, game.pattern, n, m.zones);
  for (let i = 0; i < n; i++) game.bots.push(new Bot(pat[i].zone, pat[i]));
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
  game.eyeY = MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * game.crouch;
  // movement (R6S: no acceleration, sprint only forward, ADS slows, crouch slows)
  let fx = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), sx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (keys.ShiftLeft && fx > 0 && game.crouchHeld) game.crouchHeld = false;   // Siege: sprint from crouch stands you up
  game.sprint = !!keys.ShiftLeft && fx > 0 && !game.ads && game.crouch < 0.5;
  game.moving = fx !== 0 || sx !== 0;
  game.leanTarget = settings.leanmode === 'toggle' ? game.leanToggle : (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if (game.sprint) { game.leanTarget = 0; game.leanToggle = 0; }   // Siege: sprinting cancels lean
  game.lean += (game.leanTarget - game.lean) * Math.min(1, dt * MOVE.leanSpeed);
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
function startReload() { if (settings.ammomode === 'infinite' || game.reloading > 0 || game.ammo === WEAPON.mag) return; game.reloading = WEAPON.reload; }
function spreadDeg() {
  let s = game.ads ? WEAPON.adsSpread : WEAPON.hipSpread;
  if (game.moving) s += (game.ads ? WEAPON.adsMoveSpread : WEAPON.hipMoveSpread) * (game.sprint ? 2 : 1);
  if (game.crouch > 0.5) s *= WEAPON.crouchMul;
  return s;
}
function fireShot(eye, view) {
  if (settings.ammomode !== 'infinite') game.ammo--; game.shots++; game.fireCd += 60 / WEAPON.rpm; game.muzzle = 0.05; game.recoilVis = 1;
  const sp = spreadDeg() * DEG; const ang = Math.random() * Math.PI * 2, mag = Math.sqrt(Math.random()) * sp;
  const d = [0, 1, 2].map(i => view.f[i] + view.r[i] * Math.cos(ang) * mag + view.u[i] * Math.sin(ang) * mag);
  const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
  const tProp = rayProps(eye, d);
  let best = null;
  for (const b of game.bots) { if (!b.alive) continue; const h = b.hitTest(eye, d); if (h && h.t < tProp && (!best || h.t < best.t)) best = { ...h, bot: b }; }
  if (best) {
    const dmg = best.part === 'head' ? WEAPON.dmgHead : WEAPON.dmgBody; best.bot.hp -= dmg; best.bot.flash = 0.12; game.hits++; game.damage += dmg; game.hitMarker = 0.12; game.hitHead = best.part === 'head';
    game.score += 10;
    if (best.bot.hp <= 0) { best.bot.alive = false; best.bot.dead = 0; game.kills++; if (best.part === 'head') { game.headshots++; game.score += 150; } else game.score += 100; }
    game.impacts.push({ p: [eye[0] + d[0] * best.t, eye[1] + d[1] * best.t, eye[2] + d[2] * best.t], t: 0.08, c: best.part === 'head' ? [1, 0.2, 0.2] : COLORS.spark });
  } else {
    const t = Math.min(tProp, WEAPON.range); game.impacts.push({ p: [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t], t: 0.06, c: [0.8, 0.8, 0.8] });
  }
  // recoil: moves the actual view (no auto recovery, as in Siege)
  const rc = WEAPON.recoil(Math.floor(game.shotIdx)); game.shotIdx++; game.pitch += rc.v * DEG * settings.recoil; game.yaw += rc.h * DEG * settings.recoil;
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
    ads: false, adsBlend: 0, firing: false, yaw: 0, pitch: 0, visionTimer: 1.5, px: 0, pz: 5.5, crouchHeld: false, crouch: 0, lean: 0, leanToggle: 0, ammo: WEAPON.mag, reloading: 0, fireCd: 0, shotIdx: 0, impacts: [], hitMarker: 0, muzzle: 0 });
  input.dx = input.dy = 0; fps.sum = 0; fps.n = 0;
  buildMap(game.combat ? settings.map : 'hall'); game.targets = []; game.bots = [];
  game.px = MAP.spawn.x; game.pz = MAP.spawn.z; game.yaw = MAP.spawn.yaw;
  if (game.combat) spawnBots(); else spawnTargets();
  game.running = true;
  $('menu').classList.add('hidden'); $('results').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('h-mode').textContent = game.mode.name + (game.combat ? ` · ${MAP.name} · 湧きパターン #${game.pattern + 1}/${PATTERN_COUNT}` : '');
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
// ---------------------------------------------------------------- sights
// Geometry measured from in-game ADS screenshots (r6siegecenter.com sights guide). Units: 1000 = screen height,
// X spans -W/2..W/2 with W = 1000 * aspect. In Siege the world stays visible around the housing — only the 12x fills the screen.
const SIGHTS = {
  holo:    { zoom: 1,   name: '1.0x Holo A（EOTech型）' },
  holob:   { zoom: 1,   name: '1.0x Holo B（Y5S3追加型）' },
  holoru:  { zoom: 1,   name: '1.0x ロシアンホロ' },
  reddot:  { zoom: 1,   name: '1.0x Red Dot A（チューブ型）' },
  reddotb: { zoom: 1,   name: '1.0x Red Dot B（Y5S3追加型）' },
  reflex:  { zoom: 1,   name: '1.0x Reflex A（ドット）' },
  reflexb: { zoom: 1,   name: '1.0x Reflex B（三角）' },
  '1.5':   { zoom: 1.5, name: '1.5x' },
  '2':     { zoom: 2,   name: '2.0x' },
  '2.5':   { zoom: 2.5, name: '2.5x ACOG' },
  '3':     { zoom: 3,   name: '3.0x' },
  '12':    { zoom: 12,  name: '12.0x（CSRX 300）' },
};
const HOUSING = '#141416', HOUSING2 = '#26272b', EDGE = '#000';
const glow = 'filter="url(#glow)"';
// window shapes (used both as glass area and as the hole in the housing)
function winShape(key) {
  switch (key) {
    case 'holo':    return `<rect x="-130" y="-120" width="260" height="240" rx="26"/>`;        // 26% x 24% of screen height, rounded
    case 'holob':   return `<path d="M-115 -115 L115 -115 L130 -60 L130 110 L-130 110 L-130 -60 Z"/>`; // trapezoid-top window
    case 'holoru':  return `<rect x="-118" y="-118" width="236" height="236" rx="18"/>`;
    case 'reddot':  return `<circle r="225"/>`;                                                   // inner glass ~45% of height
    case 'reddotb': return `<circle r="150"/>`;
    case 'reflex':  return `<path d="M-95 100 L-95 -40 Q-95 -115 0 -115 Q95 -115 95 -40 L95 100 Z"/>`; // arched window
    case 'reflexb': return `<path d="M-90 100 L-90 -50 Q-90 -110 0 -110 Q90 -110 90 -50 L90 100 Z"/>`;
    case '1.5':     return `<circle r="310"/>`;
    case '2':       return `<circle r="290"/>`;
    case '2.5':     return `<circle r="280"/>`;
    case '3':       return `<ellipse rx="440" ry="430"/>`;
    case '12':      return `<ellipse rx="700" ry="440"/>`;
  }
}
// opaque housing drawn around the window (the window itself is cut out with a mask)
function housingShape(key, W) {
  const H2 = 500, body = (w, yTop) => `<rect x="${-w / 2}" y="${yTop}" width="${w}" height="${H2 - yTop + 10}" fill="${HOUSING}"/>`;
  switch (key) {
    case 'holo':    // EOTech hood: frame + tall body down to the bottom of the screen
      return `<rect x="-172" y="-158" width="344" height="${H2 + 158}" rx="40" fill="${HOUSING}"/>${body(300, 150)}<rect x="-150" y="-140" width="300" height="280" rx="36" fill="none" stroke="${HOUSING2}" stroke-width="6"/>`;
    case 'holob':
      return `<path d="M-150 -150 L150 -150 L175 -70 L185 ${H2 + 10} L-185 ${H2 + 10} L-175 -70 Z" fill="${HOUSING}"/>${body(260, 170)}`;
    case 'holoru':
      return `<rect x="-160" y="-160" width="320" height="${H2 + 160}" rx="30" fill="${HOUSING}"/>${body(240, 160)}`;
    case 'reddot':  // thick tube (outer r 0.46W/2 ≈ 400 at 16:9) + mount
      return `<circle r="400" fill="${HOUSING}"/><circle r="300" fill="none" stroke="${HOUSING2}" stroke-width="10"/>${body(280, 300)}`;
    case 'reddotb':
      return `<circle r="235" fill="${HOUSING}"/>${body(200, 150)}`;
    case 'reflex':  // thin frame + base block
      return `<path d="M-120 ${H2 + 10} L-120 -45 Q-120 -140 0 -140 Q120 -140 120 -45 L120 ${H2 + 10} Z" fill="${HOUSING}"/>${body(260, 110)}`;
    case 'reflexb':
      return `<path d="M-112 ${H2 + 10} L-112 -55 Q-112 -135 0 -135 Q112 -135 112 -55 L112 ${H2 + 10} Z" fill="${HOUSING}"/>${body(250, 105)}`;
    case '1.5':
      return `<circle r="345" fill="${HOUSING}"/><circle r="320" fill="none" stroke="${EDGE}" stroke-width="24"/>${body(230, 280)}`;
    case '2':
      return `<circle r="335" fill="${HOUSING}"/><circle r="302" fill="none" stroke="${EDGE}" stroke-width="26"/>${body(230, 280)}`;
    case '2.5':     // ACOG: big rounded housing with bolts, thick black eyepiece ring inside the glass edge
      return `<rect x="-430" y="-400" width="860" height="${H2 + 400}" rx="200" fill="${HOUSING}"/><circle r="330" fill="none" stroke="${EDGE}" stroke-width="100"/>${body(240, 300)}`;
    case '3':
      return `<ellipse rx="490" ry="480" fill="${HOUSING}"/><ellipse rx="455" ry="445" fill="none" stroke="${EDGE}" stroke-width="32"/>${body(260, 400)}`;
    case '12':      // CSRX: tan housing fills the whole screen, dark eyepiece ring
      return `<rect x="${-W / 2}" y="-500" width="${W}" height="1000" fill="#7a6a4e"/><ellipse rx="760" ry="490" fill="#5a4c36"/><ellipse rx="720" ry="460" fill="none" stroke="${EDGE}" stroke-width="44"/>`;
  }
}
function reticleSVG(key, c) {
  const line = (x1, y1, x2, y2, w = 2, col = c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  switch (key) {
    case 'holo':    // circle + dot (≈5% of screen height)
      return `<g ${glow}><circle r="24" fill="none" stroke="${c}" stroke-width="2.4"/><circle r="3.2" fill="${c}"/>${line(-24, 0, -31, 0, 2)}${line(24, 0, 31, 0, 2)}${line(0, 24, 0, 31, 2)}</g>`;
    case 'holob':   // "— · —" horizontal dashes with a centre dot
      return `<g ${glow}>${line(-34, 0, -12, 0, 2.6)}${line(12, 0, 34, 0, 2.6)}<circle r="2.6" fill="${c}"/></g>`;
    case 'holoru':  // dot with four short ticks
      return `<g ${glow}><circle r="3" fill="${c}"/>${line(-16, 0, -7, 0, 2)}${line(7, 0, 16, 0, 2)}${line(0, -16, 0, -7, 2)}${line(0, 7, 0, 16, 2)}</g>`;
    case 'reddot':  return `<circle r="4.2" fill="${c}" ${glow}/>`;
    case 'reddotb': return `<circle r="3.4" fill="${c}" ${glow}/>`;
    case 'reflex':  return `<circle r="3.4" fill="${c}" ${glow}/>`;
    case 'reflexb': return `<path d="M0 -7 L7 6 L-7 6 Z" fill="${c}" ${glow}/>`;
    case '1.5':     // small circle + post with a dot (as in the in-game 1.5x)
      return `<g ${glow}><circle r="21" fill="none" stroke="${c}" stroke-width="2.4"/><circle cx="0" cy="36" r="2.4" fill="${c}"/>${line(0, 44, 0, 92, 3.2, '#1a1a1a')}</g>`;
    case '2':       // fine dark crosshair with a gap, dashed green ring in the centre
      return `${line(-80, 0, -28, 0, 2.2, '#2a2a2a')}${line(28, 0, 80, 0, 2.2, '#2a2a2a')}${line(0, -80, 0, -28, 2.2, '#2a2a2a')}${line(0, 28, 0, 80, 2.2, '#2a2a2a')}<circle r="18" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="9 7" ${glow}/><circle r="1.8" fill="${c}" ${glow}/>`;
    case '2.5':     // ACOG: small red chevron, post with range ticks, ball at the bottom
      return `<g ${glow}><path d="M-14 20 L0 0 L14 20" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="miter"/>${line(0, 26, 0, 120, 2.2)}${line(-8, 50, 8, 50, 2)}${line(-7, 72, 7, 72, 2)}${line(-6, 94, 6, 94, 2)}<circle cy="122" r="4" fill="${c}"/></g>`;
    case '3':       // Mk14-style: grey crosshair with mil ticks, large grey ring, green dot with brackets
      return `<circle r="300" fill="none" stroke="#2b2b2b" stroke-opacity=".55" stroke-width="7"/>${line(-430, 0, -60, 0, 2.4, '#2b2b2b')}${line(60, 0, 430, 0, 2.4, '#2b2b2b')}${line(0, -430, 0, -60, 2.4, '#2b2b2b')}${line(0, 60, 0, 430, 2.4, '#2b2b2b')}${[110, 170, 230].map(d => line(d, -8, d, 8, 2.2, '#2b2b2b') + line(-d, -8, -d, 8, 2.2, '#2b2b2b') + line(-8, d, 8, d, 2.2, '#2b2b2b') + line(-8, -d, 8, -d, 2.2, '#2b2b2b')).join('')}<path d="M-50 -18 Q-62 0 -50 18 M50 -18 Q62 0 50 18" fill="none" stroke="#2b2b2b" stroke-width="2.4"/>${line(-20, -60, 20, -60, 2.2, '#2b2b2b')}${line(-14, 50, 14, 50, 2.2, '#2b2b2b')}<circle r="2.6" fill="${c}" ${glow}/>`;
    case '12':      // CSRX 300: thin red crosshair, mil ticks on the horizontal, open centre, black post below
      return `<g ${glow}>${line(-600, 0, -14, 0, 1.6)}${line(14, 0, 600, 0, 1.6)}${line(0, 14, 0, 230, 1.6)}${[120, 240, 360].map(d => line(d, -14, d, 14, 2) + line(-d, -14, -d, 14, 2)).join('')}</g>${line(-70, 260, 70, 260, 4, '#111')}${line(0, 260, 0, 430, 5, '#111')}`;
  }
  return '';
}
function scopeSVG(key, color) {
  const S = SIGHTS[key] || SIGHTS['2.5']; const aspect = (canvas.clientWidth || 16) / (canvas.clientHeight || 9); const W = 1000 * aspect, H = 1000;
  const win = winShape(key);
  return `<svg viewBox="${-W / 2} ${-H / 2} ${W} ${H}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <mask id="hole"><rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="#fff"/><g fill="#000">${win}</g></mask>
    <radialGradient id="glass"><stop offset="70%" stop-color="#7f93ad" stop-opacity="${S.zoom > 1 ? 0.06 : 0.04}"/><stop offset="100%" stop-color="#000" stop-opacity="${S.zoom > 1 ? 0.45 : 0.18}"/></radialGradient>
  </defs>
  <g mask="url(#hole)">${housingShape(key, W)}</g>
  <g fill="url(#glass)">${win}</g>
  ${reticleSVG(key, color)}
</svg>`;
}
let scopeBuiltFor = '';
function updateScopeUI(adsOn = game.adsBlend >= 0.5) {
  const sc = $('scope-ov'); const ch = $('crosshair'); const S = SIGHTS[settings.sight] || SIGHTS['2.5'];
  if (adsOn) {
    ch.classList.add('ads'); sc.classList.remove('hidden');
    const sig = `${settings.sight}|${settings.reticle}|${canvas.clientWidth}x${canvas.clientHeight}`;
    if (scopeBuiltFor !== sig) { sc.innerHTML = scopeSVG(settings.sight, settings.reticle); scopeBuiltFor = sig; }
    $('h-zoom').textContent = `ADS ${S.name}`;
  } else { sc.classList.add('hidden'); ch.classList.remove('ads'); $('h-zoom').textContent = 'HIPFIRE'; }
}

// ---------------------------------------------------------------- main loop
const fps = { frames: 0, acc: 0, cur: 0, avg: 0, sum: 0, n: 0 };
let lastAds = null, lastHudText = '';
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
}
window.addEventListener('resize', () => { resize(); if (game.ads) updateScopeUI(); });
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
  const adsT = OPTIC.adsTime(settings.scope); game.adsBlend = clamp(game.adsBlend + (game.ads ? dt : -dt) / adsT, 0, 1);
  const adsOn = game.adsBlend >= 0.5;
  const yawPer = adsOn ? s.adsYawH : s.hipYawH, pitchPer = adsOn ? s.adsYawV : s.hipYawV;
  game.yaw += input.dx * yawPer * DEG; game.pitch -= input.dy * pitchPer * DEG * (settings.invert ? -1 : 1);
  game.pitch = clamp(game.pitch, -89 * DEG, 89 * DEG);
  input.dx = input.dy = 0;
  const k = game.adsBlend * game.adsBlend * (3 - 2 * game.adsBlend);   // smoothstep
  game.aimFov = s.hipFov + (s.adsFov - s.hipFov) * k;
  if (lastAds !== adsOn) { lastAds = adsOn; if (game.running) updateScopeUI(adsOn); }

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
    if (game.combat) { $('h-acc').textContent = (game.shots ? game.hits / game.shots * 100 : 0).toFixed(1) + '%'; $('h-kills').textContent = game.kills; $('h-ammo').textContent = game.reloading > 0 ? 'RELOAD' : settings.ammomode === 'infinite' ? '∞' : `${game.ammo} / ∞`; $('h-ammo').classList.toggle('low', settings.ammomode !== 'infinite' && game.ammo <= 8); }
    else { const played = settings.duration - game.timeLeft; $('h-acc').textContent = (played > 0 ? game.onTargetTime / played * 100 : 0).toFixed(1) + '%'; }
    $('crosshair').classList.toggle('hit', game.hitMarker > 0); $('hitmark').classList.toggle('on', game.hitMarker > 0); $('hitmark').classList.toggle('head', game.hitHead);
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
  if (game.combat || !game.running) for (const s of STATIC) draw(s.mesh, IDENT, s.kind === 'crate' ? COLORS.crate : s.kind === 'wall' ? COLORS.propwall : s.kind === 'furniture' ? COLORS.furniture : COLORS.pillar, 1, 0);
  for (const T of game.targets) {
    if (T.kind === 'op') {
      const g = opGeom(T.crouch, T.lean); const col = T.hit ? COLORS.bodyHit : (T.flash ? [1, 0.9, 0.5] : COLORS.body);
      draw(meshBody, modelTRS(T.x, g.cy, T.z, g.r / 0.28, (2 * g.hh + 2 * g.r) / 1.66, g.r / 0.28, T.lean), col, 0, T.hit ? 0.5 : 0.05);
      draw(meshHead, modelTRS(T.x + g.head[0], g.head[1], T.z, g.headR / 0.16, g.headR / 0.16, g.headR / 0.16), T.hit ? COLORS.bodyHit : COLORS.head, 0, T.hit ? 0.6 : 0.15);
    } else {
      const col = !T.active ? COLORS.inactive : (T.hit ? COLORS.bodyHit : COLORS.active); const sc = T.r / 0.14;
      draw(meshDot, modelTRS(T.x, T.y, T.z, sc, sc, sc), col, 0, T.active ? (T.hit ? 0.9 : 0.5) : 0.0);
    }
  }
  for (const b of game.bots) {
    if (!b.alive) { if (b.dead < 0.6) draw(meshBody, modelTRS(b.x, 0.3, b.z, 1, 0.35, 1, 1.4), COLORS.dead, 0, 0); continue; }
    const s2 = b.segs, g = s2.g; const col = b.flash > 0 ? COLORS.bodyHit : COLORS.body;
    draw(meshBody, modelTRS(b.x, g.cy, b.z, g.r / 0.28, (2 * g.hh + 2 * g.r) / 1.66, g.r / 0.28, b.lean), col, 0, b.flash > 0 ? 0.6 : 0.05);
    draw(meshHead, modelTRS(s2.head[0], s2.head[1], s2.head[2], g.headR / 0.16, g.headR / 0.16, g.headR / 0.16), b.flash > 0 ? COLORS.bodyHit : COLORS.head, 0, 0.15);
  }
  for (const im of game.impacts) { const r = 0.06 + (0.08 - im.t) * 0.8; draw(meshUnit, modelTRS(im.p[0], im.p[1], im.p[2], r, r, r), im.c, 0, 1.0); }
  // weapon viewmodel (camera space; hidden in ADS — the scope overlay takes over)
  if (game.combat && game.adsBlend < 0.5) {
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
loadSettings(); settings.scope = (SIGHTS[settings.sight] || SIGHTS['2.5']).zoom; selectedMode = MODES.some(m => m.id === settings.mode) ? settings.mode : 'cqb';
buildMap('hall'); loadMapData('oregon1f'); buildModeList(); updateSensInfo(); showBest();
for (const id of [...SIMPLE_IDS, 'sight', 'reticle', 'ammomode', 'adsmode', 'crouchmode', 'leanmode', 'bots', 'map', 'recoil', 'botsize', 'invert', ...Object.values(ADS_IDS)]) $(id).addEventListener('input', readSettings);
for (const id of ['difficulty', 'duration']) $(id).addEventListener('change', () => { readSettings(); showBest(); });
$('start').addEventListener('click', async () => { if (MAPS[$('map').value]?.data && !MAP_DATA[$('map').value]) { $('start').disabled = true; await loadMapData($('map').value); $('start').disabled = false; } startRun(); await requestLock(); });
$('again').addEventListener('click', async () => { startRun(); await requestLock(); });
$('close-results').addEventListener('click', () => { $('results').classList.add('hidden'); });
canvas.addEventListener('click', async () => { if (game.running && !locked) await requestLock(); });
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.id !== b.dataset.tab)); }));
game.aimFov = settings.fov;
requestAnimationFrame(frame);
