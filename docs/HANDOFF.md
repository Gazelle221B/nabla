# 引き継ぎ書 (HANDOFF) — `2026-07-12` 更新

> **これは時点スナップショットである** (いずれ陳腐化する)。恒久的な運用手順は [ORCHESTRATION_RUNBOOK](conclave/runbook/ORCHESTRATION_RUNBOOK.template.md)、真の進捗記憶は [PROJECT_STATE](PROJECT_STATE.md)。
> 用途: オーケストレーター交代時に「今どこで・次に何をすべきか」を 5 分で把握する。

## 1. 30 秒サマリー

**★ MVP 1 完了(2026-07-12)。** 三平方の定理・微分係数と接線・2×2行列と固有ベクトルの3記事すべてが「教材/操作/技術」DoD を満たす。M1/M2/M3(PR #1〜#7)+ 最終仕上げ PR #8(ホーム導線+トップ a11y 是正)を main へマージ済み。本番 GitHub Pages で全 DoD を実測充足(Lighthouse a11y 全4ページ 100・公開 URL 200・JS 無効可読)。以降は MVP 1 スコープ外(§3 参照)で HUMAN の Go が必要。

- **ブランチ**: 実装ブランチは全マージ済み。main 最新 `90e64fe`。次スコープはここから新ブランチを切る。
- **品質ゲート**(統合 main + 本番デプロイでフレッシュ検証): typecheck 0 errors / lint clean / unit **140 passed** / build 5 pages / e2e(Playwright+axe)**13 passed** / Lighthouse a11y **全4ページ 100**(本番 URL 実測)。CI・Deploy とも main で success。
- **次の自動アクション**: なし(MVP 1 完了)。残りは HUMAN ゲート(§4)。

## 2. 完成済み (動くもの)

| フェーズ | 状態 | 証跡 |
|---|---|---|
| M0 ガバナンス・規約・ライセンス | ✅ | `AGENTS.md` / `docs/conclave/*` / `MATH_CONVENTIONS.md` / `LICENSE*` / ADR-001,002 |
| M1 三平方の定理(数学モデル+対話図解+記事) | ✅ | PR #1,#3,#4,#5 マージ。`lib/math/pythagoras.ts` `compare.ts` / `InteractiveExperiment` / `PythagorasScene` / `content/lessons/geometry/pythagorean-theorem.mdx` |
| M2 微分係数と接線 | ✅ | PR #6 マージ。`lib/math/derivative.ts` / `DerivativeExperiment` / `DerivativeScene` / `content/lessons/calculus/derivative-tangent-line.mdx` |
| M3 2×2行列と固有ベクトル | ✅ | PR #7 マージ。`lib/math/eigen.ts` / `EigenvectorExperiment` / `EigenvectorScene` / `content/lessons/linear-algebra/eigenvectors.mdx` |
| 品質ゲート基盤(T5-1) | ✅ | ESLint flat config / `.github/workflows/{ci,deploy}.yml` / Playwright+`@axe-core/playwright` E2E |
| 公開(GitHub Pages) | ✅ | https://gazelle221b.github.io/nabla/ (トップ+3記事すべて 200)。Deploy run success |
| MVP 1 統合検証 + Lighthouse a11y | ✅ | 2026-07-12 フレッシュ実行。unit 140 / e2e 13 / a11y 全4ページ 100(トップは PR #8 で 94→100) |
| ホーム導線 + トップ a11y 是正 | ✅ | PR #8 マージ済み。トップ Lighthouse a11y 94→100、公開3単元へのホーム導線を content collection から動的生成 |
| **MVP 1 完了** | ✅ | main `90e64fe`。3記事すべて DoD 充足、本番 Lighthouse a11y 全4ページ 100 |

## 3. 残作業 (完成までの正確な経路)

```text
[PR #8] ── CI(quality-gates)緑
        ├─ 独立レビュー(GrokBuild=grok-4.5, 実装者≠レビュアー) … Codex は GPT 上限で不可のため代替
        └─ GitHub Copilot コードレビュー(リクエスト済み)
              │  Critical 級指摘があれば解消(反復上限内)
              ▼
        [オーケストレータ] main へマージ  ← C-1/§8 で委任済み(★人間は事後監査・随時 revert 可)
              ▼
        Deploy(GitHub Pages)success + 公開 URL 200 を確認
              ▼
        ★★ MVP 1 完了 ★★  (3記事すべてが教材/操作/技術 DoD を充足)

  ── ここから先は MVP 1 のスコープ外(憲法 C-4)。着手には人間の Go が必要 ──
  • ★ 教育効果の検証(被験者確保)= HUMAN 専権。MVP 1 では「未検証の公開ベータ」と明示する方針
  • ★ 商標「nabla / ナブラ」検索・正式命名確定 = HUMAN 専権(AGENTS.md §1)
  • 新単元の追加 / Tier 2・3 レンダラー導入 = 別マイルストーンとして計画
```

**重要**: MVP 1 の残りは PR #8 のマージという「規則内で到達できる最大状態」であり、それ以上の機能は発明しない。教育効果検証・商標確定は AI が代替できない人間ゲート。

## 4. 人間判断待ち (材料は準備済み — 人間の入力のみ必要)

| 判断 | 準備済み材料 |
|---|---|
| MVP 1 完了の事後監査(マージ自体はオーケストレータが実施可 — C-1/§8) | 全 DoD の実測証跡(unit 140 / e2e 13 / Lighthouse a11y 全4ページ 100 / 公開 URL 200 / JS 無効可読)。数学的正しさは実装者と別エージェントで検証済み(C-5) |
| 公開ベータの一般告知 / 商標検索・命名確定 | サイトは技術的に公開状態(GitHub Pages 200)。告知・命名は HUMAN 判断(AGENTS.md §1) |
| 教育効果検証(被験者確保) | 北極星指標の測定計画は要件に記載。実施は HUMAN 主導 |

## 4.5 この期間の主要決定 + 却下した代替案 (full trace の保全)

| 決定 | 採用理由 | 却下した代替案 | 却下理由 |
|---|---|---|---|
| ローカルを origin/main へ ff 同期し、古い ESLint 手動ブランチを破棄 | ローカルは 2026-07-02 の古いスナップショットで、真実の状態はリモート(PR #1〜#7 マージ済み)。手動 ESLint は PR #3 で置換済み | 手動 ESLint ブランチを PR 化して活かす | PR #3 の flat config + CI + E2E がより完全で既に main 入り。二重管理・退行になる(stash に退避し復元可能に) |
| `<main>` を `index.astro` に置く | トップ専用に landmark を1つ足すだけで済み、記事ページに影響しない | `<main>` を `BaseLayout` に追加 | `[slug].astro` が既に `<main>` を持つため記事ページで main が2つになり `landmark-one-main` が逆に減点される |
| Lighthouse を実測してから DoD を判定 | axe(Critical/Serious 0)は通っていたが、DoD は「Lighthouse Accessibility 原則100」。moderate 級の `landmark-one-main` は axe ゲートをすり抜けていた | axe 緑をもって a11y DoD 達成とみなす | 実測でトップ 94 が判明。推論では見逃していた本物のギャップだった |
| ホームに公開単元の導線を追加 | 3記事が公開済みなのにホームから到達不能で「完成」と言えない。collection から動的生成し二重管理を回避 | 導線追加を見送り follow-up 化 / 手書きリンクリスト | 到達性は完成の要件。手書きは記事追加時にリンク切れ(C-2)リスク |
| 独立レビューを Codex→GrokBuild へフォールバック | Codex が GPT アカウント上限(exit=1, ~21:30 復帰)。憲法は実装者≠レビュアーの別系統独立レビューを要求 | Codex 復帰まで待つ / オーケストレータが自己レビュー | 完了を不必要に遅延させる/自己レビューは独立性の憲法違反。Grok は GPT 枠と独立 |

## 5. 引き継ぐ人/AI が最初にやること

1. [ORCHESTRATION_RUNBOOK](conclave/runbook/ORCHESTRATION_RUNBOOK.template.md) §1 の起動シーケンスを実行。
2. §2 決定木で現在地を判定(現在地: 「MVP 1 実装・検証完了、PR #8 マージ待ち」)。
3. プロジェクト固有の確認手順:
   - `git fetch && git log --oneline -3 origin/main` で PR #8 がマージ済みか確認。
   - 未マージなら `gh pr checks 8` + 独立レビュー/Copilot 結果を確認し、Critical 級を解消してマージ。
   - マージ後は `npm ci && npm run typecheck && npm run lint && npm run test && npm run build && npx playwright install chromium && npm run test:e2e` をフレッシュ実行して緑を確認。
4. 人間ゲート(教育効果検証・商標確定)に当たったら停止し、本書 §4 の材料を添えて人間に渡す。

## 6. 環境メモ

- 実行: `npm ci` → `npm run dev`(http://localhost:4321/nabla/)/ `npm run build` → `npm run preview`。
- 品質ゲート: `npm run typecheck` / `npm run lint` / `npm run test` / `npm run test:e2e`(要 `npx playwright install chromium`)。
- Lighthouse a11y(任意): preview 起動後 `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx lighthouse <url> --only-categories=accessibility --chrome-flags="--headless=new"`。
- 必要なキー: なし(静的サイト・外部 API 未使用)。デプロイは GitHub Actions(`GITHUB_TOKEN` は Actions 標準)。
- 既知の低リスク事項: `@astrojs/check` 依存の `yaml`(GHSA-48c2-rrv3-qjmp、開発時型チェックのみ・ビルド成果物非混入)。Node は `>=22.12.0`(検証は Node 25 系で実施)。
- 外部 AI CLI: REVIEWER=Codex(`codex-cc.sh`、GPT 上限に注意)/ 代替=GrokBuild(`grokbuild-cc.sh`)。QA_MEMORY=Antigravity(`antigravity-cc.sh`、数学/学習設計レビュー)。
