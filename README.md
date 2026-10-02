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
  - 垂直 FOV (60–90)、ADS 時の FOV 縮小もゲームと同じ倍率計算
- **シナリオ** (すべてトラッキング / 動体視力重視)
  - Smooth Tracking / Reactive Strafe (R6S ピーク・しゃがみ・リーン模倣) / Air Tracking / Dynamic Vision (動体視力) / Flick + Track / Micro Dot Track

## 計算式

```
腰だめ yaw [deg/count] = 水平感度 × MouseSensitivityMultiplierUnit × (180/π) / 200
                        (既定 MSMU=0.02 → 感度1あたり 0.005729°/count)
ADS yaw                = 腰だめ yaw × (ADS感度 / 100) × (XFactorAiming / 0.02)
ADS 垂直FOV            = 2·atan( tan(FOV/2) / 倍率 )
cm/360                 = 2.54 × 360 / (yaw × DPI)
```

例: 800 DPI / 感度 10 / MSMU 0.02 → 0.0573°/count → **19.95 cm/360**。

## 操作

| 操作 | 内容 |
|---|---|
| 左クリック（ホールド） | 射撃（ターゲット上にいる時間でスコア加算） |
| 右クリック | ADS（ホールド / トグル切替可） |
| R | リスタート |
| ESC | メニューへ戻る |

## ローカル実行

静的ファイルのみなので任意の HTTP サーバーで動作します:

```
python3 -m http.server 8080
```

## デプロイ

`main` ブランチ が更新されると `.github/workflows/deploy.yml` が GitHub Pages へ自動デプロイします。
