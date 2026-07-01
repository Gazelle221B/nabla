# 設計: nabla(∇) MVP 1 — 縦レンジ3記事の教材エンジン基盤 (参照: REQUIREMENTS.md)

> 作成者: `ARCHITECT`。**これは下流全員が読む単一の真実の源(SSOT)。** 曖昧な記述・先送り表現を残さない。
> 実装は行わない。設計判断とリスク評価がスコープ。合意経緯の物語は `docs/PROJECT_PLAN.md` を参照。

## 設計方針

読者が予想を立て・操作し・予想との矛盾を発見し・不変量を見出し・形式化するという学習体験を、**純粋な数学モデルと交換可能な描画層**によって反復生産する。数学を説明するのではなく、数学的対象に対して実験できる環境を作る。

ただし基盤の先行作り込みを禁ずる(rule of three): MVP 1では汎用教材エンジンを先に設計しない。まず三本の教材を実装し、二度以上現れた構造だけを共通コンポーネントとして抽出する。任意の数学SceneのDSL、レンダラー共通インターフェース、汎用アニメーションタイムライン、全教材対応の状態管理、網羅的クイズエンジンを最初から一般化しない。`Prompt` / `Checkpoint` / `Sandbox` は意味的な共通語彙としてのみ用意し、複雑な継承や設定駆動システムにはしない。

最初の実装単位は関数単体ではなく**垂直スライス**(walking skeleton)にする: 数学モデル→Mafs表示→代替操作→静的説明→デプロイを一度貫通した最小教材でなければ、Island境界・Mafsとの分離・代替入力の同期・サブパス動作・JS無効フォールバックは検証できない。

## レンダリング戦略(Tier 1〜3ハイブリッド)

段階的レンダラー選定(Mafs/SVG既定)とWebGPU必須方針(ADR-001原案)の対立を、**適用範囲を分離することで両立**させた確定版。さらにTier 3自体も、Three.jsとWebGPUを適材適所で使い分ける2段構成にする(単純にWebGPUへ一本化しない)。

| 階層 | 対象 | 技術 | 対応MVP | 対象ブラウザ |
|---|---|---|---|---|
| **Tier 1: 2D軽量**(既定・全記事ベースライン) | 中高範囲の大半(関数グラフ、ベクトル、平面図形、確率の単純試行) | Mafs(既定)/ SVG + D3(scales・shapes・zoomのみ) | MVP 1〜 | 主要モダンブラウザ全て |
| **Tier 2: 2D高密度**(要素数・更新頻度が問題化した場合のみ) | フーリエ級数の大量矢印、確率の大量試行、セルオートマトン、フラクタル | 計測後にPixi.js(中規模)またはWebGPU compute(規模・クオリティ最優先時) | MVP 2〜 | 主要モダンブラウザ全て |
| **Tier 3a: 標準3Dシーン** | 3×3線形変換、回転行列・基底変換、平面と直線の交差、球面幾何、通常の曲面プロット — シーングラフ・カメラ操作(OrbitControls)・標準ジオメトリで表現できるもの | **Three.js**(既定のWebGLレンダラー) | MVP 3〜 | 主要モダンブラウザ全て(WebGL) |
| **Tier 3b: シェーダー品質・大量計算3D** | 密なベクトル場、複素関数のドメインカラーリング(ピクセル単位計算)、大量パーティクル、加算グローが本質的に必要な表現 | **WebGPU**(WGSL compute + ゼロコピー描画 + 加算グロー、`gpu-bullet-hell-shrine`の流儀を流用)。重い数値計算はRust/WASM候補 | MVP 3〜 | WebGPU対応ブラウザのみ。非対応時はメッセージ表示(フォールバック実装なし) |

判断順序は常に**Tier 1 → 計測 → Tier 2 → (Tier 3a → 不足時Tier 3b)**。2×2行列やMVP 1相当の2D概念にThree.js/WebGPUを使わない(カメラ・遠近法・奥行き操作が数学的構造をかえって見えにくくするため)。Tier 3内でも、まずThree.jsの既製部品(シーングラフ・OrbitControls・標準ジオメトリ)で表現できないかを検討し、密な計算やシェーダー品質のグロー表現が本質的に必要な場合のみTier 3bのWebGPU/WGSLへ進む——安易に「3D=WebGPU」と決め打ちしない。Tier 1・2・3aはサイト全体のブラウザ互換要件を維持し、Tier 3bのみWebGPU必須(フォールバックなし・メッセージ表示のみ)とすることで、「全ブラウザ対応」と「WebGPU必須」の要件衝突を局所化している。Three.js自体のWebGPURenderer採用は将来の評価候補とし、今は既定のWebGLレンダラーで開始する(計測してから昇格する原則を踏襲)。

**ADR-001(改訂版)**: 元の全面WebGPU必須方針を、Tier 3bに限定へ縮小適用する。Tier 3aはThree.jsを用い、WebGPU必須の対象外とする。詳細は `docs/adr/`(未作成、Step 0で `docs/PROJECT_PLAN.md` §4を元に起票)。

## 検討した代替案と採用理由

| 案 | 長所 | 短所 | 採否 |
|---|---|---|---|
| Mathigon Studio(既存プラットフォーム) | 「予想→操作→発見」型教材が既に作り込み済み | Node/Expressサーバー前提でGitHub Pages要件と根本非整合。採用は部品再利用でなく別プラットフォームへの移住になる | 不採用。設計・教材表現の参考資料に留める |
| PreTeXt | アクセシビリティに優れた静的教科書出版基盤、GitHub Pagesへデプロイ可 | XML著作モデルへの移行+独自React体験の接合コストが既存基盤利用の利点を上回る | 不採用。アクセシビリティ設計の参考資料 |
| Idyll | explorable explanation専用マークアップ言語、思想がMDX構想に近い | マルチページ運用が手動、開発停滞気味でエコシステムが小さい | 不採用。思想・記事構成の参考資料 |
| `@mathigon/euclid`(MIT、幾何計算) | 点・直線・円・交差判定等が揃う | 三平方の直角制約はMafsの`useMovablePoint`制約関数で実装可能。事前導入は不要な複雑化 | 候補(事前非採用)。複数記事で幾何処理が重複した時点で評価 |
| `@mathigon/fermat`(MIT、数学ユーティリティ) | 数論・複素数・行列・統計等が揃う | 2×2固有系の教材用分類(4状態・符号連続性)を提供する保証がなく、解析式の自作の方が挙動・テスト・教材説明を一致させやすい | 候補(事前非採用)。統計・複素数・一般行列演算が実際に必要になった時点で評価 |
| 全面WebGPU統一(レンダリング基盤を1本化) | 表現の統一感、3b1b美学の追求 | Safari等の非対応環境を全面切り捨て、React未経験+週10時間という体制と強い緊張関係 | 不採用。Tier 3b(シェーダー品質・大量計算のみ)に縮小し、Tier 3aはThree.jsとする |

## API / インターフェース境界

`Lesson` コンポーネント契約(共通語彙、複雑な継承にしない):

```text
Lesson
 ├─ Prompt        問い・予想
 ├─ Scene
 │   ├─ Model       数学的状態と計算(lib/math、純粋TypeScript)
 │   ├─ Renderer    Mafs / SVG / (Tier2-3: Pixi / WebGPU)
 │   ├─ Controls    Slider / Input / Drag
 │   └─ Narration   現在の状態を文章化
 ├─ Checkpoint     理解確認
 └─ Sandbox        自由探索
```

固有値計算の三分割(数学的真実と表示上の便宜の分離):

```typescript
computeEigenSystem(matrix)              // 数学的結果
classifyEigenSystem(result)             // 教材上の状態分類(4状態)
stabilizeEigenvectorDirection(current, previous)  // 表示上の符号連続性
```

Island境界: 本文と説明図は静的MDX。状態を共有する一連のガイド付き実験は単一のReact Island(`InteractiveExperiment`)。サンドボックスは別Island。Islandを細分化しすぎない(予想・図形状態・操作履歴・正誤判定・サンドボックス初期値の同期をIsland間に分散させない)。

```html
<InteractiveExperiment client:visible>
  Prompt / Prediction / Scene / Controls / Observation / Checkpoint
</InteractiveExperiment>
<Sandbox client:visible />
```

## データ構造・スキーマ

frontmatterはtypeで判別する構造(中高/大学教養でスキーマが異なるため無理に一本化しない):

```yaml
# 中学・高校
curriculum:
  type: mext
  jurisdiction: jp
  stage: junior-high
  guidelineYear: 2017
  subject: mathematics
  grade: 3          # 任意項目(高校は履修順序が揺れるため必須にしない)
  units: [right-triangles]
lastReviewed: 2026-06-18
references:
  - { title: 中学校学習指導要領解説 数学編, type: curriculum, locator: 第3学年 図形 }
contentReview:
  mathematicalStatus: self-reviewed
  educationalStatus: unvalidated
```

```yaml
# 大学教養
curriculum:
  type: independent
  stage: university-general
  frameworkVersion: 1
  domains: [linear-algebra]
  referenceSources: [first-year-linear-algebra]
lastReviewed: 2026-06-18
```

前提単元(prerequisite)は今から記録するが、グラフの自動可視化は記事20〜30本後に先送りする(メタデータ記録と可視化を分離)。

## 変更が及ぶ範囲

```text
src/
├─ content/lessons/{geometry,algebra,calculus,linear-algebra,probability,discrete-math}/
├─ components/{lesson,controls,scenes/{mafs,svg,pixi,three,webgpu}}/
├─ lib/{math,animation,accessibility}/
└─ content.config.ts
```

`lib/math/` はReact・Three.js・Pixi.jsを一切importしない純粋TypeScriptとする。数値計算と描画コンポーネントを完全に分離し、同じ数学モデルをSVG版・Pixi版・テストコードから使い回せるようにする。Scene ライフサイクル抽象(`start/pause/resume/resize/dispose`)はTier 2/3導入時(MVP 2以降)に追加し、MVP 1(常時アニメーションループを持たないSVG中心)では先取りしない。

## リスクと緩和策

| リスク | 緩和策 |
|---|---|
| もっともらしく動く数学的誤り(UIバグより発見しにくい) | `lib/math` に不変条件ベースのテストを必須化(§数学的正しさの検証規約)。自己確認的なテスト(`c = Math.hypot(a,b)` を同じ式に戻すだけ等)は禁止 |
| 「すべての図を操作可能に」が制作コストを爆発させる | 図の三分類で絞る: 説明図(原則静的、2〜5枚)/ ガイド付き実験(制約操作、1〜2個)/ サンドボックス(自由操作、1個)。中核インタラクションは記事あたり1〜2個に限定 |
| 教材固有ロジックの車輪の再発明 / 逆に汎用ライブラリへの過度な依存 | §検討した代替案の評価ゲート運用。避けるべき自作(汎用座標系・ドラッグ/ズーム/パン・数式レンダリング・汎用行列演算・CMS等)と、再発明でない自作(三平方の残差・教材固有の固有系分類・状態遷移等のドメインロジック)を明確に線引き |
| WebGPU(Tier 3b)非対応環境でのクラッシュ | 憲法C-3: 無言でクラッシュさせず「対応ブラウザで開いてください」を表示。フォールバック描画は実装しない(スコープ外)。Tier 3aはThree.js/WebGLのため対象外 |
| 固有ベクトルの符号反転(前フレームとの内積が負で矢印が180度ジャンプ) | `stabilizeEigenvectorDirection()` で前フレームとの内積が負なら符号反転する表示上の連続性処理を実装要件として明記 |

## 数学的正しさの検証規約

`lib/math` には入出力テストだけでなく**不変条件ベースのテスト**を置く。制約された入力をランダム生成し、数学的不変量の成立を検証する(fast-check + Vitest、固定seedで再現可能)。

- 三平方の定理: 制約された直角三角形 `O=(tx,ty), A=(tx+a,ty), B=(tx,ty+b)` を生成し、残差がスケール相対誤差内でゼロ / 脚の交換で不変 / 平行移動で不変 / 回転で不変 / k倍で各面積がk²倍 / 3-4-5・5-12-13で成立 / ゼロ長・極小・極大・NaN・Infinityが仕様通り、を検証。点から距離を計算する構造(`squaredDistance`)にし、辺長を作った式へ戻すだけの自己確認は禁止。
- 固有ベクトル: `Av ≈ λv` を検証し、4状態(相異なる実固有値/重解・固有空間2次元/重解・固有空間1次元/複素共役固有値)と代表的テストケース(ゼロ行列・単位行列・対角行列・スカラー行列・Jordan型行列・回転行列・特異行列・ほぼ重解・数値誤差に敏感な行列)を網羅する。**「特異行列のリスト」という分類は数学的誤り(単位行列・回転行列は正則)なので使わない。**

浮動小数点比較はスケール相対誤差を用いる: `Math.abs(residual) <= epsilon * Math.max(1, legA2 + legB2 + hypotenuse2)`。数値計算規約の詳細は `MATH_CONVENTIONS.md`(Step 0で作成)に集約する。

## 実装上の禁止事項(§7)

> 実装者が作業前に必ず読み返すセクション。憲法(AGENTS.md §3)の該当項目を具体化する。

- MVP 1のDoD充足前にTier 2/3(Pixi.js・Three.js・WebGPU)を導入しない。
- 記事1本の実装中に汎用コンポーネント・DSL・状態管理フレームワークを先行設計しない(rule of three)。
- `lib/math` にReact/描画ライブラリをimportしない。
- 固有値計算・表示安定化・教材上の分類の3関数を1つにまとめない。
- Mathigon等の教材コンテンツ本文をコピーしない(思想の参照のみ可)。
- WebGPU(Tier 3b)にグレースフルフォールバック(WebGL2等での代替描画)を追加しない(ADR-001改訂版の決定であり、覆すにはADR再改訂+人間承認を要する)。
- Tier 3の対象を「安易に3D=WebGPU」と決め打ちしない。Three.js(Tier 3a)で表現できるかを先に検討する(§実装上の禁止事項の趣旨に同じ、rule of threeと同じ「早すぎる高度化」の防止)。

## 非機能要件への対応(§8)

- **アクセシビリティ**: WCAG 2.2 Level AAのうち適用可能な達成基準を目標(準拠を保証ではなく目標とする)。axe自動検査に加え、キーボード操作・フォーカス順序・ドラッグ代替操作・色以外の識別・モーション軽減・スクリーンリーダー向け説明を手動確認。可動点には必ずスライダー/数値入力/矢印キー/リセット/現在値テキスト表示を併設。MVP 1(SVG/Mafs)はテキスト代替と操作ラベルを付与、MVP 2以降のCanvas/WebGLには文章または表形式の代替を必須化。
- **性能**: 代表ページのデスクトップLighthouse Performance 90以上を目標(ブロッカーではない)。axe Critical/Serious 0件、Lighthouse Accessibility原則100、コンソール未処理例外0件はリリースブロッカー。
- **セキュリティ**: 静的サイトのため攻撃面は限定的。GA4は数値入力・自由記述・個人特定情報を送信しない。開発・プレビュー環境ではGA無効化。
- **コスト**: 最高コストモデル(ARCHITECT)は上流設計と難所エスカレーションにのみ投入(AGENTS.md §7)。

## オープン論点

- Tier 3a(Three.js)・Tier 3b(WebGPU)それぞれの初回導入対象単元は未確定(MVP 3着手時に選定)。
- Rust/WASMの採用可否はTier 3bの重い数値計算が実際に必要になった時点で評価ゲートにかける(事前一括採用しない)。
- `docs/adr/` にADR-001(改訂版: Tier 3b限定WebGPU採用、Tier 3aはThree.js)をまだファイル化していない。Step 0で起票する。

> **曖昧さの明示規約**: 設計中の未確定点は推測で埋めず `[NEEDS CLARIFICATION: <質問>]` でインライン明示する。現時点で残存するマーカーはない。
