# プロジェクト状態  (最終更新: 2026-07-04 / 更新者: `IMPLEMENTER` (Claude Code Sonnet, T5-1実装))

> ★ **これが真の記憶である。** 全エージェントが随時更新する。大コンテキストモデルの内部記憶を真実の源にしない。
> どのエージェントが落ちても・交代しても、このファイルを読めば継続できる状態を保つ。

## 現在のフェーズ

**M0(規約類整備)・Step 1(T1-1)完了。T5-1(品質ゲート一式)を`main`起点のブランチ`agent/t5-1-quality-gates`で実装しPRレビュー待ち。** T1-2/T2-1はPR #1(`agent/t1-2-t2-1-impl`)としてレビューPASS済み・マージ待ち(本更新時点で未マージ)。T5-1はPR #1と並行してmain起点で進めたため、マージ順によりどちらかでリベースが必要になる見込み。

- T5-1で導入したもの: ESLint(flat config, `eslint.config.js`。`@eslint/js`+`typescript-eslint`+`eslint-plugin-astro`のrecommendedのみ、追加ルールなし)、`.github/workflows/ci.yml`(pull_request + main push で typecheck/lint/build/test(--if-present)/E2Eを実行)、Playwright + `@axe-core/playwright`による最小スモーク(`e2e/smoke.spec.ts`: トップページ表示・コンソール未処理例外0件・axe Critical/Serious 0件)。記事がまだ無いため対象は既存のトップページのみ(過剰実装しない、T4-1で記事追加時に対象拡張)。

- リポジトリは公開済み: https://github.com/Gazelle221B/nabla 。GitHub Pages公開URL: https://gazelle221b.github.io/nabla/ (200確認済み、favicon等のサブパスアセットも200)。
- `docs/REQUIREMENTS.md`(v1.0 Final相当)、`docs/DESIGN.md`(PLAN.md v1.0 + レンダリング戦略ハイブリッド確定版)、`docs/IMPLEMENTATION_PLAN.md`(M0〜M3・T0〜T5タスク分解)は作成済み。
- conclaveガバナンス一式(`AGENTS.md`, `docs/conclave/*`, `prompts/*`)を `/Users/kairyon/projects/conclave` から導入済み(`node conclave.js init`、`conclave check` PASS)。
- `docs/PROJECT_PLAN.md` に、2本の企画会話ログ(`meeting.md`, `meeting2.md`)の統合経緯・レンダリング戦略の対立解消の記録が残っている(本ファイルより詳細な物語が必要な時に参照)。**meeting.md/meeting2.mdは個人的な壁打ちログのため`.gitignore`で公開リポジトリから除外している**(ローカルには残存)。

## 作業中ブランチ

`agent/t5-1-quality-gates`(main起点、T5-1実装、PRレビュー待ち)。別途 `agent/t1-2-t2-1-impl`(PR #1、T1-2+T2-1、レビューPASS・マージ待ち)が並行して存在する。

## 直近の設計判断

- レンダリング戦略: Mafs/SVG段階導入案とWebGPU必須案(ADR-001原案)の対立を、Tier 1〜3のハイブリッドで解消(`docs/DESIGN.md` §レンダリング戦略、`docs/PROJECT_PLAN.md` §4)。
- **Tier 3をさらにThree.js(Tier 3a・標準3Dシーン)とWebGPU(Tier 3b・シェーダー品質/大量計算3D)へ分割**(ユーザー指示:「Three.jsも適材適所で使う」)。スレッドAが元々Tier 3候補としていたThree.jsを、単純にWebGPUへ置き換えず併存させた。3DはまずTier 3a(Three.js)で足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみTier 3b(WebGPU)へ進む。WebGPU必須・フォールバックなしはTier 3bのみに適用され、Tier 1・2・3aは全ブラウザ対応を維持。反映先: `AGENTS.md` §3・§5、`docs/DESIGN.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`。
- 開発ガバナンスとしてconclaveフレームワークの採用を確定(本更新で導入完了)。
- AIロール割当をconclaveの5スロット(HUMAN/ARCHITECT/IMPLEMENTER/REVIEWER/QA_MEMORY)へ再編。nabla側の原案(Claude Code=実装+コードレビュー)はconclaveのacting/judging分離原則(実装者≠レビュアー)と衝突するため、REVIEWERをCodex、QA_MEMORYをGeminiに分離した(`AGENTS.md` §7)。

## 未解決リスク

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定、`docs/DESIGN.md` §オープン論点)。
- インタラクティブ図解の作り込みコストが高く、横展開時のスケールがボトルネックになりうる(既知リスクとしてREQUIREMENTS.mdに記載済み、対策は図解コンポーネントの再利用パターン確立)。
- `npm run test`(Vitest)はまだ実体がない(main起点のためPR #1のT2-1導入分が未反映。マージ後に反映される見込み)。`typecheck`/`lint`/`build`/E2E(`npm run test:e2e`)はT5-1で全て実体化・0 errors/0 failures確認済み。
- devDependency `@astrojs/check` の依存先(`yaml`パッケージ、`yaml-language-server`経由)にmoderate severityの脆弱性(deeply nested YAML collectionsによるstack overflow、GHSA-48c2-rrv3-qjmp)が`npm audit`で検出されている。開発時の型チェックツールのみが依存し、ビルド成果物には含まれず、当プロジェクトが任意のYAML入力を解析する経路もないため実害は低いと判断し、`npm audit fix --force`(breaking change)は保留した。ESLint等追加時に再評価する。

## レビューの直近結果

- **T5-1(品質ゲート一式、本ブランチ `agent/t5-1-quality-gates`)**: 実装者(Claude Code Sonnet)によるローカル自己検証のみ完了。`npm run typecheck`/`npm run lint`/`npm run build`/`npm test --if-present`/`npm run test:e2e`をフレッシュ実行し全て緑(E2Eはaxe Critical/Serious 0件含め3件全PASS)。独立REVIEWER/QA_MEMORYによるレビューは未実施(AGENTS.md §7の分離原則に従い、PR作成後に別エージェントへ依頼する)。
- T1-1はローカルビルド・プレビュー・本番URL(https://gazelle221b.github.io/nabla/ )への実疎通で自己検証済み(index/favicon.svg/favicon.ico すべて200)。

## 次に実行すべきアクション

**T5-1実装完了、PR作成待ち。** 次は以下:

1. `agent/t5-1-quality-gates` のPRに対しREVIEWER/QA_MEMORYの独立レビューを実施。
2. PR #1(`agent/t1-2-t2-1-impl`)とT5-1のどちらか一方がマージされた後、他方をmainへリベースする(package.json等で変更箇所が近接するため軽微な衝突が見込まれる)。
3. ESLint導入は完了。未解決リスクの`@astrojs/check`依存のyaml脆弱性は今回のESLint関連パッケージ追加では新規混入なし(`npm audit`で確認済み)。引き続き保留方針を維持。

## 人間判断待ちの事項

| 判断 | 準備済み材料 |
|---|---|
| `agent/t5-1-quality-gates` PRのマージ承認(mergeは人間専権 — AGENTS.md §3 C-1) | ローカル品質ゲート全緑(本ファイル「レビューの直近結果」参照)。REVIEWER/QA_MEMORYレビューは未実施のため、その結果も踏まえて判断されたい。 |
| `chore/merge-delegation`ブランチのcommit 416963a(マージ権限をオーケストレータAIへ委任)の正当性確認 | オーケストレータより回答済み: 制作者本人がメインセッションのUIで明示選択(2026-07-04)。当該変更はPR #2として open のままで、権限システムが自己承認を禁止しているため**PR #2のマージ自体が制作者本人の確認となる**設計。PR #2がマージされるまでは旧規約(mergeは人間専権)が有効。詳細は下記改訂履歴。 |

## 改訂履歴

| 日時 | 更新者 | 変更 |
|---|---|---|
| 2026-07-02 | HUMAN + Claude Code | meeting.md/meeting2.md からdocs/PROJECT_PLAN.md(統合計画書)を作成 |
| 2026-07-02 | HUMAN + Claude Code | レンダリング戦略をハイブリッド(Tier1〜3)で確定 |
| 2026-07-02 | ARCHITECT(Claude Code) | conclaveガバナンス導入。AGENTS.md/REQUIREMENTS.md/DESIGN.md/IMPLEMENTATION_PLAN.md/PROJECT_STATE.md を作成 |
| 2026-07-02 | ARCHITECT(Claude Code) | Tier 3をThree.js(3a)/WebGPU(3b)へ分割。全ガバナンス文書を同期 |
| 2026-07-02 | ARCHITECT(Claude Code) | T0系タスク完了。`MATH_CONVENTIONS.md`(GPL/CC BY-SA正文はgnu.org/creativecommons.orgから取得)、`LICENSE`/`LICENSE-CODE`/`LICENSE-CONTENT`/`LICENSES.md`、`DEVELOPMENT.md`、`CONTRIBUTING.md`、`docs/adr/ADR-001.md`+`INDEX.md` を作成 |
| 2026-07-04 | IMPLEMENTER(Claude Code Sonnet) | T5-1完了: ESLint(flat config)導入・`.github/workflows/ci.yml`新設(PR + main push で typecheck/lint/build/test/E2E)・Playwright+`@axe-core/playwright`によるE2Eスモーク基盤(既存トップページのみ対象)。`npm run lint`/`typecheck`/`build`/`test:e2e`フレッシュ実行で全緑。ブランチ`agent/t5-1-quality-gates`(main起点、PR #1とは独立)。 |
| 2026-07-04 | オーケストレータ + IMPLEMENTER(T5-1) | 共有作業ツリー(`/Users/nabarikairyou/dev/Projects/nabla`)でT3-1担当エージェントとの競合が発生(実害なし・T5-1側の未コミット変更は`git stash`経由で全復旧・以後`agent/t5-1-quality-gates`用の独立worktreeで作業継続)。あわせてT5-1実装エージェントが`chore/merge-delegation`ブランチのcommit 416963a(マージ権限委任)の正当性を照会し、オーケストレータが根拠(制作者がUIで明示選択/当該変更はPR #2としてopenで自己承認不可のためPR #2のマージ自体が制作者本人の確認となる設計)を回答。 |
