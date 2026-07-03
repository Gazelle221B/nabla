# AGENTS.md — nabla(∇)

> このファイルは Claude Code / Codex CLI / Copilot CLI / Gemini CLI など **AGENTS.md 対応の全 AI ツールが自動読込する最上位の指示書**である。`CLAUDE.md` は本ファイルへのシンボリックリンク。
> **要旨と禁止事項に絞り 300 行以内に収める。** 詳細は各 `docs/` へポインタを置く。

## 1. プロジェクト概要

nabla(∇/ナブラ)は、日本の学習指導要領に沿って中学数学〜大学教養数学(微積分・線形代数・確率統計)を、動画ではなくブラウザ上のインタラクティブな図解で学べる独学者向け教材サイト。「予想して、動かして、発見する」を中核体験とし、GitHub Pages(静的ホスティング)で配信する。北極星指標は「操作前には説明できなかった数学的関係を、操作後に読者が自分の言葉で説明できるようになったか」。教育効果はMVP 1では被験者未確保のため未検証とし、「インタラクティブ教材の設計仮説を実装した公開ベータ」と明示する。

| 項目 | 値 |
|---|---|
| 配布名 / リポジトリ | ナブラ / nabla(∇)(仮称。正式公開前に商標検索を行う) |
| 主要言語 / ランタイム | TypeScript / Node.js(Astro) |
| パッケージ管理 | npm(Step 1で確定・固定) |
| 実行コマンド | `npm run dev` / `npm run build` / `npm run test` |

## 2. 現在のフェーズ(随時更新は `docs/PROJECT_STATE.md`)

- 要件定義・設計・実装計画は確定済み。実装は未着手(M0進行中)。
- 作業ブランチ: `agent/<task-id>-impl`(実装着手時から使用。現在は `main` 上でのドキュメント整備段階)。

## 3. 絶対 NG(禁止事項)— 最優先

> 全文・分類は [CONSTITUTION](docs/conclave/governance/CONSTITUTION.md) 相当。**いずれか抵触しそうなら実装を止めてエスカレーション** ([ESCALATION](docs/conclave/governance/ESCALATION.md))。

- **C-1 リポジトリ**: 保護ブランチ直push禁止 / mergeは人間専権 / hookスキップ禁止 / `.env` commit禁止。**MVP期間中は外部コードPRを原則受け付けない**(Issue提案は歓迎、`CONTRIBUTING.md`)。
- **C-2 データ**: frontmatterのcurriculumスキーマ(`type: mext` / `type: independent`)を勝手に変更しない。`prerequisites` が指す単元IDは実在すること(孤立ノード・リンク切れ禁止)。
- **C-3 耐障害性**: WebGPU初期化失敗・非対応時、Tier 3b(WebGPU)コンポーネントは無言でクラッシュさせず「対応ブラウザで開いてください」を表示する(fail-openではなくfail-with-message)。Tier 3a(Three.js/WebGL)は主要モダンブラウザ全てが対象のため該当しない。JS無効時も本文と数式は読める状態を保つ。
- **C-4 スコープ境界**: MVP 1(Tier 1・Mafs/SVGのみの3記事: 三平方の定理/微分係数と接線/2×2行列と固有ベクトル)のDoD充足まで、Tier 2(Pixi.js/WebGPU)・Tier 3a(Three.js)・Tier 3b(WebGPU)を導入しない。3D表現が必要になっても「安易に3D=WebGPU」と決め打ちせず、まずTier 3a(Three.js)で足りるかを検討する。ログイン・進捗保存・検索・CMS・多言語対応等の非対象機能を「ついでに」実装しない。12週間超過時は期間延長ではなく機能削減(削減順: 装飾アニメーション→実例1件のみの早すぎる汎用化→GA4カスタムイベント→付加的な説明図→記事数3本→2本。**サンドボックス・予想・数学テスト・アクセシビリティは削減対象外**)。
- **C-5 コンテンツ・法務**: 動画で図解を代替しない(プロジェクトの核であり覆せない)。数学的に誤った内容を公開しない(実装者とは別エージェントによる検証が完了するまで完了とみなさない)。Mathigon等の教材コンテンツ本文を再利用・転載しない(参考にするのは設計思想のみ)。教育効果を「検証済み」と表示しない。
- **C-6 スタック**: 確定スタック(Astro + MDX + React Islands + KaTeX + Mafs、レンダラー3階層 — `docs/DESIGN.md` §レンダリング戦略)をADRなしで覆さない。WebGPUの適用範囲(Tier 3b限定)を勝手に拡張しない。ライセンス構成(コード=GPL-3.0-or-later / 教材=CC BY-SA 4.0)を変更しない。
- **C-7 終了**: 全委任タスクに明示的終了条件+最大反復上限を持たせる。`lib/math` の不変条件テストは、自己確認的な検証(同じ式へ戻すだけ等)を合格条件として認めない。
- **C-8 過剰修正**: 確認できないという理由だけで先行エージェントの数学的説明・設計判断を削除・書換しない。数学的正しさに疑義があれば削除ではなくフラグして人間(制作者)へエスカレーションする。

## 4. 主要コマンド

```bash
# セットアップ(Step 1完了・Astro v7導入済み)
npm install
# 現時点で使えるコマンド
npm run dev           # http://localhost:4321/nabla/
npm run build          # ./dist/ へビルド(base: /nabla を反映)
npm run preview        # ビルド結果をローカルで確認
# 品質ゲート(Step 2〜5で順次追加。導入時にこのセクションを同期更新する)
npm run test           # 未導入。T2-1でVitest + fast-check(lib/math の不変条件テスト含む)を追加
npm run typecheck       # astro check(tsconfig strict)。0 errors確認済み
npm run lint            # eslint .(flat config, T5-1で導入)。0 errors確認済み
npm run test:e2e        # playwright test。既存ページのスモーク+axe(@axe-core/playwright)をCritical/Serious 0件で検証(T5-1)
npm test --if-present   # CIで使用。npm run test未導入の間はno-opでスキップされる
```

## 5. アーキテクチャ方針

`docs/DESIGN.md` が **単一の真実の源**。要旨:
- **数学モデルと描画の分離**: `lib/math/` はReact/Three.js/Pixi.jsを一切importしない純粋TypeScript。
- **レンダラー3階層**: Tier 1(Mafs/SVG既定・全記事ベースライン)→ Tier 2(高密度2D、計測後にPixi.jsまたはWebGPU)→ Tier 3a(標準3D、Three.js)/ Tier 3b(シェーダー品質・大量計算3D、WebGPU必須)。3DはまずThree.jsで足りるか検討し、密な計算・シェーダー品質が本質的に必要な場合のみWebGPUへ進む。MVP 1はTier 1のみ。
- **Island境界を細分化しない**: 状態を共有する一連の実験は単一のReact Island(`InteractiveExperiment`)、サンドボックスは別Island。
- 判断基準の知識ベース: 技術詳細・ADRは `docs/DESIGN.md`、プロジェクト全体の物語と合意経緯は `docs/PROJECT_PLAN.md`。

## 6. ディレクトリ構造

```text
src/
├─ content/lessons/{geometry,algebra,calculus,linear-algebra,probability,discrete-math}/
├─ components/{lesson,controls,scenes/{mafs,svg,pixi,three,webgpu}}/
├─ lib/{math,animation,accessibility}/   # lib/math は純粋 TypeScript(描画ライブラリ import 禁止)
└─ content.config.ts
docs/                                     # 本ガバナンス一式(Conclave)+ PROJECT_PLAN.md(経緯の物語)
```

## 7. マルチエージェント運用(最重要原則)

→ 組織契約・役割: `docs/conclave/roles/ROLE_TOPOLOGY.md`。**実装者・レビュアー・QA は必ず別エージェント**(PR作者≠レビュアー)。

| 役割スロット | 基盤+モデル | 責務 |
|---|---|---|
| `HUMAN` | 制作者本人 | 要件・スコープ定義・merge承認・数学的正しさの最終責任 |
| `ARCHITECT` | Claude Code(Opus) | 上流設計・計画・難所解決 |
| `IMPLEMENTER` | Claude Code(Sonnet)。日常の軽量実装は `Agent(subagent_type="qwen-coder")` へ委任可(コスト効率優先) | 実装主軸 |
| `REVIEWER` | `Agent(subagent_type="codex-agent")` | 独立レビュー・テスト生成・境界値/反例探索(実装に関与しない) |
| `QA_MEMORY` | `Agent(subagent_type="gemini-agent")` | 数学的説明・学習順序のレビュー、検索グラウンディングでの事実確認 |

**永続化 > 内部記憶**: 状態は必ず `docs/PROJECT_STATE.md` に書く。
**AIレビューの限界**: AIは誤った数学的説明を自ら生成しうる(要件定義の初稿で「単位行列・回転行列を特異行列と誤分類」した実例が既にある)。AIレビューは不変条件テスト等の機械的検証の**補助**であり代替ではない。最終責任は制作者にある。
**エスカレーション分類 A-E**: → [ESCALATION](docs/conclave/governance/ESCALATION.md)。

## 8. コミット規約とブランチ運用

- Conventional Commits: `<type>: <description>`(`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci`)
- `main`: 常に安定。直接push禁止。実装は `agent/<task-id>-impl`。**PRマージ後はブランチを使い回さず最新mainから切り直す。**
- mergeは**レビューPASS + QA PASS + 人間承認**の三条件後のみ。
- PR前チェック: テスト緑 / lintクリーン / 型クリーン / 数学モデルの不変条件テスト緑 / axe Critical・Serious 0件 / PROJECT_STATE最新化 / 絶対NG自己点検 / 秘密混入なし。

## 9. 品質ゲート(Definition of Done)

→ 全文: [EXECUTION_DISCIPLINE](docs/conclave/principles/EXECUTION_DISCIPLINE.md)。プロジェクト固有DoD(MVP 1)は `docs/DESIGN.md` と `docs/IMPLEMENTATION_PLAN.md` を参照: 学習目標1〜2個限定 / 操作前に予想要求 / 数学モデルの単体・不変条件テスト / axe Critical・Serious 0件 / Lighthouse Accessibility原則100 / コンソール未処理例外0 / サブパスで動作 / JS無効でも本文と数式は読める。

## 10. ドキュメント地図

| 種別 | パス | 役割 |
|---|---|---|
| 経緯・全体像 | docs/PROJECT_PLAN.md | 2本の企画会話ログの統合物語・合意経緯・対立点の解消記録 |
| 要件 | docs/REQUIREMENTS.md | 問題定義の起点 |
| 設計 | docs/DESIGN.md | **単一の真実の源** |
| 実装計画 | docs/IMPLEMENTATION_PLAN.md | タスク分解・マイルストーン |
| 運用書 | docs/conclave/runbook/ORCHESTRATION_RUNBOOK.md | ★ 自律オーケストレーション手順。交代したAIはまずここ |
| 引き継ぎ | docs/HANDOFF.md | 時点スナップショット |
| 状態 | docs/PROJECT_STATE.md | ★ 真の記憶 |
| 組織契約 | docs/conclave/roles/ROLE_TOPOLOGY.md | 役割スロット・委任の鉄則 |
| 憲法 | docs/conclave/governance/CONSTITUTION.md / ESCALATION.md | 絶対NG(C-1〜C-8)+ 失敗分類A-E |
| 原則 | docs/conclave/principles/*.md | 実行規律 / 工学不変条件 / 文脈衛生 / 失敗分類 / 判定信頼性 |
| ADR | docs/adr/INDEX.md, docs/adr/ADR-001.md | 設計判断記録(レンダリングTier境界・依存ライブラリ採用等) |
| 証跡 | docs/TEST_LOG.md / REVIEW_REPORT.md / QA_REPORT.md | 実装/レビュー/QA |
| 数値計算規約 | MATH_CONVENTIONS.md | epsilon・誤差比較・座標系・型表現・色の意味論 |
| AI運用規則 | DEVELOPMENT.md | 複数AIエージェントの担当分離・同時編集禁止・依存追加の審査 |
| コントリビューション方針 | CONTRIBUTING.md | MVP期間中の外部PR非受付・Issue歓迎 |
| ライセンス | LICENSE, LICENSE-CODE, LICENSE-CONTENT, LICENSES.md | GPL-3.0-or-later(コード)/ CC BY-SA 4.0(教材)のディレクトリ境界 |

## 11. AI エージェント向け運用ルール

1. **作業開始時に必ず読む**: 本書 → `docs/PROJECT_STATE.md` → `docs/conclave/runbook/ORCHESTRATION_RUNBOOK.md` → `docs/DESIGN.md` → 該当タスク。
2. **判断ログを残す**: 設計判断はADRへ。
3. **状態を必ず書く**: 進捗・人間判断待ちは `PROJECT_STATE.md` へ。
4. **疑ったら止める**: 絶対NG(§3)抵触で停止しエスカレーション。
5. **フェーズ越境禁止**: 現フェーズDoD充足まで次フェーズ機能を入れない。
6. **ドキュメントがSSOT**: チャット合意のみで実装を進めない。

## 12. コーディング原則(Karpathy 4原則)

→ 手続き化の全文: [EXECUTION_DISCIPLINE](docs/conclave/principles/EXECUTION_DISCIPLINE.md)。**§3絶対NGと矛盾する場合は§3を優先**。
Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution。

---

> 改訂方針: 重大な設計判断はADRを追加 → 本書§3/§5/§10を更新 → `PROJECT_STATE` の改訂履歴に同期。300行制限維持のため詳細は該当mdへポインタを置く。
