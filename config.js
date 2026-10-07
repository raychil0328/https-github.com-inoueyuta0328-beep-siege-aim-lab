/* Site configuration – fill these in to switch features on. Nothing here is loaded until a value is set. */
const SITE = {
  // Visitor / play counter: GoatCounter site code (https://www.goatcounter.com – free, no cookies, no consent banner needed).
  // Example: 'siege-aim-trainer' for https://siege-aim-trainer.goatcounter.com
  goatcounter: 'raychil',
  // Support / donation link shown in the footer and on the results screen when set (Ko-fi, Buy Me a Coffee, GitHub Sponsors, OFUSE ...).
  donate: '',
  donateLabel: 'Support ☕',
};
// ---- analytics (page views + one event per run: r6s/run/<mode>/<map>) ----
function track(path) { try { if (window.goatcounter && SITE.goatcounter) window.goatcounter.count({ path, title: path, event: true }); } catch (e) {} }
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
