# ADR Index

設計判断記録(Architecture Decision Records)の一覧。新規ADRを追加したら本表に追記する。

| ID | タイトル | ステータス | 概要 |
|---|---|---|---|
| [ADR-001](ADR-001.md) | 図解レンダリング基盤の技術選定(Tier 3a=Three.js / Tier 3b=WebGPU) | Accepted | レンダリング技術を4階層(Mafs/SVG既定 → Pixi.js/WebGPU高密度2D → Three.js標準3D → WebGPUシェーダー品質3D)に確定。WebGPU必須・フォールバックなしはTier 3bのみに限定 |
| [ADR-002](ADR-002.md) | Tier 1 図解ライブラリに Mafs を採用 | Accepted(PR #4 マージで確定) | T3-1 実装に伴い `mafs@^0.21.0`(MIT)を Tier 1 の可動点・座標系・数式ラベルに採用。数学モデルと描画の分離は維持 |
| [ADR-003](ADR-003.md) | ポスト MVP 1 の単元展開方針(Tier 1 波状拡張) | Accepted(2026-07-12、ROADMAP 確定で発効) | 「全単元」を `docs/ROADMAP.md` へ収束する 3〜5単元/波のプログラムとして実行。Tier 1 を先に埋め、Tier 2/3 は MVP 2/3 で別途 Tier 導入 ADR + 人間 Go |

## ADRの起票規約

- 重大な設計判断(技術スタックの変更、Tier境界の変更、依存ライブラリの新規採用等)は、実装前にADRとして記録する(`AGENTS.md` §3 C-6, `DEVELOPMENT.md` §4)。
- 形式は自由だが、最低限「文脈」「決定」「結果(利点・代償)」「改訂履歴」を含める(`docs/adr/ADR-001.md`を雛形として使ってよい)。
- ADR追加時は本INDEX.mdへの追記と、`docs/PROJECT_STATE.md`「改訂履歴」への記録を忘れないこと。
