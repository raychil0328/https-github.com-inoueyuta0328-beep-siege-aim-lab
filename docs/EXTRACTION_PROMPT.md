# R6S マップ 3D ジオメトリ抽出 — 作業用プロンプト

このファイルの「プロンプト本文」を、ゲームがインストールされた **Windows PC 上の Claude Code（または Cursor / Codex 等のコーディングエージェント）** に貼り付けて実行してください。
出力された OBJ ファイルを Google Drive 等で共有してもらえれば、`maps/obj2map.py` で SIEGE AIM LAB 用の壁・家具データ（実測の高さ付き）に変換します。

> **先に読んでください（法的・安全上の注意）**
> - 抽出したメッシュ／テクスチャは Ubisoft の著作物です。**個人利用の範囲**で扱い、OBJ/テクスチャそのものを公開リポジトリや公開サイトに置かないでください。公開サイトに載せるのは `obj2map.py` が生成する **「座標と高さだけの箱データ (JSON)」** に限定します。
> - **ゲーム起動中にメモリ/描画をフックするツール（NinjaRipper, RenderDoc, 3DMigoto 等）は使わないでください。** BattlEye に検知されて BAN される可能性があります。使うのは **ゲームを終了した状態でインストールフォルダ内の `.forge` アーカイブを読むオフラインツールのみ**です。
> - 抽出ツール自体は非公式のコミュニティ製です。ウイルススキャンを通し、信頼できる配布元（作者の GitHub Releases 等）から入手してください。

---

## プロンプト本文（ここから下をコピーして貼り付け）

```
あなたは Windows PC 上で作業するエンジニアです。Rainbow Six Siege（Ubisoft Connect / Steam 版）のインストール済みファイルから、
指定マップの「静的ジオメトリ（壁・床・天井・階段・家具などの当たり判定になる形状）」を OBJ メッシュとして書き出すのが目的です。
目的はエイムトレーナー用に壁・家具の位置と高さを「箱」に変換することなので、テクスチャ・マテリアル・スケルタルメッシュ・小物の装飾は不要です。

## 絶対に守ること
1. ゲームは必ず終了した状態で作業する。ゲームプロセスにアタッチ／注入するツール（NinjaRipper, RenderDoc, 3DMigoto, Cheat Engine 等）は一切使わない（アンチチート BAN のリスク）。
2. ゲームのインストールフォルダ内のファイルは一切変更・削除しない。読み取りのみ。作業はすべて別フォルダ（例: C:\r6extract）で行う。
3. 抽出したデータは個人利用に留める。私がこのあと渡すのは OBJ ファイル（と meta.json）のみ。

## 手順
### 1. 環境確認
- ゲームのインストール先を特定する（Ubisoft Connect: 通常 `C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games\Tom Clancy's Rainbow Six Siege`、Steam: `steamapps\common\Tom Clancy's Rainbow Six Siege`）。
- そのフォルダにある `*.forge` ファイル一覧とサイズを表示する（`datapc64_merged_bnk_*.forge`, `datapc64_ondemand*.forge` などが並んでいるはず）。
- Python 3.10+ と Blender 3.x/4.x（コマンドライン実行用）があるか確認し、無ければインストール手順を提示する。

### 2. 抽出ツールの準備
- Anvil エンジン（Ubisoft）の .forge アーカイブを展開できるコミュニティ製ツールを調査して用意する。候補:
  - AnvilToolkit（.forge のブラウズ／メッシュ（.obj / .fbx）エクスポートに対応したツール。GitHub の Releases を探すこと）
  - その他、"Anvil forge extractor", "Rainbow Six Siege forge unpack" で見つかる現行メンテナンスされているもの
- 入手元 URL、バージョン、ハッシュをメモし、Windows Defender でスキャンしてから使う。
- 対応していない / 現行バージョンのゲームで動かない場合は、その事実と試した内容を報告して止まる（推測で先に進まない）。

### 3. 対象マップの特定
- 対象マップ（下のリストの順）に対応するアーカイブ／エントリを探す。ファイル名やエントリ名にマップのコードネームが含まれていることが多い。
  想定されるコードネーム例: Oregon = "Oregon", Clubhouse = "ClubHouse" / "Club", Kafe = "Kafe", Bank = "Bank", Consulate = "Consulate", Border = "Border", Chalet = "Chalet", Coastline = "Coastline", Kanal = "Kanal", Villa = "Villa", Theme Park = "ThemePark", Skyscraper = "Skyscraper", Nighthaven Labs = "Nighthaven", Lair = "Lair", Emerald Plains = "Emerald", Stadium = "Stadium"
- 見つかったエントリ名の一覧（レベル／ワールド／セル／メッシュのツリー）をテキストに保存する。

### 4. ジオメトリの書き出し
- 対象マップについて、**ワールド座標に配置済み**の静的メッシュ（建物の壁・床・天井・階段・ドア枠・窓枠・固定家具・大きなプロップ）を 1 つの OBJ にまとめて書き出す。
  - ツールが「個別メッシュ + 配置トランスフォーム」しか出せない場合は、トランスフォーム（位置・回転・スケール）を適用して合成する Python/Blender スクリプトを書いて 1 ファイルに統合する。
  - 以下は除外してよい: キャラクター、武器、エフェクト、空・遠景、植生の葉、電線など当たり判定に無関係なもの。
  - 破壊可能壁・バリケード・補強対象の壁は「壁」として含める（初期状態の形状）。
- 単位はメートル。右手系で Y 軸が上（Blender の OBJ エクスポート設定: Forward -Z, Up Y）。原点はツールが出すワールド原点のまま。
- 床ごとに分けられるなら `map_floorN.obj`、分けられなければ全体を `map_all.obj` とする。

### 5. 検証（必ず実施）
- Blender（またはサイズ確認スクリプト）で OBJ を開き、次を確認して報告する:
  - 建物全体のバウンディングボックス（幅・奥行・高さ、メートル）。通常のマップは 1 辺 40〜80 m、各階の高さは約 3〜4 m。桁が違う場合はスケールを修正（cm → m なら 0.01 倍）。
  - ドア開口部の幅が約 1.2〜1.3 m、天井高が約 3 m 前後になっていること（1〜2 か所測る）。
  - 上から見たスクリーンショットと、1 階の内部を見たスクリーンショットを保存。
- `meta.json` を作成する:
  {"map": "Oregon", "unit": "m", "up": "y", "floors": [{"name": "basement", "y": -3.6}, {"name": "1F", "y": 0.0}, {"name": "2F", "y": 3.8}], "notes": "ツール名/バージョン、除外したもの、既知の問題"}
  （floors の y は各階の床面の高さ。分からなければ空配列で可）

### 6. 納品物
C:\r6extract\<MapName>\ に以下を揃え、ZIP にする:
- `<map>_all.obj`（または `_floorN.obj`）
- `meta.json`
- `entries.txt`（アーカイブ内エントリ一覧）
- `top.png`, `inside.png`（検証スクリーンショット）
- `README.txt`（使ったツールと手順、所要時間、うまくいかなかった点）
ZIP は Google Drive にアップロードして共有リンクを渡す。OBJ が 500 MB を超える場合は Blender の Decimate（Planar, 角度 5°）で面数を減らしてから出すこと（形状は変えない）。

## 対象マップ（優先順）
1. Oregon（全フロア）
2. Clubhouse
3. Kafe Dostoyevsky
4. Bank
5. Consulate / Chalet / Border（余力があれば）

## 報告フォーマット
各ステップの終わりに「できたこと／できなかったこと／次の判断が必要なこと」を箇条書きで報告する。
ツールが見つからない・動かない・ゲームのバージョンに未対応などの場合は、回避策を推測で実行せず、状況を報告して指示を待つ。
```

---

## 受け取った後にこちらでやること

```
python3 maps/obj2map.py Oregon_all.obj --name "オレゴン 1F" --out maps/oregon-1f.json --floor 1 --voxel 0.2
```

- 20 cm ボクセルで壁（床から天井まで続く柱）と家具（途中までの高さ）を分離し、実測の高さ付きの箱データにします。
- 床レベルは上向き面の高さヒストグラムから自動検出（`meta.json` の floors があればそれを使用）。
- 変換結果はフロアプラン画像とオーバーレイして位置ずれを確認してから公開します。

## 代替ルート（ゲームファイルが扱えない場合）

Sketchfab の CC-BY モデル（dok11 氏のゲーム映像フォトグラメトリ: Oregon 点群 / Kafe / Theme Park、crusader1291 氏の House）をダウンロードして同じ `obj2map.py` に通せます（PLY 点群にも対応）。ダウンロードには Sketchfab アカウントが必要です。
