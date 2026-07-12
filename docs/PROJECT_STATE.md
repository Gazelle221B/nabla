# プロジェクト状態  (最終更新: 2026-07-12 / 更新者: `ORCHESTRATOR` (Claude Code Fable 5, MVP 1 統合検証・完了確認))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**MVP 1 実装完了。M1(三平方の定理)・M2(微分係数と接線)・M3(2×2行列と固有ベクトル)の全 PR(#1〜#7)が main にマージ済み。統合後 main HEAD で全品質ゲートをフレッシュ再検証し、DoD の全項目(Lighthouse Accessibility 全ページ 100 を含む)を実測で充足確認。** 最後の仕上げとして、公開済み3記事へのホーム導線追加とトップページ a11y 是正を PR #8 で対応中(レビュー通過後マージで MVP 1 完了)。

- **統合検証(2026-07-12、統合 main 93600d4 上でフレッシュ実行)**: `typecheck` 0 errors(29 files)/ `lint` clean / `test`(Vitest+fast-check)**140 件全緑**(8 ファイル)/ `build` 5 ページ / `test:e2e`(Playwright+axe)**13 件全緑**(3記事すべてで axe Critical/Serious 0・コンソール例外 0・予想→操作→観測フロー)。M1/M2/M3 の統合による回帰ゼロ。
- **Lighthouse Accessibility 実測(2026-07-12)**: 3記事ページ = 100、トップページ = 94(唯一の減点 `landmark-one-main`)。PR #8 で `<main>` 追加により **全4ページ 100** を達成。DoD「Lighthouse Accessibility 原則100」を推論ではなく実測で closure。
- 実装済みの成果: 数学モデル `lib/math/{pythagoras,derivative,eigen,compare}.ts`(純粋 TS、不変条件テスト)+ Mafs 図解 `scenes/mafs/{Pythagoras,Derivative,Eigenvector}Scene.tsx` + 対話 Island `lesson/{InteractiveExperiment,DerivativeExperiment,EigenvectorExperiment}.tsx` + content collection 記事3本 + 動的ルート `[slug].astro` + C-2 実在性テスト。
- 品質ゲート基盤(T5-1): ESLint(flat config)、`.github/workflows/{ci,deploy}.yml`、Playwright + `@axe-core/playwright` E2E。CI・Deploy とも main で success。
- リポジトリ公開: https://github.com/Gazelle221B/nabla 。GitHub Pages: https://gazelle221b.github.io/nabla/ (トップ+3記事すべて **200** 実配信確認、記事はサーバー HTML に KaTeX 数式+`<noscript>` フォールバックを含み JS 無効でも本文・数式が読める)。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)導入済み。

## 作業中ブランチ

`agent/homepage-nav-a11y-impl`(PR #8: ホーム導線+トップ a11y 是正)。最新 main(93600d4)から分岐。M1〜M3 の各実装ブランチ(`agent/t1-2-t2-1-impl`, `agent/t5-1-quality-gates`, `agent/t3-1-impl`, `agent/t4-1-impl`, `agent/m2-impl`, `agent/m3-impl`)はすべてマージ済みで以後使用しない。

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

- **MVP 1 統合検証 (2026-07-12、ORCHESTRATOR=Claude Code Fable 5)**: M1/M2/M3 は別ブランチ・別 worktree で実装・個別マージされたため、統合 main HEAD での回帰有無が本質リスク。全ゲートをフレッシュ実行して**回帰ゼロ**を確認(unit 140 / e2e 13 / typecheck 0 / lint / build 5p)。加えて Lighthouse Accessibility を全ページ実測し、トップの `landmark-one-main` 減点(94)を発見 → PR #8 で是正。
- **PR #8 (ブランチ `agent/homepage-nav-a11y-impl`、ホーム導線+トップ a11y)**: 実装=ORCHESTRATOR。独立 REVIEWER=Codex(実装者≠レビュアー)へ差分レビュー依頼、GitHub Copilot コードレビューを PR にリクエスト済み。数学・記事本文の変更を含まないため QA_MEMORY(数学/学習設計)の追加検証は非該当。全ゲート+Lighthouse 全4ページ 100 をフレッシュ確認。
- **T3-1 (ブランチ `agent/t3-1-impl`、PR #4)**: 独立レビュー **codex=CONCERNS / antigravity=CONCERNS**(数学的正しさ・学習設計・noscript・ADR-002 は QA 側で明示 PASS)。統合指摘5件を1ラウンドで修正済み: (1) 数値入力の編集途中破壊 → 表示用ローカル文字列 state + 確定時 clamp、`type=text`+`inputMode=decimal`。(2) 予想確定時のフォーカス喪失 → `useRef` で a スライダーへフォーカス移動。(3) `compare.ts` を `Math.max(1, Math.abs(scale))` に。(4) CSS `.noscript p` → `.noscript`。(5) スライダー `aria-labelledby` + 数値入力 `aria-describedby`。修正後 `typecheck`/`build`/`test` フレッシュ緑(39テスト)。最終工程で最新 main を追従 merge し、E2E スモークを /lessons/pythagorean-theorem へ拡張(コンソール例外0・axe Critical/Serious 0・予想→操作→残差の基本フロー)。
- **T5-1 (PR #3、マージ済み)**: REVIEWER(codex)=FAIL・QA_MEMORY(antigravity)=CONCERNS の初回判定を受け、有効指摘6件を1ラウンドで修正・再検証。人間/オーケストレータ承認を経て main へマージ済み。
- **T1-2 & T2-1 (PR #1、マージ済み)**: `REVIEWER`(Codex/GPT-5.5 xhigh)・`QA_MEMORY`(Antigravity/Gemini)ともに **PASS**。Copilot指摘8件対応済み。詳細: `docs/REVIEW_REPORT.md` / `docs/QA_REPORT.md`。

## 次に実行すべきアクション

**MVP 1 の実装・検証は完了。残りは PR #8 の統合のみ。** 次は以下:

1. PR #8 の CI(quality-gates)緑 + 独立 Codex レビュー + Copilot レビューを確認し、指摘(あれば Critical 級)を解消。
2. オーケストレーターが PR #8 を main へマージ → これをもって **MVP 1 完了**(3記事すべてが「教材/操作/技術」DoD を充足、Lighthouse a11y 全4ページ 100)。
3. マージ後デプロイ(GitHub Pages)が success かつ公開 URL が 200 を返すことを確認。
4. (MVP 1 完了後・別スコープ)M2/M3 の公開ベータ運用に向けた HUMAN レビュー、商標検索、教育効果検証の被験者確保は憲法 C-4 のスコープ外として別途計画する。

## 人間判断待ちの事項

| 判断 | 準備済み材料 |
|---|---|
| **MVP 1 完了の追認(事後監査)**(マージ自体は C-1/§8 によりオーケストレータが実施可。制作者は GitHub 上で事後監査・随時 revert 可) | 全 DoD 項目の実測証跡(unit 140 / e2e 13 / Lighthouse a11y 全4ページ 100 / 公開 URL 200 / JS 無効可読)。3記事の数学的正しさは実装者と別エージェント(codex/antigravity)で検証済み(C-5)。 |
| **公開ベータの一般公開 / 商標「nabla・ナブラ」検索**(AGENTS.md §1: 正式公開前に商標検索) | サイトは技術的に公開状態(GitHub Pages 200)。一般告知・命名確定は HUMAN 判断。 |

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
| 2026-07-04 | IMPLEMENTER(Claude Code, 隔離worktree `nabla-m3`) | M3完了: `lib/math/eigen.ts`(2×2行列の作用・固有値/固有ベクトル・4状態分類・平行判定・符号連続性の3分割API)+ `EigenvectorScene`(Mafs)+ `EigenvectorExperiment`(予想ゲート/単位円上の可動点/角度スライダー+数値入力/行列プリセット切替/残差・平行度ライブ表示)+ 記事ページ `src/pages/lessons/eigenvectors.astro`。単位行列・回転行列の誤分類事故(AGENTS.md §7)の回帰テストを含む不変条件テストを追加。ブランチ `agent/m3-impl`(PR #7)。レビュー(codex)指摘に基づき判別式を数値安定形 (a−d)²+4bc へ書き換え・分類を判別式符号のみで判定(epsilon幅撤廃)・重解時の下位分類も exact zero 判定へ変更・isParallel をオーバーフロー耐性のある正規化へ変更。全ゲート(typecheck/lint/build/test 100件/test:e2e 9件)フレッシュ緑、新規依存なし。 |
| 2026-07-04 | IMPLEMENTER(Claude Code, 隔離worktree `nabla-m3`) | M3最終統合: T4-1 と同じ content collection 方式へ記事を移行(`src/pages/lessons/eigenvectors.astro` を削除し `src/content/lessons/linear-algebra/eigenvectors.mdx` へ、frontmatter は `content.config.ts` の independent curriculum スキーマ準拠・learningGoals 2 個・prerequisites 空配列)。描画は動的ルート `[slug].astro` に一本化、URL は `/lessons/eigenvectors/` のまま維持(E2E で確認)。全ゲート(typecheck/lint/build/test 105件・C-2 実在性テスト含む/e2e 9件)フレッシュ緑。 |
| 2026-07-04 | IMPLEMENTER(Claude Code, 隔離worktree `nabla-m3`) | 再QA(Gemini)指摘のテキスト3件のうち2件を修正: 固有値の定義を負の固有値でも破綻しない表現に(向きが反対の場合は負の符号をつける旨を補足)/ 転用問題の解答の式変形順序を因数分解→=0の自然な流れに修正。誤字1件は現行ファイルに該当箇所なしと判断(対応不要)。build/typecheckフレッシュ緑。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | M2完了: `lib/math/derivative.ts`(差分商・微分係数・接線/割線、非有限入力は RangeError)+ Vitest/fast-check 不変条件テスト17件(割線が h→0 で微分係数に収束/割線・接線が定義点を通る、など自己確認的でない検証)。`DerivativeScene`(Mafs)+ `DerivativeExperiment`(予想ゲート/可動点+h スライダー/数値入力/観察テーブル/noscript、InteractiveExperiment と同パターン)+ 記事 `src/pages/lessons/derivative-tangent-line.mdx`(学習目標2個・誤解「h=0を代入」・転用問題)。E2Eスモークを同ページへ拡張(9件全緑、client:visible ハイドレーションのタイミング起因フレークを対処: scrollIntoViewIfNeeded の交差率境界問題をビューポート拡大で構造的に解消)。全ゲート(typecheck/lint/build/test 68件/test:e2e 9件)フレッシュ緑。ブランチ `agent/m2-impl`。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | PR #6 レビュー(codex=CONCERNS/antigravity=PASS)の統合指摘4件を修正: (1) 収束の property テストが「h を縮めれば誤差が単調に減る」という一般には偽の不変条件だったため、平均値定理の剰余(誤差 <= \|h\|/2 * 2階微分の上界)に基づく検証へ書き換え(5シード×numRuns=20000で安定性確認済み)。(2) `differenceQuotient`/`secantLine` の approximatelyZero 境界(EPSILON/2)での RangeError を明示テスト。(3) DerivativeScene の viewBox 計算が誤っており(y上限を`f(hi)*0.55`で「縮小」していたバグ)、a・h をともに最大にすると点がはみ出す不具合を修正(`maxH` を新規propとして渡し、y上限を`f(hi)+2`に是正、スクリーンショットで目視確認済み)。(4) E2Eに標準ビューポート+明示スクロールの実ユーザー経路テストを追加。追加中に判明: 前回の「scrollIntoViewIfNeeded の交差率境界問題」という診断は誤りで、真因は「ラジオボタンは同一選択肢の再クリックでは change が再発火しないため、ハイドレーション未接続時の初回クリック消失後は同一ラジオへのリトライが恒久的に空振りする」というネイティブHTML仕様だった。別選択肢と交互にクリックする `selectPredictionRobustly` ヘルパーで解消(5/5成功・初回試行・100ms未満を確認)。全ゲート(typecheck/lint/build/test 71件/test:e2e 10件)をフレッシュ実行し、e2eはフルスイートを5回連続実行して安定を確認。push済み(奇しくも PR #5 の T4-1 側でも同じラジオ change 再発火問題が独立に発見され、`selectPredictionRobustly`/`data-hydrated` の組み合わせで解消されていた。両者一致する診断)。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | PR #5(T4-1、main マージ済み)を追従 merge。記事を `src/pages/lessons/derivative-tangent-line.mdx` から content collection `src/content/lessons/calculus/derivative-tangent-line.mdx` へ移行(curriculum type=mext/stage=high-school/guidelineYear=2018、learningGoals 2件、prerequisites=[]、動的ルート `[slug].astro` に描画を委譲)。`DerivativeExperiment` に `data-hydrated` シグナルとスライダー/数値入力のアクセシブルネーム分離を追加(InteractiveExperiment と同じ形へ統一)。 |
| 2026-07-04 | IMPLEMENTER(Claude Code) | 上記マージ・移行を完了: 記事本文の重複 H1・手書き学習目標ブロックを削除([slug].astro が frontmatter から自動描画するため)、記事末尾に Pythagoras と同型の JS 無効ナビ `<noscript>` を追加。e2e/smoke.spec.ts の `selectPredictionRobustly` 重複定義(T4-1 側と m2 側で同名関数が競合)を1つに統合し、両ページの data-hydrated 待ちを追加。スライダー名変更 (`(スライダー)` 接尾辞) に伴いユニット/E2E テストのロケータを追随。URL は `/lessons/derivative-tangent-line/` のまま(slug 衝突なし)。C-2 の prerequisites テストが新記事を正しく走査することを確認(5件緑)。全ゲート(typecheck 0/0/0・lint・build・test 76件・test:e2e 10件)をフレッシュ実行し、e2e はフルスイートを4回連続実行して安定を確認。push 済み。 |
| 2026-07-12 | ORCHESTRATOR(Claude Code Fable 5) | ローカルが 2026-07-02 の古いスナップショットだったため origin/main(93600d4、PR #1〜#7 全マージ済み)へ同期。廃棄済みの ESLint 手動ブランチ(PR #3 で置換)を stash 退避のうえ整理。 |
| 2026-07-12 | ORCHESTRATOR(Claude Code Fable 5) | MVP 1 統合検証: 統合 main HEAD で全ゲートをフレッシュ実行し回帰ゼロを確認(typecheck 0/29 files・lint・test 140 件・build 5p・test:e2e 13 件、axe Critical/Serious 0・コンソール例外 0)。GitHub Pages 実配信(トップ+3記事 200、KaTeX 数式+noscript を server HTML で確認)。CI/Deploy とも main で success。 |
| 2026-07-12 | ORCHESTRATOR(Claude Code Fable 5) | Lighthouse Accessibility を全ページ実測(記事3本=100、トップ=94)。トップ唯一の減点 `landmark-one-main` を PR #8 で是正: `src/pages/index.astro` に `<main>` を追加(BaseLayout ではなく index 側に置き記事側 `<main>` と二重化させない)、`lang=\"en\"`→`\"ja\"`、公開3単元を content collection から動的に一覧リンク(到達性確保、C-4 スコープ内)。全ゲート+Lighthouse 全4ページ 100 をフレッシュ確認。独立レビューは Codex(GPT 上限で失敗)→ GrokBuild へフォールバック、Copilot レビューを PR #8 にリクエスト。 |
