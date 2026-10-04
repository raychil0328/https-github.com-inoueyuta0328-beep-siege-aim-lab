/* VALO AIM TRAINER — first-person weapon: pose, per-weapon kick (spring), Blender-made meshes, muzzle point for tracers.
   Meshes come from weapons.json + img/weapons.bin (built by tools/blender/build_weapons.py). Until they load (or if
   they fail), a simple box gun is drawn instead, so the game never waits on them. */
'use strict';

// ---------------------------------------------------------------- tiny column-major mat4 helpers
const M4 = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  T(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  S(x, y = x, z = x) { return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); },
  Rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  Ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  Rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
};

// ---------------------------------------------------------------- weapon meshes (int16 positions / int8 normals, non-indexed)
let WMODELS = null;
(async function loadWeaponModels() {
  try {
    const [meta, bin] = await Promise.all([fetch('weapons.json').then(r => r.json()), fetch('img/weapons.bin').then(r => r.arrayBuffer())]);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, bin, gl.STATIC_DRAW);
    const out = {};
    for (const [key, w] of Object.entries(meta.weapons)) {
      out[key] = { muzzle: w.muzzle, sight: w.sight, len: w.len, scale: 1 / meta.scale, parts: w.parts.map(p => {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.SHORT, false, 0, p.pos);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 0, p.nrm);
        gl.bindVertexArray(null); return { vao, count: p.count, color: p.color };
      }) };
    }
    WMODELS = out;
  } catch (e) { WMODELS = null; }   // keep the box gun
})();
function drawArrays(vao, count, model, color) {
  gl.uniformMatrix4fv(U.uModel, false, model); gl.uniform3fv(U.uColor, color); gl.uniform1f(U.uGrid, 0); gl.uniform1f(U.uEmis, 0);
  gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, count);
}

// ---------------------------------------------------------------- kick spring (cosmetic)
const VK = { z: 0, p: 0, r: 0, y: 0, vz: 0, vp: 0, vr: 0, vy: 0, k: 250 };
function vmKick(key) {
  const k = kickOf(key); const s = settings.recoil === 0 ? 0 : 1, ads = game.adsBlend > 0.5 ? 0.6 : 1;
  VK.k = k.k;
  // velocity impulses so the gun snaps back, then springs home; capped so long sprays do not stack forever
  VK.vz += k.back * 22 * ads * s; VK.vp += k.up * DEG * 22 * ads * s; VK.vr += (Math.random() < 0.5 ? -1 : 1) * k.roll * DEG * 18 * s; VK.vy += rand(-1, 1) * k.side * DEG * 18 * s;
}
function vmUpdate(dt) {
  const k = VK.k, c = 2 * Math.sqrt(k) * 0.9;
  for (const [x, v] of [['z', 'vz'], ['p', 'vp'], ['r', 'vr'], ['y', 'vy']]) { VK[v] += (-k * VK[x] - c * VK[v]) * dt; VK[x] += VK[v] * dt; }
  VK.z = clamp(VK.z, -0.12, 0.14); VK.p = clamp(VK.p, -0.4, 0.5);
}

// ---------------------------------------------------------------- pose + draw
const VM_FOV = 60;
let vmMuzzleCam = null;   // muzzle tip in camera space (last frame), used to start tracers at the barrel
function vmBase(w, key) {
  const M = WMODELS && WMODELS[key];
  const ads = smooth(0, 1, game.adsBlend), eq = clamp(game.equipT / Math.max(0.1, w.equip), 0, 1);
  const moving = hSpeed() > 0.5 && game.onGround; const bob = moving ? Math.sin(game.t * 11) * 0.007 * (1 - ads) : 0, bobx = moving ? Math.cos(game.t * 5.5) * 0.005 * (1 - ads) : 0;
  const pistol = w.cls === 'SIDEARM', knife = w.cls === 'MELEE';
  const hip = knife ? [0.16, -0.2, -0.3] : pistol ? [0.13, -0.16, -0.3] : [0.15, -0.19, -0.3];
  // zoomed: put the sight on the screen centre (eye just behind the rear sight)
  const ap = M && M.sight ? [-M.sight[0], -0.028 - M.sight[1], -0.17 - M.sight[2]] : [0, -0.1, -0.3];
  const x = lerp(hip[0], ap[0], ads) + bobx, y = lerp(hip[1], ap[1], ads) + bob - eq * 0.25 - (game.reloading > 0 ? 0.07 : 0), z = lerp(hip[2], ap[2], ads);
  return M4.mul(M4.mul(M4.mul(M4.T(x, y, z + VK.z), M4.Ry(VK.y)), M4.Rx(VK.p + (game.reloading > 0 ? -0.35 : 0))), M4.Rz(VK.r));
}
function drawViewmodel(w, aspect) {
  gl.clear(gl.DEPTH_BUFFER_BIT); gl.uniformMatrix4fv(U.uView, false, IDENT); gl.uniform3fv(U.uCam, [0, 0, 0]); gl.uniform1f(U.uFog, 0);
  gl.uniformMatrix4fv(U.uProj, false, perspective(VM_FOV, aspect, 0.02, 10));
  const key = game.slots[game.cur].key, M = WMODELS && WMODELS[key];
  const base = vmBase(w, key);
  let muzzle;
  if (M) {
    const m = M4.mul(base, M4.S(M.scale));
    for (const p of M.parts) drawArrays(p.vao, p.count, m, p.color);
    muzzle = M.muzzle;
  } else {   // fallback box gun (before the meshes load)
    const C1 = [0.13, 0.14, 0.16], C2 = [0.24, 0.25, 0.28], len = w.cls === 'SIDEARM' ? 0.2 : w.cls === 'SNIPER' ? 0.9 : w.cls === 'SMG' ? 0.5 : w.cls === 'MELEE' ? 0.25 : 0.75;
    const box = (cx, cy, cz, sx, sy, sz, col) => draw(meshBox, M4.mul(base, M4.mul(M4.T(cx, cy, cz), M4.S(sx, sy, sz))), col, 0, 0);
    if (w.cls === 'MELEE') { box(0, 0.02, -0.14, 0.006, 0.035, 0.2, [0.75, 0.77, 0.8]); box(0, 0, 0.02, 0.022, 0.03, 0.11, C1); muzzle = [0, 0.02, -0.25]; }
    else { box(0, 0.03, -len * 0.3, 0.04, 0.06, len * 0.75, C1); box(0, 0.045, -len * 0.75, 0.016, 0.016, len * 0.3, C2); box(0, -0.04, 0, 0.03, 0.09, 0.04, C2); muzzle = [0, 0.045, -len * 0.9]; }
  }
  vmMuzzleCam = M4.apply(base, M ? [muzzle[0], muzzle[1], muzzle[2]] : muzzle);
  if (game.muzzle > 0 && w.cls !== 'MELEE') { const f = vmMuzzleCam, s = 0.03 + Math.random() * 0.015; draw(meshUnit, modelTRS(f[0], f[1], f[2] - 0.02, s, s, s * 1.6), [1, 0.85, 0.5], 0, 1.6); }
}
// world-space point in front of the barrel (the muzzle as seen on screen, re-projected into the 3D view)
function muzzleWorld(eye, view) {
  const c = vmMuzzleCam; if (!c || c[2] > -0.01 || !settings.viewmodel || (curW().scope && game.adsBlend > 0.5)) return null;
  const aspect = canvas.width / canvas.height, f = 1 / Math.tan(VM_FOV / 2 * DEG);
  const nx = (f / aspect) * c[0] / -c[2], ny = f * c[1] / -c[2];
  const tv = Math.tan(VAL.vfov(zoomBlend()) / 2 * DEG), th = tv * aspect;
  const dx = nx * th, dy = ny * tv, L = Math.hypot(dx, dy, 1), d = 0.55;
  return [0, 1, 2].map(i => eye[i] + (view.r[i] * dx + view.u[i] * dy + view.f[i]) / L * d);
}
