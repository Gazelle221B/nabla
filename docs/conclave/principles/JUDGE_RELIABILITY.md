# Pillar 6+ — Judge Reliability: 検証者そのものを信頼しない

> Conclave は REVIEWER と QA_MEMORY を品質の最後の砦にする。だが**検証者の判定自体が、バイアスと幻覚に汚染された「測定値」**であり、権威的に聞こえるからといって真実ではない。
> 出典: Gu et al.「A Survey on LLM-as-a-Judge」(arXiv:2411.15594 / The Innovation)、Jamshidi et al.「Hallucination Cascade」(arXiv:2606.07937)、MAST FM-3.3「誤った検証」(9.1%、FC3 最頻)。
>
> ⚠️ **方法論ノート(ドッグフーディング)**: 本書を起草するにあたり、研究エージェントが LLM-as-Judge サーベイから引いた「引用文」の多くが、敵対的検証で**出典に存在しない捏造**だと判明した(概念は本物だが文言が偽)。よって本書は出典の**概念**のみを採用し、逐語引用はしない。これは Conclave 自身の規則「verify before adopt / 証跡なき採用をしない」の実演である。

---

## なぜ独立した関心事なのか

MAST の実証: タスク検証の失敗は全体の 23.5%、うち「**誤った検証**」(検証者が誤りを自信を持って PASS させる) が 9.1% で FC3 最頻。Conclave は REVIEWER/QA を信頼できる前提に立つが、データは「検証者こそ最大級の失敗源」だと示す。→ 検証者を**設計で校正**する必要がある。

---

## JR-1. モデル系統の独立性 (self-enhancement bias)

LLM 判定者は、**自分自身/自分に似たモデルが生成した出力を過大評価する**(self-enhancement bias、サーベイで確認された実在のバイアス)。

→ Conclave の「PR 作者 ≠ レビュアー」公理を強化する: REVIEWER と QA_MEMORY スロットは、**評価対象を生成したモデル(系統)にバインドしてはならない**。セッションを分けるだけでは不十分——バイアスはモデルの同一性に付く。これは [ROLE_TOPOLOGY](../roles/ROLE_TOPOLOGY.md) の**ハードなバインディング制約**。

> コスト圧で全スロットを単一プロバイダに collapse させると self-enhancement bias が静かに復活する。スロットの差し替え可能性が生む潜在リスクとして明示する。

## JR-2. 判定者のバイアス・チェックリスト

サーベイが挙げる実在のバイアスと、各々の安価な対策(※サーベイの実際のバイアス名に準拠):

| バイアス | 症状 | 対策 |
|---|---|---|
| **Position(位置)** | 提示順(最初/最後)で評価が変わる | 差分/選択肢を**固定した文書化済みの順**で提示。代替案比較時は順を入れ替えて再評価し平均する |
| **Length/Verbosity(冗長)** | 長い・手の込んだ出力を品質に関係なく高評価 | 「簡潔さは欠点ではない。長さでなく基準で採点せよ」と明示指示 |
| **Self-Enhancement(自己選好)** | 自分(似たモデル)の出力を過大評価 | JR-1: 生成元と別系統に判定をバインド |
| **Concreteness/Authority(権威)** | 自信ありげな断定・引用を鵜呑み | 成果物に埋め込まれた自己申告の品質主張(「これはテスト済み」等のコメント)を**証拠として受理しない** |
| **Style(文体)** | 文体の好みが内容評価に漏れる | DESIGN 由来の基準だけで採点 |

→ これらは [prompts/review.md](../prompts/review.md) / [prompts/qa.md](../prompts/qa.md) と新設 [governance/ESCALATION.md](../governance/ESCALATION.md) の split-verdict に反映。

## JR-3. 説明付き・基準分解の判定 (criteria-decomposed, explained)

裸のスコア/PASS だけを返させない。サーベイの prompt 設計の柱:

1. **基準分解** — 全体一発の判定でなく、DESIGN 由来の各次元を個別に採点する。
2. **判定の前に推論 (CoT)** — 結論より先に根拠を述べさせる。
3. **参照ガイド** — DESIGN.md / IMPLEMENTATION_PLAN.md を gold reference として厳密に照合。
4. **構造化出力の分離** — 散文の推論の後に、JSON の判定ブロックを別に出す([ENGINEERING_INVARIANTS](ENGINEERING_INVARIANTS.md) INV-4: JSON 判定と散文を分離)。

> これは P6「review must cite file:line evidence」の科学的裏付け——説明を強制された判定の方が人間の判断と整合しやすい。Conclave の証跡規則は正しい直観で、それを「基準分解された推論」へ具体化する。

## JR-4. 原子的クレーム分解の検証 (atomic-claim grounding)

Hallucination Cascade のアブレーションが示す**最重要の検証プリミティブ**: 事実を含む出力 (REVIEW_REPORT の指摘、QA 散文、調査/セカンドオピニオン結果、生成コンテンツ) は、**全体一発で判定せず、原子的クレームに分解して各々を個別に grounding** する(クレーム分解を外すと検出性能が最も大きく劣化した)。

手順: ①LLM/規則でクレームに分解 → ②各クレームを決定的規則(可能なら) → 意味照合の順で grounding → ③各クレームを PASS / UNVERIFIABLE / FAIL で記録。これは P6「file:line 証跡」のクレーム粒度への一般化。

## JR-5. 過剰修正ガード (unverifiable ≠ false)

> ⚠️ **これは Conclave 由来の設計判断**(出典の Hallucination Cascade はこの規則を勧めてはいない。同論文が実測したのは「修正 hop ごとに事実性が低下し (0.789→0.769)、修正のうち約 3.8% が元々正しかった内容を誤って書き換える」という trade-off まで)。

検証/修正パスは、**確認できないという理由だけで先行エージェントの事実主張を削除・書換してはならない。** 確認不能 (unverifiable) は偽 (false) ではない。確認できないクレームは**フラグして escalate**(ARCHITECT か人間へ)するのであって、下流パスが黙って破壊しない。

→ 厳格なレビュアー(ROLE_TOPOLOGY が「厳しいから」と選好する)は、幻覚除去を最大化すると同時に正しい内容の巻き添え削除も最大化しうる。DoD は「欠陥除去」だけでなく「**正しい内容を失っていないか**」も問う(→ EXECUTION_DISCIPLINE の factuality-regression ガード)。

## JR-6. 多判定者の不一致は「シグナル」(split-verdict)

サーベイ: 複数の独立判定者(別系統)による投票・集約・ディベートは単一判定者より信頼性が高い。

→ REVIEWER と QA_MEMORY(別系統)が同一成果物に**矛盾する判定**を出したら、それはノイズでなくシグナル。どちらかに既定せず **ARCHITECT へ裁定をエスカレート**(→ [ESCALATION](../governance/ESCALATION.md) Class C のサブパターン)。両判定と裁定を `PROJECT_STATE` に記録。

> **コストとの緊張**: 多判定者アンサンブル/ディベートはトークンを食い、P1「希少資源の集中」と衝突する。よって多判定者検証は**フェーズ境界の QA と人間ゲートの merge に限定**し、日常 PR は単一判定者(ノイズはやや許容)にする。

## JR-7. 委任された「判定」も検証する

P4「委任結果は採用前に検証」をコードだけでなく**判定**にも適用する: 委任された review/QA 判定を PASS として記録する前に、**引用された file:line が実在するか・引用テストが fresh 実行で本当に通るか**を確認する。判定者は証拠を幻覚し、攻撃可能(スコアを吊り上げる細工)である。**幻覚した引用に裏打ちされた PASS は、PASS が無いより悪い。**

---

## モデル系統の cascade 配置 (補足)

Hallucination Cascade の実測: 最適な cascade は**速いが誤りやすいモデルを上流(生成)に、最も幻覚の少ない修正志向のモデルを最終段(REVIEWER/QA)に**置く。3 段チェーンは幻覚を正味で減衰させる(増幅係数 0.644 < 1、補正 35.2% > 増幅 7.3%)——Conclave の独立検証トポロジーの実証的裏付け。

→ [ROLE_TOPOLOGY](../roles/ROLE_TOPOLOGY.md) のモデル割り当てに「cascade 位置」を選定基準として追加(bench 順位・厳格さ観測に加えて)。

---

## 適用チェックリスト

- [ ] REVIEWER/QA を生成元と別系統にバインドしたか (JR-1)
- [ ] 位置・冗長・権威バイアスへの対策をプロンプトに入れたか (JR-2)
- [ ] 基準分解 + CoT + 説明付き判定を要求したか (JR-3)
- [ ] 事実出力をクレーム分解で検証したか (JR-4)
- [ ] 過剰修正ガード(unverifiable ≠ false)を効かせたか (JR-5)
- [ ] 判定者の不一致を ARCHITECT へエスカレートしたか (JR-6)
- [ ] 委任された判定の引用を fresh 実行で確認したか (JR-7)
