# プロジェクト状態  (最終更新: 2026-07-02 / 更新者: `IMPLEMENTER` (Claude Code Sonnet, T1-2+T2-1完了))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M1進行中。T1-2(React+MDX+KaTeX統合)・T2-1(三平方の定理の純粋数学モデル)完了。** 次はT3-1(最小React実験・InteractiveExperiment)。

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

なし(T1-2+T2-1のコードレビュー未実施。**マージ前に** REVIEWER(Codex) + QA_MEMORY(Gemini) のレビュー PASS + 人間承認が必要 — AGENTS.md §8 の三条件)。

## 次に実行すべきアクション

**T1-2・T2-1完了。** 次は以下:

1. `agent/t1-2-t2-1-impl` PR を REVIEWER(Codex) にレビュー依頼 → QA_MEMORY(Gemini) で数学的正しさ確認 → 人間承認後 `main` へマージ。
2. T3-1: 最小 React 実験(InteractiveExperiment)— `src/components/scenes/mafs/PythagorasScene.tsx` + `src/components/lesson/InteractiveExperiment.tsx`。予想・制約付き可動点・代替入力(数値入力/矢印キー)・残差表示・リセット。
3. ESLint導入時に`npm run lint`を実コマンド化し、未解決リスクの脆弱性を再評価する。

## 人間判断待ちの事項

現時点で人間判断待ちの事項はない(T1-2+T2-1 は自動検証済み)。

| 判断 | 準備済み材料 |
|---|---|
| (なし) | |

## 改訂履歴

| 日時 | 更新者 | 変更 |
|---|---|---|
| 2026-07-02 | HUMAN + Claude Code | meeting.md/meeting2.md からdocs/PROJECT_PLAN.md(統合計画書)を作成 |
| 2026-07-02 | HUMAN + Claude Code | レンダリング戦略をハイブリッド(Tier1〜3)で確定 |
| 2026-07-02 | ARCHITECT(Claude Code) | conclaveガバナンス導入。AGENTS.md/REQUIREMENTS.md/DESIGN.md/IMPLEMENTATION_PLAN.md/PROJECT_STATE.md を作成 |
| 2026-07-02 | ARCHITECT(Claude Code) | Tier 3をThree.js(3a)/WebGPU(3b)へ分割。全ガバナンス文書を同期 |
| 2026-07-02 | ARCHITECT(Claude Code) | T0系タスク完了。`MATH_CONVENTIONS.md`(GPL/CC BY-SA正文はgnu.org/creativecommons.orgから取得)、`LICENSE`/`LICENSE-CODE`/`LICENSE-CONTENT`/`LICENSES.md`、`DEVELOPMENT.md`、`CONTRIBUTING.md`、`docs/adr/ADR-001.md`+`INDEX.md` を作成 |
| 2026-07-02 | IMPLEMENTER(Claude Code Sonnet) | T1-2完了: React+MDX+KaTeX統合。T2-1完了: `src/lib/math/pythagoras.ts` + Vitest+fast-check 不変条件テスト(20件全GREEN、seed=42)。`npm run test/typecheck/build` 全通過。ブランチ `agent/t1-2-t2-1-impl`。 |
