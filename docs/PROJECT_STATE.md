# プロジェクト状態  (最終更新: 2026-07-02 / 更新者: `QA_MEMORY` (Gemini 3.5 Flash, T1-2+T2-1 QA PASS))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M1進行中。T1-2・T2-1完了。PR #1 QAレビュー合格 (PASS)。** 次はT3-1(最小React実験・InteractiveExperiment)。

- ブランチ: `agent/t1-2-t2-1-impl`(PRレビュー待ち)。マージ後は `main` から `agent/t3-1-impl` を切り直す。
- リポジトリは公開済み: https://github.com/Gazelle221B/nabla 。GitHub Pages公開URL: https://gazelle221b.github.io/nabla/ (200確認済み)。
- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`、`docs/IMPLEMENTATION_PLAN.md` は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)導入済み。

## 作業中ブランチ

`agent/t1-2-t2-1-impl`(2コミット: T1-2 + T2-1、PRレビュー待ち)。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。
- T1-2で `markdown.processor: unified({...})` API(Astro v7新形式)を採用。非推奨だった `markdown.remarkPlugins`/`markdown.rehypePlugins` の直接指定を廃止。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- `npm run lint`はまだ実体がない。ESLint導入時に追加する。
- devDependency `@astrojs/check` の依存先(`yaml`パッケージ、`yaml-language-server`経由)にmoderate severityの脆弱性(deeply nested YAML collectionsによるstack overflow、GHSA-48c2-rrv3-qjmp)が`npm audit`で検出されている。開発時の型チェックツールのみが依存し、ビルド成果物には含まれず、当プロジェクトが任意のYAML入力を解析する経路もないため実害は低いと判断し、`npm audit fix --force`(breaking change)は保留した。ESLint等追加時に再評価する。

## レビューの直近結果

- **T1-2 & T2-1 (PR #1 / ブランチ `agent/t1-2-t2-1-impl`)**:
  - `REVIEWER` (Codex / GPT-5.5 xhigh、`codex exec`直接実行・セッションログで実行検証済み): **PASS** — Critical/High 0件。2パス実行(read-only静的レビュー→workspace-writeでfresh test/typecheck/build取得)。詳細: `docs/REVIEW_REPORT.md`
  - `QA_MEMORY` (Antigravity / Gemini 3.5 Flash (High)、`agy --print`直接実行): **PASS** — 受け入れ条件はスコープ内PASS/スコープ外WAIVED、数学的誤りなし。詳細: `docs/QA_REPORT.md`
  - **プロセス監査記録**: 初回のラッパーエージェント経由の試行は、(a) Codex側=セッションログ不在によりCLI未実行の自己生成報告と判明、(b) Antigravity側=Bash安全分類器の一時障害でagy実行失敗しClaude代替検証、のためいずれも**無効として破棄**。上記PASSはオーケストレーターが直接起動した本物のCLI実行のみに基づく(判定者の別系統性を担保)。

## 次に実行すべきアクション

**PR #1 QAレビューPASS。** 次は以下:

1. `agent/t1-2-t2-1-impl` PR を人間（HUMAN）が確認し、`main` へマージ。
2. `main` から `agent/t3-1-impl` ブランチを切り、T3-1 (最小 React 実験) の実装に着手する。
3. ESLint導入時に`npm run lint`を実コマンド化し、未解決リスクの脆弱性を再評価する。

## 人間判断待ちの事項

| 判断 | 準備済み材料 |
|---|---|
| **PR #1 のマージ承認**(mergeは人間専権 — AGENTS.md §3 C-1) | REVIEWER PASS(`docs/REVIEW_REPORT.md`)+ QA PASS(`docs/QA_REPORT.md`)+ Copilot指摘8件対応済み。PR: https://github.com/Gazelle221B/nabla/pull/1 |

## 改訂履歴

| 日時 | 更新者 | 変更 |
|---|---|---|
| 2026-07-02 | HUMAN + Claude Code | meeting.md/meeting2.md からdocs/PROJECT_PLAN.md(統合計画書)を作成 |
| 2026-07-02 | HUMAN + Claude Code | レンダリング戦略をハイブリッド(Tier1〜3)で確定 |
| 2026-07-02 | ARCHITECT(Claude Code) | conclaveガバナンス導入。AGENTS.md/REQUIREMENTS.md/DESIGN.md/IMPLEMENTATION_PLAN.md/PROJECT_STATE.md を作成 |
| 2026-07-02 | ARCHITECT(Claude Code) | Tier 3をThree.js(3a)/WebGPU(3b)へ分割。全ガバナンス文書を同期 |
| 2026-07-02 | ARCHITECT(Claude Code) | T0系タスク完了。`MATH_CONVENTIONS.md`(GPL/CC BY-SA正文はgnu.org/creativecommons.orgから取得)、`LICENSE`/`LICENSE-CODE`/`LICENSE-CONTENT`/`LICENSES.md`、`DEVELOPMENT.md`、`CONTRIBUTING.md`、`docs/adr/ADR-001.md`+`INDEX.md` を作成 |
| 2026-07-02 | IMPLEMENTER(Claude Code Sonnet) | T1-2完了: React+MDX+KaTeX統合。T2-1完了: `src/lib/math/pythagoras.ts` + Vitest+fast-check 不変条件テスト(20件全GREEN、seed=42)。`npm run test/typecheck/build` 全通過。ブランチ `agent/t1-2-t2-1-impl`。 |
| 2026-07-02 | QA_MEMORY(Gemini) | T1-2+T2-1 (PR #1) のQAレビュー完了。QA_REPORT.md を作成し、品質ゲート判定を PASS とする。 |
| 2026-07-02 | ARCHITECT(Claude Code) | ゲートのプロセス監査: ラッパー経由の初回レビュー/QA試行を無効と判定し破棄(Codex未実行・agy実行失敗)。codex exec(GPT-5.5 xhigh)とagy(Gemini 3.5 Flash High)を直接実行し、両ゲート正規PASS。REVIEW_REPORT.md作成、QA_REPORT.md誤字修正、人間判断待ちにPR #1マージ承認を登録 |
| 2026-07-04 | HUMAN + Claude Code(オーケストレータ) | マージ権限を委任: レビューPASS+QA PASS+Copilotレビュー依頼済みを条件にオーケストレータAIがマージ可(制作者は事後監査)。AGENTS.md C-1/§8・DEVELOPMENT.md §6・CONSTITUTION.md・ORCHESTRATION_RUNBOOK(+template) を整合更新(Copilotレビュー指摘対応) |
