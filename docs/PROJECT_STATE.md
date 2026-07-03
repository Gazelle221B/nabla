# プロジェクト状態  (最終更新: 2026-07-02 / 更新者: `ARCHITECT` (Claude Code, Step 1完了))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M0(規約類整備)・Step 1(空のAstroサイトをGitHub Pagesへ通す、T1-1)完了。** 次はT1-2(React+MDX+KaTeX統合)、続けてT2-1(三平方の定理の純粋数学モデル)。

- リポジトリは公開済み: https://github.com/Gazelle221B/nabla 。GitHub Pages公開URL: https://gazelle221b.github.io/nabla/ (200確認済み、favicon等のサブパスアセットも200)。
- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`(PLAN.md v1.0 + レンダリング戦略ハイブリッド確定版)、`docs/IMPLEMENTATION_PLAN.md`(M0〜M3・T0〜T5タスク分解)は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)を `/Users/kairyon/projects/conclave` から導入済み(`node conclave.js init`、`conclave check` PASS)。
- `docs/PROJECT_PLAN.md` に、2本の企画会話ログ(`meeting.md`, `meeting2.md`)の統合経緯・レンダリング戦略の対立解消の記録が残っている(本ファイルより詳細な物語が必要な時に参照)。**meeting.md/meeting2.mdは個人的な壁打ちログのため`.gitignore`で公開リポジトリから除外している**(ローカルには残存)。

## 作業中ブランチ

`main`(直接コミット済み、root commit `fd9b9f3`)。今後のコード実装タスクからは `agent/<task-id>-impl` を使用する。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- `npm run test`/`lint`はまだ実体がない(`typecheck`は`astro check`で導入済み・0 errors確認済み)。テストはStep 2(Vitest + fast-check)、lintはESLint導入時に追加する。
- devDependency `@astrojs/check` の依存先(`yaml`パッケージ、`yaml-language-server`経由)にmoderate severityの脆弱性(deeply nested YAML collectionsによるstack overflow、GHSA-48c2-rrv3-qjmp)が`npm audit`で検出されている。開発時の型チェックツールのみが依存し、ビルド成果物には含まれず、当プロジェクトが任意のYAML入力を解析する経路もないため実害は低いと判断し、`npm audit fix --force`(breaking change)は保留した。ESLint等追加時に再評価する。

## レビューの直近結果

なし(実装未着手のためレビューサイクル未実施)。T1-1はローカルビルド・プレビュー・本番URL(https://gazelle221b.github.io/nabla/ )への実疎通で自己検証済み(index/favicon.svg/favicon.ico すべて200)。

## 次に実行すべきアクション

**Step 1(T1-1)完了。** 次は以下:

1. T1-2: React + MDX + KaTeX統合。`npx astro add react mdx`等で導入し、サンプルMDX1本でビルド時KaTeX HTML化を確認。
2. T2-1(三平方の定理の純粋数学モデル `lib/math/pythagoras.ts` + 不変条件テスト)。この時点でVitest + fast-checkを導入し、`AGENTS.md` §4の`npm run test`を実コマンド化する。
3. ESLint導入時に`npm run lint`を実コマンド化し、未解決リスクの脆弱性を再評価する。

## 人間判断待ちの事項

現時点で人間判断待ちの事項はない(要件・設計・ガバナンス導入は全て確定済み)。

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
| 2026-07-04 | HUMAN + Claude Code(オーケストレータ) | マージ権限を委任: レビューPASS+QA PASS を条件にオーケストレータAIがマージ可(制作者は事後監査)。AGENTS.md C-1/§8・DEVELOPMENT.md §6 を更新 |
