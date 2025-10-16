# Novel Demo (Tyrano + Pixi/GSAP/Howler デモ)

## 概要
このプロジェクトは TyranoScript を型枠にし、外部JSで演出（パーティクル、波紋、テキストアニメ、BGMフェード、ステージ切替など）を実演するデモです。  
フォントには Google Fonts の **Kiwi Maru** を使用しています。

## 必要なもの
- Node/Python 不要（だが簡易HTTPサーバーが必要）
- ブラウザ（Chrome/Firefox 推奨）
- Tyrano 本体（以下手順参照）
- 画像・BGM を `data/image/` `data/bgm/` に配置

## Tyrano の設置方法
1. TyranoScript の公式配布（GitHub など）から Tyrano の `tyrano/` フォルダをダウンロードしてください。  
   （例: TyranoEngine の zip を展開し `tyrano` フォルダをプロジェクト直下に置く）
2. 本リポジトリ構成のまま `index.html` が Tyrano を読み込む想定です。

> ※ Tyrano の配布先やファイル名が違う場合は `index.html` の `<script src="tyrano/...">` を適宜編集してください。

## 実行方法（ローカル）
1. プロジェクトディレクトリに移動
2. 簡易HTTPサーバーを起動（例）:
   - Python 3: `python -m http.server 8000`
3. ブラウザで `http://localhost:8000/` を開く

## ファイル説明
- `index.html` : エントリ（Tyrano 読み込み・ライブラリ読み込み・UI カスタム）
- `style.css` : UI（メッセージ枠、フォント、ボタン等）
- `data/scenario/first.ks` : デモのシナリオ（会話・選択・ステージ切替）
- `data/others/plugin/custom_effects.js` : Pixi / GSAP / Howler を使った共通関数群
- `data/image/` : 画像をここに格納（ユーザーが用意）
- `data/bgm/` : BGM をここに格納（ユーザーが用意）

## 質問・カスタム
- フォントやメッセージ枠の調整、Live2D 組み込み、追加エフェクトなど、必要ならファイルを追加修正します。
