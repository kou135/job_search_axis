# 就活企業ナレッジベース構築エージェント

## 1. コンセプト (Concept)
このプロジェクトは、就職活動における非効率な企業リサーチを代替する自律型マルチAIエージェントです。ユーザーが定義した「就活の軸」に基づき、エージェントがWeb上の情報から関連企業を発見・調査・評価し、パーソナライズされたナレッジベースをNotionに継続的に構築します。ブラウザ操作（ComputerUse）を前提としつつ、成果物の書き込み先は将来的にWordや社内ツールへ拡張できる設計です。

---

## 2. 背景と設計思想 (Background & Philosophy)
本エージェントは、先行レポート「AIネイティブSaaSの次なるステージ」で立てた仮説をコードで検証することを目的としています。

- **UI を介さない「サーバー完結型」への移行**  
  ユーザーはNotion上で「就活の軸」ページを記述・更新するだけで、アプリUIを触らずにナレッジベースが自動増殖します。
- **「人間の承認」を代替する自律的ワークフロー**  
  司令塔エージェントが軸を解釈し、サブエージェント（調査・要約・ポリシー判定・書き込み）を連携させて意思決定します。エージェント間I/OはA2A契約（zodスキーマ）で制御されています。

詳細な検討経緯は **[ADR (Architecture Decision Record)](docs/ADR-001_rev2.md)** に記載しています。

---

## 3. アーキテクチャ (Architecture)
```
AxisReader → Research (ComputerUse) → PolicyCheck → NotionWriter
         └─────────────── Orchestrator (司令塔) ───────────────┘
```

Mastraを用いた4つのエージェント構成で、司令塔が直列にワークフローを制御します。

- **司令塔エージェント**: Axisと企業リストを入力に、検索クエリ生成・ポリシー閾値決定・各ステップの制御を行う。
- **調査探索エージェント (ComputerUse)**: ブラウザ操作を想定した枠組みでWebを巡回し、Readability + JSDOMで本文抽出 → LLMによる要約。
- **評価エージェント (PolicyCheck)**: 要約が軸に適合しているか、文字数・箇条書き数などを機械判定する。
- **ナレッジ管理エージェント**: 合格した要約のみNotionに追記。出力先を差し替えられるよう抽象化。

---

## 4. 技術スタック (Tech Stack)
- **言語**: TypeScript  
- **実行環境**: Node.js 22.x  
- **フレームワーク**: [Mastra](https://mastra.ai/)  
- **主要ライブラリ**  
  - LLM: `openai`（`LLM_PROVIDER=gemini` 指定で `@google/generative-ai` も利用可）  
  - 本文抽出: `@mozilla/readability`, `jsdom`  
  - スキーマ定義: `zod`, `yaml`  
  - データ書き込み: `@notionhq/client`  
  - ユーティリティ: `dotenv`, `commander`  
- **自動実行**: GitHub Actions（`Weekly Orchestrator` ワークフロー）

---

## 5. セットアップと実行方法 (Getting Started)

### 5.1. 前提条件
- Node.js v22.x
- npm
- OpenAI APIキー（もしくはGemini APIキー）
- Notion IntegrationトークンとルートページID  
  （NotionページのURL末尾 `.../<page_id>?...` の32文字UUID）

### 5.2. インストール
```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_NAME>
npm install
```

### 5.3. 環境変数
プロジェクトルートに `.env` を配置して以下を設定します。

```
OPENAI_API_KEY=sk-...
# LLM_PROVIDER=gemini            # Gemini を使う場合のみ
# GEMINI_API_KEY=...             # Gemini 用
NOTION_TOKEN=secret_...
NOTION_ROOT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OUTPUT_DOCX=./out/JobSearch_KnowledgeBase.docx      # Word 出力を使う場合の例
```

> 補足: `.env.example` に雛形があります。

### 5.4. 実行コマンド
CLIは `src/tests/clis` にまとまっています。代表的なコマンドは以下。

- **全体ワークフロー (Notion 書き込み含む)**  
  ```bash
  npm run orchestrate -- \
    --root "$NOTION_ROOT_PAGE_ID" \
    --companies "<company1>,<company2>" \
    --limit 3 \
    --recencyDays 300
  ```
- **Axis 抽出のみ**  
  ```bash
  npm run axis -- --root "$NOTION_ROOT_PAGE_ID"
  ```
- **調査 & 要約のみ**  
  ```bash
  npm run research -- \
    --root "$NOTION_ROOT_PAGE_ID" \
    --companies "<company>" \
    --limit 3 \
    --recencyDays 90
  ```
- **ポリシー判定（サンプル JSON 利用）**  
  ```bash
  npm run policy -- \
    --company <company> \
    --summariesFile src/tests/samples/summaries-test.json \
    --policyFile src/tests/samples/policy-default.json
  ```
- **Notion 書き込み（QC 済みサンプルを使用）**  
  ```bash
  npm run write -- \
    --inputFile src/tests/samples/qc-<company>.json
  ```

GitHub Actionsで週次実行する場合は `.github/workflows/orchestrate.yml` を参照し、`NOTION_TOKEN` と `NOTION_ROOT_PAGE_ID` をリポジトリシークレットへ設定してください。

---

## 6. デモ (Demonstration)
デモ動画は以下をご覧ください。  
- [デモ動画 (仮リンク)](https://example.com/demo)  
  ※提出時は実際のURLやファイル名に差し替えてください。

---

## 7. リスクと今後の展望 (Risks & Future Work)

### 7.1. リスクと限界
- **Notion への依存**: 仕様変更やレート制限に左右される。ネットワーク不可時はエラーハンドリングが必要。
- **ComputerUse の制約**: 現状は静的HTMLを対象としており、SPAや認証付きサイトには未対応。

### 7.2. 今後の展望
- **ComputerUse の強化**: Playwrightなどを導入し、ログインや動的レンダリングへ対応。セキュリティ面の強化も検討。
- **出力先の多様化**: Notion Writerを抽象化し、Word/Google Docs/社内ツールへのマルチ出力をサポート。
- **自律度向上**: Axisから関連企業リストを自動生成し、司令塔が探索対象を自律的にアップデートできるようにする。
- **ポリシー学習**: 過去のQC結果を蓄積し、fitScore閾値や文字数条件を動的に最適化する。
