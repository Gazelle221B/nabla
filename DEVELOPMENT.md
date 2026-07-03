# DEVELOPMENT.md — 複数AIエージェント運用規則

> 対象読者: nablaの開発に関わる全てのAIエージェント(役割スロットの定義は `docs/conclave/roles/ROLE_TOPOLOGY.md`、割当は `AGENTS.md` §7)。本書はconclaveの一般原則をnabla固有の運用として具体化したもの。矛盾する場合は `AGENTS.md` §3(絶対NG)が常に優先する。

## 1. 担当の単一割当

- **1つのIssue/タスクには、実装担当として1人または1エージェントのみを割り当てる。** 同じタスクを複数のIMPLEMENTERへ並行して投げない(コンフリクトの原因になる)。
- 別エージェントは**レビューまたはQA担当**として関与してよいが、実装には手を入れない(`docs/conclave/roles/ROLE_TOPOLOGY.md` の視点独立性原則)。
- 役割の割当: `ARCHITECT`=Claude Code(Opus)、`IMPLEMENTER`=Claude Code(Sonnet)または`qwen-coder`、`REVIEWER`=`codex-agent`、`QA_MEMORY`=`gemini-agent`(詳細はAGENTS.md §7)。**実装者とレビュアーは必ず異なるモデル系統にする**(self-enhancement biasを避けるため、単にセッションを分けるだけでは不十分)。

## 2. 同時編集の禁止

- 同じ作業ツリー(ファイル群)を複数エージェントへ同時に編集させない。
- 並列実行が安全なのは、`docs/IMPLEMENTATION_PLAN.md` のタスク表で `[P]` が付き、かつ**変更対象ファイルが重複しない**タスクに限る。
- 並列実行する場合も、各エージェントには依存する上流決定(該当DESIGN節・PROJECT_STATEの制約)を必ず渡す(`docs/conclave/roles/ROLE_TOPOLOGY.md` §委任の鉄則1)。

## 3. テスト必須化

- **コードの変更には対応するテストを必須とする。** `lib/math`の変更は具体例テスト+不変条件テストの両方(`MATH_CONVENTIONS.md`, `docs/DESIGN.md` §数学的正しさの検証規約)。
- テストを追加できない変更(設定ファイル・ドキュメントのみ等)は、その旨をコミットメッセージまたはPR説明に明記する。
- 品質ゲート(`AGENTS.md` §4)はフレッシュ実行で緑を確認してから「完了」と言う。記憶・推測で代用しない。

## 4. 要件変更の記録先

- 要件・設計の変更は**コード内コメントに書かない**。`docs/REQUIREMENTS.md`/`docs/DESIGN.md`の該当節を更新するか、`docs/adr/`にADRを追加する。
- 「なぜこの実装にしたか」という判断根拠は、コードコメントではなくADRまたはPRの説明に残す(コードコメントは「WHY」が非自明な場合のみの最小限に留める、というコーディング規約と整合)。
- 変更は必ず `docs/PROJECT_STATE.md` の「直近の設計判断」「改訂履歴」に反映する(永続化 > 内部記憶)。

## 5. AI追加依存の扱い

- **AIエージェントが追加した依存関係(npmパッケージ等)を無条件で受け入れない。** 採用条件は `docs/DESIGN.md` §検討した代替案 および `docs/REQUIREMENTS.md` §6.2.1相当の評価基準(ライセンス両立性、バンドルサイズ、保守状況、数学モデルと描画層の分離を損なわないこと)を満たすか確認する。
- 重要な依存追加はADR(目的・候補・採用理由・ライセンス・代替案)に記録する(`LICENSES.md` の第三者素材表も同期更新)。
- 依存は事前に一括採用せず、実装中に具体的な必要性が発生した時点で追加する(rule of three、`docs/DESIGN.md` §設計方針)。

## 6. 最終マージ判断

- **mergeはオーケストレータAIが実施可**(2026-07-04 制作者決定)。前提条件: レビューPASS + QA PASS の二条件 + マージ直前にGitHub上のCopilotコードレビューをPRへリクエストすること(`AGENTS.md` §8)。制作者はGitHub上で事後監査し、必要なら revert する。
- AIエージェントは保護ブランチへの直接pushは引き続き行わない(`AGENTS.md` §3 C-1)。実装エージェント自身によるマージも不可(マージ操作はオーケストレータのみ)。
- 数学的内容の最終責任は制作者にある。AIレビューは不変条件テスト等の機械的検証の補助であり、代替ではない(`AGENTS.md` §7、`docs/REQUIREMENTS.md` §8.3相当)。

## 7. エージェント間の連絡(任意)

複数のCLIエージェントを**同時に**動かす場合のみ、`agmsg`等のローカルpeer messagingを使ってよい(`docs/conclave/runbook/ORCHESTRATION_RUNBOOK.md` §3)。ただしpeer messageはSSOTではない。合意した判断・ブロッカー・レビュー/QA結果は必ず`docs/PROJECT_STATE.md`/`docs/HANDOFF.md`/各reportへ転記する。単独セッションでの日常作業では不要。

## 8. 環境失敗時の扱い

CLI/認証/課金が原因の失敗は**2回連続で停止し人間へエスカレーション**する(`docs/conclave/governance/ESCALATION.md` 区分D)。AIは環境問題で無限にトークンを溶かさない。
