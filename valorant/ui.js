/* VALO AIM TRAINER — menu: settings form, crosshair editor / share code, sensitivity converter, weapon table,
   key bindings, results + history, first-visit guide. */
'use strict';

// ---------------------------------------------------------------- settings form
const SEL = ['map', 'primary', 'secondary', 'bots', 'botDiff', 'botMove', 'botSpeed', 'ammo', 'killGoal', 'minutes', 'zoomTime', 'enemyColor', 'adsmode', 'crouchmode', 'walkmode', 'drillGun'];
function fillWeaponSelects() {
  const opt = k => { const w = WEAPONS[k]; return `<option value="${k}">${w.name} · ${w.cls}</option>`; };
  $('primary').innerHTML = PRIMARIES.map(opt).join(''); $('secondary').innerHTML = SECONDARIES.map(opt).join('');
  $('drillGun').innerHTML = [...PRIMARIES, ...SECONDARIES].map(opt).join('');
}
function loadSettings() {
  loadSettingsRaw();
  for (const id of SEL) $(id).value = String(settings[id]);
  $('shootBack').value = settings.shootBack ? '1' : '0';
  $('dpi').value = settings.dpi; $('sens').value = settings.sens; $('scoped').value = settings.scoped; $('invert').checked = settings.invert;
  $('difficulty-lab').value = String(settings.difficultyLab); $('duration-lab').value = String(settings.durationLab);
  $('outline').checked = settings.outline; $('viewmodel').checked = settings.viewmodel; $('speedo-chk').checked = settings.speedo; $('footsteps').checked = settings.footsteps; $('volume').value = settings.volume;
}
function readSettings() {
  settings.dpi = clamp(+$('dpi').value || 800, 100, 32000);
  settings.sens = clamp(+$('sens').value || 0.4, 0.001, 10);
  settings.scoped = clamp(+$('scoped').value || 1, 0.01, 5);
  for (const id of SEL) settings[id] = $(id).value;
  for (const id of ['bots', 'botSpeed', 'killGoal', 'minutes', 'zoomTime']) settings[id] = +settings[id];
  settings.bots = String(settings.bots);
  settings.shootBack = $('shootBack').value === '1'; settings.invert = $('invert').checked;
  settings.difficultyLab = +$('difficulty-lab').value; settings.durationLab = +$('duration-lab').value;
  settings.outline = $('outline').checked; settings.viewmodel = $('viewmodel').checked; settings.speedo = $('speedo-chk').checked; settings.footsteps = $('footsteps').checked; settings.volume = +$('volume').value;
  AU.setVol(); saveSettings(); updateSensInfo(); updateMapInfo();
}
const PRESETS = {
  quick: { bots: '5', killGoal: 20, minutes: 3, botDiff: 'normal', botMove: 'normal' },
  std: { bots: '7', killGoal: 30, minutes: 5, botDiff: 'normal', botMove: 'normal' },
  real: { bots: '11', killGoal: 40, minutes: 9, botDiff: 'hard', botMove: 'normal' },   // official DM: 12 players, 40 kills, 9:00
};
function applyPreset(k) { const p = PRESETS[k]; for (const [id, v] of Object.entries(p)) $(id).value = String(v); readSettings(); showBest(); }
function updateSensInfo() {
  const hip = VAL.yaw(settings.sens); const w = WEAPONS[settings.primary]; const z = w.zoom || 1.25; const ads = VAL.adsYaw(settings.sens, settings.scoped, z);
  $('si-hip').textContent = `${VAL.cm360(hip, settings.dpi).toFixed(2)} cm`;
  $('si-hip2').textContent = `${hip.toFixed(4)}°/count · eDPI ${Math.round(settings.dpi * settings.sens)}`;
  $('si-ads').textContent = `${VAL.cm360(ads, settings.dpi).toFixed(2)} cm`;
  $('si-ads2').textContent = `${w.zoom ? w.name : 'Vandal'} ${z}x · ${ads.toFixed(4)}°/count`;
  const asp = (screen.width || 16) / (screen.height || 9);
  $('si-fov').textContent = `${VAL.hfov(asp).toFixed(1)}° → ${VAL.hfov(asp, z).toFixed(1)}°`;
  $('si-fov2').textContent = `${t('st.fov2')} ${VAL.VFOV}° / ${(asp).toFixed(2)}:1`;
  conv();
}
// converter: other game sensitivity (same cm/360) → VALORANT
function conv() {
  const g = $('conv-game').value, v = +$('conv-in').value; let out = null;
  if (v > 0) out = g === 'cm' ? 2.54 * 360 / (v * settings.dpi * VAL.YAW) : v * VAL.OTHER[g] / VAL.YAW;
  $('conv-out').textContent = out ? out.toFixed(3) : '—'; return out;
}
function updateMapInfo() {
  const def = MAP_DEFS[$('map').value]; if (!def) return;
  $('mapinfo').innerHTML = `<b>${def.name}</b> ${t('mapdesc.' + $('map').value)}`;
}

// ---------------------------------------------------------------- crosshair editor + share code
// Same items as the in-game crosshair menu: Primary / ADS / Sniper profiles. Field keys follow the share code.
const XH_FIELDS = {
  c: ['sel', 'xh.color'], u: ['hex', 'xh.hex'], h: ['chk', 'xh.outline'], t: ['num', 'xh.othick', 1, 6, 1], o: ['num', 'xh.oalpha', 0, 1, 0.05],
  d: ['chk', 'xh.dot'], z: ['num', 'xh.dthick', 1, 6, 1], a: ['num', 'xh.dalpha', 0, 1, 0.05],
  ib: ['chk', 'xh.show'], ia: ['num', 'xh.alpha', 0, 1, 0.05], il: ['num', 'xh.len', 0, 20, 1], ig: ['chk', 'xh.vind'], iv: ['num', 'xh.vlen', 0, 20, 1], it: ['num', 'xh.thick', 0, 10, 1], io: ['num', 'xh.off', 0, 20, 1],
  im: ['chk', 'xh.merr'], is: ['num', 'xh.mmul', 0, 3, 0.1], if: ['chk', 'xh.ferr'], ie: ['num', 'xh.fmul', 0, 3, 0.1],
  ob: ['chk', 'xh.show'], oa: ['num', 'xh.alpha', 0, 1, 0.05], ol: ['num', 'xh.len', 0, 10, 1], og: ['chk', 'xh.vind'], ov: ['num', 'xh.vlen', 0, 10, 1], ot: ['num', 'xh.thick', 0, 10, 1], oo: ['num', 'xh.off', 0, 40, 1],
  om: ['chk', 'xh.merr'], os: ['num', 'xh.mmul', 0, 3, 0.1], of: ['chk', 'xh.ferr'], oe: ['num', 'xh.fmul', 0, 3, 0.1],
};
const XH_GROUPS = [['xh.g.base', ['c', 'u', 'h', 't', 'o', 'd', 'z', 'a']], ['xh.g.inner', ['ib', 'ia', 'il', 'ig', 'iv', 'it', 'io', 'im', 'is', 'if', 'ie']], ['xh.g.outer', ['ob', 'oa', 'ol', 'og', 'ov', 'ot', 'oo', 'om', 'os', 'of', 'oe']]];
const XHS_FIELDS = { d: ['chk', 'xh.sdot'], c: ['sel', 'xh.color'], u: ['hex', 'xh.hex'], s: ['num', 'xh.dthick', 0.2, 4, 0.1], o: ['num', 'xh.dalpha', 0, 1, 0.05] };
// generic starting points, written as in-game codes
const XH_PRESETS = {
  def: '0;P', small: '0;P;h;0;0l;3;0o;2;0a;1;0f;0;1b;0', plus: '0;P;c;1;o;1;0t;1;0l;2;0o;2;0a;1;0f;0;1b;0', dot: '0;P;c;5;d;1;z;3;0b;0;1b;0',
  crossdot: '0;P;c;7;h;0;d;1;z;2;0l;4;0o;3;0a;1;0f;0;1b;0', tall: '0;P;h;0;0l;2;0g;1;0v;5;0o;2;0a;1;0f;0;1b;0', dyn: '0;P;c;4;0l;4;0o;2;0a;1;0m;1;0s;1.5;0f;1;0e;1.5;1b;0',
};
let xhProf = 'xh';
function profObj() { return settings[xhProf]; }
function buildXhEditor() {
  const box = $('xh-ed'); box.innerHTML = '';
  const groups = xhProf === 'xhSn' ? [['xh.g.sniper', Object.keys(XHS_FIELDS)]] : XH_GROUPS;
  const defs = xhProf === 'xhSn' ? XHS_FIELDS : XH_FIELDS;
  for (const [head, keys] of groups) {
    const fs = document.createElement('div'); fs.className = 'xh-g'; fs.innerHTML = `<h4>${t(head)}</h4>`;
    for (const k of keys) {
      const [type, lab, mn, mx, st] = defs[k]; const el = document.createElement('label'); el.className = type === 'chk' ? 'chk' : ''; el.dataset.f = k;
      const nm = `<span title="${t(lab)}">${t(lab)}</span>`;
      if (type === 'sel') el.innerHTML = nm + `<select data-k="${k}">${['white', 'green', 'ygreen', 'gyellow', 'yellow', 'cyan', 'pink', 'red', 'custom'].map((c, i) => `<option value="${i}">${t('xc.' + c)}</option>`).join('')}</select>`;
      else if (type === 'hex') el.innerHTML = nm + `<input data-k="${k}" type="text" maxlength="8" spellcheck="false">`;
      else if (type === 'chk') el.innerHTML = nm + `<input data-k="${k}" type="checkbox">`;
      else el.innerHTML = nm + `<input data-k="${k}" type="number" min="${mn}" max="${mx}" step="${st}">`;
      fs.appendChild(el);
    }
    box.appendChild(fs);
  }
  box.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => {
    const k = el.dataset.k, x = profObj();
    if (el.type === 'checkbox') x[k] = el.checked ? 1 : 0; else if (k === 'u') x.u = el.value.replace(/[^0-9a-f]/gi, '').toUpperCase() || 'FFFFFF'; else if (el.value !== '') x[k] = +el.value;
    $('xh-preset').value = ''; saveSettings(); refreshXh(false);
  }));
  document.querySelectorAll('#xh-prof button').forEach(b => b.classList.toggle('on', b.dataset.p === xhProf));
  $('xh-adson-l').classList.toggle('hidden', xhProf !== 'xhAds'); $('xh-adson').checked = settings.xhAdsOn;
  $('xh-preset-l').classList.toggle('hidden', xhProf === 'xhSn');
  refreshXh(true);
}
function refreshXh(fill) {
  const x = profObj(), ed = $('xh-ed');
  if (fill) ed.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; if (el.type === 'checkbox') el.checked = !!x[k]; else el.value = x[k]; });
  const show = (k, on) => { const l = ed.querySelector(`[data-f="${k}"]`); if (l) l.classList.toggle('off', !on); };
  show('u', x.c === 8);
  if (xhProf !== 'xhSn') {
    for (const p of ['i', 'o']) {
      const on = !!x[p + 'b']; for (const k of ['a', 'l', 'g', 'v', 't', 'o', 'm', 's', 'f', 'e']) show(p + k, on);
      if (on) { show(p + 'v', !!x[p + 'g']); show(p + 's', !!x[p + 'm']); show(p + 'e', !!x[p + 'f']); }
    }
    show('t', !!x.h); show('o', !!x.h); show('z', !!x.d); show('a', !!x.d);
  } else { for (const k of ['c', 's', 'o']) show(k, !!x.d); show('u', x.d && x.c === 8); }
  ed.classList.toggle('dim', xhProf === 'xhAds' && !settings.xhAdsOn);
  drawPreview(); xhSig = '';
}
// preview on a selectable backdrop; "demo" animates movement / firing error so you can watch the lines react
const XH_DEMO = { on: false, t: 0, id: 0 };
function drawPreview() {
  const c = $('xh-prev'); c.dataset.bg = settings.xhBg;
  if (xhProf === 'xhSn') {
    const g = c.getContext('2d'); c.width = c.height = 192; g.clearRect(0, 0, 192, 192); const sn = settings.xhSn;
    g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 96.5); g.lineTo(192, 96.5); g.moveTo(96.5, 0); g.lineTo(96.5, 192); g.stroke();
    if (sn.d) { g.globalAlpha = sn.o; g.fillStyle = sn.c === 8 ? '#' + (sn.u || 'FF0000').slice(0, 6) : XH_COLORS[sn.c]; g.beginPath(); g.arc(96.5, 96.5, Math.max(1.5, sn.s * 3), 0, 6.29); g.fill(); g.globalAlpha = 1; }
    return;
  }
  const k = XH_DEMO.on ? (Math.sin(XH_DEMO.t * 2.2) * 0.5 + 0.5) : 0;
  drawCrosshair(k * 9, XH_DEMO.on ? (1 - k) * 6 : 0, c, profObj());
}
function setDemo(on) {
  XH_DEMO.on = on; clearInterval(XH_DEMO.id);
  if (on) XH_DEMO.id = setInterval(() => { if ($('tab-xh').classList.contains('hidden') || game.running) return; XH_DEMO.t += 0.05; drawPreview(); }, 50);
  drawPreview();
}
const XH_CODE_KEYS = { c: 'c', u: 'u', h: 'h', t: 't', o: 'o', d: 'd', z: 'z', a: 'a',
  '0b': 'ib', '0t': 'it', '0l': 'il', '0g': 'ig', '0v': 'iv', '0o': 'io', '0a': 'ia', '0m': 'im', '0s': 'is', '0f': 'if', '0e': 'ie',
  '1b': 'ob', '1t': 'ot', '1l': 'ol', '1g': 'og', '1v': 'ov', '1o': 'oo', '1a': 'oa', '1m': 'om', '1s': 'os', '1f': 'of', '1e': 'oe' };
const XHS_CODE_KEYS = { d: 'd', c: 'c', u: 'u', s: 's', o: 'o' };
// returns {P, A, S} (each null when that section is absent) or null when nothing could be read
function parseXhCode(code) {
  const tok = code.trim().split(';'); if (tok.length < 2) return null;
  const out = { P: null, A: null, S: null }; let sec = '';
  for (let i = 1; i < tok.length;) {
    const k = tok[i];
    if (k === 'P' || k === 'A' || k === 'S') { sec = k; out[k] = out[k] || (k === 'S' ? { ...XHS_DEFAULT } : { ...XH_DEFAULT }); i++; continue; }
    const v = tok[i + 1]; i += 2; if (v === undefined || !sec) continue;
    const f = (sec === 'S' ? XHS_CODE_KEYS : XH_CODE_KEYS)[k]; if (!f) continue;
    if (f === 'u') out[sec].u = v.toUpperCase(); else { const num = parseFloat(v); if (!isNaN(num)) out[sec][f] = num; }
  }
  for (const s2 of ['P', 'A', 'S']) if (out[s2] && (out[s2].c > 8 || out[s2].c < 0)) out[s2].c = 0;
  return out.P || out.A || out.S ? out : null;
}
function codePart(x, def, keys) {
  const inv = Object.fromEntries(Object.entries(keys).map(([a, b]) => [b, a])); const parts = [];
  for (const f of Object.values(keys)) { if (f === 'u' && x.c !== 8) continue; if (x[f] !== def[f] || (f === 'u' && x.c === 8)) parts.push(inv[f], String(x[f])); }
  return parts;
}
function exportXhCode() {
  const parts = ['0', 'P', ...codePart(settings.xh, XH_DEFAULT, XH_CODE_KEYS)];
  if (settings.xhAdsOn) parts.push('A', ...codePart(settings.xhAds, XH_DEFAULT, XH_CODE_KEYS));
  const sp = codePart(settings.xhSn, XHS_DEFAULT, XHS_CODE_KEYS); if (sp.length) parts.push('S', ...sp);
  return parts.join(';');
}
function importXhCode(code) {
  const r = parseXhCode(code); if (!r) return false;
  if (r.P) settings.xh = r.P;
  if (r.A) { settings.xhAds = r.A; settings.xhAdsOn = true; }
  if (r.S) settings.xhSn = r.S;
  saveSettings(); buildXhEditor(); return true;
}

// ---------------------------------------------------------------- weapon table (武器の特性)
function buildWeaponTable() {
  const rows = [...PRIMARIES, ...SECONDARIES, 'knife'].map(k => {
    const w = WEAPONS[k], b = w.dmg[0];
    return `<tr><td><b>${w.name}</b><small>${w.cls}</small></td><td>${w.rps}${w.adsRps && w.adsRps !== w.rps ? ` / ${w.adsRps}` : ''}</td><td>${w.mag || '—'}</td><td>${w.reload || '—'}</td>`
      + `<td>${b[1]} / ${b[2]} / ${b[3]}${w.dmg.length > 1 ? '<small>' + t('wt.falloff') + '</small>' : ''}</td><td>${w.zoom ? w.zoom + 'x' + (w.zoom2 ? ' / ' + w.zoom2 + 'x' : '') : '—'}</td>`
      + `<td>${runSpeed(w).toFixed(2)}</td><td>${w.spread[0]}° / ${w.zoom ? w.spread[1] + '°' : '—'}</td><td>${w.err.join(' / ')}</td><td>${w.pen}</td></tr>`;
  }).join('');
  $('wtable').innerHTML = `<thead><tr><th>${t('wt.name')}</th><th>${t('wt.rps')}</th><th>${t('wt.mag')}</th><th>${t('wt.reload')}</th><th>${t('wt.dmg')}</th><th>${t('wt.zoom')}</th><th>${t('wt.run')}</th><th>${t('wt.spread')}</th><th>${t('wt.err')}</th><th>${t('wt.pen')}</th></tr></thead><tbody>${rows}</tbody>`;
}

// ---------------------------------------------------------------- modes list / best / history
function buildModeList() {
  const box = $('modes-lab'); box.innerHTML = '';
  for (const m of MODES.filter(x => x.group === 'lab')) {
    const b = document.createElement('button'); b.className = 'mode' + (m.id === selectedMode ? ' sel' : ''); b.type = 'button';
    b.innerHTML = `<img src="img/mode-${m.id}.webp" alt="" width="56" height="56" decoding="async"><b>${m.name}</b><span>${m.desc}</span><em class="tag">${m.tag}${m.weapon ? ' · ' + t('tag.weapon') : ''}</em>`;
    b.onclick = () => { selectedMode = m.id; settings.mode = m.id; saveSettings(); buildModeList(); showBest(); };
    box.appendChild(b);
  }
  $('drillgun-l').classList.toggle('dim', !curMode().weapon);
}
function curLabelText() {
  const m = curMode();
  if (m.id === 'dm') return `${MAP_DEFS[settings.map].name} · ${settings.botDiff.toUpperCase()} · ${settings.killGoal || '∞'}K / ${settings.minutes}:00`;
  return `${m.name} · ${$('difficulty-lab').selectedOptions[0].text} · ${settings.durationLab}s`;
}
function showBest() {
  let v = null; try { v = JSON.parse(localStorage.getItem(bestKey())); } catch (e) {}
  const h = loadHist();
  $(isLab() ? 'best-lab' : 'best').innerHTML = (v ? `<b>BEST</b> ${curLabelText()} — ${t('best.score')} <em>${v.score}</em>${v.kd != null ? ` · K/D ${v.kd}` : v.acc != null ? ` · ${v.acc.toFixed(1)}%` : ''}` : `<b>BEST</b> ${curLabelText()} — ${t('best.none')}`)
    + (h.length > 1 ? `<span class="hist-mini" title="${t('hist.title')}">${histSVG(h, 120, 26)}</span>` : '');
}
const HIST_MAX = 30;
function histKey() { return bestKey().replace('vat-best-', 'vat-hist-'); }
function loadHist() { try { const a = JSON.parse(localStorage.getItem(histKey())); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function pushHist(score, acc) { const h = loadHist(); h.push({ s: score, a: acc == null ? null : +acc.toFixed(1), d: Date.now() }); try { localStorage.setItem(histKey(), JSON.stringify(h.slice(-HIST_MAX))); } catch (e) {} }
function histSVG(h, w, ht, axis) {
  const xs = h.map(r => r.s), lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || 1, pad = 3;
  const px = i => pad + (h.length === 1 ? (w - 2 * pad) / 2 : i * (w - 2 * pad) / (h.length - 1));
  const py = v => ht - pad - (v - lo) / span * (ht - 2 * pad);
  const pts = h.map((r, i) => `${px(i).toFixed(1)},${py(r.s).toFixed(1)}`).join(' ');
  const bi = xs.indexOf(hi), li = h.length - 1;
  return `<svg viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" aria-hidden="true">` + (axis ? `<line x1="${pad}" y1="${py(hi)}" x2="${w - pad}" y2="${py(hi)}" class="hist-best"/>` : '')
    + `<polyline points="${pts}" class="hist-line"/><circle cx="${px(bi)}" cy="${py(hi)}" r="2.6" class="hist-top"/><circle cx="${px(li)}" cy="${py(xs[li])}" r="3" class="hist-last"/></svg>`;
}

// ---------------------------------------------------------------- results
function showResults(complete) {
  const played = game.dur - Math.max(0, game.timeLeft); const dm = game.mode.id === 'dm';
  let rows = [], acc = null, score, kd = null, tip = '';
  const stopRate = game.shots ? game.stopShots / game.shots * 100 : 0;
  if (game.weaponMode) {
    acc = game.shots ? game.hits / game.shots * 100 : 0; const hs = game.hits ? game.headHits / game.hits * 100 : 0;
    if (dm) {
      score = game.kills * 100 + game.hsKills * 50; kd = (game.kills / Math.max(1, game.deaths)).toFixed(2);
      rows = [[t('res.rank'), `#${placement()} / ${game.bots.length + 1}`], [t('res.kd'), `${game.kills} / ${game.deaths}  (${kd})`], [t('res.hs'), `${hs.toFixed(1)}%  (${game.hsKills} ${t('res.hskills')})`],
        [t('res.acc'), `${acc.toFixed(1)}% (${game.hits}/${game.shots})`], [t('res.dmg'), `${Math.round(game.damage)}  (${(game.damage / Math.max(played, 1) * 60).toFixed(0)}/min)`], [t('res.stop'), `${stopRate.toFixed(1)}%`], [t('res.kpm'), (game.kills / Math.max(played, 1) * 60).toFixed(1)]];
    } else {
      score = Math.round(game.score);
      rows = [[t('res.kills'), `${game.kills} (HS ${game.hsKills})`], [t('res.acc'), `${acc.toFixed(1)}% (${game.hits}/${game.shots})`], [t('res.hs'), `${hs.toFixed(1)}%`], [t('res.stop'), `${stopRate.toFixed(1)}%`]];
      if (game.mode.id === 'onetap') { const avg = game.tapTimes.length ? game.tapTimes.reduce((a, b) => a + b, 0) / game.tapTimes.length : 0; rows.push([t('res.tapt'), game.tapTimes.length ? `${(avg * 1000).toFixed(0)} ms` : '—'], [t('res.tapmiss'), String(game.tapMiss || 0)]); }
    }
    if (game.shots >= 10) tip = stopRate < 60 ? t('tip.stop') : hs < 20 ? t('tip.head') : acc < 25 ? t('tip.spray') : t('tip.good');
  } else {
    score = Math.round(game.score); acc = played > 0 ? game.onTargetTime / played * 100 : 0; const fa = game.fireTime > 0 ? game.onTargetTime / game.fireTime * 100 : 0;
    rows = [[t('res.ontarget'), `${acc.toFixed(1)}%`], [t('res.fireacc'), `${fa.toFixed(1)}%`], [t('res.ontime'), `${game.onTargetTime.toFixed(2)}s / ${played.toFixed(1)}s`]];
  }
  let best = null; try { best = JSON.parse(localStorage.getItem(bestKey())); } catch (e) {}
  let isBest = false;
  if (complete && (!best || score > best.score)) { isBest = true; try { localStorage.setItem(bestKey(), JSON.stringify({ score, acc, kd })); } catch (e) {} }
  if (complete) pushHist(score, acc);
  $('results-score').textContent = score; $('results-stamp').classList.toggle('hidden', !isBest);
  $('results-title').textContent = curLabelText() + (complete ? '' : t('res.abort'));
  $('results-body').innerHTML = rows.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('') + `<div class="r"><span>${t('res.fps')}</span><b>${fps.avg.toFixed(0)}</b></div>`;
  $('results-tip').textContent = tip; $('results-tip').classList.toggle('hidden', !tip);
  const h = loadHist();
  $('results-hist').innerHTML = h.length > 1 ? `<div class="hist-head"><span>${t('hist.title')}</span><small>${t('hist.n').replace('{n}', h.length)}</small></div>${histSVG(h, 300, 46, true)}` : `<div class="hist-head"><span>${t('hist.title')}</span><small>${t('hist.first')}</small></div>`;
  $('share-x').classList.toggle('hidden', !complete);
  $('share-x').onclick = () => {
    const what = dm ? `DEATHMATCH / ${MAP.name}` : game.mode.name;
    const txt = t('share.text').replace('{mode}', what).replace('{score}', score).replace('{extra}', dm ? ` / ${game.kills}K ${game.deaths}D` : acc != null ? ` / ${acc.toFixed(1)}%` : '');
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(location.origin + location.pathname)}`, '_blank', 'noopener,width=600,height=500');
  };
  $('results').classList.remove('hidden'); showBest();
}

// ---------------------------------------------------------------- key bindings
const KEYBIND = { waiting: null };
function buildKeybinds() {
  const box = $('keybinds'); box.innerHTML = '';
  for (const act of KEY_ACTIONS) {
    const row = document.createElement('div'); row.className = 'kb';
    row.innerHTML = `<span>${t('kb.' + act)}</span><button type="button" data-act="${act}">${keyName(settings.keys[act])}</button>`;
    row.querySelector('button').addEventListener('click', (ev) => { ev.preventDefault(); startRebind(act, ev.currentTarget); });
    box.appendChild(row);
  }
  renderKeyHints();
}
function startRebind(act, btn) { if (KEYBIND.waiting) KEYBIND.waiting.btn.textContent = keyName(settings.keys[KEYBIND.waiting.act]); KEYBIND.waiting = { act, btn }; btn.textContent = t('kb.press'); btn.classList.add('wait'); }
function finishRebind(code) {
  const w = KEYBIND.waiting; if (!w) return; KEYBIND.waiting = null; w.btn.classList.remove('wait');
  if (code !== 'Escape') { for (const a of KEY_ACTIONS) if (a !== w.act && settings.keys[a] === code) settings.keys[a] = ''; settings.keys[w.act] = code; saveSettings(); }
  buildKeybinds();
}
window.addEventListener('keydown', (e) => { if (KEYBIND.waiting) { e.preventDefault(); e.stopImmediatePropagation(); finishRebind(e.code); } }, true);
window.addEventListener('mousedown', (e) => { if (KEYBIND.waiting && e.target === KEYBIND.waiting.btn) { e.preventDefault(); finishRebind('Mouse' + e.button); } }, true);
window.addEventListener('wheel', (e) => { if (KEYBIND.waiting && e.target === KEYBIND.waiting.btn) { e.preventDefault(); finishRebind(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); } }, { capture: true, passive: false });
function renderKeyHints() {
  const k = a => `<kbd>${keyName(settings.keys[a])}</kbd>`;
  $('keys-dm').innerHTML = [`${k('forward')}${k('left')}${k('back')}${k('right')} ${t('kb.move')}`, `${k('walk')} ${t('kb.walk')}`, `${k('crouch')} ${t('kb.crouch')}`, `${k('jump')} ${t('kb.jump')}`, `${k('fire')} ${t('kb.fire')}`, `${k('ads')} ${t('kb.ads')}`, `${k('reload')} ${t('kb.reload')}`, `${k('primary')}${k('secondary')}${k('knife')} ${t('kb.slots')}`, `${k('scoreboard')} ${t('kb.scoreboard')}`, `${k('restart')} ${t('kb.restart')}`, `<kbd>ESC</kbd> ${t('k.menu')}`].map(x => `<div>${x}</div>`).join('');
  $('keys-lab').innerHTML = [`${k('fire')} ${t('k.fire.lab')}`, `${k('forward')}${k('left')}${k('back')}${k('right')} ${t('kb.move')}`, `${k('restart')} ${t('kb.restart')}`, `<kbd>ESC</kbd> ${t('k.menu')}`].map(x => `<div>${x}</div>`).join('');
  const n = a => keyName(settings.keys[a]);
  $('h-keys').textContent = ` · ${n('walk')} ${t('kb.walk')} · ${n('crouch')} ${t('kb.crouch')} · ${n('jump')} ${t('kb.jump')} · ${n('scoreboard')} ${t('kb.scoreboard')} · ESC ${t('k.menu')}`;
}

// ---------------------------------------------------------------- menu mode switch, guide, boot
function setMenuMode(mm) {
  settings.menuMode = mm; saveSettings();
  document.querySelectorAll('.ms').forEach(b => b.classList.toggle('on', b.dataset.mm === mm));
  $('pane-dm').classList.toggle('hidden', mm !== 'dm'); $('pane-lab').classList.toggle('hidden', mm !== 'lab');
  if (curMode().group !== mm) { selectedMode = mm === 'dm' ? 'dm' : (MODES.find(x => x.id === settings.lastLab) || MODES[1]).id; }
  if (mm === 'lab') settings.lastLab = selectedMode;
  buildModeList(); showBest();
}
const GUIDE = { i: 0, n: document.querySelectorAll('#guide .g-step').length };
function guideGo(i) {
  GUIDE.i = clamp(i, 0, GUIDE.n - 1);
  document.querySelectorAll('#guide .g-step').forEach((s, k) => s.classList.toggle('hidden', k !== GUIDE.i));
  document.querySelectorAll('#guide .g-dots i').forEach((d, k) => d.classList.toggle('on', k === GUIDE.i));
  $('g-prev').disabled = GUIDE.i === 0; $('g-next').textContent = t(GUIDE.i === GUIDE.n - 1 ? 'guide.done' : 'guide.next');
}
function guideOpen() { document.querySelectorAll('#guide img[data-src]').forEach(i => { i.src = i.dataset.src; i.removeAttribute('data-src'); }); guideGo(0); $('guide').classList.remove('hidden'); $('g-next').focus(); }
function guideClose() { $('guide').classList.add('hidden'); try { localStorage.setItem('vat-guide-seen', '1'); } catch (e) {} }
function relabel() { buildModeList(); buildKeybinds(); buildXhEditor(); buildWeaponTable(); updateSensInfo(); updateMapInfo(); showBest(); guideGo(GUIDE.i); }

fillWeaponSelects(); loadSettings();
applyLang(settings.lang || ((navigator.language || '').startsWith('ja') ? 'ja' : 'en'));
selectedMode = MODES.some(m => m.id === settings.mode) ? settings.mode : 'dm';
buildMap(settings.map);   // the menu shows the selected map behind it
game.px = SPAWNS.length ? SPAWNS[0][0] : 0; game.pz = SPAWNS.length ? SPAWNS[0][1] : 0;
for (const id of [...SEL, 'dpi', 'sens', 'scoped', 'invert', 'shootBack', 'difficulty-lab', 'duration-lab', 'outline', 'viewmodel', 'speedo-chk', 'footsteps', 'volume']) $(id).addEventListener('input', readSettings);
for (const id of ['map', 'bots', 'botDiff', 'botMove', 'killGoal', 'minutes', 'shootBack', 'difficulty-lab', 'duration-lab']) $(id).addEventListener('change', () => { readSettings(); showBest(); });
$('map').addEventListener('change', () => { buildMap(settings.map); game.px = SPAWNS[0][0]; game.pz = SPAWNS[0][1]; });
$('conv-game').addEventListener('input', conv); $('conv-in').addEventListener('input', conv);
$('conv-apply').addEventListener('click', () => { const v = conv(); if (v) { $('sens').value = +v.toFixed(3); readSettings(); } });
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
$('xh-import').addEventListener('click', () => { $('xh-msg').textContent = t(importXhCode($('xh-code').value) ? 'xh.ok' : 'xh.bad'); });
$('xh-export').addEventListener('click', () => { const c = exportXhCode(); $('xh-code').value = c; try { navigator.clipboard.writeText(c); $('xh-msg').textContent = t('xh.copied'); } catch (e) {} });
$('xh-reset').addEventListener('click', () => { settings[xhProf] = xhProf === 'xhSn' ? { ...XHS_DEFAULT } : { ...XH_DEFAULT }; saveSettings(); buildXhEditor(); });
document.querySelectorAll('#xh-prof button').forEach(b => b.addEventListener('click', () => { xhProf = b.dataset.p; buildXhEditor(); }));
document.querySelectorAll('#xh-bg button').forEach(b => b.addEventListener('click', () => { settings.xhBg = b.dataset.bg; saveSettings(); document.querySelectorAll('#xh-bg button').forEach(x => x.classList.toggle('on', x === b)); drawPreview(); }));
document.querySelectorAll('#xh-bg button').forEach(x => x.classList.toggle('on', x.dataset.bg === settings.xhBg));
$('xh-adson').addEventListener('input', () => { settings.xhAdsOn = $('xh-adson').checked; if (settings.xhAdsOn && JSON.stringify(settings.xhAds) === JSON.stringify(XH_DEFAULT)) settings.xhAds = { ...settings.xh }; saveSettings(); buildXhEditor(); });
$('xh-preset').addEventListener('input', () => { const v = $('xh-preset').value; if (!v) return; const r = parseXhCode(XH_PRESETS[v]); settings[xhProf] = r && r.P ? r.P : { ...XH_DEFAULT }; saveSettings(); buildXhEditor(); $('xh-preset').value = v; });
$('xh-demo').addEventListener('input', () => setDemo($('xh-demo').checked));
$('open-xh').addEventListener('click', () => { document.querySelector('[data-tab="tab-xh"]').click(); $('tab-xh').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('keys-reset').addEventListener('click', () => { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); buildKeybinds(); });
document.querySelectorAll('.ms').forEach(b => b.addEventListener('click', () => setMenuMode(b.dataset.mm)));
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => { settings.lang = b.dataset.lang; applyLang(settings.lang); saveSettings(); relabel(); }));
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.id !== b.dataset.tab)); if (b.dataset.tab === 'tab-xh') refreshXh(false); }));
const go = async () => { startRun(); await requestLock(); };
$('start').addEventListener('click', go); $('start-lab').addEventListener('click', go); $('again').addEventListener('click', go);
$('close-results').addEventListener('click', () => $('results').classList.add('hidden'));
$('open-guide').addEventListener('click', guideOpen);
$('g-prev').addEventListener('click', () => guideGo(GUIDE.i - 1));
$('g-next').addEventListener('click', () => GUIDE.i === GUIDE.n - 1 ? guideClose() : guideGo(GUIDE.i + 1));
$('g-skip').addEventListener('click', guideClose);
$('guide').addEventListener('click', (e) => { if (e.target.id === 'guide') guideClose(); });
document.querySelectorAll('#guide [data-pick]').forEach(b => b.addEventListener('click', () => { setMenuMode(b.dataset.pick); guideGo(GUIDE.i + 1); }));
window.addEventListener('keydown', (e) => { if ($('guide').classList.contains('hidden')) return; if (e.key === 'Escape') guideClose(); else if (e.key === 'ArrowRight') $('g-next').click(); else if (e.key === 'ArrowLeft') guideGo(GUIDE.i - 1); });
canvas.addEventListener('click', async () => { if (game.running && !locked) await requestLock(); });
setMenuMode(settings.menuMode === 'lab' ? 'lab' : 'dm');
relabel();
let guideSeen = false; try { guideSeen = !!localStorage.getItem('vat-guide-seen'); } catch (e) {}
if (!guideSeen) guideOpen();
requestAnimationFrame(frame);
