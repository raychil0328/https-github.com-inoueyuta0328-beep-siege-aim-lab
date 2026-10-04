/* VALO AIM TRAINER — engine: WebGL2 renderer, map builder, collision (height aware), rays, bot navigation.
   Uncapped rendering (requestAnimationFrame = display refresh), static geometry merged per material. */
'use strict';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
const wrapAng = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- WebGL
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, desynchronized: true, powerPreference: 'high-performance' });
if (!gl) alert(t('nogl'));

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uProj, uView, uModel; out vec3 vN; out vec3 vW;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW=w.xyz; vN=mat3(uModel)*aNrm; gl_Position=uProj*uView*w; }`;
// Flat, readable shading in the style of a stylised tactical shooter: strong key light + sky fill, soft contact
// darkening near the floor, a thin accent band on walls, and fog toward the sky colour.
const FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; out vec4 o;
uniform vec3 uColor; uniform float uGrid; uniform float uEmis; uniform vec3 uCam; uniform float uFog; uniform vec3 uFogC; uniform vec3 uAccent; uniform float uFlat;
float gridLine(vec2 p, float scale, float width){
  vec2 q = p*scale; vec2 d = fwidth(q);
  vec2 a = abs(fract(q-0.5)-0.5)/max(d, vec2(1e-4));
  float l = 1.0-clamp(min(a.x,a.y)/width,0.0,1.0);
  return l*(1.0-smoothstep(0.25,0.6,max(d.x,d.y)));
}
void main(){
  if(uFlat>0.5){ o=vec4(uColor,1.0); return; }
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(0.45,0.85,0.35));
  float diff = max(dot(n,L),0.0);
  float sky = 0.5+0.5*n.y;
  vec3 c = uColor*(0.52+0.38*diff+0.16*sky);
  vec3 an = abs(n);
  if(uGrid>0.5){
    vec2 p = an.y>0.5 ? vW.xz : (an.x>0.5 ? vW.zy : vW.xy);
    float l1 = gridLine(p, 0.5, 1.0);
    c = mix(c, c*0.82, l1*0.8);
  }
  if(uGrid>1.5 && an.y<0.5){ // walls: dark skirting + accent band
    if(vW.y<0.25) c*=0.72;
    if(vW.y>2.6 && vW.y<2.75) c = mix(c, uAccent, 0.85);
  }
  if(an.y<0.5) c *= 0.88+0.12*smoothstep(0.0,0.6,vW.y);
  float dist = length(vW-uCam); c = mix(c, uFogC, (1.0-exp(-dist*0.010))*uFog);
  float rim = pow(1.0-max(dot(n, normalize(uCam-vW)),0.0), 3.0);
  c += uColor*uEmis*(0.6+rim*0.8);
  o = vec4(c,1.0);
}`;
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const U = {}; for (const n of ['uProj', 'uView', 'uModel', 'uColor', 'uGrid', 'uEmis', 'uCam', 'uFog', 'uFogC', 'uAccent', 'uFlat']) U[n] = gl.getUniformLocation(prog, n);

function makeMesh(pos, nrm, idx) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos instanceof Float32Array ? pos : new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, nrm instanceof Float32Array ? nrm : new Float32Array(nrm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx instanceof Uint32Array ? idx : new Uint32Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null); return { vao, n: idx.length, bufs: [vb, nb, ib] };
}
const BOX_FACES = [[[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]]];
function mergedPropMesh(list) {
  const n = list.length, P = new Float32Array(n * 60), N = new Float32Array(n * 60), I = new Uint32Array(n * 30);
  let v = 0, ii = 0;
  for (const p of list) for (const f of BOX_FACES) {
    const base = v / 3;
    for (let k = 0; k < 4; k++) { const c = f[k]; P[v] = p.x + c[0] * p.w; P[v + 1] = (c[1] + 0.5) * p.h; P[v + 2] = p.z + c[2] * p.d; N[v] = f[4][0]; N[v + 1] = f[4][1]; N[v + 2] = f[4][2]; v += 3; }
    I[ii++] = base; I[ii++] = base + 1; I[ii++] = base + 2; I[ii++] = base; I[ii++] = base + 2; I[ii++] = base + 3;
  }
  return makeMesh(P, N, I);
}
function boxMesh() {
  const P = [], N = [], I = [];
  const face = (a, b, c, d, n) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  face([-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]);
  face([.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]);
  face([.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]);
  face([-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]);
  face([-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]);
  face([-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0]);
  return makeMesh(P, N, I);
}
function planeMesh(down) { // unit quad in xz, normal up (or down for a ceiling)
  const ny = down ? -1 : 1; const P = [-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5], N = [0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0];
  return makeMesh(P, N, down ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
}
function capsuleMesh(r, hh, seg = 18, rings = 6) {
  const P = [], N = [], I = [];
  const addRing = (y, rr, ny, nyScale) => { for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a); P.push(cx * rr, y, sz * rr); const nx = cx * nyScale, nz = sz * nyScale; const l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l); } };
  for (let j = 0; j <= rings; j++) { const t2 = -Math.PI / 2 + (j / rings) * Math.PI / 2; addRing(-hh + Math.sin(t2) * r, Math.cos(t2) * r, Math.sin(t2), Math.cos(t2)); }
  for (let j = 0; j <= rings; j++) { const t2 = (j / rings) * Math.PI / 2; addRing(hh + Math.sin(t2) * r, Math.cos(t2) * r, Math.sin(t2), Math.cos(t2)); }
  const rowCount = 2 * (rings + 1);
  for (let j = 0; j < rowCount - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  return makeMesh(P, N, I);
}
function sphereMesh(r, seg = 18, rings = 10) {
  const P = [], N = [], I = [];
  for (let j = 0; j <= rings; j++) { const t2 = -Math.PI / 2 + j / rings * Math.PI; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; const x = Math.cos(t2) * Math.cos(a), y = Math.sin(t2), z = Math.cos(t2) * Math.sin(a); P.push(x * r, y * r, z * r); N.push(x, y, z); } }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  return makeMesh(P, N, I);
}
const meshBox = boxMesh();
const meshFloor = planeMesh(false), meshCeil = planeMesh(true);
const meshCap = capsuleMesh(1, 1);          // unit capsule: radius 1, half-height 1 (scaled per use)
const meshSphere = sphereMesh(1);
const meshUnit = sphereMesh(1.0, 10, 6);

function perspective(fovyDeg, aspect, n, f) { const tt = 1 / Math.tan(fovyDeg * DEG / 2); const m = new Float32Array(16); m[0] = tt / aspect; m[5] = tt; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
function viewMatrix(yaw, pitch, roll, eye) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = [sy * cp, sp, -cy * cp]; let r = [cy, 0, sy]; let u = [-sy * sp, cp, cy * sp];
  if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll); const r2 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr]; u = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr]; r = r2; }
  const m = new Float32Array(16);
  m[0] = r[0]; m[4] = r[1]; m[8] = r[2]; m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot(r, eye); m[13] = -dot(u, eye); m[14] = dot(f, eye); m[15] = 1;
  return { m, f, r, u };
}
// direction for yaw/pitch (same convention as viewMatrix)
function dirOf(yaw, pitch) { const cp = Math.cos(pitch); return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }
const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MODEL = new Float32Array(16);
function modelTRS(x, y, z, sx = 1, sy = 1, sz = 1, rotY = 0, rotZ = 0) {
  const cy = Math.cos(rotY), sy2 = Math.sin(rotY), cz = Math.cos(rotZ), sz2 = Math.sin(rotZ);
  // R = Ry * Rz, then scale
  MODEL.set([cy * cz * sx, sz2 * sx, -sy2 * cz * sx, 0, -cy * sz2 * sy, cz * sy, sy2 * sz2 * sy, 0, sy2 * sz, 0, cy * sz, 0, x, y, z, 1]); return MODEL;
}
function draw(mesh, model, color, grid = 0, emis = 0) {
  gl.uniformMatrix4fv(U.uModel, false, model); gl.uniform3fv(U.uColor, color); gl.uniform1f(U.uGrid, grid); gl.uniform1f(U.uEmis, emis);
  gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
}

// ---------------------------------------------------------------- map build
// props: axis-aligned boxes {x,z,w,d,h,kind,ci} standing on the floor (y 0..h)
let ROOM = { xmin: -32, xmax: 32, zmin: -28, zmax: 28, h: 6 };
const PROPS = [];
let MAP = null, MAPKEY = '';
let STATIC = [];
function addProp(x, z, w, d, h, kind, ci = 0) { PROPS.push({ x, z, w, d, h, kind, ci, xmin: x - w / 2, xmax: x + w / 2, zmin: z - d / 2, zmax: z + d / 2 }); }
const CH = { '#': 'wall', b: 'crate', B: 'crate', h: 'cover', C: 'cont', o: 'pillar', 1: 'step', 2: 'step', 3: 'step', 4: 'step', 5: 'step' };
function cellHeight(ch, def) {
  switch (ch) { case '#': case 'o': return def.wallH; case 'b': return 1.0; case 'B': return 2.0; case 'h': return 1.45; case 'C': return 2.6; }
  if (ch >= '1' && ch <= '5') return (+ch) * 0.5;
  return 0;
}
function buildFromGrid(def) {
  const G = def.grid, H = G.length, W = G[0].length;
  ROOM = { xmin: -W * CELL / 2, xmax: W * CELL / 2, zmin: -H * CELL / 2, zmax: H * CELL / 2, h: def.wallH };
  const used = G.map(r => new Array(r.length).fill(false));
  const X = i => ROOM.xmin + i * CELL, Z = j => ROOM.zmin + j * CELL;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const ch = G[j][i]; if (used[j][i] || !CH[ch]) continue;
    if (ch === 'o') { used[j][i] = true; addProp(X(i) + CELL / 2, Z(j) + CELL / 2, 1, 1, def.wallH, 'pillar'); continue; }
    // greedy rectangle: extend right, then down while the whole row matches
    let i2 = i; while (i2 + 1 < W && G[j][i2 + 1] === ch && !used[j][i2 + 1]) i2++;
    let j2 = j; outer: while (j2 + 1 < H) { for (let k = i; k <= i2; k++) if (G[j2 + 1][k] !== ch || used[j2 + 1][k]) break outer; j2++; }
    for (let jj = j; jj <= j2; jj++) for (let ii = i; ii <= i2; ii++) used[jj][ii] = true;
    const w = (i2 - i + 1) * CELL, d = (j2 - j + 1) * CELL, h = cellHeight(ch, def);
    // crates are a little smaller than the cell so they read as objects, not terrain
    const shrink = ch === 'b' || ch === 'B' ? 0.3 : ch === 'h' ? 0.6 : ch === 'C' ? 0.2 : 0;
    const ci = ch === 'C' ? Math.abs((i * 7 + j * 13) % def.pal.cont.length) : 0;
    addProp(X(i) + w / 2, Z(j) + d / 2, w - shrink * (ch === 'h' ? (w > d ? 0 : 1) : 1), d - shrink * (ch === 'h' ? (w > d ? 1 : 0) : 1), h, CH[ch], ci);
  }
}
function buildRange(def) {
  ROOM = { ...def.room, h: def.wallH };
  const t2 = 1;
  addProp((ROOM.xmin + ROOM.xmax) / 2, ROOM.zmin - t2 / 2, ROOM.xmax - ROOM.xmin + 2, t2, def.wallH, 'wall');
  addProp((ROOM.xmin + ROOM.xmax) / 2, ROOM.zmax + t2 / 2, ROOM.xmax - ROOM.xmin + 2, t2, def.wallH, 'wall');
  addProp(ROOM.xmin - t2 / 2, (ROOM.zmin + ROOM.zmax) / 2, t2, ROOM.zmax - ROOM.zmin, def.wallH, 'wall');
  addProp(ROOM.xmax + t2 / 2, (ROOM.zmin + ROOM.zmax) / 2, t2, ROOM.zmax - ROOM.zmin, def.wallH, 'wall');
}
function buildMap(key, extra) {
  MAPKEY = key; MAP = MAP_DEFS[key]; PROPS.length = 0;
  if (MAP.grid) buildFromGrid(MAP); else buildRange(MAP);
  if (extra) extra();
  buildGrid(); rebuildStatic();
  if (MAP.grid) { buildNav(); buildSpawns(); } else { NAV.ok = false; SPAWNS.length = 0; }
  minimapStatic = null;
}
function propColor(kind, ci) {
  const p = MAP.pal;
  switch (kind) { case 'wall': return p.wall; case 'crate': return p.crate; case 'cover': return p.cover; case 'cont': return p.cont[ci % p.cont.length]; case 'step': return p.step; case 'pillar': return p.pillar; case 'target': return [0.85, 0.85, 0.88]; }
  return p.wall;
}
function rebuildStatic() {
  for (const m of STATIC) for (const b of m.mesh.bufs) gl.deleteBuffer(b);
  STATIC = [];
  const groups = {}; for (const p of PROPS) { const k = p.kind + ':' + p.ci; (groups[k] = groups[k] || []).push(p); }
  for (const [k, list] of Object.entries(groups)) STATIC.push({ kind: list[0].kind, color: propColor(list[0].kind, list[0].ci), mesh: mergedPropMesh(list) });
}

// uniform 2 m grid over PROPS so collision / rays stay O(local)
const GRID = { cs: 2, x0: 0, z0: 0, nx: 1, nz: 1, cells: [], stamp: 0 };
function buildGrid() {
  GRID.x0 = ROOM.xmin - 2; GRID.z0 = ROOM.zmin - 2; GRID.nx = Math.ceil((ROOM.xmax - ROOM.xmin + 4) / GRID.cs); GRID.nz = Math.ceil((ROOM.zmax - ROOM.zmin + 4) / GRID.cs);
  GRID.cells = Array.from({ length: GRID.nx * GRID.nz }, () => []);
  for (const p of PROPS) {
    p._s = 0;
    const i0 = clamp(Math.floor((p.xmin - GRID.x0) / GRID.cs), 0, GRID.nx - 1), i1 = clamp(Math.floor((p.xmax - GRID.x0) / GRID.cs), 0, GRID.nx - 1);
    const j0 = clamp(Math.floor((p.zmin - GRID.z0) / GRID.cs), 0, GRID.nz - 1), j1 = clamp(Math.floor((p.zmax - GRID.z0) / GRID.cs), 0, GRID.nz - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) GRID.cells[j * GRID.nx + i].push(p);
  }
}
function propsIn(xmin, xmax, zmin, zmax, out = []) {
  const st = ++GRID.stamp; out.length = 0;
  const i0 = clamp(Math.floor((xmin - GRID.x0) / GRID.cs), 0, GRID.nx - 1), i1 = clamp(Math.floor((xmax - GRID.x0) / GRID.cs), 0, GRID.nx - 1);
  const j0 = clamp(Math.floor((zmin - GRID.z0) / GRID.cs), 0, GRID.nz - 1), j1 = clamp(Math.floor((zmax - GRID.z0) / GRID.cs), 0, GRID.nz - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const p of GRID.cells[j * GRID.nx + i]) if (p._s !== st) { p._s = st; out.push(p); }
  return out;
}
const _q1 = [], _q2 = [], _q3 = [];
// circle (x,z,r) vs props taller than `maxTop` (props whose top is below it can be stepped onto / are underfoot)
function collide(x, z, r, maxTop = -1) {
  x = clamp(x, ROOM.xmin + r, ROOM.xmax - r); z = clamp(z, ROOM.zmin + r, ROOM.zmax - r);
  for (let pass = 0; pass < 2; pass++) for (const p of propsIn(x - r - 0.05, x + r + 0.05, z - r - 0.05, z + r + 0.05, _q2)) {
    if (p.h <= maxTop) continue;
    const cx = clamp(x, p.xmin, p.xmax), cz = clamp(z, p.zmin, p.zmax);
    const dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-8) {
        const px = Math.min(x - p.xmin, p.xmax - x), pz = Math.min(z - p.zmin, p.zmax - z);
        if (px < pz) x = (x - p.xmin < p.xmax - x) ? p.xmin - r : p.xmax + r; else z = (z - p.zmin < p.zmax - z) ? p.zmin - r : p.zmax + r;
      } else { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
    }
  }
  return [x, z];
}
// highest walkable surface under a circle whose top is at most `maxTop` (0 = floor)
function groundAt(x, z, r, maxTop) {
  let g = 0;
  for (const p of propsIn(x - r, x + r, z - r, z + r, _q3)) {
    if (p.h > maxTop) continue;
    const cx = clamp(x, p.xmin, p.xmax), cz = clamp(z, p.zmin, p.zmax);
    if ((x - cx) ** 2 + (z - cz) ** 2 < (r * 0.7) ** 2 && p.h > g) g = p.h;
  }
  return g;
}
function posFree(x, z, r) { const [cx, cz] = collide(x, z, r); return Math.hypot(cx - x, cz - z) < 0.02; }
function segBlocked(ax, az, bx, bz, r) {
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
// ray vs props + floor: walk the 2 m grid along the ray (2D DDA)
function rayProps(o, d, maxT = 200) {
  const cs = GRID.cs; let i = Math.floor((o[0] - GRID.x0) / cs), j = Math.floor((o[2] - GRID.z0) / cs);
  const sx = Math.sign(d[0]), sz = Math.sign(d[2]);
  const tdx = sx ? cs / Math.abs(d[0]) : Infinity, tdz = sz ? cs / Math.abs(d[2]) : Infinity;
  let tx = sx ? ((sx > 0 ? (i + 1) * cs : i * cs) + GRID.x0 - o[0]) / d[0] : Infinity;
  let tz = sz ? ((sz > 0 ? (j + 1) * cs : j * cs) + GRID.z0 - o[2]) / d[2] : Infinity;
  let best = d[1] < -1e-6 ? -o[1] / d[1] : Infinity;   // floor
  if (MAP && MAP.roof && d[1] > 1e-6) best = Math.min(best, (ROOM.h - o[1]) / d[1]);
  let tcell = 0; const st = ++GRID.stamp;
  while (tcell < maxT && tcell < best) {
    if (i >= 0 && j >= 0 && i < GRID.nx && j < GRID.nz) for (const p of GRID.cells[j * GRID.nx + i]) { if (p._s === st) continue; p._s = st; const tt = rayBox(o, d, p); if (tt < best) best = tt; }
    const tnext = Math.min(tx, tz); if (best <= tnext) break;
    if (tx < tz) { i += sx; tcell = tx; tx += tdx; } else { j += sz; tcell = tz; tz += tdz; }
    if ((i < -1 && sx <= 0) || (j < -1 && sz <= 0) || (i > GRID.nx && sx >= 0) || (j > GRID.nz && sz >= 0)) break;
  }
  return best;
}
function segRay(o, d, a, b) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [a[0] - o[0], a[1] - o[1], a[2] - o[2]];
  const aa = dot(d, d), bb = dot(d, u), cc = dot(u, u), dd = dot(d, w), ee = dot(u, w);
  const den = aa * cc - bb * bb; let s, tt;
  if (den < 1e-9) { s = 0; tt = dd / aa; } else { s = clamp((bb * dd - aa * ee) / den, 0, 1); tt = (dd + bb * s) / aa; }
  if (tt < 0) tt = 0;
  const px = o[0] + d[0] * tt - (a[0] + u[0] * s), py = o[1] + d[1] * tt - (a[1] + u[1] * s), pz = o[2] + d[2] * tt - (a[2] + u[2] * s);
  return { dist: Math.hypot(px, py, pz), t: tt };
}
function raySphere(o, d, c, r) {
  const m = [o[0] - c[0], o[1] - c[1], o[2] - c[2]]; const b = dot(m, d), cc = dot(m, m) - r * r;
  if (cc > 0 && b > 0) return Infinity; const disc = b * b - cc; if (disc < 0) return Infinity;
  return Math.max(0, -b - Math.sqrt(disc));
}
// line of sight between two points (props + floor)
function visible(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(d[0], d[1], d[2]); if (L < 1e-6) return true;
  d[0] /= L; d[1] /= L; d[2] /= L; return rayProps(a, d, L + 1) >= L - 0.05;
}

// ---------------------------------------------------------------- bot navigation: 1 m grid, BFS paths on the floor
const NAV = { cs: 1, nx: 0, nz: 0, x0: 0, z0: 0, free: null, ok: false, prev: null, queue: null };
const BOT_R = 0.32;
function buildNav() {
  NAV.x0 = ROOM.xmin; NAV.z0 = ROOM.zmin; NAV.nx = Math.round(ROOM.xmax - ROOM.xmin); NAV.nz = Math.round(ROOM.zmax - ROOM.zmin);
  NAV.free = new Uint8Array(NAV.nx * NAV.nz); NAV.prev = new Int32Array(NAV.nx * NAV.nz); NAV.queue = new Int32Array(NAV.nx * NAV.nz);
  for (let j = 0; j < NAV.nz; j++) for (let i = 0; i < NAV.nx; i++) NAV.free[j * NAV.nx + i] = posFree(NAV.x0 + i + 0.5, NAV.z0 + j + 0.5, BOT_R + 0.08) ? 1 : 0;
  // keep only the largest connected region so nobody spawns in a sealed pocket
  const comp = new Int32Array(NAV.nx * NAV.nz).fill(-1); let best = -1, bestN = 0, c = 0;
  for (let s = 0; s < comp.length; s++) {
    if (!NAV.free[s] || comp[s] >= 0) continue;
    let qh = 0, qt = 0; NAV.queue[qt++] = s; comp[s] = c; let n = 0;
    while (qh < qt) { const k = NAV.queue[qh++]; n++; const i = k % NAV.nx, j = (k / NAV.nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NAV.nx || jj >= NAV.nz) continue; const kk = jj * NAV.nx + ii; if (NAV.free[kk] && comp[kk] < 0) { comp[kk] = c; NAV.queue[qt++] = kk; } } }
    if (n > bestN) { bestN = n; best = c; } c++;
  }
  for (let s = 0; s < comp.length; s++) if (comp[s] !== best) NAV.free[s] = 0;
  NAV.ok = true;
}
function navCell(x, z) { const i = clamp(Math.floor(x - NAV.x0), 0, NAV.nx - 1), j = clamp(Math.floor(z - NAV.z0), 0, NAV.nz - 1); return j * NAV.nx + i; }
function navCenter(k) { return [NAV.x0 + (k % NAV.nx) + 0.5, NAV.z0 + ((k / NAV.nx) | 0) + 0.5]; }
function nearestFree(k) {
  if (NAV.free[k]) return k; const i0 = k % NAV.nx, j0 = (k / NAV.nx) | 0;
  for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= NAV.nx || j >= NAV.nz) continue; const kk = j * NAV.nx + i; if (NAV.free[kk]) return kk; }
  return -1;
}
// BFS (8-neighbour, no corner cutting) → list of waypoints, string-pulled with segBlocked
function findPath(ax, az, bx, bz) {
  if (!NAV.ok) return null;
  const s = nearestFree(navCell(ax, az)), g = nearestFree(navCell(bx, bz)); if (s < 0 || g < 0) return null;
  NAV.prev.fill(-2); let qh = 0, qt = 0; NAV.queue[qt++] = s; NAV.prev[s] = -1;
  const nx = NAV.nx, nz = NAV.nz, F = NAV.free;
  while (qh < qt) {
    const k = NAV.queue[qh++]; if (k === g) break; const i = k % nx, j = (k / nx) | 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii; if (!F[kk] || NAV.prev[kk] !== -2) continue;
      if (di && dj && (!F[j * nx + ii] || !F[jj * nx + i])) continue;
      NAV.prev[kk] = k; NAV.queue[qt++] = kk;
    }
  }
  if (NAV.prev[g] === -2) return null;
  const cells = []; for (let k = g; k !== -1; k = NAV.prev[k]) cells.push(k); cells.reverse();
  const pts = cells.map(navCenter); pts[pts.length - 1] = [bx, bz];
  const out = []; let cur = [ax, az], idx = 0;
  while (idx < pts.length - 1) { let far = idx + 1; for (let k = pts.length - 1; k > idx + 1; k--) if (!segBlocked(cur[0], cur[1], pts[k][0], pts[k][1], BOT_R)) { far = k; break; } out.push(pts[far]); cur = pts[far]; idx = far; }
  if (!out.length) out.push([bx, bz]);
  return out;
}
function randomFreePoint(cx, cz, rad) {
  for (let n = 0; n < 40; n++) {
    const x = cx + rand(-rad, rad), z = cz + rand(-rad, rad); const k = navCell(x, z);
    if (x > ROOM.xmin && x < ROOM.xmax && z > ROOM.zmin && z < ROOM.zmax && NAV.free[k]) return navCenter(k);
  }
  const all = []; for (let k = 0; k < NAV.free.length; k += 7) if (NAV.free[k]) all.push(k);
  return navCenter(pick(all));
}
// spawn points: farthest-point sampling over open floor (at least 1 m from walls)
const SPAWNS = [];
function buildSpawns() {
  SPAWNS.length = 0; const cand = [];
  for (let j = 1; j < NAV.nz - 1; j += 2) for (let i = 1; i < NAV.nx - 1; i += 2) {
    const k = j * NAV.nx + i; if (!NAV.free[k] || !NAV.free[k - 1] || !NAV.free[k + 1] || !NAV.free[k - NAV.nx] || !NAV.free[k + NAV.nx]) continue;
    cand.push(navCenter(k));
  }
  if (!cand.length) return;
  SPAWNS.push(cand[Math.floor(cand.length / 2)]);
  const dmin = cand.map(c => Math.hypot(c[0] - SPAWNS[0][0], c[1] - SPAWNS[0][1]));
  while (SPAWNS.length < 48 && SPAWNS.length < cand.length) {
    let bi = 0; for (let i = 1; i < cand.length; i++) if (dmin[i] > dmin[bi]) bi = i;
    if (dmin[bi] < 3) break; SPAWNS.push(cand[bi]);
    for (let i = 0; i < cand.length; i++) dmin[i] = Math.min(dmin[i], Math.hypot(cand[i][0] - cand[bi][0], cand[i][1] - cand[bi][1]));
  }
}
let minimapStatic = null;
