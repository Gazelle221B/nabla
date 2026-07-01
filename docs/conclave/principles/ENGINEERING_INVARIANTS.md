# Pillar 5 — The Craft: 工学不変条件

> 抽出元のコードに結晶化していた、**ドメイン非依存で移植可能**な工学パターン。
> いずれも「AI が生成したコードが本番で壊れる典型」への対策であり、LLM を組み込む全プロジェクトに効く。

---

## INV-1. 単位 fail-open

**1 ソース / 1 タスク / 1 アイテムの失敗で、パイプライン全体を止めてはならない。**

- 失敗は記録し (健全性カウンタ +1、`last_error` 保存)、健全な部分は完走させる。
- 副系 (通知・配信) の失敗で主系 (収集・保存) を fail させない。ログ記録のみ。
- 成功で失敗カウンタをリセット、失敗で +1。

```python
# 悪い例: 1 件の例外で全体が落ちる
for src in sources:
    items = fetch(src)            # ← ここで raise すると残り全ソースが死ぬ
    save(items)

# 良い例: 単位 fail-open
for src in sources:
    try:
        items = fetch(src)
        save(items)
        health.reset(src)         # 成功で consecutive_failures=0
    except Exception as exc:
        health.record_failure(src, exc)   # +1 と last_error を残し、次のソースへ
        logger.warning("source failed, continuing: %s", exc)
```

検証可能形: 「1 ソースが例外を投げても他ソースが完走し、`consecutive_failures` が +1 されるテストを緑にする」。

---

## INV-2. 設定駆動 (behavior as config)

**振る舞いを YAML 等の設定に追い出し、コードを触らず差し替える。**

- ソース定義・モデル割り当て・人格・出力フォーマットを設定ファイル化。
- A/B/C 検証の役割マッピングも設定で切替え (どの profile を editor/writer に使うか)。
- 設定はスキーマ検証する (Pydantic 等)。ラベル重複禁止、参照先の実在を起動時に保証。

```yaml
# 例: モデル profile と A/B/C 役割マッピングを設定で切替
profiles:
  - { label: cheap-writer, provider: openai_compatible, api_key_env: WRITER_KEY, base_url: "...", model: "...", max_tokens: 1800, temperature: 0.3 }
  - { label: judge,        provider: openai_compatible, api_key_env: JUDGE_KEY,  base_url: "...", model: "...", max_tokens: 1800, temperature: 0.2 }
ab_test:
  A: { editor: judge, writer: cheap-writer }   # 推奨初期構成
  B: { editor: judge, writer: judge }
```

> **秘密管理の鉄則**: 設定には API キーの**値ではなく環境変数名** (`api_key_env`) を置く。実値は `.env` (git 管理外) から実行時に解決し、ログ・例外メッセージに出さない。

---

## INV-3. LLM プロバイダ抽象 (頑健なクライアント)

**OpenAI 互換を最大公約数とし、profile 単位で provider を切替える。**

3 つの頑健性パターン:

1. **リトライ** — 一過性の失敗 (接続断・5xx・429) を上限付きでリトライ。タイムアウト必須。
2. **多フィールド応答パース** — reasoning 系モデルは `content` が空で `reasoning_content` / `reasoning` に本文を吐くことがある。複数フィールドを順に試す。
3. **外部応答を信用しない** — `choices[0].message.content` が必ずあると仮定しない。型・存在を確認し、空なら明示エラー。

```python
# 多フィールド応答パース (reasoning モデル対策)
content = ""
for field in ("content", "reasoning_content", "reasoning"):
    content = str(message.get(field) or "")
    if content:
        break
if not content:
    raise LLMError(f"empty content (profile={profile.label})")
```

---

## INV-4. 責務の分離 (LLM vs 決定的コード)

**1 回の LLM 呼び出しに 2 つの異質な仕事をさせない。**

- **JSON 判定と散文生成を同時に書かせない。** 採点 (score/tone) は JSON だけ返させ (`response_format=json_object`, temp=0)、台本/文章生成は別呼び出しでプレーンテキスト。
- **決定性が要る所は決定的コードで。** 並べ替え (アーク配置)、トーン分類後の配列、裏取り数 (クロスソース一致) は LLM に並べさせず、コードで計算する。
- LLM 出力の JSON は**頑健に取り出す**: 素直に `json.loads` → 失敗したら ```` ```json ```` フェンスを剥がし最外の `{...}` を切り出して再試行。

```python
def extract_json_object(text: str) -> dict:
    try:
        loaded = json.loads(text)
        if isinstance(loaded, dict):
            return loaded
    except json.JSONDecodeError:
        pass
    stripped = text.replace("```json", "").replace("```", "")
    start, end = stripped.find("{"), stripped.rfind("}")
    if start == -1 or end <= start:
        raise JudgeError("no JSON object in LLM output")
    return json.loads(stripped[start : end + 1])
```

> なぜ分離するか: 採点に温度や散文が混ざると JSON が壊れ、配列順を LLM に任せると日替わりで揺れる。**揺れてはいけない所を LLM に渡さない**のが品質の土台。

---

## INV-5. fallback 無しで配信しない (最後の砦)

**LLM が出力を崩した日でも、成果物を必ず出す。**

二重防御:
1. 契約違反 (スキーマ/長さ/必須マーカー) なら、違反フィードバックを添えて**1 回だけ再生成**。
2. それも違反なら**テンプレートで生成** (LLM 不使用・常に契約適合)。
3. `LLMError` (呼び出し失敗) も違反と同様に扱い、パイプラインを止めない。

```python
for attempt in (1, 2):
    body = try_llm(attempt, prev_violations)   # 2 回目は違反を添えて再生成
    violations = validate(body)
    if not violations:
        return Result(body, method="llm" if attempt == 1 else "llm_retry")
return Result(template_generate(topic), method="template")  # 常に契約適合
```

- テンプレートは**複数パターンを乱択**し、毎日同じ枕詞になる単調さを避ける。
- 生成手段 (`llm` / `llm_retry` / `template`) を結果に記録し、品質メトリクス (修正回数・fallback 率) に使う。

> 「成果物を出すこと」を最優先する設計。fallback が無いと、LLM が崩れた 1 日だけプロダクトが消える。

---

## INV-6. 状態の外部永続化

**進捗・健全性・実行履歴を DB/ファイルに残し、冪等な再実行を可能にする。**

- 一意制約で重複を防ぐ (例: `UNIQUE(source_id, item_key)`)。同一入力の 2 回実行で行が増えない。
- 実行ごとのメタ (件数・コスト・所要時間) を記録し、観察・A/B 比較の基礎にする。
- **逆向き依存を禁止**: `collect → store ← deliver`。`deliver` は `store` の読み取りのみ。データの流れを一方向に保つ。

> このパターンは Pillar 3 (The Record) のコード版である。**真実はファイル/DB に住む**を、運用ドキュメントだけでなくアプリの状態管理にも適用する。

---

## INV-7. トークン効率・非重複のツール/委任インターフェース

**ツールと委任タスクのインターフェースは、トークン効率が良く、機能が重複せず、用途が一義であること。**

- 肥大した重複ツール群はエージェントを混乱させる。各ツールは自己完結・エラー耐性・トークン効率の良い出力・曖昧さのない用途を持つ。
- **曖昧さ判定テスト**: 人間のエンジニアが「この状況でどのツール/サブエージェントを使うか」を断言できないなら、AI にもできない。
- 重い作業の戻りは**蒸留要約**(生ダンプではなく)。これは [Context Hygiene](CONTEXT_HYGIENE.md) CH-4 のコード版であり、オーケストレーターの注意予算を守る。

```python
# 悪い例: 生の巨大 JSON をそのまま文脈へ返す (注意予算を食い潰す)
return {"raw_response": huge_api_payload, "all_items": [...5000 items...]}

# 良い例: 蒸留した要約 + 参照を返す
return {"summary": "5000 件中 12 件が条件一致", "detail_ref": "data/run_42.json", "top": top_12}
```

> 出典: Anthropic「Effective Context Engineering」。ENGINEERING_INVARIANTS は LLM 呼び出しの堅牢性 (INV-3/4/5) を扱うが、**ツール面・戻り値のサイズ/明瞭性**の不変条件が欠けていた。RUNBOOK §3 の蒸留戻り契約をコード層で支える。

---

## 適用チェックリスト

新しい LLM 連携モジュールを書くとき:

- [ ] 失敗は単位で閉じ込めたか (INV-1)
- [ ] 振る舞いは設定に追い出したか / 秘密は環境変数名で参照したか (INV-2)
- [ ] リトライ・タイムアウト・多フィールドパースを入れたか (INV-3)
- [ ] JSON 判定と散文生成を分けたか / 決定性の要る所をコードにしたか (INV-4)
- [ ] fallback の最後の砦があるか (INV-5)
- [ ] 冪等性・一意制約・一方向依存を守ったか (INV-6)
- [ ] ツール/戻り値はトークン効率・非重複・一義か (INV-7)
