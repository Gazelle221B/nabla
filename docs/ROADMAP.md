# ロードマップ — nabla(∇) ポスト MVP 1 単元展開

> 作成: `ARCHITECT`(Claude Code, オーケストレータ)。**位置づけ**: これは「当初の構想(中学〜大学教養数学を広く網羅)」を具体的な単元グラフ+マイルストーンへ落とした**ビジョンのバックログ**である。
>
> ⚠️ **REQUIREMENTS.md §Current scope の運用原則を厳守する**: 「常に着手中の3〜5記事のみを具体的な約束として扱う。『いつか網羅する』と『今完成させる』を混同しない」。本ロードマップの単元リストは**到達目標**であって一括の約束ではない。実際の commitment は「現在の波(wave)」の3〜5単元のみ。人間は不変条件と DoD のみを握り、単元の順序・粒度・分割はエージェントが自律計画してよい(§Current scope)。

## 1. 原則(全単元共通)

1. **Tier 1 優先(憲法 C-4)**: 新 Tier(Tier 2=高密度2D、Tier 3=3D)は計測 + ADR + 人間 Go を経て別マイルストーン(MVP 2 / MVP 3)で導入する。中高範囲の大半と大学教養の一部は Tier 1(Mafs/SVG)で表現できるため、まず Tier 1 単元で縦横を埋める。
2. **各単元は MVP 1 と同じ DoD**: 純粋 `lib/math` + fast-check 不変条件テスト(自己確認的でない)/ Mafs 図解(描画層のみ)/ `InteractiveExperiment` 型の予想ゲート付き対話 Island(スライダー+数値入力+矢印キー+リセット+現在値表示)/ content collection MDX(学習目標1〜2・代表的誤解・転用問題・`<noscript>`)/ 全ゲート緑(typecheck/lint/test/build/e2e)/ axe Critical・Serious 0・Lighthouse a11y 原則100 / 実装者≠レビュアー≠数学QA(C-5)。
3. **前提グラフ(C-2)**: 各単元は `prerequisites` に**実在する単元 ID** のみを宣言する。波の順序は前提が先に merge されるように直列化する。単元マップ(前提可視化)は記事20〜30本後に導入(DESIGN §オープン論点)。
4. **rule of three(REQUIREMENTS §62)**: 既存3実験(`InteractiveExperiment`/`DerivativeExperiment`/`EigenvectorExperiment`)で共通構造が3回現れた。M4 で予想ゲート/操作パネル/noscript の共有枠組み(`ExperimentShell` 等)を抽出し、以降の単元はそれを再利用する(使い捨て実装でない証跡=受け入れ条件)。
5. **この調子で(委譲規律)**: 実装=Sonnet 委譲、独立レビュー=別系統(Codex/GrokBuild)、数学・学習設計 QA=Antigravity(Gemini)、統合・最終検証=オーケストレータ。単元ごとに `agent/<unit>-impl` ブランチ + PR + CI + マージ。進捗は `PROJECT_STATE.md`。

## 2. マイルストーン

| M | テーマ | Tier | 代表単元(3〜5/波) | 前提 |
|---|---|---|---|---|
| **MVP 1** ✅ | 縦の実証(中学・高校・大学を1本ずつ) | 1 | 三平方の定理 / 微分係数と接線 / 2×2行列と固有ベクトル | 完了(main) |
| **M4** | 関数の基礎(中高の縦糸)+ 共有枠組み抽出 | 1 | 一次関数とグラフ / 二次関数とグラフ(平方完成)/ 三角比と単位円 | 三平方 |
| **M5** | 平面幾何と三角の展開 | 1 | 相似と拡大縮小 / 円周角の定理 / 正弦定理・余弦定理 | 三角比・三平方 |
| **M6** | 微積分の柱 | 1 | 平均変化率と導関数 / 定積分と面積 / 数列と極限 | 微分係数・二次関数 |
| **M7** | 線形代数(2D)と確率入門 | 1 | ベクトルの内積 / 一次変換(2×2)と行列式 / 確率(単純試行) | 固有ベクトル・二次関数 |
| **MVP 2** | 高密度2D(要 ADR + Pixi/WebGPU 基盤) | 2 | フーリエ級数の合成 / 大量試行と大数の法則・中心極限 / フラクタル | M4〜M7 の関連単元 |
| **MVP 3** | 3D(要 ADR + Three.js/WebGPU 基盤) | 3a/3b | 一次変換(3×3)/ 回転行列と基底変換 / 曲面プロット / 複素関数のドメインカラーリング(3b) | MVP 2・線形代数系 |

> **✅ 2026-07-13: M4〜M7(Tier 1 マイルストーン)完走。** 12単元を実装・独立レビュー・数学QA・統合済み(PR #11〜#23)。公開は MVP 1 と合わせて15単元。次は MVP 2(Tier 2)/ MVP 3(Tier 3)——いずれも Tier 導入 ADR + 人間 Go が着手ゲート(ADR-003)。

各マイルストーン着手時に、当該波の3〜5単元を `IMPLEMENTATION_PLAN` に T タスクとして具体化し、終了条件+反復上限を付す(憲法 C-7)。MVP 2 / MVP 3 は Tier 導入 ADR(ADR-004 以降)+ 人間 Go を着手ゲートとする。

## 3. 単元バックログ(ビジョングラフ / Tier 1 中心)

> ステータス: ✅=公開済 / 🔜=直近波 / ⬜=バックログ。前提は単元 ID(スラッグ)。粒度・順序は実装時に見直してよい(§Current scope)。

### geometry(平面図形)
- ✅ `pythagorean-theorem` 三平方の定理(中学)
- ✅ `similar-figures` 相似と拡大縮小(中学)— prereq: []
- ✅ `inscribed-angle` 円周角の定理(中学)— prereq: []
- ✅ `law-of-sines-cosines` 正弦定理・余弦定理(高校数I)— prereq: [trigonometric-ratios]
- ✅ `circle-equation` 円の方程式・点と直線の距離(高校数II)— 実装 slug は `circle-line`(PR #27、M8a)

### algebra(関数・方程式)
- ✅ `linear-function` 一次関数とグラフ(中学)— prereq: []
- ✅ `quadratic-function` 二次関数とグラフ・平方完成(高校数I)— prereq: [linear-function]
- ✅ `quadratic-equation` 二次方程式と判別式(高校数I)— prereq: [quadratic-function](PR #25、M8a)
- ✅ `trigonometric-ratios` 三角比と単位円(高校数I/II)— prereq: [pythagorean-theorem]
- ✅ `exp-log` 指数関数・対数関数(高校数II)— prereq: [](PR #26、M8a)
- ✅ `sequences` 数列と漸化式(高校数B)

### calculus(微積分)
- ✅ `derivative-tangent-line` 微分係数と接線(高校数II)
- ✅ `derivative-function` 導関数 — 微分係数から関数へ(高校数II)— prereq: [calculus/derivative-tangent-line](実装時に slug/焦点を「関数としての導関数」へ具体化)
- ✅ `definite-integral-area` 定積分と面積(高校数II)— prereq: [derivative-tangent-line]
- ✅ `limits-sequences` 数列と極限(高校数III)— prereq: [sequences](PR #31、M8c)
- 🔜 `taylor-approximation` テイラー近似(大学教養)— prereq: [derivative-tangent-line](M8c 実装中)

### linear-algebra(線形代数)
- ✅ `eigenvectors` 2×2行列と固有ベクトル(大学教養)
- ✅ `dot-product` ベクトルの内積(高校数C)— prereq: []
- ✅ `linear-transformation-2d` 一次変換(2×2)と行列式(高校数C/大学)— prereq: [eigenvectors]
- ✅ `matrix-determinant-area` 行列式と面積拡大率(大学教養)— `linear-transformation-2d` が行列式=面積拡大率を中核体験として既にカバー(2026-07-13 判断、独立単元は立てない)

### probability / statistics(確率・統計)
- ✅ `simple-probability` 確率(単純試行・樹形図)(中学)— prereq: []
- ✅ `permutation-combination` 場合の数(順列・組合せ)(高校数A)— 実装 slug は `combinatorics`(PR #28、M8b)
- ✅ `data-analysis` データの分析(平均・分散・相関)(高校数I)— prereq: [](PR #29、M8b)
- ✅ `probability-distribution` 確率分布と期待値(高校数B)— prereq: [simple-probability](PR #30、M8b)
- ⬜ `normal-distribution-clt` 正規分布・中心極限定理(大学教養)— prereq: [probability-distribution]。**Tier 2(MVP 2)へ送致済み**(大量試行の描画密度が Tier 1/SVG の限界を超えるため)

### discrete-math(離散数学、主に大学・後期波)
- ⬜ `graph-theory-intro` グラフ理論入門 / `recurrence` 漸化式と計算量 など(バックログ)

## 4. 次アクション

1. **M4 着手(本ロードマップ確定後)**: `linear-function` → `quadratic-function` → `trigonometric-ratios` の順に前提を満たしつつ実装(各 PR)。並行して rule of three の共有枠組み抽出を M4 内で行う。
2. 各単元は「この調子」(委譲実装 → 別系統レビュー → Antigravity 数学QA → CI → マージ)で完成させ、`PROJECT_STATE` を随時更新。
3. M4 完了後に M5 を波として具体化。MVP 2 / MVP 3 は Tier 導入 ADR + 人間 Go を経て着手。

## 改訂履歴

| 日付 | 変更 |
|---|---|
| 2026-07-12 | 初版。ポスト MVP 1 の全単元展開をビジョングラフ + マイルストーン(M4〜M7 Tier 1、MVP 2/3 で Tier 2/3)へ構造化。REQUIREMENTS §Current scope(3〜5記事/波)を運用原則として明記。 |
