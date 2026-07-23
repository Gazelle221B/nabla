# ADR Index

設計判断記録(Architecture Decision Records)の一覧。新規ADRを追加したら本表に追記する。

| ID | タイトル | ステータス | 概要 |
|---|---|---|---|
| [ADR-001](ADR-001.md) | 図解レンダリング基盤の技術選定(Tier 3a=Three.js / Tier 3b=WebGPU) | Accepted | レンダリング技術を4階層(Mafs/SVG既定 → Pixi.js/WebGPU高密度2D → Three.js標準3D → WebGPUシェーダー品質3D)に確定。WebGPU必須・フォールバックなしはTier 3bのみに限定 |
| [ADR-002](ADR-002.md) | Tier 1 図解ライブラリに Mafs を採用 | Accepted(PR #4 マージで確定) | T3-1 実装に伴い `mafs@^0.21.0`(MIT)を Tier 1 の可動点・座標系・数式ラベルに採用。数学モデルと描画の分離は維持 |
| [ADR-003](ADR-003.md) | ポスト MVP 1 の単元展開方針(Tier 1 波状拡張) | Accepted(2026-07-12、ROADMAP 確定で発効) | 「全単元」を `docs/ROADMAP.md` へ収束する 3〜5単元/波のプログラムとして実行。Tier 1 を先に埋め、Tier 2/3 は MVP 2/3 で別途 Tier 導入 ADR + 人間 Go |
| [ADR-004](ADR-004.md) | Tier 2(高密度2D)レンダラーの計測にもとづく選定 | Accepted(2026-07-13、計測スパイク+人間 Go 済み) | 実測(SVG は独立更新2万点で60fps割れ・5万点で破綻、Pixi/WebGL は5万点でも余裕)にもとづき Tier 2=Pixi.js(WebGL)+ピクセル計算のみ Canvas2D。WebGPU は Tier 3b 専用を維持。昇格閾値=毎フレーム独立更新 ~5,000 要素。フーリエ級数は計測により Tier 1 維持 |
| [ADR-005](ADR-005.md) | Tier 3a(標準3D)の導入方式 — vanilla Three.js + useEffect | Accepted(2026-07-14、技術スパイク+人間 Go 済み) | 実装比較スパイクにもとづき R3F 不採用(純増 ~102±2KB gzip〔実測2回・再現資産収録〕に見合う便益なし——キーボード代替の難度は両案同一)。Pixi 前例と同型のライフサイクル規律、preserveDrawingBuffer 規約、離散カメラボタンの a11y 方針、ドメインカラーリングは「まず ShaderMaterial」の Tier 3b 判断枠組み |
| [ADR-006](ADR-006.md) | ポスト全マイルストーンの方針転換 — M9「計測と構造化」 | Accepted(2026-07-24、制作者 Go 済み) | 重心を「生産」から「検証・構造化・流通」へ(Issue #49 の異系統協議)。M9a 計測基盤(GA4+事前登録基準)/ M9b 前提チェック関門 / M9c 演習+予想履歴 / M9d 流通。被験者検証は行わず行動テレメトリで破綻検出(効果の証明とはしない)。単元数 KPI・バックエンド・AI 家庭教師はスコープ外と明文化 |

## ADRの起票規約

- 重大な設計判断(技術スタックの変更、Tier境界の変更、依存ライブラリの新規採用等)は、実装前にADRとして記録する(`AGENTS.md` §3 C-6, `DEVELOPMENT.md` §4)。
- 形式は自由だが、最低限「文脈」「決定」「結果(利点・代償)」「改訂履歴」を含める(`docs/adr/ADR-001.md`を雛形として使ってよい)。
- ADR追加時は本INDEX.mdへの追記と、`docs/PROJECT_STATE.md`「改訂履歴」への記録を忘れないこと。
