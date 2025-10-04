# Mastra リファクタリング計画

## 1. 目標仕様とワークフロー
- **全体フロー**: AxisReaderTool → OrchestratorAgent（企業推定）→ ResearchAgent（内部ツール経由で実行）→ PolicyAgent → WriterAgent。
- **ツール／エージェントの役割分担**: 各サブエージェントは `new Agent` で振る舞いを定義し、対応する `createTool` が Mastra Workflow から呼び出す。ツールは `mastra.getAgent(...)` を利用して該当エージェントへ委譲する。
- **司令塔ステップ**: Axis を入力に LLM で企業候補を抽出し、そのリストを後続ステップへ渡す。
- **Mastra Workflow**: 公式ドキュメントに沿って `Workflow` / `Step` を用い、各 Step に `inputSchema` / `outputSchema` を設定して A2A 契約を保証する。
- **実行経路**: CLI / GitHub Actions は Workflow Run をトリガし、ログ・トレースは Mastra Runtime（`mastra dev`, `mastra start`）に集約。

## 2. 実装方針（サンプルコード準拠）
- `src/mastra/index.ts` で `export const mastra = new Mastra({ agents, tools, workflows, telemetry })` を定義し、公式 CLI から解決できるようにする。
- Workflow を `mastra.registerWorkflow(workflow)`（もしくは `mastra.addWorkflow(workflow)`）で登録し、CLI から `mastra.run("workflowName", triggerData)` できる状態にする。
- Orchestrator / Research / Policy / Writer の 4 エージェントを `new Agent` で定義し、`instructions`・`model`・利用するツールを明示する。
- 各サブエージェントを呼び出すツール（例: `researchAgentTool`）を `createTool` で定義し、`execute` 内で `mastra.getAgent("researchAgent")` のように参照してエージェントへ処理を委譲する。
- Axis 読み込みは `createTool` で実装した AxisReaderTool に任せ、OrchestratorAgent の Step がツール経由で Axis を取得。
- Notion 操作・LLM 要約・本文抽出などの副作用処理は、必要に応じて各エージェントの `tools` に紐付ける形で再利用する。
- Workflow は `createWorkflow` + `createStep` で Axis → Orchestrator → Research → Policy → Writer の直列ステップを組み、`createRunAsync().start({ inputData })` の動線で CLI / Actions から起動できるようにする。
- PolicyCheck ステップでは `@mastra/evals` の `AnswerRelevancyMetric` を活用した Policy エージェントがスコアを算出し、Roles/Industries/Keywords (0.3/0.4/0.3) の重みで集計。閾値 (>=0.5) を満たす要約のみ Writer エージェントへ引き渡す。

## 3. 現状実装との差分
- 旧構成ではサブ処理をプレーン関数／ツールのみで実装しており、エージェント階層がない。
- Mastra Runtime への統合は完了済みだが、Research / Policy / Writer がエージェントとして登録されていない。
- Workflow は Axis → Orchestrator → Research → Policy → Writer の流れを持つが、Research / Policy / Writer が直接ツールを呼ぶ実装のため、エージェントの再導入が必要。

## 4. リファクタ手順
1. **基盤整備**: `Mastra` インスタンスを最新構成（0.20 系）で維持し、`mastra dev` / `mastra start` が成功する状態を確認する。
   - 依存確認: `npm install @mastra/core@0.20.0 @mastra/libsql@0.15.1 @mastra/loggers@0.10.15 @mastra/memory@0.15.5 @mastra/evals@0.13.10 @ai-sdk/openai`
   - Telemetry 例: `telemetry: { logger: new ConsoleLogger(), tracer: new OpenTelemetryTracer() }`
2. **エージェント再導入**: Orchestrator / Research / Policy / Writer の 4 エージェントを `new Agent` で定義し、それぞれ必要な instructions・モデル・ツールを設定する。
3. **ツール更新**: Research / Policy / Writer の各ツールを、対応するサブエージェントを呼び出すラッパーツールとして再実装（`mastra.getAgent("*")` を利用）。AxisReaderTool など既存ツールは必要に応じて調整。
4. **Workflow 更新**: AxisReaderTool → OrchestratorAgent → ResearchAgentTool → PolicyAgentTool → WriterAgentTool の順で Step を定義し、`inputSchema` / `outputSchema` を見直す。Policy ステップではサブエージェントの評価結果から `accepted/rejected` を決定。
5. **CLI / Actions 更新**: `mastra.run("workflowName", triggerData)` への入口は維持しつつ、ステップ出力のフォーマット変更があれば CLI / GitHub Actions を更新。
6. **ドキュメント・回帰試験**: README / ADR / この計画書を最新構成に合わせて更新し、Notion 更新・QC 判定などの動作確認を再度実施。
