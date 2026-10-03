# SIEGE AIM TRAINER — 引き継ぎメモ（クラウドセッションの要約）

ブラウザで動く R6S（Rainbow Six Siege）風エイムトレーナー。静的サイト（`index.html` / `app.js` / `i18n.js` / `config.js` / `style.css`）。
公開 URL: https://xs288120.xsrv.jp/R6SAIM/（Xserver、メイン）／ https://raychil0328.github.io/https-github.com-inoueyuta0328-beep-siege-aim-lab/（GitHub Pages）
`main` に push すると `.github/workflows/deploy-xserver.yml` が Xserver へ SSH + rsync で転送し、`deploy.yml` が `gh-pages` ブランチへ公開する。

## オーナーの方針（これまでの会話で確定したこと）
- **実在マップの再現はやめた。** r6maps トレース → ゲームデータ抽出（Oregon）まで試したが「再現度がひどい」と判断し全削除。以後は**完全オリジナルの室内マップ**のみ。Ubisoft のゲームメッシュは公開しない（派生データも不要になった）。
- マップは「広い部屋にオブジェクト」ではなく **5〜7 m の小部屋を格子状に刻み、ずらしたドアで繋ぐ**。カバーは**頭だけ出る高さ**を基本にする。
- メニューは「MAP COMBAT（マップを選ぶだけ。シナリオ一覧は不要）」と「DRILLS（リコイルなしの動体視力・シンプルエイム）」の 2 本。**「AIM LAB」という表記は使わない**（既存製品と名前が被る）。製品名は SIEGE AIM TRAINER。
- 日本語 / 英語 UI。全文字列は `i18n.js`、要素は `data-i18n` / `data-i18n-html`、JS は `t(key)`。
- ADS・リーンの動きは「もっさり」が正解（速すぎると指摘された）。リコイルは最初の実装の 2 倍。
- 根拠のない数値を「再現」と言わない。出典がない値は設定で選べるようにして、注記に「公開値なし」と書く。
- BOT の湧きは被らない・偏らないこと（倒した直後に同じ場所、5 体が同じ場所、はダメ）。
- オブジェクトが「じゃま」になりすぎないよう密度設定あり。
- 会話は日本語。コミット末尾の Co-Authored-By / Claude-Session 行は付けるが、モデル名をコード・コミット本文に書かない。

## 主要な設計値（app.js）
- **感度**: 腰だめ yaw[deg/count] = 水平感度 × MSMU × (180/π)/200（MSMU 0.02 で感度 1 あたり 0.005729°）。ADS = 腰だめ × clamp((ADS感度 × XFactorAiming) × 光学補正, 0, 1)。光学補正(感度) 1x 0.6 / ACOG 0.35、ADS FOV 補正 1x 0.9 / ACOG 0.35（Ubisoft 公式 "FOV and Input Sensitivity"）。1.5/2/3/12x は 1x と 2.5x を通る曲線で補間（`OPTIC`）。
- **キャラ寸法 `opGeom`**: 頭の中心 = 目線高さ（立ち 1.60 m / しゃがみ 1.05 m）、頭半径 0.15、体カプセル 0.20〜1.43 m。BOT サイズ s/m/l は幅のみ（×0.75 / 1 / 1.3）、高さ不変。
- **カバー高さ**: `HG = 1.45`（立ち BOT の頭だけ出る）、`CG = 0.95`（しゃがみ BOT の頭だけ出る）、`TALL = 2.4`（射線を切るラック）、全高の壁 = `ROOM.h`。
- **移動 `MOVE`**: 通常 3.10 m/s、ダッシュ 5.00 m/s（3 スピード OP の計測値、Steam ガイド "Movement Speeds"）、しゃがみ 1.55。ADS 中の倍率（既定 0.92 = 2.85 m/s）と歩行キー速度（既定 1.55）は**公開値がないため設定項目**。ダッシュでリーン解除、しゃがみからダッシュで立つ。ADS 遷移 0.32〜0.55 s、リーン速度 5.5。
- **武器**: 汎用 AR 800 RPM / 30 発 / 胴 40 頭 100 / リロード 2.4 s。リコイルは視点が跳ね上がり自動復帰なし。`settings.recoil` 倍率。弾薬 mag / infinite。
- **サイト**: 12 種を実画像から SVG で描画（`SIGHTS`, `reticleSVG`, `scopeSVG` など）。ハウジングの外側は世界が見える。ACOG のシェブロン先端 = 照準点。
- **キーバインド**: `DEFAULT_KEYS`（forward/back/left/right/sprint/crouch/leanL/leanR/walk/fire/ads/reload/restart）。`pressCode/releaseCode/isDown`。マウスは `Mouse0`〜`Mouse4`。操作タブで変更、`settings.keys` に保存。
- **設定保存**: `localStorage['sal-settings']`。ベストスコアは `sal-best-<mode>[-<map>]-<diff>-<dur>`。

## マップシステム
- `MAPS[key] = { name(get→t), room{xmin,xmax,zmin,zmax,h}, spawn{x,z,yaw}, zones:'dist', build() }`。`hall` は DRILLS 用の内部マップ（一覧に出さない）。
- ヘルパ: `cells({xs, zs, doorsX:[[z,x]], doorsZ:[[x,z]], gapsX, gapsZ})` で格子の全高壁を生成（ドア幅 1.2 m）。`lowX/lowZ`（kind 'cover' の半壁）、`box(x,z,w,d,h,kind,tier)`（tier 1 常時 / 2 標準 / 3 すべて = `settings.objects`）、`piece(cx,cz,type)`（lx/lz/lx2/lz2/hg/cg/tall/tallx/desk/deskz/cab/pil）、`pieces([...])`。
- 現在のマップ: `ware`（ウェアハウス 5×5 室 + ドック）、`office`（5×5 室 + ロビー）、`bunker`（7×4 室 + 後方ギャラリー）、`atrium`（中央ホール + 両側ショップ）。
- 注意: 幅 4 m の部屋に 2 m の半壁（lx2/lz2）を横置きすると両脇が 0.8 m になり通れない（プレイヤー半径 0.38）。6 m 幅で 3 m 壁は OK。ドア正面にカバーを置かない。
- BOT: `coverSpots(zone)`（プロップ裏 hide + 両端 peek、ドア脇、床グリッド）、`spreadPick`（他 BOT・死体・直近 12 s の湧き/死亡地点・プレイヤーから `MIN_SEP = 4.5 m` 以上、遠い半分からランダム）、ゾーンが混んでいれば全体から借りる。`spawnPattern` は 1000 通りのシード付き初期配置。`Bot` 状態機械: hide / peek / headpeek / return / move。
- 動線: `near` < 10 m、`mid` 8〜18 m、`far` ≥ 16 m（スポーンからの距離、`zones:'dist'`）。

## テスト方法（Playwright + headless Chromium）
- ローカル HTTP サーバーを立て、`page.evaluate(() => startRun())` で開始（START クリックはフルスクリーンで固まる）。
- 検証項目の例: 全マップ × 密度 3 段階で、`posFree(spawn)`、ドアが塞がれていないか、スポーンからの 0.25 m 格子 flood fill で到達率 100%、BOT 10 体の最小間隔、3000 ステップ `bot.update` 後に stuck / 壁内の BOT がゼロ、40 回キル→リスポーンで死亡地点から ≥ 4.7 m。
- キーバインド: 再割当・競合解消・Esc キャンセル・リロード後の永続化・Mouse4 割当を確認済み。

## 任意機能（config.js）
- `goatcounter`: GoatCounter サイトコード。PV / ユニーク + プレイ開始イベント `run/combat/<map>`, `run/<drill>`。
- `donate`: 支援リンク（フッターとリザルトに表示）。空なら何も読み込まれない。

## 未着手・提案済み
- スコアを X に共有するボタン、OGP 画像と説明文、独自ドメイン化。
- マネタイズ上の注意: SIEGE の名称を冠したまま収益化すると商標リスク。投げ銭までは問題になりにくい。広告は GitHub Pages 規約と AdSense 審査の都合で独自ドメイン + 別ホスティングが必要。

## 会話の時系列（要約）
1. R6S 風ブラウザ KovaaK: フルスクリーン・ポインタロック・FPS 無制限・生マウス入力・R6S 感度完全再現・トラッキング / 動体視力 → 公開（private リポジトリでは Pages 不可 → 公開リポジトリ作成）。
2. マップ戦の追加: 移動（WASD/ダッシュ/しゃがみ/リーン）、カバーを使う BOT、リコイル、汎用武器、近/中/遠距離。射撃側にもオブジェクト。
3. メニュー改善、リーンのホールド/トグル、BOT 数、12 種サイトの再現、弾薬無限、ダッシュでリーン解除、リコイル強度設定、リコイル 2 倍。
4. マップ再現の試行（クラブハウス地下・バンク地下・オレゴン → r6maps トレース → ゲームデータ抽出 obj2map）と、ADS/リーンのもっさり化、しゃがみからダッシュ、1000 通り湧きパターン、BOT サイズ、ヘッドライン高さの修正（頭中心 = 目線）。
5. 湧き被り対策（最遠点法）、オブジェクト密度、メニューを MAP COMBAT / AIM LAB に分割。
6. **全マップ削除 → 完全オリジナル室内マップ 4 種**（頭出し高さのカバー）→ 小部屋に刻む → 湧きの均等化 + KILL / HEADSHOT 表示。
7. 日本語 / 英語 UI、AIM LAB → DRILLS 改名、マップ戦シナリオ一覧を廃止。
8. 歩行キー（Alt）と ADS 中の移動速度（設定化、出典明記）。
9. サイト選択を上部へ、キーバインド変更機能。
10. アクセス解析・支援リンク（config.js）、マネタイズの検討。

## ローカル開発・デプロイ
- ビルド不要。`python -m http.server 8080` → http://localhost:8080（`.claude/launch.json` に `siege-aim-lab` として登録済み）。
- Xserver: サーバー xs288120（sv16593.xserver.jp）。デプロイは SSH（ポート 10022、ユーザー xs288120）+ rsync で `xs288120.xsrv.jp/public_html/R6SAIM/` へ。FTP は国外 IP（GitHub Actions）から接続できないため使わない。Secret `XSERVER_SSH_KEY`（パスフレーズなし ed25519、ラベル siege-aim-deploy）。SSH 設定の国外アクセス制限は OFF が必要。ドメインのトップ（`xs288120.xsrv.jp/`）と `/skirmish1/`（GGSPACE）は別サイトなので触らない。`horameter.com` / `typenova.jp` はこのアプリに使わない。
- CLAUDE.md / README.md / `.claude/` / `.github/` は Xserver に上げない。
- push はオーナーの指示があるときだけ。
