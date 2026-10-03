/* Site configuration – fill these in to switch features on. Nothing here is loaded until a value is set. */
const SITE = {
  // Visitor / play counter: GoatCounter site code (https://www.goatcounter.com – free, no cookies, no consent banner needed).
  // Example: 'siege-aim-trainer' for https://siege-aim-trainer.goatcounter.com
  goatcounter: '',
  // Support / donation link shown in the footer and on the results screen when set (Ko-fi, Buy Me a Coffee, GitHub Sponsors, OFUSE ...).
  donate: '',
  donateLabel: 'Support ☕',
};
// ---- analytics (page views + one event per run: run/<mode>/<map>) ----
function track(path) { try { if (window.goatcounter && SITE.goatcounter) window.goatcounter.count({ path, title: path, event: true }); } catch (e) {} }
if (SITE.goatcounter) {
  const s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${SITE.goatcounter}.goatcounter.com/count`; document.head.appendChild(s);
}
document.addEventListener('DOMContentLoaded', () => {
  if (!SITE.donate) return;
  for (const id of ['donate-footer', 'donate-results']) { const a = document.getElementById(id); if (a) { a.href = SITE.donate; a.textContent = SITE.donateLabel; a.classList.remove('hidden'); } }
});
