/* Site configuration – fill these in to switch features on. Nothing here is loaded until a value is set. */
const SITE = {
  // Visitor / play counter: GoatCounter site code (https://www.goatcounter.com – free, no cookies, no consent banner needed).
  // Example: 'siege-aim-trainer' for https://siege-aim-trainer.goatcounter.com
  goatcounter: 'raychil',
  // Self-hosted counter on the same server (count.php, same as the VALORANT version): daily totals only, no cookies, no IP. '' = off.
  counter: 'count.php',
  // Support / donation link shown in the footer and on the results screen when set (Ko-fi, Buy Me a Coffee, GitHub Sponsors, OFUSE ...).
  donate: '',
  donateLabel: 'Support ☕',
};
// ---- analytics: GoatCounter (page views + events r6s/...) and the self-hosted counter (pv, uv, run/..., finish) ----
const TRACK_ON = location.protocol.startsWith('http') && !/^(localhost|127\.)/.test(location.hostname);   // never count local testing
function track(path) {
  if (!TRACK_ON) return;
  try { if (SITE.counter && navigator.sendBeacon) navigator.sendBeacon(`${SITE.counter}?e=${encodeURIComponent(path.replace(/^r6s\//, ''))}`); } catch (e) {}
  try { if (window.goatcounter && SITE.goatcounter && path !== 'pv' && path !== 'uv') window.goatcounter.count({ path, title: path, event: true }); } catch (e) {}
}
if (TRACK_ON) {
  track('pv');
  try { const d = new Date().toISOString().slice(0, 10); if (localStorage.getItem('sal-seen') !== d) { localStorage.setItem('sal-seen', d); track('uv'); } } catch (e) {}
}
if (SITE.goatcounter) {
  const s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${SITE.goatcounter}.goatcounter.com/count`; document.head.appendChild(s);
}
document.addEventListener('DOMContentLoaded', () => {
  if (!SITE.donate) return;
  for (const id of ['donate-footer', 'donate-results']) { const a = document.getElementById(id); if (a) { a.href = SITE.donate; a.textContent = SITE.donateLabel; a.classList.remove('hidden'); } }
});

// ---- browser notice: Chrome / Edge give raw (unaccelerated) pointer lock and pointerrawupdate; others still work
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('envwarn'); if (!box) return;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const chromium = brands.some(b => /Chromium/.test(b.brand)) || (/Chrome\//.test(ua) && !/Firefox|FxiOS|OPR\//.test(ua));
  if (!mobile && chromium) return;
  let hidden = false; try { hidden = !mobile && localStorage.getItem('env-warn-hidden') === '1'; } catch (e) {}
  if (hidden) return;
  const key = mobile ? 'env.warn.mobile' : 'env.warn.other', span = document.getElementById('envwarn-t');
  span.dataset.i18n = key; span.textContent = typeof t === 'function' ? t(key) : '';
  box.classList.remove('hidden');
  document.getElementById('envwarn-x').addEventListener('click', () => { box.classList.add('hidden'); try { localStorage.setItem('env-warn-hidden', '1'); } catch (e) {} });
});
