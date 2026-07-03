# プロジェクト状態  (最終更新: 2026-07-04 / 更新者: `IMPLEMENTER` (Claude Code, T3-1 実装完了))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M1進行中。T1-2・T2-1完了(PR #1 マージ済み)。T3-1(InteractiveExperiment)実装完了 — 独立レビュー+QA待ち。**

- ブランチ: `agent/t3-1-impl`(最新 `main`=PR #1 マージ後 から作成)。
- リポジトリは公開済み: https://github.com/Gazelle221B/nabla 。GitHub Pages公開URL: https://gazelle221b.github.io/nabla/ (200確認済み)。
- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`、`docs/IMPLEMENTATION_PLAN.md` は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)導入済み。

## 作業中ブランチ

`agent/t3-1-impl`(T3-1: InteractiveExperiment。`npm run typecheck`/`build`/`test` フレッシュ緑、36テスト。独立レビュー+QA+人間承認後にマージ)。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。
- T1-2で `markdown.processor: unified({...})` API(Astro v7新形式)を採用。非推奨だった `markdown.remarkPlugins`/`markdown.rehypePlugins` の直接指定を廃止。
- **T3-1: Tier 1 図解ライブラリに Mafs(`mafs@^0.21.0`、MIT)を採用**(`docs/adr/ADR-002.md`、DESIGN §レンダリング戦略の Tier 1 既定に沿う)。数学は `lib/math`(純粋 TS)に残し、Mafs は描画層 `components/scenes/mafs/` のみに限定。
- **T3-1: 状態の単一の源(SSOT)を親 Island に一元化**。可動点は controlled な `MovablePoint` + 制約関数(直角維持 + `[1,5]` クランプ)で、ドラッグ・スライダー・数値入力すべてが親の `handleLegA/B` を通る。`useMovablePoint` フック(内部状態を持つ)は SSOT を二重化するため不採用。
- **T3-1: 残差の「≈0」判定を `lib/math/compare.ts`(`EPSILON`/`approximatelyZero`)に切り出し**、MATH_CONVENTIONS §2 のスケール相対誤差を描画層から使えるようにした(具体例+不変条件テスト付き)。
- **T3-1: Mafs はマウントまで描画しない(SSR で図が出ない)ため、`<noscript>` フォールバック文言 + 静的な定理記述を用意**(JS 無効でも本文と数式が読める。ビルド後の静的 HTML で出力を確認済み)。
- T3-1: コンポーネント結合テストのため devDependency に `jsdom`/`@testing-library/*`/`@vitejs/plugin-react` を追加し、`vitest.config.ts` を jsdom 環境+React 変換プラグインに更新(lib/math の純粋テストも同環境で緑)。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- `npm run lint`はまだ実体がない。ESLint導入時に追加する。
- devDependency `@astrojs/check` の依存先(`yaml`パッケージ、`yaml-language-server`経由)にmoderate severityの脆弱性(deeply nested YAML collectionsによるstack overflow、GHSA-48c2-rrv3-qjmp)が`npm audit`で検出されている。開発時の型チェックツールのみが依存し、ビルド成果物には含まれず、当プロジェクトが任意のYAML入力を解析する経路もないため実害は低いと判断し、`npm audit fix --force`(breaking change)は保留した。ESLint等追加時に再評価する。

## レビューの直近結果

- **T3-1 (ブランチ `agent/t3-1-impl`、PR #4)**: 独立レビュー **codex=CONCERNS / antigravity=CONCERNS**(数学的正しさ・学習設計・noscript・ADR-002 は QA 側で明示 PASS)。統合指摘5件を1ラウンドで修正済み:
  1. 数値入力の編集途中破壊 → 表示用ローカル文字列 state + 確定(blur/Enter)時 clamp、`type=text`+`inputMode=decimal`(type=number のブラウザ正規化回避)。
  2. 予想確定時のフォーカス喪失 → `useRef` で a スライダーへ明示フォーカス移動。
  3. `compare.ts`: `Math.max(1, scale)` → `Math.max(1, Math.abs(scale))`(負スケール対応)、テストも仕様更新。
  4. CSS `.noscript p` → `.noscript`(セレクタ不一致修正)。
  5. スライダーに `aria-labelledby`、数値入力に範囲ヒントの `aria-describedby` 付与。
  修正後 `typecheck`/`build`/`test` フレッシュ緑(39テスト)。ブラウザ実機確認(コンソール未処理例外0)は Chrome 拡張未接続のため未実施 → PR#3 マージ後の E2E スモーク(/lessons ページ追加)で担保する方針(team-lead 合意)。
- **T1-2 & T2-1 (PR #1 / ブランチ `agent/t1-2-t2-1-impl`、マージ済み)**:
  - `REVIEWER` (Codex / GPT-5.5 xhigh、`codex exec`直接実行・セッションログで実行検証済み): **PASS** — Critical/High 0件。2パス実行(read-only静的レビュー→workspace-writeでfresh test/typecheck/build取得)。詳細: `docs/REVIEW_REPORT.md`
  - `QA_MEMORY` (Antigravity / Gemini 3.5 Flash (High)、`agy --print`直接実行): **PASS** — 受け入れ条件はスコープ内PASS/スコープ外WAIVED、数学的誤りなし。詳細: `docs/QA_REPORT.md`
  - **プロセス監査記録**: 初回のラッパーエージェント経由の試行は、(a) Codex側=セッションログ不在によりCLI未実行の自己生成報告と判明、(b) Antigravity側=Bash安全分類器の一時障害でagy実行失敗しClaude代替検証、のためいずれも**無効として破棄**。上記PASSはオーケストレーターが直接起動した本物のCLI実行のみに基づく(判定者の別系統性を担保)。

## 次に実行すべきアクション

**T3-1 実装完了(`agent/t3-1-impl`)。** 次は以下:

1. T3-1 PR に対する独立レビュー(`REVIEWER`=Codex)+ QA(`QA_MEMORY`=Gemini)を実施(実装者≠レビュアー)。特に Mafs 採用(ADR-002)・SSOT の単一状態・アクセシビリティ(キーボード操作/aria/noscript)を確認。
2. レビュー+QA PASS 後、人間が `main` へマージ。
3. T4-1(記事として閉じる MDX 化。デモページ `src/pages/lessons/pythagorean-theorem.astro` は T3-1 検証用ハーネスであり、T4-1 で content collection の正式記事に置き換える)。
4. ESLint導入時に`npm run lint`を実コマンド化し、未解決リスクの脆弱性を再評価する。

## 人間判断待ちの事項

| 判断 | 準備済み材料 |
|---|---|
| **T3-1 PR のマージ承認**(mergeは人間専権 — AGENTS.md §3 C-1) | 実装完了(`agent/t3-1-impl`)。`typecheck`/`build`/`test` フレッシュ緑(36テスト)。ADR-002(Mafs 採用)記録済み。独立レビュー+QA 実施後に承認可否を判断 |
| **ADR-002(Mafs 採用)の承認** | `docs/adr/ADR-002.md`。DESIGN の Tier 1 既定に沿う MIT ライブラリ。数学/描画分離を維持 |

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
| 2026-07-04 | IMPLEMENTER(Claude Code) | T3-1完了: `InteractiveExperiment`(予想ゲート/制約付き可動点/スライダー+数値入力+矢印キー/残差ライブ表示/リセット/noscriptフォールバック)+ `PythagorasScene`(Mafs)+ `lib/math/compare.ts`。Mafs 0.21.0 採用(ADR-002)、LICENSES.md 同期。`typecheck`/`build`/`test`(36件)フレッシュ緑。ブランチ `agent/t3-1-impl` |
| 2026-07-04 | IMPLEMENTER(Claude Code) | T3-1 レビュー(codex/antigravity=CONCERNS)の統合指摘5件を修正: 数値入力の編集途中保持(text+inputMode+確定時clamp)/確定時フォーカス移動/`compare.ts` の `Math.abs(scale)`/CSS `.noscript` 修正/スライダー `aria-labelledby`。テスト39件緑 |
