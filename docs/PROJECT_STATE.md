# プロジェクト状態  (最終更新: 2026-07-02 / 更新者: `ARCHITECT` (Claude Code, T0系ドキュメント整備))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**要件定義・設計・実装計画・ガバナンス導入・M0(規約類整備)は完了。実装(コード)は未着手。** 次はStep 1(空のAstroサイトをGitHub Pagesへ通す)。

- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`(PLAN.md v1.0 + レンダリング戦略ハイブリッド確定版)、`docs/IMPLEMENTATION_PLAN.md`(M0〜M3・T0〜T5タスク分解)は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)を `/Users/kairyon/projects/conclave` から導入済み(`node conclave.js init`、`conclave check` PASS)。
- `docs/PROJECT_PLAN.md` に、2本の企画会話ログ(`meeting.md`, `meeting2.md`)の統合経緯・レンダリング戦略の対立解消の記録が残っている(本ファイルより詳細な物語が必要な時に参照)。

## 作業中ブランチ

なし(ドキュメント整備は `main` 上で直接実施。コード実装からは `agent/<task-id>-impl` を使用する)。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- `npm run test`/`lint`/`typecheck`等のコマンド(`AGENTS.md` §4)はまだ実体がない(package.json未作成、Step 1で確定)。

## レビューの直近結果

なし(実装未着手のためレビューサイクル未実施)。

## 次に実行すべきアクション

**T0系タスクは全て完了。** 次はStep 1(`docs/IMPLEMENTATION_PLAN.md` T1-1・T1-2)に着手する:

1. `git init`(現時点でnablaはgitリポジトリではない。conclaveはGit-native運用が前提のため、コード実装前に必要)。
2. T1-1: Astro初期化 + `astro.config.mjs`(site/base設定) + `.github/workflows/deploy.yml` + 仮トップページ。GitHub Pagesサブパスで200が返ることを確認。
3. T1-2: React + MDX + KaTeX統合。サンプルMDX1本でビルド時KaTeX HTML化を確認。
4. Step 1完了後、`AGENTS.md` §4の主要コマンド(`npm install`/`test`/`lint`/`typecheck`等)を実コマンドで更新する(現在はプレースホルダのまま)。
5. T2-1(三平方の定理の純粋数学モデル+不変条件テスト)へ進む。

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
