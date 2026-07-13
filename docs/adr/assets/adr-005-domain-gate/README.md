# ADR-005 §5 昇格ゲート実測(complex-domain-coloring、2026-07-14)

- 対象: DomainColoringScene(Three.js ShaderMaterial/WebGL)。実 GPU(Apple M4、headed Chromium)。
- fps: 連続パン/ズーム操作中に rAF で実測——平均 ≈60.0fps、p95 フレーム時間 ≈18.6ms(基準: 平均≥58fps ∧ p95≤20ms → **合格**)。計測スクリプト: dc_gate_measure.mjs / dc_gate_final.mjs。
- 画素比較: CPU 参照実装(TS evaluateComplex + Canvas2D)と同一視野を比較(dc_gpu.png / dc_cpu.png)。
  初回比較で Three.js 既定 outputColorSpace(sRGB)による二重ガンマ補正を検出→ LinearSRGBColorSpace へ修正後、
  平均絶対差 ≈0.00002/255・最大 1/255(凡例領域除外)。系統的アーティファクトなし → **合格**。
- 結論: **Tier 3b(WebGPU)への昇格は不要**。ADR-005 §5 の両基準を Tier 3a/ShaderMaterial が満たす。
