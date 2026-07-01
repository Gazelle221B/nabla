# 実装計画: nabla(∇) MVP 1 — 三平方の定理・微分係数と接線・固有ベクトル (参照: DESIGN.md)

> 作成者: 原則 `ARCHITECT`。マイルストーンはM0〜M3、期間12週間目標・上限16週間(REQUIREMENTS.md §制約・前提)。

## マイルストーン

| マイルストーン | 期間目安 | 内容 |
|---|---|---|
| M0 | 〜1週 | 要件凍結 + リポジトリ初期化 + 規約類整備(本計画のT0系) |
| M1 | 〜3週 | 三平方の定理 — 最小垂直スライス完成・GitHub Pages公開(**最重要検証**) |
| M2 | 〜8週 | 微分係数と接線(高校) — M1で確立した部品を再利用 |
| M3 | 〜12週 | 2×2行列と固有ベクトル(大学教養) — 固有系の教材固有ロジック + 符号連続性 |

12週間超過時は期間延長ではなく機能削減(削減順: 装飾アニメーション→実例1件のみの早すぎる汎用化→GA4カスタムイベント→付加的な説明図→記事数3本→2本。サンドボックス・予想・数学テスト・アクセシビリティは削減対象外)。

## タスク分解(M0〜M1)

`[P]` 列 = 依存がなく並列実行が安全なタスク。依存があるものは直列化する。

| ID | 内容 | 変更対象ファイル | 依存 | [P] | 終了条件(exit) |
|---|---|---|---|---|---|
| T0-1 | 数値計算規約を定義 | `MATH_CONVENTIONS.md` | なし | [P] | epsilon定義・スケール相対誤差・NaN/Infinity扱い・座標系向き・角度単位(ラジアン)・-0処理が記載され、人間レビュー1回でPASS。反復上限2 |
| T0-2 | ライセンス境界をファイル化 | `LICENSE`, `LICENSE-CODE`, `LICENSE-CONTENT`, `LICENSES.md` | なし | [P] | ディレクトリ単位のGPL/CC BY-SA割当が記載され、`src/content/**`=CC BY-SA、`src/{components,lib}/**`=GPLが明記。反復上限2 |
| T0-3 | 複数AIエージェント運用規則を明文化 | `DEVELOPMENT.md` | なし | [P] | Issue単位で担当1人/1エージェント限定、同時編集禁止、変更にはテスト必須、最終マージは制作者、が記載。反復上限2 |
| T0-4 | 外部コードPR非受付を明記 | `CONTRIBUTING.md` | なし | [P] | MVP期間中の外部コードPR非受付・Issue提案歓迎が記載。反復上限1 |
| T0-5 | ADR-001(改訂版)をファイル化 | `docs/adr/ADR-001.md` | DESIGN.md(完了済み) | [P] | DESIGN.md §レンダリング戦略の内容がADR形式(文脈/決定/結果)で記録される。反復上限2 |
| T1-1 | 空のAstroサイトをGitHub Pagesへ通す | `astro.config.mjs`, `.github/workflows/deploy.yml`, 仮トップページ | T0-1〜T0-4 | | サブパス上でCSS・画像・JSが正常に読める状態でPR公開URLが200を返す。反復上限3 |
| T1-2 | React+MDX+KaTeX統合 | `astro.config.mjs`, サンプルMDX1本 | T1-1 | | ビルド時KaTeX HTML化が機能し、サンプル数式が公開URLで正しく表示。反復上限3 |
| T2-1 | 純粋数学モデル(三平方) | `src/lib/math/pythagoras.ts` | T1-2 | [P] | `Point2`/`squaredDistance`/`pythagoreanResidual`実装+DESIGN.md §数学的正しさの検証規約の全不変条件テストがVitest+fast-checkで緑。反復上限5 |
| T3-1 | 最小React実験(InteractiveExperiment) | `src/components/scenes/mafs/PythagorasScene.tsx`, `src/components/lesson/InteractiveExperiment.tsx` | T2-1 | | 予想・制約付き可動点・代替入力(数値入力/矢印キー)・残差表示・リセットが動作し、ドラッグと数値入力が単一React状態に同期。反復上限5 |
| T4-1 | 記事として閉じる | `src/content/lessons/geometry/pythagorean-theorem.mdx` | T3-1 | | 平易な説明・形式化・代表的誤解・転用問題・最小サンドボックス・JS無効時代替文章が揃い、REQUIREMENTS.md §各単元ページ受け入れ条件を満たす。反復上限3 |
| T5-1 | 品質ゲート一式を通す | (テスト/lint/型/axe/Playwright) | T4-1 | | AGENTS.md §4のコマンド全てがフレッシュ実行で緑、axe Critical/Serious 0件。反復上限3、3回連続失敗で人間へエスカレーション(憲法C-7) |

> **終了条件は必須**(憲法C-7): 各タスクは明示的な完了/終了条件と最大反復上限を持つ。出口なしのループ・早すぎる終了を防ぐ。

## 憲法ゲート(Constitution Gate)

- [x] C-1 リポジトリ運用 — `agent/<task-id>-impl` ブランチ運用、外部PR非受付をT0-4で明文化
- [x] C-2 データ・スキーマ — frontmatterスキーマはDESIGN.mdで確定済み、T4-1で準拠確認
- [x] C-3 耐障害性 — Tier 1のみのMVP 1では該当リスク低(WebGPU未使用)。Tier 3b導入時に再チェック(Tier 3aはThree.js/WebGLのため対象外)
- [x] C-4 スコープ境界 — Tier 2/3・非対象機能をタスクに含めない(本表で担保)
- [x] C-5 コンテンツ・法務 — T4-1で数学的正しさの別エージェント検証を終了条件に含む
- [x] C-6 スタック — DESIGN.md確定スタックからの逸脱なし
- [x] C-7 終了 — 全タスクに終了条件+反復上限を記載済み
- [x] C-8 過剰修正 — 該当なし(既存の先行主張を書き換えるタスクなし)

| 抵触しうる項目 | 正当化 | 人間承認 |
|---|---|---|
| (現時点でなし) | | |

## テスト方針

- **Unit**: `lib/math` の全純粋関数に具体例テスト+不変条件テスト(fast-check、固定seed)。DESIGN.md §数学的正しさの検証規約に準拠。
- **Integration**: `InteractiveExperiment` Islandの状態同期(ドラッグ↔数値入力↔残差表示)をReact Testing Libraryで検証。
- **E2E**: PlaywrightスモークテストでGitHub Pagesサブパスビルドの主要操作(ページ表示・図の操作・キーボード操作)を確認(T5-1)。
- **アクセシビリティ**: axe自動検査(Critical/Serious 0件必須)+手動キーボード試験。

カバレッジの数値目標は設定しない(教材固有ロジックの少量コードに対し形骸化するため)。**不変条件テストの網羅性**(DESIGN.md記載のケース全て)をカバレッジの代替指標とする。

## 禁止事項(再掲)

DESIGN.md §実装上の禁止事項を参照。特にM1で重要なもの: `lib/math` へのReact/描画ライブラリimport禁止、汎用コンポーネントの先行設計禁止(rule of three)、自己確認的な不変条件テストの禁止。

## 着手前ブロッカー / 着手ゲート

- T1-1着手には T0-1〜T0-4 の完了(規約類のファイル化)が必要。
- M2・M3着手には、それぞれ前マイルストーンのDoD(下記)充足 + 人間のGo宣言が必要(憲法C-4)。

## 完了の定義(MVP 1固有)

[EXECUTION_DISCIPLINE](conclave/principles/EXECUTION_DISCIPLINE.md)のDoDに加え、本タスク固有の合格条件:

**教材**: 学習目標1〜2個に限定 / 操作前に予想を要求 / 代表的誤解1つ以上 / 平易な説明から形式的定義へ / 末尾に転用問題または探索課題。

**操作**: マウス・タッチ可 / ドラッグ以外の代替入力あり / キーボードのみで主要操作完了可 / リセット可 / 不正値・特異値・境界値で破綻しない / モバイル幅で意味が失われない。

**技術**: 数学モデルの単体テスト / 不変条件テスト / コンソール未処理例外0 / GitHub Pagesサブパスで動作 / JS無効でも本文と数式は読める / axe Critical・Serious 0件 / Lighthouse Accessibility原則100。

3記事(三平方の定理・微分係数と接線・固有ベクトル)全てが上記を満たした時点でMVP 1完了とする。
