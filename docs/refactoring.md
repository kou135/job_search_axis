# Mastra リファクタリング計画

## 1. 目標仕様とワークフロー
- **全体フロー**: AxisReaderTool → OrchestratorAgent（企業推定）→ ResearchAgent → PolicyCheckAgent → WriterAgent。
- **司令塔ステップ**: Axis を入力に LLM で企業候補を抽出し、そのリストを後続ステップへ渡す。
- **Mastra Workflow**: 公式ドキュメントに沿って `Workflow` / `Step` を用い、各 Step に `inputSchema` / `outputSchema` を設定して A2A 契約を保証する。
- **実行経路**: CLI / GitHub Actions は Workflow Run をトリガし、ログ・トレースは Mastra Runtime（`mastra dev`, `mastra start`）に集約。

## 2. 実装方針（サンプルコード準拠）
- `src/mastra/index.ts` で `export const mastra = new Mastra({ agents, tools, workflows, telemetry })` を定義し、公式 CLI から解決できるようにする。
- Workflow を `mastra.registerWorkflow(workflow)`（もしくは `mastra.addWorkflow(workflow)`）で登録し、CLI から `mastra.run("workflowName", triggerData)` できる状態にする。
- Orchestrator / Research / Policy / Writer の 4 エージェントを `defineAgent`（または `new Agent`）で定義し、`name`・`instructions`・`model`・必要な `tools` を記述。
- Axis 読み込みは `createTool` で実装した AxisReaderTool に任せ、OrchestratorAgent の Step がツール経由で Axis を取得。
- Notion 操作・LLM 要約・本文抽出などはすべて `createTool` で登録し、該当エージェントの `tools` へ紐付け。
- Workflow は `Workflow.step(axisStep).then(orchestratorStep).then(researchStep)...` の形で構築し、公式サンプル同様 `commit()` → `createRun()` で実行。
- PolicyCheck ステップでは `@mastra/evals` の `AnswerRelevancyMetric` を活用した `PolicyEvaluationTool` を利用し、Axis との一致度を Roles/Industries/Keywords (0.3/0.4/0.3) の重みで集計。スコア・理由・ステータスを返し、閾値 (>=0.5) を満たす要約のみ Writer へ引き渡す。

## 3. 現状実装との差分
- 直列関数（`runAxisReader` など）を CLI から直接呼び出しており、Mastra Runtime に統合されていない。
- エージェントが `name`・`run` だけのプレーンオブジェクトで、`defineAgent` によるモデル/指示/ツール設定が未整備。
- AxisReader が関数実装のままで、Mastra Tool として登録されていない。
- Workflow API や公式の A2A schema を利用しておらず、企業候補推定ステップも欠落。

## 4. リファクタ手順
1. **基盤整備**: `Mastra` インスタンスを作成し、`mastra dev` / `mastra start` が成功する状態にする（telemetry, logger 設定含む）。
   - 依存追加: `npm install @mastra/evals`（Policy 評価で AnswerRelevancyMetric を利用）
   - Telemetry 例: `telemetry: { logger: new ConsoleLogger(), tracer: new OpenTelemetryTracer() }`
2. **エージェント移行**: Orchestrator / Research / Policy / Writer を `defineAgent` 形式へ移行し、`instructions`・モデル・`tools` を設定。
3. **ツール実装**: AxisReaderTool・Notion ソート/書き込みツール・LLM 要約ツールなどを `createTool` で実装し、エージェントに紐付け。
4. **Workflow 構築**: AxisReaderTool → OrchestratorAgent → ResearchAgent → PolicyCheckAgent → WriterAgent の Step を Mastra Workflow に定義し、`inputSchema` / `outputSchema` で公式どおり型保証。Policy ステップは `PolicyEvaluationTool` で付与された `score`, `reason`, `status` を用いて `accepted/rejected` を振り分ける。
5. **CLI / Actions 更新**: CLI と GitHub Actions を Workflow Run 呼び出しに差し替え、トリガーデータ（企業候補・ `recencyDays` など）は Workflow の引数として渡す。
6. **ドキュメント・回帰試験**: Notion 更新・QC 判定などの動作確認を行い、README / ADR / ドキュメントを新構成に合わせて更新。
