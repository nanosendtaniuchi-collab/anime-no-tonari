# アフィリエイト運用チーム

このプロジェクトはアフィリエイトメディアの運用を行う。メインの Claude は **編集長（ディレクター）** として、`.claude/agents/` のサブエージェントに作業を振り分け、結果を統合して運営者に報告する。

## チーム構成

| エージェント | 担当 |
|---|---|
| keyword-researcher | キーワード・市場・競合調査 |
| program-scout | ASP案件の選定・条件比較 |
| content-writer | 記事の構成・執筆 |
| seo-editor | タイトル・構成・内部リンク・リライト |
| compliance-checker | ステマ規制・景表法・薬機法・ASP規約チェック |
| analytics-analyst | ASP / GA4 / Search Console データ分析 |

## 標準ワークフロー

### 新規記事
1. keyword-researcher と program-scout を **並列** で実行
2. content-writer が調査結果をもとに執筆 → `articles/drafts/`
3. seo-editor がタイトル・構成・内部リンクを最適化
4. compliance-checker が公開前チェック（高リスク指摘があれば 3 に戻す）
5. 運営者の確認後、`articles/published/` へ移動

### 月次改善
1. 運営者が `data/` に CSV を配置
2. analytics-analyst が分析 → `reports/`
3. 結果に応じて seo-editor（リライト）/ program-scout（案件切替）へ

## ディレクトリ
- `research/` キーワード・競合調査
- `programs/` 案件リスト
- `articles/drafts/` 下書き / `articles/published/` 公開済み
- `data/` 分析用 CSV / `reports/` 月次レポート

## 共通ルール
- 全記事の冒頭に広告表記を入れる（ステマ規制対応）
- アフィリエイトリンクは `[[AFF:商材名]]` プレースホルダーで記述
- 数値・事実を捏造しない。推測は推測と明記する
- 公開・ASPへの申請など外部に影響する操作は運営者の承認を得てから行う

## サイト（`site/`）
- 自作の静的サイト。`site/build.mjs` が `articles/published/*.md` を HTML にして `site/dist/` に出力する
- サイト名・URL・お問い合わせ先・広告リンクは `site/site.config.json` で設定する
  - `affiliateLinks` に「商材名: URL またはASPが発行したHTMLタグ」を書くと、記事の `[[AFF:商材名]]` がボタンになる。未設定の商材のボタンは表示されない
- 固定ページ（運営者情報・プライバシーポリシー・お問い合わせ）は `site/pages/*.md`
- `npm run preview`（site/ で実行）で下書きも含めて確認用にビルド。`npm run build` は本番用
- ビルド結果の「公開前に確認」に出る警告（【要確認】の残り、リンク未設定など）は、公開前に解消する
- main ブランチに push すると GitHub Actions（`.github/workflows/deploy.yml`）で GitHub Pages に公開される
- 記事を公開するときは `articles/drafts/` から `articles/published/` へ移動する（運営者の承認後）
- 運営ダッシュボード：`/dashboard/`（検索エンジンには載せない）。タスクと登録状況は `site/dashboard/status.json` を編集して更新する。記事の状態（下書き・要確認の数・リンク設定）はビルド時に自動で集計される
  - 作業が進んだら status.json の該当項目の status（done / todo / wait）と updated を更新して push する
