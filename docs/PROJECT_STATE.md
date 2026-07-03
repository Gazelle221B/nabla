# プロジェクト状態  (最終更新: 2026-07-04 / 更新者: `IMPLEMENTER` (Claude Code Sonnet, T5-1のmain追従・レビュー対応))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M1進行中。T1-2・T2-1はPR #1としてレビューPASS済み・mainへマージ済み。T5-1(品質ゲート一式)はPR #3として実装完了、origin/mainをbranch側へmergeして追従済み(mainへはまだマージされていない、レビュー待ち)。** T3-1(最小React実験・InteractiveExperiment)は別エージェントが並行して着手中。

- T5-1で導入したもの: ESLint(flat config, `eslint.config.js`。`@eslint/js`+`typescript-eslint`+`eslint-plugin-astro`のrecommendedのみ、追加ルールなし)、`.github/workflows/ci.yml`(pull_request + main push で typecheck/lint/build/test/E2Eを実行)、Playwright + `@axe-core/playwright`による最小スモーク(`e2e/smoke.spec.ts`: トップページ表示・コンソール未処理例外0件・axe Critical/Serious 0件)。記事がまだ無いため対象は既存のトップページのみ(過剰実装しない、T4-1で記事追加時に対象拡張)。
- PR #1マージにより`npm run test`(Vitest + fast-check)が実体化済み。PR #3(T5-1)側でorigin/mainをmergeして追従した結果、`package.json`のscripts/devDependenciesはPR #1(react/mdx/katex/vitest/fast-check)とT5-1(eslint/playwright/axe/@types/node)の両方を統合済み(PR #3自体はまだmainへマージされていない)。

- リポジトリは公開済み: https://github.com/Gazelle221B/nabla 。GitHub Pages公開URL: https://gazelle221b.github.io/nabla/ (200確認済み)。
- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`、`docs/IMPLEMENTATION_PLAN.md` は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)導入済み。

## 作業中ブランチ

`agent/t5-1-quality-gates`(PR #3、T5-1実装、origin/mainをbranch側へ2回merge済み。PR #3自体はまだmainへマージされておらず、独立レビュー待ち)。別途 `agent/t3-1-impl` でT3-1が並行進行中。`agent/t1-2-t2-1-impl`(PR #1)はマージ済みのため以後使用しない。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。
- T1-2で `markdown.processor: unified({...})` API(Astro v7新形式)を採用。非推奨だった `markdown.remarkPlugins`/`markdown.rehypePlugins` の直接指定を廃止。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- `npm run test`/`typecheck`/`lint`/`build`/`test:e2e` は全て実体化済み(それぞれVitest+fast-check / astro check / eslint / astro build / Playwright+axe)。PR #3(T5-1)がorigin/mainへ追従merge直後にフレッシュ実行で全緑を確認する(下記「レビューの直近結果」)。
- devDependency `@astrojs/check` の依存先(`yaml`パッケージ、`yaml-language-server`経由)にmoderate severityの脆弱性(deeply nested YAML collectionsによるstack overflow、GHSA-48c2-rrv3-qjmp)が`npm audit`で検出されている。開発時の型チェックツールのみが依存し、ビルド成果物には含まれず、当プロジェクトが任意のYAML入力を解析する経路もないため実害は低いと判断し、`npm audit fix --force`(breaking change)は保留した。

## レビューの直近結果

- **T1-2 & T2-1 (PR #1)**: `REVIEWER`(Codex)・`QA_MEMORY`(Antigravity/Gemini)ともにPASS。Copilot指摘8件対応済み。人間承認を経てmainへマージ済み。詳細: `docs/REVIEW_REPORT.md` / `docs/QA_REPORT.md`。
- **T5-1(品質ゲート一式、PR #3 `agent/t5-1-quality-gates`、まだmainへ未マージ)**: 実装者(Claude Code Sonnet)によるローカル自己検証のみ完了(origin/mainへの追従merge前・後の両方でtypecheck/lint/build/test/test:e2eフレッシュ実行し全緑を確認)。REVIEWER(codex)=FAIL・QA_MEMORY(antigravity)=CONCERNSの初回判定を受け、有効指摘6件を1ラウンドで修正・再検証済み(下記改訂履歴)。再判定待ち。

## 次に実行すべきアクション

**T5-1(PR #3)はorigin/mainへの追従merge済み(mainへはまだ未マージ)・レビュー指摘対応済み・再判定待ち。** 次は以下:

1. `agent/t5-1-quality-gates`(PR #3)に対しREVIEWER/QA_MEMORYの再レビューを実施。
2. T3-1(最小React実験)の実装を継続。
3. 未解決リスクの`@astrojs/check`依存のyaml脆弱性は保留方針を継続(ESLint/Playwright関連の追加でも新規混入なしを確認済み)。

## 人間判断待ちの事項

| 判断 | 準備済み材料 |
|---|---|
| `agent/t5-1-quality-gates`(PR #3)のマージ承認(mergeは人間専権 — AGENTS.md §3 C-1) | ローカル品質ゲート全緑(本ファイル「レビューの直近結果」参照)。REVIEWER/QA_MEMORYレビューは未実施のため、その結果も踏まえて判断されたい。 |
| ~~`chore/merge-delegation`ブランチのcommit 416963a(マージ権限をオーケストレータAIへ委任)の正当性確認~~ | **解消済み**: PR #2がmainへマージされ、新規約(mergeはレビューPASS+QA PASS+Copilotレビュー依頼済みを条件にオーケストレータAIが実施可)が正式に発効(AGENTS.md C-1/§8)。ただしT5-1(本PR #3)は着手時点の指示「マージはしない(人間専権)」に引き続き従う。 |

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
| 2026-07-04 | HUMAN + オーケストレータ | PR #1をmainへマージ。 |
| 2026-07-04 | IMPLEMENTER(Claude Code Sonnet) | T5-1完了: ESLint(flat config)導入・`.github/workflows/ci.yml`新設(PR + main push で typecheck/lint/build/test/E2E)・Playwright+`@axe-core/playwright`によるE2Eスモーク基盤(既存トップページのみ対象)。`npm run lint`/`typecheck`/`build`/`test:e2e`フレッシュ実行で全緑。ブランチ`agent/t5-1-quality-gates`(PR #3)。 |
| 2026-07-04 | オーケストレータ + IMPLEMENTER(T5-1) | 複数エージェントが共有していたローカル作業ツリー(リポジトリのプライマリチェックアウト)でT3-1担当エージェントとの競合が発生(実害なし・T5-1側の未コミット変更は`git stash`経由で全復旧・以後`agent/t5-1-quality-gates`用の独立worktreeで作業継続)。あわせてT5-1実装エージェントが`chore/merge-delegation`ブランチのcommit 416963a(マージ権限委任)の正当性を照会し、オーケストレータが根拠(制作者がUIで明示選択/当該変更はPR #2としてopenで自己承認不可のためPR #2のマージ自体が制作者本人の確認となる設計)を回答。 |
| 2026-07-04 | IMPLEMENTER(Claude Code Sonnet) | PR #1のmainマージに伴い、PR #3(`agent/t5-1-quality-gates`)をorigin/mainとmergeしてリベース。package.json/package-lock.jsonの競合(PR #1のreact/mdx/katex/vitest系とT5-1のeslint/playwright/axe系)を両立する形で解消。フレッシュ実行(typecheck/lint/build/test/test:e2e)で全緑を再確認。 |
| 2026-07-04 | HUMAN + Claude Code(オーケストレータ) | マージ権限を委任: レビューPASS+QA PASS+Copilotレビュー依頼済みを条件にオーケストレータAIがマージ可(制作者は事後監査)。AGENTS.md C-1/§8・DEVELOPMENT.md §6・CONSTITUTION.md・ORCHESTRATION_RUNBOOK(+template) を整合更新(Copilotレビュー指摘対応、PR #2としてmainへマージ済み)。 |
| 2026-07-04 | IMPLEMENTER(Claude Code Sonnet) | PR #2のmainマージに伴い、PR #3(`agent/t5-1-quality-gates`)を再度origin/mainとmergeしてリベース。AGENTS.md/DEVELOPMENT.mdはmain側(PR #2で更新済みのマージ権限委任規約)をそのまま採用。 |
| 2026-07-04 | IMPLEMENTER(Claude Code Sonnet) | PR #3への独立レビュー(REVIEWER=codex FAIL、QA_MEMORY=antigravity CONCERNS)を受け、有効指摘6件を修正: (1) eslint.config.jsのglobalsをsrc/**(browser)とconfig/e2e/テスト(node)で分離、(2) playwright.config.tsのwebServer.commandをCI/ローカルで分岐し二重ビルドを回避、(3) e2e/smoke.spec.tsにwaitForLoadState('networkidle')を追加、(4) ci.yml/AGENTS.md §4のnpm test関連コメントを現状(Vitest導入済み)に同期、(5) 本ファイルの「main統合」表現を「origin/mainへの追従merge(mainへは未マージ)」へ明確化、(6) PR本文へ@astrojs/markdown-remark直接依存化の根拠を追記。codex/antigravityが誤検知と判定したCritical/Major指摘(node-version-file解決可否・actionsタグ実在・engines.node欠如)はGitHub Actions実行(run 28674649303)とpackage.json既存記載で反証済みのため対応不要と判断。typecheck/lint/build/test/test:e2eをフレッシュ実行し全緑を再確認。 |
