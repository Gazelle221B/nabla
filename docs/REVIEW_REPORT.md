# レビュー報告: `<機能名>`  (基準: DESIGN.md / IMPLEMENTATION_PLAN.md)

> 作成者: `REVIEWER` (独立レビュアー)。**実装には関与していない。** 実装の修正は行わない (差し戻し指示のみ)。

## 判定者メタ (auditability)

> 判定はバイアス・幻覚に汚染されうる「測定値」。後から判定者を meta 評価できるよう記録する(→ [JUDGE_RELIABILITY](conclave/principles/JUDGE_RELIABILITY.md))。

- **判定モデル/系統**: `<model/family>`(**評価対象を生成したモデルと別系統であること** — self-enhancement bias 対策)
- **採点した基準 (criteria)**: `<DESIGN 由来の各次元>`
- **推論を先に / 説明付き**: はい(裸のスコアでなく基準ごとに根拠を述べる)

## 総合判定: PASS / FAIL

> **Critical/High がゼロのときのみ PASS。** 証跡なき PASS を出さない。

## 確認した証跡 (必須)

> 証跡なしの PASS を出さない。根拠行が書けないなら FAIL かつ「確認不能」と書く。

- **確認したファイル**: `<パス一覧>`
- **根拠とした差分/行**: `<file:line 形式。例: src/store/repo.py:42-58>`
- **実行/確認したテスト**: `<コマンドと結果、TEST_LOG.md の該当エントリへの参照>`
- **DESIGN.md との対応**: `<どの設計項目を基準に何を確認したか>`

## 設計適合性

DESIGN.md との乖離の有無。§7 禁止事項を破っていないか。

## 指摘事項

| 重大度 | 箇所 | 内容 | 要求対応 |
|---|---|---|---|
| Critical | | | 必須修正 (FAIL 確定) |
| High | | | 必須修正 (FAIL 確定) |
| Medium | | | 許容 or Issue 化 |
| Low | | | 任意 |

## セキュリティ / 並行性

secret 直書き・commit、injection、並行更新の競合、`.gitignore` 漏れ 等。

## テスト不足

追加すべきテスト。

---

> 同一箇所で 2 回連続 FAIL を出した場合は、エージェント間の堂々巡りシグナル。人間 (要件失敗 C) へエスカレーション ([ESCALATION](conclave/governance/ESCALATION.md))。
