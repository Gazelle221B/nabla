# nabla(∇) / ナブラ

> 予想して、動かして、発見する。

日本の学習指導要領に沿って、中学数学から大学教養数学までを、動画ではなくブラウザ上のインタラクティブな図解で学べる独学者向け教材サイト(制作中・公開ベータ準備中)。

## ドキュメント

- [AGENTS.md](AGENTS.md) — プロジェクト概要・技術方針・AIエージェント運用ルール(最上位指示書)
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — 要件定義
- [docs/DESIGN.md](docs/DESIGN.md) — 設計(単一の真実の源)
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — 実装計画
- [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — 現在の進捗
- [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) — 企画経緯の統合記録

## 開発

```sh
npm install
npm run dev      # http://localhost:4321/nabla/
npm run build    # ./dist/ へビルド
npm run preview
```

## ライセンス

ソースコードは [GPL-3.0-or-later](LICENSE-CODE)、教材コンテンツ(MDX記事・図版)は [CC BY-SA 4.0](LICENSE-CONTENT) の下で公開されています。詳細は [LICENSES.md](LICENSES.md) を参照してください。

MVP期間中は外部コードPRを受け付けていません。詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
