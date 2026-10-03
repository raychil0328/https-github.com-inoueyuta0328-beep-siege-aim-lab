# SIEGE AIM LAB

Rainbow Six Siege の感度・ADS 倍率を忠実に再現した、ブラウザ動作のトラッキングエイム / 動体視力トレーナー（KovaaK's 風）。

**公開 URL:** https://raychil0328.github.io/https-github.com-inoueyuta0328-beep-siege-aim-lab/

## 特徴

- **360Hz+ 対応** — 描画は `requestAnimationFrame` でモニターのリフレッシュレートに同期（フレームキャップなし）。`desynchronized` キャンバスで合成遅延も最小化。
- **生マウス入力** — Pointer Lock (`unadjustedMovement: true` = OS 加速無効) + `pointerrawupdate` / `getCoalescedEvents` で、1000〜8000Hz ポーリングの全イベントを取りこぼさず反映。
- **フルスクリーン** — プレイ開始時に自動でフルスクリーン化 + マウスキャプチャ。
- **R6S 感度の完全再現** — ゲーム内設定と `GameSettings.ini` の値をそのまま入力:
  - 水平 / 垂直感度 (1–100)、`MouseSensitivityMultiplierUnit`、`XFactorAiming`
  - 倍率別 ADS 感度 (1.0x / 1.5x / 2.0x / 2.5x / 3.0x / 12.0x)
  - サイト 8 種を個別に描画: Holo (65MOA リング+ドット) / Red Dot / Reflex / 1.5x / 2.0x デュプレックス / 2.5x ACOG シェブロン / 3.0x ミルティック / 12x ミルドット。レティクル色 8 色
  - 垂直 FOV (60–90)、ADS 時の FOV 縮小もゲームと同じ倍率計算
- **COMBAT シナリオ** — 近距離 / 中距離 / 遠距離 / Mixed
  - マップ選択: トレーニングホール (60m) / **オレゴン 1F（r6maps.com のフロアプランから壁をトレース、17.6 px/m、家具は自動検出・高さは推定）** / クラブハウス地下・オレゴン地下・バンク地下（記憶ベースの概略。精度は低い）。壁・ドア・家具がカバーとして機能し、BOT はドア枠や家具の陰からピークする
  - BOT の湧きパターンはマップごとに 1000 通り（シード生成）から毎回ランダムに選択。HUD にパターン番号を表示
  - 木箱・壁・柱のあるホールで、カバー間を歩行/ダッシュ移動 → ピーク(ストレイフ・リーン・しゃがみ頭出し) → 隠れる、を繰り返す BOT (HP100 / ヘッドショット即死 / リスポーン)
  - プレイヤーも移動可能: WASD / Shift ダッシュ (5.3 m/s) / C しゃがみ / Q,E リーン / ADS 時減速 — オブジェクトとの衝突あり
  - 汎用 AR 1種: 800 RPM · 30 発 · 胴 40 / 頭 100 · リロード 2.4s · 腰だめ拡散 / ADS 精密（弾薬無限設定あり）
  - BOT 数 1〜10 を選択可、リーンはホールド/トグル切替
  - **シージ式リコイル**: 射撃ごとに視点そのものが跳ね上がり、自動復帰しない (自分でマウスを下げて抑える)。縦→右→左の汎用パターン。強度 ×0〜×2 を選択可
  - ダッシュするとリーンは自動解除（シージ準拠）
- **TRACKING シナリオ** (レーザー・リコイルなし)
  - Smooth Tracking / Reactive Strafe (R6S ピーク・しゃがみ・リーン模倣) / Air Tracking / Dynamic Vision (動体視力) / Flick + Track / Micro Dot Track

## 計算式

```
腰だめ yaw [deg/count] = 水平感度 × MouseSensitivityMultiplierUnit × (180/π) / 200
                        (既定 MSMU=0.02 → 感度1あたり 0.005729°/count)
ADS yaw                = 腰だめ yaw × min(max((ADS感度 × XFactorAiming) × 光学補正, 0), 1)
                         光学補正(感度): 1x = 0.6, ACOG = 0.35   ※ Ubisoft 公式 "FOV and Input Sensitivity" より
ADS 垂直FOV            = FOV × 光学補正(FOV)   1x(Holo/RedDot/Reflex) = 0.9（-10%）, ACOG = 0.35
                         1.5x / 2.0x / 3.0x / 12x は公開値がないため 1x と 2.5x を通る曲線で補間
cm/360                 = 2.54 × 360 / (yaw × DPI)
```

例: 800 DPI / 感度 10 / MSMU 0.02 → 0.0573°/count → **19.95 cm/360**。

## 操作

| 操作 | 内容 |
|---|---|
| 左クリック（ホールド） | 射撃（COMBAT: フルオート+リコイル / TRACKING: レーザー） |
| 右クリック | ADS（ホールド / トグル切替可） |
| W A S D | 移動 |
| Shift | ダッシュ（前進時のみ・ADS 中不可） |
| C / Ctrl | しゃがみ（トグル / ホールド切替可） |
| Q / E | リーン |
| R | リロード |
| BackSpace | リスタート |
| ESC | メニューへ戻る |

## ローカル実行

静的ファイルのみなので任意の HTTP サーバーで動作します:

```
python3 -m http.server 8080
```

## デプロイ

`main` ブランチ が更新されると `.github/workflows/deploy.yml` が GitHub Pages へ自動デプロイします。
