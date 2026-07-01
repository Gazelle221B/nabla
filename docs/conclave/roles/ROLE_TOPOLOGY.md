# Pillar 1 — The Council: 役割トポロジー

> 合議体を構成する役割を**スロット (capability slot)** として定義する。スロットは恒久、モデル割り当ては差し替え可能。
> 出典思想: 実在のエンジニアリング組織のロール (指揮系統・責務分離・権限ゲート) を AI 群へ写経する。

---

## 1. 役割スロット (恒久)

| スロット | 組織ロール | 責務 | 投入頻度 | やらないこと |
|---|---|---|---|---|
| `HUMAN` | プロダクトオーナー | 要件・スコープ定義、merge 承認。全体の真の天井 | 起点と最終ゲートのみ | 実装・レビューに入らない |
| `ARCHITECT` | プリンシパル/アーキテクト | 上流設計、実装計画策定、難所エスカレーションの解決 | 起点と難所の 2 点のみ | 日常実装をしない |
| `IMPLEMENTER` | 実装ミドルチーム | 実装の主軸、大量生成、定型作業 | 日常 | 設計判断・自己レビューをしない |
| `REVIEWER` | 独立レビュアー / 品質ゲートキーパー | DESIGN 基準の独立検証 | 各 PR | 実装に関与しない (関与したらレビュー資格を失う) |
| `QA_MEMORY` | テックリード / 記憶装置 | 受け入れ条件の検証、全体整合性、状態保持の補助 | 各リリース | 実装に手を入れない・レビュー判定を覆さない |

### 4 つの不可侵原則

1. **視点の独立性 (judging ロール)** — `REVIEWER` / `QA_MEMORY` は評価対象を作ったエージェントと必ず別。**PR 作者 ≠ レビュアー**。同一コンテキストで自己承認しない。
2. **完全コンテキスト (acting ロール)** — `ARCHITECT` / `IMPLEMENTER` は**行動の前に完全な上流コンテキスト (SSOT) を受け取る**。動くエージェントが部分コンテキストで判断すると、矛盾する暗黙の決定を生み成果物が壊れる(Cognition の Flappy Bird 失敗)。独立性は judging にのみ無条件に適用し、acting には逆に文脈を厚く渡す。
3. **希少資源の集中** — 最高コストのモデルは `ARCHITECT` スロット (上流設計 + 難所) のみに投入。日常は低コストモデルへ委任し、オーケストレーターのトークンは計画・統合・判断・検証に温存(文脈窓も希少資源 → [Context Hygiene](../principles/CONTEXT_HYGIENE.md))。
4. **問題定義は人間が握る** — 堂々巡り・炎上は能力ではなく要件・スコープ欠陥のシグナル。`HUMAN` は要件を見直す。

> **acting と judging の見分け方**: そのロールが**ファイルを書く/決定を確定する**なら acting(完全コンテキストを渡す)。そのロールが**判定だけ下す**なら judging(独立を保つ)。この区別が「自己承認を防ぐ独立性」と「矛盾決定を生む文脈断絶」を両立させる鍵。

### 判定者のモデル系統独立 (self-enhancement bias)

LLM 判定者は自分/似たモデルの出力を過大評価する (self-enhancement bias)。よって **`REVIEWER` と `QA_MEMORY` は、評価対象を生成したモデル(系統)にバインドしてはならない**——セッションを分けるだけでは不十分(バイアスはモデル同一性に付く)。これはハードなバインディング制約。詳細・出典は [JUDGE_RELIABILITY](../principles/JUDGE_RELIABILITY.md) JR-1。

---

## 2. モデル割り当て (差し替え可能なバインディング)

> ⚠️ ここはフレームワークの**設定**であり、本体ではない。新モデルのリリースで随時更新する。

### 抽出元 (panda-tech-news, 2026-05〜06 時点) の実バインディング — 参考例

| スロット | 実行基盤 + モデル | 非対話呼び出し |
|---|---|---|
| `ARCHITECT` | Claude Code + Opus (その時の最上位) | `claude -p "$(cat prompts/architect.md)" < REQUIREMENTS.md` |
| `IMPLEMENTER` | OpenCode + 低コスト/オープンウェイト (Qwen / MiniMax / Kimi 等) | `opencode run -m <model> "<prompt>"` |
| `REVIEWER` | Codex CLI + GPT (high reasoning) | `codex exec --sandbox workspace-write "<prompt>"` |
| `QA_MEMORY` | Antigravity (agy) + Gemini (大コンテキスト) | `agy -p "<prompt>"` |
| 調査/セカンドオピニオン | Gemini (検索グラウンディング) | `gemini -p "<prompt>"` |
| Git/PR 専用 | Copilot CLI / `gh` | `gh pr create` 等 (コーディングには使わない) |

### 自プロジェクトでの記入欄(nabla)

> Claude Code上のAgent/Taskツールでサブエージェントを呼び出す運用のため、シェルCLIの非対話呼び出しではなく `Agent(subagent_type="...")` 呼び出しとして記録する(ユーザーの `~/.claude/CLAUDE.md` 外部CLI ルーティング規則と整合)。

| スロット | あなたの基盤 + モデル | 非対話呼び出し | 月次コスト枠 / 上限 |
|---|---|---|---|
| `ARCHITECT` | Claude Code(Opus) | オーケストレーター自身が直接担当(上流設計・難所のみ) | 希少資源。上流設計と難所エスカレーションの2点のみに投入 |
| `IMPLEMENTER` | Claude Code(Sonnet)、日常軽量タスクは `Agent(subagent_type="qwen-coder")` | `Agent({subagent_type:"qwen-coder", description:"...", prompt:"..."})` | qwen-coder無料枠: 1日2,000リクエスト |
| `REVIEWER` | `Agent(subagent_type="codex-agent")` | `Agent({subagent_type:"codex-agent", description:"独立レビュー", prompt:"$(cat prompts/review.md) 対象: <Ticket>"})` | Claude使用制限に近づいた場合のみ使用(過度な使用を避ける) |
| `QA_MEMORY` | `Agent(subagent_type="gemini-agent")` | `Agent({subagent_type:"gemini-agent", description:"数学的説明レビュー", prompt:"$(cat prompts/qa.md) 対象: <Ticket>"})` | 検索グラウンディングでの事実確認に使用。上限記入なし(要観測) |

**役割分離の理由**: nabla企画時の原案(`docs/PROJECT_PLAN.md`)ではClaude Codeに「実装+コードレビュー」を単独割当していたが、これは本フレームワークの視点独立性原則(judgingロールは生成元と別系統)に抵触する。REVIEWERをCodex(GPT系)、QA_MEMORYをGemini系へ分離し、self-enhancement biasを避ける。

Git/PR専用は `Agent(subagent_type="copilot-agent")` — コーディングには使わない(月300リクエスト制限、ユーザー規則により厳守)。重要な決断の並列セカンドオピニオンが必要な場合は `Agent(subagent_type="second-opinion")`。

---

## 3. 再評価条項 (CRITICAL)

役割へのモデル割り当ては、**その時点のベンチマーク順位と運用観測に依存する**。以下のときに必ず再評価する:

- 主要モデルの新バージョンがリリースされたとき
- あるスロットで「同じ失敗を 2 回以上」繰り返すとき (割り当てミスマッチの兆候)
- コスト上限に頻繁に到達するとき (より安いスロット候補を探す)
- **規定の量も再評価する** — モデルが賢くなれば prescriptive な足場は減らせる(Anthropic)。割り当てだけでなく「どれだけ規定が要るか」も下方へ見直す。

選定の 3 基準: ①ベンチ順位 ②運用観測(厳格さ等)③**cascade 位置**。

> **cascade 位置 (Hallucination Cascade の知見)**: 速いが誤りやすいモデルを**上流(生成: IMPLEMENTER)**へ、最も幻覚の少ない修正志向のモデルを**最終段(REVIEWER / QA_MEMORY)**へ置く。3 段チェーンは幻覚を正味で減衰させる(増幅係数 0.644 < 1)。位置と幻覚プロファイルが噛み合わないと、各モデルが個別には良くてもチェーン全体が劣化する。→ [JUDGE_RELIABILITY](../principles/JUDGE_RELIABILITY.md)。

再評価は ADR (設計判断記録) に残し、`AGENTS.md` の役割表と `ORCHESTRATION_RUNBOOK` のルーティング表を同期する。

> **運用観測の例 (抽出元)**: レビュアー選定はベンチ順位だけでなく「指摘が厳格」という観測でも裏付けた。実装主軸はスループットとコスト効率で選ぶ。記憶役は大コンテキストだが、完全自動オーケストレーター扱いはせず用途を記憶・QA に限定する (新ツールの透明性リスク)。

---

## 4. 委任の鉄則

1. **acting 委任には SSOT を運ぶ** — `IMPLEMENTER` / `ARCHITECT` への委任プロンプトは「タスク + 完了条件 + 触ってはいけない範囲」だけでなく、**依存する上流の決定(該当 DESIGN 節 + PROJECT_STATE の制約・未解決論点)を必ず含めるか、全 CLI が読めるリポジトリ内で指し示す**。スコープ一行だけの委任は矛盾決定 (Flappy Bird) を招く。チェック: 「この acting 委任先は、その行動が依存する上流決定を全て受け取ったか?」
2. **委任結果は必ず検証してから採用** — 外部 AI の出力を無検証で「事実」として記録しない。出典 URL は実在確認 (`curl -so /dev/null -w "%{http_code}"`)、コードは品質ゲート通過を確認。委任された**判定**も同様に検証する(引用 file:line の実在・引用テストの fresh 通過 → [JUDGE_RELIABILITY](../principles/JUDGE_RELIABILITY.md) JR-7)。
3. **推論-行動の整合チェック** — 委任実装を採用する前に、**生成された差分が実装者の宣言した計画/要約と一致するか**を確認する。宣言と実物が乖離する「推論-行動の不一致」(MAST FM-2.6、単一最頻の不整合モード 13.2%) は役割分離だけでは捕捉できない。REVIEWER のチェックリスト項目にする。
4. **役割分離を運用で強制** — 実装を投げた相手にレビューを投げない。judging スロットは生成元と別系統(self-enhancement bias 対策)。
5. **環境失敗は粘らない** — CLI/認証/課金が原因の失敗は 2 回連続で停止し人間へ (→ [ESCALATION.md](../governance/ESCALATION.md) 区分 D)。AI は環境問題で無限にトークンを溶かす。
6. **fallback 経路を用意** — 主たる委任先がトークン上限・障害のとき、誰に落とすかを事前に決める ([ORCHESTRATION_RUNBOOK](../runbook/ORCHESTRATION_RUNBOOK.template.md) §ルーティング)。
7. **戻りは蒸留して受け取る** — 委任先は生のトランスクリプトでなく蒸留要約 (目安 1–2k トークン) + 全文参照を返す。ただし採用前に参照の根拠を自分で検証する(蒸留と検証の両立 → [Context Hygiene](../principles/CONTEXT_HYGIENE.md) CH-4)。
8. **peer transport は権限を持たない** — `agmsg` などの peer messaging は、同時稼働中エージェント間の通知/相談を運ぶだけ。判断の採用、QA PASS、merge 許可、PROJECT_STATE 更新の代替にはならない。

### per-slot lean context manifest

各スロットが**常に読むべき最小ファイル集合**を宣言する(BMAD の `devLoadAlwaysFiles` 相当、`AGENTS.md` ≤300 行ルールのスロット粒度版)。「できる限り lean に」が原則。例:

| スロット | 常時ロード (lean) |
|---|---|
| `IMPLEMENTER` | コーディング規約 / 確定 ADR 一覧 / 憲法の絶対 NG 節 / 当該タスクの DESIGN 該当節 |
| `REVIEWER` | DESIGN / REVIEW_REPORT テンプレ / 証跡要件 / [JUDGE_RELIABILITY](../principles/JUDGE_RELIABILITY.md) |
| `QA_MEMORY` | REQUIREMENTS の受け入れ条件 / QA_REPORT テンプレ / PROJECT_STATE |

設定駆動で宣言し ([ENGINEERING_INVARIANTS](../principles/ENGINEERING_INVARIANTS.md) INV-2)、`AGENTS.md` と RUNBOOK ルーティング表から参照する。

---

## 5. なぜ「完全自動オーケストレーション製品」を使わないのか

抽出元の運用観測 (2026-05 時点): 複数ハーネスを束ねる安定した既製オーケストレーション製品は未成熟。運用 UI 系は決定論的な完全パイプラインには不向き、ベンチ上位ハーネスは実運用成熟度が低い、サブエージェント機能は課金・バグ境界が不透明。

→ **当面は手動運用 + 痛点一箇所の軽量スクリプト化**に留める。ただし本フレームワークのロール・フロー・I/O 契約は、ツール成熟時に**そのままステップ定義へ変換できる形**で設計してある。最優先は「単一の真実の源 (DESIGN) を固め、実装とレビューが確実にそれを参照する受け渡し設計」。

`agmsg` のようなローカル peer messaging は、この「痛点一箇所の軽量スクリプト化」に入る。採用しても Conclave の権限モデルは変えない。peer message は便利な通知であり、永続 SSOT やレビューゲートではない。
