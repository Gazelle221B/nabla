# プロジェクト状態  (最終更新: 2026-07-04 / 更新者: `IMPLEMENTER` (Claude Code, T3-1 の main 追従・E2E 拡張))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M1進行中。T1-2・T2-1(PR #1)・T5-1 品質ゲート一式(PR #3)ともに main へマージ済み。T3-1(InteractiveExperiment、PR #4)は実装+レビュー指摘対応済みで、最新 main を追従 merge し E2E スモークを /lessons ページへ拡張する最終工程中。**

- T5-1 で main に入ったもの: ESLint(flat config, `eslint.config.js`)、`.github/workflows/ci.yml`(pull_request + main push で typecheck/lint/build/test/E2E)、Playwright + `@axe-core/playwright` による E2E スモーク基盤(`e2e/smoke.spec.ts`、`playwright.config.ts`)。
- `npm run test`(Vitest + fast-check)/`typecheck`(astro check)/`lint`(eslint)/`build`/`test:e2e`(Playwright+axe)はすべて実体化済み。
- リポジトリは公開済み: https://github.com/Gazelle221B/nabla 。GitHub Pages公開URL: https://gazelle221b.github.io/nabla/ (200確認済み)。
- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`、`docs/IMPLEMENTATION_PLAN.md` は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)導入済み。

## 作業中ブランチ

`agent/t3-1-impl`(T3-1: InteractiveExperiment、PR #4)。origin/main(PR #3 マージ後)を追従 merge 済み。`agent/t1-2-t2-1-impl`(PR #1)・`agent/t5-1-quality-gates`(PR #3)はマージ済みのため以後使用しない。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。
- T1-2で `markdown.processor: unified({...})` API(Astro v7新形式)を採用。非推奨だった `markdown.remarkPlugins`/`markdown.rehypePlugins` の直接指定を廃止。
- **T3-1: Tier 1 図解ライブラリに Mafs(`mafs@^0.21.0`、MIT)を採用**(`docs/adr/ADR-002.md`、DESIGN §レンダリング戦略の Tier 1 既定に沿う)。数学は `lib/math`(純粋 TS)に残し、Mafs は描画層 `components/scenes/mafs/` のみに限定。
- **T3-1: 状態の単一の源(SSOT)を親 Island に一元化**。可動点は controlled な `MovablePoint` + 制約関数(直角維持 + `[1,5]` クランプ)で、ドラッグ・スライダー・数値入力すべてが親の `handleLegA/B` を通る。`useMovablePoint` フック(内部状態を持つ)は SSOT を二重化するため不採用。
- **T3-1: 残差の「≈0」判定を `lib/math/compare.ts`(`EPSILON`/`approximatelyZero`)に切り出し**、MATH_CONVENTIONS §2 のスケール相対誤差を描画層から使えるようにした(具体例+不変条件テスト付き)。負スケールは大きさで扱う(`Math.max(1, Math.abs(scale))`)。
- **T3-1: Mafs はマウントまで描画しない(SSR で図が出ない)ため、`<noscript>` フォールバック文言 + 静的な定理記述を用意**(JS 無効でも本文と数式が読める。ビルド後の静的 HTML で出力を確認済み)。
- T3-1: コンポーネント結合テストのため devDependency に `jsdom`/`@testing-library/*`/`@vitejs/plugin-react` を追加し、`vitest.config.ts` を jsdom 環境+React 変換プラグインに更新(T5-1 の `exclude: e2e/**` と統合)。
- T3-1: 数値入力は `type=text`+`inputMode=decimal` にし表示用ローカル文字列 state を持たせ、確定(blur/Enter)時に clamp して数値 state へ反映(`type=number` はブラウザが "1." 等の入力途中を空へ正規化するため)。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- devDependency `@astrojs/check` の依存先(`yaml`パッケージ、`yaml-language-server`経由)にmoderate severityの脆弱性(deeply nested YAML collectionsによるstack overflow、GHSA-48c2-rrv3-qjmp)が`npm audit`で検出されている。開発時の型チェックツールのみが依存し、ビルド成果物には含まれず、当プロジェクトが任意のYAML入力を解析する経路もないため実害は低いと判断し、`npm audit fix --force`(breaking change)は保留した。

## レビューの直近結果

- **T3-1 (ブランチ `agent/t3-1-impl`、PR #4)**: 独立レビュー **codex=CONCERNS / antigravity=CONCERNS**(数学的正しさ・学習設計・noscript・ADR-002 は QA 側で明示 PASS)。統合指摘5件を1ラウンドで修正済み: (1) 数値入力の編集途中破壊 → 表示用ローカル文字列 state + 確定時 clamp、`type=text`+`inputMode=decimal`。(2) 予想確定時のフォーカス喪失 → `useRef` で a スライダーへフォーカス移動。(3) `compare.ts` を `Math.max(1, Math.abs(scale))` に。(4) CSS `.noscript p` → `.noscript`。(5) スライダー `aria-labelledby` + 数値入力 `aria-describedby`。修正後 `typecheck`/`build`/`test` フレッシュ緑(39テスト)。最終工程で最新 main を追従 merge し、E2E スモークを /lessons/pythagorean-theorem へ拡張(コンソール例外0・axe Critical/Serious 0・予想→操作→残差の基本フロー)。
- **T5-1 (PR #3、マージ済み)**: REVIEWER(codex)=FAIL・QA_MEMORY(antigravity)=CONCERNS の初回判定を受け、有効指摘6件を1ラウンドで修正・再検証。人間/オーケストレータ承認を経て main へマージ済み。
- **T1-2 & T2-1 (PR #1、マージ済み)**: `REVIEWER`(Codex/GPT-5.5 xhigh)・`QA_MEMORY`(Antigravity/Gemini)ともに **PASS**。Copilot指摘8件対応済み。詳細: `docs/REVIEW_REPORT.md` / `docs/QA_REPORT.md`。

## 次に実行すべきアクション

**T3-1(PR #4)は最新 main 追従 + E2E 拡張 + 全ゲートフレッシュ実行の最終工程中。** 次は以下:

1. T3-1 の全ゲート(typecheck/lint/build/test/test:e2e)フレッシュ緑を確認して push。
2. オーケストレーターが Copilot レビュー → マージ。
3. T4-1(記事として閉じる MDX 化。デモページ `src/pages/lessons/pythagorean-theorem.astro` は T3-1 検証用ハーネスであり、T4-1 で content collection の正式記事に置き換える)。

## 人間判断待ちの事項

| 判断 | 準備済み材料 |
|---|---|
| **T3-1 PR #4 のマージ**(レビューPASS+QA PASS+Copilotレビュー依頼済みを条件にオーケストレータが実施、制作者は事後監査 — AGENTS.md C-1/§8) | 実装+レビュー指摘対応完了。全ゲートフレッシュ緑 + E2E スモーク(/lessons)で実ブラウザ検証。ADR-002(Mafs 採用)記録済み。 |
| **ADR-002(Mafs 採用)の承認** | `docs/adr/ADR-002.md`。DESIGN の Tier 1 既定に沿う MIT ライブラリ。数学/描画分離を維持。 |

## 改訂履歴

| 日時 | 更新者 | 変更 |
|---|---|---|
| 2026-07-02 | HUMAN + Claude Code | meeting.md/meeting2.md からdocs/PROJECT_PLAN.md(統合計画書)を作成 |
| 2026-07-02 | HUMAN + Claude Code | レンダリング戦略をハイブリッド(Tier1〜3)で確定 |
| 2026-07-02 | ARCHITECT(Claude Code) | conclaveガバナンス導入。AGENTS.md/REQUIREMENTS.md/DESIGN.md/IMPLEMENTATION_PLAN.md/PROJECT_STATE.md を作成 |
| 2026-07-02 | ARCHITECT(Claude Code) | Tier 3をThree.js(3a)/WebGPU(3b)へ分割。全ガバナンス文書を同期 |
| 2026-07-02 | ARCHITECT(Claude Code) | T0系タスク完了。`MATH_CONVENTIONS.md`、`LICENSE`系、`DEVELOPMENT.md`、`CONTRIBUTING.md`、`docs/adr/ADR-001.md`+`INDEX.md` を作成 |
| 2026-07-02 | IMPLEMENTER(Claude Code Sonnet) | T1-2完了: React+MDX+KaTeX統合。T2-1完了: `src/lib/math/pythagoras.ts` + Vitest+fast-check 不変条件テスト(20件全GREEN、seed=42)。ブランチ `agent/t1-2-t2-1-impl`。 |
| 2026-07-02 | QA_MEMORY(Gemini) | T1-2+T2-1 (PR #1) のQAレビュー完了。QA_REPORT.md を作成し、品質ゲート判定を PASS とする。 |
| 2026-07-02 | ARCHITECT(Claude Code) | ゲートのプロセス監査: ラッパー経由の初回レビュー/QA試行を無効と判定し破棄。codex exec と agy を直接実行し両ゲート正規PASS。REVIEW_REPORT.md作成 |
| 2026-07-04 | HUMAN + オーケストレータ | PR #1をmainへマージ。 |
| 2026-07-04 | HUMAN + Claude Code(オーケストレータ) | マージ権限を委任(レビューPASS+QA PASS+Copilotレビュー依頼済みが条件、制作者は事後監査)。AGENTS.md C-1/§8・DEVELOPMENT.md §6・CONSTITUTION.md・ORCHESTRATION_RUNBOOK を整合更新(PR #2としてmainへマージ済み)。 |
| 2026-07-04 | IMPLEMENTER(Claude Code Sonnet) | T5-1完了: ESLint(flat config)・`.github/workflows/ci.yml`・Playwright+`@axe-core/playwright` E2Eスモーク基盤。レビュー指摘6件対応後、PR #3としてmainへマージ済み。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T3-1完了: `InteractiveExperiment`(予想ゲート/制約付き可動点/スライダー+数値入力+矢印キー/残差ライブ表示/リセット/noscriptフォールバック)+ `PythagorasScene`(Mafs)+ `lib/math/compare.ts`。Mafs 0.21.0 採用(ADR-002)、LICENSES.md 同期。ブランチ `agent/t3-1-impl`(PR #4) |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T3-1 レビュー(codex/antigravity=CONCERNS)の統合指摘5件を修正: 数値入力の編集途中保持/確定時フォーカス移動/`compare.ts` の `Math.abs(scale)`/CSS `.noscript`/スライダー `aria-labelledby`。テスト39件緑 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T3-1: origin/main(PR #3 マージ後)を追従 merge(vitest.config は jsdom+setupFiles と exclude:e2e を統合、package.json devDeps は両立)。E2E スモークを /lessons/pythagorean-theorem へ拡張(コンソール例外0・axe・予想→操作→残差フロー)。全ゲートフレッシュ再確認。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T3-1 Copilot 指摘対応(6件): `compare.ts` を非有限入力で RangeError(MATH_CONVENTIONS §3、テスト更新)/ E2E の「コンソール未処理例外0」を console.error 収集+アサートに格上げ(2件)/ ADR-002・INDEX のステータスを「Accepted(PR #4 マージで確定)」に統一。全ゲート(typecheck/lint/build/test 39件/test:e2e 6件)フレッシュ緑。T3-1 は PR #4 として main へマージ済み。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T4-1(三平方の定理の記事、ブランチ `agent/t4-1-impl`/PR): content collection 導入(`src/content.config.ts` curriculum スキーマ C-2 準拠、`zod` 直接 import)+ 記事 MDX(`src/content/lessons/geometry/pythagorean-theorem.mdx`: 学習目標2/操作前予想/代表的誤解/転用問題/JS無効でも本文・数式可読)+ 動的ルート `[slug].astro`(検証ハーネス .astro を置換)。スライダーと数値入力のアクセシブルネームを区別。全ゲート(typecheck 0/ lint/ build/ test 39/ e2e 6)フレッシュ緑。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T4-1 レビュー(codex/antigravity=CONCERNS)の指摘7件を修正: zod を `astro/zod` へ(直接依存削除)/ C-2 実在性の unit テスト追加(全 lessons 走査)/ `[slug].astro` に slug 衝突ビルド時 throw / E2E を data-hydrated 待ち+ビューポート拡大で堅牢化 / 記事の鋭角鈍角の係り受け修正・「残差」→「差」平易化(コンポーネント UI も同期)・JS無効ナビ noscript 追加。全ゲート(typecheck 0/0/0・lint・build・test 42・e2e 6)フレッシュ緑。PR #5 として main へマージ済み。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | M2完了: `lib/math/derivative.ts`(差分商・微分係数・接線/割線、非有限入力は RangeError)+ Vitest/fast-check 不変条件テスト17件(割線が h→0 で微分係数に収束/割線・接線が定義点を通る、など自己確認的でない検証)。`DerivativeScene`(Mafs)+ `DerivativeExperiment`(予想ゲート/可動点+h スライダー/数値入力/観察テーブル/noscript、InteractiveExperiment と同パターン)+ 記事 `src/pages/lessons/derivative-tangent-line.mdx`(学習目標2個・誤解「h=0を代入」・転用問題)。E2Eスモークを同ページへ拡張(9件全緑、client:visible ハイドレーションのタイミング起因フレークを対処: scrollIntoViewIfNeeded の交差率境界問題をビューポート拡大で構造的に解消)。全ゲート(typecheck/lint/build/test 68件/test:e2e 9件)フレッシュ緑。ブランチ `agent/m2-impl`。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | PR #6 レビュー(codex=CONCERNS/antigravity=PASS)の統合指摘4件を修正: (1) 収束の property テストが「h を縮めれば誤差が単調に減る」という一般には偽の不変条件だったため、平均値定理の剰余(誤差 <= \|h\|/2 * 2階微分の上界)に基づく検証へ書き換え(5シード×numRuns=20000で安定性確認済み)。(2) `differenceQuotient`/`secantLine` の approximatelyZero 境界(EPSILON/2)での RangeError を明示テスト。(3) DerivativeScene の viewBox 計算が誤っており(y上限を`f(hi)*0.55`で「縮小」していたバグ)、a・h をともに最大にすると点がはみ出す不具合を修正(`maxH` を新規propとして渡し、y上限を`f(hi)+2`に是正、スクリーンショットで目視確認済み)。(4) E2Eに標準ビューポート+明示スクロールの実ユーザー経路テストを追加。追加中に判明: 前回の「scrollIntoViewIfNeeded の交差率境界問題」という診断は誤りで、真因は「ラジオボタンは同一選択肢の再クリックでは change が再発火しないため、ハイドレーション未接続時の初回クリック消失後は同一ラジオへのリトライが恒久的に空振りする」というネイティブHTML仕様だった。別選択肢と交互にクリックする `selectPredictionRobustly` ヘルパーで解消(5/5成功・初回試行・100ms未満を確認)。全ゲート(typecheck/lint/build/test 71件/test:e2e 10件)をフレッシュ実行し、e2eはフルスイートを5回連続実行して安定を確認。push済み(奇しくも PR #5 の T4-1 側でも同じラジオ change 再発火問題が独立に発見され、`selectPredictionRobustly`/`data-hydrated` の組み合わせで解消されていた。両者一致する診断)。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | PR #5(T4-1、main マージ済み)を追従 merge。記事を `src/pages/lessons/derivative-tangent-line.mdx` から content collection `src/content/lessons/calculus/derivative-tangent-line.mdx` へ移行(curriculum type=mext/stage=high-school/guidelineYear=2018、learningGoals 2件、prerequisites=[]、動的ルート `[slug].astro` に描画を委譲)。`DerivativeExperiment` に `data-hydrated` シグナルとスライダー/数値入力のアクセシブルネーム分離を追加(InteractiveExperiment と同じ形へ統一)。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | 上記マージ・移行を完了: 記事本文の重複 H1・手書き学習目標ブロックを削除([slug].astro が frontmatter から自動描画するため)、記事末尾に Pythagoras と同型の JS 無効ナビ `<noscript>` を追加。e2e/smoke.spec.ts の `selectPredictionRobustly` 重複定義(T4-1 側と m2 側で同名関数が競合)を1つに統合し、両ページの data-hydrated 待ちを追加。スライダー名変更 (`(スライダー)` 接尾辞) に伴いユニット/E2E テストのロケータを追随。URL は `/lessons/derivative-tangent-line/` のまま(slug 衝突なし)。C-2 の prerequisites テストが新記事を正しく走査することを確認(5件緑)。全ゲート(typecheck 0/0/0・lint・build・test 76件・test:e2e 10件)をフレッシュ実行し、e2e はフルスイートを4回連続実行して安定を確認。push 済み。 |
