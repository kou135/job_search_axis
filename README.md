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

詳細な検討経緯はフォルダに追加させていただいたADRに記載しています。

---

## 3. アーキテクチャ (Architecture)
```
AxisReaderTool → OrchestratorAgent → ResearchTool → PolicyEvaluationTool → NotionWriterTool
```

Mastra Workflow 上でツールとエージェントを直列接続し、以下の順で処理します。

- **AxisReaderTool**: Notion の親ページから YAML 形式の就活軸を取得し、zod で検証。
- **OrchestratorAgent**: Axis をもとに関連企業を LLM で推定し、候補リストを JSON で返す。
- **ResearchTool**: 各企業についてニュース記事を収集し、LLM 要約を生成。
- **PolicyEvaluationTool**: 軸との整合度を独自スコアと AnswerRelevancyMetric で評価し、受理/却下を判定。
- **NotionWriterTool**: 受理された要約のみを Notion の企業ページに追記。

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
- Gemini APIキー・OpenAI APIキー
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
# LLM_PROVIDER=gemini           
# GEMINI_API_KEY=...             
NOTION_TOKEN=secret_...
NOTION_ROOT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> 補足: `.env.example` に雛形があります。

### 5.4. 実行コマンド

全工程をまとめて実行する CLI を提供しています。

```bash
npm run orchestrate -- \
  --root "$NOTION_ROOT_PAGE_ID" \
  --limit 3 \
  --recencyDays 90
```

GitHub Actions で週次実行する場合は `.github/workflows/orchestrate.yml` を参照し、`NOTION_TOKEN` と `NOTION_ROOT_PAGE_ID` をリポジトリシークレットへ設定してください。

---

## 6. デモ (Demonstration)
デモ動画はフォルダに追加させていただいたものをご覧ください。  

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
