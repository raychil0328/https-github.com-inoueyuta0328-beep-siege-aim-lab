/* UI strings. Elements carry data-i18n="key" (textContent) or data-i18n-html="key" (innerHTML); JS uses t(key). */
const I18N = {
  ja: {
    'title': 'SIEGE AIM TRAINER — R6S Aim Trainer',
    'hdr.sub': 'R6S 感度・移動・リコイル再現 / トラッキング & 動体視力 / 近・中・遠距離 BOT 戦 — ブラウザで 360Hz+',
    'ms.combat': 'MAP COMBAT', 'ms.combat.d': '本格トレーニング — 室内マップ · 移動 · リコイル · カバーを使う BOT',
    'ms.drills': 'DRILLS', 'ms.drills.d': '動体視力・シンプルエイム — リコイルなし · 時間追従で採点',
    'combat.h2': 'マップ戦', 'combat.h2s': '移動 · 射撃 · リコイル · カバー BOT — マップを選んで出撃',
    'combat.settings': 'マップ戦の設定',
    'lbl.map': 'マップ', 'map.ware': 'ウェアハウス（倉庫）', 'map.office': 'オフィス', 'map.bunker': 'バンカー', 'map.atrium': 'アトリウム', 'map.hall': 'トレーニングホール',
    'lbl.objects': 'オブジェクト密度', 'obj.large': '標準（主要カバーのみ）', 'obj.all': 'すべて', 'obj.none': '最小（壁 + 頭出しカバーのみ）',
    'lbl.bots': 'BOT 数', 'bots.auto': '自動（4）',
    'lbl.botsize': 'BOT サイズ', 'bs.s': '小（幅 ×0.75）', 'bs.m': '中（標準）', 'bs.l': '大（幅 ×1.3）',
    'lbl.diff': '難易度', 'lbl.diff.lab': '難易度（速さ）', 'lbl.dur': '時間',
    'lbl.recoil': 'リコイル強度', 'rc.0': 'なし', 'rc.05': '弱 (×0.5)', 'rc.075': 'やや弱 (×0.75)', 'rc.1': '標準 (×1.0)', 'rc.125': 'やや強 (×1.25)', 'rc.15': '強 (×1.5)', 'rc.2': '非常に強 (×2.0)',
    'lbl.ammo': '弾薬', 'ammo.mag': '30 発 + リロード', 'ammo.inf': '無限（リロードなし）',
    'start.sub': 'クリックでフルスクリーン ＆ マウスロック',
    'k.move': '移動', 'k.sprint': 'ダッシュ', 'k.crouch': 'しゃがみ', 'k.lean': 'リーン', 'k.rmb': '右クリック', 'k.ads': 'ADS', 'k.reload': 'リロード', 'k.restart': 'リスタート', 'k.menu': 'メニュー', 'k.lmb': '左クリック', 'k.hold': '長押しで追従',
    'drills.h2': 'ドリル シナリオ', 'drills.h2s': 'レーザー（リコイルなし）· ターゲット上にいた時間で採点', 'drills.settings': 'ドリルの設定',
    'common.h2': '共通設定（R6S）', 'common.h2s': 'ゲーム内と同じ値を入力 — 両モード共通',
    'tab.sens': '感度', 'tab.ads': 'ADS 倍率別', 'tab.ctl': '操作', 'tab.formula': '計算式',
    'lbl.dpi': 'マウス DPI', 'lbl.fov': 'FOV（垂直, 60–90）', 'lbl.sensH': '水平感度 (1–100)', 'lbl.sensV': '垂直感度 (1–100)',
    'lbl.sight': '使用サイト', 'lbl.reticle': 'レティクル色',
    'sight.holo': '1.0x Holo A（EOTech 型）', 'sight.holob': '1.0x Holo B（Y5S3 追加型）', 'sight.holoru': '1.0x ロシアンホロ', 'sight.reddot': '1.0x Red Dot A（チューブ型）', 'sight.reddotb': '1.0x Red Dot B（Y5S3 追加型）', 'sight.reflex': '1.0x Reflex A（ドット）', 'sight.reflexb': '1.0x Reflex B（三角）', 'sight.1.5': '1.5x', 'sight.2': '2.0x', 'sight.2.5': '2.5x ACOG', 'sight.3': '3.0x', 'sight.12': '12.0x（CSRX 300）',
    'col.red': '赤', 'col.green': '緑', 'col.blue': '青', 'col.white': '白', 'col.pink': 'ピンク', 'col.yellow': '黄', 'col.cyan': 'シアン', 'col.orange': 'オレンジ',
    'lbl.adsmode': 'ADS 操作', 'lbl.crouchmode': 'しゃがみ操作', 'lbl.leanmode': 'リーン操作 (Q/E)', 'hold': 'ホールド', 'toggle': 'トグル', 'lean.hold': 'ホールド（長押し）', 'lean.toggle': 'トグル（切り替え）', 'lbl.invert': 'マウス反転',
    'note.move': '移動速度: 歩行 3.1 m/s · ダッシュ 5.3 m/s · しゃがみ 1.55 m/s · ADS 時 ×0.6（3スピード OP 相当）<br>武器: 汎用 AR · 800 RPM · 30 発 · 胴 40 / 頭 100 ダメージ · リロード 2.4s · リコイルは視点が跳ね上がり自動復帰なし（シージ準拠）',
    'formula': `出典: Ubisoft 公式 "FOV and Input Sensitivity"
腰だめ  yaw[deg/count] = 水平感度 × MouseSensitivityMultiplierUnit × (180/π) / 200
                        (既定 MSMU=0.02 → 感度1あたり 0.005729°/count)
ADS     yaw = 腰だめyaw × min(max((ADS感度 × XFactorAiming) × 光学補正, 0), 1)
        光学補正(感度): 1x(Holo/RedDot/Reflex/アイアン) 0.6 · ACOG 2.5x 0.35
ADS FOV = FOV × 光学補正(FOV)   1x: 0.9（-10% = ホロでも少しズーム） · ACOG: 0.35
        ※ 1.5x / 2.0x / 3.0x / 12x は公開値がないため 1x と 2.5x を通る曲線で補間
cm/360  = 2.54 × 360 / (yaw × DPI)`,
    'st.hip': '腰だめ cm/360', 'st.ads': 'ADS cm/360', 'st.fov': '垂直 FOV → ADS', 'st.fov2': '倍率で縮小',
    'res.back': 'メニューへ戻る',
    'footer': 'SIEGE AIM TRAINER はファンメイドの非公式トレーナーです。Rainbow Six Siege は Ubisoft の商標です。',
    'hud.keys': ' · WASD 移動 · Shift ダッシュ · C しゃがみ · Q/E リーン · R リロード · BackSpace リスタート · ESC メニュー',
    'hud.pattern': '湧きパターン',
    'best.score': 'スコア', 'best.none': '記録なし',
    'res.kills': 'キル', 'res.hs': 'ヘッドショット', 'res.acc': '命中率', 'res.dmg': '与ダメージ', 'res.kpm': 'キル/分',
    'res.ontarget': 'オンターゲット率（全時間）', 'res.fireacc': '命中率（射撃中）', 'res.ontime': 'オンターゲット時間', 'res.fps': '平均FPS',
    'res.abort': '（中断 — 記録は保存されません）',
    'nogl': 'WebGL2 が利用できません。Chrome / Edge / Firefox の最新版をご利用ください。',
    'mode.combat': 'Map Combat', 'mode.combat.tag': '全距離', 'mode.combat.desc': '室内マップでカバーを使う BOT と撃ち合う。',
    'mode.track.desc': 'オペレーター型ターゲットが高速で左右ストレイフ。追従時間で採点。',
    'mode.reactive.desc': 'R6S のピーク/カウンターストレイフを模した急な方向転換・しゃがみ・リーン。',
    'mode.air.desc': '上下左右＋前後に飛び回るターゲットを追い続ける。',
    'mode.vision.tag': '動体視力', 'mode.vision.desc': '5体が高速に動き回り、光る1体が切り替わる。光っている1体だけを追え。',
    'mode.flicktrack.desc': 'ターゲットがワープ→即ストレイフ。フリックから追従への切り替え。',
    'mode.microdot.desc': '小さなヘッド大のターゲットが細かく揺れる。ADS での微調整。',
  },
  en: {
    'title': 'SIEGE AIM TRAINER — R6S Aim Trainer',
    'hdr.sub': 'Exact R6S sensitivity, movement & recoil / tracking & dynamic vision / near-mid-far bot combat — 360Hz+ in the browser',
    'ms.combat': 'MAP COMBAT', 'ms.combat.d': 'Full training — indoor maps · movement · recoil · bots that use cover',
    'ms.drills': 'DRILLS', 'ms.drills.d': 'Dynamic vision & simple aim — no recoil · scored by time on target',
    'combat.h2': 'Map Combat', 'combat.h2s': 'Movement · shooting · recoil · cover bots — pick a map and deploy',
    'combat.settings': 'Combat settings',
    'lbl.map': 'Map', 'map.ware': 'Warehouse', 'map.office': 'Office', 'map.bunker': 'Bunker', 'map.atrium': 'Atrium', 'map.hall': 'Training Hall',
    'lbl.objects': 'Object density', 'obj.large': 'Standard (main cover only)', 'obj.all': 'All', 'obj.none': 'Minimal (walls + head-glitch cover)',
    'lbl.bots': 'Bots', 'bots.auto': 'Auto (4)',
    'lbl.botsize': 'Bot size', 'bs.s': 'Small (width ×0.75)', 'bs.m': 'Medium (default)', 'bs.l': 'Large (width ×1.3)',
    'lbl.diff': 'Difficulty', 'lbl.diff.lab': 'Difficulty (speed)', 'lbl.dur': 'Duration',
    'lbl.recoil': 'Recoil strength', 'rc.0': 'None', 'rc.05': 'Low (×0.5)', 'rc.075': 'Slightly low (×0.75)', 'rc.1': 'Standard (×1.0)', 'rc.125': 'Slightly high (×1.25)', 'rc.15': 'High (×1.5)', 'rc.2': 'Very high (×2.0)',
    'lbl.ammo': 'Ammo', 'ammo.mag': '30 rounds + reload', 'ammo.inf': 'Infinite (no reload)',
    'start.sub': 'Click for fullscreen & mouse lock',
    'k.move': 'Move', 'k.sprint': 'Sprint', 'k.crouch': 'Crouch', 'k.lean': 'Lean', 'k.rmb': 'Right click', 'k.ads': 'ADS', 'k.reload': 'Reload', 'k.restart': 'Restart', 'k.menu': 'Menu', 'k.lmb': 'Left click', 'k.hold': 'Hold to track',
    'drills.h2': 'Drill scenarios', 'drills.h2s': 'Laser (no recoil) · scored by time on target', 'drills.settings': 'Drill settings',
    'common.h2': 'Shared settings (R6S)', 'common.h2s': 'Enter your in-game values — shared by both modes',
    'tab.sens': 'Sensitivity', 'tab.ads': 'ADS per zoom', 'tab.ctl': 'Controls', 'tab.formula': 'Formula',
    'lbl.dpi': 'Mouse DPI', 'lbl.fov': 'FOV (vertical, 60–90)', 'lbl.sensH': 'Horizontal sens (1–100)', 'lbl.sensV': 'Vertical sens (1–100)',
    'lbl.sight': 'Sight', 'lbl.reticle': 'Reticle color',
    'sight.holo': '1.0x Holo A (EOTech style)', 'sight.holob': '1.0x Holo B (Y5S3)', 'sight.holoru': '1.0x Russian Holo', 'sight.reddot': '1.0x Red Dot A (tube)', 'sight.reddotb': '1.0x Red Dot B (Y5S3)', 'sight.reflex': '1.0x Reflex A (dot)', 'sight.reflexb': '1.0x Reflex B (chevron)', 'sight.1.5': '1.5x', 'sight.2': '2.0x', 'sight.2.5': '2.5x ACOG', 'sight.3': '3.0x', 'sight.12': '12.0x (CSRX 300)',
    'col.red': 'Red', 'col.green': 'Green', 'col.blue': 'Blue', 'col.white': 'White', 'col.pink': 'Pink', 'col.yellow': 'Yellow', 'col.cyan': 'Cyan', 'col.orange': 'Orange',
    'lbl.adsmode': 'ADS', 'lbl.crouchmode': 'Crouch', 'lbl.leanmode': 'Lean (Q/E)', 'hold': 'Hold', 'toggle': 'Toggle', 'lean.hold': 'Hold', 'lean.toggle': 'Toggle', 'lbl.invert': 'Invert mouse',
    'note.move': 'Movement: walk 3.1 m/s · sprint 5.3 m/s · crouch 1.55 m/s · ADS ×0.6 (3-speed operator)<br>Weapon: generic AR · 800 RPM · 30 rounds · 40 body / 100 head · reload 2.4 s · recoil kicks the view up and never auto-recovers (as in Siege)',
    'formula': `Source: Ubisoft "FOV and Input Sensitivity"
Hipfire yaw[deg/count] = H-sens × MouseSensitivityMultiplierUnit × (180/π) / 200
                        (default MSMU=0.02 → 0.005729°/count per sens unit)
ADS     yaw = hip yaw × min(max((ADS sens × XFactorAiming) × optic mod, 0), 1)
        optic mod (sens): 1x (Holo/RedDot/Reflex/iron) 0.6 · ACOG 2.5x 0.35
ADS FOV = FOV × optic mod (FOV)   1x: 0.9 (-10%, holo zooms slightly too) · ACOG: 0.35
        1.5x / 2.0x / 3.0x / 12x are unpublished; interpolated on a curve through 1x and 2.5x
cm/360  = 2.54 × 360 / (yaw × DPI)`,
    'st.hip': 'Hipfire cm/360', 'st.ads': 'ADS cm/360', 'st.fov': 'Vertical FOV → ADS', 'st.fov2': 'reduced by zoom',
    'res.back': 'Back to menu',
    'footer': 'SIEGE AIM TRAINER is an unofficial fan-made trainer. Rainbow Six Siege is a trademark of Ubisoft.',
    'hud.keys': ' · WASD move · Shift sprint · C crouch · Q/E lean · R reload · BackSpace restart · ESC menu',
    'hud.pattern': 'spawn pattern',
    'best.score': 'score', 'best.none': 'no record',
    'res.kills': 'Kills', 'res.hs': 'Headshots', 'res.acc': 'Accuracy', 'res.dmg': 'Damage', 'res.kpm': 'Kills/min',
    'res.ontarget': 'Time on target (whole run)', 'res.fireacc': 'Accuracy (while firing)', 'res.ontime': 'Time on target', 'res.fps': 'Avg FPS',
    'res.abort': ' (aborted — not saved)',
    'nogl': 'WebGL2 is not available. Please use the latest Chrome / Edge / Firefox.',
    'mode.combat': 'Map Combat', 'mode.combat.tag': 'ALL RANGES', 'mode.combat.desc': 'Fight bots that use cover inside an indoor map.',
    'mode.track.desc': 'Operator-shaped target strafes fast left and right. Scored by time on target.',
    'mode.reactive.desc': 'Sudden direction changes, crouches and leans that mimic R6S peeks and counter-strafes.',
    'mode.air.desc': 'Keep tracking a target that flies up, down, sideways and in depth.',
    'mode.vision.tag': 'DYNAMIC VISION', 'mode.vision.desc': 'Five targets move fast; the glowing one keeps changing. Track only the glowing one.',
    'mode.flicktrack.desc': 'Target warps, then strafes immediately. Switch from flick to tracking.',
    'mode.microdot.desc': 'A small head-sized target jitters. Fine adjustment in ADS.',
  },
};
let LANG = 'ja';
function t(k) { return (I18N[LANG] && I18N[LANG][k]) ?? I18N.ja[k] ?? k; }
function applyLang(lang) {
  LANG = I18N[lang] ? lang : 'ja'; document.documentElement.lang = LANG; document.title = t('title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
}
